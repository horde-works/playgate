import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "three";

import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import {
  compilePieceDamageGeometry,
  damageBody,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  countOccupiedVoxels,
  splitVoxelComponents,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

const skyRamSkin = basaltStrongholdScene.breakablePieces.find((piece) =>
  piece.id === "stronghold:sky-ram:skin:3:0");

test("a custom hull cassette compiles to its curved shell, not its solid AABB", () => {
  assert.ok(skyRamSkin?.visualMesh);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);

  const occupied = countOccupiedVoxels(compiled.body);
  assert.equal(occupied < compiled.body.occupied.length * 0.25, true);
  const center = compiled.body.dimensions.map((side) => Math.floor(side / 2));
  const centerIndex = center[0] + compiled.body.dimensions[0] *
    (center[1] + compiled.body.dimensions[1] * center[2]);
  assert.equal(
    compiled.body.occupied[centerIndex],
    0,
    "the empty volume behind the curved skin must stay empty",
  );
  assert.equal(splitVoxelComponents(compiled.body).length, 1);
});

test("latent shell voxels preserve the authored material volume", () => {
  assert.ok(skyRamSkin?.volume);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);
  const compiledVolume = splitVoxelComponents(compiled.body).reduce(
    (total, component) => total + component.volume,
    0,
  );
  assert.ok(Math.abs(compiledVolume - skyRamSkin.volume) < 1e-9);
  assert.equal(compiled.body.volumeScale < 0.2, true);
});

test("damage carves the custom shell through the existing voxel pipeline", () => {
  assert.ok(skyRamSkin?.visualMesh);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);
  const localHit = skyRamSkin.visualMesh.vertices[4].map(
    (coordinate, axis) => coordinate * skyRamSkin.size[axis],
  );
  const worldHit = localHit.map(
    (coordinate, axis) => coordinate + skyRamSkin.position[axis],
  );
  const result = damageBody(
    { ...skyRamSkin, voxelBody: compiled.body, boxes: compiled.boxes },
    {
      position: new Vector3(...skyRamSkin.position),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "custom-shell",
      worldPoint: new Vector3(...worldHit),
      radius: 0.32,
      burstSpeed: 0,
    },
  );

  assert.ok(result);
  assert.ok(result.removedVolume > 0);
  assert.equal(result.fragments.length, 1);
  assert.ok(result.fragments[0].voxelBody);
  assert.equal(
    result.fragments[0].voxelBody.volumeScale,
    compiled.body.volumeScale,
  );
  assert.equal(
    result.fragments[0].boxes.length > 1,
    true,
    "the damaged cassette must not fall back to one bounding box",
  );
  const remainingVolume = result.fragments.reduce(
    (total, fragment) => total + (fragment.volume ?? 0),
    0,
  );
  assert.equal(remainingVolume + result.removedVolume <= skyRamSkin.volume, true);
  assert.equal(remainingVolume + result.removedVolume > skyRamSkin.volume * 0.98, true);
});

test("an extruded custom profile does not voxelize its rectangular corners", () => {
  const triangle = {
    id: "custom-triangle",
    clusterId: "custom",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0, 0],
    size: [4, 4, 0.12],
    color: "#777777",
    visualProfile: {
      vertices: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]],
    },
  };
  const compiled = compilePieceDamageGeometry(triangle);
  assert.ok(compiled);
  assert.equal(
    countOccupiedVoxels(compiled.body) < compiled.body.occupied.length * 0.7,
    true,
  );
  assert.equal(splitVoxelComponents(compiled.body).length, 1);
  const compiledVolume = splitVoxelComponents(compiled.body).reduce(
    (total, component) => total + component.volume,
    0,
  );
  assert.ok(Math.abs(compiledVolume - 4 * 4 * 0.12) < 1e-9);
});
