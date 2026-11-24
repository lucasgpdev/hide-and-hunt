import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { BALANCE } from '../constants/balance.js';
import type { MapDefinition } from '../maps/types.js';
import { getPropType, propColliderSize } from '../props/catalog.js';

type Rapier = typeof RAPIER_NS;

/**
 * Física compartilhada: o mesmo mapa gera as mesmas colisões no cliente
 * (movimento local) e no servidor (validação). O módulo Rapier é recebido
 * por parâmetro para que este pacote não precise carregá-lo sozinho.
 */
export interface MapPhysics {
  world: RAPIER_NS.World;
  /** Colisor de cada objeto do mapa, pelo id do objeto. */
  propColliders: Map<string, RAPIER_NS.Collider>;
  /** Colisor de cada porta (desativado quando aberta). */
  doorColliders: Map<string, RAPIER_NS.Collider>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function buildMapPhysics(RAPIER: Rapier, map: MapDefinition): MapPhysics {
  const world = new RAPIER.World({ x: 0, y: BALANCE.movement.gravity, z: 0 });
  const [w, d] = map.size;

  // Chão e um "teto" invisível que impede sair por cima das paredes.
  // Mapas abertos ganham um teto alto e muros invisíveis nas bordas.
  world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2 + 2, 0.5, d / 2 + 2).setTranslation(0, -0.5, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(w / 2 + 2, 0.5, d / 2 + 2).setTranslation(0, map.wallHeight + 0.5, 0),
  );

  for (const solid of map.solids) {
    const [sx, sy, sz] = solid.size;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(...solid.center),
    );
  }

  const propColliders = new Map<string, RAPIER_NS.Collider>();
  for (const placement of map.props) {
    const type = getPropType(placement.type);
    if (!type) continue;
    const [sx, sy, sz] = type.size;
    const half = placement.rotationY / 2;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, Math.max(sy, 0.02) / 2, sz / 2)
        .setTranslation(placement.position[0], placement.position[1] + sy / 2, placement.position[2])
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    );
    propColliders.set(placement.id, collider);
  }

  const doorColliders = new Map<string, RAPIER_NS.Collider>();
  for (const door of map.doors) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(door.size[0] / 2, door.size[1] / 2, door.size[2] / 2).setTranslation(...door.center),
    );
    collider.setEnabled(!door.open);
    doorColliders.set(door.id, collider);
  }

  // Monta a estrutura de consultas (raios e formas) com os colisores criados.
  world.step();

  return {
    world,
    propColliders,
    doorColliders,
    bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 },
  };
}

/** Forma física do jogador: cápsula (humano) ou cilindro (transformado). */
export interface CharacterShapeInfo {
  /** Altura total da forma. */
  height: number;
  radius: number;
  kind: 'capsule' | 'cylinder';
}

export function characterShapeInfo(disguise: string | null): CharacterShapeInfo {
  const type = disguise ? getPropType(disguise) : undefined;
  if (!type) return { kind: 'capsule', radius: BALANCE.human.radius, height: BALANCE.human.height };
  const { radius, height } = propColliderSize(type);
  return { kind: 'cylinder', radius, height };
}

export function createCharacterShape(RAPIER: Rapier, info: CharacterShapeInfo, shrink = 0): RAPIER_NS.Shape {
  const radius = Math.max(0.05, info.radius - shrink);
  if (info.kind === 'capsule') {
    const halfSegment = Math.max(0.01, info.height / 2 - info.radius - shrink);
    return new RAPIER.Capsule(halfSegment, radius);
  }
  return new RAPIER.Cylinder(Math.max(0.05, info.height / 2 - shrink), radius);
}

export function createCharacterColliderDesc(RAPIER: Rapier, info: CharacterShapeInfo): RAPIER_NS.ColliderDesc {
  if (info.kind === 'capsule') {
    return RAPIER.ColliderDesc.capsule(Math.max(0.01, info.height / 2 - info.radius), info.radius);
  }
  return RAPIER.ColliderDesc.cylinder(info.height / 2, info.radius);
}

/** Abre ou fecha uma porta no mundo físico. */
export function setDoorOpen(physics: MapPhysics, doorId: string, open: boolean): void {
  const collider = physics.doorColliders.get(doorId);
  if (!collider) return;
  collider.setEnabled(!open);
  physics.world.step();
}
