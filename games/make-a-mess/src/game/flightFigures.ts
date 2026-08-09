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

export type FlightFigureKind =
  | "loop"
  | "immelmann"
  | "split-s"
  | "roll"
  | "kulbit";

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
  /**
   * СОПРОТИВЛЕНИЕ ВРАЩЕНИЮ, 1/с: сколько углового ускорения съедает каждая
   * рад/с темпа.
   *
   * Без него запас приходилось назначать на глаз, и он назначался: множитель
   * 0.6 «чтобы не по пределу» был честной догадкой и ничем больше. Между тем
   * догадка описывала конкретную физику — момент, который уходит не на
   * вращение, а на его удержание. Раз физика есть, её и надо считать, а не
   * закладывать коэффициентом.
   */
  readonly angularDamping: number;
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
  /**
   * Паспортное затухание вращения, 1/с, как его понимает `stepBody`.
   *
   * ОБЯЗАТЕЛЬНОЕ ПОЛЕ, и это не педантизм. Оно необязательным было ровно один
   * день: рантайм собирал паспорт фигуры отдельным литералом и это поле в нём
   * забыл, а стенд собирал своим и не забыл. Расхождение молчаливое и злое —
   * без затухания расписание фигуры просит темп, который машина удержать не
   * может, и фигура либо не проходит ворота, либо снимается по времени. На
   * стенде при этом всё летало. Необязательное поле, у которого есть разумный
   * ноль, — это приглашение к такому расхождению; здесь его быть не должно.
   */
  readonly angularDamping: number;
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
    // Момент сопротивления считается по инерции РЫСКАНИЯ — так его задаёт
    // физика тела, — а в угловое ускорение переводится через инерцию той оси,
    // вокруг которой идёт фигура. У RAX обе поперечные инерции равны, поэтому
    // число одно; у машины с другой развесовкой оно разошлось бы, и брать одно
    // за другое было бы ошибкой молчаливой.
    angularDamping:
      ((machine.angularDamping ?? 0) * machine.inertia[1]) /
      Math.max(1e-6, machine.inertia[2]),
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
  /**
   * ПОЗА, В КОТОРОЙ МАШИНУ ОТДАЮТ. Не то же самое, что последняя поза
   * расписания: неполная петля кончается носом в землю, и держать эту позу,
   * пока хвост гасит снижение, значит гасить его снижением же. Отдают ровной.
   */
  readonly levelExit: Quaternion;
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
 * НИЖНИЙ ПРЕДЕЛ ГАЗА В ФИГУРЕ — ВЫВОДИТСЯ ИЗ ПОТРЕБНОГО МОМЕНТА.
 *
 * Газ в фигуре — это не только подъём, это ВЛАСТЬ: момент коптеру создаёт
 * разнотяг колец, а разнотяг ограничен средним газом. Просьба «дай ноль» на
 * верхушке петли означает «останься без тангажа ровно там, где вращение надо
 * держать».
 *
 * Сколько именно надо — считается, а не назначается. Фигуре нужно ДВА момента:
 * разогнать вращение до своего темпа в пределах разрешённого отставания
 * (`ω²/2φ`) и потом удерживать его против сопротивления (`k·ω`). Сумма,
 * делённая на власть единицы газа, и есть пол. Прежние 0.45 были догадкой; для
 * малой петли выводится 0.40, для большой — 0.23, и разница осмысленна:
 * большая петля крутится медленнее, значит и держать её дешевле.
 */
export function figureLiftFloor(
  capability: FlightFigureCapability,
  rate: number,
  /** Полный угол фигуры, рад: у петли оборот, у иммельмана полоборота с бочкой. */
  turn: number,
): number {
  const lag = Math.max(0.2, FIGURE_LEASH * turn);
  const needed =
    (rate * rate) / (2 * lag) + capability.angularDamping * Math.abs(rate);
  // Власть единицы газа — производная доли по газу ниже половины резерва.
  const perCollective =
    (2 * capability.pitchAcceleration) / Math.max(1e-6, figureReserve(capability));
  return Math.max(0.15, needed / Math.max(1e-6, perCollective));
}



/**
 * ДОЛЯ ПРЕДЕЛЬНОГО УГЛОВОГО УСКОРЕНИЯ, доступная на этом газе.
 *
 * Паспортное угловое ускорение снято крайней раскладкой: половина колец на
 * полную, половина в ноль, то есть при среднем газе в ПОЛОВИНУ располагаемой
 * тяги. На другом среднем газе момент другой, и ограничивает его РАЗНОТЯГ,
 * который упирается в две стенки сразу: кольцу некуда уходить ниже нуля и
 * некуда выше собственного потолка. Поэтому доступное отклонение равно
 * `min(газ, резерв − газ)`, и максимум у него ровно посередине.
 *
 * Отсюда прямое следствие, которого не было в первой редакции: «побольше газа»
 * НЕ означает «побольше власти». Выше половины резерва власть снова падает,
 * потому что кольцам становится некуда расти.
 *
 * Это не поправочный коэффициент, а пропущенная физика. Иммельман, расписанный
 * по паспортному пределу, просил полубочку за 0.72 с при газе в 0.45 веса —
 * впятеро меньше того, на котором предел замерен. Стенд ответил честно:
 * `maneuverScale` упал в НОЛЬ, машина на две десятых секунды осталась без
 * управления вверх ногами и вышла из фигуры случайностью, а не расписанием.
 */
export function figureReserve(capability: FlightFigureCapability): number {
  return capability.uprightCentripetal / GRAVITY + 1;
}

export function figureAngularShare(
  capability: FlightFigureCapability,
  collective: number,
): number {
  const reserve = figureReserve(capability);
  const usable = Math.min(collective, reserve - collective);
  return Math.max(0.02, Math.min(1, (2 * usable) / Math.max(1e-6, reserve)));
}

/**
 * ГАЗ, НА КОТОРОМ ВЛАСТЬ МАКСИМАЛЬНА — ровно половина резерва, и это не выбор,
 * а вершина `min(газ, резерв − газ)`.
 *
 * На перевёрнутом участке — полубочке иммельмана и возврате из перевёрнутого —
 * держать высоту тягой всё равно нельзя: она смотрит в землю. Значит, её надо
 * тратить ЦЕЛИКОМ на скорость переворота, а «целиком» у коптера означает не
 * «на всю», а «на половине резерва». За полуоборот вертикальная составляющая
 * гасит сама себя — ось проходит от −1 до +1, и интеграл косинуса равен нулю,
 * — поэтому величина газа на просадку не влияет, а на её ДЛИТЕЛЬНОСТЬ влияет
 * прямо. Прежняя единица веса была вдвое меньше нужного и стоила вдвое более
 * долгого переворота.
 */
export function figureRollCollective(
  capability: FlightFigureCapability,
): number {
  return figureReserve(capability) / 2;
}

/**
 * УГЛОВОЕ УСКОРЕНИЕ, КОТОРОЕ ОСТАЁТСЯ ФИГУРЕ на этом газе.
 *
 * Вычитается ДВОЕ, и оба слагаемых физические.
 *
 * Первое — сопротивление на собственном пиковом темпе манёвра: `k·√(π·α)`.
 * Уравнение относительно α — темп зависит от ускорения, а ускорение от темпа, —
 * и решается сжатием за несколько итераций.
 *
 * Второе — доля КОНТУРА, и она отнимается ДОЛЕЙ, а не вычитанием, потому что
 * тратится на ДРУГОЙ оси. Крен и тангаж создаются одними и теми же кольцами, и
 * множество достижимых пар «момент по крену, момент по тангажу» выпукло:
 * заявка на полный предел по крену — это вершина, где власть по тангажу ровно
 * нулевая. А она нужна: машина отстаёт от упреждения, и контур догоняет её
 * моментом `жёсткость × отставание` — по тангажу тоже. Поэтому заявка по крену
 * ужимается настолько, насколько тангажу нужен запас.
 *
 * Замер без этого члена: одиннадцать кадров без управления посреди полубочки;
 * с одним только вычитанием — три. Допустимое отставание берётся то же, которым
 * живёт поводок эпизода, иначе у фигуры было бы два разных мнения о том,
 * насколько машине позволено отстать.
 *
 * Отсюда же исчезает нужда в назначенном запасе 0.6: он был грубой заменой
 * ровно этих двух вычитаний.
 */
export function figureAngularAcceleration(
  peak: number,
  capability: FlightFigureCapability,
  collective: number,
): number {
  const share = figureAngularShare(capability, collective);
  const correction = ROTORCRAFT_ATTITUDE_STIFFNESS * FIGURE_LEASH * HALF_TURN;
  const crossAxis = Math.max(1e-6, capability.pitchAcceleration * share);
  const coupling = Math.max(0.1, 1 - correction / crossAxis);
  const available = peak * share * coupling;
  let solved = Math.max(0.05, available);
  for (let pass = 0; pass < 12; pass += 1) {
    solved = Math.max(
      0.05,
      available - capability.angularDamping * Math.sqrt(HALF_TURN * solved),
    );
  }
  return solved;
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
function arcLift(
  speed: number,
  rate: number,
  upY: number,
  floor: number,
): number {
  return Math.max(floor, (speed * Math.abs(rate)) / GRAVITY + upY) - 1;
}

/**
 * ПОЗА РОВНОГО ПОЛЁТА ЭТИМ КУРСОМ — основание, к которому пристраивается фигура.
 *
 * Именно ровного, а не нынешнего. Машина входит в фигуру из виража, то есть с
 * креном, и если взять её фактическую позу за основание, фигура унаследует этот
 * крен целиком: замер на маршруте дал полупетлю в наклонённой плоскости — ось
 * вверх дошла только до −0.62 вместо −0.98, машина «перевернулась» на две трети.
 * Крен на входе — это то, из чего фигура ВЫВОДИТ машину, а не то, что она несёт.
 */
export function levelAttitude(
  heading: readonly [number, number],
  bodyNose: SceneVector3,
): Quaternion {
  const yaw =
    Math.atan2(heading[0], heading[1]) - Math.atan2(bodyNose[0], bodyNose[2]);
  return quaternionAboutAxis([0, 1, 0], yaw);
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
/**
 * Разворот КУРСА между двумя позами. Ноль, если нос на выходе почти вертикален:
 * горизонтальной проекции у него тогда нет, и курса эта фигура не задаёт.
 */
function exitHeadingTurn(
  exit: Quaternion,
  base: Quaternion,
  nose: readonly [number, number],
): number {
  const forward: SceneVector3 = [nose[0], 0, nose[1]];
  const after = rotateVector(exit, rotateVector(conjugate(base), forward));
  const flat = Math.hypot(after[0], after[2]);
  if (flat < 0.25) return 0;
  return Math.atan2(
    nose[0] * (after[2] / flat) - nose[1] * (after[0] / flat),
    nose[0] * (after[0] / flat) + nose[1] * (after[2] / flat),
  );
}

function conjugate(q: Quaternion): Quaternion {
  return [-q[0], -q[1], -q[2], q[3]];
}

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
 * ПОВОРОТ, НАЧАТЫЙ С ХОДУ, А НЕ С НУЛЯ.
 *
 * Обобщение перекладки на два случая, которых у неё не было: произвольный угол
 * и НЕНУЛЕВОЙ НАЧАЛЬНЫЙ ТЕМП. Второе — не удобство, а лечение стыка.
 *
 * Расписание, начинающееся с нулевого темпа, безупречно, пока фигура начинается
 * с ровного полёта. Но фигура, которая начинается ВНУТРИ другой, приходит на
 * стык с той угловой скоростью, которую уже набрала: кульбит входит в кувырок
 * прямо с петлевого темпа. Потребовать в этот момент ноль — значит потребовать
 * мгновенной остановки вращения, и цену такому требованию проект уже знает: на
 * стыке полупетли и полубочки иммельмана расписание однажды попросило три рад/с
 * скачком, аллокатор объявил позу невыполнимой, и машина кадр висела вверх
 * ногами без управления.
 *
 * Движение то же самое: разгон постоянным `α`, потом торможение тем же `α` в
 * ноль. Отличие в том, что разгон стартует не с нуля. Отсюда и время:
 *
 *     Φ = ω₀·t_р + ½α·t_р² + (ω₀ + α·t_р)²/(2α)   ⟹   t_р = (√(ω₀²/2 + αΦ) − ω₀)/α
 *
 * При `ω₀ = 0` всё сворачивается в прежнее `2√(Φ/α)` — поэтому старая формула
 * теперь не отдельная, а частный случай этой, и разойтись им нечем.
 */
export interface FigureTurnProfile {
  readonly seconds: number;
  /** Наибольший темп расписания, рад/с — по нему судят о посильности. */
  readonly peakRate: number;
  /** Доля времени поворота → пройденный угол, рад. */
  angleAt(fraction: number): number;
}

export function runningTurnProfile(
  turn: number,
  angularAcceleration: number,
  entryRate = 0,
): FigureTurnProfile {
  const alpha = Math.max(0.05, angularAcceleration);
  const total = Math.max(0, turn);
  const entry = Math.max(0, entryRate);
  const accelerate = Math.max(
    0,
    (Math.sqrt((entry * entry) / 2 + alpha * total) - entry) / alpha,
  );
  const peakRate = entry + alpha * accelerate;
  const seconds = accelerate + peakRate / alpha;
  const turnedAtPeak = entry * accelerate + 0.5 * alpha * accelerate * accelerate;
  return {
    seconds,
    peakRate,
    angleAt(fraction) {
      const t = Math.max(0, Math.min(1, fraction)) * seconds;
      if (t <= accelerate) return entry * t + 0.5 * alpha * t * t;
      const s = t - accelerate;
      return Math.min(total, turnedAtPeak + peakRate * s - 0.5 * alpha * s * s);
    },
  };
}

/**
 * Время перекладки на полоборота: разгон до середины и торможение до конца.
 * Пиковый темп при этом равен `α · t/2` и достигается ровно в середине.
 */
export function halfTurnSeconds(angularAcceleration: number): number {
  return runningTurnProfile(HALF_TURN, angularAcceleration).seconds;
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
  /**
   * НАКЛОН ПЛОСКОСТИ ФИГУРЫ, рад. Поворачивает всю систему отсчёта вокруг оси
   * носа: подъём идёт под углом к нормали, а ось вращения перестаёт быть
   * горизонтальным бортом. Ноль — обычная вертикальная петля.
   */
  bank = 0,
): Quaternion {
  const starboard: SceneVector3 = [-nose[1], 0, nose[0]];
  const forward: SceneVector3 = [nose[0], 0, nose[1]];
  const figure = multiplyQuaternions(
    multiplyQuaternions(
      quaternionAboutAxis(starboard, pitch),
      quaternionAboutAxis(forward, roll),
    ),
    base,
  );
  return normalizeQuaternion(
    bank === 0
      ? figure
      : multiplyQuaternions(quaternionAboutAxis(forward, bank), figure),
  );
}

/**
 * БОЧКИ В ПЕТЛЕ У ЭТОЙ МАШИНЫ НЕТ И БЫТЬ НЕ МОЖЕТ — ПРОВЕРЕНО И ЗАКРЫТО.
 *
 * Параметр `spin` у петли был написан и снят в один день, и снят не потому,
 * что не заладился, а потому, что замер объяснил, почему он не может
 * заладиться никогда. Записано здесь, чтобы никто не начал его заново.
 *
 * У винтокрылой машины ОДНА сила и она вдоль оси корпуса. В дуге эта ось
 * обязана смотреть в центр дуги — больше центростремительному взяться неоткуда.
 * Бочка есть поворот вокруг НОСА, а он уводит ось корпуса с центра: сколько
 * накренила, столько центростремительного и потеряла. Петля с бочкой у
 * коптера — это не трудная фигура, это противоречие в условии.
 *
 * Тоннели дела не меняют: они толкают вдоль носа, то есть вдоль оси вращения
 * бочки, и к центру дуги не смотрят ни при каком крене.
 *
 * Замер на VX-8, три попытки, ход 14 м/с:
 *
 *   - полоборота: сход по времени, 337 кадров без управления, минус 130 м,
 *     курс потерян (косинус 0.28), снос вбок 45 м;
 *   - оборот: 12 кадров без управления, петля НЕ ЗАМЫКАЕТСЯ (выход +25 м),
 *     и машина ни разу не переворачивается — крен ровно гасит переворот,
 *     вертикаль оси идёт как `cos²θ` и не опускается ниже нуля;
 *   - два оборота: сход, минус 435 м, разгон до 95 м/с.
 *
 * Куда бочка ВСЁ-ТАКИ помещается — в кувырок кульбита. Там подъём держат
 * тоннели, а не кольца, и куда смотрит ось корпуса, ровно всё равно: бочка
 * достаётся даром. См. `kulbitPlan`.
 */

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
  bank = 0,
  /**
   * ДОЛЯ ОБОРОТА. Целый оборот замыкает петлю в точке входа — и наклон этого не
   * меняет, потому что и синус, и «единица минус косинус» обнуляются на 2π
   * одинаково. Снос наклонённой петли живёт ВНУТРИ фигуры, а не на выходе.
   *
   * Выход в другой точке даёт только НЕПОЛНАЯ петля: три четверти оборота
   * оставляют машину выше, в стороне и носом вниз — то есть в состоянии,
   * которое само является входом в следующую фигуру. Отсюда и «фигуры,
   * переходящие в фигуры»: незамкнутая фигура по построению не возвращает
   * машину туда, откуда взяла.
   */
  sweep = FULL_TURN,
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const length = sweep * radius;
  const attitudeAt = (t: number) =>
    pitchedAttitude(Math.max(0, Math.min(1, t)) * sweep, 0, nose, base, bank);
  // Плоскость наклонена — значит «вверх» у фигуры уже не мировая вертикаль:
  // это вертикаль, повёрнутая вокруг оси носа. Отсюда и весь снос вбок.
  const planeUp: SceneVector3 = [
    -nose[1] * Math.sin(bank),
    Math.cos(bank),
    nose[0] * Math.sin(bank),
  ];
  const floor = figureLiftFloor(capability, speed / radius, FULL_TURN);
  return {
    kind: "loop",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    // Небо просит меньше наклонённая петля: часть подъёма ушла вбок.
    // Высшая точка дуги — на половине оборота, дальше она снижается.
    ceiling:
      radius * (1 - Math.cos(Math.min(sweep, HALF_TURN))) * Math.cos(bank),
    dip: FIGURE_DIP_SHARE * radius,
    levelExit: base,
    exit: {
      offset: [
        radius * Math.sin(sweep) * nose[0] +
          radius * (1 - Math.cos(sweep)) * planeUp[0],
        radius * (1 - Math.cos(sweep)) * planeUp[1],
        radius * Math.sin(sweep) * nose[1] +
          radius * (1 - Math.cos(sweep)) * planeUp[2],
      ],
      // Курс на выходе берётся из САМОЙ ПОЗЫ, а не из формулы: у неполной
      // петли нос может смотреть в зенит или в землю, и тогда горизонтальной
      // проекции у него нет вовсе — разворота курса тоже нет, и врать о нём
      // нельзя. Ноль здесь означает «курс не определён этой фигурой».
      headingTurn: exitHeadingTurn(attitudeAt(1), base, nose),
    },
    command(progress, liveSpeed = speed) {
      const t = Math.max(0, Math.min(1, progress));
      const theta = t * sweep;
      const forward = radius * Math.sin(theta);
      const up = radius * (1 - Math.cos(theta));
      const attitude = attitudeAt(t);
      const angularVelocity = scheduleRate(attitudeAt, t, speed / length);
      return {
        attitude,
        speed,
        // ТЯГУ ПРОСИТ ДУГА, А НЕ ВСЁ ВРАЩЕНИЕ ЦЕЛИКОМ.
        //
        // Здесь стояла величина полного темпа расписания, и без бочки она
        // равна ровно `v/R` — то есть была верна ровно до тех пор, пока
        // расписание не начало крутить два канала сразу. Бочка добавляет
        // столько же рад/с, полный темп вырастает в полтора раза, и петля
        // начинает просить тягу под дугу вдвое круче собственной: замер дал
        // подъём 55 м вместо 18 и разгон до 33 м/с при плановых 14.
        //
        // Путь гнёт только ТАНГАЖ. Вращение вокруг носа не искривляет
        // траекторию вовсе и центростремительного не требует — оно требует
        // власти, и власть ему уже отсчитана полом газа выше.
        liftFraction: arcLift(
          liveSpeed,
          speed / radius,
          attitudeUpY(attitude),
          floor,
        ),
        angularVelocity,
        offset: [
          forward * nose[0] + up * planeUp[0],
          up * planeUp[1],
          forward * nose[1] + up * planeUp[2],
        ],
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
  const rollCollective = figureRollCollective(capability);
  const rollSeconds = halfTurnSeconds(
    figureAngularAcceleration(
      capability.rollAcceleration,
      capability,
      rollCollective,
    ),
  );
  const floor = figureLiftFloor(capability, speed / radius, HALF_TURN);
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
    levelExit: attitudeAt(1),
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
            floor,
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
        liftFraction: rollCollective - 1,
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
/**
 * ПЕТЛЯ ВНИЗ (split-S): полубочка в перевёрнутое, затем нижняя половина петли.
 *
 * Зеркало иммельмана и его же куски: тот же профиль полуоборота, тот же закон
 * тяги, тот же газ на перевёрнутом участке. Отличие одно и оно всё меняет —
 * фигура ТЕРЯЕТ высоту, а не набирает, и потому это единственная фигура,
 * которой можно входить в глиссаду.
 *
 * Порядок обратный иммельману: сперва переворот, потом дуга. Перевернувшись,
 * машина проходит тангажом от π до 2π и выходит ровной, курсом назад и ниже
 * входа на два радиуса плюс то, что съела полубочка.
 */
function splitSPlan(
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
  base: Quaternion,
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const rollCollective = figureRollCollective(capability);
  const rollSeconds = halfTurnSeconds(
    figureAngularAcceleration(
      capability.rollAcceleration,
      capability,
      rollCollective,
    ),
  );
  const rollLength = speed * rollSeconds;
  const loopLength = HALF_TURN * radius;
  const length = rollLength + loopLength;
  const rollShare = rollLength / length;
  const floor = figureLiftFloor(capability, speed / radius, HALF_TURN);
  const rollDrop = 0.5 * GRAVITY * rollSeconds * rollSeconds;
  const attitudeAt = (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped <= rollShare
      ? // Тангаж ещё нулевой: машина переворачивается, оставаясь на курсе.
        pitchedAttitude(
          0,
          halfTurnProfile(clamped / rollShare) * HALF_TURN,
          nose,
          base,
        )
      : // Тангаж ПРОДОЛЖАЕТСЯ с нуля, а не начинается с π. После полубочки
        // машина уже перевёрнута — это её КРЕН, а не тангаж, — и начинать
        // дугу с половины оборота значило бы прыгнуть на 180° за один шаг.
        // Замер поймал ровно это: восемьдесят два кадра без управления и
        // выход с креном в сорок восемь градусов.
        // Дуга РАВНОМЕРНАЯ, и это проверено дважды. Профиль разгона-торможения
        // даёт в середине вдвое больший темп, и перевёрнутой машине его не
        // хватает: сорок пять кадров без управления против трёх у равномерной.
        // Стык всё равно стоит нескольких кадров удержания — полубочка кончает
        // нулевым темпом, дуга просит полный, — и это честная цена стыка, а не
        // огрех расписания.
        pitchedAttitude(
          -((clamped - rollShare) / Math.max(1e-6, 1 - rollShare)) * HALF_TURN,
          HALF_TURN,
          nose,
          base,
        );
  };
  return {
    kind: "split-s",
    radius,
    speed,
    length,
    seconds: length / Math.max(speed, 0.5),
    // Вверх фигура не идёт вовсе: перевернулась и пошла вниз.
    ceiling: 0,
    // Провал — вся высота фигуры плюс то, что съест хвост возврата: он тоже
    // часть фигуры, и не считать его значит обещать дно выше настоящего.
    dip: 2 * radius + rollDrop + invertedRecoveryHeight(capability),
    levelExit: attitudeAt(1),
    exit: {
      offset: [0, -(2 * radius + rollDrop), 0],
      headingTurn: Math.PI,
    },
    command(progress, liveSpeed = speed) {
      const t = Math.max(0, Math.min(1, progress));
      const attitude = attitudeAt(t);
      const angularVelocity = scheduleRate(attitudeAt, t, speed / length, [
        rollShare,
      ]);
      if (t <= rollShare) {
        return {
          attitude,
          speed,
          liftFraction: rollCollective - 1,
          angularVelocity,
          offset: [0, -0.5 * GRAVITY * (t / rollShare) ** 2 * rollSeconds ** 2, 0],
        };
      }
      const theta =
        ((t - rollShare) / Math.max(1e-6, 1 - rollShare)) * HALF_TURN;
      const forward = radius * Math.sin(theta);
      const down = radius * (1 - Math.cos(theta));
      return {
        attitude,
        speed,
        liftFraction: arcLift(
          liveSpeed,
          Math.hypot(...angularVelocity),
          attitudeUpY(attitude),
          floor,
        ),
        angularVelocity,
        offset: [
          -forward * nose[0],
          -(rollDrop + down),
          -forward * nose[1],
        ],
      };
    },
  };
}

/**
 * БОЧКА: полный оборот по крену на прямой, нос никуда не уходит.
 *
 * Самая дешёвая фигура по расписанию и самая ДОРОГАЯ по высоте, и это не
 * парадокс, а одна и та же причина. Вертикальная составляющая тяги идёт как
 * косинус крена, а интеграл косинуса по полному обороту равен нулю: сколько
 * машина выиграла в первой четверти, столько же отдала в третьей. Значит,
 * бочку она пролетает БАЛЛИСТИЧЕСКИ, и провал равен `½g·t²` — целиком, без
 * скидок на то, что кольца при этом работают.
 *
 * Отсюда единственный рычаг: КРУТИТЬ БЫСТРО. Провал квадратичен по времени, и
 * лишняя секунда стоит дороже любой экономии газа. Поэтому газ здесь тот же,
 * что у полубочки иммельмана, — на вершине власти, — а темп берётся весь,
 * какой остаётся после сопротивления.
 *
 * Для VX-8 это выходит 2.5 секунды и тридцать метров вниз. Число неприятное и
 * объявляется как есть: бочку этой машине можно крутить только высоко, и
 * ворота обязаны сказать это раньше, чем земля.
 */
function rollPlan(
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
  base: Quaternion,
  /** Оборотов. Дробное значение допустимо — полубочка это `0.5`. */
  spin = 1,
): FlightFigurePlan {
  const collective = figureRollCollective(capability);
  const turn = FULL_TURN * Math.max(0.1, spin);
  const profile = runningTurnProfile(
    turn,
    figureAngularAcceleration(
      capability.rollAcceleration,
      capability,
      collective,
    ),
  );
  const seconds = profile.seconds;
  const length = speed * seconds;
  const drop = 0.5 * GRAVITY * seconds * seconds;
  const attitudeAt = (t: number) =>
    pitchedAttitude(0, profile.angleAt(t), nose, base);
  return {
    kind: "roll",
    // Радиуса у бочки нет: она не дуга. Объявляется габарит вращения, потому
    // что ноль здесь читался бы как «фигура ничего не занимает».
    radius: 0,
    speed,
    length,
    seconds,
    ceiling: 0,
    dip: drop,
    levelExit: base,
    exit: {
      offset: [speed * seconds * nose[0], -drop, speed * seconds * nose[1]],
      headingTurn: 0,
    },
    command(progress) {
      const t = Math.max(0, Math.min(1, progress));
      const travelled = t * seconds;
      return {
        attitude: attitudeAt(t),
        speed,
        // Газ идёт на ВЛАСТЬ, не на высоту: держать её всё равно нечем — за
        // оборот вертикаль тяги сама себя гасит.
        liftFraction: collective - 1,
        angularVelocity: scheduleRate(attitudeAt, t, 1 / seconds),
        offset: [
          speed * travelled * nose[0],
          -0.5 * GRAVITY * travelled * travelled,
          speed * travelled * nose[1],
        ],
      };
    },
  };
}

/**
 * КУЛЬБИТ: полупетля вверх, реверс тоннелей, кувырок через нос и уход тем же
 * курсом — выше, чем вошла.
 *
 * ЭТА ФИГУРА ЕСТЬ ТОЛЬКО У МАШИНЫ С ПРОДОЛЬНОЙ ТЯГОЙ, и в этом весь её смысл.
 * Обычный мультиротор, довернув тангаж за 180°, оказывается без единого
 * органа, способного толкнуть его вверх: кольца смотрят вниз, а больше у него
 * ничего нет, и остаток оборота он проходит падая. У VX-8 тоннели дают
 * 53.9 м/с² вдоль носа — впятеро больше, чем его же наклон, — и на второй
 * половине оборота ось носа смотрит в землю. Реверс в этот момент толкает
 * машину ПРЯМО ВВЕРХ, и не слегка: пять с половиной g.
 *
 * Отсюда и раскладка, и она вся выводится, а не выбирается.
 *
 * 1. ДУГА ВХОДА, тангаж от нуля до `entrySweep`. Настоящая дуга настоящего
 *    радиуса: машина честно входит в петлю и честно набирает два радиуса
 *    высоты. По умолчанию полоборота — это и есть «верхняя точка», из которой
 *    всё дальнейшее и происходит.
 *
 * 2. КУВЫРОК, тангаж от `entrySweep` до полного оборота. Начинается НЕ С НУЛЯ,
 *    а с петлевого темпа (`runningTurnProfile`), поэтому стыка здесь нет:
 *    машина не останавливает вращение, чтобы начать его заново.
 *
 * 3. ТРЕБОВАНИЕ ХОДА НА КУВЫРКЕ — ОДНА СТРОКА, И ОНА ЖЕ ВЕСЬ РЕВЕРС.
 *
 *    Просьба формулируется не в тяге, а в НАМЕРЕНИИ: «хочу идти вертикально
 *    вверх со скоростью `climb`». Вдоль носа это `climb · sin θ`, где `sin θ` —
 *    вертикаль самой оси носа. На второй половине оборота синус отрицателен, и
 *    просьба сама собой становится ОТРИЦАТЕЛЬНОЙ — то есть реверсом. Ни знака,
 *    ни расписания тяги задавать не пришлось: они следствие того, куда смотрит
 *    нос.
 *
 *    Проверяется в трёх точках. На 180° нос горизонтален, просьба — ноль:
 *    гасится снос назад, набранный на верхушке дуги. На 270° нос смотрит в
 *    землю, просьба — полный реверс: это и есть подъём. На 360° нос снова
 *    горизонтален, просьба возвращается к ходу вперёд.
 *
 *    И побочное следствие, которое стоит назвать: вертикальная составляющая
 *    выходит `climb · sin²θ` — неотрицательная ВЕЗДЕ. Кувырок не может опустить
 *    машину, он умеет только поднимать. Горизонтальная же идёт как
 *    `½·climb·sin 2θ` и за оборот сама себя обнуляет — машина уходит почти
 *    оттуда же, откуда начала кувырок.
 *
 * 4. `climb` РАВЕН ХОДУ ВХОДА, и это не подгонка: машина меняет ход на подъём
 *    метр в метр. Свободного числа в фигуре нет ни одного.
 *
 * 5. ВЫХОД — разгон тоннелями вперёд на последней доле кувырка. «Укладывает нос
 *    в горизонт с разгоном»: без этого фигура кончалась бы машиной, ползущей
 *    вверх без хода, и трасса подхватывала бы её с нуля.
 *
 * 6. БОЧКИ В КУВЫРКЕ ТОЖЕ НЕТ, И ЭТО ВТОРОЙ ЗАМЕР ОДНОЙ И ТОЙ ЖЕ ПРИЧИНЫ.
 *
 *    Соображение было хорошее и оказалось неверным. Рассуждали так: в дуге
 *    крен запрещён, потому что ось корпуса держит центростремительное, — а в
 *    кувырке она не держит ничего, вертикаль вытягивают тоннели, и они стоят
 *    вдоль оси бочки. Значит, бочка тут даром.
 *
 *    Даром она не оказалась, потому что платить надо было не подъёмом, а
 *    ВЛАСТЬЮ. Кувырок уже идёт на предельном темпе тангажа: 2.64 рад/с в пике.
 *    Оборот крена за те же две секунды просит около трёх рад/с, а удержать три
 *    рад/с при сопротивлении 1.35 1/с стоит 4.0 рад/с² — ровно весь бюджет
 *    крена, и это ДО того, как тангаж возьмёт своё из того же разнотяга.
 *    Замер: полбочки — 180 м вниз и разгон до 61 м/с (полоборота вдобавок
 *    оставляет машину перевёрнутой, а расписание обещает ровный выход, и
 *    эпизод тянется вдвое дольше плана); целая бочка — 68 кадров без
 *    управления и 30 м вниз.
 *
 *    Замедлять кувырок бесполезно, и это считается, а не пробуется: бочке
 *    нужно `2·Φ/T` рад/с, удержание стоит `k·2Φ/T`, и чтобы уложиться в
 *    бюджет крена, кувырку пришлось бы длиться дольше, чем растягивание его
 *    темпа успевает освободить. Уравнение не сходится ни при каком `T`.
 *
 *    ОБЩЕЕ ПРАВИЛО, КОТОРОЕ ИЗ ЭТОГО СЛЕДУЕТ: у VX-8 хватает власти ровно на
 *    ОДИН быстрый канал вращения за раз. Бочка сама по себе — пожалуйста,
 *    кувырок сам по себе — пожалуйста; вместе — нет. Виновато не расписание, а
 *    сопротивление вращению 1.35 1/с при инерции вдвое большей, чем у RAX-8.
 */
const KULBIT_EXIT_SHARE = 0.12;
const KULBIT_SAMPLES = 96;

function kulbitPlan(
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
  base: Quaternion,
  entrySweep = HALF_TURN,
): FlightFigurePlan {
  const radius = figureRadius(speed, capability);
  const arcRate = speed / Math.max(0.5, radius);
  const arc = Math.max(0.2, Math.min(entrySweep, FULL_TURN - 0.2));
  const arcSeconds = arc / arcRate;
  const collective = figureRollCollective(capability);
  const flip = runningTurnProfile(
    FULL_TURN - arc,
    figureAngularAcceleration(
      capability.pitchAcceleration,
      capability,
      collective,
    ),
    arcRate,
  );
  const seconds = arcSeconds + flip.seconds;
  const length = speed * seconds;
  const arcShare = arcSeconds / seconds;
  const climb = speed;
  const floor = figureLiftFloor(capability, arcRate, FULL_TURN);

  const flipFractionAt = (t: number): number =>
    (Math.max(0, Math.min(1, t)) - arcShare) / Math.max(1e-6, 1 - arcShare);
  const pitchAt = (t: number): number => {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped <= arcShare
      ? (clamped / arcShare) * arc
      : arc + flip.angleAt(flipFractionAt(clamped));
  };
  const attitudeAt = (t: number) => pitchedAttitude(pitchAt(t), 0, nose, base);
  /** Доля хода, отданная разгону на выходе: 0 весь кувырок, 1 в самом конце. */
  const surgeAt = (flipFraction: number): number => {
    const raw = (flipFraction - (1 - KULBIT_EXIT_SHARE)) / KULBIT_EXIT_SHARE;
    const s = Math.max(0, Math.min(1, raw));
    return s * s * (3 - 2 * s);
  };
  const demandAt = (flipFraction: number, theta: number): number => {
    const surge = surgeAt(flipFraction);
    return climb * Math.sin(theta) * (1 - surge) + speed * surge;
  };

  // ПУТЬ КУВЫРКА СЧИТАЕТСЯ ЧИСЛЕННО, а не оценивается множителем. Требование
  // хода известно в каждой точке, ось носа тоже — значит, известна и скорость;
  // остаётся её проинтегрировать. Так объявленный потолок оказывается ровно
  // тем, о чём фигура просит, а не догадкой о том, что из просьбы выйдет.
  const rise: number[] = [0];
  const drift: number[] = [0];
  for (let index = 1; index <= KULBIT_SAMPLES; index += 1) {
    const before = (index - 1) / KULBIT_SAMPLES;
    const after = index / KULBIT_SAMPLES;
    const step = (after - before) * flip.seconds;
    const mid = (before + after) / 2;
    const theta = arc + flip.angleAt(mid);
    const along = demandAt(mid, theta);
    rise[index] = rise[index - 1] + along * Math.sin(theta) * step;
    drift[index] = drift[index - 1] + along * Math.cos(theta) * step;
  }
  const sampled = (table: readonly number[], fraction: number): number => {
    const scaled = Math.max(0, Math.min(1, fraction)) * KULBIT_SAMPLES;
    const low = Math.min(KULBIT_SAMPLES, Math.floor(scaled));
    const high = Math.min(KULBIT_SAMPLES, low + 1);
    return table[low] + (table[high] - table[low]) * (scaled - low);
  };

  const arcCeiling = radius * (1 - Math.cos(Math.min(arc, HALF_TURN)));
  const arcForward = radius * Math.sin(arc);
  const flipRise = rise[KULBIT_SAMPLES];
  const flipDrift = drift[KULBIT_SAMPLES];
  return {
    kind: "kulbit",
    radius,
    speed,
    length,
    seconds,
    ceiling: arcCeiling + flipRise,
    // Вниз от точки входа фигура не идёт НИ РАЗУ: дуга поднимает, кувырок тоже
    // (вертикаль его требования — квадрат синуса, а он неотрицателен). Провал
    // остаётся нулевым по той же причине, что у иммельмана, и по той же
    // причине ворота всё равно требуют высоты на возврат из перевёрнутого:
    // ноль здесь про ПЛАН, а не про срыв.
    dip: 0,
    levelExit: base,
    exit: {
      offset: [
        (arcForward + flipDrift) * nose[0],
        arcCeiling + flipRise,
        (arcForward + flipDrift) * nose[1],
      ],
      headingTurn: 0,
    },
    command(progress, liveSpeed = speed) {
      const t = Math.max(0, Math.min(1, progress));
      const theta = pitchAt(t);
      const attitude = attitudeAt(t);
      const angularVelocity = scheduleRate(attitudeAt, t, 1 / seconds);
      if (t <= arcShare) {
        return {
          attitude,
          speed,
          liftFraction: arcLift(
            liveSpeed,
            Math.hypot(...angularVelocity),
            attitudeUpY(attitude),
            floor,
          ),
          angularVelocity,
          offset: [
            radius * Math.sin(theta) * nose[0],
            radius * (1 - Math.cos(theta)),
            radius * Math.sin(theta) * nose[1],
          ],
        };
      }
      const flipFraction = (t - arcShare) / Math.max(1e-6, 1 - arcShare);
      return {
        attitude,
        // ВОТ ЗДЕСЬ И ЖИВЁТ РЕВЕРС — в знаке одного числа.
        speed: demandAt(flipFraction, theta),
        // Кольца на кувырке держат не высоту, а власть: высоту держат тоннели.
        liftFraction: collective - 1,
        angularVelocity,
        offset: [
          (arcForward + sampled(drift, flipFraction)) * nose[0],
          arcCeiling + sampled(rise, flipFraction),
          (arcForward + sampled(drift, flipFraction)) * nose[1],
        ],
      };
    },
  };
}

export function planFlightFigure(
  kind: FlightFigureKind,
  speed: number,
  capability: FlightFigureCapability,
  nose: readonly [number, number],
  base: Quaternion = [0, 0, 0, 1],
  /** Наклон плоскости фигуры, рад. Действует только на петлю. */
  bank = 0,
  /**
   * Доля оборота петли, рад. Целый оборот замыкает её в точке входа. У кульбита
   * тем же числом задаётся дуга ВХОДА: остаток до полного оборота — кувырок.
   *
   * УМОЛЧАНИЯ ЗДЕСЬ НЕТ, И ЭТО НЕ ЛЕНЬ. Общее умолчание в этой точке уже стоило
   * прогона: петле по умолчанию нужен ПОЛНЫЙ оборот, кульбиту — ПОЛОВИНА, и
   * `FULL_TURN`, поставленный здесь на обоих, молча выдал кульбиту дугу входа
   * в целый оборот. Кувырка от фигуры осталось 0.2 рад, и на стенде она
   * отлеталась обычной петлёй — законченной, незаваленной и совершенно не той.
   * Умолчание принадлежит фигуре, а не общей двери к ней.
   */
  sweep?: number,
  /**
   * Оборотов бочки — И ТОЛЬКО ДЛЯ САМОЙ БОЧКИ.
   *
   * Ни петля, ни кульбит бочки не принимают, и это не упущение, а измеренный
   * запрет: разборы над `loopPlan` и `kulbitPlan`. Ноль читается как «оборот»,
   * потому что бочки без оборота не бывает.
   */
  spin = 0,
): FlightFigurePlan {
  if (kind === "loop") {
    return loopPlan(speed, capability, nose, base, bank, sweep);
  }
  if (kind === "roll") {
    return rollPlan(speed, capability, nose, base, spin > 0 ? spin : 1);
  }
  if (kind === "kulbit") {
    return kulbitPlan(speed, capability, nose, base, sweep);
  }
  if (kind === "split-s") return splitSPlan(speed, capability, nose, base);
  return immelmannPlan(speed, capability, nose, base);
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
 * вертикальной скорости располагаемым избытком тяги. Темп полубочки — тот же,
 * что у полубочки иммельмана: на газе максимальной власти и за вычетом того,
 * что съедает сопротивление. Одна формула на оба места, потому что манёвр один.
 */
export function invertedRecoveryHeight(
  capability: FlightFigureCapability,
): number {
  const rollCollective = figureRollCollective(capability);
  const rollSeconds = halfTurnSeconds(
    figureAngularAcceleration(
      capability.rollAcceleration,
      capability,
      rollCollective,
    ),
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
/**
 * Жёсткость контура позы, 1/с² — та же, что в `rotorcraftAttitudeMoment`.
 * Продублирована числом сознательно: модуль фигур физику не импортирует и не
 * должен, а расхождение ловится тестом.
 */
export const ROTORCRAFT_ATTITUDE_STIFFNESS = 6;
/** Насколько точно машина обязана попасть в последнюю позу расписания, рад. */
export const FIGURE_EXIT_TOLERANCE = 0.25;
/** Во сколько раз дольше плана фигура имеет право идти, прежде чем её снимут. */
export const FIGURE_TIMEOUT_SHARE = 2.5;

/**
 * ХВОСТ ВОЗВРАТА: фигура гасит набранное снижение САМА.
 *
 * Расписание кончается ровной машиной — и этого мало. На полупетле и полубочке
 * держать вес нечем, и к выходу иммельмана замер дал 15.7 м/с снижения. Отдать
 * машину автопилоту в таком виде значит отдать ему задачу, которой у него нет
 * власти: он просил максимальный подъём и всё равно потерял тридцать шесть
 * метров, дойдя до самой земли.
 *
 * Поэтому фигура не считается законченной, пока вертикаль не улеглась. Это тот
 * же манёвр, который уже посчитан в `invertedRecoveryHeight`, — теперь он не
 * только резервируется, но и ЛЕТИТСЯ.
 */
export const FIGURE_RECOVERY_COLLECTIVE = 1.2;
/** Снижение, ниже которого машину можно отдавать, м/с. */
export const FIGURE_RECOVERY_SINK = 1.5;
/** Дольше этого хвост не тянут: значит, гасить нечем. */
export const FIGURE_RECOVERY_SECONDS = 3;

export interface FlightFigureEpisode {
  readonly plan: FlightFigurePlan;
  /** Где расписание. */
  readonly progress: number;
  /** Где машина. */
  readonly achieved: number;
  readonly seconds: number;
  readonly done: boolean;
  /** Расписание отработано, идёт гашение снижения. */
  readonly recovering: boolean;
  readonly recoverySeconds: number;
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
    recovering: false,
    recoverySeconds: 0,
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
  /** Вертикальная скорость машины, м/с. Минус — снижается. */
  verticalSpeed: number,
  deltaSeconds: number,
): {
  readonly episode: FlightFigureEpisode;
  readonly command: FlightFigureCommand;
} {
  const { plan } = episode;
  if (episode.recovering) {
    const recoverySeconds = episode.recoverySeconds + deltaSeconds;
    const settled =
      verticalSpeed > -FIGURE_RECOVERY_SINK ||
      recoverySeconds > FIGURE_RECOVERY_SECONDS;
    const exit = plan.command(1, speed);
    return {
      episode: {
        ...episode,
        seconds: episode.seconds + deltaSeconds,
        recoverySeconds,
        recovering: !settled,
        done: settled,
      },
      // Поза выхода держится, а газ идёт на гашение: машина уже ровная, и вся
      // тяга работает вертикалью.
      command: {
        ...exit,
        attitude: plan.levelExit,
        // Темпа у хвоста нет: он не крутит, он выравнивает и гасит.
        angularVelocity: [0, 0, 0],
        liftFraction: FIGURE_RECOVERY_COLLECTIVE,
      },
    };
  }
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
  // Расписание отработано — но фигура ещё не кончена: сперва гасится снижение.
  const recovering = settled && verticalSpeed <= -FIGURE_RECOVERY_SINK;
  return {
    episode: {
      ...episode,
      progress,
      achieved,
      seconds,
      recovering,
      recoverySeconds: 0,
      done: (settled && !recovering) || aborted,
      aborted,
    },
    command: plan.command(progress, speed),
  };
}

// ---------------------------------------------------------------------------
// ФИГУРА КАК СТАНЦИЯ МАРШРУТА
// ---------------------------------------------------------------------------

/**
 * ФИГУРА — СВОЙСТВО УЧАСТКА ТРАССЫ, а не выдумка автопилота.
 *
 * Она объявляется там же, где высота, скорость и коридор: трасса говорит «вот
 * здесь крутим петлю», а не автопилот решает это по настроению. Отсюда и
 * `resumeAt`: фигура ЗАМЕНЯЕТ кусок трассы, и трасса обязана сказать, какой
 * именно. У петли это почти сама точка входа — она возвращает машину туда же
 * тем же курсом. У иммельмана — участок, на котором трасса сама разворачивается:
 * фигура делает разворот на месте вместо широкой дуги.
 */
export interface RouteFigureStation {
  readonly key: string;
  readonly kind: FlightFigureKind;
  /** Доля трассы, на которой фигура начинается. */
  readonly at: number;
  /** Доля трассы, с которой трасса продолжается после фигуры. */
  readonly resumeAt: number;
  /** Ход входа, м/с. Фигура крутится на нём, а не на разрешённом трассой. */
  readonly speed: number;
  /** Наклон плоскости петли, рад. */
  readonly bank?: number;
  /**
   * Доля оборота петли, рад. Целый оборот замыкает её в точке входа. У кульбита
   * это дуга ВХОДА, а остаток до полного оборота — кувырок.
   */
  readonly sweep?: number;
  /** Оборотов бочки: внутри петли — поверх дуги, у бочки — сама фигура. */
  readonly spin?: number;
  /**
   * Потребный этаж под фигурой, м над бертом. Объявляет ТРАССА, потому что
   * поднять себя может только она; проверяется против живого паспорта машины.
   */
  readonly floor: number;
  /**
   * Годное небо над этой точкой, абсолютная высота мира.
   *
   * Объявляет ТРАССА, а не автомат: потолок — свойство мира, и трасса
   * единственная, кто про свой мир знает. У полигона это 150 м видимого неба.
   */
  readonly sky: number;
}

/**
 * Какая фигура наступила на этом шаге. Возвращает `null`, если ни одна — и это
 * обычный ответ: станций на круге две, а шагов шестьдесят в секунду.
 */
export function routeFigureDue(
  stations: readonly RouteFigureStation[] | undefined,
  previousProgress: number,
  progress: number,
  spent: readonly string[],
): RouteFigureStation | null {
  if (!stations || progress < previousProgress) return null;
  for (const station of stations) {
    if (spent.includes(station.key)) continue;
    if (previousProgress <= station.at && progress >= station.at) {
      return station;
    }
  }
  return null;
}

/**
 * Что автопилот помнит о фигурах этого круга. Ровно три вещи: идёт ли фигура,
 * какие уже отработаны и почему последняя не состоялась.
 */
export interface RouteFigureFlight {
  readonly episode: FlightFigureEpisode | null;
  readonly station: RouteFigureStation | null;
  readonly spent: readonly string[];
  /** Причина пропуска — наружу, в телеметрию: пропуск не молчит. */
  readonly skipped: string | null;
}

export const IDLE_ROUTE_FIGURE: RouteFigureFlight = {
  episode: null,
  station: null,
  spent: [],
  skipped: null,
};

/**
 * ВЕСЬ РАЗГОВОР ТРАССЫ С ФИГУРОЙ — ОДНОЙ ЧИСТОЙ ФУНКЦИЕЙ.
 *
 * Она живёт здесь, а не в компоненте, по прямому уроку проекта: React-часть
 * тестами не покрыта, и обе поломки боевой задачи жили именно в ней. Компоненту
 * остаётся передать сюда состояние и взять ответ.
 *
 * Пока фигура идёт, прогресс трассы ЗАМИРАЕТ — возвращается тот же, что пришёл.
 * Кончилась — прогресс становится `resumeAt`: фигура заменила кусок трассы, и
 * трасса знает, какой именно.
 */
export function advanceRouteFigures(input: {
  readonly state: RouteFigureFlight;
  readonly stations?: readonly RouteFigureStation[];
  readonly previousProgress: number;
  readonly progress: number;
  readonly attitude: Quaternion;
  /** Горизонтальный курс машины, единичный. */
  readonly heading: readonly [number, number];
  /** Нос машины в авторской позе покоя — из него строится ровное основание. */
  readonly bodyNose: SceneVector3;
  readonly speed: number;
  /** Вертикальная скорость машины, м/с. Фигура гасит её сама перед выходом. */
  readonly verticalSpeed: number;
  readonly capability: FlightFigureCapability;
  /** Ворота без хода и без неба: ход берётся замеренный, небо — от станции. */
  readonly gate: Omit<FlightFigureGate, "speed" | "headroom">;
  /** Абсолютная высота машины, м. Из неё и потолка станции выходит запас неба. */
  readonly altitude: number;
  readonly deltaSeconds: number;
}): {
  readonly state: RouteFigureFlight;
  readonly command: FlightFigureCommand | null;
  readonly progress: number;
} {
  const { state } = input;
  // Новый круг — новые фигуры. Признак круга тот же, которым живёт трасса:
  // прогресс пошёл назад.
  const spent =
    input.progress < input.previousProgress - 0.5 ? [] : state.spent;

  if (state.episode && state.station) {
    const advanced = advanceFlightFigure(
      state.episode,
      input.attitude,
      input.speed,
      input.verticalSpeed,
      input.deltaSeconds,
    );
    if (!advanced.episode.done) {
      return {
        state: { ...state, spent, episode: advanced.episode },
        command: advanced.command,
        progress: input.progress,
      };
    }
    return {
      state: {
        episode: null,
        station: null,
        spent: [...spent, state.station.key],
        skipped: advanced.episode.aborted
          ? `${state.station.key}: снята по времени`
          : null,
      },
      command: null,
      progress: state.station.resumeAt,
    };
  }

  const due = routeFigureDue(
    input.stations,
    input.previousProgress,
    input.progress,
    spent,
  );
  if (!due) {
    return { state: { ...state, spent }, command: null, progress: input.progress };
  }
  const plan = planFlightFigure(
    due.kind,
    due.speed,
    input.capability,
    input.heading,
    levelAttitude(input.heading, input.bodyNose),
    due.bank ?? 0,
    due.sweep,
    due.spin,
  );
  const verdict = flightFigureVerdict(
    plan,
    {
      ...input.gate,
      speed: input.speed,
      headroom: due.sky - input.altitude,
    },
    input.capability,
  );
  if (!verdict.flyable) {
    return {
      state: {
        episode: null,
        station: null,
        spent: [...spent, due.key],
        skipped: `${due.key}: ${verdict.reason}`,
      },
      command: null,
      progress: input.progress,
    };
  }
  const episode = beginFlightFigure(plan);
  return {
    state: { episode, station: due, spent, skipped: null },
    command: plan.command(0, input.speed),
    progress: input.progress,
  };
}

/** Куда смотрит нос при этой позе — для телеметрии и проверок. */
export function figureNoseDirection(
  attitude: Quaternion,
  nose: SceneVector3,
): SceneVector3 {
  return rotateVector(attitude, nose);
}

/**
 * ТРЕБОВАНИЕ ДВИЖЕНИЯ, КОТОРОЕ ФИГУРА ВЫСТАВЛЯЕТ ВМЕСТО АВТОПИЛОТА.
 *
 * Структурно совместимо с `VehicleGuidanceDemand`, но объявлено здесь: тянуть
 * сюда тип наведения значило бы завязать модуль фигур на модуль автопилота ради
 * шести полей.
 */
export interface RouteFigureGuidance {
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly yawRate: number;
  readonly liftFraction: number;
  readonly attitude: Quaternion;
  readonly attitudeRate: SceneVector3;
}

export interface RouteFigureStepInput {
  readonly state: RouteFigureFlight;
  /**
   * Доля трассы, замороженная на прошлом кадре, или `null`, если фигура не шла.
   * Замирание делается ОТКАТОМ, а не пропуском: маршрутный прогресс к этому
   * моменту уже сдвинут, и «просто не двигать» его нельзя — он уже двинут.
   */
  readonly frozenProgress: number | null;
  readonly stations: readonly RouteFigureStation[] | undefined;
  /**
   * Опора фигуры — берт ЭТОЙ ЖЕ трассы, то есть её последняя точка: это и есть
   * уровень, с которого машина взлетала и относительно которого объявлен провал.
   */
  readonly berthAltitude: number;
  readonly progress: number;
  readonly attitude: Quaternion;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Нос машины в авторской позе покоя. */
  readonly bodyNose: SceneVector3;
  readonly machine: FigureCapabilitySource;
  /** Доля доставленного слабейшим каналом: побитая машина фигур не крутит. */
  readonly authority: number;
  readonly deltaSeconds: number;
}

export interface RouteFigureStepResult {
  readonly state: RouteFigureFlight;
  readonly frozenProgress: number | null;
  readonly progress: number;
  readonly guidance: RouteFigureGuidance | null;
}

/**
 * ВЕСЬ КАДР ФИГУРЫ ЦЕЛИКОМ — ОДНОЙ ЧИСТОЙ ФУНКЦИЕЙ, И ЭТО НЕ КОСМЕТИКА.
 *
 * `advanceRouteFigures` решает, крутить ли фигуру. Но между ним и машиной лежит
 * ещё слой: как собрать паспорт фигуры, чем мерить высоту над бертом, что такое
 * власть, откуда взять замороженную долю и во что превратить команду. Этот слой
 * был написан ДВАЖДЫ — в компоненте и в стенде, — и разошёлся, как расходится
 * всякий дубль:
 *
 *   - стенд передавал паспортное затухание вращения, компонент его забыл. Без
 *     затухания расписание фигуры просит темп, которого машина не даёт;
 *   - замороженную долю они брали по-разному, и это меняет кадр входа.
 *
 * Итог был ровно тот, которого и следовало ждать: на стенде летели все шесть
 * фигур, в игре — ни одной, и разницу увидел человек глазами, а не тест.
 *
 * Поэтому слой здесь и один. Компоненту остаётся отдать состояние тела и взять
 * ответ; стенду — то же самое. Разойтись им больше нечем.
 */
export function advanceRouteFigureFrame(
  input: RouteFigureStepInput,
): RouteFigureStepResult {
  const running = input.state.episode !== null;
  const from = running ? (input.frozenProgress ?? input.progress) : input.progress;
  const nose = rotateVector(input.attitude, input.bodyNose);
  const flat = Math.hypot(nose[0], nose[2]) || 1;
  const figured = advanceRouteFigures({
    state: input.state,
    stations: input.stations,
    previousProgress: input.frozenProgress ?? from,
    progress: from,
    attitude: input.attitude,
    heading: [nose[0] / flat, nose[2] / flat],
    bodyNose: input.bodyNose,
    speed: Math.hypot(
      input.velocity[0],
      input.velocity[1],
      input.velocity[2],
    ),
    verticalSpeed: input.velocity[1],
    capability: figureCapabilityOf(input.machine),
    gate: {
      heightAboveGround: input.centre[1] - input.berthAltitude,
      authority: input.authority,
    },
    altitude: input.centre[1],
    deltaSeconds: input.deltaSeconds,
  });
  return {
    state: figured.state,
    frozenProgress: figured.progress,
    progress: figured.progress,
    guidance: figured.command
      ? {
          forwardSpeed: figured.command.speed,
          lateralSpeed: 0,
          yawRate: 0,
          liftFraction: figured.command.liftFraction,
          attitude: figured.command.attitude,
          attitudeRate: figured.command.angularVelocity,
        }
      : null,
  };
}
