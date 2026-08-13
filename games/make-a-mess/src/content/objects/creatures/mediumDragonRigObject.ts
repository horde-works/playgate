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
  | "takeoff-release"
  | "flight-downstroke"
  | "flight-upstroke"
  | "glide"
  | "bank-turn"
  | "hover-brake"
  | "dive"
  | "landing-flare"
  | "touchdown";

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
  id: "medium-dragon-skeleton-m1",
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

export const MEDIUM_DRAGON_POSES: readonly CreaturePoseContract<MediumDragonPoseId>[] = [
  {
    id: "ground-observe", label: "GROUND OBSERVE · HEAD FIRST / FOUR SUPPORTS", reference: GROUND,
    boneRotations: { "neck-2": point(0, 0.08, 0), "neck-3": point(0, 0.1, 0), "neck-4": point(0, 0.1, 0), head: point(0, 0.08, -0.03), "tail-1": point(0, -0.05, 0) },
    contactPartIds: fourContacts, grounded: true, phase: "observe",
    intent: "acquire a side stimulus without committing the body", force: "load shifts toward the target-side diagonal", response: "neck leads and tail answers last",
  },
  {
    id: "walk-support", label: "WALK · LATERAL SEQUENCE / HEAVY MANUS", reference: GROUND,
    boneRotations: {
      chest: point(0, 0.035, 0), pelvis: point(0, -0.05, 0),
      "left-shoulder": point(-0.1, 0, 0), "right-shoulder": point(0.11, 0, 0),
      "left-hip": point(0.2, 0, 0), "left-knee": point(-0.15, 0, 0), "left-ankle": point(-0.05, 0, 0),
      "right-hip": point(-0.22, 0, 0), "right-knee": point(0.16, 0, 0), "right-ankle": point(0.06, 0, 0),
      "neck-1": point(0.025, -0.03, 0), "tail-1": point(0, 0.05, 0),
    },
    contactPartIds: ["right-manus-pad", "left-hind-pad"], grounded: true, phase: "ground",
    intent: "select the next contact before chest travel", force: "one manus and opposite hind foot carry the support", response: "head stabilizes and tail follows the pelvis with delay",
  },
  {
    id: "takeoff-preload", label: "TAKEOFF · PRELOAD / HIND LOAD", reference: GROUND,
    rootTranslation: point(0, -0.21, 0), rootRotation: point(-0.09, 0, 0),
    boneRotations: {
      pelvis: point(-0.16, 0, 0), abdomen: point(-0.1, 0, 0), chest: point(0.1, 0, 0),
      "left-hip": point(0.68, 0, 0), "left-knee": point(-0.86, 0, 0), "left-ankle": point(0.24, 0, 0),
      "right-hip": point(0.68, 0, 0), "right-knee": point(-0.86, 0, 0), "right-ankle": point(0.24, 0, 0),
      "left-shoulder": point(0.12, 0, 0), "right-shoulder": point(0.12, 0, 0), "neck-2": point(-0.08, 0, 0),
    },
    contactPartIds: ["left-hind-pad", "right-hind-pad"], grounded: true, phase: "transition",
    intent: "launch corridor checked before commitment", force: "hind feet and manus preload below the centre of mass", response: "chest lowers while the wing chain prepares to release",
  },
  {
    id: "takeoff-release", label: "TAKEOFF · RELEASE / FIRST DOWNSTROKE", reference: FLIGHT,
    rootTranslation: point(0, 1.02, 0.22), rootRotation: point(-0.22, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, -0.05, 0.2), "right-shoulder": point(0, 0.05, -0.2),
      "left-hip": point(-0.35, 0, 0), "left-knee": point(0.26, 0, 0),
      "right-hip": point(-0.35, 0, 0), "right-knee": point(0.26, 0, 0), "neck-2": point(0.12, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "transition",
    intent: "continue the ballistic launch corridor", force: "manus have just released and the first stroke adds impulse", response: "body still carries obvious jump momentum",
  },
  {
    id: "flight-downstroke", label: "FLIGHT · DOWNSTROKE / BODY RESPONSE", reference: FLIGHT,
    rootTranslation: point(0, 2.2, 0), rootRotation: point(-0.08, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, 0, 0.32), "right-shoulder": point(0, 0, -0.32),
      "left-elbow": point(0, -0.06, 0), "right-elbow": point(0, 0.06, 0),
      chest: point(-0.04, 0, 0), "neck-2": point(0.08, 0, 0), "tail-1": point(0.05, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold the forward-upward corridor", force: "deep symmetric downstroke", response: "chest rises before head and tail settle the pitch impulse",
  },
  {
    id: "flight-upstroke", label: "FLIGHT · UPSTROKE / REDUCED OUTER AREA", reference: FLIGHT,
    rootTranslation: point(0, 2.08, 0), rootRotation: point(-0.04, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, -0.18, -0.34), "right-shoulder": point(0, 0.18, 0.34),
      "left-elbow": point(0, -0.2, 0.08), "right-elbow": point(0, 0.2, -0.08),
      "left-wrist": point(0, -0.14, 0), "right-wrist": point(0, 0.14, 0),
      chest: point(0.035, 0, 0), "neck-2": point(-0.05, 0, 0), "tail-1": point(-0.04, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "retain gaze while resetting the wing", force: "elbow and wrist fold the outer area", response: "small body sink remains visible under a quiet head",
  },
  {
    id: "glide", label: "GLIDE · BROAD PLANFORM / SMALL TRIM", reference: FLIGHT,
    rootTranslation: point(0, 2.35, 0), rootRotation: point(0.035, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, -0.06, -0.08), "right-shoulder": point(0, 0.06, 0.08),
      "neck-3": point(0, 0.08, 0), head: point(0, 0.06, 0), "tail-1": point(-0.03, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "wide scan below and along the horizon", force: "lift is carried by the broad unswept planform", response: "small wrist and tail trim replace frozen wings",
  },
  {
    id: "bank-turn", label: "BANK TURN · GAZE LEADS / ASYMMETRIC WINGS", reference: FLIGHT,
    rootTranslation: point(0, 2.35, 0), rootRotation: point(0.02, 0.12, -0.36),
    boneRotations: {
      "left-shoulder": point(0, -0.04, -0.04), "right-shoulder": point(0, 0.24, 0.18),
      "right-elbow": point(0, 0.16, -0.05), "neck-3": point(0, 0.16, 0.13), head: point(0, 0.12, 0.16),
      "tail-1": point(0, -0.12, 0.1),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "head acquires the exit before trajectory changes", force: "outer wing carries more area than the inner wing", response: "roll precedes yaw while head counter-rolls",
  },
  {
    id: "hover-brake", label: "BRAKE HOVER · NOSE HIGH / POWER STROKE", reference: FLIGHT,
    rootTranslation: point(0, 2.72, -0.1), rootRotation: point(-0.72, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, 0.3, 0.36), "right-shoulder": point(0, -0.3, -0.36),
      "left-elbow": point(0, 0.1, 0), "right-elbow": point(0, -0.1, 0),
      "left-hip": point(0.42, 0, 0), "left-knee": point(-0.58, 0, 0),
      "right-hip": point(0.42, 0, 0), "right-knee": point(-0.58, 0, 0),
      "neck-2": point(0.28, 0, 0), "neck-3": point(0.18, 0, 0), head: point(0.12, 0, 0), "tail-1": point(0.2, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "hold the landing/inspection point", force: "high-area stroke and drag brake forward speed", response: "body hangs nose-high beneath a stabilized head",
  },
  {
    id: "dive", label: "DIVE · SWEPT WING / STREAMLINED BODY", reference: FLIGHT,
    rootTranslation: point(0, 3.25, 0), rootRotation: point(0.58, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, -0.42, 0.04), "right-shoulder": point(0, 0.42, -0.04),
      "left-elbow": point(0, -0.22, 0), "right-elbow": point(0, 0.22, 0),
      "left-wrist": point(0, -0.12, 0), "right-wrist": point(0, 0.12, 0),
      "neck-2": point(-0.16, 0, 0), head: point(-0.08, 0, 0), "tail-1": point(-0.08, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "air",
    intent: "eyes hold the aim corridor with minimal head motion", force: "reduced camber and swept outer wing limit drag", response: "neck, legs and tail align with dynamic pressure",
  },
  {
    id: "landing-flare", label: "LANDING · FLARE / HIND FEET FORWARD", reference: FLIGHT,
    rootTranslation: point(0, 1.58, 0.12), rootRotation: point(-0.46, 0, 0),
    boneRotations: {
      "left-shoulder": point(0, 0.04, -0.1), "right-shoulder": point(0, -0.04, 0.1),
      "left-hip": point(-0.72, 0, 0), "left-knee": point(0.54, 0, 0), "left-ankle": point(0.22, 0, 0),
      "right-hip": point(-0.72, 0, 0), "right-knee": point(0.54, 0, 0), "right-ankle": point(0.22, 0, 0),
      "neck-2": point(0.22, 0, 0), "neck-3": point(0.16, 0, 0), head: point(0.1, 0, 0), "tail-1": point(0.16, 0, 0),
    },
    contactPartIds: [], grounded: false, phase: "transition",
    intent: "alternate touchdown point, obstacles and horizon", force: "high angle of attack trades speed for lift and drag", response: "chest rises while hind feet reach before contact",
  },
  {
    id: "touchdown", label: "TOUCHDOWN · HIND CONTACT / FORE SETTLE NEXT", reference: GROUND,
    rootTranslation: point(0, 0.24, 0.08), rootRotation: point(-0.22, 0, 0),
    boneRotations: {
      pelvis: point(-0.12, 0, 0), chest: point(0.1, 0, 0),
      "left-hip": point(-0.42, 0, 0), "left-knee": point(0.48, 0, 0), "left-ankle": point(-0.06, 0, 0),
      "right-hip": point(-0.42, 0, 0), "right-knee": point(0.48, 0, 0), "right-ankle": point(-0.06, 0, 0),
      "left-shoulder": point(0.22, 0, 0), "right-shoulder": point(0.22, 0, 0),
      "neck-2": point(0.12, 0, 0), "tail-1": point(0.12, 0, 0),
    },
    contactPartIds: ["left-hind-pad", "right-hind-pad"], grounded: true, phase: "impact",
    intent: "look through the landing into the short run", force: "hind feet absorb first while wings still carry load", response: "pelvis flexes and manus prepare to settle without snapping the body level",
  },
] as const;

function dragonBoneForPart(part: ObjectLabPart, reference: string): string {
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
  if (reference === GROUND && ["wing-bones", "wing-membrane", "contacts"].includes(part.group)) return `${side}-shoulder`;
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

function dragonMembraneVertexBone(part: ObjectLabPart, vertex: ObjectPoint, _index: number, reference: string): string | undefined {
  if (reference !== FLIGHT || part.group !== "wing-membrane") return undefined;
  const side = vertex[0] < 0 ? "left" : "right";
  const x = Math.abs(vertex[0]);
  if (x < 1.6) return `${side}-shoulder`;
  if (x < 3.0) return `${side}-elbow`;
  if (x < 3.55) return `${side}-wrist`;
  if (x < 4.1) return `${side}-metacarpal`;
  if (x < 4.65) return `${side}-finger-1`;
  if (x < 5.2) return `${side}-finger-2`;
  if (x < 5.65) return `${side}-finger-3`;
  return `${side}-finger-4`;
}

const poseGroups = MEDIUM_DRAGON_POSES.map((pose) => `dragon-pose-${pose.id}`);
const results = MEDIUM_DRAGON_POSES.map((pose) => buildCreaturePoseDerivative({
  skeleton: MEDIUM_DRAGON_SKELETON,
  pose,
  sourceParts: pose.reference === GROUND ? mediumDragonGroundCanonicalParts : mediumDragonFlightCanonicalParts,
  group: `dragon-pose-${pose.id}`,
  resolvePartBone: dragonBoneForPart,
  resolveVertexBone: dragonMembraneVertexBone,
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
    position: airborne ? point(9.7, 6.2, 10.2) : point(5.8, 3.25, 7.6),
    target: airborne ? point(0, 1.75, -0.35) : point(0, 0.8, -0.45),
    fov: airborne ? 30 : 28,
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
  revision: "dragon-rig-m1-2026-08-13",
  title: "MEDIUM DRAGON · ONE SKELETON / KEY ACTIONS",
  sourceNotes: [
    ...mediumDragonGroundObject.sourceNotes,
    "All twelve action states are deterministic derivatives of the accepted P4 masses and one FK hierarchy.",
    "Folded and extended references preserve the same named wing chain; forces, contacts, flight physics and AI remain excluded.",
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
