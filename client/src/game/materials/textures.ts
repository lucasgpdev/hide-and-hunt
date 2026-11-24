import * as THREE from 'three';

/**
 * Texturas PBR geradas por código (sem arquivos externos): cor, rugosidade e
 * relevo (normal map) para pisos, paredes, madeira, metal, tecido e papelão.
 * Cada textura é gerada uma vez e reutilizada.
 */

const SIZE = 512;

export interface TextureSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

type Painter = (ctx: CanvasRenderingContext2D, height: Float32Array, rough: Float32Array, rand: () => number) => void;

const cache = new Map<string, TextureSet>();
let maxAnisotropy = 8;

export function setMaxAnisotropy(value: number): void {
  maxAnisotropy = value;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruído suave (value noise) com várias oitavas, repetível nas bordas. */
function makeNoise(rand: () => number, cells: number): (x: number, y: number) => number {
  const grid = new Float32Array(cells * cells).map(() => rand());
  const at = (x: number, y: number) => grid[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)]!;
  return (x: number, y: number) => {
    const gx = x * cells;
    const gy = y * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export function fbm(rand: () => number, octaves = 4, base = 4): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(rand, base * 2 ** i));
  return (x, y) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const layer of layers) {
      sum += layer(x, y) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

function build(key: string, painter: Painter, seed: number): TextureSet {
  const cached = cache.get(key);
  if (cached) return cached;

  const color = document.createElement('canvas');
  color.width = color.height = SIZE;
  const ctx = color.getContext('2d')!;
  const height = new Float32Array(SIZE * SIZE).fill(0.5);
  const rough = new Float32Array(SIZE * SIZE).fill(0.7);
  painter(ctx, height, rough, mulberry32(seed));

  const set: TextureSet = {
    map: finish(new THREE.CanvasTexture(color), true),
    roughnessMap: finish(dataTexture(rough, (v) => [v * 255, v * 255, v * 255]), false),
    normalMap: finish(normalFromHeight(height), false),
  };
  cache.set(key, set);
  return set;
}

function finish(texture: THREE.Texture, srgb: boolean): THREE.Texture {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function dataTexture(values: Float32Array, toRgb: (v: number) => [number, number, number]): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < values.length; i++) {
    const [r, g, b] = toRgb(values[i]!);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function normalFromHeight(height: Float32Array, strength = 3): THREE.Texture {
  const normals = new Float32Array(SIZE * SIZE * 3);
  const h = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 3;
      normals[i] = -dx / len;
      normals[i + 1] = dy / len;
      normals[i + 2] = 1 / len;
    }
  }
  let index = 0;
  return dataTexture(new Float32Array(SIZE * SIZE), () => {
    const i = index++ * 3;
    return [(normals[i]! * 0.5 + 0.5) * 255, (normals[i + 1]! * 0.5 + 0.5) * 255, (normals[i + 2]! * 0.5 + 0.5) * 255];
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

/** Preenche cor pixel a pixel a partir de uma função. */
function paint(ctx: CanvasRenderingContext2D, fn: (x: number, y: number, i: number) => [number, number, number]): void {
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const [r, g, b] = fn(x / SIZE, y / SIZE, i);
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

const clamp = (v: number) => Math.max(0, Math.min(255, v));

// ---------------------------------------------------------------------------

/** Piso de cerâmica/porcelanato com rejunte. `tiles` = peças por textura. */
export function tileTexture(base: string, grout: string, tiles = 4, seed = 1): TextureSet {
  return build(`tile:${base}:${grout}:${tiles}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 4, 6);
    const [br, bg, bb] = hexToRgb(base);
    const [gr, gg, gb] = hexToRgb(grout);
    const variation = Array.from({ length: tiles * tiles }, () => (rand() - 0.5) * 18);
    paint(ctx, (u, v, i) => {
      const tx = u * tiles;
      const ty = v * tiles;
      const fx = tx - Math.floor(tx);
      const fy = ty - Math.floor(ty);
      const edge = Math.min(fx, fy, 1 - fx, 1 - fy);
      const isGrout = edge < 0.012;
      const n = noise(u, v);
      if (isGrout) {
        height[i] = 0.2;
        rough[i] = 0.95;
        return [gr + n * 10, gg + n * 10, gb + n * 10];
      }
      const tile = Math.floor(ty) * tiles + Math.floor(tx);
      const d = variation[tile]! + (n - 0.5) * 22;
      height[i] = 0.6 + n * 0.05 - (edge < 0.03 ? (0.03 - edge) * 6 : 0);
      rough[i] = 0.25 + n * 0.25;
      return [clamp(br + d), clamp(bg + d), clamp(bb + d)];
    });
  }, seed);
}

/** Concreto/cimento queimado. */
export function concreteTexture(base: string, seed = 2): TextureSet {
  return build(`concrete:${base}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 5, 3);
    const speck = makeNoise(rand, 128);
    const [r, g, b] = hexToRgb(base);
    paint(ctx, (u, v, i) => {
      const n = noise(u, v);
      const s = speck(u, v);
      const d = (n - 0.5) * 40 + (s > 0.85 ? -25 : 0);
      height[i] = n * 0.6 + s * 0.15;
      rough[i] = 0.75 + n * 0.2;
      return [clamp(r + d), clamp(g + d), clamp(b + d)];
    });
  }, seed);
}

/** Parede pintada (textura leve, quase lisa). */
export function paintTexture(base: string, seed = 3): TextureSet {
  return build(`paint:${base}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 4, 16);
    const [r, g, b] = hexToRgb(base);
    paint(ctx, (u, v, i) => {
      const n = noise(u, v);
      const d = (n - 0.5) * 12;
      height[i] = n * 0.25;
      rough[i] = 0.85;
      return [clamp(r + d), clamp(g + d), clamp(b + d)];
    });
  }, seed);
}

/** Madeira com veios (tábuas). */
export function woodTexture(base: string, planks = 4, seed = 4): TextureSet {
  return build(`wood:${base}:${planks}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 4, 4);
    const [r, g, b] = hexToRgb(base);
    const offsets = Array.from({ length: planks }, () => rand() * 10);
    paint(ctx, (u, v, i) => {
      const plank = Math.floor(v * planks);
      const pv = v * planks - plank;
      const grain = Math.sin((u * 18 + offsets[plank]! + noise(u * 0.5, v) * 6) * Math.PI) * 0.5 + 0.5;
      const ring = Math.pow(grain, 3);
      const seam = pv < 0.02 || pv > 0.98;
      const d = (ring - 0.5) * 30 + (noise(u, v) - 0.5) * 20 + (offsets[plank]! - 5) * 2;
      height[i] = seam ? 0.1 : 0.5 + ring * 0.1;
      rough[i] = seam ? 0.9 : 0.55 + ring * 0.15;
      const f = seam ? 0.55 : 1;
      return [clamp((r + d) * f), clamp((g + d * 0.8) * f), clamp((b + d * 0.6) * f)];
    });
  }, seed);
}

/** Metal escovado. */
export function metalTexture(base: string, seed = 5): TextureSet {
  return build(`metal:${base}`, (ctx, height, rough, rand) => {
    const lines = makeNoise(rand, 256);
    const noise = fbm(rand, 3, 4);
    const [r, g, b] = hexToRgb(base);
    paint(ctx, (u, v, i) => {
      const l = lines(u * 0.02, v);
      const d = (l - 0.5) * 25 + (noise(u, v) - 0.5) * 10;
      height[i] = l * 0.15;
      rough[i] = 0.3 + l * 0.15;
      return [clamp(r + d), clamp(g + d), clamp(b + d)];
    });
  }, seed);
}

/** Tecido (trama). */
export function fabricTexture(base: string, seed = 6): TextureSet {
  return build(`fabric:${base}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 3, 8);
    const [r, g, b] = hexToRgb(base);
    paint(ctx, (u, v, i) => {
      const weave = (Math.sin(u * SIZE * 0.8) * Math.sin(v * SIZE * 0.8)) * 0.5 + 0.5;
      const d = (weave - 0.5) * 22 + (noise(u, v) - 0.5) * 18;
      height[i] = weave * 0.5;
      rough[i] = 0.95;
      return [clamp(r + d), clamp(g + d), clamp(b + d)];
    });
  }, seed);
}

/** Papelão ondulado com fita. */
export function cardboardTexture(seed = 7): TextureSet {
  return build('cardboard', (ctx, height, rough, rand) => {
    const noise = fbm(rand, 4, 6);
    paint(ctx, (u, v, i) => {
      const n = noise(u, v);
      const tape = Math.abs(u - 0.5) < 0.07;
      const flute = Math.sin(v * SIZE * 0.25) * 0.5 + 0.5;
      height[i] = tape ? 0.55 : 0.45 + flute * 0.04;
      rough[i] = tape ? 0.35 : 0.9;
      if (tape) return [196 + n * 20, 170 + n * 20, 120 + n * 15];
      const d = (n - 0.5) * 30;
      return [clamp(168 + d), clamp(128 + d), clamp(84 + d)];
    });
  }, seed);
}

/** Vinil/piso escolar com pequenas manchas. */
export function vinylTexture(base: string, seed = 8): TextureSet {
  return build(`vinyl:${base}`, (ctx, height, rough, rand) => {
    const noise = fbm(rand, 4, 5);
    const speck = makeNoise(rand, 200);
    const [r, g, b] = hexToRgb(base);
    paint(ctx, (u, v, i) => {
      const s = speck(u, v);
      const n = noise(u, v);
      const d = (n - 0.5) * 14 + (s > 0.8 ? 30 : s < 0.15 ? -30 : 0);
      height[i] = 0.5 + n * 0.05;
      rough[i] = 0.4 + n * 0.2;
      return [clamp(r + d), clamp(g + d), clamp(b + d)];
    });
  }, seed);
}

/** Textura macia para fumaça/partículas. */
let smoke: THREE.Texture | null = null;
export function smokeTexture(): THREE.Texture {
  if (smoke) return smoke;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  smoke = new THREE.CanvasTexture(canvas);
  smoke.colorSpace = THREE.SRGBColorSpace;
  return smoke;
}
