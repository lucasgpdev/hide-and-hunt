import { defineConfig } from 'vitest/config';

/**
 * Configuração única de testes para o monorepo.
 * A condição "source" faz o pacote @hh/shared ser resolvido direto do
 * código TypeScript, sem precisar compilar antes de testar.
 */
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
      externalConditions: ['source'],
    },
  },
  test: {
    include: ['shared/tests/**/*.test.ts', 'server/tests/**/*.test.ts', 'client/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    reporters: ['default'],
  },
});
