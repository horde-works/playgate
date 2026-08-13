import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  MEDIUM_DRAGON_MORPHOLOGY,
  mediumDragonGroundCanonicalParts,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import {
  MEDIUM_DRAGON_SKELETON,
  mediumDragonBoneForPart,
  mediumDragonMembraneVertexBone,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonRigObject.ts";
import { basaltStrongholdDragonProfile } from "../games/make-a-mess/src/content/populations/mediumDragonPopulationProfiles.ts";
import {
  computeMediumDragonAerodynamics,
  mediumDragonPanelCoefficients,
  sampleMediumDragonWingState,
} from "../games/make-a-mess/src/game/mediumDragonAerodynamics.ts";
import {
  buildMediumDragonRuntimeGeometry,
  MEDIUM_DRAGON_RUNTIME_BONE_IDS,
} from "../games/make-a-mess/src/game/mediumDragonRuntimeGeometry.ts";
import {
  createMediumDragonContactState,
  createMediumDragonPosePalette,
  mediumDragonSupportWeight,
  writeMediumDragonPose,
} from "../games/make-a-mess/src/game/mediumDragonRuntimePose.ts";
import {
  createMediumDragonRuntime,
  mediumDragonTakeoffPhase,
  sampleMediumDragonPose,
  scoreMediumDragonIntents,
  stepMediumDragon,
} from "../games/make-a-mess/src/game/mediumDragonSim.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

const GROUND_REFERENCE = "ground-folded";
const BONE_INDEX = new Map(
  MEDIUM_DRAGON_SKELETON.bones.map((bone, index) => [bone.id, index]),
);

function dragonDefinition() {
  const definition = basaltStrongholdScene.inhabitantDefinitions.find(
    (candidate) => candidate.kind === "medium-dragon-territory",
  );
  assert.ok(definition, "Basalt Stronghold has no medium dragon population");
  return definition;
}

test("dragon runtime maps the accepted folded body and every membrane vertex to one skeleton", () => {
  const bones = new Set(MEDIUM_DRAGON_SKELETON.bones.map((bone) => bone.id));
  for (const part of mediumDragonGroundCanonicalParts) {
    const bone = mediumDragonBoneForPart(part, GROUND_REFERENCE);
    assert.equal(bones.has(bone), true, `${part.id}: unknown body bone ${bone}`);
    if (part.kind !== "mesh" || part.group !== "wing-membrane") continue;
    for (const [index, vertex] of part.vertices.entries()) {
      const membraneBone = mediumDragonMembraneVertexBone(
        part,
        vertex,
        index,
        GROUND_REFERENCE,
      );
      assert.ok(membraneBone, `${part.id}:${index}: membrane vertex has no segment`);
      assert.equal(bones.has(membraneBone), true, `${part.id}:${index}: unknown ${membraneBone}`);
    }
  }
});

test("Basalt Stronghold owns one dragon profile, roost and destructible landing affordances", () => {
  const definition = dragonDefinition();
  assert.equal(definition.count, 1);
  assert.equal(definition.bodyType, "medium-dragon");
  assert.equal(definition.species, "Draco pterosauroides");
  assert.equal(definition.profile, basaltStrongholdDragonProfile);
  assert.equal(definition.profile.territory.spawnNodeId, "tower-roost");
  assert.ok(definition.profile.skills.includes("quadrupedal-vault-launch"));
  assert.ok(definition.profile.skills.includes("glide-soar"));
  assert.equal(definition.profile.territory.nodes.filter((node) => node.kind === "landing").length, 1);
  assert.equal(definition.profile.territory.nodes.filter((node) => node.kind === "emergency-landing").length, 2);
  for (const node of definition.profile.territory.nodes) {
    for (const pieceId of node.supportPieceIds) {
      assert.equal(
        basaltStrongholdScene.breakablePieceById.has(pieceId),
        true,
        `${node.id}: absent support ${pieceId}`,
      );
    }
  }
});

test("runtime geometry is one canonical draw body with bounded ownership and full flight span", () => {
  const geometry = buildMediumDragonRuntimeGeometry(dragonDefinition());
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const bone = geometry.getAttribute("aDragonBone");
  const expectedVertices = mediumDragonGroundCanonicalParts.reduce((sum, part) => {
    if (part.kind === "box" || part.kind === "beam") return sum + 36;
    if (part.kind === "cylinder") throw new Error("unexpected canonical dragon cylinder");
    return sum + part.triangles.length * 3;
  }, 0);
  assert.equal(position.count, expectedVertices);
  assert.equal(normal.count, expectedVertices);
  assert.equal(color.count, expectedVertices);
  assert.equal(bone.count, expectedVertices);
  assert.ok(Array.from(bone.array).every(
    (value) => Number.isInteger(value) && value >= 0 && value < MEDIUM_DRAGON_RUNTIME_BONE_IDS.length,
  ));
  assert.ok(geometry.boundingBox.min.y >= -0.008);

  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  const palette = createMediumDragonPosePalette();
  const contacts = createMediumDragonContactState();
  for (let tick = 0; tick < 45 * 60; tick += 1) {
    stepMediumDragon(runtime, basaltStrongholdDragonProfile, 1 / 60);
    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(runtime),
      runtime,
      tick / 60,
      contacts,
    );
  }
  assert.equal(runtime.mode, "patrol-flap");
  const vertex = new Vector3();
  let minimumX = Infinity;
  let maximumX = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index).applyMatrix4(palette[bone.getX(index)]);
    minimumX = Math.min(minimumX, vertex.x);
    maximumX = Math.max(maximumX, vertex.x);
  }
  assert.ok(maximumX - minimumX > MEDIUM_DRAGON_MORPHOLOGY.span * 0.94);
  assert.ok(maximumX - minimumX < MEDIUM_DRAGON_MORPHOLOGY.span * 1.02);
  geometry.dispose();
});

test("analytic wing panels distinguish folding, power stroke, recovery, stall and roll trim", () => {
  const folded = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "folded", phase: 0, powerFraction: 0 }),
  });
  const glide = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0 }),
  });
  const downstroke = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 11],
    wing: sampleMediumDragonWingState({ mode: "flap", phase: 0.3, powerFraction: 0.9 }),
  });
  const recovery = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 11],
    wing: sampleMediumDragonWingState({ mode: "flap", phase: 0.75, powerFraction: 0.9 }),
  });
  assert.ok(folded.force[1] < MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81 * 0.01);
  assert.ok(glide.force[1] > MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81);
  assert.ok(downstroke.force[1] > recovery.force[1] * 7);
  assert.ok(downstroke.mechanicalPower > 10_000);
  assert.equal(recovery.mechanicalPower, 0);

  const beforeStall = mediumDragonPanelCoefficients(0.31);
  const deepStall = mediumDragonPanelCoefficients(1.1);
  assert.equal(beforeStall.stalled, false);
  assert.equal(deepStall.stalled, true);
  assert.ok(deepStall.lift < beforeStall.lift * 0.5);
  assert.ok(deepStall.drag > beforeStall.drag * 2);

  const leftTrim = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0, rollControl: -0.7 }),
  });
  const rightTrim = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0, rollControl: 0.7 }),
  });
  assert.ok(leftTrim.moment[2] > 900);
  assert.ok(rightTrim.moment[2] < -900);
});

test("the deterministic animal completes roost, launch, patrol and rooftop landing without pose discontinuity", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  const palette = createMediumDragonPosePalette();
  const contacts = createMediumDragonContactState();
  const visitedModes = new Set([runtime.mode]);
  const visitedTakeoffPhases = new Set();
  let minimumY = runtime.y;
  let minimumReserve = runtime.needs.flightReserve;
  let maximumLoadFactor = 0;
  let touchdownVerticalSpeed = null;
  let touchdownSpeed = null;
  let maximumJointSeparation = 0;
  let previousMode = runtime.mode;

  for (let tick = 0; tick < 130 * 60; tick += 1) {
    const beforeVerticalSpeed = runtime.velocityY;
    stepMediumDragon(runtime, profile, 1 / 60);
    visitedModes.add(runtime.mode);
    const phase = mediumDragonTakeoffPhase(runtime);
    if (phase) visitedTakeoffPhases.add(phase);
    minimumY = Math.min(minimumY, runtime.y);
    minimumReserve = Math.min(minimumReserve, runtime.needs.flightReserve);
    maximumLoadFactor = Math.max(
      maximumLoadFactor,
      Math.hypot(...runtime.lastForce) / (MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81),
    );
    if (previousMode === "flare" && runtime.mode === "touchdown") {
      touchdownVerticalSpeed = beforeVerticalSpeed;
      touchdownSpeed = Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
    }
    previousMode = runtime.mode;

    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(runtime),
      runtime,
      tick / 60,
      contacts,
    );
    for (const matrix of palette) {
      assert.equal(matrix.elements.every(Number.isFinite), true, `non-finite ${runtime.mode} pose`);
    }
    for (const [index, bone] of MEDIUM_DRAGON_SKELETON.bones.entries()) {
      if (!bone.parent) continue;
      const parentIndex = BONE_INDEX.get(bone.parent);
      assert.notEqual(parentIndex, undefined);
      const joint = new Vector3(...bone.rest[GROUND_REFERENCE]);
      const parentPosition = joint.clone().applyMatrix4(palette[parentIndex]);
      const childPosition = joint.applyMatrix4(palette[index]);
      maximumJointSeparation = Math.max(
        maximumJointSeparation,
        parentPosition.distanceTo(childPosition),
      );
    }
  }

  for (const mode of [
    "observe",
    "ground-walk",
    "takeoff",
    "powered-climb",
    "patrol-flap",
    "return",
    "approach",
    "flare",
    "touchdown",
    "wing-unload",
    "ground-recovery",
    "rest",
  ]) {
    assert.equal(visitedModes.has(mode), true, `missing ${mode}`);
  }
  assert.deepEqual(visitedTakeoffPhases, new Set([
    "preload",
    "hind-drive",
    "manus-vault",
    "clearance",
    "unfold",
    "first-downstroke",
  ]));
  assert.ok(minimumY >= 33.37, `fell through roof datum: ${minimumY}`);
  assert.ok(minimumReserve > 0.64, `exhausted flight reserve: ${minimumReserve}`);
  assert.ok(maximumLoadFactor <= 3.451, `unbounded transient load: ${maximumLoadFactor}`);
  assert.ok(touchdownVerticalSpeed > -3.1, `hard vertical touchdown: ${touchdownVerticalSpeed}`);
  assert.ok(touchdownSpeed < 9.2, `unbounded touchdown speed: ${touchdownSpeed}`);
  assert.ok(maximumJointSeparation < 0.006, `skeleton opened by ${maximumJointSeparation} m`);
  assert.equal(runtime.mode, "rest");
  assert.equal(runtime.currentNodeId, "tower-landing");
  const landing = profile.territory.nodes.find((node) => node.id === "tower-landing");
  assert.ok(landing);
  assert.ok(Math.hypot(runtime.x - landing.position[0], runtime.z - landing.position[2]) < 5.5);
});

test("contact order is four-point preload, manus vault, hind touchdown, then manus recovery", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  runtime.mode = "takeoff";
  runtime.modeTime = 0.4;
  let sample = sampleMediumDragonPose(runtime);
  for (const id of ["left-manus-pad", "right-manus-pad", "left-hind-pad", "right-hind-pad"]) {
    assert.equal(mediumDragonSupportWeight(sample, runtime, id), 1);
  }
  runtime.modeTime = 0.92;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-hind-pad"), 0);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-hind-pad"), 0);

  runtime.mode = "touchdown";
  runtime.modeTime = 0.2;
  runtime.grounded = true;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-hind-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-hind-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 0);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 0);

  runtime.mode = "ground-recovery";
  runtime.modeTime = 1;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 1);
});

test("destroyed tower supports force a real emergency circuit and highland landing", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  const roofSupports = profile.territory.nodes.find(
    (node) => node.id === "tower-roost",
  ).supportPieceIds;
  const removedPieceIds = new Set(roofSupports);
  const visitedNodes = new Set([runtime.currentNodeId]);
  let minimumY = runtime.y;
  for (let tick = 0; tick < 150 * 60; tick += 1) {
    stepMediumDragon(runtime, profile, 1 / 60, { removedPieceIds });
    visitedNodes.add(runtime.currentNodeId);
    minimumY = Math.min(minimumY, runtime.y);
    if (runtime.mode === "rest" && runtime.currentNodeId.endsWith("highland")) break;
  }
  assert.equal(runtime.mode, "rest");
  assert.ok(runtime.currentNodeId.endsWith("highland"));
  assert.equal(visitedNodes.has("tower-landing"), false);
  assert.ok(minimumY >= 0.039, `emergency landing crossed the terrain: ${minimumY}`);
});

test("behaviour decisions expose needs and traits instead of opaque random action labels", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  const scores = scoreMediumDragonIntents(runtime, basaltStrongholdDragonProfile);
  assert.equal(scores.length, 6);
  assert.equal(new Set(scores.map((score) => score.intent)).size, 6);
  assert.ok(scores.every((score) => Number.isFinite(score.score) && score.reason.length > 12));
  assert.match(scores.find((score) => score.intent === "patrol").reason, /information .* territory .* reserve/);
  assert.match(runtime.intentReason, /roost and launch corridor/);
});
