/**
 * Constantes gerais do jogo.
 * Valores de equilíbrio (velocidades, recargas etc.) ficarão em balance.ts
 * para que possam ser ajustados em um único lugar (item 38 do planejamento).
 */

export const GAME_NAME = 'HIDE & HUNT';

/** Versão do jogo exibida para os jogadores. */
export const GAME_VERSION = '0.3.0';

/**
 * Versão do protocolo de rede. Deve ser incrementada sempre que uma mensagem
 * mudar de formato. Cliente e servidor com versões diferentes não se conectam.
 */
export const PROTOCOL_VERSION = 3;

/** Capacidade máxima de uma sala. */
export const MAX_PLAYERS_PER_ROOM = 32;

/** Distribuição de equipes com a sala cheia. */
export const FULL_ROOM_HIDERS = 24;
export const FULL_ROOM_HUNTERS = 8;

/** Mínimo de jogadores para iniciar uma partida (1 por equipe). */
export const MIN_PLAYERS_TO_START = 2;

/** Durações padrão das fases da partida, em segundos (item 7). */
export const DEFAULT_MATCH_TIMINGS = {
  preparationSeconds: 30,
  hidingSeconds: 45,
  huntingSeconds: 300,
  intermissionSeconds: 15,
} as const;

/** Estados da partida controlados pelo servidor. */
export const MATCH_STATES = ['WAITING', 'COUNTDOWN', 'HIDING', 'HUNTING', 'FINISHED'] as const;

export const TEAMS = ['HIDERS', 'HUNTERS'] as const;

/** Regras do nome de jogador. */
export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 16;
