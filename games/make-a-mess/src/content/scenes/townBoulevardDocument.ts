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
  DS_HUB_HEIGHT,
  DS_NOSE_X,
  DS_REAR_AXLE_X,
  DS_SCENE_ID,
  DS_TAIL_X,
  DS_TYRE_HALF_WIDTH,
  DS_WHEEL_RADIUS,
  DS_WHEEL_STATIONS,
  dsHalfWidth,
  dsHeadlampDirection,
  dsPoint,
  dsSillHeight,
  dsStationOf,
  dsStationX,
  dsTopHeight,
} from "../../game/townCitroenDs.ts";

// ---------------------------------------------------------------------------
// СЕДАН «DS» НА ГЛАВНОЙ УЛИЦЕ
//
// Полный паспорт образа и физики — в шапке `game/townCitroenDs.ts`. Здесь
// только сборка:
//
//   1. платформа — единственный корень устойчивости;
//   2. силовой агрегат впереди (развесовка 65/35);
//   3. подрамники;
//   4. оболочка — visualMesh из функций профиля (как у гексакоптера/sky-ram),
//      а не стопка steelSheet-коробок;
//   5. остекление из той же поверхности;
//   6. колёса-актуаторы, бампера, фары, салон.
//
// Мины (transport-lessons): contactBoxes локальные; ориентации через
// orient()/rodRotation(); окно опоры у каждого куска — сантиметры, иначе
// асфальт станет вторым корнем.
//
// БЮДЖЕТ МАССЫ: каждому узлу задана масса в тоннах, `volume` — обратно из
// плотности. Снаряжённая машина: 1.33.
// ---------------------------------------------------------------------------

const CLUSTER_SCENE = DS_SCENE_ID;
const DS_GROUP = DS_CLUSTER_ID.slice(CLUSTER_SCENE.length + 1);

// --- Палитра ---------------------------------------------------------------
// Кузов песочный, крыша светлее и матовее — она не стальная. Хром узкий:
// у этой машины его мало, и он подчёркивает линии, а не заменяет их.
const BODY = "#c6bda6";
const BODY_DARK = "#a89f8a";
const ROOF = "#efece3";
const CHROME = "#c4c9ce";
const SHADOW = "#2b2d2f";
const GLASS = "#93a9ad";
const TYRE = "#1e1f21";
const LAMP_GLASS = "#fff3d2";
const CABIN = "#5c4b3a";

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
// ПОВЕРХНОСТЬ
//
// Обвод задан функциями профиля. Геометрия кузова — выборка ЭТИХ функций в
// visualMesh (паттерн гексакоптера / sky-ram). Правка образа = правка станции
// профиля, а не пересборка полусотни коробок.
// ---------------------------------------------------------------------------

/** Точка борта: u вдоль длины, h от порога (0) к верхней линии (1). */
function bodySidePoint(u: number, h: number, side: number): SceneVector3 {
  const sill = dsSillHeight(u);
  const top = dsTopHeight(u);
  let y = sill + (top - sill) * Math.max(0, Math.min(1, h));
  // Передняя арка: юбка открыта над колесом. Зад закрыт щитком — арки нет.
  const dx = dsStationX(u) - DS_FRONT_AXLE_X;
  const arch = DS_WHEEL_RADIUS + 0.06;
  if (Math.abs(dx) < arch) {
    const archY = DS_HUB_HEIGHT + Math.sqrt(Math.max(0, arch * arch - dx * dx)) * 0.92;
    if (y < archY) y = archY;
  }
  return dsPoint(dsStationX(u), y, side * dsHalfWidth(u));
}

/** Точка палубы (капот / крыша / багажник): lateral ∈ [−1, 1]. */
function deckPoint(u: number, lateral: number, widthScale = 1): SceneVector3 {
  return dsPoint(
    dsStationX(u),
    dsTopHeight(u),
    lateral * dsHalfWidth(u) * widthScale,
  );
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

// ---------------------------------------------------------------------------
// СБОРКА
// ---------------------------------------------------------------------------

const REAR_AXLE_U = dsStationOf(DS_REAR_AXLE_X);
/** Стекло начинается с лобового и кончается задним. */
const SCREEN_U = 0.31;
const CABIN_FRONT_U = 0.41;
const CABIN_REAR_U = 0.71;
const BACKLIGHT_U = 0.82;
/** Поясная линия: доля высоты борта, ниже которой борт стальной. */
const BELT = 0.6;

function createDs(): void {
  const car = group(DS_GROUP, "Citroen DS on the main street", "steel", "linked");

  // --- 1. Платформа: парящий фундамент решателя -----------------------------
  // Материал `earth` не про землю, а про роль: у решателя это единственный
  // корень, который имеет право висеть. Физически это несущая платформа —
  // та самая, на которую у этой машины навешивается вообще всё, и с которой
  // её можно раздеть до голого шасси, не уронив.
  //
  // Контактная коробка накрывает пояс машины, но НЕ достаёт до асфальта:
  // иначе дорожная разметка нашла бы в платформе опору и уезжала бы вместе
  // с машиной.
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
      volume: massVolume("earth", 0.186),
      contactBoxes: [{ position: [0, 0, 0], size: [4.6, 1.0, 1.78] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.9,
      bearingArea: 3.2,
    },
  );

  // Лонжероны: цепь нагрузки от платформы к обоим подрамникам. Тонкие и
  // УБРАННЫЕ ЗА ЮБКУ — низ каждого лежит выше самой низкой точки порога,
  // поэтому сбоку их не видно ни в одном ракурсе. Силовой набор летающей
  // машины можно показывать, у дорожной он спрятан под кузов, и толщина у
  // него совсем другая: у луча гексакоптера 0.22, здесь 0.09.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    primitive(
      car,
      `frame:rail:${name}`,
      "steel",
      "steelSheet",
      dsPoint((DS_NOSE_X + DS_TAIL_X) / 2 - 0.1, platformY + 0.03, side * 0.48),
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
    { id: "gearbox", x: -2.0, y: 0.47, size: [0.5, 0.3, 0.5], mass: 0.105, color: SHADOW },
    { id: "final-drive", x: -1.72, y: 0.46, size: [0.28, 0.34, 0.62], mass: 0.05, color: SHADOW },
    { id: "engine:block", x: -1.22, y: 0.53, size: [0.72, 0.6, 0.56], mass: 0.245, color: "#3a3d40" },
    // Насос высокого давления: сердце гидропневматики и единственный узел,
    // объясняющий, почему машина умеет менять посадку.
    { id: "hydraulics:pump", x: -0.95, y: 0.62, size: [0.2, 0.24, 0.2], mass: 0.02, color: "#4a4237" },
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
    dsPoint(1.15, 0.42, 0),
    [0.7, 0.24, 1.1],
    "#43423d",
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("steel", 0.025),
      contactBoxes: [{ position: [0, 0, 0], size: [0.74, 0.28, 1.14] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
    },
  );

  // --- 3. Подрамники и стойки ----------------------------------------------
  for (const axle of ["front", "rear"] as const) {
    const x = axle === "front" ? DS_FRONT_AXLE_X : DS_REAR_AXLE_X;
    const track = axle === "front" ? 1.5 : 1.3;
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

  // --- 4–6. Оболочка, палубы, остекление ------------------------------------
  // Одна поверхность профиля → visualMesh. Никаких стыкуемых коробок.
  const SIDE_U0 = 0.012;
  const SIDE_U1 = 0.988;
  const SIDE_COLS = 28;
  const SIDE_ROWS = 8;

  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    // Нижний борт + пояс — непрерывная стальная юбка с передней аркой.
    const lower = gridMesh(SIDE_COLS, SIDE_ROWS, (su, sh) => {
      const u = SIDE_U0 + (SIDE_U1 - SIDE_U0) * su;
      return bodySidePoint(u, sh * BELT, side);
    }, flip);
    surfacePatch(
      car,
      `skin:${name}:lower`,
      "steel",
      "steelSheet",
      lower.vertices,
      lower.indices,
      BODY_DARK,
      0.055,
      // НЕСУЩАЯ панель. У кузова без рамы борт и есть конструкция: на нём
      // стоят стойки, на стойках крыша. Объявишь его ненесущим — весь верх
      // машины обрушится на старте и ляжет под колёса.
      { bearsLoad: true },
    );
    // Боковина капота (впереди салона).
    const hoodSide = gridMesh(10, 5, (su, sh) => {
      const u = SIDE_U0 + (SCREEN_U - SIDE_U0) * su;
      return bodySidePoint(u, BELT + (0.98 - BELT) * sh, side);
    }, flip);
    surfacePatch(
      car,
      `skin:${name}:hood`,
      "steel",
      "steelSheet",
      hoodSide.vertices,
      hoodSide.indices,
      BODY,
      0.012,
      { bearsLoad: true },
    );
    // Заднее крыло выше пояса (за салоном).
    const quarter = gridMesh(10, 5, (su, sh) => {
      const u = BACKLIGHT_U + (SIDE_U1 - BACKLIGHT_U) * su;
      return bodySidePoint(u, BELT + (0.98 - BELT) * sh, side);
    }, flip);
    surfacePatch(
      car,
      `skin:${name}:quarter`,
      "steel",
      "steelSheet",
      quarter.vertices,
      quarter.indices,
      BODY,
      0.011,
      { bearsLoad: true },
    );
    // Щиток заднего колеса — отделяемый, без него машина не она.
    const spat = gridMesh(8, 5, (su, sh) => {
      const u = REAR_AXLE_U - 0.06 + 0.12 * su;
      return bodySidePoint(u, 0.02 + 0.4 * sh, side);
    }, flip);
    surfacePatch(
      car,
      `spat:${name}`,
      "steel",
      "steelSheet",
      spat.vertices,
      spat.indices,
      BODY,
      0.007,
      { carriesAttachments: false },
    );
  }

  // Гладкий лоб без решётки: воздух — низкой щелью под бампером.
  const nose = gridMesh(10, 6, (su, sh) => {
    const lateral = -1 + 2 * su;
    const u = 0.004 + 0.03 * sh;
    const sill = dsSillHeight(u);
    const top = dsTopHeight(u);
    return dsPoint(
      dsStationX(u),
      sill + (top - sill) * (0.35 + 0.55 * sh),
      lateral * dsHalfWidth(u) * (0.7 + 0.3 * sh),
    );
  });
  surfacePatch(car, "nose:cap", "steel", "steelSheet", nose.vertices, nose.indices, BODY, 0.022);
  primitive(
    car,
    "nose:intake",
    "steel",
    "steelSheet",
    dsPoint(dsStationX(0.006), 0.4, 0),
    [0.12, 0.06, 1.1],
    SHADOW,
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("steel", 0.004),
      contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.1, 1.14] }],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    },
  );

  const bonnet = gridMesh(14, 8, (su, sh) => {
    const u = 0.04 + (SCREEN_U - 0.04) * su;
    return deckPoint(u, -1 + 2 * sh, 0.92);
  });
  surfacePatch(car, "bonnet", "steel", "steelSheet", bonnet.vertices, bonnet.indices, BODY, 0.04);

  const boot = gridMesh(10, 7, (su, sh) => {
    const u = BACKLIGHT_U + (0.96 - BACKLIGHT_U) * su;
    return deckPoint(u, -1 + 2 * sh, 0.9);
  });
  surfacePatch(car, "boot:lid", "steel", "steelSheet", boot.vertices, boot.indices, BODY, 0.022);

  const tail = gridMesh(10, 6, (su, sh) => {
    const lateral = -1 + 2 * su;
    const u = 0.96 + 0.035 * sh;
    const sill = dsSillHeight(u);
    const top = dsTopHeight(u);
    return dsPoint(
      dsStationX(u),
      sill + (top - sill) * (0.3 + 0.6 * (1 - sh)),
      lateral * dsHalfWidth(u) * (0.85 - 0.2 * sh),
    );
  });
  surfacePatch(car, "tail:cap", "steel", "steelSheet", tail.vertices, tail.indices, BODY, 0.016);

  // Крыша — светлый пластик, не сталь.
  const roof = gridMesh(12, 7, (su, sh) => {
    const u = CABIN_FRONT_U + (CABIN_REAR_U - CABIN_FRONT_U) * su;
    return deckPoint(u, -1 + 2 * sh, 0.82);
  });
  surfacePatch(car, "roof", "plastic", "panel", roof.vertices, roof.indices, ROOF, 0.021);

  // Стёкла — из тех же станций профиля, что и кузов.
  const windscreen = gridMesh(10, 5, (su, sh) => {
    const u = SCREEN_U + (CABIN_FRONT_U - SCREEN_U) * sh;
    const widthScale = 0.78 + 0.04 * sh;
    return deckPoint(u, (-1 + 2 * su) * widthScale, 1);
  });
  surfacePatch(
    car,
    "glass:windscreen",
    "glass",
    "glassPane",
    windscreen.vertices,
    windscreen.indices,
    GLASS,
    0.018,
    { carriesAttachments: false },
  );
  const backlight = gridMesh(10, 5, (su, sh) => {
    const u = CABIN_REAR_U + (BACKLIGHT_U - CABIN_REAR_U) * sh;
    const widthScale = 0.8 - 0.06 * sh;
    return deckPoint(u, (-1 + 2 * su) * widthScale, 1);
  });
  surfacePatch(
    car,
    "glass:backlight",
    "glass",
    "glassPane",
    backlight.vertices,
    backlight.indices,
    GLASS,
    0.015,
    { carriesAttachments: false },
  );

  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    const sideGlass = gridMesh(12, 4, (su, sh) => {
      const u = CABIN_FRONT_U + (CABIN_REAR_U - CABIN_FRONT_U) * su;
      return bodySidePoint(u, BELT + (0.97 - BELT) * sh, side);
    }, flip);
    surfacePatch(
      car,
      `glass:side:${name}`,
      "glass",
      "glassPane",
      sideGlass.vertices,
      sideGlass.indices,
      GLASS,
      0.008,
      { carriesAttachments: false },
    );
    for (const [pillar, u] of [
      ["a", CABIN_FRONT_U],
      ["b", 0.56],
      ["c", CABIN_REAR_U],
    ] as const) {
      const post = gridMesh(2, 4, (su, sh) => {
        const uu = u - 0.012 + 0.024 * su;
        return bodySidePoint(uu, BELT - 0.02 + (1.0 - (BELT - 0.02)) * sh, side);
      }, flip);
      surfacePatch(
        car,
        `pillar:${name}:${pillar}`,
        "steel",
        "steelSheet",
        post.vertices,
        post.indices,
        pillar === "b" ? BODY : ROOF,
        0.003,
        // Стойка несёт крышу — иначе крыша и стёкла не держатся ни на чём.
        { bearsLoad: true },
      );
    }
  }

  // --- 7. Колёса ------------------------------------------------------------
  // Колесо — АКТУАТОР, и у него есть required core: ступица. Потеряли шину —
  // осталась голая ступица и никакой тяги; потеряли ступицу — канала нет
  // вовсе, и никакая уцелевшая резина этого не исправит.
  for (const station of DS_WHEEL_STATIONS) {
    const channel = `wheel:${station.id}`;
    const hub = dsPoint(station.hub[0], station.hub[1], station.hub[2]);
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
            size: [DS_WHEEL_RADIUS * 2 + 0.02, DS_TYRE_HALF_WIDTH * 2 + 0.02, DS_WHEEL_RADIUS * 2 + 0.02],
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
      dsPoint(axleX, station.hub[1] - 0.05, station.hub[2] / 2),
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
  for (const [end, x, mass] of [
    ["front", dsStationX(0.004), 0.02],
    ["rear", dsStationX(0.996), 0.013],
  ] as const) {
    primitive(
      car,
      `bumper:${end}`,
      "steel",
      "steelSheet",
      dsPoint(x, 0.5, 0),
      [0.1, 0.14, 2 * dsHalfWidth(end === "front" ? 0.05 : 0.95)],
      CHROME,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("steel", mass),
        contactBoxes: [
          {
            position: [0, 0, 0],
            size: [0.16, 0.2, 2 * dsHalfWidth(end === "front" ? 0.05 : 0.95) + 0.04],
          },
        ],
        bearsLoad: false,
        carriesAttachments: false,
        sideAttachmentReach: 0.25,
      },
    );
  }

  // --- 9. Фары --------------------------------------------------------------
  // Четыре под общим стеклом. ВНУТРЕННЯЯ пара связана с рулевым: направление
  // берётся из того же паспорта, что и поворот колёс, поэтому свет и колёса
  // не могут разъехаться. Здесь машина стоит, руль прямой — луч смотрит по
  // носу; рантайм будет двигать источник вместе с рулём.
  for (const lamp of DS_HEADLAMP_STATIONS) {
    const position = dsPoint(lamp.point[0], lamp.point[1], lamp.point[2]);
    primitive(
      car,
      `headlamp:${lamp.id}`,
      "glass",
      "glassPane",
      position,
      [0.05, 0.2, 0.2],
      LAMP_GLASS,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("glass", 0.002),
        contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.24, 0.24] }],
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
  // Общее стекло блока фар: лежит в обводе, а не торчит наружу.
  for (const side of [LEFT, RIGHT]) {
    const name = side === LEFT ? "left" : "right";
    const flip = side === RIGHT;
    const cover = gridMesh(4, 3, (su, sh) => {
      const u = 0.02 + 0.04 * sh;
      const z = side * (0.18 + 0.4 * su);
      return dsPoint(dsStationX(u), 0.58 + 0.16 * sh, z);
    }, flip);
    surfacePatch(
      car,
      `headlamp:cover:${name}`,
      "glass",
      "glassPane",
      cover.vertices,
      cover.indices,
      "#d8e2df",
      0.004,
      { carriesAttachments: false },
    );
  }

  // --- 10. Салон ------------------------------------------------------------
  // Просторный он не на словах: диван во всю ширину и ровный пол — следствие
  // того, что карданного тоннеля у переднеприводной машины нет.
  primitive(
    car,
    "cabin:floor",
    "steel",
    "steelSheet",
    dsPoint(0.0, 0.38, 0),
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
  for (const [seat, x, mass] of [
    ["front", -0.55, 0.028],
    ["rear", 0.72, 0.018],
  ] as const) {
    primitive(
      car,
      `seat:${seat}:cushion`,
      "cloth",
      "panel",
      dsPoint(x, 0.62, 0),
      [0.56, 0.16, 1.28],
      CABIN,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("cloth", mass * 0.45),
        contactBoxes: [{ position: [0, 0, 0], size: [0.6, 0.2, 1.32] }],
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
    primitive(
      car,
      `seat:${seat}:back`,
      "cloth",
      "panel",
      dsPoint(x + 0.34, 0.86, 0),
      [0.12, 0.34, 1.28],
      CABIN,
      {
        rotation: orient(ALONG, UP),
        volume: massVolume("cloth", mass * 0.55),
        contactBoxes: [{ position: [0, 0, 0], size: [0.16, 0.38, 1.32] }],
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
  }
  primitive(
    car,
    "dashboard",
    "plastic",
    "panel",
    dsPoint(-1.02, 0.84, 0),
    [0.24, 0.14, 1.3],
    "#3b332a",
    {
      rotation: orient(ALONG, UP),
      volume: massVolume("plastic", 0.018),
      contactBoxes: [{ position: [0, 0, 0], size: [0.28, 0.18, 1.34] }],
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
    },
  );
  // Однорычажный руль — ещё одна вещь, которой нет больше ни у кого.
  primitive(
    car,
    "steering:wheel",
    "plastic",
    "cylinder",
    dsPoint(-0.86, 0.94, 0.34),
    [0.4, 0.03, 0.4],
    "#2f2a24",
    {
      rotation: rodRotation(Math.cos(0.5), Math.sin(0.5), 0),
      volume: massVolume("plastic", 0.005),
      contactBoxes: [{ position: [0, 0, 0], size: [0.42, 0.06, 0.42] }],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    },
  );
  primitive(
    car,
    "steering:column",
    "steel",
    "cylinder",
    dsPoint(-0.95, 0.9, 0.34),
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
