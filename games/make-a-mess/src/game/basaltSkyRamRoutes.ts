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

export type BasaltSkyRamFlightKind = "circuit" | "war-patrol";

// Route local X is the ram's longitudinal axis (+world Z); route local Z is
// its authored lateral axis (+world X). The berth sits on the south/rear rim.
const REVERSE_COMPLETE_DISTANCE = 34;
const TURN_COMPLETE_DISTANCE = 72;
const FINAL_GLIDE_DISTANCE = 82;
const FINAL_TURN_RADIUS = 32;
const QUARTER_CIRCLE_HANDLE = 0.5522847498307936;

function midpoint(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
}

/**
 * Split one broad cubic at its midpoint so `arrival-shoulder` can remain a
 * named phase boundary without introducing a corner into the flown line.
 */
function splitArrivalCurve(
  start: SceneVector3,
  controlA: SceneVector3,
  controlB: SceneVector3,
  end: SceneVector3,
): {
  readonly startOutgoing: SceneVector3;
  readonly shoulder: MotionRouteNode;
  readonly endIncoming: SceneVector3;
} {
  const first = midpoint(start, controlA);
  const middle = midpoint(controlA, controlB);
  const last = midpoint(controlB, end);
  const shoulderIncoming = midpoint(first, middle);
  const shoulderOutgoing = midpoint(middle, last);
  return {
    startOutgoing: first,
    shoulder: {
      id: "arrival-shoulder",
      position: midpoint(shoulderIncoming, shoulderOutgoing),
      incoming: shoulderIncoming,
      outgoing: shoulderOutgoing,
      samples: 48,
    },
    endIncoming: last,
  };
}

const FINAL_TURN_POSITION: SceneVector3 = [
  -FINAL_GLIDE_DISTANCE - FINAL_TURN_RADIUS,
  0,
  -FINAL_TURN_RADIUS,
];
const FINAL_ENTRY_POSITION: SceneVector3 = [-FINAL_GLIDE_DISTANCE, 0, 0];
const FINAL_TURN_OUTGOING: SceneVector3 = [
  FINAL_TURN_POSITION[0],
  0,
  FINAL_TURN_POSITION[2] + FINAL_TURN_RADIUS * QUARTER_CIRCLE_HANDLE,
];
const FINAL_ENTRY_INCOMING: SceneVector3 = [
  FINAL_ENTRY_POSITION[0] - FINAL_TURN_RADIUS * QUARTER_CIRCLE_HANDLE,
  0,
  0,
];

const PATROL_WEST_SOUTH: SceneVector3 = [-4, 0, -116];
const patrolArrival = splitArrivalCurve(
  PATROL_WEST_SOUTH,
  [
    PATROL_WEST_SOUTH[0] - 72 / Math.sqrt(5),
    0,
    PATROL_WEST_SOUTH[2] + 36 / Math.sqrt(5),
  ],
  [FINAL_TURN_POSITION[0], 0, FINAL_TURN_POSITION[2] - 68],
  FINAL_TURN_POSITION,
);

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
  // The machine backs out almost level: a tall envelope should not leap from
  // a stone jaw. Once the tail is beyond the cliff it climbs before turning.
  if (distance < 18) {
    return 2.4 * smootherStep(distance / 18);
  }
  if (distance < TURN_COMPLETE_DISTANCE) {
    return 2.4 + (ceiling - 2.4) * smootherStep(
      (distance - 18) / (TURN_COMPLETE_DISTANCE - 18),
    );
  }
  if (remaining < FINAL_GLIDE_DISTANCE) {
    return ceiling * smootherStep(remaining / FINAL_GLIDE_DISTANCE);
  }
  return ceiling;
}

function speedLimit(
  cruiseSpeed: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  // The deceleration stays deliberately gentle — with the gallery far below
  // the lift centre, hard late braking swings the hull — but the profile aims
  // at the berth itself. It used to aim five metres short of it, and that is
  // not a safety margin: it demanded zero speed while the nose was still five
  // metres out, so the machine arrived with no way on at all. From there only
  // the mooring servo closed the gap, and its commanded speed is 0.25 x the
  // remaining offset, so the approach went asymptotic exactly where a hard
  // clock runs: 11 s for the last 72 cm, 32 s of the 35 s final-manoeuvre
  // budget, and the ten-second capture timer expiring centimetres short of a
  // docked pose. Braking authority is not the constraint — two engines carry
  // 2.78 m/s^2 against the 0.24 asked for here, in reverse as well.
  const stopping = Math.sqrt(2 * 0.24 * remaining);
  if (distance < REVERSE_COMPLETE_DISTANCE - 4) {
    return Math.min(2.35, stopping);
  }
  if (distance < TURN_COMPLETE_DISTANCE) {
    return Math.min(1.65, stopping);
  }
  return Math.min(cruiseSpeed, stopping);
}

function routeDefinition(kind: BasaltSkyRamFlightKind): MotionRouteDefinition {
  const compact = kind === "circuit";
  return {
    id: `basalt-sky-ram:${kind}`,
    nodes: [
      { id: "berth", position: [0, 0, 0] },
      { id: "reverse-clear", position: [-20, 0, 0] },
      {
        id: "tail-clear",
        position: [-34, 0, 0],
        outgoing: [-48, 0, compact ? 5 : 8],
      },
      {
        id: "turn-clear",
        position: compact ? [-45, 0, 34] : [-52, 0, 42],
        incoming: compact ? [-48, 0, 17] : [-56, 0, 22],
        outgoing: compact ? [-34, 0, 56] : [-38, 0, 72],
        samples: 56,
      },
      {
        id: "east-south",
        position: compact ? [-12, 0, 78] : [-18, 0, 104],
        incoming: compact ? [-24, 0, 68] : [-30, 0, 90],
        outgoing: compact ? [10, 0, 94] : [8, 0, 120],
        samples: 56,
      },
      {
        id: "east",
        position: compact ? [47, 0, 100] : [44, 0, 124],
        incoming: compact ? [25, 0, 100] : [22, 0, 126],
        outgoing: compact ? [72, 0, 98] : [76, 0, 120],
        samples: 56,
      },
      {
        id: "east-north",
        position: compact ? [104, 0, 72] : [112, 0, 84],
        incoming: compact ? [88, 0, 88] : [94, 0, 105],
        outgoing: compact ? [116, 0, 52] : [128, 0, 58],
        samples: 56,
      },
      {
        id: "north",
        position: compact ? [128, 0, 18] : [142, 0, 18],
        incoming: compact ? [124, 0, 37] : [140, 0, 38],
        outgoing: compact ? [127, 0, -12] : [142, 0, -20],
        samples: 56,
      },
      {
        id: "north-west",
        position: compact ? [108, 0, -62] : [119, 0, -82],
        incoming: compact ? [122, 0, -42] : [137, 0, -55],
        outgoing: compact ? [88, 0, -86] : [94, 0, -108],
        samples: 56,
      },
      {
        id: "west",
        // Both patrols need the same long landing pattern. The old compact
        // variant shortened this turn and the carrier entered the final line
        // 9.6 m off-axis — well outside the real nose-capture gate.
        position: [57, 0, -123],
        incoming: [78, 0, -122],
        outgoing: [26, 0, -127],
        samples: 56,
      },
      {
        id: "west-south",
        position: PATROL_WEST_SOUTH,
        incoming: [12, 0, -124],
        outgoing: patrolArrival.startOutgoing,
        samples: 56,
      },
      {
        ...patrolArrival.shoulder,
      },
      {
        id: "final-turn",
        position: FINAL_TURN_POSITION,
        incoming: patrolArrival.endIncoming,
        outgoing: FINAL_TURN_OUTGOING,
        samples: 48,
      },
      {
        id: "final-entry",
        position: FINAL_ENTRY_POSITION,
        incoming: FINAL_ENTRY_INCOMING,
        samples: 48,
      },
      { id: "dock", position: [0, 0, 0] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: (context) => altitude(compact ? 30 : 38, context),
      speedLimit: (context) => speedLimit(compact ? 6.4 : 7.2, context),
    },
    markers: {
      reverseComplete: "tail-clear",
      departureComplete: "turn-clear",
      arrivalCapture: "west-south",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<BasaltSkyRamFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(routeDefinition("circuit")),
  "war-patrol": createMotionRoute(routeDefinition("war-patrol")),
};

function placeLocal(
  berth: SceneVector3,
  local: SceneVector3,
  altitudeValue: number,
): SceneVector3 {
  return [
    berth[0] + local[2],
    berth[1] + altitudeValue,
    berth[2] + local[0],
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

export function basaltSkyRamRoute(
  kind: BasaltSkyRamFlightKind,
): MotionRouteArtifact {
  return ROUTES[kind];
}

export function basaltSkyRamPlan(
  kind: BasaltSkyRamFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = basaltSkyRamRoute(kind);
  return placeRoute(
    route,
    berth,
    route.markerProgress("final"),
    route.markerProgress("reverseComplete"),
  );
}

const REMOTE_WEST: SceneVector3 = [10, 0, -102];
const remoteArrival = splitArrivalCurve(
  REMOTE_WEST,
  [
    REMOTE_WEST[0] - 108 / Math.sqrt(10),
    0,
    REMOTE_WEST[2] + 36 / Math.sqrt(10),
  ],
  [FINAL_TURN_POSITION[0], 0, FINAL_TURN_POSITION[2] - 72],
  FINAL_TURN_POSITION,
);

const ARRIVAL = createMotionRoute({
  id: "basalt-sky-ram:arrival",
  nodes: [
    {
      id: "remote-entry",
      position: [76, 0, -146],
      outgoing: [52, 0, -128],
    },
    {
      id: "west",
      position: REMOTE_WEST,
      incoming: [30, 0, -116],
      outgoing: remoteArrival.startOutgoing,
      samples: 64,
    },
    {
      ...remoteArrival.shoulder,
    },
    {
      id: "final-turn",
      position: FINAL_TURN_POSITION,
      incoming: remoteArrival.endIncoming,
      outgoing: FINAL_TURN_OUTGOING,
      samples: 48,
    },
    {
      id: "final-entry",
      position: FINAL_ENTRY_POSITION,
      incoming: FINAL_ENTRY_INCOMING,
      samples: 48,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ remaining }) => 38 * smootherStep(remaining / 165),
    speedLimit: (context) => speedLimit(7, {
      ...context,
      distance: TURN_COMPLETE_DISTANCE,
    }),
  },
  markers: {
    arrivalCapture: "remote-entry",
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

export function basaltSkyRamArrivalPlan(
  berth: SceneVector3,
): VehicleRoutePlan {
  return placeRoute(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

function localOffsetFromWorldAxes(offset: SceneVector3): SceneVector3 {
  return [offset[2], offset[1], offset[0]];
}

export function basaltSkyRamEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const start = localOffsetFromWorldAxes(input.start);
  const horizontalLength = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const localForward: SceneVector3 = [
    input.forward[2] / horizontalLength,
    0,
    input.forward[0] / horizontalLength,
  ];
  const localRight: SceneVector3 = [localForward[2], 0, -localForward[0]];
  const relativePoint = (forward: number, right: number): SceneVector3 => [
    start[0] + localForward[0] * forward + localRight[0] * right,
    0,
    start[2] + localForward[2] * forward + localRight[2] * right,
  ];
  let reverseComplete = 0;
  let climbComplete = 1;
  const route = createMotionRoute({
    id: "basalt-sky-ram:emergency-escape",
    nodes: [
      {
        id: "failure-pose",
        position: [start[0], 0, start[2]],
        outgoing: relativePoint(-10, 0),
      },
      {
        id: "reverse-clear",
        position: relativePoint(-22, 0),
        incoming: relativePoint(-18, 0),
        outgoing: relativePoint(-30, 7),
        samples: 36,
      },
      {
        id: "climbing-turn",
        position: relativePoint(-12, 45),
        incoming: relativePoint(-28, 30),
        outgoing: relativePoint(12, 62),
        samples: 64,
      },
      {
        id: "recovery-gate",
        position: relativePoint(68, 88),
        incoming: relativePoint(42, 78),
        outgoing: relativePoint(96, 102),
        samples: 56,
      },
      {
        id: "horizon-exit",
        position: relativePoint(154, 126),
        incoming: relativePoint(125, 112),
        samples: 64,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => {
        if (progress <= reverseComplete) {
          return start[1];
        }
        return start[1] + 26 * smootherStep(
          (progress - reverseComplete) /
            Math.max(1e-6, climbComplete - reverseComplete),
        );
      },
      speedLimit: ({ progress }) => {
        if (progress < reverseComplete) return 2.2;
        if (progress < climbComplete) return 3.8;
        return 6.8;
      },
    },
    markers: {
      reverseComplete: "reverse-clear",
      climbComplete: "climbing-turn",
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
    guidanceLookahead(progress) {
      if (progress < reverseComplete) return 8;
      if (progress < climbComplete) return 18;
      return 50;
    },
  };
}

export function basaltSkyRamRoutePhase(
  kind: BasaltSkyRamFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    basaltSkyRamRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}
