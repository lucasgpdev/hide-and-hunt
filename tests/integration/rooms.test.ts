import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, NetEvent, type RoomInfo, type Snapshot } from '@hh/shared';
import type { GameServer } from '../../server/src/server.js';
import { connectClient, hello, startTestServer, waitFor, type TestClient } from './helpers.js';

/**
 * Salas, partidas, perfil e loja de ponta a ponta, com clientes reais.
 */
describe('Salas e partidas (integração)', () => {
  let server: GameServer;
  let url: string;
  const clients: TestClient[] = [];

  const player = async (nickname: string) => {
    const client = await connectClient(url);
    clients.push(client);
    const response = await hello(client, nickname);
    if (!response.ok) throw new Error(response.error.message);
    return { client, id: response.player.id, profile: response.profile };
  };

  beforeAll(async () => {
    ({ server, url } = await startTestServer({ PUBLIC_MIN_PLAYERS: '3' }));
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    await server.close();
  });

  it('cria sala privada, entra pelo código e inicia a partida', async () => {
    const host = await player('Anfitriao');
    const guest = await player('Convidado');

    const created = await host.client.timeout(3000).emitWithAck(NetEvent.CreateRoom, {
      settings: { prepSeconds: 5, mapId: 'big_school', mapVoting: false },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.room.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.room.hostId).toBe(host.id);
    expect(created.room.settings.mapId).toBe('big_school');
    expect(created.room.mapId).toBe('lobby'); // espera no lobby 3D

    const wrong = await guest.client.timeout(3000).emitWithAck(NetEvent.JoinRoom, { code: 'ZZZZZZ' });
    expect(wrong).toMatchObject({ ok: false, error: { code: ErrorCode.RoomNotFound } });

    let latest: RoomInfo | null = null;
    let snapshot: Snapshot | null = null;
    host.client.on(NetEvent.RoomState, (room) => (latest = room));
    host.client.on(NetEvent.Snapshot, (s) => (snapshot = s));

    const joined = await guest.client.timeout(3000).emitWithAck(NetEvent.JoinRoom, { code: code.toLowerCase() });
    expect(joined.ok).toBe(true);
    await waitFor(() => ((latest as RoomInfo | null)?.players.length === 2 ? latest : undefined));

    const notHost = await guest.client.timeout(3000).emitWithAck(NetEvent.StartMatch, {});
    expect(notHost).toMatchObject({ ok: false, error: { code: ErrorCode.NotHost } });

    const started = await host.client.timeout(3000).emitWithAck(NetEvent.StartMatch, {});
    expect(started.ok).toBe(true);
    const room = await waitFor(() => ((latest as RoomInfo | null)?.state === 'COUNTDOWN' ? latest : undefined));
    const teams = (room as RoomInfo).players.map((p) => p.team).sort();
    expect(teams).toEqual(['HIDERS', 'HUNTERS']);
    await waitFor(() => ((snapshot as Snapshot | null)?.p.length === 2 ? snapshot : undefined));
  });

  it('valida as regras enviadas pelo anfitrião', async () => {
    const host = await player('Regras');
    const invalid = await host.client
      .timeout(3000)
      .emitWithAck(NetEvent.CreateRoom, { settings: { huntingSeconds: 5, mapId: 'big_house' } });
    expect(invalid).toMatchObject({ ok: false, error: { code: ErrorCode.InvalidPayload } });
  });

  it('matchmaking público coloca jogadores na mesma sala', async () => {
    const a = await player('Publico A');
    const b = await player('Publico B');
    const ra = await a.client.timeout(3000).emitWithAck(NetEvent.QuickJoin, {});
    const rb = await b.client.timeout(3000).emitWithAck(NetEvent.QuickJoin, {});
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) {
      expect(rb.room.code).toBe(ra.room.code);
      expect(rb.room.isPrivate).toBe(false);
      expect(rb.room.state).toBe('WAITING'); // mínimo configurado: 3
    }
    const again = await a.client.timeout(3000).emitWithAck(NetEvent.QuickJoin, {});
    expect(again).toMatchObject({ ok: false, error: { code: ErrorCode.AlreadyInRoom } });
    const left = await a.client.timeout(3000).emitWithAck(NetEvent.LeaveRoom, {});
    expect(left.ok).toBe(true);
  });

  it('perfil, ranking e loja respondem com dados do servidor', async () => {
    const p = await player('Comprador');
    expect(p.profile.level).toBe(1);
    expect(p.profile.ownedSkins).toEqual(['default']);
    expect(p.profile.persistent).toBe(false);

    const buy = await p.client.timeout(3000).emitWithAck(NetEvent.BuySkin, { skinId: 'ocean' });
    expect(buy).toMatchObject({ ok: false, error: { code: ErrorCode.NotEnoughCoins } });
    const equip = await p.client.timeout(3000).emitWithAck(NetEvent.EquipSkin, { skinId: 'gold' });
    expect(equip.ok).toBe(false);

    const ranking = await p.client.timeout(3000).emitWithAck(NetEvent.GetRanking, { category: 'xp' });
    expect(ranking.ok).toBe(true);
  });

  it('movimento é recebido e retransmitido aos outros jogadores', async () => {
    const host = await player('Mover A');
    const guest = await player('Mover B');
    const created = await host.client.timeout(3000).emitWithAck(NetEvent.CreateRoom, { settings: {} });
    if (!created.ok) throw new Error('falhou');
    await guest.client.timeout(3000).emitWithAck(NetEvent.JoinRoom, { code: created.room.code });
    let seen: Snapshot | null = null;
    guest.client.on(NetEvent.Snapshot, (s) => (seen = s));

    // Usa o teleportId e a posição atuais do jogador na sala.
    const info = server.rooms.rooms.get(created.room.code)!.players.get(host.id)!;
    const teleportId = info.teleportId;
    const position = info.position;
    await new Promise((r) => setTimeout(r, 120));
    host.client.emit(NetEvent.Move, { tid: teleportId, p: [position[0] + 0.3, position[1], position[2]], yaw: 1, f: 5 });
    await waitFor(() => {
      const entry = (seen as Snapshot | null)?.p.find((e) => e[0] === host.id);
      return entry && Math.abs(entry[1] - (position[0] + 0.3)) < 0.01 ? entry : undefined;
    });
  });

  it('chat de voz: lista de colegas e sinais WebRTC só entre quem ligou a voz', async () => {
    const a = await player('VozA');
    const b = await player('VozB');
    const created = await a.client.timeout(3000).emitWithAck(NetEvent.CreateRoom, { settings: { mapVoting: false } });
    if (!created.ok) throw new Error('sala');
    expect((await b.client.timeout(3000).emitWithAck(NetEvent.JoinRoom, { code: created.room.code })).ok).toBe(true);

    let peersA: string[] = [];
    let peersB: string[] = [];
    const signalsB: { from: string; data: { type: string } }[] = [];
    a.client.on(NetEvent.VoicePeers, (p) => (peersA = p));
    b.client.on(NetEvent.VoicePeers, (p) => (peersB = p));
    b.client.on(NetEvent.VoiceSignal, (s) => signalsB.push(s));

    // B ainda não ligou a voz: o sinal de A não chega.
    a.client.emit(NetEvent.VoiceState, { enabled: true });
    await waitFor(() => (peersA.includes(a.id) ? true : undefined));
    a.client.emit(NetEvent.VoiceSignal, { to: b.id, data: { type: 'offer', sdp: 'v=0' } });
    await new Promise((r) => setTimeout(r, 150));
    expect(signalsB).toHaveLength(0);

    b.client.emit(NetEvent.VoiceState, { enabled: true });
    await waitFor(() => (peersA.length === 2 && peersB.length === 2 ? true : undefined));
    a.client.emit(NetEvent.VoiceSignal, { to: b.id, data: { type: 'offer', sdp: 'v=0' } });
    const signal = await waitFor(() => signalsB[0]);
    expect(signal).toMatchObject({ from: a.id, data: { type: 'offer' } });

    // Desligar a voz tira o jogador da lista dos outros.
    b.client.emit(NetEvent.VoiceState, { enabled: false });
    await waitFor(() => (peersA.length === 1 ? true : undefined));
  });
});
