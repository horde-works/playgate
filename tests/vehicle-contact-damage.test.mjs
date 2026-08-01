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
import {
  classifyLandingDamage,
  crumbleOnLanding,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  HEXACOPTER_GEAR_STATIONS,
  HEXACOPTER_DUCTS,
  HEX_ARM_RADIUS,
  HEX_DISC_Y,
  HEX_FOOT_BOTTOM_Y,
  HEX_LIP_OUTER_RADIUS,
  TOWN_HEXACOPTER_CLUSTER_ID,
  hexacopterPoint,
} from "../games/make-a-mess/src/game/townHexacopter.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  contactRestitution,
  resolveVehicleContact,
} from "../games/make-a-mess/src/game/vehicleContactDamage.ts";

const densityOf = (material) => structuralMaterialProfiles[material].density;
const materialOf = (material) => ({
  restitution: materialRuntimeProfiles[material].restitution,
  density: materialRuntimeProfiles[material].density,
});

/**
 * Суд — ровно как в рантайме: обе стороны спрашиваются у ОДНОГО закона
 * обломков, каждая своим материалом и своей интенсивностью. Материал вне
 * таблицы обломков не судится вовсе.
 */
const judge = (material, closingSpeed, intensity) =>
  crumbleOnLanding.has(material)
    ? classifyLandingDamage(material, closingSpeed, intensity)
    : "none";

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
const GLASS = ship.find((piece) => piece.material === "glass");
assert.ok(GLASS, "у машины должно быть остекление");

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
function strike(piece, point, normal, speed, obstacleMaterial, share) {
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
      share,
    },
    materialOf,
  );
}

/** Вердикты обеих сторон одного удара — как их выносит рантайм. */
function verdicts(piece, point, normal, speed, obstacleMaterial, share) {
  const hit = strike(piece, point, normal, speed, obstacleMaterial, share);
  return {
    hit,
    vehicle: judge(piece.material, hit.closingSpeed, hit.vehicleIntensity),
    world: judge(obstacleMaterial, hit.closingSpeed, hit.obstacleIntensity),
  };
}

// ---------------------------------------------------------------------------
// 1. Обязательное и условное
// ---------------------------------------------------------------------------

test("импульс передаётся даже когда ничего не сломалось", () => {
  const { hit, vehicle, world } = verdicts(
    GEAR,
    GEAR_POINT,
    [0, 1, 0],
    1,
    "concrete",
  );
  assert.equal(vehicle, "none");
  assert.equal(world, "none");
  assert.ok(
    Math.hypot(...hit.impulse) > 10,
    `слабый контакт не передал импульс: ${Math.hypot(...hit.impulse)}`,
  );
  assert.ok(hit.impulse[1] > 0, "импульс должен толкать машину от опоры");
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
  );
  assert.equal(sliding.closingSpeed, 0);
  assert.deepEqual([...sliding.impulse], [0, 0, 0]);
  assert.equal(sliding.vehicleIntensity, 0);
  assert.equal(sliding.obstacleIntensity, 0);
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
  );
  assert.equal(separating.closingSpeed, 0);
  assert.deepEqual([...separating.impulse], [0, 0, 0]);
});

// ---------------------------------------------------------------------------
// 2. Один закон обеим сторонам, каждая своим материалом
// ---------------------------------------------------------------------------

test("стальной набор переживает любой контактный удар — сталь вне закона обломков", () => {
  for (const speed of [0.5, 1, 2, 3, 5, 8, 12, 20, 40]) {
    const { vehicle } = verdicts(GEAR, GEAR_POINT, [0, 1, 0], speed, "concrete");
    assert.equal(
      vehicle,
      "none",
      `стальная стойка получила вердикт на ${speed} м/с`,
    );
  }
});

test("жёсткая посадка щадит стальную стойку, но судит бетон под ней", () => {
  const { vehicle, world } = verdicts(
    GEAR,
    GEAR_POINT,
    [0, 1, 0],
    20,
    "concrete",
  );
  assert.equal(vehicle, "none");
  assert.equal(world, "shatter", "бетон на 20 м/с обязан рассыпаться");
});

test("лобовой удар о кирпич: стальное кольцо цело, кладка судится скоростью", () => {
  const at = (speed) =>
    verdicts(SHROUD, RIM_POINT, RIM_INWARD, speed, "brick");
  assert.equal(at(2).world, "none");
  assert.equal(at(6).world, "chip");
  assert.equal(at(9).world, "shatter");
  for (const speed of [2, 6, 9, 14]) {
    assert.equal(at(speed).vehicle, "none", `сталь получила вердикт на ${speed}`);
  }
});

test("стекло машины лопается там, где кирпич мира ещё стоит", () => {
  const point = GLASS.position;
  const { vehicle, world } = verdicts(GLASS, point, [1, 0, 0], 4.2, "brick");
  assert.equal(vehicle, "shatter", "стекло на 4.2 м/с обязано лопнуть");
  assert.equal(world, "none", "кирпич на 4.2 м/с ещё держится");
  const gentle = verdicts(GLASS, point, [1, 0, 0], 1.5, "brick");
  assert.equal(gentle.vehicle, "none", "касание стекла не бьёт его");
});

test("дерево бьётся своим порогом — закон одинаков для любой машины", () => {
  const plank = { pieceId: "longship:plank", material: "wood", volume: 0.08 };
  const hit = resolveVehicleContact(
    {
      point: [0, 2, 0],
      normal: [1, 0, 0],
      relativeVelocity: [-7, 0, 0],
      effectiveMass: 40,
      vehicle: plank,
      obstacle: { pieceId: "world:pier", material: "stone", volume: 0.4 },
    },
    materialOf,
  );
  assert.equal(judge("wood", hit.closingSpeed, hit.vehicleIntensity), "shatter");
  assert.equal(judge("stone", hit.closingSpeed, hit.obstacleIntensity), "none");
});

test("неопознанная геометрия судит только машину", () => {
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
  assert.equal(unknown.obstacleIntensity, 0);
  assert.ok(unknown.vehicleIntensity > 0);
  assert.equal(judge("steel", unknown.closingSpeed, unknown.vehicleIntensity), "none");
});

// ---------------------------------------------------------------------------
// 3. Швартовка и посадка безнаказанны ЗАКОНОМ, а не исключением машины
// ---------------------------------------------------------------------------

test("на швартовочной скорости закон молчит для любого материала", () => {
  // Захват № 07 идёт в сантиметрах в секунду у жёсткой мачты. Ни один
  // материал таблицы не имеет порога ниже 1.8 м/с, поэтому кораблю не нужен
  // и невозможен переключатель «не участвовать в ударах».
  for (const material of crumbleOnLanding) {
    assert.equal(
      classifyLandingDamage(material, 0.14, 1e6),
      "none",
      `${material} бьётся на швартовочной скорости`,
    );
  }
});

test("касание мачты на швартовке даёт пренебрежимый толчок", () => {
  const hit = strike(GLASS, GLASS.position, [1, 0, 0], 0.14, "concrete");
  const deltaV =
    Math.hypot(...hit.impulse) /
    effectiveMassAt(GLASS.position, [1, 0, 0]);
  assert.ok(deltaV < 0.16, `швартовка оттолкнула корабль на ${deltaV} м/с`);
});

test("в паспортах машин нет переключателя ударов", () => {
  for (const vehicle of airVehicles) {
    assert.ok(
      !("contactDamage" in vehicle.flight),
      `${vehicle.id} несёт переключатель участия в ударах`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Сохранение: один удар — один импульс
// ---------------------------------------------------------------------------

test("доли одного удара в сумме дают ровно один удар", () => {
  const whole = strike(SHROUD, RIM_POINT, RIM_INWARD, 9, "brick");
  const parts = [0.5, 0.3, 0.2].map((share) =>
    strike(SHROUD, RIM_POINT, RIM_INWARD, 9, "brick", share),
  );
  const impulse = parts.reduce(
    (sum, part) => sum + Math.hypot(...part.impulse),
    0,
  );
  assert.ok(Math.abs(impulse - Math.hypot(...whole.impulse)) < 1e-6);
});

test("интенсивность экстенсивна, скорость — нет", () => {
  const whole = strike(SHROUD, RIM_POINT, RIM_INWARD, 12, "brick");
  for (const contacts of [8, 20, 40]) {
    const thin = strike(SHROUD, RIM_POINT, RIM_INWARD, 12, "brick", 1 / contacts);
    assert.ok(
      Math.abs(thin.vehicleIntensity - whole.vehicleIntensity / contacts) <
        whole.vehicleIntensity * 1e-9,
      "интенсивность обязана делиться долей контакта",
    );
    assert.equal(
      thin.closingSpeed,
      whole.closingSpeed,
      "скорость сближения долей не делится",
    );
  }
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
// 5. Один термометр: интенсивность в калибровке закона обломков
// ---------------------------------------------------------------------------

test("интенсивность стороны — сила её импульса против веса её куска", () => {
  const hit = strike(SHROUD, RIM_POINT, RIM_INWARD, 6, "brick");
  const impulse = Math.hypot(...hit.impulse);
  const vehicleMass = volumeOf(SHROUD) * materialRuntimeProfiles.steel.density;
  const obstacleMass = 0.25 * materialRuntimeProfiles.brick.density;
  assert.ok(
    Math.abs(hit.vehicleIntensity - (impulse * 60) / (vehicleMass * 320)) <
      hit.vehicleIntensity * 1e-9,
  );
  assert.ok(
    Math.abs(hit.obstacleIntensity - (impulse * 60) / (obstacleMass * 320)) <
      hit.obstacleIntensity * 1e-9,
  );
});

test("интенсивность машины против панели не глушит удар: решает скорость", () => {
  const hit = strike(SHROUD, RIM_POINT, RIM_INWARD, 5, "brick");
  assert.ok(hit.obstacleIntensity > 1);
  assert.ok(hit.vehicleIntensity > 1);
});

test("восстановление берётся у пары, а не у одной стороны", () => {
  const pair = contactRestitution(materialOf("steel"), materialOf("concrete"));
  assert.ok(pair > 0 && pair < 0.05, `восстановление пары ${pair}`);
  const alone = contactRestitution(materialOf("steel"), null);
  assert.equal(alone, materialRuntimeProfiles.steel.restitution);
});
