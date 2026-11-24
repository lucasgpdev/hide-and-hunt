import { useEffect, useState } from 'react';
import type { HealthResponse } from '@hh/shared';
import { apiUrl } from '../multiplayer/serverUrl';

export type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

/** Consulta /api/health periodicamente (estado do servidor e do banco). */
export function useServerHealth(intervalMs = 10_000): HealthState {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const check = async () => {
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 4000);
      try {
        const response = await fetch(apiUrl('/api/health'), { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as HealthResponse;
        if (!cancelled) setState({ kind: 'ok', data });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'Servidor inacessível' });
      } finally {
        clearTimeout(timeout);
      }
    };

    void check();
    const timer = setInterval(() => void check(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
      controller?.abort();
    };
  }, [intervalMs]);

  return state;
}
