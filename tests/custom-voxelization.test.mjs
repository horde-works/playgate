import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Vector3 } from "three";

import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";
import { dutchPolderScene } from "../games/make-a-mess/src/game/dutchPolderScene.ts";
import {
  VOLUME_BREAK_FRACTION,
  carvedMaterialScale,
  compilePieceDamageGeometry,
  damageBody,
  pieceMaterialVolume,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  countOccupiedVoxels,
  splitVoxelComponents,
} from "../games/make-a-mess/src/game/voxelFracture.ts";

const skyRamSkin = basaltStrongholdScene.breakablePieces.find((piece) =>
  piece.id === "stronghold:sky-ram:skin:3:0");
const millSmock = dutchPolderScene.breakablePieces.find((piece) =>
  piece.id === "dutch-polder:m1-fixed:m1:smock-shell");

test("a custom hull cassette compiles to its curved shell, not its solid AABB", () => {
  assert.ok(skyRamSkin?.visualMesh);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);

  const occupied = countOccupiedVoxels(compiled.body);
  assert.equal(occupied < compiled.body.occupied.length * 0.25, true);
  const center = compiled.body.dimensions.map((side) => Math.floor(side / 2));
  const centerIndex = center[0] + compiled.body.dimensions[0] *
    (center[1] + compiled.body.dimensions[1] * center[2]);
  assert.equal(
    compiled.body.occupied[centerIndex],
    0,
    "the empty volume behind the curved skin must stay empty",
  );
  assert.equal(splitVoxelComponents(compiled.body).length, 1);
});

test("latent shell voxels preserve the authored material volume", () => {
  assert.ok(skyRamSkin?.volume);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);
  const compiledVolume = splitVoxelComponents(compiled.body).reduce(
    (total, component) => total + component.volume,
    0,
  );
  assert.ok(Math.abs(compiledVolume - skyRamSkin.volume) < 1e-9);
  assert.equal(compiled.body.volumeScale < 0.2, true);
});

test("damage carves the custom shell through the existing voxel pipeline", () => {
  assert.ok(skyRamSkin?.visualMesh);
  const compiled = compilePieceDamageGeometry(skyRamSkin);
  assert.ok(compiled);
  const localHit = skyRamSkin.visualMesh.vertices[4].map(
    (coordinate, axis) => coordinate * skyRamSkin.size[axis],
  );
  const worldHit = localHit.map(
    (coordinate, axis) => coordinate + skyRamSkin.position[axis],
  );
  const result = damageBody(
    { ...skyRamSkin, voxelBody: compiled.body, boxes: compiled.boxes },
    {
      position: new Vector3(...skyRamSkin.position),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "custom-shell",
      worldPoint: new Vector3(...worldHit),
      radius: 0.32,
      burstSpeed: 0,
    },
  );

  assert.ok(result);
  assert.ok(result.removedVolume > 0);
  assert.equal(result.fragments.length, 1);
  assert.ok(result.fragments[0].voxelBody);
  assert.equal(
    result.fragments[0].voxelBody.volumeScale,
    compiled.body.volumeScale,
  );
  assert.equal(
    result.fragments[0].boxes.length > 1,
    true,
    "the damaged cassette must not fall back to one bounding box",
  );
  const remainingVolume = result.fragments.reduce(
    (total, fragment) => total + (fragment.volume ?? 0),
    0,
  );
  assert.equal(remainingVolume + result.removedVolume <= skyRamSkin.volume, true);
  assert.equal(remainingVolume + result.removedVolume > skyRamSkin.volume * 0.98, true);
});

// Одна пуля в стену мельницы не имеет права снять мельницу с фундамента.
// Порог живучести куска и вес его обрубка считаются по МАТЕРИАЛУ; у оболочки
// материал — единицы процентов от габарита, и обе прежние ошибки (порог от
// bounding box, второй слой поправки на плотность) давали разрушение куска с
// первого касания.
test("one bullet in a shell wall leaves the piece standing", () => {
  assert.ok(millSmock?.visualMesh);
  const compiled = compilePieceDamageGeometry(millSmock);
  assert.ok(compiled);

  const boundingVolume =
    millSmock.size[0] * millSmock.size[1] * millSmock.size[2];
  assert.equal(
    millSmock.volume < boundingVolume * 0.05,
    true,
    "смок — тонкая оболочка, иначе тест ничего не проверяет",
  );
  assert.equal(pieceMaterialVolume(millSmock), millSmock.volume);

  const vertex = millSmock.visualMesh.vertices[
    Math.floor(millSmock.visualMesh.vertices.length / 2)
  ];
  const damageSource = {
    ...millSmock,
    voxelBody: compiled.body,
    boxes: compiled.boxes,
  };
  const result = damageBody(
    damageSource,
    {
      position: new Vector3(...millSmock.position),
      quaternion: new Quaternion(),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: "mill-bullet",
      worldPoint: new Vector3(
        millSmock.position[0] + vertex[0] * millSmock.size[0],
        millSmock.position[1] + vertex[1] * millSmock.size[1],
        millSmock.position[2] + vertex[2] * millSmock.size[2],
      ),
      radius: 0.19,
      burstSpeed: 0,
    },
  );
  assert.ok(result);
  assert.ok(result.removedVolume > 0);
  assert.equal(
    result.removedVolume < millSmock.volume * 0.01,
    true,
    "пуля снимает доли процента материала",
  );

  // Ядро уже привело объём оболочки к материалу — второй поправки нет.
  assert.equal(carvedMaterialScale(damageSource), 1);
  const stableVolume =
    result.fragments.reduce((total, fragment) => total + (fragment.volume ?? 0), 0) *
    carvedMaterialScale(damageSource);
  assert.equal(
    stableVolume > pieceMaterialVolume(millSmock) * 0.98,
    true,
    "обрубок сохраняет вес своей оболочки",
  );
  assert.equal(
    stableVolume >= pieceMaterialVolume(millSmock) * VOLUME_BREAK_FRACTION,
    true,
    "кусок остаётся стоять: порог живучести берётся от материала",
  );
  assert.equal(
    stableVolume < boundingVolume * VOLUME_BREAK_FRACTION,
    true,
    "порог от габарита недостижим в принципе: столько материала в оболочке нет",
  );
});

// Обратная сторона того же контракта: панель БЕЗ скомпилированной оболочки
// по-прежнему получает поправку, иначе огрызок обшивки весит как монолит.
test("a solid-grid panel with authored volume still scales its stump", () => {
  const panel = {
    size: [2, 0.04, 3],
    volume: 2 * 0.04 * 3 * 0.25,
  };
  assert.equal(Math.abs(carvedMaterialScale(panel) - 0.25) < 1e-9, true);
  const noVolume = { size: [1, 1, 1] };
  assert.equal(carvedMaterialScale(noVolume), 1);
});

test("an extruded custom profile does not voxelize its rectangular corners", () => {
  const triangle = {
    id: "custom-triangle",
    clusterId: "custom",
    material: "steel",
    shape: "steelSheet",
    position: [0, 0, 0],
    size: [4, 4, 0.12],
    color: "#777777",
    visualProfile: {
      vertices: [[-0.5, -0.5], [0.5, -0.5], [0, 0.5]],
    },
  };
  const compiled = compilePieceDamageGeometry(triangle);
  assert.ok(compiled);
  assert.equal(
    countOccupiedVoxels(compiled.body) < compiled.body.occupied.length * 0.7,
    true,
  );
  assert.equal(splitVoxelComponents(compiled.body).length, 1);
  const compiledVolume = splitVoxelComponents(compiled.body).reduce(
    (total, component) => total + component.volume,
    0,
  );
  assert.ok(Math.abs(compiledVolume - 4 * 4 * 0.12) < 1e-9);
});
