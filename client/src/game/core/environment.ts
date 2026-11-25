import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

/**
 * Iluminação baseada em imagem (IBL) com HDRIs CC0 da Poly Haven,
 * distribuídos pelo pacote @pmndrs/assets. Dá reflexos e luz ambiente
 * realistas aos materiais PBR.
 */
export type EnvironmentName = 'lobby' | 'lab' | 'hall' | 'apartment' | 'studio' | 'night';

const loaders: Record<EnvironmentName, () => Promise<{ default: string }>> = {
  lobby: () => import('@pmndrs/assets/hdri/lobby.exr.js'),
  lab: () => import('@pmndrs/assets/hdri/lab.exr.js'),
  hall: () => import('@pmndrs/assets/hdri/hall.exr.js'),
  apartment: () => import('@pmndrs/assets/hdri/apartment.exr.js'),
  studio: () => import('@pmndrs/assets/hdri/studio.exr.js'),
  night: () => import('@pmndrs/assets/hdri/night.exr.js'),
};

const cache = new Map<EnvironmentName, Promise<THREE.Texture>>();

export function loadEnvironment(renderer: THREE.WebGLRenderer, name: EnvironmentName): Promise<THREE.Texture> {
  let pending = cache.get(name);
  if (!pending) {
    pending = loaders[name]().then(
      ({ default: url }) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          new EXRLoader().load(
            url,
            (texture) => {
              const pmrem = new THREE.PMREMGenerator(renderer);
              const env = pmrem.fromEquirectangular(texture).texture;
              texture.dispose();
              pmrem.dispose();
              resolve(env);
            },
            undefined,
            reject,
          );
        }),
    );
    cache.set(name, pending);
  }
  return pending;
}

/** HDRI e intensidade de reflexos de cada mapa. */
export const MAP_ENVIRONMENT: Record<string, [EnvironmentName, number]> = {
  lobby: ['apartment', 0.55],
  supermarket: ['hall', 0.6],
  senai_classroom: ['lab', 0.38],
  school: ['lab', 0.45],
  office: ['lobby', 0.5],
  mansion: ['apartment', 0.45],
  shopping_mall: ['hall', 0.42],
  hospital: ['lab', 0.3],
  restaurant: ['apartment', 0.45],
  warehouse: ['hall', 0.4],
  hotel: ['lobby', 0.5],
  city: ['night', 0.9],
  classic_classroom: ['apartment', 0.38],
};
