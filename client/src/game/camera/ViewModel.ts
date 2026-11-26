import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Mão direita em primeira pessoa: manga com a cor da roupa, mão e a lanterna.
 * Balança ao andar, fica um pouco para trás quando a câmera gira e dá um
 * avanço rápido ao tentar capturar.
 */
export class ViewModel {
  readonly group = new THREE.Group();
  private readonly arm = new THREE.Group();
  private readonly sleeveMaterial = new THREE.MeshStandardMaterial({ color: '#3d4a5c', roughness: 0.85 });
  private readonly cuffMaterial = new THREE.MeshStandardMaterial({ color: '#2a323d', roughness: 0.9 });
  private readonly skinMaterial = new THREE.MeshStandardMaterial({ color: '#c99474', roughness: 0.6 });
  private readonly lensMaterial = new THREE.MeshStandardMaterial({ color: '#fff6d6', emissive: '#fff1c0', emissiveIntensity: 0 });
  private readonly torch = new THREE.Group();
  readonly lens = new THREE.Object3D();
  private phase = 0;
  private bobAmount = 0;
  private punch = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private swayX = 0;
  private swayY = 0;
  private show = 0;
  private readonly owned: { dispose(): void }[] = [];

  constructor(camera: THREE.Camera) {
    const sleeveGeo = new THREE.CylinderGeometry(0.05, 0.058, 0.36, 16);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeve = new THREE.Mesh(sleeveGeo, this.sleeveMaterial);
    sleeve.position.z = 0.16;
    const cuffGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.035, 16);
    cuffGeo.rotateX(Math.PI / 2);
    const cuff = new THREE.Mesh(cuffGeo, this.cuffMaterial);
    cuff.position.z = -0.02;
    const handGeo = new RoundedBoxGeometry(0.075, 0.06, 0.1, 3, 0.022);
    const hand = new THREE.Mesh(handGeo, this.skinMaterial);
    hand.position.set(0, -0.005, -0.075);
    const thumbGeo = new RoundedBoxGeometry(0.026, 0.026, 0.06, 2, 0.011);
    const thumb = new THREE.Mesh(thumbGeo, this.skinMaterial);
    thumb.position.set(-0.04, 0.012, -0.08);
    thumb.rotation.y = 0.35;

    // Lanterna: corpo, cabeça e lente (brilha quando ligada).
    const metal = new THREE.MeshStandardMaterial({ color: '#23262b', metalness: 0.75, roughness: 0.35 });
    const bodyGeo = new THREE.CylinderGeometry(0.019, 0.017, 0.17, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const headGeo = new THREE.CylinderGeometry(0.03, 0.021, 0.045, 18);
    headGeo.rotateX(Math.PI / 2);
    const lensGeo = new THREE.CircleGeometry(0.026, 18);
    const body = new THREE.Mesh(bodyGeo, metal);
    const head = new THREE.Mesh(headGeo, metal);
    head.position.z = -0.1;
    const glass = new THREE.Mesh(lensGeo, this.lensMaterial);
    glass.position.z = -0.1235;
    glass.rotation.y = Math.PI;
    this.lens.position.z = -0.13;
    this.torch.add(body, head, glass, this.lens);
    this.torch.position.set(0, 0.03, -0.09);

    this.arm.add(sleeve, cuff, hand, thumb, this.torch);
    this.arm.rotation.set(0.1, 0.1, 0.05);
    this.group.add(this.arm);
    this.group.position.set(0.24, -0.23, -0.4);
    this.group.scale.setScalar(0.82);
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => {};
      // Desenhada por cima do cenário próximo (não entra na parede ao encostar).
      mesh.renderOrder = 20;
      (mesh.material as THREE.Material).depthTest = true;
    });
    this.group.visible = false;
    camera.add(this.group);
    this.owned.push(sleeveGeo, cuffGeo, handGeo, thumbGeo, bodyGeo, headGeo, lensGeo, metal, this.sleeveMaterial, this.cuffMaterial, this.skinMaterial, this.lensMaterial);
  }

  setColors(sleeve: string, cuff: string): void {
    this.sleeveMaterial.color.set(sleeve);
    this.cuffMaterial.color.set(cuff);
  }

  /** Avanço de captura. */
  thrust(): void {
    this.punch = 1;
  }

  update(
    dt: number,
    state: { visible: boolean; speed: number; grounded: boolean; flashlight: boolean; yaw: number; pitch: number; bob: boolean },
  ): void {
    // Entra e sai de cena deslizando para baixo.
    this.show += ((state.visible ? 1 : 0) - this.show) * Math.min(1, dt * 10);
    this.group.visible = this.show > 0.02;
    if (!this.group.visible) {
      this.lastYaw = state.yaw;
      this.lastPitch = state.pitch;
      return;
    }
    const moving = state.grounded ? Math.min(1, state.speed / 5) : 0;
    this.bobAmount += (moving - this.bobAmount) * Math.min(1, dt * 8);
    this.phase += dt * (4 + state.speed * 1.6);
    const bob = state.bob ? this.bobAmount : this.bobAmount * 0.25;

    // Atraso ao girar a câmera (sensação de peso).
    let dyaw = state.yaw - this.lastYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = state.pitch - this.lastPitch;
    this.lastYaw = state.yaw;
    this.lastPitch = state.pitch;
    this.swayX += (THREE.MathUtils.clamp(dyaw * 1.6, -0.06, 0.06) - this.swayX) * Math.min(1, dt * 12);
    this.swayY += (THREE.MathUtils.clamp(-dpitch * 1.6, -0.05, 0.05) - this.swayY) * Math.min(1, dt * 12);
    this.swayX *= 1 - Math.min(1, dt * 6);
    this.swayY *= 1 - Math.min(1, dt * 6);

    this.punch = Math.max(0, this.punch - dt * 4.5);
    const thrust = Math.sin(this.punch * Math.PI) * 0.16;

    this.group.position.set(
      0.24 + Math.cos(this.phase) * 0.012 * bob + this.swayX,
      -0.23 - Math.abs(Math.sin(this.phase)) * 0.014 * bob + this.swayY - (1 - this.show) * 0.35,
      -0.4 - thrust,
    );
    this.arm.rotation.x = 0.08 + Math.sin(this.phase * 2) * 0.015 * bob - thrust * 0.6;
    this.lensMaterial.emissiveIntensity = state.flashlight ? 6 : 0;
    this.torch.visible = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const item of this.owned) item.dispose();
  }
}
