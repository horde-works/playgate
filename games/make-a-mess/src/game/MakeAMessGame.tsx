"use client";

import { KeyboardControls, useKeyboardControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type ContactForceHandler,
  type RapierRigidBody,
} from "@react-three/rapier";
import {
  remnantBodySpec,
  shardBodySpec,
  type DebrisColliderSpec,
} from "./debrisBodyPool";
import {
  executeCarveKernel,
  type CarveKernelRequest,
  type CarveKernelResponse,
} from "./carveKernel";
import Link from "next/link";
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
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
  type LampDefinition,
  type LampEventState,
  type SceneVector3,
  type SpotLightDefinition,
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
  closestPointOnOccupiedGeometry,
  compilePieceDamageGeometry,
  crumbleOnLanding,
  damageBody,
  debrisColliderBoxes,
  debrisCollisionTuning,
  debrisSleepSampleRequirement,
  fractureEnergyByMaterial,
  grenadeEnergyAtDistance,
  groundMaterials,
  selectCarveTargetsWithinBudget,
  impactDamageRadius,
  omittedDebrisColliderBoxes,
  rocketEnergyAtDistance,
  segmentIntersectsOccupiedGeometry,
  trimShardBudget,
  type FractureCause,
  type DebrisColliderBox,
  type OccupiedGeometryBox,
  type RemnantDefinition,
  type ShardDefinition,
  type ShardSource,
} from "./destructionRuntime";
import { createBreakablePieceIndex } from "./breakablePieceIndex";
import type { VehicleContactDamageRequest } from "./vehicleContactDamage";
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
import { GrenadeProjectileVisual } from "./GrenadeProjectileVisual";
import { DynamicBreakableWorld } from "./DynamicBreakableWorld";
import { getPieceRenderBoxes } from "./breakableGeometry";
import { Birds } from "./Birds";
import { Villagers } from "./Villagers";
import type { VillagerReport } from "./villagerSim";
import { vikingSettlement } from "../content/scenes/vikingSettlement.ts";
import { GrassField } from "./GrassField";
import { SceneDressing } from "./SceneDressing";
import { WorldEdge } from "./WorldEdge";
import { HingedDoorSystem, type HingedEntryApproach } from "./HingedDoorSystem";
import {
  entryInteractionActions,
  numberedEntryInteractionAction,
  preferredEntryInteraction,
  type EntryInteractionAction,
} from "./entryInteraction.ts";
import { SmokePlumes } from "./SmokePlumes";
import { WindController } from "./WindController";
import { IntactBreakableWorld } from "./IntactBreakableWorld";
import {
  VehicleFrameSystem,
  type RotorcraftPilotStatus,
  type VehicleFramePoseState,
} from "./VehicleFrameSystem";
import { AstanaTrainSystem } from "./AstanaTrainSystem";
import {
  BasaltForceFieldSystem,
  type BasaltForceFieldRuntime,
} from "./BasaltForceFieldSystem";
import type { BasaltForceFieldPose } from "./basaltForceField.ts";
import { BASALT_SKY_RAM_CLUSTER_ID } from "./basaltSkyRam.ts";
import {
  BASALT_FORCE_FIELD_APPROACH_BULGE,
  BASALT_FORCE_FIELD_APPROACH_RANGE,
  BASALT_FORCE_FIELD_PRESS_DEPTH,
  type BasaltForceFieldHit,
} from "./basaltForceField";
import { astanaTrainClusterDefinitions } from "./astanaTrainRuntime";
import {
  isVehicleFramePiece,
  vehicleFrameForCluster,
  vehiclePiecePosition,
  vehicleRotation,
  rotateVector as rotateVehicleVector,
} from "./vehicleFrames";
import { buildIntactGroundRenderColors } from "./intactWorldBatching";
import { resolveRuntimeStructure } from "./runtimeStructure";
import { createSpatialIndex } from "./spatialIndex";
import {
  ISLAND_CHART,
  interIslandJourneyCopyKey,
  islandIdForScene,
  type IslandId,
} from "./islandTopology.ts";
import {
  WORLD_SEAL_TIMEOUT_MS,
  announcesPlayerChoice,
  asksForPointerGesture,
  captionAccepts,
  frameSurfaces,
  initialWorldEntryState,
  reduceWorldEntry,
  shutterCaptionMessage,
  transitBannerMessage,
  transitLeg,
  type CaptionPriority,
  type WorldEntryStage,
} from "./worldEntryPresentation.ts";
import {
  interIslandArrivalRequest,
  interIslandTransferDestination,
} from "./interIslandRoutes.ts";
import {
  INTER_ISLAND_PASSENGER_STORAGE_KEY,
  interIslandPassengerAccess,
  interIslandWeaponSelectionBlocked,
  parseInterIslandPassengerTransit,
  type InterIslandPassengerHandoff,
  type InterIslandPassengerTransit,
} from "./interIslandPassenger.ts";
import {
  shipFormForIsland,
  shipTransmutationPlan,
} from "./shipTransmutation.ts";
import {
  ACTOR_SAFETY_FLOOR,
  ACTOR_ABOARD,
  ACTOR_NORMAL,
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_NORMAL,
  DEBRIS_SETTLING,
  WORLD_BOUNDARY,
} from "./physicsInteractionGroups";
import {
  detachedTreeFoliageSize,
  expandBrokenTreeDescendants,
  flattenDetachedTreeFoliage,
} from "./treeVisualModel";
import {
  PLAYER_CAPSULE_FOOT_OFFSET,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_GRAVITY,
  autoClimbLiftSpeed,
  autoStepLiftSpeed,
  setFlightVelocityTarget,
  stepCarryWindow,
} from "./playerMovement";
import { isBelowWorldDisappearDepth, worldDisappearY } from "./worldFalloff";
import {
  movingSupportBoundaryState,
  passengerFallReturnPoint,
  passengerAngularVelocityDelta,
  passengerControlVelocityDelta,
  supportVelocityAtPoint,
} from "./movingSupportDynamics";
import {
  passengerSeatForId,
  passengerSeatIsIntact,
  passengerSeatViewYaw,
  passengerSeatWorldMotion,
  passengerSeatWorldPoint,
  type PassengerSeatDefinition,
} from "./passengerSeats";
import {
  compoundClusterOwnsPiece,
  PHYSICS_TIME_STEP,
  queueCompoundKinematicImpulse,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRuntime,
  type CompoundKinematicImpulse,
} from "./compoundKinematicCluster";
import {
  DayNightCycle,
  LampBeaconField,
  LampLightPool,
  SceneEnvironment,
  SpotLightPool,
  type TimeOfDay,
} from "./WorldEnvironment";
import { CinematicPostProcessing } from "./CinematicPostProcessing";
import { useLanguage } from "../../../../app/i18n/LanguageProvider";
import {
  sceneCopy,
  type TranslationKey,
} from "../../../../app/i18n/dictionary";
import { LanguageSwitcher } from "../../../../app/components/LanguageSwitcher";
import {
  CinematicCameraRig,
  CinematicFlyoverGalleryShortcut,
  CinematicFlyoverLauncher,
  CinematicFlyoverOverlay,
  createFlyoverStoryFrame,
  startFlyoverRecording,
  type CapturedFlyoverStill,
  type FlyoverMode,
} from "./CinematicFlyover";
import type {
  CinematicFlyoverDefinition,
  FlyoverChapter,
} from "./cinematicFlyoverPlan";
import { useGameActionHints, type GameAction } from "./gameActionHints";
import { SceneMutableObjectSystem } from "./SceneMutableObjectSystem";
import { MotionInstrumentSystem } from "./MotionInstrumentSystem";
import { MotionImpactIndicator } from "./MotionImpactIndicator";
import {
  pieceWithMutableState,
  type MutablePieceVisualState,
} from "./sceneDynamics";
import { gameClockText, nextTimeOfDay, TIME_OF_DAY_TARGETS } from "./timeOfDay";
import {
  createMotionTelemetryStore,
  motionTelemetryMetricActivity,
  type MotionTelemetryMetric,
  type MotionTelemetrySnapshot,
  type MotionTelemetryStore,
  type MotionTelemetryUpdate,
} from "./motionTelemetry";
import { runtimeDiagnosticsEnabled } from "./runtimeDiagnostics";
import type {
  VehicleFailureEvent,
  VehicleFailureReason,
} from "./vehicleFailure";

type ControlName = "forward" | "backward" | "left" | "right" | "run" | "jump";

// "none" — фоторежим: пустые руки, клик ничего не делает; клавиша 0.
type WeaponName = "none" | "hammer" | "launcher" | "mg" | "rocket";
type ExplosiveKind = "grenade" | "rocket";

function nextWeaponName(weapon: WeaponName): Exclude<WeaponName, "none"> {
  return weapon === "hammer"
    ? "launcher"
    : weapon === "launcher"
      ? "mg"
      : weapon === "mg"
        ? "rocket"
        : "hammer";
}

function timeOfDayKey(timeOfDay: TimeOfDay): TranslationKey {
  switch (timeOfDay) {
    case "dawn":
      return "time.dawn";
    case "morning":
      return "time.morning";
    case "day":
      return "time.day";
    case "afternoon":
      return "time.afternoon";
    case "sunset":
      return "time.sunset";
    case "evening":
      return "time.evening";
    case "night":
      return "time.night";
    case "predawn":
      return "time.predawn";
  }
}

function timeOfDayAnnouncementKey(timeOfDay: TimeOfDay): TranslationKey {
  switch (timeOfDay) {
    case "dawn":
      return "announce.timeDawn";
    case "morning":
      return "announce.timeMorning";
    case "day":
      return "announce.timeDay";
    case "afternoon":
      return "announce.timeAfternoon";
    case "sunset":
      return "announce.timeSunset";
    case "evening":
      return "announce.timeEvening";
    case "night":
      return "announce.timeNight";
    case "predawn":
      return "announce.timePredawn";
  }
}

const entryApproachActions: readonly GameAction[] = [
  "gate.approaching",
  "door.approaching",
  "town-door.approaching",
  "terminal-departure.approaching",
  "viking-departure.approaching",
  "town-departure.approaching",
  "terminal-ride.approaching",
  "viking-ride.approaching",
  "town-ride.approaching",
  "hexacopter-departure.approaching",
  "hexacopter-ride.approaching",
  "seat.approaching",
  "stand.available",
];

function entryApproachAction(entry: HingedEntryApproach): GameAction {
  return entry.kind === "gate"
    ? "gate.approaching"
    : entry.kind === "town-door"
      ? "town-door.approaching"
      : entry.kind === "departure"
        ? entry.cue === "viking-uncrewed-flight"
          ? "viking-departure.approaching"
          : entry.cue === "town-uncrewed-flight"
            ? "town-departure.approaching"
            : entry.cue === "town-hexacopter-uncrewed-flight"
              ? "hexacopter-departure.approaching"
              : "terminal-departure.approaching"
        : entry.kind === "ride"
          ? entry.cue === "viking-passenger-flight"
            ? "viking-ride.approaching"
            : entry.cue === "town-passenger-flight"
              ? "town-ride.approaching"
              : entry.cue === "town-hexacopter-passenger-flight"
                ? "hexacopter-ride.approaching"
                : "terminal-ride.approaching"
          : entry.kind === "seat"
            ? "seat.approaching"
            : entry.kind === "stand"
              ? "stand.available"
              : "door.approaching";
}

function entryActionKey(
  entry: HingedEntryApproach,
  touch: boolean,
): TranslationKey {
  if (entry.kind === "gate") {
    return touch ? "hint.gate.actionTouch" : "hint.gate.action";
  }
  if (entry.kind === "town-door") {
    return touch ? "hint.townDoor.actionTouch" : "hint.townDoor.action";
  }
  if (entry.kind === "departure") {
    return entry.cue === "viking-uncrewed-flight"
      ? touch
        ? "hint.vikingDeparture.actionTouch"
        : "hint.vikingDeparture.action"
      : entry.cue === "town-uncrewed-flight"
        ? touch
          ? "hint.townDeparture.actionTouch"
          : "hint.townDeparture.action"
        : entry.cue === "town-hexacopter-uncrewed-flight"
          ? touch
            ? "hint.hexacopterDeparture.actionTouch"
            : "hint.hexacopterDeparture.action"
          : touch
            ? "hint.departure.actionTouch"
            : "hint.departure.action";
  }
  if (entry.kind === "ride") {
    return entry.cue === "viking-passenger-flight"
      ? touch
        ? "hint.vikingRide.actionTouch"
        : "hint.vikingRide.action"
      : entry.cue === "town-passenger-flight"
        ? touch
          ? "hint.townRide.actionTouch"
          : "hint.townRide.action"
        : entry.cue === "town-hexacopter-passenger-flight"
          ? touch
            ? "hint.hexacopterRide.actionTouch"
            : "hint.hexacopterRide.action"
          : touch
            ? "hint.ride.actionTouch"
            : "hint.ride.action";
  }
  if (entry.kind === "seat") {
    return touch ? "hint.seat.actionTouch" : "hint.seat.action";
  }
  if (entry.kind === "stand") {
    return touch ? "hint.stand.actionTouch" : "hint.stand.action";
  }
  return touch ? "hint.door.actionTouch" : "hint.door.action";
}

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
/** Momentum of one MG projectile after the weapon/recoil system has fired it. */
const MG_PROJECTILE_IMPULSE = 2.4;

const blastTransmissionByMaterial: Record<BreakableMaterial, number> = {
  glass: 0.76,
  darkGlass: 0.68,
  plaster: 0.36,
  plastic: 0.48,
  wood: 0.24,
  cloth: 0.7,
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
  BreakablePieceDefinition | RemnantDefinition | ShardDefinition;

function occupiedBoxesForBlast(
  source: BlastOccluderSource | ShardSource,
): readonly OccupiedGeometryBox[] | undefined {
  if ("boxes" in source && source.boxes?.length) {
    return source.boxes;
  }
  if ("clusterId" in source && source.shape === "cinderBlock") {
    return getPieceRenderBoxes(source);
  }
  return undefined;
}

interface BlastOccluder {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakableMaterial;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly size: readonly [number, number, number];
  readonly boxes?: readonly OccupiedGeometryBox[];
  readonly surfaceDistance: number;
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
    // Occluders are sorted by surface distance for this explosion. Once we
    // reach the target plane, no later body can stand between blast and target.
    if (occluder.surfaceDistance >= targetDistance - 0.08) {
      break;
    }
    if (occluder.id === targetId || occluder.parentId === targetParentId) {
      continue;
    }

    if (
      segmentIntersectsOccupiedGeometry(
        center,
        targetPoint,
        occluder.position,
        occluder.size,
        occluder.quaternion,
        occluder.boxes,
        0.025,
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

/**
 * Тип устройства не меняется под нами, но прочитать его можно только на
 * клиенте. Подписка-заглушка даёт значение через тот же канал, что и остальное
 * окружение, — и без setState в эффекте, который иначе пришлось бы держать
 * только ради первого кадра.
 */
function subscribeStaticEnvironment(): () => void {
  return () => {};
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

function readBreakableHit(intersection: Intersection): BreakableHitData | null {
  const userData = intersection.object.userData;
  const instanceIds = userData.breakableInstanceIds as
    readonly string[] | undefined;
  const instanceKinds = userData.breakableInstanceKinds as
    readonly ("piece" | "shard" | "remnant")[] | undefined;
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

interface PassengerViewMotion {
  addYaw: (delta: number) => void;
  consumeYaw: () => number;
  snapTo: (yaw: number, pitch: number) => void;
  consumeSnap: () => { readonly yaw: number; readonly pitch: number } | null;
  reset: () => void;
}

function createPassengerViewMotion(): PassengerViewMotion {
  let pendingYaw = 0;
  let pendingSnap: { readonly yaw: number; readonly pitch: number } | null =
    null;
  return {
    addYaw(delta) {
      pendingYaw += delta;
    },
    consumeYaw() {
      const result = pendingYaw;
      pendingYaw = 0;
      return result;
    },
    snapTo(yaw, pitch) {
      pendingYaw = 0;
      pendingSnap = { yaw, pitch };
    },
    consumeSnap() {
      const result = pendingSnap;
      pendingSnap = null;
      return result;
    },
    reset() {
      pendingYaw = 0;
      pendingSnap = null;
    },
  };
}

interface ActorForceFieldConstraintState {
  previousPosition: SceneVector3 | null;
  contactNormal: SceneVector3 | null;
  /**
   * Signed load on the membrane: negative while nearing it, positive while
   * leaning on it. One number drives the yield of the stop, the depth of the
   * bowl and the light in the seams, so the feel and the picture cannot drift
   * apart.
   */
  load: number;
  /** Where the load lands, kept for the release pulse. */
  loadPoint: SceneVector3 | null;
}

/** Repulsion the field can spend braking an approach, m/s². */
const FORCE_FIELD_REPULSION = 26;
/**
 * How deep a fully loaded press may sink past the analytic stop, metres. It
 * matches the depth of the bowl the shader draws: the feel and the picture are
 * the same number, so they cannot drift apart.
 */
const FORCE_FIELD_MAX_SINK = BASALT_FORCE_FIELD_PRESS_DEPTH;
/** Inward speed that counts as leaning with full weight, m/s. */
const FORCE_FIELD_PUSH_REFERENCE = 3.4;
/** Above this arrival speed the field stops absorbing and starts rejecting. */
const FORCE_FIELD_BOUNCE_SPEED = 5.5;
const FORCE_FIELD_BOUNCE_RESTITUTION = 0.3;
/** Gentle outward breath when a held load lets go, m/s at full load. */
const FORCE_FIELD_RELEASE_EXHALE = 0.55;

function forceFieldLoadResponse(
  state: ActorForceFieldConstraintState,
  target: number,
  delta: number,
): number {
  // Loading is quick and unloading is slow, so a touch reads instantly while
  // the membrane still takes its time letting go.
  const rate = Math.abs(target) > Math.abs(state.load) ? 15 : 6;
  state.load += (target - state.load) * Math.min(1, delta * rate);
  if (Math.abs(state.load) < 1e-3) state.load = 0;
  return state.load;
}

/**
 * Three layers stand between an actor and the fortress. Approaching is met by
 * repulsion, contact yields like a loaded membrane, and letting go breathes
 * out. The analytic plane underneath never moves and never lets anything
 * through: softness is for the feel, the plane is the guarantee.
 */
function constrainActorToForceField(
  body: RapierRigidBody,
  forceFieldRef: MutableRefObject<BasaltForceFieldRuntime | null> | undefined,
  state: ActorForceFieldConstraintState,
  delta: number,
  pressSlot = 0,
): void {
  const forceField = forceFieldRef?.current;
  if (!forceField) {
    state.previousPosition = null;
    state.contactNormal = null;
    state.load = 0;
    state.loadPoint = null;
    return;
  }

  const position = body.translation();
  const velocity = body.linvel();
  let velocityX = velocity.x;
  let velocityY = velocity.y;
  let velocityZ = velocity.z;
  const current: SceneVector3 = [position.x, position.y, position.z];
  const clearance = PLAYER_CAPSULE_RADIUS + 0.035;
  const previous = state.previousPosition;
  const actualTravel = previous
    ? Math.hypot(
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2],
      )
    : 0;
  if (actualTravel > 1.5) {
    // Teleports and seat transfers deliberately choose a side; they are not
    // physical tunnelling and must not be pulled back through the world.
    state.previousPosition = null;
    state.contactNormal = null;
    state.load = 0;
    state.loadPoint = null;
  }

  const proximity = forceField.nearestPlate(
    current,
    clearance + BASALT_FORCE_FIELD_APPROACH_RANGE,
  );
  const plateNormal = proximity?.normal ?? state.contactNormal;
  // Gap between the capsule surface and the plate; the arrival speed is read
  // before the field spends anything braking it.
  const gap = proximity
    ? proximity.distance - clearance
    : Number.POSITIVE_INFINITY;
  const arrivalSpeed = plateNormal
    ? -(velocityX * plateNormal[0]
      + velocityY * plateNormal[1]
      + velocityZ * plateNormal[2])
    : 0;

  // Layer one: like poles of a magnet. The nearer the plate, the harder it
  // pushes, so in ordinary play the hard stop below is never reached at all.
  if (
    plateNormal
    && gap > 0
    && gap < BASALT_FORCE_FIELD_APPROACH_RANGE
    && arrivalSpeed > 0
  ) {
    const compression = 1 - gap / BASALT_FORCE_FIELD_APPROACH_RANGE;
    const brake = Math.min(
      arrivalSpeed,
      FORCE_FIELD_REPULSION * compression * compression * delta,
    );
    velocityX += plateNormal[0] * brake;
    velocityY += plateNormal[1] * brake;
    velocityZ += plateNormal[2] * brake;
  }

  // Layer two: the load. Touching loads it positive, nearing loads it
  // negative, and nothing here ever spends the cell's capacity — a shield that
  // could be opened by leaning on it would have no economy left.
  const touching = gap <= 0.02;
  const target = touching
    ? Math.min(
        1,
        0.3 + Math.max(0, arrivalSpeed) / FORCE_FIELD_PUSH_REFERENCE,
      )
    : gap < BASALT_FORCE_FIELD_APPROACH_RANGE
      ? -(1 - gap / BASALT_FORCE_FIELD_APPROACH_RANGE)
        * BASALT_FORCE_FIELD_APPROACH_BULGE
      : 0;
  const previousLoad = state.load;
  const load = forceFieldLoadResponse(state, target, delta);

  if (touching && proximity) {
    if (previousLoad <= 0) {
      // First touch is a struck drumhead, not a lean: a short pulse, scaled by
      // how hard the actor arrived, before the steady bowl takes over.
      forceField.pulse(
        proximity.point,
        Math.max(0.06, Math.min(0.55, arrivalSpeed / 9)),
        0.95,
      );
    }
    state.loadPoint = proximity.point;
  } else if (state.loadPoint && previousLoad > 0.12) {
    // Layer three: letting go. The membrane springs back and breathes the
    // actor out — a breath, not a shove, or the barrier grows a temper.
    forceField.pulse(state.loadPoint, Math.min(0.5, previousLoad * 0.3), 1.25);
    if (plateNormal) {
      const exhale = FORCE_FIELD_RELEASE_EXHALE * previousLoad;
      velocityX += plateNormal[0] * exhale;
      velocityY += plateNormal[1] * exhale;
      velocityZ += plateNormal[2] * exhale;
    }
    state.loadPoint = null;
  } else if (!touching) {
    state.loadPoint = null;
  }

  forceField.press(
    pressSlot,
    load === 0 ? null : (proximity?.point ?? state.loadPoint),
    load,
  );

  // The stop itself yields under the load, so the capsule sinks into the bowl
  // it is making instead of meeting a pane of glass.
  const stopClearance = Math.max(
    0.02,
    clearance - Math.max(0, load) * FORCE_FIELD_MAX_SINK,
  );
  const predicted: SceneVector3 = [
    current[0] + velocityX * delta,
    current[1] + velocityY * delta,
    current[2] + velocityZ * delta,
  ];

  // First sweep what Rapier actually moved since the previous physics step,
  // then sweep the velocity planned for the next one. The former closes the
  // one-frame hole through which a fast impulse could already have crossed.
  let hit = state.previousPosition
    ? forceField.intersectSegment(
        state.previousPosition,
        current,
        stopClearance,
      )
    : null;
  hit ??= forceField.intersectSegment(current, predicted, stopClearance);

  if (!hit && state.contactNormal) {
    const normal = state.contactNormal;
    const inwardSpeed =
      velocityX * normal[0] + velocityY * normal[1] + velocityZ * normal[2];
    if (inwardSpeed <= 0.02) {
      // Once contact exists, probe again from a guaranteed outside point.
      // This recovers even if a solver impulse placed the capsule just beyond
      // the plane and lets held input keep sliding along neighbouring cells.
      const speed = Math.hypot(velocityX, velocityY, velocityZ);
      const recovery = stopClearance * 2 + speed * delta + 0.12;
      const outside: SceneVector3 = [
        current[0] + normal[0] * recovery,
        current[1] + normal[1] * recovery,
        current[2] + normal[2] * recovery,
      ];
      hit = forceField.intersectSegment(outside, predicted, stopClearance);
      if (!hit) {
        // The contacted cell is now a real hole.
        state.contactNormal = null;
      }
    } else {
      // Deliberate motion toward the pass-through side releases contact.
      state.contactNormal = null;
    }
  }

  const velocityChanged =
    velocityX !== velocity.x
    || velocityY !== velocity.y
    || velocityZ !== velocity.z;

  if (!hit) {
    if (velocityChanged) {
      body.setLinvel({ x: velocityX, y: velocityY, z: velocityZ }, true);
    }
    state.previousPosition = current;
    return;
  }

  // The analytic surface is one-way: arriving actors stop with their capsule
  // outside the plate, while actors leaving the fortress never enter here.
  body.setTranslation(
    { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
    true,
  );
  const inwardSpeed =
    velocityX * hit.normal[0]
    + velocityY * hit.normal[1]
    + velocityZ * hit.normal[2];
  if (inwardSpeed < 0) {
    // Walking into it is absorbed; arriving fast is rejected. The field tells
    // the difference between being touched and being hit.
    const restitution = -inwardSpeed > FORCE_FIELD_BOUNCE_SPEED
      ? FORCE_FIELD_BOUNCE_RESTITUTION
      : 0;
    const removed = inwardSpeed * (1 + restitution);
    body.setLinvel(
      {
        x: velocityX - hit.normal[0] * removed,
        y: velocityY - hit.normal[1] * removed,
        z: velocityZ - hit.normal[2] * removed,
      },
      true,
    );
  } else if (velocityChanged) {
    body.setLinvel({ x: velocityX, y: velocityY, z: velocityZ }, true);
  }
  state.previousPosition = hit.point;
  state.contactNormal = hit.normal;
}

function Player({
  registerBody,
  mobileControls,
  passengerViewMotion,
  spawn,
  flightMode,
  entryInteractionActive,
  interIslandArrivalActive,
  interIslandBoundaryPassThrough,
  occupiedSeatId,
  vehicleFramePoses,
  forceFieldRef,
}: {
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  mobileControls: MobileControlsRef;
  passengerViewMotion: PassengerViewMotion;
  spawn: readonly [number, number, number];
  flightMode: boolean;
  entryInteractionActive: boolean;
  /** Arrival owns the player pose from the first physics step. */
  interIslandArrivalActive: boolean;
  /** Exact hull containment grants a temporary exception to the island ring. */
  interIslandBoundaryPassThrough: boolean;
  occupiedSeatId: string | null;
  vehicleFramePoses: MutableRefObject<
    ReadonlyMap<string, VehicleFramePoseState>
  >;
  forceFieldRef?: MutableRefObject<BasaltForceFieldRuntime | null>;
}) {
  const body = useRef<RapierRigidBody>(null);
  const [, getControls] = useKeyboardControls<ControlName>();
  const { camera } = useThree();
  const { world, rapier, rigidBodyStates } = useRapier();
  const movement = useMemo(() => new Vector3(), []);
  const flightForward = useMemo(() => new Vector3(), []);
  const flightRight = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const groundRay = useRef<RapierRay | null>(null);
  // Collision routing only: an airborne transfer may cross the ground map
  // boundary until it touches ordinary terrain. This never transfers motion.
  const movingSupportBoundaryPassThrough = useRef(false);
  const passengerYawVelocity = useRef(0);
  const passengerTelemetryAt = useRef(0);
  const passengerDiagnostics = useMemo(
    () => runtimeDiagnosticsEnabled("passenger"),
    [],
  );
  const stepRay = useRef<RapierRay | null>(null);
  const stepCooldown = useRef(0);
  /** Остаток подъёма, начатого автошагом: пока он идёт, ноги ещё толкают. */
  const stepCarry = useRef(0);
  /** Опора, с которой шагнули: на ходу корабля шаг остаётся его шагом. */
  const stepCarrySupport = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0,
  });
  const spawnFrames = useRef(0);
  const forceFieldConstraint = useRef<ActorForceFieldConstraintState>({
    previousPosition: null,
    contactNormal: null,
    load: 0,
    loadPoint: null,
  });
  const previousSeat = useRef<PassengerSeatDefinition | null>(null);
  const seatedYaw = useRef<number | null>(null);

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
      {
        x: velocity.x,
        y: flightMode ? 0 : Math.min(0, velocity.y),
        z: velocity.z,
      },
      true,
    );
  }, [flightMode]);

  // Dev-хук: телепорт игрока из консоли/CDP для скриншотов, без пилотирования.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as unknown as Record<string, unknown>;
    const teleport = (x: number, y: number, z: number) => {
      body.current?.setTranslation({ x, y, z }, true);
      body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    };
    scope.__mamTeleport = teleport;
    return () => {
      if (scope.__mamTeleport === teleport) {
        delete scope.__mamTeleport;
      }
      delete document.documentElement.dataset.mamPassenger;
    };
  }, []);

  useBeforePhysicsStep(() => {
    const delta = PHYSICS_TIME_STEP;
    if (!body.current) {
      return;
    }

    // Spawn grace: pin the player to the spawn point for the first frames so
    // load-time physics hiccups can never push them through the ground.
    if (interIslandArrivalActive) {
      spawnFrames.current = 40;
      forceFieldConstraint.current.previousPosition = null;
      forceFieldConstraint.current.contactNormal = null;
      forceFieldConstraint.current.load = 0;
      forceFieldConstraint.current.loadPoint = null;
    } else if (spawnFrames.current < 40) {
      spawnFrames.current += 1;
      passengerYawVelocity.current = 0;
      passengerViewMotion.reset();
      body.current.setTranslation(
        { x: spawn[0], y: spawn[1], z: spawn[2] },
        true,
      );
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      forceFieldConstraint.current.previousPosition = null;
      forceFieldConstraint.current.contactNormal = null;
      forceFieldConstraint.current.load = 0;
      forceFieldConstraint.current.loadPoint = null;
      return;
    }

    const position = body.current.translation();
    const velocity = body.current.linvel();

    const occupiedSeat = passengerSeatForId(occupiedSeatId);
    if (occupiedSeat) {
      const carrier = vehicleFramePoses.current.get(
        occupiedSeat.carrierClusterId,
      );
      if (carrier) {
        const occupantPoint = passengerSeatWorldPoint(
          carrier,
          occupiedSeat.occupantPoint,
        );
        const carrierMotion = passengerSeatWorldMotion(carrier, occupantPoint);
        const viewYaw = passengerSeatViewYaw(occupiedSeat, carrier);
        if (previousSeat.current?.id !== occupiedSeat.id) {
          passengerViewMotion.snapTo(viewYaw, 0);
        } else if (seatedYaw.current !== null) {
          let yawDelta = viewYaw - seatedYaw.current;
          while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
          while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
          passengerViewMotion.addYaw(yawDelta);
        }
        seatedYaw.current = viewYaw;
        previousSeat.current = occupiedSeat;
        body.current.setGravityScale(0, true);
        for (let index = 0; index < body.current.numColliders(); index += 1) {
          body.current.collider(index).setCollisionGroups(0);
        }
        body.current.setTranslation(
          { x: occupantPoint[0], y: occupantPoint[1], z: occupantPoint[2] },
          true,
        );
        body.current.setLinvel(carrierMotion.linearVelocity, true);
        forceFieldConstraint.current.previousPosition = null;
        forceFieldConstraint.current.contactNormal = null;
        forceFieldConstraint.current.load = 0;
        forceFieldConstraint.current.loadPoint = null;
        return;
      }
    }

    // Leaving a place is calculated from the carrier's current pose, never
    // from where the vehicle happened to be when the seat was authored.
    const releasedSeat = previousSeat.current;
    if (releasedSeat) {
      const carrier = vehicleFramePoses.current.get(
        releasedSeat.carrierClusterId,
      );
      const exitPoint = carrier
        ? passengerSeatWorldPoint(carrier, releasedSeat.exitPoint)
        : releasedSeat.exitPoint;
      const exitMotion = carrier
        ? passengerSeatWorldMotion(carrier, exitPoint)
        : { linearVelocity: { x: 0, y: 0, z: 0 }, yawVelocity: 0 };
      previousSeat.current = null;
      seatedYaw.current = null;
      // The passenger leaves a constraint, not the carrier. Hand off both
      // translation and yaw so the regular finite-traction model continues
      // from the ship's current inertial state instead of rebuilding it.
      passengerYawVelocity.current = exitMotion.yawVelocity;
      movingSupportBoundaryPassThrough.current =
        Math.hypot(
          exitMotion.linearVelocity.x,
          exitMotion.linearVelocity.y,
          exitMotion.linearVelocity.z,
        ) > 0.02 || Math.abs(exitMotion.yawVelocity) > 0.002;
      body.current.setGravityScale(flightMode ? 0 : 1, true);
      for (let index = 0; index < body.current.numColliders(); index += 1) {
        body.current.collider(index).setCollisionGroups(ACTOR_ABOARD);
      }
      body.current.setTranslation(
        { x: exitPoint[0], y: exitPoint[1], z: exitPoint[2] },
        true,
      );
      body.current.setLinvel(exitMotion.linearVelocity, true);
      forceFieldConstraint.current.previousPosition = null;
      forceFieldConstraint.current.contactNormal = null;
      forceFieldConstraint.current.load = 0;
      forceFieldConstraint.current.loadPoint = null;
      return;
    }

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
      const flightActorGroups = interIslandBoundaryPassThrough
        ? ACTOR_ABOARD
        : ACTOR_NORMAL;
      for (let index = 0; index < body.current.numColliders(); index += 1) {
        const collider = body.current.collider(index);
        if (collider.collisionGroups() !== flightActorGroups) {
          collider.setCollisionGroups(flightActorGroups);
        }
      }
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
      constrainActorToForceField(
        body.current,
        forceFieldRef,
        forceFieldConstraint.current,
        delta,
      );
      return;
    }

    movement.set(inputX, 0, inputZ);
    if (movement.lengthSq() > 0) {
      movement
        .normalize()
        .applyAxisAngle(up, camera.rotation.y)
        .multiplyScalar(speed);
    }

    groundRay.current ??= new rapier.Ray(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
    );
    groundRay.current.origin.x = position.x;
    groundRay.current.origin.y = position.y;
    groundRay.current.origin.z = position.z;
    const groundHit = world.castRayAndGetNormal(
      groundRay.current,
      0.95,
      true,
      undefined,
      undefined,
      undefined,
      body.current ?? undefined,
    );
    const grounded = groundHit !== null;
    const supportBody = groundHit?.collider.parent() ?? null;
    const supportLinearVelocity = supportBody?.linvel() ?? { x: 0, y: 0, z: 0 };
    const supportAngularVelocity = supportBody?.angvel() ?? {
      x: 0,
      y: 0,
      z: 0,
    };
    const supportVelocity = supportBody
      ? supportVelocityAtPoint(
          {
            linearVelocity: supportLinearVelocity,
            angularVelocity: supportAngularVelocity,
            centreOfMass: supportBody.worldCom(),
          },
          position,
        )
      : { x: 0, y: 0, z: 0 };

    // Any real moving body can be a support: a train, another airship, a
    // falling slab. There is no authored "current carrier" identity.
    const movingSupport =
      supportBody !== null &&
      (Math.hypot(supportVelocity.x, supportVelocity.y, supportVelocity.z) >
        0.02 ||
        Math.hypot(
          supportAngularVelocity.x,
          supportAngularVelocity.y,
          supportAngularVelocity.z,
        ) > 0.002);
    movingSupportBoundaryPassThrough.current = movingSupportBoundaryState(
      movingSupportBoundaryPassThrough.current,
      grounded,
      movingSupport,
    );
    const actorGroups =
      interIslandBoundaryPassThrough || movingSupportBoundaryPassThrough.current
        ? ACTOR_ABOARD
        : ACTOR_NORMAL;
    for (let index = 0; index < body.current.numColliders(); index += 1) {
      const collider = body.current.collider(index);
      if (collider.collisionGroups() !== actorGroups) {
        collider.setCollisionGroups(actorGroups);
      }
    }
    if (passengerDiagnostics) {
      const now = performance.now();
      if (now >= passengerTelemetryAt.current) {
        passengerTelemetryAt.current = now + 250;
        document.documentElement.dataset.mamPassenger = JSON.stringify({
          position,
          velocity,
          grounded,
          movingSupport,
          supportHandle: supportBody ? String(supportBody.handle) : null,
          supportVelocity,
          relativeVelocity: {
            x: velocity.x - supportVelocity.x,
            y: velocity.y - supportVelocity.y,
            z: velocity.z - supportVelocity.z,
          },
        });
      }
    }

    // Auto-step: when running into a low obstacle (stair tread, kerb,
    // rubble), probe its height and hop exactly high enough to clear it.
    // Blocked means "not making progress TOWARD the goal": sliding along a
    // wall keeps raw speed high, so we compare the velocity projection on
    // the desired direction, not the full magnitude.
    stepCooldown.current = Math.max(0, stepCooldown.current - delta);
    stepCarry.current = grounded ? 0 : Math.max(0, stepCarry.current - delta);
    let autoLift = 0;
    const desiredSq = movement.lengthSq();
    if (grounded && stepCooldown.current <= 0 && desiredSq > 1) {
      const desiredSpeed = Math.sqrt(desiredSq);
      const progressSpeed =
        ((velocity.x - supportVelocity.x) * movement.x +
          (velocity.z - supportVelocity.z) * movement.z) /
        desiredSpeed;
      if (progressSpeed < desiredSpeed * 0.55) {
        stepRay.current ??= new rapier.Ray(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        );
        const probe = stepRay.current;
        const directionX = movement.x / desiredSpeed;
        const directionZ = movement.z / desiredSpeed;
        // Подошва плюс два сантиметра: щупы не должны скрести сам пол.
        const bottomY = position.y - PLAYER_CAPSULE_FOOT_OFFSET + 0.02;

        // Трёхъярусный нижний щуп: порог в ладонь высотой (8-15 см —
        // фундаментная лента, бортик) луч на 0.18 просто не видел, а один
        // низкий луч слепнет на составной стенке — горизонтальный шов между
        // основанием и плитой перрона проваливал ровно нижний ярус, и целая
        // ступень читалась как пустота. Ярусы только ИЩУТ препятствие;
        // разрешает подъём всё равно луч вниз на площадку.
        probe.origin.x = position.x;
        probe.origin.z = position.z;
        probe.dir.x = directionX;
        probe.dir.y = 0;
        probe.dir.z = directionZ;
        let lowHit = null;
        for (const feelerHeight of [0.08, 0.18, 0.3]) {
          probe.origin.y = bottomY + feelerHeight;
          lowHit = world.castRay(
            probe,
            0.82,
            true,
            undefined,
            undefined,
            undefined,
            body.current ?? undefined,
          );
          if (lowHit) {
            break;
          }
        }

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

            // Шаг не дотянулся — пробуем карабканье: площадка выше шага,
            // но в пределах «подтянулся» (кромка ямы, порог, плита).
            if (autoLift === 0) {
              probe.origin.x = position.x;
              probe.origin.y = bottomY + 1.72;
              probe.origin.z = position.z;
              probe.dir.x = directionX;
              probe.dir.y = 0;
              probe.dir.z = directionZ;
              const climbBlocked = world.castRay(
                probe,
                0.92,
                true,
                undefined,
                undefined,
                undefined,
                body.current ?? undefined,
              );
              if (!climbBlocked) {
                probe.origin.x = position.x + directionX * 0.72;
                probe.origin.y = bottomY + 1.45;
                probe.origin.z = position.z + directionZ * 0.72;
                probe.dir.x = 0;
                probe.dir.y = -1;
                probe.dir.z = 0;
                const climbHit = world.castRayAndGetNormal(
                  probe,
                  1.55,
                  true,
                  undefined,
                  undefined,
                  undefined,
                  body.current ?? undefined,
                );
                autoLift = autoClimbLiftSpeed({
                  blockedAtFeet: true,
                  bodyClear: true,
                  landingFound: climbHit !== null,
                  landingNormalY: climbHit?.normal.y ?? 0,
                  stepHeight: climbHit ? 1.45 - climbHit.timeOfImpact : 0,
                });
              }
            }

            if (autoLift > 0) {
              stepCooldown.current = 0.3;
              // Ноги толкают вперёд весь подъём, а не только в кадре отрыва:
              // подъём идёт вертикально, кромка держит капсулу в 35 см от
              // себя, и без переноса игрок взлетал на месте и падал на ту же
              // ступень — взойти можно было только с разбега.
              stepCarry.current = stepCarryWindow(autoLift);
              stepCarrySupport.current = supportVelocity;
            }
          }
        }
      }
    }

    // Walking is a finite impulse relative to the body underfoot. It never
    // overwrites momentum: once contact is lost, neither the ship nor input
    // can change horizontal velocity in mid-air.
    //
    // Единственное исключение — начатый автошагом подъём: пока он длится,
    // опора считается прежней. Это не воздушное управление: окно открывает
    // сам шаг, найдя впереди площадку, и закрывается оно ровно к приземлению.
    // Сорвавшийся с борта или падающий в яму его не получает.
    const stepping = !grounded && stepCarry.current > 0;
    const controlSupport = stepping
      ? stepCarrySupport.current
      : supportVelocity;
    const controlled = passengerControlVelocityDelta({
      velocity,
      supportVelocity: controlSupport,
      desiredRelativeVelocity: movement,
      supportNormal: groundHit?.normal ?? { x: 0, y: 1, z: 0 },
      grounded: grounded || stepping,
      delta,
    });
    passengerYawVelocity.current += passengerAngularVelocityDelta({
      angularVelocity: passengerYawVelocity.current,
      supportAngularVelocity,
      grounded,
      delta,
    });
    passengerViewMotion.addYaw(passengerYawVelocity.current * delta);
    const wantsJump =
      !entryInteractionActive && (jump || touch.jump) && grounded;
    const verticalTarget = wantsJump
      ? supportVelocity.y + 5.4
      : autoLift > 0
        ? supportVelocity.y + autoLift
        : null;
    const verticalChange =
      verticalTarget === null ? 0 : Math.max(0, verticalTarget - velocity.y);
    const mass = Math.max(0.001, body.current.mass());
    if (
      controlled.x !== 0 ||
      controlled.y !== 0 ||
      controlled.z !== 0 ||
      verticalChange !== 0
    ) {
      body.current.applyImpulse(
        {
          x: controlled.x * mass,
          y: (controlled.y + verticalChange) * mass,
          z: controlled.z * mass,
        },
        true,
      );
    }

    constrainActorToForceField(
      body.current,
      forceFieldRef,
      forceFieldConstraint.current,
      delta,
    );

    // Falling off an airborne carrier returns to the scene's ordinary island
    // spawn, never onto the carrier that has already flown away.
    const fallReturn = interIslandBoundaryPassThrough
      ? null
      : passengerFallReturnPoint(position.y, spawn);
    if (fallReturn) {
      body.current.setTranslation(fallReturn, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  // Rapier already interpolates every rigid body's render object with the
  // exact same accumulator as the compound support below it. The camera must
  // follow that object, not the raw 60 Hz simulation translation.
  useFrame(() => {
    const current = body.current;
    if (!current) {
      return;
    }
    const rendered = rigidBodyStates.get(current.handle)?.object.position;
    const position = rendered ?? current.translation();
    camera.position.set(position.x, position.y + 0.54, position.z);
  });

  return (
    <RigidBody
      ref={body}
      // An arriving passenger has no ordinary island spawn. Keep the body
      // outside the playable world until VehicleFrameSystem places it aboard
      // the carrier on the first physical step.
      position={
        interIslandArrivalActive
          ? [spawn[0], spawn[1] - 1_000, spawn[2]]
          : [...spawn]
      }
      gravityScale={flightMode ? 0 : 1}
      colliders={false}
      enabledRotations={[false, false, false]}
      linearDamping={0.02}
      canSleep={false}
      ccd
      collisionGroups={ACTOR_NORMAL}
    >
      <CapsuleCollider
        args={[PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS]}
        friction={0}
        frictionCombineRule={rapier.CoefficientCombineRule.Min}
      />
    </RigidBody>
  );
}

interface MouseLookProps {
  active: boolean;
  initialYaw: number;
  mobileControls: MobileControlsRef;
  passengerViewMotion: PassengerViewMotion;
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  /** Кадр обязан знать, есть ли у него указатель: без этого он не может ни
      попросить его, ни перестать обещать управление, которого нет. */
  onPointerLockChange: (held: boolean) => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
}

function MouseLook({
  active,
  initialYaw,
  mobileControls: mobileControlsRef,
  passengerViewMotion,
  onActiveChange,
  onFallbackChange,
  onPointerLockChange,
  onStrike,
  onStrikeEnd,
}: MouseLookProps) {
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const yaw = useRef(camera.rotation.y);
  const pitch = useRef(camera.rotation.x);
  const wasPointerLocked = useRef(false);
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

  // Dev-хук: выставить взгляд из консоли/CDP (пара к __mamTeleport).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as unknown as Record<string, unknown>;
    const setLook = (nextYaw: number, nextPitch: number) => {
      yaw.current = nextYaw;
      pitch.current = MathUtils.clamp(nextPitch, -Math.PI / 2.1, Math.PI / 2.1);
      cameraRef.current.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };
    scope.__mamLook = setLook;
    // Browser automation runs in an isolated page realm and cannot call the
    // dev hook directly. Match mamTeleport with a one-shot query command so
    // a physical weapon test can still author an exact line of sight.
    const lookRequest = new URLSearchParams(window.location.search).get(
      "mamLook",
    );
    if (lookRequest) {
      const [nextYaw, nextPitch] = lookRequest.split(",").map(Number);
      if (Number.isFinite(nextYaw) && Number.isFinite(nextPitch)) {
        setLook(nextYaw, nextPitch);
      }
    }
    return () => {
      delete scope.__mamLook;
    };
  }, []);

  useFrame(() => {
    let changed = false;
    if (!initialized.current) {
      initialized.current = true;
      yaw.current = initialYaw;
      pitch.current = 0;
      changed = true;
    }

    const snappedView = passengerViewMotion.consumeSnap();
    if (snappedView) {
      yaw.current = snappedView.yaw;
      pitch.current = snappedView.pitch;
      changed = true;
    } else {
      const carriedYaw = passengerViewMotion.consumeYaw();
      if (carriedYaw !== 0) {
        yaw.current += carriedYaw;
        changed = true;
      }
    }

    const touch = mobileControlsRef.current;
    if (active && (touch.lookDeltaX !== 0 || touch.lookDeltaY !== 0)) {
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
      changed = true;
    }
    if (changed) {
      cameraRef.current.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    }
  });

  useEffect(() => {
    const handlePointerLockChange = () => {
      const pointerLocked = document.pointerLockElement === gl.domElement;
      onPointerLockChange(pointerLocked);

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
      const pointerLocked = document.pointerLockElement === gl.domElement;
      if (pointerLocked && event.button === 0) {
        if (active) {
          onStrike();
        }
        return;
      }

      // Fallback mode: retry pointer lock on every click gesture over the
      // game — the moment the browser grants it, the cursor is captured. This
      // is also the only way back after Escape, so it must not depend on the
      // frame still considering itself active.
      if (!pointerLocked && event.target === gl.domElement) {
        try {
          const request = gl.domElement.requestPointerLock?.() as
            Promise<void> | undefined;
          // Отказ — это ответ. Кадр переходит в режим протяжки и перестаёт
          // просить указатель, которого ему не дадут: иначе после прилёта, где
          // захват не запрашивался жестом, запрос висел бы бесконечно.
          request?.catch?.(() => onFallbackChange(true));
        } catch {
          onFallbackChange(true);
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

    // Захват читается при подписке, а не только из события. Событие сообщает
    // об ИЗМЕНЕНИИ, а кадр может родиться уже с захваченным указателем: любое
    // пересоздание дерева (горячая перезагрузка в разработке) оставляет захват
    // на той же канве, и никакого `pointerlockchange` больше не будет. Кадр,
    // который знает о захвате только из события, в этом случае навсегда
    // остаётся с просьбой кликнуть — и клики уходят в удар, потому что менять
    // нечего.
    //
    // Читается только захват, но не его отсутствие: подписка переигрывается на
    // каждую смену обработчиков, и «указателя нет» в этот момент означает лишь
    // то, что ответ на запрос ещё не пришёл.
    if (document.pointerLockElement === gl.domElement) {
      handlePointerLockChange();
    }

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    gl.domElement.addEventListener("contextmenu", preventContextMenu);

    return () => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
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
    onPointerLockChange,
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
    otherColliderHandle: number,
  ) => void;
}

// Свежие обломки короткое время не сталкиваются с соседями — подробные
// маски взаимодействия лежат рядом с транспортом, который ими фильтрует щупы.
const DEBRIS_SETTLE_STEPS = 36;
const DEBRIS_CONTACT_GRACE_STEPS = 30;
const DEBRIS_RETRY_COOLDOWN_STEPS = 12;

/**
 * Бюджет кадра на отложенные carve-шаги взрыва, мс. Анализ взрыва остаётся в
 * кадре детонации, а резка целей исполняется отсюда порциями; финальный
 * settle и волна давления закрывают взрыв, когда шаги исчерпаны.
 */
const BLAST_FRAME_BUDGET_MS = 6;

interface PendingBlastJob {
  readonly steps: (() => void)[];
  cursor: number;
  /** Carve-запросы этого взрыва, ожидающие ответа воркера. */
  inFlight: number;
  /** Сброс мира делает недействительными висящие ответы воркера. */
  readonly epoch: number;
  finish: () => void;
}

function OmittedDebrisInteractionColliders({
  boxes,
  primaryBoxes,
  material,
}: {
  boxes: readonly DebrisColliderBox[];
  primaryBoxes: readonly DebrisColliderBox[];
  material: BreakableMaterial;
}) {
  const omittedBoxes = useMemo(
    () => omittedDebrisColliderBoxes(boxes, primaryBoxes),
    [boxes, primaryBoxes],
  );

  // Кратер в грунте терпит грубую коллизию: главных боксов достаточно, а
  // детальный actor-суп на плите 6×6 — это десятки лишних кубоидов на каждую
  // яму (главный источник «супа коллайдеров» при взрыве во дворе).
  if (groundMaterials.has(material)) {
    return null;
  }

  if (omittedBoxes.length === 0) {
    return null;
  }

  return (
    <>
      {omittedBoxes.map((box, index) => (
        <CuboidCollider
          key={`actor-detail:${index}`}
          args={[
            Math.max(0.002, box.size[0] / 2 - 0.002),
            Math.max(0.002, box.size[1] / 2 - 0.002),
            Math.max(0.002, box.size[2] / 2 - 0.002),
          ]}
          position={[...box.center]}
          density={0}
          friction={0.76}
          restitution={0}
          collisionGroups={DEBRIS_ACTOR_DETAIL}
        />
      ))}
    </>
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
  const fallingTreeFoliage = piece.treeVisual?.role === "foliage" && broken;
  const renderBoxes = useMemo(() => getPieceRenderBoxes(piece), [piece]);
  const colliderBoxes = broken
    ? debrisColliderBoxes(piece.size, renderBoxes)
    : renderBoxes;
  const clusterFrame = vehicleFrameForCluster(piece.clusterId);
  const compoundClusterMember = clusterFrame
    ? compoundClusterOwnsPiece(clusterFrame, piece)
    : false;
  const ownsContactShape = broken || !compoundClusterMember;
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
      if (!fallingTreeFoliage) {
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
      }

      const colliderCount = currentBody.numColliders();
      for (let index = 0; index < colliderCount; index += 1) {
        const collider = currentBody.collider(index);
        collider.setContactForceEventThreshold(Math.max(0.4, mass * 55));
        if (collider.collisionGroups() === DEBRIS_ACTOR_DETAIL) {
          continue;
        }
        // Don't collide with sibling debris yet — let overlaps settle.
        collider.setCollisionGroups(DEBRIS_SETTLING);
      }
    }

    if (!broken && wasBroken.current) {
      currentBody.setBodyType(rapier.RigidBodyType.Fixed, true);
      currentBody.setTranslation(
        { x: piece.position[0], y: piece.position[1], z: piece.position[2] },
        true,
      );
      const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
      const restored = new Quaternion().setFromEuler(new Euler(rx, ry, rz));
      currentBody.setRotation(restored, true);
      currentBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      currentBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      registerBody(piece.id, currentBody);
    }

    wasBroken.current = broken;
  }, [
    broken,
    piece.column,
    piece.id,
    piece.material,
    piece.row,
    fallingTreeFoliage,
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
      friction={
        fallingTreeFoliage ? 0.96 : piece.material === "wood" ? 0.66 : 0.84
      }
      restitution={profile.restitution}
      linearDamping={fallingTreeFoliage ? 0.72 : 0.18}
      angularDamping={fallingTreeFoliage ? 2.4 : 0.24}
      density={profile.density}
      // ВАЖНО: проп нельзя передавать со значением undefined — react-three-
      // rapier проверяет `key in options` и вызывает setCollisionGroups(
      // undefined), wasm приводит это к 0, и коллайдер перестаёт сталкиваться
      // со всем. Прикреплённый кусок должен остаться на дефолтных группах.
      {...(broken ? { collisionGroups: DEBRIS_SETTLING } : {})}
      ccd={broken && collisionTuning.hardCcd}
      softCcdPrediction={broken ? collisionTuning.softCcdPrediction : 0}
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
                payload.other.collider.handle,
              );
            }
          : undefined
      }
    >
      {ownsContactShape && piece.shape === "sphere" ? (
        <BallCollider
          args={[Math.max(0.002, Math.min(...piece.size) / 2 - 0.002)]}
        />
      ) : ownsContactShape && piece.shape === "cylinder" ? (
        // Real round collider: broken wheels and barrels actually roll.
        <CylinderCollider
          args={[
            Math.max(0.002, piece.size[1] / 2 - 0.002),
            Math.max(0.002, (piece.size[0] + piece.size[2]) / 4 - 0.002),
          ]}
        />
      ) : ownsContactShape ? (
        colliderBoxes.map((box, index) => (
          <CuboidCollider
            key={index}
            args={[
              Math.max(0.002, box.size[0] / 2 - 0.002),
              Math.max(0.002, box.size[1] / 2 - 0.002),
              Math.max(0.002, box.size[2] / 2 - 0.002),
            ]}
            position={[...box.center]}
          />
        ))
      ) : null}
      {ownsContactShape ? (
        <OmittedDebrisInteractionColliders
          boxes={renderBoxes}
          primaryBoxes={colliderBoxes}
          material={piece.material}
        />
      ) : null}
    </RigidBody>
  );
});

function BreakableObjects({
  pieces,
  brokenPieces,
  shatteredPieces,
  bodies,
  kinematicClusters,
  kinematicClusterDefinitions,
  mutablePieceIds,
  mutablePieceStates,
  registerBody,
  onDebrisContact,
}: {
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  shatteredPieces: ReadonlySet<string>;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
  kinematicClusterDefinitions: readonly CompoundKinematicClusterDefinition[];
  mutablePieceIds: ReadonlySet<string>;
  mutablePieceStates: MutableRefObject<Map<string, MutablePieceVisualState>>;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onDebrisContact: (
    piece: BreakablePieceDefinition,
    magnitude: number,
    mass: number,
    forceDirection: { x: number; y: number; z: number },
    otherColliderHandle: number,
  ) => void;
}) {
  const { hiddenPieceIds, bodyPieces, physicalBodyPieces } = useMemo(() => {
    const hidden = new Set<string>();
    const dynamicVisuals: BreakablePieceDefinition[] = [];
    const physicalBodies: BreakablePieceDefinition[] = [];
    const kinematicClusterIds = new Set(
      kinematicClusterDefinitions.map((definition) => definition.clusterId),
    );
    for (const piece of pieces) {
      if (shatteredPieces.has(piece.id)) {
        hidden.add(piece.id);
        continue;
      }
      if (
        brokenPieces.has(piece.id) ||
        piece.hinge ||
        // Кластер транспорта живёт своими телами: его куски двигает кадр
        // отсчёта, а инстансная батчёвка целого мира неподвижна.
        isVehicleFramePiece(piece) ||
        kinematicClusterIds.has(piece.clusterId) ||
        piece.shape === "cinderBlock"
      ) {
        hidden.add(piece.id);
        const visualPiece = brokenPieces.has(piece.id)
          ? flattenDetachedTreeFoliage(
              pieceWithMutableState(
                piece,
                mutablePieceStates.current.get(piece.id),
              ),
            )
          : piece;
        dynamicVisuals.push(visualPiece);
        // Intact articulated-train detail is rendered by the compound frame
        // and contacts through its structural envelope. A separate rigid body
        // is created only when a member actually detaches.
        if (
          !kinematicClusterIds.has(piece.clusterId) ||
          brokenPieces.has(piece.id)
        ) {
          physicalBodies.push(visualPiece);
        }
      }
    }
    return {
      hiddenPieceIds: hidden,
      bodyPieces: dynamicVisuals,
      physicalBodyPieces: physicalBodies,
    };
  }, [
    brokenPieces,
    kinematicClusterDefinitions,
    mutablePieceStates,
    pieces,
    shatteredPieces,
  ]);

  return (
    <group>
      <IntactBreakableWorld
        pieces={pieces}
        hiddenPieceIds={hiddenPieceIds}
        mutablePieceIds={mutablePieceIds}
        mutablePieceStates={mutablePieceStates}
      />
      <DynamicBreakableWorld
        pieces={bodyPieces}
        shards={[]}
        remnants={[]}
        bodies={bodies}
        kinematicClusters={kinematicClusters}
      />
      {physicalBodyPieces.map((piece) => (
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

type DebrisContactReporter<Definition> = (
  definition: Definition,
  magnitude: number,
  mass: number,
  forceDirection: { x: number; y: number; z: number },
  otherColliderHandle: number,
) => void;

/**
 * Императивный пул тел дебриса (№4 плана оптимизаций). Осколки и остатки
 * больше не монтируются React-компонентами: тела Rapier создаются и
 * удаляются по диффу списков прямо в коммите, без реконсиляции и эффектов
 * на каждое тело. Регистрация идёт через прежний registerBody, поэтому
 * staging коллизионных групп, grace-окна контактного урона и сон работают
 * как раньше; визуал по-прежнему рисует DynamicBreakableWorld по позам из
 * реестра. События контакта регистрируются в rigidBodyEvents из контекста
 * react-three-rapier — тем же механизмом, что у его <RigidBody>.
 */
function DebrisBodies({
  shards,
  remnants,
  brokenPieces,
  registerBody,
  onShardContact,
  onRemnantContact,
}: {
  shards: readonly ShardDefinition[];
  remnants: readonly RemnantDefinition[];
  brokenPieces: ReadonlySet<string>;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onShardContact: DebrisContactReporter<ShardDefinition>;
  onRemnantContact: DebrisContactReporter<RemnantDefinition>;
}) {
  const { world, rapier, rigidBodyEvents } = useRapier();
  const entries = useRef(
    new Map<string, { body: RapierRigidBody; freed: boolean }>(),
  );
  const shardContact = useRef(onShardContact);
  const remnantContact = useRef(onRemnantContact);
  useEffect(() => {
    shardContact.current = onShardContact;
    remnantContact.current = onRemnantContact;
  }, [onRemnantContact, onShardContact]);

  const buildColliders = useCallback(
    (body: RapierRigidBody, specs: readonly DebrisColliderSpec[]) => {
      for (const spec of specs) {
        const desc =
          spec.shape === "ball"
            ? rapier.ColliderDesc.ball(spec.args[0])
            : spec.shape === "cylinder"
              ? rapier.ColliderDesc.cylinder(
                  spec.args[0],
                  spec.args[1] ?? spec.args[0],
                )
              : rapier.ColliderDesc.cuboid(
                  spec.args[0],
                  spec.args[1] ?? spec.args[0],
                  spec.args[2] ?? spec.args[0],
                );
        desc
          .setTranslation(spec.center[0], spec.center[1], spec.center[2])
          .setDensity(spec.density)
          .setFriction(spec.friction)
          .setRestitution(spec.restitution);
        if (spec.groups !== null) {
          desc.setCollisionGroups(spec.groups);
        }
        world.createCollider(desc, body);
      }
    },
    [rapier, world],
  );

  // Порог контактных событий зависит от массы, а масса — от коллайдеров,
  // поэтому вооружение идёт после их создания (как в прежнем эффекте).
  const armDebris = useCallback(
    (
      body: RapierRigidBody,
      onForce: ContactForceHandler | null,
    ) => {
      const threshold = Math.max(0.4, body.mass() * 55);
      const colliderCount = body.numColliders();
      for (let index = 0; index < colliderCount; index += 1) {
        const collider = body.collider(index);
        collider.setContactForceEventThreshold(threshold);
        if (onForce) {
          collider.setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
        }
      }
      if (onForce) {
        rigidBodyEvents.set(body.handle, { onContactForce: onForce });
      }
    },
    [rapier, rigidBodyEvents],
  );

  const spawnShard = useCallback(
    (shard: ShardDefinition) => {
      const spec = shardBodySpec(shard);
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(
            shard.position[0],
            shard.position[1],
            shard.position[2],
          )
          .setRotation({
            x: shard.quaternion[0],
            y: shard.quaternion[1],
            z: shard.quaternion[2],
            w: shard.quaternion[3],
          })
          .setLinvel(
            shard.linearVelocity[0],
            shard.linearVelocity[1],
            shard.linearVelocity[2],
          )
          .setAngvel({
            x: shard.angularVelocity[0],
            y: shard.angularVelocity[1],
            z: shard.angularVelocity[2],
          })
          .setLinearDamping(spec.linearDamping)
          .setAngularDamping(spec.angularDamping)
          .setCcdEnabled(spec.hardCcd),
      );
      body.setSoftCcdPrediction(spec.softCcdPrediction);
      buildColliders(body, spec.colliders);
      registerBody(shard.id, body);
      armDebris(
        body,
        spec.chunky
          ? (payload) => {
              shardContact.current(
                shard,
                payload.totalForceMagnitude,
                body.mass(),
                payload.maxForceDirection,
                payload.other.collider.handle,
              );
            }
          : null,
      );
      entries.current.set(shard.id, { body, freed: true });
    },
    [armDebris, buildColliders, rapier, registerBody, world],
  );

  const freeRemnant = useCallback(
    (
      remnant: RemnantDefinition,
      entry: { body: RapierRigidBody; freed: boolean },
    ) => {
      const body = entry.body;
      const spec = remnantBodySpec(remnant, true);
      // Освобождённый остаток живёт по debris-паспорту: не больше трёх
      // мировых коллайдеров, группа осадки, CCD — как делал JSX при смене
      // freed-пропа.
      while (body.numColliders() > 0) {
        world.removeCollider(body.collider(0), true);
      }
      buildColliders(body, spec.colliders);
      if (body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      registerBody(remnant.id, body);
      armDebris(
        body,
        spec.chunky
          ? (payload) => {
              remnantContact.current(
                remnant,
                payload.totalForceMagnitude,
                body.mass(),
                payload.maxForceDirection,
                payload.other.collider.handle,
              );
            }
          : null,
      );
      body.enableCcd(spec.hardCcd);
      body.setSoftCcdPrediction(spec.softCcdPrediction);
      body.wakeUp();
      const mass = Math.max(0.02, body.mass());
      body.applyImpulse({ x: 0, y: 0.18 * mass, z: 0 }, true);
      entry.freed = true;
    },
    [armDebris, buildColliders, rapier, registerBody, world],
  );

  const spawnRemnant = useCallback(
    (remnant: RemnantDefinition, freed: boolean) => {
      const spec = remnantBodySpec(remnant, false);
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(
            remnant.position[0],
            remnant.position[1],
            remnant.position[2],
          )
          .setRotation({
            x: remnant.quaternion[0],
            y: remnant.quaternion[1],
            z: remnant.quaternion[2],
            w: remnant.quaternion[3],
          })
          .setLinearDamping(spec.linearDamping)
          .setAngularDamping(spec.angularDamping),
      );
      buildColliders(body, spec.colliders);
      registerBody(remnant.id, body);
      armDebris(body, null);
      const entry = { body, freed: false };
      entries.current.set(remnant.id, entry);
      if (freed) {
        freeRemnant(remnant, entry);
      }
    },
    [armDebris, buildColliders, freeRemnant, rapier, registerBody, world],
  );

  const removeEntry = useCallback(
    (id: string, entry: { body: RapierRigidBody; freed: boolean }) => {
      rigidBodyEvents.delete(entry.body.handle);
      registerBody(id, null);
      world.removeRigidBody(entry.body);
      entries.current.delete(id);
    },
    [registerBody, rigidBodyEvents, world],
  );

  useEffect(() => {
    const live = new Set<string>();
    for (const shard of shards) {
      live.add(shard.id);
      if (!entries.current.has(shard.id)) {
        spawnShard(shard);
      }
    }
    for (const remnant of remnants) {
      live.add(remnant.id);
      const freed = remnant.detached || brokenPieces.has(remnant.parentId);
      const entry = entries.current.get(remnant.id);
      if (!entry) {
        spawnRemnant(remnant, freed);
      } else if (freed && !entry.freed) {
        freeRemnant(remnant, entry);
      }
    }
    for (const [id, entry] of entries.current) {
      if (!live.has(id)) {
        removeEntry(id, entry);
      }
    }
  }, [
    brokenPieces,
    freeRemnant,
    remnants,
    removeEntry,
    shards,
    spawnRemnant,
    spawnShard,
  ]);

  useEffect(
    () => () => {
      for (const [id, entry] of entries.current) {
        removeEntry(id, entry);
      }
    },
    [removeEntry],
  );

  return null;
}

function Grenade({
  grenade,
  onExplode,
  forceFieldRef,
}: {
  grenade: GrenadeDefinition;
  onExplode: (
    id: number,
    kind: ExplosiveKind,
    x: number,
    y: number,
    z: number,
    fieldCellIndex?: number,
  ) => void;
  forceFieldRef?: MutableRefObject<BasaltForceFieldRuntime | null>;
}) {
  const body = useRef<RapierRigidBody>(null);
  const rocketVisual = useRef<Group>(null);
  const rocketTrailMesh = useRef<InstancedMesh>(null);
  const exploded = useRef(false);
  const previousProjectilePosition = useRef<SceneVector3>(grenade.position);
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
  const isRocket = grenade.kind === "rocket";

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

  const triggerAt = useCallback(
    (fieldHit?: BasaltForceFieldHit | null) => {
      if (exploded.current || !body.current) {
        return;
      }

      exploded.current = true;
      const translation = body.current.translation();
      const point: SceneVector3 = fieldHit?.point ?? [
        translation.x,
        translation.y,
        translation.z,
      ];
      onExplode(
        grenade.id,
        grenade.kind,
        point[0],
        point[1],
        point[2],
        fieldHit?.cellIndex,
      );
    },
    [grenade.id, grenade.kind, onExplode],
  );

  const trigger = useCallback(() => {
    if (!body.current) return;
    const translation = body.current.translation();
    const current: SceneVector3 = [translation.x, translation.y, translation.z];
    const fieldHit = forceFieldRef?.current?.intersectSegment(
      previousProjectilePosition.current,
      current,
    );
    triggerAt(fieldHit);
  }, [forceFieldRef, triggerAt]);

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

  useFrame((_, delta) => {
    if (!body.current) {
      return;
    }

    const translation = body.current.translation();
    const current: SceneVector3 = [translation.x, translation.y, translation.z];
    const fieldHit = forceFieldRef?.current?.intersectSegment(
      previousProjectilePosition.current,
      current,
    );
    if (fieldHit) {
      triggerAt(fieldHit);
      return;
    }
    previousProjectilePosition.current = current;

    if (!isRocket) return;

    const trailMesh = rocketTrailMesh.current;
    if (!trailMesh) return;
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
            .addScaledVector(rocketDirection, -index * 0.08 - batch * 0.025);
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
        collisionGroups={ACTOR_NORMAL}
        onCollisionEnter={() => trigger()}
      >
        {isRocket ? (
          <BallCollider args={[0.14]} />
        ) : (
          <CapsuleCollider
            args={[0.075, 0.062]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        )}
        {!isRocket ? <GrenadeProjectileVisual /> : null}
      </RigidBody>

      {isRocket ? (
        <group ref={rocketVisual}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.11, 0.54, 18]} />
            <meshStandardMaterial
              color="#28302e"
              metalness={0.42}
              roughness={0.48}
            />
          </mesh>
          <mesh
            castShadow
            position={[0, 0, 0.37]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <coneGeometry args={[0.112, 0.24, 18]} />
            <meshStandardMaterial
              color="#d6d0b9"
              metalness={0.35}
              roughness={0.42}
            />
          </mesh>
          <mesh
            castShadow
            position={[0, 0, -0.36]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.075, 0.075, 0.12, 16]} />
            <meshStandardMaterial
              color="#59615d"
              metalness={0.5}
              roughness={0.5}
            />
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
              <meshStandardMaterial
                color="#5f6965"
                metalness={0.45}
                roughness={0.5}
              />
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
const voxelFireColors = ["#fff8d5", "#ffe08a", "#ffb13b", "#ff782f", "#d84220"];
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
          variant < 5
            ? ("fire" as const)
            : variant < 8
              ? ("smoke" as const)
              : ("spark" as const);
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
      light.current.intensity = 52 * Math.max(0, 1 - time / 0.38) ** 1.7;
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

/**
 * Намерение человека одной строкой. Склад и площадка переводятся по своим
 * ключам, а незнакомое место — общим словом: карточка не должна ломаться от
 * того, что в мире появилось новое имя.
 */
function describeVillagerIntent(
  report: VillagerReport,
  t: (key: TranslationKey) => string,
): string {
  // Подстановка своя: словарь отдаёт строку с {place} и {cargo}, а сам
  // подставлять не умеет.
  const fill = (key: TranslationKey, values: Record<string, string>): string =>
    t(key).replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
  const placeName = (id: string): string => {
    const key = `villager.place.${id}` as TranslationKey;
    const text = t(key);
    if (text !== key) {
      return text;
    }
    // Дворы и пороги домов подписаны общим словом: их семь штук, и называть
    // каждый по имени хозяина карточке ни к чему.
    if (id.endsWith("-yard")) {
      return t("villager.place.yard");
    }
    if (id.endsWith("-threshold")) {
      return t("villager.place.threshold");
    }
    return t("villager.place.other");
  };
  // Работающий человек описывается МЕСТОМ, а не следующей целью: «идёт к
  // горну», пока он машет топором у поленницы, — это и есть та неувязка,
  // которую видно первым делом.
  if (report.at) {
    return fill("villager.intent.at", { place: placeName(report.at) });
  }
  if (report.intent.kind === "flow") {
    const place = placeName(report.intent.toStore);
    const cargo = t(`villager.cargo.${report.cargo ?? "firewood"}` as TranslationKey);
    return report.intent.carrying
      ? fill("villager.intent.deliver", { cargo, place })
      : fill("villager.intent.fetch", { cargo });
  }
  if (report.intent.kind === "place") {
    return fill("villager.intent.place", { place: placeName(report.intent.areaId) });
  }
  if (report.intent.kind === "home") {
    return t("villager.intent.home");
  }
  return t("villager.intent.idle");
}

function VillagerProbe({
  lookup,
  onChange,
}: {
  lookup: {
    current:
      | ((
          origin: readonly [number, number, number],
          direction: readonly [number, number, number],
        ) => VillagerReport | null)
      | null;
  };
  onChange: (report: VillagerReport | null) => void;
}) {
  const timer = useRef(0);
  const shownId = useRef<string | null>(null);
  const lastSeenAt = useRef(-Infinity);
  const direction = useRef(new Vector3());
  useFrame(({ camera, clock }, delta) => {
    timer.current -= delta;
    if (timer.current > 0) {
      return;
    }
    timer.current = 0.25;
    const probe = lookup.current;
    const report = probe
      ? probe(
          [camera.position.x, camera.position.y, camera.position.z],
          camera.getWorldDirection(direction.current).toArray() as [
            number,
            number,
            number,
          ],
        )
      : null;
    if (report) {
      // Другой житель заменяет карточку сразу; данные текущего
      // продолжают обновляться, пока он под перекрестьем.
      lastSeenAt.current = clock.elapsedTime;
      shownId.current = report.id;
      onChange(report);
      return;
    }
    if (
      shownId.current !== null &&
      clock.elapsedTime - lastSeenAt.current >= 3
    ) {
      shownId.current = null;
      onChange(null);
    }
  });
  return null;
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

function OpenWorldShell({ scene }: { scene: DestructionSceneDefinition }) {
  const [centerX, centerZ] = scene.worldCenter;
  const [halfX, halfZ] = scene.worldHalfExtents;
  const boundaryRadius = scene.boundaryRadius ?? scene.worldRadius;
  const safetyHalfX = Math.max(halfX, boundaryRadius ?? 0);
  const safetyHalfZ = Math.max(halfZ, boundaryRadius ?? 0);
  const wallHalfHeight = 80;
  const wallY = scene.safetyFloorY + wallHalfHeight;
  const circularSegments = boundaryRadius
    ? Math.max(32, Math.ceil((Math.PI * 2 * boundaryRadius) / 11))
    : 0;
  const circularSegmentLength = boundaryRadius
    ? 2 * boundaryRadius * Math.sin(Math.PI / circularSegments) + 0.5
    : 0;

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[safetyHalfX, 0.12, safetyHalfZ]}
        position={[centerX, scene.safetyFloorY, centerZ]}
        friction={1}
        collisionGroups={ACTOR_SAFETY_FLOOR}
      />
      {boundaryRadius ? (
        Array.from({ length: circularSegments }, (_, index) => {
          const angle = (index / circularSegments) * Math.PI * 2;
          return (
            <CuboidCollider
              key={`world-ring:${index}`}
              args={[circularSegmentLength / 2, wallHalfHeight, 0.18]}
              collisionGroups={WORLD_BOUNDARY}
              position={[
                centerX + Math.cos(angle) * boundaryRadius,
                wallY,
                centerZ + Math.sin(angle) * boundaryRadius,
              ]}
              rotation={[0, -angle - Math.PI / 2, 0]}
            />
          );
        })
      ) : (
        <>
          <CuboidCollider
            args={[0.12, wallHalfHeight, halfZ]}
            collisionGroups={WORLD_BOUNDARY}
            position={[centerX - halfX, wallY, centerZ]}
          />
          <CuboidCollider
            args={[0.12, wallHalfHeight, halfZ]}
            collisionGroups={WORLD_BOUNDARY}
            position={[centerX + halfX, wallY, centerZ]}
          />
          <CuboidCollider
            args={[halfX, wallHalfHeight, 0.12]}
            collisionGroups={WORLD_BOUNDARY}
            position={[centerX, wallY, centerZ - halfZ]}
          />
          <CuboidCollider
            args={[halfX, wallHalfHeight, 0.12]}
            collisionGroups={WORLD_BOUNDARY}
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
  timeOfDaySnapVersion: number;
  fallbackLook: boolean;
  mobileControls: MobileControlsRef;
  mobileActions: MutableRefObject<MobileActionBridge>;
  resetVersion: number;
  entryOpenRequestVersion: number;
  entryOpenRequestTargetRef: MutableRefObject<HingedEntryApproach | null>;
  initialArrivalFlightKind: string | null;
  initialArrivalPassengerTransit: InterIslandPassengerTransit | null;
  interIslandArrivalActive: boolean;
  entryInteractionActive: boolean;
  interIslandBoundaryPassThrough: boolean;
  cinematic: boolean;
  onActiveChange: (active: boolean) => void;
  onFallbackChange: (fallback: boolean) => void;
  onPointerLockChange: (held: boolean) => void;
  onBrokenCountChange: (count: number) => void;
  onDynamicBodyCountChange: (count: number) => void;
  onEntryApproachChange: (entry: HingedEntryApproach | null) => void;
  onVillagerInspect: (report: VillagerReport | null) => void;
  onDepartureApproachChange: (approached: HingedEntryApproach | null) => void;
  onInterIslandBoundary: (
    flightKind: string,
    passenger: InterIslandPassengerHandoff | null,
  ) => void;
  onInterIslandArrivalReady: (flightKind: string) => void;
  onInterIslandArrivalComplete: (flightKind: string) => void;
  onInterIslandPassengerStateChange: (
    flightActive: boolean,
    passengerInsideCarrier: boolean,
    flightKind: string | null,
  ) => void;
  occupiedSeatId: string | null;
  onOccupiedSeatChange: (seatId: string | null) => void;
  onMotionTelemetryUpdate: (update: MotionTelemetryUpdate) => void;
  onRotorcraftPilotStatusChange: (
    status: RotorcraftPilotStatus | null,
  ) => void;
  motionTelemetryStore: MotionTelemetryStore;
  onVehicleFailure: (event: VehicleFailureEvent) => void;
}

function OpenWorldScene({
  scene,
  active,
  flightMode,
  weapon,
  timeOfDay,
  timeOfDaySnapVersion,
  fallbackLook,
  mobileControls,
  mobileActions,
  resetVersion,
  entryOpenRequestVersion,
  entryOpenRequestTargetRef,
  initialArrivalFlightKind,
  initialArrivalPassengerTransit,
  interIslandArrivalActive,
  entryInteractionActive,
  interIslandBoundaryPassThrough,
  cinematic,
  onActiveChange,
  onFallbackChange,
  onPointerLockChange,
  onBrokenCountChange,
  onDynamicBodyCountChange,
  onEntryApproachChange,
  onVillagerInspect,
  onDepartureApproachChange,
  onInterIslandBoundary,
  onInterIslandArrivalReady,
  onInterIslandArrivalComplete,
  onInterIslandPassengerStateChange,
  occupiedSeatId,
  onOccupiedSeatChange,
  onMotionTelemetryUpdate,
  onRotorcraftPilotStatusChange,
  motionTelemetryStore,
  onVehicleFailure,
}: OpenWorldSceneProps) {
  const {
    breakablePieceById,
    breakablePieces,
    fractureLocallyAt,
    indestructible,
    lampDefinitions,
    mutableObjectDefinitions,
    mutablePieceIds,
    motionInstrumentDefinitions,
    spotLightDefinitions,
    settleAfterBreak,
    structuralScopeFor,
  } = scene;
  const occupiedCarrierClusterId =
    passengerSeatForId(occupiedSeatId)?.carrierClusterId ?? null;
  const intactGroundRenderColors = useMemo(
    () => buildIntactGroundRenderColors(breakablePieces),
    [breakablePieces],
  );
  const customDamageGeometryByPieceId = useMemo(() => {
    const compiled = new Map<
      string,
      NonNullable<ReturnType<typeof compilePieceDamageGeometry>>
    >();
    for (const piece of breakablePieces) {
      const geometry = compilePieceDamageGeometry(piece);
      if (geometry) compiled.set(piece.id, geometry);
    }
    return compiled;
  }, [breakablePieces]);
  const resolveDamageSource = useCallback(
    (source: ShardSource): ShardSource => {
      if (source.voxelBody) return source;
      const geometry = customDamageGeometryByPieceId.get(source.id);
      return geometry
        ? { ...source, voxelBody: geometry.body, boxes: geometry.boxes }
        : source;
    },
    [customDamageGeometryByPieceId],
  );
  const pieceSpatialIndex = useMemo(
    () => createSpatialIndex(breakablePieces, 5),
    [breakablePieces],
  );
  // Точка интереса чаек: центр баллона небесного драккара, если он есть в
  // сцене. Считается по кускам, поэтому переезд корабля стаю не потеряет.
  const airshipInterest = useMemo(() => {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let goreCount = 0;
    for (const piece of breakablePieces) {
      if (piece.id.includes("sky-longship") && piece.id.includes("gore")) {
        sumX += piece.position[0];
        sumY += piece.position[1];
        sumZ += piece.position[2];
        goreCount += 1;
      }
    }
    return goreCount > 0
      ? ([sumX / goreCount, sumY / goreCount, sumZ / goreCount] as const)
      : undefined;
  }, [breakablePieces]);
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
  const passengerViewMotion = useMemo(() => createPassengerViewMotion(), []);
  const raycaster = useRef(new Raycaster());
  const basaltForceField = useRef<BasaltForceFieldRuntime | null>(null);
  const forceFieldActive = scene.id === "basalt-stronghold";
  const forceFieldTransmission = useCallback(
    (from: SceneVector3, to: SceneVector3): number => {
      if (!forceFieldActive) return 1;
      return basaltForceField.current?.blocksSegment(from, to) ? 0 : 1;
    },
    [forceFieldActive],
  );
  const center = useMemo(() => new Vector2(0, 0), []);
  const [brokenPieces, setBrokenPieces] = useState<ReadonlySet<string>>(() =>
    settleAfterBreak(new Set()),
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
  // Detached authored pieces which fell below the physical world remain
  // structurally broken, but no longer own a body or a visible instance.
  const [discardedPieces, setDiscardedPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [tracers, setTracers] = useState<readonly TracerDefinition[]>([]);
  const brokenPiecesRef = useRef<ReadonlySet<string>>(brokenPieces);
  // Двери, которые прямо сейчас открывают жители: общий канал между их
  // симуляцией и дверной системой.
  const villagerInspect = useRef<
    | ((
        origin: readonly [number, number, number],
        direction: readonly [number, number, number],
      ) => VillagerReport | null)
    | null
  >(null);
  const villagerDoorRequests = useRef<Set<string>>(new Set());
  // Обратная связь от створок: какие входы уже распахнуты. Без неё житель
  // просит открыть — и тут же проходит сквозь ещё закрытую дверь.
  const villagerOpenDoors = useRef<Set<string>>(new Set());
  const nightRef = useRef(0);
  const worldTimeRef = useRef(TIME_OF_DAY_TARGETS.day);
  const mutablePieceStates = useRef(new Map<string, MutablePieceVisualState>());
  const breakableRaycastRoot = useRef<Group>(null);
  const pieceBodies = useRef(new Map<string, RapierRigidBody>());
  // One authoritative contact carrier and one momentum inbox per compound.
  // Weapons may enqueue before the custom vehicle integrator runs its next
  // fixed step; no Rapier dynamic-body surrogate is involved.
  const compoundKinematicClusters = useRef(
    new Map<string, CompoundKinematicClusterRuntime>(),
  );
  const compoundKinematicImpulses = useRef(
    new Map<string, CompoundKinematicImpulse[]>(),
  );
  const dynamicBodies = useRef(new Map<string, RapierRigidBody>());
  const pendingBodyActions = useRef(new Map<string, BodyAction[]>());
  const preStepMotions = useRef(new Map<string, ImpactMotion>());
  const debrisSoundByBody = useRef(new Map<string, number>());
  const physicsStep = useRef(0);
  const debrisSettlingUntilStep = useRef(new Map<string, number>());
  const lastContactStepByBody = useRef(new Map<string, Map<number, number>>());
  const contactDamageAfterStep = useRef(new Map<string, number>());
  const dynamicStartedStep = useRef(new Map<string, number>());
  const restCounters = useRef(new Map<string, number>());
  const settleAccumulator = useRef(0);
  const strikeTimers = useRef<number[]>([]);
  const shardsRef = useRef<readonly ShardDefinition[]>([]);
  const shardById = useRef(new Map<string, ShardDefinition>());
  const shatteredPiecesRef = useRef(new Set<string>());
  const shardCounter = useRef(0);
  const impactShatterTimes = useRef<number[]>([]);
  const chipTimes = useRef<number[]>([]);
  const remnantsRef = useRef<readonly RemnantDefinition[]>([]);
  const remnantById = useRef(new Map<string, RemnantDefinition>());
  const remnantCounter = useRef(0);
  const remainingVolumeRef = useRef(new Map<string, number>());
  const carvedPiecesRef = useRef(new Set<string>());
  const discardedPiecesRef = useRef(new Set<string>());
  const forcedStructureSeeds = useRef(new Set<string>());
  // Снимок состояния на момент последнего структурного пересчёта: следующий
  // settle сеет зону пересчёта только из дельты против этого снимка.
  const lastSettleSnapshot = useRef<{
    broken: ReadonlySet<string>;
    carved: ReadonlySet<string>;
    remnantParents: ReadonlyMap<string, string>;
  } | null>(null);
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
  const pendingBlasts = useRef<PendingBlastJob[]>([]);
  const blastEpoch = useRef(0);
  const carveWorker = useRef<Worker | null>(null);
  const carveJobs = useRef(
    new Map<number, (response: CarveKernelResponse | null) => void>(),
  );
  const carveRequestId = useRef(0);
  const shadowInvalidation = useRef(1);
  const appliedShadowInvalidation = useRef(0);

  const intersectBreakables = useCallback((maximumDistance: number) => {
    const root = breakableRaycastRoot.current;
    if (!root) {
      return [];
    }
    raycaster.current.far = maximumDistance;
    return raycaster.current.intersectObject(root, true);
  }, []);

  // Dev-only crosshair probe: casts the SAME ray through the render scene and
  // through the Rapier world. A wall that renders but has no physics shows up
  // as visual.distance << physics.distance. Published on <html data-*> so a
  // CDP driver can read it without evaluating into the R3F closure.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    const debugWindow = window as Window & {
      __mamPhysicsProbe?: (
        originOverride?: readonly [number, number, number],
        directionOverride?: readonly [number, number, number],
      ) => unknown;
    };
    debugWindow.__mamPhysicsProbe = (originOverride, directionOverride) => {
      const origin = originOverride
        ? new Vector3(...originOverride)
        : camera.position.clone();
      const direction = directionOverride
        ? new Vector3(...directionOverride).normalize()
        : camera.getWorldDirection(new Vector3());
      raycaster.current.set(origin, direction);
      const intersections = intersectBreakables(120);
      const visual = intersections[0] ?? null;
      const breakableIntersection = intersections.find((candidate) =>
        Boolean(readBreakableHit(candidate)),
      );
      const breakableHit = breakableIntersection
        ? readBreakableHit(breakableIntersection)
        : null;
      const visualId =
        breakableHit?.pieceId ??
        breakableHit?.shardId ??
        breakableHit?.remnantId ??
        null;

      const playerBody = pieceBodies.current.get("player");
      const ray = new rapier.Ray(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z },
      );
      const physicsHit = world.castRayAndGetNormal(
        ray,
        120,
        true,
        undefined,
        undefined,
        undefined,
        playerBody,
      );
      const physicsBody = physicsHit?.collider.parent() ?? null;
      const physicsTranslation = physicsBody?.translation() ?? null;
      const remnant = visualId ? remnantById.current.get(visualId) : null;
      const registered = visualId
        ? (pieceBodies.current.get(visualId) ?? null)
        : null;

      return {
        origin: origin.toArray(),
        direction: direction.toArray(),
        visual: visual
          ? {
              distance: visual.distance,
              point: visual.point.toArray(),
              breakableId: visualId,
              breakableKind: breakableHit
                ? breakableHit.remnantId
                  ? "remnant"
                  : breakableHit.shardId
                    ? "shard"
                    : "piece"
                : null,
              breakableDistance: breakableIntersection?.distance ?? null,
            }
          : null,
        physics: physicsHit
          ? {
              distance: physicsHit.timeOfImpact,
              colliderHandle: physicsHit.collider.handle,
              shapeType: physicsHit.collider.shapeType(),
              groups: physicsHit.collider.collisionGroups(),
              bodyType: physicsBody?.bodyType() ?? null,
              bodyPosition: physicsTranslation
                ? [
                    physicsTranslation.x,
                    physicsTranslation.y,
                    physicsTranslation.z,
                  ]
                : null,
            }
          : null,
        gapMeters:
          visual && physicsHit
            ? physicsHit.timeOfImpact - visual.distance
            : null,
        visualTarget: visualId
          ? {
              registeredBody: Boolean(registered),
              registeredBodyType: registered?.bodyType() ?? null,
              registeredSleeping: registered?.isSleeping() ?? null,
              registeredPosition: registered
                ? (() => {
                    const translation = registered.translation();
                    return [translation.x, translation.y, translation.z];
                  })()
                : null,
              remnant: remnant
                ? {
                    detached: remnant.detached,
                    parentId: remnant.parentId,
                    boxes: remnant.boxes?.length ?? 0,
                    size: remnant.size,
                    position: remnant.position,
                  }
                : null,
              carved: carvedPiecesRef.current.has(visualId),
              broken: brokenPiecesRef.current.has(visualId),
            }
          : null,
      };
    };
    const teleportWindow = window as Window & {
      __mamTeleport?: (x: number, y: number, z: number) => boolean;
      __mamRapierDebug?: { world: unknown; rapier: unknown };
    };
    const rapierDebug = { world, rapier };
    teleportWindow.__mamRapierDebug = rapierDebug;
    const teleport = (x: number, y: number, z: number) => {
      const playerBody = pieceBodies.current.get("player");
      if (!playerBody) {
        return false;
      }
      playerBody.setTranslation({ x, y, z }, true);
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return true;
    };
    teleportWindow.__mamTeleport = teleport;
    const query = new URLSearchParams(window.location.search);
    const automaticProbe =
      query.get("mamProbe") === "1" || runtimeDiagnosticsEnabled("scene");
    const teleportRequest = query.get("mamTeleport") ?? "";
    let handledTeleportRequest = "";
    const teleportAvailableAt = performance.now() + 1_200;
    let timer: number | undefined;
    const publish = () => {
      // Изолированный контекст браузерного теста не видит функции на window.
      // Одноразовая dev-команда в query string оставляет тот же физический
      // телепорт и не требует отдельного тестового UI.
      if (
        performance.now() >= teleportAvailableAt &&
        teleportRequest &&
        teleportRequest !== handledTeleportRequest
      ) {
        try {
          const [x, y, z] = teleportRequest.split(",").map(Number) as [
            number,
            number,
            number,
          ];
          if ([x, y, z].every(Number.isFinite) && teleport(x, y, z)) {
            handledTeleportRequest = teleportRequest;
            if (!automaticProbe && timer !== undefined) {
              window.clearInterval(timer);
              timer = undefined;
            }
          }
        } catch {
          // Невалидная диагностическая команда не должна ронять игровой кадр.
        }
      }
      if (automaticProbe) {
        try {
          document.documentElement.dataset.mamPhysicsProbe = JSON.stringify(
            debugWindow.__mamPhysicsProbe?.() ?? null,
          );
        } catch {
          document.documentElement.dataset.mamPhysicsProbe = "null";
        }
      }
    };
    // The callable probe remains available in devtools. Continuous scene +
    // physics raycasts are deliberately opt-in via `?mamProbe=1`.
    if (automaticProbe || teleportRequest) {
      publish();
      timer = window.setInterval(publish, 200);
    }
    return () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      delete document.documentElement.dataset.mamPhysicsProbe;
      delete debugWindow.__mamPhysicsProbe;
      if (teleportWindow.__mamTeleport === teleport) {
        delete teleportWindow.__mamTeleport;
      }
      if (teleportWindow.__mamRapierDebug === rapierDebug) {
        delete teleportWindow.__mamRapierDebug;
      }
    };
  }, [camera, intersectBreakables, rapier, world]);

  const registerBody = useCallback(
    (id: string, body: RapierRigidBody | null) => {
      if (body) {
        pieceBodies.current.set(id, body);
        if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
          dynamicBodies.current.set(id, body);
          if (!dynamicStartedStep.current.has(id)) {
            dynamicStartedStep.current.set(id, physicsStep.current);
            contactDamageAfterStep.current.set(
              id,
              physicsStep.current + DEBRIS_CONTACT_GRACE_STEPS,
            );
            debrisSettlingUntilStep.current.set(
              id,
              physicsStep.current + DEBRIS_SETTLE_STEPS,
            );
            const colliderCount = body.numColliders();
            for (let index = 0; index < colliderCount; index += 1) {
              const collider = body.collider(index);
              if (collider.collisionGroups() !== DEBRIS_ACTOR_DETAIL) {
                collider.setCollisionGroups(DEBRIS_SETTLING);
              }
            }
          }
        } else {
          dynamicBodies.current.delete(id);
          dynamicStartedStep.current.delete(id);
          debrisSettlingUntilStep.current.delete(id);
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
        lastContactStepByBody.current.delete(id);
        contactDamageAfterStep.current.delete(id);
        dynamicStartedStep.current.delete(id);
        debrisSettlingUntilStep.current.delete(id);
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
    physicsStep.current += 1;
    for (const [id, readyStep] of debrisSettlingUntilStep.current) {
      if (physicsStep.current < readyStep) {
        continue;
      }
      debrisSettlingUntilStep.current.delete(id);
      const body = dynamicBodies.current.get(id);
      if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        continue;
      }
      const colliderCount = body.numColliders();
      for (let index = 0; index < colliderCount; index += 1) {
        const collider = body.collider(index);
        if (collider.collisionGroups() !== DEBRIS_ACTOR_DETAIL) {
          collider.setCollisionGroups(DEBRIS_NORMAL);
        }
      }
    }

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

  const markRemnantDetached = useCallback((id: string) => {
    const current = remnantById.current.get(id);
    if (!current || current.detached) {
      return;
    }

    const detached = { ...current, detached: true };
    const next = remnantsRef.current.map((remnant) =>
      remnant.id === id ? detached : remnant,
    );
    remnantsRef.current = next;
    remnantById.current = new Map(next.map((remnant) => [remnant.id, remnant]));
    forcedStructureSeeds.current.add(current.parentId);
    setRemnants(next);
  }, []);

  const ensureDynamic = useCallback(
    (id: string, body: RapierRigidBody) => {
      if (body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
      }
      // Runtime body type is the source of truth. Keeping an attached
      // remnant marked as fixed after an impact routes every later hit back
      // into carveAt(), which must reject a dynamic body.
      markRemnantDetached(id);
      registerBody(id, body);
    },
    [markRemnantDetached, rapier, registerBody],
  );

  const configureDebrisCollision = useCallback(
    (id: string, body: RapierRigidBody) => {
      const shard = shardById.current.get(id);
      const source =
        shard ?? remnantById.current.get(id) ?? breakablePieceById.get(id);
      if (!source) {
        return;
      }

      const tuning = debrisCollisionTuning(source.size, !shard?.preferSoftCcd);
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
    discardedPieces,
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
    // Недоигранные очереди взрывов ссылаются на цели стёртого мира; эпоха
    // обесценивает и ответы воркера, которые ещё в полёте.
    pendingBlasts.current.length = 0;
    blastEpoch.current += 1;
    const settled = settleAfterBreak(new Set());
    brokenPiecesRef.current = settled;
    setBrokenPieces(settled);
    setBursts([]);
    setShards([]);
    setShatteredPieces(new Set());
    shatteredPiecesRef.current.clear();
    shardsRef.current = [];
    shardById.current.clear();
    setRemnants([]);
    setCarvedPieces(new Set());
    setDiscardedPieces(new Set());
    setTracers([]);
    remnantsRef.current = [];
    remnantById.current.clear();
    remainingVolumeRef.current.clear();
    carvedPiecesRef.current.clear();
    discardedPiecesRef.current.clear();
    forcedStructureSeeds.current.clear();
    lastSettleSnapshot.current = null;
    firing.current = false;
    setGrenades([]);
    setExplosions([]);
    restCounters.current.clear();
    preStepMotions.current.clear();
    debrisSoundByBody.current.clear();
    physicsStep.current = 0;
    debrisSettlingUntilStep.current.clear();
    lastContactStepByBody.current.clear();
    contactDamageAfterStep.current.clear();
    dynamicStartedStep.current.clear();
    pendingBodyActions.current.clear();
    compoundKinematicImpulses.current.clear();
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

    const discardedAuthored = new Set(discardedPiecesRef.current);
    const vanishedShardIds = new Set<string>();
    const vanishedRemnantIds = new Set<string>();
    let discardedAuthoredChanged = false;

    for (const [id, body] of dynamicBodies.current) {
      if (
        id === "player" ||
        !isBelowWorldDisappearDepth(body.translation().y, scene.safetyFloorY)
      ) {
        continue;
      }
      restCounters.current.delete(id);
      if (shardById.current.has(id)) {
        vanishedShardIds.add(id);
      } else if (remnantById.current.has(id)) {
        vanishedRemnantIds.add(id);
      } else if (
        breakablePieceById.has(id) &&
        brokenPiecesRef.current.has(id) &&
        !discardedAuthored.has(id)
      ) {
        discardedAuthored.add(id);
        discardedAuthoredChanged = true;
      }
    }

    if (discardedAuthoredChanged) {
      discardedPiecesRef.current = discardedAuthored;
      setDiscardedPieces(discardedAuthored);
    }
    if (vanishedShardIds.size > 0) {
      shardsRef.current = shardsRef.current.filter(
        (shard) => !vanishedShardIds.has(shard.id),
      );
      for (const id of vanishedShardIds) {
        shardById.current.delete(id);
      }
      setShards(shardsRef.current);
    }
    if (vanishedRemnantIds.size > 0) {
      remnantsRef.current = remnantsRef.current.filter(
        (remnant) => !vanishedRemnantIds.has(remnant.id),
      );
      remnantById.current = new Map(
        remnantsRef.current.map((remnant) => [remnant.id, remnant]),
      );
      setRemnants(remnantsRef.current);
    }

    for (const [id, body] of dynamicBodies.current) {
      if (
        id === "player" ||
        discardedAuthored.has(id) ||
        vanishedShardIds.has(id) ||
        vanishedRemnantIds.has(id) ||
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
        ((physicsStep.current -
          (dynamicStartedStep.current.get(id) ?? physicsStep.current)) *
          1000) /
        60;

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
      const expandedSeedBroken = expandBrokenTreeDescendants(
        breakablePieces,
        seedBroken,
      );
      // Зона пересчёта — только компоненты, где что-то ИЗМЕНИЛОСЬ с
      // прошлого пересчёта. Сеять всю историю сломанного/карвленного
      // нельзя: к середине партии зона доросла бы до всей карты, и каждый
      // settle стоил бы ~0.7 с вместо единиц миллисекунд.
      const previous = lastSettleSnapshot.current;
      const scopeSeeds = new Set<string>();
      for (const id of forcedStructureSeeds.current) {
        scopeSeeds.add(id);
      }
      forcedStructureSeeds.current.clear();
      if (!previous) {
        for (const id of expandedSeedBroken) {
          scopeSeeds.add(id);
        }
        for (const id of carvedPiecesRef.current) {
          scopeSeeds.add(id);
        }
        for (const remnant of remnantsRef.current) {
          scopeSeeds.add(remnant.parentId);
        }
      } else {
        for (const id of expandedSeedBroken) {
          if (!previous.broken.has(id)) {
            scopeSeeds.add(id);
          }
        }
        for (const id of carvedPiecesRef.current) {
          if (!previous.carved.has(id)) {
            scopeSeeds.add(id);
          }
        }
        // Обрубки: и появившиеся, и исчезнувшие меняют опоры родителя.
        const currentRemnantIds = new Set<string>();
        for (const remnant of remnantsRef.current) {
          currentRemnantIds.add(remnant.id);
          if (!previous.remnantParents.has(remnant.id)) {
            scopeSeeds.add(remnant.parentId);
          }
        }
        for (const [remnantId, parentId] of previous.remnantParents) {
          if (!currentRemnantIds.has(remnantId)) {
            scopeSeeds.add(parentId);
          }
        }
      }
      const structuralScope = structuralScopeFor(scopeSeeds);
      const resolveWithTreeCascade = (broken: ReadonlySet<string>) => {
        let cascaded = expandBrokenTreeDescendants(breakablePieces, broken);
        let resolved = resolveRuntimeStructure(
          breakablePieces,
          structuralMaterialProfiles,
          cascaded,
          carvedPiecesRef.current,
          remnantsRef.current,
          structuralScope,
        );
        // Structural failure may reveal another broken parent. A tree is only
        // three authored levels deep, so this converges in at most three
        // inexpensive passes and never expands the building scope.
        for (let pass = 0; pass < 3; pass += 1) {
          cascaded = expandBrokenTreeDescendants(
            breakablePieces,
            resolved.brokenPieceIds,
          );
          if (cascaded.size === resolved.brokenPieceIds.size) {
            break;
          }
          resolved = resolveRuntimeStructure(
            breakablePieces,
            structuralMaterialProfiles,
            cascaded,
            carvedPiecesRef.current,
            remnantsRef.current,
            structuralScope,
          );
        }
        return resolved;
      };
      let result = resolveWithTreeCascade(expandedSeedBroken);
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

        const originalVolume = parent.size[0] * parent.size[1] * parent.size[2];
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
                remnant.size[0] * remnant.size[1] * remnant.size[2]),
            0,
          );
        if (stableVolume < originalVolume * VOLUME_BREAK_FRACTION) {
          sectionFailures.add(parentId);
        }
      }

      if (sectionFailures.size > result.brokenPieceIds.size) {
        result = resolveWithTreeCascade(sectionFailures);
      }
      let remnantsChanged = false;
      const updatedRemnants = remnantsRef.current.map((remnant) => {
        if (remnant.detached || !result.detachedFragmentIds.has(remnant.id)) {
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

      lastSettleSnapshot.current = {
        broken: result.brokenPieceIds,
        carved: new Set(carvedPiecesRef.current),
        remnantParents: new Map(
          remnantsRef.current.map((remnant) => [remnant.id, remnant.parentId]),
        ),
      };
      brokenPiecesRef.current = result.brokenPieceIds;
      setBrokenPieces(result.brokenPieceIds);
      onBrokenCountChange(result.brokenPieceIds.size);
      return result.brokenPieceIds;
    },
    [
      breakablePieceById,
      breakablePieces,
      onBrokenCountChange,
      structuralScopeFor,
    ],
  );

  const breakAt = useCallback(
    (target: BreakablePieceDefinition, currentImpact: number) => {
      if (indestructible) {
        return;
      }
      const next = fractureLocallyAt(
        target,
        brokenPiecesRef.current,
        currentImpact,
      );
      settleStructure(next);
    },
    [fractureLocallyAt, indestructible, settleStructure],
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

  const commitShards = useCallback((additions: readonly ShardDefinition[]) => {
    const merged = [...shardsRef.current, ...additions];
    // Вытеснение при переполнении: сначала спящие и далёкие от игрока.
    // Удаление тела будит его контактный остров, поэтому чистый FIFO
    // заставлял дальний выстрел шевелить давно улёгшуюся кучу перед игроком.
    const playerTranslation = pieceBodies.current
      .get("player")
      ?.translation();
    const trimmed = trimShardBudget(merged, undefined, undefined, {
      protectedNewest: additions.length,
      priority: (shard) => {
        const body = pieceBodies.current.get(shard.id);
        const awakeBonus = body && !body.isSleeping() ? 1_000_000 : 0;
        const translation = body?.translation();
        const x = translation?.x ?? shard.position[0];
        const y = translation?.y ?? shard.position[1];
        const z = translation?.z ?? shard.position[2];
        const distanceSq = playerTranslation
          ? (x - playerTranslation.x) ** 2 +
            (y - playerTranslation.y) ** 2 +
            (z - playerTranslation.z) ** 2
          : 0;
        return awakeBonus - distanceSq;
      },
    });
    shardsRef.current = trimmed;
    shardById.current = new Map(trimmed.map((shard) => [shard.id, shard]));
    setShards(trimmed);
  }, []);

  const commitRemnants = useCallback(
    (removeId: string | null, additions: readonly RemnantDefinition[]) => {
      const replacementParents = new Set(
        additions.map((remnant) => remnant.parentId),
      );
      const filtered = removeId
        ? remnantsRef.current.filter((remnant) => remnant.id !== removeId)
        : replacementParents.size > 0
          ? remnantsRef.current.filter(
              (remnant) => !replacementParents.has(remnant.parentId),
            )
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

      const original =
        parent.volume ?? parent.size[0] * parent.size[1] * parent.size[2];
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
      if (indestructible) {
        return false;
      }
      if (
        (origin === "piece" &&
          (carvedPiecesRef.current.has(source.id) ||
            shatteredPiecesRef.current.has(source.id))) ||
        (origin === "shard" && !shardById.current.has(source.id)) ||
        (origin === "remnant" && !remnantById.current.has(source.id))
      ) {
        return false;
      }

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
        ? new Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z)
        : new Vector3();
      const bodyAngularVelocity = angularVelocity
        ? new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
        : new Vector3();

      shardCounter.current += 1;
      const fractureSource =
        source.treeVisual?.role === "foliage"
          ? {
              ...source,
              shape: "panel" as const,
              size: detachedTreeFoliageSize(source.size),
            }
          : source;
      const generated = buildShards(
        resolveDamageSource(fractureSource),
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
        const next = new Set(shatteredPiecesRef.current);
        next.add(source.id);
        shatteredPiecesRef.current = next;
        setShatteredPieces(next);
      }
      commitShards(generated);
      return true;
    },
    [commitRemnants, commitShards, indestructible, resolveDamageSource],
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
      if (indestructible) {
        return false;
      }
      if (
        (origin === "piece" &&
          (carvedPiecesRef.current.has(source.id) ||
            shatteredPiecesRef.current.has(source.id))) ||
        (origin === "shard" && !shardById.current.has(source.id)) ||
        (origin === "remnant" && !remnantById.current.has(source.id))
      ) {
        return false;
      }

      const body = pieceBodies.current.get(source.id);
      const pieceState =
        origin === "piece" ? breakablePieceById.get(source.id) : undefined;
      const shardState =
        origin === "shard" ? shardById.current.get(source.id) : undefined;
      const remnantState =
        origin === "remnant" ? remnantById.current.get(source.id) : undefined;
      if (
        !body &&
        ((!pieceState && !shardState && !remnantState) ||
          (origin === "piece" &&
            !brokenPiecesRef.current.has(source.id) &&
            !pieceState?.hinge) ||
          (origin === "remnant" &&
            !remnantState?.detached &&
            !brokenPiecesRef.current.has(remnantState?.parentId ?? "")))
      ) {
        return false;
      }

      const translation = body?.translation();
      const rotation = body?.rotation();
      const linearVelocity = body?.linvel();
      const angularVelocity = body?.angvel();
      const fallbackPosition =
        pieceState?.position ?? shardState?.position ?? remnantState?.position;
      const fallbackQuaternion =
        shardState?.quaternion ?? remnantState?.quaternion;
      const bodyPosition = translation
        ? new Vector3(translation.x, translation.y, translation.z)
        : new Vector3(...fallbackPosition!);
      const bodyQuaternion = rotation
        ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        : fallbackQuaternion
          ? new Quaternion(...fallbackQuaternion)
          : new Quaternion().setFromEuler(
              new Euler(
                pieceState?.rotation?.[0] ?? 0,
                pieceState?.rotation?.[1] ?? 0,
                pieceState?.rotation?.[2] ?? 0,
              ),
            );
      const inheritedLinearVelocity = linearVelocity
        ? new Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z)
        : shardState
          ? new Vector3(...shardState.linearVelocity)
          : new Vector3();
      const inheritedAngularVelocity = angularVelocity
        ? new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
        : shardState
          ? new Vector3(...shardState.angularVelocity)
          : new Vector3();
      shardCounter.current += 1;
      const salt = `loose:${shardCounter.current}`;
      const result = damageBody(
        resolveDamageSource(source),
        {
          position: bodyPosition,
          quaternion: bodyQuaternion,
          linearVelocity: inheritedLinearVelocity,
          angularVelocity: inheritedAngularVelocity,
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

      const baseLinear = inheritedLinearVelocity;
      const generated: ShardDefinition[] = [...result.fragments];

      // a couple of chips fly out of the removed volume
      for (let index = 0; index < 2; index += 1) {
        shardCounter.current += 1;
        const id = `shard:lc${shardCounter.current}`;
        const noiseA = blastNoise(id, 13);
        const side = MathUtils.clamp(
          radius * (0.3 + noiseA * 0.25),
          0.045,
          0.11,
        );
        generated.push({
          id,
          material: source.material,
          color: source.color,
          renderColor: source.renderColor,
          textureProfile: source.textureProfile,
          weathering: source.weathering,
          landscapeSurface: source.landscapeSurface,
          treeVisual: source.treeVisual,
          treeVisualSourceId:
            source.treeVisualSourceId ??
            (source.treeVisual ? source.id : undefined),
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
          angularVelocity: [
            (noiseA - 0.5) * 12,
            noiseA * 8,
            (0.5 - noiseA) * 12,
          ],
        });
      }

      if (origin === "piece") {
        if (!brokenPiecesRef.current.has(source.id)) {
          const nextBroken = new Set(brokenPiecesRef.current);
          nextBroken.add(source.id);
          brokenPiecesRef.current = nextBroken;
          setBrokenPieces(nextBroken);
        }
        const next = new Set(shatteredPiecesRef.current);
        next.add(source.id);
        shatteredPiecesRef.current = next;
        setShatteredPieces(next);
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
    [
      breakablePieceById,
      commitRemnants,
      commitShards,
      indestructible,
      resolveDamageSource,
    ],
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
      if (indestructible) {
        return false;
      }
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
    [carveLooseTarget, indestructible],
  );

  // Carve a blocky hole out of a standing (fixed) piece or remnant, leaving
  // the rest of it in place — clean holes carved through walls and fences.
  // Валидация и снимок позы цели carve. Используется и синхронным carveAt,
  // и подготовкой запроса для воркера; в асинхронном пути вызывается ДВАЖДЫ
  // (при подготовке и при применении) — между кадрами цель могла сломаться
  // чужим оружием или чужим settle.
  const resolveCarveTarget = useCallback(
    (targetId: string) => {
      if (indestructible) {
        return null;
      }
      const remnant = remnantById.current.get(targetId);
      const piece = remnant ? undefined : breakablePieceById.get(targetId);
      const source = remnant ?? piece;
      if (!source) {
        return null;
      }
      if (
        remnant &&
        (remnant.detached || brokenPiecesRef.current.has(remnant.parentId))
      ) {
        return null;
      }
      if (
        piece &&
        (brokenPiecesRef.current.has(piece.id) ||
          carvedPiecesRef.current.has(piece.id) ||
          shatteredPiecesRef.current.has(piece.id))
      ) {
        return null;
      }

      const body = pieceBodies.current.get(targetId);
      if (body && body.bodyType() !== rapier.RigidBodyType.Fixed) {
        return null;
      }
      if (
        !body &&
        ((!piece && (!remnant || remnant.detached)) ||
          (piece && brokenPiecesRef.current.has(piece.id)))
      ) {
        return null;
      }

      const parentId = remnant ? remnant.parentId : targetId;
      const sourceRenderColor =
        remnant?.renderColor ??
        intactGroundRenderColors.get(parentId) ??
        source.color;
      const treeVisualSourceId =
        ("treeVisualSourceId" in source
          ? source.treeVisualSourceId
          : undefined) ?? (source.treeVisual ? source.id : undefined);
      const translation = body?.translation();
      const rotation = body?.rotation();
      const bodyPosition = translation
        ? new Vector3(translation.x, translation.y, translation.z)
        : new Vector3(...(remnant?.position ?? piece!.position));
      const bodyQuaternion = rotation
        ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        : remnant
          ? new Quaternion(...remnant.quaternion)
          : new Quaternion().setFromEuler(
              new Euler(
                piece!.rotation?.[0] ?? 0,
                piece!.rotation?.[1] ?? 0,
                piece!.rotation?.[2] ?? 0,
              ),
            );
      return {
        remnant,
        piece,
        source,
        parentId,
        isGroundTarget: groundMaterials.has(source.material),
        sourceRenderColor,
        treeVisualSourceId,
        bodyPosition,
        bodyQuaternion,
      };
    },
    [breakablePieceById, indestructible, intactGroundRenderColors, rapier],
  );

  // Запрос для воркера: тот же снимок цели, что у синхронного пути, но в
  // plain-данных. Соль отсчитывается здесь, чтобы шум разлома оставался
  // детерминированным независимо от того, кто исполнит ядро.
  const prepareBlastCarveRequest = useCallback(
    (
      targetId: string,
      worldPoint: Vector3,
      radius: number,
    ): CarveKernelRequest | null => {
      const target = resolveCarveTarget(targetId);
      if (!target) {
        return null;
      }
      remnantCounter.current += 1;
      carveRequestId.current += 1;
      return {
        requestId: carveRequestId.current,
        source: resolveDamageSource({
          ...target.source,
          renderColor: target.sourceRenderColor,
        }),
        position: [
          target.bodyPosition.x,
          target.bodyPosition.y,
          target.bodyPosition.z,
        ],
        quaternion: [
          target.bodyQuaternion.x,
          target.bodyQuaternion.y,
          target.bodyQuaternion.z,
          target.bodyQuaternion.w,
        ],
        idPrefix: `carve:${remnantCounter.current}`,
        worldPoint: [worldPoint.x, worldPoint.y, worldPoint.z],
        radius,
      };
    },
    [resolveCarveTarget, resolveDamageSource],
  );

  const carveAt = useCallback(
    (
      targetId: string,
      worldPoint: Vector3,
      radius: number,
      pushDirection: Vector3 | null,
      physicalChipCount = 3,
      precomputed?: CarveKernelResponse,
    ): { carved: boolean; brokenParentId: string | null } => {
      const target = resolveCarveTarget(targetId);
      if (!target) {
        return { carved: false, brokenParentId: null };
      }
      const {
        remnant,
        piece,
        source,
        parentId,
        isGroundTarget,
        sourceRenderColor,
        treeVisualSourceId,
        bodyPosition,
        bodyQuaternion,
      } = target;
      let fragments: readonly ShardDefinition[] | null;
      let removedVolume: number;
      if (precomputed !== undefined) {
        fragments = precomputed.fragments;
        removedVolume = precomputed.removedVolume;
      } else {
        remnantCounter.current += 1;
        carveRequestId.current += 1;
        const response = executeCarveKernel({
          requestId: carveRequestId.current,
          source: resolveDamageSource({
            ...source,
            renderColor: sourceRenderColor,
          }),
          position: [bodyPosition.x, bodyPosition.y, bodyPosition.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          idPrefix: `carve:${remnantCounter.current}`,
          worldPoint: [worldPoint.x, worldPoint.y, worldPoint.z],
          radius,
          direction: pushDirection
            ? [pushDirection.x, pushDirection.y, pushDirection.z]
            : undefined,
          penetration: pushDirection
            ? Math.min(0.85, Math.hypot(...source.size))
            : undefined,
        });
        fragments = response.fragments;
        removedVolume = response.removedVolume;
      }
      if (fragments === null) {
        return { carved: false, brokenParentId: null };
      }
      const sourceVolume =
        remnant?.volume ??
        source.volume ??
        source.size[0] * source.size[1] * source.size[2];

      const additions = fragments.map((fragment): RemnantDefinition => {
        remnantCounter.current += 1;
        return {
          id: `remnant:${remnantCounter.current}`,
          parentId,
          material: source.material,
          color: source.color,
          renderColor: sourceRenderColor,
          textureProfile: source.textureProfile,
          weathering: source.weathering,
          landscapeSurface: source.landscapeSurface,
          treeVisual: source.treeVisual,
          treeVisualSourceId,
          shape: fragment.shape,
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
        (additions.length === 0 || removedVolume > sourceVolume * 0.38)
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
      const chipCount = Math.max(0, Math.min(3, Math.floor(physicalChipCount)));
      for (let index = 0; index < chipCount; index += 1) {
        shardCounter.current += 1;
        const id = `shard:c${shardCounter.current}`;
        const noiseA = blastNoise(id, 13);
        const noiseB = blastNoise(id, 17);
        const side = MathUtils.clamp(
          radius * (0.3 + noiseA * 0.3),
          0.045,
          0.13,
        );
        debris.push({
          id,
          material: source.material,
          color: source.color,
          renderColor: sourceRenderColor,
          textureProfile: source.textureProfile,
          weathering: source.weathering,
          landscapeSurface: source.landscapeSurface,
          treeVisual: source.treeVisual,
          treeVisualSourceId,
          size: [side, side * (0.8 + noiseB * 0.5), side],
          preferSoftCcd: true,
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
      if (debris.length > 0) {
        commitShards(debris);
      }

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
        : subtractParentVolume(parentId, removedVolume);
      return { carved: true, brokenParentId: crossed ? parentId : null };
    },
    [
      commitRemnants,
      commitShards,
      resolveCarveTarget,
      resolveDamageSource,
      subtractParentVolume,
    ],
  );

  // Original pieces and carved remnants are solved by the same load-path graph.
  // Rapier only receives the fragments that this structural pass releases.
  const settleWorld = useCallback(() => {
    settleStructure(brokenPiecesRef.current);
  }, [settleStructure]);

  // ---------------------------------------------------------------------
  // УДАР МАШИНЫ О МИР
  //
  // Мир видит машину обычным объектом, поэтому и урон идёт тем же входом,
  // которым бьют ракета и молоток. Разница ровно одна: сторон две, и вердикт
  // у каждой свой. Дом судится тем же законом материалов, каким судится
  // падающий обломок — он откалиброван в настоящих м/с. Машина не крошится:
  // у неё отказывает крепление, и кусок уходит из компаунда обломком.
  // ---------------------------------------------------------------------
  const worldContactIndex = useMemo(
    () =>
      createBreakablePieceIndex(
        breakablePieces.filter(
          (piece) => !vehicleFrameForCluster(piece.clusterId),
        ),
      ),
    [breakablePieces],
  );

  const worldContactPieceAt = useCallback(
    (point: readonly [number, number, number], reach: number) => {
      const piece = worldContactIndex.at(
        point,
        reach,
        (candidate: BreakablePieceDefinition) =>
          !brokenPiecesRef.current.has(candidate.id) &&
          !carvedPiecesRef.current.has(candidate.id),
      );
      if (!piece) {
        return null;
      }
      return {
        pieceId: piece.id,
        material: piece.material,
        volume:
          piece.volume ?? piece.size[0] * piece.size[1] * piece.size[2],
      };
    },
    [worldContactIndex],
  );

  const contactMaterialOf = useCallback(
    (material: string) => ({
      restitution:
        materialRuntimeProfiles[material as BreakableMaterial]?.restitution ??
        0.05,
      density:
        materialRuntimeProfiles[material as BreakableMaterial]?.density ?? 1,
    }),
    [],
  );

  const handleContactDamage = useCallback(
    (request: VehicleContactDamageRequest) => {
      if (indestructible) {
        return;
      }
      const point = new Vector3(...request.point);
      const direction = {
        x: request.direction[0],
        y: request.direction[1],
        z: request.direction[2],
      };
      let changed = false;

      // ОДИН ЗАКОН — ДВА ВЕРДИКТА. Обе стороны удара судятся законом
      // падающего обломка, каждая своим материалом и своей интенсивностью.
      // Собственной шкалы прочности нет ни у машины, ни у мира.

      // Сторона МИРА.
      const worldPiece = request.worldPieceId
        ? breakablePieceById.get(request.worldPieceId)
        : undefined;
      if (worldPiece && crumbleOnLanding.has(worldPiece.material)) {
        const verdict = classifyLandingDamage(
          worldPiece.material,
          request.closingSpeed,
          request.worldIntensity,
        );
        if (verdict === "shatter") {
          impactId.current += 1;
          if (!brokenPiecesRef.current.has(worldPiece.id)) {
            breakAt(worldPiece, impactId.current);
          }
          shatterTarget(
            worldPiece,
            "piece",
            point,
            request.closingSpeed,
            "fall",
          );
          changed = true;
        } else if (verdict === "chip") {
          chipAtImpact(worldPiece, "piece", direction, 1);
        }
      }

      // Сторона МАШИНЫ. Сталь и пластик в таблице обломков не значатся —
      // конструкция из них переживает контактный удар на любой скорости, и
      // это правильно: стальной набор не крошится о кирпич. Стекло лопается,
      // потому что оно стекло: кусок выходит из compound body (§5.2) и
      // рассыпается осколками в ТЕКУЩЕЙ позе — его кинематическое тело стоит
      // там, где машина, а не где она родилась.
      //
      // `breakAt` здесь по-прежнему запрещён: это примитив кладки, он колет
      // соседей в радиусе материала, и машина из шестисот плотно уложенных
      // деталей рассыпалась бы конструктором. «Скол» машине пока не
      // исполняется: carve с обрубками живёт в авторской позе статики и на
      // летящем компаунде лгал бы геометрией.
      const vehiclePiece = breakablePieceById.get(request.vehiclePieceId);
      if (
        vehiclePiece &&
        !brokenPiecesRef.current.has(vehiclePiece.id) &&
        crumbleOnLanding.has(vehiclePiece.material)
      ) {
        const verdict = classifyLandingDamage(
          vehiclePiece.material,
          request.closingSpeed,
          request.vehicleIntensity,
        );
        if (verdict === "shatter") {
          breakPieces([vehiclePiece.id]);
          shatterTarget(
            vehiclePiece,
            "piece",
            point,
            request.closingSpeed,
            "fall",
          );
          playImpactSound(vehiclePiece.material);
        }
      }

      if (changed) {
        settleWorld();
      }
    },
    [
      breakAt,
      breakPieces,
      breakablePieceById,
      chipAtImpact,
      indestructible,
      playImpactSound,
      settleWorld,
      shatterTarget,
    ],
  );

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
    const hit = intersections.find((intersection) => {
      if (intersection.distance > MG_RANGE) {
        return false;
      }
      const data = readBreakableHit(intersection);
      if (!data) {
        return false;
      }

      if (data.pieceId) {
        if (
          !breakablePieceById.has(data.pieceId) ||
          carvedPiecesRef.current.has(data.pieceId) ||
          shatteredPiecesRef.current.has(data.pieceId)
        ) {
          return false;
        }
        return true;
      }
      if (data.shardId) {
        return shardById.current.has(data.shardId);
      }
      if (data.remnantId) {
        return remnantById.current.has(data.remnantId);
      }
      return false;
    });
    const fieldRayEnd = camera.position
      .clone()
      .add(direction.clone().multiplyScalar(MG_RANGE));
    const fieldHit = forceFieldActive
      ? (basaltForceField.current?.intersectSegment(
          [camera.position.x, camera.position.y, camera.position.z],
          [fieldRayEnd.x, fieldRayEnd.y, fieldRayEnd.z],
        ) ?? null)
      : null;
    const fieldHitDistance = fieldHit
      ? Math.hypot(
          fieldHit.point[0] - camera.position.x,
          fieldHit.point[1] - camera.position.y,
          fieldHit.point[2] - camera.position.z,
        )
      : Number.POSITIVE_INFINITY;
    const fieldIntercepts =
      fieldHit !== null && (!hit || fieldHitDistance < hit.distance);

    const muzzle = new Vector3(0.36, -0.26, -0.8)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const end = fieldIntercepts
      ? new Vector3(...fieldHit.point)
      : hit
        ? hit.point
        : fieldRayEnd;
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

    if (fieldIntercepts) {
      basaltForceField.current?.hitCell(
        fieldHit.cellIndex,
        "machineGun",
        fieldHit.point,
      );
      return;
    }

    if (!hit) {
      return;
    }

    const hitData = readBreakableHit(hit);
    if (!hitData) {
      return;
    }
    const { pieceId, shardId, remnantId } = hitData;
    const piece = pieceId ? breakablePieceById.get(pieceId) : undefined;
    const shardDefinition = shardId
      ? shardById.current.get(shardId)
      : undefined;
    const remnantDefinition = remnantId
      ? remnantById.current.get(remnantId)
      : undefined;
    const material = piece?.material ?? hitData.material;
    const targetId = pieceId ?? shardId ?? remnantId;

    if (!targetId || !material) {
      return;
    }

    const point = hit.point.clone();
    const targetBroken = pieceId ? brokenPiecesRef.current.has(pieceId) : false;
    const body = pieceBodies.current.get(targetId);
    const bodyIsFixed = body?.bodyType() === rapier.RigidBodyType.Fixed;
    const semanticallyLoose = Boolean(
      shardDefinition ||
      (piece && (targetBroken || (piece.hinge && (!body || !bodyIsFixed)))) ||
      (remnantDefinition &&
        (remnantDefinition.detached ||
          brokenPiecesRef.current.has(remnantDefinition.parentId))),
    );
    const isImplicitFixedTarget =
      !body && Boolean(piece || remnantDefinition) && !semanticallyLoose;
    const isFixedTarget =
      !semanticallyLoose && (bodyIsFixed || isImplicitFixedTarget);
    const isLooseTarget = Boolean(semanticallyLoose || (body && !bodyIsFixed));
    const isDetachedTarget = Boolean(
      shardDefinition ||
      (piece && targetBroken) ||
      (remnantDefinition &&
        (remnantDefinition.detached ||
          brokenPiecesRef.current.has(remnantDefinition.parentId))) ||
      body?.bodyType() === rapier.RigidBodyType.Dynamic,
    );

    // An attached plate is part of one rigid carrier at the instant of impact.
    // Give the projectile's momentum to that carrier before any local fracture;
    // if the plate separates on this hit it will inherit the resulting point
    // velocity from VehicleFrameSystem exactly once.
    if (
      piece &&
      !targetBroken &&
      vehicleFrameForCluster(piece.clusterId) &&
      compoundKinematicClusters.current.has(piece.clusterId)
    ) {
      queueCompoundKinematicImpulse(
        compoundKinematicImpulses,
        piece.clusterId,
        {
          impulse: [
            direction.x * MG_PROJECTILE_IMPULSE,
            direction.y * MG_PROJECTILE_IMPULSE,
            direction.z * MG_PROJECTILE_IMPULSE,
          ],
          point: [point.x, point.y, point.z],
        },
      );
    }

    if (material === "steel") {
      // Bullets don't pierce steel. A fixed structural member stays fixed;
      // a loose one can still receive the physical kick.
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
      if (isDetachedTarget) {
        applyImpact(targetId, material, point, direction, 0.35);
      }
      return;
    }

    const holeRadius = bulletHoleRadius[material];
    if (
      holeRadius &&
      isFixedTarget &&
      (piece !== undefined || remnantDefinition !== undefined)
    ) {
      const carve = carveAt(targetId, point, holeRadius, direction);
      if (carve.carved) {
        const glassParentId =
          material === "glass"
            ? (pieceId ?? remnantDefinition?.parentId ?? null)
            : null;
        const brokenParentId = glassParentId ?? carve.brokenParentId;
        if (brokenParentId) {
          breakPieces([brokenParentId]);
        }
        settleWorld();
      }
      // A failed local carve is never upgraded to whole-body destruction.
      return;
    }

    // Metadata and live physics jointly cover the short mount/unmount gap:
    // a visible loose source remains damageable even before its body exists.
    if (!isLooseTarget) {
      return;
    }

    const looseRadius = bulletHoleRadius[material] ?? 0.2;
    let carvedLoose = false;
    if (piece) {
      carvedLoose = carveLooseTarget(
        piece,
        "piece",
        point,
        looseRadius,
        1.6,
        direction,
        Math.min(0.85, Math.hypot(...piece.size)),
      );
    } else if (shardDefinition) {
      carvedLoose = carveLooseTarget(
        shardDefinition,
        "shard",
        point,
        looseRadius,
        1.4,
        direction,
        Math.min(0.85, Math.hypot(...shardDefinition.size)),
      );
    } else if (remnantDefinition) {
      carvedLoose = carveLooseTarget(
        remnantDefinition,
        "remnant",
        point,
        looseRadius,
        1.4,
        direction,
        Math.min(0.85, Math.hypot(...remnantDefinition.size)),
      );
    }

    if (carvedLoose) {
      if (piece || remnantDefinition) {
        settleWorld();
      }
      return;
    }

    // A failed carve may still kick an already-loose body, but can no
    // longer detach or shatter a fixed one as a fallback side effect.
    applyImpact(targetId, material, point, direction, 0.4);
  }, [
    applyImpact,
    breakablePieceById,
    breakPieces,
    camera,
    carveAt,
    carveLooseTarget,
    forceFieldActive,
    intersectBreakables,
    rapier,
    settleWorld,
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
    if (fireAccumulator.current >= MG_FIRE_INTERVAL) {
      // Never replay several overdue bullets into one stale render snapshot.
      // A hitch may drop a round; it must not create duplicate generations.
      fireAccumulator.current %= MG_FIRE_INTERVAL;
      fireRound();
    }
  });

  // Воксельная резка взрыва уходит в Web Worker: главный поток готовит
  // запрос и применяет результат, само ядро (детерминированное и чистое)
  // считается вне кадра. Если воркеров нет или воркер умер — те же шаги
  // исполняются синхронным ядром, поведение идентично.
  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return undefined;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./carveWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      return undefined;
    }
    worker.onmessage = (event: MessageEvent<CarveKernelResponse>) => {
      const settle = carveJobs.current.get(event.data.requestId);
      if (!settle) {
        return;
      }
      carveJobs.current.delete(event.data.requestId);
      if (process.env.NODE_ENV !== "production") {
        const scope = window as unknown as Record<string, unknown>;
        scope.__mamCarveWorkerHits =
          (Number(scope.__mamCarveWorkerHits) || 0) + 1;
      }
      settle(event.data);
    };
    worker.onerror = () => {
      // Воркер умер: висящие запросы дорезаются синхронно, новые идут мимо.
      carveWorker.current = null;
      const pending = [...carveJobs.current.values()];
      carveJobs.current.clear();
      for (const settle of pending) {
        settle(null);
      }
      worker.terminate();
    };
    carveWorker.current = worker;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__mamCarveWorkerAlive =
        true;
    }
    return () => {
      carveWorker.current = null;
      carveJobs.current.clear();
      worker.terminate();
    };
  }, []);

  // №2 плана оптимизаций: carve — самая дорогая часть взрыва — исполняется
  // шагами из очереди с бюджетом времени на кадр. Анализ (позы, лучи
  // видимости, отбор целей) остаётся в кадре детонации, поэтому энергии и
  // окклюдеры соответствуют моменту взрыва; один settleStructure и push-фаза
  // закрывают взрыв, когда его очередь исчерпана. Малый взрыв, уложившийся в
  // бюджет, отрабатывает синхронно — как раньше.
  const drainBlastQueue = useCallback(() => {
    const queue = pendingBlasts.current;
    if (queue.length === 0) {
      return;
    }
    const deadline = performance.now() + BLAST_FRAME_BUDGET_MS;
    while (queue.length > 0) {
      const job = queue[0];
      while (job.cursor < job.steps.length) {
        const step = job.steps[job.cursor];
        job.cursor += 1;
        step();
        if (performance.now() >= deadline) {
          return;
        }
      }
      if (job.inFlight > 0) {
        // Ядро режет в воркере: финал (settle + волна) ждёт все ответы.
        return;
      }
      queue.shift();
      job.finish();
      if (performance.now() >= deadline) {
        return;
      }
    }
  }, []);

  useFrame(() => {
    drainBlastQueue();
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
      const fieldTransmissionTo = (target: Vector3): number =>
        forceFieldTransmission(blastCenter, [target.x, target.y, target.z]);
      const blastPieceCandidates = pieceSpatialIndex.querySphere(
        blastCenter,
        blastRadius + maxPieceBoundingRadius,
      );

      const resolveBlastPose = (id: string, source: BlastOccluderSource) => {
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
                  "rotation" in source ? (source.rotation?.[0] ?? 0) : 0,
                  "rotation" in source ? (source.rotation?.[1] ?? 0) : 0,
                  "rotation" in source ? (source.rotation?.[2] ?? 0) : 0,
                ),
              );
        return { position, quaternion };
      };
      const canBlastReachBounds = (
        position: Vector3,
        size: readonly [number, number, number],
      ) => {
        const reach = blastRadius + Math.hypot(...size) / 2;
        return center3.distanceToSquared(position) < reach * reach;
      };

      const solidOccluders: BlastOccluder[] = [
        ...blastPieceCandidates
          .filter(
            (piece) =>
              !previousBroken.has(piece.id) &&
              !carvedPiecesRef.current.has(piece.id) &&
              !shatteredPiecesRef.current.has(piece.id),
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
          if (!canBlastReachBounds(position, entry.source.size)) {
            return null;
          }
          const boxes = occupiedBoxesForBlast(
            resolveDamageSource(entry.source),
          );
          const impactPoint = closestPointOnOccupiedGeometry(
            center3,
            position,
            entry.source.size,
            quaternion,
            boxes,
          );
          return {
            id: entry.id,
            parentId: entry.parentId,
            material: entry.source.material,
            position,
            quaternion,
            size: entry.source.size,
            boxes,
            surfaceDistance: center3.distanceTo(impactPoint),
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            entry !== null && entry.surfaceDistance <= blastRadius,
        )
        .sort((left, right) => left.surfaceDistance - right.surfaceDistance);

      // Resolve one net pressure impulse for each intact compound carrier.
      // Its attached members are remembered so the same blast is not applied
      // again to a plate merely because fracture makes that plate dynamic a
      // few lines later.
      const attachedCompoundMemberIdsBeforeBlast = new Set<string>();
      for (const [clusterId, runtime] of compoundKinematicClusters.current) {
        let nearest: {
          readonly id: string;
          readonly centre: Vector3;
          readonly radius: number;
          readonly surfaceDistance: number;
        } | null = null;
        const carrierTranslation = runtime.body.translation();
        const carrierRotation = runtime.body.rotation();
        const carrierQuaternion = new Quaternion(
          carrierRotation.x,
          carrierRotation.y,
          carrierRotation.z,
          carrierRotation.w,
        );
        for (const memberId of runtime.attachedMemberIds) {
          if (previousBroken.has(memberId)) {
            continue;
          }
          attachedCompoundMemberIdsBeforeBlast.add(memberId);
          const member = breakablePieceById.get(memberId);
          if (!member) {
            continue;
          }
          const centre = new Vector3(
            member.position[0] - runtime.definition.origin[0],
            member.position[1] - runtime.definition.origin[1],
            member.position[2] - runtime.definition.origin[2],
          )
            .applyQuaternion(carrierQuaternion)
            .add(
              new Vector3(
                carrierTranslation.x,
                carrierTranslation.y,
                carrierTranslation.z,
              ),
            );
          const radius = Math.hypot(...member.size) / 2;
          const surfaceDistance = Math.max(
            0,
            center3.distanceTo(centre) - radius,
          );
          if (!nearest || surfaceDistance < nearest.surfaceDistance) {
            nearest = { id: memberId, centre, radius, surfaceDistance };
          }
        }
        if (!nearest || nearest.surfaceDistance > blastPushRadius) {
          continue;
        }
        const outward = nearest.centre.clone().sub(center3);
        if (outward.lengthSq() < 1e-8) {
          outward.set(
            carrierTranslation.x - center3.x,
            carrierTranslation.y - center3.y,
            carrierTranslation.z - center3.z,
          );
        }
        if (outward.lengthSq() < 1e-8) {
          outward.set(0, 1, 0);
        }
        outward.normalize();
        const impactPoint = center3
          .clone()
          .addScaledVector(outward, Math.max(0.05, nearest.surfaceDistance));
        const visibility =
          blastVisibilityFactor(
            center3,
            impactPoint,
            nearest.id,
            nearest.id,
            nearest.surfaceDistance,
            solidOccluders,
          ) * fieldTransmissionTo(impactPoint);
        if (visibility < 0.04) {
          continue;
        }
        const falloff = Math.max(
          0,
          1 - nearest.surfaceDistance / blastPushRadius,
        );
        // Pressure impulse is a property of this explosion and exposed area,
        // not of target mass. Mass only determines the resulting delta-v in
        // the carrier integrator.
        const magnitude = (isRocket ? 110 : 55) * falloff * visibility;
        queueCompoundKinematicImpulse(compoundKinematicImpulses, clusterId, {
          impulse: [
            outward.x * magnitude,
            outward.y * magnitude,
            outward.z * magnitude,
          ],
          point: [impactPoint.x, impactPoint.y, impactPoint.z],
        });
      }

      // Capture moving authored bodies by their CURRENT physics registry, not
      // by the spatial index built from authored positions. This includes
      // swinging kinematic doors and debris that travelled far from home.
      const looseAuthoredIds = new Set<string>();
      const looseAuthoredPieces: {
        readonly source: BreakablePieceDefinition;
        readonly origin: "piece";
      }[] = [];
      for (const [id, body] of pieceBodies.current) {
        if (
          (body.bodyType() === rapier.RigidBodyType.Fixed &&
            !previousBroken.has(id)) ||
          carvedPiecesRef.current.has(id) ||
          shatteredPiecesRef.current.has(id)
        ) {
          continue;
        }
        const source = breakablePieceById.get(id);
        if (!source) {
          continue;
        }
        looseAuthoredIds.add(id);
        looseAuthoredPieces.push({ source, origin: "piece" });
      }

      // A structural break can update refs one commit before its Rapier body
      // mounts. Keep that short generation gap damageable too.
      for (const source of blastPieceCandidates) {
        if (
          looseAuthoredIds.has(source.id) ||
          pieceBodies.current.has(source.id) ||
          (!previousBroken.has(source.id) && !source.hinge) ||
          carvedPiecesRef.current.has(source.id) ||
          shatteredPiecesRef.current.has(source.id)
        ) {
          continue;
        }
        looseAuthoredIds.add(source.id);
        looseAuthoredPieces.push({ source, origin: "piece" });
      }

      // Each body receives exactly one damage pass, regardless of whether it
      // started attached, falling or already settled on the ground.
      const looseBeforeBlast = [
        ...looseAuthoredPieces,
        ...shardsRef.current.map((source) => ({
          source,
          origin: "shard" as const,
        })),
        ...remnantsRef.current
          .filter((source) => {
            const body = pieceBodies.current.get(source.id);
            return (
              source.detached ||
              previousBroken.has(source.parentId) ||
              Boolean(body && body.bodyType() !== rapier.RigidBodyType.Fixed)
            );
          })
          .map((source) => ({
            source,
            origin: "remnant" as const,
          })),
      ];

      // One physical blast: distance reduces delivered energy, then the shared
      // material fracture profile converts that energy into removed voxels.
      // Standing targets keep supported remnants; unsupported remnants become
      // debris through the same structural solver used everywhere else.
      // В заповеднике carve всё равно запрещён, поэтому аналитическую
      // половину взрыва (позы целей, лучи видимости, сортировку) не считаем
      // вовсе — остаётся только физический толчок ниже.
      const volumeBroken: string[] = [];
      const sortedDamageCandidates = indestructible
        ? []
        : [
            ...blastPieceCandidates
              .filter((piece) => {
                const body = pieceBodies.current.get(piece.id);
                return (
                  !previousBroken.has(piece.id) &&
                  !carvedPiecesRef.current.has(piece.id) &&
                  !shatteredPiecesRef.current.has(piece.id) &&
                  (body
                    ? body.bodyType() === rapier.RigidBodyType.Fixed
                    : !piece.hinge)
                );
              })
              .map((piece) => ({
                targetId: piece.id,
                parentId: piece.id,
                source: piece,
              })),
            ...remnantsRef.current
              .filter((remnant) => {
                const body = pieceBodies.current.get(remnant.id);
                return (
                  !remnant.detached &&
                  !previousBroken.has(remnant.parentId) &&
                  (!body || body.bodyType() === rapier.RigidBodyType.Fixed)
                );
              })
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
              if (!canBlastReachBounds(position, target.source.size)) {
                return null;
              }
              const impactPoint = closestPointOnOccupiedGeometry(
                center3,
                position,
                target.source.size,
                quaternion,
                occupiedBoxesForBlast(resolveDamageSource(target.source)),
              );
              const surfaceDistance = center3.distanceTo(impactPoint);
              if (surfaceDistance >= blastRadius) {
                return null;
              }
              const visibility =
                blastVisibilityFactor(
                  center3,
                  impactPoint,
                  target.targetId,
                  target.parentId,
                  surfaceDistance,
                  solidOccluders,
                ) * fieldTransmissionTo(impactPoint);
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
              (entry): entry is NonNullable<typeof entry> =>
                entry !== null &&
                entry.energy >
                  fractureEnergyByMaterial[entry.source.material] * 1.15,
            )
            .sort(
              (left, right) => left.surfaceDistance - right.surfaceDistance,
            );
      // Адаптивный бюджет вместо плоского slice(0, 80): в норме отбор
      // идентичен старому, но воксельные гиганты (земляные плиты двора)
      // больше не съедают кадр и не вытесняют настоящие цели из бюджета —
      // у грунта свой маленький срез работы.
      const attachedDamageCandidates = selectCarveTargetsWithinBudget(
        sortedDamageCandidates,
        (entry) => entry.source,
        isRocket
          ? { maxTargets: 80, workBudget: 20_000, groundWorkBudget: 3_000 }
          : { maxTargets: 80, workBudget: 9_000, groundWorkBudget: 1_600 },
      );

      // One explosion already has a dense particle burst and real structural
      // fragments. Limit only the extra simulated surface chips so a blast
      // through many adjacent facade parts cannot create a physics storm.
      // Каждая цель — один шаг очереди; carveAt сам отбрасывает цели,
      // которые между кадрами успели сломаться или отделиться.
      const damagedNow = new Set<string>();
      const carveSteps: (() => void)[] = [];
      const blastJob: PendingBlastJob = {
        steps: carveSteps,
        cursor: 0,
        inFlight: 0,
        epoch: blastEpoch.current,
        finish: () => {},
      };
      const chipState = { budget: isRocket ? 24 : 12 };
      for (const entry of attachedDamageCandidates) {
        carveSteps.push(() => {
          const damageRadius = impactDamageRadius(
            resolveDamageSource(entry.source),
            "blast",
            entry.energy,
          );
          const physicalChipCount = Math.min(3, chipState.budget);
          const applyOutcome = (carve: {
            carved: boolean;
            brokenParentId: string | null;
          }) => {
            if (carve.carved) {
              chipState.budget -= physicalChipCount;
            }
            if (carve.brokenParentId) {
              volumeBroken.push(carve.brokenParentId);
            }
            if (carve.carved && entry.source.material === "glass") {
              volumeBroken.push(entry.parentId);
            }
          };
          const worker = carveWorker.current;
          const request = worker
            ? prepareBlastCarveRequest(
                entry.targetId,
                entry.impactPoint,
                damageRadius,
              )
            : null;
          if (!worker || !request) {
            // Нет воркера — синхронное ядро; нет запроса — цель уже
            // невалидна, carveAt дёшево откажет при повторной проверке.
            applyOutcome(
              carveAt(
                entry.targetId,
                entry.impactPoint,
                damageRadius,
                null,
                physicalChipCount,
              ),
            );
            return;
          }
          blastJob.inFlight += 1;
          carveJobs.current.set(request.requestId, (response) => {
            blastJob.inFlight -= 1;
            if (blastJob.epoch === blastEpoch.current) {
              // null — воркер умер: дорезаем синхронным ядром.
              applyOutcome(
                carveAt(
                  entry.targetId,
                  entry.impactPoint,
                  damageRadius,
                  null,
                  physicalChipCount,
                  response ?? undefined,
                ),
              );
            }
            drainBlastQueue();
          });
          worker.postMessage(request);
        });
      }

      const looseDamageCandidates = (indestructible ? [] : looseBeforeBlast)
        .map((entry) => {
          const { position, quaternion } = resolveBlastPose(
            entry.source.id,
            entry.source,
          );
          if (!canBlastReachBounds(position, entry.source.size)) {
            return null;
          }
          const impactPoint = closestPointOnOccupiedGeometry(
            center3,
            position,
            entry.source.size,
            quaternion,
            occupiedBoxesForBlast(resolveDamageSource(entry.source)),
          );
          const surfaceDistance = center3.distanceTo(impactPoint);
          if (surfaceDistance >= blastRadius) {
            return null;
          }
          const parentId =
            entry.origin === "remnant"
              ? entry.source.parentId
              : entry.source.id;
          const visibility =
            blastVisibilityFactor(
              center3,
              impactPoint,
              entry.source.id,
              parentId,
              surfaceDistance,
              solidOccluders,
            ) * fieldTransmissionTo(impactPoint);
          const energy = energyAtDistance(surfaceDistance) * visibility;
          return energy > fractureEnergyByMaterial[entry.source.material] * 0.95
            ? {
                ...entry,
                impactPoint,
                surfaceDistance,
                visibility,
                damageRadius: impactDamageRadius(
                  resolveDamageSource(entry.source),
                  "blast",
                  energy,
                ),
                burstSpeed: Math.max(isRocket ? 7 : 3.5, energy * 0.72),
              }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((left, right) => left.surfaceDistance - right.surfaceDistance)
        .slice(0, 32);

      for (const entry of looseDamageCandidates) {
        carveSteps.push(() => {
          // Между кадрами очереди цель могла исчезнуть чужими руками:
          // вытеснение осколка, чужой carve, повторный взрыв.
          if (
            (entry.origin === "shard" &&
              !shardById.current.has(entry.source.id)) ||
            (entry.origin === "remnant" &&
              !remnantById.current.has(entry.source.id)) ||
            shatteredPiecesRef.current.has(entry.source.id)
          ) {
            return;
          }
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
            if (
              entry.origin === "piece" &&
              !previousBroken.has(entry.source.id)
            ) {
              volumeBroken.push(entry.source.id);
            }
          }
        });
      }

      const looseShardIds = looseBeforeBlast
        .filter((entry) => entry.origin === "shard")
        .map((entry) => entry.source.id);

      const finishBlast = () => {
        if (!indestructible) {
          // Живое множество вместо снапшота кадра детонации: пока очередь
          // шла, другие системы могли и ломать, и восстанавливать куски.
          settleStructure(
            new Set([...brokenPiecesRef.current, ...volumeBroken]),
          );
        }
        const finalBroken = brokenPiecesRef.current;
        // Игрок уже получил волну в кадре детонации.
        const pushedIds = new Set<string>(["player"]);

        const pushBody = (id: string, body: RapierRigidBody) => {
          if (
            damagedNow.has(id) ||
            attachedCompoundMemberIdsBeforeBlast.has(id)
          ) {
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
          const targetPosition = new Vector3(
            translation.x,
            translation.y,
            translation.z,
          );
          const visibility =
            blastVisibilityFactor(
              center3,
              targetPosition,
              id,
              targetParentId,
              distance,
              solidOccluders,
            ) * fieldTransmissionTo(targetPosition);
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
                y: (dy * inverse + 0.8) * (isRocket ? 7.2 : 5.2) * falloff * mass,
                z: dz * inverse * (isRocket ? 9.4 : 6.4) * falloff * mass,
              },
              true,
            );
            return;
          }

          const isDynamic = body.bodyType() === rapier.RigidBodyType.Dynamic;
          const remnant = remnantById.current.get(id);
          const isLooseRemnant = Boolean(
            remnant && (remnant.detached || finalBroken.has(remnant.parentId)),
          );
          if (!isDynamic && !finalBroken.has(id) && !isLooseRemnant) {
            return;
          }

          ensureDynamic(id, body);
          configureDebrisCollision(id, body);
          body.wakeUp();

          const speed =
            (isRocket ? 7.8 : 5.2) + (isRocket ? 10.5 : 6.5) * falloff;
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
        if (
          !finalBroken.has(piece.id) ||
          damagedNow.has(piece.id) ||
          carvedPiecesRef.current.has(piece.id) ||
          shatteredPiecesRef.current.has(piece.id)
        ) {
          continue;
        }
        pushedIds.add(piece.id);
        withBody(piece.id, (body) => pushBody(piece.id, body));
      }

      // A visible pre-blast shard can exist one commit before its body mounts.
      // Queue exactly that old shard's impulse; newly generated blast debris
      // already carries burst velocity and must not receive a second kick.
      for (const shardId of looseShardIds) {
        if (
          damagedNow.has(shardId) ||
          pushedIds.has(shardId) ||
          !shardById.current.has(shardId)
        ) {
          continue;
        }
        pushedIds.add(shardId);
        withBody(shardId, (body) => pushBody(shardId, body));
      }

      for (const [id, body] of pieceBodies.current) {
        if (
          pushedIds.has(id) ||
          (breakablePieceById.has(id) &&
            (carvedPiecesRef.current.has(id) ||
              shatteredPiecesRef.current.has(id)))
        ) {
          continue;
        }
        pushedIds.add(id);
        pushBody(id, body);
      }

      for (const remnant of remnantsRef.current) {
        if (
          (!remnant.detached && !finalBroken.has(remnant.parentId)) ||
          pushedIds.has(remnant.id)
        ) {
          continue;
        }
        pushedIds.add(remnant.id);
        withBody(remnant.id, (body) => pushBody(remnant.id, body));
      }
      };

      // Игрок получает волну в кадре детонации: отложенный на несколько
      // кадров пинок читался бы как лаг оружия. Формулы — из push-фазы.
      withBody("player", (body) => {
        const translation = body.translation();
        const dx = translation.x - center3.x;
        const dy = translation.y - center3.y;
        const dz = translation.z - center3.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > blastPushRadius) {
          return;
        }
        const targetPosition = new Vector3(
          translation.x,
          translation.y,
          translation.z,
        );
        const visibility =
          blastVisibilityFactor(
            center3,
            targetPosition,
            "player",
            "player",
            distance,
            solidOccluders,
          ) * fieldTransmissionTo(targetPosition);
        if (visibility < 0.04) {
          return;
        }
        const falloff = (1 - distance / blastPushRadius) * visibility;
        const inverse = 1 / Math.max(0.25, distance);
        const mass = Math.max(0.04, body.mass());
        body.applyImpulse(
          {
            x: dx * inverse * (isRocket ? 9.4 : 6.4) * falloff * mass,
            y: (dy * inverse + 0.8) * (isRocket ? 7.2 : 5.2) * falloff * mass,
            z: dz * inverse * (isRocket ? 9.4 : 6.4) * falloff * mass,
          },
          true,
        );
      });

      blastJob.finish = finishBlast;
      pendingBlasts.current.push(blastJob);
      drainBlastQueue();
    },
    [
      breakablePieceById,
      carveAt,
      carveLooseTarget,
      configureDebrisCollision,
      drainBlastQueue,
      ensureDynamic,
      forceFieldTransmission,
      indestructible,
      maxPieceBoundingRadius,
      pieceSpatialIndex,
      rapier,
      resolveDamageSource,
      settleStructure,
      withBody,
    ],
  );

  // Dev-хук: детонация из консоли/CDP (пара к __mamTeleport/__mamLook).
  // Headless Chrome не даёт pointer lock, и физический выстрел из оружия
  // оттуда ненадёжен; детерминированная точка взрыва позволяет проверять
  // весь конвейер взрыва — очередь carve, settle, волну — одним вызовом.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as unknown as Record<string, unknown>;
    const detonate = (
      x: number,
      y: number,
      z: number,
      kind: ExplosiveKind = "rocket",
    ) => {
      explodeAt(new Vector3(x, y, z), kind);
    };
    scope.__mamExplode = detonate;
    return () => {
      if (scope.__mamExplode === detonate) {
        delete scope.__mamExplode;
      }
    };
  }, [explodeAt]);

  const handleGrenadeExplode = useCallback(
    (
      id: number,
      kind: ExplosiveKind,
      x: number,
      y: number,
      z: number,
      fieldCellIndex?: number,
    ) => {
      setGrenades((current) => current.filter((grenade) => grenade.id !== id));
      // The struck cell is still alive while this blast is resolved. It
      // absorbs even the third rocket completely, then disappears afterward.
      explodeAt(new Vector3(x, y, z), kind);
      if (fieldCellIndex !== undefined) {
        basaltForceField.current?.hitCell(
          fieldCellIndex,
          kind === "rocket" ? "rocket" : "grenade",
          [x, y, z],
        );
      }
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
        velocity: [direction.x * 23, direction.y * 23 + 1.4, direction.z * 23],
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
        velocity: [direction.x * 32, direction.y * 32 + 0.55, direction.z * 32],
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
      otherColliderHandle: number,
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
      const currentStep = physicsStep.current;
      let contactSteps = lastContactStepByBody.current.get(source.id);
      if (!contactSteps) {
        contactSteps = new Map<number, number>();
        lastContactStepByBody.current.set(source.id, contactSteps);
      }
      const isNewContact = isNewPhysicalContact(
        currentStep,
        contactSteps.get(otherColliderHandle),
      );
      contactSteps.set(otherColliderHandle, currentStep);
      if (contactSteps.size > 32) {
        for (const [handle, lastStep] of contactSteps) {
          if (currentStep - lastStep > 120) {
            contactSteps.delete(handle);
          }
        }
      }
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
      if (currentStep < (contactDamageAfterStep.current.get(source.id) ?? 0)) {
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
        impactShatterTimes.current.push(now);
        contactDamageAfterStep.current.set(
          source.id,
          currentStep + DEBRIS_RETRY_COOLDOWN_STEPS,
        );
        if (shatterTarget(source, origin, null, approachSpeed, "fall")) {
          settleWorld();
        }
        return;
      }

      // Hard (but survivable) landings chip the struck corner — minimally.
      chipTimes.current = chipTimes.current.filter((time) => now - time < 400);
      if (chipTimes.current.length >= 2) {
        return;
      }
      chipTimes.current.push(now);
      contactDamageAfterStep.current.set(
        source.id,
        currentStep + DEBRIS_RETRY_COOLDOWN_STEPS,
      );
      chipAtImpact(source, origin, forceDirection, intensity);
    },
    [chipAtImpact, settleWorld, shatterTarget],
  );

  const handleDebrisContact = useCallback(
    (
      piece: BreakablePieceDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
      otherColliderHandle: number,
    ) =>
      handleBodyContact(
        piece,
        "piece",
        magnitude,
        mass,
        forceDirection,
        otherColliderHandle,
      ),
    [handleBodyContact],
  );

  const handleShardContact = useCallback(
    (
      shard: ShardDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
      otherColliderHandle: number,
    ) =>
      handleBodyContact(
        shard,
        "shard",
        magnitude,
        mass,
        forceDirection,
        otherColliderHandle,
      ),
    [handleBodyContact],
  );

  const handleRemnantContact = useCallback(
    (
      remnant: RemnantDefinition,
      magnitude: number,
      mass: number,
      forceDirection: { x: number; y: number; z: number },
      otherColliderHandle: number,
    ) =>
      handleBodyContact(
        remnant,
        "remnant",
        magnitude,
        mass,
        forceDirection,
        otherColliderHandle,
      ),
    [handleBodyContact],
  );

  const strike = useCallback(() => {
    if (weapon === "none") {
      return;
    }
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
    const { pieceId: primaryPieceId, shardId, remnantId } = hitData;
    const piece = primaryPieceId
      ? breakablePieceById.get(primaryPieceId)
      : undefined;
    const material = piece?.material ?? hitData.material;
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
      // The 105 ms swing delay can outlive the geometry generation that was
      // raycast above. Never mutate a source that has already been replaced.
      if (
        (primaryPieceId &&
          (carvedPiecesRef.current.has(primaryPieceId) ||
            shatteredPiecesRef.current.has(primaryPieceId))) ||
        (shardId && !shardById.current.has(shardId)) ||
        (remnantId && !remnantById.current.has(remnantId))
      ) {
        return;
      }

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

      // Отцепленная деталь остаётся разрушаемой: молоток выгрызает из неё
      // куски тем же carveLooseTarget, что и пулемёт, — иначе после отрыва
      // деталь можно было лишь бесконечно пинать толчками.
      const loosePenetration = (size: readonly [number, number, number]) =>
        Math.min(0.85, Math.hypot(...size));

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
        if (
          !carveLooseTarget(
            piece,
            "piece",
            point,
            0.18,
            1.4,
            direction,
            loosePenetration(piece.size),
          )
        ) {
          applyImpact(piece.id, material, point, direction, 0.5);
        }
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
        if (
          !carveLooseTarget(
            piece,
            "piece",
            point,
            chipRadius,
            1.5,
            direction,
            loosePenetration(piece.size),
          )
        ) {
          applyImpact(piece.id, material, point, direction, 0.35);
        }
      } else if (piece) {
        if (!brokenPiecesRef.current.has(piece.id)) {
          breakAt(piece, currentImpact);
        }
        // A direct hammer hit crumbles the piece into real sub-pieces;
        // pieces that cannot split any further get a bite carved out, and
        // only if even that fails they are knocked away whole.
        if (!shatterTarget(piece, "piece", point, strikeSpeed)) {
          if (
            !carveLooseTarget(
              piece,
              "piece",
              point,
              0.24,
              1.6,
              direction,
              loosePenetration(piece.size),
            )
          ) {
            applyImpact(piece.id, material, point, direction);
          }
        }
      } else if (shardId) {
        const shardDefinition = shardById.current.get(shardId);
        if (
          !shardDefinition ||
          !shatterTarget(shardDefinition, "shard", point, strikeSpeed)
        ) {
          // Раскол отказал по двум разным причинам: крошку молоток
          // распыляет, а КРУПНЫЙ неделимый кусок грызёт по месту удара —
          // и лишь если и это не вышло, просто отбрасывает целым.
          const crumb =
            shardDefinition &&
            shardDefinition.size[0] *
              shardDefinition.size[1] *
              shardDefinition.size[2] <
              0.004;
          if (shardDefinition && crumb) {
            shardsRef.current = shardsRef.current.filter(
              (shard) => shard.id !== shardId,
            );
            shardById.current.delete(shardId);
            setShards(shardsRef.current);
          } else if (
            !shardDefinition ||
            !carveLooseTarget(
              shardDefinition,
              "shard",
              point,
              0.22,
              1.5,
              direction,
              loosePenetration(shardDefinition.size),
            )
          ) {
            applyImpact(shardId, material, point, direction);
          }
        }
      } else if (remnantId) {
        const remnantDefinition = remnantById.current.get(remnantId);
        const remnantBody = pieceBodies.current.get(remnantId);
        const remnantIsFixed = Boolean(
          remnantDefinition &&
          !remnantDefinition.detached &&
          !brokenPiecesRef.current.has(remnantDefinition.parentId) &&
          (!remnantBody ||
            remnantBody.bodyType() === rapier.RigidBodyType.Fixed),
        );
        if (remnantDefinition && remnantIsFixed) {
          if (groundMaterials.has(remnantDefinition.material)) {
            // Ground stays ground: repeated hammer blows keep digging the
            // crater deeper instead of finishing the parent tile and
            // popping a whole 6 m block out of the lawn.
            const dig = carveAt(remnantDefinition.id, point, 0.18, direction);
            if (dig.carved) {
              if (dig.brokenParentId) {
                breakPieces([dig.brokenParentId]);
              }
            }
            settleWorld();
            return;
          }

          if (
            remnantDefinition.material === "concrete" ||
            remnantDefinition.material === "stone"
          ) {
            const chipRadius =
              remnantDefinition.material === "concrete" ? 0.18 : 0.16;
            const chip = carveAt(
              remnantDefinition.id,
              point,
              chipRadius,
              direction,
            );
            if (chip.carved) {
              if (chip.brokenParentId) {
                breakPieces([chip.brokenParentId]);
              }
              settleWorld();
              return;
            }
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
            const remnantVolume =
              remnantDefinition.size[0] *
              remnantDefinition.size[1] *
              remnantDefinition.size[2];
            if (remnantVolume < 0.004) {
              commitRemnants(remnantDefinition.id, []);
            } else if (
              !carveLooseTarget(
                remnantDefinition,
                "remnant",
                point,
                0.2,
                1.4,
                direction,
                loosePenetration(remnantDefinition.size),
              )
            ) {
              applyImpact(remnantDefinition.id, material, point, direction);
            }
          }
        } else if (
          !remnantDefinition ||
          !carveLooseTarget(
            remnantDefinition,
            "remnant",
            point,
            0.2,
            1.4,
            direction,
            loosePenetration(remnantDefinition.size),
          )
        ) {
          applyImpact(remnantId, material, point, direction);
        }
      }

      settleWorld();
    }, 105);
    strikeTimers.current.push(contactTimer);
  }, [
    applyImpact,
    breakablePieceById,
    breakAt,
    breakPieces,
    camera,
    carveAt,
    carveLooseTarget,
    center,
    commitRemnants,
    fallbackLook,
    fireGrenade,
    fireRocket,
    fireRound,
    intersectBreakables,
    rapier,
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

  // Кластеры, которые прямо сейчас везёт кадр транспорта: по нему система
  // дверей понимает, что створка на борту больше не её забота.
  const movingVehicles = useRef<Set<string>>(new Set());
  // Принятые швартовом кадры ещё могут выбирать последние сантиметры, но
  // их бортовые механизмы уже должны снова отвечать игроку.
  const dockedVehicles = useRef<Set<string>>(new Set());
  // Общая событийная шина составных объектов. Свет — первый потребитель;
  // следующие системы могут читать те же состояния без знания типа машины.
  const clusterEventStates = useRef<Map<string, LampEventState>>(new Map());
  const astanaTrainClusters = useMemo(() => {
    const available = new Set(breakablePieces.map((piece) => piece.clusterId));
    return astanaTrainClusterDefinitions().filter((definition) =>
      available.has(definition.clusterId),
    );
  }, [breakablePieces]);
  /** Физические позы для систем, которые живут вне транспортного кадра. */
  const vehicleFramePoses = useRef<Map<string, VehicleFramePoseState>>(
    new Map(),
  );
  const publishVehicleFramePose = useCallback(
    (state: VehicleFramePoseState) => {
      vehicleFramePoses.current.set(state.clusterId, state);
    },
    [],
  );
  const compoundCarrierPosition = useCallback(
    (clusterId: string, authored: SceneVector3): SceneVector3 | null => {
      const runtime = compoundKinematicClusters.current.get(clusterId);
      if (!runtime) {
        return null;
      }
      const translation = runtime.body.translation();
      const rotation = runtime.body.rotation();
      const local = rotateVehicleVector(
        [rotation.x, rotation.y, rotation.z, rotation.w],
        [
          authored[0] - runtime.definition.origin[0],
          authored[1] - runtime.definition.origin[1],
          authored[2] - runtime.definition.origin[2],
        ],
      );
      return [
        translation.x + local[0],
        translation.y + local[1],
        translation.z + local[2],
      ];
    },
    [],
  );
  /**
   * The ram's screen is not attached to the hull, it is expressed in the
   * hull's own frame — so it reads the very pose the cluster publishes, the
   * same one the pieces and the onboard lamps are drawn with. No pose, no
   * screen: an unspawned carrier must not leave a membrane in the sky.
   */
  const skyRamShieldPose = useCallback((): BasaltForceFieldPose | null => {
    const frame = vehicleFramePoses.current.get(BASALT_SKY_RAM_CLUSTER_ID);
    if (!frame) {
      return null;
    }
    return {
      position: [
        frame.origin[0] + frame.pose.position[0],
        frame.origin[1] + frame.pose.position[1],
        frame.origin[2] + frame.pose.position[2],
      ],
      orientation: vehicleRotation(frame.pose, frame.nose),
    };
  }, []);
  const resolveLampPosition = useCallback(
    (lamp: LampDefinition) => {
      if (!lamp.carrierClusterId) {
        return lamp.position;
      }
      const frame = vehicleFramePoses.current.get(lamp.carrierClusterId);
      if (!frame) {
        return (
          compoundCarrierPosition(lamp.carrierClusterId, lamp.position) ??
          lamp.position
        );
      }
      return vehiclePiecePosition(
        frame.origin,
        lamp.position,
        frame.pose,
        vehicleRotation(frame.pose, frame.nose),
      );
    },
    [compoundCarrierPosition],
  );
  const resolveSpotLightPosition = useCallback(
    (light: SpotLightDefinition) => {
      if (!light.carrierClusterId) {
        return light.position;
      }
      const frame = vehicleFramePoses.current.get(light.carrierClusterId);
      if (!frame) {
        return (
          compoundCarrierPosition(light.carrierClusterId, light.position) ??
          light.position
        );
      }
      return vehiclePiecePosition(
        frame.origin,
        light.position,
        frame.pose,
        vehicleRotation(frame.pose, frame.nose),
      );
    },
    [compoundCarrierPosition],
  );
  const resolveSpotLightDirection = useCallback(
    (light: SpotLightDefinition) => {
      if (!light.carrierClusterId) {
        return light.direction;
      }
      const frame = vehicleFramePoses.current.get(light.carrierClusterId);
      if (!frame) {
        const runtime = compoundKinematicClusters.current.get(
          light.carrierClusterId,
        );
        if (!runtime) {
          return light.direction;
        }
        const rotation = runtime.body.rotation();
        return rotateVehicleVector(
          [rotation.x, rotation.y, rotation.z, rotation.w],
          light.direction,
        );
      }
      return rotateVehicleVector(
        vehicleRotation(frame.pose, frame.nose),
        light.direction,
      );
    },
    [],
  );
  const resolveLampEventState = useCallback(
    (sourceClusterId: string): LampEventState => {
      // VehicleFrameSystem publishes this once and derives the door's docked
      // set from the same value. Lights, boards and mechanisms therefore
      // cannot disagree about the hand-off frame.
      return clusterEventStates.current.get(sourceClusterId) ?? "inTransit";
    },
    [],
  );

  const hiddenPieces = useMemo(() => {
    const next = new Set(shatteredPieces);
    for (const id of carvedPieces) {
      next.add(id);
    }
    for (const id of discardedPieces) {
      next.add(id);
    }
    return next;
  }, [carvedPieces, discardedPieces, shatteredPieces]);
  const inactiveCompoundMembers = useMemo(() => {
    const inactive = new Set(hiddenPieces);
    for (const id of brokenPieces) {
      inactive.add(id);
    }
    return inactive;
  }, [brokenPieces, hiddenPieces]);

  useEffect(() => {
    const occupiedSeat = passengerSeatForId(occupiedSeatId);
    if (
      occupiedSeat &&
      !passengerSeatIsIntact(occupiedSeat, inactiveCompoundMembers)
    ) {
      onOccupiedSeatChange(null);
    }
  }, [inactiveCompoundMembers, occupiedSeatId, onOccupiedSeatChange]);

  // A light fixture counts as dead whether it broke loose, shattered or got
  // a hole carved through it.
  const deadLampPieces = useMemo(() => {
    const next = new Set(brokenPieces);
    for (const id of hiddenPieces) {
      next.add(id);
    }
    return next;
  }, [brokenPieces, hiddenPieces]);

  const rebuildVehicleCluster = useCallback(
    (clusterId: string) => {
      const memberIds = new Set(
        breakablePieces
          .filter((piece) => piece.clusterId === clusterId)
          .map((piece) => piece.id),
      );
      if (memberIds.size === 0) {
        return;
      }

      const restoredBroken = new Set(
        [...brokenPiecesRef.current].filter((id) => !memberIds.has(id)),
      );
      brokenPiecesRef.current = restoredBroken;
      setBrokenPieces(restoredBroken);

      const restoredShattered = new Set(
        [...shatteredPiecesRef.current].filter((id) => !memberIds.has(id)),
      );
      shatteredPiecesRef.current = restoredShattered;
      setShatteredPieces(restoredShattered);

      const restoredCarved = new Set(
        [...carvedPiecesRef.current].filter((id) => !memberIds.has(id)),
      );
      carvedPiecesRef.current = restoredCarved;
      setCarvedPieces(restoredCarved);

      const restoredDiscarded = new Set(
        [...discardedPiecesRef.current].filter((id) => !memberIds.has(id)),
      );
      discardedPiecesRef.current = restoredDiscarded;
      setDiscardedPieces(restoredDiscarded);

      const restoredRemnants = remnantsRef.current.filter(
        (remnant) => !memberIds.has(remnant.parentId),
      );
      remnantsRef.current = restoredRemnants;
      remnantById.current = new Map(
        restoredRemnants.map((remnant) => [remnant.id, remnant]),
      );
      setRemnants(restoredRemnants);

      for (const id of memberIds) {
        remainingVolumeRef.current.delete(id);
        forcedStructureSeeds.current.delete(id);
      }
      lastSettleSnapshot.current = null;
      onBrokenCountChange(restoredBroken.size);
    },
    [breakablePieces, onBrokenCountChange],
  );

  return (
    <>
      <DayNightCycle
        mode={timeOfDay}
        nightRef={nightRef}
        worldTimeRef={worldTimeRef}
        theme={scene.environment}
        worldRadius={scene.worldRadius}
        skyRadius={scene.skyRadius}
        fogDistances={scene.fogDistances}
        solarFrame={scene.solarFrame}
        worldCenter={scene.worldCenter}
        cameraFar={scene.cameraFar}
        snapVersion={timeOfDaySnapVersion}
        cinematic={cinematic}
      />
      <SceneMutableObjectSystem
        definitions={mutableObjectDefinitions}
        pieceById={breakablePieceById}
        worldTimeRef={worldTimeRef}
        resolveEventState={resolveLampEventState}
        states={mutablePieceStates}
      />
      <LampLightPool
        lamps={lampDefinitions}
        brokenPieces={deadLampPieces}
        nightRef={nightRef}
        occupiedCarrierClusterId={occupiedCarrierClusterId}
        resolveLampPosition={resolveLampPosition}
        resolveEventState={resolveLampEventState}
      />
      <LampBeaconField
        lamps={lampDefinitions}
        brokenPieces={deadLampPieces}
        nightRef={nightRef}
        occupiedCarrierClusterId={occupiedCarrierClusterId}
        resolveLampPosition={resolveLampPosition}
      />
      <SpotLightPool
        lights={spotLightDefinitions}
        brokenPieces={deadLampPieces}
        nightRef={nightRef}
        occupiedCarrierClusterId={occupiedCarrierClusterId}
        resolveLightPosition={resolveSpotLightPosition}
        resolveLightDirection={resolveSpotLightDirection}
        resolveEventState={resolveLampEventState}
      />
      <SceneEnvironment theme={scene.environment} />
      <WindController />
      <OpenWorldShell scene={scene} />
      <SceneDressing
        sceneId={scene.id}
        nightRef={nightRef}
        pieces={breakablePieces}
        brokenPieces={brokenPieces}
      />
      {forceFieldActive ? (
        <BasaltForceFieldSystem
          ref={basaltForceField}
          resetVersion={resetVersion}
          skyRamPose={skyRamShieldPose}
        />
      ) : null}
      {scene.worldRadius ? (
        <WorldEdge
          sceneId={scene.id}
          worldRadius={scene.worldRadius}
          center={scene.worldCenter}
          cameraFar={scene.cameraFar}
          nightRef={nightRef}
        />
      ) : null}
      {scene.id === "viking-village" && scene.worldRadius ? (
        <>
          <GrassField
            worldRadius={scene.worldRadius}
            center={scene.worldCenter}
            nightRef={nightRef}
            pieces={breakablePieces}
          />
          <SmokePlumes nightRef={nightRef} />
          <Villagers
            settlement={vikingSettlement}
            nightRef={nightRef}
            pieces={breakablePieces}
            brokenPieces={brokenPiecesRef}
            doorRequests={villagerDoorRequests}
            openDoors={villagerOpenDoors}
            stockStates={mutablePieceStates}
            inspectRef={villagerInspect}
            // Деревня выросла: жительниц и девочек ДОБАВИЛИ, а не заменили
            // ими часть мужчин.
            count={34}
          />
          <VillagerProbe lookup={villagerInspect} onChange={onVillagerInspect} />
          <Birds
            center={scene.worldCenter}
            worldRadius={scene.worldRadius}
            interest={airshipInterest}
            count={20}
          />
        </>
      ) : null}
      <group ref={breakableRaycastRoot}>
        <BreakableObjects
          pieces={breakablePieces}
          brokenPieces={brokenPieces}
          shatteredPieces={hiddenPieces}
          bodies={pieceBodies}
          kinematicClusters={compoundKinematicClusters}
          kinematicClusterDefinitions={astanaTrainClusters}
          mutablePieceIds={mutablePieceIds}
          mutablePieceStates={mutablePieceStates}
          registerBody={registerBody}
          onDebrisContact={handleDebrisContact}
        />
        <DebrisBodies
          shards={shards}
          remnants={remnants}
          brokenPieces={brokenPieces}
          registerBody={registerBody}
          onShardContact={handleShardContact}
          onRemnantContact={handleRemnantContact}
        />
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
          forceFieldRef={forceFieldActive ? basaltForceField : undefined}
        />
      ))}
      <VehicleFrameSystem
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        inactivePieces={inactiveCompoundMembers}
        resetVersion={resetVersion}
        departRequestVersion={entryOpenRequestVersion}
        departRequestTargetRef={entryOpenRequestTargetRef}
        initialArrivalFlightKind={initialArrivalFlightKind}
        initialArrivalPassengerTransit={initialArrivalPassengerTransit}
        onDepartureApproachChange={onDepartureApproachChange}
        onInterIslandBoundary={onInterIslandBoundary}
        onInterIslandArrivalReady={onInterIslandArrivalReady}
        onInterIslandArrivalComplete={onInterIslandArrivalComplete}
        onInterIslandPassengerStateChange={onInterIslandPassengerStateChange}
        onPassengerViewRestore={passengerViewMotion.snapTo}
        occupiedSeatId={occupiedSeatId}
        onOccupiedSeatChange={onOccupiedSeatChange}
        movingVehicles={movingVehicles}
        dockedVehicles={dockedVehicles}
        clusterEventStates={clusterEventStates}
        clusterRegistry={compoundKinematicClusters}
        externalImpulses={compoundKinematicImpulses}
        recoveryServiceArea={{
          center: scene.worldCenter,
          radius: scene.worldRadius ?? Math.hypot(...scene.worldHalfExtents),
          disappearY: worldDisappearY(scene.safetyFloorY),
        }}
        onVehicleRebuildRequest={rebuildVehicleCluster}
        onFramePose={publishVehicleFramePose}
        onMotionTelemetryUpdate={onMotionTelemetryUpdate}
        onRotorcraftPilotStatusChange={onRotorcraftPilotStatusChange}
        worldContactPieceAt={worldContactPieceAt}
        contactMaterialOf={contactMaterialOf}
        onContactDamage={handleContactDamage}
        onVehicleFailure={onVehicleFailure}
      />
      <AstanaTrainSystem
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        inactivePieces={inactiveCompoundMembers}
        resetVersion={resetVersion}
        movingVehicles={movingVehicles}
        dockedVehicles={dockedVehicles}
        clusterEventStates={clusterEventStates}
        clusterRegistry={compoundKinematicClusters}
      />
      <MotionInstrumentSystem
        definitions={motionInstrumentDefinitions}
        pieceById={breakablePieceById}
        store={motionTelemetryStore}
        brokenPieces={brokenPieces}
        clusterRegistry={compoundKinematicClusters}
        resolveEventState={resolveLampEventState}
      />
      <HingedDoorSystem
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        resetVersion={resetVersion}
        entryOpenRequestVersion={entryOpenRequestVersion}
        entryOpenRequestTargetRef={entryOpenRequestTargetRef}
        entryOpenRequests={villagerDoorRequests}
        openEntries={villagerOpenDoors}
        onEntryApproachChange={onEntryApproachChange}
        movingVehicles={movingVehicles}
        dockedVehicles={dockedVehicles}
        vehicleFramePoses={vehicleFramePoses}
      />
      {!cinematic ? (
        <>
          <Player
            registerBody={registerBody}
            mobileControls={mobileControls}
            passengerViewMotion={passengerViewMotion}
            spawn={scene.playerSpawn}
            flightMode={flightMode}
            entryInteractionActive={entryInteractionActive}
            interIslandArrivalActive={interIslandArrivalActive}
            interIslandBoundaryPassThrough={interIslandBoundaryPassThrough}
            occupiedSeatId={occupiedSeatId}
            vehicleFramePoses={vehicleFramePoses}
            forceFieldRef={forceFieldActive ? basaltForceField : undefined}
          />
          {weapon === "none" ? null : weapon === "hammer" ? (
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
            initialYaw={scene.playerSpawnYaw ?? 0}
            mobileControls={mobileControls}
            passengerViewMotion={passengerViewMotion}
            onActiveChange={onActiveChange}
            onFallbackChange={onFallbackChange}
            onPointerLockChange={onPointerLockChange}
            onStrike={strike}
            onStrikeEnd={strikeEnd}
          />
        </>
      ) : null}
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
    const pixelBudget = compact ? COMPACT_PIXEL_BUDGET : DESKTOP_PIXEL_BUDGET;
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

  // The composer issues many render calls per frame and each one resets
  // gl.info by default; accumulate manually so calls/tris cover the whole
  // frame instead of only the last full-screen pass.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const info = gl.info;
    info.autoReset = false;
    info.reset();
    return () => {
      info.autoReset = true;
    };
  }, [enabled, gl]);

  // Priority 2: runs after the composer has rendered this frame.
  useFrame((_, delta) => {
    if (!enabled) {
      elapsed.current = 0;
      frames.current = 0;
      return;
    }

    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current >= 0.5) {
      onSample({
        fps: Math.round(frames.current / elapsed.current),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      elapsed.current = 0;
      frames.current = 0;
    }
    gl.info.reset();
  }, 2);

  return null;
}

function MobileGameControls({
  active,
  flightMode,
  weapon,
  movementLocked,
  timeOfDay,
  controls,
  onStart,
  onStrike,
  onStrikeEnd,
  onWeaponChange,
  onTimeChange,
  onFlightChange,
  entryAction,
  entryActions,
  onEntryAction,
  onReset,
}: {
  active: boolean;
  flightMode: boolean;
  weapon: WeaponName;
  movementLocked: boolean;
  timeOfDay: TimeOfDay;
  controls: MobileControlsRef;
  onStart: () => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
  onWeaponChange: (weapon: WeaponName) => void;
  onTimeChange: () => void;
  onFlightChange: () => void;
  entryAction: HingedEntryApproach | null;
  entryActions: readonly EntryInteractionAction[];
  onEntryAction: (actionId?: string) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
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
    weapon === "none"
      ? "—"
      : weapon === "hammer"
        ? t("fire.strike")
        : weapon === "mg"
          ? t("fire.fire")
          : t("fire.launch");
  const timeLabel = t(timeOfDayKey(timeOfDay));

  return (
    <div
      className={`mobile-controls${active ? " is-active" : ""}`}
      aria-label={t("mobile.touchAria")}
    >
      <div
        className="mobile-look-zone"
        aria-hidden="true"
        onPointerDown={handleLookStart}
        onTouchStart={handleLookTouchStart}
        onPointerCancel={handleLookEnd}
        onPointerUp={handleLookEnd}
      />
      {!movementLocked ? (
        <div
          className="mobile-stick"
          aria-label={t("mobile.moveAria")}
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
      ) : null}
      <div
        className={`mobile-actions${flightMode ? " is-flight" : ""}`}
        aria-label={t("mobile.actionsAria")}
      >
        {!movementLocked ? (
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
        ) : null}
        {!flightMode && entryActions.length < 2 ? (
          <button
            type="button"
            className={entryAction ? "is-entry-action" : undefined}
            onPointerDown={(event) => {
              event.preventDefault();
              if (entryAction) {
                onEntryAction();
              } else {
                setJump(true);
              }
            }}
            onPointerCancel={() => !entryAction && setJump(false)}
            onPointerLeave={() => !entryAction && setJump(false)}
            onPointerUp={() => !entryAction && setJump(false)}
          >
            {entryAction
              ? t(entryActionKey(entryAction, true))
              : t("mobile.jump")}
          </button>
        ) : null}
      </div>
      {!movementLocked ? (
        <div className="mobile-weapon-bar" aria-label={t("mobile.weaponAria")}>
          {(
            [
              ["hammer", "1", t("weapon.hammer")],
              ["launcher", "2", t("weapon.launcher.short")],
              ["mg", "3", t("weapon.mg")],
              ["rocket", "4", t("weapon.rocket.short")],
            ] as const
          ).map(([nextWeapon, shortcut, label]) => (
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
      ) : null}
      <div className="mobile-utility-bar" aria-label={t("mobile.serviceAria")}>
        {!movementLocked ? (
          <button
            type="button"
            className={flightMode ? "is-active" : undefined}
            onClick={onFlightChange}
          >
            {flightMode ? t("controls.land") : t("mode.fly")}
          </button>
        ) : null}
        <button type="button" onClick={onTimeChange}>
          {timeLabel}
        </button>
        <button type="button" onClick={onReset}>
          {t("controls.reset")}
        </button>
      </div>
    </div>
  );
}

/** Remaining siege time as mm:ss — a countdown, not the world's solar clock. */
function siegeClockText(seconds: number): string {
  const left = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(left / 60)).padStart(2, "0")}`
    + `:${String(left % 60).padStart(2, "0")}`;
}

/**
 * Длительности перехода. Раскрытие должно совпадать с transition в
 * `.world-shutter.is-opening`, уход — с анимацией распада формы: и то и другое
 * ждёт кадр, а не наоборот.
 */
const SHUTTER_REVEAL_MS = 1_150;
const DEPARTURE_SHUTTER_MS = 2_000;

const vehicleFailureAnnouncementKeys = {
  structureLost: "announce.vehicleFailure.structureLost",
  invalidState: "announce.vehicleFailure.invalidState",
  unsafeAltitude: "announce.vehicleFailure.unsafeAltitude",
  criticalAttitude: "announce.vehicleFailure.criticalAttitude",
  routeDivergence: "announce.vehicleFailure.routeDivergence",
  controlMismatch: "announce.vehicleFailure.controlMismatch",
  stalled: "announce.vehicleFailure.stalled",
  goAroundLimit: "announce.vehicleFailure.goAroundLimit",
  correctionLimit: "announce.vehicleFailure.correctionLimit",
  trimExhausted: "announce.vehicleFailure.trimExhausted",
  dockingTimeout: "announce.vehicleFailure.dockingTimeout",
} as const satisfies Readonly<Record<VehicleFailureReason, TranslationKey>>;

const telemetryMetricLabels: Readonly<Record<string, TranslationKey>> = {
  groundSpeed: "telemetry.metric.groundSpeed",
  relativeAltitude: "telemetry.metric.relativeAltitude",
  verticalSpeed: "telemetry.metric.verticalSpeed",
  heading: "telemetry.metric.heading",
  pitch: "telemetry.metric.pitch",
  roll: "telemetry.metric.roll",
  propellerRevolutions: "telemetry.metric.propellerRevolutions",
  trimCar: "telemetry.metric.trimCar",
  routeProgress: "telemetry.metric.routeProgress",
  distanceRemaining: "telemetry.metric.distanceRemaining",
};

const telemetryPhaseLabels: Readonly<Record<string, TranslationKey>> = {
  attention: "telemetry.phase.attention",
  departure: "telemetry.phase.departure",
  cruise: "telemetry.phase.cruise",
  approach: "telemetry.phase.approach",
  inTransit: "telemetry.phase.inTransit",
  failed: "telemetry.phase.failed",
};

const telemetryModeLabels: Readonly<Record<string, TranslationKey>> = {
  intercepting: "telemetry.mode.intercepting",
  stabilizing: "telemetry.mode.stabilizing",
};

function telemetryValue(metric: MotionTelemetryMetric, locale: string): string {
  const { values, unit } = telemetryValueParts(metric, locale);
  return `${values.join(" / ")}${unit === "°" ? "" : " "}${unit}`;
}

function telemetryValueParts(
  metric: MotionTelemetryMetric,
  locale: string,
): { readonly values: readonly string[]; readonly unit: string } {
  const values =
    typeof metric.value === "number" ? [metric.value] : metric.value;
  const formatted = values.map((raw) => {
    const value = Math.abs(raw) < 1e-9 ? 0 : raw;
    if (metric.id === "heading") {
      return String(Math.round(value) % 360).padStart(3, "0");
    }
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: metric.precision ?? 0,
      maximumFractionDigits: metric.precision ?? 0,
      signDisplay: metric.signed ? "exceptZero" : "auto",
    }).format(value);
  });
  const unit =
    metric.unit === "deg" ? "°" : metric.unit === "percent" ? "%" : metric.unit;
  return { values: formatted, unit };
}

function MotionTelemetryPanel({
  store,
  timeOfDay,
  onUnavailable,
}: {
  store: MotionTelemetryStore;
  timeOfDay: TimeOfDay;
  onUnavailable: () => void;
}): ReactElement | null {
  const { language, t } = useLanguage();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    if (!snapshot) {
      onUnavailable();
    }
  }, [onUnavailable, snapshot]);
  const previousSnapshot = useRef<MotionTelemetrySnapshot | null>(null);
  const activityLastAt = useRef(new Map<string, number>());
  const [activityTokens, setActivityTokens] = useState<
    Readonly<Record<string, number>>
  >({});
  useEffect(() => {
    const previous = previousSnapshot.current;
    previousSnapshot.current = snapshot;
    if (!snapshot || !previous || previous.sourceId !== snapshot.sourceId) {
      activityLastAt.current.clear();
      setActivityTokens({});
      return;
    }
    const previousMetrics = new Map(
      previous.metrics.map((metric) => [metric.id, metric]),
    );
    const changed: string[] = [];
    for (const metric of snapshot.metrics) {
      motionTelemetryMetricActivity(
        previousMetrics.get(metric.id),
        metric,
      ).forEach((active, index) => {
        if (!active) {
          return;
        }
        const key = `${metric.id}:${index}`;
        const lastAt = activityLastAt.current.get(key) ?? -Infinity;
        if (snapshot.capturedAt - lastAt < 420) {
          return;
        }
        activityLastAt.current.set(key, snapshot.capturedAt);
        changed.push(key);
      });
    }
    if (changed.length > 0) {
      setActivityTokens((before) => {
        const next = { ...before };
        for (const key of changed) {
          next[key] = (next[key] ?? 0) + 1;
        }
        return next;
      });
    }
  }, [snapshot]);
  if (!snapshot) {
    return null;
  }
  const locale =
    language === "ru" ? "ru-RU" : language === "es" ? "es-ES" : "en-GB";
  const operationalState = snapshot.mode ?? snapshot.phase;
  const operationalStateKey = snapshot.mode
    ? telemetryModeLabels[snapshot.mode]
    : telemetryPhaseLabels[snapshot.phase];
  const pitchMetric = snapshot.metrics.find(
    (metric) => metric.id === "pitch" && typeof metric.value === "number",
  );
  const rollMetric = snapshot.metrics.find(
    (metric) => metric.id === "roll" && typeof metric.value === "number",
  );
  const attitude =
    pitchMetric && rollMetric
      ? {
          pitch: pitchMetric.value as number,
          roll: rollMetric.value as number,
          pitchMetric,
          rollMetric,
        }
      : null;
  const visibleMetrics = attitude
    ? snapshot.metrics.filter(
        (metric) => metric.id !== "pitch" && metric.id !== "roll",
      )
    : snapshot.metrics;
  const renderValue = (metric: MotionTelemetryMetric): ReactElement => {
    const parts = telemetryValueParts(metric, locale);
    const sideLabels = {
      left: t("telemetry.side.left"),
      right: t("telemetry.side.right"),
    } as const;
    return (
      <span
        className="motion-telemetry-value"
        aria-label={telemetryValue(metric, locale)}
      >
        {parts.values.map((value, index) => {
          const activityKey = `${metric.id}:${index}`;
          const token = activityTokens[activityKey] ?? 0;
          const side = metric.valueSides?.[index];
          const warning = metric.valueStates?.[index] === "warning";
          return (
            <span
              key={activityKey}
              className={`motion-telemetry-value-channel${warning ? " is-warning" : ""}`}
            >
              {index > 0 ? (
                <span className="motion-telemetry-value-separator"> / </span>
              ) : null}
              {side ? (
                <span className="motion-telemetry-value-side">
                  {sideLabels[side]}{" "}
                </span>
              ) : null}
              <span
                key={`${activityKey}:${token}`}
                className={`motion-telemetry-reading${token > 0 ? " is-changing" : ""}`}
              >
                {value}
              </span>
            </span>
          );
        })}
        <span className="motion-telemetry-value-unit">
          {parts.unit === "°" ? parts.unit : ` ${parts.unit}`}
        </span>
      </span>
    );
  };
  return (
    <aside
      className={`motion-telemetry is-${timeOfDay}`}
      aria-label={t("telemetry.aria")}
      data-testid="motion-telemetry"
    >
      <header>
        <span className="motion-telemetry-signal" aria-hidden="true" />
        <div>
          <p>{t("telemetry.kicker")}</p>
          <h2>{snapshot.sourceLabel}</h2>
        </div>
        <strong>
          {operationalStateKey ? t(operationalStateKey) : operationalState}
        </strong>
      </header>
      {attitude ? (
        <div className="motion-telemetry-instruments">
          <section
            className="motion-telemetry-attitude"
            aria-label={t("telemetry.attitudeAria")}
          >
            <div
              className="motion-telemetry-attitude-dial"
              aria-hidden="true"
              style={
                {
                  "--attitude-pitch": `${Math.max(-36, Math.min(36, attitude.pitch)) * 0.48}px`,
                  "--attitude-roll": `${-Math.max(-60, Math.min(60, attitude.roll))}deg`,
                } as CSSProperties
              }
            >
              <span className="motion-telemetry-horizon" />
              <span className="motion-telemetry-crosshair" />
            </div>
            <dl className="motion-telemetry-attitude-values">
              <div>
                <dt>{t("telemetry.metric.pitch")}</dt>
                <dd>{renderValue(attitude.pitchMetric)}</dd>
              </div>
              <div>
                <dt>{t("telemetry.metric.roll")}</dt>
                <dd>{renderValue(attitude.rollMetric)}</dd>
              </div>
            </dl>
          </section>
          <MotionImpactIndicator
            impact={snapshot.impact}
            locale={locale}
            ariaLabel={t("telemetry.impactAria")}
            kickLabel={t("telemetry.impactKick")}
            rotationLabel={t("telemetry.impactRotation")}
          />
        </div>
      ) : null}
      <dl>
        {visibleMetrics.map((metric) => (
          <div key={metric.id}>
            <dt>
              {telemetryMetricLabels[metric.id]
                ? t(telemetryMetricLabels[metric.id])
                : metric.id}
            </dt>
            <dd>{renderValue(metric)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

interface FrameCaptionValue {
  readonly id: number;
  readonly priority: CaptionPriority;
  readonly kicker: string;
  readonly title: string;
}

/**
 * Единственный слот нижней подписи.
 *
 * Раньше здесь стояли два независимых элемента почти в одних координатах:
 * титр смены режима и статус прилёта. Они честно накладывались друг на друга —
 * «Пустые руки. Просто смотри» поверх «Входим в воздушное пространство…».
 * Теперь координаты принадлежат слоту, а право говорить решает приоритет:
 * подпись перехода вытесняет всё, что игрок может вызвать сам.
 */
function useFrameCaption() {
  const [caption, setCaption] = useState<FrameCaptionValue | null>(null);
  const nextId = useRef(0);

  const publishCaption = useCallback(
    (priority: CaptionPriority, kicker: string, title: string) => {
      nextId.current += 1;
      const id = nextId.current;
      setCaption((current) =>
        captionAccepts(current?.priority ?? null, priority)
          ? { id, priority, kicker, title }
          : current,
      );
    },
    [],
  );

  const withdrawCaption = useCallback((priority: CaptionPriority) => {
    setCaption((current) => (current?.priority === priority ? null : current));
  }, []);

  useEffect(() => {
    // Титр события уходит сам. Подпись перехода живёт своей причиной, а не
    // таймером: снимет её тот, кто поставил, когда причина кончится.
    if (!caption || caption.priority === "transit") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setCaption((current) => (current?.id === caption.id ? null : current));
    }, 2_600);
    return () => window.clearTimeout(timer);
  }, [caption]);

  return { caption, publishCaption, withdrawCaption } as const;
}

function FrameCaptionSlot({
  caption,
}: {
  caption: FrameCaptionValue | null;
}): ReactElement | null {
  if (!caption) {
    return null;
  }
  const held = caption.priority === "transit";
  const words = caption.title.split(" ");
  return (
    // key по id: одинаковый титр подряд обязан проиграться заново.
    <p
      className={`frame-caption is-${held ? "transit" : "player"}`}
      key={caption.id}
      role="status"
      aria-live="polite"
    >
      <span className="frame-caption-kicker">{caption.kicker}</span>
      <span className="frame-caption-title">
        {held
          ? caption.title
          : words.map((word, index) => (
              <span
                key={`${word}:${index}`}
                style={{ "--word-index": index } as CSSProperties}
              >
                {word}
                {index < words.length - 1 ? " " : ""}
              </span>
            ))}
      </span>
    </p>
  );
}

/**
 * Титр показывается на СМЕНУ значения, чип живёт ОТ значения — правило то же,
 * что и было. Добавилось одно: титр говорит от лица игрока, поэтому смены,
 * которые за него сделал переход между стадиями кадра (вход в рейс отбирает
 * оружие, выход возвращает), титром не объявляются. Иначе кадр называет
 * игрока автором чужого действия — и ровно это раньше выбрасывало
 * «Пустые руки» поверх приветствия острова.
 */
function usePlayerModeCaption({
  stage,
  flightMode,
  weapon,
  timeOfDay,
  publishCaption,
}: {
  stage: WorldEntryStage;
  flightMode: boolean;
  weapon: WeaponName;
  timeOfDay: TimeOfDay;
  publishCaption: (
    priority: CaptionPriority,
    kicker: string,
    title: string,
  ) => void;
}) {
  const { t } = useLanguage();
  const previous = useRef<{
    stage: WorldEntryStage;
    flightMode: boolean;
    weapon: WeaponName;
    timeOfDay: TimeOfDay;
  } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { stage, flightMode, weapon, timeOfDay };
    // Первый кадр — это не смена режима, а его начальное состояние: молчим.
    if (!before || !announcesPlayerChoice(stage, before.stage)) {
      return;
    }
    let kicker = t("announce.kicker");
    let text: string | null = null;
    if (before.flightMode !== flightMode) {
      text = flightMode ? t("announce.flightOn") : t("announce.flightOff");
    } else if (before.weapon !== weapon) {
      text =
        weapon === "none"
          ? t("announce.weaponNone")
          : weapon === "hammer"
            ? t("announce.weaponHammer")
            : weapon === "launcher"
              ? t("announce.weaponLauncher")
              : weapon === "rocket"
                ? t("announce.weaponRocket")
                : t("announce.weaponMg");
    } else if (before.timeOfDay !== timeOfDay) {
      kicker = `${t(timeOfDayKey(timeOfDay))} · ${gameClockText(TIME_OF_DAY_TARGETS[timeOfDay])}`;
      text = t(timeOfDayAnnouncementKey(timeOfDay));
    }
    if (!text) {
      return;
    }
    publishCaption("player", kicker, text);
  }, [flightMode, publishCaption, stage, timeOfDay, weapon, t]);
}

/** Чип живёт от значения и принадлежит пешеходному интерфейсу. */
function ModeChips({
  flightMode,
  weapon,
}: {
  flightMode: boolean;
  weapon: WeaponName;
}): ReactElement | null {
  const { t } = useLanguage();
  const weaponChip =
    weapon === "none"
      ? null
      : weapon === "hammer"
        ? t("weapon.hammer")
        : weapon === "launcher"
          ? t("weapon.launcher")
          : weapon === "rocket"
            ? t("weapon.rocket")
            : t("weapon.mg");

  if (!flightMode && !weaponChip) {
    return null;
  }
  return (
    <div className="mode-chips" aria-hidden="true">
      {flightMode ? <span className="mode-chip">{t("chip.flight")}</span> : null}
      {weaponChip ? <span className="mode-chip">{weaponChip}</span> : null}
    </div>
  );
}

function RotorcraftPilotHud({
  status,
  timeOfDay,
}: {
  status: RotorcraftPilotStatus;
  timeOfDay: TimeOfDay;
}): ReactElement {
  const { t } = useLanguage();
  const modeKey = `rotorcraftPilot.mode.${status.mode}` as TranslationKey;
  const pitchDegrees = (status.pitch * 180) / Math.PI;
  const rollDegrees = (status.roll * 180) / Math.PI;
  const braking = Object.values(status.proximity).some(
    (reading) => reading.intervening,
  );
  const distance = (
    sector: keyof RotorcraftPilotStatus["proximity"],
  ): string => {
    const reading = status.proximity[sector];
    return status.sensorAssistEnabled && reading.distance !== null
      ? reading.distance.toFixed(1)
      : "—";
  };
  const measured = Object.entries(status.proximity)
    .filter((entry): entry is [
      keyof RotorcraftPilotStatus["proximity"],
      { readonly distance: number; readonly intervening: boolean },
    ] => entry[1].distance !== null)
    .sort((left, right) => left[1].distance - right[1].distance);
  const closest = measured[0] ?? null;
  const radarPositions: Readonly<
    Record<keyof RotorcraftPilotStatus["proximity"], readonly [number, number]>
  > = {
    fore: [36, 10],
    aft: [36, 62],
    port: [10, 36],
    starboard: [62, 36],
    above: [24, 18],
    below: [48, 54],
  };
  const closestPoint = closest ? radarPositions[closest[0]] : null;
  const pairedReading = (
    first: keyof RotorcraftPilotStatus["proximity"],
    second: keyof RotorcraftPilotStatus["proximity"],
  ): ReactElement => (
    <span>
      <span
        className={status.proximity[first].intervening ? "is-warning" : undefined}
      >
        {distance(first)}
      </span>
      <span className="motion-telemetry-value-separator"> / </span>
      <span
        className={status.proximity[second].intervening ? "is-warning" : undefined}
      >
        {distance(second)}
      </span>
      <span className="motion-telemetry-value-unit"> m</span>
    </span>
  );
  return (
    <aside
      className={`motion-telemetry rotorcraft-pilot-hud is-${timeOfDay}${
        braking ? " is-braking" : ""
      }`}
      aria-label={t("rotorcraftPilot.heading")}
    >
      <header>
        <span className="motion-telemetry-signal" aria-hidden="true" />
        <div>
          <p>{t("rotorcraftPilot.heading")}</p>
          <h2>HX-6</h2>
        </div>
        <strong>{t(modeKey)}</strong>
      </header>
      <div className="motion-telemetry-instruments">
        <section className="motion-telemetry-attitude">
          <div
            className="motion-telemetry-attitude-dial"
            aria-hidden="true"
            style={
              {
                "--attitude-pitch": `${Math.max(-36, Math.min(36, pitchDegrees)) * 0.48}px`,
                "--attitude-roll": `${-Math.max(-60, Math.min(60, rollDegrees))}deg`,
              } as CSSProperties
            }
          >
            <span className="motion-telemetry-horizon" />
            <span className="motion-telemetry-crosshair" />
          </div>
          <dl className="motion-telemetry-attitude-values">
            <div>
              <dt>{t("telemetry.metric.pitch")}</dt>
              <dd>{pitchDegrees.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>{t("telemetry.metric.roll")}</dt>
              <dd>{rollDegrees.toFixed(1)}°</dd>
            </div>
          </dl>
        </section>

        <section className="motion-telemetry-impact rotorcraft-proximity-instrument">
          <div className="motion-impact-sphere" aria-hidden="true">
            <svg viewBox="0 0 72 72">
              <circle className="motion-impact-sphere-boundary" cx="36" cy="36" r="31" />
              <ellipse className="motion-impact-ring is-far" cx="36" cy="36" rx="31" ry="12" />
              <ellipse className="motion-impact-ring is-near" cx="36" cy="36" rx="16" ry="31" />
              <path className="motion-impact-nose" d="M36 5l-2.5 4.5h5z" />
              <circle className="rotorcraft-proximity-craft-dot" cx="36" cy="36" r="2.2" />
              {status.sensorAssistEnabled && closestPoint ? (
                <circle
                  className={closest?.[1].intervening
                    ? "rotorcraft-proximity-contact is-warning"
                    : "rotorcraft-proximity-contact"}
                  cx={closestPoint[0]}
                  cy={closestPoint[1]}
                  r="3"
                />
              ) : null}
            </svg>
          </div>
          <dl className="motion-impact-values">
            <div>
              <dt>{t("rotorcraftPilot.proximityMinimum")}</dt>
              <dd>{status.sensorAssistEnabled && closest ? `${closest[1].distance.toFixed(1)} m` : "—"}</dd>
            </div>
            <div>
              <dt>{t("rotorcraftPilot.sensors")}</dt>
              <dd>{braking ? t("rotorcraftPilot.sensors.braking") : status.sensorAssistEnabled ? "ON" : "OFF"}</dd>
            </div>
          </dl>
        </section>
      </div>
      <dl className="rotorcraft-telemetry-values">
        <div>
          <dt>{t("rotorcraftPilot.groundSpeed")}</dt>
          <dd>{status.groundSpeed.toFixed(1)} m/s</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.currentAltitude")} / {t("rotorcraftPilot.targetAltitude")}</dt>
          <dd>{status.currentAltitude.toFixed(1)} / {status.targetAltitude.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.verticalSpeed")}</dt>
          <dd>{status.verticalSpeed.toFixed(1)} m/s</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.headingShort")}</dt>
          <dd>{Math.round(status.heading).toString().padStart(3, "0")}°</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.motors")}</dt>
          <dd className="rotorcraft-motor-values">
            {status.motorOutput.map((output, index) => (
              <span
                key={index}
                className={(status.motorAvailability[index] ?? 0) < 0.55 ? "is-warning" : undefined}
              >
                {index > 0 ? <span className="motion-telemetry-value-separator"> / </span> : null}
                {Math.round(output * 100)}
              </span>
            ))}
            <span className="motion-telemetry-value-unit"> %</span>
          </dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.sector.fore")} / {t("rotorcraftPilot.sector.aft")}</dt>
          <dd>{pairedReading("fore", "aft")}</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.sector.port")} / {t("rotorcraftPilot.sector.starboard")}</dt>
          <dd>{pairedReading("port", "starboard")}</dd>
        </div>
        <div>
          <dt>{t("rotorcraftPilot.sector.above")} / {t("rotorcraftPilot.sector.below")}</dt>
          <dd>{pairedReading("above", "below")}</dd>
        </div>
        {status.landingReady ? (
          <div className="rotorcraft-landing-ready" aria-live="polite">
            <dt>{t("rotorcraftPilot.sensors")}</dt>
            <dd>{t("rotorcraftPilot.landingReady")}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

interface InitialInterIslandArrival {
  readonly origin: IslandId;
  readonly destination: IslandId;
  readonly flightKind: string;
  readonly passengerTransit: InterIslandPassengerTransit | null;
}

function readInitialInterIslandArrival(
  sceneId: string,
  browserSnapshot: string,
): InitialInterIslandArrival | null {
  const separator = browserSnapshot.indexOf("\n");
  const href =
    separator >= 0 ? browserSnapshot.slice(0, separator) : browserSnapshot;
  const storedPassenger =
    separator >= 0 ? browserSnapshot.slice(separator + 1) || null : null;
  const destination = islandIdForScene(sceneId);
  if (!destination) {
    return null;
  }
  const request = interIslandArrivalRequest(
    destination,
    new URL(href).searchParams.get("arrivalFrom"),
  );
  if (!request || !shipTransmutationPlan(request.origin, destination)) {
    return null;
  }

  let passengerTransit: InterIslandPassengerTransit | null = null;
  try {
    const stored = parseInterIslandPassengerTransit(storedPassenger);
    passengerTransit =
      stored?.origin === request.origin && stored.destination === destination
        ? stored
        : null;
  } catch {
    // The carrier still arrives; only the optional relative pose is absent.
  }
  return {
    origin: request.origin,
    destination,
    flightKind: request.flightKind,
    passengerTransit,
  };
}

function subscribeInterIslandBootstrap(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function interIslandBootstrapSnapshot(): string {
  let passenger = "";
  try {
    passenger =
      window.sessionStorage.getItem(INTER_ISLAND_PASSENGER_STORAGE_KEY) ?? "";
  } catch {
    // Hardened browsers still support a default arrival pose.
  }
  return `${window.location.href}\n${passenger}`;
}

function serverInterIslandBootstrapSnapshot(): null {
  return null;
}

export function MakeAMessGame({
  scene: sceneProp = openHouseScene,
  flyover,
}: {
  scene?: DestructionSceneDefinition;
  flyover?: CinematicFlyoverDefinition;
}) {
  // Dev aid: `?spawn=x,y,z` drops the player anywhere on the map — handy
  // for inspecting far corners without a long walk.
  const scene = useMemo(() => {
    if (typeof window === "undefined") {
      return sceneProp;
    }
    const raw = new URLSearchParams(window.location.search).get("spawn");
    const parts = raw?.split(",").map(Number);
    if (parts?.length === 3 && parts.every(Number.isFinite)) {
      return {
        ...sceneProp,
        playerSpawn: [parts[0], parts[1], parts[2]] as const,
      };
    }
    return sceneProp;
  }, [sceneProp]);
  const { language, t } = useLanguage();
  // The HUD copy is localized; in-world signage stays in the scene files. Fall
  // back to the scene's own (Russian) copy if a scene has no translation yet.
  const copy = sceneCopy[scene.id]?.[language] ?? scene.copy;
  const mobileControls = useRef<MobileControlsState>(
    createMobileControlsState(),
  );
  const mobileActions = useRef<MobileActionBridge>({
    strike: () => {},
    strikeEnd: () => {},
  });
  const arrivalBootstrapSnapshot = useSyncExternalStore(
    subscribeInterIslandBootstrap,
    interIslandBootstrapSnapshot,
    serverInterIslandBootstrapSnapshot,
  );
  const [worldEntry, dispatchWorldEntry] = useReducer(
    reduceWorldEntry,
    undefined,
    initialWorldEntryState,
  );
  const stage = worldEntry.stage;
  const surfaces = frameSurfaces(stage);
  /**
   * Кадр «активен» либо потому, что игрок вошёл сам, либо потому, что его
   * поставили в мир: прилёт и рейс происходят без нажатия кнопки, и выводить
   * это из стадии честнее, чем выставлять флаг эффектом.
   */
  const framePlacesPlayer =
    stage === "sealed" || stage === "revealing" || stage === "transit";
  const resolvedInitialArrival = useMemo(
    () =>
      arrivalBootstrapSnapshot
        ? readInitialInterIslandArrival(sceneProp.id, arrivalBootstrapSnapshot)
        : null,
    [arrivalBootstrapSnapshot, sceneProp.id],
  );
  // Прилёт владеет позой игрока ровно до швартовки. Стадия — единственный
  // источник этого факта: раньше его хранили отдельным флагом, и он расходился
  // с тем, что показывал экран.
  const arrivalUnderway =
    worldEntry.scenario === "arriving" && transitLeg(stage) === "arrival";
  const initialArrival = arrivalUnderway ? resolvedInitialArrival : null;
  const arrivalBootstrapComplete = arrivalBootstrapSnapshot !== null;
  const initialArrivalFlightKind = initialArrival?.flightKind ?? null;
  const initialArrivalPassengerTransit =
    initialArrival?.passengerTransit ?? null;
  const [controlActive, setActive] = useState(false);
  const touchLikeDevice = useSyncExternalStore(
    subscribeStaticEnvironment,
    isTouchLikeDevice,
    () => false,
  );
  const [reportedFallbackLook, setFallbackLook] = useState<boolean | null>(
    null,
  );
  const fallbackLook = reportedFallbackLook ?? touchLikeDevice;
  const active = controlActive || framePlacesPlayer;
  const [brokenCount, setBrokenCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [weapon, setWeapon] = useState<WeaponName>("hammer");
  const [flightMode, setFlightMode] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [flyoverMode, setFlyoverMode] = useState<FlyoverMode>("idle");
  const [flyoverRunId, setFlyoverRunId] = useState(0);
  const [flyoverChapter, setFlyoverChapter] = useState<FlyoverChapter | null>(
    null,
  );
  const [flyoverProgress, setFlyoverProgress] = useState(0);
  const [flyoverStills, setFlyoverStills] = useState<
    readonly CapturedFlyoverStill[]
  >([]);
  const [flyoverVideoUrl, setFlyoverVideoUrl] = useState<string | null>(null);
  const [flyoverRecordingError, setFlyoverRecordingError] = useState(false);
  const {
    activeHint,
    hintLeaving,
    emitAction: emitGameAction,
    endAction: endGameAction,
    clearHints: clearGameActionHints,
  } = useGameActionHints();
  const [approachedEntry, setApproachedEntry] =
    useState<HingedEntryApproach | null>(null);
  // Кто сейчас под перекрестьем: имя, ремесло, намерение и действие.
  const [inspectedVillager, setInspectedVillager] =
    useState<VillagerReport | null>(null);
  const approachedEntryActions = useMemo(
    () => entryInteractionActions(approachedEntry),
    [approachedEntry],
  );
  const hasNumberedEntryActions = approachedEntryActions.length > 1;
  const [entryOpenRequestVersion, setEntryOpenRequestVersion] = useState(0);
  const entryOpenRequestTargetRef = useRef<HingedEntryApproach | null>(null);
  const [reportedInterIslandPassengerState, setInterIslandPassengerState] =
    useState({
      flightActive: false,
      passengerInsideCarrier: false,
    });
  const [
    interIslandPassengerReportReceived,
    setInterIslandPassengerReportReceived,
  ] = useState(false);
  const interIslandPassengerState =
    initialArrival && !interIslandPassengerReportReceived
      ? { flightActive: true, passengerInsideCarrier: true }
      : reportedInterIslandPassengerState;
  const journeyNavigationStarted = useRef(false);
  const { caption, publishCaption, withdrawCaption } = useFrameCaption();
  const [pointerLockHeld, setPointerLockHeld] = useState(false);
  /**
   * Жест, за который браузер даёт захват, уже сделан. Кадр начинает жизнь без
   * него: прилёт ставит игрока в мир, кнопку при этом никто не нажимал — вот
   * тогда и только тогда есть что просить. Жест засчитывается нажатием «войти»
   * и удавшимся захватом, а теряется вместе с указателем: конец пролёта и
   * отпущенный во время рейса указатель снова оставляют кадр без него.
   */
  const [pointerGestureGiven, setPointerGestureGiven] = useState(false);
  const handlePointerLockChange = useCallback((held: boolean) => {
    setPointerLockHeld(held);
    setPointerGestureGiven(held);
  }, []);
  const [occupiedSeatId, setOccupiedSeatId] = useState<string | null>(null);
  const [rotorcraftPilotStatus, setRotorcraftPilotStatus] =
    useState<RotorcraftPilotStatus | null>(null);
  const flyoverRecorder = useRef<MediaRecorder | null>(null);
  const flyoverChapterRef = useRef<FlyoverChapter | null>(null);
  const flyoverProgressRef = useRef(0);
  const flyoverStillUrls = useRef<string[]>([]);
  const flyoverVideoUrlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [dynamicBodyCount, setDynamicBodyCount] = useState(0);
  const [performance, setPerformance] = useState<PerformanceSnapshot>({
    fps: 0,
    calls: 0,
    triangles: 0,
  });
  const [telemetryStore] = useState(createMotionTelemetryStore);
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const flyoverRunning =
    flyoverMode === "playing" || flyoverMode === "recording";
  const cinematicActive = flyover !== undefined && flyoverMode !== "idle";

  useEffect(() => {
    dispatchWorldEntry({
      kind: cinematicActive ? "cinematicStarted" : "cinematicEnded",
    });
  }, [cinematicActive]);

  // A map rule, read from the scene: the first minutes are walked, not flown.
  const flightLockSeconds = scene.flightLockSeconds ?? 0;
  const [flightLockLifted, setFlightLockLifted] = useState(false);
  /**
   * The countdown stays out of sight until the player reaches for flight. A
   * rule nobody has run into yet is not news — announcing it on arrival would
   * only advertise a restriction most of the first five minutes never notice.
   */
  const [flightLockAsked, setFlightLockAsked] = useState(false);
  const [flightLockRemaining, setFlightLockRemaining] =
    useState(flightLockSeconds);
  const flightLockDeadline = useRef<number | null>(null);
  const flightLocked =
    flightLockSeconds > 0 && !flightLockLifted && flightLockRemaining > 0;

  useEffect(() => {
    if (flightLockSeconds <= 0 || flightLockLifted || !active) {
      return;
    }
    // A deadline fixed at the first entry rather than an accumulator: neither
    // a backgrounded tab nor stepping back to the menu buys extra siege time.
    const deadline = flightLockDeadline.current
      ?? (flightLockDeadline.current = Date.now() + flightLockSeconds * 1000);
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setFlightLockRemaining(left);
      return left;
    };
    tick();
    const timer = setInterval(() => {
      if (tick() <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [active, flightLockLifted, flightLockSeconds]);

  const announceTelemetry = useCallback(
    (textKey: TranslationKey) => {
      publishCaption("telemetry", t("announce.telemetryKicker"), t(textKey));
    },
    [publishCaption, t],
  );

  const handleMotionTelemetryUpdate = useCallback(
    (update: MotionTelemetryUpdate) => {
      telemetryStore.update(update);
    },
    [telemetryStore],
  );

  const handleVehicleFailure = useCallback(
    (event: VehicleFailureEvent) => {
      publishCaption(
        "telemetry",
        t("announce.vehicleFailureKicker"),
        t(vehicleFailureAnnouncementKeys[event.reason]),
      );
    },
    [publishCaption, t],
  );

  const requestWeaponChange = useCallback(
    (nextWeapon: WeaponName) => {
      if (
        interIslandWeaponSelectionBlocked(
          interIslandPassengerState.flightActive,
          nextWeapon,
        )
      ) {
        publishCaption(
          "telemetry",
          t("announce.interIslandRulesKicker"),
          t("announce.interIslandWeaponBlocked"),
        );
        return;
      }
      setWeapon(nextWeapon);
    },
    [interIslandPassengerState.flightActive, publishCaption, t],
  );

  const toggleMotionTelemetry = useCallback(() => {
    if (telemetryVisible) {
      setTelemetryVisible(false);
      announceTelemetry("announce.telemetryOff");
      return;
    }
    if (!telemetryStore.getSnapshot()) {
      announceTelemetry("announce.telemetryUnavailable");
      return;
    }
    setTelemetryVisible(true);
    announceTelemetry("announce.telemetryOn");
  }, [announceTelemetry, telemetryStore, telemetryVisible]);

  const handleTelemetryUnavailable = useCallback(() => {
    setTelemetryVisible(false);
    announceTelemetry("announce.telemetryAutoOff");
  }, [announceTelemetry]);

  const clearFlyoverOutput = useCallback(() => {
    flyoverStillUrls.current.forEach((url) => URL.revokeObjectURL(url));
    flyoverStillUrls.current = [];
    if (flyoverVideoUrlRef.current) {
      URL.revokeObjectURL(flyoverVideoUrlRef.current);
      flyoverVideoUrlRef.current = null;
    }
    setFlyoverStills([]);
    setFlyoverVideoUrl(null);
    setFlyoverRecordingError(false);
  }, []);

  const captureFlyoverStill = useCallback(
    (chapter: FlyoverChapter, canvas: HTMLCanvasElement) => {
      if (!flyover) {
        return;
      }
      void Promise.all([
        createFlyoverStoryFrame(canvas, flyover, chapter, true),
        createFlyoverStoryFrame(canvas, flyover, chapter, false),
      ]).then(([captionedBlob, cleanBlob]) => {
        if (!captionedBlob) {
          return;
        }
        const url = URL.createObjectURL(captionedBlob);
        const cleanUrl = cleanBlob ? URL.createObjectURL(cleanBlob) : undefined;
        flyoverStillUrls.current.push(url, ...(cleanUrl ? [cleanUrl] : []));
        setFlyoverStills((current) => {
          if (current.some((still) => still.id === chapter.id)) {
            URL.revokeObjectURL(url);
            if (cleanUrl) {
              URL.revokeObjectURL(cleanUrl);
            }
            return current;
          }
          return [
            ...current,
            {
              id: chapter.id,
              title: chapter.title,
              body: chapter.body,
              url,
              fileName: `${flyover.fileName}-${chapter.id}.png`,
              cleanUrl,
              cleanFileName: `${flyover.fileName}-${chapter.id}-clean.png`,
            },
          ];
        });
      });
    },
    [flyover],
  );

  const handleFlyoverChapterChange = useCallback(
    (chapter: FlyoverChapter | null) => {
      flyoverChapterRef.current = chapter;
      setFlyoverChapter(chapter);
    },
    [],
  );

  const handleFlyoverProgress = useCallback((progress: number) => {
    flyoverProgressRef.current = progress;
    setFlyoverProgress(progress);
  }, []);

  const finishFlyover = useCallback(() => {
    const recorder = flyoverRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    flyoverRecorder.current = null;
    setFlyoverChapter(null);
    flyoverChapterRef.current = null;
    flyoverProgressRef.current = 1;
    setFlyoverProgress(1);
    setFlyoverMode("finished");
  }, []);

  const startFlyover = useCallback(
    (record: boolean) => {
      if (!flyover) {
        return;
      }
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      if (flyoverRecorder.current?.state === "recording") {
        flyoverRecorder.current.stop();
      }
      clearFlyoverOutput();
      clearGameActionHints();
      setActive(true);
      setFallbackLook(false);
      setFlyoverChapter(null);
      setFlyoverProgress(0);
      flyoverChapterRef.current = null;
      flyoverProgressRef.current = 0;
      setTimeOfDay(flyover.keyframes[0]?.timeOfDay ?? "day");
      setFlyoverRunId((current) => current + 1);
      if (record) {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".game-canvas canvas, canvas",
        );
        flyoverRecorder.current = canvas
          ? startFlyoverRecording(
              canvas,
              () => ({
                definition: flyover,
                chapter: flyoverChapterRef.current,
                progress: flyoverProgressRef.current,
              }),
              (blob) => {
                const url = URL.createObjectURL(blob);
                if (flyoverVideoUrlRef.current) {
                  URL.revokeObjectURL(flyoverVideoUrlRef.current);
                }
                flyoverVideoUrlRef.current = url;
                setFlyoverVideoUrl(url);
              },
              () => setFlyoverRecordingError(true),
            )
          : null;
        if (!flyoverRecorder.current) {
          setFlyoverRecordingError(true);
        }
      }
      setFlyoverMode(record ? "recording" : "playing");
    },
    [clearFlyoverOutput, clearGameActionHints, flyover],
  );

  const openFlyoverGallery = useCallback(() => {
    if (!flyover) {
      return;
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (flyoverRecorder.current?.state === "recording") {
      flyoverRecorder.current.stop();
    }
    clearGameActionHints();
    setActive(true);
    setFallbackLook(false);
    setFlyoverChapter(null);
    setFlyoverProgress(1);
    flyoverChapterRef.current = null;
    flyoverProgressRef.current = 1;
    setFlyoverMode("gallery");
  }, [clearGameActionHints, flyover]);

  const exitFlyover = useCallback(() => {
    const recorder = flyoverRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    flyoverRecorder.current = null;
    setFlyoverMode("idle");
    setFlyoverChapter(null);
    setFlyoverProgress(0);
    flyoverChapterRef.current = null;
    flyoverProgressRef.current = 0;
    setActive(false);
    setTimeOfDay("day");
  }, []);

  useEffect(
    () => () => {
      if (flyoverRecorder.current?.state === "recording") {
        flyoverRecorder.current.stop();
      }
      flyoverStillUrls.current.forEach((url) => URL.revokeObjectURL(url));
      if (flyoverVideoUrlRef.current) {
        URL.revokeObjectURL(flyoverVideoUrlRef.current);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setBrokenCount(0);
    setFlightMode(false);
    setApproachedEntry(null);
    setOccupiedSeatId(null);
    setInterIslandPassengerState({
      flightActive: false,
      passengerInsideCarrier: false,
    });
    telemetryStore.clear();
    entryApproachActions.forEach(endGameAction);
    setResetVersion((version) => version + 1);
    mobileControls.current = createMobileControlsState();
  }, [endGameAction, telemetryStore]);

  const cycleTimeOfDay = useCallback(() => {
    setTimeOfDay(nextTimeOfDay);
  }, []);

  const toggleFlightMode = useCallback(() => {
    if (flightLocked && !flightMode) {
      // Refusing silently would read as a broken key, so the rule speaks — and
      // from here on the countdown is worth showing, because it was asked for.
      setFlightLockAsked(true);
      publishCaption(
        "telemetry",
        t("announce.flightLockedKicker"),
        t("announce.flightLocked"),
      );
      return;
    }
    mobileControls.current.jump = false;
    setFlightMode((current) => !current);
  }, [flightLocked, flightMode, publishCaption, t]);

  useEffect(() => {
    if (flightLockSeconds <= 0 || flightLockLifted) {
      return;
    }
    // Nothing about this is advertised: it is found by trying, the way it was
    // found the first time. Any typing surface keeps its keys to itself.
    const wanted = "IDDQD";
    let typed = "";
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target?.tagName ?? "")) {
        return;
      }
      // Physical keys, like every other binding here: the code must work on a
      // Russian layout too, where the letters are somewhere else entirely.
      const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
      if (!letter) return;
      typed = (typed + letter).slice(-wanted.length);
      if (typed !== wanted) return;
      typed = "";
      setFlightLockLifted(true);
      publishCaption(
        "telemetry",
        t("announce.flightLockedKicker"),
        t("announce.flightUnlocked"),
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flightLockLifted, flightLockSeconds, publishCaption, t]);

  // Подходов два источника — двери и транспорт, — а подсказка одна. Внутри
  // судна обзорный рейс первичен; во всех остальных спорах побеждает дверь.
  const approachSources = useRef<{
    door: HingedEntryApproach | null;
    departure: HingedEntryApproach | null;
  }>({ door: null, departure: null });

  const applyApproach = useCallback(
    (source: "door" | "departure", entry: HingedEntryApproach | null) => {
      approachSources.current[source] = entry;
      const next = preferredEntryInteraction(
        approachSources.current.door,
        approachSources.current.departure,
      );
      setApproachedEntry(next);
      mobileControls.current.jump = false;
      entryApproachActions.forEach(endGameAction);
      if (next && entryInteractionActions(next).length === 1) {
        emitGameAction(entryApproachAction(next));
      }
    },
    [emitGameAction, endGameAction],
  );

  const handleEntryApproachChange = useCallback(
    (entry: HingedEntryApproach | null) => applyApproach("door", entry),
    [applyApproach],
  );

  const handleDepartureApproachChange = useCallback(
    (approached: HingedEntryApproach | null) =>
      applyApproach("departure", approached),
    [applyApproach],
  );

  const handleOccupiedSeatChange = useCallback((seatId: string | null) => {
    mobileControls.current = createMobileControlsState();
    setOccupiedSeatId(seatId);
  }, []);

  const handleInterIslandPassengerStateChange = useCallback(
    (
      flightActive: boolean,
      passengerInsideCarrier: boolean,
      flightKind: string | null,
    ) => {
      setInterIslandPassengerReportReceived(true);
      setInterIslandPassengerState((current) =>
        current.flightActive === flightActive &&
        current.passengerInsideCarrier === passengerInsideCarrier
          ? current
          : { flightActive, passengerInsideCarrier },
      );
      // Перелёт начинается здесь — на причале, когда судно приняло рейс, — а
      // не на кромке карты. Прилётные рейсы сюда не попадают: у них другой
      // вид, и назначения на этом острове для них нет.
      const origin = flightActive ? islandIdForScene(scene.id) : null;
      const destination =
        origin && flightKind
          ? interIslandTransferDestination(origin, flightKind)
          : null;
      if (origin && destination) {
        dispatchWorldEntry({
          kind: "interIslandBoarded",
          origin,
          destination,
        });
      }
    },
    [scene.id],
  );

  const handleInterIslandBoundary = useCallback(
    (flightKind: string, passenger: InterIslandPassengerHandoff | null) => {
      const origin = islandIdForScene(scene.id);
      if (!origin || journeyNavigationStarted.current) {
        return;
      }
      const destination = interIslandTransferDestination(origin, flightKind);
      if (!destination || !shipTransmutationPlan(origin, destination)) {
        return;
      }
      // A ship may cross the chart boundary without smuggling a passenger who
      // already fell overboard into the destination scene.
      if (!passenger) {
        setInterIslandPassengerState({
          flightActive: false,
          passengerInsideCarrier: false,
        });
        return;
      }
      const transit: InterIslandPassengerTransit = {
        version: 1,
        origin,
        destination,
        ...passenger,
      };
      try {
        window.sessionStorage.setItem(
          INTER_ISLAND_PASSENGER_STORAGE_KEY,
          JSON.stringify(transit),
        );
      } catch {
        // Without a snapshot the next scene would silently change reference
        // frames, so leave this passenger in the source world.
        setInterIslandPassengerState({
          flightActive: false,
          passengerInsideCarrier: false,
        });
        return;
      }
      journeyNavigationStarted.current = true;
      dispatchWorldEntry({ kind: "departureRequested", origin, destination });
    },
    [scene.id],
  );

  // Уход — это событие, а не фон, поверх которого можно ещё успеть махнуть
  // молотом: ввод умирает вместе со стадией, а страница уходит по окончании
  // анимации, а не параллельно ей.
  useEffect(() => {
    if (stage !== "departing" || !worldEntry.origin || !worldEntry.destination) {
      return undefined;
    }
    const origin = worldEntry.origin;
    const destination = worldEntry.destination;
    const timer = window.setTimeout(() => {
      const url = new URL(
        ISLAND_CHART[destination].path,
        window.location.origin,
      );
      url.searchParams.set("arrivalFrom", origin);
      window.location.assign(url.toString());
    }, DEPARTURE_SHUTTER_MS);
    return () => window.clearTimeout(timer);
  }, [stage, worldEntry.destination, worldEntry.origin]);

  const handleInterIslandArrivalComplete = useCallback(() => {
    dispatchWorldEntry({ kind: "flightDocked" });
    setInterIslandPassengerState({
      flightActive: false,
      passengerInsideCarrier: false,
    });
    try {
      window.sessionStorage.removeItem(INTER_ISLAND_PASSENGER_STORAGE_KEY);
    } catch {
      // Storage may be unavailable in hardened browser contexts.
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("arrivalFrom");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const handleInterIslandArrivalReady = useCallback(
    (flightKind: string) => {
      if (flightKind !== initialArrivalFlightKind) {
        return;
      }
      dispatchWorldEntry({ kind: "carrierBoarded" });
    },
    [initialArrivalFlightKind],
  );

  // Сценарий входа читается ровно один раз, из того же снимка, что и сам
  // прилёт: иначе кадр и физика могут разойтись в том, что происходит.
  useEffect(() => {
    if (!arrivalBootstrapComplete) {
      return;
    }
    dispatchWorldEntry(
      resolvedInitialArrival
        ? {
            kind: "scenarioResolved",
            scenario: "arriving",
            origin: resolvedInitialArrival.origin,
            destination: resolvedInitialArrival.destination,
          }
        : { kind: "scenarioResolved", scenario: "standing" },
    );
  }, [arrivalBootstrapComplete, resolvedInitialArrival]);

  useEffect(() => {
    if (ready) {
      dispatchWorldEntry({ kind: "worldReady" });
    }
  }, [ready]);

  // Прилёт не спрашивает разрешения войти: игрок уже в мире, на борту судна.
  // Кнопки ворот здесь нет, поэтому звук готовит сама стадия.
  useEffect(() => {
    if (stage === "sealed") {
      prepareGameAudio();
    }
  }, [stage]);

  // Страховка от зависшей заслонки: носитель мог не собраться, и тогда
  // единственный честный выход — впустить игрока как всех, через ворота.
  useEffect(() => {
    if (stage !== "sealed") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      dispatchWorldEntry({ kind: "sealTimedOut" });
    }, WORLD_SEAL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Заслонка расходится прозрачностью, и её конец — конец перехода. Таймер
  // здесь дублирует transitionend: событие не придёт, если элемент сняли
  // раньше, а стадия обязана двинуться в любом случае.
  useEffect(() => {
    if (stage !== "revealing") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      dispatchWorldEntry({ kind: "shutterOpened" });
    }, SHUTTER_REVEAL_MS + 250);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Подпись перехода держится своей причиной: пока заслонка закрыта — именем
  // острова, на раскрытии — приветствием, на уходе — тем, куда уходим.
  const journeyIsland = worldEntry.destination;
  const shutterMessage = shutterCaptionMessage(stage);
  useEffect(() => {
    if (!shutterMessage || !journeyIsland) {
      withdrawCaption("transit");
      return;
    }
    publishCaption(
      "transit",
      t("interIsland.transitEyebrow"),
      t(interIslandJourneyCopyKey(journeyIsland, shutterMessage)),
    );
  }, [journeyIsland, publishCaption, shutterMessage, t, withdrawCaption]);


  const openApproachedEntry = useCallback(
    (actionId?: string) => {
      if (!approachedEntry) {
        return;
      }
      const actions = entryInteractionActions(approachedEntry);
      const selected = actionId
        ? (actions.find((action) => action.id === actionId) ?? null)
        : actions.length === 1
          ? actions[0]
          : null;
      if (!selected) {
        return;
      }
      mobileControls.current.jump = false;
      entryOpenRequestTargetRef.current =
        selected.id === "primary"
          ? approachedEntry
          : { ...approachedEntry, selectedActionId: selected.id };
      setEntryOpenRequestVersion((version) => version + 1);
      endGameAction(entryApproachAction(approachedEntry));
    },
    [approachedEntry, endGameAction],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const numberedAction = event.code.startsWith("Digit")
        ? numberedEntryInteractionAction(
            approachedEntry,
            Number(event.code.slice("Digit".length)),
          )
        : null;
      if (numberedAction && !event.repeat) {
        event.preventDefault();
        openApproachedEntry(numberedAction.id);
      } else if (
        event.code === "Space" &&
        approachedEntry &&
        !hasNumberedEntryActions &&
        !event.repeat
      ) {
        event.preventDefault();
        openApproachedEntry();
      } else if (event.code === "KeyR") {
        reset();
      } else if (event.code === "Digit0" && !occupiedSeatId && !event.repeat) {
        requestWeaponChange("none");
      } else if (
        event.code === "Digit1" &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        requestWeaponChange("hammer");
      } else if (
        event.code === "Digit2" &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        requestWeaponChange("launcher");
      } else if (
        event.code === "Digit3" &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        requestWeaponChange("mg");
      } else if (
        event.code === "Digit4" &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        requestWeaponChange("rocket");
      } else if (
        event.code === "KeyQ" &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        requestWeaponChange(nextWeaponName(weapon));
      } else if (event.code === "KeyN") {
        cycleTimeOfDay();
      } else if (event.code === "KeyF" && !event.repeat && !occupiedSeatId) {
        toggleFlightMode();
      } else if (event.code === "KeyT" && !event.repeat) {
        event.preventDefault();
        toggleMotionTelemetry();
      } else if (event.code === "KeyP") {
        setShowPerformance((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    approachedEntry,
    cycleTimeOfDay,
    hasNumberedEntryActions,
    interIslandPassengerState.flightActive,
    occupiedSeatId,
    openApproachedEntry,
    requestWeaponChange,
    reset,
    toggleFlightMode,
    toggleMotionTelemetry,
    weapon,
  ]);

  const progress =
    Math.round((brokenCount / scene.breakablePieces.length) * 1000) / 10;
  const passengerAccess = interIslandPassengerAccess(
    interIslandPassengerState.flightActive,
    interIslandPassengerState.passengerInsideCarrier,
  );
  const journeyPlan =
    worldEntry.origin && worldEntry.destination
      ? shipTransmutationPlan(worldEntry.origin, worldEntry.destination)
      : null;
  // Сущность корабля одна, форма зависит от плеча: на уходе на экране та форма,
  // что растворяется, на прилёте — та, что собирается.
  const shutterShipForm =
    surfaces.shutter === "departure"
      ? (journeyPlan?.sourceForm ??
        (worldEntry.origin ? shipFormForIsland(worldEntry.origin) : null))
      : surfaces.shutter === "arrival"
        ? (journeyPlan?.destinationForm ??
          (worldEntry.destination
            ? shipFormForIsland(worldEntry.destination)
            : null))
        : null;
  const equippedWeapon: WeaponName =
    occupiedSeatId || !passengerAccess.weaponEnabled ? "none" : weapon;
  const transitBanner = transitBannerMessage(stage, worldEntry.scenario);

  usePlayerModeCaption({
    stage,
    flightMode,
    weapon: equippedWeapon,
    timeOfDay,
    publishCaption,
  });

  /**
   * Отпустить указатель — это стадия, а не флаг. В обычной игре Escape даёт
   * паузу с карточкой; во время рейса карточки запуска быть не может — ты уже
   * в мире, — поэтому там стадия не меняется, а кадр просто просит управление
   * обратно. Раньше на этом месте был тупик: ворота не показывались, а клик по
   * канве отсекался проверкой `active`, и вернуть управление было нечем.
   */
  const handleActiveChange = useCallback((next: boolean) => {
    setActive(next);
    if (!next) {
      dispatchWorldEntry({ kind: "controlReleased" });
    }
  }, []);

  const startPlaying = useCallback(() => {
    prepareGameAudio();
    setActive(true);
    dispatchWorldEntry({ kind: "playerEntered" });
    // Жест сделан — просить его больше не за чем, даже если захват ещё летит.
    // Именно на этом месте раньше и вылезала просьба кликнуть: игрок нажимал
    // кнопку, кадр входил в мир, а строка успевала появиться в зазоре между
    // нажатием и ответом браузера.
    setPointerGestureGiven(true);
    const touchLike = isTouchLikeDevice();
    emitGameAction("player.spawned");
    if (touchLike) {
      return;
    }

    // Request pointer lock synchronously inside the click gesture — some
    // browsers reject requests coming later from a React effect.
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".game-canvas canvas, canvas",
    );
    // Отказ — это ответ, и его нельзя глотать: без него кадр не знает, что
    // смотреть придётся протяжкой, и остаётся обещать мышь, которой нет.
    try {
      const request = canvas?.requestPointerLock?.() as
        Promise<void> | undefined;
      if (request) {
        request.catch?.(() => setFallbackLook(true));
      } else if (!canvas?.requestPointerLock) {
        setFallbackLook(true);
      }
    } catch {
      setFallbackLook(true);
    }
  }, [emitGameAction]);

  return (
    <main className="play-page">
      <div className="game-canvas-wrap">
        {arrivalBootstrapComplete ? (
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
                // MSAA is bypassed by the always-on composer; SMAA in the post
                // chain resolves edges instead.
                antialias: false,
                powerPreference: "high-performance",
                preserveDrawingBuffer: Boolean(flyover),
              }}
              fallback={
                <div className="webgl-fallback">
                  Для Make a Mess нужен браузер с WebGL.
                </div>
              }
              onCreated={(state) => {
                state.gl.toneMapping = AgXToneMapping;
                state.gl.toneMappingExposure = 1.08;
                // Shadows are invalidated by the sun, doors and destruction.
                // Leaving autoUpdate enabled rendered the same atlas every frame
                // and made all of that throttling ineffective.
                state.gl.shadowMap.autoUpdate = false;
                state.gl.shadowMap.needsUpdate = true;
                setReady(true);
              }}
            >
              <Suspense fallback={null}>
                <Physics
                  gravity={[0, -PLAYER_GRAVITY, 0]}
                  timeStep={PHYSICS_TIME_STEP}
                  numSolverIterations={6}
                  maxCcdSubsteps={2}
                >
                  <OpenWorldScene
                    key={resetVersion}
                    onVillagerInspect={setInspectedVillager}
                    scene={scene}
                    active={active}
                    flightMode={flightMode}
                    weapon={equippedWeapon}
                    timeOfDay={timeOfDay}
                    timeOfDaySnapVersion={flyoverRunId}
                    fallbackLook={fallbackLook}
                    mobileControls={mobileControls}
                    mobileActions={mobileActions}
                    resetVersion={resetVersion}
                    entryOpenRequestVersion={entryOpenRequestVersion}
                    entryOpenRequestTargetRef={entryOpenRequestTargetRef}
                    initialArrivalFlightKind={initialArrivalFlightKind}
                    initialArrivalPassengerTransit={
                      initialArrivalPassengerTransit
                    }
                    interIslandArrivalActive={initialArrival !== null}
                    entryInteractionActive={approachedEntry !== null}
                    interIslandBoundaryPassThrough={
                      passengerAccess.ignoreWorldBoundary
                    }
                    cinematic={cinematicActive}
                    onActiveChange={handleActiveChange}
                    onFallbackChange={setFallbackLook}
                    onPointerLockChange={handlePointerLockChange}
                    onBrokenCountChange={setBrokenCount}
                    onDynamicBodyCountChange={setDynamicBodyCount}
                    onEntryApproachChange={handleEntryApproachChange}
                    onDepartureApproachChange={handleDepartureApproachChange}
                    onInterIslandBoundary={handleInterIslandBoundary}
                    onInterIslandArrivalReady={handleInterIslandArrivalReady}
                    onInterIslandArrivalComplete={
                      handleInterIslandArrivalComplete
                    }
                    onInterIslandPassengerStateChange={
                      handleInterIslandPassengerStateChange
                    }
                    occupiedSeatId={occupiedSeatId}
                    onOccupiedSeatChange={handleOccupiedSeatChange}
                    onMotionTelemetryUpdate={handleMotionTelemetryUpdate}
                    onRotorcraftPilotStatusChange={setRotorcraftPilotStatus}
                    motionTelemetryStore={telemetryStore}
                    onVehicleFailure={handleVehicleFailure}
                  />
                </Physics>
                {flyover ? (
                  <CinematicCameraRig
                    key={`${flyover.id}:${flyoverRunId}`}
                    definition={flyover}
                    runId={flyoverRunId}
                    running={flyoverRunning}
                    onChapterChange={handleFlyoverChapterChange}
                    onProgress={handleFlyoverProgress}
                    onTimeOfDayChange={setTimeOfDay}
                    onStill={captureFlyoverStill}
                    onComplete={finishFlyover}
                  />
                ) : null}
                <PerformanceProbe
                  enabled={showPerformance}
                  onSample={setPerformance}
                />
                <AdaptiveRenderScale compact={fallbackLook} />
                <CinematicPostProcessing compact={fallbackLook} />
              </Suspense>
            </Canvas>
          </KeyboardControls>
        ) : null}
      </div>

      {/* Слот один. Когда стоит заслонка, подпись живёт внутри неё — иначе
        aria-live объявил бы одну и ту же строку дважды, а вторая копия лежала
        бы под глухой поверхностью. */}
      {surfaces.shutter === "none" ? (
        <FrameCaptionSlot caption={caption} />
      ) : null}

      {surfaces.worldHud ? (
        <ModeChips flightMode={flightMode} weapon={equippedWeapon} />
      ) : null}

      {surfaces.worldHud && active && rotorcraftPilotStatus ? (
        <RotorcraftPilotHud
          status={rotorcraftPilotStatus}
          timeOfDay={timeOfDay}
        />
      ) : null}

      {surfaces.worldHud && active && flightLocked && flightLockAsked ? (
        <p className="flight-lock-note" aria-live="polite">
          <span className="flight-lock-label">{t("flightLock.label")}</span>
          <span className="flight-lock-clock">
            {siegeClockText(flightLockRemaining)}
          </span>
          <span className="flight-lock-copy">{t("flightLock.note")}</span>
        </p>
      ) : null}

      {!cinematicActive ? (
        <header className="play-topbar">
          <Link href="/" className="play-brand" aria-label={t("hud.homeAria")}>
            Handmade Games
          </Link>
          <div className="prototype-status">
            <span />
            {copy.status}
          </div>
          <div className="play-topbar-end">
            {flyover ? (
              <CinematicFlyoverGalleryShortcut
                count={
                  flyover.chapters.filter((item) => Boolean(item.stillImage))
                    .length
                }
                onOpen={openFlyoverGallery}
              />
            ) : null}
            <LanguageSwitcher className="language-switcher-play" />
            <Link href="/games" className="play-exit">
              {t("hud.allGames")}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </header>
      ) : null}

      {showPerformance && !cinematicActive ? (
        <aside
          className="game-performance"
          aria-label={t("hud.performanceAria")}
        >
          <span>{performance.fps} FPS</span>
          <span>{performance.calls} calls</span>
          <span>{performance.triangles.toLocaleString()} tris</span>
          <span>{dynamicBodyCount} bodies</span>
        </aside>
      ) : null}

      {telemetryVisible && surfaces.worldHud && (!active || !inspectedVillager) ? (
        <MotionTelemetryPanel
          store={telemetryStore}
          timeOfDay={timeOfDay}
          onUnavailable={handleTelemetryUnavailable}
        />
      ) : null}

      {active && surfaces.worldHud && inspectedVillager ? (
        <aside
          className={`motion-telemetry villager-card is-${timeOfDay}`}
          aria-live="off"
        >
          <div className="villager-card-avatar" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <circle cx="24" cy="10" r="5" />
              <path d="M24 16v15M15 23l9-7 9 7M18 42l6-11 6 11" />
            </svg>
          </div>
          <div className="villager-card-copy">
            <p>{t("villager.kicker")}</p>
            <b>
              {inspectedVillager.name
                ? `${inspectedVillager.name} ${inspectedVillager.patronymic}`.trim()
                : inspectedVillager.id}
            </b>
            <span>
              {t(
                (inspectedVillager.child
                  ? "villager.role.child"
                  : `villager.role.${inspectedVillager.role}`) as TranslationKey,
              )}
            </span>
            <em>{describeVillagerIntent(inspectedVillager, t)}</em>
            <em>
              {t(`villager.act.${inspectedVillager.action}` as TranslationKey)}
            </em>
          </div>
        </aside>
      ) : null}

      {surfaces.worldHud ? (
        <aside className="game-objective" aria-live="polite">
          <p>{copy.eyebrow}</p>
          <h1>{copy.heading}</h1>
          {/* В заповеднике счётчик разрушенного всегда ноль — вместо мёртвой
            шкалы её просто нет. */}
          {scene.indestructible ? null : (
            <>
              <div className="damage-meter">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="damage-copy">
                <span>
                  {brokenCount} {t("hud.parts")}
                </span>
                <span>
                  {progress}% {t("hud.mess")}
                </span>
              </div>
            </>
          )}
          <div className="damage-copy">
            <span>{t("hud.weapon")}</span>
            <span>
              {equippedWeapon === "none"
                ? "—"
                : equippedWeapon === "hammer"
                  ? t("weapon.hammer")
                  : equippedWeapon === "launcher"
                    ? t("weapon.launcher")
                    : equippedWeapon === "rocket"
                      ? t("weapon.rocket")
                      : t("weapon.mg")}
            </span>
          </div>
          <div className="damage-copy">
            <span>{t("hud.time")}</span>
            <span>{t(timeOfDayKey(timeOfDay))}</span>
          </div>
          <div className="damage-copy">
            <span>{t("hud.mode")}</span>
            <span>{flightMode ? t("mode.fly") : t("mode.walk")}</span>
          </div>
        </aside>
      ) : null}

      {/* В фоторежиме (пустые руки) прицел тоже прячется — кадр чистый. */}
      {surfaces.worldHud && equippedWeapon !== "none" ? (
        <div
          className={`crosshair${active ? " is-active" : ""}`}
          aria-hidden="true"
        >
          <i />
          <i />
        </div>
      ) : null}

      {active && surfaces.actionHints && activeHint ? (
        <aside
          className={`game-action-hint${activeHint.durationMs === undefined ? " is-persistent" : ""}${hintLeaving ? " is-leaving" : ""}`}
          role="status"
          aria-live="polite"
          style={
            activeHint.durationMs === undefined
              ? undefined
              : { animationDuration: `${activeHint.durationMs}ms` }
          }
        >
          <p>{t(activeHint.eyebrowKey)}</p>
          <h2>{t(activeHint.titleKey)}</h2>
          <div className="game-action-hint-detail">
            {!fallbackLook && activeHint.keyLabelKey ? (
              <kbd>{t(activeHint.keyLabelKey)}</kbd>
            ) : null}
            <span>
              {t(
                fallbackLook && activeHint.touchDetailKey
                  ? activeHint.touchDetailKey
                  : activeHint.detailKey,
              )}
            </span>
          </div>
        </aside>
      ) : null}

      {active &&
      surfaces.actionHints &&
      approachedEntry &&
      hasNumberedEntryActions ? (
        <aside
          className="game-action-hint game-entry-choice is-persistent"
          role="status"
          aria-live="polite"
        >
          <p>{t("hint.destination.eyebrow")}</p>
          <h2>{t("hint.destination.title")}</h2>
          <div className="game-entry-choice-options">
            {approachedEntryActions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                onClick={() => openApproachedEntry(action.id)}
              >
                <kbd>{index + 1}</kbd>
                <span>{t(action.labelKey as TranslationKey)}</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {surfaces.worldHud || surfaces.gateCard ? (
        <MobileGameControls
          active={active}
          flightMode={flightMode}
          weapon={equippedWeapon}
          movementLocked={occupiedSeatId !== null}
          timeOfDay={timeOfDay}
          controls={mobileControls}
          onStart={startPlaying}
          onStrike={() => mobileActions.current.strike()}
          onStrikeEnd={() => mobileActions.current.strikeEnd()}
          onWeaponChange={requestWeaponChange}
          onTimeChange={cycleTimeOfDay}
          onFlightChange={toggleFlightMode}
          entryAction={approachedEntry}
          entryActions={approachedEntryActions}
          onEntryAction={openApproachedEntry}
          onReset={reset}
        />
      ) : null}

      {surfaces.worldHud ? (
        <div className="controls-hint" aria-hidden="true">
          {!occupiedSeatId ? (
            <>
              <span>WASD</span>
              {t("controls.move")}
            </>
          ) : null}
          <span>{fallbackLook ? "Drag" : "Mouse"}</span>
          {t("controls.look")}
          {!occupiedSeatId ? (
            <>
              <span>Click</span>
              {equippedWeapon === "none"
                ? "—"
                : equippedWeapon === "hammer"
                  ? t("fire.strike")
                  : equippedWeapon === "launcher" || equippedWeapon === "rocket"
                    ? t("fire.shoot")
                    : t("fire.hold")}
              <span>0·1·2·3·4</span>
              {t("controls.weapon")}
            </>
          ) : null}
          <span>N</span>
          {t("controls.time")}
          {!occupiedSeatId ? (
            <>
              <span>F</span>
              {flightMode ? t("controls.land") : t("controls.fly")}
            </>
          ) : null}
          <span>T</span>
          {t("controls.telemetry")}
          {!flightMode ? (
            <>
              <span>
                {hasNumberedEntryActions
                  ? approachedEntryActions
                      .map((_, index) => index + 1)
                      .join("·")
                  : "Space"}
              </span>
              {hasNumberedEntryActions
                ? t("controls.chooseAction")
                : approachedEntry
                  ? t(entryActionKey(approachedEntry, false))
                  : t("controls.jump")}
            </>
          ) : null}
          <span>R</span>
          {t("controls.reset")}
        </div>
      ) : null}

      {/* Заслонка. Одна поверхность на все три случая: пока клиент не прочёл
        URL, пока строится мир назначения и пока уходит текущий. Цвет тот же,
        что у страницы, поэтому первый кадр стабилен ещё до того, как кадр
        узнал, какой сценарий входа перед ним. */}
      {surfaces.shutter !== "none" ? (
        <div
          className={`world-shutter is-${surfaces.shutter}${
            surfaces.shutterOpening ? " is-opening" : ""
          }`}
          data-ship-entity={journeyPlan?.entityId}
          data-form={shutterShipForm ?? undefined}
          onTransitionEnd={
            surfaces.shutterOpening
              ? () => dispatchWorldEntry({ kind: "shutterOpened" })
              : undefined
          }
        >
          {shutterShipForm ? (
            <div className="world-shutter-motif" aria-hidden="true">
              <span className="world-shutter-hull" />
              <span className="world-shutter-envelope" />
              <span className="world-shutter-drive is-left" />
              <span className="world-shutter-drive is-right" />
              <span className="world-shutter-heart" />
            </div>
          ) : null}
          <FrameCaptionSlot caption={caption} />
        </div>
      ) : null}

      {/* Рейс продолжается ещё около минуты после того, как заслонка ушла.
        Пока он идёт, кадр обязан отвечать на вопрос «почему я не иду пешком» —
        раньше на этом месте был обычный пешеходный интерфейс. */}
      {surfaces.transitBanner && journeyIsland && transitBanner ? (
        <p className="transit-banner" role="status" aria-live="polite">
          <span className="transit-banner-leg">
            {t(interIslandJourneyCopyKey(journeyIsland, transitBanner))}
          </span>
          <span className="transit-banner-note">{t("interIsland.aboard")}</span>
        </p>
      ) : null}

      {/* Захват указателя требует жеста, а прилёт жестом не является. Этот же
        запрос — единственный выход из отпущенного во время рейса указателя.
        Спрашивать разрешено только про долг: обычный спавн жест уже дал. */}
      {asksForPointerGesture(stage, {
        pointerLockHeld,
        gestureGiven: pointerGestureGiven,
        fallbackLook,
      }) ? (
        <p className="take-control">{t("hud.takeControl")}</p>
      ) : null}

      {surfaces.gateCard && (
        <section className="game-gate" aria-label={t("hud.launchAria")}>
          <div className="gate-card">
            {ready ? (
              <p>{copy.ready}</p>
            ) : (
              // Пока сцена собирается, ждать приходится по-настоящему — и здесь
              // шторка честная, в отличие от согласия с условиями, где задержки
              // нет вовсе. Оформлена как титры пролёта, чтобы ожидание было
              // частью фильма, а не системным сообщением.
              <div className="gate-loading">
                <p className="gate-loading-kicker">
                  {t("gate.loadingKicker")}
                </p>
                <p className="gate-loading-title">
                  {t("gate.loadingTitle")
                    .split(" ")
                    .map((word, index) => (
                      <span
                        key={`${word}:${index}`}
                        style={{ "--word-index": index } as CSSProperties}
                      >
                        {word}
                        {"\u00a0"}
                      </span>
                    ))}
                </p>
              </div>
            )}
            <h2>
              {brokenCount > 0
                ? t("gate.continueTitle")
                : (copy.startTitle ?? t("gate.startTitle"))}
            </h2>
            <p>{copy.description}</p>
            <button
              id="enter-game"
              className="enter-game"
              type="button"
              disabled={!ready}
              onClick={startPlaying}
            >
              {brokenCount > 0 ? copy.returnToGame : copy.enter}
              <span aria-hidden="true">↗</span>
            </button>
            {flyover ? (
              <CinematicFlyoverLauncher
                ready={ready}
                durationSeconds={flyover.durationSeconds}
                galleryCount={
                  flyover.chapters.filter((item) => Boolean(item.stillImage))
                    .length
                }
                onPlay={() => startFlyover(false)}
                onRecord={() => startFlyover(true)}
                onGallery={openFlyoverGallery}
              />
            ) : null}
            {brokenCount > 0 && (
              <button className="reset-game" type="button" onClick={reset}>
                {copy.reset}
              </button>
            )}
          </div>
        </section>
      )}
      {flyover ? (
        <CinematicFlyoverOverlay
          definition={flyover}
          mode={flyoverMode}
          chapter={flyoverChapter}
          progress={flyoverProgress}
          stills={flyoverStills}
          videoUrl={flyoverVideoUrl}
          recordingError={flyoverRecordingError}
          onReplay={() => startFlyover(false)}
          onRecordAgain={() => startFlyover(true)}
          onExit={exitFlyover}
        />
      ) : null}
    </main>
  );
}
