import assert from "node:assert/strict";
import test from "node:test";
import { kallurDocument } from "../games/make-a-mess/src/content/scenes/kallur/kallurDocument.ts";
import {
  KALLUR_AIRSHIP_DECK_TOP,
  KALLUR_AIRSHIP_PAD,
  KALLUR_AIRSHIP_PLACEMENT,
  KALLUR_AIRSHIP_SHORE_PAD,
  KALLUR_AIRSHIP_SHORE_PLACEMENT,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurAirshipPlacement.ts";
import {
  KALLUR_AIRSHIP_ACCEPTED_REVISION,
  kallurAirshipPoint,
  rotationAlongChord,
  KALLUR_AIRSHIP_LIFT_LOCAL,
} from "../games/make-a-mess/src/game/kallurAirship.ts";
import { kallurAirshipParts, kallurAirshipObject } from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";
import {
  kallurAirshipArrivalPlan,
  kallurAirshipPlan,
  kallurAirshipRoute,
  KALLUR_AIRSHIP_BERTH_ANCHOR,
  KALLUR_AIRSHIP_SHORE_ANCHOR,
  KALLUR_AIRSHIP_SHORE_NOSE_XZ,
  KALLUR_AIRSHIP_YAW,
} from "../games/make-a-mess/src/game/kallurAirshipRoutes.ts";
import { kallurLandscapeSampler } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";
import { Euler, Quaternion, Vector3 } from "three";

const airshipGroup = kallurDocument.groups.find((group) => group.id === "airship");
const berthGroup = kallurDocument.groups.find((group) => group.id === "airship-berth");
const shoreGroup = kallurDocument.groups.find((group) => group.id === "airship-shore");

test("airship world: the accepted revision is seated as one linked cluster", () => {
  assert.equal(kallurAirshipObject.revision, KALLUR_AIRSHIP_ACCEPTED_REVISION);
  assert.ok(airshipGroup, "airship group missing");
  assert.equal(airshipGroup.supportMode, "linked");
  const ids = new Set(airshipGroup.objects.map((object) => object.id));
  for (const required of [
    "hull-skin", "heart", "trim:pitch:car", "trim:roll:car",
    "engine:-1:blade:-1", "engine:-1:blade:1",
    "engine:1:blade:-1", "engine:1:blade:1",
    "skid-l", "skid-r",
    "gondola-pod", "gondola-canopy", "fin-top", "fin-bottom",
  ]) {
    assert.ok(ids.has(required), `cluster misses ${required}`);
  }
  assert.ok(airshipGroup.objects.length <= 60,
    `${airshipGroup.objects.length} ship pieces exceed the budget`);
});

test("airship world: placement, routes and pad agree on one berth", () => {
  assert.equal(KALLUR_AIRSHIP_PLACEMENT.yaw, KALLUR_AIRSHIP_YAW);
  assert.equal(KALLUR_AIRSHIP_PLACEMENT.position[0], KALLUR_AIRSHIP_BERTH_ANCHOR[0]);
  assert.equal(KALLUR_AIRSHIP_PLACEMENT.position[2], KALLUR_AIRSHIP_BERTH_ANCHOR[1]);
  assert.equal(KALLUR_AIRSHIP_PAD.yaw, KALLUR_AIRSHIP_YAW);
  assert.equal(KALLUR_AIRSHIP_PAD.center[0], KALLUR_AIRSHIP_BERTH_ANCHOR[0]);
  assert.equal(KALLUR_AIRSHIP_PAD.center[1], KALLUR_AIRSHIP_BERTH_ANCHOR[1]);
});

test("airship world: cylinders and beams follow their authored chord", () => {
  for (const part of kallurAirshipParts) {
    if (part.kind !== "cylinder" && part.kind !== "beam") continue;
    const from = kallurAirshipPoint(KALLUR_AIRSHIP_PLACEMENT, part.from);
    const to = kallurAirshipPoint(KALLUR_AIRSHIP_PLACEMENT, part.to);
    const chord = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(...chord) || 1;
    const along = chord.map((value) => value / length);
    const axis = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...rotationAlongChord(chord, KALLUR_AIRSHIP_PLACEMENT))),
    );
    const align = Math.abs(
      axis.x * along[0] + axis.y * along[1] + axis.z * along[2],
    );
    assert.ok(align > 0.995,
      `${part.id} visual axis is ${(Math.acos(Math.min(1, align)) * 180 / Math.PI).toFixed(1)}° off its chord`);
  }
});

test("airship world: skids rest exactly on the plank deck", () => {
  const skids = airshipGroup.objects.filter((object) =>
    object.id === "skid-l" || object.id === "skid-r");
  assert.equal(skids.length, 2);
  for (const skid of skids) {
    const radius = skid.size[0] / 2;
    const bottom = skid.transform.position[1] - radius;
    assert.ok(Math.abs(bottom - KALLUR_AIRSHIP_DECK_TOP) < 0.01,
      `${skid.id} bottom ${bottom} vs deck ${KALLUR_AIRSHIP_DECK_TOP}`);
  }
});

test("airship world: plank pitch equals plank size, exactly", () => {
  assert.ok(berthGroup, "berth group missing");
  const planks = berthGroup.objects.filter((object) =>
    object.id.startsWith("plank:"));
  assert.equal(planks.length, 36);
  for (const plank of planks) {
    assert.ok(Math.abs(plank.size[2] - 0.5) < 1e-9, `${plank.id} size`);
  }
  for (let index = 1; index < planks.length; index += 1) {
    const a = planks[index - 1].transform.position;
    const b = planks[index].transform.position;
    const step = Math.hypot(b[0] - a[0], b[2] - a[2]);
    assert.ok(Math.abs(step - 0.5) < 1e-6,
      `plank step ${step} between ${index - 1} and ${index}`);
  }
});

test("airship world: the shore stand sits behind spawn on the same plank law", () => {
  assert.ok(shoreGroup, "shore group missing");
  assert.equal(KALLUR_AIRSHIP_SHORE_PLACEMENT.position[0], KALLUR_AIRSHIP_SHORE_ANCHOR[0]);
  assert.equal(KALLUR_AIRSHIP_SHORE_PLACEMENT.position[2], KALLUR_AIRSHIP_SHORE_ANCHOR[1]);
  assert.equal(KALLUR_AIRSHIP_SHORE_PAD.center[0], KALLUR_AIRSHIP_SHORE_ANCHOR[0]);
  assert.equal(KALLUR_AIRSHIP_SHORE_PAD.center[1], KALLUR_AIRSHIP_SHORE_ANCHOR[1]);
  assert.ok(KALLUR_AIRSHIP_SHORE_PAD.center[1] > 88,
    "shore stand must sit behind spawn, seaward");
  const planks = shoreGroup.objects.filter((object) =>
    object.id.startsWith("plank:"));
  assert.equal(planks.length, 28);
  for (const plank of planks) {
    assert.ok(Math.abs(plank.size[2] - 0.5) < 1e-9, `${plank.id} size`);
  }
  for (let index = 1; index < planks.length; index += 1) {
    const a = planks[index - 1].transform.position;
    const b = planks[index].transform.position;
    const step = Math.hypot(b[0] - a[0], b[2] - a[2]);
    assert.ok(Math.abs(step - 0.5) < 1e-6,
      `shore plank step ${step} between ${index - 1} and ${index}`);
  }
});

/** The berth the automation derives is the resting mass centre; the lift
 * centre is the closest authored stand-in for clearance sampling. */
const BERTH = kallurAirshipPoint(
  KALLUR_AIRSHIP_PLACEMENT,
  KALLUR_AIRSHIP_LIFT_LOCAL,
);
const SHORE_BERTH = kallurAirshipPoint(
  KALLUR_AIRSHIP_SHORE_PLACEMENT,
  KALLUR_AIRSHIP_LIFT_LOCAL,
);

function terrainClearanceOf(plan) {
  let worst = Infinity;
  const samples = 512;
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const distance = progress * plan.length;
    const remaining = plan.length - distance;
    // The platform ends own their berth tolerances.
    if (distance < 42 || remaining < 42) continue;
    const point = plan.point(progress);
    const ground = Math.max(
      0,
      kallurLandscapeSampler.elevationAt(point[0], point[2]),
    );
    worst = Math.min(worst, point[1] - ground);
  }
  return worst;
}

function maxHeadingStep(plan) {
  let previous = plan.point(0);
  let previousHeading = null;
  let maxStep = 0;
  const samples = 400;
  for (let index = 1; index <= samples; index += 1) {
    const point = plan.point(index / samples);
    const heading = Math.atan2(point[0] - previous[0], point[2] - previous[2]);
    if (previousHeading !== null) {
      let delta = heading - previousHeading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      maxStep = Math.max(maxStep, Math.abs(delta));
    }
    previousHeading = heading;
    previous = point;
  }
  return maxStep;
}

test("airship route: down and up stay clear of terrain and sea by 8 m+", () => {
  for (const kind of ["down", "up", "circuit", "tour"]) {
    const plan = kallurAirshipPlan(kind, BERTH);
    const clearance = terrainClearanceOf(plan);
    assert.ok(clearance >= 8, `${kind} clearance ${clearance.toFixed(1)} m`);
  }
  const arrival = kallurAirshipArrivalPlan(BERTH);
  assert.ok(terrainClearanceOf(arrival) >= 8,
    `arrival clearance ${terrainClearanceOf(arrival).toFixed(1)} m`);
});

test("airship route: the shuttle starts and ends on the two stands", () => {
  const down = kallurAirshipPlan("down", BERTH);
  const up = kallurAirshipPlan("up", BERTH);
  const downStart = down.point(0);
  const downEnd = down.point(1);
  const upStart = up.point(0);
  const upEnd = up.point(1);
  assert.ok(Math.hypot(downStart[0] - BERTH[0], downStart[2] - BERTH[2]) < 1,
    "down must leave the summit");
  assert.ok(Math.hypot(downEnd[0] - SHORE_BERTH[0], downEnd[2] - SHORE_BERTH[2]) < 1,
    "down must dock at the shore");
  assert.ok(Math.abs(downEnd[1] - SHORE_BERTH[1]) < 0.2,
    `down end altitude ${downEnd[1]} vs shore ${SHORE_BERTH[1]}`);
  assert.ok(Math.hypot(upStart[0] - SHORE_BERTH[0], upStart[2] - SHORE_BERTH[2]) < 1,
    "up must leave the shore");
  assert.ok(Math.hypot(upEnd[0] - BERTH[0], upEnd[2] - BERTH[2]) < 1,
    "up must dock at the summit");
  assert.ok(
    Math.hypot(
      down.dockHeading[0] - KALLUR_AIRSHIP_SHORE_NOSE_XZ[0],
      down.dockHeading[1] - KALLUR_AIRSHIP_SHORE_NOSE_XZ[1],
    ) < 1e-9,
    "down docks with the shore nose",
  );
});

test("airship route: stage markers keep the shuttle grammar", () => {
  const down = kallurAirshipRoute("down");
  assert.ok(
    down.markerProgress("verticalDepartureComplete") <
      down.markerProgress("departureComplete"),
    "pad lift must finish before the west descent",
  );
  assert.ok(
    down.markerProgress("departureComplete") < down.markerProgress("arriving"),
    "departure must complete before the shore entry",
  );
  const up = kallurAirshipRoute("up");
  assert.ok(
    up.markerProgress("arriving") < up.markerProgress("final") &&
      up.markerProgress("final") < 1,
    "final entry must follow the arrival shoulder",
  );
});

test("airship route: both legs lift half a metre off the pad before rolling", () => {
  for (const kind of ["down", "up"]) {
    const plan = kallurAirshipPlan(kind, BERTH);
    const route = kallurAirshipRoute(kind);
    const departure = plan.verticalDeparture;
    const start = plan.point(0);
    assert.ok(departure, `${kind} must declare a vertical pad lift`);
    assert.ok(departure.altitude >= start[1] + 0.5,
      `${kind} pad lift ${departure.altitude - start[1]} m is short of half a metre`);
    const until = departure.until;
    assert.ok(until > 0 && until < route.markerProgress("departureComplete"));
  }
});

test("airship route: neither leg is a hairpin, and up climbs onto the nose", () => {
  for (const kind of ["down", "up"]) {
    const step = maxHeadingStep(kallurAirshipPlan(kind, BERTH));
    assert.ok(step * 180 / Math.PI < 25,
      `${kind} heading jumps ${(step * 180 / Math.PI).toFixed(1)}° — an airship cannot fly a hairpin`);
  }

  const plan = kallurAirshipPlan("up", BERTH);
  const route = kallurAirshipRoute("up");
  const length = route.length;
  const cruiseAltitude = route.requirement("altitude", 0.5);
  const climbStart = 1 - 220 / length;
  const shelf = 1 - 80 / length;
  assert.ok(
    route.requirement("altitude", shelf) - route.requirement("altitude", climbStart) > 20,
    "the climb must rise from the sea-level ring toward the summit",
  );
  assert.ok(cruiseAltitude < -40, `cruise sits at ${cruiseAltitude.toFixed(1)} m, not on the summit`);

  const end = plan.point(1);
  const before = plan.point(plan.finalFrom);
  const run = [end[0] - before[0], end[2] - before[2]];
  const runLength = Math.hypot(...run) || 1;
  const nose = [
    Math.sin(KALLUR_AIRSHIP_YAW),
    Math.cos(KALLUR_AIRSHIP_YAW),
  ];
  assert.ok(
    (run[0] * nose[0] + run[1] * nose[1]) / runLength > 0.995,
    "the final glide must follow the parked nose axis",
  );
});

test("airship route: both stands use the terminal height shelf and vertical touchdown", () => {
  for (const kind of ["down", "up"]) {
    const plan = kallurAirshipPlan(kind, BERTH);
    const end = plan.point(1);
    const at = (remaining) => plan.point(1 - remaining / plan.length);
    for (const remaining of [62, 20, 1]) {
      assert.ok(
        Math.abs(at(remaining)[1] - end[1] - 6.5) < 0.02,
        `${kind} is not level over the pad at ${remaining} m`,
      );
    }
    const halfwayDown = at(0.5)[1] - end[1];
    assert.ok(halfwayDown > 2.8 && halfwayDown < 3.7,
      `${kind} final metre does not own the vertical touchdown: ${halfwayDown}`);
  }
});

test("airship safety: the floor is the world surface, not the summit berth", async () => {
  const { KALLUR_AIRSHIP_AIR_VEHICLE } = await import(
    "../games/make-a-mess/src/game/airVehicles.ts"
  );
  const { vehicleFailureEnvelopeFor, DEFAULT_VEHICLE_FAILURE_ENVELOPE } =
    await import("../games/make-a-mess/src/game/vehicleFailure.ts");
  const envelope = vehicleFailureEnvelopeFor(KALLUR_AIRSHIP_AIR_VEHICLE.flight);
  // Body altitude is measured from the mountain-top rest pose: the safe
  // floor must reach the sea surface and a little below it.
  assert.ok(envelope.minimumRelativeAltitude <= -KALLUR_AIRSHIP_DECK_TOP - 4,
    `floor ${envelope.minimumRelativeAltitude} does not clear the summit berth`);
  // Cruise stays well above the floor; the shore landing is the world
  // surface by design and is not a failure.
  const plan = kallurAirshipPlan("down", BERTH);
  let deepest = Infinity;
  for (let index = 0; index <= 256; index += 1) {
    const progress = index / 256;
    const distance = progress * plan.length;
    const remaining = plan.length - distance;
    if (distance < 42 || remaining < 42) continue;
    deepest = Math.min(deepest, plan.point(progress)[1] - BERTH[1]);
  }
  assert.ok(deepest > envelope.minimumRelativeAltitude + 12,
    `route depth ${deepest.toFixed(1)} rides the failure floor`);
  // Machines that declare nothing keep the old shared threshold.
  assert.equal(
    vehicleFailureEnvelopeFor({}).minimumRelativeAltitude,
    DEFAULT_VEHICLE_FAILURE_ENVELOPE.minimumRelativeAltitude,
  );
});
