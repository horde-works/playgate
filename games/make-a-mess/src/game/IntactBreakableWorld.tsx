"use client";

import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  StaticDrawUsage,
} from "three";
import {
  materialRuntimeProfiles,
  type BreakableMaterial,
  type BreakablePieceDefinition,
} from "./destructionScene";
import {
  getPieceMaterial,
  getSilicateJointMaterial,
  isGlassMaterial,
  pieceMaterialBaseColor,
} from "./materialTextures";
import { materialAnchor } from "./materialAppearance";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointBandKey,
  silicateJointTint,
} from "./silicateJoints";
import {
  buildStaticColliderMeshes,
  type StaticColliderMeshDefinition,
} from "./staticColliders";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
// Both authored maps fit inside one 256 m render cell. Their box geometry is
// cheap; splitting it into tiny cells cost hundreds of draw calls (and the
// same again in the shadow pass) while barely reducing visible triangles.
// Physics and blast queries keep their own spatial index, so render batching
// does not make structural work global.
const WORLD_CHUNK_SIZE = 256;

interface IntactInstanceBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly castShadow: boolean;
  readonly pieces: readonly BreakablePieceDefinition[];
}

interface SilicateJointBatch {
  readonly id: string;
  readonly normalizedBand: number;
  readonly pieces: readonly BreakablePieceDefinition[];
}

function worldChunkKey(piece: BreakablePieceDefinition): string {
  return `${Math.floor(
    (piece.position[0] + WORLD_CHUNK_SIZE / 2) / WORLD_CHUNK_SIZE,
  )}:${Math.floor(
    (piece.position[2] + WORLD_CHUNK_SIZE / 2) / WORLD_CHUNK_SIZE,
  )}`;
}

function buildInstanceBatches(
  pieces: readonly BreakablePieceDefinition[],
): readonly IntactInstanceBatch[] {
  const batches = new Map<string, BreakablePieceDefinition[]>();
  for (const piece of pieces) {
    const materialColor = pieceMaterialBaseColor(
      piece.material,
      piece.color,
    );
    const castShadow =
      !isGlassMaterial(piece.material) && piece.shape !== "groundTile";
    const id = `${worldChunkKey(piece)}:${piece.material}:${materialColor}:${Number(
      castShadow,
    )}`;
    const batch = batches.get(id);
    if (batch) {
      batch.push(piece);
    } else {
      batches.set(id, [piece]);
    }
  }

  return [...batches].map(([id, batchPieces]) => ({
    id,
    material: batchPieces[0].material,
    materialColor: pieceMaterialBaseColor(
      batchPieces[0].material,
      batchPieces[0].color,
    ),
    castShadow:
      !isGlassMaterial(batchPieces[0].material) &&
      batchPieces[0].shape !== "groundTile",
    pieces: batchPieces,
  }));
}

function buildSilicateJointBatches(
  pieces: readonly BreakablePieceDefinition[],
): readonly SilicateJointBatch[] {
  const batches = new Map<string, BreakablePieceDefinition[]>();
  for (const piece of pieces) {
    if (!hasSilicateJoints(piece.id, piece.material)) {
      continue;
    }
    const bandKey = silicateJointBandKey(piece.size);
    const id = `${worldChunkKey(piece)}:${bandKey}`;
    const batch = batches.get(id);
    if (batch) {
      batch.push(piece);
    } else {
      batches.set(id, [piece]);
    }
  }

  return [...batches].map(([id, batchPieces]) => ({
    id,
    normalizedBand: silicateJointBand(batchPieces[0].size),
    pieces: batchPieces,
  }));
}

const IntactPieceBatch = memo(function IntactPieceBatch({
  batch,
}: {
  batch: IntactInstanceBatch;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const next = UNIT_BOX.clone();
    const anchors = new Float32Array(batch.pieces.length * 3);
    batch.pieces.forEach((piece, index) => {
      anchors.set(materialAnchor(piece.position), index * 3);
    });
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(anchors, 3, false),
    );
    return next;
  }, [batch.pieces]);
  const material = useMemo(
    () =>
      getPieceMaterial(
        batch.material,
        batch.materialColor,
      ),
    [batch.material, batch.materialColor],
  );
  const instanceIds = useMemo(
    () => batch.pieces.map((piece) => piece.id),
    [batch.pieces],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const transform = new Object3D();
    const color = new Color();
    batch.pieces.forEach((piece, index) => {
      transform.position.set(...piece.position);
      transform.rotation.set(
        piece.rotation?.[0] ?? 0,
        piece.rotation?.[1] ?? 0,
        piece.rotation?.[2] ?? 0,
      );
      transform.scale.set(...piece.size);
      transform.updateMatrix();
      current.setMatrixAt(index, transform.matrix);
      current.setColorAt(
        index,
        color.set(batch.materialColor === "#ffffff" ? piece.color : "#ffffff"),
      );
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingBox();
    current.computeBoundingSphere();
  }, [batch]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, batch.pieces.length]}
      castShadow={batch.castShadow}
      receiveShadow
      userData={{
        breakableInstanceIds: instanceIds,
        breakableMaterial: batch.material,
      }}
    />
  );
});

const SilicateJointBatch = memo(function SilicateJointBatch({
  batch,
}: {
  batch: SilicateJointBatch;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(
    () => getSilicateJointMaterial(batch.normalizedBand),
    [batch.normalizedBand],
  );
  const instanceIds = useMemo(
    () => batch.pieces.map((piece) => piece.id),
    [batch.pieces],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const transform = new Object3D();
    const color = new Color();
    for (let index = 0; index < batch.pieces.length; index += 1) {
      const piece = batch.pieces[index];
      transform.position.set(...piece.position);
      transform.rotation.set(
        piece.rotation?.[0] ?? 0,
        piece.rotation?.[1] ?? 0,
        piece.rotation?.[2] ?? 0,
      );
      transform.scale.set(
        piece.size[0] + SILICATE_JOINT_EXPANSION,
        piece.size[1] + SILICATE_JOINT_EXPANSION,
        piece.size[2] + SILICATE_JOINT_EXPANSION,
      );
      transform.updateMatrix();
      current.setMatrixAt(index, transform.matrix);
      current.setColorAt(index, color.set(silicateJointTint(piece.color)));
    }
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingBox();
    current.computeBoundingSphere();
  }, [batch]);

  return (
    <instancedMesh
      ref={mesh}
      args={[UNIT_BOX, material, batch.pieces.length]}
      castShadow={false}
      receiveShadow
      renderOrder={1}
      userData={{
        breakableInstanceIds: instanceIds,
      }}
    />
  );
});

const StaticColliderMesh = memo(function StaticColliderMesh({
  mesh,
}: {
  mesh: StaticColliderMeshDefinition;
}) {
  const args = useMemo(
    () => [mesh.vertices, mesh.indices] as [Float32Array, Uint32Array],
    [mesh],
  );
  return (
    <TrimeshCollider
      args={args}
      friction={mesh.material === "wood" ? 0.66 : 0.84}
      restitution={materialRuntimeProfiles[mesh.material].restitution}
    />
  );
});

const IntactPieceColliders = memo(function IntactPieceColliders({
  pieces,
}: {
  pieces: readonly BreakablePieceDefinition[];
}) {
  const meshes = useMemo(
    () => buildStaticColliderMeshes(pieces),
    [pieces],
  );

  return (
    <RigidBody type="fixed" colliders={false}>
      {meshes.map((mesh) => (
        <StaticColliderMesh key={mesh.id} mesh={mesh} />
      ))}
    </RigidBody>
  );
});

export const IntactBreakableWorld = memo(function IntactBreakableWorld({
  pieces,
}: {
  pieces: readonly BreakablePieceDefinition[];
}) {
  const instanceBatches = useMemo(
    () => buildInstanceBatches(pieces),
    [pieces],
  );
  const jointBatches = useMemo(
    () => buildSilicateJointBatches(pieces),
    [pieces],
  );

  return (
    <>
      {instanceBatches.map((batch) => (
        <IntactPieceBatch key={batch.id} batch={batch} />
      ))}
      {jointBatches.map((batch) => (
        <SilicateJointBatch key={`joint:${batch.id}`} batch={batch} />
      ))}
      <IntactPieceColliders pieces={pieces} />
    </>
  );
});
