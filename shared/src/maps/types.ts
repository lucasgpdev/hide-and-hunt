import type { PropTypeId } from '../props/catalog.js';

export type Vec3 = [number, number, number];

/** Tipos de estruturas fixas (sólidas). O cliente escolhe o visual pelo tipo. */
export type SolidKind =
  | 'wall'
  | 'shelf'
  | 'counter'
  | 'checkout'
  | 'freezer'
  | 'produce'
  | 'bench'
  | 'lab_desk'
  | 'teacher_desk'
  | 'chalkboard'
  | 'rack'
  | 'locker'
  | 'pillar'
  | 'bed'
  | 'bookshelf'
  | 'stove'
  | 'car'
  | 'tree'
  | 'pallet'
  | 'fountain'
  | 'elevator'
  | 'forklift'
  | 'hedge';

/** Estrutura fixa alinhada aos eixos (paredes, prateleiras, balcões). */
export interface Solid {
  kind: SolidKind;
  /** Centro da caixa. */
  center: Vec3;
  /** Largura, altura, profundidade. */
  size: Vec3;
  color?: string;
  /** Só colisão: o visual vem do cenário 3D do mapa (MapDefinition.scene). */
  invisible?: boolean;
}

/** Cenário 3D pronto (arquivo glTF) desenhado no lugar das paredes geradas por código. */
export interface MapScene {
  /** Caminho do arquivo em client/public. */
  url: string;
  /** Deslocamento aplicado ao cenário para alinhá-lo às coordenadas do mapa. */
  offset: Vec3;
  /** Direção de onde vem a luz do sol (entra pelas janelas). */
  sunFrom?: Vec3;
  /** Intensidade do sol. */
  sunIntensity?: number;
}

/** Objeto do cenário em que é possível se transformar. */
export interface PropPlacement {
  /** Identificador único dentro do mapa. */
  id: string;
  type: PropTypeId;
  /** Posição da base do objeto. */
  position: Vec3;
  rotationY: number;
}

/** Acabamento do piso (o cliente escolhe a textura PBR correspondente). */
export type FloorSurface = 'tiles' | 'tilesDark' | 'vinyl' | 'concrete' | 'wood' | 'carpet' | 'marble' | 'asphalt' | 'grass';

export interface MapZone {
  name: string;
  /** Retângulo no chão: x mínimo, z mínimo, x máximo, z máximo. */
  rect: [number, number, number, number];
  floorColor: string;
  surface?: FloorSurface;
}

export interface MapLight {
  position: Vec3;
  color: string;
  intensity: number;
  /** A luminária já faz parte do cenário 3D: só a luz é criada. */
  hidden?: boolean;
}

/** Porta interativa (ou passagem secreta disfarçada de parede). */
export interface DoorDef {
  id: string;
  /** Centro da folha da porta quando fechada. */
  center: Vec3;
  /** Tamanho da folha fechada (largura, altura, espessura) já alinhado aos eixos. */
  size: Vec3;
  /** Eixo ao longo do qual a porta se estende quando fechada. */
  axis: 'x' | 'z';
  secret: boolean;
  /** Começa aberta? */
  open: boolean;
}

/** Interruptor que liga/desliga as luzes de uma zona. */
export interface SwitchDef {
  id: string;
  position: Vec3;
  /** Nome da zona controlada (MapZone.name). */
  zone: string;
}

export interface MapDefinition {
  id: string;
  name: string;
  description: string;
  /** Extensão total: largura (x) e profundidade (z), centrada na origem. */
  size: [number, number];
  wallHeight: number;
  theme: { background: string; floor: string; wall: string; ambient: string; fog: string };
  zones: MapZone[];
  solids: Solid[];
  props: PropPlacement[];
  lights: MapLight[];
  doors: DoorDef[];
  switches: SwitchDef[];
  spawns: { hiders: Vec3[]; hunters: Vec3[] };
  /** Cenário 3D pronto; as estruturas do mapa viram só colisão invisível. */
  scene?: MapScene;
  /** Mapa aberto (sem teto), como a cidade. */
  outdoor?: boolean;
  /** Mapa usado só como lobby (não entra na votação). */
  lobbyOnly?: boolean;
}

/** Mapas planejados (item 8). Os não disponíveis ainda não podem ser escolhidos. */
export interface MapCatalogEntry {
  id: string;
  name: string;
  available: boolean;
  description: string;
}
