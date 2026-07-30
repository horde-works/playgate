import assert from "node:assert/strict";
import test from "node:test";
import {
  interIslandArrivalKind,
  interIslandArrivalEntryHeading,
  interIslandArrivalOrigin,
  interIslandArrivalPlan,
  interIslandArrivalRequest,
  interIslandDeparturePhase,
  interIslandDeparturePlan,
  interIslandTransferAction,
  interIslandTransferDestination,
} from "../games/make-a-mess/src/game/interIslandRoutes.ts";
import { vehicleFrameForCluster } from "../games/make-a-mess/src/game/vehicleFrames.ts";

const BERTH = [0, 0, 0];

test("only the available Town and Village transfer actions resolve", () => {
  assert.equal(interIslandTransferAction("viking-village"), "transfer:viking-village");
  assert.equal(
    interIslandTransferDestination("town", "transfer:viking-village"),
    "viking-village",
  );
  assert.equal(interIslandTransferDestination("town", "transfer:astana"), null);
  assert.equal(interIslandTransferDestination("town", "tour"), null);
  assert.equal(interIslandArrivalOrigin(interIslandArrivalKind("town")), "town");
  assert.deepEqual(interIslandArrivalRequest("town", "viking-village"), {
    origin: "viking-village",
    flightKind: "arrival:viking-village",
  });
  assert.equal(interIslandArrivalRequest("town", "astana"), null);
});

function unitDirection(from, to) {
  const x = to[0] - from[0];
  const z = to[2] - from[2];
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}

function assertChartEntryAndStraightFinal(
  arrival,
  origin,
  destination,
  clusterId,
) {
  const dock = arrival.point(1);
  const entry = arrival.point(0);
  const chartHeading = interIslandArrivalEntryHeading(origin, destination);
  const entryDirection = unitDirection(dock, entry);
  assert.ok(
    entryDirection[0] * chartHeading[0] + entryDirection[1] * chartHeading[2] > 0.995,
    `${arrival.id} enters from the wrong compass side`,
  );

  const finalEntry = arrival.point(arrival.finalFrom);
  const finalMid = arrival.point((arrival.finalFrom + 1) / 2);
  const finalDirection = unitDirection(finalEntry, dock);
  const nose = vehicleFrameForCluster(clusterId)?.nose;
  assert.ok(nose, `${clusterId} frame is missing`);
  assert.ok(
    finalDirection[0] * nose[0] + finalDirection[1] * nose[2] > 0.999,
    `${arrival.id} final is not aligned with the docked nose`,
  );
  assert.ok(
    Math.hypot(finalEntry[0] - dock[0], finalEntry[2] - dock[2]) >= 109,
    `${arrival.id} final glide is too short`,
  );
  const crossTrack = Math.abs(
    (finalMid[0] - finalEntry[0]) * finalDirection[1] -
      (finalMid[2] - finalEntry[2]) * finalDirection[0],
  );
  assert.ok(crossTrack < 1e-6, `${arrival.id} bends on final glide`);
  assert.ok(arrival.altitude(arrival.finalFrom) > 25);
  assert.equal(arrival.altitude(1), 0);
}

test("Town leaves its western berth, clears the island and exits north", () => {
  const route = interIslandDeparturePlan("town", "viking-village", BERTH);
  const reverse = route.point(0.05);
  const beforeBoundary = route.point(0.99);
  const boundary = route.point(1);

  assert.equal(reverse[2] < 0, true, "the mast was not cleared in reverse");
  assert.equal(boundary[2] > 200, true, "the route did not reach the northern fog");
  assert.equal(boundary[0] < -80, true, "the route cut back through the city");
  assert.equal(
    boundary[2] - beforeBoundary[2] > Math.abs(boundary[0] - beforeBoundary[0]) * 8,
    true,
    "the boundary tangent is not northbound",
  );
  assert.equal(interIslandDeparturePhase("town", "viking-village", 0), "departure");
  assert.equal(interIslandDeparturePhase("town", "viking-village", 1), "cruise");
});

test("Viking Village leaves through its southern sea and Town arrives from the north", () => {
  const departure = interIslandDeparturePlan("viking-village", "town", BERTH);
  const departureEnd = departure.point(1);
  assert.equal(departureEnd[2] < -215, true);

  const arrival = interIslandArrivalPlan("viking-village", "town", BERTH);
  assert.equal(arrival.point(0)[2] > 40, true, "Town arrival did not enter from the north");
  assert.deepEqual(arrival.point(1), [0, 0, 0]);
  assertChartEntryAndStraightFinal(
    arrival,
    "viking-village",
    "town",
    "sky-mooring:airship",
  );
});

test("Town enters Viking Village from the south and finishes at the authored berth", () => {
  const arrival = interIslandArrivalPlan("town", "viking-village", BERTH);
  assert.equal(arrival.point(0)[2] < -185, true);
  assert.deepEqual(arrival.point(1), [0, 0, 0]);
  assert.equal(arrival.altitude(0), 30);
  assert.equal(arrival.altitude(1), 0);
  assertChartEntryAndStraightFinal(
    arrival,
    "town",
    "viking-village",
    "viking-village:sky-longship",
  );
});
