import type { SceneVector3 } from "./destructionScene.ts";
import {
  HEXACOPTER_LIFT_CENTRE,
  HEXACOPTER_MOORING_POINT,
  HEXACOPTER_NOSE,
  HEXACOPTER_ORIGIN,
  HEXACOPTER_PAD_TOP_Y,
  HEXACOPTER_PAD_X,
  HEXACOPTER_PAD_Z,
  HEXACOPTER_RUDDER_POINT,
  hexacopterPoint,
  isInsideHexacopter,
} from "./townHexacopter.ts";
import {
  NIMBUS_FLIGHT_FIELD_ALONG,
  NIMBUS_FLIGHT_FIELD_CENTRE,
  NIMBUS_FLIGHT_FIELD_OUTWARD,
  nimbusGroundUnder,
} from "../content/scenes/nimbus/nimbusShell.ts";

export const NIMBUS_HEXACOPTER_PAD_ID = "production-assembly";
export const NIMBUS_HEXACOPTER_CLUSTER_ID = "nimbus:nimbus:hexacopter";

const PAD_ALONG = -55;
const PAD_OUTWARD = -42;

export const NIMBUS_HEXACOPTER_PAD_CENTRE = [
  NIMBUS_FLIGHT_FIELD_CENTRE[0]
    + NIMBUS_FLIGHT_FIELD_ALONG[0] * PAD_ALONG
    + NIMBUS_FLIGHT_FIELD_OUTWARD[0] * PAD_OUTWARD,
  NIMBUS_FLIGHT_FIELD_CENTRE[1]
    + NIMBUS_FLIGHT_FIELD_ALONG[1] * PAD_ALONG
    + NIMBUS_FLIGHT_FIELD_OUTWARD[1] * PAD_OUTWARD,
] as const;

const padGround = nimbusGroundUnder(...NIMBUS_HEXACOPTER_PAD_CENTRE).top;
/** Existing Nimbus pad: 0.65 m base plus 0.2 m deck. */
export const NIMBUS_HEXACOPTER_PAD_TOP_Y = padGround + 0.85;

const inwardLength = Math.hypot(...NIMBUS_HEXACOPTER_PAD_CENTRE);
const desiredNose: SceneVector3 = [
  -NIMBUS_HEXACOPTER_PAD_CENTRE[0] / inwardLength,
  0,
  -NIMBUS_HEXACOPTER_PAD_CENTRE[1] / inwardLength,
];

/** World-yaw which turns the town machine's west-facing nose toward the island. */
export const NIMBUS_HEXACOPTER_YAW = Math.atan2(
  desiredNose[2],
  -desiredNose[0],
);

export function nimbusHexacopterVectorFromTown(
  vector: SceneVector3,
): SceneVector3 {
  const cosine = Math.cos(NIMBUS_HEXACOPTER_YAW);
  const sine = Math.sin(NIMBUS_HEXACOPTER_YAW);
  return [
    vector[0] * cosine + vector[2] * sine,
    vector[1],
    -vector[0] * sine + vector[2] * cosine,
  ];
}

export function nimbusHexacopterPointFromTown(
  point: SceneVector3,
): SceneVector3 {
  const relative = nimbusHexacopterVectorFromTown([
    point[0] - HEXACOPTER_PAD_X,
    point[1] - HEXACOPTER_PAD_TOP_Y,
    point[2] - HEXACOPTER_PAD_Z,
  ]);
  return [
    NIMBUS_HEXACOPTER_PAD_CENTRE[0] + relative[0],
    NIMBUS_HEXACOPTER_PAD_TOP_Y + relative[1],
    NIMBUS_HEXACOPTER_PAD_CENTRE[1] + relative[2],
  ];
}

function townPointFromNimbus(point: SceneVector3): SceneVector3 {
  const cosine = Math.cos(NIMBUS_HEXACOPTER_YAW);
  const sine = Math.sin(NIMBUS_HEXACOPTER_YAW);
  const dx = point[0] - NIMBUS_HEXACOPTER_PAD_CENTRE[0];
  const dz = point[2] - NIMBUS_HEXACOPTER_PAD_CENTRE[1];
  return [
    HEXACOPTER_PAD_X + dx * cosine - dz * sine,
    HEXACOPTER_PAD_TOP_Y + point[1] - NIMBUS_HEXACOPTER_PAD_TOP_Y,
    HEXACOPTER_PAD_Z + dx * sine + dz * cosine,
  ];
}

export function nimbusHexacopterPoint(
  forward: number,
  starboard: number,
  sourceY: number,
): SceneVector3 {
  return nimbusHexacopterPointFromTown(
    hexacopterPoint(forward, starboard, sourceY),
  );
}

export function isInsideNimbusHexacopter(point: SceneVector3): boolean {
  return isInsideHexacopter(townPointFromNimbus(point));
}

export const NIMBUS_HEXACOPTER_NOSE =
  nimbusHexacopterVectorFromTown(HEXACOPTER_NOSE);
export const NIMBUS_HEXACOPTER_ORIGIN =
  nimbusHexacopterPointFromTown(HEXACOPTER_ORIGIN);
export const NIMBUS_HEXACOPTER_LIFT_CENTRE =
  nimbusHexacopterPointFromTown(HEXACOPTER_LIFT_CENTRE);
export const NIMBUS_HEXACOPTER_MOORING_POINT =
  nimbusHexacopterPointFromTown(HEXACOPTER_MOORING_POINT);
export const NIMBUS_HEXACOPTER_RUDDER_POINT =
  nimbusHexacopterPointFromTown(HEXACOPTER_RUDDER_POINT);
