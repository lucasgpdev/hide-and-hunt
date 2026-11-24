import { NetEvent } from '@hh/shared';
import type { RateLimitRules } from '../security/rateLimiter.js';

/** Tempo máximo para o cliente se identificar após conectar. */
export const HELLO_TIMEOUT_MS = 10_000;

/** Tamanho máximo de uma mensagem recebida (bytes). */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** Mensagens rejeitadas antes de a conexão ser encerrada. */
export const MAX_VIOLATIONS = 20;

/** Limites de frequência por evento. */
export const RATE_LIMIT_RULES: RateLimitRules = {
  default: { capacity: 10, refillPerSecond: 5 },
  [NetEvent.Hello]: { capacity: 3, refillPerSecond: 0.2 },
  [NetEvent.Ping]: { capacity: 5, refillPerSecond: 2 },
  // Posição: o cliente envia 20 por segundo; a folga cobre oscilações da rede.
  [NetEvent.Move]: { capacity: 40, refillPerSecond: 30 },
  [NetEvent.Transform]: { capacity: 5, refillPerSecond: 2 },
  [NetEvent.Capture]: { capacity: 6, refillPerSecond: 4 },
  [NetEvent.GetProfile]: { capacity: 5, refillPerSecond: 1 },
  [NetEvent.GetRanking]: { capacity: 6, refillPerSecond: 1 },
  [NetEvent.BuySkin]: { capacity: 4, refillPerSecond: 1 },
  [NetEvent.EquipSkin]: { capacity: 4, refillPerSecond: 1 },
  [NetEvent.Ability]: { capacity: 6, refillPerSecond: 3 },
  [NetEvent.Interact]: { capacity: 6, refillPerSecond: 3 },
  [NetEvent.Shove]: { capacity: 6, refillPerSecond: 3 },
  [NetEvent.Emote]: { capacity: 4, refillPerSecond: 1 },
  [NetEvent.Ping2]: { capacity: 4, refillPerSecond: 1 },
  [NetEvent.Report]: { capacity: 3, refillPerSecond: 0.1 },
  [NetEvent.Register]: { capacity: 3, refillPerSecond: 0.1 },
  [NetEvent.Login]: { capacity: 5, refillPerSecond: 0.1 },
  [NetEvent.FriendRequest]: { capacity: 5, refillPerSecond: 0.2 },
  [NetEvent.Invite]: { capacity: 5, refillPerSecond: 0.5 },
  [NetEvent.VoiceSignal]: { capacity: 80, refillPerSecond: 40 },
  [NetEvent.VoiceState]: { capacity: 4, refillPerSecond: 1 },
};

/** Eventos que o cliente pode enviar. Qualquer outro é ignorado e contado como violação. */
export const KNOWN_CLIENT_EVENTS: ReadonlySet<string> = new Set([
  NetEvent.Hello,
  NetEvent.Ping,
  NetEvent.QuickJoin,
  NetEvent.CreateRoom,
  NetEvent.JoinRoom,
  NetEvent.LeaveRoom,
  NetEvent.UpdateSettings,
  NetEvent.StartMatch,
  NetEvent.VoteMap,
  NetEvent.Move,
  NetEvent.Transform,
  NetEvent.Capture,
  NetEvent.GetProfile,
  NetEvent.GetRanking,
  NetEvent.BuySkin,
  NetEvent.EquipSkin,
  NetEvent.EquipEffect,
  NetEvent.Ability,
  NetEvent.Interact,
  NetEvent.Shove,
  NetEvent.Emote,
  NetEvent.Ping2,
  NetEvent.Report,
  NetEvent.GetProgress,
  NetEvent.ClaimSeason,
  NetEvent.GetSocial,
  NetEvent.FriendRequest,
  NetEvent.FriendRespond,
  NetEvent.FriendRemove,
  NetEvent.Invite,
  NetEvent.ViewProfile,
  NetEvent.Register,
  NetEvent.Login,
  NetEvent.GetReplay,
  NetEvent.VoiceSignal,
  NetEvent.VoiceState,
]);
