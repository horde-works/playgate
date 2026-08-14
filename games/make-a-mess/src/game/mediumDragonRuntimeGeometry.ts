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
  MEDIUM_DRAGON_SKELETON,
  mediumDragonBoneForPart,
  mediumDragonMembraneVertexBone,
} from "../content/objects/creatures/mediumDragonRigObject.ts";
import {
  mediumDragonFlightCanonicalParts,
  mediumDragonGroundCanonicalParts,
} from "../content/objects/creatures/mediumDragonObject.ts";
import type { MediumDragonTerritoryPopulationDefinition } from "./creaturePopulation.ts";

export const MEDIUM_DRAGON_RUNTIME_BONE_IDS = MEDIUM_DRAGON_SKELETON.bones.map(
  (bone) => bone.id,
);

const BONE_INDEX = new Map(
  MEDIUM_DRAGON_RUNTIME_BONE_IDS.map((id, index) => [id, index]),
);
const UNIT_SCALE = new Vector3(1, 1, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const GROUND_REFERENCE = "ground-folded";
const FLIGHT_REFERENCE = "flight-extended";

function bakedBoxGeometry(part: Extract<ObjectLabPart, { kind: "box" }>): BufferGeometry {
  const geometry = new BoxGeometry(part.size[0], part.size[1], part.size[2]).toNonIndexed();
  geometry.applyMatrix4(new Matrix4().compose(
    new Vector3(...part.center),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    UNIT_SCALE,
  ));
  return geometry;
}

function bakedBeamGeometry(part: Extract<ObjectLabPart, { kind: "beam" }>): BufferGeometry {
  const from = new Vector3(...part.from);
  const to = new Vector3(...part.to);
  const direction = to.clone().sub(from);
  const geometry = new BoxGeometry(part.width, direction.length(), part.depth).toNonIndexed();
  geometry.applyMatrix4(new Matrix4().compose(
    from.clone().add(to).multiplyScalar(0.5),
    new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()),
    UNIT_SCALE,
  ));
  return geometry;
}

function partColor(
  part: ObjectLabPart,
  definition: MediumDragonTerritoryPopulationDefinition,
): Color {
  const appearance = definition.profile.appearance;
  switch (part.material) {
    case "grass":
      return new Color(appearance.skin);
    case "grass-crown":
      return new Color(appearance.skinPlane);
    case "roof-warm":
      return new Color(appearance.belly);
    case "canvas":
      return new Color(appearance.membrane);
    case "foundation":
      return new Color(appearance.claws);
    case "flower-yellow":
      return new Color(appearance.eyes);
    case "paint-light":
      return new Color("#d8d0bb");
    case "dark-recess":
      return new Color("#090b0a");
    default:
      return new Color(appearance.skin);
  }
}

function triangleNormal(a: ObjectPoint, b: ObjectPoint, c: ObjectPoint): Vector3 {
  return new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    .cross(new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]))
    .normalize();
}

function flightReferenceAlignment(boneId: string): Quaternion {
  const bone = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.id === boneId);
  if (!bone) throw new Error(`${boneId}: no dragon bone for flight bind conversion`);
  const child = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.parent === boneId);
  const other = child ?? MEDIUM_DRAGON_SKELETON.bones.find(
    (candidate) => candidate.id === bone.parent,
  );
  if (!other) return new Quaternion();
  const groundDirection = child
    ? new Vector3(...other.rest[GROUND_REFERENCE]).sub(new Vector3(...bone.rest[GROUND_REFERENCE]))
    : new Vector3(...bone.rest[GROUND_REFERENCE]).sub(new Vector3(...other.rest[GROUND_REFERENCE]));
  const flightDirection = child
    ? new Vector3(...other.rest[FLIGHT_REFERENCE]).sub(new Vector3(...bone.rest[FLIGHT_REFERENCE]))
    : new Vector3(...bone.rest[FLIGHT_REFERENCE]).sub(new Vector3(...other.rest[FLIGHT_REFERENCE]));
  return groundDirection.lengthSq() > 1e-8 && flightDirection.lengthSq() > 1e-8
    ? new Quaternion().setFromUnitVectors(groundDirection.normalize(), flightDirection.normalize())
    : new Quaternion();
}

/** Convert an authored flight membrane point into the common folded bind. */
export function mediumDragonFlightVertexToGroundBind(
  vertex: ObjectPoint,
  boneId: string,
): ObjectPoint {
  const bone = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.id === boneId);
  if (!bone) throw new Error(`${boneId}: no dragon bone for membrane bind`);
  const groundPivot = new Vector3(...bone.rest[GROUND_REFERENCE]);
  const flightPivot = new Vector3(...bone.rest[FLIGHT_REFERENCE]);
  const converted = new Vector3(...vertex)
    .sub(flightPivot)
    .applyQuaternion(flightReferenceAlignment(boneId).invert())
    .add(groundPivot);
  return [converted.x, converted.y, converted.z];
}

/**
 * One canonical body, authored in its folded reference and skinned to the
 * same 48-bone hierarchy used by Object Lab. Extended flight is deformation,
 * never a model swap.
 */
export function buildMediumDragonRuntimeGeometry(
  definition: MediumDragonTerritoryPopulationDefinition,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const bones: number[] = [];
  const bindPivots: number[] = [];
  const membraneSides: number[] = [];

  const append = (
    part: ObjectLabPart,
    partPositions: readonly number[],
    partNormals: readonly number[],
    partBones?: readonly string[],
    partBindPivots?: readonly number[],
    partMembraneSides?: readonly number[],
  ): void => {
    const fallbackBone = mediumDragonBoneForPart(part, GROUND_REFERENCE);
    const color = partColor(part, definition);
    positions.push(...partPositions);
    normals.push(...partNormals);
    for (let vertex = 0; vertex < partPositions.length / 3; vertex += 1) {
      const boneId = partBones?.[vertex] ?? fallbackBone;
      const boneIndex = BONE_INDEX.get(boneId);
      if (boneIndex === undefined) {
        throw new Error(`${part.id}: runtime bone ${boneId} is not in the dragon skeleton`);
      }
      colors.push(color.r, color.g, color.b);
      bones.push(boneIndex);
      bindPivots.push(
        ...(partBindPivots?.slice(vertex * 3, vertex * 3 + 3) ?? [0, 0, 0]),
      );
      membraneSides.push(partMembraneSides?.[vertex] ?? 0);
    }
  };

  for (const part of mediumDragonGroundCanonicalParts.filter(
    (candidate) => candidate.group !== "wing-membrane",
  )) {
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
      throw new Error(`${part.id}: dragon runtime cylinder adapter is not authored`);
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

  // Runtime membranes use the complete seven-panel flight topology. Each
  // vertex is converted once into the folded bind of its owning segment; the
  // shared skeleton then carries the full surface through every phase.
  for (const part of mediumDragonFlightCanonicalParts.filter(
    (candidate) => candidate.group === "wing-membrane",
  )) {
    if (part.kind !== "mesh") continue;
    const partPositions: number[] = [];
    const partNormals: number[] = [];
    const partBones: string[] = [];
    const partBindPivots: number[] = [];
    const partMembraneSides: number[] = [];
    for (const triangle of part.triangles) {
      const converted = triangle.map((vertexIndex) => {
        const vertex = part.vertices[vertexIndex];
        const boneId = mediumDragonMembraneVertexBone(
          part,
          vertex,
          vertexIndex,
          FLIGHT_REFERENCE,
        ) ?? mediumDragonBoneForPart(part, FLIGHT_REFERENCE);
        return {
          boneId,
          point: mediumDragonFlightVertexToGroundBind(vertex, boneId),
        };
      });
      const faceNormal = triangleNormal(converted[0].point, converted[1].point, converted[2].point);
      for (const entry of converted) {
        const bone = MEDIUM_DRAGON_SKELETON.bones.find((candidate) => candidate.id === entry.boneId)!;
        partPositions.push(...entry.point);
        partNormals.push(faceNormal.x, faceNormal.y, faceNormal.z);
        partBones.push(entry.boneId);
        partBindPivots.push(...bone.rest[GROUND_REFERENCE]);
        partMembraneSides.push(entry.boneId.startsWith("left-") ? -1 : 1);
      }
    }
    append(
      part,
      partPositions,
      partNormals,
      partBones,
      partBindPivots,
      partMembraneSides,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aDragonBone", new Float32BufferAttribute(bones, 1));
  geometry.setAttribute("aDragonBindPivot", new Float32BufferAttribute(bindPivots, 3));
  geometry.setAttribute("aDragonMembraneSide", new Float32BufferAttribute(membraneSides, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius = 8.2;
  return geometry;
}
