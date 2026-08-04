import assert from "node:assert/strict";
import test from "node:test";
import {
  RESTING_POSE,
  SKY_TRAIN_DEPARTURE_BOARD,
  SKY_TRAIN_LIMITS,
  SKY_TRAIN_PLATFORM_DROP,
  SKY_TRAIN_RIDE_POST,
  isInsideCabin,
  isRestingPose,
  isVehicleFramePiece,
  mooringForce,
  pitchAxisOf,
  rotateVector,
  advanceRouteProgress,
  advanceVehicleRouteProgress,
  rejoinVehicleRouteProgress,
  IDLE_CONTROLS,
  SKY_TRAIN_APPROACH,
  SKY_TRAIN_DOCKING,
  hullDrag,
  isDockedPose,
  isMooringCaptureEligible,
  isDockingSettleWindow,
  isDockingComplete,
  autopilot,
  flightPlan,
  terminalArrivalPlan,
  predictShip,
  shipForces,
  routeLength,
  routeSpeed,
  shipLocalPoint,
  vehicleFrameForCluster,
  vehicleFrames,
  vehicleMooringState,
  vehiclePiecePosition,
  vehicleRotation,
  vehicleAttitude,
  rudderEffectiveness,
  finalLegFrom,
  routePoint,
  DEPARTURE_LIGHT,
  departureLightGlow,
  engineValuesPortToStarboard,
  skyTrainFlightEventState,
  SKY_TRAIN_CASTOFF_TIME,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  grandTerminalScene,
  skyBerthMetrics,
} from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { PLAYER_CAPSULE_FOOT_OFFSET } from "../games/make-a-mess/src/game/playerMovement.ts";

const densityOf = (material) => structuralMaterialProfiles[material].density;

const SKY_TRAIN = "terminal:sky-train";
const ship = grandTerminalScene.breakablePieces.filter(
  (piece) => piece.clusterId === SKY_TRAIN,
);

test("disturbance recovery reacquires the nearest bounded route point", () => {
  const plan = {
    length: 100,
    finalFrom: 0.9,
    point(progress) {
      return [progress * 100, progress * 10, 0];
    },
    altitude(progress) {
      return progress * 10;
    },
    speedLimit() {
      return 10;
    },
  };
  const behind = rejoinVehicleRouteProgress(plan, 0.6, [57, 5.7, 2]);
  assert.equal(Math.abs(behind - 0.57) < 0.002, true, String(behind));

  const farAhead = rejoinVehicleRouteProgress(plan, 0.6, [95, 9.5, 0]);
  assert.equal(
    farAhead <= 0.7 + 1e-9,
    true,
    "a coincident route section skipped beyond the bounded rejoin window",
  );
});

function mooringCapture(frame, state, properties) {
  return vehicleMooringState(
    frame,
    [
      state.position[0] - properties.centre[0],
      state.position[1] - properties.centre[1],
      state.position[2] - properties.centre[2],
    ],
    state.orientation,
    state.velocity,
    state.angularVelocity,
    properties.centre,
  );
}

test("all eight airborne machines are declared as vehicle frames", () => {
  assert.equal(vehicleFrames.length, 8);
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  assert.notEqual(frame, null);
  assert.equal(frame.id, "sky-train");
  assert.equal(vehicleFrameForCluster("terminal:sky-berth"), null);
  assert.equal(
    vehicleFrameForCluster("viking-village:sky-longship")?.id,
    "sky-longship",
  );
  assert.equal(
    vehicleFrameForCluster("sky-mooring:airship")?.id,
    "town-airship",
  );
  assert.equal(
    vehicleFrameForCluster("stronghold:sky-ram")?.id,
    "basalt-sky-ram",
  );
  assert.equal(
    vehicleFrameForCluster("town-vertipad:hexacopter")?.id,
    "town-hexacopter",
  );
  assert.equal(
    vehicleFrameForCluster("nimbus:nimbus:hexacopter")?.id,
    "nimbus-hexacopter",
  );

  const shipPiece = grandTerminalScene.breakablePieces.find(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const berthPiece = grandTerminalScene.breakablePieces.find(
    (piece) => piece.clusterId === "terminal:sky-berth",
  );
  assert.equal(isVehicleFramePiece(shipPiece), true);
  assert.equal(isVehicleFramePiece(berthPiece), false);
});

test("the frame pivots on the lift heart, not on the middle of the train", () => {
  // Числа в политике транспорта продублированы намеренно, чтобы она не
  // тянула за собой сцену терминала. Тест ловит расхождение.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const M = skyBerthMetrics;
  const expected = [(M.hullFrom + M.hullTo) / 2, M.hullY, M.trackZ];
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(frame.origin[axis] - expected[axis]) < 1e-6, true,
      `ось ${axis}: ${frame.origin[axis]} против ${expected[axis]}`);
  }

  const heart = grandTerminalScene.breakablePieces.find(
    (piece) => piece.id === `${SKY_TRAIN}:heart`,
  );
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(frame.origin[axis] - heart.position[axis]) < 1e-6, true,
      `сердце по оси ${axis}`);
  }
});

test("a resting pose leaves every piece exactly where it was authored", () => {
  assert.equal(isRestingPose(RESTING_POSE), true);
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  for (const piece of grandTerminalScene.breakablePieces.filter(
    (candidate) => candidate.clusterId === SKY_TRAIN,
  )) {
    const placed = vehiclePiecePosition(frame.origin, piece.position, RESTING_POSE);
    for (const axis of [0, 1, 2]) {
      assert.equal(Math.abs(placed[axis] - piece.position[axis]) < 1e-9, true,
        `${piece.id} по оси ${axis}`);
    }
  }
});

test("the frame carries the whole ship rigidly: distances never change", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const ship = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const sample = [0, 97, 211, 344, 460].map((index) => ship[index % ship.length]);
  const pose = { position: [12, 26, -8], yaw: 0.6, pitch: -0.12, roll: 0.08 };

  for (let left = 0; left < sample.length; left += 1) {
    for (let right = left + 1; right < sample.length; right += 1) {
      const before = Math.hypot(
        sample[left].position[0] - sample[right].position[0],
        sample[left].position[1] - sample[right].position[1],
        sample[left].position[2] - sample[right].position[2],
      );
      const a = vehiclePiecePosition(frame.origin, sample[left].position, pose);
      const b = vehiclePiecePosition(frame.origin, sample[right].position, pose);
      const after = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.equal(Math.abs(before - after) < 1e-9, true,
        `${sample[left].id} ↔ ${sample[right].id}: ${before} → ${after}`);
    }
  }
});

test("yaw turns the hull about the heart, and the ship keeps its shape", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const nose = grandTerminalScene.breakablePieces.find(
    (piece) => piece.id === `${SKY_TRAIN}:nose-cone`,
  );
  // Разворот на четверть оборота: нос уходит по дуге вокруг сердца, радиус
  // сохраняется, высота не меняется.
  const pose = { position: [0, 0, 0], yaw: Math.PI / 2, pitch: 0, roll: 0 };
  const placed = vehiclePiecePosition(frame.origin, nose.position, pose);
  const radiusBefore = Math.hypot(
    nose.position[0] - frame.origin[0],
    nose.position[2] - frame.origin[2],
  );
  const radiusAfter = Math.hypot(
    placed[0] - frame.origin[0],
    placed[2] - frame.origin[2],
  );
  assert.equal(Math.abs(radiusBefore - radiusAfter) < 1e-9, true);
  assert.equal(Math.abs(placed[1] - nose.position[1]) < 1e-9, true);
  // Нос смотрел на -x, после четверти оборота смотрит на -z.
  assert.equal(placed[2] - frame.origin[2] > radiusBefore * 0.99, true,
    `нос ушёл в ${placed.map((v) => v.toFixed(2))}`);
});

test("pitch and roll are measured on the ship, not on the world axes", () => {
  // Корпус лежит вдоль мировой X, поэтому «тангаж вокруг X» кренил бы его.
  // Проверяем по делу: куда уходит нос и куда — правый борт.
  const nose = [-1, 0, 0];
  const starboard = pitchAxisOf(nose);       // nose × up
  assert.deepEqual(starboard, [0, 0, -1]);

  const up = (pose) => rotateVector(vehicleRotation(pose, nose), nose)[1];
  // Плюс по тангажу задирает нос, минус опускает.
  assert.equal(up({ ...RESTING_POSE, pitch: 0.3 }) > 0.25, true);
  assert.equal(up({ ...RESTING_POSE, pitch: -0.3 }) < -0.25, true);
  // Крен нос не трогает вовсе.
  assert.equal(Math.abs(up({ ...RESTING_POSE, roll: 0.4 })) < 1e-9, true);

  // Плюс по крену опускает ПРАВЫЙ борт.
  const board = rotateVector(vehicleRotation({ ...RESTING_POSE, roll: 0.4 }, nose), starboard);
  assert.equal(board[1] < -0.3, true, `правый борт ушёл в ${board.map((v) => v.toFixed(2))}`);

  // Рыскание — вокруг мировой вертикали: высота носа не меняется.
  assert.equal(Math.abs(up({ ...RESTING_POSE, yaw: 1.1 })) < 1e-9, true);

  const pitched = vehicleAttitude(
    vehicleRotation({ ...RESTING_POSE, pitch: 0.3 }, nose),
    nose,
  );
  const rolled = vehicleAttitude(
    vehicleRotation({ ...RESTING_POSE, roll: -0.4 }, nose),
    nose,
  );
  assert.equal(Math.abs(pitched.pitch - 0.3) < 1e-9, true);
  assert.equal(Math.abs(pitched.roll) < 1e-9, true);
  assert.equal(Math.abs(rolled.roll + 0.4) < 1e-9, true);
  assert.equal(Math.abs(rolled.pitch) < 1e-9, true);
});

test("engine readouts are ordered left to right from the vehicle geometry", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const ordered = engineValuesPortToStarboard(
    [11, 22],
    SKY_TRAIN_LIMITS.enginePoints,
    frame.origin,
    frame.nose,
  );
  // Authored order is right, left; a human-facing L / R readout reverses it.
  assert.deepEqual(ordered, [22, 11]);
});

test("the moved ship still clears the berth it left", () => {
  // Отход вверх и в сторону моря: ни один кусок корабля не должен оказаться
  // внутри перрона, навеса или упора.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const pose = { position: [0, 14, 6], yaw: 0.15, pitch: 0.05, roll: 0.03 };
  const ship = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === SKY_TRAIN,
  );
  const berth = grandTerminalScene.breakablePieces.filter(
    (piece) => piece.clusterId === "terminal:sky-berth",
  );
  const berthTop = Math.max(
    ...berth.map((piece) => piece.position[1] + piece.size[1] / 2),
  );
  let lowest = Number.POSITIVE_INFINITY;
  for (const piece of ship) {
    const placed = vehiclePiecePosition(frame.origin, piece.position, pose);
    lowest = Math.min(lowest, placed[1] - piece.size[1] / 2);
  }
  assert.equal(lowest > berthTop, true,
    `низ корабля ${lowest.toFixed(2)} против верха причала ${berthTop.toFixed(2)}`);
});


test("the cabin sweep covers the coaches and drops the passenger on the platform", () => {
  const M = skyBerthMetrics;
  // Внутри салона — ссаживаем.
  assert.equal(isInsideCabin([M.headX, M.floorTop + 0.9, M.trackZ]), true);
  assert.equal(isInsideCabin([M.tailX, M.floorTop + 0.9, M.trackZ]), true);
  assert.equal(isInsideCabin([
    (M.cabFront + M.cabRear) / 2,
    M.floorTop + 0.9,
    M.trackZ,
  ]), true);
  // На перроне и под кораблём — нет.
  assert.equal(isInsideCabin([M.headX, M.platformTop + 1.6, M.platformZ]), false);
  assert.equal(isInsideCabin([M.headX, 0.5, M.trackZ]), false);
  // Ссаживают на перрон, у самой двери.
  assert.equal(isInsideCabin(SKY_TRAIN_PLATFORM_DROP), false);
  assert.equal(Math.abs(SKY_TRAIN_PLATFORM_DROP[0] - M.headX) < 0.5, true);
  assert.equal(
    Math.abs(SKY_TRAIN_PLATFORM_DROP[2] - M.platformZ) <= M.platformHalf, true);
  // Высадка задаёт ЦЕНТР капсулы: подошва обязана встать НА настил, а не
  // внутрь плиты. Проверяем именно подошву — на её потере игрок оказывался
  // на полметра в бетоне.
  const sole = SKY_TRAIN_PLATFORM_DROP[1] - PLAYER_CAPSULE_FOOT_OFFSET;
  assert.equal(sole >= M.platformTop, true,
    `подошва ${sole.toFixed(2)} ниже настила ${M.platformTop}`);
  assert.equal(sole - M.platformTop < 0.2, true,
    `высадка с высоты ${(sole - M.platformTop).toFixed(2)} — это падение, а не шаг`);
});

test("the driver's bay replaces most nose ballast without moving the lift centre", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const ballast = ship.find((piece) => piece.id === `${SKY_TRAIN}:ballast`);

  assert.equal(ballast.volume > 1.5 && ballast.volume < 2, true, String(ballast.volume));
  assert.equal(Math.abs(properties.centre[0] - frame.liftCentre[0]) < 0.08, true,
    `longitudinal trim error ${(properties.centre[0] - frame.liftCentre[0]).toFixed(3)} m`);
  assert.equal(Math.abs(properties.centre[2] - frame.liftCentre[2]) < 0.02, true,
    `lateral trim error ${(properties.centre[2] - frame.liftCentre[2]).toFixed(3)} m`);
});

test("the departure board you press is the departure board you see", () => {
  const board = grandTerminalScene.breakablePieces.find(
    (piece) => piece.id === "terminal:sky-berth:board-body",
  );
  assert.notEqual(board, undefined);
  assert.equal(Math.abs(SKY_TRAIN_DEPARTURE_BOARD[0] - board.position[0]) < 0.6, true);
  assert.equal(Math.abs(SKY_TRAIN_DEPARTURE_BOARD[2] - board.position[2]) < 1.2, true);
});

test("vehicle frame transforms round-trip exactly", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const poses = [
    { position: [12, 26, -8], yaw: 0.6, pitch: -0.12, roll: 0.08 },
    { position: [-40, 30, 96], yaw: -2.7, pitch: 0.05, roll: 0.14 },
    RESTING_POSE,
  ];
  const points = [
    [-6.2, 2.2, 77.6],
    [12.3, 1.6, 78.5],
    [5.6, 9.4, 77.6],
  ];
  for (const pose of poses) {
    for (const point of points) {
      const local = shipLocalPoint(point, frame.origin, pose, frame.nose);
      const back = vehiclePiecePosition(frame.origin, local, pose);
      for (const axis of [0, 1, 2]) {
        assert.equal(Math.abs(back[axis] - point[axis]) < 1e-9, true,
          `ось ${axis}: ${back[axis]} против ${point[axis]}`);
      }
    }
  }
});

test("the ride is boarded inside the head coach, at its nose", () => {
  const M = skyBerthMetrics;
  assert.equal(isInsideCabin(SKY_TRAIN_RIDE_POST), true);
  // У носового торца головного вагона, а не посреди салона.
  assert.equal(SKY_TRAIN_RIDE_POST[0] < M.headX - 3, true);
  assert.equal(SKY_TRAIN_RIDE_POST[0] > M.headX - M.carLength / 2, true);
  // И это другое место, чем табло на перроне.
  assert.equal(
    Math.hypot(
      SKY_TRAIN_RIDE_POST[0] - SKY_TRAIN_DEPARTURE_BOARD[0],
      SKY_TRAIN_RIDE_POST[2] - SKY_TRAIN_DEPARTURE_BOARD[2],
    ) > 10,
    true,
  );
  // Два маршрута: обзорный длиннее короткого круга у причала.
  assert.equal(routeLength("tour") > routeLength("circuit"), true);
});

test("the routes are closed lines with a speed profile, and nothing else", () => {
  // От сценария остались ровно две вещи: линия и путевая скорость на ней.
  for (const kind of ["circuit", "tour"]) {
    const start = routePoint(kind, 0);
    const end = routePoint(kind, 1);
    for (const axis of [0, 2]) {
      assert.equal(Math.abs(start[axis]) < 0.01, true, `${kind}: старт не у причала`);
      assert.equal(Math.abs(end[axis]) < 0.01, true, `${kind}: финиш не у причала`);
    }
    // Разгон задаётся временем после отрыва, а гашение — оставшимися
    // МЕТРАМИ: длина большого круга не должна заставлять его ползти раньше.
    assert.equal(routeSpeed(kind, 1), 0);
    assert.equal(
      routeSpeed(kind, 1 - 30 / routeLength(kind)) > 3.5,
      true,
      `${kind}: за 30 м уже ползёт`,
    );
    assert.equal(
      routeSpeed(kind, 1 - 5 / routeLength(kind)) < 1,
      true,
      `${kind}: у самого швартова ещё не гасит ход`,
    );
    assert.equal(routeSpeed(kind, 0.5) > 8, true);
    assert.equal(routeLength(kind) > 300, true, `${kind}: маршрут короче 300 м`);
  }
  // Обзорный облёт уходит от причала дальше короткого круга.
  const far = (kind) => {
    let best = 0;
    for (let s = 0; s <= 1; s += 0.01) {
      const point = routePoint(kind, s);
      best = Math.max(best, Math.hypot(point[0], point[2]));
    }
    return best;
  };
  assert.equal(far("tour") > far("circuit"), true);
});

test("the ship flies the whole route on forces alone and comes home", () => {
  // Настоящий полёт: интегрируем то же тело теми же силами, что и в игре, и
  // смотрим, пройдёт ли машина маршрут и вернётся ли на место. Ни дифферент,
  // ни крен, ни качка нигде не задаются — они получаются.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const gravity = 9.81;
  const trim = [properties.centre[0], frame.liftCentre[1], properties.centre[2]];

  const home = (state) => Math.hypot(
    state.position[0] - properties.centre[0],
    state.position[2] - properties.centre[2],
  );
  const docked = (state) => {
    const capture = mooringCapture(frame, state, properties);
    return isDockedPose(
      capture.offset,
      state.orientation,
      capture.velocity,
      state.angularVelocity,
      frame.nose,
    );
  };
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  for (const kind of ["circuit", "tour"]) {
    let state = { ...RESTING_BODY, position: properties.centre };
    let progress = 0;
    let goArounds = 0;
    let lastGoAround = -1e9;
    let maxTilt = 0;
    let maxSpeed = 0;
    let maxRouteError = 0;
    let maxFinalCrossTrack = 0;
    let maxTerminalCrossTrack = 0;
    let minTerminalSide = Number.POSITIVE_INFINITY;
    let minBerthLongitudinal = Number.POSITIVE_INFINITY;
    let rudderReversals = 0;
    let cruiseRudderReversals = 0;
    let previousRudderSign = 0;
    let simulatedSeconds = 0;
    const dt = 1 / 60;
    for (let step = 0; step < 60 * 700 && (progress < 0.999 || !docked(state)); step += 1) {
      simulatedSeconds = step * dt;
      const centre = state.position;
      const plan = flightPlan(kind, properties.centre);
      const piloted = autopilot(
        plan,
        progress,
        centre,
        state.orientation,
        state.velocity,
        state.angularVelocity,
        model,
        Math.min(1, step / (60 * 8)),
        frame.nose,
      );
      const rudderSign = Math.abs(piloted.controls.rudder) < 0.08
        ? 0
        : Math.sign(piloted.controls.rudder);
      if (rudderSign !== 0 && previousRudderSign !== 0 && rudderSign !== previousRudderSign) {
        rudderReversals += 1;
        if (
          progress < plan.finalFrom &&
          Math.hypot(state.velocity[0], state.velocity[2]) > 4
        ) {
          cruiseRudderReversals += 1;
        }
      }
      if (rudderSign !== 0) {
        previousRudderSign = rudderSign;
      }
      if (piloted.goAround && step - lastGoAround > 60 * 20) {
        progress = 0;
        goArounds += 1;
        lastGoAround = step;
      }
      const arm = rotateVector(state.orientation, [
        trim[0] - properties.centre[0],
        trim[1] - properties.centre[1],
        trim[2] - properties.centre[2],
      ]);
      const forces = [
        { force: [0, -properties.mass * gravity, 0], point: centre },
        {
          force: [
            0,
            properties.mass * gravity *
              (1 + piloted.controls.liftTrim * SKY_TRAIN_LIMITS.liftTrimRange),
            0,
          ],
          point: [centre[0] + arm[0], centre[1] + arm[1], centre[2] + arm[2]],
        },
      ];
      forces.push(
        ...shipForces(
          piloted.controls,
          centre,
          properties.centre,
          state.orientation,
          SKY_TRAIN_LIMITS,
          frame.nose,
          Math.hypot(state.velocity[0], state.velocity[2]),
        ),
      );
      // Сопротивление корпуса — анизотропное: судно идёт носом, а не боком.
      const facing = rotateVector(state.orientation, frame.nose);
      const flat = Math.hypot(facing[0], facing[2]) || 1;
      forces.push({
        force: hullDrag(state.velocity, [facing[0] / flat, facing[2] / flat], model),
        point: centre,
      });
      // Последние метры — швартовка: подтягивает по горизонтали, как в игре.
      if (progress > 0.9) {
        const capture = mooringCapture(frame, state, properties);
        if (isMooringCaptureEligible(
          capture.offset,
          state.orientation,
          frame.nose,
        )) {
          forces.push({
            force: mooringForce(
              capture.offset,
              capture.velocity,
              properties.mass,
            ),
            point: capture.point,
          });
        }
      }
      state = stepBody(
        state,
        properties,
        forces,
        { linear: 0, angular: properties.inertia[4] * 0.5 },
        dt,
      );
      const speed = Math.hypot(state.velocity[0], state.velocity[2]);
      maxSpeed = Math.max(maxSpeed, speed);
      progress = advanceRouteProgress(kind, progress, properties.centre, state.position, speed * dt);
      const route = plan.point(progress);
      const routeError = Math.hypot(
        state.position[0] - route[0],
        state.position[2] - route[2],
      );
      maxRouteError = Math.max(maxRouteError, routeError);
      if (progress >= plan.finalFrom) {
        const crossTrack = Math.abs(state.position[2] - route[2]);
        maxFinalCrossTrack = Math.max(maxFinalCrossTrack, crossTrack);
        minBerthLongitudinal = Math.min(
          minBerthLongitudinal,
          state.position[0] - properties.centre[0],
        );
        if (state.position[0] - properties.centre[0] < 20) {
          maxTerminalCrossTrack = Math.max(maxTerminalCrossTrack, crossTrack);
        }
      }
      if (
        progress >= plan.finalFrom &&
        state.position[0] - properties.centre[0] < 30
      ) {
        minTerminalSide = Math.min(
          minTerminalSide,
          state.position[2] - properties.centre[2],
        );
      }
      const nose = rotateVector(state.orientation, frame.nose);
      maxTilt = Math.max(maxTilt, Math.abs(nose[1]));
    }

    // Последние проценты добирает швартовка, поэтому проверяем подход.
    assert.equal(
      progress >= 0.99,
      true,
      `${kind}: маршрут пройден на ${(progress * 100).toFixed(0)}%, вторых кругов ${goArounds}`,
    );
    // Вернулся к причалу: физика, а не телепорт.
    assert.equal(
      home(state) < SKY_TRAIN_DOCKING.position,
      true,
      `${kind}: встал в ${home(state).toFixed(2)} м от причала; ` +
        `ошибка маршрута ${maxRouteError.toFixed(1)} м, створ ${maxFinalCrossTrack.toFixed(1)} м, ` +
        `перекладок руля ${rudderReversals}, ${simulatedSeconds.toFixed(0)} с`,
    );
    // И вёл себя как дирижабль, а не как истребитель.
    assert.equal(maxTilt < 0.5, true, `${kind}: задирался на ${maxTilt.toFixed(2)}`);
    assert.equal(maxSpeed < 30, true, `${kind}: разгонялся до ${maxSpeed.toFixed(1)} м/с`);
    // И пришёл на причал КАК НАДО: носом вдоль оси, а не боком.
    const nose2 = rotateVector(state.orientation, frame.nose);
    const aligned = (nose2[0] * -1 + nose2[2] * 0) /
      (Math.hypot(nose2[0], nose2[2]) || 1);
    assert.equal(aligned > 0.995, true, `${kind}: встал боком, совпадение курса ${aligned.toFixed(3)}`);
    assert.equal(
      maxRouteError < 18,
      true,
      `${kind}: ушёл от требования траектории на ${maxRouteError.toFixed(1)} м`,
    );
    assert.equal(
      maxFinalCrossTrack < 12,
      true,
      `${kind}: вошёл в створ с боковой ошибкой ${maxFinalCrossTrack.toFixed(1)} м`,
    );
    assert.equal(
      maxTerminalCrossTrack < 3,
      true,
      `${kind}: у конструкций перрона отклонился от оси на ${maxTerminalCrossTrack.toFixed(1)} м`,
    );
    assert.equal(
      minTerminalSide > -0.75,
      true,
      `${kind}: заход пересёк сторону вокзальной площади на ${(-minTerminalSide).toFixed(1)} м`,
    );
    assert.equal(
      minBerthLongitudinal > -0.5,
      true,
      `${kind}: проскочил место швартовки на ${(-minBerthLongitudinal).toFixed(1)} м`,
    );
    const cruiseReversalsPer100m = cruiseRudderReversals / (routeLength(kind) / 100);
    assert.equal(
      cruiseReversalsPer100m <= 1.5,
      true,
      `${kind}: рыскает — ${cruiseRudderReversals} перекладок руля ` +
        `на ${routeLength(kind).toFixed(0)} м (${rudderReversals} всего)`,
    );
    assert.equal(goArounds, 0, `${kind}: штатный рейс потребовал второй круг`);
  }
});

test("a replacement from beyond the horizon flies the shared approach and docks", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const plan = terminalArrivalPlan(properties.centre);
  const start = plan.point(0);
  const ahead = plan.point(6 / plan.length);
  const tangentLength = Math.hypot(ahead[0] - start[0], ahead[2] - start[2]) || 1;
  const tangent = [
    (ahead[0] - start[0]) / tangentLength,
    (ahead[2] - start[2]) / tangentLength,
  ];
  const localNoseLength = Math.hypot(frame.nose[0], frame.nose[2]) || 1;
  const localNose = [
    frame.nose[0] / localNoseLength,
    frame.nose[2] / localNoseLength,
  ];
  const yaw = Math.atan2(
    localNose[1] * tangent[0] - localNose[0] * tangent[1],
    localNose[0] * tangent[0] + localNose[1] * tangent[1],
  );
  const orientation = vehicleRotation(
    { position: [0, 0, 0], yaw, pitch: 0, roll: 0 },
    frame.nose,
  );
  assert.equal(Math.abs(start[0] - properties.centre[0] - 105) < 0.1, true);
  assert.equal(start[2] - properties.centre[2] >= 280, true);
  let state = {
    ...RESTING_BODY,
    position: start,
    orientation,
    velocity: [tangent[0] * 6.5, 0, tangent[1] * 6.5],
  };
  let progress = 0;
  const gravity = 9.81;
  const trim = [properties.centre[0], frame.liftCentre[1], properties.centre[2]];
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  const dt = 1 / 60;
  for (let step = 0; step < 60 * 300; step += 1) {
    const piloted = autopilot(
      plan,
      progress,
      state.position,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      model,
      1,
      frame.nose,
    );
    const liftArm = rotateVector(state.orientation, [
      trim[0] - properties.centre[0],
      trim[1] - properties.centre[1],
      trim[2] - properties.centre[2],
    ]);
    const forces = [
      { force: [0, -properties.mass * gravity, 0], point: state.position },
      {
        force: [
          0,
          properties.mass * gravity *
            (1 + piloted.controls.liftTrim * SKY_TRAIN_LIMITS.liftTrimRange),
          0,
        ],
        point: [
          state.position[0] + liftArm[0],
          state.position[1] + liftArm[1],
          state.position[2] + liftArm[2],
        ],
      },
      ...shipForces(
        piloted.controls,
        state.position,
        properties.centre,
        state.orientation,
        SKY_TRAIN_LIMITS,
        frame.nose,
        Math.hypot(state.velocity[0], state.velocity[2]),
      ),
    ];
    const facing = rotateVector(state.orientation, frame.nose);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    forces.push({
      force: hullDrag(
        state.velocity,
        [facing[0] / flat, facing[2] / flat],
        model,
      ),
      point: state.position,
    });
    if (progress > 0.9) {
      const capture = mooringCapture(frame, state, properties);
      if (isMooringCaptureEligible(
        capture.offset,
        state.orientation,
        frame.nose,
      )) {
        forces.push({
          force: mooringForce(
            capture.offset,
            capture.velocity,
            properties.mass,
          ),
          point: capture.point,
        });
      }
    }
    state = stepBody(
      state,
      properties,
      forces,
      { linear: 0, angular: properties.inertia[4] * 0.5 },
      dt,
    );
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      state.position,
      Math.hypot(state.velocity[0], state.velocity[2]) * dt,
    );
    const capture = mooringCapture(frame, state, properties);
    if (
      progress > 0.985 &&
      isDockedPose(
        capture.offset,
        state.orientation,
        capture.velocity,
        state.angularVelocity,
        frame.nose,
      )
    ) {
      break;
    }
  }

  const capture = mooringCapture(frame, state, properties);
  assert.equal(progress > 0.985, true, `arrival progress ${(progress * 100).toFixed(1)}%`);
  assert.equal(
    isDockedPose(
      capture.offset,
      state.orientation,
      capture.velocity,
      state.angularVelocity,
      frame.nose,
    ),
    true,
    `replacement stopped ${Math.hypot(
      state.position[0] - properties.centre[0],
      state.position[2] - properties.centre[2],
    ).toFixed(2)} m from berth; capture ` +
      `${capture.offset.map((value) => value.toFixed(2)).join(", ")}; ` +
      `velocity ${capture.velocity.map((value) => value.toFixed(2)).join(", ")}; ` +
      `nose ${rotateVector(state.orientation, frame.nose).map((value) => value.toFixed(2)).join(", ")}; ` +
      `angular ${state.angularVelocity.map((value) => value.toFixed(3)).join(", ")}; ` +
      `progress ${(progress * 100).toFixed(2)}%`,
  );
});

test("the engines, not our taste, decide how briskly it can go", () => {
  // Паспорт машины: полная тяга на её массу даёт вот такое ускорение. Если
  // однажды захочется, чтобы корабль ходил бодрее, менять надо тягу.
  const properties = massProperties(ship, densityOf);
  const acceleration =
    (SKY_TRAIN_LIMITS.enginePower * SKY_TRAIN_LIMITS.enginePoints.length) / properties.mass;
  assert.equal(acceleration > 0.5 && acceleration < 6, true,
    `разгон ${acceleration.toFixed(2)} м/с²`);

  // Моторы вынесены в стороны от оси — их тяга разворачивает корабль сама,
  // и потеря одного из них будет заметна.
  assert.equal(SKY_TRAIN_LIMITS.enginePoints.length, 2);
  const [left, right] = SKY_TRAIN_LIMITS.enginePoints;
  assert.equal(Math.abs(left[2] - right[2]) > 6, true, "моторы должны быть разнесены");
  // Руль — в корме, иначе у него не было бы плеча.
  assert.equal(SKY_TRAIN_LIMITS.rudderPoint[0] > 12, true);
});

test("route, autopilot and machine are three separate things", () => {
  // Разделение, ради которого всё и переписывалось: МАРШРУТ ничего не решает,
  // АВТОПИЛОТ только двигает рычаги, МАШИНА только превращает рычаги в силы.
  // Когда полёт станет ручным, заменится ровно средний слой.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const plan = flightPlan("circuit", properties.centre);

  // Маршрут — это данные: линия, разрешённая скорость, требуемая высота.
  assert.equal(typeof plan.point(0.3)[0], "number");
  assert.equal(plan.speedLimit(0.5) > 5, true);
  assert.equal(plan.altitude(0.5) > plan.altitude(1), true);
  assert.equal(plan.altitude(1), properties.centre[1]);
  assert.deepEqual(plan.point(1), properties.centre);

  // Машина без команд не создаёт сил, кроме нулевых.
  const idle = shipForces(
    IDLE_CONTROLS,
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    frame.nose,
  );
  for (const applied of idle) {
    assert.equal(Math.hypot(...applied.force) < 1e-9, true);
  }

  // Полный газ на оба мотора толкает корабль ВПЕРЁД, то есть на нос.
  const full = shipForces(
    { throttle: [1, 1], rudder: 0, liftTrim: 0 },
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    frame.nose,
  );
  const total = full.reduce(
    (sum, applied) => [sum[0] + applied.force[0], sum[1] + applied.force[1], sum[2] + applied.force[2]],
    [0, 0, 0],
  );
  assert.equal(total[0] < -SKY_TRAIN_LIMITS.enginePower, true, `тяга ушла в ${total[0]}`);

  // Реверс — не визуальный трюк винта: отрицательная команда действительно
  // создаёт силу назад и может остановить машину до швартова.
  const reverse = shipForces(
    { throttle: [-1, -1], rudder: 0, liftTrim: 0 },
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    frame.nose,
  );
  const reverseX = reverse.reduce((sum, applied) => sum + applied.force[0], 0);
  assert.equal(reverseX > SKY_TRAIN_LIMITS.enginePower, true, `реверс дал ${reverseX}`);

  // Разная тяга по бортам — это манёвр: она даёт момент относительно центра масс.
  const differential = shipForces(
    { throttle: [1, 0], rudder: 0, liftTrim: 0 },
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    frame.nose,
  );
  const moment = differential.reduce((sum, applied) => {
    const r = [
      applied.point[0] - properties.centre[0],
      applied.point[1] - properties.centre[1],
      applied.point[2] - properties.centre[2],
    ];
    return sum + (r[2] * applied.force[0] - r[0] * applied.force[2]);
  }, 0);
  assert.equal(Math.abs(moment) > 100, true, `один мотор дал момент ${moment.toFixed(0)}`);

  // Автопилот — это только положение рычагов, в пределах −1..1. И знает он о
  // машине ровно то, что ему передали.
  const piloted = autopilot(
    plan,
    0.2,
    plan.point(0.18),
    [0, 0, 0, 1],
    [0, 0, 0],
    [0, 0, 0],
    {
      mass: properties.mass,
      inertiaYaw: properties.inertia[4],
      bodyCentre: properties.centre,
      dragLinear: properties.mass * 0.22,
      dragLateral: properties.mass * 0.22 * 7,
      dragAngular: properties.inertia[4] * 0.5,
      limits: SKY_TRAIN_LIMITS,
    },
    1,
    frame.nose,
  );
  assert.equal(piloted.controls.throttle.length, SKY_TRAIN_LIMITS.enginePoints.length);
  for (const throttle of piloted.controls.throttle) {
    assert.equal(throttle >= -1 && throttle <= 1, true, `газ ${throttle}`);
  }
  assert.equal(Math.abs(piloted.controls.rudder) <= 1, true);
  assert.equal(Math.abs(piloted.controls.liftTrim) <= 1, true);
});

test("the autopilot looks ahead instead of chasing its own error", () => {
  // Предсказание — это простая математика, но именно её не хватало: машина
  // приходила в зону боком, потому что рулила от того, где она есть, а не от
  // того, где окажется.
  const properties = massProperties(ship, densityOf);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  // Идём на север со скоростью и с положительным рысканием: через несколько
  // секунд и место, и курс будут ДРУГИМИ.
  const guess = predictShip(
    [0, 20, 0],
    [0, 1],
    [0, 0, 8],
    0.15,
    { throttle: [0.5, 0.5], rudder: 0, liftTrim: 0 },
    model,
    5,
  );
  assert.equal(guess.position[1] > 20, true, `за пять секунд прошли ${guess.position[1].toFixed(1)} м`);
  // Курс за это время заметно уходит — в какую сторону, определяет знак
  // рыскания; важно, что предсказание его учитывает.
  const turned = Math.hypot(guess.heading[0] - 0, guess.heading[1] - 1);
  assert.equal(turned > 0.1, true, `курс не довернулся: ${guess.heading.map((v) => v.toFixed(2))}`);
  // Через ноль секунд предсказание — это текущее состояние.
  const now = predictShip([3, 5, 7], [1, 0], [0, 0, 0], 0, IDLE_CONTROLS, model, 0);
  assert.equal(Math.abs(now.position[0] - 3) < 1e-9, true);
  assert.equal(Math.abs(now.heading[0] - 1) < 1e-9, true);
});

test("a botched approach is a go-around, not a sideways mush", () => {
  // Окно захвата: в зону надо прийти В ПОЛОЖЕНИИ — по курсу и по скорости.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  const plan = flightPlan("circuit", properties.centre);
  const berth = plan.point(1);

  // Подходим боком и слишком быстро — обязан скомандовать второй круг.
  const sideways = autopilot(
    plan,
    0.99,
    [berth[0] + 8, berth[1], berth[2] + 4],
    [0, Math.sin(0.8), 0, Math.cos(0.8)],
    [6, 0, 4],
    [0, 0, 0],
    model,
    1,
    frame.nose,
  );
  assert.equal(sideways.goAround, true, "боком и на скорости — это промах");

  // Подходим правильно: по оси, медленно — заход принимается.
  const proper = autopilot(
    plan,
    0.99,
    [berth[0] + 6, berth[1], berth[2]],
    [0, 0, 0, 1],
    [-1.2, 0, 0],
    [0, 0, 0],
    model,
    1,
    frame.nose,
  );
  assert.equal(proper.goAround, false, "по оси и на подходной скорости — это заход");
  assert.equal(SKY_TRAIN_APPROACH.tolerance.heading < 0.6, true);
});

test("the hull resists going sideways, so the ship follows its nose", () => {
  // Из-за отсутствия этого корабль разворачивал нос, а скорость шла прежним
  // курсом: он крабился боком и «въезжал в платформу лагом».
  const properties = massProperties(ship, densityOf);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  const heading = [-1, 0];
  // Ход строго носом тормозится слабо.
  const ahead = hullDrag([-6, 0, 0], heading, model);
  // Такой же ход строго боком — заметно сильнее.
  const sideways = hullDrag([0, 0, 6], heading, model);
  assert.equal(
    Math.hypot(sideways[0], sideways[2]) > Math.hypot(ahead[0], ahead[2]) * 5,
    true,
    "боком судно почти не движется — иначе оно не пойдёт носом",
  );
  // И тормозит именно ПРОТИВ движения.
  assert.equal(ahead[0] > 0, true);
  assert.equal(sideways[2] < 0, true);
});

test("the rudder authority matches the turn the route actually needs", () => {
  // Руль был завышен восьмикратно: любая ошибка выбирала его до упора, и
  // корабль вилял хвостом, почти не продвигаясь. Проверяем баланс по машине.
  const properties = massProperties(ship, densityOf);
  const dragAngular = properties.inertia[4] * 0.5;
  const arm = Math.abs(SKY_TRAIN_LIMITS.rudderPoint[0] - properties.centre[0]);
  const holdable = (SKY_TRAIN_LIMITS.maxRudderForce * arm) / dragAngular;

  // Для собственного круга нужно v/R.
  const needed = 9 / 80;
  assert.equal(holdable > needed * 1.8, true, `запаса нет: ${holdable.toFixed(2)} против ${needed.toFixed(3)}`);
  assert.equal(holdable < needed * 6, true, `авторитет завышен: ${holdable.toFixed(2)} против ${needed.toFixed(3)}`);
});


test("the rudder works on dynamic pressure, so the approach is flown on engines", () => {
  // Перо руля даёт силу скоростным напором. На ходу оно и есть управление,
  // а на подходе, когда корабль почти встал, его нет — доворачивают моторы.
  const cruise = rudderEffectiveness(SKY_TRAIN_LIMITS.rudderReferenceSpeed, SKY_TRAIN_LIMITS);
  const crawl = rudderEffectiveness(1.5, SKY_TRAIN_LIMITS);
  assert.equal(cruise, 1, "на путевой скорости руль работает целиком");
  assert.equal(crawl < 0.05, true, `на подходе руля почти нет: ${crawl.toFixed(3)}`);
  // Квадратичность, а не линейность: половина хода — четверть силы.
  const half = rudderEffectiveness(SKY_TRAIN_LIMITS.rudderReferenceSpeed / 2, SKY_TRAIN_LIMITS);
  assert.equal(Math.abs(half - 0.25) < 1e-9, true);

  const properties = massProperties(ship, densityOf);
  const arm = [
    SKY_TRAIN_LIMITS.rudderPoint[0] - properties.centre[0],
    0,
    SKY_TRAIN_LIMITS.rudderPoint[2] - properties.centre[2],
  ];
  const fast = shipForces(
    { throttle: [0.5, 0.5], rudder: 1, liftTrim: 0 },
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    [-1, 0, 0],
    SKY_TRAIN_LIMITS.rudderReferenceSpeed,
  );
  const slow = shipForces(
    { throttle: [0.5, 0.5], rudder: 1, liftTrim: 0 },
    properties.centre,
    properties.centre,
    [0, 0, 0, 1],
    SKY_TRAIN_LIMITS,
    [-1, 0, 0],
    1.5,
  );
  const sideForce = (forces) =>
    forces.reduce((sum, applied) => sum + Math.abs(applied.force[2]), 0);
  assert.equal(sideForce(fast) > sideForce(slow) * 5, true, "на малом ходу оперение слабеет");
  assert.equal(arm.length, 3);

  // Почти стоя и поперёк створа, судно не должно разгоняться вбок в надежде
  // на оживший руль: один мотор идёт вперёд, второй назад и разворачивает его.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const plan = flightPlan("circuit", properties.centre);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  const pivot = autopilot(
    plan,
    0.99,
    plan.point(0.99),
    [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)],
    [0, 0, 0],
    [0, 0, 0],
    model,
    1,
    frame.nose,
  );
  assert.equal(
    pivot.controls.throttle[0] * pivot.controls.throttle[1] < 0,
    true,
    `нет разворота вразнос: ${pivot.controls.throttle.join(", ")}`,
  );

  // Медленно идущий по оси корабль за 30 м до причала должен ДОБИРАТЬ ход
  // двигателями, а не ждать в автонакате, пока до него дотянется лебёдка.
  const approachProgress = 1 - 30 / plan.length;
  const drivenApproach = autopilot(
    plan,
    approachProgress,
    plan.point(approachProgress),
    [0, 0, 0, 1],
    [-1, 0, 0],
    [0, 0, 0],
    model,
    1,
    frame.nose,
  );
  const averageThrottle =
    drivenApproach.controls.throttle.reduce((sum, value) => sum + value, 0) /
    drivenApproach.controls.throttle.length;
  assert.equal(
    averageThrottle > 0.4,
    true,
    `на глиссаде моторы молчат: ${drivenApproach.controls.throttle.join(", ")}`,
  );
});


test("one journey lifecycle drives every public berth state", () => {
  assert.equal(skyTrainFlightEventState(null), "docked");
  assert.equal(skyTrainFlightEventState({
    kind: "circuit",
    time: 4.9,
    castOff: false,
    progress: 0,
  }), "attention");
  assert.equal(skyTrainFlightEventState({
    kind: "circuit",
    time: SKY_TRAIN_CASTOFF_TIME,
    castOff: true,
    progress: 0,
  }), "departure");
  assert.equal(skyTrainFlightEventState({
    kind: "circuit",
    time: 40,
    castOff: true,
    progress: 0.5,
  }), "cruise");
  assert.equal(skyTrainFlightEventState({
    kind: "circuit",
    time: 80,
    castOff: true,
    progress: 0.99,
  }), "approach");
  const flight = {
    kind: "circuit",
    time: 100,
    castOff: true,
    progress: 0.7,
  };
  assert.equal(
    skyTrainFlightEventState(flight, { phase: "escape" }),
    "failed",
  );
  assert.equal(
    skyTrainFlightEventState(flight, { phase: "waiting" }),
    "failed",
  );
  assert.equal(
    skyTrainFlightEventState(flight, { phase: "arrival" }),
    "approach",
  );
});

test("arrival requires a settled terminal pose without depending on one contact sensor", () => {
  const identity = [0, 0, 0, 1];
  const still = [0, 0, 0];
  assert.equal(
    isDockingSettleWindow(0.99, [0, 6.5, 0], identity),
    false,
    "the vertical landing shelf started the timeout",
  );
  assert.equal(
    isDockingSettleWindow(0.99, [1, 0.5, 0], identity),
    true,
    "a vehicle already over the berth did not enter its settling window",
  );
  const cityTolerance = {
    ...SKY_TRAIN_DOCKING,
    position: 0.14,
    height: 0.22,
  };
  assert.equal(
    isDockingSettleWindow(
      0.99,
      [0.26, 0, 0],
      identity,
      [-1, 0, 0],
      undefined,
      cityTolerance,
    ),
    false,
    "the city timer started while the nose was still outside capture",
  );
  assert.equal(
    isDockingSettleWindow(
      0.99,
      [0.24, 0, 0],
      identity,
      [-1, 0, 0],
      undefined,
      cityTolerance,
    ),
    true,
    "the city timer missed its real mooring capture",
  );
  assert.equal(
    isDockingSettleWindow(0.99, [7, 0, 0], identity),
    false,
    "the approach was mistaken for a completed landing",
  );
  assert.equal(isDockedPose(still, identity, still, still), true);
  assert.equal(isDockedPose([0, SKY_TRAIN_DOCKING.height + 0.01, 0], identity, still, still), false);
  assert.equal(isDockedPose(still, identity, [0, SKY_TRAIN_DOCKING.verticalSpeed + 0.01, 0], still), false);
  assert.equal(
    isDockingComplete(0.98, still, identity, still, still),
    false,
    "an unfinished route was accepted",
  );
  assert.equal(isDockingComplete(0.99, still, identity, still, still), true);
});

test("mooring measures the physical nose fitting, never the body centre or ground", () => {
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);
  const still = [0, 0, 0];
  const identity = [0, 0, 0, 1];
  const atBerth = vehicleMooringState(
    frame,
    still,
    identity,
    still,
    still,
    properties.centre,
  );
  assert.equal(atBerth.offset.every((value) => Math.abs(value) < 1e-8), true);

  const yaw = 0.12;
  const turned = vehicleMooringState(
    frame,
    still,
    [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    still,
    still,
    properties.centre,
  );
  assert.equal(
    Math.hypot(turned.offset[0], turned.offset[2]) > SKY_TRAIN_DOCKING.position,
    true,
    "a centred body falsely counted as a captured nose",
  );

  const backwards = [0, 1, 0, 0];
  const backwardsAtCentre = vehicleMooringState(
    frame,
    still,
    backwards,
    still,
    still,
    properties.centre,
  );
  const backwardsAtCup = vehicleMooringState(
    frame,
    backwardsAtCentre.offset.map((value) => -value),
    backwards,
    still,
    still,
    properties.centre,
  );
  assert.equal(backwardsAtCup.offset.every((value) => Math.abs(value) < 1e-8), true);
  assert.equal(
    isMooringCaptureEligible(
      backwardsAtCup.offset,
      backwards,
      frame.nose,
    ),
    false,
    "the mast captured a nose presented from the wrong side",
  );

  const onGround = vehicleMooringState(
    frame,
    [0, -8, 0],
    identity,
    still,
    still,
    properties.centre,
  );
  assert.equal(
    isDockingComplete(
      1,
      onGround.offset,
      identity,
      onGround.velocity,
      still,
      frame.nose,
    ),
    false,
    "a ground landing was published as mast mooring",
  );
});

test("the platform lights blink the count, burn the flight and go out on arrival", () => {
  // Корабль у причала — перрон людской, огней нет.
  assert.equal(departureLightGlow("docked"), 0);

  // Отсчёт отшвартовки: мигают. Ловим и включённую фазу, и погашенную.
  const blinks = [];
  for (let t = 0; t < SKY_TRAIN_CASTOFF_TIME; t += 0.05) {
    blinks.push(departureLightGlow("attention", t) > 0);
  }
  assert.equal(blinks.includes(true) && blinks.includes(false), true, "не мигают");
  let switches = 0;
  for (let i = 1; i < blinks.length; i += 1) {
    if (blinks[i] !== blinks[i - 1]) switches += 1;
  }
  // Пять секунд отсчёта по два переключения на период.
  const expected = Math.round((SKY_TRAIN_CASTOFF_TIME / DEPARTURE_LIGHT.blinkPeriod) * 2);
  assert.equal(Math.abs(switches - expected) <= 1, true, `${switches} переключений вместо ${expected}`);

  // Весь рейс — ровный свет, без миганий.
  for (const time of [SKY_TRAIN_CASTOFF_TIME + 0.01, 20, 45, 70]) {
    assert.equal(
      departureLightGlow("cruise", time),
      DEPARTURE_LIGHT.glow,
      `на ${time} с рейса огни не горят ровно`,
    );
  }

  // Близость к причалу не означает завершённую швартовку: пока рейс активен,
  // огни остаются включены. Они гаснут только вместе с flight = null — тогда
  // же дверь становится доступна.
  assert.equal(departureLightGlow("approach", 100), DEPARTURE_LIGHT.glow);
  assert.equal(departureLightGlow("docked"), 0);
});

test("each propeller belongs to one engine, and a turn spins them apart", () => {
  // Винт показывает команду СВОЕГО мотора. Для этого ось каждого винта
  // должна однозначно сопоставляться со своей точкой тяги из паспорта.
  const hubs = new Map();
  for (const piece of ship) {
    const match = piece.id.match(/^(.*:engine:-?\d+):blade:/);
    if (!match) continue;
    const sum = hubs.get(match[1]) ?? [0, 0, 0, 0];
    hubs.set(match[1], [
      sum[0] + piece.position[0],
      sum[1] + piece.position[1],
      sum[2] + piece.position[2],
      sum[3] + 1,
    ]);
  }
  assert.equal(hubs.size, SKY_TRAIN_LIMITS.enginePoints.length, "винтов не столько, сколько моторов");

  const claimed = new Set();
  for (const [engine, sum] of hubs) {
    const hub = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    let best = -1;
    let bestDistance = Infinity;
    SKY_TRAIN_LIMITS.enginePoints.forEach((point, index) => {
      const distance =
        (point[0] - hub[0]) ** 2 + (point[1] - hub[1]) ** 2 + (point[2] - hub[2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    assert.equal(claimed.has(best), false, `${engine}: два винта на одном моторе`);
    claimed.add(best);
    // Сопоставление должно быть уверенным, а не «чуть ближе».
    const other = SKY_TRAIN_LIMITS.enginePoints[1 - best];
    const otherDistance =
      (other[0] - hub[0]) ** 2 + (other[1] - hub[1]) ** 2 + (other[2] - hub[2]) ** 2;
    assert.equal(otherDistance > bestDistance * 4, true, `${engine}: моторы неразличимы для винта`);
  }

  // А на развороте моторы работают вразнос — значит, и винты крутятся врозь.
  const properties = massProperties(ship, densityOf);
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * 0.22,
    dragLateral: properties.mass * 0.22 * 7,
    dragAngular: properties.inertia[4] * 0.5,
    limits: SKY_TRAIN_LIMITS,
  };
  const plan = flightPlan("circuit", properties.centre);
  const turning = autopilot(
    plan,
    0.3,
    plan.point(0.3),
    [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)],
    [0, 0, 0],
    [0, 0, 0],
    model,
    1,
    frame.nose,
  );
  const [left, right] = turning.controls.throttle;
  assert.equal(Math.abs(left - right) > 0.005, true, `на развороте моторы одинаковы: ${left} и ${right}`);
});


test("every route ends with a straight run-in along the berth axis", () => {
  // Замкнутый круг подводил корабль к причалу ПО ДУГЕ: он приходил, всё ещё
  // разворачиваясь, и встать вдоль перрона не мог. Последний участок обязан
  // быть прямой на оси причала.
  for (const kind of ["circuit", "tour"]) {
    const from = finalLegFrom(kind);
    assert.equal(from > 0.7 && from < 0.98, true, `${kind}: створ начинается на ${from}`);
    const entry = routePoint(kind, from);
    // Створ длиной в десятки метров, а не «последние пять».
    assert.equal(Math.abs(entry[0]) > 35, true, `${kind}: створ всего ${Math.abs(entry[0]).toFixed(0)} м`);
    assert.equal(Math.abs(entry[2]) < 0.5, true, `${kind}: створ не на оси причала`);

    let previous = entry;
    for (let step = 1; step <= 20; step += 1) {
      const s = from + ((1 - from) * step) / 20;
      const point = routePoint(kind, s);
      // Строго по оси и строго к причалу — без бокового сноса и без возврата.
      assert.equal(Math.abs(point[2]) < 0.5, true, `${kind}: на ${s.toFixed(3)} сошёл с оси на ${point[2].toFixed(2)}`);
      assert.equal(point[0] < previous[0] + 1e-6, true, `${kind}: на створе пошёл назад`);
      previous = point;
    }
    // И приходит он ровно на причал.
    const berth = routePoint(kind, 1);
    assert.equal(Math.hypot(berth[0], berth[2]) < 0.01, true, `${kind}: маршрут не замкнут`);
  }
});

test("every arrival joins the final from outside the station square", () => {
  // Южнее оси пути лежат площадь, перрон и пассажирские навесы. Последний
  // круг может быть где угодно, но в пределах 120 м от причала маршрут
  // обязан оставаться на свободной северной стороне до самого створа.
  for (const kind of ["circuit", "tour"]) {
    for (let step = 0; step <= 160; step += 1) {
      const s = 0.84 + (0.16 * step) / 160;
      const point = routePoint(kind, s);
      if (point[0] >= 120) {
        continue;
      }
      assert.equal(
        point[2] >= -0.05,
        true,
        `${kind}: посадочный маршрут ушёл в площадь на ${(-point[2]).toFixed(1)} м`,
      );
    }
  }
});

test("the route never drags the ship through the berth it just left", () => {
  // Обзорный облёт уходит в сторону карты — то есть над перроном. Значит,
  // проходить он должен ВЫШЕ всего, что там стоит: самое высокое у перрона —
  // сигнальный столб в 5 м, а низ вагонов висит на 0.94 от начала кадра.
  const TALLEST = 5;
  const BELLY = 0.94;
  const platformFrom = -3.55 - 2;   // перрон относительно оси пути, с запасом
  for (const kind of ["circuit", "tour"]) {
    for (let step = 1; step <= 200; step += 1) {
      const point = routePoint(kind, step / 200);
      const overBerth =
        point[2] < platformFrom && point[0] > -14 && point[0] < 25;
      if (!overBerth) {
        continue;
      }
      assert.equal(
        BELLY + point[1] > TALLEST + 1,
        true,
        `${kind}: на ${(step / 200).toFixed(2)} проходит над перроном, а низ вагона на ${(BELLY + point[1]).toFixed(1)} м`,
      );
    }
  }
});
