import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { GAME_NAME, GAME_VERSION, PROTOCOL_VERSION, type HealthResponse } from '@hh/shared';
import type { Database } from './database/database.js';

export interface AdminActions {
  rooms(): unknown;
  reports(): Promise<unknown>;
  kick(playerId: string): boolean;
  ban(accountId: string, banned: boolean): Promise<boolean>;
}

export interface AppDeps {
  clientOrigins: string[];
  database: Database;
  getOnlinePlayers: () => number;
  getRoomCount: () => number;
  startedAt: number;
  adminToken?: string | undefined;
  admin?: AdminActions;
  /** Pasta do cliente compilado (opcional): o servidor entrega o jogo também. */
  clientDist?: string | undefined;
}

/**
 * Aplicação HTTP (Express): health check, ferramentas de administração
 * (protegidas por token) e, opcionalmente, os arquivos do cliente.
 * O jogo em si usa Socket.IO.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.clientOrigins }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', async (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      name: GAME_NAME,
      version: GAME_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
      onlinePlayers: deps.getOnlinePlayers(),
      rooms: deps.getRoomCount(),
      database: await deps.database.checkStatus(),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  // ---------- administração (item 37): permissões restritas por token ----------
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = deps.adminToken;
    const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const ok = token && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) {
      res.status(token ? 401 : 404).json({ error: token ? 'Token inválido.' : 'Administração desativada.' });
      return;
    }
    next();
  };
  const admin = deps.admin;
  if (admin) {
    app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
      res.json(admin.rooms());
    });
    app.get('/api/admin/reports', requireAdmin, async (_req, res) => {
      res.json(await admin.reports());
    });
    app.post('/api/admin/kick', requireAdmin, (req, res) => {
      const parsed = z.object({ playerId: z.uuid() }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: 'playerId inválido.' });
      res.json({ ok: admin.kick(parsed.data.playerId) });
    });
    app.post('/api/admin/ban', requireAdmin, async (req, res) => {
      const parsed = z.object({ accountId: z.uuid(), banned: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: 'Dados inválidos.' });
      res.json({ ok: await admin.ban(parsed.data.accountId, parsed.data.banned) });
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Produção em um só serviço: entrega o cliente compilado.
  if (deps.clientDist) {
    const dist = resolve(deps.clientDist);
    if (existsSync(join(dist, 'index.html'))) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
    }
  }

  return app;
}
