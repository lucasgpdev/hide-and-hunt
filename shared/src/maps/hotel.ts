import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 10 — HOTEL
 *
 *   z = -18 ┌──────────┬──────────┬──────────┬──────────┐
 *           │ SUÍTE 101│ SUÍTE 102│ SUÍTE 103│ SUÍTE 104│
 *   z = -2  ├──porta───┴──porta───┴──porta───┴──porta───┤
 *           │        CORREDOR (elevadores)                │
 *   z = 4   ├────passagem─────────────┬────passagem───────┤
 *           │     SAGUÃO / RECEPÇÃO    │   CAFÉ DA MANHÃ   │
 *   z = 18  └─────────────────────────┴───────────────────┘
 */
export function buildHotel(): MapDefinition {
  const b = new MapBuilder(3.4);
  const W = 46;
  const D = 36;

  b.perimeter(W, D);
  b.wallX(-2, -23, 23, [
    { at: -17, width: 1.4, kind: 'door' },
    { at: -6, width: 1.4, kind: 'door', open: true },
    { at: 6, width: 1.4, kind: 'door' },
    { at: 17, width: 1.4, kind: 'door', open: true },
  ]);
  b.wallZ(-11.5, -18, -2, [{ at: -8, width: 1.0, kind: 'secret' }]);
  b.wallZ(0, -18, -2);
  b.wallZ(11.5, -18, -2, [{ at: -14, width: 1.0, kind: 'secret' }]);
  b.wallX(4, -23, 23, [
    { at: -12, width: 4 },
    { at: 15, width: 3 },
  ]);
  b.wallZ(8, 4, 18, [{ at: 11, width: 1.6, kind: 'door', open: true }]);

  b.zone('Suítes', [-23, -18, 23, -2], '#4a3f44', 'carpet')
    .zone('Corredor', [-23, -2, 23, 4], '#5a4b44', 'carpet')
    .zone('Saguão', [-23, 4, 8, 18], '#e0dcd4', 'marble')
    .zone('Café da manhã', [8, 4, 23, 18], '#3a3028', 'wood');
  b.lightSwitch('Suítes', -15.6, -2.16).lightSwitch('Café da manhã', 8.16, 7);

  // ---------- Suítes ----------
  const suites: [number, number][] = [
    [-23, -11.5],
    [-11.5, 0],
    [0, 11.5],
    [11.5, 23],
  ];
  suites.forEach(([x0, x1], i) => {
    const cx = (x0 + x1) / 2;
    b.floorSolid('bed', cx, -16.65, [2.0, 1.0, 2.2], i % 2 ? 'fabric.blue' : 'fabric.gray');
    // Divisória do banheiro.
    b.floorSolid('pillar', x1 - 2.2, -15.5, [0.15, 2.4, 5], '#d8d2c6');
    b.prop('lamp', cx - 1.5, -17.5)
      .prop('lamp', cx + 1.5, -17.5)
      .prop('table', x0 + 1.5, -6)
      .prop('chair', x0 + 1.5, -6.8)
      .prop('monitor', x0 + 1.5, -5.8, Math.PI, 0.76)
      .prop('cabinet', x0 + 0.5, -10, Math.PI / 2)
      .prop('suitcase', cx + 1.4, -13.6, 0.3 + i)
      .prop('trash_can', x1 - 1.1, -17.4)
      .prop('bucket', x1 - 1.1, -14)
      .prop('plant_pot', x1 - 0.6, -3)
      .prop('clock', x0 + 1.9, -5.9, 0.2, 0.76);
  });
  b.prop('backpack', -14, -12, 0.6).prop('sofa', 5.8, -9, 0).prop('fan', 22.4, -9);

  // ---------- Corredor ----------
  for (const x of [-2.5, 0.5, 3.5]) b.floorSolid('elevator', x, 3.7, [2.2, 2.6, 0.3]);
  b.prop('plant_pot', -22.4, 3.3)
    .prop('plant_pot', 22.4, 3.3)
    .prop('trash_can', -9, -1.5)
    .prop('trash_can', 9, -1.5)
    .prop('water_cooler', 22.4, -1.4)
    .prop('shopping_cart', -20, 2.8, Math.PI / 2);

  // ---------- Saguão ----------
  b.floorSolid('counter', -19, 11, [1.0, 1.1, 6]);
  b.floorSolid('fountain', -4, 12, [3.2, 0.6, 3.2]);
  b.prop('swivel_chair', -20.2, 10, Math.PI / 2)
    .prop('swivel_chair', -20.2, 12, Math.PI / 2)
    .prop('computer', -19, 9.5, Math.PI / 2, 1.1)
    .prop('monitor', -19, 12.5, -Math.PI / 2, 1.1)
    .prop('clock', -19, 11, -Math.PI / 2, 1.1)
    .prop('sofa', -12, 17.3, Math.PI)
    .prop('sofa', 3, 17.3, Math.PI)
    .prop('table', -8, 16.8)
    .prop('lamp', -22.3, 17.3)
    .prop('lamp', 7.3, 17.3)
    .prop('plant_pot', -22.3, 4.8)
    .prop('plant_pot', 7.3, 4.8)
    .prop('suitcase', -15, 8.5, 0.4)
    .prop('suitcase', -14.5, 8.7, 1.1)
    .prop('backpack', -14.8, 9.4, 0.3)
    .prop('shopping_cart', 2, 6, 0.6);

  // ---------- Café da manhã ----------
  b.floorSolid('counter', 15.5, 17.4, [8, 0.95, 0.8]);
  for (const [x, z] of [
    [11, 8],
    [15.5, 8],
    [20, 8],
    [11, 12.5],
    [15.5, 12.5],
    [20, 12.5],
  ] as const) {
    b.prop('table', x, z).prop('chair', x - 0.4, z - 0.75).prop('chair', x + 0.4, z + 0.75, Math.PI);
  }
  b.prop('water_cooler', 22.4, 17.3)
    .prop('trash_can', 8.8, 17.3)
    .prop('bucket', 13, 17.4, 0, 0.95)
    .prop('box', 18, 17.4, 0.2, 0.95);

  for (const [x0, x1] of suites) b.light((x0 + x1) / 2, -11, 0.85, '#ffe2b8');
  for (const x of [-18, -9, 0, 9, 18]) b.light(x, 1, 0.75, '#ffe2b8');
  for (const x of [-16, -6, 3]) b.light(x, 11, 1, '#fff4e0');
  b.light(15.5, 10, 1, '#ffe9c8');

  const hiders: Vec3[] = [];
  for (const x of [-21, -17, -13, -9, -5.5, 6, 9.5, 13, 17, 20.5]) hiders.push([x, 0, 1]);
  const hunters: Vec3[] = [];
  for (const x of [-11, -8.8]) for (const z of [6.5, 9, 11.5, 14]) hunters.push([x, 0, z]);

  return b.build({
    id: 'hotel',
    name: 'Hotel',
    description: 'Suítes, corredor com elevadores, saguão com recepção e café da manhã.',
    size: [W, D],
    theme: { background: '#0e0c0b', floor: '#4a3f44', wall: '#e9e1d2', ambient: '#ffe2b8', fog: '#0e0c0b' },
    spawns: { hiders, hunters },
  });
}
