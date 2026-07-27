import type { LampBeaconDefinition } from "./destructionScene";

/**
 * Keeps a beacon at least a few pixels wide without turning its close-range
 * representation into an oversized billboard.
 */
export function lampBeaconWorldDiameter(
  definition: LampBeaconDefinition,
  distance: number,
  viewportHeight: number,
  verticalFovDegrees: number,
): number {
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeDistance = Math.max(0, distance);
  const halfFov = (Math.max(1, verticalFovDegrees) * Math.PI) / 360;
  const angularDiameter =
    (definition.minScreenDiameter * 2 * safeDistance * Math.tan(halfFov)) /
    safeViewportHeight;
  return Math.min(
    definition.maxWorldDiameter,
    Math.max(definition.physicalDiameter, angularDiameter),
  );
}

export function lampBeaconOpacity(
  definition: LampBeaconDefinition,
  nightFactor: number,
): number {
  const night = Math.min(1, Math.max(0, nightFactor));
  return definition.dayOpacity + (definition.nightOpacity - definition.dayOpacity) * night;
}
