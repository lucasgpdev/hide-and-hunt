import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';

/**
 * Verifica que o motor de física (Rapier) inicializa e simula no Node.js.
 * O servidor autoritativo usará Rapier para validar movimentos a partir da FASE 2.
 */
describe('Rapier no servidor', () => {
  it('inicializa e simula a queda de um corpo até o chão', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);

    for (let i = 0; i < 240; i++) world.step();

    const y = body.translation().y;
    expect(y).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(0.7);
    world.free();
  });
});
