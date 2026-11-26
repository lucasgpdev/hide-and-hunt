import { randomUUID } from 'node:crypto';
import {
  ABILITIES,
  abilitiesFor,
  BALANCE,
  characterShapeInfo,
  computeTeamDistribution,
  DEFAULT_MATCH_TIMINGS,
  ErrorCode,
  EVENT_INFO,
  EVENT_INTERVAL,
  getMap,
  getPropType,
  LIGHTING_PRESETS,
  LOBBY_MAP_ID,
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  MODE_INFO,
  MoveFlag,
  PLAYABLE_MAP_IDS,
  RANDOM_EVENTS,
  WEATHER_TYPES,
  type AbilityId,
  type AbilityState,
  type AbilityStates,
  type Ambience,
  type CloneInfo,
  type FeedEvent,
  type GameMode,
  type MatchResults,
  type MatchState,
  type MovePayload,
  type NetError,
  type PlayerMatchResult,
  type RandomEventType,
  type ReplayData,
  type RoomEffect,
  type RoomInfo,
  type RoomPlayerInfo,
  type RoomSettings,
  type RoomSettingsPatch,
  type Snapshot,
  type SnapshotEntry,
  type Team,
  type TeleportMessage,
} from '@hh/shared';
import {
  doorBlockedBy,
  fitsAt,
  hasLineOfSight,
  isInsideBounds,
  isPathClear,
  movedProps,
  propPosition,
  setRoomDoor,
  shoveProp,
  stepRoomPhysics,
  type RoomPhysics,
  type Vec3,
} from './physics.js';

export interface RoomPlayer {
  id: string;
  accountId: string;
  nickname: string;
  skin: string;
  effect: string;
  level: number;
  rating: number;
  reputation: number;
  connected: boolean;
  disconnectedAt: number | null;
  team: Team | null;
  lastTeam: Team | null;
  /** Rodadas jogadas como caçador (Caçador solitário escolhe quem caçou menos). */
  huntCount: number;
  alive: boolean;
  disguise: string | null;
  position: Vec3;
  yaw: number;
  flags: number;
  lastMoveAt: number;
  /** Última vez que se deslocou de verdade (para o scanner). */
  lastMovedAt: number;
  teleportId: number;
  transformReadyAt: number;
  captureReadyAt: number;
  captures: number;
  capturedAt: number | null;
  rejectedMoves: number;
  transforms: number;
  abilitiesUsed: number;
  abilities: Map<AbilityId, AbilityState>;
  camouflagedUntil: number;
  dashUntil: number;
  emoteReadyAt: number;
  partnerId: string | null;
  /** Entrou na equipe dos caçadores durante a partida (Infecção). */
  infected: boolean;
}

/** Saídas da sala. O RoomManager conecta isto ao Socket.IO; os testes usam espiões. */
export interface RoomOutput {
  state(room: Room): void;
  snapshot(room: Room, playerId: string, snapshot: Snapshot): void;
  feed(room: Room, event: FeedEvent): void;
  teleport(room: Room, playerId: string, message: TeleportMessage): void;
  results(room: Room, results: MatchResults, players: RoomPlayer[], replay: ReplayData): void;
  /** Efeito para todos (playerIds = null) ou só para alguns jogadores. */
  effect(room: Room, effect: RoomEffect, playerIds: string[] | null): void;
  abilities(room: Room, playerId: string, abilities: AbilityStates): void;
  /** Jogador saiu no meio da partida (penalidade por abandono). */
  abandon(room: Room, player: RoomPlayer): void;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: NetError };

const fail = (code: NetError['code'], message: string) => ({ ok: false as const, error: { code, message } });

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: MAX_PLAYERS_PER_ROOM,
  hunters: null,
  prepSeconds: DEFAULT_MATCH_TIMINGS.preparationSeconds,
  hidingSeconds: DEFAULT_MATCH_TIMINGS.hidingSeconds,
  huntingSeconds: DEFAULT_MATCH_TIMINGS.huntingSeconds,
  intermissionSeconds: DEFAULT_MATCH_TIMINGS.intermissionSeconds,
  mapId: 'big_house',
  mapVoting: true,
  mode: 'classic',
  randomEvents: true,
  abilities: true,
};

export interface RoomOptions {
  code: string;
  isPrivate: boolean;
  settings: RoomSettings;
  output: RoomOutput;
  createPhysics: (mapId: string) => RoomPhysics;
  now?: () => number;
  random?: () => number;
  /** Jogadores mínimos para salas públicas começarem sozinhas. */
  publicMinPlayers?: number;
  /** Usar o lobby 3D enquanto espera (desligado nos testes de regras). */
  useLobby?: boolean;
}

interface CloneState extends CloneInfo {
  ownerId: string;
  expiresAt: number;
}

/**
 * Uma sala e sua partida. Toda regra do jogo é decidida aqui, no servidor:
 * estados (WAITING → COUNTDOWN → HIDING → HUNTING → FINISHED), modos, equipes,
 * movimento validado, transformações, capturas, habilidades, portas,
 * interruptores, eventos aleatórios, física dos objetos e resultados.
 */
export class Room {
  readonly code: string;
  readonly isPrivate: boolean;
  settings: RoomSettings;
  readonly players = new Map<string, RoomPlayer>();
  hostId: string | null = null;
  state: MatchState = 'WAITING';
  stateEndsAt: number | null = null;
  round = 0;
  mapId: string;
  winner: Team | null = null;
  voteOptions: string[] = [];
  physics: RoomPhysics;
  readonly doors = new Map<string, boolean>();
  readonly doorReadyAt = new Map<string, number>();
  readonly lightsOff = new Set<string>();
  event: { type: RandomEventType; endsAt: number } | null = null;
  ambience: Ambience = { lighting: 'day', weather: 'clear' };
  matchId: string | null = null;
  private readonly clones = new Map<string, CloneState>();
  private readonly votes = new Map<string, string>();
  private nextEventAt = 0;
  private nextAutoRadarAt = 0;
  private matchStartedAt = 0;
  private replay: ReplayData | null = null;
  private lastFrameAt = 0;
  private dirty = true;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly output: RoomOutput;
  private readonly createPhysics: (mapId: string) => RoomPhysics;
  private readonly publicMinPlayers: number;
  private readonly useLobby: boolean;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.isPrivate = options.isPrivate;
    this.settings = { ...options.settings };
    this.output = options.output;
    this.createPhysics = options.createPhysics;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.publicMinPlayers = Math.max(options.publicMinPlayers ?? BALANCE.rooms.publicMinPlayers, this.settings.mode === 'competitive' ? 4 : 0);
    this.useLobby = options.useLobby ?? true;
    this.mapId = this.useLobby ? LOBBY_MAP_ID : options.settings.mapId;
    this.physics = this.createPhysics(this.mapId);
    this.resetMapState();
    this.refreshVoteOptions();
  }

  get mode(): GameMode {
    return this.settings.mode;
  }

  // ---------- entrada e saída ----------

  get connectedCount(): number {
    let count = 0;
    for (const p of this.players.values()) if (p.connected) count += 1;
    return count;
  }

  get isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  get inMatch(): boolean {
    return this.state === 'HIDING' || this.state === 'HUNTING';
  }

  hasAccount(accountId: string): boolean {
    for (const p of this.players.values()) if (p.accountId === accountId) return true;
    return false;
  }

  addPlayer(info: {
    id: string;
    accountId: string;
    nickname: string;
    skin: string;
    level: number;
    effect?: string;
    rating?: number;
    reputation?: number;
  }): RoomPlayer {
    const spawn = this.spawnFor(this.state === 'COUNTDOWN' ? 'HIDERS' : null, this.players.size);
    const now = this.now();
    const player: RoomPlayer = {
      id: info.id,
      accountId: info.accountId,
      nickname: info.nickname,
      skin: info.skin,
      level: info.level,
      effect: info.effect ?? 'smoke',
      rating: info.rating ?? 1000,
      reputation: info.reputation ?? 100,
      connected: true,
      disconnectedAt: null,
      team: this.state === 'COUNTDOWN' ? 'HIDERS' : null,
      lastTeam: null,
      huntCount: 0,
      // Quem entra no meio da partida assiste até a próxima rodada.
      alive: !this.inMatch,
      disguise: null,
      position: spawn,
      yaw: 0,
      flags: MoveFlag.Grounded | MoveFlag.Alive,
      lastMoveAt: now,
      lastMovedAt: 0,
      teleportId: 1,
      transformReadyAt: 0,
      captureReadyAt: 0,
      captures: 0,
      capturedAt: null,
      rejectedMoves: 0,
      transforms: 0,
      abilitiesUsed: 0,
      abilities: new Map(),
      camouflagedUntil: 0,
      dashUntil: 0,
      emoteReadyAt: 0,
      partnerId: null,
      infected: false,
    };
    this.players.set(player.id, player);
    if (!this.hostId && this.isPrivate) this.hostId = player.id;
    this.output.feed(this, { type: 'join', playerId: player.id });
    this.markDirty();
    this.sendTeleport(player);
    return player;
  }

  removePlayer(playerId: string, voluntary = false): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (this.inMatch && player.team && (voluntary || !player.connected)) this.output.abandon(this, player);
    this.players.delete(playerId);
    this.votes.delete(playerId);
    for (const other of this.players.values()) if (other.partnerId === playerId) other.partnerId = null;
    if (this.hostId === playerId) {
      this.hostId = this.isPrivate ? (this.players.keys().next().value ?? null) : null;
    }
    this.output.feed(this, { type: 'leave', playerId });
    this.markDirty();
    this.checkWinConditions();
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = connected;
    player.disconnectedAt = connected ? null : this.now();
    if (connected) {
      player.teleportId += 1;
      this.sendTeleport(player);
      this.sendAbilities(player);
    }
    this.markDirty();
  }

  // ---------- configuração (salas privadas) ----------

  updateSettings(playerId: string, patch: RoomSettingsPatch): ActionResult {
    if (!this.isPrivate) return fail(ErrorCode.NotHost, 'Salas públicas usam as regras padrão.');
    if (this.hostId !== playerId) return fail(ErrorCode.NotHost, 'Apenas o anfitrião pode mudar as regras.');
    if (this.state !== 'WAITING' && this.state !== 'FINISHED') {
      return fail(ErrorCode.InvalidAction, 'As regras só podem mudar entre partidas.');
    }
    const next = { ...this.settings, ...patch };
    if (next.maxPlayers < this.players.size) {
      return fail(ErrorCode.InvalidAction, `Já há ${this.players.size} jogadores na sala.`);
    }
    if (next.hunters !== null && next.hunters >= next.maxPlayers) {
      return fail(ErrorCode.InvalidAction, 'Precisa sobrar pelo menos um escondido.');
    }
    this.settings = next;
    this.refreshVoteOptions();
    this.markDirty();
    return { ok: true };
  }

  start(playerId: string): ActionResult {
    if (!this.isPrivate) return fail(ErrorCode.NotHost, 'Salas públicas começam sozinhas.');
    if (this.hostId !== playerId) return fail(ErrorCode.NotHost, 'Apenas o anfitrião pode iniciar.');
    if (this.state !== 'WAITING') return fail(ErrorCode.InvalidAction, 'A partida já começou.');
    if (this.connectedCount < MIN_PLAYERS_TO_START) {
      return fail(ErrorCode.InvalidAction, `São necessários pelo menos ${MIN_PLAYERS_TO_START} jogadores.`);
    }
    this.enterCountdown();
    return { ok: true };
  }

  vote(playerId: string, mapId: string): ActionResult {
    if (!this.settings.mapVoting) return fail(ErrorCode.InvalidAction, 'A votação de mapas está desativada.');
    if (this.state !== 'WAITING' && this.state !== 'FINISHED') {
      return fail(ErrorCode.InvalidAction, 'A votação acontece entre as partidas.');
    }
    if (!this.voteOptions.includes(mapId)) return fail(ErrorCode.InvalidAction, 'Mapa fora da votação.');
    this.votes.set(playerId, mapId);
    this.markDirty();
    return { ok: true };
  }

  // ---------- ações durante a partida ----------

  handleMove(playerId: string, move: MovePayload): void {
    const player = this.players.get(playerId);
    if (!player || !player.connected || !player.alive) return;
    if (move.tid !== player.teleportId) return; // mensagem anterior a um teletransporte
    if (this.isFrozen(player)) return;

    const now = this.now();
    const elapsed = Math.min(1, Math.max(0.05, (now - player.lastMoveAt) / 1000));
    const m = BALANCE.movement;
    const baseSpeed = player.team === 'HUNTERS' ? m.hunterRunSpeed * this.hunterSpeedMultiplier() : m.hiderRunSpeed;
    const propSpeed = player.disguise ? (getPropType(player.disguise)?.speed ?? 1) : 1;
    const dash = now < player.dashUntil + 300 ? 1.7 : 1;
    const maxHorizontal = baseSpeed * propSpeed * dash * elapsed * m.speedTolerance + m.distanceSlack;
    const maxVertical = m.maxVerticalSpeed * elapsed + m.distanceSlack;

    const to: Vec3 = move.p;
    const from = player.position;
    const horizontal = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const vertical = Math.abs(to[1] - from[1]);

    const valid =
      horizontal <= maxHorizontal &&
      vertical <= maxVertical &&
      isInsideBounds(this.physics, to) &&
      isPathClear(this.physics, player.disguise, from, to);

    player.lastMoveAt = now;
    if (!valid) {
      player.rejectedMoves += 1;
      player.teleportId += 1;
      this.sendTeleport(player);
      return;
    }
    if (horizontal > 0.05) player.lastMovedAt = now;
    player.position = [to[0], to[1], to[2]];
    player.yaw = move.yaw;
    player.flags = (move.f & (MoveFlag.Moving | MoveFlag.Running | MoveFlag.Grounded)) | MoveFlag.Alive;
  }

  transform(playerId: string, propId: string): ActionResult {
    const player = this.players.get(playerId);
    if (!player) return fail(ErrorCode.NotInRoom, 'Você não está nesta sala.');
    if (!this.inMatch) return fail(ErrorCode.InvalidAction, 'A transformação só funciona durante a partida.');
    if (player.team !== 'HIDERS' || !player.alive) return fail(ErrorCode.InvalidAction, 'Apenas escondidos podem se transformar.');
    const now = this.now();
    if (now < player.transformReadyAt) return fail(ErrorCode.Cooldown, 'Aguarde para se transformar de novo.');

    const map = getMap(this.mapId);
    const placement = map?.props.find((p) => p.id === propId);
    const type = placement ? getPropType(placement.type) : undefined;
    if (!placement || !type) return fail(ErrorCode.InvalidAction, 'Este objeto não existe no mapa.');
    if (player.disguise === type.id) return fail(ErrorCode.InvalidAction, 'Você já é este objeto.');

    const center = propPosition(this.physics, propId) ?? [placement.position[0], placement.position[1] + type.size[1] / 2, placement.position[2]];
    const reach = BALANCE.transform.range + Math.max(...type.size) / 2;
    const playerCenter: Vec3 = [player.position[0], player.position[1] + 0.9, player.position[2]];
    if (distance(center, playerCenter) > reach) return fail(ErrorCode.InvalidAction, 'Objeto longe demais.');

    if (!fitsAt(this.physics, type.id, player.position)) {
      return fail(ErrorCode.InvalidAction, 'Sem espaço aqui para este objeto. Afaste-se um pouco.');
    }

    player.disguise = type.id;
    player.transforms += 1;
    player.transformReadyAt = now + BALANCE.transform.cooldownSeconds * 1000;
    this.recordEvent(`${player.nickname} virou ${type.name}`, player.position);
    this.markDirty();
    return { ok: true };
  }

  capture(hunterId: string, targetId: string | null, cloneId?: string): ActionResult<{ captured: boolean }> {
    const hunter = this.players.get(hunterId);
    if (!hunter) return fail(ErrorCode.NotInRoom, 'Você não está nesta sala.');
    if (this.state !== 'HUNTING') return fail(ErrorCode.InvalidAction, 'A caça ainda não começou.');
    if (hunter.team !== 'HUNTERS' || !hunter.alive) return fail(ErrorCode.InvalidAction, 'Apenas caçadores capturam.');
    const now = this.now();
    if (now < hunter.captureReadyAt) return fail(ErrorCode.Cooldown, 'Aguarde um instante.');

    const hunterCenter: Vec3 = [hunter.position[0], hunter.position[1] + 0.9, hunter.position[2]];
    const miss = () => {
      hunter.captureReadyAt = now + BALANCE.capture.missPenaltySeconds * 1000;
      return { ok: true as const, captured: false };
    };

    // Clone falso: o caçador perde tempo e o clone se desfaz.
    if (cloneId) {
      const clone = this.clones.get(cloneId);
      if (clone && distance(clone.position, hunterCenter) <= BALANCE.capture.range + 1.2) {
        this.clones.delete(cloneId);
        this.output.effect(this, { kind: 'cloneBroken', cloneId, position: clone.position }, null);
        this.markDirty();
      }
      return miss();
    }
    if (!targetId) return miss();

    const target = this.players.get(targetId);
    if (!target || target.team !== 'HIDERS') return miss();
    if (!target.alive) return fail(ErrorCode.InvalidAction, 'Este jogador já foi capturado.');
    if (now < target.camouflagedUntil) return miss();

    const shape = characterShapeInfo(target.disguise);
    const targetCenter: Vec3 = [target.position[0], target.position[1] + shape.height / 2, target.position[2]];
    if (distance(targetCenter, hunterCenter) > BALANCE.capture.range + shape.radius) {
      return fail(ErrorCode.InvalidAction, 'Muito longe para capturar.');
    }
    const eye: Vec3 = [hunter.position[0], hunter.position[1] + 1.6, hunter.position[2]];
    if (!hasLineOfSight(this.physics, eye, targetCenter, shape.radius)) {
      return fail(ErrorCode.InvalidAction, 'Algo está no caminho.');
    }

    hunter.captureReadyAt = now + BALANCE.capture.cooldownSeconds * 1000;
    hunter.captures += 1;
    target.capturedAt = now;

    if (this.mode === 'infection') {
      // Infecção: o capturado vira caçador e volta ao jogo.
      target.team = 'HUNTERS';
      target.infected = true;
      target.disguise = null;
      target.position = this.spawnFor('HUNTERS', this.random() * 8);
      target.teleportId += 1;
      this.sendTeleport(target);
      this.initAbilities(target);
      this.output.feed(this, { type: 'infected', hunterId, targetId });
      this.recordEvent(`${hunter.nickname} infectou ${target.nickname}`, targetCenter);
    } else {
      target.alive = false;
      target.flags &= ~MoveFlag.Alive;
      this.output.feed(this, { type: 'capture', hunterId, targetId });
      this.recordEvent(`${hunter.nickname} capturou ${target.nickname}`, targetCenter);
    }
    this.markDirty();
    this.checkWinConditions();
    return { ok: true, captured: true };
  }

  /** Abre/fecha portas (inclusive passagens secretas) e aciona interruptores. */
  interact(playerId: string, id: string): ActionResult {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return fail(ErrorCode.InvalidAction, 'Você não pode interagir agora.');
    if (this.isFrozen(player)) return fail(ErrorCode.InvalidAction, 'Você está de olhos vendados.');
    const map = getMap(this.mapId);
    const now = this.now();
    const door = map?.doors.find((d) => d.id === id);
    if (door) {
      if (horizontalDistance(player.position, door.center) > 2.6) return fail(ErrorCode.InvalidAction, 'Chegue mais perto da porta.');
      if (now < (this.doorReadyAt.get(id) ?? 0)) return fail(ErrorCode.Cooldown, 'A porta ainda está se mexendo.');
      const open = !this.doors.get(id);
      if (!open && this.doorBlocked(door.id)) return fail(ErrorCode.InvalidAction, 'Tem alguém no caminho da porta.');
      this.setDoor(id, open);
      this.doorReadyAt.set(id, now + 800);
      this.output.effect(this, { kind: 'sound', sound: 'door', position: door.center }, null);
      return { ok: true };
    }
    const sw = map?.switches.find((s) => s.id === id);
    if (sw) {
      if (distance(player.position, [sw.position[0], player.position[1], sw.position[2]]) > 2.2) {
        return fail(ErrorCode.InvalidAction, 'Chegue mais perto do interruptor.');
      }
      if (this.lightsOff.has(sw.zone)) this.lightsOff.delete(sw.zone);
      else this.lightsOff.add(sw.zone);
      this.output.effect(this, { kind: 'sound', sound: 'switch', position: sw.position }, null);
      this.markDirty();
      return { ok: true };
    }
    return fail(ErrorCode.InvalidAction, 'Nada para usar aqui.');
  }

  /** Empurra um objeto do cenário (ou cutuca um jogador disfarçado). */
  shove(playerId: string, target: { propId?: string; playerId?: string }): ActionResult {
    const player = this.players.get(playerId);
    if (!player || !player.alive || this.isFrozen(player)) return fail(ErrorCode.InvalidAction, 'Você não pode empurrar agora.');
    const now = this.now();
    if (now < player.emoteReadyAt) return fail(ErrorCode.Cooldown, 'Calma!');
    player.emoteReadyAt = now + 700;
    const center: Vec3 = [player.position[0], player.position[1] + 0.9, player.position[2]];
    if (target.propId) {
      const pos = propPosition(this.physics, target.propId);
      if (!pos || distance(pos, center) > 2.4) return fail(ErrorCode.InvalidAction, 'Longe demais.');
      if (!shoveProp(this.physics, target.propId, player.position)) return fail(ErrorCode.InvalidAction, 'Este objeto é pesado demais.');
      return { ok: true };
    }
    if (target.playerId) {
      const other = this.players.get(target.playerId);
      if (!other || !other.alive || other.id === player.id) return fail(ErrorCode.InvalidAction, 'Nada para empurrar.');
      if (distance(other.position, player.position) > 2.2) return fail(ErrorCode.InvalidAction, 'Longe demais.');
      const dx = other.position[0] - player.position[0];
      const dz = other.position[2] - player.position[2];
      const len = Math.hypot(dx, dz) || 1;
      const to: Vec3 = [other.position[0] + (dx / len) * 0.6, other.position[1], other.position[2] + (dz / len) * 0.6];
      if (isPathClear(this.physics, other.disguise, other.position, to)) {
        other.position = to;
        other.teleportId += 1;
        this.sendTeleport(other);
      }
      return { ok: true };
    }
    return fail(ErrorCode.InvalidAction, 'Nada para empurrar.');
  }

  emote(playerId: string, emote: string): ActionResult {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return fail(ErrorCode.InvalidAction, 'Você não pode fazer emotes agora.');
    const now = this.now();
    if (now < player.emoteReadyAt) return fail(ErrorCode.Cooldown, 'Calma!');
    player.emoteReadyAt = now + 1500;
    // Escondidos transformados não "denunciam" a posição com emotes durante a partida.
    if (this.inMatch && player.disguise) return fail(ErrorCode.InvalidAction, 'Objetos não fazem emotes.');
    this.output.effect(this, { kind: 'emote', playerId, emote }, null);
    return { ok: true };
  }

  /** Marcação de posição para a própria equipe (ou parceiro de dupla). */
  ping(playerId: string, position: Vec3): void {
    const player = this.players.get(playerId);
    if (!player || !player.alive || !player.team) return;
    const now = this.now();
    if (now < player.emoteReadyAt) return;
    player.emoteReadyAt = now + 1000;
    if (distance(position, player.position) > 30) return;
    const recipients = [...this.players.values()]
      .filter((p) => p.team === player.team && (this.mode !== 'duos' || p.team !== 'HIDERS' || p.id === player.partnerId || p.id === player.id))
      .map((p) => p.id);
    this.output.effect(this, { kind: 'ping', playerId, position }, recipients);
  }

  useAbility(
    playerId: string,
    abilityId: AbilityId,
    payload: { target?: Vec3; propId?: string; playerId?: string },
  ): ActionResult {
    const player = this.players.get(playerId);
    const def = ABILITIES[abilityId];
    if (!player || !player.alive) return fail(ErrorCode.InvalidAction, 'Você não pode usar habilidades agora.');
    if (!this.settings.abilities) return fail(ErrorCode.InvalidAction, 'Habilidades desativadas nesta sala.');
    if (!this.inMatch) return fail(ErrorCode.InvalidAction, 'Habilidades só durante a partida.');
    if (player.team !== def.team) return fail(ErrorCode.InvalidAction, 'Esta habilidade é da outra equipe.');
    if (def.team === 'HUNTERS' && this.state !== 'HUNTING') return fail(ErrorCode.InvalidAction, 'Espere a caçada começar.');
    if (def.requiresDisguise && !player.disguise) return fail(ErrorCode.InvalidAction, 'Transforme-se em um objeto primeiro.');
    const state = player.abilities.get(abilityId);
    const now = this.now();
    if (!state || state.usesLeft <= 0) return fail(ErrorCode.InvalidAction, 'Sem usos restantes nesta partida.');
    if (now < state.readyAt) return fail(ErrorCode.Cooldown, 'Habilidade recarregando.');

    const center: Vec3 = [player.position[0], player.position[1] + 0.9, player.position[2]];
    const durationMs = def.durationSeconds * 1000;

    switch (abilityId) {
      case 'decoy': {
        const mine = [...this.clones.values()].filter((c) => c.ownerId === playerId);
        if (mine.length >= 2) return fail(ErrorCode.InvalidAction, 'Você já tem clones demais no mapa.');
        const id = `clone-${randomUUID().slice(0, 8)}`;
        this.clones.set(id, { id, type: player.disguise!, position: [...player.position], yaw: player.yaw, ownerId: playerId, expiresAt: now + durationMs });
        this.markDirty();
        break;
      }
      case 'whistle': {
        let target = payload.target ?? center;
        if (distance(target, center) > 10) {
          const d = distance(target, center);
          target = [center[0] + ((target[0] - center[0]) / d) * 10, center[1] + ((target[1] - center[1]) / d) * 10, center[2] + ((target[2] - center[2]) / d) * 10];
        }
        this.output.effect(this, { kind: 'sound', sound: 'whistle', position: target }, null);
        break;
      }
      case 'camouflage':
        player.camouflagedUntil = now + durationMs;
        break;
      case 'dash':
        player.dashUntil = now + durationMs;
        break;
      case 'radar':
        this.radarPulse(player, 18, 2.5);
        break;
      case 'scanner': {
        const points: Vec3[] = [];
        for (const p of this.players.values()) {
          if (p.team !== 'HIDERS' || !p.alive || now - p.lastMovedAt > 3000) continue;
          if (distance(p.position, player.position) > 14) continue;
          points.push(jitter(p.position, 1, this.random));
        }
        this.output.effect(this, { kind: 'scanner', points, until: now + durationMs }, [player.id]);
        break;
      }
      case 'analyzer': {
        let suspicious = false;
        if (payload.playerId) {
          const target = this.players.get(payload.playerId);
          if (!target || distance(target.position, player.position) > 6.5) return fail(ErrorCode.InvalidAction, 'Mire em algo mais perto.');
          suspicious = target.team === 'HIDERS' ? this.random() < 0.8 : this.random() < 0.15;
        } else if (payload.propId) {
          const clone = this.clones.get(payload.propId);
          const pos = clone?.position ?? propPosition(this.physics, payload.propId);
          if (!pos || distance(pos, player.position) > 6.5) return fail(ErrorCode.InvalidAction, 'Mire em algo mais perto.');
          suspicious = clone ? this.random() < 0.8 : this.random() < 0.15;
        } else {
          return fail(ErrorCode.InvalidAction, 'Mire em um objeto para analisar.');
        }
        this.output.effect(
          this,
          { kind: 'analyzer', propId: payload.propId ?? null, playerId: payload.playerId ?? null, suspicious },
          [player.id],
        );
        break;
      }
    }

    const cooldown = def.cooldownSeconds * (this.mode === 'chaos' ? 0.6 : 1) * 1000;
    state.usesLeft -= 1;
    state.readyAt = now + cooldown;
    state.activeUntil = durationMs > 0 ? now + durationMs : 0;
    player.abilitiesUsed += 1;
    this.sendAbilities(player);
    return { ok: true };
  }

  // ---------- ciclo ----------

  /** Avança estados, eventos e física. Chamado pelo RoomManager a 15 Hz. */
  tick(): void {
    const now = this.now();
    const graceMs = BALANCE.rooms.reconnectGraceSeconds * 1000;
    for (const player of [...this.players.values()]) {
      if (!player.connected && player.disconnectedAt !== null && now - player.disconnectedAt > graceMs) {
        this.removePlayer(player.id);
      }
    }

    switch (this.state) {
      case 'WAITING':
        if (!this.isPrivate && this.connectedCount >= this.publicMinPlayers) this.enterCountdown();
        break;
      case 'COUNTDOWN':
        if (this.activePlayers().length < MIN_PLAYERS_TO_START) this.enterWaiting();
        else if (this.timeUp(now)) this.enterHiding();
        break;
      case 'HIDING':
        if (this.timeUp(now)) this.enterHunting();
        else this.checkWinConditions();
        break;
      case 'HUNTING':
        if (this.timeUp(now)) this.finish('HIDERS', 'O tempo acabou e ainda havia escondidos.');
        else this.checkWinConditions();
        break;
      case 'FINISHED':
        if (this.timeUp(now)) {
          if (this.connectedCount >= (this.isPrivate ? MIN_PLAYERS_TO_START : this.publicMinPlayers)) this.enterCountdown();
          else this.enterWaiting();
        }
        break;
    }

    if (this.inMatch) {
      this.tickEvents(now);
      this.tickModeRules(now);
      this.recordFrame(now);
    }
    for (const [id, clone] of this.clones) {
      if (now >= clone.expiresAt) {
        this.clones.delete(id);
        this.markDirty();
      }
    }
    if (this.event && now >= this.event.endsAt) {
      this.event = null;
      this.markDirty();
    }
    stepRoomPhysics(this.physics);

    if (this.dirty) {
      this.dirty = false;
      this.output.state(this);
    }
  }

  /** Envia a cada jogador o snapshot que ele pode ver. */
  broadcastSnapshot(): void {
    const t = this.now();
    const full: SnapshotEntry[] = [];
    const forHunters: SnapshotEntry[] = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const entry: SnapshotEntry = [p.id, round2(p.position[0]), round2(p.position[1]), round2(p.position[2]), round2(p.yaw), p.flags];
      full.push(entry);
      // Caçadores não recebem escondidos durante o esconderijo nem camuflados.
      const hidden = p.team === 'HIDERS' && (this.state === 'HIDING' || t < p.camouflagedUntil);
      if (!hidden) forHunters.push(entry);
    }
    const moved = movedProps(this.physics);
    const fullSnapshot: Snapshot = moved.length > 0 ? { t, p: full, o: moved } : { t, p: full };
    const hunterSnapshot: Snapshot = moved.length > 0 ? { t, p: forHunters, o: moved } : { t, p: forHunters };
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.output.snapshot(this, p.id, p.team === 'HUNTERS' ? hunterSnapshot : fullSnapshot);
    }
  }

  info(): RoomInfo {
    const players: RoomPlayerInfo[] = [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      team: p.team,
      alive: p.alive,
      disguise: p.disguise,
      connected: p.connected,
      captures: p.captures,
      isHost: p.id === this.hostId,
      skin: p.skin,
      level: p.level,
      partnerId: p.partnerId,
      effect: p.effect,
      reputation: p.reputation,
    }));
    const votes: Record<string, number> = {};
    for (const option of this.voteOptions) votes[option] = 0;
    for (const mapId of this.votes.values()) votes[mapId] = (votes[mapId] ?? 0) + 1;
    return {
      code: this.code,
      isPrivate: this.isPrivate,
      hostId: this.hostId,
      settings: this.settings,
      state: this.state,
      stateEndsAt: this.stateEndsAt,
      round: this.round,
      mapId: this.mapId,
      players,
      voteOptions: this.voteOptions,
      votes,
      winner: this.winner,
      minPlayers: this.isPrivate ? MIN_PLAYERS_TO_START : this.publicMinPlayers,
      doors: Object.fromEntries(this.doors),
      lightsOff: [...this.lightsOff],
      event: this.event,
      ambience: this.ambience,
      clones: [...this.clones.values()].map(({ id, type, position, yaw }) => ({ id, type, position, yaw })),
      matchId: this.matchId,
    };
  }

  // ---------- transições ----------

  private enterWaiting(): void {
    this.setState('WAITING', null);
    this.winner = null;
    this.event = null;
    if (this.useLobby && this.mapId !== LOBBY_MAP_ID) this.loadMap(LOBBY_MAP_ID);
    let index = 0;
    for (const p of this.players.values()) {
      p.team = null;
      p.alive = true;
      p.disguise = null;
      p.partnerId = null;
      p.flags |= MoveFlag.Alive;
      p.position = this.spawnFor(null, index++);
      p.teleportId += 1;
      this.sendTeleport(p);
    }
  }

  private enterCountdown(): void {
    this.loadMap(this.pickMap());
    this.votes.clear();
    this.round += 1;
    this.winner = null;
    this.matchId = randomUUID();
    this.ambience = {
      lighting: LIGHTING_PRESETS[Math.floor(this.random() * LIGHTING_PRESETS.length)]!,
      weather: WEATHER_TYPES[Math.floor(this.random() * WEATHER_TYPES.length)]!,
    };
    this.assignTeams();
    this.setState('COUNTDOWN', this.settings.prepSeconds);
    let index = 0;
    for (const p of this.players.values()) {
      p.position = this.spawnFor('HIDERS', index++);
      p.teleportId += 1;
      this.sendTeleport(p);
    }
  }

  private enterHiding(): void {
    const now = this.now();
    this.matchStartedAt = now;
    this.setState('HIDING', this.settings.hidingSeconds);
    let hiderIndex = 0;
    let hunterIndex = 0;
    for (const p of this.players.values()) {
      if (!p.team) continue;
      p.position = this.spawnFor(p.team, p.team === 'HIDERS' ? hiderIndex++ : hunterIndex++);
      p.yaw = p.team === 'HUNTERS' ? Math.PI : 0;
      p.teleportId += 1;
      this.sendTeleport(p);
      this.initAbilities(p);
    }
    this.replay = {
      matchId: this.matchId ?? randomUUID(),
      mapId: this.mapId,
      mode: this.mode,
      interval: 200,
      players: [...this.players.values()].filter((p) => p.team).map((p) => ({ id: p.id, nickname: p.nickname, team: p.team! })),
      disguises: [],
      frames: [],
      events: [],
    };
    this.lastFrameAt = 0;
    this.nextEventAt = now + this.eventDelay();
    this.output.feed(this, { type: 'info', message: 'Escondam-se! Os caçadores estão de olhos vendados.' });
  }

  private enterHunting(): void {
    const multiplier = this.mode === 'survival' ? 2 : this.mode === 'lone_hunter' ? 1.25 : 1;
    this.setState('HUNTING', Math.round(this.settings.huntingSeconds * multiplier));
    this.nextAutoRadarAt = this.now() + 90_000;
    this.recordEvent('A caçada começou');
    this.output.feed(this, { type: 'info', message: 'A caçada começou!' });
  }

  private finish(winner: Team, reason: string): void {
    if (this.state === 'FINISHED') return;
    const now = this.now();
    this.winner = winner;
    this.event = null;
    this.setState('FINISHED', this.settings.intermissionSeconds);
    this.refreshVoteOptions();

    const huntStart = this.matchStartedAt + this.settings.hidingSeconds * 1000;
    const P = BALANCE.progression;
    const participants = [...this.players.values()].filter((p) => p.team);
    const ratingChanges = this.mode === 'competitive' ? this.computeRatingChanges(participants, winner) : null;
    const results: PlayerMatchResult[] = [];
    for (const p of participants) {
      const team = p.team!;
      // Na Infecção, quem foi infectado jogou como escondido.
      const startedAsHider = team === 'HIDERS' || p.infected;
      const won = team === winner;
      const survived = team === 'HIDERS' && p.alive;
      const survivalSeconds = startedAsHider ? Math.max(0, Math.round(((p.capturedAt ?? now) - Math.min(huntStart, now)) / 1000)) : 0;
      const partner = p.partnerId ? this.players.get(p.partnerId) : undefined;
      const duoBonus = this.mode === 'duos' && survived && partner?.alive ? 50 : 0;
      const xp = Math.round(P.xpParticipation + (won ? P.xpWin : 0) + p.captures * P.xpPerCapture + survivalSeconds * P.xpPerSurvivalSecond + duoBonus);
      results.push({
        id: p.id,
        nickname: p.nickname,
        team,
        captures: p.captures,
        survived,
        survivalSeconds,
        xpGained: xp,
        coinsGained: Math.floor(xp / P.coinsPerXp),
        transforms: p.transforms,
        abilitiesUsed: p.abilitiesUsed,
        ratingChange: ratingChanges?.get(p.id) ?? null,
      });
    }
    const replay = this.replay ?? this.emptyReplay();
    this.recordEvent(winner === 'HIDERS' ? 'Escondidos venceram' : 'Caçadores venceram');
    this.output.results(
      this,
      {
        matchId: this.matchId ?? randomUUID(),
        mode: this.mode,
        winner,
        reason,
        mapId: this.mapId,
        durationSeconds: Math.round((now - this.matchStartedAt) / 1000),
        players: results,
        highlights: buildHighlights(results, winner, this.mode, this.players),
      },
      participants,
      replay,
    );
    this.replay = null;
  }

  private checkWinConditions(): void {
    if (!this.inMatch) return;
    const hiders = [...this.players.values()].filter((p) => p.team === 'HIDERS');
    const hunters = [...this.players.values()].filter((p) => p.team === 'HUNTERS');
    if (hiders.length > 0 && hiders.every((p) => !p.alive)) {
      this.finish('HUNTERS', 'Todos os escondidos foram capturados.');
    } else if (hiders.length === 0) {
      this.finish('HUNTERS', this.mode === 'infection' ? 'Todos foram infectados.' : 'Não restaram escondidos na sala.');
    } else if (hunters.length === 0) {
      // Caçadores com a conexão caída ainda contam durante o tempo de reconexão.
      this.finish('HIDERS', 'Os caçadores saíram da partida.');
    }
  }

  private assignTeams(): void {
    const active = this.activePlayers();
    for (const p of this.players.values()) {
      p.team = null;
      p.alive = true;
      p.disguise = null;
      p.captures = 0;
      p.capturedAt = null;
      p.transforms = 0;
      p.abilitiesUsed = 0;
      p.partnerId = null;
      p.infected = false;
      p.camouflagedUntil = 0;
      p.dashUntil = 0;
      p.abilities.clear();
      p.flags |= MoveFlag.Alive;
    }
    if (active.length < MIN_PLAYERS_TO_START) return;

    const n = Math.min(active.length, MAX_PLAYERS_PER_ROOM);
    let hunterCount: number;
    if (this.mode === 'lone_hunter') hunterCount = 1;
    else if (this.mode === 'infection') hunterCount = Math.max(1, Math.floor(n / 8));
    else hunterCount = this.settings.hunters ?? computeTeamDistribution(n).hunters;
    hunterCount = Math.min(n - 1, Math.max(1, hunterCount));

    const ordered = active
      .map((p) => ({
        p,
        key: this.mode === 'lone_hunter' ? p.huntCount * 10 + this.random() : (p.lastTeam === 'HUNTERS' ? 1 : 0) + this.random(),
      }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.p);
    ordered.forEach((p, index) => {
      p.team = index < hunterCount ? 'HUNTERS' : 'HIDERS';
      p.lastTeam = p.team;
      if (p.team === 'HUNTERS') p.huntCount += 1;
    });

    if (this.mode === 'duos') {
      const hiders = ordered.filter((p) => p.team === 'HIDERS');
      for (let i = 0; i + 1 < hiders.length; i += 2) {
        hiders[i]!.partnerId = hiders[i + 1]!.id;
        hiders[i + 1]!.partnerId = hiders[i]!.id;
      }
    }
  }

  private initAbilities(player: RoomPlayer): void {
    player.abilities.clear();
    if (this.settings.abilities && player.team) {
      for (const def of abilitiesFor(player.team)) {
        player.abilities.set(def.id, { id: def.id, usesLeft: def.usesPerMatch, readyAt: 0, activeUntil: 0 });
      }
    }
    this.sendAbilities(player);
  }

  private sendAbilities(player: RoomPlayer): void {
    this.output.abilities(this, player.id, Object.fromEntries(player.abilities) as AbilityStates);
  }

  // ---------- eventos, modos e replay ----------

  private eventDelay(): number {
    const [min, max] = this.mode === 'chaos' ? EVENT_INTERVAL.chaos : EVENT_INTERVAL.normal;
    return (min + this.random() * (max - min)) * 1000;
  }

  private tickEvents(now: number): void {
    const enabled = this.mode === 'chaos' || (this.settings.randomEvents && this.mode !== 'competitive');
    if (!enabled || this.event || now < this.nextEventAt) return;
    const remaining = this.stateEndsAt === null ? Infinity : this.stateEndsAt - now;
    if (this.state === 'HUNTING' && remaining < EVENT_INTERVAL.quietEndSeconds * 1000) return;
    const type = RANDOM_EVENTS[Math.floor(this.random() * RANDOM_EVENTS.length)]!;
    const info = EVENT_INFO[type];
    this.event = { type, endsAt: now + info.durationSeconds * 1000 };
    this.nextEventAt = now + info.durationSeconds * 1000 + this.eventDelay();
    if (type === 'doors') {
      for (const door of getMap(this.mapId)?.doors ?? []) {
        if (door.secret || this.random() < 0.5) continue;
        const open = !this.doors.get(door.id);
        if (!open && this.doorBlocked(door.id)) continue;
        this.setDoor(door.id, open);
      }
    }
    if (type === 'alarm') this.output.effect(this, { kind: 'sound', sound: 'alarm', position: null }, null);
    if (type === 'storm') this.output.effect(this, { kind: 'sound', sound: 'thunder', position: null }, null);
    this.output.feed(this, { type: 'info', message: info.message });
    this.recordEvent(info.message);
    this.markDirty();
  }

  private tickModeRules(now: number): void {
    if (this.mode === 'survival' && this.state === 'HUNTING' && now >= this.nextAutoRadarAt) {
      this.nextAutoRadarAt = now + 90_000;
      for (const p of this.players.values()) if (p.team === 'HUNTERS' && p.alive) this.radarPulse(p, 25, 4);
      this.output.feed(this, { type: 'info', message: 'Pulso de radar: os caçadores sentiram vocês por perto!' });
    }
  }

  /** Multiplicador de velocidade dos caçadores (Sobrevivência acelera a cada minuto). */
  private hunterSpeedMultiplier(): number {
    if (this.mode !== 'survival' || this.state !== 'HUNTING' || this.stateEndsAt === null) return 1;
    const elapsed = (this.now() - (this.stateEndsAt - this.settings.huntingSeconds * 2000)) / 60000;
    return 1 + Math.min(0.3, Math.max(0, Math.floor(elapsed)) * 0.05);
  }

  private radarPulse(hunter: RoomPlayer, range: number, noise: number): void {
    const points: Vec3[] = [];
    for (const p of this.players.values()) {
      if (p.team !== 'HIDERS' || !p.alive) continue;
      if (distance(p.position, hunter.position) > range) continue;
      points.push(jitter(p.position, noise, this.random));
    }
    this.output.effect(this, { kind: 'radar', points, until: this.now() + 3000 }, [hunter.id]);
  }

  private recordFrame(now: number): void {
    const replay = this.replay;
    if (!replay || now - this.lastFrameAt < replay.interval) return;
    // Avança em passos fixos para o replay ficar em tempo real mesmo com o
    // laço de 15 Hz (66 ms) não sendo múltiplo exato do intervalo (200 ms).
    this.lastFrameAt = now - this.lastFrameAt > replay.interval * 2 ? now : this.lastFrameAt + replay.interval;
    const frame: ReplayData['frames'][number] = [];
    for (const p of this.players.values()) {
      if (!p.alive || !p.team) continue;
      let disguise = -1;
      if (p.disguise) {
        disguise = replay.disguises.indexOf(p.disguise);
        if (disguise < 0) disguise = replay.disguises.push(p.disguise) - 1;
      }
      frame.push([p.id, round2(p.position[0]), round2(p.position[1]), round2(p.position[2]), round2(p.yaw), disguise]);
    }
    replay.frames.push(frame);
    // Limite de memória: até 15 minutos a 5 quadros por segundo.
    if (replay.frames.length > 4500) replay.frames.shift();
  }

  private recordEvent(text: string, position?: Vec3): void {
    if (!this.replay) return;
    const event: ReplayData['events'][number] = { t: this.replay.frames.length, text };
    if (position) event.position = [round2(position[0]), round2(position[1]), round2(position[2])];
    this.replay.events.push(event);
  }

  private emptyReplay(): ReplayData {
    return { matchId: this.matchId ?? randomUUID(), mapId: this.mapId, mode: this.mode, interval: 200, players: [], disguises: [], frames: [], events: [] };
  }

  private computeRatingChanges(participants: RoomPlayer[], winner: Team): Map<string, number> {
    const avg = (team: Team) => {
      const list = participants.filter((p) => p.team === team);
      return list.reduce((s, p) => s + p.rating, 0) / Math.max(1, list.length);
    };
    const hiders = avg('HIDERS');
    const hunters = avg('HUNTERS');
    const changes = new Map<string, number>();
    for (const p of participants) {
      const mine = p.team === 'HIDERS' ? hiders : hunters;
      const theirs = p.team === 'HIDERS' ? hunters : hiders;
      const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
      const score = p.team === winner ? 1 : 0;
      changes.set(p.id, Math.round(32 * (score - expected)));
    }
    return changes;
  }

  // ---------- mapa ----------

  private loadMap(mapId: string): void {
    if (mapId === this.mapId && this.physics) {
      this.resetMapState();
      return;
    }
    this.mapId = mapId;
    this.physics.world.free();
    this.physics = this.createPhysics(mapId);
    this.resetMapState();
  }

  private resetMapState(): void {
    this.doors.clear();
    this.doorReadyAt.clear();
    this.lightsOff.clear();
    this.clones.clear();
    for (const door of getMap(this.mapId)?.doors ?? []) {
      this.doors.set(door.id, door.open);
      setRoomDoor(this.physics, door.id, door.open);
    }
    // Objetos empurrados voltam ao lugar a cada partida.
    if (this.physics.pushables.size > 0) {
      for (const [id, body] of this.physics.pushables) {
        const pose = this.physics.initialPoses.get(id)!;
        body.setTranslation({ x: pose.p[0], y: pose.p[1], z: pose.p[2] }, false);
        body.setRotation({ x: pose.q[0], y: pose.q[1], z: pose.q[2], w: pose.q[3] }, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.sleep();
      }
    }
    this.markDirty();
  }

  private setDoor(id: string, open: boolean): void {
    this.doors.set(id, open);
    setRoomDoor(this.physics, id, open);
    this.markDirty();
  }

  private doorBlocked(doorId: string): boolean {
    const door = getMap(this.mapId)?.doors.find((d) => d.id === doorId);
    if (!door) return false;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const shape = characterShapeInfo(p.disguise);
      if (doorBlockedBy(door.center, door.size, p.position, shape.radius, shape.height)) return true;
    }
    return false;
  }

  private activePlayers(): RoomPlayer[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  private pickMap(): string {
    if (!this.settings.mapVoting) return this.settings.mapId;
    const counts = new Map<string, number>();
    for (const mapId of this.votes.values()) counts.set(mapId, (counts.get(mapId) ?? 0) + 1);
    if (counts.size === 0) return this.settings.mapId;
    const max = Math.max(...counts.values());
    const tied = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
    return tied[Math.floor(this.random() * tied.length)] ?? this.settings.mapId;
  }

  private refreshVoteOptions(): void {
    this.voteOptions = this.settings.mapVoting ? [...PLAYABLE_MAP_IDS] : [];
    this.votes.clear();
  }

  private isFrozen(player: RoomPlayer): boolean {
    return this.state === 'HIDING' && player.team === 'HUNTERS';
  }

  private spawnFor(team: Team | null, index: number): Vec3 {
    const map = getMap(this.mapId);
    const list = (team === 'HUNTERS' ? map?.spawns.hunters : map?.spawns.hiders) ?? [];
    const spawn = list[Math.floor(index) % Math.max(1, list.length)] ?? [0, 0, 0];
    return [spawn[0], spawn[1] + 0.05, spawn[2]];
  }

  private sendTeleport(player: RoomPlayer): void {
    player.lastMoveAt = this.now();
    this.output.teleport(this, player.id, {
      position: [...player.position],
      yaw: player.yaw,
      teleportId: player.teleportId,
    });
  }

  private setState(state: MatchState, seconds: number | null): void {
    this.state = state;
    this.stateEndsAt = seconds === null ? null : this.now() + seconds * 1000;
    this.markDirty();
  }

  private timeUp(now: number): boolean {
    return this.stateEndsAt !== null && now >= this.stateEndsAt;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Nome do modo para mensagens. */
  get modeName(): string {
    return MODE_INFO[this.mode].name;
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function jitter(p: Vec3, amount: number, random: () => number): Vec3 {
  return [round2(p[0] + (random() - 0.5) * 2 * amount), round2(p[1]), round2(p[2] + (random() - 0.5) * 2 * amount)];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildHighlights(players: PlayerMatchResult[], winner: Team, mode: GameMode, roster: Map<string, RoomPlayer>): string[] {
  const highlights: string[] = [];
  const topHunter = [...players].sort((a, b) => b.captures - a.captures)[0];
  if (topHunter && topHunter.captures > 0) {
    highlights.push(`${topHunter.nickname} fez ${topHunter.captures} captura${topHunter.captures > 1 ? 's' : ''}.`);
  }
  const survivors = players.filter((p) => p.survived);
  if (winner === 'HIDERS' && survivors.length === 1) {
    highlights.push(`${survivors[0]!.nickname} foi o último escondido de pé.`);
  } else if (survivors.length > 1) {
    highlights.push(`${survivors.length} escondidos sobreviveram até o fim.`);
  }
  const longest = [...players].filter((p) => p.team === 'HIDERS').sort((a, b) => b.survivalSeconds - a.survivalSeconds)[0];
  if (longest && !longest.survived && longest.survivalSeconds > 0) {
    highlights.push(`${longest.nickname} resistiu ${longest.survivalSeconds}s antes de ser pego.`);
  }
  const chameleon = [...players].sort((a, b) => b.transforms - a.transforms)[0];
  if (chameleon && chameleon.transforms >= 3) highlights.push(`${chameleon.nickname} trocou de objeto ${chameleon.transforms} vezes.`);
  if (mode === 'duos') {
    const duo = players.find((p) => {
      const partner = roster.get(p.id)?.partnerId;
      return p.survived && partner && players.find((x) => x.id === partner)?.survived;
    });
    if (duo) highlights.push(`A dupla de ${duo.nickname} sobreviveu inteira!`);
  }
  return highlights;
}
