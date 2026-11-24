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
  | 'digit5'
  | 'digit6';

export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed: ActionKey[] = [];
  private mouseX = 0;
  private mouseY = 0;
  /** Habilitado só quando o jogo está em primeiro plano (sem menus abertos). */
  enabled = true;
  onPointerLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    element.addEventListener('mousedown', this.handleMouseDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    this.element.removeEventListener('mousedown', this.handleMouseDown);
    if (this.locked) document.exitPointerLock();
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  requestLock(): void {
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
    return {
      forward: (this.bound('forward') || this.isDown('ArrowUp') ? 1 : 0) - (this.bound('back') || this.isDown('ArrowDown') ? 1 : 0),
      right: (this.bound('right') || this.isDown('ArrowRight') ? 1 : 0) - (this.bound('left') || this.isDown('ArrowLeft') ? 1 : 0),
      run: this.bound('run') || this.isDown('ShiftRight'),
      jump: this.bound('jump'),
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
    this.onPointerLockChange(this.locked);
  };
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
}
