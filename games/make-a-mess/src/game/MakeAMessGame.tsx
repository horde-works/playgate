"use client";

import {
  KeyboardControls,
  Sky,
  useKeyboardControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
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
  DirectionalLight,
  Euler,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  PMREMGenerator,
  PointLight,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Ray as RapierRay } from "@dimforge/rapier3d-compat";
import {
  breakablePieceById,
  breakablePieces,
  fractureAt,
  lampDefinitions,
  materialRuntimeProfiles,
  settleAfterBreak,
  type BreakableMaterial,
  type BreakablePieceDefinition,
  type LampDefinition,
} from "./destructionScene";
import {
  playDebrisSound,
  playExplosionSound,
  playGunshotSound,
  playImpactSound,
  playLaunchSound,
} from "./impactAudio";
import { getPieceMaterial, setWindowGlow } from "./materialTextures";

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

interface ShardDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

interface ShardSource {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
}

interface RemnantDefinition {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly detached: boolean;
}

interface TracerDefinition {
  readonly id: number;
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
}

interface SwingDefinition {
  readonly id: number;
  readonly reach: number;
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

const PLAYER_SPAWN = [0, 1.25, 7.4] as const;

const BLAST_RADIUS = 2.35;
const BLAST_PUSH_RADIUS = 4.4;

const blastFactorByMaterial: Record<BreakableMaterial, number> = {
  glass: 1.5,
  plaster: 1.3,
  wood: 1.05,
  brick: 0.9,
  stone: 0.75,
  concrete: 0.75,
  steel: 0.6,
  soil: 0.45,
  asphalt: 0.6,
};

function blastNoise(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

const MAX_SHARDS_PER_PIECE = 12;
const MAX_LIVE_SHARDS = 240;
const MIN_SHARD_SIDE = 0.07;
const MIN_REMNANT_SIDE = 0.05;
const VOLUME_BREAK_FRACTION = 0.45;
const MG_FIRE_INTERVAL = 0.11;
const MG_RANGE = 70;

// Bullet carve radius per material; glass shatters whole, steel is immune.
const bulletHoleRadius: Partial<Record<BreakableMaterial, number>> = {
  brick: 0.19,
  stone: 0.18,
  concrete: 0.18,
  plaster: 0.27,
  wood: 0.2,
  soil: 0.3,
  asphalt: 0.24,
};

interface RemnantSpec {
  readonly size: readonly [number, number, number];
  readonly localCenter: readonly [number, number, number];
}

interface CarveResult {
  readonly kept: readonly RemnantSpec[];
  readonly removedVolume: number;
}

// Subtract a blocky (voxel-style) hole around localPoint from a box and
// return the remainder as at most six axis-aligned boxes.
function carveBox(
  size: readonly [number, number, number],
  localPoint: Vector3,
  radius: number,
  salt: string,
): CarveResult | null {
  const point = [localPoint.x, localPoint.y, localPoint.z];
  const holeMin: number[] = [];
  const holeMax: number[] = [];

  for (let axis = 0; axis < 3; axis += 1) {
    const half = radius * (0.8 + blastNoise(`${salt}:${axis}`, 29) * 0.35);
    const low = Math.max(-size[axis] / 2, point[axis] - half);
    const high = Math.min(size[axis] / 2, point[axis] + half);
    if (high - low < 0.015) {
      return null;
    }
    holeMin.push(low);
    holeMax.push(high);
  }

  const kept: RemnantSpec[] = [];
  const pushBox = (min: readonly number[], max: readonly number[]) => {
    const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    if (
      dims[0] < MIN_REMNANT_SIDE ||
      dims[1] < MIN_REMNANT_SIDE ||
      dims[2] < MIN_REMNANT_SIDE
    ) {
      return;
    }
    kept.push({
      size: [dims[0], dims[1], dims[2]],
      localCenter: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ],
    });
  };

  const boxMin = [-size[0] / 2, -size[1] / 2, -size[2] / 2];
  const boxMax = [size[0] / 2, size[1] / 2, size[2] / 2];
  pushBox(boxMin, [holeMin[0], boxMax[1], boxMax[2]]);
  pushBox([holeMax[0], boxMin[1], boxMin[2]], boxMax);
  pushBox(
    [holeMin[0], boxMin[1], boxMin[2]],
    [holeMax[0], holeMin[1], boxMax[2]],
  );
  pushBox(
    [holeMin[0], holeMax[1], boxMin[2]],
    [holeMax[0], boxMax[1], boxMax[2]],
  );
  pushBox(
    [holeMin[0], holeMin[1], boxMin[2]],
    [holeMax[0], holeMax[1], holeMin[2]],
  );
  pushBox(
    [holeMin[0], holeMin[1], holeMax[2]],
    [holeMax[0], holeMax[1], boxMax[2]],
  );

  const total = size[0] * size[1] * size[2];
  const keptVolume = kept.reduce(
    (sum, box) => sum + box.size[0] * box.size[1] * box.size[2],
    0,
  );

  return { kept, removedVolume: total - keptVolume };
}

const crumbleOnLanding: ReadonlySet<BreakableMaterial> = new Set([
  "brick",
  "stone",
  "plaster",
  "concrete",
  "glass",
  "asphalt",
]);

function shardCellSize(material: BreakableMaterial): number {
  switch (material) {
    case "glass":
      return 0.34;
    case "wood":
      return 0.3;
    case "steel":
      return 0.5;
    case "soil":
      return Number.POSITIVE_INFINITY;
    default:
      return 0.21;
  }
}

function shardGridCounts(
  size: readonly [number, number, number],
  material: BreakableMaterial,
): [number, number, number] | null {
  const cell = shardCellSize(material);
  if (!Number.isFinite(cell)) {
    return null;
  }

  const counts = [0, 1, 2].map((axis) => {
    let count = MathUtils.clamp(Math.round(size[axis] / cell), 1, 6);
    while (count > 1 && size[axis] / count < MIN_SHARD_SIDE) {
      count -= 1;
    }
    return count;
  }) as [number, number, number];

  while (counts[0] * counts[1] * counts[2] > MAX_SHARDS_PER_PIECE) {
    const largestAxis = counts.indexOf(Math.max(...counts)) as 0 | 1 | 2;
    counts[largestAxis] -= 1;
  }

  if (counts[0] * counts[1] * counts[2] < 2) {
    return null;
  }

  return counts;
}

// Split a box body into a grid of smaller real bodies that tile its current
// volume, inheriting its transform and velocity — Teardown-style crumble.
function buildShards(
  source: ShardSource,
  idPrefix: string,
  bodyPosition: Vector3,
  bodyQuaternion: Quaternion,
  baseLinearVelocity: Vector3,
  baseAngularVelocity: Vector3,
  burstCenter: Vector3,
  burstSpeed: number,
): ShardDefinition[] | null {
  const counts = shardGridCounts(source.size, source.material);
  if (!counts) {
    return null;
  }

  const shards: ShardDefinition[] = [];
  const local = new Vector3();
  const world = new Vector3();
  const relative = new Vector3();
  const spinVelocity = new Vector3();
  const outward = new Vector3();
  const shardSize: [number, number, number] = [
    (source.size[0] / counts[0]) * 0.94,
    (source.size[1] / counts[1]) * 0.94,
    (source.size[2] / counts[2]) * 0.94,
  ];
  let index = 0;

  for (let ix = 0; ix < counts[0]; ix += 1) {
    for (let iy = 0; iy < counts[1]; iy += 1) {
      for (let iz = 0; iz < counts[2]; iz += 1) {
        local.set(
          ((ix + 0.5) / counts[0] - 0.5) * source.size[0],
          ((iy + 0.5) / counts[1] - 0.5) * source.size[1],
          ((iz + 0.5) / counts[2] - 0.5) * source.size[2],
        );
        world.copy(local).applyQuaternion(bodyQuaternion).add(bodyPosition);
        relative.copy(world).sub(bodyPosition);
        spinVelocity.copy(baseAngularVelocity).cross(relative);
        outward.copy(world).sub(burstCenter);
        const distance = Math.max(0.14, outward.length());
        outward.normalize();

        const id = `${idPrefix}:${index}`;
        const noise = blastNoise(id, 11);
        const speed = (burstSpeed * (0.5 + noise * 0.7)) / (0.7 + distance);
        const tumble = 2.5 + noise * 7;

        shards.push({
          id,
          material: source.material,
          color: source.color,
          size: shardSize,
          position: [world.x, world.y, world.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          linearVelocity: [
            baseLinearVelocity.x + spinVelocity.x + outward.x * speed,
            baseLinearVelocity.y +
              spinVelocity.y +
              outward.y * speed +
              speed * 0.22,
            baseLinearVelocity.z + spinVelocity.z + outward.z * speed,
          ],
          angularVelocity: [
            baseAngularVelocity.x + (noise - 0.5) * tumble,
            baseAngularVelocity.y + (blastNoise(id, 5) - 0.5) * tumble,
            baseAngularVelocity.z + (blastNoise(id, 3) - 0.5) * tumble,
          ],
        });
        index += 1;
      }
    }
  }

  return shards;
}

function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const envTexture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);

  useEffect(() => () => envTexture.dispose(), [envTexture]);

  return <primitive object={envTexture} attach="environment" />;
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

  useEffect(() => {
    registerBody("player", body.current);
    return () => registerBody("player", null);
  }, [registerBody]);

  useFrame((_, delta) => {
    if (!body.current) {
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

    if (position.y < -4) {
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
    >
      <CapsuleCollider args={[0.45, 0.36]} />
    </RigidBody>
  );
}

function FirstPersonHammer({ swing }: { swing: SwingDefinition }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const swingProgress = useRef(1);
  const previousSwing = useRef(swing.id);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (previousSwing.current !== swing.id) {
      previousSwing.current = swing.id;
      swingProgress.current = 0;
    }

    swingProgress.current = Math.min(1, swingProgress.current + delta * 4.6);
    const progress = swingProgress.current;
    const impactArc = Math.sin(progress * Math.PI);
    const recoil = Math.sin(Math.min(1, progress * 1.7) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.52 - impactArc * 0.18,
      -0.42 + recoil * 0.09,
      -0.72 - impactArc * Math.max(0.18, swing.reach - 0.72),
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(-0.18 - impactArc * 0.85, 0.08, 0.34 + impactArc * 0.42);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh position={[0, -0.06, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.042, 0.62, 10]} />
        <meshStandardMaterial color="#a9743f" roughness={0.86} />
      </mesh>
      <mesh position={[0, -0.3, 0]} castShadow>
        <cylinderGeometry args={[0.046, 0.05, 0.17, 10]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.245, -0.02]} castShadow>
        <boxGeometry args={[0.078, 0.06, 0.13]} />
        <meshStandardMaterial color="#8a5c32" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.3, -0.02]} castShadow>
        <boxGeometry args={[0.11, 0.11, 0.3]} />
        <meshStandardMaterial color="#454543" metalness={0.76} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0.3, -0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.052, 0.06, 0.09, 12]} />
        <meshStandardMaterial color="#565654" metalness={0.82} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.3, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.056, 0.16, 4]} />
        <meshStandardMaterial color="#383836" metalness={0.8} roughness={0.32} />
      </mesh>
    </group>
  );
}

function FirstPersonLauncher({ kick }: { kick: number }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const kickProgress = useRef(1);
  const previousKick = useRef(kick);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (previousKick.current !== kick) {
      previousKick.current = kick;
      kickProgress.current = 0;
    }

    kickProgress.current = Math.min(1, kickProgress.current + delta * 3.2);
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(0.42, -0.34 + recoil * 0.05, -0.62 + recoil * 0.17);
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(recoil * 0.3, -0.06, 0.04);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.058, 0.062, 0.64, 12]} />
        <meshStandardMaterial color="#43503f" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.33]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.078, 0.07, 0.11, 12]} />
        <meshStandardMaterial color="#333d31" metalness={0.5} roughness={0.44} />
      </mesh>
      <mesh position={[0, 0, 0.26]} castShadow>
        <boxGeometry args={[0.1, 0.13, 0.16]} />
        <meshStandardMaterial color="#2f372d" metalness={0.36} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.11, 0.1]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.045, 0.15, 0.06]} />
        <meshStandardMaterial color="#241f18" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.085, -0.12]} castShadow>
        <boxGeometry args={[0.03, 0.05, 0.1]} />
        <meshStandardMaterial color="#20261f" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
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
  resetVersion: number;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onDebrisContact: (
    piece: BreakablePieceDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}

function BreakablePieceMesh({ piece }: { piece: BreakablePieceDefinition }) {
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
          castShadow
          receiveShadow
          userData={hitData}
          material={material}
        >
          <boxGeometry args={[width, height * 0.28, depth]} />
        </mesh>
        <mesh
          position={[0, -height * 0.36, 0]}
          castShadow
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
            castShadow
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
    <mesh castShadow receiveShadow userData={hitData} material={material}>
      <boxGeometry args={[width, height, depth]} />
    </mesh>
  );
}

const BreakablePiece = memo(function BreakablePiece({
  piece,
  broken,
  resetVersion,
  registerBody,
  onDebrisContact,
}: BreakablePieceProps) {
  const body = useRef<RapierRigidBody>(null);
  const wasBroken = useRef(false);
  const { rapier } = useRapier();
  const profile = materialRuntimeProfiles[piece.material];
  const initialRotation = useMemo(
    () =>
      new Quaternion().setFromEuler(
        new Euler(
          piece.rotation?.[0] ?? 0,
          piece.rotation?.[1] ?? 0,
          piece.rotation?.[2] ?? 0,
        ),
      ),
    [piece.rotation],
  );

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

  useEffect(() => {
    if (!body.current) {
      return;
    }

    body.current.setTranslation(
      {
        x: piece.position[0],
        y: piece.position[1],
        z: piece.position[2],
      },
      true,
    );
    body.current.setRotation(
      {
        x: initialRotation.x,
        y: initialRotation.y,
        z: initialRotation.z,
        w: initialRotation.w,
      },
      true,
    );
    body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    wasBroken.current = false;
  }, [initialRotation, piece.position, resetVersion]);

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
      <BreakablePieceMesh piece={piece} />
    </RigidBody>
  );
});

function BreakableObjects({
  brokenPieces,
  shatteredPieces,
  resetVersion,
  registerBody,
  onDebrisContact,
}: {
  brokenPieces: ReadonlySet<string>;
  shatteredPieces: ReadonlySet<string>;
  resetVersion: number;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onDebrisContact: (
    piece: BreakablePieceDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
  ) => void;
}) {
  return (
    <group>
      {breakablePieces.map((piece) =>
        shatteredPieces.has(piece.id) ? null : (
          <BreakablePiece
            key={piece.id}
            piece={piece}
            broken={brokenPieces.has(piece.id)}
            resetVersion={resetVersion}
            registerBody={registerBody}
            onDebrisContact={onDebrisContact}
          />
        ),
      )}
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
        castShadow
        receiveShadow
        material={material}
        userData={{
          breakableShard: shard.id,
          breakableMaterial: shard.material,
        }}
      >
        <boxGeometry args={[...shard.size]} />
      </mesh>
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
        castShadow
        receiveShadow
        material={material}
        userData={{
          breakableRemnant: remnant.id,
          breakableMaterial: remnant.material,
        }}
      >
        <boxGeometry args={[...remnant.size]} />
      </mesh>
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

function FirstPersonMachineGun({
  shotsRef,
}: {
  shotsRef: { current: number };
}) {
  const group = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const { camera } = useThree();
  const kickProgress = useRef(1);
  const flashTime = useRef(1);
  const seenShots = useRef(0);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (seenShots.current !== shotsRef.current) {
      seenShots.current = shotsRef.current;
      kickProgress.current = 0;
      flashTime.current = 0;
    }

    kickProgress.current = Math.min(1, kickProgress.current + delta * 11);
    flashTime.current += delta;
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(0.36, -0.3 + recoil * 0.014, -0.58 + recoil * 0.075);
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(recoil * 0.09, -0.045, 0.02);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));

    const flashVisible = flashTime.current < 0.05;
    if (flash.current) {
      flash.current.visible = flashVisible;
      flash.current.rotation.z += delta * 40;
    }
    if (light.current) {
      light.current.intensity = flashVisible ? 9 : 0;
    }
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh position={[0, 0, -0.42]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.034, 0.56, 10]} />
        <meshStandardMaterial color="#33383b" metalness={0.72} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0, -0.24]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.3, 10]} />
        <meshStandardMaterial color="#42484c" metalness={0.6} roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.005, 0.06]} castShadow>
        <boxGeometry args={[0.13, 0.15, 0.36]} />
        <meshStandardMaterial color="#3a3f42" metalness={0.55} roughness={0.46} />
      </mesh>
      <mesh position={[0.1, -0.02, 0.05]} castShadow>
        <boxGeometry args={[0.08, 0.11, 0.16]} />
        <meshStandardMaterial color="#4c5233" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.13, 0.14]} rotation={[0.32, 0, 0]} castShadow>
        <boxGeometry args={[0.045, 0.16, 0.06]} />
        <meshStandardMaterial color="#241f18" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, -0.02]} castShadow>
        <boxGeometry args={[0.028, 0.05, 0.09]} />
        <meshStandardMaterial color="#20261f" metalness={0.4} roughness={0.5} />
      </mesh>
      <group ref={flash} position={[0, 0, -0.74]} visible={false}>
        <mesh>
          <boxGeometry args={[0.16, 0.05, 0.05]} />
          <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.16, 0.05, 0.05]} />
          <meshBasicMaterial color="#ffce6e" toneMapped={false} />
        </mesh>
        <pointLight ref={light} color="#ffc46e" distance={5} decay={2} />
      </group>
    </group>
  );
}

const VOXEL_COUNT = 84;
const VOXEL_LIFE = 1.15;
const voxelFireColors = ["#fff3c4", "#ffd166", "#ff9f43", "#f4652f", "#c73e1d"];
const voxelSmokeColors = ["#787878", "#5c5c5c", "#454545"];

function VoxelExplosion({
  explosion,
  onDone,
}: {
  explosion: VoxelExplosionDefinition;
  onDone: (id: number) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const light = useRef<PointLight>(null);
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
        const speed = 3.2 + (((index * 37) % 23) / 23) * 5.6;

        return {
          direction: [
            Math.sin(inclination) * Math.cos(azimuth),
            Math.abs(Math.cos(inclination)) * 0.8 + 0.3,
            Math.sin(inclination) * Math.sin(azimuth),
          ] as const,
          speed,
          size: 0.07 + (((index * 53) % 17) / 17) * 0.17,
          spin: (((index * 29) % 13) / 13) * 6,
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
      const isFire = index % 5 !== 0;
      const palette = isFire ? voxelFireColors : voxelSmokeColors;
      color.set(palette[(index * 7) % palette.length]);
      instanced.setColorAt(index, color);
    }
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }

    return () => {
      geometry.dispose();
      voxelMaterial.dispose();
    };
  }, [geometry, voxelMaterial]);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const time = elapsed.current;
    const instanced = mesh.current;

    if (instanced) {
      for (let index = 0; index < VOXEL_COUNT; index += 1) {
        const particle = particles[index];
        const travel = particle.speed * time * (1 - time * 0.32);
        const grow =
          time < 0.1
            ? time / 0.1
            : Math.max(0, 1 - (time - 0.1) / (VOXEL_LIFE - 0.1));

        dummy.position.set(
          particle.direction[0] * travel,
          particle.direction[1] * travel - 3.4 * time * time,
          particle.direction[2] * travel,
        );
        dummy.rotation.set(
          particle.spin * time,
          particle.spin * 0.7 * time,
          particle.spin * 0.4 * time,
        );
        dummy.scale.setScalar(Math.max(0.0001, particle.size * grow));
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
    }

    if (light.current) {
      light.current.intensity = Math.max(0, 30 * (1 - time / 0.32));
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
      <pointLight ref={light} color="#ffb45e" distance={10} decay={2} />
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
      <CuboidCollider args={[30.5, 0.12, 21.5]} position={[15, -0.42, -6]} friction={1} />
      <CuboidCollider args={[0.12, 8, 21.5]} position={[-15.5, 7.6, -6]} />
      <CuboidCollider args={[0.12, 8, 21.5]} position={[45.5, 7.6, -6]} />
      <CuboidCollider args={[30.5, 8, 0.12]} position={[15, 7.6, -27.5]} />
      <CuboidCollider args={[30.5, 8, 0.12]} position={[15, 7.6, 15.5]} />
    </RigidBody>
  );
}

type TimeOfDay = "day" | "sunset" | "night";

const timeOfDayTargets: Record<TimeOfDay, number> = {
  day: 0.25,
  sunset: 0.484,
  night: 0.75,
};

// Manually switched time of day: the sun sweeps to the requested position,
// sky and fog recolour, window glow and courtyard lamps come alive at night.
function DayNightCycle({
  mode,
  nightRef,
}: {
  mode: TimeOfDay;
  nightRef: { current: number };
}) {
  const directional = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const fogRef = useRef<Fog>(null);
  const backgroundRef = useRef<Color>(null);
  const time = useRef(timeOfDayTargets.day);
  const skyThrottle = useRef(10);
  const lastSkyTime = useRef(-1);
  const [skySun, setSkySun] = useState<readonly [number, number, number]>([
    24, 12, 14,
  ]);
  const dayColor = useMemo(() => new Color("#9cc0ce"), []);
  const duskColor = useMemo(() => new Color("#d09a67"), []);
  const nightColor = useMemo(() => new Color("#0d1420"), []);
  const sunWarmColor = useMemo(() => new Color("#ffc07a"), []);
  const sunDayColor = useMemo(() => new Color("#fff3d7"), []);
  const moonColor = useMemo(() => new Color("#8fa5c8"), []);
  const scratchColor = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    const target = timeOfDayTargets[mode];
    const diff = ((target - time.current + 1.5) % 1) - 0.5;
    const step =
      Math.sign(diff) * Math.min(Math.abs(diff), delta * 0.22);
    time.current = (time.current + step + 1) % 1;
    const angle = time.current * Math.PI * 2;
    const elevation = Math.sin(angle);
    const azimuth = angle + Math.PI * 0.3;
    const day = MathUtils.clamp(elevation / 0.32, 0, 1);
    const night = 1 - day;
    const twilight = MathUtils.clamp(1 - Math.abs(elevation) * 3.4, 0, 1);

    const sunX = Math.cos(azimuth) * 30;
    const sunZ = Math.sin(azimuth) * 24;
    const sunY = elevation * 26;

    if (directional.current) {
      directional.current.position.set(sunX, Math.max(sunY, 7), sunZ);
      directional.current.intensity = 0.32 + 2.8 * day;
      if (day > 0.02) {
        scratchColor
          .copy(sunWarmColor)
          .lerp(sunDayColor, MathUtils.clamp(elevation * 2.4, 0, 1));
        directional.current.color.copy(scratchColor);
      } else {
        directional.current.color.copy(moonColor);
      }
    }
    if (hemisphere.current) {
      hemisphere.current.intensity = 0.14 + 0.9 * day;
    }

    scratchColor
      .copy(nightColor)
      .lerp(dayColor, day)
      .lerp(duskColor, twilight * 0.8);
    fogRef.current?.color.copy(scratchColor);
    backgroundRef.current?.copy(scratchColor);

    setWindowGlow(night * 1.9);
    nightRef.current = night;

    skyThrottle.current += delta;
    if (
      skyThrottle.current > 0.25 &&
      Math.abs(time.current - lastSkyTime.current) > 0.003
    ) {
      skyThrottle.current = 0;
      lastSkyTime.current = time.current;
      setSkySun([sunX, sunY, sunZ]);
    }
  });

  return (
    <>
      <color ref={backgroundRef} attach="background" args={["#92b9c8"]} />
      <fog ref={fogRef} attach="fog" args={["#9cc0ce", 45, 110]} />
      <Sky
        distance={520}
        sunPosition={[...skySun]}
        turbidity={5.5}
        rayleigh={1.6}
        mieCoefficient={0.004}
        mieDirectionalG={0.75}
      />
      <hemisphereLight ref={hemisphere} args={["#d8f0ff", "#4d5d38", 1.05]} />
      <directionalLight
        ref={directional}
        castShadow
        position={[10, 16, 9]}
        intensity={3.1}
        color="#fff3d7"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
      />
    </>
  );
}

// A real light for each lamp fixture; goes dark when its shade is smashed.
function LampLight({
  lamp,
  broken,
  nightRef,
}: {
  lamp: LampDefinition;
  broken: boolean;
  nightRef: { current: number };
}) {
  const light = useRef<PointLight>(null);

  useFrame(() => {
    if (light.current) {
      light.current.intensity = broken ? 0 : nightRef.current * 2.6;
    }
  });

  return (
    <pointLight
      ref={light}
      position={[...lamp.position]}
      color="#ffd9a0"
      distance={9}
      decay={1.8}
    />
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
}: OpenWorldSceneProps) {
  const { camera, scene } = useThree();
  const { rapier } = useRapier();
  const raycaster = useMemo(() => new Raycaster(), []);
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
  const pieceBodies = useRef(new Map<string, RapierRigidBody>());
  const restCounters = useRef(new Map<string, number>());
  const settleAccumulator = useRef(0);
  const strikeTimers = useRef<ReturnType<typeof window.setTimeout>[]>([]);
  const shardsRef = useRef<readonly ShardDefinition[]>([]);
  const shardById = useRef(new Map<string, ShardDefinition>());
  const shardCounter = useRef(0);
  const impactShatterTimes = useRef<number[]>([]);
  const chipTimes = useRef<number[]>([]);
  const hingedDoors = useMemo(
    () => breakablePieces.filter((piece) => piece.hinge),
    [],
  );
  const doorStates = useRef(
    new Map<string, { angle: number; sign: number }>(),
  );
  const doorCameraDir = useRef(new Vector3());
  const doorToTarget = useRef(new Vector3());
  const doorQuaternion = useRef(new Quaternion());
  const doorRelative = useRef(new Vector3());
  const doorUpAxis = useRef(new Vector3(0, 1, 0));
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

  const registerBody = useCallback(
    (id: string, body: RapierRigidBody | null) => {
      if (body) {
        pieceBodies.current.set(id, body);
      } else {
        pieceBodies.current.delete(id);
      }
    },
    [],
  );

  const ensureDynamic = useCallback(
    (body: RapierRigidBody) => {
      if (body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
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
  }, [onBrokenCountChange]);

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
    impactShatterTimes.current = [];
    chipTimes.current = [];
    doorStates.current.clear();
    for (const timer of strikeTimers.current) {
      window.clearTimeout(timer);
    }
    strikeTimers.current = [];
    onBrokenCountChange(settled.size);
  }, [onBrokenCountChange, resetVersion]);

  // Doors on hinges: swing open away from the player when approached and
  // looked at, swing shut when the player walks away. A door stays a fully
  // breakable piece — hits knock it off its hinges as usual.
  useFrame((_, delta) => {
    const states = doorStates.current;
    camera.getWorldDirection(doorCameraDir.current);

    for (const door of hingedDoors) {
      if (brokenPiecesRef.current.has(door.id)) {
        states.delete(door.id);
        continue;
      }
      const body = pieceBodies.current.get(door.id);
      if (!body || body.bodyType() === rapier.RigidBodyType.Dynamic) {
        continue;
      }

      const hinge = door.hinge!;
      let state = states.get(door.id);
      if (!state) {
        state = { angle: 0, sign: 0 };
        states.set(door.id, state);
      }

      const dx = camera.position.x - hinge.pivot[0];
      const dy = camera.position.y - door.position[1];
      const dz = camera.position.z - hinge.pivot[2];
      const distance = Math.hypot(dx, dy, dz);

      let open: boolean;
      if (state.angle > 0.05) {
        open = distance < 3.2;
      } else {
        doorToTarget.current
          .set(
            door.position[0] - camera.position.x,
            door.position[1] - camera.position.y,
            door.position[2] - camera.position.z,
          )
          .normalize();
        open =
          distance < 2.4 &&
          doorToTarget.current.dot(doorCameraDir.current) > 0.25;
      }

      if (open && state.sign === 0) {
        const side =
          Math.sign(dx * hinge.normal[0] + dz * hinge.normal[2]) || 1;
        const crossDotNormal =
          hinge.direction[2] * hinge.normal[0] -
          hinge.direction[0] * hinge.normal[2];
        state.sign = -side * Math.sign(crossDotNormal || 1);
      }

      const targetAngle = open ? 1.8 : 0;
      state.angle +=
        (targetAngle - state.angle) * Math.min(1, delta * (open ? 5 : 3));

      if (!open && state.angle < 0.02) {
        state.angle = 0;
        state.sign = 0;
        if (body.bodyType() !== rapier.RigidBodyType.Fixed) {
          body.setBodyType(rapier.RigidBodyType.Fixed, true);
          body.setTranslation(
            {
              x: door.position[0],
              y: door.position[1],
              z: door.position[2],
            },
            false,
          );
          body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
        }
        continue;
      }

      if (
        body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased
      ) {
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      }

      doorQuaternion.current.setFromAxisAngle(
        doorUpAxis.current,
        state.sign * state.angle,
      );
      doorRelative.current
        .set(
          door.position[0] - hinge.pivot[0],
          0,
          door.position[2] - hinge.pivot[2],
        )
        .applyQuaternion(doorQuaternion.current);
      body.setNextKinematicTranslation({
        x: hinge.pivot[0] + doorRelative.current.x,
        y: door.position[1],
        z: hinge.pivot[2] + doorRelative.current.z,
      });
      body.setNextKinematicRotation({
        x: doorQuaternion.current.x,
        y: doorQuaternion.current.y,
        z: doorQuaternion.current.z,
        w: doorQuaternion.current.w,
      });
    }
  });

  // Put settled debris to sleep and drop CCD so a big mess stays cheap.
  useFrame((_, delta) => {
    settleAccumulator.current += delta;
    if (settleAccumulator.current < 0.45) {
      return;
    }
    settleAccumulator.current = 0;

    for (const [id, body] of pieceBodies.current) {
      if (
        id === "player" ||
        body.bodyType() !== rapier.RigidBodyType.Dynamic ||
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

  const breakAt = useCallback(
    (target: BreakablePieceDefinition, currentImpact: number) => {
      const next = fractureAt(target, brokenPiecesRef.current, currentImpact);
      brokenPiecesRef.current = next;
      setBrokenPieces(next);
      onBrokenCountChange(next.size);
    },
    [onBrokenCountChange],
  );

  const applyImpact = useCallback(
    (
      pieceId: string,
      material: BreakableMaterial,
      point: Vector3,
      direction: Vector3,
      power = 1,
    ) => {
      const body = pieceBodies.current.get(pieceId);
      if (!body) {
        return;
      }

      const profile = materialRuntimeProfiles[material];
      ensureDynamic(body);
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
    },
    [ensureDynamic],
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
      const resolved = settleAfterBreak(next);
      brokenPiecesRef.current = resolved;
      setBrokenPieces(resolved);
      onBrokenCountChange(resolved.size);
    },
    [onBrokenCountChange],
  );

  // Replace a whole box body with real sub-boxes of the same object,
  // preserving its current pose and motion.
  const shatterTarget = useCallback(
    (
      source: ShardSource,
      origin: "piece" | "shard" | "remnant",
      burstCenter: Vector3 | null,
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

      shardCounter.current += 1;
      const generated = buildShards(
        source,
        `shard:${shardCounter.current}`,
        bodyPosition,
        new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z),
        new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z),
        burstCenter ?? bodyPosition,
        burstSpeed,
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
      setBursts((current) => [
        ...current,
        {
          id: burstId.current,
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
      if (!body || body.bodyType() !== rapier.RigidBodyType.Fixed) {
        return { carved: false, brokenParentId: null };
      }

      const parentId = remnant ? remnant.parentId : targetId;
      const translation = body.translation();
      const rotation = body.rotation();
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
      setBursts((current) => [
        ...current,
        {
          id: burstId.current,
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
        ensureDynamic(body);
        body.wakeUp();
      }

      const volume = remnant.size[0] * remnant.size[1] * remnant.size[2];
      return subtractParentVolume(remnant.parentId, volume);
    },
    [ensureDynamic, subtractParentVolume],
  );

  // Support sweep for carved leftovers: a group of fixed remnants that no
  // longer touches any standing structure falls, and a carved piece with no
  // standing remnants left stops pretending to carry load.
  const settleWorld = useCallback(() => {
    const touches = (
      a: { min: readonly number[]; max: readonly number[] },
      b: { min: readonly number[]; max: readonly number[] },
    ) => {
      for (let axis = 0; axis < 3; axis += 1) {
        if (
          a.min[axis] - 0.06 > b.max[axis] ||
          b.min[axis] - 0.06 > a.max[axis]
        ) {
          return false;
        }
      }
      return true;
    };

    const remnantBounds = (remnant: RemnantDefinition) => {
      const quaternion = new Quaternion(...remnant.quaternion);
      const axisX = new Vector3(remnant.size[0] / 2, 0, 0).applyQuaternion(
        quaternion,
      );
      const axisY = new Vector3(0, remnant.size[1] / 2, 0).applyQuaternion(
        quaternion,
      );
      const axisZ = new Vector3(0, 0, remnant.size[2] / 2).applyQuaternion(
        quaternion,
      );
      const extents = [
        Math.abs(axisX.x) + Math.abs(axisY.x) + Math.abs(axisZ.x),
        Math.abs(axisX.y) + Math.abs(axisY.y) + Math.abs(axisZ.y),
        Math.abs(axisX.z) + Math.abs(axisY.z) + Math.abs(axisZ.z),
      ];
      return {
        min: [
          remnant.position[0] - extents[0],
          remnant.position[1] - extents[1],
          remnant.position[2] - extents[2],
        ],
        max: [
          remnant.position[0] + extents[0],
          remnant.position[1] + extents[1],
          remnant.position[2] + extents[2],
        ],
      };
    };

    for (let pass = 0; pass < 4; pass += 1) {
      const broken = brokenPiecesRef.current;
      const fixedRemnants = remnantsRef.current.filter(
        (remnant) => !remnant.detached && !broken.has(remnant.parentId),
      );
      const boundsById = new Map(
        fixedRemnants.map((remnant) => [remnant.id, remnantBounds(remnant)]),
      );
      const standingBounds = breakablePieces
        .filter(
          (piece) =>
            !broken.has(piece.id) && !carvedPiecesRef.current.has(piece.id),
        )
        .map((piece) => ({
          min: [
            piece.position[0] - piece.size[0] / 2,
            piece.position[1] - piece.size[1] / 2,
            piece.position[2] - piece.size[2] / 2,
          ],
          max: [
            piece.position[0] + piece.size[0] / 2,
            piece.position[1] + piece.size[1] / 2,
            piece.position[2] + piece.size[2] / 2,
          ],
        }));

      const byParent = new Map<string, RemnantDefinition[]>();
      for (const remnant of fixedRemnants) {
        const group = byParent.get(remnant.parentId);
        if (group) {
          group.push(remnant);
        } else {
          byParent.set(remnant.parentId, [remnant]);
        }
      }

      const toDetach: RemnantDefinition[] = [];
      for (const [parentId, group] of byParent) {
        const visited = new Set<string>();

        for (const seed of group) {
          if (visited.has(seed.id)) {
            continue;
          }

          const component: RemnantDefinition[] = [];
          const stack = [seed];
          visited.add(seed.id);
          while (stack.length > 0) {
            const current = stack.pop()!;
            component.push(current);
            const currentBounds = boundsById.get(current.id)!;
            for (const other of group) {
              if (
                !visited.has(other.id) &&
                touches(currentBounds, boundsById.get(other.id)!)
              ) {
                visited.add(other.id);
                stack.push(other);
              }
            }
          }

          let anchored = false;
          for (const member of component) {
            const memberBounds = boundsById.get(member.id)!;
            if (standingBounds.some((bounds) => touches(memberBounds, bounds))) {
              anchored = true;
              break;
            }
            if (
              fixedRemnants.some(
                (other) =>
                  other.parentId !== parentId &&
                  touches(memberBounds, boundsById.get(other.id)!),
              )
            ) {
              anchored = true;
              break;
            }
          }

          if (!anchored) {
            toDetach.push(...component);
          }
        }
      }

      const volumeBroken = new Set<string>();
      if (toDetach.length > 0) {
        const detachIds = new Set(toDetach.map((remnant) => remnant.id));
        const updated = remnantsRef.current.map((remnant) =>
          detachIds.has(remnant.id)
            ? { ...remnant, detached: true }
            : remnant,
        );
        remnantsRef.current = updated;
        remnantById.current = new Map(
          updated.map((remnant) => [remnant.id, remnant]),
        );
        setRemnants(updated);

        for (const remnant of toDetach) {
          const body = pieceBodies.current.get(remnant.id);
          if (body) {
            ensureDynamic(body);
            body.wakeUp();
          }
          const volume =
            remnant.size[0] * remnant.size[1] * remnant.size[2];
          if (subtractParentVolume(remnant.parentId, volume)) {
            volumeBroken.add(remnant.parentId);
          }
        }
      }

      for (const parentId of carvedPiecesRef.current) {
        if (broken.has(parentId) || volumeBroken.has(parentId)) {
          continue;
        }
        const hasStanding = remnantsRef.current.some(
          (remnant) => remnant.parentId === parentId && !remnant.detached,
        );
        if (!hasStanding) {
          volumeBroken.add(parentId);
        }
      }

      breakPieces([...volumeBroken]);
      if (toDetach.length === 0 && volumeBroken.size === 0) {
        break;
      }
    }
  }, [breakPieces, ensureDynamic, subtractParentVolume]);

  const fireRound = useCallback(() => {
    playGunshotSound();
    mgShots.current += 1;

    const direction = camera.getWorldDirection(new Vector3());
    direction.x += (Math.random() - 0.5) * 0.024;
    direction.y += (Math.random() - 0.5) * 0.024;
    direction.z += (Math.random() - 0.5) * 0.024;
    direction.normalize();
    raycaster.set(camera.position, direction);
    const intersections = raycaster.intersectObjects(scene.children, true);
    const hit = intersections.find(
      (intersection) =>
        (typeof intersection.object.userData.breakablePiece === "string" ||
          typeof intersection.object.userData.breakableShard === "string" ||
          typeof intersection.object.userData.breakableRemnant === "string") &&
        intersection.distance <= MG_RANGE,
    );

    const muzzle = new Vector3(0.36, -0.26, -0.8)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const end = hit
      ? hit.point
      : camera.position.clone().add(direction.clone().multiplyScalar(MG_RANGE));
    tracerId.current += 1;
    setTracers((current) => [
      ...current.slice(-8),
      {
        id: tracerId.current,
        from: [muzzle.x, muzzle.y, muzzle.z],
        to: [end.x, end.y, end.z],
      },
    ]);

    if (!hit) {
      return;
    }

    const userData = hit.object.userData;
    const pieceId = userData.breakablePiece as string | undefined;
    const shardId = userData.breakableShard as string | undefined;
    const remnantId = userData.breakableRemnant as string | undefined;
    const piece = pieceId ? breakablePieceById.get(pieceId) : undefined;
    const material =
      piece?.material ??
      (userData.breakableMaterial as BreakableMaterial | undefined);
    const targetId = pieceId ?? shardId ?? remnantId;

    if (!targetId || !material) {
      return;
    }

    const point = hit.point.clone();

    if (material === "steel") {
      // Bullets don't pierce steel — sparks and a shove.
      burstId.current += 1;
      setBursts((current) => [
        ...current,
        {
          id: burstId.current,
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
      // Glass blows out whole.
      if (piece && !brokenPiecesRef.current.has(piece.id)) {
        impactId.current += 1;
        breakAt(piece, impactId.current);
        if (!shatterTarget(piece, "piece", point, 5)) {
          applyImpact(piece.id, material, point, direction, 0.6);
        }
        settleWorld();
        return;
      }
      applyImpact(targetId, material, point, direction, 0.5);
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
    raycaster,
    scene.children,
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
      setExplosions((current) => [
        ...current,
        {
          id: explosionId.current,
          position: [center3.x, center3.y, center3.z],
        },
      ]);
      burstId.current += 1;
      setBursts((current) => [
        ...current,
        {
          id: burstId.current,
          position: [center3.x, center3.y + 0.2, center3.z],
          direction: [0, 1, 0],
          material: "soil",
        },
      ]);

      const previousBroken = brokenPiecesRef.current;
      const next = new Set(previousBroken);
      for (const piece of breakablePieces) {
        if (next.has(piece.id)) {
          continue;
        }

        const radius =
          BLAST_RADIUS *
          blastFactorByMaterial[piece.material] *
          (0.78 + blastNoise(piece.id, explosionId.current) * 0.44);
        const dx = piece.position[0] - center3.x;
        const dy = piece.position[1] - center3.y;
        const dz = piece.position[2] - center3.z;
        if (dx * dx + dy * dy + dz * dz <= radius * radius) {
          next.add(piece.id);
        }
      }

      const resolved = settleAfterBreak(next);
      brokenPiecesRef.current = resolved;
      setBrokenPieces(resolved);
      onBrokenCountChange(resolved.size);

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
          distance: Math.hypot(
            candidate.position[0] - center3.x,
            candidate.position[1] - center3.y,
            candidate.position[2] - center3.z,
          ),
        }))
        .filter((entry) => entry.distance <= BLAST_RADIUS)
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 10);

      for (const entry of shatterCandidates) {
        if (shatterTarget(entry.piece, "piece", center3, 8.5)) {
          shatteredNow.add(entry.piece.id);
        }
      }

      // Crater: bite chunks out of standing pieces at the blast edge and rip
      // loose remnants that hang near the blast.
      const volumeBroken: string[] = [];
      let craterBudget = 8;
      for (const piece of breakablePieces) {
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

        const pieceDistance = Math.hypot(
          piece.position[0] - center3.x,
          piece.position[1] - center3.y,
          piece.position[2] - center3.z,
        );
        if (
          pieceDistance >
          BLAST_RADIUS * 1.6 + Math.max(...piece.size) / 2
        ) {
          continue;
        }

        const carve = carveAt(piece.id, center3, BLAST_RADIUS * 0.8, null);
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

      for (const [id, body] of pieceBodies.current) {
        if (shatteredNow.has(id)) {
          continue;
        }
        const translation = body.translation();
        const dx = translation.x - center3.x;
        const dy = translation.y - center3.y;
        const dz = translation.z - center3.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > BLAST_PUSH_RADIUS) {
          continue;
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
          continue;
        }

        const isDynamic = body.bodyType() === rapier.RigidBodyType.Dynamic;
        if (!isDynamic && !finalBroken.has(id)) {
          continue;
        }

        ensureDynamic(body);
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
      }

      settleWorld();
    },
    [
      breakPieces,
      carveAt,
      detachRemnant,
      ensureDynamic,
      onBrokenCountChange,
      rapier,
      settleWorld,
      shatterTarget,
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
    setGrenades((current) => [
      ...current,
      {
        id: grenadeId.current,
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
      if (intensity >= 0.18) {
        playDebrisSound(piece.material, Math.min(1, intensity));
      }

      if (!crumbleOnLanding.has(piece.material)) {
        return;
      }

      // Fall damage is self-inflicted only: the piece must itself be moving
      // fast (it fell) — a resting piece that something lands ON stays whole.
      const body = pieceBodies.current.get(piece.id);
      if (!body) {
        return;
      }
      const linvel = body.linvel();
      const ownSpeedSq =
        linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z;
      if (ownSpeedSq < 9) {
        return;
      }

      const now = performance.now();

      // Brutal impacts crumble the faller completely.
      if (intensity >= 1.15) {
        impactShatterTimes.current = impactShatterTimes.current.filter(
          (time) => now - time < 350,
        );
        if (impactShatterTimes.current.length >= 2) {
          return;
        }
        if (shatterTarget(piece, "piece", null, 1.6)) {
          impactShatterTimes.current.push(now);
          settleWorld();
        }
        return;
      }

      // Hard (but survivable) landings chip the struck corner — minimally.
      if (intensity < 0.7) {
        return;
      }
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
    (shard: ShardDefinition, magnitude: number, mass: number) => {
      const intensity = magnitude / Math.max(0.001, mass * 320);
      if (intensity >= 0.24) {
        playDebrisSound(shard.material, Math.min(1, intensity));
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

    raycaster.setFromCamera(center, camera);
    const intersections = raycaster.intersectObjects(scene.children, true);
    const hit = intersections.find(
      (intersection) =>
        typeof intersection.object.userData.breakablePiece === "string" ||
        typeof intersection.object.userData.breakableShard === "string" ||
        typeof intersection.object.userData.breakableRemnant === "string",
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

    const primaryPieceId = hit.object.userData.breakablePiece as
      | string
      | undefined;
    const shardId = hit.object.userData.breakableShard as string | undefined;
    const remnantId = hit.object.userData.breakableRemnant as
      | string
      | undefined;
    const piece = primaryPieceId
      ? breakablePieceById.get(primaryPieceId)
      : undefined;
    const material =
      piece?.material ??
      (hit.object.userData.breakableMaterial as BreakableMaterial | undefined);
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
      setBursts((current) => [
        ...current,
        {
          id: burstId.current,
          position: [point.x, point.y, point.z],
          direction: [direction.x, direction.y, direction.z],
          material,
        },
      ]);

      const strikeSpeed = materialRuntimeProfiles[material].impulse * 2.1;

      if (piece) {
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
    camera,
    center,
    commitRemnants,
    fallbackLook,
    fireGrenade,
    fireRound,
    raycaster,
    scene.children,
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
      <BreakableObjects
        brokenPieces={brokenPieces}
        shatteredPieces={hiddenPieces}
        resetVersion={resetVersion}
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
      {tracers.map((tracer) => (
        <Tracer key={tracer.id} tracer={tracer} onDone={removeTracer} />
      ))}
      {grenades.map((grenade) => (
        <Grenade
          key={grenade.id}
          grenade={grenade}
          onExplode={handleGrenadeExplode}
        />
      ))}
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
        <DustBurst key={burst.id} burst={burst} onDone={removeBurst} />
      ))}
      {explosions.map((explosion) => (
        <VoxelExplosion
          key={explosion.id}
          explosion={explosion}
          onDone={removeExplosion}
        />
      ))}
    </>
  );
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reset]);

  const progress = Math.round((brokenCount / breakablePieces.length) * 100);
  const startPlaying = useCallback(() => {
    setActive(true);
    setFallbackLook(false);
    setControlRequest((version) => version + 1);
  }, []);

  return (
    <main className="play-page">
      <div className="game-canvas-wrap">
        <KeyboardControls map={[...keyboardMap]}>
          <Canvas
            className="game-canvas"
            shadows
            dpr={[1, 1.5]}
            camera={{
              position: [
                PLAYER_SPAWN[0],
                PLAYER_SPAWN[1] + 0.54,
                PLAYER_SPAWN[2],
              ],
              fov: 72,
              near: 0.05,
              far: 640,
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
            onCreated={() => setReady(true)}
          >
            <Suspense fallback={null}>
              <Physics
                gravity={[0, -14, 0]}
                numSolverIterations={6}
                maxCcdSubsteps={2}
              >
                <OpenWorldScene
                  active={active}
                  weapon={weapon}
                  timeOfDay={timeOfDay}
                  fallbackLook={fallbackLook}
                  controlRequest={controlRequest}
                  resetVersion={resetVersion}
                  onActiveChange={setActive}
                  onFallbackChange={setFallbackLook}
                  onBrokenCountChange={setBrokenCount}
                />
              </Physics>
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
              Дом, терраса, беседка — а через двор целая панельная
              четырёхэтажка: подъезды с лестницами и перилами, квартиры с
              мебелью и дверями, балконы. День сменяется ночью, в квартирах
              загораются окна. Клик — молоток, 2 — гранатомёт, 3 — пулемёт:
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
