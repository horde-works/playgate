import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  COMBAT_HEXACOPTER_FIGURE_FLOOR,
  combatHexacopterRangeFigures,
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
    });
    if (progress >= to) break;
  }
  return { events, track, progress, machine: m };
}

test("трасса ОБЪЯВЛЯЕТ обе фигуры и обе — на своих местах", () => {
  assert.equal(plan.figures?.length, 2);
  assert.deepEqual(
    plan.figures.map((station) => station.kind),
    ["loop", "immelmann"],
  );
  // Петля закрывается в точке входа, иммельман заменяет дальний разворот.
  assert.equal(combatHexacopterRangeFigures[0].resumeAt, combatHexacopterRangeFigures[0].at);
  assert.ok(
    combatHexacopterRangeFigures[1].resumeAt >
      combatHexacopterRangeFigures[1].at + 0.05,
    "иммельман обязан заменять кусок трассы, а не стоять на месте",
  );
});

test("этаж под фигуру ВЫВЕДЕН из физики машины, а не назначен", () => {
  const needed = combatHexacopterRangeFigures.map((station) => {
    const figure = planFlightFigure(
      station.kind,
      station.speed,
      capability,
      [0, 1],
    );
    return {
      station,
      floor: figure.dip + invertedRecoveryHeight(capability),
      ceiling: figure.ceiling,
    };
  });
  for (const entry of needed) {
    assert.ok(
      COMBAT_HEXACOPTER_FIGURE_FLOOR >= entry.floor,
      `${entry.station.key} просит ${entry.floor.toFixed(1)} м снизу при объявленных ${COMBAT_HEXACOPTER_FIGURE_FLOOR}`,
    );
    // И трасса действительно поднимается к этой доле, а не только объявляет.
    const at = plan.altitude(entry.station.at) - BERTH[1];
    assert.ok(
      at >= entry.floor,
      `на доле ${entry.station.at.toFixed(3)} трасса даёт ${at.toFixed(1)} м при потребных ${entry.floor.toFixed(1)}`,
    );
    // И неба сверху хватает: полигон видит небо на 150 м.
    assert.ok(150 - (BERTH[1] + at) > entry.ceiling);
  }
  // Ход у фигуры свой, и трасса его снимает: на разрешённых участку тридцати
  // радиус вырос бы вчетверо.
  assert.ok(
    plan.speedLimit(combatHexacopterRangeFigures[0].at) <= 16,
    `подход к петле разрешает ${plan.speedLimit(combatHexacopterRangeFigures[0].at)} м/с`,
  );
});

const run = flyCircuit({ from: 0.05, to: 0.45, seconds: 140 });
if (process.env.FIGURE_TRACE) {
  console.log(JSON.stringify(run.events));
  for (const s of run.track.filter((_, i) => i % 30 === 0)) {
    console.log(
      `p${s.progress.toFixed(3)} ${String(s.figure).padEnd(16)} y${s.height.toFixed(0).padStart(4)} off${s.off.toFixed(0).padStart(4)} v${s.speed.toFixed(0).padStart(3)} up${s.up.toFixed(2)}`,
    );
  }
}

test("RAX ВХОДИТ в обе фигуры с маршрута и НЕ пропускает ни одной", () => {
  const skipped = run.events.filter((event) => event.skipped);
  assert.deepEqual(skipped, [], `пропущены: ${JSON.stringify(skipped)}`);
  const started = run.events.filter((event) => event.start).map((e) => e.start);
  assert.deepEqual(started, ["range-loop", "range-immelmann"]);
});

test("обе фигуры ЗАКАНЧИВАЮТСЯ, а не снимаются по времени", () => {
  const ended = run.events.filter((event) => event.end);
  assert.equal(ended.length, 2, JSON.stringify(run.events));
  for (const event of ended) {
    assert.equal(event.aborted, false, `${event.end} снята по времени`);
  }
});

test("машина ДЕЙСТВИТЕЛЬНО переворачивается на маршруте, а не изображает", () => {
  for (const key of ["range-loop", "range-immelmann"]) {
    const inside = run.track.filter((sample) => sample.figure === key);
    assert.ok(inside.length > 60, `${key}: всего ${inside.length} кадров`);
    const lowest = inside.reduce((worst, s) => Math.min(worst, s.up), 1);
    assert.ok(lowest < -0.9, `${key}: самая перевёрнутая поза ${lowest.toFixed(2)}`);
  }
});

test("ПРОГРЕСС ТРАССЫ ЗАМИРАЕТ на фигуре — в этом весь ответ ловушке", () => {
  for (const key of ["range-loop", "range-immelmann"]) {
    const inside = run.track.filter((sample) => sample.figure === key);
    const first = inside[0].progress;
    const drift = inside.reduce(
      (worst, s) => Math.max(worst, Math.abs(s.progress - first)),
      0,
    );
    assert.ok(drift < 1e-9, `${key}: прогресс уехал на ${drift}`);
  }
});

test("ПЕТЛЯ не сбивает машину с трассы: вошла и вышла на месте", () => {
  const inside = run.track.filter((sample) => sample.figure === "range-loop");
  const worst = inside.reduce((best, s) => Math.max(best, s.off), 0);
  // Петля возвращает машину в точку входа, поэтому уход с трассы у неё
  // невелик и весь укладывается в коридор участка.
  assert.ok(worst < 20, `петля увела на ${worst.toFixed(1)} м`);
  const after = run.track.filter(
    (sample) => sample.progress > 0.095 && sample.progress < 0.12,
  );
  const settled = after.reduce((best, s) => Math.max(best, s.off), 0);
  assert.ok(settled < 8, `после петли машина в ${settled.toFixed(1)} м от трассы`);
});

test("ИММЕЛЬМАН уводит с трассы — и машина ВОЗВРАЩАЕТСЯ, а не теряется", () => {
  // Он ЗАМЕНЯЕТ дальний разворот: трасса разворачивается дугой в сотню метров,
  // машина — на месте. Поэтому в момент возврата она заведомо не там, где
  // трасса, и это не ошибка, а цена фигуры. Важно, чтобы цена была КОНЕЧНОЙ.
  const rejoin = run.track.filter((sample) => sample.progress > 0.22);
  const worst = rejoin.reduce((best, s) => Math.max(best, s.off), 0);
  assert.ok(worst < 60, `отход после иммельмана ${worst.toFixed(1)} м`);
  const closed = rejoin.find((sample) => sample.off < 5);
  assert.ok(closed, "машина обязана вернуться на трассу, а не идти рядом");
  assert.ok(
    closed.progress < 0.36,
    `возврат занял до доли ${closed.progress.toFixed(3)}`,
  );
});

test("после фигур круг продолжается обычным ровным полётом", () => {
  assert.ok(run.progress >= 0.44, `круг встал на доле ${run.progress.toFixed(3)}`);
  const tail = run.track.slice(-240);
  assert.ok(
    tail.every((sample) => sample.figure === null),
    "хвост прогона обязан быть обычным маршрутным полётом",
  );
  assert.ok(
    tail.every((sample) => sample.up > 0.5),
    "и обязан быть ровным полётом, а не полётом вверх ногами",
  );
});

test("машина не задевает землю: провал фигуры остаётся над полигоном", () => {
  const lowest = run.track.reduce((worst, s) => Math.min(worst, s.height), 1e9);
  assert.ok(lowest > 3, `опустилась до ${lowest.toFixed(1)} м`);
});

test("паспорт RAX объявляет обе фигуры выполнимыми на своей же скорости", () => {
  // Резерв тяги — то самое, что делает фигуру возможной. Если он изменится,
  // радиус и провал изменятся вместе с ним, и этот тест обязан это заметить.
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
    flyover.figures?.length === 2,
    "маршрут облёта обязан нести обе фигуры — иначе врезка молча не сработает",
  );
  // Сторожевая орбита фигур не крутит: там машина работает, а не показывает,
  // и переворачиваться посреди боевого дежурства ей незачем.
  const guard = rax8.flight.routePlan(COMBAT_HEXACOPTER_SKY_CONTROL, BERTH);
  assert.equal(guard.figures, undefined);
  // Возвращается машина ТЕМ ЖЕ показательным кругом — значит, и фигуры те же.
  // Это не оплошность: круг один, и разводить его надвое ради формальности
  // означало бы завести вторую правду о маршруте.
  const arrival = rax8.flight.arrivalPlan(BERTH);
  assert.equal(arrival.figures?.length, 2);
});

test("обёртка ограничения скорости НЕ ТЕРЯЕТ фигуры по дороге", () => {
  // Рантайм оборачивает маршрут ограничителем хода перед тем, как отдать его
  // автопилоту. Обёртка, собранная перечислением полей, унесла бы фигуры молча.
  const flyover = combatHexacopterRangePlan(BERTH);
  const limited = { ...flyover, speedLimit: (p) => flyover.speedLimit(p) * 0.5 };
  assert.equal(limited.figures?.length, 2);
});
