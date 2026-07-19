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
  earth: {
    tone: 74,
    toneEnd: 38,
    toneGain: 0.16,
    noiseGain: 0.24,
    noiseFilter: 380,
    duration: 0.22,
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

function createNoiseBuffer(
  context: AudioContext,
  duration: number,
  decay = 0,
): AudioBuffer {
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const progress = index / length;
    const envelope = decay > 0 ? (1 - progress) ** decay : 1;
    channel[index] = (Math.random() * 2 - 1) * envelope;
  }

  return buffer;
}

function createImpactBus(
  context: AudioContext,
  start: number,
  peak: number,
  end: number,
): GainNode {
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-16, start);
  compressor.knee.setValueAtTime(16, start);
  compressor.ratio.setValueAtTime(5, start);
  compressor.attack.setValueAtTime(0.003, start);
  compressor.release.setValueAtTime(0.18, start);

  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(peak, start + 0.004);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(compressor);
  compressor.connect(context.destination);
  return master;
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
  const pitch = 0.88 + Math.random() * 0.24;
  const start = context.currentTime;
  const duration = profile.duration * (0.5 + level * 0.42);
  const end = start + duration;
  const master = createImpactBus(
    context,
    start,
    0.045 + level * 0.26,
    end,
  );

  const oscillator = context.createOscillator();
  oscillator.type = material === "wood" || material === "steel" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.tone * 0.78 * pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    profile.toneEnd * 0.72 * pitch,
    end,
  );
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(profile.toneGain * (0.55 + level * 0.3), start);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(end);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = createNoiseBuffer(context, duration, 1.8);
  noiseFilter.type =
    material === "glass" || material === "plaster" ? "highpass" : "bandpass";
  noiseFilter.frequency.setValueAtTime(
    profile.noiseFilter * pitch * 0.82,
    start,
  );
  noiseFilter.Q.setValueAtTime(material === "wood" ? 2.1 : 0.72, start);
  noiseGain.gain.setValueAtTime(
    profile.noiseGain * (0.42 + level * 0.42),
    start,
  );
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, end);
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

  const start = context.currentTime + 0.006;
  const duration = 1.65;
  const end = start + duration;
  const master = createImpactBus(context, start, 1.1, end);

  const boom = context.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(108, start);
  boom.frequency.exponentialRampToValueAtTime(24, start + 1.28);
  const boomGain = context.createGain();
  boomGain.gain.setValueAtTime(1.0, start);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.32);
  boom.connect(boomGain);
  boomGain.connect(master);
  boom.start(start);
  boom.stop(start + 1.34);

  const sub = context.createOscillator();
  const subGain = context.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(54, start + 0.018);
  sub.frequency.exponentialRampToValueAtTime(20, start + 1.48);
  subGain.gain.setValueAtTime(0.0001, start);
  subGain.gain.exponentialRampToValueAtTime(0.72, start + 0.028);
  subGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(start);
  sub.stop(start + 1.52);

  const bodyNoise = context.createBufferSource();
  const bodyFilter = context.createBiquadFilter();
  const bodyGain = context.createGain();
  bodyNoise.buffer = createNoiseBuffer(context, duration, 0.55);
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.setValueAtTime(2600, start);
  bodyFilter.frequency.exponentialRampToValueAtTime(105, end);
  bodyGain.gain.setValueAtTime(0.72, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, end);
  bodyNoise.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(master);
  bodyNoise.start(start);
  bodyNoise.stop(end);

  const crackNoise = context.createBufferSource();
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crackNoise.buffer = createNoiseBuffer(context, 0.19, 2.6);
  crackFilter.type = "highpass";
  crackFilter.frequency.setValueAtTime(720, start);
  crackFilter.frequency.exponentialRampToValueAtTime(2800, start + 0.12);
  crackGain.gain.setValueAtTime(0.9, start);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
  crackNoise.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);
  crackNoise.start(start);
  crackNoise.stop(start + 0.2);

  // Three short slapbacks give the blast a sense of space without pretending
  // to be a full room-reverb simulation.
  const reflectionBuffer = createNoiseBuffer(context, 0.12, 2.4);
  [0.14, 0.29, 0.47].forEach((offset, index) => {
    const reflection = context.createBufferSource();
    const reflectionFilter = context.createBiquadFilter();
    const reflectionGain = context.createGain();
    const reflectionStart = start + offset;
    reflection.buffer = reflectionBuffer;
    reflectionFilter.type = "bandpass";
    reflectionFilter.frequency.setValueAtTime(620 - index * 135, reflectionStart);
    reflectionFilter.Q.setValueAtTime(0.65, reflectionStart);
    reflectionGain.gain.setValueAtTime(0.2 - index * 0.045, reflectionStart);
    reflectionGain.gain.exponentialRampToValueAtTime(
      0.0001,
      reflectionStart + 0.12,
    );
    reflection.connect(reflectionFilter);
    reflectionFilter.connect(reflectionGain);
    reflectionGain.connect(master);
    reflection.start(reflectionStart);
    reflection.stop(reflectionStart + 0.13);
  });

  // The tail is punctuated by little chunks and bits of metal arriving later.
  for (let index = 0; index < 8; index += 1) {
    const tickStart = start + 0.22 + index * 0.073 + Math.random() * 0.045;
    const tickDuration = 0.035 + Math.random() * 0.045;
    const tick = context.createBufferSource();
    const tickFilter = context.createBiquadFilter();
    const tickGain = context.createGain();
    tick.buffer = createNoiseBuffer(context, tickDuration, 2.8);
    tickFilter.type = "bandpass";
    tickFilter.frequency.setValueAtTime(
      340 + Math.random() * 1800,
      tickStart,
    );
    tickFilter.Q.setValueAtTime(1.4 + Math.random() * 2.2, tickStart);
    tickGain.gain.setValueAtTime(0.035 + Math.random() * 0.07, tickStart);
    tickGain.gain.exponentialRampToValueAtTime(
      0.0001,
      tickStart + tickDuration,
    );
    tick.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(master);
    tick.start(tickStart);
    tick.stop(tickStart + tickDuration);
  }
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
  const pitch = 0.94 + Math.random() * 0.12;
  const start = context.currentTime + delay;
  const duration = profile.duration * (0.92 + Math.random() * 0.16);
  const end = start + duration;
  const master = createImpactBus(context, start, 0.82, end);

  const oscillator = context.createOscillator();
  const toneGain = context.createGain();
  oscillator.type =
    material === "wood" || material === "steel" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.tone * pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    profile.toneEnd * pitch,
    end,
  );
  toneGain.gain.setValueAtTime(profile.toneGain, start);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(end);

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = createNoiseBuffer(context, duration, 1.35);
  noiseFilter.type =
    material === "plaster" || material === "glass"
      ? "highpass"
      : "bandpass";
  noiseFilter.frequency.setValueAtTime(profile.noiseFilter * pitch, start);
  noiseFilter.Q.setValueAtTime(material === "wood" ? 2.8 : 0.9, start);
  noiseGain.gain.setValueAtTime(profile.noiseGain, start);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, end);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(end);

  const resonance = context.createOscillator();
  const resonanceGain = context.createGain();
  const resonanceEnd = Math.min(end, start + duration * 0.72);
  const resonanceRatio =
    material === "steel" ? 2.7 : material === "glass" ? 2.1 : 1.46;
  resonance.type = material === "wood" ? "triangle" : "sine";
  resonance.frequency.setValueAtTime(
    profile.tone * resonanceRatio * pitch,
    start,
  );
  resonance.frequency.exponentialRampToValueAtTime(
    Math.max(45, profile.toneEnd * resonanceRatio * 0.86),
    resonanceEnd,
  );
  resonanceGain.gain.setValueAtTime(
    profile.toneGain * (material === "steel" || material === "glass" ? 0.42 : 0.2),
    start,
  );
  resonanceGain.gain.exponentialRampToValueAtTime(0.0001, resonanceEnd);
  resonance.connect(resonanceGain);
  resonanceGain.connect(master);
  resonance.start(start);
  resonance.stop(resonanceEnd);

  if (
    material === "brick" ||
    material === "concrete" ||
    material === "stone" ||
    material === "asphalt" ||
    material === "earth"
  ) {
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    const thumpEnd = Math.min(end, start + 0.19);
    thump.type = "sine";
    thump.frequency.setValueAtTime(92 * pitch, start);
    thump.frequency.exponentialRampToValueAtTime(38, thumpEnd);
    thumpGain.gain.setValueAtTime(0.34, start);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, thumpEnd);
    thump.connect(thumpGain);
    thumpGain.connect(master);
    thump.start(start);
    thump.stop(thumpEnd);
  }

  if (material === "glass") {
    for (let index = 0; index < 3; index += 1) {
      const chimeStart = start + 0.018 + index * 0.024;
      const chimeEnd = chimeStart + 0.12 + index * 0.025;
      const chime = context.createOscillator();
      const chimeGain = context.createGain();
      chime.type = "sine";
      chime.frequency.setValueAtTime(
        (1250 + index * 730) * pitch,
        chimeStart,
      );
      chimeGain.gain.setValueAtTime(0.08 - index * 0.016, chimeStart);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, chimeEnd);
      chime.connect(chimeGain);
      chimeGain.connect(master);
      chime.start(chimeStart);
      chime.stop(chimeEnd);
    }
  }
}
