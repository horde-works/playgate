import type {
  LampDefinition,
  LampEventLevel,
  LampEventState,
  SpotLightDefinition,
} from "./destructionScene";

const DEFAULT_LEVEL: LampEventLevel = {
  intensityMultiplier: 1,
  distanceMultiplier: 1,
};

const DEFAULT_TRANSITION = {
  fadeInSeconds: 0.42,
  fadeOutSeconds: 0.34,
} as const;

export function lampEventLevel(
  lamp: Pick<LampDefinition | SpotLightDefinition, "eventLighting">,
  state: LampEventState,
): LampEventLevel {
  const levels = lamp.eventLighting?.levels;
  return levels?.[state] ??
    (state === "docked" ? levels?.docked : levels?.inTransit) ??
    DEFAULT_LEVEL;
}

/** Electrical cabin lights may remain active during the day; street lamps do not. */
export function lampTimeFactor(
  lamp: Pick<LampDefinition | SpotLightDefinition, "dayIntensityFactor">,
  nightFactor: number,
): number {
  const night = Math.min(1, Math.max(0, nightFactor));
  const day = Math.min(1, Math.max(0, lamp.dayIntensityFactor ?? 0));
  return day + (1 - day) * night;
}

/**
 * Frame-rate independent smoothing for every visual part of a lamp. The
 * configured duration is the time in which an exponential response covers
 * approximately 95% of the requested change.
 */
export function smoothLampLevel(
  lamp: Pick<LampDefinition | SpotLightDefinition, "transition">,
  current: number,
  target: number,
  deltaSeconds: number,
): number {
  const transition = lamp.transition ?? DEFAULT_TRANSITION;
  const duration = target > current
    ? transition.fadeInSeconds
    : transition.fadeOutSeconds;
  if (duration <= 0 || deltaSeconds <= 0) {
    return deltaSeconds <= 0 ? current : target;
  }
  const factor = 1 - Math.exp((-3 * deltaSeconds) / duration);
  return current + (target - current) * factor;
}
