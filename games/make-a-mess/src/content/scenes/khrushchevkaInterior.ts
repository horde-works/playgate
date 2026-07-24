import type { ScenePrefabPieceDefinition } from "./sceneContract.ts";
import {
  propChannelSofa,
  propIronBed,
  propOldTable,
  propPaintedTable,
  propPanelChair,
  propSlatBed,
  propSovietSofa,
  propWallUnit,
  propWornChair,
  propWriterDesk,
  type FurniturePiece,
} from "../prefabs/coreFurniture.ts";
import {
  propFridgeMoskva,
  propFridgeRibbed,
  propGasStove,
  propKettle,
  propStewPot,
  propTvSharp,
  propTvSoviet,
  propVintageStove,
} from "../prefabs/coreAppliances.ts";
import { placeProp } from "../prefabs/coreProps.ts";

/**
 * Типовые планировки хрущёвки: формальная модель «квартира = комнаты»
 * вместо магических координат.
 *
 * Секция несёт две квартиры: однушку слева от лестницы и двушку справа.
 * План описывает КОМНАТЫ-ЗОНЫ (прямоугольники с типом) и ПЕРЕГОРОДКИ
 * (плоскости с проёмами); из перегородок строятся стены с настоящими
 * дверными проёмами, из зон генератор расставляет мебель по правилам
 * комнаты — той же геометрией, которую проверяет аудит уместности:
 * глухая масса не встаёт к окну, дверные створы остаются свободны.
 *
 * Однушка: кухня-камбуз вдоль северного окна, санузел-короб у глухого
 * торца, Г-коридор вдоль лестничной стены, комната на юг. Двушка: кухня
 * на север, санузел-короб в глубине, проходная комната на юг и спальня
 * во всю правую полосу.
 */

export type PlannedRoomKind = "kitchen" | "living" | "bedroom" | "hall" | "bath";

export interface PlannedRoom {
  readonly id: string;
  readonly kind: PlannedRoomKind;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

interface PartitionOpening {
  readonly from: number;
  readonly to: number;
  /** Навесить дверное полотно (иначе открытый проём). */
  readonly door?: boolean;
}

interface Partition {
  readonly id: string;
  /** Нормаль стены: "x" — стена в плоскости YZ, "z" — в плоскости XY. */
  readonly axis: "x" | "z";
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly openings: readonly PartitionOpening[];
  /** Кафельный низ (санузел). */
  readonly tiled?: boolean;
  /** Несущая бетонная стена (толще, из бетона, несёт плиты). */
  readonly structural?: boolean;
}

export interface SectionFlatPlan {
  readonly flatId: string;
  readonly rooms: readonly PlannedRoom[];
}

export interface SectionInteriorPlan {
  readonly flats: readonly SectionFlatPlan[];
  readonly partitions: readonly Partition[];
}

/** План секции в координатах здания. Вся геометрия — отсюда, не из констант. */
export function khrushchevkaSectionPlan(
  innerX0: number,
  stripWidth: number,
  sectionIndex: number,
): SectionInteriorPlan {
  const strip = sectionIndex === 0 ? 1 : 5;
  const b1 = innerX0 + stripWidth * strip;
  const b2 = innerX0 + stripWidth * (strip + 1);
  const oneX0 = b1 - stripWidth + 0.15;
  const oneX1 = b1 - 0.12;
  const twoX0 = b2 + 0.12;
  const twoX1 = b2 + stripWidth * 2 - 0.15;
  const bedX = b2 + stripWidth; // граница спальни двушки
  const north = -7.7;
  const south = -1.3;

  const one: SectionFlatPlan = {
    flatId: "one",
    rooms: [
      { id: "one:kitchen", kind: "kitchen", x0: oneX0, x1: oneX1, z0: north, z1: -6.3 },
      { id: "one:bath", kind: "bath", x0: oneX0, x1: oneX0 + 1.22, z0: -6.15, z1: -4.7 },
      { id: "one:hall", kind: "hall", x0: oneX1 - 1.1, x1: oneX1, z0: -6.25, z1: -3.42 },
      { id: "one:living", kind: "living", x0: oneX0, x1: oneX1, z0: -4.45, z1: south },
    ],
  };
  const two: SectionFlatPlan = {
    flatId: "two",
    rooms: [
      { id: "two:kitchen", kind: "kitchen", x0: twoX0, x1: bedX - 0.06, z0: north, z1: -6.3 },
      { id: "two:bath", kind: "bath", x0: bedX - 1.26, x1: bedX - 0.06, z0: -6.15, z1: -4.7 },
      { id: "two:hall", kind: "hall", x0: twoX0, x1: twoX0 + 1.2, z0: -6.25, z1: -4.55 },
      { id: "two:living", kind: "living", x0: twoX0, x1: bedX - 0.06, z0: -4.45, z1: south },
      { id: "two:bedroom", kind: "bedroom", x0: bedX + 0.06, x1: twoX1, z0: north, z1: south },
    ],
  };

  const partitions: Partition[] = [
    // --- Однушка ---
    // Юг кухни: проём из коридора.
    {
      id: "one:kitchen-south", axis: "z", at: -6.22, from: oneX0, to: oneX1,
      openings: [{ from: oneX1 - 1.0, to: oneX1 - 0.14 }],
    },
    // Юг коридора и санузла: дверь в комнату.
    {
      id: "one:hall-south", axis: "z", at: -4.52, from: oneX0, to: oneX1,
      openings: [{ from: oneX1 - 0.95, to: oneX1 - 0.18, door: true }],
    },
    // Восточная стенка санузла с дверью из коридора.
    {
      id: "one:bath-east", axis: "x", at: oneX0 + 1.26, from: -6.18, to: -4.56,
      openings: [{ from: -5.62, to: -4.92, door: true }],
      tiled: true,
    },
    // --- Двушка ---
    // Юг кухни: проём из коридорчика у лестничной стены.
    {
      id: "two:kitchen-south", axis: "z", at: -6.22, from: twoX0, to: bedX - 0.06,
      openings: [{ from: twoX0, to: twoX0 + 1.0 }],
    },
    // Юг санузла и коридора: широкий проём в комнату у лестничной стены.
    {
      id: "two:hall-south", axis: "z", at: -4.52, from: twoX0, to: bedX - 0.06,
      openings: [{ from: twoX0, to: twoX0 + 1.02 }],
    },
    // Западная стенка санузла с дверью.
    {
      id: "two:bath-west", axis: "x", at: bedX - 1.3, from: -6.18, to: -4.56,
      openings: [{ from: -5.62, to: -4.92, door: true }],
      tiled: true,
    },
    // Межкомнатная стена спальни: НЕСУЩАЯ бетонная (на ней лежат плиты
    // перекрытия соседних полос, как в настоящей серии), с дверью.
    {
      id: "two:bedroom-west", axis: "x", at: bedX, from: north, to: south,
      openings: [{ from: -3.32, to: -2.56, door: true }],
      structural: true,
    },
  ];

  return { flats: [one, two], partitions };
}

// ---------------------------------------------------------------------------
// Строитель перегородок и дверей
// ---------------------------------------------------------------------------

type Piece = ScenePrefabPieceDefinition;

const PARTITION_PAINT = "#d9d3c4";
const TILE_PAINT = "#a9c3be";
const DOOR_PAINT = "#cfc8b6";
const DOOR_HEIGHT = 2.0;

function partitionSegments(
  from: number,
  to: number,
  openings: readonly PartitionOpening[],
): readonly (readonly [number, number])[] {
  const sorted = [...openings].sort((a, b) => a.from - b.from);
  const segments: (readonly [number, number])[] = [];
  let cursor = from;
  for (const opening of sorted) {
    if (opening.from - cursor > 0.08) {
      segments.push([cursor, opening.from]);
    }
    cursor = Math.max(cursor, opening.to);
  }
  if (to - cursor > 0.08) {
    segments.push([cursor, to]);
  }
  return segments;
}

/**
 * Перегородки этажа секции: гипсолитовые панели сегментами вокруг проёмов,
 * над проёмами — надпроёмные пояса. Санузловые стенки получают кафельный
 * низ отдельной панелью — бьётся отдельно от белёного верха.
 */
export function buildPlannedPartitions(
  plan: SectionInteriorPlan,
  floorBase: number,
  wallHeight: number,
): Piece[] {
  const pieces: Piece[] = [];
  const wy = floorBase + 0.01 + wallHeight / 2;

  for (const partition of plan.partitions) {
    const thickness = partition.structural ? 0.22 : 0.12;
    const place = (
      idSuffix: string,
      mid: number,
      length: number,
      centerY: number,
      height: number,
      color: string,
    ): Piece => ({
      id: `partition:${partition.id}:${idSuffix}`,
      // Гипсобетон: даже лёгкая перегородка полной высоты подпирает плиту.
      material: "concrete",
      shape: "panel",
      position: partition.axis === "z"
        ? [mid, centerY, partition.at]
        : [partition.at, centerY, mid],
      size: partition.axis === "z"
        ? [length, height, thickness]
        : [thickness, height, length],
      color: partition.structural ? "#d8d3c6" : color,
    });

    for (const [index, [from, to]] of partitionSegments(
      partition.from, partition.to, partition.openings,
    ).entries()) {
      const mid = (from + to) / 2;
      const length = to - from;
      if (partition.tiled) {
        const tileHeight = 1.35;
        pieces.push(
          place(`${index}:tile`, mid, length, floorBase + 0.01 + tileHeight / 2, tileHeight, TILE_PAINT),
          place(
            `${index}:top`, mid, length,
            floorBase + 0.01 + tileHeight + (wallHeight - tileHeight) / 2,
            wallHeight - tileHeight, PARTITION_PAINT,
          ),
        );
      } else {
        pieces.push(place(`${index}`, mid, length, wy, wallHeight, PARTITION_PAINT));
      }
    }
    // Надпроёмные пояса, чтобы стена оставалась связной над дверьми.
    for (const [index, opening] of partition.openings.entries()) {
      const mid = (opening.from + opening.to) / 2;
      const length = opening.to - opening.from;
      pieces.push({
        ...place(
          `lintel:${index}`, mid, length + 0.12,
          floorBase + 0.01 + DOOR_HEIGHT + (wallHeight - DOOR_HEIGHT) / 2,
          wallHeight - DOOR_HEIGHT,
          partition.tiled ? TILE_PAINT : PARTITION_PAINT,
        ),
        bearsLoad: false,
        sideAttachmentReach: 0.2,
      });
    }
  }
  return pieces;
}

/** Межкомнатные полотна: стоят на полу, приоткрыты вокруг петли по noise. */
export function buildPlannedDoors(
  plan: SectionInteriorPlan,
  floorBase: number,
  noise: (key: string) => number,
): Piece[] {
  const pieces: Piece[] = [];
  for (const partition of plan.partitions) {
    for (const [index, opening] of partition.openings.entries()) {
      if (!opening.door) {
        continue;
      }
      const width = opening.to - opening.from - 0.06;
      const hingeAt = opening.from + 0.03;
      const angle = 0.25 + noise(`door:${partition.id}:${index}`) * 1.1;
      const centerY = floorBase + 0.01 + (DOOR_HEIGHT - 0.06) / 2;
      const half = width / 2;
      // Полотно поворачивается вокруг петли в сторону комнаты с меньшей
      // координатой по нормали — приоткрыто внутрь.
      const pivot: readonly [number, number, number] = partition.axis === "z"
        ? [hingeAt, centerY, partition.at]
        : [partition.at, centerY, hingeAt];
      const offsetAlong = half * Math.cos(angle);
      const offsetNormal = half * Math.sin(angle);
      const position: readonly [number, number, number] = partition.axis === "z"
        ? [hingeAt + offsetAlong, centerY, partition.at - offsetNormal]
        : [partition.at - offsetNormal, centerY, hingeAt + offsetAlong];
      const rotationY = partition.axis === "z" ? angle : Math.PI / 2 + angle;
      pieces.push({
        id: `door:${partition.id}:${index}`,
        material: "wood",
        shape: "plank",
        position,
        rotation: [0, rotationY, 0],
        size: [width, DOOR_HEIGHT - 0.06, 0.045],
        color: DOOR_PAINT,
        contactBoxes: [{
          position,
          size: [
            Math.abs(offsetAlong) * 2 + 0.1,
            DOOR_HEIGHT - 0.06,
            Math.abs(offsetNormal) * 2 + 0.1,
          ],
        }],
        hinge: {
          pivot,
          direction: [1, 0, 0],
          normal: partition.axis === "z" ? [0, 0, 1] : [1, 0, 0],
        },
      });
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Генератор мебели по комнатам
// ---------------------------------------------------------------------------

interface Footprint {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * Обставляет квартиры секции по правилам комнат. Слоты детерминированы
 * планом, варианты предметов — сидом квартиры; каждый предмет проходит
 * проверку непересечения с уже поставленным (страховка от тесноты).
 */
export function furnishPlannedFlats(
  plan: SectionInteriorPlan,
  floorBase: number,
  noise: (key: string) => number,
): Piece[] {
  const pieces: Piece[] = [];
  const occupied: Footprint[] = [];

  const overlaps = (a: Footprint): boolean =>
    occupied.some((b) =>
      a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0);

  const put = (
    name: string,
    props: readonly FurniturePiece[],
    x: number,
    z: number,
    halfX: number,
    halfZ: number,
    y = floorBase,
  ): boolean => {
    const footprint: Footprint = {
      x0: x - halfX, x1: x + halfX, z0: z - halfZ, z1: z + halfZ,
    };
    if (overlaps(footprint)) {
      return false;
    }
    occupied.push(footprint);
    pieces.push(...placeProp(name, props, [x, y, z]));
    return true;
  };

  const box = (
    id: string,
    x: number, z: number,
    sx: number, sy: number, sz: number,
    color: string,
  ): void => {
    if (overlaps({ x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 })) {
      return;
    }
    occupied.push({ x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 });
    pieces.push({
      id,
      material: "wood",
      shape: "plank",
      position: [x, floorBase + sy / 2, z],
      size: [sx, sy, sz],
      color,
    });
  };

  for (const flat of plan.flats) {
    const seedKey = flat.flatId;
    const roll = (salt: string): number => noise(`${seedKey}:${salt}`);
    const room = (kind: PlannedRoomKind): PlannedRoom | undefined =>
      flat.rooms.find((entry) => entry.kind === kind);
    const hasBedroom = flat.rooms.some((entry) => entry.kind === "bedroom");
    // Кухонный проём: у однушки — восточный край перегородки, у двушки —
    // западный; холодильник встаёт к противоположной стороне, не в проход.
    const kitchenDoorEast = !hasBedroom;

    // --- Кухня: плита у стены проёма, холодильник напротив, стол у окна --
    const kitchen = room("kitchen");
    if (kitchen) {
      const stoveX = kitchenDoorEast ? kitchen.x1 - 0.36 : kitchen.x0 + 0.36;
      const counterX = kitchenDoorEast ? stoveX - 0.78 : stoveX + 0.78;
      const fridgeX = kitchenDoorEast ? kitchen.x0 + 0.46 : kitchen.x1 - 0.55;
      const vintage = roll("stove") < 0.4;
      put(`${flat.flatId}:furn:${vintage ? "vintage-stove" : "gas-stove"}:kitchen`,
        vintage ? propVintageStove({ yaw: Math.PI }) : propGasStove({ yaw: Math.PI }),
        stoveX, kitchen.z0 + 0.55, 0.38, 0.32);
      const topper = roll("topper");
      if (topper < 0.75) {
        pieces.push(...placeProp(
          `${flat.flatId}:furn:${topper < 0.4 ? "kettle" : "stew-pot"}:stove`,
          topper < 0.4 ? propKettle({ scale: 0.9 }) : propStewPot({
            scale: 0.9,
            color: roll("pot") < 0.5 ? "#3f5c34" : "#dfdcd2",
          }),
          [stoveX + 0.1, floorBase + (vintage ? 1.08 : 0.9), kitchen.z0 + 0.5],
        ));
      }
      // TODO: вернуть ребристый холодильник, когда разберёмся с перегрузом
      // его тонких боковин в сценовом распределении нагрузок.
      put(`${flat.flatId}:furn:fridge-moskva:kitchen`, propFridgeMoskva({}),
        fridgeX, kitchen.z1 - 0.42, 0.36, 0.36);
      box(`${flat.flatId}:kitchen:counter`,
        counterX, kitchen.z0 + 0.55, 0.7, 0.85, 0.55, "#c9c4ba");
      put(`${flat.flatId}:furn:painted-table:kitchen`,
        propPaintedTable({ yaw: Math.PI / 2, seed: Math.floor(roll("table") * 90) }),
        (kitchen.x0 + kitchen.x1) / 2, kitchen.z1 - 0.5, 0.32, 0.5);
      put(`${flat.flatId}:furn:worn-chair:kitchen`,
        propWornChair({ yaw: -Math.PI / 2, seed: Math.floor(roll("chair") * 90) }),
        (kitchen.x0 + kitchen.x1) / 2 + 0.72, kitchen.z1 - 0.55, 0.26, 0.26);
    }

    // --- Санузел: эмалированная ванна вдоль длинной стены ----------------
    const bath = room("bath");
    if (bath) {
      box(`${flat.flatId}:bath:tub`,
        (bath.x0 + bath.x1) / 2, (bath.z0 + bath.z1) / 2,
        0.64, 0.55, bath.z1 - bath.z0 - 0.24, "#e6e3da");
    }

    // --- Комната ---------------------------------------------------------
    const living = room("living");
    if (living) {
      const sofaRoll = roll("sofa");
      if (!hasBedroom) {
        // Однушка: стенка у глухого торца фронтом в комнату, диван напротив
        // у лестничной стены, телевизор — в нише стенки.
        put(`${flat.flatId}:furn:wall-unit:living`,
          propWallUnit({ yaw: Math.PI / 2, compact: true, seed: Math.floor(roll("unit") * 90) }),
          living.x0 + 0.24, (living.z0 + living.z1) / 2 - 0.05, 0.24, 1.16);
        pieces.push(...placeProp(
          `${flat.flatId}:furn:${roll("tv") < 0.55 ? "tv-soviet" : "tv-sharp"}:unit`,
          roll("tv") < 0.55
            ? propTvSoviet({ yaw: Math.PI / 2 })
            : propTvSharp({ yaw: Math.PI / 2 }),
          [living.x0 + 0.26, floorBase + 0.75,
            (living.z0 + living.z1) / 2 - 0.05 - 0.765],
        ));
        const sofaKind = sofaRoll < 0.45
          ? "soviet-sofa"
          : sofaRoll < 0.8
            ? "channel-sofa"
            : "iron-bed";
        const sofa = sofaKind === "soviet-sofa"
          ? propSovietSofa({ yaw: -Math.PI / 2 })
          : sofaKind === "channel-sofa"
            ? propChannelSofa({ yaw: -Math.PI / 2 })
            : propIronBed({ yaw: Math.PI, scale: 0.95 });
        put(`${flat.flatId}:furn:${sofaKind}:living`, sofa,
          living.x1 - 0.52, (living.z0 + living.z1) / 2 + 0.15, 0.5, 1.0);
        put(`${flat.flatId}:furn:old-table:living`,
          propOldTable({ seed: Math.floor(roll("table2") * 90) }),
          (living.x0 + living.x1) / 2, living.z1 - 0.72, 0.55, 0.4);
        put(`${flat.flatId}:furn:panel-chair:living`,
          propPanelChair({ yaw: 0 }),
          (living.x0 + living.x1) / 2, living.z1 - 1.5, 0.26, 0.26);
        // Шкаф — к северной перегородке, западнее дверного полотна.
        box(`${flat.flatId}:living:wardrobe`,
          living.x0 + 0.98, living.z0 + 0.27, 1.0, 1.8, 0.5, "#7e5233");
      } else {
        // Двушка: диван у входной стены, тумба с телевизором у стены
        // спальни южнее её двери, стол со стульями ближе к окну.
        const sofaKind = sofaRoll < 0.45 ? "soviet-sofa" : "channel-sofa";
        const sofa = sofaKind === "soviet-sofa"
          ? propSovietSofa({ yaw: Math.PI / 2 })
          : propChannelSofa({ yaw: Math.PI / 2 });
        put(`${flat.flatId}:furn:${sofaKind}:living`, sofa,
          living.x0 + 0.52, (living.z0 + living.z1) / 2 + 0.2, 0.5, 1.0);
        const standX = living.x1 - 0.36;
        const standZ = living.z1 - 0.56;
        box(`${flat.flatId}:living:tv-stand`, standX, standZ, 0.66, 0.6, 0.5, "#7e5233");
        pieces.push(...placeProp(
          `${flat.flatId}:furn:${roll("tv") < 0.55 ? "tv-soviet" : "tv-sharp"}:stand`,
          roll("tv") < 0.55
            ? propTvSoviet({ yaw: -Math.PI / 2 })
            : propTvSharp({ yaw: -Math.PI / 2 }),
          [standX, floorBase + 0.61, standZ],
        ));
        put(`${flat.flatId}:furn:old-table:living`,
          propOldTable({ seed: Math.floor(roll("table2") * 90) }),
          (living.x0 + living.x1) / 2 - 0.25, living.z1 - 0.75, 0.55, 0.4);
        put(`${flat.flatId}:furn:panel-chair:living`,
          propPanelChair({ yaw: 0 }),
          (living.x0 + living.x1) / 2 - 0.25, living.z1 - 1.52, 0.26, 0.26);
      }
    }

    // --- Спальня: кровать изголовьем к востоку, шкаф у межкомнатной ------
    const bedroom = room("bedroom");
    if (bedroom) {
      const iron = roll("bed") < 0.5;
      put(`${flat.flatId}:furn:${iron ? "iron-bed" : "slat-bed"}:bedroom`,
        iron
          ? propIronBed({ yaw: -Math.PI / 2 })
          : propSlatBed({ yaw: -Math.PI / 2 }),
        bedroom.x1 - 1.08, bedroom.z1 - 1.0, 1.05, 0.52);
      box(`${flat.flatId}:bedroom:wardrobe`,
        bedroom.x0 + 0.31, (bedroom.z0 + bedroom.z1) / 2 - 0.85,
        0.55, 1.8, 1.0, "#7e5233");
      put(`${flat.flatId}:furn:writer-desk:bedroom`,
        propWriterDesk({ yaw: Math.PI, seed: Math.floor(roll("desk") * 90) }),
        bedroom.x1 - 0.85, bedroom.z0 + 0.62, 0.66, 0.34);
      put(`${flat.flatId}:furn:worn-chair:bedroom`,
        propWornChair({ yaw: Math.PI, seed: Math.floor(roll("chair2") * 90) }),
        bedroom.x1 - 0.85, bedroom.z0 + 1.35, 0.26, 0.26);
    }
  }
  return pieces;
}
