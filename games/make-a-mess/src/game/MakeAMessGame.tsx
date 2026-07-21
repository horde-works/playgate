"use client";

import {
  KeyboardControls,
  useKeyboardControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import Link from "next/link";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  AgXToneMapping,
  BoxGeometry,
  Color,
  Euler,
  Group,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from "three";
import type { Ray as RapierRay } from "@dimforge/rapier3d-compat";
import {
  materialRuntimeProfiles,
  structuralMaterialProfiles,
  openHouseScene,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type DestructionSceneDefinition,
} from "./destructionScene";
import {
  BLAST_PUSH_RADIUS,
  BLAST_RADIUS,
  MG_FIRE_INTERVAL,
  MG_RANGE,
  ROCKET_BLAST_PUSH_RADIUS,
  ROCKET_BLAST_RADIUS,
  VOLUME_BREAK_FRACTION,
  blastNoise,
  buildShards,
  bulletHoleRadius,
  classifyLandingDamage,
  closestPointOnOrientedBox,
  crumbleOnLanding,
  damageBody,
  debrisColliderBoxes,
  debrisCollisionTuning,
  debrisSleepSampleRequirement,
  fractureEnergyByMaterial,
  grenadeEnergyAtDistance,
  groundMaterials,
  impactDamageRadius,
  rocketEnergyAtDistance,
  trimShardBudget,
  type FractureCause,
  type RemnantDefinition,
  type ShardDefinition,
  type ShardSource,
} from "./destructionRuntime";
import {
  playDebrisSound,
  playExplosionSound,
  playGunshotSound,
  playImpactSound,
  playLaunchSound,
  prepareGameAudio,
} from "./impactAudio";
import {
  isNewPhysicalContact,
  measureImpactApproachSpeed,
  shouldPlayDebrisImpact,
  type ImpactMotion,
} from "./impactSoundPolicy";
import {
  FirstPersonHammer,
  FirstPersonLauncher,
  FirstPersonMachineGun,
  FirstPersonRocketLauncher,
  type SwingDefinition,
} from "./FirstPersonWeapons";
import {
  DynamicBreakableWorld,
  getPieceRenderBoxes,
} from "./DynamicBreakableWorld";
import { HingedDoorSystem } from "./HingedDoorSystem";
import { IntactBreakableWorld } from "./IntactBreakableWorld";
import { getPieceMaterial } from "./materialTextures";
import { resolveRuntimeStructure } from "./runtimeStructure";
import { createSpatialIndex } from "./spatialIndex";
import {
  autoStepLiftSpeed,
  setFlightVelocityTarget,
} from "./playerMovement";
import {
  DayNightCycle,
  LampLight,
  SceneEnvironment,
  type TimeOfDay,
} from "./WorldEnvironment";
import { TeardownPostProcessing } from "./TeardownPostProcessing";

type ControlName =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "run"
  | "jump";

type WeaponName = "hammer" | "launcher" | "mg" | "rocket";
type ExplosiveKind = "grenade" | "rocket";

interface MobileControlsState {
  moveX: number;
  moveZ: number;
  lookDeltaX: number;
  lookDeltaY: number;
  jump: boolean;
  run: boolean;
}

type MobileControlsRef = MutableRefObject<MobileControlsState>;

interface MobileActionBridge {
  strike: () => void;
  strikeEnd: () => void;
}

const keyboardMap: Array<{ name: ControlName; keys: string[] }> = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
  { name: "jump", keys: ["Space"] },
];

interface ImpactBurstDefinition {
  readonly id: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly material: BreakableMaterial;
}

interface TracerDefinition {
  readonly id: number;
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
}

interface GrenadeDefinition {
  readonly id: number;
  readonly kind: ExplosiveKind;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
}

interface RocketTrailSlot {
  readonly position: Vector3;
  age: number;
  size: number;
  active: boolean;
}

interface VoxelExplosionDefinition {
  readonly id: number;
  readonly position: readonly [number, number, number];
}

interface PerformanceSnapshot {
  readonly fps: number;
  readonly calls: number;
  readonly triangles: number;
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const ROCKET_TRAIL_COUNT = 42;
const ROCKET_TRAIL_LIFE = 0.58;
const ROCKET_TRAIL_INTERVAL = 0.035;
const ROCKET_TRAIL_COLORS = ["#ffcf67", "#f06a32", "#4b4d49"] as const;

const blastTransmissionByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.76,
  darkGlass: 0.68,
  plaster: 0.36,
  wood: 0.24,
  foliage: 0.58,
  grass: 0.11,
  soil: 0.1,
  earth: 0.09,
  brick: 0.06,
  asphalt: 0.05,
  concrete: 0.025,
  stone: 0.02,
  graphiteStone: 0.018,
  basalt: 0.014,
  steel: 0.01,
};

type BlastOccluderSource =
  | BreakablePieceDefinition
  | RemnantDefinition
  | ShardDefinition;

interface BlastOccluder {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakableMaterial;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly size: readonly [number, number, number];
  readonly surfaceDistance: number;
}

function segmentIntersectsOrientedBox(
  start: Vector3,
  end: Vector3,
  position: Vector3,
  size: readonly [number, number, number],
  quaternion: Quaternion,
  padding = 0.025,
): boolean {
  const inverseRotation = quaternion.clone().invert();
  const localStart = start.clone().sub(position).applyQuaternion(inverseRotation);
  const localEnd = end.clone().sub(position).applyQuaternion(inverseRotation);
  const direction = localEnd.clone().sub(localStart);
  let tMin = 0;
  let tMax = 1;

  for (const [axis, halfSize] of [
    ["x", size[0] / 2 + padding],
    ["y", size[1] / 2 + padding],
    ["z", size[2] / 2 + padding],
  ] as const) {
    const origin = localStart[axis];
    const delta = direction[axis];

    if (Math.abs(delta) < 1e-5) {
      if (origin < -halfSize || origin > halfSize) {
        return false;
      }
      continue;
    }

    const inverse = 1 / delta;
    let near = (-halfSize - origin) * inverse;
    let far = (halfSize - origin) * inverse;
    if (near > far) {
      [near, far] = [far, near];
    }
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) {
      return false;
    }
  }

  return tMax > 0.015 && tMin < 0.985;
}

function blastVisibilityFactor(
  center: Vector3,
  targetPoint: Vector3,
  targetId: string,
  targetParentId: string,
  targetDistance: number,
  occluders: readonly BlastOccluder[],
): number {
  let factor = 1;

  for (const occluder of occluders) {
    if (
      occluder.id === targetId ||
      occluder.parentId === targetParentId ||
      occluder.surfaceDistance >= targetDistance - 0.08
    ) {
      continue;
    }

    if (
      segmentIntersectsOrientedBox(
        center,
        targetPoint,
        occluder.position,
        occluder.size,
        occluder.quaternion,
      )
    ) {
      factor *= blastTransmissionByMaterial[occluder.material];
      if (factor < 0.04) {
        return factor;
      }
    }
  }

  return factor;
}

function createMobileControlsState(): MobileControlsState {
  return {
    moveX: 0,
    moveZ: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    jump: false,
    run: false,
  };
}

function isTouchLikeDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 900px)").matches
  );
}
interface BreakableHitData {
  readonly pieceId?: string;
  readonly shardId?: string;
  readonly remnantId?: string;
  readonly material?: BreakableMaterial;
}

type BodyAction = (body: RapierRigidBody) => void;

function readBreakableHit(
  intersection: Intersection,
): BreakableHitData | null {
  const userData = intersection.object.userData;
  const instanceIds = userData.breakableInstanceIds as
    | readonly string[]
    | undefined;
  const instanceKinds = userData.breakableInstanceKinds as
    | readonly ("piece" | "shard" | "remnant")[]
    | undefined;
  const instanceKind =
    intersection.instanceId === undefined
      ? undefined
      : instanceKinds?.[intersection.instanceId];
  const instanceSourceId =
    intersection.instanceId === undefined
      ? undefined
      : instanceIds?.[intersection.instanceId];
  const pieceId =
    typeof userData.breakablePiece === "string"
      ? userData.breakablePiece
      : instanceKind === undefined || instanceKind === "piece"
        ? instanceSourceId
        : undefined;
  const shardId =
    typeof userData.breakableShard === "string"
      ? userData.breakableShard
      : instanceKind === "shard"
        ? instanceSourceId
        : undefined;
  const remnantId =
    typeof userData.breakableRemnant === "string"
      ? userData.breakableRemnant
      : instanceKind === "remnant"
        ? instanceSourceId
        : undefined;

  if (!pieceId && !shardId && !remnantId) {
    return null;
  }

  return {
    pieceId,
    shardId,
    remnantId,
    material:
      typeof userData.breakableMaterial === "string"
        ? (userData.breakableMaterial as BreakableMaterial)
        : undefined,
  };
}

function Player({
  registerBody,
  mobileControls,
  spawn,
  flightMode,
}: {
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  mobileControls: MobileControlsRef;
  spawn: readonly [number, number, number];
  flightMode: boolean;
}) {
  const body = useRef<RapierRigidBody>(null);
  const [, getControls] = useKeyboardControls<ControlName>();
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const movement = useMemo(() => new Vector3(), []);
  const flightForward = useMemo(() => new Vector3(), []);
  const flightRight = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const groundRay = useRef<RapierRay | null>(null);
  const stepRay = useRef<RapierRay | null>(null);
  const stepCooldown = useRef(0);
  const spawnFrames = useRef(0);

  useEffect(() => {
    registerBody("player", body.current);
    return () => registerBody("player", null);
  }, [registerBody]);

  useEffect(() => {
    const currentBody = body.current;
    if (!currentBody) {
      return;
    }
    currentBody.setGravityScale(flightMode ? 0 : 1, true);
    const velocity = currentBody.linvel();
    currentBody.setLinvel(
      { x: velocity.x, y: flightMode ? 0 : Math.min(0, velocity.y), z: velocity.z },
      true,
    );
  }, [flightMode]);

  useFrame((_, delta) => {
    if (!body.current) {
      return;
    }

    // Spawn grace: pin the player to the spawn point for the first frames so
    // load-time physics hiccups can never push them through the ground.
    if (spawnFrames.current < 40) {
      spawnFrames.current += 1;
      body.current.setTranslation(
        { x: spawn[0], y: spawn[1], z: spawn[2] },
        true,
      );
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      camera.position.set(
        spawn[0],
        spawn[1] + 0.54,
        spawn[2],
      );
      return;
    }

    const position = body.current.translation();
    const velocity = body.current.linvel();
    const { forward, backward, left, right, run, jump } = getControls();
    const touch = mobileControls.current;
    const inputX = MathUtils.clamp(
      Number(right) - Number(left) + touch.moveX,
      -1,
      1,
    );
    const inputZ = MathUtils.clamp(
      Number(backward) - Number(forward) + touch.moveZ,
      -1,
      1,
    );
    const speed = flightMode
      ? run || touch.run
        ? 13
        : 8.5
      : run || touch.run
        ? 6.2
        : 4.25;

    if (flightMode) {
      camera.getWorldDirection(flightForward).normalize();
      flightRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      setFlightVelocityTarget(
        movement,
        flightForward,
        flightRight,
        inputX,
        inputZ,
        speed,
      );
      const control = 1 - Math.exp(-delta * 9);
      body.current.setLinvel(
        {
          x: velocity.x + (movement.x - velocity.x) * control,
          y: velocity.y + (movement.y - velocity.y) * control,
          z: velocity.z + (movement.z - velocity.z) * control,
        },
        true,
      );
      camera.position.set(position.x, position.y + 0.54, position.z);
      return;
    }

    movement.set(inputX, 0, inputZ);
    if (movement.lengthSq() > 0) {
      movement.normalize().applyAxisAngle(up, camera.rotation.y).multiplyScalar(speed);
    }

    groundRay.current ??= new rapier.Ray(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
    );
    groundRay.current.origin.x = position.x;
    groundRay.current.origin.y = position.y;
    groundRay.current.origin.z = position.z;
    const groundHit = world.castRay(
      groundRay.current,
      0.95,
      true,
      undefined,
      undefined,
      undefined,
      body.current ?? undefined,
    );
    const grounded = groundHit !== null;

    // Auto-step: when running into a low obstacle (stair tread, kerb,
    // rubble), probe its height and hop exactly high enough to clear it.
    stepCooldown.current = Math.max(0, stepCooldown.current - delta);
    let autoLift = 0;
    const desiredSq = movement.lengthSq();
    const horizontalSq = velocity.x * velocity.x + velocity.z * velocity.z;
    if (
      grounded &&
      stepCooldown.current <= 0 &&
      desiredSq > 1 &&
      horizontalSq < desiredSq * 0.25
    ) {
      stepRay.current ??= new rapier.Ray(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      );
      const probe = stepRay.current;
      const inverse = 1 / Math.sqrt(desiredSq);
      const directionX = movement.x * inverse;
      const directionZ = movement.z * inverse;
      const bottomY = position.y - 0.79;

      probe.origin.x = position.x;
      probe.origin.y = bottomY + 0.18;
      probe.origin.z = position.z;
      probe.dir.x = directionX;
      probe.dir.y = 0;
      probe.dir.z = directionZ;
      const lowHit = world.castRay(
        probe,
        0.82,
        true,
        undefined,
        undefined,
        undefined,
        body.current ?? undefined,
      );

      if (lowHit) {
        probe.origin.y = bottomY + 1.25;
        const highHit = world.castRay(
          probe,
          0.92,
          true,
          undefined,
          undefined,
          undefined,
          body.current ?? undefined,
        );

        if (!highHit) {
          probe.origin.x = position.x + directionX * 0.72;
          probe.origin.y = bottomY + 0.9;
          probe.origin.z = position.z + directionZ * 0.72;
          probe.dir.x = 0;
          probe.dir.y = -1;
          probe.dir.z = 0;
          const downHit = world.castRayAndGetNormal(
            probe,
            1.02,
            true,
            undefined,
            undefined,
            undefined,
            body.current ?? undefined,
          );
          const stepHeight = downHit ? 0.9 - downHit.timeOfImpact : 0;
          autoLift = autoStepLiftSpeed({
            blockedAtFeet: true,
            bodyClear: true,
            landingFound: downHit !== null,
            landingNormalY: downHit?.normal.y ?? 0,
            stepHeight,
          });

          if (autoLift > 0) {
            stepCooldown.current = 0.3;
          }
        }
      }
    }

    // Blend control speed into the current velocity instead of overwriting it,
    // so debris impacts and blasts can push the player around.
    const control = grounded
      ? 1 - Math.exp(-delta * 11)
      : 1 - Math.exp(-delta * 3.2);

    body.current.setLinvel(
      {
        x: velocity.x + (movement.x - velocity.x) * control,
        y:
          (jump || touch.jump) && grounded
            ? 5.4
            : autoLift > 0
              ? Math.max(velocity.y, autoLift)
              : velocity.y,
        z: velocity.z + (movement.z - velocity.z) * control,
      },
      true,
    );

    camera.position.set(position.x, position.y + 0.54, position.z);

    // Below the invisible safety floor means the player left the world
    // volume (deepest legit crater floor keeps the capsule center ≈ -1.3).
    if (position.y < -2.6) {
      body.current.setTranslation(
        { x: spawn[0], y: spawn[1], z: spawn[2] },
        true,
      );
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={body}
      position={[...spawn]}
      gravityScale={flightMode ? 0 : 1}
      colliders={false}
      enabledRotations={[false, false, false]}
      friction={0.15}
      linearDamping={0.35}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[0.45, 0.36]} />
    </RigidBody>
  );
}

interface MouseLookProps {
  active: boolean;
  requestVersion: number;
  mobileControls: MobileControlsRef;
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
}

function MouseLook({
  active,
  requestVersion,
  mobileControls,
  onActiveChange,
  onFallbackChange,
  onStrike,
  onStrikeEnd,
}: MouseLookProps) {
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const yaw = useRef(camera.rotation.y);
  const pitch = useRef(camera.rotation.x);
  const wasPointerLocked = useRef(false);
  const previousRequest = useRef(requestVersion);
  const initialized = useRef(false);
  const drag = useRef({
    active: false,
    button: -1,
    distance: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });

  useFrame(() => {
    if (!initialized.current) {
      initialized.current = true;
      yaw.current = 0;
      pitch.current = 0;
      cameraRef.current.rotation.set(0, 0, 0, "YXZ");
    }

    const touch = mobileControls.current;
    if (!active || (touch.lookDeltaX === 0 && touch.lookDeltaY === 0)) {
      return;
    }

    const movementX = touch.lookDeltaX;
    const movementY = touch.lookDeltaY;
    touch.lookDeltaX = 0;
    touch.lookDeltaY = 0;

    yaw.current -= movementX * 0.003;
    pitch.current = MathUtils.clamp(
      pitch.current - movementY * 0.0027,
      -Math.PI / 2.1,
      Math.PI / 2.1,
    );
    cameraRef.current.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  });

  useEffect(() => {
    if (previousRequest.current === requestVersion || requestVersion === 0) {
      return;
    }

    previousRequest.current = requestVersion;
    try {
      const request = gl.domElement.requestPointerLock?.();

      if (request && "catch" in request) {
        request.catch(() => {
          onFallbackChange(true);
          onActiveChange(true);
        });
      } else if (!request) {
        onFallbackChange(true);
        onActiveChange(true);
      }
    } catch {
      onFallbackChange(true);
      onActiveChange(true);
    }
  }, [
    gl.domElement,
    onActiveChange,
    onFallbackChange,
    requestVersion,
  ]);

  useEffect(() => {
    const handlePointerLockChange = () => {
      const pointerLocked = document.pointerLockElement === gl.domElement;

      if (pointerLocked) {
        wasPointerLocked.current = true;
        onFallbackChange(false);
        onActiveChange(true);
      } else if (wasPointerLocked.current) {
        wasPointerLocked.current = false;
        onActiveChange(false);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!active) {
        return;
      }

      const pointerLocked = document.pointerLockElement === gl.domElement;
      const fallbackDragging =
        drag.current.active &&
        ((event.buttons & 1) === 1 || (event.buttons & 2) === 2);
      if (!pointerLocked && !fallbackDragging) {
        return;
      }

      const movementX = pointerLocked
        ? event.movementX
        : event.clientX - drag.current.lastX;
      const movementY = pointerLocked
        ? event.movementY
        : event.clientY - drag.current.lastY;

      if (fallbackDragging) {
        drag.current.distance += Math.abs(movementX) + Math.abs(movementY);
        drag.current.lastX = event.clientX;
        drag.current.lastY = event.clientY;
      }

      yaw.current -= movementX * 0.0022;
      pitch.current = MathUtils.clamp(
        pitch.current - movementY * 0.002,
        -Math.PI / 2.1,
        Math.PI / 2.1,
      );
      cameraRef.current.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (!active) {
        return;
      }

      const pointerLocked = document.pointerLockElement === gl.domElement;
      if (pointerLocked && event.button === 0) {
        onStrike();
        return;
      }

      // Fallback mode: retry pointer lock on every click gesture over the
      // game — the moment the browser grants it, the cursor is captured.
      if (!pointerLocked && event.target === gl.domElement) {
        try {
          const request = gl.domElement.requestPointerLock?.() as
            | Promise<void>
            | undefined;
          request?.catch?.(() => {});
        } catch {
          // stay in drag mode
        }
      }

      if (event.button === 0 || event.button === 2) {
        drag.current = {
          active: true,
          button: event.button,
          distance: 0,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
        };
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!active) {
        return;
      }

      if (document.pointerLockElement === gl.domElement) {
        if (event.button === 0) {
          onStrikeEnd();
        }
        return;
      }

      const shouldStrike =
        event.button === 0 &&
        drag.current.button === 0 &&
        drag.current.distance < 5 &&
        Math.hypot(
          event.clientX - drag.current.startX,
          event.clientY - drag.current.startY,
        ) < 5;

      drag.current.active = false;
      drag.current.button = -1;
      drag.current.distance = 0;
      drag.current.startX = 0;
      drag.current.startY = 0;
      drag.current.lastX = 0;
      drag.current.lastY = 0;

      if (shouldStrike) {
        onStrike();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === "Escape" &&
        active &&
        document.pointerLockElement !== gl.domElement
      ) {
        onActiveChange(false);
      }
    };

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    gl.domElement.addEventListener("contextmenu", preventContextMenu);

    return () => {
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
      gl.domElement.removeEventListener("contextmenu", preventContextMenu);
    };
  }, [
    active,
    gl.domElement,
    onActiveChange,
    onFallbackChange,
    onStrike,
    onStrikeEnd,
  ]);

  return null;
}

interface BreakablePieceProps {
  piece: BreakablePieceDefinition;
  broken: boolean;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onDebrisContact: (
    piece: BreakablePieceDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}

const BreakablePiece = memo(function BreakablePiece({
  piece,
  broken,
  registerBody,
  onDebrisContact,
}: BreakablePieceProps) {
  const body = useRef<RapierRigidBody>(null);
  const wasBroken = useRef(false);
  const { rapier } = useRapier();
  const profile = materialRuntimeProfiles[piece.material];
  const renderBoxes = useMemo(() => getPieceRenderBoxes(piece), [piece]);
  const colliderBoxes = broken
    ? debrisColliderBoxes(piece.size, renderBoxes)
    : renderBoxes;
  const collisionTuning = debrisCollisionTuning(piece.size);

  useEffect(() => {
    registerBody(piece.id, body.current);
    return () => registerBody(piece.id, null);
  }, [piece.id, registerBody]);

  useEffect(() => {
    const currentBody = body.current;
    if (!currentBody) {
      return;
    }

    if (broken && !wasBroken.current) {
      if (currentBody.bodyType() !== rapier.RigidBodyType.Dynamic) {
        currentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      registerBody(piece.id, currentBody);
      currentBody.wakeUp();

      const mass = Math.max(0.04, currentBody.mass());
      currentBody.applyImpulse(
        {
          x: ((piece.column ?? 1) - 1) * 0.06 * mass,
          y: (0.32 + (piece.row ?? 0) * 0.01) * mass,
          z: ((piece.row ?? 0) % 2 === 0 ? 1 : -1) * 0.14 * mass,
        },
        true,
      );
      currentBody.applyTorqueImpulse(
        {
          x: ((piece.row ?? 0) % 2 === 0 ? 1 : -1) * 0.05 * mass,
          y: ((piece.column ?? 0) % 2 === 0 ? 1 : -1) * 0.045 * mass,
          z: (piece.material === "wood" ? 0.09 : 0.03) * mass,
        },
        true,
      );

      const colliderCount = currentBody.numColliders();
      for (let index = 0; index < colliderCount; index += 1) {
        currentBody
          .collider(index)
          .setContactForceEventThreshold(Math.max(0.4, mass * 55));
      }
    }

    wasBroken.current = broken;
  }, [
    broken,
    piece.column,
    piece.id,
    piece.material,
    piece.row,
    rapier,
    registerBody,
  ]);

  return (
    <RigidBody
      ref={body}
      type={broken ? "dynamic" : "fixed"}
      position={[...piece.position]}
      rotation={piece.rotation ? [...piece.rotation] : undefined}
      colliders={false}
      friction={piece.material === "wood" ? 0.66 : 0.84}
      restitution={profile.restitution}
      linearDamping={0.18}
      angularDamping={0.24}
      density={profile.density}
      ccd={broken && collisionTuning.hardCcd}
      softCcdPrediction={
        broken ? collisionTuning.softCcdPrediction : 0
      }
      onContactForce={
        broken
          ? (payload) => {
              const currentBody = body.current;
              if (!currentBody) {
                return;
              }
              onDebrisContact(
                piece,
                payload.totalForceMagnitude,
                currentBody.mass(),
                payload.maxForceDirection,
              );
            }
          : undefined
      }
    >
      {colliderBoxes.map((box, index) => (
        <CuboidCollider
          key={index}
          args={[
            Math.max(0.002, box.size[0] / 2 - 0.002),
            Math.max(0.002, box.size[1] / 2 - 0.002),
            Math.max(0.002, box.size[2] / 2 - 0.002),
          ]}
          position={[...box.center]}
        />
      ))}
    </RigidBody>
  );
});

function BreakableObjects({
  pieces,
  brokenPieces,
  shatteredPieces,
  bodies,
  registerBody,
  onDebrisContact,
}: {
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  shatteredPieces: ReadonlySet<string>;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onDebrisContact: (
    piece: BreakablePieceDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}) {
  const { intactPieces, bodyPieces } = useMemo(() => {
    const intact: BreakablePieceDefinition[] = [];
    const bodies: BreakablePieceDefinition[] = [];
    for (const piece of pieces) {
      if (shatteredPieces.has(piece.id)) {
        continue;
      }
      if (
        brokenPieces.has(piece.id) ||
        piece.hinge ||
        piece.shape === "cinderBlock"
      ) {
        bodies.push(piece);
      } else {
        intact.push(piece);
      }
    }
    return {
      intactPieces: intact,
      bodyPieces: bodies,
    };
  }, [brokenPieces, pieces, shatteredPieces]);

  return (
    <group>
      <IntactBreakableWorld pieces={intactPieces} />
      <DynamicBreakableWorld
        pieces={bodyPieces}
        shards={[]}
        remnants={[]}
        bodies={bodies}
      />
      {bodyPieces.map((piece) => (
        <BreakablePiece
          key={piece.id}
          piece={piece}
          broken={brokenPieces.has(piece.id)}
          registerBody={registerBody}
          onDebrisContact={onDebrisContact}
        />
      ))}
    </group>
  );
}

const Shard = memo(function Shard({
  shard,
  registerBody,
  onContact,
}: {
  shard: ShardDefinition;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onContact: (
    shard: ShardDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const profile = materialRuntimeProfiles[shard.material];
  const colliderBoxes = debrisColliderBoxes(shard.size, shard.boxes);
  const isChunky =
    shard.size[0] * shard.size[1] * shard.size[2] > 0.015;
  const collisionTuning = debrisCollisionTuning(shard.size);

  useEffect(() => {
    const currentBody = body.current;
    if (!currentBody) {
      return undefined;
    }

    registerBody(shard.id, currentBody);
    const colliderCount = currentBody.numColliders();
    for (let index = 0; index < colliderCount; index += 1) {
      currentBody
        .collider(index)
        .setContactForceEventThreshold(
          Math.max(0.4, currentBody.mass() * 55),
        );
    }
    currentBody.setRotation(
      {
        x: shard.quaternion[0],
        y: shard.quaternion[1],
        z: shard.quaternion[2],
        w: shard.quaternion[3],
      },
      true,
    );
    currentBody.setLinvel(
      {
        x: shard.linearVelocity[0],
        y: shard.linearVelocity[1],
        z: shard.linearVelocity[2],
      },
      true,
    );
    currentBody.setAngvel(
      {
        x: shard.angularVelocity[0],
        y: shard.angularVelocity[1],
        z: shard.angularVelocity[2],
      },
      true,
    );

    return () => registerBody(shard.id, null);
  }, [registerBody, shard]);

  return (
    <RigidBody
      ref={body}
      position={[...shard.position]}
      colliders={false}
      density={profile.density}
      friction={0.78}
      restitution={profile.restitution}
      linearDamping={0.15}
      angularDamping={0.25}
      ccd={collisionTuning.hardCcd}
      softCcdPrediction={collisionTuning.softCcdPrediction}
      onContactForce={
        isChunky
          ? (payload) => {
              const currentBody = body.current;
              if (!currentBody) {
                return;
              }
              onContact(
                shard,
                payload.totalForceMagnitude,
                currentBody.mass(),
                payload.maxForceDirection,
              );
            }
          : undefined
      }
    >
      {colliderBoxes.map((box, index) => (
        <CuboidCollider
          key={`collider:${index}`}
          args={[
            Math.max(0.002, box.size[0] / 2 - 0.002),
            Math.max(0.002, box.size[1] / 2 - 0.002),
            Math.max(0.002, box.size[2] / 2 - 0.002),
          ]}
          position={[...box.center]}
        />
      ))}
    </RigidBody>
  );
});

function Grenade({
  grenade,
  onExplode,
}: {
  grenade: GrenadeDefinition;
  onExplode: (
    id: number,
    kind: ExplosiveKind,
    x: number,
    y: number,
    z: number,
  ) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const rocketVisual = useRef<Group>(null);
  const rocketTrailMesh = useRef<InstancedMesh>(null);
  const exploded = useRef(false);
  const trailTimer = useRef(0);
  const nextTrailSlot = useRef(0);
  const trailNoiseId = useRef(0);
  const trailSlots = useMemo<readonly RocketTrailSlot[]>(
    () =>
      Array.from({ length: ROCKET_TRAIL_COUNT }, () => ({
        position: new Vector3(),
        age: ROCKET_TRAIL_LIFE,
        size: 0,
        active: false,
      })),
    [],
  );
  const trailDummy = useMemo(() => new Object3D(), []);
  const trailBase = useMemo(() => new Vector3(), []);
  const trailSide = useMemo(() => new Vector3(), []);
  const trailUp = useMemo(() => new Vector3(), []);
  const trailPoint = useMemo(() => new Vector3(), []);
  const trailColor = useMemo(() => new Color(), []);
  const rocketDirection = useMemo(() => {
    const direction = new Vector3(
      grenade.velocity[0],
      grenade.velocity[1],
      grenade.velocity[2],
    );
    if (direction.lengthSq() < 0.001) {
      direction.set(0, 0, 1);
    }
    return direction.normalize();
  }, [grenade.velocity]);
  const rocketQuaternion = useMemo(() => new Quaternion(), []);
  const rocketForward = useMemo(() => new Vector3(0, 0, 1), []);

  useEffect(() => {
    const mesh = rocketTrailMesh.current;
    if (!mesh) {
      return;
    }

    trailDummy.position.set(0, -1000, 0);
    trailDummy.scale.setScalar(0);
    trailDummy.updateMatrix();
    for (let index = 0; index < ROCKET_TRAIL_COUNT; index += 1) {
      mesh.setMatrixAt(index, trailDummy.matrix);
      mesh.setColorAt(index, trailColor.set(ROCKET_TRAIL_COLORS[2]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [trailColor, trailDummy]);

  const trigger = useCallback(() => {
    if (exploded.current || !body.current) {
      return;
    }

    exploded.current = true;
    const translation = body.current.translation();
    onExplode(
      grenade.id,
      grenade.kind,
      translation.x,
      translation.y,
      translation.z,
    );
  }, [grenade.id, grenade.kind, onExplode]);

  useEffect(() => {
    if (!body.current) {
      return undefined;
    }

    body.current.setLinvel(
      {
        x: grenade.velocity[0],
        y: grenade.velocity[1],
        z: grenade.velocity[2],
      },
      true,
    );
    body.current.setAngvel(
      grenade.kind === "rocket" ? { x: 0, y: 0, z: 0 } : { x: 7, y: 3, z: 9 },
      true,
    );

    const fuse = window.setTimeout(
      trigger,
      grenade.kind === "rocket" ? 2600 : 3500,
    );
    return () => window.clearTimeout(fuse);
  }, [grenade, trigger]);

  const isRocket = grenade.kind === "rocket";

  useFrame((_, delta) => {
    const trailMesh = rocketTrailMesh.current;
    if (!isRocket || !body.current || !trailMesh) {
      return;
    }

    const translation = body.current.translation();
    if (rocketVisual.current) {
      rocketVisual.current.position.set(
        translation.x,
        translation.y,
        translation.z,
      );
      rocketVisual.current.quaternion.copy(
        rocketQuaternion.setFromUnitVectors(rocketForward, rocketDirection),
      );
    }

    trailTimer.current += delta;
    const spawnBatches = Math.min(
      3,
      Math.floor(trailTimer.current / ROCKET_TRAIL_INTERVAL),
    );
    if (spawnBatches > 0) {
      trailTimer.current -= spawnBatches * ROCKET_TRAIL_INTERVAL;
      trailBase
        .set(translation.x, translation.y, translation.z)
        .addScaledVector(rocketDirection, -0.34);
      trailSide.set(rocketDirection.z, 0, -rocketDirection.x);
      if (trailSide.lengthSq() < 0.001) {
        trailSide.set(1, 0, 0);
      }
      trailSide.normalize();
      trailUp.crossVectors(trailSide, rocketDirection).normalize();

      for (let batch = 0; batch < spawnBatches; batch += 1) {
        for (let index = 0; index < 3; index += 1) {
          trailNoiseId.current += 1;
          const slotIndex = nextTrailSlot.current;
          nextTrailSlot.current =
            (nextTrailSlot.current + 1) % ROCKET_TRAIL_COUNT;
          const slot = trailSlots[slotIndex];
          const noiseKey = `${grenade.id}:rocket:${trailNoiseId.current}`;
          const noiseA = blastNoise(noiseKey, 31) - 0.5;
          const noiseB = blastNoise(noiseKey, 37) - 0.5;
          const spread = 0.045 + index * 0.018;
          trailPoint
            .copy(trailBase)
            .addScaledVector(trailSide, noiseA * spread)
            .addScaledVector(trailUp, noiseB * spread)
            .addScaledVector(
              rocketDirection,
              -index * 0.08 - batch * 0.025,
            );
          slot.position.copy(trailPoint);
          slot.age = 0;
          slot.size = 0.075 + index * 0.025;
          slot.active = true;
          trailMesh.setColorAt(
            slotIndex,
            trailColor.set(ROCKET_TRAIL_COLORS[index]),
          );
        }
      }
      if (trailMesh.instanceColor) {
        trailMesh.instanceColor.needsUpdate = true;
      }
    }

    for (let index = 0; index < ROCKET_TRAIL_COUNT; index += 1) {
      const slot = trailSlots[index];
      if (slot.active) {
        slot.age += delta;
        if (slot.age >= ROCKET_TRAIL_LIFE) {
          slot.active = false;
        }
      }

      if (slot.active) {
        const life = 1 - slot.age / ROCKET_TRAIL_LIFE;
        const scale = slot.size * (1 + slot.age * 1.9) * life;
        trailDummy.position.copy(slot.position);
        trailDummy.scale.setScalar(scale);
      } else {
        trailDummy.position.set(0, -1000, 0);
        trailDummy.scale.setScalar(0);
      }
      trailDummy.updateMatrix();
      trailMesh.setMatrixAt(index, trailDummy.matrix);
    }
    trailMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <RigidBody
        ref={body}
        position={[...grenade.position]}
        colliders={false}
        density={isRocket ? 3.4 : 2.2}
        gravityScale={isRocket ? 0 : 1}
        linearDamping={0.04}
        angularDamping={isRocket ? 0.95 : 0.35}
        ccd
        onCollisionEnter={trigger}
      >
        <BallCollider args={[isRocket ? 0.14 : 0.09]} />
        {!isRocket ? (
          <>
            <mesh castShadow>
              <boxGeometry args={[0.13, 0.13, 0.2]} />
              <meshStandardMaterial color="#3f4d33" metalness={0.35} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0, 0.14]}>
              <boxGeometry args={[0.05, 0.05, 0.09]} />
              <meshStandardMaterial color="#c8ccc4" metalness={0.6} roughness={0.4} />
            </mesh>
          </>
        ) : null}
      </RigidBody>

      {isRocket ? (
        <group ref={rocketVisual}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.11, 0.54, 18]} />
            <meshStandardMaterial color="#28302e" metalness={0.42} roughness={0.48} />
          </mesh>
          <mesh castShadow position={[0, 0, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.112, 0.24, 18]} />
            <meshStandardMaterial color="#d6d0b9" metalness={0.35} roughness={0.42} />
          </mesh>
          <mesh castShadow position={[0, 0, -0.36]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.12, 16]} />
            <meshStandardMaterial color="#59615d" metalness={0.5} roughness={0.5} />
          </mesh>
          {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
            <mesh
              key={angle}
              castShadow
              position={[
                Math.cos(angle) * 0.105,
                Math.sin(angle) * 0.105,
                -0.24,
              ]}
              rotation={[0, 0, angle]}
            >
              <boxGeometry args={[0.018, 0.15, 0.18]} />
              <meshStandardMaterial color="#5f6965" metalness={0.45} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ) : null}

      {isRocket ? (
        <instancedMesh
          ref={rocketTrailMesh}
          args={[undefined, undefined, ROCKET_TRAIL_COUNT]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            transparent
            opacity={0.72}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      ) : null}
    </>
  );
}

// A static leftover of a carved piece: stays fixed in place while its parent
// piece is structurally alive, breaks loose when the parent gives way.
const Remnant = memo(function Remnant({
  remnant,
  freed,
  registerBody,
  onContact,
}: {
  remnant: RemnantDefinition;
  freed: boolean;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onContact: (
    remnant: RemnantDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const wasFreed = useRef(false);
  const { rapier } = useRapier();
  const profile = materialRuntimeProfiles[remnant.material];
  const boxes =
    remnant.boxes && remnant.boxes.length > 0
      ? remnant.boxes
      : [{ center: [0, 0, 0] as const, size: remnant.size }];
  const colliderBoxes = freed
    ? debrisColliderBoxes(remnant.size, boxes)
    : boxes;
  const isChunky =
    remnant.size[0] * remnant.size[1] * remnant.size[2] > 0.015;
  const collisionTuning = debrisCollisionTuning(remnant.size);

  useEffect(() => {
    const currentBody = body.current;
    if (!currentBody) {
      return undefined;
    }

    registerBody(remnant.id, currentBody);
    currentBody.setRotation(
      {
        x: remnant.quaternion[0],
        y: remnant.quaternion[1],
        z: remnant.quaternion[2],
        w: remnant.quaternion[3],
      },
      true,
    );
    const colliderCount = currentBody.numColliders();
    for (let index = 0; index < colliderCount; index += 1) {
      currentBody
        .collider(index)
        .setContactForceEventThreshold(
          Math.max(0.4, currentBody.mass() * 55),
        );
    }

    return () => registerBody(remnant.id, null);
  }, [registerBody, remnant]);

  useEffect(() => {
    const currentBody = body.current;
    if (!currentBody) {
      return;
    }

    if (freed && !wasFreed.current) {
      if (currentBody.bodyType() !== rapier.RigidBodyType.Dynamic) {
        currentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      registerBody(remnant.id, currentBody);
      currentBody.wakeUp();
      const mass = Math.max(0.02, currentBody.mass());
      currentBody.applyImpulse({ x: 0, y: 0.18 * mass, z: 0 }, true);
    }

    wasFreed.current = freed;
  }, [freed, rapier, registerBody, remnant.id]);

  return (
    <RigidBody
      ref={body}
      type={freed ? "dynamic" : "fixed"}
      position={[...remnant.position]}
      colliders={false}
      friction={0.82}
      restitution={profile.restitution}
      linearDamping={0.16}
      angularDamping={0.24}
      density={profile.density}
      ccd={freed && collisionTuning.hardCcd}
      softCcdPrediction={
        freed ? collisionTuning.softCcdPrediction : 0
      }
      onContactForce={
        freed && isChunky
          ? (payload) => {
              const currentBody = body.current;
              if (!currentBody) {
                return;
              }
              onContact(
                remnant,
                payload.totalForceMagnitude,
                currentBody.mass(),
                payload.maxForceDirection,
              );
            }
          : undefined
      }
    >
      {colliderBoxes.map((box, index) => (
        <CuboidCollider
          key={`collider:${index}`}
          args={[
            Math.max(0.002, box.size[0] / 2 - 0.002),
            Math.max(0.002, box.size[1] / 2 - 0.002),
            Math.max(0.002, box.size[2] / 2 - 0.002),
          ]}
          position={[...box.center]}
        />
      ))}
    </RigidBody>
  );
});

const TRACER_LIFE = 0.07;

function Tracer({
  tracer,
  onDone,
}: {
  tracer: TracerDefinition;
  onDone: (id: number) => void;
}) {
  const material = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const placement = useMemo(() => {
    const from = new Vector3(...tracer.from);
    const to = new Vector3(...tracer.to);
    const delta = to.clone().sub(from);
    const length = Math.max(0.2, delta.length());
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      delta.normalize(),
    );
    const middle = from.clone().add(to).multiplyScalar(0.5);
    return { middle, quaternion, length };
  }, [tracer]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    if (material.current) {
      material.current.opacity = Math.max(0, 1 - elapsed.current / TRACER_LIFE);
    }
    if (elapsed.current >= TRACER_LIFE && !done.current) {
      done.current = true;
      onDone(tracer.id);
    }
  });

  return (
    <mesh
      position={placement.middle}
      quaternion={placement.quaternion}
      frustumCulled={false}
    >
      <boxGeometry args={[0.016, 0.016, placement.length]} />
      <meshBasicMaterial
        ref={material}
        color="#ffd98a"
        transparent
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

const VOXEL_COUNT = 132;
const VOXEL_LIFE = 1.8;
const voxelFireColors = [
  "#fff8d5",
  "#ffe08a",
  "#ffb13b",
  "#ff782f",
  "#d84220",
];
const voxelSmokeColors = ["#858078", "#625e59", "#464441", "#302f2e"];
const voxelSparkColors = ["#fff7b1", "#ffd15c", "#ff8d32"];

function VoxelExplosion({
  explosion,
  onDone,
}: {
  explosion: VoxelExplosionDefinition;
  onDone: (id: number) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const light = useRef<PointLight>(null);
  const core = useRef<Group>(null);
  const coreMaterial = useRef<MeshBasicMaterial>(null);
  const coreOuterMaterial = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const dummy = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const voxelMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false }),
    [],
  );
  const particles = useMemo(
    () =>
      Array.from({ length: VOXEL_COUNT }, (_, index) => {
        const golden = 2.399963229728653;
        const t = (index + 0.5) / VOXEL_COUNT;
        const inclination = Math.acos(1 - 2 * t);
        const azimuth = golden * index;
        const variant = index % 10;
        const kind =
          variant < 5 ? ("fire" as const) : variant < 8 ? ("smoke" as const) : ("spark" as const);
        const variation = ((index * 37) % 23) / 23;
        const vertical = Math.cos(inclination);
        const directionY =
          kind === "smoke"
            ? Math.abs(vertical) * 0.52 + 0.48
            : vertical * 0.72 + 0.28;

        return {
          kind,
          direction: [
            Math.sin(inclination) * Math.cos(azimuth),
            directionY,
            Math.sin(inclination) * Math.sin(azimuth),
          ] as const,
          speed:
            kind === "spark"
              ? 8.5 + variation * 6.5
              : kind === "fire"
                ? 4.3 + variation * 5.4
                : 1.4 + variation * 2.2,
          size:
            kind === "spark"
              ? 0.035 + variation * 0.04
              : kind === "fire"
                ? 0.1 + variation * 0.2
                : 0.17 + variation * 0.25,
          spin: 2.5 + (((index * 29) % 13) / 13) * 8,
          delay:
            kind === "smoke" ? 0.05 + (index % 4) * 0.035 : (index % 3) * 0.008,
          life:
            kind === "spark"
              ? 0.9 + variation * 0.35
              : kind === "fire"
                ? 0.62 + variation * 0.34
                : 1.35 + variation * 0.4,
          drag: kind === "spark" ? 1.25 : kind === "fire" ? 2.2 : 1.6,
          gravity: kind === "spark" ? 7.8 : kind === "fire" ? 3.1 : -0.32,
        };
      }),
    [],
  );

  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) {
      return undefined;
    }

    const color = new Color();
    for (let index = 0; index < VOXEL_COUNT; index += 1) {
      const particle = particles[index];
      const palette =
        particle.kind === "fire"
          ? voxelFireColors
          : particle.kind === "smoke"
            ? voxelSmokeColors
            : voxelSparkColors;
      color.set(palette[(index * 7) % palette.length]);
      instanced.setColorAt(index, color);

      dummy.position.set(0, 0, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
    }
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }
    instanced.instanceMatrix.needsUpdate = true;

    return () => {
      geometry.dispose();
      voxelMaterial.dispose();
    };
  }, [dummy, geometry, particles, voxelMaterial]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const time = elapsed.current;
    const instanced = mesh.current;

    if (instanced) {
      for (let index = 0; index < VOXEL_COUNT; index += 1) {
        const particle = particles[index];
        const localTime = Math.max(0, time - particle.delay);
        const lifeProgress = Math.min(1, localTime / particle.life);
        const travel =
          particle.speed *
          ((1 - Math.exp(-particle.drag * localTime)) / particle.drag);
        const appear = Math.min(1, localTime / 0.075);
        const disappear = Math.max(0, 1 - lifeProgress);
        const grow =
          particle.kind === "smoke"
            ? appear * disappear ** 0.48 * (0.72 + localTime * 0.75)
            : particle.kind === "fire"
              ? appear * disappear ** 1.35
              : appear * disappear ** 0.72;

        dummy.position.set(
          particle.direction[0] * travel,
          particle.direction[1] * travel -
            particle.gravity * localTime * localTime * 0.5,
          particle.direction[2] * travel,
        );
        dummy.rotation.set(
          particle.spin * localTime,
          particle.spin * 0.7 * localTime,
          particle.spin * 0.4 * localTime,
        );
        if (particle.kind === "spark") {
          dummy.scale.set(
            Math.max(0.0001, particle.size * grow * 0.55),
            Math.max(0.0001, particle.size * grow * 0.55),
            Math.max(0.0001, particle.size * grow * 2.8),
          );
        } else {
          const size = Math.max(0.0001, particle.size * grow);
          dummy.scale.set(
            size * (0.82 + (index % 3) * 0.12),
            size * (0.9 + (index % 2) * 0.18),
            size,
          );
        }
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
    }

    const flashProgress = Math.min(1, time / 0.28);
    if (core.current) {
      const coreScale =
        time < 0.045
          ? 0.35 + (time / 0.045) * 1.2
          : Math.max(0.001, (1 - flashProgress) * (1.65 + time * 2.2));
      core.current.scale.setScalar(coreScale);
      core.current.rotation.set(time * 3.4, time * 2.2, time * 4.1);
    }
    if (coreMaterial.current) {
      coreMaterial.current.opacity = Math.max(0, 1 - flashProgress ** 0.7);
    }
    if (coreOuterMaterial.current) {
      coreOuterMaterial.current.opacity = Math.max(
        0,
        0.72 * (1 - flashProgress),
      );
    }

    if (light.current) {
      light.current.intensity =
        52 * Math.max(0, 1 - time / 0.38) ** 1.7;
    }

    if (time >= VOXEL_LIFE && !done.current) {
      done.current = true;
      onDone(explosion.id);
    }
  });

  return (
    <group position={[...explosion.position]}>
      <instancedMesh
        ref={mesh}
        args={[geometry, voxelMaterial, VOXEL_COUNT]}
        frustumCulled={false}
      />
      <group ref={core} scale={0.01}>
        <mesh rotation={[0.24, 0.42, 0.12]}>
          <boxGeometry args={[0.92, 0.92, 0.92]} />
          <meshBasicMaterial
            ref={coreMaterial}
            color="#fff8cf"
            transparent
            opacity={1}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-0.36, 0.18, 0.62]} scale={0.72}>
          <boxGeometry args={[1.35, 0.82, 1.12]} />
          <meshBasicMaterial
            ref={coreOuterMaterial}
            color="#ff9f32"
            transparent
            opacity={0.72}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <pointLight ref={light} color="#ffb04a" distance={16} decay={2} />
    </group>
  );
}

function DustBurst({
  burst,
  onDone,
}: {
  burst: ImpactBurstDefinition;
  onDone: (id: number) => void;
}) {
  const group = useRef<Group>(null);
  const material = useRef<PointsMaterial>(null);
  const elapsed = useRef(0);
  const done = useRef(false);
  const profile = materialRuntimeProfiles[burst.material];
  const positions = useMemo(() => {
    const particleCount = profile.debrisCount * 4;
    const values = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (index / particleCount) * Math.PI * 2;
      const radius = 0.13 + ((index * 17) % 11) * 0.024;
      values[index * 3] = Math.cos(angle) * radius;
      values[index * 3 + 1] = ((index * 7) % 13) * 0.025 - 0.12;
      values[index * 3 + 2] = Math.sin(angle) * radius;
    }

    return values;
  }, [profile.debrisCount]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const progress = elapsed.current / 0.82;

    if (group.current) {
      group.current.scale.setScalar(0.5 + progress * 2.6);
      group.current.position.y += delta * 0.16;
      group.current.rotation.y += delta * 0.8;
    }

    if (material.current) {
      material.current.opacity = Math.max(0, 0.72 * (1 - progress));
    }

    if (elapsed.current >= 0.9 && !done.current) {
      done.current = true;
      onDone(burst.id);
    }
  });

  return (
    <group ref={group} position={[...burst.position]}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={material}
          color={profile.dustColor}
          size={burst.material === "plaster" ? 0.075 : 0.065}
          sizeAttenuation
          transparent
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function OpenWorldShell({
  scene,
}: {
  scene: DestructionSceneDefinition;
}) {
  const [centerX, centerZ] = scene.worldCenter;
  const [halfX, halfZ] = scene.worldHalfExtents;
  const wallHalfHeight = 80;
  const wallY = scene.safetyFloorY + wallHalfHeight;
  const circularSegments = scene.worldRadius
    ? Math.max(32, Math.ceil((Math.PI * 2 * scene.worldRadius) / 11))
    : 0;
  const circularSegmentLength = scene.worldRadius
    ? 2 * scene.worldRadius * Math.sin(Math.PI / circularSegments) + 0.5
    : 0;

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[halfX, 0.12, halfZ]}
        position={[centerX, scene.safetyFloorY, centerZ]}
        friction={1}
      />
      {scene.worldRadius
        ? Array.from({ length: circularSegments }, (_, index) => {
            const angle = (index / circularSegments) * Math.PI * 2;
            return (
              <CuboidCollider
                key={`world-ring:${index}`}
                args={[circularSegmentLength / 2, wallHalfHeight, 0.18]}
                position={[
                  centerX + Math.cos(angle) * scene.worldRadius!,
                  wallY,
                  centerZ + Math.sin(angle) * scene.worldRadius!,
                ]}
                rotation={[0, -angle - Math.PI / 2, 0]}
              />
            );
          })
        : (
            <>
              <CuboidCollider
                args={[0.12, wallHalfHeight, halfZ]}
                position={[centerX - halfX, wallY, centerZ]}
              />
              <CuboidCollider
                args={[0.12, wallHalfHeight, halfZ]}
                position={[centerX + halfX, wallY, centerZ]}
              />
              <CuboidCollider
                args={[halfX, wallHalfHeight, 0.12]}
                position={[centerX, wallY, centerZ - halfZ]}
              />
              <CuboidCollider
                args={[halfX, wallHalfHeight, 0.12]}
                position={[centerX, wallY, centerZ + halfZ]}
              />
            </>
          )}
    </RigidBody>
  );
}

interface OpenWorldSceneProps {
  scene: DestructionSceneDefinition;
  active: boolean;
  flightMode: boolean;
  weapon: WeaponName;
  timeOfDay: TimeOfDay;
  fallbackLook: boolean;
  controlRequest: number;
  mobileControls: MobileControlsRef;
  mobileActions: MutableRefObject<MobileActionBridge>;
  resetVersion: number;
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  onBrokenCountChange: (count: number) => void;
  onDynamicBodyCountChange: (count: number) => void;
}

function OpenWorldScene({
  scene,
  active,
  flightMode,
  weapon,
  timeOfDay,
  fallbackLook,
  controlRequest,
  mobileControls,
  mobileActions,
  resetVersion,
  onActiveChange,
  onFallbackChange,
  onBrokenCountChange,
  onDynamicBodyCountChange,
}: OpenWorldSceneProps) {
  const {
    breakablePieceById,
    breakablePieces,
    fractureLocallyAt,
    lampDefinitions,
    settleAfterBreak,
    structuralScopeFor,
  } = scene;
  const pieceSpatialIndex = useMemo(
    () => createSpatialIndex(breakablePieces, 5),
    [breakablePieces],
  );
  const maxPieceBoundingRadius = useMemo(
    () =>
      breakablePieces.reduce(
        (maximum, piece) =>
          Math.max(
            maximum,
            Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2,
          ),
        0,
      ),
    [breakablePieces],
  );
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  const raycaster = useRef(new Raycaster());
  const center = useMemo(() => new Vector2(0, 0), []);
  const [brokenPieces, setBrokenPieces] = useState<ReadonlySet<string>>(
    () => settleAfterBreak(new Set()),
  );
  const [swing, setSwing] = useState<SwingDefinition>({
    id: 0,
    reach: 1.1,
  });
  const [launcherKick, setLauncherKick] = useState(0);
  const [bursts, setBursts] = useState<readonly ImpactBurstDefinition[]>([]);
  const [shards, setShards] = useState<readonly ShardDefinition[]>([]);
  const [shatteredPieces, setShatteredPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [grenades, setGrenades] = useState<readonly GrenadeDefinition[]>([]);
  const [explosions, setExplosions] = useState<
    readonly VoxelExplosionDefinition[]
  >([]);
  const [remnants, setRemnants] = useState<readonly RemnantDefinition[]>([]);
  const [carvedPieces, setCarvedPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [tracers, setTracers] = useState<readonly TracerDefinition[]>([]);
  const brokenPiecesRef = useRef<ReadonlySet<string>>(brokenPieces);
  const nightRef = useRef(0);
  const breakableRaycastRoot = useRef<Group>(null);
  const pieceBodies = useRef(new Map<string, RapierRigidBody>());
  const dynamicBodies = useRef(new Map<string, RapierRigidBody>());
  const pendingBodyActions = useRef(new Map<string, BodyAction[]>());
  const preStepMotions = useRef(new Map<string, ImpactMotion>());
  const debrisSoundByBody = useRef(new Map<string, number>());
  const lastContactAt = useRef(new Map<string, number>());
  const contactDamageAfter = useRef(new Map<string, number>());
  const dynamicStartedAt = useRef(new Map<string, number>());
  const restCounters = useRef(new Map<string, number>());
  const settleAccumulator = useRef(0);
  const strikeTimers = useRef<number[]>([]);
  const shardsRef = useRef<readonly ShardDefinition[]>([]);
  const shardById = useRef(new Map<string, ShardDefinition>());
  const shardCounter = useRef(0);
  const impactShatterTimes = useRef<number[]>([]);
  const chipTimes = useRef<number[]>([]);
  const remnantsRef = useRef<readonly RemnantDefinition[]>([]);
  const remnantById = useRef(new Map<string, RemnantDefinition>());
  const remnantCounter = useRef(0);
  const remainingVolumeRef = useRef(new Map<string, number>());
  const carvedPiecesRef = useRef(new Set<string>());
  const tracerId = useRef(0);
  const firing = useRef(false);
  const fireAccumulator = useRef(0);
  const mgShots = useRef(0);
  const burstId = useRef(0);
  const impactId = useRef(0);
  const explosionId = useRef(0);
  const grenadeId = useRef(0);
  const lastGrenadeTime = useRef(0);
  const lastRocketTime = useRef(0);
  const previousReset = useRef(resetVersion);
  const shadowInvalidation = useRef(1);
  const appliedShadowInvalidation = useRef(0);

  const intersectBreakables = useCallback(
    (maximumDistance: number) => {
      const root = breakableRaycastRoot.current;
      if (!root) {
        return [];
      }
      raycaster.current.far = maximumDistance;
      return raycaster.current.intersectObject(root, true);
    },
    [],
  );

  const registerBody = useCallback(
    (id: string, body: RapierRigidBody | null) => {
      if (body) {
        pieceBodies.current.set(id, body);
        if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
          dynamicBodies.current.set(id, body);
          if (!dynamicStartedAt.current.has(id)) {
            const now = performance.now();
            dynamicStartedAt.current.set(id, now);
            if (!contactDamageAfter.current.has(id)) {
              contactDamageAfter.current.set(id, now + 400);
            }
          }
        } else {
          dynamicBodies.current.delete(id);
          dynamicStartedAt.current.delete(id);
        }
        const pending = pendingBodyActions.current.get(id);
        if (pending) {
          pendingBodyActions.current.delete(id);
          for (const action of pending) {
            action(body);
          }
        }
      } else {
        pieceBodies.current.delete(id);
        dynamicBodies.current.delete(id);
        preStepMotions.current.delete(id);
        debrisSoundByBody.current.delete(id);
        lastContactAt.current.delete(id);
        contactDamageAfter.current.delete(id);
        dynamicStartedAt.current.delete(id);
      }
    },
    [rapier],
  );

  const withBody = useCallback((id: string, action: BodyAction) => {
    const body = pieceBodies.current.get(id);
    if (body) {
      action(body);
      return;
    }

    const pending = pendingBodyActions.current.get(id);
    if (pending) {
      pending.push(action);
    } else {
      pendingBodyActions.current.set(id, [action]);
    }
  }, []);

  useBeforePhysicsStep(() => {
    for (const [id, body] of dynamicBodies.current) {
      if (body.isSleeping()) {
        preStepMotions.current.delete(id);
        continue;
      }

      const linear = body.linvel();
      const angular = body.angvel();
      preStepMotions.current.set(id, {
        linear: { x: linear.x, y: linear.y, z: linear.z },
        angular: { x: angular.x, y: angular.y, z: angular.z },
      });
    }
  });

  const ensureDynamic = useCallback(
    (id: string, body: RapierRigidBody) => {
      if (body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      dynamicBodies.current.set(id, body);
      dynamicStartedAt.current.set(id, performance.now());
    },
    [rapier],
  );

  const configureDebrisCollision = useCallback(
    (id: string, body: RapierRigidBody) => {
      const source =
        shardById.current.get(id) ??
        remnantById.current.get(id) ??
        breakablePieceById.get(id);
      if (!source) {
        return;
      }

      const tuning = debrisCollisionTuning(source.size);
      body.enableCcd(tuning.hardCcd);
      body.setSoftCcdPrediction(tuning.softCcdPrediction);
    },
    [],
  );

  useEffect(
    () => () => {
      for (const timer of strikeTimers.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  useEffect(() => {
    onBrokenCountChange(brokenPiecesRef.current.size);
    onDynamicBodyCountChange(dynamicBodies.current.size);
  }, [onBrokenCountChange, onDynamicBodyCountChange]);

  useEffect(() => {
    shadowInvalidation.current += 1;
  }, [
    brokenPieces,
    carvedPieces,
    resetVersion,
    shatteredPieces,
  ]);

  useFrame((frameState) => {
    if (appliedShadowInvalidation.current === shadowInvalidation.current) {
      return;
    }
    appliedShadowInvalidation.current = shadowInvalidation.current;
    frameState.gl.shadowMap.needsUpdate = true;
  });

  useEffect(() => {
    if (previousReset.current === resetVersion) {
      return;
    }

    previousReset.current = resetVersion;
    const settled = settleAfterBreak(new Set());
    brokenPiecesRef.current = settled;
    setBrokenPieces(settled);
    setBursts([]);
    setShards([]);
    setShatteredPieces(new Set());
    shardsRef.current = [];
    shardById.current.clear();
    setRemnants([]);
    setCarvedPieces(new Set());
    setTracers([]);
    remnantsRef.current = [];
    remnantById.current.clear();
    remainingVolumeRef.current.clear();
    carvedPiecesRef.current.clear();
    firing.current = false;
    setGrenades([]);
    setExplosions([]);
    restCounters.current.clear();
    preStepMotions.current.clear();
    debrisSoundByBody.current.clear();
    lastContactAt.current.clear();
    contactDamageAfter.current.clear();
    dynamicStartedAt.current.clear();
    pendingBodyActions.current.clear();
    impactShatterTimes.current = [];
    chipTimes.current = [];
    for (const timer of strikeTimers.current) {
      window.clearTimeout(timer);
    }
    strikeTimers.current = [];
    onBrokenCountChange(settled.size);
  }, [onBrokenCountChange, resetVersion]);

  // Put settled debris to sleep and drop CCD so a big mess stays cheap.
  useFrame((_, delta) => {
    settleAccumulator.current += delta;
    if (settleAccumulator.current < 0.45) {
      return;
    }
    settleAccumulator.current = 0;
    onDynamicBodyCountChange(dynamicBodies.current.size);

    for (const [id, body] of dynamicBodies.current) {
      if (
        id === "player" ||
        body.isSleeping()
      ) {
        continue;
      }

      const linvel = body.linvel();
      const angvel = body.angvel();
      const energy =
        linvel.x * linvel.x +
        linvel.y * linvel.y +
        linvel.z * linvel.z +
        0.3 * (angvel.x * angvel.x + angvel.y * angvel.y + angvel.z * angvel.z);
      const dynamicAge =
        performance.now() - (dynamicStartedAt.current.get(id) ?? 0);

      if (energy < 0.035 || (dynamicAge > 4500 && energy < 0.28)) {
        let hasPhysicalContact = false;
        for (
          let colliderIndex = 0;
          colliderIndex < body.numColliders() && !hasPhysicalContact;
          colliderIndex += 1
        ) {
          world.contactPairsWith(body.collider(colliderIndex), () => {
            hasPhysicalContact = true;
          });
        }
        const requiredSamples = debrisSleepSampleRequirement(
          energy,
          dynamicAge,
          hasPhysicalContact,
        );
        if (requiredSamples === null) {
          restCounters.current.delete(id);
          continue;
        }

        const count = (restCounters.current.get(id) ?? 0) + 1;
        if (count >= requiredSamples) {
          body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          body.enableCcd(false);
          body.sleep();
          restCounters.current.delete(id);
        } else {
          restCounters.current.set(id, count);
        }
      } else {
        restCounters.current.delete(id);
      }
    }
  });

  const settleStructure = useCallback(
    (seedBroken: ReadonlySet<string>): ReadonlySet<string> => {
      const scopeSeeds = new Set<string>([
        ...seedBroken,
        ...carvedPiecesRef.current,
        ...remnantsRef.current.map((remnant) => remnant.parentId),
      ]);
      const structuralScope = structuralScopeFor(scopeSeeds);
      let result = resolveRuntimeStructure(
        breakablePieces,
        structuralMaterialProfiles,
        seedBroken,
        carvedPiecesRef.current,
        remnantsRef.current,
        structuralScope,
      );
      const sectionFailures = new Set(result.brokenPieceIds);

      for (const parentId of carvedPiecesRef.current) {
        if (sectionFailures.has(parentId)) {
          continue;
        }
        const parent = breakablePieceById.get(parentId);
        if (!parent) {
          continue;
        }
        if (groundMaterials.has(parent.material)) {
          continue;
        }

        const originalVolume =
          parent.size[0] * parent.size[1] * parent.size[2];
        const stableVolume = remnantsRef.current
          .filter(
            (remnant) =>
              remnant.parentId === parentId &&
              !result.detachedFragmentIds.has(remnant.id),
          )
          .reduce(
            (total, remnant) =>
              total +
              (remnant.volume ??
                remnant.size[0] *
                  remnant.size[1] *
                  remnant.size[2]),
            0,
          );
        if (stableVolume < originalVolume * VOLUME_BREAK_FRACTION) {
          sectionFailures.add(parentId);
        }
      }

      if (sectionFailures.size > result.brokenPieceIds.size) {
        result = resolveRuntimeStructure(
          breakablePieces,
          structuralMaterialProfiles,
          sectionFailures,
          carvedPiecesRef.current,
          remnantsRef.current,
          structuralScope,
        );
      }
      let remnantsChanged = false;
      const updatedRemnants = remnantsRef.current.map((remnant) => {
        if (
          remnant.detached ||
          !result.detachedFragmentIds.has(remnant.id)
        ) {
          return remnant;
        }

        remnantsChanged = true;
        return { ...remnant, detached: true };
      });

      if (remnantsChanged) {
        remnantsRef.current = updatedRemnants;
        remnantById.current = new Map(
          updatedRemnants.map((remnant) => [remnant.id, remnant]),
        );
        setRemnants(updatedRemnants);
      }

      brokenPiecesRef.current = result.brokenPieceIds;
      setBrokenPieces(result.brokenPieceIds);
      onBrokenCountChange(result.brokenPieceIds.size);
      return result.brokenPieceIds;
    },
    [onBrokenCountChange],
  );

  const breakAt = useCallback(
    (target: BreakablePieceDefinition, currentImpact: number) => {
      const next = fractureLocallyAt(
        target,
        brokenPiecesRef.current,
        currentImpact,
      );
      settleStructure(next);
    },
    [settleStructure],
  );

  const applyImpact = useCallback(
    (
      pieceId: string,
      material: BreakableMaterial,
      point: Vector3,
      direction: Vector3,
      power = 1,
    ) => {
      if (
        breakablePieceById.has(pieceId) &&
        !brokenPiecesRef.current.has(pieceId) &&
        !pieceBodies.current.has(pieceId)
      ) {
        return;
      }

      const profile = materialRuntimeProfiles[material];
      withBody(pieceId, (body) => {
        ensureDynamic(pieceId, body);
        configureDebrisCollision(pieceId, body);
        body.wakeUp();

        const mass = Math.max(0.04, body.mass());
        const strikeSpeed = profile.impulse * 1.5 * power;
        body.applyImpulseAtPoint(
          {
            x: direction.x * strikeSpeed * mass,
            y: (direction.y * strikeSpeed + profile.lift) * mass,
            z: direction.z * strikeSpeed * mass,
          },
          {
            x: point.x,
            y: point.y,
            z: point.z,
          },
          true,
        );
        body.applyTorqueImpulse(
          {
            x: -direction.z * profile.torque * mass,
            y:
              (point.x >= body.translation().x ? -1 : 1) *
              profile.torque *
              0.82 *
              mass,
            z: direction.x * profile.torque * mass,
          },
          true,
        );
      });
    },
    [configureDebrisCollision, ensureDynamic, withBody],
  );

  const commitShards = useCallback(
    (additions: readonly ShardDefinition[]) => {
      const contactReadyAt = performance.now() + 500;
      for (const shard of additions) {
        contactDamageAfter.current.set(shard.id, contactReadyAt);
      }
      const merged = [...shardsRef.current, ...additions];
      const trimmed = trimShardBudget(merged);
      shardsRef.current = trimmed;
      shardById.current = new Map(trimmed.map((shard) => [shard.id, shard]));
      setShards(trimmed);
    },
    [],
  );

  const commitRemnants = useCallback(
    (removeId: string | null, additions: readonly RemnantDefinition[]) => {
      const contactReadyAt = performance.now() + 500;
      for (const remnant of additions) {
        contactDamageAfter.current.set(remnant.id, contactReadyAt);
      }
      const filtered = removeId
        ? remnantsRef.current.filter((remnant) => remnant.id !== removeId)
        : remnantsRef.current;
      const nextList =
        additions.length > 0 ? [...filtered, ...additions] : filtered;
      remnantsRef.current = nextList;
      remnantById.current = new Map(
        nextList.map((remnant) => [remnant.id, remnant]),
      );
      setRemnants(nextList);
    },
    [],
  );

  // Track how much of a piece's volume is still standing; returns true when
  // it drops below the structural threshold and the piece must give way.
  const subtractParentVolume = useCallback(
    (parentId: string, volume: number): boolean => {
      if (brokenPiecesRef.current.has(parentId)) {
        return false;
      }
      const parent = breakablePieceById.get(parentId);
      if (!parent) {
        return false;
      }
      if (groundMaterials.has(parent.material)) {
        return false;
      }

      const original = parent.size[0] * parent.size[1] * parent.size[2];
      const remaining =
        (remainingVolumeRef.current.get(parentId) ?? original) - volume;
      remainingVolumeRef.current.set(parentId, remaining);
      return remaining < original * VOLUME_BREAK_FRACTION;
    },
    [],
  );

  const breakPieces = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) {
        return;
      }

      const next = new Set(brokenPiecesRef.current);
      for (const id of ids) {
        next.add(id);
      }
      settleStructure(next);
    },
    [settleStructure],
  );

  // Replace a whole box body with real sub-boxes of the same object,
  // preserving its current pose and motion.
  const shatterTarget = useCallback(
    (
      source: ShardSource,
      origin: "piece" | "shard" | "remnant",
      burstCenter: Vector3 | null,
      burstSpeed: number,
      cause: FractureCause = "impact",
    ): boolean => {
      const body = pieceBodies.current.get(source.id);
      const staticPiece =
        origin === "piece" ? breakablePieceById.get(source.id) : undefined;
      if (!body && !staticPiece) {
        return false;
      }

      const translation = body?.translation();
      const rotation = body?.rotation();
      const linearVelocity = body?.linvel();
      const angularVelocity = body?.angvel();
      const bodyPosition = translation
        ? new Vector3(translation.x, translation.y, translation.z)
        : new Vector3(...staticPiece!.position);
      const bodyQuaternion = rotation
        ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        : new Quaternion().setFromEuler(
            new Euler(
              staticPiece!.rotation?.[0] ?? 0,
              staticPiece!.rotation?.[1] ?? 0,
              staticPiece!.rotation?.[2] ?? 0,
            ),
          );
      const bodyLinearVelocity = linearVelocity
        ? new Vector3(
            linearVelocity.x,
            linearVelocity.y,
            linearVelocity.z,
          )
        : new Vector3();
      const bodyAngularVelocity = angularVelocity
        ? new Vector3(
            angularVelocity.x,
            angularVelocity.y,
            angularVelocity.z,
          )
        : new Vector3();

      shardCounter.current += 1;
      const generated = buildShards(
        source,
        `shard:${shardCounter.current}`,
        bodyPosition,
        bodyQuaternion,
        bodyLinearVelocity,
        bodyAngularVelocity,
        burstCenter ?? bodyPosition,
        burstSpeed,
        cause,
      );
      if (!generated) {
        return false;
      }

      if (origin === "shard") {
        shardsRef.current = shardsRef.current.filter(
          (shard) => shard.id !== source.id,
        );
      } else if (origin === "remnant") {
        commitRemnants(source.id, []);
      } else {
        setShatteredPieces((current) => {
          const next = new Set(current);
          next.add(source.id);
          return next;
        });
      }
      commitShards(generated);
      return true;
    },
    [commitRemnants, commitShards],
  );

  // Carve a chunk out of a MOVING body: same blocky hole geometry as for a
  // standing piece, but the remainder keeps flying as dynamic pieces with the
  // body's inherited motion — a lying block no longer bursts into crumbs.
  const carveLooseTarget = useCallback(
    (
      source: ShardSource,
      origin: "piece" | "shard" | "remnant",
      worldPoint: Vector3,
      radius: number,
      burstSpeed: number,
      direction?: Vector3,
      penetration?: number,
    ): boolean => {
      const body = pieceBodies.current.get(source.id);
      if (!body) {
        return false;
      }

      const translation = body.translation();
      const rotation = body.rotation();
      const linearVelocity = body.linvel();
      const angularVelocity = body.angvel();
      const bodyPosition = new Vector3(
        translation.x,
        translation.y,
        translation.z,
      );
      const bodyQuaternion = new Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      shardCounter.current += 1;
      const salt = `loose:${shardCounter.current}`;
      const result = damageBody(
        source,
        {
          position: bodyPosition,
          quaternion: bodyQuaternion,
          linearVelocity: new Vector3(
            linearVelocity.x,
            linearVelocity.y,
            linearVelocity.z,
          ),
          angularVelocity: new Vector3(
            angularVelocity.x,
            angularVelocity.y,
            angularVelocity.z,
          ),
        },
        {
          idPrefix: salt,
          worldPoint,
          radius,
          burstSpeed,
          direction,
          penetration,
        },
      );
      if (!result) {
        return false;
      }

      const baseLinear = new Vector3(
        linearVelocity.x,
        linearVelocity.y,
        linearVelocity.z,
      );
      const generated: ShardDefinition[] = [...result.fragments];

      // a couple of chips fly out of the removed volume
      for (let index = 0; index < 2; index += 1) {
        shardCounter.current += 1;
        const id = `shard:lc${shardCounter.current}`;
        const noiseA = blastNoise(id, 13);
        const side = MathUtils.clamp(radius * (0.3 + noiseA * 0.25), 0.045, 0.11);
        generated.push({
          id,
          material: source.material,
          color: source.color,
          size: [side, side, side],
          position: [
            worldPoint.x + (noiseA - 0.5) * 0.08,
            worldPoint.y + 0.04 + index * 0.05,
            worldPoint.z + (0.5 - noiseA) * 0.08,
          ],
          quaternion: [0, 0, 0, 1],
          linearVelocity: [
            baseLinear.x + (noiseA - 0.5) * 2.2,
            baseLinear.y + 1.0 + noiseA,
            baseLinear.z + (0.5 - noiseA) * 2.2,
          ],
          angularVelocity: [(noiseA - 0.5) * 12, noiseA * 8, (0.5 - noiseA) * 12],
        });
      }

      if (origin === "piece") {
        setShatteredPieces((current) => {
          const next = new Set(current);
          next.add(source.id);
          return next;
        });
      } else if (origin === "shard") {
        shardsRef.current = shardsRef.current.filter(
          (shard) => shard.id !== source.id,
        );
        shardById.current.delete(source.id);
      } else {
        commitRemnants(source.id, []);
      }
      commitShards(generated);

      burstId.current += 1;
      const nextBurstId = burstId.current;
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId,
          position: [worldPoint.x, worldPoint.y, worldPoint.z],
          direction: [0, 1, 0],
          material: source.material,
        },
      ]);
      playDebrisSound(source.material, 0.5);
      return true;
    },
    [commitRemnants, commitShards],
  );

  // Knock a corner chip off a moving body at the point that struck: the
  // impact direction picks the corner, the carve does the rest.
  const chipAtImpact = useCallback(
    (
      source: ShardSource,
      origin: "piece" | "shard" | "remnant",
      forceDirection: { x: number; y: number; z: number },
      intensity: number,
    ): boolean => {
      const body = pieceBodies.current.get(source.id);
      if (!body) {
        return false;
      }

      const translation = body.translation();
      const rotation = body.rotation();
      const quaternion = new Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      const direction = new Vector3(
        forceDirection.x,
        forceDirection.y,
        forceDirection.z,
      );
      if (direction.lengthSq() < 1e-6) {
        direction.set(0, 1, 0);
      }
      direction.normalize();

      const localDirection = direction
        .clone()
        .applyQuaternion(quaternion.clone().invert())
        .negate();
      const corner = new Vector3(
        Math.sign(localDirection.x || 1) * source.size[0] * 0.46,
        Math.sign(localDirection.y || 1) * source.size[1] * 0.46,
        Math.sign(localDirection.z || 1) * source.size[2] * 0.46,
      )
        .applyQuaternion(quaternion)
        .add(new Vector3(translation.x, translation.y, translation.z));

      const radius = MathUtils.clamp(0.09 + intensity * 0.11, 0.11, 0.24);
      return carveLooseTarget(source, origin, corner, radius, 1.1);
    },
    [carveLooseTarget],
  );

  // Carve a blocky hole out of a standing (fixed) piece or remnant, leaving
  // the rest of it in place — Teardown-style holes in walls and fences.
  const carveAt = useCallback(
    (
      targetId: string,
      worldPoint: Vector3,
      radius: number,
      pushDirection: Vector3 | null,
    ): { carved: boolean; brokenParentId: string | null } => {
      const remnant = remnantById.current.get(targetId);
      const piece = remnant ? undefined : breakablePieceById.get(targetId);
      const source = remnant ?? piece;
      if (!source) {
        return { carved: false, brokenParentId: null };
      }
      const isGroundTarget = groundMaterials.has(source.material);

      const body = pieceBodies.current.get(targetId);
      if (
        body &&
        body.bodyType() !== rapier.RigidBodyType.Fixed
      ) {
        return { carved: false, brokenParentId: null };
      }
      if (!body && (!piece || brokenPiecesRef.current.has(piece.id))) {
        return { carved: false, brokenParentId: null };
      }

      const parentId = remnant ? remnant.parentId : targetId;
      const translation = body?.translation();
      const rotation = body?.rotation();
      const bodyPosition = translation
        ? new Vector3(translation.x, translation.y, translation.z)
        : new Vector3(...piece!.position);
      const bodyQuaternion = rotation
        ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        : new Quaternion().setFromEuler(
            new Euler(
              piece!.rotation?.[0] ?? 0,
              piece!.rotation?.[1] ?? 0,
              piece!.rotation?.[2] ?? 0,
            ),
          );
      remnantCounter.current += 1;
      const carveSalt = `carve:${remnantCounter.current}`;
      const result = damageBody(
        source,
        {
          position: bodyPosition,
          quaternion: bodyQuaternion,
          linearVelocity: new Vector3(),
          angularVelocity: new Vector3(),
        },
        {
          idPrefix: carveSalt,
          worldPoint,
          radius,
          burstSpeed: 0,
          direction: pushDirection ?? undefined,
          penetration: pushDirection
            ? Math.min(0.85, Math.hypot(...source.size))
            : undefined,
        },
      );
      if (!result) {
        return { carved: false, brokenParentId: null };
      }
      const sourceVolume =
        (remnant?.volume ?? source.size[0] * source.size[1] * source.size[2]);

      const additions = result.fragments.map((fragment): RemnantDefinition => {
        remnantCounter.current += 1;
        return {
          id: `remnant:${remnantCounter.current}`,
          parentId,
          material: source.material,
          color: source.color,
          size: fragment.size,
          position: fragment.position,
          quaternion: fragment.quaternion,
          detached: false,
          voxelBody: fragment.voxelBody,
          boxes: fragment.boxes,
          volume: fragment.volume,
        };
      });
      if (
        isGroundTarget &&
        (additions.length === 0 || result.removedVolume > sourceVolume * 0.38)
      ) {
        return { carved: false, brokenParentId: null };
      }

      if (remnant) {
        commitRemnants(remnant.id, additions);
      } else {
        commitRemnants(null, additions);
        carvedPiecesRef.current.add(targetId);
        setCarvedPieces((current) => {
          const next = new Set(current);
          next.add(targetId);
          return next;
        });
      }

      // The removed material flies off as a few small chips.
      const debris: ShardDefinition[] = [];
      for (let index = 0; index < 3; index += 1) {
        shardCounter.current += 1;
        const id = `shard:c${shardCounter.current}`;
        const noiseA = blastNoise(id, 13);
        const noiseB = blastNoise(id, 17);
        const side = MathUtils.clamp(radius * (0.3 + noiseA * 0.3), 0.045, 0.13);
        debris.push({
          id,
          material: source.material,
          color: source.color,
          size: [side, side * (0.8 + noiseB * 0.5), side],
          position: [
            worldPoint.x + (noiseA - 0.5) * 0.1,
            worldPoint.y + (noiseB - 0.5) * 0.1,
            worldPoint.z + (noiseA - noiseB) * 0.1,
          ],
          quaternion: [0, 0, 0, 1],
          linearVelocity: [
            (pushDirection?.x ?? 0) * 3 + (noiseA - 0.5) * 2.4,
            1.1 + noiseB * 1.5,
            (pushDirection?.z ?? 0) * 3 + (noiseB - 0.5) * 2.4,
          ],
          angularVelocity: [
            (noiseA - 0.5) * 14,
            (noiseB - 0.5) * 14,
            (noiseA - noiseB) * 10,
          ],
        });
      }
      commitShards(debris);

      burstId.current += 1;
      const nextBurstId = burstId.current;
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId,
          position: [worldPoint.x, worldPoint.y, worldPoint.z],
          direction: [0, 1, 0],
          material: source.material,
        },
      ]);
      playDebrisSound(source.material, 0.5);

      const crossed = isGroundTarget
        ? false
        : subtractParentVolume(parentId, result.removedVolume);
      return { carved: true, brokenParentId: crossed ? parentId : null };
    },
    [commitRemnants, commitShards, rapier, subtractParentVolume],
  );

  // Original pieces and carved remnants are solved by the same load-path graph.
  // Rapier only receives the fragments that this structural pass releases.
  const settleWorld = useCallback(() => {
    settleStructure(brokenPiecesRef.current);
  }, [settleStructure]);

  const fireRound = useCallback(() => {
    playGunshotSound();
    mgShots.current += 1;

    const direction = camera.getWorldDirection(new Vector3());
    direction.x += (Math.random() - 0.5) * 0.024;
    direction.y += (Math.random() - 0.5) * 0.024;
    direction.z += (Math.random() - 0.5) * 0.024;
    direction.normalize();
    raycaster.current.set(camera.position, direction);
    const intersections = intersectBreakables(MG_RANGE);
    const hit = intersections.find(
      (intersection) =>
        readBreakableHit(intersection) !== null &&
        intersection.distance <= MG_RANGE,
    );

    const muzzle = new Vector3(0.36, -0.26, -0.8)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const end = hit
      ? hit.point
      : camera.position.clone().add(direction.clone().multiplyScalar(MG_RANGE));
    tracerId.current += 1;
    const nextTracerId = tracerId.current;
    setTracers((current) => [
      ...current.slice(-8),
      {
        id: nextTracerId,
        from: [muzzle.x, muzzle.y, muzzle.z],
        to: [end.x, end.y, end.z],
      },
    ]);

    if (!hit) {
      return;
    }

    const hitData = readBreakableHit(hit);
    if (!hitData) {
      return;
    }
    const { pieceId, shardId, remnantId } = hitData;
    const piece = pieceId ? breakablePieceById.get(pieceId) : undefined;
    const material =
      piece?.material ??
      hitData.material;
    const targetId = pieceId ?? shardId ?? remnantId;

    if (!targetId || !material) {
      return;
    }

    const point = hit.point.clone();

    if (material === "steel") {
      // Bullets don't pierce steel — sparks and a shove.
      burstId.current += 1;
      const nextBurstId = burstId.current;
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId,
          position: [point.x, point.y, point.z],
          direction: [direction.x, direction.y, direction.z],
          material: "steel",
        },
      ]);
      playDebrisSound("steel", 0.6);
      applyImpact(targetId, material, point, direction, 0.35);
      return;
    }

    const holeRadius = bulletHoleRadius[material];
    const targetBroken = pieceId
      ? brokenPiecesRef.current.has(pieceId)
      : false;

    if (holeRadius && !targetBroken && (pieceId || remnantId)) {
      const carve = carveAt(targetId, point, holeRadius, direction);
      if (carve.carved) {
        const glassParentId =
          material === "glass"
            ? pieceId ??
              remnantById.current.get(targetId)?.parentId ??
              null
            : null;
        const brokenParentId =
          glassParentId ?? carve.brokenParentId;
        if (brokenParentId) {
          breakPieces([brokenParentId]);
        }
        settleWorld();
        return;
      }
    }

    // Displaced targets get the SAME carve geometry as standing ones: the
    // bullet bites a chunk out and the remainder keeps its motion.
    const looseRadius = bulletHoleRadius[material] ?? 0.2;
    if (piece) {
      if (!brokenPiecesRef.current.has(piece.id)) {
        impactId.current += 1;
        breakAt(piece, impactId.current);
      }
      if (
        carveLooseTarget(
          piece,
          "piece",
          point,
          looseRadius,
          1.6,
          direction,
          Math.min(0.85, Math.hypot(...piece.size)),
        )
      ) {
        settleWorld();
        return;
      }
    } else if (shardId) {
      const shardDefinition = shardById.current.get(shardId);
      if (
        shardDefinition &&
        carveLooseTarget(
          shardDefinition,
          "shard",
          point,
          looseRadius,
          1.4,
          direction,
          Math.min(0.85, Math.hypot(...shardDefinition.size)),
        )
      ) {
        return;
      }
    } else if (remnantId) {
      const remnantDefinition = remnantById.current.get(remnantId);
      if (remnantDefinition) {
        const wasStanding =
          !remnantDefinition.detached &&
          !brokenPiecesRef.current.has(remnantDefinition.parentId);
        if (!wasStanding) {
          if (
            carveLooseTarget(
              remnantDefinition,
              "remnant",
              point,
              looseRadius,
              1.4,
              direction,
              Math.min(0.85, Math.hypot(...remnantDefinition.size)),
            )
          ) {
            return;
          }
        } else if (shatterTarget(remnantDefinition, "remnant", point, 3)) {
          const volume =
            remnantDefinition.size[0] *
            remnantDefinition.size[1] *
            remnantDefinition.size[2];
          if (subtractParentVolume(remnantDefinition.parentId, volume)) {
            breakPieces([remnantDefinition.parentId]);
          }
          settleWorld();
          return;
        }
      }
    }

    applyImpact(targetId, material, point, direction, 0.4);
  }, [
    applyImpact,
    breakAt,
    breakPieces,
    camera,
    carveAt,
    carveLooseTarget,
    intersectBreakables,
    settleWorld,
    shatterTarget,
    subtractParentVolume,
  ]);

  const strikeEnd = useCallback(() => {
    firing.current = false;
  }, []);

  useEffect(() => {
    firing.current = false;
  }, [active, weapon]);

  // Automatic fire while the trigger is held.
  useFrame((_, delta) => {
    if (weapon !== "mg" || !firing.current) {
      fireAccumulator.current = 0;
      return;
    }

    fireAccumulator.current += delta;
    while (fireAccumulator.current >= MG_FIRE_INTERVAL) {
      fireAccumulator.current -= MG_FIRE_INTERVAL;
      fireRound();
    }
  });

  const explodeAt = useCallback(
    (center3: Vector3, kind: ExplosiveKind = "grenade") => {
      const isRocket = kind === "rocket";
      const blastRadius = isRocket ? ROCKET_BLAST_RADIUS : BLAST_RADIUS;
      const blastPushRadius = isRocket
        ? ROCKET_BLAST_PUSH_RADIUS
        : BLAST_PUSH_RADIUS;
      const energyAtDistance = isRocket
        ? rocketEnergyAtDistance
        : grenadeEnergyAtDistance;
      playExplosionSound();
      explosionId.current += 1;
      const nextExplosionId = explosionId.current;
      setExplosions((current) => [
        ...current,
        {
          id: nextExplosionId,
          position: [center3.x, center3.y, center3.z],
        },
      ]);
      burstId.current += 1;
      const nextBurstId = burstId.current;
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId,
          position: [center3.x, center3.y + 0.2, center3.z],
          direction: [0, 1, 0],
          material: "soil",
        },
      ]);

      const previousBroken = new Set(brokenPiecesRef.current);
      const blastCenter = [center3.x, center3.y, center3.z] as const;
      const blastPieceCandidates = pieceSpatialIndex.querySphere(
        blastCenter,
        blastRadius + maxPieceBoundingRadius,
      );

      const resolveBlastPose = (
        id: string,
        source: BlastOccluderSource,
      ) => {
        const body = pieceBodies.current.get(id);
        const translation = body?.translation();
        const rotation = body?.rotation();
        const position = translation
          ? new Vector3(translation.x, translation.y, translation.z)
          : new Vector3(...source.position);
        const quaternion = rotation
          ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
          : "quaternion" in source
            ? new Quaternion(...source.quaternion)
            : new Quaternion().setFromEuler(
                new Euler(
                  "rotation" in source ? source.rotation?.[0] ?? 0 : 0,
                  "rotation" in source ? source.rotation?.[1] ?? 0 : 0,
                  "rotation" in source ? source.rotation?.[2] ?? 0 : 0,
                ),
              );
        return { position, quaternion };
      };

      const solidOccluders: BlastOccluder[] = [
        ...blastPieceCandidates
          .filter(
            (piece) =>
              !previousBroken.has(piece.id) &&
              !carvedPiecesRef.current.has(piece.id),
          )
          .map((piece) => ({
            source: piece,
            id: piece.id,
            parentId: piece.id,
          })),
        ...remnantsRef.current.map((remnant) => ({
          source: remnant,
          id: remnant.id,
          parentId: remnant.parentId,
        })),
      ]
        .map((entry) => {
          const { position, quaternion } = resolveBlastPose(
            entry.id,
            entry.source,
          );
          const impactPoint = closestPointOnOrientedBox(
            center3,
            position,
            entry.source.size,
            quaternion,
          );
          return {
            id: entry.id,
            parentId: entry.parentId,
            material: entry.source.material,
            position,
            quaternion,
            size: entry.source.size,
            surfaceDistance: center3.distanceTo(impactPoint),
          };
        })
        .filter((entry) => entry.surfaceDistance <= blastRadius)
        .sort(
          (left, right) => left.surfaceDistance - right.surfaceDistance,
        );

      // Capture moving bodies before this blast creates a new generation.
      // Each body receives exactly one damage pass, regardless of whether it
      // started attached, falling or already settled on the ground.
      const looseBeforeBlast = [
        ...blastPieceCandidates
          .filter(
            (piece) =>
              pieceBodies.current.get(piece.id)?.bodyType() ===
              rapier.RigidBodyType.Dynamic,
          )
          .map((source) => ({
            source,
            origin: "piece" as const,
          })),
        ...shardsRef.current.map((source) => ({
          source,
          origin: "shard" as const,
        })),
        ...remnantsRef.current
          .filter(
            (source) =>
              pieceBodies.current.get(source.id)?.bodyType() ===
              rapier.RigidBodyType.Dynamic,
          )
          .map((source) => ({
            source,
            origin: "remnant" as const,
          })),
      ];

      // One physical blast: distance reduces delivered energy, then the shared
      // material fracture profile converts that energy into removed voxels.
      // Standing targets keep supported remnants; unsupported remnants become
      // debris through the same structural solver used everywhere else.
      const volumeBroken: string[] = [];
      const attachedDamageCandidates = [
        ...blastPieceCandidates
          .filter(
            (piece) => {
              const body = pieceBodies.current.get(piece.id);
              return (
                !previousBroken.has(piece.id) &&
                !carvedPiecesRef.current.has(piece.id) &&
                body?.bodyType() !== rapier.RigidBodyType.Dynamic
              );
            },
          )
          .map((piece) => ({
            targetId: piece.id,
            parentId: piece.id,
            source: piece,
          })),
        ...remnantsRef.current
          .filter(
            (remnant) =>
              pieceBodies.current.get(remnant.id)?.bodyType() ===
              rapier.RigidBodyType.Fixed,
          )
          .map((remnant) => ({
            targetId: remnant.id,
            parentId: remnant.parentId,
            source: remnant,
          })),
      ]
        .map((target) => {
            const { position, quaternion } = resolveBlastPose(
              target.targetId,
              target.source,
            );
            const impactPoint = closestPointOnOrientedBox(
              center3,
              position,
              target.source.size,
              quaternion,
            );
            const surfaceDistance = center3.distanceTo(impactPoint);
            const visibility = blastVisibilityFactor(
              center3,
              impactPoint,
              target.targetId,
              target.parentId,
              surfaceDistance,
              solidOccluders,
            );
            const energy = energyAtDistance(surfaceDistance) * visibility;
            return {
              ...target,
              impactPoint,
              surfaceDistance,
              visibility,
              energy,
            };
          })
          .filter(
            (entry) =>
              entry.energy >
              fractureEnergyByMaterial[entry.source.material] * 1.15,
          )
          .sort(
            (left, right) =>
              left.surfaceDistance - right.surfaceDistance,
          )
          .slice(0, 80);

      for (const entry of attachedDamageCandidates) {
        const damageRadius = impactDamageRadius(
          entry.source,
          "blast",
          entry.energy,
        );
        const carve = carveAt(
          entry.targetId,
          entry.impactPoint,
          damageRadius,
          null,
        );
        if (carve.brokenParentId) {
          volumeBroken.push(carve.brokenParentId);
        }
        if (carve.carved && entry.source.material === "glass") {
          volumeBroken.push(entry.parentId);
        }
      }

      const damagedNow = new Set<string>();
      const looseDamageCandidates = looseBeforeBlast
        .map((entry) => {
          const body = pieceBodies.current.get(entry.source.id);
          if (!body) {
            return null;
          }
          const translation = body.translation();
          const rotation = body.rotation();
          const position = new Vector3(
            translation.x,
            translation.y,
            translation.z,
          );
          const quaternion = new Quaternion(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w,
          );
          const impactPoint = closestPointOnOrientedBox(
            center3,
            position,
            entry.source.size,
            quaternion,
          );
          const surfaceDistance = center3.distanceTo(impactPoint);
          const parentId =
            entry.origin === "remnant"
              ? entry.source.parentId
              : entry.source.id;
          const visibility = blastVisibilityFactor(
            center3,
            impactPoint,
            entry.source.id,
            parentId,
            surfaceDistance,
            solidOccluders,
          );
          const energy = energyAtDistance(surfaceDistance) * visibility;
          return energy > fractureEnergyByMaterial[entry.source.material] * 0.95
            ? {
                ...entry,
                impactPoint,
                surfaceDistance,
                visibility,
                damageRadius: impactDamageRadius(
                  entry.source,
                  "blast",
                  energy,
                ),
                burstSpeed: Math.max(isRocket ? 7 : 3.5, energy * 0.72),
              }
            : null;
        })
        .filter(
          (
            entry,
          ): entry is NonNullable<typeof entry> => entry !== null,
        )
        .sort(
          (left, right) =>
            left.surfaceDistance - right.surfaceDistance,
        )
        .slice(0, 32);

      for (const entry of looseDamageCandidates) {
        if (
          carveLooseTarget(
            entry.source,
            entry.origin,
            entry.impactPoint,
            entry.damageRadius,
            entry.burstSpeed,
          )
        ) {
          damagedNow.add(entry.source.id);
        }
      }

      settleStructure(
        new Set([...previousBroken, ...volumeBroken]),
      );
      const finalBroken = brokenPiecesRef.current;
      const pushedIds = new Set<string>();

      const pushBody = (id: string, body: RapierRigidBody) => {
        if (damagedNow.has(id)) {
          return;
        }
        const translation = body.translation();
        const dx = translation.x - center3.x;
        const dy = translation.y - center3.y;
        const dz = translation.z - center3.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > blastPushRadius) {
          return;
        }

        const targetParentId = remnantById.current.get(id)?.parentId ?? id;
        const visibility = blastVisibilityFactor(
          center3,
          new Vector3(translation.x, translation.y, translation.z),
          id,
          targetParentId,
          distance,
          solidOccluders,
        );
        if (visibility < 0.04) {
          return;
        }

        const falloff = (1 - distance / blastPushRadius) * visibility;
        const inverse = 1 / Math.max(0.25, distance);
        const mass = Math.max(0.04, body.mass());

        if (id === "player") {
          body.applyImpulse(
            {
              x: dx * inverse * (isRocket ? 9.4 : 6.4) * falloff * mass,
              y:
                (dy * inverse + 0.8) *
                (isRocket ? 7.2 : 5.2) *
                falloff *
                mass,
              z: dz * inverse * (isRocket ? 9.4 : 6.4) * falloff * mass,
            },
            true,
          );
          return;
        }

        const isDynamic = body.bodyType() === rapier.RigidBodyType.Dynamic;
        if (!isDynamic && !finalBroken.has(id)) {
          return;
        }

        ensureDynamic(id, body);
        configureDebrisCollision(id, body);
        body.wakeUp();

        const speed = (isRocket ? 7.8 : 5.2) + (isRocket ? 10.5 : 6.5) * falloff;
        body.applyImpulse(
          {
            x: dx * inverse * speed * mass,
            y: (dy * inverse + 0.6) * speed * mass * 0.85,
            z: dz * inverse * speed * mass,
          },
          true,
        );
        body.applyTorqueImpulse(
          {
            x: dz * inverse * 0.4 * mass,
            y: dx * inverse * 0.5 * mass,
            z: -dx * inverse * 0.35 * mass,
          },
          true,
        );
      };

      for (const piece of pieceSpatialIndex.querySphere(
        blastCenter,
        blastPushRadius,
      )) {
        if (!finalBroken.has(piece.id) || damagedNow.has(piece.id)) {
          continue;
        }
        pushedIds.add(piece.id);
        withBody(piece.id, (body) => pushBody(piece.id, body));
      }

      for (const [id, body] of pieceBodies.current) {
        if (pushedIds.has(id)) {
          continue;
        }
        pushBody(id, body);
      }

      for (const remnant of remnantsRef.current) {
        if (!remnant.detached) {
          continue;
        }
        withBody(remnant.id, (body) => pushBody(remnant.id, body));
      }
    },
    [
      carveAt,
      carveLooseTarget,
      configureDebrisCollision,
      ensureDynamic,
      rapier,
      settleStructure,
      withBody,
    ],
  );

  const handleGrenadeExplode = useCallback(
    (id: number, kind: ExplosiveKind, x: number, y: number, z: number) => {
      setGrenades((current) => current.filter((grenade) => grenade.id !== id));
      explodeAt(new Vector3(x, y, z), kind);
    },
    [explodeAt],
  );

  const fireGrenade = useCallback(() => {
    const now = performance.now();
    if (now - lastGrenadeTime.current < 850) {
      return;
    }
    lastGrenadeTime.current = now;

    playLaunchSound();
    setLauncherKick((current) => current + 1);

    const direction = camera.getWorldDirection(new Vector3()).normalize();
    const origin = camera.position
      .clone()
      .add(direction.clone().multiplyScalar(0.9))
      .add(new Vector3(0, -0.12, 0));

    grenadeId.current += 1;
    const nextGrenadeId = grenadeId.current;
    setGrenades((current) => [
      ...current,
      {
        id: nextGrenadeId,
        kind: "grenade",
        position: [origin.x, origin.y, origin.z],
        velocity: [
          direction.x * 23,
          direction.y * 23 + 1.4,
          direction.z * 23,
        ],
      },
    ]);
  }, [camera]);

  const fireRocket = useCallback(() => {
    const now = performance.now();
    if (now - lastRocketTime.current < 1650) {
      return;
    }
    lastRocketTime.current = now;

    playLaunchSound();
    setLauncherKick((current) => current + 1);

    const direction = camera.getWorldDirection(new Vector3()).normalize();
    const origin = camera.position
      .clone()
      .add(direction.clone().multiplyScalar(1.05))
      .add(new Vector3(0, -0.1, 0));

    grenadeId.current += 1;
    const nextGrenadeId = grenadeId.current;
    setGrenades((current) => [
      ...current,
      {
        id: nextGrenadeId,
        kind: "rocket",
        position: [origin.x, origin.y, origin.z],
        velocity: [
          direction.x * 32,
          direction.y * 32 + 0.55,
          direction.z * 32,
        ],
      },
    ]);
  }, [camera]);

  const handleBodyContact = useCallback(
    (
      source: ShardSource,
      origin: "piece" | "shard" | "remnant",
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) => {
      const intensity = magnitude / Math.max(0.001, mass * 320);
      const body = pieceBodies.current.get(source.id);
      if (!body) {
        return;
      }

      const currentLinear = body.linvel();
      const currentAngular = body.angvel();
      const motion = preStepMotions.current.get(source.id) ?? {
        linear: currentLinear,
        angular: currentAngular,
      };
      const now = performance.now();
      const isNewContact = isNewPhysicalContact(
        now,
        lastContactAt.current.get(source.id),
      );
      lastContactAt.current.set(source.id, now);
      const approachSpeed = measureImpactApproachSpeed(
        motion,
        forceDirection,
        source.size,
      );
      if (
        isNewContact &&
        shouldPlayDebrisImpact({
          intensity,
          approachSpeed,
          elapsedSinceLastSound:
            now - (debrisSoundByBody.current.get(source.id) ?? -Infinity),
          minimumIntensity: 0.2,
        })
      ) {
        playDebrisSound(source.material, Math.min(1, intensity));
        debrisSoundByBody.current.set(source.id, now);
      }

      // Fresh sibling fragments begin almost face-to-face. Solver separation
      // is not a second physical impact and must not recursively fracture them.
      if (now < (contactDamageAfter.current.get(source.id) ?? 0)) {
        return;
      }
      if (!isNewContact) {
        return;
      }
      if (origin === "shard") {
        return;
      }

      if (!crumbleOnLanding.has(source.material)) {
        return;
      }

      const landingDamage = classifyLandingDamage(
        source.material,
        approachSpeed,
        intensity,
      );
      if (landingDamage === "none") {
        return;
      }

      // A high drop cracks concrete into a few heavy chunks; softer brittle
      // materials use the same speed-based contract with lower thresholds.
      if (landingDamage === "shatter") {
        impactShatterTimes.current = impactShatterTimes.current.filter(
          (time) => now - time < 350,
        );
        if (impactShatterTimes.current.length >= 2) {
          return;
        }
        if (
          shatterTarget(
            source,
            origin,
            null,
            approachSpeed,
            "fall",
          )
        ) {
          impactShatterTimes.current.push(now);
          settleWorld();
        }
        return;
      }

      // Hard (but survivable) landings chip the struck corner — minimally.
      chipTimes.current = chipTimes.current.filter((time) => now - time < 400);
      if (chipTimes.current.length >= 2) {
        return;
      }
      if (chipAtImpact(source, origin, forceDirection, intensity)) {
        chipTimes.current.push(now);
      }
    },
    [chipAtImpact, settleWorld, shatterTarget],
  );

  const handleDebrisContact = useCallback(
    (
      piece: BreakablePieceDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) =>
      handleBodyContact(
        piece,
        "piece",
        magnitude,
        mass,
        forceDirection,
      ),
    [handleBodyContact],
  );

  const handleShardContact = useCallback(
    (
      shard: ShardDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) =>
      handleBodyContact(
        shard,
        "shard",
        magnitude,
        mass,
        forceDirection,
      ),
    [handleBodyContact],
  );

  const handleRemnantContact = useCallback(
    (
      remnant: RemnantDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) =>
      handleBodyContact(
        remnant,
        "remnant",
        magnitude,
        mass,
        forceDirection,
      ),
    [handleBodyContact],
  );

  const strike = useCallback(() => {
    if (weapon === "launcher") {
      fireGrenade();
      return;
    }
    if (weapon === "rocket") {
      fireRocket();
      return;
    }

    if (weapon === "mg") {
      if (fallbackLook) {
        // No pointer lock — a click fires a short burst.
        fireRound();
        const second = window.setTimeout(fireRound, 110);
        const third = window.setTimeout(fireRound, 220);
        strikeTimers.current.push(second, third);
      } else {
        firing.current = true;
        fireRound();
      }
      return;
    }

    raycaster.current.setFromCamera(center, camera);
    const intersections = intersectBreakables(3);
    const hit = intersections.find(
      (intersection) => readBreakableHit(intersection) !== null,
    );
    const inReach = hit && hit.distance <= 3;
    const reach = inReach
      ? MathUtils.clamp(hit.distance - 0.085, 0.78, 2.91)
      : 1.1;

    setSwing((current) => ({
      id: current.id + 1,
      reach,
    }));

    if (!hit || !inReach) {
      return;
    }

    const hitData = readBreakableHit(hit);
    if (!hitData) {
      return;
    }
    const {
      pieceId: primaryPieceId,
      shardId,
      remnantId,
    } = hitData;
    const piece = primaryPieceId
      ? breakablePieceById.get(primaryPieceId)
      : undefined;
    const material =
      piece?.material ??
      hitData.material;
    const targetId = primaryPieceId ?? shardId ?? remnantId;

    if (!targetId || !material) {
      return;
    }

    const point = hit.point.clone();
    const direction = camera.getWorldDirection(new Vector3()).normalize();
    impactId.current += 1;
    const currentImpact = impactId.current;
    playImpactSound(material);

    const contactTimer = window.setTimeout(() => {
      burstId.current += 1;
      const nextBurstId = burstId.current;
      setBursts((current) => [
        ...current,
        {
          id: nextBurstId,
          position: [point.x, point.y, point.z],
          direction: [direction.x, direction.y, direction.z],
          material,
        },
      ]);

      const strikeSpeed = materialRuntimeProfiles[material].impulse * 2.1;

      if (piece && groundMaterials.has(piece.material)) {
        // The hammer digs a bite out of the ground instead of ripping a
        // whole tile loose.
        if (!brokenPiecesRef.current.has(piece.id)) {
          const dig = carveAt(piece.id, point, 0.18, direction);
          if (dig.carved) {
            if (dig.brokenParentId) {
              breakPieces([dig.brokenParentId]);
            }
            settleWorld();
            return;
          }
        }
        applyImpact(piece.id, material, point, direction, 0.5);
      } else if (
        piece &&
        (piece.material === "concrete" || piece.material === "stone")
      ) {
        const chipRadius = piece.material === "concrete" ? 0.2 : 0.18;
        if (!brokenPiecesRef.current.has(piece.id)) {
          const chip = carveAt(piece.id, point, chipRadius, direction);
          if (chip.carved) {
            if (chip.brokenParentId) {
              breakPieces([chip.brokenParentId]);
            }
            settleWorld();
            return;
          }
        }
        applyImpact(piece.id, material, point, direction, 0.35);
      } else if (piece) {
        if (!brokenPiecesRef.current.has(piece.id)) {
          breakAt(piece, currentImpact);
        }
        // A direct hammer hit crumbles the piece into real sub-pieces;
        // pieces that cannot split any further just get knocked away.
        if (!shatterTarget(piece, "piece", point, strikeSpeed)) {
          applyImpact(piece.id, material, point, direction);
        }
      } else if (shardId) {
        const shardDefinition = shardById.current.get(shardId);
        if (
          !shardDefinition ||
          !shatterTarget(shardDefinition, "shard", point, strikeSpeed)
        ) {
          // Too small to split — the hammer pulverizes loose crumbs.
          if (shardDefinition) {
            shardsRef.current = shardsRef.current.filter(
              (shard) => shard.id !== shardId,
            );
            shardById.current.delete(shardId);
            setShards(shardsRef.current);
          } else {
            applyImpact(shardId, material, point, direction);
          }
        }
      } else if (remnantId) {
        const remnantDefinition = remnantById.current.get(remnantId);
        if (
          remnantDefinition &&
          !remnantDefinition.detached &&
          !brokenPiecesRef.current.has(remnantDefinition.parentId)
        ) {
          if (
            remnantDefinition.material === "concrete" ||
            remnantDefinition.material === "stone"
          ) {
            const chipRadius =
              remnantDefinition.material === "concrete" ? 0.18 : 0.16;
            const chip = carveAt(remnantDefinition.id, point, chipRadius, direction);
            if (chip.carved) {
              if (chip.brokenParentId) {
                breakPieces([chip.brokenParentId]);
              }
              settleWorld();
              return;
            }
            applyImpact(remnantDefinition.id, material, point, direction, 0.25);
            settleWorld();
            return;
          }

          // A hammer blow to a holed piece finishes it: the parent breaks
          // with full fracture propagation, everything it carried collapses,
          // and the struck remnant crumbles (or turns to dust if tiny).
          const parentPiece = breakablePieceById.get(
            remnantDefinition.parentId,
          );
          if (parentPiece) {
            breakAt(parentPiece, currentImpact);
          }
          if (
            !shatterTarget(remnantDefinition, "remnant", point, strikeSpeed)
          ) {
            commitRemnants(remnantDefinition.id, []);
          }
        } else {
          applyImpact(remnantId, material, point, direction);
        }
      }

      settleWorld();
    }, 105);
    strikeTimers.current.push(contactTimer);
  }, [
    applyImpact,
    breakAt,
    breakPieces,
    camera,
    carveAt,
    center,
    commitRemnants,
    fallbackLook,
    fireGrenade,
    fireRocket,
    fireRound,
    intersectBreakables,
    settleWorld,
    shatterTarget,
    weapon,
  ]);

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }, []);

  const removeExplosion = useCallback((id: number) => {
    setExplosions((current) =>
      current.filter((explosion) => explosion.id !== id),
    );
  }, []);

  const removeTracer = useCallback((id: number) => {
    setTracers((current) => current.filter((tracer) => tracer.id !== id));
  }, []);

  useEffect(() => {
    mobileActions.current = {
      strike,
      strikeEnd,
    };
  }, [mobileActions, strike, strikeEnd]);

  const hiddenPieces = useMemo(() => {
    const next = new Set(shatteredPieces);
    for (const id of carvedPieces) {
      next.add(id);
    }
    return next;
  }, [carvedPieces, shatteredPieces]);

  return (
    <>
      <DayNightCycle
        mode={timeOfDay}
        nightRef={nightRef}
        theme={scene.environment}
      />
      {lampDefinitions.map((lamp) => (
        <LampLight
          key={lamp.id}
          lamp={lamp}
          broken={brokenPieces.has(lamp.id)}
          nightRef={nightRef}
        />
      ))}
      <SceneEnvironment />
      <OpenWorldShell scene={scene} />
      <group ref={breakableRaycastRoot}>
        <BreakableObjects
          pieces={breakablePieces}
          brokenPieces={brokenPieces}
          shatteredPieces={hiddenPieces}
          bodies={pieceBodies}
          registerBody={registerBody}
          onDebrisContact={handleDebrisContact}
        />
        {remnants.map((remnant) => (
          <Remnant
            key={remnant.id}
            remnant={remnant}
            freed={remnant.detached || brokenPieces.has(remnant.parentId)}
            registerBody={registerBody}
            onContact={handleRemnantContact}
          />
        ))}
        {shards.map((shard) => (
          <Shard
            key={shard.id}
            shard={shard}
            registerBody={registerBody}
            onContact={handleShardContact}
          />
        ))}
        <DynamicBreakableWorld
          pieces={[]}
          shards={shards}
          remnants={remnants}
          bodies={pieceBodies}
        />
      </group>
      {tracers.map((tracer) => (
        <Tracer
          key={`tracer:${tracer.id}`}
          tracer={tracer}
          onDone={removeTracer}
        />
      ))}
      {grenades.map((grenade) => (
        <Grenade
          key={`grenade:${grenade.id}`}
          grenade={grenade}
          onExplode={handleGrenadeExplode}
        />
      ))}
      <HingedDoorSystem
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        resetVersion={resetVersion}
      />
      <Player
        registerBody={registerBody}
        mobileControls={mobileControls}
        spawn={scene.playerSpawn}
        flightMode={flightMode}
      />
      {weapon === "hammer" ? (
        <FirstPersonHammer swing={swing} />
      ) : weapon === "launcher" ? (
        <FirstPersonLauncher kick={launcherKick} />
      ) : weapon === "rocket" ? (
        <FirstPersonRocketLauncher kick={launcherKick} />
      ) : (
        <FirstPersonMachineGun shotsRef={mgShots} />
      )}
      <MouseLook
        active={active}
        requestVersion={controlRequest}
        mobileControls={mobileControls}
        onActiveChange={onActiveChange}
        onFallbackChange={onFallbackChange}
        onStrike={strike}
        onStrikeEnd={strikeEnd}
      />
      {bursts.map((burst) => (
        <DustBurst
          key={`burst:${burst.id}`}
          burst={burst}
          onDone={removeBurst}
        />
      ))}
      {explosions.map((explosion) => (
        <VoxelExplosion
          key={`explosion:${explosion.id}`}
          explosion={explosion}
          onDone={removeExplosion}
        />
      ))}
    </>
  );
}

const DESKTOP_PIXEL_BUDGET = 1_100_000;
const COMPACT_PIXEL_BUDGET = 720_000;

function AdaptiveRenderScale({ compact }: { compact: boolean }) {
  const setDpr = useThree((state) => state.setDpr);
  const size = useThree((state) => state.size);
  const elapsed = useRef(0);
  const frames = useRef(0);
  const warmup = useRef(0);
  const currentDpr = useRef(1);

  useEffect(() => {
    const pixelBudget = compact
      ? COMPACT_PIXEL_BUDGET
      : DESKTOP_PIXEL_BUDGET;
    const minimumDpr = compact ? 0.72 : 0.58;
    const nextDpr = MathUtils.clamp(
      Math.sqrt(pixelBudget / Math.max(1, size.width * size.height)),
      minimumDpr,
      1,
    );
    currentDpr.current = nextDpr;
    elapsed.current = 0;
    frames.current = 0;
    warmup.current = 0;
    setDpr(nextDpr);
  }, [compact, setDpr, size.height, size.width]);

  useFrame((_, delta) => {
    warmup.current += delta;
    if (warmup.current < 2.5) {
      return;
    }

    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 2) {
      return;
    }

    const fps = frames.current / elapsed.current;
    const minimumDpr = compact ? 0.62 : 0.52;
    let nextDpr = currentDpr.current;
    if (fps < (compact ? 31 : 38)) {
      nextDpr = Math.max(minimumDpr, nextDpr - 0.06);
    } else if (fps > (compact ? 47 : 54)) {
      nextDpr = Math.min(1, nextDpr + 0.04);
    }

    if (Math.abs(nextDpr - currentDpr.current) > 0.001) {
      currentDpr.current = nextDpr;
      setDpr(nextDpr);
    }
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

function PerformanceProbe({
  enabled,
  onSample,
}: {
  enabled: boolean;
  onSample: (snapshot: PerformanceSnapshot) => void;
}) {
  const gl = useThree((state) => state.gl);
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    if (!enabled) {
      elapsed.current = 0;
      frames.current = 0;
      return;
    }

    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 0.5) {
      return;
    }

    onSample({
      fps: Math.round(frames.current / elapsed.current),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

function MobileGameControls({
  active,
  flightMode,
  weapon,
  timeOfDay,
  controls,
  onStart,
  onStrike,
  onStrikeEnd,
  onWeaponChange,
  onTimeChange,
  onFlightChange,
  onReset,
}: {
  active: boolean;
  flightMode: boolean;
  weapon: WeaponName;
  timeOfDay: TimeOfDay;
  controls: MobileControlsRef;
  onStart: () => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
  onWeaponChange: (weapon: WeaponName) => void;
  onTimeChange: () => void;
  onFlightChange: () => void;
  onReset: () => void;
}) {
  const movePointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const moveTouch = useRef<number | null>(null);
  const lookTouch = useRef<number | null>(null);
  const moveOrigin = useRef({ x: 0, y: 0 });
  const moveKnob = useRef({ x: 0, y: 0 });
  const lastLook = useRef({ x: 0, y: 0 });
  const [, setVisualTick] = useState(0);

  const refresh = useCallback(() => {
    setVisualTick((tick) => (tick + 1) % 1000);
  }, []);

  const updateMove = useCallback(
    (clientX: number, clientY: number) => {
      const maxDistance = 58;
      const dx = clientX - moveOrigin.current.x;
      const dy = clientY - moveOrigin.current.y;
      const distance = Math.hypot(dx, dy);
      const scale = distance > maxDistance ? maxDistance / distance : 1;
      const x = dx * scale;
      const y = dy * scale;
      moveKnob.current = { x, y };
      controls.current.moveX = MathUtils.clamp(x / maxDistance, -1, 1);
      controls.current.moveZ = MathUtils.clamp(y / maxDistance, -1, 1);
      controls.current.run = distance > maxDistance * 0.86;
      refresh();
    },
    [controls, refresh],
  );

  const setMoveOriginFromElement = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    moveOrigin.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  const updateLook = useCallback(
    (clientX: number, clientY: number) => {
      controls.current.lookDeltaX += clientX - lastLook.current.x;
      controls.current.lookDeltaY += clientY - lastLook.current.y;
      lastLook.current = { x: clientX, y: clientY };
    },
    [controls],
  );

  const stopMove = useCallback(() => {
    movePointer.current = null;
    moveTouch.current = null;
    moveKnob.current = { x: 0, y: 0 };
    controls.current.moveX = 0;
    controls.current.moveZ = 0;
    controls.current.run = false;
    refresh();
  }, [controls, refresh]);

  const stopLook = useCallback(() => {
    lookPointer.current = null;
    lookTouch.current = null;
  }, []);

  const findTouch = useCallback(
    (touches: TouchList, identifier: number | null) => {
      if (identifier === null) {
        return null;
      }

      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);
        if (touch?.identifier === identifier) {
          return touch;
        }
      }

      return null;
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      let handled = false;

      if (movePointer.current === event.pointerId) {
        updateMove(event.clientX, event.clientY);
        handled = true;
      }

      if (lookPointer.current === event.pointerId) {
        updateLook(event.clientX, event.clientY);
        handled = true;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (movePointer.current === event.pointerId) {
        stopMove();
      }

      if (lookPointer.current === event.pointerId) {
        stopLook();
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [stopLook, stopMove, updateLook, updateMove]);

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      let handled = false;
      const movingTouch = findTouch(event.touches, moveTouch.current);
      const lookingTouch = findTouch(event.touches, lookTouch.current);

      if (movingTouch) {
        updateMove(movingTouch.clientX, movingTouch.clientY);
        handled = true;
      }

      if (lookingTouch) {
        updateLook(lookingTouch.clientX, lookingTouch.clientY);
        handled = true;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (findTouch(event.changedTouches, moveTouch.current)) {
        stopMove();
      }

      if (findTouch(event.changedTouches, lookTouch.current)) {
        stopLook();
      }
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [findTouch, stopLook, stopMove, updateLook, updateMove]);

  const handleMoveStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The document-level tracker below is the reliable path on mobile.
      }
      movePointer.current = event.pointerId;
      setMoveOriginFromElement(event.currentTarget);
      updateMove(event.clientX, event.clientY);
      if (!active) {
        onStart();
      }
    },
    [active, onStart, setMoveOriginFromElement, updateMove],
  );

  const handleMoveTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      event.preventDefault();
      const touch = event.changedTouches.item(0);
      if (!touch) {
        return;
      }

      moveTouch.current = touch.identifier;
      setMoveOriginFromElement(event.currentTarget);
      updateMove(touch.clientX, touch.clientY);
      if (!active) {
        onStart();
      }
    },
    [active, onStart, setMoveOriginFromElement, updateMove],
  );

  const handleLookStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The document-level tracker below is the reliable path on mobile.
      }
      lookPointer.current = event.pointerId;
      lastLook.current = { x: event.clientX, y: event.clientY };
      if (!active) {
        onStart();
      }
    },
    [active, onStart],
  );

  const handleLookTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      const touch = event.changedTouches.item(0);
      if (!touch) {
        return;
      }

      lookTouch.current = touch.identifier;
      lastLook.current = { x: touch.clientX, y: touch.clientY };
      if (!active) {
        onStart();
      }
    },
    [active, onStart],
  );

  const handleLookEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (lookPointer.current === event.pointerId) {
        stopLook();
      }
    },
    [stopLook],
  );

  const handleFireStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!active) {
        onStart();
      }
      onStrike();
    },
    [active, onStart, onStrike],
  );

  const handleFireEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onStrikeEnd();
    },
    [onStrikeEnd],
  );

  const setJump = useCallback(
    (jump: boolean) => {
      controls.current.jump = jump;
      refresh();
    },
    [controls, refresh],
  );

  const fireLabel =
    weapon === "hammer" ? "Удар" : weapon === "mg" ? "Огонь" : "Пуск";
  const timeLabel =
    timeOfDay === "day" ? "День" : timeOfDay === "sunset" ? "Закат" : "Ночь";

  return (
    <div
      className={`mobile-controls${active ? " is-active" : ""}`}
      aria-label="Сенсорное управление"
    >
      <div
        className="mobile-look-zone"
        aria-hidden="true"
        onPointerDown={handleLookStart}
        onTouchStart={handleLookTouchStart}
        onPointerCancel={handleLookEnd}
        onPointerUp={handleLookEnd}
      />
      <div
        className="mobile-stick"
        aria-label="Движение"
        onPointerDown={handleMoveStart}
        onTouchStart={handleMoveTouchStart}
        onPointerCancel={stopMove}
        onPointerUp={stopMove}
      >
        <span
          style={{
            transform: `translate(${moveKnob.current.x}px, ${moveKnob.current.y}px)`,
          }}
        />
      </div>
      <div className={`mobile-actions${flightMode ? " is-flight" : ""}`} aria-label="Действия">
        <button
          className="mobile-fire"
          type="button"
          onPointerDown={handleFireStart}
          onPointerCancel={handleFireEnd}
          onPointerLeave={handleFireEnd}
          onPointerUp={handleFireEnd}
        >
          {fireLabel}
        </button>
        {!flightMode ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              setJump(true);
            }}
            onPointerCancel={() => setJump(false)}
            onPointerLeave={() => setJump(false)}
            onPointerUp={() => setJump(false)}
          >
            Прыжок
          </button>
        ) : null}
      </div>
      <div className="mobile-weapon-bar" aria-label="Оружие">
        {([
          ["hammer", "1", "Молоток"],
          ["launcher", "2", "Граната"],
          ["mg", "3", "Пулемёт"],
          ["rocket", "4", "Ракета"],
        ] as const).map(([nextWeapon, shortcut, label]) => (
          <button
            key={nextWeapon}
            type="button"
            className={weapon === nextWeapon ? "is-active" : undefined}
            onClick={() => onWeaponChange(nextWeapon)}
          >
            <span>{shortcut}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="mobile-utility-bar" aria-label="Сервис">
        <button
          type="button"
          className={flightMode ? "is-active" : undefined}
          onClick={onFlightChange}
        >
          {flightMode ? "Приземлиться" : "Полёт"}
        </button>
        <button type="button" onClick={onTimeChange}>{timeLabel}</button>
        <button type="button" onClick={onReset}>Заново</button>
      </div>
    </div>
  );
}

export function MakeAMessGame({
  scene = openHouseScene,
}: {
  scene?: DestructionSceneDefinition;
}) {
  const mobileControls = useRef<MobileControlsState>(createMobileControlsState());
  const mobileActions = useRef<MobileActionBridge>({
    strike: () => {},
    strikeEnd: () => {},
  });
  const [active, setActive] = useState(false);
  const [fallbackLook, setFallbackLook] = useState(false);
  const [controlRequest, setControlRequest] = useState(0);
  const [brokenCount, setBrokenCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [weapon, setWeapon] = useState<WeaponName>("hammer");
  const [flightMode, setFlightMode] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [ready, setReady] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [dynamicBodyCount, setDynamicBodyCount] = useState(0);
  const [performance, setPerformance] = useState<PerformanceSnapshot>({
    fps: 0,
    calls: 0,
    triangles: 0,
  });

  const reset = useCallback(() => {
    setBrokenCount(0);
    setFlightMode(false);
    setResetVersion((version) => version + 1);
    mobileControls.current = createMobileControlsState();
  }, []);

  const cycleTimeOfDay = useCallback(() => {
    setTimeOfDay((current) =>
      current === "day" ? "sunset" : current === "sunset" ? "night" : "day",
    );
  }, []);

  const toggleFlightMode = useCallback(() => {
    mobileControls.current.jump = false;
    setFlightMode((current) => !current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyR") {
        reset();
      } else if (event.code === "Digit1") {
        setWeapon("hammer");
      } else if (event.code === "Digit2") {
        setWeapon("launcher");
      } else if (event.code === "Digit3") {
        setWeapon("mg");
      } else if (event.code === "Digit4") {
        setWeapon("rocket");
      } else if (event.code === "KeyQ") {
        setWeapon((current) =>
          current === "hammer"
            ? "launcher"
            : current === "launcher"
              ? "mg"
              : current === "mg"
                ? "rocket"
                : "hammer",
        );
      } else if (event.code === "KeyN") {
        cycleTimeOfDay();
      } else if (event.code === "KeyF" && !event.repeat) {
        toggleFlightMode();
      } else if (event.code === "KeyP") {
        setShowPerformance((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleTimeOfDay, reset, toggleFlightMode]);

  const progress =
    Math.round(
      (brokenCount / scene.breakablePieces.length) * 1000,
    ) / 10;
  const startPlaying = useCallback(() => {
    prepareGameAudio();
    setActive(true);
    const touchLike = isTouchLikeDevice();
    setFallbackLook(touchLike);
    setControlRequest((version) => version + 1);
    if (touchLike) {
      return;
    }

    // Request pointer lock synchronously inside the click gesture — some
    // browsers reject requests coming later from a React effect.
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".game-canvas canvas, canvas",
    );
    try {
      const request = canvas?.requestPointerLock?.() as
        | Promise<void>
        | undefined;
      request?.catch?.(() => {});
    } catch {
      // MouseLook's fallback drag mode covers refusal.
    }
  }, []);

  return (
    <main className="play-page">
      <div className="game-canvas-wrap">
        <KeyboardControls map={[...keyboardMap]}>
          <Canvas
            className="game-canvas"
            shadows="percentage"
            dpr={1}
            camera={{
              position: [
                scene.playerSpawn[0],
                scene.playerSpawn[1] + 0.54,
                scene.playerSpawn[2],
              ],
              fov: 72,
              near: 0.05,
              far: scene.cameraFar,
            }}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
            }}
            fallback={
              <div className="webgl-fallback">
                Для Make a Mess нужен браузер с WebGL.
              </div>
            }
            onCreated={(state) => {
              state.gl.toneMapping = AgXToneMapping;
              state.gl.toneMappingExposure = 1.08;
              state.gl.shadowMap.autoUpdate = false;
              state.gl.shadowMap.needsUpdate = true;
              setReady(true);
            }}
          >
            <Suspense fallback={null}>
              <Physics
                gravity={[0, -14, 0]}
                timeStep={1 / 60}
                numSolverIterations={6}
                maxCcdSubsteps={2}
              >
                <OpenWorldScene
                  key={resetVersion}
                  scene={scene}
                  active={active}
                  flightMode={flightMode}
                  weapon={weapon}
                  timeOfDay={timeOfDay}
                  fallbackLook={fallbackLook}
                  controlRequest={controlRequest}
                  mobileControls={mobileControls}
                  mobileActions={mobileActions}
                  resetVersion={resetVersion}
                  onActiveChange={setActive}
                  onFallbackChange={setFallbackLook}
                  onBrokenCountChange={setBrokenCount}
                  onDynamicBodyCountChange={setDynamicBodyCount}
                />
              </Physics>
              <PerformanceProbe
                enabled={showPerformance}
                onSample={setPerformance}
              />
              <AdaptiveRenderScale compact={fallbackLook} />
              {!fallbackLook && timeOfDay !== "day" ? (
                <TeardownPostProcessing compact={false} />
              ) : null}
            </Suspense>
          </Canvas>
        </KeyboardControls>
      </div>

      <header className="play-topbar">
        <Link href="/" className="play-brand" aria-label="На главную">
          Handmade Games
        </Link>
        <div className="prototype-status">
          <span />
          {scene.copy.status}
        </div>
        <Link href="/games" className="play-exit">
          Все игры
          <span aria-hidden="true">↗</span>
        </Link>
      </header>

      {showPerformance ? (
        <aside className="game-performance" aria-label="Производительность">
          <span>{performance.fps} FPS</span>
          <span>{performance.calls} calls</span>
          <span>{performance.triangles.toLocaleString()} tris</span>
          <span>{dynamicBodyCount} bodies</span>
        </aside>
      ) : null}

      <aside className="game-objective" aria-live="polite">
        <p>{scene.copy.eyebrow}</p>
        <h1>{scene.copy.heading}</h1>
        <div className="damage-meter">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="damage-copy">
          <span>{brokenCount} частей</span>
          <span>{progress}% mess</span>
        </div>
        <div className="damage-copy">
          <span>Оружие</span>
          <span>
            {weapon === "hammer"
              ? "Молоток"
              : weapon === "launcher"
                ? "Гранатомёт"
                : weapon === "rocket"
                  ? "Ракетомёт"
                  : "Пулемёт"}
          </span>
        </div>
        <div className="damage-copy">
          <span>Время [N]</span>
          <span>
            {timeOfDay === "day"
              ? "День"
              : timeOfDay === "sunset"
                ? "Закат"
                : "Ночь"}
          </span>
        </div>
        <div className="damage-copy">
          <span>Режим [F]</span>
          <span>{flightMode ? "Полёт" : "Пешком"}</span>
        </div>
      </aside>

      <div className={`crosshair${active ? " is-active" : ""}`} aria-hidden="true">
        <i />
        <i />
      </div>

      <MobileGameControls
        active={active}
        flightMode={flightMode}
        weapon={weapon}
        timeOfDay={timeOfDay}
        controls={mobileControls}
        onStart={startPlaying}
        onStrike={() => mobileActions.current.strike()}
        onStrikeEnd={() => mobileActions.current.strikeEnd()}
        onWeaponChange={setWeapon}
        onTimeChange={cycleTimeOfDay}
        onFlightChange={toggleFlightMode}
        onReset={reset}
      />

      <div className="controls-hint" aria-hidden="true">
        <span>WASD</span>
        Двигаться
        <span>{fallbackLook ? "Drag" : "Mouse"}</span>
        Смотреть
        <span>Click</span>
        {weapon === "hammer"
          ? "Удар"
          : weapon === "launcher" || weapon === "rocket"
            ? "Выстрел"
            : "Огонь (держать)"}
        <span>1·2·3·4</span>
        Оружие
        <span>N</span>
        Время суток
        <span>F</span>
        {flightMode ? "Приземлиться" : "Режим полёта"}
        {!flightMode ? (
          <>
            <span>Space</span>
            Прыжок
          </>
        ) : null}
        <span>R</span>
        Заново
      </div>

      {!active && (
        <section className="game-gate" aria-label="Запуск трёхмерной сцены">
          <div className="gate-card">
            <p>{ready ? scene.copy.ready : scene.copy.loading}</p>
            <h2>
              {brokenCount > 0 ? "Продолжим беспорядок?" : "Всё можно сломать."}
            </h2>
            <p>
              {scene.copy.description}
            </p>
            <button
              id="enter-game"
              className="enter-game"
              type="button"
              disabled={!ready}
              onClick={startPlaying}
            >
              {brokenCount > 0 ? scene.copy.returnToGame : scene.copy.enter}
              <span aria-hidden="true">↗</span>
            </button>
            {brokenCount > 0 && (
              <button className="reset-game" type="button" onClick={reset}>
                {scene.copy.reset}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
