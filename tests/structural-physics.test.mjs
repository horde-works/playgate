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

test("shared terrain does not merge independent structural islands", () => {
  const solver = createStructuralSolver(
    [
      {
        id: "wide-ground",
        material: "ground",
        position: [0, 0, 0],
        size: [20, 0.2, 4],
      },
      {
        id: "left-structure",
        material: "wood",
        position: [-6, 1.1, 0],
        size: [0.4, 2, 0.4],
      },
      {
        id: "right-structure",
        material: "wood",
        position: [6, 1.1, 0],
        size: [0.4, 2, 0.4],
      },
    ],
    profiles,
  );

  const leftScope = solver.connectedPieceIds(["left-structure"]);
  assert.equal(leftScope.has("left-structure"), true);
  assert.equal(leftScope.has("wide-ground"), true);
  assert.equal(leftScope.has("right-structure"), false);

  const groundScope = solver.connectedPieceIds(["wide-ground"]);
  assert.equal(groundScope.has("left-structure"), true);
  assert.equal(groundScope.has("right-structure"), true);
});

test("compression follows the surviving bearing area", () => {
  const loadProfiles = {
    ground: profiles.ground,
    post: {
      density: 1,
      compressionStrength: 5,
      cantilever: 0.1,
      maximumVerticalGap: 0.15,
      carriesAttachments: true,
    },
    load: {
      density: 10,
      compressionStrength: 100,
      cantilever: 0.1,
      maximumVerticalGap: 0.15,
    },
  };
  const base = [
    {
      id: "ground",
      material: "ground",
      position: [0, 0, 0],
      size: [8, 0.2, 8],
    },
    {
      id: "load",
      material: "load",
      position: [0, 1.3, 0],
      size: [1, 0.4, 1],
    },
  ];
  const fullPost = {
    id: "post",
    material: "post",
    position: [0, 0.7, 0],
    size: [1, 1, 1],
    volume: 1,
    bearingArea: 1,
  };
  const holedPost = {
    ...fullPost,
    bearingArea: 0.05,
  };

  const full = createStructuralSolver(
    [base[0], fullPost, base[1]],
    loadProfiles,
  ).resolve(new Set());
  const holed = createStructuralSolver(
    [base[0], holedPost, base[1]],
    loadProfiles,
  ).resolve(new Set());

  assert.equal(full.has("post"), false);
  assert.equal(full.has("load"), false);
  assert.equal(holed.has("post"), true);
  assert.equal(holed.has("load"), true);
});
