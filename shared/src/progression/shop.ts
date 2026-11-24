/**
 * Loja de itens cosméticos (itens 13 e 15).
 * Skins mudam apenas a cor do personagem humano: não dão vantagem
 * competitiva, porque o objeto em que o escondido se transforma é idêntico.
 */
export interface SkinItem {
  id: string;
  name: string;
  price: number;
  /** Cor principal do uniforme. */
  color: string;
  /** Cor de detalhe. */
  accent: string;
  /** Nível mínimo para comprar. */
  minLevel: number;
  /** Modelo 3D próprio do visual (padrão: o modelo da equipe). */
  model?: 'robot';
  /** Só pode ser obtido no passe de temporada. */
  seasonOnly?: boolean;
}

export const SKINS: readonly SkinItem[] = [
  { id: 'default', name: 'Padrão', price: 0, color: '#5b6b82', accent: '#d8dde6', minLevel: 1 },
  { id: 'ocean', name: 'Oceano', price: 120, color: '#1f6f8b', accent: '#9be3f5', minLevel: 1 },
  { id: 'forest', name: 'Floresta', price: 160, color: '#3c6e47', accent: '#c4e8a5', minLevel: 1 },
  { id: 'sunset', name: 'Pôr do sol', price: 220, color: '#c0573a', accent: '#ffd08a', minLevel: 2 },
  { id: 'graphite', name: 'Grafite', price: 260, color: '#2b2e34', accent: '#ffb547', minLevel: 2 },
  { id: 'neon', name: 'Neon', price: 400, color: '#5a2ca0', accent: '#5cf2c6', minLevel: 3 },
  { id: 'royal', name: 'Real', price: 600, color: '#2340a8', accent: '#f2d16b', minLevel: 4 },
  { id: 'gold', name: 'Ouro', price: 1000, color: '#a8801f', accent: '#fff2c2', minLevel: 5 },
  { id: 'robot', name: 'Robô expressivo', price: 800, color: '#e3c544', accent: '#2b2e34', minLevel: 3, model: 'robot' },
  { id: 'season_blackout', name: 'Apagão (temporada)', price: 0, color: '#14161b', accent: '#7cf2ff', minLevel: 1, seasonOnly: true },
  { id: 'season_gold', name: 'Lenda (temporada)', price: 0, color: '#e0b33c', accent: '#1b1d22', minLevel: 1, seasonOnly: true },
];

/** Emotes: balão sobre o personagem e, quando o modelo tem, animação. */
export const EMOTES = [
  { id: 'yes', name: 'Sim', icon: '✅', free: true },
  { id: 'no', name: 'Não', icon: '❌', free: true },
  { id: 'wave', name: 'Acenar', icon: '👋', free: false },
  { id: 'dance', name: 'Dançar', icon: '💃', free: false },
  { id: 'thumbs', name: 'Joinha', icon: '👍', free: false },
  { id: 'jump', name: 'Pulo de alegria', icon: '🎉', free: false },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];

export const DEFAULT_SKIN = 'default';

export function getSkin(id: string): SkinItem {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}
