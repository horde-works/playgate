import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  DC3_HEIGHT_TAIL_DOWN,
  DC3_LENGTH,
  DC3_PROPELLER_DIAMETER,
  DC3_WINGSPAN,
} from "./dc3Dimensions.ts";

type Dc3View = ObjectLabView & { readonly up?: ObjectPoint };
type SurfaceHinge = {
  readonly group: string;
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  readonly range: { readonly minDegrees: number; readonly maxDegrees: number };
  readonly restDegrees: number;
};
type PropellerShaft = {
  readonly group: "propeller-left" | "propeller-right";
  /** Rest-pose shaft frame in canonical object coordinates. */
  readonly pivot: ObjectPoint;
  readonly axis: ObjectPoint;
  /** Positive phase is clockwise when viewed from behind the engine. */
  readonly phaseSign: 1 | -1;
};
type Dc3BlockoutModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<
    Record<string, Readonly<Record<string, number | boolean>>>
  >;
  readonly propellerShafts: Readonly<Record<"left" | "right", PropellerShaft>>;
  readonly surfaceHinges: Readonly<Record<string, SurfaceHinge>>;
  readonly views: readonly Dc3View[];
};

/**
 * Shape-only DC-3 sitting three-point. Published span, length, tail-down
 * height and propeller diameter own the envelope. Station tables, dihedral
 * and nacelle placement are authored from the type, not a manufacturer
 * drawing. The nose follows NASM stills: blunt snout, raked greenhouse,
 * no hanging chin. The fin follows NASM A19530075000: long convex
 * dorsal, rounded tip, nearly vertical trailing edge — one loft, not
 * a trapezoid slab. The core is a skin-on-frame cage inside the
 * lofts: three spars, wing formers, frames, longerons and stringers.
 * Skins stay filled and sit outside the cage. Ailerons, flaps,
 * elevator and rudder are cut from the lofts as hinged leaves.
 * Windows, doors, livery and world placement stay out.
 */

const RING = 20;
const AIRFOIL = 12;
const ROOT_CHORD = 4.42;
const TIP_CHORD = 1.56;
const ROOT_LE = 1.18;
const TIP_LE = 0.22;
const WING_BREAK = 5.2;
const OUTER_DIHEDRAL = (5 * Math.PI) / 180;
const ENGINE_X = 5.79;
const PROP_RADIUS = DC3_PROPELLER_DIAMETER / 2;
const PROP_BLADES = 3;
const PROP_PHASE = (22 * Math.PI) / 180;
const PROP_PITCH = (24 * Math.PI) / 180;
/**
 * ЛОПАСТИ РАСТУТ ИЗ КОКА, А НЕ ВИСЯТ ПЕРЕД НИМ.
 *
 * Плоскость вращения стояла на 3.1, а кок нарисован от 2.56 до 2.92: три
 * лопасти висели в восемнадцати сантиметрах впереди него, ни к чему не
 * прикреплённые. Теперь плоскость — середина кока, а комель (`PROP_ROOT_RADIUS`)
 * уходит ВНУТРЬ его радиуса 0.32, то есть скрыт обтекателем, как на машине.
 */
// ВИНТ ВПЕРЕДИ КАПОТА, А НЕ В НЁМ.
//
// Было 2.74 — на два сантиметра впереди среза капота, и пока срез был плоским
// этого хватало. Скруглённая губа NACA вынесла капот вперёд до 2.806, и
// лопасти оказались ВНУТРИ кожуха. Плоскость винта отодвинута за апекс губы
// с запасом; вал при этом тоньше — комель лопасти на настоящей машине
// заметно уже кока.
const PROP_HUB_Z = 3.06;
const PROP_ROOT_RADIUS = 0.12;
const COWL_OUTER = 0.68;
const COWL_INNER = 0.57;
const COWL_FRONT_Z = 2.72;
const COWL_AFT_Z = 1.2;
const ENGINE_CYLINDERS = 9;
const ENGINE_Z = 1.88;
const NOSE_Z = 7.4;
const TAIL_Z = NOSE_Z - DC3_LENGTH;
/**
 * Длина эрмита накладки до бывшего острия. Не продолжение таблицы станций:
 * обвод последних двух колец (касательная). Сетка в точку не сходится —
 * острый конец меняет полуэллипс оставшегося овала.
 */
const NOSE_CAP_LENGTH = 0.18;
/** Последнее эрмитово кольцо; дальше — круглое навершие, не игла. */
const NOSE_CAP_CUT_T = 0.64;
const SKIN_INSET = 0.12;
/** Проём двух центральных стёкол: шкура разрезана, ядро сюда не входит. */
const GREENHOUSE_Z_AFT = 6.15;
const GREENHOUSE_Z_FORE = 6.5;
/** Ядро обрывается за боковым стеклом, не в его проёме (~5.64). */
const COCKPIT_CAGE_AFT_Z = 5.5;
/** Последнее кольцо крыши: к нему сходится округлый второй сегмент лба. */
const BROW_FAIRING_APEX_Z = 5.8;
/** Первое кольцо колпака: на нём сидят передние края порожных треугольников. */
const SILL_FAIRING_APEX_Z = 6.85;
const SPAR_FRONT = 0.18;
const SPAR_MAIN = 0.38;
const SPAR_REAR = 0.7;
const SPAR_WEB = 0.08;
const LONGERON_HALF = 0.016;
const STRINGER_HALF = 0.009;
const WING_JOINT = ENGINE_X + 0.85;
const HINGE_GAP_T = 0.012;
const FLAP_INNER_IN = 1.58;
const FLAP_INNER_OUT = 5;
const FLAP_OUTER_IN = 6.58;
const FLAP_OUTER_OUT = 8.55;
const WING_HALF = DC3_WINGSPAN / 2;
/**
 * Неподвижный колпак законцовки: элерон кончается раньше, и уже за ним
 * четверть эллипса закрывает и носок, и заднюю кромку. Толщина профиля
 * сходит вместе с хордой: сбоку это одна округлая кромка, а не срезанный
 * аэропрофиль. На стабилизаторе руль высоты по-прежнему доходит до законцовки.
 */
const WING_TIP_CAP = 0.52;
const WING_TIP_ROUND = WING_TIP_CAP;
const AILERON_IN = 8.72;
const AILERON_OUT = WING_HALF - WING_TIP_CAP;
const FIN_HINGE_T = 0.6;
const RUDDER_Y0 = 1.25;
const RUDDER_Y1 = 4.55;
const STAB_HINGE_T = 0.72;
const STAB_HALF = 3.25;
const STAB_TIP_CHORD = 1.02;
const STAB_TIP_ROUND = STAB_HINGE_T * STAB_TIP_CHORD;
const ELEV_IN = 0.42;
const ELEV_OUT = STAB_HALF;
const FLAP_DOWN_DEGREES = -42;
const AILERON_RANGE = 25;
const ELEVATOR_DOWN = -22;
const ELEVATOR_UP = 18;
const RUDDER_RANGE = 25;
const FLOOR_Y = 0.36;
const GEAR_BODY_Z = 0.2;
const TAILWHEEL_BODY_Y = -0.52;
const TAILWHEEL_BODY_Z = -11.05;

type Station = {
  readonly z: number;
  readonly halfWidth: number;
  readonly crown: number;
  readonly keel: number;
  readonly upperPower?: number;
  readonly faceForward?: number;
};

const FUSELAGE_STATIONS: readonly Station[] = [
  // КАБИНА ФИКСИРОВАНА. КОЛПАК — ПУЛЯ ОТ ПОРОГА СТЕКЛА К ТУПОМУ КОНЧИКУ.
  //
  // Крыша держится до z=5.15, затем мягкий скат к z=5.8. Овальная губа не
  // становится двумя прямыми бровями: стык — лобовой треугольник (панель
  // временно снята, пока не ясен аккуратный стык), задний край на кольце 5.8,
  // основание — верхние рамы. Тупое стекло на палубу z=6.5 — полотна.
  // Колпак не от порога: ленивая палуба до z=6.85, дальше два порожных
  // треугольника. Скулы вокруг бокового стекла сняты — сначала обвод.
  //
  // Поперечник: салон — овал. К стеклу верхняя половина сплющивается
  // (ленивая макушка, крутые плечи). Колпак у стёкол — заметный овал,
  // не круглая труба; к кончику снова овал. Крышу не поднимаем, полку
  // не делаем, киль остаётся эллипсом. upperPower=2 — овал; больше 3 — коробка.
  { z: NOSE_Z, halfWidth: 0.32, crown: 0.26, keel: -0.24, upperPower: 2 },
  { z: 7.15, halfWidth: 0.82, crown: 0.61, keel: -0.62, upperPower: 2.8 },
  { z: 6.85, halfWidth: 0.96, crown: 0.76, keel: -0.84, upperPower: 2.9 },
  { z: 6.5, halfWidth: 0.98, crown: 0.8, keel: -0.92, upperPower: 2.9 },
  { z: 6.15, halfWidth: 1.03, crown: 1.18, keel: -1.06, upperPower: 2.9 },
  { z: 5.8, halfWidth: 1.08, crown: 1.26, keel: -1.14, upperPower: 2.7 },
  { z: 5.15, halfWidth: 1.18, crown: 1.4, keel: -1.22, upperPower: 2.4 },
  { z: 4.3, halfWidth: 1.24, crown: 1.4, keel: -1.26, upperPower: 2 },
  { z: 2.35, halfWidth: 1.37, crown: 1.4, keel: -1.36 },
  { z: 0, halfWidth: 1.37, crown: 1.38, keel: -1.36 },
  { z: -2.85, halfWidth: 1.32, crown: 1.32, keel: -1.3 },
  { z: -6.15, halfWidth: 1.08, crown: 1.12, keel: -1.0 },
  { z: -9.15, halfWidth: 0.68, crown: 0.84, keel: -0.48 },
  { z: -11.35, halfWidth: 0.3, crown: 0.54, keel: -0.16 },
  { z: TAIL_Z, halfWidth: 0.1, crown: 0.4, keel: -0.05 },
];

function mixOptional(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a == null && b == null) return undefined;
  if (a == null) return b;
  if (b == null) return a;
  return a * (1 - t) + b * t;
}

function sampleStation(z: number): Station {
  if (z >= FUSELAGE_STATIONS[0].z) return FUSELAGE_STATIONS[0];
  const last = FUSELAGE_STATIONS[FUSELAGE_STATIONS.length - 1];
  if (z <= last.z) return last;
  for (let index = 0; index < FUSELAGE_STATIONS.length - 1; index += 1) {
    const a = FUSELAGE_STATIONS[index];
    const b = FUSELAGE_STATIONS[index + 1];
    if (z <= a.z && z >= b.z) {
      const t = (a.z - z) / (a.z - b.z);
      return {
        z,
        halfWidth: a.halfWidth * (1 - t) + b.halfWidth * t,
        crown: a.crown * (1 - t) + b.crown * t,
        keel: a.keel * (1 - t) + b.keel * t,
        upperPower: mixOptional(a.upperPower, b.upperPower, t),
        faceForward: mixOptional(a.faceForward, b.faceForward, t),
      };
    }
  }
  return last;
}

function sampleCrown(z: number): number {
  return sampleStation(z).crown;
}

/**
 * ШАГ ШПАНГОУТА В САЛОНЕ ПОД ИЛЛЮМИНАТОРЫ — ОТКРЫТЫЙ ВОПРОС, НЕ ЗАБЫТЫЙ.
 *
 * Сейчас в салоне шпангоуты стоят через 1.95, 2.35, 2.85 и 3.30 м, а окно
 * этого типа идёт примерно через метр: врезать иллюминатор некуда, он
 * оказывается посреди трёхметрового пролёта.
 *
 * Уплотнение было сделано и ОТКАЧЕНО 15.08.2026, потому что упёрлось не в
 * геометрию, а в балансировку. Измеренная цепочка:
 *
 *  - шпангоут здесь — не кольцо, а СПЛОШНОЙ ДИСК во всё сечение: лофт двух
 *    одинаковых эллипсов с крышками, 0.29 м³ стали на штуку;
 *  - шесть добавленных дисков дали +16% массы машины, и она перестала
 *    успевать тормозить перед поворотом руления;
 *  - шпангоут-кольцо (рамка глубиной 0.07 м) роняет их объём с 5.15 до
 *    1.00 м³, но уводит центр масс на 70 см НАЗАД, и лётная модель
 *    расходится в NaN на первом же вираже.
 *
 * То есть салон требует колец, а кольца требуют перебалансировки машины.
 * Это решение владельца, а не побочный эффект правки обшивки.
 */

/**
 * Скругление законцовки в плане. Руль — прямоугольная врезка: его задняя
 * кромка не гнётся. На крыле элерон кончается раньше законцовки, и колпак
 * за ним скругляет и носок, и заднюю кромку до точки (`closeTip`): иначе
 * `u` останавливается на 0.985, на торце живёт толстый срез, а `loftRings`
 * кроет его веером — гармошка сбоку. На стабилизаторе руль доходит до конца,
 * поэтому скругляется только кессон (носок → шарнир), без схлопывания.
 */
function roundBoxLeaf(
  span: number,
  halfSpan: number,
  roundSpan: number,
  leading0: number,
  chord0: number,
  hingeT: number,
  leafOuter: number,
  closeTip = false,
): { leading: number; chord: number; hingeZ: number; te: number } {
  const hingeZ = leading0 - hingeT * chord0;
  const te0 = leading0 - chord0;
  const start = halfSpan - roundSpan;
  const uMax = closeTip ? 1 : 0.985;
  let leading = leading0;
  if (span > start + 1e-9) {
    const u = Math.min(uMax, (span - start) / Math.max(roundSpan, 1e-9));
    const keep = Math.sqrt(Math.max(0, 1 - u * u));
    leading = hingeZ + (leading0 - hingeZ) * keep;
  }
  let te = te0;
  if (span > leafOuter + 1e-9) {
    const cap = Math.max(halfSpan - leafOuter, 1e-9);
    const u = Math.min(uMax, (span - leafOuter) / cap);
    const keep = Math.sqrt(Math.max(0, 1 - u * u));
    te = hingeZ - (hingeZ - te0) * keep;
  }
  return { leading, chord: Math.max(closeTip ? 0 : 0.12, leading - te), hingeZ, te };
}

function chordTToZ(
  t: number,
  leading: number,
  hingeZ: number,
  te: number,
  hingeT: number,
): number {
  if (t <= hingeT) return leading - (t / Math.max(hingeT, 1e-9)) * (leading - hingeZ);
  return hingeZ - ((t - hingeT) / Math.max(1 - hingeT, 1e-9)) * (hingeZ - te);
}

const AIRFOIL_LOWER = 0.82;
/**
 * Low-wing: the root lower surface at max thickness sits on the keel, so
 * the fuselage does not hang below the wing. Upper fillets stay out of B01.
 */
const WING_ROOT_Y =
  sampleStation(0).keel + AIRFOIL_LOWER * 0.15 * ROOT_CHORD * 0.5;

function wingAt(x: number): {
  readonly chord: number;
  readonly leading: number;
  readonly hingeZ: number;
  readonly te: number;
  readonly thickness: number;
  readonly y0: number;
} {
  const span = Math.abs(x);
  const spanT = Math.min(1, span / WING_HALF);
  const chord0 = ROOT_CHORD * (1 - spanT) + TIP_CHORD * spanT;
  const leading0 = ROOT_LE * (1 - spanT) + TIP_LE * spanT;
  const plan = roundBoxLeaf(
    span, WING_HALF, WING_TIP_ROUND, leading0, chord0, SPAR_REAR, AILERON_OUT, true,
  );
  return {
    chord: plan.chord,
    leading: plan.leading,
    hingeZ: plan.hingeZ,
    te: plan.te,
    // Толщина — доля МЕСТНОЙ хорды, уже сжатой эллипсом колпака. Иначе в
    // плане крыло круглое, а сбоку до самого края стоит корневой профиль.
    thickness: (0.15 * (1 - spanT) + 0.07 * spanT) * plan.chord,
    y0: WING_ROOT_Y + Math.max(0, span - WING_BREAK) * Math.tan(OUTER_DIHEDRAL),
  };
}

/** Shaft on the local wing chord, not a pod under the box. */
const PROP_HUB_Y = wingAt(ENGINE_X).y0;
/**
 * Ось и покрышка не едут: длина цапфа→ось и трёхточка заморожены. Кулак
 * навески — ящик 20 см ВНУТРИ гондолы (15 см над обводом капота, 5 см
 * выглядывает в проём). Стойка входит в нишу к кулаку; снаружи по-прежнему
 * олео. После уборки наружу торчит только небольшая часть колеса — это тип,
 * не повод топить ось в гондолу.
 */
const GEAR_WHEEL_RADIUS = 0.55;
const GEAR_STRUT_LENGTH = 0.9;
const COWL_BOTTOM_Y = PROP_HUB_Y - COWL_OUTER;
const GEAR_OLEO_TOP_Y = COWL_BOTTOM_Y - 0.12;
const GEAR_AXLE_Y = GEAR_OLEO_TOP_Y - GEAR_STRUT_LENGTH;
const GEAR_KNUCKLE_HEIGHT = 0.2;
const GEAR_KNUCKLE_BELOW_OPENING = 0.05;
const GEAR_TRUNNION_Y =
  COWL_BOTTOM_Y - GEAR_KNUCKLE_BELOW_OPENING + GEAR_KNUCKLE_HEIGHT / 2;
const GEAR_BODY_Y = GEAR_AXLE_Y - GEAR_WHEEL_RADIUS;
const PITCH = Math.atan2(
  TAILWHEEL_BODY_Y - GEAR_BODY_Y,
  GEAR_BODY_Z - TAILWHEEL_BODY_Z,
);
const COS = Math.cos(PITCH);
const SIN = Math.sin(PITCH);

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const add = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: ObjectPoint, s: number): ObjectPoint => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function rotateAxis(vector: ObjectPoint, axis: ObjectPoint, angle: number): ObjectPoint {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const aligned = vector[0] * axis[0] + vector[1] * axis[1] + vector[2] * axis[2];
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axis, aligned * (1 - cosine)),
  );
}

function bodyToWorld(body: ObjectPoint): ObjectPoint {
  const yR = body[1] - GEAR_BODY_Y;
  const zR = body[2] - GEAR_BODY_Z;
  return [body[0], yR * COS + zR * SIN, zR * COS - yR * SIN];
}

/** Обратный ход: из мировой рамы объекта в корпусную. */
function worldToBody(world: ObjectPoint): ObjectPoint {
  const yR = world[1] * COS - world[2] * SIN;
  const zR = world[1] * SIN + world[2] * COS;
  return [world[0], yR + GEAR_BODY_Y, zR + GEAR_BODY_Z];
}

function bodyDirection(dir: ObjectPoint): ObjectPoint {
  const origin = bodyToWorld(point(0, 0, 0));
  const tip = bodyToWorld(dir);
  return [tip[0] - origin[0], tip[1] - origin[1], tip[2] - origin[2]];
}

function normalize(dir: ObjectPoint): ObjectPoint {
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  return length < 1e-12 ? dir : scale(dir, 1 / length);
}

/**
 * Three.js Euler XYZ from a rotation whose columns are the images of the
 * local axes. The instrument panel uses this so the +Y face and ±Z split
 * of `MotionInstrumentSystem` mean "toward the crew" and "left / right".
 */
function eulerXyzFromBasis(
  xAxis: ObjectPoint,
  yAxis: ObjectPoint,
  zAxis: ObjectPoint,
): ObjectPoint {
  const m13 = zAxis[0];
  const yaw = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [
      Math.atan2(-zAxis[1], zAxis[2]),
      yaw,
      Math.atan2(-yAxis[0], xAxis[0]),
    ];
  }
  return [Math.atan2(yAxis[2], yAxis[1]), yaw, 0];
}

function addBodyBox(
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  options: { readonly volume?: number } = {},
): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners: ObjectPoint[] = [
    point(cx - hx, cy - hy, cz - hz),
    point(cx + hx, cy - hy, cz - hz),
    point(cx + hx, cy + hy, cz - hz),
    point(cx - hx, cy + hy, cz - hz),
    point(cx - hx, cy - hy, cz + hz),
    point(cx + hx, cy - hy, cz + hz),
    point(cx + hx, cy + hy, cz + hz),
    point(cx - hx, cy + hy, cz + hz),
  ];
  addClosedMesh(id, group, material, corners, [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [3, 2, 6], [3, 6, 7],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ], options);
}

function addCylinder(
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 20,
): void {
  parts.push({
    kind: "cylinder",
    id,
    group,
    material,
    from: bodyToWorld(from),
    to: bodyToWorld(to),
    radius,
    radialSegments,
  });
}

function addBeam(
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth: number,
): void {
  parts.push({
    kind: "beam",
    id,
    group,
    material,
    from: bodyToWorld(from),
    to: bodyToWorld(to),
    width,
    depth,
  });
}

function signedVolume(
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
): number {
  let volume = 0;
  for (const [a, b, c] of triangles) {
    const [ax, ay, az] = vertices[a];
    const [bx, by, bz] = vertices[b];
    const [cx, cy, cz] = vertices[c];
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function addClosedMesh(
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
  options: {
    readonly doubleSided?: boolean;
    readonly showEdges?: boolean;
    readonly volume?: number;
  } = {},
): void {
  const volume = signedVolume(vertices, triangles);
  const wound = volume < -1e-6
    ? triangles.map(([a, b, c]) => [a, c, b] as ObjectTriangle)
    : triangles;
  parts.push({
    kind: "mesh",
    id,
    group,
    material,
    volume: options.volume,
    vertices: vertices.map(bodyToWorld),
    triangles: wound,
    showEdges: options.showEdges ?? true,
    doubleSided: options.doubleSided,
  });
}

function loftRings(
  rings: readonly (readonly ObjectPoint[])[],
  caps: { readonly start?: boolean; readonly end?: boolean } = { start: true, end: true },
): {
  vertices: ObjectPoint[];
  triangles: ObjectTriangle[];
} {
  const vertices: ObjectPoint[] = rings.flatMap((ring) => [...ring]);
  const triangles: ObjectTriangle[] = [];
  const count = rings[0].length;
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const a = ring * count;
    const b = (ring + 1) * count;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      triangles.push([a + i, a + j, b + j], [a + i, b + j, b + i]);
    }
  }
  const first = 0;
  const last = (rings.length - 1) * count;
  for (let i = 1; i < count - 1; i += 1) {
    if (caps.start) triangles.push([first, first + i + 1, first + i]);
    if (caps.end) triangles.push([last, last + i, last + i + 1]);
  }
  return { vertices, triangles };
}

/**
 * Колпачок как у визуала датчика дистанции: сфера спереди, усечённый конус
 * назад. Те же числа, что `CompoundKinematicClusterBodies` рисует на сенсоре.
 */
const SENSOR_CAP_DOME = 0.055;
const SENSOR_CAP_COLLAR = 0.06;
const SENSOR_CAP_NECK = 0.045;
const SENSOR_CAP_NECK_LENGTH = 0.07;
const SENSOR_CAP_SEGMENTS = 12;

function addGlassSensorCap(
  id: string,
  origin: ObjectPoint,
  outward: ObjectPoint,
): void {
  const axisLen = Math.hypot(outward[0], outward[1], outward[2]);
  const axis: ObjectPoint = [
    outward[0] / axisLen,
    outward[1] / axisLen,
    outward[2] / axisLen,
  ];
  const helper: ObjectPoint = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const rawU = cross(helper, axis);
  const uLen = Math.hypot(rawU[0], rawU[1], rawU[2]);
  const u: ObjectPoint = [rawU[0] / uLen, rawU[1] / uLen, rawU[2] / uLen];
  const v = cross(axis, u);
  const stations: readonly { readonly s: number; readonly r: number }[] = [
    { s: -SENSOR_CAP_NECK_LENGTH, r: SENSOR_CAP_NECK },
    { s: -SENSOR_CAP_NECK_LENGTH * 0.5, r: (SENSOR_CAP_NECK + SENSOR_CAP_COLLAR) / 2 },
    { s: 0, r: SENSOR_CAP_COLLAR },
    { s: SENSOR_CAP_DOME * 0.25, r: Math.sqrt(SENSOR_CAP_DOME ** 2 - (SENSOR_CAP_DOME * 0.25) ** 2) },
    { s: SENSOR_CAP_DOME * 0.5, r: Math.sqrt(SENSOR_CAP_DOME ** 2 - (SENSOR_CAP_DOME * 0.5) ** 2) },
    { s: SENSOR_CAP_DOME * 0.72, r: Math.sqrt(SENSOR_CAP_DOME ** 2 - (SENSOR_CAP_DOME * 0.72) ** 2) },
    { s: SENSOR_CAP_DOME * 0.88, r: Math.sqrt(SENSOR_CAP_DOME ** 2 - (SENSOR_CAP_DOME * 0.88) ** 2) },
    { s: SENSOR_CAP_DOME * 0.97, r: Math.sqrt(SENSOR_CAP_DOME ** 2 - (SENSOR_CAP_DOME * 0.97) ** 2) },
  ];
  const rings = stations.map(({ s, r }) =>
    Array.from({ length: SENSOR_CAP_SEGMENTS }, (_, index) => {
      const angle = (index / SENSOR_CAP_SEGMENTS) * Math.PI * 2;
      return add(
        add(origin, scale(axis, s)),
        add(scale(u, Math.cos(angle) * r), scale(v, Math.sin(angle) * r)),
      );
    }),
  );
  const lofted = loftRingsToPoint(rings, add(origin, scale(axis, SENSOR_CAP_DOME)), true);
  addClosedMesh(id, "lights", "lamp-glass", lofted.vertices, lofted.triangles, {
    showEdges: false,
  });
}

/**
 * Лофт на точку законцовки: одно ребро кольца → один треугольник.
 * Повторять последнее кольцо двенадцатью копиями той же точки нельзя:
 * второй треугольник каждого квада вырождается и читается гармошкой.
 */
function loftRingsToPoint(
  rings: readonly (readonly ObjectPoint[])[],
  tip: ObjectPoint,
  capStart = true,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } {
  const lofted = loftRings(rings, { start: capStart, end: false });
  const count = rings[0].length;
  const last = (rings.length - 1) * count;
  const tipIndex = lofted.vertices.length;
  lofted.vertices.push(tip);
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    lofted.triangles.push([last + i, last + j, tipIndex]);
  }
  return lofted;
}

/**
 * Точка сечения на ПРОИЗВОЛЬНОМ угле.
 *
 * Вынесена из `ellipseRing` затем, чтобы вырез иллюминатора строился по той же
 * формуле, а не по хордам между выборками кольца: при двадцати выборках хорда
 * отходит от эллипса на 17 мм, и ровно эти миллиметры видны на кромке окна.
 */
function ellipsePoint(station: Station, angle: number): ObjectPoint {
  const cy = (station.crown + station.keel) / 2;
  const ry = (station.crown - station.keel) / 2;
  const power = station.upperPower ?? 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const yUnit = sine >= 0 ? Math.pow(sine, 2 / power) : sine;
  const face = (station.faceForward ?? 0) * Math.max(0, cosine) * Math.max(0, sine);
  return point(station.halfWidth * cosine, cy + ry * yUnit, station.z + face);
}

function ellipseRing(station: Station): ObjectPoint[] {
  return Array.from({ length: RING }, (_, index) =>
    ellipsePoint(station, (index / RING) * Math.PI * 2));
}

const fuselage = loftRings(FUSELAGE_STATIONS.map(ellipseRing));
addClosedMesh("fuselage-loft", "fuselage", "paint-light", fuselage.vertices, fuselage.triangles);

function hermite01(
  t: number,
  value0: number,
  deriv0: number,
  value1: number,
  deriv1: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * value0
    + (t3 - 2 * t2 + t) * deriv0
    + (-2 * t3 + 3 * t2) * value1
    + (t3 - t2) * deriv1;
}

function noseCapHermiteStation(t: number): Station {
  const hole = FUSELAGE_STATIONS[0];
  const prev = FUSELAGE_STATIONS[1];
  const dz = hole.z - prev.z;
  const dHalfWidth = ((hole.halfWidth - prev.halfWidth) / dz) * NOSE_CAP_LENGTH;
  const dCrown = ((hole.crown - prev.crown) / dz) * NOSE_CAP_LENGTH;
  const dKeel = ((hole.keel - prev.keel) / dz) * NOSE_CAP_LENGTH;
  const tipY = (hole.crown + hole.keel) / 2;
  return {
    z: hole.z + NOSE_CAP_LENGTH * t,
    halfWidth: hermite01(t, hole.halfWidth, dHalfWidth, 0, 0),
    crown: hermite01(t, hole.crown, dCrown, tipY, 0),
    keel: hermite01(t, hole.keel, dKeel, tipY, 0),
    upperPower: hole.upperPower,
  };
}

function noseCapDomeRadius(shoulder: Station): number {
  return Math.max(shoulder.halfWidth, (shoulder.crown - shoulder.keel) / 2);
}

const NOSE_CAP_TIP_Z = (() => {
  const shoulder = noseCapHermiteStation(NOSE_CAP_CUT_T);
  return shoulder.z + noseCapDomeRadius(shoulder);
})();

/**
 * Накладка-колпак: закрывает дырку на последнем кольце, не двигая станции.
 * Переднее кольцо — `ellipseRing` той же станции, что и лофт (стык встык).
 * Губа на 2 см внутрь, чтобы при панельной шкуре дырка была закрыта с салона.
 * Образующие — касательная последних двух станций (тот же эрмит, что дал
 * верный стык и нос). В точку с нулевой производной не сходим: от последнего
 * эрмитова кольца — полуэллипс оставшегося овала, навершие без угла.
 */
{
  const hole = FUSELAGE_STATIONS[0];
  const shoulder = noseCapHermiteStation(NOSE_CAP_CUT_T);
  const dome = noseCapDomeRadius(shoulder);
  const tipY = (shoulder.crown + shoulder.keel) / 2;
  const domeStation = (u: number): Station => {
    const keep = Math.sqrt(Math.max(0, 1 - u * u));
    return {
      z: shoulder.z + dome * u,
      halfWidth: shoulder.halfWidth * keep,
      crown: tipY + (shoulder.crown - tipY) * keep,
      keel: tipY + (shoulder.keel - tipY) * keep,
      upperPower: hole.upperPower,
    };
  };
  const lip: Station = { ...hole, z: hole.z - 0.02 };
  const rings = [
    ellipseRing(lip),
    ellipseRing(hole),
    ...[0.22, 0.44, NOSE_CAP_CUT_T].map((t) => ellipseRing(noseCapHermiteStation(t))),
    ...[0.22, 0.40, 0.56, 0.70, 0.82, 0.91, 0.97].map((u) => ellipseRing(domeStation(u))),
  ];
  const lofted = loftRingsToPoint(
    rings,
    point(0, tipY, NOSE_CAP_TIP_Z),
    true,
  );
  addClosedMesh("nose-cap", "nose-cap", "paint-light", lofted.vertices, lofted.triangles);
}

function airfoilBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { thickness, y0, leading, hingeZ, te } = wingAt(x);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = chordTToZ(t, leading, hingeZ, te, SPAR_REAR);
    const bump = Math.sin(Math.PI * t) * thickness * 0.5;
    const y = y0 + (upper ? bump : -bump * AIRFOIL_LOWER);
    return point(x, y, z);
  });
}

function inFlapBay(x: number): boolean {
  const span = Math.abs(x);
  return (span >= FLAP_INNER_IN && span <= FLAP_INNER_OUT)
    || (span >= FLAP_OUTER_IN && span <= FLAP_OUTER_OUT);
}

function inAileronBay(x: number): boolean {
  const span = Math.abs(x);
  return span >= AILERON_IN && span <= AILERON_OUT;
}

function wingSkinEndT(x: number): number {
  return inFlapBay(x) || inAileronBay(x) ? SPAR_REAR - HINGE_GAP_T : 1;
}

function uniqueStations(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
    .sort((a, b) => a - b);
}

// Нервюрные станции крыла. Подняты в модульную константу, чтобы панелизация
// брала ТЕ ЖЕ границы отсеков, а не свои округлённые.
const WING_STATIONS = uniqueStations([
    0,
    1.4,
    FLAP_INNER_IN - 0.04,
    FLAP_INNER_IN,
    2.8,
    4.2,
    FLAP_INNER_OUT,
    FLAP_INNER_OUT + 0.04,
    ENGINE_X,
    FLAP_OUTER_IN - 0.04,
    FLAP_OUTER_IN,
    WING_JOINT,
    7.4,
    FLAP_OUTER_OUT,
    FLAP_OUTER_OUT + 0.04,
    AILERON_IN,
    10.2,
    12.6,
    AILERON_OUT,
    AILERON_OUT + 0.04,
    WING_HALF - WING_TIP_ROUND * 0.72,
    WING_HALF - WING_TIP_ROUND * 0.45,
    WING_HALF - WING_TIP_ROUND * 0.22,
    WING_HALF - WING_TIP_ROUND * 0.08,
    WING_HALF - WING_TIP_ROUND * 0.03,
    WING_HALF,
]);

function addWing(id: string, sign: 1 | -1): void {
  const rings = WING_STATIONS
    .filter((x) => x < WING_HALF - 1e-9)
    .map((x) => airfoilBand(sign * x, 0, wingSkinEndT(sign * x)));
  const tipAt = wingAt(sign * WING_HALF);
  const lofted = loftRingsToPoint(
    rings,
    point(sign * WING_HALF, tipAt.y0, tipAt.hingeZ),
    true,
  );
  addClosedMesh(id, "wing", "paint-light", lofted.vertices, lofted.triangles);
}

addWing("wing-right", 1);
addWing("wing-left", -1);

function addSurface(
  id: string,
  group: string,
  xs: readonly number[],
  band: (x: number) => ObjectPoint[],
): void {
  const lofted = loftRings(xs.map(band));
  addClosedMesh(id, group, "paint-light", lofted.vertices, lofted.triangles);
}

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  const surface = (x: number) => airfoilBand(x, SPAR_REAR + HINGE_GAP_T, 1);
  addSurface(
    `flap-${side}-inner`,
    `flap-${side}-inner`,
    [FLAP_INNER_IN, 2.8, 4.2, FLAP_INNER_OUT].map((x) => sign * x),
    surface,
  );
  addSurface(
    `flap-${side}-outer`,
    `flap-${side}-outer`,
    [FLAP_OUTER_IN, 7.4, FLAP_OUTER_OUT].map((x) => sign * x),
    surface,
  );
  addSurface(
    `aileron-${side}`,
    `aileron-${side}`,
    [AILERON_IN, 10.2, 12.6, AILERON_OUT].map((x) => sign * x),
    surface,
  );
}

function circleRing(cx: number, cy: number, z: number, radius: number, count: number): ObjectPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z);
  });
}

function addNacelle(side: "left" | "right", sign: 1 | -1): void {
  const group = `nacelle-${side}`;
  const engine = `engine-${side}`;
  const x = sign * ENGINE_X;
  const cowlSeg = 24;
  const body = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, 0.71, cowlSeg),
    circleRing(x, PROP_HUB_Y, 1.95, COWL_OUTER, cowlSeg),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_OUTER, cowlSeg),
    circleRing(x, PROP_HUB_Y, 0.35, 0.66, cowlSeg),
    circleRing(x, PROP_HUB_Y, -0.7, 0.58, cowlSeg),
    circleRing(x, PROP_HUB_Y, -1.9, 0.4, cowlSeg),
    circleRing(x, PROP_HUB_Y, -3.2, 0.16, cowlSeg),
  ], { start: false, end: true });
  addClosedMesh(`${group}-body`, group, "metal", body.vertices, body.triangles);
  const inner = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, COWL_INNER, cowlSeg).reverse(),
    circleRing(x, PROP_HUB_Y, 1.95, COWL_INNER, cowlSeg).reverse(),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER, cowlSeg).reverse(),
  ], { start: false, end: false });
  addClosedMesh(
    `${group}-cowl-inner`,
    group,
    "metal",
    inner.vertices,
    inner.triangles,
    { doubleSided: true },
  );
  const lip = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, 0.71, cowlSeg),
    circleRing(x, PROP_HUB_Y, COWL_FRONT_Z, COWL_INNER, cowlSeg),
  ], { start: false, end: false });
  addClosedMesh(
    `${group}-cowl-lip`,
    group,
    "metal",
    lip.vertices,
    lip.triangles,
    { doubleSided: true },
  );
  const firewall = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER, 16),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z - 0.04, COWL_INNER, 16),
  ]);
  addClosedMesh(
    `${group}-firewall`,
    group,
    "metal",
    firewall.vertices,
    firewall.triangles,
    { doubleSided: true },
  );
  // КОК СИДИТ НА ПЛОСКОСТИ ВИНТА, А ВАЛ ЕЁ ДОСТАЁТ.
  //
  // Когда губа NACA вынесла капот вперёд, винт пришлось отодвинуть на 3.06 —
  // а кок остался на 2.92 и оказался ПОЗАДИ лопастей, с четырнадцатью
  // сантиметрами пустоты. Кок обязан обнимать комли, а не висеть за ними,
  // поэтому он переехал на плоскость винта и стал уже: комель лопасти теперь
  // 0.12, и прежние 0.32 делали из него бочку.
  addCylinder(`${group}-spinner`, group, "paint-light",
    point(x, PROP_HUB_Y, PROP_HUB_Z + 0.2), point(x, PROP_HUB_Y, PROP_HUB_Z - 0.14), 0.21, 16);
  // Вал от носка картера до кока: раньше его не было вовсе, потому что кок
  // упирался прямо в двигатель.
  addCylinder(`${group}-prop-shaft`, group, "metal",
    point(x, PROP_HUB_Y, PROP_HUB_Z - 0.12), point(x, PROP_HUB_Y, 2.5), 0.075, 12);
  addCylinder(
    `${engine}-crankcase`,
    engine,
    "metal",
    point(x, PROP_HUB_Y, 2.48),
    point(x, PROP_HUB_Y, 1.34),
    // Радиус — двухрядная звезда R-1830 почти во весь капот (внутренний
    // радиус капота 0.57), а не тонкий вал: у настоящей машины силовая
    // установка — около девяти процентов веса, и её масса живёт именно
    // здесь. Худая «палка» 0.26 оставляла мотор в 3.8% — нос легчал, центр
    // масс уезжал назад (замер 19.08.2026).
    0.44,
    16,
  );
  addCylinder(
    `${engine}-nose`,
    engine,
    "metal",
    point(x, PROP_HUB_Y, 2.56),
    point(x, PROP_HUB_Y, 2.46),
    0.18,
    12,
  );
  for (let cylinder = 0; cylinder < ENGINE_CYLINDERS; cylinder += 1) {
    const angle = (cylinder / ENGINE_CYLINDERS) * Math.PI * 2;
    const radial = point(Math.cos(angle), Math.sin(angle), 0);
    addCylinder(
      `${engine}-cylinder-${cylinder}`,
      engine,
      "metal",
      add(point(x, PROP_HUB_Y, ENGINE_Z), scale(radial, 0.26)),
      add(point(x, PROP_HUB_Y, ENGINE_Z), scale(radial, 0.5)),
      0.08,
      10,
    );
  }
  const hub = point(x, PROP_HUB_Y, PROP_HUB_Z);
  const axis = point(0, 0, 1);
  for (let blade = 0; blade < PROP_BLADES; blade += 1) {
    const theta = PROP_PHASE + (blade * 2 * Math.PI) / PROP_BLADES;
    const span = point(Math.sin(theta), Math.cos(theta), 0);
    const chord = rotateAxis(cross(span, axis), span, PROP_PITCH);
    const thick = cross(span, chord);
    const stations = [
      { radius: PROP_ROOT_RADIUS, chord: 0.2, thick: 0.055 },
      { radius: 1.12, chord: 0.34, thick: 0.046 },
      { radius: PROP_RADIUS, chord: 0.16, thick: 0.022 },
    ].map(({ radius, chord: width, thick: depth }) => {
      const centre = add(hub, scale(span, radius));
      return [
        add(add(centre, scale(chord, width / 2)), scale(thick, depth / 2)),
        add(add(centre, scale(chord, width / 2)), scale(thick, -depth / 2)),
        add(add(centre, scale(chord, -width / 2)), scale(thick, -depth / 2)),
        add(add(centre, scale(chord, -width / 2)), scale(thick, depth / 2)),
      ];
    });
    const lofted = loftRings(stations);
    addClosedMesh(
      `propeller-${side}-blade-${blade}`,
      `propeller-${side}`,
      "metal",
      lofted.vertices,
      lofted.triangles,
    );
  }
  addMainGear(side, sign);
}

/**
 * ОСНОВНАЯ СТОЙКА DC-3.
 *
 * Цапфа сидит в мотогондоле у переднего лонжерона, стойка почти вертикальная,
 * колесо чуть впереди цапфы. Убирается ВПЕРЁД поворотом вокруг размахной оси,
 * и колесо остаётся торчать примерно на четверть — по этому силуэту машину и
 * узнают. Полностью в гондолу оно не прячется никогда.
 *
 * Состав по узлам, а не одной палкой: без именованных членов уборке нечего
 * складывать, а амортизации нечего двигать.
 *
 *  - `trunnion`  — узел навески на гондоле (цвет крепежа);
 *  - `strut`     — цилиндр амортизатора; на него смотрит план опоры;
 *  - `piston`    — блестящий шток, ЕДИНСТВЕННОЕ, что ходит при обжатии;
 *  - `scissor-*` — шлиц-шарнир: держит шток от проворота, ходит НА ПОЛХОДА;
 *  - `drag-link` — подкос вперёд, он же тянет стойку при уборке;
 *  - `hub`       — барабан тормоза и диск (цвет крепежа);
 *  - `wheel`     — покрышка.
 */
function addMainGear(side: "left" | "right", sign: 1 | -1): void {
  const x = sign * ENGINE_X;
  const trunnionY = GEAR_TRUNNION_Y;
  const trunnionZ = 0.22;
  const axleY = GEAR_AXLE_Y;
  const axleZ = 0.2;
  const pistonTopY = GEAR_OLEO_TOP_Y + (axleY - GEAR_OLEO_TOP_Y) * 0.47;

  addBodyBox(`gear-${side}-trunnion`, "gear-fittings", "metal",
    point(x, trunnionY, trunnionZ), point(0.26, GEAR_KNUCKLE_HEIGHT, 0.24));
  addCylinder(`gear-${side}-strut`, "gear", "metal",
    point(x, trunnionY, trunnionZ), point(x, pistonTopY, axleZ + 0.01), 0.085, 12);
  // Шток полированный: на фотографиях он всегда ярче цилиндра.
  addCylinder(`gear-${side}-piston`, "gear", "paint-light",
    point(x, pistonTopY, axleZ + 0.01), point(x, axleY, axleZ), 0.055, 12);

  // ШЛИЦ-ШАРНИР — НА ЗАДНЕЙ СТОРОНЕ СТОЙКИ И СНАРУЖИ ПОКРЫШКИ.
  //
  // Прежние 0.075 по размаху были меньше полуширины колеса (0.12), поэтому оба
  // звена шли СКВОЗЬ резину, а наружу торчала одна верхушка верхнего — её и
  // было видно на кадре. Плоскость шарнира вынесена на 0.155: это габарит
  // покрышки плюс собственная полутолщина звена, с запасом в семнадцать
  // миллиметров. Проверяется и барабан: его полуширина 0.13, зазор те же
  // семь миллиметров.
  //
  // Нижний конец сел на цапфу оси. Ось торчит из колеса на 0.08 в каждую
  // сторону — именно за этот выступ настоящий шарнир и держится, поэтому
  // прежняя точка «внутри колеса на 0.05 выше оси» была не приближением, а
  // ошибкой: она висела в воздухе внутри резины.
  const scissorX = x + sign * 0.155;
  const kneeY = (pistonTopY + axleY) / 2;
  addBodyBox(`gear-${side}-scissor-lug`, "gear-fittings", "metal",
    point(x + sign * 0.12, pistonTopY + 0.04, axleZ - 0.1), point(0.09, 0.08, 0.08));
  addBeam(`gear-${side}-scissor-upper`, "gear", "metal",
    point(scissorX, pistonTopY + 0.04, axleZ - 0.1),
    point(scissorX, kneeY, axleZ - 0.19), 0.035, 0.03);
  addBeam(`gear-${side}-scissor-lower`, "gear", "metal",
    point(scissorX, kneeY, axleZ - 0.19),
    point(scissorX, axleY, axleZ - 0.02), 0.035, 0.03);

  // Подкос идёт ОТ ЦАПФЫ вперёд-вниз к штоку.
  //
  // Верхний конец сидит на самой цапфе нарочно: уборка — жёсткий поворот
  // вокруг неё, и подкос, упирающийся в отдельный кронштейн на гондоле, при
  // складывании ушёл бы с него. Кронштейн остаётся на месте отдельной
  // деталью — это узел навески силового цилиндра, он не едет.
  //
  // ВЫСОТА ЭТОГО УЗЛА — НЕ ВКУС. Он единственный в ноге, который НЕ уезжает
  // при уборке, поэтому обязан читаться частью гондолы, а не отдельной
  // деталью. На прежней высоте он заходил под обшивку на ШЕСТЬ миллиметров:
  // с ногой на месте это незаметно, а стоит ей уйти — и узел висит в пустоте.
  // Поднят так, чтобы больше половины сидело в нише, а наружу выходила
  // проушина. Кулак навески сидит в той же нише; ось и покрышка снаружи.
  addBodyBox(`gear-${side}-jack-fitting`, "gear-fittings", "metal",
    point(x, PROP_HUB_Y - COWL_OUTER + 0.19, trunnionZ + 0.62), point(0.2, 0.16, 0.18));
  addBeam(`gear-${side}-drag-link`, "gear", "metal",
    point(x, trunnionY - 0.02, trunnionZ + 0.04),
    point(x, pistonTopY + 0.06, axleZ + 0.34), 0.06, 0.05);

  addCylinder(`gear-${side}-axle`, "gear", "metal",
    point(x - 0.2, axleY, axleZ), point(x + 0.2, axleY, axleZ), 0.05, 10);
  addCylinder(`gear-${side}-hub`, "gear-fittings", "metal",
    point(x - 0.13, axleY, axleZ), point(x + 0.13, axleY, axleZ), 0.24, 16);
  addCylinder(`gear-${side}-wheel`, "gear", "timber-dark",
    point(x - 0.12, axleY, axleZ), point(x + 0.12, axleY, axleZ), GEAR_WHEEL_RADIUS, 18);
}

addNacelle("left", -1);
addNacelle("right", 1);

/**
 * ХВОСТОВОЕ КОЛЕСО. У этого типа оно НЕ убирается — торчит всегда, и это
 * часть облика. Вилка самоориентирующаяся, поэтому она отдельным куском:
 * колесо рулит поворотом вилки, а не стойки.
 */
addBodyBox("gear-tail-fitting", "gear-fittings", "metal",
  point(0, -0.16, -10.92), point(0.18, 0.14, 0.2));
addCylinder("gear-tail-strut", "gear", "metal",
  point(0, -0.2, -10.95), point(0, -0.36, -11.05), 0.045, 8);
for (const sign of [-1, 1] as const) {
  addBeam(`gear-tail-fork-${sign > 0 ? "right" : "left"}`, "gear", "metal",
    point(sign * 0.075, -0.3, -11.0), point(sign * 0.075, -0.36, -11.05), 0.03, 0.03);
}
addCylinder("gear-tail-hub", "gear-fittings", "metal",
  point(-0.04, -0.36, -11.05), point(0.04, -0.36, -11.05), 0.07, 10);
addCylinder("gear-tail-wheel", "gear", "timber-dark",
  point(-0.06, -0.36, -11.05), point(0.06, -0.36, -11.05), 0.16, 12);

function stabSection(x: number): {
  readonly chord: number;
  readonly leading: number;
  readonly hingeZ: number;
  readonly te: number;
  readonly y0: number;
  readonly thick: number;
} {
  const span = Math.abs(x);
  const t = Math.min(1, span / STAB_HALF);
  const chord0 = 1.82 * (1 - t) + STAB_TIP_CHORD * t;
  const leading0 = -10.15 - t * 0.35;
  const plan = roundBoxLeaf(
    span, STAB_HALF, STAB_TIP_ROUND, leading0, chord0, STAB_HINGE_T, ELEV_OUT,
  );
  return {
    chord: plan.chord,
    leading: plan.leading,
    hingeZ: plan.hingeZ,
    te: plan.te,
    y0: 0.4,
    thick: 0.12 * chord0,
  };
}

function stabBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { y0, thick, leading, hingeZ, te } = stabSection(x);
  return Array.from({ length: 8 }, (_, index) => {
    const upper = index <= 4;
    const s = upper ? index / 4 : (8 - index) / 4;
    const t = t0 + s * (t1 - t0);
    const bump = Math.sin(Math.PI * t) * thick * 0.5;
    return point(x, y0 + (upper ? bump : -bump), chordTToZ(t, leading, hingeZ, te, STAB_HINGE_T));
  });
}

function inElevatorBay(x: number): boolean {
  const span = Math.abs(x);
  return span >= ELEV_IN && span <= ELEV_OUT;
}

const STAB_STATION_XS = uniqueStations([
  -STAB_HALF,
  -(STAB_HALF - STAB_TIP_ROUND * 0.22),
  -(STAB_HALF - STAB_TIP_ROUND * 0.55),
  -2.1,
  -0.9,
  -ELEV_IN,
  -(ELEV_IN - 0.04),
  0,
  ELEV_IN - 0.04,
  ELEV_IN,
  0.9,
  2.1,
  STAB_HALF - STAB_TIP_ROUND * 0.55,
  STAB_HALF - STAB_TIP_ROUND * 0.22,
  STAB_HALF,
]);
const stabStations = STAB_STATION_XS.map((x) =>
  stabBand(x, 0, inElevatorBay(x) ? STAB_HINGE_T - HINGE_GAP_T : 1));
const stabilizer = loftRings(stabStations);
addClosedMesh("horizontal-stabilizer", "empennage", "paint-light", stabilizer.vertices, stabilizer.triangles);

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  addSurface(
    `elevator-${side}`,
    `elevator-${side}`,
    [ELEV_IN, 0.9, 2.1, ELEV_OUT].map((x) => sign * x),
    (x) => stabBand(x, STAB_HINGE_T + HINGE_GAP_T, 1),
  );
}

type FinStation = {
  readonly y: number | "crown";
  readonly leadZ: number;
  readonly trailZ: number;
  readonly half: number;
};

const FIN_STATIONS: readonly FinStation[] = [
  { y: "crown", leadZ: -8.25, trailZ: -12.16, half: 0.12 },
  { y: 1.05, leadZ: -8.7, trailZ: -12.16, half: 0.115 },
  { y: 1.25, leadZ: -9.15, trailZ: -12.155, half: 0.108 },
  { y: 1.55, leadZ: -9.6, trailZ: -12.15, half: 0.1 },
  { y: 1.95, leadZ: -10, trailZ: -12.145, half: 0.09 },
  { y: 2.4, leadZ: -10.35, trailZ: -12.14, half: 0.08 },
  { y: 2.9, leadZ: -10.65, trailZ: -12.13, half: 0.07 },
  { y: 3.4, leadZ: -10.92, trailZ: -12.12, half: 0.058 },
  { y: 3.85, leadZ: -11.15, trailZ: -12.1, half: 0.048 },
  { y: 4.25, leadZ: -11.35, trailZ: -12.06, half: 0.038 },
  { y: 4.55, leadZ: -11.52, trailZ: -11.96, half: 0.026 },
  { y: 4.75, leadZ: -11.66, trailZ: -11.88, half: 0.016 },
  { y: 4.85, leadZ: -11.76, trailZ: -11.8, half: 0.008 },
];

function finHeight(station: FinStation, z: number): number {
  return station.y === "crown" ? sampleCrown(z) : station.y;
}

function inRudderBay(station: FinStation): boolean {
  if (station.y === "crown") return false;
  return station.y >= RUDDER_Y0 && station.y <= RUDDER_Y1;
}

function finBand(station: FinStation, t0: number, t1: number): ObjectPoint[] {
  const steps = 10;
  const ring: ObjectPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = t0 + (index / steps) * (t1 - t0);
    const z = station.leadZ - t * (station.leadZ - station.trailZ);
    const thick = station.half * Math.sin(Math.PI * t);
    ring.push(point(-thick, finHeight(station, z), z));
  }
  for (let index = steps - 1; index >= 1; index -= 1) {
    const t = t0 + (index / steps) * (t1 - t0);
    const z = station.leadZ - t * (station.leadZ - station.trailZ);
    const thick = station.half * Math.sin(Math.PI * t);
    ring.push(point(thick, finHeight(station, z), z));
  }
  return ring;
}

const fin = loftRings(FIN_STATIONS.map((station) => (
  finBand(station, 0, inRudderBay(station) ? FIN_HINGE_T - HINGE_GAP_T : 1)
)));
addClosedMesh("vertical-fin", "empennage", "paint-light", fin.vertices, fin.triangles);

const rudderStations = FIN_STATIONS.filter(inRudderBay);
const rudder = loftRings(rudderStations.map((station) => (
  finBand(station, FIN_HINGE_T + HINGE_GAP_T, 1)
)));
addClosedMesh("rudder", "rudder", "paint-light", rudder.vertices, rudder.triangles);

const WING_SPAR_XS = [
  -DC3_WINGSPAN / 2 + 0.55, -12.6, -10.2, -7.4, -WING_JOINT, -ENGINE_X,
  -4.2, -3.5, -2.8, -2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2,
  ENGINE_X, WING_JOINT, 7.4, 10.2, 12.6, DC3_WINGSPAN / 2 - 0.55,
];

function wingSkinInset(thickness: number, x = 0): number {
  // Панельная шкура — тонкая плитка на теоретическом контуре. 22% толщины
  // оставляли нервюру у самой обшивки, и на корне она протыкала верх и низ.
  // В первой трети консоли профиль ещё толстый, а лофт лонжерона между
  // редкими станциями спрямлял стенку наружу обшивки — там inset больше.
  const innerThird = Math.abs(x) < WING_HALF / 3;
  const scale = innerThird ? 0.4 : 0.32;
  const cap = innerThird ? 0.48 : 0.4;
  return Math.min(thickness * cap, Math.max(0.08, thickness * scale));
}

function sparRing(x: number, chordT: number): ObjectPoint[] {
  const { thickness, y0, leading, hingeZ, te } = wingAt(x);
  const inset = wingSkinInset(thickness, x);
  const z = chordTToZ(chordT, leading, hingeZ, te, SPAR_REAR);
  // Высота стенки считалась от МАКСИМАЛЬНОЙ толщины профиля, а профиль на
  // носке хорды тоньше: передний лонжерон вылезал наружу обшивки у корня на
  // 42 мм. Ограничиваем местной высотой профиля на СВОЕЙ хорде.
  const localBump = Math.sin(Math.PI * chordT) * thickness * 0.5;
  const floor = Math.abs(x) < WING_HALF / 3 ? 0.004 : 0.012;
  const up = Math.max(floor, Math.min(thickness * 0.5, localBump) - inset);
  const down = Math.max(floor, Math.min(thickness * 0.41, localBump * 0.82) - inset);
  const half = Math.min(SPAR_WEB / 2, Math.max(0.016, thickness * 0.12));
  return [
    point(x, y0 + up, z + half),
    point(x, y0 + up, z - half),
    point(x, y0 - down, z - half),
    point(x, y0 - down, z + half),
  ];
}

for (const [id, chordT] of [["front", SPAR_FRONT], ["main", SPAR_MAIN], ["rear", SPAR_REAR]] as const) {
  const lofted = loftRings(WING_SPAR_XS.map((x) => sparRing(x, chordT)));
  addClosedMesh(`wing-spar-${id}`, "structure-wing", "metal", lofted.vertices, lofted.triangles);
}

function formerBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { thickness, y0, leading, hingeZ, te } = wingAt(x);
  const inset = wingSkinInset(thickness, x);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = chordTToZ(t, leading, hingeZ, te, SPAR_REAR);
    const skinBump = Math.sin(Math.PI * t) * thickness * 0.5;
    const floor = Math.abs(x) < WING_HALF / 3 ? 0.004 : 0.008;
    const bump = Math.max(floor, skinBump - inset);
    return point(x, y0 + (upper ? bump : -bump * AIRFOIL_LOWER), z);
  });
}

for (const x of [0, 1.4, 2.8, 4.2, ENGINE_X, WING_JOINT, 7.4, 9.2, 10.8, 12.4]) {
  const xs = x === 0 ? [0] : [-x, x];
  for (const station of xs) {
    const endT = Math.max(0.14, wingSkinEndT(station) - 0.04);
    const lofted = loftRings([
      formerBand(station - 0.016, 0.06, endT),
      formerBand(station + 0.016, 0.06, endT),
    ]);
    const tag = station === 0 ? "0" : `${station < 0 ? "l" : "r"}-${Math.abs(station).toFixed(1)}`;
    addClosedMesh(`wing-former-${tag}`, "structure-wing", "metal", lofted.vertices, lofted.triangles);
  }
}

function insetStation(station: Station, inset: number): Station {
  return {
    ...station,
    halfWidth: Math.max(0.06, station.halfWidth - inset),
    crown: station.crown - inset,
    keel: station.keel + inset,
  };
}

function railPoint(station: Station, angle: number): ObjectPoint {
  const inner = insetStation(station, SKIN_INSET);
  const cy = (inner.crown + inner.keel) / 2;
  const ry = (inner.crown - inner.keel) / 2;
  const power = inner.upperPower ?? 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const yUnit = sine >= 0 ? Math.pow(sine, 2 / power) : sine;
  return point(inner.halfWidth * cosine, cy + ry * yUnit, station.z);
}

function railSection(station: Station, angle: number, half: number): ObjectPoint[] {
  const [x, y, z] = railPoint(station, angle);
  return [
    point(x - half, y - half, z),
    point(x + half, y - half, z),
    point(x + half, y + half, z),
    point(x - half, y + half, z),
  ];
}

/**
 * ДВА САЛОНА: ДО КРЫЛА И ПОСЛЕ. Командирское решение 15.08.2026.
 *
 * Крыло остаётся на месте — компоновка снаружи не трогается. Кессон проходит
 * серединой фюзеляжа и режет салон надвое, поэтому салона два, а над
 * центропланом между ними — шторка.
 *
 * Уровень пола считается ОТ ЖИТЕЛЯ, а не на глаз: макушка 1.75 м плюс 5 см
 * запаса. Носовой салон держит 1.81 м просвета, хвостовой 1.80 м на самом
 * узком конце. Полы разные, потому что борт к хвосту сужается: один уровень
 * на оба салона либо не даёт встать сзади, либо проваливается ниже киля.
 *
 * Шаг кресел 1.0 м даёт 4 ряда впереди и 3 сзади, по три места в ряду (2+1
 * с проходом) — это 21 место, ровно классическая пассажирская компоновка
 * этого типа.
 */
const CABIN_STAND = 1.75 + 0.05;
/**
 * Границы салонов берутся по ОБВОДУ КРЫЛА, а не по лонжеронам.
 *
 * Первая редакция отступала от лонжеронов (0.38 и −1.91) — и оба салона
 * оказались вдвинуты в крыло: носовой на 0.73 м, хвостовой на 1.29 м. Крыло
 * в корне идёт от z = +1.18 (носок) до −3.24 (хвостик). Пока центроплан
 * стоял у экватора, его верх резал спинки; после опускания на киль коробка
 * уходит под полы, но границы салонов по-прежнему по обводу, не по лонжеронам.
 */
const WING_ROOT_LEADING_Z = 1.18;
const WING_ROOT_TRAILING_Z = -3.24;
const FORWARD_CABIN = { from: WING_ROOT_LEADING_Z + 0.12, to: 4.6, floorY: -0.55 } as const;
const AFT_CABIN = { from: -5.6, to: WING_ROOT_TRAILING_Z - 0.12, floorY: -0.75 } as const;
const CABIN_FLOOR_THICKNESS = 0.05;
/**
 * Кабина экипажа. Двери в неё нет: из переднего салона садятся Space.
 * Носовой отсек (`nose-equipment-bay`) не двигаем — на нём держится центр
 * масс; он же читается центральным туннелем между креслами.
 */
const COCKPIT_BULKHEAD_Z = 5.14;
const COCKPIT_FLOOR_TO = 6.32;
const COCKPIT_SEAT_X = 0.55;
const COCKPIT_SEAT_Z = 5.58;
const COCKPIT_YOKE_X = 0.38;
const COCKPIT_YOKE_Z = 5.90;
const NOSE_BAY_CENTER = point(0, -0.15, 5.55);
const NOSE_BAY_SIZE = point(0.98, 0.64, 1.25);
const COCKPIT_FURNITURE_VOLUME = 0.00022;
const SEAT_PITCH = 1.0;
/**
 * Станции входов. Ширина нужна уже кольцам набора: шпангоут, попавший в
 * проём, читается рудиментом над створкой. Полный план (высота, пол) —
 * ниже, рядом с накладкой.
 */
const CABIN_ENTRY_WIDTH = 0.76;
const CABIN_ENTRY_FORWARD_Z = 4.72;
const CABIN_ENTRY_AFT_Z = -3.85;

function zHitsCabinEntry(z: number, half = 0): boolean {
  for (const centre of [CABIN_ENTRY_FORWARD_Z, CABIN_ENTRY_AFT_Z]) {
    if (Math.abs(z - centre) < CABIN_ENTRY_WIDTH / 2 + half) return true;
  }
  return false;
}

function inCabin(z: number): boolean {
  return (z >= FORWARD_CABIN.from && z <= FORWARD_CABIN.to)
    || (z >= AFT_CABIN.from && z <= AFT_CABIN.to);
}

/**
 * Пассажирская зона целиком, включая проход над центропланом.
 *
 * Кольцом обязан быть не только салонный шпангоут: четыре средних
 * иллюминатора смотрят в проход, и стоявшие там сплошные диски видно
 * насквозь. Переборки остаются там, где они и есть на машине — впереди, за
 * кабиной экипажа, и в хвостовом конусе.
 */
function inPassengerZone(z: number): boolean {
  return z >= AFT_CABIN.from && z <= FORWARD_CABIN.to;
}

const SEAT_WIDTH = 0.42;
const SEAT_GAP = 0.02;
const MIN_AISLE = 0.34;

/**
 * Раскладка ряда по ширине борта. Возвращает пары «номер места, x».
 *
 * Считается по САМОМУ УЗКОМУ сечению салона на уровне НИЖНЕЙ кромки подушки:
 * именно её наружный угол первым выходит за обшивку.
 */
function seatColumns(
  cabin: { readonly from: number; readonly to: number; readonly floorY: number },
): readonly (readonly [number, number])[] {
  const half = Math.min(
    ...[cabin.from, (cabin.from + cabin.to) / 2, cabin.to].map((z) =>
      cabinHalfWidth(sampleStation(z), cabin.floorY)),
  ) - 0.05;
  const outer = half - SEAT_WIDTH / 2;
  // Пара по левому борту: наружное место и соседнее вплотную к нему.
  const pairInnerX = -outer + SEAT_WIDTH + SEAT_GAP;
  // Проход — между внутренней кромкой пары и внутренней кромкой одиночного.
  const aisle = (outer - SEAT_WIDTH / 2) - (pairInnerX + SEAT_WIDTH / 2);
  if (aisle >= MIN_AISLE) {
    return [[0, -outer], [1, pairInnerX], [2, outer]];
  }
  return [[0, -outer], [1, outer]];
}

/** Полуширина внутреннего сечения на высоте y. */
function cabinHalfWidth(station: Station, y: number): number {
  const inner = insetStation(station, SKIN_INSET);
  const cy = (inner.crown + inner.keel) / 2;
  const ry = (inner.crown - inner.keel) / 2;
  const t = Math.min(1, Math.abs(y - cy) / ry);
  return inner.halfWidth * Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * ШПАНГОУТ — КОЛЬЦО, А НЕ ПЕРЕБОРКА.
 *
 * Прежде он строился лофтом двух одинаковых эллипсов с крышками и выходил
 * СПЛОШНЫМ ДИСКОМ во всё сечение: 0.29 м³ стали на штуку. Пока салона не
 * было, это лишь утяжеляло машину; с салоном стало запретом — фюзеляж,
 * нарезанный переборками, не заселить.
 *
 * Кольцо строится лофтом четырёх колец (наружное и внутреннее на двух
 * станциях по z), поэтому в сечении выходит замкнутая рамка глубиной
 * `FRAME_WEB`, а середина остаётся пустой.
 *
 * Салонные шпангоуты красятся цветом салона: пока внутренней обшивки нет,
 * видимый интерьер — это они.
 */
const FRAME_HALF_THICKNESS = 0.022;
// Глубина рамки шпангоута. Была 0.07 — в салоне кольцо такого сечения
// читается трубой, а не набором. Настоящий шпангоут это тонкий профиль.
const FRAME_WEB = 0.032;

for (const station of FUSELAGE_STATIONS.slice(1, -1)) {
  if (station.z > 6.85 + 1e-9) continue;
  // Сплошной диск на бровях, виске и пороге стоит в проёме стёкол и режет
  // кабину. Кольцо ядра обрывается ЗА боковым стеклом; на носу снова своё.
  if (station.z >= COCKPIT_CAGE_AFT_Z - 1e-9 && station.z <= GREENHOUSE_Z_FORE + 1e-9) {
    continue;
  }
  if (zHitsCabinEntry(station.z, FRAME_HALF_THICKNESS)) continue;
  const outer = insetStation(station, SKIN_INSET);
  const inner = insetStation(station, SKIN_INSET + FRAME_WEB);
  // КОЛЬЦОМ СТАНОВИТСЯ ТОЛЬКО САЛОННЫЙ ШПАНГОУТ.
  //
  // Вне салона переборка — не ошибка, а конструкция: за кабиной экипажа, у
  // носового багажника и в хвосте они есть и в жизни. Оставить их сплошными
  // важно ещё и потому, что фюзеляж толще ВПЕРЕДИ: раскольцевав всё подряд,
  // машина теряет переднюю массу и центр уезжает за центр подъёма — она
  // становится неустойчивой и лётная модель расходится.
  const lofted = inPassengerZone(station.z)
    ? loftRings([
        ellipseRing({ ...outer, z: station.z + FRAME_HALF_THICKNESS }),
        ellipseRing({ ...outer, z: station.z - FRAME_HALF_THICKNESS }),
        ellipseRing({ ...inner, z: station.z - FRAME_HALF_THICKNESS }),
        ellipseRing({ ...inner, z: station.z + FRAME_HALF_THICKNESS }),
        ellipseRing({ ...outer, z: station.z + FRAME_HALF_THICKNESS }),
      ], { start: false, end: false })
    : loftRings([
        ellipseRing({ ...outer, z: station.z + FRAME_HALF_THICKNESS }),
        ellipseRing({ ...outer, z: station.z - FRAME_HALF_THICKNESS }),
      ]);
  addClosedMesh(
    `fuselage-frame-z${station.z}`,
    inPassengerZone(station.z) ? "cabin-frame" : "structure-fuselage",
    inPassengerZone(station.z) ? "cladding" : "metal",
    lofted.vertices,
    lofted.triangles,
  );
}

/**
 * ДОПОЛНИТЕЛЬНЫЕ ШПАНГОУТЫ САЛОНА — ПОД ИЛЛЮМИНАТОРЫ И ПОД ВИД.
 *
 * Авторская таблица станций редкая: в салоне между ними 2–3 м, а окно этого
 * типа идёт примерно через метр. Промежуточные кольца снимаются с той же
 * таблицы через `sampleStation`, то есть лежат на тех же отрезках лофта и
 * форму не меняют вообще.
 *
 * Дешёвыми они стали ровно потому, что перестали быть переборками: кольцо
 * весит впятеро меньше диска, и уплотнение больше не двигает машину.
 */
/**
 * РАСКЛАДКА САЛОНА: РЯДЫ, ШПАНГОУТЫ И ОКНА ИЗ ОДНОГО ИСТОЧНИКА.
 *
 * Ряд кресел, пролёт между шпангоутами и иллюминатор — это одна разбивка, а
 * не три независимые. Шпангоут стоит на ГРАНИЦЕ ряда, окно — в СЕРЕДИНЕ
 * пролёта, поэтому за каждым окном оказывается кресло, а рама не режет стекло.
 * Считать их порознь значит получить окно в шпангоуте на третьем ряду.
 */
function cabinRowZ(
  cabin: { readonly from: number; readonly to: number },
): readonly number[] {
  const rows = Math.floor((cabin.to - cabin.from) / SEAT_PITCH);
  const used = rows * SEAT_PITCH;
  const start = cabin.to - (cabin.to - cabin.from - used) / 2 - SEAT_PITCH / 2;
  return Array.from({ length: rows }, (_, row) => start - row * SEAT_PITCH);
}

/**
 * Ряд иллюминаторов. Высота одна на весь борт — линия обязана быть прямой,
 * иначе тип не читается. 0.50 выбрано так, чтобы окно было выше верха кессона
 * (0.21) и при этом на уровне глаз сидящего в носовом салоне.
 */
const WINDOW_ROW_CENTRE_Y = 0.5;
const WINDOW_ROW_FIRST_Z = 3.2;
const WINDOW_ROW_PITCH = 1.15;
export const DC3_WINDOW_SIZE = { along: 0.38, across: 0.42 } as const;

/**
 * ПЛАН ВХОДОВ — СДВИЖНЫЕ СТВОРКИ В НАСТОЯЩИХ ПРОЁМАХ.
 *
 * Четыре створки, оба борта: передние в глухом пролёте кабина→первый
 * иллюминатор, задние вместо седьмого окна, сдвинутые на 15 см за его
 * прежний центр, чтобы не сесть на хвостик крыла. Углы скруглены, как у
 * самолётной двери, а не столярной филёнки. Полотно и остекление —
 * `:board:0` / `:board:1`, как у вагона небесного поезда: прислонно-сдвижные
 * к хвосту. Проём — отсутствие шкуры; накладка только обводит его.
 */
const CABIN_ENTRY_HEIGHT = 1.66;
const CABIN_ENTRY_CORNER = 0.15;
/**
 * Створка не сидит в обводе всплошную: между ними щель под герметик.
 * Сначала узкий просвет (видна шкура), затем тёмная лента уплотнения,
 * снаружи — металлический гермообвод. Параллель: радиус растёт вместе
 * с полуосями, иначе на заднем верхнем углу лента расходится.
 */
const CABIN_ENTRY_SEAL_REVEAL = 0.008;
const CABIN_ENTRY_SEAL_STRIP = 0.018;
const CABIN_ENTRY_SEAL_GAP = CABIN_ENTRY_SEAL_REVEAL + CABIN_ENTRY_SEAL_STRIP;
const CABIN_ENTRY_FRAME_WIDTH = 0.048;
/** Накладка сидит на лофте, не на 2 см воздуха перед шкурой. */
const CABIN_ENTRY_OVERLAY_OUTWARD = 0.012;
const CABIN_ENTRY_CAGE_WEB = 0.055;
const CABIN_ENTRY_PANE = { along: 0.3, across: 0.34, corner: 0.08, sill: 1.02 } as const;
const CABIN_ENTRY_PLANS = [
  {
    id: "forward",
    z: CABIN_ENTRY_FORWARD_Z,
    floorY: FORWARD_CABIN.floorY,
  },
  {
    id: "aft",
    z: CABIN_ENTRY_AFT_Z,
    floorY: AFT_CABIN.floorY,
  },
] as const;

function cabinEntryContains(
  z: number,
  y: number,
  plan: (typeof CABIN_ENTRY_PLANS)[number],
  margin = 0,
): boolean {
  const yCentre = plan.floorY + CABIN_ENTRY_HEIGHT / 2;
  const dz = z - plan.z;
  if (Math.abs(dz) > CABIN_ENTRY_WIDTH / 2 + margin) return false;
  const halfY = roundedRectHalfAcross(
    dz,
    CABIN_ENTRY_WIDTH / 2,
    CABIN_ENTRY_HEIGHT / 2,
    CABIN_ENTRY_CORNER,
  );
  return Math.abs(y - yCentre) <= halfY + margin;
}

function cabinEntryBlocksRow(z: number, halfAlong = 0.25): boolean {
  return CABIN_ENTRY_PLANS.some((plan) =>
    Math.abs(z - plan.z) < CABIN_ENTRY_WIDTH / 2 + halfAlong);
}

/**
 * ДВА ЦЕНТРАЛЬНЫХ СТЕКЛА — ПЛОСКИЕ ПАРАЛЛЕЛОГРАММЫ, НЕ ОВАЛЬНЫЕ ПЛИТКИ.
 *
 * Боковая проекция типа (двухстекольная на борт): верх и низ горизонтальны,
 * переднее ребро — стойка — около 60° к горизонту, два полотна домиком
 * (в плане нормали расходятся на 60°). Размер пока держим с прошлой посадки
 * на нашу кабину; боковое стекло — ниже порога лобовых, верх и низ в горизонте.
 */
const WINDSHIELD_Z_AFT = GREENHOUSE_Z_AFT;
const WINDSHIELD_Z_FORE = GREENHOUSE_Z_FORE;
const WINDSHIELD_INBOARD_X = 0.08;
const WINDSHIELD_ALONG = 0.262;
const WINDSHIELD_ACROSS = 0.548;
const WINDSHIELD_MULLION = Math.PI / 3;
const WINDSHIELD_YAW = Math.PI / 6;
/** Вертикальный спуск порога бокового стекла ниже лобового — полная высота до обрезки. */
const SIDE_SILL_DROP = 0.22;
/** Оставляем две трети высоты: обрезаем снизу, верхняя линия на месте. */
const SIDE_HEIGHT_KEEP = 2 / 3;
/** Длина верхней кромки вдоль −Z. Четверть короче первой посадки. */
const SIDE_AFT = 0.55 * 0.75;
/**
 * Нижняя вершина задней стойки сдвинута к носу. На одном шпангоуте плоская
 * рама не садится на кривой овал сразу у брови и у порога — отсюда 10 см
 * утопления и обвод, который складывался под стекло. Небольшой наклон даёт
 * второй датиум: обе наружные задние вершины лежат на лофте.
 */
const SIDE_AFT_SILL_RAKE = 0.08;

function windshieldCorners(
  sign: 1 | -1,
): readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint] {
  const sillY = ellipsePoint(
    sampleStation(WINDSHIELD_Z_FORE),
    Math.PI / 2 - sign * 0.08,
  )[1];
  const sillIn: ObjectPoint = [sign * WINDSHIELD_INBOARD_X, sillY, WINDSHIELD_Z_FORE];
  const along: ObjectPoint = [
    0,
    Math.sin(WINDSHIELD_MULLION) * WINDSHIELD_ALONG,
    -Math.cos(WINDSHIELD_MULLION) * WINDSHIELD_ALONG,
  ];
  const across: ObjectPoint = [
    sign * Math.cos(WINDSHIELD_YAW) * WINDSHIELD_ACROSS,
    0,
    -Math.sin(WINDSHIELD_YAW) * WINDSHIELD_ACROSS,
  ];
  const sillOut = add(sillIn, across);
  const headIn = add(sillIn, along);
  const headOut = add(headIn, across);
  return [sillIn, sillOut, headOut, headIn];
}

/**
 * БОКОВОЕ СТЕКЛО ДВУСТЕКОЛЬНОЙ СХЕМЫ.
 *
 * Стык с лобовым — по НАРУЖНЫМ углам рам, не по стеклу. Задняя стойка
 * сидит так, чтобы обвязка не вылезала из лофта. Верх и низ горизонтальны.
 * Задняя кромка чуть наклонена: порог ближе к носу, чем бровь, чтобы
 * наружная рама лежала на лофте и у брови, и у порога.
 */
function loftAngleAtY(station: Station, y: number, sign: 1 | -1): number {
  const cy = (station.crown + station.keel) / 2;
  const ry = (station.crown - station.keel) / 2;
  const power = station.upperPower ?? 2;
  const unit = Math.max(0, Math.min(1, (y - cy) / Math.max(ry, 1e-9)));
  const sine = Math.pow(unit, power / 2);
  const angle = Math.asin(Math.max(0, Math.min(1, sine)));
  return sign > 0 ? angle : Math.PI - angle;
}

function loftPointAtY(z: number, y: number, sign: 1 | -1): ObjectPoint {
  const station = sampleStation(z);
  const sampled = ellipsePoint(station, loftAngleAtY(station, y, sign));
  return [sampled[0], y, z];
}

/**
 * Точка борта на заданной высоте, включая НИЖНЮЮ половину овала.
 *
 * `loftAngleAtY` зажимает y ниже экватора к поясу — для окон, которые сидят
 * выше, этого хватает. Дверь идёт от пола, и порог обязан лежать на килевой
 * половине сечения, а не вылезать на экватор.
 */
function sideSkinAngle(station: Station, y: number, sign: 1 | -1): number {
  const cy = (station.crown + station.keel) / 2;
  const ry = (station.crown - station.keel) / 2;
  const power = station.upperPower ?? 2;
  let angle: number;
  if (y >= cy) {
    const unit = Math.max(0, Math.min(1, (y - cy) / Math.max(ry, 1e-9)));
    const sine = Math.pow(unit, power / 2);
    angle = Math.asin(Math.max(0, Math.min(1, sine)));
  } else {
    const unit = Math.max(-1, Math.min(0, (y - cy) / Math.max(ry, 1e-9)));
    angle = Math.asin(unit);
  }
  return sign > 0 ? angle : Math.PI - angle;
}

function sideSkinPoint(
  z: number,
  y: number,
  sign: 1 | -1,
  outward: number,
): ObjectPoint {
  const station = sampleStation(z);
  const surface = ellipsePoint(station, sideSkinAngle(station, y, sign));
  const cy = (station.crown + station.keel) / 2;
  const dx = surface[0];
  const dy = surface[1] - cy;
  const length = Math.hypot(dx, dy) || 1;
  return [
    surface[0] + (dx / length) * outward,
    surface[1] + (dy / length) * outward,
    surface[2],
  ];
}

function roundedRectHalfAcross(
  deltaAlong: number,
  halfAlong: number,
  halfAcross: number,
  radius: number,
): number {
  const corner = Math.min(radius, halfAlong - 0.02, halfAcross - 0.02);
  const abs = Math.abs(deltaAlong);
  const straight = halfAlong - corner;
  if (abs <= straight) return halfAcross;
  if (abs >= halfAlong) return Math.max(0.02, halfAcross - corner);
  const t = (abs - straight) / corner;
  return (halfAcross - corner) + corner * Math.sqrt(Math.max(0, 1 - t * t));
}

function roundedRectLoop(
  zCentre: number,
  yCentre: number,
  halfAlong: number,
  halfAcross: number,
  radius: number,
): { readonly z: number; readonly y: number }[] {
  const corner = Math.min(radius, halfAlong - 0.02, halfAcross - 0.02);
  const zStraight = halfAlong - corner;
  const yStraight = halfAcross - corner;
  const points: { z: number; y: number }[] = [];
  const arcSteps = 8;
  const lineSteps = 5;
  const pushLine = (
    z0: number,
    y0: number,
    z1: number,
    y1: number,
  ): void => {
    for (let i = 0; i < lineSteps; i += 1) {
      const t = i / lineSteps;
      points.push({ z: z0 + (z1 - z0) * t, y: y0 + (y1 - y0) * t });
    }
  };
  const pushArc = (
    cz: number,
    cy: number,
    from: number,
    to: number,
  ): void => {
    for (let i = 0; i < arcSteps; i += 1) {
      const angle = from + (to - from) * (i / arcSteps);
      points.push({
        z: cz + corner * Math.cos(angle),
        y: cy + corner * Math.sin(angle),
      });
    }
  };
  pushLine(zCentre - zStraight, yCentre + halfAcross, zCentre + zStraight, yCentre + halfAcross);
  pushArc(zCentre + zStraight, yCentre + yStraight, Math.PI / 2, 0);
  pushLine(zCentre + halfAlong, yCentre + yStraight, zCentre + halfAlong, yCentre - yStraight);
  pushArc(zCentre + zStraight, yCentre - yStraight, 0, -Math.PI / 2);
  pushLine(zCentre + zStraight, yCentre - halfAcross, zCentre - zStraight, yCentre - halfAcross);
  pushArc(zCentre - zStraight, yCentre - yStraight, -Math.PI / 2, -Math.PI);
  pushLine(zCentre - halfAlong, yCentre - yStraight, zCentre - halfAlong, yCentre + yStraight);
  pushArc(zCentre - zStraight, yCentre + yStraight, Math.PI, Math.PI / 2);
  return points;
}

function addSideOverlayTile(
  id: string,
  material: ObjectMaterialId,
  outer: readonly ObjectPoint[],
  inner: readonly ObjectPoint[],
  rowCount: number,
  cols: number,
  closedRing = false,
  group = "cabin-entry-overlay",
  volume: number | undefined = group === "cabin-entry-overlay" ? 0.0002 : undefined,
): void {
  const vertices = [...outer, ...inner];
  const offset = outer.length;
  const triangles: ObjectTriangle[] = [];
  const index = (row: number, column: number): number => row * cols + column;
  const columns = closedRing ? cols : cols - 1;
  for (let row = 0; row + 1 < rowCount; row += 1) {
    for (let step = 0; step < columns; step += 1) {
      const column = step;
      const next = (step + 1) % cols;
      const a = index(row, column);
      const b = index(row, next);
      const c = index(row + 1, next);
      const d = index(row + 1, column);
      triangles.push([a, b, c], [a, c, d]);
      triangles.push(
        [offset + a, offset + c, offset + b],
        [offset + a, offset + d, offset + c],
      );
    }
  }
  const rim = (a: number, b: number): void => {
    triangles.push([a, offset + a, offset + b], [a, offset + b, b]);
  };
  for (let step = 0; step < columns; step += 1) {
    const column = step;
    const next = (step + 1) % cols;
    rim(index(rowCount - 1, column), index(rowCount - 1, next));
    rim(index(0, next), index(0, column));
  }
  if (!closedRing) {
    for (let row = 0; row + 1 < rowCount; row += 1) {
      rim(index(row, cols - 1), index(row + 1, cols - 1));
      rim(index(row + 1, 0), index(row, 0));
    }
  }
  addClosedMesh(id, group, material, vertices, triangles, {
    volume,
  });
}

function addCabinEntryLeaf(
  id: string,
  material: ObjectMaterialId,
  sign: 1 | -1,
  zCentre: number,
  yCentre: number,
  width: number,
  height: number,
  radius: number,
  outward: number,
): void {
  const halfAlong = width / 2;
  const halfAcross = height / 2;
  const zSteps = 12;
  const ySteps = 16;
  const outer: ObjectPoint[] = [];
  const inner: ObjectPoint[] = [];
  for (let row = 0; row <= zSteps; row += 1) {
    const z = zCentre - halfAlong + (width * row) / zSteps;
    const halfY = roundedRectHalfAcross(z - zCentre, halfAlong, halfAcross, radius);
    for (let column = 0; column <= ySteps; column += 1) {
      const y = yCentre - halfY + (2 * halfY * column) / ySteps;
      outer.push(sideSkinPoint(z, y, sign, outward));
      inner.push(sideSkinPoint(z, y, sign, outward - 0.012));
    }
  }
  addSideOverlayTile(id, material, outer, inner, zSteps + 1, ySteps + 1);
}

function addCabinEntryRing(
  id: string,
  material: ObjectMaterialId,
  sign: 1 | -1,
  zCentre: number,
  yCentre: number,
  width: number,
  height: number,
  radius: number,
  outward: number,
  innerOffset: number,
  outerOffset: number,
  group = "cabin-entry-overlay",
  thickness = 0.012,
): void {
  const innerLoop = roundedRectLoop(
    zCentre,
    yCentre,
    width / 2 + innerOffset,
    height / 2 + innerOffset,
    radius + innerOffset,
  );
  const outerLoop = roundedRectLoop(
    zCentre,
    yCentre,
    width / 2 + outerOffset,
    height / 2 + outerOffset,
    radius + outerOffset,
  );
  const proud = [...innerLoop, ...outerLoop].map((sample) =>
    sideSkinPoint(sample.z, sample.y, sign, outward));
  const inset = [...innerLoop, ...outerLoop].map((sample) =>
    sideSkinPoint(sample.z, sample.y, sign, outward - thickness));
  addSideOverlayTile(
    id,
    material,
    proud,
    inset,
    2,
    innerLoop.length,
    true,
    group,
    group === "cabin-entry-overlay" ? 0.0002 : undefined,
  );
}

/** Совпадает с `FRAME_WIDTH` панелей: стык считаем по наружной обвязке. */
const GREENHOUSE_FRAME = 0.045;

function unitPoint(vector: ObjectPoint): ObjectPoint {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return scale(vector, 1 / Math.max(length, 1e-9));
}

function expandFrame(
  corners: readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint],
): readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint] {
  const along = unitPoint(sub(corners[3], corners[0]));
  const across = unitPoint(sub(corners[1], corners[0]));
  const mid: ObjectPoint = [
    (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4,
    (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4,
    (corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4,
  ];
  const expanded = corners.map((corner) => {
    const fromMid = sub(corner, mid);
    const alongDot = fromMid[0] * along[0] + fromMid[1] * along[1] + fromMid[2] * along[2];
    const acrossDot = fromMid[0] * across[0] + fromMid[1] * across[1] + fromMid[2] * across[2];
    const du = alongDot >= 0 ? GREENHOUSE_FRAME : -GREENHOUSE_FRAME;
    const dv = acrossDot >= 0 ? GREENHOUSE_FRAME : -GREENHOUSE_FRAME;
    return add(corner, add(scale(along, du), scale(across, dv)));
  });
  return expanded as unknown as readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint];
}

function sideLightCorners(
  sign: 1 | -1,
): readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint] {
  const windshield = windshieldCorners(sign);
  const [, sillOut, headOut] = windshield;
  const pillar = sub(headOut, sillOut);
  const pillarLen = Math.hypot(pillar[0], pillar[1], pillar[2]);
  const extra = SIDE_SILL_DROP / (pillar[1] / pillarLen);
  const fullSill = add(sillOut, scale(pillar, -extra / pillarLen));
  const headY = headOut[1];
  const sillY = headY - (headY - fullSill[1]) * SIDE_HEIGHT_KEEP;
  const fullForeSillZ = fullSill[2];
  const targetOuter = expandFrame(windshield)[2];
  const build = (
    headFore: ObjectPoint,
    aftHeadX: number | undefined,
    aftSillXHint: number | undefined,
  ): readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint] => {
    const headForeZ = headFore[2];
    const foreSillZ = headForeZ + (fullForeSillZ - headForeZ) * SIDE_HEIGHT_KEEP;
    const aftZ = headForeZ - SIDE_AFT;
    const aftSillZ = aftZ + SIDE_AFT_SILL_RAKE;
    const loftAftHead = loftPointAtY(aftZ, headFore[1], sign);
    const clampedAftX = aftHeadX === undefined
      ? loftAftHead[0]
      : sign > 0
        ? Math.min(aftHeadX, loftAftHead[0])
        : Math.max(aftHeadX, loftAftHead[0]);
    const aftHead: ObjectPoint = [clampedAftX, headFore[1], aftZ];
    const loftAftSill = loftPointAtY(aftSillZ, sillY, sign);
    const clampedAftSillX = aftSillXHint === undefined
      ? loftAftSill[0]
      : sign > 0
        ? Math.min(aftSillXHint, loftAftSill[0])
        : Math.max(aftSillXHint, loftAftSill[0]);
    const aftSill: ObjectPoint = [clampedAftSillX, sillY, aftSillZ];
    const normal = cross(sub(aftSill, aftHead), sub(headFore, aftHead));
    const loftForeSill = loftPointAtY(foreSillZ, sillY, sign);
    const dy = sillY - aftHead[1];
    const dz = foreSillZ - aftHead[2];
    const solvedForeX = Math.abs(normal[0]) < 1e-9
      ? loftForeSill[0]
      : aftHead[0] - (dy * normal[1] + dz * normal[2]) / normal[0];
    const foreSillX = sign > 0
      ? Math.min(solvedForeX, loftForeSill[0])
      : Math.max(solvedForeX, loftForeSill[0]);
    const foreSill: ObjectPoint = [foreSillX, sillY, foreSillZ];
    return [foreSill, aftSill, aftHead, headFore];
  };
  let headFore: ObjectPoint = headOut;
  let aftHeadX: number | undefined;
  let aftSillX: number | undefined;
  let corners = build(headFore, aftHeadX, aftSillX);
  for (let pass = 0; pass < 5; pass += 1) {
    const along = unitPoint(sub(corners[3], corners[0]));
    const across = unitPoint(sub(corners[1], corners[0]));
    headFore = [
      targetOuter[0] - along[0] * GREENHOUSE_FRAME + across[0] * GREENHOUSE_FRAME,
      targetOuter[1] - along[1] * GREENHOUSE_FRAME + across[1] * GREENHOUSE_FRAME,
      targetOuter[2] - along[2] * GREENHOUSE_FRAME + across[2] * GREENHOUSE_FRAME,
    ];
    corners = build(headFore, aftHeadX, aftSillX);
    const outer = expandFrame(corners);
    const loftAtHead = loftPointAtY(outer[2][2], outer[2][1], sign);
    aftHeadX = corners[2][0] - (outer[2][0] - loftAtHead[0]);
    const loftAtSill = loftPointAtY(outer[1][2], outer[1][1], sign);
    aftSillX = corners[1][0] - (outer[1][0] - loftAtSill[0]);
    corners = build(headFore, aftHeadX, aftSillX);
  }
  return corners;
}

/**
 * Третье полотно фонаря: щель между лобовым и боковым.
 * Типа так нет — это рабочая грань кабины, не реставрация.
 */
function cornerLightCorners(
  sign: 1 | -1,
): readonly [ObjectPoint, ObjectPoint, ObjectPoint, ObjectPoint] {
  const windshield = windshieldCorners(sign);
  const side = sideLightCorners(sign);
  return [windshield[1], side[0], side[3], windshield[2]];
}

/**
 * Кольцо 5.8 остаётся датиумом крыши: к нему сходится округлый close.
 * Сам лоб больше не один треугольник — visor плоский, на наружных бровях.
 */
function greenhouseBrowFairing(): {
  readonly apex: ObjectPoint;
  readonly leftIn: ObjectPoint;
  readonly leftOut: ObjectPoint;
  readonly rightIn: ObjectPoint;
  readonly rightOut: ObjectPoint;
} {
  const right = windshieldCorners(1);
  const left = windshieldCorners(-1);
  return {
    apex: ellipsePoint(sampleStation(BROW_FAIRING_APEX_Z), Math.PI / 2),
    leftIn: left[3],
    leftOut: left[2],
    rightIn: right[3],
    rightOut: right[2],
  };
}

/**
 * Датиум лба: шеврон наружных бровей двух лобовых (visorFore — пик V,
 * visorAft — наружные внешние углы). Сама панель лба — не плоская крышка
 * в этом V, а выпуклый сход по образующим на кольцо 5.8; её считает обшивка.
 */
function greenhouseForehead(): {
  readonly visorFore: readonly [ObjectPoint, ObjectPoint, ObjectPoint];
  readonly visorAft: readonly [ObjectPoint, ObjectPoint, ObjectPoint];
} {
  const right = expandFrame(windshieldCorners(1));
  const left = expandFrame(windshieldCorners(-1));
  const mid = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
  return {
    visorFore: [left[3], mid(left[3], right[3]), right[3]],
    visorAft: [left[2], mid(left[2], right[2]), right[2]],
  };
}

/**
 * Порожные треугольники: вершина на первом кольце колпака, основание —
 * нижние рамы. Овальная палуба сама прямые пороги не обнимает.
 */
function greenhouseSillFairing(): {
  readonly apex: ObjectPoint;
  readonly leftIn: ObjectPoint;
  readonly leftOut: ObjectPoint;
  readonly rightIn: ObjectPoint;
  readonly rightOut: ObjectPoint;
} {
  const right = windshieldCorners(1);
  const left = windshieldCorners(-1);
  return {
    apex: ellipsePoint(sampleStation(SILL_FAIRING_APEX_Z), Math.PI / 2),
    leftIn: left[0],
    leftOut: left[1],
    rightIn: right[0],
    rightOut: right[1],
  };
}

for (const cabin of [FORWARD_CABIN, AFT_CABIN]) {
  const rowZs = cabinRowZ(cabin);
  const frameZs = [
    rowZs[0] + SEAT_PITCH / 2,
    ...rowZs.map((z) => z - SEAT_PITCH / 2),
  ];
  for (const z of frameZs) {
    // Станции авторской таблицы уже несут своё кольцо — не дублируем.
    if (FUSELAGE_STATIONS.some((station) => Math.abs(station.z - z) < 0.2)) continue;
    if (zHitsCabinEntry(z, FRAME_HALF_THICKNESS)) continue;
    const station = sampleStation(z);
    const outer = insetStation(station, SKIN_INSET);
    const inner = insetStation(station, SKIN_INSET + FRAME_WEB);
    const lofted = loftRings([
      ellipseRing({ ...outer, z: z + FRAME_HALF_THICKNESS }),
      ellipseRing({ ...outer, z: z - FRAME_HALF_THICKNESS }),
      ellipseRing({ ...inner, z: z - FRAME_HALF_THICKNESS }),
      ellipseRing({ ...inner, z: z + FRAME_HALF_THICKNESS }),
      ellipseRing({ ...outer, z: z + FRAME_HALF_THICKNESS }),
    ], { start: false, end: false });
    addClosedMesh(
      `cabin-frame-z${z.toFixed(2)}`,
      "cabin-frame",
      "cladding",
      lofted.vertices,
      lofted.triangles,
    );
  }
}

/**
 * НАЧИНКА САЛОНОВ.
 *
 * Пол, кресла и шторка. Внутренней обшивки нет намеренно: пока видимый
 * интерьер — это шпангоуты, покрашенные цветом салона, и решение о зашивке
 * борта отложено.
 */
for (const [tag, cabin] of [["fwd", FORWARD_CABIN], ["aft", AFT_CABIN]] as const) {
  const length = cabin.to - cabin.from;
  const centreZ = (cabin.from + cabin.to) / 2;
  // Ширина пола берётся по САМОМУ УЗКОМУ сечению салона, а не по среднему:
  // иначе настил в хвостовом конце вылезет за борт.
  // Ширина берётся по НИЖНЕЙ грани настила и по самому узкому сечению: у
  // пола есть толщина, и борт на его нижней грани уже, чем на верхней.
  const width = Math.min(
    ...[cabin.from, centreZ, cabin.to].map((z) =>
      cabinHalfWidth(sampleStation(z), cabin.floorY - CABIN_FLOOR_THICKNESS) * 2),
  ) - 0.08;
  addBodyBox(
    `cabin-${tag}-floor`,
    "cabin-floor",
    "timber-mid",
    point(0, cabin.floorY - CABIN_FLOOR_THICKNESS / 2, centreZ),
    point(width, CABIN_FLOOR_THICKNESS, length),
  );

  // Кресла: два по левому борту, одно по правому, между ними проход. Так
  // сидели в этом типе, и так ряд помещается в наш борт с запасом.
  for (const [row, z] of cabinRowZ(cabin).entries()) {
    if (cabinEntryBlocksRow(z)) continue;
    // РЯД ВЫВОДИТСЯ ИЗ СЕЧЕНИЯ, А НЕ ЗАДАЁТСЯ ЧИСЛАМИ.
    //
    // Свободная полуширина на уровне пола у двух салонов разная: хвостовой
    // и уже, и пол в нём ниже. Подбирать координаты руками значит ловить
    // вылезающий угол кресла на каждом кадре, поэтому они считаются.
    //
    // Три места в ряду (2+1) ставятся, только если между блоками остаётся
    // настоящий проход; иначе ряд честно становится 1+1.
    for (const [seat, x] of seatColumns(cabin) as readonly (readonly [number, number])[]) {
      addBodyBox(
        `cabin-${tag}-seat-${row}-${seat}`,
        "cabin-seats",
        "timber-dark",
        point(x, cabin.floorY + 0.22, z),
        point(0.42, 0.44, 0.5),
      );
      // Спинка ПОЗАДИ подушки. Нос у объекта смотрит в +Z, поэтому у
      // сидящего лицом вперёд спинка стоит на меньшем z. Знак здесь один
      // раз перепутан не будет: пассажиры сидят по полёту.
      addBodyBox(
        `cabin-${tag}-seat-${row}-${seat}-back`,
        "cabin-seats",
        "timber-dark",
        point(x, cabin.floorY + 0.66, z - 0.2),
        point(0.42, 0.62, 0.1),
      );
    }
  }
}

/**
 * СВЕТ МАШИНЫ: ПОСАДОЧНЫЕ ФАРЫ, АНО, ПЛАФОНЫ САЛОНА.
 *
 * Правило репозитория про свет жёсткое и здесь исполнено буквально: источник
 * принадлежит ЛАМПЕ внутри прозрачного колпака, а не самому колпаку и не
 * корпусу. У каждой цепочка держателей: носитель → корпус → колпак → лампа.
 *
 * Фары не врезаются в крыло: на носке стоит аккуратный обтекаемый корпус.
 * Вырез в кессоне ради света — это работа по силовому набору, и она того не
 * стоит, пока фара читается и снаружи.
 */
const LANDING_LIGHT_X = 7.6;

/**
 * Фара горит на взлёте и заходе, а не «всегда ночью».
 *
 * Уровни объявлены здесь, а привязка к кластеру — в документе сцены: id
 * кластера знает размещение, а не объект.
 */
export const DC3_LANDING_LIGHT_LEVELS = {
  docked: 0,
  inTransit: 0,
  departure: 1,
  approach: 1,
  rollout: 1,
  taxi: 0.35,
} as const;

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  const x = sign * LANDING_LIGHT_X;
  const nose = airfoilBand(x, 0, 0)[0];
  const { thickness } = wingAt(x);
  // Корпус на носке, лампа внутри колпака, колпак смотрит вперёд.
  addBodyBox(`landing-light-${side}-body`, "lights", "metal",
    point(x, nose[1] - thickness * 0.08, nose[2] - 0.12),
    point(0.34, 0.2, 0.3));
  addCylinder(`landing-light-${side}-lens`, "lights", "lamp-glass",
    point(x, nose[1] - thickness * 0.08, nose[2] + 0.02),
    point(x, nose[1] - thickness * 0.08, nose[2] + 0.05), 0.13, 14);
  parts.push({
    kind: "box",
    id: `landing-light-${side}-bulb`,
    group: "lights",
    material: "lamp-bulb",
    center: bodyToWorld(point(x, nose[1] - thickness * 0.08, nose[2] - 0.03)),
    size: [0.09, 0.09, 0.09],
    light: {
      color: "#fff3d6",
      distance: 46,
      intensity: 9,
      dayIntensityFactor: 0.05,
      poolPriority: 3.4,
      poolGroupId: "dc3-landing-lights",
      reservePoolGroup: sign > 0,
      transition: { fadeInSeconds: 0.6, fadeOutSeconds: 1.2 },
    },
  });

  // АНО НА ЗАКОНЦОВКЕ: КРАСНЫЙ СЛЕВА, ЗЕЛЁНЫЙ СПРАВА — И ЭТО НЕ ЗНАК X.
  //
  // Нос объекта смотрит в +Z, верх в +Y, значит правый борт машины — это
  // forward × up = (0,0,1) × (0,1,0) = (−1,0,0), то есть МИНУС X. Якоря
  // блокаута названы наоборот (`rightWingTip` стоит на +X), и первая
  // редакция огней это унаследовала: зелёный оказался слева, красный справа.
  //
  // Поэтому здесь борт называется своим именем, а не «left/right» объекта.
  // Колпак — тот же, что у датчика дистанции: стеклянная сфера с конусом,
  // ось наружу; лампа внутри купола, чтобы светить вбок, а не в крыло.
  const board = sign > 0 ? "port" : "starboard";
  const tip = airfoilBand(sign * (WING_HALF - 0.04), 0.18, 0.18)[0];
  const capOrigin = point(sign * WING_HALF, tip[1], tip[2]);
  const outward = point(sign, 0, 0);
  addBodyBox(`nav-light-${board}-base`, "lights", "metal",
    point(sign * (WING_HALF - SENSOR_CAP_NECK_LENGTH * 0.45), tip[1], tip[2]),
    point(0.08, 0.06, 0.1));
  addGlassSensorCap(`nav-light-${board}-cap`, capOrigin, outward);
  parts.push({
    kind: "box",
    id: `nav-light-${board}-bulb`,
    group: "lights",
    material: "lamp-bulb",
    center: bodyToWorld(add(capOrigin, scale(outward, SENSOR_CAP_DOME * 0.35))),
    size: [0.028, 0.028, 0.028],
    light: {
      color: sign > 0 ? "#ff4d4d" : "#4dff86",
      distance: 14,
      intensity: 1.6,
      dayIntensityFactor: 0.12,
      poolPriority: 2.2,
      poolGroupId: "dc3-nav-lights",
      transition: { fadeInSeconds: 0.4, fadeOutSeconds: 0.6 },
    },
  });
}

// Хвостовой АНО — белый, на верхушке киля у задней кромки.
{
  const tail = FIN_STATIONS[FIN_STATIONS.length - 2];
  const y = finHeight(tail, tail.trailZ);
  const capOrigin = point(0, y, tail.trailZ - 0.04);
  addBodyBox("nav-light-tail-base", "lights", "metal",
    point(0, y, tail.trailZ - 0.02),
    point(0.09, 0.09, 0.12));
  addGlassSensorCap("nav-light-tail-cap", capOrigin, point(0, 0, -1));
  parts.push({
    kind: "box",
    id: "nav-light-tail-bulb",
    group: "lights",
    material: "lamp-bulb",
    center: bodyToWorld(point(0, y, capOrigin[2] - SENSOR_CAP_DOME * 0.35)),
    size: [0.028, 0.028, 0.028],
    light: {
      color: "#fff6e8",
      distance: 12,
      intensity: 1.3,
      dayIntensityFactor: 0.12,
      poolPriority: 2.0,
      poolGroupId: "dc3-nav-lights",
      transition: { fadeInSeconds: 0.4, fadeOutSeconds: 0.6 },
    },
  });
}

// Плафоны салона: тарелка сидит в поясе шпангоута под обводом, лампа —
// внутри тарелки, не отдельным куском ткани в воздухе. Решатель иначе
// считает лампу висящей: ткань не несёт, а прежний зазор 2.5 мм меньше
// порога бокового крепления.
for (const [tag, cabin] of [["fwd", FORWARD_CABIN], ["aft", AFT_CABIN]] as const) {
  for (const [row, z] of cabinRowZ(cabin).entries()) {
    const station = sampleStation(z);
    const y = station.crown - SKIN_INSET - 0.1;
    addBodyBox(`cabin-lamp-${tag}-${row}-shade`, "cabin-trim", "metal",
      point(0, y, z), point(0.2, 0.07, 0.16));
    parts.push({
      kind: "box",
      id: `cabin-lamp-${tag}-${row}-bulb`,
      group: "cabin-trim",
      material: "lamp-bulb",
      center: bodyToWorld(point(0, y - 0.018, z)),
      size: [0.08, 0.05, 0.08],
      light: {
        color: "#ffd9a3",
        distance: 4.6,
        intensity: 1.5,
        dayIntensityFactor: 0.75,
        interior: true,
        poolPriority: 2.6,
        poolGroupId: `dc3-cabin-${tag}`,
        reservePoolGroup: row === 0,
      },
    });
  }
}

/**
 * ТО, ЧЕГО В БЛОКАУТЕ НЕ БЫЛО: БАКИ И НОСОВОЙ ОТСЕК.
 *
 * B01 своей же строкой исключает «tanks and cabin fit-out», и всё это время
 * баланс машины держали СПЛОШНЫЕ ШПАНГОУТЫ-ПЕРЕБОРКИ — случайная замена
 * отсутствующей начинки. Кольца эту подмену убрали, и центр масс уехал на
 * 70 см назад.
 *
 * Возвращается он не балластом, а тем, что на машине есть на самом деле:
 *
 *  - баки центроплана между лонжеронами, внутри от мотогондол. Они стоят
 *    почти в центре масс, поэтому баланс почти не двигают — но они реальны;
 *  - носовой отсек: передний багажник, аккумуляторы и радио. Он и переносит
 *    центр вперёд, потому что плечо у него длинное.
 *
 * Объём носового отсека РЕШЁН из условия «центр масс возвращается на
 * −1.027», а не подобран на глаз: у машины на этом числе откалибрована вся
 * лётная модель.
 */
for (const side of [-1, 1] as const) {
  addBodyBox(
    `centre-tank-${side > 0 ? "right" : "left"}`,
    "centre-tanks",
    "metal",
    point(side * 3.0, wingAt(3.0).y0, -0.75),
    point(2.4, 0.34, 1.9),
  );
}

addBodyBox(
  "nose-equipment-bay",
  "structure-fuselage",
  "metal",
  NOSE_BAY_CENTER,
  NOSE_BAY_SIZE,
);

// СПЛОШНОЙ БЛОК АККУМУЛЯТОРОВ И РАДИО ВНУТРИ НОСОВОГО ОТСЕКА. Сам отсек —
// тонкостенная коробка (панель) и весит доли единицы; начинка же у DC-3
// плотная — свинцовые батареи и радиостойки. Размер РЕШЁН из условия
// «центр масс машины на −1.027» после дюралевого оперения и честного
// картера (19.08.2026): сплошной стальной цилиндр на ~1.0 массы.
addCylinder(
  "nose-battery-block",
  "nose-equipment",
  "metal",
  point(0, -0.15, 6.05),
  point(0, -0.15, 5.15),
  0.32,
  12,
);

/**
 * КАБИНА ЭКИПАЖА.
 *
 * Не идеальный макет и не прогулка через дверь: закрытая переборка сразу
 * за креслами, из салона сюда садятся. Носовой отсек остаётся на месте —
 * его верх становится пьедесталом, на нём шесть замороженных рычагов,
 * батарея живёт внутри. Мебель лёгкая (явный объём), чтобы центр масс
 * не уехал с −1.027.
 */
function addCockpitBox(
  id: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
): void {
  addBodyBox(id, "cockpit", material, center, size, { volume: COCKPIT_FURNITURE_VOLUME });
}

{
  const bayTop = NOSE_BAY_CENTER[1] + NOSE_BAY_SIZE[1] / 2;
  const bayBottom = NOSE_BAY_CENTER[1] - NOSE_BAY_SIZE[1] / 2;
  const bayAft = NOSE_BAY_CENTER[2] - NOSE_BAY_SIZE[2] / 2;
  const coverT = 0.024;
  const coverTop = bayTop + coverT;
  const floorY = FORWARD_CABIN.floorY;

  const floorLength = COCKPIT_FLOOR_TO - FORWARD_CABIN.to;
  const floorCentreZ = (FORWARD_CABIN.to + COCKPIT_FLOOR_TO) / 2;
  const floorWidth = Math.min(
    ...[FORWARD_CABIN.to, floorCentreZ, COCKPIT_FLOOR_TO].map((z) =>
      cabinHalfWidth(sampleStation(z), floorY - CABIN_FLOOR_THICKNESS) * 2),
  ) - 0.08;
  addCockpitBox(
    "cockpit-floor",
    "timber-mid",
    point(0, floorY - CABIN_FLOOR_THICKNESS / 2, floorCentreZ),
    point(floorWidth, CABIN_FLOOR_THICKNESS, floorLength),
  );

  const bulkheadHalfW = Math.min(
    cabinHalfWidth(sampleStation(COCKPIT_BULKHEAD_Z), floorY + 0.15),
    cabinHalfWidth(sampleStation(COCKPIT_BULKHEAD_Z), 0.55),
  ) - 0.06;
  const tunnelHalf = NOSE_BAY_SIZE[0] / 2;
  const wallWidth = bulkheadHalfW - tunnelHalf;
  const wallTop = 0.62;
  const wallHeight = wallTop - floorY;
  const wallY = (floorY + wallTop) / 2;
  for (const side of [-1, 1] as const) {
    const board = side < 0 ? "left" : "right";
    addCockpitBox(
      `cockpit-bulkhead-${board}`,
      "timber-dark",
      point(side * (tunnelHalf + wallWidth / 2), wallY, COCKPIT_BULKHEAD_Z),
      point(wallWidth, wallHeight, 0.04),
    );
  }
  addCockpitBox(
    "cockpit-bulkhead-head",
    "timber-dark",
    point(0, (bayTop + wallTop) / 2, COCKPIT_BULKHEAD_Z),
    point(NOSE_BAY_SIZE[0], wallTop - bayTop, 0.04),
  );

  addCockpitBox(
    "cockpit-tunnel-cover",
    "metal",
    point(NOSE_BAY_CENTER[0], bayTop + coverT / 2, NOSE_BAY_CENTER[2]),
    point(NOSE_BAY_SIZE[0], coverT, NOSE_BAY_SIZE[2]),
  );
  addCockpitBox(
    "cockpit-tunnel-plinth",
    "metal",
    point(NOSE_BAY_CENTER[0], (bayBottom + floorY) / 2, NOSE_BAY_CENTER[2]),
    point(NOSE_BAY_SIZE[0], bayBottom - floorY, NOSE_BAY_SIZE[2]),
  );
  addCockpitBox(
    "cockpit-tunnel-aft",
    "metal",
    point(NOSE_BAY_CENTER[0], NOSE_BAY_CENTER[1], bayAft - coverT / 2),
    point(NOSE_BAY_SIZE[0], NOSE_BAY_SIZE[1], coverT),
  );

  const leverRows = [
    { id: "prop", z: 5.88 },
    { id: "throttle", z: 5.70 },
    { id: "mixture", z: 5.52 },
  ] as const;
  for (const row of leverRows) {
    for (const side of [-1, 1] as const) {
      const board = side < 0 ? "left" : "right";
      const x = side * 0.12;
      addCylinder(
        `cockpit-lever-${row.id}-${board}-shaft`,
        "cockpit",
        "metal",
        point(x, coverTop, row.z),
        point(x, coverTop + 0.11, row.z),
        0.011,
        10,
      );
      addCylinder(
        `cockpit-lever-${row.id}-${board}-knob`,
        "cockpit",
        "paint-light",
        point(x, coverTop + 0.11, row.z),
        point(x, coverTop + 0.13, row.z),
        0.022,
        12,
      );
    }
  }

  for (const side of [-1, 1] as const) {
    const board = side < 0 ? "left" : "right";
    const seatX = side * COCKPIT_SEAT_X;
    const cushionY = coverTop + 0.09;
    addCockpitBox(
      `cockpit-seat-${board}-leg`,
      "metal",
      point(side * 0.68, (floorY + coverTop) / 2, COCKPIT_SEAT_Z),
      point(0.08, coverTop - floorY, 0.22),
    );
    addCockpitBox(
      `cockpit-seat-${board}`,
      "timber-dark",
      point(seatX, cushionY, COCKPIT_SEAT_Z),
      point(0.36, 0.18, 0.46),
    );
    addCockpitBox(
      `cockpit-seat-${board}-back`,
      "timber-dark",
      point(seatX, coverTop + 0.40, COCKPIT_SEAT_Z - 0.275),
      point(0.36, 0.56, 0.09),
    );

    const yokeX = side * COCKPIT_YOKE_X;
    const hubY = 0.38;
    addCylinder(
      `cockpit-yoke-${board}-column`,
      "cockpit",
      "metal",
      point(yokeX, coverTop, COCKPIT_YOKE_Z),
      point(yokeX, hubY, COCKPIT_YOKE_Z),
      0.022,
      12,
    );
    addCockpitBox(
      `cockpit-yoke-${board}-hub`,
      "metal",
      point(yokeX, hubY, COCKPIT_YOKE_Z),
      point(0.08, 0.07, 0.07),
    );
    addCylinder(
      `cockpit-yoke-${board}-horn-left`,
      "cockpit",
      "metal",
      point(yokeX, hubY, COCKPIT_YOKE_Z + 0.01),
      point(yokeX - 0.13, hubY + 0.09, COCKPIT_YOKE_Z + 0.01),
      0.016,
      10,
    );
    addCylinder(
      `cockpit-yoke-${board}-horn-right`,
      "cockpit",
      "metal",
      point(yokeX, hubY, COCKPIT_YOKE_Z + 0.01),
      point(yokeX + 0.13, hubY + 0.09, COCKPIT_YOKE_Z + 0.01),
      0.016,
      10,
    );
    addCylinder(
      `cockpit-yoke-${board}-horn-bow`,
      "cockpit",
      "metal",
      point(yokeX - 0.13, hubY + 0.09, COCKPIT_YOKE_Z + 0.01),
      point(yokeX + 0.13, hubY + 0.09, COCKPIT_YOKE_Z + 0.01),
      0.016,
      10,
    );
  }

  /**
   * ПРИБОРНАЯ ДОСКА СМОТРИТ В ЭКИПАЖ, А НЕ В СТЕКЛО.
   *
   * `MotionInstrumentSystem` рисует на грани +Y и раскладывает горизонт /
   * лампы по ±Z. +Y — к лётчикам (−Z корпуса и чуть вверх). Капитан на
   * порту (+X): +Z плиты туда, доска сдвинута к его креслу.
   *
   * Местный +X плиты смотрит ВНИЗ. На горизонтальной полке у системы
   * приборов «верх» совпадал с +Y мира; на плите в лицо экипажу тот же
   * контур без этого разворота даёт перевёрнутые надписи и горизонт.
   */
  const panelRake = 0.42;
  const panelSpan = 0.68;
  const panelHeight = 0.36;
  const panelThickness = 0.05;
  const panelCenter = point(0.18, 0.56, 6.16);
  const panelFace = normalize(point(0, Math.sin(panelRake), -Math.cos(panelRake)));
  const panelLeft = point(1, 0, 0);
  const panelUp = normalize(cross(panelFace, panelLeft));
  const visualUp = panelUp[1] >= 0 ? panelUp : scale(panelUp, -1);
  const panelBottomY = panelCenter[1] - (panelHeight / 2) * visualUp[1];
  const panelBottomZ = panelCenter[2] - (panelHeight / 2) * visualUp[2];
  parts.push({
    kind: "box",
    id: "cockpit-panel",
    group: "cockpit",
    material: "dark-recess",
    center: bodyToWorld(panelCenter),
    size: [panelHeight, panelThickness, panelSpan],
    rotation: eulerXyzFromBasis(
      bodyDirection(panelUp),
      bodyDirection(panelFace),
      bodyDirection(panelLeft),
    ),
    volume: 0.0003,
  });
  const riserTop = panelBottomY + 0.012;
  addCockpitBox(
    "cockpit-panel-riser",
    "metal",
    point(panelCenter[0], (coverTop + riserTop) / 2, panelBottomZ),
    point(0.50, riserTop - coverTop, 0.14),
  );

  for (const [tag, z] of [["aft", 5.32], ["fwd", 5.95]] as const) {
    const station = sampleStation(z);
    const y = station.crown - SKIN_INSET - 0.08;
    addCockpitBox(
      `cockpit-lamp-${tag}-mount`,
      "metal",
      point(0, y + 0.03, z),
      point(0.08, 0.04, 0.08),
    );
    addCockpitBox(
      `cockpit-lamp-${tag}-shade`,
      "metal",
      point(0, y, z),
      point(0.18, 0.06, 0.14),
    );
    parts.push({
      kind: "box",
      id: `cockpit-lamp-${tag}-bulb`,
      group: "cockpit",
      material: "lamp-bulb",
      center: bodyToWorld(point(0, y - 0.016, z)),
      size: [0.07, 0.04, 0.07],
      volume: 0.00012,
      light: {
        color: "#ffd9a3",
        distance: 3.8,
        intensity: 1.35,
        dayIntensityFactor: 0.82,
        interior: true,
        poolPriority: 2.8,
        poolGroupId: "dc3-cockpit",
        reservePoolGroup: tag === "fwd",
      },
    });
  }
}

for (const plan of CABIN_ENTRY_PLANS) {
  const yCentre = plan.floorY + CABIN_ENTRY_HEIGHT / 2;
  const paneY = plan.floorY + CABIN_ENTRY_PANE.sill + CABIN_ENTRY_PANE.across / 2;
  for (const sign of [1, -1] as const) {
    const side = sign > 0 ? "right" : "left";
    const prefix = `cabin-entry-${side}-${plan.id}`;
    addCabinEntryLeaf(
      `${prefix}:board:0`,
      "paint-light",
      sign,
      plan.z,
      yCentre,
      CABIN_ENTRY_WIDTH,
      CABIN_ENTRY_HEIGHT,
      CABIN_ENTRY_CORNER,
      CABIN_ENTRY_OVERLAY_OUTWARD,
    );
    addCabinEntryRing(
      `${prefix}-seal`,
      "paint-light",
      sign,
      plan.z,
      yCentre,
      CABIN_ENTRY_WIDTH,
      CABIN_ENTRY_HEIGHT,
      CABIN_ENTRY_CORNER,
      CABIN_ENTRY_OVERLAY_OUTWARD,
      CABIN_ENTRY_SEAL_REVEAL,
      CABIN_ENTRY_SEAL_GAP,
    );
    addCabinEntryRing(
      `${prefix}-frame`,
      "paint-light",
      sign,
      plan.z,
      yCentre,
      CABIN_ENTRY_WIDTH,
      CABIN_ENTRY_HEIGHT,
      CABIN_ENTRY_CORNER,
      CABIN_ENTRY_OVERLAY_OUTWARD,
      CABIN_ENTRY_SEAL_GAP,
      CABIN_ENTRY_SEAL_GAP + CABIN_ENTRY_FRAME_WIDTH,
    );
    addCabinEntryRing(
      `${prefix}-cage`,
      "metal",
      sign,
      plan.z,
      yCentre,
      CABIN_ENTRY_WIDTH,
      CABIN_ENTRY_HEIGHT,
      CABIN_ENTRY_CORNER,
      -SKIN_INSET,
      0,
      CABIN_ENTRY_CAGE_WEB,
      "cabin-frame",
      FRAME_WEB,
    );
    addCabinEntryLeaf(
      `${prefix}:board:1`,
      "timber-dark",
      sign,
      plan.z,
      paneY,
      CABIN_ENTRY_PANE.along,
      CABIN_ENTRY_PANE.across,
      CABIN_ENTRY_PANE.corner,
      0.028,
    );
  }
}

/**
 * Шторка между салонами — ПОПЕРЁК ПРОХОДА, а не поперёк сечения.
 *
 * Первая редакция была прямоугольником во всю ширину борта, посчитанную на
 * высоте пояса. Борт кверху сужается, поэтому её верхние углы вылезали
 * НАРУЖУ фюзеляжа — на кадре торчала квадратная перегородка. Настоящая
 * шторка висит на рейле над проходом и закрывает проход, а не борт.
 *
 * Ширина берётся по проходу между блоками кресел, высота — от пола до рейла.
 */
{
  const z = AFT_CABIN.to;
  const aisleCentreX = 0.21;
  const aisleWidth = 0.54;
  const height = 1.8;
  addBodyBox(
    "cabin-divider-curtain",
    "cabin-trim",
    "cloth" as ObjectMaterialId,
    point(aisleCentreX, AFT_CABIN.floorY + height / 2, z),
    point(aisleWidth, height, 0.03),
  );
}



const SIDE_RAIL_END_Z = sideLightCorners(1)[2][2] - 0.12;
const RAIL_STATIONS = [
  sampleStation(SIDE_RAIL_END_Z),
  ...FUSELAGE_STATIONS.filter(
    (station) => station.z < SIDE_RAIL_END_Z - 1e-9 && station.z > TAIL_Z + 1e-9,
  ),
];
const LONGERON_RAILS = [
  ["upper-right", (50 * Math.PI) / 180],
  ["upper-left", (130 * Math.PI) / 180],
  ["lower-left", (230 * Math.PI) / 180],
  ["lower-right", (310 * Math.PI) / 180],
] as const;

function railCrossesCabinEntry(angle: number, plan: (typeof CABIN_ENTRY_PLANS)[number]): boolean {
  const cosine = Math.cos(angle);
  const side: 1 | -1 | 0 = cosine > 0.2 ? 1 : cosine < -0.2 ? -1 : 0;
  if (side === 0) return false;
  const [, y] = railPoint(sampleStation(plan.z), angle);
  return cabinEntryContains(plan.z, y, plan, LONGERON_HALF + 0.02);
}

/**
 * Стрингеры и лонжероны, которые пересекают проём, обрываются на его
 * кромке: дальше их несёт внутренний обвод двери, а не пруток сквозь
 * проход.
 */
function splitRailStations(angle: number): Station[][] {
  const extra = CABIN_ENTRY_PLANS.flatMap((plan) => {
    if (!railCrossesCabinEntry(angle, plan)) return [];
    const zFrom = plan.z - CABIN_ENTRY_WIDTH / 2;
    const zTo = plan.z + CABIN_ENTRY_WIDTH / 2;
    return [sampleStation(zFrom), sampleStation(zTo)];
  });
  const stations = [...RAIL_STATIONS, ...extra]
    .sort((left, right) => right.z - left.z)
    .filter((station, index, list) =>
      index === 0 || Math.abs(station.z - list[index - 1].z) > 1e-4);
  const runs: Station[][] = [];
  let current: Station[] = [];
  const gapAfter = (prev: Station, next: Station): boolean =>
    CABIN_ENTRY_PLANS.some((plan) => {
      if (!railCrossesCabinEntry(angle, plan)) return false;
      const z0 = plan.z - CABIN_ENTRY_WIDTH / 2;
      const z1 = plan.z + CABIN_ENTRY_WIDTH / 2;
      return prev.z >= z1 - 1e-4 && next.z <= z0 + 1e-4;
    });
  for (const station of stations) {
    if (current.length > 0 && gapAfter(current[current.length - 1], station)) {
      if (current.length >= 2) runs.push(current);
      current = [station];
      continue;
    }
    current.push(station);
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

function addRailRuns(
  id: string,
  angle: number,
  half: number,
): void {
  for (const [index, run] of splitRailStations(angle).entries()) {
    const lofted = loftRings(run.map((station) => railSection(station, angle, half)));
    const suffix = index === 0 ? "" : `:seg${index}`;
    addClosedMesh(`${id}${suffix}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
  }
}

for (const [id, angle] of LONGERON_RAILS) {
  addRailRuns(`longeron-${id}`, angle, LONGERON_HALF);
}

const STRINGER_ANGLES = [0, 30, 90, 150, 180, 210, 270, 330].map((deg) => (deg * Math.PI) / 180);
STRINGER_ANGLES.forEach((angle, index) => {
  addRailRuns(`stringer-${index}`, angle, STRINGER_HALF);
});

/**
 * СТАРОЙ ПЛИТЫ ПОЛА ЗДЕСЬ БОЛЬШЕ НЕТ.
 *
 * B01 нёс плоский настил на y = 0.36 — от компоновки, в которой салона не
 * было. После того как салон получил свой пол на −0.55 (уровень считается от
 * роста жителя), эта плита оказалась ровно по спинкам кресел и читалась
 * псевдопотолком. Пол салона строится в блоке начинки, по одному на отсек.
 */
// Балки под старой плитой ушли вместе с ней: они лежали на той же высоте и
// точно так же пересекали салон.

function addEngineMount(side: "left" | "right", sign: 1 | -1): void {
  const group = "structure-mount";
  const x = sign * ENGINE_X;
  const { y0, leading, chord } = wingAt(x);
  const sparZ = leading - SPAR_FRONT * chord;
  const hub = point(x, PROP_HUB_Y, ENGINE_Z);
  const firewall = loftRings([
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z, COWL_INNER - 0.02, 14),
    circleRing(x, PROP_HUB_Y, COWL_AFT_Z - 0.05, COWL_INNER - 0.02, 14),
  ]);
  addClosedMesh(`mount-${side}-firewall`, group, "metal", firewall.vertices, firewall.triangles);
  const stays: readonly ObjectPoint[] = [
    point(x + sign * 0.38, PROP_HUB_Y + 0.28, COWL_AFT_Z),
    point(x + sign * 0.38, PROP_HUB_Y - 0.28, COWL_AFT_Z),
    point(x - sign * 0.22, PROP_HUB_Y + 0.32, COWL_AFT_Z),
    point(x - sign * 0.22, PROP_HUB_Y - 0.32, COWL_AFT_Z),
  ];
  stays.forEach((from, index) => {
    addCylinder(`mount-${side}-stay-${index}`, group, "metal", from, hub, 0.028, 8);
  });
  addCylinder(
    `mount-${side}-backstay`,
    group,
    "metal",
    point(x, PROP_HUB_Y - 0.3, COWL_AFT_Z),
    point(x, y0, sparZ),
    0.032,
    8,
  );
  addCylinder(
    `mount-${side}-trunnion`,
    group,
    "metal",
    point(x, y0, sparZ),
    point(x, GEAR_TRUNNION_Y, 0.22),
    0.04,
    8,
  );
}

addEngineMount("left", -1);
addEngineMount("right", 1);

function finSparRing(station: FinStation, which: "front" | "rear"): ObjectPoint[] {
  const chord = station.leadZ - station.trailZ;
  const t = which === "front" ? 0.28 : 0.72;
  const z = station.leadZ - t * chord;
  const y = station.y === "crown" ? sampleCrown(z) : station.y;
  const local = Math.max(0.01, station.half * Math.sin(Math.PI * t) - 0.02);
  const back = 0.04;
  return [
    point(-local, y, z + back),
    point(local, y, z + back),
    point(local, y, z - back),
    point(-local, y, z - back),
  ];
}

const finSparFront = loftRings(FIN_STATIONS.map((station) => finSparRing(station, "front")));
const finSparRear = loftRings(FIN_STATIONS.map((station) => finSparRing(station, "rear")));
addClosedMesh("fin-spar-front", "structure-empennage", "metal", finSparFront.vertices, finSparFront.triangles);
addClosedMesh("fin-spar-rear", "structure-empennage", "metal", finSparRear.vertices, finSparRear.triangles);

function stabSparRing(x: number, chordT: number): ObjectPoint[] {
  const { y0, thick, leading, hingeZ, te } = stabSection(x);
  const z = chordTToZ(chordT, leading, hingeZ, te, STAB_HINGE_T);
  const half = 0.022;
  const up = Math.max(0.018, thick * 0.35);
  return [
    point(x, y0 + up, z + half),
    point(x, y0 + up, z - half),
    point(x, y0 - up, z - half),
    point(x, y0 - up, z + half),
  ];
}

const STAB_XS = [-3.1, -2.1, -0.9, 0, 0.9, 2.1, 3.1];
for (const [id, chordT] of [["front", 0.22], ["rear", 0.72]] as const) {
  const lofted = loftRings(STAB_XS.map((x) => stabSparRing(x, chordT)));
  addClosedMesh(`stab-spar-${id}`, "structure-empennage", "metal", lofted.vertices, lofted.triangles);
}

const nose = bodyToWorld(point(
  0,
  (FUSELAGE_STATIONS[0].crown + FUSELAGE_STATIONS[0].keel) / 2,
  NOSE_CAP_TIP_Z,
));
const tail = bodyToWorld(point(0, 0.18, TAIL_Z));
const tipSection = wingAt(WING_HALF);
const leftTip = bodyToWorld(point(-WING_HALF, tipSection.y0, tipSection.hingeZ));
const rightTip = bodyToWorld(point(WING_HALF, tipSection.y0, tipSection.hingeZ));
function wingHingePivot(x: number): ObjectPoint {
  const { y0, hingeZ } = wingAt(x);
  return point(x, y0, hingeZ);
}

function stabHingePivot(x: number): ObjectPoint {
  const { y0, hingeZ } = stabSection(x);
  return point(x, y0, hingeZ);
}

const spanAxis = bodyDirection(point(1, 0, 0));
const surfaceHinges: Record<string, SurfaceHinge> = {};

/**
 * ВИНТ ПРИНАДЛЕЖИТ ВАЛУ, А НЕ МИРОВОЙ ПОЗЕ САМОЛЁТА.
 *
 * Это две канонические рамы валов в покойной системе объекта. Мотогондола,
 * втулка и лопасти уже собраны в этой системе; рантайм имеет право добавить
 * только фазу вокруг `axis`. Поворот и наклон всего самолёта применяются
 * снаружи ко всему кластеру и этого контракта не касаются.
 */
const propellerShaftAxis = bodyDirection(point(0, 0, 1));
const propellerShafts: Readonly<Record<"left" | "right", PropellerShaft>> = {
  left: {
    group: "propeller-left",
    pivot: bodyToWorld(point(-ENGINE_X, PROP_HUB_Y, PROP_HUB_Z)),
    axis: propellerShaftAxis,
    phaseSign: 1,
  },
  right: {
    group: "propeller-right",
    pivot: bodyToWorld(point(ENGINE_X, PROP_HUB_Y, PROP_HUB_Z)),
    axis: propellerShaftAxis,
    phaseSign: 1,
  },
};

function addHinge(
  id: string,
  group: string,
  pivot: ObjectPoint,
  axis: ObjectPoint,
  minDegrees: number,
  maxDegrees: number,
): void {
  surfaceHinges[id] = {
    group,
    pivot: bodyToWorld(pivot),
    axis,
    range: { minDegrees, maxDegrees },
    restDegrees: 0,
  };
}

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  addHinge(
    `flap-${side}-inner`,
    `flap-${side}-inner`,
    wingHingePivot(sign * (FLAP_INNER_IN + FLAP_INNER_OUT) / 2),
    spanAxis,
    FLAP_DOWN_DEGREES,
    0,
  );
  addHinge(
    `flap-${side}-outer`,
    `flap-${side}-outer`,
    wingHingePivot(sign * (FLAP_OUTER_IN + FLAP_OUTER_OUT) / 2),
    spanAxis,
    FLAP_DOWN_DEGREES,
    0,
  );
  addHinge(
    `aileron-${side}`,
    `aileron-${side}`,
    wingHingePivot(sign * (AILERON_IN + AILERON_OUT) / 2),
    spanAxis,
    -AILERON_RANGE,
    AILERON_RANGE,
  );
  addHinge(
    `elevator-${side}`,
    `elevator-${side}`,
    stabHingePivot(sign * (ELEV_IN + ELEV_OUT) / 2),
    spanAxis,
    ELEVATOR_DOWN,
    ELEVATOR_UP,
  );
}

addHinge(
  "rudder",
  "rudder",
  point(0, (RUDDER_Y0 + RUDDER_Y1) / 2, -10.65 - FIN_HINGE_T * 1.48),
  bodyDirection(point(0, 1, 0)),
  -RUDDER_RANGE,
  RUDDER_RANGE,
);

const flapDownArticulation = Object.fromEntries(
  Object.entries(surfaceHinges)
    .filter(([id]) => id.startsWith("flap-"))
    .map(([id, hinge]) => [id, hinge.range.minDegrees]),
);

const finTip = bodyToWorld(point(0, 4.85, -11.79));
const viewTarget = point(0, 2.15, -1.2);
const bodyUp = point(0, COS, -SIN);
const bodyForward = point(0, SIN, COS);
const planHeight = 48;
const planCamera = point(
  viewTarget[0] + bodyUp[0] * planHeight,
  viewTarget[1] + bodyUp[1] * planHeight,
  viewTarget[2] + bodyUp[2] * planHeight,
);

const views: readonly Dc3View[] = [
  {
    id: "front",
    label: "Front +Z · span, dihedral, three-blade props",
    projection: "orthographic",
    position: point(0, 2.4, 44),
    target: viewTarget,
    orthoHeight: 16,
  },
  {
    id: "right-profile",
    label: "Right +X · three-point sit and loft",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
  },
  {
    id: "right-profile-cutaway",
    label: "Cutaway · right profile, skins hidden",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage", "nose-cap"],
  },
  {
    id: "right-profile-flaps-down",
    label: "Right +X · flaps down",
    projection: "orthographic",
    position: point(44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
    articulation: flapDownArticulation,
  },
  {
    id: "left-profile",
    label: "Left −X · greenhouse and door side",
    projection: "orthographic",
    position: point(-44, 2.4, -2),
    target: viewTarget,
    orthoHeight: 14,
  },
  {
    id: "rear",
    label: "Rear −Z · fin and stabilizer",
    projection: "orthographic",
    position: point(0, 2.4, -48),
    target: viewTarget,
    orthoHeight: 16,
  },
  {
    id: "top",
    label: "World top · sit-foreshortened plan",
    projection: "orthographic",
    position: point(0, 52, -2),
    target: point(0, 0, -2),
    up: point(0, 0, 1),
    orthoHeight: 34,
  },
  {
    id: "plan",
    label: "Body plan · true wing planform",
    projection: "orthographic",
    position: planCamera,
    target: viewTarget,
    up: bodyForward,
    orthoHeight: 34,
  },
  {
    id: "three-quarter-left",
    label: "3/4 left · nacelle and greenhouse",
    projection: "perspective",
    position: point(-28, 12, 24),
    target: viewTarget,
    fov: 32,
  },
  {
    id: "three-quarter-right",
    label: "3/4 right · wing taper and sit",
    projection: "perspective",
    position: point(30, 11, 22),
    target: viewTarget,
    fov: 32,
  },
  {
    id: "high-three-quarter",
    label: "High 3/4 · planform and twin engines",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
  },
  {
    id: "high-three-quarter-flaps-down",
    label: "High 3/4 · flaps down",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
    articulation: flapDownArticulation,
  },
  {
    id: "high-three-quarter-cutaway",
    label: "Cutaway · high 3/4, skins hidden",
    projection: "perspective",
    position: point(24, 22, 26),
    target: viewTarget,
    fov: 34,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage", "nose-cap"],
  },
  {
    id: "core-detail",
    label: "Joint · wing box through the belly",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, WING_ROOT_Y, 0.1)),
    fov: 32,
  },
  {
    id: "core-detail-cutaway",
    label: "Cutaway · three spars and frames at the carry-through",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, WING_ROOT_Y, 0.1)),
    fov: 32,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage", "nose-cap"],
  },
  {
    id: "nacelle-detail",
    label: "Joint · teardrop nacelle, open cowl and wing",
    projection: "perspective",
    position: point(12.4, 1.15, 4.8),
    target: bodyToWorld(point(ENGINE_X, PROP_HUB_Y, 0.2)),
    fov: 32,
  },
  {
    id: "flap-detail",
    label: "Joint · inner flap cut on the rear spar",
    projection: "perspective",
    position: point(8.8, 1.35, 5.4),
    target: bodyToWorld(point(3.3, wingAt(3.3).y0, -2.1)),
    fov: 30,
  },
  {
    id: "flap-detail-flaps-down",
    label: "Joint · inner flap down",
    projection: "perspective",
    position: point(8.8, 1.35, 5.4),
    target: bodyToWorld(point(3.3, wingAt(3.3).y0, -2.1)),
    fov: 30,
    articulation: flapDownArticulation,
  },
  {
    id: "tail-detail",
    label: "Joint · dorsal fillet, rudder cut and vertical TE",
    projection: "perspective",
    position: point(8.2, 3.4, -6.4),
    target: bodyToWorld(point(0, 2.6, -11.2)),
    fov: 32,
  },
  {
    id: "nose-detail",
    label: "Joint · blunt snout and raked greenhouse",
    projection: "perspective",
    position: point(5.8, 2.15, 12.6),
    target: bodyToWorld(point(0, 0.35, 6.15)),
    fov: 30,
  },
  {
    id: "cockpit-cutaway",
    label: "Cutaway · crew seats, pedestal and panel",
    projection: "perspective",
    position: bodyToWorld(point(-2.6, 0.9, 5.55)),
    target: bodyToWorld(point(0.05, 0.28, 5.95)),
    fov: 40,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage", "nose-cap"],
  },
  {
    id: "entry-forward-right",
    label: "Entry overlay · forward passenger, right",
    projection: "perspective",
    position: bodyToWorld(point(4.6, 0.9, 4.72)),
    target: bodyToWorld(point(1.22, 0.28, 4.72)),
    fov: 28,
  },
  {
    id: "entry-aft-right",
    label: "Entry overlay · aft passenger, right",
    projection: "perspective",
    position: bodyToWorld(point(4.4, 0.7, -3.85)),
    target: bodyToWorld(point(1.18, 0.08, -3.85)),
    fov: 28,
  },
  {
    id: "entry-forward-left",
    label: "Entry overlay · forward passenger, left",
    projection: "perspective",
    position: bodyToWorld(point(-4.6, 0.9, 4.72)),
    target: bodyToWorld(point(-1.22, 0.28, 4.72)),
    fov: 28,
  },
  {
    id: "silhouette",
    label: "Silhouette · type mass",
    projection: "orthographic",
    position: point(-26, 10, 22),
    target: viewTarget,
    orthoHeight: 18,
  },
];

export const dc3BlockoutObject: Dc3BlockoutModel = {
  id: "douglas-dc3-blockout",
  revision: "b01-2026-08-13-surfaces",
  title: "Douglas DC-3 — B01 engineering prototype",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1600, 1000],
  materialOverrides: {
    "paint-light": { color: 0xb7b8b2, roughness: 0.42, metalness: 0.22 },
    metal: { color: 0x5c6164, roughness: 0.38, metalness: 0.45 },
    "timber-dark": { color: 0x2a2c2d, roughness: 0.92 },
  },
  sourceNotes: [
    "Published type envelope: 95 ft span, 64 ft 6 in length, 16 ft 11 in tail-down height, 11 ft 6 in propeller, 987 sq ft wing.",
    "NASM A19530075000 owns the museum airframe identity; its 4.14 m move-contractor width is not used as fuselage diameter.",
    "Station tables, 5° outer dihedral and 19 ft engine half-span are authored. This is a three-point sit, not a level drawing. The wing is a low-wing: root lower surface on the keel, engine shafts on the local chord. The gear knuckle sits in the nacelle well; the oleo and tyre stay outside. Do not bury the axle to freeze pitch or AABB.",
    "Each propeller is three Hamilton Standard paddle blades at the published 11 ft 6 in diameter; rotation is frozen.",
    "Nacelle is one metal teardrop the same diameter as the cowl, open at the lip around a Wright R-1820, then tapering through the wing to the trailing edge. Not a box behind a cylinder.",
    "Forward stations follow NASM A19530075000: accepted cabin roof through z=5.15, then a slope that stays above the windshield V. A separate brow triangle joins that slope to the two glass heads. The oval deck stops at z=6.85; two sill triangles join that ring to the two glass sills. The upper half flattens toward the glass and the anti-glare deck, then returns to an oval at the tip. A separate nose overlay closes that last ring; the station table is not extended. Two central windshields are planar parallelograms with a level side-view head, a 60° mullion rake and a 60° plan V, set 5 cm into the body. The two-pane scheme continues with a side light each side: level head and sill, sill dropped below the windshields, front edge the outboard pillar. Frames and rails stop short of the greenhouse opening.",
    "Vertical fin follows NASM2018-10067 and NASM2025-02160: one loft from the crown, long convex dorsal, rounded tip, nearly vertical trailing edge. Not a four-point slab. Rudder is cut from that loft as a hinged leaf. Frozen fin outline in docs/dc-3/blockout-b01-freeze-fin/.",
    "Skin-on-frame like the other air vehicles: the cage is inset from the loft (12 cm on the fuselage, a fraction of local thickness on the wing). Frames, four longerons and eight stringers carry the fuselage skin; three spars and wing formers carry the wing skin. Wright mounts and gear trunnions pick up the front spar. Tanks and cabin fit-out stay out.",
    "Ailerons, split flaps, elevator and rudder are real openings on the rear-spar / fin-hinge line, not painted seams. Flaps skip the nacelle afterbody. Hinges live on surfaceHinges; flaps-down is a posed second state of the same parts.",
  ],
  dimensions: {
    wingspan: DC3_WINGSPAN,
    length: DC3_LENGTH,
    heightTailDown: DC3_HEIGHT_TAIL_DOWN,
    propellerDiameter: DC3_PROPELLER_DIAMETER,
    propellerBladeCount: PROP_BLADES,
    engineHalfSpan: ENGINE_X,
    engineCylinders: ENGINE_CYLINDERS,
    cowlInnerRadius: COWL_INNER,
    threePointPitchDegrees: (PITCH * 180) / Math.PI,
    flapDownDegrees: FLAP_DOWN_DEGREES,
    aileronRangeDegrees: AILERON_RANGE,
    maximumOperatingHeight: DC3_HEIGHT_TAIL_DOWN,
  },
  labMetrics: [
    { label: "SPAN", value: DC3_WINGSPAN, decimals: 2, signed: false },
    { label: "LENGTH", value: DC3_LENGTH, decimals: 2, signed: false },
    { label: "SIT", value: DC3_HEIGHT_TAIL_DOWN, decimals: 2, signed: false },
    { label: "PROP", value: DC3_PROPELLER_DIAMETER, decimals: 2, signed: false },
    { label: "PARTS", value: parts.length, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    nose,
    tail,
    leftWingTip: leftTip,
    rightWingTip: rightTip,
    finTip,
    leftProp: propellerShafts.left.pivot,
    rightProp: propellerShafts.right.pivot,
    leftMainWheel: bodyToWorld(point(-ENGINE_X, GEAR_BODY_Y, GEAR_BODY_Z)),
    rightMainWheel: bodyToWorld(point(ENGINE_X, GEAR_BODY_Y, GEAR_BODY_Z)),
    tailwheel: bodyToWorld(point(0, TAILWHEEL_BODY_Y, TAILWHEEL_BODY_Z)),
    humanScale: point(0, 1.75, 0),
  },
  motionConstraints: {
    staticAirframe: true,
    propellerMotion: "constant-rotation-only-frozen",
    propellerBladeCount: PROP_BLADES,
    controlSurfaces: "hinged-leaves-lab-pose-only",
    // Основная стойка убирается ВПЕРЁД в гондолу на 101°, хвостовая — нет.
    mainGearRetraction: "forward-into-nacelle-wheel-partly-exposed",
    tailwheelRetraction: "none",
    aerodynamicsExcluded: true,
    worldIntegrationDeferred: true,
  },
  propellerShafts,
  surfaceHinges,
  labEnvironment: {
    floorRadius: 34,
    gridSize: 64,
    gridDivisions: 64,
    fogNear: 72,
    fogFar: 118,
    floorY: -0.04,
  },
  parts,
  views,
};

/**
 * ПОВЕРХНОСТЬ ПЛАНЕРА ДЛЯ ПАНЕЛИЗАЦИИ.
 *
 * Экспорт только читающий: он ничего не добавляет к машине и ничего в ней не
 * меняет. Нужен затем, чтобы этап панелизации обшивки крыл и оперения снимал
 * панели с ТОГО ЖЕ профиля, а не заводил себе второй. Два профиля разойдутся
 * при первой же правке, и после этого никто не скажет, который канонический.
 *
 * Все band-функции отдают точки в КОРПУСНЫХ координатах; в мировые их
 * переводит `bodyToWorld`, ровно как это делает `addClosedMesh`.
 */
export const dc3AirframeSurface = {
  bodyToWorld,
  worldToBody,
  wing: {
    at: wingAt,
    band: airfoilBand,
    skinEndT: wingSkinEndT,
    inFlapBay,
    inAileronBay,
    stations: WING_STATIONS,
    halfSpan: WING_HALF,
    aileronSpan: { inner: AILERON_IN, outer: AILERON_OUT },
    tipRound: WING_TIP_ROUND,
  },
  stabiliser: {
    section: stabSection,
    band: stabBand,
    inElevatorBay,
    stations: STAB_STATION_XS,
    hingeT: STAB_HINGE_T,
    halfSpan: STAB_HALF,
    tipRound: STAB_TIP_ROUND,
    elevatorSpan: { inner: ELEV_IN, outer: ELEV_OUT },
  },
  fin: {
    stations: FIN_STATIONS,
    band: finBand,
    inRudderBay,
    hingeT: FIN_HINGE_T,
  },
  /**
   * Фюзеляж: кольцо на станции. Панелизации хватает СВОИХ выборок кольца и
   * своих станций — промежуточных точек выдумывать не надо, поэтому панельная
   * шкура совпадает с лофтом точно, а не приближённо.
   */
  fuselage: {
    stations: FUSELAGE_STATIONS,
    at: sampleStation,
    ring: ellipseRing,
    pointAt: ellipsePoint,
    ringCount: RING,
  },
  /** Мотогондола: та же схема, кольца окружностей по станциям. */
  nacelle: {
    halfSpan: ENGINE_X,
    hubY: PROP_HUB_Y,
    segments: 24,
    circle: circleRing,
    body: [
      { z: COWL_FRONT_Z, radius: 0.71 },
      { z: 1.95, radius: COWL_OUTER },
      { z: COWL_AFT_Z, radius: COWL_OUTER },
      { z: 0.35, radius: 0.66 },
      { z: -0.7, radius: 0.58 },
      { z: -1.9, radius: 0.4 },
      { z: -3.2, radius: 0.16 },
    ],
  },
  /**
   * План салонов в КОРПУСНЫХ координатах. Экспортируется затем, чтобы
   * проверка просвета мерила в той же раме, в которой салон построен: куски
   * блокаута лежат уже в мировых координатах с тангажом, и смешать их с
   * корпусными — верный способ получить бессмысленное число.
   */
  /**
   * ПЛАН ИЛЛЮМИНАТОРОВ: ПРЯМОЙ РЯД ИЗ СЕМИ, А НЕ ПО ОДНОМУ НА КРЕСЛО.
   *
   * Первая редакция вешала окно на каждый ряд кресел — вышло пять, с
   * разрывом над крылом и с разной высотой в двух салонах. Машина от этого
   * перестала узнаваться: у DC-3 линия окон ПРЯМАЯ и непрерывная, семь на
   * борт, и начинается заметно позади кабины экипажа.
   *
   * Поэтому ряд задаётся сам по себе: постоянная высота, постоянный шаг.
   * Четыре средних окна приходятся на центроплан, где кресел нет — за ними
   * проход над кессоном. Это честно: окно там есть и на настоящей машине,
   * а высота 0.50 выше верха кессона (0.21), так что смотрят они в пустоту
   * прохода, а не в лонжерон.
   */
  windows: Array.from({ length: 6 }, (_, index) => ({
    z: WINDOW_ROW_FIRST_Z - index * WINDOW_ROW_PITCH,
    centreY: WINDOW_ROW_CENTRE_Y,
    ...DC3_WINDOW_SIZE,
  })),
  /**
   * Четыре входа. Проём режется в панельной шкуре по этому контуру;
   * створка, уплотнение и гермообвод остаются накладкой вокруг дырки.
   */
  cabinEntries: CABIN_ENTRY_PLANS.map((plan) => ({
    id: plan.id,
    z: plan.z,
    zFrom: plan.z - CABIN_ENTRY_WIDTH / 2,
    zTo: plan.z + CABIN_ENTRY_WIDTH / 2,
    floorY: plan.floorY,
    width: CABIN_ENTRY_WIDTH,
    height: CABIN_ENTRY_HEIGHT,
    cornerRadius: CABIN_ENTRY_CORNER,
    sealReveal: CABIN_ENTRY_SEAL_REVEAL,
    sealGap: CABIN_ENTRY_SEAL_GAP,
    frameWidth: CABIN_ENTRY_FRAME_WIDTH,
  })),
  /**
   * Два плоских параллелограмма: верх горизонтален в боку, стойка 60° к
   * горизонту, в плане раствор 60°. Порог, наружный порог, бровь снаружи,
   * бровь у стойки.
   */
  windshields: [
    { id: "right", corners: windshieldCorners(1) },
    { id: "left", corners: windshieldCorners(-1) },
  ],
  sideLights: [
    { id: "right", corners: sideLightCorners(1) },
    { id: "left", corners: sideLightCorners(-1) },
  ],
  cornerLights: [
    { id: "right", corners: cornerLightCorners(1) },
    { id: "left", corners: cornerLightCorners(-1) },
  ],
  sideLightBay: { zAft: 5.15, zFore: 6.5 },
  windshieldBay: { zAft: WINDSHIELD_Z_AFT, zFore: WINDSHIELD_Z_FORE },
  greenhouseBrow: greenhouseBrowFairing(),
  greenhouseForehead: greenhouseForehead(),
  greenhouseSill: greenhouseSillFairing(),
  cabins: {
    forward: FORWARD_CABIN,
    aft: AFT_CABIN,
    standClearance: CABIN_STAND,
    skinInset: SKIN_INSET,
  },
  cockpit: {
    bulkheadZ: COCKPIT_BULKHEAD_Z,
    floorFrom: FORWARD_CABIN.to,
    floorTo: COCKPIT_FLOOR_TO,
    floorY: FORWARD_CABIN.floorY,
    seatX: COCKPIT_SEAT_X,
    seatZ: COCKPIT_SEAT_Z,
    yokeX: COCKPIT_YOKE_X,
    yokeZ: COCKPIT_YOKE_Z,
    panelId: "cockpit-panel",
    noseZ: NOSE_Z,
    // Порт — объектный +X (forward×up = −X = правый борт). Имена left/right
    // у кресел — про знак X, не про борт машины.
    captainSeatId: "cockpit-seat-right",
    captainBackId: "cockpit-seat-right-back",
    captainHubId: "cockpit-yoke-right-hub",
  },
  spars: { front: SPAR_FRONT, main: SPAR_MAIN, rear: SPAR_REAR },
  hingeGapT: HINGE_GAP_T,
  cabinEntryHalfAcross: roundedRectHalfAcross,
} as const;
