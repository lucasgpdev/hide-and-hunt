import { useEffect, useState } from 'react';
import { abilitiesFor, EMOTES, type AbilityStates, type Team } from '@hh/shared';
import { network } from '../../multiplayer/NetworkClient';
import { keyLabel, useSettings } from '../../settings/settings';

interface Props {
  team: Team | null;
  abilities: AbilityStates;
  enabled: boolean;
}

/** Barra de habilidades da equipe, com recarga e usos restantes (item 36). */
export function AbilityBar({ team, abilities, enabled }: Props) {
  const settings = useSettings();
  const [now, setNow] = useState(() => network.serverNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(network.serverNow()), 100);
    return () => clearInterval(timer);
  }, []);
  if (!enabled || !team) return null;
  const defs = abilitiesFor(team);
  const keys = [settings.keys.ability1, settings.keys.ability2, settings.keys.ability3, settings.keys.ability4];

  return (
    <div className="ability-bar" aria-label="Habilidades">
      {defs.map((def, index) => {
        const state = abilities[def.id];
        const remaining = state ? Math.max(0, state.readyAt - now) : 0;
        const fraction = state ? Math.min(1, remaining / (def.cooldownSeconds * 1000)) : 0;
        const active = state ? state.activeUntil > now : false;
        const empty = !state || state.usesLeft <= 0;
        return (
          <div
            key={def.id}
            className={`ability ${active ? 'ability--active' : ''} ${empty ? 'ability--empty' : ''}`}
            title={def.description}
            onPointerDown={(e) => {
              // No celular, tocar na habilidade usa a habilidade (mesmo efeito da tecla).
              if (e.pointerType === 'mouse') return;
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('hh:action', { detail: `ability${index + 1}` }));
            }}
          >
            <div className="ability-cooldown" style={{ height: `${fraction * 100}%` }} />
            <span className="ability-key">{keyLabel(keys[index] ?? '')}</span>
            <span className="ability-name">{def.name}</span>
            <span className="ability-uses">{state ? `${state.usesLeft}x` : '—'}</span>
            {remaining > 0 && <span className="ability-timer">{Math.ceil(remaining / 1000)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Seletor de emotes (tecla B, escolha com 1–6). */
export function EmoteMenu({ unlocked }: { unlocked: string[] }) {
  return (
    <div className="emote-menu" role="menu" aria-label="Emotes">
      {EMOTES.map((emote, index) => {
        const available = emote.free || unlocked.includes(emote.id);
        return (
          <div key={emote.id} className={`emote-option ${available ? '' : 'emote-option--locked'}`}>
            <span className="emote-icon">{emote.icon}</span>
            <span>{emote.name}</span>
            <kbd>{index + 1}</kbd>
            {!available && <span className="tiny">passe</span>}
          </div>
        );
      })}
    </div>
  );
}
