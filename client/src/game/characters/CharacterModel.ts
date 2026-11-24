import * as THREE from 'three';
import type { Team } from '@hh/shared';
import { getSkin } from '@hh/shared';
import { boxGeometry, cylinderGeometry, material, sphereGeometry } from '../objects/primitives';

const SKIN_TONE = '#e0b48e';

/**
 * Personagem humano montado com primitivas, com animação procedural de
 * caminhada, corrida, salto e espera (sem arquivos de animação).
 * Altura total ≈ 1,8 m; a base fica em y = 0 e a frente aponta para +z.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly torso: THREE.Mesh;
  private readonly accessories = new THREE.Group();
  private phase = 0;
  private blend = 0;

  constructor(skinId: string, team: Team | null) {
    const skin = getSkin(skinId);
    const cloth = material(skin.color, { roughness: 0.8 });
    const accent = material(skin.accent, { roughness: 0.7 });
    const pants = material('#2c3038', { roughness: 0.85 });
    const skinMat = material(SKIN_TONE, { roughness: 0.6 });

    this.torso = mesh(boxGeometry(0.46, 0.58, 0.26), cloth, 0, 1.17, 0);
    const belt = mesh(boxGeometry(0.47, 0.06, 0.27), accent, 0, 0.9, 0);
    const head = mesh(sphereGeometry(0.15, 2), skinMat, 0, 1.62, 0);
    const hair = mesh(sphereGeometry(0.155, 1), material('#3b2a20', { roughness: 0.9 }), 0, 1.66, -0.02);
    hair.scale.set(1, 0.75, 1);
    const eyeMat = material('#1a1a1a');
    const eyeL = mesh(sphereGeometry(0.02, 0), eyeMat, -0.05, 1.64, 0.135);
    const eyeR = mesh(sphereGeometry(0.02, 0), eyeMat, 0.05, 1.64, 0.135);
    this.body.add(this.torso, belt, head, hair, eyeL, eyeR);

    for (const [arm, side] of [
      [this.leftArm, -1],
      [this.rightArm, 1],
    ] as const) {
      arm.position.set(side * 0.3, 1.42, 0);
      arm.add(mesh(cylinderGeometry(0.065, 0.055, 0.56, 8), cloth, 0, -0.28, 0));
      arm.add(mesh(sphereGeometry(0.06, 0), skinMat, 0, -0.6, 0));
      this.body.add(arm);
    }
    for (const [leg, side] of [
      [this.leftLeg, -1],
      [this.rightLeg, 1],
    ] as const) {
      leg.position.set(side * 0.12, 0.88, 0);
      leg.add(mesh(cylinderGeometry(0.085, 0.07, 0.82, 8), pants, 0, -0.42, 0));
      leg.add(mesh(boxGeometry(0.13, 0.08, 0.24), material('#1d1f23'), 0, -0.84, 0.04));
      this.root.add(leg);
    }

    this.body.add(this.accessories);
    this.root.add(this.body);
    this.setTeam(team);
  }

  /** Acessórios da equipe: boné e lanterna para caçadores. */
  setTeam(team: Team | null): void {
    this.accessories.clear();
    // Os dois primeiros filhos do braço são o braço e a mão; o resto é acessório.
    for (const child of this.rightArm.children.slice(2)) this.rightArm.remove(child);
    if (team === 'HUNTERS') {
      const cap = mesh(cylinderGeometry(0.16, 0.16, 0.08, 14), material('#c0392b', { roughness: 0.7 }), 0, 1.74, 0);
      const brim = mesh(boxGeometry(0.2, 0.02, 0.14), material('#a93226'), 0, 1.71, 0.15);
      const flashlight = mesh(cylinderGeometry(0.035, 0.03, 0.22, 10), material('#2a2d33', { metalness: 0.6, roughness: 0.4 }), 0, -0.62, 0.1);
      flashlight.rotation.x = Math.PI / 2;
      const lens = mesh(cylinderGeometry(0.036, 0.036, 0.01, 10), material('#fff4c2', { emissive: '#ffe9a6', emissiveIntensity: 2 }), 0, -0.62, 0.215);
      lens.rotation.x = Math.PI / 2;
      this.rightArm.add(flashlight, lens);
      this.accessories.add(cap, brim);
    }
  }

  /**
   * Atualiza a animação.
   * @param speed velocidade horizontal (m/s)
   */
  animate(dt: number, speed: number, grounded: boolean): void {
    const moving = speed > 0.3;
    this.blend += ((moving ? 1 : 0) - this.blend) * Math.min(1, dt * 10);
    const cadence = 2.2 + speed * 1.1;
    this.phase += dt * cadence;
    const swing = Math.sin(this.phase) * 0.75 * this.blend * Math.min(1, speed / 4 + 0.4);

    if (!grounded) {
      this.leftLeg.rotation.x = -0.5;
      this.rightLeg.rotation.x = 0.3;
      this.leftArm.rotation.x = -2.4;
      this.rightArm.rotation.x = -2.4;
      this.body.position.y = 0;
      return;
    }
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.9;
    this.rightArm.rotation.x = swing * 0.9;
    // Respiração parado e balanço ao andar.
    const idle = Math.sin(performance.now() / 600) * 0.008 * (1 - this.blend);
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.04 * this.blend + idle;
    this.torso.rotation.x = 0.08 * this.blend * Math.min(1, speed / 6);
  }
}

function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
