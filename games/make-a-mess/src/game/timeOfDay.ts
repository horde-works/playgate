export type TimeOfDay =
  | "dawn"
  | "morning"
  | "day"
  | "afternoon"
  | "sunset"
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
 * Three-hour positions around the solar day. The renderer can glide between
 * them, while clocks read the same continuous value instead of maintaining a
 * second, decorative notion of time.
 */
export const TIME_OF_DAY_TARGETS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 0,
  morning: 0.125,
  day: 0.25,
  afternoon: 0.375,
  sunset: 0.5,
  evening: 0.625,
  night: 0.75,
  predawn: 0.875,
};

const TIME_OF_DAY_SEQUENCE: readonly TimeOfDay[] = [
  "dawn",
  "morning",
  "day",
  "afternoon",
  "sunset",
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
