import type { PropTypeId } from '../props/catalog.js';
import type { DoorDef, FloorSurface, MapDefinition, MapLight, MapZone, PropPlacement, Solid, SolidKind, SwitchDef, Vec3 } from './types.js';

const DOOR_HEIGHT = 2.4;
const WALL_THICKNESS = 0.25;

export interface Door {
  /** Posição do centro da porta ao longo da parede. */
  at: number;
  width: number;
  /** Porta interativa ('door'), passagem secreta ('secret') ou só uma abertura (padrão). */
  kind?: 'door' | 'secret';
  open?: boolean;
}

/**
 * Ajuda a montar mapas a partir de primitivas: paredes com portas,
 * estruturas fixas e objetos. Gera um MapDefinition só com dados, usado
 * igualmente pelo cliente (visual) e pelo servidor (colisões e validação).
 */
export class MapBuilder {
  readonly solids: Solid[] = [];
  readonly props: PropPlacement[] = [];
  readonly lights: MapLight[] = [];
  readonly zones: MapZone[] = [];
  readonly doors: DoorDef[] = [];
  readonly switches: SwitchDef[] = [];
  private counter = 0;
  /** Altura usada pelas paredes criadas agora (casas baixas dentro de um mapa aberto). */
  private currentHeight: number;

  constructor(readonly wallHeight: number) {
    this.currentHeight = wallHeight;
  }

  /** Cria paredes com outra altura (ex.: casas de 3,4 m na cidade). */
  withWallHeight(height: number, build: (b: this) => void): this {
    const previous = this.currentHeight;
    this.currentHeight = height;
    build(this);
    this.currentHeight = previous;
    return this;
  }

  /** Telhado/laje plana cobrindo um retângulo, apoiada no topo das paredes atuais. */
  roof(x0: number, z0: number, x1: number, z1: number, height: number, color = '#5b4a40'): this {
    return this.solid('wall', [(x0 + x1) / 2, height + 0.1, (z0 + z1) / 2], [x1 - x0 + 0.4, 0.2, z1 - z0 + 0.4], color);
  }

  /** Retângulo fechado de paredes (cômodo isolado), com portas em cada lado. */
  room(x0: number, z0: number, x1: number, z1: number, doors: { north?: Door[]; south?: Door[]; west?: Door[]; east?: Door[] } = {}): this {
    this.wallX(z0, x0, x1, doors.north ?? []);
    this.wallX(z1, x0, x1, doors.south ?? []);
    this.wallZ(x0, z0, z1, doors.west ?? []);
    this.wallZ(x1, z0, z1, doors.east ?? []);
    return this;
  }

  solid(kind: SolidKind, center: Vec3, size: Vec3, color?: string): this {
    this.solids.push(color ? { kind, center, size, color } : { kind, center, size });
    return this;
  }

  /** Estrutura apoiada no chão: informe x, z e o tamanho; a altura é calculada. */
  floorSolid(kind: SolidKind, x: number, z: number, size: Vec3, color?: string): this {
    return this.solid(kind, [x, size[1] / 2, z], size, color);
  }

  /** Parede horizontal (ao longo de x) na posição z, de x0 a x1, com portas. */
  wallX(z: number, x0: number, x1: number, doors: Door[] = []): this {
    this.wallSegments(x0, x1, doors, (a, b) => [[(a + b) / 2, z], [b - a, WALL_THICKNESS]]);
    for (const door of doors) {
      this.lintel([door.at, z], [door.width, WALL_THICKNESS], door.kind === 'secret');
      if (door.kind) this.registerDoor(door, [door.at, z], 'x');
    }
    return this;
  }

  /** Parede vertical (ao longo de z) na posição x, de z0 a z1, com portas. */
  wallZ(x: number, z0: number, z1: number, doors: Door[] = []): this {
    this.wallSegments(z0, z1, doors, (a, b) => [[x, (a + b) / 2], [WALL_THICKNESS, b - a]]);
    for (const door of doors) {
      this.lintel([x, door.at], [WALL_THICKNESS, door.width], door.kind === 'secret');
      if (door.kind) this.registerDoor(door, [x, door.at], 'z');
    }
    return this;
  }

  private registerDoor(door: Door, [x, z]: [number, number], axis: 'x' | 'z'): void {
    const secret = door.kind === 'secret';
    // Passagens secretas ocupam a parede toda (parecem parede); portas comuns têm 2,4 m.
    const height = secret ? this.currentHeight : DOOR_HEIGHT;
    const thickness = secret ? WALL_THICKNESS : 0.06;
    this.doors.push({
      id: `${secret ? 'secret' : 'door'}-${this.doors.length + 1}`,
      center: [x, height / 2, z],
      size: axis === 'x' ? [door.width, height, thickness] : [thickness, height, door.width],
      axis,
      secret,
      open: door.open ?? false,
    });
  }

  /** Interruptor de luz da zona, na parede. */
  lightSwitch(zone: string, x: number, z: number): this {
    this.switches.push({ id: `switch-${this.switches.length + 1}`, position: [x, 1.2, z], zone });
    return this;
  }

  private wallSegments(
    start: number,
    end: number,
    doors: Door[],
    toRect: (a: number, b: number) => [[number, number], [number, number]],
  ): void {
    const sorted = [...doors].sort((a, b) => a.at - b.at);
    let cursor = start;
    for (const door of sorted) {
      const doorStart = door.at - door.width / 2;
      if (doorStart > cursor) this.pushWall(...toRect(cursor, doorStart));
      cursor = door.at + door.width / 2;
    }
    if (end > cursor) this.pushWall(...toRect(cursor, end));
  }

  private pushWall([x, z]: [number, number], [w, d]: [number, number]): void {
    this.solid('wall', [x, this.currentHeight / 2, z], [w, this.currentHeight, d]);
  }

  private lintel([x, z]: [number, number], [w, d]: [number, number], secret = false): void {
    if (secret) return; // a passagem secreta cobre a altura toda
    const h = this.currentHeight - DOOR_HEIGHT;
    this.solid('wall', [x, DOOR_HEIGHT + h / 2, z], [w, h, d]);
  }

  /** Paredes externas fechando um retângulo centrado na origem. */
  perimeter(width: number, depth: number): this {
    const hw = width / 2;
    const hd = depth / 2;
    this.wallX(-hd, -hw, hw).wallX(hd, -hw, hw);
    this.wallZ(-hw, -hd, hd).wallZ(hw, -hd, hd);
    return this;
  }

  prop(type: PropTypeId, x: number, z: number, rotationY = 0, y = 0): this {
    this.counter += 1;
    this.props.push({ id: `${type}-${this.counter}`, type, position: [x, y, z], rotationY });
    return this;
  }

  light(x: number, z: number, intensity = 1, color = '#fff4e0', y = this.wallHeight - 0.3): this {
    this.lights.push({ position: [x, y, z], color, intensity });
    return this;
  }

  zone(name: string, rect: [number, number, number, number], floorColor: string, surface?: FloorSurface): this {
    this.zones.push(surface ? { name, rect, floorColor, surface } : { name, rect, floorColor });
    return this;
  }

  build(base: Omit<MapDefinition, 'solids' | 'props' | 'lights' | 'zones' | 'wallHeight' | 'doors' | 'switches'>): MapDefinition {
    return {
      ...base,
      wallHeight: this.wallHeight,
      solids: this.solids,
      props: this.props,
      lights: this.lights,
      zones: this.zones,
      doors: this.doors,
      switches: this.switches,
    };
  }
}
