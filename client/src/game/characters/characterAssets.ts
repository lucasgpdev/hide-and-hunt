import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadQuaternius } from './quaternius';

/**
 * Modelos de personagem rigados com animações de captura de movimento.
 * Fontes e licenças em docs/CREDITS.md:
 * - Soldier.glb e Xbot.glb (Mixamo, Adobe): uso livre em jogos.
 * - RobotExpressive.glb (Tomás Laulhé / Quaternius): CC0.
 */
export type CharacterModelId = 'soldier' | 'xbot' | 'robot';

export interface CharacterAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Escala para o personagem ter 1,8 m de altura. */
  scale: number;
}

const FILES: Record<CharacterModelId, string> = {
  soldier: '/models/characters/Soldier.glb',
  xbot: '/models/characters/Xbot.glb',
  robot: '/models/characters/RobotExpressive.glb',
};

const cache = new Map<CharacterModelId, CharacterAsset>();
let loading: Promise<void> | null = null;

/** Carrega todos os personagens uma vez (chamado na tela de carregamento). */
export function preloadCharacters(): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const realistic = loadQuaternius(loader);
    await Promise.all(
      (Object.keys(FILES) as CharacterModelId[]).map(async (id) => {
        try {
          const gltf = await loader.loadAsync(FILES[id]);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const height = box.max.y - box.min.y || 1.8;
          cache.set(id, { scene: gltf.scene, animations: gltf.animations, scale: 1.8 / height });
        } catch (error) {
          console.warn(`Não foi possível carregar o personagem ${id}; usando o modelo simples.`, error);
        }
      }),
    );
    await realistic;
  })();
  return loading;
}

export function getCharacterAsset(id: CharacterModelId): CharacterAsset | undefined {
  return cache.get(id);
}
