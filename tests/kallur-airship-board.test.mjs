import assert from "node:assert/strict";
import test from "node:test";
import { KALLUR_AIRSHIP_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  nearestVehicleDeparturePost,
  vehicleBaseParkedLiftCommand,
  vehicleDeparturePostActions,
  vehicleFlightTargetPost,
  vehicleHomeDeparturePost,
} from "../games/make-a-mess/src/game/vehicleDepartureBoard.ts";
import {
  isDockingComplete,
  isPlatformDockingComplete,
  isMooringCaptureEligible,
  mooringForce,
  vehiclePlatformDockState,
  vehicleRouteDockState,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  kallurAirshipPlan,
  KALLUR_AIRSHIP_SHORE_YAW,
  KALLUR_AIRSHIP_YAW,
} from "../games/make-a-mess/src/game/kallurAirshipRoutes.ts";
import {
  KALLUR_AIRSHIP_SHORE_PLACEMENT,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurAirshipPlacement.ts";
import {
  kallurAirshipPoint,
} from "../games/make-a-mess/src/game/kallurAirship.ts";
import {
  KALLUR_AIRSHIP_AXIS_Y,
  KALLUR_AIRSHIP_LENGTH,
} from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";

const posts = KALLUR_AIRSHIP_AIR_VEHICLE.departure.posts;
const summit = posts.find((post) => post.id === "summit");
const shore = posts.find((post) => post.id === "shore");
const origin = summit.berth;

test("kallur boards: two stands, call from the empty one", () => {
  assert.equal(posts.length, 2);
  assert.equal(summit.outboundKind, "down");
  assert.equal(shore.outboundKind, "up");
  assert.equal(KALLUR_AIRSHIP_AIR_VEHICLE.departure.flightKind, "down");
  assert.equal(KALLUR_AIRSHIP_AIR_VEHICLE.departure.target.cue, "kallur-uncrewed-flight");

  const atSummit = vehicleHomeDeparturePost(posts, summit.berth);
  const atShore = vehicleHomeDeparturePost(posts, shore.berth);
  assert.equal(atSummit.id, "summit");
  assert.equal(atShore.id, "shore");

  const leaveSummit = vehicleDeparturePostActions(summit, atSummit);
  assert.deepEqual(leaveSummit, [
    { id: "down", labelKey: "hint.kallurAirship.down" },
  ]);
  const callFromShore = vehicleDeparturePostActions(shore, atSummit);
  assert.deepEqual(callFromShore, [
    { id: "down", labelKey: "hint.kallurAirship.call" },
  ]);
  const callFromSummit = vehicleDeparturePostActions(summit, atShore);
  assert.deepEqual(callFromSummit, [
    { id: "up", labelKey: "hint.kallurAirship.call" },
  ]);
  assert.deepEqual(vehicleDeparturePostActions(shore, null), []);
});

test("kallur boards: height separates the two bollards", () => {
  const nearShore = nearestVehicleDeparturePost(
    posts,
    shore.point,
    2.8,
    3.8,
    2.6,
    null,
  );
  assert.equal(nearShore.id, "shore");
  const sameXzWrongHeight = nearestVehicleDeparturePost(
    posts,
    [shore.point[0], summit.point[1], shore.point[2]],
    2.8,
    3.8,
    2.6,
    null,
  );
  assert.equal(sameXzWrongHeight, null);
});

test("kallur multibase: every route selects a base with its own docking law", () => {
  assert.equal(vehicleFlightTargetPost(posts, "down")?.id, "shore");
  assert.equal(vehicleFlightTargetPost(posts, "circuit")?.id, "shore");
  assert.equal(vehicleFlightTargetPost(posts, "up")?.id, "summit");
  assert.equal(vehicleFlightTargetPost(posts, "tour")?.id, "summit");
  for (const base of posts) {
    assert.equal(base.docking.kind, "platform");
    assert.equal(base.docking.parkedLiftTrim, -0.35);
    assert.equal(base.docking.settlingStallSeconds, 6);
    assert.equal(base.docking.settlingProgressMetres, 0.01);
    assert.equal(base.docking.tolerance.position, 0.6);
  }
  assert.ok(summit.docking.approach.heading[0] < -0.9);
  assert.ok(shore.docking.approach.heading[0] > 0.99);
});

test("kallur multibase: a parked base loads the skids instead of seeking summit altitude", () => {
  for (const base of posts) {
    assert.equal(vehicleBaseParkedLiftCommand(base, 0, 0.12), -0.35);
    assert.ok(
      Math.abs(vehicleBaseParkedLiftCommand(base, 0.2, 0.12) + 0.65) < 1e-9,
      `${base.id} must dump more lift while bouncing upward`,
    );
  }
});

test("kallur dock capture: a circuit without dockHeading is identity, down aims at the shore", () => {
  const restCapture = KALLUR_AIRSHIP_AIR_VEHICLE.mooringPoint;
  const rest = {
    point: restCapture,
    offset: [0, 0, 0],
    velocity: [0, 0, 0],
  };
  const approach = KALLUR_AIRSHIP_AIR_VEHICLE.flight.approach;
  const identity = vehicleRouteDockState(rest, origin, approach, {
    point: () => origin,
    dockHeading: undefined,
  });
  assert.equal(identity.capture, rest);
  assert.equal(identity.approach, approach);

  const down = kallurAirshipPlan("down", origin);
  const shoreCapture = kallurAirshipPoint(KALLUR_AIRSHIP_SHORE_PLACEMENT, [
    0,
    KALLUR_AIRSHIP_AXIS_Y,
    KALLUR_AIRSHIP_LENGTH / 2,
  ]);
  const docked = vehicleRouteDockState(
    {
      point: shoreCapture,
      offset: shoreCapture.map((value, axis) => value - restCapture[axis]),
      velocity: [0, 0, 0],
    },
    origin,
    approach,
    down,
  );
  assert.ok(Math.hypot(docked.capture.offset[0], docked.capture.offset[2]) < 0.05);
  assert.ok(Math.abs(docked.capture.offset[1]) < 0.01);
  assert.ok(docked.approach.heading[0] > 0.99);
  assert.ok(Math.abs(docked.approach.heading[1]) < 1e-9);
});

test("kallur dock capture: up returns to the summit fitting and arms physical mooring", () => {
  const vehicle = KALLUR_AIRSHIP_AIR_VEHICLE;
  const up = kallurAirshipPlan("up", origin);
  const oneMetreOff = {
    point: [vehicle.mooringPoint[0] + 1, vehicle.mooringPoint[1], vehicle.mooringPoint[2]],
    offset: [1, 0, 0],
    velocity: [0, 0, 0],
  };
  const capture = vehicleRouteDockState(
    oneMetreOff,
    origin,
    vehicle.flight.approach,
    up,
  );

  assert.deepEqual(up.point(1), origin, "up must end at the summit carrier centre");
  assert.ok(Math.abs(capture.capture.offset[0] - 1) < 1e-9);
  assert.ok(Math.abs(capture.capture.offset[1]) < 1e-9);
  assert.ok(Math.abs(capture.capture.offset[2]) < 1e-9);
  assert.equal(
    isMooringCaptureEligible(
      capture.capture.offset,
      [0, 0, 0, 1],
      vehicle.nose,
      capture.approach,
      vehicle.flight.mooringReach,
    ),
    true,
    "the summit winch must arm on the returning approach",
  );
  const pull = mooringForce(
    capture.capture.offset,
    capture.capture.velocity,
    40,
    vehicle.flight.mooringReach,
  );
  assert.ok(pull[0] < 0, "the winch must pull the nose back into the summit fitting");

  assert.equal(
    isDockingComplete(
      1,
      [0, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 0],
      [0, 0, 0],
      vehicle.nose,
      capture.approach,
      vehicle.flight.docking,
    ),
    true,
    "the exact summit pose must complete the return flight",
  );
});

test("kallur platform docking: the route centre needs real skid support", () => {
  const vehicle = KALLUR_AIRSHIP_AIR_VEHICLE;
  for (const kind of ["down", "up"]) {
    const plan = kallurAirshipPlan(kind, origin);
    const base = vehicleFlightTargetPost(posts, kind);
    const centre = base.berth;
    const dock = vehiclePlatformDockState(
      centre,
      [0, 0, 0],
      base.berth,
      base.docking.approach,
    );
    const dockYaw = kind === "up"
      ? 0
      : KALLUR_AIRSHIP_SHORE_YAW - KALLUR_AIRSHIP_YAW;
    const orientation = [0, Math.sin(dockYaw / 2), 0, Math.cos(dockYaw / 2)];
    assert.ok(Math.hypot(...dock.capture.offset) < 1e-9, kind);
    assert.equal(
      isPlatformDockingComplete(
        1,
        dock.capture.offset,
        orientation,
        dock.capture.velocity,
        [0, 0, 0],
        0,
        vehicle.nose,
        dock.approach,
        base.docking.tolerance,
      ),
      false,
      `${kind} must not finish while still hovering above the deck`,
    );
    assert.equal(
      isPlatformDockingComplete(
        1,
        dock.capture.offset,
        orientation,
        dock.capture.velocity,
        [0, 0, 0],
        2,
        vehicle.nose,
        dock.approach,
        base.docking.tolerance,
      ),
      true,
      `${kind} must finish once the same pose is carried by both skids`,
    );
  }
});
