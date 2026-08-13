import type { SceneVector3 } from "./destructionScene.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionAboutAxis,
  rotateVector,
  type Quaternion,
} from "./clusterDynamics.ts";

/**
 * ЧУВСТВО ТЕЛА: КАКОЙ ПОЗОЙ ДЕРЖАТЬ ПРИЦЕЛ И ХВАТИТ ЛИ НА НЕЁ МАШИНЫ.
 *
 * Модуль отвечает на один вопрос и ни на какой другой: «мне надо, чтобы ствол
 * смотрел ВОТ ТУДА, а тело шло ВОТ ТАК — сойдётся ли?» Он ничего не знает про
 * бой, цели и заходы; ему дают направление и требуемое ускорение, он возвращает
 * позу, газ и остаток тела.
 *
 * ЗАЧЕМ ОН ПОНАДОБИЛСЯ. Боевой автомат до сих пор наводился ОДНИМ РЫСКАНИЕМ:
 * курс у него был парой чисел `[x, z]`, вертикали в словаре не было вовсе.
 * Ошибку прицеливания он при этом считал ЧЕСТНО ТРЁХМЕРНОЙ — по настоящей оси
 * ствола. Мерил в трёх измерениях, исправлял в одном; остаток по возвышению
 * видел и обнулить не мог ничем. Отсюда шесть высотных отказов на карте
 * конвертов, которые я записал в свойства машины, а они были свойством этого
 * пробела.
 *
 * ТРИ ВЕЩИ, КОТОРЫЕ ДЕЛАЮТ ЗАДАЧУ РАЗРЕШИМОЙ.
 *
 * 1. КРЕН ВОКРУГ ОСИ СТВОЛА СВОБОДЕН. Ствол закреплён на корпусе, значит
 *    вращение корпуса ВОКРУГ ЛИНИИ ОГНЯ не двигает прицел ни на угловую минуту.
 *    Поза, наводящая ствол, определена с точностью до этого вращения — и вот
 *    его-то и тратят на то, куда подставить подъёмную тягу. Две степени свободы
 *    держат прицел, третья двигает тело, и они не спорят.
 *
 * 2. ПОД ЗАДАННОЙ ПОЗОЙ ТЯГА ЧИТАЕТСЯ ВДОЛЬ ОСИ МАШИНЫ. Так устроен микшер
 *    (`rotorcraftDynamics.ts:1507`): деление на косинус наклона — это удержание
 *    МИРОВОЙ вертикали, а у перевёрнутой машины такой проекции нет вовсе.
 *    Значит подъёмная тяга — это вектор, приделанный к телу, и наклонить его
 *    можно только вместе с телом.
 *
 * 3. ТОННЕЛИ ТОЛКАЮТ ВДОЛЬ НОСА, ТО ЕСТЬ ВДОЛЬ СТВОЛА. Это второй, независимый
 *    орган, и его ось совпадает ровно с той, которую поза уже заняла прицелом.
 *
 * Отсюда РАЗЛОЖЕНИЕ, и оно исчерпывающее. Требуемая тяга — это заказанное
 * ускорение плюс вес. Её раскладывают по оси ствола и поперёк:
 *
 *     вдоль  → тоннели, предел `surgeAcceleration`
 *     поперёк → винты, предел `liftReserve · g`, и её направление ЕСТЬ поза
 *
 * Ни одного назначенного числа: оба предела паспортные. И тот же расклад
 * отвечает на второй вопрос Igor — про кошку, которая чувствует, что сейчас
 * свалится. Свалиться означает «поперечная составляющая больше, чем винты
 * могут дать»: тело не удержит себя в той позе, которую требует прицел. Это
 * не настроение и не таймер, это неравенство.
 */

const GRAVITY = 9.81;
const EPSILON = 1e-9;

export interface PostureCapability {
  /**
   * Во сколько раз располагаемая тяга больше веса. Прямо из паспорта:
   * `liftCapacity / (mass · g)`. Он же `figureReserve` у слоя фигур — это одна
   * и та же величина, и разойтись им нельзя.
   */
  readonly liftReserve: number;
  /** Продольное ускорение тоннелей, м/с². Ноль — тоннелей нет. */
  readonly surgeAcceleration: number;
}

export interface PostureSolution {
  /** Поза корпуса в мире, в которой ствол смотрит по заказанному направлению. */
  readonly attitude: Quaternion;
  /**
   * Доля веса СВЕРХ ВИСЕНИЯ, как её понимает контракт наведения: тяга вдоль
   * оси машины равна `(1 + liftFraction) · вес`.
   */
  readonly liftFraction: number;
  /** Скорость вдоль ствола, которую надо заказать тоннелям, м/с². */
  readonly surge: number;
  /**
   * ОСТАТОК ТЕЛА, 0..1. Единица — заказ исполняется с запасом по обоим органам,
   * ноль — упёрлись. Это и есть та величина, по которой зверь решает, прыгать
   * ли из нынешней позы.
   */
  readonly margin: number;
  /** Хватило ли тела вовсе. `false` — заказ невыполним, поза срезана. */
  readonly feasible: boolean;
  /**
   * ЧТО ИМЕННО УПЁРЛОСЬ. Недобор без причины — половина ответа, ровно как у
   * микшера: «не дам» против «не дам, потому что вот это».
   */
  readonly limit: "none" | "lift" | "surge";
}

/**
 * Тот же физический расклад без построения кватерниона. Поле коротких
 * намерений пробует его много раз, а полную позу исполнитель строит только для
 * одного победившего заказа.
 */
export interface PostureDemand {
  readonly axis: SceneVector3;
  readonly acceptedPerpendicular: SceneVector3;
  readonly acceptedAcceleration: SceneVector3;
  readonly liftFraction: number;
  readonly surge: number;
  readonly margin: number;
  readonly feasible: boolean;
  readonly limit: PostureSolution["limit"];
}

// ---------------------------------------------------------------------------
// Векторная мелочь
// ---------------------------------------------------------------------------

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(v: SceneVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function scale(v: SceneVector3, k: number): SceneVector3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function normalize(v: SceneVector3, fallback: SceneVector3 = [0, 0, 1]): SceneVector3 {
  const l = length(v);
  return l < EPSILON ? fallback : [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * КРАТЧАЙШИЙ ПОВОРОТ ОДНОГО ЕДИНИЧНОГО ВЕКТОРА В ДРУГОЙ.
 *
 * Через ось и угол, а не через матрицу: развёрнутый случай (векторы точно
 * противоположны) здесь виден и разбирается явно, а в матричном переводе он
 * прячется в вырождении следа и всплывает на перевёрнутой машине.
 */
function shortestArc(from: SceneVector3, to: SceneVector3): Quaternion {
  const axis = cross(from, to);
  const sine = length(axis);
  const cosine = dot(from, to);
  if (sine < EPSILON) {
    if (cosine > 0) {
      return [0, 0, 0, 1];
    }
    // Ровно назад: ось поворота любая перпендикулярная. Берут наименее
    // соосную координатную, иначе на носе вдоль неё же получится ноль.
    const seed: SceneVector3 =
      Math.abs(from[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    return quaternionAboutAxis(normalize(cross(from, seed)), Math.PI);
  }
  return quaternionAboutAxis(scale(axis, 1 / sine), Math.atan2(sine, cosine));
}

/**
 * ПОЗА ИЗ НАПРАВЛЕНИЯ НОСА И НАПРАВЛЕНИЯ «ВВЕРХ У ТЕЛА».
 *
 * Собирается двумя поворотами, а не переводом базиса в кватернион. Первый
 * ведёт авторский нос на заказанное направление кратчайшей дугой, второй
 * докручивает тело ВОКРУГ УЖЕ НАВЕДЁННОГО СТВОЛА до нужного «вверх». Второй
 * поворот по построению не может сбить прицел — он идёт по оси прицела, — и
 * это ровно та свобода, ради которой всё затевалось.
 */
export function aimAttitude(
  /** Авторский нос машины, горизонтальный единичный `[x, z]`. */
  nose: readonly [number, number],
  /** Куда должен смотреть ствол, единичный вектор в мире. */
  aim: SceneVector3,
  /** Куда должна смотреть подъёмная тяга, единичный вектор в мире. */
  up: SceneVector3,
): Quaternion {
  const authoredNose: SceneVector3 = [nose[0], 0, nose[1]];
  const authoredUp: SceneVector3 = [0, 1, 0];
  const swing = shortestArc(normalize(authoredNose, [0, 0, 1]), aim);
  const swungUp = rotateVector(swing, authoredUp);
  // Обе «вверх» уже перпендикулярны стволу; остаётся угол между ними вокруг
  // него. Знак берётся проекцией их векторного произведения на ось прицела —
  // так он не зависит от того, с какой стороны смотреть.
  const twist = Math.atan2(dot(cross(swungUp, up), aim), dot(swungUp, up));
  return normalizeQuaternion(
    multiplyQuaternions(quaternionAboutAxis(aim, twist), swing),
  );
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: ПОЗА, ГАЗ И ОСТАТОК ТЕЛА ПОД ЗАКАЗ.
 *
 * `wantedAcceleration` — то, что от тела требует ГЕОМЕТРИЯ (довернуть проход,
 * догнать, разойтись), без веса: вес добавляется здесь, потому что держать его
 * тоже приходится тем же винтам, и делать вид, что он бесплатен, — значит
 * обещать невыполнимое.
 *
 * ЧТО ПРОИСХОДИТ, КОГДА НЕ ХВАТАЕТ. Ничего драматического: поперечная
 * составляющая срезается до предела, поза строится по срезанной, а наружу
 * уходит `feasible: false` и причина. Решение, что с этим делать, принимает
 * тот, кто просил, — здесь его нет и быть не должно.
 */
export function postureDemand(
  aim: SceneVector3,
  wantedAcceleration: SceneVector3,
  capability: PostureCapability,
): PostureDemand {
  const axis = normalize(aim, [0, 0, 1]);
  // Тяга обязана дать заказанное ускорение И удержать вес.
  const required: SceneVector3 = [
    wantedAcceleration[0],
    wantedAcceleration[1] + GRAVITY,
    wantedAcceleration[2],
  ];
  const along = dot(required, axis);
  const perpendicular: SceneVector3 = [
    required[0] - axis[0] * along,
    required[1] - axis[1] * along,
    required[2] - axis[2] * along,
  ];
  const perpendicularMagnitude = length(perpendicular);

  const liftCeiling = Math.max(EPSILON, capability.liftReserve * GRAVITY);
  const surgeCeiling = Math.max(0, capability.surgeAcceleration);

  const liftShare = perpendicularMagnitude / liftCeiling;
  const surgeShare = surgeCeiling > EPSILON ? Math.abs(along) / surgeCeiling : Infinity;

  // ПОПЕРЁК СТВОЛА ТЕЛУ ДЕВАТЬСЯ НЕКУДА, ВДОЛЬ — ЕСТЬ КУДА.
  //
  // Недобор тоннелей означает всего лишь, что машина разгонится медленнее
  // заказанного: прицел от этого не уходит, поза остаётся той же. Недобор
  // винтов означает, что тело не удержит СЕБЯ в этой позе, — и вот это уже
  // «сейчас свалюсь». Поэтому невыполнимость объявляется по подъёму, а по
  // тоннелям только отмечается.
  const feasible = liftShare <= 1;
  const acceptedPerpendicular =
    liftShare > 1 ? scale(perpendicular, 1 / liftShare) : perpendicular;
  const acceptedMagnitude = length(acceptedPerpendicular);
  const surge =
    surgeCeiling > EPSILON
      ? Math.max(-surgeCeiling, Math.min(surgeCeiling, along))
      : 0;

  return {
    axis,
    acceptedPerpendicular,
    acceptedAcceleration: [
      acceptedPerpendicular[0] + axis[0] * surge,
      acceptedPerpendicular[1] + axis[1] * surge - GRAVITY,
      acceptedPerpendicular[2] + axis[2] * surge,
    ],
    liftFraction: acceptedMagnitude / GRAVITY - 1,
    surge,
    margin: Math.max(0, Math.min(1, 1 - Math.max(liftShare, Math.min(1, surgeShare)))),
    feasible,
    limit: !feasible ? "lift" : surgeShare > 1 ? "surge" : "none",
  };
}

export function solvePosture(
  nose: readonly [number, number],
  aim: SceneVector3,
  wantedAcceleration: SceneVector3,
  capability: PostureCapability,
): PostureSolution {
  const demand = postureDemand(aim, wantedAcceleration, capability);
  const { axis, acceptedPerpendicular } = demand;
  const acceptedMagnitude = length(acceptedPerpendicular);

  // Направление подъёмной тяги и есть «вверх» у тела. Если поперечной
  // составляющей нет вовсе — ствол смотрит точно вдоль требуемой тяги, —
  // крен ничем не определён, и берётся ближайшее к мировой вертикали: у
  // машины, которой всё равно, нет причины висеть вверх ногами.
  const up =
    acceptedMagnitude > 1e-4
      ? scale(acceptedPerpendicular, 1 / acceptedMagnitude)
      : normalize(
          [
            -axis[0] * axis[1],
            1 - axis[1] * axis[1],
            -axis[2] * axis[1],
          ],
          [0, 1, 0],
        );

  return {
    attitude: aimAttitude(nose, axis, up),
    liftFraction: demand.liftFraction,
    surge: demand.surge,
    margin: demand.margin,
    feasible: demand.feasible,
    limit: demand.limit,
  };
}

/**
 * ТЕМП ВРАЩЕНИЯ ЗАДАННОЙ ПОЗЫ — ЭТО ТЕМП ЛИНИИ ВИЗИРОВАНИЯ, И БОЛЬШЕ НИЧЕГО.
 *
 * Поза привязана к прицелу, прицел к цели; значит поза вращается ровно с той
 * угловой скоростью, с какой уходит направление на цель:
 *
 *     ω = (r × ṙ) / |r|²
 *
 * Это подача ВПЕРЁД, и она здесь по той же причине, по которой стоит в
 * горизонтальном контуре: пропорциональный регулятор, гоняющийся за пеленгом,
 * который сам уходит с темпом ω, держится с постоянным отставанием ω/k и
 * никогда его не выбирает. Разница в том, что здесь она трёхмерна.
 */
export function lineOfSightRotation(
  relativePosition: SceneVector3,
  relativeVelocity: SceneVector3,
): SceneVector3 {
  const squared =
    relativePosition[0] * relativePosition[0] +
    relativePosition[1] * relativePosition[1] +
    relativePosition[2] * relativePosition[2];
  if (squared < 1) {
    return [0, 0, 0];
  }
  const moment = cross(relativePosition, relativeVelocity);
  return scale(moment, 1 / squared);
}

/**
 * СКОЛЬКО МОЖНО ОТВЕРНУТЬ СТВОЛ ОТ ГОРИЗОНТА, ОСТАВАЯСЬ НА МЕСТЕ.
 *
 * Замкнутая форма, и она стоит отдельно от `solvePosture`: это ответ на вопрос
 * «на что моё тело способно вообще», который зверь задаёт ДО броска, а не в нём.
 *
 * ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ФУНКЦИИ БЫЛА НАПИСАНА ДЛЯ ЧУЖОЙ МАШИНЫ, и разбор стоит
 * того, чтобы остаться. Я вывел `liftReserve · cos θ ≥ 1`, то есть «подъём
 * обязан покрыть вес своей вертикальной проекцией», и получил 76° для RAX. Это
 * верно ровно для машины БЕЗ ТОННЕЛЕЙ. У этой они есть, и разложение само
 * показывает, что происходит на самом деле:
 *
 *   ствол вниз на θ  →  вдоль ствола требуется −g·sin θ,  поперёк  g·cos θ
 *
 * Поперечная часть с ростом θ УБЫВАЕТ — винтам становится легче, а не тяжелее.
 * Вес перехватывают тоннели реверсом: ствол смотрит вниз-вперёд, значит обратная
 * тяга идёт вверх-назад. На отвесном стволе поперечной части нет вовсе — машина
 * висит НА ОДНИХ ТОННЕЛЯХ, целясь в землю, с выключенными винтами.
 *
 * Поэтому предел ставит не подъём, а продольная тяга:
 *
 *     g · sin θ ≤ surge        →        θ ≤ arcsin(min(1, surge / g))
 *
 * У RAX-8 `surge` = 24.8 м/с² при g = 9.81 — отношение больше единицы, и предел
 * равен π/2. То есть ствол этой машины может смотреть КУДА УГОДНО, включая
 * отвесно вверх и отвесно вниз, и она при этом стоит на месте. У машины без
 * тоннелей ответ ноль, и это тоже правильно: её тяга и её ствол — одна ось.
 */
export function sustainableAimElevation(capability: PostureCapability): number {
  if (capability.liftReserve <= 1) {
    return 0;
  }
  return Math.asin(Math.min(1, Math.max(0, capability.surgeAcceleration) / GRAVITY));
}

/**
 * ОТЧЁТ ТЕЛА О СЕБЕ: то, что машина вернула, отработав прошлый кадр.
 *
 * Это ВТОРАЯ половина чувства тела, и она принципиально другая, чем первая.
 * `solvePosture` — предвидение: «судя по паспорту, должно хватить».
 * А вот здесь — ощущение: «держу или не держу». Между ними помещается всё, чего
 * паспорт не знает: выбитые кольца, уже набранные угловые скорости, запас
 * оборотов, съеденный рысканием.
 */
export interface BodyReport {
  /**
   * Доля заказанного отклонения позы, которую машина приняла
   * (`RotorcraftResult.maneuverScale`). Ноль означает, что она не может даже
   * начать доворачиваться и только удерживает нынешний угол.
   */
  readonly maneuverScale: number;
  /** Доля исполненного по подъёму (`RotorcraftAuthority.thrust`). */
  readonly thrust: number;
  /** По тангажу. */
  readonly pitch: number;
  /** По крену. */
  readonly roll: number;
}

export const BODY_UNREPORTED: BodyReport = {
  maneuverScale: 1,
  thrust: 1,
  pitch: 1,
  roll: 1,
};

/**
 * ПОРОГ «СЕЙЧАС СВАЛЮСЬ» — И ПОЧЕМУ ОН СТОИТ РОВНО НА ОДНОЙ ВЕЛИЧИНЕ.
 *
 * Первая редакция читала ЧЕТЫРЕ канала: `maneuverScale` и власть по подъёму,
 * тангажу и крену, порогом 0.5 — тем же, каким сторож судит об управляемости
 * (`rotorcraftCommandsExecute`). Рассуждение было симметричное и красивое, а
 * замер его убил за один прогон.
 *
 * ЧТО ПОКАЗАЛ ЗАМЕР. Власть по тангажу и крену проваливается в НОЛЬ постоянно —
 * и в сближении, и на срыве, то есть там, где позой никто не командует и машина
 * летит безупречно:
 *
 *     0.1s reposition ... ms=1.00 auth=1.00/0.00/1.00
 *     0.4s break      ... ms=1.00 auth=1.00/0.84/0.00
 *
 * Причина проста, когда её увидишь: `authority` — это ДОЛЯ ИСПОЛНЕННОГО ОТ
 * ЗАКАЗАННОГО, и на почти нулевом заказе она вырождается. Ноль от малого — это
 * не «не смогла», это «не просили». Как признак падения она бессмысленна, и
 * заход срывался четыре раза в секунду на ровном месте.
 *
 * `maneuverScale` устроен иначе, и потому остался один. Он отвечает не «сколько
 * дала», а «какую ДОЛЮ ЗАКАЗАННОГО ДОВОРОТА ПОЗЫ приняла»: единица — встану
 * куда просят, ноль — не могу даже начать и держу ту, что есть. Это ровно тот
 * вопрос, который зверь себе задаёт. В том же прогоне он стоял на 1.00 весь
 * полёт, а в фигурах проваливался в ноль ровно там, где машина действительно
 * теряла управление вверх ногами.
 *
 * Порог — половина, соглашением проекта: недобор в четверть ещё вялость, а
 * половина уже потеря управления.
 */
const BODY_LOST_MANEUVER = 0.5;

export function bodyHolding(report: BodyReport): boolean {
  return report.maneuverScale >= BODY_LOST_MANEUVER;
}
