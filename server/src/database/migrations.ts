import type pg from 'pg';
import type { Logger } from '../logger.js';

/**
 * Migrações do banco, aplicadas em ordem na inicialização do servidor.
 * Nunca altere uma migração já aplicada: crie uma nova com versão maior.
 */
const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'progressao_inicial',
    sql: `
      CREATE TABLE players (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash       text NOT NULL UNIQUE,
        nickname         text NOT NULL,
        xp               integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
        coins            integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
        matches_played   integer NOT NULL DEFAULT 0,
        wins_hider       integer NOT NULL DEFAULT 0,
        wins_hunter      integer NOT NULL DEFAULT 0,
        losses           integer NOT NULL DEFAULT 0,
        captures         integer NOT NULL DEFAULT 0,
        survival_seconds integer NOT NULL DEFAULT 0,
        owned_skins      text[] NOT NULL DEFAULT ARRAY['default'],
        equipped_skin    text NOT NULL DEFAULT 'default',
        created_at       timestamptz NOT NULL DEFAULT now(),
        last_seen_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE matches (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        map_id           text NOT NULL,
        winner           text NOT NULL,
        reason           text NOT NULL,
        duration_seconds integer NOT NULL,
        ended_at         timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE match_players (
        match_id         uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id        uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team             text NOT NULL,
        won              boolean NOT NULL,
        captures         integer NOT NULL,
        survival_seconds integer NOT NULL,
        xp_gained        integer NOT NULL,
        coins_gained     integer NOT NULL,
        PRIMARY KEY (match_id, player_id)
      );
      CREATE INDEX match_players_player_idx ON match_players (player_id);
      CREATE INDEX players_xp_idx ON players (xp DESC);
    `,
  },
  {
    version: 2,
    name: 'contas_social_temporadas',
    sql: `
      CREATE TABLE accounts (
        id          uuid PRIMARY KEY,
        username    text UNIQUE,
        friend_code text NOT NULL,
        data        jsonb NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX accounts_friend_code_idx ON accounts (lower(friend_code));
      CREATE INDEX accounts_xp_idx ON accounts (((data->>'xp')::int) DESC);
      CREATE TABLE account_tokens (
        token_hash  text PRIMARY KEY,
        account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE reports (
        id          uuid PRIMARY KEY,
        reporter_id uuid NOT NULL,
        target_id   uuid NOT NULL,
        reason      text NOT NULL,
        details     text NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE match_log (
        id               uuid PRIMARY KEY,
        map_id           text NOT NULL,
        mode             text NOT NULL,
        winner           text NOT NULL,
        reason           text NOT NULL,
        duration_seconds integer NOT NULL,
        ended_at         timestamptz NOT NULL DEFAULT now()
      );
      -- Migra as contas da versão anterior para o novo formato.
      INSERT INTO accounts (id, friend_code, data)
      SELECT id, code, jsonb_build_object(
        'id', id, 'nickname', nickname, 'friendCode', code, 'username', null, 'passwordHash', null,
        'xp', xp, 'coins', coins,
        'stats', jsonb_build_object('matchesPlayed', matches_played, 'winsHider', wins_hider, 'winsHunter', wins_hunter,
                                    'losses', losses, 'captures', captures, 'survivalSeconds', survival_seconds),
        'ownedSkins', to_jsonb(owned_skins), 'equippedSkin', equipped_skin,
        'effects', '["smoke"]'::jsonb, 'equippedEffect', 'smoke', 'emotes', '["yes","no"]'::jsonb,
        'history', '[]'::jsonb, 'achievements', '[]'::jsonb, 'rating', 1000, 'reputation', 100, 'banned', false,
        'penaltyUntil', 0, 'abandons', '[]'::jsonb, 'friends', '[]'::jsonb, 'incoming', '[]'::jsonb, 'recent', '[]'::jsonb,
        'missions', '{}'::jsonb, 'missionsDone', '[]'::jsonb, 'seasons', '{}'::jsonb, 'modes', '{}'::jsonb,
        'createdAt', created_at)
      FROM (SELECT p.*, p.nickname || '#' || lpad((abs(hashtext(p.id::text)) % 10000)::text, 4, '0') AS code FROM players p) src
      ON CONFLICT DO NOTHING;
      INSERT INTO account_tokens (token_hash, account_id)
      SELECT p.token_hash, p.id FROM players p JOIN accounts a ON a.id = p.id ON CONFLICT DO NOTHING;
    `,
  },
];

export async function runMigrations(pool: pg.Pool, logger: Logger): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
        logger.info({ version: migration.version, name: migration.name }, 'Migração aplicada');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
