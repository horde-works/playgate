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
  mediumDragonFlightCanonicalParts,
  mediumDragonFlightObject,
  mediumDragonGroundCanonicalParts,
  mediumDragonGroundObject,
} from "./mediumDragonObject.ts";

export type MediumDragonPoseId =
  | "ground-observe"
  | "walk-support"
  | "takeoff-preload"
  | "takeoff-hind-drive"
  | "takeoff-manus-vault"
  | "takeoff-clearance"
  | "takeoff-unfold"
  | "takeoff-first-downstroke"
  | "flight-downstroke"
  | "flight-upstroke"
  | "glide"
  | "bank-turn"
  | "hover-brake"
  | "dive"
  | "landing-flare"
  | "landing-touchdown"
  | "landing-wing-unload"
  | "ground-recovery";

const GROUND = "ground-folded";
const FLIGHT = "flight-extended";
const rests = (ground: ObjectPoint, flight: ObjectPoint = ground) => ({ [GROUND]: ground, [FLIGHT]: flight });
const mirrored = (side: -1 | 1, value: ObjectPoint): ObjectPoint => point(side * value[0], value[1], value[2]);

const groundWing: readonly ObjectPoint[] = [
  point(0.46, 1.16, 0.27), point(0.65, 0.75, -0.82), point(0.72, 0.16, 0.5),
  point(0.76, 0.45, 0.04), point(0.78, 0.72, -0.44), point(0.77, 0.85, -0.98),
  point(0.7, 0.82, -1.51), point(0.56, 0.77, -2.01),
];
const flightWing: readonly ObjectPoint[] = [
  point(0.46, 1.16, 0.27), point(1.64, 1.16, 0.27), point(3.09, 1.16, 0.27),
  point(3.64, 1.16, 0.27), point(4.19, 1.16, 0.27), point(4.75, 1.16, 0.27),
  point(5.29, 1.16, 0.27), point(5.81, 1.16, 0.27),
];

const tail: readonly ObjectPoint[] = [
  point(0, 0.8, -1.08), point(0, 0.76, -1.34), point(0.03, 0.7, -1.61),
  point(0.07, 0.64, -1.88), point(0.09, 0.57, -2.15), point(0.08, 0.49, -2.42),
  point(0.045, 0.42, -2.68), point(0, 0.37, -2.93), point(-0.035, 0.35, -3.16),
  point(-0.045, 0.37, -3.36), point(-0.025, 0.42, -3.55),
];

const neck: readonly ObjectPoint[] = [
  point(0, 1.13, 0.67), point(0, 1.18, 0.93), point(0, 1.28, 1.18),
  point(0, 1.39, 1.41), point(0, 1.47, 1.62), point(0, 1.5, 1.73),
];

const bones = [
  { id: "root", category: "axial" as const, rest: rests(point(0, 0.82, -0.2)) },
  { id: "pelvis", parent: "root", category: "axial" as const, rest: rests(point(0, 0.76, -0.84)) },
  { id: "abdomen", parent: "pelvis", category: "axial" as const, rest: rests(point(0, 0.81, -0.43)) },
  { id: "chest", parent: "abdomen", category: "axial" as const, rest: rests(point(0, 0.96, 0.34)) },
  ...neck.map((pivot, index) => ({
    id: `neck-${index}`,
    parent: index === 0 ? "chest" : `neck-${index - 1}`,
    category: "head" as const,
    rest: rests(pivot),
  })),
  { id: "head", parent: "neck-5", category: "head" as const, rest: rests(point(0, 1.5, 1.73)) },
  ...([-1, 1] as const).flatMap((side) => {
    const name = side < 0 ? "left" : "right";
    const groundHind = [
      point(0.31, 0.82, -0.76), point(0.34, 0.48, -0.35),
      point(0.39, 0.23, -0.91), point(0.39, 0.075, -0.57),
    ] as const;
    const flightHind = [
      point(0.31, 0.82, -0.76), point(0.33, 1.02, -0.265),
      point(0.31, 0.92, -0.87), point(0.28, 0.86, -1.235),
    ] as const;
    return [
      { id: `${name}-hip`, parent: "pelvis", category: "limb" as const, rest: rests(mirrored(side, groundHind[0]), mirrored(side, flightHind[0])) },
      { id: `${name}-knee`, parent: `${name}-hip`, category: "limb" as const, rest: rests(mirrored(side, groundHind[1]), mirrored(side, flightHind[1])) },
      { id: `${name}-ankle`, parent: `${name}-knee`, category: "limb" as const, rest: rests(mirrored(side, groundHind[2]), mirrored(side, flightHind[2])) },
      { id: `${name}-hindfoot`, parent: `${name}-ankle`, category: "limb" as const, rest: rests(mirrored(side, groundHind[3]), mirrored(side, flightHind[3])) },
      { id: `${name}-shoulder`, parent: "chest", category: "wing" as const, rest: rests(mirrored(side, groundWing[0]), mirrored(side, flightWing[0])) },
      { id: `${name}-elbow`, parent: `${name}-shoulder`, category: "wing" as const, rest: rests(mirrored(side, groundWing[1]), mirrored(side, flightWing[1])) },
      { id: `${name}-wrist`, parent: `${name}-elbow`, category: "wing" as const, rest: rests(mirrored(side, groundWing[2]), mirrored(side, flightWing[2])) },
      { id: `${name}-metacarpal`, parent: `${name}-wrist`, category: "wing" as const, rest: rests(mirrored(side, groundWing[3]), mirrored(side, flightWing[3])) },
      { id: `${name}-finger-1`, parent: `${name}-metacarpal`, category: "wing" as const, rest: rests(mirrored(side, groundWing[4]), mirrored(side, flightWing[4])) },
      { id: `${name}-finger-2`, parent: `${name}-finger-1`, category: "wing" as const, rest: rests(mirrored(side, groundWing[5]), mirrored(side, flightWing[5])) },
      { id: `${name}-finger-3`, parent: `${name}-finger-2`, category: "wing" as const, rest: rests(mirrored(side, groundWing[6]), mirrored(side, flightWing[6])) },
      { id: `${name}-finger-4`, parent: `${name}-finger-3`, category: "wing" as const, rest: rests(mirrored(side, groundWing[7]), mirrored(side, flightWing[7])) },
      { id: `${name}-free-digit`, parent: `${name}-wrist`, category: "wing" as const, rest: rests(mirrored(side, point(0.72, 0.055, 0.87)), mirrored(side, point(3.0, 1.05, 0.627))) },
    ];
  }),
  ...tail.map((pivot, index) => ({
    id: `tail-${index}`,
    parent: index === 0 ? "pelvis" : `tail-${index - 1}`,
    category: "tail" as const,
    rest: rests(pivot),
  })),
] as const;

export const MEDIUM_DRAGON_SKELETON: CreatureSkeletonContract = {
  id: "medium-dragon-skeleton-m2",
  rootBone: "root",
  bones,
  excludedSimulation: [
    "world translation and collision",
    "aerodynamic forces and wing loading",
    "contact impulses and launch vault",
    "cloth simulation",
    "AI and navigation",
  ],
};

const fourContacts = ["left-manus-pad", "right-manus-pad", "left-hind-pad", "right-hind-pad"] as const;

type WingControl = "shoulder" | "elbow" | "wrist" | "metacarpal" | "finger-1" | "finger-2" | "finger-3";
type WingRotation = Readonly<Partial<Record<WingControl, ObjectPoint>>>;

export const MEDIUM_DRAGON_WING_MOTION = {
  architecture: "pterosaur-inspired-forelimb",
  activeControls: ["shoulder", "elbow", "wrist", "metacarpal"],
  knuckleControl: "metacarpal",
  passiveInterphalangealControls: ["finger-1", "finger-2", "finger-3"],
  passiveInterphalangealLimitRad: 0.06,
  terminalFingerControl: "finger-4",
  membraneModel: "joint-driven-faceted-surface",
  note: "metacarpal rotates the first long phalanx at the knuckle; outer interphalangeal controls remain spar-like",
} as const;

export type DragonWingPhaseContract = {
  readonly poseId: MediumDragonPoseId;
  readonly state: "compact" | "opening" | "power" | "recovery" | "trim" | "swept" | "flare" | "unloading";
  readonly leftAreaFraction: number;
  readonly rightAreaFraction: number;
  readonly camber: "low" | "medium" | "high";
  readonly tension: "low" | "medium" | "high";
  readonly activeControls: readonly (typeof MEDIUM_DRAGON_WING_MOTION.activeControls)[number][];
};

export const MEDIUM_DRAGON_WING_PHASES: readonly DragonWingPhaseContract[] = [
  { poseId: "takeoff-preload", state: "compact", leftAreaFraction: 0.18, rightAreaFraction: 0.18, camber: "low", tension: "low", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "takeoff-hind-drive", state: "compact", leftAreaFraction: 0.2, rightAreaFraction: 0.2, camber: "low", tension: "medium", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "takeoff-manus-vault", state: "compact", leftAreaFraction: 0.22, rightAreaFraction: 0.22, camber: "low", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "takeoff-clearance", state: "compact", leftAreaFraction: 0.38, rightAreaFraction: 0.38, camber: "low", tension: "medium", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "takeoff-unfold", state: "opening", leftAreaFraction: 0.74, rightAreaFraction: 0.74, camber: "medium", tension: "medium", activeControls: ["elbow", "wrist", "metacarpal"] },
  { poseId: "takeoff-first-downstroke", state: "power", leftAreaFraction: 0.94, rightAreaFraction: 0.94, camber: "high", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "flight-downstroke", state: "power", leftAreaFraction: 0.98, rightAreaFraction: 0.98, camber: "high", tension: "high", activeControls: ["shoulder", "wrist", "metacarpal"] },
  { poseId: "flight-upstroke", state: "recovery", leftAreaFraction: 0.68, rightAreaFraction: 0.68, camber: "low", tension: "medium", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "glide", state: "trim", leftAreaFraction: 1, rightAreaFraction: 1, camber: "medium", tension: "high", activeControls: ["shoulder", "wrist", "metacarpal"] },
  { poseId: "bank-turn", state: "trim", leftAreaFraction: 0.96, rightAreaFraction: 0.66, camber: "medium", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "hover-brake", state: "power", leftAreaFraction: 0.96, rightAreaFraction: 0.96, camber: "high", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "dive", state: "swept", leftAreaFraction: 0.54, rightAreaFraction: 0.54, camber: "low", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "landing-flare", state: "recovery", leftAreaFraction: 0.76, rightAreaFraction: 0.76, camber: "medium", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "landing-touchdown", state: "flare", leftAreaFraction: 0.94, rightAreaFraction: 0.94, camber: "high", tension: "high", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
  { poseId: "landing-wing-unload", state: "unloading", leftAreaFraction: 0.52, rightAreaFraction: 0.52, camber: "low", tension: "low", activeControls: ["elbow", "wrist", "metacarpal"] },
  { poseId: "ground-recovery", state: "compact", leftAreaFraction: 0.18, rightAreaFraction: 0.18, camber: "low", tension: "low", activeControls: ["shoulder", "elbow", "wrist", "metacarpal"] },
] as const;

function mirrorWingRotation(rotation: ObjectPoint): ObjectPoint {
  return point(rotation[0], -rotation[1], -rotation[2]);
}

function wingRotations(left: WingRotation, right?: WingRotation): Readonly<Record<string, ObjectPoint>> {
  const values: Record<string, ObjectPoint> = {};
  for (const control of MEDIUM_DRAGON_WING_MOTION.activeControls) {
    const leftRotation = left[control] ?? point(0, 0, 0);
    values[`left-${control}`] = leftRotation;
    values[`right-${control}`] = right?.[control] ?? mirrorWingRotation(leftRotation);
  }
  for (const control of MEDIUM_DRAGON_WING_MOTION.passiveInterphalangealControls) {
    const leftRotation = left[control] ?? point(0, 0, 0);
    values[`left-${control}`] = leftRotation;
    values[`right-${control}`] = right?.[control] ?? mirrorWingRotation(leftRotation);
  }
  return values;
}

export const MEDIUM_DRAGON_POSES: readonly CreaturePoseContract<MediumDragonPoseId>[] = [
  {
    id: "ground-observe", label: "GROUND OBSERVE · HEAD FIRST / FOUR SUPPORTS", reference: GROUND,
    boneRotations: { ...wingRotations({}), "neck-2": point(0, 0.08, 0), "neck-3": point(0, 0.1, 0), "neck-4": point(0, 0.1, 0), head: point(0, 0.08, -0.03), "tail-1": point(0, -0.05, 0) },
    contactPartIds: fourContacts, grounded: true, phase: "observe",
    intent: "acquire a side stimulus without committing the body", force: "load shifts toward the target-side diagonal", response: "neck leads and tail answers last",
  },
  {
    id: "walk-support", label: "WALK · LATERAL SEQUENCE / HEAVY MANUS", reference: GROUND,
    boneRotations: {
      ...wingRotations({ shoulder: point(-0.1, 0, 0) }, { shoulder: point(0.11, 0, 0) }),
      chest: point(0, 0.035, 0), pelvis: point(0, -0.05, 0),
      "left-hip": point(0.2, 0, 0), "left-knee": point(-0.15, 0, 0), "left-ankle": point(-0.05, 0, 0),
      "right-hip": point(-0.22, 0, 0), "right-knee": point(0.16, 0, 0), "right-ankle": point(0.06, 0, 0),
      "neck-1": point(0.025, -0.03, 0), "tail-1": point(0, 0.05, 0),
    },
    contactPartIds: ["right-manus-pad", "left-hind-pad"], grounded: true, phase: "ground",
    intent: "select the next contact before chest travel", force: "one manus and opposite hind foot carry the support", response: "head stabilizes and tail follows the pelvis with delay",
  },
  {
    id: "takeoff-preload", label: "TAKEOFF 01 · FOUR-POINT PRELOAD", reference: GROUND,
    rootTranslation: point(0, -0.21, 0),
    boneRotations: {
      ...wingRotations({ wrist: point(-0.6, 0, 0), metacarpal: point(0, 0.08, 0) }),
      abdomen: point(-0.08, 0, 0), chest: point(0.08, 0, 0),
      "left-hip": point(-0.4, 0, 0), "left-knee": point(0.5, 0, 0),
      "right-hip": point(-0.4, 0, 0), "right-knee": point(0.5, 0, 0),
      "neck-2": point(-0.08, 0, 0),
    },
    contactPartIds: fourContacts, grounded: true, phase: "transition",
    intent: "confirm the launch corridor before irreversible loading", force: "hind feet and manus preload below the centre of mass", response: "chest lowers while the compact wing chain becomes tense",
  },
  {
    id: "takeoff-hind-drive", label: "TAKEOFF 02 · HIND DRIVE / MANUS STAY", reference: GROUND,
    rootTranslation: point(0, -0.06, 0.08),
    boneRotations: {
      ...wingRotations({ metacarpal: point(0, 0.08, 0) }),
      pelvis: point(-0.04, 0, 0), abdomen: point(-0.08, 0, 0), chest: point(0.14, 0, 0),
      "left-hip": point(-0.08, 0, 0), "left-knee": point(0.1, 0, 0),
      "right-hip": point(-0.08, 0, 0), "right-knee": point(0.1, 0, 0),
      "neck-2": point(0.02, 0, 0),
    },
    contactPartIds: fourContacts, grounded: true, phase: "transition",
    intent: "raise the pelvis along the already selected launch corridor", force: "hindlimbs extend while both manus retain the forward pivot", response: "chest rotates over the hands before the hind feet unload",
  },
  {
    id: "takeoff-manus-vault", label: "TAKEOFF 03 · MANUS VAULT", reference: GROUND,
    rootTranslation: point(0, 0.18, 0.16), rootRotation: point(-0.18, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(-0.42, 0, 0), elbow: point(0.26, 0.08, 0), wrist: point(-0.16, -0.08, 0), metacarpal: point(0, 0.12, 0) }),
      pelvis: point(0.08, 0, 0), abdomen: point(-0.06, 0, 0), chest: point(0.16, 0, 0),
      "left-hip": point(-0.34, 0, 0), "left-knee": point(0.28, 0, 0), "left-ankle": point(-0.08, 0, 0),
      "right-hip": point(-0.34, 0, 0), "right-knee": point(0.28, 0, 0), "right-ankle": point(-0.08, 0, 0),
      "neck-2": point(0.08, 0, 0), "tail-1": point(0.1, 0, 0),
    },
    contactPartIds: ["left-manus-pad", "right-manus-pad"], grounded: true, phase: "transition",
    intent: "finish the ballistic launch without opening the wing into terrain", force: "the forelimbs pole-vault the body after hind-foot unload", response: "pelvis passes above the manus while the compact outer wing trails clear",
  },
  {
    id: "takeoff-clearance", label: "TAKEOFF 04 · CLEARANCE / WING COMPACT", reference: FLIGHT,
    rootTranslation: point(0, 1.08, 0.24), rootRotation: point(-0.24, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.5, -0.18), elbow: point(0, -0.6, 0.08), wrist: point(0, -0.7, 0), metacarpal: point(0, -0.8, 0), "finger-1": point(0, 0.025, 0), "finger-2": point(0, -0.02, 0), "finger-3": point(0, 0.015, 0) }),
      "left-hip": point(-0.36, 0, 0), "left-knee": point(0.3, 0, 0), "right-hip": point(-0.36, 0, 0), "right-knee": point(0.3, 0, 0),
      chest: point(0.08, 0, 0), "neck-2": point(0.12, 0, 0), "tail-1": point(0.1, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "transition",
    intent: "preserve the jump corridor until the full wing can clear terrain", force: "elbow, wrist and knuckle keep projected area small after manus release", response: "body still shows upward launch momentum instead of artificial lift",
  },
  {
    id: "takeoff-unfold", label: "TAKEOFF 05 · ELBOW / WRIST / KNUCKLE OPEN", reference: FLIGHT,
    rootTranslation: point(0, 1.42, 0.28), rootRotation: point(-0.18, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.18, 0.02), elbow: point(0, -0.22, 0.02), wrist: point(0, -0.24, 0), metacarpal: point(0, -0.2, 0), "finger-1": point(0, 0.02, 0), "finger-2": point(0, -0.015, 0), "finger-3": point(0, 0.01, 0) }),
      "left-hip": point(-0.3, 0, 0), "left-knee": point(0.24, 0, 0), "right-hip": point(-0.3, 0, 0), "right-knee": point(0.24, 0, 0),
      chest: point(0.02, 0, 0), "neck-2": point(0.1, 0, 0), "tail-1": point(0.08, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "transition",
    intent: "increase area only after the tip has safe clearance", force: "elbow opens first, wrist follows and the long-finger knuckle tensions the membrane", response: "chest rotates toward the first power-stroke attitude",
  },
  {
    id: "takeoff-first-downstroke", label: "TAKEOFF 06 · FIRST POWER STROKE", reference: FLIGHT,
    rootTranslation: point(0, 1.72, 0.3), rootRotation: point(-0.14, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.02, 0.58), elbow: point(0, 0.06, 0), wrist: point(0.04, -0.05, 0), metacarpal: point(-0.035, 0.04, 0), "finger-1": point(0, 0.015, 0), "finger-2": point(0, -0.012, 0), "finger-3": point(0, 0.008, 0) }),
      "left-hip": point(-0.24, 0, 0), "left-knee": point(0.2, 0, 0), "right-hip": point(-0.24, 0, 0), "right-knee": point(0.2, 0, 0),
      chest: point(-0.04, 0, 0), "neck-2": point(0.08, 0, 0), "tail-1": point(0.06, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "add aerodynamic impulse to the established ballistic launch", force: "near-full span and tension turn the first downstroke into useful lift and thrust", response: "chest rises before the neck and tail settle the pitch impulse",
  },
  {
    id: "flight-downstroke", label: "FLIGHT · DOWNSTROKE / TENSIONED SPAN", reference: FLIGHT,
    rootTranslation: point(0, 2.2, 0), rootRotation: point(-0.08, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, 0, 0.62), elbow: point(0, 0.04, 0), wrist: point(0.04, -0.05, 0), metacarpal: point(-0.035, 0.04, 0), "finger-1": point(0, 0.018, 0), "finger-2": point(0, -0.012, 0), "finger-3": point(0, 0.008, 0) }),
      chest: point(-0.04, 0, 0), "neck-2": point(0.08, 0, 0), "tail-1": point(0.05, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold the forward-upward corridor", force: "shoulder drives a broad stroke while wrist twist and knuckle tension retain planform", response: "chest rises before head and tail settle the pitch impulse",
  },
  {
    id: "flight-upstroke", label: "FLIGHT · UPSTROKE / OUTER AREA FOLDS", reference: FLIGHT,
    rootTranslation: point(0, 2.08, 0), rootRotation: point(-0.04, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.12, -0.58), elbow: point(0, -0.28, 0.06), wrist: point(0, -0.34, 0), metacarpal: point(0, -0.38, 0), "finger-1": point(0, 0.025, 0), "finger-2": point(0, -0.02, 0), "finger-3": point(0, 0.015, 0) }),
      chest: point(0.035, 0, 0), "neck-2": point(-0.05, 0, 0), "tail-1": point(-0.04, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain gaze while resetting the wing for the next impulse", force: "elbow, wrist and knuckle reduce outer area while the long phalanges stay aligned", response: "small body sink remains visible under a quiet head",
  },
  {
    id: "glide", label: "GLIDE · BROAD PLANFORM / SMALL JOINT TRIM", reference: FLIGHT,
    rootTranslation: point(0, 2.35, 0), rootRotation: point(0.035, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.05, -0.07), elbow: point(0, 0.04, 0), wrist: point(0.03, -0.035, 0), metacarpal: point(-0.025, 0.03, 0), "finger-1": point(0, 0.012, 0), "finger-2": point(0, -0.009, 0), "finger-3": point(0, 0.006, 0) }),
      "neck-3": point(0, 0.08, 0), head: point(0, 0.06, 0), "tail-1": point(-0.03, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "scan below and along the horizon without committing to a turn", force: "broad planform carries lift while wrist and knuckle make small trim changes", response: "neck and tail cancel slow pitch and roll instead of freezing the wing",
  },
  {
    id: "bank-turn", label: "BANK TURN · OUTER AREA / INNER FOLD", reference: FLIGHT,
    rootTranslation: point(0, 2.35, 0), rootRotation: point(0.02, 0.12, -0.36),
    boneRotations: {
      ...wingRotations(
        { shoulder: point(0, -0.03, -0.04), elbow: point(0, 0.04, 0), wrist: point(0.02, -0.03, 0), metacarpal: point(-0.02, 0.025, 0), "finger-1": point(0, 0.01, 0) },
        { shoulder: point(0, 0.24, 0.18), elbow: point(0, 0.5, -0.05), wrist: point(0, 0.55, 0), metacarpal: point(0, 0.62, 0), "finger-1": point(0, -0.022, 0), "finger-2": point(0, 0.016, 0), "finger-3": point(0, -0.01, 0) },
      ),
      "neck-3": point(0, 0.16, 0.13), head: point(0, 0.12, 0.16), "tail-1": point(0, -0.12, 0.1),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "acquire the turn exit before the trajectory changes", force: "outer left wing retains area while inner right elbow, wrist and knuckle reduce it", response: "roll precedes yaw while head counter-rolls and tail answers last",
  },
  {
    id: "hover-brake", label: "BRAKE HOVER · HIGH CAMBER / NOSE HIGH", reference: FLIGHT,
    rootTranslation: point(0, 2.72, -0.1), rootRotation: point(-0.72, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, 0.18, 0.68), elbow: point(0, 0.08, 0), wrist: point(0.08, -0.08, 0), metacarpal: point(-0.06, 0.06, 0), "finger-1": point(0, 0.02, 0), "finger-2": point(0, -0.014, 0), "finger-3": point(0, 0.009, 0) }),
      "left-hip": point(0.42, 0, 0), "left-knee": point(-0.58, 0, 0), "right-hip": point(0.42, 0, 0), "right-knee": point(-0.58, 0, 0),
      "neck-2": point(0.28, 0, 0), "neck-3": point(0.18, 0, 0), head: point(0.12, 0, 0), "tail-1": point(0.2, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold an inspection or landing point while preserving an exit", force: "large high-camber stroke trades forward speed for lift and drag", response: "body hangs nose-high beneath a stabilized head with legs prepared",
  },
  {
    id: "dive", label: "DIVE · SHOULDER SWEEP / KNUCKLE AREA REDUCTION", reference: FLIGHT,
    rootTranslation: point(0, 3.25, 0), rootRotation: point(0.58, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.48, 0.03), elbow: point(0, -0.38, 0), wrist: point(0, -0.32, 0), metacarpal: point(0, -0.46, 0), "finger-1": point(0, 0.02, 0), "finger-2": point(0, -0.015, 0), "finger-3": point(0, 0.01, 0) }),
      "neck-2": point(-0.16, 0, 0), head: point(-0.08, 0, 0), "tail-1": point(-0.08, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold the aim corridor with minimal head motion", force: "shoulder sweep plus elbow, wrist and knuckle fold reduce area and camber", response: "neck, legs and tail align with dynamic pressure",
  },
  {
    id: "landing-flare", label: "LANDING 01 · FULL FLARE / HIND FEET FORWARD", reference: FLIGHT,
    rootTranslation: point(0, 1.58, 0.12), rootRotation: point(-0.46, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.14, -0.52), elbow: point(0, -0.22, 0.05), wrist: point(0.08, -0.24, 0), metacarpal: point(-0.06, -0.26, 0), "finger-1": point(0, 0.015, 0), "finger-2": point(0, -0.01, 0), "finger-3": point(0, 0.007, 0) }),
      "left-hip": point(-0.72, 0, 0), "left-knee": point(0.54, 0, 0), "left-ankle": point(0.22, 0, 0), "right-hip": point(-0.72, 0, 0), "right-knee": point(0.54, 0, 0), "right-ankle": point(0.22, 0, 0),
      "neck-2": point(0.22, 0, 0), "neck-3": point(0.16, 0, 0), head: point(0.1, 0, 0), "tail-1": point(0.16, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "transition",
    intent: "alternate between touchdown point, obstacles and horizon", force: "maximum area, camber and angle of attack trade speed for lift and drag", response: "chest rises while hind feet reach before contact",
  },
  {
    id: "landing-touchdown", label: "LANDING 02 · HIND CONTACT / WING STILL LOADED", reference: FLIGHT,
    rootTranslation: point(0, 0.2, 0.08), rootRotation: point(-0.24, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, 0.02, -0.07), elbow: point(0, 0.1, 0), wrist: point(0.06, -0.08, 0), metacarpal: point(-0.05, 0.07, 0), "finger-1": point(0, 0.018, 0), "finger-2": point(0, -0.012, 0), "finger-3": point(0, 0.008, 0) }),
      pelvis: point(-0.12, 0, 0), chest: point(0.1, 0, 0), "left-hip": point(-0.76, 0, 0), "left-knee": point(0.62, 0, 0), "left-ankle": point(0.24, 0, 0), "right-hip": point(-0.76, 0, 0), "right-knee": point(0.62, 0, 0), "right-ankle": point(0.24, 0, 0),
      "neck-2": point(0.12, 0, 0), "tail-1": point(0.12, 0, 0),
    },
    contactPartIds: ["left-folded-foot", "right-folded-foot"], grounded: true, phase: "impact",
    intent: "look through the landing into the short ground run", force: "hind feet absorb first while the still-open wing carries residual load", response: "pelvis flexes without an instantaneous wing collapse",
  },
  {
    id: "landing-wing-unload", label: "LANDING 03 · ELBOW / WRIST / KNUCKLE UNLOAD", reference: FLIGHT,
    rootTranslation: point(0, 0.08, 0.04), rootRotation: point(-0.12, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0, -0.22, -0.18), elbow: point(0, -0.55, 0.04), wrist: point(0, -0.62, 0), metacarpal: point(0, -0.68, 0), "finger-1": point(0, 0.025, 0), "finger-2": point(0, -0.02, 0), "finger-3": point(0, 0.015, 0) }),
      pelvis: point(-0.08, 0, 0), chest: point(0.08, 0, 0), "left-hip": point(-0.68, 0, 0), "left-knee": point(0.58, 0, 0), "left-ankle": point(0.2, 0, 0), "right-hip": point(-0.68, 0, 0), "right-knee": point(0.58, 0, 0), "right-ankle": point(0.2, 0, 0),
      "neck-2": point(0.08, 0, 0), "tail-1": point(0.08, 0, 0),
    },
    contactPartIds: ["left-folded-foot", "right-folded-foot"], grounded: true, phase: "transition",
    intent: "reduce wing area only after the legs own the load", force: "elbow, wrist and knuckle fold the outer wing while hind support remains compliant", response: "chest settles toward the future manus contacts",
  },
  {
    id: "ground-recovery", label: "LANDING 04 · MANUS SET / WING FOLDED", reference: GROUND,
    rootTranslation: point(0, -0.04, 0.02), rootRotation: point(-0.05, 0, 0),
    boneRotations: {
      ...wingRotations({ shoulder: point(0.08, 0, 0), elbow: point(0, 0.06, 0), wrist: point(0, -0.08, 0), metacarpal: point(0, 0.08, 0) }),
      pelvis: point(-0.04, 0, 0), chest: point(0.04, 0, 0), "left-hip": point(-0.18, 0, 0), "left-knee": point(0.2, 0, 0), "right-hip": point(-0.18, 0, 0), "right-knee": point(0.2, 0, 0), "neck-2": point(0.06, 0, 0), "tail-1": point(0.05, 0, 0),
    },
    contactPartIds: fourContacts, grounded: true, phase: "ground",
    intent: "restore four-point support while retaining awareness of the exit", force: "manus accept body weight only after the wing has unloaded", response: "neck rises and the folded wing settles against the flank last",
  },
] as const;

export function mediumDragonBoneForPart(part: ObjectLabPart, reference: string): string {
  const id = part.id;
  if (["pelvis"].includes(id)) return "pelvis";
  if (["abdomen"].includes(id)) return "abdomen";
  if (["chest", "thorax-rear", "sternum-keel"].includes(id)) return "chest";
  const neckBeam = /^neck-(\d+)$/.exec(id);
  if (neckBeam) return `neck-${Number(neckBeam[1]) - 1}`;
  const neckJoint = /^neck-joint-(\d+)$/.exec(id);
  if (neckJoint) return `neck-${neckJoint[1]}`;
  if (part.group === "face" || ["skull", "muzzle", "lower-jaw"].includes(id)) return "head";
  const tailBeam = /^tail-(\d+)$/.exec(id);
  if (tailBeam) return `tail-${Number(tailBeam[1]) - 1}`;
  const tailJoint = /^tail-joint-(\d+)$/.exec(id);
  if (tailJoint) return `tail-${tailJoint[1]}`;
  const side = id.startsWith("left-") ? "left" : id.startsWith("right-") ? "right" : undefined;
  if (!side) throw new Error(`${id}: no dragon bone mapping`);
  if (id.endsWith("femur")) return `${side}-hip`;
  if (id.endsWith("knee") || id.endsWith("tibia")) return `${side}-knee`;
  if (id.endsWith("ankle") || id.endsWith("metatarsus")) return `${side}-ankle`;
  if (id.includes("hind-pad") || id.includes("hind-toes") || id.includes("folded-foot")) return `${side}-hindfoot`;
  if (id.includes("manus-pad") || id.endsWith("free-digits")) return `${side}-free-digit`;
  if (id.endsWith("free-digit-contact")) return `${side}-wrist`;
  if (id.endsWith("humerus")) return `${side}-shoulder`;
  if (id.endsWith("elbow") || id.endsWith("forearm")) return `${side}-elbow`;
  if (id.endsWith("wrist") || id.endsWith("wing-metacarpal")) return `${side}-wrist`;
  const wingJoint = /-wing-joint-(\d+)$/.exec(id);
  if (wingJoint) {
    return ["", `${side}-elbow`, `${side}-wrist`, `${side}-metacarpal`, `${side}-finger-1`, `${side}-finger-2`, `${side}-finger-3`][Number(wingJoint[1])];
  }
  const wingFinger = /-wing-finger-(\d+)$/.exec(id);
  if (wingFinger) return Number(wingFinger[1]) === 1 ? `${side}-metacarpal` : `${side}-finger-${Number(wingFinger[1]) - 1}`;
  if (part.group === "wing-membrane") return `${side}-shoulder`;
  throw new Error(`${id}: no dragon bone mapping for ${reference}`);
}

export function mediumDragonMembraneVertexBone(
  part: ObjectLabPart,
  vertex: ObjectPoint,
  _index: number,
  reference: string,
): string | undefined {
  if (part.group !== "wing-membrane") return undefined;
  const side = vertex[0] < 0 ? "left" : "right";
  const candidates = ["shoulder", "elbow", "wrist", "metacarpal", "finger-1", "finger-2", "finger-3", "finger-4"]
    .map((control) => MEDIUM_DRAGON_SKELETON.bones.find((bone) => bone.id === `${side}-${control}`))
    .filter((bone): bone is CreatureSkeletonContract["bones"][number] => Boolean(bone));
  let closest = candidates[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const pivot = candidate.rest[reference];
    const candidateDistance = Math.hypot(vertex[0] - pivot[0], vertex[1] - pivot[1], vertex[2] - pivot[2]);
    if (candidateDistance < closestDistance) {
      closest = candidate;
      closestDistance = candidateDistance;
    }
  }
  return closest.id;
}

const poseGroups = MEDIUM_DRAGON_POSES.map((pose) => `dragon-pose-${pose.id}`);
const results = MEDIUM_DRAGON_POSES.map((pose) => buildCreaturePoseDerivative({
  skeleton: MEDIUM_DRAGON_SKELETON,
  pose,
  sourceParts: pose.reference === GROUND ? mediumDragonGroundCanonicalParts : mediumDragonFlightCanonicalParts,
  group: `dragon-pose-${pose.id}`,
  resolvePartBone: mediumDragonBoneForPart,
  resolveVertexBone: mediumDragonMembraneVertexBone,
}));

export const mediumDragonRigStates: Readonly<Record<MediumDragonPoseId, CreatureRigState>> = Object.fromEntries(
  MEDIUM_DRAGON_POSES.map((pose, index) => [pose.id, results[index].state]),
) as Readonly<Record<MediumDragonPoseId, CreatureRigState>>;

function poseView(pose: CreaturePoseContract<MediumDragonPoseId>): CreatureLabView {
  const airborne = pose.reference === FLIGHT;
  return {
    id: `dragon-${pose.id}`,
    label: pose.label,
    projection: "perspective",
    position: airborne ? point(11.4, 7.0, 12.2) : point(5.8, 3.25, 7.6),
    target: airborne ? point(0, 1.75, -0.35) : point(0, 0.8, -0.45),
    fov: airborne ? 31 : 28,
    hiddenGroups: [
      ...poseGroups.filter((group) => group !== `dragon-pose-${pose.id}`),
      "dragon-skeleton-ground",
      "dragon-skeleton-flight",
    ],
  };
}

const groundSkeletonState = mediumDragonRigStates["ground-observe"];
const flightSkeletonState = mediumDragonRigStates.glide;
const groundSkeletonParts = buildCreatureRigParts(MEDIUM_DRAGON_SKELETON, groundSkeletonState, "dragon-skeleton-ground", 0.055);
const flightSkeletonParts = buildCreatureRigParts(MEDIUM_DRAGON_SKELETON, flightSkeletonState, "dragon-skeleton-flight", 0.055);

export const mediumDragonPoseAtlasObject: CreatureLabModel = {
  ...mediumDragonFlightObject,
  id: "medium-dragon-pose-atlas",
  revision: "dragon-rig-m2-2026-08-13",
  title: "MEDIUM DRAGON · PTEROSAUR-LIKE WING MORPH",
  sourceNotes: [
    ...mediumDragonGroundObject.sourceNotes,
    "All eighteen action states are deterministic derivatives of the accepted P4 masses and one FK hierarchy.",
    "Shoulder, elbow, wrist and long-finger knuckle own active morphing; outer phalanges remain a nearly rigid spar.",
    "Takeoff clears terrain before full area; landing keeps the wing loaded through hind touchdown before sequential folding.",
    "Folded and extended references preserve the same named wing chain; this review atlas excludes integration while the runtime derivative owns forces, contacts, flight and behaviour.",
  ],
  anchors: {
    ...mediumDragonFlightObject.anchors,
    rigRoot: groundSkeletonState.pivots.root,
    rigHead: groundSkeletonState.pivots.head,
  },
  motionConstraints: {
    singleCanonicalSkeleton: true,
    poseCount: MEDIUM_DRAGON_POSES.length,
    runtimeRegistered: false,
    aerodynamicForcesImplemented: false,
    contactImpulsesImplemented: false,
    clothSimulationImplemented: false,
    pterosaurInspiredWingMorph: true,
    passiveInterphalangealLimitRad: MEDIUM_DRAGON_WING_MOTION.passiveInterphalangealLimitRad,
  },
  labEnvironment: { floorRadius: 10, gridSize: 14, gridDivisions: 28, fogNear: 26, fogFar: 38, floorY: -0.005 },
  parts: [
    ...results.flatMap((result) => result.parts),
    ...groundSkeletonParts,
    ...flightSkeletonParts,
  ],
  views: [
    ...MEDIUM_DRAGON_POSES.map(poseView),
    {
      id: "dragon-skeleton-ground-profile",
      label: "SKELETON · GROUND PROFILE / FOLDED WING + CONTACTS",
      projection: "orthographic",
      position: point(7, 1.25, 0),
      target: point(0, 0.82, -0.65),
      orthoHeight: 4.15,
      hiddenGroups: [...poseGroups, "dragon-skeleton-flight"],
    },
    {
      id: "dragon-skeleton-flight-front",
      label: "SKELETON · FLIGHT FRONT / ROOT TO FINGER CHAIN",
      projection: "orthographic",
      position: point(0, 2.3, 14),
      target: point(0, 3.15, -0.3),
      orthoHeight: 3.1,
      hiddenGroups: [...poseGroups, "dragon-skeleton-ground"],
    },
  ],
};
