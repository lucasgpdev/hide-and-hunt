import pg from 'pg';
import type { DatabaseStatus } from '@hh/shared';
import type { Logger } from '../logger.js';

/**
 * Acesso ao PostgreSQL.
 *
 * Na FASE 1 o banco é opcional: sem DATABASE_URL o servidor continua
 * funcionando e o status aparece como "disabled". O esquema de tabelas
 * (jogadores, progressão, partidas) será criado na FASE 10.
 */
export interface Database {
  /** Verifica a conexão executando uma consulta simples. */
  checkStatus(): Promise<DatabaseStatus>;
  /** Pool para consultas (undefined quando o banco está desativado). */
  readonly pool: pg.Pool | undefined;
  close(): Promise<void>;
}

export function createDatabase(url: string | undefined, logger: Logger): Database {
  if (!url) {
    logger.warn('DATABASE_URL não definida: servidor rodando sem banco de dados.');
    return {
      pool: undefined,
      checkStatus: async () => 'disabled',
      close: async () => {},
    };
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
  });

  // Sem este handler, um erro em uma conexão ociosa derrubaria o processo.
  pool.on('error', (error) => logger.error({ err: error }, 'Erro em conexão ociosa do PostgreSQL'));

  return {
    pool,
    async checkStatus() {
      try {
        await pool.query('SELECT 1');
        return 'connected';
      } catch (error) {
        logger.debug({ err: error }, 'PostgreSQL indisponível');
        return 'unavailable';
      }
    },
    async close() {
      await pool.end();
    },
  };
}
