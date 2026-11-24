import { useEffect, useState, type FormEvent } from 'react';
import { ACHIEVEMENTS, getMap, getSkin, levelFromXp, MODE_INFO, TRANSFORM_EFFECTS, xpForLevel, type GameMode } from '@hh/shared';
import { useNetwork } from '../../hooks/useNetwork';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

/** PERFIL: nível, XP, moedas, estatísticas e histórico de partidas. */
export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { profile } = useNetwork();
  useEffect(() => {
    void network.refreshProfile();
  }, []);

  if (!profile) {
    return (
      <Modal title="Perfil" onClose={onClose}>
        <p className="muted">Carregando...</p>
      </Modal>
    );
  }

  const level = levelFromXp(profile.xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const progress = (profile.xp - current) / (next - current);
  const s = profile.stats;
  const winRate = s.matchesPlayed > 0 ? Math.round(((s.winsHider + s.winsHunter) / s.matchesPlayed) * 100) : 0;
  const skin = getSkin(profile.equippedSkin);

  return (
    <Modal title="Perfil" onClose={onClose} wide>
      <div className="profile-header">
        <div className="avatar-badge" style={{ background: skin.color, borderColor: skin.accent }} aria-hidden="true">
          {profile.nickname.slice(0, 1).toUpperCase()}
        </div>
        <div className="profile-id">
          <h3>{profile.nickname}</h3>
          <p className="muted">
            Nível {level} · {profile.xp} XP · {profile.coins} moedas
          </p>
          <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="tiny muted">
            {next - profile.xp} XP para o nível {level + 1}
          </p>
        </div>
      </div>
      <p className="muted tiny">
        Código de amigo: <strong>{profile.friendCode}</strong> · Pontuação competitiva: <strong>{profile.rating}</strong> · Reputação:{' '}
        <strong>{profile.reputation}</strong>/100
      </p>
      {!profile.persistent && (
        <p className="notice">
          O servidor está sem banco de dados: sua progressão vale até ele reiniciar. Rode <code>npm run db:up</code> para salvar.
        </p>
      )}
      <div className="stat-grid">
        <Stat label="Partidas" value={s.matchesPlayed} />
        <Stat label="Taxa de vitória" value={`${winRate}%`} />
        <Stat label="Vitórias como escondido" value={s.winsHider} />
        <Stat label="Vitórias como caçador" value={s.winsHunter} />
        <Stat label="Capturas" value={s.captures} />
        <Stat label="Tempo sobrevivido" value={formatDuration(s.survivalSeconds)} />
      </div>
      <h3 className="section-title">
        Conquistas ({profile.achievements.length}/{ACHIEVEMENTS.length})
      </h3>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = profile.achievements.find((u) => u.id === a.id);
          return (
            <div key={a.id} className={`achievement ${unlocked ? 'achievement--unlocked' : ''}`} title={a.description}>
              <span className="achievement-icon">{unlocked ? '★' : '☆'}</span>
              <span>
                <strong>{a.name}</strong>
                <br />
                <span className="tiny muted">{a.description}</span>
              </span>
            </div>
          );
        })}
      </div>

      <h3 className="section-title">Efeito de transformação</h3>
      <div className="tabs">
        {TRANSFORM_EFFECTS.map((e) => {
          const owned = profile.unlockedEffects.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              className={`tab ${profile.equippedEffect === e.id ? 'tab--active' : ''}`}
              disabled={!owned}
              title={owned ? '' : 'Desbloqueie no passe de temporada'}
              onClick={() => void network.equipEffect(e.id)}
            >
              {e.name}
              {owned ? '' : ' 🔒'}
            </button>
          );
        })}
      </div>

      <AccountSection username={profile.username} />

      <h3 className="section-title">Histórico de partidas</h3>
      {profile.history.length === 0 ? (
        <p className="muted">Nenhuma partida concluída ainda.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Mapa</th>
              <th>Modo</th>
              <th>Equipe</th>
              <th>Resultado</th>
              <th>Capturas</th>
              <th>Sobreviveu</th>
            </tr>
          </thead>
          <tbody>
            {profile.history.map((h, i) => (
              <tr key={i}>
                <td>{new Date(h.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{getMap(h.mapId)?.name ?? h.mapId}</td>
                <td>{h.mode ? MODE_INFO[h.mode as GameMode]?.name ?? h.mode : 'Clássico'}</td>
                <td>{h.team === 'HUNTERS' ? 'Caçador' : 'Escondido'}</td>
                <td className={h.won ? 'text-ok' : 'text-error'}>{h.won ? 'Vitória' : 'Derrota'}</td>
                <td>{h.captures}</td>
                <td>{h.team === 'HIDERS' ? formatDuration(h.survivalSeconds) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** Cadastro com usuário e senha (para jogar em outros dispositivos) e login. */
function AccountSection({ username }: { username: string | null }) {
  const [mode, setMode] = useState<'register' | 'login'>(username ? 'login' : 'register');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = mode === 'register' ? await network.register(user, password) : await network.login(user, password);
    setBusy(false);
    setPassword('');
    setMessage(result.ok ? { text: mode === 'register' ? 'Conta protegida com senha!' : 'Entrando...', ok: true } : { text: result.error.message, ok: false });
  };

  return (
    <section>
      <h3 className="section-title">Conta</h3>
      {username ? (
        <p className="muted">
          Conectado como <strong>{username}</strong>. Use este usuário e senha para jogar em outro navegador.
        </p>
      ) : (
        <p className="muted tiny">
          Você está jogando como convidado. Crie um usuário e senha para não perder a progressão ao trocar de navegador.
        </p>
      )}
      <div className="tabs">
        {!username && (
          <button type="button" className={`tab ${mode === 'register' ? 'tab--active' : ''}`} onClick={() => setMode('register')}>
            Criar login
          </button>
        )}
        <button type="button" className={`tab ${mode === 'login' ? 'tab--active' : ''}`} onClick={() => setMode('login')}>
          Entrar em outra conta
        </button>
      </div>
      {(mode === 'login' || !username) && (
        <form className="account-form" onSubmit={submit}>
          <input className="join-input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="usuário" autoComplete="username" aria-label="Usuário" />
          <input
            className="join-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="senha (mín. 8)"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            aria-label="Senha"
          />
          <button type="submit" className="button-primary" disabled={busy || user.length < 3 || password.length < 8}>
            {mode === 'register' ? 'Criar' : 'Entrar'}
          </button>
        </form>
      )}
      {mode === 'login' && <p className="tiny muted">Ao entrar em outra conta, a progressão deste convidado fica para trás.</p>}
      {message && <p className={message.ok ? 'form-ok' : 'form-error'}>{message.text}</p>}
    </section>
  );
}
