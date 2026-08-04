// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Оболочка острова «Астана»: грунт, русло Есиля, зелёный пояс и степная
// кромка. Контент мира — лицензия отличается от лицензии кода, см. LICENSING.md.
//
// Остров — круг радиусом 138 м вокруг (0, 0), самый большой в проекте. Река
// дугой отсекает верхнюю треть макета: за ней правый берег и целиноградские
// дворы, на левом — новый город с Байтереком. Геометрический верх остаётся
// +z, но ИСТИННЫЙ север острова после композиционной посадки задан отдельно
// в astanaLayout.ts: карту не вращаем, вращаем её географический компас.
//
// Воды пока нет — оставлено русло: два уступа берега и песчаное дно. Вода
// наращивается отдельно.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { noise, place, primitive } from "./astanaAuthoring.ts";
import { insideLandmarkReserve } from "./astanaLayout.ts";
import { shrubTone } from "../../prefabs/coreShrubs.ts";

/**
 * Просека под эстакадой кольца: ствол не имеет права стоять ближе этого
 * расстояния к оси линии. Дерево у опоры не просто некрасиво — крона ловит
 * балку боковым креплением, ветка уходит по перегрузке, и вся сцена
 * стартует с висящими кусками.
 */
const RING_CLEARING = 7;
const RING_AXIS_RADIUS = 98;
/**
 * Просека вокруг станций: вестибюль вынесен внутрь кольца на четырнадцать
 * метров и встал бы прямо в лесополосу. Дерево у станции не просто мешает —
 * навес ловит крону боковым креплением, ветка уходит по перегрузке, и сцена
 * стартует с висящими кусками.
 */
const STATION_CLEARING = 26;

/**
 * Внутренний город и кольцо ЛРТ не растягиваются. Новая земля добавлена
 * только снаружи: три будущих автомобильных полотна по 7.5 м и ещё 3.5 м
 * свободного резерва. Так внешние арочные мосты смогут выйти за кольцо, не
 * отнимая воздух у уже согласованной композиции.
 */
export const FUTURE_ROAD_FULL_WIDTH = 7.5;
export const OUTER_LAYOUT_RESERVE = 3.5;
export const WORLD_RADIUS = 112
  + FUTURE_ROAD_FULL_WIDTH * 3
  + OUTER_LAYOUT_RESERVE;
export const LAND_BASE_RADIUS = WORLD_RADIUS - 8;
/** Шаг сетки грунта. Тайл кладётся с нахлёстом 6 см, чтобы не было щелей. */
export const GROUND_PITCH = 5;
// Соседние тайлы имеют одну и ту же расчётную границу. Нахлёст здесь не
// страхует от щели, а кладёт две верхние грани в одну плоскость и даёт рябь.
const TILE = GROUND_PITCH;

/**
 * Точка попадает в пятно станции. Центры считаются здесь же, а не берутся из
 * плана: `astanaPlan` импортирует оболочку, и обратная связь замкнула бы круг.
 */
function nearStation(x: number, z: number, clearance: number): boolean {
  const stationRadius = 98 - 3.51;
  const inward = 14;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const cx = Math.cos(angle) * (stationRadius - inward);
    const cz = Math.sin(angle) * (stationRadius - inward);
    const ex = Math.cos(angle) * stationRadius;
    const ez = Math.sin(angle) * stationRadius;
    // Пятно вытянуто вдоль платформы: от кромки платформы до фасада вестибюля.
    if (
      Math.hypot(x - cx, z - cz) < clearance
      || Math.hypot(x - ex, z - ez) < clearance
    ) {
      return true;
    }
  }
  return false;
}

/** Кромка суши: шумная, чтобы остров не читался циркулем. */
export function landRadiusAt(x: number, z: number): number {
  const angle = Math.atan2(z, x);
  return (
    LAND_BASE_RADIUS
    + Math.sin(angle * 2.3) * 2.2
    + Math.sin(angle * 5.1 + 1.7) * 1.1
    + (noise(x, z, 11) - 0.5) * 2.4
  );
}

/**
 * Осевая линия Есиля: река входит с северо-запада, прогибается к центру и
 * уходит на северо-восток.
 */
export function riverAxisZ(x: number): number {
  // Середина русла почти прямая. Доворот начинается только в наружных 48%
  // радиуса и плавно доходит у кромки до 5.1 м — ровно 15% от центральной
  // отметки 34 м. Это изгиб выходов реки из острова, а не локальная вмятина
  // возле станции ЛРТ.
  const normalized = Math.min(1, Math.abs(x) / LAND_BASE_RADIUS);
  const raw = Math.max(0, Math.min(1, (normalized - 0.52) / 0.48));
  const edgeTurn = raw * raw * (3 - 2 * raw);
  return 34 + edgeTurn * 5.1;
}

/**
 * Полуширина видимого русла по урезу берега. Прежние 11 м превращали реку
 * в пустое поле и съедали место у обоих городских поясов. Русло сжато на
 * 30% вместе с береговыми ступенями: Есиль остаётся преградой, но больше не
 * срезает северный сектор круглого партера Байтерека.
 */
export const RIVER_WIDTH_SCALE = 0.7;
export const RIVER_BASE_HALF_WIDTH = 8.5 * RIVER_WIDTH_SCALE;
export const RIVER_BANK_WIDTH = 8 * RIVER_WIDTH_SCALE;
export const RIVER_TERRACE_WIDTH = 8 * RIVER_WIDTH_SCALE;
export const RIVER_VALLEY_MARGIN = RIVER_BANK_WIDTH + RIVER_TERRACE_WIDTH;
export function riverHalfWidth(x: number): number {
  return RIVER_BASE_HALF_WIDTH
    + Math.sin(x * 0.052) * RIVER_WIDTH_SCALE
    + Math.sin(x * 0.017 + 0.7) * 0.7 * RIVER_WIDTH_SCALE;
}

/** Расстояние от точки до осевой реки со знаком: <0 — южный берег. */
export function riverOffset(x: number, z: number): number {
  return z - riverAxisZ(x);
}

export type GroundKind = "land" | "terrace" | "bank" | "bed" | "outside";

/**
 * Что лежит в точке: суша, береговой уступ, дно русла или уже море.
 * Единственный источник правды о сетке грунта — всё остальное (посадка
 * деревьев, будущие улицы, опоры эстакады) обязано спрашивать здесь, а не
 * повторять формулу на глаз.
 */
export function groundKindAt(x: number, z: number): GroundKind {
  if (Math.hypot(x, z) > landRadiusAt(x, z)) {
    return "outside";
  }
  const offset = Math.abs(riverOffset(x, z));
  const half = riverHalfWidth(x);
  if (offset < half) {
    return "bed";
  }
  if (offset < half + RIVER_BANK_WIDTH) {
    return "bank";
  }
  if (offset < half + RIVER_VALLEY_MARGIN) {
    return "terrace";
  }
  return "land";
}

/** Высота верха грунта в точке: берег ниже суши, дно ещё ниже. */
export function groundTopAt(x: number, z: number): number {
  switch (groundKindAt(x, z)) {
    case "bed":
      return -1.9;
    case "bank":
      return -1.15;
    case "terrace":
      return -0.55;
    default:
      return 0.05;
  }
}

/** Центр тайла сетки, в который попадает точка. */
export function tileCenterOf(x: number, z: number): readonly [number, number] {
  return [
    Math.round(x / GROUND_PITCH) * GROUND_PITCH,
    Math.round(z / GROUND_PITCH) * GROUND_PITCH,
  ];
}

/**
 * Что и на какой высоте РЕАЛЬНО лежит под точкой. Сетка дискретна, а кромка
 * и русло считаются непрерывной формулой, поэтому точка запросто оказывается
 * над тайлом другого сорта: камень у уреза «стоял» над дном и висел на 85 см.
 * Всё, что садится на грунт, обязано спрашивать высоту здесь.
 */
export function groundUnder(
  x: number,
  z: number,
): { readonly kind: GroundKind; readonly top: number } {
  const [tileX, tileZ] = tileCenterOf(x, z);
  const kind = groundKindAt(tileX, tileZ);
  return { kind, top: groundTopAt(tileX, tileZ) };
}

/**
 * Крупный рисунок степи: наложенные синусы дают органичные пятна в
 * десятки метров. Округление шума до клеток 15 м читалось шахматкой.
 */
function steppePatch(x: number, z: number): number {
  return (
    0.5
    + 0.3 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 1.6)
    + 0.14 * Math.sin(z * 0.057 - Math.sin(x * 0.037) * 1.2)
    + 0.06 * Math.sin((x + z) * 0.105)
  );
}

const LAND_GREENS = ["#6c6f4d", "#747552", "#666a49", "#7b7a58", "#5f6545"];
const DRY_STEPPE = ["#8a8560", "#948e68", "#7f7b57"];
const BANK_EARTH = ["#6b6250", "#736a56", "#645c4b"];
const TERRACE_GRASS = ["#5d6844", "#66704a", "#586340"];
// Солончаковые плешины степи: белёсая корка на месте пересохших луж.
const SALT_FLAT = ["#b2ad95", "#a8a289", "#bdb9a3"];
const BED_SAND = ["#8f8a6f", "#9a9478", "#857f66", "#948d70"];

/**
 * Грунт острова: глубокая земля сплошным слоем и поверхность поверх неё.
 * Поверхность меняется от степной травы к сухой полыни у кромки, а в русле
 * становится песком.
 */
export function createGround(base: MutableGroup, surface: MutableGroup): void {
  const limit = Math.ceil(WORLD_RADIUS / GROUND_PITCH) * GROUND_PITCH;
  for (let x = -limit; x <= limit; x += GROUND_PITCH) {
    for (let z = -limit; z <= limit; z += GROUND_PITCH) {
      const kind = groundKindAt(x, z);
      if (kind === "outside") {
        continue;
      }
      const key = `${x}:${z}`;
      const top = groundTopAt(x, z);
      // Глубокая земля: её верх всегда на 0.18 ниже верха поверхности, так
      // что уступы берега честно видны в разрезе, а решатель получает
      // сплошной фундамент под всем островом.
      primitive(
        base,
        `earth:${key}`,
        "earth",
        "groundTile",
        [x, top - 0.18 - 0.5, z],
        [TILE, 1, TILE],
        "#4f4636",
      );

      const radius = Math.hypot(x, z);
      const dryness = noise(x, z, 3);
      if (kind === "bed") {
        primitive(
          surface,
          `bed:${key}`,
          "soil",
          "groundTile",
          [x, top - 0.09, z],
          [TILE, 0.18, TILE],
          BED_SAND[Math.floor(noise(x, z, 5) * BED_SAND.length) % BED_SAND.length],
          { surface: [{ kind: "damp", amount: 0.5 }] },
        );
        continue;
      }
      if (kind === "terrace") {
        primitive(
          surface,
          `terrace:${key}`,
          "grass",
          "groundTile",
          [x, top - 0.09, z],
          [TILE, 0.18, TILE],
          TERRACE_GRASS[Math.floor(noise(x, z, 9) * TERRACE_GRASS.length) % TERRACE_GRASS.length],
          { surface: [{ kind: "damp", amount: 0.12 }] },
        );
        continue;
      }
      if (kind === "bank") {
        primitive(
          surface,
          `bank:${key}`,
          "soil",
          "groundTile",
          [x, top - 0.09, z],
          [TILE, 0.18, TILE],
          BANK_EARTH[Math.floor(noise(x, z, 7) * BANK_EARTH.length) % BANK_EARTH.length],
          { surface: [{ kind: "damp", amount: 0.24 }] },
        );
        continue;
      }
      // Степь читается пятнами по 15–20 м, а не рябью тайл-в-тайл: крупный
      // шум выбирает характер участка, мелкий — оттенок внутри него.
      const patch = steppePatch(x, z);
      const outerReserve = radius > RING_AXIS_RADIUS + RING_CLEARING;
      const salt = !outerReserve && patch > 0.86 && radius < 96;
      const burnt = radius > 88 || patch > 0.63 || dryness > 0.93;
      const palette = salt ? SALT_FLAT : burnt || outerReserve ? DRY_STEPPE : LAND_GREENS;
      primitive(
        surface,
        `cover:${key}`,
        salt || outerReserve ? "soil" : "grass",
        "groundTile",
        [x, top - 0.09, z],
        [TILE, 0.18, TILE],
        palette[Math.floor(noise(x, z, 2) * palette.length) % palette.length],
        salt
          ? { surface: [{ kind: "damp", amount: 0.18 }] }
          : outerReserve
            ? { surface: [{ kind: "damp", amount: 0.04 }] }
            : {},
      );
    }
  }
}

/**
 * Зелёный пояс: лесозащитные полосы вокруг настоящей Астаны. Два неровных
 * ряда по кромке, сосны с берёзами вперемешку; в устьях реки полос нет —
 * там берег открыт.
 */
export function createGreenBelt(belt: MutableGroup): void {
  let planted = 0;
  // Шаг посадки. Полоса смыкается кронами, но не растёт друг сквозь друга:
  // на 260 попытках соседи стояли в четырёх метрах, а взрослая сосна теперь
  // раскидывает сучья на три — отдельные сучья теряли опору в чужой кроне.
  const attempts = 224;
  for (let index = 0; index < attempts && planted < 150; index += 1) {
    // Два ряда: внешний прижат к обрыву, внутренний идёт со смещением на
    // полшага — так полоса смыкается кронами и читается лесозащитной, а не
    // «деревья по кругу через восемь метров».
    const row = index % 2;
    const angle =
      ((index + (row === 1 ? 0.5 : 0)) / attempts) * Math.PI * 2
      + (noise(index, 1, 31) - 0.5) * 0.05;
    const radius = (row === 0 ? 88 : 82) + (noise(index, 2, 32) - 0.5) * 5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Ствол держит 2.2 м до края сетки: корневой наплыв не должен свисать
    // за кромку, а сама точка обязана стоять на суше, не в русле.
    const soil = groundUnder(x, z);
    if (soil.kind !== "land") {
      continue;
    }
    if (Math.hypot(x, z) > landRadiusAt(x, z) - 2.2) {
      continue;
    }
    if (Math.abs(Math.hypot(x, z) - RING_AXIS_RADIUS) < RING_CLEARING) {
      continue;
    }
    if (nearStation(x, z, STATION_CLEARING)) {
      continue;
    }
    if (insideLandmarkReserve(x, z, 2.5)) {
      continue;
    }
    const birch = noise(index, 3, 33) > 0.68;
    const variant = birch
      ? `core:birch:${1 + (index % 3)}`
      : `core:pine:${1 + (index % 4)}`;
    // Порода берёзы задана взрослым деревом (12–13 м), а полоса авторилась под
    // прежнее пятиметровое: междурядье рассчитано на крону в четыре метра, и
    // взрослые кроны в нём смыкаются. Полоса сажает молодые берёзы — возрастом,
    // а не занижением породы; сплошную взрослую полосу надо переразбивать.
    const scale = (1.02 + noise(index, 4, 34) * 0.5) * (birch ? 0.38 : 0.28);
    place(belt, `belt:${index}`, variant, {
      position: [x, soil.top, z],
      rotation: [0, noise(index, 5, 35) * Math.PI * 2, 0],
      scale: [scale, scale, scale],
    });
    planted += 1;
  }

  // Подлесок: кусты жимолости и караганы в междурядье. Без них полоса
  // просвечивает насквозь у самой земли.
  let bushes = 0;
  for (let index = 0; index < 260 && bushes < 70; index += 1) {
    const angle = (index / 260) * Math.PI * 2 + noise(index, 6, 36) * 0.12;
    const radius = 83 + noise(index, 7, 37) * 6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const soil = groundUnder(x, z);
    if (soil.kind !== "land" || Math.hypot(x, z) > landRadiusAt(x, z) - 2) {
      continue;
    }
    if (Math.abs(Math.hypot(x, z) - RING_AXIS_RADIUS) < RING_CLEARING - 2) {
      continue;
    }
    if (nearStation(x, z, STATION_CLEARING - 4)) {
      continue;
    }
    if (insideLandmarkReserve(x, z, 1.5)) {
      continue;
    }
    const clumps = 3 + Math.floor(noise(index, 8, 38) * 3);
    for (let clump = 0; clump < clumps; clump += 1) {
      const size = 0.55 + noise(index * 5 + clump, 9, 39) * 0.75;
      primitive(
        belt,
        `bush:${index}:${clump}`,
        "foliage",
        "stoneBlock",
        [
          x + (noise(index * 5 + clump, 10, 40) - 0.5) * 1.7,
          soil.top + size * 0.42,
          z + (noise(index * 5 + clump, 11, 41) - 0.5) * 1.7,
        ],
        [size, size * 0.85, size * 0.92],
        shrubTone("steppe", index * 5 + clump),
        {
          rotation: [0, noise(index * 5 + clump, 13, 43) * Math.PI, 0],
          bearsLoad: false,
          volume: 0.05,
          // Подлесок полосы — карагана и жимолость: мелкий сизый лист и
          // ажурная масса. Прежний общий «зелёный ком» был тем же, что во
          // дворе хрущёвки и на голландской канаве.
          vegetationVisual: { kind: "steppe", seed: index * 5 + clump },
        },
      );
    }
    bushes += 1;
  }
}

/**
 * Степная кромка: полынь и ковыль пучками там, где город кончается. Пучок —
 * несколько узких листьев из одного корня, а не «кустик-коробка».
 */
export function createSteppeTufts(tufts: MutableGroup): void {
  let made = 0;
  for (let index = 0; index < 460 && made < 190; index += 1) {
    const angle = noise(index, 6, 41) * Math.PI * 2;
    const radius = 74 + noise(index, 7, 42) * 30;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const soil = groundUnder(x, z);
    if (soil.kind !== "land") {
      continue;
    }
    if (Math.hypot(x, z) > landRadiusAt(x, z) - 1.4) {
      continue;
    }
    if (nearStation(x, z, 16)) {
      continue;
    }
    if (insideLandmarkReserve(x, z, 0.8)) {
      continue;
    }
    const blades = 3 + Math.floor(noise(index, 8, 43) * 3);
    const dry = noise(index, 9, 44) > 0.55;
    for (let blade = 0; blade < blades; blade += 1) {
      const lean = (noise(index * 7 + blade, 10, 45) - 0.5) * 0.5;
      const height = 0.32 + noise(index * 7 + blade, 11, 46) * 0.34;
      const bladeX = x + (noise(index * 7 + blade, 12, 47) - 0.5) * 0.4;
      const bladeZ = z + (noise(index * 7 + blade, 13, 48) - 0.5) * 0.4;
      const bladeSoil = groundUnder(bladeX, bladeZ);
      if (bladeSoil.kind === "outside") {
        continue;
      }
      primitive(
        tufts,
        `tuft:${index}:${blade}`,
        "foliage",
        "plank",
        [bladeX, bladeSoil.top + height / 2, bladeZ],
        [0.05, height, 0.05],
        dry ? "#9a9366" : "#6f7a49",
        {
          rotation: [lean, noise(index * 7 + blade, 14, 49) * Math.PI, lean * 0.6],
          bearsLoad: false,
          volume: 0.004,
        },
      );
    }
    made += 1;
  }
}

/**
 * Отмели и намывной галечник в русле: река ушла, но её работа осталась —
 * песчаные косы вдоль внутренней стороны излучины и галька у уреза.
 */
export function createRiverBed(bed: MutableGroup): void {
  for (let index = 0; index < 120; index += 1) {
    const x = -100 + noise(index, 15, 51) * 200;
    const drift = (noise(index, 16, 52) - 0.5) * 2 * riverHalfWidth(x) * 0.82;
    const z = riverAxisZ(x) + drift;
    const soil = groundUnder(x, z);
    if (soil.kind !== "bed") {
      continue;
    }
    const long = 1.6 + noise(index, 17, 53) * 4.2;
    const across = 0.9 + noise(index, 18, 54) * 2.1;
    primitive(
      bed,
      `bar:${index}`,
      "soil",
      "groundTile",
      [x, soil.top + 0.05, z],
      [long, 0.12, across],
      noise(index, 19, 55) > 0.6 ? "#a29b7e" : "#968f73",
      {
        rotation: [0, noise(index, 20, 56) * Math.PI, 0],
        bearsLoad: false,
        surface: [{ kind: "damp", amount: 0.35 }],
      },
    );
  }

  // Галька по урезу: там, где берег сходит в русло, вода веками выкладывала
  // окатанный камень.
  for (let index = 0; index < 260; index += 1) {
    const x = -102 + noise(index, 21, 61) * 204;
    const side = noise(index, 22, 62) > 0.5 ? 1 : -1;
    const half = riverHalfWidth(x);
    const z = riverAxisZ(x) + side * (half - 0.6 + noise(index, 23, 63) * 1.4);
    const soil = groundUnder(x, z);
    if (soil.kind !== "bed" && soil.kind !== "bank") {
      continue;
    }
    const size = 0.16 + noise(index, 24, 64) * 0.34;
    primitive(
      bed,
      `pebble:${index}`,
      "stone",
      "stoneBlock",
      // Камень лежит В грунте, а не на нём: треть высоты утоплена, иначе
      // окатыш висит над тайлом на пару сантиметров.
      [x, soil.top + size * 0.2, z],
      [size, size * 0.62, size * 0.86],
      noise(index, 25, 65) > 0.5 ? "#8b877c" : "#7b776d",
      {
        rotation: [
          noise(index, 26, 66) * 0.3,
          noise(index, 27, 67) * Math.PI,
          noise(index, 28, 68) * 0.24,
        ],
        bearsLoad: false,
      },
    );
  }
}
