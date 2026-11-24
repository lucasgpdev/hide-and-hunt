import type {
  MatchHistoryEntry,
  PlayerStats,
  RankingCategory,
  RankingScope,
  UnlockedAchievement,
} from '@hh/shared';

/** Documento de uma conta: toda a progressão do jogador. */
export interface AccountDoc {
  id: string;
  nickname: string;
  friendCode: string;
  username: string | null;
  passwordHash: string | null;
  xp: number;
  coins: number;
  stats: PlayerStats;
  ownedSkins: string[];
  equippedSkin: string;
  effects: string[];
  equippedEffect: string;
  emotes: string[];
  history: MatchHistoryEntry[];
  achievements: UnlockedAchievement[];
  rating: number;
  reputation: number;
  banned: boolean;
  penaltyUntil: number;
  abandons: number[];
  friends: string[];
  incoming: { id: string; from: string }[];
  recent: { accountId: string; nickname: string; friendCode: string; lastPlayed: string }[];
  /** Progresso de missões por "período:missão". */
  missions: Record<string, number>;
  missionsDone: string[];
  seasons: Record<string, SeasonProgress>;
  modes: Record<string, { matches: number; wins: number; rating: number }>;
  createdAt: string;
}

export interface SeasonProgress {
  xp: number;
  claimed: number[];
  wins: number;
  captures: number;
  matches: number;
  survivalSeconds: number;
  rating: number;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: string;
}

export interface RankingQuery {
  category: RankingCategory;
  scope: RankingScope;
  seasonId: string;
  mode?: string;
  limit: number;
}

/**
 * Armazenamento das contas. Duas implementações: memória (sem banco) e
 * PostgreSQL (documentos JSONB com índices). Toda a regra de negócio fica no
 * ProgressionService, que é igual para as duas.
 */
export interface AccountStore {
  readonly persistent: boolean;
  byId(id: string): Promise<AccountDoc | null>;
  byToken(tokenHash: string): Promise<string | null>;
  byUsername(username: string): Promise<string | null>;
  byFriendCode(code: string): Promise<string | null>;
  create(doc: AccountDoc, tokenHash: string): Promise<void>;
  save(doc: AccountDoc): Promise<void>;
  addToken(accountId: string, tokenHash: string): Promise<void>;
  top(query: RankingQuery): Promise<{ doc: AccountDoc; value: number }[]>;
  addReport(report: ReportRecord): Promise<void>;
  listReports(limit: number): Promise<ReportRecord[]>;
  /** Guarda um registro da partida (estatísticas globais). */
  recordMatch(match: { id: string; mapId: string; mode: string; winner: string; reason: string; durationSeconds: number }): Promise<void>;
}

/** Valor usado no ranking para uma conta. */
export function rankingValue(doc: AccountDoc, query: RankingQuery): number {
  if (query.mode) {
    const m = doc.modes[query.mode];
    if (!m) return 0;
    return query.category === 'rating' ? m.rating : query.category === 'matchesPlayed' ? m.matches : m.wins;
  }
  if (query.scope === 'season') {
    const s = doc.seasons[query.seasonId];
    if (!s) return 0;
    switch (query.category) {
      case 'xp':
        return s.xp;
      case 'captures':
        return s.captures;
      case 'survivalSeconds':
        return s.survivalSeconds;
      case 'matchesPlayed':
        return s.matches;
      case 'rating':
        return s.rating;
      default:
        return s.wins;
    }
  }
  if (query.category === 'xp') return doc.xp;
  if (query.category === 'rating') return doc.rating;
  return doc.stats[query.category];
}

export class MemoryAccountStore implements AccountStore {
  readonly persistent = false;
  private readonly docs = new Map<string, AccountDoc>();
  private readonly tokens = new Map<string, string>();
  private readonly reports: ReportRecord[] = [];

  async byId(id: string) {
    const doc = this.docs.get(id);
    return doc ? structuredClone(doc) : null;
  }
  async byToken(tokenHash: string) {
    return this.tokens.get(tokenHash) ?? null;
  }
  async byUsername(username: string) {
    for (const doc of this.docs.values()) if (doc.username === username) return doc.id;
    return null;
  }
  async byFriendCode(code: string) {
    const lower = code.toLowerCase();
    for (const doc of this.docs.values()) if (doc.friendCode.toLowerCase() === lower) return doc.id;
    return null;
  }
  async create(doc: AccountDoc, tokenHash: string) {
    this.docs.set(doc.id, structuredClone(doc));
    this.tokens.set(tokenHash, doc.id);
  }
  async save(doc: AccountDoc) {
    this.docs.set(doc.id, structuredClone(doc));
  }
  async addToken(accountId: string, tokenHash: string) {
    this.tokens.set(tokenHash, accountId);
  }
  async top(query: RankingQuery) {
    return [...this.docs.values()]
      .filter((d) => d.stats.matchesPlayed > 0 && !d.banned)
      .map((doc) => ({ doc, value: rankingValue(doc, query) }))
      .filter((x) => x.value > 0 || query.category === 'rating')
      .sort((a, b) => b.value - a.value || b.doc.xp - a.doc.xp)
      .slice(0, query.limit);
  }
  async addReport(report: ReportRecord) {
    this.reports.unshift(report);
    this.reports.length = Math.min(this.reports.length, 500);
  }
  async listReports(limit: number) {
    return this.reports.slice(0, limit);
  }
  async recordMatch() {}
}
