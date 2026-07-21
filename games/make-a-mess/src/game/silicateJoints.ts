import type { BreakableMaterial, SceneVector3 } from "./destructionScene";

export const SILICATE_JOINT_EXPANSION = 0.052;

export function hasSilicateJoints(
  sourceId: string,
  material: BreakableMaterial,
): boolean {
  return (
    sourceId.startsWith("minas:dark-tower:") &&
    (material === "basalt" || material === "graphiteStone")
  );
}

export function silicateJointBand(size: SceneVector3): number {
  const longestSide = Math.max(size[0], size[1], size[2]);
  return Math.max(0.0025, Math.min(0.015, 0.013 / longestSide));
}

export function silicateJointTint(baseColor: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(baseColor);
  if (!match) {
    return "#465157";
  }

  const value = Number.parseInt(match[1], 16);
  const source = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const mineral = [32, 38, 42];
  const mixed = source.map((channel, index) =>
    Math.round(channel * 0.35 + mineral[index] * 0.65),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
