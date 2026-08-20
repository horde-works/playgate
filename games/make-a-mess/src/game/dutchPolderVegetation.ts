import { createLandscapeSampler } from "../content/landscape/landscapeSampler.ts";
import type { LandscapeSample } from "../content/landscape/landscapeDocument.ts";
import { dutchPolderLandscapeDocument } from "../content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";
// One datum for the water plane, shared with the water sheet itself: vegetation
// bands and the visible waterline must never be able to disagree.
import { DUTCH_POLDER_BRIDGE_SEATS } from "../content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";
import { WATER_LEVEL } from "./dutchPolderWaterModel.ts";
import {
  registerLandscapeGroundTint,
} from "./landscapeSurfaceRuntime.ts";

/**
 * 0 turf, 1 reed, 2 yellow flag iris, 3 marsh marigold, 4 yellow water-lily.
 *
 * A polder ditch is not "water, then reed, then field". It is a stack of bands
 * sorted by how deep the water stands over them, and every band has its own
 * plant. Leaving out the two wet bands left a strip of naked earth between the
 * duckweed and the reed that no real sloot has.
 */
export type DutchPolderVegetationKind = 0 | 1 | 2 | 3 | 4;

export type DutchPolderVegetationStyle = {
  readonly kind: DutchPolderVegetationKind;
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
  pitch = 6,
): number {
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

/**
 * Turf density multiplier: tussocks and bare gaps instead of an even sprinkle.
 *
 * A near-constant keep probability over a hash-uniform scatter is a Poisson
 * point process, and the eye is very good at reading Poisson uniformity as
 * "placed by an algorithm". Real turf clumps at half a metre and again at a
 * couple of metres, so two octaves are the minimum that reads as growth.
 */
export function meadowClump(x: number, z: number): number {
  const coarse = dutchPolderVegetationPatchNoise(x, z, 31, 2.4);
  const fine = dutchPolderVegetationPatchNoise(x, z, 37, 0.85);
  return Math.min(1.35, 0.32 + coarse * 0.78 + fine * 0.42);
}

/**
 * Where along a channel a point sits, and which bank it is on.
 *
 * The landscape sampler only reports UNSIGNED distance to the centre line,
 * which is enough to band a cross-section but not enough to say "reed on the
 * far bank only" — and that distinction is most of what a polder ditch looks
 * like. Projecting onto the authored polyline gives both.
 */
function channelPlacement(
  channelId: string,
  x: number,
  z: number,
): { readonly along: number; readonly side: number } | null {
  const channel = dutchPolderLandscapeDocument.dryChannels.find(({ id }) => id === channelId);
  if (!channel) return null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let bestSide = 1;
  let travelled = 0;
  const points = channel.points;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const [ax, az] = points[index]!;
    const [bx, bz] = points[index + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const span = Math.sqrt(lengthSquared);
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
      : 0;
    const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = travelled + span * t;
      bestSide = dx * (z - az) - dz * (x - ax) >= 0 ? 1 : -1;
    }
    travelled += span;
  }
  return { along: bestAlong, side: bestSide };
}

/** Metres of channel that share one maintenance decision. */
const STRETCH_LENGTH = 17;

/**
 * How much reed this bank is allowed to carry, 0..1.
 *
 * A Dutch ditch is not a habitat that fills up on its own — it is MAINTAINED.
 * The water board's autumn schouw obliges the owner to clear the slot so it
 * still drains, historically by hand from a boat and now with a mowing bucket,
 * so a ditch crossing working grassland carries no reed at all: grass runs
 * straight down to the water. Reed survives where it is wanted or unreachable —
 * a rietland grown for thatch, a deliberately gentle nature bank, the far edge
 * of a parcel, corners and dead ends the bucket cannot reach — and where it
 * does survive it is usually ONE bank, not both.
 *
 * Rendering it as an even fringe down every channel on both sides was the
 * single most artificial thing in the aerial view. The decision therefore
 * belongs to a STRETCH of channel, not to a point: seventeen metres share one
 * regime, the way one owner's frontage does.
 */
const RIETLAND = { x: -43, z: 37, radius: 13 } as const;

/**
 * How much a bridge protects the growth in its own corners, 0..1.
 *
 * A mowing bucket swings on an arm. It can shave a straight frontage clean, and
 * it cannot get into the crook where an abutment meets the bank — so the four
 * corners of every bridge keep a tuft of rank growth while the run either side
 * of them is shaved. It is the most reliable small detail on a maintained
 * ditch, and it comes straight out of the machine's geometry rather than out of
 * botany. Directly beneath the deck nothing grows at all: permanent shade, and
 * the abutment is in the way.
 */
function bridgeShelter(x: number, z: number): { readonly corner: number; readonly under: number } {
  let corner = 0;
  let under = 0;
  for (const bridge of DUTCH_POLDER_BRIDGE_SEATS) {
    const distance = Math.hypot(x - bridge.position[0], z - bridge.position[1]);
    corner = Math.max(corner, 1 - smoothstep(1.9, 4.6, distance));
    under = Math.max(under, 1 - smoothstep(0.9, 1.9, distance));
  }
  return { corner, under };
}

function reedLicense(
  channelId: string,
  along: number,
  side: number,
  x: number,
  z: number,
): number {
  // Крыши мельниц и домов крыты тростником, и режут его здесь: плантация стоит
  // нетронутой независимо от того, как содержат остальные фронты. Это и
  // голландская правда, и опора для кадра — сплошная стена вместо каёмки.
  const toRietland = Math.hypot(x - RIETLAND.x, z - RIETLAND.z);
  if (toRietland < RIETLAND.radius) {
    return Math.max(0.55, 1 - smoothstep(RIETLAND.radius * 0.62, RIETLAND.radius, toRietland) * 0.45);
  }
  let idHash = 0;
  for (let index = 0; index < channelId.length; index += 1) {
    idHash = (idHash * 31 + channelId.charCodeAt(index)) % 100000;
  }
  const licenseFor = (stretch: number): number => {
    const roll = vegetationHash(stretch * 7919 + idHash, 61);
    // Mown frontage dominates, exactly as it does on a working polder. The
    // grazed share also poaches the bank, so nothing tall stands there either.
    if (roll < 0.26) return 0;
    if (roll < 0.32) return 0;
    const reededSide = vegetationHash(stretch * 5701 + idHash, 67) < 0.5 ? 1 : -1;
    if (roll < 0.74) return side === reededSide ? 1 : 0;
    return 1;
  };
  // Blend across the seam so one owner's reed does not stop on a knife edge.
  const position = along / STRETCH_LENGTH;
  const stretch = Math.floor(position);
  const within = position - stretch;
  const blend = 2.5 / STRETCH_LENGTH;
  if (within < blend) {
    return licenseFor(stretch - 1)
      + (licenseFor(stretch) - licenseFor(stretch - 1)) * smoothstep(0, blend, within);
  }
  if (within > 1 - blend) {
    return licenseFor(stretch)
      + (licenseFor(stretch + 1) - licenseFor(stretch)) * smoothstep(1 - blend, 1, within);
  }
  return licenseFor(stretch);
}

/**
 * One vegetation language, banded by HOW DEEP THE WATER STANDS over the ground.
 *
 * The first pass measured everything sideways from the channel centre line, and
 * that was a fudge. Measured across four cuts of C1-main, the bed floor sits at
 * -0.25, the water plane at +0.08, and the terrain crosses the waterline about
 * 3.3 m out — not at `bedWidth / 2` = 2.1 m. Anchoring bands to depth instead
 * puts every plant where its roots can actually live, and it keeps working on a
 * steep bank, a shallow one, and round a bend, none of which a fixed horizontal
 * offset survives.
 */
export function sampleDutchPolderVegetation(
  sample: LandscapeSample,
  x: number,
  z: number,
): DutchPolderVegetationStyle | null {
  const style = sampleUntrodden(sample, x, z);
  if (!style) return null;

  // Тропа — это не крашеная полоса, а история хождения, и у неё ДВА следствия.
  // Вытоптанная сердцевина почти лысая и сухая; но сразу за ней, куда нога не
  // попадает, трава как раз самая густая и высокая — по ней тропа и читается
  // как тропа. Маска уже даёт ровно это: `pathWeight` держит единицу внутри
  // полуширины и растушёвывается наружу, так что обочина — это её же полутон,
  // и никаких дополнительных выборок не нужно.
  //
  // Раньше подавление стояло в одной последней ветке: тропы через берег,
  // террасу и мокрую полосу растительность просто не замечала.
  const trodden = smoothstep(0.34, 0.88, sample.pathWeight);
  const verge = smoothstep(0.05, 0.28, sample.pathWeight)
    * (1 - smoothstep(0.34, 0.66, sample.pathWeight));
  if (trodden <= 0 && verge <= 0) return style;
  const [lowHeight, highHeight] = style.height;
  const heightBoost = 1 + verge * 0.3;
  return {
    ...style,
    keep: Math.min(1.2, style.keep * (1 - trodden * 0.94) * (1 + verge * 0.45)),
    dryness: Math.min(1, style.dryness + trodden * 0.3),
    height: [lowHeight * heightBoost, highHeight * heightBoost],
  };
}

/** Reed licence at a point, shared by everything that has to respect it. */
function placementLicense(sample: LandscapeSample, x: number, z: number): number {
  const shelter = bridgeShelter(x, z);
  if (shelter.corner >= 1) return 1;
  const placement = sample.channelId ? channelPlacement(sample.channelId, x, z) : null;
  return Math.max(
    shelter.corner,
    placement && sample.channelId
      ? reedLicense(sample.channelId, placement.along, placement.side, x, z)
      : 0,
  );
}

function sampleUntrodden(
  sample: LandscapeSample,
  x: number,
  z: number,
): DutchPolderVegetationStyle | null {
  if (sample.groundKind === "outside") return null;

  const patch = dutchPolderVegetationPatchNoise(x, z, 17);
  const channel = sample.channelId
    ? dutchPolderLandscapeDocument.dryChannels.find(({ id }) => id === sample.channelId)
    : undefined;
  const aboveWater = sample.elevation - WATER_LEVEL;

  // A sloot is dug to drain, and it is kept clear: the middle of the lane stays
  // open water however good the growing is.
  const laneOpen = channel && sample.channelDistance !== null
    ? smoothstep(0.80, 1.40, sample.channelDistance / (channel.bedWidth / 2))
    : 1;

  // Тростник растёт не там, где ему хорошо, а там, где его НЕ ВЫКОСИЛИ. Режим
  // содержания принадлежит отрезку русла и решает, есть ли здесь заросли и на
  // каком берегу; на выкошенной фронте трава сходит прямо к воде.
  const shelter = bridgeShelter(x, z);
  // Под настилом не растёт ничего: вечная тень и устой на пути.
  if (shelter.under > 0.5) return null;
  const license = placementLicense(sample, x, z);

  // Кубышка держит полосу, которая до сих пор была пустой: между ряской на
  // поверхности и стоящими у берега надводными не было НИЧЕГО, и открытая вода
  // читалась голой плоскостью. Плавающие пластины сразу говорят «стоячая вода»,
  // растут колониями и живут там, где глубина уже не пускает тростник.
  if (aboveWater < -0.2) {
    const lilyPatch = dutchPolderVegetationPatchNoise(x, z, 53, 7.5);
    // Кубышка занимает открытую воду, а не отнимает мелководье у пояса: там,
    // где стоит тростник, ей не хватает света, и первая же прикидка показала
    // ровно эту ошибку — пластин вышло больше, чем стеблей.
    const shade = placementLicense(sample, x, z);
    if (lilyPatch > 0.7 && shade < 0.5) {
      const room = smoothstep(-0.2, -0.4, aboveWater);
      return {
        kind: 4,
        keep: (0.26 + room * 0.36) * (1 - shade),
        dryness: 0.05,
        height: [0.85, 1.3],
        width: [0.85, 1.35],
        flowerChance: 0.14,
      };
    }
  }

  // Deeper than about half a metre nothing else roots — open water and duckweed.
  if (aboveWater < -0.52) return null;

  if (aboveWater < -0.02) {
    // Emergent: standing in up to half a metre of water. Reed takes the deeper
    // half; iris colonises the shallow edge, where it grows in dense clonal
    // fans rather than scattered singles.
    const shallow = smoothstep(-0.40, -0.08, aboveWater);
    const irisPatch = dutchPolderVegetationPatchNoise(x, z, 43, 5.5);
    if (irisPatch > 0.60) {
      return {
        kind: 2,
        keep: (0.42 + shallow * 0.46) * laneOpen,
        dryness: 0.04,
        height: [0.62, 1.02],
        width: [0.86, 1.24],
        flowerChance: 0.04,
      };
    }
    if (license > 0.25) {
      return {
        kind: 1,
        keep: (0.5 + 0.48 * shallow) * laneOpen * license,
        dryness: 0.88,
        height: [1.25, 2.9],
        width: [0.9, 1.34],
        flowerChance: 0,
      };
    }
    // Выкошенный урез: низкая мокрая осока по кромке, вода начинается сразу.
    return {
      kind: 0,
      keep: (0.34 + shallow * 0.4) * laneOpen,
      dryness: 0.22,
      height: [0.2, 0.44],
      width: [0.84, 1.24],
      flowerChance: 0.05,
    };
  }

  if (aboveWater < 0.45) {
    // The wet bank itself — the strip that used to render as naked earth.
    // Reed thins out as the ground lifts, and the tall bank herbs take over.
    const drying = smoothstep(-0.02, 0.45, aboveWater);
    const herbPatch = dutchPolderVegetationPatchNoise(x, z, 47, 4.2);
    if (herbPatch > 0.58 + drying * 0.24) {
      return {
        kind: 3,
        keep: 0.54 - drying * 0.34,
        dryness: 0.06,
        height: [0.2, 0.4],
        width: [0.82, 1.24],
        flowerChance: 0.62,
      };
    }
    if (license > 0.25 && patch > 0.34 + drying * 0.42) {
      return {
        kind: 1,
        keep: (0.82 - drying * 0.5) * license,
        dryness: 0.9,
        height: [1.0, 2.35],
        width: [0.86, 1.28],
        flowerChance: 0,
      };
    }
    // Coarse damp turf between them — taller and lusher than grazed meadow.
    return {
      kind: 0,
      keep: 0.97 * meadowClump(x, z),
      dryness: 0.1,
      height: [0.34, 0.7],
      width: [0.86, 1.3],
      flowerChance: 0.14,
    };
  }

  if (sample.groundKind === "bank" || sample.groundKind === "terrace") {
    // Above the damp band: grazed slope, with the odd herb clump that the
    // cattle left alone.
    const herbPatch = dutchPolderVegetationPatchNoise(x, z, 47, 4.2);
    if (aboveWater < 0.62 && herbPatch > 0.84) {
      return {
        kind: 3,
        keep: 0.18,
        dryness: 0.12,
        height: [0.18, 0.34],
        width: [0.8, 1.18],
        flowerChance: 0.5,
      };
    }
    return sample.groundKind === "terrace"
      ? { kind: 0, keep: 0.98 * meadowClump(x, z), dryness: 0.12, height: [0.24, 0.54], width: [0.84, 1.28], flowerChance: 0.11 }
      : { kind: 0, keep: 0.96 * meadowClump(x, z), dryness: 0.16, height: [0.3, 0.66], width: [0.86, 1.3], flowerChance: 0.16 };
  }

  return {
    kind: 0,
    keep: 0.84 * meadowClump(x, z),
    dryness: 0.12 + patch * 0.28,
    height: [0.16, 0.42],
    width: [0.8, 1.22],
    flowerChance: 0.085,
  };
}

const groundSampler = createLandscapeSampler(dutchPolderLandscapeDocument);

/**
 * Colour multiplier the GROUND itself carries, so it agrees with whatever grows
 * on it.
 *
 * Vegetation density on the ditch banks measures HIGHER than on the flat (0.73
 * against 0.42), yet the banks still read bare — because a slope seen from a low
 * angle shows mostly ground between vertical stems, and the ground was one flat
 * olive whatever stood on it. Painting the terrain from the same sampler that
 * places the plants fixes both ends of that: the bank stops looking scalped, and
 * distant turf fades into a surface that already reads as turf instead of into a
 * bare plate.
 *
 * Multipliers only, and deliberately narrow ones. A ground tint that competes
 * with the plants for attention is worse than no tint at all.
 */
export function dutchPolderGroundTint(x: number, z: number): readonly [number, number, number] {
  const sample = groundSampler.sample(x, z);
  if (sample.groundKind === "outside") return [1, 1, 1];
  const aboveWater = sample.elevation - WATER_LEVEL;

  const rise = 0.5;
  const gradient = Math.hypot(
    groundSampler.elevationAt(x + rise, z) - groundSampler.elevationAt(x - rise, z),
    groundSampler.elevationAt(x, z + rise) - groundSampler.elevationAt(x, z - rise),
  ) / (2 * rise);
  const slope = Math.atan(gradient) * 180 / Math.PI;

  // ЦВЕТ НЕЛЬЗЯ ВЕСТИ КРУТИЗНОЙ. Крутизна — производная рельефа, и на бровке
  // берега у неё перелом: уклон падает с тридцати градусов до пяти за полметра.
  // Цвет, привязанный к ней, обязан там оборваться, и получается лента с двумя
  // резкими краями — фаска, врезанная в воду.
  //
  // Ведёт высота над водой: она монотонна и непрерывна всю дорогу от уреза к
  // лугу, поэтому размыв по ней краёв не имеет вовсе. Крутизна осталась, но
  // управляет только тем, ДОКУДА земля достаёт — сдвигает конец размыва, а не
  // ставит ступень.
  const reach = 0.4 + smoothstep(6, 34, slope) * 0.62;
  const soilBand = 1 - smoothstep(-0.1, reach, aboveWater);
  const style = sampleDutchPolderVegetation(sample, x, z);
  const cover = Math.min(1, (style?.keep ?? 0) * 1.15);
  const trodden = smoothstep(0.3, 0.85, sample.pathWeight);
  const soil = Math.min(1, Math.max(soilBand, trodden, (1 - cover) * 0.5));

  // Мокрый торф у самой воды, подсохшая супесь выше. Отношения посчитаны из
  // целевых цветов к базовому #718651 — множителями оливковый в бурый не
  // уводится, зелень остаётся ведущей, и берег зеленеет.
  const wet = 1 - smoothstep(-0.12, 0.34, aboveWater);
  const red = 0.56 + (1 - wet) * 0.14;
  const green = 0.375 + (1 - wet) * 0.13;
  const blue = 0.475 + (1 - wet) * 0.14;

  // И долгий слабый хвост поверх всего: луг у канавы глуше и темнее дальнего,
  // так что у перехода нет опознаваемого конца. Без него размыв всё равно
  // где-то заканчивался, и глаз находил эту границу.
  const damped = 1 - smoothstep(0, reach * 2.6, Math.max(0, aboveWater));
  const dim = 1 - damped * 0.18;

  return [
    (1 + (red - 1) * soil) * dim,
    (1 + (green - 1) * soil) * dim,
    (1 + (blue - 1) * soil) * dim,
  ];
}

registerLandscapeGroundTint("dutch-polder-ground", dutchPolderGroundTint);

