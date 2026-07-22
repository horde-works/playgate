"use client";

import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
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
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import {
  litWindowColor,
  type BreakableMaterial,
  type BreakablePieceDefinition,
} from "./destructionScene";
import type {
  RemnantDefinition,
  ShardDefinition,
} from "./destructionRuntime";
import {
  getPieceMaterial,
  pieceMaterialBaseColor,
} from "./materialTextures";
import { materialAnchor } from "./materialAppearance";
import {
  SILICATE_JOINT_EXPANSION,
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "./silicateJoints";
import { computeBoxFaceMasks } from "./boxFaceMasks";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 20, 1);

type DynamicBreakableKind = "piece" | "shard" | "remnant";

export interface BreakableRenderBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

interface DynamicBreakableFragment {
  readonly sourceId: string;
  readonly kind: DynamicBreakableKind;
  readonly geometryKind: "box" | "cylinder";
  readonly material: BreakableMaterial;
  readonly materialColor: string;
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
}

interface DynamicBreakableBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly materialColor: string;
  readonly geometryKind: "box" | "cylinder";
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
  return material === "glass" && color === litWindowColor
    ? extinguishedGlass
    : color;
}

export function getPieceRenderBoxes(
  piece: BreakablePieceDefinition,
): readonly BreakableRenderBox[] {
  if (piece.shape !== "cinderBlock") {
    return [{ center: [0, 0, 0], size: piece.size }];
  }

  const [width, height, depth] = piece.size;
  return [
    {
      center: [0, height * 0.36, 0],
      size: [width, height * 0.28, depth],
    },
    {
      center: [0, -height * 0.36, 0],
      size: [width, height * 0.28, depth],
    },
    ...[-0.4, 0, 0.4].map(
      (offset): BreakableRenderBox => ({
        center: [width * offset, 0, 0],
        size: [width * 0.18, height * 0.48, depth],
      }),
    ),
  ];
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
    const boxes = getPieceRenderBoxes(piece);
    const faceMasks = computeBoxFaceMasks(boxes);
    const pieceColor = quenchedColor(piece.material, piece.color);
    const geometryKind = piece.shape === "cylinder" ? "cylinder" as const : "box" as const;
    boxes.forEach((box, boxIndex) => {
      fragments.push({
        sourceId: piece.id,
        kind: "piece",
        geometryKind,
        material: piece.material,
        materialColor: pieceMaterialBaseColor(piece.material, pieceColor),
        color: pieceColor,
        center: box.center,
        size: box.size,
        sizeExpansion,
        faceMaskPositive:
          geometryKind === "cylinder"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          geometryKind === "cylinder"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: piece.position,
        fallbackQuaternion,
      });
    });
  }

  for (const shard of shards) {
    const boxes =
      shard.boxes && shard.boxes.length > 0
        ? shard.boxes
        : [{ center: [0, 0, 0] as const, size: shard.size }];
    const faceMasks = computeBoxFaceMasks(boxes);
    const shardColor = quenchedColor(shard.material, shard.color);
    const shardGeometry = shard.shape === "cylinder" ? "cylinder" as const : "box" as const;
    boxes.forEach((box, boxIndex) => {
      fragments.push({
        sourceId: shard.id,
        kind: "shard",
        geometryKind: shardGeometry,
        material: shard.material,
        materialColor: pieceMaterialBaseColor(shard.material, shardColor),
        color: shardColor,
        center: box.center,
        size: box.size,
        sizeExpansion: 0,
        faceMaskPositive:
          shardGeometry === "cylinder"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          shardGeometry === "cylinder"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: shard.position,
        fallbackQuaternion: shard.quaternion,
      });
    });
  }

  for (const remnant of remnants) {
    const boxes =
      remnant.boxes && remnant.boxes.length > 0
        ? remnant.boxes
        : [{ center: [0, 0, 0] as const, size: remnant.size }];
    const faceMasks = computeBoxFaceMasks(boxes);
    const remnantColor = quenchedColor(remnant.material, remnant.color);
    const remnantGeometry = remnant.shape === "cylinder" ? "cylinder" as const : "box" as const;
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
        color: remnantColor,
        center: box.center,
        size: box.size,
        sizeExpansion: 0,
        faceMaskPositive:
          remnantGeometry === "cylinder"
            ? [0, faceMasks[boxIndex].positive[1], 0]
            : faceMasks[boxIndex].positive,
        faceMaskNegative:
          remnantGeometry === "cylinder"
            ? [0, faceMasks[boxIndex].negative[1], 0]
            : faceMasks[boxIndex].negative,
        fallbackPosition: remnant.position,
        fallbackQuaternion: remnant.quaternion,
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
    const key = `${fragment.material}:${fragment.materialColor}:${fragment.geometryKind}`;
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
    geometryKind: batchFragments[0].geometryKind,
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

const DynamicBreakableBatch = memo(function DynamicBreakableBatch({
  batch,
  bodies,
}: {
  batch: DynamicBreakableBatch;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const next = (
      batch.geometryKind === "cylinder" ? UNIT_CYLINDER : UNIT_BOX
    ).clone();
    const anchors = new Float32Array(batch.fragments.length * 3);
    batch.fragments.forEach((fragment, index) => {
      anchors.set(
        materialAnchor(fragment.fallbackPosition, fragment.center),
        index * 3,
      );
    });
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(anchors, 3, false),
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

    if (batch.fragments.some(fragmentHasJoints)) {
      const bands = new Float32Array(batch.fragments.length);
      const tints = new Float32Array(batch.fragments.length * 3);
      const tint = new Color();
      batch.fragments.forEach((fragment, index) => {
        if (!fragmentHasJoints(fragment)) {
          return;
        }
        bands[index] = silicateJointBand(fragment.size);
        tint.set(silicateJointTint(fragment.color));
        tints[index * 3] = tint.r;
        tints[index * 3 + 1] = tint.g;
        tints[index * 3 + 2] = tint.b;
      });
      next.setAttribute(
        "silicateJointBand",
        new InstancedBufferAttribute(bands, 1, false),
      );
      next.setAttribute(
        "silicateJointTint",
        new InstancedBufferAttribute(tints, 3, false),
      );
    }
    return next;
  }, [batch]);
  const material = useMemo(
    () =>
      getPieceMaterial(
        batch.material,
        batch.materialColor,
      ),
    [batch.material, batch.materialColor],
  );
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

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    const color = new Color();
    batch.fragments.forEach((fragment, index) => {
      setFragmentMatrix(
        dummy,
        fragment,
        bodies?.current?.get(fragment.sourceId),
        localCenter,
        rotation,
      );
      current.setMatrixAt(index, dummy.matrix);
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
  }, [batch.fragments, bodies, dummy, localCenter, rotation]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    let changed = false;
    batch.fragments.forEach((fragment, index) => {
      const body = bodies?.current?.get(fragment.sourceId);
      if (!body || body.isSleeping()) {
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
      changed = true;
    });

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
}: {
  pieces: readonly BreakablePieceDefinition[];
  shards: readonly ShardDefinition[];
  remnants: readonly RemnantDefinition[];
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
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
        />
      ))}
    </>
  );
});
