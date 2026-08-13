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

  for (let tick = 0; tick < 600; tick += 1) {
    stepMediumPanther(runtime, vikingVillagePantherProfile, 1 / 30, null);
    writeMediumPantherPose(
      palette,
      sampleMediumPantherPose(runtime),
      runtime,
      tick / 30,
      contactState,
    );
    let minimumY = Infinity;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(palette[bone.getX(index)]);
      minimumY = Math.min(minimumY, vertex.y + runtime.airHeight);
    }
    if (minimumY < worst) {
      worst = minimumY;
      worstMode = runtime.mode;
    }
  }

  assert.ok(worst >= -0.012, `${worstMode}: runtime geometry enters ground by ${(-worst).toFixed(4)} m`);
  geometry.dispose();
});

test("gait duty factors preserve feline support order without unreachable atlas-long contacts", () => {
  const expectedSupportCounts = {
    walk: new Set([2, 3]),
    trot: new Set([0, 2]),
    gallop: new Set([0, 1]),
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

test("planted panther paws stay in world contact while the body advances and turns", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const runtime = createMediumPantherRuntime(vikingVillagePantherProfile);
  const palette = createMediumPantherPosePalette();
  const contactState = createMediumPantherContactState();
  const previous = new Map();
  const stanceSpeeds = { walk: [], trot: [], gallop: [] };
  const dt = 1 / 60;

  for (let tick = 0; tick < 3000; tick += 1) {
    stepMediumPanther(runtime, vikingVillagePantherProfile, dt, field);
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
  ]));
  assert.ok(maximumSpeed > 4.7, `maximum speed ${maximumSpeed}`);
  assert.ok(maximumAir > 0.58, `maximum bound ${maximumAir}`);
  assert.ok(runtime.travelled > 70, `travelled only ${runtime.travelled}`);
  assert.ok(turns > 100, `route was too straight: ${turns} turning samples`);
  assert.ok(poses.has("stand-observe"));
  assert.ok(poses.has("jump-flight"));
  assert.ok([...poses].some((pose) => pose.startsWith("walk-")));
  assert.ok([...poses].some((pose) => pose.startsWith("trot-")));
  assert.ok([...poses].some((pose) => pose.startsWith("gallop-")));
});
