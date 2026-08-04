import type {
  ObjectLabPart,
  ObjectLightSource,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

export const DUTCH_POLDER_LOCAL_LIGHT_CAPACITY = 6;

export type DutchLampClass = "domestic" | "work" | "exterior";

type FixtureOptions = {
  readonly id: string;
  readonly group: string;
  readonly lens: ObjectPoint;
  readonly poolGroupId: string;
  readonly lampClass: DutchLampClass;
  readonly carrier: "ceiling" | "wall-z" | "wall-x" | "post";
  /** Wall/post carrier surface or ceiling underside in object coordinates. */
  readonly carrierPoint: ObjectPoint;
  readonly outward?: -1 | 1;
  readonly priority?: number;
};

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

const classLight = (
  lampClass: DutchLampClass,
  lens: ObjectPoint,
  poolGroupId: string,
  priority: number,
): ObjectLightSource => {
  if (lampClass === "domestic") {
    return {
      position: lens,
      color: "#ffd08a",
      distance: 10,
      intensity: 12,
      dayIntensityFactor: 0.05,
      poolPriority: priority,
      localPoolCapacity: DUTCH_POLDER_LOCAL_LIGHT_CAPACITY,
      poolGroupId,
      interior: true,
      transition: { fadeInSeconds: 1.8, fadeOutSeconds: 2.4 },
    };
  }
  if (lampClass === "work") {
    return {
      position: lens,
      color: "#ffbd70",
      distance: 14,
      intensity: 18,
      dayIntensityFactor: 0.025,
      poolPriority: priority,
      localPoolCapacity: DUTCH_POLDER_LOCAL_LIGHT_CAPACITY,
      poolGroupId,
      interior: true,
      transition: { fadeInSeconds: 1.4, fadeOutSeconds: 2.0 },
    };
  }
  return {
    position: lens,
    color: "#ffe0aa",
    distance: 16,
    intensity: 20,
    dayIntensityFactor: 0,
    poolPriority: priority,
    localPoolCapacity: DUTCH_POLDER_LOCAL_LIGHT_CAPACITY,
    poolGroupId,
    transition: { fadeInSeconds: 1.6, fadeOutSeconds: 2.2 },
  };
};

/**
 * Compact real fixture used by the canonical object studies. The clear lens
 * is only an envelope; the separate contained bulb owns the light source.
 */
export function dutchLampFixture(options: FixtureOptions): ObjectLabPart[] {
  const { id, group, lens, carrierPoint, carrier, lampClass, poolGroupId } = options;
  const priority = options.priority ?? (lampClass === "exterior" ? 2.2 : lampClass === "work" ? 1.8 : 1.5);
  const parts: ObjectLabPart[] = [];
  const pushBox = (suffix: string, material: "metal" | "timber-dark" | "lamp-glass" | "lamp-bulb", center: ObjectPoint, size: ObjectPoint, light?: ObjectLightSource) => {
    parts.push({ kind: "box", id: `${id}:${suffix}`, group, material, center, size, light });
  };
  const pushBeam = (suffix: string, from: ObjectPoint, to: ObjectPoint, width: number, depth = width) => {
    parts.push({ kind: "beam", id: `${id}:${suffix}`, group, material: "metal", from, to, width, depth });
  };

  if (carrier === "ceiling") {
    // The hook begins 30 mm inside the carrier beam and terminates in the cap.
    pushBox("ceiling-plate", "metal", point(carrierPoint[0], carrierPoint[1] - 0.025, carrierPoint[2]), point(0.24, 0.05, 0.24));
    pushBeam("chain", point(carrierPoint[0], carrierPoint[1], carrierPoint[2]), point(lens[0], lens[1] + 0.23, lens[2]), 0.035);
  } else {
    const outward = options.outward ?? 1;
    if (carrier === "wall-z") {
      pushBox("mounting-plate", "metal", point(carrierPoint[0], carrierPoint[1], carrierPoint[2] + outward * 0.025), point(0.24, 0.36, 0.05));
      pushBeam("arm", point(carrierPoint[0], carrierPoint[1] + 0.08, carrierPoint[2]), point(lens[0], lens[1] + 0.18, lens[2]), 0.055);
    } else if (carrier === "wall-x") {
      pushBox("mounting-plate", "metal", point(carrierPoint[0] + outward * 0.025, carrierPoint[1], carrierPoint[2]), point(0.05, 0.36, 0.24));
      pushBeam("arm", point(carrierPoint[0], carrierPoint[1] + 0.08, carrierPoint[2]), point(lens[0], lens[1] + 0.18, lens[2]), 0.055);
    } else {
      pushBox("post", "timber-dark", point(carrierPoint[0], (carrierPoint[1] + lens[1] + 0.2) / 2, carrierPoint[2]), point(0.15, lens[1] + 0.2 - carrierPoint[1], 0.15));
      pushBeam("arm", point(carrierPoint[0], lens[1] + 0.18, carrierPoint[2]), point(lens[0], lens[1] + 0.18, lens[2]), 0.055);
    }
  }

  pushBox("cap", "metal", point(lens[0], lens[1] + 0.16, lens[2]), point(0.34, 0.09, 0.34));
  pushBox("base", "metal", point(lens[0], lens[1] - 0.15, lens[2]), point(0.29, 0.07, 0.29));
  pushBox("lens", "lamp-glass", lens, point(0.24, 0.24, 0.24));
  pushBox("bulb", "lamp-bulb", lens, point(0.11, 0.15, 0.11), classLight(lampClass, lens, poolGroupId, priority));
  return parts;
}
