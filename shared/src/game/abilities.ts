import type { Team } from '../types/game.js';

/**
 * Habilidades por equipe (itens 29 e 36). Todas têm recarga, duração e
 * limite de usos; o servidor valida cada uso. Nenhuma é permanente.
 */
export const ABILITY_IDS = ['decoy', 'whistle', 'camouflage', 'dash', 'radar', 'scanner', 'analyzer'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

export interface AbilityDef {
  id: AbilityId;
  name: string;
  description: string;
  team: Team;
  /** Tecla (1 a 4). */
  slot: number;
  cooldownSeconds: number;
  durationSeconds: number;
  usesPerMatch: number;
  /** Só funciona transformado em objeto. */
  requiresDisguise?: boolean;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  decoy: {
    id: 'decoy',
    name: 'Clone falso',
    description: 'Deixa uma cópia do objeto em que você está. Capturar a cópia faz o caçador perder tempo.',
    team: 'HIDERS',
    slot: 1,
    cooldownSeconds: 25,
    durationSeconds: 30,
    usesPerMatch: 2,
    requiresDisguise: true,
  },
  whistle: {
    id: 'whistle',
    name: 'Distração sonora',
    description: 'Faz um barulho a até 10 m na direção em que você mira.',
    team: 'HIDERS',
    slot: 2,
    cooldownSeconds: 15,
    durationSeconds: 2,
    usesPerMatch: 5,
  },
  camouflage: {
    id: 'camouflage',
    name: 'Camuflagem',
    description: 'Some da vista dos caçadores por alguns segundos.',
    team: 'HIDERS',
    slot: 3,
    cooldownSeconds: 45,
    durationSeconds: 4,
    usesPerMatch: 2,
    requiresDisguise: true,
  },
  dash: {
    id: 'dash',
    name: 'Arrancada',
    description: 'Corre 70% mais rápido por um instante.',
    team: 'HIDERS',
    slot: 4,
    cooldownSeconds: 20,
    durationSeconds: 1.6,
    usesPerMatch: 6,
  },
  radar: {
    id: 'radar',
    name: 'Radar',
    description: 'Mostra a posição aproximada de escondidos a até 18 m, sem precisão.',
    team: 'HUNTERS',
    slot: 1,
    cooldownSeconds: 30,
    durationSeconds: 3,
    usesPerMatch: 4,
  },
  scanner: {
    id: 'scanner',
    name: 'Scanner de movimento',
    description: 'Detecta escondidos que se moveram nos últimos 3 segundos a até 14 m.',
    team: 'HUNTERS',
    slot: 2,
    cooldownSeconds: 25,
    durationSeconds: 3,
    usesPerMatch: 5,
  },
  analyzer: {
    id: 'analyzer',
    name: 'Analisador',
    description: 'Analisa o objeto mirado (até 6 m). Acerta na maioria das vezes, mas não sempre.',
    team: 'HUNTERS',
    slot: 3,
    cooldownSeconds: 18,
    durationSeconds: 0,
    usesPerMatch: 4,
  },
};

export function abilitiesFor(team: Team | null): AbilityDef[] {
  return Object.values(ABILITIES).filter((a) => a.team === team).sort((a, b) => a.slot - b.slot);
}

/** Estado das habilidades de um jogador (enviado só para ele). */
export interface AbilityState {
  id: AbilityId;
  usesLeft: number;
  /** Hora do servidor em que fica pronta. */
  readyAt: number;
  /** Hora do servidor em que o efeito termina (0 = inativa). */
  activeUntil: number;
}
