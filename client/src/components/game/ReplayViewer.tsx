import { useEffect, useRef, useState } from 'react';
import { getMap, MODE_INFO, type ReplayData } from '@hh/shared';
import type { ReplayCamera, ReplayPlayer } from '../../game/replay/ReplayPlayer';
import { settingsStore } from '../../settings/settings';

const SPEEDS = [0.5, 1, 2, 4];

/** Tela de replay 3D: linha do tempo com eventos, velocidade e câmeras. */
export function ReplayViewer({ replay, onClose }: { replay: ReplayData; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<ReplayCamera>('cinematic');
  const [followId, setFollowId] = useState<string>(replay.players[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const length = replay.frames.length;
  const seconds = (f: number) => Math.floor((f * replay.interval) / 1000);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let lastUi = 0;
    void Promise.all([
      import('../../game/replay/ReplayPlayer'),
      import('../../game/maps/mapAssets').then((m) => m.loadMapAssets(replay.mapId)),
    ])
      .then(([{ ReplayPlayer }]) => {
        if (disposed) return;
        const player = new ReplayPlayer(container, replay, settingsStore.get());
        player.onTick = (f) => {
          const now = performance.now();
          if (now - lastUi < 100) return;
          lastUi = now;
          setFrame(f);
          setPlaying(player.playing);
          setCamera(player.cameraMode);
        };
        playerRef.current = player;
      })
      .catch(() => setError('Não foi possível abrir o replay 3D neste navegador.'));
    return () => {
      disposed = true;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (!p.playing && p.currentFrame >= length - 1) p.seek(0);
    p.playing = !p.playing;
    setPlaying(p.playing);
  };
  const changeSpeed = (value: number) => {
    setSpeed(value);
    if (playerRef.current) playerRef.current.speed = value;
  };
  const changeCamera = (mode: ReplayCamera, id = followId) => {
    setCamera(mode);
    playerRef.current?.setCamera(mode, id || null);
  };

  return (
    <div className="replay-viewer" role="dialog" aria-label="Replay da partida">
      <div ref={containerRef} className="replay-stage" />
      <header className="replay-top panel">
        <strong>Replay</strong> · {getMap(replay.mapId)?.name ?? replay.mapId} · {MODE_INFO[replay.mode].name}
        <button type="button" className="button-secondary" onClick={onClose}>
          Fechar (Esc)
        </button>
      </header>
      {error && <p className="notice">{error}</p>}
      {length === 0 ? (
        <p className="notice">Este replay não tem quadros gravados.</p>
      ) : (
        <footer className="replay-controls panel">
          <div className="replay-timeline">
            <input
              type="range"
              min={0}
              max={Math.max(0, length - 1)}
              step={0.1}
              value={frame}
              aria-label="Linha do tempo"
              onChange={(e) => {
                const f = Number(e.target.value);
                setFrame(f);
                playerRef.current?.seek(f);
              }}
            />
            <div className="replay-markers" aria-hidden="true">
              {replay.events.map((ev, i) => (
                <button
                  key={i}
                  type="button"
                  className="replay-marker"
                  style={{ left: `${(ev.t / Math.max(1, length - 1)) * 100}%` }}
                  title={`${formatTime(seconds(ev.t))} · ${ev.text}`}
                  tabIndex={-1}
                  onClick={() => {
                    playerRef.current?.seek(Math.max(0, ev.t - 5));
                    setFrame(Math.max(0, ev.t - 5));
                  }}
                />
              ))}
            </div>
          </div>
          <div className="replay-row">
            <button type="button" className="button-primary" onClick={togglePlay}>
              {playing ? 'Pausar' : 'Reproduzir'}
            </button>
            <span className="replay-time">
              {formatTime(seconds(frame))} / {formatTime(seconds(length - 1))}
            </span>
            <div className="tabs">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={`tab ${speed === s ? 'tab--active' : ''}`} onClick={() => changeSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <div className="tabs">
              <button type="button" className={`tab ${camera === 'cinematic' ? 'tab--active' : ''}`} onClick={() => changeCamera('cinematic')}>
                Cinematográfica
              </button>
              <button type="button" className={`tab ${camera === 'orbit' ? 'tab--active' : ''}`} onClick={() => changeCamera('orbit')}>
                Livre (arraste)
              </button>
              <button type="button" className={`tab ${camera === 'follow' ? 'tab--active' : ''}`} onClick={() => changeCamera('follow')}>
                Seguir
              </button>
            </div>
            {camera === 'follow' && (
              <select
                value={followId}
                aria-label="Jogador seguido"
                onChange={(e) => {
                  setFollowId(e.target.value);
                  changeCamera('follow', e.target.value);
                }}
              >
                {replay.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname} ({p.team === 'HUNTERS' ? 'caçador' : 'escondido'})
                  </option>
                ))}
              </select>
            )}
          </div>
          <ul className="replay-events">
            {replay.events
              .filter((ev) => ev.t <= frame + 0.5)
              .slice(-4)
              .map((ev, i) => (
                <li key={`${ev.t}-${i}`}>
                  <span className="muted">{formatTime(seconds(ev.t))}</span> {ev.text}
                </li>
              ))}
          </ul>
        </footer>
      )}
    </div>
  );
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
