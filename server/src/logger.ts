import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * Cria o logger do servidor.
 * Em desenvolvimento usa saída legível (pino-pretty); em produção, JSON.
 */
export function createLogger(level: string, pretty: boolean): Logger {
  if (pretty) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    });
  }
  return pino({ level });
}
