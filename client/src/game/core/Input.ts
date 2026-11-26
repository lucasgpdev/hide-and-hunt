import { settingsStore, type KeyAction } from '../../settings/settings';

/**
 * Entrada de teclado e mouse (item 21). As teclas vêm das configurações
 * (podem ser remapeadas pelo jogador).
 * WASD movimenta, mouse controla a câmera (com o cursor travado no jogo),
 * Espaço pula, Shift corre, E interage/captura, F transforma, Tab mostra o placar.
 */
export type ActionKey =
  | 'interact'
  | 'transform'
  | 'primary'
  | 'nextTarget'
  | 'previousTarget'
  | 'shove'
  | 'ping'
  | 'emote'
  | 'ability1'
  | 'ability2'
  | 'ability3'
  | 'ability4'
  | 'camera'
  | 'digit5'
  | 'digit6';

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed: ActionKey[] = [];
  private mouseX = 0;
  private mouseY = 0;
  /** Habilitado só quando o jogo está em primeiro plano (sem menus abertos). */
  enabled = true;
  /** Modo de toque (celular/tablet): sem travar o cursor; joystick e botões na tela. */
  touchMode = false;
  private touchX = 0;
  private touchY = 0;
  private touchRun = false;
  private touchJump = false;
  onPointerLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    element.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('hh:action', this.handleUiAction);
  }

  /** Botões da interface (ex.: tocar numa habilidade no celular) disparam a mesma ação da tecla. */
  private readonly handleUiAction = (event: Event) => {
    const action = (event as CustomEvent<ActionKey>).detail;
    if (action) this.press(action);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    this.element.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('hh:action', this.handleUiAction);
    if (this.locked) document.exitPointerLock();
  }

  get locked(): boolean {
    return this.touchMode || document.pointerLockElement === this.element;
  }

  // ---------- controles de toque ----------
  /** Joystick analógico: x = direita, y = frente (−1..1). */
  setTouchMove(x: number, y: number): void {
    this.touchX = Math.max(-1, Math.min(1, x));
    this.touchY = Math.max(-1, Math.min(1, y));
  }

  setTouchRun(run: boolean): void {
    this.touchRun = run;
  }

  setTouchJump(jump: boolean): void {
    this.touchJump = jump;
  }

  /** Arrastar o dedo gira a câmera (mesma escala do mouse). */
  addLook(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.mouseX += dx;
    this.mouseY += dy;
  }

  /** Botão de ação na tela. */
  press(action: ActionKey): void {
    if (this.enabled) this.pressed.push(action);
  }

  requestLock(): void {
    if (this.touchMode) return;
    if (!this.locked) {
      try {
        const result = this.element.requestPointerLock() as unknown;
        if (result instanceof Promise) result.catch(() => {});
      } catch {
        // O navegador pode recusar (ex.: logo após sair do travamento).
      }
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  private bound(action: KeyAction): boolean {
    return this.isDown(settingsStore.get().keys[action]);
  }

  axes(): { forward: number; right: number; run: boolean; jump: boolean } {
    const keyForward = (this.bound('forward') || this.isDown('ArrowUp') ? 1 : 0) - (this.bound('back') || this.isDown('ArrowDown') ? 1 : 0);
    const keyRight = (this.bound('right') || this.isDown('ArrowRight') ? 1 : 0) - (this.bound('left') || this.isDown('ArrowLeft') ? 1 : 0);
    const touch = this.enabled && this.touchMode;
    return {
      forward: Math.max(-1, Math.min(1, keyForward + (touch ? this.touchY : 0))),
      right: Math.max(-1, Math.min(1, keyRight + (touch ? this.touchX : 0))),
      run: this.bound('run') || this.isDown('ShiftRight') || (touch && this.touchRun),
      jump: this.bound('jump') || (touch && this.touchJump),
    };
  }

  consumeMouse(): { dx: number; dy: number } {
    const delta = { dx: this.mouseX, dy: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  consumeActions(): ActionKey[] {
    return this.pressed.splice(0);
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event)) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', settingsStore.get().keys.scoreboard].includes(event.code) && this.enabled) event.preventDefault();
    if (!this.enabled || event.repeat) {
      this.keys.add(event.code);
      return;
    }
    this.keys.add(event.code);
    const keys = settingsStore.get().keys;
    const map: [KeyAction, ActionKey][] = [
      ['interact', 'interact'],
      ['transform', 'transform'],
      ['shove', 'shove'],
      ['ping', 'ping'],
      ['emote', 'emote'],
      ['ability1', 'ability1'],
      ['ability2', 'ability2'],
      ['ability3', 'ability3'],
      ['ability4', 'ability4'],
      ['camera', 'camera'],
    ];
    for (const [setting, action] of map) if (event.code === keys[setting]) this.pressed.push(action);
    if (event.code === 'KeyQ') this.pressed.push('previousTarget');
    if (event.code === 'Digit5') this.pressed.push('digit5');
    if (event.code === 'Digit6') this.pressed.push('digit6');
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly handleBlur = () => {
    this.keys.clear();
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    this.mouseX += event.movementX;
    this.mouseY += event.movementY;
  };

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (!this.enabled) return;
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (event.button === 0) this.pressed.push('primary');
    if (event.button === 2) this.pressed.push('nextTarget');
  };

  private readonly handleLockChange = () => {
    if (this.touchMode) return;
    this.onPointerLockChange(this.locked);
  };
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
}
