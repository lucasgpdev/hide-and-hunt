import type RAPIER_NS from '@dimforge/rapier3d-compat';
import {
  BALANCE,
  characterShapeInfo,
  createCharacterColliderDesc,
  getPropType,
  type CharacterShapeInfo,
  type MapPhysics,
  type Team,
} from '@hh/shared';

type Rapier = typeof RAPIER_NS;

export interface MoveInput {
  forward: number;
  right: number;
  run: boolean;
  jump: boolean;
}

/**
 * Movimento do jogador local com o controlador de personagem do Rapier:
 * colisão com paredes e objetos, degraus, rampas, gravidade e pulo.
 * O servidor valida cada posição enviada (velocidade e passagem por paredes).
 */
export class LocalController {
  readonly position = { x: 0, y: 0, z: 0 };
  /** Direção para onde o personagem está virado (radianos). */
  facing = 0;
  grounded = true;
  horizontalSpeed = 0;
  moving = false;
  running = false;
  private velocityY = 0;
  private shape: CharacterShapeInfo = characterShapeInfo(null);
  private collider: RAPIER_NS.Collider;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  private disguise: string | null = null;

  constructor(
    private readonly RAPIER: Rapier,
    private readonly physics: MapPhysics,
  ) {
    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.35, 0.15, false);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setSlideEnabled(true);
    this.collider = this.createCollider();
  }

  get colliderHandle(): RAPIER_NS.Collider {
    return this.collider;
  }

  get height(): number {
    return this.shape.height;
  }

  dispose(): void {
    this.physics.world.removeCollider(this.collider, false);
    this.physics.world.removeCharacterController(this.controller);
  }

  setDisguise(disguise: string | null): void {
    if (disguise === this.disguise) return;
    this.disguise = disguise;
    this.shape = characterShapeInfo(disguise);
    this.physics.world.removeCollider(this.collider, false);
    this.collider = this.createCollider();
  }

  teleport(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.velocityY = 0;
    this.syncCollider();
  }

  update(dt: number, input: MoveInput, cameraYaw: number, team: Team | null, frozen: boolean, speedMultiplier = 1): void {
    const m = BALANCE.movement;
    const prop = this.disguise ? getPropType(this.disguise) : undefined;
    const base = team === 'HUNTERS' ? (input.run ? m.hunterRunSpeed : m.hunterWalkSpeed) : input.run ? m.hiderRunSpeed : m.hiderWalkSpeed;
    const speed = base * (prop?.speed ?? 1) * speedMultiplier;

    // Direção relativa à câmera.
    let dx = 0;
    let dz = 0;
    if (!frozen) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      dx = -sin * input.forward + cos * input.right;
      dz = -cos * input.forward - sin * input.right;
      const length = Math.hypot(dx, dz);
      if (length > 0) {
        dx /= length;
        dz /= length;
      }
    }
    this.moving = dx !== 0 || dz !== 0;
    this.running = this.moving && input.run;
    if (this.moving) this.facing = Math.atan2(dx, dz);

    const canJump = prop ? prop.canJump : true;
    if (this.grounded && input.jump && canJump && !frozen) this.velocityY = m.jumpVelocity;
    this.velocityY += m.gravity * dt;
    this.velocityY = Math.max(this.velocityY, -m.maxVerticalSpeed);

    const desired = { x: dx * speed * dt, y: this.velocityY * dt, z: dz * speed * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const movement = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocityY < 0) this.velocityY = 0;
    // Bateu a cabeça no teto.
    if (this.velocityY > 0 && movement.y < desired.y * 0.5) this.velocityY = 0;

    this.position.x += movement.x;
    this.position.y += movement.y;
    this.position.z += movement.z;
    this.horizontalSpeed = dt > 0 ? Math.hypot(movement.x, movement.z) / dt : 0;
    this.syncCollider();
  }

  private createCollider(): RAPIER_NS.Collider {
    const collider = this.physics.world.createCollider(createCharacterColliderDesc(this.RAPIER, this.shape));
    this.collider = collider;
    this.syncCollider();
    return collider;
  }

  private syncCollider(): void {
    this.collider?.setTranslation({
      x: this.position.x,
      y: this.position.y + this.shape.height / 2,
      z: this.position.z,
    });
  }
}
