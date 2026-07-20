import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "three";

import {
  BLAST_RADIUS,
  GRENADE_DAMAGE_ENERGY,
  ROCKET_BLAST_RADIUS,
  ROCKET_DAMAGE_ENERGY,
  bulletHoleRadius,
  buildShards,
  classifyLandingDamage,
  damageBody,
  damageRadiusScaleByMaterial,
  distanceToOrientedBox,
  fractureEnergyByMaterial,
  grenadeEnergyAtDistance,
  impactDamageRadius,
  rocketEnergyAtDistance,
  trimShardBudget,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  countOccupiedVoxels,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

const still = new Vector3();
const identity = new Quaternion();

test("a blast reaches the end of a long board even when its centre is outside", () => {
  assert.equal(
    distanceToOrientedBox(
      new Vector3(),
      [3, 0, 0],
      [6, 0.2, 0.2],
    ),
    0,
  );
  assert.equal(
    distanceToOrientedBox(
      new Vector3(),
      [0, 0, 2],
      [4, 0.2, 0.2],
      [0, Math.PI / 2, 0],
    ) < 1e-6,
    true,
  );
});

test("a blast cross-cuts a long wooden board around the blast point", () => {
  const shards = buildShards(
    {
      id: "long-board",
      material: "wood",
      color: "#805332",
      size: [4.8, 0.18, 0.42],
    },
    "blast",
    new Vector3(),
    identity,
    still,
    still,
    new Vector3(1.15, 0, 0),
    8.5,
    "blast",
  );

  assert.ok(shards);
  assert.equal(shards.length, 2);
  assert.equal(
    shards.every(
      (shard) =>
        shard.size[0] < 4.8 &&
        shard.size[1] > 0.17 &&
        shard.size[2] > 0.4 &&
        shard.voxelBody,
    ),
    true,
  );
  assert.equal(shards.some((shard) => shard.boxes.length > 1), true);
  assert.equal(
    shards[0].position[0] < 1.15 && shards[1].position[0] > 1.15,
    true,
  );
});

test("a concrete block landing hard splits into heavy chunks, not gravel", () => {
  const shards = buildShards(
    {
      id: "concrete-block",
      material: "concrete",
      color: "#aaa79f",
      size: [0.86, 0.38, 0.42],
    },
    "fall",
    new Vector3(),
    identity,
    still,
    still,
    new Vector3(),
    12.5,
    "fall",
  );

  assert.ok(shards);
  assert.equal(shards.length, 2);
  assert.equal(shards.every((shard) => shard.size[0] >= 0.25), true);
});

test("landing damage follows material speed rather than one force spike", () => {
  assert.equal(classifyLandingDamage("concrete", 3.5, 2), "none");
  assert.equal(classifyLandingDamage("concrete", 7.5, 0.3), "chip");
  assert.equal(classifyLandingDamage("concrete", 12.5, 0.3), "shatter");
  assert.equal(classifyLandingDamage("concrete", 14, 0.05), "none");
  assert.equal(classifyLandingDamage("glass", 4.2, 0.3), "shatter");
  assert.equal(classifyLandingDamage("wood", 3.2, 0.3), "none");
  assert.equal(classifyLandingDamage("wood", 4.2, 0.3), "chip");
  assert.equal(classifyLandingDamage("wood", 7.1, 0.3), "shatter");
  assert.equal(classifyLandingDamage("wood", 7.1, 0.05), "none");
});

test("the same delivered energy follows material strength", () => {
  const damage = (material) =>
    damageBody(
      {
        id: material,
        material,
        color: "#ffffff",
        size: [1.2, 0.8, 0.5],
      },
      {
        position: new Vector3(),
        quaternion: new Quaternion(),
        linearVelocity: new Vector3(),
        angularVelocity: new Vector3(),
      },
      {
        idPrefix: "same-energy",
        worldPoint: new Vector3(),
        radius: 0.22,
        burstSpeed: 0,
      },
    );
  const glass = damage("glass");
  const plaster = damage("plaster");
  const wood = damage("wood");
  const brick = damage("brick");
  const concrete = damage("concrete");
  const stone = damage("stone");
  const steel = damage("steel");

  assert.ok(glass);
  assert.ok(plaster);
  assert.ok(wood);
  assert.ok(brick);
  assert.ok(concrete);
  assert.ok(stone);
  assert.equal(steel, null);
  assert.equal(glass.removedVolume > plaster.removedVolume, true);
  assert.equal(plaster.removedVolume > wood.removedVolume, true);
  assert.equal(wood.removedVolume > brick.removedVolume, true);
  assert.equal(brick.removedVolume > concrete.removedVolume, true);
  assert.equal(concrete.removedVolume > stone.removedVolume, true);
});

test("material resistance is the single source of radial damage scaling", () => {
  const ordered = [
    "glass",
    "plaster",
    "wood",
    "soil",
    "earth",
    "brick",
    "asphalt",
    "concrete",
    "stone",
    "steel",
  ];

  for (let index = 1; index < ordered.length; index += 1) {
    const weaker = ordered[index - 1];
    const stronger = ordered[index];
    assert.equal(
      fractureEnergyByMaterial[weaker] <
        fractureEnergyByMaterial[stronger],
      true,
    );
    assert.equal(
      damageRadiusScaleByMaterial[weaker] >
        damageRadiusScaleByMaterial[stronger],
      true,
    );
  }
});

test("grenade energy falls with distance and ends at its physical radius", () => {
  assert.equal(grenadeEnergyAtDistance(0), GRENADE_DAMAGE_ENERGY);
  assert.equal(
    grenadeEnergyAtDistance(0.5) > grenadeEnergyAtDistance(1.5),
    true,
  );
  assert.equal(
    grenadeEnergyAtDistance(1.5) > grenadeEnergyAtDistance(2.5),
    true,
  );
  assert.equal(grenadeEnergyAtDistance(BLAST_RADIUS), 0);
  assert.equal(grenadeEnergyAtDistance(BLAST_RADIUS + 1), 0);
});

test("rocket blast is twenty-five times the grenade profile by volume and energy", () => {
  assert.equal(ROCKET_DAMAGE_ENERGY, GRENADE_DAMAGE_ENERGY * 25);
  assert.equal(
    Math.round((ROCKET_BLAST_RADIUS / BLAST_RADIUS) ** 3 * 1000) / 1000,
    25,
  );
  assert.equal(rocketEnergyAtDistance(0), ROCKET_DAMAGE_ENERGY);
  assert.equal(rocketEnergyAtDistance(BLAST_RADIUS) > 0, true);
  assert.equal(rocketEnergyAtDistance(ROCKET_BLAST_RADIUS), 0);
});

test("a full grenade cuts concrete but removes more of weaker materials", () => {
  const blastBeam = (material) =>
    buildShards(
      {
        id: `${material}-beam`,
        material,
        color: "#ffffff",
        size: [4.8, 0.4, 0.8],
      },
      `${material}-blast`,
      new Vector3(),
      identity,
      still,
      still,
      new Vector3(1.15, 0, 0),
      GRENADE_DAMAGE_ENERGY,
      "blast",
    );
  const glass = blastBeam("glass");
  const wood = blastBeam("wood");
  const concrete = blastBeam("concrete");

  assert.ok(glass);
  assert.ok(wood);
  assert.ok(concrete);
  assert.equal(wood.length >= 2, true);
  assert.equal(concrete.length >= 2, true);
  const originalVolume = 4.8 * 0.4 * 0.8;
  const removedVolume = (shards) =>
    originalVolume -
    shards.reduce((total, shard) => total + shard.volume, 0);
  const glassRemoved = removedVolume(glass);
  const woodRemoved = removedVolume(wood);
  const concreteRemoved = removedVolume(concrete);

  assert.equal(concreteRemoved / originalVolume > 0.18, true);
  assert.equal(glassRemoved > woodRemoved, true);
  assert.equal(woodRemoved > concreteRemoved, true);
});

test("the same grenade crater applies to attached and fallen concrete", () => {
  const source = {
    id: "concrete-grenade-target",
    material: "concrete",
    color: "#a9a59c",
    size: [1.2, 0.8, 0.5],
  };
  const radius = impactDamageRadius(
    source,
    "blast",
    grenadeEnergyAtDistance(0.5),
  );
  const localImpact = new Vector3(0, 0, source.size[2] / 2);
  const attached = damageBody(
    source,
    {
      position: new Vector3(),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "grenade-concrete",
      worldPoint: localImpact,
      radius,
      burstSpeed: GRENADE_DAMAGE_ENERGY,
    },
  );
  const fallenRotation = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    Math.PI / 2,
  );
  const fallenPosition = new Vector3(4, 0.6, -3);
  const fallen = damageBody(
    source,
    {
      position: fallenPosition,
      quaternion: fallenRotation,
      linearVelocity: new Vector3(0.5, 0, -0.4),
      angularVelocity: new Vector3(0.2, 0.1, 0.4),
    },
    {
      idPrefix: "grenade-concrete",
      worldPoint: localImpact
        .clone()
        .applyQuaternion(fallenRotation)
        .add(fallenPosition),
      radius,
      burstSpeed: GRENADE_DAMAGE_ENERGY,
    },
  );

  assert.ok(attached);
  assert.ok(fallen);
  assert.equal(attached.removedVolume > 0.12, true);
  assert.equal(fallen.removedVolume, attached.removedVolume);
  assert.deepEqual(
    fallen.fragments.map((fragment) => [...fragment.voxelBody.occupied]),
    attached.fragments.map((fragment) => [...fragment.voxelBody.occupied]),
  );
});

test("machine-gun damage is directional and keeps material ordering", () => {
  const bullet = (material, state, worldPoint, direction) =>
    damageBody(
      {
        id: `${material}-board`,
        material,
        color: "#ffffff",
        size: [2.4, 0.36, 0.42],
      },
      state,
      {
        idPrefix: "machine-gun",
        worldPoint,
        radius: bulletHoleRadius[material],
        burstSpeed: 1.4,
        direction,
        penetration: 0.85,
      },
    );
  const attachedState = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    linearVelocity: new Vector3(),
    angularVelocity: new Vector3(),
  };
  const localHit = new Vector3(0, 0, 0.21);
  const localDirection = new Vector3(0, 0, -1);
  const glass = bullet(
    "glass",
    attachedState,
    localHit,
    localDirection,
  );
  const wood = bullet(
    "wood",
    attachedState,
    localHit,
    localDirection,
  );
  const concrete = bullet(
    "concrete",
    attachedState,
    localHit,
    localDirection,
  );

  assert.ok(glass);
  assert.ok(wood);
  assert.ok(concrete);
  assert.equal(glass.fragments.length, 2);
  assert.equal(wood.fragments.length, 2);
  assert.equal(concrete.fragments.length, 1);
  assert.equal(glass.removedVolume > wood.removedVolume, true);
  assert.equal(wood.removedVolume > concrete.removedVolume, true);

  const movingRotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 2,
  );
  const movingPosition = new Vector3(4, 2, -3);
  const movingWood = bullet(
    "wood",
    {
      position: movingPosition,
      quaternion: movingRotation,
      linearVelocity: new Vector3(3, -1, 2),
      angularVelocity: new Vector3(1, 2, 3),
    },
    localHit
      .clone()
      .applyQuaternion(movingRotation)
      .add(movingPosition),
    localDirection.clone().applyQuaternion(movingRotation),
  );

  assert.ok(movingWood);
  assert.equal(movingWood.removedVolume, wood.removedVolume);
  assert.deepEqual(
    movingWood.fragments.map((fragment) => [
      fragment.size,
      [...fragment.voxelBody.occupied],
    ]),
    wood.fragments.map((fragment) => [
      fragment.size,
      [...fragment.voxelBody.occupied],
    ]),
  );

  const fallenBoard = wood.fragments[0];
  const fallenState = {
    position: new Vector3(...fallenBoard.position),
    quaternion: new Quaternion(...fallenBoard.quaternion),
    linearVelocity: new Vector3(...fallenBoard.linearVelocity),
    angularVelocity: new Vector3(...fallenBoard.angularVelocity),
  };
  const secondBullet = damageBody(
    fallenBoard,
    fallenState,
    {
      idPrefix: "machine-gun-repeat",
      worldPoint: new Vector3(
        0,
        0,
        fallenBoard.size[2] / 2,
      )
        .applyQuaternion(fallenState.quaternion)
        .add(fallenState.position),
      radius: bulletHoleRadius.wood,
      burstSpeed: 1.4,
      direction: new Vector3(0, 0, -1).applyQuaternion(
        fallenState.quaternion,
      ),
      penetration: 0.85,
    },
  );

  assert.ok(secondBullet);
  assert.equal(secondBullet.fragments.length, 2);
  assert.equal(secondBullet.removedVolume > 0, true);
});

test("attached and moving bodies use identical voxel damage", () => {
  const source = {
    id: "same-body",
    material: "brick",
    color: "#a64a2f",
    size: [1.8, 0.72, 0.42],
  };
  const localHit = new Vector3(0.18, 0.05, 0);
  const movingRotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 3,
  );
  const movingPosition = new Vector3(7, 3, -4);
  const attached = damageBody(
    source,
    {
      position: new Vector3(),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "unified",
      worldPoint: localHit,
      radius: 0.3,
      burstSpeed: 0,
    },
  );
  const moving = damageBody(
    source,
    {
      position: movingPosition,
      quaternion: movingRotation,
      linearVelocity: new Vector3(4, -2, 1),
      angularVelocity: new Vector3(1, 2, 3),
    },
    {
      idPrefix: "unified",
      worldPoint: localHit
        .clone()
        .applyQuaternion(movingRotation)
        .add(movingPosition),
      radius: 0.3,
      burstSpeed: 0,
    },
  );

  assert.ok(attached);
  assert.ok(moving);
  assert.equal(attached.removedVolume, moving.removedVolume);
  assert.deepEqual(
    attached.fragments.map((fragment) => ({
      size: fragment.size,
      occupied: [...fragment.voxelBody.occupied],
      boxes: fragment.boxes,
    })),
    moving.fragments.map((fragment) => ({
      size: fragment.size,
      occupied: [...fragment.voxelBody.occupied],
      boxes: fragment.boxes,
    })),
  );
});

test("a damaged moving fragment can be damaged again", () => {
  const source = {
    id: "repeat-body",
    material: "wood",
    color: "#805332",
    size: [2.4, 0.36, 0.36],
  };
  const state = {
    position: new Vector3(),
    quaternion: new Quaternion(),
    linearVelocity: new Vector3(),
    angularVelocity: new Vector3(),
  };
  const first = damageBody(source, state, {
    idPrefix: "first",
    worldPoint: new Vector3(-0.35, 0, 0),
    radius: 0.16,
    burstSpeed: 1,
  });

  assert.ok(first);
  const fragment = first.fragments[0];
  assert.ok(fragment?.voxelBody);
  const before = countOccupiedVoxels(fragment.voxelBody);
  const second = damageBody(
    fragment,
    {
      position: new Vector3(...fragment.position),
      quaternion: new Quaternion(...fragment.quaternion),
      linearVelocity: new Vector3(...fragment.linearVelocity),
      angularVelocity: new Vector3(...fragment.angularVelocity),
    },
    {
      idPrefix: "second",
      worldPoint: new Vector3(...fragment.position),
      radius: 0.14,
      burstSpeed: 1,
    },
  );

  assert.ok(second);
  assert.equal(second.removedVolume > 0, true);
  assert.equal(
    second.fragments.reduce(
      (total, entry) =>
        total + countOccupiedVoxels(entry.voxelBody),
      0,
    ) < before,
    true,
  );
});

test("fragment cleanup respects both body and compound-collider budgets", () => {
  const makeShard = (id, boxes) => ({
    id,
    material: "brick",
    color: "#a64a2f",
    size: [1, 1, 1],
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    boxes: Array.from({ length: boxes }, () => ({
      center: [0, 0, 0],
      size: [0.1, 0.1, 0.1],
      voxelCount: 1,
    })),
  });
  const trimmed = trimShardBudget(
    [
      makeShard("old-heavy", 8),
      makeShard("middle", 3),
      makeShard("new", 2),
    ],
    3,
    5,
  );

  assert.deepEqual(
    trimmed.map((shard) => shard.id),
    ["middle", "new"],
  );
});
