import assert from "node:assert/strict";
import test from "node:test";
import { grandTerminalScene } from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import {
  SKY_TRAIN_DRIVER_SEAT,
  passengerSeatContextAction,
  passengerSeatForId,
  passengerSeatIsIntact,
  passengerSeatViewYaw,
  passengerSeatWorldMotion,
  passengerSeatWorldPoint,
} from "../games/make-a-mess/src/game/passengerSeats.ts";
import {
  RESTING_POSE,
  isInsideCabin,
  vehicleFrames,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";

const frame = vehicleFrames.find((candidate) => candidate.clusterId === "terminal:sky-train");
assert.ok(frame);

function carrier(pose = RESTING_POSE) {
  return {
    clusterId: frame.clusterId,
    origin: frame.origin,
    nose: frame.nose,
    pose,
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    centreOfMass: frame.origin,
  };
}

test("the driver's place is a reusable seat owned by the moving cluster", () => {
  const seat = passengerSeatForId(SKY_TRAIN_DRIVER_SEAT.id);
  assert.equal(seat, SKY_TRAIN_DRIVER_SEAT);
  assert.equal(seat.carrierClusterId, frame.clusterId);
  assert.equal(isInsideCabin(seat.interactionPoint), true);
  assert.equal(isInsideCabin(seat.occupantPoint), true);
  assert.equal(isInsideCabin(seat.exitPoint), true);

  const pieceIds = new Set(grandTerminalScene.breakablePieces.map((piece) => piece.id));
  assert.equal(seat.requiredPieceIds.every((id) => pieceIds.has(id)), true);
  assert.equal(passengerSeatIsIntact(seat, new Set()), true);
  assert.equal(passengerSeatIsIntact(seat, new Set([seat.requiredPieceIds[1]])), false);
});

test("seat and exit follow any carrier pose instead of the airship route", () => {
  const pose = {
    position: [18, 7, -31],
    yaw: 0.4,
    pitch: 0.08,
    roll: -0.11,
  };
  const movedCarrier = carrier(pose);
  const occupied = passengerSeatWorldPoint(movedCarrier, SKY_TRAIN_DRIVER_SEAT.occupantPoint);
  const exit = passengerSeatWorldPoint(movedCarrier, SKY_TRAIN_DRIVER_SEAT.exitPoint);
  const authoredDistance = Math.hypot(
    SKY_TRAIN_DRIVER_SEAT.occupantPoint[0] - SKY_TRAIN_DRIVER_SEAT.exitPoint[0],
    SKY_TRAIN_DRIVER_SEAT.occupantPoint[1] - SKY_TRAIN_DRIVER_SEAT.exitPoint[1],
    SKY_TRAIN_DRIVER_SEAT.occupantPoint[2] - SKY_TRAIN_DRIVER_SEAT.exitPoint[2],
  );
  assert.equal(Math.abs(Math.hypot(
    occupied[0] - exit[0],
    occupied[1] - exit[1],
    occupied[2] - exit[2],
  ) - authoredDistance) < 1e-9, true);
  assert.equal(Math.abs(passengerSeatViewYaw(SKY_TRAIN_DRIVER_SEAT, carrier()) - Math.PI / 2) < 1e-9, true);
});

test("leaving a seat inherits translation and carrier yaw as one motion", () => {
  const movingCarrier = {
    ...carrier(),
    linearVelocity: [3, 1, -2],
    angularVelocity: [0.2, 0.5, -0.1],
    centreOfMass: [5, 6, 7],
  };
  const motion = passengerSeatWorldMotion(movingCarrier, [7, 8, 10]);
  assert.deepEqual(motion.linearVelocity, { x: 4.7, y: 0.19999999999999996, z: -2.6 });
  assert.equal(motion.yawVelocity, 0.5);
});

test("one contextual seat action replaces the previous one as state changes", () => {
  const base = {
    seat: SKY_TRAIN_DRIVER_SEAT,
    occupiedSeatId: null,
    passengerInsideCarrier: true,
    distance: 0.5,
    keepApproach: false,
    intact: true,
  };
  // Before the tour the nose point belongs to "take the tour", not the seat.
  assert.equal(passengerSeatContextAction({ ...base, carrierActive: false }), null);
  // Once underway, the same place offers exactly one new action.
  assert.equal(passengerSeatContextAction({ ...base, carrierActive: true }), "seat");
  // Occupation is symmetric and no longer depends on distance or motion.
  assert.equal(passengerSeatContextAction({
    ...base,
    carrierActive: false,
    passengerInsideCarrier: false,
    distance: Infinity,
    occupiedSeatId: SKY_TRAIN_DRIVER_SEAT.id,
  }), "stand");
  // A destroyed place cannot hold or invite a passenger.
  assert.equal(passengerSeatContextAction({
    ...base,
    carrierActive: true,
    intact: false,
  }), null);
});

test("пилот покидает коптер наружу: за габарит колец, подошвы на землю", async () => {
  const { TOWN_HEXACOPTER_PILOT_SEAT } = await import(
    "../games/make-a-mess/src/game/passengerSeats.ts"
  );
  const {
    HEXACOPTER_DUCTS,
    HEXACOPTER_GEAR_STATIONS,
    HEX_ARM_RADIUS,
    HEX_LIP_OUTER_RADIUS,
  } = await import("../games/make-a-mess/src/game/townHexacopter.ts");
  // Машина живёт на полигоне, поэтому и меряем в её мире, а не в городе,
  // из которого она уехала.
  const {
    RANGE_HEXACOPTER_PAD_X,
    RANGE_HEXACOPTER_PAD_Z,
    RANGE_HEXACOPTER_PAD_TOP_Y,
    rangeHexacopterPoint,
  } = await import("../games/make-a-mess/src/game/rangeHexacopter.ts");
  const { PLAYER_CAPSULE_FOOT_OFFSET, PLAYER_CAPSULE_RADIUS } = await import(
    "../games/make-a-mess/src/game/playerMovement.ts"
  );

  const exit = TOWN_HEXACOPTER_PILOT_SEAT.exitPoint;
  // Снаружи машины: дальше внешней кромки колец плюс радиус капсулы.
  const fromCentre = Math.hypot(
    exit[0] - RANGE_HEXACOPTER_PAD_X,
    exit[2] - RANGE_HEXACOPTER_PAD_Z,
  );
  assert.ok(
    fromCentre > HEX_ARM_RADIUS + HEX_LIP_OUTER_RADIUS + PLAYER_CAPSULE_RADIUS,
    `выход на ${fromCentre.toFixed(2)} м от оси — внутри габарита машины`,
  );
  // Капсула не рождается в губе ни одного кольца.
  for (const duct of HEXACOPTER_DUCTS) {
    const centre = rangeHexacopterPoint(duct.a, duct.b, 0);
    const clearance =
      Math.hypot(exit[0] - centre[0], exit[2] - centre[2]) -
      HEX_LIP_OUTER_RADIUS;
    assert.ok(
      clearance > PLAYER_CAPSULE_RADIUS,
      `кольцо ${duct.index}: зазор ${clearance.toFixed(2)} м меньше капсулы`,
    );
  }
  // И ни в одной стойке шасси.
  for (const leg of HEXACOPTER_GEAR_STATIONS) {
    const centre = rangeHexacopterPoint(leg.a, leg.b, 0);
    assert.ok(
      Math.hypot(exit[0] - centre[0], exit[2] - centre[2]) >
        PLAYER_CAPSULE_RADIUS,
      "выход совпал со стойкой шасси",
    );
  }
  // Подошвы на земле под машиной, а не на полу кабины и не в воздухе.
  const feet = exit[1] - PLAYER_CAPSULE_FOOT_OFFSET;
  assert.ok(
    Math.abs(feet - RANGE_HEXACOPTER_PAD_TOP_Y) < 0.1,
    `подошвы на ${feet.toFixed(2)} при земле ${RANGE_HEXACOPTER_PAD_TOP_Y}`,
  );
  // У кресла пилота своя подсказка, не вагонная.
  assert.equal(TOWN_HEXACOPTER_PILOT_SEAT.hintCue, "town-hexacopter-pilot-seat");
});

/**
 * ДЕТЕКТОР ОСТАВЛЕННОГО ЯКОРЯ.
 *
 * Кресло авторизовано в координатах покоя машины, поэтому переезд машины на
 * другую карту обязан унести и его. Проверка ловит именно расхождение: место
 * пилота должно лежать внутри объёма своей машины, а выход — рядом с ней, а не
 * там, где машина стояла в прошлой жизни. Так на полигоне Tonkawa кресло HX-6
 * осталось в городских координатах, и «взять управление» уносило человека за
 * кромку мира на 40 м от машины.
 */
test("место пилота и выход остаются при машине, где бы она ни стояла", async () => {
  const {
    TOWN_HEXACOPTER_PILOT_SEAT,
    NIMBUS_HEXACOPTER_PILOT_SEAT,
  } = await import("../games/make-a-mess/src/game/passengerSeats.ts");
  const { isInsideRangeHexacopter } = await import(
    "../games/make-a-mess/src/game/rangeHexacopter.ts"
  );
  const { isInsideNimbusHexacopter } = await import(
    "../games/make-a-mess/src/game/nimbusHexacopter.ts"
  );

  for (const [seat, contains] of [
    [TOWN_HEXACOPTER_PILOT_SEAT, isInsideRangeHexacopter],
    [NIMBUS_HEXACOPTER_PILOT_SEAT, isInsideNimbusHexacopter],
  ]) {
    const carrierFrame = vehicleFrames.find(
      (candidate) => candidate.clusterId === seat.carrierClusterId,
    );
    assert.ok(carrierFrame, `у кресла ${seat.id} нет машины`);
    assert.equal(
      contains(seat.interactionPoint),
      true,
      `${seat.id}: предложение сесть не в кабине`,
    );
    assert.equal(
      contains(seat.occupantPoint),
      true,
      `${seat.id}: пилот садится вне кабины`,
    );
    // Выход намеренно СНАРУЖИ, но в шаге от машины: это дверь, а не телепорт.
    const exitReach = Math.hypot(
      seat.exitPoint[0] - carrierFrame.origin[0],
      seat.exitPoint[2] - carrierFrame.origin[2],
    );
    assert.equal(
      contains(seat.exitPoint),
      false,
      `${seat.id}: выход внутри кабины`,
    );
    assert.ok(
      exitReach < 5,
      `${seat.id}: выход в ${exitReach.toFixed(2)} м от машины`,
    );
  }
});

/**
 * МАШИНА, ОБЕЩАВШАЯ РУЧНОЕ УПРАВЛЕНИЕ, ОБЯЗАНА ЕГО ДАВАТЬ.
 *
 * Дефект, ради которого написан тест: общий покадровый контур спрашивал ИМЯ
 * одного конкретного кресла, поэтому ручное управление получал только коптер
 * города. У коптера Нимба кабина та же, идентификатор свой, а паспорт
 * предлагает `manual` и на вылет, и на поездку — то есть машина обещала то,
 * чего не давала, и заметить это было нечем: геометрию кресла тест проверял,
 * а способность — никто.
 *
 * Проверка идёт от ПАСПОРТА к креслу, а не наоборот: список машин, которым
 * ручное управление обещано, собирается из их собственных действий вылета.
 */
test("у каждой машины, предлагающей manual, есть кресло с управлением", async () => {
  const { airVehicles } = await import(
    "../games/make-a-mess/src/game/airVehicles.ts"
  );
  const { rotorcraftControlSeatForCluster, seatCommandsRotorcraft } =
    await import("../games/make-a-mess/src/game/passengerSeats.ts");

  const promisesManual = (vehicle) =>
    (vehicle.departure?.target?.actions ?? []).some(
      (action) => action.id === "manual",
    ) ||
    (vehicle.passengerFlight?.target?.actions ?? []).some(
      (action) => action.id === "manual",
    );

  const promised = airVehicles.filter(promisesManual);
  assert.ok(promised.length >= 2, "тест потерял машины с ручным управлением");
  for (const vehicle of promised) {
    const seat = rotorcraftControlSeatForCluster(vehicle.clusterId);
    assert.ok(
      seat,
      `${vehicle.id}: паспорт предлагает manual, а кресла управления нет`,
    );
    assert.equal(
      seatCommandsRotorcraft(seat.id),
      true,
      `${seat.id}: кресло найдено, но управление не объявлено`,
    );
  }
});

test("место управления ищется по машине и не путает соседние", async () => {
  const {
    rotorcraftControlSeatForCluster,
    seatCommandsRotorcraft,
    TOWN_HEXACOPTER_PILOT_SEAT,
    NIMBUS_HEXACOPTER_PILOT_SEAT,
    SKY_TRAIN_DRIVER_SEAT,
    TOWN_DS_DRIVER_SEAT,
  } = await import("../games/make-a-mess/src/game/passengerSeats.ts");

  assert.equal(
    rotorcraftControlSeatForCluster(TOWN_HEXACOPTER_PILOT_SEAT.carrierClusterId)
      ?.id,
    TOWN_HEXACOPTER_PILOT_SEAT.id,
  );
  assert.equal(
    rotorcraftControlSeatForCluster(
      NIMBUS_HEXACOPTER_PILOT_SEAT.carrierClusterId,
    )?.id,
    NIMBUS_HEXACOPTER_PILOT_SEAT.id,
  );
  // Машинист состава и водитель ситроена — тоже места управления, но их ведут
  // ДРУГИЕ системы. Общий признак свёл бы их в один контур, поэтому признак
  // узкий и здесь обязан молчать.
  assert.equal(seatCommandsRotorcraft(SKY_TRAIN_DRIVER_SEAT.id), false);
  assert.equal(seatCommandsRotorcraft(TOWN_DS_DRIVER_SEAT.id), false);
  assert.equal(
    rotorcraftControlSeatForCluster(SKY_TRAIN_DRIVER_SEAT.carrierClusterId),
    null,
  );
  // Незанятое место и мусор не должны давать управление.
  assert.equal(seatCommandsRotorcraft(null), false);
  assert.equal(seatCommandsRotorcraft("no-such-seat"), false);
  assert.equal(rotorcraftControlSeatForCluster(null), null);
});
