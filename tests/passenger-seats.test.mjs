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
