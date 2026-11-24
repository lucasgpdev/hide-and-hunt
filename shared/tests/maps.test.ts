import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildMapPhysics,
  characterShapeInfo,
  createCharacterShape,
  getMap,
  getPropType,
  LOBBY_MAP_ID,
  MAP_CATALOG,
  PLAYABLE_MAP_IDS,
  PROP_TYPES,
  setDoorOpen,
} from '@hh/shared';

beforeAll(async () => {
  await RAPIER.init();
});

describe('Catálogo', () => {
  it('tem os 11 mapas planejados e os objetos exigidos', () => {
    expect(MAP_CATALOG).toHaveLength(11);
    expect(PLAYABLE_MAP_IDS).toHaveLength(11);
    for (const entry of MAP_CATALOG) expect(getMap(entry.id), entry.id).toBeDefined();
    expect(PROP_TYPES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(PROP_TYPES.map((p) => p.id)).size).toBe(PROP_TYPES.length);
  });
});

describe.each([...PLAYABLE_MAP_IDS, LOBBY_MAP_ID])('Mapa %s', (mapId) => {
  const map = getMap(mapId)!;

  it('tem pontos de nascimento suficientes para 24 escondidos e 8 caçadores (com repetição)', () => {
    expect(map.spawns.hiders.length).toBeGreaterThanOrEqual(8);
    expect(map.spawns.hunters.length).toBeGreaterThanOrEqual(8);
  });

  it('nenhum ponto de nascimento fica dentro de paredes ou objetos', () => {
    const physics = buildMapPhysics(RAPIER, map);
    const info = characterShapeInfo(null);
    const shape = createCharacterShape(RAPIER, info, 0.05);
    for (const spawn of [...map.spawns.hiders, ...map.spawns.hunters]) {
      const hit = physics.world.intersectionWithShape(
        { x: spawn[0], y: spawn[1] + 0.05 + info.height / 2, z: spawn[2] },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
      );
      expect(hit, `spawn ${spawn.join(',')}`).toBeNull();
    }
  });

  it('nenhum objeto atravessa paredes ou estruturas', () => {
    const physics = buildMapPhysics(RAPIER, map);
    const solidsOnly = buildMapPhysics(RAPIER, { ...map, props: [] });
    const bad: string[] = [];
    for (const placement of map.props) {
      const type = getPropType(placement.type)!;
      const [sx, sy, sz] = type.size;
      const half = placement.rotationY / 2;
      const hit = solidsOnly.world.intersectionWithShape(
        { x: placement.position[0], y: placement.position[1] + sy / 2, z: placement.position[2] },
        { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
        new RAPIER.Cuboid(Math.max(0.01, sx / 2 - 0.03), Math.max(0.01, sy / 2 - 0.03), Math.max(0.01, sz / 2 - 0.03)),
      );
      if (hit) bad.push(`${placement.id} em ${placement.position.join(',')}`);
    }
    expect(bad).toEqual([]);
    expect(physics.propColliders.size).toBe(map.props.length);
  });

  it('todos os cômodos e pontos de nascimento são alcançáveis a pé (portas abertas)', () => {
    // Malha de 0,5 m: uma célula é livre se a cápsula do jogador cabe nela sem
    // tocar paredes/estruturas (objetos podem ser empurrados ou contornados).
    const physics = buildMapPhysics(RAPIER, { ...map, props: [] });
    for (const door of map.doors) setDoorOpen(physics, door.id, true);
    const info = characterShapeInfo(null);
    const shape = createCharacterShape(RAPIER, info, 0.02);
    const step = 0.5;
    const [w, d] = map.size;
    const nx = Math.floor(w / step);
    const nz = Math.floor(d / step);
    const toX = (i: number) => -w / 2 + (i + 0.5) * step;
    const toZ = (k: number) => -d / 2 + (k + 0.5) * step;
    const free = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const hit = physics.world.intersectionWithShape({ x: toX(i), y: 0.05 + info.height / 2, z: toZ(k) }, { x: 0, y: 0, z: 0, w: 1 }, shape);
        free[i * nz + k] = hit ? 0 : 1;
      }
    }
    const cell = (x: number, z: number) => [Math.floor((x + w / 2) / step), Math.floor((z + d / 2) / step)] as const;
    const seen = new Uint8Array(nx * nz);
    const [si, sk] = cell(map.spawns.hunters[0]![0], map.spawns.hunters[0]![2]);
    const queue: number[] = [si * nz + sk];
    seen[si * nz + sk] = 1;
    while (queue.length) {
      const idx = queue.pop()!;
      const i = Math.floor(idx / nz);
      const k = idx % nz;
      for (const [di, dk] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const n = ni * nz + nk;
        if (!seen[n] && free[n]) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    // O ponto de nascimento (ou uma célula vizinha, pela resolução da malha) é alcançável.
    for (const spawn of [...map.spawns.hiders, ...map.spawns.hunters]) {
      const [i, k] = cell(spawn[0], spawn[2]);
      let ok = false;
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) if (seen[(i + di) * nz + (k + dk)]) ok = true;
      expect(ok, `spawn ${spawn.join(',')}`).toBe(true);
    }
    for (const zone of map.zones) {
      const [x0, z0, x1, z1] = zone.rect;
      let reached = false;
      let anyFree = false;
      for (let x = x0 + 0.25; x < x1 && !reached; x += step) {
        for (let z = z0 + 0.25; z < z1 && !reached; z += step) {
          const [i, k] = cell(x, z);
          if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
          if (free[i * nz + k]) anyFree = true;
          if (seen[i * nz + k]) reached = true;
        }
      }
      // Zonas sem chão livre são plataformas (ex.: palco do lobby), alcançadas pulando.
      if (anyFree) expect(reached, `zona ${zone.name}`).toBe(true);
    }
  });

  it('todos os objetos usam tipos do catálogo e têm ids únicos', () => {
    expect(new Set(map.props.map((p) => p.id)).size).toBe(map.props.length);
    for (const p of map.props) expect(getPropType(p.type), p.type).toBeDefined();
  });
});
