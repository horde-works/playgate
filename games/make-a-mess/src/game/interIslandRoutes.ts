import type { SceneVector3 } from "./destructionScene.ts";
import {
  ISLAND_CHART,
  islandDestinations,
  islandHeading,
  type IslandId,
} from "./islandTopology.ts";
import {
  createMotionRoute,
  type MotionRouteArtifact,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import type { VehicleRoutePlan } from "./skyTrainRoutes.ts";
import { vehicleFrameForCluster } from "./vehicleFrames.ts";

const TRANSFER_PREFIX = "transfer:";
const ARRIVAL_PREFIX = "arrival:";

function frameNose(clusterId: string): SceneVector3 {
  const nose = vehicleFrameForCluster(clusterId)?.nose;
  if (!nose) {
    throw new Error(`No vehicle frame for ${clusterId}`);
  }
  const length = Math.hypot(nose[0], nose[2]) || 1;
  return [nose[0] / length, 0, nose[2] / length];
}

/** A final starts behind the berth and runs straight in the docked heading. */
function finalEntry(nose: SceneVector3, distance: number): SceneVector3 {
  return [-nose[0] * distance, 0, -nose[2] * distance];
}

const VILLAGE_LONGSHIP_NOSE = frameNose("viking-village:sky-longship");
const TOWN_AIRSHIP_NOSE = frameNose("sky-mooring:airship");
const ARRIVAL_FINAL_LENGTH = 110;

function smootherStep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function departureAltitude(
  ceiling: number,
  { distance }: MotionRouteRequirementContext,
): number {
  return ceiling * smootherStep(distance / 115);
}

function departureSpeed({ distance }: MotionRouteRequirementContext): number {
  return distance < 45 ? 3.2 : distance < 100 ? 5.2 : 8;
}

function arrivalAltitude(
  ceiling: number,
  { remaining }: MotionRouteRequirementContext,
): number {
  return ceiling * smootherStep(remaining / 125);
}

function arrivalSpeed({ remaining }: MotionRouteRequirementContext): number {
  const stopping = Math.sqrt(2 * 0.35 * Math.max(0, remaining - 3));
  return Math.min(7.2, stopping);
}

const TOWN_TO_VILLAGE = createMotionRoute({
  id: "town:viking-village:departure",
  nodes: [
    { id: "berth", position: [0, 0, 0] },
    { id: "reverse-clear", position: [2, 0, -18] },
    {
      id: "high-clear",
      position: [5, 0, -38],
      outgoing: [-5, 0, -55],
    },
    {
      id: "south-west",
      position: [-35, 0, -65],
      incoming: [-20, 0, -68],
      outgoing: [-62, 0, -60],
      samples: 48,
    },
    {
      id: "west",
      position: [-82, 0, -28],
      incoming: [-82, 0, -52],
      outgoing: [-92, 0, 10],
      samples: 56,
    },
    {
      id: "north-west",
      position: [-92, 0, 70],
      incoming: [-92, 0, 36],
      outgoing: [-92, 0, 115],
      samples: 48,
    },
    { id: "boundary", position: [-92, 0, 210] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: (context) => departureAltitude(32, context),
    speedLimit: departureSpeed,
  },
  markers: {
    reverseComplete: "high-clear",
    departureComplete: "west",
    handoff: "boundary",
  },
});

const VILLAGE_TO_TOWN = createMotionRoute({
  id: "viking-village:town:departure",
  nodes: [
    { id: "berth", position: [0, 0, 0] },
    {
      id: "pier-clear",
      position: [-34, 0, 0],
      outgoing: [-48, 0, -5],
    },
    {
      id: "south-west",
      position: [-56, 0, -34],
      incoming: [-58, 0, -18],
      outgoing: [-54, 0, -58],
      samples: 48,
    },
    {
      id: "south",
      position: [-18, 0, -105],
      incoming: [-42, 0, -82],
      outgoing: [0, 0, -135],
      samples: 56,
    },
    { id: "boundary", position: [0, 0, -220] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: (context) => departureAltitude(30, context),
    speedLimit: departureSpeed,
  },
  markers: {
    departureComplete: "south-west",
    handoff: "boundary",
  },
});

const TOWN_TO_VILLAGE_ARRIVAL = createMotionRoute({
  id: "town:viking-village:arrival",
  nodes: [
    {
      id: "boundary-entry",
      position: [0, 0, -220],
      outgoing: [0, 0, -175],
    },
    {
      id: "arrival-shoulder",
      position: [160, 0, -55],
      incoming: [105, 0, -135],
      outgoing: [178, 0, -4],
      samples: 72,
    },
    {
      id: "final-entry",
      position: finalEntry(VILLAGE_LONGSHIP_NOSE, ARRIVAL_FINAL_LENGTH),
      incoming: finalEntry(VILLAGE_LONGSHIP_NOSE, 146),
      samples: 56,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: (context) => arrivalAltitude(30, context),
    speedLimit: arrivalSpeed,
  },
  markers: {
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

const VILLAGE_TO_TOWN_ARRIVAL = createMotionRoute({
  id: "viking-village:town:arrival",
  nodes: [
    {
      id: "boundary-entry",
      position: [0, 0, 220],
      outgoing: [45, 0, 210],
    },
    {
      id: "north-east",
      position: [120, 0, 125],
      incoming: [95, 0, 180],
      outgoing: [155, 0, 70],
      samples: 64,
    },
    {
      id: "arrival-shoulder",
      position: [120, 0, -80],
      incoming: [160, 0, -20],
      outgoing: [92, 0, -142],
      samples: 72,
    },
    {
      id: "final-entry",
      position: finalEntry(TOWN_AIRSHIP_NOSE, ARRIVAL_FINAL_LENGTH),
      incoming: finalEntry(TOWN_AIRSHIP_NOSE, 150),
      samples: 56,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: (context) => arrivalAltitude(34, context),
    speedLimit: arrivalSpeed,
  },
  markers: {
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

function departureRoute(
  origin: IslandId,
  destination: IslandId,
): MotionRouteArtifact {
  if (origin === "town" && destination === "viking-village") {
    return TOWN_TO_VILLAGE;
  }
  if (origin === "viking-village" && destination === "town") {
    return VILLAGE_TO_TOWN;
  }
  throw new Error(`No inter-island departure route ${origin} -> ${destination}`);
}

function arrivalRoute(
  origin: IslandId,
  destination: IslandId,
): MotionRouteArtifact {
  if (origin === "town" && destination === "viking-village") {
    return TOWN_TO_VILLAGE_ARRIVAL;
  }
  if (origin === "viking-village" && destination === "town") {
    return VILLAGE_TO_TOWN_ARRIVAL;
  }
  throw new Error(`No inter-island arrival route ${origin} -> ${destination}`);
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
      const point = route.point(progress);
      return [
        berth[0] + point[0],
        berth[1] + route.requirement("altitude", progress),
        berth[2] + point[2],
      ];
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

export function interIslandTransferAction(destination: IslandId): string {
  return `${TRANSFER_PREFIX}${destination}`;
}

export function isInterIslandTransferKind(flightKind: string): boolean {
  return flightKind.startsWith(TRANSFER_PREFIX);
}

export function isInterIslandArrivalKind(flightKind: string): boolean {
  return flightKind.startsWith(ARRIVAL_PREFIX);
}

export function interIslandArrivalKind(origin: IslandId): string {
  return `${ARRIVAL_PREFIX}${origin}`;
}

function islandIdAfterPrefix(value: string, prefix: string): IslandId | null {
  if (!value.startsWith(prefix)) {
    return null;
  }
  const id = value.slice(prefix.length) as IslandId;
  return Object.hasOwn(ISLAND_CHART, id) ? id : null;
}

export function interIslandTransferDestination(
  origin: IslandId,
  flightKind: string,
): IslandId | null {
  const destination = islandIdAfterPrefix(flightKind, TRANSFER_PREFIX);
  return destination && islandDestinations(origin).includes(destination)
    ? destination
    : null;
}

export function interIslandArrivalOrigin(flightKind: string): IslandId | null {
  return islandIdAfterPrefix(flightKind, ARRIVAL_PREFIX);
}

export function interIslandDeparturePlan(
  origin: IslandId,
  destination: IslandId,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = departureRoute(origin, destination);
  const reverseUntil = origin === "town"
    ? route.markerProgress("reverseComplete")
    : -1;
  return placeRoute(route, berth, 1, reverseUntil);
}

export function interIslandArrivalPlan(
  origin: IslandId,
  destination: IslandId,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = arrivalRoute(origin, destination);
  return placeRoute(route, berth, route.markerProgress("final"));
}

export function interIslandDeparturePhase(
  origin: IslandId,
  destination: IslandId,
  progress: number,
): MotionRoutePhase {
  const route = departureRoute(origin, destination);
  return progress < route.markerProgress("departureComplete")
    ? "departure"
    : "cruise";
}

export function interIslandArrivalPhase(
  origin: IslandId,
  destination: IslandId,
  progress: number,
): MotionRoutePhase {
  const route = arrivalRoute(origin, destination);
  return progress < route.markerProgress("arriving") ? "cruise" : "approach";
}

/**
 * Resolve a destination-page arrival against the same chart/service rules as
 * departure. Query strings cannot invent a route or wake a planned island.
 */
export function interIslandArrivalRequest(
  destination: IslandId,
  arrivalFrom: string | null,
): { readonly origin: IslandId; readonly flightKind: string } | null {
  if (!arrivalFrom || !Object.hasOwn(ISLAND_CHART, arrivalFrom)) {
    return null;
  }
  const origin = arrivalFrom as IslandId;
  if (
    interIslandTransferDestination(
      origin,
      interIslandTransferAction(destination),
    ) !== destination
  ) {
    return null;
  }
  return { origin, flightKind: interIslandArrivalKind(origin) };
}

/** Entry bearing points back toward the island the flight came from. */
export function interIslandArrivalEntryHeading(
  origin: IslandId,
  destination: IslandId,
): readonly [number, 0, number] {
  return islandHeading(destination, origin);
}
