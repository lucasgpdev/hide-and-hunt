import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 03 — ESCRITÓRIO
 *
 *   z = -17 ┌────────────┬────────────────┬────────────────┐
 *           │  DIRETORIA │ SALA DE REUNIÃO│ SALA DE SERVIDORES│
 *   z = -7  ├───porta────┴────porta───────┴─────porta──────┤
 *           │          ESTAÇÕES DE TRABALHO (open space)    │
 *   z = 9   ├──passagem──────┐   ENTRADA   ┌────porta──────┤
 *           │   RECEPÇÃO     │             │     COPA       │
 *   z = 17  └────────────────┴─────────────┴────────────────┘
 */
export function buildOffice(): MapDefinition {
  const b = new MapBuilder(3.4);
  const W = 46;
  const D = 34;

  b.perimeter(W, D);
  b.wallX(-7, -23, 23, [
    { at: -16, width: 1.6, kind: 'door' },
    { at: -1, width: 1.8, kind: 'door', open: true },
    { at: 15, width: 1.6, kind: 'door' },
  ]);
  b.wallZ(-9, -17, -7);
  b.wallZ(7, -17, -7, [{ at: -12, width: 1.0, kind: 'secret' }]);
  b.wallX(9, -23, -5, [{ at: -14, width: 3.2 }]);
  b.wallX(9, 5, 23, [{ at: 14, width: 1.6, kind: 'door', open: true }]);
  b.wallZ(-5, 9, 17);
  b.wallZ(5, 9, 17);

  b.zone('Diretoria', [-23, -17, -9, -7], '#3a3028', 'wood')
    .zone('Sala de reunião', [-9, -17, 7, -7], '#4a3f44', 'carpet')
    .zone('Servidores', [7, -17, 23, -7], '#2c3036', 'tilesDark')
    .zone('Open space', [-23, -7, 23, 9], '#4d4a55', 'carpet')
    .zone('Recepção', [-23, 9, -5, 17], '#e0dcd4', 'marble')
    .zone('Entrada', [-5, 9, 5, 17], '#e0dcd4', 'marble')
    .zone('Copa', [5, 9, 23, 17], '#2a2d33', 'tiles');
  b.lightSwitch('Diretoria', -14.4, -7.16)
    .lightSwitch('Sala de reunião', 1.4, -7.16)
    .lightSwitch('Servidores', 12.6, -7.16)
    .lightSwitch('Copa', 11.6, 9.16);

  // ---------- Diretoria ----------
  b.floorSolid('bookshelf', -16, -16.55, [4, 2.2, 0.45]);
  b.prop('table', -16, -12.5)
    .prop('swivel_chair', -16, -13.4)
    .prop('chair', -16.5, -11.4, Math.PI)
    .prop('chair', -15.5, -11.4, Math.PI)
    .prop('monitor', -16.2, -12.6, 0, 0.76)
    .prop('keyboard', -16.2, -12.25, 0, 0.76)
    .prop('mouse', -15.7, -12.25, 0, 0.76)
    .prop('sofa', -22.4, -11.5, Math.PI / 2)
    .prop('lamp', -22.4, -16.4)
    .prop('plant_pot', -9.7, -16.3)
    .prop('cabinet', -10, -9.5, -Math.PI / 2)
    .prop('suitcase', -19.5, -7.6, 0.3)
    .prop('clock', -15.4, -12.7, 0.2, 0.76);

  // ---------- Sala de reunião ----------
  b.floorSolid('bench', -1, -12, [4.6, 0.76, 1.4]);
  for (const x of [-2.6, -1, 0.6]) b.prop('swivel_chair', x, -13.2).prop('swivel_chair', x, -10.8, Math.PI);
  b.prop('swivel_chair', -4, -12, Math.PI / 2)
    .prop('projector', -1, -12, 0, 0.76)
    .prop('whiteboard', -1, -16.4)
    .prop('plant_pot', 6.3, -16.3)
    .prop('plant_pot', -8.3, -16.3)
    .prop('water_cooler', 6.3, -7.7)
    .prop('monitor', 2, -12.2, 0.3, 0.76)
    .prop('trash_can', -8.3, -7.7);

  // ---------- Servidores ----------
  for (const z of [-15, -11.5]) b.floorSolid('locker', 15, z, [8, 2.1, 0.8], '#202428');
  b.prop('electronic_equipment', 9, -16.2)
    .prop('electronic_equipment', 9, -15.6, 0, 0.35)
    .prop('nobreak', 20.4, -9.5)
    .prop('nobreak', 20.9, -9.5)
    .prop('nobreak', 21.4, -9.5)
    .prop('computer', 8, -9)
    .prop('monitor', 8.6, -8, 0.6)
    .prop('box', 22, -16.2)
    .prop('box', 22, -15.4, 0.5)
    .prop('fan', 22.2, -13)
    .prop('chair', 9.4, -9.4, 0.8)
    .prop('cone', 11.5, -8);

  // ---------- Open space ----------
  b.solid('pillar', [-9, 1.7, 0], [0.5, 3.4, 0.5]).solid('pillar', [9, 1.7, 0], [0.5, 3.4, 0.5]);
  for (const x of [-19, -14, -4, 0, 4, 14, 19]) {
    for (const [z, flip] of [
      [-3.4, 1],
      [3.4, -1],
    ] as const) {
      b.prop('table', x, z)
        .prop('swivel_chair', x, z + flip * 0.85, flip > 0 ? Math.PI : 0)
        .prop('monitor', x, z - flip * 0.15, flip > 0 ? 0 : Math.PI, 0.76)
        .prop('keyboard', x, z + flip * 0.2, flip > 0 ? 0 : Math.PI, 0.76);
    }
  }
  b.prop('printer', -9, -5.8)
    .prop('plant_pot', -22.4, -6.4)
    .prop('plant_pot', 22.4, -6.4)
    .prop('plant_pot', -9, 6.5)
    .prop('plant_pot', 9, 6.5)
    .prop('trash_can', -11.5, -6.4)
    .prop('trash_can', 11.5, 6.6)
    .prop('box', 22.3, 8.2)
    .prop('backpack', -14.4, 4.6, 0.6)
    .prop('backpack', 4.4, -4.6, 2.4)
    .prop('water_cooler', -22.4, 2)
    .prop('fan', 22.3, 2)
    .prop('computer', -18.5, -3.5, 0, 0.76)
    .prop('computer', 18.5, 3.5, Math.PI, 0.76)
    .prop('cabinet', -22.5, -1.5, Math.PI / 2);

  // ---------- Recepção ----------
  b.floorSolid('counter', -14, 12.5, [4.5, 1.05, 0.9]);
  b.prop('swivel_chair', -14, 13.6, Math.PI)
    .prop('monitor', -14.6, 12.5, Math.PI, 1.05)
    .prop('sofa', -21.6, 13, Math.PI / 2)
    .prop('sofa', -9, 16.2, Math.PI)
    .prop('table', -18.5, 15.9)
    .prop('plant_pot', -22.3, 16.3)
    .prop('plant_pot', -5.7, 9.8)
    .prop('lamp', -22.3, 9.8)
    .prop('clock', -14, 12.5, 0, 1.05);

  // ---------- Entrada ----------
  b.prop('plant_pot', -4.3, 16.3).prop('plant_pot', 4.3, 16.3).prop('trash_can', 4.3, 10);

  // ---------- Copa ----------
  b.floorSolid('counter', 14, 16.3, [8, 0.95, 0.8]);
  b.floorSolid('stove', 19.6, 16.3, [2.4, 0.95, 0.8]);
  b.floorSolid('freezer', 22.3, 12.5, [0.9, 1.9, 1.6]);
  b.prop('table', 10, 13)
    .prop('chair', 9.4, 12.2)
    .prop('chair', 10.6, 12.2)
    .prop('chair', 9.4, 13.8, Math.PI)
    .prop('chair', 10.6, 13.8, Math.PI)
    .prop('table', 15, 12.5)
    .prop('chair', 15, 11.7)
    .prop('chair', 15, 13.3, Math.PI)
    .prop('water_cooler', 5.6, 16.3)
    .prop('trash_can', 6.2, 16.3)
    .prop('bucket', 12, 16.3, 0, 0.95)
    .prop('box', 22.3, 10.2);

  for (const x of [-18, -6, 6, 18]) for (const z of [-3, 4]) b.light(x, z, 0.9, '#f4f6ff');
  b.light(-16, -12, 0.8, '#ffe9c8');
  b.light(-1, -12, 0.9);
  b.light(15, -12, 0.5, '#bcd2ff');
  b.light(-14, 13, 0.9, '#ffe9c8');
  b.light(0, 13, 0.8);
  b.light(14, 13, 0.9);

  const hiders: Vec3[] = [];
  for (const x of [-20, -16.5, -12, -6, -2, 2, 6, 12, 16.5, 20]) hiders.push([x, 0, 0.3]);
  const hunters: Vec3[] = [];
  for (const x of [-3, -1, 1, 3]) for (const z of [12.5, 14.8]) hunters.push([x, 0, z]);

  return b.build({
    id: 'office',
    name: 'Escritório',
    description: 'Estações de trabalho, diretoria, sala de reunião, servidores e copa.',
    size: [W, D],
    theme: { background: '#0c0f14', floor: '#4d4a55', wall: '#e4e0d6', ambient: '#e8eeff', fog: '#0c0f14' },
    spawns: { hiders, hunters },
  });
}
