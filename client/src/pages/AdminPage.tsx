import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiUrl } from '../multiplayer/serverUrl';

interface AdminPlayer {
  id: string;
  accountId: string;
  nickname: string;
  team: string | null;
  connected: boolean;
  rejectedMoves: number;
}
interface AdminRoom {
  code: string;
  mode: string;
  state: string;
  mapId: string;
  isPrivate: boolean;
  players: AdminPlayer[];
}
interface AdminReport {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: string;
}

const TOKEN_KEY = 'hh.adminToken';

/**
 * Painel de moderação (item 37), aberto em /#admin.
 * Só funciona com o ADMIN_TOKEN configurado no servidor; o token fica
 * apenas na memória da aba (sessionStorage).
 */
export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [draft, setDraft] = useState('');
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const call = useCallback(
    async <T,>(path: string, body?: object): Promise<T | null> => {
      try {
        const res = await fetch(apiUrl(path), {
          method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await res.json()) as T & { error?: string };
        if (!res.ok) {
          setError(data.error ?? `Erro ${res.status}`);
          return null;
        }
        setError(null);
        return data;
      } catch {
        setError('Servidor indisponível.');
        return null;
      }
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const [r, rep] = await Promise.all([call<AdminRoom[]>('/api/admin/rooms'), call<AdminReport[]>('/api/admin/reports')]);
    if (r) setRooms(r);
    if (rep) setReports(rep);
  }, [call, token]);

  useEffect(() => {
    void refresh();
    if (!token) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh, token]);

  const login = (event: FormEvent) => {
    event.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, draft);
    setToken(draft);
    setDraft('');
  };

  const kick = async (playerId: string, nickname: string) => {
    if (!window.confirm(`Remover ${nickname} da sala?`)) return;
    const result = await call<{ ok: boolean }>('/api/admin/kick', { playerId });
    setMessage(result?.ok ? `${nickname} foi removido.` : 'Não foi possível remover.');
    void refresh();
  };

  const ban = async (accountId: string, label: string, banned: boolean) => {
    if (!window.confirm(`${banned ? 'Banir' : 'Desbanir'} a conta ${label}?`)) return;
    const result = await call<{ ok: boolean }>('/api/admin/ban', { accountId, banned });
    setMessage(result?.ok ? `Conta ${banned ? 'banida' : 'liberada'}.` : 'Conta não encontrada.');
    void refresh();
  };

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>HIDE &amp; HUNT · Moderação</h1>
        <a href="#" className="link-button">
          Voltar ao jogo
        </a>
      </header>
      {!token ? (
        <form className="panel account-form" onSubmit={login}>
          <input
            className="join-input"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ADMIN_TOKEN do servidor"
            aria-label="Token de administração"
          />
          <button type="submit" className="button-primary" disabled={draft.length < 24}>
            Entrar
          </button>
        </form>
      ) : (
        <>
          <div className="admin-actions">
            <button type="button" className="button-secondary" onClick={() => void refresh()}>
              Atualizar
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                sessionStorage.removeItem(TOKEN_KEY);
                setToken('');
              }}
            >
              Sair
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-ok">{message}</p>}
          <section className="panel">
            <h2 className="section-title">Salas ativas ({rooms.length})</h2>
            {rooms.length === 0 && <p className="muted">Nenhuma sala aberta.</p>}
            {rooms.map((room) => (
              <div key={room.code} className="admin-room">
                <p>
                  <strong>{room.code}</strong> · {room.mode} · {room.state} · {room.mapId} · {room.isPrivate ? 'privada' : 'pública'}
                </p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Jogador</th>
                      <th>Equipe</th>
                      <th>Conexão</th>
                      <th title="Movimentos recusados pelo servidor (possível trapaça ou rede ruim)">Mov. recusados</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {room.players.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nickname}</td>
                        <td>{p.team ?? '—'}</td>
                        <td>{p.connected ? 'online' : 'reconectando'}</td>
                        <td className={p.rejectedMoves > 20 ? 'form-error' : ''}>{p.rejectedMoves}</td>
                        <td>
                          <button type="button" className="link-button" onClick={() => void kick(p.id, p.nickname)}>
                            Expulsar
                          </button>{' '}
                          <button type="button" className="link-button" onClick={() => void ban(p.accountId, p.nickname, true)}>
                            Banir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2 className="section-title">Denúncias recentes ({reports.length})</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Motivo</th>
                  <th>Denunciado (conta)</th>
                  <th>Detalhes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                    <td>{r.reason}</td>
                    <td>
                      <code>{r.targetId.slice(0, 8)}</code>
                    </td>
                    <td>{r.details || '—'}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => void ban(r.targetId, r.targetId.slice(0, 8), true)}>
                        Banir
                      </button>{' '}
                      <button type="button" className="link-button" onClick={() => void ban(r.targetId, r.targetId.slice(0, 8), false)}>
                        Desbanir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
