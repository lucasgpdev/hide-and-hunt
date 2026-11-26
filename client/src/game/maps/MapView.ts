import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getPropType, type DoorDef, type FloorSurface, type MapDefinition, type MapScene, type Solid } from '@hh/shared';
import type { GameSettings } from '../../settings/settings';
import { pbr, worldBox, type MaterialKey } from '../materials/library';
import { createPropModel } from '../objects/propModels';
import { cachedMapScene, loadMapScene } from './mapScenes';
import { addWind, createGrassField } from '../effects/nature';
import { boxGeometry, canvasTexture, material, ModelBuilder, sphereGeometry } from '../objects/primitives';

const SURFACES: Record<FloorSurface, MaterialKey> = {
  tiles: 'floor.tiles',
  tilesDark: 'floor.tilesDark',
  vinyl: 'floor.vinyl',
  concrete: 'floor.concrete',
  wood: 'floor.wood',
  carpet: 'floor.carpet',
  marble: 'floor.marble',
  asphalt: 'floor.asphalt',
  grass: 'floor.grass',
};

const PRODUCT_COLORS = ['#d94f3d', '#f2b134', '#3c8dd9', '#4fb06d', '#f4f1e8', '#9b59b6', '#f07f3c', '#2bb5b0', '#e84a7f', '#7a5230'];

/** Embalagem genérica: faixa de rótulo e detalhes, tingida por instância. */
const packagingTexture = () =>
  canvasTexture('packaging', 128, 256, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, 128, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 90, 108, 70);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(20, 104, 88, 12);
    ctx.fillRect(20, 124, 60, 8);
    ctx.fillRect(20, 140, 74, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 216, 128, 40);
  });

/**
 * Constrói o visual de um mapa a partir dos dados compartilhados (as mesmas
 * medidas usadas na física do servidor), com materiais PBR.
 *
 * Desempenho: tudo o que é estático é agrupado por material em poucas malhas
 * (de centenas para algumas dezenas de chamadas de desenho). Para a mira,
 * cada objeto e estrutura tem uma caixa invisível de colisão de raio.
 */
export class MapView {
  readonly root = new THREE.Group();
  /** Caixas invisíveis dos objetos do cenário (mira). */
  readonly propMeshes: THREE.Object3D[] = [];
  /** Caixas invisíveis das estruturas (bloqueiam a mira). */
  readonly solidMeshes: THREE.Object3D[] = [];
  /** Luzes do mapa (apagão e luzes piscando mexem nelas). */
  readonly pointLights: THREE.PointLight[] = [];
  readonly lightPanels: THREE.Mesh[] = [];
  private readonly proxies = new THREE.Group();
  private readonly owned: { dispose(): void }[] = [];
  readonly sun: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  /** Intensidades de referência (o ciclo de luz da partida multiplica estes valores). */
  readonly baseHemisphere: number;
  readonly baseSun: number;
  /** Objetos empurráveis (desenhados à parte para poderem se mover). */
  readonly pushables = new Map<string, { model: THREE.Object3D; proxy: THREE.Object3D; height: number }>();
  /** Portas: pivô (dobradiça), definição e quanto está aberta (0..1). */
  readonly doorViews = new Map<string, { pivot: THREE.Object3D; def: DoorDef; amount: number; target: number }>();
  /** Caixas invisíveis de portas e interruptores (mira para interagir). */
  readonly interactables: THREE.Object3D[] = [];
  /** Zona de cada luz/painel (para o interruptor). */
  private readonly lightZones = new Map<THREE.Object3D, string>();

  constructor(
    readonly map: MapDefinition,
    settings: GameSettings,
  ) {
    const [w, d] = map.size;
    const staticRoot = new THREE.Group();
    const scene = map.scene;

    // Pisos por zona (o piso base cobre o que sobrar). Cenários 3D já trazem piso e teto.
    if (!scene) {
      staticRoot.add(this.floor(w, d, 0, 0, 'floor.concrete', 0));
      map.zones.forEach((zone, index) => {
        const [x0, z0, x1, z1] = zone.rect;
        staticRoot.add(this.floor(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, SURFACES[zone.surface ?? 'tiles'], 0.002 + index * 0.0004));
      });
    } else {
      for (const def of [scene, ...(map.extraScenes ?? [])]) {
        const ready = cachedMapScene(def.url);
        if (ready) this.addScene(ready, def);
        else void loadMapScene(def.url).then((loaded) => loaded && !this.disposed && this.addScene(loaded, def));
      }
      // Áreas abertas (quintal, pátio) ganham piso gerado; os cômodos já trazem o seu.
      // Zonas maiores ficam por baixo (o pátio aparece sobre o gramado em volta).
      const open = map.zones.filter((zone) => !zone.covered);
      const area = (z: (typeof open)[number]) => (z.rect[2] - z.rect[0]) * (z.rect[3] - z.rect[1]);
      [...open].sort((a, b) => area(b) - area(a)).forEach((zone, rank) => {
        const [x0, z0, x1, z1] = zone.rect;
        staticRoot.add(this.floor(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, SURFACES[zone.surface ?? 'grass'], -0.03 + rank * 0.004));
      });
      // Tufos de grama com flores (balançam com o vento) nas áreas de grama.
      if (settings.graphics !== 'low' && open.length) {
        // Celular: metade da grama (o mesmo visual de longe, bem menos para desenhar).
        const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
        const density = (settings.graphics === 'high' ? 5 : 3) * (phone ? 0.5 : 1);
        const houses = map.zones.filter((z) => z.covered).map((z) => [z.rect[0] - 0.8, z.rect[1] - 0.8, z.rect[2] + 0.8, z.rect[3] + 0.8] as [number, number, number, number]);
        const sorted = [...open].sort((a, b) => area(a) - area(b));
        const yard = sorted[0]!;
        if (yard.surface === 'grass' || yard.surface === undefined) {
          this.addGrass(createGrassField(yard.rect, houses, density));
        }
        // Faixa de grama do lado de fora da cerca (mais rala).
        const outer = sorted[sorted.length - 1]!;
        if (outer !== yard && (outer.surface ?? 'grass') === 'grass') {
          const [a, b, c, d] = yard.rect;
          const band: [number, number, number, number] = [a - 14, b - 14, c + 14, d + 14];
          this.addGrass(createGrassField(band, [[a - 0.2, b - 0.2, c + 0.2, d + 0.2], ...houses], density * 0.45));
        }
      }
    }

    // Teto com placas de forro (mapas abertos, como a cidade, não têm teto).
    if (!map.outdoor && !scene) {
      const ceiling = new THREE.Mesh(planeGeometry(w, d), pbr('ceiling'));
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = map.wallHeight;
      ceiling.receiveShadow = false;
      staticRoot.add(ceiling);
    }

    for (const solid of map.solids) staticRoot.add(this.solid(solid));

    for (const placement of map.props) {
      const model = createPropModel(placement.type);
      model.position.set(...placement.position);
      model.rotation.y = placement.rotationY;
      const type = getPropType(placement.type);
      if (type?.pushable) {
        model.traverse((child) => (child.userData.keepSeparate = true));
        this.root.add(model);
      } else {
        staticRoot.add(model);
      }
      if (type) {
        const proxy = this.proxy(type.size[0], Math.max(0.05, type.size[1]), type.size[2]);
        proxy.position.set(placement.position[0], placement.position[1] + type.size[1] / 2, placement.position[2]);
        proxy.rotation.y = placement.rotationY;
        proxy.userData = { propId: placement.id, propType: placement.type, pushable: Boolean(type.pushable) };
        this.propMeshes.push(proxy);
        if (type.pushable) this.pushables.set(placement.id, { model, proxy, height: type.size[1] });
      }
    }
    for (const door of map.doors) this.addDoor(door);
    for (const sw of map.switches) this.addSwitch(sw.id, sw.position, sw.zone);

    // Painéis de luz do teto (emissivos) e luzes pontuais.
    const maxPointLights = settings.graphics === 'high' ? 16 : settings.graphics === 'medium' ? 8 : 0;
    const step = Math.max(1, Math.ceil(map.lights.length / Math.max(1, maxPointLights)));
    map.lights.forEach((light, index) => {
      const outdoor = Boolean(map.outdoor);
      if (light.hidden) {
        // A luminária faz parte do cenário 3D: só a luz.
        if (maxPointLights > 0 && index % step === 0) this.addPointLight(light.position, light.color, light.intensity, 0.35);
        return;
      }
      const panel = new THREE.Mesh(
        outdoor ? sphereGeometry(0.22, 2) : boxGeometry(1.2, 0.04, 0.6),
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: light.color, emissiveIntensity: 2.2 }),
      );
      this.owned.push(panel.material);
      panel.position.set(light.position[0], outdoor ? light.position[1] : Math.min(map.wallHeight, light.position[1] + 0.3) - 0.02, light.position[2]);
      if (outdoor) staticRoot.add(this.lampPost(light.position[0], light.position[1], light.position[2]));
      this.lightPanels.push(panel);
      this.lightZones.set(panel, this.zoneAt(light.position[0], light.position[2]));
      this.root.add(panel);
      if (maxPointLights > 0 && index % step === 0) {
        const point = new THREE.PointLight(light.color, light.intensity * 14, 16, 1.5);
        point.position.set(light.position[0], light.position[1] - (map.outdoor ? 0.3 : 0.2), light.position[2]);
        point.userData.baseIntensity = point.intensity;
        this.lightZones.set(point, this.zoneAt(light.position[0], light.position[2]));
        this.pointLights.push(point);
        this.root.add(point);
      }
    });

    this.root.add(this.mergeStatic(staticRoot));
    this.proxies.updateMatrixWorld(true);

    // Mapas abertos são noturnos: luar azulado no lugar da luz de janela.
    this.baseHemisphere = map.outdoor ? 0.35 : scene?.hemisphere ?? 0.35;
    this.baseSun = scene?.sunIntensity ?? 1.6;
    this.hemisphere = new THREE.HemisphereLight(map.outdoor ? '#5d6f9c' : '#dfe6ff', '#3a342c', map.outdoor ? 0.25 : scene ? (scene.hemisphere ?? 0.15) : 0.35);
    this.root.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(map.outdoor ? '#a9bcff' : '#fff3df', scene?.sunIntensity ?? (map.outdoor ? 0.7 : 1.6));
    if (scene?.sunFrom) {
      // Sol baixo entrando pelas janelas (sombras das persianas no chão).
      const dir = new THREE.Vector3(...scene.sunFrom).normalize();
      this.sun.position.copy(dir.multiplyScalar(Math.max(14, Math.max(w, d) / 2 + 12)));
      this.sun.color.set('#ffe6c2');
    } else {
      this.sun.position.set(w * 0.15, map.wallHeight + 14, d * 0.2);
    }
    this.sun.castShadow = settings.shadows && settings.graphics !== 'low';
    const shadowSize = settings.graphics === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const cam = this.sun.shadow.camera;
    // Camada 1: o próprio corpo em 1ª pessoa (invisível para a câmera, mas faz sombra).
    cam.layers.enable(1);
    const extent = Math.max(w, d) / 2 + 2;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = map.wallHeight + 40 + Math.max(w, d);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.root.add(this.sun, this.sun.target);
  }

  /** Coloca um objeto empurrável na pose recebida do servidor (centro + rotação). */
  setPropPose(id: string, x: number, y: number, z: number, q: THREE.Quaternion): void {
    const entry = this.pushables.get(id);
    if (!entry) return;
    entry.proxy.position.set(x, y, z);
    entry.proxy.quaternion.copy(q);
    entry.proxy.updateMatrixWorld();
    const offset = new THREE.Vector3(0, -entry.height / 2, 0).applyQuaternion(q);
    entry.model.position.set(x + offset.x, y + offset.y, z + offset.z);
    entry.model.quaternion.copy(q);
  }

  setDoorOpen(id: string, open: boolean): void {
    const door = this.doorViews.get(id);
    if (door) door.target = open ? 1 : 0;
  }

  /**
   * Luzes: multiplicador geral (eventos, ciclo de iluminação) e zonas com o
   * interruptor desligado.
   */
  setLighting(factor: number, zonesOff: Set<string>): void {
    for (const light of this.pointLights) {
      const off = zonesOff.has(this.lightZones.get(light) ?? '');
      light.intensity = (light.userData.baseIntensity as number) * (off ? 0 : factor);
    }
    for (const panel of this.lightPanels) {
      const off = zonesOff.has(this.lightZones.get(panel) ?? '');
      const base = (panel.material as THREE.Material).userData.baseEmissive as number | undefined;
      (panel.material as THREE.MeshStandardMaterial).emissiveIntensity = off ? 0.02 : (base ?? 2.2) * factor;
    }
  }

  update(dt: number): void {
    for (const door of this.doorViews.values()) {
      if (door.amount === door.target) continue;
      const step = dt * 2.5;
      door.amount = door.target > door.amount ? Math.min(door.target, door.amount + step) : Math.max(door.target, door.amount - step);
      const eased = door.amount * door.amount * (3 - 2 * door.amount);
      if (door.def.secret) {
        // Passagem secreta desliza para dentro da parede.
        door.pivot.position.y = -eased * (door.def.size[1] - 0.05);
      } else {
        door.pivot.rotation.y = eased * (Math.PI / 2) * 0.95;
      }
    }
  }

  private zoneAt(x: number, z: number): string {
    // A última zona que contém o ponto é a mais específica.
    let name = '';
    for (const zone of this.map.zones) {
      const [x0, z0, x1, z1] = zone.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) name = zone.name;
    }
    return name;
  }

  private addDoor(def: DoorDef): void {
    const [cx, cy, cz] = def.center;
    const [sx, sy, sz] = def.size;
    const width = def.axis === 'x' ? sx : sz;
    const hinge = new THREE.Group();
    // Dobradiça numa das pontas; a folha se estende ao longo do eixo.
    if (def.axis === 'x') hinge.position.set(cx - sx / 2, 0, cz);
    else hinge.position.set(cx, 0, cz - sz / 2);
    const pivot = new THREE.Group();
    hinge.add(pivot);
    const b = new ModelBuilder();
    if (def.secret) {
      b.box(sx, sy, sz, 'wall.paint', 0, 0, 0);
      if (cy - sy / 2 < 0.01) b.box(sx + 0.01, 0.1, sz + 0.01, 'wood.dark', 0, 0, 0);
    } else {
      b.box(sx, sy, sz, 'wood.light', 0, 0, 0);
      const handleSide = def.axis === 'x' ? [sx / 2 - 0.12, 0, 0] : [0, 0, sz / 2 - 0.12];
      for (const s of [-1, 1]) {
        const handle = b.rbox(0.03, 0.03, 0.14, 0.012, 'metal.steel', handleSide[0]!, 1.0, handleSide[2]!);
        if (def.axis === 'x') handle.position.z = (s * (sz / 2 + 0.03));
        else {
          handle.rotation.y = Math.PI / 2;
          handle.position.x = s * (sx / 2 + 0.03);
        }
      }
    }
    const leaf = b.group;
    if (def.axis === 'x') leaf.position.set(sx / 2, cy - sy / 2, 0);
    else leaf.position.set(0, cy - sy / 2, sz / 2);
    pivot.add(leaf);
    this.root.add(hinge);
    const view = { pivot, def, amount: def.open ? 1 : 0, target: def.open ? 1 : 0 };
    this.doorViews.set(def.id, view);
    if (def.open) {
      if (def.secret) pivot.position.y = -(sy - 0.05);
      else pivot.rotation.y = (Math.PI / 2) * 0.95;
    }
    const proxy = this.proxy(def.axis === 'x' ? width : 0.4, Math.min(2.4, sy), def.axis === 'x' ? 0.4 : width);
    proxy.position.set(cx, Math.min(2.4, sy) / 2, cz);
    proxy.userData = { doorId: def.id, secret: def.secret };
    this.interactables.push(proxy);
  }

  /** Cenário 3D pronto: clonado (compartilha geometria/texturas) e alinhado ao mapa. */
  private addScene(template: THREE.Object3D, scene: MapScene): void {
    const clone = template.clone(true);
    clone.position.set(...scene.offset);
    if (scene.rotationY) clone.rotation.y = scene.rotationY;
    if (scene.scale) clone.scale.setScalar(scene.scale);
    if (scene.castShadow === false) clone.traverse((child) => (child.castShadow = false));
    // Folhas das árvores e arbustos balançam com o vento.
    if (scene.url.startsWith('/models/yard/')) {
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (m.alphaTest > 0 || /leaf|leaves|twig|shrub/i.test(m.name)) addWind(m, 1);
        }
      });
    }
    clone.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.lamp) return;
      // Cada luminária ganha material próprio para o interruptor apagar só a sua zona.
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      this.owned.push(mesh.material);
      mesh.getWorldPosition(world);
      this.lightPanels.push(mesh);
      this.lightZones.set(mesh, this.zoneAt(world.x, world.z));
    });
    this.root.add(clone);
  }

  private addPointLight(position: [number, number, number], color: string, intensity: number, drop: number): void {
    const point = new THREE.PointLight(color, intensity * 14, 16, 1.5);
    point.position.set(position[0], position[1] - drop, position[2]);
    point.userData.baseIntensity = point.intensity;
    this.lightZones.set(point, this.zoneAt(position[0], position[2]));
    this.pointLights.push(point);
    this.root.add(point);
  }

  private addSwitch(id: string, position: [number, number, number], zone: string): void {
    if (this.map.scene) {
      // O interruptor já existe no cenário 3D: só a caixa de interação.
      const proxy = this.proxy(0.35, 0.35, 0.35);
      proxy.position.set(...position);
      proxy.userData = { switchId: id, zone };
      this.interactables.push(proxy);
      return;
    }
    const b = new ModelBuilder();
    b.rbox(0.09, 0.13, 0.09, 0.01, 'plastic.white', 0, -0.065, 0);
    b.box(0.025, 0.05, 0.1, '#d8d4ca', 0, -0.025, 0);
    b.group.position.set(...position);
    this.root.add(b.group);
    const proxy = this.proxy(0.35, 0.35, 0.35);
    proxy.position.set(...position);
    proxy.userData = { switchId: id, zone };
    this.interactables.push(proxy);
  }

  private disposed = false;

  private addGrass(field: THREE.Group): void {
    this.root.add(field);
    this.owned.push({ dispose: () => (field.userData.dispose as () => void)() });
  }

  dispose(): void {
    this.disposed = true;
    for (const item of this.owned) item.dispose();
    this.sun.shadow.map?.dispose();
    this.root.removeFromParent();
  }

  // ---------- construção ----------

  private floor(w: number, d: number, x: number, z: number, key: MaterialKey, y: number): THREE.Mesh {
    const mesh = new THREE.Mesh(planeGeometry(w, d), pbr(key));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  }

  private proxy(w: number, h: number, d: number): THREE.Mesh {
    const mesh = new THREE.Mesh(boxGeometry(w, h, d));
    mesh.visible = false;
    this.proxies.add(mesh);
    return mesh;
  }

  private solid(solid: Solid): THREE.Group {
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    if (solid.invisible) {
      const proxy = this.proxy(sx, sy, sz);
      proxy.position.set(cx, cy, cz);
      this.solidMeshes.push(proxy);
      return new THREE.Group();
    }
    const baseY = cy - sy / 2;
    const b = new ModelBuilder();
    const alongX = sx >= sz;
    const length = alongX ? sx : sz;
    const depth = alongX ? sz : sx;
    // Posição ao longo do comprimento e da profundidade, nos eixos certos.
    const at = (along: number, across: number): [number, number] => (alongX ? [along, across] : [across, along]);
    const dims = (l: number, dd: number): [number, number] => (alongX ? [l, dd] : [dd, l]);

    switch (solid.kind) {
      case 'wall': {
        b.box(sx, sy, sz, solid.color ? (solid.color as string) : 'wall.paint', 0, 0, 0);
        if (baseY < 0.01) b.box(sx + 0.02, 0.1, sz + 0.02, 'wood.dark', 0, 0, 0);
        break;
      }
      case 'shelf':
      case 'rack': {
        const frame: MaterialKey = solid.kind === 'rack' ? 'metal.painted' : 'metal.steel';
        const levels = 4;
        for (const e of [-1, 1]) {
          for (const s of [-1, 1]) {
            const [x, z] = at((e * length) / 2 - e * 0.03, (s * depth) / 2 - s * 0.03);
            b.box(0.05, sy, 0.05, solid.kind === 'rack' ? '#c4632b' : frame, x, 0, z, { roughness: 0.45, metalness: 0.5 });
          }
        }
        const [bw, bd] = dims(length, 0.03);
        if (solid.kind === 'shelf') b.box(bw, sy * 0.96, bd, 'metal.painted', 0, 0, 0);
        for (let i = 0; i < levels; i++) {
          const y = 0.08 + (i * (sy - 0.15)) / (levels - 1);
          b.box(sx, 0.035, sz, frame, 0, y, 0);
          if (i < levels - 1) this.addProducts(b, alongX, length, depth, y + 0.035, (sy - 0.15) / (levels - 1) - 0.08, solid.kind === 'rack');
        }
        break;
      }
      case 'freezer': {
        b.box(sx, sy, sz, 'metal.painted', 0, 0, 0);
        const [gw, gd] = dims(length * 0.96, 0.02);
        const [gx, gz] = at(0, depth / 2 + 0.005);
        b.box(gw, sy * 0.72, gd, material('#ccf0ff', { emissive: '#9fdcff', emissiveIntensity: 0.6, transparent: true, opacity: 0.55, roughness: 0.05 }), gx, 0.3, gz);
        for (let i = 1; i < 6; i++) {
          const [mx, mz] = at(-length / 2 + (i * length) / 6, depth / 2 + 0.012);
          const [mw, md] = dims(0.04, 0.02);
          b.box(mw, sy * 0.74, md, 'metal.steel', mx, 0.29, mz);
        }
        break;
      }
      case 'produce': {
        b.box(sx, sy * 0.65, sz, 'wood.dark', 0, 0, 0);
        this.addFruit(b, alongX, length, depth, sy * 0.65);
        break;
      }
      case 'counter':
      case 'teacher_desk':
      case 'lab_desk':
      case 'bench': {
        if (solid.kind === 'bench' && sy < 0.6) {
          b.rbox(sx, 0.06, sz, 0.02, 'wood.light', 0, sy - 0.06, 0);
          for (const e of [-1, 1]) {
            const [x, z] = at((e * (length - 0.15)) / 2, 0);
            const [lw, ld] = dims(0.05, depth * 0.9);
            b.box(lw, sy - 0.06, ld, 'metal.dark', x, 0, z);
          }
        } else if (solid.kind === 'lab_desk' || solid.kind === 'teacher_desk' || solid.kind === 'bench') {
          b.rbox(sx, 0.04, sz, 0.01, solid.kind === 'bench' ? 'wood.dark' : 'wood.light', 0, sy - 0.04, 0);
          const legs = Math.max(2, Math.round(length / 1.6));
          for (let i = 0; i < legs; i++) {
            for (const s of [-1, 1]) {
              const [x, z] = at(-length / 2 + 0.06 + (i * (length - 0.12)) / (legs - 1), (s * (depth - 0.1)) / 2);
              b.box(0.04, sy - 0.04, 0.04, 'metal.dark', x, 0, z);
            }
          }
          if (solid.kind !== 'bench') {
            const [pw, pd] = dims(length - 0.1, 0.02);
            const [px, pz] = at(0, -depth / 2 + 0.05);
            b.box(pw, 0.35, pd, 'wood.light', px, sy - 0.4, pz);
          }
        } else {
          b.rbox(sx, 0.05, sz, 0.015, 'floor.tilesDark', 0, sy - 0.05, 0);
          b.box(sx * 0.98, sy - 0.05, sz * 0.92, 'wood.dark', 0, 0, 0);
        }
        break;
      }
      case 'checkout': {
        b.box(sx, sy - 0.05, sz, 'metal.painted', 0, 0, 0);
        b.box(sx * 0.85, 0.02, sz * 0.7, '#151719', 0, sy - 0.05, -0.2, { roughness: 0.6 });
        b.rbox(sx, 0.05, sz, 0.015, 'metal.steel', 0, sy - 0.05, 0);
        b.rbox(0.35, 0.25, 0.05, 0.01, 'plastic.dark', 0, sy, sz / 2 - 0.25);
        b.box(0.3, 0.18, 0.005, '#1b2a3d', 0, sy + 0.04, sz / 2 - 0.222, { emissive: '#22476e', emissiveIntensity: 1.2 });
        break;
      }
      case 'chalkboard': {
        b.box(sx, sy, sz, '#29523e', 0, 0, 0, { roughness: 0.95 });
        b.box(sx + 0.08, 0.05, sz + 0.08, 'wood.light', 0, -0.05, 0);
        b.box(sx + 0.08, 0.05, sz + 0.04, 'wood.light', 0, sy, 0);
        break;
      }
      case 'locker': {
        b.box(sx, sy, sz, '#3f6fa8', 0, 0, 0, { roughness: 0.4, metalness: 0.5 });
        const doors = Math.max(2, Math.round(length / 0.4));
        for (let i = 1; i < doors; i++) {
          const [x, z] = at(-length / 2 + (i * length) / doors, 0);
          const [lw, ld] = dims(0.01, depth + 0.01);
          b.box(lw, sy * 0.96, ld, '#2b4e78', x, 0.02, z);
        }
        for (let i = 0; i < doors; i++) {
          for (const s of [-1, 1]) {
            const [x, z] = at(-length / 2 + ((i + 0.5) * length) / doors + 0.12, (s * depth) / 2 + s * 0.006);
            b.box(0.02, 0.1, 0.02, 'metal.steel', x, sy * 0.55, z);
          }
        }
        break;
      }
      case 'pillar':
        b.box(sx, sy, sz, solid.color ?? 'wall.paintWarm', 0, 0, 0);
        break;
      case 'bed': {
        // Estrutura, colchão, travesseiro e cobertor dobrado.
        b.rbox(sx, 0.32, sz, 0.03, 'wood.dark', 0, 0, 0);
        b.rbox(sx * 0.96, 0.2, sz * 0.96, 0.06, 'plastic.white', 0, 0.32, 0);
        const [hx, hz] = at(-length / 2 + 0.05, 0);
        const [hw, hd] = dims(0.08, depth);
        b.box(hw, Math.max(0.9, sy), hd, 'wood.dark', hx, 0, hz);
        const [px, pz] = at(-length / 2 + 0.38, 0);
        const [pw, pd] = dims(0.4, depth * 0.7);
        b.rbox(pw, 0.12, pd, 0.05, '#f3f1ea', px, 0.52, pz);
        const [cx2, cz2] = at(length * 0.12, 0);
        const [cw, cd] = dims(length * 0.62, depth * 0.98);
        b.rbox(cw, 0.06, cd, 0.03, solid.color ?? 'fabric.blue', cx2, 0.5, cz2);
        break;
      }
      case 'bookshelf': {
        b.box(sx, sy, sz, 'wood.dark', 0, 0, 0);
        const [fx, fz] = at(0, depth / 2 - 0.02);
        const [fw, fd] = dims(length - 0.08, 0.03);
        b.box(fw, sy - 0.08, fd, '#2a1d12', fx, 0.04, fz);
        this.addBooks(b, alongX, length, depth, sy);
        break;
      }
      case 'stove': {
        b.box(sx, sy - 0.04, sz, 'metal.steel', 0, 0, 0);
        b.rbox(sx, 0.04, sz, 0.01, 'metal.dark', 0, sy - 0.04, 0);
        const burners = Math.max(2, Math.floor(length / 0.45));
        for (let i = 0; i < burners; i++) {
          for (const s2 of [-1, 1]) {
            const [x, z] = at(-length / 2 + (i + 0.5) * (length / burners), s2 * depth * 0.22);
            b.cyl(0.1, 0.1, 0.02, '#151515', x, sy, z, 20, { roughness: 0.5, metalness: 0.6 });
          }
        }
        for (let i = 0; i < Math.max(1, Math.floor(length / 0.8)); i++) {
          const [x, z] = at(-length / 2 + 0.4 + i * 0.8, depth / 2 + 0.005);
          const [dw, dd] = dims(0.6, 0.01);
          b.box(dw, sy * 0.5, dd, 'metal.dark', x, 0.12, z);
        }
        break;
      }
      case 'car': {
        const color = solid.color ?? '#7a1f22';
        const paint = { roughness: 0.25, metalness: 0.6 };
        b.rbox(sx, sy * 0.45, sz, 0.12, color, 0, 0.25, 0, paint);
        const [cw, cd] = dims(length * 0.55, depth * 0.9);
        const [cx2, cz2] = at(-length * 0.05, 0);
        b.rbox(cw, sy * 0.38, cd, 0.12, color, cx2, 0.25 + sy * 0.42, cz2, paint);
        const [gw, gd] = dims(length * 0.5, depth * 0.92);
        b.rbox(gw, sy * 0.26, gd, 0.08, 'glass', cx2, 0.25 + sy * 0.47, cz2);
        for (const e of [-1, 1]) {
          for (const s2 of [-1, 1]) {
            const [wx, wz] = at(e * length * 0.32, s2 * (depth / 2 - 0.08));
            const wheel = b.cyl(0.32, 0.32, 0.22, '#141414', wx, 0, wz, 24, { roughness: 0.85 });
            wheel.position.y = 0.32;
            wheel.rotation[alongX ? 'x' : 'z'] = Math.PI / 2;
          }
          const [lx, lz] = at(e * (length / 2 + 0.005), 0);
          const [lw, ld] = dims(0.02, depth * 0.7);
          b.box(lw, 0.1, ld, e > 0 ? '#fff6d8' : '#c21d1d', lx, 0.55, lz, { emissive: e > 0 ? '#fff1c0' : '#ff2020', emissiveIntensity: 0.6 });
        }
        break;
      }
      case 'tree': {
        b.cyl(sx * 0.22, sx * 0.3, sy * 0.55, '#5b4330', 0, 0, 0, 12, { roughness: 0.95 });
        const leaves = { roughness: 0.9 };
        b.sphere(sx * 1.5, '#3f6b2f', 0, sy * 0.68, 0, leaves);
        b.sphere(sx * 1.1, '#4b7a35', sx * 0.7, sy * 0.78, sx * 0.3, leaves);
        b.sphere(sx * 1.05, '#365e29', -sx * 0.6, sy * 0.82, -sx * 0.4, leaves);
        b.sphere(sx * 0.95, '#467432', 0, sy * 0.95, 0, leaves);
        break;
      }
      case 'hedge':
        b.rbox(sx, sy, sz, 0.15, '#3e6a2e', 0, 0, 0, { roughness: 1 });
        break;
      case 'pallet': {
        b.box(sx, 0.14, sz, 'wood.light', 0, 0, 0);
        b.box(sx * 0.96, sy - 0.18, sz * 0.96, 'cardboard', 0, 0.14, 0);
        b.box(sx * 0.98, sy - 0.16, sz * 0.98, '#dfe6ea', 0, 0.14, 0, { transparent: true, opacity: 0.25, roughness: 0.15 });
        break;
      }
      case 'forklift': {
        b.rbox(sx, sy * 0.45, sz, 0.06, '#e0a419', 0, 0.2, 0, { roughness: 0.5, metalness: 0.3 });
        const [mx, mz] = at(length / 2 - 0.05, 0);
        const [mw, md] = dims(0.1, depth * 0.8);
        b.box(mw, sy, md, 'metal.dark', mx, 0, mz);
        const [rx, rz] = at(-length * 0.1, 0);
        const [rw, rd] = dims(length * 0.5, depth * 0.95);
        b.box(rw, 0.06, rd, 'metal.dark', rx, sy - 0.06, rz);
        for (const e of [-1, 1]) {
          for (const s2 of [-1, 1]) {
            const [wx, wz] = at(e * length * 0.3, s2 * (depth / 2 - 0.05));
            const wheel = b.cyl(0.22, 0.22, 0.16, '#141414', wx, 0, wz, 20, { roughness: 0.85 });
            wheel.position.y = 0.22;
            wheel.rotation[alongX ? 'x' : 'z'] = Math.PI / 2;
          }
        }
        break;
      }
      case 'fountain': {
        const r = Math.min(sx, sz) / 2;
        b.cyl(r, r, sy - 0.1, 'wall.paintWarm', 0, 0, 0, 40);
        // Espelho d'água dentro de uma borda em anel.
        b.cyl(r * 0.92, r * 0.92, 0.02, '#3d7895', 0, sy - 0.1, 0, 40, { roughness: 0.04, metalness: 0.3 });
        const rim = b.add(new THREE.TorusGeometry(r * 0.94, Math.min(0.12, r * 0.08), 10, 48), 'wall.paintWarm', 0, sy - 0.06, 0);
        rim.rotation.x = Math.PI / 2;
        b.cyl(0.12, 0.18, 1.3, 'wall.paintWarm', 0, sy, 0, 16);
        b.cyl(r * 0.35, r * 0.2, 0.12, 'wall.paintWarm', 0, sy + 1.3, 0, 24);
        break;
      }
      case 'elevator': {
        b.box(sx, sy, sz, 'metal.dark', 0, 0, 0);
        const [dx, dz] = at(0, depth / 2 + 0.005);
        for (const e of [-1, 1]) {
          const [ox, oz] = at(e * length * 0.22, 0);
          const [dw, dd] = dims(length * 0.42, 0.02);
          b.box(dw, Math.min(2.3, sy * 0.9), dd, 'metal.steel', dx + ox, 0, dz + oz);
        }
        const [ix, iz] = at(length / 2 - 0.12, depth / 2 + 0.02);
        b.box(0.08, 0.14, 0.02, '#1b1b1b', ix, 1.2, iz, { emissive: '#ffb547', emissiveIntensity: 0.8 });
        break;
      }
    }

    const proxy = this.proxy(sx, sy, sz);
    proxy.position.set(cx, cy, cz);
    this.solidMeshes.push(proxy);

    b.group.position.set(cx, baseY, cz);
    return b.group;
  }

  /** Produtos embalados nas prateleiras (uma única chamada de desenho por prateleira). */
  private addProducts(b: ModelBuilder, alongX: boolean, length: number, depth: number, y: number, maxHeight: number, boxes: boolean): void {
    const count = Math.floor(length / (boxes ? 0.55 : 0.16));
    const rows = boxes ? 1 : 2;
    const mat = boxes ? pbr('cardboard') : new THREE.MeshStandardMaterial({ map: packagingTexture(), roughness: 0.55 });
    if (!boxes) this.owned.push(mat);
    const mesh = new THREE.InstancedMesh(boxes ? worldBox(1, 1, 1) : boxGeometry(1, 1, 1), mat, count * rows);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    let index = 0;
    for (let i = 0; i < count; i++) {
      for (let r = 0; r < rows; r++) {
        const seed = Math.sin((i + 1) * 12.9898 + y * 78.233 + r * 3.1) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const h = Math.min(maxHeight, boxes ? 0.35 + rnd * 0.25 : 0.14 + rnd * 0.2);
        const w = boxes ? 0.45 : 0.11 + rnd * 0.03;
        const dd = boxes ? depth * 0.8 : depth * 0.4;
        const along = -length / 2 + (i + 0.5) * (length / count);
        const across = boxes ? 0 : (r === 0 ? -1 : 1) * depth * 0.23;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd - 0.5) * 0.08);
        m.compose(
          new THREE.Vector3(alongX ? along : across, y + h / 2, alongX ? across : along),
          q,
          new THREE.Vector3(alongX ? w : dd, h, alongX ? dd : w),
        );
        mesh.setMatrixAt(index, m);
        color.set(boxes ? '#ffffff' : PRODUCT_COLORS[Math.floor(rnd * PRODUCT_COLORS.length)]!);
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.keepSeparate = true;
    b.group.add(mesh);
  }

  /** Livros coloridos nas prateleiras de uma estante. */
  private addBooks(b: ModelBuilder, alongX: boolean, length: number, depth: number, height: number): void {
    const shelves = Math.max(2, Math.floor(height / 0.4));
    const perShelf = Math.floor((length - 0.1) / 0.045);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.owned.push(mat);
    const mesh = new THREE.InstancedMesh(boxGeometry(1, 1, 1), mat, shelves * perShelf);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const colors = ['#7b2d26', '#2d4a6b', '#3c5e35', '#a07a2c', '#5b3a6e', '#8a8478', '#1f2a33', '#b4532a'];
    let index = 0;
    for (let s = 0; s < shelves; s++) {
      const y = 0.06 + (s * (height - 0.1)) / shelves;
      let cursor = -length / 2 + 0.06;
      for (let i = 0; i < perShelf; i++) {
        const seed = Math.sin((s * 97 + i + 1) * 12.9898 + length) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const w = 0.03 + rnd * 0.025;
        if (cursor + w > length / 2 - 0.06) break;
        const h = Math.min(0.34, 0.2 + rnd * 0.13);
        const along = cursor + w / 2;
        cursor += w + 0.003;
        m.makeScale(alongX ? w : depth * 0.75, h, alongX ? depth * 0.75 : w);
        m.setPosition(alongX ? along : 0, y + h / 2, alongX ? 0 : along);
        mesh.setMatrixAt(index, m);
        color.set(colors[Math.floor(rnd * colors.length)]!);
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    mesh.count = index;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.keepSeparate = true;
    b.group.add(mesh);
  }

  /** Poste de iluminação pública (mapas abertos). */
  private lampPost(x: number, y: number, z: number): THREE.Group {
    const b = new ModelBuilder();
    b.cyl(0.07, 0.09, y, 'metal.dark', 0, 0, 0, 12);
    b.cyl(0.25, 0.12, 0.18, 'metal.dark', 0, y - 0.05, 0, 16);
    b.group.position.set(x, 0, z);
    return b.group;
  }

  /** Frutas e verduras sobre a banca do hortifrúti. */
  private addFruit(b: ModelBuilder, alongX: boolean, length: number, depth: number, y: number): void {
    const colors = ['#d93b2b', '#f5a623', '#7cb342', '#ffd54f', '#8e24aa', '#ff7043'];
    const perSection = 18;
    const sections = colors.length;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.owned.push(mat);
    const mesh = new THREE.InstancedMesh(sphereGeometry(1, 2), mat, perSection * sections);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    let index = 0;
    for (let s = 0; s < sections; s++) {
      for (let i = 0; i < perSection; i++) {
        const seed = Math.sin((s * 31 + i + 1) * 12.9898) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const r = 0.05 + rnd * 0.025;
        const along = -length / 2 + (s + 0.1 + ((i % 6) / 6) * 0.8) * (length / sections);
        const across = -depth / 2 + 0.1 + (Math.floor(i / 6) / 3) * (depth - 0.2) + rnd * 0.05;
        m.makeScale(r, r * 0.95, r);
        m.setPosition(alongX ? along : across, y + r + Math.floor(i / 12) * 0.04, alongX ? across : along);
        mesh.setMatrixAt(index, m);
        color.set(colors[s]!).offsetHSL(0, 0, (rnd - 0.5) * 0.1);
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.keepSeparate = true;
    b.group.add(mesh);
  }

  /**
   * Junta todas as malhas estáticas que usam o mesmo material em uma só
   * (aplicando as transformações). Instâncias e transparentes ficam como estão.
   */
  private mergeStatic(root: THREE.Group): THREE.Group {
    root.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const output = new THREE.Group();
    const kept: THREE.Object3D[] = [];
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh || mesh.userData.keepSeparate || mat.transparent || Array.isArray(mesh.material)) {
        kept.push(mesh);
        return;
      }
      const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
      }
      if (!geometry.getAttribute('uv')) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geometry.getAttribute('position').count) * 2), 2));
      }
      const list = buckets.get(mat) ?? [];
      list.push(geometry);
      buckets.set(mat, list);
    });
    for (const [mat, geometries] of buckets) {
      const merged = mergeGeometries(geometries, false);
      for (const g of geometries) g.dispose();
      if (!merged) continue;
      this.owned.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mat.name !== 'ceiling';
      mesh.receiveShadow = true;
      output.add(mesh);
    }
    for (const object of kept) {
      object.updateMatrixWorld(true);
      object.matrixWorld.decompose(object.position, object.quaternion, object.scale);
      object.removeFromParent();
      output.add(object);
    }
    return output;
  }
}

const planes = new Map<string, THREE.PlaneGeometry>();
/** Plano com UVs em metros. */
function planeGeometry(w: number, h: number): THREE.PlaneGeometry {
  const key = `${w}:${h}`;
  let g = planes.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    planes.set(key, g);
  }
  return g;
}
