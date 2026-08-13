import assert from "node:assert/strict";
import test from "node:test";
import {
  convexHull,
  isInsideConvexHull,
  liftApplicationPoint,
  liftHoldVerdict,
  rotorLiftState,
  wingLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import { HEXACOPTER_DUCTS, hexacopterDuctPoint } from "../games/make-a-mess/src/game/townHexacopter.ts";

const ducts = HEXACOPTER_DUCTS.map((station) => hexacopterDuctPoint(station));
const centre = [
  ducts.reduce((sum, point) => sum + point[0], 0) / ducts.length,
  1,
  ducts.reduce((sum, point) => sum + point[2], 0) / ducts.length,
];
const all = (available) =>
  ducts.map((point) => ({ point, available }));
const without = (...lost) =>
  ducts.map((point, index) => ({
    point,
    available: lost.includes(index) ? 0 : 1,
  }));

test("выпуклая оболочка шести колец — шестиугольник", () => {
  const hull = convexHull(ducts.map((point) => [point[0], point[2]]));
  assert.equal(hull.length, 6);
});

test("центр масс целой машины лежит внутри оболочки", () => {
  assert.equal(
    isInsideConvexHull([centre[0], centre[2]], ducts.map((p) => [p[0], p[2]]), 0.05),
    true,
  );
});

test("подъём газовой оболочки не двигается при повреждении", () => {
  const authored = [10, 12, -3];
  assert.deepEqual(
    liftApplicationPoint("buoyant", authored, without(0, 1, 2)),
    authored,
  );
  assert.deepEqual(liftApplicationPoint("none", authored, []), authored);
});

test("подъём винтокрылой машины уезжает к уцелевшим кольцам", () => {
  const authored = [centre[0], 1.23, centre[2]];
  const intact = liftApplicationPoint("rotor", authored, all(1));
  assert.equal(Math.abs(intact[0] - centre[0]) < 1e-6, true);
  assert.equal(Math.abs(intact[2] - centre[2]) < 1e-6, true);
  // Высота остаётся паспортной: маятник машины задан её геометрией, а не
  // тем, какие кольца сейчас целы.
  assert.equal(intact[1], authored[1]);

  const damaged = liftApplicationPoint("rotor", authored, without(3));
  const lost = ducts[3];
  const before = Math.hypot(centre[0] - lost[0], centre[2] - lost[2]);
  const after = Math.hypot(damaged[0] - lost[0], damaged[2] - lost[2]);
  assert.equal(
    after > before,
    true,
    "точка приложения подъёма не ушла от потерянного кольца",
  );
});

test("пять колец из шести — это ещё полёт, а не отказ", () => {
  // Одна точка тяги даёт 1/6 веса при тяговооружённости 1.0; берём паспортную
  // 1.35, то есть 0.225 веса на кольцо.
  const capacity = 0.225;
  const verdict = liftHoldVerdict("rotor", without(2), centre, capacity, 1);
  assert.equal(verdict.holdsAttitude, true);
  assert.equal(verdict.holdsWeight, true, `подъём ${verdict.liftToWeight.toFixed(2)}`);
  assert.equal(rotorLiftState(verdict), "flying");
});

test("два соседних кольца на одном борту — потеря удержания, машина падает", () => {
  const capacity = 0.225;
  // Кольца 1 и 2 — соседние по обводу (90° и 150°).
  const verdict = liftHoldVerdict("rotor", without(1, 2), centre, capacity, 1);
  assert.equal(
    verdict.holdsAttitude,
    false,
    "центр масс остался внутри оболочки четырёх колец на одном борту",
  );
  assert.equal(rotorLiftState(verdict), "tumbling");
});

test("симметричная потеря пары держит позу, но не держит вес", () => {
  const capacity = 0.225;
  // Кольца 0 и 3 — противоположные: оболочка остаётся симметричной.
  const verdict = liftHoldVerdict("rotor", without(0, 3), centre, capacity, 1);
  assert.equal(verdict.holdsAttitude, true);
  assert.equal(verdict.holdsWeight, false, `подъём ${verdict.liftToWeight.toFixed(2)}`);
  assert.equal(
    rotorLiftState(verdict),
    "sinking",
    "управляемое снижение, а не падение",
  );
});

test("плавучая машина никогда не теряет удержание", () => {
  const verdict = liftHoldVerdict("buoyant", without(0, 1, 2, 3, 4), centre, 0, 1);
  assert.equal(verdict.holdsAttitude, true);
  assert.equal(verdict.holdsWeight, true);
});

test("крыло ниже сваливания срывается, а не снижается на оборотах", () => {
  const panels = [
    { point: [-8, 0, 1.2], available: 1 },
    { point: [-8, 0, -2], available: 1 },
    { point: [8, 0, 1.2], available: 1 },
    { point: [8, 0, -2], available: 1 },
  ];
  const flying = liftHoldVerdict("wing", panels, [0, 0, 0], 0.4, 1);
  const stalled = liftHoldVerdict("wing", panels, [0, 0, 0], 0.2, 1);
  assert.equal(wingLiftState(flying), "flying");
  assert.equal(wingLiftState(stalled), "stalled");
});
