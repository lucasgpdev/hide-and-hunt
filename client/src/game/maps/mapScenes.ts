import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Cenários 3D prontos (glTF) usados por alguns mapas. São carregados uma vez
 * na tela de carregamento e clonados a cada partida (geometria e texturas
 * compartilhadas).
 */
const cache = new Map<string, THREE.Object3D>();
const pending = new Map<string, Promise<THREE.Object3D | null>>();
let loaderPromise: Promise<GLTFLoader> | null = null;

/** GLTFLoader com o decodificador meshopt (geometria comprimida). */
export function sharedGltfLoader(): Promise<GLTFLoader> {
  loaderPromise ??= (async () => {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  })();
  return loaderPromise;
}

export function cachedMapScene(url: string): THREE.Object3D | undefined {
  return cache.get(url);
}

export function loadMapScene(url: string): Promise<THREE.Object3D | null> {
  const ready = cache.get(url);
  if (ready) return Promise.resolve(ready);
  let promise = pending.get(url);
  if (!promise) {
    promise = (async () => {
      try {
        const loader = await sharedGltfLoader();
        const gltf = await loader.loadAsync(url);
        prepare(gltf.scene);
        cache.set(url, gltf.scene);
        return gltf.scene;
      } catch (error) {
        console.warn(`Cenário ${url} indisponível.`, error);
        return null;
      } finally {
        pending.delete(url);
      }
    })();
    pending.set(url, promise);
  }
  return promise;
}

/**
 * Converte atributos comprimidos (inteiros normalizados do meshopt) para float,
 * para que a geometria possa ser mesclada e transformada como as demais.
 */
export function dequantize(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const source = attribute as THREE.BufferAttribute;
      if (source.array instanceof Float32Array && !(source as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
      const out = new Float32Array(source.count * source.itemSize);
      for (let i = 0; i < source.count; i++) {
        for (let c = 0; c < source.itemSize; c++) out[i * source.itemSize + c] = source.getComponent(i, c);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(out, source.itemSize));
    }
  });
}

/** Ajustes para tempo real: sombras, vidro barato e luminárias marcadas. */
function prepare(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials as THREE.MeshPhysicalMaterial[]) {
      // Transmissão exige uma passada extra de renderização: vidro vira transparência simples.
      if (material.transmission > 0) {
        material.transmission = 0;
        material.transparent = true;
        material.opacity = 0.22;
        material.depthWrite = false;
        material.roughness = Math.min(material.roughness, 0.15);
        mesh.castShadow = false;
      }
      if (material.emissive && material.emissive.getHex() !== 0 && (material.emissiveIntensity ?? 1) > 0) {
        mesh.userData.lamp = true;
        // O arquivo vem calibrado para render offline: brilho bem mais forte que o necessário aqui.
        material.emissiveIntensity = Math.min(material.emissiveIntensity ?? 1, 1.1);
        material.userData.baseEmissive = material.emissiveIntensity;
      }
    }
  });
}
