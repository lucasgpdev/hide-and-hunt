import { useEffect, useState } from 'react';
import { MODE_INFO, type GameMode, type RankingCategory, type RankingEntry, type RankingScope } from '@hh/shared';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';

const CATEGORIES: { id: RankingCategory; label: string; format?: (v: number) => string }[] = [
  { id: 'xp', label: 'XP total' },
  { id: 'winsHider', label: 'Vitórias escondido' },
  { id: 'winsHunter', label: 'Vitórias caçador' },
  { id: 'captures', label: 'Capturas' },
  { id: 'survivalSeconds', label: 'Tempo sobrevivido', format: (v) => `${Math.floor(v / 60)}min ${v % 60}s` },
  { id: 'matchesPlayed', label: 'Partidas' },
  { id: 'rating', label: 'Pontuação competitiva' },
];

const MODES: (GameMode | 'all')[] = ['all', 'classic', 'infection', 'lone_hunter', 'duos', 'chaos', 'survival', 'competitive'];

/** RANKING global, calculado pelo servidor (item 15). */
export function RankingPanel({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<RankingCategory>('xp');
  const [scope, setScope] = useState<RankingScope>('global');
  const [mode, setMode] = useState<GameMode | 'all'>('all');
  const [entries, setEntries] = useState<RankingEntry[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    void network.ranking(category, scope, mode === 'all' ? undefined : mode).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEntries(result.entries);
        setPersistent(result.persistent);
        setError(null);
      } else setError(result.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [category, scope, mode]);

  const format = CATEGORIES.find((c) => c.id === category)?.format ?? String;

  return (
    <Modal title="Ranking" onClose={onClose} wide>
      <div className="ranking-filters">
        <label className="field field--inline">
          <span>Período</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as RankingScope)}>
            <option value="global">Mundial (sempre)</option>
            <option value="season">Temporada atual</option>
          </select>
        </label>
        <label className="field field--inline">
          <span>Modo</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode | 'all')}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m === 'all' ? 'Todos' : MODE_INFO[m].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === category}
            className={`tab ${c.id === category ? 'tab--active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {!persistent && <p className="notice">Sem banco de dados: o ranking considera só as partidas desde que o servidor iniciou.</p>}
      {error && <p className="form-error">{error}</p>}
      {entries === null && !error && <p className="muted">Carregando...</p>}
      {entries?.length === 0 && <p className="muted">Ninguém pontuou ainda. Jogue uma partida para aparecer aqui!</p>}
      {entries && entries.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jogador</th>
              <th>Nível</th>
              <th>{CATEGORIES.find((c) => c.id === category)?.label}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.rank} className={e.isMe ? 'row-me' : ''}>
                <td>{e.rank}</td>
                <td>{e.nickname}</td>
                <td>{e.level}</td>
                <td>{format(e.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
