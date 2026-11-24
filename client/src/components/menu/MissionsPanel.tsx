import { useEffect, useState } from 'react';
import { getSkin, SEASON_XP_PER_LEVEL, type SeasonReward } from '@hh/shared';
import { playSound } from '../../audio/sound';
import { useNetwork } from '../../hooks/useNetwork';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';

function rewardLabel(reward: SeasonReward): string {
  switch (reward.kind) {
    case 'coins':
      return `${reward.amount} moedas`;
    case 'skin':
      return `Visual: ${getSkin(reward.skinId).name}`;
    case 'effect':
      return reward.name;
    case 'emote':
      return `Emote: ${reward.emoteId}`;
  }
}

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
}

/** MISSÕES diárias/semanais e PASSE DE TEMPORADA (itens 32 e 33). */
export function MissionsPanel({ onClose }: { onClose: () => void }) {
  const { progress } = useNetwork();
  const [tab, setTab] = useState<'missions' | 'season'>('missions');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void network.refreshProgress();
  }, []);

  const claim = async (level: number) => {
    const result = await network.claimSeason(level);
    if (result.ok) {
      playSound('win');
      setMessage(`Recompensa do nível ${level} resgatada!`);
    } else {
      playSound('error');
      setMessage(result.error.message);
    }
  };

  return (
    <Modal title="Missões e temporada" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'missions'} className={`tab ${tab === 'missions' ? 'tab--active' : ''}`} onClick={() => setTab('missions')}>
          Missões
        </button>
        <button type="button" role="tab" aria-selected={tab === 'season'} className={`tab ${tab === 'season' ? 'tab--active' : ''}`} onClick={() => setTab('season')}>
          Passe de temporada
        </button>
      </div>
      {!progress && <p className="muted">Carregando...</p>}
      {progress && tab === 'missions' && (
        <div className="missions">
          {(['daily', 'weekly'] as const).map((period) => (
            <section key={period}>
              <h3 className="section-title">{period === 'daily' ? 'Diárias' : 'Semanais'}</h3>
              {progress.missions
                .filter((m) => m.period === period)
                .map((m) => (
                  <div key={m.id} className={`mission ${m.completed ? 'mission--done' : ''}`}>
                    <div className="mission-info">
                      <strong>{m.description}</strong>
                      <span className="tiny muted">
                        +{m.rewardCoins} moedas · +{m.rewardSeasonXp} XP de temporada · termina em {timeLeft(m.endsAt)}
                      </span>
                    </div>
                    <div className="mission-progress">
                      <div className="xp-bar">
                        <span style={{ width: `${(m.progress / m.goal) * 100}%` }} />
                      </div>
                      <span className="tiny">{m.completed ? 'Concluída ✓' : `${m.progress}/${m.goal}`}</span>
                    </div>
                  </div>
                ))}
            </section>
          ))}
          <p className="tiny muted">O progresso é calculado pelo servidor ao fim de cada partida.</p>
        </div>
      )}
      {progress && tab === 'season' && (
        <div>
          <h3>{progress.season.season.name}</h3>
          <p className="muted">
            Nível {progress.season.level} · {progress.season.seasonXp} XP de temporada · termina em {timeLeft(progress.season.season.endsAt)}
          </p>
          <div className="xp-bar">
            <span style={{ width: `${((progress.season.seasonXp % SEASON_XP_PER_LEVEL) / SEASON_XP_PER_LEVEL) * 100}%` }} />
          </div>
          {message && <p className="form-ok">{message}</p>}
          <div className="season-track">
            {progress.season.rewards.map((reward, index) => {
              const level = index + 1;
              const reached = progress.season.level >= level;
              const claimed = progress.season.claimed.includes(level);
              return (
                <div key={level} className={`season-level ${reached ? 'season-level--reached' : ''} ${claimed ? 'season-level--claimed' : ''}`}>
                  <span className="season-number">{level}</span>
                  <span className="season-reward">{rewardLabel(reward)}</span>
                  {claimed ? (
                    <span className="badge">Resgatado</span>
                  ) : (
                    <button type="button" className="button-primary button-small" disabled={!reached} onClick={() => void claim(level)}>
                      Resgatar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {progress.season.history.length > 0 && (
            <p className="tiny muted">
              Temporadas anteriores: {progress.season.history.map((h) => `${h.seasonId} (nível ${h.level})`).join(', ')}
            </p>
          )}
          <p className="tiny muted">Todas as recompensas são gratuitas. Não há compras com dinheiro real.</p>
        </div>
      )}
    </Modal>
  );
}
