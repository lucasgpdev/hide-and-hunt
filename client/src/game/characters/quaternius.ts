import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Personagens realistas montados a partir dos pacotes CC0 do Quaternius:
 * - Modular Character Outfits - Fantasy (roupas com corpo, sem cabeça);
 * - Universal Base Characters (cabeça, olhos e sobrancelhas; cabelos);
 * - Universal Animation Library (animações por captura de movimento).
 * Todos usam o mesmo esqueleto, então cabeça e cabelo são "religados" aos
 * ossos da roupa e seguem as mesmas animações.
 */
export type OutfitId = 'male_ranger' | 'female_ranger' | 'male_peasant' | 'female_peasant';
export type HairId = 'none' | 'long' | 'buns' | 'buzzed' | 'parted' | 'beard' | 'buzzed_female';

const OUTFIT_FILES: Record<OutfitId, string> = {
  male_ranger: 'q_Male_Ranger.glb',
  female_ranger: 'q_Female_Ranger.glb',
  male_peasant: 'q_Male_Peasant.glb',
  female_peasant: 'q_Female_Peasant.glb',
};
const HAIR_FILES: Record<Exclude<HairId, 'none'>, string> = {
  long: 'q_Hair_Long.glb',
  buns: 'q_Hair_Buns.glb',
  buzzed: 'q_Hair_Buzzed.glb',
  parted: 'q_Hair_SimpleParted.glb',
  beard: 'q_Hair_Beard.glb',
  buzzed_female: 'q_Hair_BuzzedFemale.glb',
};
const HEAD_FILES = { male: 'q_Superhero_Male_FullBody.glb', female: 'q_Superhero_Female_FullBody.glb' } as const;

export const OUTFIT_GENDER: Record<OutfitId, 'male' | 'female'> = {
  male_ranger: 'male',
  female_ranger: 'female',
  male_peasant: 'male',
  female_peasant: 'female',
};

interface Part {
  source: THREE.SkinnedMesh;
  geometry: THREE.BufferGeometry;
}

interface Library {
  outfits: Map<OutfitId, THREE.Group>;
  heads: Map<'male' | 'female', Part[]>;
  hairs: Map<HairId, Part[]>;
  animations: THREE.AnimationClip[];
}

let library: Library | null = null;
let loading: Promise<Library | null> | null = null;

const BASE = '/models/characters/';

export function loadQuaternius(loader: GLTFLoader): Promise<Library | null> {
  loading ??= (async () => {
    try {
      const [anims, ...rest] = await Promise.all([
        loader.loadAsync(BASE + 'q_animations.glb'),
        ...Object.values(OUTFIT_FILES).map((f) => loader.loadAsync(BASE + f)),
      ]);
      const outfits = new Map<OutfitId, THREE.Group>();
      (Object.keys(OUTFIT_FILES) as OutfitId[]).forEach((id, i) => outfits.set(id, rest[i]!.scene));

      const heads = new Map<'male' | 'female', Part[]>();
      for (const gender of ['male', 'female'] as const) {
        const gltf = await loader.loadAsync(BASE + HEAD_FILES[gender]);
        const parts: Part[] = [];
        gltf.scene.traverse((child) => {
          const mesh = child as THREE.SkinnedMesh;
          if (!mesh.isSkinnedMesh) return;
          const isFace = /eye/i.test(mesh.name) || /eye/i.test(mesh.parent?.name ?? '') || /brow/i.test(mesh.name);
          parts.push({ source: mesh, geometry: isFace ? mesh.geometry : headOnly(mesh) });
        });
        heads.set(gender, parts);
      }

      const hairs = new Map<HairId, Part[]>();
      await Promise.all(
        (Object.entries(HAIR_FILES) as [Exclude<HairId, 'none'>, string][]).map(async ([id, file]) => {
          const gltf = await loader.loadAsync(BASE + file);
          const parts: Part[] = [];
          gltf.scene.traverse((child) => {
            const mesh = child as THREE.SkinnedMesh;
            if (mesh.isSkinnedMesh) parts.push({ source: mesh, geometry: mesh.geometry });
          });
          hairs.set(id, parts);
        }),
      );
      library = { outfits, heads, hairs, animations: anims.animations };
      return library;
    } catch (error) {
      console.warn('Personagens realistas indisponíveis; usando os modelos anteriores.', error);
      return null;
    }
  })();
  return loading;
}

export function quaterniusReady(): boolean {
  return library !== null;
}

export function quaterniusAnimations(): THREE.AnimationClip[] {
  return library?.animations ?? [];
}

/** Monta roupa + cabeça + cabelo num único personagem animável. */
export function assembleCharacter(outfit: OutfitId, hair: HairId, withHead = true): THREE.Object3D | null {
  if (!library) return null;
  const template = library.outfits.get(outfit);
  if (!template) return null;
  const model = SkeletonUtils.clone(template);
  const bones = new Map<string, THREE.Bone>();
  model.traverse((child) => {
    if ((child as THREE.Bone).isBone) bones.set(child.name, child as THREE.Bone);
  });
  const parts: Part[] = [];
  if (withHead) parts.push(...(library.heads.get(OUTFIT_GENDER[outfit]) ?? []));
  if (hair !== 'none') parts.push(...(library.hairs.get(hair) ?? []));
  for (const part of parts) {
    const mesh = rebind(part, bones);
    if (mesh) model.add(mesh);
  }
  return model;
}

/** Liga uma malha com esqueleto aos ossos (de mesmo nome) de outro personagem. */
function rebind(part: Part, bones: Map<string, THREE.Bone>): THREE.SkinnedMesh | null {
  const source = part.source;
  const fallback = bones.get('Head') ?? bones.values().next().value;
  if (!fallback) return null;
  const mapped = source.skeleton.bones.map((b) => bones.get(b.name) ?? fallback);
  const skeleton = new THREE.Skeleton(
    mapped,
    source.skeleton.boneInverses.map((m) => m.clone()),
  );
  const material = Array.isArray(source.material) ? source.material.map((m) => m.clone()) : source.material.clone();
  const mesh = new THREE.SkinnedMesh(part.geometry, material);
  mesh.name = source.name;
  mesh.bind(skeleton, source.bindMatrix.clone());
  mesh.frustumCulled = false;
  return mesh;
}

/** Só os triângulos da cabeça e do pescoço do corpo base (o resto vem da roupa). */
function headOnly(mesh: THREE.SkinnedMesh): THREE.BufferGeometry {
  const keep = new Set<number>();
  mesh.skeleton.bones.forEach((bone, i) => {
    if (bone.name === 'Head' || bone.name === 'neck_01') keep.add(i);
  });
  const geometry = mesh.geometry;
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const dominant = (v: number): number => {
    let best = -1;
    let weight = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(v, k);
      if (w > weight) {
        weight = w;
        best = skinIndex.getComponent(v, k);
      }
    }
    return best;
  };
  const source = geometry.index;
  const count = source ? source.count : geometry.getAttribute('position').count;
  const indices: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const a = source ? source.getX(i) : i;
    const b = source ? source.getX(i + 1) : i + 1;
    const c = source ? source.getX(i + 2) : i + 2;
    if (keep.has(dominant(a)) && keep.has(dominant(b)) && keep.has(dominant(c))) indices.push(a, b, c);
  }
  const head = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) head.setAttribute(name, attribute);
  head.setIndex(indices);
  return head;
}
