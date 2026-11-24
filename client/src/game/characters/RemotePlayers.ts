import * as THREE from 'three';
import { BALANCE, MoveFlag, type RoomPlayerInfo, type Snapshot } from '@hh/shared';
import { PlayerAvatar } from './PlayerAvatar';

interface Sample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  flags: number;
}

interface Remote {
  avatar: PlayerAvatar;
  /** Posição renderizada atual (para estimar velocidade da animação). */
  last: THREE.Vector3;
  present: boolean;
}

/**
 * Outros jogadores: guarda os snapshots do servidor (15 por segundo) e
 * desenha cada jogador um pouco no passado, interpolando entre dois
 * snapshots para o movimento ficar suave (item 4).
 */
export class RemotePlayers {
  private readonly buffer: { t: number; entries: Map<string, Sample> }[] = [];
  private readonly remotes = new Map<string, Remote>();
  readonly root = new THREE.Group();
  /** Posições interpoladas no último quadro (usado pelo modo espectador). */
  readonly positions = new Map<string, THREE.Vector3>();

  constructor(private readonly localId: string) {}

  pushSnapshot(snapshot: Snapshot): void {
    const entries = new Map<string, Sample>();
    for (const [id, x, y, z, yaw, flags] of snapshot.p) entries.set(id, { x, y, z, yaw, flags });
    this.buffer.push({ t: snapshot.t, entries });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Atualiza a lista de jogadores a partir do estado da sala. */
  syncPlayers(players: RoomPlayerInfo[]): PlayerAvatar[] {
    const ids = new Set<string>();
    const changed: PlayerAvatar[] = [];
    for (const info of players) {
      if (info.id === this.localId) continue;
      ids.add(info.id);
      let remote = this.remotes.get(info.id);
      if (!remote) {
        const avatar = new PlayerAvatar(info.id, info.nickname, info.skin, info.team);
        avatar.root.visible = false;
        this.root.add(avatar.root);
        remote = { avatar, last: new THREE.Vector3(), present: false };
        this.remotes.set(info.id, remote);
      }
      remote.avatar.setIdentity(info.team, info.nickname, info.skin);
      if (remote.avatar.setDisguise(info.disguise)) changed.push(remote.avatar);
    }
    for (const [id, remote] of this.remotes) {
      if (!ids.has(id)) {
        remote.avatar.dispose();
        this.remotes.delete(id);
        this.positions.delete(id);
      }
    }
    return changed;
  }

  avatar(id: string): PlayerAvatar | undefined {
    return this.remotes.get(id)?.avatar;
  }

  meshes(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const remote of this.remotes.values()) {
      if (!remote.avatar.root.visible) continue;
      remote.avatar.root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) list.push(child);
      });
    }
    return list;
  }

  update(dt: number, serverNow: number, nameVisible: (id: string, avatar: PlayerAvatar) => boolean): void {
    const renderTime = serverNow - BALANCE.network.interpolationDelayMs;
    // Encontra os dois snapshots ao redor do tempo de renderização.
    let older = this.buffer[0];
    let newer = this.buffer[this.buffer.length - 1];
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const snapshot = this.buffer[i]!;
      if (snapshot.t <= renderTime) {
        older = snapshot;
        newer = this.buffer[i + 1] ?? snapshot;
        break;
      }
    }

    for (const [id, remote] of this.remotes) {
      const a = older?.entries.get(id);
      const b = newer?.entries.get(id) ?? a;
      const latest = this.buffer[this.buffer.length - 1]?.entries.get(id);
      if (!a || !b || !latest) {
        remote.avatar.root.visible = false;
        remote.present = false;
        this.positions.delete(id);
        continue;
      }
      const span = newer && older && newer.t > older.t ? newer.t - older.t : 1;
      const alpha = older && newer ? THREE.MathUtils.clamp((renderTime - older.t) / span, 0, 1) : 1;
      const x = a.x + (b.x - a.x) * alpha;
      const y = a.y + (b.y - a.y) * alpha;
      const z = a.z + (b.z - a.z) * alpha;
      const yaw = lerpAngle(a.yaw, b.yaw, alpha);

      const root = remote.avatar.root;
      if (!remote.present) remote.last.set(x, y, z);
      const speed = dt > 0 ? Math.hypot(x - remote.last.x, z - remote.last.z) / dt : 0;
      remote.last.set(x, y, z);
      root.position.set(x, y, z);
      root.rotation.y = yaw;
      root.visible = true;
      remote.present = true;
      this.positions.set(id, new THREE.Vector3(x, y, z));

      remote.avatar.setNameVisible(nameVisible(id, remote.avatar));
      remote.avatar.update(dt, (b.flags & MoveFlag.Moving) !== 0 ? Math.max(speed, 1) : speed, (b.flags & MoveFlag.Grounded) !== 0);
    }
  }

  dispose(): void {
    for (const remote of this.remotes.values()) remote.avatar.dispose();
    this.remotes.clear();
    this.root.removeFromParent();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
