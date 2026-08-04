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
  /** Direction and colour of the active directional key: sun by day, moon by night. */
  readonly keyLightDirection: Vector3;
  readonly keyLightColor: Color;
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
  /**
   * How far the cloud deck has drifted, in metres of world. Published once per
   * frame so the sky, the shadow on the ground and the sun-occlusion query all
   * read the same field at the same offset.
   */
  readonly cloudDrift: [x: number, z: number];
  /** Cloud between the camera and the sun right now, 0..1. */
  sunOcclusion: number;
}

export const environmentState: EnvironmentState = {
  sunDirection: new Vector3(0.4, 0.7, 0.5).normalize(),
  sunPosition: new Vector3(24, 12, 14),
  sunColor: new Color("#fff3d7"),
  keyLightDirection: new Vector3(0.4, 0.7, 0.5).normalize(),
  keyLightColor: new Color("#fff3d7"),
  dayFactor: 1,
  nightFactor: 0,
  twilightFactor: 0,
  wetness: 0.55,
  cloudDrift: [0, 0],
  sunOcclusion: 0,
};
