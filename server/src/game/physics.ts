import RAPIER from '@dimforge/rapier3d-compat';
import {
  buildMapPhysics,
  characterShapeInfo,
  createCharacterShape,
  getMap,
  getPropType,
  setDoorOpen,
  type MapPhysics,
  type PropPoseEntry,
} from '@hh/shared';

export type Vec3 = [number, number, number];

let ready: Promise<void> | null = null;

/** Inicializa o Rapier (WebAssembly) uma única vez. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

interface Pose {
  p: Vec3;
  q: [number, number, number, number];
}

/**
 * Física de uma sala: o cenário do mapa (paredes, objetos, portas) e os
 * objetos empurráveis, que viram corpos dinâmicos simulados no servidor.
 * Cada sala tem o seu mundo, porque portas e objetos mudam durante a partida.
 */
export interface RoomPhysics extends MapPhysics {
  pushables: Map<string, RAPIER.RigidBody>;
  initialPoses: Map<string, Pose>;
}

export function createRoomPhysics(mapId: string): RoomPhysics {
  const map = getMap(mapId);
  if (!map) throw new Error(`Mapa desconhecido: ${mapId}`);
  const base = buildMapPhysics(RAPIER, map);
  const pushables = new Map<string, RAPIER.RigidBody>();
  const initialPoses = new Map<string, Pose>();

  for (const placement of map.props) {
    const type = getPropType(placement.type);
    if (!type?.pushable) continue;
    const staticCollider = base.propColliders.get(placement.id);
    if (staticCollider) base.world.removeCollider(staticCollider, false);
    const half = placement.rotationY / 2;
    const q = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
    const [sx, sy, sz] = type.size;
    const position = { x: placement.position[0], y: placement.position[1] + sy / 2, z: placement.position[2] };
    const body = base.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(q).setLinearDamping(0.6).setAngularDamping(0.8),
    );
    const collider = base.world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, Math.max(sy, 0.02) / 2, sz / 2).setDensity(120).setFriction(0.8).setRestitution(0.1),
      body,
    );
    body.sleep();
    base.propColliders.set(placement.id, collider);
    pushables.set(placement.id, body);
    initialPoses.set(placement.id, { p: [position.x, position.y, position.z], q: [q.x, q.y, q.z, q.w] });
  }
  base.world.timestep = 1 / 30;
  base.world.step();
  return { ...base, pushables, initialPoses };
}

/** Avança a simulação (chamado a 15 Hz com 2 subpassos). */
export function stepRoomPhysics(physics: RoomPhysics): void {
  let awake = false;
  for (const body of physics.pushables.values()) {
    if (!body.isSleeping()) {
      awake = true;
      break;
    }
  }
  if (!awake) return;
  physics.world.step();
  physics.world.step();
}

/** Empurra um objeto para longe de um ponto. Devolve false se não for empurrável. */
export function shoveProp(physics: RoomPhysics, propId: string, from: Vec3, strength = 1): boolean {
  const body = physics.pushables.get(propId);
  if (!body) return false;
  const t = body.translation();
  const dx = t.x - from[0];
  const dz = t.z - from[2];
  const len = Math.hypot(dx, dz) || 1;
  const mass = body.mass();
  body.wakeUp();
  body.applyImpulse({ x: (dx / len) * 3.2 * mass * strength, y: 1.2 * mass * strength, z: (dz / len) * 3.2 * mass * strength }, true);
  body.applyTorqueImpulse({ x: (Math.random() - 0.5) * mass * 0.6, y: (Math.random() - 0.5) * mass, z: (Math.random() - 0.5) * mass * 0.6 }, true);
  return true;
}

/** Objetos fora da posição original (para o snapshot). */
export function movedProps(physics: RoomPhysics): PropPoseEntry[] {
  const list: PropPoseEntry[] = [];
  for (const [id, body] of physics.pushables) {
    const initial = physics.initialPoses.get(id)!;
    const t = body.translation();
    const r = body.rotation();
    const moved =
      Math.abs(t.x - initial.p[0]) + Math.abs(t.y - initial.p[1]) + Math.abs(t.z - initial.p[2]) > 0.01 ||
      Math.abs(r.y - initial.q[1]) + Math.abs(r.x) + Math.abs(r.z) > 0.01;
    if (!moved) continue;
    list.push([id, r3(t.x), r3(t.y), r3(t.z), r3(r.x), r3(r.y), r3(r.z), r3(r.w)]);
  }
  return list;
}

/** Posição atual de um objeto do mapa (empurrado ou não). */
export function propPosition(physics: RoomPhysics, propId: string): Vec3 | null {
  const collider = physics.propColliders.get(propId);
  if (!collider) return null;
  const t = collider.translation();
  return [t.x, t.y, t.z];
}

export function setRoomDoor(physics: RoomPhysics, doorId: string, open: boolean): void {
  setDoorOpen(physics, doorId, open);
}

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Margem para tolerar contato com paredes e pequenas diferenças numéricas. */
const SHRINK = 0.08;

/**
 * Verifica se o jogador pode ir de `from` para `to` sem atravessar nada.
 * A forma do jogador é "arrastada" pelo caminho; se bater antes do fim, é inválido.
 */
export function isPathClear(physics: MapPhysics, disguise: string | null, from: Vec3, to: Vec3): boolean {
  const info = characterShapeInfo(disguise);
  const shape = createCharacterShape(RAPIER, info, SHRINK);
  const half = info.height / 2;
  const start = { x: from[0], y: from[1] + half, z: from[2] };
  const delta = { x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] };
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  // O destino não pode estar dentro de um sólido fixo.
  const end = { x: to[0], y: to[1] + half, z: to[2] };
  const fixedOnly = (collider: RAPIER.Collider) => !collider.parent() || !collider.parent()!.isDynamic();
  if (physics.world.intersectionWithShape(end, identity, shape, undefined, undefined, undefined, undefined, fixedOnly)) return false;

  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length < 1e-4) return true;
  // Objetos empurráveis podem estar levemente fora de sincronia com o cliente: só sólidos fixos bloqueiam.
  const hit = physics.world.castShape(start, identity, delta, shape, 0, 1, false, undefined, undefined, undefined, undefined, fixedOnly);
  return !hit || hit.time_of_impact >= 0.999;
}

/** Verifica se uma forma cabe na posição (usado ao se transformar). */
export function fitsAt(physics: MapPhysics, disguise: string | null, position: Vec3): boolean {
  const info = characterShapeInfo(disguise);
  const shape = createCharacterShape(RAPIER, info, 0.05);
  const center = { x: position[0], y: position[1] + info.height / 2, z: position[2] };
  const fixedOnly = (collider: RAPIER.Collider) => !collider.parent() || !collider.parent()!.isDynamic();
  return !physics.world.intersectionWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, undefined, undefined, undefined, fixedOnly);
}

/** Há linha de visão entre dois pontos (nenhum sólido no meio)? */
export function hasLineOfSight(physics: MapPhysics, from: Vec3, to: Vec3, targetRadius: number): boolean {
  const dir = { x: to[0] - from[0], y: to[1] - from[1], z: to[2] - from[2] };
  const distance = Math.hypot(dir.x, dir.y, dir.z);
  if (distance < 1e-3) return true;
  const ray = new RAPIER.Ray({ x: from[0], y: from[1], z: from[2] }, { x: dir.x / distance, y: dir.y / distance, z: dir.z / distance });
  const fixedOnly = (collider: RAPIER.Collider) => !collider.parent() || !collider.parent()!.isDynamic();
  const hit = physics.world.castRay(ray, distance, true, undefined, undefined, undefined, undefined, fixedOnly);
  return !hit || hit.timeOfImpact >= distance - targetRadius - 0.05;
}

export function isInsideBounds(physics: MapPhysics, p: Vec3): boolean {
  const { minX, maxX, minZ, maxZ } = physics.bounds;
  return p[0] > minX && p[0] < maxX && p[2] > minZ && p[2] < maxZ && p[1] > -1 && p[1] < 20;
}

/** Caixa (AABB) de uma porta cruza a forma de um jogador? */
export function doorBlockedBy(doorCenter: Vec3, doorSize: Vec3, player: Vec3, radius: number, height: number): boolean {
  const dx = Math.abs(player[0] - doorCenter[0]) - doorSize[0] / 2;
  const dz = Math.abs(player[2] - doorCenter[2]) - doorSize[2] / 2;
  const insideXZ = dx < radius && dz < radius;
  const insideY = player[1] < doorCenter[1] + doorSize[1] / 2 && player[1] + height > doorCenter[1] - doorSize[1] / 2;
  return insideXZ && insideY;
}
