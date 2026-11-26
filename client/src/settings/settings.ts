import { useSyncExternalStore } from 'react';

/** Ações que podem ter a tecla trocada (remapeamento de controles). */
export const KEY_ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'run',
  'interact',
  'transform',
  'shove',
  'ping',
  'emote',
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'scoreboard',
  'camera',
  'flashlight',
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export const KEY_ACTION_LABEL: Record<KeyAction, string> = {
  forward: 'Andar para frente',
  back: 'Andar para trás',
  left: 'Andar para a esquerda',
  right: 'Andar para a direita',
  jump: 'Pular',
  run: 'Correr',
  interact: 'Interagir / capturar',
  transform: 'Transformar',
  shove: 'Empurrar objeto',
  ping: 'Marcar local para a equipe',
  emote: 'Emotes',
  ability1: 'Habilidade 1',
  ability2: 'Habilidade 2',
  ability3: 'Habilidade 3',
  ability4: 'Habilidade 4',
  scoreboard: 'Placar',
  camera: 'Trocar câmera (1ª / 3ª pessoa)',
  flashlight: 'Ligar/desligar lanterna',
};

export const DEFAULT_KEYS: Record<KeyAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  run: 'ShiftLeft',
  interact: 'KeyE',
  transform: 'KeyF',
  shove: 'KeyR',
  ping: 'KeyZ',
  emote: 'KeyB',
  ability1: 'Digit1',
  ability2: 'Digit2',
  ability3: 'Digit3',
  ability4: 'Digit4',
  scoreboard: 'Tab',
  camera: 'KeyV',
  flashlight: 'KeyL',
};

/** Configurações do jogador (item 39). Salvas neste navegador. */
export interface GameSettings {
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  masterVolume: number;
  effectsVolume: number;
  musicVolume: number;
  graphics: 'low' | 'medium' | 'high';
  shadows: boolean;
  /** Câmera em primeira pessoa (olhos do personagem) ou terceira (atrás dele). */
  cameraMode: 'first' | 'third';
  /** Baixa a resolução sozinho quando o FPS cai (e volta quando melhora). */
  autoQuality: boolean;
  /** Distância de renderização (névoa e corte da câmera), em metros. */
  renderDistance: number;
  showFps: boolean;
  /** Limite de quadros por segundo; 0 = sem limite (o navegador vai até a taxa do monitor). */
  fpsLimit: number;
  highContrast: boolean;
  /** Mostra avisos em texto para os sons importantes. */
  visualSoundCues: boolean;
  keys: Record<KeyAction, string>;
  /** Chat de voz por proximidade (exige permissão do microfone). */
  voiceEnabled: boolean;
  voiceVolume: number;
  mutedPlayers: string[];
  /** Escala do texto e da interface (acessibilidade). */
  uiScale: number;
  /** Cores de equipe pensadas para daltonismo (azul × amarelo) e rótulos extras. */
  colorblind: boolean;
  /** Reduz animações da interface e efeitos de tela. */
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  invertY: false,
  fov: 70,
  masterVolume: 0.8,
  effectsVolume: 0.8,
  musicVolume: 0.35,
  graphics: 'medium',
  shadows: true,
  cameraMode: 'first',
  autoQuality: true,
  renderDistance: 60,
  showFps: true,
  fpsLimit: 0,
  highContrast: false,
  visualSoundCues: true,
  keys: DEFAULT_KEYS,
  voiceEnabled: false,
  voiceVolume: 0.9,
  mutedPlayers: [],
  uiScale: 1,
  colorblind: false,
  reducedMotion: false,
};

const KEY = 'hh.settings';

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    // O chat de voz sempre começa desligado: o jogador liga de novo (e o navegador pede o microfone).
    return { ...DEFAULT_SETTINGS, ...parsed, keys: { ...DEFAULT_KEYS, ...(parsed.keys ?? {}) }, voiceEnabled: false };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export const settingsStore = {
  get: (): GameSettings => current,
  set(patch: Partial<GameSettings>): void {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
    for (const listener of listeners) listener();
  },
  reset(): void {
    settingsStore.set(DEFAULT_SETTINGS);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Nome legível de uma tecla (ex.: "KeyW" → "W"). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    Space: 'Espaço',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift dir.',
    ControlLeft: 'Ctrl',
    AltLeft: 'Alt',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return names[code] ?? code;
}

export function useSettings(): GameSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}
