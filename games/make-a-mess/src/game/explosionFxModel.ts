/**
 * Pure model of the explosion visual: lobe selection, the secondary-particle
 * inventory, blocked-surface (ground/facade surge) detection and the HDR fire
 * ramp. No three/react imports so the detectors in tests/ execute it directly.
 *
 * The shape targets come from the reference passport: jets reach ~2 lobe
 * radii past the core, the silhouette stops being a sphere after ~150 ms,
 * white-hot pockets and near-black soot coexist in one frame, and the dusty
 * aftermath outlives the flame several times over.
 */

export interface ExplosionFxLobeInput {
  readonly direction: readonly [number, number, number];
  readonly weight: number;
  readonly delay: number;
}

export interface ExplosionFxInput {
  readonly id: number;
  readonly kind: "grenade" | "rocket" | "lance" | "charge";
  readonly position: readonly [number, number, number];
  readonly lobes: readonly ExplosionFxLobeInput[];
  readonly dustColor: readonly [number, number, number];
}

export const MAX_FIREBALL_LOBES = 8;

/** Raymarch box edge = fireball diameter × this: head-room for jets. */
export const FIREBALL_BOX_SCALE = 1.75;
/** Fully expanded core radius in box-local units. */
export const FIREBALL_CORE_RADIUS = 0.085;
/** Jets elongate along their axis by up to this factor. */
export const LOBE_STRETCH_RANGE: readonly [number, number] = [1.35, 2.7];
/** Noise carves boundaries radially by up to ±this fraction of the radius. */
export const FIREBALL_CARVE_AMPLITUDE = 0.43;
/**
 * travel + stretched radius (incl. carve) must stay inside the unit box —
 * a clipped jet reads as a sliced flat face, worse than a shorter jet.
 */
export const LOBE_TIP_LIMIT = 0.46;

/**
 * HDR fire ramp. These raw values land in the half-float buffer that
 * UnrealBloom thresholds, and they are NOT scaled when that gate moves: AgX is
 * an absolute curve, so changing them would change what colour the fireball
 * renders, not just what haloes. The core still crosses the gate by more than
 * three times and the ember still stays under it.
 */
export const EXPLOSION_FIRE_RAMP = {
  ember: [0.72, 0.035, 0.004],
  orange: [3.3, 0.52, 0.025],
  yellow: [8.4, 2.9, 0.4],
  whiteHot: [26, 20.5, 12.5],
} as const;

/** Bloom threshold in CinematicPostProcessing; kept here for the detectors. */
export const BLOOM_THRESHOLD = 6;

/** Instanced pool sizes; the inventory detectors keep spawn counts inside. */
export const EXPLOSION_POOL_CAPACITY = {
  trail: 288,
  smoke: 320,
  ribbon: 160,
} as const;

export interface ExplosionLightPlan {
  readonly peak: number;
  readonly distance: number;
  readonly life: number;
  /**
   * Ember afterglow: the dust cloud stays warmly lit from within after the
   * flash instead of going dead-dark the moment it ends.
   */
  readonly emberLife: number;
  /** Fraction of the flash peak retained through the ember phase. */
  readonly emberFraction: number;
  /** Extra camera-exposure factor at detonation (decays with EXPOSURE_TAU). */
  readonly exposureKick: number;
}

export const EXPLOSION_LIGHT: Record<
  "grenade" | "rocket" | "lance" | "charge",
  ExplosionLightPlan
> =
  {
    grenade: {
      peak: 240,
      distance: 14,
      life: 0.34,
      emberLife: 1.0,
      emberFraction: 0.12,
      exposureKick: 0.34,
    },
    rocket: {
      peak: 520,
      distance: 20,
      life: 0.5,
      emberLife: 1.5,
      emberFraction: 0.14,
      exposureKick: 0.5,
    },
    // Игла: короткая резкая вспышка. Света меньше, чем у тяжёлой, и он
    // быстро гаснет — боевая часть маленькая, гореть в ней нечему.
    lance: {
      peak: 300,
      distance: 12,
      life: 0.26,
      emberLife: 0.7,
      emberFraction: 0.09,
      exposureKick: 0.3,
    },
    charge: {
      peak: 920,
      distance: 34,
      life: 0.72,
      emberLife: 2.25,
      emberFraction: 0.17,
      exposureKick: 0.7,
    },
  };

/** Exposure-kick decay time constant, seconds. */
export const EXPOSURE_KICK_TAU = 0.09;

export function random01(seed: number, index: number, salt: number): number {
  const value =
    Math.sin(seed * 17.17 + index * 91.91 + salt * 37.37) * 43758.5453;
  return value - Math.floor(value);
}

export interface FireballLobe {
  readonly direction: readonly [number, number, number];
  /** sqrt-compressed weight used for radius/heat scaling, 0.2..1. */
  readonly visibleWeight: number;
  readonly delay: number;
  /** Lobe centre travel from the charge, box-local units. */
  readonly travel: number;
  /** Lateral lobe radius, box-local units. */
  readonly radius: number;
  /** 0..1: stretch/jet character and timing jitter. */
  readonly shape: number;
}

export interface FireballPlan {
  readonly life: number;
  readonly diameter: number;
  readonly rocket: boolean;
  readonly lobes: readonly FireballLobe[];
}

export function lobeStretch(shape: number): number {
  return (
    LOBE_STRETCH_RANGE[0] +
    (LOBE_STRETCH_RANGE[1] - LOBE_STRETCH_RANGE[0]) * shape
  );
}

function normalized(
  direction: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z);
  if (length < 0.01) return [0, 1, 0];
  return [x / length, y / length, z / length];
}

export function selectFireballLobes(
  lobes: readonly ExplosionFxLobeInput[],
  seed: number,
): FireballLobe[] {
  const candidates = lobes
    .map((lobe, index) => {
      const direction = normalized(lobe.direction);
      const variation = 0.86 + random01(seed, index, 71) * 0.28;
      const weight = Math.max(0, Math.min(1, lobe.weight));
      return {
        direction,
        weight,
        delay: Math.max(0, lobe.delay),
        score: weight * variation,
        sourceIndex: index,
      };
    })
    .filter((candidate) => candidate.weight > 0.035)
    .sort((left, right) => right.score - left.score);

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    // Nearby probes describe one macroscopic vent. Keep the strongest one,
    // then spend the remaining budget on genuinely different directions.
    const overlaps = selected.some(
      (existing) =>
        existing.direction[0] * candidate.direction[0] +
          existing.direction[1] * candidate.direction[1] +
          existing.direction[2] * candidate.direction[2] >
        0.78,
    );
    if (overlaps) continue;
    selected.push(candidate);
    if (selected.length >= MAX_FIREBALL_LOBES) break;
  }

  // A highly enclosed blast can leave too few transmitted probes. Retain its
  // strongest remaining directions at reduced size instead of reverting to a
  // perfect sphere.
  for (const candidate of candidates) {
    if (selected.length >= Math.min(4, MAX_FIREBALL_LOBES)) break;
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
  }

  return selected.map((candidate) => {
    const randomRadius =
      0.88 + random01(seed, candidate.sourceIndex, 79) * 0.24;
    const randomTravel =
      0.86 + random01(seed, candidate.sourceIndex, 83) * 0.3;
    const shape = random01(seed, candidate.sourceIndex, 89);
    const visibleWeight = Math.sqrt(Math.max(0.04, candidate.weight));
    // travel ≈ 2× radius before the tip clamp (which preserves the ratio):
    // lobes must escape the core, not decorate its surface.
    let travel = (0.17 + visibleWeight * 0.13) * randomTravel;
    let radius = (0.055 + visibleWeight * 0.06) * randomRadius;
    // Keep the fully carved, fully stretched tip inside the raymarch box.
    const tip =
      travel + radius * lobeStretch(shape) * (1 + FIREBALL_CARVE_AMPLITUDE);
    if (tip > LOBE_TIP_LIMIT) {
      const scale = LOBE_TIP_LIMIT / tip;
      travel *= scale;
      radius *= scale;
    }
    return {
      direction: candidate.direction,
      visibleWeight,
      delay: candidate.delay + shape * 0.025,
      travel,
      radius,
      shape,
    };
  });
}

export function planFireball(
  definition: ExplosionFxInput,
  seed: number,
): FireballPlan {
  const rocket = definition.kind === "rocket" || definition.kind === "charge";
  return {
    life: definition.kind === "charge" ? 1.78 : rocket ? 1.32 : 0.98,
    diameter: definition.kind === "charge" ? 9.2 : rocket ? 5.4 : 3.15,
    rocket,
    lobes: selectFireballLobes(definition.lobes, seed),
  };
}

export interface BlastSurface {
  /** Unit normal pointing away from the blocked surface. */
  readonly normal: readonly [number, number, number];
  /** 0..1: how decisively one side of the blast is walled off. */
  readonly strength: number;
}

/**
 * The visual probes already encode occlusion: weight ≈ transmission. When one
 * side of the sphere is consistently blocked (ground burst, facade burst),
 * their blocked-direction average points into the surface — that plane hosts
 * the dust surge ring seen in every ground-detonation reference.
 */
export function computeBlastSurface(
  lobes: readonly ExplosionFxLobeInput[],
): BlastSurface | null {
  if (lobes.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const lobe of lobes) {
    const direction = normalized(lobe.direction);
    const blocked = 1 - Math.max(0, Math.min(1, lobe.weight));
    x += direction[0] * blocked;
    y += direction[1] * blocked;
    z += direction[2] * blocked;
  }
  const length = Math.hypot(x, y, z);
  const mean = length / lobes.length;
  const strength = Math.max(
    0,
    Math.min(1, (mean - 0.1) / (0.26 - 0.1)),
  );
  if (strength <= 0.05 || length < 1e-6) return null;
  return {
    normal: [-x / length, -y / length, -z / length],
    strength,
  };
}

export interface PlannedParticle {
  readonly origin: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  /**
   * Trail pool: clamp on travelled distance. Smoke pool: buoyant rise
   * amplitude — the packet climbs ~1.39× this value over its life.
   */
  readonly reach: number;
  /** Seconds after detonation. */
  readonly birthOffset: number;
  readonly life: number;
  readonly size: number;
  readonly seed: number;
  /** Trail: 0 puff / 1 fragment / 2 jet. Smoke: 0 soot / 1 dust / 2 surge. */
  readonly kind: number;
  readonly heat: number;
  readonly density?: number;
  /**
   * Half-space the packet must stay in front of (xyz normal, w offset):
   * the surface the blast went off against. Undefined for open-air bursts.
   */
  readonly clampPlane?: readonly [number, number, number, number];
  readonly color: readonly [number, number, number];
}

export interface SecondaryPlan {
  readonly smoke: PlannedParticle[];
  readonly trail: PlannedParticle[];
}

function lerp3(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

const SOOT_BASE: readonly [number, number, number] = [0.09, 0.098, 0.102];
const HOT_FRAGMENT: readonly [number, number, number] = [1, 0.824, 0.541];
const COLD_FRAGMENT: readonly [number, number, number] = [0.847, 0.82, 0.761];

/** Per-quality inventory floors; the detectors pin these numbers. */
export const SECONDARY_COUNTS = {
  smoke: [30, 52, 78],
  fragments: [16, 28, 44],
  sparks: [20, 32, 48],
  jets: [10, 18, 30],
  surge: [10, 16, 24],
  fallers: [6, 10, 16],
} as const;

export function planExplosionSecondaries(
  definition: ExplosionFxInput,
  fireball: FireballPlan,
  quality: number,
  seed: number,
): SecondaryPlan {
  const rocket = fireball.rocket;
  const charge = definition.kind === "charge";
  const smoke: PlannedParticle[] = [];
  const trail: PlannedParticle[] = [];
  const center = definition.position;
  // The blocked surface (ground or facade) shapes two things: the surge ring
  // runs along it, and every smoke packet / falling thread is clamped so it
  // slides along the surface instead of passing through it. The plane sits
  // slightly behind the charge so the fireball still hugs the wall.
  const surface = computeBlastSurface(definition.lobes);
  const clampPlane: readonly [number, number, number, number] | undefined =
    surface
      ? [
          surface.normal[0],
          surface.normal[1],
          surface.normal[2],
          surface.normal[0] * (center[0] - surface.normal[0] * 0.12) +
            surface.normal[1] * (center[1] - surface.normal[1] * 0.12) +
            surface.normal[2] * (center[2] - surface.normal[2] * 0.12),
        ]
      : undefined;
  const dust = definition.dustColor;
  const soot = lerp3(SOOT_BASE, dust, 0.1);
  const coldFragment = lerp3(COLD_FRAGMENT, dust, 0.28);
  const lobeCount = fireball.lobes.length;

  const lobeDirection = (index: number): readonly [number, number, number] =>
    lobeCount > 0
      ? fireball.lobes[index % lobeCount].direction
      : ([0, 1, 0] as const);
  const lobeDelay = (index: number): number =>
    lobeCount > 0 ? fireball.lobes[index % lobeCount].delay : 0;

  const jittered = (
    index: number,
    lobeIndex: number,
    saltBase: number,
    spread: number,
    yBias: number,
  ): [number, number, number] => {
    const base = lobeDirection(lobeIndex);
    return normalized([
      base[0] + (random01(seed, index, saltBase) - 0.5) * spread,
      base[1] + (random01(seed, index, saltBase + 4) - yBias) * spread,
      base[2] + (random01(seed, index, saltBase + 6) - 0.5) * spread,
    ]);
  };

  // Main cloud: born almost immediately — references show the flame already
  // wrapped in smoke by 150–200 ms — and it outlives the flame several-fold.
  const smokeCount = Math.round(
    SECONDARY_COUNTS.smoke[quality] * (rocket ? 1.22 : 1),
  );
  for (let index = 0; index < smokeCount; index += 1) {
    const lobeIndex =
      lobeCount > 0
        ? (index + Math.floor(random01(seed, index, 101) * lobeCount)) %
          lobeCount
        : 0;
    const direction = jittered(index, lobeIndex, 103, 0.62, 0.42);
    const isSoot = random01(seed, index, 113) < (rocket ? 0.62 : 0.46);
    const radial =
      fireball.diameter * (0.025 + random01(seed, index, 127) * 0.11);
    const origin: [number, number, number] = [
      center[0] +
        direction[0] * radial +
        (random01(seed, index, 131) - 0.5) * fireball.diameter * 0.08,
      center[1] +
        direction[1] * radial +
        (random01(seed, index, 137) - 0.5) * fireball.diameter * 0.08,
      center[2] +
        direction[2] * radial +
        (random01(seed, index, 139) - 0.5) * fireball.diameter * 0.08,
    ];
    // A third of the cloud barely moves: it marks the detonation site while
    // the fast packets fly, so the plume never detaches leaving a clean gap.
    const lingering = random01(seed, index, 193) < 0.32;
    const speed =
      ((rocket ? 2.2 : 1.6) +
        random01(seed, index, 149) * (rocket ? 4.8 : 3.4)) *
      (lingering ? 0.22 : 1);
    smoke.push({
      origin,
      velocity: [
        direction[0] * speed,
        direction[1] * speed + random01(seed, index, 151) * 0.5,
        direction[2] * speed,
      ],
      reach:
        (isSoot
          ? 1.6 + random01(seed, index, 157) * 1.9
          : 0.9 + random01(seed, index, 157) * 1.3) *
        (lingering ? 0.45 : 1),
      birthOffset:
        lobeDelay(lobeIndex) +
        0.02 +
        random01(seed, index, 163) * (rocket ? 0.14 : 0.11),
      life:
        (isSoot ? 3.6 : 3.0) +
        (lingering ? 0.8 : 0) +
        random01(seed, index, 167) * (rocket ? 2.6 : 2.0),
      size:
        (rocket ? 0.62 : 0.47) +
        random01(seed, index, 173) * (rocket ? 0.68 : 0.5),
      seed: random01(seed, index, 179),
      kind: isSoot ? 0 : 1,
      heat: 0,
      // Moderate per-shell opacity: cloud solidity should come from packet
      // OVERLAP, so intersections blend into gradients instead of edges.
      density: 0.66 + random01(seed, index, 191) * 0.4,
      clampPlane,
      color: isSoot ? soot : dust,
    });
  }

  // Deliberately non-physical visual fragments: Rapier still owns the large
  // debris, this pool fills the fast small scale. Sizes must read at 10 m.
  const fragmentCount = SECONDARY_COUNTS.fragments[quality] + (rocket ? 8 : 0);
  for (let index = 0; index < fragmentCount; index += 1) {
    const lobeIndex = lobeCount > 0 ? index % lobeCount : 0;
    const direction = jittered(index, lobeIndex, 197, 0.78, 0.36);
    const speed =
      (rocket ? 10.5 : 8.5) + random01(seed, index, 223) * (rocket ? 17 : 14);
    const radial =
      fireball.diameter * (0.055 + random01(seed, index, 224) * 0.11);
    const origin: [number, number, number] = [
      center[0] +
        direction[0] * radial +
        (random01(seed, index, 225) - 0.5) * fireball.diameter * 0.1,
      center[1] +
        direction[1] * radial +
        (random01(seed, index, 226) - 0.5) * fireball.diameter * 0.1,
      center[2] +
        direction[2] * radial +
        (random01(seed, index, 228) - 0.5) * fireball.diameter * 0.1,
    ];
    const heated = random01(seed, index, 227) < (rocket ? 0.62 : 0.38);
    trail.push({
      origin,
      velocity: [
        direction[0] * speed,
        direction[1] * speed,
        direction[2] * speed,
      ],
      reach: (rocket ? 8 : 4.5) + random01(seed, index, 229) * 5,
      birthOffset: random01(seed, index, 233) * 0.065,
      life: 0.48 + random01(seed, index, 239) * 0.85,
      size: 0.1 + random01(seed, index, 241) * (rocket ? 0.2 : 0.14),
      seed: random01(seed, index, 251),
      kind: 1,
      heat: heated ? 0.38 + random01(seed, index, 257) * 0.3 : 0,
      color: heated ? HOT_FRAGMENT : coldFragment,
    });

    if (heated && index < [6, 10, 16][quality]) {
      const trailCount = quality === 0 ? 1 : 2;
      for (let trailIndex = 0; trailIndex < trailCount; trailIndex += 1) {
        const lag = 0.24 - trailIndex * 0.06;
        smoke.push({
          origin,
          velocity: [
            direction[0] * speed * lag,
            direction[1] * speed * lag,
            direction[2] * speed * lag,
          ],
          reach: 0.5 + random01(seed, index, 317 + trailIndex) * 0.5,
          birthOffset:
            0.075 +
            trailIndex * 0.11 +
            random01(seed, index, 331 + trailIndex) * 0.045,
          life: 1.4 + random01(seed, index, 347 + trailIndex) * 1.1,
          size: 0.13 + random01(seed, index, 353 + trailIndex) * 0.13,
          seed: random01(seed, index, 359 + trailIndex),
          kind: 0,
          heat: 0,
          // Debris trails are faint wisps, not solid balls.
          density: 0.34 + random01(seed, index, 367 + trailIndex) * 0.18,
          clampPlane,
          color: soot,
        });
      }
    }
  }

  // Incandescent filaments — the "hair" of the reference explosions. Each is
  // a RIBBON: the renderer reconstructs its ballistic arc analytically, so
  // the streak curves under gravity and persists behind the burning head.
  // kind 3 routes these to the ribbon pool; density carries the trail window
  // in seconds (how far back along the arc the ribbon reaches).
  const sparkCount = SECONDARY_COUNTS.sparks[quality] + (rocket ? 8 : 0);
  for (let index = 0; index < sparkCount; index += 1) {
    const lobeIndex = lobeCount > 0 ? index % lobeCount : 0;
    const direction = jittered(index, lobeIndex, 401, 0.9, 0.44);
    const speed =
      (rocket ? 20 : 16) + random01(seed, index, 409) * (rocket ? 26 : 22);
    trail.push({
      origin: [
        center[0] + direction[0] * fireball.diameter * 0.05,
        center[1] + direction[1] * fireball.diameter * 0.05,
        center[2] + direction[2] * fireball.diameter * 0.05,
      ],
      velocity: [
        direction[0] * speed,
        direction[1] * speed,
        direction[2] * speed,
      ],
      reach: 12,
      birthOffset: random01(seed, index, 421) * 0.04,
      life: 0.6 + random01(seed, index, 431) * 0.8,
      size: 0.02 + random01(seed, index, 433) * 0.014,
      seed: random01(seed, index, 439),
      kind: 3,
      heat: 0.72 + random01(seed, index, 443) * 0.28,
      density: 0.16 + random01(seed, index, 449) * 0.14,
      // Sparks skid along the birth surface instead of diving through it.
      clampPlane,
      color: HOT_FRAGMENT,
    });
  }

  // Cooled debris raining out of the cloud, each pulling a long grey smoke
  // thread — the hanging "jellyfish tentacles" of the second reference.
  const fallerCount = SECONDARY_COUNTS.fallers[quality] + (rocket ? 4 : 0);
  const thread = lerp3([0.62, 0.62, 0.63], dust, 0.35);
  for (let index = 0; index < fallerCount; index += 1) {
    const lobeIndex = lobeCount > 0 ? index % lobeCount : 0;
    const direction = jittered(index, lobeIndex, 601, 1.1, 0.3);
    const speed = 3.5 + random01(seed, index, 607) * 4.5;
    trail.push({
      origin: [
        center[0] + direction[0] * fireball.diameter * 0.12,
        center[1] + direction[1] * fireball.diameter * 0.12,
        center[2] + direction[2] * fireball.diameter * 0.12,
      ],
      velocity: [
        direction[0] * speed,
        direction[1] * speed + 1.5 + random01(seed, index, 613) * 2,
        direction[2] * speed,
      ],
      reach: 12,
      birthOffset: 0.22 + random01(seed, index, 617) * 0.35,
      life: 1.8 + random01(seed, index, 619) * 1.2,
      size: 0.05 + random01(seed, index, 631) * 0.05,
      seed: random01(seed, index, 641),
      kind: 3,
      heat: 0,
      density: 0.85 + random01(seed, index, 643) * 0.5,
      // Threads land on the surface and lie along it.
      clampPlane,
      color: thread,
    });
  }

  // Short material-coloured jets travel behind the fastest fragments. They
  // are not the lingering smoke cloud and disappear before buoyancy matters.
  const jetCount = SECONDARY_COUNTS.jets[quality] + (rocket ? 6 : 0);
  for (let index = 0; index < jetCount; index += 1) {
    const lobeIndex = lobeCount > 0 ? index % lobeCount : 0;
    const direction = jittered(index, lobeIndex, 263, 0.34, 0.48);
    const speed = (rocket ? 3.8 : 2.8) + random01(seed, index, 277) * 4.2;
    const radial =
      fireball.diameter * (0.045 + random01(seed, index, 279) * 0.09);
    trail.push({
      origin: [
        center[0] + direction[0] * radial,
        center[1] + direction[1] * radial,
        center[2] + direction[2] * radial,
      ],
      velocity: [
        direction[0] * speed,
        direction[1] * speed,
        direction[2] * speed,
      ],
      reach: 1.6 + random01(seed, index, 281) * (rocket ? 3.6 : 2.3),
      birthOffset: 0.025 + random01(seed, index, 283) * 0.12,
      life: 0.62 + random01(seed, index, 293) * 0.78,
      size: 0.11 + random01(seed, index, 307) * (rocket ? 0.24 : 0.16),
      seed: random01(seed, index, 311),
      kind: 2,
      heat: 0,
      color: dust,
    });
  }

  // Surge ring: when one side of the blast is walled off (ground or facade),
  // dust races tangentially along that surface — the low skirt that sells
  // scale in every ground-detonation reference.
  if (surface) {
    const [nx, ny, nz] = surface.normal;
    const helper: readonly [number, number, number] =
      Math.abs(ny) < 0.86 ? [0, 1, 0] : [1, 0, 0];
    const tangentA = normalized([
      ny * helper[2] - nz * helper[1],
      nz * helper[0] - nx * helper[2],
      nx * helper[1] - ny * helper[0],
    ]);
    const tangentB = normalized([
      ny * tangentA[2] - nz * tangentA[1],
      nz * tangentA[0] - nx * tangentA[2],
      nx * tangentA[1] - ny * tangentA[0],
    ]);
    const surgeCount = Math.round(
      (SECONDARY_COUNTS.surge[quality] + (rocket ? 6 : 0)) * surface.strength,
    );
    for (let index = 0; index < surgeCount; index += 1) {
      const angle =
        (index / Math.max(1, surgeCount)) * Math.PI * 2 +
        random01(seed, index, 503) * 0.7;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const direction = normalized([
        tangentA[0] * cos + tangentB[0] * sin + nx * 0.12,
        tangentA[1] * cos + tangentB[1] * sin + ny * 0.12,
        tangentA[2] * cos + tangentB[2] * sin + nz * 0.12,
      ]);
      const speed =
        (rocket ? 7 : 5.5) + random01(seed, index, 509) * (rocket ? 6 : 4.5);
      smoke.push({
        origin: [
          center[0] + direction[0] * 0.4 + nx * 0.1,
          center[1] + direction[1] * 0.4 + ny * 0.1,
          center[2] + direction[2] * 0.4 + nz * 0.1,
        ],
        velocity: [
          direction[0] * speed,
          direction[1] * speed,
          direction[2] * speed,
        ],
        reach: 0.35 + random01(seed, index, 521) * 0.3,
        birthOffset: 0.03 + random01(seed, index, 523) * 0.06,
        life: 2.6 + random01(seed, index, 541) * 1.6,
        size:
          (rocket ? 0.7 : 0.5) + random01(seed, index, 547) * (rocket ? 0.7 : 0.5),
        seed: random01(seed, index, 557),
        kind: 2,
        heat: 0,
        density: 0.9 + random01(seed, index, 563) * 0.5,
        clampPlane,
        color: dust,
      });
    }
  }

  if (!charge) return { smoke, trail };
  const expand = (particle: PlannedParticle, smokeParticle: boolean) => ({
    ...particle,
    velocity: [
      particle.velocity[0] * 1.28,
      particle.velocity[1] * 1.28,
      particle.velocity[2] * 1.28,
    ] as [number, number, number],
    reach: particle.reach * 1.35,
    life: particle.life * (smokeParticle ? 1.18 : 1.08),
    size: particle.size * (smokeParticle ? 1.38 : 1.25),
  });
  // Количество и размер дают именно ОБЪЁМ, а не просто большую яркую сферу.
  return {
    smoke: [
      ...smoke.map((particle) => expand(particle, true)),
      ...smoke
        .slice(0, Math.floor(smoke.length * 0.42))
        .map((particle) => expand({ ...particle, birthOffset: particle.birthOffset + 0.08 }, true)),
    ],
    trail: [
      ...trail.map((particle) => expand(particle, false)),
      ...trail
        .slice(0, Math.floor(trail.length * 0.3))
        .map((particle) => expand({ ...particle, birthOffset: particle.birthOffset + 0.035 }, false)),
    ],
  };
}
