import * as THREE from 'three';

/**
 * Lanterna: facho visível (cone aditivo que some com a distância e nas
 * bordas) e um conjunto fixo de luzes para os outros jogadores. O número de
 * luzes na cena nunca muda — mudar faria todos os materiais recompilarem e o
 * jogo dar um soluço.
 */
export const BEAM_LENGTH = 7;
export const BEAM_HEIGHT = 1.32;
/** Inclinação do facho para baixo (rad). */
export const BEAM_TILT = 0.12;

const beamGeometry = (() => {
  const geometry = new THREE.CylinderGeometry(1.05, 0.035, BEAM_LENGTH, 28, 8, true);
  // O cilindro do three fica em pé; deita no eixo +z com a ponta estreita na origem.
  geometry.translate(0, BEAM_LENGTH / 2, 0);
  geometry.rotateX(Math.PI / 2);
  return geometry;
})();

const beamMaterial = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color('#fff2d2') }, strength: { value: 0.16 } },
  vertexShader: /* glsl */ `
    varying float vAlong;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    void main() {
      vAlong = clamp(position.z / ${BEAM_LENGTH.toFixed(1)}, 0.0, 1.0);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalV = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float strength;
    varying float vAlong;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    void main() {
      float edge = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.6);
      float fade = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.06, vAlong);
      gl_FragColor = vec4(color * strength * edge * fade, 1.0);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

/** Facho preso ao corpo do jogador (na altura do peito, apontando para frente). */
export function createBeam(): THREE.Mesh {
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.set(0.18, BEAM_HEIGHT, 0.25);
  beam.rotation.x = BEAM_TILT;
  beam.renderOrder = 5;
  beam.frustumCulled = false;
  beam.castShadow = false;
  beam.receiveShadow = false;
  beam.raycast = () => {};
  beam.visible = false;
  return beam;
}

/** Luzes reais para as lanternas dos outros: as mais próximas da câmera ganham uma. */
export class RemoteFlashlights {
  private readonly lights: THREE.SpotLight[] = [];
  private readonly forward = new THREE.Vector3();

  constructor(scene: THREE.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.SpotLight('#fff1cf', 0, 18, Math.PI / 6.5, 0.6, 1.4);
      scene.add(light, light.target);
      this.lights.push(light);
    }
  }

  /** `sources`: raiz de cada avatar com lanterna ligada. */
  update(sources: THREE.Object3D[], camera: THREE.Vector3, strength: number): void {
    const sorted = sources
      .map((root) => ({ root, d: root.position.distanceToSquared(camera) }))
      .sort((a, b) => a.d - b.d);
    this.lights.forEach((light, i) => {
      const source = sorted[i]?.root;
      if (!source) {
        light.intensity = 0;
        return;
      }
      const yaw = source.rotation.y;
      this.forward.set(Math.sin(yaw), -Math.sin(BEAM_TILT), Math.cos(yaw));
      light.position.set(source.position.x + this.forward.x * 0.3, source.position.y + BEAM_HEIGHT, source.position.z + this.forward.z * 0.3);
      light.target.position.copy(light.position).addScaledVector(this.forward, 5);
      light.target.updateMatrixWorld();
      light.intensity = strength;
    });
  }

  dispose(): void {
    for (const light of this.lights) {
      light.removeFromParent();
      light.target.removeFromParent();
      light.dispose();
    }
  }
}
