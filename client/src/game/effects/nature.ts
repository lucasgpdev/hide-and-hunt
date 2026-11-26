import * as THREE from 'three';

/**
 * Natureza viva: vento nas folhas (deslocamento no shader, sem custo de CPU) e
 * tufos de grama com flores espalhados nas áreas de grama, em instâncias.
 */
export const wind = { time: { value: 0 } };

/** Faz o material balançar com o vento: mais forte no alto e nas pontas. */
export function addWind(material: THREE.Material, strength = 1): void {
  if (material.userData.wind) return;
  material.userData.wind = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.windTime = wind.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float windTime;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #endif
          float h = max(position.y, 0.0);
          float sway = ${strength.toFixed(2)} * h * 0.035;
          float phase = wp.x * 0.35 + wp.z * 0.27;
          transformed.x += sway * (sin(windTime * 1.3 + phase) + 0.4 * sin(windTime * 3.1 + phase * 2.3));
          transformed.z += sway * 0.6 * cos(windTime * 1.1 + phase * 1.4);
        }`,
      );
  };
  material.customProgramCacheKey = () => `wind${strength}`;
  material.needsUpdate = true;
}

/** Textura do tufo: folhas finas de grama e, em algumas variações, flores. */
function tuftTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W * 4;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const flowers = ['#f4f1e8', '#f6d34a', '#d9a3e6', '#ffffff'];
  for (let cell = 0; cell < 4; cell++) {
    const ox = cell * W;
    for (let i = 0; i < 46; i++) {
      const x = ox + 20 + rnd() * (W - 40);
      const h = H * (0.45 + rnd() * 0.5);
      const lean = (rnd() - 0.5) * 40;
      const g = 120 + rnd() * 75;
      ctx.strokeStyle = `rgb(${Math.round(g * 0.62)}, ${Math.round(g)}, ${Math.round(g * 0.38)})`;
      ctx.lineWidth = 2 + rnd() * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
      ctx.stroke();
    }
    // células 2 e 3 têm flores
    if (cell >= 2) {
      for (let i = 0; i < 7; i++) {
        const x = ox + 30 + rnd() * (W - 60);
        const y = H * (0.15 + rnd() * 0.35);
        ctx.fillStyle = flowers[(i + cell) % flowers.length]!;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e0a020';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let tuftMaterial: THREE.MeshStandardMaterial | null = null;
function getTuftMaterial(): THREE.MeshStandardMaterial {
  if (!tuftMaterial) {
    tuftMaterial = new THREE.MeshStandardMaterial({
      map: tuftTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0,
    });
    addWind(tuftMaterial, 2.2);
  }
  return tuftMaterial;
}

/** Duas cartas cruzadas; a coordenada de textura escolhe uma das 4 variações por instância. */
function tuftGeometry(variant: number): THREE.BufferGeometry {
  const w = 0.42;
  const h = 0.2;
  const u0 = variant / 4;
  const u1 = (variant + 1) / 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (let k = 0; k < 2; k++) {
    const a = (k * Math.PI) / 2 + 0.4;
    const dx = (Math.cos(a) * w) / 2;
    const dz = (Math.sin(a) * w) / 2;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz);
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1);
    // normal para cima: a grama fica iluminada como o chão, sem lado escuro
    for (let v = 0; v < 4; v++) normals.push(0, 1, 0);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

let tuftGeometries: THREE.BufferGeometry[] | null = null;

/**
 * Espalha tufos dentro de `area` (x0, z0, x1, z1), fora dos retângulos de
 * `avoid`. Dividido em blocos de 12 m para o three descartar o que está fora
 * da tela.
 */
export function createGrassField(
  area: [number, number, number, number],
  avoid: [number, number, number, number][],
  density: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'grass-field';
  const material = getTuftMaterial();
  tuftGeometries ??= [0, 1, 2, 3].map(tuftGeometry);
  const geometries = tuftGeometries;
  const [x0, z0, x1, z1] = area;
  const chunk = 12;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const blocked = (x: number, z: number) => avoid.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
  for (let cx = x0; cx < x1; cx += chunk) {
    for (let cz = z0; cz < z1; cz += chunk) {
      const w = Math.min(chunk, x1 - cx);
      const d = Math.min(chunk, z1 - cz);
      const count = Math.round(w * d * density);
      const buckets: THREE.Matrix4[][] = [[], [], [], []];
      for (let i = 0; i < count; i++) {
        const x = cx + rnd() * w;
        const z = cz + rnd() * d;
        if (blocked(x, z)) continue;
        const r = rnd();
        // 88% só grama, o resto com flores
        const variant = r < 0.44 ? 0 : r < 0.88 ? 1 : r < 0.94 ? 2 : 3;
        quat.setFromAxisAngle(up, rnd() * Math.PI * 2);
        const s = 0.7 + rnd() * 0.5;
        scale.set(s, s * (0.75 + rnd() * 0.45), s);
        pos.set(x, -0.03, z);
        buckets[variant]!.push(matrix.compose(pos, quat, scale).clone());
      }
      buckets.forEach((list, variant) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geometries[variant]!, material, list.length);
        list.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.raycast = () => {};
        group.add(mesh);
      });
    }
  }
  group.userData.dispose = () => group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
  return group;
}
