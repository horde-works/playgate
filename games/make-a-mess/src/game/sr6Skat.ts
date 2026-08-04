import {
  SR6_HEIGHT,
  SR6_LENGTH,
  SR6_REAR_ROTOR_DIAMETER,
  SR6_ROTOR_STATIONS,
  SR6_WIDTH,
} from "../content/objects/vehicles/sr6SkatObject.ts";
import type { SceneVector3 } from "./destructionScene.ts";

/** Temporary prototype stand on the broad northern meadow inside town. */
export const SR6_SKAT_SCENE_ID = "sr6-skat-prototype";
export const SR6_SKAT_CLUSTER_ID = `${SR6_SKAT_SCENE_ID}:vehicle`;
export const SR6_SKAT_BERTH: SceneVector3 = [18, 0, 15];
export const SR6_SKAT_YAW = -Math.PI / 2;

const cosine = Math.cos(SR6_SKAT_YAW);
const sine = Math.sin(SR6_SKAT_YAW);

export function sr6SkatPoint(local: SceneVector3): SceneVector3 {
  return [
    SR6_SKAT_BERTH[0] + local[0] * cosine + local[2] * sine,
    SR6_SKAT_BERTH[1] + local[1],
    SR6_SKAT_BERTH[2] - local[0] * sine + local[2] * cosine,
  ];
}

export function sr6SkatVector(local: SceneVector3): SceneVector3 {
  return [
    local[0] * cosine + local[2] * sine,
    local[1],
    -local[0] * sine + local[2] * cosine,
  ];
}

export const SR6_SKAT_NOSE = sr6SkatVector([0, 0, 1]);
export const SR6_SKAT_LIFT_CENTRE = sr6SkatPoint([0, 0.96, 0]);
export const SR6_SKAT_ORIGIN = SR6_SKAT_LIFT_CENTRE;
export const SR6_SKAT_MOORING_POINT = sr6SkatPoint([0, 0.16, 2.3]);
export const SR6_SKAT_DISPATCH_POINT = sr6SkatPoint([2.85, 1.02, 0.8]);
export const SR6_SKAT_PASSENGER_DROP_POINT = sr6SkatPoint([2.55, 1, 0.35]);

export const SR6_SKAT_ENGINE_POINTS = SR6_ROTOR_STATIONS.map((station) =>
  sr6SkatPoint([station.x, station.planeY, station.z]),
);

export const SR6_SKAT_ROTOR_CAPACITY_WEIGHTS = SR6_ROTOR_STATIONS.map(
  (station) => station.powerClass === "rear" ? 1.337 : 1,
);

export const SR6_SKAT_ROTOR_SPIN_DIRECTIONS = SR6_ROTOR_STATIONS.map(
  (station) => station.spin === "cw" ? 1 as const : -1 as const,
);

export const SR6_SKAT_RUDDER_POINT = sr6SkatPoint([0, 1.18, -2.02]);

export const SR6_SKAT_ENVELOPE = {
  length: SR6_LENGTH,
  width: SR6_WIDTH,
  height: SR6_HEIGHT,
  rearRotorRadius: SR6_REAR_ROTOR_DIAMETER / 2,
} as const;
