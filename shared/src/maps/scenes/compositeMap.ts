import type { FloorSurface, MapDefinition, MapLight, MapScene, PropPlacement, Solid, Vec3 } from '../types.js';

/**
 * Mapa aberto montado por script a partir de vários cenários 3D (cômodos
 * ligados por passagens, casca externa com telhado, quintal cercado com
 * árvores). Coordenadas já centradas na origem do mapa.
 */
export interface CompositeMapData {
  id: string;
  name: string;
  description: string;
  size: [number, number];
  wallHeight: number;
  /** Caixas de colisão: x0, z0, x1, z1, base, topo. */
  boxes: [number, number, number, number, number, number][];
  /** Objetos: tipo, x, z, rotação, altura da base. */
  props: [string, number, number, number, number][];
  hiders: [number, number][];
  hunters: [number, number][];
  /** Luzes internas: x, altura, z. */
  lights: [number, number, number][];
  zones: { name: string; rect: [number, number, number, number]; surface: FloorSurface; covered?: boolean }[];
  /** Cenário principal (paredes externas, telhado, cerca). */
  exterior: { url: string; offset: Vec3 };
  /** Cômodos e vegetação. */
  scenes: { url: string; offset: Vec3; rotationY?: number; scale?: number }[];
  theme: MapDefinition['theme'];
  sunFrom: Vec3;
  sunIntensity: number;
  sky: string;
  lightColor?: string;
  lightIntensity?: number;
}

export function compositeMap(data: CompositeMapData): MapDefinition {
  const solids: Solid[] = data.boxes.map(([x0, z0, x1, z1, b, t]) => ({
    kind: 'wall',
    center: [+((x0 + x1) / 2).toFixed(3), +((b + t) / 2).toFixed(3), +((z0 + z1) / 2).toFixed(3)],
    size: [+(x1 - x0).toFixed(3), +(t - b).toFixed(3), +(z1 - z0).toFixed(3)],
    invisible: true,
  }));
  const props: PropPlacement[] = data.props.map(([type, x, z, yaw, y], i) => ({ id: `${type}-${i + 1}`, type, position: [x, y, z], rotationY: yaw }));
  const lights: MapLight[] = data.lights.map(([x, y, z]) => ({
    position: [x, y, z],
    color: data.lightColor ?? '#ffe7c4',
    intensity: data.lightIntensity ?? 0.2,
    hidden: true,
  }));
  const extraScenes: MapScene[] = data.scenes.map((s) => ({ ...s }));
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    size: data.size,
    wallHeight: data.wallHeight,
    theme: data.theme,
    zones: data.zones.map((z) => ({ ...z, floorColor: data.theme.floor })),
    solids,
    props,
    lights,
    doors: [],
    switches: [],
    spawns: { hiders: data.hiders.map(([x, z]) => [x, 0, z]), hunters: data.hunters.map(([x, z]) => [x, 0, z]) },
    scene: {
      url: data.exterior.url,
      offset: data.exterior.offset,
      sunFrom: data.sunFrom,
      sunIntensity: data.sunIntensity,
      sky: data.sky,
      hemisphere: 0.5,
    },
    extraScenes,
  };
}
