/**
 * ВЫХОД ИЗ СТОЛКНОВЕНИЯ — инстинкт, а не сценарий.
 *
 * Задача Igor (12.08.2026): «Инстинкт нас заставляет избегать столкновений. Но
 * если оно случилось, мы не падаем плашмя, а выходим из него тоже наиболее
 * эффективным способом. Буквально обратным тому, что привело к столкновению,
 * но тут надо проверить кейсы, могу быть неправ».
 *
 * КЕЙСЫ ПРОВЕРЕНЫ (`tests/vehicle-collision-escape.test.mjs`, девять геометрий
 * зацепа, четыре правила). Гипотеза верна как ОСНОВА и неверна как
 * ЕДИНСТВЕННОЕ правило — и обе половины этого вывода измеримы:
 *
 * - «обратное входу» само по себе выбирается из шести случаев из девяти и
 *   ЕДИНСТВЕННОЕ решает щель, в которой машину зажало между двумя телами:
 *   там нормали контактов гасят друг друга, и правило «иди туда, куда мир
 *   толкает» не даёт вовсе никакого направления;
 * - зато оно бессильно там, где двигалась НЕ МАШИНА: чужое тело легло сверху
 *   или ударило в борт, вход нулевой, обращать нечего. Здесь спасает нормаль;
 * - и оба правила вместе не открывают КАРМАН — тупик, вход в который закрылся
 *   после того, как машина в него влетела. Единственный выход оттуда — не
 *   сдаваться: поворачивать попытку, пока не пойдёт.
 *
 * Отсюда правило, которое здесь и живёт: ОБРАТНОЕ ВХОДУ КАК ОСНОВА, НОРМАЛЬ
 * КОНТАКТА КАК ПОПРАВКА, ПОВОРОТ ПОПЫТКИ КАК УПОРСТВО. Девять из девяти.
 *
 * Знания в двух слагаемых разные, и одно из другого не выводится: обратный
 * вход знает, что ПОЗАДИ СВОБОДНО (машина оттуда прилетела), нормаль знает,
 * где ИМЕННО зажало. Поэтому они складываются, а не выбираются.
 *
 * Модуль чистый: ни React, ни Rapier, ни имён машин. На входе снимок
 * контактов и положение, на выходе направление в мировых осях.
 */

import type { SceneVector3 } from "./destructionScene.ts";

const EPSILON = 1e-6;

const length = (vector: SceneVector3): number =>
  Math.hypot(vector[0], vector[1], vector[2]);

const normalize = (vector: SceneVector3): SceneVector3 => {
  const size = length(vector);
  return size > EPSILON
    ? [vector[0] / size, vector[1] / size, vector[2] / size]
    : [0, 0, 0];
};

const cross = (a: SceneVector3, b: SceneVector3): SceneVector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Вес нормали в сумме. Меньше единицы намеренно: нормаль ПОПРАВЛЯЕТ основу,
 * а не спорит с ней. На касательном чирке о стену полный вес разворачивал
 * машину поперёк её же пути, и выход занимал вдвое дольше.
 */
const PUSH_WEIGHT = 0.6;

/**
 * Путь, который считается доказательством, что попытка работает, м.
 * Ползти — это тоже выбираться: из щели машина выходит за 4.8 с, и всё это
 * время зазор не растёт вовсе.
 */
const PROGRESS_DISTANCE = 0.05;

/**
 * Сколько машина терпит полную неподвижность, прежде чем повернуть попытку, с.
 * Первая редакция мерила прогресс ЗАЗОРОМ и с тем же терпением бросала
 * работающее вытягивание из щели на второй секунде.
 */
const PATIENCE_SECONDS = 0.6;

/** Шаг поворота попытки. Шесть шагов — полный оборот. */
const TURN_STEP = Math.PI / 3;

export interface CollisionEscapeState {
  /**
   * Скорость в миг, когда контакт начался, — то самое «что привело к
   * столкновению». Запоминается один раз за эпизод: пересматривать её внутри
   * зацепа значит принять за вход собственную возню.
   */
  readonly entryVelocity: SceneVector3;
  /** Последнее осмысленное направление: манёвр доводится, а не обрывается. */
  readonly direction: SceneVector3;
  /** Путь с последней смены попытки, м. */
  readonly travelled: number;
  /** Сколько машина стоит на месте, с. */
  readonly stalledSeconds: number;
  /** На сколько повёрнута попытка, рад. */
  readonly turn: number;
  /** Где машина была в прошлом шаге. */
  readonly position: SceneVector3 | null;
  /** Сколько длится эпизод, с. */
  readonly seconds: number;
}

export interface CollisionEscapeContact {
  readonly count: number;
  /** Куда мир толкает машину: единичный, к телу. */
  readonly push: readonly [number, number, number];
}

export interface CollisionEscapeInput {
  readonly contact: CollisionEscapeContact;
  readonly position: SceneVector3;
  readonly deltaSeconds: number;
}

export interface CollisionEscapeOutput {
  readonly state: CollisionEscapeState;
  /**
   * Куда выбираться, в мировых осях. Нулевой вектор означает, что выбираться
   * не из чего и доводить нечего.
   */
  readonly direction: SceneVector3;
}

/** Начало эпизода: запоминается ровно то, что привело в столкновение. */
export function beginCollisionEscape(
  entryVelocity: SceneVector3,
): CollisionEscapeState {
  return {
    entryVelocity: [entryVelocity[0], entryVelocity[1], entryVelocity[2]],
    direction: [0, 0, 0],
    travelled: 0,
    stalledSeconds: 0,
    turn: 0,
    position: null,
    seconds: 0,
  };
}

/**
 * Основа решения без упорства: обратное входу плюс нормаль как поправка.
 * Вынесено отдельно, потому что это и есть проверяемая гипотеза Igor, и
 * читать её надо не сквозь механику поворота.
 */
function escapeBearing(
  entryVelocity: SceneVector3,
  contact: CollisionEscapeContact,
): SceneVector3 {
  const back = normalize(entryVelocity);
  const backward: SceneVector3 = [-back[0], -back[1], -back[2]];
  if (contact.count === 0) {
    return backward;
  }
  const push = contact.push;
  if (length(backward) < EPSILON) {
    // Двигалась не машина: обращать нечего, и остаётся единственное, что мир
    // сообщает о себе сам, — куда он давит.
    return [push[0], push[1], push[2]];
  }
  return normalize([
    backward[0] + push[0] * PUSH_WEIGHT,
    backward[1] + push[1] * PUSH_WEIGHT,
    backward[2] + push[2] * PUSH_WEIGHT,
  ]);
}

/** Повернуть попытку вокруг оси, перпендикулярной ей самой. */
function turned(bearing: SceneVector3, turn: number): SceneVector3 {
  // Ось — наименее сонаправленная с попыткой координатная: так поворот
  // всегда уводит в сторону, а не вырождается в ноль.
  const axis = normalize(
    Math.abs(bearing[1]) < 0.9
      ? cross(bearing, [0, 1, 0])
      : cross(bearing, [1, 0, 0]),
  );
  if (length(axis) < EPSILON) {
    return bearing;
  }
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  const perpendicular = cross(axis, bearing);
  const along =
    axis[0] * bearing[0] + axis[1] * bearing[1] + axis[2] * bearing[2];
  // Родригес.
  return normalize([
    bearing[0] * cosine + perpendicular[0] * sine + axis[0] * along * (1 - cosine),
    bearing[1] * cosine + perpendicular[1] * sine + axis[1] * along * (1 - cosine),
    bearing[2] * cosine + perpendicular[2] * sine + axis[2] * along * (1 - cosine),
  ]);
}

/**
 * ШАГ ВЫХОДА.
 *
 * Возвращает направление, а не тягу: сколько дать — дело распределителя,
 * который один знает, что у машины осталось.
 */
export function stepCollisionEscape(
  state: CollisionEscapeState,
  input: CollisionEscapeInput,
): CollisionEscapeOutput {
  const delta = Math.max(0, input.deltaSeconds);
  const moved = state.position
    ? Math.hypot(
        input.position[0] - state.position[0],
        input.position[1] - state.position[1],
        input.position[2] - state.position[2],
      )
    : 0;
  let travelled = state.travelled + moved;
  let stalledSeconds = state.stalledSeconds + delta;
  let turn = state.turn;
  if (travelled > PROGRESS_DISTANCE) {
    travelled = 0;
    stalledSeconds = 0;
  } else if (stalledSeconds > PATIENCE_SECONDS) {
    stalledSeconds = 0;
    turn += TURN_STEP;
  }

  const bearing = escapeBearing(state.entryVelocity, input.contact);
  const wanted =
    length(bearing) < EPSILON
      ? // Ни входа, ни контакта — решать не из чего. Доводим начатое.
        state.direction
      : turn > EPSILON
        ? turned(bearing, turn)
        : bearing;
  // ДОВОДКА. Манёвр не обрывается в тот миг, когда контакт пропал: машина ещё
  // в габарите препятствия, и снятая тяга возвращает её обратно. Замер: без
  // доводки правило «по нормали» теряло секунду на каждом случае, а упорное
  // и вовсе толкало себя назад в тело.
  const direction = length(wanted) > EPSILON ? wanted : state.direction;
  return {
    state: {
      entryVelocity: state.entryVelocity,
      direction,
      travelled,
      stalledSeconds,
      turn,
      position: [input.position[0], input.position[1], input.position[2]],
      seconds: state.seconds + delta,
    },
    direction,
  };
}
