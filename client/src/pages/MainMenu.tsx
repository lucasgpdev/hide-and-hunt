import { useMemo, useState, type FormEvent } from 'react';
import { GAME_MODES, GAME_VERSION, MAX_PLAYERS_PER_ROOM, MODE_INFO, NICKNAME_MAX_LENGTH, levelFromXp, type GameMode } from '@hh/shared';
import { playSound } from '../audio/sound';
import { CreateRoomPanel, JoinCodePanel } from '../components/menu/RoomPanels';
import { FriendsPanel } from '../components/menu/FriendsPanel';
import { MissionsPanel } from '../components/menu/MissionsPanel';
import { ProfilePanel } from '../components/menu/ProfilePanel';
import { RankingPanel } from '../components/menu/RankingPanel';
import { SettingsPanel } from '../components/menu/SettingsPanel';
import { ShopPanel } from '../components/menu/ShopPanel';
import { SceneBackground } from '../components/SceneBackground';
import { hudStore } from '../game/core/hudStore';
import { isWebGL2Available } from '../game/core/PreviewScene';
import { useNetwork } from '../hooks/useNetwork';
import { network } from '../multiplayer/NetworkClient';
import { getSavedNickname } from '../multiplayer/session';

type Panel = 'create' | 'join' | 'profile' | 'ranking' | 'shop' | 'settings' | 'missions' | 'friends' | null;
type QueueMode = Exclude<GameMode, 'custom'>;
const QUEUE_MODES = GAME_MODES.filter((m): m is QueueMode => m !== 'custom' && MODE_INFO[m].publicQueue);
const MODE_KEY = 'hh.queueMode';

/**
 * Tela inicial e menu principal (item 20):
 * JOGAR · CRIAR SALA · ENTRAR COM CÓDIGO · PERFIL · RANKING · LOJA · CONFIGURAÇÕES
 */
export function MainMenu() {
  const net = useNetwork();
  const webgl = useMemo(isWebGL2Available, []);
  const [panel, setPanel] = useState<Panel>(null);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<QueueMode>(() => {
    const saved = localStorage.getItem(MODE_KEY) as QueueMode | null;
    return saved && QUEUE_MODES.includes(saved) ? saved : 'classic';
  });
  const pendingRequests = net.social?.incoming.length ?? 0;
  const season = net.progress?.season;
  const claimable = season ? Array.from({ length: season.level }, (_, i) => i + 1).filter((lvl) => !season.claimed.includes(lvl)).length : 0;

  const open = (next: Panel) => {
    playSound('click');
    network.clearError();
    setPanel(next);
  };

  const play = async () => {
    playSound('click');
    setSearching(true);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* armazenamento indisponível */
    }
    const result = await network.quickJoin(mode);
    setSearching(false);
    if (!result.ok) playSound('error');
  };

  return (
    <div className="home">
      {webgl && <SceneBackground onFps={(fps) => hudStore.set({ fps })} />}
      <div className="home-vignette" aria-hidden="true" />

      <main className="menu-layout">
        <header className="hero">
          <p className="hero-kicker">Prop Hunt multiplayer 3D · até {MAX_PLAYERS_PER_ROOM} jogadores</p>
          <h1 className="hero-title">
            HIDE <span className="hero-amp">&amp;</span> HUNT
          </h1>
          <p className="hero-tagline">Vire qualquer objeto do cenário. Fique imóvel. Torça para a lanterna passar direto.</p>
        </header>

        {!webgl && (
          <p className="notice">Seu navegador não tem WebGL 2 ativado. Atualize o navegador ou ative a aceleração de hardware.</p>
        )}

        {!net.player ? (
          <NameForm />
        ) : (
          <nav className="main-menu" aria-label="Menu principal">
            <div className="player-chip">
              <span className="player-chip-name">{net.player.nickname}</span>
              {net.profile && (
                <span className="player-chip-meta">
                  Nível {levelFromXp(net.profile.xp)} · {net.profile.coins} moedas
                </span>
              )}
            </div>
            <div className="play-group">
              <button type="button" className="menu-button menu-button--primary" onClick={play} disabled={searching}>
                {searching ? 'Procurando...' : 'Jogar'}
              </button>
              <select
                className="mode-select"
                value={mode}
                onChange={(e) => setMode(e.target.value as QueueMode)}
                aria-label="Modo de jogo da fila pública"
                title={MODE_INFO[mode].description}
              >
                {QUEUE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_INFO[m].name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="menu-button" onClick={() => open('create')}>
              Criar sala
            </button>
            <button type="button" className="menu-button" onClick={() => open('join')}>
              Entrar com código
            </button>
            <div className="menu-row">
              <button type="button" className="menu-button menu-button--small" onClick={() => open('missions')}>
                Missões{claimable > 0 && <span className="badge">{claimable}</span>}
              </button>
              <button type="button" className="menu-button menu-button--small" onClick={() => open('friends')}>
                Amigos{pendingRequests > 0 && <span className="badge">{pendingRequests}</span>}
              </button>
            </div>
            <div className="menu-row">
              <button type="button" className="menu-button menu-button--small" onClick={() => open('profile')}>
                Perfil
              </button>
              <button type="button" className="menu-button menu-button--small" onClick={() => open('ranking')}>
                Ranking
              </button>
              <button type="button" className="menu-button menu-button--small" onClick={() => open('shop')}>
                Loja
              </button>
              <button type="button" className="menu-button menu-button--small" onClick={() => open('settings')}>
                Configurações
              </button>
            </div>
            {net.error && !panel && (
              <p className="form-error" role="alert">
                {net.error}
              </p>
            )}
          </nav>
        )}
      </main>

      <footer className="home-footer">
        v{GAME_VERSION} · {net.status === 'connected' ? `${net.stats?.onlinePlayers ?? 0} online` : net.standby ? 'pronto' : 'conectando ao servidor...'}
        {net.latencyMs !== null && ` · ${Math.round(net.latencyMs)} ms`}
      </footer>

      {panel === 'create' && <CreateRoomPanel onClose={() => setPanel(null)} />}
      {panel === 'join' && <JoinCodePanel onClose={() => setPanel(null)} />}
      {panel === 'profile' && <ProfilePanel onClose={() => setPanel(null)} />}
      {panel === 'ranking' && <RankingPanel onClose={() => setPanel(null)} />}
      {panel === 'shop' && <ShopPanel onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
      {panel === 'missions' && <MissionsPanel onClose={() => setPanel(null)} />}
      {panel === 'friends' && <FriendsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}

function NameForm() {
  const net = useNetwork();
  const [nickname, setNickname] = useState(getSavedNickname);
  const ready = net.status === 'connected' || net.standby;
  const canSubmit = ready && !net.identifying && nickname.trim() !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) void network.identify(nickname);
  };

  return (
    <section className="panel name-panel">
      <form onSubmit={submit} noValidate>
        <label htmlFor="nickname" className="join-label">
          Como quer ser chamado?
        </label>
        <div className="join-row">
          <input
            id="nickname"
            className="join-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="Ex.: Caçador_01"
            autoComplete="nickname"
            autoFocus
            spellCheck={false}
            aria-invalid={Boolean(net.error)}
          />
          <button type="submit" className="button-primary" disabled={!canSubmit}>
            {net.identifying ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </form>
      {!ready && <p className="muted tiny">Conectando ao servidor...</p>}
      {net.error && (
        <p className="form-error" role="alert">
          {net.error}
        </p>
      )}
      {net.sessionReplaced && net.status === 'disconnected' && (
        <button type="button" className="button-secondary" onClick={() => network.reconnect()}>
          Usar esta aba
        </button>
      )}
    </section>
  );
}
