import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRouteDefinition,
  type MotionRouteNode,
  type MotionRoutePhase,
  type MotionRouteRequirement,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";

export type SkyTrainFlightKind = "circuit" | "tour";

/** Height already held before forward motion begins. */
export const SKY_TRAIN_UNSTICK_HEIGHT = 6.5;

/**
 * The straight part beside the platform is flown level. On arrival the craft
 * first reaches the berth above the structures and only then lowers itself;
 * on departure it clears the platform before it starts climbing away.
 */
export const SKY_TRAIN_FINAL_HEIGHT_SHELF = 20;
/** Last metre is the almost-vertical part of the landing trajectory. */
export const SKY_TRAIN_VERTICAL_LANDING_DISTANCE = 1;

const KAPPA = 0.5522847498307936;

interface RoutePerformance {
  readonly ceiling: number;
  readonly transitionDistance: number;
  readonly cruiseSpeed: number;
}

function smootherStep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function routeRequirements(
  options: RoutePerformance,
): Readonly<Record<string, MotionRouteRequirement>> {
  const altitude = ({ distance, remaining }: MotionRouteRequirementContext): number => {
    if (distance < options.transitionDistance) {
      return SKY_TRAIN_UNSTICK_HEIGHT +
        (options.ceiling - SKY_TRAIN_UNSTICK_HEIGHT) *
          smootherStep(
            (distance - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
              (options.transitionDistance - SKY_TRAIN_FINAL_HEIGHT_SHELF),
          );
    }
    if (remaining < options.transitionDistance) {
      if (remaining < SKY_TRAIN_VERTICAL_LANDING_DISTANCE) {
        return SKY_TRAIN_UNSTICK_HEIGHT *
          smootherStep(remaining / SKY_TRAIN_VERTICAL_LANDING_DISTANCE);
      }
      return SKY_TRAIN_UNSTICK_HEIGHT +
        (options.ceiling - SKY_TRAIN_UNSTICK_HEIGHT) *
          smootherStep(
            (remaining - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
              (options.transitionDistance - SKY_TRAIN_FINAL_HEIGHT_SHELF),
          );
    }
    return options.ceiling;
  };
  const speedLimit = ({ remaining }: MotionRouteRequirementContext): number => {
    // This is a route requirement, not a throttle program. It stays brisk on
    // the glide and asks the controller to brake with the real reversible
    // engines. The former 140 m smooth-step fell almost to zero 30 m out and
    // left a long, powerless coast before the mooring line could reach.
    const stoppingMargin = 4;
    const comfortableDeceleration = 0.35;
    return Math.min(
      options.cruiseSpeed,
      Math.sqrt(
        2 * comfortableDeceleration * Math.max(0, remaining - stoppingMargin),
      ),
    );
  };

  return { altitude, speedLimit };
}

/**
 * The platform flight has one authored outbound half and its exact reflected
 * return. The straight legs, two soft bends and the unique horizon apex are
 * therefore geometry-identical in opposite directions; steering only has to
 * satisfy this path and never receives route-specific commands.
 */
function mirroredPlatformRoute(): MotionRouteDefinition {
  const departure = 64;
  const outer = 105;
  const shoulder = 30;
  const horizon = 100;
  const nodes: readonly MotionRouteNode[] = [
    { id: "berth", position: [0, 0, 0] },
    {
      id: "departure",
      position: [-departure, 0, 0],
      outgoing: [-departure - KAPPA * (outer - departure), 0, 0],
    },
    {
      id: "left-arc",
      position: [-outer, 0, shoulder],
      incoming: [-outer, 0, shoulder - KAPPA * shoulder],
      outgoing: [-outer, 0, shoulder + KAPPA * (horizon - shoulder)],
      samples: 56,
    },
    {
      id: "horizon",
      position: [0, 0, horizon],
      incoming: [-KAPPA * outer, 0, horizon],
      outgoing: [KAPPA * outer, 0, horizon],
      samples: 56,
    },
    {
      id: "right-arc",
      position: [outer, 0, shoulder],
      incoming: [outer, 0, shoulder + KAPPA * (horizon - shoulder)],
      outgoing: [outer, 0, shoulder - KAPPA * shoulder],
      samples: 56,
    },
    {
      id: "final-entry",
      position: [departure, 0, 0],
      incoming: [departure + KAPPA * (outer - departure), 0, 0],
      samples: 56,
    },
    { id: "dock", position: [0, 0, 0] },
  ];

  return {
    id: "sky-train:circuit",
    nodes,
    measureAxes: [0, 2],
    requirements: routeRequirements({
      ceiling: 26,
      transitionDistance: 120,
      cruiseSpeed: 9,
    }),
    markers: {
      departureComplete: "departure",
      final: "final-entry",
    },
  };
}

/** A deliberately uneven, open circle around the city with a safe capture. */
function irregularCityOrbitRoute(): MotionRouteDefinition {
  const nodes: readonly MotionRouteNode[] = [
    { id: "berth", position: [0, 0, 0] },
    {
      id: "departure",
      position: [-40, 0, 0],
      outgoing: [-70, 0, 0],
    },
    {
      id: "west",
      position: [-115, 0, -50],
      incoming: [-115, 0, -15],
      outgoing: [-125, 0, -85],
      samples: 56,
    },
    {
      id: "south-west",
      position: [-90, 0, -145],
      incoming: [-120, 0, -130],
      outgoing: [-60, 0, -175],
      samples: 56,
    },
    {
      id: "south",
      position: [10, 0, -190],
      incoming: [-25, 0, -195],
      outgoing: [50, 0, -190],
      samples: 56,
    },
    {
      id: "south-east",
      position: [110, 0, -150],
      incoming: [85, 0, -180],
      outgoing: [145, 0, -125],
      samples: 56,
    },
    {
      id: "east",
      position: [155, 0, -75],
      incoming: [145, 0, -110],
      outgoing: [165, 0, -50],
      samples: 56,
    },
    {
      id: "north-east",
      position: [165, 0, -30],
      incoming: [165, 0, -50],
      outgoing: [170, 0, -8],
      samples: 56,
    },
    {
      id: "final-entry",
      position: [125, 0, 0],
      incoming: [150, 0, 0],
      samples: 40,
    },
    { id: "dock", position: [0, 0, 0] },
  ];

  return {
    id: "sky-train:tour",
    nodes,
    measureAxes: [0, 2],
    requirements: routeRequirements({
      ceiling: 34,
      transitionDistance: 170,
      cruiseSpeed: 9,
    }),
    markers: {
      departureComplete: "departure",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<SkyTrainFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(mirroredPlatformRoute()),
  tour: createMotionRoute(irregularCityOrbitRoute()),
};

export function skyTrainRoute(kind: SkyTrainFlightKind): MotionRouteArtifact {
  return ROUTES[kind];
}

export function routePoint(kind: SkyTrainFlightKind, progress: number): SceneVector3 {
  const route = skyTrainRoute(kind);
  const point = route.point(progress);
  return [point[0], route.requirement("altitude", progress), point[2]];
}

export function routeLength(kind: SkyTrainFlightKind): number {
  return skyTrainRoute(kind).length;
}

export function routeSpeed(kind: SkyTrainFlightKind, progress: number): number {
  return skyTrainRoute(kind).requirement("speedLimit", progress);
}

export function finalLegFrom(kind: SkyTrainFlightKind): number {
  return skyTrainRoute(kind).markerProgress("final");
}

export function skyTrainRoutePhase(
  kind: SkyTrainFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(skyTrainRoute(kind), progress);
}

export interface FlightPlan {
  readonly kind: SkyTrainFlightKind;
  readonly length: number;
  point(progress: number): SceneVector3;
  speedLimit(progress: number): number;
  altitude(progress: number): number;
  readonly departureUntil: number;
  readonly finalFrom: number;
}

/** Place a reusable local route artifact at a concrete berth. */
export function flightPlan(
  kind: SkyTrainFlightKind,
  berth: SceneVector3,
): FlightPlan {
  const route = skyTrainRoute(kind);
  return {
    kind,
    length: route.length,
    point(progress) {
      const local = routePoint(kind, progress);
      return [berth[0] + local[0], berth[1] + local[1], berth[2] + local[2]];
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return berth[1] + route.requirement("altitude", progress);
    },
    departureUntil: route.markerProgress("departureComplete"),
    finalFrom: route.markerProgress("final"),
  };
}
