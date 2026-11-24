import * as THREE from 'three';

export interface PreviewSceneOptions {
  /** Recebe o FPS medido a cada meio segundo (monitoramento de desempenho). */
  onFps?: (fps: number) => void;
  /** Reduz animações para quem prefere menos movimento. */
  reducedMotion?: boolean;
}

/**
 * Cena 3D da tela inicial.
 *
 * Um depósito escuro com objetos comuns; uma lanterna de caçador varre o
 * ambiente e uma das caixas "respira" — é um jogador escondido. Serve como
 * vitrine visual e como verificação de que WebGL, sombras e instancing
 * funcionam neste computador.
 */
export class PreviewScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly timer = new THREE.Timer();
  private readonly flashlight: THREE.SpotLight;
  private readonly flashlightTarget = new THREE.Object3D();
  private readonly hiddenProp: THREE.Mesh;
  private readonly resizeObserver: ResizeObserver;
  private readonly disposables: { dispose(): void }[] = [];
  private frames = 0;
  private fpsElapsed = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: PreviewSceneOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color('#07090d');
    this.scene.fog = new THREE.Fog('#07090d', 12, 30);

    this.camera.position.set(7.5, 3.4, 9);

    // Luz ambiente fraca, fria; a lanterna é a fonte principal.
    this.scene.add(new THREE.HemisphereLight('#5b6c8f', '#141821', 1.1));
    const rim = new THREE.DirectionalLight('#7f95c9', 0.8);
    rim.position.set(-6, 8, -4);
    this.scene.add(rim);

    this.flashlight = new THREE.SpotLight('#ffd49a', 420, 30, Math.PI / 8, 0.45, 1.4);
    this.flashlight.position.set(-4.5, 2.6, 6);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0008;
    this.flashlight.target = this.flashlightTarget;
    this.scene.add(this.flashlight, this.flashlightTarget);

    this.buildRoom();
    this.buildProps();
    this.hiddenProp = this.buildHiddenProp();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    this.timer.connect(document);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.timer.dispose();
    for (const item of this.disposables) item.dispose();
    this.flashlight.shadow.map?.dispose();
    this.renderer.dispose();
  }

  // ---------- construção da cena ----------

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private material(color: string, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  }

  private buildRoom(): void {
    const floor = new THREE.Mesh(this.track(new THREE.PlaneGeometry(40, 40)), this.material('#1a1d23', 0.92));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMaterial = this.material('#15181e', 0.95);
    const backWall = new THREE.Mesh(this.track(new THREE.PlaneGeometry(40, 8)), wallMaterial);
    backWall.position.set(0, 4, -6);
    backWall.receiveShadow = true;
    const sideWall = new THREE.Mesh(this.track(new THREE.PlaneGeometry(40, 8)), wallMaterial);
    sideWall.position.set(-7, 4, 0);
    sideWall.rotation.y = Math.PI / 2;
    sideWall.receiveShadow = true;
    this.scene.add(backWall, sideWall);

    // Faixas de segurança no chão (detalhe de depósito/supermercado).
    const stripeMaterial = this.material('#8a6a1c', 0.7);
    const stripeGeometry = this.track(new THREE.PlaneGeometry(0.12, 12));
    for (const x of [-2.2, 3.4]) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.002, 0);
      this.scene.add(stripe);
    }
  }

  private buildProps(): void {
    // Prateleira: estrutura metálica + caixas instanciadas (uma única chamada de desenho).
    const metal = this.material('#3a3f48', 0.45, 0.7);
    const postGeometry = this.track(new THREE.BoxGeometry(0.08, 3.2, 0.08));
    const shelfGeometry = this.track(new THREE.BoxGeometry(4.2, 0.06, 1));
    const shelf = new THREE.Group();
    for (const x of [-2.05, 2.05]) {
      for (const z of [-0.45, 0.45]) {
        const post = new THREE.Mesh(postGeometry, metal);
        post.position.set(x, 1.6, z);
        post.castShadow = true;
        shelf.add(post);
      }
    }
    for (const y of [0.15, 1.15, 2.15, 3.1]) {
      const board = new THREE.Mesh(shelfGeometry, metal);
      board.position.y = y;
      board.castShadow = true;
      board.receiveShadow = true;
      shelf.add(board);
    }
    shelf.position.set(-1.5, 0, -4.8);
    this.scene.add(shelf);

    const boxGeometry = this.track(new THREE.BoxGeometry(1, 1, 1));
    const cardboard = this.material('#8c6a43', 0.9);
    const boxes: { pos: [number, number, number]; size: [number, number, number]; rot: number }[] = [];
    for (const level of [0.15, 1.15, 2.15]) {
      for (let i = 0; i < 5; i++) {
        const w = 0.55 + ((i * 37) % 5) * 0.06;
        const h = 0.45 + ((i * 13 + level * 10) % 4) * 0.08;
        boxes.push({ pos: [-3.2 + i * 0.85, level + 0.03 + h / 2, -4.8], size: [w, h, 0.7], rot: (i % 3) * 0.06 });
      }
    }
    // Pilhas de caixas no chão.
    boxes.push(
      { pos: [2.2, 0.35, -2.8], size: [0.9, 0.7, 0.9], rot: 0.2 },
      { pos: [3.15, 0.3, -2.6], size: [0.8, 0.6, 0.8], rot: -0.15 },
      { pos: [2.6, 0.95, -2.75], size: [0.75, 0.5, 0.75], rot: 0.5 },
      { pos: [-4.8, 0.4, 0.8], size: [1, 0.8, 1], rot: 0.1 },
      { pos: [-4.7, 1.1, 0.9], size: [0.7, 0.6, 0.7], rot: -0.3 },
    );
    const instanced = new THREE.InstancedMesh(boxGeometry, cardboard, boxes.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    boxes.forEach((box, index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.rot);
      matrix.compose(new THREE.Vector3(...box.pos), quaternion, new THREE.Vector3(...box.size));
      instanced.setMatrixAt(index, matrix);
    });
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    this.scene.add(instanced);

    // Cone de sinalização.
    const coneGroup = new THREE.Group();
    const cone = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.28, 0.85, 24)), this.material('#e2622b', 0.6));
    cone.position.y = 0.47;
    cone.castShadow = true;
    const coneBase = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.62, 0.05, 0.62)), this.material('#1d1f24'));
    coneBase.position.y = 0.025;
    coneBase.castShadow = true;
    const coneStripe = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.15, 0.2, 0.14, 24)), this.material('#e9e4da', 0.5));
    coneStripe.position.y = 0.55;
    coneGroup.add(cone, coneBase, coneStripe);
    coneGroup.position.set(0.8, 0, 1.2);
    this.scene.add(coneGroup);

    // Cadeira simples.
    const wood = this.material('#5b4632', 0.75);
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.5, 0.05, 0.5)), wood);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.5, 0.5, 0.05)), wood);
    back.position.set(0, 0.73, -0.225);
    chair.add(seat, back);
    const legGeometry = this.track(new THREE.BoxGeometry(0.045, 0.45, 0.045));
    for (const x of [-0.22, 0.22]) {
      for (const z of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(legGeometry, wood);
        leg.position.set(x, 0.225, z);
        chair.add(leg);
      }
    }
    chair.traverse((child) => (child.castShadow = true));
    chair.position.set(-1.2, 0, 2.4);
    chair.rotation.y = 0.7;
    this.scene.add(chair);

    // Lixeira e balde.
    const bin = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.28, 0.24, 0.75, 28, 1, true)), this.material('#2f6b4f', 0.55, 0.2));
    bin.material.side = THREE.DoubleSide;
    bin.position.set(4.2, 0.375, 0.4);
    bin.castShadow = true;
    const bucket = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.2, 0.16, 0.32, 24, 1, true)), this.material('#2b5fa8', 0.5));
    bucket.material.side = THREE.DoubleSide;
    bucket.position.set(1.9, 0.16, -0.6);
    bucket.castShadow = true;
    this.scene.add(bin, bucket);
  }

  private buildHiddenProp(): THREE.Mesh {
    const prop = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.7, 0.55, 0.7)), this.material('#8c6a43', 0.9));
    prop.position.set(0.2, 0.275, -1.4);
    prop.rotation.y = -0.35;
    prop.castShadow = true;
    prop.receiveShadow = true;
    this.scene.add(prop);
    return prop;
  }

  // ---------- loop ----------

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Em telas largas, desloca a cena para a direita e para cima, no espaço
    // livre ao lado do título, sem ficar escondida atrás dos painéis.
    if (width > 860) {
      this.camera.setViewOffset(width, height, -width * 0.2, height * 0.14, width, height);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  private frame(time: number): void {
    this.timer.update(time);
    const delta = this.timer.getDelta();
    const t = this.timer.getElapsed();
    const motion = this.options.reducedMotion ? 0.15 : 1;

    // Lanterna varrendo o ambiente.
    const sweep = Math.sin(t * 0.45 * motion) * 3.4;
    this.flashlightTarget.position.set(sweep, 0, -1.8 + Math.cos(t * 0.3 * motion) * 1.2);

    // A caixa escondida "respira" e às vezes dá um pequeno salto nervoso.
    const breathe = 1 + Math.sin(t * 2.2) * 0.012 * motion;
    this.hiddenProp.scale.set(1, breathe, 1);
    const hopCycle = (t % 7) / 7;
    const hop = hopCycle > 0.94 ? Math.sin(((hopCycle - 0.94) / 0.06) * Math.PI) * 0.08 * motion : 0;
    this.hiddenProp.position.y = 0.275 * breathe + hop;

    // Câmera com leve deriva.
    this.camera.position.x = 7.5 + Math.sin(t * 0.08 * motion) * 0.8;
    this.camera.position.y = 3.4 + Math.sin(t * 0.11 * motion) * 0.15;
    this.camera.lookAt(-0.6, 0.8, -1.6);

    this.renderer.render(this.scene, this.camera);

    this.frames += 1;
    this.fpsElapsed += delta;
    if (this.fpsElapsed >= 0.5) {
      this.options.onFps?.(Math.round(this.frames / this.fpsElapsed));
      this.frames = 0;
      this.fpsElapsed = 0;
    }
  }
}

/** Verifica se o navegador suporta WebGL2 (necessário para o jogo). */
export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
