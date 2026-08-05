import type { CompoundKinematicImpulse } from "./compoundKinematicCluster.ts";
import {
  conjugateQuaternion,
  rotateVector,
  type BodyState,
  type MassProperties,
} from "./clusterDynamics.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import type {
  MotionTelemetryImpact,
  MotionTelemetryVector3,
} from "./motionTelemetry.ts";

interface ImpactFrameGeometry {
  readonly origin: SceneVector3;
  readonly nose: SceneVector3;
  readonly localBounds: {
    readonly minimum: SceneVector3;
    readonly maximum: SceneVector3;
  };
}

interface VehicleImpactTelemetryInput {
  readonly frame: ImpactFrameGeometry;
  readonly properties: MassProperties;
  readonly before: BodyState;
  readonly after: BodyState;
  readonly impulses: readonly CompoundKinematicImpulse[];
  readonly sequence: number;
  readonly capturedAt: number;
}

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(value: SceneVector3): SceneVector3 {
  const length = Math.hypot(...value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function carrierAxes(nose: SceneVector3): {
  readonly starboard: SceneVector3;
  readonly up: SceneVector3;
  readonly forward: SceneVector3;
} {
  const forward = normalize(nose);
  const starboard = normalize([-forward[2], 0, forward[0]]);
  const up = normalize([
    starboard[1] * forward[2] - starboard[2] * forward[1],
    starboard[2] * forward[0] - starboard[0] * forward[2],
    starboard[0] * forward[1] - starboard[1] * forward[0],
  ]);
  return { starboard, up, forward };
}

function inCarrierAxes(
  local: SceneVector3,
  axes: ReturnType<typeof carrierAxes>,
): MotionTelemetryVector3 {
  return [
    dot(local, axes.starboard),
    dot(local, axes.up),
    dot(local, axes.forward),
  ];
}

function worldVectorInCarrierAxes(
  world: SceneVector3,
  orientation: BodyState["orientation"],
  axes: ReturnType<typeof carrierAxes>,
): MotionTelemetryVector3 {
  return inCarrierAxes(
    rotateVector(conjugateQuaternion(orientation), world),
    axes,
  );
}

function carrierExtents(
  frame: ImpactFrameGeometry,
  properties: MassProperties,
  axes: ReturnType<typeof carrierAxes>,
): MotionTelemetryVector3 {
  const centre: SceneVector3 = [
    properties.centre[0] - frame.origin[0],
    properties.centre[1] - frame.origin[1],
    properties.centre[2] - frame.origin[2],
  ];
  const extents: [number, number, number] = [0.01, 0.01, 0.01];
  for (const x of [frame.localBounds.minimum[0], frame.localBounds.maximum[0]]) {
    for (const y of [frame.localBounds.minimum[1], frame.localBounds.maximum[1]]) {
      for (const z of [frame.localBounds.minimum[2], frame.localBounds.maximum[2]]) {
        const projected = inCarrierAxes(
          [x - centre[0], y - centre[1], z - centre[2]],
          axes,
        );
        for (let axis = 0; axis < 3; axis += 1) {
          extents[axis] = Math.max(extents[axis], Math.abs(projected[axis]));
        }
      }
    }
  }
  return extents;
}

/**
 * Авторская точка машины в ЕДИНИЧНОМ корпусе сферы телеметрии — тем же
 * эллипсоидом и теми же осями [правый борт, верх, нос], что и точка удара.
 * Силуэт органов и вектор удара обязаны жить в одной системе координат;
 * второй нормировки, которая могла бы разъехаться, не существует.
 */
export function carrierHullPoint(
  frame: ImpactFrameGeometry,
  properties: MassProperties,
  authored: SceneVector3,
): MotionTelemetryVector3 {
  const axes = carrierAxes(frame.nose);
  const point = inCarrierAxes(
    [
      authored[0] - properties.centre[0],
      authored[1] - properties.centre[1],
      authored[2] - properties.centre[2],
    ],
    axes,
  );
  const extents = carrierExtents(frame, properties, axes);
  return [
    Math.max(-1, Math.min(1, point[0] / extents[0])),
    Math.max(-1, Math.min(1, point[1] / extents[1])),
    Math.max(-1, Math.min(1, point[2] / extents[2])),
  ];
}

export function createVehicleImpactTelemetry({
  frame,
  properties,
  before,
  after,
  impulses,
  sequence,
  capturedAt,
}: VehicleImpactTelemetryInput): MotionTelemetryImpact | null {
  if (impulses.length === 0 || properties.mass <= 0) return null;

  let dominant = impulses[0];
  let dominantMagnitude = -1;
  const netImpulse: [number, number, number] = [0, 0, 0];
  for (const applied of impulses) {
    const magnitude = Math.hypot(...applied.impulse);
    if (magnitude > dominantMagnitude) {
      dominant = applied;
      dominantMagnitude = magnitude;
    }
    netImpulse[0] += applied.impulse[0];
    netImpulse[1] += applied.impulse[1];
    netImpulse[2] += applied.impulse[2];
  }

  const axes = carrierAxes(frame.nose);
  const leverWorld: SceneVector3 = [
    dominant.point[0] - before.position[0],
    dominant.point[1] - before.position[1],
    dominant.point[2] - before.position[2],
  ];
  const leverLocal = rotateVector(
    conjugateQuaternion(before.orientation),
    leverWorld,
  );
  const point = inCarrierAxes(leverLocal, axes);
  const extents = carrierExtents(frame, properties, axes);
  const ellipsoidPoint: SceneVector3 = [
    point[0] / extents[0],
    point[1] / extents[1],
    point[2] / extents[2],
  ];
  const pointLength = Math.hypot(...ellipsoidPoint) || 1;
  const deltaVelocityWorld: SceneVector3 = [
    after.velocity[0] - before.velocity[0],
    after.velocity[1] - before.velocity[1],
    after.velocity[2] - before.velocity[2],
  ];
  const deltaAngularVelocityWorld: SceneVector3 = [
    after.angularVelocity[0] - before.angularVelocity[0],
    after.angularVelocity[1] - before.angularVelocity[1],
    after.angularVelocity[2] - before.angularVelocity[2],
  ];

  return {
    sequence,
    capturedAt,
    pointOnHull: [
      ellipsoidPoint[0] / pointLength,
      ellipsoidPoint[1] / pointLength,
      ellipsoidPoint[2] / pointLength,
    ],
    impulseBody: worldVectorInCarrierAxes(
      netImpulse,
      before.orientation,
      axes,
    ),
    deltaVelocityBody: worldVectorInCarrierAxes(
      deltaVelocityWorld,
      before.orientation,
      axes,
    ),
    deltaAngularVelocityBody: worldVectorInCarrierAxes(
      deltaAngularVelocityWorld,
      before.orientation,
      axes,
    ),
    impulseMagnitude: Math.hypot(...netImpulse),
  };
}
