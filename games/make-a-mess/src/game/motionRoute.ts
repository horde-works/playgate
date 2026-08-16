import type { SceneVector3 } from "./destructionScene.ts";

/**
 * A route is an authored path plus named requirements sampled along it.
 * It knows nothing about a vehicle, controller or physics engine.
 *
 * Curves are cubic Beziers between adjacent nodes. `outgoing` belongs to the
 * segment leaving a node, `incoming` to the segment arriving at one. Leaving
 * both out makes that segment a straight line, so a future route editor can
 * author ordinary waypoints and add approach curves only where they matter.
 */
export interface MotionRouteNode {
  readonly id: string;
  readonly position: SceneVector3;
  readonly incoming?: SceneVector3;
  readonly outgoing?: SceneVector3;
  /** Sampling density for the segment arriving at this node. */
  readonly samples?: number;
}

export interface MotionRouteRequirementContext {
  readonly progress: number;
  readonly distance: number;
  readonly remaining: number;
  readonly length: number;
}

export type MotionRouteRequirement = (
  context: MotionRouteRequirementContext,
) => number;

export interface MotionRouteDefinition {
  readonly id: string;
  readonly nodes: readonly MotionRouteNode[];
  /** Axes used for progress and length; an air route uses ground distance. */
  readonly measureAxes?: readonly (0 | 1 | 2)[];
  readonly requirements?: Readonly<Record<string, MotionRouteRequirement>>;
  /** Named route sections point at nodes, e.g. `final` -> `final-entry`. */
  readonly markers?: Readonly<Record<string, string>>;
}

export interface MotionRouteArtifact {
  readonly id: string;
  readonly length: number;
  point(progress: number): SceneVector3;
  requirement(name: string, progress: number): number;
  nodeProgress(nodeId: string): number;
  markerProgress(marker: string): number;
}

export type MotionRoutePhase =
  | "departure"
  | "cruise"
  | "approach"
  | "rollout"
  | "taxi";

/**
 * Resolve reusable journey phases from route-authored boundaries. Vehicles
 * and their accessories consume the result without knowing route geometry.
 */
export function motionRoutePhase(
  route: MotionRouteArtifact,
  progress: number,
  departureCompleteMarker = "departureComplete",
  approachMarker = "final",
  rolloutMarker?: string,
  taxiMarker?: string,
): MotionRoutePhase {
  const clamped = clamp01(progress);
  if (taxiMarker && clamped >= route.markerProgress(taxiMarker)) {
    return "taxi";
  }
  if (rolloutMarker && clamped >= route.markerProgress(rolloutMarker)) {
    return "rollout";
  }
  if (clamped < route.markerProgress(departureCompleteMarker)) {
    return "departure";
  }
  if (clamped >= route.markerProgress(approachMarker)) {
    return "approach";
  }
  return "cruise";
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function cubic(
  a: SceneVector3,
  b: SceneVector3,
  c: SceneVector3,
  d: SceneVector3,
  t: number,
): SceneVector3 {
  const rest = 1 - t;
  const aa = rest * rest * rest;
  const bb = 3 * rest * rest * t;
  const cc = 3 * rest * t * t;
  const dd = t * t * t;
  return [
    a[0] * aa + b[0] * bb + c[0] * cc + d[0] * dd,
    a[1] * aa + b[1] * bb + c[1] * cc + d[1] * dd,
    a[2] * aa + b[2] * bb + c[2] * cc + d[2] * dd,
  ];
}

/** Compile once; sampling afterwards is allocation-light and arc-length based. */
export function createMotionRoute(
  definition: MotionRouteDefinition,
): MotionRouteArtifact {
  if (definition.nodes.length < 2) {
    throw new Error(`Route ${definition.id} needs at least two nodes`);
  }
  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Route ${definition.id} has duplicate node ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const axes = definition.measureAxes ?? [0, 1, 2];
  const points: SceneVector3[] = [definition.nodes[0].position];
  const nodePointIndex = new Map<string, number>([[definition.nodes[0].id, 0]]);
  for (let index = 1; index < definition.nodes.length; index += 1) {
    const from = definition.nodes[index - 1];
    const to = definition.nodes[index];
    const curved = Boolean(from.outgoing || to.incoming);
    const samples = curved ? Math.max(4, to.samples ?? 36) : 1;
    const controlA = from.outgoing ?? from.position;
    const controlB = to.incoming ?? to.position;
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples;
      points.push(
        curved
          ? cubic(from.position, controlA, controlB, to.position, t)
          : to.position,
      );
    }
    nodePointIndex.set(to.id, points.length - 1);
  }

  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    let squared = 0;
    for (const axis of axes) {
      squared += (points[index][axis] - points[index - 1][axis]) ** 2;
    }
    cumulative.push(cumulative[index - 1] + Math.sqrt(squared));
  }
  const length = cumulative[cumulative.length - 1];
  if (!(length > 0)) {
    throw new Error(`Route ${definition.id} has zero length`);
  }

  const progressAtNode = (nodeId: string): number => {
    const index = nodePointIndex.get(nodeId);
    if (index === undefined) {
      throw new Error(`Route ${definition.id} has no node ${nodeId}`);
    }
    return cumulative[index] / length;
  };

  return {
    id: definition.id,
    length,
    point(progress) {
      const distance = clamp01(progress) * length;
      let low = 0;
      let high = cumulative.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (cumulative[middle] <= distance) {
          low = middle;
        } else {
          high = middle;
        }
      }
      const span = cumulative[high] - cumulative[low];
      const mix = span > 0 ? (distance - cumulative[low]) / span : 0;
      const a = points[low];
      const b = points[high];
      return [
        a[0] + (b[0] - a[0]) * mix,
        a[1] + (b[1] - a[1]) * mix,
        a[2] + (b[2] - a[2]) * mix,
      ];
    },
    requirement(name, progress) {
      const requirement = definition.requirements?.[name];
      if (!requirement) {
        throw new Error(`Route ${definition.id} has no requirement ${name}`);
      }
      const clamped = clamp01(progress);
      return requirement({
        progress: clamped,
        distance: clamped * length,
        remaining: (1 - clamped) * length,
        length,
      });
    },
    nodeProgress: progressAtNode,
    markerProgress(marker) {
      const nodeId = definition.markers?.[marker];
      if (!nodeId) {
        throw new Error(`Route ${definition.id} has no marker ${marker}`);
      }
      return progressAtNode(nodeId);
    },
  };
}
