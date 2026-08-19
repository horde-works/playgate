import assert from "node:assert/strict";
import test from "node:test";
import { dc3BlockoutObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import {
  AIRPORT_RUNWAY,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_TERMINAL,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import {
  ISLAND_AIRPORT_DC3_PLACEMENT,
  islandAirportDc3Frame,
  islandAirportDc3Group,
  islandAirportDc3Heading,
  islandAirportDc3Nose,
  islandAirportDc3Tail,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { DC3_AIRPLANE_CLASS } from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";
import {
  hingedDoorGroupKey,
  hingedDoorLockedToCarrier,
  plugSlideDoorPolicy,
} from "../games/make-a-mess/src/game/hingedGatePolicy.ts";

const pieces = islandAirportScene.breakablePieces.filter((piece) =>
  piece.clusterId === ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
);

test("the airport compiles with the DC-3 as one initially stable cluster", () => {
  assert.equal(islandAirportScene.resolveStructuralCollapse(new Set()).size, 0);
  assert.equal(pieces.length, dc3AirframeParts().length);
  assert.equal(islandAirportDc3Group.objects.length, dc3AirframeParts().length);
  assert.ok(
    islandAirportScene.breakableClusters.some(
      (cluster) => cluster.id === ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
    ),
  );
});

test("the DC-3 holds on runway 09, nose east, not at the terminal", () => {
  assert.equal(ISLAND_AIRPORT_DC3_PLACEMENT.position[0], AIRPORT_RUNWAY.westDesignatorX);
  assert.equal(ISLAND_AIRPORT_DC3_PLACEMENT.position[1], AIRPORT_RUNWAY_TOP_Y);
  assert.equal(ISLAND_AIRPORT_DC3_PLACEMENT.position[2], AIRPORT_RUNWAY.centreZ);
  assert.ok(islandAirportDc3Heading[0] > 0.99);
  assert.ok(Math.abs(islandAirportDc3Heading[2]) < 0.02);
  assert.ok(islandAirportDc3Nose[0] > islandAirportDc3Tail[0] + 10);
  assert.ok(islandAirportDc3Tail[0] > AIRPORT_RUNWAY.westThresholdX);
  assert.ok(islandAirportDc3Nose[0] < 0);
  assert.ok(
    Math.abs(islandAirportDc3Frame.origin[2] - AIRPORT_TERMINAL.origin[2]) > 30,
    "hold is on the runway, not the terminal apron",
  );
  const span = pieces.reduce(
    (range, piece) => ({
      minX: Math.min(range.minX, piece.position[0] - piece.size[0] / 2),
      maxX: Math.max(range.maxX, piece.position[0] + piece.size[0] / 2),
      minZ: Math.min(range.minZ, piece.position[2] - piece.size[2] / 2),
      maxZ: Math.max(range.maxZ, piece.position[2] + piece.size[2] / 2),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  assert.ok(span.minX > AIRPORT_RUNWAY.westThresholdX - 2);
  assert.ok(span.maxX < AIRPORT_RUNWAY.eastThresholdX);
  assert.ok(Math.abs((span.minZ + span.maxZ) / 2 - AIRPORT_RUNWAY.centreZ) < 2);

  const tailWheel = pieces.find((piece) => piece.id.includes(":gear-tail-wheel:"));
  assert.ok(tailWheel, "three-point sit keeps the tailwheel");
  assert.ok(
    tailWheel.position[1] > AIRPORT_RUNWAY_TOP_Y,
    "tailwheel stands on the slab, not in it",
  );
  assert.ok(
    tailWheel.position[0] > AIRPORT_RUNWAY.westThresholdX,
    "tailwheel is still on the paved strip",
  );
});

test("airport pieces keep Object Lab ids, aluminium skins and steel cage", () => {
  const wing = pieces.find((piece) => piece.id.includes(":wing-right:"));
  const cage = pieces.filter((piece) =>
    piece.id.includes(":fuselage-frame-") || piece.id.includes(":longeron-"),
  );
  assert.equal(wing?.material, "aluminium");
  assert.ok(wing?.visualMesh, "skins must keep the Object Lab mesh");
  assert.equal(wing.visualMesh.doubleSided, false);
  // Гондола перелицована панелями: капотная оболочка, губа NACA и тракт —
  // замкнутые плитки, поэтому двусторонность им больше не нужна. Она была
  // нужна лофту, у которого тракт был одиночной поверхностью.
  // Только ПАНЕЛИ: перегородка и кок остались лофтами B01 намеренно.
  const nacellePanels = pieces.filter((piece) =>
    /:nacelle-right(-lip|-duct)?:bay/.test(piece.id));
  assert.ok(nacellePanels.length > 20, `панелей правой гондолы ${nacellePanels.length}`);
  assert.ok(
    nacellePanels.every((piece) => piece.visualMesh?.doubleSided === false),
    "панель гондолы — замкнутое тело, а не двусторонний лист",
  );
  assert.ok(cage.length > 0 && cage.every((piece) => piece.material === "steel"));
  assert.ok(pieces.some((piece) => piece.actuator?.commandChannel === "throttle:0"));
  assert.ok(pieces.some((piece) => piece.actuator?.commandChannel === "rudder"));
  const hinged = pieces.filter((piece) => piece.hinge);
  assert.ok(
    hinged.every((piece) => piece.id.includes(":cabin-entry-") && piece.id.includes(":board:")),
    "control surfaces stay without a door hinge",
  );
  assert.equal(hinged.length, 8, "four leaves plus four panes");
  assert.ok(
    airVehicles.some(
      (vehicle) => vehicle.clusterId === ISLAND_AIRPORT_DC3_PLACEMENT.clusterId,
    ),
    "машина на полосе и отправляется с неё",
  );
});

test("the nose range sensor sits inside the overlay, not on its tip", () => {
  const sensor = islandAirportDc3Frame.proximitySensors[0];
  assert.ok(sensor, "нет носового датчика");
  const heading = islandAirportDc3Heading;
  const ahead =
    (sensor.point[0] - islandAirportDc3Nose[0]) * heading[0]
    + (sensor.point[1] - islandAirportDc3Nose[1]) * heading[1]
    + (sensor.point[2] - islandAirportDc3Nose[2]) * heading[2];
  assert.ok(
    ahead < -0.08,
    `датчик всё ещё на острие накладки (${ahead.toFixed(3)} м вдоль носа)`,
  );
  const visualFront = ahead + 0.055;
  assert.ok(
    visualFront < -0.01,
    `колпачок датчика всё ещё выглядывает (${visualFront.toFixed(3)} м за остриё)`,
  );
});

test("nav-light caps compile as glass with the bulb nested inside", () => {
  for (const board of ["port", "starboard", "tail"]) {
    const cap = pieces.find((piece) => piece.id.includes(`:nav-light-${board}-cap:`));
    const bulb = pieces.find((piece) => piece.id.includes(`:nav-light-${board}-bulb:`));
    assert.ok(cap && bulb, `нет АНО ${board}`);
    assert.equal(cap.material, "glass", `${board}: колпак скомпилирован не стеклом`);
    assert.equal(cap.color, "#b9c7c8", `${board}: колпак непрозрачный`);
    assert.equal(bulb.material, "glass", `${board}: лампа не видна как стекло`);
    const authored = islandAirportDc3Group.objects.find(
      (object) => object.id === `nav-light-${board}-bulb`,
    );
    assert.ok(authored?.light, `${board}: у лампы нет источника`);
    const half = cap.size.map((value) => value / 2);
    const local = [0, 1, 2].map((axis) => bulb.position[axis] - cap.position[axis]);
    assert.ok(
      local.every((value, axis) => Math.abs(value) < half[axis] - 0.002),
      `${board}: лампа не внутри колпака`,
    );
  }
});

test("cabin entries plug out then slide toward the tail", () => {
  for (const side of ["left", "right"]) {
    for (const station of ["forward", "aft"]) {
      const prefix = `island-airport:dc3:cabin-entry-${side}-${station}`;
      const leaf = pieces.find((piece) => piece.id === `${prefix}:board:0:piece`);
      const pane = pieces.find((piece) => piece.id === `${prefix}:board:1:piece`);
      const seal = pieces.find((piece) => piece.id === `${prefix}-seal:piece`);
      const frame = pieces.find((piece) => piece.id === `${prefix}-frame:piece`);
      assert.ok(leaf && pane && seal && frame, prefix);

      const leafKey = hingedDoorGroupKey(leaf.id, leaf.clusterId);
      assert.equal(leafKey, prefix);
      assert.equal(hingedDoorGroupKey(pane.id, pane.clusterId), leafKey);
      const policy = plugSlideDoorPolicy(leafKey);
      assert.ok(policy, `${prefix}: нет профиля plug-slide`);
      assert.equal(policy.slideSign ?? 1, side === "left" ? -1 : 1, prefix);
      assert.ok(policy.travel >= 0.76, `${prefix}: ход ${policy.travel} короче створки`);
      assert.ok(
        (policy.approachRadius ?? 3.2) < 2.2,
        `${prefix}: зона двери ${policy.approachRadius} хватает салон`,
      );

      assert.ok(leaf.hinge && pane.hinge, `${prefix}: нет петли`);
      assert.equal(seal.hinge, undefined, `${prefix}: уплотнение не должно ехать`);
      assert.equal(frame.hinge, undefined, `${prefix}: обвод не должен ехать`);
      assert.ok(Math.abs(leaf.hinge.normal[1]) < 1e-6, `${prefix}: нормаль не горизонтальна`);
      const outwardZ = Math.sign(leaf.position[2] - AIRPORT_RUNWAY.centreZ) || 1;
      assert.ok(
        leaf.hinge.normal[2] * outwardZ > 0.5,
        `${prefix}: нормаль должна смотреть от борта, не в него`,
      );

      const slideRight = [leaf.hinge.normal[2], 0, -leaf.hinge.normal[0]];
      const slideSign = policy.slideSign ?? 1;
      const opened = [0, 1, 2].map((axis) =>
        leaf.position[axis]
          + leaf.hinge.normal[axis] * policy.plugDepth
          + slideRight[axis] * policy.travel * slideSign,
      );
      assert.ok(
        opened[0] < leaf.position[0] - 0.5,
        `${prefix}: открытая створка x=${opened[0].toFixed(2)} не уехала к хвосту (закрыта ${leaf.position[0].toFixed(2)})`,
      );
      assert.ok(
        Math.abs(opened[2] - AIRPORT_RUNWAY.centreZ)
          > Math.abs(leaf.position[2] - AIRPORT_RUNWAY.centreZ) + 0.1,
        `${prefix}: створка не вышла на игрока`,
      );
    }
  }
});

test("DC-3 cabin doors lock to the cluster in flight and release when parked", () => {
  const clusterId = ISLAND_AIRPORT_DC3_PLACEMENT.clusterId;
  const poses = new Map([[clusterId, {}]]);
  const docked = new Set([clusterId]);
  const hinged = pieces.filter((piece) => piece.hinge);
  assert.equal(hinged.length, 8, "four leaves, leaf plus pane");
  assert.equal(
    hingedDoorLockedToCarrier({
      clusterId,
      dockedVehicles: docked,
      vehicleFramePoses: poses,
    }),
    false,
  );
  assert.equal(
    hingedDoorLockedToCarrier({
      clusterId,
      dockedVehicles: new Set(),
      vehicleFramePoses: poses,
    }),
    true,
  );
  assert.equal(
    hingedDoorLockedToCarrier({
      clusterId: "h2:door:front",
      dockedVehicles: new Set(),
      vehicleFramePoses: poses,
    }),
    false,
  );
});
