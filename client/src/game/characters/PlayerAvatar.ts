import * as THREE from 'three';
import { getSkin, type Team } from '@hh/shared';
import { material } from '../objects/primitives';
import { createPropModel } from '../objects/propModels';
import { AnimatedCharacter } from './AnimatedCharacter';
import { CharacterModel } from './CharacterModel';

/**
 * Representação visual de um jogador: personagem animado (ou o objeto em
 * que ele está transformado) e etiqueta de nome opcional.
 */
export class PlayerAvatar {
  readonly root = new THREE.Group();
  private animated: AnimatedCharacter | null = null;
  private simple: CharacterModel | null = null;
  private body = new THREE.Group();
  private prop: THREE.Object3D | null = null;
  private flashlight: THREE.Object3D | null = null;
  private readonly nameplate: THREE.Sprite;
  private nameTexture: THREE.CanvasTexture;
  disguise: string | null = null;
  team: Team | null;
  private skin: string;
  private nickname: string;
  /** Animação de troca de forma (0..1). */
  private morph = 0;

  constructor(
    readonly playerId: string,
    nickname: string,
    skin: string,
    team: Team | null,
  ) {
    this.team = team;
    this.skin = skin;
    this.nickname = nickname;
    this.root.add(this.body);
    this.nameTexture = makeNameTexture(nickname, team);
    this.nameplate = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTexture, depthTest: false, transparent: true }));
    this.nameplate.scale.set(1.6, 0.4, 1);
    this.nameplate.position.y = 2.15;
    this.nameplate.renderOrder = 10;
    this.root.add(this.nameplate);
    this.buildCharacter();
  }

  get emotes(): string[] {
    return this.animated?.availableEmotes ?? [];
  }

  setIdentity(team: Team | null, nickname: string, skin: string): void {
    if (team === this.team && nickname === this.nickname && skin === this.skin) return;
    const rebuild = team !== this.team || skin !== this.skin;
    this.team = team;
    this.nickname = nickname;
    this.skin = skin;
    this.nameTexture.dispose();
    this.nameTexture = makeNameTexture(nickname, team);
    (this.nameplate.material as THREE.SpriteMaterial).map = this.nameTexture;
    if (rebuild) this.buildCharacter();
  }

  /** Troca para um objeto (ou de volta para humano). Devolve true se mudou. */
  setDisguise(disguise: string | null): boolean {
    if (disguise === this.disguise) return false;
    this.disguise = disguise;
    if (this.prop) {
      this.root.remove(this.prop);
      this.prop = null;
    }
    if (disguise) {
      this.prop = createPropModel(disguise);
      this.tag(this.prop);
      this.root.add(this.prop);
    }
    this.body.visible = !disguise;
    this.nameplate.position.y = disguise ? 1.3 : 2.15;
    this.morph = 1;
    return true;
  }

  setNameVisible(visible: boolean): void {
    this.nameplate.visible = visible;
  }

  playEmote(name: string): boolean {
    return !this.disguise && Boolean(this.animated?.playEmote(name));
  }

  update(dt: number, speed: number, grounded: boolean): void {
    if (!this.disguise) {
      this.animated?.update(dt, speed, grounded);
      this.simple?.animate(dt, speed, grounded);
    }
    if (this.morph > 0) {
      // "Pop" elástico ao virar objeto: encolhe, estica e assenta.
      this.morph = Math.max(0, this.morph - dt * 2.5);
      const t = 1 - this.morph;
      const s = t < 0.35 ? 0.4 + (t / 0.35) * 0.8 : 1 + Math.sin((t - 0.35) * 14) * 0.12 * (1 - t);
      const target = this.prop ?? this.body;
      target.scale.set(s, 2 - s, s);
      if (this.morph === 0) target.scale.setScalar(1);
    }
  }

  dispose(): void {
    this.animated?.dispose();
    this.nameTexture.dispose();
    (this.nameplate.material as THREE.SpriteMaterial).dispose();
    this.root.removeFromParent();
  }

  private buildCharacter(): void {
    this.animated?.dispose();
    this.body.clear();
    this.animated = null;
    this.simple = null;
    const skin = getSkin(this.skin);
    const modelId = skin.model ?? (this.team === 'HUNTERS' ? 'soldier' : 'xbot');
    this.animated = AnimatedCharacter.create(modelId, this.skin, this.team) ?? null;
    if (this.animated) {
      this.body.add(this.animated.root);
    } else {
      this.simple = new CharacterModel(this.skin, this.team);
      this.body.add(this.simple.root);
    }
    if (this.team === 'HUNTERS' && this.animated?.rightHand) {
      this.flashlight = createFlashlight();
      // Compensa a escala dos ossos (o Mixamo usa centímetros) para a lanterna ter tamanho real.
      this.animated.root.updateMatrixWorld(true);
      const handScale = new THREE.Vector3();
      this.animated.rightHand.getWorldScale(handScale);
      const rootScale = new THREE.Vector3();
      this.root.getWorldScale(rootScale);
      this.flashlight.scale.setScalar(rootScale.x / Math.max(1e-5, handScale.x));
      this.animated.rightHand.add(this.flashlight);
    }
    this.tag(this.body);
  }

  private tag(object: THREE.Object3D): void {
    object.traverse((child) => {
      child.userData.playerId = this.playerId;
    });
  }
}

function createFlashlight(): THREE.Object3D {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.2, 14), material('#1f2226', { metalness: 0.7, roughness: 0.35 }));
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.05, 14), material('#2a2d33', { metalness: 0.7, roughness: 0.3 }));
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.12;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), material('#fff6d6', { emissive: '#fff1c0', emissiveIntensity: 4 }));
  lens.position.z = 0.146;
  group.add(body, head, lens);
  group.position.set(0, 0.08, 0.04);
  group.rotation.set(-Math.PI / 2, 0, 0);
  for (const m of [body, head]) m.castShadow = true;
  return group;
}

function makeNameTexture(name: string, team: Team | null): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(250, ctx.measureText(name).width + 28);
  ctx.fillStyle = 'rgba(8, 10, 14, 0.65)';
  ctx.beginPath();
  ctx.roundRect((256 - width) / 2, 10, width, 44, 12);
  ctx.fill();
  ctx.fillStyle = team === 'HUNTERS' ? '#ffb547' : team === 'HIDERS' ? '#6fe3c7' : '#e8e6e1';
  ctx.fillText(name, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
