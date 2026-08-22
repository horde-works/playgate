import type { SceneVector3 } from "./destructionScene.ts";
import type { RouteFigureStation } from "./flightFigures.ts";
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

export interface SkyTrainEmergencyEscapeInput {
  /** Current craft centre in berth-local coordinates. */
  readonly start: SceneVector3;
  /** Current horizontal nose direction in the same coordinate frame. */
  readonly forward: SceneVector3;
}

function smootherStep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function routeRequirements(
  options: RoutePerformance,
): Readonly<Record<string, MotionRouteRequirement>> {
  const altitude = ({
    distance,
    remaining,
  }: MotionRouteRequirementContext): number => {
    if (distance < options.transitionDistance) {
      return (
        SKY_TRAIN_UNSTICK_HEIGHT +
        (options.ceiling - SKY_TRAIN_UNSTICK_HEIGHT) *
          smootherStep(
            (distance - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
              (options.transitionDistance - SKY_TRAIN_FINAL_HEIGHT_SHELF),
          )
      );
    }
    if (remaining < options.transitionDistance) {
      if (remaining < SKY_TRAIN_VERTICAL_LANDING_DISTANCE) {
        return (
          SKY_TRAIN_UNSTICK_HEIGHT *
          smootherStep(remaining / SKY_TRAIN_VERTICAL_LANDING_DISTANCE)
        );
      }
      return (
        SKY_TRAIN_UNSTICK_HEIGHT +
        (options.ceiling - SKY_TRAIN_UNSTICK_HEIGHT) *
          smootherStep(
            (remaining - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
              (options.transitionDistance - SKY_TRAIN_FINAL_HEIGHT_SHELF),
          )
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

function terminalArrivalRequirements(
  options: RoutePerformance,
): Readonly<Record<string, MotionRouteRequirement>> {
  const shared = routeRequirements(options);
  return {
    altitude: ({ remaining, length }) =>
      shared.altitude({
        progress: 1 - remaining / length,
        distance: Math.max(options.transitionDistance, length - remaining),
        remaining,
        length,
      }),
    speedLimit: shared.speedLimit,
  };
}

const TERMINAL_APPROACH = {
  departure: 64,
  outer: 105,
  shoulder: 30,
  horizon: 100,
  externalArrival: 280,
} as const;

/**
 * The final curve and glide are authored once for every journey that docks at
 * this terminal. Only the lead-in differs between a local flight and a craft
 * arriving from beyond the visible scene.
 */
function terminalApproachNodes(): readonly MotionRouteNode[] {
  const { departure, outer, shoulder, horizon } = TERMINAL_APPROACH;
  return [
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
}

function terminalInboundNodes(
  horizonIncoming?: SceneVector3,
): readonly MotionRouteNode[] {
  const { outer, horizon } = TERMINAL_APPROACH;
  return [
    {
      id: "horizon",
      position: [0, 0, horizon],
      ...(horizonIncoming ? { incoming: horizonIncoming, samples: 56 } : {}),
      outgoing: [KAPPA * outer, 0, horizon],
    },
    ...terminalApproachNodes(),
  ];
}

function externalTerminalArrivalNodes(): readonly MotionRouteNode[] {
  const { outer, externalArrival } = TERMINAL_APPROACH;
  return [
    {
      id: "remote-entry",
      position: [outer, 0, externalArrival],
      outgoing: [outer, 0, externalArrival - 60],
    },
    ...terminalApproachNodes(),
  ];
}

const TERMINAL_ARRIVAL_ROUTE = createMotionRoute({
  id: "sky-train:terminal-arrival",
  nodes: externalTerminalArrivalNodes(),
  measureAxes: [0, 2],
  requirements: terminalArrivalRequirements({
    ceiling: 26,
    transitionDistance: 120,
    cruiseSpeed: 9,
  }),
  markers: {
    arrivalCapture: "remote-entry",
    arriving: "right-arc",
    final: "final-entry",
  },
});

/** External arrival: distant straight lead-in, common curve and terminal glide. */
export function terminalArrivalRoute(): MotionRouteArtifact {
  return TERMINAL_ARRIVAL_ROUTE;
}

/**
 * The platform flight has one authored outbound half and its exact reflected
 * return. The straight legs, two soft bends and the unique horizon apex are
 * therefore geometry-identical in opposite directions; steering only has to
 * satisfy this path and never receives route-specific commands.
 */
function mirroredPlatformRoute(): MotionRouteDefinition {
  const { departure, outer, shoulder, horizon } = TERMINAL_APPROACH;
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
    ...terminalInboundNodes([-KAPPA * outer, 0, horizon]),
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
      arrivalCapture: "horizon",
      arriving: "right-arc",
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
      outgoing: [178, 0, 20],
      samples: 56,
    },
    {
      id: "arrival-west",
      position: [-95, 0, 45],
      incoming: [-105, 0, 12],
      outgoing: [-95, 0, 82],
      samples: 64,
    },
    ...terminalInboundNodes([
      -KAPPA * TERMINAL_APPROACH.outer,
      0,
      TERMINAL_APPROACH.horizon,
    ]),
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
      arrivalCapture: "horizon",
      arriving: "right-arc",
      final: "final-entry",
    },
  };
}

/**
 * Compile an emergency escape from the actual pose. Its first derivative is
 * the craft's current nose direction; after that the route owns the recovery
 * gate and horizon exit like any other authored motion artifact.
 */
export function createSkyTrainEmergencyEscapeRoute(
  input: SkyTrainEmergencyEscapeInput,
): MotionRouteArtifact {
  const horizontalLength = Math.hypot(input.forward[0], input.forward[2]);
  const forward: SceneVector3 =
    horizontalLength > 1e-4
      ? [
          input.forward[0] / horizontalLength,
          0,
          input.forward[2] / horizontalLength,
        ]
      : [-1, 0, 0];
  const start: SceneVector3 = [input.start[0], 0, input.start[2]];
  const startAltitude = input.start[1];
  const escapeAltitude = Math.max(38, startAltitude + 12);

  return createMotionRoute({
    id: "sky-train:emergency-escape",
    nodes: [
      {
        id: "failure-pose",
        position: start,
        outgoing: [start[0] + forward[0] * 34, 0, start[2] + forward[2] * 34],
      },
      {
        id: "recovery-gate",
        position: [-88, 0, 52],
        incoming: [-58, 0, 25],
        outgoing: [-118, 0, 82],
        samples: 64,
      },
      {
        id: "horizon-exit",
        position: [-175, 0, 195],
        incoming: [-150, 0, 145],
        samples: 64,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) =>
        startAltitude +
        (escapeAltitude - startAltitude) * smootherStep(progress),
      // The horizon is an exit, not a stop. Removal happens at its marker, so
      // asking the controller to brake there would recreate the old hover.
      speedLimit: () => 8.5,
    },
    markers: {
      recoveryGate: "recovery-gate",
      disappear: "horizon-exit",
    },
  });
}

const ROUTES: Readonly<Record<SkyTrainFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(mirroredPlatformRoute()),
  tour: createMotionRoute(irregularCityOrbitRoute()),
};

export function skyTrainRoute(kind: SkyTrainFlightKind): MotionRouteArtifact {
  return ROUTES[kind];
}

export function routePoint(
  kind: SkyTrainFlightKind,
  progress: number,
): SceneVector3 {
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

export interface VehicleRoutePlan {
  readonly id: string;
  readonly length: number;
  point(progress: number): SceneVector3;
  speedLimit(progress: number): number;
  altitude(progress: number): number;
  /**
   * ТОЧНОСТЬ — СВОЙСТВО ТРАЕКТОРИИ, а не машины. Полуширина разрешённого
   * коридора, метры: облёт улицы между домами — полметра и строго, открытый
   * воздух — десятки метров и «резвись, и пусть тебя заносит». Из этого числа
   * выводятся и допуск заноса, и скорость, и порог ухода с трассы — одно
   * правило вместо особых случаев на фазу. Не задано — действует конверт.
   */
  corridor?(progress: number): number;
  /**
   * Route-authored vertical departure before horizontal motion is released.
   *
   * The route keeps its ordinary ground point at progress zero, so a machine
   * standing on supports is not mistaken for a route loss. Guidance holds the
   * authored altitude until the craft has climbed there, then preserves that
   * shelf until `until` joins the ordinary altitude profile continuously.
   */
  readonly verticalDeparture?: {
    /** Absolute world altitude of the clearance shelf. */
    readonly altitude: number;
    /** Route progress where the ordinary altitude profile owns height again. */
    readonly until: number;
    /** Height error allowed before horizontal motion is released. */
    readonly tolerance: number;
  };
  /** Route-authored vertical landing after the horizontal berth is captured. */
  readonly verticalArrival?: {
    /** Clearance shelf held while the craft approaches the berth in plan. */
    readonly altitude: number;
    /** Route progress where the vertical-arrival policy takes ownership. */
    readonly from: number;
    /** Horizontal distance at which descent over the berth is released. */
    readonly horizontalTolerance: number;
  };
  /** Signed longitudinal travel: -1 keeps the nose while backing out. */
  travelDirection?(progress: number): -1 | 1;
  /** Route-authored guidance horizon for confined manoeuvres. */
  guidanceLookahead?(progress: number): number;
  /**
   * Movement direction beyond a temporary plan's endpoint. An intercept ends
   * at a route join, not at a place where the craft should stop or turn back.
   */
  readonly terminalGuidanceHeading?: readonly [number, number];
  /**
   * Nose heading at the route's own dock, world XZ. The frame approach
   * heading is the rest pose; a shuttle that ends at a second berth authors
   * this so final blend and docking capture face the destination, not home.
   */
  readonly dockHeading?: readonly [number, number];
  /** Source-route point beyond a temporary plan's endpoint, by flown metres. */
  terminalGuidancePoint?(distance: number): SceneVector3;
  /**
   * ФИГУРЫ ВЫСШЕГО ПИЛОТАЖА — ТРЕБОВАНИЕ УЧАСТКА, как высота и коридор.
   *
   * Трасса объявляет, где машина крутит петлю и где иммельман, и с какой доли
   * продолжается после них. Автопилот этого не решает: он исполняет требование
   * или пропускает фигуру, если ворота её не пускают.
   */
  readonly figures?: readonly RouteFigureStation[];
  /**
   * КУДА СМОТРЕТЬ НОСОМ на этом участке, мировой курс, единичный. `null` —
   * по движению, как было всегда.
   *
   * Отдельное требование, а не производная от траектории, и это принципиально
   * для векторируемой машины. Коптер летит куда угодно независимо от того,
   * куда смотрит: он может отходить спиной, идти боком, разгоняться на зрителя
   * не клюнув и разворачиваться, не сдвинувшись. Пока курс ВЫВОДИЛСЯ из
   * касательной, ничего из этого сказать было нельзя — трасса умела просить
   * только «лети сюда».
   *
   * Неголономной машине это требование бессмысленно и потому игнорируется: у
   * неё сила только вдоль корпуса, и нос обязан идти за движением.
   */
  heading?(progress: number): readonly [number, number] | null;
  /** Exact stop-and-turn vertices authored by a ground taxi route. */
  readonly taxiVertices?: readonly {
    readonly progress: number;
    readonly point: SceneVector3;
    readonly incoming: readonly [number, number];
    readonly outgoing: readonly [number, number];
    readonly endpoint: boolean;
  }[];
  /** Route progress where arrival begins while the vehicle is still flying. */
  readonly arrivalFrom?: number;
  /**
   * Route progress where the airborne arrival ends. Ordinary routes arrive
   * at their final point; a runway route continues beyond touchdown through
   * rollout and taxi, so its airborne target is an earlier authored marker.
   */
  readonly arrivalAt?: number;
  readonly finalFrom: number;
}

export interface FlightPlan extends VehicleRoutePlan {
  readonly kind: SkyTrainFlightKind;
  readonly departureUntil: number;
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
      const local = route.point(progress);
      return [
        berth[0] + local[0],
        berth[1] + route.requirement("altitude", progress),
        berth[2] + local[2],
      ];
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

export function terminalArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  return placeRoute(
    TERMINAL_ARRIVAL_ROUTE,
    berth,
    TERMINAL_ARRIVAL_ROUTE.markerProgress("final"),
  );
}

export function emergencyEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const route = createSkyTrainEmergencyEscapeRoute(input);
  // This route exits the scene at speed. It has no terminal approach gate.
  return placeRoute(route, berth, Number.POSITIVE_INFINITY);
}

/** Place a reusable local route artifact at a concrete berth. */
export function flightPlan(
  kind: SkyTrainFlightKind,
  berth: SceneVector3,
): FlightPlan {
  const route = skyTrainRoute(kind);
  const placed = placeRoute(route, berth, route.markerProgress("final"));
  return {
    ...placed,
    kind,
    departureUntil: route.markerProgress("departureComplete"),
  };
}
