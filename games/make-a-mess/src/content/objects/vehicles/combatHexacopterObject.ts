import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  buildLoft,
  buildRevolution,
  buildSlab,
  buildTorqueBox,
  facetsToPart,
  type Facet,
  type PlanPoint,
} from "../authoring/solidBuilders.ts";

type CombatHexacopterView = ObjectLabView & { readonly up?: ObjectPoint };
type MaterialOverride = Readonly<Record<string, number | boolean>>;
type CombatHexacopterModel = Omit<ObjectLabModel, "views"> & {
  readonly materialOverrides: Readonly<Record<string, MaterialOverride>>;
  readonly views: readonly CombatHexacopterView[];
};

const TAU = Math.PI * 2;
const parts: ObjectLabPart[] = [];

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const plan = (x: number, z: number): PlanPoint => ({ x, z });
const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 24,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
  options: { readonly doubleSided?: boolean; readonly showEdges?: boolean; readonly vertexColors?: readonly ObjectPoint[] } = {},
) => parts.push({
  kind: "mesh",
  id,
  group,
  material,
  vertices,
  triangles,
  doubleSided: options.doubleSided,
  showEdges: options.showEdges,
  vertexColors: options.vertexColors,
});

const addFacets = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  options: { readonly showEdges?: boolean; readonly doubleSided?: boolean } = {},
) => parts.push(facetsToPart(id, group, material, facets, options));

const addEllipsoid = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  radii: ObjectPoint,
  longitudeSegments = 20,
  latitudeSegments = 10,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (let latitude = 0; latitude <= latitudeSegments; latitude += 1) {
    const phi = (latitude / latitudeSegments) * Math.PI;
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const theta = (longitude / longitudeSegments) * TAU;
      vertices.push(point(
        center[0] + Math.sin(phi) * Math.cos(theta) * radii[0],
        center[1] + Math.cos(phi) * radii[1],
        center[2] + Math.sin(phi) * Math.sin(theta) * radii[2],
      ));
    }
  }
  for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
    for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
      const next = (longitude + 1) % longitudeSegments;
      const a = latitude * longitudeSegments + longitude;
      const b = latitude * longitudeSegments + next;
      const c = (latitude + 1) * longitudeSegments + longitude;
      const d = (latitude + 1) * longitudeSegments + next;
      if (latitude === 0) triangles.push([a, c, d]);
      else if (latitude === latitudeSegments - 1) triangles.push([a, d, b]);
      else triangles.push([a, c, d], [a, d, b]);
    }
  }
  addMesh(id, group, material, vertices, triangles, { showEdges: false });
};

const rectangleRing = (minX: number, maxX: number, minZ: number, maxZ: number): PlanPoint[] => [
  plan(minX, minZ),
  plan(maxX, minZ),
  plan(maxX, maxZ),
  plan(minX, maxZ),
];

const buildAxialRevolution = (
  profile: readonly { readonly radius: number; readonly z: number }[],
  center: readonly [x: number, y: number],
  segments = 48,
  tag = "axial-revolution",
): Facet[] => {
  const ringAt = (radius: number, z: number): ObjectPoint[] =>
    Array.from({ length: segments }, (_, index) => {
      const angle = index * TAU / segments;
      return point(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, z);
    });
  const facets: Facet[] = [];
  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const current = ringAt(profile[profileIndex].radius, profile[profileIndex].z);
    const nextProfile = ringAt(profile[profileIndex + 1].radius, profile[profileIndex + 1].z);
    for (let side = 0; side < segments; side += 1) {
      const next = (side + 1) % segments;
      facets.push({
        points: [current[side], nextProfile[side], nextProfile[next], current[next]],
        tag,
      });
    }
  }
  return facets;
};

const cantedLocalToWorld = (
  center: ObjectPoint,
  cant: number,
  local: ObjectPoint,
): ObjectPoint => point(
  center[0] + local[0] * Math.cos(cant) + local[2] * Math.sin(cant),
  center[1] + local[1],
  center[2] - local[0] * Math.sin(cant) + local[2] * Math.cos(cant),
);

const buildCantedAxialRevolution = (
  profile: readonly { readonly radius: number; readonly axial: number }[],
  center: ObjectPoint,
  cant: number,
  segments = 48,
  tag = "canted-axial-revolution",
): Facet[] => {
  const ringAt = (radius: number, axial: number): ObjectPoint[] =>
    Array.from({ length: segments }, (_, index) => {
      const angle = index * TAU / segments;
      return cantedLocalToWorld(center, cant, point(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        axial,
      ));
    });
  const facets: Facet[] = [];
  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const current = ringAt(profile[profileIndex].radius, profile[profileIndex].axial);
    const nextProfile = ringAt(profile[profileIndex + 1].radius, profile[profileIndex + 1].axial);
    for (let side = 0; side < segments; side += 1) {
      const next = (side + 1) % segments;
      facets.push({
        points: [current[side], nextProfile[side], nextProfile[next], current[next]],
        tag,
      });
    }
  }
  return facets;
};

const buildMainRotorBlade = (
  centerX: number,
  centerZ: number,
  planeY: number,
  angle: number,
  spinSign: number,
  rootRadius: number,
  tipRadius: number,
): { readonly vertices: ObjectPoint[]; readonly triangles: ObjectTriangle[]; readonly colors: ObjectPoint[] } => {
  const spans = [
    { radius: rootRadius, halfChord: 0.105, color: point(0.035, 0.042, 0.045) },
    { radius: lerp(rootRadius, tipRadius, 0.48), halfChord: 0.085, color: point(0.045, 0.052, 0.055) },
    { radius: lerp(rootRadius, tipRadius, 0.82), halfChord: 0.062, color: point(0.11, 0.105, 0.09) },
    { radius: tipRadius, halfChord: 0.035, color: point(0.03, 0.036, 0.04) },
  ];
  const vertices: ObjectPoint[] = [];
  const colors: ObjectPoint[] = [];
  for (const span of spans) {
    const twist = spinSign * 0.12 * ((span.radius - rootRadius) / (tipRadius - rootRadius));
    const bladeAngle = angle + twist;
    for (const y of [planeY - 0.024, planeY + 0.024]) {
      for (const tangent of [-1, 1]) {
        vertices.push(point(
          centerX + Math.cos(bladeAngle) * span.radius - Math.sin(bladeAngle) * tangent * span.halfChord,
          y,
          centerZ + Math.sin(bladeAngle) * span.radius + Math.cos(bladeAngle) * tangent * span.halfChord,
        ));
        colors.push(span.color);
      }
    }
  }
  const triangles: ObjectTriangle[] = [];
  for (let span = 0; span < spans.length - 1; span += 1) {
    const a = span * 4;
    const b = (span + 1) * 4;
    triangles.push(
      [a, b, b + 1], [a, b + 1, a + 1],
      [a + 2, a + 3, b + 3], [a + 2, b + 3, b + 2],
      [a + 1, b + 1, b + 3], [a + 1, b + 3, a + 3],
      [a + 2, b + 2, b], [a + 2, b, a],
    );
  }
  const last = (spans.length - 1) * 4;
  triangles.push([0, 1, 3], [0, 3, 2], [last, last + 2, last + 3], [last, last + 3, last + 1]);
  return { vertices, triangles, colors };
};

const buildYawBlade = (
  center: ObjectPoint,
  cant: number,
  angle: number,
  rootRadius: number,
  tipRadius: number,
): { readonly vertices: ObjectPoint[]; readonly triangles: ObjectTriangle[] } => {
  const halfThickness = 0.024;
  const rootChord = 0.065;
  const tipChord = 0.034;
  const radial = (radius: number, tangent: number, axial: number): ObjectPoint => cantedLocalToWorld(
    center,
    cant,
    point(
      Math.cos(angle) * radius - Math.sin(angle) * tangent,
      Math.sin(angle) * radius + Math.cos(angle) * tangent,
      axial,
    ),
  );
  const vertices = [
    radial(rootRadius, -rootChord, -halfThickness),
    radial(rootRadius, rootChord, -halfThickness),
    radial(tipRadius, tipChord, -halfThickness),
    radial(tipRadius, -tipChord, -halfThickness),
    radial(rootRadius, -rootChord, halfThickness),
    radial(rootRadius, rootChord, halfThickness),
    radial(tipRadius, tipChord, halfThickness),
    radial(tipRadius, -tipChord, halfThickness),
  ];
  const triangles: ObjectTriangle[] = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  return { vertices, triangles };
};

/**
 * СТАЛЬНАЯ ЛИНЕЙКА: плоский лист заданной толщины по четырём углам.
 *
 * Нужна ровно потому, что тело вращения — не конструкция. Обечайка, собранная
 * одним `buildRevolution`, выглядит кольцом, но несёт её один-единственный
 * кусок: снесли его — и всё, что к нему прилегало, повисло в воздухе, потому
 * что опереться больше не на что. Набор из отдельных листов ведёт себя как
 * настоящий набор: каждый сегмент несёт соседей и накладки, а теряется он
 * поодиночке.
 *
 * Толщина откладывается по НОРМАЛИ четырёхугольника, а не по мировой оси:
 * скошенный воротник иначе получал бы разную толщину по дуге.
 */
const steelPlate = (
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
  d: ObjectPoint,
  thickness: number,
  tag: string,
): Facet[] => {
  const edge1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const edge2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const normal = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0],
  ];
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const half = thickness / 2;
  const offset = (p: ObjectPoint, sign: number): ObjectPoint => point(
    p[0] + (normal[0] / length) * half * sign,
    p[1] + (normal[1] / length) * half * sign,
    p[2] + (normal[2] / length) * half * sign,
  );
  const [a0, b0, c0, d0] = [a, b, c, d].map((p) => offset(p, -1));
  const [a1, b1, c1, d1] = [a, b, c, d].map((p) => offset(p, 1));
  return [
    { points: [a1, b1, c1, d1], tag },
    { points: [d0, c0, b0, a0], tag },
    { points: [a0, b0, b1, a1], tag },
    { points: [b0, c0, c1, b1], tag },
    { points: [c0, d0, d1, c1], tag },
    { points: [d0, a0, a1, d1], tag },
  ];
};

/** Сколько стальных сегментов в кольце одной гондолы. */
const LIFT_RING_SEGMENTS = 12;

export const COMBAT_HEX_LIFT_STATIONS = [
  { id: "front-left", x: -2.35, z: 1.95, outerRadius: 0.78, planeY: 1.08, spin: "cw", powerClass: "standard" },
  { id: "front-right", x: 2.35, z: 1.95, outerRadius: 0.78, planeY: 1.08, spin: "ccw", powerClass: "standard" },
  { id: "middle-left", x: -2.62, z: 0.2, outerRadius: 0.78, planeY: 1.1, spin: "ccw", powerClass: "standard" },
  { id: "middle-right", x: 2.62, z: 0.2, outerRadius: 0.78, planeY: 1.1, spin: "cw", powerClass: "standard" },
  { id: "rear-left", x: -2.25, z: -1.85, outerRadius: 0.88, planeY: 1.25, spin: "cw", powerClass: "boost" },
  { id: "rear-right", x: 2.25, z: -1.85, outerRadius: 0.88, planeY: 1.25, spin: "ccw", powerClass: "boost" },
] as const;

export const COMBAT_HEX_YAW_STATIONS = [
  { id: "left", x: -1.02, y: 1.36, z: -0.48, cant: -Math.PI / 10, spin: "cw" },
  { id: "right", x: 1.02, y: 1.36, z: -0.48, cant: Math.PI / 10, spin: "ccw" },
] as const;

type LiftStation = typeof COMBAT_HEX_LIFT_STATIONS[number];

const liftDeck = (station: LiftStation) => station.planeY + 0.15;
const liftFloor = (station: LiftStation) => station.planeY - 0.2;
const liftThroat = (station: LiftStation) => station.outerRadius - 0.065;
const liftTip = (station: LiftStation) => station.outerRadius - 0.105;

for (const station of COMBAT_HEX_LIFT_STATIONS) {
  const group = `lift-${station.id}`;
  const center = plan(station.x, station.z);
  const deck = liftDeck(station);
  const floor = liftFloor(station);
  const throat = liftThroat(station);
  const outer = station.outerRadius;
  const mouth = throat + 0.025;

  // КОЛЬЦО ИЗ СОЕДИНЁННЫХ СТАЛЬНЫХ СЕГМЕНТОВ, А НЕ ТОЧЁНАЯ БОЧКА.
  //
  // Так собран первый тяжёлый коптер: обечайка там — двенадцать стальных
  // панелей, каждая со своей несущей площадью и обычным допуском стыка. Тело
  // вращения на его месте выглядит так же, но конструкцией не является: у
  // машины не остаётся силового пути от лопасти к лонжерону, и держать
  // движитель приходится не геометрией, а раздутым допуском.
  //
  // Отсюда порядок работы кольца: сегменты — стенка и силовой набор, воротники
  // сверху и снизу — вход и выход тоннеля, статорные стойки упираются в стенку
  // изнутри, мотор висит на стойках. Каждое звено этой цепи существует.
  const ringTop = deck - 0.02;
  const ringBottom = floor + 0.02;
  const wall = (outer - throat) * 0.5;
  const collarRise = 0.085;
  const ringAt = (radius: number, angle: number, y: number): ObjectPoint =>
    point(station.x + Math.cos(angle) * radius, y, station.z + Math.sin(angle) * radius);

  for (let segment = 0; segment < LIFT_RING_SEGMENTS; segment += 1) {
    const from = (segment / LIFT_RING_SEGMENTS) * TAU;
    const to = ((segment + 1) / LIFT_RING_SEGMENTS) * TAU;
    const mid = (from + to) / 2;
    // Стенка сегмента: наружу — броневая грань, внутрь — рабочая поверхность
    // тоннеля. Чуть скруглена по высоте наружным поясом.
    addFacets(
      `${group}-ring-segment-${segment}`,
      group,
      segment % 2 === 0 ? "timber-mid" : "timber-dark",
      steelPlate(
        ringAt(outer, from, ringBottom),
        ringAt(outer, to, ringBottom),
        ringAt(outer, to, ringTop),
        ringAt(outer, from, ringTop),
        wall,
        "ring-segment",
      ),
      { showEdges: false },
    );
    // Стык сегментов — накладная планка снаружи: она и держит соседей вместе.
    addFacets(
      `${group}-ring-splice-${segment}`,
      group,
      "metal",
      buildTorqueBox({
        from: ringAt(outer + wall * 0.45, from, ringBottom - 0.005),
        to: ringAt(outer + wall * 0.45, from, ringTop + 0.005),
        width: 0.055,
        height: 0.03,
        chamfer: 0.008,
        tag: "ring-splice",
      }),
      { showEdges: false },
    );
    // ВЕРХНИЙ КОНИЧЕСКИЙ ВОРОТНИК — сплошной, из скошенных внутрь линеек:
    // длина по дуге заметно больше высоты, как и просили. Это вход тоннеля.
    addFacets(
      `${group}-collar-top-${segment}`,
      group,
      "metal",
      steelPlate(
        ringAt(outer, from, ringTop),
        ringAt(outer, to, ringTop),
        ringAt(mouth, to, ringTop + collarRise),
        ringAt(mouth, from, ringTop + collarRise),
        0.026,
        "collar-top",
      ),
      { showEdges: false },
    );
    // НИЖНИЙ ВОРОТНИК — зеркальный: выход тоннеля, поджатый внутрь.
    addFacets(
      `${group}-collar-bottom-${segment}`,
      group,
      "roof-dark",
      steelPlate(
        ringAt(mouth, from, ringBottom - collarRise * 0.8),
        ringAt(mouth, to, ringBottom - collarRise * 0.8),
        ringAt(outer, to, ringBottom),
        ringAt(outer, from, ringBottom),
        0.024,
        "collar-bottom",
      ),
      { showEdges: false },
    );
    void mid;
  }

  const hubRadius = station.powerClass === "boost" ? 0.18 : 0.155;
  addCylinder(`${group}-motor`, group, "metal", point(station.x, station.planeY - 0.17, station.z), point(station.x, station.planeY + 0.17, station.z), hubRadius, 28);
  addCylinder(`${group}-motor-cap`, group, "timber-mid", point(station.x, station.planeY + 0.16, station.z), point(station.x, station.planeY + 0.215, station.z), hubRadius * 0.7, 24);
  addCylinder(`${group}-hub-index`, group, "paint-accent", point(station.x, station.planeY + 0.211, station.z), point(station.x, station.planeY + 0.219, station.z), hubRadius * 0.22, 14);

  for (let bladeIndex = 0; bladeIndex < 5; bladeIndex += 1) {
    const phase = station.spin === "cw" ? 0.16 : 0.16 + Math.PI / 5;
    const blade = buildMainRotorBlade(
      station.x,
      station.z,
      station.planeY,
      phase + bladeIndex * TAU / 5,
      station.spin === "cw" ? 1 : -1,
      hubRadius * 0.88,
      liftTip(station),
    );
    addMesh(`${group}-blade-${bladeIndex}`, group, "canvas", blade.vertices, blade.triangles, {
      doubleSided: true,
      vertexColors: blade.colors,
      showEdges: false,
    });
  }

  for (let pylon = 0; pylon < 3; pylon += 1) {
    const angle = pylon * TAU / 3 + 0.3;
    addFacets(`${group}-motor-pylon-${pylon}`, group, "timber-dark", buildTorqueBox({
      from: point(station.x + Math.cos(angle) * hubRadius, station.planeY - 0.07, station.z + Math.sin(angle) * hubRadius),
      to: point(station.x + Math.cos(angle) * (throat - 0.005), station.planeY - 0.09, station.z + Math.sin(angle) * (throat - 0.005)),
      width: 0.065,
      height: 0.08,
      chamfer: 0.018,
      tag: "motor-pylon",
    }));
  }

  // Броневых накладок больше нет: сегмент кольца САМ и есть броня. Прежние
  // шесть коробочек висели поверх бочки и держались только допуском — теперь
  // ту же грань несёт кусок, который эту нагрузку действительно принимает.
  const side = station.x < 0 ? -1 : 1;
  addBox(
    `${group}-service-panel`,
    group,
    "dark-recess",
    point(station.x + side * (outer - wall * 0.5), station.planeY - 0.02, station.z),
    point(0.05, 0.09, 0.25),
  );
}

const YAW_OUTER_RADIUS = 0.41;
const YAW_THROAT_RADIUS = 0.355;
const YAW_TIP_RADIUS = 0.335;
const YAW_FRONT_AXIAL = 0.38;
const YAW_REAR_AXIAL = -0.38;

for (const station of COMBAT_HEX_YAW_STATIONS) {
  const group = `yaw-${station.id}`;
  const center = point(station.x, station.y, station.z);
  const world = (localX: number, localY: number, axial: number) => cantedLocalToWorld(
    center,
    station.cant,
    point(localX, localY, axial),
  );
  addFacets(`${group}-tunnel`, group, "roof-dark", buildCantedAxialRevolution([
    { radius: YAW_THROAT_RADIUS + 0.025, axial: YAW_FRONT_AXIAL },
    { radius: YAW_OUTER_RADIUS - 0.018, axial: YAW_FRONT_AXIAL },
    { radius: YAW_OUTER_RADIUS, axial: YAW_FRONT_AXIAL - 0.035 },
    { radius: YAW_OUTER_RADIUS, axial: YAW_REAR_AXIAL + 0.035 },
    { radius: YAW_OUTER_RADIUS - 0.02, axial: YAW_REAR_AXIAL },
    { radius: YAW_THROAT_RADIUS + 0.045, axial: YAW_REAR_AXIAL },
    { radius: YAW_THROAT_RADIUS, axial: YAW_REAR_AXIAL + 0.055 },
    { radius: YAW_THROAT_RADIUS, axial: YAW_FRONT_AXIAL - 0.08 },
    { radius: YAW_THROAT_RADIUS + 0.025, axial: YAW_FRONT_AXIAL },
  ], center, station.cant, 48, "yaw-tunnel"), { showEdges: false });

  addFacets(`${group}-front-rim`, group, "metal", buildCantedAxialRevolution([
    { radius: YAW_THROAT_RADIUS + 0.012, axial: YAW_FRONT_AXIAL + 0.012 },
    { radius: YAW_OUTER_RADIUS + 0.014, axial: YAW_FRONT_AXIAL + 0.012 },
    { radius: YAW_OUTER_RADIUS + 0.028, axial: YAW_FRONT_AXIAL - 0.016 },
    { radius: YAW_OUTER_RADIUS + 0.014, axial: YAW_FRONT_AXIAL - 0.045 },
    { radius: YAW_THROAT_RADIUS + 0.012, axial: YAW_FRONT_AXIAL - 0.045 },
    { radius: YAW_THROAT_RADIUS + 0.012, axial: YAW_FRONT_AXIAL + 0.012 },
  ], center, station.cant, 48, "yaw-rim"), { showEdges: false });

  addCylinder(`${group}-motor`, group, "metal", world(0, 0, -0.13), world(0, 0, 0.13), 0.095, 24);
  addCylinder(`${group}-hub-cap`, group, "timber-mid", world(0, 0, 0.12), world(0, 0, 0.17), 0.075, 20);
  for (let bladeIndex = 0; bladeIndex < 7; bladeIndex += 1) {
    const blade = buildYawBlade(center, station.cant, bladeIndex * TAU / 7 + (station.spin === "cw" ? 0.1 : 0.32), 0.085, YAW_TIP_RADIUS);
    addMesh(`${group}-blade-${bladeIndex}`, group, "timber-mid", blade.vertices, blade.triangles, { showEdges: false });
  }

  const statorFacets: Facet[] = [];
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = spoke * TAU / 8 + Math.PI / 8;
    statorFacets.push(...buildTorqueBox({
      from: world(Math.cos(angle) * 0.105, Math.sin(angle) * 0.105, -0.2),
      to: world(Math.cos(angle) * (YAW_THROAT_RADIUS - 0.012), Math.sin(angle) * (YAW_THROAT_RADIUS - 0.012), -0.2),
      width: 0.026,
      height: 0.028,
      chamfer: 0.006,
      tag: "yaw-stator",
    }));
  }
  addFacets(`${group}-stator`, group, "timber-dark", statorFacets, { showEdges: false });

  for (let pylon = 0; pylon < 3; pylon += 1) {
    const angle = pylon * TAU / 3 + 0.22;
    addFacets(`${group}-motor-pylon-${pylon}`, group, "timber-dark", buildTorqueBox({
      from: world(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0.06),
      to: world(Math.cos(angle) * (YAW_THROAT_RADIUS - 0.01), Math.sin(angle) * (YAW_THROAT_RADIUS - 0.01), 0.06),
      width: 0.045,
      height: 0.05,
      chamfer: 0.012,
      tag: "yaw-motor-pylon",
    }));
  }
}

// ---------------------------------------------------------------------------
// Primary frame. There is deliberately no external perimeter rail: each lift
// ring enters the survival cell through two separated inward root structures.
// ---------------------------------------------------------------------------

type LiftRootPair = readonly [primary: ObjectPoint, secondary: ObjectPoint];

/**
 * УЗЛЫ КОРНЕЙ ТЯГ. Каждый обязан лежать В БОРТУ, а не рядом с ним.
 *
 * Передняя пара этого правила не соблюдала: корень стоял на x = ±0.58 при
 * z = 2.18, а нос к этой станции сужается до 0.43 — тяга начиналась в
 * пятнадцати сантиметрах от обшивки, и в кадре между ней и корпусом была
 * видна щель. Ошибка типовая: координата взята той же логикой, что у широких
 * средних станций, где борт действительно так далеко.
 *
 * Числа ниже сняты с ФАКТИЧЕСКОГО профиля несущего корпуса: на z = 2.00 борт
 * доходит до 0.560, поэтому корень уходит назад к этой станции и садится на
 * 0.54, прикусывая обшивку на пару сантиметров. Тяга получает небольшую
 * стреловидность вперёд к кольцу — именно так и крепится вынесенная вперёд
 * балка.
 */
const liftRootNodes = (station: LiftStation, side: number): LiftRootPair => {
  if (station.id.startsWith("front")) {
    return [point(side * 0.54, 1.06, 2.0), point(side * 0.72, 0.93, 1.46)];
  }
  if (station.id.startsWith("middle")) {
    return [point(side * 0.72, 1.16, 0.76), point(side * 0.84, 0.96, -0.34)];
  }
  return [point(side * 0.68, 1.37, -1.05), point(side * 0.48, 1.19, -2.2)];
};

const taperedRootOutline = (
  from: ObjectPoint,
  to: ObjectPoint,
  fromHalfWidth: number,
  toHalfWidth: number,
): PlanPoint[] => {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const normalX = -dz / length;
  const normalZ = dx / length;
  return [
    plan(from[0] + normalX * fromHalfWidth, from[2] + normalZ * fromHalfWidth),
    plan(to[0] + normalX * toHalfWidth, to[2] + normalZ * toHalfWidth),
    plan(to[0] - normalX * toHalfWidth, to[2] - normalZ * toHalfWidth),
    plan(from[0] - normalX * fromHalfWidth, from[2] - normalZ * fromHalfWidth),
  ];
};

const buildRootTransition = (
  from: ObjectPoint,
  to: ObjectPoint,
  halfWidths: readonly [number, number, number, number],
  heights: readonly [number, number, number, number],
  tag: string,
): Facet[] => {
  const ratios = [0, 0.34, 0.72, 1] as const;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const normalX = -dz / length;
  const normalZ = dx / length;
  const sections = ratios.map((ratio, index) => {
    const centreX = lerp(from[0], to[0], ratio);
    const centreY = lerp(from[1], to[1], ratio) + Math.sin(ratio * Math.PI) * 0.025;
    const centreZ = lerp(from[2], to[2], ratio);
    const halfWidth = halfWidths[index];
    const halfHeight = heights[index] / 2;
    const corner = Math.min(halfWidth * 0.28, halfHeight * 0.42);
    const at = (lateral: number, vertical: number) => point(
      centreX + normalX * lateral,
      centreY + vertical,
      centreZ + normalZ * lateral,
    );
    return [
      at(-halfWidth + corner, -halfHeight),
      at(halfWidth - corner, -halfHeight),
      at(halfWidth, -halfHeight + corner),
      at(halfWidth, halfHeight - corner),
      at(halfWidth - corner, halfHeight),
      at(-halfWidth + corner, halfHeight),
      at(-halfWidth, halfHeight - corner),
      at(-halfWidth, -halfHeight + corner),
    ];
  });
  return buildLoft(sections, { tag, capStart: true, capEnd: true });
};

for (const station of COMBAT_HEX_LIFT_STATIONS) {
  const side = station.x < 0 ? -1 : 1;
  const wallReach = station.outerRadius - 0.035;
  const ringZSpread = station.outerRadius * 0.34;
  const ringXReach = Math.sqrt(wallReach * wallReach - ringZSpread * ringZSpread);
  const primaryRing = point(station.x - side * ringXReach, station.planeY, station.z + ringZSpread);
  const secondaryRing = point(station.x - side * ringXReach, station.planeY, station.z - ringZSpread);
  const [primaryRoot, secondaryRoot] = liftRootNodes(station, side);
  const isBoost = station.powerClass === "boost";
  const isMiddle = station.id.startsWith("middle");
  const primaryWidths = isBoost
    ? [0.3, 0.285, 0.225, 0.17] as const
    : isMiddle
      ? [0.255, 0.27, 0.205, 0.145] as const
      : [0.245, 0.225, 0.18, 0.145] as const;
  const primaryHeights = isBoost
    ? [0.3, 0.28, 0.225, 0.19] as const
    : isMiddle
      ? [0.25, 0.265, 0.215, 0.17] as const
      : [0.24, 0.225, 0.195, 0.17] as const;
  const secondaryWidths = isBoost
    ? [0.225, 0.205, 0.155, 0.125] as const
    : isMiddle
      ? [0.19, 0.205, 0.145, 0.095] as const
      : [0.18, 0.165, 0.125, 0.095] as const;
  const secondaryHeights = isBoost
    ? [0.225, 0.21, 0.17, 0.145] as const
    : isMiddle
      ? [0.19, 0.205, 0.155, 0.12] as const
      : [0.18, 0.165, 0.145, 0.12] as const;

  addFacets(`clevis-inboard-${station.id}`, "primary-frame", "timber-dark", buildTorqueBox({
    from: primaryRoot,
    to: primaryRing,
    width: isBoost ? 0.22 : 0.18,
    height: isBoost ? 0.24 : 0.2,
    chamfer: isBoost ? 0.052 : 0.042,
    tag: "primary-root-spar",
  }));
  addFacets(`clevis-secondary-${station.id}`, "primary-frame", "timber-mid", buildTorqueBox({
    from: secondaryRoot,
    to: secondaryRing,
    width: isBoost ? 0.16 : 0.12,
    height: isBoost ? 0.19 : 0.15,
    chamfer: isBoost ? 0.038 : 0.028,
    tag: "secondary-root-spar",
  }));
  addFacets(`root-fairing-primary-${station.id}`, "root-fairings", "roof-dark", buildRootTransition(
    primaryRoot,
    primaryRing,
    primaryWidths,
    primaryHeights,
    "primary-root-fairing",
  ), { showEdges: false });
  addFacets(`root-fairing-secondary-${station.id}`, "root-fairings", "timber-dark", buildRootTransition(
    secondaryRoot,
    secondaryRing,
    secondaryWidths,
    secondaryHeights,
    "secondary-root-fairing",
  ), { showEdges: false });

  for (const [index, ringPoint] of [primaryRing, secondaryRing].entries()) {
    const radialX = ringPoint[0] - station.x;
    const radialZ = ringPoint[2] - station.z;
    const radialLength = Math.hypot(radialX, radialZ);
    const tangentX = -radialZ / radialLength;
    const tangentZ = radialX / radialLength;
    addFacets(`ring-saddle-${station.id}-${index}`, "primary-frame", "metal", buildTorqueBox({
      from: point(ringPoint[0] - tangentX * 0.12, ringPoint[1], ringPoint[2] - tangentZ * 0.12),
      to: point(ringPoint[0] + tangentX * 0.12, ringPoint[1], ringPoint[2] + tangentZ * 0.12),
      width: isBoost ? 0.13 : 0.105,
      height: isBoost ? 0.19 : 0.16,
      chamfer: 0.028,
      tag: "ring-saddle",
    }), { showEdges: false });
    addCylinder(
      `ring-saddle-pin-${station.id}-${index}`,
      "primary-frame",
      "paint-accent",
      point(ringPoint[0], ringPoint[1] - 0.12, ringPoint[2]),
      point(ringPoint[0], ringPoint[1] + 0.13, ringPoint[2]),
      isBoost ? 0.028 : 0.023,
      12,
    );
  }

  for (const [index, root] of [primaryRoot, secondaryRoot].entries()) {
    addFacets(`core-root-doubler-${station.id}-${index}`, "primary-frame", "metal", buildTorqueBox({
      from: point(root[0], root[1] - 0.11, root[2] - 0.1),
      to: point(root[0], root[1] + 0.11, root[2] + 0.1),
      width: index === 0 ? 0.11 : 0.085,
      height: index === 0 ? 0.16 : 0.13,
      chamfer: 0.024,
      tag: "core-root-doubler",
    }), { showEdges: false });
  }
}

for (const side of [-1, 1]) {
  const frontRoots = liftRootNodes(COMBAT_HEX_LIFT_STATIONS[side < 0 ? 0 : 1], side);
  const middleRoots = liftRootNodes(COMBAT_HEX_LIFT_STATIONS[side < 0 ? 2 : 3], side);
  const rearRoots = liftRootNodes(COMBAT_HEX_LIFT_STATIONS[side < 0 ? 4 : 5], side);
  addFacets(`inner-bay-longeron-${side}`, "primary-frame", "timber-dark", [
    ...buildTorqueBox({ from: frontRoots[1], to: middleRoots[0], width: 0.095, height: 0.13, chamfer: 0.026, tag: "inner-longeron" }),
    ...buildTorqueBox({ from: middleRoots[1], to: rearRoots[0], width: 0.11, height: 0.15, chamfer: 0.03, tag: "inner-longeron" }),
  ]);
  addFacets(`inner-bay-diagonal-${side}`, "primary-frame", "timber-mid", [
    ...buildTorqueBox({ from: frontRoots[0], to: middleRoots[1], width: 0.07, height: 0.1, chamfer: 0.02, tag: "inner-diagonal" }),
    ...buildTorqueBox({ from: middleRoots[0], to: rearRoots[1], width: 0.08, height: 0.11, chamfer: 0.022, tag: "inner-diagonal" }),
  ]);
}

// ---------------------------------------------------------------------------
// Survival cell and yaw shoulders.
// ---------------------------------------------------------------------------

addFacets("survival-keel", "survival-frame", "roof-dark", buildTorqueBox({
  from: point(0, 0.53, 2.62),
  to: point(0, 0.76, -2.72),
  width: 0.42,
  height: 0.34,
  chamfer: 0.07,
  tag: "keel",
}));

for (const side of [-1, 1]) {
  const yawStation = COMBAT_HEX_YAW_STATIONS[side < 0 ? 0 : 1];
  const yawCenter = point(yawStation.x, yawStation.y, yawStation.z);
  const yawWorld = (localX: number, localY: number, axial: number) => cantedLocalToWorld(
    yawCenter,
    yawStation.cant,
    point(localX, localY, axial),
  );
  addFacets(`survival-lower-longeron-${side}`, "survival-frame", "timber-dark", buildTorqueBox({
    from: point(side * 0.42, 0.65, 2.38),
    to: point(side * 0.46, 0.82, -1.92),
    width: 0.15,
    height: 0.2,
    chamfer: 0.04,
    tag: "lower-longeron",
  }));
  addFacets(`survival-canopy-sill-${side}`, "survival-frame", "metal", buildTorqueBox({
    from: point(side * 0.48, 1.12, 2.02),
    to: point(side * 0.52, 1.34, -0.18),
    width: 0.105,
    height: 0.12,
    chamfer: 0.028,
    tag: "canopy-sill",
  }));
  addFacets(`shoulder-yaw-upper-${side}`, "survival-frame", "roof-dark", buildTorqueBox({
    from: point(side * 0.48, 1.69, -0.16),
    to: yawWorld(-side * 0.08, 0.38, -0.08),
    width: 0.18,
    height: 0.2,
    chamfer: 0.042,
    tag: "yaw-upper-carrier",
  }));
  addFacets(`shoulder-yaw-lower-${side}`, "survival-frame", "roof-dark", buildTorqueBox({
    from: point(side * 0.55, 0.98, -0.18),
    to: yawWorld(-side * 0.1, -0.38, -0.04),
    width: 0.19,
    height: 0.21,
    chamfer: 0.044,
    tag: "yaw-lower-carrier",
  }));
  addFacets(`shoulder-yaw-outboard-${side}`, "survival-frame", "timber-mid", buildTorqueBox({
    from: point(side * 0.48, 1.49, -1.28),
    to: yawWorld(side * 0.37, 0.02, -0.12),
    width: 0.14,
    height: 0.17,
    chamfer: 0.034,
    tag: "yaw-outboard-carrier",
  }));
  addFacets(`shoulder-yaw-diagonal-${side}`, "survival-frame", "timber-mid", buildTorqueBox({
    from: point(side * 0.51, 1.28, -0.02),
    to: yawWorld(side * 0.24, 0.25, 0.18),
    width: 0.095,
    height: 0.12,
    chamfer: 0.024,
    tag: "yaw-diagonal-carrier",
  }));
}

for (const z of [1.95, 0.18, -0.2]) {
  const front = z > 1;
  const rear = z < 0;
  const half = front ? 0.43 : rear ? 0.46 : 0.48;
  const baseY = front ? 1.04 : rear ? 1.24 : 1.15;
  const crownY = front ? 1.39 : rear ? 1.67 : 1.72;
  addFacets(`survival-arch-${z}`, "survival-frame", "metal", [
    ...buildTorqueBox({ from: point(-half, baseY, z), to: point(-0.22, crownY, z), width: 0.09, height: 0.105, chamfer: 0.024, tag: "arch" }),
    ...buildTorqueBox({ from: point(half, baseY, z), to: point(0.22, crownY, z), width: 0.09, height: 0.105, chamfer: 0.024, tag: "arch" }),
    ...buildTorqueBox({ from: point(-0.22, crownY, z), to: point(0.22, crownY, z), width: 0.085, height: 0.1, chamfer: 0.022, tag: "arch" }),
  ]);
}

// ---------------------------------------------------------------------------
// Faceted armoured body, canopy and raised systems spine.
// ---------------------------------------------------------------------------

type BodySection = {
  readonly z: number;
  readonly bellyY: number;
  readonly keelHalf: number;
  readonly chineHalf: number;
  readonly chineY: number;
  readonly shoulderHalf: number;
  readonly deckY: number;
  readonly crownY: number;
};

export const COMBAT_HEX_BODY_SECTIONS: readonly BodySection[] = [
  { z: 3.15, bellyY: 0.74, keelHalf: 0.08, chineHalf: 0.17, chineY: 0.79, shoulderHalf: 0.13, deckY: 0.88, crownY: 0.92 },
  { z: 2.65, bellyY: 0.55, keelHalf: 0.18, chineHalf: 0.4, chineY: 0.69, shoulderHalf: 0.3, deckY: 0.99, crownY: 1.03 },
  { z: 1.95, bellyY: 0.47, keelHalf: 0.28, chineHalf: 0.63, chineY: 0.65, shoulderHalf: 0.56, deckY: 1.1, crownY: 1.14 },
  { z: 1.25, bellyY: 0.43, keelHalf: 0.35, chineHalf: 0.72, chineY: 0.62, shoulderHalf: 0.68, deckY: 1.15, crownY: 1.2 },
  { z: 0.3, bellyY: 0.42, keelHalf: 0.38, chineHalf: 0.75, chineY: 0.63, shoulderHalf: 0.72, deckY: 1.18, crownY: 1.25 },
  { z: -0.45, bellyY: 0.66, keelHalf: 0.35, chineHalf: 0.68, chineY: 0.78, shoulderHalf: 0.66, deckY: 1.28, crownY: 1.37 },
  { z: -1.15, bellyY: 0.98, keelHalf: 0.28, chineHalf: 0.56, chineY: 1.08, shoulderHalf: 0.52, deckY: 1.45, crownY: 1.57 },
  { z: -2.1, bellyY: 1.28, keelHalf: 0.22, chineHalf: 0.43, chineY: 1.38, shoulderHalf: 0.38, deckY: 1.66, crownY: 1.78 },
  { z: -3.25, bellyY: 1.55, keelHalf: 0.1, chineHalf: 0.25, chineY: 1.62, shoulderHalf: 0.18, deckY: 1.8, crownY: 1.94 },
];

const bodyRing = (section: BodySection): ObjectPoint[] => [
  point(0, section.bellyY, section.z),
  point(section.keelHalf, section.bellyY + 0.025, section.z),
  point(section.chineHalf, section.chineY, section.z),
  point(section.shoulderHalf, section.deckY, section.z),
  point(0, section.crownY, section.z),
  point(-section.shoulderHalf, section.deckY, section.z),
  point(-section.chineHalf, section.chineY, section.z),
  point(-section.keelHalf, section.bellyY + 0.025, section.z),
];

addFacets("armoured-body-shell", "outer-shell", "timber-dark", buildLoft(
  COMBAT_HEX_BODY_SECTIONS.map(bodyRing),
  { tag: "armoured-body", capStart: true, capEnd: true },
), { showEdges: false });

type CanopySection = {
  readonly z: number;
  readonly baseHalf: number;
  readonly baseY: number;
  readonly glassHalf: number;
  readonly glassY: number;
  readonly crownHalf: number;
  readonly crownY: number;
  readonly topY: number;
};

const canopySections: readonly CanopySection[] = [
  { z: 2.08, baseHalf: 0.34, baseY: 1.05, glassHalf: 0.2, glassY: 1.17, crownHalf: 0.09, crownY: 1.28, topY: 1.32 },
  { z: 1.62, baseHalf: 0.44, baseY: 1.1, glassHalf: 0.34, glassY: 1.38, crownHalf: 0.18, crownY: 1.53, topY: 1.58 },
  { z: 1.0, baseHalf: 0.48, baseY: 1.14, glassHalf: 0.39, glassY: 1.5, crownHalf: 0.21, crownY: 1.66, topY: 1.72 },
  { z: 0.44, baseHalf: 0.46, baseY: 1.18, glassHalf: 0.37, glassY: 1.49, crownHalf: 0.2, crownY: 1.62, topY: 1.68 },
  { z: -0.08, baseHalf: 0.34, baseY: 1.27, glassHalf: 0.25, glassY: 1.45, crownHalf: 0.13, crownY: 1.56, topY: 1.61 },
];

const canopyRing = (section: CanopySection): ObjectPoint[] => [
  point(0, section.baseY, section.z),
  point(section.baseHalf, section.baseY, section.z),
  point(section.glassHalf, section.glassY, section.z),
  point(section.crownHalf, section.crownY, section.z),
  point(0, section.topY, section.z),
  point(-section.crownHalf, section.crownY, section.z),
  point(-section.glassHalf, section.glassY, section.z),
  point(-section.baseHalf, section.baseY, section.z),
];

addFacets("canopy-glazing", "canopy", "glazing", buildLoft(
  canopySections.map(canopyRing),
  { tag: "canopy", capStart: true },
), { showEdges: false, doubleSided: true });

{
  const crownRail: Facet[] = [];
  for (let index = 0; index < canopySections.length - 1; index += 1) {
    const from = canopySections[index];
    const to = canopySections[index + 1];
    crownRail.push(...buildTorqueBox({
      from: point(0, from.topY + 0.012, from.z),
      to: point(0, to.topY + 0.012, to.z),
      width: 0.065,
      height: 0.075,
      chamfer: 0.018,
      tag: "canopy-crown-rail",
    }));
  }
  addFacets("canopy-crown-rail", "survival-frame", "metal", crownRail, { showEdges: false });
}

for (const side of [-1, 1]) {
  const sillFacets: Facet[] = [];
  for (let index = 0; index < canopySections.length - 1; index += 1) {
    const from = canopySections[index];
    const to = canopySections[index + 1];
    sillFacets.push(...buildTorqueBox({
      from: point(side * from.baseHalf, from.baseY, from.z),
      to: point(side * to.baseHalf, to.baseY, to.z),
      width: 0.065,
      height: 0.07,
      chamfer: 0.016,
      tag: "canopy-coaming",
    }));
  }
  addFacets(`canopy-coaming-${side}`, "outer-shell", "metal", sillFacets, { showEdges: false });
  addFacets(`canopy-mid-pillar-${side}`, "outer-shell", "metal", buildTorqueBox({
    from: point(side * 0.47, 1.135, 1.28),
    to: point(side * 0.21, 1.66, 1.28),
    width: 0.07,
    height: 0.075,
    chamfer: 0.018,
    tag: "canopy-mid-pillar",
  }), { showEdges: false });
  addFacets(`canopy-aft-pillar-${side}`, "outer-shell", "metal", buildTorqueBox({
    from: point(side * 0.37, 1.26, 0.02),
    to: point(side * 0.14, 1.58, 0.02),
    width: 0.075,
    height: 0.08,
    chamfer: 0.018,
    tag: "canopy-aft-pillar",
  }), { showEdges: false });
}

addFacets("canopy-aft-brow", "outer-shell", "roof-dark", buildTorqueBox({
  from: point(-0.33, 1.58, -0.055),
  to: point(0.33, 1.58, -0.055),
  width: 0.12,
  height: 0.11,
  chamfer: 0.026,
  tag: "canopy-aft-brow",
}), { showEdges: false });

const noseArmourSections = [
  { z: 3.12, half: 0.09, baseY: 0.79, edgeY: 0.84, topY: 0.9 },
  { z: 2.66, half: 0.27, baseY: 0.73, edgeY: 0.91, topY: 1.02 },
  { z: 2.12, half: 0.43, baseY: 0.75, edgeY: 1.02, topY: 1.13 },
] as const;
addFacets("nose-dorsal-armour", "outer-shell", "paint-light", buildLoft(
  noseArmourSections.map((section) => [
    point(0, section.baseY, section.z),
    point(section.half, section.edgeY, section.z),
    point(0, section.topY, section.z),
    point(-section.half, section.edgeY, section.z),
  ]),
  { tag: "nose-armour", capStart: true, capEnd: true },
), { showEdges: false });
addBox("nose-service-hatch", "service-detail", "roof-dark", point(0, 1.04, 2.42), point(0.24, 0.025, 0.32), point(-0.12, 0, 0));

const cheekSections = [
  { z: 2.44, inner: 0.12, outer: 0.27, lowY: 0.77, highY: 0.95 },
  { z: 1.94, inner: 0.28, outer: 0.55, lowY: 0.7, highY: 1.08 },
  { z: 1.24, inner: 0.38, outer: 0.68, lowY: 0.68, highY: 1.16 },
  { z: 0.52, inner: 0.39, outer: 0.71, lowY: 0.72, highY: 1.25 },
  { z: -0.08, inner: 0.31, outer: 0.61, lowY: 0.85, highY: 1.36 },
] as const;
for (const side of [-1, 1]) {
  const sectionRing = (section: typeof cheekSections[number]): ObjectPoint[] => side > 0
    ? [
      point(side * section.inner, section.lowY, section.z),
      point(side * section.outer, section.lowY, section.z),
      point(side * section.outer, section.highY, section.z),
      point(side * section.inner, section.highY, section.z),
    ]
    : [
      point(side * section.outer, section.lowY, section.z),
      point(side * section.inner, section.lowY, section.z),
      point(side * section.inner, section.highY, section.z),
      point(side * section.outer, section.highY, section.z),
    ];
  addFacets(`canopy-cheek-armour-${side}`, "outer-shell", "paint-light", buildLoft(
    cheekSections.map(sectionRing),
    { tag: "canopy-cheek", capStart: true, capEnd: true },
  ), { showEdges: false });
  for (let panel = 0; panel < 3; panel += 1) {
    const z = lerp(1.7, 0.45, panel / 2);
    addBox(`canopy-cheek-index-${side}-${panel}`, "service-detail", "paint-accent", point(side * 0.69, 0.91 + panel * 0.08, z), point(0.025, 0.035, 0.14));
  }
}

for (const side of [-1, 1]) {
  const shoulderOutline = [
    plan(side * 0.55, -0.1),
    plan(side * 1.36, 0.08),
    plan(side * 1.46, 0.74),
    plan(side * 1.31, 1.76),
    plan(side * 0.52, 2.06),
  ];
  const shoulderDeckY = (_x: number, z: number) => 1.17 + (2.06 - z) * 0.045;
  addFacets(`forward-shoulder-deck-${side}`, "shoulder-armour", "paint-light", buildSlab({
    outline: shoulderOutline,
    topAt: shoulderDeckY,
    bottomAt: (x, z) => shoulderDeckY(x, z) - 0.13,
    chamfer: 0.045,
  }), { showEdges: false });
  addBox(`forward-shoulder-inset-${side}`, "service-detail", "dark-recess", point(side * 1.08, 1.245, 0.78), point(0.38, 0.028, 0.58), point(0, side * 0.06, 0));
  addBox(`forward-shoulder-access-${side}`, "service-detail", "roof-dark", point(side * 1.03, 1.22, 1.48), point(0.4, 0.03, 0.46), point(0, side * 0.05, 0));
  addBox(`forward-shoulder-access-index-${side}`, "service-detail", "paint-accent", point(side * 1.23, 1.255, 1.48), point(0.035, 0.025, 0.17), point(0, side * 0.05, 0));
}

// Canted armour roots follow the actual yaw-carrier vectors. They leave the
// circular bore exposed and avoid the horizontal shelf used by C1.
for (const side of [-1, 1]) {
  const station = COMBAT_HEX_YAW_STATIONS[side < 0 ? 0 : 1];
  const center = point(station.x, station.y, station.z);
  const world = (localX: number, localY: number, axial: number) => cantedLocalToWorld(
    center,
    station.cant,
    point(localX, localY, axial),
  );
  const upperRoot = point(side * 0.48, 1.69, -0.16);
  const upperRing = world(-side * 0.08, 0.38, -0.08);
  const lowerRoot = point(side * 0.55, 0.98, -0.18);
  const lowerRing = world(-side * 0.1, -0.38, -0.04);
  addFacets(`yaw-shoulder-armour-upper-${side}`, "shoulder-armour", "paint-light", buildSlab({
    outline: taperedRootOutline(upperRoot, upperRing, 0.25, 0.16),
    topAt: () => 1.79,
    bottomAt: () => 1.64,
    chamfer: 0.048,
  }), { showEdges: false });
  addFacets(`yaw-shoulder-armour-lower-${side}`, "shoulder-armour", "timber-dark", buildSlab({
    outline: taperedRootOutline(lowerRoot, lowerRing, 0.22, 0.14),
    topAt: () => 1.09,
    bottomAt: () => 0.94,
    chamfer: 0.044,
  }), { showEdges: false });
  addFacets(`yaw-shoulder-armour-aft-${side}`, "shoulder-armour", "roof-dark", buildTorqueBox({
    from: point(side * 0.47, 1.5, -1.28),
    to: world(side * 0.36, 0.06, -0.14),
    width: 0.2,
    height: 0.24,
    chamfer: 0.05,
    tag: "yaw-aft-armour",
  }), { showEdges: false });
  addFacets(`yaw-angular-shroud-${side}`, "shoulder-armour", "paint-light", [
    ...buildTorqueBox({
      from: world(-0.27, 0.385, YAW_FRONT_AXIAL + 0.005),
      to: world(0.27, 0.385, YAW_FRONT_AXIAL + 0.005),
      width: 0.09,
      height: 0.1,
      chamfer: 0.024,
      tag: "yaw-shroud-top",
    }),
    ...buildTorqueBox({
      from: world(side * 0.385, 0.27, YAW_FRONT_AXIAL + 0.005),
      to: world(side * 0.385, -0.27, YAW_FRONT_AXIAL + 0.005),
      width: 0.09,
      height: 0.1,
      chamfer: 0.024,
      tag: "yaw-shroud-outboard",
    }),
    ...buildTorqueBox({
      from: world(-0.25, -0.385, YAW_FRONT_AXIAL + 0.005),
      to: world(0.25, -0.385, YAW_FRONT_AXIAL + 0.005),
      width: 0.085,
      height: 0.095,
      chamfer: 0.022,
      tag: "yaw-shroud-lower",
    }),
  ], { showEdges: false });
  addBox(`yaw-shoulder-access-${side}`, "service-detail", "dark-recess", point(side * 0.72, 1.74, -0.48), point(0.22, 0.025, 0.3), point(-0.08, side * 0.1, 0));
  for (let fastener = 0; fastener < 4; fastener += 1) {
    const angle = Math.PI / 4 + fastener * Math.PI / 2;
    const localX = Math.cos(angle) * (YAW_OUTER_RADIUS + 0.012);
    const localY = Math.sin(angle) * (YAW_OUTER_RADIUS + 0.012);
    addCylinder(
      `yaw-shoulder-fastener-${side}-${fastener}`,
      "service-detail",
      "metal",
      world(localX, localY, YAW_FRONT_AXIAL - 0.055),
      world(localX, localY, YAW_FRONT_AXIAL + 0.03),
      0.018,
      10,
    );
  }
}

// Narrow dorsal spine: the body rises continuously, but removable armour and
// cooling hardware articulate the systems volume rather than faking the rise.
for (let panel = 0; panel < 6; panel += 1) {
  const fromZ = lerp(-0.34, -3.02, panel / 6);
  const toZ = lerp(-0.34, -3.02, (panel + 1) / 6);
  const fromY = lerp(1.71, 1.91, panel / 6);
  const toY = lerp(1.71, 1.91, (panel + 1) / 6);
  const halfWidth = lerp(0.34, 0.13, panel / 5);
  addFacets(`dorsal-spine-panel-${panel}`, "outer-shell", panel % 2 === 0 ? "roof-dark" : "timber-dark", buildTorqueBox({
    from: point(0, fromY, fromZ),
    to: point(0, toY, toZ),
    width: halfWidth * 2,
    height: 0.16,
    chamfer: 0.045,
    tag: "dorsal-spine",
  }), { showEdges: false });
}

const tailSideSections = [
  { z: -0.34, x: 0.67, lowY: 0.82, highY: 1.34 },
  { z: -1.12, x: 0.56, lowY: 1.06, highY: 1.56 },
  { z: -2.08, x: 0.43, lowY: 1.36, highY: 1.76 },
  { z: -3.16, x: 0.25, lowY: 1.6, highY: 1.91 },
] as const;
for (const side of [-1, 1]) {
  for (let panel = 0; panel < tailSideSections.length - 1; panel += 1) {
    const sections = tailSideSections.slice(panel, panel + 2).map((section) => {
      const centreX = side * section.x;
      const innerX = centreX - side * 0.018;
      const outerX = centreX + side * 0.018;
      return side > 0
        ? [
          point(innerX, section.lowY, section.z),
          point(outerX, section.lowY, section.z),
          point(outerX, section.highY, section.z),
          point(innerX, section.highY, section.z),
        ]
        : [
          point(outerX, section.lowY, section.z),
          point(innerX, section.lowY, section.z),
          point(innerX, section.highY, section.z),
          point(outerX, section.highY, section.z),
        ];
    });
    addFacets(`tail-side-armour-${side}-${panel}`, "outer-shell", panel === 1 ? "paint-light" : "timber-mid", buildLoft(
      sections,
      { tag: "tail-side-armour", capStart: true, capEnd: true },
    ), { showEdges: false });
  }
  addBox(`tail-side-vent-${side}`, "service-detail", "dark-recess", point(side * 0.5, 1.39, -1.53), point(0.025, 0.19, 0.38), point(0.06, 0, 0));
  for (let fastener = 0; fastener < 3; fastener += 1) {
    addCylinder(`tail-side-fastener-${side}-${fastener}`, "service-detail", "metal", point(side * 0.59, 1.38, -0.72 - fastener * 0.33), point(side * 0.615, 1.38, -0.72 - fastener * 0.33), 0.012, 8);
  }
}

for (let vent = 0; vent < 6; vent += 1) {
  const z = lerp(-0.78, -1.62, vent / 5);
  const y = lerp(1.79, 1.84, vent / 5);
  addBox(`dorsal-cooling-louvre-${vent}`, "outer-shell", "metal", point(0, y, z), point(0.34, 0.022, 0.055), point(-0.16, 0, 0));
}

// Interior remains complete in the canonical object and is exposed only by
// fixed cutaway cameras.
addBox("seat-pan", "interior", "timber-dark", point(0, 0.91, 0.52), point(0.52, 0.12, 0.58), point(-0.12, 0, 0));
addBox("seat-back", "interior", "timber-dark", point(0, 1.25, 0.14), point(0.54, 0.68, 0.12), point(-0.24, 0, 0));
addBox("instrument-binnacle", "interior", "dark-recess", point(0, 1.23, 1.34), point(0.52, 0.22, 0.24), point(-0.15, 0, 0));
addCylinder("control-stick", "interior", "metal", point(0.16, 0.95, 0.92), point(0.2, 1.2, 1.0), 0.022, 12);
addBox("left-battery-module", "interior", "roof-dark", point(-0.25, 0.56, 0.02), point(0.3, 0.25, 1.72));
addBox("right-battery-module", "interior", "roof-dark", point(0.25, 0.56, 0.02), point(0.3, 0.25, 1.72));

// ---------------------------------------------------------------------------
// Four complete landing-gear chains.
// ---------------------------------------------------------------------------

const landingStations = [
  { id: "left-front", side: -1, attach: point(-1.42, 0.78, 1.34), dragZ: 1.03 },
  { id: "right-front", side: 1, attach: point(1.42, 0.78, 1.34), dragZ: 1.03 },
  { id: "left-rear", side: -1, attach: point(-1.55, 0.91, -1.42), dragZ: -1.08 },
  { id: "right-rear", side: 1, attach: point(1.55, 0.91, -1.42), dragZ: -1.08 },
] as const;

for (const gear of landingStations) {
  const knee = point(gear.attach[0] + gear.side * 0.12, 0.38, gear.attach[2] + (gear.attach[2] > 0 ? 0.08 : -0.08));
  const axle = point(knee[0] + gear.side * 0.035, 0.17, knee[2] + (gear.attach[2] > 0 ? 0.06 : -0.06));
  const pad = point(axle[0], 0.055, axle[2]);

  addFacets(`landing-trunnion-${gear.id}`, "landing-gear", "metal", buildTorqueBox({
    from: point(gear.attach[0], gear.attach[1], gear.attach[2] - 0.14),
    to: point(gear.attach[0], gear.attach[1], gear.attach[2] + 0.14),
    width: 0.15,
    height: 0.16,
    chamfer: 0.034,
    tag: "landing-trunnion",
  }));
  addFacets(`landing-main-strut-${gear.id}`, "landing-gear", "timber-dark", [
    ...buildTorqueBox({ from: gear.attach, to: point(lerp(gear.attach[0], knee[0], 0.5), lerp(gear.attach[1], knee[1], 0.5), lerp(gear.attach[2], knee[2], 0.5)), width: 0.12, height: 0.16, chamfer: 0.035, tag: "main-strut-upper" }),
    ...buildTorqueBox({ from: point(lerp(gear.attach[0], knee[0], 0.5), lerp(gear.attach[1], knee[1], 0.5), lerp(gear.attach[2], knee[2], 0.5)), to: knee, width: 0.09, height: 0.13, chamfer: 0.028, tag: "main-strut-lower" }),
  ]);
  addFacets(`landing-drag-link-${gear.id}`, "landing-gear", "timber-mid", buildTorqueBox({
    from: point(gear.attach[0] - gear.side * 0.05, gear.attach[1] - 0.02, gear.dragZ),
    to: point(knee[0] - gear.side * 0.015, knee[1] + 0.04, knee[2]),
    width: 0.055,
    height: 0.075,
    chamfer: 0.016,
    tag: "drag-link",
  }));
  addEllipsoid(`landing-knee-${gear.id}`, "landing-gear", "metal", knee, point(0.065, 0.06, 0.065), 14, 7);
  addCylinder(`landing-oleo-${gear.id}`, "landing-gear", "metal", knee, axle, 0.046, 18);
  addCylinder(`landing-oleo-gland-${gear.id}`, "landing-gear", "paint-accent", point(axle[0], axle[1] + 0.07, axle[2]), point(axle[0], axle[1] + 0.035, axle[2]), 0.056, 18);
  addFacets(`landing-scissor-${gear.id}`, "landing-gear", "metal", [
    ...buildTorqueBox({ from: point(knee[0] - gear.side * 0.06, knee[1] - 0.02, knee[2]), to: point(knee[0] - gear.side * 0.08, 0.27, axle[2]), width: 0.028, height: 0.045, chamfer: 0.008, tag: "scissor" }),
    ...buildTorqueBox({ from: point(knee[0] - gear.side * 0.08, 0.27, axle[2]), to: point(axle[0] - gear.side * 0.05, axle[1] + 0.02, axle[2]), width: 0.026, height: 0.042, chamfer: 0.008, tag: "scissor" }),
  ]);
  addCylinder(`landing-pad-pivot-${gear.id}`, "landing-gear", "metal", point(pad[0] - 0.09, 0.12, pad[2]), point(pad[0] + 0.09, 0.12, pad[2]), 0.032, 14);
  addFacets(`landing-pad-${gear.id}`, "landing-gear", "timber-dark", buildSlab({
    outline: rectangleRing(pad[0] - 0.16, pad[0] + 0.16, pad[2] - 0.13, pad[2] + 0.13),
    topAt: () => 0.1,
    bottomAt: () => 0.025,
    chamfer: 0.028,
  }), { showEdges: false });
  addBox(`landing-pad-sole-${gear.id}`, "landing-gear", "dark-recess", point(pad[0], 0.009, pad[2]), point(0.28, 0.018, 0.22));
}

// ---------------------------------------------------------------------------
// Weapons and sensors. Every store has a hardpoint path into the primary frame.
// ---------------------------------------------------------------------------

addFacets("chin-cannon-keel-hardpoint", "weapons", "metal", buildTorqueBox({
  from: point(0, 0.48, 2.25),
  to: point(0, 0.43, 2.86),
  width: 0.24,
  height: 0.22,
  chamfer: 0.055,
  tag: "cannon-hardpoint",
}));
addCylinder("chin-cannon-traverse", "weapons", "metal", point(-0.19, 0.42, 2.77), point(0.19, 0.42, 2.77), 0.09, 18);
addFacets("chin-cannon-cradle", "weapons", "roof-dark", buildTorqueBox({
  from: point(0, 0.42, 2.7),
  to: point(0, 0.38, 3.06),
  width: 0.2,
  height: 0.18,
  chamfer: 0.045,
  tag: "cannon-cradle",
}));
for (const [index, offset] of [[0, point(0, 0, 0)], [1, point(-0.043, 0.042, 0)], [2, point(0.043, 0.042, 0)]] as const) {
  addCylinder(`chin-cannon-barrel-${index}`, "weapons", "metal", point(offset[0], 0.34 + offset[1], 2.98), point(offset[0], 0.32 + offset[1], 3.56), 0.022, 14);
  addCylinder(`chin-cannon-muzzle-${index}`, "weapons", "dark-recess", point(offset[0], 0.32 + offset[1], 3.51), point(offset[0], 0.315 + offset[1], 3.6), 0.029, 14);
}

const launcherTubeFacets = (x: number, y: number, frontZ: number, rearZ: number) => buildAxialRevolution([
  { radius: 0.046, z: frontZ + 0.015 },
  { radius: 0.075, z: frontZ + 0.015 },
  { radius: 0.078, z: frontZ - 0.025 },
  { radius: 0.078, z: rearZ + 0.025 },
  { radius: 0.071, z: rearZ },
  { radius: 0.046, z: rearZ },
  { radius: 0.046, z: frontZ + 0.015 },
], [x, y], 20, "launcher-tube");

for (const side of [-1, 1]) {
  const podX = side * 1.18;
  addFacets(`launcher-hardpoint-${side}`, "weapons", "metal", buildTorqueBox({
    from: point(side * 0.61, 0.68, 1.28),
    to: point(side * 1.12, 0.66, 1.18),
    width: 0.13,
    height: 0.16,
    chamfer: 0.032,
    tag: "launcher-hardpoint",
  }));
  addBox(`launcher-pod-body-${side}`, "weapons", "roof-dark", point(podX, 0.65, 1.28), point(0.46, 0.38, 0.62));
  addBox(`launcher-pod-top-armour-${side}`, "weapons", "paint-light", point(podX, 0.86, 1.28), point(0.5, 0.07, 0.66), point(-0.08, 0, 0));
  let tubeIndex = 0;
  for (const xOffset of [-0.11, 0, 0.11]) {
    for (const yOffset of [-0.09, 0.09]) {
      addFacets(`launcher-tube-${side}-${tubeIndex}`, "weapons", "metal", launcherTubeFacets(podX + xOffset, 0.65 + yOffset, 1.605, 1.32), { showEdges: false });
      addCylinder(`launcher-tube-dark-${side}-${tubeIndex}`, "weapons", "dark-recess", point(podX + xOffset, 0.65 + yOffset, 1.6), point(podX + xOffset, 0.65 + yOffset, 1.57), 0.044, 18);
      tubeIndex += 1;
    }
  }
}

addCylinder("sensor-gimbal-yoke", "sensors", "metal", point(-0.17, 0.45, 2.65), point(0.17, 0.45, 2.65), 0.045, 16);
addEllipsoid("sensor-ball", "sensors", "roof-dark", point(0, 0.35, 2.68), point(0.18, 0.17, 0.18), 24, 12);
addEllipsoid("sensor-window", "sensors", "glazing", point(0, 0.36, 2.79), point(0.09, 0.085, 0.035), 18, 9);
addBox("dorsal-sensor-base", "sensors", "metal", point(0, 1.84, -0.38), point(0.28, 0.08, 0.34));
addEllipsoid("dorsal-sensor-blister", "sensors", "glazing", point(0, 1.895, -0.36), point(0.12, 0.08, 0.14), 18, 8);

// Service panels, latches and functional colour accents. These articulate the
// real removable volumes but never substitute for silhouette geometry.
for (const side of [-1, 1]) {
  for (let panel = 0; panel < 4; panel += 1) {
    const z = lerp(1.65, -1.55, panel / 3);
    const y = panel < 2 ? 0.77 : 0.93;
    addBox(`side-service-panel-${side}-${panel}`, "service-detail", "dark-recess", point(side * 0.745, y, z), point(0.025, 0.22, 0.42));
    for (const fastener of [-1, 1]) {
      addCylinder(`side-service-fastener-${side}-${panel}-${fastener}`, "service-detail", "metal", point(side * 0.765, y + fastener * 0.075, z), point(side * 0.79, y + fastener * 0.075, z), 0.012, 8);
    }
  }
  addBox(`warning-stripe-${side}`, "service-detail", "paint-accent", point(side * 0.77, 0.92, 1.02), point(0.028, 0.045, 0.38));
}

// Аэронавигационные цвета — по БОРТАМ, а не по знаку оси. Нос машины смотрит
// в +z; наблюдатель за кормой глядит вдоль носа, и его правая рука — МИНУС x
// (правая тройка: смотрим вдоль +z — x уходит влево). Прежде зелёный стоял на
// +x, то есть на ЛЕВОМ борту — огни были перепутаны местами.
//
// МЕСТО ФОНАРЯ — СЕРЕДИНА ПЛАСТИНЫ, ЗАПОДЛИЦО ПО ЕЁ ПЛОСКОСТИ. Стена кольца —
// двенадцать плоских сегментов со стыковыми планками каждые 30°, и чистый борт
// (угол 0) — это ровно СТЫК, да ещё с сервисной панелью рядом: фонарь,
// посаженный туда, лез и на планку, и на панель. Середина пластины — 15° к
// носу; фонарь повёрнут по её хорде и касается её внешней грани.
{
  const middleRight = COMBAT_HEX_LIFT_STATIONS[3];
  const lampAngle = Math.PI / 12;
  const wall = 0.065 / 2;
  const chord = middleRight.outerRadius * Math.cos(lampAngle) + wall / 2;
  const lampRadial = chord + 0.0175 + 0.0015;
  const lampX = middleRight.x + lampRadial * Math.cos(lampAngle);
  const lampZ = middleRight.z + lampRadial * Math.sin(lampAngle);
  const lampY = 1.12;
  parts.push({
    kind: "box",
    id: "nav-starboard-lens",
    group: "lighting",
    material: "foliage",
    center: point(-lampX, lampY, lampZ),
    size: point(0.035, 0.11, 0.2),
    rotation: point(0, lampAngle, 0),
    light: { color: "#6bff9c", distance: 18, intensity: 3.4, dayIntensityFactor: 1 },
  });
  parts.push({
    kind: "box",
    id: "nav-port-lens",
    group: "lighting",
    material: "flower-red",
    center: point(lampX, lampY, lampZ),
    size: point(0.035, 0.11, 0.2),
    rotation: point(0, -lampAngle, 0),
    light: { color: "#ff665f", distance: 18, intensity: 3.4, dayIntensityFactor: 1 },
  });
}
parts.push({
  kind: "box",
  id: "nav-aft-lens",
  group: "lighting",
  material: "paint-light",
  center: point(0, 1.7, -3.27),
  size: point(0.16, 0.07, 0.035),
  light: { color: "#fff0cf", distance: 20, intensity: 3.6, dayIntensityFactor: 1 },
});
addEllipsoid("anti-collision-mount", "lighting", "roof-dark", point(0, 1.88, -1.18), point(0.09, 0.035, 0.09), 14, 6);
parts.push({
  kind: "mesh",
  id: "anti-collision-lens",
  group: "lighting",
  material: "flower-red",
  ...(() => {
    const temporaryParts = parts.length;
    addEllipsoid("anti-collision-lens-shape", "lighting", "flower-red", point(0, 1.925, -1.18), point(0.065, 0.048, 0.065), 14, 6);
    const shape = parts.pop();
    if (!shape || shape.kind !== "mesh" || parts.length !== temporaryParts) throw new Error("anti-collision lens build failed");
    return { vertices: shape.vertices, triangles: shape.triangles, showEdges: false };
  })(),
  light: { color: "#ff5148", distance: 22, intensity: 4.1, dayIntensityFactor: 1 },
});

// ---------------------------------------------------------------------------
// Recovered envelope and canonical model.
// ---------------------------------------------------------------------------

const rotateBoxCorner = (corner: ObjectPoint, rotation: ObjectPoint): ObjectPoint => {
  const [rx, ry, rz] = rotation;
  let [x, y, z] = corner;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return point(x, y, z);
};

export function combatHexacopterPartBounds(part: ObjectLabPart): { readonly min: ObjectPoint; readonly max: ObjectPoint } {
  if (part.kind === "mesh") {
    return {
      min: point(...([0, 1, 2].map((axis) => Math.min(...part.vertices.map((vertex) => vertex[axis]))) as [number, number, number])),
      max: point(...([0, 1, 2].map((axis) => Math.max(...part.vertices.map((vertex) => vertex[axis]))) as [number, number, number])),
    };
  }
  if (part.kind === "box") {
    const corners: ObjectPoint[] = [];
    for (const x of [-part.size[0] / 2, part.size[0] / 2]) {
      for (const y of [-part.size[1] / 2, part.size[1] / 2]) {
        for (const z of [-part.size[2] / 2, part.size[2] / 2]) {
          const rotated = part.rotation ? rotateBoxCorner(point(x, y, z), part.rotation) : point(x, y, z);
          corners.push(point(rotated[0] + part.center[0], rotated[1] + part.center[1], rotated[2] + part.center[2]));
        }
      }
    }
    return {
      min: point(...([0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))) as [number, number, number])),
      max: point(...([0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))) as [number, number, number])),
    };
  }
  const dx = part.to[0] - part.from[0];
  const dy = part.to[1] - part.from[1];
  const dz = part.to[2] - part.from[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const axis = [dx / length, dy / length, dz / length];
  if (part.kind === "cylinder") {
    const radial = axis.map((component) => part.radius * Math.sqrt(Math.max(0, 1 - component * component)));
    return {
      min: point(...([0, 1, 2].map((index) => Math.min(part.from[index], part.to[index]) - radial[index]) as [number, number, number])),
      max: point(...([0, 1, 2].map((index) => Math.max(part.from[index], part.to[index]) + radial[index]) as [number, number, number])),
    };
  }
  const reach = Math.hypot(part.width, part.depth) / 2;
  return {
    min: point(...([0, 1, 2].map((index) => Math.min(part.from[index], part.to[index]) - reach) as [number, number, number])),
    max: point(...([0, 1, 2].map((index) => Math.max(part.from[index], part.to[index]) + reach) as [number, number, number])),
  };
}

const envelope = parts.reduce(
  (bounds, part) => {
    const partBounds = combatHexacopterPartBounds(part);
    return {
      min: point(...([0, 1, 2].map((axis) => Math.min(bounds.min[axis], partBounds.min[axis])) as [number, number, number])),
      max: point(...([0, 1, 2].map((axis) => Math.max(bounds.max[axis], partBounds.max[axis])) as [number, number, number])),
    };
  },
  { min: point(Infinity, Infinity, Infinity), max: point(-Infinity, -Infinity, -Infinity) },
);

const round = (value: number) => Math.round(value * 1000) / 1000;

export const COMBAT_HEX_LENGTH = round(envelope.max[2] - envelope.min[2]);
export const COMBAT_HEX_WIDTH = round(envelope.max[0] - envelope.min[0]);
export const COMBAT_HEX_HEIGHT = round(envelope.max[1] - envelope.min[1]);
export const COMBAT_HEX_PART_BUDGET = 900;

export const combatHexacopterObject: CombatHexacopterModel = {
  id: "combat-hexacopter-c2",
  revision: "combat-hex-c2-2026-08-04",
  title: "RAX-8 Tonkawa — six lift ducts, paired yaw tunnels",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "The approved generated image owns visual character only; all dimensions, hidden structure and joints are authored and testable.",
    "One-seat scale is bracketed by Jetson ONE; rotor spacing and vertical staggering respond to NASA multirotor interference work.",
    "Two mirrored outward-canted reversible ducted fans create a differential yaw couple without stealing lift authority from the six main units.",
    "The load path is nacelle ring -> paired local saddles/root spars -> survival-cell shoulder and keel; there is no external perimeter rail.",
    "Crash load passes through pad, oleo, strut, trunnion, lower longeron, energy-absorbing keel and seat cell.",
  ],
  dimensions: {
    overallLength: COMBAT_HEX_LENGTH,
    overallWidth: COMBAT_HEX_WIDTH,
    overallHeight: COMBAT_HEX_HEIGHT,
    standardLiftTipDiameter: round(liftTip(COMBAT_HEX_LIFT_STATIONS[0]) * 2),
    boostLiftTipDiameter: round(liftTip(COMBAT_HEX_LIFT_STATIONS[4]) * 2),
    yawTipDiameter: YAW_TIP_RADIUS * 2,
    yawTunnelLength: YAW_FRONT_AXIAL - YAW_REAR_AXIAL,
    yawAxisCantDegrees: round(COMBAT_HEX_YAW_STATIONS[1].cant * 180 / Math.PI),
    rearRotorStepUp: COMBAT_HEX_LIFT_STATIONS[4].planeY - COMBAT_HEX_LIFT_STATIONS[0].planeY,
    rotorCount: 6,
    yawFanCount: 2,
  },
  labMetrics: [
    { label: "LENGTH", value: COMBAT_HEX_LENGTH, decimals: 2, signed: false },
    { label: "WIDTH", value: COMBAT_HEX_WIDTH, decimals: 2, signed: false },
    { label: "HEIGHT", value: COMBAT_HEX_HEIGHT, decimals: 2, signed: false },
    { label: "LIFT ROTORS", value: 6, decimals: 0, signed: false, unit: "" },
    { label: "YAW FANS", value: 2, decimals: 0, signed: false, unit: "" },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    centreOfMassEstimate: point(0, 0.96, 0.08),
    pilotEye: point(0, 1.58, 0.82),
    batteryCentre: point(0, 0.56, 0.02),
    cannonHardpoint: point(0, 0.48, 2.25),
    leftYawAxis: point(-1.02, 1.36, -0.48),
    rightYawAxis: point(1.02, 1.36, -0.48),
  },
  motionConstraints: {
    mainLiftRotorCount: 6,
    yawFanCount: 2,
    liftAxesFixedToBody: true,
    yawAxesCantedOutward: true,
    yawFansReversible: true,
    translationByBodyTilt: true,
    weaponsStaticForObjectStudy: true,
    landingGearFixedForObjectStudy: true,
    worldPlacementAllowed: false,
  },
  labEnvironment: { floorRadius: 9, gridSize: 9, gridDivisions: 18, fogNear: 18, fogFar: 27, floorY: 0 },
  materialOverrides: {
    "roof-dark": { color: 0x171b1d, roughness: 0.48, metalness: 0.2 },
    "timber-dark": { color: 0x262b2c, roughness: 0.64, metalness: 0.1 },
    "timber-mid": { color: 0x41453f, roughness: 0.5, metalness: 0.34 },
    metal: { color: 0x6f6a60, roughness: 0.3, metalness: 0.84 },
    "paint-light": { color: 0x30352f, roughness: 0.58, metalness: 0.12 },
    "paint-accent": { color: 0xd18436, roughness: 0.42, metalness: 0.12 },
    canvas: { color: 0x101416, roughness: 0.4, metalness: 0.2, transparent: false, opacity: 1 },
    glazing: { color: 0x0b151b, roughness: 0.1, metalness: 0.09, transparent: true, opacity: 0.86 },
    "dark-recess": { color: 0x07090a, roughness: 0.96, metalness: 0 },
    foliage: { color: 0x65ef95, roughness: 0.24, metalness: 0.03 },
    "flower-red": { color: 0xff635b, roughness: 0.24, metalness: 0.03 },
  },
  parts,
  views: [
    { id: "front", label: "Front orthographic — eight propulsors", projection: "orthographic", position: point(0, 1.2, 13), target: point(0, 1.02, 0), orthoHeight: 7.4 },
    { id: "left", label: "Left profile — rising spine", projection: "orthographic", position: point(-14, 1.25, 0), target: point(0, 1.02, 0), orthoHeight: 7.1 },
    { id: "right", label: "Right profile — weapon and gear chains", projection: "orthographic", position: point(14, 1.25, 0), target: point(0, 1.02, 0), orthoHeight: 7.1 },
    { id: "rear", label: "Rear orthographic — boost pair", projection: "orthographic", position: point(0, 1.3, -13), target: point(0, 1.05, 0), orthoHeight: 7.4 },
    { id: "top", label: "Top plan — 6+2 topology", projection: "orthographic", position: point(0, 15, 0), target: point(0, 0.95, 0), up: point(0, 0, 1), orthoHeight: 7.8 },
    { id: "front-three-quarter", label: "Front three-quarter — character study", projection: "perspective", position: point(-8.2, 5.2, 9.1), target: point(0, 0.98, 0), fov: 33 },
    { id: "rear-three-quarter", label: "Rear three-quarter — spine and boost ducts", projection: "perspective", position: point(8.5, 4.5, -8.8), target: point(0, 1.02, -0.2), fov: 34 },
    { id: "high-three-quarter", label: "High three-quarter — frame plan", projection: "perspective", position: point(-8.6, 9.5, 8.2), target: point(0, 0.95, -0.05), fov: 34 },
    { id: "underside", label: "Low three-quarter — keel and landing chains", projection: "perspective", position: point(7.5, 2.2, 8.4), target: point(0, 0.66, 0.1), fov: 36 },
    { id: "yaw-detail", label: "Yaw tunnel detail — mirrored diagonal axes", projection: "perspective", position: point(-4.2, 2.9, 3.5), target: point(-1.02, 1.36, -0.48), fov: 25, hiddenGroups: ["outer-shell", "canopy", "shoulder-armour", "service-detail", "sensors", "lighting"] },
    { id: "structural-exterior", label: "Structural camera — full exterior", projection: "perspective", position: point(-6.4, 4.15, 6.7), target: point(0, 0.96, 0), fov: 31 },
    { id: "structural-cutaway", label: "Structural camera — canonical cutaway", projection: "perspective", position: point(-6.4, 4.15, 6.7), target: point(0, 0.96, 0), fov: 31, hiddenGroups: ["outer-shell", "canopy", "shoulder-armour", "service-detail", "sensors", "lighting"] },
    { id: "silhouette", label: "Silhouette control", projection: "orthographic", position: point(0, 15, 0), target: point(0, 0.95, 0), up: point(0, 0, 1), orthoHeight: 7.8 },
  ],
};
