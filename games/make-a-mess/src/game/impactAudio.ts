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
  basalt: {
    tone: 92,
    toneEnd: 36,
    toneGain: 0.38,
    noiseGain: 0.2,
    noiseFilter: 590,
    duration: 0.32,
  },
  graphiteStone: {
    tone: 101,
    toneEnd: 41,
    toneGain: 0.36,
    noiseGain: 0.21,
    noiseFilter: 650,
    duration: 0.3,
  },
  darkGlass: {
    tone: 1120,
    toneEnd: 360,
    toneGain: 0.17,
    noiseGain: 0.23,
    noiseFilter: 3700,
    duration: 0.36,
  },
  grass: {
    tone: 78,
    toneEnd: 38,
    toneGain: 0.12,
    noiseGain: 0.22,
    noiseFilter: 390,
    duration: 0.2,
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

const AUDIO_ROOT = "/games/make-a-mess/audio";

function recordingVariants(prefix: string, count = 4): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `${AUDIO_ROOT}/kenney/${prefix}_${index.toString().padStart(3, "0")}.ogg`,
  );
}

const heavyRecordings: Record<BreakableMaterial, readonly string[]> = {
  brick: recordingVariants("impactMining"),
  wood: recordingVariants("impactWood_heavy"),
  plaster: recordingVariants("impactGeneric_light"),
  concrete: recordingVariants("impactMining"),
  glass: recordingVariants("impactGlass_heavy"),
  steel: recordingVariants("impactMetal_heavy"),
  stone: recordingVariants("impactMining"),
  basalt: recordingVariants("impactMining"),
  graphiteStone: recordingVariants("impactMining"),
  darkGlass: recordingVariants("impactGlass_heavy"),
  grass: recordingVariants("impactSoft_heavy"),
  soil: recordingVariants("impactSoft_heavy"),
  earth: recordingVariants("impactSoft_heavy"),
  asphalt: recordingVariants("impactMining"),
};

const lightRecordings: Record<BreakableMaterial, readonly string[]> = {
  brick: recordingVariants("impactGeneric_light"),
  wood: recordingVariants("impactPlank_medium"),
  plaster: recordingVariants("impactGeneric_light"),
  concrete: recordingVariants("impactGeneric_light"),
  glass: recordingVariants("impactGlass_medium"),
  steel: recordingVariants("impactPlate_heavy"),
  stone: recordingVariants("impactGeneric_light"),
  basalt: recordingVariants("impactGeneric_light"),
  graphiteStone: recordingVariants("impactGeneric_light"),
  darkGlass: recordingVariants("impactGlass_medium"),
  grass: recordingVariants("impactSoft_heavy"),
  soil: recordingVariants("impactSoft_heavy"),
  earth: recordingVariants("impactSoft_heavy"),
  asphalt: recordingVariants("impactGeneric_light"),
};

const lightRecordingTail: Record<BreakableMaterial, number> = {
  brick: 0.2,
  wood: 0.72,
  plaster: 0.2,
  concrete: 0.2,
  glass: 0.52,
  steel: 0.5,
  stone: 0.2,
  basalt: 0.24,
  graphiteStone: 0.22,
  darkGlass: 0.54,
  grass: 0.48,
  soil: 0.5,
  earth: 0.5,
  asphalt: 0.2,
};

const heavyRecordingTail: Record<BreakableMaterial, number> = {
  brick: 0.86,
  wood: 0.38,
  plaster: 0.24,
  concrete: 0.86,
  glass: 0.42,
  steel: 0.54,
  stone: 0.86,
  basalt: 0.9,
  graphiteStone: 0.88,
  darkGlass: 0.44,
  grass: 0.48,
  soil: 0.5,
  earth: 0.5,
  asphalt: 0.86,
};

const explosionRecordings = [
  `${AUDIO_ROOT}/explosions/big-explosion.ogg`,
  `${AUDIO_ROOT}/explosions/explosion-heavy.ogg`,
] as const;

const decodedRecordings = new Map<string, AudioBuffer>();
const loadingRecordings = new Map<string, Promise<AudioBuffer | null>>();
const previousRecordingByFamily = new Map<string, string>();

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

function loadRecording(
  context: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  const decoded = decodedRecordings.get(url);
  if (decoded) {
    return Promise.resolve(decoded);
  }

  const pending = loadingRecordings.get(url);
  if (pending) {
    return pending;
  }

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Audio request failed: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      decodedRecordings.set(url, buffer);
      return buffer;
    })
    .catch(() => null);

  loadingRecordings.set(url, request);
  return request;
}

function chooseRecording(
  family: string,
  urls: readonly string[],
): string | null {
  const available = urls.filter((url) => decodedRecordings.has(url));
  if (available.length === 0) {
    return null;
  }

  const previous = previousRecordingByFamily.get(family);
  const choices =
    available.length > 1
      ? available.filter((url) => url !== previous)
      : available;
  const selected = choices[Math.floor(Math.random() * choices.length)];
  previousRecordingByFamily.set(family, selected);
  return selected;
}

function playRecording(
  context: AudioContext,
  family: string,
  urls: readonly string[],
  destination: AudioNode,
  start: number,
  gain: number,
  pitchSpread = 0.06,
): boolean {
  const selected = chooseRecording(family, urls);
  if (!selected) {
    for (const url of urls) {
      void loadRecording(context, url);
    }
    return false;
  }

  const buffer = decodedRecordings.get(selected);
  if (!buffer) {
    return false;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const sampleGain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(
    1 + (Math.random() - 0.5) * pitchSpread * 2,
    start,
  );
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(38, start);
  sampleGain.gain.setValueAtTime(gain, start);
  source.connect(highpass);
  highpass.connect(sampleGain);
  sampleGain.connect(destination);
  source.start(start);
  return true;
}

export function prepareGameAudio(): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }
  if (context.state === "suspended") {
    void context.resume();
  }

  const urls = new Set<string>(explosionRecordings);
  for (const recordings of Object.values(heavyRecordings)) {
    recordings.forEach((url) => urls.add(url));
  }
  for (const recordings of Object.values(lightRecordings)) {
    recordings.forEach((url) => urls.add(url));
  }
  for (const url of urls) {
    void loadRecording(context, url);
  }
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
  while (debrisSoundTimes.length > 0 && now - debrisSoundTimes[0] > 260) {
    debrisSoundTimes.shift();
  }
  if (debrisSoundTimes.length >= 4) {
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
  const synthesisEnd = start + duration;
  const end = start + Math.max(duration, lightRecordingTail[material]);
  const master = createImpactBus(
    context,
    start,
    0.045 + level * 0.26,
    end,
  );
  const recorded = playRecording(
    context,
    `debris:${material}`,
    lightRecordings[material],
    master,
    start,
    0.42 + level * 0.46,
    0.1,
  );
  const syntheticScale = recorded ? 0.24 : 1;

  const oscillator = context.createOscillator();
  oscillator.type = material === "wood" || material === "steel" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.tone * 0.78 * pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    profile.toneEnd * 0.72 * pitch,
    synthesisEnd,
  );
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(
    profile.toneGain * (0.55 + level * 0.3) * syntheticScale,
    start,
  );
  toneGain.gain.exponentialRampToValueAtTime(0.0001, synthesisEnd);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(synthesisEnd);

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
    profile.noiseGain *
      (0.42 + level * 0.42) *
      (recorded ? 0.38 : 1),
    start,
  );
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, synthesisEnd);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(synthesisEnd);
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
  const end = start + 0.32;
  const pitch = 0.94 + Math.random() * 0.1;
  const master = createImpactBus(context, start, 0.58, end);

  const tube = context.createOscillator();
  const tubeGain = context.createGain();
  tube.type = "sine";
  tube.frequency.setValueAtTime(112 * pitch, start);
  tube.frequency.exponentialRampToValueAtTime(39, start + 0.18);
  tubeGain.gain.setValueAtTime(0.52, start);
  tubeGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
  tube.connect(tubeGain);
  tubeGain.connect(master);
  tube.start(start);
  tube.stop(start + 0.2);

  const propellant = context.createBufferSource();
  const propellantFilter = context.createBiquadFilter();
  const propellantGain = context.createGain();
  propellant.buffer = createNoiseBuffer(context, 0.16, 2.1);
  propellantFilter.type = "bandpass";
  propellantFilter.frequency.setValueAtTime(720 * pitch, start);
  propellantFilter.frequency.exponentialRampToValueAtTime(
    230,
    start + 0.16,
  );
  propellantFilter.Q.setValueAtTime(0.55, start);
  propellantGain.gain.setValueAtTime(0.42, start);
  propellantGain.gain.exponentialRampToValueAtTime(
    0.0001,
    start + 0.16,
  );
  propellant.connect(propellantFilter);
  propellantFilter.connect(propellantGain);
  propellantGain.connect(master);
  propellant.start(start);
  propellant.stop(start + 0.17);

  const actionStart = start + 0.052;
  const action = context.createBufferSource();
  const actionFilter = context.createBiquadFilter();
  const actionGain = context.createGain();
  action.buffer = createNoiseBuffer(context, 0.045, 3.4);
  actionFilter.type = "highpass";
  actionFilter.frequency.setValueAtTime(2400, actionStart);
  actionGain.gain.setValueAtTime(0.13, actionStart);
  actionGain.gain.exponentialRampToValueAtTime(
    0.0001,
    actionStart + 0.045,
  );
  action.connect(actionFilter);
  actionFilter.connect(actionGain);
  actionGain.connect(master);
  action.start(actionStart);
  action.stop(actionStart + 0.05);
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
  const end = start + 0.28;
  const pitch = 0.94 + Math.random() * 0.12;
  const master = createImpactBus(context, start, 0.62, end);

  const thump = context.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(132 * pitch, start);
  thump.frequency.exponentialRampToValueAtTime(48, start + 0.105);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.28, start);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.115);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(start);
  thump.stop(start + 0.12);

  const crack = context.createBufferSource();
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crack.buffer = createNoiseBuffer(context, 0.085, 2.4);
  crackFilter.type = "bandpass";
  crackFilter.frequency.setValueAtTime(
    (1550 + Math.random() * 620) * pitch,
    start,
  );
  crackFilter.Q.setValueAtTime(0.62, start);
  crackGain.gain.setValueAtTime(0.82, start);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);
  crack.start(start);
  crack.stop(start + 0.09);

  // The muzzle body is wider and shorter than the crack. Keeping the layers
  // separate prevents automatic fire from becoming one continuous buzz.
  const body = context.createBufferSource();
  const bodyFilter = context.createBiquadFilter();
  const bodyGain = context.createGain();
  body.buffer = createNoiseBuffer(context, 0.12, 1.7);
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.setValueAtTime(980 * pitch, start);
  bodyFilter.frequency.exponentialRampToValueAtTime(170, start + 0.12);
  bodyGain.gain.setValueAtTime(0.38, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(master);
  body.start(start);
  body.stop(start + 0.125);

  // A delayed bolt/casing click makes each round discrete without making it
  // louder than the shot itself.
  const mechanismStart = start + 0.045 + Math.random() * 0.012;
  const mechanism = context.createBufferSource();
  const mechanismFilter = context.createBiquadFilter();
  const mechanismGain = context.createGain();
  mechanism.buffer = createNoiseBuffer(context, 0.04, 3.2);
  mechanismFilter.type = "bandpass";
  mechanismFilter.frequency.setValueAtTime(
    2700 + Math.random() * 1200,
    mechanismStart,
  );
  mechanismFilter.Q.setValueAtTime(2.4, mechanismStart);
  mechanismGain.gain.setValueAtTime(0.16, mechanismStart);
  mechanismGain.gain.exponentialRampToValueAtTime(
    0.0001,
    mechanismStart + 0.04,
  );
  mechanism.connect(mechanismFilter);
  mechanismFilter.connect(mechanismGain);
  mechanismGain.connect(master);
  mechanism.start(mechanismStart);
  mechanism.stop(mechanismStart + 0.045);

  const room = context.createBufferSource();
  const roomFilter = context.createBiquadFilter();
  const roomGain = context.createGain();
  room.buffer = createNoiseBuffer(context, 0.21, 1.9);
  roomFilter.type = "bandpass";
  roomFilter.frequency.setValueAtTime(520 + Math.random() * 190, start + 0.025);
  roomFilter.Q.setValueAtTime(0.48, start + 0.025);
  roomGain.gain.setValueAtTime(0.0001, start);
  roomGain.gain.exponentialRampToValueAtTime(0.13, start + 0.032);
  roomGain.gain.exponentialRampToValueAtTime(0.0001, end);
  room.connect(roomFilter);
  roomFilter.connect(roomGain);
  roomGain.connect(master);
  room.start(start + 0.025);
  room.stop(end);
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
  const duration = 2.45;
  const end = start + duration;
  const master = createImpactBus(context, start, 0.94, end);
  const recorded = playRecording(
    context,
    "explosion",
    explosionRecordings,
    master,
    start,
    0.8,
    0.045,
  );
  const syntheticScale = recorded ? 0.58 : 1;

  const boom = context.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(108, start);
  boom.frequency.exponentialRampToValueAtTime(24, start + 1.28);
  const boomGain = context.createGain();
  boomGain.gain.setValueAtTime(0.7 * syntheticScale, start);
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
  subGain.gain.exponentialRampToValueAtTime(
    0.48 * syntheticScale,
    start + 0.028,
  );
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
  bodyGain.gain.setValueAtTime(0.52 * syntheticScale, start);
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
  crackGain.gain.setValueAtTime(0.68 * syntheticScale, start);
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
    reflectionGain.gain.setValueAtTime(
      (0.16 - index * 0.035) * syntheticScale,
      reflectionStart,
    );
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
  for (let index = 0; index < 5; index += 1) {
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
  const synthesisEnd = start + duration;
  const end = start + Math.max(duration, heavyRecordingTail[material]);
  const master = createImpactBus(context, start, 0.82, end);
  const recorded = playRecording(
    context,
    `impact:${material}`,
    heavyRecordings[material],
    master,
    start,
    0.76,
    0.07,
  );
  const syntheticScale = recorded ? 0.22 : 1;

  const oscillator = context.createOscillator();
  const toneGain = context.createGain();
  oscillator.type =
    material === "wood" || material === "steel" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(profile.tone * pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    profile.toneEnd * pitch,
    synthesisEnd,
  );
  toneGain.gain.setValueAtTime(
    profile.toneGain * syntheticScale,
    start,
  );
  toneGain.gain.exponentialRampToValueAtTime(0.0001, synthesisEnd);
  oscillator.connect(toneGain);
  toneGain.connect(master);
  oscillator.start(start);
  oscillator.stop(synthesisEnd);

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
  noiseGain.gain.setValueAtTime(
    profile.noiseGain * (recorded ? 0.34 : 1),
    start,
  );
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, synthesisEnd);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(start);
  noise.stop(synthesisEnd);

  const resonance = context.createOscillator();
  const resonanceGain = context.createGain();
  const resonanceEnd = Math.min(
    synthesisEnd,
    start + duration * 0.72,
  );
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
    profile.toneGain *
      (material === "steel" || material === "glass" ? 0.42 : 0.2) *
      (recorded ? 0.36 : 1),
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
    const thumpEnd = Math.min(synthesisEnd, start + 0.19);
    thump.type = "sine";
    thump.frequency.setValueAtTime(92 * pitch, start);
    thump.frequency.exponentialRampToValueAtTime(38, thumpEnd);
    thumpGain.gain.setValueAtTime(
      0.34 * (recorded ? 0.48 : 1),
      start,
    );
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
      chimeGain.gain.setValueAtTime(
        (0.08 - index * 0.016) * (recorded ? 0.42 : 1),
        chimeStart,
      );
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, chimeEnd);
      chime.connect(chimeGain);
      chimeGain.connect(master);
      chime.start(chimeStart);
      chime.stop(chimeEnd);
    }
  }
}
