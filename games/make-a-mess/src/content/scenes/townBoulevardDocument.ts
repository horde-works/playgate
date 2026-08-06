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
  DS_CLUSTER_ID,
  DS_FRONT_AXLE_X,
  DS_HEADLAMP_STATIONS,
  DS_REAR_AXLE_X,
  DS_SCENE_ID,
  DS_TRACK_FRONT,
  DS_WHEEL_CENTRE_HEIGHT,
  DS_TRACK_REAR,
  DS_TYRE_HALF_WIDTH,
  DS_WHEEL_RADIUS,
  DS_WHEEL_STATIONS,
  dsHeadlampDirection,
  dsPoint,
} from "../../game/townCitroenDs.ts";
import {
  DS_BACKLIGHT_U,
  DS_BUMPER_DEPTH,
  DS_BUMPER_HALF_WIDTH,
  DS_BUMPER_HORN_FRONT_U,
  DS_BUMPER_HORN_REAR_U,
  DS_BUMPER_TOP_FRONT,
  DS_BUMPER_TOP_REAR,
  DS_COWL_U,
  DS_DOOR_FRONT_U,
  DS_DOOR_MIDDLE_U,
  DS_DOOR_REAR_U,
  DS_ROOF_FRONT_U,
  DS_ROOF_REAR_U,
  DS_FRONT_ARCH_RADIUS,
  DS_SPAT_FRONT_U,
  DS_SPAT_REAR_U,
  DS_THETA_HAUNCH,
  DS_THETA_ROOF_EDGE,
  DS_THETA_SHOULDER,
  DS_THETA_SKIRT,
  DS_THETA_WAIST,
  dsArchFloor,
  dsBodyPoint,
  dsSection,
  dsSectionPoint,
  dsStationOf,
  dsStationX,
  dsTopHeight,
  dsWaistHalfWidth,
} from "../../game/townCitroenDsBody.ts";

// ---------------------------------------------------------------------------
// СЕДАН «DS» НА ГЛАВНОЙ УЛИЦЕ
//
// Паспорт образа и физики — в шапке `game/townCitroenDs.ts`; форма поверхности
// и её станции — в `game/townCitroenDsBody.ts`; откуда взяты числа — в
// `docs/citroen-ds-brief.md`. Здесь только сборка:
//
//   1. платформа — единственный корень устойчивости;
//   2. силовой агрегат впереди (развесовка 65/35);
//   3. подрамники;
//   4. ОБОЛОЧКА — одна замкнутая поверхность из `dsBodyPoint(u, theta)`;
//   5. остекление и палубы — из той же поверхности;
//   6. колёса-актуаторы, бампера, фары, салон.
//
// ГЛАВНОЕ ПРАВИЛО СБОРКИ: панель, которая не выводится из `dsBodyPoint`, на
// кузове не лежит. Прежняя версия резала борт и палубу двумя независимыми
// линейчатыми поверхностями, между которыми оставалась щель до 319 мм, и
// сквозь неё было видно салон с любого верхнего ракурса.
//
// Мины (vehicle-authoring references/assembly.md): contactBoxes локальные; ориентации через
// orient()/rodRotation(); окно опоры у каждого куска — сантиметры, иначе
// асфальт станет вторым корнем.
//
// БЮДЖЕТ МАССЫ: каждому узлу задана масса в тоннах, `volume` — обратно из
// плотности. Снаряжённая машина: 1.33.
// ---------------------------------------------------------------------------

const CLUSTER_SCENE = DS_SCENE_ID;
const DS_GROUP = DS_CLUSTER_ID.slice(CLUSTER_SCENE.length + 1);

// --- Палитра ---------------------------------------------------------------
//
// Кузов — «Bleu Delta», заводской код AC 640: перламутровый голубой металлик
// последних лет выпуска. Тон снят пробами с фотографии борта: на свету панель
// даёт #88caf8, в полутени #5f9ad4, в тени #3371a0.
//
// Альбедо взято по ТЕНЕВОЙ пробе, а не по средней. У металлика альбедо задаёт
// не только рассеянный цвет, но и ОТТЕНОК ОТРАЖЕНИЯ: чем выше metalness, тем
// больше света приходит бликом и тем светлее панель выглядит сама по себе.
// Светлый альбедо на таком материале даёт молочную панель без цвета в тени —
// то есть ровно не металлик.
//
// Крыша светлее и матовее — она не стальная, а пластиковая, и на голубом
// кузове её белый уводится в холодный, иначе она желтит.
//
// Хром узкий: у этой машины его мало, и он подчёркивает линии, а не заменяет.
const BODY = "#4a80ae";
const ROOF = "#eef1f3";
const CHROME = "#c4c9ce";
const SHADOW = "#2b2d2f";
const GLASS = "#93a9ad";
const TYRE = "#1e1f21";
const LAMP_GLASS = "#fff3d2";
const CABIN = "#5c4b3a";

/** Тонкая наружная панель: плотность стали, прочность своя. */
const PANEL: BreakableMaterial = "sheetMetal";

/**
 * ОКРАШЕННАЯ ПАНЕЛЬ. Без этого профиля `sheetMetal` берёт фотореалистичную
 * текстуру исцарапанной серой плиты — ту же, что у машинерии и оружия, — и
 * кузов читается камнем даже при верном цвете. `painted-steel` даёт почти
 * однородное покрытие с широкими малоконтрастными полосами: краска на
 * металле, по которой идёт блик, а не порода.
 */
const PAINT = { textureProfile: "painted-steel" } as const;
/** Хром: то же покрытие, но светлее и без полос. */
const BRIGHTWORK = { textureProfile: "matte-aluminium" } as const;

interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

const groups = new Map<string, MutableGroup>();
export const townBoulevardSpotLights: SpotLightDefinition[] = [];

function group(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "linked",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) return existing;
  const created = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

type PrimitiveOptions = Omit<
  ScenePrimitiveDefinition,
  "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"
> & { readonly rotation?: SceneVector3 };

/**
 * Окно опоры куска машины. Сталь по умолчанию ищет опору в 1.1 м под собой, и
 * машина, стоящая на асфальте, вся целиком нашла бы в нём второй корень.
 */
const VEHICLE_SUPPORT_GAP = 0.05;

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
    maximumVerticalGap: VEHICLE_SUPPORT_GAP,
    transform: { position, rotation },
    ...definition,
  });
}

// --- Базис -----------------------------------------------------------------
// Авторские оси машины совпадают с мировыми по направлению: нос смотрит в −x,
// правый борт — в −z. Поэтому «вдоль» это +x от носа к корме, а левый борт —
// это +z. Ниже они названы, чтобы знаки нигде не выписывались руками.

const ALONG: SceneVector3 = [1, 0, 0];
const UP: SceneVector3 = [0, 1, 0];
const LEFT = 1;
const RIGHT = -1;

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

function rodRotation(dx: number, dy: number, dz: number): SceneVector3 {
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

const MATERIAL_DENSITY: Partial<Record<BreakableMaterial, number>> = {
  steel: 3.6,
  // Панель — та же сталь по плотности и совсем другая по прочности.
  sheetMetal: 3.6,
  plastic: 0.55,
  glass: 1.1,
  darkGlass: 1.18,
  cloth: 0.28,
  earth: 1.6,
};

/** Объём, при котором кусок весит ровно `units` тонн. */
function massVolume(material: BreakableMaterial, units: number): number {
  const density = MATERIAL_DENSITY[material];
  if (!density) throw new Error(`No mass budget density for ${material}`);
  return units / density;
}

// ---------------------------------------------------------------------------
// ОБОЛОЧКА ИЗ ФУНКЦИИ ПОВЕРХНОСТИ
// ---------------------------------------------------------------------------

/**
 * Точка обшивки в мировых осях. `u` вдоль машины, `theta` по обходу сечения.
 * Если станция попала в вырез передней арки, точка поднимается на кромку
 * арки: колесо открыто, и панель туда не заходит.
 */
function skinPoint(u: number, theta: number, side: number): SceneVector3 {
  const local = dsBodyPoint(u, theta, side);
  // Арка режет ТОЛЬКО БОРТ — всё, что ниже плеча. Пока кламп применялся ко
  // всей поверхности, он задирал и палубу капота: над передним колесом её
  // точки поднимались на кромку арки, и на капоте у основания лобового
  // появлялась тёмная складка-«линза», взявшаяся ниоткуда.
  const floor = theta <= DS_THETA_SHOULDER ? dsArchFloor(u) : -Infinity;
  const y = Number.isFinite(floor) ? Math.max(local[1], floor) : local[1];
  return dsPoint(local[0], y, local[2]);
}

/** Сетка (cols × rows) → треугольники. `flip` меняет обход для правого борта. */
function gridMesh(
  cols: number,
  rows: number,
  at: (i: number, j: number) => SceneVector3,
  flip = false,
): { vertices: SceneVector3[]; indices: number[] } {
  const vertices: SceneVector3[] = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      vertices.push(at(i / cols, j / rows));
    }
  }
  const indices: number[] = [];
  const stride = cols + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  return { vertices, indices };
}

/**
 * Полоса обшивки: кусок поверхности между двумя станциями по длине и двумя
 * узлами по обходу сечения. Все панели борта строятся ТОЛЬКО так.
 */
function skinBand(
  u0: number,
  u1: number,
  theta0: number,
  theta1: number,
  side: number,
  cols: number,
  rows: number,
): { vertices: SceneVector3[]; indices: number[] } {
  return gridMesh(cols, rows, (su, sh) => (
    skinPoint(u0 + (u1 - u0) * su, theta0 + (theta1 - theta0) * sh, side)
  ), side === RIGHT);
}

/**
 * Палуба — верх сечения, идущий поперёк машины с борта на борт. Ею
 * закрываются капот, крыша и багажник, и она стыкуется с бортом ПО ТОЙ ЖЕ
 * точке поверхности, поэтому щели между ними быть не может.
 */
function deckBand(
  u0: number,
  u1: number,
  theta: number,
  cols: number,
  rows: number,
): { vertices: SceneVector3[]; indices: number[] } {
  return gridMesh(cols, rows, (su, sh) => {
    const u = u0 + (u1 - u0) * su;
    // sh = 0 — правый борт, 1 — левый; посередине проходит ось симметрии.
    const across = -1 + 2 * sh;
    const side = across >= 0 ? LEFT : RIGHT;
    // ГЛАДКО ЧЕРЕЗ ОСЕВУЮ. Напрашивающийся `1 − |across|` в нуле не имеет
    // производной, и по центру каждой палубы и стекла проходил гребень —
    // тот самый, который читался «волнами» на капоте и заднем скате.
    // `1 − across²` даёт ту же единицу по центру и ноль у плеча, но с нулевой
    // производной в середине.
    const t = theta + (1 - theta) * (1 - across * across);
    return skinPoint(u, t, side);
  });
}

/**
 * Точная тонкая поверхность. Коллайдер — AABB-прокси; визуал — настоящий
 * обвод. Повреждения идут через shell-вокселизацию, как у sky-ram.
 */
function surfacePatch(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  vertices: readonly SceneVector3[],
  indices: readonly number[],
  color: string,
  mass: number,
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
  let area = 0;
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = vertices[indices[index]];
    const b = vertices[indices[index + 1]];
    const c = vertices[indices[index + 2]];
    const ab: SceneVector3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: SceneVector3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    area += 0.5 * Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    );
  }
  const thickness = area > 1e-8 ? massVolume(material, mass) / area : 0.03;
  primitive(target, id, material, shape, centre, size, color, {
    volume: massVolume(material, mass),
    contactBoxes: [
      {
        position: [0, 0, 0],
        size: [size[0] + 0.04, size[1] + 0.04, size[2] + 0.04],
      },
    ],
    bearsLoad: false,
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: 0.3,
    voxelization: { mode: "shell", thickness: Math.max(0.012, thickness) },
    ...options,
    visualMesh: {
      vertices: localVertices,
      indices,
      doubleSided: true,
    },
  });
}

/** Панель кузова из полосы поверхности — самая частая операция сборки. */
function skinPanel(
  target: MutableGroup,
  id: string,
  u0: number,
  u1: number,
  theta0: number,
  theta1: number,
  side: number,
  color: string,
  mass: number,
  cols: number,
  rows: number,
  options: PrimitiveOptions = {},
): void {
  const band = skinBand(u0, u1, theta0, theta1, side, cols, rows);
  surfacePatch(
    target, id, PANEL, "steelSheet",
    band.vertices, band.indices, color, mass, { ...PAINT, ...options },
  );
}

// ---------------------------------------------------------------------------
// СБОРКА
// ---------------------------------------------------------------------------

const NOSE_U = 0.004;
const TAIL_U = 0.996;
/** Заход борта и палубы на стекло: перекрывает шов утопленного остекления. */
const SILL_LIP = 0.045;
/** Киль: начало обхода сечения. */
const KEEL = 0;

function createDs(): void {
  const car = group(DS_GROUP, "Citroen DS on the main street", "steel", "linked");

  // --- 1. Платформа: парящий фундамент решателя -----------------------------
  // Материал `earth` не про землю, а про роль: у решателя это единственный
  // корень, который имеет право висеть. Физически это несущая платформа —
  // та самая, на которую у этой машины навешивается вообще всё, и с которой
  // её можно раздеть до голого шасси, не уронив.
  const platformY = 0.26;
  primitive(
    car,
    "platform",
    "earth",
    "steelSheet",
    dsPoint((DS_FRONT_AXLE_X + DS_REAR_AXLE_X) / 2, platformY, 0),
    [3.5, 0.08, 1.42],
    SHADOW,
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("earth", 0.014),
      contactBoxes: [{ position: [0, 0, 0], size: [4.6, 1.0, 1.78] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.9,
      bearingArea: 3.2,
    },
  );

  // Лонжероны: цепь нагрузки от платформы к обоим подрамникам. Тонкие и
  // УБРАННЫЕ ЗА ЮБКУ — низ каждого лежит выше самой низкой точки порога,
  // поэтому сбоку их не видно ни в одном ракурсе.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    primitive(
      car,
      `frame:rail:${name}`,
      "steel",
      "steelSheet",
      dsPoint(0, platformY + 0.03, side * 0.48),
      [4.1, 0.09, 0.11],
      SHADOW,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", 0.026),
        contactBoxes: [{ position: [0, 0, 0], size: [4.1, 0.17, 0.2] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.8,
      },
    );
  }

  // --- 2. Силовой агрегат ---------------------------------------------------
  // Порядок спереди назад: коробка, главная передача, двигатель. Это и есть
  // причина развесовки 65/35, и переставить его нельзя, не сломав повадку.
  const powertrain: readonly {
    id: string;
    x: number;
    y: number;
    size: SceneVector3;
    mass: number;
    color: string;
  }[] = [
    { id: "gearbox", x: -1.9, y: 0.47, size: [0.5, 0.3, 0.5], mass: 0.105, color: SHADOW },
    { id: "final-drive", x: -1.6, y: 0.46, size: [0.28, 0.34, 0.62], mass: 0.05, color: SHADOW },
    { id: "engine:block", x: -1.1, y: 0.53, size: [0.72, 0.6, 0.56], mass: 0.245, color: "#3a3d40" },
    // Насос высокого давления: сердце гидропневматики и единственный узел,
    // объясняющий, почему машина умеет менять посадку.
    { id: "hydraulics:pump", x: -0.85, y: 0.62, size: [0.2, 0.24, 0.2], mass: 0.02, color: "#4a4237" },
  ];
  for (const unit of powertrain) {
    primitive(
      car,
      unit.id,
      "steel",
      "steelSheet",
      dsPoint(unit.x, unit.y, 0),
      unit.size,
      unit.color,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", unit.mass),
        contactBoxes: [
          {
            position: [0, 0, 0],
            size: [unit.size[0] + 0.04, unit.size[1] + 0.04, unit.size[2] + 0.04],
          },
        ],
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      },
    );
  }

  // Бак под задним диваном — противовес носовому агрегату.
  primitive(
    car,
    "fuel-tank",
    "steel",
    "steelSheet",
    dsPoint(1.3, 0.42, 0),
    [0.7, 0.24, 1.1],
    "#43423d",
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("steel", 0.055),
      contactBoxes: [{ position: [0, 0, 0], size: [0.74, 0.28, 1.14] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
    },
  );

  // --- 3. Подрамники --------------------------------------------------------
  for (const axle of ["front", "rear"] as const) {
    const x = axle === "front" ? DS_FRONT_AXLE_X : DS_REAR_AXLE_X;
    const track = axle === "front" ? DS_TRACK_FRONT : DS_TRACK_REAR;
    primitive(
      car,
      `subframe:${axle}`,
      "steel",
      "steelSheet",
      dsPoint(x, 0.4, 0),
      [0.26, 0.16, track - 0.2],
      SHADOW,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", axle === "front" ? 0.042 : 0.02),
        contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.2, track - 0.16] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.6,
      },
    );
  }

  // --- 4. ОБОЛОЧКА ----------------------------------------------------------
  //
  // Одна замкнутая поверхность, порезанная на панели по РЕАЛЬНЫМ разъёмам
  // машины. Каждая панель — полоса `dsBodyPoint`, поэтому соседние панели
  // делят общую кромку и щели между ними нет по построению.
  //
  // По обходу сечения кузов делится на три пояса:
  //   киль → юбка   (theta 0 … 0.18)    днище, снизу не видно
  //   юбка → плечо  (theta 0.18 … 0.62) БОРТ: юбка, талия, подбор
  //   плечо → венец (theta 0.62 … 1.0)  палубы, стойки и остекление
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";

    // Днище. Тонкое, тёмное, несущее — на нём стоит вся оболочка.
    skinPanel(
      car, `floorpan:${name}`,
      NOSE_U, TAIL_U, KEEL, DS_THETA_SKIRT, side,
      SHADOW, 0.022, 34, 3,
      { bearsLoad: true },
    );

    // Борт разрезан по разъёмам: переднее крыло, две двери, заднее крыло.
    // Это не украшение — по этим линиям кузов и разбирается.
    const flank: readonly [string, number, number, number][] = [
      ["wing:front", NOSE_U, DS_DOOR_FRONT_U, 0.022],
      ["door:front", DS_DOOR_FRONT_U, DS_DOOR_MIDDLE_U, 0.02],
      ["door:rear", DS_DOOR_MIDDLE_U, DS_DOOR_REAR_U, 0.019],
      ["wing:rear", DS_DOOR_REAR_U, TAIL_U, 0.022],
    ];
    // Борт заходит ВЫШЕ плеча на подоконник. Стекло утоплено внутрь на два
    // сантиметра, и без этого захода между ним и бортом по всей длине машины
    // тянулась щель, сквозь которую было видно салон.
    for (const [id, u0, u1, mass] of flank) {
      skinPanel(
        car, `${id}:${name}`,
        u0, u1, DS_THETA_SKIRT, DS_THETA_SHOULDER + SILL_LIP, side,
        BODY, mass, 22, 6,
        // НЕСУЩАЯ панель. У кузова без рамы борт и есть конструкция: на нём
        // стоят стойки, на стойках крыша.
        { bearsLoad: true },
      );
    }

    // Выше плеча отдельных боковин НЕТ: там уже лежит палуба, идущая с борта
    // на борт. Пока они существовали параллельно, обе поверхности совпадали
    // и капот шёл полосами z-fighting.
    //
    // Но у ОСНОВАНИЯ ЛОБОВОГО палуба уже кончилась, а стойка ещё не поднялась,
    // и между ними на плече оставался открытый клин — сверху сквозь него было
    // видно нутро. Это щиток (scuttle): треугольная панель между капотом,
    // стойкой и плечом, которая на настоящей машине там и стоит.
    const scuttle = gridMesh(8, 4, (su, sh) => {
      const u = DS_COWL_U - 0.02 + (DS_DOOR_FRONT_U + 0.04 - DS_COWL_U + 0.02) * su;
      const rise = (u - DS_COWL_U) / (DS_ROOF_FRONT_U - DS_COWL_U);
      const top = DS_THETA_SHOULDER
        + (DS_THETA_ROOF_EDGE - DS_THETA_SHOULDER) * Math.min(1, rise);
      return skinPoint(u, DS_THETA_SHOULDER + (top - DS_THETA_SHOULDER) * sh, side);
    }, side === RIGHT);
    surfacePatch(car, `scuttle:${name}`, PANEL, "steelSheet",
      scuttle.vertices, scuttle.indices, BODY, 0.006,
      { ...PAINT, bearsLoad: true });
  }

  // Палубы: капот, крыша, крышка багажника. Каждая идёт от плеча одного
  // борта через венец к плечу другого — то есть закрывает машину целиком.
  const bonnet = deckBand(NOSE_U, DS_COWL_U + 0.012, DS_THETA_SHOULDER, 24, 18);
  surfacePatch(car, "bonnet", PANEL, "steelSheet",
    bonnet.vertices, bonnet.indices, BODY, 0.038, { ...PAINT, bearsLoad: true });

  const boot = deckBand(DS_BACKLIGHT_U - 0.012, TAIL_U, DS_THETA_SHOULDER, 18, 14);
  surfacePatch(car, "boot:lid", PANEL, "steelSheet",
    boot.vertices, boot.indices, BODY, 0.024, { ...PAINT, bearsLoad: true });

  // Крыша — светлый пластик на лёгком каркасе, не сталь.
  const roof = deckBand(DS_ROOF_FRONT_U - 0.012, DS_ROOF_REAR_U + 0.008,
    DS_THETA_ROOF_EDGE, 18, 12);
  surfacePatch(car, "roof", "plastic", "panel",
    roof.vertices, roof.indices, ROOF, 0.012, PAINT);

  // --- 5. Остекление --------------------------------------------------------
  // Стекло берётся из ТОЙ ЖЕ поверхности, только вдавленным внутрь по
  // нормали: тогда рамка остаётся снаружи, а стекло не торчит из кузова.
  const GLASS_INSET = 0.02;

  const glassPoint = (u: number, theta: number, side: number): SceneVector3 => {
    const [half, y] = dsSectionPoint(dsSection(u), theta);
    return dsPoint(
      dsStationX(u),
      y - GLASS_INSET * 0.35,
      side * Math.max(0, half - GLASS_INSET),
    );
  };

  // Кромка стекла обязана идти ПО СТОЙКЕ, а не по линии плеча: стойка
  // поднимается от плеча у основания к кромке крыши наверху, и стекло
  // кончается там же. Пока край стекла держался на плече, он залезал под
  // стойку на всю её длину, и в кадре по рамке шла рябь.
  const pillarTheta = (t: number): number =>
    DS_THETA_SHOULDER + (DS_THETA_ROOF_EDGE - DS_THETA_SHOULDER) * t;

  const screenMesh = (u0: number, u1: number) => gridMesh(14, 14, (su, sh) => {
    const u = u0 + (u1 - u0) * sh;
    const across = -1 + 2 * su;
    const side = across >= 0 ? LEFT : RIGHT;
    const edge = pillarTheta(sh);
    const t = edge + (1 - edge) * (1 - across * across);
    return glassPoint(u, t, side);
  });

  const windscreen = screenMesh(DS_COWL_U, DS_ROOF_FRONT_U);
  surfacePatch(car, "glass:windscreen", "glass", "glassPane",
    windscreen.vertices, windscreen.indices, GLASS, 0.018,
    { carriesAttachments: false });

  const backlight = screenMesh(DS_BACKLIGHT_U, DS_ROOF_REAR_U);
  surfacePatch(car, "glass:backlight", "glass", "glassPane",
    backlight.vertices, backlight.indices, GLASS, 0.015,
    { carriesAttachments: false });

  // Боковые стёкла: две двери, между ними тонкая стойка.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    // Передняя кромка бокового стекла идёт ПО СТОЙКЕ, а не вертикально: у
    // наклонной стойки вертикальная кромка оставляет клиновидный проём внизу,
    // через который видно салон. Задняя — так же по стойке «c».
    const panes: readonly [string, (t: number) => number, (t: number) => number][] = [
      [
        "front",
        (t) => DS_COWL_U + (DS_ROOF_FRONT_U - DS_COWL_U) * t + 0.016,
        () => DS_DOOR_MIDDLE_U - 0.008,
      ],
      [
        "rear",
        () => DS_DOOR_MIDDLE_U + 0.008,
        (t) => DS_BACKLIGHT_U + (DS_ROOF_REAR_U - DS_BACKLIGHT_U) * t - 0.016,
      ],
    ];
    for (const [id, front, back] of panes) {
      const pane = gridMesh(12, 8, (su, sh) => glassPoint(
        front(sh) + (back(sh) - front(sh)) * su,
        pillarTheta(sh),
        side,
      ), flip);
      surfacePatch(car, `glass:side:${id}:${name}`, "glass", "glassPane",
        pane.vertices, pane.indices, GLASS, 0.007,
        { carriesAttachments: false });
    }

    // Стойки. Тонкие — этим машина и знаменита, — но настоящие: они несут
    // крышу, и без них она не держится ни на чём.
    // Стойка «c» начинается от ЗАДНЕЙ ДВЕРИ, а не от кромки крыши: между
    // ними лежит задняя четверть борта, и пока стойка стартовала позже, там
    // зияла дыра в оболочке высотой в треть метра.
    // Стойка — УЗКАЯ ПОЛОСА ВДОЛЬ СВОЕГО ПУТИ, а не полотно на весь угол.
    // Сетка по (u, theta) прямоугольником закрывала всю область между плечом
    // и кромкой крыши: получалась не стойка, а глухая панель поверх стекла,
    // и по рамке шла рябь от совпавших поверхностей.
    //
    // Путь задаётся парой «низ → верх»: снизу стойка стоит на плече, сверху
    // приходит на кромку крыши, а ширина набирается смещением по длине.
    const PILLAR_HALF_WIDTH = 0.021;
    const pillars: readonly [string, number, number][] = [
      ["a", DS_COWL_U, DS_ROOF_FRONT_U],
      ["b", DS_DOOR_MIDDLE_U, DS_DOOR_MIDDLE_U],
      ["c", DS_BACKLIGHT_U, DS_ROOF_REAR_U],
    ];
    for (const [id, uFoot, uHead] of pillars) {
      const post = gridMesh(2, 8, (su, sh) => skinPoint(
        uFoot + (uHead - uFoot) * sh + (su - 0.5) * 2 * PILLAR_HALF_WIDTH,
        pillarTheta(sh),
        side,
      ), flip);
      surfacePatch(car, `pillar:${id}:${name}`, PANEL, "steelSheet",
        // ВСЕ стойки кузовные. Светлая на машине только крыша; покрашенная
        // в её цвет задняя стойка давала белый клин у водостока.
        post.vertices, post.indices, BODY, 0.004,
        { ...PAINT, bearsLoad: true });
    }
  }

  // --- 6. Щиток заднего колеса и подкрылок ---------------------------------
  //
  // Щиток НАКРЫВАЕТ КОЛЕСО С ЗАПАСОМ: он не повторяет борт, а выпучивается
  // ровно настолько, чтобы обойти покрышку снаружи по всей её высоте. Пока он
  // просто лежал на борту с зазором в четыре миллиметра, борт местами был
  // уже шины, и колесо торчало из-под него.
  const REAR = DS_WHEEL_STATIONS.find((w) => w.axle === "rear")!;
  const TYRE_OUTER = Math.abs(REAR.hub[2]) + DS_TYRE_HALF_WIDTH;
  const SPAT_CLEARANCE = 0.022;

  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    const spat = gridMesh(14, 8, (su, sh) => {
      const u = DS_SPAT_FRONT_U + (DS_SPAT_REAR_U - DS_SPAT_FRONT_U) * su;
      const [half, y] = dsSectionPoint(
        dsSection(u),
        DS_THETA_SKIRT + (DS_THETA_HAUNCH - DS_THETA_SKIRT) * sh,
      );
      // За пределами колеса щиток садится на борт, над колесом — обходит его.
      // Центр колеса — на радиусе над дорогой, а не на верху стойки: щиток
      // обязан обходить ВИДИМУЮ покрышку, а не расчётную точку подвески.
      const dx = dsStationX(u) - REAR.hub[0];
      const dy = y - DS_WHEEL_CENTRE_HEIGHT;
      const reach = Math.hypot(dx, dy) < DS_WHEEL_RADIUS + 0.05
        ? TYRE_OUTER + SPAT_CLEARANCE
        : half + 0.004;
      return dsPoint(dsStationX(u), y, side * Math.max(half + 0.004, reach));
    }, flip);
    surfacePatch(car, `spat:${name}`, PANEL, "steelSheet",
      spat.vertices, spat.indices, BODY, 0.008,
      { ...PAINT, carriesAttachments: false });

    // ПОДКРЫЛОК передней арки — ПОЛНЫЙ ТОННЕЛЬ, а не полка у кромки.
    //
    // Арка настоящий вырез, и одной горизонтальной пластины у губы мало:
    // сверху взгляд проходит мимо неё в моторный отсек, и колесо «светится»
    // через арку. Тоннель идёт по всей дуге проёма и закрыт изнутри стенкой,
    // так что смотреть сквозь него больше некуда.
    const WELL_DEPTH = 0.26;
    const archU0 = dsStationOf(DS_FRONT_AXLE_X - DS_FRONT_ARCH_RADIUS * 0.995);
    const archU1 = dsStationOf(DS_FRONT_AXLE_X + DS_FRONT_ARCH_RADIUS * 0.995);
    const archPoint = (su: number, inward: number): SceneVector3 => {
      const u = archU0 + (archU1 - archU0) * su;
      const lip = dsArchFloor(u);
      const [half] = dsSectionPoint(dsSection(u), DS_THETA_WAIST);
      return dsPoint(
        dsStationX(u),
        Number.isFinite(lip) ? lip : DS_WHEEL_CENTRE_HEIGHT,
        side * (half - inward),
      );
    };
    const well = gridMesh(16, 4, (su, sh) => archPoint(su, WELL_DEPTH * sh), !flip);
    surfacePatch(car, `wheel-well:${name}`, PANEL, "steelSheet",
      well.vertices, well.indices, SHADOW, 0.005,
      { carriesAttachments: false });

    // Внутренняя стенка ниши: замыкает тоннель к оси машины и отрезает вид
    // на агрегаты из-под крыла.
    const wall = gridMesh(16, 3, (su, sh) => {
      const top = archPoint(su, WELL_DEPTH);
      return [top[0], top[1] - (top[1] - dsPoint(0, 0.2, 0)[1]) * sh, top[2]];
    }, flip);
    surfacePatch(car, `wheel-well:wall:${name}`, PANEL, "steelSheet",
      wall.vertices, wall.indices, SHADOW, 0.004,
      { carriesAttachments: false });
  }

  // --- 6b. Хром, водосток и наружные детали ---------------------------------
  //
  // Всё это ЛЕЖИТ НА ПОВЕРХНОСТИ: каждая полоса и каждая ручка выводится из
  // `dsBodyPoint` со смещением наружу, а не ставится коробкой на глаз. Тогда
  // хром повторяет обвод и не отрывается от борта на изгибе.
  const CHROME_OUT = 0.012;

  /** Полоса, идущая ВДОЛЬ машины по заданному узлу обхода сечения. */
  const beltStrip = (
    id: string,
    u0: number,
    u1: number,
    theta: number,
    halfHeight: number,
    colour: string,
    mass: number,
    side: number,
  ): void => {
    const flip = side === RIGHT;
    const strip = gridMesh(26, 2, (su, sh) => {
      const u = u0 + (u1 - u0) * su;
      const [half, y] = dsSectionPoint(dsSection(u), theta);
      return dsPoint(
        dsStationX(u),
        y + (sh - 0.5) * 2 * halfHeight,
        side * (half + CHROME_OUT),
      );
    }, flip);
    surfacePatch(car, id, "steel", "steelSheet",
      strip.vertices, strip.indices, colour, mass,
      { ...BRIGHTWORK, bearsLoad: false, carriesAttachments: false,
        sideAttachmentReach: 0.2 });
  };

  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";

    // ПОЯСНОЙ МОЛДИНГ — самая заметная хромовая линия машины: идёт от
    // переднего крыла до кормы чуть выше талии, по ней же стоят ручки.
    beltStrip(`trim:waist:${name}`, 0.1, 0.95,
      DS_THETA_WAIST + 0.06, 0.011, CHROME, 0.004, side);

    // ПОРОЖНЫЙ МОЛДИНГ вдоль юбки: у этой машины он прикрывает стык юбки.
    beltStrip(`trim:sill:${name}`, DS_DOOR_FRONT_U - 0.02, DS_SPAT_REAR_U,
      DS_THETA_SKIRT + 0.05, 0.009, "#9aa0a4", 0.003, side);

    // ВОДОСТОК по кромке крыши. Он не украшение: на его концах сидят
    // поворотники-«трубы», и без него им не на чем стоять.
    const gutter = gridMesh(20, 2, (su, sh) => {
      const u = DS_ROOF_FRONT_U + (DS_ROOF_REAR_U - DS_ROOF_FRONT_U) * su;
      const [half, y] = dsSectionPoint(dsSection(u), DS_THETA_ROOF_EDGE);
      return dsPoint(dsStationX(u), y + (sh - 0.5) * 0.026,
        side * (half + 0.014));
    }, side === RIGHT);
    surfacePatch(car, `gutter:${name}`, "steel", "steelSheet",
      gutter.vertices, gutter.indices, CHROME, 0.003,
      { ...BRIGHTWORK, bearsLoad: false, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.2 });

    // ТРУБА-ПОВОРОТНИК на заднем конце водостока. Второй такой машины нет
    // ни у кого: указатель вынесен на крышу и смотрит назад конусом.
    const [trumpetHalf, trumpetY] = dsSectionPoint(
      dsSection(DS_ROOF_REAR_U), DS_THETA_ROOF_EDGE,
    );
    primitive(
      car, `trumpet:${name}`, "glass", "cylinder",
      dsPoint(dsStationX(DS_ROOF_REAR_U) + 0.075, trumpetY + 0.012,
        side * (trumpetHalf + 0.012)),
      [0.062, 0.15, 0.062], "#f0a33a",
      {
        rotation: rodRotation(1, 0, 0),
        volume: massVolume("glass", 0.001),
        contactBoxes: [{ position: [0, 0, 0], size: [0.1, 0.19, 0.1] }],
        bearsLoad: false, sideAttachmentReach: 0.15,
      },
    );

    // РУЧКИ ДВЕРЕЙ — плоские хромовые клавиши на поясной линии.
    for (const [door, u] of [
      ["front", DS_DOOR_MIDDLE_U - 0.045],
      ["rear", DS_DOOR_REAR_U - 0.045],
    ] as const) {
      const [half, y] = dsSectionPoint(dsSection(u), DS_THETA_WAIST + 0.1);
      primitive(
        car, `handle:${door}:${name}`, "steel", "steelSheet",
        dsPoint(dsStationX(u), y, side * (half + 0.022)),
        [0.16, 0.035, 0.03], CHROME,
        {
          rotation: orient(ALONG, UP),
          volume: massVolume("steel", 0.0008),
          contactBoxes: [{ position: [0, 0, 0], size: [0.2, 0.07, 0.07] }],
          bearsLoad: false, carriesAttachments: false,
          sideAttachmentReach: 0.12,
          ...BRIGHTWORK,
        },
      );
    }

    // ЗЕРКАЛО на переднем крыле — там, где его ставили на этой машине.
    const mirrorU = DS_COWL_U - 0.03;
    const [mirrorHalf, mirrorY] = dsSectionPoint(
      dsSection(mirrorU), DS_THETA_SHOULDER,
    );
    primitive(
      car, `mirror:${name}`, "steel", "cylinder",
      dsPoint(dsStationX(mirrorU), mirrorY + 0.07, side * (mirrorHalf - 0.02)),
      [0.05, 0.13, 0.05], CHROME,
      {
        rotation: rodRotation(0, 1, 0),
        volume: massVolume("steel", 0.0012),
        contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.17, 0.09] }],
        bearsLoad: false, sideAttachmentReach: 0.12,
        ...BRIGHTWORK,
      },
    );
  }

  // ТЕНЕВЫЕ ШВЫ по разъёмам панелей. Двери не открываются, но кузов обязан
  // читаться собранным из панелей, а не отлитым целиком: у настоящей машины
  // это первое, что выдаёт масштаб.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    for (const [id, u] of [
      ["door:front", DS_DOOR_FRONT_U],
      ["door:middle", DS_DOOR_MIDDLE_U],
      ["door:rear", DS_DOOR_REAR_U],
    ] as const) {
      const seam = gridMesh(2, 8, (su, sh) => {
        const theta = DS_THETA_SKIRT
          + (DS_THETA_SHOULDER - DS_THETA_SKIRT) * sh;
        const [half, y] = dsSectionPoint(dsSection(u), theta);
        return dsPoint(
          dsStationX(u) + (su - 0.5) * 0.014,
          y,
          side * (half + 0.002),
        );
      }, flip);
      surfacePatch(car, `seam:${id}:${name}`, PANEL, "steelSheet",
        seam.vertices, seam.indices, "#2b3138", 0.0006,
        { carriesAttachments: false });
    }
  }

  // --- 7. Колёса ------------------------------------------------------------
  // Колесо — АКТУАТОР, и у него есть required core: ступица. Потеряли шину —
  // осталась голая ступица и никакой тяги; потеряли ступицу — канала нет
  // вовсе, и никакая уцелевшая резина этого не исправит.
  for (const station of DS_WHEEL_STATIONS) {
    const channel = `wheel:${station.id}`;
    // Станция хранит ВЕРХ СТОЙКИ — точку, из которой подвеска щупает землю.
    // Видимое колесо стоит НИЖЕ неё на статическую осадку, иначе покрышка
    // висит над асфальтом на 160 мм.
    const hub = dsPoint(
      station.hub[0],
      DS_WHEEL_CENTRE_HEIGHT,
      station.hub[2],
    );
    primitive(
      car,
      `wheel:${station.id}:hub`,
      "steel",
      "cylinder",
      hub,
      [0.34, DS_TYRE_HALF_WIDTH * 2 + 0.02, 0.34],
      CHROME,
      {
        rotation: rodRotation(0, 0, 1),
        volume: massVolume("steel", 0.008),
        contactBoxes: [
          { position: [0, 0, 0], size: [0.38, DS_TYRE_HALF_WIDTH * 2 + 0.06, 0.38] },
        ],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        bearingArea: 0.35,
        actuator: { id: channel, commandChannel: channel, required: true },
      },
    );
    primitive(
      car,
      `wheel:${station.id}:tyre`,
      "plastic",
      "cylinder",
      hub,
      [DS_WHEEL_RADIUS * 2, DS_TYRE_HALF_WIDTH * 2, DS_WHEEL_RADIUS * 2],
      TYRE,
      {
        rotation: rodRotation(0, 0, 1),
        volume: massVolume("plastic", 0.0085),
        contactBoxes: [
          {
            position: [0, 0, 0],
            size: [
              DS_WHEEL_RADIUS * 2 + 0.02,
              DS_TYRE_HALF_WIDTH * 2 + 0.02,
              DS_WHEEL_RADIUS * 2 + 0.02,
            ],
          },
        ],
        bearsLoad: true,
        bearingArea: 0.3,
        actuator: { id: channel, commandChannel: channel, contribution: 1 },
      },
    );
    // Рычаг подвески: видимая связь колеса с подрамником.
    const axleX = station.axle === "front" ? DS_FRONT_AXLE_X : DS_REAR_AXLE_X;
    primitive(
      car,
      `wheel:${station.id}:arm`,
      "steel",
      "steelSheet",
      dsPoint(axleX, DS_WHEEL_CENTRE_HEIGHT - 0.02, station.hub[2] / 2),
      [0.14, 0.1, Math.abs(station.hub[2])],
      SHADOW,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", 0.006),
        contactBoxes: [
          { position: [0, 0, 0], size: [0.18, 0.14, Math.abs(station.hub[2]) + 0.04] },
        ],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
      },
    );
  }

  // --- 8. Бампера -----------------------------------------------------------
  //
  // Бампер — КЛИНОК, ОГИБАЮЩИЙ торец, а не поперечная доска. Он идёт по
  // обводу в плане, чуть выступая наружу, и заканчивается «рогами» на бортах.
  // Именно он набирает паспортные 1803 мм — кузов по талии уже.
  //
  // Пока это была коробка во всю ширину, на носу, где кузов сходится до
  // 0.37 полуширины, она торчала в пустоту двумя досками.
  const BUMPER_OUT = 0.03;

  for (const [end, tipU, hornU, top, mass] of [
    ["front", NOSE_U, DS_BUMPER_HORN_FRONT_U, DS_BUMPER_TOP_FRONT, 0.024],
    ["rear", TAIL_U, DS_BUMPER_HORN_REAR_U, DS_BUMPER_TOP_REAR, 0.017],
  ] as const) {
    const wrap = gridMesh(34, 5, (su, sh) => {
      // su ведёт по огибающей: 0 — рог левого борта, 0.5 — торец, 1 — правый.
      const across = -1 + 2 * su;
      const side = across >= 0 ? LEFT : RIGHT;
      const t = Math.abs(across);
      const u = tipU + (hornU - tipU) * t;
      // Клинок идёт на ПОСТОЯННОЙ высоте — она проставлена на чертеже, — а
      // его полуширина повторяет обвод: у торца бампер сходится вместе с ним.
      //
      // Сечение НАСТОЯЩЕЕ, а не лист: по высоте пруток выпуклый, поэтому по
      // нему идёт узкий длинный блик, как по хромированной стали. Плоская
      // полоса такого блика не даёт и читается наклейкой.
      const half = Math.min(
        DS_BUMPER_HALF_WIDTH,
        dsWaistHalfWidth(u) + BUMPER_OUT,
      );
      const bulge = Math.sin(Math.PI * sh) * 0.028;
      return dsPoint(
        dsStationX(u),
        top - DS_BUMPER_DEPTH * sh,
        side * (half + bulge),
      );
    });
    surfacePatch(car, `bumper:${end}`, "steel", "steelSheet",
      wrap.vertices, wrap.indices, CHROME, mass,
      { ...BRIGHTWORK, bearsLoad: false, carriesAttachments: true,
        attachmentSupportMode: "cable", sideAttachmentReach: 0.25 });

    // КЛЫКИ. Вертикальные хромовые упоры по краям знака — по ним у этой
    // машины бампер и опознаётся, и они же первыми принимают удар в парковке.
    for (const side of [LEFT, RIGHT]) {
      const name = side === LEFT ? "left" : "right";
      const u = tipU + (hornU - tipU) * 0.16;
      const half = Math.min(DS_BUMPER_HALF_WIDTH, dsWaistHalfWidth(u) + BUMPER_OUT);
      primitive(
        car, `bumper:${end}:overrider:${name}`, "steel", "steelSheet",
        dsPoint(dsStationX(u) , top - DS_BUMPER_DEPTH * 0.5, side * (half * 0.42)),
        [0.09, 0.26, 0.075], CHROME,
        {
          rotation: orient(ALONG, UP),
          volume: massVolume("steel", 0.0022),
          contactBoxes: [{ position: [0, 0, 0], size: [0.13, 0.3, 0.115] }],
          bearsLoad: false, sideAttachmentReach: 0.15, ...BRIGHTWORK,
        },
      );
    }

    // Нижняя юбка под бампером: тёмная, некрашеная, прикрывает подвеску.
    const valance = gridMesh(24, 2, (su, sh) => {
      const across = -1 + 2 * su;
      const side = across >= 0 ? LEFT : RIGHT;
      const u = tipU + (hornU - tipU) * Math.abs(across) * 0.8;
      const half = Math.min(DS_BUMPER_HALF_WIDTH * 0.9,
        dsWaistHalfWidth(u) + BUMPER_OUT * 0.4);
      return dsPoint(dsStationX(u),
        top - DS_BUMPER_DEPTH - 0.11 * sh, side * half);
    });
    surfacePatch(car, `valance:${end}`, PANEL, "steelSheet",
      valance.vertices, valance.indices, "#20242a", 0.006,
      { carriesAttachments: false });
  }

  // Низкая щель воздухозаборника под передним бампером: решётки у машины нет,
  // и весь воздух она берёт отсюда.
  primitive(
    car,
    "nose:intake",
    "steel",
    "steelSheet",
    dsPoint(dsStationX(0.016), 0.34, 0),
    [0.12, 0.07, 1.0],
    SHADOW,
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("steel", 0.004),
      contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.11, 1.04] }],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    },
  );

  // --- 8b. Стёкла блока фар, указатели и фонари ------------------------------
  //
  // Фара у этой машины — не круг и не прямоугольник, а КАПЛЯ под общим
  // стеклом: снаружи она высокая и широкая, к внутреннему углу сходится в
  // остриё. Стекло вписано В КРЫЛО, а не приклеено к нему: обвод берётся из
  // той же поверхности со смещением наружу.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    const LAMP_U0 = 0.028;
    const LAMP_U1 = 0.086;
    const cover = gridMesh(10, 6, (su, sh) => {
      const u = LAMP_U0 + (LAMP_U1 - LAMP_U0) * su;
      // Капля: у внешнего края (su=1) стекло высокое, к носу сходит в клин.
      const spread = Math.sin(Math.PI * Math.pow(su, 0.72));
      // Ось блока фар лежит НА ПОВЕРХНОСТИ КРЫЛА, а не на постоянной высоте:
      // нос падает, и фара обязана падать вместе с ним. Пока высота была
      // константой, стекло вылезало выше обвода на восемь сантиметров.
      const section = dsSection(u);
      const [half, waistY] = dsSectionPoint(section, DS_THETA_WAIST);
      const centre = waistY + (section.shoulder - waistY) * 0.42;
      // Стекло не имеет права подняться выше обвода — иначе на носу
      // появляется козырёк, которого на машине нет.
      const y = Math.min(
        centre + (sh - 0.5) * 0.17 * spread,
        dsTopHeight(u) - 0.045,
      );
      return dsPoint(dsStationX(u), y, side * Math.min(half + 0.006, 0.18 + 0.5 * su));
    }, flip);
    surfacePatch(car, `headlamp:cover:${name}`, "glass", "glassPane",
      cover.vertices, cover.indices, "#dfe6e2", 0.002,
      { carriesAttachments: false });

    // Янтарный указатель — отдельная прорезь в передней панели ПОД стеклом.
    const [indHalf] = dsSectionPoint(dsSection(0.05), DS_THETA_WAIST);
    primitive(
      car, `indicator:front:${name}`, "glass", "glassPane",
      dsPoint(dsStationX(0.048), 0.6, side * (indHalf * 0.78)),
      [0.06, 0.055, 0.26], "#e79a2c",
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("glass", 0.0006),
        contactBoxes: [{ position: [0, 0, 0], size: [0.1, 0.09, 0.3] }],
        bearsLoad: false, sideAttachmentReach: 0.12,
      },
    );

    // ЗАДНИЙ ФОНАРЬ сидит В БАМПЕРЕ-подкове, а не на панели кузова.
    const [tailHalf] = dsSectionPoint(dsSection(0.965), DS_THETA_WAIST);
    primitive(
      car, `lamp:tail:${name}`, "glass", "glassPane",
      dsPoint(dsStationX(0.975), DS_BUMPER_TOP_REAR + 0.055,
        side * (tailHalf * 0.74)),
      [0.07, 0.1, 0.2], "#c0392b",
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("glass", 0.0008),
        contactBoxes: [{ position: [0, 0, 0], size: [0.11, 0.14, 0.24] }],
        bearsLoad: false, sideAttachmentReach: 0.12,
      },
    );
  }

  // Номерные знаки — плоские, спереди и сзади, между рогами бампера.
  for (const [end, u, y] of [
    ["front", 0.02, DS_BUMPER_TOP_FRONT - 0.15],
    ["rear", 0.98, DS_BUMPER_TOP_REAR - 0.13],
  ] as const) {
    primitive(
      car, `plate:${end}`, "plastic", "panel",
      dsPoint(dsStationX(u), y, 0), [0.03, 0.11, 0.5], "#e8e4d8",
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("plastic", 0.0012),
        contactBoxes: [{ position: [0, 0, 0], size: [0.07, 0.15, 0.54] }],
        bearsLoad: false, sideAttachmentReach: 0.12,
      },
    );
  }

  // --- 9. Фары --------------------------------------------------------------
  // Четыре под общим стеклом. ВНУТРЕННЯЯ пара связана с рулевым: направление
  // берётся из того же паспорта, что и поворот колёс, поэтому свет и колёса
  // не могут разъехаться.
  for (const lamp of DS_HEADLAMP_STATIONS) {
    const position = dsPoint(lamp.point[0], lamp.point[1], lamp.point[2]);
    primitive(
      car,
      `headlamp:${lamp.id}`,
      "glass",
      "cylinder",
      position,
      // Лампа — КРУГЛАЯ и утоплена в крыло; наружу смотрит только общее
      // стекло. Плоские квадраты в габарит носа не помещались и торчали.
      [0.155, 0.05, 0.155],
      LAMP_GLASS,
      {
        rotation: rodRotation(1, 0, 0),
        volume: massVolume("glass", 0.0015),
        contactBoxes: [{ position: [0, 0, 0], size: [0.19, 0.09, 0.19] }],
        bearsLoad: false,
        sideAttachmentReach: 0.15,
      },
    );
    const direction = dsHeadlampDirection(lamp, 0);
    townBoulevardSpotLights.push({
      id: `${CLUSTER_SCENE}:${DS_GROUP}:headlamp:${lamp.id}:piece`,
      position: [
        position[0] + direction[0] * 0.06,
        position[1] - 0.01,
        position[2] + direction[1] * 0.06,
      ],
      direction: [direction[0], -0.06, direction[1]],
      carrierClusterId: DS_CLUSTER_ID,
      // Луч — тот же прибор, что у посадочных фар гексакоптера, и это не
      // экономия: свет одного мира обязан читаться одинаково. Отличается
      // только раскрытие — дальний свет автомобиля уже посадочного.
      color: "#ffeec6",
      distance: 68,
      intensity: 480,
      angle: lamp.directional ? 0.22 : 0.31,
      penumbra: 0.72,
      decay: 1.75,
      dayIntensityFactor: 0,
      transition: { fadeInSeconds: 0.7, fadeOutSeconds: 0.45 },
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

  // --- 9b. Мелочь, без которой машина выглядит макетом -----------------------
  //
  // Дворники, шевроны, лючок бака, выхлоп. Каждая вещь стоит на поверхности и
  // имеет видимое основание: деталь без крепления читается наклейкой.

  // ДВОРНИКИ лежат на лобовом у его основания, двумя параллельными пёрышками.
  for (const [side, z] of [["left", 0.34], ["right", -0.2]] as const) {
    const u = DS_COWL_U + 0.012;
    const [half, y] = dsSectionPoint(dsSection(u), DS_THETA_SHOULDER + 0.06);
    primitive(
      car, `wiper:${side}`, "steel", "steelSheet",
      dsPoint(dsStationX(u) + 0.06, y + 0.03, z),
      [0.03, 0.012, 0.46], "#26292c",
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", 0.0004),
        contactBoxes: [{ position: [0, 0, 0], size: [0.07, 0.05, 0.5] }],
        bearsLoad: false, sideAttachmentReach: 0.1,
      },
    );
    void half;
  }

  // ШЕВРОНЫ — двойная «птичка» Citroën на носу и на крышке багажника.
  for (const [end, u, y] of [
    ["nose", 0.03, 0.66],
    ["boot", 0.9, 0.86],
  ] as const) {
    for (const [index, offset] of [0, 0.055].entries()) {
      primitive(
        car, `badge:${end}:${index}`, "steel", "steelSheet",
        dsPoint(dsStationX(u), y + offset, 0),
        [0.02, 0.035, 0.19], CHROME,
        {
          rotation: orient(ALONG, UP),
          volume: massVolume("steel", 0.0002),
          contactBoxes: [{ position: [0, 0, 0], size: [0.06, 0.07, 0.23] }],
          bearsLoad: false, sideAttachmentReach: 0.08, ...BRIGHTWORK,
        },
      );
    }
  }

  // ЛЮЧОК БАКА на правом заднем крыле — бак стоит за задним диваном.
  {
    const u = 0.845;
    const [half, y] = dsSectionPoint(dsSection(u), DS_THETA_HAUNCH);
    primitive(
      car, "fuel-filler", "steel", "steelSheet",
      dsPoint(dsStationX(u), y, RIGHT * (half + 0.008)),
      [0.16, 0.16, 0.02], "#7d848a",
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", 0.0004),
        contactBoxes: [{ position: [0, 0, 0], size: [0.2, 0.2, 0.06] }],
        bearsLoad: false, sideAttachmentReach: 0.1,
      },
    );
  }

  // ВЫХЛОП: труба вдоль днища и наконечник из-под заднего бампера справа.
  primitive(
    car, "exhaust:pipe", "steel", "cylinder",
    dsPoint(0.6, 0.19, RIGHT * 0.34), [0.055, 2.2, 0.055], "#4a4e52",
    {
      rotation: rodRotation(1, 0, 0),
      volume: massVolume("steel", 0.006),
      contactBoxes: [{ position: [0, 0, 0], size: [2.24, 0.1, 0.1] }],
      bearsLoad: false, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 0.3,
    },
  );
  primitive(
    car, "exhaust:tip", "steel", "cylinder",
    dsPoint(dsStationX(0.975), 0.2, RIGHT * 0.34), [0.075, 0.16, 0.075], "#8e959a",
    {
      rotation: rodRotation(1, 0, 0),
      volume: massVolume("steel", 0.0012),
      contactBoxes: [{ position: [0, 0, 0], size: [0.2, 0.12, 0.12] }],
      bearsLoad: false, sideAttachmentReach: 0.12, ...BRIGHTWORK,
    },
  );

  // --- 10. Салон ------------------------------------------------------------
  // Просторный он не на словах: ровный пол — следствие того, что карданного
  // тоннеля у переднеприводной машины нет.
  primitive(
    car,
    "cabin:floor",
    "steel",
    "steelSheet",
    dsPoint(0.1, 0.38, 0),
    [2.6, 0.04, 1.36],
    SHADOW,
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("steel", 0.018),
      contactBoxes: [{ position: [0, 0, 0], size: [2.6, 0.08, 1.36] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.7,
      bearingArea: 1.4,
    },
  );
  // Впереди — ДВА РАЗДЕЛЬНЫХ КРЕСЛА, сзади диван. Прежняя сборка ставила
  // спереди диван во всю ширину; на фотографиях салона его нет.
  for (const [seat, x, offset, mass, width] of [
    ["front:left", -0.42, 0.34, 0.014, 0.5],
    ["front:right", -0.42, -0.34, 0.014, 0.5],
    ["rear", 0.86, 0, 0.018, 1.28],
  ] as const) {
    primitive(
      car,
      `seat:${seat}:cushion`,
      "cloth",
      "panel",
      dsPoint(x, 0.6, offset),
      [0.56, 0.16, width],
      CABIN,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("cloth", mass * 0.45),
        contactBoxes: [{ position: [0, 0, 0], size: [0.6, 0.2, width + 0.04] }],
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
    primitive(
      car,
      `seat:${seat}:back`,
      "cloth",
      "panel",
      dsPoint(x + 0.34, 0.86, offset),
      [0.12, 0.36, width],
      CABIN,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("cloth", mass * 0.55),
        contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.4, width + 0.04] }],
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
  }
  // ПРИБОРНАЯ ПАНЕЛЬ. По фотографии салона: глубокий мягкий козырёк, под ним
  // утопленный блок приборов в двух колодцах, справа полка во всю ширину.
  const trim = (
    id: string,
    x: number,
    y: number,
    z: number,
    size: SceneVector3,
    colour: string,
    mass: number,
    material: BreakableMaterial = "plastic",
    options: PrimitiveOptions = {},
  ): void => {
    primitive(car, id, material, "panel", dsPoint(x, y, z), size, colour, {
      rotation: orient(ALONG, UP),
      volume: massVolume(material, mass),
      contactBoxes: [{
        position: [0, 0, 0],
        size: [size[0] + 0.04, size[1] + 0.04, size[2] + 0.04],
      }],
      bearsLoad: false,
      sideAttachmentReach: 0.25,
      ...options,
    });
  };

  trim("dash:cowl", -0.95, 0.92, 0, [0.2, 0.1, 1.3], "#2f2a24", 0.005,
    "plastic", { carriesAttachments: true, attachmentSupportMode: "cable" });
  trim("dash:face", -0.86, 0.83, 0, [0.1, 0.2, 1.3], "#3b332a", 0.004);
  // Полка под панелью — та самая, обтянутая замшей.
  trim("dash:shelf", -0.78, 0.72, 0.12, [0.24, 0.05, 1.0], "#4a4238", 0.003);
  // Два колодца приборов перед водителем.
  for (const [id, z, size] of [
    ["speed", 0.42, [0.05, 0.15, 0.22]],
    ["group", 0.2, [0.05, 0.14, 0.18]],
  ] as const) {
    trim(`dash:dial:${id}`, -0.83, 0.86, z, size as SceneVector3,
      "#15130f", 0.001);
  }
  // Радио и часы в середине панели.
  trim("dash:radio", -0.83, 0.84, -0.1, [0.04, 0.09, 0.22], "#1d1a16", 0.001);
  // Центральная консоль с дефлекторами, уходящая к полу.
  trim("dash:console", -0.78, 0.6, 0.02, [0.16, 0.3, 0.24], "#26221d", 0.002);

  // СЕЛЕКТОР НА КОЛОНКЕ — тонкий рычаг над рулём, а не рычаг в полу:
  // коробка у машины гидравлическая, и в полу у неё ничего нет.
  primitive(
    car, "steering:selector", "steel", "cylinder",
    dsPoint(-0.8, 1.02, 0.24), [0.018, 0.2, 0.018], CHROME,
    {
      rotation: rodRotation(0.25, 0.1, 1),
      volume: massVolume("steel", 0.0006),
      contactBoxes: [{ position: [0, 0, 0], size: [0.06, 0.24, 0.06] }],
      bearsLoad: false, sideAttachmentReach: 0.12, ...BRIGHTWORK,
    },
  );
  // ГРИБОК ТОРМОЗА на полу — вместо педали. Второй такой машины нет.
  primitive(
    car, "pedal:brake", "plastic", "cylinder",
    dsPoint(-1.02, 0.46, 0.2), [0.07, 0.05, 0.07], "#1b1815",
    {
      volume: massVolume("plastic", 0.0004),
      contactBoxes: [{ position: [0, 0, 0], size: [0.11, 0.09, 0.11] }],
      bearsLoad: false, sideAttachmentReach: 0.1,
    },
  );
  trim("pedal:throttle", -1.02, 0.44, 0.44, [0.16, 0.02, 0.06],
    "#201d19", 0.0003);

  // ОБИВКА ДВЕРЕЙ и потолок: изнутри машина не должна быть голой оболочкой.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    for (const [door, u0, u1] of [
      ["front", DS_DOOR_FRONT_U, DS_DOOR_MIDDLE_U],
      ["rear", DS_DOOR_MIDDLE_U, DS_DOOR_REAR_U],
    ] as const) {
      const flip = side === RIGHT;
      const card = gridMesh(8, 3, (su, sh) => {
        const u = u0 + (u1 - u0) * su;
        const [half, y] = dsSectionPoint(
          dsSection(u),
          DS_THETA_WAIST + (DS_THETA_SHOULDER - DS_THETA_WAIST) * sh,
        );
        return dsPoint(dsStationX(u), y, side * (half - 0.035));
      }, !flip);
      surfacePatch(car, `door:card:${door}:${name}`, "cloth", "panel",
        card.vertices, card.indices, CABIN, 0.003,
        { carriesAttachments: false });
    }
  }
  const headliner = gridMesh(12, 8, (su, sh) => {
    const u = DS_ROOF_FRONT_U + (DS_ROOF_REAR_U - DS_ROOF_FRONT_U) * su;
    const across = -1 + 2 * sh;
    const side = across >= 0 ? LEFT : RIGHT;
    const t = DS_THETA_ROOF_EDGE
      + (1 - DS_THETA_ROOF_EDGE) * (1 - across * across);
    const [half, y] = dsSectionPoint(dsSection(u), t);
    return dsPoint(dsStationX(u), y - 0.03, side * half * 0.96);
  });
  surfacePatch(car, "headliner", "cloth", "panel",
    headliner.vertices, headliner.indices, "#cfc7b6", 0.006,
    { carriesAttachments: false });
  // ОДНОРЫЧАЖНЫЙ РУЛЬ Ø400 — размер снят с заводского чертежа, и это, пожалуй,
  // самая узнаваемая вещь в салоне. Обод собран из дуг, а спица ОДНА и уходит
  // от ступицы ВНИЗ: сплошной диск такой руль не изображает.
  const WHEEL_TILT = 0.5;
  const wheelAxis = rodRotation(Math.cos(WHEEL_TILT), Math.sin(WHEEL_TILT), 0);
  const wheelHub: SceneVector3 = [-0.72, 0.94, 0.34];
  const RIM_RADIUS = 0.2;
  for (let arc = 0; arc < 10; arc += 1) {
    const angle = (arc / 10) * Math.PI * 2;
    // Обод лежит в плоскости, наклонённой вместе с колонкой: точка обода
    // получается поворотом вокруг оси наклона, а не выписыванием синусов.
    const flat: SceneVector3 = [
      Math.sin(angle) * RIM_RADIUS * Math.sin(WHEEL_TILT),
      Math.sin(angle) * RIM_RADIUS * Math.cos(WHEEL_TILT),
      Math.cos(angle) * RIM_RADIUS,
    ];
    primitive(
      car, `steering:rim:${arc}`, "plastic", "cylinder",
      dsPoint(wheelHub[0] + flat[0], wheelHub[1] + flat[1], wheelHub[2] + flat[2]),
      [0.026, 0.13, 0.026], "#2f2a24",
      {
        rotation: rodRotation(
          Math.cos(angle + Math.PI / 2) * 0,
          Math.cos(angle + Math.PI / 2),
          -Math.sin(angle + Math.PI / 2),
        ),
        volume: massVolume("plastic", 0.0004),
        contactBoxes: [{ position: [0, 0, 0], size: [0.07, 0.16, 0.07] }],
        bearsLoad: false, sideAttachmentReach: 0.1,
      },
    );
  }
  // Единственная спица — широкая пластина от ступицы к низу обода.
  primitive(
    car, "steering:spoke", "plastic", "panel",
    dsPoint(
      wheelHub[0] - RIM_RADIUS * 0.5 * Math.sin(WHEEL_TILT),
      wheelHub[1] - RIM_RADIUS * 0.5 * Math.cos(WHEEL_TILT),
      wheelHub[2],
    ),
    [0.05, 0.2, 0.07], "#2f2a24",
    {
      rotation: wheelAxis,
      volume: massVolume("plastic", 0.0015),
      contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.24, 0.11] }],
      bearsLoad: false, sideAttachmentReach: 0.12,
    },
  );
  primitive(
    car, "steering:boss", "plastic", "cylinder",
    dsPoint(...wheelHub), [0.075, 0.05, 0.075], "#23201c",
    {
      rotation: wheelAxis,
      volume: massVolume("plastic", 0.0008),
      contactBoxes: [{ position: [0, 0, 0], size: [0.11, 0.09, 0.11] }],
      bearsLoad: false, sideAttachmentReach: 0.1,
    },
  );
  primitive(
    car,
    "steering:column",
    "steel",
    "cylinder",
    dsPoint(-0.81, 0.9, 0.34),
    [0.05, 0.28, 0.05],
    SHADOW,
    {
      rotation: rodRotation(Math.cos(0.5), Math.sin(0.5), 0),
      volume: massVolume("steel", 0.003),
      contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.28, 0.09] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.2,
    },
  );
}

createDs();

export const townBoulevardDocument = {
  schemaVersion: 1 as const,
  id: CLUSTER_SCENE,
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
