import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA — SALA DE AULA CLÁSSICA
 *
 * Cenário realista "Classroom", de Christophe Seux (arquivos de demonstração
 * do Blender, licença CC0), convertido para glTF. As paredes e móveis fixos
 * viram só colisão invisível; as carteiras, as poltronas e o cesto do próprio
 * cenário são objetos em que os escondidos podem se transformar.
 *
 *   z = -3,8 ┌──────────┬──── lousa ─────────────┐
 *            │          porta   mesa do professor │ janelas
 *            │ CORREDOR │   carteiras (4 × 5)     │ (radiadores)
 *            │          porta                     │
 *   z =  4,0 └──────────┴─────────────────────────┘
 *          x = -4,5   x = -1,6               x = 4,5
 */

/** Coordenadas do cenário original → coordenadas do mapa (centrado na origem). */
const OX = -0.945;
const OZ = 0.61;
const sx = (x: number) => +(x - OX).toFixed(3);
const sz = (z: number) => +(z - OZ).toFixed(3);

/** Carteiras do cenário: x, z, rotação (colunas um pouco afastadas para dar corredor). */
const DESKS: [number, number, number][] = [
  [-0.331, -0.55, 0.005],
  [-0.323, 0.286, 0.08],
  [-0.332, 1.117, -0.046],
  [-0.395, 1.949, 0.068],
  [-0.391, 2.897, 0.08],
  [1.025, -0.649, -0.08],
  [0.968, 0.348, -0.08],
  [1.006, 1.197, 0.07],
  [1.023, 2.036, 0.08],
  [1.001, 3.038, 0.08],
  [2.409, -0.495, 0.044],
  [2.441, 0.324, -0.051],
  [2.455, 1.153, 0.08],
  [2.396, 1.955, 0.015],
  [2.375, 2.815, 0.08],
  [3.641, -0.551, -0.047],
  [3.705, 0.303, 0.08],
  [3.659, 1.117, 0.08],
  [3.693, 1.95, -0.077],
  [3.625, 2.873, 0.08],
];

const LEATHER_CHAIRS: [number, number, number][] = [
  [3.563, -2.949, -1.949],
  [-0.216, -2.996, -0.414],
];

export function buildClassicClassroom(): MapDefinition {
  const b = new MapBuilder(2.9);
  const W = 9.45;
  const D = 8.36;

  /** Caixa de colisão invisível a partir de limites no cenário original. */
  const block = (x0: number, x1: number, z0: number, z1: number, h: number, y0 = 0): void => {
    b.solids.push({
      kind: 'wall',
      center: [+((sx(x0) + sx(x1)) / 2).toFixed(3), +(y0 + h / 2).toFixed(3), +((sz(z0) + sz(z1)) / 2).toFixed(3)],
      size: [+(x1 - x0).toFixed(3), h, +(z1 - z0).toFixed(3)],
      invisible: true,
    });
  };

  // ---------- paredes ----------
  block(-5.67, -5.47, -3.57, 4.79, 2.95); // fundo do corredor
  block(3.58, 3.9, -3.57, 4.79, 2.95); // janelas
  block(-2.45, 3.58, -3.57, -3.17, 2.95); // lousa
  block(-5.47, -2.45, -3.57, -3.28, 2.95); // ponta do corredor (frente)
  block(-5.47, 3.58, 4.6, 4.79, 2.95); // fundo
  // parede entre o corredor e a sala, com duas portas
  block(-2.64, -2.45, -3.28, -2.46, 2.95);
  block(-2.64, -2.45, -1.5, 3.27, 2.95);
  block(-2.64, -2.45, 4.19, 4.6, 2.95);
  block(-2.64, -2.45, -2.46, -1.5, 0.4, 2.55);
  block(-2.64, -2.45, 3.27, 4.19, 0.4, 2.55);
  // folhas das portas, abertas encostadas no batente
  block(-2.45, -1.51, -2.47, -2.41, 2.05);
  block(-2.45, -1.56, 4.18, 4.24, 2.05);

  // ---------- móveis fixos ----------
  block(1.6, 2.98, -1.83, -1.24, 0.82); // mesa do professor
  block(-0.72, -0.43, -3.11, -2.82, 1.74); // cabideiro
  block(3.34, 3.58, 2.15, 3.3, 0.74); // radiadores
  block(3.34, 3.58, 0.21, 1.37, 0.74);
  block(3.34, 3.58, -1.65, -0.49, 0.74);

  // ---------- objetos do próprio cenário ----------
  for (const [x, z, yaw] of DESKS) b.prop('classroom_desk', x, z, yaw);
  for (const [x, z, yaw] of LEATHER_CHAIRS) b.prop('leather_chair', x, z, yaw);
  b.prop('wastebasket', sx(-1.993), sz(-2.974));

  // ---------- extras realistas (Poly Haven) ----------
  b.prop('box', sx(3.25), sz(-2.84))
    .prop('trash_can', sx(3.2), sz(4.3))
    .prop('cabinet', sx(-5.2), sz(-2.6), Math.PI / 2)
    .prop('sofa', sx(-5.03), sz(-0.6), Math.PI / 2)
    .prop('cabinet', sx(-5.2), sz(1.4), Math.PI / 2)
    .prop('suitcase', sx(-5.3), sz(2.55), Math.PI / 2)
    .prop('box', sx(-5.1), sz(4.25), 0.3)
    .prop('box', sx(-4.45), sz(4.27), -0.15)
    .prop('box', sx(-5.08), sz(4.22), 0.9, 0.5)
    .prop('chair', sx(-2.95), sz(1.8), -Math.PI / 2)
    .prop('trash_can', sx(-2.95), sz(-3.05))
    .prop('clock', sx(-2.68), sz(0.9), -Math.PI / 2, 1.75);

  b.zone('Sala de aula', [sx(-2.45), sz(-3.17), sx(3.58), sz(4.6)], '#6b4f36', 'wood')
    .zone('Corredor', [sx(-5.47), sz(-3.28), sx(-2.64), sz(4.6)], '#5a4a3c', 'wood');
  b.lightSwitch('Sala de aula', sx(-2.43), sz(-1.12));

  // Luminárias do cenário (sala) e do corredor.
  for (const [x, z] of [[-0.6, 2.73], [-0.6, 0.67], [2.0, 0.67], [2.0, -1.41], [-0.6, -1.41], [2.0, 2.73]] as const) {
    b.lights.push({ position: [sx(x), 2.2, sz(z)], color: '#ffe2b8', intensity: 0.22, hidden: true });
  }
  b.light(sx(-4.05), sz(-1.6), 0.6, '#ffe7c4', 2.88).light(sx(-4.05), sz(2.4), 0.6, '#ffe7c4', 2.88);

  const hiders: Vec3[] = [];
  for (const x of [-1.95, -0.62, 0.77, 2.1]) for (const z of [1.3, 3.0]) hiders.push([sx(x), 0, sz(z)]);
  // Frente da sala (entre a primeira fila e a mesa do professor).
  for (const x of [-1.95, -0.62, 0.77, 1.2]) hiders.push([sx(x), 0, sz(-0.85)]);
  const hunters: Vec3[] = [];
  for (const x of [-4.1, -3.4]) for (const z of [-2.4, -1.2, 0, 1.2, 2.4, 3.6]) hunters.push([sx(x), 0, sz(z)]);

  return b.build({
    id: 'classic_classroom',
    name: 'Sala de Aula Clássica',
    description: 'Sala de aula antiga e realista, com corredor. Ideal para grupos pequenos.',
    size: [W, D],
    theme: { background: '#c9dbe8', floor: '#6b4f36', wall: '#d6ccb4', ambient: '#ffe7c4', fog: '#c9dbe8' },
    scene: { url: '/models/maps/classroom.glb', offset: [-OX, 0, -OZ], sunFrom: [9, 6, -2.5], sunIntensity: 2.4 },
    spawns: { hiders, hunters },
  });
}
