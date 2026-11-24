import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 09 — ARMAZÉM
 *
 *   z = -20 ┌──────────┬──────────────────────────────┬──────────┐
 *           │ ESCRITÓRIO│   PRATELEIRAS ALTAS (corredores) │ DESCANSO │
 *   z = -10 ├──porta───┘                              └──porta───┤
 *           │          corredores entre porta-paletes           │
 *   z = 11  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ faixa de carga ─ ─ ─ ─ ─ ─ ─ ─ │
 *           │           DOCA (caminhões e paletes)               │
 *   z = 20  └────────────────────────────────────────────────────┘
 */
export function buildWarehouse(): MapDefinition {
  const b = new MapBuilder(7);
  const W = 56;
  const D = 40;

  b.perimeter(W, D);
  b.withWallHeight(3.2, (w) => {
    w.wallX(-10, -28, -16, [{ at: -22, width: 1.6, kind: 'door' }]);
    w.wallZ(-16, -20, -10);
    w.wallX(-10, 18, 28, [{ at: 23, width: 1.6, kind: 'door', open: true }]);
    w.wallZ(18, -20, -10, [{ at: -15, width: 1.0, kind: 'secret' }]);
  });
  b.roof(-28, -20, -16, -10, 3.2, '#6d6f73').roof(18, -20, 28, -10, 3.2, '#6d6f73');

  b.zone('Armazém', [-28, -20, 28, 11], '#4f4e4a', 'concrete')
    .zone('Escritório do armazém', [-28, -20, -16, -10], '#4a4038', 'vinyl')
    .zone('Descanso', [18, -20, 28, -10], '#2a2d33', 'tiles')
    .zone('Doca', [-28, 11, 28, 20], '#3d3e40', 'asphalt');
  b.lightSwitch('Escritório do armazém', -19.6, -9.84).lightSwitch('Descanso', 20.6, -9.84);

  // ---------- Prateleiras altas ----------
  for (const z of [-15.5]) b.floorSolid('rack', 1, z, [26, 5, 1.2]);
  for (const z of [-6, 0, 6]) {
    for (const x of [-18, 0, 18]) b.floorSolid('rack', x, z, [12, 5, 1.2]);
  }
  b.floorSolid('pallet', -9, -3, [1.2, 1.3, 1.2])
    .floorSolid('pallet', 9.5, 3, [1.2, 1.6, 1.2])
    .floorSolid('pallet', -26.5, 3, [1.2, 1.1, 1.2])
    .floorSolid('pallet', 26.5, -3, [1.2, 1.4, 1.2])
    .floorSolid('pallet', 26.5, -7.6, [1.2, 1.0, 1.2]);
  b.floorSolid('forklift', -6, 9, [2.4, 2.2, 1.2]);
  b.floorSolid('forklift', 12, -11.5, [2.4, 2.2, 1.2]);
  b.prop('box', -14, -3.2)
    .prop('box', -13.4, -3, 0.4)
    .prop('box', -13.7, -3.1, 0.1, 0.5)
    .prop('box', 4, 3.2)
    .prop('box', 4.6, 2.9, 0.7)
    .prop('box', 20, -2.8, 0.2)
    .prop('box', -20, 9)
    .prop('box', -2, -12)
    .prop('box', 6, -12, 0.5)
    .prop('box', 6.6, -12.2, 0.3)
    .prop('box', -24, -12.5)
    .prop('box', 15, 9.5, 0.6)
    .prop('cone', 9, -3)
    .prop('cone', -9, 3)
    .prop('cone', 24, 9)
    .prop('bucket', 14, -2.6)
    .prop('trash_can', -27.4, -9)
    .prop('trash_can', 27.4, 9.5)
    .prop('shopping_cart', -12, 9.4, 1.4)
    .prop('electronic_equipment', 27.3, 1)
    .prop('fan', -27.3, 7)
    .prop('suitcase', 22, 3.1, 0.3)
    .prop('backpack', -5, -3.2, 1.1);

  // ---------- Escritório ----------
  b.prop('table', -22, -16)
    .prop('swivel_chair', -22, -15.1, Math.PI)
    .prop('monitor', -22.2, -16.1, 0, 0.76)
    .prop('keyboard', -22.2, -15.75, 0, 0.76)
    .prop('computer', -21.4, -16.2, 0, 0.76)
    .prop('printer', -27.2, -19.3)
    .prop('cabinet', -27.5, -14, Math.PI / 2)
    .prop('cabinet', -27.5, -13, Math.PI / 2)
    .prop('water_cooler', -16.7, -19.3)
    .prop('plant_pot', -16.7, -10.7)
    .prop('clock', -21.6, -15.8, 0.3, 0.76)
    .prop('box', -18.5, -19.3);

  // ---------- Descanso ----------
  b.floorSolid('counter', 23, -19.4, [6, 0.95, 0.8]);
  b.prop('sofa', 27.4, -15, -Math.PI / 2)
    .prop('table', 22, -14)
    .prop('chair', 21.2, -14)
    .prop('chair', 22.8, -14)
    .prop('chair', 22, -13.2, Math.PI)
    .prop('water_cooler', 18.7, -19.3)
    .prop('trash_can', 18.7, -10.7)
    .prop('lamp', 27.3, -10.7)
    .prop('bucket', 21, -19.4, 0, 0.95)
    .prop('backpack', 26.6, -12, 0.7);

  // ---------- Doca ----------
  b.floorSolid('car', -18, 17, [6.5, 2.8, 2.5], '#e6e6e2');
  b.floorSolid('car', -6, 17, [6.5, 2.8, 2.5], '#3c5a8a');
  for (const x of [5, 8, 11]) b.floorSolid('pallet', x, 18.6, [1.2, 1.5, 1.2]);
  b.floorSolid('pallet', 20, 14.5, [1.2, 1.2, 1.2]);
  b.prop('cone', 1, 13)
    .prop('cone', 1.6, 13.4)
    .prop('cone', -26, 13)
    .prop('box', 14, 18.8)
    .prop('box', 14.6, 18.6, 0.3)
    .prop('box', 26, 19.2)
    .prop('box', 24, 12.5, 0.8)
    .prop('shopping_cart', 17, 18.6, 0.2)
    .prop('trash_can', 27.4, 19.4)
    .prop('bucket', -12.5, 19.4)
    .prop('suitcase', 9.5, 14, 0.9);

  for (const x of [-21, -9, 3, 15, 25]) for (const z of [-12, -3, 3]) b.light(x, z, 1.25, '#f0f2ff');
  for (const x of [-18, -4, 10, 22]) b.light(x, 15.5, 1.2, '#ffe9c8');
  b.light(-22, -15, 0.8, '#ffe9c8', 2.9).light(23, -15, 0.8, '#ffe9c8', 2.9);

  const hiders: Vec3[] = [];
  for (const x of [-22, -17.5, -11, -6, -1, 4.5, 13, 17.5, 22, 25.5]) hiders.push([x, 0, -3]);
  const hunters: Vec3[] = [];
  for (const x of [2, 4.5, 7, 9.5]) for (const z of [12.8, 15]) hunters.push([x + 1.5, 0, z]);

  return b.build({
    id: 'warehouse',
    name: 'Armazém',
    description: 'Prateleiras altas, paletes, empilhadeiras, doca de carga, escritório e copa.',
    size: [W, D],
    theme: { background: '#0b0c0e', floor: '#4f4e4a', wall: '#b9b6ae', ambient: '#e6ecff', fog: '#0b0c0e' },
    spawns: { hiders, hunters },
  });
}
