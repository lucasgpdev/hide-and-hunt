/**
 * Passe de temporada (item 32): níveis com recompensas gratuitas.
 * Sem pagamentos reais. As recompensas são liberadas e validadas no servidor.
 */
export interface SeasonDef {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

/** Temporadas com duração configurável (calendário fixo, UTC). */
export const SEASONS: SeasonDef[] = [
  { id: 's1', name: 'Temporada 1 — Portas Abertas', startsAt: '2026-09-01T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' },
  { id: 's2', name: 'Temporada 2 — Apagão', startsAt: '2027-01-01T00:00:00Z', endsAt: '2027-04-01T00:00:00Z' },
  { id: 's3', name: 'Temporada 3 — Volta às Aulas', startsAt: '2027-04-01T00:00:00Z', endsAt: '2027-07-01T00:00:00Z' },
];

export function currentSeason(date = new Date()): SeasonDef {
  return SEASONS.find((s) => date >= new Date(s.startsAt) && date < new Date(s.endsAt)) ?? SEASONS[SEASONS.length - 1]!;
}

export const SEASON_XP_PER_LEVEL = 500;
export const SEASON_LEVELS = 20;

export type SeasonReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'skin'; skinId: string }
  | { kind: 'effect'; effectId: string; name: string }
  | { kind: 'emote'; emoteId: string; name: string };

/** Recompensa de cada nível (1..20). */
export const SEASON_REWARDS: SeasonReward[] = Array.from({ length: SEASON_LEVELS }, (_, i): SeasonReward => {
  const level = i + 1;
  if (level === 5) return { kind: 'effect', effectId: 'confetti', name: 'Transformação: confete' };
  if (level === 10) return { kind: 'skin', skinId: 'season_blackout' };
  if (level === 15) return { kind: 'effect', effectId: 'sparks', name: 'Transformação: faíscas' };
  if (level === 20) return { kind: 'skin', skinId: 'season_gold' };
  if (level % 4 === 0) return { kind: 'emote', emoteId: level === 4 ? 'dance' : level === 8 ? 'wave' : level === 12 ? 'thumbs' : 'jump', name: 'Emote' };
  return { kind: 'coins', amount: 50 + level * 10 };
});

export function seasonLevel(seasonXp: number): number {
  return Math.min(SEASON_LEVELS, Math.floor(seasonXp / SEASON_XP_PER_LEVEL));
}

export const TRANSFORM_EFFECTS = [
  { id: 'smoke', name: 'Fumaça (padrão)' },
  { id: 'confetti', name: 'Confete' },
  { id: 'sparks', name: 'Faíscas' },
] as const;

export interface SeasonStatus {
  season: SeasonDef;
  seasonXp: number;
  level: number;
  claimed: number[];
  rewards: SeasonReward[];
  history: { seasonId: string; level: number }[];
}
