import { randomInt } from 'node:crypto';
import {
  SERVER_TICK_RATE,
  BALANCE,
  ErrorCode,
  NetEvent,
  ROOM_CODE_ALPHABET,
  type GameMode,
  type MatchResults,
  type NetError,
  type ReplayData,
  type RoomSettingsPatch,
} from '@hh/shared';
import type { Logger } from '../logger.js';
import { createRoomPhysics } from '../game/physics.js';
import { DEFAULT_ROOM_SETTINGS, Room, type ActionResult, type RoomOutput, type RoomPlayer } from '../game/Room.js';
import type { GameIO } from '../networking/types.js';
import type { ProgressionService } from '../progression/ProgressionService.js';

export interface RoomMember {
  id: string;
  accountId: string;
  nickname: string;
  skin: string;
  effect: string;
  level: number;
  rating: number;
  reputation: number;
  socketId: string;
}

const fail = (code: NetError['code'], message: string) => ({ ok: false as const, error: { code, message } });

export interface RoomManagerOptions {
  io: GameIO;
  progression: ProgressionService;
  logger: Logger;
  /** Permite a mesma conta duas vezes na sala (útil para testar com abas). */
  allowDuplicateAccounts: boolean;
  publicMinPlayers?: number;
}

/** Movimentos recusados em uma partida que geram denúncia automática. */
const SUSPICIOUS_REJECTED_MOVES = 40;

/**
 * Gerencia todas as salas: matchmaking por modo, salas privadas com código,
 * ligação jogador → sala, reconexão, replays e o laço de 15 Hz.
 */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly playerRoom = new Map<string, string>();
  private readonly sockets = new Map<string, string>();
  private readonly replays = new Map<string, ReplayData>();
  private readonly output: RoomOutput;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: RoomManagerOptions) {
    const { io, logger } = options;
    const toPlayer = (playerId: string) => this.sockets.get(playerId);
    this.output = {
      state: (room) => {
        io.to(channel(room.code)).emit(NetEvent.RoomState, room.info());
        this.broadcastVoicePeers(room.code);
      },
      snapshot: (_room, playerId, snapshot) => {
        const socketId = toPlayer(playerId);
        if (socketId) io.to(socketId).emit(NetEvent.Snapshot, snapshot);
      },
      feed: (room, event) => io.to(channel(room.code)).emit(NetEvent.Feed, event),
      teleport: (_room, playerId, message) => {
        const socketId = toPlayer(playerId);
        if (socketId) io.to(socketId).emit(NetEvent.Teleport, message);
      },
      effect: (room, effect, playerIds) => {
        if (!playerIds) {
          io.to(channel(room.code)).emit(NetEvent.Effect, effect);
          return;
        }
        for (const id of playerIds) {
          const socketId = toPlayer(id);
          if (socketId) io.to(socketId).emit(NetEvent.Effect, effect);
        }
      },
      abilities: (_room, playerId, abilities) => {
        const socketId = toPlayer(playerId);
        if (socketId) io.to(socketId).emit(NetEvent.Abilities, abilities);
      },
      abandon: (room, player) => {
        logger.info({ room: room.code, playerId: player.id }, 'Abandono de partida registrado');
        void options.progression.recordAbandon(player.accountId).catch((err: unknown) => logger.error({ err }, 'Falha ao registrar abandono'));
      },
      results: (room, results, players, replay) => {
        io.to(channel(room.code)).emit(NetEvent.Results, results);
        this.storeReplay(replay);
        void this.persistResults(room, results, players).catch((err: unknown) =>
          logger.error({ err }, 'Falha ao salvar resultados da partida'),
        );
        logger.info({ room: room.code, mode: results.mode, winner: results.winner, players: results.players.length }, 'Partida encerrada');
      },
    };
  }

  start(): void {
    this.timer ??= setInterval(() => this.tick(), 1000 / SERVER_TICK_RATE);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const room of this.rooms.values()) room.physics.world.free();
    this.rooms.clear();
  }

  tick(): void {
    for (const room of this.rooms.values()) {
      room.tick();
      room.broadcastSnapshot();
      if (room.isEmpty) this.deleteRoom(room);
    }
    for (const [playerId, code] of this.playerRoom) {
      if (!this.rooms.get(code)?.players.has(playerId)) {
        this.playerRoom.delete(playerId);
        this.lastVoicePeers.delete(playerId);
        this.sockets.delete(playerId);
      }
    }
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  getReplay(matchId: string): ReplayData | undefined {
    return this.replays.get(matchId);
  }

  quickJoin(member: RoomMember, mode: Exclude<GameMode, 'custom'> = 'classic'): ActionResult<{ room: Room }> {
    const already = this.ensureNotInRoom(member.id);
    if (already) return already;
    const candidates = [...this.rooms.values()]
      .filter((r) => !r.isPrivate && r.mode === mode && !r.isFull && this.canAccountJoin(r, member.accountId))
      .sort((a, b) => score(b) - score(a));
    const room = candidates[0] ?? this.createRoom(false, { ...DEFAULT_ROOM_SETTINGS, mode, randomEvents: mode !== 'competitive' });
    return this.join(room, member);
  }

  createPrivate(member: RoomMember, patch: RoomSettingsPatch): ActionResult<{ room: Room }> {
    const already = this.ensureNotInRoom(member.id);
    if (already) return already;
    const settings = { ...DEFAULT_ROOM_SETTINGS, ...patch };
    if (settings.hunters !== null && settings.hunters >= settings.maxPlayers) {
      return fail(ErrorCode.InvalidAction, 'Precisa sobrar pelo menos um escondido.');
    }
    const room = this.createRoom(true, settings);
    return this.join(room, member);
  }

  joinByCode(member: RoomMember, code: string): ActionResult<{ room: Room }> {
    const already = this.ensureNotInRoom(member.id);
    if (already) return already;
    const room = this.rooms.get(code);
    if (!room) return fail(ErrorCode.RoomNotFound, 'Nenhuma sala com este código.');
    if (room.isFull) return fail(ErrorCode.RoomFull, 'A sala está cheia.');
    if (!this.canAccountJoin(room, member.accountId)) {
      return fail(ErrorCode.AlreadyInRoom, 'Sua conta já está nesta sala.');
    }
    return this.join(room, member);
  }

  leave(playerId: string): void {
    const room = this.roomOf(playerId);
    const socketId = this.sockets.get(playerId);
    if (socketId && room) this.options.io.in(socketId).socketsLeave(channel(room.code));
    this.playerRoom.delete(playerId);
    this.lastVoicePeers.delete(playerId);
    this.sockets.delete(playerId);
    if (room) {
      room.removePlayer(playerId, true);
      if (room.isEmpty) this.deleteRoom(room);
    }
  }

  /** Remove um jogador à força (ferramenta de administração). */
  kick(playerId: string): boolean {
    const socketId = this.sockets.get(playerId);
    if (!this.playerRoom.has(playerId)) return false;
    this.leave(playerId);
    if (socketId) this.options.io.to(socketId).emit(NetEvent.RoomState, null);
    return true;
  }

  /** A conexão caiu: o jogador fica reservado na sala por alguns segundos. */
  disconnected(playerId: string): void {
    this.sockets.delete(playerId);
    this.roomOf(playerId)?.setConnected(playerId, false);
  }

  /** A mesma sessão voltou: devolve o jogador à sala em que estava. */
  reconnected(playerId: string, socketId: string): Room | undefined {
    const room = this.roomOf(playerId);
    if (!room) return undefined;
    this.sockets.set(playerId, socketId);
    void this.options.io.in(socketId).socketsJoin(channel(room.code));
    room.setConnected(playerId, true);
    return room;
  }

  socketOf(playerId: string): string | undefined {
    return this.sockets.get(playerId);
  }

  /**
   * Grupo de voz de um jogador: durante a partida, quem foi capturado (ou só
   * assiste) fala apenas com outros espectadores, para não entregar esconderijos.
   * Fora da partida (lobby, resultados), todos da sala estão no mesmo grupo.
   */
  voiceGroup(room: Room, playerId: string): 'all' | 'match' | 'spectators' {
    const player = room.players.get(playerId);
    if (!player || !room.inMatch) return 'all';
    return player.team && player.alive ? 'match' : 'spectators';
  }

  /** Avisa cada jogador com voz ligada quais colegas da sala ele pode ouvir. */
  broadcastVoicePeers(roomCode: string, force = false): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const io = this.options.io;
    const voiceOn = [...room.players.keys()].filter((id) => {
      const sid = this.sockets.get(id);
      return sid ? Boolean(io.sockets.sockets.get(sid)?.data.voice) : false;
    });
    for (const id of room.players.keys()) {
      const sid = this.sockets.get(id);
      if (!sid) continue;
      const group = this.voiceGroup(room, id);
      const peers = voiceOn.filter((other) => this.voiceGroup(room, other) === group);
      // Só reenvia quando a lista muda (o estado da sala muda com frequência).
      const key = peers.join(',');
      if (!force && this.lastVoicePeers.get(id) === key) continue;
      this.lastVoicePeers.set(id, key);
      io.to(sid).emit(NetEvent.VoicePeers, peers);
    }
  }

  private readonly lastVoicePeers = new Map<string, string>();

  get playerCount(): number {
    return this.playerRoom.size;
  }

  private join(room: Room, member: RoomMember): ActionResult<{ room: Room }> {
    this.playerRoom.set(member.id, room.code);
    this.sockets.set(member.id, member.socketId);
    void this.options.io.in(member.socketId).socketsJoin(channel(room.code));
    room.addPlayer(member);
    room.tick();
    this.options.logger.info({ room: room.code, playerId: member.id, private: room.isPrivate, mode: room.mode }, 'Jogador entrou na sala');
    return { ok: true, room };
  }

  private ensureNotInRoom(playerId: string) {
    if (this.playerRoom.has(playerId)) return fail(ErrorCode.AlreadyInRoom, 'Saia da sala atual antes de entrar em outra.');
    return null;
  }

  private canAccountJoin(room: Room, accountId: string): boolean {
    return this.options.allowDuplicateAccounts || !room.hasAccount(accountId);
  }

  private createRoom(isPrivate: boolean, settings: typeof DEFAULT_ROOM_SETTINGS): Room {
    const room = new Room({
      code: this.newCode(),
      isPrivate,
      settings,
      output: this.output,
      createPhysics: createRoomPhysics,
      publicMinPlayers: this.options.publicMinPlayers ?? BALANCE.rooms.publicMinPlayers,
    });
    this.rooms.set(room.code, room);
    this.options.logger.info({ room: room.code, private: isPrivate, mode: settings.mode }, 'Sala criada');
    return room;
  }

  private deleteRoom(room: Room): void {
    this.rooms.delete(room.code);
    room.physics.world.free();
    this.options.logger.info({ room: room.code }, 'Sala encerrada');
  }

  private storeReplay(replay: ReplayData): void {
    this.replays.set(replay.matchId, replay);
    while (this.replays.size > 30) this.replays.delete(this.replays.keys().next().value!);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < BALANCE.rooms.codeLength; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private async persistResults(room: Room, results: MatchResults, players: RoomPlayer[]): Promise<void> {
    const seen = new Set<string>();
    const entries = [];
    for (const result of results.players) {
      const player = players.find((p) => p.id === result.id);
      if (!player || seen.has(player.accountId)) continue;
      seen.add(player.accountId);
      entries.push({ accountId: player.accountId, result, won: result.team === results.winner, nickname: player.nickname, rejectedMoves: player.rejectedMoves });
      // Detecção de comportamento suspeito: muitos movimentos impossíveis.
      if (player.rejectedMoves >= SUSPICIOUS_REJECTED_MOVES) {
        await this.options.progression.report(
          '00000000-0000-4000-8000-000000000000',
          player.accountId,
          'cheating',
          `Automático: ${player.rejectedMoves} movimentos recusados na sala ${room.code}.`,
        );
      }
    }
    const rewards = await this.options.progression.recordMatch({
      matchId: results.matchId,
      mapId: results.mapId,
      mode: results.mode,
      winner: results.winner,
      reason: results.reason,
      durationSeconds: results.durationSeconds,
      players: entries,
    });
    // Avisa cada jogador das conquistas e missões concluídas.
    for (const player of players) {
      const reward = rewards.get(player.accountId);
      const socketId = this.sockets.get(player.id);
      if (!reward || !socketId) continue;
      for (const a of reward.achievements) {
        this.options.io.to(socketId).emit(NetEvent.Effect, { kind: 'achievement', id: a.id, name: a.name });
      }
      for (const m of reward.missionsCompleted) {
        this.options.io.to(socketId).emit(NetEvent.Effect, { kind: 'mission', description: m });
      }
    }
  }
}

function channel(code: string): string {
  return `room:${code}`;
}

/** Prioriza salas esperando jogadores e com mais gente (partidas começam antes). */
function score(room: Room): number {
  const waiting = room.state === 'WAITING' || room.state === 'COUNTDOWN' || room.state === 'FINISHED' ? 100 : 0;
  return waiting + room.connectedCount;
}
