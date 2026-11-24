import { useEffect, useState } from 'react';
import { loadRapier } from '../game/physics/rapier';

export type PhysicsCheck = { kind: 'loading' } | { kind: 'ok'; version: string } | { kind: 'error' };

/**
 * Carrega o Rapier (WebAssembly) sob demanda e confirma que ele inicializa
 * neste navegador. O import dinâmico mantém o carregamento inicial leve.
 */
export function usePhysicsCheck(): PhysicsCheck {
  const [state, setState] = useState<PhysicsCheck>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadRapier()
      .then((RAPIER) => {
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.step();
        world.free();
        if (!cancelled) setState({ kind: 'ok', version: RAPIER.version() });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
