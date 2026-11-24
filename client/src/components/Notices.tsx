import { playSound } from '../audio/sound';
import { useNetwork } from '../hooks/useNetwork';
import { network } from '../multiplayer/NetworkClient';

/** Avisos globais: conquistas, missões concluídas e convites de amigos. */
export function Notices() {
  const net = useNetwork();

  const accept = async (id: number, code: string) => {
    network.dismissInvite(id);
    if (net.room) await network.leaveRoom();
    const result = await network.joinRoom(code);
    if (!result.ok) playSound('error');
  };

  if (net.notices.length === 0 && net.invites.length === 0) return null;
  return (
    <div className="notices" aria-live="polite">
      {net.notices.map((n) => (
        <div key={n.id} className="notice-card">
          <span className="notice-icon">★</span>
          {n.text}
        </div>
      ))}
      {net.invites.map((invite) => (
        <div key={invite.id} className="notice-card notice-card--invite">
          <span>
            <strong>{invite.fromNickname}</strong> convidou você para a sala <code>{invite.code}</code>
          </span>
          <div className="notice-actions">
            <button type="button" className="button-primary button-small" onClick={() => void accept(invite.id, invite.code)}>
              Entrar
            </button>
            <button type="button" className="button-secondary button-small" onClick={() => network.dismissInvite(invite.id)}>
              Agora não
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
