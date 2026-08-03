import { Object3D } from "three";
import {
  litWindowColor,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type LandscapeSurfaceProfile,
  type SurfaceTextureProfile,
  type TreeVisualDefinition,
} from "./destructionScene.ts";
import {
  groundMaterials,
  type RemnantDefinition,
  type ShardDefinition,
} from "./destructionRuntime.ts";
import {
  isSignalGlassColor,
  pieceMaterialBaseColor,
} from "./materialTextures.ts";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
} from "./silicateJoints.ts";
import { computeBoxFaceMasks } from "./boxFaceMasks.ts";
import {
  usesFoliageDebrisGeometry,
  usesTreeBarkVisual,
} from "./treeVisualModel.ts";
import { getPieceRenderBoxes } from "./breakableGeometry.ts";

export type DynamicBreakableKind = "piece" | "shard" | "remnant";
export type DynamicGeometryKind =
  | "box"
  | "sphere"
  | "cylinder"
  | "foliage"
  | "surfacePolygon"
  | "surfaceMesh";

export interface DynamicBreakableFragment {
  readonly sourceId: string;
  readonly clusterId?: string;
  /**
   * Чьим членом кластера является фрагмент: сам кусок — собой, обрубок —
   * своим родителем. По этому id проверяется, носит ли кластер фрагмент
   * до сих пор.
   */
  readonly clusterMemberId?: string;
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

export interface DynamicBreakableBatch {
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

export function fragmentHasJoints(fragment: DynamicBreakableFragment): boolean {
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
  for (const normal of profile.normals ?? []) {
    mix(normal[0]);
    mix(normal[1]);
    mix(normal[2]);
  }
  for (const color of profile.colors ?? []) {
    mix(color[0]);
    mix(color[1]);
    mix(color[2]);
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

// Фрагменты источника зависят только от него самого, а объекты источников
// стабильны между коммитами: commitShards/commitRemnants сохраняют identity
// нетронутых тел. Кэш по объекту-источнику делает списки фрагментов
// стабильными, а вместе с ними — identity целых батчей ниже: carve одного
// тела перестаёт пересобирать геометрию и атрибуты всех батчей мира.
const pieceFragmentCache = new WeakMap<
  BreakablePieceDefinition,
  readonly DynamicBreakableFragment[]
>();
const shardFragmentCache = new WeakMap<
  ShardDefinition,
  readonly DynamicBreakableFragment[]
>();
const remnantFragmentCache = new WeakMap<
  RemnantDefinition,
  readonly DynamicBreakableFragment[]
>();

export function sourceFragments(
  pieces: readonly BreakablePieceDefinition[],
  shards: readonly ShardDefinition[],
  remnants: readonly RemnantDefinition[],
): readonly DynamicBreakableFragment[] {
  const result: DynamicBreakableFragment[] = [];
  for (const piece of pieces) {
    result.push(...pieceFragments(piece));
  }
  for (const shard of shards) {
    result.push(...shardFragments(shard));
  }
  for (const remnant of remnants) {
    result.push(...remnantFragments(remnant));
  }
  return result;
}

function pieceFragments(
  piece: BreakablePieceDefinition,
): readonly DynamicBreakableFragment[] {
  const cached = pieceFragmentCache.get(piece);
  if (cached) {
    return cached;
  }
  const fragments: DynamicBreakableFragment[] = [];
  {
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
      pieceFragmentCache.set(piece, fragments);
      return fragments;
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
  pieceFragmentCache.set(piece, fragments);
  return fragments;
}

function shardFragments(
  shard: ShardDefinition,
): readonly DynamicBreakableFragment[] {
  const cached = shardFragmentCache.get(shard);
  if (cached) {
    return cached;
  }
  const fragments: DynamicBreakableFragment[] = [];
  {
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
  shardFragmentCache.set(shard, fragments);
  return fragments;
}

function remnantFragments(
  remnant: RemnantDefinition,
): readonly DynamicBreakableFragment[] {
  const cached = remnantFragmentCache.get(remnant);
  if (cached) {
    return cached;
  }
  const fragments: DynamicBreakableFragment[] = [];
  {
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
        clusterId: remnant.clusterId,
        clusterMemberId: remnant.parentId,
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
  remnantFragmentCache.set(remnant, fragments);
  return fragments;
}

export function buildBatches(
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
