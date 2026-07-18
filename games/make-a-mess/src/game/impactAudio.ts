import type { BreakableMaterial } from "./destructionScene";

let audioContext: AudioContext | null = null;

interface SoundProfile {
  readonly tone: number;
  readonly toneEnd: number;
  readonly toneGain: number;
  readonly noiseGain: number;
  readonly noiseFilter: number;
  readonly duration: number;
}

const soundProfiles: Record<BreakableMaterial, SoundProfile> = {
  brick: {
    tone: 138,
    toneEnd: 62,
    toneGain: 0.32,
    noiseGain: 0.2,
    noiseFilter: 920,
    duration: 0.22,
  },
  wood: {
    tone: 246,
    toneEnd: 108,
    toneGain: 0.28,
    noiseGain: 0.12,
    noiseFilter: 1650,
    duration: 0.17,
  },
  plaster: {
    tone: 188,
    toneEnd: 74,
    toneGain: 0.13,
    noiseGain: 0.3,
    noiseFilter: 2600,
    duration: 0.28,
  },
  concrete: {
    tone: 104,
    toneEnd: 44,
    toneGain: 0.36,
    noiseGain: 0.24,
    noiseFilter: 680,
    duration: 0.3,
  },
  glass: {
    tone: 1380,
    toneEnd: 420,
    toneGain: 0.18,
    noiseGain: 0.24,
    noiseFilter: 4200,
    duration: 0.34,
  },
  steel: {
    tone: 540,
    toneEnd: 182,
    toneGain: 0.26,
    noiseGain: 0.12,
    noiseFilter: 3100,
    duration: 0.42,
  },
  stone: {
    tone: 116,
    toneEnd: 48,
    toneGain: 0.34,
    noiseGain: 0.22,
    noiseFilter: 760,
    duration: 0.28,
  },
  soil: {
    tone: 82,
    toneEnd: 42,
    toneGain: 0.14,
    noiseGain: 0.2,
    noiseFilter: 440,
    duration: 0.2,
  },
  asphalt: {
    tone: 96,
    toneEnd: 42,
    toneGain: 0.3,
    noiseGain: 0.22,
    noiseFilter: 620,
    duration: 0.24,
  },
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

const debrisSoundTimes: number[] = [];

export function playDebrisSound(
  material: BreakableMaterial,
  intensity: number,
): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const now = performance.now();
  while (debrisSoundTimes.length > 0 && now - debrisSoundTimes[0] > 220) {
    debrisSoundTimes.shift();
  }
  if (debrisSoundTimes.length >= 6) {
    return;
  }
  debrisSoundTimes.push(now);

  if (context.state === "suspended") {
    void context.resume();
  }

  const profile = soundProfiles[material];
  const level = Math.min(1, Math.max(0.05, intensity));
  const start = context.currentTime;
  const duration = profile.duration * (0.55 + level * 0.4);
  const end = start + duration;

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.06 + level * 0.34, start + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(profile.tone * 0.8, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    profile.toneEnd * 0.8,
    end,
  );
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(profile.toneGain * 0.8, start);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(end);

  const noiseLength = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    const envelope = 1 - index / noiseLength;
    channel[index] = (Math.random() * 2 - 1) * envelope * envelope;
  }
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = buffer;
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(profile.noiseFilter * 0.7, start);
  noiseGain.gain.setValueAtTime(profile.noiseGain * 0.75, start);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(end);
}

export function playLaunchSound(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const start = context.currentTime;
  const end = start + 0.16;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.6, start + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const noiseLength = Math.ceil(context.sampleRate * 0.16);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / noiseLength);
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  noise.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(620, start);
  filter.frequency.exponentialRampToValueAtTime(180, end);
  noise.connect(filter);
  filter.connect(master);
  noise.start(start);
  noise.stop(end);
}

export function playGunshotSound(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const start = context.currentTime;
  const end = start + 0.16;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.5, start + 0.004);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150, start);
  thump.frequency.exponentialRampToValueAtTime(52, start + 0.12);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.55, start);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(start);
  thump.stop(end);

  const noiseLength = Math.ceil(context.sampleRate * 0.1);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    const envelope = (1 - index / noiseLength) ** 1.6;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }
  const crack = context.createBufferSource();
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crack.buffer = buffer;
  crackFilter.type = "bandpass";
  crackFilter.frequency.setValueAtTime(1650, start);
  crackFilter.Q.setValueAtTime(0.7, start);
  crackGain.gain.setValueAtTime(0.5, start);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);
  crack.start(start);
  crack.stop(start + 0.1);
}

export function playExplosionSound(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const start = context.currentTime;
  const duration = 1.05;
  const end = start + duration;

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(1.0, start + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const boom = context.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(96, start);
  boom.frequency.exponentialRampToValueAtTime(26, end);
  const boomGain = context.createGain();
  boomGain.gain.setValueAtTime(0.9, start);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, end);
  boom.connect(boomGain);
  boomGain.connect(master);
  boom.start(start);
  boom.stop(end);

  const crack = context.createOscillator();
  crack.type = "triangle";
  crack.frequency.setValueAtTime(320, start);
  crack.frequency.exponentialRampToValueAtTime(58, start + 0.32);
  const crackGain = context.createGain();
  crackGain.gain.setValueAtTime(0.3, start);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
  crack.connect(crackGain);
  crackGain.connect(master);
  crack.start(start);
  crack.stop(start + 0.36);

  const noiseLength = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    const progress = index / noiseLength;
    const envelope = (1 - progress) ** 2.2;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = buffer;
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(2400, start);
  noiseFilter.frequency.exponentialRampToValueAtTime(140, end);
  noiseGain.gain.setValueAtTime(0.62, start);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(end);
}

export function playImpactSound(
  material: BreakableMaterial,
  delay = 0.095,
): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const profile = soundProfiles[material];
  const start = context.currentTime + delay;
  const end = start + profile.duration;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.8, start + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const oscillator = context.createOscillator();
  const toneGain = context.createGain();
  oscillator.type =
    material === "wood" || material === "steel" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.tone, start);
  oscillator.frequency.exponentialRampToValueAtTime(profile.toneEnd, end);
  toneGain.gain.setValueAtTime(profile.toneGain, start);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(end);

  const noiseLength = Math.ceil(context.sampleRate * profile.duration);
  const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    const envelope = 1 - index / noiseLength;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = buffer;
  noiseFilter.type =
    material === "plaster" || material === "glass"
      ? "highpass"
      : "bandpass";
  noiseFilter.frequency.setValueAtTime(profile.noiseFilter, start);
  noiseFilter.Q.setValueAtTime(material === "wood" ? 2.8 : 0.9, start);
  noiseGain.gain.setValueAtTime(profile.noiseGain, start);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(end);
}
