import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * LOBBY 3D (item 31): salão onde os jogadores esperam a partida, andam,
 * fazem emotes e votam no mapa. Não entra na votação.
 */
export function buildLobby(): MapDefinition {
  const b = new MapBuilder(4.2);
  const W = 22;
  const D = 16;
  b.perimeter(W, D);
  b.zone('Salão', [-11, -8, 11, 8], '#3a3028', 'wood');
  b.zone('Palco', [-5, -8, 5, -4.5], '#2a2d33', 'carpet');

  b.floorSolid('counter', 0, -6.2, [10, 0.5, 3.4]);
  b.floorSolid('pillar', -7, 0, [0.6, 4.2, 0.6]);
  b.floorSolid('pillar', 7, 0, [0.6, 4.2, 0.6]);
  b.floorSolid('bench', -9.6, 4, [0.6, 0.45, 4]);
  b.floorSolid('bench', 9.6, 4, [0.6, 0.45, 4]);

  b.prop('sofa', -6, 6.9, Math.PI)
    .prop('sofa', 6, 6.9, Math.PI)
    .prop('plant_pot', -10.4, -7.4)
    .prop('plant_pot', 10.4, -7.4)
    .prop('plant_pot', -10.4, 7.4)
    .prop('plant_pot', 10.4, 7.4)
    .prop('lamp', -8.2, 7.4)
    .prop('lamp', 8.2, 7.4)
    .prop('water_cooler', 10.5, 0, -Math.PI / 2)
    .prop('table', 0, 3)
    .prop('chair', -0.4, 3.9, Math.PI)
    .prop('chair', 0.4, 2.1)
    .prop('box', -3, -3.9)
    .prop('cone', 3.2, -3.9)
    .prop('clock', 0, -5.3, 0, 0.5)
    .prop('fan', -10.4, -2)
    .prop('backpack', -9.6, 3, 0.3, 0.45)
    .prop('suitcase', 9.6, 5, -0.4, 0.45);

  for (const x of [-6, 0, 6]) for (const z of [-3, 4]) b.light(x, z, 1.1, '#ffe7c4');

  const hiders: Vec3[] = [];
  for (const x of [-4, -2, 0, 2, 4]) for (const z of [0, 1.5]) hiders.push([x, 0, z]);
  return b.build({
    id: 'lobby',
    name: 'Lobby',
    description: 'Salão de espera.',
    size: [W, D],
    theme: { background: '#0d1016', floor: '#3a3028', wall: '#d9cbb3', ambient: '#ffe7c4', fog: '#0d1016' },
    spawns: { hiders, hunters: hiders },
    lobbyOnly: true,
  });
}
