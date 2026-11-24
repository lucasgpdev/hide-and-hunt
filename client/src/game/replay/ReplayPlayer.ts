import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getMap, type ReplayData } from '@hh/shared';
import type { GameSettings } from '../../settings/settings';
import { PlayerAvatar } from '../characters/PlayerAvatar';
import { loadEnvironment, MAP_ENVIRONMENT } from '../core/environment';
import { PostFX } from '../core/PostFX';
import { MapView } from '../maps/MapView';
import { setMaxAnisotropy } from '../materials/textures';

export type ReplayCamera = 'cinematic' | 'orbit' | 'follow';

interface Track {
  avatar: PlayerAvatar;
  lastPos: THREE.Vector3;
}

/**
 * Reprodutor de replay 3D (item 19 e replay cinematográfico).
 * Lê os quadros gravados pelo servidor (5 por segundo) e interpola posições,
 * com três câmeras: cinematográfica (corta para os momentos marcantes),
 * órbita livre e seguir jogador.
 */
export class ReplayPlayer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly postfx: PostFX;
  private readonly view: MapView | null;
  private readonly tracks = new Map<string, Track>();
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private raf = 0;
  private disposed = false;
  private shotUntil = 0;
  private shotIndex = -1;
  private readonly shotTarget = new THREE.Vector3();
  private readonly shotFrom = new THREE.Vector3();
  private orbitAngle = 0;

  playing = true;
  speed = 1;
  cameraMode: ReplayCamera = 'cinematic';
  followId: string | null = null;
  onTick: ((frame: number) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly replay: ReplayData,
    settings: GameSettings,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    setMaxAnisotropy(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'replay-canvas';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener('start', () => {
      if (this.cameraMode === 'cinematic') this.cameraMode = 'orbit';
    });

    const map = getMap(replay.mapId);
    this.view = map ? new MapView(map, settings) : null;
    if (map && this.view) {
      this.scene.add(this.view.root);
      this.scene.background = new THREE.Color(map.theme.background);
      const [envName, intensity] = MAP_ENVIRONMENT[map.id] ?? ['lobby', 0.5];
      this.scene.environmentIntensity = intensity;
      void loadEnvironment(this.renderer, envName)
        .then((env) => {
          if (!this.disposed) this.scene.environment = env;
        })
        .catch(() => undefined);
      const [w, d] = map.size;
      this.camera.position.set(w * 0.35, Math.max(w, d) * 0.45, d * 0.45);
      this.controls.target.set(0, 0, 0);
    }

    for (const p of replay.players) {
      const avatar = new PlayerAvatar(p.id, p.nickname, 'default', p.team);
      avatar.root.visible = false;
      this.scene.add(avatar.root);
      this.tracks.set(p.id, { avatar, lastPos: new THREE.Vector3() });
    }

    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.postfx.configure(settings.graphics, 1, 1);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyFrame(0, 0);
    this.loop();
  }

  get length(): number {
    return this.replay.frames.length;
  }

  get currentFrame(): number {
    return this.frame;
  }

  seek(frame: number): void {
    this.frame = THREE.MathUtils.clamp(frame, 0, Math.max(0, this.length - 1));
    this.shotUntil = 0;
    this.applyFrame(this.frame, 0);
  }

  setCamera(mode: ReplayCamera, followId: string | null = null): void {
    this.cameraMode = mode;
    this.followId = followId;
    this.shotUntil = 0;
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(w, h);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.25, this.clock.getDelta());
    if (this.playing && this.length > 1) {
      this.frame += (dt * 1000 * this.speed) / this.replay.interval;
      if (this.frame >= this.length - 1) {
        this.frame = this.length - 1;
        this.playing = false;
      }
    }
    this.applyFrame(this.frame, this.playing ? dt * this.speed : 0);
    this.updateCamera(dt);
    this.view?.update(dt);
    this.controls.update();
    this.postfx.render();
    this.onTick?.(this.frame);
  };

  /** Posiciona todos os jogadores interpolando entre dois quadros. */
  private applyFrame(frame: number, dt: number): void {
    const frames = this.replay.frames;
    if (frames.length === 0) return;
    const i = Math.floor(frame);
    const t = frame - i;
    const a = frames[i] ?? [];
    const b = frames[Math.min(i + 1, frames.length - 1)] ?? a;
    const next = new Map(b.map((e) => [e[0], e]));
    const seen = new Set<string>();
    for (const entry of a) {
      const [id, x, y, z, yaw, disguise] = entry;
      const track = this.tracks.get(id);
      if (!track) continue;
      seen.add(id);
      const n = next.get(id) ?? entry;
      const px = THREE.MathUtils.lerp(x, n[1], t);
      const py = THREE.MathUtils.lerp(y, n[2], t);
      const pz = THREE.MathUtils.lerp(z, n[3], t);
      const avatar = track.avatar;
      avatar.root.visible = true;
      avatar.setDisguise(disguise >= 0 ? (this.replay.disguises[disguise] ?? null) : null);
      avatar.root.position.set(px, py, pz);
      avatar.root.rotation.y = lerpAngle(yaw, n[4], t);
      const speed = dt > 0 ? Math.hypot(px - track.lastPos.x, pz - track.lastPos.z) / Math.max(dt, 1e-3) : 0;
      track.lastPos.set(px, py, pz);
      avatar.update(Math.max(dt, 1 / 60), Math.min(speed, 8), true);
    }
    for (const [id, track] of this.tracks) if (!seen.has(id)) track.avatar.root.visible = false;
  }

  private updateCamera(dt: number): void {
    if (this.cameraMode === 'orbit') return;
    if (this.cameraMode === 'follow') {
      const track = this.followId ? this.tracks.get(this.followId) : undefined;
      if (!track || !track.avatar.root.visible) return;
      const p = track.avatar.root.position;
      const yaw = track.avatar.root.rotation.y;
      // Modelos olham para +Z girados por yaw: a câmera fica atrás, 4 m de distância.
      const desired = new THREE.Vector3(p.x - Math.sin(yaw) * 4, p.y + 2.4, p.z - Math.cos(yaw) * 4);
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
      this.controls.target.lerp(new THREE.Vector3(p.x, p.y + 1, p.z), 1 - Math.exp(-dt * 6));
      return;
    }
    // Cinematográfica: corta para o próximo evento marcado (captura, transformação
    // marcante, evento aleatório). Entre eventos, gira devagar sobre o grupo de jogadores.
    const now = this.frame;
    if (now >= this.shotUntil) {
      const events = this.replay.events;
      const idx = events.findIndex((e) => e.position && e.t >= now && e.t <= now + 25);
      if (idx >= 0 && idx !== this.shotIndex) {
        const ev = events[idx]!;
        this.shotIndex = idx;
        const [x, y, z] = ev.position!;
        this.shotTarget.set(x, y + 0.8, z);
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.shotFrom.set(x + Math.cos(this.orbitAngle) * 5, y + 2.6, z + Math.sin(this.orbitAngle) * 5);
        this.camera.position.copy(this.shotFrom);
        this.controls.target.copy(this.shotTarget);
        this.shotUntil = ev.t + 12;
        return;
      }
      const center = this.centroid();
      if (center) {
        this.orbitAngle += dt * 0.12;
        const desired = new THREE.Vector3(center.x + Math.cos(this.orbitAngle) * 12, center.y + 7, center.z + Math.sin(this.orbitAngle) * 12);
        this.camera.position.lerp(desired, 1 - Math.exp(-dt * 1.2));
        this.controls.target.lerp(center, 1 - Math.exp(-dt * 2));
      }
      return;
    }
    // Durante o "plano": travelling lento ao redor do ponto do evento.
    this.orbitAngle += dt * 0.25;
    const r = 4.5;
    const desired = new THREE.Vector3(this.shotTarget.x + Math.cos(this.orbitAngle) * r, this.shotTarget.y + 1.8, this.shotTarget.z + Math.sin(this.orbitAngle) * r);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 2));
    this.controls.target.lerp(this.shotTarget, 1 - Math.exp(-dt * 4));
  }

  private centroid(): THREE.Vector3 | null {
    const sum = new THREE.Vector3();
    let n = 0;
    for (const track of this.tracks.values()) {
      if (!track.avatar.root.visible) continue;
      sum.add(track.avatar.root.position);
      n++;
    }
    return n ? sum.divideScalar(n) : null;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const track of this.tracks.values()) track.avatar.dispose();
    this.view?.dispose();
    this.postfx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
