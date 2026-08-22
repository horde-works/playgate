import { Color } from "three";

/**
 * Kallur sea body absorption. Deep/light are the only authored sea paints;
 * sky and far haze must come from the live air (`scene.fog` = measured
 * horizon), same law as land and WorldEdge — otherwise twilight keeps a
 * peach milk sheet while the island has already gone dark.
 */
export const KALLUR_SEA_BODY_DAY = {
  deep: new Color("#3e6489"),
  light: new Color("#7a97a9"),
} as const;

export const KALLUR_SEA_BODY_NIGHT = {
  deep: new Color("#0f131d"),
  light: new Color("#1b2130"),
} as const;

/**
 * Write deep/light for this hour. `groundLightLevel` is the same noon=1
 * budget the grass and ground use, so the sheet cannot outshine the island.
 */
export function applyKallurSeaBody(
  deep: Color,
  light: Color,
  night: number,
  groundLightLevel: number,
): void {
  const nightMix = Math.max(0, Math.min(1, night));
  deep.copy(KALLUR_SEA_BODY_DAY.deep).lerp(KALLUR_SEA_BODY_NIGHT.deep, nightMix);
  light.copy(KALLUR_SEA_BODY_DAY.light).lerp(KALLUR_SEA_BODY_NIGHT.light, nightMix);
  const level = Math.max(0.04, Math.min(1, groundLightLevel));
  // Soft curve: keep a readable body under a low sun, crush milk after dusk.
  deep.multiplyScalar(level ** 0.55);
  light.multiplyScalar(level ** 0.45);
}
