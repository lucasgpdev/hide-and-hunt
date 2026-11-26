import type { AbilityId, AbilityState } from '../game/abilities.js';
import type { Ambience, RandomEventType } from '../game/events.js';
import type { GameMode } from '../game/modes.js';
import type { MissionStatus } from '../progression/missions.js';
import type { SeasonStatus } from '../progression/season.js';
import type { UnlockedAchievement } from '../progression/achievements.js';
import type { MatchState, Team } from './game.js';

/** Configuração de uma sala (item 18). Validada no servidor. */
export interface RoomSettings {
  maxPlayers: number;
  /** Quantidade de caçadores; null = automático (1 a cada 4 jogadores). */
  hunters: number | null;
  prepSeconds: number;
  hidingSeconds: number;
  huntingSeconds: number;
  intermissionSeconds: number;
  mapId: string;
  mapVoting: boolean;
  mode: GameMode;
  /** Eventos aleatórios ligados. */
  randomEvents: boolean;
  /** Habilidades especiais liberadas (recursos permitidos). */
  abilities: boolean;
}

export interface RoomPlayerInfo {
  id: string;
  nickname: string;
  team: Team | null;
  alive: boolean;
  /** Tipo de objeto em que está transformado (null = forma humana). */
  disguise: string | null;
  connected: boolean;
  captures: number;
  isHost: boolean;
  skin: string;
  level: number;
  /** Parceiro de dupla (modo Duplas). */
  partnerId: string | null;
  /** Efeito visual de transformação (recompensa de temporada). */
  effect: string;
  /** Reputação 0..100 (moderação). */
  reputation: number;
}

/** Clone falso deixado por um escondido (não revela quem criou). */
export interface CloneInfo {
  id: string;
  type: string;
  position: [number, number, number];
  yaw: number;
}

export interface RoomInfo {
  code: string;
  isPrivate: boolean;
  hostId: string | null;
  settings: RoomSettings;
  state: MatchState;
  /** Fim da fase atual, no relógio do servidor (ms). */
  stateEndsAt: number | null;
  round: number;
  mapId: string;
  players: RoomPlayerInfo[];
  voteOptions: string[];
  votes: Record<string, number>;
  winner: Team | null;
  /** Jogadores conectados necessários para começar. */
  minPlayers: number;
  /** Portas abertas, por id. */
  doors: Record<string, boolean>;
  /** Zonas com a luz apagada pelo interruptor. */
  lightsOff: string[];
  event: { type: RandomEventType; endsAt: number } | null;
  ambience: Ambience;
  clones: CloneInfo[];
  /** Id da partida atual/última (para o replay). */
  matchId: string | null;
}

/** Bits do campo de estado no snapshot. */
export const MoveFlag = {
  Moving: 1,
  Running: 2,
  Grounded: 4,
  Alive: 8,
  /** Lanterna ligada (só na forma humana). */
  Flashlight: 16,
} as const;

/** [id, x, y, z, yaw, flags] */
export type SnapshotEntry = [string, number, number, number, number, number];

/** Objeto do cenário fora da posição original: [id, x, y, z, qx, qy, qz, qw] */
export type PropPoseEntry = [string, number, number, number, number, number, number, number];

export interface Snapshot {
  /** Hora do servidor (ms). */
  t: number;
  p: SnapshotEntry[];
  /** Objetos empurrados/derrubados. */
  o?: PropPoseEntry[];
}

export interface TeleportMessage {
  position: [number, number, number];
  yaw: number;
  /** Mensagens de movimento com outro teleportId são ignoradas pelo servidor. */
  teleportId: number;
}

export type FeedEvent =
  | { type: 'capture'; hunterId: string; targetId: string }
  | { type: 'infected'; hunterId: string; targetId: string }
  | { type: 'join'; playerId: string }
  | { type: 'leave'; playerId: string }
  | { type: 'info'; message: string };

/** Efeitos momentâneos transmitidos aos jogadores. */
export type RoomEffect =
  | { kind: 'sound'; sound: 'whistle' | 'alarm' | 'thunder' | 'door' | 'switch'; position: [number, number, number] | null }
  | { kind: 'emote'; playerId: string; emote: string }
  | { kind: 'ping'; playerId: string; position: [number, number, number] }
  | { kind: 'radar'; points: [number, number, number][]; until: number }
  | { kind: 'scanner'; points: [number, number, number][]; until: number }
  | { kind: 'analyzer'; propId: string | null; playerId: string | null; suspicious: boolean }
  | { kind: 'cloneBroken'; cloneId: string; position: [number, number, number] }
  | { kind: 'achievement'; id: string; name: string }
  | { kind: 'mission'; description: string };

export interface PlayerMatchResult {
  id: string;
  nickname: string;
  team: Team;
  captures: number;
  survived: boolean;
  survivalSeconds: number;
  xpGained: number;
  coinsGained: number;
  transforms: number;
  abilitiesUsed: number;
  ratingChange: number | null;
}

export interface MatchResults {
  matchId: string;
  mode: GameMode;
  winner: Team;
  reason: string;
  mapId: string;
  durationSeconds: number;
  players: PlayerMatchResult[];
  /** Destaques (item 34, versão inicial). */
  highlights: string[];
}

// ---------- Perfil, ranking e loja ----------

export interface PlayerStats {
  matchesPlayed: number;
  winsHider: number;
  winsHunter: number;
  losses: number;
  captures: number;
  survivalSeconds: number;
}

export interface MatchHistoryEntry {
  mode?: string;
  date: string;
  mapId: string;
  team: Team;
  won: boolean;
  captures: number;
  survivalSeconds: number;
}

export interface Profile {
  id: string;
  nickname: string;
  xp: number;
  level: number;
  coins: number;
  stats: PlayerStats;
  ownedSkins: string[];
  equippedSkin: string;
  history: MatchHistoryEntry[];
  /** false quando o servidor está sem banco (dados se perdem ao reiniciar). */
  persistent: boolean;
  /** Código para adicionar como amigo (ex.: "Ana#4821"). */
  friendCode: string;
  /** Nome de usuário se a conta tiver login (null = convidado). */
  username: string | null;
  achievements: UnlockedAchievement[];
  rating: number;
  reputation: number;
  unlockedEmotes: string[];
  unlockedEffects: string[];
  equippedEffect: string;
}

export interface ProgressSnapshot {
  missions: MissionStatus[];
  season: SeasonStatus;
}

export interface FriendInfo {
  accountId: string;
  nickname: string;
  friendCode: string;
  online: boolean;
  roomCode: string | null;
  level: number;
}

export interface FriendRequest {
  id: string;
  fromNickname: string;
  fromCode: string;
}

export interface SocialSnapshot {
  friends: FriendInfo[];
  incoming: FriendRequest[];
  recent: { accountId: string; nickname: string; friendCode: string; lastPlayed: string }[];
}

export interface PublicProfile {
  nickname: string;
  friendCode: string;
  level: number;
  stats: PlayerStats;
  achievements: number;
  reputation: number;
}

/** Quadro do replay: [id, x, y, z, yaw, disguise index ou -1] por jogador vivo. */
export interface ReplayData {
  matchId: string;
  mapId: string;
  mode: GameMode;
  /** Intervalo entre quadros (ms). */
  interval: number;
  players: { id: string; nickname: string; team: Team }[];
  disguises: string[];
  frames: [string, number, number, number, number, number][][];
  events: { t: number; text: string; position?: [number, number, number] }[];
}

export type AbilityStates = Partial<Record<AbilityId, AbilityState>>;

export const RANKING_CATEGORIES = ['xp', 'winsHider', 'winsHunter', 'captures', 'survivalSeconds', 'matchesPlayed', 'rating'] as const;
export const RANKING_SCOPES = ['global', 'season'] as const;
export type RankingScope = (typeof RANKING_SCOPES)[number];
export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export interface RankingEntry {
  rank: number;
  nickname: string;
  level: number;
  value: number;
  isMe: boolean;
}
