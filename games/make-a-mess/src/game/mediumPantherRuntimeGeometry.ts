import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { ObjectLabPart, ObjectPoint } from "../content/objects/dutchWindmills/objectModel.ts";
import {
  MEDIUM_PANTHER_SKELETON,
  mediumPantherBoneForPart,
} from "../content/objects/creatures/mediumPantherRigObject.ts";
import { mediumPantherCanonicalParts } from "../content/objects/creatures/mediumPantherObject.ts";
import type { MediumFelineTerritoryPopulationDefinition } from "./creaturePopulation.ts";

export const MEDIUM_PANTHER_RUNTIME_BONE_IDS = MEDIUM_PANTHER_SKELETON.bones.map(
  (bone) => bone.id,
);
const BONE_INDEX = new Map(
  MEDIUM_PANTHER_RUNTIME_BONE_IDS.map((id, index) => [id, index]),
);
const UNIT_SCALE = new Vector3(1, 1, 1);
const Y_AXIS = new Vector3(0, 1, 0);

function bakedBoxGeometry(part: Extract<ObjectLabPart, { kind: "box" }>): BufferGeometry {
  const geometry = new BoxGeometry(part.size[0], part.size[1], part.size[2]).toNonIndexed();
  const transform = new Matrix4().compose(
    new Vector3(...part.center),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    UNIT_SCALE,
  );
  geometry.applyMatrix4(transform);
  return geometry;
}

function bakedBeamGeometry(part: Extract<ObjectLabPart, { kind: "beam" }>): BufferGeometry {
  const from = new Vector3(...part.from);
  const to = new Vector3(...part.to);
  const direction = to.clone().sub(from);
  const geometry = new BoxGeometry(part.width, direction.length(), part.depth).toNonIndexed();
  const transform = new Matrix4().compose(
    from.clone().add(to).multiplyScalar(0.5),
    new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()),
    UNIT_SCALE,
  );
  geometry.applyMatrix4(transform);
  return geometry;
}

function partColor(
  part: ObjectLabPart,
  definition: MediumFelineTerritoryPopulationDefinition,
): Color {
  const appearance = definition.profile.appearance;
  switch (part.material) {
    case "timber-dark":
      return new Color(appearance.coat);
    case "timber-mid":
      return new Color(appearance.coatPlane);
    case "foundation":
      return new Color(appearance.muzzle);
    case "flower-yellow":
      return new Color(appearance.eyes);
    case "dark-recess":
      return new Color("#070809");
    default:
      return new Color(appearance.coat);
  }
}

function triangleNormal(a: ObjectPoint, b: ObjectPoint, c: ObjectPoint): Vector3 {
  return new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    .cross(new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]))
    .normalize();
}

/** One draw-call derivative of the accepted P4 primitive body. */
export function buildMediumPantherRuntimeGeometry(
  definition: MediumFelineTerritoryPopulationDefinition,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const bones: number[] = [];

  const append = (
    part: ObjectLabPart,
    partPositions: readonly number[],
    partNormals: readonly number[],
  ): void => {
    const boneId = mediumPantherBoneForPart(part);
    const boneIndex = BONE_INDEX.get(boneId);
    if (boneIndex === undefined) {
      throw new Error(`${part.id}: runtime bone ${boneId} is not in the panther skeleton`);
    }
    const color = partColor(part, definition);
    positions.push(...partPositions);
    normals.push(...partNormals);
    for (let vertex = 0; vertex < partPositions.length / 3; vertex += 1) {
      colors.push(color.r, color.g, color.b);
      bones.push(boneIndex);
    }
  };

  for (const part of mediumPantherCanonicalParts) {
    if (part.kind === "box" || part.kind === "beam") {
      const baked = part.kind === "box" ? bakedBoxGeometry(part) : bakedBeamGeometry(part);
      append(
        part,
        Array.from(baked.getAttribute("position").array),
        Array.from(baked.getAttribute("normal").array),
      );
      baked.dispose();
      continue;
    }
    if (part.kind === "cylinder") {
      throw new Error(`${part.id}: panther runtime cylinder adapter is not authored`);
    }
    const partPositions: number[] = [];
    const partNormals: number[] = [];
    for (const triangle of part.triangles) {
      const faceNormal = triangleNormal(
        part.vertices[triangle[0]],
        part.vertices[triangle[1]],
        part.vertices[triangle[2]],
      );
      for (const vertexIndex of triangle) {
        partPositions.push(...part.vertices[vertexIndex]);
        const normal = part.normals?.[vertexIndex];
        partNormals.push(...(normal ?? [faceNormal.x, faceNormal.y, faceNormal.z]));
      }
    }
    append(part, partPositions, partNormals);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aPantherBone", new Float32BufferAttribute(bones, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
