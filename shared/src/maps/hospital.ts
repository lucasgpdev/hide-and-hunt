import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 07 — HOSPITAL
 *
 *   z = -17 ┌──────────┬──────────┬──────────┬──────────┐
 *           │ QUARTO 1 │ QUARTO 2 │ QUARTO 3 │ QUARTO 4 │
 *   z = -4  ├──porta───┴──porta───┴──porta───┴──porta───┤
 *           │                 CORREDOR                   │
 *   z = 2   ├───porta─────┬                  ┬───porta───┤
 *           │  FARMÁCIA   │    RECEPÇÃO      │ LABORATÓRIO│
 *   z = 17  └─────────────┴──────────────────┴────────────┘
 */
export function buildHospital(): MapDefinition {
  const b = new MapBuilder(3.4);
  const W = 46;
  const D = 34;

  b.perimeter(W, D);
  b.wallX(-4, -23, 23, [
    { at: -17, width: 1.6, kind: 'door', open: true },
    { at: -6, width: 1.6, kind: 'door' },
    { at: 6, width: 1.6, kind: 'door', open: true },
    { at: 17, width: 1.6, kind: 'door' },
  ]);
  b.wallZ(-11.5, -17, -4);
  b.wallZ(0, -17, -4, [{ at: -10, width: 1.0, kind: 'secret' }]);
  b.wallZ(11.5, -17, -4);
  b.wallX(2, -23, -8, [{ at: -15, width: 1.8, kind: 'door', open: true }]);
  b.wallX(2, 8, 23, [{ at: 15, width: 1.8, kind: 'door' }]);
  b.wallZ(-8, 2, 17, [{ at: 10, width: 1.0, kind: 'secret' }]);
  b.wallZ(8, 2, 17);

  b.zone('Quartos', [-23, -17, 23, -4], '#d7d9d6', 'vinyl')
    .zone('Corredor', [-23, -4, 23, 2], '#c9ccc8', 'tiles')
    .zone('Farmácia', [-23, 2, -8, 17], '#2a2d33', 'tiles')
    .zone('Recepção', [-8, 2, 8, 17], '#e0dcd4', 'marble')
    .zone('Laboratório', [8, 2, 23, 17], '#2c3036', 'tilesDark');
  b.lightSwitch('Quartos', -14.6, -4.16).lightSwitch('Farmácia', -12.4, 2.16).lightSwitch('Laboratório', 12.4, 2.16);

  // ---------- Quartos ----------
  for (const [x0, x1] of [
    [-23, -11.5],
    [-11.5, 0],
    [0, 11.5],
    [11.5, 23],
  ] as const) {
    const cx = (x0 + x1) / 2;
    b.floorSolid('bed', x0 + 1.3, -13.5, [1.1, 1.1, 2.2], 'fabric.gray');
    b.floorSolid('bed', x0 + 1.3, -8.8, [1.1, 1.1, 2.2], 'fabric.gray');
    b.prop('electronic_equipment', x0 + 0.5, -15.7)
      .prop('electronic_equipment', x0 + 0.5, -11, 0, 0)
      .prop('chair', x0 + 3, -13.5, -Math.PI / 2)
      .prop('chair', x0 + 3, -8.8, -Math.PI / 2)
      .prop('cabinet', x1 - 0.5, -15, -Math.PI / 2)
      .prop('trash_can', x1 - 0.5, -12.6)
      .prop('plant_pot', x1 - 0.6, -5)
      .prop('lamp', cx + 1, -16.4)
      .prop('table', cx + 1.5, -9)
      .prop('clock', cx + 1.6, -9.1, 0.3, 0.76);
  }
  b.prop('suitcase', -4, -6.4, 0.4).prop('backpack', 14.5, -5.2, 1.1).prop('fan', 21, -16.3);

  // ---------- Corredor ----------
  b.prop('water_cooler', -22.5, 1.4)
    .prop('water_cooler', 22.5, -3.4)
    .prop('trash_can', -11.5, -3.4)
    .prop('trash_can', 11.5, 1.4)
    .prop('plant_pot', 0, -3.4)
    .prop('cone', 4, 1.3)
    .prop('bucket', 4.5, 1.5)
    .prop('shopping_cart', -20, -3.2, Math.PI / 2);

  // ---------- Farmácia ----------
  for (const z of [6, 10, 14]) b.floorSolid('shelf', -19, z, [6, 2.0, 0.9]);
  b.floorSolid('counter', -10, 9, [1.0, 1.05, 5]);
  b.prop('computer', -10, 8, 0, 1.05)
    .prop('monitor', -10, 9.5, -Math.PI / 2, 1.05)
    .prop('swivel_chair', -11.2, 9, Math.PI / 2)
    .prop('box', -22.4, 16.4)
    .prop('box', -21.7, 16.4, 0.4)
    .prop('box', -13.5, 16.4)
    .prop('cabinet', -15, 16.6)
    .prop('trash_can', -9, 16.4)
    .prop('printer', -9, 3);

  // ---------- Recepção ----------
  b.floorSolid('counter', 0, 7.5, [6, 1.05, 0.9]);
  b.prop('swivel_chair', -1, 8.5, Math.PI)
    .prop('swivel_chair', 1, 8.5, Math.PI)
    .prop('monitor', -1, 7.4, Math.PI, 1.05)
    .prop('computer', 1.5, 7.4, 0, 1.05)
    .prop('plant_pot', -7.3, 16.3)
    .prop('plant_pot', 7.3, 16.3)
    .prop('water_cooler', 7.3, 3)
    .prop('clock', 0.4, 7.5, 0, 1.05);
  for (const x of [-6, -4.8, -3.6, 3.6, 4.8, 6]) b.prop('chair', x, 11, Math.PI);

  // ---------- Laboratório ----------
  b.floorSolid('lab_desk', 15.5, 6.5, [6, 0.9, 1.2]).floorSolid('lab_desk', 15.5, 11, [6, 0.9, 1.2]);
  b.floorSolid('freezer', 22.4, 15, [0.9, 1.9, 2.8]);
  b.prop('electronic_equipment', 14, 6.5, 0, 0.9)
    .prop('computer', 17, 6.5, 0, 0.9)
    .prop('monitor', 15.5, 11, Math.PI, 0.9)
    .prop('swivel_chair', 14, 7.6, Math.PI)
    .prop('swivel_chair', 17, 12.1, Math.PI)
    .prop('lamp', 9, 16.3)
    .prop('box', 12, 16.4)
    .prop('nobreak', 22.6, 3)
    .prop('trash_can', 9, 3);

  for (const x of [-17, -6, 6, 17]) b.light(x, -11, 0.65, '#f2f8ff');
  for (const x of [-16, -5, 5, 16]) b.light(x, -1, 0.5, '#f2f8ff');
  b.light(-16, 9, 0.7, '#f2f8ff').light(0, 10, 0.75, '#fff4e0').light(15.5, 9, 0.7, '#e6f2ff');

  const hiders: Vec3[] = [];
  for (const x of [-20, -16, -12, -8, -4, 1, 5, 9, 13, 18]) hiders.push([x, 0, -0.8]);
  const hunters: Vec3[] = [];
  for (const x of [-4.5, -1.5, 1.5, 4.5]) for (const z of [13.5, 15.7]) hunters.push([x, 0, z]);

  return b.build({
    id: 'hospital',
    name: 'Hospital',
    description: 'Quartos de internação, corredor, recepção, farmácia e laboratório.',
    size: [W, D],
    theme: { background: '#0c1013', floor: '#d7d9d6', wall: '#eef0ee', ambient: '#eaf4ff', fog: '#0c1013' },
    spawns: { hiders, hunters },
  });
}
