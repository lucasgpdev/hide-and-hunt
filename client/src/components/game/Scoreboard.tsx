import { useState } from 'react';
import type { RoomInfo } from '@hh/shared';
import { network } from '../../multiplayer/NetworkClient';
import { settingsStore, useSettings } from '../../settings/settings';

type Reason = 'cheating' | 'abuse' | 'afk' | 'other';
const REASONS: { id: Reason; label: string }[] = [
  { id: 'cheating', label: 'Trapaça' },
  { id: 'abuse', label: 'Ofensa / assédio' },
  { id: 'afk', label: 'Ausente (AFK)' },
  { id: 'other', label: 'Outro' },
];

interface Props {
  room: RoomInfo;
  localId: string;
  /** Com o menu aberto: botões de silenciar voz e denunciar. */
  interactive?: boolean;
  onClose?: () => void;
}

/** Placar (segure Tab). Não revela em que objeto cada escondido está. */
export function Scoreboard({ room, localId, interactive, onClose }: Props) {
  const settings = useSettings();
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason>('cheating');
  const [message, setMessage] = useState<string | null>(null);
  const groups = [
    { title: 'Caçadores', players: room.players.filter((p) => p.team === 'HUNTERS') },
    { title: 'Escondidos', players: room.players.filter((p) => p.team === 'HIDERS') },
    { title: 'Aguardando', players: room.players.filter((p) => p.team === null) },
  ].filter((g) => g.players.length > 0);

  const toggleMute = (id: string) => {
    const muted = settings.mutedPlayers.includes(id);
    settingsStore.set({ mutedPlayers: muted ? settings.mutedPlayers.filter((m) => m !== id) : [...settings.mutedPlayers, id] });
  };

  const sendReport = async (id: string) => {
    const result = await network.report(id, reason);
    setReporting(null);
    setMessage(result.ok ? 'Denúncia enviada. Obrigado por ajudar a manter o jogo justo.' : result.error.message);
  };

  return (
    <div className={`scoreboard panel ${interactive ? 'scoreboard--interactive' : ''}`} role="dialog" aria-label="Placar">
      {interactive && (
        <div className="scoreboard-head">
          <strong>Jogadores na sala</strong>
          <button type="button" className="button-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.title}>
          <p className="section-title">{group.title}</p>
          <table className="data-table">
            <tbody>
              {group.players.map((p) => (
                <tr key={p.id} className={p.id === localId ? 'row-me' : ''}>
                  <td>
                    <span className={`dot dot--${p.team === 'HUNTERS' ? 'hunter' : p.team === 'HIDERS' ? 'hider' : 'idle'}`} /> {p.nickname}
                  </td>
                  <td>Nv {p.level}</td>
                  <td>{p.team === 'HUNTERS' ? `${p.captures} capturas` : p.team === 'HIDERS' ? (p.alive ? 'Escondido' : 'Capturado') : ''}</td>
                  <td>{p.connected ? '' : 'reconectando'}</td>
                  {interactive && (
                    <td className="scoreboard-actions">
                      {p.id !== localId && (
                        <>
                          <button type="button" className="link-button" onClick={() => toggleMute(p.id)}>
                            {settings.mutedPlayers.includes(p.id) ? 'Ativar voz' : 'Silenciar'}
                          </button>
                          {reporting === p.id ? (
                            <span className="report-inline">
                              <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} aria-label="Motivo">
                                {REASONS.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <button type="button" className="link-button" onClick={() => void sendReport(p.id)}>
                                Enviar
                              </button>
                              <button type="button" className="link-button" onClick={() => setReporting(null)}>
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="link-button" onClick={() => setReporting(p.id)}>
                              Denunciar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {message && <p className="muted tiny">{message}</p>}
    </div>
  );
}
