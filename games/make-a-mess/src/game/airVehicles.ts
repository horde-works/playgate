import {
  departureSignalColor,
  type LampEventState,
  type SceneVector3,
} from "./destructionScene.ts";
import type { EntryInteractionTarget } from "./entryInteraction.ts";
import {
  TONKAWA_ALLEGIANCE,
  YAQUI_ALLEGIANCE,
  TOWN_ALLEGIANCE,
  type VehicleAllegiance,
} from "./vehicleAllegiance.ts";
import type { VehicleRecoveryLifecycle } from "./vehicleFailure.ts";
import type { AirCombatStation } from "./airCombatPilot.ts";
import type { EvasionCapability } from "./airCombatEvasion.ts";
import type { VehicleArmament } from "./vehicleGunnery.ts";
import type { VehicleGuidanceOverrides } from "./vehicleGuidanceEnvelope.ts";
import type {
  RotorLandingTolerance,
  VehicleLiftSource,
} from "./vehicleLiftGeometry.ts";
import {
  emergencyEscapePlan,
  flightPlan,
  skyTrainRoutePhase,
  terminalArrivalPlan,
  type SkyTrainEmergencyEscapeInput,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  SKY_TRAIN_APPROACH,
  SKY_TRAIN_CASTOFF_TIME,
  SKY_TRAIN_DOCKING,
  SKY_TRAIN_LIMITS,
  SKY_TRAIN_PLATFORM_DROP,
  SKY_TRAIN_RIDE_POST,
  SKY_TRAIN_UNDERWAY_TIME,
  RIDE_APPROACH_RADIUS,
  RIDE_RELEASE_RADIUS,
  isInsideCabin,
  townAirshipPoint,
  vehicleFrames,
  type ApproachGate,
  type DockingTolerance,
  type ShipLimits,
  type VehicleFrameDefinition,
} from "./vehicleFrames.ts";
import {
  vikingLongshipTourPhase,
  vikingLongshipTourPlan,
} from "./vikingLongshipRoutes.ts";
import {
  townAirshipArrivalPlan,
  townAirshipEscapePlan,
  townAirshipPlan,
  townAirshipRoutePhase,
  type TownAirshipFlightKind,
} from "./townAirshipRoutes.ts";
import {
  basaltSkyRamArrivalPlan,
  basaltSkyRamEscapePlan,
  basaltSkyRamPlan,
  basaltSkyRamRoutePhase,
  type BasaltSkyRamFlightKind,
} from "./basaltSkyRamRoutes.ts";
import { basaltSkyRamPoint } from "./basaltSkyRam.ts";
import {
  HEXACOPTER_DUCTS,
  HEXACOPTER_RUDDER_POINT,
  HEX_DISC_Y,
  hexacopterDuctPoint,
  hexacopterPoint,
  isInsideHexacopter,
} from "./townHexacopter.ts";
import {
  townHexacopterArrivalPlan,
  townHexacopterEscapePlan,
  townHexacopterPlan,
  townHexacopterRoutePhase,
  type TownHexacopterFlightKind,
} from "./townHexacopterRoutes.ts";
import {
  isInsideRangeHexacopter,
  rangeHexacopterPoint,
  rangeHexacopterPointFromTown,
} from "./rangeHexacopter.ts";
import {
  rangeHexacopterArrivalPlan,
  rangeHexacopterPlan,
  rangeHexacopterRoutePhase,
  type RangeHexacopterFlightKind,
} from "./rangeHexacopterRoutes.ts";
import {
  NIMBUS_HEXACOPTER_NOSE,
  NIMBUS_HEXACOPTER_RUDDER_POINT,
  isInsideNimbusHexacopter,
  nimbusHexacopterPoint,
  nimbusHexacopterPointFromTown,
} from "./nimbusHexacopter.ts";
import {
  nimbusHexacopterArrivalPlan,
  nimbusHexacopterEscapePlan,
  nimbusHexacopterPlan,
  nimbusHexacopterRoutePhase,
  type NimbusHexacopterFlightKind,
} from "./nimbusHexacopterRoutes.ts";
import {
  SR6_SKAT_DISPATCH_POINT,
  SR6_SKAT_ENGINE_POINTS,
  SR6_SKAT_PASSENGER_DROP_POINT,
  SR6_SKAT_ROTOR_CAPACITY_WEIGHTS,
  SR6_SKAT_ROTOR_SPIN_DIRECTIONS,
  SR6_SKAT_RUDDER_POINT,
} from "./sr6Skat.ts";
import {
  sr6SkatArrivalPlan,
  sr6SkatEscapePlan,
  sr6SkatPlan,
  sr6SkatRoutePhase,
} from "./sr6SkatRoutes.ts";
import {
  COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT,
  combatHexacopterRangeBlueprint,
  combatHexacopterRangeFrame,
} from "./combatHexacopter.ts";
import { DUCT_HEXACOPTER_PROPOSED_LIMITS } from "./ductHexacopter.ts";
import {
  DUCT_HEXACOPTER_RANGE_DISPATCH_POINT,
  DUCT_HEXACOPTER_RANGE_LIMITS,
  ductHexacopterRangeBlueprint,
  ductHexacopterRangeFrame,
  ductHexacopterRangeYawThrusters,
} from "./rangeDuctHexacopter.ts";
import {
  ductHexacopterArrivalPlan,
  ductHexacopterEscapePlan,
  ductHexacopterLapPhase,
  ductHexacopterLapPlan,
} from "./ductHexacopterRangeRoutes.ts";
import {
  combatHexacopterGuardPhase,
  combatHexacopterGuardPlan,
  combatHexacopterGuardStation,
  combatHexacopterRangeArrivalPlan,
  combatHexacopterRangeEscapePlan,
  combatHexacopterRangePhase,
  combatHexacopterRangePlan,
} from "./combatHexacopterRangeRoutes.ts";
import {
  interIslandArrivalOrigin,
  interIslandArrivalPhase,
  interIslandArrivalPlan,
  interIslandDeparturePhase,
  interIslandDeparturePlan,
  interIslandTransferAction,
  interIslandTransferDestination,
} from "./interIslandRoutes.ts";

/**
 * The controller understands only this contract. A train, longship or any
 * later carrier supplies its own geometry, performance and routes here.
 */
/**
 * Lift reserve a carrier keeps when it authors none. Every airborne machine
 * shipped before the reserve became a passport number flew with this one.
 */
export const DEFAULT_VEHICLE_LIFT_RESERVE = 1.12;

export interface AirVehicleDefinition extends VehicleFrameDefinition {
  /**
   * Сторона машины. Не задана — мирный транспорт: он никого не атакует и не
   * является целью по признаку клана (`vehicleAllegiance.ts`). Свойство стоит
   * здесь, а не в кадре, потому что это ВОЗМОЖНОСТЬ машины, а не её геометрия.
   */
  readonly allegiance?: VehicleAllegiance;
  /**
   * Бортовое вооружение. Не задано — машина безоружна и в бой не идёт, даже
   * будучи чужой: сторона говорит «кто он», вооружение — «чем он может».
   */
  readonly armament?: VehicleArmament;
  readonly departure?: {
    readonly target: EntryInteractionTarget;
    readonly point: SceneVector3;
    readonly flightKind: string;
    readonly approachRadius: number;
    readonly releaseRadius: number;
    readonly heightTolerance: number;
    /** Empty service flights put accidental stowaways back ashore. */
    readonly passengerDropPoint?: SceneVector3;
    /**
     * ЦВЕТ СИГНАЛЬНОГО СТЕКЛА, КОТОРЫМ ЭТА МАШИНА СВЕТИТ О СВОЁМ ОТПРАВЛЕНИИ.
     *
     * Лампы принадлежат сцене, а вот ЧЬЁ отправление ими показывают — свойство
     * машины, и объявить это может только она. Прежде рантайм зажигал их по
     * условию `id === "sky-train"`: то есть общий контур знал, что светит
     * именно состав, и на второй машине с расписанием пришлось бы дописать
     * второе имя. Не объявлено — машина не светит ничем, и это норма: причал,
     * у которого нет сигнального стекла, ничего не теряет.
     */
    readonly signalColor?: string;
  };
  readonly passengerFlight?: {
    readonly target: EntryInteractionTarget;
    /** Resting/world point where the onboard action is offered. */
    readonly point: SceneVector3;
    readonly flightKind: string;
    readonly approachRadius: number;
    readonly releaseRadius: number;
    /** The action exists only while the player's eye is inside this carrier. */
    contains(point: SceneVector3): boolean;
  };
  readonly flight: {
    readonly limits: ShipLimits;
    /**
     * ЧЕМ МАШИНА ДЕРЖИТСЯ В ВОЗДУХЕ. Свойство вида судна, а не его имени, и
     * от него зависит смысл половины остальных правил:
     *
     *   "buoyant" — объём газа. Сила есть всегда, даже когда управлять нечем,
     *               поэтому плавно опуститься вниз машина может при любом
     *               отказе. Так устроены все три корабля-дирижабля карты;
     *   "rotor"   — сами движители. Нет тяги — нет подъёма, и «мягко сесть с
     *               выключенными винтами» физически невозможно. Отказ у такой
     *               машины определяется не долей уцелевших каналов, а тем,
     *               накрывает ли выпуклая оболочка уцелевших точек тяги её
     *               центр масс;
     *   "none"    — подъёма нет вовсе: поезд, судно, автомобиль держит опора.
     *
     * Не задан — "buoyant": ровно то, чем жили все машины до появления
     * винтокрылой.
     */
    readonly liftSource?: VehicleLiftSource;
    /**
     * Допуск ПОСАДКИ вместо швартовки. Есть только у машины, которая садится
     * на грунт: у неё нет ни мачты, ни носового узла, и рейс кончается тем,
     * что она встала на опоры и выключила моторы.
     */
    readonly landing?: RotorLandingTolerance;
    readonly approach: ApproachGate;
    readonly docking: DockingTolerance;
    /**
     * Physical deviations of this machine from the derived guidance corridor.
     * The corridor itself comes from the failure envelope, the approach gate
     * and the trim authority, so an ordinary carrier authors nothing here.
     */
    readonly guidance?: VehicleGuidanceOverrides;
    readonly spoolSeconds: number;
    readonly underwaySeconds: number;
    readonly driveAnimation: VehicleDriveAnimation;
    readonly exhaust?: VehicleExhaustDefinition;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
    /**
     * Lift the intact envelope carries as a multiple of the intact weight.
     *
     * This is what a hole in the gas volume costs, so it is the machine's own
     * number and not a constant of the world: lift falls with the surviving
     * share of the envelope, and the craft sinks once the product drops below
     * its weight. A reserve of R therefore keeps it flying until roughly
     * `1 - 1/R` of the envelope is gone.
     */
    readonly liftReserve?: number;
    /**
     * Предельный наклон винтокрылой машины, рад.
     *
     * У коптера это не «ограничение для красоты», а ПРЕДЕЛ ГОРИЗОНТАЛЬНОГО
     * МАНЁВРА: горизонтальная сила рождается только наклоном, поэтому
     * располагаемое ускорение равно g·tg(наклон) и ничему другому. Машине без
     * винтов не нужен.
     */
    readonly maximumTilt?: number;
    /** Physical reach of this berth's capture/winch, in metres. */
    readonly mooringReach?: number;
    routePlan(kind: string, berth: SceneVector3): VehicleRoutePlan;
    /**
     * СТОРОЖЕВОЙ ПОСТ ЭТОЙ ЗАДАЧИ: что машина стережёт, стоя на этом берте.
     *
     * Форма умышленно та же, что у `routePlan`, и стоит рядом с ним: пост и
     * трасса — одно рабочее место, описанное с двух сторон. Автомат боя имеет
     * право работать РОВНО ТОГДА, когда пост объявлен, — и это делает бой
     * СПОСОБНОСТЬЮ ПАСПОРТА, ровно как `armament`, а не веткой по имени
     * машины. Прежде рантайм спрашивал `kind === "sky-control"` и тащил к себе
     * импортом три константы полигона; теперь он не знает ни имени задачи, ни
     * имени машины.
     *
     * `null` — у этой задачи поста нет: показательный круг, перегон, посадка.
     * Отсутствие метода целиком — машина не воюет вовсе.
     */
    combatStation?(kind: string, berth: SceneVector3): AirCombatStation | null;
    /**
     * СПОСОБНОСТЬ УКЛОНЯТЬСЯ. Нет поля — машина не уклоняется вовсе, и это
     * законный ответ: состав неба и драккар не должны дёргаться от чужой
     * скорости, они возят людей.
     *
     * Объявляется паспортом по той же причине, что вооружение и пост: движок
     * не имеет права знать, кто из машин пуглив.
     */
    readonly evasion?: EvasionCapability;
    arrivalPlan(berth: SceneVector3): VehicleRoutePlan;
    escapePlan(
      berth: SceneVector3,
      input: SkyTrainEmergencyEscapeInput,
    ): VehicleRoutePlan;
    routePhase(kind: string, progress: number): LampEventState;
  };
}

export interface VehicleExhaustSourceDefinition {
  /** Authored emitter point; it follows the carrier only until a puff leaves. */
  readonly point: SceneVector3;
  readonly direction: SceneVector3;
  readonly engineIndex: number;
  /** Smoke stops if the physical outlet is detached. */
  readonly outletPieceId: string;
}

export interface VehicleExhaustDefinition {
  readonly sources: readonly VehicleExhaustSourceDefinition[];
  readonly idleRate: number;
  readonly fullRate: number;
  readonly lifeSeconds: number;
  readonly exitSpeed: number;
  readonly spread: number;
}

export interface AirVehicleFlightSnapshot {
  readonly kind: string;
  readonly time: number;
  readonly castOff: boolean;
  readonly progress: number;
}

export type VehicleDriveAnimation =
  | {
      readonly kind: "none";
      /** Keeps the shared phase integrator transport-neutral. */
      readonly phaseSpeed: 0;
    }
  | {
      readonly kind: "propeller";
      /** Radians per second at full delivered throttle. */
      readonly phaseSpeed: number;
      /**
       * Ось вала в авторской позе покоя. Не задана — вращение идёт вокруг
       * продольной оси кадра, как у тянущего винта дирижабля. Подъёмному
       * винту нужна вертикаль: ось принадлежит МАШИНЕ, а не миру.
       */
      readonly shaftAxis?: SceneVector3;
    }
  | {
      readonly kind: "furnace";
      /** Furnace power is read in smoke and light rather than a moving shaft. */
      readonly phaseSpeed: 0;
    }
  | {
      readonly kind: "oars";
      /** Stroke-cycle radians per second at full delivered throttle. */
      readonly phaseSpeed: number;
      /** Fore-and-aft angle either side of the oarlock. */
      readonly sweepAngle: number;
      /** Maximum blade dip on the pull and lift on the recovery. */
      readonly liftAngle: number;
      /** Blade twist while it travels forward through the air. */
      readonly featherAngle: number;
    };

/** One generic journey state drives doors, lamps and the movement HUD. */
export function airVehicleFlightEventState(
  vehicle: AirVehicleDefinition,
  flight: AirVehicleFlightSnapshot | null,
  recovery: Pick<VehicleRecoveryLifecycle, "phase"> | null = null,
): LampEventState {
  if (recovery) {
    return recovery.phase === "arrival" ? "approach" : "failed";
  }
  if (!flight) {
    return "docked";
  }
  if (!flight.castOff || flight.time < vehicle.flight.spoolSeconds) {
    return "attention";
  }
  return vehicle.flight.routePhase(flight.kind, flight.progress);
}

const skyTrainFrame = vehicleFrames.find((frame) => frame.id === "sky-train");
if (!skyTrainFrame) {
  throw new Error("The sky-train frame is missing from the vehicle catalog");
}

const skyLongshipFrame = vehicleFrames.find(
  (frame) => frame.id === "sky-longship",
);
if (!skyLongshipFrame) {
  throw new Error("The sky-longship frame is missing from the vehicle catalog");
}

const townAirshipFrame = vehicleFrames.find(
  (frame) => frame.id === "town-airship",
);
if (!townAirshipFrame) {
  throw new Error("The town airship frame is missing from the vehicle catalog");
}

const basaltSkyRamFrame = vehicleFrames.find(
  (frame) => frame.id === "basalt-sky-ram",
);
if (!basaltSkyRamFrame) {
  throw new Error("The basalt sky-ram frame is missing from the vehicle catalog");
}

const townHexacopterFrame = vehicleFrames.find(
  (frame) => frame.id === "town-hexacopter",
);
if (!townHexacopterFrame) {
  throw new Error("The town hexacopter frame is missing from the vehicle catalog");
}

const nimbusHexacopterFrame = vehicleFrames.find(
  (frame) => frame.id === "nimbus-hexacopter",
);
if (!nimbusHexacopterFrame) {
  throw new Error("The Nimbus hexacopter frame is missing from the vehicle catalog");
}

const sr6SkatFrame = vehicleFrames.find((frame) => frame.id === "sr6-skat");
if (!sr6SkatFrame) {
  throw new Error("The SR-6 Skat frame is missing from the vehicle catalog");
}

const SKY_LONGSHIP_COURSE = (6 * Math.PI) / 180;

function rotateHorizontal(
  point: SceneVector3,
  radians: number,
): SceneVector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    point[0] * cosine - point[2] * sine,
    point[1],
    point[0] * sine + point[2] * cosine,
  ];
}

function rotatePlacedPlan(
  plan: VehicleRoutePlan,
  berth: SceneVector3,
  radians: number,
): VehicleRoutePlan {
  return {
    ...plan,
    point(progress) {
      const point = plan.point(progress);
      const rotated = rotateHorizontal(
        [point[0] - berth[0], point[1] - berth[1], point[2] - berth[2]],
        radians,
      );
      return [
        berth[0] + rotated[0],
        berth[1] + rotated[1],
        berth[2] + rotated[2],
      ];
    },
  };
}

function longshipPoint(a: number, b: number, y: number): SceneVector3 {
  const cosine = Math.cos(SKY_LONGSHIP_COURSE);
  const sine = Math.sin(SKY_LONGSHIP_COURSE);
  return [
    8.25 + a * cosine - b * sine,
    y,
    -102.5 + a * sine + b * cosine,
  ];
}

export function isInsideLongship(point: SceneVector3): boolean {
  const dx = point[0] - 8.25;
  const dz = point[2] + 102.5;
  const cosine = Math.cos(SKY_LONGSHIP_COURSE);
  const sine = Math.sin(SKY_LONGSHIP_COURSE);
  const a = dx * cosine + dz * sine;
  const b = -dx * sine + dz * cosine;
  return a >= -4.9 && a <= 4.9 && Math.abs(b) <= 1.42 &&
    point[1] >= 1.0 && point[1] <= 3.15;
}

const TOWN_AIRSHIP_HEADING = -1.451;

/** The usable standing volume inside the gondola, in its authored rest pose. */
export function isInsideTownAirship(point: SceneVector3): boolean {
  const dx = point[0] + 22.6;
  const dz = point[2] + 15.29;
  const cosine = Math.cos(TOWN_AIRSHIP_HEADING);
  const sine = Math.sin(TOWN_AIRSHIP_HEADING);
  const a = dx * cosine + dz * sine;
  const b = -dx * sine + dz * cosine;
  return a >= 3.15 && a <= 8.45 && Math.abs(b) <= 1.05 &&
    point[1] >= 7.12 && point[1] <= 9.34;
}

/** Standing volume inside the suspended armoured gallery. */
export function isInsideBasaltSkyRam(point: SceneVector3): boolean {
  const a = point[2] + 101.5;
  const b = point[0];
  return a >= -6.95 && a <= 7.05 && Math.abs(b) <= 1.5 &&
    point[1] >= 5.08 && point[1] <= 8.06;
}

/** Terminal remains the reference machine; its behaviour is unchanged. */
export const SKY_TRAIN_AIR_VEHICLE: AirVehicleDefinition = {
  ...skyTrainFrame,
  departure: {
    target: {
      id: "terminal:sky-train:departure",
      kind: "departure",
      cue: "terminal-uncrewed-flight",
    },
    point: [11.9, 2.6, 70.4],
    flightKind: "circuit",
    approachRadius: 3.6,
    releaseRadius: 4.8,
    heightTolerance: 3,
    passengerDropPoint: SKY_TRAIN_PLATFORM_DROP,
    // Красное сигнальное стекло Терминала — его и зажигает отправление состава.
    signalColor: departureSignalColor,
  },
  passengerFlight: {
    target: {
      id: "terminal:sky-train:ride",
      kind: "ride",
      cue: "terminal-passenger-flight",
    },
    point: SKY_TRAIN_RIDE_POST,
    flightKind: "tour",
    approachRadius: RIDE_APPROACH_RADIUS,
    releaseRadius: RIDE_RELEASE_RADIUS,
    contains: isInsideCabin,
  },
  flight: {
    limits: SKY_TRAIN_LIMITS,
    approach: SKY_TRAIN_APPROACH,
    docking: SKY_TRAIN_DOCKING,
    spoolSeconds: SKY_TRAIN_CASTOFF_TIME,
    underwaySeconds: SKY_TRAIN_UNDERWAY_TIME,
    driveAnimation: { kind: "propeller", phaseSpeed: 18.4 },
    linearDamping: 0.22,
    angularDamping: 0.55,
    lateralDragRatio: 7,
    routePlan: (kind, berth) => flightPlan(kind as "circuit" | "tour", berth),
    arrivalPlan: terminalArrivalPlan,
    escapePlan: emergencyEscapePlan,
    routePhase: (kind, progress) =>
      skyTrainRoutePhase(kind as "circuit" | "tour", progress),
  },
};

/** The Viking machine uses the same forces and pilot with a different body. */
export const SKY_LONGSHIP_AIR_VEHICLE: AirVehicleDefinition = {
  ...skyLongshipFrame,
  departure: {
    // The rope coil on the jetty is the village's departures board: Space
    // means "cast off" without adding a modern terminal prop to the scene.
    target: {
      id: "viking-village:sky-longship:departure",
      kind: "departure",
      cue: "viking-uncrewed-flight",
    },
    point: [-0.75, 1.5, -103.9],
    flightKind: "circuit",
    approachRadius: 3.2,
    releaseRadius: 4.3,
    heightTolerance: 3,
  },
  passengerFlight: {
    target: {
      id: "viking-village:sky-longship:ride",
      kind: "ride",
      cue: "viking-passenger-flight",
      actions: [
        { id: "tour", labelKey: "hint.vikingRide.action" },
        {
          id: interIslandTransferAction("town"),
          labelKey: "destination.town",
        },
      ],
    },
    // Bow deck, offset from the forestay. Initial acceleration carries a
    // standing passenger aft into the broad sail instead of over the stern.
    point: longshipPoint(-3.7, -0.4, 2.42),
    flightKind: "tour",
    approachRadius: 2.15,
    releaseRadius: 2.8,
    contains: isInsideLongship,
  },
  flight: {
    limits: {
      // Two oar banks provide the same modest acceleration per tonne as the
      // much heavier train. Their lateral spacing also gives docking yaw.
      // Пересчитано вместе с массой каменных чушек дифферентовки.
      enginePower: 117,
      enginePoints: [
        longshipPoint(0, -2.4, 1.2),
        longshipPoint(0, 2.4, 1.2),
      ],
      maxRudderForce: 45,
      rudderReferenceSpeed: 7,
      rudderPoint: longshipPoint(5.15, 1.85, 1.8),
      liftTrimRange: 0.12,
    },
    approach: {
      heading: [skyLongshipFrame.nose[0], skyLongshipFrame.nose[2]],
      tolerance: { position: 5, heading: 0.35, speed: 4.2 },
    },
    docking: {
      position: 0.55,
      height: 0.25,
      headingCos: 0.99,
      speed: 0.2,
      verticalSpeed: 0.12,
      uprightCos: 0.99,
      angularSpeed: 0.035,
    },
    spoolSeconds: 4.5,
    underwaySeconds: 10,
    driveAnimation: {
      kind: "oars",
      phaseSpeed: 4.8,
      sweepAngle: 0.42,
      liftAngle: 0.24,
      featherAngle: 1.12,
    },
    linearDamping: 0.22,
    angularDamping: 0.55,
    lateralDragRatio: 7,
    routePlan: (kind, berth) => {
      const destination = interIslandTransferDestination(
        "viking-village",
        kind,
      );
      if (destination) {
        return interIslandDeparturePlan("viking-village", destination, berth);
      }
      const origin = interIslandArrivalOrigin(kind);
      if (origin) {
        return interIslandArrivalPlan(origin, "viking-village", berth);
      }
      return rotatePlacedPlan(
        kind === "tour"
          ? vikingLongshipTourPlan(berth)
          : flightPlan("circuit", berth),
        berth,
        SKY_LONGSHIP_COURSE,
      );
    },
    arrivalPlan: (berth) =>
      rotatePlacedPlan(
        terminalArrivalPlan(berth),
        berth,
        SKY_LONGSHIP_COURSE,
      ),
    escapePlan: (berth, input) => {
      const localInput = {
        start: rotateHorizontal(input.start, -SKY_LONGSHIP_COURSE),
        forward: rotateHorizontal(input.forward, -SKY_LONGSHIP_COURSE),
      };
      return rotatePlacedPlan(
        emergencyEscapePlan(berth, localInput),
        berth,
        SKY_LONGSHIP_COURSE,
      );
    },
    routePhase: (kind, progress) => {
      const destination = interIslandTransferDestination(
        "viking-village",
        kind,
      );
      if (destination) {
        return interIslandDeparturePhase(
          "viking-village",
          destination,
          progress,
        );
      }
      const origin = interIslandArrivalOrigin(kind);
      if (origin) {
        return interIslandArrivalPhase(
          origin,
          "viking-village",
          progress,
        );
      }
      return kind === "tour"
        ? vikingLongshipTourPhase(progress)
        : skyTrainRoutePhase("circuit", progress);
    },
  },
};

/** The town airship is the same controller at an elevated mast berth. */
export const TOWN_AIRSHIP_AIR_VEHICLE: AirVehicleDefinition = {
  ...townAirshipFrame,
  departure: {
    target: {
      id: "town:airship:departure",
      kind: "departure",
      cue: "town-uncrewed-flight",
    },
    // The first lower stair tread is the town's physical dispatch point.
    point: townAirshipPoint(-2.2, 4.9, 1.45),
    flightKind: "circuit",
    approachRadius: 2.8,
    releaseRadius: 3.8,
    heightTolerance: 2.4,
    passengerDropPoint: townAirshipPoint(-1.9, 5.65, 1.45),
  },
  passengerFlight: {
    target: {
      id: "town:airship:ride",
      kind: "ride",
      cue: "town-passenger-flight",
      actions: [
        { id: "tour", labelKey: "hint.townRide.action" },
        {
          id: interIslandTransferAction("viking-village"),
          labelKey: "destination.vikingVillage",
        },
      ],
    },
    // The call lives down the central aisle near the stern. At the door the
    // passenger therefore sees only the real door request and can disembark
    // after a completed tour without the ride action stealing Space.
    point: townAirshipPoint(7.05, 0, 8.12),
    flightKind: "tour",
    approachRadius: 2.05,
    releaseRadius: 2.65,
    contains: isInsideTownAirship,
  },
  flight: {
    limits: {
      // Same reversible twin-engine control surface as the sky train, scaled
      // to the measured body rather than copied by appearance. The trim cars
      // are part of that body, so the powerplant carries them too.
      enginePower: 220,
      enginePoints: [
        townAirshipPoint(7, -4.3, 11.4),
        townAirshipPoint(7, 4.3, 11.4),
      ],
      maxRudderForce: 90,
      rudderReferenceSpeed: 7,
      rudderPoint: townAirshipPoint(14.62, 0, 12.6),
      liftTrimRange: 0.12,
    },
    approach: {
      heading: [townAirshipFrame.nose[0], townAirshipFrame.nose[2]],
      tolerance: { position: 4.8, heading: 0.34, speed: 3.8 },
    },
    docking: {
      // The 0.42 m nose cone enters a 0.76 m mast cup, leaving only 0.17 m
      // of radial clearance. A 0.48 m completion radius let the route end
      // with the cone visibly outside the cup; the still-active winch then
      // finished that motion during the next departure countdown. Fourteen
      // centimetres is inside the real radial clearance while leaving the
      // heavy craft enough room to settle before its watchdog expires.
      position: 0.14,
      height: 0.22,
      headingCos: 0.992,
      speed: 0.18,
      verticalSpeed: 0.11,
      uprightCos: 0.992,
      angularSpeed: 0.032,
    },
    spoolSeconds: 5,
    underwaySeconds: 8.5,
    driveAnimation: { kind: "propeller", phaseSpeed: 18.4 },
    linearDamping: 0.22,
    angularDamping: 0.55,
    lateralDragRatio: 7,
    // The cup is on an exposed mast: guidance must finish the turn before
    // the short nose capture takes over.
    mooringReach: 12,
    routePlan: (kind, berth) => {
      const destination = interIslandTransferDestination("town", kind);
      if (destination) {
        return interIslandDeparturePlan("town", destination, berth);
      }
      const origin = interIslandArrivalOrigin(kind);
      return origin
        ? interIslandArrivalPlan(origin, "town", berth)
        : townAirshipPlan(kind as TownAirshipFlightKind, berth);
    },
    arrivalPlan: townAirshipArrivalPlan,
    escapePlan: townAirshipEscapePlan,
    routePhase: (kind, progress) => {
      const destination = interIslandTransferDestination("town", kind);
      if (destination) {
        return interIslandDeparturePhase("town", destination, progress);
      }
      const origin = interIslandArrivalOrigin(kind);
      return origin
        ? interIslandArrivalPhase(origin, "town", progress)
        : townAirshipRoutePhase(kind as TownAirshipFlightKind, progress);
    },
  },
};

/** The stronghold's carrier is deliberately slower and more inertial. */
export const BASALT_SKY_RAM_AIR_VEHICLE: AirVehicleDefinition = {
  ...basaltSkyRamFrame,
  departure: {
    target: {
      id: "basalt-stronghold:sky-ram:departure",
      kind: "departure",
      cue: "stronghold-uncrewed-flight",
    },
    // The capstan is the only believable dispatch control on this berth.
    point: [5.15, 5.78, -89.1],
    flightKind: "circuit",
    approachRadius: 3.15,
    releaseRadius: 4.25,
    heightTolerance: 2.7,
    passengerDropPoint: [4.65, 5.18, -95.7],
  },
  passengerFlight: {
    target: {
      id: "basalt-stronghold:sky-ram:ride",
      kind: "ride",
      cue: "stronghold-passenger-flight",
    },
    // A call post inside the gallery, clear of the boarding opening and ram.
    point: basaltSkyRamPoint(-4.7, 0, 5.72),
    flightKind: "war-patrol",
    approachRadius: 2.0,
    releaseRadius: 2.65,
    contains: isInsideBasaltSkyRam,
  },
  flight: {
    limits: {
      // Пересчитано вместе с массой дифферентовочного балласта галереи.
      enginePower: 403,
      enginePoints: [
        basaltSkyRamPoint(-0.8, -1.65, 8.8),
        basaltSkyRamPoint(-0.8, 1.65, 8.8),
      ],
      maxRudderForce: 130,
      rudderReferenceSpeed: 6.4,
      rudderPoint: basaltSkyRamPoint(-14.2, 0, 12.8),
      liftTrimRange: 0.095,
    },
    approach: {
      heading: [basaltSkyRamFrame.nose[0], basaltSkyRamFrame.nose[2]],
      tolerance: { position: 5.8, heading: 0.32, speed: 3.2 },
    },
    docking: {
      // 0.32 m point inside a 0.82 m jaw throat leaves 0.25 m per side.
      position: 0.16,
      height: 0.2,
      headingCos: 0.994,
      speed: 0.15,
      verticalSpeed: 0.09,
      uprightCos: 0.993,
      angularSpeed: 0.026,
    },
    spoolSeconds: 6.5,
    underwaySeconds: 11,
    driveAnimation: {
      kind: "furnace",
      phaseSpeed: 0,
    },
    exhaust: {
      sources: [-1, 1].map((side, engineIndex) => ({
        point: basaltSkyRamPoint(-7.9, side * 1.65, 8.88),
        direction: [0, 0, -1],
        engineIndex,
        outletPieceId: `stronghold:sky-ram:engine:${side}:outlet`,
      })),
      idleRate: 1.2,
      fullRate: 48,
      lifeSeconds: 6,
      exitSpeed: 3.8,
      spread: 1.15,
    },
    linearDamping: 0.18,
    angularDamping: 0.48,
    lateralDragRatio: 8.5,
    // Measured, not chosen: the envelope is 56 panels weighing 5.3 kg out of
    // 290, so shedding them frees almost no weight and the surviving share
    // decides everything. At the common 1.12 the ram went neutral after seven
    // panels — 12.5%, and a single rocket into the crowded bow takes that
    // many. 1.18 puts the loss of buoyancy at nine panels, 16.1%.
    liftReserve: 1.18,
    mooringReach: 15,
    routePlan: (kind, berth) =>
      basaltSkyRamPlan(kind as BasaltSkyRamFlightKind, berth),
    arrivalPlan: basaltSkyRamArrivalPlan,
    escapePlan: basaltSkyRamEscapePlan,
    routePhase: (kind, progress) =>
      basaltSkyRamRoutePhase(kind as BasaltSkyRamFlightKind, progress),
  },
};

/**
 * ГЕКСАКОПТЕР ВО ДВОРЕ. Первая машина проекта, у которой подъём делают не
 * оболочка, а движители, и это меняет смысл двух паспортных чисел, не меняя
 * ни строчки общего контроллера:
 *
 *  - `envelopeMatch` указывает на ЛОПАСТИ, поэтому «доля уцелевшей оболочки»
 *    становится долей уцелевших лопастей;
 *  - `liftReserve` перестаёт быть запасом газа и становится честной
 *    тяговооружённостью 3.2.
 *
 * Откуда 3.2. Наивная дробь «осталось 5/6 колец, значит осталось 5/6 тяги»
 * неверна, и это главный урок этой машины. Винт умеет только толкать: чтобы
 * ОСТАТЬСЯ РОВНОЙ, машина обязана пригасить и кольцо НАПРОТИВ выбитого, иначе
 * их разность опрокидывает её. Замер предельной тяги при нулевом суммарном
 * моменте (перебор по всем раскладкам) даёт долю располагаемого:
 *
 *     шесть колец                          0.99
 *     пять                                 0.67
 *     четыре, через одно                   0.66
 *     четыре, две пары напротив            0.50
 *     четыре, пара напротив плюс два рядом 0.34
 *     четыре без пары напротив             0.00
 *     три через одно, по 120°              0.50
 *     три: пара напротив плюс сосед        0.34
 *     три в одном секторе                  0.00
 *
 * Паспорт задан ТРЕБОВАНИЕМ, а не вкусом: на трёх кольцах машина обязана мягко
 * сесть, на четырёх — лететь. Худшая рабочая тройка даёт 0.336, значит вес
 * получится держать при тяговооружённости от 3.0. Взято 3.2: на трёх кольцах
 * это 1.07 веса — хватает погасить снижение и сесть, на четырёх столько же, на
 * пяти 2.15, на целой 3.18.
 *
 * Что этим числом НЕ покупается и куплено быть не может: раскладки, где центр
 * масс выходит за выпуклую оболочку живых колец — три подряд, четыре без пары
 * напротив. Там любая тяга опрокидывает машину, хоть тысяча процентов оборотов,
 * потому что винт умеет только толкать. Это не «деградация характеристик», а
 * отказ, и автоматика обязана увидеть его по НЕДОБОРАМ МИКШЕРА, а не по числу
 * целых лопастей: бывает много живых колец, которыми нечего сделать.
 *
 * Заодно 3.2 ставит висение на 0.31 располагаемой тяги и оставляет две трети
 * оборотов на моменты — отсюда и резкость машины. С прежними 1.35 висение
 * съедало 0.74, машина отвечала вяло, а с одним выбитым кольцом ровно и
 * управляемо снижалась двести метров, что и вскрыло ошибку.
 */
export const TOWN_HEXACOPTER_AIR_VEHICLE: AirVehicleDefinition = {
  ...townHexacopterFrame,
  // Городская машина, стоящая на чужом полигоне. Именно поэтому она — цель:
  // не «слабая» и не «плохая», а ЧУЖАЯ. Сторона у неё была бы той же и в
  // городе, просто там ей никто не оппонирует.
  allegiance: TOWN_ALLEGIANCE,
  departure: {
    target: {
      id: "town:hexacopter:departure",
      kind: "departure",
      cue: "town-hexacopter-uncrewed-flight",
      actions: [
        {
          id: "circuit",
          labelKey: "hint.hexacopterDeparture.uncrewed",
        },
        {
          // Злой круг: перепады высот и смена знака кривизны. Нужен затем,
          // чтобы у RAX была ТРУДНАЯ цель без человека за штурвалом.
          id: "evasive",
          labelKey: "hint.hexacopterDeparture.evasive",
        },
        {
          id: "manual",
          labelKey: "hint.hexacopterDeparture.manual",
        },
      ],
    },
    // Стойка с табло у кромки пятна — единственный физический интерфейс
    // площадки. Мачт у этой машины нет. Точки — на полигоне Tonkawa
    // (фишка №1): машина переехала целиком, интерфейс переехал с ней.
    point: rangeHexacopterPoint(2.9, -3.32, 1),
    flightKind: "circuit",
    approachRadius: 2.6,
    releaseRadius: 3.5,
    heightTolerance: 2.4,
    passengerDropPoint: rangeHexacopterPoint(2.4, -3.1, 1),
  },
  passengerFlight: {
    target: {
      id: "town:hexacopter:ride",
      kind: "ride",
      cue: "town-hexacopter-passenger-flight",
      // Пост едет с машиной, поэтому именно он замыкает цикл «сел на крыше —
      // вышел — вернулся»: за управление садятся у кресла, где бы машина ни
      // стояла. Стойка на паде — интерфейс площадки, не машины.
      actions: [
        {
          id: "tour",
          labelKey: "hint.hexacopterRide.action",
        },
        {
          id: "manual",
          labelKey: "hint.hexacopterRide.manual",
        },
      ],
    },
    // Точка вызова стоит у кресла: человек, вошедший в дверь левого борта,
    // делает полшага к оси и получает предложение лететь.
    point: rangeHexacopterPoint(-0.15, 0, 1.98),
    flightKind: "tour",
    approachRadius: 1.15,
    releaseRadius: 1.6,
    contains: isInsideRangeHexacopter,
  },
  flight: {
    limits: {
      // Тяга ОДНОГО кольца вдоль корпуса. Кольцо наклоняется в вилке примерно
      // на 12°, и горизонтальной составляющей ему достаётся около восьмой
      // части подъёма. Шесть колец дают 260 единиц на массу 95 — это 0.28 g,
      // чуть бодрее дирижабля № 07 (0.30 g при вчетверо большей массе даёт
      // ему вялый разгон), и ровно то, чего ждёшь от лёгкой машины.
      enginePower: 58,
      enginePoints: HEXACOPTER_DUCTS.map((station) =>
        rangeHexacopterPointFromTown(hexacopterDuctPoint(station, HEX_DISC_Y)),
      ),
      // РУЛЯ НЕТ. Гексакоптер разворачивается разнотягом колец — и на
      // крейсере, и вися на месте, одинаково. Оперение ему не нужно, и врать
      // о нём в паспорте нельзя: общий аллокатор и так считает располагаемое
      // рыскание по шести настоящим плечам, а нулевая сила пера означает, что
      // весь момент придётся взять моторам. Именно этого мы и хотим.
      maxRudderForce: 0,
      rudderReferenceSpeed: 9,
      rudderPoint: rangeHexacopterPointFromTown(HEXACOPTER_RUDDER_POINT),
      // Вертикальный запас у винтокрылой машины больше, чем у дирижабля: она
      // не стравливает газ, а прибавляет обороты.
      liftTrimRange: 0.28,
      // БОКОВАЯ ТЯГА одного кольца. Кардан наклоняет кольцо не только
      // вперёд-назад, поэтому машина умеет сместиться вбок, не разворачиваясь.
      // Шесть колец дают 240 единиц на массу 94 — 0.26 g вбок, чуть меньше
      // продольных 0.28 g: наклон вбок ограничен щеками вилки, и это честно.
      lateralThrust: 40,
    },
    approach: {
      heading: [townHexacopterFrame.nose[0], townHexacopterFrame.nose[2]],
      // Створ по курсу шире, чем у дирижаблей, и это замер, а не щедрость:
      // машина приходит на площадку почти без хода, и последние градусы ей
      // доворачивает причальный захват, приложенный к носовому штырю. При
      // допуске 0.30 рад захват не вооружался на 0.950 против нужных 0.955 —
      // машина замирала в полутора метрах от стакана и стояла так вечно.
      tolerance: { position: 4.2, heading: 0.36, speed: 3 },
    },
    // Швартовки у коптера нет: поле оставлено потому, что общий контракт его
    // требует, и намеренно широкое — оно ничего не решает.
    docking: {
      position: 1.4,
      height: 0.4,
      headingCos: 0,
      speed: 0.3,
      verticalSpeed: 0.2,
      uprightCos: 0.9,
      angularSpeed: 0.15,
    },
    // А решает ПОСАДКА, и ровно по тем признакам, по которым её определяет
    // автоматика настоящего дрона: я над своим пятном, подо мной опора, я не
    // еду вбок и стою ровно — выключаю моторы. Радиус взят от разметки: пятно
    // 6 м, машина 5.8 м, попадание в метр от центра — это попадание.
    landing: {
      radius: 1,
      height: 0.5,
      speed: 0.35,
      verticalSpeed: 0.5,
      uprightCos: 0.985,
      angularSpeed: 0.2,
    },
    // Раскрутка шести колец с нуля до режима висения. Столько же занимает и
    // выход подъёма на вес: общая автоматика меняет его не быстрее четверти
    // живого веса в секунду.
    spoolSeconds: 5,
    underwaySeconds: 7,
    driveAnimation: {
      kind: "propeller",
      phaseSpeed: 26,
      // Валы этой машины ВЕРТИКАЛЬНЫ. Без этого общая анимация крутила бы
      // подъёмные винты вокруг продольной оси корпуса, как у дирижабля.
      shaftAxis: [0, 1, 0],
    },
    linearDamping: 0.22,
    angularDamping: 0.55,
    // Боковое сопротивление. Считано от манёвра, а не «на глаз»: на круге
    // радиусом 46 м при 9 м/с машине нужна центростремительная сила
    // m·v²/R ≈ 167 единиц, а взять её неоткуда, кроме бокового сопротивления —
    // тяга у неё всего 260. При отношении 6 это 1.1 м/с сноса, то есть крен
    // курса около 7°; при 3 получалось 20° и машина уезжала с трассы на
    // полсотни метров. Шесть кольцевых кожухов и киль — вполне настоящая
    // боковая площадь для такого числа.
    lateralDragRatio: 6,
    // Подъём делают ДВИЖИТЕЛИ. Отсюда и три следствия: точка приложения
    // уезжает к уцелевшим кольцам, потеря одного кольца из шести не является
    // отказом, а потеря удержания — это падение, а не мягкая посадка.
    liftSource: "rotor",
    // Тяговооружённость при ЦЕЛЫХ восемнадцати лопастях; деление на доли
    // уцелевших и даёт поведение при потере колец. Поднята с 3.2 вместе с
    // переходом лопастей на сталь: прочная лопасть тяжелее пластиковой, и
    // запас должен остаться прежним по СМЫСЛУ — «на трёх кольцах сесть, на
    // четырёх лететь», — а не по числу.
    liftReserve: 3.45,
    // Предельный наклон, и он же — предел разгона: g·tg(30°) = 5.7 м/с².
    // Больше тридцати градусов пассажирская машина не кладёт, поэтому её
    // располагаемое горизонтальное ускорение упирается именно сюда, а не в
    // мощность колец.
    maximumTilt: (30 * Math.PI) / 180,
    guidance: {
      // Общий автомат считает аварией не сам угол, а скорость вращения.
      // Пороги дирижабля лежат внутри штатной перекладки коптера и заставляли
      // его тормозить собственный резкий манёвр. Здесь граница стоит выше
      // штатных 0.9 рад/с, но настоящий неконтролируемый расколбас всё ещё
      // забирает машину с маршрута в стабилизацию.
      upsetTiltRate: 1.35,
      upsetYawRate: 1.15,
    },
    // Захват — КОНУС стакана, а не лебёдка: он центрует штырь, когда тот уже
    // почти над ним, и не имеет права тянуть машину за нос через полдвора.
    // Длинный радиус разворачивал лёгкий корпус рывком за носовой узел.
    mooringReach: 0.6,
    // Маршруты полигона: розетка формулой над стальным диском (фишка №1).
    // Аварийный уход остаётся городским — он строится от позы отказа и
    // берта, мировых якорей у него нет.
    routePlan: (kind, berth) =>
      rangeHexacopterPlan(kind as RangeHexacopterFlightKind, berth),
    arrivalPlan: rangeHexacopterArrivalPlan,
    escapePlan: townHexacopterEscapePlan,
    routePhase: (kind, progress) =>
      rangeHexacopterRoutePhase(kind as RangeHexacopterFlightKind, progress),
  },
};

export const NIMBUS_HEXACOPTER_AIR_VEHICLE: AirVehicleDefinition = {
  ...nimbusHexacopterFrame,
  departure: {
    target: {
      id: "nimbus:hexacopter:departure",
      kind: "departure",
      cue: "town-hexacopter-uncrewed-flight",
      actions: [
        { id: "circuit", labelKey: "hint.hexacopterDeparture.uncrewed" },
        { id: "manual", labelKey: "hint.hexacopterDeparture.manual" },
      ],
    },
    point: nimbusHexacopterPoint(2.9, -3.32, 1),
    flightKind: "circuit",
    approachRadius: 2.6,
    releaseRadius: 3.5,
    heightTolerance: 2.4,
    passengerDropPoint: nimbusHexacopterPoint(2.4, -3.1, 1),
  },
  passengerFlight: {
    target: {
      id: "nimbus:hexacopter:ride",
      kind: "ride",
      cue: "town-hexacopter-passenger-flight",
      actions: [
        { id: "tour", labelKey: "hint.hexacopterRide.action" },
        { id: "manual", labelKey: "hint.hexacopterRide.manual" },
      ],
    },
    point: nimbusHexacopterPoint(-0.15, 0, 1.98),
    flightKind: "tour",
    approachRadius: 1.15,
    releaseRadius: 1.6,
    contains: isInsideNimbusHexacopter,
  },
  flight: {
    ...TOWN_HEXACOPTER_AIR_VEHICLE.flight,
    limits: {
      ...TOWN_HEXACOPTER_AIR_VEHICLE.flight.limits,
      enginePoints: HEXACOPTER_DUCTS.map((station) =>
        nimbusHexacopterPointFromTown(hexacopterDuctPoint(station, HEX_DISC_Y))),
      rudderPoint: NIMBUS_HEXACOPTER_RUDDER_POINT,
    },
    approach: {
      ...TOWN_HEXACOPTER_AIR_VEHICLE.flight.approach,
      heading: [NIMBUS_HEXACOPTER_NOSE[0], NIMBUS_HEXACOPTER_NOSE[2]],
    },
    routePlan: (kind, berth) =>
      nimbusHexacopterPlan(kind as NimbusHexacopterFlightKind, berth),
    arrivalPlan: nimbusHexacopterArrivalPlan,
    escapePlan: nimbusHexacopterEscapePlan,
    routePhase: (kind, progress) =>
      nimbusHexacopterRoutePhase(kind as NimbusHexacopterFlightKind, progress),
  },
};

/**
 * Parked M6 prototype. It deliberately has no public dispatch/ride action yet:
 * geometry, damage, motor actuation and flight dynamics are live, while the
 * temporary meadow placement remains a display berth rather than a service.
 */
export const SR6_SKAT_AIR_VEHICLE: AirVehicleDefinition = {
  ...sr6SkatFrame,
  departure: {
    target: {
      id: "town:sr6-skat:departure",
      kind: "departure",
      cue: "sr6-skat-uncrewed-flight",
    },
    point: SR6_SKAT_DISPATCH_POINT,
    flightKind: "circuit",
    approachRadius: 2.5,
    releaseRadius: 3.4,
    heightTolerance: 2.2,
    passengerDropPoint: SR6_SKAT_PASSENGER_DROP_POINT,
  },
  flight: {
    limits: {
      // Подъём этой машине даёт не enginePower, а `liftReserve`: для
      // liftSource "rotor" вертикальная способность считается в рантайме как
      // масса * g * запас, поэтому она следует за массой сама и поднять себя
      // машина может по построению.
      //
      // enginePower и lateralThrust — горизонтальные СИЛЫ, и они за массой не
      // следуют. Стальное ядро и перевод силового пути с пластика на сталь
      // подняли массу с 5.53 до 7.12 кг (x1.288), поэтому обе величины
      // отмасштабированы от исходных 62 и 42 по ФАКТИЧЕСКОЙ массе 6.45 кг,
      // так что удельные ускорения остаются прежними (боком 7.59 м/с²,
      // горизонтальная тяговооружённость 6.85). Проверяется тестом.
      enginePower: 72,
      enginePoints: SR6_SKAT_ENGINE_POINTS,
      rotorCapacityWeights: SR6_SKAT_ROTOR_CAPACITY_WEIGHTS,
      rotorSpinDirections: SR6_SKAT_ROTOR_SPIN_DIRECTIONS,
      maxRudderForce: 0,
      rudderReferenceSpeed: 9,
      rudderPoint: SR6_SKAT_RUDDER_POINT,
      liftTrimRange: 0.28,
      lateralThrust: 49,
    },
    approach: {
      heading: [sr6SkatFrame.nose[0], sr6SkatFrame.nose[2]],
      tolerance: { position: 4.4, heading: 0.36, speed: 3 },
    },
    docking: {
      position: 1.4,
      height: 0.45,
      headingCos: 0,
      speed: 0.32,
      verticalSpeed: 0.22,
      uprightCos: 0.9,
      angularSpeed: 0.16,
    },
    landing: {
      radius: 1.2,
      height: 0.55,
      speed: 0.38,
      verticalSpeed: 0.52,
      uprightCos: 0.984,
      angularSpeed: 0.2,
    },
    spoolSeconds: 4.5,
    underwaySeconds: 6.5,
    driveAnimation: { kind: "propeller", phaseSpeed: 29, shaftAxis: [0, 1, 0] },
    linearDamping: 0.2,
    angularDamping: 0.58,
    lateralDragRatio: 6.4,
    liftSource: "rotor",
    liftReserve: 3.2,
    maximumTilt: (28 * Math.PI) / 180,
    guidance: { upsetTiltRate: 1.35, upsetYawRate: 1.15 },
    mooringReach: 0.6,
    routePlan: (_kind, berth) => sr6SkatPlan(berth),
    arrivalPlan: sr6SkatArrivalPlan,
    escapePlan: sr6SkatEscapePlan,
    routePhase: (_kind, progress) => sr6SkatRoutePhase(progress),
  },
};

/**
 * Имя боевой задачи. Отдельная константа, потому что её знают трое: паспорт
 * машины (какую трассу строить), табличка полигона (что предложить человеку) и
 * автомат боя (когда он вообще имеет право работать).
 */
export const COMBAT_HEXACOPTER_SKY_CONTROL = "sky-control";

export const COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE: AirVehicleDefinition = {
  ...combatHexacopterRangeFrame,
  allegiance: TONKAWA_ALLEGIANCE,
  armament: combatHexacopterRangeBlueprint.armament,
  departure: {
    target: {
      id: "combat-hexacopter-range:departure",
      kind: "departure",
      // Своя табличка: прежде cue городского коптера показывал на пульте
      // полигона имя HX-6 вместо RAX-8 Tonkawa.
      cue: "combat-hexacopter-uncrewed-flight",
      actions: [
        // ПЕРВЫМ ПУНКТОМ — БОЕВАЯ ЗАДАЧА. С пульта полигона машину отправляют
        // сторожить периметр; показательный круг остаётся вторым.
        {
          id: COMBAT_HEXACOPTER_SKY_CONTROL,
          labelKey: "hint.hexacopterDeparture.skyControl",
        },
        { id: "circuit", labelKey: "hint.hexacopterDeparture.uncrewed" },
      ],
    },
    point: COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT,
    flightKind: "circuit",
    approachRadius: 2.4,
    releaseRadius: 3.2,
    heightTolerance: 2.3,
    passengerDropPoint: [4.4, 0.08, 3.5],
  },
  flight: {
    limits: {
      enginePower: 105,
      enginePoints: combatHexacopterRangeBlueprint.enginePoints,
      rotorCapacityWeights: combatHexacopterRangeBlueprint.rotorCapacityWeights,
      rotorSpinDirections: combatHexacopterRangeBlueprint.rotorSpinDirections,
      // Второй орган рыскания. Реактивный момент шести колец даёт этой машине
      // около 0.1 рад/с, а её собственный круг требует вдвое больше: без
      // тоннелей нос физически не успевает за трассой и аппарат идёт боком.
      yawThrusters: combatHexacopterRangeBlueprint.yawThrusters,
      maxRudderForce: 0,
      rudderReferenceSpeed: 8,
      rudderPoint: combatHexacopterRangeBlueprint.mooringPoint,
      liftTrimRange: combatHexacopterRangeBlueprint.flight.liftTrimRange,
      lateralThrust: 70,
    },
    approach: {
      heading: [combatHexacopterRangeFrame.nose[0], combatHexacopterRangeFrame.nose[2]],
      tolerance: { position: 4.2, heading: 0.4, speed: 2.8 },
    },
    docking: {
      position: 1.3,
      height: 0.45,
      headingCos: 0,
      speed: 0.34,
      verticalSpeed: 0.5,
      uprightCos: 0.96,
      angularSpeed: 0.2,
    },
    landing: {
      radius: 1.15,
      height: 0.48,
      speed: 0.4,
      verticalSpeed: 0.55,
      uprightCos: 0.978,
      angularSpeed: 0.22,
    },
    spoolSeconds: combatHexacopterRangeBlueprint.flight.spoolSeconds,
    underwaySeconds: 6,
    driveAnimation: { kind: "propeller", phaseSpeed: 31, shaftAxis: [0, 1, 0] },
    linearDamping: combatHexacopterRangeBlueprint.flight.linearDamping,
    angularDamping: combatHexacopterRangeBlueprint.flight.angularDamping,
    lateralDragRatio: combatHexacopterRangeBlueprint.flight.lateralDragRatio,
    liftSource: "rotor",
    liftReserve: combatHexacopterRangeBlueprint.flight.liftReserve,
    maximumTilt: combatHexacopterRangeBlueprint.flight.maximumTilt,
    /**
     * ВОРОТА ВОЗМУЩЕНИЯ ОБЯЗАНЫ СТОЯТЬ ВЫШЕ ТОГО, ЧТО МАШИНА ДЕЛАЕТ САМА.
     *
     * Возмущением объявляется угловой темп — «событие, которое забрало машину
     * себе», — и порог для этого должен лежать ЗА пределами обычного полёта.
     * Прежние 1.45 стояли внутри него: замер показательной программы дал ровно
     * 1.45 рад/с на входе в резкий поворот галса и 1.47–1.59 на фигурах. То
     * есть корректор объявлял срывом собственную работу автопилота, отбирал
     * машину, подменял план — и номер не показывался вовсе.
     *
     * Девятнадцать даёт треть запаса над замеренным рабочим максимумом и
     * по-прежнему далеко от настоящего опрокидывания: раскрутить эту машину
     * ударом можно на порядок быстрее, кольца дают 24 рад/с² по крену.
     *
     * Фигуры этим порогом НЕ лечатся и лечиться не должны: там вопрос не в
     * величине, а во владении — пока фигура идёт, машина принадлежит ей, и
     * корректор в неё не входит вовсе (`VehicleFrameSystem`, врезка фигур).
     */
    guidance: { upsetTiltRate: 1.9, upsetYawRate: 1.3 },
    mooringReach: 0.6,
    routePlan: (kind, berth) =>
      kind === COMBAT_HEXACOPTER_SKY_CONTROL
        ? combatHexacopterGuardPlan(berth)
        : combatHexacopterRangePlan(berth),
    // Пост объявлен ровно у той задачи, у которой он есть. Показательный круг
    // поста не имеет — и на нём автомат боя не включается, даже если рядом
    // висит чужая вооружённая машина: номер есть номер.
    combatStation: (kind, berth) =>
      kind === COMBAT_HEXACOPTER_SKY_CONTROL
        ? combatHexacopterGuardStation(berth)
        : null,
    arrivalPlan: combatHexacopterRangeArrivalPlan,
    escapePlan: combatHexacopterRangeEscapePlan,
    routePhase: (kind, progress) =>
      kind === COMBAT_HEXACOPTER_SKY_CONTROL
        ? combatHexacopterGuardPhase(progress)
        : combatHexacopterRangePhase(progress),
  },
};

/**
 * VX-8 «Yaqui» НА ПОЛИГОНЕ TONKAWA.
 *
 * Вторая машина этого мира и ЧУЖАЯ ей. Сторона — `yaqui`, не `tonkawa`.
 *
 * Первая редакция ставила обеим одну сторону: полигон один, хозяин один, а
 * объявить её чужой значило бы завести войну, которой никто не просил.
 * Аргумент был честный и неверный ровно в одном месте — вооружение у обеих
 * настоящее, и две вооружённые машины одной стороны, летающие мимо друг друга,
 * это не мир, а невыстрелившая декорация. Полигон затем и нужен, чтобы на нём
 * встречались разные кланы.
 *
 * Механики для этого не потребовалось никакой: вражда выводится из РАЗНЫХ
 * сторон (`isHostileAllegiance`), боевой пилот уже отбирает цели по ней, а
 * `stepAirCombat` уже включён в кадр машины. Изменилась одна строка паспорта —
 * и это ровно та проверка, ради которой признак живёт в паспорте, а не в бою.
 *
 * ЧИСЛА ПРЕДЕЛОВ ПРИХОДЯТ ИЗ ДВУХ РАЗНЫХ МЕСТ, И ЭТО НАМЕРЕННО.
 * `maxRudderForce` и `rudderReferenceSpeed` взяты у паспорта как есть: они не
 * зависят от массы (руля у машины нет вовсе, тоннели работают на месте).
 * `enginePower` и `lateralThrust` — из `rangeDuctHexacopter.ts`, потому что
 * ЗАВИСЯТ, а паспорт считал их до того, как машина собралась, и промахнулся
 * ровно вдвое по массе. Из паспорта взята выводимость, а не цифра.
 */
export const DUCT_HEXACOPTER_RANGE_AIR_VEHICLE: AirVehicleDefinition = {
  ...ductHexacopterRangeFrame,
  allegiance: YAQUI_ALLEGIANCE,
  armament: ductHexacopterRangeBlueprint.armament,
  departure: {
    target: {
      id: "duct-hexacopter-range:departure",
      kind: "departure",
      cue: "duct-hexacopter-uncrewed-flight",
      actions: [{ id: "lap", labelKey: "hint.yaquiDeparture.action" }],
    },
    point: DUCT_HEXACOPTER_RANGE_DISPATCH_POINT,
    flightKind: "lap",
    // Шире, чем у RAX-8 (2.4/3.2): машина вдвое тяжелее и на полтора метра
    // шире, и подходить к ней вплотную человеку незачем.
    approachRadius: 3,
    releaseRadius: 4,
    heightTolerance: 2.3,
  },
  flight: {
    limits: {
      enginePower: DUCT_HEXACOPTER_RANGE_LIMITS.enginePower,
      enginePoints: ductHexacopterRangeBlueprint.enginePoints,
      rotorCapacityWeights: ductHexacopterRangeBlueprint.rotorCapacityWeights,
      rotorSpinDirections: ductHexacopterRangeBlueprint.rotorSpinDirections,
      // Тоннели с ПРИБИТОЙ тягой, а не с паспортной: паспорт сам оставил это
      // рантайму, и 1030 Н на собранном теле дают вдвое больше углового
      // ускорения, чем нужно.
      yawThrusters: ductHexacopterRangeYawThrusters,
      maxRudderForce: DUCT_HEXACOPTER_PROPOSED_LIMITS.maxRudderForce,
      rudderReferenceSpeed: DUCT_HEXACOPTER_PROPOSED_LIMITS.rudderReferenceSpeed,
      rudderPoint: ductHexacopterRangeBlueprint.mooringPoint,
      liftTrimRange: ductHexacopterRangeBlueprint.flight.liftTrimRange,
      lateralThrust: DUCT_HEXACOPTER_RANGE_LIMITS.lateralThrust,
    },
    approach: {
      heading: [ductHexacopterRangeFrame.nose[0], ductHexacopterRangeFrame.nose[2]],
      tolerance: { position: 4.2, heading: 0.4, speed: 2.8 },
    },
    docking: {
      position: 1.5,
      height: 0.5,
      headingCos: 0,
      speed: 0.34,
      verticalSpeed: 0.5,
      uprightCos: 0.96,
      angularSpeed: 0.2,
    },
    landing: {
      // Допуск посадки — от габарита машины, а не от чужого числа: у неё
      // полуразмах 3.64 против 2.9 у RAX-8, и опоры расставлены шире.
      radius: 1.4,
      height: 0.5,
      speed: 0.4,
      verticalSpeed: 0.55,
      uprightCos: 0.978,
      angularSpeed: 0.22,
    },
    spoolSeconds: ductHexacopterRangeBlueprint.flight.spoolSeconds,
    underwaySeconds: 6,
    // Медленнее RAX-8 (31): кольца этой машины крупнее, и на его оборотах
    // концы лопастей читались бы размытым диском вместо винта.
    driveAnimation: { kind: "propeller", phaseSpeed: 26, shaftAxis: [0, 1, 0] },
    linearDamping: ductHexacopterRangeBlueprint.flight.linearDamping,
    angularDamping: ductHexacopterRangeBlueprint.flight.angularDamping,
    lateralDragRatio: ductHexacopterRangeBlueprint.flight.lateralDragRatio,
    liftSource: "rotor",
    liftReserve: ductHexacopterRangeBlueprint.flight.liftReserve,
    maximumTilt: ductHexacopterRangeBlueprint.flight.maximumTilt,
    /**
     * ВОРОТА ВОЗМУЩЕНИЯ СТОЯТ ВЫШЕ ТОГО, ЧТО ПРОСИТ ТРАССА, — И НИЖЕ ТОГО, ЧТО
     * ПРОСИТ ФИГУРА. Второе не упущение, а признание невозможного.
     *
     * Прежние 1.4/1.1 были посчитаны под круг: 14 м/с по дуге радиусом 39.7
     * дают 0.35 рад/с, троекратный запас — 1.05. Круга больше нет. У программы
     * овал с разворотами радиусом 39.7 на двадцати метрах в секунду и пять
     * номеров, и замер на стенде пад-в-пад даёт другие числа: вне фигур
     * корпус разгоняется до 1.14 рад/с по наклону и 0.70 по рысканию.
     * Отсюда 2.4 и 1.4 — вдвое над замеренным, как и было задумано.
     *
     * А ВНУТРИ ФИГУРЫ ПОРОГА, КОТОРЫЙ РАБОТАЛ БЫ, НЕ СУЩЕСТВУЕТ. Бочка
     * раскручивает корпус до 4.67 рад/с: это не срыв, это сама фигура. Ворота,
     * пропускающие бочку, не поймали бы уже ничего. Поэтому фигуру защищает не
     * порог, а знание о том, что поза ЗАКАЗАНА, — рантайм не пускает корректор
     * в идущий номер, и стенд проверяет, что без этой защиты номера терялись бы.
     */
    guidance: { upsetTiltRate: 2.4, upsetYawRate: 1.4 },
    mooringReach: 0.6,
    /**
     * VX-8 УМЕЕТ УХОДИТЬ С ПРИЦЕЛА. Числа выведены, а не выбраны:
     *
     *  - 16 м/с схода: ракета идёт 96 м/с и на полусекунде подлёта уводит
     *    промах на восемь метров — этого хватает против радиуса поражения в
     *    два метра, и это по силам машине с её тоннелями;
     *  - 0.8 с рывка как основа: манёвр обязан пережить уже выпущенную
     *    ракету, а не оборваться за миг до её прохода;
     *  - габарит 2.6 м и запас 2.5 м: вместе с радиусом поражения дают ответ
     *    «попадёт ли», а без запаса решение принималось бы ровно на границе;
     *  - горизонт 2.5 с: дальше ракета ещё слишком далеко, чтобы тратить на
     *    неё манёвр, и решение спокойно примет следующий кадр.
     */
    evasion: {
      breakSpeed: 16,
      breakSeconds: 0.8,
      radius: 2.6,
      margin: 2.5,
      horizonSeconds: 2.5,
    },
    routePlan: (_kind, berth) => ductHexacopterLapPlan(berth),
    arrivalPlan: ductHexacopterArrivalPlan,
    escapePlan: ductHexacopterEscapePlan,
    routePhase: (_kind, progress) => ductHexacopterLapPhase(progress),
  },
};

export const airVehicles: readonly AirVehicleDefinition[] = [
  SKY_TRAIN_AIR_VEHICLE,
  SKY_LONGSHIP_AIR_VEHICLE,
  TOWN_AIRSHIP_AIR_VEHICLE,
  BASALT_SKY_RAM_AIR_VEHICLE,
  TOWN_HEXACOPTER_AIR_VEHICLE,
  NIMBUS_HEXACOPTER_AIR_VEHICLE,
  SR6_SKAT_AIR_VEHICLE,
  COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE,
  DUCT_HEXACOPTER_RANGE_AIR_VEHICLE,
];
