import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "../sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
  SupportMode,
} from "../../../game/destructionScene.ts";

export interface NimbusMutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

type PrimitiveOptions = Omit<
  ScenePrimitiveDefinition,
  "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"
> & {
  readonly rotation?: SceneVector3;
  readonly scale?: SceneVector3;
};

const groups = new Map<string, NimbusMutableGroup>();

export function resetNimbusGroups(): void {
  groups.clear();
}

export function nimbusGroup(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "stack",
): NimbusMutableGroup {
  const existing = groups.get(id);
  if (existing) return existing;
  const created: NimbusMutableGroup = {
    id: `nimbus:${id}`,
    label,
    material,
    supportMode,
    objects: [],
  };
  groups.set(id, created);
  return created;
}

export function nimbusNoise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 83.17 + z * 47.71 + salt * 23.29) * 43758.5453;
  return value - Math.floor(value);
}

function worldExtents(
  size: SceneVector3,
  rotation: SceneVector3,
): SceneVector3 {
  const [rx, ry, rz] = rotation;
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
  const axes = [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ] as const;
  return [0, 1, 2].map((world) =>
    axes.reduce(
      (extent, axis, local) => extent + Math.abs(axis[world]) * size[local],
      0,
    ),
  ) as unknown as SceneVector3;
}

function needsHonestContactBox(
  size: SceneVector3,
  rotation: SceneVector3,
): boolean {
  const extents = worldExtents(size, rotation);
  return extents.some((extent, axis) => Math.abs(extent - size[axis]) > 1e-6);
}

export function nimbusPrimitive(
  target: NimbusMutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: PrimitiveOptions = {},
): void {
  const { rotation, scale, ...definition } = options;
  const contactBoxes =
    definition.contactBoxes ??
    (rotation && needsHonestContactBox(size, rotation)
      ? ([{ position: [0, 0, 0], size }] as const)
      : undefined);
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation, scale },
    ...definition,
    contactBoxes,
  });
}

export function nimbusGroundSeatBox(
  centreY: number,
  size: SceneVector3,
  groundTop: number,
): { readonly position: SceneVector3; readonly size: SceneVector3 } {
  const top = centreY + size[1] / 2;
  const height = Math.max(0.12, top - groundTop);
  return {
    position: [0, groundTop + height / 2 - centreY, 0],
    size: [size[0], height, size[2]],
  };
}

/** A buried body bears at grade, not through its entire underground volume. */
export function nimbusGradeContactBox(
  centreY: number,
  footprint: readonly [number, number],
  groundTop: number,
): { readonly position: SceneVector3; readonly size: SceneVector3 } {
  const height = 0.1;
  return {
    position: [0, groundTop + height / 2 - centreY, 0],
    size: [footprint[0], height, footprint[1]],
  };
}

export function nimbusOrient(
  xDir: SceneVector3,
  yDir: SceneVector3,
): SceneVector3 {
  const normalize = (value: SceneVector3): SceneVector3 => {
    const length = Math.hypot(...value) || 1;
    return [value[0] / length, value[1] / length, value[2] / length];
  };
  const x = normalize(xDir);
  const dot = yDir[0] * x[0] + yDir[1] * x[1] + yDir[2] * x[2];
  const y = normalize([
    yDir[0] - x[0] * dot,
    yDir[1] - x[1] * dot,
    yDir[2] - x[2] * dot,
  ]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

export function nimbusRod(
  target: NimbusMutableGroup,
  id: string,
  material: BreakableMaterial,
  from: SceneVector3,
  to: SceneVector3,
  thickness: number,
  color: string,
  options: Omit<PrimitiveOptions, "rotation"> = {},
): void {
  const direction: SceneVector3 = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const length = Math.hypot(...direction);
  if (length < 1e-6) return;
  const middle: SceneVector3 = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  const up: SceneVector3 = Math.abs(direction[1] / length) > 0.96
    ? [1, 0, 0]
    : [0, 1, 0];
  nimbusPrimitive(
    target,
    id,
    material,
    "steelSheet",
    middle,
    [length, thickness, thickness],
    color,
    { ...options, rotation: nimbusOrient(direction, up) },
  );
}

export function collectNimbusGroups(): readonly SceneGroupDefinition[] {
  return [...groups.values()].map((entry) => ({
    id: entry.id,
    label: entry.label,
    material: entry.material,
    supportMode: entry.supportMode,
    objects: entry.objects,
  }));
}
