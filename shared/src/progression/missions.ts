import type { MatchFacts } from './achievements.js';

/**
 * Missões diárias e semanais (item 33). A seleção é determinística pela
 * data (todo mundo recebe as mesmas no mesmo dia) e o progresso é calculado
 * só pelo servidor a partir dos resultados das partidas.
 */
export type MissionPeriod = 'daily' | 'weekly';

export interface MissionDef {
  id: string;
  period: MissionPeriod;
  description: string;
  goal: number;
  rewardCoins: number;
  rewardSeasonXp: number;
  /** Quanto a partida contribui para o objetivo. */
  progress: (match: MatchFacts & { mapId: string }) => number;
}

const POOL: MissionDef[] = [
  { id: 'd_play3', period: 'daily', description: 'Participe de 3 partidas', goal: 3, rewardCoins: 40, rewardSeasonXp: 100, progress: () => 1 },
  { id: 'd_win1', period: 'daily', description: 'Vença 1 partida', goal: 1, rewardCoins: 50, rewardSeasonXp: 120, progress: (m) => (m.won ? 1 : 0) },
  { id: 'd_capture3', period: 'daily', description: 'Faça 3 capturas', goal: 3, rewardCoins: 60, rewardSeasonXp: 140, progress: (m) => m.captures },
  { id: 'd_survive120', period: 'daily', description: 'Sobreviva 2 minutos como escondido', goal: 120, rewardCoins: 50, rewardSeasonXp: 120, progress: (m) => (m.team === 'HIDERS' ? m.survivalSeconds : 0) },
  { id: 'd_transform5', period: 'daily', description: 'Transforme-se 5 vezes', goal: 5, rewardCoins: 40, rewardSeasonXp: 100, progress: (m) => m.transforms },
  { id: 'd_abilities4', period: 'daily', description: 'Use 4 habilidades', goal: 4, rewardCoins: 40, rewardSeasonXp: 100, progress: (m) => m.usedAbilities },
  { id: 'd_senai', period: 'daily', description: 'Jogue 2 partidas na Escola', goal: 2, rewardCoins: 45, rewardSeasonXp: 110, progress: (m) => (m.mapId === 'big_school' ? 1 : 0) },
  { id: 'd_market', period: 'daily', description: 'Jogue 2 partidas na Casa Grande', goal: 2, rewardCoins: 45, rewardSeasonXp: 110, progress: (m) => (m.mapId === 'big_house' ? 1 : 0) },
  { id: 'w_win_hider', period: 'weekly', description: 'Vença 5 partidas como escondido', goal: 5, rewardCoins: 200, rewardSeasonXp: 500, progress: (m) => (m.won && m.team === 'HIDERS' ? 1 : 0) },
  { id: 'w_win_hunter', period: 'weekly', description: 'Vença 5 partidas como caçador', goal: 5, rewardCoins: 200, rewardSeasonXp: 500, progress: (m) => (m.won && m.team === 'HUNTERS' ? 1 : 0) },
  { id: 'w_capture20', period: 'weekly', description: 'Faça 20 capturas', goal: 20, rewardCoins: 250, rewardSeasonXp: 600, progress: (m) => m.captures },
  { id: 'w_play15', period: 'weekly', description: 'Participe de 15 partidas', goal: 15, rewardCoins: 220, rewardSeasonXp: 550, progress: () => 1 },
  { id: 'w_survive600', period: 'weekly', description: 'Sobreviva 10 minutos no total', goal: 600, rewardCoins: 220, rewardSeasonXp: 550, progress: (m) => (m.team === 'HIDERS' ? m.survivalSeconds : 0) },
  { id: 'w_modes', period: 'weekly', description: 'Jogue 3 partidas fora do modo Clássico', goal: 3, rewardCoins: 180, rewardSeasonXp: 450, progress: (m) => (m.mode !== 'classic' ? 1 : 0) },
];

export function getMissionDef(id: string): MissionDef | undefined {
  return POOL.find((m) => m.id === id);
}

/** Identificador do período: dia (AAAA-MM-DD) ou semana (AAAA-Wnn), em UTC. */
export function periodKey(period: MissionPeriod, date = new Date()): string {
  if (period === 'daily') return date.toISOString().slice(0, 10);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.floor((date.getTime() - start) / (7 * 86400000)) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function periodEnd(period: MissionPeriod, date = new Date()): Date {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  if (period === 'daily') return end;
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.floor((date.getTime() - start) / (7 * 86400000)) + 1;
  return new Date(start + week * 7 * 86400000);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Missões ativas no período (3 diárias e 3 semanais). */
export function activeMissions(period: MissionPeriod, date = new Date()): MissionDef[] {
  const key = periodKey(period, date);
  return POOL.filter((m) => m.period === period)
    .map((m) => ({ m, order: hash(`${key}:${m.id}`) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((x) => x.m);
}

export interface MissionStatus {
  id: string;
  period: MissionPeriod;
  description: string;
  goal: number;
  progress: number;
  completed: boolean;
  rewardCoins: number;
  rewardSeasonXp: number;
  endsAt: string;
}
