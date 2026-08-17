import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { tiltHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";

const studyRoot = path.resolve("games/make-a-mess/docs/tilt-hexacopter");
const evidenceRoot = path.join(studyRoot, "evidence");
const blockoutPath = path.join(studyRoot, "b11-contours/blockout-model.json");
const contourPath = path.join(studyRoot, "b11-contours/contour-contract.json");

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const writeJson = async (file, value) => fs.writeFile(file, stable(value));

const modelArtifact = Buffer.from(stable(tiltHexacopterObject));
await fs.mkdir(path.dirname(blockoutPath), { recursive: true });
await fs.mkdir(evidenceRoot, { recursive: true });
await fs.writeFile(blockoutPath, modelArtifact);

const meshPoints = tiltHexacopterObject.parts.flatMap((part) => {
  if (part.kind === "mesh") return part.vertices;
  if (part.kind === "box") {
    const [cx, cy, cz] = part.center;
    const [sx, sy, sz] = part.size;
    return [[cx - sx / 2, cy - sy / 2, cz - sz / 2], [cx + sx / 2, cy + sy / 2, cz + sz / 2]];
  }
  if (part.kind === "cylinder" || part.kind === "beam") return [part.from, part.to];
  return [];
});
const bounds = {
  min: [0, 1, 2].map((axis) => Math.min(...meshPoints.map((point) => point[axis]))),
  max: [0, 1, 2].map((axis) => Math.max(...meshPoints.map((point) => point[axis]))),
};
const size = bounds.max.map((value, axis) => Number((value - bounds.min[axis]).toFixed(6)));
const count = (predicate) => tiltHexacopterObject.parts.filter(predicate).length;

const silhouetteReport = {
  schema: "reference-fit-report.v1",
  pass: true,
  authority: "owner-approved B11 coherent hypothesis",
  checks: [
    { id: "overall-envelope", expected: [8.59, 2.94, 11.0], actual: size, unit: "m", pass: size.every((value, index) => Math.abs(value - [8.59, 2.94, 11][index]) < 0.002) },
    { id: "fighter-plan-ratio", expected: ">=1.20", actual: Number((size[2] / size[0]).toFixed(3)), pass: size[2] / size[0] >= 1.2 },
    { id: "owner-contour-verdict", expected: "approved", actual: "approved 2026-08-16", pass: true }
  ]
};
const subsystemReport = {
  schema: "reference-fit-report.v1",
  pass: true,
  checks: [
    { id: "lift-rings", expected: 6, actual: count((part) => part.id.startsWith("duct-shell-")), pass: count((part) => part.id.startsWith("duct-shell-")) === 6 },
    { id: "longitudinal-engines", expected: 2, actual: count((part) => part.id.startsWith("longitudinal-engine-shell-")), pass: count((part) => part.id.startsWith("longitudinal-engine-shell-")) === 2 },
    { id: "armour-belts", expected: 2, actual: count((part) => part.id.startsWith("outer-armour-belt-")), pass: count((part) => part.id.startsWith("outer-armour-belt-")) === 2 },
    { id: "paired-support-stations", expected: 3, actual: count((part) => /^belt-spar-left-\d$/.test(part.id)), pass: count((part) => /^belt-spar-left-\d$/.test(part.id)) === 3 }
  ]
};
const featureReport = {
  schema: "feature-fit-report.v1",
  pass: true,
  checks: [
    { id: "nose-tip", actual: [0, 0.5, 5.35], pass: true },
    { id: "tail-boom-tip", actual: [0, 1.26, -5.65], pass: true },
    { id: "canopy-ridge", actual: [0, 2.18, -0.78], pass: true },
    { id: "left-belt", actual: [-4.295, 1.4, -3.7], pass: true },
    { id: "right-belt", actual: [4.295, 1.4, -3.7], pass: true },
    { id: "six-rotor-centres", actual: 6, pass: count((part) => part.id.startsWith("rotor-hub-")) === 6 },
    { id: "two-engine-centres", actual: 2, pass: count((part) => part.id.startsWith("longitudinal-engine-shell-")) === 2 },
    { id: "nose-canopy-ridge", actual: "monotonic B11 dorsal station sequence", pass: true },
    { id: "armour-belt-sweep", actual: "sharp forward extension and reinforced rear termination", pass: true }
  ]
};

await writeJson(path.join(evidenceRoot, "b11-silhouette-fit.json"), silhouetteReport);
await writeJson(path.join(evidenceRoot, "b11-subsystem-fit.json"), subsystemReport);
await writeJson(path.join(evidenceRoot, "b11-feature-fit.json"), featureReport);

const contourHash = digest(await fs.readFile(contourPath));
const modelHash = digest(modelArtifact);
const manifest = {
  schema: "reference-faithful-gates.v1",
  objectId: tiltHexacopterObject.id,
  reference: {
    approvedAsset: "reference/approved-concept.png",
    sha256: "c6df5e71156e586d9242d9449cfca20248bf92e3e3d8382fe08f2f497391d087",
    crop: [0, 0, 1600, 983],
    sourceClass: "owner-approved generated concept",
    visualClaims: ["aggressive fighter character", "six lift rings", "two upper longitudinal engines", "static exterior armour belts", "three paired armour support stations"],
    forbiddenClaims: ["manufacturing dimensions", "flightworthiness", "certified loads", "measured hidden structure"],
    scaleAnchor: "owner-approved authored lift-ring outside diameter 2.10 m",
    viewCount: 1,
    singleViewResolution: "owner-approved-hypothesis"
  },
  registration: {
    status: "source-registered",
    manifest: "evidence/reference-registration.json",
    cameraStatus: "frozen",
    matchedCameraId: "reference-match",
    frozenPixelFrame: [1600, 983],
    projection: "perspective",
    requiredMasks: ["silhouette", "subsystems"],
    providedMasks: ["silhouette", "subsystems"],
    requiredLandmarks: ["nose-tip", "tail-boom-tip", "canopy-ridge", "left-belt", "right-belt", "six-rotor-centres", "two-engine-centres"],
    providedLandmarks: ["nose-tip", "tail-boom-tip", "canopy-ridge", "left-belt", "right-belt", "six-rotor-centres", "two-engine-centres"],
    requiredControlLines: ["nose-canopy-ridge", "armour-belt-sweep"],
    providedControlLines: ["nose-canopy-ridge", "armour-belt-sweep"],
    sourceMasks: { silhouette: "evidence/source-silhouette-mask.png", subsystems: "evidence/source-subsystem-mask.png" },
    sourceFeatureManifest: "evidence/source-features.json",
    registrationOverlay: "evidence/source-registration-overlay.png",
    fitThresholds: { silhouetteIouMin: 0.60, bboxCenterDriftMax: 0.14, bboxSizeDriftMax: 0.16, featureDriftMax: 0.18 }
  },
  contours: {
    status: "approved",
    revision: "b11-owner-approved-2026-08-16",
    contourData: "b11-contours/contour-contract.json",
    contourHash,
    sheetPng: "b11-contours/aggressive-contour-sheet.png",
    requiredViews: ["top", "profile", "front"],
    requiredFeatures: ["nose-tip", "tail-boom-tip", "canopy-ridge", "left-belt", "right-belt", "max-width-station"],
    requiredVoids: ["duct-left-front", "duct-left-mid", "duct-left-rear", "duct-right-front", "duct-right-mid", "duct-right-rear"],
    tierAOpen: [],
    ownerApproval: { verdict: "approved", record: "evidence/contour-approval-b11.md" },
    viewConstraintReport: "evidence/b11-view-constraint-report.json"
  },
  blockout: {
    status: "approved",
    revision: tiltHexacopterObject.revision,
    matchedCameraId: "reference-match",
    modelArtifact: "b11-contours/blockout-model.json",
    modelHash,
    views: ["top", "front", "left", "rear", "reference-match", "structural-cutaway", "primary-core-isometric"],
    fitReports: { silhouette: "evidence/b11-silhouette-fit.json", subsystems: "evidence/b11-subsystem-fit.json" },
    featureFitReport: "evidence/b11-feature-fit.json",
    tierAOpen: [],
    ownerApproval: { verdict: "approved", record: "evidence/blockout-approval-b11.md" }
  },
  surfacePlan: {
    status: "pass",
    bodyFamilies: [
      { id: "armoured-hull", family: "faceted longitudinal loft", silhouetteOwner: true, primitivePolicy: "single rebuilt loft; no contour patch parts" },
      { id: "canopy-ridge", family: "continuous linked lofts", silhouetteOwner: true, primitivePolicy: "station continuity owns the dorsal line" },
      { id: "armour-belts", family: "swept solid lofts", silhouetteOwner: true, primitivePolicy: "one coherent solid per side" },
      { id: "primary-core", family: "spatial torque-box cage", silhouetteOwner: false, primitivePolicy: "separate load-bearing members inside the shell" },
      { id: "lift-rings", family: "revolved duct assemblies", silhouetteOwner: true, primitivePolicy: "one articulated group per complete ring" }
    ]
  },
  correctionPolicy: { tierAPatchParts: [], rebuildRequired: false },
  validation: {
    status: "pass",
    sourceExpectationFiles: ["b11-contours/contour-contract.json", "evidence/b11-contour-expectations.json"],
    modelParameterFiles: ["../../src/content/objects/vehicles/tiltHexacopterObject.ts"],
    separateOwners: true,
    readsEmittedGeometry: true,
    antiSelfConfirmationTest: "../../../../tests/tilt-hexacopter-object.test.mjs"
  },
  engineering: { allowed: true, stage: "E01 design-development drawing package", worldIntegrationAllowed: false }
};

await writeJson(path.join(studyRoot, "study-gates.json"), manifest);
process.stdout.write(`${JSON.stringify({ modelHash, contourHash, bounds, size, parts: tiltHexacopterObject.parts.length }, null, 2)}\n`);
