import assert from "node:assert/strict";
import test from "node:test";

import {
  autopilot,
  rotateVector,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

/**
 * ПРОМАХ МИМО ПРИЧАЛА ВИДЕН С ЛЮБОЙ СТОРОНЫ И ПРИ ЛЮБОМ ПОЛОЖЕНИИ НОСА.
 *
 * Продольный контур когда-то мерил остаток вдоль ПРИЧАЛЬНОГО курса, а боковой
 * — вдоль СВОЕГО борта. Пока нос смотрел на причал, эти оси образовывали
 * нормальный базис; у всенаправленной машины, пришедшей на финиш боком, обе
 * вставали перпендикулярно ошибке, и тридцать метров промаха давали ноль
 * сразу в двух каналах. Машина честно докладывала «маршрут пройден» и висела
 * рядом с бертом. Требование теперь одно: команда — вектор на причал.
 */
const vehicle = airVehicles.find(({ id }) => id === "town-hexacopter");
const pieces = combatHexacopterRangeScene.breakablePieces.filter(
  (piece) => piece.clusterId === vehicle.clusterId,
);
const mass = massProperties(
  pieces,
  (material) => structuralMaterialProfiles[material].density,
);
const plan = vehicle.flight.routePlan("circuit", mass.centre);
const berth = plan.point(1);

const model = {
  // Мультиротор перемещается наклоном винтового диска — рантайм выставляет
  // этот признак по liftSource, стенд обязан повторять его же.
  vectoredTranslation: true,
  mass: mass.mass,
  inertiaYaw: mass.inertia[4],
  bodyCentre: mass.centre,
  dragLinear: mass.mass * vehicle.flight.linearDamping,
  dragLateral:
    mass.mass * vehicle.flight.linearDamping * vehicle.flight.lateralDragRatio,
  dragAngular: mass.inertia[4] * vehicle.flight.angularDamping,
  limits: vehicle.flight.limits,
  yawRateLimits: { minimum: -0.194, maximum: 0.194 },
};

/** Куда машина на самом деле просится, в осях мира. */
function demandAt(offsetX, offsetZ, course) {
  const orientation = [0, Math.sin(course / 2), 0, Math.cos(course / 2)];
  const { guidance } = autopilot(
    plan,
    1,
    [berth[0] + offsetX, berth[1], berth[2] + offsetZ],
    orientation,
    [0, 0, 0],
    [0, 0, 0],
    model,
    1,
    vehicle.nose,
    vehicle.flight.approach,
    null,
  );
  // Курс корпуса берётся ТОЙ ЖЕ математикой, что и в рантайме: нос машины
  // смотрит на запад, и реконструировать его поворот «на глаз» — верный
  // способ получить тест, который меряет собственную опечатку.
  const nose = rotateVector(orientation, vehicle.nose);
  const flat = Math.hypot(nose[0], nose[2]) || 1;
  const heading = [nose[0] / flat, nose[2] / flat];
  const starboard = [-heading[1], heading[0]];
  return [
    guidance.forwardSpeed * heading[0] + guidance.lateralSpeed * starboard[0],
    guidance.forwardSpeed * heading[1] + guidance.lateralSpeed * starboard[1],
  ];
}

test("промах мимо причала виден при любом положении носа", () => {
  const offsets = [
    [0, 30],
    [0, -30],
    [30, 0],
    [-30, 0],
    [21, 21],
  ];
  // В том числе нос поперёк причального курса — прежнее слепое пятно.
  const courses = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7];
  for (const [offsetX, offsetZ] of offsets) {
    for (const course of courses) {
      const demand = demandAt(offsetX, offsetZ, course);
      const speed = Math.hypot(demand[0], demand[1]);
      assert.ok(
        speed > 3,
        `в 30 м от причала (${offsetX},${offsetZ}) при курсе ${course.toFixed(2)} машина просит ${speed.toFixed(2)} м/с`,
      );
      // Команда обязана указывать НА причал, а не куда придётся.
      const toBerth = Math.hypot(offsetX, offsetZ);
      const alignment =
        (demand[0] * -offsetX + demand[1] * -offsetZ) / (speed * toBerth);
      assert.ok(
        alignment > 0.99,
        `команда смотрит мимо причала: косинус ${alignment.toFixed(3)}`,
      );
    }
  }
});

test("подход тормозится по остатку и сходится к швартовочному ходу", () => {
  const far = Math.hypot(...demandAt(0, 30, 0));
  const near = Math.hypot(...demandAt(0, 4, 0));
  const cup = Math.hypot(...demandAt(0, 0.4, 0));
  assert.ok(far > near, `за 30 м подход должен быть быстрее, чем за 4 (${far} vs ${near})`);
  assert.ok(near > cup, `за 4 м подход должен быть быстрее, чем у стакана (${near} vs ${cup})`);
  assert.ok(cup < 0.8, `у самого стакана ход обязан быть швартовочным, а не ${cup}`);
});

test("тело не обгоняет нос: ход держится в пределах крабового угла", () => {
  // Наклон винтов переставляет вектор хода мгновенно, а нос разворачивается
  // сопротивлением лопастей — около десяти градусов в секунду. Без предела
  // машина на изломе трассы уезжала боком, нос оставался на 60–90° позади и
  // не догонял до самой посадки, а на финише она летела почти задом.
  const progress = 0.3;
  const here = plan.point(progress);
  const ahead = plan.point(progress + 12 / plan.length);
  const wantAngle = Math.atan2(ahead[2] - here[2], ahead[0] - here[0]);
  // Нос отвёрнут от нужного направления на 120° — вдвое больше предела.
  for (const sign of [1, -1]) {
    const noseAngle = wantAngle + sign * (Math.PI * 2) / 3;
    let course = 0;
    for (let probe = 0; probe < 720; probe += 1) {
      const candidate = (probe / 720) * Math.PI * 2 - Math.PI;
      const q = [0, Math.sin(candidate / 2), 0, Math.cos(candidate / 2)];
      const n = rotateVector(q, vehicle.nose);
      const off = Math.abs(
        Math.atan2(
          Math.sin(Math.atan2(n[2], n[0]) - noseAngle),
          Math.cos(Math.atan2(n[2], n[0]) - noseAngle),
        ),
      );
      if (off < 0.01) {
        course = candidate;
        break;
      }
    }
    const orientation = [0, Math.sin(course / 2), 0, Math.cos(course / 2)];
    const { guidance } = autopilot(
      plan,
      progress,
      [here[0], here[1], here[2]],
      orientation,
      [0, 0, 0],
      [0, 0, 0],
      model,
      1,
      vehicle.nose,
      vehicle.flight.approach,
      null,
    );
    const nose = rotateVector(orientation, vehicle.nose);
    const flat = Math.hypot(nose[0], nose[2]) || 1;
    const heading = [nose[0] / flat, nose[2] / flat];
    const starboard = [-heading[1], heading[0]];
    const demandX =
      guidance.forwardSpeed * heading[0] + guidance.lateralSpeed * starboard[0];
    const demandZ =
      guidance.forwardSpeed * heading[1] + guidance.lateralSpeed * starboard[1];
    const speed = Math.hypot(demandX, demandZ);
    if (speed < 1e-6) {
      continue;
    }
    const crab = Math.abs(
      Math.atan2(
        demandX * heading[1] - demandZ * heading[0],
        demandX * heading[0] + demandZ * heading[1],
      ),
    );
    assert.ok(
      crab <= Math.PI / 3 + 0.02,
      `ход отклонён от носа на ${((crab * 180) / Math.PI).toFixed(0)}° при пределе 60°`,
    );
  }
});
