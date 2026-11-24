import type RAPIER_NS from '@dimforge/rapier3d-compat';

let loading: Promise<typeof RAPIER_NS> | null = null;

/**
 * Carrega e inicializa o Rapier (WebAssembly) uma única vez.
 *
 * Importante: inicializar duas vezes ao mesmo tempo cria duas instâncias do
 * WebAssembly e corrompe a física ("unreachable"). Todo o cliente deve usar
 * esta função em vez de chamar RAPIER.init() diretamente.
 */
export function loadRapier(): Promise<typeof RAPIER_NS> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (module) => {
    const RAPIER = module.default;
    await RAPIER.init();
    return RAPIER;
  });
  return loading;
}
