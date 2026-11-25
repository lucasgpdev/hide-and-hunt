import * as THREE from 'three';
import { getPropType } from '@hh/shared';
import { canvasTexture, material, ModelBuilder, texturedMaterial, torusGeometry } from './primitives';

/**
 * Modelos 3D dos objetos do catálogo, com materiais PBR, bordas arredondadas
 * e detalhes (telas, teclas, mostradores). Convenções: base em y = 0,
 * centro em x/z = 0, frente para +z, medidas iguais às do catálogo
 * (shared/src/props/catalog.ts).
 */
type ModelFactory = (b: ModelBuilder) => void;

const metal = { roughness: 0.3, metalness: 0.85 };

// ---------- texturas de detalhe ----------

const screenTexture = () =>
  canvasTexture('screen', 256, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 160);
    g.addColorStop(0, '#1d4f8a');
    g.addColorStop(1, '#3fa0d8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) ctx.fillRect(14, 14 + i * 26, 18, 16);
    ctx.fillStyle = 'rgba(10,20,30,0.75)';
    ctx.fillRect(0, 146, 256, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(80, 40, 120, 76);
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(80, 40, 120, 10);
    ctx.fillStyle = '#9aa4b2';
    for (let i = 0; i < 5; i++) ctx.fillRect(88, 58 + i * 10, 90 - i * 12, 4);
  });

const keyboardTexture = () =>
  canvasTexture('keys', 256, 96, (ctx) => {
    ctx.fillStyle = '#25282e';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#3b3f47';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 15; col++) {
        const wide = row === 4 && col > 4 && col < 10;
        if (row === 4 && col > 5 && col < 10) continue;
        ctx.fillRect(6 + col * 16.4, 6 + row * 17.5, wide ? 80 : 13.5, 14);
      }
    }
  });

const clockTexture = () =>
  canvasTexture('clock', 256, 256, (ctx) => {
    ctx.fillStyle = '#f6f4ee';
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1d1f23';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const inner = i % 5 === 0 ? 100 : 110;
      ctx.lineWidth = i % 5 === 0 ? 6 : 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * inner, 128 - Math.cos(a) * inner);
      ctx.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + 50, 128 - 30);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 - 10, 128 - 86);
    ctx.stroke();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + 70, 128 + 60);
    ctx.stroke();
  });

const whiteboardTexture = () =>
  canvasTexture('whiteboard', 512, 320, (ctx) => {
    ctx.fillStyle = '#f9f9f6';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = 'rgba(40, 80, 160, 0.75)';
    ctx.lineWidth = 4;
    ctx.font = '32px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(40, 80, 160, 0.8)';
    ctx.fillText('Circuitos — Aula 3', 30, 60);
    ctx.beginPath();
    ctx.moveTo(40, 200);
    for (let x = 0; x < 200; x += 4) ctx.lineTo(40 + x, 200 - Math.sin(x / 18) * 40);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 40, 40, 0.7)';
    ctx.strokeRect(300, 110, 160, 110);
    ctx.beginPath();
    ctx.moveTo(300, 165);
    ctx.lineTo(460, 165);
    ctx.stroke();
  });

const scopeTexture = () =>
  canvasTexture('scope', 256, 160, (ctx) => {
    ctx.fillStyle = '#04140c';
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = 'rgba(60, 220, 140, 0.25)';
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, 160);
      ctx.moveTo(0, i * 20);
      ctx.lineTo(256, i * 20);
      ctx.stroke();
    }
    ctx.strokeStyle = '#4dff9c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) ctx.lineTo(x, 80 - Math.sin(x / 14) * 40);
    ctx.stroke();
  });

// ---------- modelos ----------

const factories: Record<string, ModelFactory> = {
  chair: (b) => {
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) b.cyl(0.015, 0.015, 0.45, 'metal.steel', x, 0, z, 10);
    b.rbox(0.5, 0.045, 0.48, 0.015, 'wood.light', 0, 0.45, 0);
    for (const x of [-0.21, 0.21]) b.cyl(0.013, 0.013, 0.5, 'metal.steel', x, 0.45, -0.23, 10);
    b.rbox(0.48, 0.24, 0.03, 0.012, 'wood.light', 0, 0.68, -0.235);
  },
  swivel_chair: (b) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = b.rbox(0.05, 0.035, 0.3, 0.012, 'plastic.dark', Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14);
      leg.rotation.y = a;
      b.sphere(0.03, 'plastic.dark', Math.sin(a) * 0.28, 0.03, Math.cos(a) * 0.28);
    }
    b.cyl(0.025, 0.025, 0.36, 'metal.steel', 0, 0.08, 0, 12);
    b.rbox(0.52, 0.09, 0.5, 0.035, 'fabric.gray', 0, 0.43, 0);
    b.rbox(0.48, 0.5, 0.07, 0.03, 'fabric.gray', 0, 0.55, -0.24);
    for (const x of [-0.27, 0.27]) b.rbox(0.04, 0.03, 0.26, 0.012, 'plastic.dark', x, 0.66, 0);
  },
  table: (b) => {
    for (const x of [-0.64, 0.64]) for (const z of [-0.34, 0.34]) b.cyl(0.022, 0.022, 0.72, 'metal.steel', x, 0, z, 12);
    b.box(1.3, 0.06, 0.04, 'metal.dark', 0, 0.62, -0.34);
    b.rbox(1.4, 0.04, 0.8, 0.01, 'wood.light', 0, 0.72, 0);
  },
  sofa: (b) => {
    b.rbox(1.9, 0.35, 0.85, 0.06, 'fabric.gray', 0, 0.06, 0);
    b.rbox(1.9, 0.5, 0.22, 0.08, 'fabric.gray', 0, 0.36, -0.315);
    for (const x of [-0.85, 0.85]) b.rbox(0.2, 0.26, 0.85, 0.07, 'fabric.gray', x, 0.36, 0);
    for (const x of [-0.42, 0.42]) b.rbox(0.8, 0.13, 0.62, 0.06, 'fabric.blue', x, 0.4, 0.08);
    for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) b.cyl(0.03, 0.025, 0.06, 'wood.dark', x, 0, z, 10);
  },
  school_desk: (b) => {
    for (const x of [-0.28, 0.28]) {
      b.cyl(0.014, 0.014, 0.72, 'metal.painted', x, 0, 0.18, 10);
      b.cyl(0.014, 0.014, 0.42, 'metal.painted', x, 0, -0.2, 10);
      b.box(0.02, 0.02, 0.42, 'metal.painted', x, 0.02, -0.01);
    }
    b.rbox(0.65, 0.025, 0.42, 0.008, 'wood.light', 0, 0.72, 0.07);
    b.box(0.55, 0.012, 0.3, 'metal.painted', 0, 0.6, 0.1);
    b.rbox(0.48, 0.035, 0.34, 0.012, '#2f5f9e', 0, 0.42, -0.1, { roughness: 0.45 });
    b.rbox(0.46, 0.28, 0.025, 0.01, '#2f5f9e', 0, 0.5, -0.27, { roughness: 0.45 });
  },
  cabinet: (b) => {
    b.box(0.9, 1.9, 0.5, 'metal.painted', 0, 0, 0);
    b.box(0.006, 1.82, 0.006, 'metal.dark', 0, 0.04, 0.252);
    for (const y of [0.4, 1.0, 1.55]) b.box(0.86, 0.006, 0.006, 'metal.dark', 0, y, 0.252);
    for (const x of [-0.06, 0.06]) b.rbox(0.02, 0.16, 0.025, 0.008, 'metal.steel', x, 0.9, 0.265);
    for (let i = 0; i < 4; i++) b.box(0.3, 0.008, 0.004, 'metal.dark', -0.22, 1.6 + i * 0.03, 0.252);
  },
  trash_can: (b) => {
    b.cyl(0.225, 0.19, 0.7, '#2f6b4f', 0, 0, 0, 28, { roughness: 0.5 });
    b.cyl(0.235, 0.235, 0.05, '#24533d', 0, 0.7, 0, 28, { roughness: 0.45 });
    b.cyl(0.2, 0.2, 0.004, '#141414', 0, 0.75, 0, 28);
  },
  box: (b) => {
    b.box(0.6, 0.5, 0.6, 'cardboard', 0, 0, 0);
  },
  plant_pot: (b) => {
    b.cyl(0.22, 0.16, 0.4, '#a5583a', 0, 0, 0, 24, { roughness: 0.85 });
    b.cyl(0.23, 0.23, 0.04, '#94492e', 0, 0.38, 0, 24);
    b.cyl(0.2, 0.2, 0.01, '#3a2a1c', 0, 0.39, 0, 24, { roughness: 1 });
    const leaf = material('#3c7a3a', { roughness: 0.6 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
      const h = 0.55 + (i % 4) * 0.12;
      const l = b.sphere(0.13, leaf, Math.sin(a) * 0.13, 0.4 + h * 0.75, Math.cos(a) * 0.13);
      l.scale.set(0.45, 1.4, 0.18);
      l.rotation.set(Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5);
    }
    b.cyl(0.015, 0.02, 0.4, '#4f3a22', 0, 0.4, 0, 8);
  },
  computer: (b) => {
    b.rbox(0.22, 0.45, 0.48, 0.015, 'plastic.dark', 0, 0, 0);
    b.box(0.2, 0.38, 0.004, '#121417', 0, 0.035, 0.241, { roughness: 0.35, metalness: 0.4 });
    for (let i = 0; i < 6; i++) b.box(0.16, 0.006, 0.004, '#2b2f36', 0, 0.06 + i * 0.03, 0.244);
    b.cyl(0.012, 0.012, 0.004, '#5cc8ff', 0.06, 0.39, 0.244, 12, { emissive: '#5cc8ff', emissiveIntensity: 3 }).rotation.x = Math.PI / 2;
  },
  monitor: (b) => {
    b.rbox(0.24, 0.018, 0.17, 0.008, 'plastic.dark', 0, 0, 0);
    b.box(0.045, 0.17, 0.03, 'plastic.dark', 0, 0.018, -0.03);
    b.rbox(0.6, 0.36, 0.035, 0.01, 'plastic.dark', 0, 0.12, 0);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.57, 0.32),
      texturedMaterial('screen', screenTexture(), { roughness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.9 }),
    );
    screen.position.set(0, 0.3, 0.0185);
    b.group.add(screen);
  },
  printer: (b) => {
    b.rbox(0.5, 0.22, 0.45, 0.025, 'plastic.white', 0, 0, 0);
    b.rbox(0.42, 0.08, 0.3, 0.02, '#cfcbc3', 0, 0.22, -0.05);
    b.box(0.3, 0.006, 0.14, '#fbfbf8', 0, 0.12, 0.27);
    b.box(0.12, 0.03, 0.005, '#20242a', 0.15, 0.17, 0.226);
    b.cyl(0.008, 0.008, 0.004, '#3dff7a', 0.08, 0.18, 0.228, 10, { emissive: '#3dff7a', emissiveIntensity: 3 }).rotation.x = Math.PI / 2;
  },
  shopping_cart: (b) => {
    const wire = 'metal.steel';
    // Cesto em grade de arames.
    for (let i = 0; i <= 8; i++) {
      const z = -0.38 + i * 0.1;
      b.box(0.56, 0.008, 0.008, wire, 0, 0.45, z);
      b.box(0.008, 0.45, 0.008, wire, -0.28, 0.5, z);
      b.box(0.008, 0.45, 0.008, wire, 0.28, 0.5, z);
    }
    for (let i = 0; i <= 5; i++) {
      const x = -0.28 + i * 0.112;
      b.box(0.008, 0.008, 0.8, wire, x, 0.45, 0);
      b.box(0.008, 0.45, 0.008, wire, x, 0.5, 0.4);
      b.box(0.008, 0.45, 0.008, wire, x, 0.5, -0.4);
    }
    for (const y of [0.62, 0.78, 0.95]) {
      b.box(0.57, 0.01, 0.01, wire, 0, y, 0.4);
      b.box(0.57, 0.01, 0.01, wire, 0, y, -0.4);
      b.box(0.01, 0.01, 0.8, wire, -0.28, y, 0);
      b.box(0.01, 0.01, 0.8, wire, 0.28, y, 0);
    }
    b.rbox(0.56, 0.035, 0.035, 0.015, '#c0392b', 0, 1.0, -0.46, { roughness: 0.4 });
    for (const x of [-0.26, 0.26]) {
      b.box(0.015, 0.55, 0.015, wire, x, 0.45, -0.44);
      b.box(0.015, 0.4, 0.015, wire, x, 0.06, 0.36);
      b.box(0.015, 0.4, 0.015, wire, x, 0.06, -0.36);
      for (const z of [-0.38, 0.38]) {
        const wheel = b.cyl(0.05, 0.05, 0.03, 'plastic.dark', x, 0.02, z, 16);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.y = 0.05;
      }
    }
  },
  bucket: (b) => {
    b.cyl(0.16, 0.13, 0.32, '#2b5fa8', 0, 0, 0, 28, { roughness: 0.4 });
    b.cyl(0.165, 0.165, 0.02, '#244f8c', 0, 0.31, 0, 28);
    const handle = b.add(torusGeometry(0.15, 0.006), 'metal.steel', 0, 0.33, 0);
    handle.scale.set(1, 1.2, 1);
  },
  cone: (b) => {
    b.rbox(0.4, 0.035, 0.4, 0.015, '#1d1f23', 0, 0, 0, { roughness: 0.7 });
    b.cyl(0.025, 0.17, 0.7, '#e8611f', 0, 0.035, 0, 32, { roughness: 0.55 });
    b.cyl(0.09, 0.115, 0.1, '#f3f0e8', 0, 0.33, 0, 32, { roughness: 0.3 });
    b.cyl(0.055, 0.075, 0.07, '#f3f0e8', 0, 0.5, 0, 32, { roughness: 0.3 });
  },
  suitcase: (b) => {
    b.rbox(0.45, 0.6, 0.25, 0.05, '#7a2f35', 0, 0.05, 0, { roughness: 0.35 });
    for (const x of [-0.12, 0, 0.12]) b.box(0.01, 0.58, 0.252, '#62252a', x, 0.06, 0);
    b.cyl(0.01, 0.01, 0.12, 'metal.steel', -0.08, 0.65, 0, 10);
    b.cyl(0.01, 0.01, 0.12, 'metal.steel', 0.08, 0.65, 0, 10);
    b.rbox(0.2, 0.025, 0.03, 0.01, 'plastic.dark', 0, 0.77, 0);
    for (const x of [-0.18, 0.18]) b.cyl(0.03, 0.03, 0.025, 'plastic.dark', x, 0.0, -0.09, 14).rotation.z = Math.PI / 2;
  },
  clock: (b) => {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 48), texturedMaterial('clock', clockTexture(), { roughness: 0.3 }));
    face.position.set(0, 0.2, 0.035);
    b.group.add(face);
    const body = b.cyl(0.2, 0.2, 0.06, 'plastic.dark', 0, 0, 0, 48);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.2, 0);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.185, 48), material('#ffffff', { transparent: true, opacity: 0.12, roughness: 0.05 }));
    glass.position.set(0, 0.2, 0.04);
    b.group.add(glass);
    b.rbox(0.2, 0.02, 0.1, 0.008, 'plastic.dark', 0, 0, 0);
  },
  lamp: (b) => {
    b.cyl(0.15, 0.17, 0.035, 'metal.dark', 0, 0, 0, 32);
    b.cyl(0.012, 0.012, 1.2, 'metal.steel', 0, 0.035, 0, 12);
    b.cyl(0.1, 0.175, 0.26, '#efe3c8', 0, 1.24, 0, 32, { emissive: '#ffd89a', emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide });
    b.sphere(0.04, '#fff6dc', 0, 1.3, 0, { emissive: '#fff1c4', emissiveIntensity: 3 });
  },
  backpack: (b) => {
    b.rbox(0.32, 0.42, 0.17, 0.07, 'fabric.red', 0, 0, 0);
    b.rbox(0.24, 0.17, 0.05, 0.03, 'fabric.red', 0, 0.06, 0.1);
    b.box(0.2, 0.006, 0.006, 'metal.steel', 0, 0.23, 0.126);
    for (const x of [-0.09, 0.09]) b.rbox(0.04, 0.34, 0.03, 0.012, 'plastic.dark', x, 0.05, -0.1);
    b.rbox(0.1, 0.04, 0.03, 0.012, 'plastic.dark', 0, 0.42, 0);
  },
  whiteboard: (b) => {
    for (const x of [-0.75, 0.75]) {
      b.cyl(0.018, 0.018, 1.75, 'metal.steel', x, 0.05, 0, 12);
      b.rbox(0.05, 0.04, 0.5, 0.015, 'metal.dark', x, 0, 0);
      for (const z of [-0.22, 0.22]) b.sphere(0.025, 'plastic.dark', x, 0.025, z);
    }
    b.rbox(1.52, 0.97, 0.035, 0.012, 'metal.steel', 0, 0.74, 0);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.91), texturedMaterial('whiteboard', whiteboardTexture(), { roughness: 0.15 }));
    board.position.set(0, 1.225, 0.019);
    b.group.add(board);
    b.box(1.4, 0.025, 0.06, 'metal.steel', 0, 0.72, 0.03);
  },
  fan: (b) => {
    b.cyl(0.2, 0.22, 0.04, 'plastic.white', 0, 0, 0, 32);
    b.cyl(0.016, 0.016, 0.9, 'metal.steel', 0, 0.04, 0, 12);
    b.rbox(0.13, 0.13, 0.17, 0.05, 'plastic.white', 0, 0.9, -0.05);
    for (const r of [0.21, 0.14, 0.07]) {
      const ring = b.add(torusGeometry(r, 0.004), 'metal.steel', 0, 1.07, 0.08);
      ring.rotation.y = 0;
    }
    for (let i = 0; i < 3; i++) {
      const blade = b.rbox(0.08, 0.17, 0.008, 0.03, material('#7fb6e0', { transparent: true, opacity: 0.8, roughness: 0.3 }), 0, 0.98, 0.07);
      blade.rotation.z = (i / 3) * Math.PI * 2;
      blade.position.set(Math.sin((i / 3) * Math.PI * 2) * 0.09, 1.07 + Math.cos((i / 3) * Math.PI * 2) * 0.09, 0.07);
    }
  },
  projector: (b) => {
    b.rbox(0.35, 0.11, 0.3, 0.025, 'plastic.white', 0, 0, 0);
    const lens = b.cyl(0.04, 0.045, 0.04, 'plastic.dark', 0.09, 0.055, 0.15, 24);
    lens.rotation.x = Math.PI / 2;
    lens.position.y = 0.055;
    const glass = b.cyl(0.03, 0.03, 0.005, '#5a7fa6', 0.09, 0.055, 0.172, 24, { roughness: 0.05, metalness: 0.3 });
    glass.rotation.x = Math.PI / 2;
    glass.position.y = 0.055;
    for (let i = 0; i < 5; i++) b.box(0.006, 0.05, 0.004, '#9aa0a8', -0.13 + i * 0.02, 0.03, 0.151);
  },
  keyboard: (b) => {
    b.rbox(0.45, 0.02, 0.15, 0.006, 'plastic.dark', 0, 0, 0);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.13), texturedMaterial('keys', keyboardTexture(), { roughness: 0.6 }));
    keys.rotation.x = -Math.PI / 2;
    keys.position.y = 0.0205;
    b.group.add(keys);
  },
  mouse: (b) => {
    const body = b.sphere(0.05, 'plastic.dark', 0, 0.012, 0);
    body.scale.set(0.65, 0.4, 1.05);
    b.box(0.003, 0.004, 0.035, '#555a63', 0, 0.03, 0.025);
  },
  electronic_equipment: (b) => {
    b.rbox(0.5, 0.33, 0.4, 0.02, 'metal.painted', 0, 0, 0);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.15),
      texturedMaterial('scope', scopeTexture(), { emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.2 }),
    );
    screen.position.set(-0.08, 0.18, 0.201);
    b.group.add(screen);
    for (const y of [0.1, 0.18, 0.26]) {
      const knob = b.cyl(0.022, 0.022, 0.02, 'plastic.dark', 0.15, y, 0.21, 16);
      knob.rotation.x = Math.PI / 2;
      knob.position.y = y;
    }
    for (const x of [0.06, 0.1]) b.cyl(0.012, 0.012, 0.01, '#c0392b', x, 0.06, 0.2, 12).rotation.x = Math.PI / 2;
  },
  nobreak: (b) => {
    b.rbox(0.18, 0.3, 0.38, 0.015, 'plastic.dark', 0, 0, 0);
    b.box(0.14, 0.08, 0.004, '#15181c', 0, 0.18, 0.191);
    b.box(0.04, 0.012, 0.004, '#55ff8a', -0.03, 0.22, 0.193, { emissive: '#55ff8a', emissiveIntensity: 3 });
    b.cyl(0.015, 0.015, 0.006, 'metal.steel', 0.04, 0.22, 0.193, 16).rotation.x = Math.PI / 2;
  },
  water_cooler: (b) => {
    b.rbox(0.38, 0.85, 0.38, 0.03, 'plastic.white', 0, 0, 0);
    b.rbox(0.24, 0.08, 0.06, 0.02, '#9aa3ad', 0, 0.5, 0.2);
    for (const x of [-0.05, 0.05]) b.cyl(0.012, 0.012, 0.04, x < 0 ? '#2b6cb0' : '#c0392b', x, 0.6, 0.2, 10);
    b.box(0.28, 0.01, 0.12, '#80868e', 0, 0.38, 0.16);
    const bottle = material('#7fc4ef', { transparent: true, opacity: 0.45, roughness: 0.05 });
    b.cyl(0.14, 0.14, 0.22, bottle, 0, 0.85, 0, 32);
    b.cyl(0.05, 0.14, 0.06, bottle, 0, 1.07, 0, 32).rotation.x = Math.PI;
  },
};

const fallback: ModelFactory = (b) => b.box(0.5, 0.5, 0.5, '#888888');

// ---------- modelos realistas (Poly Haven, CC0) ----------

interface RealisticModel {
  file: string;
  /** Mantém só as partes desejadas (alguns arquivos trazem duas variações lado a lado). */
  keep?: (nodeName: string) => boolean;
}

/**
 * Objetos fotoescaneados do Poly Haven (CC0), em public/models/props.
 * Cada um é ajustado ao tamanho do tipo no catálogo (mesma altura e base no chão),
 * então colisão, transformação e mira continuam iguais. Os demais tipos usam
 * os modelos feitos por código acima.
 */
const REALISTIC: Record<string, RealisticModel> = {
  chair: { file: 'ph_SchoolChair.glb' },
  school_desk: { file: 'ph_SchoolDesk.glb' },
  table: { file: 'ph_dining_table.glb', keep: (n) => !n.includes('cloth') },
  sofa: { file: 'ph_Sofa.glb' },
  cabinet: { file: 'ph_painted_wooden_cabinet_02.glb' },
  trash_can: { file: 'ph_metal_trash_can.glb', keep: (n) => !n.includes('rust') && !n.includes('lid') },
  box: { file: 'ph_cardboard_box.glb' },
  suitcase: { file: 'ph_vintage_suitcase.glb', keep: (n) => n.startsWith('vintage_suitcase_01') },
  clock: { file: 'ph_wall_clock.glb' },
  // Objetos do cenário "Classroom" (Christophe Seux, CC0).
  classroom_desk: { file: 'cr_desk.glb' },
  leather_chair: { file: 'cr_leather_chair.glb' },
  wastebasket: { file: 'cr_wastebasket.glb' },
};

const templates = new Map<string, THREE.Object3D>();
let preloading: Promise<void> | null = null;

/** Carrega os modelos realistas uma vez (na tela de carregamento). Falhas usam o modelo por código. */
export function preloadPropModels(): Promise<void> {
  preloading ??= (async () => {
    const { dequantize, sharedGltfLoader } = await import('../maps/mapScenes');
    const loader = await sharedGltfLoader();
    await Promise.all(
      Object.entries(REALISTIC).map(async ([typeId, def]) => {
        const type = getPropType(typeId);
        if (!type) return;
        try {
          const gltf = await loader.loadAsync(`/models/props/${def.file}`);
          const scene = gltf.scene;
          dequantize(scene);
          if (def.keep) {
            for (const child of [...scene.children]) if (!def.keep(child.name)) child.removeFromParent();
          }
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          const size = box.getSize(new THREE.Vector3());
          const [sx, sy, sz] = type.size;
          // Mesma altura do catálogo, sem passar muito da base do colisor.
          const scale = Math.min(sy / Math.max(size.y, 1e-3), (sx * 1.2) / Math.max(size.x, 1e-3), (sz * 1.2) / Math.max(size.z, 1e-3));
          const center = box.getCenter(new THREE.Vector3());
          scene.scale.setScalar(scale);
          scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
          scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          });
          const holder = new THREE.Group();
          holder.add(scene);
          templates.set(typeId, holder);
        } catch (error) {
          console.warn(`Modelo realista de ${typeId} indisponível; usando o modelo simples.`, error);
        }
      }),
    );
  })();
  return preloading;
}

/** Cria o modelo de um tipo de objeto (novo grupo a cada chamada). */
export function createPropModel(typeId: string): THREE.Group {
  const template = templates.get(typeId);
  if (template) {
    // Clones compartilham geometria e materiais (memória e chamadas de desenho menores).
    const group = template.clone(true) as THREE.Group;
    group.name = getPropType(typeId)?.name ?? typeId;
    return group;
  }
  const builder = new ModelBuilder();
  (factories[typeId] ?? fallback)(builder);
  const type = getPropType(typeId);
  builder.group.name = type?.name ?? typeId;
  return builder.group;
}

export function hasPropModel(typeId: string): boolean {
  return typeId in factories;
}
