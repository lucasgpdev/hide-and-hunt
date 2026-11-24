import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('usa valores padrão quando as variáveis não existem', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3001);
    expect(config.clientOrigins).toEqual(['http://localhost:5173']);
    expect(config.databaseUrl).toBeUndefined();
  });

  it('aceita várias origens e trata DATABASE_URL vazia como desativada', () => {
    const config = loadConfig({ CLIENT_ORIGIN: 'http://a.com, http://b.com', DATABASE_URL: '  ', PORT: '4000' });
    expect(config.clientOrigins).toEqual(['http://a.com', 'http://b.com']);
    expect(config.databaseUrl).toBeUndefined();
    expect(config.port).toBe(4000);
  });

  it('rejeita valores inválidos com mensagem clara', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Configuração inválida/);
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
