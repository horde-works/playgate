import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import {
  SKY_TRAIN_FINAL_HEIGHT_SHELF,
  SKY_TRAIN_UNSTICK_HEIGHT,
  type VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

function smootherStep(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

const CEILING = 30;
const TRANSITION_DISTANCE = 145;
// The longship's mooring settles it about a metre off the mathematical route
// end. Begin the near-vertical lowering over the last boat length so the
// physical hull can descend while the horizontal line is already taking up.
const VERTICAL_LANDING_DISTANCE = 6;

function altitude({ distance, remaining }: MotionRouteRequirementContext): number {
  if (distance < TRANSITION_DISTANCE) {
    return SKY_TRAIN_UNSTICK_HEIGHT +
      (CEILING - SKY_TRAIN_UNSTICK_HEIGHT) *
        smootherStep(
          (distance - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
            (TRANSITION_DISTANCE - SKY_TRAIN_FINAL_HEIGHT_SHELF),
        );
  }
  if (remaining < TRANSITION_DISTANCE) {
    if (remaining < VERTICAL_LANDING_DISTANCE) {
      return SKY_TRAIN_UNSTICK_HEIGHT *
        smootherStep(remaining / VERTICAL_LANDING_DISTANCE);
    }
    return SKY_TRAIN_UNSTICK_HEIGHT +
      (CEILING - SKY_TRAIN_UNSTICK_HEIGHT) *
        smootherStep(
          (remaining - SKY_TRAIN_FINAL_HEIGHT_SHELF) /
            (TRANSITION_DISTANCE - SKY_TRAIN_FINAL_HEIGHT_SHELF),
        );
  }
  return CEILING;
}

function speedLimit({ remaining }: MotionRouteRequirementContext): number {
  const stopping = Math.sqrt(2 * 0.35 * Math.max(0, remaining - 4));
  // The teardrop beside the pier is deliberately narrow. It is still flown
  // by the same pilot, but the route asks for a believable rowing pace there.
  const manoeuvreLimit = remaining < 155 ? 4.2 : 7.4;
  return Math.min(manoeuvreLimit, stopping);
}

/**
 * Berth-local tour. The longship first makes a counter-clockwise turn outside
 * the pier, follows an uneven counter-clockwise ring around the island, then
 * passes seaward of the berth and reverses curvature through a tight teardrop
 * before the straight final.
 */
const ISLAND_TOUR = createMotionRoute({
  id: "sky-longship:island-tour",
  nodes: [
    { id: "berth", position: [0, 0, 0] },
    {
      id: "departure-run",
      position: [-34, 0, 0],
      outgoing: [-50, 0, 0],
    },
    {
      id: "departure-turn",
      position: [-28, 0, -38],
      incoming: [-52, 0, -27],
      outgoing: [-5, 0, -52],
      samples: 64,
    },
    {
      id: "south-east",
      position: [72, 0, -20],
      incoming: [25, 0, -52],
      outgoing: [100, 0, 8],
      samples: 64,
    },
    {
      id: "east",
      position: [108, 0, 70],
      incoming: [108, 0, 35],
      outgoing: [108, 0, 108],
      samples: 64,
    },
    {
      id: "north-east",
      position: [70, 0, 145],
      incoming: [100, 0, 130],
      outgoing: [40, 0, 174],
      samples: 64,
    },
    {
      id: "north",
      position: [0, 0, 182],
      incoming: [28, 0, 182],
      outgoing: [-35, 0, 182],
      samples: 64,
    },
    {
      id: "north-west",
      position: [-78, 0, 145],
      incoming: [-46, 0, 175],
      outgoing: [-105, 0, 118],
      samples: 64,
    },
    {
      id: "west",
      position: [-108, 0, 72],
      incoming: [-108, 0, 105],
      outgoing: [-108, 0, 35],
      samples: 64,
    },
    {
      id: "south-west",
      position: [-72, 0, 8],
      incoming: [-104, 0, 25],
      outgoing: [-50, 0, -18],
      samples: 64,
    },
    {
      id: "pier-pass",
      position: [-18, 0, -18],
      incoming: [-38, 0, -22],
      outgoing: [-2, 0, -32],
      samples: 56,
    },
    {
      id: "reverse-arc",
      position: [20, 0, -36],
      incoming: [5, 0, -38],
      outgoing: [38, 0, -32],
      samples: 56,
    },
    {
      id: "final-shoulder",
      position: [48, 0, -12],
      incoming: [45, 0, -25],
      outgoing: [50, 0, -4],
      samples: 56,
    },
    {
      id: "final-entry",
      position: [46, 0, 0],
      incoming: [49, 0, -2],
      outgoing: [28, 0, 0],
      samples: 40,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: { altitude, speedLimit },
  markers: {
    departureComplete: "south-east",
    arrivalCapture: "south-west",
    arriving: "pier-pass",
    final: "final-entry",
  },
});

export function vikingLongshipTourRoute(): MotionRouteArtifact {
  return ISLAND_TOUR;
}

export function vikingLongshipTourPlan(
  berth: SceneVector3,
): VehicleRoutePlan {
  return {
    id: ISLAND_TOUR.id,
    length: ISLAND_TOUR.length,
    point(progress) {
      const local = ISLAND_TOUR.point(progress);
      return [
        berth[0] + local[0],
        berth[1] + ISLAND_TOUR.requirement("altitude", progress),
        berth[2] + local[2],
      ];
    },
    speedLimit(progress) {
      return ISLAND_TOUR.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return berth[1] + ISLAND_TOUR.requirement("altitude", progress);
    },
    // The pier pass begins the landing manoeuvre. From here the common pilot
    // shortens its look-ahead and follows the reverse curve instead of
    // visually cutting across the teardrop.
    finalFrom: ISLAND_TOUR.markerProgress("arriving"),
  };
}

export function vikingLongshipTourPhase(
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    ISLAND_TOUR,
    progress,
    "departureComplete",
    "arriving",
  );
}
