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
  useAfterPhysicsStep,
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
import { debrisBodyIsEmbedded } from "./debrisCollisionActivation";
import {
  notifyPipelineHitch,
  performanceGovernor,
  type PerformanceQuality,
  type RuntimePerformanceSnapshot,
} from "./performanceGovernor";
import { safeCompileAsync } from "./safeCompileAsync";
import {
  applyGraphicsSettings,
  loadGraphicsSettings,
  manualSettingsFromSnapshot,
  saveGraphicsSettings,
  type GraphicsSettings,
} from "./graphicsSettings.ts";
import {
  markActiveShotPerformance,
  markShotPerformance,
  recordShotPerformanceFrame,
  setShotPerformanceOutcome,
  startShotPerformanceTrace,
} from "./shotPerformanceTrace";
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
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  AdditiveBlending,
  AgXToneMapping,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
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
  blastEnergyAtDistance,
  explosiveProfile,
  type ExplosiveKind,
  GUNSHOT_NOISE_LEVEL,
  GUNSHOT_NOISE_RISE,
  MG_FIRE_INTERVAL,
  MG_RANGE,
  ROCKET_BLAST_PUSH_RADIUS,
  ROCKET_BLAST_RADIUS,
  VOLUME_BREAK_FRACTION,
  blastNoise,
  buildShards,
  bulletHoleRadius,
  carvedMaterialScale,
  classifyLandingDamage,
  closestPointOnOccupiedGeometry,
  compilePieceDamageGeometry,
  crumbleOnLanding,
  damageBody,
  debrisColliderBoxes,
  bodySettled,
  debrisCollisionTuning,
  DEBRIS_REST_TRAVEL,
  DEBRIS_REST_WINDOW_STEPS,
  debrisRestDecision,
  physicalBodyKind,
  fractureEnergyByMaterial,
  grenadeEnergyAtDistance,
  groundCarveRequiresRemnant,
  groundMaterials,
  hammerWorksMaterial,
  selectCarveTargetsWithinBudget,
  impactDamageRadius,
  omittedDebrisColliderBoxes,
  FORM_PRESERVING_CARVE_FRACTION,
  damageRadiusScaleByMaterial,
  isSuperficialCarve,
  pieceMaterialVolume,
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
import {
  createBreakablePieceIndex,
  type BreakablePieceIndex,
} from "./breakablePieceIndex";
import {
  hingeCapacity,
  stepTether,
  type TetherAnchor,
} from "./attachmentTether";
import {
  SurfaceDamageDecals,
  type SurfaceDamageDecalRuntime,
} from "./SurfaceDamageDecals";
import {
  clipPieceVisualMesh,
  type MeshCrater,
} from "./meshCraterClip";
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
  FirstPersonDemolitionCharge,
  FirstPersonConstructor,
  FirstPersonLauncher,
  FirstPersonMachineGun,
  FirstPersonRocketLauncher,
  FirstPersonToolLighting,
  type SwingDefinition,
} from "./FirstPersonWeapons";
import {
  DemolitionChargeSystem,
  type DemolitionChargeRuntime,
} from "./DemolitionChargeSystem";
import { GrenadeProjectileVisual } from "./GrenadeProjectileVisual";
import { solveSteelPenetration } from "./ballisticPenetration";
import type {
  CannonProjectileProfile,
  VehicleWeaponFireEvent,
} from "./vehicleGunnery";
import { DynamicBreakableWorld } from "./DynamicBreakableWorld";
import {
  ExplosionFxSystem,
  type ExplosionDebrisProfile,
  type ExplosionFxLobe,
  type ExplosionFxRuntime,
} from "./ExplosionFxSystem";
import { getPieceRenderBoxes } from "./breakableGeometry";
import { Birds } from "./Birds";
import {
  CreaturePopulations,
  hasHumanSettlementPopulation,
} from "./CreaturePopulations.tsx";
import type { VillagerReport } from "./villagerSim";
import {
  CreatureEventJournal,
  type AcousticEvent,
  type CreaturePresence,
  type CreatureWorldRuntime,
} from "./creatureWorld.ts";
import { GrassField } from "./GrassField";
import { CLEAR_SKY, worldWeather } from "./skyWeatherModel.ts";

/**
 * TEMP (2026-08-03): kill switch for the authored decks while their cost is
 * being calibrated. `CLEAR_SKY` takes every cloud branch out of the sky shader
 * at the first test, so flipping this is an honest A/B — not a cheaper cloud,
 * no cloud at all. Расширен с польдера на все миры вместе с `WORLD_SKY`:
 * палуба стоит до 96 выборок на пиксель неба против 16 у чистого воздуха.
 */
const WORLD_WEATHER_ENABLED = true;
import { environmentState } from "./environmentState";
import { SceneDressing } from "./SceneDressing";
import { WorldEdge } from "./WorldEdge";
import { HingedDoorSystem, type HingedEntryApproach } from "./HingedDoorSystem";
import {
  entryInteractionActions,
  keyboardDigit,
  numberedEntryInteractionAction,
  preferredEntryInteraction,
  type EntryInteractionAction,
} from "./entryInteraction.ts";
import { SmokePlumes } from "./SmokePlumes";
import { WindController } from "./WindController";
import { IntactBreakableWorld } from "./IntactBreakableWorld";
import { LandscapeSurface } from "./LandscapeSurface";
import {
  VehicleFrameSystem,
  type VehicleFramePoseState,
} from "./VehicleFrameSystem";
// Приборная доска ручного полёта — свой модуль, а не часть покадрового
// компонента: по ней человек решает снижаться или уходить.
import type { RotorcraftPilotStatus } from "./rotorcraftPilotStatus.ts";
import { AstanaTrainSystem } from "./AstanaTrainSystem";
import {
  ConstantRotorSystem,
  constantRotorClusterDefinitions,
} from "./ConstantRotorSystem";
import { TownCarSystem } from "./TownCarSystem";
import {
  ConstructionSystem,
  DEFAULT_CONSTRUCTION_UI,
  type ConstructionRuntime,
  type ConstructionUiState,
} from "./ConstructionSystem";
import { townDsClusterDefinition } from "./townCitroenDs";
import { directWeaponShortcut } from "./weaponShortcuts.ts";
import {
  BasaltForceFieldSystem,
  type BasaltForceFieldRuntime,
} from "./BasaltForceFieldSystem";
import type { BasaltForceFieldPose } from "./basaltForceField.ts";
import { NIMBUS_FORCE_FIELD_PROJECTION } from "./nimbusForceField.ts";
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
  vehicleFrames,
  vehicleFrameForCluster,
  vehiclePiecePosition,
  vehicleRotation,
  rotateVector as rotateVehicleVector,
} from "./vehicleFrames";
import { buildIntactGroundRenderColors } from "./intactWorldBatching";
import {
  createRuntimeStructureResolver,
  type RuntimeStructureResolver,
} from "./runtimeStructure";
import { createSpatialIndex } from "./spatialIndex";
import { createSegmentBoundsIndex } from "./segmentBoundsIndex";
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
  PROJECTILE_FLIGHT,
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_INSIDE_CARRIER,
  DEBRIS_LEAVING_CARRIER,
  DEBRIS_NORMAL,
  VEHICLE_ATTACHMENT,
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
  type OccupiedSeatRelease,
  type PassengerSeatDefinition,
} from "./passengerSeats";
import {
  compoundClusterOwnsPiece,
  compoundClusterPointToLocal,
  compoundClusterPointToWorld,
  compoundClusterPointWorldVelocity,
  compoundClusterWorldTransform,
  compoundMemberNeedsIndividualBody,
  compoundMemberWorldPose,
  PHYSICS_TIME_STEP,
  queueCompoundKinematicImpulse,
  type CompoundClusterWorldTransform,
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
import { VehicleObservationCamera } from "./VehicleObservationCamera";
import { ScreenLuminanceSampler } from "./ScreenLuminanceSampler";
import { screenLuminanceProbe } from "./screenLuminanceProbe";
import { useLanguage } from "../../../../app/i18n/LanguageProvider";
import {
  sceneCopy,
  type TranslationKey,
} from "../../../../app/i18n/dictionary";
import { LanguageSwitcher } from "../../../../app/components/LanguageSwitcher";
import {
  abandonWorldBoot,
  markWorldBoot,
} from "../../../../app/components/worldBoot";
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
  motionTelemetryPrimaryActivity,
  type MotionTelemetryActivityChannel,
  type MotionTelemetryMachineKind,
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
import {
  projectileRocketThreat,
  type RocketThreat,
  type RocketThreatRegistry,
} from "./missileEvasion.ts";

type ControlName = "forward" | "backward" | "left" | "right" | "run" | "jump";

// "none" — фоторежим: пустые руки, клик ничего не делает; клавиша 0.
type WeaponName =
  | "none"
  | "hammer"
  | "launcher"
  | "mg"
  | "rocket"
  | "lance"
  | "charge"
  | "construction";

function nextWeaponName(weapon: WeaponName): Exclude<WeaponName, "none"> {
  return weapon === "hammer"
    ? "launcher"
    : weapon === "launcher"
      ? "mg"
      : weapon === "mg"
        ? "rocket"
        : weapon === "rocket"
          ? "lance"
          : weapon === "lance"
            ? "charge"
            : weapon === "charge"
              ? "construction"
              : "hammer";
}

/**
 * Ракетомёты чередуются одной клавишей: тяжёлый — по стенам и домам, игла —
 * по машинам. Выбор боеприпаса и есть решение игрока перед выстрелом.
 */
function nextLauncherWeapon(weapon: WeaponName): Extract<
  WeaponName,
  "rocket" | "lance"
> {
  return weapon === "rocket" ? "lance" : "rocket";
}

/** Каким боеприпасом стреляет этот ракетомёт. */
function launcherExplosive(weapon: WeaponName): ExplosiveKind {
  return weapon === "lance" ? "lance" : "rocket";
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
    case "dusk":
      return "time.dusk";
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
    case "dusk":
      return "announce.timeDusk";
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
  "skat-departure.approaching",
  "hexacopter-ride.approaching",
  "seat.approaching",
  "stand.available",
  "hexacopter-stand.available",
  "ds-stand.available",
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
              : entry.cue === "combat-hexacopter-uncrewed-flight"
                ? "combat-departure.approaching"
              : entry.cue === "duct-hexacopter-uncrewed-flight"
                ? "yaqui-departure.approaching"
              : entry.cue === "sr6-skat-uncrewed-flight"
                ? "skat-departure.approaching"
              : entry.cue === "dc3-uncrewed-flight"
                ? "dc3-departure.approaching"
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
              ? entry.cue === "town-hexacopter-pilot-seat"
                ? "hexacopter-stand.available"
                : entry.cue === "town-ds-driver-seat"
                  ? "ds-stand.available"
                  : "stand.available"
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
          : entry.cue === "combat-hexacopter-uncrewed-flight"
            ? touch
              ? "hint.combatDeparture.actionTouch"
              : "hint.combatDeparture.action"
          : entry.cue === "duct-hexacopter-uncrewed-flight"
            ? touch
              ? "hint.yaquiDeparture.actionTouch"
              : "hint.yaquiDeparture.action"
          : entry.cue === "sr6-skat-uncrewed-flight"
            ? touch
              ? "hint.skatDeparture.actionTouch"
              : "hint.skatDeparture.action"
          : entry.cue === "dc3-uncrewed-flight"
            ? touch
              ? "hint.dc3Departure.actionTouch"
              : "hint.dc3Departure.action"
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
    if (entry.cue === "town-ds-driver-seat") {
      return touch ? "hint.dsStand.actionTouch" : "hint.dsStand.action";
    }
    return entry.cue === "town-hexacopter-pilot-seat"
      ? touch
        ? "hint.hexacopterStand.actionTouch"
        : "hint.hexacopterStand.action"
      : touch
        ? "hint.stand.actionTouch"
        : "hint.stand.action";
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
  /** Кадр-стрелок либо `player`; только владелец игнорирует свой снаряд. */
  readonly ownerId: string;
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

interface PendingBulletCarveHit {
  readonly traceId: number | null;
  readonly point: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly radius: number;
  readonly material: BreakableMaterial;
  readonly pieceId: string | null;
  readonly parentId: string | null;
}

interface PendingBulletCarveBatch {
  readonly hits: PendingBulletCarveHit[];
  timer: number | null;
}

interface MachineGunImpactRuntime {
  spawn: (
    point: readonly [number, number, number],
    direction: readonly [number, number, number],
    material: BreakableMaterial,
  ) => void;
  clear: () => void;
}

type PerformanceSnapshot = RuntimePerformanceSnapshot;

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const ROCKET_TRAIL_COUNT = 42;
const ROCKET_TRAIL_LIFE = 0.58;
const ROCKET_TRAIL_INTERVAL = 0.035;
const ROCKET_BODY_GEOMETRY = new CylinderGeometry(0.085, 0.11, 0.54, 18);
const ROCKET_NOSE_GEOMETRY = new ConeGeometry(0.112, 0.24, 18);
const ROCKET_NOZZLE_GEOMETRY = new CylinderGeometry(0.075, 0.075, 0.12, 16);
const ROCKET_FIN_GEOMETRY = new BoxGeometry(0.018, 0.15, 0.18);
const ROCKET_TRAIL_GEOMETRY = UNIT_BOX;
const ROCKET_BODY_MATERIAL = new MeshStandardMaterial({
  color: "#28302e",
  metalness: 0.42,
  roughness: 0.48,
});
const ROCKET_NOSE_MATERIAL = new MeshStandardMaterial({
  color: "#d6d0b9",
  metalness: 0.35,
  roughness: 0.42,
});
const ROCKET_NOZZLE_MATERIAL = new MeshStandardMaterial({
  color: "#59615d",
  metalness: 0.5,
  roughness: 0.5,
});
const ROCKET_FIN_MATERIAL = new MeshStandardMaterial({
  color: "#5f6965",
  metalness: 0.45,
  roughness: 0.5,
});
const ROCKET_TRAIL_MATERIAL = new MeshBasicMaterial({
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  toneMapped: false,
});
const ROCKET_TRAIL_COLORS = ["#ffcf67", "#f06a32", "#4b4d49"] as const;
/** Momentum of one MG projectile after the weapon/recoil system has fired it. */
const MG_PROJECTILE_IMPULSE = 2.4;
const MG_CARVE_BATCH_MAX_HITS = 2;
const MG_CARVE_BATCH_LATENCY_MS = 140;
const AP_STEEL_HOLE_RADIUS = 0.1;
const PLAYER_CANNON_PROJECTILE: CannonProjectileProfile = {
  kind: "machineGun",
  steelPenetration: { steelThicknessAtNormal: 0 },
};
const MG_IMPACT_CHIP_COUNT = 96;
const MG_IMPACT_CHIP_LIFE = 0.42;
const MG_IMPACT_CHIP_MATERIAL = new MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});
const MG_STEEL_SPARK_MATERIAL = new MeshBasicMaterial({
  color: "#ffd06a",
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  toneMapped: false,
  blending: AdditiveBlending,
});

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
  sheetMetal: 0.01,
  aluminium: 0.04,
};

type BlastOccluderSource =
  BreakablePieceDefinition | RemnantDefinition | ShardDefinition;

/**
 * В какой системе координат передана точка удара carve. «world» — обычная
 * мировая точка; «cluster» — точка уже переведена в авторскую систему
 * кластера-владельца цели (так стреляет взрыв: перевод фиксируется в кадре
 * детонации, а не в кадре исполнения шага очереди).
 */
type CarveImpactFrame = "world" | "cluster";

function occupiedBoxesForBlast(
  source: BlastOccluderSource | ShardSource,
): readonly OccupiedGeometryBox[] | undefined {
  if ("boxes" in source && source.boxes?.length) {
    return source.boxes;
  }
  // Авторский кусок отличается от обрубка отсутствием parentId: clusterId
  // теперь есть и у носимых кластером обрубков.
  if (
    !("parentId" in source) &&
    "clusterId" in source &&
    source.shape === "cinderBlock"
  ) {
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
    // A spatial broad phase may return candidates in bucket order. Geometry
    // at or beyond the target plane cannot stand between blast and target.
    if (occluder.surfaceDistance >= targetDistance - 0.08) {
      continue;
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
  const triangleOwners = userData.breakableTriangleOwnerIds as
    readonly string[] | undefined;
  const triangleOwnerId = intersection.faceIndex == null
    ? undefined
    : triangleOwners?.[intersection.faceIndex];
  const pieceId =
    typeof userData.breakablePiece === "string"
      ? userData.breakablePiece
      : instanceKind === undefined || instanceKind === "piece"
        ? instanceSourceId ?? triangleOwnerId
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
    ? -(
        velocityX * plateNormal[0] +
        velocityY * plateNormal[1] +
        velocityZ * plateNormal[2]
      )
    : 0;

  // Layer one: like poles of a magnet. The nearer the plate, the harder it
  // pushes, so in ordinary play the hard stop below is never reached at all.
  if (
    plateNormal &&
    gap > 0 &&
    gap < BASALT_FORCE_FIELD_APPROACH_RANGE &&
    arrivalSpeed > 0
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
    ? Math.min(1, 0.3 + Math.max(0, arrivalSpeed) / FORCE_FIELD_PUSH_REFERENCE)
    : gap < BASALT_FORCE_FIELD_APPROACH_RANGE
      ? -(1 - gap / BASALT_FORCE_FIELD_APPROACH_RANGE) *
        BASALT_FORCE_FIELD_APPROACH_BULGE
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
    velocityX !== velocity.x ||
    velocityY !== velocity.y ||
    velocityZ !== velocity.z;

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
    velocityX * hit.normal[0] +
    velocityY * hit.normal[1] +
    velocityZ * hit.normal[2];
  if (inwardSpeed < 0) {
    // Walking into it is absorbed; arriving fast is rejected. The field tells
    // the difference between being touched and being hit.
    const restitution =
      -inwardSpeed > FORCE_FIELD_BOUNCE_SPEED
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
  observationActive,
  entryInteractionActive,
  interIslandArrivalActive,
  interIslandBoundaryPassThrough,
  occupiedSeatId,
  vehicleFramePoses,
  forceFieldRef,
  seatReleaseExitRef,
}: {
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  mobileControls: MobileControlsRef;
  passengerViewMotion: PassengerViewMotion;
  spawn: readonly [number, number, number];
  flightMode: boolean;
  /**
   * Внешний осмотр: камера не у игрока, и весь ходовой вход глушится. В
   * полётном режиме это не осторожность, а необходимость — движение там
   * считается ОТ КАМЕРЫ, и WASD при камере на орбите унёс бы игрока в
   * сторону взгляда на машину.
   */
  observationActive: boolean;
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
  seatReleaseExitRef?: MutableRefObject<SceneVector3 | null>;
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
      const authoredExit = seatReleaseExitRef?.current ?? releasedSeat.exitPoint;
      if (seatReleaseExitRef) seatReleaseExitRef.current = null;
      const exitPoint = carrier
        ? passengerSeatWorldPoint(carrier, authoredExit)
        : authoredExit;
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
    const inputX = observationActive
      ? 0
      : MathUtils.clamp(Number(right) - Number(left) + touch.moveX, -1, 1);
    const inputZ = observationActive
      ? 0
      : MathUtils.clamp(Number(backward) - Number(forward) + touch.moveZ, -1, 1);
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
      !entryInteractionActive &&
      !observationActive &&
      (jump || touch.jump) &&
      grounded;
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
    // Sky work cannot be verified without knowing where the sun actually is:
    // the solar frame is geographic, so guessing an azimuth wastes a run.
    scope.__mamSun = () => ({
      x: environmentState.sunDirection.x,
      y: environmentState.sunDirection.y,
      z: environmentState.sunDirection.z,
      day: environmentState.dayFactor,
    });
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
      delete scope.__mamSun;
    };
  }, []);

  // Возврат камеры после чужого владения (внешний осмотр): реактивация
  // переустанавливает взгляд из накопленных yaw/pitch сразу, а не с первого
  // движения мыши — иначе кадр-другой камера смотрит туда, куда её оставила
  // орбита.
  useEffect(() => {
    if (active && initialized.current) {
      cameraRef.current.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    }
  }, [active]);

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
  /** Живые кластеры: отломанный член рождается в позе машины, не дома. */
  kinematicClusters?: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
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
// маски взаимодействия также используются датчиками транспорта.
//
// ЗАДЕРЖКА ДЕРЖИТСЯ ТОЛЬКО НА ОДНОМ: запрос формой честен лишь после того,
// как тело хоть раз прошло через `world.step()` и попало в broad phase. Пара
// шагов запаса это гарантирует, и на них же кластер успевает тронуться с
// места. Больше задержке взять неоткуда: «дать перекрытиям осесть» теперь
// делают сами ворота, и они судят по ГЛУБИНЕ.
//
// Прежние 36 шагов (0.6 с) стоили дорого: за это время куски успевали
// перемешаться и садились в кучу уже вложенными друг в друга. Замер на
// фасаде `hru:south:0` — пар с проникновением больше сантиметра после
// осадки: 36 шагов → 157 пар (худшая 6.4 см), 12 → 131, 6 → 37 (3.9 см),
// 1 → 28. Остаток на шести — авторское взаимопроникновение оконного набора,
// которое разводится не здесь (см. `resolveInterpenetration`).
const DEBRIS_SETTLE_STEPS = 6;
const DEBRIS_OVERLAP_RETRY_STEPS = 6;
/**
 * ПОТОЛОК ПЕРЕСПРОСА. Раньше кусок, оставшийся заделанным в соседа,
 * возвращался в очередь каждые шесть шагов бесконечно: после обвала бюджет
 * ворот был занят под завязку до конца партии (замер: 23.5 проверки из 24 на
 * шаг, 1045 призраков на одну хрущёвку). Три секунды — предел, за которым
 * спрашивать бессмысленно: кусок в глубине завала не разъедется уже никогда.
 *
 * Потолок закрывает ВОПРОС, а не льготу: вооружать глубоко сцепленную кучу
 * нельзя, это замерено (см. ветку `embedded` в воротах).
 */
const DEBRIS_SETTLE_MAX_STEPS = 180;
const DEBRIS_ACTIVATION_CHECKS_PER_STEP = [4, 12, 24] as const;
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
  kinematicClusters,
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
  const vehicleAttachment = Boolean(clusterFrame && !compoundClusterMember);
  const ownsContactShape = broken || !compoundClusterMember;
  // Член машины рождается внутри её оболочки, а не рядом с ней, и только он
  // получает льготу (см. DEBRIS_LEAVING_CARRIER). Мировой обломок сталкивается
  // с собратьями с первого шага: призрак садится в кучу вложенным.
  const birthGroup = clusterFrame ? DEBRIS_LEAVING_CARRIER : DEBRIS_NORMAL;
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
      // Член составного кластера отламывается ТАМ, где машина сейчас. Тело
      // монтируется в авторской точке рождения, и без переноса ДО включения
      // динамики обломок кадр-другой жил бы (и бился бы о землю) в домашней
      // точке стоянки, а потом телепортировался к машине.
      if (compoundClusterMember && kinematicClusters) {
        const runtime = kinematicClusters.current.get(piece.clusterId);
        if (runtime) {
          const pose = compoundMemberWorldPose(
            runtime.definition.origin,
            compoundClusterWorldTransform(runtime.body),
            piece.position,
            piece.rotation,
          );
          currentBody.setTranslation(
            { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
            false,
          );
          currentBody.setRotation(
            {
              x: pose.quaternion[0],
              y: pose.quaternion[1],
              z: pose.quaternion[2],
              w: pose.quaternion[3],
            },
            false,
          );
          // И С ТОЙ ЖЕ СКОРОСТЬЮ. Перенос позы без переноса движения означал,
          // что кусок рождался НЕПОДВИЖНЫМ рядом с идущей машиной: она
          // мгновенно налетала на собственную деталь, и выглядело это как
          // «обломок мешает лететь». Скорость берётся точкой корпуса — той
          // самой, где деталь сидела, — и потому включает вращение машины.
          if (
            currentBody.bodyType() !== rapier.RigidBodyType.Dynamic
          ) {
            currentBody.setBodyType(rapier.RigidBodyType.Dynamic, true);
          }
          const carried = compoundClusterPointWorldVelocity(
            runtime.body,
            pose.position,
          );
          currentBody.setLinvel(
            { x: carried[0], y: carried[1], z: carried[2] },
            false,
          );
          const spin = runtime.body.angvel();
          currentBody.setAngvel(
            { x: spin.x, y: spin.y, z: spin.z },
            false,
          );
        }
      }
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
        collider.setCollisionGroups(birthGroup);
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
    compoundClusterMember,
    kinematicClusters,
    piece.column,
    piece.id,
    piece.material,
    piece.row,
    fallingTreeFoliage,
    rapier,
    registerBody,
    birthGroup,
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
      // undefined). Отдельный механизм получает явную маску: с миром он
      // взаимодействует, со своим составным корпусом — нет.
      {...(broken
        ? { collisionGroups: birthGroup }
        : vehicleAttachment
          ? { collisionGroups: VEHICLE_ATTACHMENT }
          : {})}
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
  landscapeVisual,
  brokenPieces,
  shatteredPieces,
  bodies,
  kinematicClusters,
  kinematicClusterDefinitions,
  mutablePieceIds,
  mutablePieceStates,
  crateredMeshes,
  registerBody,
  onDebrisContact,
}: {
  pieces: readonly BreakablePieceDefinition[];
  landscapeVisual: DestructionSceneDefinition["landscapeVisual"];
  brokenPieces: ReadonlySet<string>;
  shatteredPieces: ReadonlySet<string>;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
  kinematicClusterDefinitions: readonly CompoundKinematicClusterDefinition[];
  mutablePieceIds: ReadonlySet<string>;
  mutablePieceStates: MutableRefObject<Map<string, MutablePieceVisualState>>;
  /** Куски с настоящей пробоиной в авторской сетке. */
  crateredMeshes: ReadonlyMap<
    string,
    NonNullable<BreakablePieceDefinition["visualMesh"]>
  >;
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
    const compoundDefinitionByCluster = new Map(
      kinematicClusterDefinitions.map(
        (definition) => [definition.clusterId, definition] as const,
      ),
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
        compoundDefinitionByCluster.has(piece.clusterId) ||
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
        const compoundDefinition = compoundDefinitionByCluster.get(
          piece.clusterId,
        );
        // The carrier already owns ordinary intact members completely. Only
        // articulated attachments keep an individual pose body; every other
        // member materialises one at the instant it detaches.
        if (
          !compoundDefinition ||
          compoundMemberNeedsIndividualBody(
            compoundDefinition,
            piece,
            brokenPieces.has(piece.id),
          )
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
        crateredMeshes={crateredMeshes}
      />
      {landscapeVisual ? (
        <LandscapeSurface
          definition={landscapeVisual}
          hiddenPieceIds={hiddenPieceIds}
        />
      ) : null}
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
          kinematicClusters={kinematicClusters}
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
  kinematicClusters,
}: {
  shards: readonly ShardDefinition[];
  remnants: readonly RemnantDefinition[];
  brokenPieces: ReadonlySet<string>;
  registerBody: (id: string, body: RapierRigidBody | null) => void;
  onShardContact: DebrisContactReporter<ShardDefinition>;
  onRemnantContact: DebrisContactReporter<RemnantDefinition>;
  kinematicClusters?: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
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
    (body: RapierRigidBody, onForce: ContactForceHandler | null) => {
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

  /**
   * Обрубок, отломившийся от ЛЕТЯЩЕГО кластера, рождается сразу свободным
   * обломком: в текущей мировой позе своей авторской точки и со скоростью
   * этой точки на корпусе. Fixed-этапа в авторской позе у него не бывает —
   * там, где машина родилась, его больше нет.
   */
  const spawnClusterRemnant = useCallback(
    (remnant: RemnantDefinition, runtime: CompoundKinematicClusterRuntime) => {
      const transform = compoundClusterWorldTransform(runtime.body);
      const origin = runtime.definition.origin;
      const worldPosition = compoundClusterPointToWorld(
        origin,
        transform,
        remnant.position,
      );
      const worldQuaternion = new Quaternion(...transform.rotation).multiply(
        new Quaternion(...remnant.quaternion),
      );
      const velocity = compoundClusterPointWorldVelocity(
        runtime.body,
        worldPosition,
      );
      const angular = runtime.body.angvel();
      const spec = remnantBodySpec(remnant, true);
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(worldPosition[0], worldPosition[1], worldPosition[2])
          .setRotation({
            x: worldQuaternion.x,
            y: worldQuaternion.y,
            z: worldQuaternion.z,
            w: worldQuaternion.w,
          })
          .setLinvel(velocity[0], velocity[1], velocity[2])
          .setAngvel({ x: angular.x, y: angular.y, z: angular.z })
          .setLinearDamping(spec.linearDamping)
          .setAngularDamping(spec.angularDamping)
          .setCcdEnabled(spec.hardCcd),
      );
      body.setSoftCcdPrediction(spec.softCcdPrediction);
      buildColliders(body, spec.colliders);
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
      entries.current.set(remnant.id, { body, freed: true });
    },
    [armDebris, buildColliders, rapier, registerBody, world],
  );

  const removeEntry = useCallback(
    (id: string, entry: { body: RapierRigidBody; freed: boolean }) => {
      rigidBodyEvents.delete(entry.body.handle);
      registerBody(id, null);
      try {
        world.removeRigidBody(entry.body);
      } catch (error) {
        // Fast Refresh can dispose the Rapier world before child cleanup.
        // The WASM handle is already gone in that case; local registries still
        // need to be cleared so the replacement world starts cleanly.
        if (process.env.NODE_ENV !== "development") throw error;
      }
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
      const freed = remnant.detached || brokenPieces.has(remnant.parentId);
      const clusterRuntime = remnant.clusterId
        ? kinematicClusters?.current.get(remnant.clusterId)
        : undefined;
      if (clusterRuntime && !freed) {
        // Обрубок ещё летит в составе кластера: контактную форму даёт
        // компаунд, отдельного тела в мире у обрубка нет.
        continue;
      }
      live.add(remnant.id);
      const entry = entries.current.get(remnant.id);
      if (process.env.NODE_ENV !== "production" && remnant.clusterId) {
        const scope = window as unknown as Record<string, unknown>;
        const spawns = (scope.__mamRemnantSpawns ??= {}) as Record<
          string,
          number
        >;
        const path = !entry
          ? clusterRuntime
            ? "spawnCluster"
            : "spawnPlain(noRuntime)"
          : freed && !entry.freed
            ? "freeExisting"
            : "noop";
        spawns[path] = (spawns[path] ?? 0) + 1;
      }
      if (!entry) {
        if (clusterRuntime) {
          spawnClusterRemnant(remnant, clusterRuntime);
        } else {
          spawnRemnant(remnant, freed);
        }
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
    kinematicClusters,
    remnants,
    removeEntry,
    shards,
    spawnClusterRemnant,
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
  threatRegistry,
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
  threatRegistry: RocketThreatRegistry;
}) {
  const body = useRef<RapierRigidBody>(null);
  const rocketVisual = useRef<Group>(null);
  const rocketTrailMesh = useRef<InstancedMesh>(null);
  const exploded = useRef(false);
  const pendingContact = useRef<SceneVector3 | null>(null);
  const previousProjectilePosition = useRef<SceneVector3>(grenade.position);
  const projectileAge = useRef(0);
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
  // Снаряд живёт по своему паспорту. «Похож на ракету» (есть корпус, след и
  // управляемый полёт) — свойство ВИДА боеприпаса, а не имени: игла тоже
  // ракета, только тоньше и быстрее.
  const profile = explosiveProfile(grenade.kind);
  const isRocket = grenade.kind !== "grenade";

  // Реестр читает не расчётный дубль полёта, а само rapier-тело. Поэтому
  // игла, тяжёлая и бортовая ракета приходят к автомату со своей фактической
  // скоростью и траекторией, включая любой внешний импульс.
  useBeforePhysicsStep(() => {
    if (!isRocket || exploded.current || !body.current) {
      return;
    }
    const position = body.current.translation();
    const velocity = body.current.linvel();
    const threat = projectileRocketThreat(
      grenade.id,
      grenade.ownerId,
      grenade.kind,
      [position.x, position.y, position.z],
      [velocity.x, velocity.y, velocity.z],
      projectileAge.current,
    );
    if (threat) {
      threatRegistry.current.set(grenade.id, threat);
    }
    projectileAge.current += PHYSICS_TIME_STEP;
  });

  useEffect(
    () => () => {
      threatRegistry.current.delete(grenade.id);
    },
    [grenade.id, threatRegistry],
  );

  // Initialise the pooled instances in the same commit that mounts them.
  // A passive effect is one paint too late: Three starts every instance at
  // the identity matrix with a white material, so each rocket briefly showed
  // one overlapped metre-wide cube at the world origin.
  useLayoutEffect(() => {
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
    (fieldHit?: BasaltForceFieldHit | null, at?: SceneVector3 | null) => {
      if (exploded.current || !body.current) {
        return;
      }

      exploded.current = true;
      threatRegistry.current.delete(grenade.id);
      const translation = body.current.translation();
      const point: SceneVector3 = fieldHit?.point ??
        at ?? [translation.x, translation.y, translation.z];
      onExplode(
        grenade.id,
        grenade.kind,
        point[0],
        point[1],
        point[2],
        fieldHit?.cellIndex,
      );
    },
    [grenade.id, grenade.kind, onExplode, threatRegistry],
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
      profile.projectile.spin,
      true,
    );

    const fuse = window.setTimeout(
      trigger,
      profile.projectile.fuseMs,
    );
    return () => window.clearTimeout(fuse);
  }, [grenade, trigger]);

  useFrame((_, delta) => {
    if (!body.current) {
      return;
    }

    // КАСАНИЕ ОТМЕЧЕНО В КОЛБЭКЕ, А ПОДРЫВ ИДЁТ ЗДЕСЬ.
    //
    // Обработчик столкновения rapier зовёт из-под собственного шага, когда
    // мир одолжен наружу; весь конвейер взрыва оттуда — это вызов мира
    // из-под самого себя, и wasm отвечает «recursive use of an object
    // detected». Кадр тот же самый: физика шагает раньше снарядов, так что
    // задержки на глаз нет, а точка берётся с момента касания, а не после
    // отскока.
    const contact = pendingContact.current;
    if (contact) {
      pendingContact.current = null;
      const contactFieldHit = forceFieldRef?.current?.intersectSegment(
        previousProjectilePosition.current,
        contact,
      );
      triggerAt(contactFieldHit, contact);
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
        density={profile.projectile.density}
        gravityScale={profile.projectile.gravityScale}
        linearDamping={0.04}
        angularDamping={profile.projectile.angularDamping}
        ccd
        // Снаряд — НЕ пешеход: кольцо-ограничитель и пол безопасности стоят
        // для человека, и биться о них снаряду незачем (см. группу).
        collisionGroups={PROJECTILE_FLIGHT}
        onCollisionEnter={() => {
          // Здесь только отметка и чтение позы: подрыв идёт следующим
          // проходом кадра, вне колбэка физического мира.
          if (exploded.current || pendingContact.current) {
            return;
          }
          const translation = body.current?.translation();
          pendingContact.current = translation
            ? [translation.x, translation.y, translation.z]
            : previousProjectilePosition.current;
        }}
      >
        {isRocket ? (
          <BallCollider args={[grenade.kind === "lance" ? 0.085 : 0.14]} />
        ) : (
          <CapsuleCollider
            args={[0.075, 0.062]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        )}
        {!isRocket ? <GrenadeProjectileVisual /> : null}
      </RigidBody>

      {isRocket ? (
        <group ref={rocketVisual} dispose={null}>
          <mesh
            geometry={ROCKET_BODY_GEOMETRY}
            material={ROCKET_BODY_MATERIAL}
            castShadow
            rotation={[Math.PI / 2, 0, 0]}
          />
          <mesh
            geometry={ROCKET_NOSE_GEOMETRY}
            material={ROCKET_NOSE_MATERIAL}
            castShadow
            position={[0, 0, 0.37]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <mesh
            geometry={ROCKET_NOZZLE_GEOMETRY}
            material={ROCKET_NOZZLE_MATERIAL}
            castShadow
            position={[0, 0, -0.36]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
            <mesh
              key={angle}
              geometry={ROCKET_FIN_GEOMETRY}
              material={ROCKET_FIN_MATERIAL}
              castShadow
              position={[
                Math.cos(angle) * 0.105,
                Math.sin(angle) * 0.105,
                -0.24,
              ]}
              rotation={[0, 0, angle]}
            />
          ))}
        </group>
      ) : null}

      {isRocket ? (
        <instancedMesh
          ref={rocketTrailMesh}
          args={[
            ROCKET_TRAIL_GEOMETRY,
            ROCKET_TRAIL_MATERIAL,
            ROCKET_TRAIL_COUNT,
          ]}
          dispose={null}
          frustumCulled={false}
        />
      ) : null}
    </>
  );
}

function ProjectileWarmup() {
  const { gl, camera } = useThree();
  const { world, rapier } = useRapier();

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    let idle: number | undefined;
    const warm = () => {
      if (cancelled) return;

      const warmScene = new Scene();
      warmScene.add(
        new Mesh(ROCKET_BODY_GEOMETRY, ROCKET_BODY_MATERIAL),
        new Mesh(ROCKET_NOSE_GEOMETRY, ROCKET_NOSE_MATERIAL),
        new Mesh(ROCKET_NOZZLE_GEOMETRY, ROCKET_NOZZLE_MATERIAL),
        new Mesh(ROCKET_FIN_GEOMETRY, ROCKET_FIN_MATERIAL),
      );
      const trail = new InstancedMesh(
        ROCKET_TRAIL_GEOMETRY,
        ROCKET_TRAIL_MATERIAL,
        1,
      );
      trail.setColorAt(0, new Color(ROCKET_TRAIL_COLORS[0]));
      warmScene.add(trail);
      void safeCompileAsync(gl, warmScene, camera).finally(() =>
        warmScene.clear(),
      );

      // Prime the WASM allocation path without leaving a body in the world.
      // The live projectile still owns its normal React/Rapier lifecycle.
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic().setTranslation(0, -10_000, 0),
      );
      world.createCollider(rapier.ColliderDesc.ball(0.14), body);
      world.removeRigidBody(body);
    };

    const idleApi = window as unknown as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleApi.requestIdleCallback) {
      idle = idleApi.requestIdleCallback(warm, { timeout: 1_500 });
    } else {
      timeout = window.setTimeout(warm, 250);
    }
    return () => {
      cancelled = true;
      if (idle !== undefined) idleApi.cancelIdleCallback?.(idle);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [camera, gl, rapier, world]);

  return null;
}

interface ProjectileRuntime {
  spawn: (definition: GrenadeDefinition) => void;
  clear: () => void;
}

function ProjectileSystem({
  runtimeRef,
  onExplode,
  forceFieldRef,
  threatRegistry,
}: {
  runtimeRef: MutableRefObject<ProjectileRuntime | null>;
  onExplode: (
    id: number,
    kind: ExplosiveKind,
    x: number,
    y: number,
    z: number,
    fieldCellIndex?: number,
  ) => void;
  forceFieldRef?: MutableRefObject<BasaltForceFieldRuntime | null>;
  threatRegistry: RocketThreatRegistry;
}) {
  const [projectiles, setProjectiles] = useState<readonly GrenadeDefinition[]>(
    [],
  );

  useEffect(() => {
    const api: ProjectileRuntime = {
      spawn: (definition) => {
        setProjectiles((current) => [...current, definition]);
      },
      clear: () => {
        threatRegistry.current.clear();
        setProjectiles([]);
      },
    };
    runtimeRef.current = api;
    return () => {
      if (runtimeRef.current === api) {
        runtimeRef.current = null;
      }
    };
  }, [runtimeRef, threatRegistry]);

  const handleExplode = useCallback(
    (
      id: number,
      kind: ExplosiveKind,
      x: number,
      y: number,
      z: number,
      fieldCellIndex?: number,
    ) => {
      setProjectiles((current) =>
        current.filter((projectile) => projectile.id !== id),
      );
      onExplode(id, kind, x, y, z, fieldCellIndex);
    },
    [onExplode],
  );

  return projectiles.map((projectile) => (
    <Grenade
      key={`grenade:${projectile.id}`}
      grenade={projectile}
      onExplode={handleExplode}
      forceFieldRef={forceFieldRef}
      threatRegistry={threatRegistry}
    />
  ));
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

/**
 * Сколько кусков одновременно могут нести настоящую пробоину. У пробитого
 * куска форма СВОЯ, инстансный батч он делить больше не может и стоит своего
 * draw call; сверх этого числа удар уходит прежним путём, в воксели.
 */
const MAXIMUM_CRATERED_PIECES = 24;
/** Кратеров на кусок: дальше решето честнее показать вокселями. */
const MAXIMUM_CRATERS_PER_PIECE = 6;

/**
 * Нормаль отметины в той же системе, в которой живёт её точка. Точка удара по
 * члену компаунда уже переведена в систему машины, и нормаль обязана уехать
 * туда же — иначе пробоина на летящем борту смотрит в мировую сторону и с
 * первым же разворотом уходит внутрь корпуса.
 */
function decalNormalInFrame(
  worldNormal: readonly [number, number, number],
  worldAnchor: readonly [number, number, number],
  localPoint: readonly [number, number, number],
  frame: {
    readonly runtime: CompoundKinematicClusterRuntime;
    readonly transform: CompoundClusterWorldTransform;
  } | null,
): readonly [number, number, number] {
  if (!frame) {
    return worldNormal;
  }
  const tip = compoundClusterPointToLocal(
    frame.runtime.definition.origin,
    frame.transform,
    [
      worldAnchor[0] + worldNormal[0],
      worldAnchor[1] + worldNormal[1],
      worldAnchor[2] + worldNormal[2],
    ],
  );
  const local: [number, number, number] = [
    tip[0] - localPoint[0],
    tip[1] - localPoint[1],
    tip[2] - localPoint[2],
  ];
  const length = Math.hypot(...local);
  return length > 1e-6
    ? [local[0] / length, local[1] / length, local[2] / length]
    : worldNormal;
}

interface TracerRuntime {
  spawn: (from: TracerDefinition["from"], to: TracerDefinition["to"]) => void;
  clear: () => void;
}

function TracerSystem({
  runtimeRef,
}: {
  runtimeRef: MutableRefObject<TracerRuntime | null>;
}) {
  const [tracers, setTracers] = useState<readonly TracerDefinition[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const api: TracerRuntime = {
      spawn: (from, to) => {
        nextId.current += 1;
        const id = nextId.current;
        setTracers((current) => [...current.slice(-8), { id, from, to }]);
      },
      clear: () => setTracers([]),
    };
    runtimeRef.current = api;
    return () => {
      if (runtimeRef.current === api) {
        runtimeRef.current = null;
      }
    };
  }, [runtimeRef]);

  const remove = useCallback((id: number) => {
    setTracers((current) => current.filter((tracer) => tracer.id !== id));
  }, []);

  return tracers.map((tracer) => (
    <Tracer key={`tracer:${tracer.id}`} tracer={tracer} onDone={remove} />
  ));
}

function MachineGunImpactSystem({
  runtimeRef,
}: {
  runtimeRef: MutableRefObject<MachineGunImpactRuntime | null>;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const sparkMesh = useRef<InstancedMesh>(null);
  const nextSlot = useRef(0);
  const sequence = useRef(0);
  const slots = useRef(
    Array.from({ length: MG_IMPACT_CHIP_COUNT }, () => ({
      active: false,
      age: MG_IMPACT_CHIP_LIFE,
      position: new Vector3(),
      velocity: new Vector3(),
      size: 0,
      life: MG_IMPACT_CHIP_LIFE,
      spark: false,
    })),
  );
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const sparkAxis = useMemo(() => new Vector3(0, 0, 1), []);
  const sparkDirection = useMemo(() => new Vector3(), []);

  const hideSlot = useCallback(
    (index: number) => {
      dummy.position.set(0, -10_000, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
      sparkMesh.current?.setMatrixAt(index, dummy.matrix);
    },
    [dummy],
  );

  useEffect(() => {
    for (let index = 0; index < MG_IMPACT_CHIP_COUNT; index += 1) {
      hideSlot(index);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
    if (sparkMesh.current) sparkMesh.current.instanceMatrix.needsUpdate = true;
  }, [hideSlot]);

  useEffect(() => {
    const api: MachineGunImpactRuntime = {
      spawn: (point, direction, material) => {
        const current = mesh.current;
        const sparks = sparkMesh.current;
        if (!current || !sparks) return;
        const quality = Math.min(
          performanceGovernor.getSnapshot().cpuQuality,
          performanceGovernor.getSnapshot().gpuQuality,
        );
        const isSteelSpark = material === "steel";
        const count = isSteelSpark ? [3, 6, 9][quality] : [2, 4, 6][quality];
        for (let index = 0; index < count; index += 1) {
          sequence.current += 1;
          const noiseA = blastNoise(`mg-impact:${sequence.current}`, 3) - 0.5;
          const noiseB = blastNoise(`mg-impact:${sequence.current}`, 7) - 0.5;
          const noiseC = blastNoise(`mg-impact:${sequence.current}`, 11);
          const slotIndex = nextSlot.current;
          nextSlot.current = (nextSlot.current + 1) % MG_IMPACT_CHIP_COUNT;
          const slot = slots.current[slotIndex];
          hideSlot(slotIndex);
          slot.active = true;
          slot.age = 0;
          slot.spark = isSteelSpark;
          slot.position.set(...point);
          if (isSteelSpark) {
            const rebound = 1.8 + noiseC * 3.2;
            slot.velocity.set(
              -direction[0] * rebound + noiseA * 3.8,
              Math.max(0.35, -direction[1] * rebound) + 0.8 + noiseC * 2.4,
              -direction[2] * rebound + noiseB * 3.8,
            );
            slot.size = 0.075 + noiseC * 0.14;
            slot.life = 0.14 + noiseC * 0.2;
          } else {
            slot.velocity.set(
              -direction[0] * (0.45 + noiseC * 0.9) + noiseA * 1.6,
              0.55 + noiseC * 1.25,
              -direction[2] * (0.45 + noiseC * 0.9) + noiseB * 1.6,
            );
            slot.size = 0.025 + noiseC * 0.035;
            slot.life = MG_IMPACT_CHIP_LIFE;
            current.setColorAt(
              slotIndex,
              color.set(materialRuntimeProfiles[material].dustColor),
            );
          }
        }
        if (!isSteelSpark && current.instanceColor) {
          current.instanceColor.needsUpdate = true;
        }
      },
      clear: () => {
        slots.current.forEach((slot, index) => {
          slot.active = false;
          hideSlot(index);
        });
        if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
        if (sparkMesh.current) {
          sparkMesh.current.instanceMatrix.needsUpdate = true;
        }
      },
    };
    runtimeRef.current = api;
    return () => {
      if (runtimeRef.current === api) runtimeRef.current = null;
    };
  }, [color, hideSlot, runtimeRef]);

  useFrame((_, delta) => {
    const current = mesh.current;
    const sparks = sparkMesh.current;
    if (!current || !sparks) return;
    let changed = false;
    slots.current.forEach((slot, index) => {
      if (!slot.active) return;
      slot.age += delta;
      if (slot.age >= slot.life) {
        slot.active = false;
        hideSlot(index);
        changed = true;
        return;
      }
      slot.velocity.y -= delta * (slot.spark ? 9.8 : 4.8);
      slot.position.addScaledVector(slot.velocity, delta);
      const life = 1 - slot.age / slot.life;
      dummy.position.copy(slot.position);
      if (slot.spark) {
        sparkDirection.copy(slot.velocity).normalize();
        dummy.quaternion.setFromUnitVectors(sparkAxis, sparkDirection);
        dummy.scale.set(
          0.007 * life,
          0.007 * life,
          slot.size * (0.35 + life * 0.65),
        );
      } else {
        dummy.rotation.set(slot.age * 18, slot.age * 13, slot.age * 9);
        dummy.scale.setScalar(slot.size * life);
      }
      dummy.updateMatrix();
      (slot.spark ? sparks : current).setMatrixAt(index, dummy.matrix);
      changed = true;
    });
    if (changed) {
      current.instanceMatrix.needsUpdate = true;
      sparks.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[UNIT_BOX, MG_IMPACT_CHIP_MATERIAL, MG_IMPACT_CHIP_COUNT]}
        frustumCulled={false}
        dispose={null}
      />
      <instancedMesh
        ref={sparkMesh}
        args={[UNIT_BOX, MG_STEEL_SPARK_MATERIAL, MG_IMPACT_CHIP_COUNT]}
        frustumCulled={false}
        dispose={null}
      />
    </>
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
    const cargo = t(
      `villager.cargo.${report.cargo ?? "firewood"}` as TranslationKey,
    );
    return report.intent.carrying
      ? fill("villager.intent.deliver", { cargo, place })
      : fill("villager.intent.fetch", { cargo });
  }
  if (report.intent.kind === "place") {
    return fill("villager.intent.place", {
      place: placeName(report.intent.areaId),
    });
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
  /** Лента маршрута в мире: включается третьим положением T. */
  routeOverlayEnabled: boolean;
  /** Выбранная прицелом машина — её маршрут и её телеметрия. */
  selectedVehicleClusterId?: string | null;
  /** Машина под внешним осмотром: камера на орбите вокруг неё, не у игрока. */
  observationClusterId?: string | null;
  onAimSelectionChange?: (clusterId: string | null) => void;
  aimIndicatorRef?: { readonly current: HTMLElement | null };
  scene: DestructionSceneDefinition;
  active: boolean;
  flightMode: boolean;
  weapon: WeaponName;
  timeOfDay: TimeOfDay;
  timeOfDaySnapVersion: number;
  fallbackLook: boolean;
  mobileControls: MobileControlsRef;
  mobileActions: MutableRefObject<MobileActionBridge>;
  chargeCount: number;
  demolitionChargeRuntime: MutableRefObject<DemolitionChargeRuntime | null>;
  constructionRuntime: MutableRefObject<ConstructionRuntime | null>;
  onConstructionUiChange: (state: ConstructionUiState) => void;
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
  onChargeCountChange: (count: number) => void;
  onEntryApproachChange: (entry: HingedEntryApproach | null) => void;
  onVillagerInspect: (report: VillagerReport | null) => void;
  onDepartureApproachChange: (approached: HingedEntryApproach | null) => void;
  /** Пост у водительской двери: подход к машине — не подход к рейсу. */
  onCarApproachChange: (approached: HingedEntryApproach | null) => void;
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
  onOccupiedSeatChange: (
    seatId: string | null,
    release?: OccupiedSeatRelease,
  ) => void;
  onMotionTelemetryUpdate: (update: MotionTelemetryUpdate) => void;
  onRotorcraftPilotStatusChange: (status: RotorcraftPilotStatus | null) => void;
  motionTelemetryStore: MotionTelemetryStore;
  onVehicleFailure: (event: VehicleFailureEvent) => void;
  /** World-specific canvas dressing the shared game must not statically import. */
  worldOverlay?: ReactNode;
}

function OpenWorldScene({
  scene,
  active,
  routeOverlayEnabled,
  selectedVehicleClusterId,
  observationClusterId = null,
  onAimSelectionChange,
  aimIndicatorRef,
  flightMode,
  weapon,
  chargeCount,
  timeOfDay,
  timeOfDaySnapVersion,
  fallbackLook,
  mobileControls,
  mobileActions,
  demolitionChargeRuntime,
  constructionRuntime,
  onConstructionUiChange,
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
  onChargeCountChange,
  onEntryApproachChange,
  onVillagerInspect,
  onDepartureApproachChange,
  onCarApproachChange,
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
  worldOverlay,
}: OpenWorldSceneProps) {
  const seatReleaseExitRef = useRef<SceneVector3 | null>(null);
  const handleOccupiedSeatChange = useCallback(
    (seatId: string | null, release?: OccupiedSeatRelease) => {
      seatReleaseExitRef.current = seatId ? null : (release?.exitPoint ?? null);
      onOccupiedSeatChange(seatId, release);
    },
    [onOccupiedSeatChange],
  );
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
    resolveStructuralScope,
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
  /**
   * Накопленное ПОВЕРХНОСТНОЕ повреждение куска: решётка со всеми прежними
   * пробоинами, которая ещё не изменила его форму. Ею и продолжает работать
   * ядро, поэтому вторая пуля в то же место дорезает первую, а не начинает с
   * целого куска.
   */
  const superficialDamage = useRef(
    new Map<
      string,
      {
        readonly voxelBody: NonNullable<ShardSource["voxelBody"]>;
        readonly boxes: NonNullable<ShardSource["boxes"]>;
        readonly removed: number;
      }
    >(),
  );
  const surfaceDecalRuntime = useRef<SurfaceDamageDecalRuntime | null>(null);
  /**
   * НАСТОЯЩИЕ ПРОБОИНЫ. Кратеры копятся в системе самого куска (метры от его
   * центра), а из них выводится подрезанная авторская сетка — та, которой он
   * теперь и рисуется. Решётка при этом остаётся гроссбухом: она отвечает за
   * материал и связность, а форму держит сетка.
   *
   * Бюджет жёсткий: пробитый кусок стоит своего draw call, потому что форма у
   * него больше не общая с однотипными соседями. Сверх бюджета удар уходит
   * прежним путём, в воксели.
   */
  const pieceCraters = useRef(new Map<string, MeshCrater[]>());
  const [crateredMeshes, setCrateredMeshes] = useState<
    ReadonlyMap<string, NonNullable<BreakablePieceDefinition["visualMesh"]>>
  >(() => new Map());
  const crateredMeshesRef = useRef(crateredMeshes);
  crateredMeshesRef.current = crateredMeshes;
  const dropPieceCraters = useCallback((pieceId: string) => {
    if (!pieceCraters.current.delete(pieceId)) {
      return;
    }
    const next = new Map(crateredMeshesRef.current);
    if (next.delete(pieceId)) {
      crateredMeshesRef.current = next;
      setCrateredMeshes(next);
    }
  }, []);
  const resolveDamageSource = useCallback(
    (source: ShardSource): ShardSource => {
      if (source.voxelBody) return source;
      const damaged = superficialDamage.current.get(source.id);
      if (damaged) {
        return { ...source, voxelBody: damaged.voxelBody, boxes: damaged.boxes };
      }
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
  const { camera, scene: threeScene } = useThree();
  const { rapier, world } = useRapier();
  const passengerViewMotion = useMemo(() => createPassengerViewMotion(), []);
  const raycaster = useRef(new Raycaster());
  const basaltForceField = useRef<BasaltForceFieldRuntime | null>(null);
  const forceFieldActive = scene.id === "basalt-stronghold" || scene.id === "nimbus";
  const nimbusForceField = scene.id === "nimbus";
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
  const launcherKick = useRef(0);
  const [bursts, setBursts] = useState<readonly ImpactBurstDefinition[]>([]);
  const [shards, setShards] = useState<readonly ShardDefinition[]>([]);
  const [shatteredPieces, setShatteredPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [remnants, setRemnants] = useState<readonly RemnantDefinition[]>([]);
  const [carvedPieces, setCarvedPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Detached authored pieces which fell below the physical world remain
  // structurally broken, but no longer own a body or a visible instance.
  const [discardedPieces, setDiscardedPieces] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
  // Один факт мира читают независимо все популяции: человек не может забрать
  // хлопок из очереди раньше будущей пантеры или дракона.
  const creatureAcousticEvents = useMemo(
    () => new CreatureEventJournal<AcousticEvent>(128),
    [],
  );
  // Непрерывное присутствие отдельно от событий. Каждый вид сам решает,
  // считать ли вооружённого игрока угрозой и как на него отвечать.
  const creatureDangerousPresence = useRef<CreaturePresence | null>(null);
  const nightRef = useRef(0);
  const worldTimeRef = useRef(TIME_OF_DAY_TARGETS.day);
  const mutablePieceStates = useRef(new Map<string, MutablePieceVisualState>());
  const creatureWorld = useMemo<CreatureWorldRuntime>(
    () => ({
      time: {
        dayFraction: worldTimeRef,
        night: nightRef,
      },
      geometry: {
        pieces: breakablePieces,
        removedPieceIds: brokenPiecesRef,
      },
      stimuli: {
        acoustic: creatureAcousticEvents,
        dangerousPresence: creatureDangerousPresence,
      },
    }),
    [breakablePieces, creatureAcousticEvents],
  );
  const breakableRaycastRoot = useRef<Group>(null);
  const pieceBodies = useRef(new Map<string, RapierRigidBody>());
  const bodyIdByHandle = useRef(new Map<number, string>());
  // One authoritative contact carrier and one momentum inbox per compound.
  // Weapons may enqueue before the custom vehicle integrator runs its next
  // fixed step; no Rapier dynamic-body surrogate is involved.
  const compoundKinematicClusters = useRef(
    new Map<string, CompoundKinematicClusterRuntime>(),
  );
  const compoundKinematicImpulses = useRef(
    new Map<string, CompoundKinematicImpulse[]>(),
  );
  const compoundClusterDefinitions = useMemo(() => {
    const available = new Set(breakablePieces.map((piece) => piece.clusterId));
    // Поезд и airborne-кадры — свои списки; дорожная машина — третий такой
    // же владелец составного тела, не ветка VehicleFrameSystem.
    return [
      ...astanaTrainClusterDefinitions(),
      ...constantRotorClusterDefinitions(scene.constantRotorDefinitions),
      ...vehicleFrames,
      townDsClusterDefinition(),
    ].filter((definition) => available.has(definition.clusterId));
  }, [breakablePieces, scene.constantRotorDefinitions]);
  /**
   * Кто из кусков — член составного кластера. Такие куски авторятся в
   * системе координат кластера и СУДЯТСЯ в ней же: любой урон обязан
   * переводить точку удара текущей позой тела кластера, а не верить
   * авторской позиции («призраку» на стоянке).
   */
  const compoundOwnedPieceClusters = useMemo(() => {
    const owned = new Map<string, string>();
    const definitionByCluster = new Map(
      compoundClusterDefinitions.map(
        (definition) => [definition.clusterId, definition] as const,
      ),
    );
    for (const piece of breakablePieces) {
      const definition = definitionByCluster.get(piece.clusterId);
      if (definition && compoundClusterOwnsPiece(definition, piece)) {
        owned.set(piece.id, piece.clusterId);
      }
    }
    return owned;
  }, [breakablePieces, compoundClusterDefinitions]);
  const compoundMemberPiecesByCluster = useMemo(() => {
    const byCluster = new Map<string, BreakablePieceDefinition[]>();
    for (const piece of breakablePieces) {
      if (compoundOwnedPieceClusters.get(piece.id) !== piece.clusterId) {
        continue;
      }
      const members = byCluster.get(piece.clusterId);
      if (members) {
        members.push(piece);
      } else {
        byCluster.set(piece.clusterId, [piece]);
      }
    }
    return byCluster;
  }, [breakablePieces, compoundOwnedPieceClusters]);
  // The user's machine gun already resolves authored pieces through a spatial
  // index after Rapier has found the occupied area. Moving compound carriers
  // need the same index in their authored frame: transform the ray, do not
  // traverse every render batch in the world.
  const compoundMemberIndexByCluster = useMemo(
    () =>
      new Map(
        [...compoundMemberPiecesByCluster].map(([clusterId, members]) => [
          clusterId,
          createBreakablePieceIndex(members),
        ]),
      ),
    [compoundMemberPiecesByCluster],
  );
  /** Авторский габарит кластера — дешёвая отсечка дальних взрывов. */
  const compoundClusterBounds = useMemo(() => {
    const bounds = new Map<
      string,
      { readonly centre: SceneVector3; readonly radius: number }
    >();
    for (const [clusterId, members] of compoundMemberPiecesByCluster) {
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (const member of members) {
        sumX += member.position[0];
        sumY += member.position[1];
        sumZ += member.position[2];
      }
      const centre: SceneVector3 = [
        sumX / members.length,
        sumY / members.length,
        sumZ / members.length,
      ];
      let radius = 0;
      for (const member of members) {
        radius = Math.max(
          radius,
          Math.hypot(
            member.position[0] - centre[0],
            member.position[1] - centre[1],
            member.position[2] - centre[2],
          ) +
            Math.hypot(...member.size) / 2,
        );
      }
      bounds.set(clusterId, { centre, radius });
    }
    return bounds;
  }, [compoundMemberPiecesByCluster]);
  /** Живая система координат кластера; null — кластер не смонтирован. */
  const liveCompoundFrame = useCallback(
    (
      clusterId: string,
    ): {
      readonly runtime: CompoundKinematicClusterRuntime;
      readonly transform: CompoundClusterWorldTransform;
    } | null => {
      const runtime = compoundKinematicClusters.current.get(clusterId);
      return runtime
        ? { runtime, transform: compoundClusterWorldTransform(runtime.body) }
        : null;
    },
    [],
  );
  /** Система координат кластера-владельца куска, если кластер смонтирован. */
  const liveCompoundFrameOfPiece = useCallback(
    (pieceId: string) => {
      const clusterId = compoundOwnedPieceClusters.get(pieceId);
      return clusterId ? liveCompoundFrame(clusterId) : null;
    },
    [compoundOwnedPieceClusters, liveCompoundFrame],
  );
  /** Живая система носителя для отметин повреждения. */
  const decalCarrierFrameOf = useCallback(
    (clusterId: string) => {
      const frame = liveCompoundFrame(clusterId);
      return frame
        ? {
            origin: frame.runtime.definition.origin,
            position: frame.transform.position,
            quaternion: frame.transform.rotation,
          }
        : null;
    },
    [liveCompoundFrame],
  );
  /** То же для любой цели урона: кусок или его обрубок. */
  const liveCompoundFrameOfTarget = useCallback(
    (targetId: string) => {
      const remnant = remnantById.current.get(targetId);
      if (remnant) {
        return remnant.clusterId && !remnant.detached
          ? liveCompoundFrame(remnant.clusterId)
          : null;
      }
      return liveCompoundFrameOfPiece(targetId);
    },
    [liveCompoundFrame, liveCompoundFrameOfPiece],
  );
  const dynamicBodies = useRef(new Map<string, RapierRigidBody>());
  const pendingBodyActions = useRef(new Map<string, BodyAction[]>());
  const preStepMotions = useRef(new Map<string, ImpactMotion>());
  const debrisSoundByBody = useRef(new Map<string, number>());
  const physicsStep = useRef(0);
  const debrisSettlingUntilStep = useRef(new Map<string, number>());
  /** Круговой курсор по очереди на проверку: бюджет достаётся всем по разу. */
  const debrisActivationCursor = useRef(0);
  const lastContactStepByBody = useRef(new Map<string, Map<number, number>>());
  const contactDamageAfterStep = useRef(new Map<string, number>());
  const dynamicStartedStep = useRef(new Map<string, number>());
  /**
   * Замер покоя: где кусок был на прошлом взгляде. Покой меряется СМЕЩЕНИЕМ,
   * потому что сцепленная куча дрожит и по энергии не успокаивается никогда
   * (`debrisRestDecision`).
   */
  const restSamples = useRef(
    new Map<string, { step: number; x: number; y: number; z: number }>(),
  );
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
  const runtimeStructureCache = useRef<{
    readonly carved: ReadonlySet<string>;
    readonly remnants: readonly RemnantDefinition[];
    readonly scope: ReadonlySet<string>;
    readonly resolver: RuntimeStructureResolver;
  } | null>(null);
  const tracerRuntime = useRef<TracerRuntime | null>(null);
  const projectileRuntime = useRef<ProjectileRuntime | null>(null);
  const projectileThreats = useRef(new Map<number, RocketThreat>());
  const machineGunImpactRuntime = useRef<MachineGunImpactRuntime | null>(null);
  const explosionFxRuntime = useRef<ExplosionFxRuntime | null>(null);
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
  const resolveExplosionDebrisProfile = useCallback(
    (id: string): ExplosionDebrisProfile | null => {
      const source =
        shardById.current.get(id) ??
        remnantById.current.get(id) ??
        breakablePieceById.get(id);
      if (!source) return null;
      return {
        material: source.material,
        volume:
          source.volume ?? source.size[0] * source.size[1] * source.size[2],
      };
    },
    [breakablePieceById],
  );
  /**
   * ЛЬГОТА ОСТАЛАСЬ ТОЛЬКО У КУСКА МАШИНЫ.
   *
   * Мировой обломок сталкивается с себе подобными С РОЖДЕНИЯ. Льгота была
   * придумана против толчка при рождении, но платили за неё не толчком, а
   * взаимопроникновением: пока кусок призрак, он проваливается сквозь соседей
   * и садится в кучу уже вложенным. Замер на обвале целой хрущёвки — пар с
   * проникновением глубже сантиметра: с льготой 3461, с рождения 883.
   * Расталкивать пару дёшево, пока она в воздухе и свободна; в зажатой куче
   * это не удаётся уже никакой ценой.
   *
   * У члена машины выбора нет: он рождается ВНУТРИ её оболочки (11–27
   * коллайдеров носителя на кусок), и без льготы солвер выталкивает его
   * вместе с машиной. Ему — `DEBRIS_LEAVING_CARRIER` и ворота.
   *
   * Осколки (`shardById`) кластера не несут и потому всегда мировые: мелкая
   * стружка из машины и так вылетает наружу.
   */
  const debrisBirthGroupFor = useCallback(
    (id: string): number => {
      const clusterId =
        breakablePieceById.get(id)?.clusterId ??
        remnantById.current.get(id)?.clusterId;
      return clusterId && vehicleFrameForCluster(clusterId)
        ? DEBRIS_LEAVING_CARRIER
        : DEBRIS_NORMAL;
    },
    [breakablePieceById],
  );
  const carveWorker = useRef<Worker | null>(null);
  const carveJobs = useRef(
    new Map<number, (response: CarveKernelResponse | null) => void>(),
  );
  const pendingBulletCarves = useRef(
    new Map<string, PendingBulletCarveBatch>(),
  );
  const bulletCarvesInFlight = useRef(new Set<string>());
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
    // Луч по ВСЕЙ рендер-сцене: называет объект в пикселе (NDC), когда
    // «что-то чёрное в небе» не отвечает ни физике, ни breakables.
    (window as Window & {
      __mamSceneProbe?: (ndcX: number, ndcY: number) => unknown;
    }).__mamSceneProbe = (ndcX: number, ndcY: number) => {
      const probeRaycaster = new Raycaster();
      probeRaycaster.setFromCamera(
        new Vector2(ndcX, ndcY),
        camera,
      );
      probeRaycaster.far = 5000;
      probeRaycaster.layers.enableAll();
      const hits = probeRaycaster.intersectObject(threeScene, true);
      return hits.slice(0, 6).map((hit) => ({
        distance: +hit.distance.toFixed(2),
        name: hit.object.name || hit.object.type,
        material:
          (Array.isArray((hit.object as { material?: unknown }).material)
            ? "array"
            : ((hit.object as { material?: { name?: string; type?: string } })
                .material?.name ||
              (hit.object as { material?: { type?: string } }).material
                ?.type)) ?? null,
        visible: hit.object.visible,
        renderOrder: hit.object.renderOrder,
      }));
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
    // Сколько раз подряд игрок УЖЕ оказался там, куда его просили.
    //
    // Одного успешного вызова мало: первые сорок шагов после входа контроллер
    // принудительно держит игрока на точке спавна, и телепорт, сработавший в
    // это окно, честно возвращал `true` и тут же затирался. Команда молча
    // считалась выполненной, а игрок оставался на месте — и снять кадр в
    // нужной точке было нельзя.
    let teleportSettled = 0;
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
          if ([x, y, z].every(Number.isFinite)) {
            const playerBody = pieceBodies.current.get("player");
            const at = playerBody?.translation();
            const stuck =
              at !== undefined &&
              Math.hypot(at.x - x, at.y - y, at.z - z) < 0.75;
            teleportSettled = stuck ? teleportSettled + 1 : 0;
            if (!stuck) {
              teleport(x, y, z);
            }
            // Команда считается выполненной, только когда позиция УДЕРЖАЛАСЬ
            // несколько опросов подряд: иначе её съедает удержание на спавне.
            if (teleportSettled >= 3) {
              handledTeleportRequest = teleportRequest;
              if (!automaticProbe && timer !== undefined) {
                window.clearInterval(timer);
                timer = undefined;
              }
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
        const previousBody = pieceBodies.current.get(id);
        if (previousBody && previousBody.handle !== body.handle) {
          bodyIdByHandle.current.delete(previousBody.handle);
        }
        pieceBodies.current.set(id, body);
        bodyIdByHandle.current.set(body.handle, id);
        if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
          dynamicBodies.current.set(id, body);
          if (!dynamicStartedStep.current.has(id)) {
            dynamicStartedStep.current.set(id, physicsStep.current);
            contactDamageAfterStep.current.set(
              id,
              physicsStep.current + DEBRIS_CONTACT_GRACE_STEPS,
            );
            const birthGroup = debrisBirthGroupFor(id);
            // В очередь ворот встают только те, у кого есть льгота: сегодня
            // это ровно куски машин. Мировой обломок вооружён сразу и
            // спрашивать о нём нечего.
            if (birthGroup === DEBRIS_LEAVING_CARRIER) {
              debrisSettlingUntilStep.current.set(
                id,
                physicsStep.current + DEBRIS_SETTLE_STEPS,
              );
            }
            const colliderCount = body.numColliders();
            for (let index = 0; index < colliderCount; index += 1) {
              const collider = body.collider(index);
              if (collider.collisionGroups() !== DEBRIS_ACTOR_DETAIL) {
                collider.setCollisionGroups(birthGroup);
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
        const previousBody = pieceBodies.current.get(id);
        if (previousBody) {
          bodyIdByHandle.current.delete(previousBody.handle);
        }
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
    [debrisBirthGroupFor, rapier],
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
    let activationChecks = 0;
    const activationBudget =
      DEBRIS_ACTIVATION_CHECKS_PER_STEP[
        performanceGovernor.getSnapshot().physicsQuality
      ];
    // ЧЕРЁД, А НЕ ГОЛОВА КАРТЫ.
    //
    // Проверок за шаг отпущено 4/12/24, а `Map.set` по существующему ключу
    // порядок обхода не меняет. Прежний цикл шёл с начала карты и обрывался
    // по бюджету, поэтому при обвале в сотни кусков первые же претенденты
    // съедали бюджет каждый шаг, а хвост не проверялся вообще. Курсор бежит
    // по очереди и никого не оставляет голодным.
    const ready: string[] = [];
    for (const [id, readyStep] of debrisSettlingUntilStep.current) {
      if (physicsStep.current >= readyStep) {
        ready.push(id);
      }
    }
    let dynamicBodyHandles: Set<number> | null = null;
    let carrierBodyHandles: Set<number> | null = null;
    const start = ready.length > 0 ? debrisActivationCursor.current % ready.length : 0;
    for (
      let offset = 0;
      offset < ready.length && activationChecks < activationBudget;
      offset += 1
    ) {
      const id = ready[(start + offset) % ready.length];
      const body = dynamicBodies.current.get(id);
      if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        debrisSettlingUntilStep.current.delete(id);
        continue;
      }
      dynamicBodyHandles ??= new Set(
        [...dynamicBodies.current.values()].map(
          (candidate) => candidate.handle,
        ),
      );
      carrierBodyHandles ??= new Set(
        [...compoundKinematicClusters.current.values()].map(
          (runtime) => runtime.body.handle,
        ),
      );
      activationChecks += 1;
      // Заделан ли он в СВОЮ машину — вопрос отдельный от «заделан ли в
      // собрата»: у ответов разные последствия, и спрашиваются они порознь.
      const insideCarrier =
        carrierBodyHandles.size > 0 &&
        debrisBodyIsEmbedded(
          world,
          body,
          carrierBodyHandles,
          DEBRIS_ACTOR_DETAIL,
        );
      const embedded =
        insideCarrier ||
        debrisBodyIsEmbedded(
          world,
          body,
          dynamicBodyHandles,
          DEBRIS_ACTOR_DETAIL,
        );
      const startedStep = dynamicStartedStep.current.get(id) ?? physicsStep.current;
      const expired =
        physicsStep.current - startedStep >= DEBRIS_SETTLE_MAX_STEPS;
      if (embedded && !expired) {
        debrisSettlingUntilStep.current.set(
          id,
          physicsStep.current + DEBRIS_OVERLAP_RETRY_STEPS,
        );
        continue;
      }
      debrisSettlingUntilStep.current.delete(id);
      if (embedded) {
        // ПОТОЛОК ЗАКРЫВАЕТ ВОПРОС, А НЕ ВООРУЖАЕТ КУЧУ.
        //
        // Кусок, не разъехавшийся с СОБРАТЬЯМИ за три секунды, сидит в глубине
        // завала, и вооружать его нельзя: замер на обвале целой хрущёвки
        // (1192 куска) — безусловное вооружение поднимает шаг физики с 0.8 до
        // 15.7 мс и оставляет 750 тел, которые не засыпают никогда, потому что
        // такая связка в солвере не успокаивается. Ни размер порога, ни
        // разведение кусков на сборке, ни ограничение живой кучи этого не
        // меняли — это цена самой связки, а не ворот.
        //
        // Поэтому потолок отменяет только БЕСКОНЕЧНЫЙ ПЕРЕСПРОС: кусок
        // остаётся в льготной группе, но платить за вопрос о нём мы перестаём.
        // Прежний код переспрашивал вечно, и после обвала бюджет ворот был
        // занят под завязку до конца партии (23.5 проверки из 24 на шаг).
        //
        // Исключение — деталь, запертая в контуре СВОЕЙ машины и ни с кем
        // больше: она одна, куче не родня, и миру обязана быть препятствием.
        if (
          insideCarrier &&
          !debrisBodyIsEmbedded(
            world,
            body,
            dynamicBodyHandles,
            DEBRIS_ACTOR_DETAIL,
          )
        ) {
          const colliderCount = body.numColliders();
          for (let index = 0; index < colliderCount; index += 1) {
            const collider = body.collider(index);
            if (collider.collisionGroups() !== DEBRIS_ACTOR_DETAIL) {
              collider.setCollisionGroups(DEBRIS_INSIDE_CARRIER);
            }
          }
        }
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
    debrisActivationCursor.current += activationChecks;

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

  // ПОВИСШЕЕ КРЕПЛЕНИЕ.
  //
  // Отказ опоры не означает, что материал в месте контакта исчез: плита,
  // съехавшая с балки, ещё касается её краем, и постройка на этом краю
  // повисает. Кусок в этом состоянии — обычное динамическое тело со всей своей
  // физикой, но его центр привязан к уцелевшему шву; связь рвётся сама, когда
  // спрос на неё перерастает прочность шва (`attachmentTether.ts`).
  //
  // Точка крепления живёт в системе своего носителя: у постройки это мир, у
  // машины — её компаунд, и тогда панель висит на летящем корпусе, а не на
  // точке в воздухе, где корпус когда-то был.
  const tethers = useRef(
    new Map<
      string,
      {
        readonly anchor: TetherAnchor;
        readonly clusterId: string | null;
        /**
         * Шаг установки. Тело у отказавшего куска появляется не в тот же кадр:
         * состояние уходит в React, и динамику включает эффект. Без отсрочки
         * связь удалялась бы раньше, чем ей достанется тело, — и повисание не
         * случалось бы ни разу.
         */
        readonly installedStep: number;
      }
    >(),
  );
  const TETHER_BODY_GRACE_STEPS = 30;

  useAfterPhysicsStep(() => {
    if (tethers.current.size === 0) {
      return;
    }
    const step = Math.max(1e-4, world.timestep);
    for (const [id, held] of [...tethers.current]) {
      const body = dynamicBodies.current.get(id);
      if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) {
        if (
          physicsStep.current - held.installedStep >
          TETHER_BODY_GRACE_STEPS
        ) {
          tethers.current.delete(id);
        }
        continue;
      }
      let anchor = held.anchor;
      if (held.clusterId) {
        const frame = liveCompoundFrame(held.clusterId);
        if (!frame) {
          // Носитель перестал существовать — держаться больше не за что.
          tethers.current.delete(id);
          continue;
        }
        // Точка крепления живёт в системе носителя, и её собственная скорость
        // входит в вердикт: ровный полёт машины шов не нагружает, а рывок —
        // нагружает, и именно он его в конце концов и рвёт.
        const pivot = compoundClusterPointToWorld(
          frame.runtime.definition.origin,
          frame.transform,
          held.anchor.pivot,
        );
        anchor = {
          ...held.anchor,
          pivot,
          pivotVelocity: compoundClusterPointWorldVelocity(
            frame.runtime.body,
            pivot,
          ),
        };
      }

      const translation = body.translation();
      const linear = body.linvel();
      const result = stepTether(
        anchor,
        {
          position: [translation.x, translation.y, translation.z],
          linearVelocity: [linear.x, linear.y, linear.z],
        },
        Math.max(1e-6, body.mass()),
        step,
      );
      if (result.released) {
        tethers.current.delete(id);
        continue;
      }
      if (result.demand > 0) {
        body.setLinvel(
          {
            x: result.linearVelocity[0],
            y: result.linearVelocity[1],
            z: result.linearVelocity[2],
          },
          true,
        );
      }
    }
  });

  /**
   * Панель машины отрывается по ВНУТРЕННЕМУ шву — той своей грани, что
   * обращена к оси корпуса. Именно там она приварена, и именно там держится,
   * когда крепление уже отказало: дальше она отходит наружу и полощется на
   * ходу, пока шов не порвётся окончательно.
   *
   * Ложь возвращается, когда носителя нет: у куска без живого компаунда
   * держаться не за что, и он уходит прежним путём.
   */
  const hangVehiclePiece = useCallback(
    (piece: BreakablePieceDefinition): boolean => {
      const frame = liveCompoundFrameOfPiece(piece.id);
      if (!frame) {
        return false;
      }
      const origin = frame.runtime.definition.origin;
      const pivot = [0, 1, 2].map((axis) =>
        MathUtils.clamp(
          origin[axis],
          piece.position[axis] - piece.size[axis] / 2,
          piece.position[axis] + piece.size[axis] / 2,
        ),
      ) as [number, number, number];
      // Ось шва — та, вдоль которой панель вынесена от оси машины дальше
      // всего; площадь шва — её поперечное сечение по двум другим осям.
      const offsets = [0, 1, 2].map((axis) =>
        Math.abs(piece.position[axis] - origin[axis]),
      );
      const seamAxis = offsets.indexOf(Math.max(...offsets));
      const seamArea = [0, 1, 2]
        .filter((axis) => axis !== seamAxis)
        .reduce((area, axis) => area * piece.size[axis], 1);
      const capacity = hingeCapacity(
        seamArea,
        structuralMaterialProfiles[piece.material].compressionStrength,
      );
      if (!(capacity > 0)) {
        return false;
      }
      tethers.current.set(piece.id, {
        anchor: {
          pivot,
          length: Math.hypot(
            piece.position[0] - pivot[0],
            piece.position[1] - pivot[1],
            piece.position[2] - pivot[2],
          ),
          capacity,
        },
        clusterId: piece.clusterId,
        installedStep: physicsStep.current,
      });
      return true;
    },
    [liveCompoundFrameOfPiece],
  );

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
    for (const batch of pendingBulletCarves.current.values()) {
      if (batch.timer !== null) window.clearTimeout(batch.timer);
    }
    pendingBulletCarves.current.clear();
    bulletCarvesInFlight.current.clear();
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
    tracerRuntime.current?.clear();
    machineGunImpactRuntime.current?.clear();
    explosionFxRuntime.current?.clear();
    remnantsRef.current = [];
    remnantById.current.clear();
    remainingVolumeRef.current.clear();
    carvedPiecesRef.current.clear();
    discardedPiecesRef.current.clear();
    forcedStructureSeeds.current.clear();
    lastSettleSnapshot.current = null;
    runtimeStructureCache.current = null;
    firing.current = false;
    projectileRuntime.current?.clear();
    restSamples.current.clear();
    preStepMotions.current.clear();
    tethers.current.clear();
    superficialDamage.current.clear();
    surfaceDecalRuntime.current?.clear();
    pieceCraters.current.clear();
    setCrateredMeshes(new Map());
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
      restSamples.current.delete(id);
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

      // ВСТАВШИЙ КУСОК СТАНОВИТСЯ ЧАСТЬЮ МИРА, А НЕ ЗАСЫПАЕТ.
      //
      // Спящее тело дёшево, но не бесплатно, и главное — спящий остров
      // просыпается ЦЕЛИКОМ от любого касания: одна граната у завала
      // возвращала бы всю его цену. У `Fixed` степеней свободы нет вообще.
      // Обратный ход остаётся прежним и общим: `ensureDynamic` возвращает
      // кусок в динамику от удара, резки и взрыва.
      const translation = body.translation();
      const sample = restSamples.current.get(id);
      const travel = sample
        ? Math.hypot(
            translation.x - sample.x,
            translation.y - sample.y,
            translation.z - sample.z,
          )
        : null;
      const elapsed = sample ? physicsStep.current - sample.step : 0;
      if (
        travel !== null &&
        elapsed >= DEBRIS_REST_WINDOW_STEPS &&
        travel >= DEBRIS_REST_TRAVEL
      ) {
        // Ещё едет — пересэмплировать без единого запроса к контактам.
        restSamples.current.set(id, {
          step: physicsStep.current,
          x: translation.x,
          y: translation.y,
          z: translation.z,
        });
        continue;
      }
      let hasPhysicalContact = false;
      if (travel !== null && elapsed >= DEBRIS_REST_WINDOW_STEPS) {
        for (
          let colliderIndex = 0;
          colliderIndex < body.numColliders() && !hasPhysicalContact;
          colliderIndex += 1
        ) {
          world.contactPairsWith(body.collider(colliderIndex), () => {
            hasPhysicalContact = true;
          });
        }
      }
      const decision = debrisRestDecision(travel, elapsed, hasPhysicalContact);
      if (decision === "wait") {
        continue;
      }
      if (decision === "resample") {
        restSamples.current.set(id, {
          step: physicsStep.current,
          x: translation.x,
          y: translation.y,
          z: translation.z,
        });
        continue;
      }
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.enableCcd(false);
      body.setBodyType(rapier.RigidBodyType.Fixed, false);
      restSamples.current.delete(id);
      // Тело больше не динамическое: снять его со всех динамических учётов,
      // иначе оно продолжит стоить обходов, ради которых всё и делалось.
      dynamicBodies.current.delete(id);
      preStepMotions.current.delete(id);
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
      const hasRuntimeGeometry =
        [...carvedPiecesRef.current].some((id) => structuralScope.has(id)) ||
        remnantsRef.current.some((remnant) =>
          structuralScope.has(remnant.parentId),
        );
      let runtimeResolver: RuntimeStructureResolver | null = null;
      if (hasRuntimeGeometry) {
        const cached = runtimeStructureCache.current;
        const sameScope =
          cached?.scope.size === structuralScope.size &&
          [...structuralScope].every((id) => cached.scope.has(id));
        if (
          cached &&
          sameScope &&
          cached.carved === carvedPiecesRef.current &&
          cached.remnants === remnantsRef.current
        ) {
          runtimeResolver = cached.resolver;
        } else {
          runtimeResolver = createRuntimeStructureResolver(
            breakablePieces,
            structuralMaterialProfiles,
            carvedPiecesRef.current,
            remnantsRef.current,
            structuralScope,
          );
          runtimeStructureCache.current = {
            carved: carvedPiecesRef.current,
            remnants: remnantsRef.current,
            scope: structuralScope,
            resolver: runtimeResolver,
          };
        }
      }
      const resolveWithTreeCascade = (broken: ReadonlySet<string>) => {
        let cascaded = expandBrokenTreeDescendants(breakablePieces, broken);
        const resolve = (nextBroken: ReadonlySet<string>) =>
          runtimeResolver
            ? runtimeResolver.resolve(nextBroken)
            : {
                brokenPieceIds: resolveStructuralScope(
                  nextBroken,
                  structuralScope,
                ),
                detachedFragmentIds: new Set(
                  remnantsRef.current
                    .filter(
                      (remnant) =>
                        remnant.detached || nextBroken.has(remnant.parentId),
                    )
                    .map((remnant) => remnant.id),
                ),
                // Без обрубков решается ЦЕЛЫМИ кусками, и там привязи нет:
                // авторский кусок либо стоит, либо уходит целиком.
                tethersByPieceId: new Map<string, TetherAnchor>(),
              };
        let resolved = resolve(cascaded);
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
          resolved = resolve(cascaded);
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

        // ПОРОГ БЕРЁТСЯ ОТ МАТЕРИАЛА, А НЕ ОТ ГАБАРИТА — как и у второго
        // потребителя того же порога, subtractParentVolume. От bounding box
        // оболочка не могла пройти проверку никогда: пуля снимала 0.08 %
        // материала смока, а уцелевшие 99.9 % сравнивались с объёмом воздуха
        // внутри мельницы и объявлялись обломками. Кусок «терял крепления» от
        // любого касания, и всё, что на нём стояло, уходило каскадом.
        const originalVolume = pieceMaterialVolume(parent);
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
      // Кусок, отказавший рядом с тем, кто устоял, повисает на уцелевшем шве
      // вместо мгновенного отлёта. Привязь ставится ДО того, как обрубок
      // получит своё динамическое тело: тело родится уже привязанным.
      for (const [id, anchor] of result.tethersByPieceId) {
        if (tethers.current.has(id)) {
          continue;
        }
        tethers.current.set(id, {
          anchor,
          clusterId: null,
          installedStep: physicsStep.current,
        });
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

      const previousBroken = brokenPiecesRef.current;
      const brokenChanged =
        previousBroken.size !== result.brokenPieceIds.size ||
        [...result.brokenPieceIds].some((id) => !previousBroken.has(id));
      const settledBroken = brokenChanged
        ? result.brokenPieceIds
        : previousBroken;
      lastSettleSnapshot.current = {
        broken: settledBroken,
        carved: new Set(carvedPiecesRef.current),
        remnantParents: new Map(
          remnantsRef.current.map((remnant) => [remnant.id, remnant.parentId]),
        ),
      };
      brokenPiecesRef.current = settledBroken;
      if (brokenChanged) {
        setBrokenPieces(settledBroken);
        onBrokenCountChange(settledBroken.size);
      }
      return settledBroken;
    },
    [
      breakablePieceById,
      breakablePieces,
      onBrokenCountChange,
      resolveStructuralScope,
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
    const startedAt = performance.now();
    const merged = [...shardsRef.current, ...additions];
    // Вытеснение при переполнении: сначала осевшие и далёкие от игрока.
    // Удаление тела будит его контактный остров, поэтому чистый FIFO
    // заставлял дальний выстрел шевелить давно улёгшуюся кучу перед игроком.
    const playerTranslation = pieceBodies.current.get("player")?.translation();
    const trimmed = trimShardBudget(merged, undefined, undefined, {
      protectedNewest: additions.length,
      priority: (shard) => {
        const body = pieceBodies.current.get(shard.id);
        // «Осел» — это и уснувший, и ЗАМОРОЖЕННЫЙ: у `Fixed` isSleeping()
        // возвращает false, и без второй половины условия защита от вытеснения
        // доставалась бы всей куче разом, то есть никому. Но КИНЕМАТИКА не
        // оседает никогда: общий ответ и его цена — `bodySettled`.
        const settled =
          !body ||
          bodySettled(
            physicalBodyKind(body.bodyType(), rapier.RigidBodyType),
            body.isSleeping(),
          );
        const awakeBonus = settled ? 0 : 1_000_000;
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
    markActiveShotPerformance("commit_shards", performance.now() - startedAt, {
      additions: additions.length,
      total: trimmed.length,
    });
  }, [rapier]);

  const commitRemnants = useCallback(
    (removeId: string | null, additions: readonly RemnantDefinition[]) => {
      const startedAt = performance.now();
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
      markActiveShotPerformance(
        "commit_remnants",
        performance.now() - startedAt,
        { additions: additions.length, total: nextList.length },
      );
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

      const original = pieceMaterialVolume(parent);
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

      // Член составного кластера без собственного тела живёт в позе кластера:
      // осколки обязаны родиться там, где кусок ЛЕТИТ, и с его скоростью.
      const memberFrame =
        !body && staticPiece ? liveCompoundFrameOfPiece(staticPiece.id) : null;
      const memberPose = memberFrame
        ? compoundMemberWorldPose(
            memberFrame.runtime.definition.origin,
            memberFrame.transform,
            staticPiece!.position,
            staticPiece!.rotation,
          )
        : null;

      const translation = body?.translation();
      const rotation = body?.rotation();
      const linearVelocity = body?.linvel();
      const angularVelocity = body?.angvel();
      const bodyPosition = translation
        ? new Vector3(translation.x, translation.y, translation.z)
        : memberPose
          ? new Vector3(...memberPose.position)
          : new Vector3(...staticPiece!.position);
      const bodyQuaternion = rotation
        ? new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        : memberPose
          ? new Quaternion(...memberPose.quaternion)
          : new Quaternion().setFromEuler(
            new Euler(
              staticPiece!.rotation?.[0] ?? 0,
              staticPiece!.rotation?.[1] ?? 0,
              staticPiece!.rotation?.[2] ?? 0,
            ),
          );
      const bodyLinearVelocity = linearVelocity
        ? new Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z)
        : memberFrame && memberPose
          ? new Vector3(
              ...compoundClusterPointWorldVelocity(
                memberFrame.runtime.body,
                memberPose.position,
              ),
            )
          : new Vector3();
      const clusterAngular = memberFrame?.runtime.body.angvel();
      const bodyAngularVelocity = angularVelocity
        ? new Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
        : clusterAngular
          ? new Vector3(clusterAngular.x, clusterAngular.y, clusterAngular.z)
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
    [
      breakablePieceById,
      commitRemnants,
      commitShards,
      indestructible,
      liveCompoundFrameOfPiece,
      resolveDamageSource,
    ],
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
      physicalChipCount = 2,
      emitImpactBurst = true,
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
      const chipCount = Math.max(0, Math.min(2, Math.floor(physicalChipCount)));
      for (let index = 0; index < chipCount; index += 1) {
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

      if (emitImpactBurst) {
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
      }
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
      // У члена составного кластера авторская поза — это его поза в СИСТЕМЕ
      // КЛАСТЕРА, и ядро carve работает именно в ней. Точку удара переводит
      // туда вызывающий; здесь фиксируется только принадлежность.
      const clusterId = remnant
        ? (remnant.clusterId ?? null)
        : (compoundOwnedPieceClusters.get(targetId) ?? null);
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
        clusterId,
        isGroundTarget: groundMaterials.has(source.material),
        sourceRenderColor,
        treeVisualSourceId,
        bodyPosition,
        bodyQuaternion,
      };
    },
    [
      breakablePieceById,
      compoundOwnedPieceClusters,
      indestructible,
      intactGroundRenderColors,
      rapier,
    ],
  );

  // Запрос для воркера: тот же снимок цели, что у синхронного пути, но в
  // plain-данных. Соль отсчитывается здесь, чтобы шум разлома оставался
  // детерминированным независимо от того, кто исполнит ядро.
  const prepareCarveRequest = useCallback(
    (
      targetId: string,
      worldPoint: Vector3,
      radius: number,
      pushDirection: Vector3 | null = null,
      impactPointFrame: CarveImpactFrame = "world",
    ): CarveKernelRequest | null => {
      const target = resolveCarveTarget(targetId);
      if (!target) {
        return null;
      }
      // Ядро работает в авторской системе цели. Для члена летящего кластера
      // мировую точку переводит текущая поза его тела; точка, уже переведён-
      // ная вызывающим («cluster»), уходит в ядро как есть.
      let kernelPoint: readonly [number, number, number] = [
        worldPoint.x,
        worldPoint.y,
        worldPoint.z,
      ];
      if (target.clusterId && impactPointFrame === "world") {
        const frame = liveCompoundFrame(target.clusterId);
        if (frame) {
          kernelPoint = compoundClusterPointToLocal(
            frame.runtime.definition.origin,
            frame.transform,
            kernelPoint,
          );
        }
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
        worldPoint: kernelPoint,
        radius,
        direction: pushDirection
          ? [pushDirection.x, pushDirection.y, pushDirection.z]
          : undefined,
        penetration: pushDirection
          ? Math.min(0.85, Math.hypot(...target.source.size))
          : undefined,
      };
    },
    [liveCompoundFrame, resolveCarveTarget, resolveDamageSource],
  );

  const carveAt = useCallback(
    (
      targetId: string,
      worldPoint: Vector3,
      radius: number,
      pushDirection: Vector3 | null,
      physicalChipCount = 3,
      precomputed?: CarveKernelResponse,
      emitImpactBurst = true,
      impactPointFrame: CarveImpactFrame = "world",
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
        clusterId,
        isGroundTarget,
        sourceRenderColor,
        treeVisualSourceId,
        bodyPosition,
        bodyQuaternion,
      } = target;
      // Член кластера судится в системе кластера: ядру — точка в авторской
      // системе, а стружке и вспышке — настоящее мировое место удара и
      // скорость этой точки на корпусе.
      const clusterFrame = clusterId ? liveCompoundFrame(clusterId) : null;
      const kernelPoint =
        clusterFrame && impactPointFrame === "world"
          ? compoundClusterPointToLocal(
              clusterFrame.runtime.definition.origin,
              clusterFrame.transform,
              [worldPoint.x, worldPoint.y, worldPoint.z],
            )
          : ([worldPoint.x, worldPoint.y, worldPoint.z] as const);
      const debrisAnchor = clusterFrame
        ? compoundClusterPointToWorld(
            clusterFrame.runtime.definition.origin,
            clusterFrame.transform,
            kernelPoint,
          )
        : kernelPoint;
      const debrisVelocity = clusterFrame
        ? compoundClusterPointWorldVelocity(
            clusterFrame.runtime.body,
            debrisAnchor,
          )
        : ([0, 0, 0] as const);
      // Тот же источник урона, который уходит в ядро — и синхронно, и через
      // prepareCarveRequest в воркер. По нему же решается, привело ядро объём
      // обрубка к материалу само или отдало геометрию сетки.
      const damageSource = resolveDamageSource({
        ...source,
        renderColor: sourceRenderColor,
      });
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
          source: damageSource,
          position: [bodyPosition.x, bodyPosition.y, bodyPosition.z],
          quaternion: [
            bodyQuaternion.x,
            bodyQuaternion.y,
            bodyQuaternion.z,
            bodyQuaternion.w,
          ],
          idPrefix: `carve:${remnantCounter.current}`,
          worldPoint: kernelPoint,
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

      // ПРЕДСТАВЛЕНИЕ МЕНЯЕТСЯ ТОЛЬКО ТОГДА, КОГДА ИЗМЕНИЛАСЬ ФОРМА.
      //
      // Пуля в борт формы не меняет — она меняет поверхность, и переводить
      // ради неё авторскую сетку в сотню коробок значит стереть машину. Такой
      // удар остаётся на сетке: снаружи это пробоина с окалиной, внутри —
      // накопленная воксельная решётка, по которой следующее попадание уже
      // может расколоть кусок по-настоящему.
      //
      // Обрубок сюда не попадает: он и так набор коробок, беречь в нём нечего.
      const formQuery =
        piece !== undefined &&
        remnant === undefined &&
        damageSource.voxelBody !== undefined
          ? {
              radius,
              fragments,
              sourceSize: source.size,
              sourceCenter: [
                bodyPosition.x,
                bodyPosition.y,
                bodyPosition.z,
              ] as const,
              removedVolume,
              previouslyRemoved:
                superficialDamage.current.get(piece.id)?.removed ?? 0,
              materialVolume: pieceMaterialVolume(piece),
              tolerance: Math.max(...damageSource.voxelBody.cellSize),
            }
          : null;
      // Ступень первая: удар меньше, чем деталь толста, — отметина.
      const surfaceMark = formQuery !== null && isSuperficialCarve(formQuery);
      // Ступень вторая: дыра настоящая, но форму держит авторская сетка —
      // значит вырезаем дыру В НЕЙ, а не пересобираем кусок из коробок. Сюда
      // же попадает вся разница между плоской плитой и кривой оболочкой: закон
      // один, а результат разный, потому что разный вход.
      const cratered =
        formQuery !== null &&
        piece !== undefined &&
        !surfaceMark &&
        piece.visualMesh !== undefined &&
        (crateredMeshesRef.current.has(piece.id) ||
          crateredMeshesRef.current.size < MAXIMUM_CRATERED_PIECES) &&
        (pieceCraters.current.get(piece.id)?.length ?? 0) <
          MAXIMUM_CRATERS_PER_PIECE &&
        isSuperficialCarve({
          ...formQuery,
          maximumRadius: Number.POSITIVE_INFINITY,
          maximumRemovedFraction: FORM_PRESERVING_CARVE_FRACTION,
        });
      const superficial = surfaceMark || cratered;

      // ОБРУБОК НАСЛЕДУЕТ ВЕС СВОЕГО КУСКА, А НЕ СВОЙ ГАБАРИТ.
      //
      // Панели летающего кузова авторятся с ЗАНИЖЕННЫМ volume: лист обшивки
      // не весит как монолит стали того же габарита. Ядро carve считает
      // объём огрызка по воксельной сетке, то есть по геометрии, и без этой
      // поправки огрызок лёгкой панели оказывался тяжелее всей панели
      // целиком — корабль после дырки в борту весил больше исправного и
      // снимался с рейса «исчерпанным запасом подъёма».
      //
      // У скомпилированной оболочки ядро приводит объём САМО, и там поправка
      // равна единице: применённая вторым слоем, она занижала материал куска
      // в десятки раз.
      const authoredDensityScale = carvedMaterialScale(damageSource);
      const additions = superficial
        ? []
        : fragments.map((fragment): RemnantDefinition => {
        remnantCounter.current += 1;
        return {
          id: `remnant:${remnantCounter.current}`,
          parentId,
          clusterId: clusterId ?? undefined,
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
          volume:
            fragment.volume === undefined
              ? undefined
              : fragment.volume * authoredDensityScale,
        };
      });
      if (
        !superficial &&
        isGroundTarget &&
        groundCarveRequiresRemnant(source) &&
        (additions.length === 0 || removedVolume > sourceVolume * 0.38)
      ) {
        return { carved: false, brokenParentId: null };
      }

      if (superficial && piece) {
        // Форма прежняя: кусок остаётся собой, а повреждение копится в его
        // решётке и выходит наружу отметиной. Следующий удар работает уже по
        // этой решётке и может расколоть кусок по-настоящему.
        const carried = fragments[0];
        superficialDamage.current.set(piece.id, {
          voxelBody: carried.voxelBody ?? damageSource.voxelBody!,
          boxes: carried.boxes ?? damageSource.boxes ?? [],
          removed:
            (superficialDamage.current.get(piece.id)?.removed ?? 0) +
            removedVolume,
        });
        if (cratered) {
          // Кратер живёт в системе самого куска, в метрах от его центра: сетка
          // подрезается один раз и дальше ездит с куском любой позой.
          const local = new Vector3(...kernelPoint)
            .sub(bodyPosition)
            .applyQuaternion(bodyQuaternion.clone().invert());
          const craters = [
            ...(pieceCraters.current.get(piece.id) ?? []),
            {
              center: [local.x, local.y, local.z] as const,
              // Ядро сняло материал радиусом с поправкой на материал — дыра в
              // сетке обязана совпасть с тем, что действительно исчезло.
              radius: radius * damageRadiusScaleByMaterial[source.material],
            },
          ];
          pieceCraters.current.set(piece.id, craters);
          const clipped = clipPieceVisualMesh(piece, craters);
          if (clipped) {
            const next = new Map(crateredMeshesRef.current);
            next.set(piece.id, clipped);
            crateredMeshesRef.current = next;
            setCrateredMeshes(next);
          }
        } else {
        surfaceDecalRuntime.current?.spawn({
          sourceId: piece.id,
          point: kernelPoint,
          // Отметина смотрит НАВСТРЕЧУ удару и живёт в системе носителя: у
          // машины она едет с бортом, а не висит в точке, где борт был.
          normal: decalNormalInFrame(
            pushDirection && pushDirection.lengthSq() > 1e-8
              ? [
                  -pushDirection.x / pushDirection.length(),
                  -pushDirection.y / pushDirection.length(),
                  -pushDirection.z / pushDirection.length(),
                ]
              : [0, 1, 0],
            debrisAnchor,
            kernelPoint,
            clusterFrame,
          ),
          radius,
          material: source.material,
          clusterId,
        });
        }
      } else if (remnant) {
        commitRemnants(remnant.id, additions);
      } else {
        // Кусок всё-таки меняет форму: накопленная поверхностная решётка
        // больше его не описывает, и отметины на ней тоже.
        if (piece && superficialDamage.current.delete(piece.id)) {
          surfaceDecalRuntime.current?.dropSource(piece.id);
        }
        if (piece) dropPieceCraters(piece.id);
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
            debrisAnchor[0] + (noiseA - 0.5) * 0.1,
            debrisAnchor[1] + (noiseB - 0.5) * 0.1,
            debrisAnchor[2] + (noiseA - noiseB) * 0.1,
          ],
          quaternion: [0, 0, 0, 1],
          linearVelocity: [
            debrisVelocity[0] +
              (pushDirection?.x ?? 0) * 3 +
              (noiseA - 0.5) * 2.4,
            debrisVelocity[1] + 1.1 + noiseB * 1.5,
            debrisVelocity[2] +
              (pushDirection?.z ?? 0) * 3 +
              (noiseB - 0.5) * 2.4,
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

      if (emitImpactBurst) {
        burstId.current += 1;
        const nextBurstId = burstId.current;
        setBursts((current) => [
          ...current,
          {
            id: nextBurstId,
            position: [debrisAnchor[0], debrisAnchor[1], debrisAnchor[2]],
            direction: [0, 1, 0],
            material: source.material,
          },
        ]);
        playDebrisSound(source.material, 0.5);
      }

      const crossed = isGroundTarget
        ? false
        : subtractParentVolume(parentId, removedVolume);
      if (crossed && piece) {
        // Кусок исчерпал свой материал — его отметины уходят вместе с ним.
        superficialDamage.current.delete(piece.id);
        surfaceDecalRuntime.current?.dropSource(piece.id);
        dropPieceCraters(piece.id);
      }
      return { carved: true, brokenParentId: crossed ? parentId : null };
    },
    [
      commitRemnants,
      commitShards,
      liveCompoundFrame,
      resolveCarveTarget,
      resolveDamageSource,
      subtractParentVolume,
    ],
  );

  // Original pieces and carved remnants are solved by the same load-path graph.
  // Rapier only receives the fragments that this structural pass releases.
  const settleWorld = useCallback(() => {
    const startedAt = performance.now();
    settleStructure(brokenPiecesRef.current);
    markActiveShotPerformance(
      "structural_settle",
      performance.now() - startedAt,
      {
        brokenPieceCount: brokenPiecesRef.current.size,
        remnantCount: remnantsRef.current.length,
        shardCount: shardsRef.current.length,
      },
    );
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
        volume: piece.volume ?? piece.size[0] * piece.size[1] * piece.size[2],
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
          request.worldMassAdvantage,
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
          request.vehicleMassAdvantage,
        );
        if (verdict === "shatter") {
          breakPieces([vehiclePiece.id]);
          // Стекло лопается — ему нечем повисать. Силовая же панель рвётся не
          // вся сразу: внутренний шов держит её и после отказа, поэтому она
          // отходит от борта и полощется на нём, а уходит совсем только когда
          // шов не выдержит следующего рывка. Сыпать её осколками в этот
          // момент значило бы стереть саму фазу отрыва.
          const hung =
            vehiclePiece.material === "glass" ||
            vehiclePiece.material === "darkGlass"
              ? false
              : hangVehiclePiece(vehiclePiece);
          if (!hung) {
            shatterTarget(
              vehiclePiece,
              "piece",
              point,
              request.closingSpeed,
              "fall",
            );
          }
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
      hangVehiclePiece,
      indestructible,
      playImpactSound,
      settleWorld,
      shatterTarget,
    ],
  );

  const flushBulletCarve = useCallback(
    (targetId: string) => {
      const batch = pendingBulletCarves.current.get(targetId);
      if (!batch || batch.hits.length === 0) return;
      // Keep impacts that arrived while the worker owned the previous source
      // snapshot. They are remapped to the resulting remnants below instead
      // of being silently dropped from a sustained burst.
      if (bulletCarvesInFlight.current.has(targetId)) return;
      pendingBulletCarves.current.delete(targetId);
      if (batch.timer !== null) window.clearTimeout(batch.timer);

      const traceIds = [...new Set(batch.hits.map((hit) => hit.traceId))];
      for (const traceId of traceIds) {
        markShotPerformance(traceId, "carve_batch_flush", undefined, {
          targetId,
          hitCount: batch.hits.length,
        });
      }

      const last = batch.hits[batch.hits.length - 1];
      const point = new Vector3(...last.point);
      const direction = new Vector3(...last.direction);
      const preparationStartedAt = performance.now();
      const request = prepareCarveRequest(
        targetId,
        point,
        last.radius,
        direction,
      );
      if (!request) return;
      // Пачка попаданий идёт в ядро В СИСТЕМЕ ЦЕЛИ. У члена летящего кластера
      // это его авторская система: мировые точки очереди переводятся туда
      // текущей позой тела, иначе ядро режет мимо (пуля не берёт машину,
      // пока та не стоит ровно на своей стоянке).
      const targetFrame = liveCompoundFrameOfTarget(targetId);
      const toTargetFrame = (
        worldPoint: readonly [number, number, number],
      ): readonly [number, number, number] =>
        targetFrame
          ? compoundClusterPointToLocal(
              targetFrame.runtime.definition.origin,
              targetFrame.transform,
              worldPoint,
            )
          : worldPoint;
      const coalescedRequest: CarveKernelRequest = {
        ...request,
        impacts: batch.hits.map((hit) => ({
          worldPoint: toTargetFrame(hit.point),
          radius: hit.radius,
          direction: hit.direction,
          penetration: request.penetration,
        })),
      };
      for (const traceId of traceIds) {
        markShotPerformance(
          traceId,
          "carve_request_prepare",
          performance.now() - preparationStartedAt,
        );
      }
      const epoch = blastEpoch.current;
      bulletCarvesInFlight.current.add(targetId);
      const kernelStartedAt = performance.now();
      const applyResult = (response: CarveKernelResponse | null) => {
        bulletCarvesInFlight.current.delete(targetId);
        if (epoch !== blastEpoch.current) return;
        const resolved = response ?? executeCarveKernel(coalescedRequest);
        for (const traceId of traceIds) {
          markShotPerformance(
            traceId,
            response ? "carve_worker_round_trip" : "carve_kernel_sync",
            performance.now() - kernelStartedAt,
            resolved.telemetry,
          );
        }
        const publicationStartedAt = performance.now();
        const carve = carveAt(
          targetId,
          point,
          last.radius,
          direction,
          0,
          resolved,
          false,
        );
        for (const traceId of traceIds) {
          markShotPerformance(
            traceId,
            "carve_state_publication",
            performance.now() - publicationStartedAt,
            {
              carved: carve.carved,
              fragmentCount: resolved.fragments?.length ?? 0,
              fragmentBoxCount:
                resolved.fragments?.reduce(
                  (sum, fragment) => sum + (fragment.boxes?.length ?? 1),
                  0,
                ) ?? 0,
            },
          );
        }
        if (!carve.carved) return;
        const glassParentId =
          last.material === "glass" ? (last.pieceId ?? last.parentId) : null;
        const brokenParentId = glassParentId ?? carve.brokenParentId;
        if (brokenParentId) {
          breakPieces([brokenParentId]);
        } else {
          settleWorld();
        }

        const deferred = pendingBulletCarves.current.get(targetId);
        if (deferred?.hits.length) {
          pendingBulletCarves.current.delete(targetId);
          if (deferred.timer !== null) window.clearTimeout(deferred.timer);
          const parentId = last.parentId ?? last.pieceId ?? targetId;
          const candidates = remnantsRef.current.filter(
            (remnant) => remnant.parentId === parentId && !remnant.detached,
          );
          const remapped = new Map<string, PendingBulletCarveHit[]>();
          for (const hit of deferred.hits) {
            const hitPoint = new Vector3(...hit.point);
            let nearest: RemnantDefinition | null = null;
            let nearestDistanceSq = Number.POSITIVE_INFINITY;
            for (const candidate of candidates) {
              const candidatePosition = new Vector3(...candidate.position);
              const candidateQuaternion = new Quaternion(
                ...candidate.quaternion,
              );
              const closest = closestPointOnOccupiedGeometry(
                hitPoint,
                candidatePosition,
                candidate.size,
                candidateQuaternion,
                candidate.boxes,
              );
              const distanceSq = closest.distanceToSquared(hitPoint);
              if (distanceSq < nearestDistanceSq) {
                nearest = candidate;
                nearestDistanceSq = distanceSq;
              }
            }
            if (!nearest) {
              markShotPerformance(hit.traceId, "carve_deferred_target_gone");
              continue;
            }
            const nextHit: PendingBulletCarveHit = {
              ...hit,
              pieceId: null,
              parentId,
            };
            const hits = remapped.get(nearest.id);
            if (hits) hits.push(nextHit);
            else remapped.set(nearest.id, [nextHit]);
          }
          for (const [remnantId, hits] of remapped) {
            pendingBulletCarves.current.set(remnantId, {
              hits,
              timer: null,
            });
            for (const hit of hits) {
              markShotPerformance(
                hit.traceId,
                "carve_deferred_remapped",
                undefined,
                {
                  fromTargetId: targetId,
                  toTargetId: remnantId,
                },
              );
            }
            window.setTimeout(() => flushBulletCarve(remnantId), 0);
          }
        }
      };
      const worker = carveWorker.current;
      if (!worker) {
        applyResult(executeCarveKernel(coalescedRequest));
        return;
      }
      for (const traceId of traceIds) {
        markShotPerformance(traceId, "carve_worker_post");
      }
      carveJobs.current.set(request.requestId, applyResult);
      worker.postMessage(coalescedRequest);
    },
    [
      breakPieces,
      carveAt,
      liveCompoundFrameOfTarget,
      prepareCarveRequest,
      settleWorld,
    ],
  );

  const queueBulletCarve = useCallback(
    (targetId: string, hit: PendingBulletCarveHit) => {
      let batch = pendingBulletCarves.current.get(targetId);
      if (!batch) {
        batch = { hits: [], timer: null };
        pendingBulletCarves.current.set(targetId, batch);
      }
      batch.hits.push(hit);
      markShotPerformance(hit.traceId, "carve_enqueued", undefined, {
        targetId,
        batchSize: batch.hits.length,
      });
      if (bulletCarvesInFlight.current.has(targetId)) {
        markShotPerformance(hit.traceId, "carve_deferred_in_flight");
        return;
      }
      const maximumHits =
        hit.material === "glass" ? 1 : MG_CARVE_BATCH_MAX_HITS;
      if (batch.hits.length >= maximumHits) {
        flushBulletCarve(targetId);
        return;
      }
      if (batch.timer === null) {
        batch.timer = window.setTimeout(
          () => flushBulletCarve(targetId),
          MG_CARVE_BATCH_LATENCY_MS,
        );
      }
    },
    [flushBulletCarve],
  );

  const flushAllBulletCarves = useCallback(() => {
    for (const targetId of [...pendingBulletCarves.current.keys()]) {
      flushBulletCarve(targetId);
    }
  }, [flushBulletCarve]);

  /**
   * ОДИН ТРАКТ ПУШЕЧНОГО ВЫСТРЕЛА, ОТКУДА БЫ ОН НИ ВЫШЕЛ.
   *
   * Без аргумента стреляет человек своим непробивающим боеприпасом. Бортовая
   * установка добавляет только паспорт снаряда; луч, поиск куска, импульс,
   * отверстие, трасса и звук остаются общими.
   */
  const fireRound = useCallback((mount?: {
    readonly origin: Vector3;
    readonly direction: Vector3;
    readonly projectile: CannonProjectileProfile;
  }) => {
    const shooterPosition = mount ? mount.origin : camera.position;
    const traceId = startShotPerformanceTrace();
    const gunshotStartedAt = performance.now();
    playGunshotSound();
    // Шумит ДУЛО, а не пуля: событие рождается там, где стоит стрелок.
    creatureAcousticEvents.publish({
      x: shooterPosition.x,
      y: shooterPosition.y,
      z: shooterPosition.z,
      level: GUNSHOT_NOISE_LEVEL,
      rise: GUNSHOT_NOISE_RISE,
    });
    markShotPerformance(
      traceId,
      "gunshot_audio",
      performance.now() - gunshotStartedAt,
    );
    mgShots.current += 1;

    const direction = mount
      ? mount.direction.clone().normalize()
      : camera.getWorldDirection(new Vector3());
    direction.x += (Math.random() - 0.5) * 0.024;
    direction.y += (Math.random() - 0.5) * 0.024;
    direction.z += (Math.random() - 0.5) * 0.024;
    direction.normalize();
    const projectileRay = new rapier.Ray(
      { x: shooterPosition.x, y: shooterPosition.y, z: shooterPosition.z },
      { x: direction.x, y: direction.y, z: direction.z },
    );
    const playerBody = pieceBodies.current.get("player");
    const raycastStartedAt = performance.now();
    const physicsHit = world.castRayAndGetNormal(
      projectileRay,
      MG_RANGE,
      true,
      undefined,
      ACTOR_NORMAL,
      undefined,
      playerBody,
      (collider) => {
        const parent = collider.parent();
        const registeredId = parent
          ? bodyIdByHandle.current.get(parent.handle)
          : undefined;
        if (registeredId) {
          if (registeredId === "player") return false;
          if (shardById.current.has(registeredId)) return true;
          if (remnantById.current.has(registeredId)) return true;
          return (
            breakablePieceById.has(registeredId) &&
            !carvedPiecesRef.current.has(registeredId) &&
            !shatteredPiecesRef.current.has(registeredId)
          );
        }
        // The boundary and safety floor contain actors but are not weapon
        // targets. Ordinary WORLD colliders and compound carriers still stop
        // the ray; the former is resolved back to an authored piece below.
        const groups = collider.collisionGroups();
        return groups !== WORLD_BOUNDARY && groups !== ACTOR_SAFETY_FLOOR;
      },
    );
    markShotPerformance(
      traceId,
      "physics_raycast",
      performance.now() - raycastStartedAt,
      { hit: physicsHit !== null },
    );
    type ShotHit = {
      readonly distance: number;
      readonly point: Vector3;
      readonly normal: Vector3;
      readonly data: BreakableHitData;
    };
    type CompoundShotRay = {
      readonly clusterId: string;
      readonly frame: NonNullable<ReturnType<typeof liveCompoundFrame>>;
      readonly index: BreakablePieceIndex;
      readonly origin: SceneVector3;
      readonly direction: SceneVector3;
    };
    let compoundShotRay: CompoundShotRay | null = null;
    const raycastCompound = (
      ray: CompoundShotRay,
      accept: (piece: BreakablePieceDefinition) => boolean,
    ): ShotHit | null => {
      const canonical = ray.index.raycast(
        ray.origin,
        ray.direction,
        MG_RANGE,
        accept,
      );
      if (!canonical) return null;
      const worldPoint = compoundClusterPointToWorld(
        ray.frame.runtime.definition.origin,
        ray.frame.transform,
        canonical.point,
      );
      const normalTip = compoundClusterPointToWorld(
        ray.frame.runtime.definition.origin,
        ray.frame.transform,
        [
          canonical.point[0] + canonical.normal[0],
          canonical.point[1] + canonical.normal[1],
          canonical.point[2] + canonical.normal[2],
        ],
      );
      return {
        distance: canonical.distance,
        point: new Vector3(...worldPoint),
        normal: new Vector3(
          normalTip[0] - worldPoint[0],
          normalTip[1] - worldPoint[1],
          normalTip[2] - worldPoint[2],
        ).normalize(),
        data: { pieceId: canonical.piece.id },
      };
    };
    let hit:
      | ShotHit
      | undefined;
    if (physicsHit) {
      const distance = physicsHit.timeOfImpact;
      const point = shooterPosition
        .clone()
        .addScaledVector(direction, distance);
      const normal = new Vector3(
        physicsHit.normal.x,
        physicsHit.normal.y,
        physicsHit.normal.z,
      );
      const parent = physicsHit.collider.parent();
      const registeredId = parent
        ? bodyIdByHandle.current.get(parent.handle)
        : undefined;
      let data: BreakableHitData | null = registeredId
        ? breakablePieceById.has(registeredId)
          ? { pieceId: registeredId }
          : shardById.current.has(registeredId)
            ? {
                shardId: registeredId,
                material: shardById.current.get(registeredId)?.material,
              }
            : remnantById.current.has(registeredId)
              ? {
                  remnantId: registeredId,
                  material: remnantById.current.get(registeredId)?.material,
                }
              : null
        : null;
      if (!data) {
        const compoundId = (
          parent?.userData as
            { readonly compoundKinematicCluster?: unknown } | undefined
        )?.compoundKinematicCluster;
        if (typeof compoundId === "string") {
          // Rapier has already selected the moving carrier. Resolve its exact
          // authored member in the carrier frame, through the same spatial
          // ray index used by the optimized player weapon path.
          const frame = liveCompoundFrame(compoundId);
          const index = compoundMemberIndexByCluster.get(compoundId);
          if (frame && index) {
            const authoredOrigin = compoundClusterPointToLocal(
              frame.runtime.definition.origin,
              frame.transform,
              [shooterPosition.x, shooterPosition.y, shooterPosition.z],
            );
            const authoredAhead = compoundClusterPointToLocal(
              frame.runtime.definition.origin,
              frame.transform,
              [
                shooterPosition.x + direction.x,
                shooterPosition.y + direction.y,
                shooterPosition.z + direction.z,
              ],
            );
            compoundShotRay = {
              clusterId: compoundId,
              frame,
              index,
              origin: authoredOrigin,
              direction: [
                authoredAhead[0] - authoredOrigin[0],
                authoredAhead[1] - authoredOrigin[1],
                authoredAhead[2] - authoredOrigin[2],
              ],
            };
            const canonical = raycastCompound(
              compoundShotRay,
              (candidate) =>
                frame.runtime.attachedMemberIds.has(candidate.id) &&
                !brokenPiecesRef.current.has(candidate.id) &&
                !shatteredPiecesRef.current.has(candidate.id),
            );
            data = canonical?.data ?? null;
            if (canonical) hit = canonical;
          }
        } else {
          const staticPiece = worldContactIndex.at(
            [point.x, point.y, point.z],
            0.45,
            (candidate) =>
              !brokenPiecesRef.current.has(candidate.id) &&
              !carvedPiecesRef.current.has(candidate.id) &&
              !shatteredPiecesRef.current.has(candidate.id),
          );
          data = staticPiece ? { pieceId: staticPiece.id } : null;
        }
      }
      if (!hit && data) {
        hit = { distance, point, normal, data };
      }
    }
    const fieldRayEnd = shooterPosition
      .clone()
      .add(direction.clone().multiplyScalar(MG_RANGE));
    const forceFieldStartedAt = performance.now();
    const fieldHit = forceFieldActive
      ? (basaltForceField.current?.intersectSegment(
          [shooterPosition.x, shooterPosition.y, shooterPosition.z],
          [fieldRayEnd.x, fieldRayEnd.y, fieldRayEnd.z],
        ) ?? null)
      : null;
    markShotPerformance(
      traceId,
      "force_field_intersection",
      performance.now() - forceFieldStartedAt,
      { hit: fieldHit !== null },
    );
    const fieldHitDistance = fieldHit
      ? Math.hypot(
          fieldHit.point[0] - shooterPosition.x,
          fieldHit.point[1] - shooterPosition.y,
          fieldHit.point[2] - shooterPosition.z,
        )
      : Number.POSITIVE_INFINITY;
    const projectile = mount?.projectile ?? PLAYER_CANNON_PROJECTILE;
    const penetratedSteel: {
      readonly targetId: string;
      readonly piece: BreakablePieceDefinition;
      readonly point: Vector3;
    }[] = [];

    // БРОНЕБОЙНЫЙ ЛУЧ НЕ ПЕРЕПРЫГИВАЕТ К СЛЕДУЮЩЕЙ ЦЕЛИ. Он последовательно
    // оплачивает каждый пересечённый стальной лист остатком одного и того же
    // паспортного пробития. После первого физического контакта поиск остаётся
    // в найденной зоне: у составной машины — в её авторском индексе, у мира —
    // в том же индексе, которым уже пользуется оптимизированный пулемёт игрока.
    if (
      projectile.kind === "armourPiercing" &&
      hit &&
      fieldHitDistance >= hit.distance
    ) {
      const consumed = new Set<string>();
      let steelCapacity =
        projectile.steelPenetration.steelThicknessAtNormal;
      const nextCanonicalHit = (afterDistance: number): ShotHit | null => {
        // Overlapping authored boxes may enter before the sheet just consumed.
        // The former render-ray path skipped those intersections by distance;
        // retain that ordering while keeping the search bounded to the index.
        for (let guard = 0; guard < 32; guard += 1) {
          const candidate = compoundShotRay
            ? raycastCompound(
                compoundShotRay,
                (piece) =>
                  !consumed.has(piece.id) &&
                  compoundShotRay!.frame.runtime.attachedMemberIds.has(
                    piece.id,
                  ) &&
                  !brokenPiecesRef.current.has(piece.id) &&
                  !shatteredPiecesRef.current.has(piece.id),
              )
            : (() => {
                const canonical = worldContactIndex.raycast(
                  [shooterPosition.x, shooterPosition.y, shooterPosition.z],
                  [direction.x, direction.y, direction.z],
                  MG_RANGE,
                  (piece) =>
                    !consumed.has(piece.id) &&
                    !brokenPiecesRef.current.has(piece.id) &&
                    !carvedPiecesRef.current.has(piece.id) &&
                    !shatteredPiecesRef.current.has(piece.id),
                );
                return canonical
                  ? {
                      distance: canonical.distance,
                      point: new Vector3(...canonical.point),
                      normal: new Vector3(...canonical.normal),
                      data: { pieceId: canonical.piece.id },
                    }
                  : null;
              })();
          if (!candidate) return null;
          const candidateId = candidate.data.pieceId;
          if (candidate.distance > afterDistance + 1e-3) return candidate;
          if (!candidateId) return null;
          consumed.add(candidateId);
        }
        return null;
      };

      while (hit && steelCapacity > 0) {
        const targetId =
          hit.data.pieceId ?? hit.data.shardId ?? hit.data.remnantId;
        const piece = hit.data.pieceId
          ? breakablePieceById.get(hit.data.pieceId)
          : undefined;
        const material = piece?.material ?? hit.data.material;
        if (
          !targetId ||
          !piece ||
          material !== "steel" ||
          piece.plateThickness === undefined
        ) {
          break;
        }
        const verdict = solveSteelPenetration(
          { steelThicknessAtNormal: steelCapacity },
          {
            plateThickness: piece.plateThickness,
            direction: [direction.x, direction.y, direction.z],
            normal: [hit.normal.x, hit.normal.y, hit.normal.z],
          },
        );
        if (!verdict.penetrates) break;

        penetratedSteel.push({ targetId, piece, point: hit.point.clone() });
        consumed.add(targetId);
        steelCapacity = verdict.residualThickness;

        const continuation = nextCanonicalHit(hit.distance);
        if (!continuation) {
          hit = undefined;
          break;
        }
        hit = continuation;
      }
    }

    const fieldIntercepts =
      fieldHit !== null && (!hit || fieldHitDistance < hit.distance);

    // У бортовой установки дульный срез УЖЕ известен — он и есть начало луча.
    const muzzle = mount
      ? shooterPosition.clone()
      : new Vector3(0.36, -0.26, -0.8)
          .applyQuaternion(camera.quaternion)
          .add(shooterPosition);
    const end = fieldIntercepts
      ? new Vector3(...fieldHit.point)
      : hit
        ? hit.point
        : fieldRayEnd;
    tracerRuntime.current?.spawn(
      [muzzle.x, muzzle.y, muzzle.z],
      [end.x, end.y, end.z],
    );

    for (const penetration of penetratedSteel) {
      const { piece, point, targetId } = penetration;
      machineGunImpactRuntime.current?.spawn(
        [point.x, point.y, point.z],
        [direction.x, direction.y, direction.z],
        "steel",
      );
      playDebrisSound("steel", 0.7);
      if (
        !brokenPiecesRef.current.has(piece.id) &&
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
      queueBulletCarve(targetId, {
        traceId,
        point: [point.x, point.y, point.z],
        direction: [direction.x, direction.y, direction.z],
        radius: AP_STEEL_HOLE_RADIUS,
        material: "steel",
        pieceId: piece.id,
        parentId: null,
      });
      markShotPerformance(traceId, "steel_penetration", undefined, {
        targetId,
        plateThickness: piece.plateThickness,
      });
    }

    if (fieldIntercepts) {
      const fieldImpactStartedAt = performance.now();
      basaltForceField.current?.hitCell(
        fieldHit.cellIndex,
        "machineGun",
        fieldHit.point,
      );
      markShotPerformance(
        traceId,
        "force_field_impact",
        performance.now() - fieldImpactStartedAt,
      );
      setShotPerformanceOutcome(traceId, "force_field");
      return;
    }

    if (!hit) {
      if (penetratedSteel.length > 0) {
        setShotPerformanceOutcome(traceId, "physical_object", {
          penetratedSteel: penetratedSteel.length,
          continuedToRangeLimit: true,
        });
      } else {
        setShotPerformanceOutcome(traceId, "miss");
      }
      return;
    }

    const hitData = hit.data;
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
      setShotPerformanceOutcome(traceId, "unresolved_physics_hit");
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
    setShotPerformanceOutcome(traceId, "physical_object", {
      targetId,
      material,
      fixed: isFixedTarget,
      loose: isLooseTarget,
      shape: piece?.shape ?? remnantDefinition?.shape ?? shardDefinition?.shape,
    });
    machineGunImpactRuntime.current?.spawn(
      [point.x, point.y, point.z],
      [direction.x, direction.y, direction.z],
      material,
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
      playDebrisSound("steel", 0.6);
      if (isDetachedTarget) {
        applyImpact(targetId, material, point, direction, 0.35);
      }
      return;
    }
    playDebrisSound(material, 0.45);

    const holeRadius = bulletHoleRadius[material];
    if (
      holeRadius &&
      isFixedTarget &&
      (piece !== undefined || remnantDefinition !== undefined)
    ) {
      queueBulletCarve(targetId, {
        traceId,
        point: [point.x, point.y, point.z],
        direction: [direction.x, direction.y, direction.z],
        radius: holeRadius,
        material,
        pieceId: pieceId ?? null,
        parentId: remnantDefinition?.parentId ?? null,
      });
      return;
    }

    // Metadata and live physics jointly cover the short mount/unmount gap:
    // a visible loose source remains damageable even before its body exists.
    if (!isLooseTarget) {
      return;
    }

    const looseRadius = bulletHoleRadius[material] ?? 0.2;
    let carvedLoose = false;
    const looseCarveStartedAt = performance.now();
    if (piece) {
      carvedLoose = carveLooseTarget(
        piece,
        "piece",
        point,
        looseRadius,
        1.6,
        direction,
        Math.min(0.85, Math.hypot(...piece.size)),
        0,
        false,
      );
    } else if (shardDefinition) {
      const terminalDebris =
        Math.max(...shardDefinition.size) <= looseRadius * 2.8 ||
        (shardDefinition.volume ??
          shardDefinition.size[0] *
            shardDefinition.size[1] *
            shardDefinition.size[2]) <=
          looseRadius ** 3 * 6;
      if (!terminalDebris) {
        carvedLoose = carveLooseTarget(
          shardDefinition,
          "shard",
          point,
          looseRadius,
          1.4,
          direction,
          Math.min(0.85, Math.hypot(...shardDefinition.size)),
          0,
          false,
        );
      }
    } else if (remnantDefinition) {
      carvedLoose = carveLooseTarget(
        remnantDefinition,
        "remnant",
        point,
        looseRadius,
        1.4,
        direction,
        Math.min(0.85, Math.hypot(...remnantDefinition.size)),
        0,
        false,
      );
    }

    if (carvedLoose) {
      markShotPerformance(
        traceId,
        "loose_target_carve",
        performance.now() - looseCarveStartedAt,
        { carved: true },
      );
      if (piece || remnantDefinition) {
        settleWorld();
      }
      return;
    }

    markShotPerformance(
      traceId,
      "loose_target_carve",
      performance.now() - looseCarveStartedAt,
      { carved: false },
    );

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
    compoundMemberIndexByCluster,
    forceFieldActive,
    liveCompoundFrame,
    queueBulletCarve,
    rapier,
    settleWorld,
    world,
    worldContactIndex,
  ]);

  const strikeEnd = useCallback(() => {
    firing.current = false;
    flushAllBulletCarves();
  }, [flushAllBulletCarves]);

  useEffect(() => {
    firing.current = false;
  }, [active, weapon]);

  // Automatic fire while the trigger is held.
  useFrame((_, delta) => {
    recordShotPerformanceFrame(delta);
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
    // Мир сообщает о вооружённом присутствии; каждый вид классифицирует его
    // сам. Нынешние люди не считают угрозой пустые руки и рабочий молот.
    creatureDangerousPresence.current =
      weapon === "none" || weapon === "hammer"
        ? null
        : { x: camera.position.x, z: camera.position.z };
  });

  const explodeAt = useCallback(
    (center3: Vector3, kind: ExplosiveKind = "grenade") => {
      // Снаряд — это данные: радиусы, энергия, импульс и бюджеты приходят
      // из его паспорта, а не из ветки «ракета или граната».
      const profile = explosiveProfile(kind);
      const blastRadius = profile.blastRadius;
      const blastPushRadius = profile.blastPushRadius;
      const energyAtDistance = (surfaceDistance: number) =>
        blastEnergyAtDistance(surfaceDistance, blastRadius, profile.damageEnergy);
      playExplosionSound();
      // Уровень хлопка — свойство боеприпаса, а не ветка «если граната».
      creatureAcousticEvents.publish({
        x: center3.x,
        y: center3.y,
        z: center3.z,
        level: profile.noiseLevel,
        rise: 0.95,
        // ВОЛНА — второй канал того же события. Скорости берутся ГОТОВЫМИ из
        // паспорта: житель — такой же человек, как игрок, и отшвыривает его
        // ровно тем же. Считать от массы нельзя — массы раздуты ×200.
        wave: {
          pushRadius: blastPushRadius,
          horizontal: profile.playerPush.horizontal,
          vertical: profile.playerPush.vertical,
        },
      });
      explosionId.current += 1;
      const nextExplosionId = explosionId.current;

      const previousBroken = new Set(brokenPiecesRef.current);
      const blastCenter = [center3.x, center3.y, center3.z] as const;
      const fieldTransmissionTo = (target: Vector3): number =>
        forceFieldTransmission(blastCenter, [target.x, target.y, target.z]);
      // Живые составные кластеры судятся в СВОЕЙ системе координат: их
      // куски исключаются из авторского отбора целиком — авторский «призрак»
      // машины на стоянке не получает урона и не заслоняет взрыв.
      const liveClusterFrames = new Map<
        string,
        {
          readonly runtime: CompoundKinematicClusterRuntime;
          readonly transform: CompoundClusterWorldTransform;
        }
      >();
      for (const [clusterId, runtime] of compoundKinematicClusters.current) {
        liveClusterFrames.set(clusterId, {
          runtime,
          transform: compoundClusterWorldTransform(runtime.body),
        });
      }
      const judgedInClusterFrame = (pieceId: string): boolean => {
        const clusterId = compoundOwnedPieceClusters.get(pieceId);
        return clusterId !== undefined && liveClusterFrames.has(clusterId);
      };
      const remnantJudgedInClusterFrame = (
        remnant: RemnantDefinition,
      ): boolean =>
        remnant.clusterId !== undefined &&
        liveClusterFrames.has(remnant.clusterId) &&
        !remnant.detached &&
        !previousBroken.has(remnant.parentId);
      const blastPieceCandidates = pieceSpatialIndex
        .querySphere(blastCenter, blastRadius + maxPieceBoundingRadius)
        .filter((piece) => !judgedInClusterFrame(piece.id));
      // Reuse the physical candidate query to shape the visual blast. Nearby
      // mass pushes the cheap particle field toward open space: a facade
      // vents outward, open ground vents upward, a free-air burst stays broad.
      const outward = new Vector3();
      const dustMix = new Color(0, 0, 0);
      const candidateColor = new Color();
      let directionalWeight = 0;
      let dustWeight = 0;
      for (const candidate of blastPieceCandidates) {
        const dx = center3.x - candidate.position[0];
        const dy = center3.y - candidate.position[1];
        const dz = center3.z - candidate.position[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance > blastRadius + maxPieceBoundingRadius) continue;
        const falloff = Math.max(0, 1 - distance / (blastRadius * 1.35));
        const volume =
          candidate.volume ??
          candidate.size[0] * candidate.size[1] * candidate.size[2];
        const weight = falloff * falloff * Math.min(2.5, Math.cbrt(volume));
        if (weight <= 0) continue;
        if (distance > 0.001) {
          const inverseDistance = weight / distance;
          outward.x += dx * inverseDistance;
          outward.y += dy * inverseDistance;
          outward.z += dz * inverseDistance;
        }
        directionalWeight += weight;
        candidateColor.set(
          materialRuntimeProfiles[candidate.material].dustColor,
        );
        dustMix.r += candidateColor.r * weight;
        dustMix.g += candidateColor.g * weight;
        dustMix.b += candidateColor.b * weight;
        dustWeight += weight;
      }
      const directionalSignal =
        directionalWeight > 0 ? outward.length() / directionalWeight : 0;
      outward.y += Math.max(0.12, directionalWeight * 0.08);
      if (outward.lengthSq() < 0.001) outward.set(0, 1, 0);
      outward.normalize();
      if (dustWeight > 0) {
        dustMix.multiplyScalar(1 / dustWeight);
      } else {
        dustMix.set(materialRuntimeProfiles.soil.dustColor);
      }
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
        ...remnantsRef.current
          .filter((remnant) => !remnantJudgedInClusterFrame(remnant))
          .map((remnant) => ({
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
      const blastOccluderIndex = createSegmentBoundsIndex(
        solidOccluders,
        (occluder) => ({
          center: [
            occluder.position.x,
            occluder.position.y,
            occluder.position.z,
          ],
          size: occluder.size,
          quaternion: [
            occluder.quaternion.x,
            occluder.quaternion.y,
            occluder.quaternion.z,
            occluder.quaternion.w,
          ],
        }),
      );
      const occludersAlong = (target: Vector3) =>
        blastOccluderIndex.candidatesAlong(blastCenter, [
          target.x,
          target.y,
          target.z,
        ]);

      // The blast field is sampled only to shape the compact cloud and find
      // short vents. It does not give the visible combustion the blast's full
      // radius: pressure may cross a building and blow out a far window while
      // the bright, opaque core remains close to the charge. Real frames and
      // debris displaced at the remote exit produce their own local dust.
      const visualLobes: ExplosionFxLobe[] = [];
      const visualDirectionCount = profile.visualDirections;
      const visualProbeDistance = Math.min(
        blastRadius * 1.05,
        profile.visualProbeDistance,
      );
      const visualTarget = new Vector3();
      for (let index = 0; index < visualDirectionCount; index += 1) {
        const sample = (index + 0.5) / visualDirectionCount;
        const sampleY = 1 - sample * 2;
        const sampleRadius = Math.sqrt(Math.max(0, 1 - sampleY * sampleY));
        const angle = index * 2.399963229728653;
        const sampleX = Math.cos(angle) * sampleRadius;
        const sampleZ = Math.sin(angle) * sampleRadius;
        visualTarget.set(
          center3.x + sampleX * visualProbeDistance,
          center3.y + sampleY * visualProbeDistance,
          center3.z + sampleZ * visualProbeDistance,
        );
        const transmission =
          blastVisibilityFactor(
            center3,
            visualTarget,
            "__explosion_fx__",
            "__explosion_fx__",
            visualProbeDistance,
            occludersAlong(visualTarget),
          ) * fieldTransmissionTo(visualTarget);
        visualLobes.push({
          direction: [sampleX, sampleY, sampleZ],
          weight: 0.015 + 0.985 * Math.pow(Math.max(0, transmission), 1.08),
          delay: (1 - Math.min(1, transmission)) * 0.11,
        });
      }
      if (directionalSignal > 0.1) {
        visualLobes.push({
          direction: [outward.x, outward.y, outward.z],
          weight: MathUtils.clamp(0.22 + directionalSignal, 0.22, 0.82),
          delay: 0,
        });
      }
      explosionFxRuntime.current?.spawn({
        id: nextExplosionId,
        kind,
        position: [center3.x, center3.y, center3.z],
        lobes: visualLobes,
        dustColor: [dustMix.r, dustMix.g, dustMix.b],
      });

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
            occludersAlong(impactPoint),
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
        const magnitude = profile.pressureImpulse * falloff * visibility;
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
      const staticDamageCandidates = indestructible
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
                  !remnantJudgedInClusterFrame(remnant) &&
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
                  occludersAlong(impactPoint),
                ) * fieldTransmissionTo(impactPoint);
              const energy = energyAtDistance(surfaceDistance) * visibility;
              return {
                ...target,
                impactPoint,
                surfaceDistance,
                visibility,
                energy,
                pointFrame: "world" as CarveImpactFrame,
              };
            })
            .filter(
              (entry): entry is NonNullable<typeof entry> =>
                entry !== null &&
                entry.energy >
                  fractureEnergyByMaterial[entry.source.material] * 1.15,
            );

      // ЧЛЕНЫ ЖИВЫХ КЛАСТЕРОВ. Судятся в системе своего кластера: центр
      // взрыва переводится текущей позой тела в авторскую систему, дистанции
      // при этом честны (твёрдое тело сохраняет расстояния). Окклюзию внутри
      // машины дают её собственные члены и обрубки; тень остального мира
      // считается по НАСТОЯЩЕМУ мировому лучу к фактическому месту куска.
      // Стоящая машина — частный случай с единичным переводом.
      const clusterDamageCandidates: {
        targetId: string;
        parentId: string;
        source: BreakablePieceDefinition | RemnantDefinition;
        impactPoint: Vector3;
        surfaceDistance: number;
        visibility: number;
        energy: number;
        pointFrame: CarveImpactFrame;
      }[] = [];
      if (!indestructible) {
        for (const [clusterId, frame] of liveClusterFrames) {
          const members = compoundMemberPiecesByCluster.get(clusterId);
          if (!members || members.length === 0) {
            continue;
          }
          const origin = frame.runtime.definition.origin;
          const virtualCenter = compoundClusterPointToLocal(
            origin,
            frame.transform,
            blastCenter,
          );
          const bounds = compoundClusterBounds.get(clusterId);
          if (bounds) {
            const reach = blastRadius + bounds.radius;
            const dx = virtualCenter[0] - bounds.centre[0];
            const dy = virtualCenter[1] - bounds.centre[1];
            const dz = virtualCenter[2] - bounds.centre[2];
            if (dx * dx + dy * dy + dz * dz > reach * reach) {
              continue;
            }
          }
          const virtualCenter3 = new Vector3(...virtualCenter);
          const localEntries: (BlastOccluder & {
            readonly source: BreakablePieceDefinition | RemnantDefinition;
          })[] = [];
          for (const member of members) {
            if (
              previousBroken.has(member.id) ||
              carvedPiecesRef.current.has(member.id) ||
              shatteredPiecesRef.current.has(member.id)
            ) {
              // Форму съеденного члена дают его обрубки ниже.
              continue;
            }
            const reach = blastRadius + Math.hypot(...member.size) / 2;
            const position = new Vector3(...member.position);
            if (virtualCenter3.distanceToSquared(position) > reach * reach) {
              continue;
            }
            const quaternion = new Quaternion().setFromEuler(
              new Euler(
                member.rotation?.[0] ?? 0,
                member.rotation?.[1] ?? 0,
                member.rotation?.[2] ?? 0,
              ),
            );
            const boxes = occupiedBoxesForBlast(resolveDamageSource(member));
            const impactPoint = closestPointOnOccupiedGeometry(
              virtualCenter3,
              position,
              member.size,
              quaternion,
              boxes,
            );
            const surfaceDistance = virtualCenter3.distanceTo(impactPoint);
            if (surfaceDistance >= blastRadius) {
              continue;
            }
            localEntries.push({
              id: member.id,
              parentId: member.id,
              source: member,
              material: member.material,
              position,
              quaternion,
              size: member.size,
              boxes,
              surfaceDistance,
            });
          }
          for (const remnant of remnantsRef.current) {
            if (
              remnant.clusterId !== clusterId ||
              !remnantJudgedInClusterFrame(remnant)
            ) {
              continue;
            }
            const reach = blastRadius + Math.hypot(...remnant.size) / 2;
            const position = new Vector3(...remnant.position);
            if (virtualCenter3.distanceToSquared(position) > reach * reach) {
              continue;
            }
            const quaternion = new Quaternion(...remnant.quaternion);
            const boxes = occupiedBoxesForBlast(remnant);
            const impactPoint = closestPointOnOccupiedGeometry(
              virtualCenter3,
              position,
              remnant.size,
              quaternion,
              boxes,
            );
            const surfaceDistance = virtualCenter3.distanceTo(impactPoint);
            if (surfaceDistance >= blastRadius) {
              continue;
            }
            localEntries.push({
              id: remnant.id,
              parentId: remnant.parentId,
              source: remnant,
              material: remnant.material,
              position,
              quaternion,
              size: remnant.size,
              boxes,
              surfaceDistance,
            });
          }
          if (localEntries.length === 0) {
            continue;
          }
          localEntries.sort(
            (left, right) => left.surfaceDistance - right.surfaceDistance,
          );
          const localOccluderIndex = createSegmentBoundsIndex(
            localEntries,
            (occluder) => ({
              center: [
                occluder.position.x,
                occluder.position.y,
                occluder.position.z,
              ],
              size: occluder.size,
              quaternion: [
                occluder.quaternion.x,
                occluder.quaternion.y,
                occluder.quaternion.z,
                occluder.quaternion.w,
              ],
            }),
          );
          for (const entry of localEntries) {
            const impactPoint = closestPointOnOccupiedGeometry(
              virtualCenter3,
              entry.position,
              entry.size,
              entry.quaternion,
              entry.boxes,
            );
            const worldImpact = compoundClusterPointToWorld(
              origin,
              frame.transform,
              [impactPoint.x, impactPoint.y, impactPoint.z],
            );
            const worldImpact3 = new Vector3(...worldImpact);
            const visibility =
              blastVisibilityFactor(
                virtualCenter3,
                impactPoint,
                entry.id,
                entry.parentId,
                entry.surfaceDistance,
                localOccluderIndex.candidatesAlong(virtualCenter, [
                  impactPoint.x,
                  impactPoint.y,
                  impactPoint.z,
                ]),
              ) *
              blastVisibilityFactor(
                center3,
                worldImpact3,
                entry.id,
                entry.parentId,
                entry.surfaceDistance,
                occludersAlong(worldImpact3),
              ) *
              fieldTransmissionTo(worldImpact3);
            const energy =
              energyAtDistance(entry.surfaceDistance) * visibility;
            if (
              energy <=
              fractureEnergyByMaterial[entry.material] * 1.15
            ) {
              continue;
            }
            clusterDamageCandidates.push({
              targetId: entry.id,
              parentId: entry.parentId,
              source: entry.source,
              impactPoint,
              surfaceDistance: entry.surfaceDistance,
              visibility,
              energy,
              pointFrame: "cluster",
            });
          }
        }
      }

      const sortedDamageCandidates = [
        ...staticDamageCandidates,
        ...clusterDamageCandidates,
      ].sort((left, right) => left.surfaceDistance - right.surfaceDistance);
      // Адаптивный бюджет вместо плоского slice(0, 80): в норме отбор
      // идентичен старому, но воксельные гиганты (земляные плиты двора)
      // больше не съедают кадр и не вытесняют настоящие цели из бюджета —
      // у грунта свой маленький срез работы.
      const attachedDamageCandidates = selectCarveTargetsWithinBudget(
        sortedDamageCandidates,
        (entry) => entry.source,
        profile.carveBudget,
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
      const physicsQuality = performanceGovernor.getSnapshot().physicsQuality;
      const chipBudgetScale = [0, 0.5, 1][physicsQuality];
      const chipState = {
        budget: Math.floor(profile.chipBudget * chipBudgetScale),
      };
      const loosePhysicalChipCount = [0, 1, 2][physicsQuality];
      for (const entry of attachedDamageCandidates) {
        carveSteps.push(() => {
          const damageRadius = impactDamageRadius(
            resolveDamageSource(entry.source),
            "blast",
            entry.energy,
          ) * profile.carveRadiusMultiplier;
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
            ? prepareCarveRequest(
                entry.targetId,
                entry.impactPoint,
                damageRadius,
                null,
                entry.pointFrame,
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
                undefined,
                true,
                entry.pointFrame,
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
                  true,
                  entry.pointFrame,
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
              occludersAlong(impactPoint),
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
                ) * profile.carveRadiusMultiplier,
                burstSpeed: Math.max(profile.looseBurstSpeed, energy * 0.72),
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
              undefined,
              undefined,
              loosePhysicalChipCount,
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
              occludersAlong(targetPosition),
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
                x: dx * inverse * profile.playerPush.horizontal * falloff * mass,
                y:
                  (dy * inverse + 0.8) *
                  profile.playerPush.vertical *
                  falloff *
                  mass,
                z: dz * inverse * profile.playerPush.horizontal * falloff * mass,
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
            profile.debrisPush.base + profile.debrisPush.falloff * falloff;
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
            occludersAlong(targetPosition),
          ) * fieldTransmissionTo(targetPosition);
        if (visibility < 0.04) {
          return;
        }
        const falloff = (1 - distance / blastPushRadius) * visibility;
        const inverse = 1 / Math.max(0.25, distance);
        const mass = Math.max(0.04, body.mass());
        body.applyImpulse(
          {
            x: dx * inverse * profile.playerPush.horizontal * falloff * mass,
            y:
              (dy * inverse + 0.8) * profile.playerPush.vertical * falloff * mass,
            z: dz * inverse * profile.playerPush.horizontal * falloff * mass,
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
      compoundClusterBounds,
      compoundMemberPiecesByCluster,
      compoundOwnedPieceClusters,
      configureDebrisCollision,
      drainBlastQueue,
      ensureDynamic,
      forceFieldTransmission,
      indestructible,
      maxPieceBoundingRadius,
      pieceSpatialIndex,
      prepareCarveRequest,
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
    // Пара к детонации: текущая поза составного кластера, чтобы headless
    // проверка могла целиться по ЛЕТЯЩЕЙ машине, а не по авторской стоянке.
    const clusterPose = (clusterId: string) => {
      const runtime = compoundKinematicClusters.current.get(clusterId);
      if (!runtime) {
        return null;
      }
      const translation = runtime.body.translation();
      const rotation = runtime.body.rotation();
      return {
        origin: runtime.definition.origin,
        position: [translation.x, translation.y, translation.z],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        attachedMembers: runtime.attachedMemberIds.size,
      };
    };
    scope.__mamClusterPose = clusterPose;
    // Детерминированный урон без оружия: сломать ИМЕННО этот кусок и увидеть
    // последствия (что ещё унесло каскадом, что сказала автоматика).
    const breakPiece = (pieceId: string) => {
      const piece = breakablePieceById.get(pieceId);
      if (!piece) {
        return null;
      }
      const before = brokenPiecesRef.current.size;
      breakPieces([pieceId]);
      return {
        pieceId,
        clusterId: piece.clusterId,
        brokenBefore: before,
        brokenAfter: brokenPiecesRef.current.size,
      };
    };
    const failures = () =>
      ((window as unknown as Record<string, unknown>)
        .__mamVehicleFailureLog as unknown[]) ?? [];
    scope.__mamBreakPiece = breakPiece;
    scope.__mamVehicleFailures = failures;
    // Перепись обломков по МЕСТУ: сколько тел стоит у авторской стоянки
    // машины и сколько рядом с ней самой. Отвечает на «почему куски
    // оказались дома» фактом, а не осмотром кадра.
    const debrisCensus = (clusterId: string, radius = 12) => {
      const runtime = compoundKinematicClusters.current.get(clusterId);
      if (!runtime) {
        return null;
      }
      const home = runtime.definition.origin;
      const translation = runtime.body.translation();
      const near = (
        x: number,
        y: number,
        z: number,
        point: readonly [number, number, number],
      ) =>
        Math.hypot(x - point[0], y - point[1], z - point[2]) <= radius;
      const buckets = {
        clusterId,
        home,
        machine: [translation.x, translation.y, translation.z],
        shardsAtHome: 0,
        shardsAtMachine: 0,
        remnantsCarried: 0,
        remnantsAtHome: 0,
        remnantsAtMachine: 0,
        homeKinds: {} as Record<string, number>,
        homeSamples: [] as string[],
        memberBodiesAtHome: [] as string[],
        memberBodiesAtMachine: 0,
      };
      const machinePoint = [
        translation.x,
        translation.y,
        translation.z,
      ] as const;
      for (const shard of shardsRef.current) {
        const body = pieceBodies.current.get(shard.id);
        const t = body?.translation();
        const p = t ? [t.x, t.y, t.z] : shard.position;
        if (near(p[0], p[1], p[2], home)) buckets.shardsAtHome += 1;
        else if (near(p[0], p[1], p[2], machinePoint))
          buckets.shardsAtMachine += 1;
      }
      for (const remnant of remnantsRef.current) {
        const body = pieceBodies.current.get(remnant.id);
        const t = body?.translation();
        // Носимый обрубок живёт в АВТОРСКИХ координатах кластера и рисуется
        // его позой — его «дом» не улика. Уликой является брошенный: у него
        // есть собственное тело, и стоять оно обязано у машины.
        const carried = Boolean(remnant.clusterId) && !body;
        if (carried) {
          buckets.remnantsCarried += 1;
          continue;
        }
        const p = t ? [t.x, t.y, t.z] : remnant.position;
        if (near(p[0], p[1], p[2], home)) {
          buckets.remnantsAtHome += 1;
          // Улика должна называть себя: с кластером или без, с телом или
          // без, отделён или нет — по этим четырём признакам видно, каким
          // именно путём обрубок оказался дома.
          const tag = `${remnant.clusterId ? "cluster" : "NOCLUSTER"}/${
            body ? "body" : "nobody"
          }/${remnant.detached ? "detached" : "attached"}`;
          buckets.homeKinds[tag] = (buckets.homeKinds[tag] ?? 0) + 1;
          if (buckets.homeSamples.length < 6) {
            buckets.homeSamples.push(`${remnant.id}<-${remnant.parentId}`);
          }
        } else if (near(p[0], p[1], p[2], machinePoint))
          buckets.remnantsAtMachine += 1;
      }
      for (const piece of breakablePieces) {
        if (piece.clusterId !== clusterId) continue;
        const body = pieceBodies.current.get(piece.id);
        const t = body?.translation();
        if (!t) continue;
        if (near(t.x, t.y, t.z, home)) {
          if (buckets.memberBodiesAtHome.length < 8) {
            buckets.memberBodiesAtHome.push(piece.id);
          }
        } else if (near(t.x, t.y, t.z, machinePoint)) {
          buckets.memberBodiesAtMachine += 1;
        }
      }
      return buckets;
    };
    scope.__mamDebrisCensus = (clusterId = "town-vertipad:hexacopter") =>
      debrisCensus(clusterId);
    return () => {
      if (scope.__mamExplode === detonate) {
        delete scope.__mamExplode;
      }
      if (scope.__mamClusterPose === clusterPose) {
        delete scope.__mamClusterPose;
      }
      if (scope.__mamBreakPiece === breakPiece) {
        delete scope.__mamBreakPiece;
      }
      if (scope.__mamVehicleFailures === failures) {
        delete scope.__mamVehicleFailures;
      }
    };
  }, [breakPieces, breakablePieceById, explodeAt]);

  const handleGrenadeExplode = useCallback(
    (
      _id: number,
      kind: ExplosiveKind,
      x: number,
      y: number,
      z: number,
      fieldCellIndex?: number,
    ) => {
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

  const detonateCharge = useCallback(
    (position: readonly [number, number, number]) => {
      explodeAt(new Vector3(...position), "charge");
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
    launcherKick.current += 1;

    const direction = camera.getWorldDirection(new Vector3()).normalize();
    const origin = camera.position
      .clone()
      .add(direction.clone().multiplyScalar(0.9))
      .add(new Vector3(0, -0.12, 0));

    grenadeId.current += 1;
    const nextGrenadeId = grenadeId.current;
    projectileRuntime.current?.spawn({
      id: nextGrenadeId,
      ownerId: "player",
      kind: "grenade",
      position: [origin.x, origin.y, origin.z],
      velocity: [direction.x * 23, direction.y * 23 + 1.4, direction.z * 23],
    });
  }, [camera]);

  const fireRocket = useCallback((kind: ExplosiveKind = "rocket") => {
    const now = performance.now();
    // Игла легче и заряжается быстрее — это часть её роли: по маневрирующей
    // машине нужен второй шанс, а не один выстрел раз в две секунды.
    const reloadMs = kind === "lance" ? 900 : 1650;
    if (now - lastRocketTime.current < reloadMs) {
      return;
    }
    lastRocketTime.current = now;

    playLaunchSound();
    launcherKick.current += 1;

    const direction = camera.getWorldDirection(new Vector3()).normalize();
    const origin = camera.position
      .clone()
      .add(direction.clone().multiplyScalar(1.05))
      .add(new Vector3(0, -0.1, 0));

    grenadeId.current += 1;
    const nextGrenadeId = grenadeId.current;
    const speed = explosiveProfile(kind).projectile.speed;
    projectileRuntime.current?.spawn({
      id: nextGrenadeId,
      ownerId: "player",
      kind,
      position: [origin.x, origin.y, origin.z],
      velocity: [
        direction.x * speed,
        direction.y * speed + 0.55,
        direction.z * speed,
      ],
    });
  }, [camera]);

  useEffect(() => {
    const scope = window as unknown as Record<string, unknown>;
    const fireTestMissile = (
      kind: ExplosiveKind,
      position: SceneVector3,
      velocity: SceneVector3,
    ): number | null => {
      if (
        (kind !== "rocket" && kind !== "lance" && kind !== "podRocket") ||
        position.length !== 3 ||
        velocity.length !== 3 ||
        ![...position, ...velocity].every(Number.isFinite) ||
        !projectileRuntime.current
      ) {
        return null;
      }
      grenadeId.current += 1;
      projectileRuntime.current.spawn({
        id: grenadeId.current,
        ownerId: "diagnostic",
        kind,
        position,
        velocity,
      });
      return grenadeId.current;
    };
    scope.__mamFireTestMissile = fireTestMissile;
    return () => {
      if (scope.__mamFireTestMissile === fireTestMissile) {
        delete scope.__mamFireTestMissile;
      }
    };
  }, []);

  /** Борт передаёт мировую трассу и паспорт снаряда в общий оружейный тракт. */
  const handleVehicleWeaponFire = useCallback(
    (event: VehicleWeaponFireEvent) => {
      for (const shot of event.shots) {
        const origin = new Vector3(...shot.origin);
        const direction = new Vector3(...shot.direction).normalize();
        if (shot.weapon === "cannon") {
          fireRound({
            origin,
            direction,
            projectile: shot.cannonProjectile ?? PLAYER_CANNON_PROJECTILE,
          });
          continue;
        }
        grenadeId.current += 1;
        const speed = explosiveProfile(shot.explosive ?? "podRocket")
          .projectile.speed;
        projectileRuntime.current?.spawn({
          id: grenadeId.current,
          ownerId: event.frameId,
          kind: shot.explosive ?? "podRocket",
          position: [origin.x, origin.y, origin.z],
          // Снаряд наследует ход носителя: ровно на это и решался прицел
          // (`interceptSolution` считает встречу в системе стрелка).
          velocity: [
            direction.x * speed + shot.inheritVelocity[0],
            direction.y * speed + shot.inheritVelocity[1],
            direction.z * speed + shot.inheritVelocity[2],
          ],
        });
      }
    },
    [fireRound],
  );

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
    if (weapon === "rocket" || weapon === "lance") {
      fireRocket(launcherExplosive(weapon));
      return;
    }
    if (weapon === "charge") {
      demolitionChargeRuntime.current?.placeOrRemove();
      return;
    }
    if (weapon === "construction") {
      constructionRuntime.current?.primary();
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

      // МАТЕРИАЛ, КОТОРЫЙ МОЛОТКУ НЕ ПО ЗУБАМ.
      //
      // Ниже начинается лестница урона, и первая же её ступень — `breakAt` —
      // вносила цель в множество сломанных БЕЗУСЛОВНО, ни разу не спросив
      // прочность. Для стального члена машины это означало отцепление от
      // корпуса (и, по `neighborChance`, ещё нескольких соседей) от удара,
      // который эту сталь заведомо не берёт. Прочность спрашивается ЗДЕСЬ,
      // одним вопросом на всю лестницу.
      //
      // Импульс при этом не отменяется: по двустороннему закону он обязателен
      // всегда. Но получает его только то, что УЖЕ свободно, — иначе удар,
      // которому отказано в разрушении, отрывал бы деталь через ensureDynamic
      // тем же самым способом, только окольным.
      if (!hammerWorksMaterial(material)) {
        const looseId =
          shardId ??
          (remnantId && remnantById.current.get(remnantId)?.detached
            ? remnantId
            : null) ??
          (piece && brokenPiecesRef.current.has(piece.id) ? piece.id : null);
        if (looseId) {
          applyImpact(looseId, material, point, direction);
        }
        return;
      }

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
    constructionRuntime,
    fallbackLook,
    demolitionChargeRuntime,
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
  const directlyDamagedPieces = useMemo(
    () => new Set([...carvedPieces, ...shatteredPieces]),
    [carvedPieces, shatteredPieces],
  );
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
      handleOccupiedSeatChange(null);
    }
  }, [inactiveCompoundMembers, occupiedSeatId, handleOccupiedSeatChange]);

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
        weather={WORLD_WEATHER_ENABLED ? worldWeather(scene.id) : CLEAR_SKY}
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
        pieces={breakablePieces}
        brokenPieces={brokenPieces}
      />
      {forceFieldActive ? (
        <BasaltForceFieldSystem
          ref={basaltForceField}
          resetVersion={resetVersion}
          staticProjection={nimbusForceField ? NIMBUS_FORCE_FIELD_PROJECTION : undefined}
          staticColor={nimbusForceField ? "#79e6ff" : undefined}
          includeSkyRam={!nimbusForceField}
          skyRamPose={skyRamShieldPose}
        />
      ) : null}
      {scene.worldRadius ? (
        <WorldEdge
          sceneId={scene.id}
          worldRadius={scene.worldRadius}
          center={scene.worldCenter}
          boundary={scene.worldEdgeBoundary}
          cameraFar={scene.cameraFar}
          nightRef={nightRef}
        />
      ) : null}
      {scene.id === "viking-village" && scene.worldRadius ? (
        <>
          <GrassField
            worldRadius={scene.worldRadius}
            center={scene.worldCenter}
            pieces={breakablePieces}
            // Denser low turf preserves a continuous grass cover inside the
            // village without bringing back the former tall foreground wall.
            count={42000}
          />
          <SmokePlumes nightRef={nightRef} />
          <Birds
            center={scene.worldCenter}
            worldRadius={scene.worldRadius}
            interest={airshipInterest}
            count={20}
          />
        </>
      ) : null}
      {scene.inhabitantDefinitions.length > 0 ? (
        <>
          <CreaturePopulations
            definitions={scene.inhabitantDefinitions}
            world={creatureWorld}
            villagers={{
              doorRequests: villagerDoorRequests,
              openDoors: villagerOpenDoors,
              stockStates: mutablePieceStates,
              inspect: villagerInspect,
            }}
          />
          {hasHumanSettlementPopulation(scene.inhabitantDefinitions) ? (
            <VillagerProbe
              lookup={villagerInspect}
              onChange={onVillagerInspect}
            />
          ) : null}
        </>
      ) : null}
      {scene.id === "kallur" && scene.worldRadius ? (
        <GrassField
          profile="kallur"
          worldRadius={scene.worldRadius}
          center={scene.worldCenter}
          pieces={breakablePieces}
          count={30000}
          bladeColor="#556036"
          tipColor="#8b9154"
          fadeStart={30}
          fadeEnd={56}
          windScale={0.85}
          hiddenPieceIds={hiddenPieces}
        />
      ) : null}
      {scene.id === "dutch-polder" && scene.worldRadius ? (
        <>
          <GrassField
            profile="dutch-polder"
            worldRadius={scene.worldRadius}
            center={scene.worldCenter}
            pieces={breakablePieces}
            count={24000}
            bladeColor="#4f6735"
            tipColor="#879b57"
            hiddenPieceIds={hiddenPieces}
          />
          {worldOverlay}
        </>
      ) : null}
      <group ref={breakableRaycastRoot}>
        <BreakableObjects
          pieces={breakablePieces}
          landscapeVisual={scene.landscapeVisual}
          brokenPieces={brokenPieces}
          shatteredPieces={hiddenPieces}
          bodies={pieceBodies}
          kinematicClusters={compoundKinematicClusters}
          kinematicClusterDefinitions={compoundClusterDefinitions}
          mutablePieceIds={mutablePieceIds}
          mutablePieceStates={mutablePieceStates}
          crateredMeshes={crateredMeshes}
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
          kinematicClusters={compoundKinematicClusters}
        />
        <DynamicBreakableWorld
          pieces={[]}
          shards={shards}
          remnants={remnants}
          bodies={pieceBodies}
          kinematicClusters={compoundKinematicClusters}
        />
      </group>
      <DemolitionChargeSystem
        active={weapon === "charge"}
        raycastRoot={breakableRaycastRoot}
        runtimeRef={demolitionChargeRuntime}
        onCountChange={onChargeCountChange}
        onDetonate={detonateCharge}
      />
      <ProjectileWarmup />
      <TracerSystem runtimeRef={tracerRuntime} />
      <MachineGunImpactSystem runtimeRef={machineGunImpactRuntime} />
      <SurfaceDamageDecals
        runtimeRef={surfaceDecalRuntime}
        carrierFrameOf={decalCarrierFrameOf}
      />
      <ExplosionFxSystem
        runtimeRef={explosionFxRuntime}
        bodies={pieceBodies}
        resolveDebrisProfile={resolveExplosionDebrisProfile}
      />
      <ProjectileSystem
        runtimeRef={projectileRuntime}
        onExplode={handleGrenadeExplode}
        forceFieldRef={forceFieldActive ? basaltForceField : undefined}
        threatRegistry={projectileThreats}
      />
      <VehicleFrameSystem
        showRouteOverlay={routeOverlayEnabled}
        selectedVehicleClusterId={selectedVehicleClusterId}
        onAimSelectionChange={onAimSelectionChange}
        aimIndicatorRef={aimIndicatorRef}
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        inactivePieces={inactiveCompoundMembers}
        damagedPieces={directlyDamagedPieces}
        carvedPieces={carvedPieces}
        remnants={remnants}
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
        onOccupiedSeatChange={handleOccupiedSeatChange}
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
        onVehicleWeaponFire={handleVehicleWeaponFire}
        projectileThreats={projectileThreats}
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
      <ConstantRotorSystem
        definitions={scene.constantRotorDefinitions}
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        inactivePieces={inactiveCompoundMembers}
        resetVersion={resetVersion}
        clusterRegistry={compoundKinematicClusters}
      />
      <TownCarSystem
        pieces={breakablePieces}
        bodies={pieceBodies}
        brokenPieces={brokenPiecesRef}
        inactivePieces={inactiveCompoundMembers}
        resetVersion={resetVersion}
        clusterRegistry={compoundKinematicClusters}
        occupiedSeatId={occupiedSeatId}
        onOccupiedSeatChange={handleOccupiedSeatChange}
        onApproachChange={onCarApproachChange}
        entryRequestVersion={entryOpenRequestVersion}
        entryRequestTargetRef={entryOpenRequestTargetRef}
        contactMaterialOf={contactMaterialOf}
        worldContactPieceAt={worldContactPieceAt}
        onContactDamage={handleContactDamage}
        onFramePose={publishVehicleFramePose}
        onMotionTelemetryUpdate={onMotionTelemetryUpdate}
      />
      <ConstructionSystem
        active={weapon === "construction"}
        sceneId={scene.id}
        resetVersion={resetVersion}
        occupiedSeatId={occupiedSeatId}
        onOccupiedSeatChange={handleOccupiedSeatChange}
        vehicleFramePoses={vehicleFramePoses}
        runtimeRef={constructionRuntime}
        onUiChange={onConstructionUiChange}
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
            observationActive={observationClusterId !== null}
            entryInteractionActive={
              entryInteractionActive || (weapon === "charge" && chargeCount > 0)
            }
            interIslandArrivalActive={interIslandArrivalActive}
            interIslandBoundaryPassThrough={interIslandBoundaryPassThrough}
            occupiedSeatId={occupiedSeatId}
            vehicleFramePoses={vehicleFramePoses}
            forceFieldRef={forceFieldActive ? basaltForceField : undefined}
            seatReleaseExitRef={seatReleaseExitRef}
          />
          {/* Свет модели вида живёт ПОСТОЯННО: лампы, ездящие вместе с
              оружием, меняли число источников сцены и заставляли three
              перекомпилировать все освещённые материалы на каждую смену
              инструмента. */}
          <FirstPersonToolLighting />
          {/* СОБСТВЕННАЯ ГРАНИЦА ОЖИДАНИЯ У МОДЕЛИ ОРУЖИЯ.
              Стволы грузят текстуры и потому саспендятся. Ближайший внешний
              Suspense стоит НАД <Physics>: без этой границы ожидание одной
              картинки гасило всё поддерево сцены, и первая же смена ствола
              разбирала и заново собирала весь физический мир — сотни
              createCollider, снятые позы динамических тел и повод для
              re-entrancy в rapier. Ждать текстуру должна рука, а не мир. */}
          <Suspense fallback={null}>
            {weapon === "none" ? null : weapon === "hammer" ? (
              <FirstPersonHammer swing={swing} />
            ) : weapon === "launcher" ? (
              <FirstPersonLauncher kickRef={launcherKick} />
            ) : weapon === "rocket" || weapon === "lance" ? (
              <FirstPersonRocketLauncher
                kickRef={launcherKick}
                slim={weapon === "lance"}
              />
            ) : weapon === "charge" ? (
              <FirstPersonDemolitionCharge />
            ) : weapon === "construction" ? (
              <FirstPersonConstructor />
            ) : (
              <FirstPersonMachineGun shotsRef={mgShots} />
            )}
          </Suspense>
          <MouseLook
            // Осмотр забирает мышь себе: взгляд игрока и удары заморожены,
            // а захват указателя MouseLook продолжает держать — по выходе
            // управление возвращается без лишнего клика.
            active={active && observationClusterId === null}
            initialYaw={scene.playerSpawnYaw ?? 0}
            mobileControls={mobileControls}
            passengerViewMotion={passengerViewMotion}
            onActiveChange={onActiveChange}
            onFallbackChange={onFallbackChange}
            onPointerLockChange={onPointerLockChange}
            onStrike={strike}
            onStrikeEnd={strikeEnd}
          />
          {observationClusterId !== null ? (
            <VehicleObservationCamera
              clusterId={observationClusterId}
              poses={vehicleFramePoses}
              clusters={compoundKinematicClusters}
              touchLook={mobileControls}
            />
          ) : null}
        </>
      ) : null}
      {bursts.map((burst) => (
        <DustBurst
          key={`burst:${burst.id}`}
          burst={burst}
          onDone={removeBurst}
        />
      ))}
    </>
  );
}

const DESKTOP_PIXEL_BUDGET = 1_100_000;
const COMPACT_PIXEL_BUDGET = 720_000;

// Изменение dpr пересоздаёт render targets всей цепочки постобработки, и это
// стоит ЦЕЛОГО кадра: замер по соседним кадрам показал, что кадр, в котором
// сменился размер буфера, отличается от предыдущего на 55–88% пикселей, тогда
// как обычные соседние кадры расходятся на доли процента. Лёгкая сцена
// (польдер без жителей) держит высокий fps, прежний шаг +0.04 раз в секунду
// поднимал масштаб, спайк GPU ронял его обратно — и экран мерцал вспышками.
//
// Поэтому масштаб теперь не «подкручивается», а ходит по ЛЕСТНИЦЕ: одна
// ступень за раз, только после нескольких согласных окон подряд. Обратный
// ход автоматом не делается: подъём DPR пересобирает композер (55–88%
// пикселей) и читается как моргание мокрости. Игрок поднимает ступень в
// настройках.
const RENDER_SCALE_LADDER = [1, 0.85, 0.72, 0.62] as const;
const SCALE_WINDOW_SECONDS = 1;
const SCALE_WARMUP_SECONDS = 2.5;
// Понижение отвечает на реальный FPS, не на ось gpuQuality: одно окно
// шума недостаточно, и после смены буфера датчики губернатора молчат.
const WINDOWS_BEFORE_DEMOTION = 5;
const SECONDS_AFTER_ANY_CHANGE = 8;

function AdaptiveRenderScale({
  compact,
  manualLevel = null,
  onDprChange,
}: {
  compact: boolean;
  /**
   * Ручная ступень лестницы из панели настроек (индекс RENDER_SCALE_LADDER);
   * null — ступень выбирает автомат по нагрузке. Ручной режим замораживает
   * голосование, но страж буфера и пересчёт на ресайз работают одинаково.
   */
  manualLevel?: number | null;
  /**
   * Выбранный DPR поднимается в корень и возвращается пропом dpr на Canvas —
   * ШТАТНЫЙ путь r3f, работающий во всех браузерах. Прямые вызовы gl ниже
   * дают мгновенность в том же кадре; проп закрывает движки, где прямой
   * путь капризничает (Safari), и заканчивает войну со стором: configure()
   * теперь переприкладывает НАШЕ значение, а не дефолт [1,2].
   */
  onDprChange?: (dpr: number) => void;
}) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const applyDpr = (next: number) => {
    gl.setPixelRatio(next);
    gl.setSize(size.width, size.height, false);
    onDprChange?.(next);
  };
  const elapsed = useRef(0);
  const frames = useRef(0);
  const warmup = useRef(0);
  // Индекс ступени: 0 — полное разрешение бюджета.
  const level = useRef(0);
  const overloadedWindows = useRef(0);
  const sinceAnyChange = useRef(Number.POSITIVE_INFINITY);
  const baseline = useRef(1);
  const applied = useRef(0);

  // Бюджет пикселей задаёт только ВЕРХ лестницы. Пересчёт при ресайзе
  // переприкладывает текущую ступень, а не сбрасывает её: раньше любая правка
  // раскладки (а с ней смена size) швыряла масштаб обратно на полный и
  // запускала подъём заново.
  useEffect(() => {
    const pixelBudget = compact ? COMPACT_PIXEL_BUDGET : DESKTOP_PIXEL_BUDGET;
    const softFloor = compact ? 0.72 : 0.58;
    const hardFloor = compact ? 0.62 : 0.52;
    // Потолок — devicePixelRatio, не 1: size в CSS-пикселях, и на Retina
    // потолок 1.0 недоиспользовал пиксельный бюджет вчетверо (буфер 0.25
    // площади экрана даже при свободном GPU), а каждая ступень вниз
    // растягивалась на дисплей грубее, чем на обычном мониторе.
    const deviceCeiling =
      typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio);
    baseline.current = MathUtils.clamp(
      Math.sqrt(pixelBudget / Math.max(1, size.width * size.height)),
      softFloor,
      deviceCeiling,
    );
    if (manualLevel !== null) {
      level.current = MathUtils.clamp(
        Math.round(manualLevel),
        0,
        RENDER_SCALE_LADDER.length - 1,
      );
    }
    // Ручной режим меряет ступени от НАТИВНОГО окна: «Полное» — честный
    // максимум системы (окно × devicePixelRatio), сколько бы оно ни стоило —
    // это выбор игрока. Пиксельный бюджет остаётся защитой только автомата:
    // на большом мониторе он капал ручное «Полное» до DPR 0.58, и блочность
    // была виднее всего в отражениях воды.
    const nextDpr = MathUtils.clamp(
      (manualLevel !== null ? deviceCeiling : baseline.current) *
        RENDER_SCALE_LADDER[level.current],
      hardFloor,
      deviceCeiling,
    );
    elapsed.current = 0;
    frames.current = 0;
    warmup.current = 0;
    overloadedWindows.current = 0;
    performanceGovernor.setRenderScaleLevel(level.current);
    if (Math.abs(nextDpr - applied.current) > 0.001) {
      applied.current = nextDpr;
      performanceGovernor.setDpr(nextDpr);
      notifyPipelineHitch();
      applyDpr(nextDpr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyDpr стабилен по gl/size
  }, [compact, manualLevel, size.height, size.width]);

  useFrame((_, delta) => {
    // Страж буфера: любой чужой resize (r3f на смене size, сторонний
    // setPixelRatio) возвращается к ступени лестницы в следующем же кадре.
    if (
      applied.current > 0 &&
      Math.abs(gl.getPixelRatio() - applied.current) > 0.001
    ) {
      applyDpr(applied.current);
    }

    // Ручная ступень: голосование стоит, страж выше продолжает работать.
    if (manualLevel !== null) {
      return;
    }

    warmup.current += delta;
    sinceAnyChange.current += delta;
    if (warmup.current < SCALE_WARMUP_SECONDS) {
      return;
    }

    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < SCALE_WINDOW_SECONDS) {
      return;
    }

    const fps = frames.current / elapsed.current;
    elapsed.current = 0;
    frames.current = 0;

    // Ступень вниз только по FPS. Ось gpuQuality больше не голос «мне
    // тяжело»: губернатор и лестница раньше смотрели друг на друга и
    // качали буфер. Обратный подъём выключен — см. шапку лестницы.
    const struggling = fps < (compact ? 40 : 42);
    overloadedWindows.current = struggling ? overloadedWindows.current + 1 : 0;

    if (sinceAnyChange.current < SECONDS_AFTER_ANY_CHANGE) {
      return;
    }

    let nextLevel = level.current;
    if (
      overloadedWindows.current >= WINDOWS_BEFORE_DEMOTION &&
      level.current < RENDER_SCALE_LADDER.length - 1
    ) {
      nextLevel = level.current + 1;
    }
    // No auto-promote. Climbing DPR rebuilds the composer (measured 55–88%
    // pixel delta). Wet puddles are env-map gloss, so that hitch reads as
    // wetness blinking on and off. Stay on the stable lower rung; settings
    // can raise it.
    if (nextLevel === level.current) {
      return;
    }

    const hardFloor = compact ? 0.62 : 0.52;
    const nextDpr = MathUtils.clamp(
      baseline.current * RENDER_SCALE_LADDER[nextLevel],
      hardFloor,
      1,
    );
    level.current = nextLevel;
    performanceGovernor.setRenderScaleLevel(nextLevel);
    overloadedWindows.current = 0;
    // Упёрлись в пол: ступень запомнена, но буфер трогать незачем.
    if (Math.abs(nextDpr - applied.current) <= 0.001) {
      return;
    }
    applied.current = nextDpr;
    sinceAnyChange.current = 0;
    performanceGovernor.setDpr(nextDpr);
    notifyPipelineHitch();
    applyDpr(nextDpr);
  });

  return null;
}

/**
 * Единственная честная веха «мир виден».
 *
 * Флаг `ready` поднимается на создании контекста WebGL — до сборки поддерева
 * сцены, слияния геометрии, запекания света и компиляции шейдеров. Всё это
 * стоит ещё секунды, и отчёт о загрузке, поверивший `ready`, снимался бы с
 * пустого экрана.
 *
 * Датчик живёт внутри той же границы Suspense, что и сцена, поэтому не
 * существует, пока её нет. Срабатывание на ВТОРОМ вызове — не запас
 * прочности, а определение: обработчик кадра идёт перед отрисовкой, значит
 * второй вызов означает, что первый кадр уже показан.
 *
 * Приоритет не задан намеренно: положительный отключил бы у r3f
 * автоматическую отрисовку и погасил бы сцену целиком.
 */
function FirstFrameProbe() {
  const frames = useRef(0);

  useFrame(() => {
    if (frames.current > 1) {
      return;
    }
    frames.current += 1;
    if (frames.current > 1) {
      markWorldBoot("firstFrame");
    }
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
  const frameStartedAt = useRef(0);

  useFrame(() => {
    frameStartedAt.current = performance.now();
  }, -100);

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
    performanceGovernor.recordFrame(
      delta * 1000,
      Math.max(0, performance.now() - frameStartedAt.current),
      gl.info.render.calls,
      gl.info.render.triangles,
    );
    if (!enabled) {
      elapsed.current = 0;
      frames.current = 0;
      return;
    }

    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current >= 0.5) {
      onSample(performanceGovernor.getSnapshot());
      elapsed.current = 0;
      frames.current = 0;
    }
    gl.info.reset();
  }, 2);

  return null;
}

function PhysicsPerformanceProbe() {
  const stepStartedAt = useRef(0);
  useBeforePhysicsStep(() => {
    stepStartedAt.current = performance.now();
  });
  useAfterPhysicsStep(() => {
    performanceGovernor.recordPhysics(
      Math.max(0, performance.now() - stepStartedAt.current),
    );
  });
  return null;
}

/** Ступени лестницы разрешения в человеческих словах; индекс = ступень. */
const GRAPHICS_RESOLUTION_LABELS: readonly TranslationKey[] = [
  "graphics.levelFull",
  "graphics.levelHigh",
  "graphics.levelMedium",
  "graphics.levelLow",
];
/** Оси качества показываются от максимума вниз; значения — 2/1/0. */
const GRAPHICS_QUALITY_OPTIONS: readonly {
  value: PerformanceQuality;
  label: TranslationKey;
}[] = [
  { value: 2, label: "graphics.qualityMax" },
  { value: 1, label: "graphics.qualityMid" },
  { value: 0, label: "graphics.qualityLow" },
];

/**
 * Панель настроек графики. «Автоматически» — качеством владеет губернатор,
 * и ряды живьём показывают его текущий выбор; клик по любому значению
 * выключает автомат и стартует ровно с того, что автомат выбрал (закон
 * панели), с одной заменённой осью. Всё применяется в тот же кадр.
 */
function GraphicsSettingsMenu({
  open,
  settings,
  onToggleOpen,
  onChange,
  t,
}: {
  open: boolean;
  settings: GraphicsSettings;
  onToggleOpen: () => void;
  onChange: (next: GraphicsSettings) => void;
  t: (key: TranslationKey) => string;
}) {
  const [autoView, setAutoView] = useState(() =>
    performanceGovernor.getSnapshot(),
  );
  // Пока панель открыта в автомате — показывать его живой выбор.
  useEffect(() => {
    if (!open || !settings.auto) return;
    setAutoView(performanceGovernor.getSnapshot());
    const timer = setInterval(
      () => setAutoView(performanceGovernor.getSnapshot()),
      500,
    );
    return () => clearInterval(timer);
  }, [open, settings.auto]);

  const shown: GraphicsSettings = settings.auto
    ? {
        auto: true,
        renderScaleLevel: autoView.renderScaleLevel,
        gpuQuality: autoView.gpuQuality,
        cpuQuality: autoView.cpuQuality,
        physicsQuality: autoView.physicsQuality,
      }
    : settings;

  // Клик по значению в автомате = выключить автомат, стартовав от его
  // текущего выбора с одной заменённой осью.
  const pick = (patch: Partial<GraphicsSettings>) => {
    const base = settings.auto
      ? manualSettingsFromSnapshot(performanceGovernor.getSnapshot())
      : settings;
    onChange({ ...base, ...patch, auto: false });
  };

  return (
    <div className="graphics-menu">
      <button
        type="button"
        className={`graphics-toggle${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onToggleOpen}
      >
        {t("graphics.button")}
      </button>
      {open ? (
        <aside
          className="graphics-panel"
          role="dialog"
          aria-label={t("graphics.title")}
        >
          <button
            type="button"
            className={`graphics-auto${settings.auto ? " is-active" : ""}`}
            aria-pressed={settings.auto}
            onClick={() =>
              onChange(
                settings.auto
                  ? manualSettingsFromSnapshot(performanceGovernor.getSnapshot())
                  : { ...settings, auto: true },
              )
            }
          >
            <span className="graphics-auto-mark" aria-hidden="true" />
            {t("graphics.auto")}
          </button>
          <p className="graphics-hint">{t("graphics.autoHint")}</p>

          <div className="graphics-row">
            <span className="graphics-row-name">{t("graphics.resolution")}</span>
            <div className="graphics-options">
              {GRAPHICS_RESOLUTION_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={
                    shown.renderScaleLevel === index ? "is-active" : undefined
                  }
                  onClick={() => pick({ renderScaleLevel: index })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          {(
            [
              {
                name: "graphics.effects",
                hint: "graphics.effectsHint",
                field: "gpuQuality",
              },
              {
                name: "graphics.particles",
                hint: "graphics.particlesHint",
                field: "cpuQuality",
              },
              {
                name: "graphics.physics",
                hint: "graphics.physicsHint",
                field: "physicsQuality",
              },
            ] as const
          ).map((row) => (
            <div className="graphics-row" key={row.field}>
              <span className="graphics-row-name">
                {t(row.name)}
                <em>{t(row.hint)}</em>
              </span>
              <div className="graphics-options">
                {GRAPHICS_QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      shown[row.field] === option.value ? "is-active" : undefined
                    }
                    onClick={() => pick({ [row.field]: option.value })}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  );
}

function MobileGameControls({
  active,
  flightMode,
  weapon,
  chargeCount,
  movementLocked,
  timeOfDay,
  controls,
  onStart,
  onStrike,
  onStrikeEnd,
  onDetonate,
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
  chargeCount: number;
  movementLocked: boolean;
  timeOfDay: TimeOfDay;
  controls: MobileControlsRef;
  onStart: () => void;
  onStrike: () => void;
  onStrikeEnd: () => void;
  onDetonate: () => void;
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
        : weapon === "charge"
          ? t("fire.place")
          : weapon === "construction"
            ? t("fire.build")
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
        {(weapon === "charge" && chargeCount > 0) ||
        (!flightMode && entryActions.length < 2) ? (
          <button
            type="button"
            className={
              weapon === "charge" && chargeCount > 0
                ? "is-entry-action"
                : entryAction
                  ? "is-entry-action"
                  : undefined
            }
            onPointerDown={(event) => {
              event.preventDefault();
              if (weapon === "charge" && chargeCount > 0) {
                onDetonate();
              } else if (entryAction) {
                onEntryAction();
              } else {
                setJump(true);
              }
            }}
            onPointerCancel={() =>
              weapon !== "charge" && !entryAction && setJump(false)
            }
            onPointerLeave={() =>
              weapon !== "charge" && !entryAction && setJump(false)
            }
            onPointerUp={() =>
              weapon !== "charge" && !entryAction && setJump(false)
            }
          >
            {weapon === "charge" && chargeCount > 0
              ? t("controls.detonate")
              : entryAction
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
              [
                weapon === "lance" ? "lance" : "rocket",
                "4",
                weapon === "lance"
                  ? t("weapon.lance.short")
                  : t("weapon.rocket.short"),
              ],
              ["charge", "5", t("weapon.charge.short")],
              ["construction", "6", t("weapon.construction.short")],
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
  return (
    `${String(Math.floor(left / 60)).padStart(2, "0")}` +
    `:${String(left % 60).padStart(2, "0")}`
  );
}

/**
 * Длительности перехода. Раскрытие должно совпадать с transition в
 * `.world-shutter.is-opening`, уход — с анимацией распада формы: и то и другое
 * ждёт кадр, а не наоборот.
 */
const SHUTTER_REVEAL_MS = 1_150;
const DEPARTURE_SHUTTER_MS = 2_000;

/**
 * ТАБЛО ОТКАЗА. Вердикт называет класс беды («не слушает органов»), но
 * снимает машину с рейса конкретный разрыв между тем, что автоматика
 * просила, и тем, что получила. Табло показывает весь набор органов разом,
 * поэтому причина видна прямо в игре, без консоли и догадок.
 */
function VehicleFailureReport({
  report,
  embedded = false,
}: {
  report: VehicleFailureEvent;
  /** В телеметрии табло встаёт под её панель, а не по центру экрана. */
  embedded?: boolean;
}) {
  const rows = report.readings ?? [];
  const metrics = report.metrics ?? [];
  const culprits = rows.filter((row) => row.note);
  return (
    <div
      className={`vehicle-failure-report${embedded ? " is-embedded" : ""}`}
      aria-live="polite"
    >
      <div className="vehicle-failure-report__head">
        <span className="vehicle-failure-report__source">
          {report.sourceLabel}
        </span>
        <span className="vehicle-failure-report__reason">{report.reason}</span>
      </div>
      {culprits.length > 0 ? (
        <div className="vehicle-failure-report__culprit">
          {culprits.map((row) => `${row.organ}: ${row.note}`).join(" · ")}
        </div>
      ) : (
        <div className="vehicle-failure-report__culprit">
          органы отвечают — причина в маршруте или позе
        </div>
      )}
      <table className="vehicle-failure-report__table">
        <thead>
          <tr>
            <th>орган</th>
            <th>ожидалось</th>
            <th>получено</th>
          </tr>
        </thead>
        <tbody>
          {[...rows, ...metrics].map((row) => (
            <tr
              key={row.organ}
              className={row.note ? "is-culprit" : undefined}
            >
              <td>
                {row.organ}
                {row.required ? " *" : ""}
              </td>
              <td>{row.expected}</td>
              <td>{row.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  entangled: "announce.vehicleFailure.entangled",
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
  flapAngle: "telemetry.metric.flapAngle",
  aileronAngle: "telemetry.metric.aileronAngle",
  elevatorAngle: "telemetry.metric.elevatorAngle",
  rudderAngle: "telemetry.metric.rudderAngle",
  wheelBrake: "telemetry.metric.wheelBrake",
  gearRetraction: "telemetry.metric.gearRetraction",
  rotorRings: "telemetry.metric.rotorRings",
  rotorRingsPort: "telemetry.metric.rotorRingsPort",
  rotorRingsStarboard: "telemetry.metric.rotorRingsStarboard",
  yawTunnels: "telemetry.metric.yawTunnels",
  trimCar: "telemetry.metric.trimCar",
  routeProgress: "telemetry.metric.routeProgress",
  distanceRemaining: "telemetry.metric.distanceRemaining",
};

// Естественность речи зависит от типа судна: коптер висит над ПЛОЩАДКОЙ,
// дирижабль — над ПРИЧАЛОМ. Видовая метка старше общей, общая — запасная.
const telemetryMetricLabelsByKind: Readonly<
  Record<string, Partial<Record<MotionTelemetryMachineKind, TranslationKey>>>
> = {
  relativeAltitude: {
    rotorcraft: "telemetry.metric.relativeAltitude.rotorcraft",
    buoyant: "telemetry.metric.relativeAltitude.buoyant",
  },
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

const telemetryActivityChannelLabels: Readonly<
  Record<MotionTelemetryActivityChannel, TranslationKey>
> = {
  assignment: "telemetry.activity.channel.assignment",
  action: "telemetry.activity.channel.action",
  decision: "telemetry.activity.channel.decision",
  instinct: "telemetry.activity.channel.instinct",
};

const telemetryActivityLabels: Readonly<Record<string, TranslationKey>> = {
  airControl: "telemetry.activity.airControl",
  routeFlight: "telemetry.activity.routeFlight",
  manualFlight: "telemetry.activity.manualFlight",
  recovery: "telemetry.activity.recovery",
  guarding: "telemetry.activity.guarding",
  interceptingTarget: "telemetry.activity.interceptingTarget",
  attacking: "telemetry.activity.attacking",
  breakingAttack: "telemetry.activity.breakingAttack",
  repositioning: "telemetry.activity.repositioning",
  disengaging: "telemetry.activity.disengaging",
  flyingFigure: "telemetry.activity.flyingFigure",
  correctingRoute: "telemetry.activity.correctingRoute",
  followingRoute: "telemetry.activity.followingRoute",
  taxiingToStand: "telemetry.activity.taxiingToStand",
  recoveringFlight: "telemetry.activity.recoveringFlight",
  emergencyDescent: "telemetry.activity.emergencyDescent",
  emergencyLanding: "telemetry.activity.emergencyLanding",
  awaitingRecovery: "telemetry.activity.awaitingRecovery",
  awaitingReplacement: "telemetry.activity.awaitingReplacement",
  rebuilding: "telemetry.activity.rebuilding",
  returningToService: "telemetry.activity.returningToService",
  righting: "telemetry.activity.righting",
  salvagingFireWindow: "telemetry.activity.salvagingFireWindow",
  strengtheningFireSolution: "telemetry.activity.strengtheningFireSolution",
  holdingFireSolution: "telemetry.activity.holdingFireSolution",
  evading: "telemetry.activity.evading",
  avoidingSurface: "telemetry.activity.avoidingSurface",
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
  sourceId = null,
  timeOfDay,
  onUnavailable,
}: {
  store: MotionTelemetryStore;
  /** Выбранная прицелом машина; без выбора панель живёт по приоритету. */
  sourceId?: string | null;
  timeOfDay: TimeOfDay;
  onUnavailable: () => void;
}): ReactElement | null {
  const { language, t } = useLanguage();
  const readSnapshot = useCallback(
    () =>
      sourceId ? store.getSourceSnapshot(sourceId) : store.getSnapshot(),
    [store, sourceId],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    readSnapshot,
    readSnapshot,
  );
  useEffect(() => {
    // С явным источником пустой снапшот — «выбранная машина ещё не
    // публикует» (раскрутка перед отрывом), а не «телеметрия пропала»:
    // панель молчит и материализуется с первым замером. Конец полёта
    // закрывает её через сброс ВЫБОРА, а не через этот путь.
    if (!snapshot && !sourceId) {
      onUnavailable();
    }
  }, [onUnavailable, snapshot, sourceId]);
  // АДАПТИВНЫЕ ЧЕРНИЛА (вердикт Igor: ни плашек, ни обводок — обычный текст
  // контрастного к фону цвета). За каждой строкой замеряется яркость
  // готового кадра (screenLuminanceProbe/ScreenLuminanceSampler); строка над
  // светлым получает is-ink-dark — графит; над тёмным — кость как была.
  // Гистерезис держит цвет на дрожащем пороге, берётся ХУДШАЯ из двух точек
  // строки: полстроки на небе — вся строка графитом.
  const inkRows = useRef(new Map<string, HTMLElement>());
  const [darkInkRows, setDarkInkRows] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const inkRef = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) {
        inkRows.current.set(key, node);
      } else {
        inkRows.current.delete(key);
      }
    },
    [],
  );
  useEffect(() => {
    const interval = window.setInterval(() => {
      for (const [key, element] of inkRows.current) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 2) {
          continue;
        }
        screenLuminanceProbe.requests.set(`tele:${key}:l`, {
          x: rect.left + rect.width * 0.22,
          y: rect.top + rect.height / 2,
        });
        screenLuminanceProbe.requests.set(`tele:${key}:r`, {
          x: rect.left + rect.width * 0.82,
          y: rect.top + rect.height / 2,
        });
      }
      setDarkInkRows((previous) => {
        let changed = false;
        const next = new Set(previous);
        for (const key of inkRows.current.keys()) {
          const left = screenLuminanceProbe.results.get(`tele:${key}:l`);
          const right = screenLuminanceProbe.results.get(`tele:${key}:r`);
          if (left === undefined && right === undefined) {
            continue;
          }
          const luminance = Math.max(left ?? 0, right ?? 0);
          const wasDark = previous.has(key);
          const wantsDark = wasDark ? luminance > 0.5 : luminance > 0.58;
          if (wantsDark !== wasDark) {
            changed = true;
            if (wantsDark) {
              next.add(key);
            } else {
              next.delete(key);
            }
          }
        }
        return changed ? next : previous;
      });
    }, 280);
    return () => {
      window.clearInterval(interval);
      for (const key of [...screenLuminanceProbe.requests.keys()]) {
        if (key.startsWith("tele:")) {
          screenLuminanceProbe.requests.delete(key);
        }
      }
    };
  }, []);
  const inkClass = (key: string) => (darkInkRows.has(key) ? " is-ink-dark" : "");
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
  const primaryActivity = motionTelemetryPrimaryActivity(snapshot.activities);
  const operationalState =
    primaryActivity?.state ?? snapshot.mode ?? snapshot.phase;
  const operationalStateKey = primaryActivity
    ? telemetryActivityLabels[primaryActivity.state]
    : snapshot.mode
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
          const channelState = metric.valueStates?.[index];
          return (
            <span
              key={activityKey}
              className={`motion-telemetry-value-channel${
                channelState === "critical"
                  ? " is-critical"
                  : channelState === "warning"
                    ? " is-warning"
                    : ""
              }`}
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
      <header ref={inkRef("header")} className={inkClass("header")}>
        <span className="motion-telemetry-signal" aria-hidden="true" />
        <div>
          <p>{t("telemetry.kicker")}</p>
          <h2>{snapshot.sourceLabel}</h2>
        </div>
        <strong>
          {operationalStateKey ? t(operationalStateKey) : operationalState}
        </strong>
      </header>
      {snapshot.activities?.length ? (
        <dl className="motion-telemetry-activities">
          {snapshot.activities.map((activity) => {
            const rowKey = `activity:${activity.channel}:${activity.state}`;
            const stateLabel = telemetryActivityLabels[activity.state];
            return (
              <div
                key={`${activity.channel}:${activity.state}`}
                ref={inkRef(rowKey)}
                className={`${inkClass(rowKey)}${
                  activity === primaryActivity ? " is-primary" : ""
                }`}
              >
                <dt>{t(telemetryActivityChannelLabels[activity.channel])}</dt>
                <dd>{stateLabel ? t(stateLabel) : activity.state}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      {attitude ? (
        <div
          ref={inkRef("instruments")}
          className={`motion-telemetry-instruments${inkClass("instruments")}`}
        >
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
            machine={snapshot.machine}
            impact={snapshot.impact}
            locale={locale}
            ariaLabel={t("telemetry.impactAria")}
            kickLabel={t("telemetry.impactKick")}
            rotationLabel={t("telemetry.impactRotation")}
          />
        </div>
      ) : null}
      <dl>
        {visibleMetrics.map((metric) => {
          const kindLabel = snapshot.machine
            ? telemetryMetricLabelsByKind[metric.id]?.[snapshot.machine.kind]
            : undefined;
          const label = kindLabel ?? telemetryMetricLabels[metric.id];
          return (
            <div
              key={metric.id}
              ref={inkRef(`metric:${metric.id}`)}
              className={inkClass(`metric:${metric.id}`) || undefined}
            >
              <dt>{label ? t(label) : metric.id}</dt>
              <dd>{renderValue(metric)}</dd>
            </div>
          );
        })}
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
                : weapon === "lance"
                  ? t("announce.weaponLance")
                  : weapon === "charge"
                    ? t("announce.weaponCharge")
                    : weapon === "construction"
                      ? t("announce.weaponConstruction")
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
            : weapon === "lance"
              ? t("weapon.lance")
              : weapon === "charge"
                ? t("weapon.charge")
                : weapon === "construction"
                  ? t("weapon.construction")
                  : t("weapon.mg");

  if (!flightMode && !weaponChip) {
    return null;
  }
  return (
    <div className="mode-chips" aria-hidden="true">
      {flightMode ? (
        <span className="mode-chip">{t("chip.flight")}</span>
      ) : null}
      {weaponChip ? <span className="mode-chip">{weaponChip}</span> : null}
    </div>
  );
}

function ConstructionHud({
  state,
  driving,
}: {
  state: ConstructionUiState;
  driving: boolean;
}): ReactElement {
  const { t } = useLanguage();
  return (
    <aside
      className="construction-hud"
      role="status"
      aria-live="polite"
      data-construction-kind={state.selectedKind}
      data-construction-assemblies={state.assemblyCount}
      data-construction-parts={state.partCount}
    >
      <div className="construction-hud-title">
        <p>{t("construction.kicker")}</p>
        <b>
          {driving
            ? state.controlledMachine === "rotorcraft"
              ? t("construction.machine.rotorcraft")
              : t("construction.machine.car")
            : t(`construction.part.${state.selectedKind}` as TranslationKey)}
        </b>
        <span>
          {state.partCount} {t("construction.parts")} · {state.assemblyCount} {t("construction.assemblies")}
        </span>
      </div>
      {state.catalogOpen ? (
        <div className="construction-catalog" aria-hidden="true">
          {(["beam", "plate", "wheel", "engine", "seat", "rotor"] as const).map(
            (kind) => (
              <span key={kind} className={state.selectedKind === kind ? "is-selected" : undefined}>
                {t(`construction.part.${kind}` as TranslationKey)}
              </span>
            ),
          )}
        </div>
      ) : null}
      {driving ? (
        <div className="construction-controls">
          <span><kbd>WASD</kbd>{t("construction.control.drive")}</span>
          <span><kbd>Space</kbd>{t("construction.control.liftBrake")}</span>
          <span><kbd>C</kbd>{t("construction.control.exit")}</span>
        </div>
      ) : (
        <div className="construction-controls">
          <span><kbd>RMB</kbd>{t("construction.control.grab")}</span>
          <span><kbd>LMB</kbd>{state.held ? t("construction.control.throw") : t("construction.control.place")}</span>
          <span><kbd>Wheel</kbd>{t("construction.control.distance")}</span>
          <span><kbd>Z / X</kbd>{t("construction.control.part")}</span>
          <span><kbd>B</kbd>{t("construction.control.catalog")}</span>
          <span><kbd>E</kbd>{t("construction.control.rotate")}</span>
          <span><kbd>G</kbd>{t("construction.control.weld")}</span>
          <span><kbd>Shift+G</kbd>{t("construction.control.unweld")}</span>
          <span><kbd>C</kbd>{t("construction.control.enter")}</span>
          <span><kbd>Del</kbd>{t("construction.control.remove")}</span>
        </div>
      )}
    </aside>
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
    .filter(
      (
        entry,
      ): entry is [
        keyof RotorcraftPilotStatus["proximity"],
        { readonly distance: number; readonly intervening: boolean },
      ] => entry[1].distance !== null,
    )
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
        className={
          status.proximity[first].intervening ? "is-warning" : undefined
        }
      >
        {distance(first)}
      </span>
      <span className="motion-telemetry-value-separator"> / </span>
      <span
        className={
          status.proximity[second].intervening ? "is-warning" : undefined
        }
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
              <circle
                className="motion-impact-sphere-boundary"
                cx="36"
                cy="36"
                r="31"
              />
              <ellipse
                className="motion-impact-ring is-far"
                cx="36"
                cy="36"
                rx="31"
                ry="12"
              />
              <ellipse
                className="motion-impact-ring is-near"
                cx="36"
                cy="36"
                rx="16"
                ry="31"
              />
              <path className="motion-impact-nose" d="M36 5l-2.5 4.5h5z" />
              <circle
                className="rotorcraft-proximity-craft-dot"
                cx="36"
                cy="36"
                r="2.2"
              />
              {status.sensorAssistEnabled && closestPoint ? (
                <circle
                  className={
                    closest?.[1].intervening
                      ? "rotorcraft-proximity-contact is-warning"
                      : "rotorcraft-proximity-contact"
                  }
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
              <dd>
                {status.sensorAssistEnabled && closest
                  ? `${closest[1].distance.toFixed(1)} m`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("rotorcraftPilot.sensors")}</dt>
              <dd>
                {braking
                  ? t("rotorcraftPilot.sensors.braking")
                  : status.sensorAssistEnabled
                    ? "ON"
                    : "OFF"}
              </dd>
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
          <dt>
            {t("rotorcraftPilot.currentAltitude")} /{" "}
            {t("rotorcraftPilot.targetAltitude")}
          </dt>
          <dd>
            {status.currentAltitude.toFixed(1)} /{" "}
            {status.targetAltitude.toFixed(1)} m
          </dd>
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
                className={
                  (status.motorAvailability[index] ?? 0) < 0.55
                    ? "is-warning"
                    : undefined
                }
              >
                {index > 0 ? (
                  <span className="motion-telemetry-value-separator"> / </span>
                ) : null}
                {Math.round(output * 100)}
              </span>
            ))}
            <span className="motion-telemetry-value-unit"> %</span>
          </dd>
        </div>
        <div>
          <dt>
            {t("rotorcraftPilot.sector.fore")} /{" "}
            {t("rotorcraftPilot.sector.aft")}
          </dt>
          <dd>{pairedReading("fore", "aft")}</dd>
        </div>
        <div>
          <dt>
            {t("rotorcraftPilot.sector.port")} /{" "}
            {t("rotorcraftPilot.sector.starboard")}
          </dt>
          <dd>{pairedReading("port", "starboard")}</dd>
        </div>
        <div>
          <dt>
            {t("rotorcraftPilot.sector.above")} /{" "}
            {t("rotorcraftPilot.sector.below")}
          </dt>
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
  worldOverlay,
}: {
  scene?: DestructionSceneDefinition;
  flyover?: CinematicFlyoverDefinition;
  worldOverlay?: ReactNode;
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
  const demolitionChargeRuntime = useRef<DemolitionChargeRuntime | null>(null);
  const constructionRuntime = useRef<ConstructionRuntime | null>(null);
  const [constructionUi, setConstructionUi] = useState<ConstructionUiState>(
    DEFAULT_CONSTRUCTION_UI,
  );
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
  const [chargeCount, setChargeCount] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  // Старт с пустыми руками (вердикт Igor 07.08.2026): вошёл — наблюдаешь,
  // первый клик ничего не ломает; молоток — в одном нажатии (1).
  const [weapon, setWeapon] = useState<WeaponName>("none");
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
  // Настройки графики: применяются в тот же кадр, переживают перезагрузку.
  const [graphicsSettings, setGraphicsSettings] = useState<GraphicsSettings>(
    () => loadGraphicsSettings(),
  );
  const [graphicsMenuOpen, setGraphicsMenuOpen] = useState(false);
  useEffect(() => {
    applyGraphicsSettings(graphicsSettings);
    saveGraphicsSettings(graphicsSettings);
  }, [graphicsSettings]);
  // Фактический DPR лестницы; возвращается пропом на Canvas — штатный путь
  // r3f применения разрешения, единый для всех браузеров.
  const [appliedDpr, setAppliedDpr] = useState(1);
  const [dynamicBodyCount, setDynamicBodyCount] = useState(0);
  const [performance, setPerformance] = useState<PerformanceSnapshot>(() =>
    performanceGovernor.getSnapshot(),
  );
  const [telemetryStore] = useState(createMotionTelemetryStore);
  // Четыре положения по T: выкл -> телеметрия -> телеметрия с маршрутом ->
  // внешний осмотр (камера орбитой вокруг летящей машины). Маршрут и осмотр —
  // часть телеметрии, а не постоянная декорация.
  const [telemetryMode, setTelemetryMode] = useState<0 | 1 | 2 | 3>(0);
  const telemetryVisible = telemetryMode > 0;
  // Чью телеметрию показывать, решает игрок взглядом (vehicleAimSelection):
  // панель открывается сама для выбранной машины, T листает глубину.
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  // Сессия помнит выбранную глубину: наблюдательная сессия — «маршрут
  // всегда», прогулка — «панель, и хватит»; перевыбор не спорит с игроком.
  // Осмотр (3) в память не пишется: отбирать камеру у игрока на каждый новый
  // вылет нельзя, в эту глубину входят только руками.
  const telemetryDepthRef = useRef<1 | 2>(1);
  const aimIndicatorRef = useRef<HTMLElement | null>(null);
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
    const deadline =
      flightLockDeadline.current ??
      (flightLockDeadline.current = Date.now() + flightLockSeconds * 1000);
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

  const [failureReport, setFailureReport] = useState<VehicleFailureEvent | null>(
    null,
  );
  const failureReportTimer = useRef<number | null>(null);
  const handleVehicleFailure = useCallback(
    (event: VehicleFailureEvent) => {
      // Разбор висит двадцать секунд: этого хватает, чтобы прочитать все
      // органы и не мешает следующему рейсу.
      setFailureReport(event);
      if (failureReportTimer.current !== null) {
        window.clearTimeout(failureReportTimer.current);
      }
      failureReportTimer.current = window.setTimeout(() => {
        setFailureReport(null);
        failureReportTimer.current = null;
      }, 20_000);
      if (process.env.NODE_ENV !== "production") {
        // Журнал отказов для headless-диагностики: ПРИЧИНА, а не только
        // подпись на экране. Читается через __mamVehicleFailures().
        const scope = window as unknown as Record<string, unknown>;
        const log = (scope.__mamVehicleFailureLog ??= []) as {
          sourceId: string;
          reason: string;
          at: number;
        }[];
        log.push({
          sourceId: event.sourceId,
          reason: event.reason,
          at: window.performance.now(),
        });
        if (log.length > 64) {
          log.splice(0, log.length - 64);
        }
      }
      publishCaption(
        "telemetry",
        // Экипажу сообщают, ЧТО именно сняло машину с рейса: сама подпись
        // остаётся человеческой, код причины стоит рядом и позволяет
        // сверить наблюдение с логикой, не залезая в консоль.
        `${t("announce.vehicleFailureKicker")} · ${event.reason}`,
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
    // Цикл: выкл -> панель -> панель с маршрутом -> внешний осмотр -> выкл.
    // Вход автоматический — от выбора машины прицелом; T листает глубину для
    // ВЫБРАННОЙ машины. Запоминаются только панельные глубины (1–2): осмотр
    // отдаёт камеру машине, и открываться в него сам новый вылет не должен.
    if (telemetryMode === 3) {
      setTelemetryMode(0);
      announceTelemetry("announce.telemetryOff");
      return;
    }
    if (telemetryMode === 2) {
      setTelemetryMode(3);
      announceTelemetry("announce.telemetryObserve");
      return;
    }
    if (telemetryMode === 1) {
      telemetryDepthRef.current = 2;
      setTelemetryMode(2);
      announceTelemetry("announce.telemetryRoute");
      return;
    }
    if (!selectedVehicleId || !telemetryStore.getSourceSnapshot(selectedVehicleId)) {
      announceTelemetry("announce.telemetryUnavailable");
      return;
    }
    telemetryDepthRef.current = 1;
    setTelemetryMode(1);
    announceTelemetry("announce.telemetryOn");
  }, [announceTelemetry, telemetryStore, telemetryMode, selectedVehicleId]);

  // Панель открывается сама для выбранной машины — на запомненной глубине;
  // потеря выбора (машина села, полётов нет) закрывает её.
  const handleAimSelectionChange = useCallback(
    (clusterId: string | null) => {
      // В осмотре выбор заморожен: камера отвёрнута от прицела игрока по
      // определению режима, и «взгляд ушёл с машины» — не событие, а сама
      // суть осмотра. Выход — T или конец полёта (onUnavailable).
      if (telemetryMode === 3) {
        return;
      }
      setSelectedVehicleId(clusterId);
      setTelemetryMode(clusterId ? telemetryDepthRef.current : 0);
    },
    [telemetryMode],
  );

  const handleTelemetryUnavailable = useCallback(() => {
    setTelemetryMode(0);
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
      if (
        target?.isContentEditable ||
        /^(INPUT|TEXTAREA)$/.test(target?.tagName ?? "")
      ) {
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
    car: HingedEntryApproach | null;
    departure: HingedEntryApproach | null;
  }>({ door: null, car: null, departure: null });

  const applyApproach = useCallback(
    (source: "door" | "car" | "departure", entry: HingedEntryApproach | null) => {
      approachSources.current[source] = entry;
      // Сесть в машину — это войти в дверь, а не отправить рейс: пост стоит
      // снаружи, у ручки. Поэтому машина занимает дверную сторону спора, где
      // общее правило «дверь важнее» уже верно, а рейс остаётся отдельным.
      const next = preferredEntryInteraction(
        approachSources.current.door ?? approachSources.current.car,
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

  const handleCarApproachChange = useCallback(
    (approached: HingedEntryApproach | null) => applyApproach("car", approached),
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
    if (
      stage !== "departing" ||
      !worldEntry.origin ||
      !worldEntry.destination
    ) {
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
    // Прилёт — авторская сцена со своей заслонкой, именем острова и силуэтом
    // судна: общий отчёт о загрузке ей не нужен и спорил бы с ней за кадр.
    // Штатный вход, наоборот, отсюда и начинается: код мира уже выполнен и
    // геометрия посчитана — эта веха закрывает самую долгую стадию.
    if (resolvedInitialArrival) {
      abandonWorldBoot();
    } else {
      markWorldBoot("codeReady", scene.title);
    }
  }, [arrivalBootstrapComplete, resolvedInitialArrival, scene.title]);

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

  // Dev-хуки: состояние и запуск действия поста из headless-проверок — пара к
  // __mamTeleport/__mamExplode. Синтетические Digit-клавиши в CDP исполняют
  // смену оружия раньше, чем до них доберётся численное действие поста.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as unknown as Record<string, unknown>;
    const entryState = () =>
      approachedEntry
        ? {
            id: approachedEntry.id,
            kind: approachedEntry.kind,
            actions: entryInteractionActions(approachedEntry).map(
              (action) => action.id,
            ),
          }
        : null;
    const openEntry = (actionId?: string) => {
      if (!approachedEntry) {
        return null;
      }
      openApproachedEntry(actionId);
      return approachedEntry.id;
    };
    scope.__mamEntryState = entryState;
    scope.__mamEntryOpen = openEntry;
    return () => {
      if (scope.__mamEntryState === entryState) {
        delete scope.__mamEntryState;
      }
      if (scope.__mamEntryOpen === openEntry) {
        delete scope.__mamEntryOpen;
      }
    };
  }, [approachedEntry, openApproachedEntry]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const pressedDigit = keyboardDigit(event.code, event.key);
      const directWeapon = directWeaponShortcut(pressedDigit);
      const numberedAction = pressedDigit !== null
        ? numberedEntryInteractionAction(
            approachedEntry,
            pressedDigit,
          )
        : null;
      if (
        event.code === "Space" &&
        weapon === "charge" &&
        chargeCount > 0 &&
        !event.repeat
      ) {
        event.preventDefault();
        mobileControls.current.jump = false;
        demolitionChargeRuntime.current?.detonateAll();
      } else if (numberedAction && !event.repeat) {
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
      } else if (
        pressedDigit === 4 &&
        (!occupiedSeatId || interIslandPassengerState.flightActive) &&
        !event.repeat
      ) {
        event.preventDefault();
        // Одна клавиша, два ракетомёта: повторное нажатие меняет боеприпас.
        requestWeaponChange(nextLauncherWeapon(weapon));
      } else if (
        directWeapon &&
        (!occupiedSeatId ||
          (directWeapon !== "none" && interIslandPassengerState.flightActive)) &&
        !event.repeat
      ) {
        event.preventDefault();
        requestWeaponChange(directWeapon);
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
    chargeCount,
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
              // DPR-проп — ЗЕРКАЛО решения AdaptiveRenderScale (никогда не
              // константа: configure() r3f переприкладывает проп при каждом
              // ре-рендере, и константа затирала бы лестницу — замерено: стор
              // 0.62, буфер полноразмерный). Так r3f применяет разрешение
              // своим штатным путём во всех браузерах; серый кадр смены DPR
              // закрыт покадровой сверкой конвейера (syncPipelineSize).
              dpr={appliedDpr}
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
                markWorldBoot("rendererReady");
              }}
            >
              <Suspense fallback={null}>
                <Physics
                  gravity={[0, -PLAYER_GRAVITY, 0]}
                  timeStep={PHYSICS_TIME_STEP}
                  maxStepsPerFrame={3}
                  numSolverIterations={6}
                  maxCcdSubsteps={2}
                >
                  <PhysicsPerformanceProbe />
                  <OpenWorldScene
                    routeOverlayEnabled={telemetryMode >= 2}
                    observationClusterId={
                      telemetryMode === 3 ? selectedVehicleId : null
                    }
                    selectedVehicleClusterId={selectedVehicleId}
                    onAimSelectionChange={handleAimSelectionChange}
                    aimIndicatorRef={aimIndicatorRef}
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
                    chargeCount={chargeCount}
                    demolitionChargeRuntime={demolitionChargeRuntime}
                    constructionRuntime={constructionRuntime}
                    onConstructionUiChange={setConstructionUi}
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
                    onChargeCountChange={setChargeCount}
                    onEntryApproachChange={handleEntryApproachChange}
                    onDepartureApproachChange={handleDepartureApproachChange}
                    onCarApproachChange={handleCarApproachChange}
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
                    worldOverlay={worldOverlay}
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
                <FirstFrameProbe />
                <PerformanceProbe
                  enabled={showPerformance}
                  onSample={setPerformance}
                />
                {/* Главная GPU-крутилка губернатора: кап пиксельного бюджета
                    и лестница разрешения. Серый кадр смены DPR закрыт
                    покадровой сверкой размера конвейера (syncPipelineSize). */}
                <AdaptiveRenderScale
                  compact={fallbackLook}
                  manualLevel={
                    graphicsSettings.auto
                      ? null
                      : graphicsSettings.renderScaleLevel
                  }
                  onDprChange={setAppliedDpr}
                />
                <ScreenLuminanceSampler />
                <CinematicPostProcessing
                  compact={fallbackLook}
                  // Платформенный костыль ТОЛЬКО для Metal: на Apple
                  // HalfFloat-дорожка блума всё ещё мерцает кадром на
                  // польдере (замер Igor), на ANGLE/D3D серия 36 кадров
                  // чиста — Windows держит честный HDR-ореол. Снимать —
                  // только серией кадров, снятой на Metal (lessons §2).
                  byteBloom={
                    scene.id === "dutch-polder" &&
                    typeof navigator !== "undefined" &&
                    /Mac|iPhone|iPad/.test(navigator.userAgent)
                  }
                  // Screen veil only — weather/cloud deck stay as authored.
                  // Polder midtones die looking sunward (dense grass + dome).
                  // Town boulevard washes milder looking east into the sun.
                  sunVeil={
                    scene.id === "dutch-polder"
                      ? 0.42
                      : scene.id === "open-house"
                        ? 0.72
                        : scene.id === "basalt-stronghold"
                          ? 0.55
                          : 1
                  }
                />
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
      {surfaces.worldHud &&
      active &&
      (equippedWeapon === "construction" ||
        occupiedSeatId?.startsWith("construction-seat:")) ? (
        <ConstructionHud
          state={constructionUi}
          driving={occupiedSeatId?.startsWith("construction-seat:") === true}
        />
      ) : null}

      {/* ТЕХНИЧЕСКИЙ РАЗБОР ОТКАЗА СНЯТ С ЭКРАНА (вердикт Igor, 11.08.2026).
          Он выходил ДВУМЯ оверлеями разом: этим, самостоятельным, и вторым —
          вшитым в телеметрию (ниже по файлу). Оба показывали один и тот же
          `failureReport` по одному и тому же условию.

          Блок закомментирован, а не удалён, намеренно: разбор нужен при
          отладке отказов, и восстанавливать его по памяти дороже, чем снять
          комментарий. Вернуть — ОДИН из двух, а не оба.

      {failureReport ? <VehicleFailureReport report={failureReport} /> : null}
      */}

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
            <GraphicsSettingsMenu
              open={graphicsMenuOpen}
              settings={graphicsSettings}
              onToggleOpen={() => setGraphicsMenuOpen((current) => !current)}
              onChange={setGraphicsSettings}
              t={t}
            />
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
          <span>{performance.fps.toFixed(2)} FPS</span>
          <span>CPU {performance.cpuMs.toFixed(1)} ms</span>
          <span>physics {performance.physicsMs.toFixed(1)} ms</span>
          <span>
            GPU{" "}
            {performance.gpuMs === null
              ? "n/a"
              : `${performance.gpuMs.toFixed(1)} ms`}
          </span>
          <span>{performance.bottleneck}</span>
          <span>DPR {performance.dpr.toFixed(2)}</span>
          <span>{performance.calls} calls</span>
          <span>{performance.triangles.toLocaleString()} tris</span>
          <span>{dynamicBodyCount} bodies</span>
        </aside>
      ) : null}

      {telemetryVisible &&
      surfaces.worldHud &&
      (!active || !inspectedVillager) ? (
        <MotionTelemetryPanel
          store={telemetryStore}
          sourceId={selectedVehicleId}
          timeOfDay={timeOfDay}
          onUnavailable={handleTelemetryUnavailable}
        />
      ) : null}

      {/* Разбор отказа живёт и в телеметрии: она вызывается по требованию и
          не гаснет сама, поэтому кадр успевает снять даже длинный список.

          СНЯТ С ЭКРАНА вместе с самостоятельным оверлеем (см. выше): показывать
          один и тот же разбор дважды незачем, а какой из двух вернуть — вопрос
          к тому, кто будет отлаживать отказ. Этот удобнее: не гаснет по таймеру.

      {telemetryVisible && failureReport ? (
        <VehicleFailureReport report={failureReport} embedded />
      ) : null}
      */}

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
                      : equippedWeapon === "lance"
                        ? t("weapon.lance")
                        : equippedWeapon === "charge"
                          ? `${t("weapon.charge")} · ${chargeCount}/10`
                          : equippedWeapon === "construction"
                            ? t("weapon.construction")
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

      {/* Пустые руки — стойка наблюдателя: перекрестье остаётся, но
          ослабленное. Оно теперь орган выбора машины взглядом, и дуга на нём
          показывает накопление выбора (CSS-переменную пишет
          VehicleAimSelector напрямую, без ре-рендеров). */}
      {surfaces.worldHud ? (
        <div
          ref={(node) => {
            aimIndicatorRef.current = node;
          }}
          className={`crosshair${active ? " is-active" : ""}${
            equippedWeapon === "none" ? " is-bare" : ""
          }`}
          aria-hidden="true"
        >
          <i />
          <i />
          <span className="crosshair-aim-dwell" />
        </div>
      ) : null}

      {active &&
      surfaces.actionHints &&
      equippedWeapon === "charge" &&
      chargeCount > 0 ? (
        <aside
          className="game-action-hint is-persistent"
          role="status"
          aria-live="polite"
        >
          <p>
            {t("hint.charge.eyebrow")} · {chargeCount}/10
          </p>
          <h2>{t("hint.charge.title")}</h2>
          <div className="game-action-hint-detail">
            {!fallbackLook ? <kbd>Space</kbd> : null}
            <span>{t("controls.detonate")}</span>
          </div>
        </aside>
      ) : null}

      {active &&
      surfaces.actionHints &&
      activeHint &&
      !(equippedWeapon === "charge" && chargeCount > 0) ? (
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
      hasNumberedEntryActions &&
      !(equippedWeapon === "charge" && chargeCount > 0) ? (
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
          chargeCount={chargeCount}
          movementLocked={occupiedSeatId !== null}
          timeOfDay={timeOfDay}
          controls={mobileControls}
          onStart={startPlaying}
          onStrike={() => mobileActions.current.strike()}
          onStrikeEnd={() => mobileActions.current.strikeEnd()}
          onDetonate={() => demolitionChargeRuntime.current?.detonateAll()}
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
                  : equippedWeapon === "charge"
                    ? t("fire.place")
                    : equippedWeapon === "construction"
                      ? t("fire.build")
                  : equippedWeapon === "launcher" ||
                      equippedWeapon === "rocket" ||
                      equippedWeapon === "lance"
                    ? t("fire.shoot")
                    : t("fire.hold")}
              <span>0·1·2·3·4·5·6</span>
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
          {equippedWeapon === "charge" && chargeCount > 0 ? (
            <>
              <span>Space</span>
              {t("controls.detonate")}
            </>
          ) : null}
          {!flightMode &&
          !(equippedWeapon === "charge" && chargeCount > 0) ? (
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
                <p className="gate-loading-kicker">{t("gate.loadingKicker")}</p>
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
