import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@hh/shared';
import type { SocketRateLimiter } from '../security/rateLimiter.js';

/** Dados mantidos pelo servidor para cada conexão. */
export interface SocketData {
  playerId: string | undefined;
  accountId: string | undefined;
  nickname: string;
  skin: string;
  level: number;
  effect: string;
  rating: number;
  reputation: number;
  /** Chat de voz ligado nesta conexão. */
  voice: boolean;
  rateLimiter: SocketRateLimiter;
  /** Quantas mensagens foram bloqueadas ou rejeitadas nesta conexão. */
  violations: number;
}

/** Eventos entre instâncias do servidor (usado no futuro com Redis). */
export interface InterServerEvents {}

export type GameIO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
