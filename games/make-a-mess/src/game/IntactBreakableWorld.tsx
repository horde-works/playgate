"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BoxGeometry,
  Color,
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
  isGlassMaterial,
  pieceMaterialBaseColor,
} from "./materialTextures";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const WORLD_CHUNK_SIZE = 18;

interface IntactInstanceBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly castShadow: boolean;
  readonly pieces: readonly BreakablePieceDefinition[];
}

function worldChunkKey(piece: BreakablePieceDefinition): string {
  return `${Math.floor(piece.position[0] / WORLD_CHUNK_SIZE)}:${Math.floor(
    piece.position[2] / WORLD_CHUNK_SIZE,
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

const IntactPieceBatch = memo(function IntactPieceBatch({
  batch,
}: {
  batch: IntactInstanceBatch;
}) {
  const mesh = useRef<InstancedMesh>(null);
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
      args={[UNIT_BOX, material, batch.pieces.length]}
      castShadow={batch.castShadow}
      receiveShadow
      userData={{
        breakableInstanceIds: instanceIds,
        breakableMaterial: batch.material,
      }}
    />
  );
});

const IntactPieceColliders = memo(function IntactPieceColliders({
  pieces,
}: {
  pieces: readonly BreakablePieceDefinition[];
}) {
  const chunks = useMemo(() => {
    const groups = new Map<string, BreakablePieceDefinition[]>();
    for (const piece of pieces) {
      const key = worldChunkKey(piece);
      const group = groups.get(key);
      if (group) {
        group.push(piece);
      } else {
        groups.set(key, [piece]);
      }
    }
    return [...groups];
  }, [pieces]);

  return (
    <>
      {chunks.map(([chunkId, chunkPieces]) => (
        <RigidBody
          key={`static:${chunkId}`}
          type="fixed"
          colliders={false}
        >
          {chunkPieces.map((piece) => (
            <CuboidCollider
              key={piece.id}
              args={[
                piece.size[0] / 2,
                piece.size[1] / 2,
                piece.size[2] / 2,
              ]}
              position={[...piece.position]}
              rotation={piece.rotation ? [...piece.rotation] : undefined}
              friction={piece.material === "wood" ? 0.66 : 0.84}
              restitution={
                materialRuntimeProfiles[piece.material].restitution
              }
            />
          ))}
        </RigidBody>
      ))}
    </>
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

  return (
    <>
      {instanceBatches.map((batch) => (
        <IntactPieceBatch key={batch.id} batch={batch} />
      ))}
      <IntactPieceColliders pieces={pieces} />
    </>
  );
});
