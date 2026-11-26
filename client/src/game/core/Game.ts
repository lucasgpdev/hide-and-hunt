import type RAPIER_NS from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  ABILITIES,
  abilitiesFor,
  BALANCE,
  buildMapPhysics,
  EMOTES,
  getMap,
  getPropType,
  MoveFlag,
  setDoorOpen,
  type AbilityId,
  type MapPhysics,
  type RoomEffect,
  type RoomInfo,
  type RoomPlayerInfo,
  type Snapshot,
  type TeleportMessage,
} from '@hh/shared';
import { playFootstep, playSound, playSoundAt, preloadSamples, setAlarm, setAmbience, setListener, setRain, type StepSurface } from '../../audio/sound';
import type { NetworkClient } from '../../multiplayer/NetworkClient';
import { keyLabel, settingsStore, type GameSettings } from '../../settings/settings';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { PlayerAvatar } from '../characters/PlayerAvatar';
import { RemotePlayers } from '../characters/RemotePlayers';
import { Effects } from '../effects/Effects';
import { loadMapAssets, mapAssetsReady } from '../maps/mapAssets';
import { MapView } from '../maps/MapView';
import { installFastRaycast } from '../physics/fastRaycast';
import { setMaxAnisotropy } from '../materials/textures';
import { createPropModel } from '../objects/propModels';
import { LocalController } from '../physics/LocalController';
import { loadEnvironment, MAP_ENVIRONMENT } from './environment';
import { hudStore } from './hudStore';
import { Input, type ActionKey } from './Input';
import { PostFX } from './PostFX';

type Rapier = typeof RAPIER_NS;

/** HDRI e intensidade da luz ambiente de cada mapa. */


/** Iluminação de cada fase do dia (multiplica luzes e ambiente). */
const LIGHTING: Record<string, { factor: number; exposure: number }> = {
  day: { factor: 1, exposure: 1 },
  evening: { factor: 0.8, exposure: 0.9 },
  night: { factor: 0.6, exposure: 0.78 },
};

interface WorldBundle {
  mapId: string;
  view: MapView;
  physics: MapPhysics;
  controller: LocalController;
}

interface Aim {
  label: string;
  propId?: string;
  playerId?: string;
  cloneId?: string;
  doorId?: string;
  switchId?: string;
  point: THREE.Vector3;
  distance: number;
}

/**
 * Motor do jogo no navegador: renderização (Three.js), física local
 * (Rapier), câmera, entrada, jogadores remotos, interações e efeitos.
 * Nenhuma regra é decidida aqui: transformações, capturas, habilidades e
 * portas são pedidos ao servidor, que valida e responde.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly cameraRig: ThirdPersonCamera;
  private readonly effects: Effects;
  private readonly remotes: RemotePlayers;
  private readonly localAvatar: PlayerAvatar;
  private readonly raycaster = new THREE.Raycaster();
  private readonly flashlight: THREE.SpotLight;
  private readonly postfx: PostFX;
  private readonly clones = new Map<string, THREE.Object3D>();
  private readonly propSpeeds = new Map<string, { pos: THREE.Vector3; speed: number }>();
  private baseEnvIntensity = 0.5;
  private world: WorldBundle | null = null;
  private room: RoomInfo | null = null;
  private me: RoomPlayerInfo | null = null;
  private teleport: TeleportMessage | null = null;
  private lastSend = 0;
  private spectateIndex = 0;
  private spectateId: string | null = null;
  private transformReadyAt = 0;
  private captureReadyAt = 0;
  private aim: Aim | null = null;
  private frames = 0;
  /** Resolução dinâmica: fração da resolução escolhida nas configurações. */
  private resScale = 1;
  private baseRatio = 1;
  private perfFrames = 0;
  private perfTime = 0;
  private goodWindows = 0;
  private fpsTime = 0;
  private hudTime = 0;
  private time = 0;
  private lastFrame = 0;
  private lightning = 0;
  private disposed = false;
  /** Mapa cujos arquivos ainda estão baixando antes da troca. */
  private waitingMap: string | null = null;
  private cameraHintShown = false;
  private readonly unsubscribers: (() => void)[] = [];
  private settings: GameSettings = settingsStore.get();

  constructor(
    private readonly container: HTMLElement,
    private readonly RAPIER: Rapier,
    private readonly network: NetworkClient,
    private readonly localId: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    setMaxAnisotropy(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, this.settings.renderDistance);
    this.scene.add(this.camera);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.input = new Input(this.renderer.domElement);
    this.input.onPointerLockChange = (locked) => hudStore.set({ pointerLocked: locked });
    this.cameraRig = new ThirdPersonCamera(this.camera, RAPIER);
    this.effects = new Effects(this.scene);
    this.remotes = new RemotePlayers(localId);
    this.scene.add(this.remotes.root);

    installFastRaycast();
    // Sons gravados (passos, portas...) e passos com posição 3D, conforme o piso.
    preloadSamples();
    PlayerAvatar.stepHandler = (position, speed, playerId) => {
      const map = this.world?.view.map;
      if (!map) return;
      const zone = map.zones.find(({ rect: [x0, z0, x1, z1] }) => position.x >= x0 && position.x <= x1 && position.z >= z0 && position.z <= z1);
      const floor = zone?.surface ?? 'tiles';
      const surface: StepSurface =
        floor === 'wood' ? 'wood' : floor === 'carpet' ? 'carpet' : floor === 'grass' ? 'grass' : floor === 'concrete' || floor === 'asphalt' ? 'concrete' : 'tile';
      playFootstep(surface, [position.x, position.y, position.z], speed, playerId === localId);
    };
    setAmbience(true, () => [this.camera.position.x, this.camera.position.y, this.camera.position.z]);

    this.localAvatar = new PlayerAvatar(localId, '', 'default', null);
    this.localAvatar.setNameVisible(false);
    this.scene.add(this.localAvatar.root);

    // Lanterna do caçador local (presa à câmera).
    this.flashlight = new THREE.SpotLight('#fff1cf', 0, 24, Math.PI / 7, 0.45, 1.2);
    this.flashlight.position.set(0.3, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);

    this.applySettings(this.settings);
    this.unsubscribers.push(
      settingsStore.subscribe(() => this.applySettings(settingsStore.get())),
      network.onSnapshot((snapshot) => this.handleSnapshot(snapshot)),
      network.onTeleport((message) => this.handleTeleport(message)),
      network.onEffect((effect) => this.handleEffect(effect)),
    );

    window.addEventListener('resize', this.resize);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    setAlarm(false);
    setRain(false);
    setAmbience(false);
    PlayerAvatar.stepHandler = null;
    this.input.dispose();
    this.postfx.dispose();
    this.effects.dispose();
    this.remotes.dispose();
    this.localAvatar.dispose();
    this.destroyWorld();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setInputEnabled(enabled: boolean): void {
    this.input.enabled = enabled;
    if (!enabled) this.input.releaseLock();
  }

  requestPointerLock(): void {
    if (this.input.touchMode) hudStore.set({ pointerLocked: true });
    else this.input.requestLock();
  }

  /** Controles de toque: o jogo fica "ativo" sem travar o cursor. */
  enableTouchControls(): Input {
    if (!this.input.touchMode) {
      this.input.touchMode = true;
      hudStore.set({ pointerLocked: true });
    }
    return this.input;
  }

  /** Aponta a câmera para um ponto do mundo (usado pelo espectador e por testes). */
  lookAt(x: number, y: number, z: number): void {
    const from = this.camera.position;
    const dx = x - from.x;
    const dz = z - from.z;
    this.cameraRig.yaw = Math.atan2(-dx, -dz);
    this.cameraRig.pitch = Math.max(-0.9, Math.min(1.25, Math.atan2(from.y - y, Math.hypot(dx, dz))));
  }

  /** Posição atual do jogador local (para depuração e testes). */
  localPosition(): { x: number; y: number; z: number } | null {
    return this.world ? { ...this.world.controller.position } : null;
  }

  /** Posição de um jogador remoto (usada pelo chat de voz por proximidade). */
  playerPosition(id: string): THREE.Vector3 | null {
    if (id === this.localId) {
      const p = this.localPosition();
      return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
    }
    return this.remotes.positions.get(id) ?? null;
  }

  /** Posição e direção da câmera (ouvinte do chat de voz espacial). */
  listenerPose(): { position: THREE.Vector3; forward: THREE.Vector3 } {
    const position = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldPosition(position);
    this.camera.getWorldDirection(forward);
    return { position, forward };
  }

  /** Recebe o estado da sala (equipes, disfarces, fase, portas, clones). */
  setRoom(room: RoomInfo): void {
    const previous = this.room;
    this.room = room;
    this.me = room.players.find((p) => p.id === this.localId) ?? null;

    if (!this.world || this.world.mapId !== room.mapId) {
      // Só troca de mapa com os arquivos dele baixados (normalmente já vieram em segundo plano).
      if (this.world && !mapAssetsReady(room.mapId)) {
        if (this.waitingMap !== room.mapId) {
          this.waitingMap = room.mapId;
          void loadMapAssets(room.mapId).then(() => {
            this.waitingMap = null;
            if (this.room && !this.disposed) this.setRoom(this.room);
          });
        }
        return;
      }
      this.buildWorld(room.mapId);
    }

    const changed = this.remotes.syncPlayers(room.players);
    for (const avatar of changed) {
      if (!avatar.root.visible) continue;
      const info = room.players.find((p) => p.id === avatar.playerId);
      this.effects.transform(avatar.root.position, 0.8, info?.effect);
    }

    if (this.me) {
      this.localAvatar.setIdentity(this.me.team, this.me.nickname, this.me.skin);
      if (this.localAvatar.setDisguise(this.me.disguise)) {
        this.world?.controller.setDisguise(this.me.disguise);
        if (this.me.disguise) this.effects.transform(this.localAvatar.root.position, 1, this.me.effect);
        if (this.me.disguise && this.settings.cameraMode === 'first' && !this.cameraHintShown) {
          this.cameraHintShown = true;
          hudStore.toast(`Aperte ${keyLabel(this.settings.keys.camera)} para se ver em 3ª pessoa`);
        }
      }
      this.localAvatar.root.visible = this.me.alive;
    }

    // Portas.
    if (this.world) {
      for (const [id, open] of Object.entries(room.doors)) {
        const before = previous?.doors[id];
        this.world.view.setDoorOpen(id, open);
        if (before !== open) setDoorOpen(this.world.physics, id, open);
      }
    }
    this.syncClones(room);

    if (previous && previous.state !== room.state) {
      if (room.state === 'HIDING' || room.state === 'HUNTING') playSound('start');
      this.cameraRig.snap();
    }
    setRain(room.ambience.weather === 'rain' && room.state !== 'WAITING');
    setAlarm(room.event?.type === 'alarm');
    hudStore.set({ loading: false });
  }

  // ---------- mundo ----------

  private buildWorld(mapId: string): void {
    const map = getMap(mapId);
    if (!map) return;
    this.destroyWorld();
    const view = new MapView(map, this.settings);
    const physics = buildMapPhysics(this.RAPIER, map);
    const controller = new LocalController(this.RAPIER, physics);
    this.world = { mapId, view, physics, controller };
    this.scene.add(view.root);
    this.scene.background = new THREE.Color(map.theme.background);
    this.scene.backgroundIntensity = 1;
    this.scene.backgroundBlurriness = 0;
    this.scene.fog = new THREE.Fog(map.theme.fog, this.settings.renderDistance * 0.5, this.settings.renderDistance);
    // Cenários 3D: panorama do Poly Haven (CC0) visto pelas janelas, sem neblina por cima.
    if (map.scene?.sky) {
      const sky = map.scene.sky;
      new THREE.TextureLoader().load(`/sky/${sky}.jpg`, (texture) => {
        if (this.world?.mapId !== mapId || this.disposed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = texture;
        this.scene.backgroundIntensity = 1;
      });
      this.scene.fog = null;
    }
    const [envName, envIntensity] = MAP_ENVIRONMENT[mapId] ?? ['lobby', 0.5];
    this.baseEnvIntensity = envIntensity;
    void loadEnvironment(this.renderer, envName)
      .then((env) => {
        if (this.world?.mapId !== mapId || this.disposed) return;
        this.scene.environment = env;
        // Mapas abertos mostram o céu do HDRI ao fundo.
        if (map.outdoor && !map.scene?.sky) {
          this.scene.background = env;
          this.scene.backgroundIntensity = 0.35;
          this.scene.backgroundBlurriness = 0.15;
        }
      })
      .catch(() => {
        // Sem HDRI: a cena continua iluminada pelas luzes do mapa.
      });
    if (this.me?.disguise) controller.setDisguise(this.me.disguise);
    if (this.room) for (const [id, open] of Object.entries(this.room.doors)) setDoorOpen(physics, id, open);
    if (this.teleport) this.handleTeleport(this.teleport);
    this.propSpeeds.clear();
  }

  private destroyWorld(): void {
    if (!this.world) return;
    this.world.controller.dispose();
    this.world.view.dispose();
    this.world.physics.world.free();
    this.world = null;
    for (const clone of this.clones.values()) clone.removeFromParent();
    this.clones.clear();
  }

  private handleTeleport(message: TeleportMessage): void {
    this.teleport = message;
    if (!this.world) return;
    const [x, y, z] = message.position;
    this.world.controller.teleport(x, y, z);
    this.world.controller.facing = message.yaw;
    this.cameraRig.yaw = message.yaw + Math.PI;
    this.cameraRig.snap();
  }

  private handleSnapshot(snapshot: Snapshot): void {
    this.remotes.pushSnapshot(snapshot);
    const world = this.world;
    if (!world || !snapshot.o) return;
    // Objetos empurrados: visual, mira e colisão local seguem o servidor.
    let moved = false;
    const q = new THREE.Quaternion();
    for (const [id, x, y, z, qx, qy, qz, qw] of snapshot.o) {
      q.set(qx, qy, qz, qw);
      world.view.setPropPose(id, x, y, z, q);
      const collider = world.physics.propColliders.get(id);
      if (collider) {
        collider.setTranslation({ x, y, z });
        collider.setRotation({ x: qx, y: qy, z: qz, w: qw });
        moved = true;
      }
      // Som de impacto quando um objeto rápido para de repente.
      const prev = this.propSpeeds.get(id);
      const pos = new THREE.Vector3(x, y, z);
      const speed = prev ? prev.pos.distanceTo(pos) * 15 : 0;
      if (prev && prev.speed > 1.5 && speed < 0.3) playSoundAt('impact', [x, y, z]);
      this.propSpeeds.set(id, { pos, speed });
    }
    if (moved) world.physics.world.step();
  }

  private syncClones(room: RoomInfo): void {
    const ids = new Set(room.clones.map((c) => c.id));
    for (const [id, object] of this.clones) {
      if (!ids.has(id)) {
        object.removeFromParent();
        this.clones.delete(id);
      }
    }
    for (const clone of room.clones) {
      if (this.clones.has(clone.id)) continue;
      const model = createPropModel(clone.type);
      model.position.set(...clone.position);
      model.rotation.y = clone.yaw;
      model.traverse((child) => {
        child.userData.cloneId = clone.id;
        child.castShadow = true;
      });
      this.scene.add(model);
      this.clones.set(clone.id, model);
    }
  }

  private handleEffect(effect: RoomEffect): void {
    switch (effect.kind) {
      case 'sound':
        if (effect.position) playSoundAt(effect.sound === 'alarm' ? 'error' : effect.sound, effect.position);
        else if (effect.sound === 'thunder') {
          playSound('thunder');
          this.lightning = 1;
        }
        break;
      case 'emote': {
        const icon = EMOTES.find((e) => e.id === effect.emote)?.icon ?? '❔';
        const avatar = effect.playerId === this.localId ? this.localAvatar : this.remotes.avatar(effect.playerId);
        if (avatar) {
          avatar.playEmote(effect.emote);
          this.effects.bubble(avatar.root, icon);
        }
        break;
      }
      case 'ping':
        this.effects.marker(effect.position, '#4cc9f0', 4);
        playSoundAt('pop', effect.position);
        break;
      case 'radar':
        playSound('radar');
        for (const p of effect.points) this.effects.marker(p, '#ff4d6d', 3.2);
        if (effect.points.length === 0) hudStore.toast('Radar: nada por perto', 'warn');
        break;
      case 'scanner':
        playSound('radar');
        for (const p of effect.points) this.effects.marker(p, '#ffd166', 3, false);
        hudStore.toast(effect.points.length > 0 ? `Movimento detectado (${effect.points.length})` : 'Nenhum movimento por perto', effect.points.length > 0 ? 'ok' : 'warn');
        break;
      case 'analyzer':
        hudStore.toast(effect.suspicious ? 'Analisador: SUSPEITO!' : 'Analisador: parece normal', effect.suspicious ? 'ok' : 'warn');
        break;
      case 'cloneBroken':
        this.effects.puff(new THREE.Vector3(...effect.position), 0.9);
        playSoundAt('pop', effect.position);
        break;
      default:
        break;
    }
  }

  // ---------- laço principal ----------

  private readonly frame = (time: number) => {
    if (this.disposed) return;
    const now = time / 1000;
    // Limite opcional de FPS (padrão: sem limite — vai até a taxa do monitor).
    const limit = this.settings.fpsLimit;
    if (limit > 0 && this.lastFrame && now - this.lastFrame < 1 / limit - 0.002) return;
    const realDt = this.lastFrame ? now - this.lastFrame : 0.016;
    // A simulação limita o passo a 50 ms; o contador de FPS usa o tempo real.
    const dt = Math.min(0.05, realDt);
    this.lastFrame = now;
    this.time += dt;
    this.update(dt);
    this.postfx.render();

    this.frames += 1;
    this.fpsTime += realDt;
    this.adaptQuality(realDt);
    if (this.fpsTime >= 0.5) {
      hudStore.set({ fps: Math.round(this.frames / this.fpsTime) });
      this.frames = 0;
      this.fpsTime = 0;
    }
  };

  /**
   * A cada 2 s compara o FPS com a meta (60, ou o limite escolhido): abaixo de
   * 75% dela reduz a resolução em passos; folgado por 4 s seguidos, devolve.
   */
  private adaptQuality(realDt: number): void {
    if (!this.settings.autoQuality || realDt > 0.5) return;
    this.perfFrames += 1;
    this.perfTime += realDt;
    if (this.perfTime < 2) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfFrames = 0;
    this.perfTime = 0;
    const limit = this.settings.fpsLimit;
    const target = limit > 0 ? Math.min(limit, 60) : 60;
    let next = this.resScale;
    if (fps < target * 0.75) {
      next = Math.max(0.5, this.resScale - (fps < target * 0.5 ? 0.25 : 0.12));
      this.goodWindows = 0;
    } else if (fps > target * 0.93 && this.resScale < 1) {
      this.goodWindows += 1;
      if (this.goodWindows >= 2) {
        next = Math.min(1, this.resScale + 0.1);
        this.goodWindows = 0;
      }
    }
    if (Math.abs(next - this.resScale) > 0.001) {
      this.resScale = next;
      this.applyResolution();
    }
  }

  private applyResolution(): void {
    this.renderer.setPixelRatio(Math.max(0.5, this.baseRatio * this.resScale));
    this.resize();
  }

  private update(dt: number): void {
    const world = this.world;
    const room = this.room;
    const me = this.me;
    if (!world || !room) return;

    const mouse = this.input.consumeMouse();
    this.cameraRig.rotate(mouse.dx, mouse.dy, this.settings.mouseSensitivity, this.settings.invertY);
    const actions = this.input.consumeActions();
    const serverNow = this.network.serverNow();
    if (actions.includes('camera')) {
      const cameraMode = this.settings.cameraMode === 'first' ? 'third' : 'first';
      settingsStore.set({ cameraMode });
      hudStore.toast(cameraMode === 'first' ? 'Câmera em 1ª pessoa' : 'Câmera em 3ª pessoa');
    }

    const alive = Boolean(me?.alive);
    const frozen = room.state === 'HIDING' && me?.team === 'HUNTERS';
    const abilities = this.network.getState().abilities;
    const dash = (abilities.dash?.activeUntil ?? 0) > serverNow ? 1.7 : 1;

    if (alive) {
      const axes = hudStore.get().emoteMenu ? { forward: 0, right: 0, run: false, jump: false } : this.input.axes();
      world.controller.update(dt, axes, this.cameraRig.yaw, me?.team ?? null, frozen, dash);
      const p = world.controller.position;
      this.localAvatar.root.position.set(p.x, p.y, p.z);
      // 1ª pessoa: o corpo vira para onde o jogador olha (os outros veem isso).
      const firstPerson = this.settings.cameraMode === 'first' && !this.localAvatar.emoting;
      const facing = firstPerson ? this.cameraRig.yaw + Math.PI : world.controller.facing;
      this.localAvatar.root.rotation.y = lerpAngle(this.localAvatar.root.rotation.y, facing, Math.min(1, dt * (firstPerson ? 30 : 12)));
      if (firstPerson) world.controller.facing = facing;
      this.localAvatar.update(dt, world.controller.horizontalSpeed, world.controller.grounded);
      this.sendMove(serverNow, frozen);
      this.cameraRig.firstPerson = firstPerson;
      this.cameraRig.update(p, world.controller.height, dt, world.physics.world, world.controller.colliderHandle);
      this.setOwnBodyHidden(firstPerson);
      this.spectateId = null;
      // Camuflagem: o próprio jogador se vê translúcido enquanto estiver ativa.
      const camouflaged = (abilities.camouflage?.activeUntil ?? 0) > serverNow;
      this.localAvatar.root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as THREE.Material;
        if (camouflaged && !material.userData.camo) {
          mesh.material = material.clone();
          (mesh.material as THREE.Material).transparent = true;
          (mesh.material as THREE.Material).opacity = 0.35;
          (mesh.material as THREE.Material).userData.camo = material;
        } else if (!camouflaged && material.userData.camo) {
          mesh.material = material.userData.camo as THREE.Material;
          material.dispose();
        }
      });
    } else {
      this.updateSpectator(dt, actions);
    }

    this.remotes.update(dt, serverNow, (id, avatar) => this.isNameVisible(id, avatar));
    world.view.update(dt);
    this.updateAim(alive);
    this.handleActions(actions, alive);
    this.effects.update(dt);
    this.updateLighting(dt, serverNow);

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    setListener(this.camera.position, forward);

    const hunterLight = alive && me?.team === 'HUNTERS' && this.settings.graphics !== 'low';
    const dark = room.event?.type === 'blackout' || room.lightsOff.length > 0 || room.ambience.lighting === 'night';
    this.flashlight.intensity = hunterLight ? (dark ? 90 : 60) : 0;

    this.hudTime += dt;
    if (this.hudTime > 0.1) {
      this.hudTime = 0;
      const nowMs = Date.now();
      hudStore.set({
        prompt: this.aim?.label ?? null,
        transformCooldown: clamp01((this.transformReadyAt - nowMs) / (BALANCE.transform.cooldownSeconds * 1000)),
        captureCooldown: clamp01((this.captureReadyAt - nowMs) / (BALANCE.capture.missPenaltySeconds * 1000)),
        spectating:
          alive || (room.state !== 'HIDING' && room.state !== 'HUNTING')
            ? null
            : (room.players.find((p) => p.id === this.spectateId)?.nickname ?? null),
      });
    }
  }

  /** Luzes: ciclo do dia, interruptores e eventos (apagão, pisca-pisca, alarme, raios). */
  private updateLighting(dt: number, serverNow: number): void {
    const world = this.world;
    const room = this.room;
    if (!world || !room) return;
    const preset = LIGHTING[room.ambience.lighting] ?? LIGHTING.day!;
    const active = room.event && room.event.endsAt > serverNow ? room.event.type : null;
    let factor = room.state === 'WAITING' ? 1 : preset.factor;
    if (active === 'blackout') factor = 0.04;
    if (active === 'dim') factor *= 0.45;
    if (active === 'flicker') factor *= Math.sin(this.time * 31) > 0.2 || Math.sin(this.time * 7.3) > 0.6 ? 1 : 0.1;
    if (active === 'storm' && Math.random() < dt * 0.25) {
      this.lightning = 1;
      playSound('thunder');
    }
    this.lightning = Math.max(0, this.lightning - dt * 3);
    world.view.setLighting(factor, new Set(room.lightsOff));
    const ambient = room.state === 'WAITING' ? 1 : preset.factor;
    world.view.hemisphere.intensity = (active === 'blackout' ? 0.05 : world.view.baseHemisphere * ambient) + this.lightning * 2.5;
    world.view.sun.intensity = active === 'blackout' ? 0.05 : world.view.baseSun * ambient;
    world.view.hemisphere.color.set(active === 'alarm' && Math.sin(this.time * 10) > 0 ? '#ff3b3b' : '#dfe6ff');
    this.scene.environmentIntensity = this.baseEnvIntensity * (active === 'blackout' ? 0.08 : ambient) + this.lightning;
    this.renderer.toneMappingExposure = room.state === 'WAITING' ? 1 : preset.exposure;
    if (this.scene.fog instanceof THREE.Fog) {
      const fogFactor = room.ambience.weather === 'fog' && room.state !== 'WAITING' ? 0.35 : 1;
      this.scene.fog.near = this.settings.renderDistance * 0.5 * fogFactor;
      this.scene.fog.far = this.settings.renderDistance * fogFactor;
    }
  }

  private sendMove(serverNow: number, frozen: boolean): void {
    if (frozen || !this.teleport || !this.world) return;
    const interval = 1000 / BALANCE.network.clientSendRate;
    if (serverNow - this.lastSend < interval) return;
    this.lastSend = serverNow;
    const c = this.world.controller;
    let flags = 0;
    if (c.moving) flags |= MoveFlag.Moving;
    if (c.running) flags |= MoveFlag.Running;
    if (c.grounded) flags |= MoveFlag.Grounded;
    this.network.sendMove({
      tid: this.teleport.teleportId,
      p: [round3(c.position.x), round3(c.position.y), round3(c.position.z)],
      yaw: round3(this.localAvatar.root.rotation.y),
      f: flags,
    });
  }

  /** Em 1ª pessoa o próprio corpo sai da câmera (camada 1), mas a sombra continua. */
  private setOwnBodyHidden(hidden: boolean): void {
    this.localAvatar.root.traverse((child) => {
      if (hidden) child.layers.set(1);
      else child.layers.set(0);
    });
  }

  private updateSpectator(dt: number, actions: ActionKey[]): void {
    this.cameraRig.firstPerson = false;
    const ids = [...this.remotes.positions.keys()];
    if (ids.length === 0) {
      this.cameraRig.update({ x: 0, y: 0, z: 0 }, 6, dt, null);
      return;
    }
    if (actions.includes('primary') || actions.includes('nextTarget')) this.spectateIndex += 1;
    if (actions.includes('previousTarget')) this.spectateIndex -= 1;
    if (!this.spectateId || !ids.includes(this.spectateId) || actions.length > 0) {
      const index = ((this.spectateIndex % ids.length) + ids.length) % ids.length;
      this.spectateId = ids[index]!;
    }
    const target = this.remotes.positions.get(this.spectateId)!;
    const avatar = this.remotes.avatar(this.spectateId);
    const height = avatar?.disguise ? (getPropType(avatar.disguise)?.size[1] ?? 1) : 1.8;
    this.cameraRig.update(target, height, dt, this.world?.physics.world ?? null);
  }

  private isNameVisible(id: string, avatar: PlayerAvatar): boolean {
    const room = this.room;
    const me = this.me;
    if (!room || !me) return false;
    if (room.state === 'WAITING' || room.state === 'COUNTDOWN' || room.state === 'FINISHED') return true;
    if (!me.alive) return true;
    if (me.partnerId === id) return true;
    // Durante a partida, nomes só aparecem para companheiros de equipe.
    return me.team !== null && avatar.team === me.team;
  }

  // ---------- mira e ações ----------

  private updateAim(alive: boolean): void {
    this.aim = null;
    const room = this.room;
    const me = this.me;
    const world = this.world;
    if (!alive || !room || !me || !world || !this.input.locked) return;
    const inMatch = room.state === 'HIDING' || room.state === 'HUNTING';
    const isHider = me.team === 'HIDERS' && inMatch;
    const isHunter = me.team === 'HUNTERS' && room.state === 'HUNTING';

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 14;
    const cloneMeshes: THREE.Object3D[] = [];
    for (const clone of this.clones.values()) clone.traverse((c) => (c as THREE.Mesh).isMesh && cloneMeshes.push(c));
    const targets = [
      ...world.view.propMeshes,
      ...world.view.solidMeshes,
      ...world.view.interactables,
      ...cloneMeshes,
      ...this.remotes.meshes(),
    ];
    const hits = this.raycaster.intersectObjects(targets, false);
    const p = world.controller.position;
    const center = new THREE.Vector3(p.x, p.y + 0.9, p.z);
    const hit = hits.find((h) => h.object.userData.playerId !== this.localId);
    if (!hit) return;
    const data = hit.object.userData as {
      propId?: string;
      propType?: string;
      playerId?: string;
      cloneId?: string;
      doorId?: string;
      secret?: boolean;
      switchId?: string;
      pushable?: boolean;
    };
    const reach = center.distanceTo(hit.point);
    const base = { point: hit.point.clone(), distance: reach };

    if (data.doorId && reach <= 2.8) {
      const open = room.doors[data.doorId];
      const verb = open ? 'Fechar' : 'Abrir';
      this.aim = { ...base, doorId: data.doorId, label: data.secret ? `E — ${open ? 'Fechar' : 'Empurrar a parede...'}` : `E — ${verb} porta` };
      return;
    }
    if (data.switchId && reach <= 2.4) {
      this.aim = { ...base, switchId: data.switchId, label: 'E — Interruptor' };
      return;
    }
    if (isHider && data.propId && data.propType) {
      if (reach > BALANCE.transform.range + 0.5) return;
      const type = getPropType(data.propType);
      if (type && type.id !== me.disguise) {
        this.aim = { ...base, propId: data.propId, label: `F — Virar ${type.name}${type.pushable && reach < 2.4 ? ' · R — Empurrar' : ''}` };
      }
      return;
    }
    if (isHunter && (data.playerId || data.propId || data.cloneId)) {
      if (reach > BALANCE.capture.range + 0.4) {
        // Longe para capturar, mas o analisador alcança até 6 m.
        if (reach <= 6.5) this.aim = { ...base, ...(data.playerId ? { playerId: data.playerId } : {}), ...(data.propId ? { propId: data.propId } : {}), ...(data.cloneId ? { cloneId: data.cloneId } : {}), label: '' };
        return;
      }
      const target = data.playerId ? room.players.find((pl) => pl.id === data.playerId) : undefined;
      if (target?.team === 'HUNTERS') return; // companheiro de equipe
      this.aim = {
        ...base,
        ...(data.playerId ? { playerId: data.playerId } : {}),
        ...(data.propId ? { propId: data.propId } : {}),
        ...(data.cloneId ? { cloneId: data.cloneId } : {}),
        label: 'Clique ou E — Capturar',
      };
      return;
    }
    if (data.propId && data.pushable && reach < 2.4) this.aim = { ...base, propId: data.propId, label: 'R — Empurrar' };
  }

  private handleActions(actions: ActionKey[], alive: boolean): void {
    if (actions.length === 0) return;
    const room = this.room;
    const me = this.me;
    if (!room || !me) return;

    // Emotes: abre o seletor (B) e escolhe com 1–6.
    if (actions.includes('emote')) {
      hudStore.set({ emoteMenu: !hudStore.get().emoteMenu });
      return;
    }
    if (hudStore.get().emoteMenu) {
      const slots: ActionKey[] = ['ability1', 'ability2', 'ability3', 'ability4', 'digit5', 'digit6'];
      const index = slots.findIndex((s) => actions.includes(s));
      if (index >= 0) {
        hudStore.set({ emoteMenu: false });
        const emote = EMOTES[index];
        if (emote) {
          void this.network.emote(emote.id).then((r) => {
            if (!r.ok) hudStore.toast(r.error.message, 'warn');
          });
        }
      }
      return;
    }
    if (!alive) return;
    const aim = this.aim;
    const now = Date.now();

    if (actions.includes('ping')) {
      const point = aim?.point ?? this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
      this.network.pingMarker([round3(point.x), round3(point.y), round3(point.z)]);
    }

    // Habilidades (1–4).
    const slot = (['ability1', 'ability2', 'ability3', 'ability4'] as const).findIndex((a) => actions.includes(a));
    if (slot >= 0 && me.team) {
      const def = abilitiesFor(me.team).find((a) => a.slot === slot + 1);
      if (def) this.useAbility(def.id);
    }

    if (actions.includes('shove') && aim && (aim.propId || aim.playerId) && aim.distance < 2.4) {
      const target = aim.playerId ? { playerId: aim.playerId } : { propId: aim.propId! };
      void this.network.shove(target).then((r) => {
        if (!r.ok) hudStore.toast(r.error.message, 'warn');
      });
    }

    if (!aim) return;

    if ((aim.doorId || aim.switchId) && actions.includes('interact')) {
      void this.network.interact((aim.doorId ?? aim.switchId)!).then((r) => {
        if (!r.ok) hudStore.toast(r.error.message, 'warn');
      });
      return;
    }

    if (aim.propId && actions.includes('transform') && me.team === 'HIDERS') {
      if (now < this.transformReadyAt) return;
      this.transformReadyAt = now + BALANCE.transform.cooldownSeconds * 1000;
      void this.network.transform(aim.propId).then((result) => {
        if (result.ok) playSound('transform');
        else {
          this.transformReadyAt = 0;
          playSound('error');
          hudStore.toast(result.error.message, 'warn');
        }
      });
      return;
    }

    const wantsCapture = actions.includes('primary') || actions.includes('interact');
    if (wantsCapture && me.team === 'HUNTERS' && room.state === 'HUNTING' && aim.label) {
      if (now < this.captureReadyAt) return;
      this.captureReadyAt = now + BALANCE.capture.cooldownSeconds * 1000;
      const targetId = aim.playerId ?? null;
      void this.network.capture(targetId, aim.cloneId).then((result) => {
        if (!result.ok) {
          hudStore.toast(result.error.message, 'warn');
          return;
        }
        if (result.captured) {
          playSound('capture');
          const pos = targetId ? this.remotes.positions.get(targetId) : undefined;
          if (pos) this.effects.ring(pos);
          hudStore.toast(room.settings.mode === 'infection' ? 'Infectado!' : 'Capturado!');
        } else {
          this.captureReadyAt = Date.now() + BALANCE.capture.missPenaltySeconds * 1000;
          playSound('miss');
          hudStore.toast(aim.cloneId ? 'Era um clone falso!' : 'Era só um objeto...', 'warn');
        }
      });
    }
  }

  private useAbility(id: AbilityId): void {
    const def = ABILITIES[id];
    const aim = this.aim;
    const extra: { target?: [number, number, number]; propId?: string; playerId?: string } = {};
    if (id === 'whistle') {
      const point = aim?.point ?? this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8));
      extra.target = [round3(point.x), round3(point.y), round3(point.z)];
    }
    if (id === 'analyzer') {
      if (aim?.playerId) extra.playerId = aim.playerId;
      else if (aim?.cloneId) extra.propId = aim.cloneId;
      else if (aim?.propId) extra.propId = aim.propId;
      else {
        hudStore.toast('Mire em um objeto para analisar.', 'warn');
        return;
      }
    }
    void this.network.useAbility(id, extra).then((result) => {
      if (result.ok) {
        playSound('ability');
        if (id !== 'radar' && id !== 'scanner' && id !== 'analyzer') hudStore.toast(def.name);
      } else {
        playSound('error');
        hudStore.toast(result.error.message, 'warn');
      }
    });
  }

  // ---------- configurações ----------

  private applySettings(settings: GameSettings): void {
    const graphicsChanged = this.settings.graphics !== settings.graphics || this.settings.shadows !== settings.shadows;
    this.settings = settings;
    const dpr = window.devicePixelRatio || 1;
    this.baseRatio = settings.graphics === 'low' ? Math.min(dpr, 1) : settings.graphics === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    if (!settings.autoQuality) this.resScale = 1;
    this.renderer.setPixelRatio(Math.max(0.5, this.baseRatio * this.resScale));
    this.camera.fov = settings.fov;
    this.camera.far = settings.renderDistance;
    this.camera.updateProjectionMatrix();
    if (graphicsChanged && this.world) this.buildWorld(this.world.mapId);
    this.postfx.configure(settings.graphics, this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    this.resize();
  }

  private readonly resize = () => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.postfx?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
