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
import {
  NIMBUS_ATMOSPHERIC_BASE_Y,
  NIMBUS_ATMOSPHERIC_ROOF_Y,
  NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT,
} from "../content/scenes/nimbus/nimbusAtmosphericTower.ts";
import {
  NIMBUS_HEXACOPTER_NOSE,
  NIMBUS_HEXACOPTER_ORIGIN,
} from "./nimbusHexacopter.ts";

export type NimbusHexacopterFlightKind = "circuit" | "tour";

export const NIMBUS_HEXACOPTER_INNER_RADIUS = 100;
export const NIMBUS_HEXACOPTER_OUTER_RADIUS = 188;
export const NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD =
  NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT / 3;
export const NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS =
  NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT * 2 / 3;
export const NIMBUS_HEXACOPTER_ALTITUDE_FULL = NIMBUS_ATMOSPHERIC_ROOF_Y;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(from: number, to: number, value: number): number {
  return from + (to - from) * smootherStep(value);
}

function arcNode(
  id: string,
  radius: number,
  angle: number,
  step: number,
) {
  const position: SceneVector3 = [
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ];
  const tangent: SceneVector3 = [-Math.sin(angle), 0, Math.cos(angle)];
  const handle = 4 / 3 * Math.tan(step / 4) * radius;
  return {
    id,
    position,
    incoming: [
      position[0] - tangent[0] * handle,
      0,
      position[2] - tangent[2] * handle,
    ] as SceneVector3,
    outgoing: [
      position[0] + tangent[0] * handle,
      0,
      position[2] + tangent[2] * handle,
    ] as SceneVector3,
    samples: 48,
  };
}

function createSurveyRoute(
  kind: NimbusHexacopterFlightKind,
  berth: SceneVector3,
): MotionRouteArtifact {
  const startAngle = Math.atan2(berth[2], berth[0]);
  const step = Math.PI / 4;
  const outwardLength = Math.hypot(berth[0], berth[2]) || 1;
  const outward: readonly [number, number] = [
    berth[0] / outwardLength,
    berth[2] / outwardLength,
  ];
  const nodes = [
    { id: "pad", position: [berth[0], 0, berth[2]] as SceneVector3 },
    {
      id: "vertical-clear",
      position: [
        berth[0] + outward[0] * 10,
        0,
        berth[2] + outward[1] * 10,
      ] as SceneVector3,
    },
    arcNode("inner-start", NIMBUS_HEXACOPTER_INNER_RADIUS, startAngle, step),
  ];
  for (let index = 1; index <= 8; index += 1) {
    nodes.push(arcNode(
      index === 8 ? "inner-complete" : `inner:${index}`,
      NIMBUS_HEXACOPTER_INNER_RADIUS,
      startAngle + index * step,
      step,
    ));
  }
  nodes.push(arcNode("outer-start", NIMBUS_HEXACOPTER_OUTER_RADIUS,
    startAngle + step, step));
  for (let index = 1; index <= 8; index += 1) {
    nodes.push(arcNode(
      index === 8 ? "outer-complete" : `outer:${index}`,
      NIMBUS_HEXACOPTER_OUTER_RADIUS,
      startAngle + step + index * step,
      step,
    ));
  }
  nodes.push(
    arcNode("arrival-shoulder", 124, startAngle - step, step),
    {
      id: "final-entry",
      position: [
        berth[0] - NIMBUS_HEXACOPTER_NOSE[0] * 30,
        0,
        berth[2] - NIMBUS_HEXACOPTER_NOSE[2] * 30,
      ] as SceneVector3,
      incoming: [
        berth[0] - NIMBUS_HEXACOPTER_NOSE[0] * 44,
        0,
        berth[2] - NIMBUS_HEXACOPTER_NOSE[2] * 44,
      ] as SceneVector3,
      outgoing: [
        berth[0] - NIMBUS_HEXACOPTER_NOSE[0] * 12,
        0,
        berth[2] - NIMBUS_HEXACOPTER_NOSE[2] * 12,
      ] as SceneVector3,
      samples: 48,
    },
    { id: "dock", position: [berth[0], 0, berth[2]] as SceneVector3 },
  );

  let innerStart = 0;
  let innerComplete = 0;
  let outerStart = 0;
  let outerComplete = 0;
  let arriving = 0;
  let final = 1;
  const route = createMotionRoute({
    id: `nimbus-hexacopter:${kind}`,
    nodes,
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => {
        if (progress < innerStart) {
          return mix(berth[1], NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
            progress / Math.max(innerStart, 1e-6));
        }
        if (progress < innerComplete) {
          const t = (progress - innerStart) / (innerComplete - innerStart);
          return NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD
            + (NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS
              - NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD)
              * Math.sin(Math.PI * t) ** 2;
        }
        if (progress < outerStart) {
          return mix(NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
            NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS,
            (progress - innerComplete) / (outerStart - innerComplete));
        }
        if (progress < outerComplete) {
          const t = (progress - outerStart) / (outerComplete - outerStart);
          return NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS
            + (NIMBUS_HEXACOPTER_ALTITUDE_FULL
              - NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS)
              * Math.sin(Math.PI * t) ** 2;
        }
        if (progress < arriving) {
          return mix(NIMBUS_HEXACOPTER_ALTITUDE_TWO_THIRDS,
            NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
            (progress - outerComplete) / (arriving - outerComplete));
        }
        return mix(NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD, berth[1],
          (progress - arriving) / Math.max(1e-6, 1 - arriving));
      },
      speedLimit: ({ progress, remaining }) => {
        const stopping = Math.sqrt(2 * 0.55 * Math.max(0, remaining));
        const cruise = progress < innerStart
          ? 4.5
          : progress < innerComplete
            ? 14
            : progress < outerStart
              ? 12
              : progress < outerComplete
                ? 18
                : progress < final
                  ? 11
                  : 4;
        return Math.min(cruise, stopping);
      },
    },
    markers: {
      verticalDepartureComplete: "vertical-clear",
      departureComplete: "inner-start",
      innerComplete: "inner-complete",
      outerStart: "outer-start",
      outerComplete: "outer-complete",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  });
  innerStart = route.markerProgress("departureComplete");
  innerComplete = route.markerProgress("innerComplete");
  outerStart = route.markerProgress("outerStart");
  outerComplete = route.markerProgress("outerComplete");
  arriving = route.markerProgress("arriving");
  final = route.markerProgress("final");
  return route;
}

function planFromRoute(
  route: MotionRouteArtifact,
): VehicleRoutePlan {
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
    finalFrom: route.markerProgress("final"),
    verticalDeparture: {
      altitude: NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
      until: route.markerProgress("verticalDepartureComplete"),
      tolerance: 1,
    },
    verticalArrival: {
      altitude: NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD,
      from: route.markerProgress("final"),
      horizontalTolerance: 1.2,
    },
    guidanceLookahead(progress) {
      if (progress < route.markerProgress("departureComplete")) return 16;
      if (progress < route.markerProgress("innerComplete")) return 34;
      if (progress < route.markerProgress("outerComplete")) return 48;
      return 26;
    },
  };
}

export function nimbusHexacopterRoute(
  kind: NimbusHexacopterFlightKind,
  berth: SceneVector3 = NIMBUS_HEXACOPTER_ORIGIN,
): MotionRouteArtifact {
  return createSurveyRoute(kind, berth);
}

export function nimbusHexacopterPlan(
  kind: NimbusHexacopterFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  return planFromRoute(createSurveyRoute(kind, berth));
}

export function nimbusHexacopterArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  const route = createMotionRoute({
    id: "nimbus-hexacopter:arrival",
    nodes: [
      { id: "remote", position: [188, 0, 0] },
      { id: "high-gate", position: [135, 0, 45], samples: 48 },
      {
        id: "final-entry",
        position: [
          berth[0] - NIMBUS_HEXACOPTER_NOSE[0] * 30,
          0,
          berth[2] - NIMBUS_HEXACOPTER_NOSE[2] * 30,
        ],
        samples: 48,
      },
      { id: "dock", position: [berth[0], 0, berth[2]] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => progress < 0.6
        ? mix(NIMBUS_HEXACOPTER_ALTITUDE_FULL,
            NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD, progress / 0.6)
        : mix(NIMBUS_HEXACOPTER_ALTITUDE_ONE_THIRD, berth[1],
            (progress - 0.6) / 0.4),
      speedLimit: ({ remaining }) =>
        Math.min(14, Math.sqrt(2 * 0.55 * Math.max(0, remaining))),
    },
    markers: { final: "final-entry" },
  });
  return planFromRoute(route);
}

export function nimbusHexacopterEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const forwardLength = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [
    input.forward[0] / forwardLength,
    0,
    input.forward[2] / forwardLength,
  ];
  const start: SceneVector3 = [
    berth[0] + input.start[0],
    berth[1] + input.start[1],
    berth[2] + input.start[2],
  ];
  const route = createMotionRoute({
    id: "nimbus-hexacopter:escape",
    nodes: [
      { id: "failure", position: start },
      {
        id: "clear",
        position: [start[0] + forward[0] * 35, 0, start[2] + forward[2] * 35],
      },
      {
        id: "horizon",
        position: [start[0] + forward[0] * 190, 0, start[2] + forward[2] * 190],
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => mix(start[1], NIMBUS_HEXACOPTER_ALTITUDE_FULL, progress),
      speedLimit: ({ progress }) => 5 + 10 * smootherStep(progress),
    },
  });
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      const point = route.point(progress);
      return [point[0], route.requirement("altitude", progress), point[2]];
    },
    speedLimit: (progress) => route.requirement("speedLimit", progress),
    altitude: (progress) => route.requirement("altitude", progress),
    finalFrom: Number.POSITIVE_INFINITY,
    guidanceLookahead: (progress) => progress < 0.2 ? 12 : 42,
  };
}

export function nimbusHexacopterRoutePhase(
  kind: NimbusHexacopterFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    createSurveyRoute(kind, NIMBUS_HEXACOPTER_ORIGIN),
    progress,
    "departureComplete",
    "arriving",
  );
}
