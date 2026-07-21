import { Color, Vector3 } from "three";

/**
 * Frame-coherent environment state. Written once per frame by DayNightCycle,
 * read by the piece-material shader uniforms (sun-tinted fog, wetness) and by
 * the post pipeline (sun shafts, glare, lens dirt). Plain mutable singleton:
 * everything that reads it does so inside the same frame it was written.
 */
export interface EnvironmentState {
  /** Normalized direction FROM the world TOWARD the sun. */
  readonly sunDirection: Vector3;
  /** Sun position in world units (matches the directional light). */
  readonly sunPosition: Vector3;
  readonly sunColor: Color;
  /** 1 at full day, 0 at night. */
  dayFactor: number;
  /** 1 at full night, 0 at day. */
  nightFactor: number;
  /** 0..1 twilight band around sunrise/sunset. */
  twilightFactor: number;
  /**
   * Standing dampness of the map after rain: drives roughness splotches on
   * upward faces. Constant per map for now; a weather system can animate it.
   */
  wetness: number;
}

export const environmentState: EnvironmentState = {
  sunDirection: new Vector3(0.4, 0.7, 0.5).normalize(),
  sunPosition: new Vector3(24, 12, 14),
  sunColor: new Color("#fff3d7"),
  dayFactor: 1,
  nightFactor: 0,
  twilightFactor: 0,
  wetness: 0.55,
};
