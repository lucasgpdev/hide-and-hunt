import type { ErrorCode, NetEvent } from '../constants/network.js';
import type { HelloPayload, MovePayload, PingPayload, RoomSettingsPatch } from '../validation/messages.js';
import type { PublicPlayer } from './game.js';
import type { AbilityId } from '../game/abilities.js';
import type { GameMode } from '../game/modes.js';
import type {
  AbilityStates,
  FeedEvent,
  MatchResults,
  ProgressSnapshot,
  Profile,
  PublicProfile,
  RankingCategory,
  RankingEntry,
  RankingScope,
  ReplayData,
  RoomEffect,
  RoomInfo,
  SocialSnapshot,
  Snapshot,
  TeleportMessage,
} from './room.js';

/** Erro padronizado devolvido pelo servidor. */
export interface NetError {
  code: ErrorCode;
  message: string;
}

/** Resposta genérica: sucesso com dados ou falha com erro. */
export type NetResult<T = object> = ({ ok: true } & T) | { ok: false; error: NetError };

export interface ServerInfo {
  name: string;
  version: string;
  protocolVersion: number;
  tickRate: number;
  serverTime: number;
}

export type HelloResponse = NetResult<{ player: PublicPlayer; server: ServerInfo; profile: Profile }>;
export type PingResponse = NetResult<{ clientTime: number; serverTime: number }>;
export type RoomResponse = NetResult<{ room: RoomInfo }>;
export type ProfileResponse = NetResult<{ profile: Profile }>;
export type RankingResponse = NetResult<{ entries: RankingEntry[]; persistent: boolean }>;
export type ProgressResponse = NetResult<{ progress: ProgressSnapshot }>;
export type SocialResponse = NetResult<{ social: SocialSnapshot }>;
export type AccountResponse = NetResult<{ accountToken: string; profile: Profile }>;

export type VoiceSignalData = {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

type Ack<T> = (response: T) => void;

export interface ServerStats {
  onlinePlayers: number;
  uptimeSeconds: number;
  rooms: number;
}

/** Eventos que o servidor envia ao cliente. */
export interface ServerToClientEvents {
  [NetEvent.Stats]: (stats: ServerStats) => void;
  [NetEvent.Error]: (error: NetError) => void;
  [NetEvent.RoomState]: (room: RoomInfo | null) => void;
  [NetEvent.Snapshot]: (snapshot: Snapshot) => void;
  [NetEvent.Feed]: (event: FeedEvent) => void;
  [NetEvent.Teleport]: (message: TeleportMessage) => void;
  [NetEvent.Results]: (results: MatchResults) => void;
  [NetEvent.Abilities]: (abilities: AbilityStates) => void;
  [NetEvent.Effect]: (effect: RoomEffect) => void;
  [NetEvent.InviteReceived]: (invite: { fromNickname: string; code: string }) => void;
  [NetEvent.SocialChanged]: () => void;
  [NetEvent.VoiceSignal]: (message: { from: string; data: VoiceSignalData }) => void;
  [NetEvent.VoicePeers]: (peers: string[]) => void;
}

/**
 * Eventos que o cliente envia ao servidor.
 * O tipo do payload aqui é apenas uma referência para o cliente: o servidor
 * sempre trata o dado recebido como `unknown` e o valida com Zod.
 */
export interface ClientToServerEvents {
  [NetEvent.Hello]: (payload: HelloPayload, ack: Ack<HelloResponse>) => void;
  [NetEvent.Ping]: (payload: PingPayload, ack: Ack<PingResponse>) => void;
  [NetEvent.QuickJoin]: (payload: { mode?: Exclude<GameMode, 'custom'> }, ack: Ack<RoomResponse>) => void;
  [NetEvent.CreateRoom]: (payload: { settings: RoomSettingsPatch }, ack: Ack<RoomResponse>) => void;
  [NetEvent.JoinRoom]: (payload: { code: string }, ack: Ack<RoomResponse>) => void;
  [NetEvent.LeaveRoom]: (payload: Record<string, never>, ack: Ack<NetResult>) => void;
  [NetEvent.UpdateSettings]: (payload: { settings: RoomSettingsPatch }, ack: Ack<RoomResponse>) => void;
  [NetEvent.StartMatch]: (payload: Record<string, never>, ack: Ack<NetResult>) => void;
  [NetEvent.VoteMap]: (payload: { mapId: string }, ack: Ack<NetResult>) => void;
  [NetEvent.Move]: (payload: MovePayload) => void;
  [NetEvent.Transform]: (payload: { propId: string }, ack: Ack<NetResult>) => void;
  [NetEvent.Capture]: (payload: { targetId: string | null; cloneId?: string }, ack: Ack<NetResult<{ captured: boolean }>>) => void;
  [NetEvent.Shove]: (payload: { propId?: string; playerId?: string }, ack: Ack<NetResult>) => void;
  [NetEvent.GetProfile]: (payload: Record<string, never>, ack: Ack<ProfileResponse>) => void;
  [NetEvent.GetRanking]: (
    payload: { category: RankingCategory; scope?: RankingScope; mode?: GameMode },
    ack: Ack<RankingResponse>,
  ) => void;
  [NetEvent.BuySkin]: (payload: { skinId: string }, ack: Ack<ProfileResponse>) => void;
  [NetEvent.EquipSkin]: (payload: { skinId: string }, ack: Ack<ProfileResponse>) => void;
  [NetEvent.EquipEffect]: (payload: { effectId: string }, ack: Ack<ProfileResponse>) => void;
  [NetEvent.Ability]: (
    payload: { ability: AbilityId; target?: [number, number, number]; propId?: string; playerId?: string },
    ack: Ack<NetResult>,
  ) => void;
  [NetEvent.Interact]: (payload: { id: string }, ack: Ack<NetResult>) => void;
  [NetEvent.Emote]: (payload: { emote: string }, ack: Ack<NetResult>) => void;
  [NetEvent.Ping2]: (payload: { position: [number, number, number] }) => void;
  [NetEvent.Report]: (payload: { playerId: string; reason: 'cheating' | 'abuse' | 'afk' | 'other'; details?: string }, ack: Ack<NetResult>) => void;
  [NetEvent.GetProgress]: (payload: Record<string, never>, ack: Ack<ProgressResponse>) => void;
  [NetEvent.ClaimSeason]: (payload: { level: number }, ack: Ack<ProgressResponse>) => void;
  [NetEvent.GetSocial]: (payload: Record<string, never>, ack: Ack<SocialResponse>) => void;
  [NetEvent.FriendRequest]: (payload: { code: string }, ack: Ack<NetResult>) => void;
  [NetEvent.FriendRespond]: (payload: { requestId: string; accept: boolean }, ack: Ack<NetResult>) => void;
  [NetEvent.FriendRemove]: (payload: { accountId: string }, ack: Ack<NetResult>) => void;
  [NetEvent.Invite]: (payload: { accountId: string }, ack: Ack<NetResult>) => void;
  [NetEvent.ViewProfile]: (payload: { accountId: string }, ack: Ack<NetResult<{ profile: PublicProfile }>>) => void;
  [NetEvent.Register]: (payload: { username: string; password: string }, ack: Ack<AccountResponse>) => void;
  [NetEvent.Login]: (payload: { username: string; password: string }, ack: Ack<AccountResponse>) => void;
  [NetEvent.GetReplay]: (payload: { matchId?: string }, ack: Ack<NetResult<{ replay: ReplayData }>>) => void;
  [NetEvent.VoiceSignal]: (payload: { to: string; data: VoiceSignalData }) => void;
  [NetEvent.VoiceState]: (payload: { enabled: boolean }) => void;
}

/** Resposta do endpoint HTTP /api/health. */
export interface HealthResponse {
  status: 'ok';
  name: string;
  version: string;
  protocolVersion: number;
  uptimeSeconds: number;
  onlinePlayers: number;
  rooms: number;
  database: DatabaseStatus;
}

export type DatabaseStatus = 'connected' | 'unavailable' | 'disabled';
