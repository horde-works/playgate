"use client";

import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  Shape,
  SphereGeometry,
  StaticDrawUsage,
} from "three";
import {
  materialRuntimeProfiles,
  type BreakablePieceDefinition,
} from "./destructionScene";
import { getPieceMaterial } from "./materialTextures";
import { materialAnchorWithWeathering } from "./materialAppearance";
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
import type { MutablePieceVisualState } from "./sceneDynamics";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
// Unit-diameter, unit-height cylinder along Y; instance scale sets the
// diameters (x/z) and length (y), instance rotation lays it down.
const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_SPHERE = new SphereGeometry(0.5, 48, 32);
const TRIANGULAR_SHEET_PROFILE = new Shape()
  .moveTo(-0.5, -1 / 3)
  .lineTo(0.5, -1 / 3)
  .lineTo(0, 2 / 3)
  .closePath();
const UNIT_TRIANGULAR_SHEET = new ExtrudeGeometry(
  TRIANGULAR_SHEET_PROFILE,
  { depth: 1, steps: 1, bevelEnabled: false },
).translate(0, 0, -0.5);
const HEXAGONAL_SHEET_PROFILE = new Shape()
  .moveTo(0, -0.5)
  .lineTo(0.5, -0.22)
  .lineTo(0.5, 0.22)
  .lineTo(0, 0.5)
  .lineTo(-0.5, 0.22)
  .lineTo(-0.5, -0.22)
  .closePath();
const UNIT_HEXAGONAL_SHEET = new ExtrudeGeometry(
  HEXAGONAL_SHEET_PROFILE,
  { depth: 1, steps: 1, bevelEnabled: false },
).translate(0, 0, -0.5);
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
const EMPTY_MUTABLE_PIECE_IDS: ReadonlySet<string> = new Set();

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
  state?: MutablePieceVisualState,
): void {
  const expansion = pieceRenderExpansion(piece);
  transform.position.set(...(state?.position ?? piece.position));
  const rotation = state?.rotation ?? piece.rotation;
  transform.rotation.set(
    rotation?.[0] ?? 0,
    rotation?.[1] ?? 0,
    rotation?.[2] ?? 0,
  );
  transform.scale.set(
    (piece.size[0] + expansion) * (state?.scale ?? 1),
    (piece.size[1] + expansion) * (state?.scale ?? 1),
    (piece.size[2] + expansion) * (state?.scale ?? 1),
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
  mutable,
  mutablePieceStates,
}: {
  batch: IntactInstanceBatch;
  hiddenPieceIds: ReadonlySet<string>;
  lighting: WorldLightingBake;
  mutable: boolean;
  mutablePieceStates: MutableRefObject<
    ReadonlyMap<string, MutablePieceVisualState>
  >;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const appliedHidden = useRef(new Set<string>());
  const appliedMutable = useRef(
    new Map<
      string,
      { readonly hidden: boolean; readonly state?: MutablePieceVisualState }
    >(),
  );
  const indexById = useMemo(
    () => new Map(batch.pieces.map((piece, index) => [piece.id, index])),
    [batch.pieces],
  );
  const geometry = useMemo(() => {
    const next = (
      batch.geometryKind === "cylinder"
        ? UNIT_CYLINDER
        : batch.geometryKind === "sphere"
          ? UNIT_SPHERE
        : batch.geometryKind === "triangularSheet"
          ? UNIT_TRIANGULAR_SHEET
          : batch.geometryKind === "hexagonalSheet"
            ? UNIT_HEXAGONAL_SHEET
            : UNIT_BOX
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
      // Organic weathering receptivity (0 = pristine): the shader turns it
      // into moss on up-faces and mould near the ground.
      anchors.set(
        materialAnchorWithWeathering(
          piece.position,
          [0, 0, 0],
          piece.weathering,
        ),
        index * 4,
      );
      if (piece.shape === "groundTile") {
        facePos.fill(0, index * 3, index * 3 + 3);
        faceNeg.fill(0, index * 3, index * 3 + 3);
      } else if (piece.shape === "cylinder") {
        // Curved flanks must not get box-edge bevels — only the end caps.
        facePos[index * 3] = 0;
        facePos[index * 3 + 2] = 0;
        faceNeg[index * 3] = 0;
        faceNeg[index * 3 + 2] = 0;
      } else if (piece.shape === "sphere") {
        // Curved surfaces have no box faces on which the masonry edge shader
        // may draw seams or bevels.
        facePos.fill(0, index * 3, index * 3 + 3);
        faceNeg.fill(0, index * 3, index * 3 + 3);
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
    current.instanceMatrix.setUsage(
      mutable ? DynamicDrawUsage : StaticDrawUsage,
    );
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
    appliedHidden.current = new Set();
    appliedMutable.current.clear();
  }, [batch, groundRenderColors, mutable]);

  // Incremental pass: touch only the instances whose hidden state changed.
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current || mutable) {
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
  }, [batch, hiddenPieceIds, mutable]);

  useFrame(() => {
    const current = mesh.current;
    if (!current || !mutable) {
      return;
    }

    const transform = new Object3D();
    let changed = false;
    current.instanceMatrix.clearUpdateRanges();
    batch.pieces.forEach((piece, index) => {
      const state = mutablePieceStates.current.get(piece.id);
      const hidden = hiddenPieceIds.has(piece.id) || state?.visible === false;
      const previous = appliedMutable.current.get(piece.id);
      if (previous?.hidden === hidden && previous.state === state) {
        return;
      }
      appliedMutable.current.set(piece.id, { hidden, state });
      if (hidden) {
        current.setMatrixAt(index, HIDDEN_MATRIX);
      } else {
        writePieceTransform(transform, piece, state);
        current.setMatrixAt(index, transform.matrix);
      }
      current.instanceMatrix.addUpdateRange(index * 16, 16);
      changed = true;
    });
    if (changed) {
      current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, batch.pieces.length]}
      castShadow={batch.castShadow}
      receiveShadow
      frustumCulled={!mutable}
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
  mutablePieceIds = EMPTY_MUTABLE_PIECE_IDS,
  mutablePieceStates,
}: {
  pieces: readonly BreakablePieceDefinition[];
  hiddenPieceIds: ReadonlySet<string>;
  mutablePieceIds?: ReadonlySet<string>;
  mutablePieceStates?: MutableRefObject<
    ReadonlyMap<string, MutablePieceVisualState>
  >;
}) {
  const emptyMutablePieceStates = useRef<
    ReadonlyMap<string, MutablePieceVisualState>
  >(new Map());
  const resolvedMutablePieceStates =
    mutablePieceStates ?? emptyMutablePieceStates;
  const genericRenderPieces = useMemo(
    () => pieces.filter((piece) => !isProceduralVegetationPiece(piece)),
    [pieces],
  );
  const instanceBatches = useMemo(
    () => [
      ...buildIntactInstanceBatches(
        genericRenderPieces.filter((piece) => !mutablePieceIds.has(piece.id)),
      ).map((batch) => ({
        batch: { ...batch, id: `static:${batch.id}` },
        mutable: false,
      })),
      ...buildIntactInstanceBatches(
        genericRenderPieces.filter((piece) => mutablePieceIds.has(piece.id)),
      ).map((batch) => ({
        batch: { ...batch, id: `mutable:${batch.id}` },
        mutable: true,
      })),
    ],
    [genericRenderPieces, mutablePieceIds],
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
      {instanceBatches.map(({ batch, mutable }) => (
        <IntactPieceBatch
          key={batch.id}
          batch={batch}
          hiddenPieceIds={hiddenPieceIds}
          lighting={lighting}
          mutable={mutable}
          mutablePieceStates={resolvedMutablePieceStates}
        />
      ))}
      <TreeVisuals pieces={pieces} hiddenPieceIds={hiddenPieceIds} />
      <IntactPieceColliders pieces={colliderPieces} />
    </>
  );
});
