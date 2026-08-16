/**
 * ВНЕШНИЙ ОСМОТР ЛЕТЯЩЕЙ МАШИНЫ (третья глубина телеметрии по T).
 *
 * Камера сходит с плеча игрока и встаёт на орбиту вокруг выбранной прицелом
 * машины: мышь (или палец) вращает точку обзора, колесо меняет дистанцию,
 * машина продолжает лететь своим маршрутом. Правила:
 *
 * - орбита СЕЕТСЯ из текущего положения камеры: вход в осмотр не телепортирует
 *   взгляд, а лишь захватывает уже существующее направление игрок→машина и
 *   дальше вращает его. Слишком дальняя или слишком ближняя точка входа
 *   зажимается в рабочий диапазон радиуса;
 * - подъём ограничен: зенит и надир запрещены, иначе lookAt теряет опору
 *   «где верх» и кадр перекатывается;
 * - зум мультипликативный: шаг колеса меняет радиус в долях, а не в метрах,
 *   поэтому у земли движение точное, издали — быстрое.
 *
 * Модуль чистый: углы, зажимы и разложение орбиты в смещение — здесь,
 * подписки на мышь и камера — у рантайма (VehicleObservationCamera).
 */

/** Ближе — камера внутри обшивки, дальше — машина теряется в дымке. */
export const OBSERVATION_RADIUS_MIN = 6;
export const OBSERVATION_RADIUS_MAX = 90;
/** Дистанция по умолчанию: DC-3 с размахом ~29 м целиком в кадре. */
export const OBSERVATION_RADIUS_DEFAULT = 24;
/** Предел подъёма/спуска, рад (~72°): зенит и надир исключены. */
export const OBSERVATION_ELEVATION_LIMIT = 1.25;
/** Чувствительность вращения, рад на пиксель — как у MouseLook. */
export const OBSERVATION_ROTATE_RATE = 0.0022;
/** Доля радиуса на единицу wheel deltaY (штрих колеса ≈ 100). */
export const OBSERVATION_ZOOM_RATE = 0.0011;

export interface ObservationOrbit {
  /** Азимут вокруг машины, рад; 0 — камера к северу (+Z) от цели. */
  readonly azimuth: number;
  /** Подъём над горизонтом цели, рад; положительный — камера выше. */
  readonly elevation: number;
  /** Дистанция до центра масс машины, м. */
  readonly radius: number;
}

export const DEFAULT_OBSERVATION_ORBIT: ObservationOrbit = {
  azimuth: 0,
  elevation: 0.35,
  radius: OBSERVATION_RADIUS_DEFAULT,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Посев орбиты из фактического смещения камера−машина в момент входа в
 * осмотр. Вырожденное смещение (камера в центре цели) отдаёт орбиту по
 * умолчанию, а не NaN.
 */
export function observationOrbitFromOffset(
  offset: readonly [number, number, number],
): ObservationOrbit {
  const length = Math.hypot(offset[0], offset[1], offset[2]);
  if (length < 1e-6) {
    return DEFAULT_OBSERVATION_ORBIT;
  }
  return {
    azimuth: Math.atan2(offset[0], offset[2]),
    elevation: clamp(
      Math.asin(clamp(offset[1] / length, -1, 1)),
      -OBSERVATION_ELEVATION_LIMIT,
      OBSERVATION_ELEVATION_LIMIT,
    ),
    radius: clamp(length, OBSERVATION_RADIUS_MIN, OBSERVATION_RADIUS_MAX),
  };
}

/**
 * Вращение орбиты пиксельными дельтами мыши. Знаки повторяют MouseLook:
 * мышь вправо — камера уходит вправо по орбите, мышь вверх — поднимается.
 */
export function rotateObservationOrbit(
  orbit: ObservationOrbit,
  deltaXPixels: number,
  deltaYPixels: number,
): ObservationOrbit {
  return {
    azimuth: orbit.azimuth - deltaXPixels * OBSERVATION_ROTATE_RATE,
    elevation: clamp(
      orbit.elevation - deltaYPixels * OBSERVATION_ROTATE_RATE,
      -OBSERVATION_ELEVATION_LIMIT,
      OBSERVATION_ELEVATION_LIMIT,
    ),
    radius: orbit.radius,
  };
}

/** Зум колесом: deltaY > 0 (к себе) отдаляет, < 0 приближает. */
export function zoomObservationOrbit(
  orbit: ObservationOrbit,
  wheelDeltaY: number,
): ObservationOrbit {
  return {
    azimuth: orbit.azimuth,
    elevation: orbit.elevation,
    radius: clamp(
      orbit.radius * Math.exp(wheelDeltaY * OBSERVATION_ZOOM_RATE),
      OBSERVATION_RADIUS_MIN,
      OBSERVATION_RADIUS_MAX,
    ),
  };
}

/** Разложение орбиты в мировое смещение камеры от центра масс машины. */
export function observationCameraOffset(
  orbit: ObservationOrbit,
): [number, number, number] {
  const level = orbit.radius * Math.cos(orbit.elevation);
  return [
    level * Math.sin(orbit.azimuth),
    orbit.radius * Math.sin(orbit.elevation),
    level * Math.cos(orbit.azimuth),
  ];
}
