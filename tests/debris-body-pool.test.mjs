import assert from "node:assert/strict";
import test from "node:test";
import {
  remnantBodySpec,
  shardBodySpec,
} from "../games/make-a-mess/src/game/debrisBodyPool.ts";
import {
  DEBRIS_ACTOR_DETAIL,
  DEBRIS_NORMAL,
} from "../games/make-a-mess/src/game/physicsInteractionGroups.ts";
import { materialRuntimeProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

// Дескрипторы обязаны воспроизводить прежние JSX-компоненты Shard/Remnant
// дословно: формулы полуразмеров, плотности, группы, поведение при freed.

const box = (center, size) => ({ center, size, voxelCount: 1 });

function makeShard(overrides = {}) {
  return {
    id: "shard:test",
    material: "brick",
    color: "#a64a2f",
    size: [0.4, 0.3, 0.2],
    position: [0, 1, 0],
    quaternion: [0, 0, 0, 1],
    linearVelocity: [1, 2, 3],
    angularVelocity: [0, 1, 0],
    ...overrides,
  };
}

function makeRemnant(overrides = {}) {
  return {
    id: "remnant:test",
    parentId: "wall:1",
    material: "brick",
    color: "#a64a2f",
    size: [0.8, 0.6, 0.3],
    position: [2, 1, 0],
    quaternion: [0, 0, 0, 1],
    volume: 0.14,
    detached: false,
    ...overrides,
  };
}

test("shard without boxes gets one cuboid matching its size", () => {
  const spec = shardBodySpec(makeShard());
  assert.equal(spec.colliders.length, 1);
  const [collider] = spec.colliders;
  assert.equal(collider.shape, "cuboid");
  assert.deepEqual(collider.args, [0.198, 0.148, 0.098]);
  assert.equal(collider.groups, DEBRIS_NORMAL);
  assert.equal(
    collider.density,
    materialRuntimeProfiles.brick.density,
  );
  assert.equal(collider.friction, 0.78);
});

test("shard with many boxes keeps three largest plus actor detail", () => {
  const boxes = [
    box([0, 0, 0], [0.3, 0.3, 0.3]),
    box([0.3, 0, 0], [0.25, 0.25, 0.25]),
    box([0, 0.3, 0], [0.2, 0.2, 0.2]),
    box([0, 0, 0.3], [0.1, 0.1, 0.1]),
    box([0.3, 0.3, 0], [0.05, 0.05, 0.05]),
  ];
  const spec = shardBodySpec(makeShard({ boxes, size: [0.6, 0.6, 0.6] }));
  const primaries = spec.colliders.filter(
    (collider) => collider.groups === DEBRIS_NORMAL,
  );
  const details = spec.colliders.filter(
    (collider) => collider.groups === DEBRIS_ACTOR_DETAIL,
  );
  assert.equal(primaries.length, 3);
  assert.equal(details.length, 2);
  for (const detail of details) {
    assert.equal(detail.density, 0);
    assert.equal(detail.friction, 0.76);
    assert.equal(detail.restitution, 0);
  }
});

test("ground shard carries no actor-detail colliders", () => {
  const boxes = [
    box([0, 0, 0], [0.3, 0.3, 0.3]),
    box([0.3, 0, 0], [0.25, 0.25, 0.25]),
    box([0, 0.3, 0], [0.2, 0.2, 0.2]),
    box([0, 0, 0.3], [0.1, 0.1, 0.1]),
  ];
  const spec = shardBodySpec(
    makeShard({ material: "soil", boxes, size: [0.6, 0.6, 0.6] }),
  );
  assert.equal(
    spec.colliders.filter(
      (collider) => collider.groups === DEBRIS_ACTOR_DETAIL,
    ).length,
    0,
  );
});

test("sphere and cylinder shards use round colliders", () => {
  const sphere = shardBodySpec(
    makeShard({ shape: "sphere", size: [0.3, 0.4, 0.5] }),
  );
  assert.equal(sphere.colliders[0].shape, "ball");
  assert.deepEqual(sphere.colliders[0].args, [0.148]);

  const cylinder = shardBodySpec(
    makeShard({ shape: "cylinder", size: [0.4, 0.6, 0.4] }),
  );
  assert.equal(cylinder.colliders[0].shape, "cylinder");
  assert.deepEqual(cylinder.colliders[0].args, [0.298, 0.198]);
});

test("тонкая оболочка сталкивается своей толщиной, а весит столько же", () => {
  // Прежде volumeScale уходил В ПЛОТНОСТЬ: масса выходила верной, но коллайдер
  // оставался размером с клетку решётки — обшивка в сантиметр встречала мир на
  // десяток сантиметров раньше собственной поверхности. Теперь ужимается
  // ОБЪЁМ, а плотность остаётся материалом, и произведение то же самое.
  const scale = 0.25;
  const plain = shardBodySpec(makeShard());
  const shell = shardBodySpec(
    makeShard({
      voxelBody: {
        size: [0.4, 0.3, 0.2],
        dimensions: [1, 1, 1],
        cellSize: [0.4, 0.3, 0.2],
        occupied: new Uint8Array([1]),
        volumeScale: scale,
      },
    }),
  );
  assert.equal(
    shell.colliders[0].density,
    materialRuntimeProfiles.brick.density,
    "плотность оболочки — это плотность её материала",
  );

  // Масса сходится с точностью до двухмиллиметровой утяжки коллайдера, которая
  // была тут и раньше: у тонкой плиты она забирает заметную долю толщины.
  const halfVolume = (collider) =>
    collider.args[0] * collider.args[1] * collider.args[2];
  const shellMass = halfVolume(shell.colliders[0]) * shell.colliders[0].density;
  const previousMass =
    halfVolume(plain.colliders[0]) * plain.colliders[0].density * scale;
  assert.ok(
    Math.abs(shellMass - previousMass) < previousMass * 0.08,
    `масса ушла: ${shellMass} против ${previousMass}`,
  );
  // Сжимается самая тонкая ось, остальные держат пятно контакта.
  assert.equal(shell.colliders[0].args[0], plain.colliders[0].args[0]);
  assert.equal(shell.colliders[0].args[1], plain.colliders[0].args[1]);
  assert.ok(shell.colliders[0].args[2] < plain.colliders[0].args[2]);
});

test("attached remnant keeps default groups and up to eight colliders", () => {
  const boxes = Array.from({ length: 10 }, (_, index) =>
    box([index * 0.1, 0, 0], [0.2 - index * 0.01, 0.2, 0.2]));
  const attached = remnantBodySpec(
    makeRemnant({ boxes, size: [1.2, 0.4, 0.4] }),
    false,
  );
  const primaries = attached.colliders.filter(
    (collider) => collider.groups === null,
  );
  assert.equal(primaries.length, 8);
  assert.equal(attached.hardCcd, false);
  assert.equal(attached.softCcdPrediction, 0);
  assert.equal(primaries[0].friction, 0.82);
});

test("freeing a remnant tightens colliders and arms ccd tuning", () => {
  const boxes = Array.from({ length: 10 }, (_, index) =>
    box([index * 0.1, 0, 0], [0.2 - index * 0.01, 0.2, 0.2]));
  const remnant = makeRemnant({ boxes, size: [1.2, 0.4, 0.4] });
  const freed = remnantBodySpec(remnant, true);
  const primaries = freed.colliders.filter(
    (collider) => collider.groups === DEBRIS_NORMAL,
  );
  assert.equal(primaries.length, 3);
  assert.ok(freed.softCcdPrediction > 0 || freed.hardCcd);
});

test("chunky flag follows the volume threshold", () => {
  assert.equal(shardBodySpec(makeShard({ size: [0.2, 0.2, 0.2] })).chunky, false);
  assert.equal(shardBodySpec(makeShard({ size: [0.3, 0.3, 0.3] })).chunky, true);
});
