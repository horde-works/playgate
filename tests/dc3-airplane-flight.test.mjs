import assert from "node:assert/strict";
import test from "node:test";
import {
  airStateOf,
  centreOf,
  createAirplane,
  dt,
  forwardAxis,
  stepAirplane,
} from "./airplane-rig.mjs";
import {
  DC3_APPROACH_SPEED,
  DC3_CIRCUIT_RADIUS,
  DC3_TURN_RADIUS,
  dc3AirportPlan,
  dc3AirportRoute,
  dc3AirportRoutePhase,
} from "../games/make-a-mess/src/game/dc3AirportRoutes.ts";
import {
  AIRPORT_RUNWAY,
  AIRPORT_RUNWAY_TOP_Y,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import {
  DC3_AIRPLANE_PASSPORT,
  dc3AirplaneStandMass,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import {
  airplaneGroundYawAuthority,
  airplaneTurnCapability,
  CLIMB_RESPONSE_SECONDS,
} from "../games/make-a-mess/src/game/airplaneDynamics.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  rejoinVehicleRouteProgress,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceDc3GroundTaxiProgress,
  dc3GroundTaxiDemand,
} from "../games/make-a-mess/src/game/dc3GroundTaxi.ts";
import {
  assessVehicleTrajectory,
  planVehicleTrajectoryCorrection,
  requestedVehicleTrajectoryMode,
  vehicleTrajectoryMergeReady,
} from "../games/make-a-mess/src/game/vehicleTrajectoryCorrection.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
import { DEFAULT_VEHICLE_FAILURE_ENVELOPE } from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { islandAirportDc3Frame } from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import { ISLAND_AIRPORT_DC3_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";
import { islandAirportScene } from "../games/make-a-mess/src/game/islandAirportScene.ts";

/**
 * ПРИЁМКА РЕЙСА ЦЕЛИКОМ: НАСТОЯЩИЕ СИЛЫ, НАСТОЯЩАЯ ОПОРА, ВСЯ ТРАССА.
 *
 * Геометрическая проверка трассы живёт в `dc3-airplane-frame`. Здесь машина
 * ЛЕТИТ: разбегается по бетону на своих стойках, отрывается, идёт круг,
 * снижается по глиссаде, касается и останавливается. Наведение здесь —
 * тот же контур, что и у общего автопилота, сведённый к трём просьбам:
 * ход по полке трассы, разворот на упреждённую точку и вертикальная
 * скорость от ошибки высоты. Если машина не проходит рейс с таким
 * наведением, её не спасёт и настоящее.
 */

const RUNWAY_Z = AIRPORT_RUNWAY.centreZ;
const BERTH = [AIRPORT_RUNWAY.westDesignatorX, AIRPORT_RUNWAY_TOP_Y, RUNWAY_Z];

function shipModelFor(machine) {
  const flight = machine.vehicle.flight;
  return {
    mass: machine.mass.mass,
    inertiaYaw: machine.mass.inertia[4],
    bodyCentre: machine.mass.centre,
    dragLinear: machine.mass.mass * flight.linearDamping,
    dragLateral:
      machine.mass.mass * flight.linearDamping * flight.lateralDragRatio,
    dragAngular: machine.mass.inertia[4] * flight.angularDamping,
    limits: flight.limits,
    turnPersists: true,
    verticalResponseSeconds: CLIMB_RESPONSE_SECONDS,
    turnCapability: airplaneTurnCapability(
      DC3_AIRPLANE_PASSPORT,
      airStateOf(machine).airspeed,
      machine.mass.mass,
      machine.airborneSeconds < 0.4,
    ),
  };
}

/**
 * Рейс ведёт ТОТ ЖЕ автопилот, что и в мире (`autopilot` из `vehicleFrames`).
 *
 * Собственное наведение в стенде было ошибкой: оно отставало от дуги, и я
 * чинил его вместо машины. Стенд и рантайм обязаны считать одно и то же —
 * иначе принимается не машина, а мой контур в тесте.
 */
function flyTheRoute({ seconds = 760 } = {}) {
  const runtimePieces = islandAirportScene.breakablePieces.filter(
    (piece) => piece.clusterId === ISLAND_AIRPORT_DC3_AIR_VEHICLE.clusterId,
  );
  const runtimeMass = dc3AirplaneStandMass(runtimePieces);
  const machine = createAirplane({
    pieces: runtimePieces,
    vehicle: ISLAND_AIRPORT_DC3_AIR_VEHICLE,
    gearDefinitions: ISLAND_AIRPORT_DC3_AIR_VEHICLE.supportStruts,
    startPoint: runtimeMass.centre,
    startVelocity: [0, 0, 0],
    startNose: ISLAND_AIRPORT_DC3_AIR_VEHICLE.nose,
  });
  const plan = dc3AirportPlan("survey", machine.mass.centre);
  const approach = ISLAND_AIRPORT_DC3_AIR_VEHICLE.flight.approach;
  const guidance = vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    approach,
    machine.vehicle.flight.limits,
  );
  let progress = 0;
  let correction = null;
  let correctionProgress = 0;
  let previous = centreOf(machine);
  const report = {
    liftOff: null,
    maxCrossTrack: 0,
    maxAltitudeError: 0,
    peakStrutLoad: 0,
    peakBank: 0,
    stalled: false,
    touchdown: null,
    touchdownSink: 0,
    stopped: null,
    ceiling: 0,
    preflightSurfaces: 0,
    throttleTravel: 0,
    airborneSeconds: 0,
    circuitBiasSum: 0,
    circuitBiasSeconds: 0,
    altitudeBiasSum: 0,
    altitudeBiasSeconds: 0,
    approachAltitudeBiasSum: 0,
    approachAltitudeBiasSeconds: 0,
    taxiDeepZ: 0,
    stages: [],
    worstOutsideCorridor: 0,
    outsideCorridorAt: 0,
    corrections: 0,
    correctionMerges: 0,
    firstCorrection: null,
    correctionActiveAtEnd: false,
  };
  let outsideRun = 0;
  let previousThrottle = 0;
  let groundTaxiState = null;
  let flightTime = 0;
  const underwaySeconds = ISLAND_AIRPORT_DC3_AIR_VEHICLE.flight.underwaySeconds;
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps; index += 1) {
    flightTime += dt;
    const centre = centreOf(machine);
    const air = airStateOf(machine);
    const travelled = Math.hypot(
      centre[0] - previous[0],
      centre[2] - previous[2],
    );
    previous = centre;
    const course =
      air.groundSpeed > 1
        ? [
            machine.state.velocity[0] / air.groundSpeed,
            machine.state.velocity[2] / air.groundSpeed,
          ]
        : undefined;
    // Колёсная высота — для отрыва и касания; ПЛАН говорит центром, и в
    // автопилот идёт центр — ровно как `centreNow` в рантайме.
    const wheelAltitude = centre[1] - machine.mass.centre[1];
    const wantAltitude = plan.altitude(progress);
    const height = wheelAltitude - AIRPORT_RUNWAY_TOP_Y;
    const airborne = machine.supportContacts === 0 && height > 1;
    const castOff = flightTime >= machine.vehicle.flight.spoolSeconds;
    const model = shipModelFor(machine);
    const navigation = {
      position: centre,
      orientation: machine.state.orientation,
      velocity: machine.state.velocity,
      angularVelocity: machine.state.angularVelocity,
    };
    const assessment = assessVehicleTrajectory(
      plan,
      progress,
      navigation,
      machine.vehicle.nose,
      model,
      guidance,
    );
    if (
      castOff &&
      !machine.taxi &&
      correction === null &&
      requestedVehicleTrajectoryMode(assessment) === "intercepting"
    ) {
      correction = planVehicleTrajectoryCorrection(
        plan,
        progress,
        navigation,
        model,
        machine.vehicle.nose,
      );
      if (correction) {
        correctionProgress = 0;
        report.corrections += 1;
        report.firstCorrection ??= {
          progress,
          reason: assessment.reason,
          crossTrack: assessment.crossTrackError,
          altitude: assessment.altitudeError,
          speed: air.groundSpeed,
          commandedSpeed: correction.plan.speedLimit(0),
        };
      }
    }
    const activePlan = correction?.plan ?? plan;
    const activeProgress = correction ? correctionProgress : progress;
    const flightCommanded = castOff
      ? autopilot(
          activePlan,
          activeProgress,
          // VehicleFrameSystem passes the live centre of mass here.
          centre,
          machine.state.orientation,
          machine.state.velocity,
          machine.state.angularVelocity,
          shipModelFor(machine),
          Math.max(0, Math.min(1, (flightTime - underwaySeconds) / 8)),
          machine.vehicle.nose,
          approach,
          null,
        )
      : {
          guidance: {
            forwardSpeed: 0,
            lateralSpeed: 0,
            yawRate: 0,
            liftFraction: 0,
          },
        };
    let taxiDemand = null;
    const taxiCommanded = machine.taxi
      ? (() => {
          const facing = forwardAxis(machine);
          const flat = Math.hypot(facing[0], facing[2]) || 1;
          const capability = airplaneTurnCapability(
            DC3_AIRPLANE_PASSPORT,
            air.groundSpeed,
            machine.mass.mass,
            true,
          );
          taxiDemand = dc3GroundTaxiDemand({
            plan,
            progress,
            centre,
            heading: [facing[0] / flat, facing[2] / flat],
            velocity: machine.state.velocity,
            yawRate: machine.state.angularVelocity[1],
            maximumYawRate: capability.yawRate,
            pivotYawAcceleration: airplaneGroundYawAuthority(
              DC3_AIRPLANE_PASSPORT,
              machine.mass.inertia[4],
              machine.mass.mass,
            ).angularAcceleration,
            pivotRadius: DC3_AIRPLANE_PASSPORT.wheelbase,
            pivotPointAhead:
              DC3_AIRPLANE_PASSPORT.mainAxleAheadOfCentre ?? 0,
            acceleration:
              (2 * DC3_AIRPLANE_PASSPORT.enginePower) / machine.mass.mass,
            braking: capability.braking,
            responseSeconds: machine.vehicle.flight.spoolSeconds,
            state: groundTaxiState,
          });
          groundTaxiState = taxiDemand.state;
          return {
            guidance: {
              forwardSpeed: taxiDemand.forwardSpeed,
              lateralSpeed: 0,
              yawRate: taxiDemand.yawRate,
              liftFraction: 0,
              finalPhase: false,
            },
          };
        })()
      : null;
    const commanded = taxiCommanded ?? flightCommanded;
    // СТАДИЯ РЕЙСА БЕРЁТСЯ ИЗ ЖУРНАЛА, КАК В МИРЕ, а не из «оторвалась ли».
    //
    // Прежняя строка объявляла крейсер в тот кадр, когда колёса оторвались от
    // бетона на метр, и рейс с этого места шёл не по тому закону: взлётный
    // режим кончался на первом метре вместо шестидесяти, а стадия захода не
    // наступала НИКОГДА — значит ни щитков, ни выравнивания, ни колодок.
    // Стенд мерил другую машину, и все её числа были ни при чём.
    const journeyStage = castOff
      ? dc3AirportRoutePhase("survey", progress)
      : "attention";
    if (report.stages[report.stages.length - 1] !== journeyStage) {
      report.stages.push(journeyStage);
    }
    const step = stepAirplane(
      machine,
      commanded.guidance,
      journeyStage,
      flightTime,
      taxiDemand?.pivoting ?? false,
      taxiDemand?.forwardAcceleration,
      taxiDemand?.yawAcceleration,
    );
    if (correction) {
      correctionProgress = advanceVehicleRouteProgress(
        correction.plan,
        correctionProgress,
        centre,
        travelled,
      );
      const mergeProgress = rejoinVehicleRouteProgress(
        plan,
        correction.mergeProgress,
        centre,
        0.04,
        0.12,
      );
      if (
        correctionProgress >= 0.8 &&
        vehicleTrajectoryMergeReady(
          plan,
          mergeProgress,
          navigation,
          machine.vehicle.nose,
          guidance,
        )
      ) {
        progress = mergeProgress;
        correction = null;
        report.correctionMerges += 1;
      }
    } else if (castOff && flightTime >= underwaySeconds) {
      progress = machine.taxi
        ? advanceDc3GroundTaxiProgress(plan, progress, centre, travelled)
        : advanceVehicleRouteProgress(
            plan,
            progress,
            centre,
            travelled,
            course,
            // Runtime gives the wide turn-skip window only to rotorcraft.
            // A winged aircraft advances against the route with a zero arc.
            0,
          );
    }

    const routeHere = plan.point(progress);
    // ── СНОС МЕРИТСЯ ТАК ЖЕ, КАК ЕГО СМОТРИТ СТОРОЖ РЕЙСА ─────────────────
    //
    // `vehicleFailure` получает ПЕРПЕНДИКУЛЯР к касательной трассы, а не
    // расстояние до выборки: второе включает продольное отставание счётчика
    // хода и на прямой у полосы читало двадцать метров у машины, идущей
    // точно по осевой. Замер, спрашивающий не то поле, против которого живёт
    // симуляция, выдаёт устойчивую неисправность, которой нет, — эта грабля
    // в проекте уже описана (village-inhabitants-lessons §10.6).
    const ahead = plan.point(Math.min(1, progress + 8 / plan.length));
    const tangentX = ahead[0] - routeHere[0];
    const tangentZ = ahead[2] - routeHere[2];
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const crossTrack = Math.abs(
      ((centre[0] - routeHere[0]) * tangentZ -
        (centre[2] - routeHere[2]) * tangentX) /
        tangentLength,
    );
    if (report.liftOff === null && airborne) {
      report.liftOff = {
        x: centre[0],
        speed: air.airspeed,
        progress,
        wheelAltitude,
        wantAltitude,
      };
    }
    if (airborne) {
      // ── ХОД РУД: РЕГУЛИРОВАНИЕ ИЛИ ДЁРГАНЬЕ ──────────────────────────
      //
      // Сумма модулей приращения газа за полёт, делённая на время. Число
      // это ловит то, чего не ловит ни одна средняя величина: контур,
      // который стоит в упорах и перекладывается, даёт тот же средний газ,
      // что и спокойный, но в разы больший ХОД. Замер на реле вертикали:
      // 0.26 хода в секунду, газ ходил 0.00 → 0.48 → 0.33 → 0.00 каждые
      // четыре секунды весь полёт. Ни один автопилот и ни один пилот так не
      // летает, и дело не в манере: двигатель за этим не успевает.
      report.throttleTravel += Math.abs(
        step.delivered.throttle[0] - previousThrottle,
      );
      report.airborneSeconds += dt;
      // ── КОРИДОР: ЕГО СТОРОЖИТ НЕ ПРИЁМКА, А САМ РЕЙС ─────────────────
      //
      // `vehicleFailure` снимает рейс, если машина держится вне коридора
      // участка пять секунд подряд. Для игрока это выглядит так, что машина
      // «потерялась» посреди маршрута и не вернулась, — и именно так и
      // выглядело. Здесь мерится ровно то, на что смотрит сторож.
      if (crossTrack > plan.corridor(progress)) {
        outsideRun += dt;
        if (outsideRun > report.worstOutsideCorridor) {
          report.worstOutsideCorridor = outsideRun;
          report.outsideCorridorAt = progress;
        }
      } else {
        outsideRun = 0;
      }
      report.maxCrossTrack = Math.max(report.maxCrossTrack, crossTrack);
      // Установившееся СМЕЩЕНИЕ (знаковое): середина круга, где манёвров
      // нет и машина обязана стоять на линии. Средним ловится равновесие
      // закона, а не шум: смещённая погоня давала тут +27 м, полукривизна
      // подачи — −36, и оба прошли бы пиковый допуск манёвра.
      if (progress > 0.25 && progress < 0.6) {
        const signedCross =
          ((centre[0] - routeHere[0]) * tangentZ -
            (centre[2] - routeHere[2]) * tangentX) /
          tangentLength;
        report.circuitBiasSum += signedCross * dt;
        report.circuitBiasSeconds += dt;
        report.altitudeBiasSum += (centre[1] - wantAltitude) * dt;
        report.altitudeBiasSeconds += dt;
      }
      if (progress >= plan.finalFrom && progress < 1) {
        report.approachAltitudeBiasSum += (centre[1] - wantAltitude) * dt;
        report.approachAltitudeBiasSeconds += dt;
      }
      report.maxAltitudeError = Math.max(
        report.maxAltitudeError,
        Math.abs(centre[1] - wantAltitude),
      );
      report.peakBank = Math.max(report.peakBank, Math.abs(air.bank));
      report.ceiling = Math.max(report.ceiling, wheelAltitude);
      report.stalled = report.stalled || step.stalled;
    }
    previousThrottle = step.delivered.throttle[0];
    report.peakStrutLoad = Math.max(
      report.peakStrutLoad,
      ...machine.lastStruts.map((reaction) => reaction.load),
    );
    if (report.touchdown && centre[2] < report.taxiDeepZ) {
      report.taxiDeepZ = centre[2];
    }
    if (report.liftOff && report.touchdown === null && machine.supportContacts > 0) {
      report.touchdown = {
        x: centre[0],
        z: centre[2],
        pitch: air.pitch,
        altitudeError: centre[1] - wantAltitude,
      };
      report.touchdownSink = air.climbRate;
    }
    if (
      report.touchdown &&
      report.stopped === null &&
      air.groundSpeed < 0.5 &&
      machine.supportContacts > 0 &&
      // Останов — только у стартовой точки: пятисекундная выдержка после
      // пробега тоже стоит неподвижно, и прежний критерий обрывал рейс на
      // ней, не дав рулению начаться.
      Math.abs(centre[0] - AIRPORT_RUNWAY.westDesignatorX) < 8 &&
      Math.abs(centre[2] - RUNWAY_Z) < 3
    ) {
      report.stopped = { x: centre[0], z: centre[2], seconds: index * dt };
      break;
    }
    if (!Number.isFinite(centre[0])) break;
  }
  report.correctionActiveAtEnd = correction !== null;
  return { machine, report, plan };
}

const flight = flyTheRoute({ seconds: 760 });

test("the DC-3 leaves the ground inside the strip it was authored for", () => {
  const { report } = flight;
  assert.ok(report.liftOff, "машина не оторвалась вовсе");
  const run = report.liftOff.x - AIRPORT_RUNWAY.westDesignatorX;
  const route = dc3AirportRoute("survey", BERTH);
  const rotateAt = route.markerProgress("rotate");
  const rotateX = route.point(rotateAt)[0];
  assert.ok(
    run > 20 && run < 140,
    `разбег ${run.toFixed(0)} м не похож на разбег этого типа`,
  );
  assert.ok(
    report.liftOff.x < AIRPORT_RUNWAY.eastThresholdX,
    "машина ушла за восточный порог, не оторвавшись",
  );
  assert.ok(
    report.liftOff.speed > DC3_AIRPLANE_PASSPORT.stallSpeedFlaps,
    "отрыв ниже скорости сваливания с закрылками",
  );
  assert.ok(
    report.liftOff.x >= rotateX,
    `отрыв x=${report.liftOff.x.toFixed(1)} раньше точки rotate x=${rotateX.toFixed(1)}; ` +
      `профиль в этот момент просит y=${report.liftOff.wantAltitude.toFixed(1)}`,
  );
});

test("the survey circuit is flown, not cut", () => {
  const { report } = flight;
  // Крен не должен упираться в паспортный предел весь круг: если упирается,
  // трасса уже, чем машина умеет.
  assert.ok(
    report.peakBank <= DC3_AIRPLANE_PASSPORT.maximumBank + 0.05,
    `крен ${((report.peakBank * 180) / Math.PI).toFixed(0)}° выше паспортного`,
  );
  assert.ok(DC3_CIRCUIT_RADIUS > DC3_TURN_RADIUS);
  assert.ok(report.ceiling > 100, `круг не набран: потолок ${report.ceiling.toFixed(0)}`);
  assert.equal(report.stalled, false, "машина сваливалась в полёте");
  // Допуск — не константа удобства, а способность машины (вердикт Igor,
  // 15.08.2026): путевой закон с нулём на линии держит установившийся круг
  // в ±8 м (остаток — калибровка доставки рыскания, ~8%), пик 20 м — вход в
  // разворот. Допуск 25 стоит вплотную к замеру, чтобы возврат смещённого
  // равновесия (±27…80 м при прицельной погоне) не прошёл молча.
  assert.ok(
    report.maxCrossTrack < 25,
    `отклонение от трассы ${report.maxCrossTrack.toFixed(0)} м`,
  );
  assert.ok(
    report.maxAltitudeError < 45,
    `ошибка высоты ${report.maxAltitudeError.toFixed(0)} м`,
  );
  const altitudeBias =
    report.altitudeBiasSum / Math.max(0.1, report.altitudeBiasSeconds);
  // Знаковая ошибка на круге: линия — центр масс. Киль ниже нити на полувысоту
  // фюзеляжа — это геометрия, не ошибка контура. Устойчивые −5.7 м COM были
  // недобором тангажа: валы выше центра масс, балансировка руля не знала про
  // тягу, и пропорциональный контур позы держал 0.9° вместо 3.3°.
  assert.ok(
    altitudeBias > -2.6,
    `круг летится на ${(-altitudeBias).toFixed(1)} м ниже плана`,
  );
});

test("the automaton does not saw at the throttle levers", () => {
  const { report } = flight;
  const travel = report.throttleTravel / Math.max(1, report.airborneSeconds);
  // Порог не вкусовой, и он ПЕРЕКАЛИБРОВАН под губернатор: теперь скорость
  // входа в каждый манёвр считает автопилот (гашение к дуге, разгон после,
  // энергетический конверт перед снижением), и каждый такой цикл — честный
  // ход РУД, а не дёрганье. Замер здорового рейса: 0.069, из них середина
  // круга — 0.003–0.02, пики только на границах манёвров. Реле вертикали
  // давало 0.26 с периодом четыре секунды — порог по-прежнему втрое ниже
  // поломки, которую этот детектор ловит.
  assert.ok(
    travel < 0.085,
    `ход РУД ${travel.toFixed(3)} в секунду — автомат пилит рычагами`,
  );
});

test("the flight never leaves the corridor long enough to be written off", () => {
  const { report } = flight;
  // Пять секунд — срок, за который `vehicleFailure` снимает рейс по
  // `routeDivergence`. Приёмка обязана оставаться заметно внутри него.
  // Порог — сам срок сторожа с запасом: рейс снимают за пять секунд подряд,
  // и приёмка обязана держаться заметно ниже. Сейчас держится 4.3 — это уже
  // не девять, но и не запас; число открыто и меряется каждым прогоном.
  assert.ok(
    report.worstOutsideCorridor < 5,
    `машина держалась вне коридора ${report.worstOutsideCorridor.toFixed(1)} с ` +
      `на ${(report.outsideCorridorAt * 100).toFixed(0)}% трассы — рейс снимут`,
  );
});

test("a clean authored flight never falls into trajectory correction", () => {
  const { report } = flight;
  assert.equal(
    report.corrections,
    0,
    `чистый рейс вошёл в rejoin ${report.corrections} раз; первый: ${JSON.stringify(report.firstCorrection)}`,
  );
  assert.equal(report.correctionActiveAtEnd, false, "rejoin не завершился");
});

test("the journey walks its stages in order to the stand", () => {
  // Сквозной порядок стадий рейса (вопрос Igor, 15.08.2026): прогрев и
  // проверка — взлёт — полёт — заход; пробег и руление к старту живут ВНУТРИ
  // approach (общий словарь журнала не растёт), в телеметрии руление показано
  // своим состоянием («Руление к старту»), а docked наступает предикатом
  // прибытия — он подтверждён стоянкой у стартовой точки в тесте посадки.
  const { report } = flight;
  assert.deepEqual(
    report.stages,
    ["attention", "departure", "cruise", "approach"],
    `стадии шли ${report.stages.join(" → ")}`,
  );
});

test("the steady circuit sits on the line, not beside it", () => {
  const { report } = flight;
  const bias = report.circuitBiasSum / Math.max(0.1, report.circuitBiasSeconds);
  // Постоянное смещение — не допуск, а смещённое равновесие закона. Планка
  // вплотную к замеру (4.1 м после калибровки виражного элерона; остаток —
  // момент киля от рыскания, в выводе крыла не живущий).
  assert.ok(
    Math.abs(bias) < 6,
    `установившееся смещение с линии ${bias.toFixed(1)} м — закон снова кривой`,
  );
});

test("the flight ends on the runway: touchdown, rollout, stop", () => {
  const { report, machine } = flight;
  assert.ok(report.touchdown, "машина не села");
  assert.ok(
    report.touchdown.x > AIRPORT_RUNWAY.westThresholdX &&
      report.touchdown.x < AIRPORT_RUNWAY.eastThresholdX,
    `касание на x=${report.touchdown.x.toFixed(0)} — мимо полосы`,
  );
  assert.ok(
    report.touchdown.x > AIRPORT_RUNWAY.westThresholdX + 8,
    `касание на x=${report.touchdown.x.toFixed(0)} слишком близко к кромке ` +
      `(порог ${AIRPORT_RUNWAY.westThresholdX})`,
  );
  assert.ok(
    report.touchdown.pitch > 0,
    `касание носом вниз: тангаж ${((report.touchdown.pitch * 180) / Math.PI).toFixed(1)}°`,
  );
  // Сантиметровый класс на глиссаде: замер даёт сход 3.0 → 0.3 м монотонно,
  // касание в 30 см от оси. Полуширина полосы (7 м) как допуск прятала бы
  // посадку «в манёвре» с шасси по фонарям — она уже прятала её однажды.
  assert.ok(
    Math.abs(report.touchdown.z - RUNWAY_Z) < 1.5,
    `касание в стороне от оси: z=${report.touchdown.z.toFixed(1)}`,
  );
  // Глиссада 4° на 36 м/с — это 2.5 м/с без выравнивания. Пока машина шла
  // мельче из-за недобора тангажа, сход был мягче порога. Теперь она держит
  // профиль, и порог должен пропускать глиссаду, а не вчерашний просад.
  assert.ok(
    Math.abs(report.touchdownSink) < 3.5,
    `касание со снижением ${report.touchdownSink.toFixed(2)} м/с — это удар`,
  );
  assert.ok(
    report.stopped,
    `машина не завершила руление: центр=${centreOf(machine)
      .map((value) => value.toFixed(1))
      .join("/")} ход=${airStateOf(machine).groundSpeed.toFixed(2)} ` +
      `курс=${forwardAxis(machine).map((value) => value.toFixed(2)).join("/")} ` +
      `taxi=${machine.taxi?.phase ?? "—"}`,
  );
  // ── ПОЛЁТ ЗАВЕРШЁН НА ТОЧКЕ СТАРТА, НОСОМ НА ВОСТОК ────────────────────
  //
  // После пробега машина сруливает налево (терминал — по правому крылу),
  // прокатывается по ВПП 08 обратным курсом и встаёт на стартовую точку 09 —
  // готовой к следующему вылету. Прокатка по 08 подтверждается следом:
  // машина обязана побывать на её оси.
  assert.ok(
    report.taxiDeepZ < AIRPORT_RUNWAY.centreZ - 40,
    `машина не прокатилась по ВПП 08: минимальный z=${report.taxiDeepZ.toFixed(0)}`,
  );
  assert.ok(
    Math.abs(report.stopped.x - AIRPORT_RUNWAY.westDesignatorX) < 8 &&
      Math.abs(report.stopped.z - RUNWAY_Z) < 3,
    `стоянка (${report.stopped.x.toFixed(1)}, ${report.stopped.z.toFixed(1)}) — не у стартовой точки`,
  );
});

test("the gear carries the flight without punching through its stop", () => {
  const { report, machine } = flight;
  const weight = machine.mass.mass * 9.81;
  // Потолок перегрузки объявлен стойкой (`compressedLoadFactor`). Пробитый
  // упор означает, что остаток удара принял корпус, а это уже разрушение.
  assert.ok(
    report.peakStrutLoad < weight * 5,
    `реакция стойки ${(report.peakStrutLoad / weight).toFixed(1)} веса — упор пробит`,
  );
  assert.ok(report.peakStrutLoad > weight * 0.3, "стойки вообще не нагружались");
});

test("the approach is flown at approach speed, not at cruise", () => {
  const { plan } = flight;
  const onFinal = plan.speedLimit((plan.finalFrom + 1) / 2);
  assert.ok(
    onFinal <= DC3_APPROACH_SPEED + 0.01,
    `на створе полка ${onFinal.toFixed(1)} выше скорости захода`,
  );
});

// ---------------------------------------------------------------------------
// РАЗБЕГ: НИЧТО НЕ ИМЕЕТ ПРАВА ЕГО ТОРМОЗИТЬ
// ---------------------------------------------------------------------------

test("nothing brakes the takeoff roll: no wheel brakes, no reverse, no flap jump", () => {
  const plan = dc3AirportPlan("survey", BERTH);
  const machine = createAirplane({
    startPoint: [BERTH[0], AIRPORT_RUNWAY_TOP_Y + 2.678, RUNWAY_Z],
    startVelocity: [0, 0, 0],
    startNose: [1, 0, 0],
  });
  let progress = 0;
  let previous = centreOf(machine);
  let worstBrake = 0;
  let worstReverse = 0;
  let flapLow = Infinity;
  let flapHigh = -Infinity;
  const approach = {
    heading: [islandAirportDc3Frame.nose[0], islandAirportDc3Frame.nose[2]],
    tolerance: { position: 12, heading: 0.16, speed: 40 },
  };
  for (let index = 0; index < Math.round(20 / dt); index += 1) {
    const centre = centreOf(machine);
    const air = airStateOf(machine);
    const travelled = Math.hypot(centre[0] - previous[0], centre[2] - previous[2]);
    previous = centre;
    progress = advanceVehicleRouteProgress(plan, progress, centre, travelled);
    const commanded = autopilot(
      plan,
      progress,
      [centre[0], centre[1], centre[2]],
      machine.state.orientation,
      machine.state.velocity,
      machine.state.angularVelocity,
      shipModelFor(machine),
      1,
      machine.vehicle.nose,
      approach,
      null,
    );
    const step = stepAirplane(
      machine,
      commanded.guidance,
      "departure",
    );
    // Разбег кончается отрывом: дальше законы другие.
    if (machine.supportContacts === 0 && centre[1] - machine.mass.centre[1] > 1) {
      break;
    }
    worstBrake = Math.max(worstBrake, step.delivered.brake);
    worstReverse = Math.min(worstReverse, step.delivered.throttle[0]);
    if (air.groundSpeed > 3) {
      flapLow = Math.min(flapLow, step.flap);
      flapHigh = Math.max(flapHigh, step.flap);
    }
  }
  assert.equal(
    worstBrake,
    0,
    `колодки на разбеге: ${worstBrake.toFixed(2)} — машина тормозит сама себя`,
  );
  assert.ok(
    worstReverse >= 0,
    `обратный шаг винта на разбеге: ${worstReverse.toFixed(2)}`,
  );
  // Щиток стоит во взлётном положении и не скачет: прыжок на посадочный угол
  // читается как подтормаживание и съедает разбег.
  assert.ok(
    flapHigh - flapLow < 0.1,
    `щиток гулял на разбеге: ${flapLow.toFixed(2)}…${flapHigh.toFixed(2)}`,
  );
});

test("a machine nobody dispatched stays put: no takeoff power, brakes on", () => {
  const machine = createAirplane({
    startPoint: [BERTH[0], AIRPORT_RUNWAY_TOP_Y + 2.678, RUNWAY_Z],
    startVelocity: [0, 0, 0],
    startNose: [1, 0, 0],
  });
  const start = centreOf(machine);
  let worstThrottle = 0;
  let leastBrake = 1;
  for (let index = 0; index < Math.round(20 / dt); index += 1) {
    // Ни рейса, ни команды — ровно то, что видит машина на старте сцены.
    // Рейса нет — журнал говорит `docked`, ровно как на старте сцены.
    const step = stepAirplane(
      machine,
      { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, liftFraction: 0 },
      "docked",
    );
    if (machine.supportContacts > 0) {
      worstThrottle = Math.max(worstThrottle, step.delivered.throttle[0]);
      leastBrake = Math.min(leastBrake, step.delivered.brake);
    }
  }
  const centre = centreOf(machine);
  const travelled = Math.hypot(centre[0] - start[0], centre[2] - start[2]);
  // ВЗЛЁТ — ПО КОМАНДЕ. Признак «низко над землёй» командой не является:
  // на нём машина уезжала взлетать сама, едва сцена загрузилась.
  assert.ok(
    travelled < 0.5,
    `неотправленная машина проехала ${travelled.toFixed(1)} м`,
  );
  assert.equal(worstThrottle, 0, "неотправленная машина давала газ");
  assert.equal(leastBrake, 1, "стоящая машина обязана держаться тормозом");
});
