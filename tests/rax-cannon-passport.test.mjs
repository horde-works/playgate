import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import { ductHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts";
import { combatHexacopterRangeBlueprint } from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
  ductHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import { solveSteelPenetration } from "../games/make-a-mess/src/game/ballisticPenetration.ts";
import { resolveVehicleWeaponShot } from "../games/make-a-mess/src/game/vehicleGunnery.ts";

/**
 * Независимо восстанавливает наименьший реальный разнос вершин замкнутой
 * пластины. Конструктор `steelPlate` и его толщина сюда намеренно не импортированы.
 */
function recoveredPlateThickness(part) {
  assert.equal(part.kind, "mesh");
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < part.vertices.length; left += 1) {
    for (let right = 0; right < left; right += 1) {
      const distance = Math.hypot(
        part.vertices[left][0] - part.vertices[right][0],
        part.vertices[left][1] - part.vertices[right][1],
        part.vertices[left][2] - part.vertices[right][2],
      );
      if (distance > 1e-6) minimum = Math.min(minimum, distance);
    }
  }
  return minimum;
}

function thicknesses(pattern) {
  const plates = ductHexacopterObject.parts.filter(
    (part) => part.kind === "mesh" && pattern.test(part.id),
  );
  assert.ok(plates.length > 0, `не найдены пластины ${pattern}`);
  return plates.map(recoveredPlateThickness);
}

const normalImpact = (plateThickness) => ({
  plateThickness,
  direction: [0, 0, 1],
  normal: [0, 0, 1],
});

test("RAX получил отдельный бронебойный боеприпас, VX — нет", () => {
  const rax = combatHexacopterRangeBlueprint.armament.cannon.projectile;
  const vx = ductHexacopterRangeBlueprint.armament.cannon.projectile;

  assert.equal(rax.kind, "armourPiercing");
  assert.ok(rax.steelPenetration.steelThicknessAtNormal > 0);
  assert.equal(vx.kind, "machineGun");
  assert.equal(vx.steelPenetration.steelThicknessAtNormal, 0);
});

test("профиль снаряда доезжает с мировым выстрелом до общего рантайма", () => {
  const armament = combatHexacopterRangeBlueprint.armament;
  const resolved = resolveVehicleWeaponShot(
    { weapon: "cannon", mountIndex: 0, deflection: 0, serial: 0 },
    armament,
    {
      centre: [0, 20, 0],
      massCentre: [0, 0, 0],
      velocity: [1, 2, 3],
      gunAxis: [0, 0, 1],
      rotate: (local) => local,
    },
  );

  assert.deepEqual(resolved.cannonProjectile, armament.cannon.projectile);
});

test("компилятор не подменяет броню толщиной воксельной сетки", () => {
  const compilation = compileSceneGroups(
    ductHexacopterRangePadDocument,
    new Map(),
  );
  const vehicle = compilation.clusters.find(
    (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
  );
  assert.ok(vehicle);
  const skin = vehicle.pieces.find((piece) =>
    piece.id.includes(":hull-chine-band-0:"),
  );
  const ring = vehicle.pieces.find((piece) =>
    piece.id.includes(":core-duct-front-left-ring-plate-0:"),
  );
  assert.ok(skin && ring);
  assert.ok(Math.abs(skin.plateThickness - 0.04) < 1e-9);
  assert.ok(Math.abs(ring.plateThickness - 0.11) < 1e-9);
  assert.notEqual(
    skin.plateThickness,
    skin.voxelization?.thickness,
    "броня снова стала технической толщиной разрушения",
  );
});

test("предел RAX вскрывает наружные листы VX, но не силовые тоннели", () => {
  const capability =
    combatHexacopterRangeBlueprint.armament.cannon.projectile.steelPenetration;
  const outerSkin = [
    ...thicknesses(/^hull-chine-band-/),
    ...thicknesses(/^hull-dorsal-panel-/),
  ];
  const forceContour = [
    ...thicknesses(/^core-duct-.*ring-plate-/),
    ...thicknesses(/^core-yaw-.*shell-plate-/),
  ];

  assert.ok(
    outerSkin.every((plateThickness) =>
      solveSteelPenetration(capability, normalImpact(plateThickness)).penetrates
    ),
    `не вся наружная броня вскрывается: ${outerSkin.map((v) => v.toFixed(3))}`,
  );
  assert.ok(
    forceContour.every((plateThickness) =>
      !solveSteelPenetration(capability, normalImpact(plateThickness)).penetrates
    ),
    `силовой контур оказался пробит: ${forceContour.map((v) => v.toFixed(3))}`,
  );
});

test("даже наружный 50-мм лист требует выгодного ракурса", () => {
  const capability =
    combatHexacopterRangeBlueprint.armament.cannon.projectile.steelPenetration;
  const squareHit = solveSteelPenetration(capability, {
    plateThickness: 0.05,
    direction: [0, 0, 1],
    normal: [0, 0, 1],
  });
  const obliqueHit = solveSteelPenetration(capability, {
    plateThickness: 0.05,
    direction: [Math.SQRT1_2, 0, Math.SQRT1_2],
    normal: [0, 0, 1],
  });

  assert.equal(squareHit.penetrates, true);
  assert.equal(obliqueHit.penetrates, false);
});
