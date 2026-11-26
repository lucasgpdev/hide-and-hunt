import { getMap, LOBBY_MAP_ID, PLAYABLE_MAP_IDS } from '@hh/shared';
import { preloadPropModels, propModelsReady } from '../objects/propModels';
import { cachedMapScene, loadMapScene } from './mapScenes';

/**
 * Arquivos de cada mapa (cenários 3D e modelos dos objetos). O jogo baixa só o
 * mapa da sala e o lobby antes de começar; os outros mapas baixam em segundo
 * plano, um de cada vez, para a tela de carregamento ficar curta.
 */
function sceneUrls(mapId: string): string[] {
  const map = getMap(mapId);
  if (!map) return [];
  return [...(map.scene ? [map.scene.url] : []), ...(map.extraScenes ?? []).map((s) => s.url)];
}

function propTypes(mapId: string): string[] {
  return [...new Set((getMap(mapId)?.props ?? []).map((p) => p.type))];
}

export function mapAssetsReady(mapId: string): boolean {
  return sceneUrls(mapId).every((url) => cachedMapScene(url)) && propModelsReady(propTypes(mapId));
}

const loading = new Map<string, Promise<void>>();

export function loadMapAssets(mapId: string): Promise<void> {
  let promise = loading.get(mapId);
  if (!promise) {
    promise = Promise.all([...sceneUrls(mapId).map((url) => loadMapScene(url)), preloadPropModels(propTypes(mapId))]).then(() => undefined);
    loading.set(mapId, promise);
  }
  return promise;
}

/** Lobby + mapa da sala agora; depois os demais mapas, em sequência. */
export async function loadInitialMapAssets(mapId: string | undefined): Promise<void> {
  const first = [LOBBY_MAP_ID, ...(mapId ? [mapId] : [])];
  await Promise.all(first.map(loadMapAssets));
  void (async () => {
    for (const id of PLAYABLE_MAP_IDS) {
      if (first.includes(id)) continue;
      await loadMapAssets(id);
    }
  })();
}
