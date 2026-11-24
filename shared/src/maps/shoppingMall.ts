import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 06 — SHOPPING
 *
 *   z = -20 ┌──────────┬──────────┬──────────┬──────────┐
 *           │  ROUPAS  │ELETRÔNICOS│ LIVRARIA │ ESPORTES │
 *   z = -10 ├──vitrine─┴──vitrine──┴──vitrine─┴──vitrine─┤
 *           │     CORREDOR CENTRAL (fonte e quiosques)   │
 *   z = 10  ├─────────────────────────────┬────porta─────┤
 *           │     PRAÇA DE ALIMENTAÇÃO     │  SERVIÇO     │
 *   z = 20  └─────────────────────────────┴──────────────┘
 */
export function buildShoppingMall(): MapDefinition {
  const b = new MapBuilder(5);
  const W = 52;
  const D = 40;

  b.perimeter(W, D);
  b.wallX(-10, -26, 26, [
    { at: -19.5, width: 4 },
    { at: -6.5, width: 4 },
    { at: 6.5, width: 4 },
    { at: 19.5, width: 4 },
  ]);
  b.wallZ(-13, -20, -10);
  b.wallZ(0, -20, -10, [{ at: -15, width: 1.0, kind: 'secret' }]);
  b.wallZ(13, -20, -10);
  b.wallX(10, 8, 26, [{ at: 17, width: 1.8, kind: 'door' }]);
  b.wallZ(8, 10, 20, [{ at: 15, width: 1.4, kind: 'door' }]);

  b.zone('Loja de roupas', [-26, -20, -13, -10], '#3a3028', 'wood')
    .zone('Eletrônicos', [-13, -20, 0, -10], '#2c3036', 'tilesDark')
    .zone('Livraria', [0, -20, 13, -10], '#3a3028', 'wood')
    .zone('Esportes', [13, -20, 26, -10], '#4d4a55', 'vinyl')
    .zone('Corredor central', [-26, -10, 26, 10], '#e0dcd4', 'marble')
    .zone('Praça de alimentação', [-26, 10, 8, 20], '#2a2d33', 'tiles')
    .zone('Serviço', [8, 10, 26, 20], '#3a3a3a', 'concrete');
  b.lightSwitch('Serviço', 15.6, 10.16).lightSwitch('Praça de alimentação', -25.86, 15);

  // ---------- Roupas ----------
  for (const x of [-23, -16]) b.floorSolid('shelf', x, -15, [1, 1.7, 5.5]);
  b.floorSolid('counter', -19.5, -19.4, [4, 1.05, 0.8]);
  b.prop('cabinet', -25.5, -17, Math.PI / 2)
    .prop('cabinet', -25.5, -12.5, Math.PI / 2)
    .prop('backpack', -19.5, -19.4, 0.3, 1.05)
    .prop('suitcase', -14.2, -18.8, 0.2)
    .prop('suitcase', -14.2, -18.3, 0.6)
    .prop('plant_pot', -13.7, -10.8)
    .prop('box', -21, -12.5, 0.3)
    .prop('swivel_chair', -19.5, -18.4, Math.PI);

  // ---------- Eletrônicos ----------
  b.floorSolid('counter', -6.5, -16, [5, 1.05, 1.2]);
  b.floorSolid('shelf', -12.4, -15, [0.9, 2.0, 7]);
  b.floorSolid('shelf', -0.6, -15, [0.9, 2.0, 7]);
  b.prop('monitor', -8, -16, 0, 1.05)
    .prop('monitor', -6.5, -16, 0, 1.05)
    .prop('computer', -5, -16, 0, 1.05)
    .prop('keyboard', -6.5, -15.6, 0, 1.05)
    .prop('mouse', -5.6, -15.6, 0, 1.05)
    .prop('printer', -9, -19.4)
    .prop('electronic_equipment', -4, -19.4)
    .prop('nobreak', -2.6, -19.5)
    .prop('box', -9.5, -11.2, 0.5)
    .prop('fan', -3, -11.2);

  // ---------- Livraria ----------
  b.floorSolid('bookshelf', 3.5, -19.55, [5, 2.4, 0.45])
    .floorSolid('bookshelf', 9.5, -19.55, [5, 2.4, 0.45])
    .floorSolid('bookshelf', 4, -15, [4, 1.6, 0.6])
    .floorSolid('bookshelf', 10, -15, [4, 1.6, 0.6]);
  b.prop('table', 7, -12.4)
    .prop('chair', 6.3, -11.6, Math.PI)
    .prop('chair', 7.7, -11.6, Math.PI)
    .prop('lamp', 12.4, -11)
    .prop('plant_pot', 0.7, -11)
    .prop('backpack', 1, -17.6, 2)
    .prop('clock', 7.2, -12.4, 0.4, 0.76);

  // ---------- Esportes ----------
  b.floorSolid('shelf', 25.5, -15, [0.9, 2.0, 8]);
  b.floorSolid('rack', 19.5, -16, [6, 1.8, 1]);
  b.prop('cone', 15, -12)
    .prop('cone', 15.6, -12.3)
    .prop('cone', 16.2, -12)
    .prop('backpack', 17, -19.5)
    .prop('backpack', 17.6, -19.5, 0.2)
    .prop('suitcase', 22, -12.5, 0.5)
    .prop('bucket', 14, -19.4)
    .prop('box', 21, -12, 0.8)
    .prop('box', 23.5, -19.3);

  // ---------- Corredor central ----------
  b.floorSolid('fountain', 0, 0, [5, 0.7, 5]);
  b.floorSolid('counter', -14, 0, [3, 1.05, 1.6]).floorSolid('counter', 14, 0, [3, 1.05, 1.6]);
  for (const x of [-6, 6]) for (const z of [-4, 4]) b.floorSolid('bench', x, z, [2.6, 0.45, 0.6]);
  for (const x of [-20, 20]) for (const z of [-6, 6]) b.solid('pillar', [x, 2.5, z], [0.6, 5, 0.6]);
  b.prop('plant_pot', -10, -9)
    .prop('plant_pot', 10, -9)
    .prop('plant_pot', -10, 9)
    .prop('plant_pot', 10, 9)
    .prop('trash_can', -3, -8.8)
    .prop('trash_can', 3, 8.8)
    .prop('monitor', -14, 0, Math.PI / 2, 1.05)
    .prop('box', 14.3, 0.3, 0.2, 1.05)
    .prop('shopping_cart', -24.5, 8, 0.3)
    .prop('shopping_cart', 24.5, -8, 2.9)
    .prop('lamp', -25.4, -9.4)
    .prop('lamp', 25.4, 9.4)
    .prop('water_cooler', 25.4, 0)
    .prop('clock', -25.6, 0, Math.PI / 2, 1.8)
    .prop('cone', 22, 4)
    .prop('backpack', 6.2, 4, 0.4, 0.45)
    .prop('suitcase', -17, 3.5, 0.3);

  // ---------- Praça de alimentação ----------
  for (const x of [-20, -12, -4]) b.floorSolid('counter', x, 19.4, [5, 1.05, 0.8]);
  for (const x of [-22, -17.5, -13, -8.5, -4, 0.5, 5]) {
    for (const z of [13, 16.2]) {
      b.prop('table', x, z).prop('chair', x - 0.4, z - 0.75).prop('chair', x + 0.4, z + 0.75, Math.PI);
    }
  }
  b.prop('trash_can', -25.4, 10.6)
    .prop('trash_can', 7.4, 10.6)
    .prop('plant_pot', 7.4, 19.4)
    .prop('box', -16, 19.4, 0.3)
    .prop('bucket', -8, 19.5);

  // ---------- Serviço ----------
  b.floorSolid('rack', 20, 19.3, [10, 3, 1.1]);
  b.floorSolid('pallet', 23.5, 14, [1.2, 1.4, 1.2]);
  b.floorSolid('pallet', 23.5, 12.2, [1.2, 1.0, 1.2]);
  b.prop('box', 10, 19.3)
    .prop('box', 10.7, 19.3, 0.4)
    .prop('box', 10.3, 19.3, 0.2, 0.5)
    .prop('shopping_cart', 14, 13, 1.2)
    .prop('bucket', 9, 11)
    .prop('cone', 12, 11)
    .prop('trash_can', 25.4, 19.4)
    .prop('electronic_equipment', 18, 11)
    .prop('cabinet', 8.6, 18.5, Math.PI / 2)
    .prop('fan', 25.4, 16.6);

  for (const x of [-19.5, -6.5, 6.5, 19.5]) b.light(x, -15, 0.8, '#fff6e6');
  for (const x of [-20, -10, 0, 10, 20]) for (const z of [-5, 5]) b.light(x, z, 0.7, '#f8f6ff');
  for (const x of [-18, -8, 2]) b.light(x, 15, 1, '#ffe9c8');
  b.light(17, 15, 0.6, '#dfe8ff');

  const hiders: Vec3[] = [];
  for (const x of [-22, -18, -10, -6, -2, 2, 6, 10, 18, 22]) hiders.push([x, 0, 7]);
  const hunters: Vec3[] = [];
  for (const x of [-22.5, -17.5, 17.5, 22.5]) for (const z of [-7.3, -3]) hunters.push([x, 0, z]);

  return b.build({
    id: 'shopping_mall',
    name: 'Shopping',
    description: 'Lojas, corredor central com fonte, quiosques, praça de alimentação e área de serviço.',
    size: [W, D],
    theme: { background: '#0e1014', floor: '#e0dcd4', wall: '#ece8e0', ambient: '#f2f4ff', fog: '#0e1014' },
    spawns: { hiders, hunters },
  });
}
