import { createHash } from 'node:crypto';
import {
  abilityPayloadSchema,
  capturePayloadSchema,
  claimSeasonPayloadSchema,
  createRoomPayloadSchema,
  credentialsPayloadSchema,
  effectPayloadSchema,
  emotePayloadSchema,
  emptyPayloadSchema,
  ErrorCode,
  friendRequestPayloadSchema,
  friendRespondPayloadSchema,
  friendTargetPayloadSchema,
  GAME_NAME,
  GAME_VERSION,
  helloPayloadSchema,
  interactPayloadSchema,
  joinRoomPayloadSchema,
  movePayloadSchema,
  NetEvent,
  pingMarkerPayloadSchema,
  pingPayloadSchema,
  PROTOCOL_VERSION,
  quickJoinPayloadSchema,
  rankingPayloadSchema,
  replayPayloadSchema,
  reportPayloadSchema,
  SERVER_TICK_RATE,
  shovePayloadSchema,
  skinPayloadSchema,
  transformPayloadSchema,
  updateSettingsPayloadSchema,
  voiceSignalPayloadSchema,
  voiceStatePayloadSchema,
  voteMapPayloadSchema,
  type NetError,
} from '@hh/shared';
import type { z } from 'zod';
import type { Logger } from '../logger.js';
import { PlayerRegistry, toPublicPlayer } from '../players/PlayerRegistry.js';
import type { PresenceLookup, ProgressionService } from '../progression/ProgressionService.js';
import type { RoomManager, RoomMember } from '../rooms/RoomManager.js';
import { SocketRateLimiter } from '../security/rateLimiter.js';
import { HELLO_TIMEOUT_MS, KNOWN_CLIENT_EVENTS, MAX_VIOLATIONS, RATE_LIMIT_RULES } from './policy.js';
import type { GameIO, GameSocket } from './types.js';

export interface ConnectionContext {
  io: GameIO;
  players: PlayerRegistry;
  rooms: RoomManager;
  progression: ProgressionService;
  logger: Logger;
  maxConnections: number;
  presence: PresenceLookup;
  /** Chamado quando o número de jogadores muda. */
  onPlayersChanged: () => void;
}

type Ack = (response: unknown) => void;

function error(code: NetError['code'], message: string) {
  return { ok: false as const, error: { code, message } };
}

const NOT_IN_ROOM = error(ErrorCode.NotInRoom, 'Você não está em uma sala.');

/**
 * Configura uma nova conexão: limites, identificação e todos os eventos.
 * Toda mensagem do cliente é tratada como não confiável.
 */
export function handleConnection(socket: GameSocket, ctx: ConnectionContext): void {
  const log = ctx.logger.child({ socketId: socket.id });

  if (ctx.io.engine.clientsCount > ctx.maxConnections) {
    log.warn('Conexão recusada: servidor cheio');
    socket.emit(NetEvent.Error, { code: ErrorCode.ServerFull, message: 'Servidor cheio. Tente novamente em instantes.' });
    socket.disconnect(true);
    return;
  }

  socket.data.playerId = undefined;
  socket.data.accountId = undefined;
  socket.data.violations = 0;
  socket.data.voice = false;
  socket.data.rateLimiter = new SocketRateLimiter(RATE_LIMIT_RULES);

  log.debug({ address: socket.handshake.address }, 'Nova conexão');

  const helloTimer = setTimeout(() => {
    if (!socket.data.playerId) {
      log.info('Conexão encerrada: cliente não se identificou a tempo');
      socket.disconnect(true);
    }
  }, HELLO_TIMEOUT_MS);

  const registerViolation = (reason: string) => {
    socket.data.violations += 1;
    log.warn({ reason, violations: socket.data.violations }, 'Mensagem rejeitada');
    if (socket.data.violations >= MAX_VIOLATIONS) {
      log.warn('Conexão encerrada: excesso de mensagens inválidas');
      socket.disconnect(true);
    }
  };

  /**
   * Registra um evento com validação Zod, limite de frequência e tratamento
   * de erros. O handler só recebe dados já validados.
   */
  const on = <S extends z.ZodType>(
    event: string,
    schema: S,
    options: { requiresIdentity: boolean },
    handler: (payload: z.output<S>, reply: Ack) => void | Promise<void>,
  ) => {
    (socket as unknown as { on: (e: string, fn: (...args: unknown[]) => void) => void }).on(
      event,
      (payload: unknown, maybeAck: unknown) => {
        const reply: Ack = typeof maybeAck === 'function' ? (maybeAck as Ack) : () => {};
        if (!socket.data.rateLimiter.allow(event)) {
          registerViolation(`rate limit: ${event}`);
          reply(error(ErrorCode.RateLimited, 'Muitas mensagens em pouco tempo.'));
          return;
        }
        if (options.requiresIdentity && !socket.data.playerId) {
          registerViolation(`não identificado: ${event}`);
          reply(error(ErrorCode.NotIdentified, 'Identifique-se antes de enviar esta mensagem.'));
          return;
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          registerViolation(`payload inválido: ${event}`);
          reply(error(ErrorCode.InvalidPayload, parsed.error.issues[0]?.message ?? 'Dados inválidos.'));
          return;
        }
        const fail = (err: unknown) => {
          log.error({ err, event }, 'Erro ao processar evento');
          reply(error(ErrorCode.Internal, 'Erro interno do servidor.'));
        };
        try {
          const result = handler(parsed.data, reply);
          if (result instanceof Promise) result.catch(fail);
        } catch (err) {
          fail(err);
        }
      },
    );
  };

  const identified = { requiresIdentity: true };
  const playerId = () => socket.data.playerId!;
  const accountId = () => socket.data.accountId!;
  const member = (): RoomMember => ({
    id: playerId(),
    accountId: accountId(),
    nickname: socket.data.nickname,
    skin: socket.data.skin,
    effect: socket.data.effect,
    level: socket.data.level,
    rating: socket.data.rating,
    reputation: socket.data.reputation,
    socketId: socket.id,
  });
  const currentRoom = () => ctx.rooms.roomOf(playerId());
  /** Envia um evento para todas as abas conectadas de uma conta. */
  const toAccount = (targetAccountId: string, send: (socketId: string) => void) => {
    for (const p of ctx.players.byAccount(targetAccountId)) if (p.socketId) send(p.socketId);
  };
  const broadcastVoicePeers = (roomCode: string) => ctx.rooms.broadcastVoicePeers(roomCode, true);

  socket.onAny((event: string) => {
    if (!KNOWN_CLIENT_EVENTS.has(event)) registerViolation(`evento desconhecido: ${String(event).slice(0, 40)}`);
  });

  // ---------- sessão e conta ----------

  let identifying = false;
  on(NetEvent.Hello, helloPayloadSchema, { requiresIdentity: false }, async (payload, reply) => {
    if (identifying) return reply(error(ErrorCode.AlreadyIdentified, 'Identificação em andamento.'));
    if (payload.protocolVersion !== PROTOCOL_VERSION) {
      return reply(
        error(
          ErrorCode.ProtocolMismatch,
          `Versão do jogo incompatível (cliente ${payload.protocolVersion}, servidor ${PROTOCOL_VERSION}). Atualize a página.`,
        ),
      );
    }
    if (socket.data.playerId) return reply(error(ErrorCode.AlreadyIdentified, 'Esta conexão já está identificada.'));

    // O token fica só no navegador; o servidor guarda apenas o hash.
    const tokenHash = createHash('sha256').update(payload.accountToken).digest('hex');
    identifying = true;
    const account = await ctx.progression.findOrCreate(tokenHash, payload.nickname).finally(() => {
      identifying = false;
    });
    if (!socket.connected) return;
    if (account.banned) {
      reply(error(ErrorCode.Banned, 'Esta conta foi suspensa por violar as regras.'));
      socket.disconnect(true);
      return;
    }

    const { player, replacedSocketId } = ctx.players.register(payload.sessionId, socket.id, payload.nickname, account.id);
    Object.assign(socket.data, {
      playerId: player.id,
      accountId: account.id,
      nickname: player.nickname,
      skin: account.equippedSkin,
      effect: account.equippedEffect,
      level: account.level,
      rating: account.rating,
      reputation: account.reputation,
    });
    clearTimeout(helloTimer);

    if (replacedSocketId) {
      const old = ctx.io.sockets.sockets.get(replacedSocketId);
      if (old) {
        old.data.playerId = undefined;
        old.emit(NetEvent.Error, { code: ErrorCode.SessionReplaced, message: 'Sua sessão foi aberta em outra conexão.' });
        old.disconnect(true);
      }
    }

    const room = ctx.rooms.reconnected(player.id, socket.id);
    log.info({ playerId: player.id, nickname: player.nickname, resumedRoom: room?.code }, 'Jogador identificado');
    reply({
      ok: true,
      player: toPublicPlayer(player),
      server: { name: GAME_NAME, version: GAME_VERSION, protocolVersion: PROTOCOL_VERSION, tickRate: SERVER_TICK_RATE, serverTime: Date.now() },
      profile: await ctx.progression.getProfile(account.id),
    });
    if (room) socket.emit(NetEvent.RoomState, room.info());
    ctx.onPlayersChanged();
  });

  on(NetEvent.Ping, pingPayloadSchema, identified, (payload, reply) => {
    reply({ ok: true, clientTime: payload.clientTime, serverTime: Date.now() });
  });

  on(NetEvent.Register, credentialsPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.register(accountId(), payload.username, payload.password);
    if (!result.ok) return reply(result);
    // O token atual continua válido; a resposta repete o perfil atualizado.
    reply({ ok: true, accountToken: '', profile: await ctx.progression.getProfile(accountId()) });
  });

  on(NetEvent.Login, credentialsPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.login(payload.username, payload.password);
    if (!result.ok) return reply(result);
    reply({ ok: true, accountToken: result.accountToken, profile: await ctx.progression.getProfile(result.accountId) });
  });

  // ---------- salas ----------

  const replyRoom = (result: ReturnType<RoomManager['quickJoin']>, reply: Ack) => {
    reply(result.ok ? { ok: true, room: result.room.info() } : result);
  };

  on(NetEvent.QuickJoin, quickJoinPayloadSchema, identified, async (payload, reply) => {
    const penalty = await ctx.progression.penaltySeconds(accountId());
    if (penalty > 0) {
      return reply(error(ErrorCode.Penalized, `Você abandonou partidas recentemente. Aguarde ${Math.ceil(penalty / 60)} min para jogar em salas públicas.`));
    }
    replyRoom(ctx.rooms.quickJoin(member(), payload?.mode ?? 'classic'), reply);
  });

  on(NetEvent.CreateRoom, createRoomPayloadSchema, identified, (payload, reply) => {
    replyRoom(ctx.rooms.createPrivate(member(), payload.settings), reply);
  });

  on(NetEvent.JoinRoom, joinRoomPayloadSchema, identified, (payload, reply) => {
    replyRoom(ctx.rooms.joinByCode(member(), payload.code), reply);
  });

  on(NetEvent.LeaveRoom, emptyPayloadSchema, identified, (_payload, reply) => {
    const room = currentRoom();
    ctx.rooms.leave(playerId());
    socket.emit(NetEvent.RoomState, null);
    if (room) broadcastVoicePeers(room.code);
    reply({ ok: true });
  });

  on(NetEvent.UpdateSettings, updateSettingsPayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    if (!room) return reply(NOT_IN_ROOM);
    const result = room.updateSettings(playerId(), payload.settings);
    reply(result.ok ? { ok: true, room: room.info() } : result);
  });

  on(NetEvent.StartMatch, emptyPayloadSchema, identified, (_payload, reply) => {
    const room = currentRoom();
    reply(room ? room.start(playerId()) : NOT_IN_ROOM);
  });

  on(NetEvent.VoteMap, voteMapPayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    reply(room ? room.vote(playerId(), payload.mapId) : NOT_IN_ROOM);
  });

  // ---------- partida ----------

  on(NetEvent.Move, movePayloadSchema, identified, (payload) => {
    currentRoom()?.handleMove(playerId(), payload);
  });

  on(NetEvent.Transform, transformPayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    reply(room ? room.transform(playerId(), payload.propId) : NOT_IN_ROOM);
  });

  on(NetEvent.Capture, capturePayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    reply(room ? room.capture(playerId(), payload.targetId, payload.cloneId) : NOT_IN_ROOM);
  });

  on(NetEvent.Ability, abilityPayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    if (!room) return reply(NOT_IN_ROOM);
    const extra: { target?: [number, number, number]; propId?: string; playerId?: string } = {};
    if (payload.target) extra.target = payload.target;
    if (payload.propId) extra.propId = payload.propId;
    if (payload.playerId) extra.playerId = payload.playerId;
    reply(room.useAbility(playerId(), payload.ability, extra));
  });

  on(NetEvent.Interact, interactPayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    reply(room ? room.interact(playerId(), payload.id) : NOT_IN_ROOM);
  });

  on(NetEvent.Shove, shovePayloadSchema, identified, (payload, reply) => {
    const room = currentRoom();
    const target: { propId?: string; playerId?: string } = {};
    if (payload.propId) target.propId = payload.propId;
    if (payload.playerId) target.playerId = payload.playerId;
    reply(room ? room.shove(playerId(), target) : NOT_IN_ROOM);
  });

  on(NetEvent.Emote, emotePayloadSchema, identified, async (payload, reply) => {
    const room = currentRoom();
    if (!room) return reply(NOT_IN_ROOM);
    if (!(await ctx.progression.canUseEmote(accountId(), payload.emote))) {
      return reply(error(ErrorCode.InvalidAction, 'Desbloqueie este emote no passe de temporada.'));
    }
    reply(room.emote(playerId(), payload.emote));
  });

  on(NetEvent.Ping2, pingMarkerPayloadSchema, identified, (payload) => {
    currentRoom()?.ping(playerId(), payload.position);
  });

  on(NetEvent.Report, reportPayloadSchema, identified, async (payload, reply) => {
    const room = currentRoom();
    const target = room?.players.get(payload.playerId);
    if (!target) return reply(error(ErrorCode.InvalidAction, 'Só é possível denunciar jogadores da sua sala.'));
    reply(await ctx.progression.report(accountId(), target.accountId, payload.reason, payload.details ?? ''));
  });

  on(NetEvent.GetReplay, replayPayloadSchema, identified, (payload, reply) => {
    const matchId = payload.matchId ?? currentRoom()?.matchId ?? undefined;
    const replay = matchId ? ctx.rooms.getReplay(matchId) : undefined;
    reply(replay ? { ok: true, replay } : error(ErrorCode.InvalidAction, 'Replay indisponível (o servidor guarda as 30 últimas partidas).'));
  });

  // ---------- voz por proximidade (só sinalização; o áudio vai direto entre navegadores) ----------

  on(NetEvent.VoiceState, voiceStatePayloadSchema, identified, (payload) => {
    socket.data.voice = payload.enabled;
    const room = currentRoom();
    if (room) broadcastVoicePeers(room.code);
  });

  on(NetEvent.VoiceSignal, voiceSignalPayloadSchema, identified, (payload) => {
    const room = currentRoom();
    if (!room || !socket.data.voice || !room.players.has(payload.to)) return;
    // Só entre jogadores do mesmo grupo de voz (espectadores não falam com quem joga).
    if (ctx.rooms.voiceGroup(room, playerId()) !== ctx.rooms.voiceGroup(room, payload.to)) return;
    const target = ctx.rooms.socketOf(payload.to);
    if (!target || !ctx.io.sockets.sockets.get(target)?.data.voice) return;
    ctx.io.to(target).emit(NetEvent.VoiceSignal, { from: playerId(), data: payload.data });
  });

  // ---------- perfil, progressão, loja ----------

  on(NetEvent.GetProfile, emptyPayloadSchema, identified, async (_payload, reply) => {
    reply({ ok: true, profile: await ctx.progression.getProfile(accountId()) });
  });

  on(NetEvent.ViewProfile, friendTargetPayloadSchema, identified, async (payload, reply) => {
    const profile = await ctx.progression.publicProfile(payload.accountId);
    reply(profile ? { ok: true, profile } : error(ErrorCode.InvalidAction, 'Perfil não encontrado.'));
  });

  on(NetEvent.GetRanking, rankingPayloadSchema, identified, async (payload, reply) => {
    const entries = await ctx.progression.ranking(payload.category, payload.scope ?? 'global', payload.mode, 20, accountId());
    reply({ ok: true, entries, persistent: ctx.progression.persistent });
  });

  on(NetEvent.GetProgress, emptyPayloadSchema, identified, async (_payload, reply) => {
    reply({ ok: true, progress: await ctx.progression.getProgress(accountId()) });
  });

  on(NetEvent.ClaimSeason, claimSeasonPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.claimSeasonReward(accountId(), payload.level);
    if (!result.ok) return reply(result);
    reply({ ok: true, progress: await ctx.progression.getProgress(accountId()) });
  });

  on(NetEvent.BuySkin, skinPayloadSchema, identified, async (payload, reply) => {
    reply(await ctx.progression.buySkin(accountId(), payload.skinId));
  });

  on(NetEvent.EquipSkin, skinPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.equipSkin(accountId(), payload.skinId);
    if (result.ok) socket.data.skin = payload.skinId;
    reply(result);
  });

  on(NetEvent.EquipEffect, effectPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.equipEffect(accountId(), payload.effectId);
    if (result.ok) socket.data.effect = payload.effectId;
    reply(result);
  });

  // ---------- amigos ----------

  on(NetEvent.GetSocial, emptyPayloadSchema, identified, async (_payload, reply) => {
    reply({ ok: true, social: await ctx.progression.social(accountId(), ctx.presence) });
  });

  on(NetEvent.FriendRequest, friendRequestPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.requestFriend(accountId(), payload.code);
    if (!result.ok) return reply(result);
    toAccount(result.targetId, (sid) => ctx.io.to(sid).emit(NetEvent.SocialChanged));
    reply({ ok: true });
  });

  on(NetEvent.FriendRespond, friendRespondPayloadSchema, identified, async (payload, reply) => {
    const result = await ctx.progression.respondFriend(accountId(), payload.requestId, payload.accept);
    if (!result.ok) return reply(result);
    toAccount(result.otherId, (sid) => ctx.io.to(sid).emit(NetEvent.SocialChanged));
    reply({ ok: true });
  });

  on(NetEvent.FriendRemove, friendTargetPayloadSchema, identified, async (payload, reply) => {
    reply(await ctx.progression.removeFriend(accountId(), payload.accountId));
    toAccount(payload.accountId, (sid) => ctx.io.to(sid).emit(NetEvent.SocialChanged));
  });

  on(NetEvent.Invite, friendTargetPayloadSchema, identified, async (payload, reply) => {
    const room = currentRoom();
    if (!room) return reply(error(ErrorCode.NotInRoom, 'Entre em uma sala para convidar.'));
    if (!(await ctx.progression.areFriends(accountId(), payload.accountId))) {
      return reply(error(ErrorCode.InvalidAction, 'Só é possível convidar amigos.'));
    }
    let delivered = false;
    toAccount(payload.accountId, (sid) => {
      delivered = true;
      ctx.io.to(sid).emit(NetEvent.InviteReceived, { fromNickname: socket.data.nickname, code: room.code });
    });
    reply(delivered ? { ok: true } : error(ErrorCode.InvalidAction, 'Seu amigo está offline.'));
  });

  socket.on('disconnect', (reason) => {
    clearTimeout(helloTimer);
    const room = socket.data.playerId ? currentRoom() : undefined;
    const player = ctx.players.disconnect(socket.id);
    if (player && player.socketId === undefined) {
      ctx.rooms.disconnected(player.id);
      log.info({ playerId: player.id, reason }, 'Jogador desconectado');
      ctx.onPlayersChanged();
      if (room && socket.data.voice) {
        socket.data.voice = false;
        broadcastVoicePeers(room.code);
      }
    }
  });
}
