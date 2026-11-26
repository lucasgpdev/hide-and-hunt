import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { N8AOPass } from 'n8ao';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Correção de cor final: um pouco mais de contraste e cor, tom levemente quente e vinheta suave. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, contrast: { value: 1.06 }, saturation: { value: 1.1 }, warmth: { value: 0.025 }, vignette: { value: 0.28 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float warmth; uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(warmth, warmth * 0.35, -warmth * 0.6);
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

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
    composer.addPass(new ShaderPass(GradeShader));
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
