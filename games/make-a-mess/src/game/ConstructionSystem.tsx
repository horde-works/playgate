"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from "react";
import { Euler, Group, Quaternion, Vector3 } from "three";
import {
  advanceCarSteering,
  carForces,
  type CarMachine,
  type CarWheel,
} from "./carDynamics.ts";
import {
  CONSTRUCTION_CATALOG,
  CONSTRUCTION_MAX_ASSEMBLIES,
  CONSTRUCTION_MAX_PARTS,
  classifyConstructionAssembly,
  constructionAssemblyMass,
  constructionCatalogPart,
  constructionConnectionId,
  normalizeConstructionSize,
  parseConstructionSave,
  serializeConstructionSave,
  snapConstructionPoint,
  splitConstructionAssembly,
  type ConstructionAssembly,
  type ConstructionPart,
  type ConstructionPartKind,
  type ConstructionQuat,
  type ConstructionVec3,
} from "./constructionModel.ts";
import { VEHICLE_CARRIER, VEHICLE_CONTACT_QUERY } from "./physicsInteractionGroups.ts";
import {
  registerRuntimePassengerSeat,
  type PassengerSeatDefinition,
} from "./passengerSeats.ts";
import {
  advanceRotorMotorOutput,
  rotorcraftForces,
  type RotorcraftMachine,
} from "./rotorcraftDynamics.ts";
import type { VehicleFramePoseState } from "./VehicleFrameSystem.tsx";

const GRAVITY = 9.81;
const MAX_GRAB_DISTANCE = 14;
const DEFAULT_PLACE_DISTANCE = 4;
const CONSTRUCTION_STORAGE_PREFIX = "make-a-mess:construction:v1:";
const IDENTITY_QUAT: ConstructionQuat = [0, 0, 0, 1];

export interface ConstructionUiState {
  readonly catalogOpen: boolean;
  readonly selectedKind: ConstructionPartKind;
  readonly selectedSize: ConstructionVec3;
  readonly assemblyCount: number;
  readonly partCount: number;
  readonly held: boolean;
  readonly aimedMachine: "inert" | "car" | "rotorcraft" | null;
  readonly controlledMachine: "car" | "rotorcraft" | null;
  readonly status: string;
}

export interface ConstructionRuntime {
  primary(): void;
  primaryEnd(): void;
}

export const DEFAULT_CONSTRUCTION_UI: ConstructionUiState = {
  catalogOpen: false,
  selectedKind: "beam",
  selectedSize: constructionCatalogPart("beam").defaultSize,
  assemblyCount: 0,
  partCount: 0,
  held: false,
  aimedMachine: null,
  controlledMachine: null,
  status: "ready",
};

interface HeldBody {
  body: RapierRigidBody;
  assemblyId: string | null;
  distance: number;
}

function id(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function tuple(vector: { x: number; y: number; z: number }): ConstructionVec3 {
  return [vector.x, vector.y, vector.z];
}

function quaternionTuple(quaternion: {
  x: number;
  y: number;
  z: number;
  w: number;
}): ConstructionQuat {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function initialAssemblies(sceneId: string): ConstructionAssembly[] {
  if (typeof window === "undefined") return [];
  try {
    return (
      parseConstructionSave(
        window.localStorage.getItem(`${CONSTRUCTION_STORAGE_PREFIX}${sceneId}`),
      )?.assemblies ?? []
    );
  } catch {
    return [];
  }
}

function partSpawnRotation(kind: ConstructionPartKind, yaw: number): ConstructionQuat {
  const rotation = new Quaternion().setFromEuler(
    new Euler(kind === "wheel" ? Math.PI / 2 : 0, yaw, 0, "YXZ"),
  );
  return quaternionTuple(rotation);
}

function ConstructionPartVisual({
  part,
  powered,
}: {
  part: ConstructionPart;
  powered: boolean;
}): ReactElement {
  const spin = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!spin.current || !powered) return;
    if (part.kind === "wheel") spin.current.rotation.y -= delta * 8;
    if (part.kind === "rotor") spin.current.rotation.y += delta * 18;
  });
  const color =
    part.kind === "beam"
      ? "#b8793d"
      : part.kind === "plate"
        ? "#71808c"
        : part.kind === "wheel"
          ? "#24282b"
          : part.kind === "engine"
            ? "#d56b32"
            : part.kind === "seat"
              ? "#326b80"
              : "#d7b74b";
  return (
    <group
      position={part.localPosition as [number, number, number]}
      quaternion={part.localRotation as [number, number, number, number]}
    >
      <group ref={spin}>
        {part.kind === "wheel" || part.kind === "rotor" ? (
          <mesh castShadow receiveShadow>
            <cylinderGeometry
              args={[part.size[0] / 2, part.size[2] / 2, part.size[1], part.kind === "rotor" ? 24 : 18]}
            />
            <meshStandardMaterial color={color} roughness={0.62} metalness={0.18} />
          </mesh>
        ) : (
          <mesh castShadow receiveShadow scale={part.size as [number, number, number]}>
            <boxGeometry />
            <meshStandardMaterial color={color} roughness={0.68} metalness={0.12} />
          </mesh>
        )}
      </group>
      {part.kind === "seat" ? (
        <mesh position={[0.25, 0.5, 0]} scale={[0.12, 0.75, 0.62]} castShadow>
          <boxGeometry />
          <meshStandardMaterial color="#244b5b" roughness={0.82} />
        </mesh>
      ) : null}
      {part.kind === "engine" ? (
        <mesh position={[-0.48, 0, 0]} scale={[0.08, 0.34, 0.5]}>
          <boxGeometry />
          <meshStandardMaterial color="#ffd17d" emissive="#6b2d0c" emissiveIntensity={0.35} />
        </mesh>
      ) : null}
    </group>
  );
}

function ConstructionCollider({
  part,
  includeActuator,
}: {
  part: ConstructionPart;
  includeActuator: boolean;
}): ReactElement | null {
  const actuator = part.kind === "wheel" || part.kind === "rotor";
  if (actuator && !includeActuator) return null;
  const density = constructionCatalogPart(part.kind).density;
  const common = {
    position: part.localPosition as [number, number, number],
    quaternion: part.localRotation as [number, number, number, number],
    density,
    friction: part.kind === "wheel" ? 0.9 : 0.68,
    restitution: 0.08,
    collisionGroups: VEHICLE_CARRIER,
  };
  return part.kind === "wheel" || part.kind === "rotor" ? (
    <CylinderCollider
      {...common}
      args={[part.size[1] / 2, Math.max(part.size[0], part.size[2]) / 2]}
    />
  ) : (
    <CuboidCollider
      {...common}
      args={[part.size[0] / 2, part.size[1] / 2, part.size[2] / 2]}
    />
  );
}

function localCentreOfMass(assembly: ConstructionAssembly): ConstructionVec3 {
  let mass = 0;
  const centre = [0, 0, 0];
  for (const part of assembly.parts) {
    const partAssembly = { ...assembly, parts: [part] };
    const partMass = constructionAssemblyMass(partAssembly);
    mass += partMass;
    centre[0] += part.localPosition[0] * partMass;
    centre[1] += part.localPosition[1] * partMass;
    centre[2] += part.localPosition[2] * partMass;
  }
  return mass > 0
    ? [centre[0] / mass, centre[1] / mass, centre[2] / mass]
    : [0, 0, 0];
}

export function ConstructionSystem({
  active,
  sceneId,
  resetVersion,
  occupiedSeatId,
  onOccupiedSeatChange,
  vehicleFramePoses,
  runtimeRef,
  onUiChange,
}: {
  active: boolean;
  sceneId: string;
  resetVersion: number;
  occupiedSeatId: string | null;
  onOccupiedSeatChange: (seatId: string | null) => void;
  vehicleFramePoses: MutableRefObject<Map<string, VehicleFramePoseState>>;
  runtimeRef: MutableRefObject<ConstructionRuntime | null>;
  onUiChange: (state: ConstructionUiState) => void;
}): ReactElement {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const [assemblies, setAssemblies] = useState<ConstructionAssembly[]>(() =>
    initialAssemblies(sceneId),
  );
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ConstructionPartKind>("beam");
  const [selectedSize, setSelectedSize] = useState<ConstructionVec3>(
    constructionCatalogPart("beam").defaultSize,
  );
  const [holding, setHolding] = useState(false);
  const [status, setStatus] = useState("ready");
  const bodyByAssembly = useRef(new Map<string, RapierRigidBody>());
  const held = useRef<HeldBody | null>(null);
  const aimedAssembly = useRef<string | null>(null);
  const previewPosition = useRef(new Vector3());
  const previewNormal = useRef(new Vector3(0, 1, 0));
  const previewYaw = useRef(0);
  const placementDistance = useRef(DEFAULT_PLACE_DISTANCE);
  const keys = useRef(new Set<string>());
  const resetSeen = useRef(resetVersion);
  const impactBreakQueue = useRef(new Set<string>());
  const impactCooldownUntil = useRef(new Map<string, number>());
  const previewGroup = useRef<Group>(null);
  const rotorOutputByAssembly = useRef(new Map<string, number[]>());
  const steeringByAssembly = useRef(new Map<string, number>());

  const assemblyById = useMemo(
    () => new Map(assemblies.map((assembly) => [assembly.id, assembly])),
    [assemblies],
  );

  const snapshotAssembly = useCallback((assembly: ConstructionAssembly) => {
    const body = bodyByAssembly.current.get(assembly.id);
    if (!body) return assembly;
    return {
      ...assembly,
      position: tuple(body.translation()),
      rotation: quaternionTuple(body.rotation()),
      linvel: tuple(body.linvel()),
      angvel: tuple(body.angvel()),
    };
  }, []);

  const publishUi = useCallback(() => {
    const aimed = aimedAssembly.current
      ? assemblyById.get(aimedAssembly.current) ?? null
      : null;
    const controlledAssembly = occupiedSeatId?.startsWith("construction-seat:")
      ? assemblyById.get(occupiedSeatId.slice("construction-seat:".length)) ?? null
      : null;
    const controlledKind = controlledAssembly
      ? classifyConstructionAssembly(controlledAssembly).kind
      : null;
    onUiChange({
      catalogOpen,
      selectedKind,
      selectedSize,
      assemblyCount: assemblies.length,
      partCount: assemblies.reduce((sum, assembly) => sum + assembly.parts.length, 0),
      held: holding,
      aimedMachine: aimed ? classifyConstructionAssembly(aimed).kind : null,
      controlledMachine:
        controlledKind === "car" || controlledKind === "rotorcraft"
          ? controlledKind
          : null,
      status,
    });
  }, [
    assemblies,
    assemblyById,
    catalogOpen,
    holding,
    occupiedSeatId,
    onUiChange,
    selectedKind,
    selectedSize,
    status,
  ]);

  useEffect(publishUi, [publishUi]);

  const cameraRay = useCallback(() => {
    const direction = camera.getWorldDirection(new Vector3()).normalize();
    return {
      direction,
      ray: new rapier.Ray(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        { x: direction.x, y: direction.y, z: direction.z },
      ),
    };
  }, [camera, rapier]);

  const cast = useCallback(
    (maxDistance: number, exclude?: RapierRigidBody | null) => {
      const { ray } = cameraRay();
      return world.castRayAndGetNormal(
        ray,
        maxDistance,
        true,
        undefined,
        undefined,
        undefined,
        exclude ?? undefined,
      );
    },
    [cameraRay, world],
  );

  const spawn = useCallback(
    (kind = selectedKind, position?: ConstructionVec3) => {
      const count = assemblies.reduce((sum, assembly) => sum + assembly.parts.length, 0);
      if (assemblies.length >= CONSTRUCTION_MAX_ASSEMBLIES || count >= CONSTRUCTION_MAX_PARTS) {
        setStatus("budget reached");
        return null;
      }
      const partId = id("construction-part");
      const assemblyId = id("construction-assembly");
      const part: ConstructionPart = {
        id: partId,
        kind,
        localPosition: [0, 0, 0],
        localRotation: partSpawnRotation(kind, previewYaw.current),
        size: kind === selectedKind ? selectedSize : constructionCatalogPart(kind).defaultSize,
      };
      const next: ConstructionAssembly = {
        id: assemblyId,
        position: position ?? tuple(previewPosition.current),
        rotation: IDENTITY_QUAT,
        linvel: [0, 0, 0],
        angvel: [0, 0, 0],
        parts: [part],
        connections: [],
      };
      setAssemblies((current) => [...current, next]);
      setStatus(`${constructionCatalogPart(kind).label.toLowerCase()} placed`);
      return assemblyId;
    },
    [assemblies, selectedKind, selectedSize],
  );

  const releaseHeld = useCallback(() => {
    held.current = null;
    setHolding(false);
    setStatus("released");
    publishUi();
  }, [publishUi]);

  const primary = useCallback(() => {
    if (!active || occupiedSeatId) return;
    if (held.current) {
      const direction = camera.getWorldDirection(new Vector3()).normalize();
      const body = held.current.body;
      const mass = Math.max(1, body.mass());
      body.applyImpulse(
        { x: direction.x * mass * 8, y: direction.y * mass * 8, z: direction.z * mass * 8 },
        true,
      );
      held.current = null;
      setHolding(false);
      setStatus("thrown");
      publishUi();
      return;
    }
    spawn();
  }, [active, camera, occupiedSeatId, publishUi, spawn]);

  useEffect(() => {
    runtimeRef.current = { primary, primaryEnd: () => {} };
    return () => {
      runtimeRef.current = null;
    };
  }, [primary, runtimeRef]);

  const weld = useCallback(() => {
    const sourceId = held.current?.assemblyId;
    const targetId = aimedAssembly.current;
    if (!sourceId || !targetId || sourceId === targetId) {
      setStatus("hold one build and aim at another");
      return;
    }
    const source = assemblyById.get(sourceId);
    const target = assemblyById.get(targetId);
    if (!source || !target) return;
    const sourceLive = snapshotAssembly(source);
    const targetLive = snapshotAssembly(target);
    const targetPosition = new Vector3(...targetLive.position);
    const targetRotation = new Quaternion(...targetLive.rotation);
    const targetInverse = targetRotation.clone().invert();
    const sourcePosition = new Vector3(...sourceLive.position);
    const sourceRotation = new Quaternion(...sourceLive.rotation);
    const converted = sourceLive.parts.map((part) => {
      const worldPosition = new Vector3(...part.localPosition)
        .applyQuaternion(sourceRotation)
        .add(sourcePosition);
      const worldRotation = sourceRotation.clone().multiply(new Quaternion(...part.localRotation));
      return {
        ...part,
        localPosition: tuple(worldPosition.sub(targetPosition).applyQuaternion(targetInverse)),
        localRotation: quaternionTuple(targetInverse.clone().multiply(worldRotation)),
      };
    });
    let closest: [string, string] = [target.parts[0].id, source.parts[0].id];
    let closestDistance = Infinity;
    for (const left of targetLive.parts) {
      const leftWorld = new Vector3(...left.localPosition).applyQuaternion(targetRotation).add(targetPosition);
      for (const right of converted) {
        const distance = leftWorld.distanceTo(
          new Vector3(...right.localPosition).applyQuaternion(targetRotation).add(targetPosition),
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = [left.id, right.id];
        }
      }
    }
    const sourceMass = constructionAssemblyMass(sourceLive);
    const targetMass = constructionAssemblyMass(targetLive);
    const totalMass = Math.max(1, sourceMass + targetMass);
    const weighted = (a: number, b: number) => (a * targetMass + b * sourceMass) / totalMass;
    const merged: ConstructionAssembly = {
      ...targetLive,
      id: id("construction-assembly"),
      linvel: targetLive.linvel.map((value, axis) => weighted(value, sourceLive.linvel[axis])) as unknown as ConstructionVec3,
      angvel: targetLive.angvel.map((value, axis) => weighted(value, sourceLive.angvel[axis])) as unknown as ConstructionVec3,
      parts: [...targetLive.parts, ...converted],
      connections: [
        ...targetLive.connections,
        ...sourceLive.connections,
        { id: constructionConnectionId(...closest), a: closest[0], b: closest[1] },
      ],
    };
    held.current = null;
    setHolding(false);
    setAssemblies((current) => [
      ...current.filter((assembly) => assembly.id !== sourceId && assembly.id !== targetId),
      merged,
    ]);
    setStatus("welded into one rigid body");
  }, [assemblyById, snapshotAssembly]);

  const unweld = useCallback(() => {
    const targetId = aimedAssembly.current;
    const assembly = targetId ? assemblyById.get(targetId) : null;
    const connection = assembly?.connections.at(-1);
    if (!assembly || !connection) {
      setStatus("no weld to remove");
      return;
    }
    const live = snapshotAssembly(assembly);
    const split = splitConstructionAssembly(live, connection.id).map((item) => ({
      ...item,
      id: id("construction-assembly"),
    }));
    setAssemblies((current) => [
      ...current.filter((item) => item.id !== assembly.id),
      ...split,
    ]);
    setStatus(split.length > 1 ? "weld removed" : "connection removed");
  }, [assemblyById, snapshotAssembly]);

  const removeAimed = useCallback(() => {
    const targetId = aimedAssembly.current;
    if (!targetId) return;
    if (held.current?.assemblyId === targetId) {
      held.current = null;
      setHolding(false);
    }
    if (occupiedSeatId === `construction-seat:${targetId}`) onOccupiedSeatChange(null);
    setAssemblies((current) => current.filter((assembly) => assembly.id !== targetId));
    aimedAssembly.current = null;
    setStatus("build removed");
  }, [occupiedSeatId, onOccupiedSeatChange]);

  const toggleSeat = useCallback(() => {
    if (occupiedSeatId?.startsWith("construction-seat:")) {
      onOccupiedSeatChange(null);
      setStatus("left controls");
      return;
    }
    const target = aimedAssembly.current
      ? assemblyById.get(aimedAssembly.current) ?? null
      : null;
    if (!target || classifyConstructionAssembly(target).kind === "inert") {
      setStatus("machine needs controller, engine and actuators");
      return;
    }
    onOccupiedSeatChange(`construction-seat:${target.id}`);
    setStatus("controls engaged");
  }, [assemblyById, occupiedSeatId, onOccupiedSeatChange]);

  useEffect(() => {
    const typing = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      return element?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(element?.tagName ?? "");
    };
    const down = (event: KeyboardEvent) => {
      if (typing(event)) return;
      keys.current.add(event.code);
      if (!active || event.repeat) return;
      if (event.code === "KeyB") {
        event.preventDefault();
        setCatalogOpen((open) => !open);
      } else if (event.code === "KeyX" || event.code === "KeyZ") {
        const index = CONSTRUCTION_CATALOG.findIndex((part) => part.kind === selectedKind);
        const delta = event.code === "KeyX" ? 1 : -1;
        const next = CONSTRUCTION_CATALOG[(index + delta + CONSTRUCTION_CATALOG.length) % CONSTRUCTION_CATALOG.length];
        setSelectedKind(next.kind);
        setSelectedSize(next.defaultSize);
        setStatus(`${next.label.toLowerCase()} selected`);
      } else if (event.code === "KeyE") {
        previewYaw.current += event.shiftKey ? Math.PI / 36 : Math.PI / 12;
        setStatus(event.shiftKey ? "rotated 5°" : "rotated 15°");
      } else if (event.code === "KeyG") {
        event.preventDefault();
        if (event.shiftKey) unweld();
        else weld();
      } else if (event.code === "KeyC") {
        event.preventDefault();
        toggleSeat();
      } else if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        removeAimed();
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const mouseDown = (event: MouseEvent) => {
      if (!active || occupiedSeatId || event.button !== 2) return;
      event.preventDefault();
      const hit = cast(MAX_GRAB_DISTANCE);
      const body = hit?.collider.parent() ?? null;
      if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) return;
      const data = body.userData as { constructionAssemblyId?: string } | undefined;
      held.current = {
        body,
        assemblyId: data?.constructionAssemblyId ?? null,
        distance: hit?.timeOfImpact ?? DEFAULT_PLACE_DISTANCE,
      };
      setHolding(true);
      body.wakeUp();
      setStatus("held — left click throws");
      publishUi();
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button === 2 && held.current) releaseHeld();
    };
    const wheel = (event: WheelEvent) => {
      if (!active) return;
      event.preventDefault();
      if (event.ctrlKey || event.shiftKey) {
        const spec = constructionCatalogPart(selectedKind);
        const axis = selectedKind === "beam" ? 0 : selectedKind === "plate" ? 2 : 0;
        const next = [...selectedSize] as [number, number, number];
        next[axis] += Math.sign(event.deltaY) * spec.sizeStep[axis] * (event.shiftKey ? 1 : 2);
        setSelectedSize(normalizeConstructionSize(selectedKind, next));
      } else if (held.current) {
        held.current.distance = Math.min(18, Math.max(1.5, held.current.distance + Math.sign(event.deltaY) * 0.5));
      } else {
        placementDistance.current = Math.min(18, Math.max(1.5, placementDistance.current + Math.sign(event.deltaY) * 0.5));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousedown", mouseDown);
    document.addEventListener("mouseup", mouseUp);
    document.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousedown", mouseDown);
      document.removeEventListener("mouseup", mouseUp);
      document.removeEventListener("wheel", wheel);
    };
  }, [active, cast, occupiedSeatId, publishUi, rapier, releaseHeld, removeAimed, selectedKind, selectedSize, toggleSeat, unweld, weld]);

  useFrame((_, delta) => {
    const currentHeld = held.current;
    const { direction } = cameraRay();
    if (currentHeld) {
      const target = camera.position.clone().addScaledVector(direction, currentHeld.distance);
      const current = currentHeld.body.translation();
      const velocity = currentHeld.body.linvel();
      const mass = Math.max(1, currentHeld.body.mass());
      const force = target.sub(new Vector3(current.x, current.y, current.z)).multiplyScalar(mass * 24);
      force.sub(new Vector3(velocity.x, velocity.y, velocity.z).multiplyScalar(mass * 7));
      force.clampLength(0, mass * 85);
      const step = Math.min(1 / 30, Math.max(1 / 240, delta));
      currentHeld.body.applyImpulse(
        { x: force.x * step, y: force.y * step, z: force.z * step },
        true,
      );
    }
    const hit = cast(20, currentHeld?.body);
    const targetId = (hit?.collider.parent()?.userData as { constructionAssemblyId?: string } | undefined)?.constructionAssemblyId ?? null;
    if (aimedAssembly.current !== targetId) {
      aimedAssembly.current = targetId;
      publishUi();
    }
    if (active && !currentHeld) {
      if (hit) {
        const point = camera.position.clone().addScaledVector(direction, hit.timeOfImpact);
        previewNormal.current.set(hit.normal.x, hit.normal.y, hit.normal.z);
        const lift = Math.max(selectedSize[0], selectedSize[1], selectedSize[2]) * 0.12 + 0.06;
        point.addScaledVector(previewNormal.current, lift);
        previewPosition.current.copy(keys.current.has("AltLeft") ? point : new Vector3(...snapConstructionPoint(tuple(point))));
      } else {
        previewNormal.current.set(0, 1, 0);
        previewPosition.current.copy(camera.position).addScaledVector(direction, placementDistance.current);
      }
    }
    if (previewGroup.current) {
      previewGroup.current.position.copy(previewPosition.current);
      previewGroup.current.quaternion.set(...partSpawnRotation(selectedKind, previewYaw.current));
    }
    if (impactBreakQueue.current.size > 0) {
      const queued = new Set(impactBreakQueue.current);
      impactBreakQueue.current.clear();
      setAssemblies((current) =>
        current.flatMap((assembly) => {
          if (!queued.has(assembly.id)) return [assembly];
          const live = snapshotAssembly(assembly);
          const connection = live.connections.at(-1);
          if (!connection) return live.parts.length <= 1 ? [] : [live];
          return splitConstructionAssembly(live, connection.id).map((partAssembly) => ({
            ...partAssembly,
            id: id("construction-assembly"),
          }));
        }),
      );
      setStatus("impact broke a weld");
    }
  });

  useBeforePhysicsStep(() => {
    for (const assembly of assemblies) {
      const body = bodyByAssembly.current.get(assembly.id);
      if (!body) continue;
      const mass = Math.max(0.1, body.mass());
      body.resetForces(false);
      body.resetTorques(false);
      body.addForce({ x: 0, y: -mass * GRAVITY, z: 0 }, true);
      const seatId = `construction-seat:${assembly.id}`;
      const classification = classifyConstructionAssembly(assembly);
      const controlled = occupiedSeatId === seatId;
      const translation = body.translation();
      const rotation = body.rotation();
      const linear = body.linvel();
      const angular = body.angvel();
      const worldCom = body.worldCom();
      vehicleFramePoses.current.set(assembly.id, {
        clusterId: assembly.id,
        origin: [0, 0, 0],
        nose: [-1, 0, 0],
        pose: {
          position: [translation.x, translation.y, translation.z],
          yaw: 0,
          pitch: 0,
          roll: 0,
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        },
        linearVelocity: [linear.x, linear.y, linear.z],
        angularVelocity: [angular.x, angular.y, angular.z],
        centreOfMass: [worldCom.x, worldCom.y, worldCom.z],
      });
      if (!controlled) continue;
      const orientation: [number, number, number, number] = [rotation.x, rotation.y, rotation.z, rotation.w];
      if (classification.canFly) {
        const centre = localCentreOfMass(assembly);
        const rotors = assembly.parts.filter((part) => part.kind === "rotor");
        const machine: RotorcraftMachine = {
          points: rotors.map((part) => part.localPosition),
          centreOfMass: centre,
          nose: [-1, 0, 0],
          mass,
          inertia: [mass * 1.8, mass * 2.4, mass * 1.8],
          availability: rotors.map(() => 1),
          liftCapacity: mass * GRAVITY * 2.15,
          spinDirections: rotors.map((_, index) => (index % 2 === 0 ? 1 : -1)),
          maximumTilt: Math.PI / 5,
        };
        const demand = {
          forward: (keys.current.has("KeyW") ? 4 : 0) - (keys.current.has("KeyS") ? 4 : 0),
          lateral: (keys.current.has("KeyD") ? 4 : 0) - (keys.current.has("KeyA") ? 4 : 0),
          collective: (keys.current.has("Space") ? 0.55 : 0) - (keys.current.has("ShiftLeft") ? 0.4 : 0),
          yaw: (keys.current.has("KeyE") ? 0.75 : 0) - (keys.current.has("KeyQ") ? 0.75 : 0),
        };
        const requested = rotorcraftForces(
          machine,
          {
            orientation,
            centre: [worldCom.x, worldCom.y, worldCom.z],
            velocity: [linear.x, linear.y, linear.z],
            angularVelocity: [angular.x, angular.y, angular.z],
          },
          demand,
        );
        const previousOutput = rotorOutputByAssembly.current.get(assembly.id) ?? [];
        const motorOutput = rotors.map((_, index) =>
          advanceRotorMotorOutput(
            previousOutput[index] ?? 0,
            requested.commandedThrottle[index] ?? 0,
            1 / 120,
            1.4,
          ),
        );
        rotorOutputByAssembly.current.set(assembly.id, motorOutput);
        const result = rotorcraftForces(
          { ...machine, motorOutput },
          {
            orientation,
            centre: [worldCom.x, worldCom.y, worldCom.z],
            velocity: [linear.x, linear.y, linear.z],
            angularVelocity: [angular.x, angular.y, angular.z],
          },
          demand,
        );
        for (const applied of result.forces) {
          body.addForceAtPoint(
            { x: applied.force[0], y: applied.force[1], z: applied.force[2] },
            { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
            true,
          );
        }
      } else if (classification.canDrive) {
        const wheelParts = assembly.parts.filter((part) => part.kind === "wheel");
        const xs = wheelParts.map((part) => part.localPosition[0]).sort((a, b) => a - b);
        const median = xs[Math.floor(xs.length / 2)] ?? 0;
        const wheels: CarWheel[] = wheelParts.map((part) => ({
          id: part.id,
          axle: part.localPosition[0] <= median ? "front" : "rear",
          hub: part.localPosition,
          radius: Math.max(part.size[0], part.size[2]) / 2,
          travel: Math.max(0.16, Math.max(part.size[0], part.size[2]) * 0.26),
          stiffness: mass * GRAVITY * 2.8 / wheelParts.length,
          damping: mass * 1.7,
          steerShare: part.localPosition[0] <= median ? 1 : 0,
          brakeShare: 1 / wheelParts.length,
          grip: 0.92,
          cornering: mass * 3.2,
        }));
        const bodyQuaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const up = new Vector3(0, 1, 0).applyQuaternion(bodyQuaternion);
        const own = body;
        const probes = wheels.map((wheel) => {
          const hub = new Vector3(...wheel.hub).applyQuaternion(bodyQuaternion).add(new Vector3(translation.x, translation.y, translation.z));
          const ray = new rapier.Ray(
            { x: hub.x, y: hub.y, z: hub.z },
            { x: -up.x, y: -up.y, z: -up.z },
          );
          const hit = world.castRayAndGetNormal(ray, wheel.radius + wheel.travel, true, undefined, VEHICLE_CONTACT_QUERY, undefined, own);
          return hit
            ? { distance: hit.timeOfImpact, normal: [hit.normal.x, hit.normal.y, hit.normal.z] as ConstructionVec3 }
            : null;
        });
        const centre = localCentreOfMass(assembly);
        const machine: CarMachine = {
          wheels,
          nose: [-1, 0, 0],
          centreOfMass: centre,
          mass,
          layout: "all",
          driveForce: mass * 3.8,
          brakeForce: mass * 7.5,
          rollingResistance: 0.018,
          availability: wheels.map(() => 1),
        };
        const requestedSteer =
          ((keys.current.has("KeyD") ? 1 : 0) -
            (keys.current.has("KeyA") ? 1 : 0)) *
          0.48;
        const steer = advanceCarSteering(
          steeringByAssembly.current.get(assembly.id) ?? 0,
          requestedSteer,
          1.8,
          1 / 120,
        );
        steeringByAssembly.current.set(assembly.id, steer);
        const result = carForces(
          machine,
          {
            orientation,
            centre: [worldCom.x, worldCom.y, worldCom.z],
            velocity: [linear.x, linear.y, linear.z],
            angularVelocity: [angular.x, angular.y, angular.z],
          },
          {
            throttle: (keys.current.has("KeyW") ? 1 : 0) - (keys.current.has("KeyS") ? 1 : 0),
            brake: keys.current.has("Space") ? 1 : 0,
            steer,
            handbrake: keys.current.has("ShiftLeft"),
          },
          probes,
        );
        for (const applied of result.forces) {
          body.addForceAtPoint(
            { x: applied.force[0], y: applied.force[1], z: applied.force[2] },
            { x: applied.point[0], y: applied.point[1], z: applied.point[2] },
            true,
          );
        }
      }
    }
  });

  useEffect(() => {
    const unregister = assemblies.flatMap((assembly) => {
      const classification = classifyConstructionAssembly(assembly);
      const seat = assembly.parts.find((part) => part.id === classification.controllerPartId);
      if (!seat) return [];
      const definition: PassengerSeatDefinition = {
        id: `construction-seat:${assembly.id}`,
        carrierClusterId: assembly.id,
        interactionPoint: seat.localPosition,
        occupantPoint: [seat.localPosition[0], seat.localPosition[1] + 0.72, seat.localPosition[2]],
        exitPoint: [seat.localPosition[0], seat.localPosition[1] + 0.45, seat.localPosition[2] + 1.5],
        facing: [-1, 0, 0],
        requiredPieceIds: [],
        approachRadius: 2.4,
        releaseRadius: 3,
      };
      return [registerRuntimePassengerSeat(definition)];
    });
    return () => unregister.forEach((dispose) => dispose());
  }, [assemblies]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      try {
        window.localStorage.setItem(
          `${CONSTRUCTION_STORAGE_PREFIX}${sceneId}`,
          serializeConstructionSave(assemblies.map(snapshotAssembly)),
        );
      } catch {
        // Storage can be unavailable; the live simulation remains authoritative.
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [assemblies, sceneId, snapshotAssembly]);

  useEffect(() => {
    if (resetSeen.current === resetVersion) return;
    resetSeen.current = resetVersion;
    held.current = null;
    setHolding(false);
    setAssemblies([]);
    try {
      window.localStorage.removeItem(`${CONSTRUCTION_STORAGE_PREFIX}${sceneId}`);
    } catch {}
  }, [resetVersion, sceneId]);

  useEffect(() => {
    const ids = new Set(assemblies.map((assembly) => assembly.id));
    for (const key of vehicleFramePoses.current.keys()) {
      if (key.startsWith("construction-assembly") && !ids.has(key)) vehicleFramePoses.current.delete(key);
    }
  }, [assemblies, vehicleFramePoses]);

  useEffect(() => {
    if (!occupiedSeatId?.startsWith("construction-seat:")) return;
    const assemblyId = occupiedSeatId.slice("construction-seat:".length);
    if (!assemblyById.has(assemblyId)) onOccupiedSeatChange(null);
  }, [assemblyById, occupiedSeatId, onOccupiedSeatChange]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const scope = window as unknown as Record<string, unknown>;
    const state = () => ({
      assemblies: assemblies.map(snapshotAssembly),
      ui: { catalogOpen, selectedKind, selectedSize, status },
      occupiedSeatId,
    });
    const devSpawn = (kind: ConstructionPartKind = "beam", position?: ConstructionVec3) => spawn(kind, position);
    scope.__mamConstructionState = state;
    scope.__mamConstructionSpawn = devSpawn;
    return () => {
      if (scope.__mamConstructionState === state) delete scope.__mamConstructionState;
      if (scope.__mamConstructionSpawn === devSpawn) delete scope.__mamConstructionSpawn;
    };
  }, [assemblies, catalogOpen, occupiedSeatId, selectedKind, selectedSize, snapshotAssembly, spawn, status]);

  const previewPart: ConstructionPart = {
    id: "preview",
    kind: selectedKind,
    localPosition: [0, 0, 0],
    localRotation: partSpawnRotation(selectedKind, 0),
    size: selectedSize,
  };

  return (
    <>
      {assemblies.map((assembly) => {
        const classification = classifyConstructionAssembly(assembly);
        const powered = occupiedSeatId === `construction-seat:${assembly.id}`;
        return (
          <RigidBody
            key={assembly.id}
            ref={(body) => {
              if (body) bodyByAssembly.current.set(assembly.id, body);
              else bodyByAssembly.current.delete(assembly.id);
            }}
            colliders={false}
            position={assembly.position as [number, number, number]}
            quaternion={assembly.rotation as [number, number, number, number]}
            linearVelocity={assembly.linvel as [number, number, number]}
            angularVelocity={assembly.angvel as [number, number, number]}
            gravityScale={0}
            ccd
            linearDamping={0.04}
            angularDamping={0.08}
            additionalSolverIterations={4}
            userData={{ constructionAssemblyId: assembly.id }}
            onContactForce={(event) => {
              const body = bodyByAssembly.current.get(assembly.id);
              if (!body || assembly.connections.length === 0) return;
              const severity = event.totalForceMagnitude / Math.max(1, body.mass());
              const now = performance.now();
              if (severity < 180 || now < (impactCooldownUntil.current.get(assembly.id) ?? 0)) return;
              impactCooldownUntil.current.set(assembly.id, now + 450);
              impactBreakQueue.current.add(assembly.id);
            }}
          >
            {assembly.parts.map((part) => (
              <ConstructionPartVisual key={part.id} part={part} powered={powered} />
            ))}
            {assembly.parts.map((part) => (
              <ConstructionCollider
                key={`collider:${part.id}`}
                part={part}
                includeActuator={classification.kind === "inert"}
              />
            ))}
          </RigidBody>
        );
      })}
      {active && !occupiedSeatId && !holding ? (
        <group
          ref={previewGroup}
          position={[0, -1000, 0]}
          quaternion={previewPart.localRotation as [number, number, number, number]}
        >
          {previewPart.kind === "wheel" || previewPart.kind === "rotor" ? (
            <mesh>
              <cylinderGeometry args={[previewPart.size[0] / 2, previewPart.size[2] / 2, previewPart.size[1], 20]} />
              <meshBasicMaterial color="#59d6ff" transparent opacity={0.38} depthWrite={false} />
            </mesh>
          ) : (
            <mesh scale={previewPart.size as [number, number, number]}>
              <boxGeometry />
              <meshBasicMaterial color="#59d6ff" transparent opacity={0.32} depthWrite={false} />
            </mesh>
          )}
        </group>
      ) : null}
    </>
  );
}
