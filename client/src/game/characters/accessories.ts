import * as THREE from 'three';
import type { AccessoryLook } from '@hh/shared';

/**
 * Acessórios originais das skins, feitos por código (nenhum vem de outro jogo).
 * Cada um é montado em metros, com a origem no centro da cabeça, +Z para a
 * frente do rosto e +Y para cima. `size` é a altura da cabeça do personagem.
 */

const textureCache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 256): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

const std = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params);

/** Rosto pintado da máscara de porcelana: olhos vazados e sorriso costurado. */
function porcelainFace(): THREE.CanvasTexture {
  return canvasTexture('porcelain', (ctx, s) => {
    const g = ctx.createRadialGradient(s * 0.5, s * 0.45, s * 0.05, s * 0.5, s * 0.5, s * 0.6);
    g.addColorStop(0, '#f6f1e8');
    g.addColorStop(1, '#d9d0c2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // Fissuras finas.
    ctx.strokeStyle = 'rgba(90,80,70,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s * 0.62, s * 0.08);
    ctx.lineTo(s * 0.58, s * 0.22);
    ctx.lineTo(s * 0.66, s * 0.3);
    ctx.stroke();
    // Olhos vazados com sombra.
    for (const x of [0.36, 0.64]) {
      ctx.fillStyle = '#0c0b0b';
      ctx.beginPath();
      ctx.ellipse(s * x, s * 0.42, s * 0.075, s * 0.05, x < 0.5 ? -0.2 : 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,20,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s * x, s * 0.48);
      ctx.lineTo(s * (x + (x < 0.5 ? -0.01 : 0.01)), s * 0.6);
      ctx.stroke();
    }
    // Bochechas rosadas.
    for (const x of [0.28, 0.72]) {
      const r = ctx.createRadialGradient(s * x, s * 0.6, 1, s * x, s * 0.6, s * 0.09);
      r.addColorStop(0, 'rgba(210,70,80,0.55)');
      r.addColorStop(1, 'rgba(210,70,80,0)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, s, s);
    }
    // Sorriso largo e costurado.
    ctx.strokeStyle = '#7a1018';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.68);
    ctx.quadraticCurveTo(s * 0.5, s * 0.86, s * 0.72, s * 0.68);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = s * (0.28 + t * 0.44);
      const y = s * (0.68 + Math.sin(t * Math.PI) * 0.09);
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();
    }
  });
}

/** Rosto entalhado da abóbora (a luz interna aparece pelos cortes). */
function pumpkinFace(): THREE.CanvasTexture {
  return canvasTexture('pumpkin-face', (ctx, s) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fff';
    const tri = (cx: number, cy: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy + h / 2);
      ctx.lineTo(cx + w / 2, cy + h / 2);
      ctx.lineTo(cx, cy - h / 2);
      ctx.fill();
    };
    tri(s * 0.37, s * 0.38, s * 0.14, s * 0.12);
    tri(s * 0.63, s * 0.38, s * 0.14, s * 0.12);
    tri(s * 0.5, s * 0.52, s * 0.07, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(s * 0.26, s * 0.62);
    const teeth = [0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68];
    teeth.forEach((x, i) => ctx.lineTo(s * x, s * (i % 2 ? 0.66 : 0.71)));
    ctx.lineTo(s * 0.74, s * 0.62);
    ctx.quadraticCurveTo(s * 0.5, s * 0.86, s * 0.26, s * 0.62);
    ctx.fill();
  });
}

function stitchedMouth(): THREE.CanvasTexture {
  return canvasTexture('bunny-face', (ctx, s) => {
    ctx.fillStyle = '#ddd2d4';
    ctx.fillRect(0, 0, s, s);
    // Pelagem manchada.
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${120 + Math.random() * 40},${100 + Math.random() * 30},${105 + Math.random() * 30},0.08)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 6);
    }
    ctx.fillStyle = 'rgba(70,40,40,0.25)';
    ctx.beginPath();
    ctx.ellipse(s * 0.58, s * 0.3, s * 0.08, s * 0.05, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a1f22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s * 0.38, s * 0.66);
    ctx.lineTo(s * 0.62, s * 0.66);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = s * (0.4 + i * 0.04);
      ctx.beginPath();
      ctx.moveTo(x, s * 0.62);
      ctx.lineTo(x, s * 0.7);
      ctx.stroke();
    }
    ctx.fillStyle = '#c86a7a';
    ctx.beginPath();
    ctx.moveTo(s * 0.46, s * 0.54);
    ctx.lineTo(s * 0.54, s * 0.54);
    ctx.lineTo(s * 0.5, s * 0.59);
    ctx.fill();
  });
}

export interface AccessoryResult {
  object: THREE.Object3D;
  /** Esconde a cabeça e o cabelo originais (máscaras que cobrem tudo). */
  hidesHead?: boolean;
  /** Preso às costas em vez da cabeça. */
  onBack?: boolean;
}

export function createAccessory(kind: AccessoryLook, size: number, glow: string): AccessoryResult | null {
  const k = size / 0.26; // tudo desenhado para uma cabeça de 26 cm
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x * k, y * k, z * k);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  switch (kind) {
    case 'porcelain_mask': {
      const geometry = new THREE.SphereGeometry(0.118 * k, 40, 24, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.12, Math.PI * 0.62);
      geometry.rotateY(Math.PI / 2);
      geometry.scale(0.92, 1.12, 0.78);
      add(geometry, std({ map: porcelainFace(), roughness: 0.18, metalness: 0.02 }), 0, 0.005, 0.035);
      return { object: group };
    }
    case 'clown_nose':
      add(new THREE.SphereGeometry(0.024 * k, 24, 16), std({ color: '#c3121d', roughness: 0.15, metalness: 0.05 }), 0, -0.005, 0.128);
      return { object: group };
    case 'top_hat': {
      const fabric = std({ color: '#141416', roughness: 0.75 });
      add(new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.012 * k, 36), fabric, 0, 0.125, -0.005);
      add(new THREE.CylinderGeometry(0.1 * k, 0.105 * k, 0.2 * k, 36), fabric, 0, 0.23, -0.005);
      add(new THREE.CylinderGeometry(0.107 * k, 0.107 * k, 0.03 * k, 36), std({ color: '#7d1119', roughness: 0.5 }), 0, 0.15, -0.005);
      group.rotation.z = 0.12;
      return { object: group };
    }
    case 'rabbit_head': {
      const fur = std({ map: stitchedMouth(), roughness: 0.92 });
      const head = new THREE.SphereGeometry(0.14 * k, 40, 30);
      head.rotateY(-Math.PI / 2);
      head.scale(0.95, 1.05, 1.0);
      add(head, fur, 0, 0.01, 0.01);
      const earMat = std({ color: '#cfc2c4', roughness: 0.9 });
      const inner = std({ color: '#c98d98', roughness: 0.85 });
      for (const side of [-1, 1]) {
        const ear = new THREE.CapsuleGeometry(0.032 * k, 0.2 * k, 6, 14);
        ear.scale(1, 1, 0.45);
        const m = add(ear, earMat, side * 0.06, 0.24, -0.01);
        m.rotation.z = -side * (side > 0 ? 0.35 : 0.12);
        const innerEar = add(new THREE.CapsuleGeometry(0.018 * k, 0.15 * k, 6, 10), inner, side * 0.06, 0.24, 0.006);
        innerEar.scale.z = 0.3;
        innerEar.rotation.z = m.rotation.z;
      }
      for (const side of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.026 * k, 0.026 * k, 0.012 * k, 20), std({ color: '#0c0c0d', roughness: 0.25 }), side * 0.05, 0.035, 0.128).rotation.x = Math.PI / 2;
      }
      return { object: group, hidesHead: true };
    }
    case 'pumpkin_head': {
      const geometry = new THREE.SphereGeometry(0.16 * k, 48, 32);
      const pos = geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const angle = Math.atan2(z, x);
        const ribs = 1 + 0.06 * Math.abs(Math.sin(angle * 5));
        pos.setXYZ(i, x * ribs, y * 0.82, z * ribs);
      }
      geometry.computeVertexNormals();
      const face = pumpkinFace();
      // A face entalhada brilha (mapa emissivo) e o resto é a casca da abóbora.
      add(
        geometry,
        std({ color: '#d4631a', roughness: 0.55, emissive: new THREE.Color(glow), emissiveMap: face, emissiveIntensity: 2.4 }),
        0,
        0.02,
        0.01,
      );
      geometry.rotateY(-Math.PI / 2);
      add(new THREE.CylinderGeometry(0.012 * k, 0.02 * k, 0.07 * k, 10), std({ color: '#4b5a26', roughness: 0.8 }), 0.01, 0.17, 0).rotation.z = 0.3;
      const light = new THREE.PointLight(glow, 0.6, 2.2, 2);
      light.position.set(0, 0.02 * k, 0.1 * k);
      group.add(light);
      return { object: group, hidesHead: true };
    }
    case 'headphones': {
      const band = new THREE.TorusGeometry(0.125 * k, 0.012 * k, 10, 40, Math.PI);
      add(band, std({ color: '#1a1a1e', roughness: 0.4, metalness: 0.4 }), 0, 0.005, -0.005);
      for (const side of [-1, 1]) {
        const cup = add(new THREE.CylinderGeometry(0.045 * k, 0.045 * k, 0.035 * k, 28), std({ color: '#202026', roughness: 0.35 }), side * 0.125, -0.01, 0);
        cup.rotation.z = Math.PI / 2;
        const ring = add(new THREE.TorusGeometry(0.042 * k, 0.006 * k, 8, 28), std({ color: glow, emissive: glow, emissiveIntensity: 3 }), side * 0.143, -0.01, 0);
        ring.rotation.y = Math.PI / 2;
      }
      return { object: group };
    }
    case 'domino_mask': {
      const geometry = new THREE.CylinderGeometry(0.112 * k, 0.112 * k, 0.045 * k, 40, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
      add(geometry, std({ color: '#121318', roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }), 0, 0.035, 0.012);
      for (const side of [-1, 1]) {
        add(new THREE.SphereGeometry(0.01 * k, 10, 8), std({ color: glow, emissive: glow, emissiveIntensity: 2.5 }), side * 0.045, 0.035, 0.118);
      }
      return { object: group };
    }
    case 'gas_mask': {
      const rubber = std({ color: '#26231f', roughness: 0.7 });
      const mask = new THREE.SphereGeometry(0.12 * k, 32, 20, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.2, Math.PI * 0.6);
      mask.rotateY(Math.PI / 2);
      add(mask, rubber, 0, -0.005, 0.03);
      const snout = add(new THREE.CylinderGeometry(0.035 * k, 0.045 * k, 0.07 * k, 20), rubber, 0, -0.045, 0.14);
      snout.rotation.x = Math.PI / 2 - 0.4;
      const filterMat = std({ color: '#6b6250', roughness: 0.5, metalness: 0.5 });
      const filter = add(new THREE.CylinderGeometry(0.04 * k, 0.04 * k, 0.05 * k, 20), filterMat, 0, -0.07, 0.18);
      filter.rotation.x = Math.PI / 2 - 0.4;
      for (const side of [-1, 1]) {
        const lens = add(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 0.012 * k, 24), std({ color: '#1b2a26', roughness: 0.05, metalness: 0.6 }), side * 0.045, 0.03, 0.118);
        lens.rotation.x = Math.PI / 2;
        const rim = add(new THREE.TorusGeometry(0.031 * k, 0.005 * k, 8, 24), filterMat, side * 0.045, 0.03, 0.123);
        rim.rotation.y = 0;
      }
      return { object: group };
    }
    case 'cape': {
      // Capa afunilada: estreita nos ombros, mais larga e esfarrapada na barra.
      const length = 1.08 * k;
      const geometry = new THREE.PlaneGeometry(1, length, 10, 16);
      geometry.translate(0, -length / 2, 0);
      const pos = geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i); // -0.5..0.5
        const v = -pos.getY(i) / length; // 0 no ombro, 1 na barra
        const half = (0.21 + 0.17 * v) * k;
        const x = u * 2 * half;
        // Abraça as costas (bordas para a frente) e faz pregas verticais.
        const wrap = Math.pow(u * 2, 2) * (0.1 - 0.04 * v) * k;
        const folds = Math.sin(u * Math.PI * 6) * 0.012 * k * v;
        // Barra irregular, rasgada.
        const tear = v > 0.92 ? Math.abs(Math.sin(u * 23)) * 0.06 * k : 0;
        pos.setXYZ(i, x, pos.getY(i) + tear, wrap + folds - 0.02 * v * k);
      }
      geometry.computeVertexNormals();
      const cape = add(geometry, std({ color: '#0f0f14', roughness: 0.95, envMapIntensity: 0.35, side: THREE.DoubleSide }), 0, 0, 0);
      cape.name = 'cape';
      return { object: group, onBack: true };
    }
    case 'glow_eyes':
      return null; // aplicado direto no material dos olhos
  }
}
