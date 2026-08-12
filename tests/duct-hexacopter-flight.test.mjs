import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import { DUCT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import {
  ductHexacopterLapPlan,
  ductHexacopterRangeFigures,
} from "../games/make-a-mess/src/game/ductHexacopterRangeRoutes.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
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
  assessVehicleTrajectory,
  requestedVehicleTrajectoryMode,
} from "../games/make-a-mess/src/game/vehicleTrajectoryCorrection.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
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
 * ПРОГРАММА VX-8 ОТ ПАДА ДО ПАДА, НА НАСТОЯЩЕМ АВТОПИЛОТЕ.
 *
 * До этого стенда у машины его НЕ БЫЛО, и это стоило доверия к целому коммиту:
 * посадку ей чинили выведением из устройства маршрута — «высота гаснет к
 * концам, значит сядет», — и утверждение оставалось рассуждением, потому что
 * ни один тест не поднимал её с площадки и не сажал обратно.
 *
 * Здесь она поднимается и садится. Между этим — вся программа: два обхода
 * овала, проход над падом полным ходом и пять номеров, включая два кульбита.
 *
 * И вместе с автопилотом здесь работают ОБА судьи рантайма, потому что
 * молчаливое расхождение стенда с игрой в этом проекте уже случалось дважды:
 *
 *   - СТОРОЖ ОТКАЗОВ снимает машину с рейса. Стенд без него доказывал
 *     «долетела», а живой полёт кончался снятием;
 *   - КОРРЕКТОР ТРАЕКТОРИИ вмешивается РАНЬШЕ сторожа: объявив возмущение, он
 *     подменяет план своим, а у плана коррекции фигур нет — и слой фигур
 *     выключается целиком. Стенд, который его не спрашивал, летел программу,
 *     которой в игре не было.
 */

const BERTH = [0, 0.08, 0];
const vx = airVehicles.find((entry) => entry.id === "duct-hexacopter");
const pieces = compileSceneGroups(
  ductHexacopterRangePadDocument,
  new Map(),
).clusters.find(
  (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
).pieces;
const plan = ductHexacopterLapPlan(BERTH);

function build() {
  return createMachine({
    pieces,
    vehicle: vx,
    // МАШИНА СТАВИТСЯ НА ПЛОЩАДКУ, а не запускается с середины трассы: взлёт и
    // посадка — часть программы, и проверяться обязаны вместе с ней.
    startPoint: plan.point(0),
    startVelocity: [0, 0, 0],
    startNose: null,
  });
}

const capability = figureCapabilityOf(build().machine);

function flyProgramme(seconds) {
  const m = build();
  let progress = 0;
  // Замороженная доля живёт МЕЖДУ КАДРАМИ всегда, а не только на фигуре: из
  // неё и текущей доли получается интервал, на котором станция «наступает».
  let frozen = null;
  let figures = IDLE_ROUTE_FIGURE;
  const events = [];
  const track = [];
  const envelope = vehicleFailureEnvelopeFor(m.flight);
  // Конверт наведения строится С ПАСПОРТНЫМИ ПОПРАВКАМИ, как в рантайме: без
  // них порог возмущения общий, и любой полноценный разворот этой машины
  // объявлялся бы потерей управления по построению.
  const guidanceEnvelope = vehicleGuidanceEnvelope(
    envelope,
    m.flight.approach,
    m.flight.limits,
    m.flight.guidance,
  );
  let watchdog = createVehicleFailureWatchdog(0);
  let failure = null;
  let failedAt = null;
  let seized = null;
  const wouldSeize = [];
  let lastGuidance = null;
  let landedAt = null;

  for (let step = 0; step < seconds * 60; step += 1) {
    const centre = centreOf(m);
    const speed = Math.hypot(...m.state.velocity);
    // ПОРЯДОК ТОТ ЖЕ, ЧТО В РАНТАЙМЕ: трасса двигается сама, и только потом
    // фигура откатывает её назад.
    progress = advanceVehicleRouteProgress(
      plan,
      progress,
      centre,
      Math.hypot(m.state.velocity[0], m.state.velocity[2]) * dt,
    );
    // ТОТ ЖЕ КАДР ФИГУРЫ, ЧТО У РАНТАЙМА, И ТОЙ ЖЕ ФУНКЦИЕЙ.
    const figured = advanceRouteFigureFrame({
      state: figures,
      frozenProgress: frozen,
      stations: plan.figures,
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
      events.push({
        start: figured.state.station.key,
        seconds: step / 60,
        height: centre[1] - BERTH[1],
        speed,
      });
    }
    if (!figured.state.station && figures.station) {
      events.push({
        end: figures.station.key,
        seconds: figures.episode.seconds,
        aborted: figures.episode.aborted,
        height: centre[1] - BERTH[1],
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
    track.push({
      progress,
      figure: figures.station?.key ?? null,
      tiltRate: Math.hypot(
        m.state.angularVelocity[0],
        m.state.angularVelocity[2],
      ),
      yawRate: Math.abs(m.state.angularVelocity[1]),
      height: live[1] - BERTH[1],
      at: [live[0], live[2]],
      off: Math.hypot(live[0] - onRoute[0], live[2] - onRoute[2]),
      speed: Math.hypot(...m.state.velocity),
      up: rotateVector(m.state.orientation, [0, 1, 0])[1],
      lift: lastGuidance?.liftFraction ?? 0,
      seconds: step / 60,
    });

    // ВМЕШАЛСЯ БЫ КОРРЕКТОР? Тот же вопрос и те же данные, что в рантайме.
    const mode = requestedVehicleTrajectoryMode(
      assessVehicleTrajectory(
        plan,
        progress,
        {
          position: live,
          orientation: m.state.orientation,
          velocity: m.state.velocity,
          angularVelocity: m.state.angularVelocity,
        },
        m.vehicle.nose,
        { ...m.model, engineAvailability: m.feedback },
        guidanceEnvelope,
      ),
    );
    // Рантайм не пускает корректор в идущую фигуру, и стенд считает так же. Но
    // случай ЗАПОМИНАЕТСЯ: он и есть доказательство механизма.
    const event = {
      mode,
      progress,
      seconds: step / 60,
      figure: figures.station?.key ?? null,
      tiltRate: Math.hypot(m.state.angularVelocity[0], m.state.angularVelocity[2]),
      yawRate: Math.abs(m.state.angularVelocity[1]),
    };
    if (mode !== "authoredRoute") {
      if (figures.episode) {
        if (!wouldSeize.some((x) => x.figure === event.figure)) {
          wouldSeize.push(event);
        }
      } else if (!seized) {
        seized = event;
      }
    }

    const bodyNose = rotateVector(m.state.orientation, m.vehicle.nose);
    const bodyUp = rotateVector(m.state.orientation, [0, 1, 0]);
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
        executingFigure: figures.episode !== null,
        headingError: 0,
        // Нос машины с векторной тягой курса не задаёт — тело держит линию само.
        courseFollowsNose: false,
        // Расхождение по темпу рыскания берётся НАСТОЯЩЕЕ: сторож считает его
        // в том же таймере, что углы позы, и заглушённый канал уже однажды
        // пропустил снятие рейса на идеально ровной машине.
        yawRateError:
          m.state.angularVelocity[1] - (m.lastResult?.acceptedYawRate ?? 0),
        crossTrackError: Math.hypot(
          live[0] - onRoute[0],
          live[2] - onRoute[2],
        ),
        corridorLimit: plan.corridor?.(progress),
        // Высота мерится против ТОЙ ЖЕ цели, по которой летит автопилот, а не
        // против точки линии: на столбах цель — сам столб.
        altitudeError:
          live[1] - vehicleRouteAltitudeTarget(plan, progress, live),
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
      failedAt = {
        progress,
        seconds: step / 60,
        figure: figures.station?.key ?? null,
      };
    }
    // РЕЙС КОНЧАЕТСЯ КАСАНИЕМ, А НЕ КОНЦОМ ТРАССЫ. Условие «доля единица и ход
    // ноль» выполняется ещё НА ПОСАДОЧНОМ СТОЛБЕ: машина висит над падом,
    // гасит боковой снос и только потом идёт вниз. Стенд, обрывавшийся там,
    // объявлял посадкой зависание в четырнадцати метрах.
    if (
      progress >= 0.9995 &&
      Math.hypot(...m.state.velocity) < 0.6 &&
      live[1] - BERTH[1] < 2
    ) {
      landedAt = { seconds: step / 60, height: live[1] - BERTH[1] };
      break;
    }
  }
  return {
    events,
    track,
    progress,
    machine: m,
    failure,
    failedAt,
    seized,
    wouldSeize,
    landedAt,
  };
}

const flight = flyProgramme(200);

// Разбор рейса под рукой: стенд, который умеет только «упало», заставляет
// писать его заново при каждой правке трассы.
if (process.env.VX_TRACE) {
  console.log("failure", flight.failure, flight.failedAt);
  console.log("seized", flight.seized);
  console.log("wouldSeize", flight.wouldSeize);
  console.log("events", JSON.stringify(flight.events, null, 1));
  console.log("landed", flight.landedAt, "progress", flight.progress);
  const peak = (pick, filter) =>
    flight.track.filter(filter).reduce((b, s) => Math.max(b, pick(s)), 0);
  console.log(
    "peak tilt rate: figures",
    peak((s) => s.tiltRate, (s) => s.figure).toFixed(2),
    "route",
    peak((s) => s.tiltRate, (s) => !s.figure).toFixed(2),
    "| peak yaw rate: figures",
    peak((s) => s.yawRate, (s) => s.figure).toFixed(2),
    "route",
    peak((s) => s.yawRate, (s) => !s.figure).toFixed(2),
  );
  for (let index = 0; index < flight.track.length; index += 30) {
    const s = flight.track[index];
    console.log(
      `${s.seconds.toFixed(1).padStart(6)}s p=${s.progress.toFixed(3)} h=${s.height.toFixed(1).padStart(6)} off=${s.off.toFixed(1).padStart(5)} v=${s.speed.toFixed(1).padStart(5)} up=${s.up.toFixed(2)} ${s.figure ?? ""}`,
    );
  }
}

test("ПРОГРАММА ДОХОДИТ ДО КОНЦА, и никто её не снимает", () => {
  assert.equal(
    flight.failure,
    null,
    `снята: ${flight.failure} на доле ${flight.failedAt?.progress?.toFixed(3)}, номер ${flight.failedAt?.figure}`,
  );
  assert.equal(
    flight.seized,
    null,
    `корректор вмешался вне фигуры на доле ${flight.seized?.progress?.toFixed(3)}: ${flight.seized?.mode}`,
  );
  assert.ok(
    flight.progress > 0.999,
    `дошла только до доли ${flight.progress.toFixed(3)}`,
  );
});

test("МАШИНА САДИТСЯ НА СВОЙ ПАД — вот чего у неё не было проверено ни разу", () => {
  assert.ok(flight.landedAt, "рейс не кончился остановкой у причала");
  const last = flight.track.at(-1);
  const miss = Math.hypot(last.at[0] - BERTH[0], last.at[1] - BERTH[2]);
  assert.ok(miss < 4, `села в ${miss.toFixed(1)} м от площадки`);
  assert.ok(
    last.height < 3,
    `остановилась на высоте ${last.height.toFixed(1)} м — это не посадка`,
  );
  assert.ok(last.up > 0.97, `села с креном: ось вверх ${last.up.toFixed(3)}`);
});

test("МАШИНА ВЗЛЕТАЕТ СТОЛБОМ, а не уходит с площадки по диагонали", () => {
  // На пад приходят сверху и уходят вверх: рядом стоят пульт и вертипад HX-6.
  const column = flight.track.filter((s) => s.height < 12 && s.seconds < 20);
  const drift = column.reduce(
    (worst, s) => Math.max(worst, Math.hypot(s.at[0], s.at[1])),
    0,
  );
  assert.ok(drift < 8, `на первых двенадцати метрах ушла на ${drift.toFixed(1)} м вбок`);
});

test("МЕЖДУ СТОЛБАМИ машина не касается земли", () => {
  // Запас мерится ТОЛЬКО в полёте: у площадки профиль сам гаснет к нулю, и
  // считать это касанием значило бы объявить посадку аварией.
  const airborne = flight.track.filter(
    (s) => s.progress > 0.04 && s.progress < 0.94,
  );
  const lowest = airborne.reduce((worst, s) => Math.min(worst, s.height), 1e9);
  assert.ok(lowest > 6, `просела до ${lowest.toFixed(1)} м над бертом`);
});

test("ВСЕ ПЯТЬ НОМЕРОВ ОТРАБОТАНЫ — ни одного пропуска и ни одного снятия", () => {
  const started = flight.events.filter((e) => e.start).map((e) => e.start);
  const skipped = flight.events.filter((e) => e.skipped);
  assert.deepEqual(
    started,
    ductHexacopterRangeFigures.map((station) => station.key),
    `пропущено: ${skipped.map((e) => e.skipped).join("; ") || "ничего"}`,
  );
  const aborted = flight.events.filter((e) => e.end && e.aborted);
  assert.deepEqual(
    aborted.map((e) => e.end),
    [],
    "фигуры, снятые по времени",
  );
});

test("ЗАЩИТА ФИГУРЫ ОТ КОРРЕКТОРА — НЕСУЩАЯ, а не украшение", () => {
  // Рантайм не пускает корректор в идущую фигуру. Проверить это утверждение
  // можно только одним способом: показать, что БЕЗ него корректор вмешался бы.
  //
  // Он и вмешался бы. Бочка раскручивает корпус до 4.67 рад/с — это и есть
  // фигура, — а ворота возмущения стоят на 2.4. Никакой порог не может
  // одновременно пускать бочку и ловить срыв: у этой машины рабочий темп
  // фигуры выше любого разумного признака потери управления. Поэтому фигуру
  // защищает не порог, а ЗНАНИЕ О ТОМ, ЧТО ПОЗА ЗАКАЗАНА.
  assert.ok(
    flight.wouldSeize.length > 0,
    "корректор ни разу не сработал бы — значит, защита ничего не защищает, и проверять надо не это",
  );
  // А вне фигуры он молчит: там порог обязан быть выше того, что просит сама
  // трасса, и это уже проверено выше отдельным утверждением.
  const routeRate = flight.track
    .filter((s) => !s.figure)
    .reduce((worst, s) => Math.max(worst, s.tiltRate), 0);
  assert.ok(
    routeRate < 2.4,
    `трасса сама просит ${routeRate.toFixed(2)} рад/с — ворота возмущения ниже её собственных требований`,
  );
});

test("КУЛЬБИТЫ ПОДНИМАЮТ МАШИНУ, а не роняют её — на живом рейсе, не на стенде фигуры", () => {
  for (const key of ["kulbit-open", "kulbit-snap"]) {
    const start = flight.events.find((e) => e.start === key);
    const end = flight.events.find((e) => e.end === key);
    assert.ok(start && end, `${key} не состоялся`);
    assert.ok(
      end.height > start.height + 8,
      `${key}: вошла на ${start.height.toFixed(1)} м, вышла на ${end.height.toFixed(1)}`,
    );
  }
});

test("ПРЯМАЯ ИДЁТ ПОЛНЫМ ХОДОМ, а разворот — по наклону: разница объявлена и достигнута", () => {
  // Ради этой разницы трасса и выпрямлена. Если бы машина шла везде одинаково,
  // овал не имел бы смысла и круг был бы не хуже.
  const fastest = flight.track.reduce((best, s) => Math.max(best, s.speed), 0);
  assert.ok(fastest > 24, `быстрее ${fastest.toFixed(1)} м/с не разогналась`);
  // ПРОХОД НАД СВОЕЙ ПЛОЩАДКОЙ — то, ради чего радиус разворота приравнен
  // выносу пада: только при таком радиусе пад лежит посередине прямой, и у
  // машины есть полсотни метров разбега до него и столько же после.
  //
  // Ищется он ГЕОМЕТРИЕЙ, а не долей трассы. Доля переезжает от всякой правки
  // программы, и тест, привязанный к ней, начинает проверять другое место
  // молча.
  const overPad = flight.track.filter(
    (s) => s.height > 8 && Math.hypot(s.at[0], s.at[1]) < 14,
  );
  assert.ok(overPad.length > 0, "машина не прошла над своей площадкой");
  const fastPass = overPad.reduce((best, s) => Math.max(best, s.speed), 0);
  assert.ok(
    fastPass > 24,
    `над падом прошла всего на ${fastPass.toFixed(1)} м/с`,
  );
  // И низко: самый быстрый проход идёт по нижнему этажу программы.
  const lowest = overPad.reduce((worst, s) => Math.min(worst, s.height), 1e9);
  assert.ok(
    lowest < 24,
    `ниже ${lowest.toFixed(1)} м над падом не прошла ни разу`,
  );
});

test("ЭТАЖ ПОД КАЖДЫМ НОМЕРОМ ВЫВЕДЕН ИЗ ПАСПОРТА МАШИНЫ, а не назначен", () => {
  // Трасса объявляет `floor`, а сходится он с живым паспортом или нет —
  // вопрос отдельный, и задавать его надо здесь, а не в полёте.
  const recovery = invertedRecoveryHeight(capability);
  for (const station of ductHexacopterRangeFigures) {
    const shape = planFlightFigure(
      station.kind,
      station.speed,
      capability,
      [1, 0],
      [0, 0, 0, 1],
      station.bank ?? 0,
      station.sweep,
      station.spin,
    );
    assert.ok(
      station.floor >= recovery + shape.dip,
      `${station.key}: объявлен этаж ${station.floor} м при потребных ${(recovery + shape.dip).toFixed(1)}`,
    );
    assert.ok(
      station.sky >= station.floor + shape.ceiling,
      `${station.key}: небо ${station.sky} м не покрывает ${(station.floor + shape.ceiling).toFixed(1)}`,
    );
  }
});

test("НОМЕРА НЕ ЕДЯТ ТРАССУ: ни один из них не разворачивает курс", () => {
  // Фигура, разворачивающая курс, обязана ЗАМЕНЯТЬ кусок трассы — иначе после
  // неё машина летит навстречу собственному маршруту. В этой программе таких
  // нет, и `resumeAt === at` у всех пяти — это проверяемое следствие, а не
  // совпадение.
  for (const station of ductHexacopterRangeFigures) {
    const shape = planFlightFigure(
      station.kind,
      station.speed,
      capability,
      [1, 0],
      [0, 0, 0, 1],
      station.bank ?? 0,
      station.sweep,
      station.spin,
    );
    assert.ok(
      Math.abs(shape.exit.headingTurn) < 0.35,
      `${station.key} разворачивает курс на ${(shape.exit.headingTurn * 57.3).toFixed(0)}°`,
    );
    assert.equal(station.resumeAt, station.at, station.key);
  }
});
