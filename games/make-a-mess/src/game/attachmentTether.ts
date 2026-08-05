/**
 * ОТКАЗ КРЕПЛЕНИЯ — НЕ ИСЧЕЗНОВЕНИЕ КРЕПЛЕНИЯ.
 *
 * До сих пор у куска было два состояния: приварен намертво или свободное тело.
 * Между ними нет ничего, и потому любой отказ читался как телепорт в обломки:
 * панель, потерявшая опору, в тот же кадр улетала рядом с машиной, а не
 * повисала на уцелевшем шве.
 *
 * Настоящее крепление отказывает иначе. Сначала перестаёт держать МОМЕНТ —
 * кусок больше не сидит на своём месте и проворачивается; и только когда
 * рвётся последний уцелевший материал, он уходит совсем. Между этими двумя
 * событиями кусок висит: он подвижен, он мешает, он бьётся о то, к чему
 * прикреплён, — но он ещё часть постройки или машины.
 *
 * Этот модуль описывает вторую фазу — ПРИВЯЗЬ, и описывает её так, как ведёт
 * себя порванный шов: он держит на растяжение и не мешает куску подойти
 * ближе. Поэтому связь только СНИМАЕТ ИМПУЛЬС и никогда не переставляет тело.
 * Жёсткая проекция позы, которая напрашивается первой, этого не умеет: она
 * совершает работу, которую никто не учитывает, и спокойно висящий кусок за
 * полторы секунды раскачивает сам себя до обрыва.
 *
 * Модуль намеренно не знает ни о three, ни о rapier, ни о каталоге материалов:
 * на вход приходят поза и скорость тела, наружу уходит поправка скорости и
 * вердикт «шов ещё держит».
 *
 * ЕДИНИЦЫ. Прочность связи считается в той же шкале, что и несущая
 * способность решателя: `bearingArea × compressionStrength` против суммы
 * `volume × density`. Поэтому спрос выражен в МАССЕ, которую шов удержал на
 * этом шаге, а не в ньютонах — иначе у одного закона было бы два термометра.
 * Вес висящего куска получается сам: тяжесть за шаг набирает радиальную
 * скорость, шов её снимает, и снятый импульс равен весу.
 */

export type TetherVector3 = readonly [x: number, y: number, z: number];

export interface TetherAnchor {
  /** Точка, за которую кусок ещё держится, в мировой системе. */
  readonly pivot: TetherVector3;
  /** Расстояние от точки крепления до центра куска в момент отказа. */
  readonly length: number;
  /**
   * Сколько массы выдержит уцелевшая связь. Ноль означает, что держать нечем и
   * кусок свободен с первого же шага.
   */
  readonly capacity: number;
  /**
   * Скорость самой точки крепления. У постройки она нулевая, у машины — нет, и
   * связь обязана судить ОТНОСИТЕЛЬНОЕ движение: иначе ровный полёт носителя
   * читается как непрерывный рывок и рвёт шов на первом же шаге.
   */
  readonly pivotVelocity?: TetherVector3;
}

export interface TetherMotion {
  readonly position: TetherVector3;
  readonly linearVelocity: TetherVector3;
}

export interface TetherStep {
  /** Скорость после того, как шов снял своё. Позу связь не трогает. */
  readonly linearVelocity: TetherVector3;
  /** Связь не выдержала на этом шаге: дальше кусок летит сам. */
  readonly released: boolean;
  /** Сколько массы шов удержал фактически — для порога и телеметрии. */
  readonly demand: number;
}

const GRAVITY = 9.81;
/** Ниже этого радиуса привязь вырождается в жёсткую сварку и не нужна. */
const MINIMUM_LENGTH = 0.05;
/**
 * Какую долю набежавшего растяжения шов выбирает за один шаг. Единица — рывок
 * до упора в тот же кадр, и на стыке с солвером это дрожь; треть даёт натянутую
 * связь, которая держит кусок у своего места, но не звенит.
 */
const TIGHTEN = 0.35;

/**
 * Шаг привязи.
 *
 * Спрос — это импульс, который шов реально снял, приведённый к массе. В нём
 * сразу три явления и ни одного лишнего: вес висящего куска (тяжесть за шаг
 * набрала радиальную скорость), центробежная тяга раскачавшегося (она приходит
 * тем же каналом) и рывок от внешнего события — удара о землю, манёвра
 * носителя, зацепа за соседа. Именно рывок и рвёт настоящие крепления.
 */
export function stepTether(
  anchor: TetherAnchor,
  motion: TetherMotion,
  mass: number,
  deltaTime: number,
): TetherStep {
  const step = Math.max(1e-4, deltaTime);
  const idle: TetherStep = {
    linearVelocity: motion.linearVelocity,
    released: false,
    demand: 0,
  };
  if (!(anchor.capacity > 0)) {
    return { ...idle, released: true };
  }

  const offsetX = motion.position[0] - anchor.pivot[0];
  const offsetY = motion.position[1] - anchor.pivot[1];
  const offsetZ = motion.position[2] - anchor.pivot[2];
  const distance = Math.hypot(offsetX, offsetY, offsetZ);
  if (distance < 1e-6) {
    // Центр куска совпал с точкой крепления: направление не определено, и
    // снимать нечего. Рвать связь здесь было бы артефактом численности.
    return idle;
  }

  const length = Math.max(MINIMUM_LENGTH, anchor.length);
  const directionX = offsetX / distance;
  const directionY = offsetY / distance;
  const directionZ = offsetZ / distance;

  // Шов судит движение куска ОТНОСИТЕЛЬНО своей точки: связь на летящей машине
  // не нагружена тем, что машина летит.
  const carrier = anchor.pivotVelocity ?? [0, 0, 0];
  const radialSpeed =
    (motion.linearVelocity[0] - carrier[0]) * directionX +
    (motion.linearVelocity[1] - carrier[1]) * directionY +
    (motion.linearVelocity[2] - carrier[2]) * directionZ;

  // Шов работает на растяжение. Кусок, идущий К точке крепления, свободен —
  // порванная связь не толкает.
  const stretch = Math.max(0, distance - length);
  const correction =
    Math.max(0, radialSpeed) + (stretch * TIGHTEN) / step;
  if (correction <= 0) {
    return idle;
  }

  const demand = (mass * correction) / (step * GRAVITY);
  if (demand > anchor.capacity) {
    return { ...idle, released: true, demand };
  }

  return {
    linearVelocity: [
      motion.linearVelocity[0] - directionX * correction,
      motion.linearVelocity[1] - directionY * correction,
      motion.linearVelocity[2] - directionZ * correction,
    ],
    released: false,
    demand,
  };
}

/**
 * Прочность уцелевшего шва. Связь работает на срез, а не на смятие, и держит
 * заметно меньше того же пятна под сжатием: шов рвётся раньше, чем сминается
 * материал под ним. Доля выбрана так, чтобы кусок с ладонь оставшегося
 * контакта держал сам себя, но не держал соседей.
 */
export const HINGE_SHEAR_FRACTION = 0.18;

export function hingeCapacity(
  contactArea: number,
  compressionStrength: number,
): number {
  return Math.max(0, contactArea) * compressionStrength * HINGE_SHEAR_FRACTION;
}
