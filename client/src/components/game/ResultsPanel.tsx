import { getMap, type MatchResults, type RoomInfo } from '@hh/shared';
import { formatClock, useRemainingSeconds } from './Hud';

interface Props {
  results: MatchResults;
  room: RoomInfo;
  localId: string;
  onReplay?: () => void;
}

/** Tela de vitória/derrota com estatísticas e destaques da partida. */
export function ResultsPanel({ results, room, localId, onReplay }: Props) {
  const remaining = useRemainingSeconds(room);
  const mine = results.players.find((p) => p.id === localId);
  const won = mine ? mine.team === results.winner : null;
  const sorted = [...results.players].sort((a, b) => b.captures - a.captures || b.survivalSeconds - a.survivalSeconds);

  return (
    <section className={`results panel ${won === true ? 'results--win' : won === false ? 'results--lose' : ''}`} aria-live="polite">
      <p className="results-kicker">{getMap(results.mapId)?.name} · {formatClock(results.durationSeconds)}</p>
      <h2 className="results-title">{won === null ? 'Partida encerrada' : won ? 'Vitória!' : 'Derrota'}</h2>
      <p className="results-reason">
        {results.winner === 'HIDERS' ? 'Os escondidos venceram' : 'Os caçadores venceram'} — {results.reason}
      </p>
      {mine && (
        <p className="results-reward">
          +{mine.xpGained} XP · +{mine.coinsGained} moedas
          {mine.ratingChange !== null && mine.ratingChange !== undefined && (
            <> · {mine.ratingChange >= 0 ? '+' : ''}{mine.ratingChange} pontos competitivos</>
          )}
        </p>
      )}
      {results.highlights.length > 0 && (
        <ul className="results-highlights">
          {results.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>Jogador</th>
            <th>Equipe</th>
            <th>Capturas</th>
            <th>Sobreviveu</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className={p.id === localId ? 'row-me' : ''}>
              <td>{p.nickname}</td>
              <td>{p.team === 'HUNTERS' ? 'Caçador' : 'Escondido'}</td>
              <td>{p.captures}</td>
              <td>{p.team === 'HIDERS' ? (p.survived ? 'Até o fim' : `${p.survivalSeconds}s`) : '—'}</td>
              <td>+{p.xpGained}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="results-footer">
        {remaining !== null && <p className="muted tiny">Próxima rodada em {remaining}s</p>}
        {onReplay && (
          <button type="button" className="button-secondary" onClick={onReplay}>
            Ver replay
          </button>
        )}
      </div>
    </section>
  );
}
