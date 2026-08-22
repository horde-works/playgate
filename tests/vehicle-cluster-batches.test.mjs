/**
 * ПОДВИЖНЫЙ БАТЧ НОСИТЕЛЯ: ГЕЙТЫ ПАСПОРТА docs/carrier-batched-render.md.
 *
 * Проверяется чистый модуль на настоящей сцене аэропорта: принадлежность
 * кусков, паритет вынесенного сплита со старым законом, закон позы против
 * ручной математики, гейт по позе, радиус сферы носителя и число батчей.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { islandAirportCompilation } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import {
  isVehicleFramePiece,
  vehicleFrames,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { compoundMemberNeedsIndividualBody } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import { buildIntactMaterialBatches } from "../games/make-a-mess/src/game/intactWorldBatching.ts";
import {
  carrierBatchEligible,
  carrierClusterRadius,
  carrierPoseAdvanced,
  splitBreakableRenderPieces,
  writeCarrierMemberMatrix,
} from "../games/make-a-mess/src/game/vehicleClusterBatches.ts";

const scene = islandAirportCompilation.scene;
const pieces = scene.breakablePieces;
const dc3Definition = vehicleFrames.find(
  (frame) => frame.clusterId === "island-airport:dc3",
);
assert.ok(dc3Definition, "в реестре кадров нет DC-3 аэропорта");
const NO_MUTABLE = new Set();

const definitionByCluster = new Map([[dc3Definition.clusterId, dc3Definition]]);
const eligible = pieces.filter((piece) =>
  carrierBatchEligible(
    piece,
    definitionByCluster.get(piece.clusterId),
    NO_MUTABLE,
  ),
);

test("принадлежность: корпус в батче, механизмы — нет", () => {
  assert.ok(
    eligible.length >= 600,
    `в батч попало подозрительно мало кусков: ${eligible.length}`,
  );
  for (const piece of eligible) {
    assert.equal(piece.clusterId, "island-airport:dc3");
    assert.ok(!piece.hinge, `петля в батче: ${piece.id}`);
    assert.ok(piece.intactCollisionRole !== "actor-only", piece.id);
    assert.ok(piece.shape !== "cinderBlock", piece.id);
    assert.ok(
      !compoundMemberNeedsIndividualBody(dc3Definition, piece, false),
      `кусок с собственным телом позы в батче: ${piece.id}`,
    );
  }
  // Створки входов — петли, они обязаны остаться в динамике.
  const doors = pieces.filter((piece) => piece.hinge);
  assert.ok(doors.length > 0, "у DC-3 пропали створки");
  for (const door of doors) {
    assert.ok(!eligible.includes(door), `створка в батче: ${door.id}`);
  }
  // Ливрея — обычный член корпуса, едет в батче.
  const livery = eligible.filter((piece) => piece.id.includes("livery-title"));
  assert.equal(livery.length, 2, "титулы обязаны ехать в батче носителя");
});

test("батчей носителя — единицы, а не сотни; тень ливреи погашена", () => {
  const batches = buildIntactMaterialBatches(eligible);
  assert.ok(
    batches.length <= 20,
    `батчей носителя ${batches.length} — перепись обещала ~15`,
  );
  const liveryBatch = batches.find(
    (batch) => batch.textureProfile === "dc3-livery-titles",
  );
  assert.ok(liveryBatch, "ливрея потеряла свой батч");
  assert.equal(liveryBatch.castShadow, false);
});

test("сплит: точный паритет со старым законом, минус члены носителя", () => {
  const brokenPieces = new Set();
  const shatteredPieces = new Set();
  const definitions = [dc3Definition];
  const split = splitBreakableRenderPieces({
    pieces,
    brokenPieces,
    shatteredPieces,
    kinematicClusterDefinitions: definitions,
    mutablePieceIds: NO_MUTABLE,
    presentBrokenPiece: (piece) => piece,
    memberNeedsIndividualBody: compoundMemberNeedsIndividualBody,
  });

  // Старый закон, воспроизведённый в лоб.
  const oldHidden = new Set();
  const oldDynamic = [];
  const oldBodies = [];
  for (const piece of pieces) {
    const compoundDefinition = definitionByCluster.get(piece.clusterId);
    if (
      brokenPieces.has(piece.id) ||
      piece.hinge ||
      piece.intactCollisionRole === "actor-only" ||
      isVehicleFramePiece(piece) ||
      compoundDefinition !== undefined ||
      piece.shape === "cinderBlock"
    ) {
      oldHidden.add(piece.id);
      oldDynamic.push(piece);
      if (
        !compoundDefinition ||
        compoundMemberNeedsIndividualBody(compoundDefinition, piece, false)
      ) {
        oldBodies.push(piece);
      }
    }
  }

  assert.deepEqual([...split.hiddenPieceIds].sort(), [...oldHidden].sort());
  assert.deepEqual(
    split.physicalBodyPieces.map((piece) => piece.id).sort(),
    oldBodies.map((piece) => piece.id).sort(),
  );
  const carrierIds = new Set(split.carrierBatchedPieces.map((piece) => piece.id));
  assert.deepEqual(
    split.bodyPieces.map((piece) => piece.id).sort(),
    oldDynamic
      .filter((piece) => !carrierIds.has(piece.id))
      .map((piece) => piece.id)
      .sort(),
  );
  assert.deepEqual(
    split.carrierBatchedPieces.map((piece) => piece.id).sort(),
    eligible.map((piece) => piece.id).sort(),
  );
});

test("сплит: сломанный член носителя уходит в динамику с телом", () => {
  const victim = eligible[0];
  const split = splitBreakableRenderPieces({
    pieces,
    brokenPieces: new Set([victim.id]),
    shatteredPieces: new Set(),
    kinematicClusterDefinitions: [dc3Definition],
    mutablePieceIds: NO_MUTABLE,
    presentBrokenPiece: (piece) => piece,
    memberNeedsIndividualBody: compoundMemberNeedsIndividualBody,
  });
  assert.ok(split.bodyPieces.some((piece) => piece.id === victim.id));
  assert.ok(split.physicalBodyPieces.some((piece) => piece.id === victim.id));
  assert.ok(
    !split.carrierBatchedPieces.some((piece) => piece.id === victim.id),
    "сломанный кусок не может числиться в батче сплита",
  );
});

test("закон позы: на покое тождественен авторской матрице", () => {
  const piece = eligible.find((entry) => entry.visualMesh);
  const target = new Object3D();
  writeCarrierMemberMatrix(
    target,
    piece,
    dc3Definition.origin,
    {
      x: dc3Definition.origin[0],
      y: dc3Definition.origin[1],
      z: dc3Definition.origin[2],
    },
    { x: 0, y: 0, z: 0, w: 1 },
    undefined,
  );
  const rest = new Object3D();
  rest.position.set(...piece.position);
  const rotation = piece.rotation ?? [0, 0, 0];
  rest.rotation.set(rotation[0], rotation[1], rotation[2]);
  rest.scale.set(...piece.size);
  rest.updateMatrix();
  for (let index = 0; index < 16; index += 1) {
    assert.ok(
      Math.abs(target.matrix.elements[index] - rest.matrix.elements[index]) <
        1e-9,
      `элемент ${index}: ${target.matrix.elements[index]} != ${rest.matrix.elements[index]}`,
    );
  }
});

test("закон позы: поворот кластера и слайд артикуляции", () => {
  const piece = eligible[0];
  const clusterQuaternion = new Quaternion().setFromEuler(
    new Euler(0, Math.PI / 2, 0),
  );
  const clusterPosition = { x: 10, y: 5, z: -3 };
  const slide = [0, 0.4, 0];
  const target = new Object3D();
  writeCarrierMemberMatrix(
    target,
    piece,
    dc3Definition.origin,
    clusterPosition,
    clusterQuaternion,
    { steer: 0, spin: 0, slide },
  );
  // Ожидание в лоб: pos = clusterPos + R·(rest − origin + slide).
  const offset = new Vector3(
    piece.position[0] - dc3Definition.origin[0] + slide[0],
    piece.position[1] - dc3Definition.origin[1] + slide[1],
    piece.position[2] - dc3Definition.origin[2] + slide[2],
  ).applyQuaternion(clusterQuaternion);
  assert.ok(
    Math.abs(target.position.x - (clusterPosition.x + offset.x)) < 1e-9 &&
      Math.abs(target.position.y - (clusterPosition.y + offset.y)) < 1e-9 &&
      Math.abs(target.position.z - (clusterPosition.z + offset.z)) < 1e-9,
    "позиция не совпала с ручной математикой",
  );
  const rotation = piece.rotation ?? [0, 0, 0];
  const expectedQuaternion = clusterQuaternion
    .clone()
    .multiply(
      new Quaternion().setFromEuler(
        new Euler(rotation[0], rotation[1], rotation[2]),
      ),
    );
  assert.ok(
    Math.abs(target.quaternion.dot(expectedQuaternion)) > 1 - 1e-9,
    "кватернион не совпал",
  );
});

test("закон позы: спин артикуляции премультиплицирует авторский поворот", () => {
  const piece = eligible[0];
  const target = new Object3D();
  writeCarrierMemberMatrix(
    target,
    piece,
    dc3Definition.origin,
    {
      x: dc3Definition.origin[0],
      y: dc3Definition.origin[1],
      z: dc3Definition.origin[2],
    },
    { x: 0, y: 0, z: 0, w: 1 },
    { steer: 0, spin: Math.PI / 2 },
  );
  const rotation = piece.rotation ?? [0, 0, 0];
  const expected = new Quaternion()
    .setFromEuler(new Euler(0, 0, Math.PI / 2, "YZX"))
    .multiply(
      new Quaternion().setFromEuler(
        new Euler(rotation[0], rotation[1], rotation[2]),
      ),
    );
  assert.ok(
    Math.abs(target.quaternion.dot(expected)) > 1 - 1e-9,
    "спин лёг не тем порядком",
  );
});

test("гейт позы: первый кадр пишет, рябь ниже допуска — нет", () => {
  const cache = new Map();
  const pose = { x: 1, y: 2, z: 3 };
  const quat = { x: 0, y: 0, z: 0, w: 1 };
  assert.equal(carrierPoseAdvanced(cache, "c", pose, quat), true);
  assert.equal(carrierPoseAdvanced(cache, "c", pose, quat), false);
  assert.equal(
    carrierPoseAdvanced(cache, "c", { x: 1 + 1e-7, y: 2, z: 3 }, quat),
    false,
    "рябь тоньше допуска не должна будить батч",
  );
  assert.equal(
    carrierPoseAdvanced(cache, "c", { x: 1.01, y: 2, z: 3 }, quat),
    true,
  );
});

test("радиус носителя покрывает размах и не раздут", () => {
  const radius = carrierClusterRadius(eligible, dc3Definition.origin);
  assert.ok(radius >= 14.4, `радиус ${radius} меньше полуразмаха`);
  assert.ok(radius <= 25, `радиус ${radius} подозрительно раздут`);
});
