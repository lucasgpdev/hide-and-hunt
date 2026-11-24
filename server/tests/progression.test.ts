import { describe, expect, it } from 'vitest';
import { activeMissions, type PlayerMatchResult } from '@hh/shared';
import { ProgressionService } from '../src/progression/ProgressionService.js';
import { MemoryAccountStore } from '../src/progression/store.js';

function result(overrides: Partial<PlayerMatchResult> = {}): PlayerMatchResult {
  return {
    id: 'p',
    nickname: 'x',
    team: 'HUNTERS',
    captures: 3,
    survived: false,
    survivalSeconds: 0,
    xpGained: 225,
    coinsGained: 45,
    transforms: 0,
    abilitiesUsed: 4,
    ratingChange: null,
    ...overrides,
  };
}

async function twoAccounts() {
  const service = new ProgressionService(new MemoryAccountStore());
  const a = await service.findOrCreate('hash-a', 'Ana');
  const b = await service.findOrCreate('hash-b', 'Beto');
  return { service, a, b };
}

describe('ProgressionService', () => {
  it('reconhece a mesma conta pelo token e gera código de amigo', async () => {
    const { service, a } = await twoAccounts();
    const again = await service.findOrCreate('hash-a', 'Ana Nova');
    expect(again.id).toBe(a.id);
    const profile = await service.getProfile(a.id);
    expect(profile.nickname).toBe('Ana Nova');
    expect(profile.friendCode).toMatch(/^Ana#\d{4}$/);
  });

  it('registra partida: XP, conquistas, missões e temporada', async () => {
    const { service, a, b } = await twoAccounts();
    const rewards = await service.recordMatch({
      matchId: '00000000-0000-4000-8000-000000000001',
      mapId: 'supermarket',
      mode: 'classic',
      winner: 'HUNTERS',
      reason: 'teste',
      durationSeconds: 120,
      players: [
        { accountId: a.id, nickname: 'Ana', result: result(), won: true, rejectedMoves: 0 },
        { accountId: b.id, nickname: 'Beto', result: result({ team: 'HIDERS', captures: 0, survivalSeconds: 60, xpGained: 62 }), won: false, rejectedMoves: 0 },
      ],
    });
    const ids = rewards.get(a.id)!.achievements.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['first_match', 'first_win', 'first_capture', 'triple', 'tactician']));
    const profile = await service.getProfile(a.id);
    expect(profile.xp).toBe(225);
    expect(profile.stats.captures).toBe(3);
    const progress = await service.getProgress(a.id);
    expect(progress.season.seasonXp).toBeGreaterThan(0);
    expect(progress.missions).toHaveLength(6);
    const daily = activeMissions('daily');
    expect(progress.missions.filter((m) => m.period === 'daily').map((m) => m.id)).toEqual(daily.map((m) => m.id));
    const social = await service.social(a.id, () => ({ online: false, roomCode: null }));
    expect(social.recent[0]?.nickname).toBe('Beto');
  });

  it('amizade por código: pedido, aceite e remoção', async () => {
    const { service, a, b } = await twoAccounts();
    const codeB = (await service.getProfile(b.id)).friendCode;
    expect((await service.requestFriend(a.id, codeB)).ok).toBe(true);
    expect((await service.requestFriend(a.id, codeB)).ok).toBe(false);
    const incoming = (await service.social(b.id, () => ({ online: true, roomCode: null }))).incoming;
    expect(incoming).toHaveLength(1);
    expect((await service.respondFriend(b.id, incoming[0]!.id, true)).ok).toBe(true);
    expect(await service.areFriends(a.id, b.id)).toBe(true);
    const friends = (await service.social(a.id, () => ({ online: true, roomCode: 'ABC123' }))).friends;
    expect(friends[0]).toMatchObject({ nickname: 'Beto', online: true, roomCode: 'ABC123' });
    await service.removeFriend(a.id, b.id);
    expect(await service.areFriends(b.id, a.id)).toBe(false);
  });

  it('cadastro e login com senha emitem novo token para a mesma conta', async () => {
    const { service, a } = await twoAccounts();
    expect((await service.register(a.id, 'ana.dev', 'senha-forte-123')).ok).toBe(true);
    expect((await service.login('ana.dev', 'errada-123')).ok).toBe(false);
    const login = await service.login('ana.dev', 'senha-forte-123');
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.accountId).toBe(a.id);
    const { createHash } = await import('node:crypto');
    const same = await service.findOrCreate(createHash('sha256').update(login.accountToken).digest('hex'), 'Ana');
    expect(same.id).toBe(a.id);
  });

  it('abandonos recorrentes geram penalidade proporcional e reduzem reputação', async () => {
    const { service, a } = await twoAccounts();
    await service.recordAbandon(a.id);
    await service.recordAbandon(a.id);
    expect(await service.penaltySeconds(a.id)).toBe(0);
    await service.recordAbandon(a.id);
    expect(await service.penaltySeconds(a.id)).toBeGreaterThan(250);
    expect((await service.getProfile(a.id)).reputation).toBeLessThan(100);
  });

  it('passe de temporada: só resgata níveis alcançados, uma vez', async () => {
    const { service, a } = await twoAccounts();
    expect((await service.claimSeasonReward(a.id, 1)).ok).toBe(false);
    for (let i = 0; i < 3; i++) {
      await service.recordMatch({
        matchId: `00000000-0000-4000-8000-00000000000${i}`,
        mapId: 'supermarket',
        mode: 'classic',
        winner: 'HUNTERS',
        reason: '',
        durationSeconds: 60,
        players: [{ accountId: a.id, nickname: 'Ana', result: result(), won: true, rejectedMoves: 0 }],
      });
    }
    expect((await service.claimSeasonReward(a.id, 1)).ok).toBe(true);
    expect((await service.claimSeasonReward(a.id, 1)).ok).toBe(false);
  });

  it('loja não vende visuais exclusivos de temporada', async () => {
    const { service, a } = await twoAccounts();
    const r = await service.buySkin(a.id, 'season_gold');
    expect(r.ok).toBe(false);
  });

  it('denúncia repetida do mesmo jogador não derruba a reputação de novo', async () => {
    const { service, a, b } = await twoAccounts();
    expect((await service.report(a.id, b.id, 'abuse', '')).ok).toBe(true);
    const after = (await service.getProfile(b.id)).reputation;
    const again = await service.report(a.id, b.id, 'abuse', '');
    expect(again.ok).toBe(false);
    expect((await service.getProfile(b.id)).reputation).toBe(after);
    expect((await service.report(a.id, a.id, 'abuse', '')).ok).toBe(false);
  });
});
