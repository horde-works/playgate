import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "./sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
  SpotLightDefinition,
  SupportMode,
} from "../../game/destructionScene.ts";
import {
  HEXACOPTER_CANOPY_RIBS,
  HEXACOPTER_DUCTS,
  HEXACOPTER_GEAR_STATIONS,
  HEXACOPTER_GROUND_Y,
  HEXACOPTER_PAD_TOP_Y,
  HEX_ARM_RADIUS,
  HEX_ARM_Y,
  HEX_CABIN_HALF_LENGTH,
  HEX_CABIN_HALF_WIDTH,
  HEX_CABIN_TOP_RAKE,
  HEX_CABIN_TOP_SCALE,
  hexacopterCabinRadius,
  HEX_CANOPY_TOP_Y,
  HEX_CROWN_TOP_Y,
  HEX_DISC_Y,
  HEX_FAN_RADIUS,
  HEX_FLOOR_Y,
  HEX_FOOT_BOTTOM_Y,
  HEX_FOOT_TOP_Y,
  HEX_GONDOLA_BOTTOM_Y,
  HEX_GONDOLA_TOP_Y,
  HEX_KEEL_BOTTOM_Y,
  HEX_KEEL_TOP_Y,
  HEX_LIP_TOP_Y,
  HEX_SEAT_Y,
  HEX_SHROUD_BOTTOM_Y,
  HEX_SHROUD_INNER_RADIUS,
  HEX_SHROUD_OUTER_RADIUS,
  HEX_SHROUD_TOP_Y,
  HEX_TRUNNION_Y,
  HEX_WAIST_Y,
  hexacopterPoint,
  type HexacopterDuctStation,
} from "../../game/townHexacopter.ts";

// ---------------------------------------------------------------------------
// ПЛОЩАДКА И ГЕКСАКОПТЕР ВО ДВОРЕ ЧАСТНОГО ДОМА
//
// Полный паспорт образа и физики — в шапке `game/townHexacopter.ts`. Здесь
// только сборка. Порядок, в котором собрано и в котором стоит читать:
//   1. силовой шпангоут (парящий фундамент решателя) и батарейный киль;
//   2. гондола, пол, фонарь, дверь, кресло;
//   3. шесть лучей, вилок и колец с винтами;
//   4. шасси, ливрея, огни;
//   5. площадка: пятно, шестиугольная разметка, приёмный стакан, огни.
//
// Мины, на которых уже сидели соседние корабли (transport-lessons):
//   §4.1  contactBoxes — В ЛОКАЛЬНЫХ координатах куска;
//   §4.12 ориентации только через orient()/rodRotation(), никакой скорописи;
//   §10   площадка кораблю НЕ опора: у неё bearsLoad и carriesAttachments
//         false, иначе «разбил шпангоут» не роняет машину;
//   §20   у крупных панелей летающего кузова должен быть честный `volume`.
// ---------------------------------------------------------------------------

interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

const groups = new Map<string, MutableGroup>();
export const townVertipadSpotLights: SpotLightDefinition[] = [];

function group(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) {
    return existing;
  }
  const created = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

type PrimitiveOptions = Omit<
  ScenePrimitiveDefinition,
  "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"
> & { readonly rotation?: SceneVector3 };

function primitive(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: PrimitiveOptions = {},
): void {
  const { rotation, ...definition } = options;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation },
    ...definition,
  });
}

// --- Базис машины ----------------------------------------------------------
// Нос на запад, правый борт на юг. Всё строится через направления, а не через
// «эйлеры скорописью»: развернуть двор на любой угол должно быть безопасно.

const FORE: SceneVector3 = [-1, 0, 0];
const STARBOARD: SceneVector3 = [0, 0, -1];
const UP: SceneVector3 = [0, 1, 0];

/** Направление в осях машины: `a` вперёд, `b` на правый борт, `y` вверх. */
function dir(a: number, b: number, y = 0): SceneVector3 {
  return [
    FORE[0] * a + STARBOARD[0] * b,
    y,
    FORE[2] * a + STARBOARD[2] * b,
  ];
}

const P = hexacopterPoint;

function rodRotation(dx: number, dy: number, dz: number): SceneVector3 {
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

/** Ориентация куска по направлениям его локальных x (длина) и y (толщина). */
function orient(xDir: SceneVector3, yDir: SceneVector3): SceneVector3 {
  const norm = (v: SceneVector3): SceneVector3 => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const x = norm(xDir);
  const dot = yDir[0] * x[0] + yDir[1] * x[1] + yDir[2] * x[2];
  const y = norm([
    yDir[0] - x[0] * dot,
    yDir[1] - x[1] * dot,
    yDir[2] - x[2] * dot,
  ]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

/**
 * БЮДЖЕТ МАССЫ. Габаритный объём куска врёт: полированная панель обшивки — это
 * лист в два миллиметра, а не монолит стали. Поэтому каждому узлу задана не
 * «толщина», а его масса, и `volume` считается обратно из плотности материала.
 *
 * ЕДИНИЦА. В проекте масса куска — это `volume × density` с игровыми
 * плотностями (у стали 3.6), а не килограммы СИ. Калибровка одна и та же для
 * всех машин карты, поэтому сверяться надо не с реальным аппаратом, а с
 * соседним кораблём: дирижабль № 07 весит 148 единиц и имеет 440 единиц тяги,
 * то есть 0.30 g. Наш гексакоптер — 96 единиц: втрое меньше дирижабля при
 * вчетверо меньшем объёме, и это правильное соотношение для машины, которая
 * держится тягой, а не газом.
 *
 * Раскладка (единиц): батарея 24.6, силовой узел 5.3, грузы дифферентовки 6.8,
 * шесть лучей 11, шесть колец с моторами 25, фонарь с остеклением 13, пол и
 * гондола 9, обстановка кабины 6.5, хвост 3.5, шасси 6.7, мелочь.
 */
const MATERIAL_DENSITY: Partial<Record<BreakableMaterial, number>> = {
  steel: 3.6,
  plastic: 0.55,
  glass: 1.1,
  darkGlass: 1.18,
  cloth: 0.28,
  earth: 1.6,
  concrete: 2.4,
};

/** Объём, при котором кусок весит ровно `units` в масштабе проекта. */
function massVolume(material: BreakableMaterial, units: number): number {
  const density = MATERIAL_DENSITY[material];
  if (!density) {
    throw new Error(`No mass budget density for ${material}`);
  }
  return units / density;
}

/** Тяга/труба между двумя мировыми точками одним куском. */
function strut(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  from: SceneVector3,
  to: SceneVector3,
  thickness: number,
  color: string,
  options: PrimitiveOptions = {},
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  primitive(
    target,
    id,
    material,
    "cylinder",
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    [thickness, length, thickness],
    color,
    {
      rotation: rodRotation(dx, dy, dz),
      contactBoxes: [
        { position: [0, 0, 0], size: [thickness * 2.2, length, thickness * 2.2] },
      ],
      ...options,
    },
  );
}

/**
 * Точная тонкая поверхность в мировых координатах. Коллайдер остаётся
 * компактной AABB-прокси, а intact-renderer получает настоящий обвод без
 * прямоугольных «досок» по касательной.
 */
function surfacePatch(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  vertices: readonly SceneVector3[],
  indices: readonly number[],
  color: string,
  options: PrimitiveOptions = {},
): void {
  const mins = [0, 1, 2].map((axis) =>
    Math.min(...vertices.map((vertex) => vertex[axis])),
  );
  const maxs = [0, 1, 2].map((axis) =>
    Math.max(...vertices.map((vertex) => vertex[axis])),
  );
  const centre = [0, 1, 2].map((axis) =>
    (mins[axis] + maxs[axis]) / 2,
  ) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.025, maxs[axis] - mins[axis]),
  ) as unknown as SceneVector3;
  const localVertices = vertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - centre[axis]) / size[axis],
    ) as unknown as SceneVector3,
  );
  primitive(target, id, material, shape, centre, size, color, {
    contactBoxes: [{ position: [0, 0, 0], size }],
    ...options,
    visualMesh: {
      vertices: localVertices,
      indices,
      doubleSided: true,
    },
  });
}

// --- Палитра ---------------------------------------------------------------
// Полированный алюминий сверху, графит снизу, тёмное стекло, ледяной акцент.

const POLISHED = "#edf1f3";
const POLISHED_WARM = "#dbe2e6";
const SATIN = "#b7c0c6";
const GRAPHITE = "#464d52";
const GRAPHITE_DARK = "#353b40";
const SHADOW = "#23282c";
const TITAN = "#9ba2a8";
const GLASS_TINT = "#314955";
const GLASS_DEEP = "#172a34";
const ACCENT = "#46d3e8";
const ACCENT_DEEP = "#1f8ea3";
const SEAT_LEATHER = "#262c31";
const COPPER = "#a9743f";
const MARK_WHITE = "#e6e9ea";

const CLUSTER_SCENE = "town-vertipad";
const HEXACOPTER_GROUP = "hexacopter";

// ===========================================================================
// 1. МАШИНА
// ===========================================================================

function createHexacopter(): void {
  const ship = group(
    HEXACOPTER_GROUP,
    "HX-6 personal rotorcraft on the yard pad",
    "steel",
    "linked",
  );

  // --- Силовой шпангоут: парящий фундамент решателя ------------------------
  // Материал earth не про землю, а про роль: у решателя это единственный
  // корень устойчивости, который может висеть в воздухе. Физически это
  // центральный силовой шпангоут гондолы — узел, в который сходятся все шесть
  // лучей. Разбили его — машина уходит вниз целиком, а площадка остаётся.
  //
  // Контактная коробка накрывает пояс машины ОТ киля ДО пояса фонаря, но не
  // достаёт до площадки под ней: иначе разметка нашла бы в шпангоуте опору и
  // падала бы вместе с машиной.
  primitive(
    ship,
    "core",
    "earth",
    "cylinder",
    P(0, 0, (HEX_GONDOLA_BOTTOM_Y + HEX_GONDOLA_TOP_Y) / 2),
    [0.62, HEX_GONDOLA_TOP_Y - HEX_GONDOLA_BOTTOM_Y, 0.62],
    TITAN,
    {
      // Настоящий узел из титана, а не тонна земли: объём занижен под
      // фактическую металлоёмкость шпангоута.
      volume: massVolume("earth", 3.198),
      contactBoxes: [
        {
          // Коробка накрывает пояс машины от лучей до пояса фонаря и
          // НЕ достаёт вниз до площадки: иначе разметка и огни нашли бы в
          // шпангоуте опору и падали бы вместе с машиной.
          position: [0, 0.25, 0],
          size: [2 * (HEX_ARM_RADIUS + 1.16), 1.22, 2 * (HEX_ARM_RADIUS + 1.16)],
        },
      ],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      bearingArea: 3.5,
    },
  );

  // --- Батарейный киль ------------------------------------------------------
  // Самая тяжёлая часть машины лежит ниже всего: это и есть маятник. Поддон
  // виден снаружи между стойками и изнутри через стеклянные вставки пола.
  const keelHalfY = (HEX_KEEL_TOP_Y - HEX_KEEL_BOTTOM_Y) / 2;
  const keelY = (HEX_KEEL_TOP_Y + HEX_KEEL_BOTTOM_Y) / 2;
  primitive(
    ship,
    "keel:pan",
    "steel",
    "steelSheet",
    P(0, 0, keelY),
    [1.62, keelHalfY * 2, 1.12],
    GRAPHITE_DARK,
    {
      rotation: orient(FORE, UP),
      // Настоящая батарея, а не пустая жестянка: 168 кг ячеек в поддоне.
      volume: massVolume("steel", 24.6),
      contactBoxes: [{ position: [0, 0, 0], size: [1.86, keelHalfY * 2 + 0.06, 1.52] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.45,
      bearingArea: 1.2,
    },
  );
  // Рёбра поддона — единственная «механика», которую видно снизу.
  for (const index of [-1, 0, 1] as const) {
    primitive(
      ship,
      `keel:rib:${index}`,
      "steel",
      "steelSheet",
      P(index * 0.5, 0, HEX_KEEL_BOTTOM_Y - 0.03),
      [0.1, 0.06, 1.16],
      SHADOW,
      {
        rotation: orient(FORE, UP),
        volume: massVolume("steel", 0.123),
        bearsLoad: false,
        sideAttachmentReach: 0.3,
        contactBoxes: [{ position: [0, 0, 0], size: [0.14, 0.1, 1.4] }],
      },
    );
  }
  // Ледяная полоса по борту поддона: единственный свет, видимый снизу.
  for (const side of [-1, 1] as const) {
    primitive(
      ship,
      `keel:strip:${side}`,
      "glass",
      "glassPane",
      P(0, side * 0.72, keelY - 0.04),
      [1.46, 0.06, 0.07],
      ACCENT,
      {
        rotation: orient(FORE, dir(0, side)),
        volume: massVolume("glass", 0.0615),
        bearsLoad: false,
        sideAttachmentReach: 0.3,
        contactBoxes: [{ position: [0, 0, 0], size: [1.32, 0.09, 0.08] }],
        light: {
          position: [0, 0, side * -0.05],
          followsGroup: true,
          color: ACCENT,
          distance: 9,
          intensity: 1.5,
          poolPriority: 5,
        },
      },
    );
  }

  // --- Гондола: гранёный короб между килем и полом --------------------------
  // Шесть граней по числу лучей: гондола и есть узел, из которого они растут.
  const gondolaY = (HEX_GONDOLA_BOTTOM_Y + HEX_GONDOLA_TOP_Y) / 2;
  const gondolaHeight = HEX_GONDOLA_TOP_Y - HEX_GONDOLA_BOTTOM_Y;
  // Гондола повторяет эллипс кабины в уменьшенном виде: борт идёт под свес
  // палубы, и снизу читается одна форма, а не круг под овалом.
  const gondolaScale = 0.82;
  for (let facet = 0; facet < 8; facet += 1) {
    const psi = ((facet + 0.5) / 8) * Math.PI * 2;
    const radius = hexacopterCabinRadius(psi) * gondolaScale;
    const nextRadius = hexacopterCabinRadius(((facet + 1.5) / 8) * Math.PI * 2) * gondolaScale;
    const nextPsi = ((facet + 1.5) / 8) * Math.PI * 2;
    const radial = dir(Math.cos(psi), Math.sin(psi));
    const nextRadial = dir(Math.cos(nextPsi), Math.sin(nextPsi));
    const tangent: SceneVector3 = [
      nextRadial[0] * nextRadius - radial[0] * radius,
      0,
      nextRadial[2] * nextRadius - radial[2] * radius,
    ];
    const chord = Math.hypot(tangent[0], tangent[2]) * 1.12;
    primitive(
      ship,
      `gondola:facet:${facet}`,
      "steel",
      "panel",
      [
        P(0, 0, gondolaY)[0] + radial[0] * radius,
        gondolaY,
        P(0, 0, gondolaY)[2] + radial[2] * radius,
      ],
      [chord, 0.06, gondolaHeight],
      GRAPHITE,
      {
        rotation: orient(tangent, cabinNormal(psi)),
        volume: massVolume("steel", 0.3936),
        contactBoxes: [{ position: [0, 0, 0], size: [chord, 0.12, gondolaHeight] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
        bearingArea: 0.7,
      },
    );
    // Плечевой шов: физический пояс между графитом низа и алюминием верха.
    primitive(
      ship,
      `gondola:shoulder:${facet}`,
      "steel",
      "panel",
      [
        P(0, 0, HEX_GONDOLA_TOP_Y)[0] + radial[0] * (radius + 0.03),
        HEX_GONDOLA_TOP_Y,
        P(0, 0, HEX_GONDOLA_TOP_Y)[2] + radial[2] * (radius + 0.03),
      ],
      [chord, 0.1, 0.1],
      POLISHED,
      {
        rotation: orient(tangent, cabinNormal(psi)),
        volume: massVolume("steel", 0.0984),
        contactBoxes: [{ position: [0, 0, 0], size: [chord, 0.14, 0.13] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.5,
      },
    );
  }

  // --- Пол кабины: настил с двумя стеклянными вставками ---------------------
  // Вставки лежат ровно над передними кольцами: стоя на полу видно, как под
  // ногами крутятся винты. Из-за них же виден батарейный поддон.
  primitive(
    ship,
    "floor:plate",
    "steel",
    "steelSheet",
    P(0, 0, HEX_FLOOR_Y - 0.03),
    [HEX_CABIN_HALF_LENGTH * 1.72, 0.06, HEX_CABIN_HALF_WIDTH * 1.72],
    SATIN,
    {
      rotation: orient(FORE, UP),
      volume: massVolume("steel", 1.968),
      contactBoxes: [
        {
          position: [0, 0, 0],
          size: [
            HEX_CABIN_HALF_LENGTH * 1.72,
            0.1,
            HEX_CABIN_HALF_WIDTH * 1.72,
          ],
        },
      ],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      bearingArea: 1.4,
    },
  );
  for (const side of [-1, 1] as const) {
    primitive(
      ship,
      `floor:window:${side}`,
      "glass",
      "glassPane",
      P(0.5, side * 0.46, HEX_FLOOR_Y - 0.02),
      [0.56, 0.04, 0.32],
      GLASS_TINT,
      {
        rotation: orient(FORE, UP),
        volume: massVolume("glass", 0.369),
        bearsLoad: false,
        sideAttachmentReach: 0.4,
        contactBoxes: [{ position: [0, 0, 0], size: [0.56, 0.08, 0.32] }],
      },
    );
  }
  // Кромка пола: полированный обод по эллипсу, он же порог двери.
  const sillSegments = 16;
  for (let facet = 0; facet < sillSegments; facet += 1) {
    const psi = ((facet + 0.5) / sillSegments) * Math.PI * 2;
    const next = ((facet + 1.5) / sillSegments) * Math.PI * 2;
    const previous = ((facet - 0.5) / sillSegments) * Math.PI * 2;
    const point = cabinPoint(psi, HEX_FLOOR_Y - 0.04);
    const ahead = cabinPoint(next, HEX_FLOOR_Y - 0.04);
    const behind = cabinPoint(previous, HEX_FLOOR_Y - 0.04);
    const along: SceneVector3 = [
      ahead[0] - behind[0],
      0,
      ahead[2] - behind[2],
    ];
    const chord = Math.hypot(ahead[0] - point[0], ahead[2] - point[2]) * 1.14;
    primitive(
      ship,
      `floor:sill:${facet}`,
      "steel",
      "panel",
      point,
      [chord, 0.08, 0.13],
      POLISHED,
      {
        rotation: orient(along, cabinNormal(psi)),
        volume: massVolume("steel", 0.0615),
        contactBoxes: [{ position: [0, 0, 0], size: [chord, 0.13, 0.17] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.5,
      },
    );
  }

  createCanopy(ship);
  createCabinFittings(ship);
  for (const station of HEXACOPTER_DUCTS) {
    createDuct(ship, station);
  }
  createLandingGear(ship);
  createLiveryAndLights(ship);

  // Пост-проход по всему кластеру: НИ ОДИН кусок машины не садится на твердь
  // под собой. У стали окно опоры 1.1 м, поэтому без этого поддон, кольца и
  // ступенька находили опору в асфальте двора и машина получала второй корень
  // устойчивости — «разбил силовой шпангоут» переставало её ронять
  // (transport-lessons §21; проверено: с корнем в асфальте после сноса
  // шпангоута в воздухе оставалось 526 кусков из 528).
  for (const object of ship.objects) {
    if (object.kind === "primitive") {
      (object as { maximumVerticalGap?: number }).maximumVerticalGap = 0.02;
    }
  }
}

// --- Фонарь -----------------------------------------------------------------
// Гранёный купол над эллиптическим планом: шесть полированных меридиональных
// рёбер, между ними тёмное стекло в три пояса. Верх завален назад, поэтому у
// носа получается наклонное лобовое стекло, а не «банка». Дверь — две смежные
// секции левого борта.

/** Доля высоты фонаря: 0 — пол, 1 — макушка. */
function canopyFraction(y: number): number {
  return (y - HEX_FLOOR_Y) / (HEX_CANOPY_TOP_Y - HEX_FLOOR_Y);
}

const WAIST_FRACTION =
  (HEX_WAIST_Y - HEX_FLOOR_Y) / (HEX_CANOPY_TOP_Y - HEX_FLOOR_Y);
/**
 * Панорамное стекло занимает плечевую часть кабины, но не весь купол. Над
 * ним остаётся настоящий композитный roof-shell — иначе фонарь снова читается
 * стеклянной клеткой, а не пассажирским кузовом.
 */
const GLAZING_TOP_Y = 2.68;

/**
 * Профиль фонаря по высоте — КУПОЛ, а не шатёр. Первая сборка раздувала план
 * к поясу и потом резко сводила его конусом: получался цирковой шатёр, и
 * никакая детализация этого не лечила. Теперь низ поджат под свес палубы, к
 * поясу обвод выходит на полную ширину, а выше идёт непрерывное косинусное
 * сведение — то есть настоящая купольная поверхность.
 */
function canopyScale(y: number): number {
  const t = Math.max(0, Math.min(1, canopyFraction(y)));
  if (t <= WAIST_FRACTION) {
    return 0.92 + 0.08 * Math.sin((t / WAIST_FRACTION) * Math.PI * 0.5);
  }
  const rise = (t - WAIST_FRACTION) / (1 - WAIST_FRACTION);
  const eased = rise * rise * (3 - 2 * rise);
  return 1 - (1 - HEX_CABIN_TOP_SCALE) * eased;
}

/** Завал фонаря назад: чем выше, тем дальше центр уехал к корме. */
function canopyRake(y: number): number {
  const t = Math.max(0, Math.min(1, canopyFraction(y)));
  return -HEX_CABIN_TOP_RAKE * (0.28 * t + 0.72 * t * t);
}

// Внешняя пассажирская капсула чуть полнее физического рабочего объёма:
// внутри остаётся clearance игрока, снаружи появляется плечо, способное
// зрительно нести шестилучевую раму. Оси винтов и контактные щупы неизменны.
const VISUAL_CABIN_HALF_LENGTH = HEX_CABIN_HALF_LENGTH * 1.1;
const VISUAL_CABIN_HALF_WIDTH = HEX_CABIN_HALF_WIDTH * 1.18;

function visualCabinRadius(psi: number): number {
  return (
    1 /
    Math.hypot(
      Math.cos(psi) / VISUAL_CABIN_HALF_LENGTH,
      Math.sin(psi) / VISUAL_CABIN_HALF_WIDTH,
    )
  );
}

/** Точка обвода кабины на угле `psi` от носа и высоте `y`. */
function cabinPoint(psi: number, y: number): SceneVector3 {
  const radius = visualCabinRadius(psi) * canopyScale(y);
  const radial = dir(Math.cos(psi), Math.sin(psi));
  const centre = P(canopyRake(y), 0, y);
  return [centre[0] + radial[0] * radius, y, centre[2] + radial[2] * radius];
}

/** Внешняя нормаль эллипса в плане (у круга совпала бы с радиусом). */
function cabinNormal(psi: number): SceneVector3 {
  const nx = Math.cos(psi) / (VISUAL_CABIN_HALF_LENGTH * VISUAL_CABIN_HALF_LENGTH);
  const nb = Math.sin(psi) / (VISUAL_CABIN_HALF_WIDTH * VISUAL_CABIN_HALF_WIDTH);
  return dir(nx, nb);
}

/**
 * Верхняя кромка roof-shell. Она остаётся эллипсом, а не схлопывается в одну
 * вершину: так крыша заканчивается широким овальным теменем без «палаточного»
 * излома. Высота здесь уже постоянна — центральная вставка является плоской
 * сервисной панелью, а не ещё одним конусом.
 */
function crownPoint(psi: number): SceneVector3 {
  const crownScale = 0.34;
  const radius = visualCabinRadius(psi) * crownScale;
  const radial = dir(Math.cos(psi), Math.sin(psi));
  const centre = P(canopyRake(HEX_CANOPY_TOP_Y), 0, HEX_CROWN_TOP_Y);
  return [
    centre[0] + radial[0] * radius,
    HEX_CROWN_TOP_Y,
    centre[2] + radial[2] * radius,
  ];
}

function createCanopy(ship: MutableGroup): void {
  // Нижние два пояса образуют непрозрачную пассажирскую ванну, следующие три
  // — компактное панорамное остекление. Крыша выше собирается отдельно.
  const courseEdges = [
    HEX_FLOOR_Y,
    1.43,
    1.79,
    2.05,
    2.34,
    GLAZING_TOP_Y,
  ];
  const courses = courseEdges.slice(0, -1).map((from, index) => ({
    from,
    to: courseEdges[index + 1],
  }));

  // Рёбра остаются настоящей несущей клеткой, но начинаются на плечевом шве и
  // утоплены в тёмную маску. Светлые толстые дуги делали аппарат беседкой.
  HEXACOPTER_CANOPY_RIBS.forEach((degrees, index) => {
    const psi = (degrees * Math.PI) / 180;
    let previous = cabinPoint(psi, courseEdges[2]);
    const steps = 7;
    for (let step = 1; step <= steps; step += 1) {
      const y = courseEdges[2] + ((GLAZING_TOP_Y - courseEdges[2]) * step) / steps;
      const next = cabinPoint(psi, y);
      strut(ship, `canopy:rib:${index}:${step}`, "steel", previous, next, 0.052, GRAPHITE_DARK, {
        volume: massVolume("steel", 0.0554),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.6,
        bearingArea: 0.5,
      });
      previous = next;
    }
  });

  // Точный обвод — двенадцать фасеток по окружности. Каждая секция является
  // четырёхугольным участком общей поверхности, а не прямоугольной пластиной
  // по касательной: поэтому профиль не распадается на торчащие рёбра.
  const facets = 12;
  const HULL_COURSES = 2;
  for (let facet = 0; facet < facets; facet += 1) {
    const psi = ((facet + 0.5) / facets) * Math.PI * 2;
    courses.forEach((course, courseIndex) => {
      const psi0 = (facet / facets) * Math.PI * 2;
      const psi1 = ((facet + 1) / facets) * Math.PI * 2;
      const low0 = cabinPoint(psi0, course.from);
      const low1 = cabinPoint(psi1, course.from);
      const high1 = cabinPoint(psi1, course.to);
      const high0 = cabinPoint(psi0, course.to);
      const isHull = courseIndex < HULL_COURSES;
      const isLowerFrontGlass = isHull && Math.cos(psi) > 0.8;
      surfacePatch(
        ship,
        isLowerFrontGlass
          ? `canopy:lower-glass:${facet}:${courseIndex}`
          : isHull
          ? `canopy:hull:${facet}:${courseIndex}`
          : `canopy:glass:${facet}:${courseIndex}`,
        isHull && !isLowerFrontGlass ? "steel" : "darkGlass",
        isHull && !isLowerFrontGlass ? "panel" : "glassPane",
        [low0, low1, high1, high0],
        [0, 1, 2, 0, 2, 3],
        isHull && !isLowerFrontGlass
          ? courseIndex === 0
            ? GRAPHITE
            : POLISHED
          : Math.cos(psi) > -0.15
            ? GLASS_DEEP
            : GLASS_TINT,
        {
          volume: isHull && !isLowerFrontGlass
            ? massVolume("steel", 0.1353)
            : massVolume("darkGlass", 0.1107),
          bearsLoad: false,
          carriesAttachments: isHull && !isLowerFrontGlass,
          attachmentSupportMode:
            isHull && !isLowerFrontGlass ? "cable" : undefined,
          sideAttachmentReach: 0.5,
        },
      );
    });
  }

  // Горизонтальные обручи на швах поясов: вместе с меридиональными рёбрами
  // они и делают фонарь сегментным, а не просто тонированным.
  for (const hoopY of [courseEdges[2], GLAZING_TOP_Y]) {
    for (let facet = 0; facet < facets; facet += 1) {
      const psi = ((facet + 0.5) / facets) * Math.PI * 2;
      const point = cabinPoint(psi, hoopY);
      const ahead = cabinPoint(((facet + 1.5) / facets) * Math.PI * 2, hoopY);
      const behind = cabinPoint(((facet - 0.5) / facets) * Math.PI * 2, hoopY);
      const chord = Math.hypot(ahead[0] - point[0], ahead[2] - point[2]) * 1.16;
      primitive(
        ship,
        `canopy:hoop:${Math.round(hoopY * 100)}:${facet}`,
        "steel",
        "panel",
        point,
        [chord, 0.05, 0.07],
        hoopY === GLAZING_TOP_Y ? GRAPHITE_DARK : ACCENT_DEEP,
        {
          rotation: orient([ahead[0] - behind[0], 0, ahead[2] - behind[2]], cabinNormal(psi)),
          volume: massVolume("steel", 0.0369),
          contactBoxes: [{ position: [0, 0, 0], size: [chord, 0.1, 0.11] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
          bearingArea: 0.4,
        },
      );
    }
  }

  // Поясной шов: полированная обвязка, на ней же навешена дверь.
  const waistSegments = 16;
  for (let facet = 0; facet < waistSegments; facet += 1) {
    const psi = ((facet + 0.5) / waistSegments) * Math.PI * 2;
    const ahead = cabinPoint(((facet + 1.5) / waistSegments) * Math.PI * 2, HEX_WAIST_Y);
    const behind = cabinPoint(((facet - 0.5) / waistSegments) * Math.PI * 2, HEX_WAIST_Y);
    const point = cabinPoint(psi, HEX_WAIST_Y);
    const chord = Math.hypot(ahead[0] - point[0], ahead[2] - point[2]) * 1.14;
    primitive(
      ship,
      `canopy:waist:${facet}`,
      "steel",
      "panel",
      point,
      [chord, 0.085, 0.14],
      POLISHED,
      {
        rotation: orient([ahead[0] - behind[0], 0, ahead[2] - behind[2]], cabinNormal(psi)),
        volume: massVolume("steel", 0.0615),
        contactBoxes: [{ position: [0, 0, 0], size: [chord, 0.13, 0.18] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
        bearingArea: 0.5,
      },
    );
  }

  // Верхний композитный shell продолжает ту же поверхность. Передняя тёмная
  // маска уводит лобовое стекло на крышу, как у современного eVTOL, а светлые
  // борта и овальная сервисная панель сохраняют читаемый композитный кузов.
  // В отличие от прежней пирамиды roof-shell приходит не в одну вершину, а в
  // широкое кольцо плоского темени.
  for (let facet = 0; facet < facets; facet += 1) {
    const psi0 = (facet / facets) * Math.PI * 2;
    const psi1 = ((facet + 1) / facets) * Math.PI * 2;
    const midPsi = (psi0 + psi1) / 2;
    const isFrontMask = Math.cos(midPsi) > 0.45;
    const rim0 = cabinPoint(psi0, GLAZING_TOP_Y);
    const rim1 = cabinPoint(psi1, GLAZING_TOP_Y);
    const roof1 = cabinPoint(psi1, HEX_CANOPY_TOP_Y);
    const roof0 = cabinPoint(psi0, HEX_CANOPY_TOP_Y);
    surfacePatch(
      ship,
      `canopy:crown:${facet}`,
      "steel",
      "panel",
      [rim0, rim1, roof1, roof0],
      [0, 1, 2, 0, 2, 3],
      isFrontMask ? GRAPHITE_DARK : POLISHED,
      {
        volume: massVolume("steel", 0.0431),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
        bearingArea: 0.4,
      },
    );
    const crown0 = crownPoint(psi0);
    const crown1 = crownPoint(psi1);
    surfacePatch(
      ship,
      `canopy:roof:${facet}`,
      "steel",
      "panel",
      [roof0, roof1, crown1, crown0],
      [0, 1, 2, 0, 2, 3],
      isFrontMask ? GRAPHITE_DARK : POLISHED_WARM,
      {
        volume: massVolume("steel", 0.0287),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.35,
      },
    );
  }
  const crownCentre = P(canopyRake(HEX_CANOPY_TOP_Y), 0, HEX_CROWN_TOP_Y);
  for (let facet = 0; facet < facets; facet += 1) {
    const psi0 = (facet / facets) * Math.PI * 2;
    const psi1 = ((facet + 1) / facets) * Math.PI * 2;
    surfacePatch(
      ship,
      `canopy:roof-centre:${facet}`,
      "steel",
      "panel",
      [crownPoint(psi0), crownPoint(psi1), crownCentre],
      [0, 1, 2],
      POLISHED_WARM,
      {
        volume: massVolume("steel", 0.0164),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.35,
      },
    );
  }
  primitive(
    ship,
    "canopy:beacon",
    "glass",
    "glassPane",
    P(canopyRake(HEX_CANOPY_TOP_Y), 0, HEX_CANOPY_TOP_Y - 0.02),
    [0.17, 0.11, 0.17],
    "#ff6a5c",
    {
      volume: massVolume("glass", 0.0369),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.21, 0.15, 0.21] }],
      light: {
        followsGroup: true,
        color: "#ff5a48",
        distance: 26,
        intensity: 4.4,
        dayIntensityFactor: 1,
        poolPriority: 8,
        beacon: {
          physicalDiameter: 0.7,
          minScreenDiameter: 5,
          maxWorldDiameter: 1.4,
          dayOpacity: 0.66,
          nightOpacity: 1,
        },
      },
    },
  );

}

// --- Обстановка кабины -------------------------------------------------------

function createCabinFittings(ship: MutableGroup): void {
  // Кресло стоит по оси, спинкой к корме. Пилот смотрит вперёд, вниз-налево и
  // вниз-направо у него передние кольца.
  primitive(
    ship,
    "seat:pedestal",
    "steel",
    "cylinder",
    P(-0.1, 0, (HEX_FLOOR_Y + HEX_SEAT_Y) / 2),
    [0.24, HEX_SEAT_Y - HEX_FLOOR_Y, 0.24],
    GRAPHITE,
    {
      volume: massVolume("steel", 0.738),
      contactBoxes: [
        { position: [0, 0, 0], size: [0.3, HEX_SEAT_Y - HEX_FLOOR_Y, 0.3] },
      ],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      bearingArea: 0.6,
    },
  );
  primitive(
    ship,
    "seat:cushion",
    "cloth",
    "panel",
    P(-0.1, 0, HEX_SEAT_Y - 0.02),
    [0.5, 0.1, 0.52],
    SEAT_LEATHER,
    {
      rotation: orient(FORE, UP),
      volume: massVolume("cloth", 0.615),
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.14, 0.52] }],
    },
  );
  primitive(
    ship,
    "seat:back",
    "cloth",
    "panel",
    P(-0.36, 0, HEX_SEAT_Y + 0.36),
    [0.62, 0.11, 0.5],
    SEAT_LEATHER,
    {
      rotation: orient(dir(0, 1), dir(-1, 0, 0.22)),
      volume: massVolume("cloth", 0.492),
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [0, 0, 0], size: [0.62, 0.16, 0.5] }],
    },
  );
  primitive(
    ship,
    "seat:headrest",
    "cloth",
    "panel",
    P(-0.4, 0, HEX_SEAT_Y + 0.68),
    [0.3, 0.13, 0.2],
    SEAT_LEATHER,
    {
      rotation: orient(dir(0, 1), dir(-1, 0, 0.22)),
      volume: massVolume("cloth", 0.1845),
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.75,
      contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.18, 0.2] }],
    },
  );

  // Приборная стойка перед креслом: экран и боковая ручка управления.
  primitive(
    ship,
    "console:pillar",
    "steel",
    "panel",
    P(0.52, 0, HEX_FLOOR_Y + 0.34),
    [0.52, 0.08, 0.6],
    GRAPHITE,
    {
      rotation: orient(dir(0, 1), dir(1, 0, 0.35)),
      volume: massVolume("steel", 0.738),
      contactBoxes: [{ position: [0, 0, 0], size: [0.52, 0.14, 0.6] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      bearingArea: 0.5,
    },
  );
  primitive(
    ship,
    "console:screen",
    "glass",
    "glassPane",
    P(0.5, 0, HEX_FLOOR_Y + 0.62),
    [0.42, 0.03, 0.24],
    "#0d3b46",
    {
      rotation: orient(dir(0, 1), dir(1, 0, 0.5)),
      volume: massVolume("glass", 0.1845),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.42, 0.07, 0.24] }],
        light: {
          followsGroup: true,
          color: ACCENT,
          distance: 4.5,
          intensity: 1.4,
          dayIntensityFactor: 0.8,
          poolPriority: 6,
          interior: true,
        },
    },
  );
  primitive(
    ship,
    "console:stick",
    "steel",
    "cylinder",
    P(-0.05, 0.34, HEX_SEAT_Y + 0.16),
    [0.05, 0.26, 0.05],
    SHADOW,
    {
      volume: massVolume("steel", 0.0738),
      rotation: rodRotation(...(dir(0.2, 0, 1) as [number, number, number])),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.26, 0.09] }],
    },
  );
  primitive(
    ship,
    "console:grip",
    "cloth",
    "cylinder",
    P(-0.04, 0.34, HEX_SEAT_Y + 0.24),
    [0.08, 0.13, 0.08],
    SEAT_LEATHER,
    {
      volume: massVolume("cloth", 0.0246),
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [0, 0, 0], size: [0.1, 0.14, 0.1] }],
    },
  );
  // Кормовая переборка с авионикой — она же спинка объёма кабины.
  primitive(
    ship,
    "cabin:bulkhead",
    "steel",
    "panel",
    P(-0.62, 0, HEX_FLOOR_Y + 0.46),
    [0.76, 0.07, 0.84],
    GRAPHITE_DARK,
    {
      rotation: orient(dir(0, 1), dir(-1, 0, 0.1)),
      volume: massVolume("steel", 0.984),
      contactBoxes: [{ position: [0, 0, 0], size: [0.76, 0.12, 0.84] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      bearingArea: 0.5,
    },
  );
  primitive(
    ship,
    "cabin:avionics",
    "steel",
    "steelSheet",
    P(-0.58, 0, HEX_FLOOR_Y + 0.94),
    [0.5, 0.18, 0.22],
    SHADOW,
    {
      rotation: orient(dir(0, 1), UP),
      volume: massVolume("steel", 0.738),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.22, 0.26] }],
    },
  );
}

// --- Кольцевой движитель -----------------------------------------------------
// Каждое кольцо — самостоятельный движитель: обечайка, каплевидная губа,
// четыре статорные стойки, ступица, кок и три лопасти. Кольцо висит в вилке на
// цапфах и наклоняется приводом: горизонтальная составляющая тяги и есть ход
// машины, а разнос колец по борту — её рыскание.

function createDuct(ship: MutableGroup, station: HexacopterDuctStation): void {
  const axis = P(station.a, station.b, 0);
  const inboardPsi = Math.atan2(-station.b, -station.a);
  const at = (radius: number, psi: number, y: number): SceneVector3 => {
    const radial = dir(Math.cos(psi), Math.sin(psi));
    return [axis[0] + radial[0] * radius, y, axis[2] + radial[2] * radius];
  };

  const segments = 12;

  // Обечайка — не вертикальный барабан, а короткий диффузор: верхняя входная
  // губа шире, низ поджат. Физические ось и диск не меняются ни на миллиметр.
  for (let segment = 0; segment < segments; segment += 1) {
    const psi0 = (segment / segments) * Math.PI * 2;
    const psi1 = ((segment + 1) / segments) * Math.PI * 2;
    const midPsi = (psi0 + psi1) / 2;
    const inboardDelta = Math.abs(
      Math.atan2(
        Math.sin(midPsi - inboardPsi),
        Math.cos(midPsi - inboardPsi),
      ),
    );
    surfacePatch(
      ship,
      `duct:${station.index}:shroud:${segment}`,
      "steel",
      "panel",
      [
        at(HEX_SHROUD_OUTER_RADIUS * 0.91, psi0, HEX_SHROUD_BOTTOM_Y),
        at(HEX_SHROUD_OUTER_RADIUS * 0.91, psi1, HEX_SHROUD_BOTTOM_Y),
        at(HEX_SHROUD_OUTER_RADIUS, psi1, HEX_SHROUD_TOP_Y),
        at(HEX_SHROUD_OUTER_RADIUS, psi0, HEX_SHROUD_TOP_Y),
      ],
      [0, 1, 2, 0, 2, 3],
      inboardDelta < Math.PI / 6 ? POLISHED : GRAPHITE_DARK,
      {
        volume: massVolume("steel", 0.0763),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.42,
        bearingArea: 0.6,
      },
    );
  }

  // Входная губа: толстый скруглённый обод. Это и есть плоскость, в которой
  // кольцо создаёт свою долю подъёма, поэтому она же — подъёмный центр.
  for (let segment = 0; segment < segments; segment += 1) {
    const from = ((segment / segments) * Math.PI * 2);
    const to = (((segment + 1) / segments) * Math.PI * 2);
    strut(
      ship,
      `duct:${station.index}:lip:${segment}`,
      "steel",
      at(HEX_SHROUD_OUTER_RADIUS + 0.012, from, HEX_LIP_TOP_Y - 0.075),
      at(HEX_SHROUD_OUTER_RADIUS + 0.012, to, HEX_LIP_TOP_Y - 0.075),
      0.095,
      POLISHED,
      {
        volume: massVolume("steel", 0.0418),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.5,
      },
    );
  }

  // Передние два кольца несут посадочные прожекторы прямо на наружной грани
  // обечайки. Широкие лучи слегка сведены к оси машины: их поля перекрываются
  // перед носом, но источники не светят назад на кабину или верх кольца.
  if (station.a > HEX_ARM_RADIUS * 0.8) {
    const lampName = `duct:${station.index}:headlight`;
    const frontPsi = 0;
    const mountingY = HEX_TRUNNION_Y - 0.06;
    const mountPosition = at(
      HEX_SHROUD_OUTER_RADIUS + 0.012,
      frontPsi,
      mountingY,
    );
    const lensPosition = at(
      HEX_SHROUD_OUTER_RADIUS + 0.065,
      frontPsi,
      mountingY,
    );
    const downAngle = 0.12;
    const inward = station.b > 0 ? -0.055 : 0.055;
    const direction = dir(Math.cos(downAngle), inward, -Math.sin(downAngle));
    primitive(
      ship,
      `${lampName}:mount`,
      "steel",
      "steelSheet",
      mountPosition,
      [0.32, 0.18, 0.08],
      GRAPHITE,
      {
        rotation: orient(STARBOARD, UP),
        volume: massVolume("steel", 0.0738),
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.2,
        contactBoxes: [{ position: [0, 0, 0], size: [0.34, 0.2, 0.1] }],
      },
    );
    primitive(
      ship,
      lampName,
      "glass",
      "glassPane",
      lensPosition,
      [0.26, 0.13, 0.055],
      "#fff2cf",
      {
        rotation: orient(STARBOARD, UP),
        volume: massVolume("glass", 0.0246),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        contactBoxes: [{ position: [0, 0, 0], size: [0.28, 0.15, 0.075] }],
      },
    );
    const sourceOffset = 0.055 / 2 + 0.012;
    townVertipadSpotLights.push({
      id: `${CLUSTER_SCENE}:${HEXACOPTER_GROUP}:${lampName}:piece`,
      position: [
        lensPosition[0] + direction[0] * sourceOffset,
        lensPosition[1] + direction[1] * sourceOffset,
        lensPosition[2] + direction[2] * sourceOffset,
      ],
      direction,
      carrierClusterId: `${CLUSTER_SCENE}:${HEXACOPTER_GROUP}`,
      color: "#ffeec6",
      distance: 68,
      intensity: 480,
      angle: 0.31,
      penumbra: 0.72,
      decay: 1.75,
      dayIntensityFactor: 0,
      transition: {
        fadeInSeconds: 0.7,
        fadeOutSeconds: 0.45,
      },
      visibleBeam: {
        opacity: 0.11,
        sourceRadius: 0.085,
        length: 58,
        attenuation: 50,
        anglePower: 5,
      },
      fixtureGlow: {
        color: "#fff2cf",
        intensity: 6.5,
        halo: {
          physicalDiameter: 0.2,
          minScreenDiameter: 2.8,
          maxWorldDiameter: 0.42,
          dayOpacity: 0,
          nightOpacity: 0.92,
        },
      },
    });
  }

  // Нижняя кромка-диффузор: тонкий обод, он закрывает торцы обечайки снизу.
  for (let segment = 0; segment < segments; segment += 1) {
    const from = ((segment / segments) * Math.PI * 2);
    const to = (((segment + 1) / segments) * Math.PI * 2);
    strut(
      ship,
      `duct:${station.index}:skirt:${segment}`,
      "steel",
      at(HEX_SHROUD_OUTER_RADIUS * 0.91, from, HEX_SHROUD_BOTTOM_Y),
      at(HEX_SHROUD_OUTER_RADIUS * 0.91, to, HEX_SHROUD_BOTTOM_Y),
      0.065,
      GRAPHITE,
      {
        volume: massVolume("steel", 0.0172),
        bearsLoad: false,
        sideAttachmentReach: 0.35,
      },
    );
  }

  // Статорные стойки: несут мотор и держат его в оси. Без них кольцо ещё
  // кольцо, а движитель — уже нет, поэтому они и есть обязательное ядро.
  for (let vane = 0; vane < 4; vane += 1) {
    const psi = ((vane + 0.5) / 4) * Math.PI * 2;
    strut(
      ship,
      `duct:${station.index}:stator:${vane}`,
      "steel",
      at(HEX_SHROUD_INNER_RADIUS, psi, HEX_DISC_Y - 0.12),
      at(0.11, psi, HEX_DISC_Y - 0.12),
      0.055,
      TITAN,
      {
        volume: massVolume("steel", 0.0554),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.5,
        actuator: {
          id: `town-hexacopter:duct:${station.index}`,
          commandChannel: `throttle:${station.index}`,
          required: true,
        },
      },
    );
  }

  primitive(
    ship,
    `engine:${station.index}:hub`,
    "steel",
    "cylinder",
    [axis[0], HEX_DISC_Y - 0.03, axis[2]],
    [0.24, 0.26, 0.24],
    GRAPHITE_DARK,
    {
      volume: massVolume("steel", 0.4182),
      contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.32, 0.3] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      bearingArea: 0.6,
    },
  );

  // Медное кольцо обмотки: единственная тёплая деталь машины, видна в кольце.
  primitive(
    ship,
    `engine:${station.index}:winding`,
    "steel",
    "cylinder",
    [axis[0], HEX_DISC_Y - 0.14, axis[2]],
    [0.27, 0.06, 0.27],
    COPPER,
    {
      volume: massVolume("steel", 0.1107),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.31, 0.1, 0.31] }],
    },
  );
  primitive(
    ship,
    `engine:${station.index}:spinner`,
    "steel",
    "sphere",
    [axis[0], HEX_DISC_Y + 0.14, axis[2]],
    [0.22, 0.24, 0.22],
    SATIN,
    {
      volume: massVolume("steel", 0.0861),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.26, 0.28, 0.26] }],
    },
  );

  // Лопасти. Их доля и решает всё: они и есть подъём этой машины
  // (`envelopeMatch`), и они же — доставленная тяга своего канала.
  const bladeSpan = HEX_FAN_RADIUS - 0.13;
  for (let blade = 0; blade < 3; blade += 1) {
    const psi = (blade / 3) * Math.PI * 2 + station.index * 0.21;
    const radial = dir(Math.cos(psi), Math.sin(psi));
    const tangent = dir(-Math.sin(psi), Math.cos(psi));
    const pitch = 0.34;
    primitive(
      ship,
      `engine:${station.index}:blade:${blade}`,
      // ЛОПАСТЬ — СИЛОВАЯ ДЕТАЛЬ, А НЕ ПЛАСТИКОВАЯ КРЫЛЬЧАТКА.
      //
      // Пластиковая лопасть (порог разрушения 0.58) гибла от ракеты даже
      // сквозь стальной кожух собственного кольца: у ракеты 550 единиц
      // энергии, и остатка после экранирования ×0.01 хватало с запасом.
      // Одно попадание снимало все восемнадцать лопастей, и машина теряла
      // все шесть двигателей при целых силовых ядрах колец. Сталь (порог
      // 24) за экраном переживает попадание на любой дистанции, а прямое
      // попадание по-прежнему уносит лопасть вместе с кольцом. Масса
      // выбрана вдвое против пластиковой: это уже не крыльчатка, и цена
      // прочности честно платится тягой (см. liftReserve в airVehicles).
      "steel",
      "panel",
      at(0.13 + bladeSpan / 2, psi, HEX_DISC_Y),
      [bladeSpan, 0.028, 0.17],
      SHADOW,
      {
        volume: massVolume("steel", 0.246),
        rotation: orient(radial, [
          UP[0] * Math.cos(pitch) + tangent[0] * Math.sin(pitch),
          Math.cos(pitch),
          UP[2] * Math.cos(pitch) + tangent[2] * Math.sin(pitch),
        ]),
        contactBoxes: [{ position: [0, 0, 0], size: [bladeSpan, 0.06, 0.19] }],
        actuator: {
          id: `town-hexacopter:duct:${station.index}`,
          commandChannel: `throttle:${station.index}`,
        },
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
  }

  // --- Луч, вилка и привод наклона ------------------------------------------
  const armDirection = dir(
    station.a / HEX_ARM_RADIUS,
    station.b / HEX_ARM_RADIUS,
  );
  const armRoot = hexacopterCabinRadius(station.angle) * 0.78;
  const armFrom: SceneVector3 = [
    P(0, 0, 0)[0] + armDirection[0] * armRoot,
    HEX_ARM_Y + 0.02,
    P(0, 0, 0)[2] + armDirection[2] * armRoot,
  ];
  // Луч доходит до самой оси кольца и обрывается над ним: кольцо висит СНИЗУ
  // на цапфе, как у настоящих машин с верхней балкой.
  const armTo: SceneVector3 = [
    P(0, 0, 0)[0] + armDirection[0] * Math.hypot(station.a, station.b),
    HEX_ARM_Y,
    P(0, 0, 0)[2] + armDirection[2] * Math.hypot(station.a, station.b),
  ];
  // Луч — обтекаемая КОНИЧЕСКАЯ балка, а не палка: широкое корневое сечение
  // передаёт нагрузку в пассажирскую ванну и плавно сходит к моторной цапфе.
  const armLength = Math.hypot(
    armTo[0] - armFrom[0],
    armTo[1] - armFrom[1],
    armTo[2] - armFrom[2],
  );
  // Визуальная балка заканчивается на внутренней щеке диффузора, ровно в
  // узле цапфы. Её физический carrier по-прежнему доходит до оси двигателя,
  // но наружная оболочка не лежит поперёк верхней губы кольца.
  const ductJoinX =
    0.5 - (HEX_SHROUD_OUTER_RADIUS * 0.96) / Math.max(armLength, 0.001);
  const armMiddleY = (armFrom[1] + armTo[1]) / 2;
  const ductJoinY = (HEX_TRUNNION_Y - armMiddleY) / 0.22;
  primitive(
    ship,
    `arm:${station.index}`,
    "steel",
    "panel",
    [
      (armFrom[0] + armTo[0]) / 2,
      (armFrom[1] + armTo[1]) / 2,
      (armFrom[2] + armTo[2]) / 2,
    ],
    [armLength, 0.22, 0.48],
    POLISHED,
    {
      rotation: orient(
        [armTo[0] - armFrom[0], armTo[1] - armFrom[1], armTo[2] - armFrom[2]],
        UP,
      ),
      volume: massVolume("steel", 1.107),
      visualMesh: {
        vertices: [
          [-0.5, -0.5, -0.5],
          [-0.5, -0.5, 0.5],
          [-0.5, 0.5, -0.5],
          [-0.5, 0.5, 0.5],
          [ductJoinX, ductJoinY - 0.46, -0.34],
          [ductJoinX, ductJoinY - 0.46, 0.34],
          [ductJoinX, ductJoinY + 0.46, -0.34],
          [ductJoinX, ductJoinY + 0.46, 0.34],
        ],
        indices: [
          0, 4, 5, 0, 5, 1,
          2, 3, 7, 2, 7, 6,
          0, 2, 6, 0, 6, 4,
          1, 5, 7, 1, 7, 3,
          0, 1, 3, 0, 3, 2,
          4, 6, 7, 4, 7, 5,
        ],
      },
      contactBoxes: [{ position: [0, 0, 0], size: [armLength, 0.24, 0.5] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.55,
      bearingArea: 0.9,
    },
  );
  // Подвеска кольца. Ось качания у ВСЕХ шести колец параллельна бортовой оси
  // машины — только тогда наклон кольца даёт продольную составляющую тяги в
  // той самой точке, которую паспорт объявляет точкой двигателя. Поэтому не
  // классическая вилка (на траверзных кольцах её ближняя щека вырождалась бы в
  // нуль — на этом и упала первая сборка), а односторонняя цапфа в кулаке на
  // конце луча плюс привод, стоящий рядом с ней по ободу.
  const knuckle = at(HEX_SHROUD_OUTER_RADIUS + 0.03, inboardPsi, HEX_TRUNNION_Y);
  primitive(
    ship,
    `yoke:${station.index}:knuckle`,
    "steel",
    "steelSheet",
    knuckle,
    [0.26, 0.22, 0.2],
    SATIN,
    {
      rotation: orient(dir(1, 0), UP),
      volume: massVolume("steel", 0.2706),
      contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.26, 0.24] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.55,
      bearingArea: 0.7,
    },
  );
  // Цапфа — обязательное ядро движителя: срезал её, и кольцо ушло вниз вместе
  // со своей тягой и своей долей подъёма.
  primitive(
    ship,
    `yoke:${station.index}:trunnion`,
    "steel",
    "cylinder",
    knuckle,
    [0.12, 0.44, 0.12],
    TITAN,
    {
      rotation: rodRotation(...(STARBOARD as [number, number, number])),
      volume: massVolume("steel", 0.1968),
      contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.48, 0.16] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      bearingArea: 0.5,
      actuator: {
        id: `town-hexacopter:duct:${station.index}`,
        commandChannel: `throttle:${station.index}`,
        required: true,
      },
    },
  );
  // Привод наклона: короткий цилиндр от кулака к проушине на ободе рядом.
  const lug = at(HEX_SHROUD_OUTER_RADIUS - 0.01, inboardPsi + 0.62, HEX_TRUNNION_Y - 0.13);
  primitive(
    ship,
    `yoke:${station.index}:lug`,
    "steel",
    "steelSheet",
    lug,
    [0.12, 0.13, 0.06],
    TITAN,
    {
      rotation: orient(dir(1, 0), UP),
      volume: massVolume("steel", 0.0492),
      bearsLoad: false,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.17, 0.1] }],
    },
  );
  strut(
    ship,
    `yoke:${station.index}:ram`,
    "steel",
    [knuckle[0], HEX_TRUNNION_Y - 0.11, knuckle[2]],
    lug,
    0.06,
    POLISHED,
    { volume: massVolume("steel", 0.0738), bearsLoad: false, sideAttachmentReach: 0.4 },
  );

  // Бортовые аэронавигационные огни стоят на самых разнесённых кольцах,
  // как на внешних щеках двигателей городского дирижабля. Остальные четыре
  // диффузора не получают декоративных огоньков: красный/зелёный габарит
  // должен читаться однозначно. +b — правый борт (зелёный), -b — левый
  // (красный).
  if (Math.abs(station.a) < 0.01) {
    const outerPsi = Math.atan2(station.b, station.a);
    const starboard = station.b > 0;
    const sideName = starboard ? "starboard" : "port";
    const outward = dir(Math.cos(outerPsi), Math.sin(outerPsi));
    const tangent = dir(-Math.sin(outerPsi), Math.cos(outerPsi));
    primitive(
      ship,
      `nav-light:${sideName}:mount`,
      "steel",
      "steelSheet",
      at(HEX_SHROUD_OUTER_RADIUS + 0.012, outerPsi, HEX_TRUNNION_Y),
      [0.28, 0.08, 0.2],
      GRAPHITE,
      {
        rotation: orient(tangent, outward),
        volume: massVolume("steel", 0.0615),
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.28,
        contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.12, 0.22] }],
      },
    );
    primitive(
      ship,
      `nav-light:${sideName}`,
      "glass",
      "glassPane",
      at(HEX_SHROUD_OUTER_RADIUS + 0.075, outerPsi, HEX_TRUNNION_Y),
      [0.2, 0.07, 0.13],
      starboard ? "#7fe6a0" : "#f08a80",
      {
        volume: massVolume("glass", 0.0287),
        rotation: orient(tangent, outward),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        contactBoxes: [{ position: [0, 0, 0], size: [0.22, 0.11, 0.15] }],
        light: {
          followsGroup: true,
          color: starboard ? "#6bff9c" : "#ff6f62",
          distance: 16,
          intensity: 3.2,
          dayIntensityFactor: 1,
          poolPriority: 8,
          beacon: {
            physicalDiameter: 0.6,
            minScreenDiameter: 4,
            maxWorldDiameter: 1.15,
            dayOpacity: 0.62,
            nightOpacity: 1,
          },
        },
      },
    );
  }
}

// --- Шасси -------------------------------------------------------------------

const GEAR_STATIONS = HEXACOPTER_GEAR_STATIONS;

function createLandingGear(ship: MutableGroup): void {
  GEAR_STATIONS.forEach((station, index) => {
    const top = P(station.a * 0.42, station.b * 0.42, HEX_GONDOLA_BOTTOM_Y + 0.04);
    const knee = P(station.a * 0.9, station.b * 0.9, HEX_KEEL_BOTTOM_Y + 0.06);
    // Голень приходит концом ВНУТРЬ пятки: без вертикального перекрытия
    // ступня остаётся без опоры и висит.
    const shin = P(station.a, station.b, HEX_FOOT_TOP_Y - 0.06);
    // Стойки несут пятку, но сами не имеют права найти корень в асфальте.
    // Держит это пара условий: пост-проход сузил окно опоры до 2 см, а
    // контактные коробки заданы вплотную по трубе. Толстая коробка помощника
    // `strut` (2.2 диаметра) разъезжается при повороте так, что низ ноги
    // оказывался на нуле — и машина получала второй корень мимо шпангоута.
    const legBox = (from: SceneVector3, to: SceneVector3, thickness: number) => [
      {
        position: [0, 0, 0] as SceneVector3,
        size: [
          thickness * 1.15,
          Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
          thickness * 1.15,
        ] as SceneVector3,
      },
    ];
    strut(ship, `gear:${index}:upper`, "steel", top, knee, 0.085, SATIN, {
      volume: massVolume("steel", 0.3198),
      contactBoxes: legBox(top, knee, 0.085),
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      bearingArea: 0.5,
    });
    strut(ship, `gear:${index}:lower`, "steel", knee, shin, 0.075, SATIN, {
      volume: massVolume("steel", 0.2706),
      contactBoxes: legBox(knee, shin, 0.075),
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.45,
      bearingArea: 0.5,
    });
    primitive(
      ship,
      `gear:${index}:foot`,
      "plastic",
      "steelSheet",
      P(station.a, station.b, (HEX_FOOT_BOTTOM_Y + HEX_FOOT_TOP_Y) / 2),
      [0.32, HEX_FOOT_TOP_Y - HEX_FOOT_BOTTOM_Y, 0.26],
      GRAPHITE_DARK,
      {
        rotation: orient(FORE, UP),
        volume: massVolume("plastic", 0.1845),
        contactBoxes: [
          {
            position: [0, 0, 0],
            size: [0.34, HEX_FOOT_TOP_Y - HEX_FOOT_BOTTOM_Y, 0.28],
          },
        ],
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
      },
    );
  });

  // Две продольные лыжи связывают четыре реальные точки опоры в читаемое
  // гражданское шасси. Они декоративно следуют существующим пяткам и не
  // меняют ни support points, ни контактную механику машины.
  for (const side of [-1, 1] as const) {
    strut(
      ship,
      `gear:skid:${side}`,
      "steel",
      P(1.18, side * 1.52, HEX_FOOT_BOTTOM_Y + 0.085),
      P(-1.18, side * 1.52, HEX_FOOT_BOTTOM_Y + 0.085),
      0.085,
      GRAPHITE_DARK,
      {
        volume: massVolume("steel", 0.1845),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.7,
      },
    );
  }

}

// --- Ливрея и огни -----------------------------------------------------------

function createLiveryAndLights(ship: MutableGroup): void {
  // Бортовой номер на графите гондолы, по обоим бортам. Читается с земли.
  const glyphs: readonly (readonly number[])[] = [
    // H
    [1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1],
    // X
    [1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1],
    // 6
    [0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0],
  ];
  for (const side of [-1, 1] as const) {
    glyphs.forEach((glyph, glyphIndex) => {
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          if (!glyph[row * 4 + column]) {
            continue;
          }
          // С левого борта наблюдатель смотрит в другую сторону, поэтому
          // порядок столбцов зеркалится вместе с самим глифом.
          const readingColumn = side < 0 ? 3 - column : column;
          const a =
            -0.02 +
            (glyphIndex - 1) * 0.24 +
            (readingColumn - 1.5) * 0.052 * (side < 0 ? -1 : 1);
          primitive(
            ship,
            `livery:number:${side}:${glyphIndex}:${row}:${column}`,
            "steel",
            "steelSheet",
            P(a, side * 0.78, HEX_GONDOLA_BOTTOM_Y + 0.18 - row * 0.045),
            [0.046, 0.025, 0.04],
            MARK_WHITE,
            {
              volume: massVolume("steel", 0.0037),
              rotation: orient(dir(1, 0), dir(0, side)),
              bearsLoad: false,
              sideAttachmentReach: 0.25,
              contactBoxes: [{ position: [0, 0, 0], size: [0.05, 0.045, 0.05] }],
            },
          );
        }
      }
    });
  }

  // Кормовой белый габарит повторяет световой модуль городского дирижабля:
  // отдельная тёмная оправа, тёпло-белая линза и дальний beacon. Носового
  // центрального огня нет — впереди читается только пара прожекторов колец.
  const addWhiteNavigationLight = (name: "aft", psi: number): void => {
    const surface = cabinPoint(psi, HEX_FLOOR_Y + 0.2);
    const outward = cabinNormal(psi);
    const tangent = dir(-Math.sin(psi), Math.cos(psi));
    const lens: SceneVector3 = [
      surface[0] + outward[0] * 0.065,
      surface[1],
      surface[2] + outward[2] * 0.065,
    ];
    primitive(
      ship,
      `nav-light:${name}:mount`,
      "steel",
      "steelSheet",
      surface,
      [0.24, 0.08, 0.18],
      GRAPHITE,
      {
        rotation: orient(tangent, outward),
        volume: massVolume("steel", 0.0615),
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.25,
        contactBoxes: [{ position: [0, 0, 0], size: [0.26, 0.12, 0.2] }],
      },
    );
    primitive(
      ship,
      `nav-light:${name}`,
      "glass",
      "glassPane",
      lens,
      [0.17, 0.07, 0.12],
      "#f4f1e2",
      {
        rotation: orient(tangent, outward),
        volume: massVolume("glass", 0.0287),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        contactBoxes: [{ position: [0, 0, 0], size: [0.19, 0.11, 0.14] }],
        light: {
          followsGroup: true,
          color: "#fff6dc",
          distance: 15,
          intensity: 2.8,
          dayIntensityFactor: 1,
          poolPriority: 6,
          beacon: {
            physicalDiameter: 0.52,
            minScreenDiameter: 3.5,
            maxWorldDiameter: 1,
            dayOpacity: 0.58,
            nightOpacity: 0.95,
          },
        },
      },
    );
  };
  addWhiteNavigationLight("aft", Math.PI);
}

// ===========================================================================
// 2. ПЛОЩАДКА
// ===========================================================================
// Никаких мачт и ферм: размеченное пятно во дворе, приёмный стакан под носовой
// штырь и шесть низких огней по кромке. Площадка кораблю НЕ опора — у её
// кусков bearsLoad и carriesAttachments false, поэтому «разбил шпангоут»
// роняет машину целиком, а разметка остаётся лежать.

/** Компактная шестиметровая железобетонная плита в газоне частного двора. */
const PAD_RADIUS = 3;

function createVertipad(): void {
  const pad = group("pad", "Painted vertipad in the block yard", "concrete", "stack");

  primitive(
    pad,
    "disc",
    "concrete",
    "cylinder",
    [
      hexacopterPoint(0, 0, 0)[0],
      (HEXACOPTER_GROUND_Y + HEXACOPTER_PAD_TOP_Y) / 2,
      hexacopterPoint(0, 0, 0)[2],
    ],
    [PAD_RADIUS * 2, HEXACOPTER_PAD_TOP_Y - HEXACOPTER_GROUND_Y, PAD_RADIUS * 2],
    "#4c5054",
    {
      contactBoxes: [
        {
          position: [0, 0, 0],
          size: [
            PAD_RADIUS * 2,
            HEXACOPTER_PAD_TOP_Y - HEXACOPTER_GROUND_Y,
            PAD_RADIUS * 2,
          ],
        },
      ],
      bearsLoad: false,
      carriesAttachments: false,
      weathering: 0.35,
    },
  );

  // Шестиугольник разметки повторяет план машины: кольца садятся на вершины.
  for (let edge = 0; edge < 6; edge += 1) {
    const from = (edge / 6) * Math.PI * 2;
    const to = ((edge + 1) / 6) * Math.PI * 2;
    const radius = HEX_ARM_RADIUS + 0.34;
    const start = dir(Math.cos(from), Math.sin(from));
    const end = dir(Math.cos(to), Math.sin(to));
    const a: SceneVector3 = [
      hexacopterPoint(0, 0, 0)[0] + start[0] * radius,
      HEXACOPTER_PAD_TOP_Y,
      hexacopterPoint(0, 0, 0)[2] + start[2] * radius,
    ];
    const b: SceneVector3 = [
      hexacopterPoint(0, 0, 0)[0] + end[0] * radius,
      HEXACOPTER_PAD_TOP_Y,
      hexacopterPoint(0, 0, 0)[2] + end[2] * radius,
    ];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    primitive(
      pad,
      `mark:edge:${edge}`,
      "concrete",
      "steelSheet",
      [(a[0] + b[0]) / 2, HEXACOPTER_PAD_TOP_Y + 0.012, (a[2] + b[2]) / 2],
      [length * 0.9, 0.02, 0.14],
      MARK_WHITE,
      {
        rotation: orient([b[0] - a[0], 0, b[2] - a[2]], UP),
        bearsLoad: false,
        carriesAttachments: false,
        weathering: 0.4,
      },
    );
  }
  // Стрелка курса: показывает, куда носом стоит машина.
  for (const [offset, width] of [[0.2, 0.5], [0.42, 0.34], [0.64, 0.18]] as const) {
    primitive(
      pad,
      `mark:arrow:${offset}`,
      "concrete",
      "steelSheet",
      [
        hexacopterPoint(2.0 + offset, 0, 0)[0],
        HEXACOPTER_PAD_TOP_Y + 0.012,
        hexacopterPoint(2.0 + offset, 0, 0)[2],
      ],
      [0.16, 0.02, width],
      ACCENT_DEEP,
      {
        rotation: orient(dir(1, 0), UP),
        bearsLoad: false,
        carriesAttachments: false,
        weathering: 0.4,
      },
    );
  }

  // Приёмный стакан под носовой штырь: физическая точка захвата причала.
  primitive(
    pad,
    "socket:cup",
    "steel",
    "cylinder",
    [
      hexacopterPoint(1.32, 0, 0)[0],
      HEXACOPTER_PAD_TOP_Y + 0.09,
      hexacopterPoint(1.32, 0, 0)[2],
    ],
    [0.42, 0.18, 0.42],
    TITAN,
    {
      contactBoxes: [{ position: [0, 0, 0], size: [0.46, 0.22, 0.46] }],
      bearsLoad: false,
      carriesAttachments: false,
    },
  );
  primitive(
    pad,
    "socket:collar",
    "steel",
    "cylinder",
    [
      hexacopterPoint(1.32, 0, 0)[0],
      HEXACOPTER_PAD_TOP_Y + 0.19,
      hexacopterPoint(1.32, 0, 0)[2],
    ],
    [0.5, 0.05, 0.5],
    POLISHED_WARM,
    {
      contactBoxes: [{ position: [0, 0, 0], size: [0.54, 0.08, 0.54] }],
      bearsLoad: false,
      carriesAttachments: false,
    },
  );

  // Шесть низких огней по кромке — ровно как на настоящих площадках. Стоят в
  // просветах МЕЖДУ кольцами (0°, 60°, …), а не под ними: кольца выносятся на
  // 3.1 м и накрыли бы огонь, поставленный по оси луча.
  for (let lamp = 0; lamp < 6; lamp += 1) {
    const angle = (lamp / 6) * Math.PI * 2;
    const radial = dir(Math.cos(angle), Math.sin(angle));
    const base: SceneVector3 = [
      hexacopterPoint(0, 0, 0)[0] + radial[0] * (PAD_RADIUS - 0.16),
      HEXACOPTER_PAD_TOP_Y,
      hexacopterPoint(0, 0, 0)[2] + radial[2] * (PAD_RADIUS - 0.16),
    ];
    primitive(
      pad,
      `edge-lamp:${lamp}:post`,
      "steel",
      "cylinder",
      [base[0], base[1] + 0.12, base[2]],
      [0.09, 0.24, 0.09],
      GRAPHITE_DARK,
      {
        contactBoxes: [{ position: [0, 0, 0], size: [0.13, 0.24, 0.13] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.2,
        bearingArea: 0.4,
      },
    );
    primitive(
      pad,
      `edge-lamp:${lamp}:lens`,
      "glass",
      "glassPane",
      [base[0], base[1] + 0.26, base[2]],
      [0.14, 0.07, 0.14],
      ACCENT,
      {
        bearsLoad: false,
        sideAttachmentReach: 0.2,
        contactBoxes: [{ position: [0, 0, 0], size: [0.18, 0.12, 0.18] }],
        light: {
          color: ACCENT,
          distance: 10,
          intensity: 1.8,
          poolPriority: 5,
        },
      },
    );
  }

  // Табличка у кромки: единственный «интерфейс» площадки, к нему подходят,
  // чтобы отправить машину без пассажира.
  // Стойка стоит на той же, левой стороне, что дверь и ступенька: человек
  // идёт по двору с запада, видит нос машины, табло и открытую дверь разом.
  //
  // Вынос 4.1 м от центра — не вкусовой: на 3.3 м стойка оказывалась в 0.6 м
  // от кормового кольца и становилась ЕГО боковой опорой. Машина получала
  // второй корень устойчивости, и снос силового шпангоута оставлял 526 кусков
  // из 528 висеть в воздухе. Между причальным реквизитом и любым куском
  // корабля должно быть больше, чем самый длинный `sideAttachmentReach`
  // корабля (0.55 м), с запасом.
  const signPoint = P(2.9, -2.9, 0);
  primitive(
    pad,
    "dispatch:post",
    "steel",
    "cylinder",
    [signPoint[0], HEXACOPTER_GROUND_Y + 0.5, signPoint[2]],
    [0.1, 1.0, 0.1],
    GRAPHITE,
    {
      contactBoxes: [{ position: [0, 0, 0], size: [0.14, 1.0, 0.14] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
      bearingArea: 0.5,
    },
  );
  primitive(
    pad,
    "dispatch:board",
    "steel",
    "steelSheet",
    [signPoint[0], HEXACOPTER_GROUND_Y + 1.02, signPoint[2]],
    [0.46, 0.05, 0.34],
    GRAPHITE_DARK,
    {
      rotation: orient(dir(1, 0), dir(0, -1)),
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.09, 0.38] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.25,
    },
  );
  primitive(
    pad,
    "dispatch:screen",
    "glass",
    "glassPane",
    [signPoint[0], HEXACOPTER_GROUND_Y + 1.02, signPoint[2] - 0.05],
    [0.36, 0.03, 0.24],
    "#0e3a45",
    {
      rotation: orient(dir(1, 0), dir(0, -1)),
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      contactBoxes: [{ position: [0, 0, 0], size: [0.4, 0.06, 0.28] }],
      light: {
        color: ACCENT,
        distance: 6,
        intensity: 1.6,
        dayIntensityFactor: 0.7,
        poolPriority: 5,
      },
    },
  );
}

createHexacopter();
createVertipad();

export const townVertipadDocument = {
  schemaVersion: 1 as const,
  id: CLUSTER_SCENE,
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
