import type { BreakableMaterial, SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGradeContactBox,
  nimbusGroundSeatBox,
  nimbusNoise,
  nimbusPrimitive,
} from "./nimbusAuthoring.ts";

export const NIMBUS_WORLD_RADIUS = 204;
export const NIMBUS_LAND_BASE_RADIUS = 195;
export const NIMBUS_GROUND_PITCH = 5;
export const NIMBUS_BASE_Y = -20;
export const NIMBUS_BOWL_CENTER = [-22, 8] as const;
export const NIMBUS_BOWL_YAW = Math.PI / 10;
export const NIMBUS_TOWER_CENTRE = [148, 54] as const;
export const NIMBUS_SPINDLE_TOWER_CENTRE = [50, -150] as const;
export const NIMBUS_VERTICAL_DOCK_CENTRE = [-115, -92] as const;
export const NIMBUS_SHIPYARD_CENTRE = [-25, 3] as const;
export const NIMBUS_FLIGHT_FIELD_CENTRE = [-95, 105] as const;
const NIMBUS_FLIGHT_FIELD_RADIUS = Math.hypot(...NIMBUS_FLIGHT_FIELD_CENTRE);
export const NIMBUS_FLIGHT_FIELD_OUTWARD = [
  NIMBUS_FLIGHT_FIELD_CENTRE[0] / NIMBUS_FLIGHT_FIELD_RADIUS,
  NIMBUS_FLIGHT_FIELD_CENTRE[1] / NIMBUS_FLIGHT_FIELD_RADIUS,
] as const;
export const NIMBUS_FLIGHT_FIELD_ALONG = [
  NIMBUS_FLIGHT_FIELD_OUTWARD[1],
  -NIMBUS_FLIGHT_FIELD_OUTWARD[0],
] as const;

export const NIMBUS_INDUSTRIAL_FOOTPRINTS = [
  { id: "assembly-hall", along: -82, outward: -34, length: 42, width: 24 },
  { id: "composites-hall", along: 78, outward: -34, length: 38, width: 22 },
  { id: "machine-shop", along: 36, outward: -62, length: 36, width: 24 },
  { id: "energy-plant", along: -18, outward: -78, length: 26, width: 22 },
] as const;

export type NimbusGroundZone =
  | "outside"
  | "wet-pan"
  | "drainage"
  | "west-slope"
  | "rock-ridge"
  | "rim-grass"
  | "work-bench";

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gaussian(value: number, width: number): number {
  return Math.exp(-(value * value) / (2 * width * width));
}

function bowlCoordinates(x: number, z: number): readonly [number, number] {
  const dx = x - NIMBUS_BOWL_CENTER[0];
  const dz = z - NIMBUS_BOWL_CENTER[1];
  const cosine = Math.cos(NIMBUS_BOWL_YAW);
  const sine = Math.sin(NIMBUS_BOWL_YAW);
  return [dx * cosine + dz * sine, -dx * sine + dz * cosine];
}

export function nimbusLandRadiusAt(x: number, z: number): number {
  const angle = Math.atan2(z, x);
  const eastPromontory = gaussian(
    Math.atan2(Math.sin(angle - 0.34), Math.cos(angle - 0.34)),
    0.24,
  ) * 4.8;
  const southBite = gaussian(
    Math.atan2(Math.sin(angle + 2.2), Math.cos(angle + 2.2)),
    0.3,
  ) * 3.4;
  return NIMBUS_LAND_BASE_RADIUS
    + Math.sin(angle * 2 + 0.7) * 2.4
    + Math.sin(angle * 5 - 1.1) * 1.6
    + Math.sin(angle * 9 + 2.6) * 0.65
    + eastPromontory
    - southBite;
}

function channelDistance(x: number, z: number, branch: -1 | 1): number {
  const startX = branch < 0 ? 84 : 44;
  const startZ = branch < 0 ? 92 : -85;
  const endX = -155;
  const endZ = -112;
  let nearest = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 36; step += 1) {
    const t = step / 36;
    const bend = Math.sin(t * Math.PI) * (branch < 0 ? -23 : 18);
    const px = startX + (endX - startX) * t + bend;
    const pz = startZ + (endZ - startZ) * t + Math.sin(t * Math.PI * 2) * 7;
    nearest = Math.min(nearest, Math.hypot(x - px, z - pz));
  }
  return nearest;
}

export function nimbusContinuousGroundTop(x: number, z: number): number {
  const [u, v] = bowlCoordinates(x, z);
  const ellipse = Math.hypot(u / 136, v / 106);
  const bowl = -7.8 + smoothstep(0.06, 1.08, ellipse) * 12.2;
  const outerRise = smoothstep(0.92, 1.45, ellipse) * 1.5;

  const ridgeAxis = (z - 52) - (x - 55) * 0.42;
  const ridgeAlong = (x - 92) + (z - 72) * 0.22;
  const ridge = gaussian(ridgeAxis, 18) * gaussian(ridgeAlong, 82) * 5.2;

  const westShoulder = gaussian(x + 132, 48) * gaussian(z - 12, 94) * 1.35;
  const saddle = gaussian(x + 152, 34) * gaussian(z + 112, 35) * 3.7;
  const northChannel = gaussian(channelDistance(x, z, -1), 5.4) * 1.15;
  const southChannel = gaussian(channelDistance(x, z, 1), 6.2) * 0.9;
  const wetPan = gaussian(x + 10, 25) * gaussian(z + 53, 19) * 6.2;

  const macro =
    Math.sin(x * 0.027 + Math.sin(z * 0.018) * 1.5) * 0.42
    + Math.sin(z * 0.033 - Math.sin(x * 0.021)) * 0.28
    + Math.sin((x + z) * 0.061) * 0.12;
  const rimVariation = smoothstep(0.6, 1.25, ellipse) * macro;

  const natural = bowl + outerRise + ridge + westShoulder - saddle
    - northChannel - southChannel - wetPan + rimVariation;

  // The tower is keyed into a deliberately cut foundation bench. The short
  // transition keeps the rim natural while every caisson meets one datum.
  const towerDistance = Math.hypot(
    x - NIMBUS_TOWER_CENTRE[0],
    z - NIMBUS_TOWER_CENTRE[1],
  );
  const towerBlend = 1 - smoothstep(25, 31, towerDistance);
  const towerGraded = natural * (1 - towerBlend) + 6 * towerBlend;

  // Верфь использует естественный сухой уступ, но сборочные пути не могут
  // повторять каждую волну рельефа. Пятно выравнивается только внутри рабочих
  // 128 × 54 м и мягко возвращается к чаше на восьмиметровом переходе.
  const yardDx = x - NIMBUS_SHIPYARD_CENTRE[0];
  const yardDz = z - NIMBUS_SHIPYARD_CENTRE[1];
  const yardCosine = Math.cos(NIMBUS_BOWL_YAW);
  const yardSine = Math.sin(NIMBUS_BOWL_YAW);
  const yardAlong = yardDx * yardCosine + yardDz * yardSine;
  const yardAcross = -yardDx * yardSine + yardDz * yardCosine;
  const yardDistance = Math.max(Math.abs(yardAlong) / 70, Math.abs(yardAcross) / 31);
  const yardBlend = 1 - smoothstep(0.82, 1.08, yardDistance);
  const yardTop = -6.35 + yardAlong * 0.004;
  return towerGraded * (1 - yardBlend) + yardTop * yardBlend;
}

export function nimbusGroundTopAt(x: number, z: number): number {
  if (Math.hypot(x, z) > nimbusLandRadiusAt(x, z)) return NIMBUS_BASE_Y;
  return Math.round(nimbusContinuousGroundTop(x, z) / 0.2) * 0.2;
}

export function nimbusTileCenterOf(
  x: number,
  z: number,
): readonly [number, number] {
  return [
    Math.round(x / NIMBUS_GROUND_PITCH) * NIMBUS_GROUND_PITCH,
    Math.round(z / NIMBUS_GROUND_PITCH) * NIMBUS_GROUND_PITCH,
  ];
}

export function nimbusGroundUnder(
  x: number,
  z: number,
): { readonly zone: NimbusGroundZone; readonly top: number } {
  const [tileX, tileZ] = nimbusTileCenterOf(x, z);
  return {
    zone: nimbusGroundZoneAt(tileX, tileZ),
    top: nimbusGroundTopAt(tileX, tileZ),
  };
}

function insideRotatedRectangle(
  x: number,
  z: number,
  centre: readonly [number, number],
  halfLength: number,
  halfWidth: number,
  yaw: number,
): boolean {
  const dx = x - centre[0];
  const dz = z - centre[1];
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const along = dx * cosine + dz * sine;
  const across = -dx * sine + dz * cosine;
  return Math.abs(along) <= halfLength && Math.abs(across) <= halfWidth;
}

export function nimbusGroundZoneAt(x: number, z: number): NimbusGroundZone {
  if (Math.hypot(x, z) > nimbusLandRadiusAt(x, z)) return "outside";
  if (
    insideRotatedRectangle(
      x,
      z,
      NIMBUS_SHIPYARD_CENTRE,
      70,
      31,
      NIMBUS_BOWL_YAW,
    )
  ) return "work-bench";
  const northChannel = channelDistance(x, z, -1);
  const southChannel = channelDistance(x, z, 1);
  if (Math.min(northChannel, southChannel) < 7) return "drainage";
  const top = nimbusGroundTopAt(x, z);
  if (top < -5.4) return "wet-pan";
  const ridgeAxis = Math.abs((z - 52) - (x - 55) * 0.42);
  if (ridgeAxis < 25 && x > 15 && z > 15) return "rock-ridge";
  if (x < -55 && Math.hypot(x, z) < 180) return "west-slope";
  return "rim-grass";
}

const COLORS: Record<Exclude<NimbusGroundZone, "outside">, readonly string[]> = {
  "wet-pan": ["#52544f", "#5c5c54", "#484d4b", "#646056", "#454b49"],
  drainage: ["#4b4d49", "#5b5a52", "#3f4544", "#6b6559"],
  "west-slope": ["#6e7554", "#777b59", "#626b4c", "#858064", "#596346"],
  "rock-ridge": ["#515a5b", "#626968", "#424b4e", "#737875"],
  "rim-grass": ["#69734f", "#78805a", "#5d6848", "#858164", "#626e50"],
  "work-bench": ["#5e5c55", "#69665d", "#514f4b", "#737067"],
};

function zoneMaterial(zone: NimbusGroundZone, tone: number): BreakableMaterial {
  switch (zone) {
    case "wet-pan":
      return tone > 0.78 ? "stone" : "soil";
    case "drainage":
      return tone > 0.58 ? "stone" : "soil";
    case "rock-ridge":
      return tone > 0.72 ? "graphiteStone" : "stone";
    case "work-bench":
      return tone > 0.82 ? "stone" : "soil";
    case "west-slope":
    case "rim-grass":
      return tone > 0.86 ? "soil" : "grass";
    default:
      return "earth";
  }
}

export function createNimbusGround(
  base: NimbusMutableGroup,
  surface: NimbusMutableGroup,
): void {
  const limit = Math.ceil(NIMBUS_WORLD_RADIUS / NIMBUS_GROUND_PITCH)
    * NIMBUS_GROUND_PITCH;
  for (let x = -limit; x <= limit; x += NIMBUS_GROUND_PITCH) {
    for (let z = -limit; z <= limit; z += NIMBUS_GROUND_PITCH) {
      const zone = nimbusGroundZoneAt(x, z);
      if (zone === "outside") continue;
      const top = nimbusGroundTopAt(x, z);
      const earthTop = top - 0.24;
      const earthHeight = earthTop - NIMBUS_BASE_Y;
      const key = `${x}:${z}`;
      nimbusPrimitive(
        base,
        `deep-earth:${key}`,
        "earth",
        "groundTile",
        [x, NIMBUS_BASE_Y + earthHeight / 2, z],
        [NIMBUS_GROUND_PITCH, earthHeight, NIMBUS_GROUND_PITCH],
        nimbusNoise(x, z, 1) > 0.5 ? "#413d36" : "#4a443a",
      );

      const tone = nimbusNoise(x, z, 2);
      const palette = COLORS[zone];
      const material = zoneMaterial(zone, tone);
      nimbusPrimitive(
        surface,
        `surface:${key}`,
        material,
        "groundTile",
        [x, top - 0.12, z],
        [NIMBUS_GROUND_PITCH, 0.24, NIMBUS_GROUND_PITCH],
        palette[Math.floor(tone * palette.length) % palette.length],
        {
          textureProfile: zone === "wet-pan" || zone === "drainage"
            ? "nimbus-crushed-aggregate"
            : undefined,
          surface: zone === "wet-pan" || zone === "drainage"
            ? [{ kind: "damp", amount: zone === "drainage" ? 0.75 : 0.58 }]
            : undefined,
        },
      );
    }
  }
}

function reservedForConstruction(x: number, z: number): boolean {
  if (Math.hypot(x - NIMBUS_TOWER_CENTRE[0], z - NIMBUS_TOWER_CENTRE[1]) < 29) {
    return true;
  }
  if (
    Math.hypot(
      x - NIMBUS_SPINDLE_TOWER_CENTRE[0],
      z - NIMBUS_SPINDLE_TOWER_CENTRE[1],
    ) < 39
  ) return true;
  if (
    Math.hypot(
      x - NIMBUS_VERTICAL_DOCK_CENTRE[0],
      z - NIMBUS_VERTICAL_DOCK_CENTRE[1],
    ) < 62
  ) return true;
  const flightDx = x - NIMBUS_FLIGHT_FIELD_CENTRE[0];
  const flightDz = z - NIMBUS_FLIGHT_FIELD_CENTRE[1];
  const flightAlong = flightDx * NIMBUS_FLIGHT_FIELD_ALONG[0]
    + flightDz * NIMBUS_FLIGHT_FIELD_ALONG[1];
  const flightOutward = flightDx * NIMBUS_FLIGHT_FIELD_OUTWARD[0]
    + flightDz * NIMBUS_FLIGHT_FIELD_OUTWARD[1];
  if (
    flightAlong > -60
    && flightAlong < 112
    && Math.abs(flightOutward) < 30
  ) return true;
  if (NIMBUS_INDUSTRIAL_FOOTPRINTS.some((footprint) =>
    Math.abs(flightAlong - footprint.along) < footprint.length / 2 + 5
      && Math.abs(flightOutward - footprint.outward) < footprint.width / 2 + 5)) {
    return true;
  }
  // The six construction-support shoulders live outside the yard rectangle.
  // Reserve their real bases rather than clearing a generic ring.
  for (const station of [-54, 0, 54]) {
    for (const side of [-1, 1]) {
      const base = nimbusPointOnShipyard(station, side * 66);
      if (Math.hypot(x - base[0], z - base[2]) < 26) return true;
    }
  }
  return insideRotatedRectangle(
    x,
    z,
    NIMBUS_SHIPYARD_CENTRE,
    72,
    50,
    NIMBUS_BOWL_YAW,
  );
}

function createRockRibs(rocks: NimbusMutableGroup): void {
  for (let rib = 0; rib < 11; rib += 1) {
    const baseX = 40 + rib * 9.4;
    const baseZ = 72 + rib * 4.2 + Math.sin(rib * 0.9) * 8;
    const yaw = -0.58 + Math.sin(rib * 0.7) * 0.2;
    const segments = 6 + (rib % 4);
    for (let segment = 0; segment < segments; segment += 1) {
      const along = (segment - (segments - 1) / 2) * 4.1;
      const x = baseX + Math.cos(yaw) * along;
      const z = baseZ + Math.sin(yaw) * along;
      if (reservedForConstruction(x, z)) continue;
      const ground = nimbusGroundUnder(x, z);
      const width = 4.3 + nimbusNoise(rib, segment, 31) * 2.7;
      const height = 1.2 + nimbusNoise(rib, segment, 32) * 2.5;
      const depth = 2.4 + nimbusNoise(rib, segment, 33) * 2.1;
      const material = nimbusNoise(rib, segment, 34) > 0.72
        ? "graphiteStone"
        : "stone";
      nimbusPrimitive(
        rocks,
        `rib:${rib}:${segment}`,
        material,
        "stoneBlock",
        [x, ground.top + height / 2 - 0.18, z],
        [width, height, depth],
        material === "graphiteStone" ? "#4d5658" : "#666b68",
        {
          rotation: [0.04 * Math.sin(segment), yaw, 0.06 * Math.cos(rib)],
          surface: [{ kind: "damp", amount: 0.38 }],
          contactBoxes: [nimbusGroundSeatBox(
            ground.top + height / 2 - 0.18,
            [width, height, depth],
            ground.top,
          )],
        },
      );
    }
  }
}

function createTalus(rocks: NimbusMutableGroup): void {
  // Construction removes the original talus from every real footprint. Keep
  // the basin materially dense by redistributing that budget to untouched
  // slopes rather than letting rocks survive inside halls and flight decks.
  for (let index = 0; index < 12_000; index += 1) {
    const angle = nimbusNoise(index, 2, 41) * Math.PI * 2;
    const radius = 18 + Math.sqrt(nimbusNoise(index, 3, 42)) * 176;
    const x = NIMBUS_BOWL_CENTER[0] + Math.cos(angle) * radius;
    const z = NIMBUS_BOWL_CENTER[1] + Math.sin(angle) * radius * 0.82;
    const zone = nimbusGroundZoneAt(x, z);
    if (
      zone === "outside"
      || zone === "work-bench"
      || zone === "wet-pan"
      || reservedForConstruction(x, z)
    ) continue;
    const keep = zone === "rock-ridge" ? 0.88 : zone === "drainage" ? 0.5 : 0.26;
    if (nimbusNoise(index, 4, 43) > keep) continue;
    const ground = nimbusGroundUnder(x, z);
    if (ground.zone === "outside") continue;
    const size = 0.38 + Math.pow(nimbusNoise(index, 5, 44), 2) * 2.4;
    const material = zone === "rock-ridge" && index % 4 === 0
      ? "graphiteStone"
      : "stone";
    nimbusPrimitive(
      rocks,
      `talus:${index}`,
      material,
      "stoneBlock",
      [x, ground.top + size * 0.26, z],
      [size, size * (0.45 + nimbusNoise(index, 6, 45) * 0.35), size * 0.78],
      material === "graphiteStone"
        ? index % 2 === 0 ? "#555d5e" : "#424b4d"
        : index % 3 === 0 ? "#777a74" : "#676b67",
      {
        rotation: [
          (nimbusNoise(index, 7, 46) - 0.5) * 0.32,
          nimbusNoise(index, 8, 47) * Math.PI,
          (nimbusNoise(index, 9, 48) - 0.5) * 0.28,
        ],
        bearsLoad: false,
        contactBoxes: [nimbusGradeContactBox(
          ground.top + size * 0.26,
          [Math.min(0.5, size), Math.min(0.5, size * 0.78)],
          ground.top,
        )],
        contactBearingOrder: true,
        surface: [{ kind: "damp", amount: zone === "drainage" ? 0.62 : 0.28 }],
      },
    );
  }
}

function createVegetation(vegetation: NimbusMutableGroup): void {
  for (let index = 0; index < 9_500; index += 1) {
    const angle = nimbusNoise(index, 10, 51) * Math.PI * 2;
    const radius = Math.sqrt(nimbusNoise(index, 11, 52)) * 190;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const zone = nimbusGroundZoneAt(x, z);
    if (
      zone === "outside"
      || zone === "work-bench"
      || zone === "wet-pan"
      || zone === "rock-ridge"
      || reservedForConstruction(x, z)
    ) continue;
    const keep = zone === "west-slope" ? 0.72 : zone === "rim-grass" ? 0.48 : 0.18;
    if (nimbusNoise(index, 12, 53) > keep) continue;
    const ground = nimbusGroundUnder(x, z);
    const size = 0.45 + nimbusNoise(index, 13, 54) * 1.15;
    const dry = nimbusNoise(index, 14, 55) > 0.78;
    nimbusPrimitive(
      vegetation,
      `shrub:${index}`,
      "foliage",
      "groundTile",
      [x, ground.top + size * 0.38, z],
      [size, size * 0.76, size * (0.72 + nimbusNoise(index, 15, 56) * 0.38)],
      dry
        ? index % 2 === 0 ? "#81784f" : "#70694a"
        : index % 3 === 0 ? "#4d6241" : "#5c6c47",
      {
        rotation: [0, nimbusNoise(index, 16, 57) * Math.PI, 0],
        bearsLoad: false,
        volume: size * size * size * 0.07,
        vegetationVisual: { kind: "shrub", seed: index + 4000 },
      },
    );
  }
}

function createDrainageStone(rocks: NimbusMutableGroup): void {
  for (let index = 0; index < 1200; index += 1) {
    const branch = index % 2 === 0 ? -1 : 1;
    const startX = branch < 0 ? 84 : 44;
    const startZ = branch < 0 ? 92 : -85;
    const t = nimbusNoise(index, 18, 61);
    const bend = Math.sin(t * Math.PI) * (branch < 0 ? -23 : 18);
    const x = startX + (-155 - startX) * t + bend
      + (nimbusNoise(index, 19, 62) - 0.5) * 11;
    const z = startZ + (-112 - startZ) * t
      + Math.sin(t * Math.PI * 2) * 7
      + (nimbusNoise(index, 20, 63) - 0.5) * 9;
    if (reservedForConstruction(x, z) || nimbusGroundZoneAt(x, z) === "outside") continue;
    const ground = nimbusGroundUnder(x, z);
    if (ground.zone === "outside") continue;
    const size = 0.24 + nimbusNoise(index, 21, 64) * 0.72;
    nimbusPrimitive(
      rocks,
      `channel-stone:${index}`,
      index % 7 === 0 ? "graphiteStone" : "stone",
      "stoneBlock",
      [x, ground.top + size * 0.18, z],
      [size, size * 0.5, size * (0.7 + nimbusNoise(index, 22, 65) * 0.45)],
      index % 5 === 0 ? "#70736e" : "#5b605e",
      {
        rotation: [0, nimbusNoise(index, 23, 66) * Math.PI, 0],
        bearsLoad: false,
        contactBoxes: [nimbusGradeContactBox(
          ground.top + size * 0.18,
          [size, size],
          ground.top,
        )],
        contactBearingOrder: true,
        surface: [{ kind: "damp", amount: 0.72 }],
      },
    );
  }
}

export function createNimbusLandscape(
  rocks: NimbusMutableGroup,
  vegetation: NimbusMutableGroup,
): void {
  createRockRibs(rocks);
  createTalus(rocks);
  createDrainageStone(rocks);
  createVegetation(vegetation);
}

export function nimbusPointOnShipyard(
  along: number,
  across: number,
  y = 0,
): SceneVector3 {
  const cosine = Math.cos(NIMBUS_BOWL_YAW);
  const sine = Math.sin(NIMBUS_BOWL_YAW);
  return [
    NIMBUS_SHIPYARD_CENTRE[0] + along * cosine - across * sine,
    y,
    NIMBUS_SHIPYARD_CENTRE[1] + along * sine + across * cosine,
  ];
}
