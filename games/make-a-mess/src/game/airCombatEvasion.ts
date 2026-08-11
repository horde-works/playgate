/**
 * УКЛОНЕНИЕ ЖЕРТВЫ: как машина уходит с прицела, НЕ БРОСАЯ СВОЕЙ ЗАДАЧИ.
 *
 * Это вторая половина воздушного боя и вторая пара глаз на том же поле.
 * Охотник живёт в `airCombatPilot`; здесь — тот, за кем охотятся.
 *
 * ТРИ РЕШЕНИЯ, КОТОРЫЕ ОПРЕДЕЛЯЮТ ВСЁ ОСТАЛЬНОЕ.
 *
 * 1. УКЛОНЕНИЕ — ПОПРАВКА К ТРАССЕ, А НЕ ОТДЕЛЬНЫЙ АВТОМАТ. Машина продолжает
 *    лететь свой маршрут; манёвр добавляется поверх и гаснет сам. Жертва,
 *    бросающая задачу при первом испуге, выглядит глупо и перестаёт быть
 *    целью, за которой интересно охотиться.
 *
 * 2. УГРОЗУ ВИДНО ПО ТРАЕКТОРИИ, А НЕ ПО СТВОЛУ. В снимке чужого борта
 *    (`AirCombatTrack`) нет ориентации — и не будет: это та самая граница
 *    слепоты, на которой держится баланс боя. Знать, куда смотрит ствол,
 *    жертва не может. Зато она видит положение и скорость, а этого хватает
 *    для морского правила: ПЕЛЕНГ НЕ МЕНЯЕТСЯ, ДИСТАНЦИЯ ПАДАЕТ — значит он
 *    идёт на тебя. Оно же ловит настоящий заход и не ловит пролетающего мимо.
 *
 * 3. МАНЁВР ВЫБИРАЕТСЯ ОДИН РАЗ И ДОВОДИТСЯ. Дрожание — главная ловушка этого
 *    места: жертва, пересматривающая решение каждый кадр, дёргается на месте
 *    и никуда не уходит. Поэтому у рывка есть срок, и внутри срока он не
 *    пересматривается — тот же закон, по которому охотник доводит заход.
 *
 * Здесь нет ни React, ни Rapier, ни имён машин: на входе числа, на выходе
 * числа.
 */

import type { SceneVector3 } from "./destructionScene.ts";
import { lineOfSightRotation } from "./airCombatPosture.ts";
import type { AirCombatTrack } from "./vehicleGunnery.ts";
import { isHostileAllegiance, type VehicleAllegiance } from "./vehicleAllegiance.ts";

/** Что машина знает о себе, уклоняясь. */
export interface EvasionOwnState {
  readonly allegiance: VehicleAllegiance;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
}

/**
 * Паспортная способность уклоняться. Нет поля — машина не уклоняется вовсе,
 * и это законный ответ: драккар и состав неба не должны дёргаться от чужой
 * скорости.
 */
export interface EvasionCapability {
  /**
   * Насколько сильно машина сходит с линии, м/с. Не ускорение и не «сила»:
   * это боковая скорость, которую уклонение просит у общего контура, и он
   * ограничит её тем, что машина реально может.
   */
  readonly breakSpeed: number;
  /** Сколько рывок длится, с. Внутри срока решение не пересматривается. */
  readonly breakSeconds: number;
  /**
   * За сколько секунд до встречи считать угрозу настоящей. Ниже — уклоняемся.
   * Это ВРЕМЯ, а не дальность: медленный борт на той же дистанции не опасен.
   */
  readonly warningSeconds: number;
}

export interface EvasionState {
  /** Сколько секунд рывка осталось. Ноль — машина идёт своей трассой. */
  readonly breakSeconds: number;
  /** Направление рывка в мире, единичное. Ноль-вектор — рывка нет. */
  readonly breakDirection: SceneVector3;
  /** Кого испугались. Нужно, чтобы не пересматривать решение на том же борте. */
  readonly threatId: string | null;
}

export interface EvasionInput {
  readonly own: EvasionOwnState;
  readonly tracks: readonly AirCombatTrack[];
  readonly capability: EvasionCapability;
  readonly deltaSeconds: number;
  readonly state: EvasionState;
  /**
   * Высота палубы: ниже неё уклоняться вниз нельзя. Без неё машина уходит от
   * пушки в землю, что охотника более чем устраивает.
   */
  readonly deck: number;
  /**
   * Кромка мира: центр и радиус, за которые уходить нельзя. КОНВЕРТ ФИЛЬТРУЕТ
   * НАБОР НАПРАВЛЕНИЙ ДО ВЫБОРА ПО УГРОЗЕ, а не после: наивный «максимум
   * расхождения с линией огня» — это окружность направлений, и половина её
   * ведёт в грунт или за кромку. Красиво увернуться в дом — не уклонение.
   */
  readonly boundary?: { readonly centre: SceneVector3; readonly radius: number };
}

export interface EvasionOutput {
  readonly state: EvasionState;
  /**
   * Поправка к скорости, м/с, в мировых осях. Ноль — трасса идёт как шла.
   * Общий контур накладывает её поверх маршрутного требования.
   */
  readonly velocityOffset: SceneVector3;
  /** Кто сейчас страшен. Для ленты и разбора, решение уже принято. */
  readonly threatId: string | null;
  /** Секунды до встречи с самым опасным бортом; `null` — никого. */
  readonly closingSeconds: number | null;
}

export function createEvasionState(): EvasionState {
  return { breakSeconds: 0, breakDirection: [0, 0, 0], threatId: null };
}

const EPSILON = 1e-6;

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: SceneVector3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function scale(v: SceneVector3, k: number): SceneVector3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function normalize(v: SceneVector3): SceneVector3 {
  const len = length(v);
  return len < EPSILON ? [0, 0, 0] : scale(v, 1 / len);
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * СЕКУНДЫ ДО ВСТРЕЧИ, если оба идут как идут. `null` — борт не сближается.
 *
 * Считается по проекции относительной скорости на линию визирования, а не по
 * модулю: борт, проходящий мимо на большой скорости, к встрече не ведёт, и
 * пугаться его незачем.
 */
export function closingSeconds(
  own: EvasionOwnState,
  track: AirCombatTrack,
): number | null {
  const relative = subtract(track.centre, own.centre);
  const range = length(relative);
  if (range < EPSILON) {
    return 0;
  }
  const line = scale(relative, 1 / range);
  const approach = subtract(own.velocity, track.velocity);
  const closing = approach[0] * line[0] + approach[1] * line[1] + approach[2] * line[2];
  return closing <= EPSILON ? null : range / closing;
}

/**
 * ИДЁТ ЛИ ОН НА МЕНЯ — правило постоянного пеленга.
 *
 * Вращение линии визирования — это то, насколько борт СМЕЩАЕТСЯ вбок
 * относительно меня. Ноль означает встречу: он держит меня на неизменном
 * пеленге и сокращает дистанцию, то есть целится или таранит. Большое
 * вращение — пролёт мимо.
 *
 * Порог берётся не из воздуха, а из времени до встречи: за оставшиеся
 * секунды борт при таком вращении сместится вбок на `ω·t·range`, и если это
 * меньше габарита машины — он всё равно придёт в неё.
 */
export function onCollisionCourse(
  own: EvasionOwnState,
  track: AirCombatTrack,
  seconds: number,
): boolean {
  const relative = subtract(track.centre, own.centre);
  const range = length(relative);
  if (range < EPSILON) {
    return true;
  }
  const omega = length(
    lineOfSightRotation(relative, subtract(track.velocity, own.velocity)),
  );
  // Промах, который он наберёт к моменту встречи, против его же габарита.
  const miss = omega * seconds * range;
  return miss <= Math.max(track.radius, 1) * 3;
}

/**
 * КУДА РВАТЬ. Поперёк линии визирования — там его прицелу дороже всего.
 *
 * Из двух поперечных направлений берётся то, что уводит ВВЕРХ И В СТОРОНУ от
 * его курса: вниз уходить нельзя (там палуба и земля), а разворот навстречу
 * его же смещению только облегчает ему задачу.
 */
export function breakDirection(
  own: EvasionOwnState,
  track: AirCombatTrack,
  deck: number,
  boundary?: { readonly centre: SceneVector3; readonly radius: number },
): SceneVector3 {
  const line = normalize(subtract(track.centre, own.centre));
  if (length(line) < EPSILON) {
    return [0, 1, 0];
  }
  // Поперечное направление, лежащее в горизонте: уходить вбок дешевле всего,
  // потому что у коптера это чистая тяга наклоном.
  const lateral = normalize(cross(line, [0, 1, 0]));
  // Вверх добавляется всегда, но не как половина рывка: вертикаль у
  // винтокрылой дороже горизонтали, и просить её поровну значит не получить
  // ни того, ни другого. У самой палубы вертикаль дорожает — уходить вниз
  // некуда, и вверх становится главным.
  const room = own.centre[1] - deck;
  const climb = room < 12 ? 0.6 : 0.35;

  // КОНВЕРТ СНАЧАЛА. Кандидатов всего два — вбок и вбок наоборот; каждому
  // считается, сколько у него места, и только среди уцелевших выбирается тот,
  // что дороже обходится прицелу.
  const candidates: SceneVector3[] = [
    normalize([lateral[0], climb, lateral[2]]),
    normalize([-lateral[0], climb, -lateral[2]]),
  ];
  const room4 = (direction: SceneVector3): number => {
    if (!boundary) {
      return 1;
    }
    // Куда машина придёт за секунду рывка, и насколько это ближе к кромке.
    const ahead: SceneVector3 = [
      own.centre[0] + direction[0] * 20,
      own.centre[1] + direction[1] * 20,
      own.centre[2] + direction[2] * 20,
    ];
    const offset = Math.hypot(
      ahead[0] - boundary.centre[0],
      ahead[2] - boundary.centre[2],
    );
    return boundary.radius - offset;
  };
  const safe = candidates.filter((direction) => room4(direction) > 0);
  const allowed = safe.length > 0 ? safe : candidates;
  // Из уцелевших — тот, что уводит ПРОТИВ его смещения: доворачиваться туда,
  // куда он и так летит, значит помогать ему целиться.
  let best = allowed[0];
  let bestCost = -Infinity;
  for (const direction of allowed) {
    const against = -(
      direction[0] * track.velocity[0] + direction[2] * track.velocity[2]
    );
    if (against > bestCost) {
      bestCost = against;
      best = direction;
    }
  }

  // РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ.
  //
  // Из направления убирается составляющая вдоль СВОЕЙ скорости. Под огнём не
  // сбрасывают ход: тормозящая жертва становится удобнее для упреждения, а не
  // труднее, и вдобавок бросает свою задачу — она перестаёт лететь маршрут и
  // начинает висеть. Замер первой редакции, где эта проекция не снималась:
  // средняя скорость жертвы падала с 12–14 до 4.2 м/с, то есть она выживала
  // не манёвром, а бегством.
  const heading = normalize(own.velocity);
  if (length(heading) < EPSILON) {
    return best;
  }
  const along =
    best[0] * heading[0] + best[1] * heading[1] + best[2] * heading[2];
  const across = normalize([
    best[0] - heading[0] * along,
    best[1] - heading[1] * along,
    best[2] - heading[2] * along,
  ]);
  // Рывок ровно вдоль курса вырождается: тогда уходим вверх, это всегда поперёк.
  return length(across) < EPSILON ? [0, 1, 0] : across;
}

/**
 * ШАГ УКЛОНЕНИЯ.
 *
 * Порядок намеренный: сперва доводится начатый рывок, и только если он
 * кончился — ищется новая угроза. Пересматривать решение внутри рывка нельзя,
 * иначе машина дрожит на месте вместо того, чтобы уходить.
 */
export function stepEvasion(input: EvasionInput): EvasionOutput {
  const { own, tracks, capability, deltaSeconds, state, deck } = input;

  // Самый опасный борт: враждебный, живой, летящий и идущий на встречу.
  let threat: AirCombatTrack | null = null;
  let threatSeconds: number | null = null;
  for (const track of tracks) {
    if (
      track.landed ||
      track.failed ||
      !isHostileAllegiance(own.allegiance, track.allegiance)
    ) {
      continue;
    }
    const seconds = closingSeconds(own, track);
    if (seconds === null || seconds > capability.warningSeconds) {
      continue;
    }
    if (!onCollisionCourse(own, track, seconds)) {
      continue;
    }
    if (threatSeconds === null || seconds < threatSeconds) {
      threat = track;
      threatSeconds = seconds;
    }
  }

  const remaining = Math.max(0, state.breakSeconds - deltaSeconds);
  if (remaining > 0) {
    // Рывок идёт — доводим его до конца тем же направлением.
    return {
      state: { ...state, breakSeconds: remaining },
      velocityOffset: scale(state.breakDirection, capability.breakSpeed),
      threatId: threat?.id ?? state.threatId,
      closingSeconds: threatSeconds,
    };
  }

  if (!threat) {
    return {
      state: createEvasionState(),
      velocityOffset: [0, 0, 0],
      threatId: null,
      closingSeconds: null,
    };
  }

  const direction = breakDirection(own, threat, deck, input.boundary);
  // ВЫДЕРЖКА РЫВКА ГУЛЯЕТ, И ЭТО НЕ УКРАШЕНИЕ. Два реактивных контура с
  // одинаковыми постоянными времени сцепляются в устойчивый танец, где манёвр
  // жертвы становится функцией от того, что делает охотник, — то есть
  // идеально упреждаемым. Разброс берётся из ГЕОМЕТРИИ (секунды до встречи),
  // а не из случайного числа: тогда он не периодичен и при этом воспроизводим
  // в тесте.
  const jitter = 0.7 + 0.6 * ((threatSeconds ?? 0) % 1);
  return {
    state: {
      breakSeconds: capability.breakSeconds * jitter,
      breakDirection: direction,
      threatId: threat.id,
    },
    velocityOffset: scale(direction, capability.breakSpeed),
    threatId: threat.id,
    closingSeconds: threatSeconds,
  };
}
