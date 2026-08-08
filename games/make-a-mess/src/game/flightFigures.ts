import type { SceneVector3 } from "./destructionScene.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionAboutAxis,
  rotateVector,
  type Quaternion,
} from "./clusterDynamics.ts";

/**
 * ФИГУРЫ ВЫСШЕГО ПИЛОТАЖА КАК РАСПИСАНИЕ ПОЗЫ.
 *
 * Фигура — НЕ участок трассы, и это главное решение модуля.
 *
 * Трасса в проекте устроена как горизонтальная кривая плюс требование высоты, а
 * прогресс по ней продвигается ПРОЕКЦИЕЙ НА ГОРИЗОНТАЛЬ (`measureAxes: [0, 2]`).
 * Петля этого не переживает дважды: она возвращается в ту же точку по земле,
 * то есть не является функцией горизонтального положения, и на вертикальном
 * куске горизонтальная проекция равна нулю — прогресс не сдвинулся бы никогда,
 * машина зависла бы на первой же точке фигуры.
 *
 * Поэтому у фигуры СВОЙ прогресс, по длине её собственной дуги в трёх
 * измерениях. Трасса на это время замирает и продолжается ровно с того места,
 * где остановилась. Ни одного правила трассы при этом менять не требуется.
 *
 * И второе решение: фигура задаёт ПОЗУ, а не путь. Кватернион, а не углы —
 * потому что в петле тангаж проходит через 180°, где параметризация
 * «тангаж-крен» вырождается. Путь получается сам, из позы и тяги: машина не
 * ведётся по кривой, она поворачивается и летит туда, куда её толкают кольца.
 */

export type FlightFigureKind = "loop" | "immelmann";

/**
 * Что машина может, в величинах фигуры. Всё выводится из паспорта и НИЧЕГО не
 * берётся на глаз: обе перегрузки — прямое следствие того, что винт толкает
 * только в одну сторону.
 */
export interface FlightFigureCapability {
  /**
   * Располагаемое ускорение к центру в НИЖНЕЙ точке, м/с². Кольца смотрят
   * вверх, вес вычитается: `(T − 1)·g`. Это и есть связывающее число фигуры.
   */
  readonly uprightCentripetal: number;
  /**
   * То же в ВЕРХНЕЙ точке, вверх ногами: тяга смотрит к центру петли и
   * складывается с весом, `(T + 1)·g`. Втрое больше нижней — оттого петля у
   * этой машины и получается яйцом остриём вверх.
   */
  readonly invertedCentripetal: number;
  /**
   * УГЛОВОЕ УСКОРЕНИЕ ПО КРЕНУ, рад/с² — половина колец на полную, половина в
   * ноль, делённое на инерцию.
   *
   * Именно ускорение, а не темп, и это не педантизм. Первая редакция несла
   * ПИКОВЫЙ темп и считала по нему время переворота как по постоянному: время
   * вышло вдвое короче настоящего, а высота возврата — 0.42 м вместо 1.7.
   * Ошибка в безопасную сторону не бывает безопасной. Пик достигается лишь в
   * середине перекладки, и вывести его из ускорения можно, обратно — нет.
   */
  readonly rollAcceleration: number;
  /** То же по тангажу, рад/с². */
  readonly pitchAcceleration: number;
}

/** Мгновенное требование фигуры. */
export interface FlightFigureCommand {
  /** Поза корпуса в мире. */
  readonly attitude: Quaternion;
  /** Желаемая путевая скорость вдоль собственной дуги, м/с. */
  readonly speed: number;
  /**
   * Доля веса, которую машина ДОЛЖНА добавить сверх висения. На перевёрнутом
   * участке отрицательна и по построению недостижима — там фигура баллистична,
   * и это её честное свойство, а не отказ.
   */
  readonly liftFraction: number;
  /** Смещение от точки входа: вперёд по входному курсу, вверх, вбок. */
  readonly offset: SceneVector3;
}

export interface FlightFigurePlan {
  readonly kind: FlightFigureKind;
  readonly radius: number;
  readonly speed: number;
  /** Полная длина дуги, м. */
  readonly length: number;
  readonly seconds: number;
  /** Сколько высоты фигура забирает над точкой входа, м. */
  readonly ceiling: number;
  /** Чем фигура кончается: смещение и разворот курса, рад. */
  readonly exit: {
    readonly offset: SceneVector3;
    readonly headingTurn: number;
  };
  command(progress: number): FlightFigureCommand;
}

const HALF_TURN = Math.PI;
const FULL_TURN = Math.PI * 2;

/**
 * Время перекладки на полоборота: разгон до середины и торможение до конца.
 * Пиковый темп при этом равен `α · t/2` и достигается ровно в середине.
 */
export function halfTurnSeconds(angularAcceleration: number): number {
  return 2 * Math.sqrt(HALF_TURN / Math.max(angularAcceleration, 0.05));
}

/**
 * РАДИУС ФИГУРЫ ВЫВОДИТСЯ ИЗ СВЯЗЫВАЮЩЕЙ ТОЧКИ, а не назначается.
 *
 * Связывает низ: там кольца воюют с весом и дают `(T − 1)·g`, тогда как наверху
 * перевёрнутая тяга складывается с весом и даёт `(T + 1)·g`. Запас — чтобы
 * фигура не шла по пределу: на пределе любая ошибка становится сходом.
 */
export function figureRadius(
  speed: number,
  capability: FlightFigureCapability,
  margin = 1.6,
): number {
  const binding = Math.max(0.5, capability.uprightCentripetal);
  return (speed * speed * margin) / binding;
}

/**
 * Поза в точке фигуры. Ось тангажа — правый борт по соглашению проекта
 * (`pitchAxisOf(nose) = (−nz, nx)`), для носа вдоль +Z это −X.
 */
function pitchedAttitude(
  pitch: number,
  roll: number,
  nose: readonly [number, number],
): Quaternion {
  const starboard: SceneVector3 = [-nose[1], 0, nose[0]];
  const forward: SceneVector3 = [nose[0], 0, nose[1]];
  return normalizeQuaternion(
    multiplyQuaternions(
      quaternionAboutAxis(starboard, pitch),
      quaternionAboutAxis(forward, roll),
    ),
  );
}

/**
 * ПЕТЛЯ. Тангаж проходит полный оборот, машина возвращается в точку входа тем
 * же курсом и на той же высоте — поэтому её можно вставить в любое место
 * прямого участка, ничего в трассе не пересчитывая.
 *
 * Геометрия: центр петли строго над входом, положение относительно входа
 * `(R·sin θ, R − R·cos θ)`. На θ = π машина ровно НАД входом, вверх ногами и
 * летит назад; на θ = 2π — там же, где начала.
 */
function loopPlan(
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const length = FULL_TURN * radius;
  return {
    kind: "loop",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    ceiling: 2 * radius,
    exit: { offset: [0, 0, 0], headingTurn: 0 },
    command(progress) {
      const t = Math.max(0, Math.min(1, progress));
      const theta = t * FULL_TURN;
      const forward = radius * Math.sin(theta);
      const up = radius * (1 - Math.cos(theta));
      return {
        attitude: pitchedAttitude(theta, 0, nose),
        speed,
        // Требуемое центростремительное в долях веса: `v²/(R·g)`, направлено к
        // центру. Наверху центр внизу, поэтому знак меняется сам через позу —
        // здесь остаётся только величина.
        liftFraction: (speed * speed) / (radius * 9.81) - 1,
        offset: [forward * nose[0], up, forward * nose[1]],
      };
    },
  };
}

/**
 * ИММЕЛЬМАН: полупетля вверх, затем полубочка.
 *
 * Полубочка здесь — единственная бочка, у которой есть смысл: без неё выход
 * приходится на перевёрнутую машину, а перевёрнутая машина не держит вес
 * ничем. Ради этого она и делается, а не ради вида.
 *
 * Выход: строго над входом (полупетля не даёт горизонтального смещения —
 * `sin π = 0`), выше на два радиуса, курс развёрнут на 180°.
 */
function immelmannPlan(
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const loopLength = HALF_TURN * radius;
  // Полубочка идёт на той же скорости, поэтому её «длина» — путь за время
  // переворота. Держать машину в этот момент нечем: она падает, и это входит
  // в потребный запас высоты.
  const rollSeconds = halfTurnSeconds(capability.rollAcceleration);
  const rollLength = speed * rollSeconds;
  const length = loopLength + rollLength;
  const loopShare = loopLength / length;
  const rollDrop = 0.5 * 9.81 * rollSeconds * rollSeconds;
  return {
    kind: "immelmann",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    ceiling: 2 * radius,
    exit: { offset: [0, 2 * radius - rollDrop, 0], headingTurn: Math.PI },
    command(progress) {
      const t = Math.max(0, Math.min(1, progress));
      if (t <= loopShare) {
        const theta = (t / loopShare) * HALF_TURN;
        const forward = radius * Math.sin(theta);
        const up = radius * (1 - Math.cos(theta));
        return {
          attitude: pitchedAttitude(theta, 0, nose),
          speed,
          liftFraction: (speed * speed) / (radius * 9.81) - 1,
          offset: [forward * nose[0], up, forward * nose[1]],
        };
      }
      const rollProgress = (t - loopShare) / Math.max(1e-6, 1 - loopShare);
      const roll = rollProgress * HALF_TURN;
      const fallen = 0.5 * 9.81 * (rollProgress * rollSeconds) ** 2;
      // Тангаж остаётся на 180°: машина уже перевёрнута, крен доводит её до
      // ровной. После полубочки поза совпадает с ровной, но курс обратный.
      return {
        attitude: pitchedAttitude(HALF_TURN, roll, nose),
        speed,
        // Пока идёт переворот, держать нечем — просить подъём бессмысленно.
        liftFraction: 0,
        offset: [0, 2 * radius - fallen, 0],
      };
    },
  };
}

export function planFlightFigure(
  kind: FlightFigureKind,
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
): FlightFigurePlan {
  return kind === "loop"
    ? loopPlan(speed, capability, nose)
    : immelmannPlan(speed, capability, nose);
}

/**
 * ВОРОТА ВХОДА — они же замена угловому порогу.
 *
 * Фигура не «пробуется и авось выйдет»: если её нечем закончить, она
 * ПРОПУСКАЕТСЯ. Проверяется ровно то, что делает её невозможной, и ничего
 * сверх: хватает ли хода, чтобы она вообще имела форму; хватает ли высоты
 * снизу, чтобы вернуться из перевёрнутого; хватает ли неба сверху; и цела ли
 * машина настолько, чтобы её вести.
 */
export interface FlightFigureGate {
  readonly speed: number;
  /** Высота над опорой, м. */
  readonly heightAboveGround: number;
  /** Потолок мира над машиной, м. */
  readonly headroom: number;
  /** Доля доставленного по слабейшему каналу: 1 — машина цела. */
  readonly authority: number;
}

export interface FlightFigureVerdict {
  readonly flyable: boolean;
  readonly reason: string | null;
}

/** Ниже этого хода фигура вырождается: радиус меньше габарита машины. */
export const FIGURE_MINIMUM_SPEED = 8;
/** Меньше этой доли доставленного фигуру не начинают. */
export const FIGURE_MINIMUM_AUTHORITY = 0.85;

export function flightFigureVerdict(
  plan: FlightFigurePlan,
  gate: FlightFigureGate,
  capability: FlightFigureCapability,
): FlightFigureVerdict {
  if (gate.speed < FIGURE_MINIMUM_SPEED) {
    return { flyable: false, reason: "ход мал" };
  }
  if (gate.authority < FIGURE_MINIMUM_AUTHORITY) {
    return { flyable: false, reason: "недобор власти" };
  }
  if (gate.headroom < plan.ceiling) {
    return { flyable: false, reason: "не хватает неба" };
  }
  // ВОЗВРАТ ИЗ ПЕРЕВЁРНУТОГО — вот честная нижняя граница. Полбочки на
  // выравнивание, свободное падение за это время, и гашение набранной
  // вертикальной скорости располагаемым избытком тяги.
  const recovery = invertedRecoveryHeight(capability);
  if (gate.heightAboveGround < recovery) {
    return { flyable: false, reason: "не хватает высоты на возврат" };
  }
  return { flyable: true, reason: null };
}

/** Высота, которую отнимает возврат из перевёрнутого. Наружу — для телеметрии. */
export function invertedRecoveryHeight(
  capability: FlightFigureCapability,
): number {
  const rollSeconds = halfTurnSeconds(capability.rollAcceleration);
  const vertical = 9.81 * rollSeconds;
  return (
    0.5 * 9.81 * rollSeconds * rollSeconds +
    (vertical * vertical) / (2 * Math.max(1, capability.uprightCentripetal))
  );
}

/** Куда смотрит нос при этой позе — для телеметрии и проверок. */
export function figureNoseDirection(
  attitude: Quaternion,
  nose: SceneVector3,
): SceneVector3 {
  return rotateVector(attitude, nose);
}
