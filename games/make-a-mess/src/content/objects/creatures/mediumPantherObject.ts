import type { ObjectLabPart, ObjectPoint } from "../dutchWindmills/objectModel.ts";
import {
  addBeam,
  addBox,
  addJoint,
  addTriangle,
  point,
  type CreatureLabModel,
} from "./creatureObjectHelpers.ts";

export const MEDIUM_PANTHER_MORPHOLOGY = {
  species: "Panthera pardus",
  phenotype: "melanistic",
  mass: 50,
  shoulderHeight: 0.7,
  noseToTailBase: 1.35,
  tailLength: 0.9,
  chestWidth: 0.38,
  pelvisWidth: 0.33,
  groundContactY: 0,
} as const;

const FUR = "timber-dark" as const;
const FUR_PLANE = "timber-mid" as const;
const MUZZLE = "foundation" as const;
const EYE = "flower-yellow" as const;
const NOSE = "dark-recess" as const;

function addForelimb(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const x = side * 0.155;
  const shoulder = point(x, 0.61, 0.25);
  const elbow = point(x, 0.36, 0.31);
  const carpus = point(x, 0.14, 0.39);
  const pad = point(x, 0.065, 0.43);

  addBeam(parts, `${name}-humerus`, "forelimbs", FUR_PLANE, shoulder, elbow, 0.155, 0.16);
  addJoint(parts, `${name}-elbow`, "forelimbs", FUR_PLANE, elbow, 0.16);
  addBeam(parts, `${name}-radius-ulna`, "forelimbs", FUR, elbow, carpus, 0.125, 0.13);
  addJoint(parts, `${name}-carpus`, "forelimbs", FUR, carpus, 0.125);
  addBeam(parts, `${name}-metacarpus`, "forelimbs", FUR, carpus, pad, 0.105, 0.115);
  addBox(parts, `${name}-fore-paw`, "paws", FUR_PLANE, point(x, 0.04, 0.45), point(0.145, 0.08, 0.18));
  addBox(parts, `${name}-fore-toes`, "paws", FUR, point(x, 0.032, 0.545), point(0.15, 0.064, 0.085));
}

function addHindlimb(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const x = side * 0.135;
  const hip = point(x, 0.54, -0.35);
  const knee = point(x, 0.36, -0.14);
  const hock = point(x, 0.17, -0.44);
  const pad = point(x, 0.065, -0.3);

  addBeam(parts, `${name}-femur`, "hindlimbs", FUR_PLANE, hip, knee, 0.18, 0.18);
  addJoint(parts, `${name}-knee`, "hindlimbs", FUR_PLANE, knee, 0.175);
  addBeam(parts, `${name}-tibia`, "hindlimbs", FUR, knee, hock, 0.145, 0.15);
  addJoint(parts, `${name}-hock`, "hindlimbs", FUR, hock, 0.13);
  addBeam(parts, `${name}-metatarsus`, "hindlimbs", FUR, hock, pad, 0.105, 0.115);
  addBox(parts, `${name}-hind-paw`, "paws", FUR_PLANE, point(x, 0.04, -0.245), point(0.155, 0.08, 0.21));
  addBox(parts, `${name}-hind-toes`, "paws", FUR, point(x, 0.032, -0.13), point(0.16, 0.064, 0.09));
}

function addTail(parts: ObjectLabPart[]): void {
  const centres: readonly ObjectPoint[] = [
    point(0, 0.53, -0.535),
    point(0, 0.52, -0.675),
    point(0.015, 0.48, -0.815),
    point(0.04, 0.42, -0.955),
    point(0.055, 0.35, -1.095),
    point(0.04, 0.29, -1.225),
    point(0.015, 0.25, -1.335),
    point(0, 0.27, -1.415),
  ];
  const widths = [0.13, 0.118, 0.104, 0.09, 0.075, 0.059, 0.044] as const;
  for (let index = 0; index < centres.length - 1; index += 1) {
    addBeam(parts, `tail-${index + 1}`, "tail", index < 3 ? FUR_PLANE : FUR, centres[index], centres[index + 1], widths[index]);
    if (index < centres.length - 2) {
      addJoint(parts, `tail-joint-${index + 1}`, "tail", index < 3 ? FUR_PLANE : FUR, centres[index + 1], widths[index] * 1.02);
    }
  }
}

function buildPantherParts(): readonly ObjectLabPart[] {
  const parts: ObjectLabPart[] = [];

  // Three axial masses keep the shoulder sling, flexible lumbar span and pelvis
  // readable at villager-level detail instead of turning the animal into a log.
  addBox(parts, "ribcage", "axial", FUR_PLANE, point(0, 0.53, 0.15), point(0.38, 0.35, 0.42), point(-0.04, 0, 0));
  addBox(parts, "ribcage-rear", "axial", FUR_PLANE, point(0, 0.51, -0.08), point(0.34, 0.3, 0.3), point(0.02, 0, 0));
  addBox(parts, "lumbar", "axial", FUR, point(0, 0.5, -0.24), point(0.27, 0.22, 0.24), point(0.055, 0, 0));
  addBox(parts, "pelvis", "axial", FUR_PLANE, point(0, 0.51, -0.38), point(0.33, 0.31, 0.34), point(0.09, 0, 0));
  addBox(parts, "belly-shadow", "axial", FUR, point(0, 0.39, 0.01), point(0.27, 0.1, 0.42));

  for (const side of [-1, 1] as const) {
    const name = side < 0 ? "left" : "right";
    addBox(parts, `${name}-scapula`, "shoulder-sling", FUR, point(side * 0.175, 0.63, 0.2), point(0.095, 0.22, 0.3), point(-0.24, 0, 0));
    addForelimb(parts, side);
    addHindlimb(parts, side);
  }

  addBeam(parts, "neck-base", "neck-head", FUR_PLANE, point(0, 0.59, 0.32), point(0, 0.67, 0.49), 0.26, 0.27);
  addJoint(parts, "neck-head-joint", "neck-head", FUR_PLANE, point(0, 0.67, 0.49), 0.24);
  addBox(parts, "skull", "neck-head", FUR_PLANE, point(0, 0.71, 0.6), point(0.28, 0.24, 0.28), point(-0.04, 0, 0));
  addBox(parts, "left-cheek", "neck-head", FUR, point(-0.085, 0.665, 0.69), point(0.14, 0.17, 0.18));
  addBox(parts, "right-cheek", "neck-head", FUR, point(0.085, 0.665, 0.69), point(0.14, 0.17, 0.18));
  addBox(parts, "muzzle", "neck-head", MUZZLE, point(0, 0.64, 0.755), point(0.2, 0.13, 0.13));
  addBox(parts, "left-whisker-pad", "face", MUZZLE, point(-0.055, 0.655, 0.795), point(0.1, 0.085, 0.08));
  addBox(parts, "right-whisker-pad", "face", MUZZLE, point(0.055, 0.655, 0.795), point(0.1, 0.085, 0.08));
  addTriangle(parts, "nose", "face", NOSE, point(-0.058, 0.688, 0.846), point(0.058, 0.688, 0.846), point(0, 0.632, 0.846));
  addBox(parts, "mouth-line", "face", NOSE, point(0, 0.615, 0.805), point(0.15, 0.022, 0.04));

  addTriangle(parts, "left-ear", "face", FUR, point(-0.14, 0.78, 0.57), point(-0.1, 0.88, 0.545), point(-0.025, 0.79, 0.57));
  addTriangle(parts, "right-ear", "face", FUR, point(0.14, 0.78, 0.57), point(0.1, 0.88, 0.545), point(0.025, 0.79, 0.57));
  for (const side of [-1, 1] as const) {
    addBox(parts, `${side < 0 ? "left" : "right"}-eye`, "face", EYE, point(side * 0.07, 0.738, 0.795), point(0.055, 0.018, 0.018));
  }

  addTail(parts);
  return parts;
}

export const mediumPantherObject: CreatureLabModel = {
  id: "medium-panther-blockout",
  revision: "panther-p4-2026-08-13",
  title: "MEDIUM PANTHER · PRIMITIVE BODY",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  captureFrame: [1600, 1000],
  sourceNotes: [
    "Melanistic Panthera pardus; black coat does not change the skeleton.",
    "Authored 50 kg individual: 0.70 m shoulder, 1.35 m nose-to-tail-base, 0.90 m tail.",
    "Frozen neutral stance only; no runtime registration or claimed joint ranges.",
  ],
  dimensions: {
    massKg: MEDIUM_PANTHER_MORPHOLOGY.mass,
    shoulderHeight: MEDIUM_PANTHER_MORPHOLOGY.shoulderHeight,
    noseToTailBase: MEDIUM_PANTHER_MORPHOLOGY.noseToTailBase,
    tailLength: MEDIUM_PANTHER_MORPHOLOGY.tailLength,
  },
  labMetrics: [
    { label: "MASS", value: 50, decimals: 0, signed: false, unit: "kg" },
    { label: "SHOULDER", value: 0.7, decimals: 2, signed: false },
    { label: "BODY", value: 1.35, decimals: 2, signed: false },
    { label: "TAIL", value: 0.9, decimals: 2, signed: false },
  ],
  anchors: {
    nose: point(0, 0.67, 0.845),
    tailBase: point(0, 0.53, -0.535),
    leftForePad: point(-0.155, 0, 0.45),
    rightForePad: point(0.155, 0, 0.45),
    leftHindPad: point(-0.135, 0, -0.245),
    rightHindPad: point(0.135, 0, -0.245),
  },
  motionConstraints: {
    frozenPose: true,
    runtimeRegistered: false,
    jumpingImplemented: false,
  },
  labEnvironment: { floorRadius: 4, gridSize: 4, gridDivisions: 20, fogNear: 12, fogFar: 18, floorY: -0.005 },
  materialOverrides: {
    "timber-dark": { color: 0x151819, roughness: 0.96 },
    "timber-mid": { color: 0x2b3031, roughness: 0.95 },
    foundation: { color: 0x383b3b, roughness: 0.96 },
    "flower-yellow": { color: 0xc79732, roughness: 0.72 },
    "dark-recess": { color: 0x070809, roughness: 1 },
  },
  parts: buildPantherParts(),
  views: [
    { id: "panther-profile", label: "PROFILE · SHOULDER / HOCK / TAIL", projection: "orthographic", position: point(3.2, 0.62, 0), target: point(0, 0.48, -0.285), orthoHeight: 1.48 },
    { id: "panther-front", label: "FRONT · CHEST OVER CONTACTS", projection: "orthographic", position: point(0, 0.62, 3.2), target: point(0, 0.45, 0.05), orthoHeight: 1.2 },
    { id: "panther-top", label: "TOP · SHOULDER / LUMBAR / PELVIS", projection: "orthographic", position: point(0, 4, 0.001), target: point(0, 0.42, -0.24), orthoHeight: 2.7, up: point(0, 0, -1) },
    { id: "panther-three-quarter", label: "THREE QUARTER · PRIMITIVE READ", projection: "perspective", position: point(2, 1.3, 2.7), target: point(0, 0.44, -0.08), fov: 26 },
  ],
};
