import * as THREE from 'three';
import {
  cardboardTexture,
  concreteTexture,
  fabricTexture,
  metalTexture,
  paintTexture,
  tileTexture,
  vinylTexture,
  woodTexture,
  type TextureSet,
} from './textures';

/**
 * Biblioteca de materiais PBR com nomes (ex.: "floor.tiles", "wood.light").
 * As UVs das superfícies estão em metros; `meters` diz quantos metros uma
 * repetição da textura cobre.
 */
export type MaterialKey =
  | 'floor.tiles'
  | 'floor.tilesDark'
  | 'floor.vinyl'
  | 'floor.concrete'
  | 'floor.wood'
  | 'floor.carpet'
  | 'floor.marble'
  | 'floor.asphalt'
  | 'floor.grass'
  | 'wall.paint'
  | 'wall.paintWarm'
  | 'wall.tiles'
  | 'ceiling'
  | 'wood.light'
  | 'wood.dark'
  | 'metal.steel'
  | 'metal.dark'
  | 'metal.painted'
  | 'plastic.white'
  | 'plastic.dark'
  | 'fabric.blue'
  | 'fabric.gray'
  | 'fabric.red'
  | 'cardboard'
  | 'glass';

interface Spec {
  set?: () => TextureSet;
  meters?: number;
  color?: string;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  transparent?: boolean;
  opacity?: number;
}

const SPECS: Record<MaterialKey, Spec> = {
  'floor.tiles': { set: () => tileTexture('#e9e6df', '#9b968c', 4), meters: 2.4, normalScale: 0.6 },
  'floor.tilesDark': { set: () => tileTexture('#5d5f63', '#2c2d30', 4, 11), meters: 2.4, normalScale: 0.6 },
  'floor.vinyl': { set: () => vinylTexture('#b7ab95'), meters: 3 },
  'floor.concrete': { set: () => concreteTexture('#8d8b86'), meters: 4 },
  'floor.wood': { set: () => woodTexture('#9c6f45', 6, 21), meters: 2.5 },
  'floor.carpet': { set: () => fabricTexture('#5a4a4e', 22), meters: 1.5, roughness: 1 },
  'floor.marble': { set: () => tileTexture('#d6d0c6', '#b9b2a6', 2, 23), meters: 2.4, normalScale: 0.35, roughness: 0.25 },
  'floor.asphalt': { set: () => concreteTexture('#45474b', 24), meters: 5, roughness: 0.95 },
  'floor.grass': { set: () => fabricTexture('#4c7436', 25), meters: 1.2, roughness: 1, normalScale: 1.2 },
  'wall.paint': { set: () => paintTexture('#e4e0d6'), meters: 3, normalScale: 0.3 },
  'wall.paintWarm': { set: () => paintTexture('#e8d9bd', 31), meters: 3, normalScale: 0.3 },
  'wall.tiles': { set: () => tileTexture('#f2f1ec', '#c5c2ba', 8, 12), meters: 1.6, normalScale: 0.5 },
  ceiling: { set: () => paintTexture('#d8d6d0', 33), meters: 2, normalScale: 0.4 },
  'wood.light': { set: () => woodTexture('#b48a5c', 4, 41), meters: 1.2 },
  'wood.dark': { set: () => woodTexture('#6b4a2f', 4, 42), meters: 1.2 },
  'metal.steel': { set: () => metalTexture('#b9bec5'), meters: 1, metalness: 0.85 },
  'metal.dark': { set: () => metalTexture('#4a4f57', 52), meters: 1, metalness: 0.7 },
  'metal.painted': { set: () => metalTexture('#8f979f', 53), meters: 1, metalness: 0.25 },
  'plastic.white': { color: '#e8e6e1', roughness: 0.45 },
  'plastic.dark': { color: '#23262b', roughness: 0.4 },
  'fabric.blue': { set: () => fabricTexture('#3d5b8a', 61), meters: 0.6 },
  'fabric.gray': { set: () => fabricTexture('#6e737b', 62), meters: 0.6 },
  'fabric.red': { set: () => fabricTexture('#9e3434', 63), meters: 0.6 },
  cardboard: { set: () => cardboardTexture(), meters: 0.6 },
  glass: { color: '#b9dcf2', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 },
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Material PBR nomeado (compartilhado). `tint` multiplica a cor. */
export function pbr(key: MaterialKey, tint?: string): THREE.MeshStandardMaterial {
  const cacheKey = tint ? `${key}|${tint}` : key;
  const cached = materials.get(cacheKey);
  if (cached) return cached;
  const spec = SPECS[key];
  const material = new THREE.MeshStandardMaterial({
    color: tint ?? spec.color ?? '#ffffff',
    roughness: spec.roughness ?? 1,
    metalness: spec.metalness ?? 0,
    transparent: spec.transparent ?? false,
    opacity: spec.opacity ?? 1,
  });
  if (spec.set) {
    const set = spec.set();
    const repeat = 1 / (spec.meters ?? 1);
    material.map = withRepeat(set.map, repeat);
    material.roughnessMap = withRepeat(set.roughnessMap, repeat);
    material.normalMap = withRepeat(set.normalMap, repeat);
    const n = spec.normalScale ?? 1;
    material.normalScale.set(n, n);
  }
  material.name = cacheKey;
  materials.set(cacheKey, material);
  return material;
}

function withRepeat(texture: THREE.Texture, repeat: number): THREE.Texture {
  const clone = texture.clone();
  clone.repeat.set(repeat, repeat);
  clone.needsUpdate = true;
  return clone;
}

/** Caixa com UVs em metros em todas as faces (texturas não esticam). */
const boxCache = new Map<string, THREE.BufferGeometry>();
export function worldBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  const cached = boxCache.get(key);
  if (cached) return cached;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  // Ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada).
  const faceSize: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = faceSize[face]!;
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  boxCache.set(key, geometry);
  return geometry;
}
