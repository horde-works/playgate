import type { ObjectLabPart, ObjectPoint } from "../dutchWindmills/objectModel.ts";
import {
  addBeam,
  addBox,
  addJoint,
  addQuad,
  addTriangle,
  point,
  type CreatureLabModel,
} from "./creatureObjectHelpers.ts";

export const MEDIUM_DRAGON_MORPHOLOGY = {
  bodyPlan: "quadrupedal-wing-forelimbs",
  mass: 180,
  wingArea: 22.5,
  aspectRatio: 6,
  span: 11.62,
  semiSpan: 5.81,
  noseToTailTip: 5.84,
  groundChestHeight: 1.35,
  wingSegments: {
    humerus: 1.18,
    forearm: 1.45,
    metacarpal: 0.55,
    finger1: 0.55,
    finger2: 0.56,
    finger3: 0.54,
    finger4: 0.52,
  },
} as const;

type DragonPose = "ground-folded" | "flight-extended";

const SKIN = "grass" as const;
const SKIN_PLANE = "grass-crown" as const;
const BELLY = "roof-warm" as const;
const MEMBRANE = "canvas" as const;
const CLAW = "foundation" as const;
const TOOTH = "paint-light" as const;
const EYE = "flower-yellow" as const;
const MOUTH = "dark-recess" as const;

function sidePoint(side: -1 | 1, x: number, y: number, z: number): ObjectPoint {
  return point(side * x, y, z);
}

function addTaperedHeadVolume(
  parts: ObjectLabPart[],
  id: string,
  material: typeof SKIN | typeof SKIN_PLANE | typeof BELLY,
  rear: { z: number; halfWidth: number; bottom: number; top: number },
  front: { z: number; halfWidth: number; bottom: number; top: number },
): void {
  parts.push({
    id,
    group: "neck-head",
    material,
    kind: "mesh",
    vertices: [
      point(-rear.halfWidth, rear.bottom, rear.z),
      point(rear.halfWidth, rear.bottom, rear.z),
      point(rear.halfWidth, rear.top, rear.z),
      point(-rear.halfWidth, rear.top, rear.z),
      point(-front.halfWidth, front.bottom, front.z),
      point(front.halfWidth, front.bottom, front.z),
      point(front.halfWidth, front.top, front.z),
      point(-front.halfWidth, front.top, front.z),
    ],
    triangles: [
      [0, 2, 1], [0, 3, 2],
      [4, 5, 6], [4, 6, 7],
      [0, 4, 7], [0, 7, 3],
      [1, 2, 6], [1, 6, 5],
      [3, 7, 6], [3, 6, 2],
      [0, 1, 5], [0, 5, 4],
    ],
    doubleSided: true,
  });
}

function addCore(parts: ObjectLabPart[]): void {
  addBox(parts, "chest", "axial", SKIN_PLANE, point(0, 0.96, 0.34), point(0.92, 0.72, 0.64), point(-0.07, 0, 0));
  addBox(parts, "thorax-rear", "axial", SKIN_PLANE, point(0, 0.87, -0.13), point(0.82, 0.68, 0.56), point(0.025, 0, 0));
  addBox(parts, "sternum-keel", "axial", BELLY, point(0, 0.54, 0.2), point(0.38, 0.48, 0.78), point(-0.045, 0, 0));
  addBox(parts, "abdomen", "axial", SKIN, point(0, 0.81, -0.43), point(0.68, 0.52, 0.72), point(0.06, 0, 0));
  addBox(parts, "pelvis", "axial", SKIN_PLANE, point(0, 0.76, -0.84), point(0.7, 0.5, 0.64), point(0.11, 0, 0));

  const neck: readonly ObjectPoint[] = [
    point(0, 1.13, 0.67),
    point(0, 1.18, 0.93),
    point(0, 1.28, 1.18),
    point(0, 1.39, 1.41),
    point(0, 1.47, 1.62),
    point(0, 1.5, 1.73),
  ];
  const widths = [0.42, 0.37, 0.33, 0.29, 0.25] as const;
  for (let index = 0; index < neck.length - 1; index += 1) {
    addBeam(parts, `neck-${index + 1}`, "neck-head", index < 2 ? SKIN_PLANE : SKIN, neck[index], neck[index + 1], widths[index], widths[index] * 0.92);
    addJoint(parts, `neck-joint-${index + 1}`, "neck-head", index < 2 ? SKIN_PLANE : SKIN, neck[index + 1], widths[index] * 0.94);
  }
  addTaperedHeadVolume(
    parts,
    "skull",
    SKIN_PLANE,
    { z: 1.68, halfWidth: 0.23, bottom: 1.36, top: 1.75 },
    { z: 2.06, halfWidth: 0.18, bottom: 1.39, top: 1.64 },
  );
  addTaperedHeadVolume(
    parts,
    "muzzle",
    SKIN_PLANE,
    { z: 2.02, halfWidth: 0.18, bottom: 1.36, top: 1.56 },
    { z: 2.32, halfWidth: 0.125, bottom: 1.34, top: 1.49 },
  );
  addTaperedHeadVolume(
    parts,
    "lower-jaw",
    BELLY,
    { z: 2.01, halfWidth: 0.17, bottom: 1.29, top: 1.37 },
    { z: 2.3, halfWidth: 0.12, bottom: 1.3, top: 1.35 },
  );
  addBox(parts, "mouth-line", "face", MOUTH, point(0, 1.355, 2.17), point(0.31, 0.025, 0.24));
  addBeam(parts, "nasal-ridge", "face", SKIN_PLANE, point(0, 1.585, 2.02), point(0, 1.5, 2.29), 0.055, 0.07);
  for (const side of [-1, 1] as const) {
    const name = side < 0 ? "left" : "right";
    addQuad(
      parts,
      `${name}-brow-plate`,
      "face",
      SKIN,
      sidePoint(side, 0.185, 1.655, 2.015),
      sidePoint(side, 0.03, 1.61, 2.14),
      sidePoint(side, 0.035, 1.565, 2.145),
      sidePoint(side, 0.17, 1.59, 2.075),
    );
    addBox(parts, `${name}-eye`, "face", EYE, sidePoint(side, 0.1, 1.57, 2.125), point(0.042, 0.022, 0.018));
    addBeam(parts, `${name}-brow-horn`, "face", SKIN, sidePoint(side, 0.14, 1.67, 1.78), sidePoint(side, 0.23, 1.72, 1.53), 0.055, 0.05);
    addBox(parts, `${name}-nostril`, "face", MOUTH, sidePoint(side, 0.064, 1.445, 2.327), point(0.035, 0.022, 0.012));
    addBox(parts, `${name}-canine`, "face", TOOTH, sidePoint(side, 0.14, 1.315, 2.08), point(0.035, 0.075, 0.04));
  }

  const tail: readonly ObjectPoint[] = [
    point(0, 0.8, -1.08),
    point(0, 0.76, -1.34),
    point(0.03, 0.7, -1.61),
    point(0.07, 0.64, -1.88),
    point(0.09, 0.57, -2.15),
    point(0.08, 0.49, -2.42),
    point(0.045, 0.42, -2.68),
    point(0, 0.37, -2.93),
    point(-0.035, 0.35, -3.16),
    point(-0.045, 0.37, -3.36),
    point(-0.025, 0.42, -3.55),
  ];
  const tailWidths = [0.32, 0.295, 0.27, 0.24, 0.21, 0.18, 0.15, 0.12, 0.09, 0.065] as const;
  for (let index = 0; index < tail.length - 1; index += 1) {
    addBeam(parts, `tail-${index + 1}`, "tail", index < 4 ? SKIN_PLANE : SKIN, tail[index], tail[index + 1], tailWidths[index]);
    if (index < tail.length - 2) {
      addJoint(parts, `tail-joint-${index + 1}`, "tail", index < 4 ? SKIN_PLANE : SKIN, tail[index + 1], tailWidths[index] * 0.98);
    }
  }
}

function addGroundHindlimb(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const hip = sidePoint(side, 0.31, 0.82, -0.76);
  const knee = sidePoint(side, 0.34, 0.48, -0.35);
  const ankle = sidePoint(side, 0.39, 0.23, -0.91);
  const pad = sidePoint(side, 0.39, 0.075, -0.57);
  addBeam(parts, `${name}-femur`, "hindlimbs", SKIN_PLANE, hip, knee, 0.3, 0.32);
  addJoint(parts, `${name}-knee`, "hindlimbs", SKIN_PLANE, knee, 0.3);
  addBeam(parts, `${name}-tibia`, "hindlimbs", SKIN, knee, ankle, 0.23, 0.25);
  addJoint(parts, `${name}-ankle`, "hindlimbs", SKIN, ankle, 0.22);
  addBeam(parts, `${name}-metatarsus`, "hindlimbs", SKIN, ankle, pad, 0.16, 0.18);
  addBox(parts, `${name}-hind-pad`, "contacts", BELLY, sidePoint(side, 0.39, 0.055, -0.45), point(0.31, 0.11, 0.5));
  addBox(parts, `${name}-hind-toes`, "contacts", CLAW, sidePoint(side, 0.39, 0.045, -0.18), point(0.34, 0.09, 0.16));
}

function addFlightHindlimb(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const hip = sidePoint(side, 0.3, 0.82, -0.76);
  const knee = sidePoint(side, 0.33, 0.62, -0.48);
  const ankle = sidePoint(side, 0.29, 0.64, -0.92);
  const foot = sidePoint(side, 0.25, 0.62, -1.18);
  addBeam(parts, `${name}-femur`, "hindlimbs", SKIN_PLANE, hip, knee, 0.27, 0.29);
  addJoint(parts, `${name}-knee`, "hindlimbs", SKIN_PLANE, knee, 0.27);
  addBeam(parts, `${name}-tibia`, "hindlimbs", SKIN, knee, ankle, 0.2, 0.22);
  addBeam(parts, `${name}-metatarsus`, "hindlimbs", SKIN, ankle, foot, 0.14, 0.16);
  addBox(parts, `${name}-folded-foot`, "contacts", BELLY, sidePoint(side, 0.25, 0.61, -1.26), point(0.25, 0.14, 0.34));
}

function addFoldedWing(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const shoulder = sidePoint(side, 0.46, 1.16, 0.27);
  const elbow = sidePoint(side, 0.68, 0.78, 0.56);
  const wrist = sidePoint(side, 0.72, 0.16, 0.78);
  const finger0 = sidePoint(side, 0.8, 0.48, 0.34);
  const finger1 = sidePoint(side, 0.79, 0.76, -0.34);
  const finger2 = sidePoint(side, 0.75, 0.87, -1.02);
  const finger3 = sidePoint(side, 0.67, 0.86, -1.61);
  const tip = sidePoint(side, 0.54, 0.8, -2.11);
  const bone = side === 1 ? SKIN_PLANE : SKIN;

  addBeam(parts, `${name}-humerus`, "wing-bones", bone, shoulder, elbow, 0.24, 0.27);
  addJoint(parts, `${name}-elbow`, "wing-bones", bone, elbow, 0.25);
  addBeam(parts, `${name}-forearm`, "wing-bones", bone, elbow, wrist, 0.19, 0.21);
  addJoint(parts, `${name}-wrist`, "wing-bones", bone, wrist, 0.2);
  addBeam(parts, `${name}-wing-metacarpal`, "wing-bones", bone, wrist, finger0, 0.15, 0.17);
  for (const [index, [from, to, width]] of [
    [finger0, finger1, 0.135],
    [finger1, finger2, 0.115],
    [finger2, finger3, 0.09],
    [finger3, tip, 0.065],
  ].entries()) {
    addBeam(parts, `${name}-wing-finger-${index + 1}`, "wing-bones", bone, from as ObjectPoint, to as ObjectPoint, width as number, (width as number) * 0.9);
  }

  addBox(parts, `${name}-manus-pad`, "contacts", BELLY, sidePoint(side, 0.72, 0.055, 0.87), point(0.24, 0.11, 0.38));
  addBox(parts, `${name}-free-digits`, "contacts", CLAW, sidePoint(side, 0.72, 0.04, 1.07), point(0.27, 0.08, 0.16));

  // Folded membrane is shown as four controlled facets. It stays close to the
  // flank and never pretends to be a cloth simulation.
  addTriangle(parts, `${name}-propatagium`, "wing-membrane", MEMBRANE, shoulder, elbow, wrist);
  addQuad(parts, `${name}-fold-panel-root`, "wing-membrane", MEMBRANE, shoulder, wrist, finger0, sidePoint(side, 0.34, 0.78, -0.18));
  addQuad(parts, `${name}-fold-panel-1`, "wing-membrane", MEMBRANE, finger0, finger1, sidePoint(side, 0.37, 0.73, -0.63), sidePoint(side, 0.34, 0.78, -0.18));
  addQuad(parts, `${name}-fold-panel-2`, "wing-membrane", MEMBRANE, finger1, finger2, sidePoint(side, 0.4, 0.72, -1.12), sidePoint(side, 0.37, 0.73, -0.63));
  addQuad(parts, `${name}-fold-panel-3`, "wing-membrane", MEMBRANE, finger2, finger3, sidePoint(side, 0.42, 0.7, -1.58), sidePoint(side, 0.4, 0.72, -1.12));
  addTriangle(parts, `${name}-fold-panel-tip`, "wing-membrane", MEMBRANE, finger3, tip, sidePoint(side, 0.42, 0.7, -1.58));
}

function addExtendedWing(parts: ObjectLabPart[], side: -1 | 1): void {
  const name = side < 0 ? "left" : "right";
  const leading: readonly ObjectPoint[] = [
    sidePoint(side, 0.46, 1.16, 0.27),
    sidePoint(side, 1.64, 1.23, 0.42),
    sidePoint(side, 3.09, 1.17, 0.18),
    sidePoint(side, 3.64, 1.15, 0.03),
    sidePoint(side, 4.19, 1.13, -0.1),
    sidePoint(side, 4.75, 1.1, -0.24),
    sidePoint(side, 5.29, 1.08, -0.42),
    sidePoint(side, 5.81, 1.05, -0.59),
  ];
  const trailing: readonly ObjectPoint[] = [
    sidePoint(side, 0.3, 0.83, -0.75),
    sidePoint(side, 1.55, 0.92, -1.03),
    sidePoint(side, 2.85, 0.96, -1.18),
    sidePoint(side, 3.52, 0.97, -1.17),
    sidePoint(side, 4.15, 0.98, -1.09),
    sidePoint(side, 4.72, 0.99, -0.96),
    sidePoint(side, 5.25, 1.0, -0.79),
    leading[7],
  ];
  const widths = [0.25, 0.2, 0.155, 0.13, 0.108, 0.086, 0.062] as const;
  const labels = ["humerus", "forearm", "wing-metacarpal", "wing-finger-1", "wing-finger-2", "wing-finger-3", "wing-finger-4"] as const;
  for (let index = 0; index < leading.length - 1; index += 1) {
    addBeam(parts, `${name}-${labels[index]}`, "wing-bones", SKIN_PLANE, leading[index], leading[index + 1], widths[index], widths[index] * 0.92);
    if (index < leading.length - 2) {
      addJoint(parts, `${name}-wing-joint-${index + 1}`, "wing-bones", SKIN_PLANE, leading[index + 1], widths[index] * 1.02);
    }
    addQuad(parts, `${name}-membrane-panel-${index + 1}`, "wing-membrane", MEMBRANE, leading[index], leading[index + 1], trailing[index + 1], trailing[index]);
  }
  addTriangle(parts, `${name}-propatagium`, "wing-membrane", MEMBRANE, leading[0], leading[1], leading[2]);
}

function buildDragonParts(pose: DragonPose): readonly ObjectLabPart[] {
  const parts: ObjectLabPart[] = [];
  addCore(parts);
  for (const side of [-1, 1] as const) {
    if (pose === "ground-folded") {
      addGroundHindlimb(parts, side);
      addFoldedWing(parts, side);
    } else {
      addFlightHindlimb(parts, side);
      addExtendedWing(parts, side);
    }
  }
  return parts;
}

const common = {
  units: "metres" as const,
  coordinates: { up: "+Y" as const, front: "+Z" as const, origin: "ground-centre" as const },
  captureFrame: [1600, 1000] as const,
  sourceNotes: [
    "Authored four-limbed dragon: the wing is the forelimb and the folded manus is the ground contact.",
    "180 kg, 22.5 m² wing area, aspect ratio 6, derived span 11.62 m.",
    "Ground and flight studies derive from one morphology contract; no world or flight solver registration.",
  ],
  dimensions: {
    massKg: MEDIUM_DRAGON_MORPHOLOGY.mass,
    wingArea: MEDIUM_DRAGON_MORPHOLOGY.wingArea,
    aspectRatio: MEDIUM_DRAGON_MORPHOLOGY.aspectRatio,
    span: MEDIUM_DRAGON_MORPHOLOGY.span,
    noseToTailTip: MEDIUM_DRAGON_MORPHOLOGY.noseToTailTip,
  },
  labMetrics: [
    { label: "MASS", value: 180, decimals: 0, signed: false, unit: "kg" },
    { label: "SPAN", value: 11.62, decimals: 2, signed: false },
    { label: "WING AREA", value: 22.5, decimals: 1, signed: false, unit: "m²" },
    { label: "BODY", value: 5.84, decimals: 2, signed: false },
  ],
  motionConstraints: {
    frozenPose: true,
    runtimeRegistered: false,
    aerodynamicForcesImplemented: false,
    poseVariantsShareMorphology: true,
  },
  materialOverrides: {
    grass: { color: 0x405247, roughness: 0.96 },
    "grass-crown": { color: 0x59685a, roughness: 0.95 },
    "roof-warm": { color: 0x806c5d, roughness: 0.98 },
    canvas: { color: 0x657665, roughness: 0.96, transparent: true, opacity: 0.76, side: 2 },
    foundation: { color: 0x3a3e3c, roughness: 0.98 },
    "flower-yellow": { color: 0xd2a23b, roughness: 0.68 },
    "dark-recess": { color: 0x111415, roughness: 1 },
  },
} as const;

export const mediumDragonGroundObject: CreatureLabModel = {
  ...common,
  id: "medium-dragon-ground-blockout",
  revision: "dragon-p4-ground-2026-08-13",
  title: "MEDIUM DRAGON · FOLDED GROUND BODY",
  anchors: {
    nose: point(0, 1.44, 2.333),
    tailTip: point(-0.025, 0.42, -3.55),
    leftManus: point(-0.72, 0, 0.87),
    rightManus: point(0.72, 0, 0.87),
    leftHindPad: point(-0.39, 0, -0.45),
    rightHindPad: point(0.39, 0, -0.45),
  },
  labEnvironment: { floorRadius: 7, gridSize: 8, gridDivisions: 24, fogNear: 18, fogFar: 26, floorY: -0.005 },
  parts: buildDragonParts("ground-folded"),
  views: [
    { id: "dragon-ground-profile", label: "GROUND PROFILE · FOLDED WING / FOUR CONTACTS", projection: "orthographic", position: point(7, 1.1, 0), target: point(0, 0.77, -0.55), orthoHeight: 4.0 },
    { id: "dragon-ground-front", label: "GROUND FRONT · DEEP CHEST / MANUS", projection: "orthographic", position: point(0, 1.05, 7), target: point(0, 0.78, 0), orthoHeight: 2.55 },
    { id: "dragon-ground-three-quarter", label: "GROUND THREE QUARTER · FOLDED STRUCTURE", projection: "perspective", position: point(5.6, 3.2, 7.6), target: point(0, 0.78, -0.45), fov: 29 },
  ],
};

export const mediumDragonFlightObject: CreatureLabModel = {
  ...common,
  id: "medium-dragon-flight-blockout",
  revision: "dragon-p4-flight-2026-08-13",
  title: "MEDIUM DRAGON · EXTENDED WING PLANFORM",
  anchors: {
    nose: point(0, 1.44, 2.333),
    tailTip: point(-0.025, 0.42, -3.55),
    leftWingTip: point(-5.81, 1.05, -0.59),
    rightWingTip: point(5.81, 1.05, -0.59),
    leftShoulder: point(-0.46, 1.16, 0.27),
    rightShoulder: point(0.46, 1.16, 0.27),
  },
  labEnvironment: { floorRadius: 9, gridSize: 14, gridDivisions: 28, fogNear: 26, fogFar: 38, floorY: -0.005 },
  parts: buildDragonParts("flight-extended"),
  views: [
    { id: "dragon-flight-top", label: "FLIGHT TOP · 11.62 m PLANFORM", projection: "orthographic", position: point(0, 13, 0.001), target: point(0, 0.75, -0.3), orthoHeight: 7.65, up: point(0, 0, -1) },
    { id: "dragon-flight-front", label: "FLIGHT FRONT · ROOT LOAD / DIHEDRAL", projection: "orthographic", position: point(0, 1.3, 14), target: point(0, 0.95, -0.2), orthoHeight: 3.5 },
    { id: "dragon-flight-three-quarter", label: "FLIGHT THREE QUARTER · SAME SEGMENTS", projection: "perspective", position: point(9.6, 5.8, 9.8), target: point(0, 0.9, -0.4), fov: 31 },
  ],
};
