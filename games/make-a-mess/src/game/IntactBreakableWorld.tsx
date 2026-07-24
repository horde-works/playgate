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
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  StaticDrawUsage,
} from "three";
import {
  materialRuntimeProfiles,
  type BreakablePieceDefinition,
} from "./destructionScene";
import { getPieceMaterial } from "./materialTextures";
import { materialAnchor } from "./materialAppearance";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "./silicateJoints";
import {
  applyHiddenPieceDiff,
  buildIntactGroundRenderColors,
  buildIntactInstanceBatches,
  type IntactInstanceBatch,
} from "./intactWorldBatching";
import {
  WorldLightingBake,
  writeBakeResult,
} from "./worldLightingBake";
import {
  buildStaticColliderMeshes,
  type StaticColliderMeshDefinition,
} from "./staticColliders";
import { TreeVisuals } from "./TreeVisuals";
import { isProceduralVegetationPiece } from "./treeVisualModel";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
// Unit-diameter, unit-height cylinder along Y; instance scale sets the
// diameters (x/z) and length (y), instance rotation lays it down.
const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);

// Jointed masonry is rendered expanded by the same margin the former joint
// shell used, so the silicate binder keeps closing the authored air gaps
// between blocks. Physics colliders stay on the authored sizes, exactly as
// the (collider-less) shell did before.
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
  transform.rotation.set(
    piece.rotation?.[0] ?? 0,
    piece.rotation?.[1] ?? 0,
    piece.rotation?.[2] ?? 0,
  );
  transform.scale.set(
    piece.size[0] + expansion,
    piece.size[1] + expansion,
    piece.size[2] + expansion,
  );
  transform.updateMatrix();
}

/**
 * One instanced mesh per material batch, built ONCE from the full authored
 * piece list. Breaking, carving or shattering a piece only writes a zero
 * scale into its instance slot (uploaded via updateRanges), so a machine-gun
 * burst no longer re-uploads ten thousand matrices per hit.
 */
const IntactPieceBatch = memo(function IntactPieceBatch({
  batch,
  hiddenPieceIds,
  lighting,
}: {
  batch: IntactInstanceBatch;
  hiddenPieceIds: ReadonlySet<string>;
  lighting: WorldLightingBake;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const appliedHidden = useRef(new Set<string>());
  const indexById = useMemo(
    () => new Map(batch.pieces.map((piece, index) => [piece.id, index])),
    [batch.pieces],
  );
  const geometry = useMemo(() => {
    const next = (
      batch.geometryKind === "cylinder" ? UNIT_CYLINDER : UNIT_BOX
    ).clone();
    // xyz = world anchor, w = organic weathering amount (packed to avoid a
    // separate instanced attribute — WebGL's attribute count is nearly full).
    const anchors = new Float32Array(batch.pieces.length * 4);
    const aoA = new Float32Array(batch.pieces.length * 4).fill(1);
    const aoB = new Float32Array(batch.pieces.length * 4).fill(1);
    const sky = new Float32Array(batch.pieces.length).fill(1);
    // Intact pieces: masonry blocks expose every face (their bevels and
    // edge wear are the desired block look); ground tiles form one flush
    // surface, so their faces are treated as interior — no seam grid.
    const facePos = new Float32Array(batch.pieces.length * 3).fill(1);
    const faceNeg = new Float32Array(batch.pieces.length * 3).fill(1);
    batch.pieces.forEach((piece, index) => {
      anchors.set(materialAnchor(piece.position), index * 4);
      // Organic weathering receptivity (0 = pristine): the shader turns it
      // into moss on up-faces and mould near the ground.
      anchors[index * 4 + 3] = piece.weathering ?? 0;
      if (piece.shape === "groundTile") {
        facePos.fill(0, index * 3, index * 3 + 3);
        faceNeg.fill(0, index * 3, index * 3 + 3);
      } else if (piece.shape === "cylinder") {
        // Curved flanks must not get box-edge bevels — only the end caps.
        facePos[index * 3] = 0;
        facePos[index * 3 + 2] = 0;
        faceNeg[index * 3] = 0;
        faceNeg[index * 3 + 2] = 0;
      }
      const baked = lighting.resultFor(piece.id);
      if (baked) {
        writeBakeResult(baked, index, aoA, aoB, sky);
      }
    });
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(anchors, 4, false),
    );
    next.setAttribute(
      "bakedAoA",
      new InstancedBufferAttribute(aoA, 4, false),
    );
    next.setAttribute(
      "bakedAoB",
      new InstancedBufferAttribute(aoB, 4, false),
    );
    next.setAttribute(
      "bakedSkyExposure",
      new InstancedBufferAttribute(sky, 1, false),
    );
    next.setAttribute(
      "materialFaceMaskPos",
      new InstancedBufferAttribute(facePos, 3, false),
    );
    next.setAttribute(
      "materialFaceMaskNeg",
      new InstancedBufferAttribute(faceNeg, 3, false),
    );

    const bands = new Float32Array(batch.pieces.length);
    const tints = new Float32Array(batch.pieces.length * 3);
    const tint = new Color();
    batch.pieces.forEach((piece, index) => {
      if (piece.landscapeSurface) {
        // Negative bands are otherwise unused. -1 = village earth, -2 =
        // authored city grime. Reusing this attribute stays within WebGL's
        // instancing attribute cap.
        bands[index] = piece.landscapeSurface === "viking-ground" ? -1 : -2;
        return;
      }
      if (hasSilicateJoints(piece.id, piece.material)) {
        bands[index] = silicateJointBand(piece.size);
        tint.set(silicateJointTint(piece.color));
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
  }, [batch, lighting]);

  // The bake writes refreshed neighbour values straight into these
  // attributes when nearby pieces are destroyed.
  useEffect(() => {
    return lighting.registerBatch({
      aoA: geometry.getAttribute("bakedAoA") as InstancedBufferAttribute,
      aoB: geometry.getAttribute("bakedAoB") as InstancedBufferAttribute,
      sky: geometry.getAttribute(
        "bakedSkyExposure",
      ) as InstancedBufferAttribute,
      indexById,
    });
  }, [geometry, indexById, lighting]);
  const material = useMemo(
    () =>
      getPieceMaterial(
        batch.material,
        batch.materialColor,
        batch.textureProfile,
      ),
    [batch.material, batch.materialColor, batch.textureProfile],
  );
  const instanceIds = useMemo(
    () => batch.pieces.map((piece) => piece.id),
    [batch.pieces],
  );
  const groundRenderColors = useMemo(
    () => buildIntactGroundRenderColors(batch.pieces),
    [batch.pieces],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Full write: runs once per batch identity (i.e. once per mount).
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const transform = new Object3D();
    const color = new Color();
    batch.pieces.forEach((piece, index) => {
      writePieceTransform(transform, piece);
      current.setMatrixAt(index, transform.matrix);
      color.set(
        groundRenderColors.get(piece.id)
          ?? (batch.materialColor === "#ffffff" ? piece.color : "#ffffff"),
      );
      current.setColorAt(index, color);
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
    appliedHidden.current = new Set();
  }, [batch, groundRenderColors]);

  // Incremental pass: touch only the instances whose hidden state changed.
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const { hide, restore } = applyHiddenPieceDiff(
      batch.pieces,
      appliedHidden.current,
      hiddenPieceIds,
    );
    if (hide.length === 0 && restore.length === 0) {
      return;
    }

    const transform = new Object3D();
    for (const index of hide) {
      current.setMatrixAt(index, HIDDEN_MATRIX);
      current.instanceMatrix.addUpdateRange(index * 16, 16);
    }
    for (const index of restore) {
      writePieceTransform(transform, batch.pieces[index]);
      current.setMatrixAt(index, transform.matrix);
      current.instanceMatrix.addUpdateRange(index * 16, 16);
    }
    current.instanceMatrix.needsUpdate = true;
  }, [batch, hiddenPieceIds]);

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
  hiddenPieceIds,
}: {
  pieces: readonly BreakablePieceDefinition[];
  hiddenPieceIds: ReadonlySet<string>;
}) {
  const genericRenderPieces = useMemo(
    () => pieces.filter((piece) => !isProceduralVegetationPiece(piece)),
    [pieces],
  );
  const instanceBatches = useMemo(
    () => buildIntactInstanceBatches(genericRenderPieces),
    [genericRenderPieces],
  );
  const lighting = useMemo(() => new WorldLightingBake(pieces), [pieces]);
  const colliderPieces = useMemo(
    () => pieces.filter((piece) => !hiddenPieceIds.has(piece.id)),
    [hiddenPieceIds, pieces],
  );

  // Destroyed pieces stop occluding: clear their cells and re-bake only the
  // neighbourhood, so light falls into craters and breaches.
  useEffect(() => {
    lighting.applyHidden(hiddenPieceIds);
  }, [hiddenPieceIds, lighting]);

  return (
    <>
      {instanceBatches.map((batch) => (
        <IntactPieceBatch
          key={batch.id}
          batch={batch}
          hiddenPieceIds={hiddenPieceIds}
          lighting={lighting}
        />
      ))}
      <TreeVisuals pieces={pieces} hiddenPieceIds={hiddenPieceIds} />
      <IntactPieceColliders pieces={colliderPieces} />
    </>
  );
});
