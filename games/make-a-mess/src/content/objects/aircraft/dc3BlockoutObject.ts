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
const PROP_HUB_Y = -0.52;
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
const SKIN_INSET = 0.12;
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
const AILERON_IN = 8.72;
const AILERON_OUT = DC3_WINGSPAN / 2 - 0.52;
const FIN_HINGE_T = 0.6;
const RUDDER_Y0 = 1.25;
const RUDDER_Y1 = 4.55;
const STAB_HINGE_T = 0.72;
const ELEV_IN = 0.42;
const ELEV_OUT = 3.12;
const FLAP_DOWN_DEGREES = -42;
const AILERON_RANGE = 25;
const ELEVATOR_DOWN = -22;
const ELEVATOR_UP = 18;
const RUDDER_RANGE = 25;
const FLOOR_Y = 0.36;
const GEAR_BODY_Y = -2.7;
const GEAR_BODY_Z = 0.2;
const TAILWHEEL_BODY_Y = -0.52;
const TAILWHEEL_BODY_Z = -11.05;
const PITCH = Math.atan2(
  TAILWHEEL_BODY_Y - GEAR_BODY_Y,
  GEAR_BODY_Z - TAILWHEEL_BODY_Z,
);
const COS = Math.cos(PITCH);
const SIN = Math.sin(PITCH);

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
  // Крыша → короткий радиус в бровь z=6.15 → прямое тупое стекло на палубу
  // z=6.5. Это принятая форма кабины; фонарь не сдвигать, чтобы «набрать
  // длину». Колпак — не полусфера на стыке z=7 (40 см, читалась заглушкой)
  // и не продолжение салона: от порога стекла нос держит сечение, потом
  // скругляется к тупому кончику на NOSE_Z. Стекло фонаря — потом.
  { z: NOSE_Z, halfWidth: 0.32, crown: 0.26, keel: -0.24 },
  { z: 7.15, halfWidth: 0.72, crown: 0.58, keel: -0.62 },
  { z: 6.85, halfWidth: 0.9, crown: 0.74, keel: -0.84 },
  { z: 6.5, halfWidth: 0.98, crown: 0.8, keel: -0.92 },
  { z: 6.15, halfWidth: 1.08, crown: 1.32, keel: -1.06 },
  { z: 5.8, halfWidth: 1.14, crown: 1.4, keel: -1.14 },
  { z: 5.15, halfWidth: 1.18, crown: 1.4, keel: -1.22 },
  { z: 4.3, halfWidth: 1.24, crown: 1.4, keel: -1.26 },
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

function wingAt(x: number): {
  readonly chord: number;
  readonly leading: number;
  readonly thickness: number;
  readonly y0: number;
} {
  const spanT = Math.min(1, Math.abs(x) / (DC3_WINGSPAN / 2));
  const chord = ROOT_CHORD * (1 - spanT) + TIP_CHORD * spanT;
  return {
    chord,
    leading: ROOT_LE * (1 - spanT) + TIP_LE * spanT,
    thickness: (0.15 * (1 - spanT) + 0.07 * spanT) * chord,
    y0: -0.12 + Math.max(0, Math.abs(x) - WING_BREAK) * Math.tan(OUTER_DIHEDRAL),
  };
}

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const add = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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

function addBodyBox(
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
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
  ]);
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
  options: { readonly doubleSided?: boolean } = {},
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
    vertices: vertices.map(bodyToWorld),
    triangles: wound,
    showEdges: true,
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

function airfoilBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { chord, leading, thickness, y0 } = wingAt(x);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = leading - t * chord;
    const bump = Math.sin(Math.PI * t) * thickness * 0.5;
    const y = y0 + (upper ? bump : -bump * 0.82);
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
    DC3_WINGSPAN / 2,
]);

function addWing(id: string, sign: 1 | -1): void {
  const stations = WING_STATIONS
    .map((x) => airfoilBand(sign * x, 0, wingSkinEndT(sign * x)));
  const lofted = loftRings(stations);
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
    0.26,
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
  const trunnionY = -1.15;
  const trunnionZ = 0.22;
  const axleY = -2.15;
  const axleZ = 0.2;
  const pistonTopY = -1.62;

  addBodyBox(`gear-${side}-trunnion`, "gear-fittings", "metal",
    point(x, trunnionY + 0.03, trunnionZ), point(0.26, 0.2, 0.24));
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
  // проушина. Для сравнения: цапфа, которая тоже стоит, заходит на 0.155.
  addBodyBox(`gear-${side}-jack-fitting`, "gear-fittings", "metal",
    point(x, trunnionY + 0.14, trunnionZ + 0.62), point(0.2, 0.16, 0.18));
  addBeam(`gear-${side}-drag-link`, "gear", "metal",
    point(x, trunnionY - 0.02, trunnionZ + 0.04),
    point(x, pistonTopY + 0.06, axleZ + 0.34), 0.06, 0.05);

  addCylinder(`gear-${side}-axle`, "gear", "metal",
    point(x - 0.2, axleY, axleZ), point(x + 0.2, axleY, axleZ), 0.05, 10);
  addCylinder(`gear-${side}-hub`, "gear-fittings", "metal",
    point(x - 0.13, axleY, axleZ), point(x + 0.13, axleY, axleZ), 0.24, 16);
  addCylinder(`gear-${side}-wheel`, "gear", "timber-dark",
    point(x - 0.12, axleY, axleZ), point(x + 0.12, axleY, axleZ), 0.55, 18);
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
  readonly y0: number;
  readonly thick: number;
} {
  const t = Math.abs(x) / 3.25;
  const chord = 1.82 * (1 - t) + 1.02 * t;
  return {
    chord,
    leading: -10.15 - t * 0.35,
    y0: 0.4,
    thick: 0.12 * chord,
  };
}

function stabBand(x: number, t0: number, t1: number): ObjectPoint[] {
  const { chord, leading, y0, thick } = stabSection(x);
  return Array.from({ length: 8 }, (_, index) => {
    const upper = index <= 4;
    const s = upper ? index / 4 : (8 - index) / 4;
    const t = t0 + s * (t1 - t0);
    const bump = Math.sin(Math.PI * t) * thick * 0.5;
    return point(x, y0 + (upper ? bump : -bump), leading - t * chord);
  });
}

function inElevatorBay(x: number): boolean {
  const span = Math.abs(x);
  return span >= ELEV_IN && span <= ELEV_OUT;
}

const stabStations = uniqueStations([
  -3.25,
  -(ELEV_OUT + 0.04),
  -ELEV_OUT,
  -2.1,
  -0.9,
  -ELEV_IN,
  -(ELEV_IN - 0.04),
  0,
  ELEV_IN - 0.04,
  ELEV_IN,
  0.9,
  2.1,
  ELEV_OUT,
  ELEV_OUT + 0.04,
  3.25,
]).map((x) => stabBand(x, 0, inElevatorBay(x) ? STAB_HINGE_T - HINGE_GAP_T : 1));
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

const WING_SPAR_XS = [-DC3_WINGSPAN / 2 + 0.55, -12.6, -10.2, -7.4, -WING_JOINT, -ENGINE_X, -4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2, ENGINE_X, WING_JOINT, 7.4, 10.2, 12.6, DC3_WINGSPAN / 2 - 0.55];

function wingSkinInset(thickness: number): number {
  return Math.min(SKIN_INSET, thickness * 0.22);
}

function sparRing(x: number, chordT: number): ObjectPoint[] {
  const { chord, leading, thickness, y0 } = wingAt(x);
  const inset = wingSkinInset(thickness);
  const z = leading - chordT * chord;
  // Высота стенки считалась от МАКСИМАЛЬНОЙ толщины профиля, а профиль на
  // носке хорды тоньше: передний лонжерон вылезал наружу обшивки у корня на
  // 42 мм. Ограничиваем местной высотой профиля на СВОЕЙ хорде.
  const localBump = Math.sin(Math.PI * chordT) * thickness * 0.5;
  const up = Math.max(0.025, Math.min(thickness * 0.5, localBump) - inset);
  const down = Math.max(0.02, Math.min(thickness * 0.41, localBump * 0.82) - inset);
  const half = Math.min(SPAR_WEB / 2, Math.max(0.018, thickness * 0.14));
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
  const { chord, leading, thickness, y0 } = wingAt(x);
  const inset = wingSkinInset(thickness);
  const insetChord = Math.max(0.35, chord - inset * 2);
  const insetLead = leading - inset;
  const insetThick = Math.max(0.06, thickness - inset * 2);
  const half = AIRFOIL / 2;
  return Array.from({ length: AIRFOIL }, (_, index) => {
    const upper = index <= half;
    const s = upper ? index / half : (AIRFOIL - index) / half;
    const t = t0 + s * (t1 - t0);
    const z = insetLead - t * insetChord;
    const bump = Math.sin(Math.PI * t) * insetThick * 0.5;
    return point(x, y0 + (upper ? bump : -bump * 0.82), z);
  });
}

for (const x of [0, 1.4, 2.8, 4.2, ENGINE_X, WING_JOINT, 7.4, 9.2, 10.8, 12.4]) {
  const xs = x === 0 ? [0] : [-x, x];
  for (const station of xs) {
    const endT = wingSkinEndT(station);
    const lofted = loftRings([
      formerBand(station - 0.022, 0, endT),
      formerBand(station + 0.022, 0, endT),
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
 * в корне идёт от z = +1.18 (носок) до −3.24 (хвостик), его верх стоит на
 * y = +0.21, то есть выше пола, и оно резало спинки кресел. На кадре это
 * видно сразу, в числах — только если спросить про обвод, а не про силовой
 * набор.
 */
const WING_ROOT_LEADING_Z = 1.18;
const WING_ROOT_TRAILING_Z = -3.24;
const FORWARD_CABIN = { from: WING_ROOT_LEADING_Z + 0.12, to: 4.6, floorY: -0.55 } as const;
const AFT_CABIN = { from: -5.6, to: WING_ROOT_TRAILING_Z - 0.12, floorY: -0.75 } as const;
const CABIN_FLOOR_THICKNESS = 0.05;
const SEAT_PITCH = 1.0;

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

for (const cabin of [FORWARD_CABIN, AFT_CABIN]) {
  const rowZs = cabinRowZ(cabin);
  const frameZs = [
    rowZs[0] + SEAT_PITCH / 2,
    ...rowZs.map((z) => z - SEAT_PITCH / 2),
  ];
  for (const z of frameZs) {
    // Станции авторской таблицы уже несут своё кольцо — не дублируем.
    if (FUSELAGE_STATIONS.some((station) => Math.abs(station.z - z) < 0.2)) continue;
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
const NAV_LIGHT_X = 14.3;

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
  const board = sign > 0 ? "port" : "starboard";
  const tip = airfoilBand(sign * NAV_LIGHT_X, 0.12, 0.12)[0];
  addBodyBox(`nav-light-${board}-base`, "lights", "metal",
    point(sign * (NAV_LIGHT_X + 0.06), tip[1], tip[2]),
    point(0.12, 0.07, 0.16));
  addCylinder(`nav-light-${board}-cap`, "lights", "lamp-glass",
    point(sign * (NAV_LIGHT_X + 0.11), tip[1] + 0.02, tip[2]),
    point(sign * (NAV_LIGHT_X + 0.19), tip[1] + 0.02, tip[2]), 0.055, 12);
  parts.push({
    kind: "box",
    id: `nav-light-${board}-bulb`,
    group: "lights",
    material: "lamp-bulb",
    // Лампа сидит в НАРУЖНОЙ половине колпака: иначе свечение читается с
    // внутренней стороны законцовки, будто фонарь светит в крыло.
    center: bodyToWorld(point(sign * (NAV_LIGHT_X + 0.16), tip[1] + 0.02, tip[2])),
    size: [0.04, 0.04, 0.04],
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
  addBodyBox("nav-light-tail-base", "lights", "metal",
    point(0, finHeight(tail, tail.trailZ), tail.trailZ - 0.05),
    point(0.09, 0.09, 0.12));
  addCylinder("nav-light-tail-cap", "lights", "lamp-glass",
    point(0, finHeight(tail, tail.trailZ), tail.trailZ - 0.12),
    point(0, finHeight(tail, tail.trailZ), tail.trailZ - 0.17), 0.05, 12);
  parts.push({
    kind: "box",
    id: "nav-light-tail-bulb",
    group: "lights",
    material: "lamp-bulb",
    center: bodyToWorld(point(0, finHeight(tail, tail.trailZ), tail.trailZ - 0.14)),
    size: [0.04, 0.04, 0.04],
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

// Плафоны салона: по одному на пролёт, под потолком у борта. Внутренние —
// они горят и днём, потому что салон тёмный при любом небе.
for (const [tag, cabin] of [["fwd", FORWARD_CABIN], ["aft", AFT_CABIN]] as const) {
  for (const [row, z] of cabinRowZ(cabin).entries()) {
    const station = sampleStation(z);
    // Плафон висит ПОД обводом, а не в нём: борт у потолка сужается, и
    // тарелка шириной в треть метра на высоте 0.16 от кроны уже вылезала.
    const y = station.crown - SKIN_INSET - 0.22;
    addBodyBox(`cabin-lamp-${tag}-${row}-shade`, "cabin-trim", "metal",
      point(0, y + 0.045, z), point(0.26, 0.045, 0.2));
    parts.push({
      kind: "box",
      id: `cabin-lamp-${tag}-${row}-bulb`,
      group: "cabin-trim",
      material: "lamp-bulb",
      center: bodyToWorld(point(0, y, z)),
      size: [0.09, 0.05, 0.09],
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
    point(side * 3.0, -0.12, -0.75),
    point(2.4, 0.34, 1.9),
  );
}

addBodyBox(
  "nose-equipment-bay",
  "structure-fuselage",
  "metal",
  point(0, -0.15, 5.55),
  point(0.98, 0.64, 1.25),
);

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



const RAIL_STATIONS = FUSELAGE_STATIONS.filter(
  (station) => station.z <= 6.85 + 1e-9 && station.z > TAIL_Z + 1e-9,
);
const LONGERON_RAILS = [
  ["upper-right", (50 * Math.PI) / 180],
  ["upper-left", (130 * Math.PI) / 180],
  ["lower-left", (230 * Math.PI) / 180],
  ["lower-right", (310 * Math.PI) / 180],
] as const;
for (const [id, angle] of LONGERON_RAILS) {
  const lofted = loftRings(RAIL_STATIONS.map((station) => railSection(station, angle, LONGERON_HALF)));
  addClosedMesh(`longeron-${id}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
}

const STRINGER_ANGLES = [0, 30, 90, 150, 180, 210, 270, 330].map((deg) => (deg * Math.PI) / 180);
STRINGER_ANGLES.forEach((angle, index) => {
  const lofted = loftRings(RAIL_STATIONS.map((station) => railSection(station, angle, STRINGER_HALF)));
  addClosedMesh(`stringer-${index}`, "structure-fuselage", "metal", lofted.vertices, lofted.triangles);
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
    point(x, -1.15, 0.22),
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
  const t = Math.abs(x) / 3.25;
  const chord = 1.82 * (1 - t) + 1.02 * t;
  const leading = -10.15 - t * 0.35;
  const thick = 0.12 * chord;
  const z = leading - chordT * chord;
  const half = 0.022;
  const up = Math.max(0.018, thick * 0.35);
  return [
    point(x, 0.4 + up, z + half),
    point(x, 0.4 + up, z - half),
    point(x, 0.4 - up, z - half),
    point(x, 0.4 - up, z + half),
  ];
}

const STAB_XS = [-3.1, -2.1, -0.9, 0, 0.9, 2.1, 3.1];
for (const [id, chordT] of [["front", 0.22], ["rear", 0.72]] as const) {
  const lofted = loftRings(STAB_XS.map((x) => stabSparRing(x, chordT)));
  addClosedMesh(`stab-spar-${id}`, "structure-empennage", "metal", lofted.vertices, lofted.triangles);
}

const nose = bodyToWorld(point(0, 0.05, NOSE_Z));
const tail = bodyToWorld(point(0, 0.18, TAIL_Z));
const leftTip = bodyToWorld(point(-DC3_WINGSPAN / 2, -0.12 + (DC3_WINGSPAN / 2 - WING_BREAK) * Math.tan(OUTER_DIHEDRAL), TIP_LE - TIP_CHORD * 0.45));
const rightTip = bodyToWorld(point(DC3_WINGSPAN / 2, -0.12 + (DC3_WINGSPAN / 2 - WING_BREAK) * Math.tan(OUTER_DIHEDRAL), TIP_LE - TIP_CHORD * 0.45));
function wingHingePivot(x: number): ObjectPoint {
  const { chord, leading, y0 } = wingAt(x);
  return point(x, y0, leading - SPAR_REAR * chord);
}

function stabHingePivot(x: number): ObjectPoint {
  const { chord, leading, y0 } = stabSection(x);
  return point(x, y0, leading - STAB_HINGE_T * chord);
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
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
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
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
  },
  {
    id: "core-detail",
    label: "Joint · wing box through the belly",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, -0.05, 0.1)),
    fov: 32,
  },
  {
    id: "core-detail-cutaway",
    label: "Cutaway · three spars and frames at the carry-through",
    projection: "perspective",
    position: point(9.4, 1.05, 6.2),
    target: bodyToWorld(point(0, -0.05, 0.1)),
    fov: 32,
    hiddenGroups: ["fuselage", "wing", "nacelle-left", "nacelle-right", "empennage"],
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
    target: bodyToWorld(point(3.3, -0.12, -2.1)),
    fov: 30,
  },
  {
    id: "flap-detail-flaps-down",
    label: "Joint · inner flap down",
    projection: "perspective",
    position: point(8.8, 1.35, 5.4),
    target: bodyToWorld(point(3.3, -0.12, -2.1)),
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
    "Station tables, 5° outer dihedral and 19 ft engine half-span are authored. This is a three-point sit, not a level drawing.",
    "Each propeller is three Hamilton Standard paddle blades at the published 11 ft 6 in diameter; rotation is frozen.",
    "Nacelle is one metal teardrop the same diameter as the cowl, open at the lip around a Wright R-1820, then tapering through the wing to the trailing edge. Not a box behind a cylinder.",
    "Forward stations follow NASM A19530075000: accepted cabin (roof held, short round-in, blunt windshield onto the deck at z=6.5), then a bullet cap that stays fat past the glass and rounds at the tip. Not a stubby hemisphere on z=7, and not a greenhouse shifted aft to steal length. Glass panes stay out.",
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
    halfSpan: DC3_WINGSPAN / 2,
  },
  stabiliser: {
    section: stabSection,
    band: stabBand,
    inElevatorBay,
    hingeT: STAB_HINGE_T,
    halfSpan: 3.25,
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
  windows: Array.from({ length: 7 }, (_, index) => ({
    z: WINDOW_ROW_FIRST_Z - index * WINDOW_ROW_PITCH,
    centreY: WINDOW_ROW_CENTRE_Y,
    ...DC3_WINDOW_SIZE,
  })),
  cabins: {
    forward: FORWARD_CABIN,
    aft: AFT_CABIN,
    standClearance: CABIN_STAND,
    skinInset: SKIN_INSET,
  },
  spars: { front: SPAR_FRONT, main: SPAR_MAIN, rear: SPAR_REAR },
  hingeGapT: HINGE_GAP_T,
} as const;
