import type { MATCH_STATES, TEAMS } from '../constants/game.js';

export type MatchState = (typeof MATCH_STATES)[number];
export type Team = (typeof TEAMS)[number];

/** Dados públicos de um jogador, seguros para enviar a qualquer cliente. */
export interface PublicPlayer {
  id: string;
  nickname: string;
}
