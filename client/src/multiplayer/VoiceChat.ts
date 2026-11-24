import type { VoiceSignalData } from '@hh/shared';
import { hudStore } from '../game/core/hudStore';
import { settingsStore } from '../settings/settings';
import type { NetworkClient } from './NetworkClient';

/** Distância máxima em que alguém é ouvido (m). */
const HEARING_RANGE = 22;

interface Peer {
  connection: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  panner: PannerNode | null;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
}

/**
 * Chat de voz por proximidade (item 11), ponto a ponto com WebRTC.
 *
 * - O servidor só repassa a sinalização entre jogadores da mesma sala;
 *   o áudio vai direto entre os navegadores e nunca é gravado.
 * - O volume cai com a distância e o som vem do lado certo (áudio espacial).
 * - O microfone só é pedido quando o jogador liga o chat de voz.
 */
export class VoiceChat {
  private stream: MediaStream | null = null;
  private readonly peers = new Map<string, Peer>();
  private context: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private readonly unsubscribers: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  enabled = false;

  constructor(
    private readonly network: NetworkClient,
    private readonly localId: string,
    private readonly positionOf: (id: string) => { x: number; y: number; z: number } | null,
    private readonly listenerPose: () => { position: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } },
  ) {}

  /** Liga o microfone e entra no chat de voz da sala. */
  async enable(): Promise<string | null> {
    if (this.enabled) return null;
    if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador não permite acesso ao microfone.';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return 'Permissão do microfone negada.';
    }
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.localAnalyser = this.context.createAnalyser();
    source.connect(this.localAnalyser);
    this.enabled = true;
    this.unsubscribers.push(
      this.network.onVoiceSignal(({ from, data }) => void this.handleSignal(from, data)),
      this.network.subscribe(() => this.syncPeers()),
    );
    this.network.setVoice(true);
    this.timer = setInterval(() => this.updateAudio(), 100);
    return null;
  }

  disable(): void {
    this.enabled = false;
    this.network.setVoice(false);
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.timer) clearInterval(this.timer);
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    hudStore.set({ speaking: [] });
  }

  setMicMuted(muted: boolean): void {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  /** Conecta com quem também está com voz ligada (o id menor inicia a chamada). */
  private syncPeers(): void {
    if (!this.enabled) return;
    const wanted = new Set(this.network.getState().voicePeers.filter((id) => id !== this.localId));
    for (const id of [...this.peers.keys()]) if (!wanted.has(id)) this.closePeer(id);
    for (const id of wanted) {
      if (this.peers.has(id)) continue;
      const peer = this.createPeer(id);
      if (this.localId < id) void this.makeOffer(id, peer);
    }
  }

  private createPeer(id: string): Peer {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const peer: Peer = { connection, audio: null, panner: null, gain: null, analyser: null };
    this.peers.set(id, peer);
    for (const track of this.stream?.getTracks() ?? []) connection.addTrack(track, this.stream!);
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.network.sendVoiceSignal(id, {
          type: 'candidate',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    connection.ontrack = (event) => {
      const ctx = this.context;
      const stream = event.streams[0];
      if (!ctx || !stream) return;
      // O elemento <audio> mudo é necessário em alguns navegadores para o fluxo tocar.
      const audio = new Audio();
      audio.srcObject = stream;
      audio.muted = true;
      void audio.play().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = 1;
      panner.maxDistance = HEARING_RANGE;
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      source.connect(panner).connect(gain).connect(ctx.destination);
      Object.assign(peer, { audio, panner, gain, analyser });
    };
    return peer;
  }

  private async makeOffer(id: string, peer: Peer): Promise<void> {
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.network.sendVoiceSignal(id, { type: 'offer', sdp: offer.sdp ?? '' });
  }

  private async handleSignal(from: string, data: VoiceSignalData): Promise<void> {
    if (!this.enabled) return;
    const peer = this.peers.get(from) ?? this.createPeer(from);
    const connection = peer.connection;
    try {
      if (data.type === 'offer') {
        await connection.setRemoteDescription({ type: 'offer', sdp: data.sdp ?? '' });
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        this.network.sendVoiceSignal(from, { type: 'answer', sdp: answer.sdp ?? '' });
      } else if (data.type === 'answer') {
        await connection.setRemoteDescription({ type: 'answer', sdp: data.sdp ?? '' });
      } else if (data.type === 'candidate' && data.candidate) {
        await connection.addIceCandidate({ candidate: data.candidate, sdpMid: data.sdpMid ?? null, sdpMLineIndex: data.sdpMLineIndex ?? null });
      }
    } catch {
      // Sinal fora de ordem: a próxima negociação corrige.
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.connection.close();
    peer.audio?.remove();
    peer.gain?.disconnect();
    this.peers.delete(id);
  }

  /** Atualiza posição, volume (distância, silenciados) e quem está falando. */
  private updateAudio(): void {
    const ctx = this.context;
    if (!ctx) return;
    const settings = settingsStore.get();
    const pose = this.listenerPose();
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = pose.position.x;
      l.positionY.value = pose.position.y;
      l.positionZ.value = pose.position.z;
      l.forwardX.value = pose.forward.x;
      l.forwardY.value = pose.forward.y;
      l.forwardZ.value = pose.forward.z;
    }
    const speaking: string[] = [];
    const level = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += Math.abs(v - 128);
      return sum / data.length;
    };
    if (level(this.localAnalyser) > 4) speaking.push(this.localId);
    for (const [id, peer] of this.peers) {
      const position = this.positionOf(id);
      if (peer.panner && position) {
        peer.panner.positionX.value = position.x;
        peer.panner.positionY.value = position.y + 1.6;
        peer.panner.positionZ.value = position.z;
      }
      if (peer.gain) {
        const muted = settings.mutedPlayers.includes(id) || !position;
        peer.gain.gain.value = muted ? 0 : settings.voiceVolume * settings.masterVolume;
      }
      if (level(peer.analyser) > 4 && position) speaking.push(id);
    }
    hudStore.set({ speaking });
  }
}
