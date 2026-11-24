import { describe, expect, it } from 'vitest';
import { PlayerRegistry, toPublicPlayer } from '../src/players/PlayerRegistry.js';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';

describe('PlayerRegistry', () => {
  it('registra jogadores com ids únicos', () => {
    const registry = new PlayerRegistry();
    const a = registry.register(SESSION_A, 'sock-a', 'Ana', 'acc-a');
    const b = registry.register(SESSION_B, 'sock-b', 'Bruno', 'acc-b');
    expect(a.player.id).not.toBe(b.player.id);
    expect(registry.count).toBe(2);
  });

  it('não duplica a mesma sessão e informa o socket substituído', () => {
    const registry = new PlayerRegistry();
    const first = registry.register(SESSION_A, 'sock-1', 'Ana', 'acc-a');
    const second = registry.register(SESSION_A, 'sock-2', 'Ana', 'acc-a');
    expect(registry.count).toBe(1);
    expect(second.player.id).toBe(first.player.id);
    expect(second.replacedSocketId).toBe('sock-1');
    expect(registry.getBySocket('sock-1')).toBeUndefined();
  });

  it('mantém o mesmo id ao reconectar depois de cair', () => {
    const registry = new PlayerRegistry();
    const first = registry.register(SESSION_A, 'sock-1', 'Ana', 'acc-a');
    registry.disconnect('sock-1', 1000);
    expect(registry.count).toBe(0);
    const again = registry.register(SESSION_A, 'sock-2', 'Ana', 'acc-a');
    expect(again.player.id).toBe(first.player.id);
    expect(again.resumed).toBe(true);
  });

  it('esquece sessões caídas há muito tempo', () => {
    const registry = new PlayerRegistry();
    const first = registry.register(SESSION_A, 'sock-1', 'Ana', 'acc-a');
    registry.disconnect('sock-1', 1000);
    expect(registry.purge(5000, 3000)).toEqual([]);
    expect(registry.purge(5000, 7000)).toEqual([first.player.id]);
    const again = registry.register(SESSION_A, 'sock-2', 'Ana', 'acc-a');
    expect(again.player.id).not.toBe(first.player.id);
  });

  it('a versão pública não expõe sessão, conta nem socket', () => {
    const registry = new PlayerRegistry();
    const { player } = registry.register(SESSION_A, 'sock-1', 'Ana', 'acc-a');
    expect(Object.keys(toPublicPlayer(player)).sort()).toEqual(['id', 'nickname']);
  });
});
