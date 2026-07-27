import assert from "node:assert/strict";
import test from "node:test";
import { createDestructionScene } from "../games/make-a-mess/src/game/destructionScene.ts";

// Крошечная сцена: земляная плита, столб на ней и висящий в воздухе кирпич.
// Кирпич стоит отдельно, ни на что не опирается — на нём проверяется, что
// аудит несущей целостности в заповеднике остаётся честным.
function buildClusters() {
  return [
    {
      id: "test:ground",
      pieces: [
        {
          id: "test:ground:tile",
          clusterId: "test:ground",
          material: "earth",
          shape: "groundTile",
          position: [0, -0.25, 0],
          size: [8, 0.5, 8],
          color: "#6b675e",
        },
      ],
    },
    {
      id: "test:post",
      pieces: [
        {
          id: "test:post:base",
          clusterId: "test:post",
          material: "concrete",
          shape: "panel",
          position: [0, 0.5, 0],
          size: [0.6, 1, 0.6],
          color: "#cfd1d5",
        },
        {
          id: "test:post:head",
          clusterId: "test:post",
          material: "concrete",
          shape: "panel",
          position: [0, 1.5, 0],
          size: [0.6, 1, 0.6],
          color: "#cfd1d5",
        },
      ],
    },
    {
      id: "test:floater",
      pieces: [
        {
          id: "test:floater:brick",
          clusterId: "test:floater",
          material: "brick",
          shape: "brick",
          position: [3, 3, 3],
          size: [0.5, 0.3, 0.25],
          color: "#a4653a",
        },
      ],
    },
  ];
}

function buildScene(indestructible, contentLicense) {
  return createDestructionScene({
    id: indestructible ? "test-preserve" : "test-breakable",
    title: "test",
    playerSpawn: [0, 1.2, 4],
    worldCenter: [0, 0],
    worldHalfExtents: [10, 10],
    worldRadius: 10,
    copy: {
      status: "test",
      eyebrow: "test",
      heading: "test",
      ready: "test",
      loading: "test",
      description: "test",
      enter: "test",
      returnToGame: "test",
      reset: "test",
    },
    clusters: buildClusters(),
    indestructible,
    contentLicense,
  });
}

test("a preserved world reports the flag, an ordinary one does not", () => {
  assert.equal(buildScene(true).indestructible, true);
  assert.equal(buildScene(false).indestructible, false);
  // Флаг не обязателен: старые сцены собираются без него и остаются ломкими.
  const legacy = createDestructionScene({
    id: "test-legacy",
    title: "test",
    playerSpawn: [0, 1.2, 4],
    worldCenter: [0, 0],
    worldHalfExtents: [10, 10],
    copy: buildScene(false).copy,
    clusters: buildClusters(),
  });
  assert.equal(legacy.indestructible, false);
});

test("a hammer blow adds nothing to the broken set in a preserved world", () => {
  const preserved = buildScene(true);
  const target = preserved.breakablePieceById.get("test:post:head");

  const after = preserved.fractureLocallyAt(target, new Set(), 1);

  assert.equal(after.size, 0);
});

test("the same blow does break a piece in an ordinary world", () => {
  const breakable = buildScene(false);
  const target = breakable.breakablePieceById.get("test:post:head");

  const after = breakable.fractureLocallyAt(target, new Set(), 1);

  assert.equal(after.has("test:post:head"), true);
});

test("settling never drops a piece in a preserved world", () => {
  const preserved = buildScene(true);

  // Пустой старт: даже висящий в воздухе кирпич остаётся на месте.
  assert.equal(preserved.settleAfterBreak(new Set()).size, 0);

  // И подпорка, выбитая из-под верхнего куска, его не роняет.
  const withoutBase = new Set(["test:post:base"]);
  const settled = preserved.settleAfterBreak(withoutBase);
  assert.equal(settled.has("test:post:head"), false);
  assert.equal(settled.size, withoutBase.size);
});

test("the same settling does drop the unsupported head in an ordinary world", () => {
  const breakable = buildScene(false);

  const settled = breakable.settleAfterBreak(new Set(["test:post:base"]));

  assert.equal(settled.has("test:post:head"), true);
});

test("the structural audit stays honest in a preserved world", () => {
  const preserved = buildScene(true);

  // Кирпич висит в воздухе — сборка обязана это видеть, иначе заповедник
  // превращается в отговорку «оно всё равно не падает».
  const unsupported = preserved.resolveStructuralCollapse(new Set());

  assert.equal(unsupported.has("test:floater:brick"), true);
  assert.equal(unsupported.has("test:post:head"), false);
});

test("a no-derivatives world cannot be built destructible", () => {
  // Разрушимая версия мира с ND-лицензией — производное произведение,
  // которого эта лицензия не разрешает. Ловится на сборке, а не в ревью.
  assert.throws(
    () => buildScene(false, "CC-BY-NC-ND-4.0"),
    /forbids derivative works/,
  );

  const preserved = buildScene(true, "CC-BY-NC-ND-4.0");
  assert.equal(preserved.contentLicense, "CC-BY-NC-ND-4.0");
  assert.equal(preserved.indestructible, true);
});

test("licences that allow derivatives leave the world alone", () => {
  const shareable = buildScene(false, "CC-BY-4.0");

  assert.equal(shareable.contentLicense, "CC-BY-4.0");
  assert.equal(shareable.indestructible, false);
  // Без своей лицензии контент живёт под лицензией репозитория.
  assert.equal(buildScene(false).contentLicense, null);
});

test("a preserved world has nothing to re-solve after an impact", () => {
  const preserved = buildScene(true);
  const breakable = buildScene(false);

  assert.equal(preserved.structuralScopeFor(["test:post:base"]).size, 0);
  assert.equal(breakable.structuralScopeFor(["test:post:base"]).size > 0, true);
});
