export type TimeOfDay = "dawn" | "day" | "sunset" | "night";

/**
 * Solar-day positions: sunrise, noon, sunset and midnight. The renderer can
 * glide between them, while clocks read the same continuous value instead of
 * maintaining a second, decorative notion of time.
 */
export const TIME_OF_DAY_TARGETS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 0,
  day: 0.25,
  sunset: 0.5,
  night: 0.75,
};

const TIME_OF_DAY_SEQUENCE: readonly TimeOfDay[] = [
  "dawn",
  "day",
  "sunset",
  "night",
];

export function nextTimeOfDay(current: TimeOfDay): TimeOfDay {
  const index = TIME_OF_DAY_SEQUENCE.indexOf(current);
  return TIME_OF_DAY_SEQUENCE[(index + 1) % TIME_OF_DAY_SEQUENCE.length];
}

/** Convert the renderer's solar angle to a conventional 24-hour clock. */
export function gameClockFraction(solarTime: number): number {
  return ((solarTime + 0.25) % 1 + 1) % 1;
}
