import assert from "node:assert/strict";
import test from "node:test";
import {
  fragmentBearingArea,
  resolveRuntimeStructure,
} from "../games/make-a-mess/src/game/runtimeStructure.ts";

const profiles = {
  ground: {
    density: 1,
    compressionStrength: Number.POSITIVE_INFINITY,
    cantilever: Number.POSITIVE_INFINITY,
    maximumVerticalGap: 0.15,
    foundation: true,
    carriesAttachments: true,
  },
  concrete: {
    density: 2.4,
    compressionStrength: 120,
    cantilever: 0.2,
    maximumVerticalGap: 0.15,
    carriesAttachments: true,
    sideAttachmentReach: 0.2,
  },
};

test("floating fragments cannot keep one another fixed without a path to ground", () => {
  const pieces = [
    {
      id: "ground",
      material: "ground",
      position: [0, 0, 0],
      size: [8, 0.2, 8],
    },
    {
      id: "wall-left",
      material: "concrete",
      position: [-0.5, 2, 0],
      size: [1, 1, 0.4],
    },
    {
      id: "wall-right",
      material: "concrete",
      position: [0.5, 2, 0],
      size: [1, 1, 0.4],
    },
    {
      id: "roof",
      material: "concrete",
      position: [0, 2.6, 0],
      size: [2, 0.2, 0.4],
    },
  ];
  const fragments = [
    {
      id: "fragment-left",
      parentId: "wall-left",
      material: "concrete",
      position: [-0.5, 2, 0],
      size: [1, 1, 0.4],
      detached: false,
    },
    {
      id: "fragment-right",
      parentId: "wall-right",
      material: "concrete",
      position: [0.5, 2, 0],
      size: [1, 1, 0.4],
      detached: false,
    },
  ];

  const result = resolveRuntimeStructure(
    pieces,
    profiles,
    new Set(),
    new Set(["wall-left", "wall-right"]),
    fragments,
  );

  assert.equal(result.detachedFragmentIds.has("fragment-left"), true);
  assert.equal(result.detachedFragmentIds.has("fragment-right"), true);
  assert.equal(result.brokenPieceIds.has("roof"), true);
});

test("remaining section and hole position decide whether a beam still stands", () => {
  const pieces = [
    {
      id: "ground",
      material: "ground",
      position: [0, 0, 0],
      size: [8, 0.2, 8],
    },
    {
      id: "wall",
      material: "concrete",
      position: [0, 1.1, 0],
      size: [4, 2, 0.4],
    },
    {
      id: "beam",
      material: "concrete",
      position: [0, 2.2, 0],
      size: [4, 0.2, 0.4],
    },
  ];
  const leftSection = {
    id: "wall-left",
    parentId: "wall",
    material: "concrete",
    position: [-1.25, 1.1, 0],
    size: [1.5, 2, 0.4],
    detached: false,
  };
  const rightSection = {
    id: "wall-right",
    parentId: "wall",
    material: "concrete",
    position: [1.25, 1.1, 0],
    size: [1.5, 2, 0.4],
    detached: false,
  };

  const supported = resolveRuntimeStructure(
    pieces,
    profiles,
    new Set(),
    new Set(["wall"]),
    [leftSection, rightSection],
  );
  const cantilevered = resolveRuntimeStructure(
    pieces,
    profiles,
    new Set(),
    new Set(["wall"]),
    [leftSection],
  );

  assert.equal(supported.brokenPieceIds.has("beam"), false);
  assert.equal(cantilevered.brokenPieceIds.has("beam"), true);
});

test("a voxel fragment only bears load through boxes touching its base", () => {
  const fragment = {
    id: "holed-column",
    parentId: "column",
    material: "concrete",
    position: [0, 1, 0],
    size: [1, 2, 1],
    detached: false,
    boxes: [
      {
        center: [-0.4, -0.5, 0],
        size: [0.2, 1, 1],
      },
      {
        center: [0.25, 0.5, 0],
        size: [0.5, 1, 1],
      },
    ],
  };

  assert.equal(fragmentBearingArea(fragment), 0.2);
});

test("empty space inside a voxel remnant cannot act as a hidden support", () => {
  const pieces = [
    {
      id: "ground",
      material: "ground",
      position: [0, 0, 0],
      size: [8, 0.2, 8],
    },
    {
      id: "post",
      material: "concrete",
      position: [0, 0.65, 0],
      size: [0.3, 1.1, 0.3],
    },
    {
      id: "wall",
      material: "concrete",
      position: [0, 1.75, 0],
      size: [4, 1, 0.4],
    },
  ];
  const fragments = [
    {
      id: "wall-with-center-hole",
      parentId: "wall",
      material: "concrete",
      position: [0, 1.75, 0],
      size: [4, 1, 0.4],
      detached: false,
      boxes: [
        {
          center: [-1.5, 0, 0],
          size: [1, 1, 0.4],
        },
        {
          center: [1.5, 0, 0],
          size: [1, 1, 0.4],
        },
      ],
    },
  ];

  const result = resolveRuntimeStructure(
    pieces,
    profiles,
    new Set(),
    new Set(["wall"]),
    fragments,
  );

  assert.equal(
    result.detachedFragmentIds.has("wall-with-center-hole"),
    true,
  );
});
