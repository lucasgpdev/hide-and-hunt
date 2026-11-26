import type RAPIER_NS from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

type Rapier = typeof RAPIER_NS;

/**
 * Câmera do jogador: primeira pessoa (nos olhos do personagem; o padrão) ou
 * terceira pessoa (item 21: órbita com o mouse, movimento suave e colisão —
 * se houver parede entre o jogador e a câmera, ela se aproxima).
 */
export class ThirdPersonCamera {
  yaw = 0;
  /** Positivo = olhando para baixo. */
  pitch = 0.25;
  private distance = 4;
  private readonly pivot = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly smoothed = new THREE.Vector3();
  private initialized = false;
  /** Primeira pessoa: a câmera fica nos olhos do alvo. */
  firstPerson = false;
  private eyeY = 0;
  /** Balanço ao andar (1ª pessoa): velocidade no chão e se está ligado. */
  bob = { speed: 0, grounded: true, enabled: true };
  private bobPhase = 0;
  private bobAmount = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly RAPIER: Rapier,
  ) {}

  rotate(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    const factor = 0.0022 * sensitivity;
    this.yaw -= dx * factor;
    this.pitch += dy * factor * (invertY ? -1 : 1);
    this.pitch = this.firstPerson ? Math.max(-1.45, Math.min(1.45, this.pitch)) : Math.max(-0.9, Math.min(1.25, this.pitch));
  }

  /** Coloca a câmera atrás de um alvo, sem transição. */
  snap(): void {
    this.initialized = false;
  }

  update(
    target: { x: number; y: number; z: number },
    targetHeight: number,
    dt: number,
    world: RAPIER_NS.World | null,
    exclude?: RAPIER_NS.Collider,
  ): void {
    if (this.firstPerson) {
      this.updateFirstPerson(target, targetHeight, dt);
      return;
    }
    const wanted = Math.max(2.2, Math.min(5.5, 2.4 + targetHeight * 1.2));
    this.distance += (wanted - this.distance) * Math.min(1, dt * 4);

    this.pivot.set(target.x, target.y + Math.max(0.35, targetHeight * 0.85), target.z);
    const cosP = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP);
    // Leve deslocamento lateral (por cima do ombro).
    const shoulder = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.35);

    let distance = this.distance;
    if (world) {
      const origin = this.pivot.clone().add(shoulder.clone().multiplyScalar(0.5));
      const ray = new this.RAPIER.Ray(origin, dir);
      const hit = world.castRay(ray, distance + 0.3, true, undefined, undefined, exclude);
      if (hit) distance = Math.max(0.4, hit.timeOfImpact - 0.25);
    }

    this.desired.copy(this.pivot).add(shoulder).addScaledVector(dir, distance);
    if (!this.initialized) {
      this.smoothed.copy(this.desired);
      this.initialized = true;
    } else {
      // Aproxima rápido (evita atravessar parede) e afasta suave.
      const closer = this.desired.distanceTo(this.pivot) < this.smoothed.distanceTo(this.pivot);
      this.smoothed.lerp(this.desired, Math.min(1, dt * (closer ? 30 : 12)));
    }
    this.camera.position.copy(this.smoothed);
    this.camera.lookAt(this.pivot.clone().add(shoulder));
  }

  /** Olhos a ~92% da altura (objeto disfarçado: no topo dele); suaviza só a altura. */
  private updateFirstPerson(target: { x: number; y: number; z: number }, targetHeight: number, dt: number): void {
    const eye = target.y + Math.max(0.3, targetHeight * 0.92);
    if (!this.initialized || Math.abs(eye - this.eyeY) > 1.5) this.eyeY = eye;
    else this.eyeY += (eye - this.eyeY) * Math.min(1, dt * 18);
    this.initialized = true;
    const moving = this.bob.enabled && this.bob.grounded ? Math.min(1, this.bob.speed / 5) : 0;
    this.bobAmount += (moving - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * (4 + this.bob.speed * 1.6);
    const up = Math.abs(Math.sin(this.bobPhase)) * 0.032 * this.bobAmount;
    const side = Math.cos(this.bobPhase) * 0.018 * this.bobAmount;
    this.camera.position.set(target.x + Math.cos(this.yaw) * side, this.eyeY + up - 0.016 * this.bobAmount, target.z - Math.sin(this.yaw) * side);
    const cosP = Math.cos(this.pitch);
    // Olha para frente (o oposto da direção em que a câmera de 3ª pessoa fica).
    const p = this.camera.position;
    this.camera.lookAt(p.x - Math.sin(this.yaw) * cosP, p.y - Math.sin(this.pitch), p.z - Math.cos(this.yaw) * cosP);
    // A câmera de 3ª pessoa recomeça do lugar certo se o jogador trocar.
    this.smoothed.copy(this.camera.position);
  }
}
