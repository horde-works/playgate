import type { SceneVector3 } from "./destructionScene.ts";
import { KALLUR_AIRSHIP_LIFT_LOCAL } from "./kallurAirship.ts";
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
 * Kallur airship routes: a shuttle between the summit stand and the
 * shore stand behind spawn. Down follows the old circuit's direction
 * (west off the mountain, then the south-west ring to the beach). Up
 * is the old climb: the rest of the ring and the eastern final onto
 * the summit. Both ends are wooden pads; the ship is called from the
 * empty one.
 */

export type KallurAirshipFlightKind = "down" | "up" | "circuit" | "tour";

export function kallurAirshipResolvedKind(
  kind: string,
): "down" | "up" {
  return kind === "up" || kind === "tour" ? "up" : "down";
}

/** Placement yaw of the seated ship (canonical +Z nose → world). The
 * routes and the world placement share these numbers by contract; the
 * world test compares them against the actual placement. */
export const KALLUR_AIRSHIP_YAW = -1.328;
export const KALLUR_AIRSHIP_BERTH_ANCHOR: readonly [number, number] = [24, -73];
/** Shore stand, behind spawn; nose points east along the beach. */
export const KALLUR_AIRSHIP_SHORE_YAW = Math.PI / 2;
export const KALLUR_AIRSHIP_SHORE_ANCHOR: readonly [number, number] = [-20, 96.8];

export const KALLUR_AIRSHIP_NOSE_XZ: readonly [number, number] = [
  Math.sin(KALLUR_AIRSHIP_YAW),
  Math.cos(KALLUR_AIRSHIP_YAW),
];
export const KALLUR_AIRSHIP_SHORE_NOSE_XZ: readonly [number, number] = [
  Math.sin(KALLUR_AIRSHIP_SHORE_YAW),
  Math.cos(KALLUR_AIRSHIP_SHORE_YAW),
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
 * island's own asymmetry, no two legs alike. Clockwise, ending on the
 * south-east cape so the eastern final is a continuation, not a 171°
 * hairpin off a south-bound last cruise node. */
const RING_WORLD: readonly (readonly [number, number])[] = [
  [-148, -30],
  [-126, 82],
  [-16, 156],
  [96, 130],
  [152, 30],
  [122, -86],
];

const WEST_DESCENT_WORLD: readonly [number, number] = [-52, -56];
const ARRIVAL_SHOULDER_WORLD: readonly [number, number] = [96, -96];
const LIFT_CLEAR_ALONG = 14;
const PAD_CLEAR_ALONG = 3.2;
const PAD_LIFT = 0.55;
const FINAL_ENTRY_ALONG = -62;
const SHORE_ENTRY_ALONG = -22;
const SHORE_CLEAR_ALONG = 14;
const LIFT_CLEAR_WORLD: readonly [number, number] = [
  KALLUR_AIRSHIP_BERTH_ANCHOR[0] + KALLUR_AIRSHIP_NOSE_XZ[0] * LIFT_CLEAR_ALONG,
  KALLUR_AIRSHIP_BERTH_ANCHOR[1] + KALLUR_AIRSHIP_NOSE_XZ[1] * LIFT_CLEAR_ALONG,
];
const FINAL_ENTRY_WORLD: readonly [number, number] = [
  KALLUR_AIRSHIP_BERTH_ANCHOR[0] + KALLUR_AIRSHIP_NOSE_XZ[0] * FINAL_ENTRY_ALONG,
  KALLUR_AIRSHIP_BERTH_ANCHOR[1] + KALLUR_AIRSHIP_NOSE_XZ[1] * FINAL_ENTRY_ALONG,
];
const SHORE_ENTRY_WORLD: readonly [number, number] = [
  KALLUR_AIRSHIP_SHORE_ANCHOR[0] +
    KALLUR_AIRSHIP_SHORE_NOSE_XZ[0] * SHORE_ENTRY_ALONG,
  KALLUR_AIRSHIP_SHORE_ANCHOR[1] +
    KALLUR_AIRSHIP_SHORE_NOSE_XZ[1] * SHORE_ENTRY_ALONG,
];
const SHORE_CLEAR_WORLD: readonly [number, number] = [
  KALLUR_AIRSHIP_SHORE_ANCHOR[0] +
    KALLUR_AIRSHIP_SHORE_NOSE_XZ[0] * SHORE_CLEAR_ALONG,
  KALLUR_AIRSHIP_SHORE_ANCHOR[1] +
    KALLUR_AIRSHIP_SHORE_NOSE_XZ[1] * SHORE_CLEAR_ALONG,
];
/** East of the shore stand, joining the clockwise ring toward the south-east cape. */
const SHORE_EAST_WORLD: readonly [number, number] = [40, 118];

function liftOffset(yaw: number): readonly [number, number] {
  const x = KALLUR_AIRSHIP_LIFT_LOCAL[0];
  const z = KALLUR_AIRSHIP_LIFT_LOCAL[2];
  return [
    Math.sin(yaw) * z + Math.cos(yaw) * x,
    Math.cos(yaw) * z - Math.sin(yaw) * x,
  ];
}

/** Shore lift centre, expressed so placeRoute(summit lift) lands on it. */
const SHORE_DOCK_WORLD: readonly [number, number] = (() => {
  const shore = liftOffset(KALLUR_AIRSHIP_SHORE_YAW);
  const summit = liftOffset(KALLUR_AIRSHIP_YAW);
  return [
    KALLUR_AIRSHIP_SHORE_ANCHOR[0] + shore[0] - summit[0],
    KALLUR_AIRSHIP_SHORE_ANCHOR[1] + shore[1] - summit[1],
  ];
})();
const CRUISE_DROP = -48;
const DEPARTURE_SETTLE = 190;
const APPROACH_CLIMB = 230;
/** Finish the climb before the straight final, then hold above the pad. */
const FINAL_HEIGHT_SHELF = 70;
/** Same terminal grammar as the reference ship: level capture, then down. */
const LANDING_SHELF_HEIGHT = 6.5;
const VERTICAL_LANDING_DISTANCE = 1;
/** Lift-centre altitude at the shore, relative to the summit rest pose.
 * Pad elevations differ by this amount; the deck stack and hull axis cancel. */
const SHORE_RELATIVE = 3.05 - 88.4;

function catmullWorld(
  previous: readonly [number, number],
  position: readonly [number, number],
  next: readonly [number, number],
): Pick<MotionRouteNode, "incoming" | "outgoing"> {
  const span: readonly [number, number] = [
    next[0] - previous[0],
    next[1] - previous[1],
  ];
  const spanLength = Math.hypot(span[0], span[1]) || 1;
  const shortest = Math.min(
    Math.hypot(position[0] - previous[0], position[1] - previous[1]),
    Math.hypot(next[0] - position[0], next[1] - position[1]),
  );
  const handle = Math.min(spanLength * 0.3, shortest * 0.42);
  const tangent: readonly [number, number] = [
    (span[0] / spanLength) * handle,
    (span[1] / spanLength) * handle,
  ];
  return {
    incoming: worldToLocal([position[0] - tangent[0], position[1] - tangent[1]]),
    outgoing: worldToLocal([position[0] + tangent[0], position[1] + tangent[1]]),
  };
}

function ringNode(
  index: number,
  previous: readonly [number, number],
  next: readonly [number, number],
): MotionRouteNode {
  const position = RING_WORLD[index];
  return {
    id: `ring-${index}`,
    position: worldToLocal(position),
    ...catmullWorld(previous, position, next),
    samples: 56,
  };
}

function shuttleAltitude(startRel: number, endRel: number) {
  return ({ distance, remaining }: MotionRouteRequirementContext): number => {
    if (distance < PAD_CLEAR_ALONG) {
      return startRel + PAD_LIFT * smootherStep(distance / PAD_CLEAR_ALONG);
    }
    if (distance < DEPARTURE_SETTLE) {
      const from = startRel + PAD_LIFT;
      return from + (CRUISE_DROP - from) * smootherStep(
        (distance - PAD_CLEAR_ALONG) / (DEPARTURE_SETTLE - PAD_CLEAR_ALONG),
      );
    }
    if (remaining < VERTICAL_LANDING_DISTANCE) {
      return endRel + LANDING_SHELF_HEIGHT * smootherStep(
        remaining / VERTICAL_LANDING_DISTANCE,
      );
    }
    if (remaining < FINAL_HEIGHT_SHELF) {
      return endRel + LANDING_SHELF_HEIGHT;
    }
    if (remaining < APPROACH_CLIMB) {
      const from = endRel + LANDING_SHELF_HEIGHT;
      return from + (CRUISE_DROP - from) * smootherStep(
        (remaining - FINAL_HEIGHT_SHELF) /
          (APPROACH_CLIMB - FINAL_HEIGHT_SHELF),
      );
    }
    return CRUISE_DROP;
  };
}

function speedLimit(
  cruiseSpeed: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  const stopping = Math.sqrt(2 * 0.35 * Math.max(0, remaining - 3));
  if (distance < 22) {
    return Math.min(2.6, Math.max(1.2, distance / 6));
  }
  if (remaining < APPROACH_CLIMB) {
    return Math.min(4.2, cruiseSpeed, stopping);
  }
  return Math.min(cruiseSpeed, stopping);
}

function downDefinition(): MotionRouteDefinition {
  return {
    id: "kallur-airship:down",
    nodes: [
      { id: "berth", position: [0, 0, 0] },
      { id: "pad-clear", position: [PAD_CLEAR_ALONG, 0, 0] },
      {
        id: "lift-clear",
        position: [LIFT_CLEAR_ALONG, 0, 0],
        outgoing: [26, 0, -2],
      },
      {
        id: "west-descent",
        position: worldToLocal(WEST_DESCENT_WORLD),
        ...catmullWorld(LIFT_CLEAR_WORLD, WEST_DESCENT_WORLD, RING_WORLD[0]),
        samples: 56,
      },
      ringNode(0, WEST_DESCENT_WORLD, RING_WORLD[1]),
      ringNode(1, RING_WORLD[0], SHORE_ENTRY_WORLD),
      {
        id: "shore-entry",
        position: worldToLocal(SHORE_ENTRY_WORLD),
        ...catmullWorld(RING_WORLD[1], SHORE_ENTRY_WORLD, SHORE_DOCK_WORLD),
        samples: 48,
      },
      { id: "dock", position: worldToLocal(SHORE_DOCK_WORLD) },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: shuttleAltitude(0, SHORE_RELATIVE),
      speedLimit: (context) => speedLimit(7.4, context),
    },
    markers: {
      verticalDepartureComplete: "pad-clear",
      departureComplete: "west-descent",
      arriving: "shore-entry",
      final: "shore-entry",
    },
  };
}

function upDefinition(): MotionRouteDefinition {
  return {
    id: "kallur-airship:up",
    nodes: [
      { id: "berth", position: worldToLocal(SHORE_DOCK_WORLD) },
      {
        id: "pad-clear",
        position: worldToLocal([
          KALLUR_AIRSHIP_SHORE_ANCHOR[0] +
            KALLUR_AIRSHIP_SHORE_NOSE_XZ[0] * PAD_CLEAR_ALONG,
          KALLUR_AIRSHIP_SHORE_ANCHOR[1] +
            KALLUR_AIRSHIP_SHORE_NOSE_XZ[1] * PAD_CLEAR_ALONG,
        ]),
      },
      {
        id: "lift-clear",
        position: worldToLocal(SHORE_CLEAR_WORLD),
        ...catmullWorld(
          [
            KALLUR_AIRSHIP_SHORE_ANCHOR[0] +
              KALLUR_AIRSHIP_SHORE_NOSE_XZ[0] * PAD_CLEAR_ALONG,
            KALLUR_AIRSHIP_SHORE_ANCHOR[1] +
              KALLUR_AIRSHIP_SHORE_NOSE_XZ[1] * PAD_CLEAR_ALONG,
          ],
          SHORE_CLEAR_WORLD,
          SHORE_EAST_WORLD,
        ),
        samples: 48,
      },
      {
        id: "shore-east",
        position: worldToLocal(SHORE_EAST_WORLD),
        ...catmullWorld(SHORE_CLEAR_WORLD, SHORE_EAST_WORLD, RING_WORLD[3]),
        samples: 56,
      },
      ringNode(3, SHORE_EAST_WORLD, RING_WORLD[4]),
      ringNode(4, RING_WORLD[3], RING_WORLD[5]),
      ringNode(5, RING_WORLD[4], ARRIVAL_SHOULDER_WORLD),
      {
        id: "arrival-shoulder",
        position: worldToLocal(ARRIVAL_SHOULDER_WORLD),
        ...catmullWorld(
          RING_WORLD[RING_WORLD.length - 1],
          ARRIVAL_SHOULDER_WORLD,
          FINAL_ENTRY_WORLD,
        ),
        samples: 56,
      },
      {
        id: "final-entry",
        position: [FINAL_ENTRY_ALONG, 0, 0],
        ...catmullWorld(
          ARRIVAL_SHOULDER_WORLD,
          FINAL_ENTRY_WORLD,
          KALLUR_AIRSHIP_BERTH_ANCHOR,
        ),
        samples: 48,
      },
      { id: "dock", position: [0, 0, 0] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: shuttleAltitude(SHORE_RELATIVE, 0),
      speedLimit: (context) => speedLimit(7.4, context),
    },
    markers: {
      verticalDepartureComplete: "pad-clear",
      departureComplete: "lift-clear",
      arrivalCapture: "ring-5",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<"down" | "up", MotionRouteArtifact>> = {
  down: createMotionRoute(downDefinition()),
  up: createMotionRoute(upDefinition()),
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
  dockHeading?: readonly [number, number],
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
    ...(dockHeading ? { dockHeading } : {}),
  };
}

function withAirshipLookahead(
  placed: VehicleRoutePlan,
  route: MotionRouteArtifact,
  berth: SceneVector3,
  startRel: number,
): VehicleRoutePlan {
  const arriving = route.markerProgress("arriving");
  const final = route.markerProgress("final");
  return {
    ...placed,
    verticalDeparture: {
      altitude: berth[1] + startRel + PAD_LIFT,
      until: route.markerProgress("verticalDepartureComplete"),
      tolerance: 0.12,
    },
    guidanceLookahead(progress) {
      if (progress < arriving) return 52;
      if (progress < final) return 18;
      return 8;
    },
  };
}

export function kallurAirshipRoute(
  kind: KallurAirshipFlightKind | string,
): MotionRouteArtifact {
  return ROUTES[kallurAirshipResolvedKind(kind)];
}

export function kallurAirshipPlan(
  kind: KallurAirshipFlightKind | string,
  berth: SceneVector3,
): VehicleRoutePlan {
  const resolved = kallurAirshipResolvedKind(kind);
  const route = ROUTES[resolved];
  const startRel = resolved === "up" ? SHORE_RELATIVE : 0;
  const dockHeading = resolved === "up"
    ? KALLUR_AIRSHIP_NOSE_XZ
    : KALLUR_AIRSHIP_SHORE_NOSE_XZ;
  return withAirshipLookahead(
    placeRoute(route, berth, route.markerProgress("final"), dockHeading),
    route,
    berth,
    startRel,
  );
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
      position: worldToLocal(ARRIVAL_SHOULDER_WORLD),
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
      if (remaining < VERTICAL_LANDING_DISTANCE) {
        return LANDING_SHELF_HEIGHT * smootherStep(
          remaining / VERTICAL_LANDING_DISTANCE,
        );
      }
      if (remaining < FINAL_HEIGHT_SHELF) return LANDING_SHELF_HEIGHT;
      if (remaining < APPROACH_CLIMB) {
        return LANDING_SHELF_HEIGHT +
          (CRUISE_DROP - LANDING_SHELF_HEIGHT) * smootherStep(
            (remaining - FINAL_HEIGHT_SHELF) /
              (APPROACH_CLIMB - FINAL_HEIGHT_SHELF),
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
  const arriving = ARRIVAL.markerProgress("arriving");
  const final = ARRIVAL.markerProgress("final");
  return {
    ...placeRoute(ARRIVAL, berth, final, KALLUR_AIRSHIP_NOSE_XZ),
    guidanceLookahead(progress) {
      if (progress < arriving) return 52;
      if (progress < final) return 18;
      return 8;
    },
  };
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
  kind: KallurAirshipFlightKind | string,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    kallurAirshipRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}
