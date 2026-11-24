import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { BALANCE, NetEvent, PLAYABLE_MAP_IDS, STATS_BROADCAST_INTERVAL_MS, type ServerStats } from '@hh/shared';
import { createApp } from './app.js';
import type { ServerConfig } from './config/env.js';
import type { Database } from './database/database.js';
import { createRoomPhysics, initPhysics } from './game/physics.js';
import type { Logger } from './logger.js';
import { handleConnection } from './networking/connectionHandler.js';
import { MAX_MESSAGE_BYTES } from './networking/policy.js';
import type { GameIO } from './networking/types.js';
import { PlayerRegistry } from './players/PlayerRegistry.js';
import { ProgressionService } from './progression/ProgressionService.js';
import { MemoryAccountStore } from './progression/store.js';
import { RoomManager } from './rooms/RoomManager.js';

export interface GameServer {
  httpServer: HttpServer;
  io: GameIO;
  players: PlayerRegistry;
  rooms: RoomManager;
  /** Porta real em uso (útil quando a porta configurada é 0). */
  port(): number;
  close(): Promise<void>;
}

export interface GameServerDeps {
  config: ServerConfig;
  logger: Logger;
  database: Database;
  progression?: ProgressionService;
}

/**
 * Monta e inicia o servidor HTTP + Socket.IO.
 * Separado do index.ts para que os testes possam criar servidores isolados.
 */
export async function startGameServer({ config, logger, database, progression }: GameServerDeps): Promise<GameServer> {
  const startedAt = Date.now();
  const players = new PlayerRegistry();
  const service = progression ?? new ProgressionService(new MemoryAccountStore());

  // Física: carrega o Rapier e confere que todos os mapas jogáveis montam sem erro.
  await initPhysics();
  for (const mapId of PLAYABLE_MAP_IDS) createRoomPhysics(mapId).world.free();

  const app = createApp({
    clientOrigins: config.clientOrigins,
    database,
    getOnlinePlayers: () => players.count,
    getRoomCount: () => rooms.rooms.size,
    startedAt,
    adminToken: config.adminToken,
    admin: {
      rooms: () =>
        [...rooms.rooms.values()].map((r) => ({
          code: r.code,
          mode: r.mode,
          state: r.state,
          mapId: r.mapId,
          isPrivate: r.isPrivate,
          players: [...r.players.values()].map((p) => ({ id: p.id, accountId: p.accountId, nickname: p.nickname, team: p.team, connected: p.connected, rejectedMoves: p.rejectedMoves })),
        })),
      reports: () => service.listReports(100),
      kick: (playerId: string) => rooms.kick(playerId),
      ban: async (accountId: string, banned: boolean) => {
        const ok = await service.setBanned(accountId, banned);
        if (ok && banned) {
          for (const p of players.byAccount(accountId)) {
            rooms.kick(p.id);
            if (p.socketId) io.sockets.sockets.get(p.socketId)?.disconnect(true);
          }
        }
        return ok;
      },
    },
    clientDist: config.clientDist,
  });
  const httpServer = createServer(app);

  const io: GameIO = new Server(httpServer, {
    cors: { origin: config.clientOrigins },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const rooms = new RoomManager({
    io,
    progression: service,
    logger,
    allowDuplicateAccounts: config.nodeEnv !== 'production',
    publicMinPlayers: config.publicMinPlayers,
  });
  rooms.start();

  const buildStats = (): ServerStats => ({
    onlinePlayers: players.count,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    rooms: rooms.rooms.size,
  });

  // Agrupa várias mudanças seguidas em um único envio.
  let statsScheduled = false;
  const broadcastStats = () => {
    if (statsScheduled) return;
    statsScheduled = true;
    setImmediate(() => {
      statsScheduled = false;
      io.emit(NetEvent.Stats, buildStats());
    });
  };

  io.on('connection', (socket) => {
    handleConnection(socket, {
      io,
      players,
      rooms,
      progression: service,
      logger,
      maxConnections: config.maxConnections,
      presence: (accountId) => {
        const sessions = players.byAccount(accountId);
        const room = sessions.map((p) => rooms.roomOf(p.id)).find(Boolean);
        return { online: sessions.length > 0, roomCode: room?.code ?? null };
      },
      onPlayersChanged: broadcastStats,
    });
  });

  const statsTimer = setInterval(broadcastStats, STATS_BROADCAST_INTERVAL_MS);
  // Sessões caídas são esquecidas depois do tempo de reconexão.
  const purgeTimer = setInterval(
    () => players.purge((BALANCE.rooms.reconnectGraceSeconds + 5) * 1000),
    10_000,
  );

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  return {
    httpServer,
    io,
    players,
    rooms,
    port: () => (httpServer.address() as AddressInfo).port,
    async close() {
      clearInterval(statsTimer);
      clearInterval(purgeTimer);
      rooms.stop();
      // io.close() também fecha o servidor HTTP.
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
