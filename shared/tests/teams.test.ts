import { describe, expect, it } from 'vitest';
import { computeTeamDistribution } from '@hh/shared';

describe('computeTeamDistribution', () => {
  it('sala cheia: 24 escondidos e 8 caçadores', () => {
    expect(computeTeamDistribution(32)).toEqual({ hiders: 24, hunters: 8 });
  });

  it('mantém pelo menos 1 jogador em cada equipe', () => {
    expect(computeTeamDistribution(2)).toEqual({ hiders: 1, hunters: 1 });
    expect(computeTeamDistribution(3)).toEqual({ hiders: 2, hunters: 1 });
  });

  it('mantém a proporção de 1 caçador a cada 4 jogadores', () => {
    expect(computeTeamDistribution(8)).toEqual({ hiders: 6, hunters: 2 });
    expect(computeTeamDistribution(16)).toEqual({ hiders: 12, hunters: 4 });
    expect(computeTeamDistribution(10)).toEqual({ hiders: 8, hunters: 2 });
  });

  it('sempre soma o total de jogadores e respeita os limites', () => {
    for (let n = 2; n <= 32; n++) {
      const { hiders, hunters } = computeTeamDistribution(n);
      expect(hiders + hunters).toBe(n);
      expect(hiders).toBeGreaterThanOrEqual(1);
      expect(hunters).toBeGreaterThanOrEqual(1);
      expect(hunters).toBeLessThanOrEqual(hiders);
    }
  });

  it('rejeita quantidades inválidas', () => {
    expect(() => computeTeamDistribution(1)).toThrow(RangeError);
    expect(() => computeTeamDistribution(33)).toThrow(RangeError);
    expect(() => computeTeamDistribution(4.5)).toThrow(RangeError);
  });
});
