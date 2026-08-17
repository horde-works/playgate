/**
 * DC-3 — ЭТАП 1 ПАНЕЛИЗАЦИИ: ОБШИВКА КРЫЛА И ОПЕРЕНИЯ ЧЕСТНЫМИ ПАНЕЛЯМИ.
 *
 * Инженерный образец. Машину он не трогает: это отдельный объект, который
 * показывает, чем предлагается заменить пять лофтовых шкур B01 — два крыла,
 * стабилизатор, киль и рулевые поверхности.
 *
 * Форму НЕ изобретает. Каждая панель снимается с `dc3AirframeSurface`, то есть
 * с тех же band-функций, что рисуют сегодняшнюю шкуру. Второго профиля в
 * репозитории не появляется ни на строку.
 *
 * Три решения, каждое против «очевидного» первого:
 *
 *  - панель идёт ПО СИЛОВОЙ СХЕМЕ, а не третями хорды: границы полос — это
 *    три лонжерона, которые в блокауте уже стоят (0.18 / 0.38 / 0.70 хорды);
 *  - носок закрывается ОДНОЙ гнутой панелью, огибающей переднюю кромку, как в
 *    жизни. Там кривизна максимальна, и разрезать её по кромке значит получить
 *    гранёный клюв на профильном кадре;
 *  - по размаху панель идёт ЧЕРЕЗ реальные нервюрные станции, а не мимо них:
 *    отсек может объединять несколько станций, но все пропущенные входят в
 *    панель промежуточными рядами. Поэтому вдоль размаха панельная шкура
 *    совпадает с лофтом ТОЧНО, и единственная погрешность — по хорде.
 *
 * Паспорт: docs/dc-3/skin-panels/evidence-card-01-wing-empennage-panels.md
 */

import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import {
  dc3AirframeSurface,
  dc3BlockoutObject,
} from "./dc3BlockoutObject.ts";
import { DC3_LENGTH, DC3_WINGSPAN } from "./dc3Dimensions.ts";

type Band = (u: number, t0: number, t1: number) => ObjectPoint[];

/** Толщина обшивки. Та же, что связка сцены даёт шкуре сегодня. */
const SKIN_THICKNESS = 0.012;
/**
 * Шаг отсека по размаху, метры. ЕДИНСТВЕННОЕ авторское число этой работы.
 * Настоящая нервюра идёт через 0.4–0.5 м — это ~210 панелей на консоль и
 * заведомо мимо бюджета. Сверху число ограничено не вкусом, а профилем, и
 * тест меряет цену прямо.
 */
const BAY_SPAN = 1.6;
/** Промежуточных шагов по хорде внутри полосы. Цена профиля — тест. */
const CHORD_STEPS = 4;
/** У носка кривизна максимальна, поэтому обход берёт больше шагов. */
const NOSE_STEPS = 7;

const parts: ObjectLabPart[] = [];
const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const sub = (a: ObjectPoint, b: ObjectPoint): ObjectPoint =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: ObjectPoint, b: ObjectPoint): ObjectPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: ObjectPoint, b: ObjectPoint): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function signedVolume(
  vertices: readonly ObjectPoint[],
  triangles: readonly ObjectTriangle[],
): number {
  let volume = 0;
  for (const [a, b, c] of triangles) {
    const [ax, ay, az] = vertices[a];
    const [bx, by, bz] = vertices[b];
    const [cx, cy, cz] = vertices[c];
    volume += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function norm(a: ObjectPoint): ObjectPoint {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length < 1e-9 ? [0, 1, 0] : [a[0] / length, a[1] / length, a[2] / length];
}

/**
 * Точка поверхности на стороне обшивки.
 *
 * Вырожденная полоса `band(u, t, t)` отдаёт кольцо, у которого ВСЕ точки лежат
 * на одной хордовой доле: первая — на одной стороне, последняя — на другой.
 * Так панель читает ту же функцию, что и шкура, вместо того чтобы повторять
 * её формулу у себя.
 */
function facePoint(band: Band, u: number, t: number, side: 0 | 1): ObjectPoint {
  const ring = band(u, t, t);
  return side === 0 ? ring[0] : ring[ring.length - 1];
}

/** Середина сечения: по ней определяется, куда «наружу». */
function sectionCentre(band: Band, u: number): ObjectPoint {
  const ring = band(u, 0, 1);
  const sum = ring.reduce<ObjectPoint>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length];
}

type PanelSpec = {
  readonly id: string;
  readonly group: string;
  /** Ряды по размаху: реальные станции, включая пропущенные внутри отсека. */
  readonly rows: readonly number[];
  /** Точка поверхности по (станция, шаг по хорде). */
  readonly at: (u: number, step: number, steps: number) => ObjectPoint;
  readonly steps: number;
};

/**
 * Замкнутая гнутая плитка: наружная поверхность, внутренняя со сдвигом на
 * толщину внутрь и кромка по периметру. Не плоскость и не двусторонний лист —
 * у обшивки должен быть объём, иначе разрушению нечего ломать.
 */
function emitPanel(
  id: string,
  group: string,
  grid: readonly (readonly ObjectPoint[])[],
  centres: readonly ObjectPoint[],
  material: ObjectMaterialId = "paint-light",
): void {
  const rowCount = grid.length;
  const cols = grid[0].length;
  const outer: ObjectPoint[] = [];
  const inner: ObjectPoint[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const here = grid[row][column];
      const across = sub(
        grid[row][Math.min(column + 1, cols - 1)],
        grid[row][Math.max(column - 1, 0)],
      );
      const along = sub(
        grid[Math.min(row + 1, rowCount - 1)][column],
        grid[Math.max(row - 1, 0)][column],
      );
      let normal = norm(cross(along, across));
      if (dot(normal, sub(here, centres[row])) < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      outer.push(here);
      inner.push([
        here[0] - normal[0] * SKIN_THICKNESS,
        here[1] - normal[1] * SKIN_THICKNESS,
        here[2] - normal[2] * SKIN_THICKNESS,
      ]);
    }
  }
  emitClosedTile(id, group, outer, inner, rowCount, cols, material);
}

function addPanel(spec: PanelSpec, band: Band): void {
  const grid = spec.rows.map((u) =>
    Array.from({ length: spec.steps + 1 }, (_, column) =>
      spec.at(u, column, spec.steps)));
  emitPanel(spec.id, spec.group, grid, spec.rows.map((u) => sectionCentre(band, u)));
}

function emitClosedTile(
  id: string,
  group: string,
  outer: readonly ObjectPoint[],
  inner: readonly ObjectPoint[],
  rowCount: number,
  cols: number,
  material: ObjectMaterialId = "paint-light",
): void {
  const vertices = [...outer, ...inner].map(dc3AirframeSurface.bodyToWorld);
  const offset = outer.length;
  const triangles: ObjectTriangle[] = [];
  const index = (row: number, column: number): number => row * cols + column;
  for (let row = 0; row + 1 < rowCount; row += 1) {
    for (let column = 0; column + 1 < cols; column += 1) {
      const a = index(row, column);
      const b = index(row, column + 1);
      const c = index(row + 1, column + 1);
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
  for (let column = 0; column + 1 < cols; column += 1) {
    rim(index(rowCount - 1, column), index(rowCount - 1, column + 1));
    rim(index(0, column + 1), index(0, column));
  }
  for (let row = 0; row + 1 < rowCount; row += 1) {
    rim(index(row, cols - 1), index(row + 1, cols - 1));
    rim(index(row + 1, 0), index(row, 0));
  }

  // Носовая панель обходит хорду в обратную сторону, поэтому её наружная
  // поверхность выходит вывернутой. Разворачиваем по знаку объёма — тем же
  // приёмом, что и `addClosedMesh` в блокауте, а не подгонкой порядка обхода.
  const volume = signedVolume(vertices, triangles);
  parts.push({
    kind: "mesh",
    id,
    group,
    material,
    plateThickness: SKIN_THICKNESS,
    // Плитка УЖЕ тело: её объём считается по геометрии, а не по «площадь ×
    // толщина». Та формула написана для одиночной оболочки и на замкнутой
    // плитке даёт вдвое больше — двумя поверхностями вместо одной.
    volume: Math.abs(volume),
    vertices,
    triangles: volume < 0
      ? triangles.map(([a, b, c]) => [a, c, b] as ObjectTriangle)
      : triangles,
    showEdges: true,
  });
}

/**
 * Отсеки: границы берутся ИЗ списка станций, а не округлением. Пропущенные
 * внутри отсека станции остаются промежуточными рядами панели, поэтому вдоль
 * размаха панель повторяет лофт точно, а не срезает его по хорде.
 */
function bays(stations: readonly number[], span: number): readonly number[][] {
  const result: number[][] = [];
  let current: number[] = [stations[0]];
  for (let index = 1; index < stations.length; index += 1) {
    current.push(stations[index]);
    const wide = stations[index] - current[0] >= span;
    const last = index === stations.length - 1;
    if (wide || last) {
      if (last && current.length < 2) current.unshift(stations[index - 1]);
      result.push(current);
      current = [stations[index]];
    }
  }
  return result.filter((bay) => bay.length >= 2);
}

const { wing, stabiliser, fin, spars, hingeGapT } = dc3AirframeSurface;

/** Полосы по хорде — по лонжеронам, не третями. */
type Lane = {
  readonly tag: string;
  readonly from: number;
  readonly to: number;
  readonly side: 0 | 1;
};

const boxLanes: readonly Lane[] = [
  { tag: "box-fwd-upper", from: spars.front, to: spars.main, side: 0 },
  { tag: "box-aft-upper", from: spars.main, to: spars.rear, side: 0 },
  { tag: "box-fwd-lower", from: spars.front, to: spars.main, side: 1 },
  { tag: "box-aft-lower", from: spars.main, to: spars.rear, side: 1 },
];

function laneAt(band: Band, lane: Lane) {
  return (u: number, step: number, steps: number): ObjectPoint =>
    facePoint(band, u, lane.from + ((lane.to - lane.from) * step) / steps, lane.side);
}

/**
 * Носок одной гнутой панелью: обход идёт от нижней стороны через переднюю
 * кромку на верхнюю. На самой кромке обе стороны сходятся в одну точку, что
 * band-функция и отдаёт, поэтому шва там не появляется.
 */
function noseAt(band: Band, upTo: number) {
  return (u: number, step: number, steps: number): ObjectPoint => {
    const half = steps / 2;
    if (step <= half) {
      return facePoint(band, u, upTo * (1 - step / half), 1);
    }
    return facePoint(band, u, (upTo * (step - half)) / half, 0);
  };
}

function panelSurface(
  prefix: string,
  group: string,
  band: Band,
  stations: readonly number[],
  options: {
    readonly noseTo: number;
    readonly lanes: readonly Lane[];
    readonly trailingTo?: (u: number) => number;
    readonly span?: number;
  },
): void {
  for (const [bayIndex, bay] of bays(stations, options.span ?? BAY_SPAN).entries()) {
    const tag = `${prefix}:bay${bayIndex}`;
    addPanel(
      {
        id: `${tag}:d-nose`,
        group,
        rows: bay,
        at: noseAt(band, options.noseTo),
        steps: NOSE_STEPS % 2 === 0 ? NOSE_STEPS : NOSE_STEPS + 1,
      },
      band,
    );
    for (const lane of options.lanes) {
      addPanel(
        { id: `${tag}:${lane.tag}`, group, rows: bay, at: laneAt(band, lane), steps: CHORD_STEPS },
        band,
      );
    }
    const trailingTo = options.trailingTo;
    if (!trailingTo) continue;
    // Хвостовая полоса существует только там, где нет руля: в отсеке
    // закруглка или элерона шкура кончается на заднем лонжероне, и это уже
    // так в B01 — панели просто не выдумывают того, чего там нет.
    const ends = bay.map(trailingTo);
    if (ends.some((end) => end <= options.lanes[1].to + 1e-6)) continue;
    for (const side of [0, 1] as const) {
      addPanel(
        {
          id: `${tag}:trail-${side === 0 ? "upper" : "lower"}`,
          group,
          rows: bay,
          at: (u, step, steps) =>
            facePoint(band, u, spars.rear + ((trailingTo(u) - spars.rear) * step) / steps, side),
          steps: CHORD_STEPS,
        },
        band,
      );
    }
  }
}

// === Крыло: обе консоли по своим станциям.
for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  const stations = wing.stations
    .map((x) => sign * x)
    .sort((a, b) => a - b);
  panelSurface(`wing-${side}`, "wing-panels", wing.band, stations, {
    noseTo: spars.front,
    lanes: boxLanes,
    trailingTo: wing.skinEndT,
  });
}

// === Горизонтальное оперение.
const stabStations = [
  -stabiliser.halfSpan,
  -(stabiliser.elevatorSpan.outer + 0.04),
  -stabiliser.elevatorSpan.outer,
  -2.1,
  -0.9,
  -stabiliser.elevatorSpan.inner,
  0,
  stabiliser.elevatorSpan.inner,
  0.9,
  2.1,
  stabiliser.elevatorSpan.outer,
  stabiliser.elevatorSpan.outer + 0.04,
  stabiliser.halfSpan,
].sort((a, b) => a - b);

panelSurface("stabiliser", "stab-panels", stabiliser.band, stabStations, {
  noseTo: spars.front,
  lanes: boxLanes,
  trailingTo: (x) =>
    stabiliser.inElevatorBay(x) ? stabiliser.hingeT - hingeGapT : 1,
  span: 1.4,
});

// === Рулевые поверхности крыла и оперения: та же процедура по своей хорде.
type Leaf = {
  readonly id: string;
  readonly band: Band;
  readonly stations: readonly number[];
  readonly from: number;
  readonly span: number;
};

const leaves: readonly Leaf[] = [
  ...[1, -1].flatMap((sign) => [
    { id: `flap-inner-${sign > 0 ? "right" : "left"}`, band: wing.band, stations: [1.58, 2.8, 4.2, 5].map((x) => sign * x).sort((a, b) => a - b), from: spars.rear + hingeGapT, span: 1.8 },
    { id: `flap-outer-${sign > 0 ? "right" : "left"}`, band: wing.band, stations: [6.58, 7.4, 8.55].map((x) => sign * x).sort((a, b) => a - b), from: spars.rear + hingeGapT, span: 1.8 },
    { id: `aileron-${sign > 0 ? "right" : "left"}`, band: wing.band, stations: [8.72, 10.2, 12.6, DC3_WINGSPAN / 2 - 0.52].map((x) => sign * x).sort((a, b) => a - b), from: spars.rear + hingeGapT, span: 2.2 },
    { id: `elevator-${sign > 0 ? "right" : "left"}`, band: stabiliser.band, stations: [stabiliser.elevatorSpan.inner, 0.9, 2.1, stabiliser.elevatorSpan.outer].map((x) => sign * x).sort((a, b) => a - b), from: stabiliser.hingeT + hingeGapT, span: 1.6 },
  ]),
];

for (const leaf of leaves) {
  for (const [bayIndex, bay] of bays(leaf.stations, leaf.span).entries()) {
    for (const side of [0, 1] as const) {
      addPanel(
        {
          id: `${leaf.id}:bay${bayIndex}:${side === 0 ? "upper" : "lower"}`,
          group: "control-panels",
          rows: bay,
          at: (u, step, steps) =>
            facePoint(leaf.band, u, leaf.from + ((1 - leaf.from) * step) / steps, side),
          steps: CHORD_STEPS,
        },
        leaf.band,
      );
    }
  }
}

// === Киль и руль направления: свои станции, интерполяция не нужна вовсе.
const finIndexes = fin.stations.map((_, index) => index);
const finBandByIndex: Band = (u, t0, t1) =>
  fin.band(fin.stations[Math.round(u)], t0, t1);

function finBays(predicate: (index: number) => boolean): readonly number[][] {
  const chosen = finIndexes.filter(predicate);
  const result: number[][] = [];
  for (let index = 0; index + 1 < chosen.length; index += 2) {
    const bay = chosen.slice(index, Math.min(index + 3, chosen.length));
    if (bay.length >= 2) result.push(bay);
  }
  return result;
}

for (const [bayIndex, bay] of finBays(() => true).entries()) {
  const rudderBay = bay.every((index) => fin.inRudderBay(fin.stations[index]));
  const endT = rudderBay ? fin.hingeT - hingeGapT : 1;
  addPanel(
    {
      id: `fin:bay${bayIndex}:d-nose`,
      group: "fin-panels",
      rows: bay,
      at: noseAt(finBandByIndex, spars.front),
      steps: NOSE_STEPS + 1,
    },
    finBandByIndex,
  );
  for (const side of [0, 1] as const) {
    addPanel(
      {
        id: `fin:bay${bayIndex}:${side === 0 ? "port" : "starboard"}`,
        group: "fin-panels",
        rows: bay,
        at: (u, step, steps) =>
          facePoint(finBandByIndex, u, spars.front + ((endT - spars.front) * step) / steps, side),
        steps: CHORD_STEPS,
      },
      finBandByIndex,
    );
  }
}

for (const [bayIndex, bay] of finBays((index) => fin.inRudderBay(fin.stations[index])).entries()) {
  for (const side of [0, 1] as const) {
    addPanel(
      {
        id: `rudder:bay${bayIndex}:${side === 0 ? "port" : "starboard"}`,
        group: "control-panels",
        rows: bay,
        at: (u, step, steps) =>
          facePoint(
            finBandByIndex,
            u,
            fin.hingeT + hingeGapT + ((1 - fin.hingeT - hingeGapT) * step) / steps,
            side,
          ),
        steps: CHORD_STEPS,
      },
      finBandByIndex,
    );
  }
}

/**
 * ПАНЕЛИЗАЦИЯ ТЕЛА ВРАЩЕНИЯ: ФЮЗЕЛЯЖ И МОТОГОНДОЛЫ.
 *
 * Здесь панель совпадает с лофтом ТОЧНО, а не приближённо, и это не удача:
 * границы клина ложатся на выборки кольца, а границы отсека — на станции.
 * Промежуточных точек выдумывать не надо ни по одной оси, поэтому обшивка
 * получается ровно тем же телом, только разрезанным на куски.
 *
 * Отсюда же ответ на возражение «плоские панели огранят круглый фюзеляж»:
 * гранит не число клиньев, а число выборок ВНУТРИ клина. Клин — гнутая
 * плитка, и его ширина решает, где пройдёт шов, а не насколько круглым
 * останется борт.
 */
function panelRingBody(options: {
  readonly prefix: string;
  readonly group: string;
  /** Кольцо на каждой станции, в корпусных координатах. */
  readonly rings: readonly (readonly ObjectPoint[])[];
  /** Продольная координата станции — по ней группируются отсеки. */
  readonly keys: readonly number[];
  readonly baySpan: number;
  /** Сколько выборок кольца забирает один клин. */
  readonly goreStep: number;
}): void {
  const ringCount = options.rings[0].length;
  const centres = options.rings.map((ring) => {
    const sum = ring.reduce<ObjectPoint>(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
      [0, 0, 0],
    );
    return [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length] as ObjectPoint;
  });
  const indexes = options.keys.map((_, index) => index);
  const bayGroups: number[][] = [];
  let current = [indexes[0]];
  for (let index = 1; index < indexes.length; index += 1) {
    current.push(indexes[index]);
    const reach = Math.abs(options.keys[indexes[index]] - options.keys[current[0]]);
    if (reach >= options.baySpan || index === indexes.length - 1) {
      bayGroups.push(current);
      current = [indexes[index]];
    }
  }
  for (const [bayIndex, bay] of bayGroups.filter((bay) => bay.length >= 2).entries()) {
    const gores = Math.floor(ringCount / options.goreStep);
    for (let gore = 0; gore < gores; gore += 1) {
      const grid = bay.map((station) =>
        Array.from({ length: options.goreStep + 1 }, (_, step) =>
          options.rings[station][(gore * options.goreStep + step) % ringCount]));
      emitPanel(
        `${options.prefix}:bay${bayIndex}:gore${gore}`,
        options.group,
        grid,
        bay.map((station) => centres[station]),
      );
    }
  }
}

// === Фюзеляж: десять продольных клиньев по кругу, с вырезами под окна.
const { fuselage, nacelle } = dc3AirframeSurface;

const TAU = Math.PI * 2;
const FUSELAGE_GORES = 10;
const FUSELAGE_GORE_STEP = fuselage.ringCount / FUSELAGE_GORES;

/**
 * Плитка обшивки фюзеляжа по ПРОИЗВОЛЬНЫМ (z, угол).
 *
 * Ровно та же поверхность, что у остальных панелей, но параметризованная не
 * индексами выборок, а самими координатами. Это и позволяет резать окно: его
 * кромка почти никогда не совпадает с выборкой кольца, а по хордам между
 * выборками эллипс отходит на 17 мм — прямо на видимой рамке.
 */
/**
 * Станция на z. Если z совпадает с авторской станцией, берётся ОНА, а не
 * интерполяция: `sampleStation` тянет `upperPower` и `faceForward` от
 * предыдущей станции, и на границе носовые сечения выходят другой формы.
 */
function fuselageStationAt(z: number) {
  return fuselage.stations.find((station) => Math.abs(station.z - z) < 1e-9)
    ?? fuselage.at(z);
}

function fuselageTile(
  id: string,
  group: string,
  zs: readonly number[],
  angles: readonly number[],
  inward = 0,
  material: ObjectMaterialId = "paint-light",
): void {
  const grid = zs.map((z) => {
    const station = fuselageStationAt(z);
    return angles.map((angle) => {
      const surface = fuselage.pointAt(station, angle);
      if (inward === 0) return surface;
      const centreY = (station.crown + station.keel) / 2;
      const dx = surface[0];
      const dy = surface[1] - centreY;
      const length = Math.hypot(dx, dy) || 1;
      return [
        surface[0] - (dx / length) * inward,
        surface[1] - (dy / length) * inward,
        surface[2],
      ] as ObjectPoint;
    });
  });
  const centres = zs.map((z) => {
    const station = fuselageStationAt(z);
    return [0, (station.crown + station.keel) / 2, z] as ObjectPoint;
  });
  emitPanel(id, group, grid, centres, material);
}

/** Угол сечения, на котором борт имеет заданную высоту. */
function angleAtHeight(z: number, y: number, side: 1 | -1): number {
  const station = fuselageStationAt(z);
  const centreY = (station.crown + station.keel) / 2;
  const halfHeight = (station.crown - station.keel) / 2;
  const unit = Math.max(-1, Math.min(1, (y - centreY) / halfHeight));
  const angle = Math.asin(unit);
  return side > 0 ? angle : Math.PI - angle;
}

/**
 * СТЕКЛО НЕ КРЕПИТСЯ К ОБШИВКЕ. Между ними обвязка: проём режется по
 * наружному контуру, рама занимает кольцо шириной `FRAME_WIDTH`, стекло сидит
 * за ней. На самолёте так и есть, и на кадре разница видна сразу — иначе
 * стеклопакет выглядит вставленным в дюраль без ничего.
 */
const FRAME_WIDTH = 0.045;
const FRAME_INSET = 0.008;
// Стекло сидит В ОБВЯЗКЕ, а не в колодце за ней. При 50 мм между рамой и
// пакетом на косом взгляде открывался откос шириной в палец — окно читалось
// утопленным люком. 7 мм ступеньки достаточно, чтобы пакет не лежал заподлицо
// с рамой и при этом не проваливался.
const GLASS_INSET = 0.015;

type WindowCut = {
  readonly id: string;
  readonly zFrom: number;
  readonly zTo: number;
  readonly angleFrom: number;
  readonly angleTo: number;
  readonly glassZFrom: number;
  readonly glassZTo: number;
  readonly glassAngleFrom: number;
  readonly glassAngleTo: number;
};

/** Столбцы, на которые опирается поперечная планка рамы. */
function columnsBetweenGlass(
  columns: readonly number[],
  cut: WindowCut,
): readonly number[] {
  return columns.filter(
    (angle) => angle >= cut.glassAngleFrom - 1e-9 && angle <= cut.glassAngleTo + 1e-9,
  );
}

const windowCuts: WindowCut[] = [];
for (const [index, plan] of dc3AirframeSurface.windows.entries()) {
  for (const side of [1, -1] as const) {
    const zFrom = plan.z - plan.along / 2 - FRAME_WIDTH;
    const zTo = plan.z + plan.along / 2 + FRAME_WIDTH;
    const outer = [
      angleAtHeight(plan.z, plan.centreY - plan.across / 2 - FRAME_WIDTH, side),
      angleAtHeight(plan.z, plan.centreY + plan.across / 2 + FRAME_WIDTH, side),
    ];
    const glass = [
      angleAtHeight(plan.z, plan.centreY - plan.across / 2, side),
      angleAtHeight(plan.z, plan.centreY + plan.across / 2, side),
    ];
    windowCuts.push({
      id: `window-${side > 0 ? "right" : "left"}-${index}`,
      zFrom,
      zTo,
      angleFrom: Math.min(...outer),
      angleTo: Math.max(...outer),
      glassZFrom: plan.z - plan.along / 2,
      glassZTo: plan.z + plan.along / 2,
      glassAngleFrom: Math.min(...glass),
      glassAngleTo: Math.max(...glass),
    });
  }
}

/** Отсеки фюзеляжа: те же границы, что и раньше. */
const fuselageBays: number[][] = (() => {
  const zs = fuselage.stations.map((station) => station.z);
  const result: number[][] = [];
  let current = [zs[0]];
  for (let index = 1; index < zs.length; index += 1) {
    current.push(zs[index]);
    if (Math.abs(zs[index] - current[0]) >= 1.6 || index === zs.length - 1) {
      result.push(current);
      current = [zs[index]];
    }
  }
  return result.filter((bay) => bay.length >= 2);
})();

for (const [bayIndex, bay] of fuselageBays.entries()) {
  const zLow = Math.min(...bay);
  const zHigh = Math.max(...bay);
  const sortedZs = [...bay].sort((a, b) => a - b);
  for (let gore = 0; gore < FUSELAGE_GORES; gore += 1) {
    const angleFrom = ((gore * FUSELAGE_GORE_STEP) / fuselage.ringCount) * TAU;
    const angleTo = (((gore + 1) * FUSELAGE_GORE_STEP) / fuselage.ringCount) * TAU;
    const goreAngles = Array.from(
      { length: FUSELAGE_GORE_STEP + 1 },
      (_, step) => angleFrom + ((angleTo - angleFrom) * step) / FUSELAGE_GORE_STEP,
    );
    const id = `fuselage:bay${bayIndex}:gore${gore}`;
    const cuts = windowCuts
      .filter((window) =>
        window.zFrom > zLow && window.zTo < zHigh
        && window.angleFrom > angleFrom && window.angleTo < angleTo)
      .sort((left, right) => left.zFrom - right.zFrom);
    if (cuts.length === 0) {
      fuselageTile(id, "fuselage-panels", sortedZs, goreAngles);
      continue;
    }
    // ОБЩАЯ СЕТКА НА ВСЕ ПОЛОСЫ КЛИНА.
    //
    // Полосы вокруг проёма делят кромку с соседними полосами. Если каждая
    // нарезана по своим углам, на общей кромке получается T-образный стык:
    // одна сторона идёт хордой через середину клина, другая — через кромку
    // окна, и между ними светится щель. Поэтому список углов и список z
    // строятся ОДИН РАЗ на клин, а полосы берут из них срезы.
    // КРОМКА ПРИТЯГИВАЕТСЯ К ГРАНИЦЕ, А НЕ СХЛОПЫВАЕТСЯ С НЕЙ.
    //
    // Прежняя редакция сливала близкие выборки в одну — и заодно съедала
    // кромку СТЕКЛА, если та подходила к границе клина ближе допуска. У двух
    // окон стекло от этого сжалось вчетверо, а по носу разъехались ряды:
    // соседние отсеки остались с разными списками станций, и на общей кромке
    // снова открылся T-образный стык.
    //
    // Правильно наоборот: если кромка ПРОЁМА почти совпала с границей клина
    // или со станцией, она становится этой границей ТОЧНО. Полоса между ними
    // вырождается и не выпускается, щели при этом не возникает, а стекло
    // сохраняет свой размер.
    const snap = (value: number, grid: readonly number[], epsilon: number) => {
      const near = grid.find((edge) => Math.abs(edge - value) < epsilon);
      return near ?? value;
    };
    const snapped = cuts.map((cut) => ({
      ...cut,
      angleFrom: snap(cut.angleFrom, goreAngles, 0.03),
      angleTo: snap(cut.angleTo, goreAngles, 0.03),
      zFrom: snap(cut.zFrom, sortedZs, 0.05),
      zTo: snap(cut.zTo, sortedZs, 0.05),
    }));
    const unique = (values: readonly number[]) =>
      [...values].sort((a, b) => a - b)
        .filter((value, index, list) => index === 0 || value - list[index - 1] > 1e-9);
    const columns = unique([
      ...goreAngles,
      ...snapped.flatMap((cut) => [
        cut.angleFrom, cut.glassAngleFrom, cut.glassAngleTo, cut.angleTo,
      ]),
    ]);
    const rows = unique([
      ...sortedZs,
      ...snapped.flatMap((cut) => [
        cut.zFrom, cut.glassZFrom, cut.glassZTo, cut.zTo,
      ]),
    ]);
    const between = (values: readonly number[], low: number, high: number) =>
      values.filter((value) => value >= low - 1e-9 && value <= high + 1e-9);

    let cursor = zLow;
    for (const [cutIndex, cut] of snapped.entries()) {
      const tile = (
        tag: string,
        group: string,
        rws: readonly number[],
        cols: readonly number[],
        inward = 0,
        material: ObjectMaterialId = "paint-light",
      ): void => {
        if (rws.length < 2 || cols.length < 2) return;
        fuselageTile(tag, group, rws, cols, inward, material);
      };
      tile(`${id}:seg${cutIndex}`, "fuselage-panels",
        between(rows, cursor, cut.zFrom), columns);
      const windowRows = between(rows, cut.zFrom, cut.zTo);
      tile(`${id}:below${cutIndex}`, "fuselage-panels", windowRows,
        between(columns, angleFrom, cut.angleFrom));
      tile(`${id}:above${cutIndex}`, "fuselage-panels", windowRows,
        between(columns, cut.angleTo, angleTo));
      // РАМА. Стекло не крепится к обшивке напрямую: между ними обвязка.
      // Проём режется по НАРУЖНОМУ прямоугольнику, рама занимает кольцо
      // между ним и стеклом, стекло сидит глубже неё.
      for (const [tag, cols, rws] of [
        ["frame-below", between(columns, cut.angleFrom, cut.glassAngleFrom), windowRows],
        ["frame-above", between(columns, cut.glassAngleTo, cut.angleTo), windowRows],
        ["frame-aft", columnsBetweenGlass(columns, cut), between(rows, cut.zFrom, cut.glassZFrom)],
        ["frame-fore", columnsBetweenGlass(columns, cut), between(rows, cut.glassZTo, cut.zTo)],
      ] as const) {
        tile(`${cut.id}:${tag}`, "window-frame", rws, cols, FRAME_INSET, "metal");
      }
      tile(`${cut.id}:glazing`, "window-glazing",
        between(rows, cut.glassZFrom, cut.glassZTo),
        between(columns, cut.glassAngleFrom, cut.glassAngleTo),
        GLASS_INSET, "glazing");
      cursor = cut.zTo;
    }
    if (between(rows, cursor, zHigh).length >= 2) {
      fuselageTile(`${id}:segTail`, "fuselage-panels",
        between(rows, cursor, zHigh), columns);
    }
  }
}

/**
 * Разбиение кольца гондолы. B01 строит капот 24 сегментами — на общем плане
 * этого хватает, но губа снимается вблизи, и там 24-угольник читается
 * гранёным. Здесь берётся 48, ОДНО на оболочку, губу и тракт: раздели их —
 * и на стыке останутся разные вершины, то есть шов.
 *
 * Это уточнение той же окружности, а не другая форма.
 */
const NACELLE_SEGMENTS = 48;
const NACELLE_GORES = 6;

// === Мотогондолы: наружная капотная оболочка.
for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  panelRingBody({
    prefix: `nacelle-${side}`,
    group: "nacelle-panels",
    rings: nacelle.body.map((ring) =>
      nacelle.circle(sign * nacelle.halfSpan, nacelle.hubY, ring.z, ring.radius, NACELLE_SEGMENTS)),
    keys: nacelle.body.map((ring) => ring.z),
    baySpan: 1.5,
    goreStep: NACELLE_SEGMENTS / NACELLE_GORES,
  });
}

/**
 * ГУБА КАПОТА NACA — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ОБРАЗЕЦ МЕНЯЕТ ФОРМУ B01.
 *
 * У капота воздушного охлаждения вход не обрезан, а завёрнут: наружная
 * оболочка выходит вперёд, заворачивается через носок и уходит внутрь,
 * становясь стенкой тракта. Это и даёт характерный «пухлый» вход поршневого
 * капота, и работает он так же, как раструб канала у канального гексакоптера
 * (`ductHexacopterObject`, `inlet-lip`): именно скругление, а не дырка в
 * пластине, заставляет воздух заходить.
 *
 * В B01 на этом месте плоское кольцо между 0.71 и `COWL_INNER` при одном и том
 * же z — то есть нож. Отсюда и кромка на кадрах.
 *
 * Профиль AUTHORED: дуга носка радиуса 0.075 вокруг средней окружности, чуть
 * вытянутая вперёд. Ни один снимок в репозитории её не разрешает.
 */
const COWL_FRONT_Z = nacelle.body[0].z;
const COWL_OUTER_RADIUS = nacelle.body[0].radius;
const COWL_INNER_RADIUS = 0.57;
const LIP_RADIUS = (COWL_OUTER_RADIUS - COWL_INNER_RADIUS) / 2;
const LIP_CENTRE_RADIUS = (COWL_OUTER_RADIUS + COWL_INNER_RADIUS) / 2;
/** Вынос носка вперёд: дуга не круглая, а слегка вытянутая по потоку. */
const LIP_REACH = 1.15;
const LIP_STEPS = 6;

const lipProfile = Array.from({ length: LIP_STEPS + 1 }, (_, index) => {
  const angle = (Math.PI / 2) * (1 - (2 * index) / LIP_STEPS);
  return {
    z: COWL_FRONT_Z + LIP_RADIUS * LIP_REACH * Math.cos(angle),
    radius: LIP_CENTRE_RADIUS + LIP_RADIUS * Math.sin(angle),
  };
});

for (const sign of [1, -1] as const) {
  const side = sign > 0 ? "right" : "left";
  const x = sign * nacelle.halfSpan;
  // Губа: от наружной оболочки через носок внутрь. Кольца те же, что у
  // остальной гондолы, поэтому шов с ней сходится точка в точку.
  panelRingBody({
    prefix: `nacelle-${side}-lip`,
    group: "nacelle-panels",
    rings: lipProfile.map((ring) =>
      nacelle.circle(x, nacelle.hubY, ring.z, ring.radius, NACELLE_SEGMENTS)),
    keys: lipProfile.map((_, index) => index * 0.4),
    baySpan: 1.2,
    goreStep: NACELLE_SEGMENTS / NACELLE_GORES,
  });
  // Стенка тракта от губы до противопожарной перегородки. Без неё губа
  // кончается в пустоте, и гондола по-прежнему читается трубой.
  panelRingBody({
    prefix: `nacelle-${side}-duct`,
    group: "nacelle-panels",
    rings: [COWL_FRONT_Z, 1.95, 1.2].map((z) =>
      nacelle.circle(x, nacelle.hubY, z, COWL_INNER_RADIUS, NACELLE_SEGMENTS)),
    keys: [COWL_FRONT_Z, 1.95, 1.2],
    baySpan: 1.6,
    goreStep: NACELLE_SEGMENTS / NACELLE_GORES,
  });
}

export const dc3SkinPanelParts: readonly ObjectLabPart[] = [...parts];

/**
 * Панели по группам — точка, через которую машина забирает обшивку.
 *
 * Адаптер сцены подменяет ими лофтовые шкуры B01. Группы разделены нарочно:
 * неподвижная обшивка врезается первой, рулевые поверхности — отдельным
 * шагом, потому что актуатор и петля ищутся по ТОЧНОМУ id куска, и дробление
 * руля на панели без правки этого поиска остановило бы управление.
 */
export function dc3SkinPanelsByGroup(
  groups: readonly string[],
): readonly ObjectLabPart[] {
  return parts.filter((part) => groups.includes(part.group));
}

/** Неподвижная обшивка: крыло, стабилизатор, киль, фюзеляж, гондолы. */
export const DC3_FIXED_SKIN_GROUPS = [
  "wing-panels",
  "stab-panels",
  "fin-panels",
  "fuselage-panels",
  "nacelle-panels",
] as const;

/**
 * Сегодняшние лофтовые шкуры — только как ЭТАЛОН для сравнения. В приёмочных
 * кадрах эта группа скрыта; она нужна ровно одному виду, где панельная шкура
 * кладётся поверх той, что заменяет.
 */
const referenceLofts: readonly ObjectLabPart[] = dc3BlockoutObject.parts
  .filter((part) => ["wing", "empennage", "fuselage"].includes(part.group)
    || part.group.startsWith("nacelle-"))
  .map((part) => ({ ...part, id: `reference:${part.id}`, group: "reference-loft" }));

/**
 * Салон в образце — затем, чтобы проверить главное требование к окну: сквозь
 * него должно быть видно кресло. Кадр без начинки этого не показывает вовсе.
 */
const cabinParts: readonly ObjectLabPart[] = dc3BlockoutObject.parts
  .filter((part) => part.group.startsWith("cabin-"))
  .map((part) => ({ ...part, group: "cabin" }));

const panelGroups = [
  "window-glazing",
  "window-frame",
  "wing-panels",
  "stab-panels",
  "fin-panels",
  "control-panels",
  "fuselage-panels",
  "nacelle-panels",
] as const;
const allGroups = [...panelGroups, "cabin", "reference-loft"] as const;
const hiddenExcept = (shown: readonly string[]): readonly string[] =>
  allGroups.filter((group) => !shown.includes(group));

const views: readonly ObjectLabView[] = [
  {
    id: "panel-plan",
    label: "План · членение обшивки и вырезы под рули",
    // Строго вертикальный план вырождает вектор «вверх» и кадр заваливается.
    // Поэтому это высокая перспектива: членение читается так же, а камера
    // остаётся устойчивой.
    projection: "perspective",
    position: point(11, 33, 7),
    target: point(0, 1.5, -5.5),
    fov: 30,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-three-quarter",
    label: "Три четверти · панельная шкура целиком",
    projection: "perspective",
    position: point(24, 13, 20),
    target: point(0, 2.2, -5),
    fov: 32,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "reference-loft",
    label: "Эталон · сегодняшняя лофтовая шкура, та же камера",
    projection: "perspective",
    position: point(24, 13, 20),
    target: point(0, 2.2, -5),
    fov: 32,
    hiddenGroups: hiddenExcept(["reference-loft"]),
  },
  {
    id: "panel-nose-detail",
    label: "Носок · гнутая панель против гранёного клюва",
    projection: "perspective",
    position: point(8.6, 3.05, 1.9),
    target: point(7, 2.78, -0.15),
    fov: 24,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-joint-detail",
    label: "Стык · кромка отсека и полосы по лонжеронам",
    projection: "perspective",
    position: point(6.6, 3.4, 1.6),
    target: point(5.2, 2.6, -1),
    fov: 26,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-empennage",
    label: "Оперение · киль, стабилизатор, рули",
    projection: "perspective",
    position: point(8.5, 6.2, -3.2),
    target: point(0, 2.9, -11.4),
    fov: 32,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-windows",
    label: "Иллюминаторы · настоящие проёмы, за ними кресла",
    projection: "perspective",
    position: point(6.4, 4.2, 5.6),
    target: point(1.25, 3.66, 2.09),
    fov: 30,
    hiddenGroups: hiddenExcept([...panelGroups, "cabin"]),
  },
  {
    id: "panel-fuselage-detail",
    label: "Фюзеляж · продольные клинья и кольцевые стыки",
    projection: "perspective",
    position: point(4.6, 3.9, 5.4),
    target: point(0.4, 2.2, 0.6),
    fov: 34,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-nacelle-detail",
    label: "Мотогондола · капотная оболочка панелями",
    projection: "perspective",
    position: point(8.6, 3.4, 5.2),
    target: point(5.79, 2.1, 0.6),
    fov: 30,
    hiddenGroups: hiddenExcept(panelGroups),
  },
  {
    id: "panel-silhouette",
    label: "Силуэт · профиль панельной шкуры",
    projection: "orthographic",
    position: point(-32, 2.8, -6.4),
    target: point(0, 2.8, -6.4),
    orthoHeight: 7.5,
    hiddenGroups: hiddenExcept(panelGroups),
  },
];

export const dc3SkinPanelsObject: ObjectLabModel & {
  readonly captureFrame: readonly [width: number, height: number];
} = {
  id: "douglas-dc3-skin-panels",
  revision: "p2-01-2026-08-15-full-skin",
  title: "Douglas DC-3 — обшивка панелями, планер целиком",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1600, 1000],
  sourceNotes: [
    "Форма целиком принадлежит B01: панели снимаются с dc3AirframeSurface, то есть с тех же band-функций, что рисуют сегодняшнюю шкуру. Второго профиля не заведено.",
    "Полосы по хорде идут по трём лонжеронам блокаута (0.18 / 0.38 / 0.70 доли хорды), а не третями — это силовая схема, а не разметка.",
    "Носок закрыт одной гнутой панелью, огибающей переднюю кромку: разрез по кромке дал бы гранёный клюв там, где кривизна максимальна.",
    "По размаху панель проходит через реальные нервюрные станции, включая пропущенные внутри отсека, поэтому вдоль размаха она совпадает с лофтом точно.",
    "Шаг отсека 1.6 м — авторский и единственный: настоящая нервюра идёт через 0.4–0.5 м, что даёт ~210 панелей на консоль и мимо бюджета.",
    "Хвостовой полосы нет там, где нет шкуры: в отсеках закрылка и элерона она кончается на заднем лонжероне уже в B01.",
    "Фюзеляж и мотогондолы — тела вращения: границы клина ложатся на выборки кольца, границы отсека на станции, поэтому панельная шкура совпадает с лофтом ТОЧНО, а не приближённо.",
    "Круглость фюзеляжа граним не числом клиньев, а числом выборок внутри клина: клин — гнутая плитка, и его ширина решает только, где пройдёт шов.",
    "Губа капота NACA — единственное место, где образец МЕНЯЕТ форму B01: там сегодня плоское кольцо, то есть нож. Скруглённый завёрнутый вход характерен для капота воздушного охлаждения и работает так же, как раструб канала у канального гексакоптера.",
    "Профиль губы authored: дуга носка радиуса 0.075 вокруг средней окружности, вытянутая вперёд на 15%. Ни один снимок в репозитории её не разрешает.",
    "Регистрация в мире, адаптер и префаб НЕ сделаны.",
  ],
  dimensions: {
    wingspan: DC3_WINGSPAN,
    length: DC3_LENGTH,
    baySpan: BAY_SPAN,
    skinThickness: SKIN_THICKNESS,
    panelCount: parts.length,
    maximumOperatingHeight: 5.16,
  },
  labMetrics: [
    { label: "PANELS", value: parts.length, decimals: 0, signed: false, unit: "" },
    { label: "BAY", value: BAY_SPAN, decimals: 2, signed: false },
    { label: "SKIN", value: SKIN_THICKNESS, decimals: 3, signed: false },
    { label: "SPAN", value: DC3_WINGSPAN, decimals: 2, signed: false },
  ],
  anchors: {
    groundCentre: point(0, 0, 0),
    leftWingTip: dc3BlockoutObject.anchors.leftWingTip,
    rightWingTip: dc3BlockoutObject.anchors.rightWingTip,
    finTip: dc3BlockoutObject.anchors.finTip,
    humanScale: point(0, 1.75, 0),
  },
  motionConstraints: {
    staticSpecimen: true,
    controlSurfaces: "panelled-in-rest-pose-only",
    worldIntegrationDeferred: true,
    fuselageExcluded: true,
  },
  labEnvironment: {
    floorRadius: 34,
    gridSize: 64,
    gridDivisions: 64,
    fogNear: 72,
    fogFar: 118,
    floorY: -0.04,
  },
  parts: [...parts, ...cabinParts, ...referenceLofts],
  views,
};
