import assert from "node:assert/strict";
import test from "node:test";
import { createMotionRoute } from "../games/make-a-mess/src/game/motionRoute.ts";
import {
  createSkyTrainEmergencyEscapeRoute,
  finalLegFrom,
  routeLength,
  routePoint,
  SKY_TRAIN_FINAL_HEIGHT_SHELF,
  SKY_TRAIN_UNSTICK_HEIGHT,
  SKY_TRAIN_VERTICAL_LANDING_DISTANCE,
  skyTrainRoutePhase,
  skyTrainRoute,
  terminalArrivalRoute,
} from "../games/make-a-mess/src/game/skyTrainRoutes.ts";

test("a route artifact owns nodes, approach curves, requirements and markers", () => {
  const route = createMotionRoute({
    id: "test:curved-approach",
    nodes: [
      { id: "start", position: [0, 0, 0], outgoing: [3, 0, 0] },
      {
        id: "gate",
        position: [6, 0, 4],
        incoming: [6, 0, 0],
        samples: 40,
      },
      { id: "dock", position: [10, 0, 4] },
    ],
    measureAxes: [0, 2],
    requirements: {
      speed: ({ remaining }) => Math.min(6, remaining),
    },
    markers: { final: "gate" },
  });

  assert.equal(route.length > 10, true);
  assert.equal(route.point(0.25)[2] > 0, true, "кривая не поднялась к узлу");
  assert.equal(route.markerProgress("final"), route.nodeProgress("gate"));
  assert.equal(route.requirement("speed", 1), 0);
});

test("the platform flight has exactly mirrored takeoff and landing geometry", () => {
  const route = skyTrainRoute("circuit");
  assert.equal(route.id, "sky-train:circuit");

  // Разгон и створ имеют одинаковую длину и лежат на оси перрона.
  const length = routeLength("circuit");
  const outbound = routePoint("circuit", 30 / length);
  const inbound = routePoint("circuit", 1 - 30 / length);
  assert.equal(Math.abs(outbound[0] + 30) < 0.1, true, `разгон ушёл на x=${outbound[0]}`);
  assert.equal(Math.abs(inbound[0] - 30) < 0.1, true, `створ ушёл на x=${inbound[0]}`);
  assert.equal(Math.abs(outbound[2]) < 0.05, true, `разгон ушёл вбок на z=${outbound[2]}`);
  assert.equal(Math.abs(inbound[2]) < 0.05, true, `створ ушёл вбок на z=${inbound[2]}`);

  let farthest = 0;
  let farthestAt = 0;
  for (let step = 0; step <= 400; step += 1) {
    const progress = step / 400;
    const point = routePoint("circuit", progress);
    const reflected = routePoint("circuit", 1 - progress);
    assert.equal(Math.abs(point[0] + reflected[0]) < 0.02, true, `x не зеркален на ${progress}`);
    assert.equal(Math.abs(point[2] - reflected[2]) < 0.02, true, `z не зеркален на ${progress}`);

    const distance = point[2];
    if (distance > farthest) {
      farthest = distance;
      farthestAt = progress;
    }
  }
  assert.equal(Math.abs(farthest - 100) < 0.2, true, `горизонт оказался в ${farthest.toFixed(1)} м`);
  assert.equal(Math.abs(farthestAt - 0.5) < 0.005, true, `максимум не один: ${farthestAt}`);
  assert.equal(Math.abs(route.nodeProgress("horizon") - 0.5) < 1e-6, true);

  // Набор высоты и обратное снижение до посадочной полки зеркальны. Последний
  // метр — отдельная вертикальная швартовка от высоты отрыва до настила.
  const startAltitude = route.requirement("altitude", 0);
  const ceiling = route.requirement("altitude", 0.5);
  assert.equal(startAltitude, SKY_TRAIN_UNSTICK_HEIGHT);
  for (const distance of [
    SKY_TRAIN_FINAL_HEIGHT_SHELF,
    40,
    60,
    80,
    100,
    120,
  ]) {
    const climb = route.requirement("altitude", distance / length);
    const descent = route.requirement("altitude", 1 - distance / length);
    const climbFraction = (climb - startAltitude) / (ceiling - startAltitude);
    const descentFraction = (descent - startAltitude) / (ceiling - startAltitude);
    assert.equal(
      Math.abs(climbFraction - descentFraction) < 1e-6,
      true,
      `высота не зеркальна на ${distance} м`,
    );
  }
  const shelf = route.requirement("altitude", 1 - SKY_TRAIN_FINAL_HEIGHT_SHELF / length);
  const vertical = route.requirement(
    "altitude",
    1 - SKY_TRAIN_VERTICAL_LANDING_DISTANCE / 2 / length,
  );
  assert.equal(Math.abs(shelf - SKY_TRAIN_UNSTICK_HEIGHT) < 1e-6, true);
  assert.equal(vertical > 0 && vertical < SKY_TRAIN_UNSTICK_HEIGHT, true);
  assert.equal(route.requirement("altitude", 1), 0);
});

test("the boarded tour is a simple irregular orbit around the city", () => {
  const route = skyTrainRoute("tour");
  const city = [-6, -92];
  const orbitNodes = ["west", "south-west", "south", "south-east", "east", "north-east"];
  const radii = orbitNodes.map((id) => {
    const point = route.point(route.nodeProgress(id));
    return Math.hypot(point[0] - city[0], point[2] - city[1]);
  });

  assert.equal(Math.min(...radii) > 85, true, "облет режет через город");
  assert.equal(Math.max(...radii) < 190, true, "облет сорвался в дальний перегон");
  assert.equal(Math.max(...radii) - Math.min(...radii) > 40, true, "облет снова стал правильным овалом");

  const west = route.point(route.nodeProgress("west"));
  const south = route.point(route.nodeProgress("south"));
  const east = route.point(route.nodeProgress("east"));
  const northEast = route.point(route.nodeProgress("north-east"));
  assert.equal(west[0] < city[0] - 90, true);
  assert.equal(south[2] < city[1] - 90, true);
  assert.equal(east[0] > city[0] + 140, true);
  assert.equal(northEast[2] > city[1] + 50, true);

  const finalEntry = routePoint("tour", finalLegFrom("tour"));
  assert.equal(Math.abs(finalEntry[0] - 64) < 0.1, true);
  assert.equal(Math.abs(finalEntry[2]) < 0.1, true);
});

test("external arrivals enter far left and share the terminal approach", () => {
  const arrival = terminalArrivalRoute();
  assert.equal(arrival.id, "sky-train:terminal-arrival");
  assert.equal(arrival.requirement("altitude", 0), 26);
  assert.equal(arrival.requirement("altitude", 1), 0);

  const start = arrival.point(0);
  const approach = arrival.nodeProgress("right-arc");
  assert.equal(Math.abs(start[0] - 105) < 0.1, true);
  assert.equal(start[2] >= 280, true);
  for (let step = 0; step <= 20; step += 1) {
    const leadIn = arrival.point(approach * step / 20);
    assert.equal(
      Math.abs(leadIn[0] - 105) < 1e-6,
      true,
      `external lead-in left the 105 m line at ${step / 20}`,
    );
  }

  for (const kind of ["circuit", "tour"]) {
    const route = skyTrainRoute(kind);
    const routeApproach = route.nodeProgress("right-arc");
    for (let step = 0; step <= 40; step += 1) {
      const inboundProgress = step / 40;
      const routePoint = route.point(
        routeApproach + (1 - routeApproach) * inboundProgress,
      );
      const arrivalPoint = arrival.point(
        approach + (1 - approach) * inboundProgress,
      );
      assert.equal(
        Math.hypot(
          routePoint[0] - arrivalPoint[0],
          routePoint[2] - arrivalPoint[2],
        ) < 1e-6,
        true,
        `${kind} diverged from shared terminal approach at ${inboundProgress}`,
      );
    }
  }

  // Looking towards the platform, +x is its left side.
  const announced = arrival.point(arrival.markerProgress("arriving"));
  assert.equal(Math.abs(announced[0] - 105) < 0.1, true);
  assert.equal(Math.abs(announced[2] - 30) < 0.1, true);
  const final = arrival.point(arrival.markerProgress("final"));
  assert.equal(Math.abs(final[0] - 64) < 0.1, true);
  assert.equal(Math.abs(final[2]) < 0.1, true);
});

test("emergency escape starts along the actual nose and exits through authored gates", () => {
  const route = createSkyTrainEmergencyEscapeRoute({
    start: [18, 14, -12],
    forward: [3, 0, 4],
  });
  const start = route.point(0);
  const next = route.point(0.001);
  const tangent = [next[0] - start[0], next[2] - start[2]];
  const tangentLength = Math.hypot(...tangent);
  const alignment =
    (tangent[0] * 0.6 + tangent[1] * 0.8) / tangentLength;

  assert.equal(alignment > 0.995, true, `first tangent alignment=${alignment}`);
  const gate = route.point(route.markerProgress("recoveryGate"));
  assert.equal(Math.abs(gate[0] + 88) < 0.1, true);
  assert.equal(Math.abs(gate[2] - 52) < 0.1, true);
  assert.equal(route.markerProgress("disappear"), 1);
  assert.equal(route.requirement("altitude", 0), 14);
  assert.equal(route.requirement("altitude", 1), 38);
  assert.equal(route.requirement("speedLimit", 1), 8.5);
});

test("both flight routes author reusable departure, cruise and approach phases", () => {
  for (const kind of ["circuit", "tour"]) {
    const route = skyTrainRoute(kind);
    const departureComplete = route.markerProgress("departureComplete");
    const approach = route.markerProgress("final");
    assert.equal(departureComplete > 0, true);
    assert.equal(departureComplete < approach, true);
    assert.equal(skyTrainRoutePhase(kind, 0), "departure");
    assert.equal(skyTrainRoutePhase(kind, departureComplete), "cruise");
    assert.equal(skyTrainRoutePhase(kind, (departureComplete + approach) / 2), "cruise");
    assert.equal(skyTrainRoutePhase(kind, approach), "approach");
    assert.equal(skyTrainRoutePhase(kind, 1), "approach");
  }
});
