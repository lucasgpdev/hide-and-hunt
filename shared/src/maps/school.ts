import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 02 — ESCOLA
 *
 *   z = -17 ┌──────────────┬───────────────┬──────────────┐
 *           │   SALA 1     │   BIBLIOTECA  │  SALA DE ARTES│
 *   z = -5  ├───porta──────┴─────porta─────┴────porta─────┤
 *           │          CORREDOR (armários)                 │
 *   z = 0   ├──────passagem────────────┬────passagem──────┤
 *           │       REFEITÓRIO          │  PÁTIO COBERTO   │
 *   z = 17  └───────────────────────────┴──────────────────┘
 */
export function buildSchool(): MapDefinition {
  const b = new MapBuilder(3.6);
  const W = 44;
  const D = 34;

  b.perimeter(W, D);
  b.wallX(-5, -22, 22, [
    { at: -14, width: 1.8, kind: 'door', open: true },
    { at: 1, width: 1.8, kind: 'door' },
    { at: 15, width: 1.8, kind: 'door', open: true },
  ]);
  b.wallX(0, -22, 22, [
    { at: -9, width: 3.2 },
    { at: 13, width: 3.2 },
  ]);
  b.wallZ(-6, -17, -5, [{ at: -11, width: 1.0, kind: 'secret' }]);
  b.wallZ(8, -17, -5, [{ at: -11, width: 1.2, kind: 'door' }]);
  b.wallZ(4, 0, 17, [{ at: 8, width: 3.2 }]);

  b.zone('Sala 1', [-22, -17, -6, -5], '#4a4038', 'vinyl')
    .zone('Biblioteca', [-6, -17, 8, -5], '#3a3028', 'wood')
    .zone('Sala de artes', [8, -17, 22, -5], '#4a4038', 'vinyl')
    .zone('Corredor', [-22, -5, 22, 0], '#5a5a56', 'tiles')
    .zone('Refeitório', [-22, 0, 4, 17], '#2e3236', 'tilesDark')
    .zone('Pátio coberto', [4, 0, 22, 17], '#55534e', 'concrete');
  b.lightSwitch('Sala 1', -12.6, -5.16)
    .lightSwitch('Biblioteca', 2.4, -5.16)
    .lightSwitch('Sala de artes', 16.4, -5.16)
    .lightSwitch('Refeitório', -21.86, 8);

  // ---------- Sala 1 ----------
  b.solid('chalkboard', [-14, 1.6, -16.82], [5, 1.3, 0.1]);
  b.floorSolid('teacher_desk', -14, -14.6, [1.8, 0.78, 0.8]);
  b.prop('swivel_chair', -14, -15.6).prop('computer', -14.6, -14.7, 0, 0.78).prop('clock', -13.4, -14.5, 0.3, 0.78);
  for (const x of [-19.5, -17, -11, -8.5]) {
    for (const z of [-12, -9.6, -7.2]) {
      b.prop('school_desk', x, z).prop('chair', x, z + 0.62, Math.PI);
    }
  }
  b.prop('backpack', -16.4, -8.8, 0.4)
    .prop('backpack', -10.4, -11.3, 2.1)
    .prop('trash_can', -21.4, -16.4)
    .prop('fan', -21.3, -5.8)
    .prop('cabinet', -6.6, -15, -Math.PI / 2)
    .prop('plant_pot', -6.7, -6);

  // ---------- Biblioteca ----------
  b.floorSolid('bookshelf', -2.5, -16.55, [3.6, 2.2, 0.45])
    .floorSolid('bookshelf', 4.5, -16.55, [3.6, 2.2, 0.45])
    .floorSolid('bookshelf', -3, -12.5, [3.2, 1.8, 0.5])
    .floorSolid('bookshelf', 4, -12.5, [3.2, 1.8, 0.5])
    .floorSolid('bookshelf', -3, -9.6, [3.2, 1.8, 0.5])
    .floorSolid('bookshelf', 4, -9.6, [3.2, 1.8, 0.5]);
  b.prop('table', 0.5, -7)
    .prop('chair', -0.2, -6.3, Math.PI)
    .prop('chair', 1.2, -6.3, Math.PI)
    .prop('chair', 0.5, -7.75)
    .prop('lamp', -5.4, -14.5)
    .prop('lamp', 7.4, -7)
    .prop('backpack', 2.4, -6.1, 0.8)
    .prop('box', -5.3, -6.2, 0.4)
    .prop('clock', 0.9, -7.1, 0.6, 0.76)
    .prop('plant_pot', 7.4, -14.6);

  // ---------- Sala de artes ----------
  b.prop('whiteboard', 15, -16.4);
  for (const [x, z] of [
    [11.5, -12.5],
    [16, -12.5],
    [11.5, -8.5],
    [16, -8.5],
  ] as const) {
    b.prop('table', x, z).prop('chair', x - 0.4, z + 0.75, Math.PI).prop('chair', x + 0.4, z - 0.75);
  }
  b.prop('bucket', 11.2, -12.4, 0, 0.76)
    .prop('box', 20.8, -16.2)
    .prop('box', 21.2, -15.4, 0.6)
    .prop('cabinet', 21.5, -11, Math.PI / 2)
    .prop('cabinet', 21.5, -10, Math.PI / 2)
    .prop('fan', 20.9, -6)
    .prop('projector', 16, -8.5, 0, 0.76)
    .prop('trash_can', 8.8, -16.3);
  b.prop('lamp', 20.9, -7.6);

  // ---------- Corredor ----------
  for (const [x0, x1] of [
    [-21.6, -15.2],
    [-12.8, -0.2],
    [2.2, 13.8],
    [16.2, 21.6],
  ] as const) {
    b.floorSolid('locker', (x0 + x1) / 2, -4.62, [x1 - x0, 1.9, 0.45]);
  }
  b.prop('water_cooler', -21.5, -0.6)
    .prop('water_cooler', 21.5, -0.6)
    .prop('trash_can', -4, -0.5)
    .prop('trash_can', 8, -0.5)
    .prop('plant_pot', 3.5, -0.6)
    .prop('backpack', -18, -3.9, 0.2)
    .prop('cone', 18.5, -0.8);

  // ---------- Refeitório ----------
  b.floorSolid('counter', -15, 16.3, [10, 1.05, 0.9]);
  for (const x of [-17, -9.5, -2]) {
    for (const z of [4.5, 10]) {
      b.floorSolid('bench', x, z, [4, 0.76, 1.0]);
      b.floorSolid('bench', x, z - 0.95, [4, 0.45, 0.35]);
      b.floorSolid('bench', x, z + 0.95, [4, 0.45, 0.35]);
    }
  }
  b.prop('trash_can', -21.4, 1)
    .prop('trash_can', 3.4, 16.4)
    .prop('box', -21.3, 16.3)
    .prop('box', -20.6, 16.4, 0.4)
    .prop('bucket', -9.5, 15.6)
    .prop('water_cooler', 3.4, 13.5)
    .prop('backpack', -12.2, 6.2, 1.2)
    .prop('chair', -5.5, 13.5, 0.4)
    .prop('chair', -12, 13.8, 2.4)
    .prop('plant_pot', -21.3, 13.5);

  // ---------- Pátio coberto ----------
  b.floorSolid('hedge', 9, 15.8, [8, 0.9, 1.2])
    .floorSolid('hedge', 20.9, 9, [1.2, 0.9, 6])
    .floorSolid('fountain', 14, 9, [3, 0.6, 3]);
  b.floorSolid('bench', 9.5, 5, [2.6, 0.45, 0.6]).floorSolid('bench', 18, 5, [2.6, 0.45, 0.6]).floorSolid('bench', 14, 13.4, [2.6, 0.45, 0.6]);
  b.prop('plant_pot', 5, 1)
    .prop('plant_pot', 21.4, 1)
    .prop('trash_can', 11, 2)
    .prop('cone', 6, 12)
    .prop('cone', 6.6, 12.4)
    .prop('bucket', 19.5, 15.6)
    .prop('backpack', 9.6, 5.1, 0.3, 0.45)
    .prop('box', 4.6, 14.4)
    .prop('lamp', 21.4, 16.3);

  for (const x of [-15, -8, 1, 8, 15]) b.light(x, -11, 0.95);
  for (const x of [-16, -6, 4, 14]) b.light(x, -2.5, 0.8);
  for (const x of [-17, -9, -1]) for (const z of [5, 12]) b.light(x, z, 1);
  for (const z of [5, 12]) b.light(13, z, 0.9, '#fff1d6');

  const hiders: Vec3[] = [];
  for (const x of [-19.5, -16, -12.5, -9, -5.5, -2, 1.5, 5, 10.5, 14.5]) hiders.push([x, 0, -2.3]);
  const hunters: Vec3[] = [];
  for (const x of [-19, -16, -13, -10]) for (const z of [7.25, 13]) hunters.push([x + 0.5, 0, z]);

  return b.build({
    id: 'school',
    name: 'Escola',
    description: 'Salas de aula, biblioteca, refeitório e pátio coberto.',
    size: [W, D],
    theme: { background: '#0e1116', floor: '#4a4038', wall: '#e4e0d6', ambient: '#dfe6ff', fog: '#0e1116' },
    spawns: { hiders, hunters },
  });
}
