import { GAME_MODES, MAP_CATALOG, MAX_PLAYERS_PER_ROOM, MODE_INFO, type GameMode, type RoomSettings } from '@hh/shared';

interface Props {
  value: RoomSettings;
  onChange: (value: RoomSettings) => void;
  disabled?: boolean;
}

interface NumberField {
  key: 'maxPlayers' | 'prepSeconds' | 'hidingSeconds' | 'huntingSeconds' | 'intermissionSeconds';
  label: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: NumberField[] = [
  { key: 'maxPlayers', label: 'Máximo de jogadores', min: 2, max: MAX_PLAYERS_PER_ROOM, step: 1 },
  { key: 'prepSeconds', label: 'Preparação (s)', min: 5, max: 60, step: 5 },
  { key: 'hidingSeconds', label: 'Tempo para esconder (s)', min: 10, max: 120, step: 5 },
  { key: 'huntingSeconds', label: 'Tempo de caça (s)', min: 60, max: 900, step: 30 },
  { key: 'intermissionSeconds', label: 'Intervalo entre partidas (s)', min: 5, max: 60, step: 5 },
];

/** Regras de uma partida personalizada (item 18). O servidor valida tudo de novo. */
export function RoomSettingsForm({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<RoomSettings>) => onChange({ ...value, ...patch });
  return (
    <div className="settings-form">
      <label className="field">
        <span>Modo de jogo</span>
        <select value={value.mode} disabled={disabled} onChange={(e) => set({ mode: e.target.value as GameMode })}>
          {GAME_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {MODE_INFO[mode].name}
            </option>
          ))}
        </select>
        <span className="tiny muted">{MODE_INFO[value.mode].description}</span>
      </label>
      <label className="field">
        <span>Mapa</span>
        <select value={value.mapId} disabled={disabled} onChange={(e) => set({ mapId: e.target.value })}>
          {MAP_CATALOG.filter((map) => map.available).map((map) => (
            <option key={map.id} value={map.id} disabled={!map.available}>
              {map.name}
              {map.available ? '' : ' (em breve)'}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={value.mapVoting}
          disabled={disabled}
          onChange={(e) => set({ mapVoting: e.target.checked })}
        />
        <span>Votação de mapa entre partidas</span>
      </label>
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={value.randomEvents}
          disabled={disabled}
          onChange={(e) => set({ randomEvents: e.target.checked })}
        />
        <span>Eventos aleatórios (apagão, alarme, chuva...)</span>
      </label>
      <label className="field field--inline">
        <input type="checkbox" checked={value.abilities} disabled={disabled} onChange={(e) => set({ abilities: e.target.checked })} />
        <span>Habilidades especiais liberadas</span>
      </label>
      <label className="field">
        <span>Bots (completam a sala; saem quando entra gente)</span>
        <select value={String(value.bots ?? 0)} disabled={disabled} onChange={(e) => set({ bots: Number(e.target.value) })}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Nenhum' : `${n} bot${n > 1 ? 's' : ''}`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Caçadores</span>
        <select
          value={value.hunters === null ? 'auto' : String(value.hunters)}
          disabled={disabled}
          onChange={(e) => set({ hunters: e.target.value === 'auto' ? null : Number(e.target.value) })}
        >
          <option value="auto">Automático (1 a cada 4)</option>
          {Array.from({ length: Math.min(16, value.maxPlayers - 1) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {FIELDS.map((field) => (
        <label key={field.key} className="field">
          <span>
            {field.label}: <strong>{value[field.key]}</strong>
          </span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value[field.key]}
            disabled={disabled}
            onChange={(e) => set({ [field.key]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
