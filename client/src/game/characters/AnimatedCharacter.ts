import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getSkin, type SkinLook, type Team } from '@hh/shared';
import { createAccessory } from './accessories';
import { getCharacterAsset, type CharacterModelId } from './characterAssets';
import { assembleCharacter, quaterniusAnimations, quaterniusReady } from './quaternius';

type ClipSet = { idle: string; walk: string; run: string; jump?: string; emotes: Record<string, string> };

/** Animações dos personagens realistas (Universal Animation Library). */
const REALISTIC_CLIPS: ClipSet = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  run: 'Jog_Fwd_Loop',
  jump: 'Jump_Loop',
  emotes: { dance: 'Dance_Loop', wave: 'Interact', thumbs: 'Idle_Talking_Loop', yes: 'Idle_Talking_Loop', no: 'Hit_Chest', jump: 'Jump_Start' },
};

/** Visuais padrão de cada equipe (variam por jogador, para a sala não ter clones). */
const DEFAULT_LOOKS: Record<'HIDERS' | 'HUNTERS', SkinLook[]> = {
  HIDERS: [
    { outfit: 'male_peasant', hair: 'parted', hairTint: '#5a3a22' },
    { outfit: 'female_peasant', hair: 'buns', hairTint: '#3b2618' },
    { outfit: 'male_peasant', hair: 'beard', hairTint: '#2a211b' },
    { outfit: 'female_peasant', hair: 'long', hairTint: '#a3743f' },
  ],
  HUNTERS: [
    { outfit: 'male_ranger', outfitTint: '#9aa39a' },
    { outfit: 'female_ranger', hair: 'long', outfitTint: '#9aa39a', hairTint: '#2b1d16' },
  ],
};

/** Escolhe o visual realista de um jogador: o da skin, ou o padrão da equipe tingido com a cor da skin. */
export function resolveLook(skinId: string, team: Team | null, seed: number): SkinLook | null {
  const skin = getSkin(skinId);
  if (skin.model) return null;
  if (skin.look) return skin.look;
  const options = DEFAULT_LOOKS[team === 'HUNTERS' ? 'HUNTERS' : 'HIDERS'];
  const base = options[Math.abs(seed) % options.length]!;
  if (skinId === 'default') return base;
  // Skins de cor antigas: tingem a roupa padrão.
  const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(skin.color), 0.65);
  return { ...base, outfitTint: `#${tint.getHexString()}` };
}

/** Nomes das animações em cada modelo. */
const CLIPS: Record<'soldier' | 'xbot' | 'robot', ClipSet> = {
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
  private readonly jump: THREE.AnimationAction | null = null;
  private emote: THREE.AnimationAction | null = null;
  private airborne = 0;
  private cape: THREE.Object3D | null = null;
  private capeSwing = 0;
  readonly rightHand: THREE.Object3D | null;
  readonly head: THREE.Object3D | null;

  private constructor(
    readonly modelId: CharacterModelId | 'realistic',
    model: THREE.Object3D,
    animations: THREE.AnimationClip[],
    scale: number,
    clips: ClipSet,
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
    const names = clips;
    this.idle = this.mixer.clipAction(clip(names.idle));
    this.walk = this.mixer.clipAction(clip(names.walk));
    this.run = this.mixer.clipAction(clip(names.run));
    for (const action of [this.idle, this.walk, this.run]) {
      action.play();
      action.setEffectiveWeight(0);
    }
    this.idle.setEffectiveWeight(1);
    if (names.jump && animations.some((a) => a.name === names.jump)) {
      this.jump = this.mixer.clipAction(clip(names.jump));
      this.jump.play();
      this.jump.setEffectiveWeight(0);
    }
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
    this.rightHand = findBone(model, 'RightHand') ?? findBone(model, 'hand_r');
    this.head = findBone(model, 'Head');
  }

  /** Cria o personagem de um modelo; undefined se o modelo não carregou. */
  static create(modelId: CharacterModelId, skinId: string, team: Team | null, seed = 0): AnimatedCharacter | undefined {
    const look = quaterniusReady() ? resolveLook(skinId, team, seed) : null;
    if (look) {
      const realistic = AnimatedCharacter.createRealistic(look, team);
      if (realistic) return realistic;
    }
    const asset = getCharacterAsset(modelId);
    if (!asset) return undefined;
    const model = SkeletonUtils.clone(asset.scene);
    const character = new AnimatedCharacter(modelId, model, asset.animations, asset.scale, CLIPS[modelId]);
    character.applySkin(skinId, team);
    return character;
  }

  /** Personagem realista: roupa + cabeça + cabelo + acessórios, com proporções de jogo. */
  private static createRealistic(look: SkinLook, team: Team | null): AnimatedCharacter | undefined {
    const hidesHead = (look.accessories ?? []).some((a) => a === 'rabbit_head' || a === 'pumpkin_head');
    const model = assembleCharacter(look.outfit, hidesHead ? 'none' : (look.hair ?? 'none'), !hidesHead);
    if (!model) return undefined;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1.8;
    // Hunters seguram a lanterna parados; escondidos ficam na pose relaxada.
    const clips = team === 'HUNTERS' ? { ...REALISTIC_CLIPS, idle: 'Idle_Torch_Loop' } : REALISTIC_CLIPS;
    const character = new AnimatedCharacter('realistic', model, quaterniusAnimations(), 1.8 / height, clips);
    character.applyLook(model, look);
    return character;
  }

  /** Tinge roupa/pele/cabelo, acende olhos, ajusta proporções e prende os acessórios. */
  private applyLook(model: THREE.Object3D, look: SkinLook): void {
    const glow = look.glow ?? '#ffd27a';
    const accessories = look.accessories ?? [];
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const tinted = materials.map((original) => {
        const material = (original as THREE.MeshStandardMaterial).clone();
        const name = material.name;
        if (/Ranger|Peasant/i.test(name) && look.outfitTint) material.color.set(look.outfitTint);
        else if (/Regular|Superhero/i.test(name) && look.skinTint) material.color.set(look.skinTint);
        else if (/Hair/i.test(name)) material.color.set(look.hairTint ?? '#3a2a1e');
        else if (/Eye/i.test(name) && accessories.includes('glow_eyes')) {
          material.emissive = new THREE.Color(glow);
          material.emissiveIntensity = 2.2;
        }
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0]!;
    });

    // Proporções de jogo de esconde-esconde: cabeça e mãos um pouco maiores.
    const headBone = findBone(model, 'Head');
    headBone?.scale.setScalar(1.12);
    for (const name of ['hand_l', 'hand_r']) model.getObjectByName(name)?.scale.setScalar(1.08);

    if (!headBone || accessories.length === 0) return;
    this.root.updateMatrixWorld(true);
    // Centro e altura da cabeça medidos na malha da cabeça (ou estimados pelo osso).
    const headWorld = new THREE.Vector3();
    headBone.getWorldPosition(headWorld);
    const rootScale = new THREE.Vector3();
    model.getWorldScale(rootScale);
    const headSize = 0.26 * 1.12;
    const center = headWorld.clone().add(new THREE.Vector3(0, headSize * 0.42, headSize * 0.08));
    for (const kind of accessories) {
      const result = createAccessory(kind, headSize, glow);
      if (!result) continue;
      const bone = result.onBack ? (model.getObjectByName('spine_03') ?? headBone) : headBone;
      bone.updateMatrixWorld(true);
      const anchorWorld = result.onBack
        ? (() => {
            const p = new THREE.Vector3();
            bone.getWorldPosition(p);
            return p.add(new THREE.Vector3(0, 0.12, -0.13));
          })()
        : center;
      // Âncora com a orientação do personagem (não a do osso) e escala de 1 metro.
      const world = new THREE.Matrix4().compose(anchorWorld, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      const local = bone.matrixWorld.clone().invert().multiply(world);
      local.decompose(result.object.position, result.object.quaternion, result.object.scale);
      bone.add(result.object);
      if (kind === 'cape') this.cape = result.object.getObjectByName('cape') ?? null;
    }
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
    const air = this.jump ? this.airborne : 0;
    blend(this.idle, idleWeight * (1 - air), k);
    blend(this.walk, walkWeight * (1 - air), k);
    blend(this.run, runWeight * (1 - air), k);
    if (this.jump) blend(this.jump, air, k);
    // A capa balança com a corrida.
    if (this.cape) {
      this.capeSwing += dt * (2 + speed);
      const target = Math.min(0.55, speed * 0.08) + Math.sin(this.capeSwing) * (0.03 + speed * 0.015);
      this.cape.rotation.x += (target - this.cape.rotation.x) * Math.min(1, dt * 6);
    }
    // Ajusta a cadência ao ritmo real dos passos (evita "patinar").
    this.walk.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.6, 1.6);
    this.run.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.8, 1.4);
    // No ar: congela a passada e inclina um pouco o corpo.
    const freeze = 1 - this.airborne * 0.85;
    this.walk.timeScale *= freeze;
    this.run.timeScale *= freeze;
    this.root.rotation.x = this.jump ? 0 : -this.airborne * 0.08;
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
