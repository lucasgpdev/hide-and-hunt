import { randomBytes, randomInt, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  ACHIEVEMENTS,
  activeMissions,
  currentSeason,
  DEFAULT_SKIN,
  EMOTES,
  ErrorCode,
  getSkin,
  levelFromXp,
  periodEnd,
  periodKey,
  RATING_START,
  SEASON_REWARDS,
  SEASONS,
  seasonLevel,
  SKINS,
  TRANSFORM_EFFECTS,
  type AchievementDef,
  type GameMode,
  type MatchFacts,
  type MissionStatus,
  type NetError,
  type PlayerMatchResult,
  type Profile,
  type ProgressSnapshot,
  type PublicProfile,
  type RankingCategory,
  type RankingEntry,
  type RankingScope,
  type SocialSnapshot,
  type Team,
} from '@hh/shared';
import type { AccountDoc, AccountStore, SeasonProgress } from './store.js';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export interface Account {
  id: string;
  nickname: string;
  level: number;
  equippedSkin: string;
  equippedEffect: string;
  rating: number;
  reputation: number;
  banned: boolean;
}

export interface MatchRecord {
  matchId: string;
  mapId: string;
  mode: GameMode;
  winner: Team;
  reason: string;
  durationSeconds: number;
  players: { accountId: string; result: PlayerMatchResult; won: boolean; nickname: string; rejectedMoves: number }[];
}

export interface MatchRewards {
  achievements: AchievementDef[];
  missionsCompleted: string[];
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: NetError };
const fail = (code: NetError['code'], message: string) => ({ ok: false as const, error: { code, message } });

/** Situação online de uma conta (fornecida pelo servidor de jogo). */
export type PresenceLookup = (accountId: string) => { online: boolean; roomCode: string | null };

/**
 * Regras de progressão, social e moderação. Toda mudança de XP, moedas,
 * missões, temporada, conquistas, amigos e penalidades passa por aqui —
 * o cliente nunca altera esses dados diretamente.
 *
 * As escritas em uma mesma conta são enfileiradas para evitar conflitos.
 */
export class ProgressionService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly store: AccountStore) {}

  get persistent(): boolean {
    return this.store.persistent;
  }

  // ---------- contas ----------

  async findOrCreate(tokenHash: string, nickname: string): Promise<Account> {
    const existing = await this.store.byToken(tokenHash);
    if (existing) {
      const doc = await this.update(existing, (d) => {
        d.nickname = nickname;
      });
      return toAccount(doc);
    }
    const doc = newAccount(nickname, await this.uniqueFriendCode(nickname));
    await this.store.create(doc, tokenHash);
    return toAccount(doc);
  }

  /** Associa usuário e senha à conta atual (o convidado vira conta com login). */
  async register(accountId: string, username: string, password: string): Promise<Result> {
    if (await this.store.byUsername(username)) return fail(ErrorCode.InvalidAction, 'Este nome de usuário já está em uso.');
    const doc = await this.store.byId(accountId);
    if (!doc) return fail(ErrorCode.Internal, 'Conta não encontrada.');
    if (doc.username) return fail(ErrorCode.InvalidAction, 'Esta conta já tem login.');
    const passwordHash = await hashPassword(password);
    await this.update(accountId, (d) => {
      d.username = username;
      d.passwordHash = passwordHash;
    });
    return { ok: true };
  }

  /** Confere a senha e emite um novo token de acesso para este navegador. */
  async login(username: string, password: string): Promise<Result<{ accountId: string; accountToken: string }>> {
    const id = await this.store.byUsername(username);
    const doc = id ? await this.store.byId(id) : null;
    if (!doc?.passwordHash || !(await verifyPassword(password, doc.passwordHash))) {
      return fail(ErrorCode.InvalidCredentials, 'Usuário ou senha incorretos.');
    }
    if (doc.banned) return fail(ErrorCode.Banned, 'Esta conta foi suspensa.');
    const accountToken = randomBytes(32).toString('base64url');
    await this.store.addToken(doc.id, createHash('sha256').update(accountToken).digest('hex'));
    return { ok: true, accountId: doc.id, accountToken };
  }

  async getProfile(accountId: string): Promise<Profile> {
    const d = await this.require(accountId);
    return {
      id: d.id,
      nickname: d.nickname,
      xp: d.xp,
      level: levelFromXp(d.xp),
      coins: d.coins,
      stats: d.stats,
      ownedSkins: d.ownedSkins,
      equippedSkin: d.equippedSkin,
      history: d.history.slice(0, 10),
      persistent: this.store.persistent,
      friendCode: d.friendCode,
      username: d.username,
      achievements: d.achievements,
      rating: d.rating,
      reputation: d.reputation,
      unlockedEmotes: d.emotes,
      unlockedEffects: d.effects,
      equippedEffect: d.equippedEffect,
    };
  }

  async publicProfile(accountId: string): Promise<PublicProfile | null> {
    const d = await this.store.byId(accountId);
    if (!d) return null;
    return {
      nickname: d.nickname,
      friendCode: d.friendCode,
      level: levelFromXp(d.xp),
      stats: d.stats,
      achievements: d.achievements.length,
      reputation: d.reputation,
    };
  }

  // ---------- partidas ----------

  async recordMatch(match: MatchRecord): Promise<Map<string, MatchRewards>> {
    await this.store.recordMatch({
      id: match.matchId,
      mapId: match.mapId,
      mode: match.mode,
      winner: match.winner,
      reason: match.reason,
      durationSeconds: match.durationSeconds,
    });
    const rewards = new Map<string, MatchRewards>();
    const season = currentSeason();
    const roster = match.players.map((p) => p.accountId);

    for (const { accountId, result, won } of match.players) {
      const facts: MatchFacts & { mapId: string } = {
        won,
        team: result.team,
        captures: result.captures,
        survived: result.survived,
        survivalSeconds: result.survivalSeconds,
        mode: match.mode,
        usedAbilities: result.abilitiesUsed,
        transforms: result.transforms,
        mapId: match.mapId,
      };
      const reward: MatchRewards = { achievements: [], missionsCompleted: [] };
      const others = match.players.filter((p) => p.accountId !== accountId);
      await this.update(accountId, (d) => {
        d.xp += result.xpGained;
        d.coins += result.coinsGained;
        d.stats.matchesPlayed += 1;
        if (won && result.team === 'HIDERS') d.stats.winsHider += 1;
        if (won && result.team === 'HUNTERS') d.stats.winsHunter += 1;
        if (!won) d.stats.losses += 1;
        d.stats.captures += result.captures;
        d.stats.survivalSeconds += result.survivalSeconds;
        d.reputation = Math.min(100, d.reputation + 1);
        if (result.ratingChange !== null) d.rating = Math.max(0, d.rating + result.ratingChange);
        d.history.unshift({
          date: new Date().toISOString(),
          mapId: match.mapId,
          mode: match.mode,
          team: result.team,
          won,
          captures: result.captures,
          survivalSeconds: result.survivalSeconds,
        });
        d.history.length = Math.min(d.history.length, 20);

        const mode = (d.modes[match.mode] ??= { matches: 0, wins: 0, rating: RATING_START });
        mode.matches += 1;
        if (won) mode.wins += 1;
        if (result.ratingChange !== null) mode.rating = Math.max(0, mode.rating + result.ratingChange);

        const sp = seasonOf(d, season.id);
        sp.xp += Math.round(result.xpGained * 1.5);
        sp.matches += 1;
        if (won) sp.wins += 1;
        sp.captures += result.captures;
        sp.survivalSeconds += result.survivalSeconds;
        if (result.ratingChange !== null) sp.rating = Math.max(0, sp.rating + result.ratingChange);

        // Missões: progresso calculado pelo servidor a partir do resultado.
        for (const period of ['daily', 'weekly'] as const) {
          const key = periodKey(period);
          for (const mission of activeMissions(period)) {
            const id = `${key}:${mission.id}`;
            if (d.missionsDone.includes(id)) continue;
            const value = Math.min(mission.goal, (d.missions[id] ?? 0) + mission.progress(facts));
            d.missions[id] = value;
            if (value >= mission.goal) {
              d.missionsDone.push(id);
              d.coins += mission.rewardCoins;
              sp.xp += mission.rewardSeasonXp;
              reward.missionsCompleted.push(mission.description);
            }
          }
        }
        pruneMissions(d);

        for (const achievement of ACHIEVEMENTS) {
          if (d.achievements.some((a) => a.id === achievement.id)) continue;
          if (achievement.check(d.stats, facts)) {
            d.achievements.push({ id: achievement.id, unlockedAt: new Date().toISOString() });
            d.coins += achievement.reward;
            reward.achievements.push(achievement);
          }
        }

        // Jogadores recentes (para adicionar como amigo depois).
        for (const other of others) {
          d.recent = d.recent.filter((r) => r.accountId !== other.accountId);
          d.recent.unshift({ accountId: other.accountId, nickname: other.nickname, friendCode: '', lastPlayed: new Date().toISOString() });
        }
        d.recent.length = Math.min(d.recent.length, 20);
      });
      rewards.set(accountId, reward);
    }
    // Preenche os códigos de amigo dos recentes.
    const codes = new Map<string, string>();
    for (const id of roster) {
      const doc = await this.store.byId(id);
      if (doc) codes.set(id, doc.friendCode);
    }
    for (const id of roster) {
      await this.update(id, (d) => {
        for (const r of d.recent) if (!r.friendCode) r.friendCode = codes.get(r.accountId) ?? '';
      });
    }
    return rewards;
  }

  // ---------- missões e temporada ----------

  async getProgress(accountId: string): Promise<ProgressSnapshot> {
    const d = await this.require(accountId);
    const season = currentSeason();
    const sp = d.seasons[season.id] ?? emptySeason();
    const missions: MissionStatus[] = [];
    for (const period of ['daily', 'weekly'] as const) {
      const key = periodKey(period);
      for (const m of activeMissions(period)) {
        const id = `${key}:${m.id}`;
        missions.push({
          id: m.id,
          period,
          description: m.description,
          goal: m.goal,
          progress: d.missions[id] ?? 0,
          completed: d.missionsDone.includes(id),
          rewardCoins: m.rewardCoins,
          rewardSeasonXp: m.rewardSeasonXp,
          endsAt: periodEnd(period).toISOString(),
        });
      }
    }
    return {
      missions,
      season: {
        season,
        seasonXp: sp.xp,
        level: seasonLevel(sp.xp),
        claimed: sp.claimed,
        rewards: SEASON_REWARDS,
        history: SEASONS.filter((s) => s.id !== season.id && d.seasons[s.id]).map((s) => ({ seasonId: s.id, level: seasonLevel(d.seasons[s.id]!.xp) })),
      },
    };
  }

  async claimSeasonReward(accountId: string, level: number): Promise<Result> {
    const season = currentSeason();
    const d = await this.require(accountId);
    const sp = d.seasons[season.id] ?? emptySeason();
    const reward = SEASON_REWARDS[level - 1];
    if (!reward) return fail(ErrorCode.InvalidAction, 'Nível inexistente.');
    if (seasonLevel(sp.xp) < level) return fail(ErrorCode.InvalidAction, 'Você ainda não chegou a este nível.');
    if (sp.claimed.includes(level)) return fail(ErrorCode.InvalidAction, 'Recompensa já resgatada.');
    await this.update(accountId, (doc) => {
      const progress = seasonOf(doc, season.id);
      if (progress.claimed.includes(level)) return;
      progress.claimed.push(level);
      if (reward.kind === 'coins') doc.coins += reward.amount;
      if (reward.kind === 'skin' && !doc.ownedSkins.includes(reward.skinId)) doc.ownedSkins.push(reward.skinId);
      if (reward.kind === 'effect' && !doc.effects.includes(reward.effectId)) doc.effects.push(reward.effectId);
      if (reward.kind === 'emote' && !doc.emotes.includes(reward.emoteId)) doc.emotes.push(reward.emoteId);
    });
    return { ok: true };
  }

  // ---------- loja ----------

  async buySkin(accountId: string, skinId: string): Promise<Result<{ profile: Profile }>> {
    const skin = SKINS.find((s) => s.id === skinId);
    if (!skin) return fail(ErrorCode.InvalidAction, 'Item inexistente.');
    if (skin.seasonOnly) return fail(ErrorCode.InvalidAction, 'Este visual só sai no passe de temporada.');
    let error: NetError | null = null;
    await this.update(accountId, (d) => {
      if (d.ownedSkins.includes(skinId)) error = { code: ErrorCode.InvalidAction, message: 'Você já tem este visual.' };
      else if (levelFromXp(d.xp) < skin.minLevel) error = { code: ErrorCode.InvalidAction, message: `Disponível a partir do nível ${skin.minLevel}.` };
      else if (d.coins < skin.price) error = { code: ErrorCode.NotEnoughCoins, message: 'Moedas insuficientes.' };
      else {
        d.coins -= skin.price;
        d.ownedSkins.push(skinId);
      }
    });
    if (error) return { ok: false, error };
    return { ok: true, profile: await this.getProfile(accountId) };
  }

  async equipSkin(accountId: string, skinId: string): Promise<Result<{ profile: Profile }>> {
    const d = await this.require(accountId);
    if (!d.ownedSkins.includes(skinId)) return fail(ErrorCode.InvalidAction, 'Você ainda não tem este visual.');
    await this.update(accountId, (doc) => {
      doc.equippedSkin = getSkin(skinId).id;
    });
    return { ok: true, profile: await this.getProfile(accountId) };
  }

  async equipEffect(accountId: string, effectId: string): Promise<Result<{ profile: Profile }>> {
    const d = await this.require(accountId);
    if (!d.effects.includes(effectId) || !TRANSFORM_EFFECTS.some((e) => e.id === effectId)) {
      return fail(ErrorCode.InvalidAction, 'Efeito ainda não desbloqueado.');
    }
    await this.update(accountId, (doc) => {
      doc.equippedEffect = effectId;
    });
    return { ok: true, profile: await this.getProfile(accountId) };
  }

  async canUseEmote(accountId: string, emote: string): Promise<boolean> {
    const def = EMOTES.find((e) => e.id === emote);
    if (!def) return false;
    if (def.free) return true;
    const d = await this.store.byId(accountId);
    return Boolean(d?.emotes.includes(emote));
  }

  // ---------- ranking ----------

  async ranking(category: RankingCategory, scope: RankingScope, mode: GameMode | undefined, limit: number, meAccountId: string): Promise<RankingEntry[]> {
    const rows = await this.store.top({ category, scope, seasonId: currentSeason().id, ...(mode ? { mode } : {}), limit });
    return rows.map(({ doc, value }, index) => ({
      rank: index + 1,
      nickname: doc.nickname,
      level: levelFromXp(doc.xp),
      value,
      isMe: doc.id === meAccountId,
    }));
  }

  // ---------- social ----------

  async social(accountId: string, presence: PresenceLookup): Promise<SocialSnapshot> {
    const d = await this.require(accountId);
    const friends = [];
    for (const id of d.friends) {
      const f = await this.store.byId(id);
      if (!f) continue;
      const p = presence(id);
      friends.push({ accountId: id, nickname: f.nickname, friendCode: f.friendCode, online: p.online, roomCode: p.roomCode, level: levelFromXp(f.xp) });
    }
    const incoming = [];
    for (const request of d.incoming) {
      const from = await this.store.byId(request.from);
      if (from) incoming.push({ id: request.id, fromNickname: from.nickname, fromCode: from.friendCode });
    }
    return {
      friends: friends.sort((a, b) => Number(b.online) - Number(a.online)),
      incoming,
      recent: d.recent.filter((r) => !d.friends.includes(r.accountId)).slice(0, 10),
    };
  }

  /** Pedido de amizade pelo código (Nome#1234). Devolve o id do destinatário. */
  async requestFriend(accountId: string, code: string): Promise<Result<{ targetId: string }>> {
    const targetId = await this.store.byFriendCode(code);
    if (!targetId) return fail(ErrorCode.InvalidAction, 'Nenhum jogador com este código.');
    if (targetId === accountId) return fail(ErrorCode.InvalidAction, 'Esse é o seu próprio código.');
    const me = await this.require(accountId);
    if (me.friends.includes(targetId)) return fail(ErrorCode.InvalidAction, 'Vocês já são amigos.');
    const target = await this.require(targetId);
    if (target.incoming.some((r) => r.from === accountId)) return fail(ErrorCode.InvalidAction, 'Pedido já enviado.');
    // Se o outro já tinha pedido, aceita direto.
    const reverse = me.incoming.find((r) => r.from === targetId);
    if (reverse) {
      await this.respondFriend(accountId, reverse.id, true);
      return { ok: true, targetId };
    }
    await this.update(targetId, (d) => {
      if (d.incoming.length < 50) d.incoming.push({ id: randomUUID(), from: accountId });
    });
    return { ok: true, targetId };
  }

  async respondFriend(accountId: string, requestId: string, accept: boolean): Promise<Result<{ otherId: string }>> {
    const me = await this.require(accountId);
    const request = me.incoming.find((r) => r.id === requestId);
    if (!request) return fail(ErrorCode.InvalidAction, 'Pedido não encontrado.');
    await this.update(accountId, (d) => {
      d.incoming = d.incoming.filter((r) => r.id !== requestId);
      if (accept && !d.friends.includes(request.from)) d.friends.push(request.from);
    });
    if (accept) {
      await this.update(request.from, (d) => {
        if (!d.friends.includes(accountId)) d.friends.push(accountId);
      });
    }
    return { ok: true, otherId: request.from };
  }

  async removeFriend(accountId: string, friendId: string): Promise<Result> {
    await this.update(accountId, (d) => {
      d.friends = d.friends.filter((f) => f !== friendId);
    });
    await this.update(friendId, (d) => {
      d.friends = d.friends.filter((f) => f !== accountId);
    });
    return { ok: true };
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const doc = await this.store.byId(a);
    return Boolean(doc?.friends.includes(b));
  }

  // ---------- moderação ----------

  /** Última denúncia de cada par denunciante → denunciado (evita derrubar a reputação com spam). */
  private readonly recentReports = new Map<string, number>();

  async report(reporterId: string, targetId: string, reason: string, details: string): Promise<Result> {
    if (reporterId === targetId) return fail(ErrorCode.InvalidAction, 'Você não pode denunciar a si mesmo.');
    const key = `${reporterId}:${targetId}`;
    const now = Date.now();
    const last = this.recentReports.get(key);
    if (last !== undefined && now - last < 24 * 3600_000) {
      return fail(ErrorCode.Cooldown, 'Você já denunciou este jogador hoje. A denúncia anterior está sendo analisada.');
    }
    this.recentReports.set(key, now);
    if (this.recentReports.size > 50_000) this.recentReports.clear();
    await this.store.addReport({ id: randomUUID(), reporterId, targetId, reason, details, createdAt: new Date().toISOString() });
    await this.update(targetId, (d) => {
      d.reputation = Math.max(0, d.reputation - 3);
    });
    return { ok: true };
  }

  /**
   * Abandono no meio da partida: reputação cai e, se for recorrente
   * (3 ou mais em 24 h), o jogador espera para entrar em partidas públicas.
   * A espera cresce com a quantidade (penalidade proporcional).
   */
  async recordAbandon(accountId: string): Promise<void> {
    const now = Date.now();
    await this.update(accountId, (d) => {
      d.abandons = [...d.abandons.filter((t) => now - t < 86_400_000), now];
      d.reputation = Math.max(0, d.reputation - 2);
      const recent = d.abandons.length;
      if (recent >= 3) d.penaltyUntil = now + (recent - 2) * 5 * 60_000;
    });
  }

  async penaltySeconds(accountId: string): Promise<number> {
    const d = await this.store.byId(accountId);
    if (!d) return 0;
    return Math.max(0, Math.ceil((d.penaltyUntil - Date.now()) / 1000));
  }

  async setBanned(accountId: string, banned: boolean): Promise<boolean> {
    const d = await this.store.byId(accountId);
    if (!d) return false;
    await this.update(accountId, (doc) => {
      doc.banned = banned;
    });
    return true;
  }

  listReports(limit = 100) {
    return this.store.listReports(limit);
  }

  // ---------- internos ----------

  private async require(accountId: string): Promise<AccountDoc> {
    const doc = await this.store.byId(accountId);
    if (!doc) throw new Error('Conta não encontrada');
    return normalize(doc);
  }

  /** Lê, altera e salva uma conta, um pedido por vez por conta. */
  private update(accountId: string, mutate: (doc: AccountDoc) => void): Promise<AccountDoc> {
    const previous = this.locks.get(accountId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const doc = await this.require(accountId);
        mutate(doc);
        await this.store.save(doc);
        return doc;
      });
    this.locks.set(accountId, next);
    void next.finally(() => {
      if (this.locks.get(accountId) === next) this.locks.delete(accountId);
    }).catch(() => {});
    return next;
  }

  private async uniqueFriendCode(nickname: string): Promise<string> {
    const base = nickname.replace(/#/g, '').slice(0, 16);
    for (let i = 0; i < 20; i++) {
      const code = `${base}#${String(randomInt(10000)).padStart(4, '0')}`;
      if (!(await this.store.byFriendCode(code))) return code;
    }
    return `${base}#${randomUUID().slice(0, 4)}`;
  }
}

function newAccount(nickname: string, friendCode: string): AccountDoc {
  return {
    id: randomUUID(),
    nickname,
    friendCode,
    username: null,
    passwordHash: null,
    xp: 0,
    coins: 0,
    stats: { matchesPlayed: 0, winsHider: 0, winsHunter: 0, losses: 0, captures: 0, survivalSeconds: 0 },
    ownedSkins: [DEFAULT_SKIN],
    equippedSkin: DEFAULT_SKIN,
    effects: ['smoke'],
    equippedEffect: 'smoke',
    emotes: EMOTES.filter((e) => e.free).map((e) => e.id),
    history: [],
    achievements: [],
    rating: RATING_START,
    reputation: 100,
    banned: false,
    penaltyUntil: 0,
    abandons: [],
    friends: [],
    incoming: [],
    recent: [],
    missions: {},
    missionsDone: [],
    seasons: {},
    modes: {},
    createdAt: new Date().toISOString(),
  };
}

/** Completa campos que contas antigas podem não ter. */
function normalize(doc: AccountDoc): AccountDoc {
  const base = newAccount(doc.nickname, doc.friendCode);
  return { ...base, ...doc, id: doc.id, stats: { ...base.stats, ...doc.stats } };
}

function emptySeason(): SeasonProgress {
  return { xp: 0, claimed: [], wins: 0, captures: 0, matches: 0, survivalSeconds: 0, rating: RATING_START };
}

function seasonOf(doc: AccountDoc, seasonId: string): SeasonProgress {
  doc.seasons[seasonId] ??= emptySeason();
  return doc.seasons[seasonId];
}

/** Remove progresso de missões de períodos antigos. */
function pruneMissions(doc: AccountDoc): void {
  const current = new Set([periodKey('daily'), periodKey('weekly')]);
  for (const key of Object.keys(doc.missions)) if (!current.has(key.split(':')[0]!)) delete doc.missions[key];
  doc.missionsDone = doc.missionsDone.filter((key) => current.has(key.split(':')[0]!));
}

function toAccount(doc: AccountDoc): Account {
  return {
    id: doc.id,
    nickname: doc.nickname,
    level: levelFromXp(doc.xp),
    equippedSkin: doc.equippedSkin,
    equippedEffect: doc.equippedEffect ?? 'smoke',
    rating: doc.rating ?? RATING_START,
    reputation: doc.reputation ?? 100,
    banned: Boolean(doc.banned),
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltB64, hashB64] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
