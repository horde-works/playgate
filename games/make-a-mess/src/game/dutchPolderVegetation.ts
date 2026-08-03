import type { LandscapeSample } from "../content/landscape/landscapeDocument.ts";
import { dutchPolderLandscapeDocument } from "../content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";

export type DutchPolderVegetationStyle = {
  readonly kind: 0 | 1;
  readonly keep: number;
  readonly dryness: number;
  readonly height: readonly [number, number];
  readonly width: readonly [number, number];
  readonly flowerChance: number;
};

function vegetationHash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function dutchPolderVegetationPatchNoise(
  x: number,
  z: number,
  salt: number,
): number {
  const pitch = 6;
  const gx = Math.floor(x / pitch);
  const gz = Math.floor(z / pitch);
  const tx = smoothstep(0, 1, x / pitch - gx);
  const tz = smoothstep(0, 1, z / pitch - gz);
  const corner = (ox: number, oz: number) =>
    vegetationHash(gx * 92821 + gz * 68917 + ox * 71 + oz * 131, salt);
  const north = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * tx;
  const south = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * tx;
  return north + (south - north) * tz;
}

/** One vegetation language varied by the actual channel cross-section. */
export function sampleDutchPolderVegetation(
  sample: LandscapeSample,
  x: number,
  z: number,
): DutchPolderVegetationStyle | null {
  if (sample.groundKind === "outside") return null;

  const patch = dutchPolderVegetationPatchNoise(x, z, 17);
  if (sample.groundKind === "bed") {
    const channel = sample.channelId
      ? dutchPolderLandscapeDocument.dryChannels.find(({ id }) => id === sample.channelId)
      : undefined;
    const acrossBed = channel && sample.channelDistance !== null
      ? sample.channelDistance / (channel.bedWidth / 2)
      : 0;
    const innerBank = smoothstep(0.55, 0.96, acrossBed);
    // Keep the future water lane legible: sparse islands survive in the
    // centre, while reeds gather toward the shallow inner bank.
    return patch > 0.93 - innerBank * 0.23
      ? {
          kind: 1,
          keep: 0.18 + innerBank * 0.38,
          dryness: 0.68,
          height: [1.05, 1.85],
          width: [0.76, 1.12],
          flowerChance: 0,
        }
      : {
          kind: 0,
          keep: 0.1 + innerBank * 0.22,
          dryness: 0.64,
          height: [0.16, 0.34],
          width: [0.76, 1.12],
          flowerChance: 0.01,
        };
  }
  if (sample.groundKind === "bank") {
    return patch > 0.48
      ? { kind: 1, keep: 0.98, dryness: 0.44, height: [1.35, 2.35], width: [0.88, 1.32], flowerChance: 0 }
      : { kind: 0, keep: 0.96, dryness: 0.16, height: [0.3, 0.66], width: [0.86, 1.3], flowerChance: 0.16 };
  }
  if (sample.groundKind === "terrace") {
    return patch > 0.7
      ? { kind: 1, keep: 0.88, dryness: 0.32, height: [1.1, 1.85], width: [0.82, 1.22], flowerChance: 0 }
      : { kind: 0, keep: 0.98, dryness: 0.12, height: [0.24, 0.54], width: [0.84, 1.28], flowerChance: 0.11 };
  }

  const pathSuppression = smoothstep(0.16, 0.62, sample.pathWeight);
  return {
    kind: 0,
    keep: 0.84 * (1 - pathSuppression * 0.96),
    dryness: 0.12 + patch * 0.28 + pathSuppression * 0.32,
    height: [0.16, 0.42],
    width: [0.8, 1.22],
    flowerChance: 0.085,
  };
}
