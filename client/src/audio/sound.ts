import { settingsStore } from '../settings/settings';

/**
 * Áudio sintetizado com Web Audio (sem arquivos externos).
 * Efeitos curtos para eventos do jogo e uma trilha ambiente discreta.
 */
export type SoundName =
  | 'click'
  | 'transform'
  | 'capture'
  | 'miss'
  | 'tick'
  | 'start'
  | 'win'
  | 'lose'
  | 'error'
  | 'whistle'
  | 'door'
  | 'switch'
  | 'impact'
  | 'thunder'
  | 'radar'
  | 'ability'
  | 'pop';

let ctx: AudioContext | null = null;
let effectsGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicNodes: AudioScheduledSourceNode[] = [];

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    effectsGain = ctx.createGain();
    musicGain = ctx.createGain();
    effectsGain.connect(ctx.destination);
    musicGain.connect(ctx.destination);
    applyVolumes();
    settingsStore.subscribe(applyVolumes);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function applyVolumes(): void {
  const s = settingsStore.get();
  if (effectsGain) effectsGain.gain.value = s.masterVolume * s.effectsVolume;
  if (musicGain) musicGain.gain.value = s.masterVolume * s.musicVolume * 0.25;
}

/** Destino do som: saída geral ou um "panner" 3D posicionado no mundo. */
let routeTo: AudioNode | null = null;

function tone(
  freq: number,
  duration: number,
  options: { type?: OscillatorType; delay?: number; slideTo?: number; volume?: number } = {},
): void {
  const audio = context();
  if (!audio || !effectsGain) return;
  const output = routeTo ?? effectsGain;
  const start = audio.currentTime + (options.delay ?? 0);
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, start);
  if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.3, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(output);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise(duration: number, volume = 0.25, filterFreq = 1200, type: BiquadFilterType = 'bandpass'): void {
  const audio = context();
  if (!audio || !effectsGain) return;
  const output = routeTo ?? effectsGain;
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(output);
  source.start();
}

export function playSound(name: SoundName): void {
  switch (name) {
    case 'click':
      tone(660, 0.06, { type: 'triangle', volume: 0.15 });
      break;
    case 'transform':
      noise(0.35, 0.35, 900);
      tone(300, 0.25, { slideTo: 900, type: 'sine', volume: 0.2 });
      break;
    case 'capture':
      tone(880, 0.12, { type: 'square', volume: 0.15 });
      tone(1320, 0.25, { type: 'square', delay: 0.1, volume: 0.15 });
      break;
    case 'miss':
      tone(220, 0.2, { type: 'sawtooth', slideTo: 140, volume: 0.15 });
      break;
    case 'tick':
      tone(1000, 0.05, { type: 'square', volume: 0.08 });
      break;
    case 'start':
      tone(523, 0.15, { type: 'triangle' });
      tone(784, 0.3, { type: 'triangle', delay: 0.15 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', delay: i * 0.12 }));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', delay: i * 0.16 }));
      break;
    case 'error':
      tone(180, 0.15, { type: 'square', volume: 0.12 });
      break;
    case 'whistle':
      tone(1800, 0.18, { type: 'sine', slideTo: 2400, volume: 0.35 });
      tone(2400, 0.3, { type: 'sine', delay: 0.2, slideTo: 1500, volume: 0.35 });
      break;
    case 'door':
      noise(0.35, 0.3, 300, 'lowpass');
      tone(110, 0.2, { type: 'triangle', volume: 0.2 });
      break;
    case 'switch':
      noise(0.04, 0.4, 3000, 'highpass');
      break;
    case 'impact':
      noise(0.18, 0.45, 250, 'lowpass');
      tone(90, 0.12, { type: 'sine', volume: 0.3 });
      break;
    case 'thunder':
      noise(2.2, 0.7, 120, 'lowpass');
      break;
    case 'radar':
      tone(1200, 0.5, { type: 'sine', slideTo: 400, volume: 0.2 });
      break;
    case 'ability':
      tone(660, 0.1, { type: 'triangle', volume: 0.15 });
      tone(990, 0.15, { type: 'triangle', delay: 0.08, volume: 0.15 });
      break;
    case 'pop':
      tone(500, 0.08, { type: 'sine', slideTo: 900, volume: 0.2 });
      break;
  }
}

/** Atualiza a posição do "ouvido" (câmera) para os sons 3D. */
export function setListener(position: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }): void {
  const audio = ctx;
  if (!audio) return;
  const l = audio.listener;
  if (l.positionX) {
    l.positionX.value = position.x;
    l.positionY.value = position.y;
    l.positionZ.value = position.z;
    l.forwardX.value = forward.x;
    l.forwardY.value = forward.y;
    l.forwardZ.value = forward.z;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }
}

/** Toca um som vindo de um ponto do mapa (volume e lado dependem da distância). */
export function playSoundAt(name: SoundName, position: [number, number, number]): void {
  const audio = context();
  if (!audio || !effectsGain) return;
  const panner = audio.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.maxDistance = 40;
  panner.rolloffFactor = 1.3;
  panner.positionX.value = position[0];
  panner.positionY.value = position[1];
  panner.positionZ.value = position[2];
  panner.connect(effectsGain);
  routeTo = panner;
  playSound(name);
  routeTo = null;
  setTimeout(() => panner.disconnect(), 4000);
}

let alarmNodes: AudioScheduledSourceNode[] = [];
/** Sirene de alarme enquanto o evento durar. */
export function setAlarm(active: boolean): void {
  const audio = context();
  if (!audio || !effectsGain) return;
  if (active && alarmNodes.length === 0) {
    const osc = audio.createOscillator();
    osc.type = 'sawtooth';
    const lfo = audio.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = 220;
    osc.frequency.value = 700;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = audio.createGain();
    gain.gain.value = 0.06;
    osc.connect(gain).connect(effectsGain);
    osc.start();
    lfo.start();
    alarmNodes = [osc, lfo];
  } else if (!active && alarmNodes.length > 0) {
    for (const node of alarmNodes) node.stop();
    alarmNodes = [];
  }
}

let rainNode: AudioBufferSourceNode | null = null;
/** Chuva lá fora (som contínuo e abafado). */
export function setRain(active: boolean): void {
  const audio = context();
  if (!audio || !musicGain) return;
  if (active && !rainNode) {
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = audio.createGain();
    gain.gain.value = 0.9;
    source.connect(filter).connect(gain).connect(musicGain);
    source.start();
    rainNode = source;
  } else if (!active && rainNode) {
    rainNode.stop();
    rainNode = null;
  }
}

/** Trilha ambiente: dois osciladores graves com um filtro que "respira". */
export function startAmbientMusic(): void {
  const audio = context();
  if (!audio || !musicGain || musicNodes.length > 0) return;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 250;
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(musicGain);
  for (const freq of [55, 82.4, 110.5]) {
    const osc = audio.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const g = audio.createGain();
    g.gain.value = 0.15;
    osc.connect(g).connect(filter);
    osc.start();
    musicNodes.push(osc);
  }
  lfo.start();
  musicNodes.push(lfo);
}

export function stopAmbientMusic(): void {
  setAlarm(false);
  setRain(false);
  for (const node of musicNodes) {
    try {
      node.stop();
    } catch {
      // já parado
    }
  }
  musicNodes = [];
}
