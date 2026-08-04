import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRoutePhase,
} from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import { SR6_SKAT_BERTH, SR6_SKAT_NOSE } from "./sr6Skat.ts";

const lateral: SceneVector3 = [SR6_SKAT_NOSE[2], 0, -SR6_SKAT_NOSE[0]];
const clearanceAltitude = 22;
const islandCentre: SceneVector3 = [30, 0, -15];
const islandRadius = 48;

function islandCirclePoint(degrees: number): SceneVector3 {
  const angle = degrees * Math.PI / 180;
  const world: SceneVector3 = [
    islandCentre[0] + Math.cos(angle) * islandRadius,
    0,
    islandCentre[2] + Math.sin(angle) * islandRadius,
  ];
  // Local route axes: forward along the parked nose, lateral to its left.
  return [
    (world[0] - SR6_SKAT_BERTH[0]) * SR6_SKAT_NOSE[0] +
      (world[2] - SR6_SKAT_BERTH[2]) * SR6_SKAT_NOSE[2],
    0,
    (world[0] - SR6_SKAT_BERTH[0]) * lateral[0] +
      (world[2] - SR6_SKAT_BERTH[2]) * lateral[2],
  ];
}

function arcNode(id: string, degrees: number) {
  const position = islandCirclePoint(degrees);
  const angle = degrees * Math.PI / 180;
  const worldTangent: SceneVector3 = [-Math.sin(angle), 0, Math.cos(angle)];
  const localTangent: SceneVector3 = [
    worldTangent[0] * SR6_SKAT_NOSE[0] + worldTangent[2] * SR6_SKAT_NOSE[2],
    0,
    worldTangent[0] * lateral[0] + worldTangent[2] * lateral[2],
  ];
  const handle = (4 / 3) * Math.tan((48 / 4) * Math.PI / 180) * islandRadius;
  return {
    id,
    position,
    incoming: [
      position[0] - localTangent[0] * handle,
      0,
      position[2] - localTangent[2] * handle,
    ] as SceneVector3,
    outgoing: [
      position[0] + localTangent[0] * handle,
      0,
      position[2] + localTangent[2] * handle,
    ] as SceneVector3,
    samples: 56,
  };
}

const CIRCUIT = createMotionRoute({
  id: "sr6-skat:prototype-circuit",
  nodes: [
    { id: "berth", position: [0, 0, 0] },
    { id: "clear", position: [-6, 0, 10], outgoing: [-9, 0, 14], samples: 24 },
    arcNode("north", 90),
    arcNode("north-west", 138),
    arcNode("west", 186),
    arcNode("south-west", 234),
    arcNode("south", 282),
    arcNode("south-east", 330),
    arcNode("east", 18),
    arcNode("north-east", 66),
    {
      id: "arrival-shoulder",
      position: [-38, 0, 8],
      incoming: [-42, 0, 13],
      outgoing: [-34, 0, 2],
      samples: 44,
    },
    { id: "final", position: [-28, 0, 0], incoming: [-34, 0, 0], outgoing: [-10, 0, 0], samples: 36 },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ progress }) => {
      const edge = Math.min(1, progress / 0.1, (1 - progress) / 0.12);
      return clearanceAltitude * Math.max(0, edge * edge * (3 - 2 * edge));
    },
    speedLimit: ({ progress }) => progress < 0.12 || progress > 0.84 ? 5 : 9,
  },
  markers: {
    departureComplete: "north",
    arriving: "arrival-shoulder",
    final: "final",
  },
});

const ARRIVAL = createMotionRoute({
  id: "sr6-skat:prototype-arrival",
  nodes: [
    { id: "remote", position: [-115, 0, 45], outgoing: [-88, 0, 34] },
    { id: "shoulder", position: [-48, 0, 15], incoming: [-72, 0, 26], outgoing: [-30, 0, 4], samples: 48 },
    { id: "final", position: [-18, 0, 0], incoming: [-25, 0, 0], samples: 30 },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ remaining }) => clearanceAltitude * Math.min(1, remaining / 24),
    speedLimit: ({ remaining }) => remaining < 28 ? 4 : 9,
  },
  markers: { final: "final" },
});

function placeLocal(berth: SceneVector3, point: SceneVector3, altitude: number): SceneVector3 {
  return [
    berth[0] + SR6_SKAT_NOSE[0] * point[0] + lateral[0] * point[2],
    berth[1] + altitude,
    berth[2] + SR6_SKAT_NOSE[2] * point[0] + lateral[2] * point[2],
  ];
}

function placedPlan(
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

export function sr6SkatPlan(berth: SceneVector3): VehicleRoutePlan {
  return {
    ...placedPlan(CIRCUIT, berth, CIRCUIT.markerProgress("final")),
    verticalDeparture: {
      altitude: berth[1] + clearanceAltitude,
      until: CIRCUIT.markerProgress("departureComplete"),
      tolerance: 0.8,
    },
    verticalArrival: {
      altitude: berth[1] + clearanceAltitude,
      from: CIRCUIT.markerProgress("final"),
      horizontalTolerance: 0.9,
    },
    guidanceLookahead: () => 22,
  };
}

export function sr6SkatArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  return placedPlan(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

export function sr6SkatEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const start: SceneVector3 = [
    berth[0] + input.start[0],
    berth[1] + input.start[1],
    berth[2] + input.start[2],
  ];
  const length = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [input.forward[0] / length, 0, input.forward[2] / length];
  const route = createMotionRoute({
    id: "sr6-skat:emergency-escape",
    nodes: [
      { id: "start", position: start },
      { id: "clear", position: [start[0] + forward[0] * 24, start[1], start[2] + forward[2] * 24] },
      { id: "exit", position: [start[0] + forward[0] * 150, start[1], start[2] + forward[2] * 150] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => start[1] + clearanceAltitude + progress * 18,
      speedLimit: ({ progress }) => progress < 0.2 ? 5 : 11,
    },
  });
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      const point = route.point(progress);
      return [point[0], route.requirement("altitude", progress), point[2]];
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return route.requirement("altitude", progress);
    },
    finalFrom: Number.POSITIVE_INFINITY,
    guidanceLookahead: () => 18,
  };
}

export function sr6SkatRoutePhase(progress: number): MotionRoutePhase {
  return motionRoutePhase(CIRCUIT, progress, "departureComplete", "arriving");
}
