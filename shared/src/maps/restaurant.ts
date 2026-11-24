import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 08 — RESTAURANTE
 *
 *   z = -15 ┌───────────────────────────────┬──────────────┐
 *           │                               │   COZINHA    │
 *           │            SALÃO              │              │
 *   z = 3   │  (mesas, bar e recepção)      ├────porta─────┤
 *           │                               │   ESTOQUE    │
 *   z = 15  └───────────────────────────────┴──────────────┘
 *                                          x = 6
 */
export function buildRestaurant(): MapDefinition {
  const b = new MapBuilder(3.6);
  const W = 40;
  const D = 30;

  b.perimeter(W, D);
  b.wallZ(6, -15, 15, [
    { at: -6, width: 1.6, kind: 'door', open: true },
    { at: 9, width: 1.0, kind: 'secret' },
  ]);
  b.wallX(3, 6, 20, [{ at: 13, width: 1.6, kind: 'door' }]);

  b.zone('Salão', [-20, -15, 6, 15], '#3a3028', 'wood')
    .zone('Cozinha', [6, -15, 20, 3], '#2a2d33', 'tiles')
    .zone('Estoque', [6, 3, 20, 15], '#3a3a3a', 'concrete');
  b.lightSwitch('Salão', 5.86, 2).lightSwitch('Cozinha', 11.6, 2.84).lightSwitch('Estoque', 14.4, 3.16);

  // ---------- Salão ----------
  b.floorSolid('counter', -8, -14.35, [10, 1.1, 0.8]);
  b.floorSolid('bookshelf', -8, -14.85, [8, 2.2, 0.25]);
  for (const x of [-12, -10, -8, -6, -4]) b.prop('chair', x, -13.3, Math.PI);
  for (const x of [-17, -12.5, -8, -3.5, 1]) {
    for (const z of [-9.5, -5, 5, 10]) {
      b.prop('table', x, z)
        .prop('chair', x - 1.0, z, Math.PI / 2)
        .prop('chair', x + 1.0, z, -Math.PI / 2);
    }
  }
  b.floorSolid('counter', -18.8, 13.5, [0.9, 1.1, 2]);
  b.solid('pillar', [-8, 1.8, 0], [0.5, 3.6, 0.5]).solid('pillar', [-1.5, 1.8, 0], [0.5, 3.6, 0.5]);
  b.prop('plant_pot', -19.3, -14.3)
    .prop('plant_pot', 5.3, 14.3)
    .prop('plant_pot', -19.3, 3)
    .prop('lamp', 5.3, -14.3)
    .prop('clock', -18.8, 13.5, Math.PI / 2, 1.1)
    .prop('computer', -18.8, 12.9, Math.PI / 2, 1.1)
    .prop('trash_can', 5.3, -8.5)
    .prop('box', -2.5, -14.3, 0.2)
    .prop('water_cooler', 5.3, 9)
    .prop('backpack', -12.6, 10.8, 0.5)
    .prop('suitcase', -15, 14.4, 0.3)
    .prop('bucket', -12, -14.35, 0, 1.1)
    .prop('fan', -19.3, -7);

  // ---------- Cozinha ----------
  b.floorSolid('stove', 19.4, -9, [0.9, 0.95, 7]);
  b.floorSolid('freezer', 11, -14.4, [5, 1.9, 0.9]);
  b.floorSolid('counter', 11.5, -6, [5, 0.95, 1.4]);
  b.floorSolid('counter', 19.4, -1, [0.9, 0.95, 4]);
  b.floorSolid('counter', 7.6, 2.4, [3, 0.95, 0.8]);
  b.prop('bucket', 10, -6, 0, 0.95)
    .prop('box', 13, -6.2, 0.3, 0.95)
    .prop('trash_can', 6.6, -14.4)
    .prop('trash_can', 15, 2.3)
    .prop('box', 17.3, -14.4)
    .prop('cone', 7, -10)
    .prop('chair', 8, -2, 0.7)
    .prop('clock', 19.4, -2, -Math.PI / 2, 0.95)
    .prop('electronic_equipment', 19.4, 0.2, -Math.PI / 2, 0.95);

  // ---------- Estoque ----------
  b.floorSolid('rack', 13, 14.4, [12, 2.6, 1.0]);
  b.floorSolid('rack', 19.4, 8.5, [1.0, 2.6, 6]);
  b.floorSolid('pallet', 9, 8, [1.2, 1.2, 1.2]);
  b.prop('box', 7, 4)
    .prop('box', 7.7, 4.2, 0.4)
    .prop('box', 7.3, 4.1, 0.2, 0.5)
    .prop('box', 12, 10)
    .prop('box', 15, 7.5, 0.6)
    .prop('bucket', 11, 5)
    .prop('shopping_cart', 14, 11.5, 1.6)
    .prop('cone', 17.5, 4.5)
    .prop('trash_can', 6.6, 14.3)
    .prop('cabinet', 17, 4.1, Math.PI)
    .prop('suitcase', 10.2, 13.6, 0.1);

  for (const x of [-15, -8, -1]) for (const z of [-8, 0, 8]) b.light(x, z, 0.9, '#ffd9a8');
  b.light(12, -9, 1, '#f4f6ff').light(14, -1, 0.9, '#f4f6ff').light(13, 9, 0.7, '#dfe8ff');

  const hiders: Vec3[] = [];
  for (const x of [-18.5, -16, -13.5, -11, -5.8, -3.6, 1, 3.3]) hiders.push([x, 0, 0]);
  hiders.push([-15, 0, 2.3], [-5, 0, -2.3]);
  const hunters: Vec3[] = [];
  for (const x of [9, 10.8, 12.6, 14.4]) for (const z of [-2.6, -0.5]) hunters.push([x, 0, z]);

  return b.build({
    id: 'restaurant',
    name: 'Restaurante',
    description: 'Salão com mesas e bar, cozinha industrial e estoque.',
    size: [W, D],
    theme: { background: '#0f0c0a', floor: '#3a3028', wall: '#e6dccb', ambient: '#ffd9a8', fog: '#0f0c0a' },
    spawns: { hiders, hunters },
  });
}
