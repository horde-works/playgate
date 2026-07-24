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

test("sliced steel pipe remnants cannot brace each other across the cut", () => {
  const steelProfiles = {
    ...profiles,
    steel: {
      density: 7.8,
      compressionStrength: 220,
      cantilever: 2.1,
      maximumVerticalGap: 1.1,
      carriesAttachments: true,
      sideAttachmentReach: 0.24,
    },
  };
  const pieces = [
    {
      id: "ground",
      material: "ground",
      position: [0, -0.5, 0],
      size: [8, 1, 8],
    },
    {
      // Free-standing riser: no wall tie. Intact steel would still let the
      // upper remnant "sit" on the lower one across a 0.35 m cut via the
      // material's 1.1 m vertical gap.
      id: "pipe",
      material: "steel",
      position: [0, 2, 0],
      size: [0.12, 3.6, 0.12],
    },
  ];
  const fragments = [
    {
      id: "pipe-lower",
      parentId: "pipe",
      material: "steel",
      position: [0, 0.9, 0],
      size: [0.12, 1.6, 0.12],
      detached: false,
    },
    {
      id: "pipe-upper",
      parentId: "pipe",
      material: "steel",
      position: [0, 2.85, 0],
      size: [0.12, 1.6, 0.12],
      detached: false,
    },
  ];

  const result = resolveRuntimeStructure(
    pieces,
    steelProfiles,
    new Set(),
    new Set(["pipe"]),
    fragments,
  );

  assert.equal(result.detachedFragmentIds.has("pipe-upper"), true);
  assert.equal(result.detachedFragmentIds.has("pipe-lower"), false);
});

test("carved non-bearing fixtures stay non-bearing as remnants", () => {
  const steelProfiles = {
    ...profiles,
    steel: {
      density: 7.8,
      compressionStrength: 220,
      cantilever: 2.1,
      maximumVerticalGap: 1.1,
      carriesAttachments: true,
      sideAttachmentReach: 0.24,
    },
  };
  const pieces = [
    {
      id: "ground",
      material: "ground",
      position: [0, -0.5, 0],
      size: [8, 1, 8],
    },
    {
      id: "pipe",
      material: "steel",
      position: [0, 2, 0],
      size: [0.12, 3.6, 0.12],
      bearsLoad: false,
    },
  ];
  // Tiny gap that even the remnant clamp would accept — only bearsLoad:false
  // inherited from the parent must stop the upper from using the lower.
  const fragments = [
    {
      id: "pipe-lower",
      parentId: "pipe",
      material: "steel",
      position: [0, 0.9, 0],
      size: [0.12, 1.6, 0.12],
      detached: false,
    },
    {
      id: "pipe-upper",
      parentId: "pipe",
      material: "steel",
      position: [0, 2.6, 0],
      size: [0.12, 1.6, 0.12],
      detached: false,
    },
  ];

  const result = resolveRuntimeStructure(
    pieces,
    steelProfiles,
    new Set(),
    new Set(["pipe"]),
    fragments,
  );

  assert.equal(result.detachedFragmentIds.has("pipe-upper"), true);
});
