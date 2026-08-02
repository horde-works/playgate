"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  Group,
  Object3D,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import {
  DEMOLITION_CHARGE_RANGE,
  MAX_DEMOLITION_CHARGES,
  demolitionDetonationDelay,
} from "./demolitionCharge";

const SCREEN_CENTER = new Vector2(0, 0);
const SURFACE_AXIS = new Vector3(0, 0, 1);
const CHARGE_PICK_RADIUS = 0.3;

interface AnchoredCharge {
  readonly id: number;
  readonly anchor: Object3D;
  readonly localPosition: Vector3;
  readonly localQuaternion: Quaternion;
  readonly worldPosition: Vector3;
  readonly worldQuaternion: Quaternion;
}

interface PlacementPreview {
  readonly anchor: Object3D;
  readonly localPosition: Vector3;
  readonly localQuaternion: Quaternion;
  readonly worldPosition: Vector3;
  readonly worldQuaternion: Quaternion;
  readonly removeId: number | null;
  readonly blocked: boolean;
}

export interface DemolitionChargeRuntime {
  placeOrRemove: () => void;
  detonateAll: () => void;
  clear: () => void;
}

function ChargeBody({
  preview = false,
  danger = false,
}: {
  preview?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <mesh castShadow={!preview}>
        <boxGeometry args={[0.48, 0.29, 0.085]} />
        <meshStandardMaterial
          color={preview ? (danger ? "#ff3d2e" : "#ffb23f") : "#302c24"}
          emissive={preview ? (danger ? "#ff1708" : "#ff7a18") : "#2c1204"}
          emissiveIntensity={preview ? 0.7 : 0.18}
          metalness={0.32}
          roughness={0.68}
          transparent={preview}
          opacity={preview ? 0.5 : 1}
          depthWrite={!preview}
        />
      </mesh>
      {[-0.135, 0.135].map((x) => (
        <mesh key={x} position={[x, 0, 0.048]}>
          <boxGeometry args={[0.035, 0.305, 0.018]} />
          <meshStandardMaterial
            color={preview ? (danger ? "#ff8a72" : "#ffe08a") : "#d6a329"}
            emissive={preview ? (danger ? "#ff1909" : "#ff9e22") : "#4a2600"}
            emissiveIntensity={preview ? 0.6 : 0.2}
            metalness={0.55}
            roughness={0.42}
            transparent={preview}
            opacity={preview ? 0.62 : 1}
            depthWrite={!preview}
          />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.056]}>
        <circleGeometry args={[0.027, 14]} />
        <meshBasicMaterial
          color={preview ? (danger ? "#ffffff" : "#fff4b0") : "#ff3b16"}
          toneMapped={false}
          transparent={preview}
          opacity={preview ? 0.8 : 1}
          depthWrite={!preview}
        />
      </mesh>
    </>
  );
}

function PlacedCharge({ charge }: { charge: AnchoredCharge }) {
  const group = useRef<Group>(null);

  useFrame(() => {
    const visual = group.current;
    if (!visual) return;
    if (charge.anchor.parent) {
      charge.anchor.updateWorldMatrix(true, false);
      charge.worldPosition.copy(charge.localPosition);
      charge.anchor.localToWorld(charge.worldPosition);
      charge.anchor.getWorldQuaternion(charge.worldQuaternion);
      charge.worldQuaternion.multiply(charge.localQuaternion);
    }
    visual.position.copy(charge.worldPosition);
    visual.quaternion.copy(charge.worldQuaternion);
  });

  return (
    <group ref={group} position={charge.worldPosition} quaternion={charge.worldQuaternion}>
      <ChargeBody />
    </group>
  );
}

export function DemolitionChargeSystem({
  active,
  raycastRoot,
  runtimeRef,
  onCountChange,
  onDetonate,
}: {
  active: boolean;
  raycastRoot: RefObject<Group | null>;
  runtimeRef: MutableRefObject<DemolitionChargeRuntime | null>;
  onCountChange: (count: number) => void;
  onDetonate: (position: readonly [number, number, number]) => void;
}) {
  const { camera } = useThree();
  const [charges, setCharges] = useState<readonly AnchoredCharge[]>([]);
  const chargesRef = useRef<readonly AnchoredCharge[]>([]);
  const previewGroup = useRef<Group>(null);
  const dangerPreviewGroup = useRef<Group>(null);
  const previewRef = useRef<PlacementPreview | null>(null);
  const sequence = useRef(0);
  const timers = useRef<number[]>([]);
  const raycaster = useRef(new Raycaster());
  const worldNormal = useRef(new Vector3());
  const worldQuaternion = useRef(new Quaternion());
  const anchorQuaternion = useRef(new Quaternion());
  const rayToCharge = useRef(new Vector3());

  const commit = useCallback(
    (next: readonly AnchoredCharge[]) => {
      chargesRef.current = next;
      setCharges(next);
      onCountChange(next.length);
    },
    [onCountChange],
  );

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const clear = useCallback(() => {
    clearTimers();
    previewRef.current = null;
    commit([]);
  }, [clearTimers, commit]);

  const placeOrRemove = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (preview.removeId !== null) {
      commit(
        chargesRef.current.filter((charge) => charge.id !== preview.removeId),
      );
      return;
    }
    if (preview.blocked || chargesRef.current.length >= MAX_DEMOLITION_CHARGES) {
      return;
    }
    sequence.current += 1;
    const charge: AnchoredCharge = {
      id: sequence.current,
      anchor: preview.anchor,
      localPosition: preview.localPosition.clone(),
      localQuaternion: preview.localQuaternion.clone(),
      worldPosition: preview.worldPosition.clone(),
      worldQuaternion: preview.worldQuaternion.clone(),
    };
    commit([...chargesRef.current, charge]);
  }, [commit]);

  const detonateAll = useCallback(() => {
    const armed = [...chargesRef.current];
    if (armed.length === 0) return;
    commit([]);
    clearTimers();
    for (const [index, charge] of armed.entries()) {
      const position = charge.worldPosition.toArray() as [number, number, number];
      const timer = window.setTimeout(() => {
        onDetonate(position);
        timers.current = timers.current.filter((candidate) => candidate !== timer);
      }, demolitionDetonationDelay(index));
      timers.current.push(timer);
    }
  }, [clearTimers, commit, onDetonate]);

  useEffect(() => {
    const runtime: DemolitionChargeRuntime = {
      placeOrRemove,
      detonateAll,
      clear,
    };
    runtimeRef.current = runtime;
    return () => {
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [clear, detonateAll, placeOrRemove, runtimeRef]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useFrame(() => {
    const previewVisual = previewGroup.current;
    const dangerVisual = dangerPreviewGroup.current;
    const root = raycastRoot.current;
    if (!previewVisual || !dangerVisual || !active || !root) {
      if (previewVisual) previewVisual.visible = false;
      if (dangerVisual) dangerVisual.visible = false;
      previewRef.current = null;
      return;
    }
    previewVisual.visible = false;
    dangerVisual.visible = false;

    const placementRaycaster = raycaster.current;
    placementRaycaster.far = DEMOLITION_CHARGE_RANGE;
    placementRaycaster.setFromCamera(SCREEN_CENTER, camera);
    const hit = placementRaycaster.intersectObject(root, true)[0] ?? null;
    const ray = placementRaycaster.ray;
    let removeCharge: AnchoredCharge | null = null;
    let removeDistance = Infinity;
    for (const charge of chargesRef.current) {
      rayToCharge.current.copy(charge.worldPosition).sub(ray.origin);
      const along = rayToCharge.current.dot(ray.direction);
      if (along <= 0 || along > DEMOLITION_CHARGE_RANGE) continue;
      const perpendicularSq = Math.max(
        0,
        rayToCharge.current.lengthSq() - along * along,
      );
      if (
        perpendicularSq <= CHARGE_PICK_RADIUS * CHARGE_PICK_RADIUS &&
        along < removeDistance &&
        (!hit || along <= hit.distance + 0.2)
      ) {
        removeCharge = charge;
        removeDistance = along;
      }
    }

    if (removeCharge) {
      dangerVisual.visible = true;
      dangerVisual.position.copy(removeCharge.worldPosition);
      dangerVisual.quaternion.copy(removeCharge.worldQuaternion);
      dangerVisual.scale.setScalar(1.1);
      previewRef.current = {
        anchor: removeCharge.anchor,
        localPosition: removeCharge.localPosition,
        localQuaternion: removeCharge.localQuaternion,
        worldPosition: removeCharge.worldPosition,
        worldQuaternion: removeCharge.worldQuaternion,
        removeId: removeCharge.id,
        blocked: false,
      };
      return;
    }

    if (!hit) {
      previewRef.current = null;
      return;
    }

    hit.object.updateWorldMatrix(true, false);
    worldNormal.current
      .copy(hit.face?.normal ?? ray.direction.clone().negate())
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    const position = hit.point
      .clone()
      .addScaledVector(worldNormal.current, 0.055);
    worldQuaternion.current.setFromUnitVectors(SURFACE_AXIS, worldNormal.current);
    hit.object.getWorldQuaternion(anchorQuaternion.current);
    const localQuaternion = anchorQuaternion.current
      .clone()
      .invert()
      .multiply(worldQuaternion.current);
    const localPosition = hit.object.worldToLocal(position.clone());
    const blocked = chargesRef.current.length >= MAX_DEMOLITION_CHARGES;

    const placementVisual = blocked ? dangerVisual : previewVisual;
    placementVisual.visible = true;
    placementVisual.position.copy(position);
    placementVisual.quaternion.copy(worldQuaternion.current);
    placementVisual.scale.setScalar(blocked ? 0.86 : 1);
    previewRef.current = {
      anchor: hit.object,
      localPosition,
      localQuaternion,
      worldPosition: position,
      worldQuaternion: worldQuaternion.current.clone(),
      removeId: null,
      blocked,
    };
  });

  return (
    <>
      {charges.map((charge) => (
        <PlacedCharge key={charge.id} charge={charge} />
      ))}
      <group ref={previewGroup} visible={false}>
        <ChargeBody preview />
      </group>
      <group ref={dangerPreviewGroup} visible={false}>
        <ChargeBody preview danger />
      </group>
    </>
  );
}
