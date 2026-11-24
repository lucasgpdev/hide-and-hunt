/**
 * Catálogo de objetos em que os escondidos podem se transformar (item 5).
 *
 * Para adicionar um objeto: inclua uma entrada aqui, um modelo em
 * client/src/game/objects/propModels.ts e posicione-o em algum mapa.
 * A mecânica de transformação não precisa mudar.
 */

export type PropCategory = 'moveis' | 'escritorio' | 'eletronicos' | 'escola' | 'mercado' | 'utilidades' | 'decoracao';

export interface PropType {
  id: string;
  name: string;
  category: PropCategory;
  /** Largura (x), altura (y) e profundidade (z) em metros. */
  size: readonly [number, number, number];
  /** Multiplicador de velocidade quando transformado (objetos grandes são mais lentos). */
  speed: number;
  /** Pode pular transformado neste objeto? */
  canJump: boolean;
  /** Objeto do cenário que pode ser empurrado/derrubado (física no servidor). */
  pushable?: boolean;
}

const PUSHABLE = new Set(['chair', 'trash_can', 'box', 'shopping_cart', 'bucket', 'cone', 'suitcase', 'backpack']);

const prop = (
  id: string,
  name: string,
  category: PropCategory,
  size: [number, number, number],
  speed = 1,
  canJump = true,
): PropType => ({ id, name, category, size, speed, canJump, ...(PUSHABLE.has(id) ? { pushable: true } : {}) });

export const PROP_TYPES = [
  prop('chair', 'Cadeira', 'moveis', [0.5, 0.95, 0.5]),
  prop('swivel_chair', 'Cadeira giratória', 'moveis', [0.6, 1.05, 0.6]),
  prop('table', 'Mesa', 'moveis', [1.4, 0.76, 0.8], 0.8),
  prop('sofa', 'Sofá', 'moveis', [1.9, 0.85, 0.85], 0.7, false),
  prop('school_desk', 'Carteira escolar', 'escola', [0.65, 0.78, 0.55], 0.95),
  prop('cabinet', 'Armário', 'moveis', [0.9, 1.9, 0.5], 0.65, false),
  prop('trash_can', 'Lixeira', 'utilidades', [0.45, 0.75, 0.45]),
  prop('box', 'Caixa', 'utilidades', [0.6, 0.5, 0.6], 1.05),
  prop('plant_pot', 'Vaso de planta', 'decoracao', [0.5, 1.1, 0.5]),
  prop('computer', 'Computador', 'eletronicos', [0.22, 0.45, 0.48], 1.05),
  prop('monitor', 'Monitor', 'eletronicos', [0.6, 0.48, 0.2], 1.05),
  prop('printer', 'Impressora', 'eletronicos', [0.5, 0.32, 0.45]),
  prop('shopping_cart', 'Carrinho de supermercado', 'mercado', [0.6, 1.0, 1.0], 1.0),
  prop('bucket', 'Balde', 'utilidades', [0.32, 0.34, 0.32], 1.1),
  prop('cone', 'Cone', 'utilidades', [0.4, 0.75, 0.4], 1.05),
  prop('suitcase', 'Mala', 'utilidades', [0.45, 0.7, 0.25], 1.05),
  prop('clock', 'Relógio', 'decoracao', [0.4, 0.4, 0.08], 1.1),
  prop('lamp', 'Luminária', 'decoracao', [0.35, 1.5, 0.35]),
  prop('backpack', 'Mochila', 'escola', [0.32, 0.45, 0.2], 1.1),
  prop('whiteboard', 'Quadro branco', 'escola', [1.6, 1.8, 0.5], 0.6, false),
  prop('fan', 'Ventilador', 'eletronicos', [0.45, 1.3, 0.45]),
  prop('projector', 'Projetor', 'eletronicos', [0.35, 0.12, 0.3], 1.1),
  prop('keyboard', 'Teclado', 'eletronicos', [0.45, 0.04, 0.15], 1.15),
  prop('mouse', 'Mouse', 'eletronicos', [0.07, 0.04, 0.11], 1.2),
  prop('electronic_equipment', 'Equipamento eletrônico', 'eletronicos', [0.5, 0.35, 0.4]),
  prop('nobreak', 'Nobreak', 'eletronicos', [0.18, 0.3, 0.38], 1.05),
  prop('water_cooler', 'Bebedouro', 'utilidades', [0.4, 1.1, 0.4], 0.9),
] as const satisfies readonly PropType[];

export type PropTypeId = (typeof PROP_TYPES)[number]['id'];

const BY_ID = new Map<string, PropType>(PROP_TYPES.map((p) => [p.id, p]));

export function getPropType(id: string): PropType | undefined {
  return BY_ID.get(id);
}

/**
 * Colisor de um jogador transformado: cilindro (não depende da rotação).
 * Objetos muito pequenos têm um tamanho mínimo para a física funcionar.
 */
export function propColliderSize(type: PropType): { radius: number; height: number } {
  const radius = Math.max(0.15, (Math.min(type.size[0], type.size[2]) / 2) * 0.9);
  const height = Math.max(0.2, type.size[1]);
  return { radius, height };
}
