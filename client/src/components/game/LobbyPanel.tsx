import { useState } from 'react';
import { MAP_CATALOG, MODE_INFO, type RoomInfo, type RoomSettings } from '@hh/shared';
import { useNetwork } from '../../hooks/useNetwork';
import { playSound } from '../../audio/sound';
import { network } from '../../multiplayer/NetworkClient';
import { MapPreview } from '../MapPreview';
import { RoomSettingsForm } from '../RoomSettingsForm';

interface Props {
  room: RoomInfo;
  localId: string;
}

/** Painel da sala: código de convite, jogadores, votação de mapa e regras do anfitrião. */
export function LobbyPanel({ room, localId }: Props) {
  const isHost = room.hostId === localId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoomSettings>(room.settings);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const { social } = useNetwork();
  const invitable = (social?.friends ?? []).filter((f) => f.online && f.roomCode !== room.code);
  const canEdit = isHost && (room.state === 'WAITING' || room.state === 'FINISHED');
  const totalVotes = Object.values(room.votes).reduce((a, b) => a + b, 0);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage('Não foi possível copiar. Anote o código: ' + room.code);
    }
  };

  const saveSettings = async () => {
    const result = await network.updateSettings(draft);
    setMessage(result.ok ? 'Regras atualizadas.' : result.error.message);
    if (result.ok) setEditing(false);
  };

  const start = async () => {
    const result = await network.startMatch();
    if (!result.ok) {
      playSound('error');
      setMessage(result.error.message);
    }
  };

  const vote = async (mapId: string) => {
    playSound('click');
    const result = await network.vote(mapId);
    if (!result.ok) setMessage(result.error.message);
  };

  const invite = async (accountId: string) => {
    const result = await network.invite(accountId);
    if (result.ok) setInvited((prev) => new Set(prev).add(accountId));
    else setMessage(result.error.message);
  };

  const connected = room.players.filter((p) => p.connected).length;
  const missing = Math.max(0, room.minPlayers - connected);

  return (
    <aside className="lobby-panel panel" aria-label="Sala">
      <div className="lobby-head">
        <div>
          <p className="tiny muted">{room.isPrivate ? 'Sala privada' : 'Partida pública'}</p>
          <button type="button" className="room-code" onClick={copyCode} title="Copiar código">
            {room.code} <span className="tiny">{copied ? 'copiado!' : 'copiar'}</span>
          </button>
        </div>
        <span className="tiny muted">
          {room.players.length}/{room.settings.maxPlayers}
        </span>
      </div>

      <p className="lobby-mode">
        <strong>{MODE_INFO[room.settings.mode].name}</strong>
        <span className="tiny muted"> · {MODE_INFO[room.settings.mode].description}</span>
      </p>

      {room.state === 'WAITING' && !room.isPrivate && missing > 0 && (
        <p className="muted tiny">
          Aguardando {missing} jogador{missing > 1 ? 'es' : ''} para começar.
        </p>
      )}

      <ul className="lobby-players">
        {room.players.map((p) => (
          <li key={p.id} className={p.connected ? '' : 'is-offline'}>
            <span className={`dot dot--${p.team === 'HUNTERS' ? 'hunter' : p.team === 'HIDERS' ? 'hider' : 'none'}`} />
            <span className="lobby-name">
              {p.nickname}
              {p.id === localId && ' (você)'}
            </span>
            {p.isHost && <span className="badge">Anfitrião</span>}
            {!p.connected && <span className="tiny muted">reconectando</span>}
            <span className="tiny muted">Nv {p.level}</span>
          </li>
        ))}
      </ul>

      <div className="lobby-invite">
        <button
          type="button"
          className="button-secondary button-small"
          onClick={() => {
            setInviting(!inviting);
            if (!inviting) void network.refreshSocial();
          }}
        >
          Convidar amigos {invitable.length > 0 && `(${invitable.length} online)`}
        </button>
        {inviting && (
          <ul className="lobby-players">
            {invitable.length === 0 && <li className="tiny muted">Nenhum amigo online fora da sala. Adicione amigos pelo menu AMIGOS.</li>}
            {invitable.map((f) => (
              <li key={f.accountId}>
                <span className="dot dot--online" />
                <span className="lobby-name">{f.nickname}</span>
                <button type="button" className="link-button" disabled={invited.has(f.accountId)} onClick={() => void invite(f.accountId)}>
                  {invited.has(f.accountId) ? 'Convidado' : 'Convidar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {room.settings.mapVoting && room.voteOptions.length > 0 && (room.state === 'WAITING' || room.state === 'FINISHED') && (
        <div className="vote">
          <p className="section-title">Votação do próximo mapa</p>
          <div className="vote-options">
            {room.voteOptions.map((mapId) => {
              const votes = room.votes[mapId] ?? 0;
              return (
                <button key={mapId} type="button" className="vote-card" onClick={() => vote(mapId)}>
                  <MapPreview mapId={mapId} />
                  <span className="vote-name">{MAP_CATALOG.find((m) => m.id === mapId)?.name ?? mapId}</span>
                  <span className="vote-count">
                    {votes} voto{votes === 1 ? '' : 's'}
                    {totalVotes > 0 && ` · ${Math.round((votes / totalVotes) * 100)}%`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isHost && room.isPrivate && (
        <div className="host-tools">
          {editing ? (
            <>
              <RoomSettingsForm value={draft} onChange={setDraft} disabled={!canEdit} />
              <div className="modal-actions">
                <button type="button" className="button-secondary button-small" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button type="button" className="button-primary button-small" onClick={saveSettings} disabled={!canEdit}>
                  Salvar regras
                </button>
              </div>
            </>
          ) : (
            <div className="modal-actions">
              <button
                type="button"
                className="button-secondary button-small"
                disabled={!canEdit}
                onClick={() => {
                  setDraft(room.settings);
                  setEditing(true);
                }}
              >
                Regras
              </button>
              {room.state === 'WAITING' && (
                <button type="button" className="button-primary button-small" onClick={start} disabled={connected < 2}>
                  Iniciar partida
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {message && <p className="tiny muted">{message}</p>}
    </aside>
  );
}
