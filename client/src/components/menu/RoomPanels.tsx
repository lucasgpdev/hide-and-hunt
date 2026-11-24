import { useState, type FormEvent } from 'react';
import { DEFAULT_MATCH_TIMINGS, MAX_PLAYERS_PER_ROOM, type RoomSettings } from '@hh/shared';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';
import { RoomSettingsForm } from '../RoomSettingsForm';

const DEFAULTS: RoomSettings = {
  maxPlayers: MAX_PLAYERS_PER_ROOM,
  hunters: null,
  prepSeconds: DEFAULT_MATCH_TIMINGS.preparationSeconds,
  hidingSeconds: DEFAULT_MATCH_TIMINGS.hidingSeconds,
  huntingSeconds: DEFAULT_MATCH_TIMINGS.huntingSeconds,
  intermissionSeconds: DEFAULT_MATCH_TIMINGS.intermissionSeconds,
  mapId: 'supermarket',
  mapVoting: true,
  mode: 'custom',
  randomEvents: true,
  abilities: true,
};

/** CRIAR SALA: sala privada com regras personalizadas e código de convite. */
export function CreateRoomPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    const result = await network.createRoom(settings);
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else onClose();
  };

  return (
    <Modal title="Criar sala privada" onClose={onClose}>
      <p className="muted">Você será o anfitrião. Depois de criar, compartilhe o código com seus amigos.</p>
      <RoomSettingsForm value={settings} onChange={setSettings} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="button-primary" onClick={create} disabled={busy}>
          {busy ? 'Criando...' : 'Criar sala'}
        </button>
      </div>
    </Modal>
  );
}

/** ENTRAR COM CÓDIGO */
export function JoinCodePanel({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await network.joinRoom(code.trim().toUpperCase());
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else onClose();
  };

  return (
    <Modal title="Entrar com código" onClose={onClose}>
      <form onSubmit={submit} className="code-form">
        <label className="field">
          <span>Código da sala</span>
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
