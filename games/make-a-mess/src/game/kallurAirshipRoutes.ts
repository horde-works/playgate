import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRouteDefinition,
  type MotionRouteNode,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

/**
 * Kallur airship routes: the standard circuit is an IRREGULAR ring around
 * the island (Igor's verdict), flown from the summit platform berth. Same
 * flight-stage grammar as the terminal ship: departure → cruise →
 * approach, with the berth shelf and the final entry riding the ship's
 * own nose axis. The berth sits at ~89 m on the mountain, so the profile
 * DESCENDS to the sea-level ring and climbs back on approach.
 */

export type KallurAirshipFlightKind = "circuit" | "tour";

/** Placement yaw of the seated ship (canonical +Z nose → world). The
 * routes and the world placement share these numbers by contract; the
 * world test compares them against the actual placement. */
export const KALLUR_AIRSHIP_YAW = -1.328;
export const KALLUR_AIRSHIP_BERTH_ANCHOR: readonly [number, number] = [24, -73];

export const KALLUR_AIRSHIP_NOSE_XZ: readonly [number, number] = [
  Math.sin(KALLUR_AIRSHIP_YAW),
  Math.cos(KALLUR_AIRSHIP_YAW),
];
const LATERAL_XZ: readonly [number, number] = [
  Math.cos(KALLUR_AIRSHIP_YAW),
  -Math.sin(KALLUR_AIRSHIP_YAW),
];

function worldToLocal(world: readonly [number, number]): SceneVector3 {
  const dx = world[0] - KALLUR_AIRSHIP_BERTH_ANCHOR[0];
  const dz = world[1] - KALLUR_AIRSHIP_BERTH_ANCHOR[1];
  return [
    dx * KALLUR_AIRSHIP_NOSE_XZ[0] + dz * KALLUR_AIRSHIP_NOSE_XZ[1],
    0,
    dx * LATERAL_XZ[0] + dz * LATERAL_XZ[1],
  ];
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** The irregular ring, in WORLD XZ: authored radii 130–165 with the
 * island's own asymmetry, no two legs alike. */
const RING_WORLD: readonly (readonly [number, number])[] = [
  [-148, -30],
  [-126, 82],
  [-16, 156],
  [96, 130],
  [152, 30],
  [122, -86],
  [18, -148],
];

const CRUISE_DROP = -48;
const BERTH_SHELF = 4;
const DEPARTURE_SETTLE = 190;
const APPROACH_CLIMB = 230;
const FINAL_GLIDE = 70;

function ringNodes(): MotionRouteNode[] {
  const nodes: MotionRouteNode[] = [];
  for (let index = 0; index < RING_WORLD.length; index += 1) {
    const previous = index === 0
      ? [KALLUR_AIRSHIP_BERTH_ANCHOR[0], KALLUR_AIRSHIP_BERTH_ANCHOR[1]] as const
      : RING_WORLD[index - 1];
    const next = index === RING_WORLD.length - 1
      ? [96, -96] as const
      : RING_WORLD[index + 1];
    const direction = [next[0] - previous[0], next[1] - previous[1]] as const;
    const length = Math.hypot(direction[0], direction[1]) || 1;
    const handle = [
      (direction[0] / length) * 34,
      (direction[1] / length) * 34,
    ] as const;
    const position = RING_WORLD[index];
    nodes.push({
      id: `ring-${index}`,
      position: worldToLocal(position),
      incoming: worldToLocal([position[0] - handle[0], position[1] - handle[1]]),
      outgoing: worldToLocal([position[0] + handle[0], position[1] + handle[1]]),
      samples: 56,
    });
  }
  return nodes;
}

function altitude(
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  if (distance < 16) {
    return BERTH_SHELF * smootherStep(distance / 16);
  }
  if (distance < DEPARTURE_SETTLE) {
    return BERTH_SHELF + (CRUISE_DROP - BERTH_SHELF) * smootherStep(
      (distance - 16) / (DEPARTURE_SETTLE - 16),
    );
  }
  if (remaining < FINAL_GLIDE) {
    return BERTH_SHELF * smootherStep(remaining / FINAL_GLIDE);
  }
  if (remaining < APPROACH_CLIMB) {
    return BERTH_SHELF + (CRUISE_DROP - BERTH_SHELF) * smootherStep(
      (remaining - FINAL_GLIDE) / (APPROACH_CLIMB - FINAL_GLIDE),
    );
  }
  return CRUISE_DROP;
}

function speedLimit(
  cruiseSpeed: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  const stopping = Math.sqrt(2 * 0.35 * Math.max(0, remaining - 3));
  if (distance < 22) {
    return Math.min(2.6, Math.max(1.2, distance / 6));
  }
  return Math.min(cruiseSpeed, stopping);
}

function routeDefinition(kind: KallurAirshipFlightKind): MotionRouteDefinition {
  const cruise = kind === "circuit" ? 7.4 : 8.2;
  return {
    id: `kallur-airship:${kind}`,
    nodes: [
      { id: "berth", position: [0, 0, 0] },
      {
        id: "lift-clear",
        position: [14, 0, 0],
        outgoing: [26, 0, -2],
      },
      {
        id: "west-descent",
        position: worldToLocal([-52, -56]),
        incoming: worldToLocal([-22, -62]),
        outgoing: worldToLocal([-86, -48]),
        samples: 56,
      },
      ...ringNodes(),
      {
        id: "arrival-shoulder",
        position: worldToLocal([96, -96]),
        incoming: worldToLocal([110, -118]),
        outgoing: worldToLocal([80, -84]),
        samples: 56,
      },
      {
        id: "final-entry",
        position: [-62, 0, 0],
        incoming: [-78, 0, 0],
        outgoing: [-38, 0, 0],
        samples: 48,
      },
      { id: "dock", position: [0, 0, 0] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude,
      speedLimit: (context) => speedLimit(cruise, context),
    },
    markers: {
      departureComplete: "west-descent",
      arrivalCapture: "ring-6",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<KallurAirshipFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(routeDefinition("circuit")),
  tour: createMotionRoute(routeDefinition("tour")),
};

function placeLocal(
  berth: SceneVector3,
  local: SceneVector3,
  altitudeValue: number,
): SceneVector3 {
  return [
    berth[0] + KALLUR_AIRSHIP_NOSE_XZ[0] * local[0] + LATERAL_XZ[0] * local[2],
    berth[1] + altitudeValue,
    berth[2] + KALLUR_AIRSHIP_NOSE_XZ[1] * local[0] + LATERAL_XZ[1] * local[2],
  ];
}

function placeRoute(
  route: MotionRouteArtifact,
  berth: SceneVector3,
  finalFrom: number,
): VehicleRoutePlan {
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      return placeLocal(
        berth,
        route.point(progress),
        route.requirement("altitude", progress),
      );
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return berth[1] + route.requirement("altitude", progress);
    },
    finalFrom,
  };
}

export function kallurAirshipRoute(
  kind: KallurAirshipFlightKind,
): MotionRouteArtifact {
  return ROUTES[kind];
}

export function kallurAirshipPlan(
  kind: KallurAirshipFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = kallurAirshipRoute(kind);
  return placeRoute(route, berth, route.markerProgress("final"));
}

/** Initial arrival: in from the south-west sea, around the north cape,
 * then the same eastern final over the saddle the circuit uses. */
const ARRIVAL = createMotionRoute({
  id: "kallur-airship:arrival",
  nodes: [
    {
      id: "remote-entry",
      position: worldToLocal([-190, 150]),
      outgoing: worldToLocal([-168, 108]),
    },
    {
      id: "west-offing",
      position: worldToLocal([-150, -16]),
      incoming: worldToLocal([-160, 34]),
      outgoing: worldToLocal([-130, -70]),
      samples: 64,
    },
    {
      id: "north-cape",
      position: worldToLocal([16, -150]),
      incoming: worldToLocal([-58, -138]),
      outgoing: worldToLocal([66, -142]),
      samples: 64,
    },
    {
      id: "arrival-shoulder",
      position: worldToLocal([96, -96]),
      incoming: worldToLocal([110, -118]),
      outgoing: worldToLocal([80, -84]),
      samples: 56,
    },
    {
      id: "final-entry",
      position: [-62, 0, 0],
      incoming: [-78, 0, 0],
      outgoing: [-38, 0, 0],
      samples: 48,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ remaining }) => {
      if (remaining < FINAL_GLIDE) {
        return BERTH_SHELF * smootherStep(remaining / FINAL_GLIDE);
      }
      if (remaining < APPROACH_CLIMB) {
        return BERTH_SHELF + (CRUISE_DROP - BERTH_SHELF) * smootherStep(
          (remaining - FINAL_GLIDE) / (APPROACH_CLIMB - FINAL_GLIDE),
        );
      }
      return CRUISE_DROP;
    },
    speedLimit: (context) => speedLimit(8, context),
  },
  markers: {
    arrivalCapture: "north-cape",
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

export function kallurAirshipArrivalPlan(
  berth: SceneVector3,
): VehicleRoutePlan {
  return placeRoute(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

function localOffsetFromWorldAxes(offset: SceneVector3): SceneVector3 {
  return [
    offset[0] * KALLUR_AIRSHIP_NOSE_XZ[0] + offset[2] * KALLUR_AIRSHIP_NOSE_XZ[1],
    offset[1],
    offset[0] * LATERAL_XZ[0] + offset[2] * LATERAL_XZ[1],
  ];
}

/** Emergency escape: back off the summit, climbing turn to seaward (west),
 * exit over the horizon — the town-airship recovery grammar on an open
 * mountain instead of a city. */
export function kallurAirshipEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const start = localOffsetFromWorldAxes(input.start);
  const forwardLength = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [
    input.forward[0] / forwardLength,
    0,
    input.forward[2] / forwardLength,
  ];
  const localForward = localOffsetFromWorldAxes(forward);
  const localRight: SceneVector3 = [localForward[2], 0, -localForward[0]];
  const relativePoint = (
    forwardDistance: number,
    rightDistance: number,
  ): SceneVector3 => [
    start[0] + localForward[0] * forwardDistance + localRight[0] * rightDistance,
    0,
    start[2] + localForward[2] * forwardDistance + localRight[2] * rightDistance,
  ];
  let reverseComplete = 0;
  let climbComplete = 1;
  const route = createMotionRoute({
    id: "kallur-airship:emergency-escape",
    nodes: [
      {
        id: "failure-pose",
        position: [start[0], 0, start[2]],
        outgoing: relativePoint(-8, 0),
      },
      {
        id: "reverse-clear",
        position: relativePoint(-15, 0),
        incoming: relativePoint(-13, 0),
        outgoing: relativePoint(2, 5),
        samples: 32,
      },
      {
        id: "seaward-turn",
        position: relativePoint(14, 36),
        incoming: relativePoint(2, 28),
        outgoing: relativePoint(32, 54),
        samples: 64,
      },
      {
        id: "recovery-gate",
        position: [start[0] + 78, 0, start[2] + 55],
        incoming: [start[0] + 56, 0, start[2] + 38],
        outgoing: [start[0] + 108, 0, start[2] + 78],
        samples: 56,
      },
      {
        id: "horizon-exit",
        position: [start[0] + 170, 0, start[2] + 120],
        incoming: [start[0] + 142, 0, start[2] + 95],
        samples: 64,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => {
        if (progress <= reverseComplete) {
          return start[1];
        }
        return start[1] + 18 * smootherStep(
          (progress - reverseComplete) /
            Math.max(1e-6, climbComplete - reverseComplete),
        );
      },
      speedLimit: ({ progress }) => {
        if (progress < reverseComplete) return 2.6;
        if (progress < climbComplete) return 4.2;
        return 8;
      },
    },
    markers: {
      reverseComplete: "reverse-clear",
      climbComplete: "seaward-turn",
      recoveryGate: "recovery-gate",
      disappear: "horizon-exit",
    },
  });
  reverseComplete = route.markerProgress("reverseComplete");
  climbComplete = route.markerProgress("climbComplete");
  const placed = {
    ...placeRoute(route, berth, Number.POSITIVE_INFINITY),
    travelDirection(progress: number) {
      return progress < reverseComplete ? -1 : 1;
    },
  };
  return {
    ...placed,
    guidanceLookahead(progress) {
      if (progress < reverseComplete) return 8;
      if (progress < climbComplete) return 18;
      return 52;
    },
  };
}

export function kallurAirshipRoutePhase(
  kind: KallurAirshipFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    kallurAirshipRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}
