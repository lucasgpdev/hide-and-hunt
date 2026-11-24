import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getSkin, type Team } from '@hh/shared';
import { getCharacterAsset, type CharacterModelId } from './characterAssets';

/** Nomes das animações em cada modelo. */
const CLIPS: Record<CharacterModelId, { idle: string; walk: string; run: string; emotes: Record<string, string> }> = {
  soldier: { idle: 'Idle', walk: 'Walk', run: 'Run', emotes: {} },
  xbot: { idle: 'idle', walk: 'walk', run: 'run', emotes: { yes: 'agree', no: 'headShake' } },
  robot: {
    idle: 'Idle',
    walk: 'Walking',
    run: 'Running',
    emotes: { wave: 'Wave', dance: 'Dance', yes: 'Yes', no: 'No', thumbs: 'ThumbsUp', jump: 'Jump' },
  },
};

/**
 * Personagem com esqueleto e animações reais (captura de movimento):
 * mistura parado/andar/correr pela velocidade, com transições suaves,
 * pose de salto e emotes.
 */
export class AnimatedCharacter {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private readonly emoteActions = new Map<string, THREE.AnimationAction>();
  private emote: THREE.AnimationAction | null = null;
  private airborne = 0;
  readonly rightHand: THREE.Object3D | null;
  readonly head: THREE.Object3D | null;

  private constructor(
    readonly modelId: CharacterModelId,
    model: THREE.Object3D,
    animations: THREE.AnimationClip[],
    scale: number,
  ) {
    model.scale.setScalar(scale);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // malhas com esqueleto mudam de forma ao animar
      }
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (name: string) => animations.find((a) => a.name === name) ?? animations[0]!;
    const names = CLIPS[modelId];
    this.idle = this.mixer.clipAction(clip(names.idle));
    this.walk = this.mixer.clipAction(clip(names.walk));
    this.run = this.mixer.clipAction(clip(names.run));
    for (const action of [this.idle, this.walk, this.run]) {
      action.play();
      action.setEffectiveWeight(0);
    }
    this.idle.setEffectiveWeight(1);
    for (const [emote, clipName] of Object.entries(names.emotes)) {
      const c = animations.find((a) => a.name === clipName);
      if (!c) continue;
      const action = this.mixer.clipAction(c);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      this.emoteActions.set(emote, action);
    }
    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.emote) {
        this.emote.fadeOut(0.3);
        this.emote = null;
      }
    });
    this.rightHand = findBone(model, 'RightHand');
    this.head = findBone(model, 'Head');
  }

  /** Cria o personagem de um modelo; undefined se o modelo não carregou. */
  static create(modelId: CharacterModelId, skinId: string, team: Team | null): AnimatedCharacter | undefined {
    const asset = getCharacterAsset(modelId);
    if (!asset) return undefined;
    const model = SkeletonUtils.clone(asset.scene);
    const character = new AnimatedCharacter(modelId, model, asset.animations, asset.scale);
    character.applySkin(skinId, team);
    return character;
  }

  get availableEmotes(): string[] {
    return [...this.emoteActions.keys()];
  }

  playEmote(name: string): boolean {
    const action = this.emoteActions.get(name);
    if (!action) return false;
    this.emote?.stop();
    this.emote = action;
    action.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    return true;
  }

  /** Aplica a cor do visual comprado na loja (sem mudar o formato do modelo). */
  applySkin(skinId: string, team: Team | null): void {
    const skin = getSkin(skinId);
    const swap = (original: THREE.Material): THREE.Material => {
      const material = (original as THREE.MeshStandardMaterial).clone();
      if (this.modelId === 'xbot') {
        material.color.set(/Joints/i.test(material.name) ? skin.accent : skin.color);
        material.roughness = 0.45;
        material.metalness = 0.1;
      } else if (this.modelId === 'robot') {
        if (/Main/i.test(material.name)) material.color.set(skin.color);
      } else if (team === 'HUNTERS' && skinId !== 'default') {
        material.color.lerp(new THREE.Color(skin.color), 0.25);
      }
      return material;
    };
    this.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }

  /**
   * @param speed velocidade horizontal (m/s)
   */
  update(dt: number, speed: number, grounded: boolean): void {
    this.airborne = grounded ? Math.max(0, this.airborne - dt * 6) : Math.min(1, this.airborne + dt * 6);
    const moving = this.emote ? 0 : Math.min(1, speed / 1.2);
    const running = THREE.MathUtils.clamp((speed - 3) / 2.5, 0, 1);
    const idleWeight = 1 - moving;
    const walkWeight = moving * (1 - running);
    const runWeight = moving * running;
    const k = Math.min(1, dt * 10);
    blend(this.idle, idleWeight, k);
    blend(this.walk, walkWeight, k);
    blend(this.run, runWeight, k);
    // Ajusta a cadência ao ritmo real dos passos (evita "patinar").
    this.walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.6);
    this.run.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.8, 1.4);
    // No ar: congela a passada e inclina um pouco o corpo.
    const freeze = 1 - this.airborne * 0.85;
    this.walk.timeScale *= freeze;
    this.run.timeScale *= freeze;
    this.root.rotation.x = -this.airborne * 0.08;
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of materials) m.dispose();
    });
  }
}

function blend(action: THREE.AnimationAction, target: number, k: number): void {
  const current = action.getEffectiveWeight();
  action.setEffectiveWeight(current + (target - current) * k);
}

function findBone(root: THREE.Object3D, suffix: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && child.name.endsWith(suffix) && !child.name.includes('Index') && !child.name.includes('Thumb')) found = child;
  });
  return found;
}
