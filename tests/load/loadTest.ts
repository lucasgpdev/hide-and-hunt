/**
 * Teste de carga (item 23): simula 2, 8, 16 e 32 conexões reais na mesma
 * sala, cada uma enviando posição 20 vezes por segundo, e mede:
 *   - snapshots recebidos por segundo por cliente (alvo: ~15)
 *   - latência de ida e volta (ping)
 *   - atraso do laço de eventos do processo
 *   - movimentos recusados pelo servidor
 *
 * Uso: npm run test:load            (todas as quantidades)
 *      npm run test:load -- 32 20   (32 conexões por 20 segundos)
 *
 * Observação: servidor e clientes rodam no MESMO processo, então os números
 * são pessimistas (os clientes simulados também consomem CPU).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { io as connect, type Socket } from 'socket.io-client';
import {
  NetEvent,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type TeleportMessage,
} from '@hh/shared';
import { loadConfig } from '../../server/src/config/env.js';
import { createDatabase } from '../../server/src/database/database.js';
import { createLogger } from '../../server/src/logger.js';
import { startGameServer } from '../../server/src/server.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Result {
  connections: number;
  joinMs: number;
  snapshotsPerSecond: number;
  snapshotBytes: number;
  pingAvg: number;
  pingP95: number;
  loopLagP99: number;
  rejectedMoves: number;
}

async function run(connections: number, seconds: number): Promise<Result> {
  const logger = createLogger('silent', false);
  const config = loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'silent', PUBLIC_MIN_PLAYERS: '32' });
  const server = await startGameServer({ config, logger, database: createDatabase(undefined, logger) });
  const url = `http://127.0.0.1:${server.port()}`;

  const started = performance.now();
  const clients: { socket: Client; teleport: TeleportMessage | null; snapshots: number; bytes: number }[] = [];
  let code = '';
  for (let i = 0; i < connections; i++) {
    const socket: Client = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const entry = { socket, teleport: null as TeleportMessage | null, snapshots: 0, bytes: 0 };
    socket.on(NetEvent.Teleport, (t) => (entry.teleport = t));
    socket.on(NetEvent.Snapshot, (s) => {
      entry.snapshots += 1;
      entry.bytes += JSON.stringify(s).length;
    });
    const hello = await socket.timeout(5000).emitWithAck(NetEvent.Hello, {
      protocolVersion: PROTOCOL_VERSION,
      nickname: `Bot ${i + 1}`,
      sessionId: randomUUID(),
      accountToken: randomBytes(32).toString('base64url'),
    });
    if (!hello.ok) throw new Error(hello.error.message);
    const joined =
      i === 0
        ? await socket.timeout(5000).emitWithAck(NetEvent.CreateRoom, { settings: { maxPlayers: 32 } })
        : await socket.timeout(5000).emitWithAck(NetEvent.JoinRoom, { code });
    if (!joined.ok) throw new Error(joined.error.message);
    code = joined.room.code;
    clients.push(entry);
  }
  const joinMs = (performance.now() - started) / connections;

  // Medição
  for (const c of clients) {
    c.snapshots = 0;
    c.bytes = 0;
  }
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const pings: number[] = [];
  let tick = 0;
  const moveTimer = setInterval(() => {
    tick += 1;
    for (const c of clients) {
      if (!c.teleport) continue;
      const [x, y, z] = c.teleport.position;
      const offset = Math.sin(tick / 4) * 0.4;
      c.socket.emit(NetEvent.Move, { tid: c.teleport.teleportId, p: [x + offset, y, z], yaw: 0, f: 5 });
    }
  }, 50);
  const pingTimer = setInterval(() => {
    for (const c of clients.slice(0, 8)) {
      const sent = performance.now();
      void c.socket
        .timeout(5000)
        .emitWithAck(NetEvent.Ping, { clientTime: Date.now() })
        .then(() => pings.push(performance.now() - sent))
        .catch(() => {});
    }
  }, 1000);

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  clearInterval(moveTimer);
  clearInterval(pingTimer);
  lag.disable();

  const room = server.rooms.rooms.get(code);
  const rejectedMoves = room ? [...room.players.values()].reduce((sum, p) => sum + p.rejectedMoves, 0) : -1;
  const totalSnapshots = clients.reduce((sum, c) => sum + c.snapshots, 0);
  const totalBytes = clients.reduce((sum, c) => sum + c.bytes, 0);
  pings.sort((a, b) => a - b);

  for (const c of clients) c.socket.disconnect();
  await server.close();

  return {
    connections,
    joinMs: Math.round(joinMs),
    snapshotsPerSecond: Number((totalSnapshots / connections / seconds).toFixed(1)),
    snapshotBytes: Math.round(totalBytes / Math.max(1, totalSnapshots)),
    pingAvg: Number((pings.reduce((a, b) => a + b, 0) / Math.max(1, pings.length)).toFixed(1)),
    pingP95: Number((pings[Math.floor(pings.length * 0.95)] ?? 0).toFixed(1)),
    loopLagP99: Number((lag.percentile(99) / 1e6).toFixed(1)),
    rejectedMoves,
  };
}

const [countArg, secondsArg] = process.argv.slice(2);
const counts = countArg ? [Number(countArg)] : [2, 8, 16, 32];
const seconds = secondsArg ? Number(secondsArg) : 10;
const results: Result[] = [];
for (const count of counts) {
  process.stdout.write(`Simulando ${count} conexões por ${seconds}s... `);
  const result = await run(count, seconds);
  results.push(result);
  console.log('ok');
}
console.table(
  results.map((r) => ({
    Conexões: r.connections,
    'Entrar (ms/jogador)': r.joinMs,
    'Snapshots/s por cliente': r.snapshotsPerSecond,
    'Bytes por snapshot': r.snapshotBytes,
    'Ping médio (ms)': r.pingAvg,
    'Ping p95 (ms)': r.pingP95,
    'Atraso do laço p99 (ms)': r.loopLagP99,
    'Movimentos recusados': r.rejectedMoves,
  })),
);
process.exit(0);
