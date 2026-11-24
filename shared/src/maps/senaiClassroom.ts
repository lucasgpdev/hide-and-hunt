import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 05 — SENAI CLASSROOM (escola técnica genérica, sem marcas oficiais)
 *
 *   z = -15 ┌─────────────────────┬─────────────────────┐
 *           │    SALA DE AULA     │   LAB. INFORMÁTICA  │
 *   z = -2  ├────porta────────────┴────────porta───────┤
 *           │               CORREDOR                    │
 *   z = 2   ├────porta────────────┬────────porta───────┤
 *           │    ÁREA TÉCNICA     │    ALMOXARIFADO     │
 *   z = 15  └─────────────────────┴─────────────────────┘
 *   (portas internas ligam sala<->laboratório e área técnica<->almoxarifado)
 */
export function buildSenaiClassroom(): MapDefinition {
  const b = new MapBuilder(3.6);
  const W = 40;
  const D = 30;

  b.perimeter(W, D);
  const roomDoors = [
    { at: -11, width: 1.8, kind: 'door' as const },
    { at: 11, width: 1.8, kind: 'door' as const, open: true },
  ];
  b.wallX(-2, -20, 20, roomDoors);
  b.wallX(2, -20, 20, roomDoors);
  // Portas internas e passagens secretas (parecem parede até alguém abrir).
  b.wallZ(0, -15, -2, [
    { at: -8, width: 1.2, kind: 'door' },
    { at: -5, width: 1.0, kind: 'secret' },
  ]);
  b.wallZ(0, 2, 15, [
    { at: 8, width: 1.2, kind: 'door' },
    { at: 11.5, width: 1.0, kind: 'secret' },
  ]);
  b.lightSwitch('Sala de aula', -12.4, -2.16)
    .lightSwitch('Laboratório de informática', 12.4, -2.16)
    .lightSwitch('Área técnica', -12.4, 2.16)
    .lightSwitch('Almoxarifado', 12.4, 2.16);

  b.zone('Sala de aula', [-20, -15, 0, -2], '#4a4038', 'vinyl');
  b.zone('Laboratório de informática', [0, -15, 20, -2], '#2f3a46', 'tilesDark');
  b.zone('Corredor', [-20, -2, 20, 2], '#5a5a56', 'tiles');
  b.zone('Área técnica', [-20, 2, 0, 15], '#3c3f3a', 'concrete');
  b.zone('Almoxarifado', [0, 2, 20, 15], '#35322d', 'concrete');

  // ---------- Sala de aula ----------
  b.solid('chalkboard', [-10, 1.6, -14.8], [5, 1.3, 0.1]);
  b.floorSolid('teacher_desk', -10, -12.6, [1.8, 0.78, 0.8]);
  b.prop('swivel_chair', -10, -13.6)
    .prop('projector', -9.3, -12.6, 0, 0.78)
    .prop('computer', -10.6, -12.7, 0, 0.78)
    .prop('clock', -10, -12.4, 0.2, 0.78)
    .prop('whiteboard', -16.5, -14.4)
    .prop('cabinet', -0.5, -13.6, -Math.PI / 2)
    .prop('cabinet', -0.5, -12.6, -Math.PI / 2)
    .prop('fan', -19.3, -14.3)
    .prop('fan', -19.3, -3)
    .prop('trash_can', -19.3, -8)
    .prop('plant_pot', -1, -14.3)
    .prop('backpack', -15.5, -9.3, 0.4)
    .prop('backpack', -9.4, -5.4, -0.3)
    .prop('backpack', -3.5, -7.3, 0.9)
    .prop('backpack', -12.4, -3.4, 0.1);
  for (const z of [-10, -8, -6, -4.2]) {
    for (const x of [-16, -13, -10, -7, -4]) b.prop('school_desk', x, z, Math.PI);
  }

  // ---------- Laboratório de informática ----------
  for (const z of [-12.5, -9, -5.5]) {
    b.floorSolid('lab_desk', 10.5, z, [14, 0.76, 0.9]);
    for (const x of [5, 9, 13, 17]) {
      b.prop('monitor', x, z - 0.15, 0, 0.76)
        .prop('keyboard', x, z + 0.25, 0, 0.76)
        .prop('mouse', x + 0.38, z + 0.25, 0, 0.76)
        .prop('swivel_chair', x, z + 0.95, Math.PI);
    }
    b.prop('computer', 6.4, z - 0.1, 0, 0.76).prop('computer', 14.4, z - 0.1, 0, 0.76);
    b.prop('nobreak', 2.8, z);
  }
  b.prop('table', 18.6, -14.3)
    .prop('printer', 18.6, -14.3, 0, 0.76)
    .prop('cabinet', 0.5, -14.2, Math.PI / 2)
    .prop('trash_can', 19.4, -2.8)
    .prop('electronic_equipment', 1.2, -3)
    .prop('fan', 19.3, -8);

  // ---------- Corredor ----------
  b.floorSolid('bench', -15, 1.55, [2, 0.45, 0.45]);
  b.floorSolid('bench', 15, -1.55, [2, 0.45, 0.45]);
  b.floorSolid('locker', 4, -1.6, [3, 1.9, 0.5]);
  b.floorSolid('locker', -5, 1.6, [3, 1.9, 0.5]);
  b.prop('water_cooler', -19.5, 0, Math.PI / 2)
    .prop('water_cooler', 19.5, 0.6, -Math.PI / 2)
    .prop('trash_can', -6, -1.6)
    .prop('trash_can', 7, 1.6)
    .prop('plant_pot', 0, 1.5)
    .prop('lamp', 19.4, -1.5)
    .prop('cabinet', -2.4, 1.55, Math.PI)
    .prop('box', 8.5, -1.5, 0.3);

  // ---------- Área técnica ----------
  for (const [x, z] of [
    [-15, 6],
    [-6, 6],
    [-15, 11],
    [-6, 11],
  ] as const) {
    b.floorSolid('bench', x, z, [5, 0.9, 1.2]);
  }
  b.prop('electronic_equipment', -16, 6, 0.1, 0.9)
    .prop('electronic_equipment', -5, 11, -0.2, 0.9)
    .prop('electronic_equipment', -6.8, 6, 0, 0.9)
    .prop('box', -14, 11, 0.3, 0.9)
    .prop('monitor', -14.4, 6, 0, 0.9)
    .prop('keyboard', -7.6, 11.2, 0, 0.9)
    .prop('nobreak', -17.2, 10.2)
    .prop('cabinet', -19.6, 4, Math.PI / 2)
    .prop('cabinet', -19.6, 8.5, Math.PI / 2)
    .prop('chair', -16, 7.1, Math.PI)
    .prop('chair', -6, 7.1, Math.PI)
    .prop('chair', -14, 12.1, Math.PI)
    .prop('fan', -1, 14.2)
    .prop('trash_can', -1, 2.8)
    .prop('bucket', -10, 14.3)
    .prop('box', -18.8, 14.2)
    .prop('backpack', -10.5, 8.6, 1.2);

  // ---------- Almoxarifado ----------
  for (const x of [6, 11, 16]) b.floorSolid('rack', x, 9.6, [0.9, 2.6, 7]);
  b.prop('box', 3, 4)
    .prop('box', 3.7, 4.6, 0.5)
    .prop('box', 3.2, 4.3, 0.2, 0.5)
    .prop('box', 8.5, 14.2)
    .prop('box', 13.5, 3.6, 0.4)
    .prop('box', 18.8, 4)
    .prop('box', 19, 5, 0.3)
    .prop('box', 18.9, 4.5, 0.8, 0.5)
    .prop('box', 8.5, 5)
    .prop('box', 13.5, 14.3)
    .prop('bucket', 2.8, 13.5)
    .prop('cone', 13.5, 8)
    .prop('electronic_equipment', 18.8, 13)
    .prop('suitcase', 2.5, 9, 0.5)
    .prop('printer', 18.8, 9.5)
    .prop('fan', 19.3, 14.3);

  for (const x of [-15, -5]) for (const z of [-11, -5.5, 6, 11]) b.light(x, z, 0.85);
  for (const x of [5, 15]) for (const z of [-11, -5.5, 6, 11]) b.light(x, z, 0.85, x > 0 && z < 0 ? '#e4ecff' : '#fff4e0');
  for (const x of [-14, -4, 6, 16]) b.light(x, 0, 0.6, '#f4f6ff');

  const hiders: Vec3[] = [];
  for (const x of [-17, -15, -13, -11, -9, -7, -5, -3]) for (const z of [-0.7, 0.7]) hiders.push([x, 0, z]);
  const hunters: Vec3[] = [];
  for (const x of [12, 14, 16, 18]) for (const z of [-0.6, 0.8]) hunters.push([x, 0, z]);

  return b.build({
    id: 'senai_classroom',
    name: 'SENAI Classroom',
    description: 'Sala de aula técnica, laboratório de informática, área técnica, almoxarifado e corredor.',
    size: [W, D],
    theme: { background: '#0e1117', floor: '#4a4a46', wall: '#d9d6cc', ambient: '#d8e0ff', fog: '#0e1117' },
    spawns: { hiders, hunters },
  });
}
