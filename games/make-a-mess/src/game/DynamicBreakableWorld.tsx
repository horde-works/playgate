"use client";

import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
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
import { getPieceMaterial } from "./materialTextures";

const UNIT_BOX = new BoxGeometry(1, 1, 1);

type DynamicBreakableKind = "piece" | "shard" | "remnant";

export interface BreakableRenderBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

interface DynamicBreakableFragment {
  readonly sourceId: string;
  readonly kind: DynamicBreakableKind;
  readonly material: BreakableMaterial;
  readonly litGlass: boolean;
  readonly color: string;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly fallbackPosition: readonly [number, number, number];
  readonly fallbackQuaternion: readonly [number, number, number, number];
}

interface DynamicBreakableBatch {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly litGlass: boolean;
  readonly fragments: readonly DynamicBreakableFragment[];
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
    for (const box of getPieceRenderBoxes(piece)) {
      fragments.push({
        sourceId: piece.id,
        kind: "piece",
        material: piece.material,
        litGlass:
          piece.material === "glass" && piece.color === litWindowColor,
        color: piece.color,
        center: box.center,
        size: box.size,
        fallbackPosition: piece.position,
        fallbackQuaternion,
      });
    }
  }

  for (const shard of shards) {
    const boxes =
      shard.boxes && shard.boxes.length > 0
        ? shard.boxes
        : [{ center: [0, 0, 0] as const, size: shard.size }];
    for (const box of boxes) {
      fragments.push({
        sourceId: shard.id,
        kind: "shard",
        material: shard.material,
        litGlass:
          shard.material === "glass" && shard.color === litWindowColor,
        color: shard.color,
        center: box.center,
        size: box.size,
        fallbackPosition: shard.position,
        fallbackQuaternion: shard.quaternion,
      });
    }
  }

  for (const remnant of remnants) {
    const boxes =
      remnant.boxes && remnant.boxes.length > 0
        ? remnant.boxes
        : [{ center: [0, 0, 0] as const, size: remnant.size }];
    for (const box of boxes) {
      fragments.push({
        sourceId: remnant.id,
        kind: "remnant",
        material: remnant.material,
        litGlass:
          remnant.material === "glass" &&
          remnant.color === litWindowColor,
        color: remnant.color,
        center: box.center,
        size: box.size,
        fallbackPosition: remnant.position,
        fallbackQuaternion: remnant.quaternion,
      });
    }
  }

  return fragments;
}

function buildBatches(
  fragments: readonly DynamicBreakableFragment[],
): readonly DynamicBreakableBatch[] {
  const batches = new Map<string, DynamicBreakableFragment[]>();

  for (const fragment of fragments) {
    const key = `${fragment.material}:${Number(fragment.litGlass)}`;
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
    litGlass: batchFragments[0].litGlass,
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
  dummy.scale.set(fragment.size[0], fragment.size[1], fragment.size[2]);
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
  const material = useMemo(
    () =>
      getPieceMaterial(
        batch.material,
        batch.litGlass ? litWindowColor : "#ffffff",
      ),
    [batch.litGlass, batch.material],
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
        color.set(fragment.litGlass ? "#ffffff" : fragment.color),
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
      args={[UNIT_BOX, material, batch.fragments.length]}
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
  const batches = useMemo(
    () => buildBatches(sourceFragments(pieces, shards, remnants)),
    [pieces, remnants, shards],
  );

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
