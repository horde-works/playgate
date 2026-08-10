import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  combatHexacopterRangeBlueprint,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { rangeVertipadCompilation } from "../games/make-a-mess/src/game/combatHexacopterRangeScene.ts";
import {

  RANGE_HEXACOPTER_PAD_TOP_Y,
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_Z,
} from "../games/make-a-mess/src/game/rangeHexacopter.ts";
import { rangeHexacopterPlan } from "../games/make-a-mess/src/game/rangeHexacopterRoutes.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import {
  DUCT_HEXACOPTER_RANGE_BERTH,
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
} from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import { ductHexacopterLapPlan } from "../games/make-a-mess/src/game/ductHexacopterRangeRoutes.ts";
import {
  advanceRouteFigureFrame,
  IDLE_ROUTE_FIGURE,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  advanceVehicleRouteProgress,
  autopilot,
  rotateVector,
} from "../games/make-a-mess/src/game/vehicleFrames.ts";
import {
  deliveredCommandValue,
  executeCommandActuators,
} from "../games/make-a-mess/src/game/vehicleActuation.ts";
import {
  centreOf,
  createMachine,
  dt,
  forwardAxis,
  GRAVITY,
  stepMachine,
  toWorld,
} from "./rotorcraft-rig.mjs";
import {
  liftHoldVerdict,
  rotorLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import {
  blastEnergyAtDistance,
  explosiveProfile,
  fractureEnergyByMaterial,
  MG_RANGE,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";
import {
  createAirCombatState,
  stepAirCombat,
} from "../games/make-a-mess/src/game/airCombatPilot.ts";
import {
  TONKAWA_ALLEGIANCE,
  TOWN_ALLEGIANCE,
  YAQUI_ALLEGIANCE,
} from "../games/make-a-mess/src/game/vehicleAllegiance.ts";
import {
  deflectHorizontally,
  harmonisedLaunchDirection,
} from "../games/make-a-mess/src/game/vehicleGunnery.ts";

/**
 * СТЕНД ВОЗДУШНОГО БОЯ: две настоящие машины на настоящих силах.
 *
 * Ни одна величина здесь не подставляется: масса и центр масс сняты со
 * скомпилированной сцены, наведение считает `stepAirCombat` у атакующего и
 * общий `autopilot` у цели, силы — `rotorcraftFlightStep`, движение —
 * `stepBody`, всё на 60 Гц. Единственное, чего нет, — Rapier: попадания
 * разрешаются геометрией по кускам цели в её живой позе. Это ровно та граница,
 * которую просил Igor: «прогонять тестами на реальном коде, а не в браузере».
 *
 * ЖИВУЧЕСТЬ — ЧЛЕНСТВО В ТЕЛЕ, и ничего больше. Попадание вычёркивает кусок из
 * `attached`, дальше всё происходит само: актуатор недодаёт, `feedback`
 * учится, тяга кольца падает, и когда центр масс выходит за выпуклую оболочку
 * живых колец — машина падает. Никаких очков здоровья не заведено.
 */

const STEEL_CARVE = fractureEnergyByMaterial.steel * 1.15;

// ---------------------------------------------------------------------------
// Живучесть: доля уцелевших лопастей кольца
// ---------------------------------------------------------------------------

/**
 * ЖИВУЧЕСТЬ КОЛЬЦА СПРАШИВАЕТСЯ У АКТУАТОРА, А НЕ СЧИТАЕТСЯ ПО ЛОПАСТЯМ.
 *
 * Первая версия стенда делила уцелевшие лопасти на общее их число — и врала.
 * Канал `throttle:N` держат восемь кусков, из которых ПЯТЬ обязательны:
 * четыре статора и ступица, и все они сидят В КОЛЬЦЕВОМ КОЖУХЕ. Потеря любого
 * обязательного куска снимает кольцо целиком, а сами лопасти горизонтальному
 * огню недоступны — их закрывает кожух.
 *
 * Отсюда и родился ложный вывод предыдущего прогона («пушка бесполезна»):
 * 55 попаданий давали ноль колец только потому, что стенд смотрел не туда.
 * Правильный ответ уже есть в рантайме — им и спрашиваем.
 */
function ringAvailability(m) {
  const actuation = executeCommandActuators(
    m.actuators,
    m.attached,
    Object.fromEntries(
      m.flight.limits.enginePoints.map((_, index) => [`throttle:${index}`, 1]),
    ),
  );
  return m.flight.limits.enginePoints.map((_, index) =>
    deliveredCommandValue(actuation, `throttle:${index}`, 1),
  );
}

/**
 * Что уносит одиночная пуля. Правило разрушения: тонкая деталь гибнет от
 * любого состоявшегося carve целиком, толстая получает пробоину. Порог — по
 * наименьшему размеру куска.
 */
const BULLET_KILLS_THINNER_THAN = 0.06;

function bulletDestroys(piece) {
  return Math.min(piece.size[0], piece.size[1], piece.size[2]) < BULLET_KILLS_THINNER_THAN;
}

/** Центр обязательных кусков канала `throttle:i` в живой позе машины. */
function requiredChannelCentres(m) {
  return m.flight.limits.enginePoints.map((fallback, ring) => {
    const marker = `:${ring}:`;
    const parts = m.pieces.filter(
      (piece) =>
        piece.actuator?.required &&
        piece.actuator.commandChannel === `throttle:${ring}` &&
        piece.id.includes(marker),
    );
    if (parts.length === 0) {
      return toWorld(m, fallback);
    }
    const sum = parts.reduce(
      (acc, piece) => [
        acc[0] + piece.position[0],
        acc[1] + piece.position[1],
        acc[2] + piece.position[2],
      ],
      [0, 0, 0],
    );
    return toWorld(m, sum.map((value) => value / parts.length));
  });
}

function liftVerdict(m) {
  const available = ringAvailability(m);
  return liftHoldVerdict(
    "rotor",
    m.flight.limits.enginePoints.map((point, index) => ({
      point,
      available: available[index],
    })),
    m.mass.centre,
    (m.mass.mass * GRAVITY * m.flight.liftReserve) /
      m.flight.limits.enginePoints.length,
    m.mass.mass * GRAVITY,
  );
}

// ---------------------------------------------------------------------------
// Разрешение попаданий по кускам цели в её живой позе
// ---------------------------------------------------------------------------

function livePieces(target) {
  const centre = centreOf(target);
  return target.pieces
    .filter((piece) => target.attached.has(piece.id))
    .map((piece) => {
      const offset = rotateVector(target.state.orientation, [
        piece.position[0] - target.mass.centre[0],
        piece.position[1] - target.mass.centre[1],
        piece.position[2] - target.mass.centre[2],
      ]);
      return {
        id: piece.id,
        size: piece.size,
        centre: [
          centre[0] + offset[0],
          centre[1] + offset[1],
          centre[2] + offset[2],
        ],
        radius: Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2,
      };
    });
}

/** Ближайший кусок, который пересекает луч. */
function rayHit(origin, direction, pieces, maximumRange) {
  let best = null;
  for (const piece of pieces) {
    const dx = piece.centre[0] - origin[0];
    const dy = piece.centre[1] - origin[1];
    const dz = piece.centre[2] - origin[2];
    const along = dx * direction[0] + dy * direction[1] + dz * direction[2];
    if (along <= 0 || along > maximumRange) {
      continue;
    }
    const perpendicular = Math.sqrt(
      Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
    );
    if (perpendicular > piece.radius) {
      continue;
    }
    if (!best || along < best.along) {
      best = { id: piece.id, along, perpendicular };
    }
  }
  return best;
}

/** Радиус, на котором боеприпас ещё вскрывает сталь. */
function steelReach(kind) {
  const profile = explosiveProfile(kind);
  let reach = 0;
  for (let d = 0; d <= profile.blastRadius; d += 0.005) {
    if (
      blastEnergyAtDistance(d, profile.blastRadius, profile.damageEnergy) >
      STEEL_CARVE
    ) {
      reach = d;
    }
  }
  return reach;
}

const POD_REACH = steelReach("podRocket");

// ---------------------------------------------------------------------------
// Дуэль
// ---------------------------------------------------------------------------

const raxVehicle = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const hx6Vehicle = airVehicles.find((entry) => entry.id === "town-hexacopter");
const raxPieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
  new Map(),
).clusters[0].pieces;
// Кластер сохранил ГОРОДСКОЙ идентификатор: вертипад переехал на полигон
// чистой трансляцией, и `RANGE_HEXACOPTER_CLUSTER_ID` — имя площадки, а не
// машины. Берём его из паспорта самой машины, чтобы не разойтись.
const hx6Pieces = rangeVertipadCompilation.clusters.find(
  (cluster) => cluster.id === hx6Vehicle.clusterId,
).pieces;

const vx8Vehicle = airVehicles.find((entry) => entry.id === "duct-hexacopter");
const vx8Pieces = compileSceneGroups(
  ductHexacopterRangePadDocument,
  new Map(),
).clusters.find(
  (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
).pieces;

/**
 * КОГО ГОНЯЮТ. Две цели, и они разные не размером, а ПОВЕДЕНИЕМ.
 *
 * HX-6 — гость города: он идёт по маршруту и ничего не предпринимает. Это
 * нижняя граница, на ней проверяется сам механизм боя.
 *
 * VX-8 — соседняя боевая машина, и с ней бой другой по существу. Она вдвое
 * тяжелее, идёт по прямым до тридцати метров в секунду и — главное — КРУТИТ
 * ФИГУРЫ. Кульбит в её программе стоит как номер показа, но в бою он читается
 * иначе: машина тормозит с пяти с половиной g, уходит вверх и разворачивается
 * через нос. Преследователь, взявший обязательство на заход, в этот момент
 * проскакивает мимо. Стенд обязан это видеть, а видеть он это может, только
 * если слой фигур у цели РАБОТАЕТ, — иначе VX-8 отличается от HX-6 одной
 * скоростью и стенд проверяет не то.
 */
const TARGETS = {
  hx6: {
    id: "hx6",
    vehicle: hx6Vehicle,
    pieces: hx6Pieces,
    allegiance: TOWN_ALLEGIANCE,
    berth: [
      RANGE_HEXACOPTER_PAD_X,
      RANGE_HEXACOPTER_PAD_TOP_Y,
      RANGE_HEXACOPTER_PAD_Z,
    ],
    plan: (kind, berth) => rangeHexacopterPlan(kind, berth),
    figures: false,
  },
  vx8: {
    id: "vx8",
    vehicle: vx8Vehicle,
    pieces: vx8Pieces,
    allegiance: YAQUI_ALLEGIANCE,
    berth: DUCT_HEXACOPTER_RANGE_BERTH,
    plan: (_kind, berth) => ductHexacopterLapPlan(berth),
    figures: true,
  },
};

const armament = combatHexacopterRangeBlueprint.armament;

const STATION = {
  centre: [0, 0.08, 0],
  radius: 46,
  altitude: 26,
  speed: 16,
  detectionRange: 150,
};

const LIMITS = {
  maximumSpeed: 21,
  yawRate: 0.72,
  liftTrimRange: combatHexacopterRangeBlueprint.flight.liftTrimRange,
  lateralAcceleration:
    GRAVITY * Math.tan(combatHexacopterRangeBlueprint.flight.maximumTilt),
  reversal: { seconds: 5.1, cost: 0 },
};

const HX6_BERTH = [
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_TOP_Y,
  RANGE_HEXACOPTER_PAD_Z,
];

export function runDuel({
  seconds = 120,
  targetKind = "evasive",
  /** Кого гонять: `hx6` (гость города) или `vx8` (соседняя боевая машина). */
  target: targetName = "hx6",
  startProgress = 0.22,
  collect = false,
} = {}) {
  const profile = TARGETS[targetName];
  if (!profile) {
    throw new Error(`нет такой цели: ${targetName}`);
  }
  const plan = profile.plan(targetKind, profile.berth);
  const startPoint = plan.point(startProgress);
  const ahead = plan.point(Math.min(1, startProgress + 0.004));
  const tangent = [
    ahead[0] - startPoint[0],
    0,
    ahead[2] - startPoint[2],
  ];
  const tangentLength = Math.hypot(tangent[0], tangent[2]) || 1;
  const cruise = plan.speedLimit(startProgress);
  const target = createMachine({
    pieces: profile.pieces,
    vehicle: profile.vehicle,
    startPoint,
    startVelocity: [
      (tangent[0] / tangentLength) * cruise,
      0,
      (tangent[2] / tangentLength) * cruise,
    ],
    startNose: [tangent[0] / tangentLength, 0, tangent[2] / tangentLength],
  });

  // Атакующий стоит на своей орбите и уже на ходу: взлёт — не предмет этого
  // стенда, он проверен отдельно.
  const hunterStart = [0, STATION.centre[1] + STATION.altitude, -STATION.radius];
  const hunter = createMachine({
    pieces: raxPieces,
    vehicle: raxVehicle,
    startPoint: hunterStart,
    startVelocity: [STATION.speed, 0, 0],
    startNose: [1, 0, 0],
  });

  let combat = createAirCombatState(armament.rockets.mounts.length);
  let targetFigures = IDLE_ROUTE_FIGURE;
  let targetFrozen = null;
  let progress = startProgress;
  const rockets = [];
  const report = {
    cannonShots: 0,
    cannonHits: 0,
    cannonBladeKills: 0,
    rocketsFired: 0,
    rocketHits: 0,
    rocketBladeKills: 0,
    rocketMisses: [],
    passes: 0,
    modeSeconds: {},
    minimumRangeBlocks: 0,
    selfDamage: 0,
    outcome: "survived",
    // САМАЯ ДАЛЬНЯЯ ТОЧКА, КУДА ЧТО-ЛИБО УЛЕТЕЛО, м от центра полигона.
    //
    // Меряется затем, что видимое небо — купол КОНЕЧНОГО радиуса, и всё, что
    // вышло за него, оказывается нарисовано на пустоте. У машин предел задан
    // трассой и известен заранее; у промахнувшейся ракеты — нет: она летит,
    // пока не кончится взрыватель, и это 173 м ОТ ТОЧКИ ПУСКА.
    targetFigures: [],
    temperAppetite: 0,
    temperFrustration: 0,
    approachesUsed: 0,
    shotsWhileCommitted: 0,
    rocketsAtCommitted: 0,
    rocketHitsAtCommitted: 0,
    shotsWhileFree: 0,
    targetSkips: [],
    reachMachines: 0,
    reachRockets: 0,
    ceilingMachines: 0,
    ceilingRockets: 0,
    seconds: 0,
    firstBloodAt: null,
    killAt: null,
    ringsLost: 0,
    destroyed: [],
    samples: [],
  };
  let previousTargetVelocity = [...target.state.velocity];
  // Попадания, случившиеся в этом кадре: докладываются автомату следующим.
  let pendingHits = 0;
  // Снятые куски — отдельно от касаний: заход удался, если что-то оторвал.
  let pendingWounds = 0;
  // Сколько РАЗНЫХ подходов зверь испробовал за бой. Прежде их было два и они
  // чередовались счётчиком; теперь их выбирает досада, и число обязано вырасти.
  const approachesSeen = new Set();

  for (let step = 0; step < seconds * 60; step += 1) {
    const now = step * dt;

    // --- цель идёт по своему маршруту -------------------------------------
    const targetCentre = centreOf(target);
    const targetPiloted = autopilot(
      plan,
      progress,
      targetCentre,
      target.state.orientation,
      target.state.velocity,
      target.state.angularVelocity,
      target.yawRateLimits
        ? { ...target.model, engineAvailability: target.feedback, yawRateLimits: target.yawRateLimits }
        : { ...target.model, engineAvailability: target.feedback },
      1,
      target.vehicle.nose,
      target.flight.approach,
    );
    // ПОРЯДОК КАДРА У ЦЕЛИ БЕЗ ФИГУР ОСТАЁТСЯ ПРЕЖНИМ, и это не педантизм:
    // сперва шаг, потом продвижение трассы по НОВОМУ центру. Общая
    // перестановка ради слоя фигур сдвинула кадр на шаг и перевернула
    // сравнение маршрутов — злой круг стал легче ровного.
    //
    // Машине с фигурами порядок нужен другой — тот, которым живёт рантайм:
    // трасса двигается сама, фигура откатывает её назад, и только потом шаг.
    if (profile.figures) {
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        targetCentre,
        Math.hypot(target.state.velocity[0], target.state.velocity[2]) * dt,
      );
      const figured = advanceRouteFigureFrame({
        state: targetFigures,
        frozenProgress: targetFrozen,
        stations: plan.figures,
        berthAltitude: plan.point(1)[1],
        progress,
        attitude: target.state.orientation,
        centre: targetCentre,
        velocity: target.state.velocity,
        bodyNose: target.vehicle.nose,
        machine: target.machine,
        authority: Math.min(...target.feedback),
        deltaSeconds: dt,
      });
      if (figured.state.skipped && figured.state.skipped !== targetFigures.skipped) {
        report.targetSkips.push(figured.state.skipped);
      }
      if (figured.state.station && !targetFigures.station) {
        report.targetFigures.push({
          key: figured.state.station.key,
          at: now,
        });
      }
      targetFigures = figured.state;
      targetFrozen = figured.frozenProgress;
      progress = figured.progress;
      stepMachine(target, figured.guidance ?? targetPiloted.guidance);
    } else {
      stepMachine(target, targetPiloted.guidance);
      progress = advanceVehicleRouteProgress(
        plan,
        progress,
        centreOf(target),
        Math.hypot(target.state.velocity[0], target.state.velocity[2]) * dt,
      );
    }
    if (progress >= 0.92) {
      progress = 0.14;
    }

    // --- что атакующий видит ----------------------------------------------
    const verdict = liftVerdict(target);
    const liftState = rotorLiftState(verdict);
    const failed = liftState !== "flying";
    const liveTargetCentre = centreOf(target);
    // Темп разворота вектора скорости — «текущий манёвр», и ничего сверх.
    const previousHeading = Math.atan2(previousTargetVelocity[0], previousTargetVelocity[2]);
    const heading = Math.atan2(target.state.velocity[0], target.state.velocity[2]);
    let headingDelta = heading - previousHeading;
    while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
    while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
    previousTargetVelocity = [...target.state.velocity];

    const track = {
      id: profile.id,
      allegiance: profile.allegiance,
      centre: liveTargetCentre,
      velocity: [...target.state.velocity],
      turnRate: headingDelta / dt,
      radius: target.radius,
      // УЯЗВИМАЯ ТОЧКА — НЕ ЦЕНТР ДИСКА, А ТО, БЕЗ ЧЕГО КАНАЛ МЁРТВ.
      // Обязательные куски канала (статоры и цапфа) и есть слабое место;
      // атакующий видит машину целиком и вправе целиться именно туда.
      weakPoints: requiredChannelCentres(target).map((point, index) => ({
        point,
        health: ringAvailability(target)[index],
      })),
      landed: false,
      failed,
    };

    const hunterCentre = centreOf(hunter);
    // ВЫНОС МАШИН — от центра полигона, а не от чьего-то пада: небо рисуется
    // вокруг мира, и мерить его надо тем же центром, каким оно построено.
    report.reachMachines = Math.max(
      report.reachMachines,
      Math.hypot(hunterCentre[0], hunterCentre[2]),
      Math.hypot(liveTargetCentre[0], liveTargetCentre[2]),
    );
    report.ceilingMachines = Math.max(
      report.ceilingMachines,
      hunterCentre[1],
      liveTargetCentre[1],
    );
    const hunterNoseAxis = forwardAxis(hunter);
    const flatNose = Math.hypot(hunterNoseAxis[0], hunterNoseAxis[2]) || 1;
    const output = stepAirCombat({
      own: {
        allegiance: TONKAWA_ALLEGIANCE,
        centre: hunterCentre,
        velocity: [...hunter.state.velocity],
        nose: [hunterNoseAxis[0] / flatNose, hunterNoseAxis[2] / flatNose],
        gunAxis: hunterNoseAxis,
        verticalSpeed: hunter.state.velocity[1],
        radius: hunter.radius,
      },
      station: STATION,
      armament,
      limits: LIMITS,
      tracks: [track],
      deltaSeconds: dt,
      state: combat,
      // ПОПАДАНИЯ ДОКЛАДЫВАЮТСЯ СЛЕДУЮЩИМ КАДРОМ, и иначе не выйдет: стволы
      // разрешает мир, а мир считает их ниже по этому же циклу. Кадр
      // запаздывания нрав переживает — он живёт секундами, а не кадрами.
      hits: pendingHits,
      wounds: pendingWounds,
    });
    pendingHits = 0;
    pendingWounds = 0;
    combat = output.state;
    stepMachine(hunter, output.guidance);

    report.modeSeconds[combat.mode] = (report.modeSeconds[combat.mode] ?? 0) + dt;
    approachesSeen.add(`${combat.passSide}:${combat.passVertical}`);
    if (process.env.DUEL_TRACE && step % 30 === 0) {
      console.log(
        `${now.toFixed(1)}s ${combat.mode.padEnd(10)} man=${String(output.telemetry.manoeuvre).padEnd(9)} t=${(output.telemetry.manoeuvreSeconds ?? Infinity).toFixed(1).padStart(5)} rng=${output.telemetry.range.toFixed(0).padStart(4)} tw=${track.turnRate.toFixed(2).padStart(6)} hunterR=${Math.hypot(hunterCentre[0], hunterCentre[2]).toFixed(0).padStart(4)}`,
      );
    }
    if (output.telemetry.weaponsFree && output.telemetry.range < armament.rockets.range) {
      // блокировка пуска собственным радиусом поражения
      if (output.telemetry.range < output.telemetry.minimumRange) {
        report.minimumRangeBlocks += 1;
      }
    }

    // --- выстрелы ----------------------------------------------------------
    const targetPieces = livePieces(target);
    const hunterPieces = livePieces(hunter);
    for (const shot of output.shots) {
      if (targetFigures.episode) {
        report.shotsWhileCommitted += 1;
      } else {
        report.shotsWhileFree += 1;
      }
      if (shot.weapon === "cannon") {
        report.cannonShots += 1;
        const muzzle = toWorld(hunter, armament.cannon.mounts[shot.mountIndex].muzzle);
        const direction = deflectHorizontally(hunterNoseAxis, shot.deflection);
        const hit = rayHit(muzzle, direction, targetPieces, MG_RANGE);
        if (hit) {
          report.cannonHits += 1;
          pendingHits += 1;
          const piece = targetPieces.find((entry) => entry.id === hit.id);
          if (piece && bulletDestroys(piece) && target.attached.has(hit.id)) {
            target.attached.delete(hit.id);
            report.cannonBladeKills += 1;
            pendingWounds += 1;
            report.firstBloodAt ??= now;
          }
        }
      } else {
        report.rocketsFired += 1;
        if (targetFigures.episode) report.rocketsAtCommitted += 1;
        const tube = toWorld(hunter, armament.rockets.mounts[shot.mountIndex].muzzle);
        const direction = deflectHorizontally(
          harmonisedLaunchDirection(
            tube,
            hunterCentre,
            hunterNoseAxis,
            armament.rockets.harmonisationRange,
          ),
          shot.deflection,
        );
        // ТОЧКА СХОДА ВЫНЕСЕНА ВПЕРЁД, как в рантайме: снаряд обязан родиться
        // вне собственного габарита. Стенд обязан спрашивать это у паспорта, а
        // не спавнить в устье — иначе он проверяет не ту машину, что летает.
        const clearance = armament.rockets.launchClearance;
        const launch = [
          tube[0] + direction[0] * clearance,
          tube[1] + direction[1] * clearance,
          tube[2] + direction[2] * clearance,
        ];
        const speed = explosiveProfile(armament.rockets.explosive).projectile.speed;
        rockets.push({
          position: [...launch],
          velocity: [
            direction[0] * speed + hunter.state.velocity[0],
            direction[1] * speed + hunter.state.velocity[1],
            direction[2] * speed + hunter.state.velocity[2],
          ],
          life: explosiveProfile(armament.rockets.explosive).projectile.fuseMs / 1000,
          closest: Infinity,
          // Была ли цель СВЯЗАНА в момент пуска. Тег ставится на ракету, а не
          // считается при подрыве: к тому времени фигура уже кончится, и вопрос
          // «стоило ли стрелять тогда» останется без ответа.
          committed: Boolean(targetFigures.episode),
        });
      }
    }

    // --- полёт ракет -------------------------------------------------------
    for (let index = rockets.length - 1; index >= 0; index -= 1) {
      const rocket = rockets[index];
      const previous = [...rocket.position];
      rocket.position = [
        rocket.position[0] + rocket.velocity[0] * dt,
        rocket.position[1] + rocket.velocity[1] * dt,
        rocket.position[2] + rocket.velocity[2] * dt,
      ];
      rocket.life -= dt;
      report.reachRockets = Math.max(
        report.reachRockets,
        Math.hypot(rocket.position[0], rocket.position[2]),
      );
      report.ceilingRockets = Math.max(report.ceilingRockets, rocket.position[1]);
      // Пролёт разбивается на подшаги: за кадр ракета проходит 1.6 м, а куски
      // цели меньше — без этого быстрая ракета «протыкает» цель насквозь.
      let detonation = null;
      const substeps = 6;
      for (let s = 1; s <= substeps && !detonation; s += 1) {
        const point = [
          previous[0] + (rocket.position[0] - previous[0]) * (s / substeps),
          previous[1] + (rocket.position[1] - previous[1]) * (s / substeps),
          previous[2] + (rocket.position[2] - previous[2]) * (s / substeps),
        ];
        const fuse = explosiveProfile(armament.rockets.explosive).proximityFuse ?? 0;
        // СНАЧАЛА — СВОЯ МАШИНА.
        //
        // Стенд этого не проверял, и потому не поймал главное: снаряд рождался
        // внутри собственного габарита и на манёвре подрывал стрелка. Стенд,
        // который знает геометрию только цели, доказывает половину боя.
        for (const piece of hunterPieces) {
          const distance = Math.hypot(
            piece.centre[0] - point[0],
            piece.centre[1] - point[1],
            piece.centre[2] - point[2],
          );
          if (distance <= piece.radius + fuse) {
            report.selfDamage += 1;
            detonation = point;
            break;
          }
        }
        if (detonation) {
          break;
        }
        for (const piece of targetPieces) {
          const distance = Math.hypot(
            piece.centre[0] - point[0],
            piece.centre[1] - point[1],
            piece.centre[2] - point[2],
          );
          rocket.closest = Math.min(rocket.closest, distance);
          if (distance <= piece.radius + fuse) {
            detonation = point;
            break;
          }
        }
      }
      if (detonation) {
        report.rocketHits += 1;
        pendingHits += 1;
        if (rocket.committed) report.rocketHitsAtCommitted += 1;
        report.firstBloodAt ??= now;
        // Взрыв уносит ЛОПАСТИ в радиусе вскрытия стали и не достаёт дальше.
        for (const piece of targetPieces) {
          if (!target.attached.has(piece.id)) {
            continue;
          }
          const distance = Math.hypot(
            piece.centre[0] - detonation[0],
            piece.centre[1] - detonation[1],
            piece.centre[2] - detonation[2],
          );
          if (distance <= POD_REACH + piece.radius) {
            target.attached.delete(piece.id);
            report.rocketBladeKills += 1;
            pendingWounds += 1;
            report.destroyed.push(piece.id.split(":").slice(2).join(":"));
          }
        }
        // Свой же взрыв на дистанции: помимо прямого подрыва о собственную
        // машину считается и попадание в ударную волну.
        const ownDistance = Math.hypot(
          hunterCentre[0] - detonation[0],
          hunterCentre[1] - detonation[1],
          hunterCentre[2] - detonation[2],
        );
        if (ownDistance < explosiveProfile("podRocket").blastPushRadius + hunter.radius) {
          report.selfDamage += 1;
        }
        rockets.splice(index, 1);
        continue;
      }
      if (rocket.life <= 0) {
        report.rocketMisses.push(rocket.closest);
        rockets.splice(index, 1);
      }
    }

    report.seconds = now;
    report.passes = combat.passes;
    if (collect && step % 3 === 0) {
      report.samples.push({
        t: Number(now.toFixed(2)),
        mode: combat.mode,
        range: Number(output.telemetry.range.toFixed(1)),
        aim: Number(output.telemetry.aimError.toFixed(3)),
        miss: Number(output.telemetry.cannonMiss.toFixed(2)),
        angleOff: Number(output.telemetry.angleOff.toFixed(2)),
        closing: Number(output.telemetry.closingSpeed.toFixed(1)),
        free: output.telemetry.weaponsFree,
        gunY: Number(hunterNoseAxis[1].toFixed(3)),
        ownAlt: Number(hunterCentre[1].toFixed(1)),
        targetAlt: Number(liveTargetCentre[1].toFixed(1)),
        speed: Number(Math.hypot(hunter.state.velocity[0], hunter.state.velocity[2]).toFixed(1)),
        targetRadius: Number(target.radius.toFixed(2)),
        gate: Number(Math.atan(target.radius / Math.max(output.telemetry.range, 1)).toFixed(3)),
        minR: Number(output.telemetry.minimumRange.toFixed(1)),
      });
    }

    if (failed) {
      report.outcome = liftState;
      report.killAt = now;
      report.ringsLost = ringAvailability(target).filter((value) => value < 0.5).length;
      break;
    }
  }
  report.ringsLost = ringAvailability(target).filter((value) => value < 0.5).length;
  report.ringAvailability = ringAvailability(target);
  report.podLeft = combat.gunnery.magazine;
  report.reloadingAtEnd = combat.gunnery.rearmSeconds > 0;
  report.temperAppetite = combat.temper.appetite;
  report.temperFrustration = combat.temper.frustration;
  report.approachesUsed = approachesSeen.size;
  return report;
}

export function summarise(report) {
  const misses = [...report.rocketMisses].sort((a, b) => a - b);
  const median = misses.length ? misses[Math.floor(misses.length / 2)] : null;
  return [
    `исход: ${report.outcome} за ${report.seconds.toFixed(1)} с`,
    `заходов: ${report.passes}`,
    `пушка: ${report.cannonHits}/${report.cannonShots} попаданий` +
      (report.cannonShots ? ` (${((report.cannonHits / report.cannonShots) * 100).toFixed(0)}%)` : ""),
    `лопастей пушкой: ${report.cannonBladeKills}`,
    `ракеты: ${report.rocketHits}/${report.rocketsFired}` +
      (report.rocketsFired ? ` (${((report.rocketHits / report.rocketsFired) * 100).toFixed(0)}%)` : ""),
    `лопастей ракетами: ${report.rocketBladeKills}`,
    `медиана промаха ракет: ${median === null ? "—" : `${median.toFixed(1)} м`}`,
    `первое попадание: ${report.firstBloodAt === null ? "—" : `${report.firstBloodAt.toFixed(1)} с`}`,
    `кольца: [${(report.ringAvailability ?? []).map((v) => v.toFixed(2)).join(" ")}]`,
    `самоподрыв: ${report.selfDamage}`,
    `под на конец боя: ${report.podLeft ?? "—"}${report.reloadingAtEnd ? " (снаряжается)" : ""}`,
    `фигуры цели: ${
      report.targetFigures.length
        ? report.targetFigures.map((f) => `${f.key}@${f.at.toFixed(0)}с`).join(", ")
        : "—"
    }`,
    `нрав на конец: азарт ${report.temperAppetite.toFixed(2)}, досада ${report.temperFrustration.toFixed(2)}; ` +
      `подходов испробовано ${report.approachesUsed}`,
    `ракеты по связанной: ${report.rocketHitsAtCommitted}/${report.rocketsAtCommitted}` +
      ` против ${report.rocketHits - report.rocketHitsAtCommitted}/${report.rocketsFired - report.rocketsAtCommitted} по свободной`,
    `выстрелов по СВЯЗАННОЙ цели: ${report.shotsWhileCommitted} против ${report.shotsWhileFree} по свободной`,
    `вынос: машины ${report.reachMachines.toFixed(0)} м / потолок ${report.ceilingMachines.toFixed(0)} м; ` +
      `ракеты ${report.reachRockets.toFixed(0)} м / потолок ${report.ceilingRockets.toFixed(0)} м`,
    `режимы: ${Object.entries(report.modeSeconds)
      .map(([mode, value]) => `${mode} ${value.toFixed(0)}с`)
      .join(", ")}`,
  ].join("\n  ");
}

