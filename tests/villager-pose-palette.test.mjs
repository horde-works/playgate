import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Matrix4, Vector3 } from "three";
import {
  createVillagerPosePalette,
  villagerFootSoleY,
  VILLAGER_RENDER_BONE_INDEX,
  VILLAGER_RENDER_BONES,
  writeVillagerPose,
} from "../games/make-a-mess/src/game/villagerPosePalette.ts";

const BASE = {
  phase: Math.PI / 2,
  speed: 0.72,
  strideLength: 0.54,
  build: 1,
  female: false,
  climbKind: 0,
  climbProgress: 0,
  restY: 0,
  atTable: false,
  carryRaw: 0,
  handKind: 0,
  startle: 0,
  startleProgress: 0,
  attention: 0,
};

function matrixAt(palette, instance, bone) {
  const offset =
    (instance * VILLAGER_RENDER_BONES.length + VILLAGER_RENDER_BONE_INDEX[bone]) * 16;
  return new Matrix4().fromArray(palette.data, offset);
}

test("the crowd palette stores one final matrix per canonical bone", () => {
  const palette = createVillagerPosePalette(3);
  assert.equal(palette.texture.image.width, VILLAGER_RENDER_BONES.length * 4);
  assert.equal(palette.texture.image.height, 3);
  writeVillagerPose(palette, 1, BASE);
  const written = palette.data.slice(
    VILLAGER_RENDER_BONES.length * 16,
    VILLAGER_RENDER_BONES.length * 16 * 2,
  );
  assert.ok(written.every(Number.isFinite));
  assert.ok(Math.abs(matrixAt(palette, 1, "chest").determinant() - 1) < 1e-5);
  palette.texture.dispose();
});

test("walk opposition reaches the render bones without another gait solver", () => {
  const palette = createVillagerPosePalette(1);
  writeVillagerPose(palette, 0, BASE);
  assert.notDeepEqual(
    matrixAt(palette, 0, "leftThigh").elements,
    matrixAt(palette, 0, "rightThigh").elements,
  );
  assert.equal(matrixAt(palette, 0, "toolAttachment").determinant(), 0);
  palette.texture.dispose();
});

test("tools and carried objects are attachments of the same pose", () => {
  const palette = createVillagerPosePalette(1);
  writeVillagerPose(palette, 0, {
    ...BASE,
    speed: 0,
    climbKind: 13,
    climbProgress: 0.35,
    handKind: 5,
  });
  assert.notEqual(matrixAt(palette, 0, "toolAttachment").determinant(), 0);
  assert.equal(matrixAt(palette, 0, "spadeAttachment").determinant(), 0);
  palette.texture.dispose();
});

test("the wider carried box stays centred exactly between both wrists", () => {
  const palette = createVillagerPosePalette(1);
  writeVillagerPose(palette, 0, { ...BASE, carryRaw: 1, handKind: 3 });
  const leftWrist = new Vector3(-0.255, 0.86, 0.01).applyMatrix4(
    matrixAt(palette, 0, "leftForearm"),
  );
  const rightWrist = new Vector3(0.255, 0.86, 0.01).applyMatrix4(
    matrixAt(palette, 0, "rightForearm"),
  );
  const midpoint = leftWrist.clone().add(rightWrist).multiplyScalar(0.5);
  const carried = matrixAt(palette, 0, "carriedAttachment");
  const boxCenter = new Vector3(0, 1.22, 0.41).applyMatrix4(carried);
  assert.ok(Math.abs(boxCenter.x - midpoint.x) < 1e-5);
  assert.ok(Math.abs(boxCenter.z - midpoint.z) < 1e-5);
  assert.ok(Math.abs(boxCenter.y - midpoint.y) < 1e-5);
  const leftEdge = new Vector3(-0.18, 1.22, 0.41).applyMatrix4(carried);
  const rightEdge = new Vector3(0.18, 1.22, 0.41).applyMatrix4(carried);
  assert.ok(rightEdge.x - leftEdge.x > 0.6);
  palette.texture.dispose();
});

test("no boot crosses the local ground plane in any accepted action phase", () => {
  const palette = createVillagerPosePalette(1);
  for (let kind = 0; kind <= 15; kind += 1) {
    for (let sample = 0; sample <= 40; sample += 1) {
      writeVillagerPose(palette, 0, {
        ...BASE,
        speed: kind === 0 ? 0.85 : 0,
        phase: (sample / 40) * Math.PI * 2,
        climbKind: kind,
        climbProgress: sample / 40,
      });
      assert.ok(
        villagerFootSoleY(matrixAt(palette, 0, "leftFoot"), -1) >= -1e-5,
        `left boot penetrated ground in action ${kind} at ${sample}/40`,
      );
      assert.ok(
        villagerFootSoleY(matrixAt(palette, 0, "rightFoot"), 1) >= -1e-5,
        `right boot penetrated ground in action ${kind} at ${sample}/40`,
      );
    }
  }
  palette.texture.dispose();
});

test("the village renderer has one skeletal path and no action proxy attributes", () => {
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/Villagers.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /uniform highp sampler2D uVillagerPose/);
  assert.match(source, /writeVillagerPose\(posePalette/);
  assert.doesNotMatch(source, /aGait|aPivotA|aPivotB/);
  assert.equal((source.match(/<instancedMesh/g) ?? []).length, 1);
});
