import type { SceneVector3, CommandActuatorTag } from "./destructionScene.ts";
import type { SceneObjectDefinition } from "../content/scenes/sceneContract.ts";
import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../content/objects/dutchWindmills/objectModel.ts";
import {
  kallurAirshipHullRadius,
  kallurAirshipObject,
  KALLUR_AIRSHIP_AXIS_Y,
  KALLUR_AIRSHIP_ENGINE_LOCAL,
  KALLUR_AIRSHIP_LENGTH,
  KALLUR_AIRSHIP_RADIUS,
  KALLUR_AIRSHIP_SCALE,
} from "../content/objects/kallur/kallurAirshipObject.ts";
import type { VehicleProximitySensor } from "./vehicleFrames.ts";

export { KALLUR_AIRSHIP_ENGINE_LOCAL };

/**
 * Kallur airship — the VESSEL, declared apart from any world.
 *
 * Geometry is owned exclusively by the accepted Object Lab study
 * (`kallurAirshipObject`, a06): this module converts those canonical parts
 * into a linked vehicle cluster, adds the airship service organs every
 * buoyant ship of the map carries (the gas heart, the keel trim cars) and
 * publishes the frame numbers. A world seats it by choosing a placement —
 * the ship itself knows no island.
 */

export const KALLUR_AIRSHIP_ACCEPTED_REVISION = "airship-a07-2026-08-22";

export interface KallurAirshipPlacement {
  /** World point of the skid plane origin (canonical y = 0). */
  readonly position: SceneVector3;
  /** Yaw of the canonical +Z nose, counter-clockwise about +Y. */
  readonly yaw: number;
}

export function kallurAirshipVector(
  placement: KallurAirshipPlacement,
  local: SceneVector3,
): SceneVector3 {
  const cos = Math.cos(placement.yaw);
  const sin = Math.sin(placement.yaw);
  return [
    cos * local[0] + sin * local[2],
    local[1],
    -sin * local[0] + cos * local[2],
  ];
}

export function kallurAirshipPoint(
  placement: KallurAirshipPlacement,
  local: SceneVector3,
): SceneVector3 {
  const offset = kallurAirshipVector(placement, local);
  return [
    placement.position[0] + offset[0],
    placement.position[1] + offset[1],
    placement.position[2] + offset[2],
  ];
}

/** World nose direction of the placed ship (canonical nose is +Z). */
export function kallurAirshipNose(
  placement: KallurAirshipPlacement,
): SceneVector3 {
  return kallurAirshipVector(placement, [0, 0, 1]);
}

const S = KALLUR_AIRSHIP_SCALE;
const HALF_LENGTH = KALLUR_AIRSHIP_LENGTH / 2;

/** Volume centre of the hull of revolution — the lift centre, integrated
 * from the SAME profile the loft is built from. */
function hullVolumeCentreZ(): number {
  let volume = 0;
  let moment = 0;
  const steps = 96;
  for (let index = 0; index < steps; index += 1) {
    const a = ((index + 0.5) / steps) * KALLUR_AIRSHIP_LENGTH;
    const radius = kallurAirshipHullRadius(a);
    const slice = radius * radius;
    volume += slice;
    moment += slice * (HALF_LENGTH - a);
  }
  return volume > 0 ? moment / volume : 0;
}

/**
 * The lift point rides OVER the measured intact mass centre, not over the
 * pure volume centre (z = +0.97 by the integral below): the terminal law —
 * the gas heart is seated above the real mass so runtime trim never hides
 * an authored imbalance. Trim cars rest on this same station; offsetting
 * them forward of the heart spent half the pitch rail just holding level.
 * The a07 steel envelope and its end frames put the intact centre at the
 * same longitudinal station; trim cars are included in this fixed point.
 */
export const KALLUR_AIRSHIP_LIFT_LOCAL: SceneVector3 = [
  0,
  KALLUR_AIRSHIP_AXIS_Y,
  -0.595,
];

/** Resting intact mass centre used by both authored Kallur bases. */
export const KALLUR_AIRSHIP_REST_CENTRE_LOCAL: SceneVector3 = [
  0,
  3.065,
  -0.595,
];

const hullSkinXAt = (y: number, z: number): number => {
  const radius = kallurAirshipHullRadius(HALF_LENGTH - z);
  const dy = y - KALLUR_AIRSHIP_AXIS_Y;
  return Math.sqrt(Math.max(0.05, radius * radius - dy * dy));
};

/** Visual roll rail sits 0.28 m above the car, still inside the envelope. */
const ROLL_RAIL_Y = KALLUR_AIRSHIP_AXIS_Y - 0.34;
const ROLL_RAIL_SKIN_X = hullSkinXAt(ROLL_RAIL_Y, KALLUR_AIRSHIP_LIFT_LOCAL[2]);
/** Cylinder length along +X; ends stay 16 cm inside the skin. */
export const KALLUR_AIRSHIP_ROLL_RAIL_LENGTH = 2 * Math.max(0.4, ROLL_RAIL_SKIN_X - 0.16);
/** Car half-width 0.37 m; travel stops before the car itself exits the skin. */
export const KALLUR_AIRSHIP_ROLL_TRIM_TRAVEL = Math.max(
  0.35,
  ROLL_RAIL_SKIN_X - 0.37 - 0.1,
);
export const KALLUR_AIRSHIP_PITCH_TRIM_TRAVEL = 5;

/** Referenced so the authored balance can always be re-derived. */
export const KALLUR_AIRSHIP_VOLUME_CENTRE_Z = hullVolumeCentreZ();

/** The usable standing volume inside the gondola cabin, placement-local. */
export function isInsideKallurAirshipLocal(local: SceneVector3): boolean {
  return Math.abs(local[0]) <= 0.68 * S &&
    local[1] >= 0.6 * S && local[1] <= 1.95 * S &&
    local[2] >= -1.35 * S && local[2] <= 2.05 * S;
}

type ShipBinding = {
  readonly material: "cloth" | "steel" | "glass" | "wood";
  readonly shape: "panel" | "steelSheet" | "glassPane" | "cylinder";
  readonly colour: string;
  readonly collision: boolean;
  readonly structural: boolean;
  readonly textureProfile?: "matte-aluminium";
};

// Faroese-helicopter colour stylization, no exact livery: white envelope,
// the lighthouse's own lantern red for gondola/fins/cheatline — the ship
// and the lighthouse are one family on this island.
const BINDINGS: Readonly<Partial<Record<ObjectMaterialId, ShipBinding>>> = {
  "paint-light": {
    material: "steel", shape: "steelSheet", colour: "#eceae2",
    collision: true, structural: true, textureProfile: "matte-aluminium",
  },
  "paint-accent": {
    material: "steel", shape: "steelSheet", colour: "#8f2f2a",
    collision: true, structural: true, textureProfile: "matte-aluminium",
  },
  metal: {
    material: "steel", shape: "steelSheet", colour: "#333b40",
    collision: true, structural: false, textureProfile: "matte-aluminium",
  },
  glazing: {
    material: "glass", shape: "glassPane", colour: "#cfe0e6",
    collision: false, structural: false,
  },
};

/**
 * Euler for a Y-up primitive (cylinder, beam box) whose length must follow
 * `chord`. `orient(up, chord)` is the trap: Gram-Schmidt then throws away
 * the vertical part of the chord, so a splayed oleo becomes a short
 * horizontal stick pointing at nothing — the skid "fix" that made the
 * struts worse, and the engine stays that miss the nacelle.
 */
export function rotationAlongChord(
  chord: SceneVector3,
  placement: KallurAirshipPlacement,
): SceneVector3 {
  const length = Math.hypot(...chord) || 1;
  const along: SceneVector3 = [
    chord[0] / length, chord[1] / length, chord[2] / length,
  ];
  const hint: SceneVector3 = Math.abs(along[1]) < 0.95
    ? [0, 1, 0]
    : kallurAirshipVector(placement, [1, 0, 0]);
  const keep = hint[0] * along[0] + hint[1] * along[1] + hint[2] * along[2];
  return orient(
    [
      hint[0] - along[0] * keep,
      hint[1] - along[1] * keep,
      hint[2] - along[2] * keep,
    ],
    along,
  );
}

function orient(xDirection: SceneVector3, yDirection: SceneVector3): SceneVector3 {
  const norm = (v: SceneVector3): SceneVector3 => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const x = norm(xDirection);
  const dot = yDirection[0] * x[0] + yDirection[1] * x[1] + yDirection[2] * x[2];
  const y = norm([
    yDirection[0] - x[0] * dot,
    yDirection[1] - x[1] * dot,
    yDirection[2] - x[2] * dot,
  ]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

function meshData(part: Extract<ObjectLabPart, { kind: "mesh" }>) {
  const mins = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])));
  const maxs = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])));
  const centre = [0, 1, 2].map((axis) =>
    (mins[axis] + maxs[axis]) / 2) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.025, maxs[axis] - mins[axis])) as unknown as SceneVector3;
  const vertices = part.vertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - centre[axis]) / size[axis]) as unknown as SceneVector3);
  return { centre, size, vertices } as const;
}

/** Honest cigar envelope: segment boxes along the hull instead of one
 * bloated bbox (a long thin piece = a huge box in the compound). */
function hullContactBoxes(): { position: SceneVector3; size: SceneVector3 }[] {
  const edges = [-8.1, -6.2, -3.9, -1.2, 1.8, 4.6, 6.6, 8.1];
  const boxes: { position: SceneVector3; size: SceneVector3 }[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const from = edges[index];
    const to = edges[index + 1];
    const mid = (from + to) / 2;
    const radius = kallurAirshipHullRadius(HALF_LENGTH - mid);
    const width = Math.max(0.5, radius * 2 * 0.92);
    // Piece-local: the hull mesh bbox centre sits on the hull axis, z = 0.
    boxes.push({
      position: [0, 0, mid],
      size: [width, width, to - from + 0.06],
    });
  }
  return boxes;
}

/**
 * The canonical parts plus the service organs, as scene objects of one
 * linked group. The group id the world gives these objects decides the
 * cluster id; every mask below assumes the piece ids stay untouched.
 */
function engineActuator(id: string): CommandActuatorTag | undefined {
  const match = id.match(/^engine:(-?1):/);
  if (!match) return undefined;
  const side = Number(match[1]) as -1 | 1;
  const tag = {
    id: `kallur-airship:propulsor:${side}`,
    commandChannel: `throttle:${side === -1 ? 0 : 1}`,
  } as const;
  if (id.includes(":nacelle")) return { ...tag, required: true };
  if (id.includes(":blade:")) return tag;
  return undefined;
}

function finActuator(id: string): CommandActuatorTag | undefined {
  if (!id.startsWith("fin-")) return undefined;
  const vertical = id === "fin-top" || id === "fin-bottom";
  return {
    id: "kallur-airship:rudder",
    commandChannel: "rudder",
    contribution: vertical ? 1 : 0.35,
  };
}

export function createKallurAirship(
  placement: KallurAirshipPlacement,
  push: (object: SceneObjectDefinition) => void,
): void {
  if (kallurAirshipObject.revision !== KALLUR_AIRSHIP_ACCEPTED_REVISION) {
    throw new Error(
      `Kallur airship adapter expected ${KALLUR_AIRSHIP_ACCEPTED_REVISION}, `
      + `received ${kallurAirshipObject.revision}`,
    );
  }
  const worldPoint = (local: ObjectPoint | SceneVector3): SceneVector3 =>
    kallurAirshipPoint(placement, local as SceneVector3);

  // === The gas heart: the floating foundation inside the envelope, the
  // same law as every buoyant ship of the map. Its VISIBLE drum must stay
  // strictly inside the tapering hull (the first seating poked tan rings
  // out of the nose and tail — Igor); only the invisible contact box may
  // reach for the cigar's full span.
  const heartLength = 7.6;
  const heartRadius = 1.0;
  for (const end of [-1, 1] as const) {
    const z = KALLUR_AIRSHIP_LIFT_LOCAL[2] + (end * heartLength) / 2;
    const hull = kallurAirshipHullRadius(HALF_LENGTH - z);
    if (hull <= heartRadius + 0.04) {
      throw new Error(
        `airship heart pokes the hull at z=${z.toFixed(2)}: ${hull.toFixed(2)}`,
      );
    }
  }
  push({
    kind: "primitive",
    id: "heart",
    material: "earth",
    shape: "cylinder",
    size: [heartRadius * 2, heartLength, heartRadius * 2],
    color: "#e9dcb4",
    transform: {
      position: worldPoint([0, KALLUR_AIRSHIP_AXIS_Y, KALLUR_AIRSHIP_LIFT_LOCAL[2]]),
      rotation: orient(
        kallurAirshipVector(placement, [1, 0, 0]),
        kallurAirshipVector(placement, [0, 0, 1]),
      ),
    },
    volume: 4.5,
    contactBoxes: [{ position: [0, 0, 0], size: [2.9, 14.2, 2.9] }],
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    bearsLoad: true,
  });

  // === Keel trim rails and cars: the only pitch/roll organ a buoyant
  // ship has. Zero is the lift station so the cars do not themselves
  // author a pitch imbalance the rail then has to cancel.
  //
  // The roll rail is a cylinder along +X. Fleet-sized travel (1.7 m) made
  // it 4 m long and poked both ends out of this hull, between the engine
  // pods — a loose rod that lagged because `:trim:` also made the RAIL an
  // independent kinematic body. The rail stays inside the envelope; only
  // the car is an independent member.
  for (const [axis, localY, travel, along, carVolume] of [
    ["pitch", KALLUR_AIRSHIP_AXIS_Y - 1.05, KALLUR_AIRSHIP_PITCH_TRIM_TRAVEL, true, 0.42],
    ["roll", KALLUR_AIRSHIP_AXIS_Y - 0.62, KALLUR_AIRSHIP_ROLL_TRIM_TRAVEL, false, 0.55],
  ] as const) {
    const actuator = {
      id: `kallur-airship:trim:${axis}`,
      commandChannel: `trim:${axis}`,
      required: true,
    } as const;
    const railAxis = along
      ? kallurAirshipVector(placement, [0, 0, 1])
      : kallurAirshipVector(placement, [1, 0, 0]);
    const railLength = along
      ? travel * 2 + 0.6
      : KALLUR_AIRSHIP_ROLL_RAIL_LENGTH;
    push({
      kind: "primitive",
      id: `trim:${axis}:rail`,
      material: "steel",
      shape: "cylinder",
      size: [0.1, railLength, 0.1],
      color: "#7d8489",
      transform: {
        position: worldPoint([0, localY + 0.28, KALLUR_AIRSHIP_LIFT_LOCAL[2]]),
        rotation: orient([0, 1, 0], railAxis),
      },
      contactBoxes: [
        { position: [0, 0, 0], size: [0.16, railLength, 0.16] },
      ],
      actuator,
      bearsLoad: false,
      sideAttachmentReach: 0.4,
    });
    push({
      kind: "primitive",
      id: `trim:${axis}:car`,
      material: "steel",
      shape: "steelSheet",
      size: along ? [0.56, 0.34, 0.78] : [0.74, 0.34, 0.6],
      color: "#5f6469",
      transform: {
        position: worldPoint([0, localY, KALLUR_AIRSHIP_LIFT_LOCAL[2]]),
        rotation: [0, placement.yaw, 0],
      },
      volume: carVolume,
      contactBoxes: [
        { position: [0, 0, 0], size: along ? [0.62, 0.4, 0.84] : [0.8, 0.4, 0.66] },
      ],
      actuator,
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    });
  }

  for (const part of kallurAirshipObject.parts) {
    const bound = BINDINGS[part.material];
    if (!bound) {
      throw new Error(`Kallur airship adapter has no binding for ${part.material}`);
    }
    const id = part.id;
    const isEnvelopeFrame = part.group === "airship-frame";
    const actuator = engineActuator(id) ?? finActuator(id);
    // A nacelle is painted METAL around an engine block, not cloth: its
    // mass is what a lost propulsor costs the trim law.
    const binding: ShipBinding = id.includes(":nacelle")
      ? { ...bound, material: "steel", shape: "steelSheet" }
      : bound;
    const common = {
      textureProfile: binding.textureProfile,
      intactCollider: binding.collision,
      bearsLoad: binding.structural || isEnvelopeFrame,
      carriesAttachments: binding.structural || isEnvelopeFrame,
      ...(actuator ? { actuator } : {}),
    } as const;

    if (part.kind === "box") {
      const yaw = part.rotation?.[1] ?? 0;
      push({
        kind: "primitive",
        id,
        material: binding.material,
        shape: binding.shape,
        size: [...part.size],
        color: binding.colour,
        transform: {
          position: worldPoint(part.center),
          rotation: [
            part.rotation?.[0] ?? 0,
            yaw + placement.yaw,
            part.rotation?.[2] ?? 0,
          ],
        },
        contactBoxes: [{ position: [0, 0, 0], size: [...part.size] }],
        ...common,
      });
      continue;
    }

    if (part.kind === "mesh") {
      const mesh = meshData(part);
      const isHull = part.id === "hull-skin";
      const isTrim = part.id.startsWith("cheatline");
      push({
        kind: "primitive",
        id,
        material: binding.material,
        shape: "panel",
        size: mesh.size,
        color: binding.colour,
        transform: {
          position: worldPoint(mesh.centre),
          rotation: [0, placement.yaw, 0],
        },
        visualMesh: {
          vertices: mesh.vertices,
          indices: part.triangles.flatMap((triangle) => [...triangle]),
          doubleSided: part.doubleSided,
        },
        voxelization: { mode: "shell", thickness: 0.05, voxelSize: 0.2 },
        volume: Math.max(
          0.002,
          mesh.size[0] * mesh.size[1] * mesh.size[2] * (isHull ? 0.01 : 0.06),
        ),
        contactBoxes: isTrim
          ? undefined
          : isHull
            ? hullContactBoxes()
            : [{ position: [0, 0, 0], size: mesh.size }],
        ...common,
        intactCollider: isTrim ? false : common.intactCollider,
        bearsLoad: isTrim ? false : common.bearsLoad,
        carriesAttachments: isTrim ? false : common.carriesAttachments,
      });
      continue;
    }

    const from = worldPoint(part.from);
    const to = worldPoint(part.to);
    const chord: SceneVector3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(...chord) || 0.01;
    const size: SceneVector3 = part.kind === "cylinder"
      ? [part.radius * 2, length, part.radius * 2]
      : [part.width, length, part.depth];
    push({
      kind: "primitive",
      id,
      material: binding.material,
      shape: part.kind === "cylinder" ? "cylinder" : binding.shape,
      size,
      color: binding.colour,
      transform: {
        position: [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2,
        ],
        rotation: rotationAlongChord(chord, placement),
      },
      contactBoxes: [{ position: [0, 0, 0], size }],
      // A nacelle is not an empty cowling: the engine block inside gives
      // it the mass a lost propulsor must cost (the fleet trim law works
      // in real listed degrees, and a weightless pod lists nothing).
      volume: id.includes(":nacelle")
        ? 0.35
        : part.kind === "cylinder"
          ? Math.PI * part.radius ** 2 * length
          : part.width * part.depth * length,
      ...common,
    });
  }
}

/** Physical proximity sensors on the placed carrier. */
export function kallurAirshipProximitySensors(
  placement: KallurAirshipPlacement,
): readonly VehicleProximitySensor[] {
  const point = (local: SceneVector3): SceneVector3 =>
    kallurAirshipPoint(placement, local);
  const vector = (local: SceneVector3): SceneVector3 =>
    kallurAirshipVector(placement, local);
  const axis = KALLUR_AIRSHIP_AXIS_Y;
  return [
    { point: point([0, axis, HALF_LENGTH]), normal: vector([0, 0, 1]) },
    { point: point([0, axis, -HALF_LENGTH]), normal: vector([0, 0, -1]) },
    { point: point([0, axis + KALLUR_AIRSHIP_RADIUS, 0.5]), normal: [0, 1, 0] },
    { point: point([0, 0.02, 0.6]), normal: [0, -1, 0] },
    { point: point([0, 0.02, 2.2]), normal: [0, -1, 0] },
    { point: point([0, axis - kallurAirshipHullRadius(HALF_LENGTH + 5.4), -5.4]), normal: [0, -1, 0] },
    { point: point([KALLUR_AIRSHIP_RADIUS, axis, 0.5]), normal: vector([1, 0, 0]) },
    { point: point([-KALLUR_AIRSHIP_RADIUS, axis, 0.5]), normal: vector([-1, 0, 0]) },
    { point: point([2.1, axis, -6.3]), normal: vector([1, 0, 0]) },
    { point: point([-2.1, axis, -6.3]), normal: vector([-1, 0, 0]) },
  ];
}
