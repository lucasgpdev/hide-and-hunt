import type pg from 'pg';
import type { AccountDoc, AccountStore, RankingQuery, ReportRecord } from './store.js';

/** Expressões SQL permitidas no ranking (lista fechada: nada do cliente entra no SQL). */
const GLOBAL_COLUMNS: Record<string, string> = {
  xp: "(data->>'xp')::int",
  rating: "(data->>'rating')::int",
  winsHider: "(data->'stats'->>'winsHider')::int",
  winsHunter: "(data->'stats'->>'winsHunter')::int",
  captures: "(data->'stats'->>'captures')::int",
  survivalSeconds: "(data->'stats'->>'survivalSeconds')::int",
  matchesPlayed: "(data->'stats'->>'matchesPlayed')::int",
};
const SEASON_FIELDS: Record<string, string> = {
  xp: 'xp',
  rating: 'rating',
  winsHider: 'wins',
  winsHunter: 'wins',
  captures: 'captures',
  survivalSeconds: 'survivalSeconds',
  matchesPlayed: 'matches',
};

/**
 * Contas no PostgreSQL: o documento fica em JSONB e os campos de busca
 * (token, usuário, código de amigo) têm índices próprios.
 */
export class PostgresAccountStore implements AccountStore {
  readonly persistent = true;

  constructor(private readonly pool: pg.Pool) {}

  async byId(id: string): Promise<AccountDoc | null> {
    const { rows } = await this.pool.query<{ data: AccountDoc }>('SELECT data FROM accounts WHERE id = $1', [id]);
    return rows[0]?.data ?? null;
  }

  async byToken(tokenHash: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ account_id: string }>('SELECT account_id FROM account_tokens WHERE token_hash = $1', [tokenHash]);
    return rows[0]?.account_id ?? null;
  }

  async byUsername(username: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [username]);
    return rows[0]?.id ?? null;
  }

  async byFriendCode(code: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>('SELECT id FROM accounts WHERE lower(friend_code) = lower($1)', [code]);
    return rows[0]?.id ?? null;
  }

  async create(doc: AccountDoc, tokenHash: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO accounts (id, username, friend_code, data) VALUES ($1, $2, $3, $4)', [
        doc.id,
        doc.username,
        doc.friendCode,
        doc,
      ]);
      await client.query('INSERT INTO account_tokens (token_hash, account_id) VALUES ($1, $2)', [tokenHash, doc.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async save(doc: AccountDoc): Promise<void> {
    await this.pool.query('UPDATE accounts SET username = $2, friend_code = $3, data = $4, updated_at = now() WHERE id = $1', [
      doc.id,
      doc.username,
      doc.friendCode,
      doc,
    ]);
  }

  async addToken(accountId: string, tokenHash: string): Promise<void> {
    await this.pool.query('INSERT INTO account_tokens (token_hash, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [tokenHash, accountId]);
  }

  async top(query: RankingQuery): Promise<{ doc: AccountDoc; value: number }[]> {
    let expression: string;
    const params: unknown[] = [query.limit];
    if (query.mode) {
      params.push(query.mode);
      const field = query.category === 'rating' ? 'rating' : query.category === 'matchesPlayed' ? 'matches' : 'wins';
      expression = `COALESCE((data->'modes'->$2->>'${field}')::int, 0)`;
    } else if (query.scope === 'season') {
      params.push(query.seasonId);
      expression = `COALESCE((data->'seasons'->$2->>'${SEASON_FIELDS[query.category] ?? 'xp'}')::int, 0)`;
    } else {
      expression = GLOBAL_COLUMNS[query.category] ?? GLOBAL_COLUMNS.xp!;
    }
    const { rows } = await this.pool.query<{ data: AccountDoc; value: number }>(
      `SELECT data, ${expression} AS value FROM accounts
       WHERE (data->'stats'->>'matchesPlayed')::int > 0 AND NOT (data->>'banned')::boolean
       ORDER BY value DESC, (data->>'xp')::int DESC LIMIT $1`,
      params,
    );
    return rows.map((r) => ({ doc: r.data, value: Number(r.value) }));
  }

  async addReport(report: ReportRecord): Promise<void> {
    await this.pool.query('INSERT INTO reports (id, reporter_id, target_id, reason, details) VALUES ($1, $2, $3, $4, $5)', [
      report.id,
      report.reporterId,
      report.targetId,
      report.reason,
      report.details,
    ]);
  }

  async listReports(limit: number): Promise<ReportRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      reporter_id: string;
      target_id: string;
      reason: string;
      details: string;
      created_at: Date;
    }>('SELECT * FROM reports ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      targetId: r.target_id,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async recordMatch(match: { id: string; mapId: string; mode: string; winner: string; reason: string; durationSeconds: number }): Promise<void> {
    await this.pool.query(
      'INSERT INTO match_log (id, map_id, mode, winner, reason, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
      [match.id, match.mapId, match.mode, match.winner, match.reason, match.durationSeconds],
    );
  }
}
