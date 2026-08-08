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
   * складывается с весом, `(T + 1)·g`. У RAX это 51.0 против 31.4 — в полтора
   * раза больше, оттого петля у него и получается яйцом остриём вверх.
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

/**
 * Что нужно знать о машине, чтобы вывести её фигурные способности. Ровно те же
 * поля, которыми живёт микшер, — иначе паспорт фигуры разошёлся бы с физикой.
 */
export interface FigureCapabilitySource {
  readonly points: readonly SceneVector3[];
  readonly centreOfMass: SceneVector3;
  readonly nose: SceneVector3;
  readonly mass: number;
  /** [крен, рыскание, тангаж] — как в `RotorcraftMachine`. */
  readonly inertia: readonly [number, number, number];
  readonly liftCapacity: number;
  readonly capacityWeights?: readonly number[] | null;
}

/**
 * СПОСОБНОСТИ ВЫВОДЯТСЯ ИЗ ПАСПОРТА, а не назначаются числом.
 *
 * Перегрузки — прямое следствие того, что винт толкает в одну сторону: внизу
 * тяга воюет с весом, наверху складывается с ним. Угловые ускорения — предельный
 * момент, делённый на инерцию, где предельный момент берётся честной крайней
 * раскладкой: кольца с плечом одного знака на полную, остальные в ноль. Больше
 * этой машине взять неоткуда, меньше — незачем.
 */
export function figureCapabilityOf(
  machine: FigureCapabilitySource,
): FlightFigureCapability {
  const hover = machine.mass * GRAVITY;
  const reserve = hover > 1e-6 ? machine.liftCapacity / hover : 1;
  const noseLength = Math.hypot(machine.nose[0], machine.nose[2]) || 1;
  const forward: readonly [number, number] = [
    machine.nose[0] / noseLength,
    machine.nose[2] / noseLength,
  ];
  const starboard: readonly [number, number] = [-forward[1], forward[0]];
  const weightSum =
    machine.capacityWeights?.reduce((sum, value) => sum + value, 0) ??
    machine.points.length;
  const share = (index: number) =>
    ((machine.capacityWeights?.[index] ?? 1) / (weightSum || 1)) *
    machine.liftCapacity;
  const extremeMoment = (axis: readonly [number, number]) =>
    machine.points.reduce((sum, point, index) => {
      const dx = point[0] - machine.centreOfMass[0];
      const dz = point[2] - machine.centreOfMass[2];
      const arm = dx * axis[0] + dz * axis[1];
      return arm > 0 ? sum + share(index) * arm : sum;
    }, 0);
  return {
    uprightCentripetal: (reserve - 1) * GRAVITY,
    invertedCentripetal: (reserve + 1) * GRAVITY,
    // Крен создают ПОПЕРЕЧНЫЕ плечи, тангаж — продольные. Инерции берутся из
    // того же паспорта и в том же порядке, что у микшера.
    rollAcceleration:
      extremeMoment(starboard) / Math.max(1e-6, machine.inertia[0]),
    pitchAcceleration:
      extremeMoment(forward) / Math.max(1e-6, machine.inertia[2]),
  };
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
  /**
   * ТЕМП ВРАЩЕНИЯ расписания, рад/с, в мировых осях.
   *
   * Не украшение телеметрии, а обязательная часть требования. Контур позы
   * пропорционален: чтобы вращаться, ему нужна постоянная ошибка, и на петлевом
   * темпе она у этой машины доходит до шестидесяти градусов. Замер без
   * упреждения: радиус вместо тринадцати метров вышел семьдесят, ход разогнался
   * с 16 до 53 м/с, фигура заняла тринадцать секунд вместо пяти.
   */
  readonly angularVelocity: SceneVector3;
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
  /**
   * Сколько высоты фигура забирает ПОД точкой входа, м.
   *
   * Петля у винтокрылой машины проседает, и это не огрех: на вертикальных
   * кусках вес держать нечем — тяга смотрит поперёк него. Замер на стенде:
   * 6.7 м при радиусе 13.0, то есть чуть больше половины радиуса. Объявляется
   * с запасом, потому что ворота должны пускать машину только туда, откуда она
   * вернётся, а не туда, где обычно получается.
   */
  readonly dip: number;
  /** Чем фигура кончается: смещение и разворот курса, рад. */
  readonly exit: {
    readonly offset: SceneVector3;
    readonly headingTurn: number;
  };
  /**
   * @param liveSpeed фактический ход машины, м/с. Влияет только на потребную
   *   тягу — поза и темп от него не зависят. По умолчанию плановый.
   */
  command(progress: number, liveSpeed?: number): FlightFigureCommand;
}

const HALF_TURN = Math.PI;
const FULL_TURN = Math.PI * 2;
const GRAVITY = 9.81;

/**
 * НИЖНИЙ ПРЕДЕЛ ГАЗА В ФИГУРЕ, доли веса.
 *
 * Газ в фигуре — это не только подъём, это ВЛАСТЬ. Момент коптеру создаёт
 * разнотяг колец, а кольцо толкает только в одну сторону: чтобы одни ушли выше
 * среднего, другие обязаны уйти ниже, и на нуле уходить некуда. Момент по
 * построению пропорционален среднему газу, и просьба «дай ноль» на верхушке
 * петли означает «останься без тангажа ровно там, где вращение надо держать».
 *
 * Отсюда пол. Цена ему — верхушка петли получается острее расчётной: лишний
 * газ на перевёрнутой машине давит к центру. Это то самое «яйцо остриём вверх»,
 * и оно свойство машины, а не огрех.
 */
export const FIGURE_LIFT_FLOOR = 0.45;

/**
 * ГАЗ НА ПЕРЕВЁРНУТОМ УЧАСТКЕ, доли веса — полубочка иммельмана и возврат из
 * перевёрнутого.
 *
 * Ровно вес, и это не «удержание высоты»: вверх ногами тяга смотрит в землю и
 * не держит ничего. Она тратится ЦЕЛИКОМ на власть по крену, потому что больше
 * ей там применения нет, а перевернуться нужно быстро. За полубочку вертикальная
 * составляющая в среднем гасит сама себя — ось проходит от −1 до +1.
 */
export const FIGURE_ROLL_COLLECTIVE = 1;

/**
 * ДОЛЯ ПРЕДЕЛЬНОГО УГЛОВОГО УСКОРЕНИЯ, доступная на этом газе.
 *
 * Паспортное угловое ускорение снято крайней раскладкой: половина колец на
 * полную, половина в ноль, то есть при среднем газе в ПОЛОВИНУ располагаемой
 * тяги. В фигуре средний газ другой, и момент вместе с ним: кольцу некуда
 * уходить ниже нуля, поэтому разнотяг не может превысить среднего. Отсюда
 * прямая пропорция `2·газ/резерв`.
 *
 * Это не поправочный коэффициент, а пропущенная физика. Иммельман, расписанный
 * по паспортному пределу, просил полубочку за 0.72 с при газе в 0.45 веса —
 * впятеро меньше того, на котором предел замерен. Стенд ответил честно:
 * `maneuverScale` упал в НОЛЬ, машина на две десятых секунды осталась без
 * управления вверх ногами и вышла из фигуры случайностью, а не расписанием.
 *
 * Возвращается доля УПОТРЕБИМАЯ, а не теоретическая: расписание по самому краю
 * невыполнимо по построению, потому что на краю нечем гасить ни демпфирование,
 * ни собственную ошибку. Тот же запас и по той же причине, что у радиуса.
 */
export const FIGURE_ANGULAR_MARGIN = 0.6;

export function figureAngularShare(
  capability: FlightFigureCapability,
  collective: number,
): number {
  const reserve = capability.uprightCentripetal / GRAVITY + 1;
  return (
    Math.max(0.05, Math.min(1, (2 * collective) / Math.max(1e-6, reserve))) *
    FIGURE_ANGULAR_MARGIN
  );
}

/**
 * Тяга ВДОЛЬ ОСИ МАШИНЫ, которой требует дуга, в долях веса.
 *
 * Ньютон в лоб: `T/m·up = a + g↑`, откуда `T/(mg) = v·ω/g + upY`. Первая
 * редакция несла постоянное `v²/(Rg) − 1` — значение, верное ровно на боку
 * петли и ошибающееся на целый вес и внизу, и наверху. Здесь `upY` берётся из
 * самой позы, поэтому знак меняется сам и подгонять нечего.
 *
 * И скорость берётся ФАКТИЧЕСКАЯ, а не плановая. Расписание крутит машину с
 * известным темпом, а идёт она с той скоростью, с какой идёт: на верхушке
 * замер дал 13.3 м/с против плановых 16. Плановая скорость в этой формуле
 * означала бы просить центростремительное под дугу, которой машина не летит, —
 * и она честно не летела: петля закрывалась на четырнадцать метров ниже входа.
 */
function arcLift(speed: number, rate: number, upY: number): number {
  return (
    Math.max(FIGURE_LIFT_FLOOR, (speed * Math.abs(rate)) / GRAVITY + upY) - 1
  );
}

/** Вертикаль оси машины в мире — она и решает знак тяги. */
function attitudeUpY(attitude: Quaternion): number {
  return rotateVector(attitude, [0, 1, 0])[1];
}

/**
 * Темп расписания — конечной разностью по нему же, а не отдельной формулой.
 *
 * Так он не может разойтись с позой: любая правка расписания меняет и темп.
 * Отдельно выведенная формула разошлась бы молча — и разошлась бы именно там,
 * где расписание сложнее всего, то есть на стыке полупетли и полубочки.
 */
/** Кратчайший поворот из `from` в `to`: вектор в мировых осях и его угол. */
function relativeRotation(
  from: Quaternion,
  to: Quaternion,
): { readonly vector: SceneVector3; readonly angle: number } {
  const [fx, fy, fz, fw] = from;
  const [tx, ty, tz, tw] = to;
  let ex = tw * -fx + tx * fw + ty * -fz - tz * -fy;
  let ey = tw * -fy - tx * -fz + ty * fw + tz * -fx;
  let ez = tw * -fz + tx * -fy - ty * -fx + tz * fw;
  let ew = tw * fw - tx * -fx - ty * -fy - tz * -fz;
  if (ew < 0) {
    ex = -ex;
    ey = -ey;
    ez = -ez;
    ew = -ew;
  }
  const sine = Math.hypot(ex, ey, ez);
  const angle = 2 * Math.atan2(sine, ew);
  if (sine < 1e-12) return { vector: [0, 0, 0], angle: 0 };
  const scale = 1 / sine;
  return { vector: [ex * scale, ey * scale, ez * scale], angle };
}

function scheduleRate(
  attitudeAt: (progress: number) => Quaternion,
  progress: number,
  progressPerSecond: number,
  /**
   * Изломы расписания. Через них разность брать НЕЛЬЗЯ: на стыке полупетли и
   * полубочки ось вращения меняется скачком, и разность поперёк стыка выдаёт
   * темп в сотни рад/с. Стенд поймал это одним кадром с `maneuverScale` в нуле:
   * машина на мгновение осталась вверх ногами без управления.
   */
  seams: readonly number[] = [],
): SceneVector3 {
  const step = 1e-4;
  let low = Math.max(0, progress - step);
  let high = Math.min(1, progress + step);
  for (const seam of seams) {
    if (seam > low && seam < high) {
      if (progress >= seam) low = seam;
      else high = seam;
    }
  }
  const span = high - low;
  if (span <= 0) return [0, 0, 0];
  const { vector, angle } = relativeRotation(attitudeAt(low), attitudeAt(high));
  const scale = (angle * progressPerSecond) / span;
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

/**
 * Время перекладки на полоборота: разгон до середины и торможение до конца.
 * Пиковый темп при этом равен `α · t/2` и достигается ровно в середине.
 */
export function halfTurnSeconds(angularAcceleration: number): number {
  return 2 * Math.sqrt(HALF_TURN / Math.max(angularAcceleration, 0.05));
}

/**
 * Профиль полуоборота: доля времени → доля угла. Разгон до середины, торможение
 * до конца — ровно то движение, по которому посчитан `halfTurnSeconds`.
 *
 * Линейный угол по времени этому расчёту противоречил бы, и противоречие
 * стоило кадра: на стыке полупетли и полубочки расписание требовало ТРИ рад/с
 * мгновенно, аллокатор объявлял позу невыполнимой и один шаг машина висела
 * вверх ногами на удержании. Здесь темп на обоих концах равен нулю, и стыка
 * больше нет — не потому, что его сгладили, а потому, что его не стало.
 */
export function halfTurnProfile(fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction));
  return t <= 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
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
 *
 * ФИГУРА ПРИСТРАИВАЕТСЯ К РОВНОМУ ПОЛЁТУ, а не задаёт позу с нуля, и это не
 * мелочь. Поворот считается в МИРОВЫХ осях и домножается на позу входа СЛЕВА:
 * `q = R_фигуры · q_входа`. Первая редакция возвращала один только поворот —
 * то есть молча утверждала, что в начале фигуры машина стоит в авторской позе
 * покоя. У машины, летящей курсом на девяносто градусов от авторского, ошибка
 * позы получала в себе этот разворот, и контур отрабатывал его кратчайшим
 * путём: замер показал упрямую БОЧКУ вместо петли — ось вверх уходила в −0.99
 * при носе, ни разу не поднявшемся выше 0.14.
 */
function pitchedAttitude(
  pitch: number,
  roll: number,
  nose: readonly [number, number],
  base: Quaternion,
): Quaternion {
  const starboard: SceneVector3 = [-nose[1], 0, nose[0]];
  const forward: SceneVector3 = [nose[0], 0, nose[1]];
  return normalizeQuaternion(
    multiplyQuaternions(
      multiplyQuaternions(
        quaternionAboutAxis(starboard, pitch),
        quaternionAboutAxis(forward, roll),
      ),
      base,
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
  base: Quaternion,
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const length = FULL_TURN * radius;
  const attitudeAt = (t: number) =>
    pitchedAttitude(Math.max(0, Math.min(1, t)) * FULL_TURN, 0, nose, base);
  return {
    kind: "loop",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    ceiling: 2 * radius,
    dip: FIGURE_DIP_SHARE * radius,
    exit: { offset: [0, 0, 0], headingTurn: 0 },
    command(progress, liveSpeed = speed) {
      const t = Math.max(0, Math.min(1, progress));
      const theta = t * FULL_TURN;
      const forward = radius * Math.sin(theta);
      const up = radius * (1 - Math.cos(theta));
      const attitude = attitudeAt(t);
      const angularVelocity = scheduleRate(attitudeAt, t, speed / length);
      return {
        attitude,
        speed,
        liftFraction: arcLift(
          liveSpeed,
          Math.hypot(...angularVelocity),
          attitudeUpY(attitude),
        ),
        angularVelocity,
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
  base: Quaternion,
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const loopLength = HALF_TURN * radius;
  // Полубочка идёт на той же скорости, поэтому её «длина» — путь за время
  // переворота. Держать машину в этот момент нечем: она падает, и это входит
  // в потребный запас высоты.
  const rollSeconds = halfTurnSeconds(
    capability.rollAcceleration *
      figureAngularShare(capability, FIGURE_ROLL_COLLECTIVE),
  );
  const rollLength = speed * rollSeconds;
  const length = loopLength + rollLength;
  const loopShare = loopLength / length;
  const rollDrop = 0.5 * GRAVITY * rollSeconds * rollSeconds;
  const attitudeAt = (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped <= loopShare
      ? pitchedAttitude((clamped / loopShare) * HALF_TURN, 0, nose, base)
      : pitchedAttitude(
          HALF_TURN,
          halfTurnProfile(
            (clamped - loopShare) / Math.max(1e-6, 1 - loopShare),
          ) * HALF_TURN,
          nose,
          base,
        );
  };
  return {
    kind: "immelmann",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    ceiling: 2 * radius,
    // Иммельман кончается наверху и вниз не идёт: провал ему нужен только на
    // случай срыва, и это та же полубочка, что в возврате из перевёрнутого.
    dip: 0,
    exit: { offset: [0, 2 * radius - rollDrop, 0], headingTurn: Math.PI },
    command(progress, liveSpeed = speed) {
      const t = Math.max(0, Math.min(1, progress));
      if (t <= loopShare) {
        const theta = (t / loopShare) * HALF_TURN;
        const forward = radius * Math.sin(theta);
        const up = radius * (1 - Math.cos(theta));
        const attitude = attitudeAt(t);
        const angularVelocity = scheduleRate(attitudeAt, t, speed / length);
        return {
          attitude,
          speed,
          liftFraction: arcLift(
            liveSpeed,
            Math.hypot(...angularVelocity),
            attitudeUpY(attitude),
          ),
          angularVelocity,
          offset: [forward * nose[0], up, forward * nose[1]],
        };
      }
      const rollProgress = (t - loopShare) / Math.max(1e-6, 1 - loopShare);
      const fallen = 0.5 * GRAVITY * (rollProgress * rollSeconds) ** 2;
      // Тангаж остаётся на 180°: машина уже перевёрнута, крен доводит её до
      // ровной. После полубочки поза совпадает с ровной, но курс обратный.
      const attitude = attitudeAt(t);
      return {
        attitude,
        speed,
        // На полубочке дуги нет, значит нет и центростремительного. Газ здесь
        // держит не высоту, а ВЛАСТЬ: перевернуться надо быстро, а момент
        // коптеру даёт разнотяг, и разнотяг не бывает больше среднего газа.
        liftFraction: FIGURE_ROLL_COLLECTIVE - 1,
        angularVelocity: scheduleRate(attitudeAt, t, speed / length, [
          loopShare,
        ]),
        offset: [0, 2 * radius - fallen, 0],
      };
    },
  };
}

/**
 * @param nose горизонтальный курс на входе, единичный.
 * @param base поза РОВНОГО полёта этим курсом. Фигура пристраивается к ней, а
 *   не подменяет её: на нулевом прогрессе команда равна ровно `base`.
 */
export function planFlightFigure(
  kind: FlightFigureKind,
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
  base: Quaternion = [0, 0, 0, 1],
): FlightFigurePlan {
  return kind === "loop"
    ? loopPlan(speed, capability, nose, base)
    : immelmannPlan(speed, capability, nose, base);
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

/**
 * Доля радиуса, которую фигура забирает вниз от точки входа. Замерено 0.51 на
 * петле; объявляется больше, потому что просадка растёт с недобором тяги, а
 * ворота обязаны считать по худшему.
 */
export const FIGURE_DIP_SHARE = 0.75;

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
  // Снизу фигуру ограничивают ДВЕ вещи, и обе обязаны сойтись: собственный
  // провал фигуры и возврат из перевёрнутого, если она сорвётся на верхушке.
  const recovery = invertedRecoveryHeight(capability) + plan.dip;
  if (gate.heightAboveGround < recovery) {
    return { flyable: false, reason: "не хватает высоты на возврат" };
  }
  return { flyable: true, reason: null };
}

/**
 * Высота, которую отнимает возврат из перевёрнутого. Наружу — для телеметрии.
 *
 * Полубочка на выравнивание, свободное падение за это время и гашение набранной
 * вертикальной скорости располагаемым избытком тяги. Темп полубочки берётся НЕ
 * паспортным пределом, а тем, что машина даёт на газе возврата: предел замерен
 * при среднем газе в половину резерва, а вверх ногами такого газа не бывает.
 */
export function invertedRecoveryHeight(
  capability: FlightFigureCapability,
): number {
  const rollSeconds = halfTurnSeconds(
    capability.rollAcceleration *
      figureAngularShare(capability, FIGURE_ROLL_COLLECTIVE),
  );
  const vertical = GRAVITY * rollSeconds;
  return (
    0.5 * GRAVITY * rollSeconds * rollSeconds +
    (vertical * vertical) / (2 * Math.max(1, capability.uprightCentripetal))
  );
}

// ---------------------------------------------------------------------------
// ЭПИЗОД ФИГУРЫ — И ОТВЕТ НА ЛОВУШКУ ПРОГРЕССА
// ---------------------------------------------------------------------------

/**
 * ПРОГРЕСС ФИГУРЫ — ЭТО ПРОЕКЦИЯ НА РАСПИСАНИЕ ПОЗЫ.
 *
 * Ровно та же мысль, которой живёт трасса: там прогресс — проекция машины на
 * кривую, здесь — проекция ПОЗЫ на расписание поз. Метрика другая, потому что
 * другой и предмет: горизонтальная проекция петли вырождена по построению, а
 * поза в петле монотонна и различима каждым градусом.
 *
 * Одной проекции мало: расписание с нулевым темпом на концах у самого конца
 * плоское, и проекция до единицы не доходит. Поэтому расписание идёт СВОИМ
 * ходом, а проекция держит его НА ПОВОДКЕ — убежать от машины дальше поводка
 * оно не может. Без поводка фигура кончалась там, где машина ещё висела вверх
 * ногами; без собственного хода — не начиналась вовсе.
 */
export const FIGURE_LEASH = 0.22;
/** Насколько точно машина обязана попасть в последнюю позу расписания, рад. */
export const FIGURE_EXIT_TOLERANCE = 0.25;
/** Во сколько раз дольше плана фигура имеет право идти, прежде чем её снимут. */
export const FIGURE_TIMEOUT_SHARE = 2.5;

export interface FlightFigureEpisode {
  readonly plan: FlightFigurePlan;
  /** Где расписание. */
  readonly progress: number;
  /** Где машина. */
  readonly achieved: number;
  readonly seconds: number;
  readonly done: boolean;
  /** Фигура снята по времени: машина за ней не пошла. */
  readonly aborted: boolean;
}

export function beginFlightFigure(plan: FlightFigurePlan): FlightFigureEpisode {
  return {
    plan,
    progress: 0,
    achieved: 0,
    seconds: 0,
    done: false,
    aborted: false,
  };
}

/**
 * Шаг эпизода: где машина по расписанию и что у неё просить дальше.
 *
 * Возвращает готовое требование — позу, темп её вращения и газ. Ход просится
 * плановый: фигура не разгоняет машину, она её крутит.
 */
export function advanceFlightFigure(
  episode: FlightFigureEpisode,
  attitude: Quaternion,
  speed: number,
  deltaSeconds: number,
): {
  readonly episode: FlightFigureEpisode;
  readonly command: FlightFigureCommand;
} {
  const { plan } = episode;
  // Проекция ищется ТОЛЬКО ВПЕРЁД: расписание не отматывают назад, иначе
  // машина, качнувшаяся в позе, теряла бы уже пройденное.
  let achieved = episode.achieved;
  let best = Number.POSITIVE_INFINITY;
  const window = 0.3;
  const steps = 40;
  for (let index = 0; index <= steps; index += 1) {
    const candidate = Math.min(1, episode.achieved + (window * index) / steps);
    const error = relativeRotation(attitude, plan.command(candidate).attitude)
      .angle;
    if (error < best) {
      best = error;
      achieved = candidate;
    }
  }
  const seconds = episode.seconds + deltaSeconds;
  const progress = Math.min(
    episode.progress + (plan.speed / plan.length) * deltaSeconds,
    achieved + FIGURE_LEASH,
    1,
  );
  const settled =
    progress >= 1 &&
    relativeRotation(attitude, plan.command(1).attitude).angle <
      FIGURE_EXIT_TOLERANCE;
  const aborted = !settled && seconds > plan.seconds * FIGURE_TIMEOUT_SHARE;
  return {
    episode: {
      plan,
      progress,
      achieved,
      seconds,
      done: settled || aborted,
      aborted,
    },
    command: plan.command(progress, speed),
  };
}

/** Куда смотрит нос при этой позе — для телеметрии и проверок. */
export function figureNoseDirection(
  attitude: Quaternion,
  nose: SceneVector3,
): SceneVector3 {
  return rotateVector(attitude, nose);
}
