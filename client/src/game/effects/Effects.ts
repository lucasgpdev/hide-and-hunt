import * as THREE from 'three';
import { smokeTexture } from '../materials/textures';

interface Effect {
  object: THREE.Object3D;
  life: number;
  maxLife: number;
  update(t: number): void;
  dispose(): void;
}

/**
 * Efeitos visuais curtos: nuvem de fumaça ao se transformar e anel de
 * captura. Tudo é removido sozinho ao terminar.
 */
export class Effects {
  private readonly active: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Efeito de transformação: fumaça (padrão), confete ou faíscas (recompensas de temporada). */
  transform(position: THREE.Vector3, size = 1, style = 'smoke'): void {
    if (style === 'confetti') this.burst(position, size, ['#ff5d73', '#ffd166', '#06d6a0', '#118ab2', '#c77dff'], 0.14, false);
    else if (style === 'sparks') this.burst(position, size, ['#ffd27a', '#ffb547', '#fff3c4'], 0.1, true);
    else this.puff(position, size);
  }

  private burst(position: THREE.Vector3, size: number, colors: string[], particleSize: number, additive: boolean): void {
    const count = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colorArray = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions.set([position.x, position.y + 0.5 * size, position.z], i * 3);
      c.set(colors[i % colors.length]!);
      colorArray.set([c.r, c.g, c.b], i * 3);
      velocities.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 2.5));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    const material = new THREE.PointsMaterial({
      size: particleSize * size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.active.push({
      object: points,
      life: 0,
      maxLife: 1.1,
      update: (t) => {
        const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < count; i++) {
          const v = velocities[i]!;
          attr.setXYZ(i, position.x + v.x * t, position.y + 0.5 * size + v.y * t - 4.9 * t * t, position.z + v.z * t);
        }
        attr.needsUpdate = true;
        material.opacity = 1 - t / 1.1;
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    });
  }

  /** Marcador no chão (radar, scanner, marcação da equipe). */
  marker(position: [number, number, number], color: string, seconds: number, beam = true): void {
    const group = new THREE.Group();
    const ringGeometry = new THREE.RingGeometry(0.5, 0.62, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 20;
    group.add(ring);
    let beamGeometry: THREE.CylinderGeometry | null = null;
    let beamMaterial: THREE.MeshBasicMaterial | null = null;
    if (beam) {
      beamGeometry = new THREE.CylinderGeometry(0.05, 0.25, 3, 12, 1, true);
      beamMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
      beamMesh.position.y = 1.5;
      beamMesh.renderOrder = 20;
      group.add(beamMesh);
    }
    group.position.set(position[0], position[1] + 0.05, position[2]);
    this.scene.add(group);
    this.active.push({
      object: group,
      life: 0,
      maxLife: seconds,
      update: (t) => {
        const pulse = 1 + Math.sin(t * 8) * 0.15;
        ring.scale.setScalar(pulse + t * 0.3);
        const fade = Math.min(1, (seconds - t) * 2);
        ringMaterial.opacity = 0.9 * fade;
        if (beamMaterial) beamMaterial.opacity = 0.35 * fade;
      },
      dispose: () => {
        ringGeometry.dispose();
        ringMaterial.dispose();
        beamGeometry?.dispose();
        beamMaterial?.dispose();
      },
    });
  }

  /** Balão com ícone sobre um jogador (emotes). */
  bubble(target: THREE.Object3D, icon: string, height = 2.4): void {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(64, 58, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(52, 100);
    ctx.lineTo(64, 124);
    ctx.lineTo(76, 100);
    ctx.fill();
    ctx.font = '60px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 64, 62);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.7, 0.7, 1);
    sprite.renderOrder = 30;
    this.scene.add(sprite);
    this.active.push({
      object: sprite,
      life: 0,
      maxLife: 2.6,
      update: (t) => {
        target.updateWorldMatrix(true, false);
        const p = new THREE.Vector3().setFromMatrixPosition(target.matrixWorld);
        sprite.position.set(p.x, p.y + height + Math.min(0.2, t * 0.6), p.z);
        material.opacity = Math.min(1, (2.6 - t) * 3);
      },
      dispose: () => {
        texture.dispose();
        material.dispose();
      },
    });
  }

  puff(position: THREE.Vector3, size = 1): void {
    const count = 24;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions.set([position.x, position.y + 0.5 * size, position.z], i * 3);
      velocities.push(
        new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random()),
      );
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#ecebe6',
      map: smokeTexture(),
      size: 0.7 * size,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
    this.active.push({
      object: points,
      life: 0,
      maxLife: 0.7,
      update: (t) => {
        const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < count; i++) {
          const v = velocities[i]!;
          attr.setXYZ(i, position.x + v.x * t, position.y + 0.5 * size + v.y * t, position.z + v.z * t);
        }
        attr.needsUpdate = true;
        material.opacity = 0.9 * (1 - t / 0.7);
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    });
  }

  ring(position: THREE.Vector3, color = '#ffb547'): void {
    const geometry = new THREE.RingGeometry(0.3, 0.42, 32);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(mesh);
    this.active.push({
      object: mesh,
      life: 0,
      maxLife: 0.8,
      update: (t) => {
        mesh.scale.setScalar(1 + t * 4);
        material.opacity = 1 - t / 0.8;
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i]!;
      effect.life += dt;
      if (effect.life >= effect.maxLife) {
        this.scene.remove(effect.object);
        effect.dispose();
        this.active.splice(i, 1);
      } else {
        effect.update(effect.life);
      }
    }
  }

  dispose(): void {
    for (const effect of this.active) {
      this.scene.remove(effect.object);
      effect.dispose();
    }
    this.active.length = 0;
  }
}
