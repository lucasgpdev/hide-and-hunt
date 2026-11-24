import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 11 — CIDADE (mapa aberto, à noite)
 *
 *   z = -24 ┌────────────────────────┬──┬─────────────────────────┐
 *           │  BAIRRO (2 casas)      │AV│  PRAÇA (fonte, árvores)  │
 *   z = -3  ├──────── RUA ───────────┼──┼──────────── RUA ────────┤
 *   z = 3   │  COMÉRCIO (mercadinho  │  │  ESTACIONAMENTO          │
 *           │  e café)               │  │                          │
 *   z = 24  └────────────────────────┴──┴─────────────────────────┘
 */
export function buildCity(): MapDefinition {
  const b = new MapBuilder(8);
  const W = 64;
  const D = 48;
  const HOUSE = 3.2;

  b.perimeter(W, D);

  b.zone('Bairro', [-32, -24, -5, -5], '#4c7436', 'grass')
    .zone('Praça', [5, -24, 32, -5], '#4c7436', 'grass')
    .zone('Comércio', [-32, 5, -5, 24], '#6a6864', 'concrete')
    .zone('Estacionamento', [5, 5, 32, 24], '#3d3e40', 'asphalt')
    .zone('Calçadas', [-32, -5, 32, 5], '#8d8b86', 'concrete')
    .zone('Calçada da avenida', [-5, -24, 5, 24], '#8d8b86', 'concrete')
    .zone('Rua', [-32, -3, 32, 3], '#3a3c40', 'asphalt')
    .zone('Avenida', [-3, -24, 3, 24], '#3a3c40', 'asphalt')
    .zone('Casa 1', [-29, -21, -19, -11], '#3a3028', 'wood')
    .zone('Casa 2', [-16, -21, -8, -13], '#4a3f44', 'carpet')
    .zone('Mercadinho', [-29, 8, -17, 20], '#2a2d33', 'tiles')
    .zone('Café', [-14, 9, -7, 19], '#3a3028', 'wood');

  // ---------- Casas, mercadinho e café (paredes baixas com telhado) ----------
  b.withWallHeight(HOUSE, (h) => {
    h.room(-29, -21, -19, -11, {
      south: [{ at: -24, width: 1.4, kind: 'door' }],
      east: [{ at: -18, width: 1.0, kind: 'secret' }],
    });
    h.wallZ(-24, -21, -16, [{ at: -18.5, width: 1.4, kind: 'door', open: true }]);
    h.room(-16, -21, -8, -13, { south: [{ at: -12, width: 1.4, kind: 'door', open: true }] });
    h.room(-29, 8, -17, 20, { north: [{ at: -23, width: 2.4 }], east: [{ at: 17, width: 1.2, kind: 'door' }] });
    h.room(-14, 9, -7, 19, { north: [{ at: -10.5, width: 1.6, kind: 'door', open: true }] });
  });
  b.roof(-29, -21, -19, -11, HOUSE, '#6b3f32')
    .roof(-16, -21, -8, -13, HOUSE, '#5b4a40')
    .roof(-29, 8, -17, 20, HOUSE, '#4a4d52')
    .roof(-14, 9, -7, 19, HOUSE, '#6b3f32');

  // Casa 1: sala e quarto.
  b.floorSolid('bed', -21.2, -14, [2.0, 1.0, 1.8], 'fabric.blue');
  b.prop('sofa', -27.9, -19, Math.PI / 2)
    .prop('table', -26, -16)
    .prop('chair', -26.6, -15.2, Math.PI)
    .prop('chair', -25.4, -15.2, Math.PI)
    .prop('lamp', -28.4, -11.6)
    .prop('electronic_equipment', -28.4, -14)
    .prop('cabinet', -19.6, -20.4, -Math.PI / 2)
    .prop('plant_pot', -25.5, -20.4)
    .prop('clock', -26.2, -16.1, 0.4, 0.76)
    .prop('suitcase', -20, -11.6, 0.3)
    .prop('backpack', -22.6, -18, 0.9);
  // Casa 2: escritório doméstico.
  b.floorSolid('bookshelf', -12, -20.55, [4, 2.2, 0.45]);
  b.prop('table', -10, -16)
    .prop('swivel_chair', -10, -16.9)
    .prop('monitor', -10.2, -15.9, Math.PI, 0.76)
    .prop('computer', -9.4, -15.8, 0, 0.76)
    .prop('lamp', -15.4, -20.4)
    .prop('plant_pot', -15.4, -13.6)
    .prop('fan', -8.6, -20.4)
    .prop('box', -14.4, -16.5, 0.4);
  // Quintal.
  b.floorSolid('tree', -17.5, -8.5, [0.8, 4.5, 0.8])
    .floorSolid('tree', -30, -8, [0.8, 4.5, 0.8])
    .floorSolid('hedge', -24, -5.7, [6, 1.0, 0.6])
    .floorSolid('car', -12, -8.2, [4.2, 1.5, 1.9], '#2f4f3e');
  b.prop('trash_can', -20, -6)
    .prop('trash_can', -19.4, -6)
    .prop('bucket', -27, -6.5)
    .prop('plant_pot', -24, -9.8)
    .prop('box', -6.5, -9);

  // Mercadinho.
  for (const x of [-26, -22.5]) b.floorSolid('shelf', x, 15, [1, 2.0, 6]);
  b.floorSolid('checkout', -19.5, 10.5, [0.9, 1.0, 2.2]);
  b.floorSolid('freezer', -28.4, 15, [0.9, 1.9, 6]);
  b.prop('shopping_cart', -24.5, 9.6, 0.3)
    .prop('shopping_cart', -20, 18.5, 1.1)
    .prop('box', -18, 19.3)
    .prop('box', -18.6, 19.3, 0.4)
    .prop('box', -18.3, 19.3, 0.2, 0.5)
    .prop('trash_can', -28.4, 8.8)
    .prop('bucket', -24, 19.4)
    .prop('backpack', -19.5, 10.5, 0, 1.0);
  // Café.
  b.floorSolid('counter', -10.5, 18.3, [5, 1.05, 0.8]);
  b.prop('table', -12, 13)
    .prop('chair', -12.8, 13, Math.PI / 2)
    .prop('chair', -11.2, 13, -Math.PI / 2)
    .prop('table', -9, 15)
    .prop('chair', -9.8, 15, Math.PI / 2)
    .prop('chair', -8.2, 15, -Math.PI / 2)
    .prop('plant_pot', -7.6, 9.6)
    .prop('clock', -10.5, 18.3, 0, 1.05)
    .prop('lamp', -13.4, 18.4);
  // Calçada do comércio.
  b.prop('cone', -16, 6)
    .prop('trash_can', -30, 6)
    .prop('plant_pot', -15.6, 21)
    .prop('shopping_cart', -31, 22, 0.5);

  // ---------- Praça ----------
  b.floorSolid('fountain', 18, -14, [5, 0.7, 5]);
  for (const [x, z] of [
    [9, -20],
    [28, -20],
    [9, -9],
    [28, -9],
    [13, -14],
    [23.5, -14],
  ] as const) {
    b.floorSolid('tree', x, z, [0.8, 5, 0.8]);
  }
  b.floorSolid('hedge', 18, -22.6, [12, 1.0, 1.0]);
  for (const [x, z, w, d] of [
    [18, -18.5, 2.6, 0.6],
    [18, -9.5, 2.6, 0.6],
    [12.5, -18.5, 0.6, 2.6],
    [24, -9.5, 0.6, 2.6],
  ] as const) {
    b.floorSolid('bench', x, z, [w, 0.45, d]);
  }
  b.prop('trash_can', 15, -9)
    .prop('trash_can', 21, -19)
    .prop('plant_pot', 6, -6)
    .prop('plant_pot', 31, -6)
    .prop('lamp', 31, -23)
    .prop('backpack', 18, -9.5, 0.4, 0.45)
    .prop('suitcase', 25, -16, 0.6)
    .prop('box', 30, -12)
    .prop('cone', 6, -14)
    .prop('bucket', 20.8, -12)
    .prop('water_cooler', 6, -23);

  // ---------- Estacionamento ----------
  const colors = ['#7a1f22', '#1d2c46', '#d9d6cf', '#2b2b2e', '#5a6b3a', '#a46b1f'];
  let c = 0;
  for (const x of [8.5, 13, 22, 26.5]) {
    for (const z of [9.5, 19]) {
      if ((x === 13 && z === 19) || (x === 22 && z === 9.5)) continue;
      b.floorSolid('car', x, z, [1.9, 1.5, 4.3], colors[c++ % colors.length]);
    }
  }
  b.prop('cone', 17.5, 8)
    .prop('cone', 17.5, 12)
    .prop('cone', 17.5, 16)
    .prop('shopping_cart', 13, 19, 0.7)
    .prop('shopping_cart', 22, 9.5, 2.2)
    .prop('trash_can', 31, 23)
    .prop('box', 31, 15)
    .prop('box', 30.4, 15.3, 0.5)
    .prop('suitcase', 10.5, 14.2, 0.2)
    .prop('bucket', 6, 23);

  // ---------- Ruas ----------
  b.floorSolid('car', -20, -1.6, [4.2, 1.5, 1.9], '#c9c4b8');
  b.floorSolid('car', 1.5, -16, [1.9, 1.5, 4.3], '#7a1f22');
  b.floorSolid('car', 24, 1.6, [4.2, 1.5, 1.9], '#1d2c46');
  b.prop('cone', -9, 0)
    .prop('cone', -8.4, 0.4)
    .prop('cone', 12, -0.5)
    .prop('trash_can', -4.4, -4.4)
    .prop('trash_can', 4.4, 4.4)
    .prop('plant_pot', -4.4, 4.4)
    .prop('plant_pot', 4.4, -4.4)
    .prop('box', 31, 0)
    .prop('bucket', -31, 1);

  // Postes de luz (mapa aberto: a altura é a da lâmpada).
  for (const x of [-26, -14, 14, 26]) b.light(x, -4.3, 1.2, '#ffd59a', 5).light(x, 4.3, 1.2, '#ffd59a', 5);
  for (const z of [-18, -10, 10, 18]) b.light(-4.3, z, 1.2, '#ffd59a', 5).light(4.3, z, 1.2, '#ffd59a', 5);

  const hiders: Vec3[] = [];
  for (const x of [-28, -24, -15, -11, -6, 7, 11, 16, 20, 29]) hiders.push([x, 0, 0.6]);
  const hunters: Vec3[] = [];
  for (const x of [-1.3, 1.3]) for (const z of [12, 14.5, 17, 19.5]) hunters.push([x, 0, z]);

  return b.build({
    id: 'city',
    name: 'Cidade',
    description: 'Mapa aberto à noite: ruas, casas, mercadinho, café, praça e estacionamento.',
    size: [W, D],
    outdoor: true,
    theme: { background: '#0a0f1c', floor: '#3a3c40', wall: '#a8a29a', ambient: '#9fb4ff', fog: '#0a0f1c' },
    spawns: { hiders, hunters },
  });
}
