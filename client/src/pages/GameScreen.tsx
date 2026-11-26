import { useEffect, useRef, useState } from 'react';
import { playSound, startAmbientMusic, stopAmbientMusic } from '../audio/sound';
import { Hud } from '../components/game/Hud';
import { isTouchDevice, TouchControls } from '../components/game/TouchControls';
import { LobbyPanel } from '../components/game/LobbyPanel';
import { ResultsPanel } from '../components/game/ResultsPanel';
import { ReplayViewer } from '../components/game/ReplayViewer';
import { Scoreboard } from '../components/game/Scoreboard';
import { SettingsPanel } from '../components/menu/SettingsPanel';
import type { Game } from '../game/core/Game';
import { hudStore, useHud } from '../game/core/hudStore';
import { loadRapier } from '../game/physics/rapier';
import { preloadCharacters } from '../game/characters/characterAssets';
import { useNetwork } from '../hooks/useNetwork';
import { network } from '../multiplayer/NetworkClient';
import { VoiceChat } from '../multiplayer/VoiceChat';
import { settingsStore, useSettings } from '../settings/settings';
import type { ReplayData } from '@hh/shared';

/**
 * Tela da partida: monta o motor 3D e sobrepõe HUD, painel da sala,
 * placar, menu de pausa e resultados.
 */
export function GameScreen() {
  const net = useNetwork();
  const hud = useHud();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showScores, setShowScores] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const settings = useSettings();
  const room = net.room;
  const localId = net.player?.id ?? '';

  // Carrega Rapier + motor 3D uma única vez.
  useEffect(() => {
    let cancelled = false;
    hudStore.reset();
    const container = containerRef.current;
    if (!container || !localId) return;
    void (async () => {
      try {
        const [RAPIER, { Game }] = await Promise.all([
          loadRapier(),
          import('../game/core/Game'),
          preloadCharacters(),
          import('../game/objects/propModels').then((m) => m.preloadPropModels()),
          import('../game/maps/mapScenes').then((m) => m.preloadMapScenes()),
        ]);
        if (cancelled) return;
        const game = new Game(container, RAPIER, network, localId);
        gameRef.current = game;
        if (import.meta.env.DEV) (window as unknown as { __hhGame?: Game }).__hhGame = game;
        const current = network.getState().room;
        if (current) game.setRoom(current);
        startAmbientMusic();
        setGameReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('Não foi possível iniciar o jogo 3D neste navegador.');
      }
    })();
    return () => {
      cancelled = true;
      gameRef.current?.dispose();
      gameRef.current = null;
      setGameReady(false);
      stopAmbientMusic();
    };
  }, [localId]);

  useEffect(() => {
    if (room) gameRef.current?.setRoom(room);
  }, [room]);

  // Ao terminar a partida, libera o mouse para ver resultados e votar.
  useEffect(() => {
    if (!net.results) return;
    gameRef.current?.setInputEnabled(true);
    document.exitPointerLock?.();
    const mine = net.results.players.find((p) => p.id === localId);
    if (mine) playSound(mine.team === net.results.winner ? 'win' : 'lose');
  }, [net.results, localId]);

  // Menus abertos desativam os controles do jogo.
  useEffect(() => {
    gameRef.current?.setInputEnabled(!settingsOpen && !replay);
  }, [settingsOpen, replay]);

  // Chat de voz por proximidade: liga quando o jogador ativa nas configurações.
  useEffect(() => {
    const game = gameRef.current;
    if (!settings.voiceEnabled || !gameReady || !game) return;
    const voice = new VoiceChat(
      network,
      localId,
      (id) => game.playerPosition(id),
      () => game.listenerPose(),
    );
    let active = true;
    void voice.enable().then((error) => {
      if (error && active) {
        setNotice(error);
        settingsStore.set({ voiceEnabled: false });
      }
    });
    return () => {
      active = false;
      voice.disable();
    };
  }, [settings.voiceEnabled, gameReady, localId]);

  // Celular/tablet: modo de toque assim que o jogo carrega (não há trava de cursor).
  useEffect(() => {
    if (gameReady && isTouchDevice()) gameRef.current?.enableTouchControls();
  }, [gameReady]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const scoreboardKey = settings.keys.scoreboard;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === scoreboardKey) {
        e.preventDefault();
        setShowScores(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === scoreboardKey) setShowScores(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [scoreboardKey]);

  if (!room) return null;
  const touch = isTouchDevice();
  const paused = !hud.pointerLocked && !settingsOpen && !playersOpen && !replay;
  const lobbyVisible = room.state === 'WAITING' || room.state === 'COUNTDOWN' || room.state === 'FINISHED';
  const showResults = room.state === 'FINISHED' && net.results;

  const leave = async () => {
    playSound('click');
    await network.leaveRoom();
  };

  const openReplay = async () => {
    const result = await network.replay(net.results?.matchId);
    if (result.ok) setReplay(result.replay);
    else setNotice(result.error.message);
  };

  return (
    <div className="game-screen">
      <div ref={containerRef} className="game-container" />
      {(hud.loading || loadError) && (
        <div className="loading-screen">
          <h2>HIDE &amp; HUNT</h2>
          <p>{loadError ?? 'Carregando o mapa...'}</p>
          {loadError && (
            <button type="button" className="button-secondary" onClick={leave}>
              Voltar ao menu
            </button>
          )}
        </div>
      )}

      {!hud.loading && <Hud room={room} localId={localId} feed={net.feed} latencyMs={net.latencyMs} />}
      {!hud.loading && gameReady && touch && gameRef.current && hud.pointerLocked && !settingsOpen && !replay && (
        <TouchControls game={gameRef.current} team={room.players.find((p) => p.id === localId)?.team ?? null} />
      )}

      {lobbyVisible && !hud.pointerLocked && <LobbyPanel room={room} localId={localId} />}
      {showResults && !hud.pointerLocked && !replay && (
        <ResultsPanel results={net.results!} room={room} localId={localId} onReplay={() => void openReplay()} />
      )}
      {showScores && !playersOpen && <Scoreboard room={room} localId={localId} />}
      {playersOpen && <Scoreboard room={room} localId={localId} interactive onClose={() => setPlayersOpen(false)} />}

      {paused && !hud.loading && !showResults && (
        <div className="pause-card panel">
          <p className="pause-title">{room.state === 'WAITING' ? 'Sala de espera' : 'Pausado'}</p>
          <p className="muted tiny">O jogo continua para os outros jogadores.</p>
          <button type="button" className="button-primary" onClick={() => gameRef.current?.requestPointerLock()}>
            {isTouchDevice() ? 'Toque para jogar' : 'Clique para jogar'}
          </button>
          <button type="button" className="button-secondary" onClick={() => setPlayersOpen(true)}>
            Jogadores (silenciar / denunciar)
          </button>
          <button type="button" className="button-secondary" onClick={() => setSettingsOpen(true)}>
            Configurações
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => settingsStore.set({ voiceEnabled: !settings.voiceEnabled })}
            title="Chat de voz por proximidade"
          >
            {settings.voiceEnabled ? 'Desligar microfone' : 'Ligar chat de voz'}
          </button>
          <button type="button" className="button-secondary" onClick={leave}>
            Sair da sala
          </button>
        </div>
      )}
      {showResults && !hud.pointerLocked && !replay && (
        <div className="results-actions">
          <button type="button" className="button-secondary" onClick={() => gameRef.current?.requestPointerLock()}>
            Voltar ao jogo
          </button>
          <button type="button" className="button-secondary" onClick={leave}>
            Sair da sala
          </button>
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {replay && <ReplayViewer replay={replay} onClose={() => setReplay(null)} />}
      {notice && (
        <p className="game-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
