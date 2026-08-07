import assert from "node:assert/strict";
import test from "node:test";
import {
  NIMBUS_HEXACOPTER_AIR_VEHICLE,
  TOWN_HEXACOPTER_AIR_VEHICLE,
  airVehicles,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  NIMBUS_HEXACOPTER_PILOT_SEAT,
} from "../games/make-a-mess/src/game/passengerSeats.ts";
import {
  NIMBUS_HEXACOPTER_SOURCE_PIECE_COUNT,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusHexacopter.ts";
import {
  NIMBUS_ATMOSPHERIC_BASE_Y,
  NIMBUS_ATMOSPHERIC_ROOF_Y,
  NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusAtmosphericTower.ts";
import {
  NIMBUS_HEXACOPTER_CLUSTER_ID,
  NIMBUS_HEXACOPTER_NOSE,
  NIMBUS_HEXACOPTER_ORIGIN,
  NIMBUS_HEXACOPTER_PAD_CENTRE,
  NIMBUS_HEXACOPTER_PAD_ID,
  NIMBUS_HEXACOPTER_PAD_TOP_Y,
} from "../games/make-a-mess/src/game/nimbusHexacopter.ts";
import {
  NIMBUS_HEXACOPTER_ALTITUDE_FULL,
  NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
  NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS,
  NIMBUS_HEXACOPTER_INNER_RADIUS,
  NIMBUS_HEXACOPTER_OUTER_RADIUS,
  nimbusHexacopterPlan,
  nimbusHexacopterRoute,
} from "../games/make-a-mess/src/game/nimbusHexacopterRoutes.ts";
import {
  TOWN_HEXACOPTER_CLUSTER_ID,
} from "../games/make-a-mess/src/game/townHexacopter.ts";
import { nimbusScene } from "../games/make-a-mess/src/game/nimbusScene.ts";
// Оригинал HX-6 переехал на полигон Tonkawa (фишка №1) — эталон для сверки
// копии причала живёт теперь там, id кластера и кусков сохранены.
import { combatHexacopterRangeScene } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import { vehicleRouteHeading } from "../games/make-a-mess/src/game/vehicleFrames.ts";

const nimbusShip = nimbusScene.breakablePieces.filter(
  (piece) => piece.clusterId === NIMBUS_HEXACOPTER_CLUSTER_ID,
);
const townShip = combatHexacopterRangeScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_HEXACOPTER_CLUSTER_ID,
);
const plan = nimbusHexacopterPlan("circuit", NIMBUS_HEXACOPTER_ORIGIN);
const route = nimbusHexacopterRoute("circuit", NIMBUS_HEXACOPTER_ORIGIN);

test("Nimbus receives a second HX-6 without removing the town aircraft", () => {
  assert.equal(townShip.length, NIMBUS_HEXACOPTER_SOURCE_PIECE_COUNT);
  assert.equal(nimbusShip.length, NIMBUS_HEXACOPTER_SOURCE_PIECE_COUNT);
  assert.ok(nimbusShip.length > 500, `Nimbus HX-6 pieces: ${nimbusShip.length}`);
  assert.notEqual(NIMBUS_HEXACOPTER_CLUSTER_ID, TOWN_HEXACOPTER_CLUSTER_ID);
  assert.ok(airVehicles.includes(TOWN_HEXACOPTER_AIR_VEHICLE));
  assert.ok(airVehicles.includes(NIMBUS_HEXACOPTER_AIR_VEHICLE));
});

test("the Nimbus aircraft occupies the existing production assembly pad", () => {
  assert.equal(NIMBUS_HEXACOPTER_PAD_ID, "production-assembly");
  const deck = nimbusScene.breakablePieces.find((piece) =>
    piece.id.includes(`:hex-flight-pads:${NIMBUS_HEXACOPTER_PAD_ID}:deck:`));
  assert.ok(deck);
  assert.ok(Math.hypot(
    deck.position[0] - NIMBUS_HEXACOPTER_PAD_CENTRE[0],
    deck.position[2] - NIMBUS_HEXACOPTER_PAD_CENTRE[1],
  ) < 1e-6);
  assert.ok(Math.abs(deck.position[1] + deck.size[1] / 2
    - NIMBUS_HEXACOPTER_PAD_TOP_Y) < 1e-6);
  assert.ok(Math.hypot(
    NIMBUS_HEXACOPTER_ORIGIN[0] - NIMBUS_HEXACOPTER_PAD_CENTRE[0],
    NIMBUS_HEXACOPTER_ORIGIN[2] - NIMBUS_HEXACOPTER_PAD_CENTRE[1],
  ) < 0.1);
  assert.equal(nimbusScene.breakablePieces.filter((piece) =>
    piece.id.includes(`:${NIMBUS_HEXACOPTER_PAD_ID}:hx6-socket:`)).length, 2);
});

test("the pilot seat and its physical pieces belong to the Nimbus aircraft", () => {
  assert.equal(
    NIMBUS_HEXACOPTER_PILOT_SEAT.carrierClusterId,
    NIMBUS_HEXACOPTER_CLUSTER_ID,
  );
  const ids = new Set(nimbusShip.map((piece) => piece.id));
  for (const required of NIMBUS_HEXACOPTER_PILOT_SEAT.requiredPieceIds) {
    assert.ok(ids.has(required), required);
  }
});

test("the survey route completes the inner ring before the outer ring", () => {
  const markers = [
    "departureComplete",
    "innerComplete",
    "outerStart",
    "outerComplete",
    "arriving",
    "final",
  ].map((marker) => route.markerProgress(marker));
  for (let index = 1; index < markers.length; index += 1) {
    assert.ok(markers[index - 1] < markers[index]);
  }

  const radialRange = (from, to) => {
    const radii = [];
    for (let sample = 0; sample <= 240; sample += 1) {
      const point = plan.point(from + (to - from) * sample / 240);
      radii.push(Math.hypot(point[0], point[2]));
    }
    return [Math.min(...radii), Math.max(...radii)];
  };
  const inner = radialRange(markers[0], markers[1]);
  const outer = radialRange(markers[2], markers[3]);
  assert.ok(Math.abs(inner[0] - NIMBUS_HEXACOPTER_INNER_RADIUS) < 0.1);
  assert.ok(Math.abs(inner[1] - NIMBUS_HEXACOPTER_INNER_RADIUS) < 0.1);
  assert.ok(Math.abs(outer[0] - NIMBUS_HEXACOPTER_OUTER_RADIUS) < 0.1);
  assert.ok(Math.abs(outer[1] - NIMBUS_HEXACOPTER_OUTER_RADIUS) < 0.1);
  assert.ok(NIMBUS_HEXACOPTER_OUTER_RADIUS + 9 < nimbusScene.boundaryRadius);
});

test("the route uses one-third through full atmospheric-tower height", () => {
  assert.equal(
    NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
    NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT / 3,
  );
  assert.equal(
    NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS,
    NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT * 2 / 3,
  );
  assert.equal(NIMBUS_HEXACOPTER_ALTITUDE_FULL, NIMBUS_ATMOSPHERIC_ROOF_Y);

  const innerStart = route.markerProgress("departureComplete");
  const innerComplete = route.markerProgress("innerComplete");
  const outerStart = route.markerProgress("outerStart");
  const outerComplete = route.markerProgress("outerComplete");
  const innerAltitudes = [];
  const outerAltitudes = [];
  for (let sample = 0; sample <= 240; sample += 1) {
    innerAltitudes.push(plan.altitude(
      innerStart + (innerComplete - innerStart) * sample / 240,
    ));
    outerAltitudes.push(plan.altitude(
      outerStart + (outerComplete - outerStart) * sample / 240,
    ));
  }
  assert.ok(Math.min(...innerAltitudes) >= NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD - 1e-6);
  assert.ok(Math.max(...innerAltitudes) <= NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS + 1e-6);
  assert.ok(Math.abs(Math.max(...innerAltitudes)
    - NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS) < 0.05);
  assert.ok(Math.min(...outerAltitudes) >= NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS - 1e-6);
  assert.ok(Math.abs(Math.max(...outerAltitudes)
    - NIMBUS_HEXACOPTER_ALTITUDE_FULL) < 0.05);
  assert.ok(Math.abs(plan.altitude(0) - NIMBUS_HEXACOPTER_ORIGIN[1]) < 1e-6);
  assert.ok(Math.abs(plan.altitude(1) - NIMBUS_HEXACOPTER_ORIGIN[1]) < 1e-6);
});

test("the aircraft returns to its berth along its authored nose heading", () => {
  const start = plan.point(0);
  const finish = plan.point(1);
  assert.ok(Math.hypot(start[0] - finish[0], start[2] - finish[2]) < 1e-6);
  const [headingX, headingZ] = vehicleRouteHeading(plan, 0.995);
  const alignment = headingX * NIMBUS_HEXACOPTER_NOSE[0]
    + headingZ * NIMBUS_HEXACOPTER_NOSE[2];
  assert.ok(alignment > 0.995, `final heading alignment: ${alignment}`);
});

