// VX-8 «Yaqui» В МИРЕ: стенд размещения, а не паспорта.
//
// Паспорт машины проверяет `duct-hexacopter-frame.test.mjs` — там вопрос
// «сошёлся ли перевод объекта в кадр». Здесь вопрос другой и он ровно один:
// СТОИТ ЛИ МАШИНА НА ПОЛИГОНЕ И ХВАТАЕТ ЛИ ЕЙ СИЛ ВЗЛЕТЕТЬ. Оба ответа обязаны
// быть числами, потому что оба уже были неверными: пределы паспорта считались
// до того, как машина собралась, и промахнулись по массе вдвое.
import test from "node:test";
import assert from "node:assert/strict";

import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  DUCT_HEXACOPTER_MEASURED_MASS,
  DUCT_HEXACOPTER_RANGE_BERTH,
  DUCT_HEXACOPTER_RANGE_LIMITS,
  DUCT_HEXACOPTER_RANGE_PAD_RADIUS,
  DUCT_HEXACOPTER_RANGE_PAD_TOP_Y,
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
  DUCT_HEXACOPTER_RANGE_YAW_FAN_FORCE,
  ductHexacopterRangeBlueprint,
  ductHexacopterRangeFrame,
  ductHexacopterRangeYawThrusters,
  RAX8_LATERAL_PER_KILOGRAM,
  RAX8_THRUST_TO_WEIGHT,
  RAX8_YAW_ACCELERATION,
} from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import {
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_Z,
} from "../games/make-a-mess/src/game/rangeHexacopter.ts";
import { vehicleFrames } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";

const GRAVITY = 9.81;
const densityOf = (material) => structuralMaterialProfiles[material].density;

const compilation = compileSceneGroups(ductHexacopterRangePadDocument, new Map());
const vehicle = compilation.clusters.find(
  (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
);
const pad = compilation.clusters.find(
  (cluster) => cluster.id === "combat-hexacopter-range:duct-vertipad",
);
const mass = massProperties(vehicle.pieces, densityOf);

test("VX-8: машина и её пад собираются в кластеры полигона", () => {
  assert.ok(vehicle, "кластер машины не собрался");
  assert.ok(pad, "кластер пада не собрался");
  // Счёт кусков — это счёт ПРИНЯТОГО ОБЪЕКТА. Разойдётся он только если объект
  // переписали, и тогда об этом надо узнать здесь, а не глазами в кадре.
  assert.equal(vehicle.pieces.length, 715);
});

test("VX-8: машина СТОИТ на своём паду, а не висит и не утоплена в нём", () => {
  const bottom = Math.min(
    ...vehicle.pieces.map((piece) => piece.position[1] - piece.size[1] / 2),
  );
  // Опоры авторского объекта кончаются на y=0, поэтому низ собранной машины
  // обязан лежать на верхе пада. Допуск — толщина подошвы, а не «примерно там».
  assert.ok(
    Math.abs(bottom - DUCT_HEXACOPTER_RANGE_PAD_TOP_Y) < 0.05,
    `низ машины ${bottom.toFixed(3)} против верха пада ${DUCT_HEXACOPTER_RANGE_PAD_TOP_Y}`,
  );
  // И машина обязана помещаться на диск пада, а не свешиваться с него.
  for (const axis of [0, 2]) {
    const reach = Math.max(
      ...vehicle.pieces.map((piece) =>
        Math.abs(piece.position[axis] - DUCT_HEXACOPTER_RANGE_BERTH[axis]) + piece.size[axis] / 2,
      ),
    );
    assert.ok(
      reach <= DUCT_HEXACOPTER_RANGE_PAD_RADIUS,
      `габарит ${reach.toFixed(2)} по оси ${axis} шире пада ${DUCT_HEXACOPTER_RANGE_PAD_RADIUS}`,
    );
  }
});

test("VX-8: пад не задевает ни вертипад HX-6, ни площадку RAX-8", () => {
  const toVertipad = Math.hypot(
    DUCT_HEXACOPTER_RANGE_BERTH[0] - RANGE_HEXACOPTER_PAD_X,
    DUCT_HEXACOPTER_RANGE_BERTH[2] - RANGE_HEXACOPTER_PAD_Z,
  );
  // Радиус вертипада около 2.9, радиус этого пада 6.2: между дисками обязан
  // остаться зазор, иначе два пада срастутся в один кусок железа.
  assert.ok(toVertipad > DUCT_HEXACOPTER_RANGE_PAD_RADIUS + 2.9, `до HX-6 ${toVertipad.toFixed(1)} м`);
  const toCentre = Math.hypot(DUCT_HEXACOPTER_RANGE_BERTH[0], DUCT_HEXACOPTER_RANGE_BERTH[2]);
  // Документ полигона: всё ближе тридцати метров к площадке RAX-8 обязано быть
  // сверено с его показательной трассой. Этот пад держится вне этого круга.
  assert.ok(toCentre > 30, `до площадки RAX-8 ${toCentre.toFixed(1)} м`);
  // И при этом стоит на суше (радиус 50), а не на кромке.
  assert.ok(toCentre < 50 - DUCT_HEXACOPTER_RANGE_PAD_RADIUS, `вынос ${toCentre.toFixed(1)} м`);
});

test("VX-8: объявленная масса — это масса СОБРАННОГО кластера", () => {
  assert.ok(
    Math.abs(mass.mass - DUCT_HEXACOPTER_MEASURED_MASS) < 0.1,
    `собралось ${mass.mass.toFixed(2)} кг против объявленных ${DUCT_HEXACOPTER_MEASURED_MASS}`,
  );
});

test("VX-8: пределы пересчитаны на живую массу по домашнему правилу", () => {
  const thrustToWeight =
    (DUCT_HEXACOPTER_RANGE_LIMITS.enginePower * 6) / (mass.mass * GRAVITY);
  assert.ok(
    Math.abs(thrustToWeight - RAX8_THRUST_TO_WEIGHT) < 0.15,
    `тяговооружённость ${thrustToWeight.toFixed(2)} против ${RAX8_THRUST_TO_WEIGHT}`,
  );
  const lateralPerKilogram = DUCT_HEXACOPTER_RANGE_LIMITS.lateralThrust / mass.mass;
  assert.ok(
    Math.abs(lateralPerKilogram - RAX8_LATERAL_PER_KILOGRAM) < 0.15,
    `поперечная ${lateralPerKilogram.toFixed(2)} Н/кг против ${RAX8_LATERAL_PER_KILOGRAM}`,
  );
  // Строго выше нуля: паспорт предупреждает, что ноль молча выключает
  // авторский курс и предел заноса, не сказав об этом ни слова.
  assert.ok(DUCT_HEXACOPTER_RANGE_LIMITS.lateralThrust > 0);
});

test("VX-8: тяга тоннелей прибита к инерции СОБРАННОГО тела", () => {
  const inertiaYaw = mass.inertia[4];
  const torque = ductHexacopterRangeYawThrusters.reduce((sum, thruster) => {
    const rx = thruster.point[0] - mass.centre[0];
    const rz = thruster.point[2] - mass.centre[2];
    return sum + Math.abs(-rx * thruster.axis[2] + rz * thruster.axis[0]) * thruster.maximumForce;
  }, 0);
  const acceleration = torque / inertiaYaw;
  assert.ok(
    Math.abs(acceleration - RAX8_YAW_ACCELERATION) < 0.3,
    `рыскание ${acceleration.toFixed(2)} рад/с² против ${RAX8_YAW_ACCELERATION} у RAX-8`,
  );
  // Паспортные 1030 Н дали бы вдвое больше — ровно та ошибка, которую паспорт
  // сам назвал перелётом и оставил рантайму починить.
  assert.ok(DUCT_HEXACOPTER_RANGE_YAW_FAN_FORCE < 700);
  for (const thruster of ductHexacopterRangeYawThrusters) {
    assert.equal(thruster.maximumForce, DUCT_HEXACOPTER_RANGE_YAW_FAN_FORCE);
  }
});

test("VX-8: маски кадра ловят реальные куски, а не пустоту", () => {
  const ids = vehicle.pieces.map((piece) => piece.id);
  // Оболочка и независимые тела ищут `:blade:` С ДВОЕТОЧИЕМ. У этого объекта
  // лопасти кольца — одна сетка, и если её назвать `blades`, маска не совпадёт
  // ни разу: кольца не закрутятся, а оболочка окажется пустой.
  const blades = ids.filter((id) => id.includes(ductHexacopterRangeFrame.envelopeMatch));
  assert.equal(blades.length, 8, "шесть подъёмных колец и два тоннеля");
  // Рантайм разбирает винт и тоннель РАЗНЫМИ выражениями, и оба обязаны найтись.
  const lift = new Set();
  const yaw = new Set();
  for (const id of blades) {
    const yawMatch = id.match(/^(.*:yaw-engine:(\d+)):blade:/);
    if (yawMatch) {
      yaw.add(yawMatch[1]);
      continue;
    }
    const liftMatch = id.match(/^(.*:engine:-?\d+):blade:/);
    assert.ok(liftMatch, `кусок ${id} не разбирается ни как винт, ни как тоннель`);
    lift.add(liftMatch[1]);
  }
  assert.equal(lift.size, 6);
  assert.equal(yaw.size, 2);
  // Ноги обязаны остаться вне контактной оболочки: нога со своим коллайдером —
  // это то, что находит под собой её же луч, и машина садится в воздухе.
  assert.ok(ids.some((id) => id.includes(":landing-")));
});

test("VX-8: машина зарегистрирована в мире, а не только описана", () => {
  const frame = vehicleFrames.find((candidate) => candidate.id === "duct-hexacopter");
  assert.ok(frame, "кадр не зарегистрирован в vehicleFrames");
  assert.equal(frame.clusterId, DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId);
  const air = airVehicles.find((candidate) => candidate.id === "duct-hexacopter");
  assert.ok(air, "машина не зарегистрирована в airVehicles");
  assert.equal(air.clusterId, DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId);
  // Кластер кадра обязан существовать в собранной сцене: кадр, ссылающийся на
  // несуществующий кластер, молчит и не показывает машину вовсе.
  assert.equal(air.clusterId, vehicle.id);
  assert.equal(air.armament, ductHexacopterRangeBlueprint.armament);
});
