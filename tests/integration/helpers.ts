import { randomBytes, randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import {
  NetEvent,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type HelloResponse,
  type ServerToClientEvents,
} from '@hh/shared';
import { loadConfig } from '../../server/src/config/env.js';
import { createDatabase } from '../../server/src/database/database.js';
import { createLogger } from '../../server/src/logger.js';
import { startGameServer, type GameServer } from '../../server/src/server.js';

export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Inicia um servidor real em uma porta livre, sem banco e sem logs. */
export async function startTestServer(env: Record<string, string> = {}): Promise<{ server: GameServer; url: string }> {
  const config = loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'silent', ...env });
  const logger = createLogger('silent', false);
  const database = createDatabase(undefined, logger);
  const server = await startGameServer({ config, logger, database });
  return { server, url: `http://127.0.0.1:${server.port()}` };
}

/** Conecta um cliente real via WebSocket e aguarda a conexão. */
export async function connectClient(url: string, setup?: (socket: TestClient) => void): Promise<TestClient> {
  const socket: TestClient = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  setup?.(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

export function newAccountToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hello(
  socket: TestClient,
  nickname: string,
  sessionId: string = randomUUID(),
  accountToken: string = newAccountToken(),
): Promise<HelloResponse> {
  return socket
    .timeout(3000)
    .emitWithAck(NetEvent.Hello, { protocolVersion: PROTOCOL_VERSION, nickname, sessionId, accountToken });
}

export function waitFor<T>(predicate: () => T | undefined, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const value = predicate();
      if (value !== undefined) return resolve(value);
      if (Date.now() - started > timeoutMs) return reject(new Error('Tempo esgotado aguardando condição'));
      setTimeout(tick, 20);
    };
    tick();
  });
}
