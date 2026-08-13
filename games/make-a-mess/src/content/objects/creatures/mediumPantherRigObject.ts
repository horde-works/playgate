import type { ObjectLabPart, ObjectPoint } from "../dutchWindmills/objectModel.ts";
import { point, type CreatureLabModel, type CreatureLabView } from "./creatureObjectHelpers.ts";
import {
  buildCreaturePoseDerivative,
  buildCreatureRigParts,
  type CreaturePoseContract,
  type CreatureRigState,
  type CreatureSkeletonContract,
} from "./creatureRig.ts";
import {
  mediumPantherCanonicalParts,
  mediumPantherObject,
} from "./mediumPantherObject.ts";

export type MediumPantherPoseId =
  | "stand-observe"
  | "walk-support"
  | "stalk"
  | "gallop-gather"
  | "gallop-extend"
  | "jump-preload"
  | "jump-flight"
  | "landing-absorb"
  | "lie-observe";

const NEUTRAL = "neutral";
const rest = (pivot: ObjectPoint) => ({ [NEUTRAL]: pivot });

export const MEDIUM_PANTHER_SKELETON: CreatureSkeletonContract = {
  id: "medium-panther-skeleton-m1",
  rootBone: "root",
  excludedSimulation: [
    "world translation",
    "physics contacts and impulses",
    "jump ballistics",
    "AI and pathfinding",
    "ragdoll",
  ],
  bones: [
    { id: "root", category: "axial", rest: rest(point(0, 0.5, -0.15)) },
    { id: "pelvis", parent: "root", category: "axial", rest: rest(point(0, 0.51, -0.38)) },
    { id: "lumbar", parent: "pelvis", category: "axial", rest: rest(point(0, 0.5, -0.24)) },
    { id: "chest", parent: "lumbar", category: "axial", rest: rest(point(0, 0.53, 0.15)) },
    { id: "neck", parent: "chest", category: "head", rest: rest(point(0, 0.59, 0.32)) },
    { id: "head", parent: "neck", category: "head", rest: rest(point(0, 0.67, 0.49)) },
    { id: "left-scapula", parent: "chest", category: "limb", rest: rest(point(-0.155, 0.61, 0.25)) },
    { id: "left-forearm", parent: "left-scapula", category: "limb", rest: rest(point(-0.155, 0.36, 0.31)) },
    { id: "left-carpus", parent: "left-forearm", category: "limb", rest: rest(point(-0.155, 0.14, 0.39)) },
    { id: "left-forepaw", parent: "left-carpus", category: "limb", rest: rest(point(-0.155, 0.065, 0.43)) },
    { id: "right-scapula", parent: "chest", category: "limb", rest: rest(point(0.155, 0.61, 0.25)) },
    { id: "right-forearm", parent: "right-scapula", category: "limb", rest: rest(point(0.155, 0.36, 0.31)) },
    { id: "right-carpus", parent: "right-forearm", category: "limb", rest: rest(point(0.155, 0.14, 0.39)) },
    { id: "right-forepaw", parent: "right-carpus", category: "limb", rest: rest(point(0.155, 0.065, 0.43)) },
    { id: "left-hip", parent: "pelvis", category: "limb", rest: rest(point(-0.135, 0.54, -0.35)) },
    { id: "left-knee", parent: "left-hip", category: "limb", rest: rest(point(-0.135, 0.36, -0.14)) },
    { id: "left-hock", parent: "left-knee", category: "limb", rest: rest(point(-0.135, 0.17, -0.44)) },
    { id: "left-hindpaw", parent: "left-hock", category: "limb", rest: rest(point(-0.135, 0.065, -0.3)) },
    { id: "right-hip", parent: "pelvis", category: "limb", rest: rest(point(0.135, 0.54, -0.35)) },
    { id: "right-knee", parent: "right-hip", category: "limb", rest: rest(point(0.135, 0.36, -0.14)) },
    { id: "right-hock", parent: "right-knee", category: "limb", rest: rest(point(0.135, 0.17, -0.44)) },
    { id: "right-hindpaw", parent: "right-hock", category: "limb", rest: rest(point(0.135, 0.065, -0.3)) },
    { id: "tail-0", parent: "pelvis", category: "tail", rest: rest(point(0, 0.53, -0.535)) },
    { id: "tail-1", parent: "tail-0", category: "tail", rest: rest(point(0, 0.52, -0.675)) },
    { id: "tail-2", parent: "tail-1", category: "tail", rest: rest(point(0.015, 0.48, -0.815)) },
    { id: "tail-3", parent: "tail-2", category: "tail", rest: rest(point(0.04, 0.42, -0.955)) },
    { id: "tail-4", parent: "tail-3", category: "tail", rest: rest(point(0.055, 0.35, -1.095)) },
    { id: "tail-5", parent: "tail-4", category: "tail", rest: rest(point(0.04, 0.29, -1.225)) },
    { id: "tail-6", parent: "tail-5", category: "tail", rest: rest(point(0.015, 0.25, -1.335)) },
    { id: "tail-7", parent: "tail-6", category: "tail", rest: rest(point(0, 0.27, -1.415)) },
  ],
};

const standingContacts = ["left-fore-paw", "right-fore-paw", "left-hind-paw", "right-hind-paw"] as const;

export const MEDIUM_PANTHER_POSES: readonly CreaturePoseContract<MediumPantherPoseId>[] = [
  {
    id: "stand-observe", label: "OBSERVE · HEAD FIRST / WEIGHT FOLLOWS", reference: NEUTRAL,
    boneRotations: { neck: point(0, 0.13, 0), head: point(0, 0.24, -0.04), "tail-1": point(0, -0.09, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "observe",
    intent: "acquire and hold a side target", force: "diagonal load shift without root travel", response: "tail counterbalances after the head",
  },
  {
    id: "walk-support", label: "WALK · DIAGONAL SUPPORT / QUIET HEAD", reference: NEUTRAL,
    boneRotations: {
      chest: point(0, 0.05, 0), pelvis: point(0, -0.06, 0),
      "left-scapula": point(-0.3, 0, 0), "left-forearm": point(0.22, 0, 0), "left-carpus": point(0.08, 0, 0),
      "right-scapula": point(0.25, 0, 0), "right-forearm": point(-0.18, 0, 0), "right-carpus": point(-0.07, 0, 0),
      "left-hip": point(0.24, 0, 0), "left-knee": point(-0.18, 0, 0), "left-hock": point(-0.06, 0, 0),
      "right-hip": point(-0.27, 0, 0), "right-knee": point(0.2, 0, 0), "right-hock": point(0.07, 0, 0),
      neck: point(0.03, -0.04, 0), "tail-1": point(0, 0.05, 0),
    },
    contactPartIds: ["right-fore-paw", "left-hind-paw"], grounded: true, phase: "ground",
    intent: "choose the next foothold", force: "right-fore and left-hind support diagonal", response: "scapula and pelvis counter-yaw under a stabilized head",
  },
  {
    id: "stalk", label: "STALK · LOW CHEST / CONFIRMED SUPPORT", reference: NEUTRAL,
    rootTranslation: point(0, -0.13, 0),
    boneRotations: {
      chest: point(-0.08, 0, 0), pelvis: point(0.08, 0, 0), neck: point(0.12, 0, 0),
      "left-scapula": point(0.14, 0, 0), "left-forearm": point(-0.24, 0, 0), "left-carpus": point(0.1, 0, 0),
      "right-scapula": point(0.14, 0, 0), "right-forearm": point(-0.24, 0, 0), "right-carpus": point(0.1, 0, 0),
      "left-hip": point(-0.18, 0, 0), "left-knee": point(0.26, 0, 0), "left-hock": point(-0.08, 0, 0),
      "right-hip": point(-0.18, 0, 0), "right-knee": point(0.26, 0, 0), "right-hock": point(-0.08, 0, 0),
    },
    contactPartIds: standingContacts, grounded: true, phase: "ground",
    intent: "locked target with brief ground checks", force: "long duty factor and flexed limbs", response: "body advances low while the head remains quiet",
  },
  {
    id: "gallop-gather", label: "GALLOP · GATHERED SUSPENSION", reference: NEUTRAL,
    rootTranslation: point(0, 0.95, 0),
    boneRotations: {
      chest: point(-0.06, 0, 0), pelvis: point(0.04, 0, 0), lumbar: point(0.16, 0, 0),
      "left-scapula": point(0.75, 0, 0), "left-forearm": point(-1.15, 0, 0), "left-carpus": point(0.4, 0, 0),
      "right-scapula": point(0.7, 0, 0), "right-forearm": point(-1.08, 0, 0), "right-carpus": point(0.38, 0, 0),
      "left-hip": point(1.0, 0, 0), "left-knee": point(-1.4, 0, 0), "left-hock": point(0.45, 0, 0),
      "right-hip": point(0.94, 0, 0), "right-knee": point(-1.32, 0, 0), "right-hock": point(0.42, 0, 0),
      neck: point(-0.1, 0, 0), "tail-1": point(0.05, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain path through suspension", force: "hindlimbs gathered under flexed lumbar", response: "chest rises while the tail damps roll",
  },
  {
    id: "gallop-extend", label: "GALLOP · EXTENDED SUSPENSION", reference: NEUTRAL,
    rootTranslation: point(0, 1.05, 0), rootRotation: point(0.02, 0, 0),
    boneRotations: {
      chest: point(-0.16, 0, 0), pelvis: point(0.2, 0, 0), lumbar: point(0.14, 0, 0),
      "left-scapula": point(-1.0, 0, 0), "left-forearm": point(0.12, 0, 0),
      "right-scapula": point(-0.94, 0, 0), "right-forearm": point(0.1, 0, 0),
      "left-hip": point(-1.0, 0, 0), "left-knee": point(0.1, 0, 0),
      "right-hip": point(-0.94, 0, 0), "right-knee": point(0.08, 0, 0),
      neck: point(-0.05, 0, 0), "tail-1": point(-0.05, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "reach along the chosen path", force: "spine and hips extend after the push", response: "forelimbs reach while head pitch stays quiet",
  },
  {
    id: "jump-preload", label: "JUMP · PRELOAD / COM IN HIND SUPPORT", reference: NEUTRAL,
    rootTranslation: point(0, -0.12, -0.04),
    boneRotations: {
      pelvis: point(0.1, 0, 0), lumbar: point(0.14, 0, 0), chest: point(-0.08, 0, 0),
      "left-hip": point(-0.5, 0, 0), "left-knee": point(0.8, 0, 0), "left-hock": point(-0.3, 0, 0),
      "right-hip": point(-0.5, 0, 0), "right-knee": point(0.8, 0, 0), "right-hock": point(-0.3, 0, 0),
      "left-scapula": point(-0.35, 0, 0), "left-forearm": point(0.6, 0, 0), "left-carpus": point(-0.25, 0, 0),
      "right-scapula": point(-0.35, 0, 0), "right-forearm": point(0.6, 0, 0), "right-carpus": point(-0.25, 0, 0),
      neck: point(-0.04, 0, 0),
    },
    contactPartIds: ["left-hind-paw", "right-hind-paw"], grounded: true, phase: "transition",
    intent: "landing target and exit path already acquired", force: "pelvis loads flexed hindlimbs", response: "forequarters brace before unloading",
  },
  {
    id: "jump-flight", label: "JUMP · BALLISTIC FLIGHT / REACH", reference: NEUTRAL,
    rootTranslation: point(0, 1.25, 0.2), rootRotation: point(-0.12, 0, 0),
    boneRotations: {
      chest: point(-0.08, 0, 0), pelvis: point(0.14, 0, 0),
      "left-scapula": point(-0.52, 0, 0), "left-forearm": point(0.18, 0, 0),
      "right-scapula": point(-0.52, 0, 0), "right-forearm": point(0.18, 0, 0),
      "left-hip": point(0.52, 0, 0), "left-knee": point(-0.78, 0, 0), "left-hock": point(0.28, 0, 0),
      "right-hip": point(0.52, 0, 0), "right-knee": point(-0.78, 0, 0), "right-hock": point(0.28, 0, 0),
      neck: point(0.08, 0, 0), "tail-1": point(-0.08, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "head leads the landing patch", force: "no hidden lift after toe-off", response: "forepaws protract and hindlimbs reduce inertia",
  },
  {
    id: "landing-absorb", label: "LANDING · FORE CONTACT / SCAPULA ABSORPTION", reference: NEUTRAL,
    rootTranslation: point(0, -0.08, 0.08),
    boneRotations: {
      chest: point(-0.08, 0, 0), pelvis: point(0.12, 0, 0), lumbar: point(0.1, 0, 0), neck: point(-0.08, 0, 0),
      "left-scapula": point(-1.0, 0, 0), "left-forearm": point(1.7, 0, 0), "left-carpus": point(-0.7, 0, 0),
      "right-scapula": point(-1.0, 0, 0), "right-forearm": point(1.7, 0, 0), "right-carpus": point(-0.7, 0, 0),
      "left-hip": point(-0.4, 0, 0), "left-knee": point(0.7, 0, 0), "left-hock": point(-0.25, 0, 0),
      "right-hip": point(-0.4, 0, 0), "right-knee": point(0.7, 0, 0), "right-hock": point(-0.25, 0, 0),
    },
    contactPartIds: ["left-fore-paw", "right-fore-paw"], grounded: true, phase: "impact",
    intent: "look through the landing into the continuation path", force: "pads, carpi, elbows and scapulae take first impulse", response: "pelvis follows instead of stopping in one frame",
  },
  {
    id: "lie-observe", label: "STERNAL LIE · QUIET BODY / ACTIVE HEAD", reference: NEUTRAL,
    rootTranslation: point(0, -0.34, -0.02),
    boneRotations: {
      chest: point(-0.06, 0, 0), pelvis: point(0.08, 0, 0), neck: point(-0.34, 0.12, 0), head: point(0.1, 0.18, 0),
      "left-scapula": point(0.72, 0, 0), "left-forearm": point(-0.92, 0, 0),
      "right-scapula": point(0.72, 0, 0), "right-forearm": point(-0.92, 0, 0),
      "left-hip": point(0.86, 0, 0), "left-knee": point(-1.12, 0, 0), "left-hock": point(0.34, 0, 0),
      "right-hip": point(0.86, 0, 0), "right-knee": point(-1.12, 0, 0), "right-hock": point(0.34, 0, 0),
      "tail-1": point(0, 0.22, 0), "tail-2": point(0, 0.2, 0),
    },
    contactPartIds: ["belly-shadow"], grounded: true, phase: "observe",
    intent: "low-urgency side observation", force: "sternum and belly carry the rest pose", response: "head rises independently while paws stay planted",
  },
] as const;

function pantherBoneForPart(part: ObjectLabPart): string {
  const id = part.id;
  if (id === "pelvis") return "pelvis";
  if (id === "lumbar") return "lumbar";
  if (["ribcage", "ribcage-rear", "belly-shadow"].includes(id)) return "chest";
  if (id === "neck-base") return "neck";
  if (id === "neck-head-joint" || part.group === "face" || id === "skull" || id.includes("cheek") || id.includes("muzzle")) return "head";
  const side = id.startsWith("left-") ? "left" : id.startsWith("right-") ? "right" : undefined;
  if (side) {
    if (id.endsWith("scapula") || id.endsWith("humerus")) return `${side}-scapula`;
    if (id.endsWith("elbow") || id.endsWith("radius-ulna")) return `${side}-forearm`;
    if (id.endsWith("carpus") || id.endsWith("metacarpus")) return `${side}-carpus`;
    if (id.includes("fore-paw") || id.includes("fore-toes")) return `${side}-forepaw`;
    if (id.endsWith("femur")) return `${side}-hip`;
    if (id.endsWith("knee") || id.endsWith("tibia")) return `${side}-knee`;
    if (id.endsWith("hock") || id.endsWith("metatarsus")) return `${side}-hock`;
    if (id.includes("hind-paw") || id.includes("hind-toes")) return `${side}-hindpaw`;
  }
  const tailSegment = /^tail-(\d+)$/.exec(id);
  if (tailSegment) return `tail-${Number(tailSegment[1]) - 1}`;
  const tailJoint = /^tail-joint-(\d+)$/.exec(id);
  if (tailJoint) return `tail-${tailJoint[1]}`;
  throw new Error(`${id}: no panther bone mapping`);
}

const poseGroups = MEDIUM_PANTHER_POSES.map((pose) => `panther-pose-${pose.id}`);
const results = MEDIUM_PANTHER_POSES.map((pose) => buildCreaturePoseDerivative({
  skeleton: MEDIUM_PANTHER_SKELETON,
  pose,
  sourceParts: mediumPantherCanonicalParts,
  group: `panther-pose-${pose.id}`,
  resolvePartBone: pantherBoneForPart,
}));

export const mediumPantherRigStates: Readonly<Record<MediumPantherPoseId, CreatureRigState>> = Object.fromEntries(
  MEDIUM_PANTHER_POSES.map((pose, index) => [pose.id, results[index].state]),
) as Readonly<Record<MediumPantherPoseId, CreatureRigState>>;

function poseView(pose: CreaturePoseContract<MediumPantherPoseId>): CreatureLabView {
  const airborne = pose.phase === "air";
  return {
    id: `panther-${pose.id}`,
    label: pose.label,
    projection: "perspective",
    position: airborne ? point(2.9, 2.2, 3.5) : point(2.35, 1.35, 3.0),
    target: airborne ? point(0, 1.15, -0.05) : point(0, 0.46, -0.12),
    fov: airborne ? 27 : 25,
    hiddenGroups: [...poseGroups.filter((group) => group !== `panther-pose-${pose.id}`), "panther-skeleton-rig"],
  };
}

const skeletonState = mediumPantherRigStates["stand-observe"];
const skeletonParts = buildCreatureRigParts(MEDIUM_PANTHER_SKELETON, skeletonState, "panther-skeleton-rig", 0.026);

export const mediumPantherPoseAtlasObject: CreatureLabModel = {
  ...mediumPantherObject,
  id: "medium-panther-pose-atlas",
  revision: "panther-rig-m1-2026-08-13",
  title: "MEDIUM PANTHER · ONE SKELETON / KEY ACTIONS",
  sourceNotes: [
    ...mediumPantherObject.sourceNotes,
    "All nine action states are deterministic derivatives of the accepted P4 parts and one FK hierarchy.",
    "Frames prove articulation only; root motion, forces, jump ballistics, contacts and AI remain excluded.",
  ],
  anchors: {
    ...mediumPantherObject.anchors,
    rigRoot: skeletonState.pivots.root,
    rigHead: skeletonState.pivots.head,
  },
  motionConstraints: {
    singleCanonicalSkeleton: true,
    poseCount: MEDIUM_PANTHER_POSES.length,
    runtimeRegistered: false,
    physicsImplemented: false,
    jumpBallisticsImplemented: false,
  },
  labEnvironment: { floorRadius: 4, gridSize: 4, gridDivisions: 20, fogNear: 12, fogFar: 18, floorY: -0.005 },
  parts: [...results.flatMap((result) => result.parts), ...skeletonParts],
  views: [
    ...MEDIUM_PANTHER_POSES.map(poseView),
    {
      id: "panther-skeleton-profile",
      label: "SKELETON · PROFILE / AXIAL + LIMB CHAINS",
      projection: "orthographic",
      position: point(3.2, 0.7, 0),
      target: point(0, 0.48, -0.3),
      orthoHeight: 1.55,
      hiddenGroups: poseGroups,
    },
    {
      id: "panther-skeleton-three-quarter",
      label: "SKELETON · THREE QUARTER / SCAPULA + HOCK",
      projection: "perspective",
      position: point(2.15, 1.4, 2.75),
      target: point(0, 0.46, -0.16),
      fov: 25,
      hiddenGroups: poseGroups,
    },
  ],
};
