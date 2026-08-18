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
const lerp = (a: ObjectPoint, b: ObjectPoint, t: number): ObjectPoint => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
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
      const colNext = Math.min(column + 1, cols - 1);
      const colPrev = Math.max(column - 1, 0);
      let across = sub(grid[row][colNext], grid[row][colPrev]);
      if (dot(across, across) < 1e-16 && row > 0) {
        across = sub(grid[row - 1][colNext], grid[row - 1][colPrev]);
      }
      const rowNext = Math.min(row + 1, rowCount - 1);
      const rowPrev = Math.max(row - 1, 0);
      let along = sub(grid[rowNext][column], grid[rowPrev][column]);
      if (dot(along, along) < 1e-16) {
        if (row > 0) along = sub(here, grid[row - 1][column]);
        else if (row + 1 < rowCount) along = sub(grid[row + 1][column], here);
      }
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
    // Хвостовая полоса только там, где нет руля. Смешанный отсек элерона и
    // колпака не выкидывается целиком — иначе скруглённая задняя кромка
    // законцовки остаётся без панелей. Смесь закрылка с щелью у гондолы
    // по-прежнему пропускается: там заднюю кромку несёт мотогондола.
    const rear = options.lanes[1].to;
    if (bay.some((u) => wing.inFlapBay(u))
      && bay.some((u) => trailingTo(u) <= rear + 1e-6)) {
      continue;
    }
    const trailRows = bay.filter((u) => trailingTo(u) > rear + 1e-6);
    if (trailRows.length < 2) continue;
    for (const side of [0, 1] as const) {
      addPanel(
        {
          id: `${tag}:trail-${side === 0 ? "upper" : "lower"}`,
          group,
          rows: trailRows,
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
panelSurface("stabiliser", "stab-panels", stabiliser.band, stabiliser.stations, {
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
    { id: `aileron-${sign > 0 ? "right" : "left"}`, band: wing.band, stations: [wing.aileronSpan.inner, 10.2, 12.6, wing.aileronSpan.outer].map((x) => sign * x).sort((a, b) => a - b), from: spars.rear + hingeGapT, span: 2.2 },
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
 * интерполяция между соседями: на границе это тот же овал, что в таблице.
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

/** Угол сечения по точке: visor на оси даёт π/2, даже сидя ниже лофта. */
function sectionAngle(sample: ObjectPoint): number {
  const station = fuselageStationAt(sample[2]);
  const cosine = Math.max(
    -1,
    Math.min(1, sample[0] / Math.max(station.halfWidth, 1e-9)),
  );
  return sample[1] >= 0 ? Math.acos(cosine) : -Math.acos(cosine);
}

/** Точка лофта на заданной высоте. Та же формула, что `loftPointAtY` блокаута. */
function loftPointAtY(z: number, y: number, side: 1 | -1): ObjectPoint {
  const station = fuselageStationAt(z);
  const centreY = (station.crown + station.keel) / 2;
  const halfHeight = (station.crown - station.keel) / 2;
  const power = station.upperPower ?? 2;
  const unit = Math.max(0, Math.min(1, (y - centreY) / Math.max(halfHeight, 1e-9)));
  const sine = Math.pow(unit, power / 2);
  const angle = Math.asin(Math.max(0, Math.min(1, sine)));
  const surface = fuselage.pointAt(station, side > 0 ? angle : Math.PI - angle);
  return [surface[0], y, z];
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
  readonly snapZ?: number;
  readonly snapAngle?: number;
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

const uniqueSorted = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)
    .filter((value, index, list) => index === 0 || value - list[index - 1] > 1e-9);

const between = (values: readonly number[], low: number, high: number) =>
  values.filter((value) => value >= low - 1e-9 && value <= high + 1e-9);

const snapTo = (value: number, grid: readonly number[], epsilon: number) => {
  const near = grid.find((edge) => Math.abs(edge - value) < epsilon);
  return near ?? value;
};

function emitFuselageBand(
  id: string,
  zLow: number,
  zHigh: number,
  zRows: readonly number[],
  angleFrom: number,
  angleTo: number,
  goreAngles: readonly number[],
  cuts: readonly WindowCut[],
): void {
  const sortedZs = uniqueSorted(zRows);
  const inside = cuts
    .filter((cut) =>
      cut.zFrom > zLow && cut.zTo < zHigh
      && cut.angleFrom > angleFrom && cut.angleTo < angleTo)
    .sort((left, right) => left.zFrom - right.zFrom);
  if (inside.length === 0) {
    if (sortedZs.length >= 2 && goreAngles.length >= 2) {
      fuselageTile(id, "fuselage-panels", sortedZs, goreAngles);
    }
    return;
  }
  const snapped = inside.map((cut) => ({
    ...cut,
    angleFrom: snapTo(cut.angleFrom, goreAngles, cut.snapAngle ?? 0.03),
    angleTo: snapTo(cut.angleTo, goreAngles, cut.snapAngle ?? 0.03),
    zFrom: snapTo(cut.zFrom, sortedZs, cut.snapZ ?? 0.05),
    zTo: snapTo(cut.zTo, sortedZs, cut.snapZ ?? 0.05),
  }));
  const columns = uniqueSorted([
    ...goreAngles,
    ...snapped.flatMap((cut) => [
      cut.angleFrom, cut.glassAngleFrom, cut.glassAngleTo, cut.angleTo,
    ]),
  ]);
  const rows = uniqueSorted([
    ...sortedZs,
    ...snapped.flatMap((cut) => [
      cut.zFrom, cut.glassZFrom, cut.glassZTo, cut.zTo,
    ]),
  ]);
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
  let cursor = zLow;
  for (const [cutIndex, cut] of snapped.entries()) {
    tile(`${id}:seg${cutIndex}`, "fuselage-panels",
      between(rows, cursor, cut.zFrom), columns);
    const windowRows = between(rows, cut.zFrom, cut.zTo);
    tile(`${id}:below${cutIndex}`, "fuselage-panels", windowRows,
      between(columns, angleFrom, cut.angleFrom));
    tile(`${id}:above${cutIndex}`, "fuselage-panels", windowRows,
      between(columns, cut.angleTo, angleTo));
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

const { zAft: WINDSHIELD_Z_AFT, zFore: WINDSHIELD_Z_FORE } = dc3AirframeSurface.windshieldBay;
const ROOF_TO_BROW_Z = dc3AirframeSurface.greenhouseBrow.apex[2];
const DECK_TO_SILL_Z = dc3AirframeSurface.greenhouseSill.apex[2];
const WINDSHIELD_GORE_BEGIN = 1;
const WINDSHIELD_GORE_END = 4;
const WINDSHIELD_ANGLE_FROM = (WINDSHIELD_GORE_BEGIN / FUSELAGE_GORES) * TAU;
const WINDSHIELD_ANGLE_TO = (WINDSHIELD_GORE_END / FUSELAGE_GORES) * TAU;

function goreCoversWindshield(angleFrom: number, angleTo: number): boolean {
  return angleFrom < WINDSHIELD_ANGLE_TO - 1e-9 && angleTo > WINDSHIELD_ANGLE_FROM + 1e-9;
}

function expandSideLight(pane: { readonly corners: readonly ObjectPoint[] }): ObjectPoint[] {
  const along = norm(sub(pane.corners[3], pane.corners[0]));
  const across = norm(sub(pane.corners[1], pane.corners[0]));
  const mid: ObjectPoint = [
    pane.corners.reduce((sum, corner) => sum + corner[0], 0) / 4,
    pane.corners.reduce((sum, corner) => sum + corner[1], 0) / 4,
    pane.corners.reduce((sum, corner) => sum + corner[2], 0) / 4,
  ];
  return pane.corners.map((corner) => {
    const fromMid = sub(corner, mid);
    const du = dot(fromMid, along) >= 0 ? FRAME_WIDTH : -FRAME_WIDTH;
    const dv = dot(fromMid, across) >= 0 ? FRAME_WIDTH : -FRAME_WIDTH;
    return [
      corner[0] + along[0] * du + across[0] * dv,
      corner[1] + along[1] * du + across[1] * dv,
      corner[2] + along[2] * du + across[2] * dv,
    ] as ObjectPoint;
  });
}

function sideLightOuter(id: "left" | "right"): ObjectPoint[] {
  const pane = dc3AirframeSurface.sideLights.find((entry) => entry.id === id);
  if (!pane) throw new Error(`DC-3 side light ${id} missing`);
  return expandSideLight(pane);
}

const SIDE_SKIN_AFT = Math.min(
  ...dc3AirframeSurface.sideLights.flatMap((pane) => expandSideLight(pane).map((corner) => corner[2])),
);
const SIDE_SKIN_FORE = Math.max(
  ...dc3AirframeSurface.sideLights.flatMap((pane) => expandSideLight(pane).map((corner) => corner[2])),
);
/** Салонный шпангоут, с которого борт сходится на заднюю раму иллюминатора. */
const CABIN_JOIN_Z = fuselage.stations.find((station) => Math.abs(station.z - 5.15) < 1e-9)?.z
  ?? 5.15;
const RIGHT_AFT_HEAD_ANGLE = sectionAngle(sideLightOuter("right")[2]);
const LEFT_AFT_HEAD_ANGLE = sectionAngle(sideLightOuter("left")[2]);

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
  const bayHasWindshield = zLow < WINDSHIELD_Z_AFT + 1e-9 && zHigh > WINDSHIELD_Z_FORE - 1e-9;
  for (let gore = 0; gore < FUSELAGE_GORES; gore += 1) {
    const angleFrom = ((gore * FUSELAGE_GORE_STEP) / fuselage.ringCount) * TAU;
    const angleTo = (((gore + 1) * FUSELAGE_GORE_STEP) / fuselage.ringCount) * TAU;
    const goreAngles = Array.from(
      { length: FUSELAGE_GORE_STEP + 1 },
      (_, step) => angleFrom + ((angleTo - angleFrom) * step) / FUSELAGE_GORE_STEP,
    );
    const id = `fuselage:bay${bayIndex}:gore${gore}`;
    const splitWindshield = bayHasWindshield && goreCoversWindshield(angleFrom, angleTo);
    const greenhouseCheek = gore === 0 || gore === 1 || gore === 3 || gore === 4;
    const roofEndZ = greenhouseCheek ? SIDE_SKIN_AFT : ROOF_TO_BROW_Z;
    // Салонный отсек раньше резался ножом на задней раме, и обвод стойки
    // читался фланцем в той же плоскости. Теперь gore 0/4 и нижняя половина
    // gore 1/3 кончаются на шпангоуте 5.15 — дальше борт сходится на раму
    // по лофту. Верх gore 1/3 (висок) по-прежнему до рамы: его забирает купол.
    // В носовом отсеке gore 0/4 целиком заменены одним клином от колпака
    // до салона: верх по порогу иллюминатора, без отдельной накладки.
    const trimGreenhouse = greenhouseCheek
      && zLow < SIDE_SKIN_AFT + 1e-9
      && zHigh > SIDE_SKIN_AFT + 1e-9;
    const overlapsSideLight = zLow < SIDE_SKIN_FORE + 1e-9
      && zHigh > SIDE_SKIN_AFT - 1e-9;
    const emitGreenhouseGore = (
      bandId: string,
      zEnd: number,
      a0: number,
      a1: number,
      extras: readonly number[] = [],
      zStart?: number,
    ): void => {
      const rows = uniqueSorted([
        ...(zStart === undefined ? [] : [zStart]),
        ...sortedZs.filter((z) =>
          z <= zEnd + 1e-9
          && (zStart === undefined || z >= zStart - 1e-9)),
        zEnd,
      ]);
      if (rows.length < 2) return;
      const ringStep = TAU / fuselage.ringCount;
      const steps = Math.max(2, Math.round(Math.abs(a1 - a0) / ringStep));
      const angles = uniqueSorted([
        ...Array.from({ length: steps + 1 }, (_, step) => a0 + ((a1 - a0) * step) / steps),
        ...extras.filter((angle) =>
          angle >= Math.min(a0, a1) - 1e-9 && angle <= Math.max(a0, a1) + 1e-9),
      ]);
      emitFuselageBand(
        bandId,
        Math.min(...rows),
        Math.max(...rows),
        rows,
        a0,
        a1,
        angles,
        windowCuts,
      );
    };
    if (
      !trimGreenhouse
      && overlapsSideLight
      && (gore === 0 || gore === 4)
    ) {
      continue;
    }
    if (
      trimGreenhouse
      && gore === 0
    ) {
      emitGreenhouseGore(id, CABIN_JOIN_Z, angleFrom, angleTo, [
        sectionAngle(loftPointAtY(CABIN_JOIN_Z, sideLightOuter("right")[1][1], 1)),
      ]);
      continue;
    }
    if (
      trimGreenhouse
      && gore === 4
    ) {
      emitGreenhouseGore(id, CABIN_JOIN_Z, angleFrom, angleTo, [
        sectionAngle(loftPointAtY(CABIN_JOIN_Z, sideLightOuter("left")[1][1], -1)),
      ]);
      continue;
    }
    if (
      trimGreenhouse
      && gore === 1
      && RIGHT_AFT_HEAD_ANGLE > angleFrom + 1e-6
      && RIGHT_AFT_HEAD_ANGLE < angleTo - 1e-6
    ) {
      emitGreenhouseGore(`${id}:cheek`, CABIN_JOIN_Z, angleFrom, RIGHT_AFT_HEAD_ANGLE, [
        RIGHT_AFT_HEAD_ANGLE,
      ]);
      emitGreenhouseGore(`${id}:temple`, SIDE_SKIN_AFT, RIGHT_AFT_HEAD_ANGLE, angleTo, [
        RIGHT_AFT_HEAD_ANGLE,
      ]);
      continue;
    }
    if (
      trimGreenhouse
      && gore === 3
      && LEFT_AFT_HEAD_ANGLE > angleFrom + 1e-6
      && LEFT_AFT_HEAD_ANGLE < angleTo - 1e-6
    ) {
      emitGreenhouseGore(`${id}:temple`, SIDE_SKIN_AFT, angleFrom, LEFT_AFT_HEAD_ANGLE, [
        LEFT_AFT_HEAD_ANGLE,
      ]);
      emitGreenhouseGore(`${id}:cheek`, CABIN_JOIN_Z, LEFT_AFT_HEAD_ANGLE, angleTo, [
        LEFT_AFT_HEAD_ANGLE,
      ]);
      continue;
    }
    const zBands = (splitWindshield || trimGreenhouse)
      ? [
          sortedZs.filter((z) => z >= DECK_TO_SILL_Z - 1e-9),
          uniqueSorted([
            ...sortedZs.filter((z) => z <= roofEndZ + 1e-9),
            roofEndZ,
          ]),
        ].filter((rows) => rows.length >= 2)
      : [sortedZs];
    for (const [bandIndex, rows] of zBands.entries()) {
      emitFuselageBand(
        zBands.length === 1 ? id : `${id}:z${bandIndex}`,
        Math.min(...rows),
        Math.max(...rows),
        rows,
        angleFrom,
        angleTo,
        goreAngles,
        windowCuts,
      );
    }
  }
}

{
  const panes = dc3AirframeSurface.windshields;
  const expand = (
    corners: readonly ObjectPoint[],
    along: ObjectPoint,
    across: ObjectPoint,
    margin: number,
  ): ObjectPoint[] => {
    const mid: ObjectPoint = [
      corners.reduce((sum, corner) => sum + corner[0], 0) / corners.length,
      corners.reduce((sum, corner) => sum + corner[1], 0) / corners.length,
      corners.reduce((sum, corner) => sum + corner[2], 0) / corners.length,
    ];
    return corners.map((corner) => {
      const fromMid = sub(corner, mid);
      const u = dot(fromMid, along);
      const v = dot(fromMid, across);
      const du = u >= 0 ? margin : -margin;
      const dv = v >= 0 ? margin : -margin;
      return [
        corner[0] + along[0] * du + across[0] * dv,
        corner[1] + along[1] * du + across[1] * dv,
        corner[2] + along[2] * du + across[2] * dv,
      ] as ObjectPoint;
    });
  };
  const emitPlanarQuad = (
    id: string,
    group: string,
    corners: readonly ObjectPoint[],
    inward: number,
    material: ObjectMaterialId,
  ): void => {
    const along = sub(corners[3], corners[0]);
    const across = sub(corners[1], corners[0]);
    let normal = norm(cross(across, along));
    if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]];
    const inset = corners.map((corner) => [
      corner[0] - normal[0] * inward,
      corner[1] - normal[1] * inward,
      corner[2] - normal[2] * inward,
    ] as ObjectPoint);
    const axis: ObjectPoint = [0, (inset[0][1] + inset[3][1]) / 2, (inset[0][2] + inset[3][2]) / 2];
    emitPanel(id, group, [[inset[0], inset[1]], [inset[3], inset[2]]], [axis, axis], material);
  };

  const holes = panes.map((pane) => {
    const [, , , headIn] = pane.corners;
    const along = norm(sub(headIn, pane.corners[0]));
    const across = norm(sub(pane.corners[1], pane.corners[0]));
    return {
      id: pane.id,
      corners: pane.corners,
      outer: expand(pane.corners, along, across, FRAME_WIDTH),
    };
  });
  const right = holes.find((hole) => hole.id === "right");
  const left = holes.find((hole) => hole.id === "left");
  if (!right || !left) throw new Error("DC-3 windshields: both panes required");
  const mullionBottom: ObjectPoint = [
    (left.outer[0][0] + right.outer[0][0]) / 2,
    (left.outer[0][1] + right.outer[0][1]) / 2,
    (left.outer[0][2] + right.outer[0][2]) / 2,
  ];
  const crownAngle = Math.PI / 2;
  const ringStep = TAU / fuselage.ringCount;
  const sill = dc3AirframeSurface.greenhouseSill;
  const deckStation = fuselageStationAt(sill.apex[2]);
  const deckAngleOf = (sample: ObjectPoint): number => {
    const cosine = Math.max(-1, Math.min(1, sample[0] / deckStation.halfWidth));
    return Math.acos(cosine);
  };
  const ringAngles = uniqueSorted(
    Array.from({ length: fuselage.ringCount }, (_, index) =>
      (index / fuselage.ringCount) * TAU),
  );
  const deckCrown = fuselage.pointAt(deckStation, crownAngle);
  const pointOnPoly = (
    poly: readonly ObjectPoint[],
    t: number,
  ): ObjectPoint => {
    const clamped = Math.min(1, Math.max(0, t));
    const segs = poly.length - 1;
    const scaled = clamped * segs;
    const index = Math.min(segs - 1, Math.floor(scaled));
    return lerp(poly[index], poly[index + 1], scaled - index);
  };
  const emitSillFairing = (
    id: string,
    sillOut: ObjectPoint,
    sillIn: ObjectPoint,
  ): void => {
    const outAngle = deckAngleOf(sillOut);
    const outSnap = ringAngles.reduce((best, angle) =>
      Math.abs(angle - outAngle) < Math.abs(best - outAngle) ? angle : best);
    const angles = uniqueSorted(
      ringAngles.filter((angle) =>
        angle >= Math.min(outSnap, crownAngle) - 1e-9
        && angle <= Math.max(outSnap, crownAngle) + 1e-9),
    );
    const span = crownAngle - outSnap;
    const deckRow = angles.map((angle) =>
      Math.abs(angle - crownAngle) < 1e-9
        ? deckCrown
        : fuselage.pointAt(deckStation, angle));
    const sillRow = angles.map((angle) => {
      const t = Math.abs(span) < 1e-9 ? 1 : (angle - outSnap) / span;
      return pointOnPoly([sillOut, sillIn, mullionBottom], t);
    });
    emitPanel(
      id,
      "fuselage-panels",
      [deckRow, sillRow],
      [
        [0, sill.apex[1] - 0.25, sill.apex[2]],
        [0, mullionBottom[1] - 0.25, mullionBottom[2]],
      ],
    );
  };
  emitSillFairing(
    "fuselage:windshield:sill-fairing-left",
    left.outer[1],
    left.outer[0],
  );
  emitSillFairing(
    "fuselage:windshield:sill-fairing-right",
    right.outer[1],
    right.outer[0],
  );

  const leftSide = sideLightOuter("left");
  const rightSide = sideLightOuter("right");
  // Лоб: не плоская крышка в V рам, а панель, чья передняя кромка — шеврон
  // наружных бровей (как на Flagship Detroit), дальше по образующим на
  // кольцо 5.8. Плоский visor-треугольник больше не кладём.
  const browFront: ObjectPoint[] = [
    left.outer[2],
    left.outer[3],
    lerp(left.outer[3], right.outer[3], 0.5),
    right.outer[3],
    right.outer[2],
  ];
  const blendToEdge = (
    loftPoint: ObjectPoint,
    edge: ObjectPoint,
    v: number,
  ): ObjectPoint => {
    const onto = Math.max(0, (v - 0.55) / 0.45);
    const s = onto * onto * (3 - 2 * onto);
    return lerp(loftPoint, edge, s);
  };
  const emitDomeGrid = (id: string, grid: readonly (readonly ObjectPoint[])[]): void => {
    emitPanel(
      id,
      "fuselage-panels",
      grid,
      grid.map((row) => {
        const z = row[Math.floor(row.length / 2)][2];
        const station = fuselageStationAt(z);
        return [0, (station.crown + station.keel) / 2, z] as ObjectPoint;
      }),
    );
  };
  const snapAng = (ang: number): number => Math.round(ang / ringStep) * ringStep;
  const visorAt = (
    front: ObjectPoint,
    z: number,
    roofAng = snapAng(sectionAngle(front)),
  ): ObjectPoint => {
    const frontAng = sectionAngle(front);
    const span = front[2] - ROOF_TO_BROW_Z;
    const v = Math.abs(span) < 1e-9 ? 1 : (z - ROOF_TO_BROW_Z) / span;
    const ang = roofAng + (frontAng - roofAng) * Math.min(1, Math.max(0, v));
    const loftPoint = fuselage.pointAt(fuselageStationAt(z), ang);
    if (v <= 0) return loftPoint;
    return blendToEdge(loftPoint, front, Math.min(1, v));
  };
  // Образующая — угол шеврона, не равномерный t: иначе колонка 72°
  // садится на внутреннюю бровь (88°) и у наружной стойки остаётся дыра.
  const chevronPointAtAngle = (angle: number): ObjectPoint => {
    const samples = browFront.map((point) => ({ point, angle: sectionAngle(point) }));
    if (angle >= samples[0].angle - 1e-9) return samples[0].point;
    const last = samples[samples.length - 1];
    if (angle <= last.angle + 1e-9) return last.point;
    for (let index = 0; index < samples.length - 1; index += 1) {
      const from = samples[index];
      const to = samples[index + 1];
      if ((angle - to.angle) * (from.angle - angle) >= -1e-12) {
        const span = from.angle - to.angle;
        const t = Math.abs(span) < 1e-9 ? 1 : (from.angle - angle) / span;
        return lerp(from.point, to.point, t);
      }
    }
    return last.point;
  };
  // Задний ряд — выборки овала 5.8 от наружной образующей до наружной,
  // не три колонки в корону: иначе хорда 54°→90° оставляет квадрат.
  const leftRoofAng = snapAng(sectionAngle(left.outer[2]));
  const rightRoofAng = snapAng(sectionAngle(right.outer[2]));
  const roofFrom = Math.min(leftRoofAng, rightRoofAng);
  const roofTo = Math.max(leftRoofAng, rightRoofAng);
  const roofAngles = uniqueSorted(
    Array.from({ length: fuselage.ringCount }, (_, index) => index * ringStep)
      .filter((angle) => angle >= roofFrom - 1e-9 && angle <= roofTo + 1e-9),
  );
  const visorAngles = uniqueSorted([
    ...roofAngles,
    ...browFront.map((point) => sectionAngle(point)),
    ...[1 / 3, 2 / 3].flatMap((t) => [
      sectionAngle(lerp(left.outer[2], left.outer[3], t)),
      sectionAngle(lerp(right.outer[3], right.outer[2], t)),
    ]),
  ]);
  const visorRows = 5;
  const visorOutZs = (frontZ: number): number[] =>
    Array.from({ length: visorRows }, (_, row) => {
      const v = row / (visorRows - 1);
      return ROOF_TO_BROW_Z + (frontZ - ROOF_TO_BROW_Z) * v;
    });
  emitDomeGrid(
    "fuselage:windshield:visor-fairing",
    Array.from({ length: visorRows }, (_, row) => {
      const v = row / (visorRows - 1);
      return visorAngles.map((roofAng) => {
        const front = chevronPointAtAngle(roofAng);
        return visorAt(
          front,
          ROOF_TO_BROW_Z + (front[2] - ROOF_TO_BROW_Z) * v,
          roofAng,
        );
      });
    }),
  );
  // Прямоугольники за лбом: висок кончается на 5.55, лоб начинается на 5.8.
  // Две колонки давали хорду 54°→72°, а задняя кромка лба уже овальная —
  // щель по профилю. Колонки — те же углы, что у лба в этом секторе:
  // лофт встык, не хорда.
  const gore2From = (2 / FUSELAGE_GORES) * TAU;
  const gore2To = (3 / FUSELAGE_GORES) * TAU;
  const roofCloseZs = uniqueSorted([
    SIDE_SKIN_AFT,
    SIDE_SKIN_AFT + (ROOF_TO_BROW_Z - SIDE_SKIN_AFT) / 3,
    SIDE_SKIN_AFT + (ROOF_TO_BROW_Z - SIDE_SKIN_AFT) * 2 / 3,
    ROOF_TO_BROW_Z,
  ]);
  const emitRoofClose = (id: string, from: number, to: number): void => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const angles = uniqueSorted(
      visorAngles.filter((angle) => angle >= lo - 1e-9 && angle <= hi + 1e-9),
    );
    emitDomeGrid(id, roofCloseZs.map((z) =>
      angles.map((angle) => {
        if (Math.abs(z - ROOF_TO_BROW_Z) < 1e-9) {
          return visorAt(chevronPointAtAngle(angle), z, angle);
        }
        return fuselage.pointAt(fuselageStationAt(z), angle);
      })));
  };
  emitRoofClose(
    "fuselage:windshield:roof-close-fairing-right",
    rightRoofAng,
    gore2From,
  );
  emitRoofClose(
    "fuselage:windshield:roof-close-fairing-left",
    gore2To,
    leftRoofAng,
  );
  const emitSideDome = (
    id: string,
    headAft: ObjectPoint,
    headFore: ObjectPoint,
    browOut: ObjectPoint,
  ): void => {
    const cols = 5;
    const zs = uniqueSorted([
      SIDE_SKIN_AFT,
      SIDE_SKIN_AFT + (headFore[2] - SIDE_SKIN_AFT) * 0.33,
      ...visorOutZs(headFore[2]),
      headFore[2],
    ]);
    emitDomeGrid(id, zs.map((z, row) => {
      const v = zs.length < 2 ? 1 : row / (zs.length - 1);
      const tHead = (z - headAft[2]) / Math.max(headFore[2] - headAft[2], 1e-9);
      const head = lerp(headAft, headFore, Math.min(1, Math.max(0, tHead)));
      const brow = visorAt(browOut, z);
      return Array.from({ length: cols }, (_, column) => {
        const u = column / (cols - 1);
        if (column === 0) return head;
        if (column === cols - 1) return brow;
        const headAng = sectionAngle(head);
        const browAng = sectionAngle(brow);
        const angle = headAng + (browAng - headAng) * u;
        const loftPoint = fuselage.pointAt(fuselageStationAt(z), angle);
        return blendToEdge(loftPoint, lerp(head, brow, u), v);
      });
    }));
  };
  emitSideDome(
    "fuselage:windshield:dome-fairing-left",
    leftSide[2],
    leftSide[3],
    left.outer[2],
  );
  emitSideDome(
    "fuselage:windshield:dome-fairing-right",
    rightSide[2],
    rightSide[3],
    right.outer[2],
  );

  // Обвод задней стойки: борт идёт от салонного шпангоута 5.15 по лофту на
  // наружную раму. Порог стойки чуть в нос от брови, поэтому рама на лофте
  // и сверху, и снизу — сход больше не складывается под стекло. Нижний край
  // стыкуется с обводом порога.
  const emitAftFairing = (
    id: string,
    head: ObjectPoint,
    sill: ObjectPoint,
    side: 1 | -1,
  ): void => {
    const rows = 8;
    const headAng = sectionAngle(head);
    const seamAngle = side > 0
      ? (1 / FUSELAGE_GORES) * TAU
      : (4 / FUSELAGE_GORES) * TAU;
    const cabinSeam = fuselage.pointAt(fuselageStationAt(CABIN_JOIN_Z), seamAngle);
    const cabinTop = fuselage.pointAt(fuselageStationAt(CABIN_JOIN_Z), headAng);
    const spanY = cabinTop[1] - sill[1];
    const seamT = Math.abs(spanY) < 1e-9
      ? 0.5
      : (cabinTop[1] - cabinSeam[1]) / spanY;
    const ts = uniqueSorted([
      0,
      1 / 6,
      2 / 6,
      3 / 6,
      4 / 6,
      5 / 6,
      1,
      ...(seamT > 0.02 && seamT < 0.98 ? [seamT] : []),
    ]);
    emitDomeGrid(id, Array.from({ length: rows }, (_, row) => {
      const v = row / (rows - 1);
      const onto = Math.max(0, (v - 0.5) / 0.5);
      const ease = onto * onto * (3 - 2 * onto);
      return ts.map((t) => {
        const onFrame = lerp(head, sill, t);
        const z = CABIN_JOIN_Z + (onFrame[2] - CABIN_JOIN_Z) * v;
        const top = fuselage.pointAt(fuselageStationAt(z), headAng);
        const y = top[1] * (1 - t) + sill[1] * t;
        const onLoft = row === 0 && Math.abs(t - seamT) < 1e-6
          ? cabinSeam
          : t < 1e-6
            ? top
            : loftPointAtY(z, y, side);
        return lerp(onLoft, onFrame, ease);
      });
    }));
  };
  emitAftFairing(
    "fuselage:windshield:aft-fairing-left",
    leftSide[2],
    leftSide[1],
    -1,
  );
  emitAftFairing(
    "fuselage:windshield:aft-fairing-right",
    rightSide[2],
    rightSide[1],
    1,
  );

  // Тот же носовой клин gore 0/4: верх по порогу иллюминатора (не по
  // постоянному углу — иначе кромка лезет в стекло), до задней рамы и
  // дальше на салонный шпангоут 5.15. Отдельной юбки нет.
  const emitNoseCheek = (
    id: string,
    side: 1 | -1,
    equatorAngle: number,
    crownAngle: number,
    sillFore: ObjectPoint,
    sillAft: ObjectPoint,
  ): void => {
    const sillY = sillAft[1];
    const zs = uniqueSorted([
      CABIN_JOIN_Z,
      CABIN_JOIN_Z + (sillAft[2] - CABIN_JOIN_Z) * 0.5,
      sillAft[2],
      sillAft[2] + (sillFore[2] - sillAft[2]) * 1 / 3,
      sillAft[2] + (sillFore[2] - sillAft[2]) * 2 / 3,
      sillFore[2],
      ...fuselage.stations
        .map((station) => station.z)
        .filter((z) => z >= CABIN_JOIN_Z - 1e-9),
    ]);
    const cols = 5;
    emitDomeGrid(id, zs.map((z) => {
      const alongSill = sillFore[2] - sillAft[2];
      const top = z > sillFore[2] + 1e-9
        ? fuselage.pointAt(fuselageStationAt(z), crownAngle)
        : Math.abs(z - sillAft[2]) < 1e-6
          ? sillAft
          : Math.abs(z - sillFore[2]) < 1e-6
            ? sillFore
            : z >= sillAft[2] - 1e-9 && z <= sillFore[2] + 1e-9 && Math.abs(alongSill) > 1e-9
              ? lerp(sillAft, sillFore, (z - sillAft[2]) / alongSill)
              : loftPointAtY(z, sillY, side);
      const topAng = sectionAngle(top);
      return Array.from({ length: cols }, (_, column) => {
        const u = column / (cols - 1);
        if (column === cols - 1) return top;
        const angle = equatorAngle + (topAng - equatorAngle) * u;
        return fuselage.pointAt(fuselageStationAt(z), angle);
      });
    }));
  };
  const gore0To = (1 / FUSELAGE_GORES) * TAU;
  const gore4From = (4 / FUSELAGE_GORES) * TAU;
  emitNoseCheek(
    "fuselage:bay0:gore0",
    1,
    0,
    gore0To,
    rightSide[0],
    rightSide[1],
  );
  emitNoseCheek(
    "fuselage:bay0:gore4",
    -1,
    TAU / 2,
    gore4From,
    leftSide[0],
    leftSide[1],
  );

  // Заглушка щели между лобовым и боковым — по наружным рамам, резкая как
  // стойка. Спуск в нос тоже резкий: не сглаживать сразу по обеим рамам.
  const emitCornerClose = (
    sideId: "left" | "right",
    windshield: typeof left,
    sideOuter: readonly ObjectPoint[],
    hullSide: 1 | -1,
  ): void => {
    const head = windshield.outer[2];
    const wSill = windshield.outer[1];
    const sSill = sideOuter[0];
    const midSill = lerp(wSill, sSill, 0.5);
    emitDomeGrid(`fuselage:windshield:corner-plug-fairing-${sideId}`, [
      [wSill, midSill, sSill],
      [
        lerp(wSill, head, 0.5),
        lerp(midSill, head, 0.5),
        lerp(sSill, head, 0.5),
      ],
      [
        lerp(wSill, head, 0.92),
        head,
        lerp(sSill, head, 0.92),
      ],
    ]);
    // Проём не прямоугольник и не радиальная юбка под порогом: это сектор
    // между нижней кромкой заглушки и первым кольцом колпака, снаружи
    // порожного треугольника и внутри gore 0/4. Передняя кромка — кольцо
    // колпака, встык к треугольнику и к щеке, не хорда в той же станции.
    const capZ = sill.apex[2];
    const outAngle = deckAngleOf(wSill);
    const outSnap = ringAngles.reduce((best, angle) =>
      Math.abs(angle - outAngle) < Math.abs(best - outAngle) ? angle : best);
    const deckOut = fuselage.pointAt(deckStation, outSnap);
    const goreAng = hullSide > 0 ? gore0To : gore4From;
    const cheekCap = fuselage.pointAt(fuselageStationAt(capZ), goreAng);
    const midAng = sectionAngle(midSill);
    const capMid = fuselage.pointAt(fuselageStationAt(capZ), midAng);
    const zFrom = Math.max(wSill[2], sSill[2]);
    const zs = uniqueSorted([
      zFrom + (capZ - zFrom) / 3,
      zFrom + (capZ - zFrom) * 2 / 3,
      capZ,
      ...fuselage.stations
        .map((station) => station.z)
        .filter((z) => z > zFrom + 0.02 && z <= capZ + 1e-9),
    ]);
    const inboardAt = (z: number): ObjectPoint => {
      const span = capZ - wSill[2];
      const t = Math.abs(span) < 1e-9 ? 1 : (z - wSill[2]) / span;
      return lerp(wSill, deckOut, Math.min(1, Math.max(0, t)));
    };
    emitDomeGrid(`fuselage:windshield:corner-nose-fairing-${sideId}`, [
      [wSill, midSill, sSill],
      ...zs.map((z) => [
        Math.abs(z - capZ) < 1e-9 ? deckOut : inboardAt(z),
        Math.abs(z - capZ) < 1e-9
          ? capMid
          : fuselage.pointAt(fuselageStationAt(z), midAng),
        Math.abs(z - capZ) < 1e-9
          ? cheekCap
          : fuselage.pointAt(fuselageStationAt(z), goreAng),
      ]),
    ]);
  };
  emitCornerClose("right", right, rightSide, 1);
  emitCornerClose("left", left, leftSide, -1);

  emitPlanarQuad(
    "windshield-mullion",
    "window-frame",
    [right.outer[0], left.outer[0], left.outer[3], right.outer[3]],
    0,
    "metal",
  );
  for (const hole of holes) {
    const [sillIn, sillOut, headOut, headIn] = hole.corners;
    const [sillInO, sillOutO, headOutO, headInO] = hole.outer;
    emitPlanarQuad(`windshield-${hole.id}:frame-sill`, "window-frame",
      [sillInO, sillOutO, sillOut, sillIn], 0, "metal");
    emitPlanarQuad(`windshield-${hole.id}:frame-head`, "window-frame",
      [headIn, headOut, headOutO, headInO], 0, "metal");
    emitPlanarQuad(`windshield-${hole.id}:frame-outboard`, "window-frame",
      [sillOut, sillOutO, headOutO, headOut], 0, "metal");
    emitPlanarQuad(`windshield-${hole.id}:frame-inboard`, "window-frame",
      [sillIn, sillInO, headInO, headIn], 0, "metal");
    emitPlanarQuad(`windshield-${hole.id}:glazing`, "window-glazing",
      [sillIn, sillOut, headOut, headIn], GLASS_INSET, "glazing");
  }
  for (const pane of dc3AirframeSurface.sideLights) {
    const along = norm(sub(pane.corners[3], pane.corners[0]));
    const across = norm(sub(pane.corners[1], pane.corners[0]));
    const outer = expand(pane.corners, along, across, FRAME_WIDTH);
    const [sillIn, sillOut, headOut, headIn] = pane.corners;
    const [sillInO, sillOutO, headOutO, headInO] = outer;
    emitPlanarQuad(`sidelight-${pane.id}:frame-sill`, "window-frame",
      [sillInO, sillOutO, sillOut, sillIn], 0, "metal");
    emitPlanarQuad(`sidelight-${pane.id}:frame-head`, "window-frame",
      [headIn, headOut, headOutO, headInO], 0, "metal");
    emitPlanarQuad(`sidelight-${pane.id}:frame-aft`, "window-frame",
      [sillOut, sillOutO, headOutO, headOut], 0, "metal");
    emitPlanarQuad(`sidelight-${pane.id}:frame-inboard`, "window-frame",
      [sillIn, sillInO, headInO, headIn], 0, "metal");
    emitPlanarQuad(`sidelight-${pane.id}:glazing`, "window-glazing",
      [sillIn, sillOut, headOut, headIn], GLASS_INSET, "glazing");
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

const noseCapParts: readonly ObjectLabPart[] = dc3BlockoutObject.parts
  .filter((part) => part.group === "nose-cap");

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
const allGroups = [...panelGroups, "cabin", "reference-loft", "nose-cap"] as const;
const hiddenExcept = (shown: readonly string[]): readonly string[] =>
  allGroups.filter((group) => !shown.includes(group));
const shownSkin = [...panelGroups, "nose-cap"] as const;

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
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-three-quarter",
    label: "Три четверти · панельная шкура целиком",
    projection: "perspective",
    position: point(24, 13, 20),
    target: point(0, 2.2, -5),
    fov: 32,
    hiddenGroups: hiddenExcept(shownSkin),
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
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-joint-detail",
    label: "Стык · кромка отсека и полосы по лонжеронам",
    projection: "perspective",
    position: point(6.6, 3.4, 1.6),
    target: point(5.2, 2.6, -1),
    fov: 26,
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-empennage",
    label: "Оперение · киль, стабилизатор, рули",
    projection: "perspective",
    position: point(8.5, 6.2, -3.2),
    target: point(0, 2.9, -11.4),
    fov: 32,
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-windows",
    label: "Иллюминаторы · настоящие проёмы, за ними кресла",
    projection: "perspective",
    position: point(6.4, 4.2, 5.6),
    target: point(1.25, 3.66, 2.09),
    fov: 30,
    hiddenGroups: hiddenExcept([...shownSkin, "cabin"]),
  },
  {
    id: "panel-windshield",
    label: "Фонарь · два центральных стекла в обшивке",
    projection: "perspective",
    position: point(5.8, 2.15, 12.6),
    target: point(0, 1.85, 7.1),
    fov: 28,
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-fuselage-detail",
    label: "Фюзеляж · продольные клинья и кольцевые стыки",
    projection: "perspective",
    position: point(4.6, 3.9, 5.4),
    target: point(0.4, 2.2, 0.6),
    fov: 34,
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-nacelle-detail",
    label: "Мотогондола · капотная оболочка панелями",
    projection: "perspective",
    position: point(8.6, 3.4, 5.2),
    target: point(5.79, 2.1, 0.6),
    fov: 30,
    hiddenGroups: hiddenExcept(shownSkin),
  },
  {
    id: "panel-silhouette",
    label: "Силуэт · профиль панельной шкуры",
    projection: "orthographic",
    position: point(-32, 2.8, -6.4),
    target: point(0, 2.8, -6.4),
    orthoHeight: 7.5,
    hiddenGroups: hiddenExcept(shownSkin),
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
  parts: [...parts, ...noseCapParts, ...cabinParts, ...referenceLofts],
  views,
};
