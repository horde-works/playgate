import assert from "node:assert/strict";
import test from "node:test";
import { dutchPolderPrefabLibrary } from "../games/make-a-mess/src/content/prefabs/dutchPolderPrefabs.ts";
import { compileSceneDocument } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import {
  DUTCH_POLDER_EAST_VECTOR,
  DUTCH_POLDER_FIELD_PLACEMENTS,
  DUTCH_POLDER_NORTH_VECTOR,
  DUTCH_POLDER_OBJECT_PLACEMENTS,
  dutchPolderDocument,
  dutchPolderFieldIsClear,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderDocument.ts";
import {
  DUTCH_POLDER_BRIDGE_SEATS,
  DUTCH_POLDER_BUILDING_PLOTS,
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_SHORELINE,
  dutchPolderChannelDistance,
  dutchPolderGroundTopAt,
  dutchPolderPlotToWorld,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";
import {
  dutchPolderCompilation,
  dutchPolderScene,
} from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import { islandIdForScene } from "../games/make-a-mess/src/game/islandTopology.ts";
import { createLandscapeSampler } from "../games/make-a-mess/src/content/landscape/landscapeSampler.ts";
import {
  DUTCH_POLDER_TERRAIN_COVER_DEPTH,
  dutchPolderCoverCells,
  dutchPolderLandscapeDocument,
  dutchPolderLandscapeMesh,
  dutchPolderPhysicalCellAt,
  dutchPolderPhysicalTopAt,
  dutchPolderVisualTopAt,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";
import { equinoxSunDirection } from "../games/make-a-mess/src/game/timeOfDay.ts";

test("the complete polder compiles with no unsupported member", () => {
  assert.equal(dutchPolderScene.resolveStructuralCollapse(new Set()).size, 0);
  assert.equal(dutchPolderCompilation.artifact.pieceCount >= 5_000, true);
  // 19 + три префаба головчатой ивы (core:willow:71..73) + два префаба
  // плакучей (core:weeping-willow:81..82) + три instance-scoped варианта
  // освещённых мостов B1/B3/B5. B2/B4 используют исходный тёмный prefab.
  // 27 + одиннадцать посадок дворового кита занского дома (десять предметов,
  // из них забор одним модулем, плюс отдельная калитка). Рама для фасоли в
  // мир не посажена — известный дефект опирания внутри самого объекта.
  assert.equal(dutchPolderCompilation.artifact.prefabIds.length, 38);
  // Группы: к прежним двадцати добавились две группы двора занского дома —
  // наземная и швартовная. Они разделены, потому что садятся по разным
  // правилам отметки: одна от грунта, другая от уреза воды.
  assert.equal(dutchPolderCompilation.artifact.groupCount, 22);
  const earthCells = dutchPolderScene.breakablePieces.filter((piece) =>
    piece.id.includes(":terrain:cell:")
  );
  const coverCells = dutchPolderScene.breakablePieces.filter((piece) =>
    piece.id.includes(":terrain-surface:cover:")
  );
  assert.ok(earthCells.length > 1_000);
  assert.equal(coverCells.length, dutchPolderCoverCells.length);
  assert.equal(coverCells.length, dutchPolderLandscapeMesh.triangleCount / 2);
  assert.ok(earthCells.every((piece) =>
    piece.foundation && piece.intactVisible !== false && piece.intactCollider !== false
  ));
  assert.ok(coverCells.every((piece) =>
    piece.material === "grass" &&
    piece.landscapeSurface === "dutch-polder-ground" &&
    piece.intactVisible === false &&
    piece.intactCollider === false
  ));
  assert.equal(dutchPolderScene.landscapeVisual?.material, "grass");
  assert.equal(dutchPolderScene.landscapeVisual?.landscapeSurface, "dutch-polder-ground");
  assert.ok((dutchPolderScene.landscapeVisual?.chunks.length ?? 100) < 60);
  assert.ok(dutchPolderScene.landscapeVisual?.chunks.every((chunk) =>
    chunk.triangleOwners.length === chunk.indices.length / 3
  ));
  assert.equal(dutchPolderScene.landscapeVisual?.destructionShell?.depth, 0.36);
  assert.ok(dutchPolderScene.landscapeVisual?.chunks.some((chunk) =>
    (chunk.shellEdges?.length ?? 0) > 0
  ));
  const landscapeOwners = new Set(
    dutchPolderScene.landscapeVisual?.chunks.flatMap((chunk) => chunk.ownerPieceIds),
  );
  assert.equal(landscapeOwners.size, coverCells.length);
  assert.ok([...landscapeOwners].every((pieceId) =>
    dutchPolderScene.breakablePieceById.has(pieceId)
  ));
  assert.deepEqual(
    [...new Set(coverCells.map((piece) => piece.size[0]))].sort((a, b) => a - b),
    [2.04],
  );
  for (const cover of coverCells.slice(0, 50)) {
    assert.ok(dutchPolderPhysicalCellAt(cover.position[0], cover.position[2]));
    assert.equal(
      cover.volume,
      dutchPolderLandscapeMesh.minimumCellSize ** 2 *
        DUTCH_POLDER_TERRAIN_COVER_DEPTH,
    );
  }
});

test("polder vegetation can attach to the rendered adaptive terrain blocks", () => {
  for (const cell of dutchPolderLandscapeMesh.cells) {
    assert.ok(dutchPolderPhysicalCellAt(cell.center[0], cell.center[1]));
    assert.equal(
      dutchPolderPhysicalTopAt(cell.center[0], cell.center[1]),
      cell.elevation,
    );
  }
});

test("polder visual height samples the actual intact landscape triangles", () => {
  for (const chunk of dutchPolderLandscapeMesh.chunks.slice(0, 4)) {
    for (const [x, y, z] of chunk.vertices.slice(0, 40)) {
      assert.ok(Math.abs(dutchPolderVisualTopAt(x, z) - y) < 1e-9);
    }
  }
});

test("smoothed turf never lets its stepped earth owner pierce the intact skin", () => {
  const cellById = new Map(
    dutchPolderLandscapeMesh.cells.map((cell) => [cell.id, cell]),
  );
  for (const chunk of dutchPolderLandscapeMesh.chunks) {
    for (let triangle = 0; triangle < chunk.triangles.length; triangle += 1) {
      const cell = cellById.get(chunk.triangleCells[triangle]);
      assert.ok(cell);
      const minimumSkinHeight = cell.elevation -
        DUTCH_POLDER_TERRAIN_COVER_DEPTH + 0.024;
      for (const vertexIndex of chunk.triangles[triangle]) {
        assert.ok(
          chunk.vertices[vertexIndex][1] >= minimumSkinHeight,
          `${cell.id} protrudes at triangle ${triangle}`,
        );
      }
    }
  }
});

test("four mill sail crosses remain complete static construction without wind cloth", () => {
  assert.equal(dutchPolderScene.constantRotorDefinitions.length, 0);
  for (const id of ["m1-rotor", "m2-rotor", "m3-rotor", "m4-rotor"]) {
    const pieces = dutchPolderScene.breakableClusters
      .find((cluster) => cluster.id === `dutch-polder:${id}`)?.pieces ?? [];
    assert.ok(pieces.length > 40);
    assert.equal(pieces.some((piece) => piece.material === "cloth"), false);
  }
  assert.equal(JSON.stringify(dutchPolderDocument).includes("windVector"), false);
  assert.equal(JSON.stringify(dutchPolderDocument).includes("aerodynamic"), false);
});

test("channels are dry depressions in the shared surface", () => {
  const proxies = dutchPolderScene.breakablePieces.filter((piece) =>
    piece.id.includes(":canal-proxy:")
  );
  assert.equal(proxies.length, 0);
  assert.equal(dutchPolderLandscapeDocument.water, "none");
  const sample = createLandscapeSampler(dutchPolderLandscapeDocument);
  const channel = DUTCH_POLDER_CHANNELS[0];
  const [x, z] = channel.points[2];
  assert.equal(sample.sample(x, z).groundKind, "bed");
  assert.ok(sample.sample(x, z).elevation < sample.sample(x, z + 8).elevation);
  assert.equal(dutchPolderScene.worldRadius, 79);
  assert.equal(dutchPolderScene.boundaryRadius, 79);
  assert.deepEqual(dutchPolderScene.worldEdgeBoundary, DUTCH_POLDER_SHORELINE);
  assert.equal(islandIdForScene("dutch-polder"), null);
});

test("polder east points dawn light into all four rotor faces", () => {
  assert.deepEqual(dutchPolderScene.solarFrame?.east, DUTCH_POLDER_EAST_VECTOR);
  assert.deepEqual(dutchPolderScene.solarFrame?.north, DUTCH_POLDER_NORTH_VECTOR);
  const sunrise = equinoxSunDirection(0, dutchPolderScene.solarFrame);
  assert.ok(Math.abs(sunrise[1]) < 1e-9);
  for (const placement of DUTCH_POLDER_OBJECT_PLACEMENTS.filter(({ id }) => id.startsWith("m"))) {
    const yaw = Math.PI - placement.bearing * Math.PI / 180;
    const rotorFront = [Math.sin(yaw), Math.cos(yaw)];
    assert.ok(
      sunrise[0] * rotorFront[0] + sunrise[2] * rotorFront[1] > 0.87,
      placement.id,
    );
  }
});

test("the cliff follows the irregular shoreline and leaves channel mouths open", () => {
  assert.equal(DUTCH_POLDER_SHORELINE.length, 18);
  const skirt = dutchPolderDocument.groups.find((group) => group.id === "shoreline-skirt");
  assert.ok(skirt);
  assert.ok(skirt.objects.length > 120);
  for (const object of skirt.objects) {
    const [x, , z] = object.transform.position;
    assert.equal(
      DUTCH_POLDER_CHANNELS.some((channel) =>
        dutchPolderChannelDistance(x, z, channel) <= channel.width / 2 + 1.6
      ),
      false,
      object.id,
    );
    const skirtTop = object.transform.position[1] + object.size[1] / 2;
    assert.ok(
      skirtTop <= dutchPolderGroundTopAt(x, z) - 0.4,
      `${object.id}: skirt top must remain below turf`,
    );
  }
});

test("all five bridge seats are occupied by one canonical bridge", () => {
  const bridgeCluster = dutchPolderScene.breakableClusters.find(
    (cluster) => cluster.id === "dutch-polder:bridges",
  );
  assert.ok(bridgeCluster);
  for (const seat of DUTCH_POLDER_BRIDGE_SEATS) {
    assert.ok(
      bridgeCluster.pieces.some((piece) => piece.id.includes(`:bridges:${seat.id}:bridge-deck:`)),
      seat.id,
    );
  }
});

/** Plan extents and lowest point of one canonical part, in the object's axes. */
const partSeat = (part) => {
  const points = part.kind === "mesh"
    ? part.vertices
    : part.kind === "box"
      ? [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => [
        part.center[0] + sx * part.size[0] / 2,
        part.center[1] + sy * part.size[1] / 2,
        part.center[2] + sz * part.size[2] / 2,
      ])))
      : [part.from, part.to];
  return {
    lowest: Math.min(...points.map(([, y]) => y)),
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, , z]) => z)),
    maxZ: Math.max(...points.map(([, , z]) => z)),
  };
};

test("every building rests on the ground the polder actually renders", () => {
  const sampler = createLandscapeSampler(dutchPolderLandscapeDocument);
  for (const plot of DUTCH_POLDER_BUILDING_PLOTS) {
    for (const part of plot.model.parts) {
      const seat = partSeat(part);
      // Only the parts that touch the object's own ground plane hold it up.
      if (seat.lowest > 0.06) continue;
      const base = plot.elevation + seat.lowest;
      for (let ix = 0; ix <= 6; ix += 1) {
        for (let iz = 0; iz <= 6; iz += 1) {
          const [x, z] = dutchPolderPlotToWorld(
            plot,
            seat.minX + (seat.maxX - seat.minX) * ix / 6,
            seat.minZ + (seat.maxZ - seat.minZ) * iz / 6,
          );
          const where = `${plot.id}/${part.id} at (${x.toFixed(1)}, ${z.toFixed(1)})`;
          // The designed surface under a building is its own levelled pad, to
          // the millimetre. This is the assertion that fails when an object is
          // sited across a terrace edge or inside an excavated canal bank —
          // the Zaan house used to hang 2.25 m and the stolp farm 1.09 m here.
          // How far a given part sits above the object's own ground plane is
          // the object study's business, not the siting's.
          assert.ok(
            Math.abs(plot.elevation - sampler.elevationAt(x, z)) < 0.01,
            `${where}: design surface is ${sampler.elevationAt(x, z).toFixed(3)}, plot datum ${plot.elevation.toFixed(3)}`,
          );
          // The rendered turf skin is allowed to sink toward its stepped earth
          // blocks by the shell's own smoothing budget, and no further.
          // Measured worst: M4 0.22 m at the canal-side corner of its brick
          // ring, then M1 0.11, M3 0.09, H2 0.05, H1 0.01.
          const air = base - dutchPolderVisualTopAt(x, z);
          assert.ok(
            air < DUTCH_POLDER_TERRAIN_COVER_DEPTH,
            `${where}: hangs ${air.toFixed(3)} m over the rendered turf`,
          );
          assert.ok(air > -0.4, `${where}: buried ${(-air).toFixed(3)} m`);
        }
      }
    }
  }
});

test("field modules remain outside channels and accepted object reserves", () => {
  // Five, not seven: `west-red` stood where the Zaan house now stands and
  // `west-yellow` inside its yard. Bulb parcels return to the west with the
  // hamlet, cut as parcels rather than as free-standing beds.
  assert.equal(DUTCH_POLDER_FIELD_PLACEMENTS.length, 5);
  for (const field of DUTCH_POLDER_FIELD_PLACEMENTS) {
    assert.equal(
      dutchPolderFieldIsClear(field.position[0], field.position[2]),
      true,
      field.id,
    );
  }
});

const tinyDocument = {
  schemaVersion: 1,
  id: "rotor-contract-test",
  title: "Rotor contract",
  environment: "town",
  world: {
    playerSpawn: [0, 1, 3],
    cameraFar: 30,
    center: [0, 0],
    halfExtents: [5, 5],
    safetyFloorY: -2,
  },
  copy: {
    status: "test", eyebrow: "test", heading: "test", ready: "test",
    loading: "test", description: "test", enter: "test",
    returnToGame: "test", reset: "test",
  },
  groups: [{
    id: "rotor",
    label: "Rotor",
    material: "earth",
    supportMode: "linked",
    objects: [{
      kind: "primitive",
      id: "root",
      material: "earth",
      shape: "groundTile",
      size: [1, 1, 1],
      color: "#444444",
      transform: { position: [0, 0, 0] },
    }],
  }],
  constantRotors: [{
    groupId: "rotor",
    pivot: [0, 0, 0],
    axis: [0, 0, 1],
    radiansPerSecond: 0.2,
  }],
};

test("scene compiler resolves and rejects constant-rotor contracts", () => {
  const compiled = compileSceneDocument(tinyDocument, new Map());
  assert.equal(compiled.scene.constantRotorDefinitions[0].clusterId, "rotor-contract-test:rotor");

  assert.throws(
    () => compileSceneDocument({ ...tinyDocument, constantRotors: [{ ...tinyDocument.constantRotors[0], groupId: "missing" }] }, new Map()),
    /missing group/,
  );
  assert.throws(
    () => compileSceneDocument({ ...tinyDocument, constantRotors: [{ ...tinyDocument.constantRotors[0], axis: [0, 0, 2] }] }, new Map()),
    /unit length/,
  );
  assert.throws(
    () => compileSceneDocument({ ...tinyDocument, constantRotors: [{ ...tinyDocument.constantRotors[0], radiansPerSecond: 0 }] }, new Map()),
    /positive/,
  );
});

test("landscape library reuses core trees and includes field-edge objects", () => {
  for (const id of [
    "core:oak:71",
    "core:oak:72",
    "core:oak:73",
    "dutch:landscape:field-fence",
    "dutch:landscape:hedgerow",
  ]) {
    assert.ok(dutchPolderPrefabLibrary.has(id), id);
  }
});
