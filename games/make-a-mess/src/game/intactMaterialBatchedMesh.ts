import {
  BatchedMesh,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type Intersection,
  type MeshStandardMaterial,
  type Raycaster,
} from "three";
import type { IntactMaterialBatch } from "./intactWorldBatching.ts";
import {
  buildIntactGroundRenderColors,
  pieceGeometryKind,
} from "./intactWorldBatching.ts";
import {
  CYLINDER_LOD_STEPS,
  createIntactPieceGeometry,
  cylinderDistanceLodSegments,
  cylinderLodGeometry,
  cylinderLodSegments,
  intactGeometryBudget,
  intactGeometryKey,
  isSharedIntactGeometry,
  prepareGeometryForBatchedMesh,
  type CylinderLodSegments,
} from "./intactPieceGeometry.ts";
import { createIntactPieceAttributeTexture } from "./intactPieceAttributeTexture.ts";
import {
  bindPieceAttrTexture,
  cloneWithMaterialSpace,
  getPieceMaterial,
  pieceMaterialIsTransparent,
} from "./materialTextures.ts";
import type { WorldLightingBake } from "./worldLightingBake.ts";
import { hasSilicateJoints, SILICATE_JOINT_EXPANSION } from "./silicateJoints.ts";
import type { BreakablePieceDefinition } from "./destructionScene.ts";

type BatchedIntersection = Intersection & { batchId?: number };

export interface IntactCylinderLod {
  readonly instanceId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizeFloor: CylinderLodSegments;
  current: CylinderLodSegments;
}

export interface IntactBatchedMeshBundle {
  readonly mesh: BatchedMesh;
  readonly attributes: ReturnType<typeof createIntactPieceAttributeTexture>;
  readonly material: MeshStandardMaterial;
  readonly cylinderLods: readonly IntactCylinderLod[];
  readonly cylinderGeometryIds: Record<CylinderLodSegments, number> | null;
  readonly lodCamera: Vector3;
}

function pieceRenderExpansion(piece: BreakablePieceDefinition): number {
  return hasSilicateJoints(piece.id, piece.material)
    ? SILICATE_JOINT_EXPANSION
    : 0;
}

function writePieceTransform(
  transform: Object3D,
  piece: BreakablePieceDefinition,
): void {
  const expansion = pieceRenderExpansion(piece);
  transform.position.set(...piece.position);
  const rotation = piece.rotation;
  transform.rotation.set(
    rotation?.[0] ?? 0,
    rotation?.[1] ?? 0,
    rotation?.[2] ?? 0,
  );
  transform.scale.set(
    (piece.size[0] + expansion),
    (piece.size[1] + expansion),
    (piece.size[2] + expansion),
  );
  transform.updateMatrix();
}

function collectPreparedBatchGeometries(
  batch: IntactMaterialBatch,
): Map<string, BufferGeometry> {
  const unique = new Map<string, BufferGeometry>();
  let hasCylinder = false;
  for (const piece of batch.pieces) {
    if (pieceGeometryKind(piece) === "cylinder") hasCylinder = true;
    const key = intactGeometryKey(piece);
    if (!unique.has(key)) unique.set(key, createIntactPieceGeometry(piece));
  }
  if (hasCylinder) {
    for (const segments of CYLINDER_LOD_STEPS) {
      const key = `cylinder:${segments}`;
      if (!unique.has(key)) unique.set(key, cylinderLodGeometry(segments));
    }
  }
  const vertexColors = batch.shadingKind === "surface" && batch.vertexColors;
  for (const [key, geometry] of unique) {
    unique.set(
      key,
      prepareGeometryForBatchedMesh(geometry, { vertexColors }),
    );
  }
  return unique;
}

/**
 * Geometry-only validation for tests: proves a material batch can enter
 * BatchedMesh without touching textured piece materials.
 */
export function validateIntactMaterialBatchGeometries(
  batch: IntactMaterialBatch,
): number {
  const unique = collectPreparedBatchGeometries(batch);
  const geometries = [...unique.values()];
  const budget = intactGeometryBudget(geometries);
  const material = new MeshStandardMaterial({ color: 0xffffff });
  const mesh = new BatchedMesh(
    Math.max(batch.pieces.length, 1),
    Math.max(budget.vertexCount, 1),
    Math.max(budget.indexCount, 3),
    material,
  );
  let geometryCount = 0;
  for (const geometry of unique.values()) {
    mesh.addGeometry(geometry);
    geometryCount += 1;
    if (!isSharedIntactGeometry(geometry)) geometry.dispose();
  }
  material.dispose();
  mesh.dispose();
  return geometryCount;
}

export function createIntactMaterialBatchedMesh(
  batch: IntactMaterialBatch,
  lighting: WorldLightingBake,
): IntactBatchedMeshBundle {
  const unique = collectPreparedBatchGeometries(batch);
  const hasCylinder = batch.pieces.some(
    (piece) => pieceGeometryKind(piece) === "cylinder",
  );
  const geometries = [...unique.values()];
  const budget = intactGeometryBudget(geometries);
  const base = getPieceMaterial(
    batch.material,
    batch.materialColor,
    batch.textureProfile,
  );
  const material = cloneWithMaterialSpace(
    base,
    batch.shadingKind === "surface",
  );
  if (batch.shadingKind === "surface") {
    material.vertexColors = batch.vertexColors;
    if (batch.doubleSided) material.side = DoubleSide;
  }
  const attributes = createIntactPieceAttributeTexture(batch.pieces.length);
  material.userData.pieceAttrTexture = attributes.texture;
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.call(material, shader, renderer);
    shader.uniforms.uPieceAttrTexture = { value: attributes.texture };
  };
  const mesh = new BatchedMesh(
    batch.pieces.length,
    Math.max(budget.vertexCount, 1),
    Math.max(budget.indexCount, 3),
    material,
  );
  mesh.sortObjects = pieceMaterialIsTransparent(
    batch.material,
    batch.materialColor,
  );
  mesh.perObjectFrustumCulled = true;
  mesh.castShadow = batch.castShadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  const geometryIdByKey = new Map<string, number>();
  for (const [key, geometry] of unique) {
    geometryIdByKey.set(key, mesh.addGeometry(geometry));
    if (!isSharedIntactGeometry(geometry)) geometry.dispose();
  }
  const transform = new Object3D();
  const color = new Color();
  const groundRenderColors = buildIntactGroundRenderColors(batch.pieces);
  const instanceIds: string[] = [];
  const cylinderLods: IntactCylinderLod[] = [];
  const cylinderGeometryIds = hasCylinder
    ? {
      8: geometryIdByKey.get("cylinder:8")!,
      12: geometryIdByKey.get("cylinder:12")!,
      20: geometryIdByKey.get("cylinder:20")!,
    }
    : null;
  batch.pieces.forEach((piece, index) => {
    const geometryId = geometryIdByKey.get(intactGeometryKey(piece));
    if (geometryId === undefined) {
      throw new Error(`Missing batched geometry for ${piece.id}`);
    }
    const instanceId = mesh.addInstance(geometryId);
    if (instanceId !== index) {
      throw new Error(
        `Batched instance id ${instanceId} drifted from piece index ${index}`,
      );
    }
    writePieceTransform(transform, piece);
    mesh.setMatrixAt(instanceId, transform.matrix);
    color.set(
      groundRenderColors.get(piece.id)
        ?? (batch.materialColor === "#ffffff" ? piece.color : "#ffffff"),
    );
    mesh.setColorAt(instanceId, color);
    attributes.writePiece(index, piece);
    const baked = lighting.resultFor(piece.id);
    if (baked) attributes.writeBake(index, baked);
    instanceIds.push(piece.id);
    if (pieceGeometryKind(piece) === "cylinder") {
      const sizeFloor = cylinderLodSegments(piece);
      cylinderLods.push({
        instanceId,
        x: piece.position[0],
        y: piece.position[1],
        z: piece.position[2],
        sizeFloor,
        current: sizeFloor,
      });
    }
  });
  attributes.flush();
  material.userData.pieceAttrTexture = attributes.texture;
  const batchedOnBeforeRender = mesh.onBeforeRender.bind(mesh);
  mesh.onBeforeRender = (renderer, scene, camera, geometry, objectMaterial, group) => {
    batchedOnBeforeRender(renderer, scene, camera, geometry, objectMaterial, group);
    bindPieceAttrTexture(material, attributes.texture);
  };
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  mesh.userData = {
    breakableInstanceIds: instanceIds,
    breakableMaterial: batch.material,
    pieceAttrTexture: attributes.texture,
  };
  const originalRaycast = mesh.raycast.bind(mesh);
  mesh.raycast = (raycaster: Raycaster, intersects: Intersection[]) => {
    const start = intersects.length;
    originalRaycast(raycaster, intersects);
    for (let index = start; index < intersects.length; index += 1) {
      const hit = intersects[index] as BatchedIntersection;
      if (hit.instanceId === undefined && hit.batchId !== undefined) {
        hit.instanceId = hit.batchId;
      }
    }
  };
  return {
    mesh,
    attributes,
    material,
    cylinderLods,
    cylinderGeometryIds,
    lodCamera: new Vector3(Number.POSITIVE_INFINITY, 0, 0),
  };
}

const CYLINDER_LOD_MOVE_EPS_SQ = 2.25;

export function updateIntactCylinderLods(
  bundle: IntactBatchedMeshBundle,
  cameraPosition: Vector3,
): void {
  const ids = bundle.cylinderGeometryIds;
  if (!ids || bundle.cylinderLods.length === 0) return;
  if (bundle.lodCamera.distanceToSquared(cameraPosition) < CYLINDER_LOD_MOVE_EPS_SQ) {
    return;
  }
  bundle.lodCamera.copy(cameraPosition);
  for (const lod of bundle.cylinderLods) {
    const dx = lod.x - cameraPosition.x;
    const dy = lod.y - cameraPosition.y;
    const dz = lod.z - cameraPosition.z;
    const next = cylinderDistanceLodSegments(
      lod.sizeFloor,
      Math.sqrt(dx * dx + dy * dy + dz * dz),
      lod.current,
    );
    if (next === lod.current) continue;
    lod.current = next;
    bundle.mesh.setGeometryIdAt(lod.instanceId, ids[next]);
  }
}

export function disposeIntactBatchedMesh(bundle: IntactBatchedMeshBundle): void {
  bundle.attributes.dispose();
  bundle.material.dispose();
  bundle.mesh.dispose();
}
