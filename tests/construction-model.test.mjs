import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSTRUCTION_MAX_PARTS,
  classifyConstructionAssembly,
  constructionComponents,
  constructionConnectionId,
  normalizeConstructionSize,
  parseConstructionSave,
  serializeConstructionSave,
  snapConstructionPoint,
  splitConstructionAssembly,
} from "../games/make-a-mess/src/game/constructionModel.ts";
import {
  clearRuntimePassengerSeats,
  passengerSeatForId,
  registerRuntimePassengerSeat,
} from "../games/make-a-mess/src/game/passengerSeats.ts";

const pose = {
  position: [1, 2, 3],
  rotation: [0, 0, 0, 1],
  linvel: [4, 0, 0],
  angvel: [0, 1, 0],
};

function part(id, kind) {
  const sizes = {
    beam: [2.5, 0.25, 0.25],
    plate: [2.5, 0.18, 1.5],
    wheel: [0.42, 0.22, 0.42],
    engine: [0.9, 0.65, 0.75],
    seat: [0.7, 0.85, 0.65],
    rotor: [1.7, 0.09, 1.7],
  };
  return {
    id,
    kind,
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0, 1],
    size: sizes[kind],
  };
}

function assembly(parts, connections = []) {
  return { id: "machine", ...pose, parts, connections };
}

test("catalog dimensions clamp and quantize adjustable pieces", () => {
  assert.deepEqual(normalizeConstructionSize("beam", [0.61, 9, Number.NaN]), [0.5, 0.75, 0.25]);
  assert.deepEqual(normalizeConstructionSize("engine", [8, 8, 8]), [0.9, 0.65, 0.75]);
  assert.deepEqual(snapConstructionPoint([0.38, -0.12, 1.13]), [0.5, 0, 1.25]);
});

test("machine stays inert until a complete drive or flight recipe exists", () => {
  const chassis = [part("seat", "seat"), part("engine", "engine")];
  assert.equal(classifyConstructionAssembly(assembly(chassis)).kind, "inert");
  assert.equal(
    classifyConstructionAssembly(
      assembly([...chassis, ...[0, 1, 2].map((i) => part(`w${i}`, "wheel"))]),
    ).canDrive,
    false,
  );
  const car = classifyConstructionAssembly(
    assembly([...chassis, ...[0, 1, 2, 3].map((i) => part(`w${i}`, "wheel"))]),
  );
  assert.equal(car.kind, "car");
  assert.equal(car.canDrive, true);
  const copter = classifyConstructionAssembly(
    assembly([...chassis, ...[0, 1, 2].map((i) => part(`r${i}`, "rotor"))]),
  );
  assert.equal(copter.kind, "rotorcraft");
  assert.equal(copter.canFly, true);
});

test("connections form components and removing a bridge splits the body", () => {
  const links = [
    { id: constructionConnectionId("a", "b"), a: "a", b: "b" },
    { id: constructionConnectionId("b", "c"), a: "b", b: "c" },
  ];
  assert.deepEqual(constructionComponents(["a", "b", "c", "d"], links), [["a", "b", "c"], ["d"]]);
  const result = splitConstructionAssembly(
    assembly([part("a", "beam"), part("b", "beam"), part("c", "beam")], links),
    constructionConnectionId("b", "c"),
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.parts.map((entry) => entry.id)), [["a", "b"], ["c"]]);
  assert.deepEqual(result[1].linvel, pose.linvel);
});

test("save parser round-trips valid state and rejects stale, corrupt, and excessive state", () => {
  const source = assembly([part("a", "beam")]);
  assert.deepEqual(parseConstructionSave(serializeConstructionSave([source])), {
    version: 1,
    assemblies: [source],
  });
  assert.equal(parseConstructionSave("not-json"), null);
  assert.equal(parseConstructionSave(JSON.stringify({ version: 2, assemblies: [] })), null);
  assert.equal(parseConstructionSave(serializeConstructionSave([{ ...source, parts: [] }])), null);
  assert.equal(parseConstructionSave(serializeConstructionSave([source, { ...source }])), null);
  assert.equal(
    parseConstructionSave(
      serializeConstructionSave([
        { ...source, parts: [part("a", "beam"), part("b", "beam")] },
      ]),
    ),
    null,
  );
  const tooMany = assembly(Array.from({ length: CONSTRUCTION_MAX_PARTS + 1 }, (_, i) => part(`p${i}`, "beam")));
  assert.equal(parseConstructionSave(serializeConstructionSave([tooMany])), null);
});

test("runtime construction seats share the passenger lookup without mutating authored seats", () => {
  clearRuntimePassengerSeats();
  const seat = {
    id: "construction:seat",
    carrierClusterId: "construction:machine",
    interactionPoint: [0, 1, 0],
    occupantPoint: [0, 1.2, 0],
    exitPoint: [1.5, 1, 0],
    facing: [-1, 0, 0],
    requiredPieceIds: [],
    approachRadius: 2,
    releaseRadius: 3,
  };
  const unregister = registerRuntimePassengerSeat(seat);
  assert.equal(passengerSeatForId(seat.id), seat);
  unregister();
  assert.equal(passengerSeatForId(seat.id), null);
});
