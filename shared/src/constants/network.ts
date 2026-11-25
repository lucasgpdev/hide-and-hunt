/**
 * Constantes de rede compartilhadas.
 */

/** Atualizações de estado por segundo enviadas pelo servidor (item 4). */
export const SERVER_TICK_RATE = 30;

/** Intervalo entre medições de latência feitas pelo cliente. */
export const PING_INTERVAL_MS = 2000;

/** Intervalo de envio das estatísticas do servidor para os clientes. */
export const STATS_BROADCAST_INTERVAL_MS = 5000;

/** Nomes de todos os eventos de rede. Centralizados para evitar erros de digitação. */
export const NetEvent = {
  // Cliente -> Servidor
  Hello: 'session:hello',
  Ping: 'net:ping',
  QuickJoin: 'room:quickJoin',
  CreateRoom: 'room:create',
  JoinRoom: 'room:join',
  LeaveRoom: 'room:leave',
  UpdateSettings: 'room:settings',
  StartMatch: 'room:start',
  VoteMap: 'room:vote',
  Move: 'player:move',
  Transform: 'player:transform',
  Capture: 'player:capture',
  GetProfile: 'profile:get',
  GetRanking: 'ranking:get',
  BuySkin: 'shop:buy',
  EquipSkin: 'shop:equip',
  EquipEffect: 'shop:equipEffect',
  Ability: 'player:ability',
  Interact: 'player:interact',
  Shove: 'player:shove',
  Emote: 'player:emote',
  Ping2: 'player:ping',
  Report: 'room:report',
  GetProgress: 'progress:get',
  ClaimSeason: 'season:claim',
  GetSocial: 'social:get',
  FriendRequest: 'social:request',
  FriendRespond: 'social:respond',
  FriendRemove: 'social:remove',
  Invite: 'social:invite',
  ViewProfile: 'profile:view',
  Register: 'account:register',
  Login: 'account:login',
  GetReplay: 'replay:get',
  VoiceSignal: 'voice:signal',
  VoiceState: 'voice:state',
  // Servidor -> Cliente
  Stats: 'server:stats',
  Error: 'server:error',
  RoomState: 'room:state',
  Snapshot: 'room:snapshot',
  Feed: 'room:feed',
  Teleport: 'player:teleport',
  Results: 'match:results',
  Abilities: 'player:abilities',
  Effect: 'room:effect',
  InviteReceived: 'social:invited',
  SocialChanged: 'social:changed',
  VoicePeers: 'voice:peers',
} as const;

/** Códigos de erro que o servidor pode devolver. */
export const ErrorCode = {
  InvalidPayload: 'INVALID_PAYLOAD',
  ProtocolMismatch: 'PROTOCOL_MISMATCH',
  RateLimited: 'RATE_LIMITED',
  NotIdentified: 'NOT_IDENTIFIED',
  AlreadyIdentified: 'ALREADY_IDENTIFIED',
  SessionReplaced: 'SESSION_REPLACED',
  ServerFull: 'SERVER_FULL',
  RoomNotFound: 'ROOM_NOT_FOUND',
  RoomFull: 'ROOM_FULL',
  NotInRoom: 'NOT_IN_ROOM',
  AlreadyInRoom: 'ALREADY_IN_ROOM',
  NotHost: 'NOT_HOST',
  InvalidAction: 'INVALID_ACTION',
  Cooldown: 'COOLDOWN',
  NotEnoughCoins: 'NOT_ENOUGH_COINS',
  Banned: 'BANNED',
  Penalized: 'PENALIZED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
