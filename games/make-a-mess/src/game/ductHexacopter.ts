/**
 * VX-8 «Yaqui» — passport of the second combat hexacopter for the world.
 *
 * Twin of `combatHexacopter.ts` by deliberate choice: the runtime already knows
 * how to read that shape, and a second machine that invents its own would make
 * the frame system carry two dialects of the same sentence. What differs is
 * only what the two machines actually differ in.
 *
 * NOTHING HERE IS AUTHORED TWICE. Every station, axis, muzzle and strut point
 * is read from the accepted object study
 * (`content/objects/vehicles/ductHexacopterObject.ts`, revision
 * `duct-hex-d4a-rig-2026-08-08`). A number copied into this file would be a
 * second source of truth, and the first divergence would put a tracer outside
 * the barrel it is drawn coming from.
 *
 * Division of labour agreed with the Windows session on 2026-08-09
 * (`docs/duct-hexacopter/handoff-integration.md`): this file is the object
 * translating itself — points, axes, struts, envelope. Berth, live tuning of
 * mass and lift, yaw allocation and the figure envelope belong to the runtime
 * and are not decided here. Inertia in particular is deliberately absent: it is
 * derived from the assembled cluster, because an authored copy would drift from
 * the body Rapier actually simulates.
 */

import {
  DUCT_HEX_CORE_HEIGHT,
  DUCT_HEX_CORE_LENGTH,
  DUCT_HEX_CORE_WIDTH,
  DUCT_HEX_GEAR_RETRACTION,
  DUCT_HEX_HULL_CONTOUR,
  DUCT_HEX_LANDING_STATIONS,
  DUCT_HEX_LIFT_STATIONS,
  DUCT_HEX_LIFT_TIP,
  DUCT_HEX_OLEO_STROKE,
  DUCT_HEX_YAW_STATIONS,
  ductHexacopterObject,
  ductHexacopterPartBounds,
} from "../content/objects/vehicles/ductHexacopterObject.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import type {
  VehicleFrameDefinition,
  VehicleSupportStrutDefinition,
} from "./vehicleFrames.ts";
import {
  explosiveProfile,
  MG_FIRE_INTERVAL,
  MG_RANGE,
} from "./destructionRuntime.ts";
import type { VehicleArmament, WeaponMount } from "./vehicleGunnery.ts";

export const DUCT_HEXACOPTER_BLUEPRINT_ID = "duct-hexacopter";
export const VX8_YAQUI_NAME = "VX-8 Yaqui";
export const VX8_YAQUI_TELEMETRY_LABEL = "VX-8 YAQUI";

export interface DuctHexacopterPlacement {
  readonly sceneId: string;
  readonly clusterId: string;
  readonly position: SceneVector3;
  readonly yaw: number;
}

export interface DuctHexacopterYawThruster {
  readonly id: "left" | "right";
  readonly point: SceneVector3;
  /** Reversible thrust axis in the authored body frame. */
  readonly axis: SceneVector3;
  readonly maximumForce: number;
}

export interface DuctHexacopterBlueprint {
  readonly id: typeof DUCT_HEXACOPTER_BLUEPRINT_ID;
  readonly telemetryLabel: typeof VX8_YAQUI_TELEMETRY_LABEL;
  readonly placement: DuctHexacopterPlacement;
  readonly origin: SceneVector3;
  readonly nose: SceneVector3;
  readonly liftCentre: SceneVector3;
  readonly mooringPoint: SceneVector3;
  readonly enginePoints: readonly SceneVector3[];
  readonly rotorCapacityWeights: readonly number[];
  readonly rotorSpinDirections: readonly (-1 | 1)[];
  readonly yawThrusters: readonly DuctHexacopterYawThruster[];
  readonly proximitySensors: readonly {
    readonly point: SceneVector3;
    readonly normal: SceneVector3;
  }[];
  readonly landingStruts: readonly VehicleSupportStrutDefinition[];
  readonly armament: VehicleArmament;
  readonly envelope: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  };
  readonly flight: {
    readonly liftSource: "rotor";
    readonly liftReserve: number;
    readonly maximumTilt: number;
    readonly liftTrimRange: number;
    readonly spoolSeconds: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
  };
}

export const DUCT_HEXACOPTER_PROTOTYPE_PLACEMENT: DuctHexacopterPlacement = {
  sceneId: "duct-hexacopter-prototype",
  clusterId: "duct-hexacopter-prototype:vehicle",
  // Authoring datum, not a world berth. The berth belongs to the range scene
  // and is chosen by the session that owns placement.
  position: [0, 0, 0],
  yaw: 0,
};

const rotated = (value: SceneVector3, yaw: number): SceneVector3 => {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    value[0] * cosine + value[2] * sine,
    value[1],
    -value[0] * sine + value[2] * cosine,
  ];
};

export function ductHexacopterVector(
  placement: DuctHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  return rotated(local, placement.yaw);
}

export function ductHexacopterPoint(
  placement: DuctHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  const offset = ductHexacopterVector(placement, local);
  return [
    placement.position[0] + offset[0],
    placement.position[1] + offset[1],
    placement.position[2] + offset[2],
  ];
}

/**
 * Muzzle of an authored barrel, read from the part itself: the forward face of
 * its bounds on the machine axis. Typing the number here instead would mean the
 * tracer leaves a point where no barrel ends.
 */
function muzzleOf(partId: string): SceneVector3 {
  const part = ductHexacopterObject.parts.find((candidate) => candidate.id === partId);
  if (!part) throw new Error(`duct hexacopter armament: no part ${partId}`);
  const bounds = ductHexacopterPartBounds(part);
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    bounds.max[2],
  ];
}

/** Forward edge of the hull itself, read from the accepted force-contour. */
const hullForwardEdge = Math.max(...DUCT_HEX_HULL_CONTOUR.map((corner) => corner.z));

const CANNON_BARREL_IDS = ["gun-barrel-0", "gun-barrel-1", "gun-barrel-2"] as const;

const LAUNCHER_TUBE_IDS = ["port", "starboard"].flatMap((side) =>
  [0, 1].flatMap((row) => [0, 1, 2].map((column) => `launcher-tube-${side}-${row}-${column}`)),
);

/**
 * Disc area sets how much of the collective each ring can carry. All six rings
 * on this machine share one tip radius, so the weights come out equal — and
 * they are still derived rather than written as ones, because the day a station
 * changes diameter the mixer must learn it from the object, not from a comment.
 */
const standardDiscArea = DUCT_HEX_LIFT_TIP ** 2;

export const DUCT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS = DUCT_HEX_LIFT_STATIONS.map(
  () => DUCT_HEX_LIFT_TIP ** 2 / standardDiscArea,
);

export const DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS = DUCT_HEX_LIFT_STATIONS.map(
  (station) => (station.spin === "cw" ? (1 as const) : (-1 as const)),
);

/**
 * Reversible tunnel force — PROVISIONAL, and provisional by an order of
 * magnitude rather than by a percent.
 *
 * The first figure here was 145 N, chosen as "a bit more than RAX-8". The
 * Windows session took it apart with numbers instead of taste: dropping the
 * cant that RAX-8 has cost this machine yaw arm, `1.183 m` down to `0.980 m` a
 * side, while its yaw radius of gyration is `2.60 m` against RAX-8's `1.43 m`
 * — the mass of this body rides the hull rim, not the arms. At 145 N that is
 * `3.8 rad/s²` where the first machine gets `15.0`, so the pair would exist and
 * do nothing.
 *
 * The estimate that replaced it — `1030 N` at 20 kg — then overshot the other
 * way, and the measurement settled it: on the assembled cluster the yaw inertia
 * is `132.7 kg·m²`, where `1030 N` would give roughly twice the angular
 * acceleration RAX-8 has proven flyable. The runtime pinned `541 N`
 * (`rangeDuctHexacopter.ts`), which lands at `15.2 rad/s²` against its `8.0`.
 *
 * This constant follows that measurement rather than keeping a second opinion:
 * a passport figure that disagrees with the flying machine is exactly the second
 * source of truth both sessions refused to keep for inertia.
 */
export const DUCT_HEXACOPTER_YAW_FAN_FORCE = 541;

const localYawThrusters = (): readonly DuctHexacopterYawThruster[] =>
  DUCT_HEX_YAW_STATIONS.map((station) => ({
    id: station.id,
    point: [station.x, station.y, DUCT_HEX_YAW_ROTOR_Z_LOCAL],
    // The tunnels are parallel to the keel by construction — no cant, unlike
    // RAX-8, so their side force is zero and the lift controller has nothing to
    // cancel. That is a property of the accepted geometry, not a simplification.
    axis: [0, 0, 1],
    maximumForce: DUCT_HEXACOPTER_YAW_FAN_FORCE,
  }));

/** Rotor plane of the yaw fans, read from the object's own kinematic contract. */
const DUCT_HEX_YAW_ROTOR_Z_LOCAL = ductHexacopterObject.kinematicGroups.find(
  (group) => group.id === "yaw-right",
)?.pivot[2] ?? 0;

const GEAR_RETRACT_SECONDS = 4.2;

function landingStruts(
  placement: DuctHexacopterPlacement,
): readonly VehicleSupportStrutDefinition[] {
  return DUCT_HEX_LANDING_STATIONS.map((station) => {
    const retraction = DUCT_HEX_GEAR_RETRACTION.find(
      (contract) => contract.id === station.id,
    );
    if (!retraction) throw new Error(`duct hexacopter gear: no contract for ${station.id}`);
    return {
      plan: {
        id: station.id,
        mount: ductHexacopterPoint(placement, station.knee),
        axis: ductHexacopterVector(placement, [
          station.axle[0] - station.knee[0],
          station.axle[1] - station.knee[1],
          station.axle[2] - station.knee[2],
        ]),
        groundHeight: placement.position[1],
        stroke: DUCT_HEX_OLEO_STROKE,
        staticSagShare: 0.25,
        compressedLoadFactor: 6,
        designSinkRate: 2,
        oilShareAtDesignRate: 2,
        recoilSeconds: 0.9,
      },
      requiredMembers: [
        `:landing-main-strut-${station.id}:`,
        `:landing-pad-${station.id}:`,
      ],
      travellingMembers: [
        `:landing-oleo-piston-${station.id}:`,
        `:landing-pad-pivot-${station.id}:`,
        `:landing-pad-${station.id}:`,
        `:landing-sole-${station.id}:`,
      ],
      retraction: {
        pivot: ductHexacopterPoint(placement, retraction.pivot),
        hinge: ductHexacopterVector(placement, retraction.axis),
        // Solved by the object, not typed here: the leg turns about its own
        // trunnion until it lies horizontal inboard, which for this splay is
        // far past the ninety degrees one would write from habit.
        angle: (retraction.rangeDegrees[1] * Math.PI) / 180,
        seconds: GEAR_RETRACT_SECONDS,
      },
      foldingMembers: [
        `:landing-main-strut-${station.id}:`,
        `:landing-drag-link-${station.id}:`,
        `:landing-knee-${station.id}:`,
        `:landing-oleo-${station.id}:`,
        `:landing-oleo-gland-${station.id}:`,
        `:landing-oleo-piston-${station.id}:`,
        `:landing-pad-pivot-${station.id}:`,
        `:landing-pad-${station.id}:`,
        `:landing-sole-${station.id}:`,
      ],
    };
  });
}

function armament(placement: DuctHexacopterPlacement): VehicleArmament {
  const cannonMounts: WeaponMount[] = CANNON_BARREL_IDS.map((partId, index) => ({
    id: `gun-barrel-${index}`,
    muzzle: ductHexacopterPoint(placement, muzzleOf(partId)),
  }));
  const tubeMounts: WeaponMount[] = LAUNCHER_TUBE_IDS.map((partId) => ({
    id: partId,
    muzzle: ductHexacopterPoint(placement, muzzleOf(partId)),
  }));
  const tubeMouthZ = Math.max(
    ...LAUNCHER_TUBE_IDS.map((partId) => muzzleOf(partId)[2]),
  );
  return {
    cannon: {
      kind: "cannon",
      mounts: cannonMounts,
      range: MG_RANGE,
      fireInterval: MG_FIRE_INTERVAL,
      dispersion: 0.012,
      trackingSeconds: 0.22,
    },
    rockets: {
      kind: "podRocket",
      mounts: tubeMounts,
      explosive: "podRocket",
      rippleSize: 3,
      rippleInterval: 0.14,
      reloadSeconds: 2.2,
      rearmSeconds: 30,
      range: 85,
      rippleSpread: 0.012,
      aimTolerance: 0.052,
      harmonisationRange: 40,
      // Derived, never chosen: from the tube mouth to the forward edge of the
      // envelope, plus the proximity fuse radius, plus margin. Without the fuse
      // term the rocket leaves the tube and detonates on its own machine.
      // From the tube mouth to the forward edge of the HULL, not of the whole
      // envelope: the envelope's front edge is the gun barrel sticking out
      // ahead of the nose, and arming the rockets against that would push the
      // fuse a metre and a half further out than the machine actually is.
      launchClearance:
        hullForwardEdge -
        tubeMouthZ +
        (explosiveProfile("podRocket").proximityFuse ?? 0) +
        0.3,
      armSeconds: 0.35,
    },
  };
}

/**
 * Proximity sensors sit ON the machine, in the middle of a ring plate — the
 * rings are twelve segments with splice straps every thirty degrees, and a raw
 * outward radius lands the sensor on a joint. The belly sensor sits on the skin
 * rather than under it: a sensor hanging in free air below the hull reads as a
 * detached lamp the moment the machine is near the ground.
 */
const RING_PLATE = Math.PI / 6;

function plateMiddleAzimuth(outwardAzimuth: number): number {
  return (
    Math.round((outwardAzimuth - RING_PLATE / 2) / RING_PLATE) * RING_PLATE +
    RING_PLATE / 2
  );
}

function proximitySensors(): DuctHexacopterBlueprint["proximitySensors"] {
  const sensors: { point: SceneVector3; normal: SceneVector3 }[] = [];
  const middleRight = DUCT_HEX_LIFT_STATIONS.find((station) => station.id === "middle-right");
  const middleLeft = DUCT_HEX_LIFT_STATIONS.find((station) => station.id === "middle-left");
  if (!middleRight || !middleLeft) throw new Error("duct hexacopter sensors: no middle rings");
  for (const [station, outward] of [
    [middleRight, 0],
    [middleLeft, Math.PI],
  ] as const) {
    const azimuth = plateMiddleAzimuth(outward);
    sensors.push({
      point: [
        station.x + Math.cos(azimuth) * 0.96,
        station.planeY,
        station.z + Math.sin(azimuth) * 0.96,
      ],
      normal: [Math.cos(azimuth), 0, Math.sin(azimuth)],
    });
  }
  // Two per ring, on the middle of an outward plate: down for height under the
  // duct that will touch first in a rolled landing, up for the clearance a
  // machine needs when it lifts under something.
  for (const station of DUCT_HEX_LIFT_STATIONS) {
    const outward = station.x < 0 ? Math.PI : 0;
    const azimuth = plateMiddleAzimuth(outward);
    const x = station.x + Math.cos(azimuth) * 0.86;
    const z = station.z + Math.sin(azimuth) * 0.86;
    sensors.push({ point: [x, station.planeY - 0.34, z], normal: [0, -1, 0] });
    sensors.push({ point: [x, station.planeY + 0.36, z], normal: [0, 1, 0] });
  }
  // Down on the axis, on the belly skin and clear of the launcher bays: a
  // sensor hanging in free air under the hull reads as a detached lamp.
  sensors.push({ point: [0, 0.58, -1.6], normal: [0, -1, 0] });
  // Forward, on the nose under the beak.
  sensors.push({ point: [0, 0.86, 3.7], normal: [0, 0, 1] });
  return sensors;
}

export function createDuctHexacopterBlueprint(
  placement: DuctHexacopterPlacement,
): DuctHexacopterBlueprint {
  const origin = ductHexacopterPoint(placement, [0, 1.02, 0]);
  return {
    id: DUCT_HEXACOPTER_BLUEPRINT_ID,
    telemetryLabel: VX8_YAQUI_TELEMETRY_LABEL,
    placement,
    origin,
    nose: ductHexacopterVector(placement, [0, 0, 1]),
    // Lift acts in the plane of the rings, which on this machine is a hand
    // above the origin — flatter than RAX-8, because the body is flatter.
    liftCentre: ductHexacopterPoint(placement, [
      0,
      DUCT_HEX_LIFT_STATIONS[0].planeY,
      0,
    ]),
    mooringPoint: ductHexacopterPoint(placement, [0, 0.86, 3.7]),
    enginePoints: DUCT_HEX_LIFT_STATIONS.map((station) =>
      ductHexacopterPoint(placement, [station.x, station.planeY, station.z]),
    ),
    rotorCapacityWeights: DUCT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS,
    rotorSpinDirections: DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS,
    yawThrusters: localYawThrusters().map((thruster) => ({
      ...thruster,
      point: ductHexacopterPoint(placement, thruster.point),
      axis: ductHexacopterVector(placement, thruster.axis),
    })),
    proximitySensors: proximitySensors().map((sensor) => ({
      point: ductHexacopterPoint(placement, sensor.point),
      normal: ductHexacopterVector(placement, sensor.normal),
    })),
    landingStruts: landingStruts(placement),
    armament: armament(placement),
    envelope: {
      length: DUCT_HEX_CORE_LENGTH,
      width: DUCT_HEX_CORE_WIDTH,
      height: DUCT_HEX_CORE_HEIGHT,
    },
    flight: {
      liftSource: "rotor",
      // Capability is (reserve - 1) * g, so a reserve near one is a hollow
      // machine, not a modest one. RAX-8 declares 4.2; this body is broader and
      // heavier on the same six rings, so it starts lower and the runtime tunes
      // it against live mass — that number is theirs, this one is a start.
      liftReserve: 3.6,
      // Route policy rather than a hard envelope, now that attitude is an input
      // to the guidance demand. Kept below the RAX-8 figure: this machine has
      // the same six rings under a broader, heavier body, so the tilt it can
      // hold while still climbing is smaller.
      maximumTilt: (48 * Math.PI) / 180,
      liftTrimRange: 0.32,
      spoolSeconds: 4.1,
      linearDamping: 0.21,
      angularDamping: 0.72,
      lateralDragRatio: 8.4,
    },
  };
}

export const ductHexacopterPrototypeBlueprint = createDuctHexacopterBlueprint(
  DUCT_HEXACOPTER_PROTOTYPE_PLACEMENT,
);

/**
 * Complete movable-frame passport, returned by a factory and deliberately not
 * inserted into `vehicleFrames`: world registration happens only after a berth
 * is chosen, and the berth is not this file's decision.
 */
export function createDuctHexacopterVehicleFrame(
  blueprint: DuctHexacopterBlueprint,
): VehicleFrameDefinition {
  return {
    id: blueprint.id,
    clusterId: blueprint.placement.clusterId,
    telemetryLabel: blueprint.telemetryLabel,
    // Only what turns needs a body of its own. The mask is the blades and
    // nothing else — the object has 715 pieces, and a looser mask would hand a
    // body to hundreds of them for no motion at all.
    independentMemberMatches: [":blade:"],
    // A leg with a collider is what its own strut ray finds underneath: the
    // machine then lands in the air at zero compression. The legs are carried
    // by `supportStrut`, so they stay out of the compound contact envelope.
    contactMemberExcludes: [":landing-"],
    origin: blueprint.origin,
    nose: blueprint.nose,
    mooringPoint: blueprint.mooringPoint,
    liftCentre: blueprint.liftCentre,
    envelopeMatch: ":blade:",
    proximitySensors: blueprint.proximitySensors,
    supportStruts: blueprint.landingStruts,
  };
}

export const ductHexacopterPrototypeFrame = createDuctHexacopterVehicleFrame(
  ductHexacopterPrototypeBlueprint,
);

/**
 * Proposed values for the fields that live in the `airVehicles` limits literal
 * rather than on the blueprint. They are exported so the session that owns
 * placement and tuning does not have to invent them, and so a wrong figure is
 * wrong in an obvious direction instead of silently: `lateralThrust` at or
 * below zero switches off authored heading and the crab limit without an error,
 * and the figure layer hands out a hollow capability when a limit is missing.
 *
 * RAX-8 for comparison: enginePower 105, lateralThrust 70, yaw fan 125.
 * Everything about mass and inertia stays with the runtime by agreement.
 */
export const DUCT_HEXACOPTER_PROPOSED_LIMITS = {
  /**
   * Per thrust point, six of them. Superseded by measurement: the assembled
   * cluster weighs `20.05 kg`, not the `11 kg` these limits were solved for, so
   * the runtime carries `225` and `152`. Kept here as the passport's own
   * derivation, marked as what it is — the number a drawing can reach before a
   * body exists.
   */
  enginePower: 124,
  /**
   * Strictly above zero, or heading and crab die quietly — and consistent with
   * `enginePower`, which the first draft was not. The house rule
   * (`tests/sr6-skat.test.mjs`) reads lateral as `thrust / m` at `7.59` and
   * thrust-to-weight as `power * 6 / (m * g)` at `6.86`. My pair, 124 and 62,
   * described two different machines — 11.1 kg and 8.2 kg — and both lighter
   * than RAX-8 at 9.58 kg, which this broader body certainly is not. At
   * `enginePower 124` the consistent lateral figure is 83.
   */
  lateralThrust: 83,
  maxRudderForce: 0,
  rudderReferenceSpeed: 8,
} as const;
