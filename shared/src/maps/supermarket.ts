import { MapBuilder } from './builder.js';
import type { MapDefinition, Vec3 } from './types.js';

/**
 * MAPA 01 — SUPERMARKET
 * Área de vendas com corredores, freezers, hortifrúti, padaria e caixas;
 * nos fundos, escritório e depósito/estoque ligados por uma porta interna.
 *
 *   z = -16 ┌──────────────┬───────────────────────────────┐
 *           │  ESCRITÓRIO  │         ESTOQUE / DEPÓSITO     │
 *   z = -6  ├──porta───────┴──────porta──────────porta─────┤
 *           │ freezers │ corredores de prateleiras │ hortifrúti
 *           │          │                           │ padaria
 *   z = 16  └───────── caixas ─────── entrada ─────────────┘
 */
export function buildSupermarket(): MapDefinition {
  const b = new MapBuilder(4.5);
  const W = 44;
  const D = 32;

  b.perimeter(W, D);
  // Parede dos fundos (área de vendas x fundos) e divisória escritório/estoque.
  b.wallX(-6, -22, 22, [
    { at: -14, width: 2, kind: 'door' },
    { at: -8.5, width: 1.2, kind: 'secret' },
    { at: 0, width: 3 },
    { at: 14, width: 2, kind: 'door', open: true },
  ]);
  b.wallZ(-6, -16, -6, [{ at: -11, width: 1.6, kind: 'door' }]);
  b.lightSwitch('Escritório', -15.4, -6.16)
    .lightSwitch('Estoque', 12.6, -6.16)
    .lightSwitch('Área de vendas', -21.86, 14)
    .lightSwitch('Hortifrúti', 21.86, 6);

  b.zone('Área de vendas', [-22, -6, 22, 16], '#2a2d33', 'tiles');
  b.zone('Hortifrúti', [12, -6, 22, 10], '#2e3a2c', 'tilesDark');
  b.zone('Escritório', [-22, -16, -6, -6], '#3a3028', 'wood');
  b.zone('Estoque', [-6, -16, 22, -6], '#25272b', 'concrete');

  // ---------- Área de vendas ----------
  b.floorSolid('freezer', -21.3, 3, [1.1, 1.9, 14]);
  for (const x of [-16, -10, -4, 2, 8]) b.floorSolid('shelf', x, 2, [1.0, 2.1, 11]);
  b.floorSolid('produce', 15, -1, [3, 0.9, 1.6]);
  b.floorSolid('produce', 15, 3.5, [3, 0.9, 1.6]);
  b.floorSolid('produce', 19.6, 1.2, [1.6, 0.9, 6]);
  b.floorSolid('counter', 16, -5.2, [8, 1.05, 0.9]);
  for (const x of [-15, -10, -5]) b.floorSolid('checkout', x, 12, [0.9, 1.0, 2.6]);
  b.solid('pillar', [-7, 2.25, 10], [0.5, 4.5, 0.5]);
  b.solid('pillar', [5, 2.25, 10], [0.5, 4.5, 0.5]);

  b.prop('shopping_cart', 2, 14.4)
    .prop('shopping_cart', 2.8, 14.4)
    .prop('shopping_cart', 3.6, 14.4)
    .prop('shopping_cart', -12.6, 8.5, 0.4)
    .prop('shopping_cart', 11, 9, 1.2)
    .prop('shopping_cart', -1, -1, 0.3)
    .prop('box', -7, -4.5, 0.2)
    .prop('box', 5, -4.8, 0.3)
    .prop('box', 5.1, -4.8, 0.9, 0.5)
    .prop('box', 12.4, -3)
    .prop('box', -18.5, 9)
    .prop('box', 19.5, 10.4)
    .prop('cone', 0, 9)
    .prop('cone', -7, 5.5)
    .prop('bucket', 0.6, 9.4)
    .prop('trash_can', -19, 14.8)
    .prop('trash_can', 7, 14.9)
    .prop('trash_can', 20.8, 14.6)
    .prop('plant_pot', -21.2, 15.2)
    .prop('plant_pot', 21.2, 15.2)
    .prop('clock', -15, 11.2, 0, 1.0)
    .prop('suitcase', -3, 14.6, 0.3)
    .prop('lamp', 18, 15.1)
    .prop('fan', 12, 15)
    .prop('backpack', -10.6, 13.7, 0.5)
    .prop('box', 15.5, -1, 0.2, 0.9)
    .prop('electronic_equipment', 18.5, -5.2, 0, 1.05);

  // ---------- Escritório ----------
  b.prop('table', -14, -11)
    .prop('chair', -14, -10.1, Math.PI)
    .prop('chair', -14, -11.9)
    .prop('monitor', -14.2, -11.2, 0, 0.76)
    .prop('computer', -13.4, -11.25, 0, 0.76)
    .prop('keyboard', -14.2, -10.8, 0, 0.76)
    .prop('mouse', -13.8, -10.8, 0, 0.76)
    .prop('table', -9.5, -15.2)
    .prop('printer', -9.5, -15.2, 0, 0.76)
    .prop('cabinet', -21.5, -13, Math.PI / 2)
    .prop('cabinet', -21.5, -11.9, Math.PI / 2)
    .prop('sofa', -18.5, -6.7, Math.PI)
    .prop('plant_pot', -21.2, -7)
    .prop('lamp', -21.3, -15.3)
    .prop('fan', -7, -15.2)
    .prop('suitcase', -8, -7.4, 0.6)
    .prop('trash_can', -11.5, -15.4)
    .prop('clock', -14.6, -11.4, 0.3, 0.76);

  // ---------- Estoque ----------
  for (const x of [-2, 4, 10, 16]) b.floorSolid('rack', x, -11.8, [1.1, 3.0, 6]);
  b.prop('box', 1, -8)
    .prop('box', 1.7, -8.3, 0.4)
    .prop('box', 1.3, -8.1, 0.2, 0.5)
    .prop('box', 7, -14.8)
    .prop('box', 13, -7.6, 0.7)
    .prop('box', 19, -14.6)
    .prop('box', 19.8, -13.8, 0.3)
    .prop('box', 19.3, -14.3, 0.6, 0.5)
    .prop('box', -4.5, -15)
    .prop('shopping_cart', 7, -8.2, 1.4)
    .prop('bucket', 13, -15.3)
    .prop('cone', -4, -7.5)
    .prop('electronic_equipment', 19.2, -10)
    .prop('trash_can', 21.2, -6.8)
    .prop('cabinet', -5.5, -13.8, Math.PI / 2)
    .prop('nobreak', 12.6, -15.3);

  for (const x of [-15, -5, 5, 15]) for (const z of [-1, 9]) b.light(x, z, 1.1);
  b.light(-14, -11, 0.9, '#ffe9c8');
  b.light(8, -11, 0.7, '#dfe8ff');

  const hiders: Vec3[] = [];
  for (const x of [-13, -7, -1, 5, 11]) for (const z of [0, 4]) hiders.push([x, 0, z]);
  const hunters: Vec3[] = [];
  for (const x of [-17, -15.5, -14, -12.5, -11, -9.5, -8, -6.5]) hunters.push([x, 0, 15]);

  return b.build({
    id: 'supermarket',
    name: 'Supermercado',
    description: 'Corredores de prateleiras, freezers, caixas, escritório e estoque.',
    size: [W, D],
    theme: { background: '#0d1016', floor: '#2a2d33', wall: '#cfcac0', ambient: '#c9d4ff', fog: '#0d1016' },
    spawns: { hiders, hunters },
  });
}
