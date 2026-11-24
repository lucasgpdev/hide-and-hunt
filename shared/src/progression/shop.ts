/**
 * Loja de itens cosméticos (itens 13 e 15).
 * Skins mudam só a aparência do personagem humano: não dão vantagem
 * competitiva, porque o objeto em que o escondido se transforma é idêntico.
 */

/** Roupas realistas disponíveis (pacotes CC0 do Quaternius). */
export type OutfitLook = 'male_ranger' | 'female_ranger' | 'male_peasant' | 'female_peasant';
export type HairLook = 'none' | 'long' | 'buns' | 'buzzed' | 'parted' | 'beard' | 'buzzed_female';
/** Acessórios desenhados para o jogo (originais), presos à cabeça ou às costas. */
export type AccessoryLook =
  | 'porcelain_mask'
  | 'clown_nose'
  | 'top_hat'
  | 'rabbit_head'
  | 'pumpkin_head'
  | 'headphones'
  | 'domino_mask'
  | 'cape'
  | 'glow_eyes'
  | 'gas_mask';

export interface SkinLook {
  outfit: OutfitLook;
  hair?: HairLook;
  /** Multiplica a cor da roupa (mantém o tecido e os detalhes da textura). */
  outfitTint?: string;
  skinTint?: string;
  hairTint?: string;
  accessories?: AccessoryLook[];
  /** Cor dos olhos brilhantes / detalhes luminosos. */
  glow?: string;
}

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
  /** Visual realista (roupa, cabelo, acessórios). Sem isso, usa o visual padrão da equipe tingido. */
  look?: SkinLook;
  description?: string;
}

export const SKINS: readonly SkinItem[] = [
  { id: 'default', name: 'Padrão', price: 0, color: '#5b6b82', accent: '#d8dde6', minLevel: 1, description: 'Visual padrão da equipe.' },
  { id: 'ocean', name: 'Oceano', price: 120, color: '#1f6f8b', accent: '#9be3f5', minLevel: 1 },
  { id: 'forest', name: 'Floresta', price: 160, color: '#3c6e47', accent: '#c4e8a5', minLevel: 1 },
  { id: 'sunset', name: 'Pôr do sol', price: 220, color: '#c0573a', accent: '#ffd08a', minLevel: 2 },
  { id: 'graphite', name: 'Grafite', price: 260, color: '#2b2e34', accent: '#ffb547', minLevel: 2 },
  { id: 'neon', name: 'Neon', price: 400, color: '#5a2ca0', accent: '#5cf2c6', minLevel: 3 },
  { id: 'royal', name: 'Real', price: 600, color: '#2340a8', accent: '#f2d16b', minLevel: 4 },
  { id: 'gold', name: 'Ouro', price: 1000, color: '#a8801f', accent: '#fff2c2', minLevel: 5 },
  { id: 'robot', name: 'Robô expressivo', price: 800, color: '#e3c544', accent: '#2b2e34', minLevel: 3, model: 'robot' },
  // ---------- Coleção "Meia-Noite" (sombria e divertida, criada para o jogo) ----------
  {
    id: 'shadow_hood',
    name: 'Sombra Encapuzada',
    price: 350,
    color: '#26282e',
    accent: '#5cf2c6',
    minLevel: 1,
    description: 'Capuz escuro e olhos que brilham no apagão.',
    look: { outfit: 'male_ranger', outfitTint: '#4a4d57', accessories: ['glow_eyes'], glow: '#5cf2c6' },
  },
  {
    id: 'mist_huntress',
    name: 'Caçadora da Névoa',
    price: 380,
    color: '#55606e',
    accent: '#cfd8e6',
    minLevel: 1,
    description: 'Capuz cinza-azulado e cabelo prateado.',
    look: { outfit: 'female_ranger', hair: 'long', outfitTint: '#9aa8bb', hairTint: '#d9dde6' },
  },
  {
    id: 'midnight_clown',
    name: 'Palhaço da Meia-Noite',
    price: 520,
    color: '#1b1b1f',
    accent: '#d8262f',
    minLevel: 2,
    description: 'Máscara de porcelana, nariz vermelho e cartola. Sorri até quando é pego.',
    look: { outfit: 'male_peasant', hair: 'buzzed', outfitTint: '#5a5a62', hairTint: '#2a2a2e', accessories: ['porcelain_mask', 'clown_nose', 'top_hat'] },
  },
  {
    id: 'sinister_bunny',
    name: 'Coelho Sinistro',
    price: 480,
    color: '#8c7a82',
    accent: '#f0d6dc',
    minLevel: 2,
    description: 'Mascote de parque de diversões abandonado.',
    look: { outfit: 'female_peasant', outfitTint: '#b7a3aa', accessories: ['rabbit_head'] },
  },
  {
    id: 'night_warden',
    name: 'Vigia Noturno',
    price: 650,
    color: '#1d2433',
    accent: '#c9a54a',
    minLevel: 3,
    description: 'Capa longa e máscara de vigia. Patrulha os corredores.',
    look: { outfit: 'male_ranger', hair: 'buzzed', outfitTint: '#3e4c6b', accessories: ['domino_mask', 'cape'], glow: '#c9a54a' },
  },
  {
    id: 'neon_streamer',
    name: 'Streamer Neon',
    price: 420,
    color: '#15151a',
    accent: '#ff3fd2',
    minLevel: 2,
    description: 'Fone com luz neon e coques. Ao vivo direto do esconderijo.',
    look: { outfit: 'female_peasant', hair: 'buns', outfitTint: '#4b4458', hairTint: '#ff7ae4', accessories: ['headphones'], glow: '#ff3fd2' },
  },
  {
    id: 'farm_zombie',
    name: 'Camponês Zumbi',
    price: 400,
    color: '#5d6b4c',
    accent: '#c7e07a',
    minLevel: 2,
    description: 'Pele esverdeada e olhar vazio. Esconde-se muito bem entre caixas.',
    look: { outfit: 'male_peasant', hair: 'beard', outfitTint: '#8a8670', skinTint: '#9fc28a', hairTint: '#3b3a2c', accessories: ['glow_eyes'], glow: '#c7e07a' },
  },
  {
    id: 'pumpkin_head',
    name: 'Cabeça de Abóbora',
    price: 750,
    color: '#d06a1c',
    accent: '#ffcf5a',
    minLevel: 4,
    description: 'Uma abóbora entalhada no lugar da cabeça, com luz por dentro.',
    look: { outfit: 'male_peasant', outfitTint: '#6b5a4a', accessories: ['pumpkin_head'], glow: '#ffb03a' },
  },
  {
    id: 'plague_keeper',
    name: 'Zelador da Peste',
    price: 700,
    color: '#2b2622',
    accent: '#9e8a64',
    minLevel: 4,
    description: 'Máscara de gás antiga e capa. Ninguém sabe o que ele limpa.',
    look: { outfit: 'female_ranger', outfitTint: '#5b5148', accessories: ['gas_mask', 'cape'] },
  },
  {
    id: 'season_blackout',
    name: 'Apagão (temporada)',
    price: 0,
    color: '#14161b',
    accent: '#7cf2ff',
    minLevel: 1,
    seasonOnly: true,
    description: 'Silhueta preta com olhos ciano: some no escuro.',
    look: { outfit: 'male_ranger', outfitTint: '#2a2c33', skinTint: '#5a5f6b', accessories: ['glow_eyes'], glow: '#7cf2ff' },
  },
  {
    id: 'season_gold',
    name: 'Lenda (temporada)',
    price: 0,
    color: '#e0b33c',
    accent: '#1b1d22',
    minLevel: 1,
    seasonOnly: true,
    description: 'Capuz dourado das lendas da temporada.',
    look: { outfit: 'female_ranger', hair: 'long', outfitTint: '#f2cf6a', hairTint: '#f6e3a8', accessories: ['cape'] },
  },
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
