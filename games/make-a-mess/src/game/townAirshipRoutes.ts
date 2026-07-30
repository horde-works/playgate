import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRouteDefinition,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

export type TownAirshipFlightKind = "circuit" | "tour";

const HEADING = -1.451;
export const TOWN_AIRSHIP_NOSE: SceneVector3 = [
  -Math.cos(HEADING),
  0,
  -Math.sin(HEADING),
];
const TOWN_AIRSHIP_LATERAL: SceneVector3 = [
  -Math.sin(HEADING),
  0,
  Math.cos(HEADING),
];

const REVERSE_COMPLETE_DISTANCE = 38;
const DEPARTURE_CLEAR_DISTANCE = 135;
const FINAL_GLIDE_DISTANCE = 78;
const BERTH_CORRIDOR_ALTITUDE = 13;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function altitude(
  ceiling: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  // First the ship backs away from the mast and gains a little height. It
  // reaches the high-clear shelf before the route asks it to leave the berth
  // corridor and turn toward the city.
  if (distance < 18) {
    return 4.5 * smootherStep(distance / 18);
  }
  if (distance < REVERSE_COMPLETE_DISTANCE) {
    return 4.5 + 8.5 * smootherStep(
      (distance - 18) / (REVERSE_COMPLETE_DISTANCE - 18),
    );
  }
  if (distance < DEPARTURE_CLEAR_DISTANCE) {
    return BERTH_CORRIDOR_ALTITUDE +
      (ceiling - BERTH_CORRIDOR_ALTITUDE) * smootherStep(
      (distance - REVERSE_COMPLETE_DISTANCE) /
        (DEPARTURE_CLEAR_DISTANCE - REVERSE_COMPLETE_DISTANCE),
    );
  }
  if (remaining < FINAL_GLIDE_DISTANCE) {
    // The return has already descended to the 13 m berth corridor. Continue
    // from that same shelf to the mast; jumping back to cruise ceiling here
    // used to demand an impossible +15/+23 m climb at the final-glide seam.
    return BERTH_CORRIDOR_ALTITUDE *
      smootherStep(remaining / FINAL_GLIDE_DISTANCE);
  }
  if (remaining < DEPARTURE_CLEAR_DISTANCE) {
    return BERTH_CORRIDOR_ALTITUDE +
      (ceiling - BERTH_CORRIDOR_ALTITUDE) * smootherStep(
      (remaining - FINAL_GLIDE_DISTANCE) /
        (DEPARTURE_CLEAR_DISTANCE - FINAL_GLIDE_DISTANCE),
    );
  }
  return ceiling;
}

function speedLimit(
  cruiseSpeed: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  const stopping = Math.sqrt(2 * 0.35 * Math.max(0, remaining - 4));
  if (distance < REVERSE_COMPLETE_DISTANCE - 4) {
    return Math.min(3.1, stopping);
  }
  if (distance < REVERSE_COMPLETE_DISTANCE + 18) {
    // A low demand leaves authority for the differential-thrust pivot after
    // the ship has backed clear and reached the upper shelf.
    return Math.min(1.8, stopping);
  }
  return Math.min(cruiseSpeed, stopping);
}

function routeDefinition(
  kind: TownAirshipFlightKind,
): MotionRouteDefinition {
  const compact = kind === "circuit";
  return {
    id: `town-airship:${kind}`,
    nodes: [
      { id: "berth", position: [0, 0, 0] },
      { id: "reverse-clear", position: [-18, 0, 0] },
      {
        id: "high-clear",
        position: [-38, 0, 0],
        outgoing: [-54, 0, compact ? 3 : 5],
      },
      {
        id: "south-west",
        position: compact ? [-65, 0, 15] : [-78, 0, 18],
        incoming: compact ? [-64, 0, 5] : [-76, 0, 5],
        outgoing: compact ? [-78, 0, 32] : [-96, 0, 34],
        samples: 56,
      },
      {
        id: "south",
        position: compact ? [-76, 0, 55] : [-98, 0, 58],
        incoming: compact ? [-78, 0, 42] : [-100, 0, 44],
        outgoing: compact ? [-75, 0, 82] : [-96, 0, 93],
        samples: 56,
      },
      {
        id: "south-east",
        position: compact ? [-55, 0, 108] : [-78, 0, 128],
        incoming: compact ? [-70, 0, 96] : [-92, 0, 116],
        outgoing: compact ? [-35, 0, 126] : [-52, 0, 151],
        samples: 56,
      },
      {
        id: "east",
        position: compact ? [0, 0, 130] : [-5, 0, 158],
        incoming: compact ? [-22, 0, 132] : [-30, 0, 160],
        outgoing: compact ? [28, 0, 128] : [28, 0, 158],
        samples: 56,
      },
      {
        id: "north-east",
        position: compact ? [64, 0, 108] : [76, 0, 136],
        incoming: compact ? [45, 0, 123] : [56, 0, 153],
        outgoing: compact ? [80, 0, 88] : [99, 0, 112],
        samples: 56,
      },
      {
        id: "north",
        position: compact ? [84, 0, 55] : [108, 0, 64],
        incoming: compact ? [84, 0, 75] : [110, 0, 84],
        outgoing: compact ? [82, 0, 32] : [104, 0, 33],
        samples: 56,
      },
      {
        id: "north-west",
        position: compact ? [63, 0, 2] : [82, 0, -24],
        incoming: compact ? [78, 0, 18] : [102, 0, 4],
        outgoing: compact ? [43, 0, -14] : [55, 0, -48],
        samples: 56,
      },
      {
        id: "west",
        position: compact ? [10, 0, -22] : [12, 0, -58],
        incoming: compact ? [30, 0, -22] : [40, 0, -60],
        outgoing: compact ? [-22, 0, -22] : [-22, 0, -56],
        samples: 56,
      },
      {
        id: "arrival-shoulder",
        position: compact ? [-58, 0, -28] : [-70, 0, -36],
        incoming: compact ? [-42, 0, -24] : [-50, 0, -48],
        outgoing: compact ? [-76, 0, -15] : [-88, 0, -18],
        samples: 56,
      },
      {
        id: "final-entry",
        position: [-68, 0, 0],
        incoming: [-82, 0, 0],
        outgoing: [-40, 0, 0],
        samples: 48,
      },
      { id: "dock", position: [0, 0, 0] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: (context) => altitude(compact ? 28 : 36, context),
      speedLimit: (context) => speedLimit(compact ? 7.2 : 8.2, context),
    },
    markers: {
      reverseComplete: "high-clear",
      departureComplete: "south-west",
      arrivalCapture: "west",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<TownAirshipFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(routeDefinition("circuit")),
  tour: createMotionRoute(routeDefinition("tour")),
};

function placeLocal(
  berth: SceneVector3,
  local: SceneVector3,
  altitudeValue: number,
): SceneVector3 {
  return [
    berth[0] + TOWN_AIRSHIP_NOSE[0] * local[0] +
      TOWN_AIRSHIP_LATERAL[0] * local[2],
    berth[1] + altitudeValue,
    berth[2] + TOWN_AIRSHIP_NOSE[2] * local[0] +
      TOWN_AIRSHIP_LATERAL[2] * local[2],
  ];
}

function placeRoute(
  route: MotionRouteArtifact,
  berth: SceneVector3,
  finalFrom: number,
  reverseUntil = -1,
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
    travelDirection(progress) {
      return progress < reverseUntil ? -1 : 1;
    },
    finalFrom,
  };
}

export function townAirshipRoute(
  kind: TownAirshipFlightKind,
): MotionRouteArtifact {
  return ROUTES[kind];
}

export function townAirshipPlan(
  kind: TownAirshipFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = townAirshipRoute(kind);
  return placeRoute(
    route,
    berth,
    route.markerProgress("final"),
    route.markerProgress("reverseComplete"),
  );
}

const ARRIVAL = createMotionRoute({
  id: "town-airship:arrival",
  nodes: [
    {
      id: "remote-entry",
      position: [72, 0, -145],
      outgoing: [35, 0, -132],
    },
    {
      id: "west",
      position: [-5, 0, -82],
      incoming: [18, 0, -110],
      outgoing: [-38, 0, -58],
      samples: 64,
    },
    {
      id: "arrival-shoulder",
      position: [-70, 0, -34],
      incoming: [-52, 0, -50],
      outgoing: [-88, 0, -16],
      samples: 56,
    },
    {
      id: "final-entry",
      position: [-68, 0, 0],
      incoming: [-82, 0, 0],
      outgoing: [-40, 0, 0],
      samples: 48,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ remaining }) => 34 * smootherStep(remaining / 150),
    speedLimit: (context) => speedLimit(8, {
      ...context,
      distance: DEPARTURE_CLEAR_DISTANCE,
    }),
  },
  markers: {
    arrivalCapture: "remote-entry",
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

export function townAirshipArrivalPlan(
  berth: SceneVector3,
): VehicleRoutePlan {
  return placeRoute(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

function localOffsetFromWorldAxes(offset: SceneVector3): SceneVector3 {
  return [
    offset[0] * TOWN_AIRSHIP_NOSE[0] +
      offset[2] * TOWN_AIRSHIP_NOSE[2],
    offset[1],
    offset[0] * TOWN_AIRSHIP_LATERAL[0] +
      offset[2] * TOWN_AIRSHIP_LATERAL[2],
  ];
}

export function townAirshipEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  // `input.start` is the carrier body's offset from its authored berth, not a
  // world point. Subtracting the berth here used to turn the docked pose into
  // world zero, so the city airship dived through the buildings toward y=0.
  const start = localOffsetFromWorldAxes(input.start);
  const forwardLength = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [
    input.forward[0] / forwardLength,
    0,
    input.forward[2] / forwardLength,
  ];
  const localForward: SceneVector3 = [
    forward[0] * TOWN_AIRSHIP_NOSE[0] +
      forward[2] * TOWN_AIRSHIP_NOSE[2],
    0,
    forward[0] * TOWN_AIRSHIP_LATERAL[0] +
      forward[2] * TOWN_AIRSHIP_LATERAL[2],
  ];
  // In the airship-local horizontal plane +b is port, hence starboard — a
  // clockwise turn viewed from above — is the negative quarter-turn below.
  const localRight: SceneVector3 = [
    localForward[2],
    0,
    -localForward[0],
  ];
  const relativePoint = (
    forwardDistance: number,
    rightDistance: number,
  ): SceneVector3 => [
    start[0] + localForward[0] * forwardDistance +
      localRight[0] * rightDistance,
    0,
    start[2] + localForward[2] * forwardDistance +
      localRight[2] * rightDistance,
  ];
  const reverseClear = relativePoint(-16, 0);
  const reverseIncoming = relativePoint(-14, 0);
  const reverseOutgoing = relativePoint(2, 5);
  const clockwiseTurn = relativePoint(12, 38);
  const turnIncoming = relativePoint(0, 30);
  const turnOutgoing = relativePoint(30, 56);
  let reverseComplete = 0;
  let climbComplete = 1;
  const route = createMotionRoute({
    id: "town-airship:emergency-escape",
    nodes: [
      {
        id: "failure-pose",
        position: [start[0], 0, start[2]],
        outgoing: relativePoint(-8, 0),
      },
      {
        id: "reverse-clear",
        position: reverseClear,
        incoming: reverseIncoming,
        outgoing: reverseOutgoing,
        samples: 32,
      },
      {
        id: "clockwise-turn",
        position: clockwiseTurn,
        incoming: turnIncoming,
        outgoing: turnOutgoing,
        samples: 64,
      },
      {
        id: "recovery-gate",
        position: [start[0] + 70, 0, start[2] - 65],
        incoming: [start[0] + 50, 0, start[2] - 45],
        outgoing: [start[0] + 100, 0, start[2] - 95],
        samples: 56,
      },
      {
        id: "horizon-exit",
        position: [start[0] + 155, 0, start[2] - 155],
        incoming: [start[0] + 130, 0, start[2] - 125],
        samples: 64,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => {
        if (progress <= reverseComplete) {
          return start[1];
        }
        return start[1] + 20 * smootherStep(
          (progress - reverseComplete) /
            Math.max(1e-6, climbComplete - reverseComplete),
        );
      },
      speedLimit: ({ progress }) => {
        if (progress < reverseComplete) {
          return 2.8;
        }
        if (progress < climbComplete) {
          return 4.2;
        }
        // The horizon is an exit marker, so the healthy carrier does not
        // brake back into the city after completing the climbing turn.
        return 8;
      },
    },
    markers: {
      reverseComplete: "reverse-clear",
      climbComplete: "clockwise-turn",
      recoveryGate: "recovery-gate",
      disappear: "horizon-exit",
    },
  });
  reverseComplete = route.markerProgress("reverseComplete");
  climbComplete = route.markerProgress("climbComplete");
  const placed = placeRoute(
    route,
    berth,
    Number.POSITIVE_INFINITY,
    reverseComplete,
  );
  return {
    ...placed,
    // The standard 52 m cruise horizon sees through the entire short backing
    // leg and tries to turn before the tail has cleared the mast. Confined
    // recovery deliberately looks only along its current manoeuvre.
    guidanceLookahead(progress) {
      if (progress < reverseComplete) {
        return 8;
      }
      if (progress < climbComplete) {
        return 18;
      }
      return 52;
    },
  };
}

export function townAirshipRoutePhase(
  kind: TownAirshipFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    townAirshipRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}
