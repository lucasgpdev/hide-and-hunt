import { create } from 'nipplejs';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Team } from '@hh/shared';
import type { Game } from '../../game/core/Game';
import type { ActionKey, Input } from '../../game/core/Input';
import { hudStore } from '../../game/core/hudStore';

/** Celular/tablet: tela de toque sem mouse. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/**
 * Controles na tela para celular (joystick da biblioteca nipplejs, licença MIT):
 * metade esquerda = joystick que aparece onde o dedo toca; metade direita =
 * arrastar para olhar; botões de ação à direita.
 */
export function TouchControls({ game, team }: { game: Game; team: Team | null }) {
  const stickZone = useRef<HTMLDivElement>(null);
  const input = useRef<Input | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const controls = game.enableTouchControls();
    // Mesmo modo de toque, mas o menu (☰) pode pausar: só reativa ao tocar em "jogar".
    input.current = controls;
    if (!stickZone.current) return;
    const manager = create({
      zone: stickZone.current,
      mode: 'dynamic',
      size: 120,
      color: { front: 'rgba(255,255,255,0.75)', back: 'rgba(255,255,255,0.18)' },
    });
    manager.on('move', (event) => {
      const { vector, force } = event.data;
      controls.setTouchMove(vector.x, vector.y);
      // Empurrar o joystick até a borda também corre.
      if (force > 1.4) controls.setTouchRun(true);
    });
    manager.on('end', () => {
      controls.setTouchMove(0, 0);
      controls.setTouchRun(false);
    });
    return () => {
      manager.destroy();
      controls.setTouchMove(0, 0);
    };
  }, [game]);

  useEffect(() => {
    input.current?.setTouchRun(running);
  }, [running]);

  const lookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (look.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    input.current?.addLook((e.clientX - l.x) * 1.8, (e.clientY - l.y) * 1.8);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (look.current?.id === e.pointerId) look.current = null;
  };

  const tap = (action: ActionKey) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    input.current?.press(action);
  };

  return (
    <div className="touch-controls">
      <div ref={stickZone} className="touch-stick-zone" />
      <div className="touch-look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      <div className="touch-buttons">
        <button type="button" className="touch-btn touch-btn-main" onPointerDown={tap('primary')}>
          {team === 'HUNTERS' ? 'Capturar' : 'Ação'}
        </button>
        {team !== 'HUNTERS' && (
          <button type="button" className="touch-btn" onPointerDown={tap('transform')}>
            Virar objeto
          </button>
        )}
        <button type="button" className="touch-btn" onPointerDown={tap('interact')}>
          Usar
        </button>
        <button
          type="button"
          className="touch-btn"
          onPointerDown={(e) => {
            e.preventDefault();
            input.current?.setTouchJump(true);
          }}
          onPointerUp={() => input.current?.setTouchJump(false)}
          onPointerCancel={() => input.current?.setTouchJump(false)}
        >
          Pular
        </button>
        <button type="button" className={`touch-btn${running ? ' touch-btn-on' : ''}`} onPointerDown={() => setRunning((r) => !r)}>
          Correr
        </button>
        <button type="button" className="touch-btn" onPointerDown={tap('emote')}>
          Emote
        </button>
      </div>
      <button type="button" className="touch-menu" onPointerDown={() => hudStore.set({ pointerLocked: false })}>
        ☰
      </button>
    </div>
  );
}
