import type { FloorSurface, MapDefinition, MapLight, PropPlacement, Solid, Vec3 } from '../types.js';

/**
 * Dados de um mapa feito a partir de um cenário 3D pronto (cenas de pesquisa
 * de renderização publicadas no GitHub). Gerados por script a partir da cena:
 * colisão em caixas (mapa de alturas de 10 cm), objetos transformáveis
 * separados da cena, pontos de nascimento alcançáveis e luzes.
 * Coordenadas já centradas na origem do mapa.
 */
export interface SceneMapData {
  id: string;
  name: string;
  description: string;
  /** Arquivo do cenário em client/public. */
  url: string;
  /** Posição do cenário (o arquivo usa as coordenadas originais). */
  offset: Vec3;
  size: [number, number];
  wallHeight: number;
  /** Caixas de colisão: x0, z0, x1, z1, base, topo. */
  boxes: [number, number, number, number, number, number][];
  /** Objetos: tipo, x, z, rotação, altura da base. */
  props: [string, number, number, number, number][];
  spawns: [number, number][];
  /** Luzes: x, altura, z. */
  lights: [number, number, number][];
  lightColor?: string;
  lightIntensity?: number;
  sunFrom?: Vec3;
  sunIntensity?: number;
  theme: MapDefinition['theme'];
  /** Piso (som dos passos). */
  surface?: FloorSurface;
  /** Panorama visto pelas janelas. */
  sky?: string;
}

export function sceneMap(data: SceneMapData): MapDefinition {
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
    intensity: data.lightIntensity ?? 0.3,
    hidden: true,
  }));
  const all: Vec3[] = data.spawns.map(([x, z]) => [x, 0, z]);
  // Metade para cada equipe quando há pontos de sobra; senão todos servem às duas.
  const hiders = all.length >= 16 ? all.filter((_, i) => i % 2 === 0) : all;
  const hunters = all.length >= 16 ? all.filter((_, i) => i % 2 === 1) : all;
  const [w, d] = data.size;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    size: data.size,
    wallHeight: data.wallHeight,
    theme: data.theme,
    zones: [{ name: data.name, rect: [-w / 2, -d / 2, w / 2, d / 2], floorColor: data.theme.floor, surface: data.surface ?? 'wood' }],
    solids,
    props,
    lights,
    doors: [],
    switches: [],
    spawns: { hiders, hunters },
    scene: {
      url: data.url,
      offset: data.offset,
      ...(data.sunFrom ? { sunFrom: data.sunFrom } : {}),
      ...(data.sunIntensity !== undefined ? { sunIntensity: data.sunIntensity } : {}),
      sky: data.sky ?? 'noon_grass',
    },
  };
}
