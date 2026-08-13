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
 * 2. УКЛОНЯЮТСЯ ОТ ПУСКА, А НЕ ОТ ПОДОЗРИТЕЛЬНОГО ПОВЕДЕНИЯ (вердикт Igor,
 *    11.08.2026). Первая редакция пугалась геометрии сближения — то есть
 *    самого факта, что кто-то идёт на тебя. Это неверно с двух сторон: от
 *    ПУШКИ увернуться нельзя вовсе, луч мгновенный, а дёргаться до выстрела
 *    значит показывать ясновидение и суетиться зря.
 *
 *    Уклоняются от того, что ЛЕТИТ и имеет время полёта: от ракеты. Пуск —
 *    событие, и он же триггер.
 *
 * 2а. НЕ ПОПАДАЕТ — НЕ ДЁРГАЙСЯ. Правило израильской ПВО и здесь главное:
 *    ракета, чей промах и так больше радиуса поражения, манёвра не стоит.
 *    Считается сближение по настоящим траекториям обоих, а не «летит в мою
 *    сторону».
 *
 * 3. МАНЁВР ВЫБИРАЕТСЯ ОДИН РАЗ И ДОВОДИТСЯ. Дрожание — главная ловушка этого
 *    места: жертва, пересматривающая решение каждый кадр, дёргается на месте
 *    и никуда не уходит. Единственное исключение — новая ракета, которая
 *    придёт раньше нынешней: доводить устаревший рефлекс ей навстречу было бы
 *    уже не устойчивостью, а слепотой.
 *
 * Здесь нет ни React, ни Rapier, ни имён машин: на входе числа, на выходе
 * числа.
 */

import type { SceneVector3 } from "./destructionScene.ts";
import { lineOfSightRotation } from "./airCombatPosture.ts";
import type { AirCombatTrack } from "./vehicleGunnery.ts";
import {
  explosiveProfile,
  type ExplosiveKind,
} from "./destructionRuntime.ts";
import type { Quaternion } from "./clusterDynamics.ts";
import {
  chooseEvasionCorrection,
  type EvasionDynamics,
} from "./airCombatEvasionField.ts";

/** Что машина знает о себе, уклоняясь. */
export interface EvasionOwnState {
  /** Владелец своих снарядов: единственная ракета, которую можно игнорировать. */
  readonly id: string;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Настоящий габарит текущего кадра, а не дубль числа в паспорте уклонения. */
  readonly radius: number;
}

/**
 * РАКЕТА В ВОЗДУХЕ — то, от чего уклоняются. Положение, скорость и радиус
 * поражения, остаток взрывателя и владелец: больше жертве знать не нужно.
 */
export interface RocketThreat {
  readonly id: number;
  /** `null` оставлен внешним снарядам без владельца; они опасны всем. */
  readonly ownerId: string | null;
  readonly kind: Extract<ExplosiveKind, "rocket" | "lance" | "podRocket">;
  readonly position: SceneVector3;
  readonly velocity: SceneVector3;
  readonly blastRadius: number;
  /** Сколько физического полёта осталось до самоликвидации, с. */
  readonly remainingSeconds: number;
}

export interface RocketThreatRegistry {
  readonly current: Map<number, RocketThreat>;
}

/**
 * Один вход в воздушную обстановку для пользовательских и бортовых снарядов.
 * Скорость берётся с физического тела снаружи, поражающий радиус — из
 * паспорта боеприпаса здесь. Граната не становится ракетой из-за общего пула.
 */
export function projectileRocketThreat(
  id: number,
  ownerId: string | null,
  kind: ExplosiveKind,
  position: SceneVector3,
  velocity: SceneVector3,
  ageSeconds = 0,
): RocketThreat | null {
  if (kind !== "rocket" && kind !== "lance" && kind !== "podRocket") {
    return null;
  }
  const profile = explosiveProfile(kind);
  return {
    id,
    ownerId,
    kind,
    position,
    velocity,
    blastRadius: profile.blastRadius,
    remainingSeconds: Math.max(0, profile.projectile.fuseMs / 1_000 - ageSeconds),
  };
}

/**
 * СБЛИЖЕНИЕ С РАКЕТОЙ: через сколько секунд она пройдёт ближе всего и на
 * каком расстоянии. Считается по относительному движению обоих — ракета
 * быстрая, но и жертва не стоит.
 *
 * `seconds <= 0` означает, что ближайшая точка уже позади: ракета промахнулась
 * и уходит, дёргаться поздно и незачем.
 */
export function rocketApproach(
  own: EvasionOwnState,
  rocket: RocketThreat,
): { readonly seconds: number; readonly miss: number; readonly offset: SceneVector3 } {
  const relative = subtract(rocket.position, own.centre);
  const closing = subtract(rocket.velocity, own.velocity);
  const speedSq = closing[0] ** 2 + closing[1] ** 2 + closing[2] ** 2;
  if (speedSq < EPSILON) {
    return { seconds: 0, miss: length(relative), offset: scale(relative, -1) };
  }
  const seconds = -(
    relative[0] * closing[0] +
    relative[1] * closing[1] +
    relative[2] * closing[2]
  ) / speedSq;
  const at: SceneVector3 = [
    relative[0] + closing[0] * seconds,
    relative[1] + closing[1] * seconds,
    relative[2] + closing[2] * seconds,
  ];
  // Вектор промаха смотрит ОТ ракеты К машине: рвать вдоль него — прямейший
  // способ увеличить промах.
  return { seconds, miss: length(at), offset: scale(at, -1) };
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
   * Запас к радиусу поражения, м. Ноль означал бы уклонение ровно на границе,
   * где ошибка в дециметр решает; запас покупает право ошибиться.
   */
  readonly margin: number;
  /**
   * Дальше этого горизонта пуск не тревожит: ракета ещё далеко, и решение
   * успеет принять следующий кадр. Секунды, а не метры.
   */
  readonly horizonSeconds: number;
}

export interface EvasionState {
  /** Сколько секунд рывка осталось. Ноль — машина идёт своей трассой. */
  readonly breakSeconds: number;
  /** Направление рывка в мире, единичное. Ноль-вектор — рывка нет. */
  readonly breakDirection: SceneVector3;
  /** От какой ракеты уходим. Нужно, чтобы не начинать рывок дважды. */
  readonly threatId: number | null;
  /** Последняя фактическая срочность выбранной ракеты. */
  readonly closingSeconds?: number | null;
  /** Победившее физически достижимое требование живёт весь рывок. */
  readonly velocityOffset?: SceneVector3;
  readonly acceleration?: SceneVector3;
  readonly attitude?: Quaternion | null;
  readonly liftFraction?: number | null;
  readonly survivalMargin?: number | null;
}

export interface EvasionInput {
  readonly own: EvasionOwnState;
  /** Ракеты в воздухе. Пусто — уклоняться не от чего, и это норма. */
  readonly rockets: readonly RocketThreat[];
  readonly capability: EvasionCapability;
  readonly deltaSeconds: number;
  readonly state: EvasionState;
  /** Живое тело; без него остаётся прежняя сферическая коррекция. */
  readonly dynamics?: EvasionDynamics;
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
  /** От какой ракеты уходим. Для ленты и разбора, решение уже принято. */
  readonly threatId: number | null;
  /** Секунды до сближения с ней; `null` — никого. */
  readonly closingSeconds: number | null;
  /** Насколько она прошла бы мимо, если не двигаться, м. */
  readonly miss: number | null;
  /** Всевекторное требование для общего физического контура. */
  readonly acceleration?: SceneVector3;
  readonly attitude?: Quaternion | null;
  readonly liftFraction?: number | null;
  readonly survivalMargin?: number | null;
}

export function createEvasionState(): EvasionState {
  return {
    breakSeconds: 0,
    breakDirection: [0, 0, 0],
    threatId: null,
    closingSeconds: null,
    velocityOffset: [0, 0, 0],
    acceleration: [0, 0, 0],
    attitude: null,
    liftFraction: null,
    survivalMargin: null,
  };
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
  missOffset: SceneVector3,
  deck: number,
  boundary?: { readonly centre: SceneVector3; readonly radius: number },
): SceneVector3 {
  // ВДОЛЬ ВЕКТОРА ПРОМАХА. В точке наибольшего сближения уже известно, с какой
  // стороны ракета пройдёт; уходить надо туда же, только дальше. Это не
  // эвристика «вбок от линии огня», а прямая производная промаха по смещению.
  let wanted = normalize(missOffset);
  if (length(wanted) < EPSILON) {
    // Ракета идёт точно в центр: любая поперечная сторона одинаково хороша,
    // берём вверх — там у винтокрылой всегда есть тяга.
    wanted = [0, 1, 0];
  }

  // КОНВЕРТ СНАЧАЛА. У самой палубы вниз нельзя, за кромку мира нельзя.
  const room = own.centre[1] - deck;
  if (room < 12 && wanted[1] < 0) {
    wanted = normalize([wanted[0], Math.abs(wanted[1]), wanted[2]]);
  }
  if (boundary) {
    const ahead = Math.hypot(
      own.centre[0] + wanted[0] * 20 - boundary.centre[0],
      own.centre[2] + wanted[2] * 20 - boundary.centre[2],
    );
    if (ahead > boundary.radius) {
      // Наружу нельзя — остаётся то же смещение, вывернутое внутрь мира.
      wanted = normalize([-wanted[0], Math.max(wanted[1], 0.4), -wanted[2]]);
    }
  }

  // РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ: составляющая вдоль собственной скорости
  // снимается. Тормозящая жертва удобнее для упреждения, а не труднее, и
  // вдобавок бросает свою задачу.
  const heading = normalize(own.velocity);
  if (length(heading) < EPSILON) {
    return wanted;
  }
  const along =
    wanted[0] * heading[0] + wanted[1] * heading[1] + wanted[2] * heading[2];
  const across = normalize([
    wanted[0] - heading[0] * along,
    wanted[1] - heading[1] * along,
    wanted[2] - heading[2] * along,
  ]);
  return length(across) < EPSILON ? [0, 1, 0] : across;
}

/**
 * ШАГ УКЛОНЕНИЯ.
 *
 * Порядок намеренный: начатый рывок доводится без покадрового пересмотра.
 * Новая ракета получает право прервать его только если прежней уже нет среди
 * угроз либо новая придёт заметно раньше. Это не выбор «красивее», а смена
 * физически главной опасности.
 */
export function stepEvasion(input: EvasionInput): EvasionOutput {
  const { own, rockets, capability, deltaSeconds, state, deck } = input;

  // Самая опасная ракета: та, что придёт ближе всего и раньше всех. НЕ
  // ПОПАДАЕТ — НЕ СЧИТАЕТСЯ: промах больше радиуса поражения с запасом
  // означает, что манёвр только испортит собственный маршрут.
  const lethal = own.radius + capability.margin;
  let threat: RocketThreat | null = null;
  let threatSeconds: number | null = null;
  let threatMiss: number | null = null;
  const threatening: RocketThreat[] = [];
  const closingByThreat = new Map<number, number>();
  for (const rocket of rockets) {
    if (rocket.ownerId === own.id) {
      continue;
    }
    const { seconds, miss } = rocketApproach(own, rocket);
    if (
      seconds <= 0 ||
      seconds > capability.horizonSeconds ||
      seconds > rocket.remainingSeconds
    ) {
      continue;
    }
    if (miss > rocket.blastRadius + lethal) {
      continue;
    }
    threatening.push(rocket);
    closingByThreat.set(rocket.id, seconds);
    if (threatSeconds === null || seconds < threatSeconds) {
      threat = rocket;
      threatSeconds = seconds;
      threatMiss = miss;
    }
  }

  const remaining = Math.max(0, state.breakSeconds - deltaSeconds);
  const committedSeconds = state.threatId === null
    ? null
    : closingByThreat.get(state.threatId) ?? null;
  const urgentReplacement =
    remaining > 0 &&
    threat !== null &&
    threat.id !== state.threatId &&
    (committedSeconds === null ||
      (threatSeconds ?? Number.POSITIVE_INFINITY) + 0.08 < committedSeconds);
  if (remaining > 0 && !urgentReplacement) {
    const selectedApproach = state.threatId === null
      ? null
      : rockets.find((rocket) => rocket.id === state.threatId) ?? null;
    const selected = selectedApproach
      ? rocketApproach(own, selectedApproach)
      : null;
    return {
      state: {
        ...state,
        breakSeconds: remaining,
        closingSeconds:
          selected && selected.seconds > 0
            ? selected.seconds
            : Math.max(0, (state.closingSeconds ?? 0) - deltaSeconds),
      },
      velocityOffset:
        state.velocityOffset ?? scale(state.breakDirection, capability.breakSpeed),
      // Докладывается та ракета, чью команду машина ИСПОЛНЯЕТ. Раньше здесь
      // показывалась новая угроза при старом физическом рывке — панель говорила
      // правду о зрении и неправду о действии.
      threatId: state.threatId,
      closingSeconds: selected?.seconds ?? state.closingSeconds ?? null,
      miss: selected?.miss ?? null,
      acceleration: state.acceleration,
      attitude: state.attitude,
      liftFraction: state.liftFraction,
      survivalMargin: state.survivalMargin,
    };
  }

  if (!threat) {
    return {
      state: createEvasionState(),
      velocityOffset: [0, 0, 0],
      threatId: null,
      closingSeconds: null,
      miss: null,
      acceleration: [0, 0, 0],
      attitude: null,
      liftFraction: null,
      survivalMargin: null,
    };
  }

  const correction = input.dynamics
    ? chooseEvasionCorrection({
        centre: own.centre,
        velocity: own.velocity,
        threats: threatening,
        closingSeconds: closingByThreat,
        breakSpeed: capability.breakSpeed,
        margin: capability.margin,
        dynamics: input.dynamics,
        deck,
        boundary: input.boundary,
      })
    : null;
  const direction = correction
    ? normalize(correction.velocityOffset)
    : breakDirection(
        own,
        rocketApproach(own, threat).offset,
        deck,
        input.boundary,
      );
  const velocityOffset = correction?.velocityOffset ??
    scale(direction, capability.breakSpeed);
  // ВЫДЕРЖКА РЫВКА ГУЛЯЕТ, И ЭТО НЕ УКРАШЕНИЕ. Два реактивных контура с
  // одинаковыми постоянными времени сцепляются в устойчивый танец, где манёвр
  // жертвы становится функцией от того, что делает охотник, — то есть
  // идеально упреждаемым. Разброс берётся из ГЕОМЕТРИИ (секунды до встречи),
  // а не из случайного числа: тогда он не периодичен и при этом воспроизводим
  // в тесте.
  // Выдержка чуть длиннее времени подлёта: манёвр обязан пережить ракету,
  // которая уже в воздухе, и не оборваться за миг до её прохода.
  const jitter = 1 + Math.min(1, (threatSeconds ?? 0));
  return {
    state: {
      breakSeconds: capability.breakSeconds * jitter,
      breakDirection: direction,
      threatId: threat.id,
      closingSeconds: threatSeconds,
      velocityOffset,
      acceleration: correction?.acceleration ?? [0, 0, 0],
      attitude: correction?.attitude ?? null,
      liftFraction: correction?.liftFraction ?? null,
      survivalMargin: correction?.survivalMargin ?? null,
    },
    velocityOffset,
    threatId: threat.id,
    closingSeconds: threatSeconds,
    miss: threatMiss,
    acceleration: correction?.acceleration ?? [0, 0, 0],
    attitude: correction?.attitude ?? null,
    liftFraction: correction?.liftFraction ?? null,
    survivalMargin: correction?.survivalMargin ?? null,
  };
}
