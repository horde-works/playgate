import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  combatHexacopterRangePlan,
} from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import {
  airVehicles,
  COMBAT_HEXACOPTER_SKY_CONTROL,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceRouteFigures,
  figureCapabilityOf,
  IDLE_ROUTE_FIGURE,
  invertedRecoveryHeight,
  planFlightFigure,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  centreOf,
  createMachine,
  dt,
  forwardAxis,
  stepMachine,
} from "./rotorcraft-rig.mjs";

/**
 * ФИГУРЫ НА МАРШРУТЕ ОБЛЁТА — НА НАСТОЯЩЕМ АВТОПИЛОТЕ.
 *
 * Отдельно фигура уже проверена: машина по ней летит. Здесь другое и более
 * важное — что она в неё ВХОДИТ с маршрута и на маршрут ВОЗВРАЩАЕТСЯ. Между
 * этими двумя вещами стоит всё остальное: ворота, потолок участка, замирание
 * прогресса, точка возврата и общий автопилот, который после фигуры получает
 * машину не там, где оставил.
 */

const BERTH = [0, 0.08, 0];
const rax = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const pieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
  new Map(),
).clusters[0].pieces;
const plan = combatHexacopterRangePlan(BERTH);

function build(startProgress) {
  const point = plan.point(startProgress);
  const ahead = plan.point(Math.min(1, startProgress + 0.004));
  const tangent = [ahead[0] - point[0], 0, ahead[2] - point[2]];
  const length = Math.hypot(tangent[0], tangent[2]) || 1;
  const heading = [tangent[0] / length, 0, tangent[2] / length];
  const cruise = plan.speedLimit(startProgress);
  return createMachine({
    pieces,
    vehicle: rax,
    startPoint: point,
    startVelocity: [heading[0] * cruise, 0, heading[2] * cruise],
    startNose: heading,
  });
}

const capability = figureCapabilityOf(build(0.05).machine);

/** Круг с фигурами: настоящий автопилот, настоящие силы, замирающий прогресс. */
function flyCircuit({ from, to, seconds }) {
  const m = build(from);
  let progress = from;
  let frozen = from;
  let figures = IDLE_ROUTE_FIGURE;
  const events = [];
  let lastGuidance = null;
  const track = [];
  for (let step = 0; step < seconds * 60; step += 1) {
    const centre = centreOf(m);
    const nose = forwardAxis(m);
    const flat = Math.hypot(nose[0], nose[2]) || 1;
    const speed = Math.hypot(...m.state.velocity);
    // ПОРЯДОК ТОТ ЖЕ, ЧТО В РАНТАЙМЕ: трасса двигается сама, и только потом
    // фигура откатывает её назад. Иначе тест проверял бы не ту очерёдность,
    // в которой всё это работает у машины.
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      centre,
      Math.hypot(m.state.velocity[0], m.state.velocity[2]) * dt,
    );
    const figureFrom = figures.episode ? frozen : progress;
    const figured = advanceRouteFigures({
      state: figures,
      stations: plan.figures,
      previousProgress: frozen,
      progress: figureFrom,
      attitude: m.state.orientation,
      heading: [nose[0] / flat, nose[2] / flat],
      bodyNose: m.vehicle.nose,
      speed,
      verticalSpeed: m.state.velocity[1],
      capability,
      gate: {
        heightAboveGround: centre[1] - BERTH[1],
        authority: Math.min(...m.feedback),
      },
      altitude: centre[1],
      deltaSeconds: dt,
    });
    if (figured.state.station && !figures.station) {
      events.push({ start: figured.state.station.key, at: frozen, speed });
    }
    if (!figured.state.station && figures.station) {
      events.push({
        end: figures.station.key,
        seconds: figures.episode.seconds,
        aborted: figures.episode.aborted,
      });
    }
    if (figured.state.skipped && figured.state.skipped !== figures.skipped) {
      events.push({ skipped: figured.state.skipped });
    }
    figures = figured.state;
    frozen = figured.progress;
    progress = figured.progress;

    if (figured.command) {
      stepMachine(m, {
        forwardSpeed: figured.command.speed,
        lateralSpeed: 0,
        yawRate: 0,
        liftFraction: figured.command.liftFraction,
        attitude: figured.command.attitude,
        attitudeRate: figured.command.angularVelocity,
      });
    } else {
      const piloted = autopilot(
        plan,
        progress,
        centre,
        m.state.orientation,
        m.state.velocity,
        m.state.angularVelocity,
        m.yawRateLimits
          ? {
              ...m.model,
              engineAvailability: m.feedback,
              yawRateLimits: m.yawRateLimits,
            }
          : { ...m.model, engineAvailability: m.feedback },
        1,
        m.vehicle.nose,
        m.flight.approach,
      );
      stepMachine(m, piloted.guidance);
      lastGuidance = piloted.guidance;
    }

    const live = centreOf(m);
    const onRoute = plan.point(progress);
    track.push({
      progress,
      figure: figures.station?.key ?? null,
      up: rotateVector(m.state.orientation, [0, 1, 0])[1],
      height: live[1],
      off: Math.hypot(live[0] - onRoute[0], live[2] - onRoute[2]),
      speed: Math.hypot(...m.state.velocity),
      want: plan.point(progress)[1],
      lift: lastGuidance?.liftFraction ?? 0,
      vy: m.state.velocity[1],
    });
    if (progress >= to) break;
  }
  return { events, track, progress, machine: m };
}

test("программа объявляет ЧЕТЫРЕ фигуры, и все они разные", () => {
  assert.equal(plan.figures?.length, 4);
  assert.deepEqual(
    plan.figures.map((station) => station.kind),
    ["immelmann", "loop", "loop", "immelmann"],
  );
  // Петли РАЗНОГО размера, и мерить это надо РАДИУСОМ, а не ходом: радиус
  // растёт как квадрат, поэтому разница в ходе на треть даёт разницу в размере
  // вдвое. Две одинаковые петли были бы одной, показанной дважды.
  const loops = plan.figures.filter((station) => station.kind === "loop");
  const radii = loops.map(
    (station) => planFlightFigure("loop", station.speed, capability, [0, 1]).radius,
  );
  assert.ok(
    Math.max(...radii) > Math.min(...radii) * 1.5,
    `петли одного размера: ${radii.map((r) => r.toFixed(0)).join(" и ")} м`,
  );
  // Петля закрывается в точке входа; иммельман заменяет разворот трассы.
  for (const station of loops) {
    assert.equal(station.resumeAt, station.at, station.key);
  }
  for (const station of plan.figures.filter((s) => s.kind === "immelmann")) {
    assert.ok(
      station.resumeAt > station.at,
      `${station.key} обязан заменять кусок трассы`,
    );
  }
});

test("этаж под каждую фигуру ВЫВЕДЕН из физики машины, а не назначен", () => {
  for (const station of plan.figures) {
    const figure = planFlightFigure(station.kind, station.speed, capability, [0, 1]);
    const needed = figure.dip + invertedRecoveryHeight(capability);
    assert.ok(
      station.floor >= needed,
      `${station.key} просит ${needed.toFixed(1)} м снизу при объявленных ${station.floor}`,
    );
    // И трасса действительно поднимается к этой доле, а не только объявляет.
    const at = plan.altitude(station.at) - BERTH[1];
    assert.ok(
      at >= needed,
      `на доле ${station.at.toFixed(3)} трасса даёт ${at.toFixed(1)} при потребных ${needed.toFixed(1)}`,
    );
    // Небо сверху: полигон видит его на 150 м.
    assert.ok(station.sky - (BERTH[1] + at) > figure.ceiling, station.key);
    // Ход у фигуры свой, и трасса его снимает.
    assert.ok(
      plan.speedLimit(station.at) <= station.speed,
      `${station.key}: подход разрешает ${plan.speedLimit(station.at)} м/с`,
    );
  }
});

const run = flyCircuit({ from: 0.004, to: 0.999, seconds: 300 });
const started = run.events.filter((event) => event.start).map((e) => e.start);
const ended = run.events.filter((event) => event.end);

test("RAX проходит ВСЮ программу и не пропускает ни одной фигуры", () => {
  assert.deepEqual(run.events.filter((e) => e.skipped), []);
  assert.deepEqual(started, plan.figures.map((station) => station.key));
  assert.equal(ended.length, 4, JSON.stringify(run.events));
  for (const event of ended) {
    assert.equal(event.aborted, false, `${event.end} снята по времени`);
  }
});

if (process.env.FIGURE_TRACE) {
  const toBerth = run.track.findIndex((x) => x.progress > 0.985);
  console.log(`ПРОДОЛЖИТЕЛЬНОСТЬ до створа: ${(toBerth / 60).toFixed(0)} с; прогон ${(run.track.length / 60).toFixed(0)} с, доля ${run.progress.toFixed(3)}`);
  for (const s of plan.figures) {
    const inside = run.track.filter((x) => x.figure === s.key);
    const low = inside.reduce((w, x) => Math.min(w, x.up), 1);
    const peak = inside.reduce((b, x) => Math.max(b, x.height), 0);
    const floor = inside.reduce((b, x) => Math.min(b, x.height), 1e9);
    console.log(
      `${s.key.padEnd(17)} ${(inside.length / 60).toFixed(1)} с  высота ${floor.toFixed(0)}..${peak.toFixed(0)} м  ось вверх до ${low.toFixed(2)}`,
    );
  }
}

test("программа занимает НЕ МЕНЬШЕ трёх минут — ради этого она и переписана", () => {
  const seconds = run.track.findIndex((x) => x.progress > 0.985) / 60;
  assert.ok(seconds >= 180, `круг занял ${seconds.toFixed(0)} с`);
  assert.ok(run.progress >= 0.99, `круг встал на доле ${run.progress.toFixed(3)}`);
});

test("машина ДЕЙСТВИТЕЛЬНО переворачивается на каждой фигуре, а не изображает", () => {
  for (const station of plan.figures) {
    const inside = run.track.filter((sample) => sample.figure === station.key);
    assert.ok(inside.length > 60, `${station.key}: всего ${inside.length} кадров`);
    const lowest = inside.reduce((worst, s) => Math.min(worst, s.up), 1);
    assert.ok(lowest < -0.9, `${station.key}: самая перевёрнутая поза ${lowest.toFixed(2)}`);
  }
});

test("ПРОГРЕСС ТРАССЫ ЗАМИРАЕТ на фигуре — в этом весь ответ ловушке", () => {
  for (const station of plan.figures) {
    const inside = run.track.filter((sample) => sample.figure === station.key);
    const first = inside[0].progress;
    const drift = inside.reduce(
      (worst, s) => Math.max(worst, Math.abs(s.progress - first)),
      0,
    );
    assert.ok(drift < 1e-9, `${station.key}: прогресс уехал на ${drift}`);
  }
});

test("после каждой фигуры машина ВОЗВРАЩАЕТСЯ на трассу, а не теряется", () => {
  for (const station of plan.figures) {
    const after = run.track.filter(
      (sample) =>
        sample.figure === null &&
        sample.progress > station.resumeAt &&
        sample.progress < station.resumeAt + 0.06,
    );
    if (after.length === 0) continue;
    const closed = after.find((sample) => sample.off < 8);
    assert.ok(closed, `${station.key}: машина так и не вернулась на трассу`);
  }
});

test("машина не задевает землю: провал фигуры остаётся над полигоном", () => {
  const lowest = run.track.reduce((worst, s) => Math.min(worst, s.height), 1e9);
  assert.ok(lowest > 3, `опустилась до ${lowest.toFixed(1)} м`);
});

test("паспорт RAX объявляет фигуры выполнимыми на своей же скорости", () => {
  assert.ok(combatHexacopterRangeBlueprint.flight.liftReserve > 3.5);
  assert.ok(capability.uprightCentripetal > 2 * 9.81);
});

// ---------------------------------------------------------------------------
// ДЕТЕКТОРЫ ВРЕЗКИ
//
// Всё выше проверяет физику и наведение. Ниже — то, на чём боевая задача уже
// дважды спотыкалась: логика верна, а до машины не доходит. Оба раза причина
// была в React-части, которая тестами не покрыта, поэтому проверяется не она,
// а ГРАНИЦА — то, что рантайм из неё берёт.
// ---------------------------------------------------------------------------

test("фигуры доходят до машины ИМЕННО ТЕМ маршрутом, который она полетит", () => {
  const rax8 = airVehicles.find((entry) => entry.id === "combat-hexacopter");
  const flyover = rax8.flight.routePlan("flyover", BERTH);
  assert.ok(
    flyover.figures?.length === 4,
    "маршрут облёта обязан нести все четыре фигуры — иначе врезка молча не сработает",
  );
  // Сторожевая орбита фигур не крутит: там машина работает, а не показывает,
  // и переворачиваться посреди боевого дежурства ей незачем.
  const guard = rax8.flight.routePlan(COMBAT_HEXACOPTER_SKY_CONTROL, BERTH);
  assert.equal(guard.figures, undefined);
  // Возвращается машина ТЕМ ЖЕ показательным кругом — значит, и фигуры те же.
  // Это не оплошность: круг один, и разводить его надвое ради формальности
  // означало бы завести вторую правду о маршруте.
  const arrival = rax8.flight.arrivalPlan(BERTH);
  assert.equal(arrival.figures?.length, 4);
});

test("обёртка ограничения скорости НЕ ТЕРЯЕТ фигуры по дороге", () => {
  // Рантайм оборачивает маршрут ограничителем хода перед тем, как отдать его
  // автопилоту. Обёртка, собранная перечислением полей, унесла бы фигуры молча.
  const flyover = combatHexacopterRangePlan(BERTH);
  const limited = { ...flyover, speedLimit: (p) => flyover.speedLimit(p) * 0.5 };
  assert.equal(limited.figures?.length, 4);
});
