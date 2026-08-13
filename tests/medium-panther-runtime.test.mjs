import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { mediumPantherCanonicalParts } from "../games/make-a-mess/src/content/objects/creatures/mediumPantherObject.ts";
import {
  MEDIUM_PANTHER_SKELETON,
  mediumPantherBoneForPart,
} from "../games/make-a-mess/src/content/objects/creatures/mediumPantherRigObject.ts";
import { vikingVillagePantherProfile } from "../games/make-a-mess/src/content/populations/mediumFelinePopulationProfiles.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import {
  createMediumPantherRuntime,
  findMediumPantherPerches,
  sampleMediumPantherPose,
  stepMediumPanther,
} from "../games/make-a-mess/src/game/mediumPantherSim.ts";
import {
  buildMediumPantherRuntimeGeometry,
  MEDIUM_PANTHER_RUNTIME_BONE_IDS,
} from "../games/make-a-mess/src/game/mediumPantherRuntimeGeometry.ts";
import {
  createMediumPantherContactState,
  createMediumPantherPosePalette,
  mediumPantherPawSupportWeight,
  writeMediumPantherPose,
} from "../games/make-a-mess/src/game/mediumPantherRuntimePose.ts";
import {
  articulatedSurfaceHeightAt,
  buildObstacleField,
  distanceToBox,
} from "../games/make-a-mess/src/game/villagerNavigation.ts";

const PANTHER_PAW_IDS = [
  "left-fore-paw",
  "right-fore-paw",
  "left-hind-paw",
  "right-hind-paw",
];
const PANTHER_BONE_INDEX = new Map(
  MEDIUM_PANTHER_SKELETON.bones.map((bone, index) => [bone.id, index]),
);
const PANTHER_PAW_PROBES = PANTHER_PAW_IDS.map((id) => {
  const part = mediumPantherCanonicalParts.find((candidate) => candidate.id === id);
  assert.ok(part && part.kind === "box", `${id}: missing canonical paw box`);
  const bone = PANTHER_BONE_INDEX.get(mediumPantherBoneForPart(part));
  assert.notEqual(bone, undefined, `${id}: missing runtime bone`);
  return { id, point: new Vector3(...part.center), bone };
});

function pawWorldXZ(paw, palette, runtime) {
  const local = paw.point.clone().applyMatrix4(palette[paw.bone]);
  const sine = Math.sin(runtime.heading);
  const cosine = Math.cos(runtime.heading);
  return {
    x: runtime.x + cosine * local.x + sine * local.z,
    z: runtime.z - sine * local.x + cosine * local.z,
  };
}

function pawWorld(paw, palette, runtime) {
  const local = paw.point.clone().applyMatrix4(palette[paw.bone]);
  const sine = Math.sin(runtime.heading);
  const cosine = Math.cos(runtime.heading);
  return {
    x: runtime.x + cosine * local.x + sine * local.z,
    y: runtime.groundY + runtime.airHeight + local.y,
    z: runtime.z - sine * local.x + cosine * local.z,
  };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

test("panther runtime maps every accepted P4 part to the accepted M2 skeleton", () => {
  const bones = new Set(MEDIUM_PANTHER_SKELETON.bones.map((bone) => bone.id));
  const mapped = mediumPantherCanonicalParts.map((part) => [part.id, mediumPantherBoneForPart(part)]);
  assert.equal(mapped.length, mediumPantherCanonicalParts.length);
  assert.equal(new Set(mapped.map(([partId]) => partId)).size, mediumPantherCanonicalParts.length);
  for (const [partId, boneId] of mapped) {
    assert.equal(bones.has(boneId), true, `${partId}: unknown runtime bone ${boneId}`);
  }
});

test("village panther profile separates species, skills and world territory", () => {
  assert.equal(vikingVillagePantherProfile.species, "Panthera pardus");
  assert.equal(vikingVillagePantherProfile.phenotype, "melanistic");
  assert.deepEqual(vikingVillagePantherProfile.skills, [
    "observe",
    "territory-roam",
    "play-sprint",
    "ground-bound",
    "terrain-perch",
  ]);
  assert.ok(vikingVillagePantherProfile.territory.circuit.length >= 8);
  assert.ok(vikingVillagePantherProfile.territory.lookouts.length >= 3);
  const population = vikingVillageScene.inhabitantDefinitions.find(
    (definition) => definition.kind === "medium-feline-territory",
  );
  assert.ok(population);
  assert.equal(population.count, 1);
  assert.equal(population.profile, vikingVillagePantherProfile);
});

test("runtime renderer merges the canonical parts without changing scale or bone ownership", () => {
  const definition = vikingVillageScene.inhabitantDefinitions.find(
    (candidate) => candidate.kind === "medium-feline-territory",
  );
  assert.ok(definition);
  const geometry = buildMediumPantherRuntimeGeometry(definition);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const bone = geometry.getAttribute("aPantherBone");
  const expectedVertices = mediumPantherCanonicalParts.reduce((sum, part) => {
    if (part.kind === "box" || part.kind === "beam") return sum + 36;
    if (part.kind === "cylinder") throw new Error("unexpected canonical cylinder");
    return sum + part.triangles.length * 3;
  }, 0);

  assert.equal(position.count, expectedVertices);
  assert.equal(normal.count, expectedVertices);
  assert.equal(color.count, expectedVertices);
  assert.equal(bone.count, expectedVertices);
  assert.ok(
    Array.from(bone.array).every(
      (value) => Number.isInteger(value) && value >= 0 && value < MEDIUM_PANTHER_RUNTIME_BONE_IDS.length,
    ),
  );
  assert.ok(geometry.boundingBox.min.y >= -1e-6, `runtime body below bind floor: ${geometry.boundingBox.min.y}`);
  assert.ok(geometry.boundingBox.max.y > 0.87 && geometry.boundingBox.max.y < 0.9);
  assert.ok(geometry.boundingBox.max.z > 0.845 && geometry.boundingBox.min.z < -1.42);
  geometry.dispose();
});

test("interpolated runtime poses keep the accepted body above its contact surface", () => {
  const definition = vikingVillageScene.inhabitantDefinitions.find(
    (candidate) => candidate.kind === "medium-feline-territory",
  );
  assert.ok(definition);
  const geometry = buildMediumPantherRuntimeGeometry(definition);
  const position = geometry.getAttribute("position");
  const bone = geometry.getAttribute("aPantherBone");
  const palette = createMediumPantherPosePalette();
  const contactState = createMediumPantherContactState();
  const runtime = createMediumPantherRuntime(vikingVillagePantherProfile);
  const vertex = new Vector3();
  let worst = Infinity;
  let worstMode = runtime.mode;
  let worstBone = "";
  let worstPose = "";
  let worstRuntime = "";

  for (let tick = 0; tick < 600; tick += 1) {
    stepMediumPanther(runtime, vikingVillagePantherProfile, 1 / 30, null);
    const sample = sampleMediumPantherPose(runtime);
    writeMediumPantherPose(
      palette,
      sample,
      runtime,
      tick / 30,
      contactState,
    );
    let minimumY = Infinity;
    let minimumBone = "";
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(palette[bone.getX(index)]);
      const worldY = vertex.y + runtime.airHeight;
      if (worldY < minimumY) {
        minimumY = worldY;
        minimumBone = MEDIUM_PANTHER_SKELETON.bones[bone.getX(index)].id;
      }
    }
    if (minimumY < worst) {
      worst = minimumY;
      worstMode = runtime.mode;
      worstBone = minimumBone;
      worstPose = `${sample.current}->${sample.next}@${sample.blend.toFixed(2)}`;
      worstRuntime = `tick=${tick},air=${runtime.airHeight.toFixed(3)},phase=${sample.cyclePhase?.toFixed(3)},support=${mediumPantherPawSupportWeight(sample, "left-fore-paw").toFixed(3)}`;
    }
  }

  assert.ok(worst >= -0.012, `${worstMode}/${worstPose}/${worstBone}/${worstRuntime}: runtime geometry enters ground by ${(-worst).toFixed(4)} m`);
  geometry.dispose();
});

test("gait duty factors preserve feline support order without unreachable atlas-long contacts", () => {
  const expectedSupportCounts = {
    walk: new Set([2, 3]),
    trot: new Set([0, 2]),
    // Consecutive fore or hind contacts briefly overlap while load passes
    // through the shoulder/pelvis; forbidding that transfer caused the old
    // one-frame impact and visible shake.
    gallop: new Set([0, 1, 2]),
  };
  for (const [gait, expected] of Object.entries(expectedSupportCounts)) {
    const actual = new Set();
    for (let step = 0; step < 1000; step += 1) {
      const sample = {
        current: "stand-observe",
        next: "stand-observe",
        blend: 0,
        gait,
        cyclePhase: step / 1000,
      };
      actual.add(PANTHER_PAW_IDS.filter(
        (pawId) => mediumPantherPawSupportWeight(sample, pawId) > 0.01,
      ).length);
    }
    assert.deepEqual(actual, expected, `${gait}: wrong continuous support topology`);
  }
});

test("whole panther skeleton keeps bounded velocity and acceleration through gait changes", () => {
  const profile = {
    ...vikingVillagePantherProfile,
    id: "panther-whole-body-continuity",
    skills: vikingVillagePantherProfile.skills.filter((skill) => skill !== "terrain-perch"),
  };
  const runtime = createMediumPantherRuntime(profile);
  const palette = createMediumPantherPosePalette();
  const contacts = createMediumPantherContactState();
  const axialBones = ["root", "pelvis", "lumbar", "chest", "neck", "head"].map((id) => {
    const index = PANTHER_BONE_INDEX.get(id);
    assert.notEqual(index, undefined, `${id}: missing axial bone`);
    return { id, index, point: new Vector3(...MEDIUM_PANTHER_SKELETON.bones[index].rest.neutral) };
  });
  const previous = new Map();
  const previousDelta = new Map();
  const dt = 1 / 60;
  let maximumFrameTravel = 0;
  let maximumFrameAcceleration = 0;
  let maximumLoadStep = 0;
  let maximumJointSeparation = 0;
  let maximumJointContext = "";
  let maximumShoulderSlingTravel = 0;
  let modeChanges = 0;
  let previousMode = runtime.mode;

  for (let tick = 0; tick < 1800; tick += 1) {
    stepMediumPanther(runtime, profile, dt, null);
    writeMediumPantherPose(
      palette,
      sampleMediumPantherPose(runtime),
      runtime,
      tick * dt,
      contacts,
    );
    if (runtime.mode !== previousMode) modeChanges += 1;
    previousMode = runtime.mode;

    for (const bone of axialBones) {
      const position = bone.point.clone().applyMatrix4(palette[bone.index]);
      const prior = previous.get(bone.id);
      if (prior) {
        const delta = position.clone().sub(prior);
        maximumFrameTravel = Math.max(maximumFrameTravel, delta.length());
        const priorDelta = previousDelta.get(bone.id);
        if (priorDelta) {
          maximumFrameAcceleration = Math.max(
            maximumFrameAcceleration,
            delta.clone().sub(priorDelta).length(),
          );
        }
        previousDelta.set(bone.id, delta);
      }
      previous.set(bone.id, position);
    }

    for (const [pawId, contact] of contacts.paws) {
      const key = `load:${pawId}`;
      const prior = previous.get(key);
      if (typeof prior === "number") {
        maximumLoadStep = Math.max(maximumLoadStep, Math.abs(contact.weight - prior));
      }
      previous.set(key, contact.weight);
    }

    for (const [index, bone] of MEDIUM_PANTHER_SKELETON.bones.entries()) {
      if (!bone.parent) continue;
      const parent = PANTHER_BONE_INDEX.get(bone.parent);
      assert.notEqual(parent, undefined, `${bone.id}: missing parent ${bone.parent}`);
      const joint = new Vector3(...bone.rest.neutral);
      const throughParent = joint.clone().applyMatrix4(palette[parent]);
      const throughChild = joint.applyMatrix4(palette[index]);
      const separation = throughParent.distanceTo(throughChild);
      if (bone.id.endsWith("scapula")) {
        maximumShoulderSlingTravel = Math.max(maximumShoulderSlingTravel, separation);
        continue;
      }
      if (separation > maximumJointSeparation) {
        maximumJointSeparation = separation;
        maximumJointContext = `${bone.parent}->${bone.id} at tick ${tick} (${runtime.mode})`;
      }
    }
  }

  assert.ok(modeChanges >= 8, `only ${modeChanges} gait/action changes exercised`);
  assert.ok(
    maximumFrameTravel < 0.075,
    `axial skeleton teleported ${maximumFrameTravel.toFixed(4)} m in one frame`,
  );
  assert.ok(
    maximumFrameAcceleration < 0.05,
    `axial skeleton changed frame velocity by ${maximumFrameAcceleration.toFixed(4)} m`,
  );
  assert.ok(
    maximumLoadStep <= 0.17,
    `support load jumped by ${maximumLoadStep.toFixed(3)} in one frame`,
  );
  assert.ok(
    maximumJointSeparation < 1e-5,
    `connected skeleton opened a ${maximumJointSeparation.toFixed(4)} m joint gap: ${maximumJointContext}`,
  );
  assert.ok(
    maximumShoulderSlingTravel > 0.01,
    `muscular shoulder sling never engaged: ${maximumShoulderSlingTravel.toFixed(4)} m`,
  );
  assert.ok(
    maximumShoulderSlingTravel < 0.125,
    `muscular shoulder sling travelled ${maximumShoulderSlingTravel.toFixed(4)} m`,
  );
});

test("planted panther paws stay in world contact while the body advances and turns", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const locomotionProfile = {
    ...vikingVillagePantherProfile,
    id: "panther-contact-route",
    skills: vikingVillagePantherProfile.skills.filter((skill) => skill !== "terrain-perch"),
  };
  const runtime = createMediumPantherRuntime(locomotionProfile);
  const palette = createMediumPantherPosePalette();
  const contactState = createMediumPantherContactState();
  const previous = new Map();
  const stanceSpeeds = { walk: [], trot: [], gallop: [] };
  const dt = 1 / 60;

  for (let tick = 0; tick < 3000; tick += 1) {
    stepMediumPanther(runtime, locomotionProfile, dt, field);
    const sample = sampleMediumPantherPose(runtime);
    writeMediumPantherPose(palette, sample, runtime, tick * dt, contactState);
    for (const paw of PANTHER_PAW_PROBES) {
      const position = pawWorldXZ(paw, palette, runtime);
      const support = mediumPantherPawSupportWeight(sample, paw.id);
      const prior = previous.get(paw.id);
      if (
        prior &&
        runtime.mode === prior.mode &&
        runtime.mode in stanceSpeeds &&
        support >= 0.999 &&
        prior.support >= 0.999
      ) {
        stanceSpeeds[runtime.mode].push(
          Math.hypot(position.x - prior.x, position.z - prior.z) / dt,
        );
      }
      previous.set(paw.id, { ...position, support, mode: runtime.mode });
    }
  }

  const limits = {
    walk: { minimumSamples: 1500, mean: 0.08, p99: 0.3 },
    trot: { minimumSamples: 250, mean: 0.03, p99: 0.08 },
    gallop: { minimumSamples: 40, mean: 0.02, p99: 0.06 },
  };
  for (const [gait, samples] of Object.entries(stanceSpeeds)) {
    const limit = limits[gait];
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p99 = percentile(samples, 0.99);
    assert.ok(samples.length >= limit.minimumSamples, `${gait}: only ${samples.length} stance samples`);
    assert.ok(mean <= limit.mean, `${gait}: mean planted-paw speed ${mean.toFixed(3)} m/s`);
    assert.ok(p99 <= limit.p99, `${gait}: p99 planted-paw speed ${p99.toFixed(3)} m/s`);
  }
});

test("a small landscape stone lifts one paw instead of the whole panther root", () => {
  const runtime = createMediumPantherRuntime(vikingVillagePantherProfile);
  runtime.x = 0;
  runtime.z = 0;
  runtime.heading = 0;
  runtime.mode = "walk";
  runtime.modeTime = 0;
  runtime.gaitDistance = 0;
  const sample = sampleMediumPantherPose(runtime);
  const palette = createMediumPantherPosePalette();
  writeMediumPantherPose(
    palette,
    sample,
    runtime,
    0,
    createMediumPantherContactState(),
  );
  const leftFore = PANTHER_PAW_PROBES.find((paw) => paw.id === "left-fore-paw");
  assert.ok(leftFore);
  const contact = pawWorld(leftFore, palette, runtime);
  const field = buildObstacleField([{
    id: "test:terrain-stones:pebble:piece",
    material: "stone",
    shape: "stoneBlock",
    position: [contact.x, 0.11, contact.z],
    size: [0.32, 0.22, 0.32],
  }]);

  const groundedProfile = {
    ...vikingVillagePantherProfile,
    id: "small-stone-panther",
    skills: ["observe", "territory-roam"],
  };
  stepMediumPanther(runtime, groundedProfile, 1 / 60, field);
  assert.ok(runtime.groundY < 0.005, `small stone lifted root to ${runtime.groundY}`);

  const contacts = createMediumPantherContactState();
  const posedSample = sampleMediumPantherPose(runtime);
  writeMediumPantherPose(
    palette,
    posedSample,
    runtime,
    1 / 60,
    contacts,
    field,
  );
  const lifted = contacts.paws.get("left-fore-paw");
  const level = contacts.paws.get("right-fore-paw");
  assert.ok(lifted.active && level.active);
  assert.ok(
    lifted.anchorY - level.anchorY > 0.17,
    `individual paw rise only ${(lifted.anchorY - level.anchorY).toFixed(3)} m`,
  );

  const baselinePalette = createMediumPantherPosePalette();
  writeMediumPantherPose(
    baselinePalette,
    posedSample,
    runtime,
    1 / 60,
    createMediumPantherContactState(),
  );
  const root = PANTHER_BONE_INDEX.get("root");
  assert.notEqual(root, undefined);
  const rootPoint = new Vector3(...MEDIUM_PANTHER_SKELETON.bones[root].rest.neutral);
  const terrainRootY = rootPoint.clone().applyMatrix4(palette[root]).y;
  const baselineRootY = rootPoint.applyMatrix4(baselinePalette[root]).y;
  assert.ok(
    Math.abs(terrainRootY - baselineRootY) < 1e-6,
    `single stone lifted the rendered root by ${Math.abs(terrainRootY - baselineRootY).toFixed(4)} m`,
  );

  const definition = vikingVillageScene.inhabitantDefinitions.find(
    (candidate) => candidate.kind === "medium-feline-territory",
  );
  assert.ok(definition);
  const geometry = buildMediumPantherRuntimeGeometry(definition);
  const positions = geometry.getAttribute("position");
  const bones = geometry.getAttribute("aPantherBone");
  let minimumForepawClearance = Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    if (bones.getX(index) !== leftFore.bone) continue;
    const local = new Vector3()
      .fromBufferAttribute(positions, index)
      .applyMatrix4(palette[leftFore.bone]);
    const sine = Math.sin(runtime.heading);
    const cosine = Math.cos(runtime.heading);
    const worldX = runtime.x + cosine * local.x + sine * local.z;
    const worldZ = runtime.z - sine * local.x + cosine * local.z;
    const surface = articulatedSurfaceHeightAt(
      field,
      worldX,
      worldZ,
      runtime.groundY,
      new Set(),
    );
    minimumForepawClearance = Math.min(
      minimumForepawClearance,
      runtime.groundY + runtime.airHeight + local.y - surface,
    );
  }
  assert.ok(
    minimumForepawClearance >= -0.012,
    `forepaw enters its stone by ${(-minimumForepawClearance).toFixed(4)} m`,
  );
  geometry.dispose();
});

test("live natural rocks become landing targets, not walls or decorative stones", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const targets = findMediumPantherPerches(
    vikingVillagePantherProfile,
    field,
    5,
    34,
    0,
  );
  assert.ok(targets.length >= 2);
  assert.ok(targets.every((target) => /terrain-stones:survey-boulder/.test(target.id)));
  assert.ok(targets.every((target) => target.landingY >= 0.8 && target.landingY <= 1.1));
  assert.ok(targets.every((target) => Math.hypot(
    target.landingX - target.launchX,
    target.landingZ - target.launchZ,
  ) >= 1.25));
  const afterBreak = findMediumPantherPerches(
    vikingVillagePantherProfile,
    field,
    5,
    34,
    0,
    new Set([targets[0].id]),
  );
  assert.equal(afterBreak.some((target) => target.id === targets[0].id), false);
});

test("panther takes off, lands on the rock top and sits there to observe", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const runtime = createMediumPantherRuntime(vikingVillagePantherProfile);
  const modes = new Set([runtime.mode]);
  let maximumWorldY = 0;
  let landingTarget;
  for (let tick = 0; tick < 300 && runtime.mode !== "perch-observe"; tick += 1) {
    stepMediumPanther(runtime, vikingVillagePantherProfile, 1 / 30, field);
    modes.add(runtime.mode);
    maximumWorldY = Math.max(maximumWorldY, runtime.groundY + runtime.airHeight);
    landingTarget ??= runtime.perchTarget;
  }
  assert.ok(landingTarget);
  assert.deepEqual(modes, new Set([
    "observe",
    "perch-approach",
    "bound-preload",
    "bound-flight",
    "landing",
    "perch-observe",
  ]));
  assert.equal(runtime.perchVisits, 1);
  assert.equal(sampleMediumPantherPose(runtime).current, "sit-observe");
  assert.ok(Math.hypot(runtime.x - landingTarget.landingX, runtime.z - landingTarget.landingZ) < 1e-6);
  assert.ok(Math.abs(runtime.groundY - landingTarget.landingY) < 1e-6);
  assert.ok(maximumWorldY > landingTarget.landingY + 0.4);
});

test("feline skills select behaviour instead of changing the body or world adapter", () => {
  const quietProfile = {
    ...vikingVillagePantherProfile,
    id: "quiet-panther",
    skills: ["observe", "territory-roam"],
  };
  const runtime = createMediumPantherRuntime(quietProfile);
  const modes = new Set();
  let maximumSpeed = 0;
  for (let tick = 0; tick < 900; tick += 1) {
    stepMediumPanther(runtime, quietProfile, 1 / 30, null);
    modes.add(runtime.mode);
    maximumSpeed = Math.max(maximumSpeed, runtime.speed);
  }
  assert.equal(modes.has("accelerate"), false);
  assert.equal(modes.has("gallop"), false);
  assert.equal(modes.has("bound-flight"), false);
  assert.ok(maximumSpeed > 2 && maximumSpeed < 2.4);
});

test("panther completes a living frolic cycle without entering intact tall obstacles", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const runtime = createMediumPantherRuntime(vikingVillagePantherProfile);
  const modes = new Set([runtime.mode]);
  const poses = new Set([sampleMediumPantherPose(runtime).current]);
  let maximumSpeed = 0;
  let maximumAir = 0;
  let turns = 0;
  let previousHeading = runtime.heading;

  for (let tick = 0; tick < 1500; tick += 1) {
    stepMediumPanther(runtime, vikingVillagePantherProfile, 1 / 30, field);
    modes.add(runtime.mode);
    const pose = sampleMediumPantherPose(runtime);
    poses.add(pose.current);
    poses.add(pose.next);
    maximumSpeed = Math.max(maximumSpeed, runtime.speed);
    maximumAir = Math.max(maximumAir, runtime.airHeight);
    if (Math.abs(runtime.heading - previousHeading) > 0.025) turns += 1;
    previousHeading = runtime.heading;

    for (const box of field.query(runtime.x, runtime.z, 0.34)) {
      if (
        box.id === runtime.perchTarget?.id
        && (runtime.jump || runtime.mode === "perch-observe")
      ) continue;
      if (box.top <= runtime.groundY + 0.46) continue;
      assert.ok(
        distanceToBox(box, runtime.x, runtime.z) > 0.26,
        `${runtime.mode}: entered ${box.id} at ${runtime.x.toFixed(2)}, ${runtime.z.toFixed(2)}`,
      );
    }
  }

  assert.deepEqual(modes, new Set([
    "observe",
    "walk",
    "trot",
    "accelerate",
    "gallop",
    "bound-preload",
    "bound-flight",
    "landing",
    "brake",
    "perch-approach",
    "perch-observe",
  ]));
  assert.ok(maximumSpeed > 4.7, `maximum speed ${maximumSpeed}`);
  assert.ok(maximumAir > 0.58, `maximum bound ${maximumAir}`);
  assert.ok(runtime.travelled > 60, `travelled only ${runtime.travelled}`);
  assert.ok(turns > 100, `route was too straight: ${turns} turning samples`);
  assert.ok(poses.has("stand-observe"));
  assert.ok(poses.has("jump-flight"));
  assert.ok(poses.has("sit-observe"));
  assert.ok([...poses].some((pose) => pose.startsWith("walk-")));
  assert.ok([...poses].some((pose) => pose.startsWith("trot-")));
  assert.ok([...poses].some((pose) => pose.startsWith("gallop-")));
});
