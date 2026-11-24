import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pbr, worldBox, type MaterialKey } from '../materials/library';

/**
 * Geometrias e materiais compartilhados (item 23: geometrias reutilizáveis).
 * Cada combinação de parâmetros é criada uma única vez e reaproveitada.
 */
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.Material>();

export function boxGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  let g = geometries.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geometries.set(key, g);
  }
  return g;
}

export function cylinderGeometry(rTop: number, rBottom: number, h: number, segments = 24, open = false): THREE.BufferGeometry {
  const key = `c:${rTop.toFixed(3)}:${rBottom.toFixed(3)}:${h.toFixed(3)}:${segments}:${open}`;
  let g = geometries.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open);
    geometries.set(key, g);
  }
  return g;
}

export function sphereGeometry(r: number, detail = 3): THREE.BufferGeometry {
  const key = `s:${r.toFixed(3)}:${detail}`;
  let g = geometries.get(key);
  if (!g) {
    g = new THREE.IcosahedronGeometry(r, detail);
    geometries.set(key, g);
  }
  return g;
}

export function torusGeometry(r: number, tube: number): THREE.BufferGeometry {
  const key = `t:${r.toFixed(3)}:${tube.toFixed(3)}`;
  let g = geometries.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, 8, 32);
    geometries.set(key, g);
  }
  return g;
}

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

export function material(color: string, options: MaterialOptions = {}): THREE.Material {
  const key = `${color}|${JSON.stringify(options)}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.75,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? '#000000',
      emissiveIntensity: options.emissiveIntensity ?? 1,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
    });
    materials.set(key, m);
  }
  return m;
}

export function roundedBoxGeometry(w: number, h: number, d: number, radius: number): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const key = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
  let g = geometries.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, r));
    geometries.set(key, g);
  }
  return g;
}

/** Cor ("#rrggbb"), material pronto ou chave da biblioteca PBR ("wood.light"). */
export type Paint = string | THREE.Material;

function resolve(paint: Paint, options?: MaterialOptions): THREE.Material {
  if (typeof paint !== 'string') return paint;
  if (paint.startsWith('#')) return material(paint, options);
  return pbr(paint as MaterialKey);
}

/** Ajuda a montar modelos: posições informadas pela BASE de cada peça. */
export class ModelBuilder {
  readonly group = new THREE.Group();

  /** Caixa reta; com material da biblioteca, usa UVs em metros. */
  box(w: number, h: number, d: number, color: Paint, x = 0, y = 0, z = 0, options?: MaterialOptions): THREE.Mesh {
    const textured = typeof color === 'string' && !color.startsWith('#');
    return this.add(textured ? worldBox(w, h, d) : boxGeometry(w, h, d), color, x, y + h / 2, z, options);
  }

  /** Caixa com cantos arredondados (aparência menos "quadrada"). */
  rbox(w: number, h: number, d: number, radius: number, color: Paint, x = 0, y = 0, z = 0, options?: MaterialOptions): THREE.Mesh {
    return this.add(roundedBoxGeometry(w, h, d, radius), color, x, y + h / 2, z, options);
  }

  cyl(rTop: number, rBottom: number, h: number, color: Paint, x = 0, y = 0, z = 0, segments = 24, options?: MaterialOptions): THREE.Mesh {
    return this.add(cylinderGeometry(rTop, rBottom, h, segments), color, x, y + h / 2, z, options);
  }

  sphere(r: number, color: Paint, x = 0, y = 0, z = 0, options?: MaterialOptions): THREE.Mesh {
    return this.add(sphereGeometry(r), color, x, y, z, options);
  }

  add(geometry: THREE.BufferGeometry, color: Paint, x: number, y: number, z: number, options?: MaterialOptions): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, resolve(color, options));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }
}

/** Textura desenhada em canvas (telas, teclados, mostradores), criada uma vez. */
const canvasTextures = new Map<string, THREE.CanvasTexture>();
export function canvasTexture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let texture = canvasTextures.get(key);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d')!);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    canvasTextures.set(key, texture);
  }
  return texture;
}

const texturedMaterials = new Map<string, THREE.Material>();
export function texturedMaterial(key: string, texture: THREE.Texture, options: MaterialOptions = {}): THREE.Material {
  let m = texturedMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: options.roughness ?? 0.5,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ? new THREE.Color(options.emissive) : new THREE.Color('#000000'),
      emissiveMap: options.emissive ? texture : null,
      emissiveIntensity: options.emissiveIntensity ?? 1,
    });
    texturedMaterials.set(key, m);
  }
  return m;
}
