import { useEffect, useState, type FormEvent } from 'react';
import { levelFromXp, type PublicProfile } from '@hh/shared';
import { playSound } from '../../audio/sound';
import { useNetwork } from '../../hooks/useNetwork';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';

/** AMIGOS: lista, pedidos, jogadores recentes, convites e perfil público (item 12). */
export function FriendsPanel({ onClose }: { onClose: () => void }) {
  const { social, profile, room } = useNetwork();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [viewing, setViewing] = useState<PublicProfile | null>(null);

  useEffect(() => {
    void network.refreshSocial();
    const timer = setInterval(() => void network.refreshSocial(), 10_000);
    return () => clearInterval(timer);
  }, []);

  const show = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    playSound(ok ? 'click' : 'error');
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const result = await network.friendRequest(code.trim());
    if (result.ok) {
      setCode('');
      show('Pedido enviado!', true);
    } else show(result.error.message, false);
  };

  const invite = async (accountId: string) => {
    const result = await network.invite(accountId);
    show(result.ok ? 'Convite enviado.' : result.error.message, result.ok);
  };

  const view = async (accountId: string) => {
    const result = await network.viewProfile(accountId);
    if (result.ok) setViewing(result.profile);
  };

  return (
    <Modal title="Amigos" onClose={onClose} wide>
      <p className="muted">
        Seu código de amigo: <strong className="coins">{profile?.friendCode}</strong>
      </p>
      <form className="join-row" onSubmit={add}>
        <input className="join-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nome#1234" maxLength={24} aria-label="Código de amigo" />
        <button type="submit" className="button-primary" disabled={!code.includes('#')}>
          Adicionar
        </button>
      </form>
      {message && <p className={message.ok ? 'form-ok' : 'form-error'}>{message.text}</p>}

      {social && social.incoming.length > 0 && (
        <>
          <h3 className="section-title">Pedidos recebidos</h3>
          {social.incoming.map((r) => (
            <div key={r.id} className="friend-row">
              <span>
                <strong>{r.fromNickname}</strong> <span className="tiny muted">{r.fromCode}</span>
              </span>
              <span className="friend-actions">
                <button type="button" className="button-primary button-small" onClick={() => void network.friendRespond(r.id, true)}>
                  Aceitar
                </button>
                <button type="button" className="button-secondary button-small" onClick={() => void network.friendRespond(r.id, false)}>
                  Recusar
                </button>
              </span>
            </div>
          ))}
        </>
      )}

      <h3 className="section-title">Amigos</h3>
      {!social && <p className="muted">Carregando...</p>}
      {social?.friends.length === 0 && <p className="muted">Nenhum amigo ainda. Compartilhe seu código!</p>}
      {social?.friends.map((f) => (
        <div key={f.accountId} className="friend-row">
          <span>
            <span className={`dot dot--${f.online ? 'online' : 'none'}`} /> <strong>{f.nickname}</strong>{' '}
            <span className="tiny muted">
              Nv {f.level} · {f.online ? (f.roomCode ? `na sala ${f.roomCode}` : 'online') : 'offline'}
            </span>
          </span>
          <span className="friend-actions">
            {f.online && room && (
              <button type="button" className="button-primary button-small" onClick={() => void invite(f.accountId)}>
                Convidar
              </button>
            )}
            {f.online && f.roomCode && !room && (
              <button type="button" className="button-primary button-small" onClick={() => void network.joinRoom(f.roomCode!)}>
                Entrar junto
              </button>
            )}
            <button type="button" className="button-secondary button-small" onClick={() => void view(f.accountId)}>
              Perfil
            </button>
            <button type="button" className="button-secondary button-small" onClick={() => void network.friendRemove(f.accountId)}>
              Remover
            </button>
          </span>
        </div>
      ))}

      {social && social.recent.length > 0 && (
        <>
          <h3 className="section-title">Jogou com você recentemente</h3>
          {social.recent.map((r) => (
            <div key={r.accountId} className="friend-row">
              <span>
                <strong>{r.nickname}</strong> <span className="tiny muted">{new Date(r.lastPlayed).toLocaleDateString('pt-BR')}</span>
              </span>
              {r.friendCode && (
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => void network.friendRequest(r.friendCode).then((res) => show(res.ok ? 'Pedido enviado!' : res.error.message, res.ok))}
                >
                  Adicionar
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {viewing && (
        <div className="public-profile panel">
          <h3>
            {viewing.nickname} <span className="tiny muted">{viewing.friendCode}</span>
          </h3>
          <p className="muted">
            Nível {viewing.level} · {viewing.stats.matchesPlayed} partidas · {viewing.stats.winsHider + viewing.stats.winsHunter} vitórias ·{' '}
            {viewing.stats.captures} capturas · {viewing.achievements} conquistas · reputação {viewing.reputation}
          </p>
          <button type="button" className="button-secondary button-small" onClick={() => setViewing(null)}>
            Fechar perfil
          </button>
        </div>
      )}
      <p className="tiny muted">Nível calculado por XP: {profile ? levelFromXp(profile.xp) : '—'}.</p>
    </Modal>
  );
}
