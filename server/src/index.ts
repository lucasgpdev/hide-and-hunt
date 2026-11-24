import dotenv from 'dotenv';
import { GAME_NAME, GAME_VERSION } from '@hh/shared';
import { loadConfig } from './config/env.js';
import { createDatabase } from './database/database.js';
import { runMigrations } from './database/migrations.js';
import { PostgresAccountStore } from './progression/postgresStore.js';
import { ProgressionService } from './progression/ProgressionService.js';
import { MemoryAccountStore, type AccountStore } from './progression/store.js';
import { createLogger } from './logger.js';
import { startGameServer } from './server.js';

/**
 * Ponto de entrada do servidor: carrega a configuração, conecta ao banco
 * (se configurado), inicia o servidor e trata o encerramento gracioso.
 */
async function main() {
  dotenv.config({ quiet: true });
  const config = loadConfig();
  const logger = createLogger(config.logLevel, config.nodeEnv === 'development');
  const database = createDatabase(config.databaseUrl, logger);

  // Progressão: PostgreSQL quando disponível; caso contrário, memória (não persiste).
  let store: AccountStore = new MemoryAccountStore();
  const dbStatus = await database.checkStatus();
  if (dbStatus === 'connected' && database.pool) {
    await runMigrations(database.pool, logger);
    store = new PostgresAccountStore(database.pool);
    logger.info('PostgreSQL conectado. Progressão dos jogadores será salva.');
  } else {
    if (dbStatus === 'unavailable') {
      logger.warn('PostgreSQL configurado mas indisponível. Rode "npm run db:up" para iniciar o banco.');
    }
    logger.warn('Sem banco: perfis, ranking e loja funcionam, mas os dados somem ao reiniciar o servidor.');
  }

  const server = await startGameServer({ config, logger, database, progression: new ProgressionService(store) });
  if (config.adminToken) logger.info('Ferramentas de administração ativas em /api/admin (token exigido).');
  logger.info(`${GAME_NAME} v${GAME_VERSION} ouvindo em http://${config.host}:${server.port()}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Encerrando servidor...');
    const forceExit = setTimeout(() => process.exit(1), 5000);
    forceExit.unref();
    await server.close();
    await database.close();
    logger.info('Servidor encerrado.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Promise rejeitada sem tratamento'));
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar o servidor:', error instanceof Error ? error.message : error);
  process.exit(1);
});
