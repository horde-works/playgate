import type { SceneVector3 } from "./destructionScene.ts";
import type { EntryInteractionAction } from "./entryInteraction.ts";
import type { ApproachGate, DockingTolerance } from "./vehicleFrames.ts";

/**
 * The physical law of one base. Route names select a destination base; the
 * base then owns the final pose, capture conditions and parked buoyancy.
 */
export interface VehicleDockingBaseParameters {
  readonly arrivalKinds: readonly string[];
  readonly kind: "mooring" | "platform";
  readonly approach: ApproachGate;
  readonly tolerance: DockingTolerance;
  readonly mooringReach?: number;
  /** Maximum time without base-defined measurable capture progress. */
  readonly settlingStallSeconds?: number;
  readonly settlingProgressMetres?: number;
  /** Signed lift-trim command while parked; negative loads real supports. */
  readonly parkedLiftTrim?: number;
}

/**
 * One authored base of a multi-base machine: its board, resting mass centre,
 * outbound route and independent docking law live together.
 */
export interface VehicleDeparturePost {
  readonly id: string;
  readonly point: SceneVector3;
  readonly berth: SceneVector3;
  readonly outboundKind: string;
  readonly outboundLabelKey: string;
  readonly callLabelKey: string;
  readonly docking?: VehicleDockingBaseParameters;
}

const HOME_RADIUS = 8;

function horizontal(a: SceneVector3, b: SceneVector3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function spatial(a: SceneVector3, b: SceneVector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Which authored stand the ship is sitting on, if any. */
export function vehicleHomeDeparturePost(
  posts: readonly VehicleDeparturePost[],
  shipCentre: SceneVector3,
  radius = HOME_RADIUS,
): VehicleDeparturePost | null {
  let best: VehicleDeparturePost | null = null;
  let bestDistance = radius;
  for (const post of posts) {
    const distance = spatial(shipCentre, post.berth);
    if (distance <= bestDistance) {
      best = post;
      bestDistance = distance;
    }
  }
  return best;
}

/** Destination base selected by the route being flown. */
export function vehicleFlightTargetPost(
  posts: readonly VehicleDeparturePost[],
  flightKind: string,
): VehicleDeparturePost | null {
  return posts.find((post) => post.docking?.arrivalKinds.includes(flightKind)) ?? null;
}

export function vehicleDeparturePostById(
  posts: readonly VehicleDeparturePost[],
  id: string | null,
): VehicleDeparturePost | null {
  return id ? posts.find((post) => post.id === id) ?? null : null;
}

/** Parked buoyancy is relative to this base, never to the map's first berth. */
export function vehicleBaseParkedLiftCommand(
  base: VehicleDeparturePost,
  verticalVelocity: number,
  liftTrimRange: number,
): number {
  const parked = base.docking?.parkedLiftTrim ?? 0;
  const damping = (-0.18 * verticalVelocity) / Math.max(0.01, liftTrimRange);
  return Math.max(-1, Math.min(1, parked + damping));
}

/** The board under the player's eye, with approach/release hysteresis. */
export function nearestVehicleDeparturePost(
  posts: readonly VehicleDeparturePost[],
  eye: SceneVector3,
  approachRadius: number,
  releaseRadius: number,
  heightTolerance: number,
  keepId: string | null,
): VehicleDeparturePost | null {
  if (keepId) {
    const kept = posts.find((post) => post.id === keepId);
    if (
      kept &&
      Math.abs(eye[1] - kept.point[1]) < heightTolerance &&
      horizontal(eye, kept.point) <= releaseRadius
    ) {
      return kept;
    }
  }
  let best: VehicleDeparturePost | null = null;
  let bestDistance = approachRadius;
  for (const post of posts) {
    if (Math.abs(eye[1] - post.point[1]) >= heightTolerance) continue;
    const distance = horizontal(eye, post.point);
    if (distance <= bestDistance) {
      best = post;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One action: send the ship from this stand, or call it from the other.
 * An empty board with the ship already here offers the outbound leg;
 * an empty board with the ship at the other stand offers the call,
 * whose id is that other stand's outbound kind — the route that brings
 * it here.
 */
export function vehicleDeparturePostActions(
  post: VehicleDeparturePost,
  home: VehicleDeparturePost | null,
): readonly EntryInteractionAction[] {
  if (!home) return [];
  if (home.id === post.id) {
    return [{ id: post.outboundKind, labelKey: post.outboundLabelKey }];
  }
  return [{ id: home.outboundKind, labelKey: post.callLabelKey }];
}
