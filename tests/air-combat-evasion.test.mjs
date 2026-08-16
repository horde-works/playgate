import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  breakDirection,
  createEvasionState,
  evasionHullFromLocalBounds,
  projectileRocketThreat,
  rocketApproach,
  stepEvasion,
} from "../games/make-a-mess/src/game/missileEvasion.ts";
import {
  COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE,
  DUCT_HEXACOPTER_RANGE_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";

/**
 * УКЛОНЕНИЕ ЖЕРТВЫ — ОТ ПУСКА, А НЕ ОТ ПОДОЗРИТЕЛЬНОГО ПОВЕДЕНИЯ.
 *
 * Первая редакция пугалась геометрии сближения, и вердикт Igor снял её: от
 * ПУШКИ увернуться нельзя вовсе (луч мгновенный), а дёргаться до выстрела —
 * ясновидение и суета. Уклоняются от того, что летит и имеет время полёта.
 *
 * Второй закон здесь так же важен, как первый: НЕ ПОПАДАЕТ — НЕ ДЁРГАЙСЯ.
 */

const CAPABILITY = {
  breakSpeed: 16,
  breakSeconds: 0.8,
  margin: 2.5,
  horizonSeconds: 2.5,
};
const DECK = 0;
const VECTOR_DYNAMICS = {
  orientation: [0, 0, 0, 1],
  authoredNose: [0, -1],
  hull: {
    halfExtents: [3, 0.7, 2.4],
    centreOffset: [0, 0, 0],
  },
  horizontalAcceleration: 14.5,
  upwardAcceleration: 25,
  downwardAcceleration: 9.81,
  liftReserve: 4.2,
  surgeAcceleration: 8,
  attitudeRate: 1.9,
  maneuverScale: 1,
};

function prey(centre = [0, 30, 0], velocity = [0, 0, 12]) {
  return { id: "prey", allegiance: "yaqui", centre, velocity, radius: 2.6 };
}

/** Ракета, идущая из точки в сторону цели со скоростью 96 м/с. */
function rocket(from, towards, overrides = {}) {
  const dx = towards[0] - from[0];
  const dy = towards[1] - from[1];
  const dz = towards[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    id: 1,
    ownerId: "hunter",
    kind: "podRocket",
    position: from,
    velocity: [(dx / len) * 96, (dy / len) * 96, (dz / len) * 96],
    blastRadius: 2,
    remainingSeconds: 1.8,
    ...overrides,
  };
}

test("RAX и VX оба объявляют способность уклоняться", () => {
  assert.ok(COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE.flight.evasion);
  assert.ok(DUCT_HEXACOPTER_RANGE_AIR_VEHICLE.flight.evasion);
});

test("габарит вынесенной от нуля машины остаётся возле её центра масс", () => {
  // Реальные координаты VX-8: его пост вынесен на [30, 1.32, -26]. До
  // исправления origin терялся, и поле ставило фантомный корпус примерно на
  // [-30, -1.5, 26] от настоящего центра машины.
  const hull = evasionHullFromLocalBounds(
    {
      minimum: [-5.6498922567, -4.2150862285, -5.2645253314],
      maximum: [5.048236907, 4.1927280542, 5.7859599679],
    },
    [30, 1.32, -26],
    [29.9922477515, 1.4771204397, -25.9934638072],
  );
  assert.ok(Math.abs(hull.centreOffset[0] + 0.2931) < 0.001);
  assert.ok(Math.abs(hull.centreOffset[1] + 0.1683) < 0.001);
  assert.ok(Math.abs(hull.centreOffset[2] - 0.2542) < 0.001);
});

test("исполняемое задание не может затереть более поздний рефлекс VX", () => {
  const runtime = readFileSync(
    new URL(
      "../games/make-a-mess/src/game/VehicleFrameSystem.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const figure = runtime.indexOf("const figured = advanceRouteFigureFrame({");
  const evasion = runtime.indexOf("const evasionStep = stepEvasion({");
  const surface = runtime.indexOf("const floorRelief =");
  assert.ok(figure >= 0 && evasion >= 0 && surface >= 0);
  assert.ok(
    figure < evasion && evasion < surface,
    "иерархия обязана быть: задание → уклонение → поверхность",
  );
});

test("посадка и управляемое снижение не выключают ракетный рефлекс", () => {
  const runtime = readFileSync(
    new URL(
      "../games/make-a-mess/src/game/VehicleFrameSystem.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const recoveryGate = runtime.indexOf(
    "const rotorRecoveryPhase = state.recovery?.lifecycle.phase ?? null;",
  );
  const evasion = runtime.indexOf("const evasion = frame.flight.evasion;", recoveryGate);
  const decision = runtime.indexOf("const evasionStep = stepEvasion({", evasion);
  const application = runtime.indexOf("const baseGuidance = rotorGuidance ??", decision);
  assert.ok(
    recoveryGate >= 0 && evasion > recoveryGate && decision > evasion && application > decision,
  );
  assert.doesNotMatch(
    runtime.slice(evasion, decision),
    /flight\?\.castOff\s*&&\s*rotorGuidance/,
    "рефлекс всё ещё требует маршрутного guidance",
  );
  assert.match(
    runtime.slice(recoveryGate, application),
    /rotorRecoveryPhase === "landing"/,
  );
  assert.match(
    runtime.slice(recoveryGate, application),
    /rotorRecoveryPhase === "descent"/,
  );
  const commanded = runtime.indexOf("const evasionActuallyCommanded =");
  const reported = runtime.indexOf("if (evasionActuallyCommanded) {", commanded);
  assert.ok(commanded > application && reported > commanded);
});

test("сближение с ракетой считается по обоим движениям, а не по одному", () => {
  // Ракета в лоб с 96 м/с при дистанции 48 м: подлёт около полусекунды, и
  // жертва своим ходом его укорачивает.
  const shot = rocket([0, 30, 48], [0, 30, 0]);
  const { seconds, miss } = rocketApproach(prey(), shot);
  assert.ok(seconds > 0.4 && seconds < 0.5, `подлёт ${seconds.toFixed(3)} с`);
  assert.ok(miss < 0.001, `промах ${miss.toFixed(3)} м при попадании в центр`);
});

test("ушедшая ракета не тревожит: ближайшая точка позади", () => {
  // Прошла мимо и удаляется. Дёргаться поздно и незачем.
  const past = {
    id: 2,
    ownerId: "hunter",
    kind: "podRocket",
    position: [0, 30, -20],
    velocity: [0, 0, -96],
    blastRadius: 2,
    remainingSeconds: 1.8,
  };
  assert.ok(rocketApproach(prey(), past).seconds <= 0);
  const step = stepEvasion({
    own: prey(),
    rockets: [past],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(step.velocityOffset, [0, 0, 0]);
});

test("НЕ ПОПАДАЕТ — НЕ ДЁРГАЙСЯ", () => {
  // Правило израильской ПВО. Ракета пройдёт в стороне дальше, чем радиус
  // поражения с запасом, — манёвр только испортил бы собственный маршрут.
  const wide = rocket([40, 30, 48], [40, 30, 0]);
  const step = stepEvasion({
    own: prey(),
    rockets: [wide],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(
    step.velocityOffset,
    [0, 0, 0],
    "жертва дёрнулась от ракеты, которая и так проходит мимо",
  );
  assert.equal(step.threatId, null);
});

test("идущая в поражение ракета поднимает рывок", () => {
  const step = stepEvasion({
    own: prey(),
    rockets: [rocket([0, 30, 48], [0, 30, 0])],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.ok(step.state.breakSeconds > 0, "рывок обязан начаться");
  assert.equal(step.threatId, 1);
  assert.ok(
    Math.hypot(...step.velocityOffset) > 15,
    `рывок вялый: ${Math.hypot(...step.velocityOffset).toFixed(1)} м/с`,
  );
});

test("далёкая ракета ждёт своего кадра, а не тратит манёвр сейчас", () => {
  // За горизонтом решение спокойно примет следующий кадр.
  const far = {
    id: 3,
    ownerId: "hunter",
    kind: "podRocket",
    position: [0, 30, 400],
    velocity: [0, 0, -96],
    blastRadius: 2,
    remainingSeconds: 1.8,
  };
  const step = stepEvasion({
    own: prey(),
    rockets: [far],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.deepEqual(step.velocityOffset, [0, 0, 0]);
});

test("ракета, которая самоликвидируется до сближения, манёвра не требует", () => {
  const expiring = rocket([0, 30, 48], [0, 30, 0], {
    remainingSeconds: 0.2,
  });
  const step = stepEvasion({
    own: prey(),
    rockets: [expiring],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.equal(step.threatId, null);
});

test("рывок ДОВОДИТСЯ и не пересматривается внутри срока", () => {
  const shot = rocket([0, 30, 48], [0, 30, 0]);
  const first = stepEvasion({
    own: prey(),
    rockets: [shot],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const chosen = first.state.breakDirection;
  let state = first.state;
  for (let frame = 0; frame < 10; frame += 1) {
    const step = stepEvasion({
      own: prey(),
      // Та же ракета движется по своей трассе; её id в реестре стабилен.
      rockets: [{ ...shot, position: [0, 30, 48 - frame * 1.6] }],
      capability: CAPABILITY,
      deltaSeconds: 1 / 60,
      state,
      deck: DECK,
    });
    state = step.state;
    assert.deepEqual(step.state.breakDirection, chosen);
  }
});

test("новая более срочная ракета немедленно становится главной угрозой", () => {
  const firstThreat = rocket([48, 30, 0], [0, 30, 0], { id: 610 });
  const first = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [firstThreat],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const fromAbove = rocket([0, 60, 0], [0, 30, 0], { id: 611 });
  const interrupted = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [firstThreat, fromAbove],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: first.state,
    deck: DECK,
  });
  assert.equal(interrupted.state.threatId, fromAbove.id);
  assert.ok(
    interrupted.closingSeconds < first.closingSeconds,
    "состояние сохранило срок старой ракеты",
  );
});

test("аналитический runtime учитывает уже действующее ускорение машины", () => {
  const output = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [
      {
        id: 612,
        ownerId: "hunter",
        kind: "podRocket",
        position: [10, 30, 134.4],
        velocity: [0, 0, -96],
        blastRadius: 2,
        remainingSeconds: 1.8,
      },
    ],
    capability: CAPABILITY,
    dynamics: { ...VECTOR_DYNAMICS, currentAcceleration: [10, 0, 0] },
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.equal(output.threatId, 612);
});

test("подрыв по таймеру до геометрического сближения не теряется", () => {
  const output = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [
      {
        id: 613,
        ownerId: "player",
        kind: "rocket",
        position: [0, 30, 17.6],
        velocity: [0, 0, -32],
        blastRadius: 9.5,
        remainingSeconds: 0.5,
      },
    ],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.equal(output.threatId, 613);
  assert.ok(Math.abs(output.closingSeconds - 0.5) < 1e-9);
});

test("новый более тяжёлый пуск пересчитывает манёвр, даже если приходит позже", () => {
  const firstThreat = rocket([6.5, 30, 48], [6.5, 30, 0], { id: 614 });
  const first = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [firstThreat],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const laterButHarder = rocket([0, 87.6, 0], [0, 30, 0], {
    id: 615,
  });
  const reconsidered = stepEvasion({
    own: prey([0, 30, 0], [0, 0, 0]),
    rockets: [firstThreat, laterButHarder],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: first.state,
    deck: DECK,
  });
  assert.equal(reconsidered.threatId, laterButHarder.id);
});

test("активный runtime solver не выбирает торможение", () => {
  const own = prey([0, 30, 0], [0, 0, 20]);
  const output = stepEvasion({
    own,
    rockets: [
      {
        id: 616,
        ownerId: "hunter",
        kind: "podRocket",
        position: [-96, 30, 22],
        velocity: [96, 0, 0],
        blastRadius: 2,
        remainingSeconds: 1.8,
      },
    ],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const along =
    output.velocityOffset[0] * own.velocity[0] +
    output.velocityOffset[1] * own.velocity[1] +
    output.velocityOffset[2] * own.velocity[2];
  assert.ok(along >= -1e-8, `solver затормозил: ${along.toFixed(3)}`);
});

test("рывок уходит ВДОЛЬ ВЕКТОРА ПРОМАХА, а не наугад вбок", () => {
  // Ракета пройдёт чуть левее центра — уходить надо туда же, только дальше:
  // это прямая производная промаха по смещению.
  const shot = rocket([1.2, 30, 48], [0, 30, 0]);
  const { offset } = rocketApproach(prey(), shot);
  const direction = breakDirection(prey(), offset, DECK);
  const wanted = Math.hypot(offset[0], offset[1], offset[2]) || 1;
  const alignment =
    (direction[0] * offset[0] + direction[1] * offset[1] + direction[2] * offset[2]) /
    wanted;
  assert.ok(alignment > 0.7, `рывок ушёл не туда: совпадение ${alignment.toFixed(2)}`);
});

test("свою ракету машина игнорирует, чужую того же типа — нет", () => {
  const ownShot = rocket([0, 30, 48], [0, 30, 0], {
    ownerId: "prey",
  });
  const ignored = stepEvasion({
    own: prey(),
    rockets: [ownShot],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.equal(ignored.threatId, null);
  const foreign = stepEvasion({
    own: prey(),
    rockets: [{ ...ownShot, ownerId: "other" }],
    capability: CAPABILITY,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  assert.equal(foreign.threatId, ownShot.id);
});

test("тяжёлая и игла входят из общего физического пула со своими паспортами", () => {
  const heavy = projectileRocketThreat(
    20,
    "player",
    "rocket",
    [0, 30, 48],
    [0, 0, -32],
  );
  const lance = projectileRocketThreat(
    21,
    "player",
    "lance",
    [0, 30, 48],
    [0, 0, -124],
  );
  assert.ok(heavy && lance);
  assert.ok(heavy.blastRadius > lance.blastRadius, "сила боевой части потерялась");
  assert.ok(
    heavy.remainingSeconds > lance.remainingSeconds,
    "время самоликвидации обоих типов стало одинаковым",
  );
  assert.ok(
    rocketApproach(prey(), lance).seconds < rocketApproach(prey(), heavy).seconds,
    "скорость иглы потерялась",
  );
  for (const threat of [heavy, lance]) {
    const output = stepEvasion({
      own: prey(),
      rockets: [threat],
      capability: CAPABILITY,
      deltaSeconds: 1 / 60,
      state: createEvasionState(),
      deck: DECK,
    });
    assert.equal(output.threatId, threat.id, `${threat.kind} не распознана`);
  }
  assert.equal(
    projectileRocketThreat(22, "player", "grenade", [0, 0, 0], [0, 0, 0]),
    null,
    "граната ошибочно вошла в воздушную обстановку",
  );
});

test("РЫВОК СМЕЩАЕТ, НО НЕ ТОРМОЗИТ", () => {
  // Тормозящая жертва удобнее для упреждения, а не труднее, и вдобавок
  // бросает свою задачу. Замер первой редакции: средняя скорость падала с
  // 12-14 до 4.2 м/с — она выживала бегством, а не манёвром.
  for (const velocity of [[0, 0, 12], [12, 0, 0], [8, 0, -8]]) {
    const own = {
      id: "prey",
      allegiance: "yaqui",
      centre: [0, 30, 0],
      velocity,
      radius: 2.6,
    };
    const direction = breakDirection(own, [1, 0.2, 0], DECK);
    const speed = Math.hypot(...velocity);
    const along =
      (direction[0] * velocity[0] +
        direction[1] * velocity[1] +
        direction[2] * velocity[2]) /
      speed;
    assert.ok(Math.abs(along) < 1e-6, `продольная составляющая ${along.toFixed(3)}`);
  }
});

test("у самой палубы рывок не уводит вниз", () => {
  // Уклоняться к земле — ровно то, что охотника устраивает.
  const low = breakDirection(
    {
      id: "prey",
      allegiance: "yaqui",
      centre: [0, 3, 0],
      velocity: [0, 0, 12],
      radius: 2.6,
    },
    [0, -1, 0],
    0,
  );
  assert.ok(low[1] >= 0, `у палубы рывок пошёл вниз: ${low[1].toFixed(2)}`);
});

test("за кромку мира рывок не уводит", () => {
  const boundary = { centre: [0, 0, 0], radius: 55 };
  const direction = breakDirection(
    {
      id: "prey",
      allegiance: "yaqui",
      centre: [50, 30, 0],
      velocity: [0, 0, 12],
      radius: 2.6,
    },
    [1, 0, 0],
    0,
    boundary,
  );
  assert.ok(
    Math.abs(50 + direction[0] * 20) < boundary.radius,
    `рывок увёл за кромку: x=${(50 + direction[0] * 20).toFixed(1)}`,
  );
});

test("аналитическая плоскость даёт поперечный уход при атаке с любой стороны", () => {
  const own = prey([0, 30, 0], [0, 0, 0]);
  const attackDirections = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [1, 1, 1],
  ];
  for (const raw of attackDirections) {
    const length = Math.hypot(...raw);
    const direction = raw.map((value) => value / length);
    const threat = {
      id: 100 + attackDirections.indexOf(raw),
      ownerId: "hunter",
      kind: "podRocket",
      position: direction.map(
        // At one second even the full physical acceleration cannot buy the
        // hull + warhead + margin clearance. This test is about vector choice,
        // so give the same live envelope a genuinely survivable 1.7 seconds.
        (value, index) => own.centre[index] + value * 163.2,
      ),
      velocity: direction.map((value) => -value * 96),
      blastRadius: 2,
      remainingSeconds: 1.8,
    };
    const output = stepEvasion({
      own,
      rockets: [threat],
      capability: CAPABILITY,
      dynamics: VECTOR_DYNAMICS,
      deltaSeconds: 1 / 60,
      state: createEvasionState(),
      deck: DECK,
    });
    const speed = Math.hypot(...output.velocityOffset);
    const along = Math.abs(
      output.velocityOffset[0] * direction[0] +
        output.velocityOffset[1] * direction[1] +
        output.velocityOffset[2] * direction[2],
    );
    const across = Math.sqrt(Math.max(0, speed ** 2 - along ** 2));
    assert.ok(across > 3, `нет поперечного ухода для ${raw.join("/")}`);
    assert.ok(
      Number.isFinite(output.survivalMargin),
      `поле не оценило пролёт для ${raw.join("/")}`,
    );
  }
});

test("малой коррекции и нескольких градусов позы хватает убрать край корпуса", () => {
  const own = { ...prey([0, 30, 0], [0, 0, 0]), radius: 4 };
  const output = stepEvasion({
    own,
    rockets: [
      {
        id: 200,
        ownerId: "hunter",
        kind: "podRocket",
        // Идёт сверху рядом с концом четырёхметрового поперечного габарита.
        position: [3, 164.4, 0],
        velocity: [0, -96, 0],
        blastRadius: 0.2,
        remainingSeconds: 1.8,
      },
    ],
    capability: { ...CAPABILITY, margin: 0.2 },
    dynamics: {
      ...VECTOR_DYNAMICS,
      hull: { halfExtents: [4, 0.5, 1.2], centreOffset: [0, 0, 0] },
    },
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: DECK,
  });
  const speed = Math.hypot(...output.velocityOffset);
  assert.ok(speed > 0 && speed < 6, `поле выбрало лишний полный рывок ${speed}`);
  assert.ok(output.attitude, "край корпуса не был убран позой");
  const attitudeAngle =
    2 * Math.acos(Math.min(1, Math.abs(output.attitude[3])));
  assert.ok(
    attitudeAngle > (4 * Math.PI) / 180 &&
      attitudeAngle <= (12 * Math.PI) / 180 + 1e-6,
    `коррекция позы не минорная: ${(attitudeAngle * 180 / Math.PI).toFixed(1)}°`,
  );
  assert.ok(output.survivalMargin > 0);
});

test("повреждённая машина не получает от оценщика чужую располагаемую власть", () => {
  const own = prey([0, 30, 0], [0, 0, 0]);
  const threat = {
    id: 300,
    ownerId: "hunter",
    kind: "podRocket",
    position: [0, 78, 0],
    velocity: [0, -96, 0],
    blastRadius: 2,
    remainingSeconds: 1.8,
  };
  const evade = (maneuverScale) =>
    stepEvasion({
      own,
      rockets: [threat],
      capability: CAPABILITY,
      dynamics: {
        ...VECTOR_DYNAMICS,
        horizontalAcceleration:
          VECTOR_DYNAMICS.horizontalAcceleration * maneuverScale,
        upwardAcceleration:
          VECTOR_DYNAMICS.upwardAcceleration * maneuverScale,
        surgeAcceleration: VECTOR_DYNAMICS.surgeAcceleration * maneuverScale,
        maneuverScale,
      },
      deltaSeconds: 1 / 60,
      state: createEvasionState(),
      deck: DECK,
    });
  const healthy = evade(1);
  const damaged = evade(0.2);
  assert.ok(
    damaged.survivalMargin < healthy.survivalMargin,
    "повреждение не ухудшило честный прогноз уклонения",
  );
});

test("поле фильтрует грунт и кромку до выбора коррекции", () => {
  const sideThreat = (centre) => ({
    id: 400,
    ownerId: "hunter",
    kind: "podRocket",
    position: [centre[0], centre[1], centre[2] + 96],
    velocity: [0, 0, -96],
    blastRadius: 2,
    remainingSeconds: 1.8,
  });
  const low = prey([0, 2, 0], [0, 0, 0]);
  const aboveDeck = stepEvasion({
    own: low,
    rockets: [sideThreat(low.centre)],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: 0,
  });
  assert.ok(aboveDeck.velocityOffset[1] >= 0, "поле выбрало грунт");

  const edge = prey([50, 30, 0], [0, 0, 0]);
  const insideBoundary = stepEvasion({
    own: edge,
    rockets: [
      {
        ...sideThreat(edge.centre),
        id: 401,
        position: [50, 126, 0],
        velocity: [0, -96, 0],
      },
    ],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: 0,
    boundary: { centre: [0, 0, 0], radius: 55 },
  });
  assert.ok(
    insideBoundary.velocityOffset[0] <= 0,
    "поле выбрало наружу за кромку",
  );
});

test("реальный габарит RAX у палубы не обнуляет весь манёвр", () => {
  // Живой дефект: центр стоящего RAX находится примерно на 1.14 м, а его
  // общий authored bounds тянется вниз больше чем на четыре. Абсолютная
  // проверка эллипсоида считала уже исходное положение незаконным и
  // отбрасывала ВСЕ варианты, включая набор высоты.
  const own = prey([0, 1.14, 0], [0, 0, 0]);
  const scenarios = [
    { name: "в лоб", position: [0, 1.14, -100], velocity: [0, 0, 124] },
    { name: "снизу", position: [0, -98.86, 0], velocity: [0, 124, 0] },
    {
      name: "в мотогондолу",
      position: [4.6, 1.14, -100],
      velocity: [0, 0, 124],
    },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const output = stepEvasion({
      own: { ...own, radius: 6 },
      rockets: [
        {
          id: 402 + index,
          ownerId: "player",
          kind: "lance",
          position: scenario.position,
          velocity: scenario.velocity,
          blastRadius: 1.6,
          remainingSeconds: 2.2,
        },
      ],
      capability: CAPABILITY,
      dynamics: {
        ...VECTOR_DYNAMICS,
        hull: {
          halfExtents: [5.4, 4.2, 5.3],
          centreOffset: [0, 0, 0],
        },
        upwardAcceleration: 7.8,
        liftReserve: 1.8,
        actuatorResponseSeconds: 0.1,
      },
      deltaSeconds: 1 / 60,
      state: createEvasionState(),
      deck: 0,
    });
    assert.equal(
      output.threatId,
      402 + index,
      `${scenario.name}: игла пропала до исполнительного поля`,
    );
    assert.ok(
      Math.hypot(...output.velocityOffset) > 0,
      `${scenario.name}: поле увидело иглу, но снова выбрало нулевую команду`,
    );
    assert.ok(
      output.velocityOffset[1] >= 0,
      `${scenario.name}: из уже низкого положения поле приказало уйти дальше в палубу`,
    );
    assert.ok(Number.isFinite(output.survivalMargin), scenario.name);
  }
});

test("один выбор отвечает сразу двум ракетам из разных плоскостей", () => {
  const own = prey([0, 30, 0], [0, 0, 0]);
  const output = stepEvasion({
    own,
    rockets: [
      {
        id: 500,
        ownerId: "hunter-a",
        kind: "podRocket",
        position: [163.2, 30, 0],
        velocity: [-96, 0, 0],
        blastRadius: 2,
        remainingSeconds: 1.8,
      },
      {
        id: 501,
        ownerId: "hunter-b",
        kind: "podRocket",
        position: [0, 193.2, 0],
        velocity: [0, -96, 0],
        blastRadius: 2,
        remainingSeconds: 1.8,
      },
    ],
    capability: CAPABILITY,
    dynamics: VECTOR_DYNAMICS,
    deltaSeconds: 1 / 60,
    state: createEvasionState(),
    deck: 0,
  });
  // Общая свободная ось у двух ортогональных линий атаки — z. Ненулевая
  // компонента показывает, что поле не решило только первую ракету списка.
  assert.ok(Math.abs(output.velocityOffset[2]) > 3);
});
