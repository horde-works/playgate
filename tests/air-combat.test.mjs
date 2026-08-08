import assert from "node:assert/strict";
import test from "node:test";
import {
  CIVIL_ALLEGIANCE,
  TONKAWA_ALLEGIANCE,
  TOWN_ALLEGIANCE,
  allegianceOf,
  areHostiles,
  isHostileAllegiance,
} from "../games/make-a-mess/src/game/vehicleAllegiance.ts";
import {
  advanceGunnery,
  armGunneryForPass,
  closingSpeedTo,
  createGunneryState,
  extrapolateTrack,
  interceptSolution,
  raySolution,
  resolveVehicleWeaponShot,
  rocketMinimumRange,
} from "../games/make-a-mess/src/game/vehicleGunnery.ts";
import {
  createAirCombatState,
  noseLagSeconds,
  selectAirCombatTarget,
  stepAirCombat,
} from "../games/make-a-mess/src/game/airCombatPilot.ts";
import {
  blastEnergyAtDistance,
  explosiveProfile,
  fractureEnergyByMaterial,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import {
  COMBAT_HEXACOPTER_SKY_CONTROL,
  airVehicles,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import { dispatchedFlightKind } from "../games/make-a-mess/src/game/entryInteraction.ts";

// ---------------------------------------------------------------------------
// Свой-чужой
// ---------------------------------------------------------------------------

test("нейтрал не воюет ни с кем, а стороны враждебны симметрично", () => {
  assert.equal(isHostileAllegiance(TONKAWA_ALLEGIANCE, TOWN_ALLEGIANCE), true);
  assert.equal(isHostileAllegiance(TOWN_ALLEGIANCE, TONKAWA_ALLEGIANCE), true);
  assert.equal(isHostileAllegiance(TONKAWA_ALLEGIANCE, TONKAWA_ALLEGIANCE), false);
  assert.equal(isHostileAllegiance(TONKAWA_ALLEGIANCE, CIVIL_ALLEGIANCE), false);
  assert.equal(isHostileAllegiance(CIVIL_ALLEGIANCE, CIVIL_ALLEGIANCE), false);
});

test("не объявившая сторону машина мирная, и это читается одинаково всюду", () => {
  assert.equal(allegianceOf(undefined), CIVIL_ALLEGIANCE);
  assert.equal(allegianceOf({}), CIVIL_ALLEGIANCE);
  assert.equal(allegianceOf({ allegiance: TOWN_ALLEGIANCE }), TOWN_ALLEGIANCE);
});

test("на полигоне ровно две воюющие машины, остальной парк мирный", () => {
  const rax = airVehicles.find((entry) => entry.id === "combat-hexacopter");
  const hx6 = airVehicles.find((entry) => entry.id === "town-hexacopter");
  assert.equal(allegianceOf(rax), TONKAWA_ALLEGIANCE);
  assert.equal(allegianceOf(hx6), TOWN_ALLEGIANCE);
  assert.equal(areHostiles(rax, hx6), true);
  for (const vehicle of airVehicles) {
    if (vehicle === rax || vehicle === hx6) {
      continue;
    }
    assert.equal(
      allegianceOf(vehicle),
      CIVIL_ALLEGIANCE,
      `${vehicle.id} не должен быть втянут в бой`,
    );
    assert.equal(areHostiles(rax, vehicle), false);
  }
});

// ---------------------------------------------------------------------------
// Экстраполяция манёвра
// ---------------------------------------------------------------------------

const straight = { centre: [0, 10, 0], velocity: [3, 0.5, 4], turnRate: 0 };

test("без разворота экстраполяция — прямая", () => {
  const after = extrapolateTrack(straight, 2);
  assert.deepEqual(after.map((v) => Number(v.toFixed(6))), [6, 11, 8]);
});

test("постоянный разворот даёт ОКРУЖНОСТЬ: полный период возвращает в точку", () => {
  const track = { centre: [12, 20, -5], velocity: [8, 0, 0], turnRate: 0.4 };
  const period = (2 * Math.PI) / 0.4;
  const after = extrapolateTrack(track, period);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(
      Math.abs(after[axis] - track.centre[axis]) < 1e-9,
      `ось ${axis}: ${after[axis]} против ${track.centre[axis]}`,
    );
  }
  // Половина периода — диаметрально противоположная точка круга радиусом v/ω.
  const half = extrapolateTrack(track, period / 2);
  const diameter = Math.hypot(half[0] - track.centre[0], half[2] - track.centre[2]);
  assert.ok(Math.abs(diameter - 2 * (8 / 0.4)) < 1e-6, `диаметр ${diameter}`);
});

test("переход к нулевому темпу непрерывен, а не рвётся на пороге", () => {
  const base = { centre: [0, 0, 0], velocity: [6, 0, 0], turnRate: 0 };
  const tiny = { ...base, turnRate: 1e-5 };
  const a = extrapolateTrack(base, 3);
  const b = extrapolateTrack(tiny, 3);
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-3);
});

// ---------------------------------------------------------------------------
// Решение встречи
// ---------------------------------------------------------------------------

test("по неподвижной цели время полёта — это дальность, делённая на скорость", () => {
  const solution = interceptSolution(
    [0, 0, 0],
    [0, 0, 0],
    { centre: [0, 0, 96], velocity: [0, 0, 0], turnRate: 0 },
    96,
  );
  assert.ok(Math.abs(solution.seconds - 1) < 1e-6);
  assert.equal(solution.converged, true);
  assert.ok(Math.abs(solution.direction[2] - 1) < 1e-9);
});

test("решение самосогласовано: снаряд и цель приходят в точку одновременно", () => {
  const track = { centre: [30, 12, 40], velocity: [-9, 1.5, 5], turnRate: 0.25 };
  const origin = [0, 10, 0];
  const carrier = [4, 0, 6];
  const speed = explosiveProfile("podRocket").projectile.speed;
  const solution = interceptSolution(origin, carrier, track, speed);
  assert.equal(solution.converged, true);
  // Снаряд наследует ход носителя, поэтому проверять надо в системе стрелка.
  const meeting = extrapolateTrack(track, solution.seconds);
  const shooterAt = [
    origin[0] + carrier[0] * solution.seconds,
    origin[1] + carrier[1] * solution.seconds,
    origin[2] + carrier[2] * solution.seconds,
  ];
  const travelled = Math.hypot(
    meeting[0] - shooterAt[0],
    meeting[1] - shooterAt[1],
    meeting[2] - shooterAt[2],
  );
  assert.ok(
    Math.abs(travelled - speed * solution.seconds) < 0.05,
    `снаряд прошёл ${travelled.toFixed(3)} за ${(speed * solution.seconds).toFixed(3)}`,
  );
});

test("упреждение по маневрирующей цели ОТЛИЧАЕТСЯ от упреждения по прямой", () => {
  const base = { centre: [0, 10, 60], velocity: [10, 0, 0], turnRate: 0 };
  const turning = { ...base, turnRate: 0.5 };
  const speed = explosiveProfile("podRocket").projectile.speed;
  const a = interceptSolution([0, 10, 0], [0, 0, 0], base, speed);
  const b = interceptSolution([0, 10, 0], [0, 0, 0], turning, speed);
  const apart = Math.hypot(
    a.aimPoint[0] - b.aimPoint[0],
    a.aimPoint[2] - b.aimPoint[2],
  );
  // Иначе «текущий манёвр» в упреждение не входит и пункт про упреждение мёртв.
  assert.ok(apart > 0.5, `точки прицеливания разошлись всего на ${apart.toFixed(3)} м`);
});

// ---------------------------------------------------------------------------
// Луч пушки
// ---------------------------------------------------------------------------

test("луч решает по ГАБАРИТУ цели, а не по её центру", () => {
  const hit = raySolution([0, 0, 0], [0, 0, 1], [1.5, 0, 40], 2.6, 70);
  assert.equal(hit.onTarget, true);
  assert.ok(Math.abs(hit.missDistance - 1.5) < 1e-6);

  const miss = raySolution([0, 0, 0], [0, 0, 1], [4, 0, 40], 2.6, 70);
  assert.equal(miss.onTarget, false);

  const outOfRange = raySolution([0, 0, 0], [0, 0, 1], [0, 0, 90], 2.6, 70);
  assert.equal(outOfRange.onTarget, false);
});

test("цель позади среза не читается как «почти попал»", () => {
  const behind = raySolution([0, 0, 0], [0, 0, 1], [0, 0, -30], 2.6, 70);
  assert.equal(behind.onTarget, false);
  assert.equal(behind.missDistance, 30);
});

// ---------------------------------------------------------------------------
// Боеприпас пода
// ---------------------------------------------------------------------------

const STEEL_CARVE = fractureEnergyByMaterial.steel * 1.15;

function steelReach(kind) {
  const profile = explosiveProfile(kind);
  let reach = 0;
  for (let d = 0; d <= profile.blastRadius; d += 0.005) {
    if (blastEnergyAtDistance(d, profile.blastRadius, profile.damageEnergy) > STEEL_CARVE) {
      reach = d;
    }
  }
  return reach;
}

test("одна подвесная ракета берёт СВОЁ кольцо и не достаёт до соседнего", () => {
  const reach = steelReach("podRocket");
  // Критерий тот же, которым откалибрована игла: удвоенный радиус поражения
  // меньше межкольцевого шага 2.15 м. Нижняя граница не менее важна — кольцо
  // закрыто кожухом, и статоры сидят за ним у ступицы: боеприпас, который до
  // них не дотягивается, бесполезен (замер: при 0.45 м — 83% попаданий и ноль
  // снятых колец).
  assert.ok(
    reach > 0.8,
    `ракета обязана пробивать кожух до статоров, а даёт ${reach.toFixed(3)} м`,
  );
  assert.ok(
    reach * 2 < 2.15,
    `радиус поражения ${reach.toFixed(3)} м дотягивается до соседнего кольца`,
  );
  // И она слабее ручной иглы: та берёт кольцо одним точным выстрелом.
  assert.ok(reach < steelReach("lance"));
});

test("неконтактный взрыватель не шире собственного радиуса поражения", () => {
  const profile = explosiveProfile("podRocket");
  assert.ok(
    profile.proximityFuse > 0,
    "по маневрирующей машине контактного подрыва почти не бывает",
  );
  assert.ok(
    profile.proximityFuse < steelReach("podRocket"),
    "взрыватель, срабатывающий за пределом поражения, тратит ракету впустую",
  );
});

test("пуск ближе собственного радиуса поражения запрещён", () => {
  const armament = combatHexacopterRangeBlueprint.armament;
  const still = rocketMinimumRange(armament.rockets, 3.44, 0);
  const closing = rocketMinimumRange(armament.rockets, 3.44, 21);
  const blast = explosiveProfile("podRocket").blastPushRadius;
  assert.ok(still >= 3.44 + blast, "запас обязан покрывать габарит и ударную волну");
  assert.ok(
    closing > still,
    "на сближении минимальная дальность обязана расти, а не стоять числом",
  );
});

// ---------------------------------------------------------------------------
// Огневой автомат
// ---------------------------------------------------------------------------

const armament = combatHexacopterRangeBlueprint.armament;

function fireInput(overrides = {}) {
  return {
    weaponsFree: true,
    cannonSolved: true,
    range: 45,
    closingSpeed: 10,
    ownRadius: 3.44,
    rocketAimError: 0.01,
    rocketAimTolerance: 0.06,
    rocketSolved: true,
    ...overrides,
  };
}

test("пушка молчит, пока сопровождение не устоялось", () => {
  let state = createGunneryState(12);
  const dt = 1 / 60;
  let fired = 0;
  let elapsed = 0;
  for (let step = 0; step < 30; step += 1) {
    const result = advanceGunnery(state, armament, fireInput(), dt);
    state = result.state;
    elapsed += dt;
    const cannon = result.shots.filter((shot) => shot.weapon === "cannon").length;
    if (cannon > 0 && fired === 0) {
      assert.ok(
        elapsed >= armament.cannon.trackingSeconds,
        `открыла огонь через ${elapsed.toFixed(3)} с при пороге ${armament.cannon.trackingSeconds}`,
      );
    }
    fired += cannon;
  }
  assert.ok(fired > 0, "устойчивое сопровождение обязано кончиться выстрелом");
});

test("разрыв решения обнуляет сопровождение, а не копит его по кусочкам", () => {
  let state = createGunneryState(12);
  const dt = 1 / 60;
  for (let step = 0; step < 40; step += 1) {
    // Решение мигает через кадр: суммарно времени хватает, непрерывно — нет.
    const result = advanceGunnery(
      state,
      armament,
      fireInput({ cannonSolved: step % 2 === 0 }),
      dt,
    );
    state = result.state;
    assert.equal(
      result.shots.some((shot) => shot.weapon === "cannon"),
      false,
      "мигающее решение не должно давать выстрел",
    );
  }
});

test("под стреляет РИПЛОМ: три трубы подряд, а не по одной", () => {
  let state = createGunneryState(12);
  const dt = 1 / 60;
  const rockets = [];
  let seconds = 0;
  for (let step = 0; step < 60 * 3; step += 1) {
    const result = advanceGunnery(state, armament, fireInput(), dt);
    state = result.state;
    seconds += dt;
    for (const shot of result.shots) {
      if (shot.weapon === "podRocket") {
        rockets.push(seconds);
      }
    }
  }
  assert.equal(rockets.length, armament.rockets.rippleSize, `ракет вышло ${rockets.length}`);
  // Интервалы ВНУТРИ рипла много короче перезарядки: это очередь, а не
  // три отдельных пуска. Четвёртой ракеты в этом заходе не будет вовсе —
  // заход даёт одну огневую возможность (см. тест про один рипл на заход).
  assert.ok(rockets[1] - rockets[0] < armament.rockets.reloadSeconds / 2);
  assert.ok(rockets[2] - rockets[1] < armament.rockets.reloadSeconds / 2);
  assert.ok(
    rockets[2] - rockets[0] <= armament.rockets.rippleInterval * 2 + 0.05,
    "рипл обязан уложиться в свои интервалы",
  );
});

test("рипл РАСКЛАДЫВАЕТСЯ веером, а не кладёт ракеты одну в другую", () => {
  let state = createGunneryState(12);
  const dt = 1 / 60;
  const deflections = [];
  for (let step = 0; step < 60 && deflections.length < 3; step += 1) {
    const result = advanceGunnery(state, armament, fireInput(), dt);
    state = result.state;
    for (const shot of result.shots) {
      if (shot.weapon === "podRocket") {
        deflections.push(shot.deflection);
      }
    }
  }
  assert.equal(deflections.length, 3);
  const spread = Math.max(...deflections) - Math.min(...deflections);
  assert.ok(
    spread > armament.rockets.rippleSpread,
    `веер ${spread.toFixed(4)} рад должен быть шире одного шага`,
  );
});

test("ОДИН РИПЛ НА ЗАХОД: заход — огневая возможность, а не расход всего пода", () => {
  // Вердикт Igor: цель не обязана падать с первого раза, и это не про
  // введение ошибки, а про настойчивость. Выражается расходом, а не разбросом.
  let state = createGunneryState(12);
  let fired = 0;
  for (let step = 0; step < 60 * 20; step += 1) {
    const result = advanceGunnery(state, armament, fireInput(), 1 / 60);
    state = result.state;
    fired += result.shots.filter((shot) => shot.weapon === "podRocket").length;
  }
  assert.equal(
    fired,
    armament.rockets.rippleSize,
    `за один заход должен уйти ровно один рипл, а ушло ${fired}`,
  );

  // Новый заход снова вооружает под.
  let next = armGunneryForPass(state);
  let second = 0;
  for (let step = 0; step < 60 * 5; step += 1) {
    const result = advanceGunnery(next, armament, fireInput(), 1 / 60);
    next = result.state;
    second += result.shots.filter((shot) => shot.weapon === "podRocket").length;
  }
  assert.equal(second, armament.rockets.rippleSize);
});

test("ПУСТОЙ ПОД — ЭТО ПАУЗА, А НЕ ТУПИК: полминуты и заново", () => {
  // Первая редакция запирала машину навсегда: счётчик был, способа пополнить
  // не было, и «не сбил — продолжает охотиться» переставало быть выполнимым
  // ровно тогда, когда становилось нужным.
  const full = armament.rockets.mounts.length;
  let state = createGunneryState(full);
  const dt = 1 / 60;
  let fired = 0;
  let emptyAt = null;
  let seconds = 0;

  // Опустошаем под заходами.
  for (let pass = 0; pass < 6 && emptyAt === null; pass += 1) {
    state = armGunneryForPass(state);
    for (let step = 0; step < 60 * 4; step += 1) {
      const result = advanceGunnery(state, armament, fireInput(), dt);
      state = result.state;
      seconds += dt;
      fired += result.shots.filter((shot) => shot.weapon === "podRocket").length;
      if (state.magazine === 0 && emptyAt === null) {
        emptyAt = seconds;
      }
    }
  }
  assert.equal(fired, full, `под обязан выдать ровно ${full}, а выдал ${fired}`);
  assert.ok(state.rearmSeconds > 0, "опустевший под обязан начать снаряжаться");

  // Пока идёт снаряжение — ракет нет, что бы ни просили. Шагаем по
  // ФАКТИЧЕСКОМУ остатку: таймер начал тикать в тот же момент, когда под
  // опустел, то есть часть его уже прошла внутри последнего захода.
  const remaining = state.rearmSeconds;
  assert.ok(
    remaining > armament.rockets.rearmSeconds * 0.5,
    `таймер снаряжения ${remaining.toFixed(1)} с — начался не тогда, когда под опустел`,
  );
  let duringRearm = 0;
  for (let step = 0; step < Math.floor(remaining * 60) - 1; step += 1) {
    state = armGunneryForPass(state);
    const result = advanceGunnery(state, armament, fireInput(), dt);
    state = result.state;
    duringRearm += result.shots.filter((s) => s.weapon === "podRocket").length;
  }
  assert.equal(duringRearm, 0, "на снаряжении под стрелять не может");
  assert.equal(state.magazine, 0, "и остаётся пустым до конца таймера");

  // И сразу по истечении таймера — снова полон. Досчитываем последние кадры:
  // остаток после целого числа шагов меньше кадра, но не ноль.
  let refilled = 0;
  for (let step = 0; step < 4; step += 1) {
    const result = advanceGunnery(state, armament, { ...fireInput(), weaponsFree: false }, dt);
    state = result.state;
    if (state.rearmSeconds === 0) {
      refilled = state.magazine;
      break;
    }
  }
  assert.equal(refilled, full, "по истечении таймера под обязан быть снаряжён целиком");
  assert.equal(state.rearmSeconds, 0);
});

test("на снаряжении пушка работает: охота не прерывается", () => {
  const full = armament.rockets.mounts.length;
  let state = { ...createGunneryState(0), rearmSeconds: 30 };
  let cannon = 0;
  for (let step = 0; step < 60 * 5; step += 1) {
    const result = advanceGunnery(state, armament, fireInput(), 1 / 60);
    state = result.state;
    cannon += result.shots.filter((s) => s.weapon === "cannon").length;
  }
  assert.ok(cannon > 0, "пустой под не имеет права глушить пушку");
  assert.ok(state.magazine < full, "и под при этом ещё не снаряжён");
});

test("в упор ракета не пускается, и это видно наружу отдельным признаком", () => {
  let state = createGunneryState(12);
  const result = advanceGunnery(
    state,
    armament,
    fireInput({ range: 8, closingSpeed: 18 }),
    1 / 60,
  );
  assert.equal(
    result.shots.some((shot) => shot.weapon === "podRocket"),
    false,
  );
  assert.equal(result.rocketBlockedByMinimumRange, true);
});

test("запрет огня снимает и пушку, и ракету", () => {
  let state = createGunneryState(12);
  for (let step = 0; step < 60; step += 1) {
    const result = advanceGunnery(
      state,
      armament,
      fireInput({ weaponsFree: false }),
      1 / 60,
    );
    state = result.state;
    assert.equal(result.shots.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Вооружение принадлежит МОДЕЛИ
// ---------------------------------------------------------------------------

test("стволы и трубы паспорта стоят там же, где куски на модели", () => {
  const pieces = compileSceneGroups(
    createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
    new Map(),
  ).clusters[0].pieces;
  const nearest = (point) => {
    let best = Infinity;
    for (const piece of pieces) {
      const distance = Math.hypot(
        piece.position[0] - point[0],
        piece.position[1] - point[1],
        piece.position[2] - point[2],
      );
      best = Math.min(best, distance);
    }
    return best;
  };
  for (const mount of armament.cannon.mounts) {
    assert.ok(
      nearest(mount.muzzle) < 0.12,
      `ствол ${mount.id} висит в пустоте: ближайший кусок в ${nearest(mount.muzzle).toFixed(3)} м`,
    );
  }
  assert.equal(armament.rockets.mounts.length, 12, "двенадцать труб, как на модели");
  for (const mount of armament.rockets.mounts) {
    assert.ok(
      nearest(mount.muzzle) < 0.16,
      `труба ${mount.id} висит в пустоте: ${nearest(mount.muzzle).toFixed(3)} м`,
    );
  }
});

test("оба ствола смотрят ВПЕРЁД: срезы вынесены по носу дальше центра", () => {
  for (const mount of armament.cannon.mounts) {
    assert.ok(mount.muzzle[2] > 3.4, "спарка вынесена в нос");
  }
  for (const mount of armament.rockets.mounts) {
    assert.ok(mount.muzzle[2] > 1.5, "устья труб смотрят вперёд");
  }
});

// ---------------------------------------------------------------------------
// Автомат боя
// ---------------------------------------------------------------------------

const station = {
  centre: [0, 0.08, 0],
  radius: 46,
  altitude: 26,
  speed: 16,
  detectionRange: 140,
};

const limits = { maximumSpeed: 21, yawRate: 0.72, liftTrimRange: 0.32 };

function ownAt(centre, nose = [0, 1], velocity = [0, 0, 0]) {
  return {
    allegiance: TONKAWA_ALLEGIANCE,
    centre,
    velocity,
    nose,
    gunAxis: [nose[0], 0, nose[1]],
    verticalSpeed: 0,
    radius: 3.44,
  };
}

function trackAt(centre, velocity = [0, 0, 0], overrides = {}) {
  return {
    id: "hx6",
    allegiance: TOWN_ALLEGIANCE,
    centre,
    velocity,
    turnRate: 0,
    radius: 2.65,
    weakPoints: [],
    landed: false,
    failed: false,
    ...overrides,
  };
}

test("мирный борт целью не становится, а чужой — становится", () => {
  const own = ownAt([0, 26, 0]);
  const civil = trackAt([0, 26, 40], [0, 0, 0], { allegiance: CIVIL_ALLEGIANCE });
  assert.equal(selectAirCombatTarget(own, station, [civil]), null);
  assert.ok(selectAirCombatTarget(own, station, [trackAt([0, 26, 40])]));
});

test("севшая и отказавшая цель снимают задачу атаки", () => {
  const own = ownAt([0, 26, 0]);
  assert.equal(
    selectAirCombatTarget(own, station, [trackAt([0, 5, 40], [0, 0, 0], { landed: true })]),
    null,
  );
  assert.equal(
    selectAirCombatTarget(own, station, [trackAt([0, 26, 40], [0, 0, 0], { failed: true })]),
    null,
  );
});

test("рыскание разворачивает нос К ЦЕЛИ, а не от неё", () => {
  // Знак борта и знак рыскания — самый дорогой класс ошибок в этом проекте:
  // машина честно исполняет команду и уезжает в противоположную сторону.
  for (const bearing of [0.6, -0.6, 2.2, -2.2]) {
    const nose = [0, 1];
    const target = [Math.sin(bearing) * 60, 26, Math.cos(bearing) * 60];
    const own = ownAt([0, 26, 0], nose);
    const output = stepAirCombat({
      own,
      station,
      armament,
      limits,
      tracks: [trackAt(target)],
      deltaSeconds: 1 / 60,
      state: createAirCombatState(12),
    });
    const before = Math.abs(bearing);
    // Поворот вокруг +Y: x' = x·cos + z·sin, z' = −x·sin + z·cos.
    const phi = output.guidance.yawRate * 0.25;
    const turned = [
      nose[0] * Math.cos(phi) + nose[1] * Math.sin(phi),
      -nose[0] * Math.sin(phi) + nose[1] * Math.cos(phi),
    ];
    const after = Math.abs(
      Math.atan2(
        target[0] * turned[1] - target[2] * turned[0],
        target[0] * turned[0] + target[2] * turned[1],
      ),
    );
    assert.ok(
      after < before,
      `на пеленге ${bearing.toFixed(2)} ошибка выросла с ${before.toFixed(3)} до ${after.toFixed(3)}`,
    );
  }
});

test("огонь разрешён ТОЛЬКО в атаке: на станции машина стволом не работает", () => {
  const own = ownAt([0, 26, 0]);
  const output = stepAirCombat({
    own,
    station,
    armament,
    limits,
    tracks: [],
    deltaSeconds: 1 / 60,
    state: createAirCombatState(12),
  });
  assert.equal(output.state.mode, "station");
  assert.equal(output.telemetry.weaponsFree, false);
  assert.equal(output.shots.length, 0);
});

test("ВЫСОТА — ЭТО ПРИЦЕЛ: наклонённый ствол требует другой высоты", () => {
  // Машина с опущенным носом обязана встать ВЫШЕ цели: её луч уходит вниз.
  const level = ownAt([0, 26, 0]);
  const nosedown = { ...level, gunAxis: [0, -0.25, Math.sqrt(1 - 0.0625)] };
  const track = trackAt([0, 26, 50], [8, 0, 0]);
  const shared = {
    station,
    armament,
    limits,
    tracks: [track],
    deltaSeconds: 1 / 60,
    state: { ...createAirCombatState(12), mode: "attack", modeSeconds: 1 },
  };
  const a = stepAirCombat({ ...shared, own: level });
  const b = stepAirCombat({ ...shared, own: nosedown });
  assert.ok(
    b.guidance.liftFraction > a.guidance.liftFraction,
    "с опущенным носом машина обязана проситься выше",
  );
});

test("заход кончается срывом, а не доводкой в упор", () => {
  const own = ownAt([0, 26, 44], [0, -1], [0, 0, -18]);
  const track = trackAt([0, 26, 40], [0, 0, 0]);
  const output = stepAirCombat({
    own,
    station,
    armament,
    limits,
    tracks: [track],
    deltaSeconds: 1 / 60,
    state: { ...createAirCombatState(12), mode: "attack", modeSeconds: 2 },
  });
  assert.equal(output.state.mode, "break");
  assert.equal(output.state.passes, 1);
});

test("следующий заход строится с ДРУГОЙ стороны", () => {
  const before = { ...createAirCombatState(12), mode: "attack", modeSeconds: 2 };
  const own = ownAt([0, 26, 44], [0, -1], [0, 0, -18]);
  const output = stepAirCombat({
    own,
    station,
    armament,
    limits,
    tracks: [trackAt([0, 26, 40])],
    deltaSeconds: 1 / 60,
    state: before,
  });
  assert.equal(output.state.passSide, -before.passSide);
});

test("КРАБ: в атаке скорость идёт мимо цели, а нос остаётся на ней", () => {
  const own = ownAt([0, 26, -40], [0, 1], [0, 0, 18]);
  const output = stepAirCombat({
    own,
    station,
    armament,
    limits,
    tracks: [trackAt([0, 26, 0], [6, 0, 0])],
    deltaSeconds: 1 / 60,
    state: {
      ...createAirCombatState(12),
      mode: "attack",
      modeSeconds: 0.5,
      passEntrySpeed: 15,
    },
  });
  // Боковая составляющая требования — и есть вынос прохода. Ноль означал бы,
  // что машина летит в цель, а не мимо неё.
  assert.ok(
    Math.abs(output.guidance.lateralSpeed) > 3,
    `поперечная просьба всего ${output.guidance.lateralSpeed.toFixed(2)} м/с — прохода нет`,
  );
  assert.ok(output.guidance.forwardSpeed > 0, "и при этом машина идёт вперёд");
});

test("время доворота носа — это и есть упреждение мгновенного луча", () => {
  const own = ownAt([0, 26, 0], [0, 1]);
  const ahead = noseLagSeconds(own, trackAt([0, 26, 60]), limits);
  const abeam = noseLagSeconds(own, trackAt([60, 26, 0]), limits);
  assert.ok(ahead < 0.05, "цель прямо по носу упреждения не требует");
  assert.ok(abeam > 1.5, "цель на траверзе требует полного доворота");
});

test("скорость сближения знаковая: расхождение обязано читаться отрицательным", () => {
  const closing = closingSpeedTo([0, 0, 0], [0, 0, 12], { centre: [0, 0, 40], velocity: [0, 0, 0] });
  const opening = closingSpeedTo([0, 0, 0], [0, 0, -12], { centre: [0, 0, 40], velocity: [0, 0, 0] });
  assert.ok(closing > 0);
  assert.ok(opening < 0);
});

// ---------------------------------------------------------------------------
// Табличка: пункт обязан ЧТО-ТО менять
// ---------------------------------------------------------------------------

test("каждый пункт таблички выбирает СВОЮ трассу, а не молча первую", () => {
  // Класс ошибки, стоивший утреннего прогона: рантайм брал вид рейса из
  // паспорта и игнорировал выбранный пункт, поэтому «Сторожить небо»
  // исполнялось как обзорный круг — машина уходила на ту же трассу и не
  // видела чужой борт. Здесь проверяется ПАСПОРТНАЯ половина: разные пункты
  // обязаны давать разные трассы. Если они одинаковы, пункт бессмыслен даже
  // при исправном рантайме.
  const berth = [0, 0.08, 0];
  for (const vehicle of airVehicles) {
    const actions = vehicle.departure?.target.actions;
    if (!actions || actions.length < 2) {
      continue;
    }
    const kinds = actions
      .map((action) => action.id)
      // `manual` — способ управления, а не вид рейса.
      .filter((id) => id !== "manual");
    const plans = kinds.map((kind) => vehicle.flight.routePlan(kind, berth));
    const ids = new Set(plans.map((plan) => plan.id));
    assert.equal(
      ids.size,
      kinds.length,
      `${vehicle.id}: пункты ${kinds.join(", ")} дают трассы ${[...ids].join(", ")}`,
    );
  }
});

test("ВЫБРАННЫЙ ПУНКТ И ЕСТЬ ВИД РЕЙСА — на обоих постах", () => {
  // Ровно та ошибка, что съела утренний прогон: со стойки площадки рейс
  // назывался паспортным именем, а не выбранным, и боевая задача исполнялась
  // как обзорный круг. Теперь решение — чистая функция, и оно проверяется.
  assert.equal(
    dispatchedFlightKind({
      post: "board",
      requestedAction: COMBAT_HEXACOPTER_SKY_CONTROL,
      departureKind: "circuit",
      manualPilotLaunch: false,
    }),
    COMBAT_HEXACOPTER_SKY_CONTROL,
  );
  // Единственный пункт — паспортный рейс.
  assert.equal(
    dispatchedFlightKind({
      post: "board",
      requestedAction: null,
      departureKind: "circuit",
      manualPilotLaunch: false,
    }),
    "circuit",
  );
  // `manual` — способ управления: трассу даёт паспорт, а не название пункта.
  assert.equal(
    dispatchedFlightKind({
      post: "board",
      requestedAction: "manual",
      departureKind: "circuit",
      manualPilotLaunch: true,
    }),
    "circuit",
  );
  // Даже если сесть за штурвал не вышло, рейс с именем «manual» не рождается.
  assert.equal(
    dispatchedFlightKind({
      post: "board",
      requestedAction: "manual",
      departureKind: "circuit",
      manualPilotLaunch: false,
    }),
    "circuit",
  );
  // Пассажирский пост вёл себя правильно и раньше — закрепляем.
  assert.equal(
    dispatchedFlightKind({
      post: "ride",
      requestedAction: "evasive",
      passengerKind: "tour",
      manualPilotLaunch: false,
    }),
    "evasive",
  );
});

test("боевая задача RAX — сторожевая орбита, а не показательный круг", () => {
  const rax = airVehicles.find((entry) => entry.id === "combat-hexacopter");
  const berth = [0, 0.08, 0];
  const guard = rax.flight.routePlan(COMBAT_HEXACOPTER_SKY_CONTROL, berth);
  const circuit = rax.flight.routePlan("circuit", berth);
  assert.notEqual(guard.id, circuit.id);

  // Орбита идёт по КРОМКЕ охраняемого круга на постоянной высоте: сторожат
  // периметр, а не летают над ним по центру.
  const radii = [];
  const altitudes = [];
  for (let i = 0; i <= 40; i += 1) {
    const p = 0.1 + (i / 40) * 0.8;
    const point = guard.point(p);
    radii.push(Math.hypot(point[0] - berth[0], point[2] - berth[2]));
    altitudes.push(point[1] - berth[1]);
  }
  const spread = Math.max(...radii) - Math.min(...radii);
  assert.ok(spread < 1.5, `радиус орбиты гуляет на ${spread.toFixed(2)} м`);
  assert.ok(
    Math.max(...altitudes) - Math.min(...altitudes) < 0.5,
    "высота дежурства обязана быть постоянной",
  );
  // И дежурство обязано ДЛИТЬСЯ: один круг — это полторы минуты.
  assert.ok(
    guard.length > 5000,
    `сторожевой рейс всего ${guard.length.toFixed(0)} м — машина уйдёт садиться`,
  );
});

test("у злого круга HX-6 своя трасса, отличная от обзорной", () => {
  const hx6 = airVehicles.find((entry) => entry.id === "town-hexacopter");
  const berth = [30, 0.22, -14];
  assert.notEqual(
    hx6.flight.routePlan("evasive", berth).id,
    hx6.flight.routePlan("circuit", berth).id,
  );
});

test("ЛЮБОЙ план отвечает на ВСЕ требования трассы, а не на те, что вспомнили", () => {
  // Второй подряд отказ на запуске пришёл отсюда: сторожевая орбита не
  // объявила `corridor`, и общий контракт трассы выбросил исключение при
  // первом же обращении. Отсутствие требования — не «по умолчанию широко»,
  // а поломка, и ловить её обязан тест, а не человек в браузере.
  //
  // Детектор общий: каждый план каждой машины опрашивается по всей длине
  // всеми полями, которые у него есть.
  const berth = [0, 0.08, 0];
  const probes = Array.from({ length: 41 }, (_, index) => index / 40);
  for (const vehicle of airVehicles) {
    const kinds = new Set([
      vehicle.departure?.flightKind,
      vehicle.passengerFlight?.flightKind,
      ...(vehicle.departure?.target.actions ?? []).map((action) => action.id),
      ...(vehicle.passengerFlight?.target.actions ?? []).map((a) => a.id),
    ]);
    kinds.delete(undefined);
    kinds.delete("manual");
    const plans = [
      ...[...kinds].map((kind) => [
        `${vehicle.id}:${kind}`,
        vehicle.flight.routePlan(kind, berth),
      ]),
      [`${vehicle.id}:arrival`, vehicle.flight.arrivalPlan(berth)],
    ];
    for (const [label, plan] of plans) {
      for (const progress of probes) {
        for (const field of ["point", "speedLimit", "altitude", "corridor"]) {
          const answer = plan[field];
          if (typeof answer !== "function") {
            continue;
          }
          const value = answer(progress);
          const finite =
            typeof value === "number"
              ? Number.isFinite(value)
              : value.every((component) => Number.isFinite(component));
          assert.ok(
            finite,
            `${label}: требование ${field} на ${progress} дало ${JSON.stringify(value)}`,
          );
        }
      }
    }
  }
});

test("СНАРЯД РОЖДАЕТСЯ ВНЕ СОБСТВЕННОЙ МАШИНЫ, а не в устье трубы", () => {
  // Наблюдение Igor в игре: атакующий сбил сам себя. Устье пода лежит на
  // z = 1.62, корпус тянется до 3.44 — снаряд возникал ВНУТРИ габарита, в трёх
  // сантиметрах от пода, и на манёвре машина подрывала себя. У ручной
  // ракетницы вынос был с самого начала, у бортовой его забыли.
  const halfLength = combatHexacopterRangeBlueprint.envelope.length / 2;
  const fuse = explosiveProfile("podRocket").proximityFuse ?? 0;
  const pose = {
    centre: [0, 30, 0],
    massCentre: [0, 1.109, 0.207],
    velocity: [0, 0, 0],
    gunAxis: [0, 0, 1],
    rotate: (local) => local,
  };
  for (let index = 0; index < armament.rockets.mounts.length; index += 1) {
    const resolved = resolveVehicleWeaponShot(
      { weapon: "podRocket", mountIndex: index, deflection: 0, serial: index },
      armament,
      pose,
    );
    const distance = Math.hypot(
      resolved.origin[0] - pose.centre[0],
      resolved.origin[1] - pose.centre[1],
      resolved.origin[2] - pose.centre[2],
    );
    assert.ok(
      distance > halfLength + fuse,
      `труба ${index}: сход в ${distance.toFixed(2)} м при габарите ${halfLength.toFixed(2)} и взрывателе ${fuse}`,
    );
  }
});

test("пушке вынос не нужен: срез спарки и так впереди всего", () => {
  const pose = {
    centre: [0, 30, 0],
    massCentre: [0, 1.109, 0.207],
    velocity: [0, 0, 0],
    gunAxis: [0, 0, 1],
    rotate: (local) => local,
  };
  const resolved = resolveVehicleWeaponShot(
    { weapon: "cannon", mountIndex: 0, deflection: 0, serial: 0 },
    armament,
    pose,
  );
  // Луч обязан выходить ИМЕННО из среза, иначе трасса нарисуется не оттуда.
  const muzzle = armament.cannon.mounts[0].muzzle;
  const expected = muzzle[2] - pose.massCentre[2] + pose.centre[2];
  assert.ok(Math.abs(resolved.origin[2] - expected) < 1e-6);
});
