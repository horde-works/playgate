import assert from "node:assert/strict";
import test from "node:test";
import {
  TOWN_HEXACOPTER_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  TOWN_HEXACOPTER_PILOT_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT_ID,
} from "../games/make-a-mess/src/game/passengerSeats.ts";
import {
  RESTING_BODY,
  massProperties,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  compileCommandActuators,
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  autopilot,
  hullDrag,
  isDockedPose,
  isDockingComplete,
  isMooringCaptureEligible,
  mooringForce,
  rotateVector,
  advanceVehicleRouteProgress,
  vehicleRouteHeading,
  vehicleRotation,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  advanceRotorMotorOutput,
  NEUTRAL_ROTORCRAFT_TRIM,
  rotorcraftCommandsExecute,
  rotorcraftFlightStep,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import { updatePropulsionFeedback } from "../games/make-a-mess/src/game/vehiclePropulsionAutomation.ts";
import {
  assessVehicleTrajectory,
  requestedVehicleTrajectoryMode,
} from "../games/make-a-mess/src/game/vehicleTrajectoryCorrection.ts";
import { DEFAULT_VEHICLE_FAILURE_ENVELOPE } from "../games/make-a-mess/src/game/vehicleFailure.ts";
import { vehicleGuidanceEnvelope } from "../games/make-a-mess/src/game/vehicleGuidanceEnvelope.ts";
import {
  isRotorLandingComplete,
  levelLiftCeiling,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import {
  townHexacopterRoute,
  townHexacopterPlan,
} from "../games/make-a-mess/src/game/townHexacopterRoutes.ts";
import {
  HEXACOPTER_DUCTS,
  hexacopterDuctPoint,
  HEXACOPTER_PAD_X,
  HEXACOPTER_PAD_Z,
  HEXACOPTER_SPAN,
  HEX_CANOPY_TOP_Y,
  HEX_FLOOR_Y,
  HEX_TRUNNION_Y,
  TOWN_HEXACOPTER_CLUSTER_ID,
  TOWN_VERTIPAD_CLUSTER_ID,
  hexacopterPoint,
  isInsideHexacopter,
} from "../games/make-a-mess/src/game/townHexacopter.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

const vehicle = TOWN_HEXACOPTER_AIR_VEHICLE;
const flight = vehicle.flight;
const densityOf = (material) => structuralMaterialProfiles[material].density;

const ship = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_HEXACOPTER_CLUSTER_ID,
);
const pad = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === TOWN_VERTIPAD_CLUSTER_ID,
);
// Рантайм берёт бертом ЦЕНТР МАСС машины (VehicleFrameSystem: `mass.centre`),
// поэтому и высоты маршрута отсчитываются от него, а не от асфальта.
const PAD = [HEXACOPTER_PAD_X, 0, HEXACOPTER_PAD_Z];

// ---------------------------------------------------------------------------
// 1. Конструкция
// ---------------------------------------------------------------------------

test("машина и площадка — разные кластеры, и обе на месте", () => {
  assert.equal(ship.length > 500, true, `кусков машины: ${ship.length}`);
  assert.equal(pad.length > 20, true, `кусков площадки: ${pad.length}`);
  assert.equal(
    ship.some((piece) => piece.clusterId === TOWN_VERTIPAD_CLUSTER_ID),
    false,
  );
});

test("табличка предлагает пустой облёт или ручное управление из целого кресла", () => {
  assert.deepEqual(
    vehicle.departure?.target.actions?.map((action) => action.id),
    ["circuit", "manual"],
  );
  assert.equal(TOWN_HEXACOPTER_PILOT_SEAT.id, TOWN_HEXACOPTER_PILOT_SEAT_ID);
  assert.equal(
    TOWN_HEXACOPTER_PILOT_SEAT.carrierClusterId,
    TOWN_HEXACOPTER_CLUSTER_ID,
  );
  const shipIds = new Set(ship.map((piece) => piece.id));
  for (const pieceId of TOWN_HEXACOPTER_PILOT_SEAT.requiredPieceIds) {
    assert.equal(shipIds.has(pieceId), true, `в кресле нет ${pieceId}`);
  }
});

test("внутри гаснет только свет кабины, а аэронавигационные огни работают всегда", () => {
  const carrierLamps = townScene.lampDefinitions.filter(
    (lamp) => lamp.carrierClusterId === TOWN_HEXACOPTER_CLUSTER_ID,
  );
  const cabinLights = carrierLamps.filter((lamp) => lamp.interior);
  assert.deepEqual(
    cabinLights.map((lamp) => lamp.id),
    ["town-vertipad:hexacopter:console:screen:piece"],
  );

  const navigationLights = carrierLamps.filter((lamp) =>
    lamp.id.includes(":nav-light:") || lamp.id.includes(":canopy:beacon:"),
  );
  assert.equal(navigationLights.length, 4);
  assert.equal(
    navigationLights.some((lamp) => lamp.id.includes(":nav-light:fore:")),
    false,
    "центральный белый огонь снова выглядит третьей фарой",
  );
  for (const lamp of navigationLights) {
    assert.equal(lamp.interior === true, false, `${lamp.id} помечен как свет кабины`);
    assert.equal(lamp.dayIntensityFactor, 1, `${lamp.id} гаснет днём`);
  }
});

test("передние два двигателя несут яркие перекрывающиеся прожекторы", () => {
  const headlights = townScene.spotLightDefinitions.filter(
    (light) =>
      light.carrierClusterId === TOWN_HEXACOPTER_CLUSTER_ID &&
      light.id.includes(":headlight:"),
  );
  assert.equal(headlights.length, 2);
  assert.deepEqual(
    headlights.map((light) => light.id).sort(),
    [
      "town-vertipad:hexacopter:duct:0:headlight:piece",
      "town-vertipad:hexacopter:duct:5:headlight:piece",
    ],
  );
  for (const light of headlights) {
    assert.equal(light.direction[0] < -0.95, true, `${light.id} не смотрит вперёд`);
    assert.equal(
      light.direction[1] < -0.1 && light.direction[1] > -0.25,
      true,
      `${light.id} имеет неавтомобильный наклон`,
    );
    assert.equal(light.dayIntensityFactor, 0);
    assert.equal(
      Math.abs(light.position[1] - (HEX_TRUNNION_Y - 0.06)) < 0.02,
      true,
      `${light.id} не стоит на передней грани двигателя`,
    );
    assert.equal((light.transition?.fadeInSeconds ?? 0) >= 0.5, true);
    assert.equal((light.angle ?? 0) >= 0.3, true, `${light.id} слишком узкая`);
    assert.equal((light.intensity ?? 0) >= 480, true, `${light.id} слишком тусклая`);
    assert.equal((light.distance ?? 0) >= 65, true, `${light.id} светит недалеко`);
    assert.equal(
      (light.visibleBeam?.sourceRadius ?? 0) >= 0.08,
      true,
      `${light.id} начинается остриём, а не раструбом линзы`,
    );
  }
  const separation = Math.hypot(
    headlights[0].position[0] - headlights[1].position[0],
    headlights[0].position[2] - headlights[1].position[2],
  );
  const radiusAtFiveMetres = Math.tan(headlights[0].angle) * 5;
  assert.equal(
    radiusAtFiveMetres * 2 > separation,
    true,
    "конусы прожекторов не перекрываются перед машиной",
  );
});

test("нижнее силовое ребро остаётся стальным, а передняя ванна становится стеклом", () => {
  const lowerFrontGlass = ship.filter((piece) =>
    piece.id.includes(":canopy:lower-glass:"),
  );
  assert.equal(lowerFrontGlass.length, 4);
  assert.equal(
    lowerFrontGlass.every(
      (piece) => piece.material === "darkGlass" && piece.shape === "glassPane",
    ),
    true,
  );
  assert.deepEqual(
    lowerFrontGlass.map((piece) =>
      piece.id.match(/lower-glass:(\d+):(\d+):piece$/)?.slice(1).map(Number),
    ),
    [
      [0, 0],
      [0, 1],
      [11, 0],
      [11, 1],
    ],
  );

  const lowerRing = ship.filter((piece) => piece.id.includes(":floor:sill:"));
  assert.equal(lowerRing.length, 16);
  assert.equal(lowerRing.every((piece) => piece.material === "steel"), true);
});

test("площадка стоит строго справа от дома h2, а не по диагонали к гаражу", () => {
  // Дом h2 — копия исходного дома со сдвигом +56; его продольный центр z=-3.
  assert.equal(HEXACOPTER_PAD_Z, -3);
  // Восточная стена дома x=60.35, ворота гаражного ряда x=77.45. Центр
  // шестиметровой плиты лежит в свободном промежутке с рабочим зазором с обеих
  // сторон, а не у одного из углов.
  assert.equal(HEXACOPTER_PAD_X, 69);
  assert.equal(HEXACOPTER_PAD_X - 3 > 60.35, true);
  assert.equal(HEXACOPTER_PAD_X + 3 < 77.45, true);
});

test("сцена стартует без единого неопёртого куска", () => {
  const unsupported = [...townScene.resolveStructuralCollapse(new Set())];
  assert.deepEqual(unsupported, []);
});

test("разбитый силовой шпангоут роняет ВСЮ машину и не трогает площадку", () => {
  const core = ship.find((piece) => piece.id.endsWith(":core:piece"));
  assert.ok(core, "силовой шпангоут не найден");
  const collapsed = townScene.resolveStructuralCollapse(new Set([core.id]));
  const stillFlying = ship.filter(
    (piece) => piece.id !== core.id && !collapsed.has(piece.id),
  );
  assert.deepEqual(
    stillFlying.map((piece) => piece.id),
    [],
    "после сноса шпангоута куски машины остались висеть",
  );
  const padLost = pad.filter((piece) => collapsed.has(piece.id));
  assert.deepEqual(padLost.map((piece) => piece.id), []);
});

test("площадка не несёт и не держит навесок", () => {
  for (const piece of pad) {
    if (piece.id.includes("edge-lamp") || piece.id.includes("dispatch")) {
      continue;
    }
    assert.equal(
      piece.bearsLoad === false,
      true,
      `${piece.id} может стать опорой корабля`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Масса и развесовка
// ---------------------------------------------------------------------------

const properties = massProperties(ship, densityOf);
const BERTH = properties.centre;
// Масса в единицах проекта (`volume × density`), а не в килограммах СИ:
// эталон для сравнения — дирижабль № 07, у него 148 единиц.
const massUnits = properties.mass;

test("масса и развесовка — одноместной машины, а не грузовика", () => {
  assert.equal(
    massUnits > 70 && massUnits < 120,
    true,
    `масса ${massUnits.toFixed(1)} ед вне паспортного окна 70…120`,
  );
  const offsetX = Math.abs(properties.centre[0] - BERTH[0]);
  const offsetZ = Math.abs(properties.centre[2] - BERTH[2]);
  assert.equal(offsetX < 0.12, true, `продольный разнос ЦМ ${offsetX.toFixed(3)}`);
  assert.equal(offsetZ < 0.06, true, `поперечный разнос ЦМ ${offsetZ.toFixed(3)}`);
});

test("подъёмный центр выше центра масс — у машины есть маятник", () => {
  const arm = vehicle.liftCentre[1] - properties.centre[1];
  assert.equal(arm > 0.12, true, `маятниковое плечо ${arm.toFixed(3)} м`);
});

test("потеря кольца уводит живой центр масс в сторону утраты", () => {
  const lost = new Set(
    ship
      .filter((piece) => piece.id.includes(":duct:3:") || piece.id.includes(":engine:3:"))
      .map((piece) => piece.id),
  );
  assert.equal(lost.size > 20, true);
  const damaged = massProperties(
    ship.filter((piece) => !lost.has(piece.id)),
    densityOf,
  );
  const station = HEXACOPTER_DUCTS[3];
  const lostPoint = hexacopterPoint(station.a, station.b, 0);
  const before = Math.hypot(
    properties.centre[0] - lostPoint[0],
    properties.centre[2] - lostPoint[2],
  );
  const after = Math.hypot(
    damaged.centre[0] - lostPoint[0],
    damaged.centre[2] - lostPoint[2],
  );
  assert.equal(after > before, true, "центр масс не ушёл от утраченного кольца");
});

// ---------------------------------------------------------------------------
// 3. Органы управления
// ---------------------------------------------------------------------------

const actuators = compileCommandActuators(ship);

test("шесть колец — шесть каналов тяги, и никаких других органов", () => {
  const channels = new Set(actuators.map((binding) => binding.commandChannel));
  for (let index = 0; index < 6; index += 1) {
    assert.equal(channels.has(`throttle:${index}`), true, `нет канала ${index}`);
  }
  assert.equal(flight.limits.enginePoints.length, 6);
  // Ни руля, ни балансиров: и курс, и крен, и тангаж коптер делает винтами.
  assert.equal(channels.has("rudder"), false);
  assert.equal(channels.has("trim:pitch"), false);
  assert.equal(channels.has("trim:roll"), false);
  assert.equal(vehicle.trimRails ?? null, null);
  assert.equal(
    ship.some((piece) => piece.id.includes(":trim:")),
    false,
    "на машине остались куски балансировочной установки",
  );
});

test("каждая лопасть — настоящий разрушаемый кусок своего канала", () => {
  const blades = ship.filter((piece) => piece.id.includes(":blade:"));
  assert.equal(blades.length, 18, `лопастей ${blades.length}`);
  for (const blade of blades) {
    assert.ok(blade.actuator, `${blade.id} не размечена как actuator`);
    assert.match(blade.actuator.commandChannel, /^throttle:[0-5]$/);
  }
});

const attachedIds = new Set(ship.map((piece) => piece.id));

function delivered(channel, requested, broken = new Set()) {
  const alive = new Set([...attachedIds].filter((id) => !broken.has(id)));
  const executed = executeCommandActuators(actuators, alive, {
    [channel]: requested,
  });
  return executed
    .filter((entry) => entry.commandChannel === channel)
    .reduce((sum, entry) => sum + entry.delivered, 0);
}

test("потеря лопасти уменьшает доставленную тягу своего кольца", () => {
  const full = delivered("throttle:2", 1);
  const oneBlade = ship.find((piece) => piece.id.includes(":engine:2:blade:0"));
  assert.ok(oneBlade);
  const short = delivered("throttle:2", 1, new Set([oneBlade.id]));
  assert.equal(short < full, true, `${short} должно быть меньше ${full}`);
  assert.equal(short > 0, true, "кольцо с двумя лопастями обязано ещё тянуть");
});

test("mixer проходит через повреждённый актуатор и мотор, затем добирает недостачу", () => {
  const brokenBlade = ship.find((piece) =>
    piece.id.includes(":engine:2:blade:0"),
  );
  assert.ok(brokenBlade);
  const alive = new Set(
    [...attachedIds].filter((pieceId) => pieceId !== brokenBlade.id),
  );
  let feedback = flight.limits.enginePoints.map(() => 1);
  let motorOutput = flight.limits.enginePoints.map(() => 0);
  let trim = NEUTRAL_ROTORCRAFT_TRIM;
  let last = null;
  for (let frame = 0; frame < 60 * 12; frame += 1) {
    last = rotorcraftFlightStep(
      {
        points: flight.limits.enginePoints,
        centreOfMass: properties.centre,
        nose: vehicle.nose,
        mass: properties.mass,
        inertia: [
          properties.inertia[0],
          properties.inertia[4],
          properties.inertia[8],
        ],
        availability: feedback,
        motorOutput,
        liftCapacity: properties.mass * 9.81 * flight.liftReserve,
        maximumTilt: flight.maximumTilt,
      },
      {
        orientation: vehicleRotation(
          { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
          vehicle.nose,
        ),
        centre: properties.centre,
        velocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
      },
      { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0, collective: 0 },
      trim,
      1 / 60,
    );
    const executions = executeCommandActuators(
      actuators,
      alive,
      Object.fromEntries(
        last.result.commandedThrottle.map((value, index) => [
          `throttle:${index}`,
          value,
        ]),
      ),
    );
    const targets = last.result.commandedThrottle.map((value, index) =>
      deliveredCommandValue(executions, `throttle:${index}`, value),
    );
    motorOutput = motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        targets[index],
        1 / 60,
        flight.spoolSeconds,
      ),
    );
    feedback = updatePropulsionFeedback(feedback, executions, motorOutput.length);
    trim = last.trim;
  }
  assert.equal(
    feedback[2] > 0.6 && feedback[2] < 0.7,
    true,
    `актуатор доложил ${feedback[2]}`,
  );
  const healthyCommand =
    last.result.commandedThrottle.reduce(
      (sum, value, index) => sum + (index === 2 ? 0 : value),
      0,
    ) / 5;
  assert.equal(
    last.result.commandedThrottle[2] > healthyCommand,
    true,
    "mixer не компенсировал короткую доставку повреждённого кольца",
  );
  assert.equal(
    last.result.motorOutput[2] < last.result.commandedThrottle[2],
    true,
    "физическая тяга обошла актуатор",
  );
  assert.equal(
    rotorcraftCommandsExecute(last.result.authority),
    true,
    "частичная потеря лопасти ошибочно объявлена потерей управления",
  );
});

test("потеря цапфы обнуляет канал целиком", () => {
  const trunnion = ship.find((piece) => piece.id.includes("yoke:2:trunnion"));
  assert.ok(trunnion, "цапфа не найдена");
  assert.equal(trunnion.actuator.required, true);
  assert.equal(delivered("throttle:2", 1, new Set([trunnion.id])), 0);
});

test("руля у машины нет: рыскание делают только кольца", () => {
  // Мультиротор разворачивается разнотягом винтов. Оперение ему не нужно, и
  // паспорт обязан говорить это прямо, а не изображать перо нулевой силы на
  // несуществующем киле.
  assert.equal(flight.limits.maxRudderForce, 0);
  const channels = new Set(actuators.map((binding) => binding.commandChannel));
  assert.equal(channels.has("rudder"), false, "остался рулевой канал");
  assert.equal(
    ship.some((piece) => /:(fin|rudder|boom):/.test(piece.id)),
    false,
    "на машине остались куски хвостового оперения",
  );
  // Плечи рыскания настоящие и разнесённые: три кольца на борт.
  const arms = flight.limits.enginePoints.map(
    (point) => point[2] - HEXACOPTER_PAD_Z,
  );
  assert.equal(arms.filter((arm) => arm > 0.5).length, 3);
  assert.equal(arms.filter((arm) => arm < -0.5).length, 3);
});

test("лестниц и подножек на машине нет", () => {
  assert.equal(
    ship.some((piece) => /step|ladder|stair/.test(piece.id)),
    false,
  );
});

// ---------------------------------------------------------------------------
// 4. Подъём: доля уцелевших лопастей и есть тяговооружённость
// ---------------------------------------------------------------------------

test("важно не сколько колец потеряно, а какие", () => {
  // Наивная дробь «уцелело пять из шести — осталось пять шестых тяги» неверна.
  // Винт умеет только толкать, поэтому ради нулевого момента машина обязана
  // пригасить и кольцо НАПРОТИВ выбитого. Потолок ровного подъёма считается
  // точно, и из него выходит настоящая история отказов.
  const reserve = flight.liftReserve;
  const blades = ship.filter((piece) => piece.id.includes(vehicle.envelopeMatch));
  assert.equal(blades.length, 18);
  const alive = (...dead) =>
    HEXACOPTER_DUCTS.map((_, index) => (dead.includes(index) ? 0 : 1));
  const ratio = (...dead) =>
    levelLiftCeiling(
      HEXACOPTER_DUCTS.map((station) => hexacopterDuctPoint(station)),
      properties.centre,
      alive(...dead),
    ) * reserve;

  assert.equal(ratio() > 3, true, `целая: ${ratio().toFixed(2)}`);
  assert.equal(ratio(0) > 2, true, `минус одно кольцо: ${ratio(0).toFixed(2)}`);
  // Два НАПРОТИВ друг друга машина переносит почти как одно: оставшаяся
  // четвёрка — две уравновешенные пары, и гасить ради момента нечего.
  assert.equal(ratio(0, 3) > 2, true, `минус два напротив: ${ratio(0, 3).toFixed(2)}`);
  // Два рядом обходятся вдвое дороже — но машина всё ещё летит, ради чего
  // тяговооружённость и поднята.
  assert.equal(ratio(0, 1) > 1, true, `минус два рядом: ${ratio(0, 1).toFixed(2)}`);
  // Три через одно, по сто двадцать градусов, — самая живучая тройка.
  assert.equal(ratio(1, 3, 5) > 1.4, true, `три через одно: ${ratio(1, 3, 5).toFixed(2)}`);
  // Худшая рабочая тройка — пара напротив плюс сосед: садиться ещё может.
  assert.equal(ratio(2, 4, 5) > 1, true, `пара напротив плюс сосед: ${ratio(2, 4, 5).toFixed(2)}`);

  // А вот НАСТОЯЩАЯ граница, и она не про число: если все живые кольца лежат в
  // одной половине круга, центр масс выходит за опору. Ровного подъёма нет
  // вовсе, и никакая мощность этого не купит.
  // Критерий ровно тот же, что у опоры: центр масс должен лежать внутри
  // выпуклой оболочки живых колец. Кольца 2, 3 и 4 стоят в одном секторе —
  // центр вне их треугольника, и ровного подъёма нет вовсе.
  assert.equal(ratio(0, 1, 5) < 0.01, true, `живые в одном секторе: ${ratio(0, 1, 5).toFixed(2)}`);
  // А четвёрка с парой напротив центр накрывает — и держит вес.
  assert.equal(ratio(4, 5) > 1, true, `минус два рядом: ${ratio(4, 5).toFixed(2)}`);
});
// ---------------------------------------------------------------------------
// 5. Маршрут
// ---------------------------------------------------------------------------

test("маршрут начинается и кончается на площадке", () => {
  for (const kind of ["circuit", "tour"]) {
    const plan = townHexacopterPlan(kind, BERTH);
    const start = plan.point(0);
    const dock = plan.point(1);
    assert.equal(Math.hypot(start[0] - PAD[0], start[2] - PAD[2]) < 0.3, true);
    assert.equal(Math.hypot(dock[0] - PAD[0], dock[2] - PAD[2]) < 0.3, true);
    assert.equal(Math.abs(plan.altitude(0) - BERTH[1]) < 0.2, true);
    assert.equal(Math.abs(plan.altitude(1) - BERTH[1]) < 0.2, true);
  }
});

test("взлётный коридор набирает высоту раньше, чем упирается в дома", () => {
  const plan = townHexacopterPlan("circuit", BERTH);
  // Восточная стена h2 находится в 8.65 м по курсу; конёк — на 6.1 м.
  for (let step = 0; step <= 40; step += 1) {
    const progress = (step / 40) * 0.08;
    const point = plan.point(progress);
    const away = Math.hypot(point[0] - BERTH[0], point[2] - BERTH[2]);
    if (away > 6.5) {
      assert.equal(
        point[1] > 6,
        true,
        `на ${away.toFixed(1)} м от площадки высота всего ${point[1].toFixed(1)}`,
      );
    }
    if (away > 11) {
      assert.equal(point[1] > 11.5, true, "не перевалили парапеты вовремя");
    }
  }
});

test("высота непрерывна, а маркеры упорядочены", () => {
  for (const kind of ["circuit", "tour"]) {
    const route = townHexacopterRoute(kind);
    const plan = townHexacopterPlan(kind, BERTH);
    let previous = plan.altitude(0);
    for (let step = 1; step <= 400; step += 1) {
      const altitude = plan.altitude(step / 400);
      assert.equal(
        Math.abs(altitude - previous) < 1.6,
        true,
        `разрыв высоты на ${(step / 400).toFixed(3)}`,
      );
      previous = altitude;
    }
    const departure = route.markerProgress("departureComplete");
    const arriving = route.markerProgress("arriving");
    const final = route.markerProgress("final");
    assert.equal(departure < arriving, true);
    assert.equal(arriving < final, true);
    assert.equal(final < 1, true);
  }
});

test("маршрут остаётся внутри пользовательской оболочки мира", () => {
  const centre = [townScene.worldCenter[0], townScene.worldCenter[1]];
  let maximum = 0;
  for (const kind of ["circuit", "tour"]) {
    const plan = townHexacopterPlan(kind, BERTH);
    for (let step = 0; step <= 600; step += 1) {
      const point = plan.point(step / 600);
      maximum = Math.max(
        maximum,
        Math.hypot(point[0] - centre[0], point[2] - centre[1]),
      );
    }
  }
  const margin = HEXACOPTER_SPAN / 2 + 6;
  assert.equal(
    maximum + margin < townScene.boundaryRadius,
    true,
    `радиус маршрута ${maximum.toFixed(1)} + запас ${margin.toFixed(1)}`,
  );
});

test("финальный участок ведёт к площадке по курсу носа", () => {
  const plan = townHexacopterPlan("circuit", BERTH);
  const [tangentX, tangentZ] = vehicleRouteHeading(plan, 0.995);
  const heading = flight.approach.heading;
  const alignment = tangentX * heading[0] + tangentZ * heading[1];
  assert.equal(
    alignment > Math.cos(flight.approach.tolerance.heading),
    true,
    `касательная финала расходится с курсом швартовки: ${alignment.toFixed(3)}`,
  );
});


test("маршрут САМ объявляет, где машина стоит на земле", () => {
  // Правило «машина на маршруте не имеет права лежать на земле» спрашивает
  // теперь не факт контакта, а требуемую маршрутом высоту. Поэтому взлётный
  // и посадочный участки обязаны честно требовать нуля — иначе стоящая на
  // шасси машина получит «потерял маршрут» прямо на своей площадке, а
  // висящая в метре над пятном не получит ничего.
  const plan = townHexacopterPlan("circuit", BERTH);
  const GROUND = 1.5;
  assert.equal(plan.altitude(0) - BERTH[1] < GROUND, true, "старт не на земле");
  assert.equal(plan.altitude(1) - BERTH[1] < GROUND, true, "финиш не на земле");
  // И столь же честно — что на круге это уже настоящий полёт.
  for (const progress of [0.25, 0.5, 0.75]) {
    assert.equal(
      plan.altitude(progress) - BERTH[1] > GROUND * 4,
      true,
      `на ${progress} маршрут требует всего ${(plan.altitude(progress) - BERTH[1]).toFixed(1)} м`,
    );
  }
  // Участок «на земле» короткий: иначе правило молчит там, где не должно.
  let groundSamples = 0;
  for (let step = 0; step <= 400; step += 1) {
    if (plan.altitude(step / 400) - BERTH[1] < GROUND) {
      groundSamples += 1;
    }
  }
  assert.equal(
    groundSamples < 40,
    true,
    `маршрут считается наземным на ${(groundSamples / 4).toFixed(0)}% длины`,
  );
});

// ---------------------------------------------------------------------------
// 6. Полный рейс силами
// ---------------------------------------------------------------------------

function mooringCapture(state) {
  const arm = rotateVector(state.orientation, [
    vehicle.mooringPoint[0] - properties.centre[0],
    vehicle.mooringPoint[1] - properties.centre[1],
    vehicle.mooringPoint[2] - properties.centre[2],
  ]);
  const point = [
    properties.centre[0] + state.position[0] + arm[0],
    properties.centre[1] + state.position[1] + arm[1],
    properties.centre[2] + state.position[2] + arm[2],
  ];
  const rotational = [
    state.angularVelocity[1] * arm[2] - state.angularVelocity[2] * arm[1],
    state.angularVelocity[2] * arm[0] - state.angularVelocity[0] * arm[2],
    state.angularVelocity[0] * arm[1] - state.angularVelocity[1] * arm[0],
  ];
  return {
    point,
    offset: [
      point[0] - vehicle.mooringPoint[0],
      point[1] - vehicle.mooringPoint[1],
      point[2] - vehicle.mooringPoint[2],
    ],
    velocity: [
      state.velocity[0] + rotational[0],
      state.velocity[1] + rotational[1],
      state.velocity[2] + rotational[2],
    ],
  };
}

function flyCircuit(kind) {
  const plan = townHexacopterPlan(kind, BERTH);
  let state = {
    ...RESTING_BODY,
    position: [0, 0, 0],
    orientation: vehicleRotation(
      { position: [0, 0, 0], yaw: 0, pitch: 0, roll: 0 },
      vehicle.nose,
    ),
  };
  let progress = 0;
  let rotorTrim = NEUTRAL_ROTORCRAFT_TRIM;
  const model = {
    mass: properties.mass,
    inertiaYaw: properties.inertia[4],
    bodyCentre: properties.centre,
    dragLinear: properties.mass * flight.linearDamping,
    dragLateral:
      properties.mass * flight.linearDamping * flight.lateralDragRatio,
    dragAngular: properties.inertia[4] * flight.angularDamping,
    limits: flight.limits,
    engineAvailability: flight.limits.enginePoints.map(() => 1),
  };
  const machine = {
    points: flight.limits.enginePoints,
    centreOfMass: properties.centre,
    nose: vehicle.nose,
    mass: properties.mass,
    inertia: [
      properties.inertia[0],
      properties.inertia[4],
      properties.inertia[8],
    ],
    liftCapacity: properties.mass * 9.81 * flight.liftReserve,
    maximumTilt: flight.maximumTilt,
  };
  const guidance = vehicleGuidanceEnvelope(
    DEFAULT_VEHICLE_FAILURE_ENVELOPE,
    flight.approach,
    flight.limits,
    flight.guidance,
  );
  const dt = 1 / 60;
  let propulsionFeedback = flight.limits.enginePoints.map(() => 1);
  // Рейс начинается после физической предполётной раскрутки. Отдельный тест
  // выше проверяет сам переход от нуля; здесь проверяется весь маршрут через
  // уже работающие актуаторы и инерционные моторы.
  let motorOutput = flight.limits.enginePoints.map(
    () => 1 / flight.liftReserve,
  );
  let flightTime = flight.spoolSeconds;
  let maximumCrossTrack = 0;
  let takeoffClearance = null;
  let arrivalCaptureAltitude = null;
  let finalCorrectionRequest = null;
  let finalGoAroundRequest = null;
  let docked = false;
  for (let step = 0; step < 60 * 420 && !docked; step += 1) {
    const centreNow = [
      properties.centre[0] + state.position[0],
      properties.centre[1] + state.position[1],
      properties.centre[2] + state.position[2],
    ];
    if (plan.verticalArrival && progress >= plan.verticalArrival.from) {
      const assessment = assessVehicleTrajectory(
        plan,
        progress,
        {
          position: centreNow,
          orientation: state.orientation,
          velocity: state.velocity,
          angularVelocity: state.angularVelocity,
        },
        vehicle.nose,
        model,
        guidance,
      );
      const mode = requestedVehicleTrajectoryMode(assessment);
      if (mode !== "authoredRoute" && finalCorrectionRequest === null) {
        finalCorrectionRequest = { mode, assessment };
      }
    }
    const piloted = autopilot(
      plan,
      progress,
      centreNow,
      state.orientation,
      state.velocity,
      state.angularVelocity,
      { ...model, engineAvailability: propulsionFeedback },
      Math.max(
        0,
        Math.min(1, (flightTime - flight.underwaySeconds) / 8),
      ),
      vehicle.nose,
      flight.approach,
    );
    if (
      plan.verticalArrival &&
      progress >= plan.verticalArrival.from &&
      piloted.goAround &&
      finalGoAroundRequest === null
    ) {
      finalGoAroundRequest = {
        progress,
        position: centreNow,
        velocity: state.velocity,
      };
    }
    const rotor = rotorcraftFlightStep(
      { ...machine, availability: propulsionFeedback, motorOutput },
      {
        orientation: state.orientation,
        centre: centreNow,
        velocity: state.velocity,
        angularVelocity: state.angularVelocity,
      },
      {
        forwardSpeed: piloted.guidance.forwardSpeed,
        lateralSpeed: piloted.guidance.lateralSpeed,
        yawRate: piloted.guidance.yawRate,
        collective: piloted.guidance.liftFraction,
      },
      rotorTrim,
      dt,
      0.9,
    );
    rotorTrim = rotor.trim;
    const actuation = executeCommandActuators(
      actuators,
      attachedIds,
      Object.fromEntries(
        rotor.result.commandedThrottle.map((value, index) => [
          `throttle:${index}`,
          value,
        ]),
      ),
    );
    const motorTargets = rotor.result.commandedThrottle.map((value, index) =>
      deliveredCommandValue(actuation, `throttle:${index}`, value),
    );
    motorOutput = motorOutput.map((value, index) =>
      advanceRotorMotorOutput(
        value,
        motorTargets[index],
        dt,
        flight.spoolSeconds,
      ),
    );
    propulsionFeedback = updatePropulsionFeedback(
      propulsionFeedback,
      actuation,
      motorOutput.length,
    );
    const forces = [
      { force: [0, -properties.mass * 9.81, 0], point: centreNow },
      ...rotor.forces,
    ];
    const facing = rotateVector(state.orientation, vehicle.nose);
    const flat = Math.hypot(facing[0], facing[2]) || 1;
    forces.push({
      force: hullDrag(state.velocity, [facing[0] / flat, facing[2] / flat], model),
      point: centreNow,
    });
    if (progress > 0.9) {
      const capture = mooringCapture(state);
      if (
        isMooringCaptureEligible(
          capture.offset,
          state.orientation,
          vehicle.nose,
          flight.approach,
          flight.mooringReach,
        )
      ) {
        forces.push({
          force: mooringForce(
            capture.offset,
            capture.velocity,
            properties.mass,
            flight.mooringReach,
          ),
          point: capture.point,
        });
      }
    }
    const stepped = stepBody(
      { ...state, position: centreNow },
      properties,
      forces,
      { linear: 0, angular: properties.inertia[4] * flight.angularDamping },
      dt,
    );
    state = {
      ...stepped,
      position: stepped.position.map(
        (value, index) => value - properties.centre[index],
      ),
    };
    flightTime += dt;
    if (flightTime >= flight.underwaySeconds) {
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        centreNow,
        Math.hypot(state.velocity[0], state.velocity[2]) * dt,
      );
    }
    if (takeoffClearance === null && -state.position[0] >= 5.7) {
      takeoffClearance = state.position[1];
    }
    if (
      arrivalCaptureAltitude === null &&
      plan.verticalArrival &&
      progress >= plan.verticalArrival.from &&
      Math.hypot(state.position[0], state.position[2]) <=
        plan.verticalArrival.horizontalTolerance
    ) {
      arrivalCaptureAltitude = state.position[1];
    }
    const target = plan.point(progress);
    maximumCrossTrack = Math.max(
      maximumCrossTrack,
      Math.hypot(centreNow[0] - target[0], centreNow[2] - target[2]),
    );
    // Коптер садится, а не швартуется: критерий тот же, что в рантайме.
    const up = rotateVector(state.orientation, [0, 1, 0]);
    docked =
      progress > 0.985 &&
      isRotorLandingComplete(
      flight.landing,
      {
        horizontal: Math.hypot(state.position[0], state.position[2]),
        height: Math.abs(state.position[1]),
      },
      {
        speed: Math.hypot(state.velocity[0], state.velocity[2]),
        verticalSpeed: state.velocity[1],
        uprightCos: up[1],
        angularSpeed: Math.hypot(...state.angularVelocity),
      },
      // Стенд не считает контакт опор; высота у пятна и есть его признак.
      0,
    );
  }
  const capture = mooringCapture(state);
  const forward = rotateVector(state.orientation, vehicle.nose);
  const up = rotateVector(state.orientation, [0, 1, 0]);
  const flat = Math.hypot(forward[0], forward[2]) || 1;
  return {
    progress,
    docked,
    maximumCrossTrack,
    takeoffClearance,
    arrivalCaptureAltitude,
    finalCorrectionRequest,
    finalGoAroundRequest,
    state,
    // Матрица предикатов швартовки — то, что контракт требует записывать
    // вместо «не сел».
    predicates: {
      centreOffset: Math.hypot(state.position[0], state.position[2]),
      position: Math.hypot(capture.offset[0], capture.offset[2]),
      height: Math.abs(capture.offset[1]),
      headingCos:
        (forward[0] * flight.approach.heading[0] +
          forward[2] * flight.approach.heading[1]) / flat,
      speed: Math.hypot(capture.velocity[0], capture.velocity[2]),
      verticalSpeed: Math.abs(capture.velocity[1]),
      uprightCos: up[1],
      angularSpeed: Math.hypot(...state.angularVelocity),
    },
  };
}

const circuit = flyCircuit("circuit");

test("целая машина проходит весь круг силами и садится на своё пятно", () => {
  assert.equal(
    circuit.progress > 0.985,
    true,
    `дошла только до ${(circuit.progress * 100).toFixed(1)}%`,
  );
  // Признаки посадки коптера — те же, по которым её признаёт автоматика
  // настоящего дрона. Курса среди них нет: коптеру безразлично, каким боком
  // он сел, и требовать от него причального курса значит списывать правило
  // с дирижабля.
  assert.equal(
    circuit.predicates.centreOffset <= flight.landing.radius,
    true,
    `села в ${circuit.predicates.centreOffset.toFixed(2)} м от центра пятна`,
  );
  assert.equal(circuit.predicates.height <= flight.landing.height, true);
  assert.equal(circuit.predicates.speed <= flight.landing.speed, true);
  assert.equal(
    circuit.predicates.uprightCos >= flight.landing.uprightCos,
    true,
  );
  assert.equal(
    circuit.predicates.angularSpeed <= flight.landing.angularSpeed,
    true,
  );
  assert.equal(
    circuit.finalCorrectionRequest,
    null,
    `посадку отобрал ${JSON.stringify(circuit.finalCorrectionRequest)}`,
  );
  assert.equal(
    circuit.finalGoAroundRequest,
    null,
    `штатная посадка запросила второй круг ${JSON.stringify(circuit.finalGoAroundRequest)}`,
  );
});

test("до движения к дому машина набирает безопасную высоту", () => {
  assert.notEqual(circuit.takeoffClearance, null, "машина не покинула пятно");
  assert.equal(
    circuit.takeoffClearance > 11,
    true,
    `при пересечении стены набрано только ${circuit.takeoffClearance.toFixed(2)} м`,
  );
});

test("на возвращении машина сначала захватывает пятно, затем садится вертикально", () => {
  assert.notEqual(
    circuit.arrivalCaptureAltitude,
    null,
    "машина не захватила пятно перед снижением",
  );
  assert.equal(
    circuit.arrivalCaptureAltitude > 20,
    true,
    `пятно захвачено уже на высоте ${circuit.arrivalCaptureAltitude.toFixed(2)} м`,
  );
});

test("снос по всему рейсу остаётся в замеренном пределе", () => {
  // Снос набирается один раз — на переходе с прямого взлётного створа на
  // круг; дальше контур держит машину в единицах метров. Порог замерен, а не
  // назначен: при упреждении 27 м максимум по рейсу — 21.4 м, при 38 м
  // машина уходит на 412 м, при 52 м (общих для проекта) — на 71 м.
  assert.equal(
    circuit.maximumCrossTrack < 26,
    true,
    `максимальный снос ${circuit.maximumCrossTrack.toFixed(2)} м`,
  );
});

/**
 * ОТКРЫТЫЙ ПУНКТ. Машина приходит на пятно, гасит ход и замирает примерно в
 * метре от стакана с ошибкой курса около 20°, и в этой позе застревает:
 * причальный захват вооружается только внутри 0.36 рад по курсу, а доворот на
 * месте автопилот просит в размере 0.02 разнотяга, чего не хватает. Руля у
 * машины нет и не должно быть — рыскание её принадлежит кольцам, значит и
 * чинить надо запрос автопилота, а не добавлять машине оперение.
 *
 * Чего делать НЕЛЬЗЯ и что здесь намеренно не сделано: расширить допуск
 * швартовки до фактических 1.2 м. Это ровно тот запрещённый приём
 * («скрывать невозможный манёвр увеличением допусков»), после которого рейс
 * объявляется законченным, пока штырь ещё снаружи стакана.
 *
 * Настоящий владелец причины — доворот на месте у машины без руля. Разбирать
 * его надо в общем автопилоте (§10.3), а не в паспорте этой формы.
 */
test("рейс кончается посадкой на своё пятно", () => {
  assert.equal(
    circuit.docked,
    true,
    Object.entries(circuit.predicates)
      .map(([key, value]) => `${key}=${value.toFixed(3)}`)
      .join(" "),
  );
});

// ---------------------------------------------------------------------------
// 7. Человек
// ---------------------------------------------------------------------------

test("действие «лететь» живёт только внутри кабины", () => {
  const inside = vehicle.passengerFlight.point;
  assert.equal(isInsideHexacopter(inside), true);
  assert.equal(vehicle.passengerFlight.contains(inside), true);
  // Снаружи — у стойки табло, у кольца, под днищем — предложения нет.
  assert.equal(isInsideHexacopter(vehicle.departure.point), false);
  assert.equal(isInsideHexacopter(hexacopterPoint(2.15, 0, 1.7)), false);
  assert.equal(isInsideHexacopter(hexacopterPoint(0, 0, HEX_FLOOR_Y - 0.3)), false);
  assert.equal(isInsideHexacopter(hexacopterPoint(0, 0, HEX_CANOPY_TOP_Y + 0.3)), false);
});

test("беспилотный запуск стоит у площадки, а не в кабине", () => {
  const point = vehicle.departure.point;
  const away = Math.hypot(point[0] - BERTH[0], point[2] - BERTH[2]);
  assert.equal(away > HEXACOPTER_SPAN / 2 - 0.6, true, `стойка в ${away.toFixed(2)} м`);
  assert.notEqual(vehicle.departure.target.id, vehicle.passengerFlight.target.id);
  assert.notEqual(vehicle.departure.target.cue, vehicle.passengerFlight.target.cue);
});
