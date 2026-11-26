import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { N8AOPass } from 'n8ao';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Quality = 'low' | 'medium' | 'high';

/**
 * Pós-processamento:
 * - MSAA 4x no buffer de renderização (bordas lisas, sem serrilhado);
 * - N8AO (oclusão de ambiente: sombras de contato nos cantos e sob os móveis) —
 *   meia resolução na qualidade média, cheia na alta;
 * - bloom suave nas luzes;
 * - tone mapping ACES e conversão de cor no final.
 * Na qualidade baixa, desenha direto na tela com o antisserrilhado do navegador.
 */
export class PostFX {
  private composer: EffectComposer | null = null;
  private ao: N8AOPass | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  configure(quality: Quality, width: number, height: number): void {
    this.dispose();
    if (quality === 'low') return;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    // O N8AO desenha a cena e aplica a oclusão (substitui o RenderPass).
    try {
      const ao = new N8AOPass(this.scene, this.camera, width, height);
      ao.setQualityMode(quality === 'high' ? 'High' : 'Medium');
      Object.assign(ao.configuration, {
        aoRadius: 0.7,
        distanceFalloff: 1,
        intensity: quality === 'high' ? 2.6 : 2.2,
        halfRes: quality !== 'high',
        gammaCorrection: false,
        transparencyAware: true,
      });
      composer.addPass(ao);
      this.ao = ao;
    } catch {
      composer.addPass(new RenderPass(this.scene, this.camera));
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.25, 0.5, 0.92);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(width, height);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.composer?.dispose();
    this.ao?.dispose();
    this.bloom?.dispose();
    this.composer = null;
    this.ao = null;
    this.bloom = null;
  }
}
