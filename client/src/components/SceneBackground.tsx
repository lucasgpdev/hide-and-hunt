import { useEffect, useRef } from 'react';
import { PreviewScene } from '../game/core/PreviewScene';

interface Props {
  onFps?: (fps: number) => void;
  onError?: () => void;
}

/** Monta a cena 3D da tela inicial em um canvas de fundo. */
export function SceneBackground({ onFps, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mantém os callbacks atuais sem recriar a cena a cada renderização.
  const callbacks = useRef({ onFps, onError });
  callbacks.current = { onFps, onError };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: PreviewScene | null = null;
    try {
      scene = new PreviewScene(canvas, {
        onFps: (fps) => callbacks.current.onFps?.(fps),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      scene.start();
    } catch {
      callbacks.current.onError?.();
    }
    return () => scene?.dispose();
  }, []);

  return <canvas ref={canvasRef} className="scene-background" aria-hidden="true" />;
}
