import assert from "node:assert/strict";
import test from "node:test";
import {
  massProperties,
  pointEffectiveMass,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  materialRuntimeProfiles,
  structuralMaterialProfiles,
} from "../games/make-a-mess/src/game/destructionScene.ts";
import { fractureEnergyByMaterial } from "../games/make-a-mess/src/game/destructionRuntime.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  HEXACOPTER_DUCTS,
  HEXACOPTER_GEAR_STATIONS,
  HEX_ARM_RADIUS,
  HEX_DISC_Y,
  HEX_FOOT_BOTTOM_Y,
  HEX_LIP_OUTER_RADIUS,
  TOWN_HEXACOPTER_CLUSTER_ID,
  hexacopterPoint,
} from "../games/make-a-mess/src/game/townHexacopter.ts";
import {
  contactEnergyShare,
  contactRestitution,
  resolveVehicleContact,
  vehicleJointCapacity,
} from "../games/make-a-mess/src/game/vehicleContactDamage.ts";

const densityOf = (material) => structuralMaterialProfiles[material].density;
const materialOf = (material) => ({
  restitution: materialRuntimeProfiles[material].restitution,
  fractureEnergy: fractureEnergyByMaterial[material],
});

const ship = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_HEXACOPTER_CLUSTER_ID,
);
const properties = massProperties(ship, densityOf);
const volumeOf = (piece) =>
  piece.volume ?? piece.size[0] * piece.size[1] * piece.size[2];
const bodyOf = (piece) => ({
  pieceId: piece.id,
  material: piece.material,
  volume: volumeOf(piece),
});
const pieceNamed = (needle) => {
  const found = ship.find((piece) => piece.id.includes(needle));
  assert.ok(found, `кусок ${needle} не найден в машине`);
  return found;
};

const GEAR = pieceNamed("gear:0:lower");
const SHROUD = pieceNamed("duct:0:shroud:0");
const GEAR_POINT = hexacopterPoint(
  HEXACOPTER_GEAR_STATIONS[0].a,
  HEXACOPTER_GEAR_STATIONS[0].b,
  HEX_FOOT_BOTTOM_Y,
);
const RIM_STATION = HEXACOPTER_DUCTS[0];
const RIM_RADIUS = HEX_ARM_RADIUS + HEX_LIP_OUTER_RADIUS;
const RIM_POINT = hexacopterPoint(
  RIM_RADIUS * Math.cos(RIM_STATION.angle),
  RIM_RADIUS * Math.sin(RIM_STATION.angle),
  HEX_DISC_Y,
);
/** Наружу из кольца; нормаль препятствия смотрит навстречу, внутрь машины. */
const RIM_INWARD = [
  Math.cos(RIM_STATION.angle),
  0,
  Math.sin(RIM_STATION.angle),
];
const RIM_TANGENT = [
  -Math.sin(RIM_STATION.angle),
  0,
  Math.cos(RIM_STATION.angle),
];

function effectiveMassAt(point, normal) {
  return pointEffectiveMass(
    properties,
    [0, 0, 0, 1],
    [
      point[0] - properties.centre[0],
      point[1] - properties.centre[1],
      point[2] - properties.centre[2],
    ],
    normal,
  );
}

/** Один удар куском машины о материал мира на заданной скорости сближения. */
function strike(piece, point, normal, speed, obstacleMaterial) {
  return resolveVehicleContact(
    {
      point,
      normal,
      relativeVelocity: [
        -normal[0] * speed,
        -normal[1] * speed,
        -normal[2] * speed,
      ],
      effectiveMass: effectiveMassAt(point, normal),
      vehicle: bodyOf(piece),
      obstacle: {
        pieceId: "world:panel",
        material: obstacleMaterial,
        volume: 0.25,
      },
    },
    materialOf,
    () => 0.6,
  );
}

// ---------------------------------------------------------------------------
// 1. Обязательное и условное
// ---------------------------------------------------------------------------

test("импульс передаётся даже когда ничего не сломалось", () => {
  const gentle = strike(GEAR, GEAR_POINT, [0, 1, 0], 1, "concrete");
  assert.equal(gentle.detachesVehiclePiece, false);
  assert.ok(
    Math.hypot(...gentle.impulse) > 10,
    `слабый контакт не передал импульс: ${Math.hypot(...gentle.impulse)}`,
  );
  assert.ok(gentle.impulse[1] > 0, "импульс должен толкать машину от опоры");
});

test("скольжение вдоль стены ударом не является", () => {
  const sliding = resolveVehicleContact(
    {
      point: RIM_POINT,
      normal: RIM_INWARD,
      // Движение строго поперёк нормали: сближения нет.
      relativeVelocity: [RIM_TANGENT[0] * 12, 0, RIM_TANGENT[2] * 12],
      effectiveMass: effectiveMassAt(RIM_POINT, RIM_INWARD),
      vehicle: bodyOf(SHROUD),
      obstacle: { pieceId: "world:panel", material: "brick", volume: 0.25 },
    },
    materialOf,
    () => 0.6,
  );
  assert.equal(sliding.closingSpeed, 0);
  assert.equal(sliding.absorbedEnergy, 0);
  assert.deepEqual([...sliding.impulse], [0, 0, 0]);
  assert.equal(sliding.detachesVehiclePiece, false);
});

test("расхождение после удара второй раз не бьёт", () => {
  const separating = resolveVehicleContact(
    {
      point: RIM_POINT,
      normal: RIM_INWARD,
      relativeVelocity: [RIM_INWARD[0] * 6, 0, RIM_INWARD[2] * 6],
      effectiveMass: effectiveMassAt(RIM_POINT, RIM_INWARD),
      vehicle: bodyOf(SHROUD),
      obstacle: { pieceId: "world:panel", material: "brick", volume: 0.25 },
    },
    materialOf,
    () => 0.6,
  );
  assert.equal(separating.detachesVehiclePiece, false);
  assert.equal(separating.absorbedEnergy, 0);
});

// ---------------------------------------------------------------------------
// 2. Порог крепления выведен из требования
// ---------------------------------------------------------------------------

test("штатная и жёсткая посадка на опоры не отрывает ничего", () => {
  for (const speed of [0.5, 1, 2, 3, 4, 5]) {
    const landing = strike(GEAR, GEAR_POINT, [0, 1, 0], speed, "concrete");
    assert.equal(
      landing.detachesVehiclePiece,
      false,
      `посадка на ${speed} м/с оторвала опору (нагрузка ${landing.vehicleJointLoad.toFixed(2)})`,
    );
  }
});

test("падение на опоры выше эксплуатационного всё же ломает стойку", () => {
  const crash = strike(GEAR, GEAR_POINT, [0, 1, 0], 6, "concrete");
  assert.equal(crash.detachesVehiclePiece, true);
  assert.ok(crash.vehicleJointLoad > 1);
});

test("лобовой удар о дом рвёт крепление кольца, лёгкое касание — нет", () => {
  const nudge = strike(SHROUD, RIM_POINT, RIM_INWARD, 2, "brick");
  assert.equal(nudge.detachesVehiclePiece, false);
  for (const speed of [4, 8, 12]) {
    const hit = strike(SHROUD, RIM_POINT, RIM_INWARD, speed, "brick");
    assert.equal(
      hit.detachesVehiclePiece,
      true,
      `лобовой удар на ${speed} м/с не оторвал сегмент кольца`,
    );
  }
});

test("скользящий удар на маршевой скорости отрывает сегмент кольца", () => {
  const cruise = strike(SHROUD, RIM_POINT, RIM_TANGENT, 9, "brick");
  assert.equal(cruise.detachesVehiclePiece, true);
  const slow = strike(SHROUD, RIM_POINT, RIM_TANGENT, 4, "brick");
  assert.equal(slow.detachesVehiclePiece, false);
});

test("скользящий удар легче лобового: плечо забирает часть в поворот", () => {
  const head = strike(SHROUD, RIM_POINT, RIM_INWARD, 8, "brick");
  const glance = strike(SHROUD, RIM_POINT, RIM_TANGENT, 8, "brick");
  assert.ok(
    Math.hypot(...glance.impulse) < Math.hypot(...head.impulse) * 0.5,
    "эффективная масса поперёк плеча обязана быть заметно меньше",
  );
});

// ---------------------------------------------------------------------------
// 3. Две стороны, каждая со своим материалом
// ---------------------------------------------------------------------------

test("энергия смятия делится обратно стойкости материалов", () => {
  const steel = materialOf("steel");
  const concrete = materialOf("concrete");
  const share = contactEnergyShare(steel, concrete);
  assert.ok(
    share > 0.05 && share < 0.15,
    `стали должно доставаться около десятой части, вышло ${share.toFixed(3)}`,
  );
  // Дому достаётся остальное, и он рассыпается раньше машины.
  const hit = strike(SHROUD, RIM_POINT, RIM_INWARD, 10, "concrete");
  assert.ok(hit.obstacleEnergy > hit.vehicleEnergy * 5);
});

test("неопознанная геометрия принимает удар целиком на машину", () => {
  const unknown = resolveVehicleContact(
    {
      point: RIM_POINT,
      normal: RIM_INWARD,
      relativeVelocity: [-RIM_INWARD[0] * 8, 0, -RIM_INWARD[2] * 8],
      effectiveMass: effectiveMassAt(RIM_POINT, RIM_INWARD),
      vehicle: bodyOf(SHROUD),
      obstacle: null,
    },
    materialOf,
  );
  assert.equal(unknown.vehicleShare, 1);
  assert.equal(unknown.obstacleEnergy, 0);
  assert.equal(unknown.detachesVehiclePiece, true);
});

test("восстановление берётся у пары, а не у одной стороны", () => {
  const pair = contactRestitution(materialOf("steel"), materialOf("concrete"));
  assert.ok(pair > 0 && pair < 0.05, `восстановление пары ${pair}`);
  const alone = contactRestitution(materialOf("steel"), null);
  assert.equal(alone, materialRuntimeProfiles.steel.restitution);
});

test("интенсивность для закона материалов не глушит удар машины", () => {
  const hit = strike(SHROUD, RIM_POINT, RIM_INWARD, 5, "brick");
  // Порог закона обломков — сотые доли; машина против панели заведомо выше,
  // поэтому решать обязана СКОРОСТЬ, а не масса.
  assert.ok(hit.obstacleIntensity > 1);
});

// ---------------------------------------------------------------------------
// 4. Ёмкость крепления — свойство куска, а не машины
// ---------------------------------------------------------------------------

test("крупный узел держит больше мелкого из того же материала", () => {
  const keel = pieceNamed("keel:pan");
  const rib = pieceNamed("canopy:rib:0:1");
  const steel = materialOf("steel");
  assert.ok(
    vehicleJointCapacity(bodyOf(keel), steel) >
      vehicleJointCapacity(bodyOf(rib), steel) * 5,
    "килевой поддон обязан держать много больше ребра фонаря",
  );
});

test("стеклу узел даётся слабее, чем стали того же размера", () => {
  const sample = { pieceId: "x", material: "steel", volume: 0.02 };
  assert.ok(
    vehicleJointCapacity(sample, materialOf("glass")) <
      vehicleJointCapacity(sample, materialOf("steel")),
  );
});
