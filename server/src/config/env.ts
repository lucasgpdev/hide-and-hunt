import { z } from 'zod';

/**
 * Configuração do servidor lida das variáveis de ambiente e validada com Zod.
 * Valores inválidos impedem o servidor de iniciar, com uma mensagem clara.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  /** Origens autorizadas a abrir conexões (separadas por vírgula). */
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  /** URL do PostgreSQL. Se vazia, o servidor funciona sem banco. */
  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Limite global de conexões simultâneas no processo. */
  MAX_CONNECTIONS: z.coerce.number().int().positive().default(500),
  /** Jogadores necessários para uma sala pública começar sozinha. */
  PUBLIC_MIN_PLAYERS: z.coerce.number().int().min(2).max(32).default(2),
  /** Token das ferramentas de administração (vazio = desativadas). Mínimo de 24 caracteres. */
  ADMIN_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length >= 24 ? v.trim() : undefined)),
  /** Pasta do cliente compilado para o servidor entregar junto (produção em um só serviço). */
  CLIENT_DIST: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
});

export type ServerConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  clientOrigins: string[];
  databaseUrl: string | undefined;
  logLevel: string;
  maxConnections: number;
  publicMinPlayers: number;
  adminToken: string | undefined;
  clientDist: string | undefined;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuração inválida no .env:\n${details}`);
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    clientOrigins: env.CLIENT_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    maxConnections: env.MAX_CONNECTIONS,
    publicMinPlayers: env.PUBLIC_MIN_PLAYERS,
    adminToken: env.ADMIN_TOKEN,
    clientDist: env.CLIENT_DIST,
  };
}
