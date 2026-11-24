import { io, type Socket } from 'socket.io-client';
import {
  ErrorCode,
  NetEvent,
  type AbilityId,
  type AbilityStates,
  type GameMode,
  type ProgressSnapshot,
  type PublicProfile,
  type RankingScope,
  type ReplayData,
  type RoomEffect,
  type SocialSnapshot,
  type VoiceSignalData,
  nicknameSchema,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type FeedEvent,
  type MatchResults,
  type MovePayload,
  type NetError,
  type NetResult,
  type Profile,
  type PublicPlayer,
  type RankingCategory,
  type RankingResponse,
  type RoomInfo,
  type RoomSettingsPatch,
  type ServerInfo,
  type ServerStats,
  type ServerToClientEvents,
  type Snapshot,
  type TeleportMessage,
} from '@hh/shared';
import { SERVER_URL } from './serverUrl';
import { getAccountToken, getSessionId, saveNickname, setAccountToken } from './session';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface FeedItem {
  id: number;
  at: number;
  event: FeedEvent;
}

export interface NetworkState {
  status: ConnectionStatus;
  /** Jogador identificado no servidor (null até concluir o "hello"). */
  player: PublicPlayer | null;
  server: ServerInfo | null;
  stats: ServerStats | null;
  profile: Profile | null;
  room: RoomInfo | null;
  results: MatchResults | null;
  feed: FeedItem[];
  /** Latência de ida e volta, em ms (média móvel). */
  latencyMs: number | null;
  /** Diferença estimada entre o relógio do servidor e o local, em ms. */
  clockOffsetMs: number;
  identifying: boolean;
  /** Outra aba/conexão assumiu esta sessão. */
  sessionReplaced: boolean;
  /** Última mensagem de erro para exibir ao jogador. */
  error: string | null;
  abilities: AbilityStates;
  progress: ProgressSnapshot | null;
  social: SocialSnapshot | null;
  invites: { id: number; fromNickname: string; code: string }[];
  /** Avisos rápidos (conquistas, missões concluídas). */
  notices: { id: number; text: string }[];
  voicePeers: string[];
}

const REQUEST_TIMEOUT_MS = 6000;
const FEED_LIMIT = 6;

const initialState: NetworkState = {
  status: 'disconnected',
  player: null,
  server: null,
  stats: null,
  profile: null,
  room: null,
  results: null,
  feed: [],
  latencyMs: null,
  clockOffsetMs: 0,
  identifying: false,
  sessionReplaced: false,
  error: null,
  abilities: {},
  progress: null,
  social: null,
  invites: [],
  notices: [],
  voicePeers: [],
};

const TIMEOUT_ERROR: NetError = { code: ErrorCode.Internal, message: 'O servidor não respondeu a tempo.' };
const OFFLINE_ERROR: NetError = { code: ErrorCode.Internal, message: 'Sem conexão com o servidor.' };

/**
 * Cliente de rede do jogo.
 *
 * Mantém a conexão Socket.IO, identifica o jogador, mede a latência, guarda o
 * estado da sala para a interface React (useSyncExternalStore) e repassa as
 * mensagens frequentes (snapshots, teletransportes) direto para o motor 3D.
 */
export class NetworkClient {
  private socket: ClientSocket | null = null;
  private state: NetworkState = initialState;
  private readonly listeners = new Set<() => void>();
  private readonly snapshotListeners = new Set<(snapshot: Snapshot) => void>();
  private readonly teleportListeners = new Set<(message: TeleportMessage) => void>();
  private readonly effectListeners = new Set<(effect: RoomEffect) => void>();
  private readonly voiceListeners = new Set<(message: { from: string; data: VoiceSignalData }) => void>();
  private noticeCounter = 0;
  private lastTeleport: TeleportMessage | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private nickname: string | null = null;
  private feedCounter = 0;

  getState = (): NetworkState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onSnapshot(listener: (snapshot: Snapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** Recebe teletransportes; o último recebido é entregue na hora ao se inscrever. */
  onTeleport(listener: (message: TeleportMessage) => void): () => void {
    this.teleportListeners.add(listener);
    if (this.lastTeleport) listener(this.lastTeleport);
    return () => this.teleportListeners.delete(listener);
  }

  onEffect(listener: (effect: RoomEffect) => void): () => void {
    this.effectListeners.add(listener);
    return () => this.effectListeners.delete(listener);
  }

  onVoiceSignal(listener: (message: { from: string; data: VoiceSignalData }) => void): () => void {
    this.voiceListeners.add(listener);
    return () => this.voiceListeners.delete(listener);
  }

  /** Hora atual no relógio do servidor (ms). */
  serverNow(): number {
    return Date.now() + this.state.clockOffsetMs;
  }

  connect(): void {
    if (this.socket) return;
    const options = {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: REQUEST_TIMEOUT_MS,
    };
    const socket: ClientSocket = SERVER_URL ? io(SERVER_URL, options) : io(options);
    this.socket = socket;
    this.update({ status: 'connecting' });

    socket.on('connect', () => {
      this.update({ status: 'connected', error: null });
      if (this.nickname) void this.identify(this.nickname);
    });

    socket.on('disconnect', (reason) => {
      this.stopPing();
      this.update({ status: 'disconnected', player: null, latencyMs: null });
      if (reason === 'io server disconnect' && !this.state.error) {
        this.update({ error: 'O servidor encerrou a conexão.' });
      }
    });

    socket.io.on('reconnect_attempt', () => this.update({ status: 'connecting' }));
    socket.on('connect_error', () => {
      this.update({ status: 'disconnected', error: 'Não foi possível conectar ao servidor. Tentando novamente...' });
    });

    socket.on(NetEvent.Stats, (stats) => this.update({ stats }));
    socket.on(NetEvent.Error, (err: NetError) => {
      this.update({ error: err.message, sessionReplaced: err.code === ErrorCode.SessionReplaced });
    });
    socket.on(NetEvent.RoomState, (room) => {
      // Uma nova contagem limpa os resultados da partida anterior.
      const results = room && room.state === 'FINISHED' ? this.state.results : null;
      this.update({ room, results });
    });
    socket.on(NetEvent.Results, (results) => {
      this.update({ results });
      void this.refreshProfile();
    });
    socket.on(NetEvent.Feed, (event) => {
      const item: FeedItem = { id: ++this.feedCounter, at: Date.now(), event };
      this.update({ feed: [...this.state.feed, item].slice(-FEED_LIMIT) });
    });
    socket.on(NetEvent.Snapshot, (snapshot) => {
      for (const listener of this.snapshotListeners) listener(snapshot);
    });
    socket.on(NetEvent.Teleport, (message) => {
      this.lastTeleport = message;
      for (const listener of this.teleportListeners) listener(message);
    });
    socket.on(NetEvent.Abilities, (abilities) => this.update({ abilities }));
    socket.on(NetEvent.Effect, (effect) => {
      if (effect.kind === 'achievement') this.notice(`Conquista desbloqueada: ${effect.name}`);
      if (effect.kind === 'mission') this.notice(`Missão concluída: ${effect.description}`);
      for (const listener of this.effectListeners) listener(effect);
    });
    socket.on(NetEvent.InviteReceived, (invite) => {
      this.update({ invites: [...this.state.invites, { id: ++this.noticeCounter, ...invite }].slice(-3) });
    });
    socket.on(NetEvent.SocialChanged, () => void this.refreshSocial());
    socket.on(NetEvent.VoicePeers, (voicePeers) => this.update({ voicePeers }));
    socket.on(NetEvent.VoiceSignal, (message) => {
      for (const listener of this.voiceListeners) listener(message);
    });
  }

  private notice(text: string): void {
    const id = ++this.noticeCounter;
    this.update({ notices: [...this.state.notices, { id, text }].slice(-4) });
    setTimeout(() => this.update({ notices: this.state.notices.filter((n) => n.id !== id) }), 6000);
  }

  dismissInvite(id: number): void {
    this.update({ invites: this.state.invites.filter((i) => i.id !== id) });
  }

  /** Reconecta manualmente (ex.: depois que outra aba assumiu a sessão). */
  reconnect(): void {
    if (!this.socket) return this.connect();
    this.update({ error: null, sessionReplaced: false, status: 'connecting' });
    this.socket.connect();
  }

  clearError(): void {
    if (this.state.error) this.update({ error: null });
  }

  async identify(rawNickname: string): Promise<boolean> {
    const socket = this.socket;
    if (!socket?.connected) {
      this.update({ error: 'Sem conexão com o servidor.' });
      return false;
    }
    const local = nicknameSchema.safeParse(rawNickname);
    if (!local.success) {
      this.update({ error: local.error.issues[0]?.message ?? 'Nome inválido.' });
      return false;
    }

    this.update({ identifying: true, error: null });
    try {
      const response = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(NetEvent.Hello, {
        protocolVersion: PROTOCOL_VERSION,
        nickname: local.data,
        sessionId: getSessionId(),
        accountToken: getAccountToken(),
      });
      if (!response.ok) {
        this.update({ identifying: false, error: response.error.message });
        return false;
      }
      this.nickname = response.player.nickname;
      saveNickname(response.player.nickname);
      this.update({
        identifying: false,
        player: response.player,
        server: response.server,
        profile: response.profile,
        clockOffsetMs: response.server.serverTime - Date.now(),
      });
      this.startPing();
      void this.refreshProgress();
      void this.refreshSocial();
      return true;
    } catch {
      this.update({ identifying: false, error: TIMEOUT_ERROR.message });
      return false;
    }
  }

  // ---------- salas ----------

  async quickJoin(mode: Exclude<GameMode, 'custom'> = 'classic'): Promise<NetResult> {
    return this.roomRequest(NetEvent.QuickJoin, { mode });
  }

  async createRoom(settings: RoomSettingsPatch): Promise<NetResult> {
    return this.roomRequest(NetEvent.CreateRoom, { settings });
  }

  async joinRoom(code: string): Promise<NetResult> {
    return this.roomRequest(NetEvent.JoinRoom, { code });
  }

  async updateSettings(settings: RoomSettingsPatch): Promise<NetResult> {
    return this.roomRequest(NetEvent.UpdateSettings, { settings });
  }

  async leaveRoom(): Promise<void> {
    await this.request<NetResult>(NetEvent.LeaveRoom, {});
    this.lastTeleport = null;
    this.update({ room: null, results: null, feed: [] });
  }

  startMatch(): Promise<NetResult> {
    return this.request(NetEvent.StartMatch, {});
  }

  vote(mapId: string): Promise<NetResult> {
    return this.request(NetEvent.VoteMap, { mapId });
  }

  // ---------- partida ----------

  sendMove(payload: MovePayload): void {
    if (this.socket?.connected) this.socket.emit(NetEvent.Move, payload);
  }

  transform(propId: string): Promise<NetResult> {
    return this.request(NetEvent.Transform, { propId });
  }

  capture(targetId: string | null, cloneId?: string): Promise<NetResult<{ captured: boolean }>> {
    return this.request(NetEvent.Capture, cloneId ? { targetId, cloneId } : { targetId });
  }

  useAbility(ability: AbilityId, extra: { target?: [number, number, number]; propId?: string; playerId?: string } = {}): Promise<NetResult> {
    return this.request(NetEvent.Ability, { ability, ...extra });
  }

  interact(id: string): Promise<NetResult> {
    return this.request(NetEvent.Interact, { id });
  }

  shove(target: { propId?: string; playerId?: string }): Promise<NetResult> {
    return this.request(NetEvent.Shove, target);
  }

  emote(emote: string): Promise<NetResult> {
    return this.request(NetEvent.Emote, { emote });
  }

  pingMarker(position: [number, number, number]): void {
    if (this.socket?.connected) this.socket.emit(NetEvent.Ping2, { position });
  }

  report(playerId: string, reason: 'cheating' | 'abuse' | 'afk' | 'other', details?: string): Promise<NetResult> {
    return this.request(NetEvent.Report, details ? { playerId, reason, details } : { playerId, reason });
  }

  async replay(matchId?: string): Promise<NetResult<{ replay: ReplayData }>> {
    return this.request(NetEvent.GetReplay, matchId ? { matchId } : {});
  }

  // ---------- voz ----------

  setVoice(enabled: boolean): void {
    if (this.socket?.connected) this.socket.emit(NetEvent.VoiceState, { enabled });
    if (!enabled) this.update({ voicePeers: [] });
  }

  sendVoiceSignal(to: string, data: VoiceSignalData): void {
    if (this.socket?.connected) this.socket.emit(NetEvent.VoiceSignal, { to, data });
  }

  // ---------- missões, temporada, social, conta ----------

  async refreshProgress(): Promise<void> {
    const result = await this.request<NetResult<{ progress: ProgressSnapshot }>>(NetEvent.GetProgress, {});
    if (result.ok) this.update({ progress: result.progress });
  }

  async claimSeason(level: number): Promise<NetResult> {
    const result = await this.request<NetResult<{ progress: ProgressSnapshot }>>(NetEvent.ClaimSeason, { level });
    if (result.ok) {
      this.update({ progress: result.progress });
      void this.refreshProfile();
    }
    return result;
  }

  async refreshSocial(): Promise<void> {
    const result = await this.request<NetResult<{ social: SocialSnapshot }>>(NetEvent.GetSocial, {});
    if (result.ok) this.update({ social: result.social });
  }

  async friendRequest(code: string): Promise<NetResult> {
    const result = await this.request<NetResult>(NetEvent.FriendRequest, { code });
    if (result.ok) void this.refreshSocial();
    return result;
  }

  async friendRespond(requestId: string, accept: boolean): Promise<NetResult> {
    const result = await this.request<NetResult>(NetEvent.FriendRespond, { requestId, accept });
    void this.refreshSocial();
    return result;
  }

  async friendRemove(accountId: string): Promise<NetResult> {
    const result = await this.request<NetResult>(NetEvent.FriendRemove, { accountId });
    void this.refreshSocial();
    return result;
  }

  invite(accountId: string): Promise<NetResult> {
    return this.request(NetEvent.Invite, { accountId });
  }

  viewProfile(accountId: string): Promise<NetResult<{ profile: PublicProfile }>> {
    return this.request(NetEvent.ViewProfile, { accountId });
  }

  async equipEffect(effectId: string): Promise<NetResult> {
    const result = await this.request<NetResult<{ profile: Profile }>>(NetEvent.EquipEffect, { effectId });
    if (result.ok) this.update({ profile: result.profile });
    return result;
  }

  async register(username: string, password: string): Promise<NetResult> {
    const result = await this.request<NetResult<{ profile: Profile }>>(NetEvent.Register, { username, password });
    if (result.ok) this.update({ profile: result.profile });
    return result;
  }

  /** Entra em uma conta com senha: troca o token deste navegador e reconecta. */
  async login(username: string, password: string): Promise<NetResult> {
    const result = await this.request<NetResult<{ accountToken: string; profile: Profile }>>(NetEvent.Login, { username, password });
    if (!result.ok) return result;
    setAccountToken(result.accountToken);
    window.location.reload();
    return { ok: true };
  }

  // ---------- perfil, ranking e loja ----------

  async refreshProfile(): Promise<void> {
    const result = await this.request<NetResult<{ profile: Profile }>>(NetEvent.GetProfile, {});
    if (result.ok) this.update({ profile: result.profile });
  }

  ranking(category: RankingCategory, scope: RankingScope = 'global', mode?: GameMode): Promise<RankingResponse> {
    return this.request(NetEvent.GetRanking, mode ? { category, scope, mode } : { category, scope });
  }

  async buySkin(skinId: string): Promise<NetResult> {
    const result = await this.request<NetResult<{ profile: Profile }>>(NetEvent.BuySkin, { skinId });
    if (result.ok) this.update({ profile: result.profile });
    return result;
  }

  async equipSkin(skinId: string): Promise<NetResult> {
    const result = await this.request<NetResult<{ profile: Profile }>>(NetEvent.EquipSkin, { skinId });
    if (result.ok) this.update({ profile: result.profile });
    return result;
  }

  // ---------- internos ----------

  private async roomRequest(event: string, payload: object): Promise<NetResult> {
    const result = await this.request<NetResult<{ room: RoomInfo }>>(event, payload);
    if (result.ok) this.update({ room: result.room, results: null, feed: [] });
    return result;
  }

  private async request<T extends NetResult>(event: string, payload: object): Promise<T> {
    const socket = this.socket as unknown as {
      connected: boolean;
      timeout(ms: number): { emitWithAck(event: string, payload: object): Promise<T> };
    } | null;
    if (!socket?.connected) return { ok: false, error: OFFLINE_ERROR } as T;
    try {
      return await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(event, payload);
    } catch {
      return { ok: false, error: TIMEOUT_ERROR } as T;
    }
  }

  private startPing(): void {
    this.stopPing();
    void this.measureLatency();
    this.pingTimer = setInterval(() => void this.measureLatency(), PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private async measureLatency(): Promise<void> {
    const socket = this.socket;
    if (!socket?.connected || !this.state.player) return;
    const sentAt = performance.now();
    try {
      const response = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(NetEvent.Ping, { clientTime: Date.now() });
      if (!response.ok) return;
      const rtt = performance.now() - sentAt;
      const previous = this.state.latencyMs;
      const latencyMs = previous === null ? rtt : previous * 0.7 + rtt * 0.3;
      const offset = response.serverTime - (response.clientTime + rtt / 2);
      // Suaviza a correção do relógio para o cronômetro não "pular".
      const clockOffsetMs = previous === null ? offset : this.state.clockOffsetMs * 0.8 + offset * 0.2;
      this.update({ latencyMs, clockOffsetMs });
    } catch {
      // Ping perdido: a próxima medição tenta de novo.
    }
  }

  private update(partial: Partial<NetworkState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }
}

/** Instância única usada pela aplicação. */
export const network = new NetworkClient();
