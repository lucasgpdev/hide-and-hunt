import { beforeAll, describe, expect, it } from 'vitest';
import { createRoomPhysics, initPhysics } from '../src/game/physics.js';
import { buildNavGrid, findPath } from '../src/game/bots.js';
import { DEFAULT_ROOM_SETTINGS, Room, type RoomOutput } from '../src/game/Room.js';

const output: RoomOutput = {
  state: () => {},
  snapshot: () => {},
  feed: () => {},
  teleport: () => {},
  results: () => {},
  effect: () => {},
  abilities: () => {},
  abandon: () => {},
};

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

beforeAll(async () => {
  await initPhysics();
});

describe('bots', () => {
  it('grade de navegação acha caminho entre a casa e o quintal', () => {
    const physics = createRoomPhysics('big_house');
    const grid = buildNavGrid(physics, 'big_house');
    expect(grid.cells.length).toBeGreaterThan(2000);
    const path = findPath(grid, [-14, 0, -14], [0, 0, 0]);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(5);
    physics.world.free();
  });

  it('entram na sala, se escondem virando objetos e os caçadores andam e capturam', () => {
    let now = 1_000_000;
    const room = new Room({
      code: 'BOTS01',
      isPrivate: true,
      settings: { ...DEFAULT_ROOM_SETTINGS, mapId: 'big_house', mapVoting: false, prepSeconds: 5, hidingSeconds: 30, huntingSeconds: 180, randomEvents: false, bots: 4, hunters: 2 },
      output,
      createPhysics: createRoomPhysics,
      now: () => now,
      random: seeded(42),
      useLobby: false,
    });
    const step = (seconds: number) => {
      const end = now + seconds * 1000;
      while (now < end) {
        now += 50;
        room.tick();
      }
    };
    room.addPlayer({ id: 'ana', accountId: 'acc-ana', nickname: 'Ana', skin: 'default', level: 1 });
    step(7);
    const bots = [...room.players.values()].filter((p) => p.bot);
    expect(bots).toHaveLength(4);
    expect(room.hostId).toBe('ana');
    expect(room.start('ana').ok).toBe(true);
    step(6);
    expect(room.state).toBe('HIDING');
    step(29);
    const hiders = bots.filter((p) => p.team === 'HIDERS');
    expect(hiders.length).toBeGreaterThan(0);
    expect(hiders.some((p) => p.disguise)).toBe(true);
    const hunters = bots.filter((p) => p.team === 'HUNTERS');
    const before = hunters.map((h) => [...h.position]);
    step(60);
    const moved = hunters.some((h, i) => Math.hypot(h.position[0] - (before[i]?.[0] ?? 0), h.position[2] - (before[i]?.[2] ?? 0)) > 2);
    expect(hunters.length === 0 || moved).toBe(true);
    // Sem gente de verdade, os bots saem e a sala fica vazia.
    room.removePlayer('ana', true);
    step(1);
    expect(room.isEmpty).toBe(true);
  });
});
