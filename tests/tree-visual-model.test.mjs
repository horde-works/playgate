import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Quaternion, Vector3 } from "three";
import {
  buildProceduralRootNetwork,
  detachedTreeFoliageSize,
  expandBrokenTreeDescendants,
  flattenDetachedTreeFoliage,
  isEnhancedTreePiece,
  isProceduralFoliagePiece,
  isProceduralVegetationPiece,
  proceduralPineNeedleProfile,
  proceduralRootJointDiameter,
  proceduralWoodTubeProfile,
  treeBarkPhase,
  treeWoodSpecies,
  treeVisualRootId,
  usesFoliageDebrisGeometry,
  usesTreeBarkVisual,
} from "../games/make-a-mess/src/game/treeVisualModel.ts";
import { damageBody } from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  propBirch,
  propOak,
  propPine,
} from "../games/make-a-mess/src/content/prefabs/coreFlora.ts";

function runtimePiece(prefix, piece) {
  return {
    ...piece,
    id: `${prefix}:${piece.id}`,
    clusterId: "trees",
  };
}

function pieceAxis(piece) {
  return new Vector3(0, 1, 0)
    .applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...(piece.rotation ?? [0, 0, 0]))),
    )
    .normalize();
}

function distanceToAxis(point, axisOrigin, axis) {
  const offset = point.clone().sub(axisOrigin);
  return offset.addScaledVector(axis, -offset.dot(axis)).length();
}

function segmentEnds(piece) {
  const axis = pieceAxis(piece);
  const center = new Vector3(...piece.position);
  return [
    center.clone().addScaledVector(axis, -piece.size[1] / 2),
    center.clone().addScaledVector(axis, piece.size[1] / 2),
  ];
}

function distanceToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const t = Math.max(
    0,
    Math.min(1, point.clone().sub(start).dot(segment) / segment.lengthSq()),
  );
  return point.distanceTo(start.clone().addScaledVector(segment, t));
}

function assertTreeTopology(pieces, seed) {
  const trunk = pieces.find((piece) => piece.treeVisual?.role === "trunk");
  assert.ok(trunk, `seed ${seed}: trunk is required`);
  const trunkAxis = pieceAxis(trunk);
  const trunkCenter = new Vector3(...trunk.position);
  const trunkStart = trunkCenter.clone().addScaledVector(
    trunkAxis,
    -trunk.size[1] / 2,
  );
  const branches = pieces.filter(
    (piece) => piece.treeVisual?.role === "branch",
  );
  const byLocalId = new Map(
    pieces.map((piece) => [piece.treeVisual?.localId, piece]),
  );
  const primaryHeights = [];
  let hasSecondOrderBranch = false;

  for (const branch of branches) {
    const parentLocalId = branch.treeVisual.parentLocalId;
    const parent = byLocalId.get(parentLocalId);
    assert.ok(parent, `seed ${seed} ${branch.id}: parent ${parentLocalId} is required`);
    const [proximal, distal] = segmentEnds(branch);
    const [parentStart, parentEnd] = segmentEnds(parent);
    const jointDistance = distanceToSegment(proximal, parentStart, parentEnd);
    const proximalRadius = distanceToAxis(proximal, trunkStart, trunkAxis);
    const distalRadius = distanceToAxis(distal, trunkStart, trunkAxis);
    const proximalHeight = proximal.clone().sub(trunkStart).dot(trunkAxis);

    assert.ok(
      jointDistance <= Math.max(parent.size[0], branch.size[0]) * 0.12,
      `seed ${seed} ${branch.id}: proximal end misses parent by ${jointDistance}`,
    );
    assert.ok(
      distalRadius > proximalRadius + branch.size[1] * 0.35,
      `seed ${seed} ${branch.id}: distal end does not grow outward`,
    );
    assert.ok(
      branch.size[0] < parent.size[0] * 0.8,
      `seed ${seed} ${branch.id}: branch is too thick for its parent`,
    );

    const terminalFoliage = pieces.filter(
      (piece) =>
        piece.treeVisual?.role === "foliage" &&
        piece.treeVisual.parentLocalId === branch.treeVisual.localId,
    );
    assert.ok(
      terminalFoliage.length >= 1,
      `seed ${seed} ${branch.id}: terminal crown is required`,
    );
    assert.ok(
      terminalFoliage.some(
        (piece) =>
          distal.distanceTo(new Vector3(...piece.position)) <=
          Math.max(...piece.size) * 0.2,
      ),
      `seed ${seed} ${branch.id}: distal end misses terminal crown`,
    );

    if (parent.treeVisual?.role === "trunk") {
      primaryHeights.push(proximalHeight / trunk.size[1]);
    } else {
      hasSecondOrderBranch = true;
    }
  }

  assert.ok(primaryHeights.length >= 6, `seed ${seed}: too few branch levels`);
  assert.ok(
    Math.min(...primaryHeights) <= 0.56 && Math.max(...primaryHeights) >= 0.86,
    `seed ${seed}: primary branches do not span the crown-bearing trunk`,
  );
  assert.equal(hasSecondOrderBranch, true, `seed ${seed}: no branch forks`);
}

test("broadleaf tree recipes label every visual proxy deterministically", () => {
  for (const [kind, pieces] of [
    ["oak", propOak({ seed: 7 })],
    ["birch", propBirch({ seed: 11 })],
  ]) {
    assert.equal(pieces.length > 4, true);
    for (const piece of pieces) {
      assert.equal(piece.treeVisual?.kind, kind);
      assert.equal(piece.treeVisual?.localId, piece.id);
      assert.equal(typeof piece.treeVisual?.seed, "number");
    }
  }
});

test("tree visual ids group nested local part ids under one instance root", () => {
  const pieces = propOak({ seed: 5 }).map((piece) =>
    runtimePiece("town:trees:tree:3", piece),
  );
  assert.deepEqual(
    new Set(pieces.map(treeVisualRootId)),
    new Set(["town:trees:tree:3"]),
  );
  assert.equal(pieces.every(isEnhancedTreePiece), true);
});

test("pine uses the procedural tree path while birch bark is material-only", () => {
  const pine = propPine({ seed: 1 });
  assert.equal(pine.every(isEnhancedTreePiece), true);
  assert.equal(
    pine.filter((piece) => piece.treeVisual?.role === "trunk").length,
    1,
  );
  assert.ok(
    pine.filter((piece) => piece.treeVisual?.role === "foliage").length >= 8,
  );
  assert.equal(
    propBirch({ seed: 2 }).some((piece) => piece.id.startsWith("bark:")),
    false,
  );
});

test("broadleaf branches form attached multi-level parent-child crowns", () => {
  for (let seed = 1; seed <= 64; seed += 1) {
    assertTreeTopology(propOak({ seed, scale: 0.7 + (seed % 7) * 0.13 }), seed);
    assertTreeTopology(propBirch({ seed, scale: 0.7 + (seed % 5) * 0.11 }), seed);
  }
});

test("every trunk and branch uses one connected tapered tube contract", () => {
  const trunk = proceduralWoodTubeProfile("trunk");
  const branch = proceduralWoodTubeProfile("branch");

  assert.ok(trunk.longitudinalSegments >= 4);
  assert.equal(branch.longitudinalSegments, trunk.longitudinalSegments);
  assert.ok(trunk.tipScale > 0 && trunk.tipScale < 1);
  assert.ok(branch.tipScale > 0 && branch.tipScale < trunk.tipScale);
  assert.ok(branch.bendRatio > trunk.bendRatio);
  assert.deepEqual(
    new Set([treeWoodSpecies("oak"), treeWoodSpecies("birch"), treeWoodSpecies("pine")]),
    new Set([0, 1, 2]),
  );
});

test("tree bark identity survives the transition into broken fragments", () => {
  const trunkSource = propBirch({ seed: 31 })
    .map((piece) => runtimePiece("forest:tree:4", piece))
    .find((piece) => piece.treeVisual?.role === "trunk");
  assert.ok(trunkSource);
  assert.equal(usesTreeBarkVisual(trunkSource.material, trunkSource.treeVisual), true);
  assert.equal(usesTreeBarkVisual("wood", undefined), false);
  assert.equal(
    usesTreeBarkVisual("foliage", {
      kind: "birch",
      seed: 31,
      role: "foliage",
      localId: "leaf:0",
    }),
    false,
  );

  const result = damageBody(
    trunkSource,
    {
      position: new Vector3(...trunkSource.position),
      quaternion: new Quaternion().setFromEuler(
        new Euler(...(trunkSource.rotation ?? [0, 0, 0])),
      ),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "birch:fracture",
      worldPoint: new Vector3(...trunkSource.position),
      radius: 0.3,
      burstSpeed: 3,
    },
  );
  assert.ok(result);
  assert.ok(result.fragments.length > 0);
  for (const fragment of result.fragments) {
    assert.deepEqual(fragment.treeVisual, trunkSource.treeVisual);
    assert.equal(fragment.treeVisualSourceId, trunkSource.id);
    assert.equal(
      treeBarkPhase(fragment.treeVisual.seed, fragment.treeVisualSourceId),
      treeBarkPhase(trunkSource.treeVisual.seed, trunkSource.id),
    );
  }
});

test("pine crowns use dense narrow needles instead of broad leaves", () => {
  const profile = proceduralPineNeedleProfile;
  const needleCount =
    profile.boughCount *
    profile.stationsPerBough *
    profile.needlesPerStation;
  const maximumFullWidth =
    (profile.minimumHalfWidth + profile.halfWidthVariation) * 2;

  assert.equal(profile.bladeShape, "tapered-lance");
  assert.ok(needleCount >= 650);
  assert.ok(profile.minimumLength / maximumFullWidth >= 3.4);
});

test("broadleaf crowns use many small foliage sections instead of one falling clump", () => {
  for (const [kind, pieces, minimum] of [
    ["oak", propOak({ seed: 17 }), 21],
    ["birch", propBirch({ seed: 23 }), 15],
  ]) {
    const foliage = pieces.filter((piece) => piece.treeVisual?.role === "foliage");
    assert.ok(foliage.length >= minimum, `${kind}: too few foliage sections`);
    assert.ok(
      Math.max(...foliage.map((piece) => Math.max(...piece.size))) < 1,
      `${kind}: a foliage proxy is still large enough to fall as one clump`,
    );
  }
});

test("detached tree foliage becomes thin horizontal leaf litter", () => {
  const crown = propOak({ seed: 17 })
    .find((piece) => piece.treeVisual?.role === "foliage");
  const trunk = propOak({ seed: 17 })
    .find((piece) => piece.treeVisual?.role === "trunk");
  assert.ok(crown);
  assert.ok(trunk);

  const detached = flattenDetachedTreeFoliage(crown);
  assert.deepEqual(detached.size, detachedTreeFoliageSize(crown.size));
  assert.ok(detached.size[1] <= 0.028);
  assert.ok(detached.size[0] < crown.size[0]);
  assert.ok(detached.size[2] < crown.size[2]);
  assert.deepEqual(detached.rotation, [0, crown.rotation?.[1] ?? 0, 0]);
  assert.equal(flattenDetachedTreeFoliage(trunk), trunk);
});

test("breaking a woody parent releases every descendant but not its siblings", () => {
  const pieces = propOak({ seed: 29 }).map((piece) =>
    runtimePiece("town:trees:tree:9", piece),
  );
  const branchId = "town:trees:tree:9:branch:p:0";
  const expanded = expandBrokenTreeDescendants(pieces, new Set([branchId]));
  assert.ok(expanded.has("town:trees:tree:9:branch:s:0:0"));
  assert.ok(expanded.has("town:trees:tree:9:branch:s:0:1"));
  assert.ok(expanded.has("town:trees:tree:9:leaf:p:0"));
  assert.ok(expanded.has("town:trees:tree:9:leaf:s:0:0"));
  assert.equal(expanded.has("town:trees:tree:9:branch:p:1"), false);

  const wholeTree = expandBrokenTreeDescendants(
    pieces,
    new Set(["town:trees:tree:9:trunk"]),
  );
  assert.equal(wholeTree.size, pieces.length);
});

test("procedural roots branch, taper and bury every visible terminal", () => {
  for (const kind of ["oak", "birch", "pine"]) {
    for (let seed = 1; seed <= 64; seed += 1) {
      const diameter = 0.18 + (seed % 9) * 0.045;
      const paths = buildProceduralRootNetwork(seed, diameter, kind);
      const primary = paths.filter((path) => path.parentId === undefined);
      const forks = paths.filter((path) => path.parentId !== undefined);
      const byId = new Map(paths.map((path) => [path.id, path]));

      assert.ok(primary.length >= 4, `${kind} ${seed}: too few primary roots`);
      assert.ok(
        forks.length >= primary.length,
        `${kind} ${seed}: roots do not branch`,
      );
      for (const path of paths) {
        assert.equal(path.points.length, path.diameters.length);
        assert.ok(path.points.length >= 3);
        assert.ok(
          path.points.at(-1)[1] < -diameter * 0.25,
          `${kind} ${seed} ${path.id}: terminal remains above the soil`,
        );
        for (let index = 1; index < path.diameters.length; index += 1) {
          assert.ok(
            path.diameters[index] < path.diameters[index - 1],
            `${kind} ${seed} ${path.id}: root does not taper`,
          );
        }
        for (let index = 1; index < path.diameters.length - 1; index += 1) {
          const jointRadius = proceduralRootJointDiameter(
            path.diameters[index - 1],
            path.diameters[index],
          ) / 2;
          assert.ok(
            jointRadius >= path.diameters[index - 1] * 0.34,
            `${kind} ${seed} ${path.id}: joint does not cover incoming root`,
          );
          assert.ok(
            jointRadius >= path.diameters[index] * 0.5,
            `${kind} ${seed} ${path.id}: joint does not cover outgoing root`,
          );
        }
        assert.ok(
          path.diameters.at(-1) < path.diameters[0] * 0.2,
          `${kind} ${seed} ${path.id}: terminal is visibly blunt`,
        );
        if (path.parentId) {
          const parent = byId.get(path.parentId);
          assert.ok(parent, `${kind} ${seed} ${path.id}: missing parent root`);
          assert.deepEqual(path.points[0], parent.points[2]);
        }
      }
    }
  }
});

test("only procedural foliage proxies use porous detached debris", () => {
  const oak = propOak({ seed: 9 });
  const trunk = oak.find((piece) => piece.treeVisual?.role === "trunk");
  const crown = oak.find((piece) => piece.treeVisual?.role === "foliage");
  assert.ok(trunk);
  assert.ok(crown);
  assert.equal(isProceduralFoliagePiece(runtimePiece("oak", trunk)), false);
  assert.equal(isProceduralFoliagePiece(runtimePiece("oak", crown)), true);

  const shrub = runtimePiece("map", {
    id: "shrub:1",
    material: "foliage",
    shape: "groundTile",
    position: [0, 0.5, 0],
    size: [1, 1, 1],
    color: "#36503a",
    vegetationVisual: { kind: "shrub", seed: 1 },
  });
  assert.equal(isProceduralVegetationPiece(shrub), true);
  assert.equal(isProceduralFoliagePiece(shrub), true);
  assert.equal(usesFoliageDebrisGeometry("foliage"), true);
  assert.equal(usesFoliageDebrisGeometry("wood"), false);
  assert.equal(usesFoliageDebrisGeometry("grass", shrub), true);
});
