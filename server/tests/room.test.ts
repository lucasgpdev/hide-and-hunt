import { beforeAll, describe, expect, it } from 'vitest';
import type { FeedEvent, MatchResults, RoomEffect, TeleportMessage } from '@hh/shared';
import { createRoomPhysics, initPhysics } from '../src/game/physics.js';
import { DEFAULT_ROOM_SETTINGS, Room, type RoomOutput } from '../src/game/Room.js';

/** Sala com relógio controlado e saídas registradas para inspeção. */
function createRoom(overrides: Partial<typeof DEFAULT_ROOM_SETTINGS> = {}) {
  let now = 1_000_000;
  const feed: FeedEvent[] = [];
  const teleports: { playerId: string; message: TeleportMessage }[] = [];
  const results: MatchResults[] = [];
  const effects: { effect: RoomEffect; to: string[] | null }[] = [];
  const abandons: string[] = [];
  const output: RoomOutput = {
    state: () => {},
    snapshot: () => {},
    feed: (_r, e) => feed.push(e),
    teleport: (_r, playerId, message) => teleports.push({ playerId, message }),
    results: (_r, r) => results.push(r),
    effect: (_r, effect, to) => effects.push({ effect, to }),
    abilities: () => {},
    abandon: (_r, p) => abandons.push(p.id),
  };
  const room = new Room({
    code: 'TESTE1',
    isPrivate: true,
    settings: { ...DEFAULT_ROOM_SETTINGS, mapId: 'supermarket', mapVoting: false, prepSeconds: 5, hidingSeconds: 10, huntingSeconds: 60, ...overrides },
    output,
    createPhysics: createRoomPhysics,
    now: () => now,
    random: () => 0.5,
    useLobby: false,
  });
  const advance = (seconds: number) => {
    now += seconds * 1000;
    room.tick();
  };
  const add = (id: string) =>
    room.addPlayer({ id, accountId: `acc-${id}`, nickname: id, skin: 'default', level: 1 });
  return { room, feed, teleports, results, effects, abandons, advance, add, setNow: (n: number) => (now = n), getNow: () => now };
}

/** Inicia uma partida com 3 jogadores (1 caçador, 2 escondidos) e chega na fase indicada. */
function startMatch(until: 'HIDING' | 'HUNTING', overrides: Partial<typeof DEFAULT_ROOM_SETTINGS> = {}) {
  const ctx = createRoom({ randomEvents: false, ...overrides });
  ctx.add('ana');
  ctx.add('bia');
  ctx.add('caio');
  expect(ctx.room.start('ana').ok).toBe(true);
  ctx.advance(6);
  if (until === 'HUNTING') ctx.advance(11);
  const players = [...ctx.room.players.values()];
  const hunter = players.find((p) => p.team === 'HUNTERS')!;
  const hiders = players.filter((p) => p.team === 'HIDERS');
  return { ...ctx, hunter, hiders };
}

beforeAll(async () => {
  await initPhysics();
});

describe('Room — fluxo da partida', () => {
  it('só o anfitrião inicia, e com pelo menos 2 jogadores', () => {
    const { room, add } = createRoom();
    add('ana');
    expect(room.start('ana').ok).toBe(false);
    add('bia');
    expect(room.start('bia').ok).toBe(false);
    expect(room.start('ana').ok).toBe(true);
    expect(room.state).toBe('COUNTDOWN');
  });

  it('distribui equipes e passa por COUNTDOWN → HIDING → HUNTING', () => {
    const { room, add, advance } = createRoom();
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']) add(id);
    room.start('a1');
    const teams = [...room.players.values()].map((p) => p.team);
    expect(teams.filter((t) => t === 'HUNTERS')).toHaveLength(2);
    expect(teams.filter((t) => t === 'HIDERS')).toHaveLength(6);
    advance(6);
    expect(room.state).toBe('HIDING');
    advance(11);
    expect(room.state).toBe('HUNTING');
  });

  it('escondidos vencem quando o tempo acaba', () => {
    const { room, advance, results } = startMatch('HUNTING');
    advance(61);
    expect(room.state).toBe('FINISHED');
    expect(results[0]?.winner).toBe('HIDERS');
    expect(results[0]?.players.find((p) => p.team === 'HIDERS')?.survived).toBe(true);
  });

  it('volta a esperar se faltar jogador na contagem', () => {
    const { room, add, advance } = createRoom();
    add('ana');
    add('bia');
    room.start('ana');
    room.removePlayer('bia');
    advance(1);
    expect(room.state).toBe('WAITING');
  });
});

describe('Room — movimento validado pelo servidor', () => {
  it('aceita um passo normal', () => {
    const { room, hiders, advance } = startMatch('HIDING');
    const hider = hiders[0]!;
    const [x, y, z] = hider.position;
    advance(0.1);
    room.handleMove(hider.id, { tid: hider.teleportId, p: [x + 0.4, y, z], yaw: 0, f: 1 });
    expect(hider.position[0]).toBeCloseTo(x + 0.4);
  });

  it('rejeita velocidade impossível e devolve o jogador', () => {
    const { room, hiders, advance, teleports } = startMatch('HIDING');
    const hider = hiders[0]!;
    const before = [...hider.position];
    const teleportsBefore = teleports.length;
    advance(0.1);
    room.handleMove(hider.id, { tid: hider.teleportId, p: [before[0]! + 8, before[1]!, before[2]!], yaw: 0, f: 1 });
    expect(hider.position).toEqual(before);
    expect(teleports.length).toBe(teleportsBefore + 1);
  });

  it('não deixa atravessar paredes', () => {
    const { room, hiders, advance } = startMatch('HIDING');
    const hider = hiders[0]!;
    // Parede dos fundos do supermercado em z = -6 (sem porta em x = -9).
    hider.position = [-9, 0.05, -5.4];
    advance(0.3);
    room.handleMove(hider.id, { tid: hider.teleportId, p: [-9, 0.05, -6.6], yaw: 0, f: 1 });
    expect(hider.position[2]).toBeCloseTo(-5.4);
  });

  it('caçadores ficam parados durante o esconderijo', () => {
    const { room, hunter, advance } = startMatch('HIDING');
    const before = [...hunter.position];
    advance(0.2);
    room.handleMove(hunter.id, { tid: hunter.teleportId, p: [before[0]! + 0.5, before[1]!, before[2]!], yaw: 0, f: 1 });
    expect(hunter.position).toEqual(before);
  });

  it('ignora mensagens antigas (de antes de um teletransporte)', () => {
    const { room, hiders, advance } = startMatch('HIDING');
    const hider = hiders[0]!;
    const before = [...hider.position];
    advance(0.1);
    room.handleMove(hider.id, { tid: hider.teleportId - 1, p: [before[0]! + 0.3, before[1]!, before[2]!], yaw: 0, f: 1 });
    expect(hider.position).toEqual(before);
  });
});

describe('Room — transformação', () => {
  it('transforma em um objeto próximo e recusa os distantes ou inexistentes', () => {
    const { room, hiders, hunter } = startMatch('HIDING');
    const hider = hiders[0]!;
    hider.position = [1.2, 0.05, 9]; // cone em (0, 9)
    const cone = 'cone-13';
    expect(room.transform(hider.id, 'nao-existe').ok).toBe(false);
    expect(room.transform(hunter.id, cone).ok).toBe(false);
    const result = room.transform(hider.id, cone);
    expect(result).toEqual({ ok: true });
    expect(hider.disguise).toBe('cone');
    // Recarga: não pode trocar imediatamente.
    expect(room.transform(hider.id, 'bucket-15').ok).toBe(false);
    hider.position = [-18, 0.05, -12];
    hider.transformReadyAt = 0;
    expect(room.transform(hider.id, 'bucket-15').ok).toBe(false);
  });
});

describe('Room — capturas', () => {
  it('não captura antes da caçada', () => {
    const { room, hunter, hiders } = startMatch('HIDING');
    expect(room.capture(hunter.id, hiders[0]!.id).ok).toBe(false);
  });

  it('valida distância e linha de visão; vence quando todos são capturados', () => {
    const { room, hunter, hiders, results, advance } = startMatch('HUNTING');
    const [h1, h2] = hiders as [(typeof hiders)[0], (typeof hiders)[0]];

    hunter.position = [-13, 0.05, 2];
    h1.position = [-13, 0.05, 7];
    expect(room.capture(hunter.id, h1.id).ok).toBe(false); // longe demais

    // Separados pela prateleira em x = -10.
    h1.position = [-11.2, 0.05, 2];
    hunter.position = [-8.8, 0.05, 2];
    expect(room.capture(hunter.id, h1.id).ok).toBe(false);

    hunter.position = [-13, 0.05, 2];
    h1.position = [-12, 0.05, 2.5];
    expect(room.capture(hunter.id, h1.id)).toEqual({ ok: true, captured: true });
    expect(h1.alive).toBe(false);
    expect(room.capture(hunter.id, h1.id).ok).toBe(false); // já capturado

    advance(1);
    h2.position = [-12.5, 0.05, 1];
    expect(room.capture(hunter.id, h2.id)).toEqual({ ok: true, captured: true });
    expect(room.state).toBe('FINISHED');
    expect(results[0]?.winner).toBe('HUNTERS');
    const hunterResult = results[0]!.players.find((p) => p.id === hunter.id)!;
    expect(hunterResult.captures).toBe(2);
    expect(hunterResult.xpGained).toBe(50 + 100 + 2 * 25);
  });

  it('errar o alvo aplica espera extra', () => {
    const { room, hunter } = startMatch('HUNTING');
    expect(room.capture(hunter.id, null)).toEqual({ ok: true, captured: false });
    expect(room.capture(hunter.id, null).ok).toBe(false);
  });
});

describe('Room — votação e reconexão', () => {
  it('escolhe o mapa mais votado', () => {
    const ctx = createRoom({ mapVoting: true });
    ctx.add('ana');
    ctx.add('bia');
    ctx.add('caio');
    ctx.room.vote('ana', 'jp_classroom');
    ctx.room.vote('bia', 'jp_classroom');
    ctx.room.vote('caio', 'grey_room');
    ctx.room.start('ana');
    expect(ctx.room.mapId).toBe('jp_classroom');
  });

  it('mantém o jogador durante o tempo de reconexão e remove depois', () => {
    const { room, add, advance } = createRoom();
    add('ana');
    add('bia');
    room.setConnected('bia', false);
    advance(10);
    expect(room.players.has('bia')).toBe(true);
    room.setConnected('bia', true);
    room.setConnected('bia', false);
    advance(31);
    expect(room.players.has('bia')).toBe(false);
  });
});
