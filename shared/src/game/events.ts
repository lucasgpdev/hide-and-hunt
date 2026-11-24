/**
 * Eventos aleatórios e ambiente (itens 9, 22 e 35), sincronizados pelo servidor.
 */
export const RANDOM_EVENTS = ['blackout', 'flicker', 'alarm', 'dim', 'doors', 'storm'] as const;
export type RandomEventType = (typeof RANDOM_EVENTS)[number];

export const EVENT_INFO: Record<RandomEventType, { name: string; message: string; durationSeconds: number }> = {
  blackout: { name: 'Apagão', message: 'Apagão! Só as lanternas funcionam.', durationSeconds: 8 },
  flicker: { name: 'Luzes piscando', message: 'As luzes estão falhando...', durationSeconds: 6 },
  alarm: { name: 'Alarme', message: 'O alarme disparou!', durationSeconds: 6 },
  dim: { name: 'Meia-luz', message: 'A iluminação diminuiu.', durationSeconds: 20 },
  doors: { name: 'Portas', message: 'As portas se mexeram sozinhas!', durationSeconds: 1 },
  storm: { name: 'Tempestade', message: 'Uma tempestade começou lá fora.', durationSeconds: 25 },
};

/** Intervalo entre eventos (s): normal e modo Caos. Limita o impacto na jogabilidade. */
export const EVENT_INTERVAL = {
  normal: [55, 90] as const,
  chaos: [15, 25] as const,
  /** Sem eventos nos últimos segundos da caçada. */
  quietEndSeconds: 20,
};

export const LIGHTING_PRESETS = ['day', 'evening', 'night'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];
export const WEATHER_TYPES = ['clear', 'rain', 'fog'] as const;
export type Weather = (typeof WEATHER_TYPES)[number];

export interface Ambience {
  lighting: LightingPreset;
  weather: Weather;
}
