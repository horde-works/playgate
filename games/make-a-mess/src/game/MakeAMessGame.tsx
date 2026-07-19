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
} from "react";
import {
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
  breakablePieceById,
  breakablePieces,
  fractureLocallyAt,
  lampDefinitions,
  materialRuntimeProfiles,
  settleAfterBreak,
  structuralMaterialProfiles,
  type BreakableMaterial,
  type BreakablePieceDefinition,
} from "./destructionScene";
import {
  BLAST_PUSH_RADIUS,
  BLAST_RADIUS,
  MAX_LIVE_SHARDS,
  MG_FIRE_INTERVAL,
  MG_RANGE,
  VOLUME_BREAK_FRACTION,
  blastFactorByMaterial,
  blastNoise,
  buildShards,
  bulletHoleRadius,
  carveBox,
  classifyLandingDamage,
  crumbleOnLanding,
  distanceToOrientedBox,
  groundMaterials,
  isElongatedWood,
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
  measureImpactApproachSpeed,
  shouldPlayDebrisImpact,
  type ImpactMotion,
} from "./impactSoundPolicy";
import {
  FirstPersonHammer,
  FirstPersonLauncher,
  FirstPersonMachineGun,
  type SwingDefinition,
} from "./FirstPersonWeapons";
import { HingedDoorSystem } from "./HingedDoorSystem";
import { IntactBreakableWorld } from "./IntactBreakableWorld";
import { getPieceMaterial } from "./materialTextures";
import { resolveRuntimeStructure } from "./runtimeStructure";
import { createSpatialIndex } from "./spatialIndex";
import {
  DayNightCycle,
  LampLight,
  SceneEnvironment,
  type TimeOfDay,
} from "./WorldEnvironment";

type ControlName =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "run"
  | "jump";

type WeaponName = "hammer" | "launcher" | "mg";

const keyboardMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "run", keys: ["ShiftLeft", "ShiftRight"] },
  { name: "jump", keys: ["Space"] },
] as const;

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
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
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

const PLAYER_SPAWN = [0, 1.25, 7.4] as const;
const PIECE_SPATIAL_INDEX = createSpatialIndex(breakablePieces, 5);
const MAX_PIECE_BOUNDING_RADIUS = breakablePieces.reduce(
  (maximum, piece) =>
    Math.max(
      maximum,
      Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2,
    ),
  0,
);
const MAX_BLAST_QUERY_RADIUS =
  BLAST_RADIUS *
  Math.max(...Object.values(blastFactorByMaterial)) *
  1.22;

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
  const pieceId =
    typeof userData.breakablePiece === "string"
      ? userData.breakablePiece
      : intersection.instanceId === undefined
        ? undefined
        : instanceIds?.[intersection.instanceId];
  const shardId =
    typeof userData.breakableShard === "string"
      ? userData.breakableShard
      : undefined;
  const remnantId =
    typeof userData.breakableRemnant === "string"
      ? userData.breakableRemnant
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
}: {
  registerBody: (id: string, body: RapierRigidBody | null) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const [, getControls] = useKeyboardControls<ControlName>();
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const movement = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const groundRay = useRef<RapierRay | null>(null);
  const stepRay = useRef<RapierRay | null>(null);
  const stepCooldown = useRef(0);
  const spawnFrames = useRef(0);

  useEffect(() => {
    registerBody("player", body.current);
    return () => registerBody("player", null);
  }, [registerBody]);

  useFrame((_, delta) => {
    if (!body.current) {
      return;
    }

    // Spawn grace: pin the player to the spawn point for the first frames so
    // load-time physics hiccups can never push them through the ground.
    if (spawnFrames.current < 40) {
      spawnFrames.current += 1;
      body.current.setTranslation(
        { x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] },
        true,
      );
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      camera.position.set(
        PLAYER_SPAWN[0],
        PLAYER_SPAWN[1] + 0.54,
        PLAYER_SPAWN[2],
      );
      return;
    }

    const position = body.current.translation();
    const velocity = body.current.linvel();
    const { forward, backward, left, right, run, jump } = getControls();
    const inputX = Number(right) - Number(left);
    const inputZ = Number(backward) - Number(forward);
    const speed = run ? 6.2 : 4.25;

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
        probe.origin.y = bottomY + 0.68;
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
          probe.origin.y = bottomY + 0.66;
          probe.origin.z = position.z + directionZ * 0.72;
          probe.dir.x = 0;
          probe.dir.y = -1;
          probe.dir.z = 0;
          const downHit = world.castRay(
            probe,
            0.7,
            true,
            undefined,
            undefined,
            undefined,
            body.current ?? undefined,
          );
          const stepHeight = downHit
            ? 0.66 - downHit.timeOfImpact
            : 0.42;

          if (stepHeight > 0.04) {
            autoLift = Math.min(
              5.4,
              Math.sqrt(2 * 14 * (stepHeight + 0.22)),
            );
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
          jump && grounded
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
        { x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] },
        true,
      );
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody
      ref={body}
      position={[...PLAYER_SPAWN]}
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
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
}

function MouseLook({
  active,
  requestVersion,
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
    if (initialized.current) {
      return;
    }

    initialized.current = true;
    yaw.current = 0;
    pitch.current = 0;
    cameraRef.current.rotation.set(0, 0, 0, "YXZ");
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

function BreakablePieceMesh({
  piece,
  broken,
}: {
  piece: BreakablePieceDefinition;
  broken: boolean;
}) {
  const hitData = useMemo(() => ({ breakablePiece: piece.id }), [piece.id]);
  const material = useMemo(
    () => getPieceMaterial(piece.material, piece.color),
    [piece.color, piece.material],
  );
  const [width, height, depth] = piece.size;

  if (piece.shape === "cinderBlock") {
    return (
      <group>
        <mesh
          position={[0, height * 0.36, 0]}
          castShadow={!broken}
          receiveShadow
          userData={hitData}
          material={material}
        >
          <boxGeometry args={[width, height * 0.28, depth]} />
        </mesh>
        <mesh
          position={[0, -height * 0.36, 0]}
          castShadow={!broken}
          receiveShadow
          userData={hitData}
          material={material}
        >
          <boxGeometry args={[width, height * 0.28, depth]} />
        </mesh>
        {[-0.4, 0, 0.4].map((offset) => (
          <mesh
            key={offset}
            position={[width * offset, 0, 0]}
            castShadow={!broken}
            receiveShadow
            userData={hitData}
            material={material}
          >
            <boxGeometry args={[width * 0.18, height * 0.48, depth]} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh
      castShadow={!broken && piece.shape !== "groundTile"}
      receiveShadow
      userData={hitData}
      material={material}
      geometry={UNIT_BOX}
      scale={[width, height, depth]}
    />
  );
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
  }, [broken, piece.column, piece.material, piece.row, rapier]);

  return (
    <RigidBody
      ref={body}
      type={broken ? "dynamic" : "fixed"}
      position={[...piece.position]}
      rotation={piece.rotation ? [...piece.rotation] : undefined}
      colliders="cuboid"
      friction={piece.material === "wood" ? 0.66 : 0.84}
      restitution={profile.restitution}
      linearDamping={0.18}
      angularDamping={0.24}
      density={profile.density}
      ccd={broken}
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
      <BreakablePieceMesh piece={piece} broken={broken} />
    </RigidBody>
  );
});

function BreakableObjects({
  brokenPieces,
  shatteredPieces,
  registerBody,
  onDebrisContact,
}: {
  brokenPieces: ReadonlySet<string>;
  shatteredPieces: ReadonlySet<string>;
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
    for (const piece of breakablePieces) {
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
  }, [brokenPieces, shatteredPieces]);

  return (
    <group>
      <IntactBreakableWorld pieces={intactPieces} />
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
  const material = useMemo(
    () => getPieceMaterial(shard.material, shard.color),
    [shard.color, shard.material],
  );
  const isChunky =
    shard.size[0] * shard.size[1] * shard.size[2] > 0.015;

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
      colliders="cuboid"
      density={profile.density}
      friction={0.78}
      restitution={profile.restitution}
      linearDamping={0.15}
      angularDamping={0.25}
      ccd
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
      <mesh
        castShadow={false}
        receiveShadow
        material={material}
        userData={{
          breakableShard: shard.id,
          breakableMaterial: shard.material,
        }}
        geometry={UNIT_BOX}
        scale={[...shard.size]}
      />
    </RigidBody>
  );
});

function Grenade({
  grenade,
  onExplode,
}: {
  grenade: GrenadeDefinition;
  onExplode: (id: number, x: number, y: number, z: number) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const exploded = useRef(false);

  const trigger = useCallback(() => {
    if (exploded.current || !body.current) {
      return;
    }

    exploded.current = true;
    const translation = body.current.translation();
    onExplode(grenade.id, translation.x, translation.y, translation.z);
  }, [grenade.id, onExplode]);

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
    body.current.setAngvel({ x: 7, y: 3, z: 9 }, true);

    const fuse = window.setTimeout(trigger, 3500);
    return () => window.clearTimeout(fuse);
  }, [grenade, trigger]);

  return (
    <RigidBody
      ref={body}
      position={[...grenade.position]}
      colliders={false}
      density={2.2}
      linearDamping={0.04}
      angularDamping={0.35}
      ccd
      onCollisionEnter={trigger}
    >
      <BallCollider args={[0.09]} />
      <mesh castShadow>
        <boxGeometry args={[0.13, 0.13, 0.2]} />
        <meshStandardMaterial color="#3f4d33" metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <boxGeometry args={[0.05, 0.05, 0.09]} />
        <meshStandardMaterial color="#c8ccc4" metalness={0.6} roughness={0.4} />
      </mesh>
    </RigidBody>
  );
}

// A static leftover of a carved piece: stays fixed in place while its parent
// piece is structurally alive, breaks loose when the parent gives way.
const Remnant = memo(function Remnant({
  remnant,
  freed,
  registerBody,
}: {
  remnant: RemnantDefinition;
  freed: boolean;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const wasFreed = useRef(false);
  const { rapier } = useRapier();
  const profile = materialRuntimeProfiles[remnant.material];
  const material = useMemo(
    () => getPieceMaterial(remnant.material, remnant.color),
    [remnant.color, remnant.material],
  );

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
      currentBody.wakeUp();
      const mass = Math.max(0.02, currentBody.mass());
      currentBody.applyImpulse({ x: 0, y: 0.18 * mass, z: 0 }, true);
    }

    wasFreed.current = freed;
  }, [freed, rapier]);

  return (
    <RigidBody
      ref={body}
      type={freed ? "dynamic" : "fixed"}
      position={[...remnant.position]}
      colliders="cuboid"
      friction={0.82}
      restitution={profile.restitution}
      linearDamping={0.16}
      angularDamping={0.24}
      density={profile.density}
      ccd={freed}
    >
      <mesh
        castShadow={!freed}
        receiveShadow
        material={material}
        userData={{
          breakableRemnant: remnant.id,
          breakableMaterial: remnant.material,
        }}
        geometry={UNIT_BOX}
        scale={[...remnant.size]}
      />
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

function OpenWorldShell() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[45.5, 0.12, 36.5]} position={[30, -2.2, -15]} friction={1} />
      <CuboidCollider args={[0.12, 8, 36.5]} position={[-15.5, 7.6, -15]} />
      <CuboidCollider args={[0.12, 8, 36.5]} position={[75.5, 7.6, -15]} />
      <CuboidCollider args={[45.5, 8, 0.12]} position={[30, 7.6, -51.5]} />
      <CuboidCollider args={[45.5, 8, 0.12]} position={[30, 7.6, 21.5]} />
    </RigidBody>
  );
}

interface OpenWorldSceneProps {
  active: boolean;
  weapon: WeaponName;
  timeOfDay: TimeOfDay;
  fallbackLook: boolean;
  controlRequest: number;
  resetVersion: number;
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  onBrokenCountChange: (count: number) => void;
  onDynamicBodyCountChange: (count: number) => void;
}

function OpenWorldScene({
  active,
  weapon,
  timeOfDay,
  fallbackLook,
  controlRequest,
  resetVersion,
  onActiveChange,
  onFallbackChange,
  onBrokenCountChange,
  onDynamicBodyCountChange,
}: OpenWorldSceneProps) {
  const { camera } = useThree();
  const { rapier } = useRapier();
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
  const restCounters = useRef(new Map<string, number>());
  const settleAccumulator = useRef(0);
  const strikeTimers = useRef<ReturnType<typeof window.setTimeout>[]>([]);
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
        } else {
          dynamicBodies.current.delete(id);
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
    },
    [rapier],
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

      if (energy < 0.035) {
        const count = (restCounters.current.get(id) ?? 0) + 1;
        if (count >= 3) {
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
      let result = resolveRuntimeStructure(
        breakablePieces,
        structuralMaterialProfiles,
        seedBroken,
        carvedPiecesRef.current,
        remnantsRef.current,
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
              total + remnant.size[0] * remnant.size[1] * remnant.size[2],
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
        body.enableCcd(true);
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
    [ensureDynamic, withBody],
  );

  const commitShards = useCallback(
    (additions: readonly ShardDefinition[]) => {
      const merged = [...shardsRef.current, ...additions];
      const trimmed =
        merged.length > MAX_LIVE_SHARDS
          ? merged.slice(merged.length - MAX_LIVE_SHARDS)
          : merged;
      shardsRef.current = trimmed;
      shardById.current = new Map(trimmed.map((shard) => [shard.id, shard]));
      setShards(trimmed);
    },
    [],
  );

  const commitRemnants = useCallback(
    (removeId: string | null, additions: readonly RemnantDefinition[]) => {
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
      const localPoint = worldPoint
        .clone()
        .sub(bodyPosition)
        .applyQuaternion(bodyQuaternion.clone().invert());

      shardCounter.current += 1;
      const salt = `loose:${shardCounter.current}`;
      const result = carveBox(source.size, localPoint, radius, salt);
      if (!result) {
        return false;
      }

      const baseLinear = new Vector3(
        linearVelocity.x,
        linearVelocity.y,
        linearVelocity.z,
      );
      const baseAngular = new Vector3(
        angularVelocity.x,
        angularVelocity.y,
        angularVelocity.z,
      );
      const local = new Vector3();
      const world = new Vector3();
      const relative = new Vector3();
      const spinVelocity = new Vector3();
      const outward = new Vector3();
      const generated: ShardDefinition[] = [];

      for (const spec of result.kept) {
        local.set(...spec.localCenter);
        world.copy(local).applyQuaternion(bodyQuaternion).add(bodyPosition);
        relative.copy(world).sub(bodyPosition);
        spinVelocity.copy(baseAngular).cross(relative);
        outward.copy(world).sub(worldPoint);
        const distance = Math.max(0.12, outward.length());
        outward.normalize();

        shardCounter.current += 1;
        const id = `shard:l${shardCounter.current}`;
        const noise = blastNoise(id, 23);
        const speed = (burstSpeed * (0.4 + noise * 0.5)) / (0.6 + distance);

        generated.push({
          id,
          material: source.material,
          color: source.color,
          size: [
            spec.size[0] * 0.97,
            spec.size[1] * 0.97,
            spec.size[2] * 0.97,
          ],
          position: [world.x, world.y, world.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          linearVelocity: [
            baseLinear.x + spinVelocity.x + outward.x * speed,
            baseLinear.y + spinVelocity.y + outward.y * speed,
            baseLinear.z + spinVelocity.z + outward.z * speed,
          ],
          angularVelocity: [
            baseAngular.x + (noise - 0.5) * 3,
            baseAngular.y + (blastNoise(id, 7) - 0.5) * 3,
            baseAngular.z + (blastNoise(id, 3) - 0.5) * 3,
          ],
        });
      }

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
      origin: "piece" | "shard",
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
      const localPoint = worldPoint
        .clone()
        .sub(bodyPosition)
        .applyQuaternion(bodyQuaternion.clone().invert());

      remnantCounter.current += 1;
      const carveSalt = `carve:${remnantCounter.current}`;
      const result = carveBox(source.size, localPoint, radius, carveSalt);
      if (!result) {
        return { carved: false, brokenParentId: null };
      }

      const additions = result.kept.map((spec): RemnantDefinition => {
        remnantCounter.current += 1;
        const world = new Vector3(...spec.localCenter)
          .applyQuaternion(bodyQuaternion)
          .add(bodyPosition);
        return {
          id: `remnant:${remnantCounter.current}`,
          parentId,
          material: source.material,
          color: source.color,
          size: spec.size,
          position: [world.x, world.y, world.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          detached: false,
        };
      });

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

      const crossed = subtractParentVolume(parentId, result.removedVolume);
      return { carved: true, brokenParentId: crossed ? parentId : null };
    },
    [commitRemnants, commitShards, rapier, subtractParentVolume],
  );

  // Rip a fixed remnant loose from the wall without splitting it.
  const detachRemnant = useCallback(
    (remnant: RemnantDefinition): boolean => {
      const updated = remnantsRef.current.map((entry) =>
        entry.id === remnant.id ? { ...entry, detached: true } : entry,
      );
      remnantsRef.current = updated;
      remnantById.current = new Map(
        updated.map((entry) => [entry.id, entry]),
      );
      setRemnants(updated);

      const body = pieceBodies.current.get(remnant.id);
      if (body) {
        ensureDynamic(remnant.id, body);
        body.wakeUp();
      }

      const volume = remnant.size[0] * remnant.size[1] * remnant.size[2];
      return subtractParentVolume(remnant.parentId, volume);
    },
    [ensureDynamic, subtractParentVolume],
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

    if (material === "glass") {
      // Glass remains brittle after it has fallen out of its frame. Bullets
      // can keep reducing panes and large shards until only tiny chips remain.
      if (piece && !brokenPiecesRef.current.has(piece.id)) {
        impactId.current += 1;
        breakAt(piece, impactId.current);
      }

      let shattered = false;
      if (piece) {
        shattered = shatterTarget(piece, "piece", point, 5);
      } else if (shardId) {
        const shardDefinition = shardById.current.get(shardId);
        if (shardDefinition) {
          shattered = shatterTarget(
            shardDefinition,
            "shard",
            point,
            4.2,
          );
          if (!shattered) {
            shardsRef.current = shardsRef.current.filter(
              (shard) => shard.id !== shardId,
            );
            shardById.current.delete(shardId);
            setShards(shardsRef.current);
            shattered = true;
          }
        }
      } else if (remnantId) {
        const remnantDefinition = remnantById.current.get(remnantId);
        if (remnantDefinition) {
          shattered = shatterTarget(
            remnantDefinition,
            "remnant",
            point,
            4.2,
          );
          if (!shattered) {
            commitRemnants(remnantId, []);
            shattered = true;
          }
        }
      }

      if (!shattered) {
        applyImpact(targetId, material, point, direction, 0.5);
      }
      settleWorld();
      return;
    }

    const holeRadius = bulletHoleRadius[material];
    const targetBroken = pieceId
      ? brokenPiecesRef.current.has(pieceId)
      : false;

    if (holeRadius && !targetBroken && (pieceId || remnantId)) {
      const carve = carveAt(targetId, point, holeRadius, direction);
      if (carve.carved) {
        if (carve.brokenParentId) {
          breakPieces([carve.brokenParentId]);
        }
        settleWorld();
        return;
      }
    }

    // Displaced targets get the SAME carve geometry as standing ones: the
    // bullet bites a chunk out and the remainder keeps its motion.
    const looseRadius = (bulletHoleRadius[material] ?? 0.2) * 1.1;
    if (piece) {
      if (!brokenPiecesRef.current.has(piece.id)) {
        impactId.current += 1;
        breakAt(piece, impactId.current);
      }
      if (carveLooseTarget(piece, "piece", point, looseRadius, 1.6)) {
        settleWorld();
        return;
      }
    } else if (shardId) {
      const shardDefinition = shardById.current.get(shardId);
      if (
        shardDefinition &&
        carveLooseTarget(shardDefinition, "shard", point, looseRadius, 1.4)
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
    commitRemnants,
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
    (center3: Vector3) => {
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

      const previousBroken = brokenPiecesRef.current;
      const next = new Set(previousBroken);
      const blastCenter = [center3.x, center3.y, center3.z] as const;
      for (const piece of PIECE_SPATIAL_INDEX.querySphere(
        blastCenter,
        MAX_BLAST_QUERY_RADIUS + MAX_PIECE_BOUNDING_RADIUS,
      )) {
        if (next.has(piece.id) || groundMaterials.has(piece.material)) {
          continue;
        }

        const radius =
          BLAST_RADIUS *
          blastFactorByMaterial[piece.material] *
          (0.78 + blastNoise(piece.id, nextExplosionId) * 0.44);
        if (
          distanceToOrientedBox(
            center3,
            piece.position,
            piece.size,
            piece.rotation,
          ) <= radius
        ) {
          next.add(piece.id);
        }
      }

      const resolved = settleStructure(next);

      // Teardown crumble: the pieces closest to the blast shatter into
      // real sub-pieces, the rest fly away whole.
      const shatteredNow = new Set<string>();
      const shatterCandidates = [...resolved]
        .filter((id) => !previousBroken.has(id))
        .map((id) => breakablePieceById.get(id))
        .filter(
          (candidate): candidate is BreakablePieceDefinition =>
            candidate !== undefined,
        )
        .map((candidate) => ({
          piece: candidate,
          distance: distanceToOrientedBox(
            center3,
            candidate.position,
            candidate.size,
            candidate.rotation,
          ),
          centerDistance: Math.hypot(
            candidate.position[0] - center3.x,
            candidate.position[1] - center3.y,
            candidate.position[2] - center3.z,
          ),
        }))
        .filter((entry) => entry.distance <= BLAST_RADIUS)
        .sort((left, right) => {
          const leftScore =
            left.distance -
            (isElongatedWood(left.piece) ? BLAST_RADIUS * 0.72 : 0);
          const rightScore =
            right.distance -
            (isElongatedWood(right.piece) ? BLAST_RADIUS * 0.72 : 0);
          return (
            leftScore - rightScore ||
            left.centerDistance - right.centerDistance
          );
        })
        .slice(0, 16);

      for (const entry of shatterCandidates) {
        if (
          shatterTarget(entry.piece, "piece", center3, 8.5, "blast")
        ) {
          shatteredNow.add(entry.piece.id);
        }
      }

      // Crater: bite chunks out of standing pieces at the blast edge and rip
      // loose remnants that hang near the blast.
      const volumeBroken: string[] = [];
      let craterBudget = 8;
      const craterCandidates = PIECE_SPATIAL_INDEX.querySphere(
        blastCenter,
        BLAST_RADIUS * 1.6 + MAX_PIECE_BOUNDING_RADIUS,
      );
      for (const piece of craterCandidates) {
        if (craterBudget <= 0) {
          break;
        }
        if (
          resolved.has(piece.id) ||
          piece.material === "steel" ||
          piece.material === "glass"
        ) {
          continue;
        }

        const pieceDistance = distanceToOrientedBox(
          center3,
          piece.position,
          piece.size,
          piece.rotation,
        );
        if (pieceDistance > BLAST_RADIUS * 1.6) {
          continue;
        }

        // The carve radius shrinks with depth below the blast, so thick
        // ground layers get a stepped bowl-shaped crater, not a shaft.
        const pieceTop = piece.position[1] + piece.size[1] / 2;
        const depthBelow = Math.max(0, center3.y - pieceTop);
        const craterRadius =
          BLAST_RADIUS * 0.8 * Math.max(0.35, 1 - depthBelow * 0.42);
        const carve = carveAt(piece.id, center3, craterRadius, null);
        if (carve.carved) {
          craterBudget -= 1;
          if (carve.brokenParentId) {
            volumeBroken.push(carve.brokenParentId);
          }
        }
      }

      for (const remnant of [...remnantsRef.current]) {
        if (remnant.detached || resolved.has(remnant.parentId)) {
          continue;
        }
        const remnantDistance = Math.hypot(
          remnant.position[0] - center3.x,
          remnant.position[1] - center3.y,
          remnant.position[2] - center3.z,
        );
        if (remnantDistance < BLAST_RADIUS * 1.15) {
          if (detachRemnant(remnant)) {
            volumeBroken.push(remnant.parentId);
          }
        }
      }

      breakPieces(volumeBroken);
      const finalBroken = brokenPiecesRef.current;
      const pushedIds = new Set<string>();

      const pushBody = (id: string, body: RapierRigidBody) => {
        if (shatteredNow.has(id)) {
          return;
        }
        const translation = body.translation();
        const dx = translation.x - center3.x;
        const dy = translation.y - center3.y;
        const dz = translation.z - center3.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > BLAST_PUSH_RADIUS) {
          return;
        }

        const falloff = 1 - distance / BLAST_PUSH_RADIUS;
        const inverse = 1 / Math.max(0.25, distance);
        const mass = Math.max(0.04, body.mass());

        if (id === "player") {
          body.applyImpulse(
            {
              x: dx * inverse * 6.4 * falloff * mass,
              y: (dy * inverse + 0.8) * 5.2 * falloff * mass,
              z: dz * inverse * 6.4 * falloff * mass,
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
        body.enableCcd(true);
        body.wakeUp();

        const speed = 5.2 + 6.5 * falloff;
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

      for (const piece of PIECE_SPATIAL_INDEX.querySphere(
        blastCenter,
        BLAST_PUSH_RADIUS,
      )) {
        if (!finalBroken.has(piece.id) || shatteredNow.has(piece.id)) {
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

      settleWorld();
    },
    [
      breakPieces,
      carveAt,
      detachRemnant,
      ensureDynamic,
      rapier,
      settleStructure,
      settleWorld,
      shatterTarget,
      withBody,
    ],
  );

  const handleGrenadeExplode = useCallback(
    (id: number, x: number, y: number, z: number) => {
      setGrenades((current) => current.filter((grenade) => grenade.id !== id));
      explodeAt(new Vector3(x, y, z));
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
        position: [origin.x, origin.y, origin.z],
        velocity: [
          direction.x * 23,
          direction.y * 23 + 1.4,
          direction.z * 23,
        ],
      },
    ]);
  }, [camera]);

  const handleDebrisContact = useCallback(
    (
      piece: BreakablePieceDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) => {
      const intensity = magnitude / Math.max(0.001, mass * 320);
      const body = pieceBodies.current.get(piece.id);
      if (!body) {
        return;
      }

      const currentLinear = body.linvel();
      const currentAngular = body.angvel();
      const motion = preStepMotions.current.get(piece.id) ?? {
        linear: currentLinear,
        angular: currentAngular,
      };
      const now = performance.now();
      const approachSpeed = measureImpactApproachSpeed(
        motion,
        forceDirection,
        piece.size,
      );
      if (
        shouldPlayDebrisImpact({
          intensity,
          approachSpeed,
          elapsedSinceLastSound:
            now - (debrisSoundByBody.current.get(piece.id) ?? -Infinity),
          minimumIntensity: 0.18,
        })
      ) {
        playDebrisSound(piece.material, Math.min(1, intensity));
        debrisSoundByBody.current.set(piece.id, now);
      }

      if (!crumbleOnLanding.has(piece.material)) {
        return;
      }

      const landingDamage = classifyLandingDamage(
        piece.material,
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
        if (shatterTarget(piece, "piece", null, 1.15, "fall")) {
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
      if (chipAtImpact(piece, "piece", forceDirection, intensity)) {
        chipTimes.current.push(now);
      }
    },
    [chipAtImpact, settleWorld, shatterTarget],
  );

  // Chunky debris only sounds off on landings — no further chipping, so a
  // collapse never cascades into an avalanche of contact-driven splits.
  const handleShardContact = useCallback(
    (
      shard: ShardDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
    ) => {
      const intensity = magnitude / Math.max(0.001, mass * 320);
      const body = pieceBodies.current.get(shard.id);
      if (!body) {
        return;
      }

      const currentLinear = body.linvel();
      const currentAngular = body.angvel();
      const motion = preStepMotions.current.get(shard.id) ?? {
        linear: currentLinear,
        angular: currentAngular,
      };
      const now = performance.now();
      const approachSpeed = measureImpactApproachSpeed(
        motion,
        forceDirection,
        shard.size,
      );
      if (
        shouldPlayDebrisImpact({
          intensity,
          approachSpeed,
          elapsedSinceLastSound:
            now - (debrisSoundByBody.current.get(shard.id) ?? -Infinity),
          minimumIntensity: 0.24,
        })
      ) {
        playDebrisSound(shard.material, Math.min(1, intensity));
        debrisSoundByBody.current.set(shard.id, now);
      }
    },
    [],
  );

  const strike = useCallback(() => {
    if (weapon === "launcher") {
      fireGrenade();
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
          const dig = carveAt(piece.id, point, 0.34, direction);
          if (dig.carved) {
            if (dig.brokenParentId) {
              breakPieces([dig.brokenParentId]);
            }
            settleWorld();
            return;
          }
        }
        applyImpact(piece.id, material, point, direction, 0.5);
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

  const hiddenPieces = useMemo(() => {
    const next = new Set(shatteredPieces);
    for (const id of carvedPieces) {
      next.add(id);
    }
    return next;
  }, [carvedPieces, shatteredPieces]);

  return (
    <>
      <DayNightCycle mode={timeOfDay} nightRef={nightRef} />
      {lampDefinitions.map((lamp) => (
        <LampLight
          key={lamp.id}
          lamp={lamp}
          broken={brokenPieces.has(lamp.id)}
          nightRef={nightRef}
        />
      ))}
      <SceneEnvironment />
      <OpenWorldShell />
      <group ref={breakableRaycastRoot}>
        <BreakableObjects
          brokenPieces={brokenPieces}
          shatteredPieces={hiddenPieces}
          registerBody={registerBody}
          onDebrisContact={handleDebrisContact}
        />
        {remnants.map((remnant) => (
          <Remnant
            key={remnant.id}
            remnant={remnant}
            freed={remnant.detached || brokenPieces.has(remnant.parentId)}
            registerBody={registerBody}
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
      <Player registerBody={registerBody} />
      {weapon === "hammer" ? (
        <FirstPersonHammer swing={swing} />
      ) : weapon === "launcher" ? (
        <FirstPersonLauncher kick={launcherKick} />
      ) : (
        <FirstPersonMachineGun shotsRef={mgShots} />
      )}
      <MouseLook
        active={active}
        requestVersion={controlRequest}
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

export function MakeAMessGame() {
  const [active, setActive] = useState(false);
  const [fallbackLook, setFallbackLook] = useState(false);
  const [controlRequest, setControlRequest] = useState(0);
  const [brokenCount, setBrokenCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [weapon, setWeapon] = useState<WeaponName>("hammer");
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
    setResetVersion((version) => version + 1);
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
      } else if (event.code === "KeyQ") {
        setWeapon((current) =>
          current === "hammer"
            ? "launcher"
            : current === "launcher"
              ? "mg"
              : "hammer",
        );
      } else if (event.code === "KeyN") {
        setTimeOfDay((current) =>
          current === "day" ? "sunset" : current === "sunset" ? "night" : "day",
        );
      } else if (event.code === "KeyP") {
        setShowPerformance((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reset]);

  const progress = Math.round((brokenCount / breakablePieces.length) * 100);
  const startPlaying = useCallback(() => {
    prepareGameAudio();
    setActive(true);
    setFallbackLook(false);
    setControlRequest((version) => version + 1);
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
            dpr={[1, 1.25]}
            camera={{
              position: [
                PLAYER_SPAWN[0],
                PLAYER_SPAWN[1] + 0.54,
                PLAYER_SPAWN[2],
              ],
              fov: 72,
              near: 0.05,
              far: 140,
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
                  active={active}
                  weapon={weapon}
                  timeOfDay={timeOfDay}
                  fallbackLook={fallbackLook}
                  controlRequest={controlRequest}
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
          Make a Mess / 004
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
        <p>Open house test 001</p>
        <h1>Дом — объект.</h1>
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
      </aside>

      <div className={`crosshair${active ? " is-active" : ""}`} aria-hidden="true">
        <i />
        <i />
      </div>

      <div className="controls-hint" aria-hidden="true">
        <span>WASD</span>
        Двигаться
        <span>{fallbackLook ? "Drag" : "Mouse"}</span>
        Смотреть
        <span>Click</span>
        {weapon === "hammer"
          ? "Удар"
          : weapon === "launcher"
            ? "Выстрел"
            : "Огонь (держать)"}
        <span>1·2·3</span>
        Оружие
        <span>N</span>
        Время суток
        <span>Space</span>
        Прыжок
        <span>R</span>
        Заново
      </div>

      {!active && (
        <section className="game-gate" aria-label="Запуск трёхмерной сцены">
          <div className="gate-card">
            <p>{ready ? "Open house ready" : "Собираем дом…"}</p>
            <h2>
              {brokenCount > 0 ? "Продолжим беспорядок?" : "Всё можно сломать."}
            </h2>
            <p>
              Целый квартал: шесть панельных четырёхэтажек, три дома, улицы
              с перекрёстками, гаражи с распахивающимися воротами, детские
              площадки и дворы. Клавиша N — день, закат или ночь: в окнах
              загорается свет. Клик — молоток, 2 — гранатомёт, 3 — пулемёт:
              выгрызает дырки прямо в стенах.
            </p>
            <button
              id="enter-game"
              className="enter-game"
              type="button"
              disabled={!ready}
              onClick={startPlaying}
            >
              {brokenCount > 0 ? "Вернуться в гараж" : "Взять молоток"}
              <span aria-hidden="true">↗</span>
            </button>
            {brokenCount > 0 && (
              <button className="reset-game" type="button" onClick={reset}>
                Собрать дом заново
              </button>
            )}
          </div>
        </section>
      )}

      <div className="mobile-game-note">
        Открытая сцена рассчитана на клавиатуру и мышь.
      </div>
    </main>
  );
}
