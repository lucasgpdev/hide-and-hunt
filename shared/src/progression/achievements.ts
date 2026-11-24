import type { PlayerStats } from '../types/room.js';

/**
 * Conquistas (item 14). Avaliadas pelo servidor ao fim de cada partida a
 * partir das estatísticas acumuladas e do resultado da partida.
 */
export interface MatchFacts {
  won: boolean;
  team: 'HIDERS' | 'HUNTERS';
  captures: number;
  survived: boolean;
  survivalSeconds: number;
  mode: string;
  usedAbilities: number;
  transforms: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  reward: number;
  check: (stats: PlayerStats, match: MatchFacts) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_match', name: 'Primeira partida', description: 'Termine sua primeira partida.', reward: 50, check: (s) => s.matchesPlayed >= 1 },
  { id: 'first_win', name: 'Primeira vitória', description: 'Vença uma partida.', reward: 75, check: (s) => s.winsHider + s.winsHunter >= 1 },
  { id: 'first_capture', name: 'Te peguei!', description: 'Capture um escondido.', reward: 50, check: (s) => s.captures >= 1 },
  { id: 'survivor', name: 'Sobrevivente', description: 'Sobreviva até o fim de uma partida.', reward: 75, check: (_s, m) => m.team === 'HIDERS' && m.survived },
  { id: 'hunter_10', name: 'Caçador nato', description: 'Faça 10 capturas no total.', reward: 150, check: (s) => s.captures >= 10 },
  { id: 'hunter_50', name: 'Faro apurado', description: 'Faça 50 capturas no total.', reward: 400, check: (s) => s.captures >= 50 },
  { id: 'triple', name: 'Triplo', description: 'Capture 3 escondidos na mesma partida.', reward: 120, check: (_s, m) => m.captures >= 3 },
  { id: 'chameleon', name: 'Camaleão', description: 'Transforme-se 5 vezes numa partida.', reward: 80, check: (_s, m) => m.transforms >= 5 },
  { id: 'tactician', name: 'Tático', description: 'Use 4 habilidades numa partida.', reward: 80, check: (_s, m) => m.usedAbilities >= 4 },
  { id: 'veteran_10', name: 'Veterano', description: 'Jogue 10 partidas.', reward: 120, check: (s) => s.matchesPlayed >= 10 },
  { id: 'veteran_50', name: 'Lenda do esconde-esconde', description: 'Jogue 50 partidas.', reward: 500, check: (s) => s.matchesPlayed >= 50 },
  { id: 'patient', name: 'Paciência de estátua', description: 'Acumule 30 minutos sobrevivendo.', reward: 200, check: (s) => s.survivalSeconds >= 1800 },
  { id: 'infected', name: 'Paciente zero', description: 'Vença uma partida no modo Infecção.', reward: 100, check: (_s, m) => m.mode === 'infection' && m.won },
  { id: 'lone_wolf', name: 'Lobo solitário', description: 'Vença como o caçador solitário.', reward: 150, check: (_s, m) => m.mode === 'lone_hunter' && m.won && m.team === 'HUNTERS' },
];

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;
}
