import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Vector3 } from "three";
import {
  dc3AirframeSurface,
  dc3BlockoutObject,
} from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import {
  ISLAND_AIRPORT_DC3_PLACEMENT,
  islandAirportDc3BodyPoint,
  islandAirportDc3Frame,
  islandAirportDc3MotionInstruments,
  islandAirportDc3RestingPoint,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import {
  ISLAND_AIRPORT_DC3_CAPTAIN_SEAT,
  passengerSeatContextAction,
  passengerSeatViewYaw,
  passengerSeats,
} from "../games/make-a-mess/src/game/passengerSeats.ts";
import { RESTING_POSE } from "../games/make-a-mess/src/game/vehicleFrames.ts";

const { cockpit, cabins, worldToBody } = dc3AirframeSurface;
const cockpitParts = dc3BlockoutObject.parts.filter((part) => part.group === "cockpit");

test("the crew kit is present: floor, bulkhead, two seats, two yokes, panel, six levers", () => {
  const ids = new Set(cockpitParts.map((part) => part.id));
  for (const id of [
    "cockpit-floor",
    "cockpit-bulkhead-left",
    "cockpit-bulkhead-right",
    "cockpit-bulkhead-head",
    "cockpit-tunnel-cover",
    "cockpit-panel",
    "cockpit-seat-left",
    "cockpit-seat-left-back",
    "cockpit-seat-right",
    "cockpit-seat-right-back",
    "cockpit-yoke-left-column",
    "cockpit-yoke-right-column",
    "cockpit-yoke-left-hub",
    "cockpit-yoke-right-hub",
    "cockpit-lamp-fwd-bulb",
    "cockpit-lamp-aft-bulb",
  ]) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
  const levers = [...ids].filter((id) => id.startsWith("cockpit-lever-") && id.endsWith("-shaft"));
  assert.equal(levers.length, 6, `levers ${levers.length}`);
  const knobs = [...ids].filter((id) => id.startsWith("cockpit-lever-") && id.endsWith("-knob"));
  assert.equal(knobs.length, 6);
});

test("the nose equipment bay stays; the tunnel sits on it", () => {
  assert.ok(dc3BlockoutObject.parts.some((part) => part.id === "nose-equipment-bay"));
  assert.ok(dc3BlockoutObject.parts.some((part) => part.id === "nose-battery-block"));
  const cover = cockpitParts.find((part) => part.id === "cockpit-tunnel-cover");
  assert.ok(cover);
});

test("cockpit furniture stays inside the hull", () => {
  const rotateXyz = (vector, rotation) => {
    if (!rotation) return vector;
    return new Vector3(...vector).applyEuler(new Euler(...rotation, "XYZ")).toArray();
  };
  const cornersOf = (part) => {
    if (part.vertices) return part.vertices;
    if (part.center && part.size) {
      const [cx, cy, cz] = part.center;
      const [sx, sy, sz] = part.size;
      const corners = [];
      for (const dx of [-sx / 2, sx / 2]) {
        for (const dy of [-sy / 2, sy / 2]) {
          for (const dz of [-sz / 2, sz / 2]) {
            const [lx, ly, lz] = rotateXyz([dx, dy, dz], part.rotation);
            corners.push([cx + lx, cy + ly, cz + lz]);
          }
        }
      }
      return corners;
    }
    const radius = part.radius ?? 0;
    return [part.from, part.to].flatMap((end) => [
      [end[0] - radius, end[1] - radius, end[2] - radius],
      [end[0] + radius, end[1] + radius, end[2] + radius],
    ]);
  };
  assert.ok(cockpitParts.length > 20, `cockpit parts ${cockpitParts.length}`);
  for (const part of cockpitParts) {
    for (const vertex of cornersOf(part)) {
      const [x, y, z] = worldToBody(vertex);
      const station = dc3AirframeSurface.fuselage.at(z);
      const centreY = (station.crown + station.keel) / 2;
      const halfWidth = station.halfWidth - cabins.skinInset;
      const halfHeight = (station.crown - station.keel) / 2 - cabins.skinInset;
      const radial = (x / halfWidth) ** 2 + ((y - centreY) / halfHeight) ** 2;
      assert.ok(
        radial <= 1.08,
        `${part.id}: corner (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) outside the skin`,
      );
    }
  }
});

test("the crew bulkhead is closed and sits forward of the cabin door", () => {
  const walls = ["cockpit-bulkhead-left", "cockpit-bulkhead-right", "cockpit-bulkhead-head"]
    .map((id) => cockpitParts.find((part) => part.id === id));
  assert.ok(walls.every(Boolean));
  for (const wall of walls) {
    const zs = wall.vertices.map((vertex) => worldToBody(vertex)[2]);
    const z = (Math.min(...zs) + Math.max(...zs)) / 2;
    assert.ok(Math.abs(z - cockpit.bulkheadZ) < 0.04, `${wall.id} at ${z}`);
  }
  const forwardDoor = dc3AirframeSurface.cabinEntries.find((plan) => plan.id === "forward");
  assert.ok(cockpit.bulkheadZ > forwardDoor.zTo - 0.02, "bulkhead eats the forward door");
});

test("captain is port (object +X), only that seat is occupiable, and it is not a yoke", () => {
  assert.equal(ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.rotorcraftControls, undefined);
  assert.equal(ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.parkedOccupation, true);
  const captain = cockpitParts.find((part) => part.id === cockpit.captainSeatId);
  const xs = captain.vertices.map((vertex) => worldToBody(vertex)[0]);
  assert.ok(
    (Math.min(...xs) + Math.max(...xs)) / 2 > 0,
    "captain is not on the port side (object +X)",
  );
  assert.equal(cockpit.captainSeatId, "cockpit-seat-right");
  const mine = passengerSeats.filter(
    (seat) => seat.carrierClusterId === ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
  );
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.id);
});

function rayHitsQuad(origin, dir, quad) {
  const [a, b, c, d] = quad;
  const n = new Vector3().crossVectors(
    new Vector3().subVectors(new Vector3(...b), new Vector3(...a)),
    new Vector3().subVectors(new Vector3(...d), new Vector3(...a)),
  );
  const nd = n.dot(new Vector3(...dir));
  if (Math.abs(nd) < 1e-9) return false;
  const t = n.dot(new Vector3().subVectors(new Vector3(...a), new Vector3(...origin))) / nd;
  if (t < 0.05) return false;
  const p = new Vector3(...origin).addScaledVector(new Vector3(...dir), t);
  const inside = (p0, p1, p2) => {
    const u = new Vector3().subVectors(new Vector3(...p1), new Vector3(...p0));
    const v = new Vector3().subVectors(new Vector3(...p2), new Vector3(...p0));
    const w = new Vector3().subVectors(p, new Vector3(...p0));
    const uu = u.dot(u);
    const vv = v.dot(v);
    const uv = u.dot(v);
    const wu = w.dot(u);
    const wv = w.dot(v);
    const den = uv * uv - uu * vv;
    const s = (uv * wv - vv * wu) / den;
    const tt = (uv * wu - uu * wv) / den;
    return s >= -0.02 && tt >= -0.02 && s + tt <= 1.02;
  };
  return inside(a, b, c) || inside(a, c, d);
}

test("the seated camera looks out the port windshield along the nose, not down into the cabin", () => {
  const occupant = islandAirportDc3BodyPoint(ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.occupantPoint);
  assert.ok(occupant[0] > 0.2, `capsule is not on the captain side: x=${occupant[0]}`);
  assert.ok(occupant[0] < 0.7, `capsule left the port seat: x=${occupant[0]}`);
  assert.ok(
    occupant[2] > cockpit.seatZ - 0.2 && occupant[2] < cockpit.seatZ + 0.25,
    `capsule is not on the cushion: z=${occupant[2]}`,
  );

  const eyeWorld = [
    ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.occupantPoint[0],
    ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.occupantPoint[1] + 0.54,
    ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.occupantPoint[2],
  ];
  const eye = islandAirportDc3BodyPoint(eyeWorld);
  const pane = dc3AirframeSurface.windshields.find((glass) => glass.id === "right");
  const paneYs = pane.corners.map((corner) => corner[1]);
  const sill = Math.min(...paneYs);
  const brow = Math.max(...paneYs);
  assert.ok(eye[1] > sill, `eyes below the sill: y=${eye[1]} sill=${sill}`);
  assert.ok(eye[1] < brow, `eyes above the brow, standing on the seat: y=${eye[1]} brow=${brow}`);

  const objectOrigin = dc3AirframeSurface.worldToBody([0, 0, 0]);
  const objectAhead = dc3AirframeSurface.worldToBody([0, 0, 1]);
  const lookLevel = [
    objectAhead[0] - objectOrigin[0],
    objectAhead[1] - objectOrigin[1],
    objectAhead[2] - objectOrigin[2],
  ];
  assert.ok(
    rayHitsQuad(eye, lookLevel, pane.corners),
    `level look from (${eye.map((n) => n.toFixed(2))}) misses the port windshield`,
  );

  const carrier = {
    clusterId: islandAirportDc3Frame.clusterId,
    origin: islandAirportDc3Frame.origin,
    nose: islandAirportDc3Frame.nose,
    pose: RESTING_POSE,
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    centreOfMass: islandAirportDc3Frame.origin,
  };
  assert.ok(
    Math.abs(passengerSeatViewYaw(ISLAND_AIRPORT_DC3_CAPTAIN_SEAT, carrier) + Math.PI / 2) < 1e-9,
    "parked view does not look out the nose",
  );
});

test("the airport scene carries the panel instrument and starts with no unsupported pieces", () => {
  assert.equal(islandAirportScene.resolveStructuralCollapse(new Set()).size, 0);
  const panelId = `${ISLAND_AIRPORT_DC3_PLACEMENT.clusterId}:${cockpit.panelId}:piece`;
  assert.ok(islandAirportScene.breakablePieces.some((piece) => piece.id === panelId));
  assert.equal(islandAirportDc3MotionInstruments.length, 1);
  assert.equal(islandAirportDc3MotionInstruments[0].panelPieceId, panelId);
  assert.equal(
    islandAirportScene.motionInstrumentDefinitions[0]?.panelPieceId,
    panelId,
  );
  const pieceIds = new Set(
    islandAirportScene.breakablePieces.map((piece) => piece.id),
  );
  assert.ok(
    ISLAND_AIRPORT_DC3_CAPTAIN_SEAT.requiredPieceIds.every((id) => pieceIds.has(id)),
    "captain seat required pieces missing from the compiled airport",
  );
  assert.equal(islandAirportScene.breakablePieces.filter((piece) =>
    piece.clusterId === ISLAND_AIRPORT_DC3_PLACEMENT.clusterId).length,
    dc3AirframeParts().length);
});

test("the instrument panel faces the crew, horizon left, lamps right", () => {
  const panel = cockpitParts.find((part) => part.id === "cockpit-panel");
  assert.ok(panel?.rotation);
  const rotateXyz = (vector, rotation) =>
    new Vector3(...vector).applyEuler(new Euler(...rotation, "XYZ")).toArray();
  const originBody = worldToBody([0, 0, 0]);
  const asBodyDir = (local) => {
    const world = rotateXyz(local, panel.rotation);
    const body = worldToBody(world);
    return [
      body[0] - originBody[0],
      body[1] - originBody[1],
      body[2] - originBody[2],
    ];
  };
  const face = asBodyDir([0, 1, 0]);
  const left = asBodyDir([0, 0, 1]);
  const plateUp = asBodyDir([1, 0, 0]);
  assert.ok(face[2] < -0.85, `face looks at the nose, not the crew: ${face.map((n) => n.toFixed(2))}`);
  assert.ok(face[1] > 0.12, `face is a shelf: ${face.map((n) => n.toFixed(2))}`);
  assert.ok(left[0] > 0.85, `horizon axis is not to the captain: ${left.map((n) => n.toFixed(2))}`);
  assert.ok(
    plateUp[1] < -0.5,
    `plate local X must point down so instrument text is upright: ${plateUp.map((n) => n.toFixed(2))}`,
  );
  const center = worldToBody(panel.center);
  assert.ok(center[0] > 0.05, `panel is not grouped toward the captain: x=${center[0]}`);
  assert.ok(center[1] > 0.52, `indicator panel is still low: y=${center[1]}`);
  assert.ok(face[1] > 0.32, `bottom is not tipped toward the crew: ${face.map((n) => n.toFixed(2))}`);
});

test("yoke horns curve up, and nothing sits on top of the indicator panel", () => {
  const hub = cockpitParts.find((part) => part.id === cockpit.captainHubId);
  const bow = cockpitParts.find((part) => part.id === "cockpit-yoke-right-horn-bow");
  assert.ok(hub?.vertices && bow?.from && bow?.to);
  const hubY = hub.vertices
    .map((vertex) => worldToBody(vertex)[1])
    .reduce((sum, y) => sum + y, 0) / hub.vertices.length;
  const bowYs = [bow.from, bow.to].map((end) => worldToBody(end)[1]);
  assert.ok(
    Math.min(...bowYs) > hubY + 0.04,
    `ram horns still point at the floor: hub ${hubY.toFixed(2)} bow ${bowYs.map((n) => n.toFixed(2))}`,
  );
  assert.equal(
    cockpitParts.filter((part) => part.id.startsWith("cockpit-glare-coaming")).length,
    0,
  );
});

test("parked occupation offers sit from the forward cabin and from ahead of the nose, not from the grass", () => {
  const seat = ISLAND_AIRPORT_DC3_CAPTAIN_SEAT;
  const inside = passengerSeatContextAction({
    seat,
    occupiedSeatId: null,
    carrierActive: true,
    passengerInsideCarrier: true,
    distance: 0.4,
    keepApproach: false,
    intact: true,
  });
  assert.equal(inside, "seat");
  const outside = passengerSeatContextAction({
    seat,
    occupiedSeatId: null,
    carrierActive: true,
    passengerInsideCarrier: false,
    distance: 0.4,
    keepApproach: false,
    intact: true,
  });
  assert.equal(outside, null);
  assert.equal(
    passengerSeatContextAction({
      seat,
      occupiedSeatId: seat.id,
      carrierActive: false,
      passengerInsideCarrier: false,
      distance: Infinity,
      keepApproach: false,
      intact: true,
    }),
    "stand",
  );
  const cabin = islandAirportDc3RestingPoint([
    0,
    cabins.forward.floorY + 1.05,
    cabins.forward.to - 0.45,
  ]);
  const ahead = islandAirportDc3RestingPoint([0, 0.9, cockpit.noseZ + 1.2]);
  const grass = islandAirportDc3RestingPoint([4.2, 0.9, cabins.forward.to - 0.45]);
  const atForwardDoor = islandAirportDc3RestingPoint([1.7, 0.5, 4.72]);
  assert.equal(seat.occupationContains(cabin), true);
  assert.equal(seat.occupationContains(ahead), true);
  assert.equal(seat.occupationContains(grass), false);
  assert.equal(seat.occupationContains(atForwardDoor), false);
  const noseDistance = Math.hypot(
    ahead[0] - seat.interactionPoint[0],
    ahead[1] - seat.interactionPoint[1],
    ahead[2] - seat.interactionPoint[2],
  );
  assert.ok(noseDistance <= seat.approachRadius, `nose is ${noseDistance.toFixed(2)} m from sit`);
  assert.equal(
    passengerSeatContextAction({
      seat,
      occupiedSeatId: null,
      carrierActive: true,
      passengerInsideCarrier: true,
      distance: noseDistance,
      keepApproach: false,
      intact: true,
    }),
    "seat",
  );
  assert.ok(seat.exteriorExitPoint, "runway exit missing");
  assert.equal(seat.occupiedActions?.length, 3);
});

test("cockpit lamps are interior and do not dim with the docked landing lights", () => {
  const bulbs = cockpitParts.filter((part) => part.id.endsWith("-bulb"));
  assert.equal(bulbs.length, 2);
  for (const bulb of bulbs) {
    assert.equal(bulb.light?.interior, true);
    assert.ok((bulb.light?.dayIntensityFactor ?? 0) >= 0.8);
  }
});
