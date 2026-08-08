import assert from "node:assert/strict";
import test from "node:test";
import { islandAirportDocument } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDocument.ts";
import {
  AIRPORT_APRON,
  AIRPORT_CONTROL_TOWER,
  AIRPORT_RUNWAY,
  AIRPORT_TERMINAL,
  ISLAND_AIRPORT_SHORELINE,
  airportDistanceToShoreline,
  airportPointInShoreline,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import {
  islandAirportCompilation,
  islandAirportScene,
} from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { islandAirportFlyover } from "../games/make-a-mess/src/game/islandAirportFlyover.ts";
import {
  PLAYER_HEIGHT,
  routeBoxOf,
  walkRoute,
} from "../games/make-a-mess/src/game/walkableRoute.ts";

const pieces = islandAirportScene.breakablePieces;
const withId = (fragment) => pieces.filter((piece) => piece.id.includes(fragment));
const pieceById = (id) => pieces.find((piece) => piece.id === id);
const authoredObjects = islandAirportDocument.groups.flatMap((group) => group.objects);

function extent(items, axis) {
  return {
    min: Math.min(...items.map((piece) => piece.position[axis] - piece.size[axis] / 2)),
    max: Math.max(...items.map((piece) => piece.position[axis] + piece.size[axis] / 2)),
  };
}

test("the complete airport compiles as one initially stable authored scene", () => {
  assert.equal(islandAirportScene.resolveStructuralCollapse(new Set()).size, 0);
  assert.equal(islandAirportCompilation.artifact.groupCount, islandAirportDocument.groups.length);
  assert.equal(islandAirportCompilation.artifact.pieceCount, pieces.length);
  assert.ok(islandAirportCompilation.artifact.lampCount >= 11);
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, pieces.length);

  for (const service of [
    "maintenance-hangar",
    "fire-station",
    "control-tower",
    "fuel-farm",
  ]) {
    assert.ok(
      islandAirportScene.breakableClusters.some((cluster) => cluster.id.endsWith(`:${service}`)),
      `missing ${service}`,
    );
  }
});

test("the island is flat, elongated and bounded by the authored non-radial shoreline", () => {
  assert.equal(ISLAND_AIRPORT_SHORELINE.length, 18);
  assert.deepEqual(islandAirportScene.worldEdgeBoundary, ISLAND_AIRPORT_SHORELINE);
  const xs = ISLAND_AIRPORT_SHORELINE.map(([x]) => x);
  const zs = ISLAND_AIRPORT_SHORELINE.map(([, z]) => z);
  assert.ok((Math.max(...xs) - Math.min(...xs)) / (Math.max(...zs) - Math.min(...zs)) > 2);
  assert.ok(withId(":terrain:earth:").length > 550);
  assert.ok(withId(":terrain:earth:").every((piece) => piece.foundation));
  assert.ok(withId(":shoreline:riprap:").length > 150);
  assert.ok(withId(":shoreline:riprap:").every((piece) => piece.foundation));

  for (const x of [-88, 88]) {
    assert.ok(airportPointInShoreline(x, AIRPORT_RUNWAY.centreZ));
    assert.ok(airportDistanceToShoreline(x, AIRPORT_RUNWAY.centreZ) > 7);
  }

  for (const piece of pieces.filter((candidate) =>
    candidate.id.includes(":terrain:earth:") || candidate.id.includes(":pavement:")
  )) {
    for (const sideX of [-1, 1]) {
      for (const sideZ of [-1, 1]) {
        const x = piece.position[0] + sideX * piece.size[0] / 2;
        const z = piece.position[2] + sideZ * piece.size[2] / 2;
        assert.ok(airportPointInShoreline(x, z), `${piece.id} corner ${x.toFixed(2)},${z.toFixed(2)} crosses the shoreline`);
      }
    }
  }

  const shoreAnchors = pieces.filter((piece) =>
    piece.foundation && piece.id.includes(":landside:security:") && Math.abs(piece.position[0]) > 116.2
  );
  assert.equal(shoreAnchors.length, 2);
  const riprapBoxes = withId(":shoreline:riprap:").map(routeBoxOf);
  for (const anchor of shoreAnchors) {
    assert.ok(airportDistanceToShoreline(anchor.position[0], anchor.position[2]) < 0.04);
    const anchorBox = routeBoxOf(anchor);
    assert.ok(riprapBoxes.some((rock) =>
      Math.min(anchorBox.maxX, rock.maxX) > Math.max(anchorBox.minX, rock.minX) &&
      Math.min(anchorBox.maxZ, rock.maxZ) > Math.max(anchorBox.minZ, rock.minZ)
    ), `${anchor.id} does not bear on the riprap belt`);
  }

  for (const foundation of pieces.filter((piece) =>
    piece.foundation &&
    !piece.id.includes(":shoreline:riprap:") &&
    !shoreAnchors.includes(piece)
  )) {
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      assert.ok(
        airportPointInShoreline(
          foundation.position[0] + sideX * foundation.size[0] / 2,
          foundation.position[2] + sideZ * foundation.size[2] / 2,
        ),
        `${foundation.id} foundation crosses the shoreline`,
      );
    }
  }
});

test("grass never intersects paved or hardstanding operational surfaces", () => {
  const grass = withId(":turf:grass:").map(routeBoxOf);
  const hardstands = pieces.filter((piece) =>
    piece.id.includes(":pavement:") ||
    piece.id.includes(":maintenance-hangar:hangar:foundation:") ||
    piece.id.includes(":fire-station:fire:foundation:") ||
    piece.id.includes(":fuel-farm:tank-pad:") ||
    piece.id.includes(":fuel-farm:pump-pad:")
  ).map(routeBoxOf);
  for (const turfBox of grass) {
    for (const pavedBox of hardstands) {
      const overlapX = Math.min(turfBox.maxX, pavedBox.maxX) - Math.max(turfBox.minX, pavedBox.minX);
      const overlapY = Math.min(turfBox.maxY, pavedBox.maxY) - Math.max(turfBox.minY, pavedBox.minY);
      const overlapZ = Math.min(turfBox.maxZ, pavedBox.maxZ) - Math.max(turfBox.minZ, pavedBox.minZ);
      assert.ok(overlapX <= 0.04 || overlapY <= 0.04 || overlapZ <= 0.04, `${turfBox.id} intersects ${pavedBox.id}`);
    }
  }
});

test("the compact runway, apron and taxiway keep their exact operational geometry", () => {
  const runway = withId(":pavement:runway:");
  const apron = withId(":pavement:apron:");
  const taxiway = withId(":pavement:taxiway:");
  assert.ok(runway.length >= 29);
  const runwayX = extent(runway, 0);
  assert.ok(Math.abs(runwayX.min + AIRPORT_RUNWAY.length / 2) <= 0.021);
  assert.ok(Math.abs(runwayX.max - AIRPORT_RUNWAY.length / 2) <= 0.021);
  assert.deepEqual(extent(runway, 2), {
    min: AIRPORT_RUNWAY.centreZ - AIRPORT_RUNWAY.width / 2,
    max: AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY.width / 2,
  });
  const apronX = extent(apron, 0);
  assert.ok(Math.abs(apronX.min - (AIRPORT_APRON.centre[0] - AIRPORT_APRON.width / 2)) <= 0.021);
  assert.ok(Math.abs(apronX.max - (AIRPORT_APRON.centre[0] + AIRPORT_APRON.width / 2)) <= 0.021);
  assert.ok(taxiway.length >= 3);
  assert.equal(withId(":markings:centreline:").length, 13);
  assert.equal(withId(":markings:threshold-").length, 24);
  assert.equal(withId(":markings:stand-line:").length, 3);
});

test("terminal envelope is real construction with open doors and transparent glazing", () => {
  const foundations = withId(":terminal-structure:foundation:");
  assert.equal(foundations.length, AIRPORT_TERMINAL.bayCount);
  assert.deepEqual(extent(foundations, 0), {
    min: AIRPORT_TERMINAL.origin[0] - AIRPORT_TERMINAL.width / 2,
    max: AIRPORT_TERMINAL.origin[0] + AIRPORT_TERMINAL.width / 2,
  });
  assert.equal(withId(":terminal-structure:column:").length, 18);
  assert.equal(withId(":terminal-structure:roof-beam:").length, 9);
  assert.equal(withId(":terminal-glass:skylight:").length, 8);
  assert.equal(withId(":terminal-glass:airside:window:").length, 6);
  assert.equal(withId(":terminal-glass:landside:window:").length, 6);

  for (const side of ["airside", "landside"]) {
    for (const bay of side === "airside" ? [2, 5] : [3, 4]) {
      const leaves = withId(`:terminal-glass:${side}:door:${bay}:`);
      assert.equal(leaves.length, 2);
      const openingCentre = leaves.reduce((sum, leaf) => sum + leaf.position[0], 0) / 2;
      const innerEdges = leaves.map((leaf) =>
        leaf.position[0] < openingCentre
          ? leaf.position[0] + leaf.size[0] / 2
          : leaf.position[0] - leaf.size[0] / 2
      ).sort((a, b) => a - b);
      assert.ok(innerEdges[1] - innerEdges[0] >= 1.9, `${side} bay ${bay} is not open`);
    }
  }

  const glazing = pieces.filter((piece) =>
    piece.clusterId === "island-airport:terminal-glass"
  );
  assert.ok(glazing.every((piece) => piece.material === "glass"));
});

test("both independent passenger routes cross the building in both directions", () => {
  const routes = [
    {
      bounds: { minX: -7, maxX: 13, minZ: 6, maxZ: 35, floorY: -0.2, ceilingY: 7 },
      outside: { x: 4.75, z: 33.2, footY: 0.46 },
      apron: { x: -1.75, z: 7.8, footY: 0.4 },
    },
    {
      bounds: { minX: 8.3, maxX: 20.5, minZ: 6, maxZ: 35, floorY: -0.2, ceilingY: 7 },
      outside: { x: 11.25, z: 33.2, footY: 0.46 },
      apron: { x: 17.75, z: 7.8, footY: 0.4 },
    },
  ];
  for (const [index, route] of routes.entries()) {
    for (const [direction, from, to] of [
      ["outbound", route.outside, route.apron],
      ["inbound", route.apron, route.outside],
    ]) {
      const result = walkRoute(pieces, from, to, {
        bounds: route.bounds,
        cell: 0.2,
        height: PLAYER_HEIGHT + 0.18,
      });
      assert.ok(
        result.reached,
        `route ${index + 1} ${direction}: closest ${result.closestDistance.toFixed(2)} m, ${result.blockedBy ?? result.blockReason}`,
      );
    }
  }
});

test("the airside security boundary cannot be bypassed around the terminal ends", () => {
  const closedPublicFacade = {
    id: "test:closed-landside-facade",
    position: [AIRPORT_TERMINAL.origin[0], 2.2, AIRPORT_TERMINAL.landsideZ],
    size: [AIRPORT_TERMINAL.width + 0.5, 4.4, 0.5],
  };
  const bypass = walkRoute([...pieces, closedPublicFacade], {
    x: 4.75, z: 42, footY: 0.46,
  }, {
    x: 0, z: 2, footY: 0.4,
  }, {
    bounds: { minX: -118, maxX: 118, minZ: -8, maxZ: 53, floorY: -0.2, ceilingY: 7 },
    cell: 0.5,
    height: PLAYER_HEIGHT + 0.18,
  });
  assert.equal(bypass.reached, false, "public circulation bypasses the controlled terminal boundary");

  for (const piece of withId(":landside:security:")) {
    for (const building of [
      { id: "fire station", minX: -69, maxX: -47, minZ: 8, maxZ: 22 },
      { id: "hangar", minX: 48, maxX: 74, minZ: 2, maxZ: 24 },
    ]) {
      const inside = piece.position[0] > building.minX && piece.position[0] < building.maxX &&
        piece.position[2] > building.minZ && piece.position[2] < building.maxZ;
      assert.equal(inside, false, `${piece.id} passes through the ${building.id}`);
    }
  }
});

test("terminal fixtures and airfield lights use complete physical carrier chains", () => {
  assert.equal(withId(":terminal-lighting:fixture:").length, 32);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (const part of ["stem", "housing", "lens", "bulb"]) {
        assert.equal(withId(`:fixture:${row}:${column}:${part}:`).length, 1);
      }
    }
  }
  assert.equal(withId(":airfield-equipment:edge:").length, 44 * 4);
  assert.equal(withId(":airfield-equipment:threshold:").length, 14 * 7);
  assert.equal(withId(":airfield-equipment:papi:").length, 8 * 4);

  for (const end of [-1, 1]) {
    const expectedX = end < 0
      ? AIRPORT_RUNWAY.westThresholdX + AIRPORT_RUNWAY.thresholdInset
      : AIRPORT_RUNWAY.eastThresholdX - AIRPORT_RUNWAY.thresholdInset;
    for (let index = -3; index <= 3; index += 1) {
      const prefix = `:threshold:${end}:${index}:`;
      assert.equal(withId(`${prefix}base:`).length, 1);
      assert.equal(withId(`${prefix}approach:lens:`).length, 1);
      assert.equal(withId(`${prefix}runway:lens:`).length, 1);
      assert.equal(withId(`${prefix}base:`)[0].position[0], expectedX);
    }
  }
  for (const approach of ["west", "east"]) {
    const papi = withId(`:papi:${approach}:`).filter((piece) => piece.id.includes(":base:"));
    assert.equal(papi.length, 4);
    assert.equal(new Set(papi.map((piece) => piece.position[0])).size, 1, `${approach} PAPI is not perpendicular to the runway`);
    const orderedBulbs = [];
    for (let index = 0; index < 4; index += 1) {
      const bulb = pieceById(`island-airport:airfield-equipment:papi:${approach}:${index}:bulb:piece`);
      orderedBulbs.push(bulb);
      assert.equal(bulb?.color, index < 2 ? "#f08a80" : "#f4f1e2", `${approach} PAPI has its near/far colors reversed`);
    }
    assert.ok(
      Math.abs(orderedBulbs[0].position[2] - AIRPORT_RUNWAY.centreZ) <
        Math.abs(orderedBulbs[3].position[2] - AIRPORT_RUNWAY.centreZ),
      `${approach} PAPI indices no longer run from runway-near to outboard`,
    );
  }
  const activeAirfieldBulbs = authoredObjects.filter((object) =>
    object.kind === "primitive" &&
    (object.id.startsWith("edge:") || object.id.startsWith("papi:")) &&
    object.id.endsWith(":bulb")
  );
  assert.equal(activeAirfieldBulbs.length, 52);
  assert.ok(activeAirfieldBulbs.every((bulb) => {
    if (bulb.kind !== "primitive" || !bulb.light) return false;
    return bulb.light.poolGroupId === (bulb.id.startsWith("papi:") ? "airport-papi" : "airport-runway-edge") &&
      typeof bulb.light.localPoolCapacity === "number";
  }));

  const edgeBase = "island-airport:airfield-equipment:edge:4:1:base:piece";
  const edgeCollapse = islandAirportScene.resolveStructuralCollapse(new Set([edgeBase]));
  assert.equal(edgeCollapse.size, 4);
  assert.ok([...edgeCollapse].every((id) => id.includes(":edge:4:1:")));

  const beam = "island-airport:terminal-structure:roof-beam:1:piece";
  const fixtureCollapse = islandAirportScene.resolveStructuralCollapse(new Set([beam]));
  assert.ok(fixtureCollapse.has("island-airport:terminal-lighting:fixture:0:0:bulb:piece"));
  assert.ok(fixtureCollapse.has("island-airport:terminal-lighting:fixture:1:0:bulb:piece"));
});

test("tower, rescue, maintenance and fuel systems keep their defining parts", () => {
  assert.equal(AIRPORT_CONTROL_TOWER.roofY, 13.85);
  assert.equal(withId(":control-tower:cab-glass-").length, 4);
  assert.equal(withId(":control-tower:beacon-").length, 3);
  assert.equal(withId(":maintenance-hangar:hangar:door:").length, 2);
  assert.equal(withId(":fire-station:fire:door:").length, 3);
  assert.equal(withId(":fuel-farm:tank:").length, 3);
  assert.equal(withId(":fuel-farm:fence-z:").length, 18);
  assert.equal(withId(":fuel-farm:fence-x:").length, 8);
  assert.equal(withId(":fuel-farm:gate-z:").length, 2);
  assert.equal(withId(":fuel-farm:bund-").length, 28);
  assert.equal(withId(":terminal-interior:wc:").length, 10);
  assert.equal(withId(":terminal-interior:gate-desk:").length, 6);
  assert.equal(withId(":terminal-interior:baggage-feed:").length, 9);
  assert.ok(withId(":landside:security:").length > 100);
  assert.deepEqual(islandAirportDocument.world.playerSpawn, [4.75, 1.25, 42]);

  const towerPost = pieceById("island-airport:control-tower:cab-post:-4.1:-4.1:piece");
  const towerRoof = pieceById("island-airport:control-tower:cab-roof:piece");
  assert.ok(towerPost && towerRoof);
  assert.ok(towerRoof.position[1] - towerRoof.size[1] / 2 - (towerPost.position[1] + towerPost.size[1] / 2) <= 0.05);

  const hangarFoundation = "island-airport:maintenance-hangar:hangar:foundation:piece";
  const hangarCollapse = islandAirportScene.resolveStructuralCollapse(new Set([hangarFoundation]));
  for (const piece of pieces.filter((candidate) => candidate.clusterId === "island-airport:maintenance-hangar")) {
    assert.ok(hangarCollapse.has(piece.id), `${piece.id} keeps a false load path after its foundation is removed`);
  }
});

test("the flyover covers overview, circulation, systems and sunset without entering solids", () => {
  assert.equal(islandAirportFlyover.keyframes[0].at, 0);
  assert.equal(islandAirportFlyover.keyframes.at(-1).at, 1);
  assert.equal(islandAirportFlyover.chapters.length, 5);
  assert.ok(islandAirportFlyover.keyframes.every((frame, index, frames) =>
    index === 0 || frame.at > frames[index - 1].at
  ));
  for (const chapter of islandAirportFlyover.chapters) {
    assert.ok(chapter.captureAt >= chapter.from && chapter.captureAt <= chapter.to);
  }
  for (let index = 1; index < islandAirportFlyover.chapters.length; index += 1) {
    assert.ok(islandAirportFlyover.chapters[index - 1].to < islandAirportFlyover.chapters[index].from);
  }

  const smootherstep = (amount) => amount ** 3 * (amount * (amount * 6 - 15) + 10);
  const catmull = (previous, start, end, next, amount) => {
    const amount2 = amount * amount;
    const amount3 = amount2 * amount;
    return (2 * amount3 - 3 * amount2 + 1) * start +
      (amount3 - 2 * amount2 + amount) * (end - previous) * 0.5 +
      (-2 * amount3 + 3 * amount2) * end +
      (amount3 - amount2) * (next - start) * 0.5;
  };
  const positionAt = (progress) => {
    const frames = islandAirportFlyover.keyframes;
    let segment = frames.length - 2;
    for (let index = 0; index < frames.length - 1; index += 1) {
      if (progress <= frames[index + 1].at) {
        segment = index;
        break;
      }
    }
    const start = frames[segment];
    const end = frames[segment + 1];
    const local = smootherstep(Math.max(0, Math.min(1, (progress - start.at) / (end.at - start.at))));
    const previous = frames[Math.max(0, segment - 1)];
    const next = frames[Math.min(frames.length - 1, segment + 2)];
    return [0, 1, 2].map((axis) => catmull(previous.position[axis], start.position[axis], end.position[axis], next.position[axis], local));
  };
  const solidBoxes = pieces.filter((piece) => piece.intactCollider !== false).map(routeBoxOf);
  const cameraRadius = 0.14;
  for (let sample = 0; sample <= 2_000; sample += 1) {
    const progress = sample / 2_000;
    const position = positionAt(progress);
    const collision = solidBoxes.find((box) => {
      const dx = Math.max(box.minX - position[0], 0, position[0] - box.maxX);
      const dy = Math.max(box.minY - position[1], 0, position[1] - box.maxY);
      const dz = Math.max(box.minZ - position[2], 0, position[2] - box.maxZ);
      return dx * dx + dy * dy + dz * dz < cameraRadius * cameraRadius;
    });
    assert.equal(collision, undefined, `camera ${progress.toFixed(4)} clips ${collision?.id}`);
  }
});
