import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Quaternion, Vector3 } from "three";
import { nimbusScene } from "../games/make-a-mess/src/game/nimbusScene.ts";
import {
  NIMBUS_BOWL_YAW,
  NIMBUS_FLIGHT_FIELD_ALONG,
  NIMBUS_FLIGHT_FIELD_CENTRE,
  NIMBUS_FLIGHT_FIELD_OUTWARD,
  NIMBUS_GROUND_PITCH,
  NIMBUS_INDUSTRIAL_FOOTPRINTS,
  NIMBUS_SHIPYARD_CENTRE,
  NIMBUS_SPINDLE_TOWER_CENTRE,
  NIMBUS_TOWER_CENTRE,
  NIMBUS_VERTICAL_DOCK_CENTRE,
  NIMBUS_WORLD_RADIUS,
  nimbusGroundTopAt,
  nimbusGroundUnder,
  nimbusGroundZoneAt,
  nimbusLandRadiusAt,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusShell.ts";
import {
  NIMBUS_ATMOSPHERIC_BODY_LEVELS,
  NIMBUS_ATMOSPHERIC_BODY_SECTORS,
  NIMBUS_ATMOSPHERIC_CLEAR_HEIGHT,
  NIMBUS_ATMOSPHERIC_CONSTRUCTION_CRANE_COUNT,
  NIMBUS_ATMOSPHERIC_BODY_BOTTOM,
  NIMBUS_ATMOSPHERIC_BASE_Y,
  NIMBUS_ATMOSPHERIC_DUCT_RADIUS,
  NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS,
  NIMBUS_ATMOSPHERIC_FAN_COUNT,
  NIMBUS_ATMOSPHERIC_ROOF_Y,
  NIMBUS_ATMOSPHERIC_SUPPORT_COUNT,
  NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS,
  NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS,
  NIMBUS_ATMOSPHERIC_TOP_BEVEL_HEIGHT,
  NIMBUS_ATMOSPHERIC_WORK_HALF_WIDTH,
  nimbusAtmosphericSupportEndpoints,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusAtmosphericTower.ts";
import {
  NIMBUS_OFFICE_PLAZA_IDS,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusGroundInfrastructure.ts";
import {
  NIMBUS_FLIGHT_FIELD_DATUM,
  NIMBUS_FLIGHT_FIELD_HALF_LENGTH,
  NIMBUS_FLIGHT_FIELD_HALF_WIDTH,
  NIMBUS_HEX_PAD_IDS,
  NIMBUS_INDUSTRIAL_BUILDING_IDS,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusIndustrialCampus.ts";
import {
  NIMBUS_SPINDLE_COLUMN_COUNT,
  NIMBUS_SPINDLE_FACADE_SECTORS,
  NIMBUS_SPINDLE_FLOORS,
  NIMBUS_SPINDLE_FLOOR_HEIGHT,
  NIMBUS_SPINDLE_FLOOR_SECTORS,
  NIMBUS_SPINDLE_FOUNDATION_DEPTH,
  NIMBUS_SPINDLE_RADIAL,
  NIMBUS_SPINDLE_ROOF_Y,
  NIMBUS_SPINDLE_STRUCTURE_BASE_Y,
  NIMBUS_SPINDLE_TANGENT,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusSpindleTower.ts";
import {
  NIMBUS_DOCK_ACROSS,
  NIMBUS_DOCK_FLOOR_HEIGHT,
  NIMBUS_DOCK_FORWARD,
  NIMBUS_DOCK_FOUNDATION_DEPTH,
  NIMBUS_DOCK_HABITATION_FLOORS,
  NIMBUS_DOCK_REAR_FLOORS,
  NIMBUS_DOCK_REAR_ROOF_Y,
  NIMBUS_DOCK_SERVICE_FLOORS,
  NIMBUS_DOCK_STRUCTURE_BASE_Y,
  NIMBUS_DOCK_VOID_FORWARD_RANGE,
  NIMBUS_DOCK_VOID_HALF_WIDTH,
  NIMBUS_DOCK_VOID_HEIGHT,
  nimbusDockLocalCoordinates,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusVerticalDock.ts";
import {
  NIMBUS_TOWER_COLUMN_COUNT,
  NIMBUS_TOWER_FLOORS,
  NIMBUS_TOWER_SECTOR_COUNT,
} from "../games/make-a-mess/src/content/scenes/nimbus/nimbusTower.ts";
import {
  NIMBUS_FORCE_FIELD_CELLS,
  NIMBUS_FORCE_FIELD_PROJECTION,
} from "../games/make-a-mess/src/game/nimbusForceField.ts";
import {
  createBasaltForceFieldProjection,
  emptyBasaltForceFieldDamage,
  intersectBasaltForceField,
} from "../games/make-a-mess/src/game/basaltForceField.ts";

const pieces = nimbusScene.breakablePieces;
const containing = (token) => pieces.filter((piece) => piece.id.includes(token));

test("Nimbus starts as one physically supported world", () => {
  assert.equal(nimbusScene.id, "nimbus");
  assert.equal(nimbusScene.worldRadius, NIMBUS_WORLD_RADIUS);
  assert.equal(NIMBUS_WORLD_RADIUS, 204);
  assert.equal(nimbusScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the basin is authored at landscape scale instead of as a flat platform", () => {
  const terrainBase = containing(":terrain-base:deep-earth:");
  const terrainSurface = containing(":terrain-surface:surface:");
  const rocks = containing(":landscape-rock:");
  const vegetation = containing(":landscape-vegetation:");
  const heights = terrainSurface.map((piece) => piece.position[1] + piece.size[1] / 2);

  assert.ok(pieces.length >= 18_900, `only ${pieces.length} pieces`);
  assert.ok(terrainBase.length >= 4_500, `deep-earth tiles: ${terrainBase.length}`);
  assert.equal(terrainBase.length, terrainSurface.length);
  assert.ok(rocks.length >= 2_300, `landscape rocks: ${rocks.length}`);
  assert.ok(vegetation.length >= 2_100, `shrubs: ${vegetation.length}`);
  assert.ok(Math.min(...heights) <= -7.4);
  assert.ok(Math.max(...heights) >= 9.5);
  assert.ok(nimbusGroundTopAt(-120, 30) > nimbusGroundTopAt(-22, 8) + 8);
  assert.notEqual(nimbusLandRadiusAt(195, 0), nimbusLandRadiusAt(0, 195));
});

test("the ground remains a complete five-metre physical grid", () => {
  for (const piece of containing(":terrain-base:deep-earth:")) {
    assert.equal(Math.abs(piece.position[0] % NIMBUS_GROUND_PITCH), 0);
    assert.equal(Math.abs(piece.position[2] % NIMBUS_GROUND_PITCH), 0);
  }

  const zones = new Set();
  for (let x = -180; x <= 180; x += 10) {
    for (let z = -180; z <= 180; z += 10) {
      const zone = nimbusGroundZoneAt(x, z);
      if (zone !== "outside") zones.add(zone);
    }
  }
  assert.deepEqual(
    zones,
    new Set(["wet-pan", "drainage", "west-slope", "rock-ridge", "rim-grass", "work-bench"]),
  );
});

test("atmospheric foundations grow from six asymmetric terrain shoulders", () => {
  const berms = containing(":infrastructure-earthworks:support-berm:");
  const retaining = containing(":infrastructure-retaining:support-berm:");
  const supportCounts = new Map();
  for (const piece of berms) {
    const match = piece.id.match(/support-berm:(\d+):fill:/);
    assert.ok(match, piece.id);
    supportCounts.set(match[1], (supportCounts.get(match[1]) ?? 0) + 1);
  }

  assert.equal(supportCounts.size, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT);
  assert.equal([...supportCounts.values()].every((count) => count >= 45), true);
  assert.equal(retaining.length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT * 3);
  assert.equal(berms.every((piece) => piece.bearsLoad === false), true);
});

test("both office towers stand in distinct hardscape plates", () => {
  const plazaPieces = containing(":office-plazas:");
  const represented = new Set();
  for (const id of NIMBUS_OFFICE_PLAZA_IDS) {
    const tiles = plazaPieces.filter((piece) => piece.id.includes(`:${id}:tile:`));
    assert.ok(tiles.length >= 75, `${id} tiles: ${tiles.length}`);
    represented.add(id);
  }
  assert.deepEqual(represented, new Set(NIMBUS_OFFICE_PLAZA_IDS));
  assert.equal(plazaPieces.every((piece) => piece.bearsLoad === false), true);
});

test("the north-west flight field follows the free rim tangent", () => {
  const basisDot = NIMBUS_FLIGHT_FIELD_ALONG[0] * NIMBUS_FLIGHT_FIELD_OUTWARD[0]
    + NIMBUS_FLIGHT_FIELD_ALONG[1] * NIMBUS_FLIGHT_FIELD_OUTWARD[1];
  const outwardDot = (
    NIMBUS_FLIGHT_FIELD_CENTRE[0] * NIMBUS_FLIGHT_FIELD_OUTWARD[0]
      + NIMBUS_FLIGHT_FIELD_CENTRE[1] * NIMBUS_FLIGHT_FIELD_OUTWARD[1]
  ) / Math.hypot(...NIMBUS_FLIGHT_FIELD_CENTRE);
  const foundations = containing(":flight-field-foundation:field-block:");
  const decks = containing(":flight-field-surface:field-deck:");

  assert.ok(Math.abs(Math.hypot(...NIMBUS_FLIGHT_FIELD_ALONG) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...NIMBUS_FLIGHT_FIELD_OUTWARD) - 1) < 1e-12);
  assert.ok(Math.abs(basisDot) < 1e-12);
  assert.ok(outwardDot > 0.999999);
  assert.equal(foundations.length, 55);
  assert.equal(decks.length, 55);
  assert.equal(
    containing(":flight-field-surface:guidance:").length,
    32,
  );
  assert.equal(
    foundations.every((piece) =>
      nimbusLandRadiusAt(piece.position[0], piece.position[2])
        > Math.hypot(piece.position[0], piece.position[2])),
    true,
  );
});

test("production masses and cargo cranes remain outside the vertical arrival volume", () => {
  const obstructionTokens = [
    ":industrial-primary:",
    ":industrial-shell:",
    ":industrial-cargo-cranes:",
  ];
  const blockers = [];
  for (const piece of pieces.filter((candidate) =>
    obstructionTokens.some((token) => candidate.id.includes(token)))) {
    const quaternion = new Quaternion().setFromEuler(
      new Euler(...(piece.rotation ?? [0, 0, 0])),
    );
    const corners = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = new Vector3(
            x * piece.size[0] / 2,
            y * piece.size[1] / 2,
            z * piece.size[2] / 2,
          ).applyQuaternion(quaternion).add(new Vector3(...piece.position));
          const dx = corner.x - NIMBUS_FLIGHT_FIELD_CENTRE[0];
          const dz = corner.z - NIMBUS_FLIGHT_FIELD_CENTRE[1];
          corners.push([
            dx * NIMBUS_FLIGHT_FIELD_ALONG[0]
              + dz * NIMBUS_FLIGHT_FIELD_ALONG[1],
            dx * NIMBUS_FLIGHT_FIELD_OUTWARD[0]
              + dz * NIMBUS_FLIGHT_FIELD_OUTWARD[1],
            corner.y,
          ]);
        }
      }
    }
    const alongMinimum = Math.min(...corners.map((corner) => corner[0]));
    const alongMaximum = Math.max(...corners.map((corner) => corner[0]));
    const outwardMinimum = Math.min(...corners.map((corner) => corner[1]));
    const outwardMaximum = Math.max(...corners.map((corner) => corner[1]));
    const top = Math.max(...corners.map((corner) => corner[2]));
    if (
      top > NIMBUS_FLIGHT_FIELD_DATUM + 2
      && alongMaximum > -NIMBUS_FLIGHT_FIELD_HALF_LENGTH
      && alongMinimum < NIMBUS_FLIGHT_FIELD_HALF_LENGTH
      && outwardMaximum > -NIMBUS_FLIGHT_FIELD_HALF_WIDTH
      && outwardMinimum < NIMBUS_FLIGHT_FIELD_HALF_WIDTH
    ) blockers.push(piece.id);
  }
  assert.deepEqual(blockers, []);
});

test("construction footprints replace old talus instead of burying it", () => {
  const intrusions = [];
  const landscape = pieces.filter((piece) =>
    piece.id.includes(":landscape-rock:")
      || piece.id.includes(":landscape-vegetation:"));
  for (const piece of landscape) {
    const dx = piece.position[0] - NIMBUS_FLIGHT_FIELD_CENTRE[0];
    const dz = piece.position[2] - NIMBUS_FLIGHT_FIELD_CENTRE[1];
    const along = dx * NIMBUS_FLIGHT_FIELD_ALONG[0]
      + dz * NIMBUS_FLIGHT_FIELD_ALONG[1];
    const outward = dx * NIMBUS_FLIGHT_FIELD_OUTWARD[0]
      + dz * NIMBUS_FLIGHT_FIELD_OUTWARD[1];
    const insideField = Math.abs(along) <= NIMBUS_FLIGHT_FIELD_HALF_LENGTH
      && Math.abs(outward) <= NIMBUS_FLIGHT_FIELD_HALF_WIDTH;
    const insideBuilding = NIMBUS_INDUSTRIAL_FOOTPRINTS.some((footprint) =>
      Math.abs(along - footprint.along) <= footprint.length / 2 + 2
        && Math.abs(outward - footprint.outward) <= footprint.width / 2 + 2);
    if (insideField || insideBuilding) intrusions.push(piece.id);
  }
  assert.deepEqual(intrusions, []);
});

test("four production types connect the field, shipyard and dock", () => {
  const expectedCaissons = new Map([
    ["assembly-hall", 14],
    ["composites-hall", 14],
    ["machine-shop", 12],
    ["energy-plant", 10],
  ]);
  for (const id of NIMBUS_INDUSTRIAL_BUILDING_IDS) {
    assert.equal(
      containing(`:industrial-foundation:${id}:caisson:`).length,
      expectedCaissons.get(id),
      id,
    );
    assert.ok(containing(`:industrial-primary:${id}:column:`).length >= 10, id);
    assert.ok(containing(`:industrial-shell:${id}:wall:`).length >= 8, id);
  }
  assert.ok(containing(":industrial-rails:field-cargo:rail:").length >= 50);
  assert.ok(containing(":industrial-rails:production-spine:rail:").length >= 58);
  assert.ok(containing(":industrial-rails:dock-transfer:rail:").length >= 30);
  for (let spur = 0; spur < NIMBUS_INDUSTRIAL_BUILDING_IDS.length; spur += 1) {
    assert.ok(containing(`:industrial-rails:factory-spur:${spur}:rail:`).length > 5);
  }
});

test("small aircraft pads belong to actual work destinations", () => {
  const decks = containing(":hex-flight-pads:").filter((piece) =>
    piece.id.includes(":deck:"));
  const lugs = containing(":hex-flight-pads:").filter((piece) =>
    piece.id.includes(":capture-lug:"));
  assert.equal(decks.length, NIMBUS_HEX_PAD_IDS.length);
  assert.equal(lugs.length, NIMBUS_HEX_PAD_IDS.length * 6);
  assert.deepEqual(
    new Set(decks.map((piece) => {
      const id = NIMBUS_HEX_PAD_IDS.find((candidate) =>
        piece.id.includes(`:${candidate}:deck:`));
      assert.ok(id, piece.id);
      return id;
    })),
    new Set(NIMBUS_HEX_PAD_IDS),
  );
  assert.ok(NIMBUS_HEX_PAD_IDS.filter((id) => id.startsWith("production-")).length >= 4);
  assert.ok(NIMBUS_HEX_PAD_IDS.filter((id) => id.startsWith("shipyard-")).length >= 3);
});

test("three external climbing cranes are complete sectional machines", () => {
  const cranePieces = containing(":atmosphere-construction-cranes:");
  const mastChords = cranePieces.filter((piece) =>
    piece.id.includes(":mast-section:") && piece.id.includes(":chord:"));
  const craneIds = new Set(mastChords.map((piece) => {
    const match = piece.id.match(/construction-crane:(\d+):mast-section:/);
    assert.ok(match, piece.id);
    return Number(match[1]);
  }));

  assert.equal(craneIds.size, NIMBUS_ATMOSPHERIC_CONSTRUCTION_CRANE_COUNT);
  assert.equal(containing(":construction-crane:").filter((piece) =>
    piece.id.includes(":foundation-anchor:")).length,
  NIMBUS_ATMOSPHERIC_CONSTRUCTION_CRANE_COUNT);
  assert.equal(cranePieces.filter((piece) => piece.id.includes(":climbing-base:")).length, 0);
  assert.equal(cranePieces.filter((piece) => piece.id.includes(":main-boom:")).length, 0);
  assert.equal(cranePieces.filter((piece) => piece.id.includes(":kingpost:")).length, 0);

  for (const crane of craneIds) {
    const token = `construction-crane:${crane}:`;
    const own = cranePieces.filter((piece) => piece.id.includes(token));
    const ownMast = own.filter((piece) =>
      piece.id.includes(":mast-section:") && piece.id.includes(":chord:"));
    const mastSections = new Set(ownMast.map((piece) => {
      const match = piece.id.match(/:mast-section:(\d+):chord:/);
      assert.ok(match, piece.id);
      return Number(match[1]);
    }));
    assert.ok(mastSections.size >= 28, `crane ${crane} mast sections: ${mastSections.size}`);
    assert.equal(ownMast.length, mastSections.size * 4);
    assert.equal(own.filter((piece) => piece.id.includes(":mast-section:")
      && piece.id.includes(":brace:")).length, mastSections.size * 8);
    assert.equal(own.filter((piece) => piece.id.includes(":mast-section:")
      && piece.id.includes(":diaphragm:")).length, mastSections.size * 4);

    const tieLevels = new Set(own.filter((piece) => piece.id.includes(":tie:")
      && piece.id.includes(":building-anchor:")).map((piece) => {
      const match = piece.id.match(/:tie:(\d+):building-anchor:/);
      assert.ok(match, piece.id);
      return Number(match[1]);
    }));
    assert.deepEqual(tieLevels, new Set([2, 7, 12, 16]));
    assert.equal(own.filter((piece) => piece.id.includes(":tie:")
      && piece.id.includes(":strut:")).length, tieLevels.size * 2);

    const jibBottom = own.filter((piece) =>
      piece.id.includes(":jib:section:") && piece.id.includes(":bottom-chord:-1:"));
    assert.ok(jibBottom.length >= 12, `crane ${crane} jib sections: ${jibBottom.length}`);
    assert.ok(
      jibBottom.reduce((length, piece) => length + piece.size[0], 0) >= 59,
      `crane ${crane} jib is too short`,
    );
    assert.equal(own.filter((piece) => piece.id.includes(":operator-cab:")).length, 1);
    assert.equal(own.filter((piece) => piece.id.includes(":hoist-winch:")).length, 1);
    assert.equal(own.filter((piece) => piece.id.includes(":trolley-winch:")).length, 1);
    assert.equal(own.filter((piece) => piece.id.includes(":trolley-frame:")).length, 1);
    assert.equal(own.filter((piece) => piece.id.includes(":counterweight:")).length, 5);
    assert.equal(own.filter((piece) => piece.id.includes(":hook-block:")).length, 1);
  }
});

test("the rim tower has twenty deep load paths and twelve independent floor sectors", () => {
  assert.equal(containing(":tower-foundation:caisson:").length, NIMBUS_TOWER_COLUMN_COUNT);
  assert.equal(
    containing(":tower-core:column:").length,
    NIMBUS_TOWER_COLUMN_COUNT * NIMBUS_TOWER_FLOORS,
  );
  assert.equal(
    containing(":tower-core:core-wall:").length,
    NIMBUS_TOWER_COLUMN_COUNT * NIMBUS_TOWER_FLOORS,
  );
  assert.equal(
    containing(":tower-floors:slab:").length,
    NIMBUS_TOWER_FLOORS * NIMBUS_TOWER_SECTOR_COUNT * 3,
  );
  assert.equal(containing("shield-pylon:").length, 0);
  assert.equal(containing("shield-frame:").length, 0);
});

test("Nimbus wraps the tower in four orthogonal screens and an ellipsoid crown", () => {
  const damage = emptyBasaltForceFieldDamage(NIMBUS_FORCE_FIELD_PROJECTION);
  const bowl = [-22, 20, 8];
  const tower = [148, 20, 54];
  const incoming = intersectBasaltForceField(
    NIMBUS_FORCE_FIELD_PROJECTION,
    bowl,
    tower,
    damage,
  );
  const outgoing = intersectBasaltForceField(
    NIMBUS_FORCE_FIELD_PROJECTION,
    tower,
    bowl,
    damage,
  );

  const faceNetworks = new Set([
    "nimbus-east",
    "nimbus-west",
    "nimbus-north",
    "nimbus-south",
  ]);
  const faceCells = NIMBUS_FORCE_FIELD_CELLS.filter(
    (cell) => faceNetworks.has(cell.network),
  );
  const crownCells = NIMBUS_FORCE_FIELD_CELLS.filter(
    (cell) => cell.network === "nimbus-crown",
  );
  assert.ok(NIMBUS_FORCE_FIELD_PROJECTION.count >= 2_500);
  assert.deepEqual(
    new Set(faceCells.map((cell) => cell.network)),
    new Set(["nimbus-east", "nimbus-west", "nimbus-north", "nimbus-south"]),
  );
  assert.equal(
    faceCells.every((cell) =>
      cell.normal[1] === 0
      && Math.abs(cell.normal[0]) + Math.abs(cell.normal[2]) === 1,
    ),
    true,
  );
  assert.ok(crownCells.some((cell) => cell.normal[1] > 0.99));
  assert.ok(crownCells.some((cell) => cell.normal[1] < 0.02));
  assert.ok(NIMBUS_FORCE_FIELD_PROJECTION.bounds[4] >= 123.5);
  assert.ok(incoming);
  assert.equal(outgoing, null);
});

test("the spindle shield follows the site's radial and tangential basis", () => {
  const damage = emptyBasaltForceFieldDamage(NIMBUS_FORCE_FIELD_PROJECTION);
  const bowl = [-22, 90, 8];
  const tower = [
    NIMBUS_SPINDLE_TOWER_CENTRE[0],
    90,
    NIMBUS_SPINDLE_TOWER_CENTRE[1],
  ];
  const incoming = intersectBasaltForceField(
    NIMBUS_FORCE_FIELD_PROJECTION,
    bowl,
    tower,
    damage,
  );
  const outgoing = intersectBasaltForceField(
    NIMBUS_FORCE_FIELD_PROJECTION,
    tower,
    bowl,
    damage,
  );
  const faceCells = NIMBUS_FORCE_FIELD_CELLS.filter((cell) =>
    cell.network.startsWith("nimbus-spindle-")
      && cell.network !== "nimbus-spindle-crown",
  );
  const crownCells = NIMBUS_FORCE_FIELD_CELLS.filter(
    (cell) => cell.network === "nimbus-spindle-crown",
  );

  assert.deepEqual(
    new Set(faceCells.map((cell) => cell.network)),
    new Set([
      "nimbus-spindle-outward",
      "nimbus-spindle-inward",
      "nimbus-spindle-clockwise",
      "nimbus-spindle-counterclockwise",
    ]),
  );
  assert.equal(
    faceCells.every((cell) => {
      const radialDot = Math.abs(
        cell.normal[0] * NIMBUS_SPINDLE_RADIAL[0]
          + cell.normal[2] * NIMBUS_SPINDLE_RADIAL[1],
      );
      const tangentDot = Math.abs(
        cell.normal[0] * NIMBUS_SPINDLE_TANGENT[0]
          + cell.normal[2] * NIMBUS_SPINDLE_TANGENT[1],
      );
      return cell.normal[1] === 0 && Math.max(radialDot, tangentDot) > 0.999999;
    }),
    true,
  );
  assert.ok(crownCells.some((cell) => cell.normal[1] > 0.99));
  assert.ok(crownCells.some((cell) => cell.normal[1] < 0.02));
  assert.ok(NIMBUS_FORCE_FIELD_PROJECTION.bounds[4] >= 224);
  assert.ok(incoming);
  assert.equal(outgoing, null);
  assert.equal(containing("shield-pylon:").length, 0);
  assert.equal(containing("shield-frame:").length, 0);
});

test("loss of thirty percent of the outer column ring does not take the tower", () => {
  const removedColumns = new Set(
    containing(":tower-core:column:0:")
      .filter((piece) => [0, 1, 2, 3, 4, 5].some((index) =>
        piece.id.endsWith(`:${index}:piece`),
      ))
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removedColumns);
  const secondary = [...collapsed].filter((id) => !removedColumns.has(id));

  assert.equal(removedColumns.size, 6);
  assert.ok(secondary.length <= 50, `secondary losses: ${secondary.length}`);
  assert.equal(secondary.some((id) => id.includes(":tower-floors:")), false);
  assert.equal(secondary.some((id) => id.includes(":tower-facade:")), false);
});

test("damage to two floor sectors stays in those sectors", () => {
  const removed = new Set(
    pieces
      .filter((piece) =>
        (piece.id.includes(":tower-floor-frame:")
          && /:(?:radial|outer-ring):10:(?:0|1):/.test(piece.id))
        || (piece.id.includes(":tower-floors:")
          && /:slab:10:(?:0|1):/.test(piece.id)),
      )
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.equal(removed.size, 12);
  assert.ok(secondary.length <= 4, `secondary sector losses: ${secondary.length}`);
  assert.equal(
    secondary.every((id) =>
      /:tower-facade:panel:11:(?:0|1):piece$/.test(id)
      || /:tower-floor-frame:secondary-ring:10:(?:0|1):/.test(id),
    ),
    true,
  );
});

test("the great machine is a supported construction, not one decorative block", () => {
  assert.ok(containing(":shipyard-machine-frame:frame:").length >= 70);
  assert.ok(containing(":shipyard-machine-frame:stringer:").length >= 60);
  assert.ok(containing(":shipyard-machine-frame:keel:").length >= 25);
  assert.ok(containing(":shipyard-machine-shell:nose:").length >= 15);
  assert.ok(containing(":shipyard-supports:stool:").length >= 120);
  assert.ok(containing(":shipyard-supports:gantry:").length >= 100);
});

test("the atmospheric tower grows from six diagonal inhabited supports", () => {
  const foundations = containing(":atmosphere-foundation:pad:");
  const primaryChords = containing(":atmosphere-primary:support:")
    .filter((piece) => piece.id.includes(":primary:"));
  const liftRails = containing(":atmosphere-lift-truss:lift-shaft:")
    .filter((piece) => piece.id.includes(":rail:"));
  const liftGlass = containing(":atmosphere-lift-truss:lift-shaft:")
    .filter((piece) => piece.id.includes(":glass:"));
  const upperRibs = containing(":atmosphere-primary:upper-rib:");

  assert.equal(foundations.length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT);
  assert.equal(
    primaryChords.length,
    NIMBUS_ATMOSPHERIC_SUPPORT_COUNT
      * NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS
      * 4,
  );
  assert.equal(liftRails.length, primaryChords.length);
  assert.equal(liftGlass.length, primaryChords.length);
  assert.equal(upperRibs.length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT);
  assert.equal(containing("lift-cabin:").length, 0);
  assert.equal(
    containing(":atmosphere-shell:shell:").length,
    NIMBUS_ATMOSPHERIC_BODY_LEVELS * NIMBUS_ATMOSPHERIC_BODY_SECTORS,
  );
  assert.equal(
    containing(":atmosphere-floors:floor-deck:").length,
    NIMBUS_ATMOSPHERIC_BODY_LEVELS * 5,
  );
  assert.equal(containing(":atmosphere-floors:belly-deck:").length, 5);
});

test("the atmospheric body is chamfered, tapered and cut back over its top five metres", () => {
  const local = (piece) => {
    const dx = piece.position[0] - NIMBUS_SHIPYARD_CENTRE[0];
    const dz = piece.position[2] - NIMBUS_SHIPYARD_CENTRE[1];
    return {
      along: dx * Math.cos(NIMBUS_BOWL_YAW) + dz * Math.sin(NIMBUS_BOWL_YAW),
      across: -dx * Math.sin(NIMBUS_BOWL_YAW) + dz * Math.cos(NIMBUS_BOWL_YAW),
    };
  };
  const shellAt = (level) => containing(`:atmosphere-shell:shell:${level}:`);
  const base = shellAt(0);
  const straightTopSide = base.filter((piece) => {
    const match = piece.id.match(/:shell:0:(\d+):piece$/);
    return match && Number(match[1]) <= 7;
  }).map(local);
  assert.equal(straightTopSide.length, 8);
  assert.ok(Math.max(...straightTopSide.map((point) => point.across))
    - Math.min(...straightTopSide.map((point) => point.across)) < 0.2);

  const penultimate = shellAt(NIMBUS_ATMOSPHERIC_BODY_LEVELS - 2).map(local);
  const bevel = shellAt(NIMBUS_ATMOSPHERIC_BODY_LEVELS - 1).map(local);
  assert.equal(NIMBUS_ATMOSPHERIC_TOP_BEVEL_HEIGHT, 5);
  assert.ok(Math.max(...bevel.map((point) => Math.abs(point.along)))
    < Math.max(...penultimate.map((point) => Math.abs(point.along))) - 2);
  assert.ok(Math.max(...bevel.map((point) => Math.abs(point.across)))
    < Math.max(...penultimate.map((point) => Math.abs(point.across))) - 2);
  assert.equal(containing(":atmosphere-fittings:air-channel:").length, 0);
  assert.equal(containing(":atmosphere-crown:atmospheric-blade:").length, 0);
  assert.equal(containing(":atmosphere-crown:atmospheric-head:").length, 0);
});

test("two steel motor nacelles form vertical roof-to-belly air columns", () => {
  assert.equal(containing(":atmosphere-crown:fan:").filter((piece) =>
    piece.id.includes(":motor-nacelle:")).length, NIMBUS_ATMOSPHERIC_FAN_COUNT);
  assert.equal(containing(":atmosphere-crown:fan:").filter((piece) =>
    piece.id.includes(":hub:")).length, NIMBUS_ATMOSPHERIC_FAN_COUNT);
  assert.equal(containing(":atmosphere-crown:fan:").filter((piece) =>
    piece.id.includes(":rotor-blade:")).length, NIMBUS_ATMOSPHERIC_FAN_COUNT * 8);
  const shells = containing(":atmosphere-crown:fan:").filter((piece) =>
    piece.id.includes(":nacelle-shell:"));
  assert.equal(shells.length,
    NIMBUS_ATMOSPHERIC_FAN_COUNT * NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS);
  assert.equal(shells.every((piece) => piece.material === "steel"), true);
  assert.equal(shells.every((piece) =>
    Math.abs(piece.size[1] - (NIMBUS_ATMOSPHERIC_ROOF_Y
      - (NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_BODY_BOTTOM))) < 0.2),
  true);
  assert.equal(containing(":atmosphere-primary:fan:").filter((piece) =>
    piece.id.includes(":duct-longitudinal:")).length,
  NIMBUS_ATMOSPHERIC_FAN_COUNT * NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS);
  assert.equal(containing(":atmosphere-primary:fan:").filter((piece) =>
    piece.id.includes(":ring:")).length,
  NIMBUS_ATMOSPHERIC_FAN_COUNT * NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS * 4);

  for (const blade of containing(":atmosphere-crown:fan:").filter((piece) =>
    piece.id.includes(":rotor-blade:"))) {
    const normal = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...(blade.rotation ?? [0, 0, 0]))),
    );
    assert.ok(Math.abs(normal.y) > 0.995, `${blade.id} is not horizontal`);
  }
  assert.equal(NIMBUS_ATMOSPHERIC_DUCT_RADIUS, 9.2);
});

test("all six inhabited supports visibly terminate in ground shoes and facade receivers", () => {
  assert.equal(containing(":atmosphere-fittings:support-foot:").filter((piece) =>
    piece.id.includes(":anchor-shoe:")).length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT * 4);
  assert.equal(containing(":atmosphere-primary:support-foot:").filter((piece) =>
    piece.id.includes(":pinned-seat:")).length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT * 4);
  assert.equal(containing(":atmosphere-primary:support-head:").filter((piece) =>
    piece.id.includes(":receiver-plate:")).length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT);
  assert.equal(containing(":atmosphere-primary:support-head:").filter((piece) =>
    piece.id.includes(":gusset:")).length, NIMBUS_ATMOSPHERIC_SUPPORT_COUNT * 4);

  for (const station of NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS) {
    for (const side of [-1, 1]) {
      const [base, top] = nimbusAtmosphericSupportEndpoints(station, side);
      const dx = top[0] - NIMBUS_SHIPYARD_CENTRE[0];
      const dz = top[2] - NIMBUS_SHIPYARD_CENTRE[1];
      const across = -dx * Math.sin(NIMBUS_BOWL_YAW)
        + dz * Math.cos(NIMBUS_BOWL_YAW);
      assert.ok(Math.abs(Math.abs(across) - 31) < 1e-6);
      assert.ok(base[1] > nimbusGroundUnder(base[0], base[2]).top);
    }
  }
});

test("the six support trusses clear the measured shipyard work envelope", () => {
  const datum = nimbusGroundUnder(
    NIMBUS_SHIPYARD_CENTRE[0],
    NIMBUS_SHIPYARD_CENTRE[1],
  ).top;
  const sine = Math.sin(NIMBUS_BOWL_YAW);
  const cosine = Math.cos(NIMBUS_BOWL_YAW);
  let minimumClearance = Number.POSITIVE_INFINITY;
  let offender = "";

  for (const piece of containing(":atmosphere-primary:support:")
    .filter((candidate) => candidate.id.includes(":primary:"))) {
    const quaternion = new Quaternion().setFromEuler(
      new Euler(...(piece.rotation ?? [0, 0, 0])),
    );
    const rodAxis = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    for (const sign of [-1, 1]) {
      const endpoint = new Vector3(...piece.position).addScaledVector(
        rodAxis,
        sign * piece.size[0] / 2,
      );
      if (endpoint.y > datum + NIMBUS_ATMOSPHERIC_CLEAR_HEIGHT) continue;
      const dx = endpoint.x - NIMBUS_SHIPYARD_CENTRE[0];
      const dz = endpoint.z - NIMBUS_SHIPYARD_CENTRE[1];
      const across = -dx * sine + dz * cosine;
      const clearance = Math.abs(across)
        - piece.size[1] / 2
        - NIMBUS_ATMOSPHERIC_WORK_HALF_WIDTH;
      if (clearance < minimumClearance) {
        minimumClearance = clearance;
        offender = piece.id;
      }
    }
  }

  assert.ok(
    minimumClearance >= 1.5,
    `${offender} leaves only ${minimumClearance.toFixed(3)}m clearance`,
  );
});

test("loss of one complete atmospheric support stays local", () => {
  const removed = new Set(
    pieces
      .filter((piece) =>
        piece.id.includes(":atmosphere-primary:support:0:")
        || piece.id.includes(":atmosphere-lift-truss:lift-shaft:0:")
        || piece.id.includes(":atmosphere-fittings:support-stair:0:"),
      )
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.ok(removed.size >= 200, `support pieces removed: ${removed.size}`);
  assert.deepEqual(secondary, []);
  assert.equal(
    [...collapsed].some((id) => id.includes(":atmosphere-shell:")),
    false,
  );
  assert.equal(
    [...collapsed].some((id) => id.includes(":atmosphere-floors:")),
    false,
  );
});

test("the spindle occupies a measured outer-rim site instead of an arbitrary side", () => {
  const centreRadius = Math.hypot(...NIMBUS_SPINDLE_TOWER_CENTRE);
  const landMargin = nimbusLandRadiusAt(...NIMBUS_SPINDLE_TOWER_CENTRE)
    - centreRadius;
  const basisDot = NIMBUS_SPINDLE_RADIAL[0] * NIMBUS_SPINDLE_TANGENT[0]
    + NIMBUS_SPINDLE_RADIAL[1] * NIMBUS_SPINDLE_TANGENT[1];
  const oldTowerDistance = Math.hypot(
    NIMBUS_SPINDLE_TOWER_CENTRE[0] - NIMBUS_TOWER_CENTRE[0],
    NIMBUS_SPINDLE_TOWER_CENTRE[1] - NIMBUS_TOWER_CENTRE[1],
  );

  assert.ok(centreRadius >= 155, `outer radius: ${centreRadius}`);
  assert.ok(landMargin >= 30, `land margin: ${landMargin}`);
  assert.ok(oldTowerDistance >= 220, `tower separation: ${oldTowerDistance}`);
  assert.ok(Math.abs(Math.hypot(...NIMBUS_SPINDLE_RADIAL) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...NIMBUS_SPINDLE_TANGENT) - 1) < 1e-12);
  assert.ok(Math.abs(basisDot) < 1e-12, `basis dot: ${basisDot}`);
});

test("the next rim tower is a genuinely vertical spindle skyscraper", () => {
  const facade = containing(":spindle-facade:panel:");
  const floorRadius = new Map();
  for (const piece of facade) {
    const match = piece.id.match(/:panel:(\d+):\d+:piece$/);
    assert.ok(match, piece.id);
    const floor = Number(match[1]);
    const radius = Math.hypot(
      piece.position[0] - NIMBUS_SPINDLE_TOWER_CENTRE[0],
      piece.position[2] - NIMBUS_SPINDLE_TOWER_CENTRE[1],
    );
    const values = floorRadius.get(floor) ?? [];
    values.push(radius);
    floorRadius.set(floor, values);
  }
  const radii = [...floorRadius.entries()]
    .sort(([left], [right]) => left - right)
    .map(([floor, values]) => ({
      floor,
      radius: values.reduce((sum, value) => sum + value, 0) / values.length,
    }));
  const widest = radii.reduce((current, candidate) =>
    candidate.radius > current.radius ? candidate : current,
  );
  const bodyHeight = NIMBUS_SPINDLE_ROOF_Y - NIMBUS_SPINDLE_STRUCTURE_BASE_Y;

  assert.equal(facade.length, NIMBUS_SPINDLE_FLOORS * NIMBUS_SPINDLE_FACADE_SECTORS);
  assert.equal(bodyHeight, NIMBUS_SPINDLE_FLOORS * NIMBUS_SPINDLE_FLOOR_HEIGHT);
  assert.ok(bodyHeight / (widest.radius * 2) >= 5, `slenderness: ${bodyHeight / (widest.radius * 2)}`);
  assert.ok(widest.floor >= 10 && widest.floor <= 15, `widest floor: ${widest.floor}`);
  assert.ok(radii.at(-1).radius < widest.radius * 0.65);
  for (let index = widest.floor + 1; index < radii.length; index += 1) {
    assert.ok(
      radii[index].radius <= radii[index - 1].radius + 1e-6,
      `radius grows again at floor ${radii[index].floor}`,
    );
  }
});

test("the spindle keeps deep redundant load paths and two core stairs", () => {
  assert.equal(
    containing(":spindle-foundation:caisson:").length,
    NIMBUS_SPINDLE_COLUMN_COUNT,
  );
  assert.equal(
    containing(":spindle-core:column:").length,
    NIMBUS_SPINDLE_COLUMN_COUNT * NIMBUS_SPINDLE_FLOORS,
  );
  assert.equal(
    containing(":spindle-core:core-wall:").length,
    NIMBUS_SPINDLE_COLUMN_COUNT * NIMBUS_SPINDLE_FLOORS,
  );
  assert.equal(
    containing(":spindle-floors:slab:").length,
    NIMBUS_SPINDLE_FLOORS * NIMBUS_SPINDLE_FLOOR_SECTORS * 2,
  );
  assert.equal(
    containing(":spindle-stairs:route:").filter((piece) => piece.id.includes(":flight:")).length,
    NIMBUS_SPINDLE_FLOORS * 2 * 2,
  );
  assert.equal(
    containing(":spindle-stairs:route:").filter((piece) => piece.id.includes(":landing:")).length,
    NIMBUS_SPINDLE_FLOORS * 2,
  );
  for (const caisson of containing(":spindle-foundation:caisson:")) {
    const ground = nimbusGroundUnder(caisson.position[0], caisson.position[2]).top;
    assert.ok(
      caisson.position[1] - caisson.size[1] / 2
        <= ground - NIMBUS_SPINDLE_FOUNDATION_DEPTH + 1e-9,
      caisson.id,
    );
  }
});

test("loss of thirty percent of the spindle column ring does not detach floors", () => {
  const removed = new Set(
    containing(":spindle-core:column:0:")
      .filter((piece) => [0, 1, 2, 3, 4, 5].some((index) =>
        piece.id.endsWith(`:${index}:piece`),
      ))
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.equal(removed.size, 6);
  assert.equal(
    secondary.every((id) => id.includes(":spindle-core:column:")),
    true,
  );
  assert.equal(secondary.some((id) => id.includes(":spindle-floors:")), false);
  assert.equal(secondary.some((id) => id.includes(":spindle-facade:")), false);
  assert.equal(secondary.some((id) => id.includes(":spindle-core:core-wall:")), false);
});

test("damage to two spindle floor sectors remains sector-local", () => {
  const removed = new Set(
    pieces
      .filter((piece) =>
        (piece.id.includes(":spindle-floor-frame:")
          && /:(?:radial|outer-ring):22:(?:0|1):/.test(piece.id))
        || (piece.id.includes(":spindle-floors:")
          && /:slab:22:(?:0|1):/.test(piece.id)),
      )
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.equal(removed.size, 10);
  assert.ok(secondary.length <= 2, `secondary losses: ${secondary.length}`);
  assert.equal(
    secondary.every((id) => /:spindle-fittings:mullion:22:(?:0|1|2):piece$/.test(id)),
    true,
  );
});

test("the vertical dock site and mouth follow the real yard-to-saddle corridor", () => {
  const centreRadius = Math.hypot(...NIMBUS_VERTICAL_DOCK_CENTRE);
  const landMargin = nimbusLandRadiusAt(...NIMBUS_VERTICAL_DOCK_CENTRE)
    - centreRadius;
  const toYard = [
    NIMBUS_SHIPYARD_CENTRE[0] - NIMBUS_VERTICAL_DOCK_CENTRE[0],
    NIMBUS_SHIPYARD_CENTRE[1] - NIMBUS_VERTICAL_DOCK_CENTRE[1],
  ];
  const toYardLength = Math.hypot(...toYard);
  const forwardDot = (
    toYard[0] * NIMBUS_DOCK_FORWARD[0]
      + toYard[1] * NIMBUS_DOCK_FORWARD[1]
  ) / toYardLength;
  const basisDot = NIMBUS_DOCK_FORWARD[0] * NIMBUS_DOCK_ACROSS[0]
    + NIMBUS_DOCK_FORWARD[1] * NIMBUS_DOCK_ACROSS[1];

  assert.ok(centreRadius >= 145, `dock radius: ${centreRadius}`);
  assert.ok(landMargin >= 44, `land margin: ${landMargin}`);
  assert.ok(forwardDot > 0.999999, `mouth-to-yard dot: ${forwardDot}`);
  assert.ok(Math.abs(basisDot) < 1e-12, `basis dot: ${basisDot}`);
});

test("the dock is one C-shaped building with three independent vertical roots", () => {
  const columnCount = 14 * NIMBUS_DOCK_REAR_FLOORS
    + 10 * NIMBUS_DOCK_SERVICE_FLOORS
    + 10 * NIMBUS_DOCK_HABITATION_FLOORS;
  const coreCount = 7 * NIMBUS_DOCK_REAR_FLOORS
    + 5 * NIMBUS_DOCK_SERVICE_FLOORS
    + 5 * NIMBUS_DOCK_HABITATION_FLOORS;
  const floorCount = 7 * NIMBUS_DOCK_REAR_FLOORS
    + 5 * NIMBUS_DOCK_SERVICE_FLOORS
    + 5 * NIMBUS_DOCK_HABITATION_FLOORS;
  const caissons = [
    ...containing(":dock-foundation:caisson:"),
    ...containing(":dock-foundation:core-caisson:"),
  ];

  assert.equal(caissons.length, 51);
  assert.equal(containing(":dock-primary:column:").length, columnCount);
  assert.equal(
    containing(":dock-primary:rear-core:").length
      + containing(":dock-primary:cheek-core:").length,
    coreCount,
  );
  assert.equal(
    containing(":dock-floors:rear-slab:").length
      + containing(":dock-floors:cheek-slab:").length,
    floorCount,
  );
  assert.equal(
    NIMBUS_DOCK_REAR_ROOF_Y - NIMBUS_DOCK_STRUCTURE_BASE_Y,
    NIMBUS_DOCK_REAR_FLOORS * NIMBUS_DOCK_FLOOR_HEIGHT,
  );
  assert.ok(NIMBUS_DOCK_REAR_FLOORS > NIMBUS_DOCK_SERVICE_FLOORS);
  assert.ok(NIMBUS_DOCK_SERVICE_FLOORS > NIMBUS_DOCK_HABITATION_FLOORS);
  assert.equal(containing(":dock-primary:bridge:").length, 0);
  assert.equal(containing(":dock-frame:bridge:").length, 0);

  for (const caisson of caissons) {
    const ground = nimbusGroundUnder(caisson.position[0], caisson.position[2]).top;
    assert.ok(
      caisson.position[1] - caisson.size[1] / 2
        <= ground - NIMBUS_DOCK_FOUNDATION_DEPTH + 1e-9,
      caisson.id,
    );
  }
});

test("the dock preserves a full-height physical machine void", () => {
  const structuralTokens = [
    ":dock-primary:",
    ":dock-floors:",
    ":dock-facade:",
    ":dock-frame:",
    ":dock-lifts:",
    ":dock-stairs:",
  ];
  const blockers = [];
  const voidBottom = NIMBUS_DOCK_STRUCTURE_BASE_Y + 4;
  const voidTop = NIMBUS_DOCK_STRUCTURE_BASE_Y + NIMBUS_DOCK_VOID_HEIGHT;

  for (const piece of pieces.filter((candidate) =>
    structuralTokens.some((token) => candidate.id.includes(token)))) {
    const quaternion = new Quaternion().setFromEuler(
      new Euler(...(piece.rotation ?? [0, 0, 0])),
    );
    const localCorners = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = new Vector3(
            x * piece.size[0] / 2,
            y * piece.size[1] / 2,
            z * piece.size[2] / 2,
          ).applyQuaternion(quaternion).add(new Vector3(...piece.position));
          localCorners.push(nimbusDockLocalCoordinates(corner.toArray()));
        }
      }
    }
    const acrossMinimum = Math.min(...localCorners.map((corner) => corner[0]));
    const acrossMaximum = Math.max(...localCorners.map((corner) => corner[0]));
    const forwardMinimum = Math.min(...localCorners.map((corner) => corner[1]));
    const forwardMaximum = Math.max(...localCorners.map((corner) => corner[1]));
    const yMinimum = Math.min(...localCorners.map((corner) => corner[2]));
    const yMaximum = Math.max(...localCorners.map((corner) => corner[2]));
    const overlapsHeight = yMaximum > voidBottom && yMinimum < voidTop;
    const overlapsAcross = acrossMaximum > -NIMBUS_DOCK_VOID_HALF_WIDTH
      && acrossMinimum < NIMBUS_DOCK_VOID_HALF_WIDTH;
    const overlapsForward = forwardMaximum > NIMBUS_DOCK_VOID_FORWARD_RANGE[0]
      && forwardMinimum < NIMBUS_DOCK_VOID_FORWARD_RANGE[1];
    if (overlapsHeight && overlapsAcross && overlapsForward) {
      blockers.push(piece.id);
    }
  }

  assert.deepEqual(blockers, []);
});

test("the dock shield follows the C and leaves both machine approaches open", () => {
  const dockCells = NIMBUS_FORCE_FIELD_CELLS.filter((cell) =>
    cell.network.startsWith("nimbus-dock-"));
  const projection = createBasaltForceFieldProjection(dockCells);
  const damage = emptyBasaltForceFieldDamage(projection);
  const point = (across, forward, y) => [
    NIMBUS_VERTICAL_DOCK_CENTRE[0]
      + NIMBUS_DOCK_ACROSS[0] * across
      + NIMBUS_DOCK_FORWARD[0] * forward,
    y,
    NIMBUS_VERTICAL_DOCK_CENTRE[1]
      + NIMBUS_DOCK_ACROSS[1] * across
      + NIMBUS_DOCK_FORWARD[1] * forward,
  ];

  assert.deepEqual(
    new Set(dockCells.map((cell) => cell.network)),
    new Set([
      "nimbus-dock-rear",
      "nimbus-dock-service",
      "nimbus-dock-habitation",
      "nimbus-dock-rear-crown",
      "nimbus-dock-service-crown",
      "nimbus-dock-habitation-crown",
    ]),
  );
  assert.ok(intersectBasaltForceField(
    projection,
    point(0, -55, 60),
    point(0, -15, 60),
    damage,
  ));
  assert.ok(intersectBasaltForceField(
    projection,
    point(-55, 0, 60),
    point(-30, 0, 60),
    damage,
  ));
  assert.ok(intersectBasaltForceField(
    projection,
    point(55, 0, 60),
    point(30, 0, 60),
    damage,
  ));
  assert.equal(intersectBasaltForceField(
    projection,
    point(0, 45, 60),
    point(0, 0, 60),
    damage,
  ), null);
  assert.equal(intersectBasaltForceField(
    projection,
    point(0, 0, 190),
    point(0, 0, 10),
    damage,
  ), null);
  assert.equal(containing("shield-pylon:").length, 0);
  assert.equal(containing("shield-frame:").length, 0);
});

test("losing one complete dock cheek foundation cannot pull down the spine", () => {
  const removed = new Set(
    pieces
      .filter((piece) =>
        piece.id.includes(":dock-foundation:caisson:service:")
        || piece.id.includes(":dock-foundation:core-caisson:cheek:-1:"),
      )
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.equal(removed.size, 15);
  assert.equal(
    secondary.every((id) => id.includes(":dock-foundation:cheek-raft:-1:")),
    true,
  );
  assert.equal(secondary.some((id) => id.includes(":dock-primary:rear-core:")), false);
  assert.equal(secondary.some((id) => id.includes(":dock-primary:cheek-core:1:")), false);
  assert.equal(secondary.some((id) => id.includes(":dock-floors:rear-slab:")), false);
});

test("damage to two rear dock sectors remains local", () => {
  const removed = new Set(
    pieces
      .filter((piece) =>
        (piece.id.includes(":dock-floors:rear-slab:18:")
          && /:(?:2|3):piece$/.test(piece.id))
        || (piece.id.includes(":dock-frame:rear-beam:18:")
          && /:(?:2|3):piece$/.test(piece.id)),
      )
      .map((piece) => piece.id),
  );
  const collapsed = nimbusScene.resolveStructuralCollapse(removed);
  const secondary = [...collapsed].filter((id) => !removed.has(id));

  assert.equal(removed.size, 4);
  assert.deepEqual(secondary, []);
});
