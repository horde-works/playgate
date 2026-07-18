import assert from "node:assert/strict";
import test from "node:test";
import {
  createStructuralSolver,
} from "../games/make-a-mess/src/game/structuralPhysics.ts";

const profiles = {
  ground: {
    density: 1,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: Number.POSITIVE_INFINITY,
    maximumVerticalGap: 0.15,
    foundation: true,
    carriesAttachments: true,
  },
  wood: {
    density: 1,
    compressionStrength: 80,
    cantilever: 0.5,
    maximumVerticalGap: 0.15,
    carriesAttachments: true,
  },
};

const pieces = [
  {
    id: "ground",
    material: "ground",
    position: [0, 0, 0],
    size: [8, 0.2, 8],
  },
  {
    id: "left-post",
    material: "wood",
    position: [-2, 1.1, 0],
    size: [0.3, 2, 0.3],
  },
  {
    id: "right-post",
    material: "wood",
    position: [2, 1.1, 0],
    size: [0.3, 2, 0.3],
  },
  {
    id: "beam",
    material: "wood",
    position: [0, 2.2, 0],
    size: [4.5, 0.2, 0.3],
  },
  {
    id: "floating-block",
    material: "wood",
    position: [0, 5, 0],
    size: [0.5, 0.5, 0.5],
  },
];

test("the same solver rejects an unsupported part during initial assembly", () => {
  const solver = createStructuralSolver(pieces, profiles);
  const settled = solver.resolve(new Set());

  assert.equal(settled.has("floating-block"), true);
  assert.equal(settled.has("beam"), false);
});

test("a beam fails when its remaining support exceeds the material cantilever", () => {
  const solver = createStructuralSolver(pieces, profiles);
  const settled = solver.resolve(new Set(["right-post"]));

  assert.equal(settled.has("beam"), true);
});
