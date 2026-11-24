import { useState } from 'react';
import { levelFromXp, SKINS } from '@hh/shared';
import { playSound } from '../../audio/sound';
import { useNetwork } from '../../hooks/useNetwork';
import { network } from '../../multiplayer/NetworkClient';
import { Modal } from '../Modal';

/**
 * LOJA de visuais. Moedas são ganhas jogando (não há pagamento real).
 * Compras e equipamentos são validados pelo servidor.
 */
export function ShopPanel({ onClose }: { onClose: () => void }) {
  const { profile } = useNetwork();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!profile) return null;
  const level = levelFromXp(profile.xp);

  const act = async (skinId: string, action: 'buy' | 'equip') => {
    setBusy(skinId);
    const result = action === 'buy' ? await network.buySkin(skinId) : await network.equipSkin(skinId);
    setBusy(null);
    if (result.ok) {
      playSound('click');
      setMessage({ text: action === 'buy' ? 'Compra concluída!' : 'Visual equipado. Vale a partir da próxima sala.', ok: true });
    } else {
      playSound('error');
      setMessage({ text: result.error.message, ok: false });
    }
  };

  return (
    <Modal title="Loja" onClose={onClose} wide>
      <p className="muted">
        Saldo: <strong className="coins">{profile.coins} moedas</strong> · Nível {level}. Visuais mudam só a aparência do
        personagem — nenhum dá vantagem na partida.
      </p>
      {message && <p className={message.ok ? 'form-ok' : 'form-error'}>{message.text}</p>}
      <div className="shop-grid">
        {SKINS.map((skin) => {
          const owned = profile.ownedSkins.includes(skin.id);
          const equipped = profile.equippedSkin === skin.id;
          const locked = level < skin.minLevel;
          return (
            <div key={skin.id} className={`shop-item ${equipped ? 'shop-item--equipped' : ''}`}>
              <div className="shop-swatch" style={{ background: `linear-gradient(135deg, ${skin.color} 60%, ${skin.accent} 60%)` }} />
              <div className="shop-name">{skin.name}</div>
              <div className="shop-price">{skin.price === 0 ? 'Grátis' : `${skin.price} moedas`}</div>
              {locked && !owned && <div className="tiny muted">Nível {skin.minLevel}</div>}
              {equipped ? (
                <span className="badge">Equipado</span>
              ) : owned ? (
                <button type="button" className="button-secondary button-small" disabled={busy !== null} onClick={() => act(skin.id, 'equip')}>
                  Equipar
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary button-small"
                  disabled={busy !== null || locked || profile.coins < skin.price}
                  onClick={() => act(skin.id, 'buy')}
                >
                  Comprar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
