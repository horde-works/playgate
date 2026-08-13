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
  createMediumPantherPosePalette,
  writeMediumPantherPose,
} from "../games/make-a-mess/src/game/mediumPantherRuntimePose.ts";
import {
  buildObstacleField,
  distanceToBox,
} from "../games/make-a-mess/src/game/villagerNavigation.ts";

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
