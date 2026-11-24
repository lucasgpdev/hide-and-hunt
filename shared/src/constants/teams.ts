import { FULL_ROOM_HIDERS, FULL_ROOM_HUNTERS, MAX_PLAYERS_PER_ROOM } from './game.js';

export interface TeamDistribution {
  hiders: number;
  hunters: number;
}

/**
 * Calcula quantos caçadores e escondidos uma sala deve ter.
 *
 * - Sala cheia (32): 24 escondidos e 8 caçadores.
 * - Salas menores mantêm a mesma proporção (1 caçador a cada 4 jogadores),
 *   arredondando para baixo e garantindo pelo menos 1 jogador por equipe.
 * - Com menos de 2 jogadores não é possível formar equipes.
 */
export function computeTeamDistribution(playerCount: number): TeamDistribution {
  if (!Number.isInteger(playerCount) || playerCount < 2) {
    throw new RangeError('São necessários pelo menos 2 jogadores para formar equipes.');
  }
  if (playerCount > MAX_PLAYERS_PER_ROOM) {
    throw new RangeError(`Uma sala aceita no máximo ${MAX_PLAYERS_PER_ROOM} jogadores.`);
  }

  const ratio = FULL_ROOM_HUNTERS / (FULL_ROOM_HIDERS + FULL_ROOM_HUNTERS);
  const hunters = Math.min(playerCount - 1, Math.max(1, Math.floor(playerCount * ratio)));
  return { hunters, hiders: playerCount - hunters };
}
