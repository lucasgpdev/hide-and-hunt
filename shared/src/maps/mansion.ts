import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 04 — MANSÃO
 *
 *   z = -18 ┌──────────────┬────────────────┬──────────────┐
 *           │   QUARTO 1   │   BIBLIOTECA   │   QUARTO 2   │
 *   z = -6  ├───porta──────┴───passagem─────┴────porta─────┤
 *           │  SALA DE ESTAR │   SALÃO   │  SALA DE JANTAR  │
 *   z = 4   ├────porta───────┬──────────┬────passagem──────┤
 *           │    COZINHA     │ VESTÍBULO│     GARAGEM       │
 *   z = 18  └────────────────┴──────────┴──────────────────┘
 */
export function buildMansion(): MapDefinition {
  const b = new MapBuilder(4.2);
  const W = 48;
  const D = 36;

  b.perimeter(W, D);
  b.wallX(-6, -24, 24, [
    { at: -16, width: 1.6, kind: 'door' },
    { at: 0, width: 2.6 },
    { at: 16, width: 1.6, kind: 'door', open: true },
  ]);
  b.wallZ(-8, -18, -6, [{ at: -12, width: 1.0, kind: 'secret' }]);
  b.wallZ(8, -18, -6, [{ at: -10, width: 1.4, kind: 'door' }]);
  b.wallX(4, -24, -4, [{ at: -14, width: 1.6, kind: 'door', open: true }]);
  b.wallX(4, 4, 24, [{ at: 14, width: 3.4 }]);
  b.wallZ(-4, 4, 18, [{ at: 11, width: 1.4, kind: 'door' }]);
  b.wallZ(4, 4, 18, [{ at: 8, width: 1.0, kind: 'secret' }]);

  b.zone('Quarto 1', [-24, -18, -8, -6], '#4a3f44', 'carpet')
    .zone('Biblioteca', [-8, -18, 8, -6], '#3a3028', 'wood')
    .zone('Quarto 2', [8, -18, 24, -6], '#4a3f44', 'carpet')
    .zone('Salão', [-24, -6, 24, 4], '#3a3028', 'wood')
    .zone('Cozinha', [-24, 4, -4, 18], '#2a2d33', 'tiles')
    .zone('Vestíbulo', [-4, 4, 4, 18], '#e0dcd4', 'marble')
    .zone('Garagem', [4, 4, 24, 18], '#3a3a3a', 'concrete');
  b.lightSwitch('Quarto 1', -14.4, -6.16)
    .lightSwitch('Quarto 2', 17.6, -6.16)
    .lightSwitch('Biblioteca', 2.2, -6.16)
    .lightSwitch('Cozinha', -12.4, 4.16)
    .lightSwitch('Garagem', 23.86, 10);

  // ---------- Quarto 1 ----------
  b.floorSolid('bed', -21.9, -14, [2.2, 1.0, 1.8], 'fabric.red');
  b.prop('lamp', -23.4, -16.2)
    .prop('lamp', -23.4, -11.8)
    .prop('cabinet', -12, -17.5)
    .prop('cabinet', -13, -17.5)
    .prop('suitcase', -10.5, -17.5, 0.2)
    .prop('table', -16, -10)
    .prop('chair', -16, -9.2, Math.PI)
    .prop('plant_pot', -8.7, -6.8)
    .prop('backpack', -19.5, -10.6, 1.1)
    .prop('clock', -16.3, -10.1, 0.2, 0.76)
    .prop('box', -23.3, -6.8);

  // ---------- Biblioteca ----------
  b.floorSolid('bookshelf', -4.5, -17.55, [5, 2.6, 0.45])
    .floorSolid('bookshelf', 4.5, -17.55, [5, 2.6, 0.45])
    .floorSolid('bookshelf', -7.55, -12.5, [0.45, 2.6, 5])
    .floorSolid('bookshelf', 7.55, -14, [0.45, 2.6, 3]);
  b.prop('sofa', 0, -11, Math.PI)
    .prop('table', 0, -13.5)
    .prop('chair', -1.3, -14.6)
    .prop('chair', 1.3, -14.6)
    .prop('lamp', -6.6, -7)
    .prop('lamp', 6.6, -7)
    .prop('clock', 0.4, -13.5, 0.5, 0.76)
    .prop('plant_pot', 4, -10)
    .prop('box', -4.5, -8.6, 0.6);

  // ---------- Quarto 2 ----------
  b.floorSolid('bed', 21.9, -14, [2.2, 1.0, 1.8], 'fabric.blue');
  b.prop('lamp', 23.4, -16.2)
    .prop('lamp', 23.4, -11.8)
    .prop('cabinet', 12, -17.5)
    .prop('cabinet', 13, -17.5)
    .prop('table', 15, -9.5)
    .prop('swivel_chair', 15, -8.6, Math.PI)
    .prop('computer', 15.5, -9.6, 0, 0.76)
    .prop('monitor', 14.8, -9.7, 0, 0.76)
    .prop('suitcase', 9, -17.4, 0.4)
    .prop('fan', 9, -7)
    .prop('plant_pot', 23.3, -6.8);

  // ---------- Salão ----------
  b.solid('pillar', [-6, 2.1, -1], [0.6, 4.2, 0.6]).solid('pillar', [6, 2.1, -1], [0.6, 4.2, 0.6]);
  b.floorSolid('pillar', -23.6, -2, [0.55, 1.3, 2.4], '#4a3b33'); // lareira
  b.prop('sofa', -19.5, -4.8)
    .prop('sofa', -19.5, 2.6, Math.PI)
    .prop('sofa', -15.6, -1, -Math.PI / 2)
    .prop('table', -19.5, -1)
    .prop('lamp', -23.4, -5.4)
    .prop('lamp', -23.4, 3.4)
    .prop('plant_pot', -12, 3.3)
    .prop('electronic_equipment', -19.5, -1, 0, 0.76)
    .prop('clock', -18.8, -1.2, 0.4, 0.76);
  b.floorSolid('bench', 19.5, -1, [5, 0.76, 1.3]);
  for (const x of [17.6, 19.5, 21.4]) b.prop('chair', x, -2.1).prop('chair', x, 0.1, Math.PI);
  b.prop('chair', 16.4, -1, -Math.PI / 2)
    .prop('chair', 22.6, -1, Math.PI / 2)
    .prop('cabinet', 23.5, -4.5, -Math.PI / 2)
    .prop('plant_pot', 12, 3.3)
    .prop('plant_pot', 12, -5.3)
    .prop('lamp', 23.4, 3.4);

  // ---------- Cozinha ----------
  b.floorSolid('stove', -23.4, 9, [0.9, 0.95, 3]);
  b.floorSolid('counter', -23.4, 13.5, [0.9, 0.95, 4]);
  b.floorSolid('counter', -14, 17.35, [8, 0.95, 0.8]);
  b.floorSolid('freezer', -6.5, 17.25, [1.6, 1.9, 0.9]);
  b.floorSolid('counter', -14, 10.5, [4, 0.95, 1.4]);
  b.prop('chair', -15.2, 11.6, Math.PI)
    .prop('chair', -12.8, 11.6, Math.PI)
    .prop('bucket', -14.4, 10.5, 0, 0.95)
    .prop('trash_can', -4.7, 5)
    .prop('box', -23.3, 4.8)
    .prop('table', -9, 13)
    .prop('chair', -9, 12.2)
    .prop('chair', -9, 13.8, Math.PI)
    .prop('plant_pot', -4.7, 14.5);

  // ---------- Vestíbulo ----------
  b.floorSolid('fountain', 0, 9.5, [2.4, 0.6, 2.4]);
  b.prop('plant_pot', -3.4, 17.3).prop('plant_pot', 3.4, 17.3).prop('lamp', -3.4, 5).prop('suitcase', 2.4, 16.8, 0.4);

  // ---------- Garagem ----------
  b.floorSolid('car', 9, 12.5, [1.9, 1.5, 4.3], '#1d2c46');
  b.floorSolid('car', 14.5, 12.5, [1.9, 1.5, 4.3], '#7a1f22');
  b.floorSolid('rack', 23.4, 12, [1.0, 2.4, 5]);
  b.prop('cone', 18, 7)
    .prop('cone', 18.6, 7.4)
    .prop('bucket', 5, 17.4)
    .prop('box', 20, 17.3)
    .prop('box', 20.8, 17.3, 0.3)
    .prop('box', 20.4, 17.3, 0.7, 0.5)
    .prop('electronic_equipment', 22.8, 17.3)
    .prop('trash_can', 5, 5)
    .prop('suitcase', 11.6, 16.9, 0.2)
    .prop('backpack', 17.5, 15.5, 0.9);

  for (const x of [-16, 0, 16]) b.light(x, -12, 0.9, '#ffe2b8');
  for (const x of [-18, -9, 0, 9, 18]) b.light(x, -1, 0.9, '#ffe2b8');
  b.light(-14, 11, 1).light(0, 12, 0.8, '#ffe2b8').light(10, 11, 0.8, '#e6eeff').light(19, 11, 0.8, '#e6eeff');

  const hiders: Vec3[] = [];
  for (const x of [-12.5, -10.5, -8.5, -3.5, -1.5, 1.5, 3.5, 8.5, 10.5, 12.5]) hiders.push([x, 0, -1]);
  const hunters: Vec3[] = [];
  for (const x of [-2.5, -0.8, 0.8, 2.5]) for (const z of [13.6, 15.6]) hunters.push([x, 0, z]);

  return b.build({
    id: 'mansion',
    name: 'Mansão',
    description: 'Quartos, biblioteca, salão, cozinha, vestíbulo e garagem.',
    size: [W, D],
    theme: { background: '#0d0b0a', floor: '#3a3028', wall: '#e6dccb', ambient: '#ffe2b8', fog: '#0d0b0a' },
    spawns: { hiders, hunters },
  });
}
