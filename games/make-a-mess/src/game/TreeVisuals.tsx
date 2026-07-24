"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  StaticDrawUsage,
  Vector3,
} from "three";
import type {
  BreakablePieceDefinition,
  TreeVisualKind,
} from "./destructionScene";
import {
  buildProceduralRootNetwork,
  isEnhancedTreePiece,
  proceduralPineNeedleProfile,
  proceduralRootJointDiameter,
  proceduralWoodTubeProfile,
  treeBarkPhase,
  treeWoodSpecies,
  treeVisualRootId,
} from "./treeVisualModel";
import { treeBarkAtlas } from "./treeBarkAtlas";
import { windState } from "./windState";

const UP = new Vector3(0, 1, 0);
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);

interface VisualInstance {
  readonly sourceId: string;
  readonly matrix: Matrix4;
  readonly color: Color;
  readonly species: number;
  readonly phase: number;
  readonly bend?: number;
  readonly taper?: number;
}

type FoliageInstance = VisualInstance;

interface TreeGroup {
  readonly id: string;
  readonly kind: TreeVisualKind;
  readonly seed: number;
  trunk?: BreakablePieceDefinition;
  readonly branches: BreakablePieceDefinition[];
  readonly foliage: BreakablePieceDefinition[];
}

interface TreeVisualBuild {
  readonly wood: readonly VisualInstance[];
  readonly roots: readonly VisualInstance[];
  readonly rootJoints: readonly VisualInstance[];
  readonly foliage: readonly FoliageInstance[];
  readonly conifer: readonly FoliageInstance[];
}

interface TreeShader {
  readonly uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}

function hash(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function hashText(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 0xffffffff;
}

function groupTrees(pieces: readonly BreakablePieceDefinition[]): TreeGroup[] {
  const groups = new Map<string, TreeGroup>();
  for (const piece of pieces) {
    if (!isEnhancedTreePiece(piece)) {
      continue;
    }
    const visual = piece.treeVisual;
    const rootId = treeVisualRootId(piece);
    if (!visual || !rootId) {
      continue;
    }
    let group = groups.get(rootId);
    if (!group) {
      group = {
        id: rootId,
        kind: visual.kind,
        seed: visual.seed,
        branches: [],
        foliage: [],
      };
      groups.set(rootId, group);
    }
    if (visual.role === "trunk") {
      group.trunk = piece;
    } else if (visual.role === "branch") {
      group.branches.push(piece);
    } else if (visual.role === "foliage") {
      group.foliage.push(piece);
    }
  }
  return [...groups.values()];
}

function pieceAxis(piece: BreakablePieceDefinition): Vector3 {
  const rotation = piece.rotation ?? [0, 0, 0];
  return UP.clone()
    .applyQuaternion(
      new Quaternion().setFromEuler(
        new Euler(rotation[0], rotation[1], rotation[2]),
      ),
    )
    .normalize();
}

function outwardBranchAxis(
  piece: BreakablePieceDefinition,
  trunk: BreakablePieceDefinition | undefined,
): Vector3 {
  const axis = pieceAxis(piece);
  if (!trunk) {
    return axis;
  }

  const trunkAxis = pieceAxis(trunk);
  const fromTrunk = new Vector3(...piece.position).sub(
    new Vector3(...trunk.position),
  );
  const radial = fromTrunk.addScaledVector(
    trunkAxis,
    -fromTrunk.dot(trunkAxis),
  );
  if (radial.lengthSq() < 1e-6 || axis.dot(radial) >= 0) {
    return axis;
  }

  // Mirror only the component perpendicular to the trunk. The upward rise is
  // already correct in the authored proxy; its radial component is reversed.
  const alongTrunk = trunkAxis.clone().multiplyScalar(axis.dot(trunkAxis));
  return alongTrunk.multiplyScalar(2).sub(axis).normalize();
}

function segmentMatrix(
  start: Vector3,
  end: Vector3,
  diameter: number,
): Matrix4 {
  const direction = end.clone().sub(start);
  const length = Math.max(0.001, direction.length());
  direction.multiplyScalar(1 / length);
  const rotation = new Quaternion().setFromUnitVectors(UP, direction);
  return new Matrix4().compose(
    start.clone().add(end).multiplyScalar(0.5),
    rotation,
    new Vector3(diameter, length, diameter),
  );
}

function pushCurvedPiece(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
  seed: number,
  kind: TreeVisualKind,
  role: "trunk" | "branch",
  trunk?: BreakablePieceDefinition,
  rootOutput?: VisualInstance[],
  rootJointOutput?: VisualInstance[],
): void {
  const axis = role === "branch"
    ? outwardBranchAxis(piece, trunk)
    : pieceAxis(piece);
  const center = new Vector3(...piece.position);
  const length = piece.size[1];
  const start = center.clone().addScaledVector(axis, -length / 2);
  const end = center.clone().addScaledVector(axis, length / 2);
  const identityNoise = hashText(piece.id);
  const profile = proceduralWoodTubeProfile(role);
  const bend = length * profile.bendRatio;
  const species = treeWoodSpecies(kind);

  // One connected tube per trunk or authored branch. The old visual split a
  // member into several open cylinders, so even a small bend exposed the sky
  // through their transverse seams. Height subdivisions now live inside one
  // mesh and the shader bends that continuous surface instead.
  output.push({
    sourceId: piece.id,
    matrix: segmentMatrix(start, end, piece.size[0] * 1.08),
    color: kind === "birch" && role === "trunk"
      ? new Color("#ded9c9")
      : new Color(piece.color),
    species,
    phase: treeBarkPhase(seed, piece.id),
    bend:
      (bend / Math.max(piece.size[0] * 1.08, 0.001)) *
      (0.65 + identityNoise * 0.7),
    taper: profile.tipScale,
  });

  if (role !== "trunk") {
    return;
  }

  // Roots are a branched render network: thick flare near the trunk, curved
  // tapered sections along the soil, then buried terminal segments. The trunk
  // remains the single cheap gameplay collider.
  const rootBase = start.clone().addScaledVector(axis, piece.size[0] * 0.025);
  const roots = buildProceduralRootNetwork(
    seed + identityNoise * 997,
    piece.size[0],
    kind,
  );
  roots.forEach((root, rootIndex) => {
    const rootPoints = root.points.map((point) =>
      rootBase.clone().add(new Vector3(...point)),
    );
    for (let index = 0; index < rootPoints.length - 1; index += 1) {
      (rootOutput ?? output).push({
        sourceId: piece.id,
        matrix: segmentMatrix(
          rootPoints[index],
          rootPoints[index + 1],
          root.diameters[index],
        ),
        color: kind === "birch"
          ? new Color("#c8c1ae")
          : new Color(piece.color).multiplyScalar(0.88),
        species,
        phase: hash(seed + identityNoise * 79, 80 + rootIndex * 5 + index),
        bend: 0,
        taper: 1,
      });
    }
    for (let index = 1; index < rootPoints.length - 1; index += 1) {
      const diameter = proceduralRootJointDiameter(
        root.diameters[index - 1],
        root.diameters[index],
      );
      rootJointOutput?.push({
        sourceId: piece.id,
        matrix: new Matrix4().compose(
          rootPoints[index],
          new Quaternion(),
          new Vector3(diameter, diameter * 0.9, diameter),
        ),
        color: kind === "birch"
          ? new Color("#c8c1ae")
          : new Color(piece.color).multiplyScalar(0.88),
        species,
        phase: hash(seed + identityNoise * 83, 180 + rootIndex * 5 + index),
        bend: 0,
        taper: 1,
      });
    }
  });
}

function pushBirchTwig(
  output: VisualInstance[],
  trunk: BreakablePieceDefinition,
  foliage: BreakablePieceDefinition,
  seed: number,
  index: number,
): void {
  const axis = pieceAxis(trunk);
  const trunkCenter = new Vector3(...trunk.position);
  const trunkStart = trunkCenter
    .clone()
    .addScaledVector(axis, -trunk.size[1] / 2);
  const target = new Vector3(...foliage.position);
  const projected = target.clone().sub(trunkStart).dot(axis);
  const attachDistance = Math.max(
    trunk.size[1] * 0.5,
    Math.min(trunk.size[1] * 0.9, projected - trunk.size[1] * 0.08),
  );
  const start = trunkStart.clone().addScaledVector(axis, attachDistance);
  const middle = start.clone().lerp(target, 0.56);
  middle.y += trunk.size[0] * (0.45 + hash(seed, 100 + index) * 0.35);
  const diameter = trunk.size[0] * (0.16 + hash(seed, 120 + index) * 0.05);
  const color = new Color("#716957");
  const directMiddle = start.clone().lerp(target, 0.56);
  output.push({
    sourceId: foliage.id,
    matrix: segmentMatrix(start, target, diameter),
    color,
    species: 1,
    phase: hash(seed, 180 + index),
    bend:
      middle.distanceTo(directMiddle) /
      Math.max(diameter, 0.001),
    taper: 0.4,
  });
}

function pushPineWhorl(
  output: VisualInstance[],
  trunk: BreakablePieceDefinition,
  tier: BreakablePieceDefinition,
  seed: number,
  tierIndex: number,
): void {
  const trunkAxis = pieceAxis(trunk);
  const trunkCenter = new Vector3(...trunk.position);
  const trunkStart = trunkCenter
    .clone()
    .addScaledVector(trunkAxis, -trunk.size[1] / 2);
  const tierCenter = new Vector3(...tier.position);
  const attachHeight = Math.max(
    0,
    Math.min(trunk.size[1], tierCenter.clone().sub(trunkStart).dot(trunkAxis)),
  );
  const attach = trunkStart.clone().addScaledVector(trunkAxis, attachHeight);
  const isTip = tier.treeVisual?.localId === "tip";
  const branchCount = isTip ? 4 : 7;
  const yaw = tier.rotation?.[1] ?? 0;
  const radiusX = tier.size[0] * (isTip ? 0.32 : 0.48);
  const radiusZ = tier.size[2] * (isTip ? 0.32 : 0.48);

  for (let index = 0; index < branchCount; index += 1) {
    const angle =
      yaw +
      (index / branchCount) * Math.PI * 2 +
      (hash(seed + tierIndex * 17, 310 + index) - 0.5) * 0.24;
    const end = attach.clone().add(
      new Vector3(
        Math.cos(angle) * radiusX,
        isTip
          ? tier.size[1] * (0.12 + hash(seed, 320 + index) * 0.16)
          : -tier.size[1] * (0.08 + hash(seed, 330 + index) * 0.15),
        Math.sin(angle) * radiusZ,
      ),
    );
    const diameter = trunk.size[0] * (isTip ? 0.055 : 0.085);
    const color = new Color("#493629");
    output.push({
      sourceId: tier.id,
      matrix: segmentMatrix(attach, end, diameter),
      color,
      species: 2,
      phase: hash(seed + tierIndex * 29, 340 + index),
      bend: tier.size[1] * (isTip ? 0.08 : 0.04) / Math.max(diameter, 0.001),
      taper: 0.34,
    });
  }
}

function pushShrubTwigs(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
): void {
  const visual = piece.vegetationVisual;
  if (!visual) {
    return;
  }
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const center = new Vector3(...piece.position);
  const bottom = center
    .clone()
    .add(new Vector3(0, -piece.size[1] * 0.48, 0).applyQuaternion(rotation));
  const twigCount = visual.kind === "hedge" ? 6 : 4;
  const diameter = Math.max(
    0.018,
    Math.min(piece.size[0], piece.size[2]) * 0.028,
  );

  for (let index = 0; index < twigCount; index += 1) {
    const angle =
      (index / twigCount) * Math.PI * 2 +
      hash(visual.seed, 410 + index) * 0.7;
    const localEnd = new Vector3(
      Math.cos(angle) * piece.size[0] * (0.16 + hash(visual.seed, 420 + index) * 0.22),
      piece.size[1] * (0.48 + hash(visual.seed, 430 + index) * 0.42),
      Math.sin(angle) * piece.size[2] * (0.16 + hash(visual.seed, 440 + index) * 0.22),
    ).applyQuaternion(rotation);
    output.push({
      sourceId: piece.id,
      matrix: segmentMatrix(bottom, bottom.clone().add(localEnd), diameter),
      color: new Color("#55432f"),
      species: 0,
      phase: hash(visual.seed, 450 + index),
    });
  }
}

function pieceMatrix(piece: BreakablePieceDefinition): Matrix4 {
  const rotation = piece.rotation ?? [0, 0, 0];
  return new Matrix4().compose(
    new Vector3(...piece.position),
    new Quaternion().setFromEuler(
      new Euler(rotation[0], rotation[1], rotation[2]),
    ),
    new Vector3(...piece.size),
  );
}

function vegetationLobeMatrix(
  piece: BreakablePieceDefinition,
  index: number,
  count: number,
): Matrix4 {
  const visual = piece.vegetationVisual;
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const center = new Vector3(...piece.position);
  const row = index - (count - 1) / 2;
  const isHedge = visual?.kind === "hedge";
  const localOffset = isHedge
    ? new Vector3(
        row * piece.size[0] * 0.22,
        (index % 2 === 0 ? -0.04 : 0.05) * piece.size[1],
        (index % 2 === 0 ? -0.05 : 0.05) * piece.size[2],
      )
    : new Vector3(
        Math.cos(index * 2.2) * piece.size[0] * 0.16,
        (index === 0 ? -0.08 : 0.08) * piece.size[1],
        Math.sin(index * 2.2) * piece.size[2] * 0.16,
      );
  center.add(localOffset.applyQuaternion(rotation));
  const scale = isHedge
    ? new Vector3(
        piece.size[0] * 0.42,
        piece.size[1] * (0.82 + (index % 2) * 0.1),
        piece.size[2] * 0.98,
      )
    : new Vector3(
        piece.size[0] * 0.74,
        piece.size[1] * (0.76 + (index % 2) * 0.16),
        piece.size[2] * 0.74,
      );
  return new Matrix4().compose(center, rotation, scale);
}

function buildTreeVisuals(
  pieces: readonly BreakablePieceDefinition[],
): TreeVisualBuild {
  const wood: VisualInstance[] = [];
  const roots: VisualInstance[] = [];
  const rootJoints: VisualInstance[] = [];
  const foliage: FoliageInstance[] = [];
  const conifer: FoliageInstance[] = [];

  for (const group of groupTrees(pieces)) {
    if (group.trunk) {
      pushCurvedPiece(
        wood,
        group.trunk,
        group.seed,
        group.kind,
        "trunk",
        undefined,
        roots,
        rootJoints,
      );
    }
    if (group.kind === "pine") {
      if (group.trunk) {
        group.foliage.forEach((tier, index) =>
          pushPineWhorl(wood, group.trunk!, tier, group.seed, index),
        );
      }
      group.foliage.forEach((tier, index) => {
        conifer.push({
          sourceId: tier.id,
          matrix: pieceMatrix(tier),
          color: new Color(tier.color),
          species: 2,
          phase: hash(group.seed + hashText(group.id) * 100, 280 + index),
        });
      });
      continue;
    }
    group.branches.forEach((branch) =>
      pushCurvedPiece(
        wood,
        branch,
        group.seed,
        group.kind,
        "branch",
        group.trunk,
      ),
    );
    if (
      group.kind === "birch" &&
      group.trunk &&
      group.branches.length === 0
    ) {
      group.foliage.forEach((cluster, index) =>
        pushBirchTwig(wood, group.trunk!, cluster, group.seed, index),
      );
    }
    group.foliage.forEach((cluster, index) => {
      // Three overlapping render lobes make a dense crown while the gameplay
      // proxy remains small. All lobes address the same destructible section
      // and still share one draw call.
      for (let lobe = 0; lobe < 3; lobe += 1) {
        foliage.push({
          sourceId: cluster.id,
          matrix: treeFoliageLobeMatrix(cluster, lobe, group.seed + index * 7),
          color: new Color(cluster.color),
          species: group.kind === "birch" ? 1 : 0,
          phase: hash(
            group.seed + hashText(group.id) * 100,
            150 + index * 2 + lobe,
          ),
        });
      }
    });
  }

  for (const piece of pieces) {
    const visual = piece.vegetationVisual;
    if (!visual) {
      continue;
    }
    pushShrubTwigs(wood, piece);
    const lobeCount = visual.kind === "hedge" ? 4 : 3;
    for (let index = 0; index < lobeCount; index += 1) {
      foliage.push({
        sourceId: piece.id,
        matrix: vegetationLobeMatrix(piece, index, lobeCount),
        color: new Color(piece.color),
        species: 0,
        phase: hash(visual.seed + hashText(piece.id) * 100, 470 + index),
      });
    }
  }

  return { wood, roots, rootJoints, foliage, conifer };
}

function treeFoliageLobeMatrix(
  piece: BreakablePieceDefinition,
  index: number,
  seed: number,
): Matrix4 {
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const side = index - 1;
  const center = new Vector3(...piece.position).add(
    new Vector3(
      side * piece.size[0] * (0.1 + hash(seed, 610 + index) * 0.04),
      side * piece.size[1] * 0.045,
      (hash(seed, 620 + index) - 0.5) * piece.size[2] * 0.16,
    ).applyQuaternion(rotation),
  );
  return new Matrix4().compose(
    center,
    rotation,
    new Vector3(
      piece.size[0] * 0.84,
      piece.size[1] * 0.9,
      piece.size[2] * 0.84,
    ),
  );
}

function makeLeafCloudGeometry(leafCount = 72): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const leafData: number[] = [];
  const indices: number[] = [];
  let vertex = 0;

  for (let leaf = 0; leaf < leafCount; leaf += 1) {
    const azimuth = hash(leaf, 1) * Math.PI * 2;
    const vertical = hash(leaf, 2) * 2 - 1;
    const radial = 0.14 + Math.pow(hash(leaf, 3), 0.44) * 0.35;
    const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const center = new Vector3(
      Math.cos(azimuth) * horizontal * radial,
      vertical * radial * 0.9,
      Math.sin(azimuth) * horizontal * radial,
    );

    const normal = new Vector3(
      hash(leaf, 4) * 2 - 1,
      0.25 + hash(leaf, 5) * 0.75,
      hash(leaf, 6) * 2 - 1,
    ).normalize();
    let tangent = normal.clone().cross(UP);
    if (tangent.lengthSq() < 0.01) {
      tangent = normal.clone().cross(new Vector3(1, 0, 0));
    }
    tangent.normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const roll = hash(leaf, 7) * Math.PI * 2;
    const rolledTangent = tangent
      .clone()
      .multiplyScalar(Math.cos(roll))
      .addScaledVector(bitangent, Math.sin(roll));
    const rolledBitangent = normal.clone().cross(rolledTangent).normalize();
    const width = 0.048 + hash(leaf, 8) * 0.032;
    const height = width * (1.3 + hash(leaf, 9) * 0.42);
    const points = [
      center.clone().addScaledVector(rolledBitangent, -height),
      center.clone().addScaledVector(rolledTangent, width),
      center.clone().addScaledVector(rolledBitangent, height),
      center.clone().addScaledVector(rolledTangent, -width),
    ];
    const tone = 0.78 + hash(leaf, 10) * 0.3;
    const rank = (leaf + hash(leaf, 11) * 0.8) / leafCount;

    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      colors.push(tone * 0.92, tone, tone * 0.84);
      leafData.push(center.x, center.y, center.z, rank);
    }
    uvs.push(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aLeafData", new Float32BufferAttribute(leafData, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makePineSprayGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const leafData: number[] = [];
  const indices: number[] = [];
  const {
    boughCount,
    stationsPerBough,
    needlesPerStation,
    minimumLength,
    lengthVariation,
    minimumHalfWidth,
    halfWidthVariation,
  } = proceduralPineNeedleProfile;
  let vertex = 0;

  const pushNeedle = (
    base: Vector3,
    direction: Vector3,
    side: Vector3,
    length: number,
    width: number,
    rank: number,
    tone: number,
  ): void => {
    const root = base.clone().addScaledVector(direction, -length * 0.08);
    const shoulder = base.clone().addScaledVector(direction, length * 0.14);
    const tip = base.clone().addScaledVector(direction, length);
    const points = [
      root,
      shoulder.clone().addScaledVector(side, -width),
      tip,
      shoulder.clone().addScaledVector(side, width),
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      colors.push(tone * 0.76, tone * 0.93, tone * 0.69);
      leafData.push(base.x, base.y, base.z, rank);
    }
    uvs.push(0.5, 0, 0, 0.18, 0.5, 1, 1, 0.18);
    indices.push(
      vertex,
      vertex + 1,
      vertex + 2,
      vertex,
      vertex + 2,
      vertex + 3,
    );
    vertex += 4;
  };

  for (let bough = 0; bough < boughCount; bough += 1) {
    const angle = (bough / boughCount) * Math.PI * 2 + hash(bough, 501) * 0.3;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    for (let station = 0; station < stationsPerBough; station += 1) {
      const distance =
        0.075 + station * 0.054 + hash(bough, 510 + station) * 0.018;
      const base = radial
        .clone()
        .multiplyScalar(distance)
        .addScaledVector(
          tangent,
          (hash(bough, 520 + station) - 0.5) * 0.045,
        );
      base.y = (hash(bough, 530 + station) - 0.5) * 0.105;

      for (let needle = 0; needle < needlesPerStation; needle += 1) {
        const rank =
          (bough * stationsPerBough * needlesPerStation +
            station * needlesPerStation +
            needle) /
          (boughCount * stationsPerBough * needlesPerStation);
        const aroundAngle =
          (needle / needlesPerStation) * Math.PI * 2 +
          (hash(bough + station * 13, 540 + needle) - 0.5) * 0.42;
        const around = tangent
          .clone()
          .multiplyScalar(Math.cos(aroundAngle))
          .addScaledVector(UP, Math.sin(aroundAngle));
        const direction = radial
          .clone()
          .multiplyScalar(0.3)
          .addScaledVector(around, 0.954)
          .normalize();
        const side = direction.clone().cross(radial).normalize();
        const length =
          minimumLength +
          hash(bough + station * 7, 550 + needle) * lengthVariation;
        const width =
          minimumHalfWidth +
          hash(bough + station * 11, 560 + needle) * halfWidthVariation;
        const tone = 0.68 + hash(bough + station * 17, 570 + needle) * 0.3;
        pushNeedle(base, direction, side, length, width, rank, tone);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aLeafData", new Float32BufferAttribute(leafData, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const WoodBatch = memo(function WoodBatch({
  instances,
  hiddenPieceIds,
  variant = "wood",
}: {
  instances: readonly VisualInstance[];
  hiddenPieceIds: ReadonlySet<string>;
  variant?: "wood" | "root" | "joint";
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
      const tubeProfile = proceduralWoodTubeProfile("trunk");
      const next = variant === "joint"
        ? new SphereGeometry(0.5, 9, 5)
        : variant === "root"
          ? new CylinderGeometry(0.34, 0.5, 1, 8, 1, true)
        // Six longitudinal rings form one connected, bendable tube. There are
        // no open faces between them, so neither trunks nor branches can show
        // the old bright transverse gaps.
        : new CylinderGeometry(
            0.5,
            0.5,
            1,
            9,
            tubeProfile.longitudinalSegments,
            true,
          );
      const woodParams = new Float32Array(instances.length * 4);
      instances.forEach((instance, index) => {
        woodParams[index * 4] = instance.species;
        woodParams[index * 4 + 1] = instance.phase;
        woodParams[index * 4 + 2] = instance.bend ?? 0;
        woodParams[index * 4 + 3] = instance.taper ?? 1;
      });
      next.setAttribute(
        "aWoodParams",
        new InstancedBufferAttribute(woodParams, 4, false),
      );
      return next;
    },
    [instances, variant]);
  const material = useMemo(() => {
    const next = new MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.94,
        metalness: 0,
        vertexColors: true,
    });
    const barkAtlas = treeBarkAtlas();
    next.onBeforeCompile = (compiled) => {
      compiled.uniforms.uTreeBarkAtlas = { value: barkAtlas };
      compiled.vertexShader = compiled.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec4 aWoodParams;
varying vec3 vTreeWoodPosition;
varying vec4 vTreeWoodParams;
varying vec2 vTreeBarkUv;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
float treeWoodT = clamp(position.y + 0.5, 0.0, 1.0);
transformed.xz *= mix(1.0, aWoodParams.w, treeWoodT);
float treeWoodEnvelope = sin(treeWoodT * 3.14159265);
float treeWoodPhase = aWoodParams.y * 6.2831853;
transformed.x += cos(treeWoodPhase) * treeWoodEnvelope * aWoodParams.z;
transformed.z += sin(treeWoodPhase) * treeWoodEnvelope * aWoodParams.z;
vTreeWoodPosition = transformed;
vTreeWoodParams = aWoodParams;
vTreeBarkUv = uv;`,
        );
      compiled.fragmentShader = compiled.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform sampler2D uTreeBarkAtlas;
varying vec3 vTreeWoodPosition;
varying vec4 vTreeWoodParams;
varying vec2 vTreeBarkUv;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float barkColumn = clamp(floor(vTreeWoodParams.x + 0.5), 0.0, 2.0);
float barkPadding = 0.006;
float barkU = fract(vTreeBarkUv.x + vTreeWoodParams.y * 0.73);
float atlasU = (
  barkColumn + barkPadding + barkU * (1.0 - barkPadding * 2.0)
) / 3.0;
vec3 barkAlbedo = texture2D(
  uTreeBarkAtlas,
  vec2(atlasU, clamp(vTreeBarkUv.y, 0.002, 0.998))
).rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, barkAlbedo, 0.94);`,
        );
    };
    next.customProgramCacheKey = () => "procedural-tree-wood-v4-bark-atlas";
    return next;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    instances.forEach((instance, index) => {
      current.setMatrixAt(
        index,
        hiddenPieceIds.has(instance.sourceId)
          ? HIDDEN_MATRIX
          : instance.matrix,
      );
      current.setColorAt(index, instance.color);
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
  }, [hiddenPieceIds, instances]);

  if (instances.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      userData={{
        breakableInstanceIds: instances.map((instance) => instance.sourceId),
        breakableMaterial: "wood",
      }}
    />
  );
});

const FoliageBatch = memo(function FoliageBatch({
  instances,
  hiddenPieceIds,
  variant = "broadleaf",
}: {
  instances: readonly FoliageInstance[];
  hiddenPieceIds: ReadonlySet<string>;
  variant?: "broadleaf" | "pine";
}) {
  const mesh = useRef<InstancedMesh>(null);
  const shader = useRef<TreeShader | null>(null);
  const geometry = useMemo(() => {
    const next = variant === "pine"
      ? makePineSprayGeometry()
      : makeLeafCloudGeometry();
    const treeParams = new Float32Array(instances.length * 2);
    instances.forEach((instance, index) => {
      treeParams[index * 2] = instance.species;
      treeParams[index * 2 + 1] = instance.phase;
    });
    next.setAttribute(
      "aTreeParams",
      new InstancedBufferAttribute(treeParams, 2, false),
    );
    return next;
  }, [instances, variant]);
  const material = useMemo(() => {
    const next = new MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#071208",
      emissiveIntensity: 0.2,
      metalness: 0,
      roughness: 0.9,
      side: DoubleSide,
      vertexColors: true,
    });
    next.onBeforeCompile = (compiled) => {
      compiled.uniforms.uTreeTime = { value: 0 };
      compiled.uniforms.uTreeWind = { value: 1 };
      compiled.uniforms.uTreeCamera = { value: new Vector3() };
      compiled.vertexShader = compiled.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec4 aLeafData;
attribute vec2 aTreeParams;
uniform float uTreeTime;
uniform float uTreeWind;
uniform vec3 uTreeCamera;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vec3 treeAnchor = instanceMatrix[3].xyz;
float treeDistance = distance(treeAnchor, uTreeCamera);
float treeNearToMid = smoothstep(22.0, 48.0, treeDistance);
float treeMidToFar = smoothstep(48.0, 82.0, treeDistance);
float treeDensity = mix(1.0, 0.62, treeNearToMid);
treeDensity = mix(treeDensity, 0.28, treeMidToFar);
float treeIsBirch = step(0.5, aTreeParams.x) * (1.0 - step(1.5, aTreeParams.x));
treeDensity *= mix(1.0, 0.88, treeIsBirch);
float treeVisible = step(aLeafData.w, treeDensity);
float treeAreaPreservation = min(1.55, inversesqrt(max(treeDensity, 0.2)));
vec3 treeLeafOffset = transformed - aLeafData.xyz;
transformed = aLeafData.xyz + treeLeafOffset * treeAreaPreservation;
float treePhase = aTreeParams.y * 6.28318 + aLeafData.w * 11.7;
float treeGust = sin(uTreeTime * 1.13 + treePhase + treeAnchor.x * 0.09 + treeAnchor.z * 0.07);
float treeFlutter = sin(uTreeTime * 3.7 + treePhase * 1.91);
transformed.x += (treeGust * 0.018 + treeFlutter * 0.007) * uTreeWind;
transformed.z += (treeGust * 0.012 - treeFlutter * 0.005) * uTreeWind;
transformed = mix(aLeafData.xyz, transformed, treeVisible);`,
        );
      shader.current = compiled as TreeShader;
    };
    next.customProgramCacheKey = () => `procedural-tree-foliage-v2:${variant}`;
    return next;
  }, [variant]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    instances.forEach((instance, index) => {
      current.setMatrixAt(
        index,
        hiddenPieceIds.has(instance.sourceId)
          ? HIDDEN_MATRIX
          : instance.matrix,
      );
      current.setColorAt(index, instance.color);
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
  }, [hiddenPieceIds, instances]);

  useFrame((state) => {
    const current = shader.current;
    if (!current) {
      return;
    }
    current.uniforms.uTreeTime.value = state.clock.elapsedTime;
    current.uniforms.uTreeWind.value = windState.strength;
    (current.uniforms.uTreeCamera.value as Vector3).copy(state.camera.position);
  });

  if (instances.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      userData={{
        breakableInstanceIds: instances.map((instance) => instance.sourceId),
        breakableMaterial: "foliage",
      }}
    />
  );
});

/**
 * A high-detail visual skin over the existing tree gameplay proxies. All
 * trunks and branches share one draw call; every broadleaf canopy shares one
 * more. Hiding a proxy hides its visual segments, so the existing destruction
 * path remains authoritative.
 */
export const TreeVisuals = memo(function TreeVisuals({
  pieces,
  hiddenPieceIds,
}: {
  pieces: readonly BreakablePieceDefinition[];
  hiddenPieceIds: ReadonlySet<string>;
}) {
  const build = useMemo(() => buildTreeVisuals(pieces), [pieces]);
  if (
    build.wood.length === 0 &&
    build.roots.length === 0 &&
    build.rootJoints.length === 0 &&
    build.foliage.length === 0 &&
    build.conifer.length === 0
  ) {
    return null;
  }
  return (
    <>
      <WoodBatch instances={build.wood} hiddenPieceIds={hiddenPieceIds} />
      <WoodBatch
        instances={build.roots}
        hiddenPieceIds={hiddenPieceIds}
        variant="root"
      />
      <WoodBatch
        instances={build.rootJoints}
        hiddenPieceIds={hiddenPieceIds}
        variant="joint"
      />
      <FoliageBatch
        instances={build.foliage}
        hiddenPieceIds={hiddenPieceIds}
      />
      <FoliageBatch
        instances={build.conifer}
        hiddenPieceIds={hiddenPieceIds}
        variant="pine"
      />
    </>
  );
});
