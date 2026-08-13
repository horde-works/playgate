import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectLabView,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

export type CreatureLabView = ObjectLabView & {
  readonly up?: ObjectPoint;
};

export type CreatureLabModel = Omit<ObjectLabModel, "views"> & {
  readonly captureFrame: readonly [width: number, height: number];
  readonly materialOverrides: Readonly<
    Record<string, Readonly<Record<string, string | number | boolean>>>
  >;
  readonly views: readonly CreatureLabView[];
};

export const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

export function addBox(
  parts: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
): void {
  parts.push({ id, group, material, kind: "box", center, size, rotation });
}

export function addBeam(
  parts: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
): void {
  parts.push({ id, group, material, kind: "beam", from, to, width, depth });
}

export function addJoint(
  parts: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: number,
): void {
  addBox(parts, id, group, material, center, point(size, size, size));
}

export function addQuad(
  parts: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
  d: ObjectPoint,
  showEdges = true,
): void {
  parts.push({
    id,
    group,
    material,
    kind: "mesh",
    vertices: [a, b, c, d],
    triangles: [[0, 1, 2], [0, 2, 3]],
    doubleSided: true,
    showEdges,
  });
}

export function addTriangle(
  parts: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
): void {
  parts.push({
    id,
    group,
    material,
    kind: "mesh",
    vertices: [a, b, c],
    triangles: [[0, 1, 2]],
    doubleSided: true,
  });
}

export function mirrorX([x, y, z]: ObjectPoint, side: -1 | 1): ObjectPoint {
  return point(side * x, y, z);
}

