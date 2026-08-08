import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  combatHexacopterRangeCircuit,
  combatHexacopterRangePlan,
} from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";
import {
  airVehicles,
  COMBAT_HEXACOPTER_SKY_CONTROL,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceRouteFigureFrame,
  figureCapabilityOf,
  IDLE_ROUTE_FIGURE,
  invertedRecoveryHeight,
  planFlightFigure,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  vehicleRouteAltitudeTarget,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceVehicleFailureWatchdog,
  createVehicleFailureWatchdog,
  vehicleFailureEnvelopeFor,
} from "../games/make-a-mess/src/game/vehicleFailure.ts";
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

/**
 * МАШИНА СТАВИТСЯ НА ПЛОЩАДКУ, А НЕ ЗАПУСКАЕТСЯ С СЕРЕДИНЫ ТРАССЫ.
 *
 * Стенд стартовал в воздухе, на маршрутной скорости и носом по касательной, и
 * этим пропускал ровно тот кусок рейса, на котором живой полёт и разошёлся:
 * вертикальный уход, разворот носа на площадку и вход в первый номер. Взлёт и
 * посадка — часть программы, и проверяться обязаны вместе с ней.
 */
function build() {
  return createMachine({
    pieces,
    vehicle: rax,
    startPoint: plan.point(0),
    startVelocity: [0, 0, 0],
    startNose: null,
  });
}

const capability = figureCapabilityOf(build().machine);

/**
 * ЗАПАС ДО ЗЕМЛИ МЕРИТСЯ МЕЖДУ СТОЛБАМИ, А НЕ ВЕСЬ ПРОГОН.
 *
 * Взлётный и посадочный столбы — это и есть места, где машина у земли: профиль
 * трассы там сам гасится к площадке, а центр стоящей на ней машины лежит около
 * метра над бертом. Считать это касанием значило бы объявить посадку аварией.
 * Всё, что между ними, — полёт, и там метр до земли действительно авария.
 */
function clearanceOf(flight) {
  const from = combatHexacopterRangeCircuit.nodeProgress("departure-complete");
  const to = combatHexacopterRangeCircuit.nodeProgress("arrival-shoulder");
  return flight.track
    .filter((s) => s.progress > from && s.progress < to)
    .reduce((worst, s) => Math.min(worst, s.height), 1e9);
}

/** Круг с фигурами: настоящий автопилот, настоящие силы, замирающий прогресс. */
function flyCircuit({ seconds, stations = plan.figures }) {
  const m = build();
  let progress = 0;
  // Замороженная доля живёт МЕЖДУ КАДРАМИ всегда, а не только на фигуре: из
  // неё и текущей доли получается интервал, на котором станция «наступает».
  let frozen = null;
  let figures = IDLE_ROUTE_FIGURE;
  const events = [];
  let lastGuidance = null;
  const track = [];
  // СТОРОЖ ОТКАЗОВ — ТОТ ЖЕ, ЧТО СНИМАЕТ МАШИНУ С РЕЙСА В ИГРЕ. Без него стенд
  // доказывал «долетела», а живой полёт кончался снятием: маршрут выводил
  // машину за конверт позы и высоты, и увидеть это было нечем.
  const envelope = vehicleFailureEnvelopeFor(m.flight);
  let watchdog = createVehicleFailureWatchdog(0);
  let failure = null;
  let failedAt = null;
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
    // ТОТ ЖЕ КАДР ФИГУРЫ, ЧТО У РАНТАЙМА, И ТОЙ ЖЕ ФУНКЦИЕЙ. Стенд, считающий
    // это своим кодом, доказывает полёт своего кода: паспорт фигуры здесь
    // собирался с затуханием вращения, а в компоненте — без, и в игре не
    // полетела ни одна фигура при шести зелёных на стенде.
    const figured = advanceRouteFigureFrame({
      state: figures,
      frozenProgress: frozen,
      stations,
      berthAltitude: plan.point(1)[1],
      progress,
      attitude: m.state.orientation,
      centre,
      velocity: m.state.velocity,
      bodyNose: m.vehicle.nose,
      machine: m.machine,
      authority: Math.min(...m.feedback),
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
    frozen = figured.frozenProgress;
    progress = figured.progress;

    if (figured.guidance) {
      stepMachine(m, figured.guidance);
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
        Math.min(1, step / 120),
        m.vehicle.nose,
        m.flight.approach,
      );
      stepMachine(m, piloted.guidance);
      lastGuidance = piloted.guidance;
    }

    const live = centreOf(m);
    const onRoute = plan.point(progress);
    const liveNose = forwardAxis(m);
    const liveFlat = Math.hypot(liveNose[0], liveNose[2]) || 1;
    track.push({
      progress,
      figure: figures.station?.key ?? null,
      nose: [liveNose[0] / liveFlat, liveNose[2] / liveFlat],
      at: [live[0], live[2]],
      up: rotateVector(m.state.orientation, [0, 1, 0])[1],
      height: live[1],
      off: Math.hypot(live[0] - onRoute[0], live[2] - onRoute[2]),
      speed: Math.hypot(...m.state.velocity),
      want: plan.point(progress)[1],
      lift: lastGuidance?.liftFraction ?? 0,
      vy: m.state.velocity[1],
    });
    // Конверт проверяется на СЫРЫХ отклонениях. Рантайм судит по остатку,
    // который наведение уже не вытянет, и он всегда меньше сырого: стенд,
    // проходящий по сырому, проходит и по нему.
    const bodyNose = rotateVector(m.state.orientation, m.vehicle.nose);
    const bodyUp = rotateVector(m.state.orientation, [0, 1, 0]);
    const onLine = plan.point(progress);
    const advanced = advanceVehicleFailureWatchdog(
      watchdog,
      {
        deltaSeconds: dt,
        relativeAltitude: live[1] - BERTH[1],
        pitch: Math.asin(Math.max(-1, Math.min(1, bodyNose[1]))),
        roll: Math.asin(
          Math.max(
            -1,
            Math.min(1, -(bodyNose[2] * bodyUp[0] - bodyNose[0] * bodyUp[2])),
          ),
        ),
        headingError: 0,
        // Нос машины с векторной тягой курса не задаёт — тело держит линию само.
        courseFollowsNose: false,
        yawRateError: 0,
        crossTrackError: Math.hypot(live[0] - onLine[0], live[2] - onLine[2]),
        corridorLimit: plan.corridor?.(progress),
        // ВЫСОТА МЕРИТСЯ ПРОТИВ ТОЙ ЖЕ ЦЕЛИ, ПО КОТОРОЙ ЛЕТИТ АВТОПИЛОТ, а не
        // против точки линии. На взлётном и посадочном столбах цель — сам
        // столб: профиль трассы у площадки гасится к нулю, потому что там
        // машина стоит, и судить по нему поднявшуюся на двадцать метров машину
        // значит объявлять расхождением исполнение собственного требования.
        altitudeError: live[1] - vehicleRouteAltitudeTarget(plan, progress, live),
        progress,
        requiredControlAvailable: true,
        requestedControlEffort: 0,
        deliveredControlFraction: 1,
        requestedLiftEffort: 0,
        deliveredLiftFraction: 1,
        goArounds: 0,
        corrections: 0,
        trimAuthorityExhausted: false,
        turning: Math.abs(m.state.angularVelocity[1]) > 0.1,
        inFinalManeuver: false,
        dockingDistance: Math.hypot(live[0] - BERTH[0], live[2] - BERTH[2]),
        inDockingCapture: false,
        dockingComplete: false,
        recoveringDisturbance: false,
      },
      envelope,
    );
    watchdog = advanced.state;
    if (advanced.failure && !failure) {
      failure = advanced.failure;
      failedAt = { progress, seconds: step / 60, figure: figures.station?.key ?? null };
    }
    if (progress >= 0.9995 && Math.hypot(...m.state.velocity) < 0.6) break;
  }
  return { events, track, progress, machine: m, failure, failedAt };
}

test("программа объявляет ШЕСТЬ фигур, и ни одна не повторяет другую", () => {
  assert.equal(plan.figures?.length, 6);
  assert.deepEqual(
    plan.figures.map((station) => station.key),
    [
      "loop-quarter",
      "loop-small",
      "loop-big",
      "loop-slant",
      "split-s",
      "immelmann-final",
    ],
  );
  // РАЗНООБРАЗИЕ ПРОВЕРЯЕТСЯ, А НЕ ОБЪЯВЛЯЕТСЯ. Четыре из шести — петли, и
  // сказать «они разные» мало: разными их делают доля оборота, размер и наклон
  // плоскости. Каждый признак обязан быть у кого-то один.
  const loops = plan.figures.filter((station) => station.kind === "loop");
  assert.equal(loops.length, 4);
  assert.equal(
    loops.filter((station) => (station.sweep ?? Math.PI * 2) < Math.PI * 2).length,
    1,
    "неполная петля обязана быть ровно одна",
  );
  assert.equal(
    loops.filter((station) => (station.bank ?? 0) > 1e-6).length,
    1,
    "наклонённая петля обязана быть ровно одна",
  );
  assert.equal(
    plan.figures.filter((station) => station.kind === "split-s").length,
    1,
    "снижающаяся фигура обязана быть ровно одна",
  );
  // Петли РАЗНОГО размера, и мерить это надо РАДИУСОМ, а не ходом: радиус
  // растёт как квадрат, поэтому разница в ходе на треть даёт разницу в размере
  // вдвое. Две одинаковые петли были бы одной, показанной дважды.
  const radii = loops.map(
    (station) => planFlightFigure("loop", station.speed, capability, [0, 1]).radius,
  );
  assert.ok(
    Math.max(...radii) > Math.min(...radii) * 1.5,
    `петли одного размера: ${radii.map((r) => r.toFixed(0)).join(" и ")} м`,
  );
  // ПЕТЛЯ ЛЕЖИТ В ОДНОЙ ВЕРТИКАЛЬНОЙ ПЛОСКОСТИ и курса не разворачивает — даже
  // неполная: она оставляет машину носом вниз и в стороне, но идущей туда же.
  // Трасса продолжается из точки входа. Иммельман и петля вниз курс
  // ПЕРЕКЛАДЫВАЮТ, и они обязаны заменять кусок трассы: иначе после фигуры
  // машина летит навстречу собственному маршруту.
  for (const station of plan.figures) {
    if (station.kind === "loop") {
      assert.equal(station.resumeAt, station.at, station.key);
      continue;
    }
    assert.ok(
      station.resumeAt > station.at,
      `${station.key} разворачивает курс и обязан заменять кусок трассы`,
    );
    // И заменяемый кусок — полукруг, который машина полетит при отказе ворот.
    const turn = planFlightFigure(station.kind, station.speed, capability, [0, 1]);
    assert.ok(Math.abs(turn.exit.headingTurn) > Math.PI * 0.8, station.key);
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

const run = flyCircuit({ seconds: 300 });
const started = run.events.filter((event) => event.start).map((e) => e.start);
const ended = run.events.filter((event) => event.end);

test("RAX проходит ВСЮ программу и не пропускает ни одной фигуры", () => {
  assert.deepEqual(run.events.filter((e) => e.skipped), []);
  assert.deepEqual(started, plan.figures.map((station) => station.key));
  assert.equal(ended.length, 6, JSON.stringify(run.events));
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

/**
 * СТОРОЖ ОТКАЗОВ — ГЛАВНЫЙ СУДЬЯ ЭТОГО СТЕНДА.
 *
 * «Долетела» и «не снята с рейса» — разные утверждения, и разошлись они в живом
 * полёте: программа проходилась целиком, а машину снимало расхождением по
 * высоте на входе в первый разворот. Причина была в требовании — профиль просил
 * набирать четыре метра в секунду ровно там, где машина завалена в крен и
 * вертикальной тяги у неё осталась половина, — но увидеть это стенд не мог,
 * потому что сторожа в нём не было вовсе.
 */
test("рейс НЕ СНИМАЕТСЯ сторожем отказов — от площадки до площадки", () => {
  assert.equal(
    run.failure,
    null,
    `снята: ${run.failure} на ${run.failedAt?.seconds?.toFixed(0)} с, доля ${run.failedAt?.progress?.toFixed(3)}, номер ${run.failedAt?.figure ?? "нет"}`,
  );
});

test("машина ВЗЛЕТАЕТ с площадки и САДИТСЯ на неё, а не стартует в воздухе", () => {
  const first = run.track[0];
  assert.ok(first.height < 2, `старт на высоте ${first.height.toFixed(1)} м`);
  const last = run.track.at(-1);
  assert.ok(
    Math.hypot(last.at[0] - BERTH[0], last.at[1] - BERTH[2]) < 4,
    `села в ${Math.hypot(last.at[0] - BERTH[0], last.at[1] - BERTH[2]).toFixed(1)} м от площадки`,
  );
  assert.ok(last.height < 3, `зависла на ${last.height.toFixed(1)} м`);
});

test("программа доходит до створа", () => {
  // ДЛИНА ПРОГРАММЫ ТРЕБОВАНИЕМ БОЛЬШЕ НЕ ЯВЛЯЕТСЯ. Здесь стояла планка в три
  // минуты, и она была снята Igor: три минуты набираются длинными облётами, а
  // облёты — ровно то, что делает показ скучным. Мера — плотность событий, и её
  // проверяют номера ниже, а не секундомер.
  assert.ok(run.progress >= 0.99, `круг встал на доле ${run.progress.toFixed(3)}`);
});

/**
 * ПРОДОЛЬНЫЙ ВИРАЖ — ЭТО РАЗГОН И ТОРМОЖЕНИЕ, А НЕ ДЛИННАЯ ДУГА.
 *
 * Прямая нужна не сама по себе: без неё нечем показать поворот. Первая редакция
 * галса дала на выходе радиусы сто тридцать и сто шестьдесят метров — при них
 * вираж разрешает больше сорока метров в секунду, то есть не ограничивает
 * ничего, и «резкий поворот» превращался в незаметное подруливание. Проверяется
 * именно это: на прямой машина идёт заметно быстрее, чем в повороте за ней.
 */
for (const galley of [
  { entry: "sprint-south-entry", exit: "sprint-south-exit", corner: "loop-quarter" },
  { entry: "sprint-north-entry", exit: "sprint-north-exit", corner: "loop-big" },
]) {
  test(`${galley.entry}: прямая на пределе, поворот с торможением`, () => {
    const at = (id) => combatHexacopterRangeCircuit.nodeProgress(id);
    const straight = run.track.filter(
      (s) => s.progress > at(galley.entry) && s.progress < at(galley.exit),
    );
    const corner = run.track.filter(
      (s) => s.progress > at(galley.exit) && s.progress < at(galley.corner),
    );
    assert.ok(straight.length > 30 && corner.length > 20, "участок не пройден");
    const fastest = straight.reduce((best, s) => Math.max(best, s.speed), 0);
    const braked = corner.reduce((worst, s) => Math.min(worst, s.speed), 1e9);
    assert.ok(
      fastest > 24,
      `${galley.entry}: на прямой всего ${fastest.toFixed(1)} м/с — галс не разгоняет`,
    );
    assert.ok(
      braked < fastest - 5,
      `${galley.exit}: поворот прошли на ${braked.toFixed(1)} против ${fastest.toFixed(1)} — он не резкий`,
    );
  });
}

/**
 * НОС НА ПЛОЩАДКЕ — ЕДИНСТВЕННОЕ, ЧЕГО САМОЛЁТ НЕ МОЖЕТ, и потому проверяется
 * отдельно. Требование объявлено маршрутом; здесь важно, что оно ДОХОДИТ до
 * машины и что машина его исполняет, идя при этом не туда, куда смотрит.
 */
test("на трёх номерах машина смотрит на площадку, а летит мимо", () => {
  const at = (id) => combatHexacopterRangeCircuit.nodeProgress(id);
  for (const act of [
    { from: 0.02, to: at("backaway"), key: "уход спиной" },
    { from: at("rest-in"), to: at("rest-out"), key: "точка покоя" },
    { from: at("dash"), to: at("dash-end"), key: "бросок" },
  ]) {
    const inside = run.track.filter(
      (s) => s.figure === null && s.progress > act.from && s.progress < act.to,
    );
    assert.ok(inside.length > 20, `${act.key}: всего ${inside.length} кадров`);
    // Курс на площадку — от машины к берту, а не от точки трассы: смотрит
    // машина, и мерить надо по ней.
    const aimed = inside.map((s) => {
      const toPad = Math.hypot(s.at[0] - BERTH[0], s.at[1] - BERTH[2]) || 1;
      const wantX = (BERTH[0] - s.at[0]) / toPad;
      const wantZ = (BERTH[2] - s.at[1]) / toPad;
      return s.nose[0] * wantX + s.nose[1] * wantZ;
    });
    const best = aimed.reduce((top, dot) => Math.max(top, dot), -1);
    assert.ok(
      best > 0.9,
      `${act.key}: нос так и не пришёл на площадку, лучшее совпадение ${best.toFixed(2)}`,
    );
  }
});

/**
 * ОТКАЗ ЗВЕНА НЕ РВЁТ ЦЕПЬ.
 *
 * Ворота считают выполнимость фигуры по состоянию машины НА ВХОДЕ: вышла ниже
 * или медленнее — фигура снимается. Это правильно и это обязано быть безопасно,
 * то есть трасса обязана оставаться летимой без любой своей фигуры. Проверяется
 * предельным случаем: без единой фигуры вообще. Тогда машина летит те самые
 * полукруги, которые фигуры собой заменяют, и именно они — самое узкое место
 * трассы (одиннадцать метров радиуса против сорока пяти на галсах).
 */
test("трасса остаётся летимой БЕЗ ЕДИНОЙ фигуры", () => {
  const bare = flyCircuit({ seconds: 300, stations: [] });
  assert.deepEqual(bare.events, [], "фигуры не объявлены, а что-то началось");
  assert.ok(
    bare.progress >= 0.99,
    `голая трасса встала на доле ${bare.progress.toFixed(3)}`,
  );
  const lowest = clearanceOf(bare);
  assert.ok(lowest > 3, `без фигур опустилась до ${lowest.toFixed(1)} м`);
  assert.equal(bare.failure, null, `без фигур снята: ${bare.failure}`);
  // И не разошлась с трассой: полукруги проходятся, а не срезаются по прямой.
  const worst = bare.track
    .filter((s) => s.progress > 0.02 && s.progress < 0.98)
    .reduce((far, s) => Math.max(far, s.off), 0);
  assert.ok(worst < 90, `без фигур ушла на ${worst.toFixed(0)} м от трассы`);
});

test("машина ДЕЙСТВИТЕЛЬНО переворачивается на каждой фигуре, а не изображает", () => {
  for (const station of plan.figures) {
    const inside = run.track.filter((sample) => sample.figure === station.key);
    assert.ok(inside.length > 60, `${station.key}: всего ${inside.length} кадров`);
    // ПЕРЕВЁРНУТОСТЬ МЕРИТСЯ ОТ ПЛОСКОСТИ ФИГУРЫ, А НЕ ОТ ВЕРТИКАЛИ МИРА.
    // Наклонённая петля идёт в заваленной плоскости, и на её вершине мировая
    // ось «вверх» не может дойти до минус единицы по построению: предел там —
    // косинус завала. Требовать общего порога значило бы требовать, чтобы
    // наклона не было.
    const upright = Math.cos(station.bank ?? 0);
    const lowest = inside.reduce((worst, s) => Math.min(worst, s.up), 1);
    assert.ok(
      lowest < -0.9 * upright,
      `${station.key}: самая перевёрнутая поза ${lowest.toFixed(2)} при пределе ${(-upright).toFixed(2)}`,
    );
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
  // СРОК ВОЗВРАТА — ДО СЛЕДУЮЩЕГО НОМЕРА, а не фиксированные шесть сотых доли.
  // Разворачивающая фигура оставляет машину в стороне от трассы намеренно (её
  // полукруг машина не летит), и сколько метров надо закрыть — свойство места,
  // а не общая константа. Важно другое: к началу следующего номера машина
  // обязана быть на линии, а последняя фигура — успеть до посадочного столба,
  // потому что дальше точность становится вопросом столкновения.
  const shoulder = combatHexacopterRangeCircuit.nodeProgress("arrival-shoulder");
  plan.figures.forEach((station, index) => {
    const deadline = plan.figures[index + 1]?.at ?? shoulder;
    const after = run.track.filter(
      (sample) =>
        sample.figure === null &&
        sample.progress > station.resumeAt &&
        sample.progress < deadline,
    );
    if (after.length === 0) return;
    const closed = after.find((sample) => sample.off < 8);
    const closest = after.reduce((best, s) => Math.min(best, s.off), 1e9);
    assert.ok(
      closed,
      `${station.key}: до доли ${deadline.toFixed(3)} машина подошла лишь на ${closest.toFixed(0)} м`,
    );
  });
});

test("машина не задевает землю: провал фигуры остаётся над полигоном", () => {
  const lowest = clearanceOf(run);
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
    flyover.figures?.length === 6,
    "маршрут облёта обязан нести все шесть фигур — иначе врезка молча не сработает",
  );
  // Сторожевая орбита фигур не крутит: там машина работает, а не показывает,
  // и переворачиваться посреди боевого дежурства ей незачем.
  const guard = rax8.flight.routePlan(COMBAT_HEXACOPTER_SKY_CONTROL, BERTH);
  assert.equal(guard.figures, undefined);
  // Возвращается машина ТЕМ ЖЕ показательным кругом — значит, и фигуры те же.
  // Это не оплошность: круг один, и разводить его надвое ради формальности
  // означало бы завести вторую правду о маршруте.
  const arrival = rax8.flight.arrivalPlan(BERTH);
  assert.equal(arrival.figures?.length, 6);
});

test("обёртка ограничения скорости НЕ ТЕРЯЕТ фигуры по дороге", () => {
  // Рантайм оборачивает маршрут ограничителем хода перед тем, как отдать его
  // автопилоту. Обёртка, собранная перечислением полей, унесла бы фигуры молча.
  const flyover = combatHexacopterRangePlan(BERTH);
  const limited = { ...flyover, speedLimit: (p) => flyover.speedLimit(p) * 0.5 };
  assert.equal(limited.figures?.length, 6);
  // И ТРЕБОВАНИЕ ПО КУРСУ — ТОЖЕ. Оно новее фигур и теряется так же тихо:
  // маршрут остался бы летимым, просто три номера превратились бы в обычные
  // отрезки, и заметить это можно было бы только глазами.
  assert.equal(typeof limited.heading, "function");
  const inside = combatHexacopterRangeCircuit.nodeProgress("dash");
  assert.ok(limited.heading(inside), "курс на броске обязан быть объявлен");
  assert.equal(
    flyover.heading(combatHexacopterRangeCircuit.nodeProgress("loop-big")),
    null,
    "вне трёх номеров курс объявлять нечем — его выводит наведение",
  );
});

if (process.env.FIGURE_TRACE) {
  for (const station of plan.figures) {
    const after = run.track.filter(
      (s) => s.figure === null && s.progress > station.resumeAt && s.progress < station.resumeAt + 0.08,
    );
    if (!after.length) continue;
    const closest = after.reduce((best, s) => Math.min(best, s.off), 1e9);
    console.log(
      `возврат ${station.key.padEnd(17)} от ${after[0].off.toFixed(0)} м до ${closest.toFixed(0)} м за ${(after.length / 60).toFixed(1)} с`,
    );
  }
  const at = combatHexacopterRangeCircuit.nodeProgress("dash");
  const to = combatHexacopterRangeCircuit.nodeProgress("dash-end");
  const dash = run.track.filter((s) => s.progress > at && s.progress < to);
  console.log(
    `бросок: ход ${Math.min(...dash.map((s) => s.speed)).toFixed(0)}..${Math.max(...dash.map((s) => s.speed)).toFixed(0)} м/с, ` +
      `до площадки ${Math.min(...dash.map((s) => Math.hypot(s.at[0], s.at[1]))).toFixed(0)} м`,
  );
}
