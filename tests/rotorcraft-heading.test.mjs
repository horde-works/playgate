import assert from "node:assert/strict";
import test from "node:test";
import {
  autopilot,
  HEADING_ALIGN_SECONDS,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

/**
 * АВТОМАТ НЕ ПРОСИТ ТОГО, ЧЕГО МАШИНА НЕ УМЕЕТ.
 *
 * Мультиротор разворачивается вокруг вертикали вяло: момент даёт только
 * реакция воздуха на вращение винтов. Прежний закон погони просил темп по
 * СКОРОСТИ полёта, упирался в потолок и каждым шагом подкручивал машину —
 * она наматывала обороты вокруг себя, формально идя по трассе. Новый закон
 * пропорционален ошибке курса и убывает вместе с ней.
 */
const vehicle = airVehicles.find(({ id }) => id === "town-hexacopter");
const pieces = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === vehicle.clusterId,
);
const mass = massProperties(
  pieces,
  (material) => structuralMaterialProfiles[material].density,
);
const AUTHORITY = 0.194;

/** Прямой участок: курс постоянен, поэтому виден сам закон, а не кривизна. */
function straightPlan() {
  const length = 400;
  const start = [mass.centre[0], mass.centre[1] + 30, mass.centre[2]];
  return {
    length,
    finalFrom: 0.9,
    point: (t) => [start[0] + t * length, start[1], start[2]],
    altitude: () => start[1],
    speedLimit: () => 12,
    requirement: () => 0,
  };
}

function askOn(plan, bearingOffset, speed) {
  const progress = 0.3;
  const here = plan.point(progress);
  const ahead = plan.point(progress + 6 / plan.length);
  const tangent = Math.atan2(ahead[2] - here[2], ahead[0] - here[0]);
  // Нос машины смотрит на запад ([-1,0,0]), поэтому поворот вокруг вертикали
  // задаётся с этой поправкой — иначе стенд «отворачивает» её на полкруга.
  const course = tangent + bearingOffset + Math.PI;
  const orientation = [0, Math.sin(course / 2), 0, Math.cos(course / 2)];
  return autopilot(
    plan,
    progress,
    [here[0], here[1], here[2]],
    orientation,
    [Math.cos(tangent) * speed, 0, Math.sin(tangent) * speed],
    [0, 0, 0],
    {
      mass: mass.mass,
      inertiaYaw: mass.inertia[4],
      bodyCentre: mass.centre,
      dragLinear: mass.mass * vehicle.flight.linearDamping,
      dragLateral:
        mass.mass * vehicle.flight.linearDamping * vehicle.flight.lateralDragRatio,
      dragAngular: mass.inertia[4] * vehicle.flight.angularDamping,
      limits: vehicle.flight.limits,
      yawRateLimits: { minimum: -AUTHORITY, maximum: AUTHORITY },
    },
    1,
    vehicle.nose,
    vehicle.flight.approach,
    null,
  );
}

function ask(bearingOffset, speed) {
  const plan = vehicle.flight.routePlan("circuit", mass.centre);
  const progress = 0.3;
  const here = plan.point(progress);
  const ahead = plan.point(progress + 6 / plan.length);
  const tangent = Math.atan2(ahead[2] - here[2], ahead[0] - here[0]);
  // Нос машины отвёрнут от касательной на заданный угол. Ориентация
  // задаётся кватернионом вокруг вертикали, как в рантайме.
  // Нос машины смотрит на запад ([-1,0,0]), поэтому поворот вокруг вертикали
  // задаётся с этой поправкой — иначе стенд «отворачивает» её на полкруга.
  const course = tangent + bearingOffset + Math.PI;
  const orientation = [0, Math.sin(course / 2), 0, Math.cos(course / 2)];
  return autopilot(
    plan,
    progress,
    [here[0], here[1], here[2]],
    orientation,
    [Math.cos(tangent) * speed, 0, Math.sin(tangent) * speed],
    [0, 0, 0],
    {
      mass: mass.mass,
      inertiaYaw: mass.inertia[4],
      bodyCentre: mass.centre,
      dragLinear: mass.mass * vehicle.flight.linearDamping,
      dragLateral:
        mass.mass * vehicle.flight.linearDamping * vehicle.flight.lateralDragRatio,
      dragAngular: mass.inertia[4] * vehicle.flight.angularDamping,
      limits: vehicle.flight.limits,
      yawRateLimits: { minimum: -AUTHORITY, maximum: AUTHORITY },
    },
    1,
    vehicle.nose,
    vehicle.flight.approach,
    null,
  );
}

test("запрос рыскания не выходит за реальную власть машины", () => {
  for (const speed of [3, 9, 14]) {
    for (const offset of [0.1, 0.6, 1.4, 2.6]) {
      const demand = ask(offset, speed).guidance;
      assert.ok(
        Math.abs(demand.yawRate) <= AUTHORITY + 1e-6,
        `при скорости ${speed} и ошибке ${offset} рад запрошено ${demand.yawRate.toFixed(3)} при власти ${AUTHORITY}`,
      );
    }
  }
});

test("на прямом участке выровненный нос не держит потолок", () => {
  // На КРУГЕ проверять это бессмысленно: трасса радиусом 46 м при 9 м/с сама
  // требует 0.196 рад/с — ровно всю власть машины. Она идёт на пределе не от
  // ошибки, а потому что маршрут столько и просит; лететь боком для неё
  // единственный честный способ. Закон проверяется на прямой.
  const straight = straightPlan();
  const small = Math.abs(askOn(straight, 0.05, 9).guidance.yawRate);
  const big = Math.abs(askOn(straight, 1.2, 9).guidance.yawRate);
  assert.ok(
    small < big,
    `малая ошибка должна просить меньше: ${small.toFixed(3)} против ${big.toFixed(3)}`,
  );
  assert.ok(
    small < AUTHORITY * 0.5,
    `почти выровненный нос не должен просить полруля: ${small.toFixed(3)}`,
  );
});

test("выравнивание носа занимает разумное время, а не мгновение", () => {
  const demand = ask(0.4, 9).guidance;
  const seconds = 0.4 / Math.max(1e-6, Math.abs(demand.yawRate));
  assert.ok(
    seconds >= HEADING_ALIGN_SECONDS * 0.8 && seconds <= 6,
    `нос должен выравниваться за секунды, а не рывком: получилось ${seconds.toFixed(1)} с`,
  );
});
