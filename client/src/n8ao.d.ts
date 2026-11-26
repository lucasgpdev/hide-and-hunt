declare module 'n8ao' {
  import type * as THREE from 'three';
  import type { Pass } from 'three/addons/postprocessing/Pass.js';

  /** Oclusão de ambiente N8AO (github.com/N8python/n8ao, licença ISC). */
  export class N8AOPass extends Pass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: THREE.Color;
      halfRes: boolean;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      transparencyAware: boolean;
      [key: string]: unknown;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}
