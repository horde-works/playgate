import type { LampEventState, SceneVector3 } from "./destructionScene.ts";
import type { EntryInteractionTarget } from "./entryInteraction.ts";
import type { VehicleRecoveryLifecycle } from "./vehicleFailure.ts";
import type { VehicleGuidanceOverrides } from "./vehicleGuidanceEnvelope.ts";
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
export interface AirVehicleDefinition extends VehicleFrameDefinition {
  readonly departure?: {
    readonly target: EntryInteractionTarget;
    readonly point: SceneVector3;
    readonly flightKind: string;
    readonly approachRadius: number;
    readonly releaseRadius: number;
    readonly heightTolerance: number;
    /** Empty service flights put accidental stowaways back ashore. */
    readonly passengerDropPoint?: SceneVector3;
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
    /** Physical reach of this berth's capture/winch, in metres. */
    readonly mooringReach?: number;
    routePlan(kind: string, berth: SceneVector3): VehicleRoutePlan;
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
    mooringReach: 15,
    routePlan: (kind, berth) =>
      basaltSkyRamPlan(kind as BasaltSkyRamFlightKind, berth),
    arrivalPlan: basaltSkyRamArrivalPlan,
    escapePlan: basaltSkyRamEscapePlan,
    routePhase: (kind, progress) =>
      basaltSkyRamRoutePhase(kind as BasaltSkyRamFlightKind, progress),
  },
};

export const airVehicles: readonly AirVehicleDefinition[] = [
  SKY_TRAIN_AIR_VEHICLE,
  SKY_LONGSHIP_AIR_VEHICLE,
  TOWN_AIRSHIP_AIR_VEHICLE,
  BASALT_SKY_RAM_AIR_VEHICLE,
];
