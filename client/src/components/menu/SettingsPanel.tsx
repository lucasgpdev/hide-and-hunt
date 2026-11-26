import { useEffect, useMemo, useState } from 'react';
import { isWebGL2Available } from '../../game/core/PreviewScene';
import { useHud } from '../../game/core/hudStore';
import { useNetwork } from '../../hooks/useNetwork';
import { usePhysicsCheck } from '../../hooks/usePhysicsCheck';
import { useServerHealth } from '../../hooks/useServerHealth';
import {
  DEFAULT_KEYS,
  KEY_ACTION_LABEL,
  KEY_ACTIONS,
  keyLabel,
  settingsStore,
  useSettings,
  type GameSettings,
  type KeyAction,
} from '../../settings/settings';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { Modal } from '../Modal';

type Tab = 'controls' | 'audio' | 'graphics' | 'accessibility' | 'diagnostics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'controls', label: 'Controles' },
  { id: 'audio', label: 'Áudio' },
  { id: 'graphics', label: 'Gráficos' },
  { id: 'accessibility', label: 'Acessibilidade' },
  { id: 'diagnostics', label: 'Diagnóstico' },
];

const FIXED_KEYS: [string, string][] = [
  ['Mouse', 'Câmera'],
  ['Clique esquerdo', 'Capturar (caçador) · trocar jogador observado (espectador)'],
  ['Clique direito', 'Mira mais próxima (caçador)'],
  ['ESC', 'Menu'],
];
/** CONFIGURAÇÕES (item 39). Salvas neste navegador. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('controls');
  const set = (patch: Partial<GameSettings>) => settingsStore.set(patch);

  return (
    <Modal title="Configurações" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={`tab ${t.id === tab ? 'tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'controls' && (
        <div className="settings-form">
          <Slider label="Sensibilidade do mouse" value={settings.mouseSensitivity} min={0.2} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => set({ mouseSensitivity: v })} />
          <Toggle label="Inverter eixo vertical" checked={settings.invertY} onChange={(v) => set({ invertY: v })} />
          <KeyBindings keys={settings.keys} />
        </div>
      )}

      {tab === 'audio' && (
        <div className="settings-form">
          <Slider label="Volume geral" value={settings.masterVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ masterVolume: v })} />
          <Slider label="Efeitos sonoros" value={settings.effectsVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ effectsVolume: v })} />
          <Slider label="Música ambiente" value={settings.musicVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ musicVolume: v })} />
          <h4 className="section-title">Chat de voz por proximidade</h4>
          <Toggle
            label="Ativar microfone nas partidas (o navegador vai pedir permissão)"
            checked={settings.voiceEnabled}
            onChange={(v) => set({ voiceEnabled: v })}
          />
          <Slider label="Volume das vozes" value={settings.voiceVolume} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ voiceVolume: v })} />
          <p className="muted tiny">
            Você só ouve quem está perto (até 22 m), e a voz fica mais baixa com a distância — inclusive jogadores da outra equipe, então cuidado ao
            falar escondido. Quem foi capturado só fala com outros espectadores. Nada é gravado. Para silenciar alguém, abra o menu (Esc) → Jogadores.
          </p>
          {settings.mutedPlayers.length > 0 && (
            <button type="button" className="button-secondary" onClick={() => set({ mutedPlayers: [] })}>
              Remover silêncio de {settings.mutedPlayers.length} jogador(es)
            </button>
          )}
        </div>
      )}

      {tab === 'graphics' && (
        <div className="settings-form">
          <label className="field">
            <span>Câmera</span>
            <select value={settings.cameraMode} onChange={(e) => set({ cameraMode: e.target.value as GameSettings['cameraMode'] })}>
              <option value="first">1ª pessoa (olhos do personagem)</option>
              <option value="third">3ª pessoa (atrás do personagem)</option>
            </select>
          </label>
          <label className="field">
            <span>Qualidade gráfica</span>
            <select value={settings.graphics} onChange={(e) => set({ graphics: e.target.value as GameSettings['graphics'] })}>
              <option value="low">Baixa (mais FPS)</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label className="field">
            <span>Limite de FPS</span>
            <select value={settings.fpsLimit} onChange={(e) => set({ fpsLimit: Number(e.target.value) })}>
              <option value={0}>Sem limite (taxa máxima do monitor)</option>
              <option value={144}>144</option>
              <option value={120}>120</option>
              <option value={60}>60</option>
              <option value={30}>30 (economia de bateria)</option>
            </select>
          </label>
          <Toggle label="Balanço da câmera ao andar (1ª pessoa)" checked={settings.headBob} onChange={(v) => set({ headBob: v })} />
          <Toggle label="Sombras" checked={settings.shadows} onChange={(v) => set({ shadows: v })} />
          <Toggle label="Ajuste automático (baixa a resolução se o FPS cair)" checked={settings.autoQuality} onChange={(v) => set({ autoQuality: v })} />
          <Slider label="Distância de renderização" value={settings.renderDistance} min={25} max={120} step={5} format={(v) => `${v} m`} onChange={(v) => set({ renderDistance: v })} />
          <Slider label="Campo de visão" value={settings.fov} min={55} max={100} step={1} format={(v) => `${v}°`} onChange={(v) => set({ fov: v })} />
          <Toggle label="Mostrar FPS e latência" checked={settings.showFps} onChange={(v) => set({ showFps: v })} />
        </div>
      )}

      {tab === 'accessibility' && (
        <div className="settings-form">
          <Toggle label="Alto contraste na interface" checked={settings.highContrast} onChange={(v) => set({ highContrast: v })} />
          <Toggle
            label="Avisos visuais para sons (capturas, início da caça, fim do tempo)"
            checked={settings.visualSoundCues}
            onChange={(v) => set({ visualSoundCues: v })}
          />
          <Toggle label="Modo para daltonismo (equipes em azul × amarelo, com rótulos)" checked={settings.colorblind} onChange={(v) => set({ colorblind: v })} />
          <Toggle label="Reduzir animações e efeitos de tela" checked={settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
          <Slider label="Tamanho do texto da interface" value={settings.uiScale} min={0.85} max={1.4} step={0.05} format={pct} onChange={(v) => set({ uiScale: v })} />
          <p className="muted tiny">Idioma: Português (Brasil). As teclas podem ser trocadas na aba Controles.</p>
        </div>
      )}

      {tab === 'diagnostics' && <Diagnostics />}

      <div className="modal-actions">
        <button type="button" className="button-secondary" onClick={() => settingsStore.reset()}>
          Restaurar padrão
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Concluir
        </button>
      </div>
    </Modal>
  );
}

function Diagnostics() {
  const net = useNetwork();
  const health = useServerHealth();
  const physics = usePhysicsCheck();
  const webgl = useMemo(isWebGL2Available, []);
  const { fps } = useHud();
  return <DiagnosticsPanel net={net} health={health} physics={physics} webgl={webgl} fps={fps || null} />;
}

/** Remapeamento de teclas: clique na ação e pressione a nova tecla. */
function KeyBindings({ keys }: { keys: Record<KeyAction, string> }) {
  const [listening, setListening] = useState<KeyAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setListening(null);
        return;
      }
      const next = { ...settingsStore.get().keys };
      // Se a tecla já estava em outra ação, as duas trocam de lugar.
      const clash = KEY_ACTIONS.find((a) => a !== listening && next[a] === event.code);
      if (clash) next[clash] = next[listening];
      next[listening] = event.code;
      settingsStore.set({ keys: next });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  return (
    <>
      <table className="data-table keys-table">
        <tbody>
          {KEY_ACTIONS.map((action) => (
            <tr key={action}>
              <td>{KEY_ACTION_LABEL[action]}</td>
              <td>
                <button
                  type="button"
                  className={`key-button ${listening === action ? 'key-button--listening' : ''}`}
                  onClick={() => setListening(listening === action ? null : action)}
                  aria-label={`Trocar tecla de ${KEY_ACTION_LABEL[action]}`}
                >
                  {listening === action ? 'Pressione uma tecla...' : keyLabel(keys[action])}
                </button>
                {keys[action] !== DEFAULT_KEYS[action] && listening !== action && <span className="tiny muted"> (padrão {keyLabel(DEFAULT_KEYS[action])})</span>}
              </td>
            </tr>
          ))}
          {FIXED_KEYS.map(([key, action]) => (
            <tr key={key}>
              <td>{action}</td>
              <td>
                <kbd>{key}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="button-secondary" onClick={() => settingsStore.set({ keys: DEFAULT_KEYS })}>
        Restaurar teclas padrão
      </button>
    </>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Slider(props: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {props.label}: <strong>{props.format(props.value)}</strong>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field field--inline">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}
