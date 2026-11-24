import { useSyncExternalStore } from 'react';

/** Informações do motor 3D que a interface (HUD) precisa mostrar. */
export interface HudState {
  /** Texto da ação disponível na mira (ex.: "F — Virar Cadeira"). */
  prompt: string | null;
  /** Nome do jogador acompanhado no modo espectador. */
  spectating: string | null;
  fps: number;
  pointerLocked: boolean;
  /** Frações 0..1 do tempo de recarga restante. */
  transformCooldown: number;
  captureCooldown: number;
  /** Mensagem curta de retorno de uma ação (some sozinha). */
  toast: { text: string; tone: 'ok' | 'warn' } | null;
  loading: boolean;
  /** Seletor de emotes aberto. */
  emoteMenu: boolean;
  /** Jogadores falando agora (chat de voz). */
  speaking: string[];
}

const initial: HudState = {
  prompt: null,
  spectating: null,
  fps: 0,
  pointerLocked: false,
  transformCooldown: 0,
  captureCooldown: 0,
  toast: null,
  loading: true,
  emoteMenu: false,
  speaking: [],
};

let state = initial;
const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const hudStore = {
  get: () => state,
  set(patch: Partial<HudState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof HudState)[]) {
      if (state[key] !== patch[key]) changed = true;
    }
    if (!changed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  toast(text: string, tone: 'ok' | 'warn' = 'ok'): void {
    hudStore.set({ toast: { text, tone } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hudStore.set({ toast: null }), 2200);
  },
  reset(): void {
    state = initial;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useHud(): HudState {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}
