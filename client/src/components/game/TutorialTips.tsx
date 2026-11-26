import { useEffect, useState } from 'react';
import type { RoomInfo, RoomPlayerInfo } from '@hh/shared';
import { keyLabel, useSettings } from '../../settings/settings';
import { isTouchDevice } from './TouchControls';

const STORE = 'hh.tutorial';
/** Partidas com dicas antes de sumirem sozinhas. */
const MATCHES_WITH_TIPS = 3;

interface TutorialState {
  matches: number;
  off: boolean;
  lastRound: string | null;
}

function load(): TutorialState {
  try {
    return { matches: 0, off: false, lastRound: null, ...(JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<TutorialState>) };
  } catch {
    return { matches: 0, off: false, lastRound: null };
  }
}

function save(state: TutorialState): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* navegador sem armazenamento: as dicas só não ficam lembradas */
  }
}

/**
 * Tutorial em dicas: nas primeiras partidas, um cartão explica o que fazer
 * em cada fase (lobby, esconder, caçar), adaptado à equipe e ao aparelho.
 */
export function TutorialTips({ room, me }: { room: RoomInfo; me: RoomPlayerInfo | undefined }) {
  const settings = useSettings();
  const [state, setState] = useState(load);
  const [hidden, setHidden] = useState<string | null>(null);
  const touch = isTouchDevice();

  // Conta uma partida quando a caçada termina (uma vez por rodada).
  useEffect(() => {
    const round = `${room.code}:${room.round}`;
    if (room.state === 'FINISHED' && state.lastRound !== round) {
      const next = { ...state, matches: state.matches + 1, lastRound: round };
      setState(next);
      save(next);
    }
  }, [room.state, room.round, room.code, state]);

  if (state.off || state.matches >= MATCHES_WITH_TIPS) return null;
  const k = (code: string) => keyLabel(code);
  const keys = settings.keys;

  let id = '';
  let title = '';
  let body = '';
  if (room.state === 'WAITING') {
    id = 'lobby';
    title = 'Bem-vindo ao Hide & Hunt!';
    body = touch
      ? 'Ande com o controle da esquerda e olhe arrastando à direita. A partida começa quando tiver gente — se demorar, bots entram para jogar com você.'
      : `Ande com ${k(keys.forward)}${k(keys.left)}${k(keys.back)}${k(keys.right)}, olhe com o mouse e corra com ${k(keys.run)}. A partida começa quando tiver gente — se demorar, bots entram para jogar com você.`;
  } else if (room.state === 'COUNTDOWN') {
    id = 'countdown';
    title = 'A partida vai começar';
    body = 'Escondidos viram objetos do cenário; caçadores procuram e capturam. Ganha quem cumprir o objetivo antes do tempo acabar.';
  } else if (me?.team === 'HIDERS' && me.alive && (room.state === 'HIDING' || room.state === 'HUNTING')) {
    if (!me.disguise) {
      id = 'hider-transform';
      title = 'Você é ESCONDIDO';
      body = touch
        ? 'Mire num objeto (o círculo fica verde e tracejado) e toque em "Virar objeto". Escolha um objeto comum perto de outros iguais.'
        : `Mire num objeto (a mira fica verde e tracejada) e aperte ${k(keys.transform)} para virar ele. Escolha um objeto comum, perto de outros iguais.`;
    } else if (room.state === 'HIDING') {
      id = 'hider-still';
      title = 'Boa! Agora fique parado';
      body = touch
        ? 'Objeto andando chama atenção. Toque em "Câmera" para se ver de fora e conferir o disfarce.'
        : `Objeto andando chama atenção. Aperte ${k(keys.camera)} para se ver em 3ª pessoa e conferir o disfarce.`;
    } else {
      id = 'hider-hunt';
      title = 'Os caçadores estão procurando';
      body = 'Se alguém chegar perto, mantenha a calma: ficar parado engana mais do que fugir. Se for descoberto, corra e vire outro objeto longe dali.';
    }
  } else if (me?.team === 'HUNTERS' && me.alive) {
    if (room.state === 'HIDING') {
      id = 'hunter-wait';
      title = 'Você é CAÇADOR';
      body = 'Você está de olhos vendados enquanto os outros se escondem. Quando a caçada começar, procure objetos fora do lugar ou repetidos demais.';
    } else if (room.state === 'HUNTING') {
      id = 'hunter-hunt';
      title = 'Hora da caçada';
      body = touch
        ? 'Mire num objeto suspeito (a mira fica vermelha de perto) e toque em "Capturar". Errar custa um tempinho. "Lanterna" ajuda no escuro.'
        : `Mire num objeto suspeito (a mira fica vermelha de perto) e clique ou aperte ${k(keys.interact)}. Errar custa um tempinho. ${k(keys.flashlight)} liga a lanterna.`;
    }
  }
  if (!id || hidden === id) return null;

  return (
    <div className="tutorial-tip" role="status">
      <div className="tutorial-tip-head">
        <strong>{title}</strong>
        <span className="tutorial-tip-count">
          Dica · partida {Math.min(state.matches + 1, MATCHES_WITH_TIPS)}/{MATCHES_WITH_TIPS}
        </span>
      </div>
      <p>{body}</p>
      <div className="tutorial-tip-actions">
        <button type="button" onClick={() => setHidden(id)}>
          Entendi
        </button>
        <button
          type="button"
          className="tutorial-tip-off"
          onClick={() => {
            const next = { ...state, off: true };
            setState(next);
            save(next);
          }}
        >
          Não mostrar mais dicas
        </button>
      </div>
    </div>
  );
}
