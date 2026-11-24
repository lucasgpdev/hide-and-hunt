import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, NetEvent, PROTOCOL_VERSION, type HealthResponse, type NetError, type ServerStats } from '@hh/shared';
import type { GameServer } from '../../server/src/server.js';
import { connectClient, hello, newAccountToken, startTestServer, waitFor, type TestClient } from './helpers.js';

/**
 * Testes de integração da comunicação cliente <-> servidor (FASE 1).
 * Usam um servidor real e clientes Socket.IO reais.
 */
describe('Comunicação cliente-servidor', () => {
  let server: GameServer;
  let url: string;
  const clients: TestClient[] = [];

  const newClient = async () => {
    const client = await connectClient(url);
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    ({ server, url } = await startTestServer());
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.disconnect();
  });

  afterAll(async () => {
    await server.close();
  });

  it('health check HTTP responde com o estado do servidor', async () => {
    const response = await fetch(`${url}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body.status).toBe('ok');
    expect(body.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.database).toBe('disabled');
  });

  it('identifica o jogador e devolve dados públicos', async () => {
    const client = await newClient();
    const response = await hello(client, '  Jogador   Um ');
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.player.nickname).toBe('Jogador Um');
    expect(response.player).not.toHaveProperty('sessionId');
    expect(response.server.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.server.tickRate).toBe(15);
  });

  it('mede latência com ping após a identificação', async () => {
    const client = await newClient();
    await hello(client, 'Pinger');
    const clientTime = Date.now();
    const response = await client.timeout(3000).emitWithAck(NetEvent.Ping, { clientTime });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.clientTime).toBe(clientTime);
    expect(response.serverTime).toBeGreaterThanOrEqual(clientTime);
  });

  it('recusa ping de quem não se identificou', async () => {
    const client = await newClient();
    const response = await client.timeout(3000).emitWithAck(NetEvent.Ping, { clientTime: Date.now() });
    expect(response).toMatchObject({ ok: false, error: { code: ErrorCode.NotIdentified } });
  });

  it('rejeita payload inválido sem derrubar o servidor', async () => {
    const client = await newClient();
    const response = await client
      .timeout(3000)
      // Nome com caracteres proibidos e sessão que não é um UUID.
      .emitWithAck(NetEvent.Hello, {
        protocolVersion: PROTOCOL_VERSION,
        nickname: '<b>',
        sessionId: 'x',
        accountToken: newAccountToken(),
      });
    expect(response).toMatchObject({ ok: false, error: { code: ErrorCode.InvalidPayload } });
    expect((await hello(client, 'Valido')).ok).toBe(true);
  });

  it('rejeita cliente com versão de protocolo diferente', async () => {
    const client = await newClient();
    const response = await client.timeout(3000).emitWithAck(NetEvent.Hello, {
      protocolVersion: PROTOCOL_VERSION + 1,
      nickname: 'Antigo',
      sessionId: randomUUID(),
      accountToken: newAccountToken(),
    });
    expect(response).toMatchObject({ ok: false, error: { code: ErrorCode.ProtocolMismatch } });
  });

  it('não permite identificar a mesma conexão duas vezes', async () => {
    const client = await newClient();
    expect((await hello(client, 'Primeiro')).ok).toBe(true);
    const second = await hello(client, 'Segundo');
    expect(second).toMatchObject({ ok: false, error: { code: ErrorCode.AlreadyIdentified } });
  });

  it('a mesma sessão em outra conexão substitui a antiga (sem duplicar jogador)', async () => {
    const sessionId = randomUUID();
    const token = newAccountToken();
    const first = await newClient();
    const firstHello = await hello(first, 'Dupla', sessionId, token);

    const errors: NetError[] = [];
    first.on(NetEvent.Error, (err) => errors.push(err));
    const disconnected = new Promise<void>((resolve) => first.once('disconnect', () => resolve()));

    const second = await newClient();
    const secondHello = await hello(second, 'Dupla', sessionId, token);
    await disconnected;

    expect(firstHello.ok && secondHello.ok).toBe(true);
    if (firstHello.ok && secondHello.ok) expect(secondHello.player.id).toBe(firstHello.player.id);
    expect(errors.map((e) => e.code)).toContain(ErrorCode.SessionReplaced);
    expect(server.players.count).toBe(1);
  });

  it('envia estatísticas com o número de jogadores conectados', async () => {
    const a = await newClient();
    const b = await newClient();
    let latest: ServerStats | undefined;
    a.on(NetEvent.Stats, (stats) => (latest = stats));
    await hello(a, 'Alfa');
    await hello(b, 'Beta');
    await waitFor(() => (latest?.onlinePlayers === 2 ? latest : undefined));

    b.disconnect();
    await waitFor(() => (latest?.onlinePlayers === 1 ? latest : undefined));
  });

  it('aplica limite de frequência', async () => {
    const client = await newClient();
    await hello(client, 'Spammer');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => client.timeout(3000).emitWithAck(NetEvent.Ping, { clientTime: Date.now() })),
    );
    const limited = results.filter((r) => !r.ok && r.error.code === ErrorCode.RateLimited);
    expect(limited.length).toBeGreaterThan(0);
  });
});

describe('Proteções de conexão', () => {
  it('desconecta clientes que enviam muitas mensagens inválidas', async () => {
    const { server, url } = await startTestServer();
    try {
      const client = await connectClient(url);
      const disconnected = new Promise<void>((resolve) => client.once('disconnect', () => resolve()));
      for (let i = 0; i < 30; i++) (client as unknown as { emit: (e: string) => void }).emit('evento:falso');
      await disconnected;
      expect(client.connected).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('recusa conexões acima do limite configurado', async () => {
    const { server, url } = await startTestServer({ MAX_CONNECTIONS: '1' });
    try {
      const first = await connectClient(url);
      let rejectedWith: NetError | undefined;
      const second = await connectClient(url, (socket) => socket.once(NetEvent.Error, (err) => (rejectedWith = err)));
      const error = await waitFor(() => rejectedWith);
      expect(error.code).toBe(ErrorCode.ServerFull);
      first.disconnect();
      second.disconnect();
    } finally {
      await server.close();
    }
  });
});
