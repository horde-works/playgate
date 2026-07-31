import type { SceneVector3 } from "./destructionScene.ts";

/**
 * ГДЕ РОЖДАЕТСЯ ПОДЪЁМ И КОГДА ЕГО ХВАТАЕТ, ЧТОБЫ ДЕРЖАТЬ МАШИНУ
 *
 * Модуль отвечает на два вопроса, у которых для разных видов судов разные
 * ответы, но одна форма:
 *
 *   1. в какой точке приложена подъёмная сила;
 *   2. может ли уцелевший набор держать машину — по весу и по моменту.
 *
 * У ГАЗОВОЙ ОБОЛОЧКИ сила рождается в центре объёма. Он никуда не девается
 * при повреждении, поэтому дирижабль, потерявший мотор, продолжает висеть, а
 * плавно опуститься вниз может всегда — газ его держит без всякого управления.
 *
 * У ВИНТОКРЫЛОЙ МАШИНЫ подъём — это сами движители. Отсюда три следствия,
 * ни одно из которых не выводится из «доли уцелевших каналов»:
 *
 *   - потеряв одно кольцо из шести, машина летит дальше. Это не отказ;
 *   - точка приложения подъёма уезжает к оставшимся, и машина получает
 *     настоящий момент от асимметрии;
 *   - винт умеет только ТОЛКАТЬ. Значит удержать машину без крена уцелевший
 *     набор может тогда и только тогда, когда центр масс лежит внутри
 *     выпуклой оболочки уцелевших точек тяги. Выбило два соседних кольца на
 *     одном борту — центр масс вышел наружу, и никакая комбинация оставшихся
 *     его не удержит: машина обязана завалиться и падать кувыркаясь, а не
 *     «плавно опускаться с выключенными винтами».
 *
 * У ПОЕЗДА, СУДНА И АВТОМОБИЛЯ подъёма нет вовсе: их держит опора. Такая
 * машина объявляет `lift: "none"`, и оба вопроса ниже для неё не задаются.
 *
 * Модуль намеренно чистый: ни three, ни rapier, ни знания о конкретной машине.
 */

/** Источник подъёма. Свойство ВИДА судна, а не его имени. */
export type VehicleLiftSource = "buoyant" | "rotor" | "none";

export interface LiftPointState {
  /** Точка приложения в авторских координатах машины. */
  readonly point: SceneVector3;
  /** Доля тяги, которую эта точка ещё может дать: 0…1. */
  readonly available: number;
}

/** Итог: держит ли уцелевший набор машину и чем именно он не держит. */
export interface LiftHoldVerdict {
  /** Суммарной тяги хватает на вес. */
  readonly holdsWeight: boolean;
  /** Центр масс внутри выпуклой оболочки уцелевших точек. */
  readonly holdsAttitude: boolean;
  /** Доля веса, которую уцелевший набор способен поднять. */
  readonly liftToWeight: number;
}

const EPSILON = 1e-9;

type Point2 = readonly [number, number];

function cross(origin: Point2, first: Point2, second: Point2): number {
  return (
    (first[0] - origin[0]) * (second[1] - origin[1]) -
    (first[1] - origin[1]) * (second[0] - origin[0])
  );
}

/** Выпуклая оболочка в плане, обход Эндрю. Порядок — против часовой. */
export function convexHull(points: readonly Point2[]): readonly Point2[] {
  const unique = [...new Map(points.map((p) => [`${p[0]}:${p[1]}`, p])).values()];
  if (unique.length <= 2) {
    return unique;
  }
  const sorted = [...unique].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (source: readonly Point2[]): Point2[] => {
    const chain: Point2[] = [];
    for (const point of source) {
      while (
        chain.length >= 2 &&
        cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
      ) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * Лежит ли точка внутри выпуклой оболочки, с запасом `margin`.
 *
 * Запас не косметический: центр масс РОВНО на кромке означает, что удержание
 * требует бесконечной тяги одного крайнего движителя. Машина, у которой центр
 * масс подошёл к кромке вплотную, уже не держится.
 */
export function isInsideConvexHull(
  target: Point2,
  points: readonly Point2[],
  margin = 0,
): boolean {
  const hull = convexHull(points);
  if (hull.length < 3) {
    return false;
  }
  for (let index = 0; index < hull.length; index += 1) {
    const current = hull[index];
    const next = hull[(index + 1) % hull.length];
    const edgeX = next[0] - current[0];
    const edgeY = next[1] - current[1];
    const length = Math.hypot(edgeX, edgeY);
    if (length < EPSILON) {
      continue;
    }
    // Оболочка обходится против часовой, поэтому «внутри» — слева от каждой
    // кромки. Знаковое расстояние до кромки и сравнивается с запасом.
    const distance =
      ((target[0] - current[0]) * edgeY - (target[1] - current[1]) * edgeX) /
      length;
    if (-distance < margin) {
      return false;
    }
  }
  return true;
}

/**
 * Точка приложения подъёма.
 *
 * Для газовой оболочки это авторский центр объёма, и он НЕ двигается: §6.2
 * контракта запрещает бегать за центром масс, иначе повреждение перестаёт
 * быть наблюдаемым. Для винтокрылой машины формула та же по смыслу — «там,
 * где сила рождается», — но рождается она в движителях, поэтому горизонталь
 * берётся из уцелевших точек, а высота остаётся паспортной.
 */
export function liftApplicationPoint(
  source: VehicleLiftSource,
  authoredCentre: SceneVector3,
  points: readonly LiftPointState[],
): SceneVector3 {
  if (source !== "rotor") {
    return authoredCentre;
  }
  let weight = 0;
  let x = 0;
  let z = 0;
  for (const entry of points) {
    const share = Math.max(0, entry.available);
    if (share <= EPSILON) {
      continue;
    }
    weight += share;
    x += entry.point[0] * share;
    z += entry.point[2] * share;
  }
  if (weight <= EPSILON) {
    return authoredCentre;
  }
  return [x / weight, authoredCentre[1], z / weight];
}

/**
 * Может ли уцелевший набор держать машину.
 *
 * `capacity` — подъём, который даёт ОДНА полностью исправная точка, в тех же
 * единицах, что и `weight`.
 */
export function liftHoldVerdict(
  source: VehicleLiftSource,
  points: readonly LiftPointState[],
  centreOfMass: SceneVector3,
  capacity: number,
  weight: number,
  margin = 0.05,
): LiftHoldVerdict {
  if (source !== "rotor") {
    // Газовая оболочка держит машину сама, а опорная машина стоит на опоре:
    // вопрос о геометрии удержания для них не возникает.
    return { holdsWeight: true, holdsAttitude: true, liftToWeight: 1 };
  }
  const available = points.reduce(
    (sum, entry) => sum + Math.max(0, entry.available),
    0,
  );
  const liftToWeight = weight > EPSILON ? (available * capacity) / weight : 0;
  const live = points.filter((entry) => entry.available > EPSILON);
  return {
    holdsWeight: liftToWeight >= 1,
    holdsAttitude: isInsideConvexHull(
      [centreOfMass[0], centreOfMass[2]],
      live.map((entry) => [entry.point[0], entry.point[2]] as Point2),
      margin,
    ),
    liftToWeight,
  };
}

/**
 * Исход для машины, у которой подъём делают движители.
 *
 * Три состояния вместо двух — прямое следствие того, что подъём активен:
 *
 *   `flying`   — держит и вес, и позу. Это НЕ отказ: пять колец из шести
 *                справляются, и объявлять рейс несостоявшимся не за что;
 *   `sinking`  — позу держит, веса не хватает: управляемое снижение с
 *                работающими движителями, место посадки машина ещё выбирает;
 *   `tumbling` — позу не держит: падение. Никакой мягкой посадки, никакого
 *                выбора места — уцелевшие движители физически не могут
 *                удержать машину горизонтально.
 */
export type RotorLiftState = "flying" | "sinking" | "tumbling";

export function rotorLiftState(verdict: LiftHoldVerdict): RotorLiftState {
  if (!verdict.holdsAttitude) {
    return "tumbling";
  }
  return verdict.holdsWeight ? "flying" : "sinking";
}

/**
 * ПОСАДКА ВИНТОКРЫЛОЙ МАШИНЫ — не швартовка.
 *
 * У коптера нет ни мачты, ни причального захвата, ни носового узла: их
 * заменяет ровно то, что делает автоматика настоящего дрона. Проверяется
 * четыре вещи, и все они физические:
 *
 *   1. машина НАД местом — в пределах радиуса площадки, а не в сантиметрах;
 *   2. под ней есть настоящая опора (contacts) либо она уже почти у земли;
 *   3. она не летит вбок — путевая скорость мала;
 *   4. она стоит ровно.
 *
 * Дальше моторы выключаются касанием. Курс НЕ проверяется вовсе: коптеру
 * безразлично, каким боком он сел, и требовать от него причального курса —
 * значит списывать правило с дирижабля.
 */
export interface RotorLandingTolerance {
  /** Радиус площадки: попал в него — сел. */
  readonly radius: number;
  /** Высота, ниже которой опора уже считается достижимой. */
  readonly height: number;
  readonly speed: number;
  readonly verticalSpeed: number;
  readonly uprightCos: number;
  readonly angularSpeed: number;
}

export function isRotorLandingComplete(
  tolerance: RotorLandingTolerance,
  offset: { readonly horizontal: number; readonly height: number },
  motion: {
    readonly speed: number;
    readonly verticalSpeed: number;
    readonly uprightCos: number;
    readonly angularSpeed: number;
  },
  supportContacts: number,
): boolean {
  return (
    offset.horizontal <= tolerance.radius &&
    offset.height <= tolerance.height &&
    (supportContacts > 0 || offset.height <= tolerance.height * 0.35) &&
    motion.speed <= tolerance.speed &&
    Math.abs(motion.verticalSpeed) <= tolerance.verticalSpeed &&
    motion.uprightCos >= tolerance.uprightCos &&
    motion.angularSpeed <= tolerance.angularSpeed
  );
}
