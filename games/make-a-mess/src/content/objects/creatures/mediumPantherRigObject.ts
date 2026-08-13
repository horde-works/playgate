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
  | "stalk"
  | "jump-preload"
  | "jump-flight"
  | "landing-absorb"
  | "lie-observe"
  | "sit-observe"
  | "walk-01-left-hind-lift"
  | "walk-02-left-hind-place"
  | "walk-03-left-fore-lift"
  | "walk-04-left-fore-place"
  | "walk-05-right-hind-lift"
  | "walk-06-right-hind-place"
  | "walk-07-right-fore-lift"
  | "walk-08-right-fore-place"
  | "trot-01-left-diagonal"
  | "trot-02-flight"
  | "trot-03-right-diagonal"
  | "trot-04-flight"
  | "gallop-01-extended-flight"
  | "gallop-02-right-fore-contact"
  | "gallop-03-left-fore-contact"
  | "gallop-04-gathered-flight"
  | "gallop-05-left-hind-contact"
  | "gallop-06-right-hind-push"
  | "gallop-07-spine-opening"
  | "gallop-08-extended-flight"
  | "accelerate-hind-drive"
  | "brake-fore-absorb";

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

type LimbChain = readonly [number, number, number];

const FORE_MID: LimbChain = [0, 0, 0];
const FORE_FORWARD: LimbChain = [-0.3, 0.22, 0.08];
const FORE_BACK: LimbChain = [0.27, -0.19, -0.07];
const FORE_SWING: LimbChain = [-0.5, 0.7, -0.28];
const FORE_GATHER: LimbChain = [1.5, -1.7, -0.5];
const FORE_REACH: LimbChain = [-1.0, 0.12, 0];
const HIND_MID: LimbChain = [0, 0, 0];
const HIND_FORWARD: LimbChain = [-0.29, 0.21, 0.07];
const HIND_BACK: LimbChain = [0.25, -0.18, -0.06];
const HIND_SWING: LimbChain = [-0.52, 0.78, -0.3];
const HIND_GATHER: LimbChain = [-0.3, 1, 0];
const HIND_REACH: LimbChain = [1, 0, 0];

function limbRotations(
  leftFore: LimbChain,
  rightFore: LimbChain,
  leftHind: LimbChain,
  rightHind: LimbChain,
): Readonly<Record<string, ObjectPoint>> {
  return {
    "left-scapula": point(leftFore[0], 0, 0),
    "left-forearm": point(leftFore[1], 0, 0),
    "left-carpus": point(leftFore[2], 0, 0),
    "right-scapula": point(rightFore[0], 0, 0),
    "right-forearm": point(rightFore[1], 0, 0),
    "right-carpus": point(rightFore[2], 0, 0),
    "left-hip": point(leftHind[0], 0, 0),
    "left-knee": point(leftHind[1], 0, 0),
    "left-hock": point(leftHind[2], 0, 0),
    "right-hip": point(rightHind[0], 0, 0),
    "right-knee": point(rightHind[1], 0, 0),
    "right-hock": point(rightHind[2], 0, 0),
  };
}

export const MEDIUM_PANTHER_POSES: readonly CreaturePoseContract<MediumPantherPoseId>[] = [
  {
    id: "stand-observe", label: "OBSERVE · HEAD FIRST / WEIGHT FOLLOWS", reference: NEUTRAL,
    boneRotations: { neck: point(0, 0.13, 0), head: point(0, 0.24, -0.04), "tail-1": point(0, -0.09, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "observe",
    intent: "acquire and hold a side target", force: "diagonal load shift without root travel", response: "tail counterbalances after the head",
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
    id: "jump-preload", label: "JUMP · PRELOAD / COM IN HIND SUPPORT", reference: NEUTRAL,
    rootTranslation: point(0, -0.12, -0.04),
    boneRotations: {
      pelvis: point(0.1, 0, 0), lumbar: point(0.14, 0, 0), chest: point(-0.08, 0, 0),
      "left-hip": point(-0.5, 0, 0), "left-knee": point(0.8, 0, 0), "left-hock": point(-0.3, 0, 0),
      "right-hip": point(-0.5, 0, 0), "right-knee": point(0.8, 0, 0), "right-hock": point(-0.3, 0, 0),
      "left-scapula": point(-1, 0, 0), "left-forearm": point(0, 0, 0), "left-carpus": point(-0.5, 0, 0),
      "right-scapula": point(-1, 0, 0), "right-forearm": point(0, 0, 0), "right-carpus": point(-0.5, 0, 0),
      neck: point(-0.04, 0, 0),
    },
    contactPartIds: standingContacts, grounded: true, phase: "transition",
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
  {
    id: "sit-observe", label: "PERCH SIT · HIGH GAZE / FOLDED HINDQUARTERS", reference: NEUTRAL,
    rootTranslation: point(0, -0.12, -0.04),
    boneRotations: {
      pelvis: point(0.16, 0, 0), lumbar: point(-0.1, 0, 0), chest: point(-0.12, 0, 0),
      neck: point(-0.16, 0.11, 0), head: point(0.08, 0.18, 0),
      "left-scapula": point(-0.8, 0, 0), "left-forearm": point(0.8, 0, 0), "left-carpus": point(-0.8, 0, 0),
      "right-scapula": point(-0.8, 0, 0), "right-forearm": point(0.8, 0, 0), "right-carpus": point(-0.8, 0, 0),
      "left-hip": point(-0.4, 0, 0), "left-knee": point(0.9, 0, 0), "left-hock": point(0, 0, 0),
      "right-hip": point(-0.4, 0, 0), "right-knee": point(0.9, 0, 0), "right-hock": point(0, 0, 0),
      "tail-1": point(0, 0.24, 0), "tail-2": point(0, 0.28, 0), "tail-3": point(0, 0.22, 0),
    },
    contactPartIds: standingContacts, grounded: true, phase: "observe",
    intent: "hold a raised survey point with a clear exit already selected", force: "folded hindquarters carry the pelvis while straight forelimbs support the chest", response: "head scans above a quiet trunk and the tail curls around the platform",
  },
  {
    id: "walk-01-left-hind-lift", label: "WALK 01 · LEFT HIND LIFTS", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_BACK, FORE_FORWARD, HIND_SWING, HIND_MID), pelvis: point(0, -0.04, 0.025), chest: point(0, 0.025, -0.018), neck: point(0.02, 0, 0), "tail-1": point(0, 0.045, 0) },
    contactPartIds: ["left-fore-paw", "right-fore-paw", "right-hind-paw"], grounded: true, phase: "ground",
    intent: "advance the left hind foot into the previous ipsilateral fore track", force: "three supports retain a broad polygon during low swing", response: "pelvis yaws first and the tail answers after placement",
  },
  {
    id: "walk-02-left-hind-place", label: "WALK 02 · LEFT HIND PLACES", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_BACK, FORE_FORWARD, HIND_FORWARD, HIND_BACK), pelvis: point(0, -0.055, 0.018), chest: point(0, 0.03, -0.015), "tail-1": point(0, 0.035, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "ground",
    intent: "confirm left hind purchase before the shoulder releases", force: "new hind contact receives load while the other three remain quiet", response: "pelvis settles without a head bob",
  },
  {
    id: "walk-03-left-fore-lift", label: "WALK 03 · LEFT FORE LIFTS", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_SWING, FORE_MID, HIND_FORWARD, HIND_BACK), pelvis: point(0, 0.025, -0.02), chest: point(0, -0.045, 0.025), neck: point(-0.02, 0, 0), "tail-1": point(0, 0.015, 0) },
    contactPartIds: ["right-fore-paw", "left-hind-paw", "right-hind-paw"], grounded: true, phase: "ground",
    intent: "carry the left forepaw past the loaded left hind support", force: "scapula slides forward while the elbow folds for toe clearance", response: "neck cancels most of the chest pitch",
  },
  {
    id: "walk-04-left-fore-place", label: "WALK 04 · LEFT FORE PLACES", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_FORWARD, FORE_BACK, HIND_FORWARD, HIND_BACK), pelvis: point(0, 0.035, -0.018), chest: point(0, -0.05, 0.02), "tail-1": point(0, -0.015, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "ground",
    intent: "place the left forepaw before transferring the chest", force: "pad contact precedes scapular loading", response: "chest advances over the quiet paw and the head remains level",
  },
  {
    id: "walk-05-right-hind-lift", label: "WALK 05 · RIGHT HIND LIFTS", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_FORWARD, FORE_BACK, HIND_MID, HIND_SWING), pelvis: point(0, 0.04, -0.025), chest: point(0, -0.025, 0.018), neck: point(0.02, 0, 0), "tail-1": point(0, -0.045, 0) },
    contactPartIds: ["left-fore-paw", "right-fore-paw", "left-hind-paw"], grounded: true, phase: "ground",
    intent: "advance the right hind foot into the previous ipsilateral fore track", force: "three supports retain a broad polygon during low swing", response: "pelvis reverses yaw and the tail follows late",
  },
  {
    id: "walk-06-right-hind-place", label: "WALK 06 · RIGHT HIND PLACES", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_FORWARD, FORE_BACK, HIND_BACK, HIND_FORWARD), pelvis: point(0, 0.055, -0.018), chest: point(0, -0.03, 0.015), "tail-1": point(0, -0.035, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "ground",
    intent: "confirm right hind purchase before the shoulder releases", force: "new hind contact receives load while the other three remain quiet", response: "pelvis settles without a head bob",
  },
  {
    id: "walk-07-right-fore-lift", label: "WALK 07 · RIGHT FORE LIFTS", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_MID, FORE_SWING, HIND_BACK, HIND_FORWARD), pelvis: point(0, -0.025, 0.02), chest: point(0, 0.045, -0.025), neck: point(-0.02, 0, 0), "tail-1": point(0, -0.015, 0) },
    contactPartIds: ["left-fore-paw", "left-hind-paw", "right-hind-paw"], grounded: true, phase: "ground",
    intent: "carry the right forepaw past the loaded right hind support", force: "scapula slides forward while the elbow folds for toe clearance", response: "neck cancels most of the chest pitch",
  },
  {
    id: "walk-08-right-fore-place", label: "WALK 08 · RIGHT FORE PLACES", reference: NEUTRAL,
    boneRotations: { ...limbRotations(FORE_BACK, FORE_FORWARD, HIND_BACK, HIND_FORWARD), pelvis: point(0, -0.035, 0.018), chest: point(0, 0.05, -0.02), "tail-1": point(0, 0.015, 0) },
    contactPartIds: standingContacts, grounded: true, phase: "ground",
    intent: "place the right forepaw before returning to left hind swing", force: "pad contact precedes scapular loading", response: "chest advances over the quiet paw and the cycle closes without a root jump",
  },
  {
    id: "trot-01-left-diagonal", label: "TROT 01 · LEFT FORE + RIGHT HIND", reference: NEUTRAL,
    rootTranslation: point(0, 0.03, 0),
    boneRotations: { ...limbRotations(FORE_BACK, FORE_GATHER, HIND_GATHER, HIND_FORWARD), chest: point(-0.035, 0, 0), pelvis: point(0.035, 0, 0), neck: point(0.03, 0, 0) },
    contactPartIds: ["left-fore-paw", "right-hind-paw"], grounded: true, phase: "ground",
    intent: "carry speed on the first diagonal while looking beyond the next step", force: "left fore and right hind share the spring-like support", response: "scapula and pelvis counter the diagonal impulse under a quiet head",
  },
  {
    id: "trot-02-flight", label: "TROT 02 · DIAGONAL UNLOAD", reference: NEUTRAL,
    rootTranslation: point(0, 0.45, 0),
    boneRotations: { ...limbRotations(FORE_GATHER, FORE_FORWARD, HIND_FORWARD, HIND_GATHER), chest: point(0.025, 0, 0), pelvis: point(-0.025, 0, 0), neck: point(-0.025, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain the chosen line between diagonals", force: "the first diagonal has unloaded without a gallop-style spinal fold", response: "limbs exchange roles while head height changes least",
  },
  {
    id: "trot-03-right-diagonal", label: "TROT 03 · RIGHT FORE + LEFT HIND", reference: NEUTRAL,
    rootTranslation: point(0, 0.03, 0),
    boneRotations: { ...limbRotations(FORE_GATHER, FORE_BACK, HIND_FORWARD, HIND_GATHER), chest: point(0.035, 0, 0), pelvis: point(-0.035, 0, 0), neck: point(0.03, 0, 0) },
    contactPartIds: ["right-fore-paw", "left-hind-paw"], grounded: true, phase: "ground",
    intent: "carry speed on the second diagonal while looking beyond the next step", force: "right fore and left hind share the spring-like support", response: "scapula and pelvis reverse their small counter-rotation",
  },
  {
    id: "trot-04-flight", label: "TROT 04 · DIAGONAL UNLOAD", reference: NEUTRAL,
    rootTranslation: point(0, 0.45, 0),
    boneRotations: { ...limbRotations(FORE_FORWARD, FORE_GATHER, HIND_GATHER, HIND_FORWARD), chest: point(-0.025, 0, 0), pelvis: point(0.025, 0, 0), neck: point(-0.025, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain the chosen line before the cycle repeats", force: "the second diagonal unloads with limited spinal excursion", response: "limbs exchange roles and the tail damps the alternating roll",
  },
  {
    id: "gallop-01-extended-flight", label: "GALLOP 01 · EXTENDED SUSPENSION", reference: NEUTRAL,
    rootTranslation: point(0, 1.05, 0), rootRotation: point(0.02, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, FORE_REACH, HIND_REACH, HIND_REACH), chest: point(-0.16, 0, 0), pelvis: point(0.2, 0, 0), lumbar: point(0.14, 0, 0), neck: point(-0.05, 0, 0), "tail-1": point(-0.05, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold the line through the main ballistic phase", force: "spine and limb chains reach after hind toe-off", response: "head pitch stays quieter than the fully extended trunk",
  },
  {
    id: "gallop-02-right-fore-contact", label: "GALLOP 02 · RIGHT FORE CONTACT", reference: NEUTRAL,
    rootTranslation: point(0, -0.02, 0.05), rootRotation: point(-0.08, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, [-0.78, 1.28, -0.48], HIND_GATHER, HIND_GATHER), chest: point(-0.1, 0, 0), lumbar: point(0.08, 0, 0), neck: point(-0.08, 0, 0) },
    contactPartIds: ["right-fore-paw"], grounded: true, phase: "impact",
    intent: "accept the descending trajectory on the near forepaw", force: "pad, carpus, elbow and scapula begin the collision sequence", response: "chest follows the paw while pelvis keeps travelling forward",
  },
  {
    id: "gallop-03-left-fore-contact", label: "GALLOP 03 · LEFT FORE CONTACT", reference: NEUTRAL,
    rootTranslation: point(0, -0.05, 0.08), rootRotation: point(-0.05, 0, 0),
    boneRotations: { ...limbRotations([-0.7, 1.2, -0.45], FORE_GATHER, HIND_GATHER, HIND_GATHER), chest: point(-0.08, 0, 0), lumbar: point(0.14, 0, 0), pelvis: point(0.08, 0, 0) },
    contactPartIds: ["left-fore-paw"], grounded: true, phase: "impact",
    intent: "complete forequarter support without losing the exit line", force: "the far forelimb finishes the downward-to-forward deflection", response: "lumbar flexion gathers the hindlimbs beneath the travelling pelvis",
  },
  {
    id: "gallop-04-gathered-flight", label: "GALLOP 04 · GATHERED SUSPENSION", reference: NEUTRAL,
    rootTranslation: point(0, 0.8, 0),
    boneRotations: { ...limbRotations(FORE_GATHER, FORE_GATHER, HIND_GATHER, HIND_GATHER), chest: point(-0.06, 0, 0), pelvis: point(0.04, 0, 0), lumbar: point(0.3, 0, 0), neck: point(-0.1, 0, 0), "tail-1": point(0.05, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain the path during the short collected flight", force: "flexed lumbar brings all four limbs beneath the body", response: "tail damps roll before hind contact",
  },
  {
    id: "gallop-05-left-hind-contact", label: "GALLOP 05 · LEFT HIND CONTACT", reference: NEUTRAL,
    rootTranslation: point(0, -0.04, -0.02), rootRotation: point(0.05, 0, 0),
    boneRotations: { ...limbRotations(FORE_GATHER, FORE_GATHER, HIND_MID, HIND_GATHER), pelvis: point(0.12, 0, 0), lumbar: point(0.22, 0, 0), chest: point(-0.04, 0, 0) },
    contactPartIds: ["left-hind-paw"], grounded: true, phase: "ground",
    intent: "place the far hind foot under the centre of mass", force: "the first hind contact begins the upward-forward redirection", response: "pelvis loads before the spine opens",
  },
  {
    id: "gallop-06-right-hind-push", label: "GALLOP 06 · RIGHT HIND PUSH", reference: NEUTRAL,
    rootTranslation: point(0, -0.02, -0.04), rootRotation: point(0.08, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, FORE_REACH, HIND_GATHER, [0.4, -0.1, 0.2]), pelvis: point(0.2, 0, 0), lumbar: point(0.12, 0, 0), chest: point(-0.08, 0, 0) },
    contactPartIds: ["right-hind-paw"], grounded: true, phase: "ground",
    intent: "finish propulsion into the next extended flight", force: "near hindlimb supplies the final long ground impulse", response: "spine starts opening only as the paw unloads",
  },
  {
    id: "gallop-07-spine-opening", label: "GALLOP 07 · SPINE OPENS", reference: NEUTRAL,
    rootTranslation: point(0, 0.72, 0), rootRotation: point(0.06, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, FORE_REACH, HIND_BACK, HIND_BACK), pelvis: point(0.22, 0, 0), lumbar: point(0.02, 0, 0), chest: point(-0.14, 0, 0), neck: point(-0.04, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "continue acceleration after hind toe-off", force: "stored axial flexion releases into stride length", response: "forelimbs reach while the head resists the pitch change",
  },
  {
    id: "gallop-08-extended-flight", label: "GALLOP 08 · EXTENDED SUSPENSION", reference: NEUTRAL,
    rootTranslation: point(0, 1.05, 0), rootRotation: point(0.02, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, FORE_REACH, HIND_REACH, HIND_REACH), chest: point(-0.16, 0, 0), pelvis: point(0.2, 0, 0), lumbar: point(0.14, 0, 0), neck: point(-0.05, 0, 0), "tail-1": point(-0.05, 0, 0) },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "close the rotary cycle before the next near fore contact", force: "fully opened spine carries the longest ballistic reach", response: "tail and neck settle the body for contact",
  },
  {
    id: "accelerate-hind-drive", label: "TRANSITION · ACCELERATE / HIND DRIVE", reference: NEUTRAL,
    rootTranslation: point(0, -0.12, -0.04), rootRotation: point(-0.08, 0, 0),
    boneRotations: { ...limbRotations(FORE_REACH, FORE_REACH, HIND_BACK, HIND_BACK), pelvis: point(0.18, 0, 0), lumbar: point(0.14, 0, 0), chest: point(-0.12, 0, 0), neck: point(0.08, 0, 0) },
    contactPartIds: ["left-hind-paw", "right-hind-paw"], grounded: true, phase: "transition",
    intent: "commit to a selected corridor before increasing stride", force: "lower pelvis and longer hind contact add forward impulse", response: "forequarters reach while the gaze is already beyond them",
  },
  {
    id: "brake-fore-absorb", label: "TRANSITION · BRAKE / FORE ABSORB", reference: NEUTRAL,
    rootTranslation: point(0, -0.1, 0.08), rootRotation: point(-0.08, 0, 0),
    boneRotations: { ...limbRotations([-0.92, 1.58, -0.64], [-0.92, 1.58, -0.64], HIND_GATHER, HIND_GATHER), chest: point(-0.1, 0, 0), pelvis: point(0.14, 0, 0), lumbar: point(0.12, 0, 0), neck: point(-0.08, 0, 0) },
    contactPartIds: ["left-fore-paw", "right-fore-paw"], grounded: true, phase: "impact",
    intent: "shed speed while retaining a usable continuation path", force: "both fore chains absorb before the pelvis arrives", response: "hindquarters gather instead of snapping the trunk level",
  },
] as const;

export function mediumPantherBoneForPart(part: ObjectLabPart): string {
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
  resolvePartBone: mediumPantherBoneForPart,
}));

export const mediumPantherRigStates: Readonly<Record<MediumPantherPoseId, CreatureRigState>> = Object.fromEntries(
  MEDIUM_PANTHER_POSES.map((pose, index) => [pose.id, results[index].state]),
) as Readonly<Record<MediumPantherPoseId, CreatureRigState>>;

function poseView(pose: CreaturePoseContract<MediumPantherPoseId>): CreatureLabView {
  const airborne = pose.phase === "air";
  const locomotion = pose.id.startsWith("walk-") || pose.id.startsWith("trot-") || pose.id.startsWith("gallop-");
  return {
    id: `panther-${pose.id}`,
    label: pose.label,
    projection: "perspective",
    position: locomotion
      ? point(3.45, airborne ? 1.55 : 1.05, 0.72)
      : airborne ? point(2.9, 2.2, 3.5) : point(2.35, 1.35, 3.0),
    target: locomotion
      ? point(0, airborne ? 1.05 : 0.48, -0.3)
      : airborne ? point(0, 1.15, -0.05) : point(0, 0.46, -0.12),
    fov: locomotion ? 24 : airborne ? 27 : 25,
    hiddenGroups: [...poseGroups.filter((group) => group !== `panther-pose-${pose.id}`), "panther-skeleton-rig"],
  };
}

const skeletonState = mediumPantherRigStates["stand-observe"];
const skeletonParts = buildCreatureRigParts(MEDIUM_PANTHER_SKELETON, skeletonState, "panther-skeleton-rig", 0.026);

export const mediumPantherPoseAtlasObject: CreatureLabModel = {
  ...mediumPantherObject,
  id: "medium-panther-pose-atlas",
  revision: "panther-rig-m2-2026-08-13",
  title: "MEDIUM PANTHER · WALK / TROT / ROTARY GALLOP",
  sourceNotes: [
    ...mediumPantherObject.sourceNotes,
    "All action and gait frames are deterministic derivatives of the accepted P4 parts and one FK hierarchy.",
    "Walk uses a lateral footfall sequence; trot alternates diagonals; rotary gallop includes gathered and extended suspension.",
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
