import assert from "node:assert/strict";
import test from "node:test";
import {
  FIGURE_MINIMUM_AUTHORITY,
  FIGURE_MINIMUM_SPEED,
  FIGURE_ROLL_COLLECTIVE,
  figureAngularShare,
  figureCapabilityOf,
  figureNoseDirection,
  figureRadius,
  flightFigureVerdict,
  halfTurnSeconds,
  invertedRecoveryHeight,
  planFlightFigure,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { createMachine } from "./rotorcraft-rig.mjs";

const g = 9.81;
const rax = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const T = rax.flight.liftReserve;

/**
 * Способности RAX в величинах фигуры — СНИМАЮТСЯ С СОБРАННОЙ МАШИНЫ.
 *
 * Не из констант теста: инерции и плечи живут в скомпилированной сцене, и
 * задавать их числом здесь значило бы проверять договорённость теста с самим
 * собой. Первая редакция так и делала — и несла в паспорте пиковый темп вместо
 * ускорения.
 */
const capability = figureCapabilityOf(
  createMachine({
    pieces: compileSceneGroups(
      createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
      new Map(),
    ).clusters[0].pieces,
    vehicle: rax,
    startPoint: [0, 60, 0],
    startVelocity: [0, 0, 0],
    startNose: [1, 0, 0],
  }).machine,
);
const NOSE = [0, 1];

test("способности выведены из паспорта и совпадают с прямым счётом по нему", () => {
  assert.ok(Math.abs(capability.uprightCentripetal - (T - 1) * g) < 1e-9);
  assert.ok(Math.abs(capability.invertedCentripetal - (T + 1) * g) < 1e-9);
  // Момент половиной колец, делённый на инерцию. Числа не задаются, а
  // фиксируются: их изменение означает, что изменилась машина.
  assert.ok(Math.abs(capability.rollAcceleration - 24.02) < 0.05, `${capability.rollAcceleration}`);
  assert.ok(Math.abs(capability.pitchAcceleration - 10.53) < 0.05, `${capability.pitchAcceleration}`);
});

test("перевёрнутая тяга помогает: наверху располагаемое ПОЛУТОРАКРАТНО больше", () => {
  // Это не свойство модуля, а свойство винта, который толкает в одну сторону.
  // Вверх ногами тяга смотрит к центру петли и складывается с весом.
  assert.ok(
    capability.invertedCentripetal > capability.uprightCentripetal * 1.5,
    `верх ${capability.invertedCentripetal.toFixed(1)} против низа ${capability.uprightCentripetal.toFixed(1)}`,
  );
});

test("радиус фигуры ВЫВОДИТСЯ из связывающей точки, а не назначается", () => {
  for (const speed of [10, 16, 21]) {
    const radius = figureRadius(speed, capability);
    const needed = (speed * speed) / radius;
    assert.ok(
      needed <= capability.uprightCentripetal,
      `на ${speed} м/с фигура требует ${needed.toFixed(1)} при располагаемых ${capability.uprightCentripetal.toFixed(1)}`,
    );
    // И с запасом: фигура по пределу — это фигура, у которой нет права на ошибку.
    assert.ok(needed < capability.uprightCentripetal * 0.7);
  }
  // Быстрее — шире, и строго монотонно.
  assert.ok(figureRadius(21, capability) > figureRadius(16, capability));
});

test("ПЕТЛЯ возвращает машину туда же, тем же курсом и на ту же высоту", () => {
  const plan = planFlightFigure("loop", 16, capability, NOSE);
  const start = plan.command(0);
  const end = plan.command(1);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(
      Math.abs(end.offset[axis] - start.offset[axis]) < 1e-6,
      `ось ${axis}: вход ${start.offset[axis]}, выход ${end.offset[axis]}`,
    );
  }
  assert.equal(plan.exit.headingTurn, 0);
  assert.ok(Math.abs(plan.ceiling - 2 * plan.radius) < 1e-9);
});

test("ПЕТЛЯ действительно переворачивает машину, а не обходит верх боком", () => {
  const plan = planFlightFigure("loop", 16, capability, NOSE);
  const up = (progress) =>
    rotateVector(plan.command(progress).attitude, [0, 1, 0])[1];
  // В середине фигуры машина обязана быть вверх ногами: вертикаль её оси
  // смотрит ВНИЗ. Без этого «петля» была бы горизонтальным объездом.
  assert.ok(up(0.5) < -0.99, `в верхней точке ось вверх даёт ${up(0.5).toFixed(3)}`);
  assert.ok(up(0) > 0.99, "вход ровный");
  assert.ok(up(1) > 0.99, "выход ровный");
  // Четверть фигуры — нос в зенит.
  const nose = figureNoseDirection(plan.command(0.25).attitude, [0, 0, 1]);
  assert.ok(nose[1] > 0.99, `на четверти нос смотрит ${nose.map((v) => v.toFixed(2))}`);
});

test("верхняя точка петли — строго над входом", () => {
  const plan = planFlightFigure("loop", 16, capability, NOSE);
  const top = plan.command(0.5).offset;
  assert.ok(Math.hypot(top[0], top[2]) < 1e-6, "горизонтального сноса быть не должно");
  assert.ok(Math.abs(top[1] - 2 * plan.radius) < 1e-6);
});

test("ИММЕЛЬМАН кончается РОВНОЙ машиной — ради этого полубочка и нужна", () => {
  const plan = planFlightFigure("immelmann", 16, capability, NOSE);
  const up = rotateVector(plan.command(1).attitude, [0, 1, 0]);
  assert.ok(
    up[1] > 0.99,
    `выход из иммельмана даёт ось вверх ${up[1].toFixed(3)} — машина осталась перевёрнутой`,
  );
  // В середине полупетли она перевёрнута — иначе это не фигура.
  const half = rotateVector(plan.command(0.62).attitude, [0, 1, 0]);
  assert.ok(half[1] < 0, "после полупетли машина обязана быть вверх ногами");
});

test("ИММЕЛЬМАН разворачивает курс и поднимает, а не смещает вбок", () => {
  const plan = planFlightFigure("immelmann", 16, capability, NOSE);
  assert.ok(Math.abs(plan.exit.headingTurn - Math.PI) < 1e-9);
  assert.ok(Math.hypot(plan.exit.offset[0], plan.exit.offset[2]) < 1e-6);
  // Набор чуть меньше двух радиусов: полубочку машина держать не может и за
  // время переворота проседает. Это входит в паспорт фигуры, а не всплывает.
  assert.ok(plan.exit.offset[1] > 0);
  assert.ok(plan.exit.offset[1] < 2 * plan.radius);
});

test("нос в петле разворачивается ПЛАВНО, без скачков параметризации", () => {
  // Ловушка «тангаж-крен»: на 90° представление вырождается. Проверяем, что
  // ось носа идёт непрерывно все 360°.
  const plan = planFlightFigure("loop", 16, capability, NOSE);
  let previous = figureNoseDirection(plan.command(0).attitude, [0, 0, 1]);
  for (let step = 1; step <= 200; step += 1) {
    const nose = figureNoseDirection(plan.command(step / 200).attitude, [0, 0, 1]);
    const jump = Math.hypot(
      nose[0] - previous[0],
      nose[1] - previous[1],
      nose[2] - previous[2],
    );
    assert.ok(jump < 0.08, `скачок ${jump.toFixed(3)} на доле ${(step / 200).toFixed(3)}`);
    previous = nose;
  }
});

// ---------------------------------------------------------------------------
// Ворота входа — они же замена угловому порогу
// ---------------------------------------------------------------------------

const goodGate = {
  speed: 16,
  heightAboveGround: 40,
  headroom: 60,
  authority: 1,
};

test("фигура ПРОПУСКАЕТСЯ, если её нечем закончить, а не пробуется", () => {
  const plan = planFlightFigure("loop", 16, capability, NOSE);
  assert.equal(flightFigureVerdict(plan, goodGate, capability).flyable, true);

  const slow = flightFigureVerdict(
    plan,
    { ...goodGate, speed: FIGURE_MINIMUM_SPEED - 1 },
    capability,
  );
  assert.equal(slow.flyable, false);
  assert.match(slow.reason, /ход/);

  const damaged = flightFigureVerdict(
    plan,
    { ...goodGate, authority: FIGURE_MINIMUM_AUTHORITY - 0.05 },
    capability,
  );
  assert.equal(damaged.flyable, false);
  assert.match(damaged.reason, /власт/);

  const lowSky = flightFigureVerdict(
    plan,
    { ...goodGate, headroom: plan.ceiling - 1 },
    capability,
  );
  assert.equal(lowSky.flyable, false);
  assert.match(lowSky.reason, /неб/);

  const lowGround = flightFigureVerdict(
    plan,
    { ...goodGate, heightAboveGround: 2 },
    capability,
  );
  assert.equal(lowGround.flyable, false);
  assert.match(lowGround.reason, /высот/);
});

test("власть по крену считается ПО ГАЗУ, а не по паспортному пределу", () => {
  // Паспортный предел снят при среднем газе в половину резерва. На газе
  // возврата его столько, сколько разрешает разнотяг: кольцу некуда ниже нуля.
  const share = figureAngularShare(capability, FIGURE_ROLL_COLLECTIVE);
  assert.ok(share < 0.35, `доступно ${share.toFixed(3)} предельного`);
  // Больше газа — больше власти, и строго монотонно.
  assert.ok(figureAngularShare(capability, 2) > share);
  // Полубочка на этой доле идёт заметно дольше паспортной.
  const honest = halfTurnSeconds(capability.rollAcceleration * share);
  const naive = halfTurnSeconds(capability.rollAcceleration);
  assert.ok(honest > naive * 1.7, `${honest.toFixed(2)} против ${naive.toFixed(2)} с`);
});

test("высота на возврат из перевёрнутого — величина, а не догадка", () => {
  const height = invertedRecoveryHeight(capability);
  // Полбочки на выравнивание плюс гашение набранной вертикальной скорости, и
  // полбочки — по власти, которая ЕСТЬ вверх ногами. Через паспортный предел
  // выходило 1.7 м, и это была та же ошибка, что раньше дала 0.42: расчёт по
  // способности, которой на этом режиме у машины нет.
  assert.ok(height > 9 && height < 15, `${height.toFixed(2)} м`);
  // И она обязана считаться от УСКОРЕНИЯ: вдвое более резвая машина
  // возвращается заметно дешевле.
  const brisk = invertedRecoveryHeight({ ...capability, rollAcceleration: 48 });
  assert.ok(brisk < height * 0.75, `${brisk.toFixed(2)} против ${height.toFixed(2)}`);
});

test("фигура на пределе мира не начинается: небо полигона знает свой потолок", () => {
  const plan = planFlightFigure("loop", 21, capability, NOSE);
  // Полигон: суша 50, небо 150. Петля на крейсере просит два радиуса.
  assert.ok(plan.ceiling < 60, `петля на 21 м/с просит ${plan.ceiling.toFixed(1)} м неба`);
  assert.equal(
    flightFigureVerdict(plan, { ...goodGate, speed: 21, headroom: 120 }, capability)
      .flyable,
    true,
  );
});
