import { useEffect, useRef, useState } from 'react';
import { EVENT_INFO, MODE_INFO, type RoomInfo } from '@hh/shared';
import { playSound } from '../../audio/sound';
import { useHud } from '../../game/core/hudStore';
import type { FeedItem } from '../../multiplayer/NetworkClient';
import { network } from '../../multiplayer/NetworkClient';
import { keyLabel, useSettings } from '../../settings/settings';
import { useNetwork } from '../../hooks/useNetwork';
import { AbilityBar, EmoteMenu } from './AbilityBar';
import { TutorialTips } from './TutorialTips';

const PHASE_LABEL: Record<RoomInfo['state'], string> = {
  WAITING: 'Aguardando jogadores',
  COUNTDOWN: 'Preparação',
  HIDING: 'Escondam-se!',
  HUNTING: 'Caçada',
  FINISHED: 'Fim da partida',
};

/** Tempo restante da fase, pelo relógio do servidor. */
export function useRemainingSeconds(room: RoomInfo): number | null {
  const [now, setNow] = useState(() => network.serverNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(network.serverNow()), 250);
    return () => clearInterval(timer);
  }, []);
  return room.stateEndsAt === null ? null : Math.max(0, Math.ceil((room.stateEndsAt - now) / 1000));
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  room: RoomInfo;
  localId: string;
  feed: FeedItem[];
  latencyMs: number | null;
}

/** Interface durante a partida (item 20): cronômetro, equipe, contagem, avisos e mira. */
export function Hud({ room, localId, feed, latencyMs }: Props) {
  const hud = useHud();
  const net = useNetwork();
  const settings = useSettings();
  const remaining = useRemainingSeconds(room);
  const me = room.players.find((p) => p.id === localId);
  const hiders = room.players.filter((p) => p.team === 'HIDERS');
  const aliveHiders = hiders.filter((p) => p.alive).length;
  const inMatch = room.state === 'HIDING' || room.state === 'HUNTING';
  const blind = room.state === 'HIDING' && me?.team === 'HUNTERS';

  // Bipes nos últimos 10 segundos e anúncio da fase.
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!inMatch || remaining === null) return;
    if (remaining <= 10 && remaining > 0 && remaining !== lastTick.current) playSound('tick');
    lastTick.current = remaining;
  }, [remaining, inMatch]);

  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    if (!settings.visualSoundCues) return;
    const text =
      room.state === 'COUNTDOWN'
        ? `Rodada ${room.round}: você é ${me?.team === 'HUNTERS' ? 'CAÇADOR' : 'ESCONDIDO'}`
        : room.state === 'HIDING'
          ? 'Escondam-se!'
          : room.state === 'HUNTING'
            ? 'A caçada começou!'
            : null;
    if (!text) return;
    setBanner(text);
    const timer = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(timer);
  }, [room.state, room.round, me?.team, settings.visualSoundCues]);

  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? 'Alguém';
  const partner = me?.partnerId ? room.players.find((p) => p.id === me.partnerId) : undefined;
  const eventActive = room.event && room.event.endsAt > network.serverNow() ? room.event : null;
  const speakingNames = hud.speaking.map(nameOf);

  return (
    <div className={`hud ${settings.highContrast ? 'hud--contrast' : ''}`}>
      {blind && (
        <div className="blindfold">
          <p className="blindfold-title">Olhos vendados</p>
          <p>Os escondidos estão se escondendo...</p>
          <p className="blindfold-timer">{remaining !== null ? formatClock(remaining) : ''}</p>
        </div>
      )}

      <div className="hud-top">
        <div className="hud-team">
          <TeamBadge team={me?.team ?? null} alive={me?.alive ?? false} inMatch={inMatch} />
          <p className="hud-objective">{objective(room, me?.team ?? null, me?.alive ?? false, hud.spectating)}</p>
        </div>

        <div className="hud-clock" aria-live="off">
          <span className="hud-mode">{MODE_INFO[room.settings.mode].name}</span>
          <span className="hud-phase">{PHASE_LABEL[room.state]}</span>
          <span className="hud-time">{remaining !== null ? formatClock(remaining) : '--:--'}</span>
        </div>

        <div className="hud-counts">
          {room.state !== 'WAITING' && (
            <>
              <span>
                Escondidos <strong>{aliveHiders}</strong>/{hiders.length}
              </span>
              <span>
                Capturados <strong>{hiders.length - aliveHiders}</strong>
              </span>
            </>
          )}
          {settings.showFps && (
            <span className="hud-perf">
              {hud.fps} FPS · {latencyMs !== null ? `${Math.round(latencyMs)} ms` : '—'}
            </span>
          )}
        </div>
      </div>

      {banner && <div className="hud-banner">{banner}</div>}
      {eventActive && <div className="hud-event">⚡ {EVENT_INFO[eventActive.type].name}</div>}
      {partner && (
        <div className="hud-partner">
          Parceiro: <strong>{partner.nickname}</strong> {partner.alive ? '' : '(capturado)'}
        </div>
      )}
      {me?.alive && !me.disguise && (
        <div className={`hud-flashlight${hud.flashlight ? ' on' : ''}`} aria-live="polite">
          <span className="hud-flashlight-icon" aria-hidden="true" />
          Lanterna {hud.flashlight ? 'ligada' : 'desligada'} <kbd>{keyLabel(settings.keys.flashlight)}</kbd>
        </div>
      )}
      <TutorialTips room={room} me={me} />
      {speakingNames.length > 0 && <div className="hud-voice">🎙 {speakingNames.join(', ')}</div>}
      {hud.emoteMenu && <EmoteMenu unlocked={net.profile?.unlockedEmotes ?? []} />}
      {inMatch && me?.alive && <AbilityBar team={me.team} abilities={net.abilities} enabled={room.settings.abilities} />}

      {hud.pointerLocked && !blind && <div className={`crosshair crosshair-${hud.aimKind}`} aria-hidden="true" />}
      {hud.prompt && hud.pointerLocked && <div className="hud-prompt">{hud.prompt}</div>}
      {hud.toast && <div className={`hud-toast hud-toast--${hud.toast.tone}`}>{hud.toast.text}</div>}

      {(hud.transformCooldown > 0 || hud.captureCooldown > 0) && (
        <div className="hud-cooldown" aria-label="Recarga">
          <span style={{ width: `${Math.max(hud.transformCooldown, hud.captureCooldown) * 100}%` }} />
        </div>
      )}

      {hud.spectating && (
        <div className="hud-spectating">
          Assistindo <strong>{hud.spectating}</strong> · clique para trocar
        </div>
      )}

      <ul className="hud-feed" aria-live="polite">
        {feed.map((item) => (
          <li key={item.id} className={`feed-item feed-item--${item.event.type}`}>
            {item.event.type === 'capture' && (
              <>
                <strong>{nameOf(item.event.hunterId)}</strong> capturou <strong>{nameOf(item.event.targetId)}</strong>
              </>
            )}
            {item.event.type === 'infected' && (
              <>
                <strong>{nameOf(item.event.hunterId)}</strong> infectou <strong>{nameOf(item.event.targetId)}</strong>
              </>
            )}
            {item.event.type === 'join' && <>{nameOf(item.event.playerId)} entrou</>}
            {item.event.type === 'leave' && <>Um jogador saiu</>}
            {item.event.type === 'info' && <>{item.event.message}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamBadge({ team, alive, inMatch }: { team: RoomInfo['players'][number]['team']; alive: boolean; inMatch: boolean }) {
  if (inMatch && !alive) return <span className="team-badge team-badge--spectator">Espectador</span>;
  if (team === 'HUNTERS') return <span className="team-badge team-badge--hunter">Caçador</span>;
  if (team === 'HIDERS') return <span className="team-badge team-badge--hider">Escondido</span>;
  return <span className="team-badge">Sem equipe</span>;
}

function objective(room: RoomInfo, team: string | null, alive: boolean, spectating: string | null): string {
  const inMatch = room.state === 'HIDING' || room.state === 'HUNTING';
  if (inMatch && !alive) {
    return team === 'HIDERS' ? 'Você foi capturado. Acompanhe quem ainda está no jogo.' : 'Você entrou no meio da partida e joga na próxima rodada.';
  }
  void spectating;
  switch (room.state) {
    case 'WAITING':
      return room.isPrivate
        ? 'Lobby: ande, faça emotes (B) e vote no mapa enquanto o anfitrião inicia.'
        : 'Lobby: ande, faça emotes (B) e vote no mapa enquanto mais jogadores chegam.';
    case 'COUNTDOWN':
      return team === 'HUNTERS' ? 'Você será caçador. Prepare-se!' : 'Você será escondido. Procure bons esconderijos!';
    case 'HIDING':
      return team === 'HIDERS' ? 'Mire em um objeto e aperte F para se transformar. Esconda-se!' : 'Aguarde: a caçada começa em instantes.';
    case 'HUNTING':
      if (room.settings.mode === 'infection' && team === 'HUNTERS') return 'Infecte todos: quem você captura vira caçador!';
      return team === 'HIDERS'
        ? 'Fique escondido até o tempo acabar. F troca de objeto; 1–4 usam habilidades.'
        : 'Capture com clique ou E. Use radar, scanner e analisador (1–3). Errar custa tempo!';
    case 'FINISHED':
      return 'Confira o resultado e vote no próximo mapa.';
  }
}
