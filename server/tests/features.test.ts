import { beforeAll, describe, expect, it } from 'vitest';
import { getMap, type FeedEvent, type MatchResults, type ReplayData, type RoomEffect, type Snapshot } from '@hh/shared';
import { createRoomPhysics, initPhysics } from '../src/game/physics.js';
import { DEFAULT_ROOM_SETTINGS, Room, type RoomOutput } from '../src/game/Room.js';

/** Sala com relógio controlado; devolve também os efeitos e snapshots enviados. */
function setup(settings: Partial<typeof DEFAULT_ROOM_SETTINGS> = {}, playerCount = 3, random = () => 0.5) {
  let now = 5_000_000;
  const feed: FeedEvent[] = [];
  const effects: { effect: RoomEffect; to: string[] | null }[] = [];
  const results: MatchResults[] = [];
  const replays: ReplayData[] = [];
  const snapshots = new Map<string, Snapshot>();
  const output: RoomOutput = {
    state: () => {},
    snapshot: (_r, id, s) => snapshots.set(id, s),
    feed: (_r, e) => feed.push(e),
    teleport: () => {},
    results: (_r, r, _players, replay) => {
      results.push(r);
      replays.push(replay);
    },
    effect: (_r, effect, to) => effects.push({ effect, to }),
    abilities: () => {},
    abandon: () => {},
  };
  const room = new Room({
    code: 'FEAT01',
    isPrivate: true,
    settings: { ...DEFAULT_ROOM_SETTINGS, mapId: 'supermarket', mapVoting: false, prepSeconds: 5, hidingSeconds: 10, huntingSeconds: 60, randomEvents: false, ...settings },
    output,
    createPhysics: createRoomPhysics,
    now: () => now,
    random,
    useLobby: false,
  });
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  for (const id of ids) room.addPlayer({ id, accountId: `acc-${id}`, nickname: id, skin: 'default', level: 1 });
  const advance = (seconds: number) => {
    now += seconds * 1000;
    room.tick();
  };
  const begin = (until: 'HIDING' | 'HUNTING') => {
    room.start('p1');
    advance(6);
    if (until === 'HUNTING') advance(11);
  };
  const team = (t: 'HIDERS' | 'HUNTERS') => [...room.players.values()].filter((p) => p.team === t);
  return { room, feed, effects, results, replays, snapshots, advance, begin, team, getNow: () => now };
}

beforeAll(async () => {
  await initPhysics();
});

describe('Modos de jogo', () => {
  it('Infecção: o capturado vira caçador e a partida acaba quando todos forem infectados', () => {
    const { room, begin, team, feed, results } = setup({ mode: 'infection' }, 4);
    begin('HUNTING');
    expect(team('HUNTERS')).toHaveLength(1);
    const hunter = team('HUNTERS')[0]!;
    for (const hider of team('HIDERS')) {
      hunter.position = [-13, 0.05, 2];
      hunter.captureReadyAt = 0;
      hider.position = [-12.4, 0.05, 2.4];
      expect(room.capture(hunter.id, hider.id)).toEqual({ ok: true, captured: true });
      expect(hider.team).toBe('HUNTERS');
      expect(hider.alive).toBe(true);
    }
    expect(feed.some((e) => e.type === 'infected')).toBe(true);
    expect(room.state).toBe('FINISHED');
    expect(results[0]?.winner).toBe('HUNTERS');
  });

  it('Caçador solitário: sempre 1 caçador, revezando entre rodadas', () => {
    const { room, begin, team, advance } = setup({ mode: 'lone_hunter', intermissionSeconds: 5 }, 5);
    begin('HIDING');
    const first = team('HUNTERS');
    expect(first).toHaveLength(1);
    advance(11);
    advance(76); // caça 25% maior (60 → 75 s)
    expect(room.state).toBe('FINISHED');
    advance(6);
    expect(team('HUNTERS')).toHaveLength(1);
    expect(team('HUNTERS')[0]!.id).not.toBe(first[0]!.id);
  });

  it('Duplas: escondidos recebem parceiros', () => {
    const { begin, team } = setup({ mode: 'duos' }, 5);
    begin('HIDING');
    const hiders = team('HIDERS');
    expect(hiders).toHaveLength(4);
    for (const h of hiders) expect(h.partnerId).not.toBeNull();
    expect(hiders[0]!.partnerId === hiders[1]!.id || hiders[0]!.partnerId === hiders[2]!.id || hiders[0]!.partnerId === hiders[3]!.id).toBe(true);
  });

  it('Caos: dispara eventos aleatórios sincronizados', () => {
    const { room, begin, advance } = setup({ mode: 'chaos' }, 3);
    begin('HUNTING');
    advance(26);
    expect(room.event).not.toBeNull();
  });

  it('Competitivo: calcula mudança de pontuação', () => {
    const { room, begin, advance, results } = setup({ mode: 'competitive' }, 4);
    begin('HUNTING');
    advance(61);
    expect(room.state).toBe('FINISHED');
    const changes = results[0]!.players.map((p) => p.ratingChange);
    expect(changes.every((c) => typeof c === 'number')).toBe(true);
    expect(results[0]!.players.find((p) => p.team === 'HIDERS')!.ratingChange).toBeGreaterThan(0);
  });
});

describe('Habilidades', () => {
  it('Clone falso: capturar o clone custa tempo ao caçador e o desfaz', () => {
    const { room, begin, advance, team } = setup({}, 3);
    begin('HIDING');
    const hider = team('HIDERS')[0]!;
    hider.position = [1.2, 0.05, 9];
    expect(room.transform(hider.id, 'cone-13').ok).toBe(true);
    expect(room.useAbility(hider.id, 'decoy', {}).ok).toBe(true);
    const clone = room.info().clones[0]!;
    expect(clone.type).toBe('cone');
    expect(room.useAbility(hider.id, 'decoy', {}).ok).toBe(false); // recarga
    advance(11);
    const hunter = team('HUNTERS')[0]!;
    hunter.position = [clone.position[0] + 1, 0.05, clone.position[2]];
    expect(room.capture(hunter.id, null, clone.id)).toEqual({ ok: true, captured: false });
    expect(room.info().clones).toHaveLength(0);
    expect(room.capture(hunter.id, hider.id).ok).toBe(false); // penalidade
  });

  it('Radar mostra posições aproximadas só para o caçador', () => {
    const { room, begin, team, effects } = setup({}, 3, () => 0.9);
    begin('HUNTING');
    const hunter = team('HUNTERS')[0]!;
    const hider = team('HIDERS')[0]!;
    hunter.position = [-13, 0.05, 2];
    hider.position = [-12, 0.05, 6];
    expect(room.useAbility(hunter.id, 'radar', {}).ok).toBe(true);
    const radar = effects.find((e) => e.effect.kind === 'radar')!;
    expect(radar.to).toEqual([hunter.id]);
    const point = (radar.effect as { points: [number, number, number][] }).points[0]!;
    expect(point[0]).not.toBe(hider.position[0]); // posição aproximada, não exata
    expect(Math.abs(point[0] - hider.position[0])).toBeLessThanOrEqual(2.5);
  });

  it('Camuflagem esconde o escondido do snapshot dos caçadores', () => {
    const { room, begin, team, snapshots } = setup({}, 3);
    begin('HUNTING');
    const hider = team('HIDERS')[0]!;
    const hunter = team('HUNTERS')[0]!;
    hider.position = [1.2, 0.05, 9];
    room.transform(hider.id, 'cone-13');
    expect(room.useAbility(hider.id, 'camouflage', {}).ok).toBe(true);
    room.broadcastSnapshot();
    expect(snapshots.get(hunter.id)!.p.some((e) => e[0] === hider.id)).toBe(false);
    expect(snapshots.get(hider.id)!.p.some((e) => e[0] === hider.id)).toBe(true);
  });

  it('Habilidades respeitam equipe, usos e configuração da sala', () => {
    const { room, begin, team } = setup({ abilities: false }, 3);
    begin('HUNTING');
    expect(room.useAbility(team('HIDERS')[0]!.id, 'whistle', {}).ok).toBe(false);
    const other = setup({}, 3);
    other.begin('HUNTING');
    const hunter = other.team('HUNTERS')[0]!;
    expect(other.room.useAbility(hunter.id, 'decoy', {}).ok).toBe(false);
  });
});

describe('Portas, interruptores e física', () => {
  it('Porta fecha, bloqueia a passagem e abre de novo', () => {
    const { room, begin, team, advance } = setup({}, 3);
    begin('HIDING');
    const hider = team('HIDERS')[0]!;
    const door = getMap('supermarket')!.doors.find((d) => d.id === 'door-1')!; // escritório, x = -14
    expect(room.doors.get(door.id)).toBe(false);
    hider.position = [door.center[0], 0.05, door.center[2] + 1.2];
    // Fechada: não passa.
    advance(0.3);
    room.handleMove(hider.id, { tid: hider.teleportId, p: [door.center[0], 0.05, door.center[2] - 0.9], yaw: 0, f: 1 });
    expect(hider.position[2]).toBeCloseTo(door.center[2] + 1.2);
    expect(room.interact(hider.id, door.id).ok).toBe(true);
    expect(room.doors.get(door.id)).toBe(true);
    advance(0.4);
    hider.teleportId += 0;
    room.handleMove(hider.id, { tid: hider.teleportId, p: [door.center[0], 0.05, door.center[2] - 0.6], yaw: 0, f: 1 });
    expect(hider.position[2]).toBeCloseTo(door.center[2] - 0.6);
    // Não fecha com alguém no vão.
    hider.position = [door.center[0], 0.05, door.center[2]];
    advance(1);
    expect(room.interact(hider.id, door.id).ok).toBe(false);
  });

  it('Passagem secreta existe e abre como porta', () => {
    const { room, begin, team } = setup({}, 3);
    begin('HIDING');
    const secret = getMap('supermarket')!.doors.find((d) => d.secret)!;
    const hider = team('HIDERS')[0]!;
    hider.position = [secret.center[0], 0.05, secret.center[2] + 1];
    expect(room.interact(hider.id, secret.id).ok).toBe(true);
  });

  it('Interruptor apaga e acende as luzes da zona', () => {
    const { room, begin, team } = setup({}, 3);
    begin('HIDING');
    const sw = getMap('supermarket')!.switches[0]!;
    const hider = team('HIDERS')[0]!;
    hider.position = [sw.position[0], 0.05, sw.position[2] - 0.8];
    expect(room.interact(hider.id, sw.id).ok).toBe(true);
    expect(room.info().lightsOff).toContain(sw.zone);
    expect(room.interact(hider.id, sw.id).ok).toBe(true);
    expect(room.info().lightsOff).not.toContain(sw.zone);
  });

  it('Objetos empurrados se movem na física do servidor e aparecem no snapshot', () => {
    const { room, begin, team, advance, snapshots } = setup({}, 3);
    begin('HIDING');
    const hider = team('HIDERS')[0]!;
    hider.position = [-0.5, 0.05, 10];
    expect(room.shove(hider.id, { propId: 'cone-13' }).ok).toBe(true);
    for (let i = 0; i < 10; i++) advance(1 / 15);
    room.broadcastSnapshot();
    const moved = snapshots.get(hider.id)!.o ?? [];
    expect(moved.some((entry) => entry[0] === 'cone-13')).toBe(true);
  });

  it('Replay grava 5 quadros por segundo em tempo real com o laço de 15 Hz', () => {
    const { room, begin, advance, replays } = setup({ huntingSeconds: 60 });
    begin('HIDING');
    // 10 s de esconder + 60 s de caça, em passos de ~66 ms (15 Hz).
    for (let i = 0; i < Math.round(70 * 15); i++) advance(1 / 15);
    advance(0.1);
    expect(room.state).toBe('FINISHED');
    const replay = replays[0]!;
    const seconds = (replay.frames.length * replay.interval) / 1000;
    expect(seconds).toBeGreaterThan(66);
    expect(seconds).toBeLessThan(74);
    expect(replay.players.length).toBe(3);
    expect(replay.events.some((e) => e.text.includes('caçada'))).toBe(true);
  });
});
