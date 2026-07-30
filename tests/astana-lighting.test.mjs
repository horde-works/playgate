import assert from "node:assert/strict";
import test from "node:test";

import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
  ASTANA_LANDMARK_MIN_LIGHT_DISTANCE,
} from "../games/make-a-mess/src/content/scenes/astana/astanaLighting.ts";
import { astanaScene } from
  "../games/make-a-mess/src/game/astanaScene.ts";
import { selectGroupedLampCandidates } from
  "../games/make-a-mess/src/game/lampPoolSelection.ts";

const landmarkGroups = {
  baiterek: (id) => id.includes("baiterek:"),
  khanShatyr: (id) => id.includes(":khan:"),
  pyramid: (id) => id.includes(":pyramid-interior:")
    || id.includes(":pyramid-entrances:"),
  nurAlem: (id) => id.includes(":nur-alem-lighting:"),
  opera: (id) => id.includes(":opera-lighting:"),
  arch: (id) => id.includes(":triumphal-arch-lighting:"),
  atyrau: (id) => id.includes(":atyrau:lighting:hidden-fixture:"),
};

test("Astana landmarks retain illumination at least as far as Khan Shatyr", () => {
  for (const [name, belongsToGroup] of Object.entries(landmarkGroups)) {
    const lamps = astanaScene.lampDefinitions.filter((lamp) => belongsToGroup(lamp.id));
    assert.ok(lamps.length > 0, `${name}: архитектурный свет исчез из сцены`);
    assert.ok(lamps.every((lamp) =>
      (lamp.poolPriority ?? 0) >= ASTANA_LANDMARK_LIGHT_PRIORITY),
    `${name}: свет уступает локальным фонарям слишком рано`);
    assert.ok(lamps.every((lamp) =>
      (lamp.localPoolCapacity ?? 0) >= 10),
    `${name}: ближайшая группа гасит остальное ночное освещение города`);
  }
});

test("compact landmarks cast across their whole silhouette from a distant view", () => {
  const compact = astanaScene.lampDefinitions.filter((lamp) =>
    landmarkGroups.baiterek(lamp.id)
      || landmarkGroups.khanShatyr(lamp.id)
      || landmarkGroups.pyramid(lamp.id)
      || landmarkGroups.nurAlem(lamp.id)
      || landmarkGroups.opera(lamp.id)
      || landmarkGroups.arch(lamp.id));
  assert.ok(compact.every((lamp) =>
    (lamp.distance ?? 0) >= ASTANA_LANDMARK_MIN_LIGHT_DISTANCE));
  assert.equal(ASTANA_LANDMARK_LOCAL_POOL_CAPACITY, 12);
});

test("every landmark keeps a real light source in the aerial city view", () => {
  const camera = [0, 95, 0];
  const candidates = astanaScene.lampDefinitions
    .map((lamp) => {
      const dx = lamp.position[0] - camera[0];
      const dy = lamp.position[1] - camera[1];
      const dz = lamp.position[2] - camera[2];
      const distanceSq = dx * dx + dy * dy + dz * dz;
      return {
        lamp,
        rank: distanceSq / Math.max(1, lamp.poolPriority ?? 1),
      };
    })
    .sort((left, right) => left.rank - right.rank);
  const selected = selectGroupedLampCandidates(candidates, 16);

  for (const [name, belongsToGroup] of Object.entries(landmarkGroups)) {
    assert.ok(selected.some(({ lamp }) => belongsToGroup(lamp.id)),
      `${name}: объект полностью гаснет в дальнем облёте`);
  }
});
