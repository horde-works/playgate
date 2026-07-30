"use client";

import { useFrame } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Quaternion,
  Shape,
  Sphere,
  SphereGeometry,
  Vector3,
} from "three";
import {
  litWindowColor,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type LandscapeSurfaceProfile,
  type SurfaceTextureProfile,
  type TreeVisualDefinition,
} from "./destructionScene";
import {
  groundMaterials,
  type RemnantDefinition,
  type ShardDefinition,
} from "./destructionRuntime";
import {
  getPieceMaterial,
  isSignalGlassColor,
  pieceMaterialBaseColor,
} from "./materialTextures";
import { materialAnchorWithWeathering } from "./materialAppearance";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "./silicateJoints";
import { computeBoxFaceMasks } from "./boxFaceMasks";
import {
  treeBarkPhase,
  treeWoodSpecies,
  usesFoliageDebrisGeometry,
  usesTreeBarkVisual,
} from "./treeVisualModel";
import { treeBarkAtlas } from "./treeBarkAtlas";
import { getPieceRenderBoxes } from "./breakableGeometry";
import type { CompoundKinematicClusterRegistry } from "./compoundKinematicCluster";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_SPHERE = new SphereGeometry(0.5, 32, 20);

function dynamicSurfacePolygonGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualProfile"]>,
): ExtrudeGeometry {
  if (profile.vertices.length < 3) {
    throw new Error("A dynamic surface polygon needs at least three vertices");
  }
  const [[firstX, firstY], ...rest] = profile.vertices;
  const shape = new Shape().moveTo(firstX, firstY);
  for (const [x, y] of rest) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
  }).translate(0, 0, -0.5);
}

function dynamicSurfaceMeshGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualMesh"]>,
): BufferGeometry {
  if (profile.vertices.length < 3 || profile.indices.length < 3) {
    throw new Error("A dynamic surface mesh needs vertices and triangle indices");
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      profile.vertices.flatMap((vertex) => [...vertex]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      profile.vertices.flatMap(([x, y]) => [x + 0.5, y + 0.5]),
      2,
    ),
  );
  geometry.setIndex([...profile.indices]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function detachedFoliageGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;

  for (let leaf = 0; leaf < 42; leaf += 1) {
    const phase = leaf * 12.9898;
    const random = (salt: number): number => {
      const value = Math.sin(phase + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const center = new Vector3(
      (random(1) - 0.5) * 0.72,
      (random(2) - 0.5) * 0.68,
      (random(3) - 0.5) * 0.72,
    );
    const normal = new Vector3(
      random(4) * 2 - 1,
      0.25 + random(5),
      random(6) * 2 - 1,
    ).normalize();
    let tangent = normal.clone().cross(new Vector3(0, 1, 0));
    if (tangent.lengthSq() < 0.01) {
      tangent = normal.clone().cross(new Vector3(1, 0, 0));
    }
    tangent.normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const width = 0.035 + random(7) * 0.025;
    const height = width * (1.35 + random(8) * 0.5);
    const points = [
      center.clone().addScaledVector(bitangent, -height),
      center.clone().addScaledVector(tangent, width),
      center.clone().addScaledVector(bitangent, height),
      center.clone().addScaledVector(tangent, -width),
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
    }
    uvs.push(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const UNIT_FOLIAGE_DEBRIS = detachedFoliageGeometry();

// Порог «покоя» несомого кластера. Пришвартованный корабль качается всё
// слабее; когда его визуальная поза сдвигается меньше, чем на эти допуски
// (0.01 мм / ~микрорадианы), матрицы его кусков перестают переписываться и
// инстанс-буфер не перезаливается впустую. Сравнение идёт с последней
// ЗАПИСАННОЙ позой, поэтому медленный дрейф не теряется — он накапливается
// и переписывает матрицы, как только превысит допуск.
const CLUSTER_POSITION_EPSILON = 1e-5;
const CLUSTER_QUATERNION_EPSILON = 1e-6;
// union() умеет только расширять сферу рейкастов: после перелёта корабля она
// покрывала весь маршрут и переставала отсекать. Периодическая пересборка с
// нуля по фактическим матрицам возвращает ей точный размер.
const RAYCAST_BOUNDS_REBUILD_FRAMES = 240;

interface ClusterRestPose {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

function clusterPoseChanged(
  poses: Map<string, ClusterRestPose>,
  clusterId: string,
  object: Object3D,
): boolean {
  const cached = poses.get(clusterId);
  if (!cached) {
    poses.set(clusterId, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    });
    return true;
  }
  const moved =
    Math.abs(object.position.x - cached.position.x) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.position.y - cached.position.y) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.position.z - cached.position.z) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.quaternion.x - cached.quaternion.x) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.y - cached.quaternion.y) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.z - cached.quaternion.z) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.w - cached.quaternion.w) >
      CLUSTER_QUATERNION_EPSILON;
  if (moved) {
    cached.position.copy(object.position);
    cached.quaternion.copy(object.quaternion);
  }
  return moved;
}

type DynamicBreakableKind = "piece" | "shard" | "remnant";
type DynamicGeometryKind =
  | "box"
  | "sphere"
  | "cylinder"
  | "foliage"
  | "surfacePolygon"
  | "surfaceMesh";

interface DynamicBreakableFragment {
  readonly sourceId: string;
  readonly clusterId?: string;
  readonly kind: DynamicBreakableKind;
  readonly geometryKind: DynamicGeometryKind;
  readonly visualProfile?: BreakablePieceDefinition["visualProfile"];
  readonly visualMesh?: BreakablePieceDefinition["visualMesh"];
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly textureProfile?: SurfaceTextureProfile;
  readonly weathering?: number;
  readonly color: string;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  // Jointed masonry keeps the former joint-shell expansion so the baked
  // silicate seams still close the authored air gaps between blocks.
  readonly sizeExpansion: number;
  // Which faces of this box are exposed surface (vs flush against a sibling
  // box of the same carved body) — gates bevels/edge wear in the shader.
  readonly faceMaskPositive: readonly [number, number, number];
  readonly faceMaskNegative: readonly [number, number, number];
  readonly fallbackPosition: readonly [number, number, number];
  readonly fallbackQuaternion: readonly [number, number, number, number];
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  readonly treeVisualSourceId?: string;
}

interface DynamicBreakableBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly textureProfile?: SurfaceTextureProfile;
  readonly geometryKind: DynamicGeometryKind;
  readonly visualProfile?: BreakablePieceDefinition["visualProfile"];
  readonly visualMesh?: BreakablePieceDefinition["visualMesh"];
  readonly treeBark: boolean;
  readonly fragments: readonly DynamicBreakableFragment[];
}

function fragmentHasJoints(fragment: DynamicBreakableFragment): boolean {
  return (
    fragment.kind === "piece" &&
    hasSilicateJoints(fragment.sourceId, fragment.material)
  );
}

// A broken light goes out: once a glowing fixture (sill lamp, street lamp
// head, torch flame) is knocked loose or shattered, its glass renders as
// plain extinguished glass instead of keeping the emissive glow.
const extinguishedGlass = "#c3cdc9";

function quenchedColor(material: BreakableMaterial, color: string): string {
  return material === "glass" && (color === litWindowColor || isSignalGlassColor(color))
    ? extinguishedGlass
    : color;
}

function dynamicVisualProfileKey(
  profile: BreakablePieceDefinition["visualProfile"],
): string {
  return profile
    ? profile.vertices
        .map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`)
        .join(";")
    : "default";
}

function dynamicVisualMeshKey(
  profile: BreakablePieceDefinition["visualMesh"],
): string {
  if (!profile) return "default";
  let hash = 2166136261;
  const mix = (value: number): void => {
    const text = value.toFixed(5);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  };
  for (const vertex of profile.vertices) {
    mix(vertex[0]);
    mix(vertex[1]);
    mix(vertex[2]);
  }
  for (const index of profile.indices) mix(index);
  return `${profile.vertices.length}:${profile.indices.length}:${hash >>> 0}:${profile.doubleSided === false ? "front" : "double"}`;
}

function eulerQuaternion(
  rotation: readonly [number, number, number] | undefined,
): readonly [number, number, number, number] {
  if (!rotation) {
    return [0, 0, 0, 1];
  }

  const object = new Object3D();
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  return [
    object.quaternion.x,
    object.quaternion.y,
    object.quaternion.z,
    object.quaternion.w,
  ];
}

function sourceFragments(
  pieces: readonly BreakablePieceDefinition[],
  shards: readonly ShardDefinition[],
  remnants: readonly RemnantDefinition[],
): readonly DynamicBreakableFragment[] {
  const fragments: DynamicBreakableFragment[] = [];

  for (const piece of pieces) {
    const fallbackQuaternion = eulerQuaternion(piece.rotation);
    const sizeExpansion = hasSilicateJoints(piece.id, piece.material)
      ? SILICATE_JOINT_EXPANSION
      : 0;
    const pieceColor = quenchedColor(piece.material, piece.color);
    const exactGeometry = piece.visualMesh
      ? "surfaceMesh" as const
      : piece.visualProfile
        ? "surfacePolygon" as const
        : null;
    if (exactGeometry) {
      fragments.push({
        sourceId: piece.id,
        clusterId: piece.clusterId,
        kind: "piece",
        geometryKind: exactGeometry,
        visualProfile: piece.visualProfile,
        visualMesh: piece.visualMesh,
        material: piece.material,
        materialColor: pieceMaterialBaseColor(piece.material, pieceColor),
        textureProfile: piece.textureProfile,
        weathering: piece.weathering,
        color: pieceColor,
        center: [0, 0, 0],
        size: piece.size,
        sizeExpansion: 0,
        faceMaskPositive: [0, 0, 0],
        faceMaskNegative: [0, 0, 0],
        fallbackPosition: piece.position,
        fallbackQuaternion,
        landscapeSurface: piece.landscapeSurface,
        treeVisual: piece.treeVisual,
        treeVisualSourceId: piece.treeVisual ? piece.id : undefined,
      });
      continue;
    }
    const boxes = getPieceRenderBoxes(piece);
    const faceMasks = computeBoxFaceMasks(
      boxes,
      groundMaterials.has(piece.material),
    );
    const geometryKind = usesFoliageDebrisGeometry(piece.material, piece)
      ? "foliage" as const
      : piece.shape === "sphere"
        ? "sphere" as const
      : piece.shape === "cylinder"
        ? "cylinder" as const
        : "box" as const;
    boxes.forEach((box, boxIndex) => {
      fragments.push({
        sourceId: piece.id,
        clusterId: piece.clusterId,
        kind: "piece",
        geometryKind,
        material: piece.material,
        materialColor: pieceMaterialBaseColor(piece.material, pieceColor),
        textureProfile: piece.textureProfile,
        weathering: piece.weathering,
        color: pieceColor,
        center: box.center,
        size: box.size,
        sizeExpansion,
        faceMaskPositive:
          geometryKind !== "box"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          geometryKind !== "box"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: piece.position,
        fallbackQuaternion,
        landscapeSurface: piece.landscapeSurface,
        treeVisual: piece.treeVisual,
        treeVisualSourceId: piece.treeVisual ? piece.id : undefined,
      });
    });
  }

  for (const shard of shards) {
    const boxes =
      shard.boxes && shard.boxes.length > 0
        ? shard.boxes
        : [{ center: [0, 0, 0] as const, size: shard.size }];
    const faceMasks = computeBoxFaceMasks(
      boxes,
      groundMaterials.has(shard.material),
    );
    const shardColor = quenchedColor(
      shard.material,
      shard.renderColor ?? shard.color,
    );
    const shardGeometry = usesFoliageDebrisGeometry(shard.material)
      ? "foliage" as const
      : shard.shape === "sphere"
        ? "sphere" as const
      : shard.shape === "cylinder"
        ? "cylinder" as const
        : "box" as const;
    boxes.forEach((box, boxIndex) => {
      fragments.push({
        sourceId: shard.id,
        kind: "shard",
        geometryKind: shardGeometry,
        material: shard.material,
        materialColor: pieceMaterialBaseColor(shard.material, shardColor),
        textureProfile: shard.textureProfile,
        weathering: shard.weathering,
        color: shardColor,
        center: box.center,
        size: box.size,
        sizeExpansion: 0,
        faceMaskPositive:
          shardGeometry !== "box"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          shardGeometry !== "box"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: shard.position,
        fallbackQuaternion: shard.quaternion,
        landscapeSurface: shard.landscapeSurface,
        treeVisual: shard.treeVisual,
        treeVisualSourceId: shard.treeVisualSourceId,
      });
    });
  }

  for (const remnant of remnants) {
    const boxes =
      remnant.boxes && remnant.boxes.length > 0
        ? remnant.boxes
        : [{ center: [0, 0, 0] as const, size: remnant.size }];
    const faceMasks = computeBoxFaceMasks(
      boxes,
      groundMaterials.has(remnant.material),
    );
    const remnantColor = quenchedColor(
      remnant.material,
      remnant.renderColor ?? remnant.color,
    );
    const remnantGeometry = usesFoliageDebrisGeometry(remnant.material)
      ? "foliage" as const
      : remnant.shape === "sphere"
        ? "sphere" as const
      : remnant.shape === "cylinder"
        ? "cylinder" as const
        : "box" as const;
    boxes.forEach((box, boxIndex) => {
      fragments.push({
        sourceId: remnant.id,
        kind: "remnant",
        geometryKind: remnantGeometry,
        material: remnant.material,
        materialColor: pieceMaterialBaseColor(
          remnant.material,
          remnantColor,
        ),
        textureProfile: remnant.textureProfile,
        weathering: remnant.weathering,
        color: remnantColor,
        center: box.center,
        size: box.size,
        sizeExpansion: 0,
        faceMaskPositive:
          remnantGeometry !== "box"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          remnantGeometry !== "box"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: remnant.position,
        fallbackQuaternion: remnant.quaternion,
        landscapeSurface: remnant.landscapeSurface,
        treeVisual: remnant.treeVisual,
        treeVisualSourceId: remnant.treeVisualSourceId,
      });
    });
  }

  return fragments;
}

function buildBatches(
  fragments: readonly DynamicBreakableFragment[],
): readonly DynamicBreakableBatch[] {
  const batches = new Map<string, DynamicBreakableFragment[]>();

  for (const fragment of fragments) {
    const treeBark = usesTreeBarkVisual(fragment.material, fragment.treeVisual);
    const exactGeometryKey = fragment.geometryKind === "surfaceMesh"
      ? dynamicVisualMeshKey(fragment.visualMesh)
      : fragment.geometryKind === "surfacePolygon"
        ? dynamicVisualProfileKey(fragment.visualProfile)
        : "default";
    const key = `${fragment.material}:${fragment.materialColor}:${fragment.textureProfile ?? "default"}:${fragment.geometryKind}:${exactGeometryKey}:${treeBark ? "tree-bark" : "default-skin"}`;
    const current = batches.get(key);
    if (current) {
      current.push(fragment);
    } else {
      batches.set(key, [fragment]);
    }
  }

  return [...batches].map(([id, batchFragments]) => ({
    id,
    material: batchFragments[0].material,
    materialColor: batchFragments[0].materialColor,
    textureProfile: batchFragments[0].textureProfile,
    geometryKind: batchFragments[0].geometryKind,
    visualProfile: batchFragments[0].visualProfile,
    visualMesh: batchFragments[0].visualMesh,
    treeBark: usesTreeBarkVisual(
      batchFragments[0].material,
      batchFragments[0].treeVisual,
    ),
    fragments: batchFragments,
  }));
}

function setFragmentMatrix(
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
  body: RapierRigidBody | undefined,
  localCenter: Vector3,
  rotation: Quaternion,
): void {
  if (body) {
    const translation = body.translation();
    const bodyRotation = body.rotation();
    rotation.set(
      bodyRotation.x,
      bodyRotation.y,
      bodyRotation.z,
      bodyRotation.w,
    );
    localCenter
      .set(fragment.center[0], fragment.center[1], fragment.center[2])
      .applyQuaternion(rotation);
    dummy.position.set(
      translation.x + localCenter.x,
      translation.y + localCenter.y,
      translation.z + localCenter.z,
    );
  } else {
    rotation.set(...fragment.fallbackQuaternion);
    localCenter
      .set(fragment.center[0], fragment.center[1], fragment.center[2])
      .applyQuaternion(rotation);
    dummy.position.set(
      fragment.fallbackPosition[0] + localCenter.x,
      fragment.fallbackPosition[1] + localCenter.y,
      fragment.fallbackPosition[2] + localCenter.z,
    );
  }

  dummy.quaternion.copy(rotation);
  dummy.scale.set(
    fragment.size[0] + fragment.sizeExpansion,
    fragment.size[1] + fragment.sizeExpansion,
    fragment.size[2] + fragment.sizeExpansion,
  );
  dummy.updateMatrix();
}

function setClusteredFragmentMatrix(
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
  clusterOrigin: readonly [number, number, number],
  clusterObject: Object3D,
  localCenter: Vector3,
  rotation: Quaternion,
): void {
  const ownRotation = rotation.set(...fragment.fallbackQuaternion);
  localCenter
    .set(fragment.center[0], fragment.center[1], fragment.center[2])
    .applyQuaternion(ownRotation);
  localCenter.set(
    localCenter.x + fragment.fallbackPosition[0] - clusterOrigin[0],
    localCenter.y + fragment.fallbackPosition[1] - clusterOrigin[1],
    localCenter.z + fragment.fallbackPosition[2] - clusterOrigin[2],
  );
  localCenter.applyQuaternion(clusterObject.quaternion);
  dummy.position.copy(clusterObject.position).add(localCenter);
  dummy.quaternion.copy(clusterObject.quaternion).multiply(ownRotation);
  dummy.scale.set(
    fragment.size[0] + fragment.sizeExpansion,
    fragment.size[1] + fragment.sizeExpansion,
    fragment.size[2] + fragment.sizeExpansion,
  );
  dummy.updateMatrix();
}

function expandFragmentBounds(
  bounds: Sphere,
  fragmentBounds: Sphere,
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
): void {
  const expansion = fragment.sizeExpansion;
  fragmentBounds.center.copy(dummy.position);
  fragmentBounds.radius =
    Math.hypot(
      fragment.size[0] + expansion,
      fragment.size[1] + expansion,
      fragment.size[2] + expansion,
    ) / 2;
  bounds.union(fragmentBounds);
}

const DynamicBreakableBatch = memo(function DynamicBreakableBatch({
  batch,
  bodies,
  kinematicClusters,
}: {
  batch: DynamicBreakableBatch;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters?: CompoundKinematicClusterRegistry;
}) {
  const { rapier, rigidBodyStates } = useRapier();
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const source = batch.geometryKind === "surfaceMesh"
      ? dynamicSurfaceMeshGeometry(batch.visualMesh!)
      : batch.geometryKind === "surfacePolygon"
        ? dynamicSurfacePolygonGeometry(batch.visualProfile!)
        : (
        batch.geometryKind === "cylinder"
        ? UNIT_CYLINDER
        : batch.geometryKind === "sphere"
          ? UNIT_SPHERE
        : batch.geometryKind === "foliage"
          ? UNIT_FOLIAGE_DEBRIS
          : UNIT_BOX
      );
    const next = batch.geometryKind === "surfaceMesh" ||
        batch.geometryKind === "surfacePolygon"
      ? source
      : source.clone();
    // xyz = stable world anchor, w = authored exterior weathering. Keeping
    // both values across the intact -> dynamic transition prevents painted,
    // mossy or moulded masonry from flashing back to plain grey on impact.
    const anchors = new Float32Array(batch.fragments.length * 4);
    batch.fragments.forEach((fragment, index) => {
      anchors.set(
        materialAnchorWithWeathering(
          fragment.fallbackPosition,
          fragment.center,
          fragment.weathering,
        ),
        index * 4,
      );
    });
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(anchors, 4, false),
    );
    // Moving debris gets neutral baked lighting (screen-space AO covers it);
    // without these attributes the shader would read zeros and go black.
    next.setAttribute(
      "bakedAoA",
      new InstancedBufferAttribute(
        new Float32Array(batch.fragments.length * 4).fill(1),
        4,
        false,
      ),
    );
    next.setAttribute(
      "bakedAoB",
      new InstancedBufferAttribute(
        new Float32Array(batch.fragments.length * 4).fill(1),
        4,
        false,
      ),
    );
    next.setAttribute(
      "bakedSkyExposure",
      new InstancedBufferAttribute(
        new Float32Array(batch.fragments.length).fill(1),
        1,
        false,
      ),
    );
    // Exposed-face masks: interior seams of multi-box bodies carry no edge
    // decorations, only genuinely exposed faces do.
    const facePos = new Float32Array(batch.fragments.length * 3);
    const faceNeg = new Float32Array(batch.fragments.length * 3);
    batch.fragments.forEach((fragment, index) => {
      facePos.set(fragment.faceMaskPositive, index * 3);
      faceNeg.set(fragment.faceMaskNegative, index * 3);
    });
    next.setAttribute(
      "materialFaceMaskPos",
      new InstancedBufferAttribute(facePos, 3, false),
    );
    next.setAttribute(
      "materialFaceMaskNeg",
      new InstancedBufferAttribute(faceNeg, 3, false),
    );

    const bands = new Float32Array(batch.fragments.length);
    const tints = new Float32Array(batch.fragments.length * 3);
    const tint = new Color();
    batch.fragments.forEach((fragment, index) => {
      // Dynamic batches already sit at WebGL's 16-attribute ceiling. Tree
      // wood never uses silicate mortar, so its species and stable bark phase
      // share that existing vec3 instead of allocating a seventeenth
      // attribute (which makes the entire broken tree fail shader linking).
      if (batch.treeBark && fragment.treeVisual) {
        tints[index * 3] = treeWoodSpecies(fragment.treeVisual.kind);
        tints[index * 3 + 1] = treeBarkPhase(
          fragment.treeVisual.seed,
          fragment.treeVisualSourceId ?? fragment.sourceId,
        );
        return;
      }
      if (fragment.landscapeSurface) {
        bands[index] = fragment.landscapeSurface === "viking-ground" ? -1 : -2;
        return;
      }
      if (fragmentHasJoints(fragment)) {
        bands[index] = silicateJointBand(fragment.size);
        tint.set(silicateJointTint(fragment.color));
        tints[index * 3] = tint.r;
        tints[index * 3 + 1] = tint.g;
        tints[index * 3 + 2] = tint.b;
      }
    });
    next.setAttribute(
      "silicateJointBand",
      new InstancedBufferAttribute(bands, 1, false),
    );
    next.setAttribute(
      "silicateJointTint",
      new InstancedBufferAttribute(tints, 3, false),
    );
    return next;
  }, [batch]);
  const material = useMemo(() => {
    const base = getPieceMaterial(
      batch.material,
      batch.materialColor,
      batch.textureProfile,
    );
    const doubleSidedSurface = batch.geometryKind === "surfaceMesh" &&
      batch.visualMesh?.doubleSided !== false;
    if (
      !batch.treeBark &&
      batch.geometryKind !== "foliage" &&
      !doubleSidedSurface
    ) {
      return base;
    }
    const next = base.clone();
    if (batch.geometryKind === "foliage" || doubleSidedSurface) {
      next.side = DoubleSide;
    }
    if (batch.treeBark) {
      const baseCompile = base.onBeforeCompile;
      const baseProgramKey = base.customProgramCacheKey();
      const barkAtlas = treeBarkAtlas();
      next.onBeforeCompile = (compiled, renderer) => {
        baseCompile(compiled, renderer);
        compiled.uniforms.uTreeBarkAtlas = { value: barkAtlas };
        compiled.vertexShader = compiled.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec2 vTreeBarkUv;
varying float vTreeBarkSide;`,
          )
          .replace(
            "#include <beginnormal_vertex>",
            `#include <beginnormal_vertex>
vTreeBarkSide = 1.0 - smoothstep(0.55, 0.9, abs(objectNormal.y));`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vTreeBarkUv = uv;`,
          );
        compiled.fragmentShader = compiled.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform sampler2D uTreeBarkAtlas;
varying vec2 vTreeBarkUv;
varying float vTreeBarkSide;`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
float barkColumn = clamp(floor(vSilicateJointTint.x + 0.5), 0.0, 2.0);
float barkPadding = 0.006;
float barkU = fract(vTreeBarkUv.x + vSilicateJointTint.y * 0.73);
float atlasU = (
  barkColumn + barkPadding + barkU * (1.0 - barkPadding * 2.0)
) / 3.0;
vec3 barkAlbedo = texture2D(
  uTreeBarkAtlas,
  vec2(atlasU, clamp(vTreeBarkUv.y, 0.002, 0.998))
).rgb;
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  barkAlbedo,
  0.94 * clamp(vTreeBarkSide, 0.0, 1.0)
);`,
          );
      };
      next.customProgramCacheKey = () =>
        `${baseProgramKey}:dynamic-tree-bark-v1`;
    }
    return next;
  }, [
    batch.geometryKind,
    batch.material,
    batch.materialColor,
    batch.textureProfile,
    batch.treeBark,
    batch.visualMesh,
  ]);
  const instanceIds = useMemo(
    () => batch.fragments.map((fragment) => fragment.sourceId),
    [batch.fragments],
  );
  const instanceKinds = useMemo(
    () => batch.fragments.map((fragment) => fragment.kind),
    [batch.fragments],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const localCenter = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const raycastBounds = useMemo(() => new Sphere(), []);
  const fragmentBounds = useMemo(() => new Sphere(), []);
  const sleepingSources = useRef(new Set<string>());
  const observedSleepStates = useRef(new Map<string, boolean>());
  const clusterRestPoses = useRef(new Map<string, ClusterRestPose>());
  const observedClusterMotion = useRef(new Map<string, boolean>());
  const boundsRebuildCountdown = useRef(RAYCAST_BOUNDS_REBUILD_FRAMES);
  const clusterObject = (
    fragment: DynamicBreakableFragment,
    body: RapierRigidBody | undefined,
  ): { origin: readonly [number, number, number]; object: Object3D } | null => {
    if (
      !fragment.clusterId ||
      body?.bodyType() === rapier.RigidBodyType.Dynamic
    ) {
      return null;
    }
    const runtime = kinematicClusters?.current.get(fragment.clusterId);
    if (!runtime?.memberIds.has(fragment.sourceId)) {
      return null;
    }
    const object = runtime
      ? rigidBodyStates.get(runtime.body.handle)?.object
      : undefined;
    return object
      ? { origin: runtime.definition.origin, object }
      : null;
  };

  useEffect(
    () => () => {
      geometry.dispose();
      if (
        batch.geometryKind === "foliage" ||
        batch.treeBark ||
        (batch.geometryKind === "surfaceMesh" &&
          batch.visualMesh?.doubleSided !== false)
      ) {
        material.dispose();
      }
    },
    [batch.geometryKind, batch.treeBark, batch.visualMesh, geometry, material],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const color = new Color();
    raycastBounds.makeEmpty();
    sleepingSources.current.clear();
    batch.fragments.forEach((fragment, index) => {
      const fragmentBody = bodies?.current?.get(fragment.sourceId);
      setFragmentMatrix(
        dummy,
        fragment,
        fragmentBody,
        localCenter,
        rotation,
      );
      current.setMatrixAt(index, dummy.matrix);
      expandFragmentBounds(
        raycastBounds,
        fragmentBounds,
        dummy,
        fragment,
      );
      current.setColorAt(
        index,
        color.set(
          fragment.materialColor === "#ffffff"
            ? fragment.color
            : "#ffffff",
        ),
      );
    });
    current.instanceMatrix.setUsage(DynamicDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    // InstancedMesh caches this sphere after its first raycast. Keep our own
    // conservative sphere instead: moving debris expands it incrementally, so
    // raycasts stay valid without an O(instance count) bounds rebuild per frame.
    current.boundingSphere = raycastBounds;
  }, [
    batch.fragments,
    bodies,
    dummy,
    fragmentBounds,
    localCenter,
    raycastBounds,
    rotation,
  ]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    let changed = false;
    const sleepStates = observedSleepStates.current;
    sleepStates.clear();
    const clusterMotion = observedClusterMotion.current;
    clusterMotion.clear();
    batch.fragments.forEach((fragment, index) => {
      const body = bodies?.current?.get(fragment.sourceId);
      const clustered = clusterObject(fragment, body);
      if (!body && !clustered) {
        return;
      }
      if (clustered) {
        // Несомый кусок «спит» вместе со своим кластером: пока поза
        // носителя не сдвинулась заметнее допуска, матрицу не переписываем.
        const clusterId = fragment.clusterId ?? "";
        let moved = clusterMotion.get(clusterId);
        if (moved === undefined) {
          moved = clusterPoseChanged(
            clusterRestPoses.current,
            clusterId,
            clustered.object,
          );
          clusterMotion.set(clusterId, moved);
        }
        if (!moved) {
          return;
        }
        setClusteredFragmentMatrix(
          dummy,
          fragment,
          clustered.origin,
          clustered.object,
          localCenter,
          rotation,
        );
        current.setMatrixAt(index, dummy.matrix);
        expandFragmentBounds(
          raycastBounds,
          fragmentBounds,
          dummy,
          fragment,
        );
        changed = true;
        return;
      }
      if (!body) {
        return;
      }
      let sleeping = sleepStates.get(fragment.sourceId);
      if (sleeping === undefined) {
        sleeping = body.isSleeping();
        sleepStates.set(fragment.sourceId, sleeping);
      }
      // Copy the pose once on the awake -> sleeping transition. The sleep
      // manager may stop a body before this renderer's frame callback runs;
      // skipping that transition left the visible fragment at its prior pose.
      if (sleeping && sleepingSources.current.has(fragment.sourceId)) {
        return;
      }
      setFragmentMatrix(
        dummy,
        fragment,
        body,
        localCenter,
        rotation,
      );
      current.setMatrixAt(index, dummy.matrix);
      expandFragmentBounds(
        raycastBounds,
        fragmentBounds,
        dummy,
        fragment,
      );
      changed = true;
    });

    sleepingSources.current.clear();
    for (const [sourceId, sleeping] of sleepStates) {
      if (sleeping) {
        sleepingSources.current.add(sourceId);
      }
    }

    // Инкрементальный union только расширяет сферу; периодически собираем её
    // заново по фактическим матрицам (позиция — элементы 12..14), чтобы после
    // перелёта носителя рейкасты не проверяли пол-маршрута. Спящие фрагменты
    // при этом учитываются: их матрицы уже лежат в буфере.
    boundsRebuildCountdown.current -= 1;
    if (boundsRebuildCountdown.current <= 0) {
      boundsRebuildCountdown.current = RAYCAST_BOUNDS_REBUILD_FRAMES;
      const matrices = current.instanceMatrix.array;
      raycastBounds.makeEmpty();
      batch.fragments.forEach((fragment, index) => {
        const base = index * 16;
        fragmentBounds.center.set(
          matrices[base + 12],
          matrices[base + 13],
          matrices[base + 14],
        );
        const expansion = fragment.sizeExpansion;
        fragmentBounds.radius =
          Math.hypot(
            fragment.size[0] + expansion,
            fragment.size[1] + expansion,
            fragment.size[2] + expansion,
          ) / 2;
        raycastBounds.union(fragmentBounds);
      });
    }

    if (changed) {
      current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, batch.fragments.length]}
      castShadow={false}
      receiveShadow
      frustumCulled={false}
      userData={{
        breakableInstanceIds: instanceIds,
        breakableInstanceKinds: instanceKinds,
        breakableMaterial: batch.material,
      }}
    />
  );
});

export const DynamicBreakableWorld = memo(function DynamicBreakableWorld({
  pieces,
  shards,
  remnants,
  bodies,
  kinematicClusters,
}: {
  pieces: readonly BreakablePieceDefinition[];
  shards: readonly ShardDefinition[];
  remnants: readonly RemnantDefinition[];
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters?: CompoundKinematicClusterRegistry;
}) {
  const fragments = useMemo(
    () => sourceFragments(pieces, shards, remnants),
    [pieces, remnants, shards],
  );
  const batches = useMemo(() => buildBatches(fragments), [fragments]);

  return (
    <>
      {batches.map((batch) => (
        <DynamicBreakableBatch
          key={batch.id}
          batch={batch}
          bodies={bodies}
          kinematicClusters={kinematicClusters}
        />
      ))}
    </>
  );
});
