export type TimeOfDay =
  | "dawn"
  | "morning"
  | "day"
  | "afternoon"
  | "sunset"
  | "dusk"
  | "evening"
  | "night"
  | "predawn";

/** Географический базис отдельной сцены в её плоскости x/z. */
export interface SolarFrameDefinition {
  readonly model: "equinox";
  readonly latitudeDegrees: number;
  readonly east: readonly [x: number, z: number];
  readonly north: readonly [x: number, z: number];
}

/**
 * География для мира, который своей не объявил.
 *
 * Раньше такой мир получал не географию, а ФОЛБЭК ИЗ ДВУХ РАЗНЫХ СОЛНЦ:
 * `sunBeam()` и `nightLevel()` спрашивали высоту у `Math.sin(angle)`, а купол,
 * заливка и горизонт — у вектора, собранного с множителями (30, 26, 24). В
 * полдень луч считал солнце в зените, а небо рисовало его на 42.8° — сорок
 * семь градусов расхождения. Замер по фазам: утро 7.7°, полдень 47.2°,
 * послеполуденное 13.4°. Ровно то, что запрещает §11.1 lessons: четыре вопроса
 * к ОДНОЙ атмосфере не могут разойтись во мнении, который час.
 *
 * Широта та же, что у польдера, — не потому что миры соседи, а потому что
 * колесо фаз одно на всю игру, и высоты солнца в его таблице сняты именно
 * здесь. Мир, которому нужно своё солнце, объявляет `solarFrame` и получает
 * его; общего фолбэка с собственной геометрией больше нет.
 */
export const DEFAULT_SOLAR_FRAME: SolarFrameDefinition = {
  model: "equinox",
  latitudeDegrees: 52.4,
  east: [1, 0],
  north: [0, -1],
};

/**
 * Направление ОТ мира К солнцу для равноденствия.
 *
 * `solarTime`: 0 = 06:00, 0.25 = 12:00, 0.5 = 18:00. На рассвете
 * горизонтальная проекция совпадает с истинным востоком, на закате — с
 * западом, а в полдень солнце находится строго к югу.
 */
export function equinoxSunDirection(
  solarTime: number,
  frame: SolarFrameDefinition,
): readonly [x: number, y: number, z: number] {
  const eastLength = Math.hypot(frame.east[0], frame.east[1]) || 1;
  const northLength = Math.hypot(frame.north[0], frame.north[1]) || 1;
  const east = [frame.east[0] / eastLength, frame.east[1] / eastLength] as const;
  const north = [frame.north[0] / northLength, frame.north[1] / northLength] as const;
  const latitude = frame.latitudeDegrees * Math.PI / 180;
  const hourAngle = (solarTime - 0.25) * Math.PI * 2;
  const eastAmount = -Math.sin(hourAngle);
  const northAmount = -Math.sin(latitude) * Math.cos(hourAngle);
  const upAmount = Math.cos(latitude) * Math.cos(hourAngle);
  const x = east[0] * eastAmount + north[0] * northAmount;
  const z = east[1] * eastAmount + north[1] * northAmount;
  const length = Math.hypot(x, upAmount, z) || 1;
  return [x / length, upAmount / length, z / length];
}

/**
 * Positions around the solar day. The renderer can glide between them, while
 * clocks read the same continuous value instead of maintaining a second,
 * decorative notion of time.
 *
 * These are NOT an even three-hour wheel, and every exception is about an hour
 * where the light is worth standing in.
 *
 * Утро: в 06:00 равноденственное солнце стоит ровно на горизонте, свет идёт
 * вскользь и мир остаётся тёмным. Час спустя оно уже поднялось над крышами,
 * поэтому фаза читается как 07:00.
 *
 * ЗАКАТ И ВЕЧЕР. At 18:00 the equinox sun sits exactly ON the horizon, and
 * what is left of the beam there is a tenth of its noon strength: the land is
 * a silhouette and the wheel contained no golden hour at all. 17:37 puts the
 * sun at 3.5° over the polder, where the beam is half strength and reads
 * (1.00, 0.40, 0.08) — raking gold, with shadows the length of the field.
 * `evening` then takes the moment 18:00 used to hold and a little past it: at
 * −3° the sun is down, the Belt of Venus stands behind the observer, and the
 * cloud bases are still burning because at 680 m the light has not left yet.
 * Its old 21:00 sat at −25.6°, which is night wearing another name.
 *
 * СУМЕРКИ — девятая фаза, и она существует потому, что золотой свет НА ЗЕМЛЕ и
 * цвет В НЕБЕ приходятся на разные минуты. Замер горизонта в пяти градусах над
 * солнцем, через AgX на рабочей экспозиции, по уровням хромы:
 *
 *   солнце   5.6°  #fffaf2   13     ← `sunset` до этой правки промахивался сюда
 *   солнце   3.5°  #fff6e9   22     ← `sunset`: золотой час на земле
 *   солнце   1.0°  #fde4cb   50
 *   солнце  −1.0°  #d8a890   72     ← `dusk`: небо наконец розовое
 *   солнце  −3.0°  #8e6c5b   51     ← `evening`: уже глубокие сумерки
 *
 * Цвет живёт между 0° и −2°, и колесо через эту полосу ПЕРЕПРЫГИВАЛО: скольжение
 * идёт 0.22 суток/с, то есть вся полоса проходилась за 0.10 с реального
 * времени. Розовое небо было видно только на переходе между фазами — включалось
 * на мгновение и пропадало, ни одна остановка в него не попадала.
 */
export const TIME_OF_DAY_TARGETS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 1 / 24,
  morning: 0.125,
  day: 0.25,
  afternoon: 0.375,
  sunset: 0.484,
  // Солнце на −1.0° при широте базиса: cos(lat)·cos(hourAngle) = sin(−1°).
  dusk: 0.5046,
  evening: 0.5137,
  night: 0.75,
  predawn: 0.875,
};

const TIME_OF_DAY_SEQUENCE: readonly TimeOfDay[] = [
  "dawn",
  "morning",
  "day",
  "afternoon",
  "sunset",
  "dusk",
  "evening",
  "night",
  "predawn",
];

export function nextTimeOfDay(current: TimeOfDay): TimeOfDay {
  const index = TIME_OF_DAY_SEQUENCE.indexOf(current);
  return TIME_OF_DAY_SEQUENCE[(index + 1) % TIME_OF_DAY_SEQUENCE.length];
}

/** Convert the renderer's solar angle to a conventional 24-hour clock. */
export function gameClockFraction(solarTime: number): number {
  return ((solarTime + 0.25) % 1 + 1) % 1;
}

/** Format the shared solar time for HUD copy without creating a second clock. */
export function gameClockText(solarTime: number): string {
  const totalMinutes = Math.round(gameClockFraction(solarTime) * 24 * 60) % (24 * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}
