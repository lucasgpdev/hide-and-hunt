import { BALANCE, characterShapeInfo, getMap, getPropType, MoveFlag } from '@hh/shared';
import { fitsAt, hasLineOfSight, propPosition, type RoomPhysics, type Vec3 } from './physics.js';

/**
 * Bots: completam a sala para dar para jogar sozinho ou com poucos amigos.
 * Andam por uma grade de navegação feita com a mesma física do servidor
 * (só passam onde um jogador passaria). Escondidos vão até um objeto do
 * mapa, viram ele e ficam quietos — fogem se um caçador chega perto.
 * Caçadores percorrem o mapa, perseguem quem veem andando e desconfiam,
 * aos poucos, de objetos que estão perto.
 */

const BOT_NAMES = ['Tatu', 'Pipoca', 'Biscoito', 'Farofa', 'Paçoca', 'Jabuti', 'Cocada', 'Quindim', 'Sabiá', 'Capivara', 'Pamonha', 'Bolacha'];

export function botName(index: number): string {
  return `🤖 ${BOT_NAMES[index % BOT_NAMES.length]}`;
}

// ---------- grade de navegação ----------

export interface NavGrid {
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  free: Uint8Array;
  cells: number[];
}

export function buildNavGrid(physics: RoomPhysics, mapId: string, step = 0.4): NavGrid {
  const map = getMap(mapId)!;
  const [w, d] = map.size;
  const nx = Math.floor(w / step);
  const nz = Math.floor(d / step);
  const x0 = -w / 2 + step / 2;
  const z0 = -d / 2 + step / 2;
  const free = new Uint8Array(nx * nz);
  const cells: number[] = [];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      if (fitsAt(physics, null, [x0 + i * step, 0.05, z0 + k * step])) {
        free[k * nx + i] = 1;
        cells.push(k * nx + i);
      }
    }
  }
  // Fica só com a maior região conectada (descarta cantos isolados).
  const region = new Int32Array(nx * nz).fill(-1);
  let best = -1;
  let bestSize = 0;
  let id = 0;
  for (const start of cells) {
    if (region[start] !== -1) continue;
    let size = 0;
    const queue = [start];
    region[start] = id;
    while (queue.length) {
      const c = queue.pop()!;
      size++;
      const i = c % nx;
      const k = (c - i) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const n = nk * nx + ni;
        if (free[n] && region[n] === -1) {
          region[n] = id;
          queue.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
    id++;
  }
  const kept = cells.filter((c) => region[c] === best);
  free.fill(0);
  for (const c of kept) free[c] = 1;
  return { x0, z0, step, nx, nz, free, cells: kept };
}

function cellOf(grid: NavGrid, x: number, z: number): number {
  const i = Math.round((x - grid.x0) / grid.step);
  const k = Math.round((z - grid.z0) / grid.step);
  if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) return -1;
  return k * grid.nx + i;
}

function cellPos(grid: NavGrid, c: number): Vec3 {
  const i = c % grid.nx;
  const k = (c - i) / grid.nx;
  return [grid.x0 + i * grid.step, 0, grid.z0 + k * grid.step];
}

/** Célula livre mais próxima (busca em espiral curta). */
export function nearestFree(grid: NavGrid, x: number, z: number, radius = 12): number {
  const c = cellOf(grid, x, z);
  if (c >= 0 && grid.free[c]) return c;
  const ci = Math.round((x - grid.x0) / grid.step);
  const ck = Math.round((z - grid.z0) / grid.step);
  let best = -1;
  let bestD = Infinity;
  for (let dk = -radius; dk <= radius; dk++) {
    for (let di = -radius; di <= radius; di++) {
      const i = ci + di;
      const k = ck + dk;
      if (i < 0 || k < 0 || i >= grid.nx || k >= grid.nz) continue;
      const n = k * grid.nx + i;
      if (!grid.free[n]) continue;
      const dd = di * di + dk * dk;
      if (dd < bestD) {
        bestD = dd;
        best = n;
      }
    }
  }
  return best;
}

/** A* em 8 direções (sem cortar quinas). Devolve pontos do mundo, sem o inicial. */
export function findPath(grid: NavGrid, from: Vec3, to: Vec3): Vec3[] | null {
  const start = nearestFree(grid, from[0], from[2]);
  const goal = nearestFree(grid, to[0], to[2]);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [cellPos(grid, goal)];
  const { nx, nz, free } = grid;
  const gi = goal % nx;
  const gk = (goal - gi) / nx;
  const h = (c: number) => {
    const i = c % nx;
    const k = (c - i) / nx;
    const dx = Math.abs(i - gi);
    const dz = Math.abs(k - gk);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  const g = new Float32Array(nx * nz).fill(Infinity);
  const came = new Int32Array(nx * nz).fill(-1);
  const closed = new Uint8Array(nx * nz);
  // fila de prioridade simples (heap binário)
  const heap: [number, number][] = [];
  const push = (f: number, c: number) => {
    heap.push([f, c]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top[1];
  };
  g[start] = 0;
  push(h(start), start);
  let expanded = 0;
  while (heap.length) {
    const c = pop();
    if (closed[c]) continue;
    if (c === goal) break;
    closed[c] = 1;
    if (++expanded > 20000) return null;
    const i = c % nx;
    const k = (c - i) / nx;
    for (let dk = -1; dk <= 1; dk++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const ni = i + di;
        const nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= nx || nk >= nz) continue;
        const n = nk * nx + ni;
        if (!free[n] || closed[n]) continue;
        if (di && dk && (!free[k * nx + ni] || !free[nk * nx + i])) continue;
        const cost = g[c]! + (di && dk ? 1.414 : 1);
        if (cost < g[n]!) {
          g[n] = cost;
          came[n] = c;
          push(cost + h(n), n);
        }
      }
    }
  }
  if (came[goal] === -1) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start && c !== -1; c = came[c]!) cells.push(c);
  cells.reverse();
  // Mantém um ponto a cada 2 células (o movimento fica mais suave).
  return cells.filter((_, idx) => idx % 2 === 1 || idx === cells.length - 1).map((c) => cellPos(grid, c));
}

export function randomCell(grid: NavGrid, random: () => number): Vec3 {
  return cellPos(grid, grid.cells[Math.floor(random() * grid.cells.length)]!);
}

// ---------- cérebro ----------

/** O que o bot precisa da sala (sem depender da classe inteira). */
export interface BotWorld {
  state: string;
  mapId: string;
  physics: RoomPhysics;
  players: Map<string, BotPlayerView>;
  random: () => number;
  now: number;
  transform(playerId: string, propId: string): { ok: boolean };
  capture(hunterId: string, targetId: string | null): { ok: boolean };
  isFrozen(playerId: string): boolean;
}

export interface BotPlayerView {
  id: string;
  team: 'HUNTERS' | 'HIDERS' | null;
  alive: boolean;
  disguise: string | null;
  position: Vec3;
  yaw: number;
  flags: number;
  lastMovedAt: number;
  camouflagedUntil: number;
}

type Goal = 'idle' | 'hide' | 'hidden' | 'flee' | 'wander' | 'chase';

export class BotBrain {
  private goal: Goal = 'idle';
  private path: Vec3[] = [];
  private targetPropId: string | null = null;
  private targetPlayerId: string | null = null;
  private nextThink = 0;
  private waitUntil = 0;
  private stuckSince = 0;
  private lastProgress: Vec3 = [0, 0, 0];
  private lastState = '';
  /** Desconfiança acumulada de cada escondido (caçador). */
  private readonly suspicion = new Map<string, number>();
  private lastTick = 0;

  constructor(readonly playerId: string) {}

  tick(world: BotWorld, grid: NavGrid): void {
    const me = world.players.get(this.playerId);
    if (!me) return;
    const now = world.now;
    const dt = this.lastTick ? Math.min(0.2, (now - this.lastTick) / 1000) : 0.033;
    this.lastTick = now;
    if (world.state !== this.lastState) {
      this.lastState = world.state;
      // Quem já está escondido continua parado quando a caçada começa.
      if (!(world.state === 'HUNTING' && me.disguise && this.goal === 'hidden')) {
        this.goal = 'idle';
        this.path = [];
      }
      this.suspicion.clear();
      this.nextThink = now + 300 + world.random() * 900;
    }
    const inMatch = world.state === 'HIDING' || world.state === 'HUNTING';
    if (!me.alive || !inMatch || !me.team || world.isFrozen(me.id)) {
      this.stop(me);
      return;
    }
    if (now >= this.nextThink) {
      this.nextThink = now + 250;
      if (me.team === 'HIDERS') this.thinkHider(world, grid, me);
      else this.thinkHunter(world, grid, me, dt * 0 + 0.25);
    }
    this.move(world, grid, me, dt);
  }

  // ----- escondido -----

  private thinkHider(world: BotWorld, grid: NavGrid, me: BotPlayerView): void {
    const now = world.now;
    const danger = this.nearestHunter(world, me, 2.4);
    // Perder a calma de vez em quando (fugir chama atenção, então é raro).
    if (danger && world.state === 'HUNTING' && this.goal === 'hidden' && world.random() < 0.03) {
      // Foge para longe do caçador.
      let best: Vec3 | null = null;
      let bestD = -1;
      for (let i = 0; i < 24; i++) {
        const p = randomCell(grid, world.random);
        const d = Math.hypot(p[0] - danger.p.position[0], p[2] - danger.p.position[2]);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) this.setPath(grid, me, best, 'flee');
      return;
    }
    if (this.goal === 'flee' && this.path.length) return;
    if (this.goal === 'hidden') return;
    if (this.goal === 'hide' && this.path.length) return;

    // Escolhe um objeto do mapa para virar (perto dele) ou tenta virar o atual.
    if (this.goal === 'hide' && this.targetPropId) {
      const result = world.transform(me.id, this.targetPropId);
      if (result.ok) {
        this.goal = 'hidden';
        me.yaw = world.random() * Math.PI * 2;
        this.waitUntil = now + 4000;
        return;
      }
      this.targetPropId = null;
    }
    const map = getMap(world.mapId);
    const props = map?.props ?? [];
    for (let attempt = 0; attempt < 8 && props.length; attempt++) {
      const prop = props[Math.floor(world.random() * props.length)]!;
      const type = getPropType(prop.type);
      if (!type || type.size[1] < 0.25 || type.size[0] * type.size[2] > 2.2) continue;
      const at = propPosition(world.physics, prop.id) ?? prop.position;
      const cell = nearestFree(grid, at[0], at[2], 6);
      if (cell < 0) continue;
      const i = cell % grid.nx;
      const target: Vec3 = [grid.x0 + i * grid.step, 0, grid.z0 + ((cell - i) / grid.nx) * grid.step];
      if (Math.hypot(target[0] - at[0], target[2] - at[2]) > 2.4) continue;
      if (!fitsAt(world.physics, type.id, target)) continue;
      this.targetPropId = prop.id;
      this.setPath(grid, me, target, 'hide');
      return;
    }
    // Sem objeto bom: vai para um canto qualquer.
    this.setPath(grid, me, randomCell(grid, world.random), 'hide');
  }

  // ----- caçador -----

  private thinkHunter(world: BotWorld, grid: NavGrid, me: BotPlayerView, step: number): void {
    if (world.state !== 'HUNTING') return;
    const now = world.now;
    const eye: Vec3 = [me.position[0], me.position[1] + 1.6, me.position[2]];
    let bestTarget: BotPlayerView | null = null;
    let bestScore = 0;
    for (const p of world.players.values()) {
      if (p.team !== 'HIDERS' || !p.alive || now < p.camouflagedUntil) continue;
      const d = Math.hypot(p.position[0] - me.position[0], p.position[2] - me.position[2]);
      if (d > 16) continue;
      const shape = characterShapeInfo(p.disguise);
      const center: Vec3 = [p.position[0], p.position[1] + shape.height / 2, p.position[2]];
      if (!hasLineOfSight(world.physics, eye, center, shape.radius)) continue;
      const movingRecently = now - p.lastMovedAt < 1200;
      // Gente em forma humana ou objeto andando é visto na hora; objeto parado, aos poucos.
      let rate = !p.disguise || movingRecently ? 3 : d < 2.2 ? 0.07 : d < 4.5 ? 0.022 : 0.004;
      if (p.disguise && (p.flags & MoveFlag.Moving) === 0 && !movingRecently) rate *= 0.8;
      const s = Math.min(1.5, (this.suspicion.get(p.id) ?? 0) + rate * step * (0.6 + world.random() * 0.8));
      this.suspicion.set(p.id, s);
      const score = s - d * 0.02;
      if (s >= 1 && score > bestScore) {
        bestScore = score;
        bestTarget = p;
      }
    }

    if (bestTarget) {
      const shape = characterShapeInfo(bestTarget.disguise);
      const d = Math.hypot(bestTarget.position[0] - me.position[0], bestTarget.position[2] - me.position[2]);
      if (d <= BALANCE.capture.range + shape.radius - 0.3) {
        me.yaw = Math.atan2(bestTarget.position[0] - me.position[0], bestTarget.position[2] - me.position[2]);
        const result = world.capture(me.id, bestTarget.id);
        if (result.ok) this.suspicion.delete(bestTarget.id);
        return;
      }
      if (this.goal !== 'chase' || this.targetPlayerId !== bestTarget.id || this.path.length === 0 || world.random() < 0.3) {
        this.targetPlayerId = bestTarget.id;
        this.setPath(grid, me, bestTarget.position, 'chase');
      }
      return;
    }
    if (this.goal === 'chase') this.goal = 'idle';
    if (this.path.length === 0 && now >= this.waitUntil) {
      // Percorre o mapa: de preferência perto de objetos (onde costuma ter gente escondida).
      const props = getMap(world.mapId)?.props ?? [];
      let target = randomCell(grid, world.random);
      if (props.length && world.random() < 0.7) {
        const prop = props[Math.floor(world.random() * props.length)]!;
        const c = nearestFree(grid, prop.position[0], prop.position[2], 6);
        if (c >= 0) {
          const i = c % grid.nx;
          target = [grid.x0 + i * grid.step, 0, grid.z0 + ((c - i) / grid.nx) * grid.step];
        }
      }
      this.setPath(grid, me, target, 'wander');
      this.waitUntil = now + 600 + world.random() * 1800;
    }
  }

  private nearestHunter(world: BotWorld, me: BotPlayerView, range: number): { p: BotPlayerView; d: number } | null {
    let best: { p: BotPlayerView; d: number } | null = null;
    for (const p of world.players.values()) {
      if (p.team !== 'HUNTERS' || !p.alive) continue;
      const d = Math.hypot(p.position[0] - me.position[0], p.position[2] - me.position[2]);
      if (d < range && (!best || d < best.d)) best = { p, d };
    }
    return best;
  }

  // ----- movimento -----

  private setPath(grid: NavGrid, me: BotPlayerView, target: Vec3, goal: Goal): void {
    const path = findPath(grid, me.position, target);
    this.goal = goal;
    this.path = path ?? [];
    this.stuckSince = 0;
    this.lastProgress = [...me.position];
  }

  private stop(me: BotPlayerView): void {
    this.path = [];
    me.flags = (me.flags & ~(MoveFlag.Moving | MoveFlag.Running)) | MoveFlag.Grounded;
  }

  private move(world: BotWorld, grid: NavGrid, me: BotPlayerView, dt: number): void {
    const next = this.path[0];
    if (!next) {
      this.stop(me);
      return;
    }
    const fast = this.goal === 'flee' || this.goal === 'chase';
    const hunter = me.team === 'HUNTERS';
    const base = fast
      ? hunter
        ? BALANCE.movement.hunterRunSpeed
        : BALANCE.movement.hiderRunSpeed
      : hunter
        ? BALANCE.movement.hunterWalkSpeed
        : BALANCE.movement.hiderWalkSpeed;
    const propSpeed = me.disguise ? (getPropType(me.disguise)?.speed ?? 1) : 1;
    const speed = base * propSpeed * 0.92;
    const dx = next[0] - me.position[0];
    const dz = next[2] - me.position[2];
    const dist = Math.hypot(dx, dz);
    const stepLen = speed * dt;
    if (dist <= stepLen) {
      me.position = [next[0], 0, next[2]];
      this.path.shift();
    } else {
      me.position = [me.position[0] + (dx / dist) * stepLen, 0, me.position[2] + (dz / dist) * stepLen];
    }
    if (dist > 0.01) {
      const yaw = Math.atan2(dx, dz);
      let diff = yaw - me.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      me.yaw += diff * Math.min(1, dt * 10);
    }
    me.lastMovedAt = world.now;
    me.flags = MoveFlag.Moving | MoveFlag.Grounded | MoveFlag.Alive | (fast ? MoveFlag.Running : 0);
    // Preso? Recomeça.
    const moved = Math.hypot(me.position[0] - this.lastProgress[0], me.position[2] - this.lastProgress[2]);
    if (moved > 0.5) {
      this.lastProgress = [...me.position];
      this.stuckSince = 0;
    } else if (!this.stuckSince) this.stuckSince = world.now;
    else if (world.now - this.stuckSince > 2500) {
      this.path = [];
      this.goal = 'idle';
      const c = nearestFree(grid, me.position[0], me.position[2]);
      if (c >= 0) {
        const i = c % grid.nx;
        me.position = [grid.x0 + i * grid.step, 0, grid.z0 + ((c - i) / grid.nx) * grid.step];
      }
    }
  }
}
