import assert from "node:assert/strict";
import test from "node:test";
import { kallurDocument } from "../games/make-a-mess/src/content/scenes/kallur/kallurDocument.ts";
import {
  KALLUR_AIRSHIP_DECK_TOP,
  KALLUR_AIRSHIP_PAD,
  KALLUR_AIRSHIP_PLACEMENT,
} from "../games/make-a-mess/src/content/scenes/kallur/kallurAirshipPlacement.ts";
import {
  KALLUR_AIRSHIP_ACCEPTED_REVISION,
  kallurAirshipPoint,
  KALLUR_AIRSHIP_LIFT_LOCAL,
} from "../games/make-a-mess/src/game/kallurAirship.ts";
import { kallurAirshipObject } from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";
import {
  kallurAirshipArrivalPlan,
  kallurAirshipPlan,
  kallurAirshipRoute,
  KALLUR_AIRSHIP_BERTH_ANCHOR,
  KALLUR_AIRSHIP_YAW,
} from "../games/make-a-mess/src/game/kallurAirshipRoutes.ts";
import { kallurLandscapeSampler } from "../games/make-a-mess/src/content/scenes/kallur/kallurLandscapeDocument.ts";

const airshipGroup = kallurDocument.groups.find((group) => group.id === "airship");
const berthGroup = kallurDocument.groups.find((group) => group.id === "airship-berth");

test("airship world: the accepted revision is seated as one linked cluster", () => {
  assert.equal(kallurAirshipObject.revision, KALLUR_AIRSHIP_ACCEPTED_REVISION);
  assert.ok(airshipGroup, "airship group missing");
  assert.equal(airshipGroup.supportMode, "linked");
  const ids = new Set(airshipGroup.objects.map((object) => object.id));
  for (const required of [
    "hull-skin", "heart", "trim:pitch:car", "trim:roll:car",
    "engine:l:blade", "engine:r:blade", "skid-l", "skid-r",
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

/** The berth the automation derives is the resting mass centre; the lift
 * centre is the closest authored stand-in for clearance sampling. */
const BERTH = kallurAirshipPoint(
  KALLUR_AIRSHIP_PLACEMENT,
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

test("airship route: the circuit ring clears terrain and sea by 8 m+", () => {
  const plan = kallurAirshipPlan("circuit", BERTH);
  const clearance = terrainClearanceOf(plan);
  assert.ok(clearance >= 8, `worst circuit clearance ${clearance.toFixed(1)} m`);
  const dock = plan.point(1);
  assert.ok(Math.hypot(dock[0] - BERTH[0], dock[2] - BERTH[2]) < 1,
    "the circuit must end at its berth");
});

test("airship route: tour and initial arrival stay clear too", () => {
  for (const plan of [
    kallurAirshipPlan("tour", BERTH),
    kallurAirshipArrivalPlan(BERTH),
  ]) {
    const clearance = terrainClearanceOf(plan);
    assert.ok(clearance >= 8, `${plan.id} clearance ${clearance.toFixed(1)} m`);
  }
});

test("airship route: stage markers keep the terminal grammar order", () => {
  const route = kallurAirshipRoute("circuit");
  const departure = route.markerProgress("departureComplete");
  const arriving = route.markerProgress("arriving");
  const final = route.markerProgress("final");
  assert.ok(departure > 0 && departure < arriving,
    "departure must complete before arrival begins");
  assert.ok(arriving < final && final < 1,
    "final entry must follow the arrival shoulder");
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
  // The circuit's deepest point stays well above the declared floor.
  const plan = kallurAirshipPlan("circuit", BERTH);
  let deepest = Infinity;
  for (let index = 0; index <= 256; index += 1) {
    deepest = Math.min(deepest, plan.point(index / 256)[1] - BERTH[1]);
  }
  assert.ok(deepest > envelope.minimumRelativeAltitude + 12,
    `route depth ${deepest.toFixed(1)} rides the failure floor`);
  // Machines that declare nothing keep the old shared threshold.
  assert.equal(
    vehicleFailureEnvelopeFor({}).minimumRelativeAltitude,
    DEFAULT_VEHICLE_FAILURE_ENVELOPE.minimumRelativeAltitude,
  );
});
