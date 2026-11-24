import { randomUUID } from 'node:crypto';
import type { PublicPlayer } from '@hh/shared';

export interface ConnectedPlayer extends PublicPlayer {
  /** Identificador da sessão do navegador (nunca é enviado a outros jogadores). */
  sessionId: string;
  accountId: string;
  /** Socket atual; undefined enquanto a conexão estiver caída. */
  socketId: string | undefined;
  disconnectedAt: number | null;
}

export interface RegisterResult {
  player: ConnectedPlayer;
  /** Socket antigo da mesma sessão, que deve ser desconectado. */
  replacedSocketId: string | undefined;
  /** A sessão já existia (reconexão ou outra aba). */
  resumed: boolean;
}

/**
 * Registro das sessões no servidor.
 *
 * - Uma mesma sessão nunca aparece duas vezes: se ela se conectar de novo,
 *   a conexão antiga é substituída e o jogador mantém o mesmo id.
 * - Quando a conexão cai, a sessão é mantida por um tempo (reconexão).
 */
export class PlayerRegistry {
  private readonly bySession = new Map<string, ConnectedPlayer>();
  private readonly bySocket = new Map<string, ConnectedPlayer>();

  register(sessionId: string, socketId: string, nickname: string, accountId: string): RegisterResult {
    const existing = this.bySession.get(sessionId);
    if (existing && existing.accountId === accountId) {
      const replacedSocketId = existing.socketId !== socketId ? existing.socketId : undefined;
      if (replacedSocketId) this.bySocket.delete(replacedSocketId);
      existing.socketId = socketId;
      existing.nickname = nickname;
      existing.disconnectedAt = null;
      this.bySocket.set(socketId, existing);
      return { player: existing, replacedSocketId, resumed: true };
    }
    if (existing?.socketId) this.bySocket.delete(existing.socketId);

    const player: ConnectedPlayer = {
      id: randomUUID(),
      nickname,
      sessionId,
      accountId,
      socketId,
      disconnectedAt: null,
    };
    this.bySession.set(sessionId, player);
    this.bySocket.set(socketId, player);
    return { player, replacedSocketId: existing?.socketId, resumed: false };
  }

  getBySocket(socketId: string): ConnectedPlayer | undefined {
    return this.bySocket.get(socketId);
  }

  /** Marca a sessão como desconectada (se este socket ainda for o atual). */
  disconnect(socketId: string, now = Date.now()): ConnectedPlayer | undefined {
    const player = this.bySocket.get(socketId);
    if (!player) return undefined;
    this.bySocket.delete(socketId);
    if (player.socketId === socketId) {
      player.socketId = undefined;
      player.disconnectedAt = now;
    }
    return player;
  }

  /** Remove sessões desconectadas há mais tempo que o limite. Devolve os ids removidos. */
  purge(maxIdleMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [sessionId, player] of this.bySession) {
      if (player.disconnectedAt !== null && now - player.disconnectedAt > maxIdleMs) {
        this.bySession.delete(sessionId);
        removed.push(player.id);
      }
    }
    return removed;
  }

  /** Sessões conectadas de uma conta (uma por aba). */
  byAccount(accountId: string): ConnectedPlayer[] {
    const list: ConnectedPlayer[] = [];
    for (const player of this.bySession.values()) if (player.accountId === accountId && player.socketId) list.push(player);
    return list;
  }

  /** Jogador conectado pelo id de jogador. */
  byPlayerId(playerId: string): ConnectedPlayer | undefined {
    for (const player of this.bySession.values()) if (player.id === playerId) return player;
    return undefined;
  }

  /** Jogadores com conexão ativa. */
  get count(): number {
    return this.bySocket.size;
  }
}

export function toPublicPlayer(player: ConnectedPlayer): PublicPlayer {
  return { id: player.id, nickname: player.nickname };
}
