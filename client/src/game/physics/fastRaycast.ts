import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

/**
 * Raios de mira mais rápidos com three-mesh-bvh (licença MIT): malhas estáticas
 * ganham uma árvore de volumes (BVH) e o teste de raio deixa de percorrer
 * triângulo por triângulo.
 */
let installed = false;
export function installFastRaycast(): void {
  if (installed) return;
  installed = true;
  const geometry = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>;
  geometry.computeBoundsTree = computeBoundsTree;
  geometry.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

/** Gera a BVH das malhas estáticas (não animadas) de um objeto, uma vez por geometria. */
export function buildBoundsTrees(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh & { isSkinnedMesh?: boolean };
    if (!mesh.isMesh || mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void };
    if (geometry.boundsTree || !geometry.computeBoundsTree || !geometry.index) return;
    if ((geometry.index.count ?? 0) < 600) return; // malhas pequenas: não compensa
    geometry.computeBoundsTree();
  });
}
