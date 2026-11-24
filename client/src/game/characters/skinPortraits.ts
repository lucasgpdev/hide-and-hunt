import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AnimatedCharacter } from './AnimatedCharacter';
import { preloadCharacters } from './characterAssets';

/**
 * Retratos dos visuais da loja: cada skin é montada e fotografada uma vez
 * num renderizador fora da tela; o resultado vira uma imagem (data URL).
 */
const cache = new Map<string, string>();
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Avisa a cada retrato pronto (a loja vai mostrando aos poucos). */
export function onPortrait(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function cachedPortrait(skinId: string): string | undefined {
  return cache.get(skinId);
}

export function renderPortraits(skinIds: string[]): Promise<void> {
  pending ??= (async () => {
    await preloadCharacters();
    const width = 180;
    const height = 220;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return; // sem WebGL: a loja continua com as amostras de cor
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    const key = new THREE.DirectionalLight('#ffe9cf', 2.4);
    key.position.set(1.5, 3, 3);
    const rim = new THREE.DirectionalLight('#7f9cff', 1.6);
    rim.position.set(-2, 2.5, -2.5);
    scene.add(key, rim);
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    camera.position.set(0.65, 1.5, 4.2);
    camera.lookAt(0, 1.12, 0);

    for (const id of skinIds) {
      const character = AnimatedCharacter.create('xbot', id, 'HIDERS', id.length);
      if (!character) continue;
      character.root.rotation.y = 0.35;
      scene.add(character.root);
      for (let i = 0; i < 12; i++) character.update(1 / 30, 0, true);
      renderer.render(scene, camera);
      cache.set(id, renderer.domElement.toDataURL('image/png'));
      for (const listener of listeners) listener();
      scene.remove(character.root);
      character.dispose();
      // Não trava a interface enquanto monta os retratos.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  })();
  return pending;
}
