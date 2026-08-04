import { northHollandStolpFarmObject } from "../../objects/dutchHouses/northHollandStolpFarmObject.ts";
import { zaanTimberMerchantHouseObject } from "../../objects/dutchHouses/zaanTimberMerchantHouseObject.ts";
import { deKatObject } from "../../objects/dutchWindmills/deKatObject.ts";
import { gekroondePoelenburgPaltrokObject } from "../../objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";
import { jongeSchaapSawmillObject } from "../../objects/dutchWindmills/jongeSchaapSawmillObject.ts";
import { oudegeinWipmolenObject } from "../../objects/dutchWindmills/oudegeinWipmolenObject.ts";
import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../../objects/dutchWindmills/objectModel.ts";

export type DutchPolderPoint2 = readonly [x: number, z: number];
export type DutchPolderPoint3 = readonly [x: number, y: number, z: number];
type Point2 = DutchPolderPoint2;
type Point3 = DutchPolderPoint3;

export type DutchPolderTerrainZone = {
  id: string;
  topY: number;
  polygon: readonly Point2[];
};

export type DutchPolderChannel = {
  id: string;
  width: number;
  points: readonly Point2[];
};

export type DutchPolderRoute = {
  id: string;
  mandatory: boolean;
  points: readonly Point3[];
};

type TerrainZone = DutchPolderTerrainZone;
type Channel = DutchPolderChannel;
type Route = DutchPolderRoute;

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const parts: ObjectLabPart[] = [];

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });

export const DUTCH_POLDER_SHORELINE: readonly Point2[] = [
  [-63, -33], [-43, -49], [-15, -52], [9, -49], [32, -51], [57, -40],
  [70, -23], [68, -2], [73, 18], [64, 38], [42, 50], [18, 55],
  [-7, 54], [-30, 57], [-53, 47], [-67, 32], [-70, 13], [-66, -6],
];

export const DUTCH_POLDER_ZONES: readonly TerrainZone[] = [
  { id: "T1-central-crown", topY: 5.2, polygon: [[-20, -26], [2, -35], [22, -26], [28, -12], [18, 5], [2, 9], [-8, 4], [-24, -9]] },
  { id: "T2-northwest-bench", topY: 2.4, polygon: [[-63, -33], [-43, -49], [-24, -44], [-20, -16], [-30, 3], [-54, 8], [-66, -6]] },
  { id: "T3-northeast-bench", topY: 2.8, polygon: [[20, -44], [48, -41], [66, -25], [58, -9], [36, -8], [15, -20]] },
  { id: "T4-east-bench", topY: 1.9, polygon: [[35, -8], [64, -16], [70, 5], [63, 20], [45, 21], [33, 10]] },
  { id: "T6-southeast-bench", topY: 1.45, polygon: [[13, 18], [45, 15], [64, 30], [52, 47], [23, 55], [8, 42]] },
  { id: "T5-south-polder", topY: 0.8, polygon: [[-58, 5], [-32, 3], [-6, 9], [25, 5], [44, 20], [37, 46], [8, 54], [-25, 53], [-52, 42], [-66, 20]] },
];

export const DUTCH_POLDER_CHANNELS: readonly Channel[] = [
  { id: "C1-main", width: 4.2, points: [[-67, 15], [-52, 10], [-38, 14], [-23, 10], [-6, 15], [10, 13], [23, 9], [39, 12], [55, 18], [68, 15]] },
  { id: "C2-southwest-outlet", width: 3.5, points: [[-30, 13], [-35, 29], [-47, 40], [-52, 48]] },
  { id: "C3-field-drain", width: 2.6, points: [[5, 14], [6, 31], [4, 47]] },
  { id: "C4-east-outlet", width: 3.8, points: [[39, 12], [48, 25], [63, 32]] },
];

/** Plan extents in an object's own axes: +Z is its front, +X its left. */
export type DutchPolderLocalRect = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};

/** Margins added to a rect, named in the same local axes. */
export type DutchPolderPlotMargins = {
  readonly front: number;
  readonly back: number;
  readonly left: number;
  readonly right: number;
};

const SEATING_BAND = 0.06;

function partBounds(part: ObjectLabPart): { readonly min: Point3; readonly max: Point3 } {
  if (part.kind === "mesh") {
    const axis = (index: 0 | 1 | 2) => part.vertices.map((vertex) => vertex[index]);
    return {
      min: [Math.min(...axis(0)), Math.min(...axis(1)), Math.min(...axis(2))],
      max: [Math.max(...axis(0)), Math.max(...axis(1)), Math.max(...axis(2))],
    };
  }
  if (part.kind === "box") {
    // A turned box is measured by its own diagonal. The support solver owns the
    // exact contact geometry; a footprint only has to enclose the part.
    const diagonal = part.rotation ? Math.hypot(...part.size) / 2 : undefined;
    const halves = part.size.map((size) => diagonal ?? size / 2);
    return {
      min: [part.center[0] - halves[0], part.center[1] - halves[1], part.center[2] - halves[2]],
      max: [part.center[0] + halves[0], part.center[1] + halves[1], part.center[2] + halves[2]],
    };
  }
  const radius = part.kind === "cylinder" ? part.radius : Math.max(part.width, part.depth) / 2;
  return {
    min: [0, 1, 2].map((axis) => Math.min(part.from[axis], part.to[axis]) - radius) as unknown as Point3,
    max: [0, 1, 2].map((axis) => Math.max(part.from[axis], part.to[axis]) + radius) as unknown as Point3,
  };
}

/**
 * Plan extents of everything the object actually rests on.
 *
 * This is the number the levelled ground has to cover, and it is read from the
 * canonical object study rather than authored twice: the Zaan house rests on an
 * eleven-metre brick plinth, so no clearance circle of three metres was ever
 * going to hold it up.
 */
export function dutchPolderGroundFootprint(model: ObjectLabModel): DutchPolderLocalRect {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const part of model.parts) {
    const bounds = partBounds(part);
    if (bounds.min[1] > SEATING_BAND) continue;
    minX = Math.min(minX, bounds.min[0]);
    maxX = Math.max(maxX, bounds.max[0]);
    minZ = Math.min(minZ, bounds.min[2]);
    maxZ = Math.max(maxZ, bounds.max[2]);
  }
  if (!Number.isFinite(minX)) {
    throw new Error(`${model.id} has no part resting on its ground plane`);
  }
  return { minX, maxX, minZ, maxZ };
}

export const dutchPolderExpandRect = (
  rect: DutchPolderLocalRect,
  margins: DutchPolderPlotMargins,
): DutchPolderLocalRect => ({
  minX: rect.minX - margins.right,
  maxX: rect.maxX + margins.left,
  minZ: rect.minZ - margins.back,
  maxZ: rect.maxZ + margins.front,
});

export interface DutchPolderBuildingPlot {
  readonly id: string;
  /** Placement id used by the scene document and the prefab library. */
  readonly objectId: string;
  readonly title: string;
  readonly model: ObjectLabModel;
  /** The canonical object's own ground centre, in world plan coordinates. */
  readonly origin: Point2;
  /** Compass bearing of the front face; map north is −Z. */
  readonly bearing: number;
  readonly elevation: number;
  /** What the object stands on, in its own axes. */
  readonly footprint: DutchPolderLocalRect;
  /** Levelled construction ground: footprint plus a working margin. */
  readonly pad: DutchPolderLocalRect;
  /** Parcel boundary. Declared once a plot is designed as a yard, not before. */
  readonly parcel?: DutchPolderLocalRect;
  /** Where the mandatory route must end. Absent while a route still ends at the origin. */
  readonly entrance?: Point3;
  /**
   * Radius the sails sweep over the ground. A circle is the true keep-out shape
   * for a mill and for nothing else: a building keeps its plot, which is why
   * the houses below declare no sweep.
   */
  readonly sweep?: number;
}

type PlotOrder = {
  readonly id: string;
  readonly objectId: string;
  readonly model: ObjectLabModel;
  readonly origin: Point2;
  readonly bearing: number;
  readonly elevation: number;
  readonly working: number;
  readonly sweep?: number;
  readonly parcel?: DutchPolderPlotMargins;
};

export const dutchPolderPlotYaw = (bearing: number) => Math.PI - bearing * Math.PI / 180;

export function dutchPolderPlotToWorld(
  plot: DutchPolderBuildingPlot,
  localX: number,
  localZ: number,
): Point2 {
  const yaw = dutchPolderPlotYaw(plot.bearing);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    plot.origin[0] + localX * cos + localZ * sin,
    plot.origin[1] - localX * sin + localZ * cos,
  ];
}

export function dutchPolderPlotToLocal(
  plot: DutchPolderBuildingPlot,
  x: number,
  z: number,
): Point2 {
  const yaw = dutchPolderPlotYaw(plot.bearing);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = x - plot.origin[0];
  const dz = z - plot.origin[1];
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/** Horizontal distance from a world point to a rect of the plot; zero inside it. */
export function dutchPolderRectDistance(
  plot: DutchPolderBuildingPlot,
  rect: DutchPolderLocalRect,
  x: number,
  z: number,
): number {
  const [localX, localZ] = dutchPolderPlotToLocal(plot, x, z);
  return Math.hypot(
    Math.max(rect.minX - localX, 0, localX - rect.maxX),
    Math.max(rect.minZ - localZ, 0, localZ - rect.maxZ),
  );
}

export const dutchPolderRectCorners = (
  plot: DutchPolderBuildingPlot,
  rect: DutchPolderLocalRect,
): readonly Point2[] => [
  dutchPolderPlotToWorld(plot, rect.minX, rect.minZ),
  dutchPolderPlotToWorld(plot, rect.maxX, rect.minZ),
  dutchPolderPlotToWorld(plot, rect.maxX, rect.maxZ),
  dutchPolderPlotToWorld(plot, rect.minX, rect.maxZ),
];

/**
 * Levelled ground may lap the soft terrace of a channel, but never its bed or
 * its bank: the bank is the shape of the waterway, and a construction pad that
 * eats it replaces a canal side with a flat lip. Everything wider than that —
 * a quay standing in the water — is built geometry, not levelled terrain.
 */
export const DUTCH_POLDER_CHANNEL_BANK_WIDTH = 2.4;
export const DUTCH_POLDER_PAD_BANK_MARGIN = 1.5;
export const DUTCH_POLDER_PAD_SHORE_MARGIN = 3.5;

const PLOT_ORDERS: readonly PlotOrder[] = [
  { id: "M1", objectId: "m1", model: deKatObject, origin: [2, -13], bearing: 168, elevation: 5.2, working: 1.8, sweep: 12 },
  { id: "M2", objectId: "m2", model: oudegeinWipmolenObject, origin: [-40, -25], bearing: 152, elevation: 2.4, working: 1.8, sweep: 13 },
  { id: "M3", objectId: "m3", model: jongeSchaapSawmillObject, origin: [36, -28], bearing: 194, elevation: 2.8, working: 1.8, sweep: 11 },
  // The paltrok stands closest to the boezem of all four mills, which is right
  // for its trade; its levelled ring therefore gets the narrowest working
  // margin of the six, so the yard never reaches into the canal bank.
  { id: "M4", objectId: "m4", model: gekroondePoelenburgPaltrokObject, origin: [50, 4], bearing: 205, elevation: 1.9, working: 1, sweep: 12 },
  // The Zaan merchant house is the first object sited under this contract. It
  // stands on the south bank of the boezem beside its own bridge: gable square
  // to the water it fronts, entrance on the lane, and a parcel deep enough that
  // the shed, the hay and the garden of a working erf can follow without moving
  // the house again. Its old site put the plinth inside the excavated bank of
  // C1, which is why a third of it hung in the air.
  { id: "H1", objectId: "h1", model: zaanTimberMerchantHouseObject, origin: [-54, 26], bearing: 341.565, elevation: 0.8, working: 1.8, parcel: { front: 1.8, back: 3.3, left: 3.3, right: 6.3 } },
  // The stolp keeps its bearing — 206° faces the arrival route, which the
  // siting brief accepts — but not its origin: the rear tail's brick plinth
  // stood 1.55 m from the C4 centreline, inside the water prism itself, and
  // hung 1.09 m over the excavated bank. Eight metres forward along its own
  // axis puts the whole farm back on the bench with its levelled werf clear of
  // the outlet, without touching the canal.
  { id: "H2", objectId: "h2", model: northHollandStolpFarmObject, origin: [27.49, 36.19], bearing: 206, elevation: 1.45, working: 1.5 },
];

export const DUTCH_POLDER_BUILDING_PLOTS: readonly DutchPolderBuildingPlot[] =
  PLOT_ORDERS.map((order) => {
    const footprint = dutchPolderGroundFootprint(order.model);
    const working = {
      front: order.working,
      back: order.working,
      left: order.working,
      right: order.working,
    };
    const plot: DutchPolderBuildingPlot = {
      id: order.id,
      objectId: order.objectId,
      title: order.model.title,
      model: order.model,
      origin: order.origin,
      bearing: order.bearing,
      elevation: order.elevation,
      footprint,
      pad: dutchPolderExpandRect(footprint, working),
      parcel: order.parcel ? dutchPolderExpandRect(footprint, order.parcel) : undefined,
      sweep: order.sweep,
    };
    if (!plot.parcel) return plot;
    // The gate sits in the middle of the parcel's front edge, and the mandatory
    // route has to end there rather than inside the building.
    const [gateX, gateZ] = dutchPolderPlotToWorld(
      plot,
      (plot.parcel.minX + plot.parcel.maxX) / 2,
      plot.parcel.maxZ,
    );
    return { ...plot, entrance: [gateX, plot.elevation, gateZ] as Point3 };
  });

export const dutchPolderPlot = (id: string): DutchPolderBuildingPlot => {
  const plot = DUTCH_POLDER_BUILDING_PLOTS.find((entry) => entry.id === id);
  if (!plot) throw new Error(`unknown polder building plot ${id}`);
  return plot;
};

/** Where a mandatory route has to deliver a visitor for this object. */
export const dutchPolderPlotArrival = (plot: DutchPolderBuildingPlot): Point3 =>
  plot.entrance ?? [plot.origin[0], plot.elevation, plot.origin[1]];

/** Radius of the smallest circle about the origin that holds the rect. */
export const dutchPolderRectRadius = (rect: DutchPolderLocalRect) => Math.max(
  Math.hypot(rect.minX, rect.minZ),
  Math.hypot(rect.maxX, rect.minZ),
  Math.hypot(rect.maxX, rect.maxZ),
  Math.hypot(rect.minX, rect.maxZ),
);

/** The ground an object holds against scattered content. */
export const dutchPolderKeepOut = (plot: DutchPolderBuildingPlot) =>
  plot.parcel ?? plot.pad;

export const DUTCH_POLDER_OBJECT_RESERVES = DUTCH_POLDER_BUILDING_PLOTS.map((plot) => ({
  id: plot.id,
  position: plot.origin,
  baseY: plot.elevation,
  // A mill reserves the circle its sails sweep; every object reserves the plot
  // it stands on. The circle is whichever of the two reaches further — the saw
  // mill's log deck runs two metres past its own sail tips.
  radius: Math.max(plot.sweep ?? 0, dutchPolderRectRadius(dutchPolderKeepOut(plot))),
}));

export const DUTCH_POLDER_BRIDGE_SEATS = [
  { id: "B1", position: [-44.339623, 12.188679] as Point2, channelId: "C1-main", bankY: 0.92 },
  { id: "B2", position: [0.030769, 14.246154] as Point2, channelId: "C1-main", bankY: 0.92 },
  { id: "B3", position: [41.082192, 12.780822] as Point2, channelId: "C1-main", bankY: 0.92 },
  { id: "B4", position: [-39.709434, 33.316981] as Point2, channelId: "C2-southwest-outlet", bankY: 0.8 },
  { id: "B5", position: [52.872263, 27.273723] as Point2, channelId: "C4-east-outlet", bankY: 1.1 },
] as const;

export const DUTCH_POLDER_BRIDGE_APPROACHES = [
  { bridgeId: "B1", ends: [[-43.323155, 0.92, 8.63104], [-45.356091, 0.92, 15.746318]] as const },
  { bridgeId: "B2", ends: [[-0.42816, 0.92, 10.574726], [0.489698, 0.92, 17.917582]] as const },
  { bridgeId: "B3", ends: [[42.381349, 0.92, 9.316404], [39.783035, 0.92, 16.24524]] as const },
  { bridgeId: "B4", ends: [[-37.209253, 0.8, 36.044451], [-42.209615, 0.8, 30.589511]] as const },
  { bridgeId: "B5", ends: [[54.436939, 1.1, 23.920845], [51.307587, 1.1, 30.626601]] as const },
] as const;

export const DUTCH_POLDER_ROUTES: readonly Route[] = [
  { id: "spawn-to-farm", mandatory: true, points: [[0, 0.8, 50], [12, 0.9, 43], [22, 1.1, 35], dutchPolderPlotArrival(dutchPolderPlot("H2"))] },
  { id: "south-spine", mandatory: true, points: [[0, 0.8, 50], [4, 0.8, 47], [6, 0.8, 31], [0.489698, 0.92, 17.917582]] },
  { id: "west-bank-spine", mandatory: true, points: [[0.489698, 0.92, 17.917582], [-12, 0.8, 18], [-30, 0.8, 16], [-45.356091, 0.92, 15.746318]] },
  // The house lane. It leaves the south landing of B1, holds 8 m off the C1
  // centreline so it keeps its own grade instead of sliding down the excavated
  // bank, and ends at the garden gate rather than inside the building. The old
  // line climbed 44 m around the back of the house to reach a front door that
  // opened onto a two-metre drop.
  { id: "west-bank-lane-to-house", mandatory: true, points: [[-45.356091, 0.92, 15.746318], [-50.5, 0.8, 19], dutchPolderPlotArrival(dutchPolderPlot("H1"))] },
  { id: "west-bridge-to-wipmolen", mandatory: true, points: [[-43.323155, 0.92, 8.63104], [-44, 1.35, 0], [-42, 1.8, -12], [-40, 2.4, -25]] },
  { id: "central-crown-switchback", mandatory: true, points: [[-0.42816, 0.92, 10.574726], [-10, 1.6, 11], [-18, 2.3, 4], [-18, 3.3, -8], [-10, 4.2, -16], [2, 5.2, -13]] },
  { id: "central-to-sawyard", mandatory: true, points: [[-0.42816, 0.92, 10.574726], [9, 1.2, 3], [18, 1.7, -7], [26, 2.3, -17], [36, 2.8, -28]] },
  { id: "main-bank-spine", mandatory: true, points: [[0.489698, 0.92, 17.917582], [10, 0.9, 19], [25, 0.9, 19], [39.783035, 0.92, 16.24524]] },
  { id: "east-bridge-to-paltrok", mandatory: true, points: [[42.381349, 0.92, 9.316404], [54, 1.1, 15], [62, 1.4, 9], [58, 1.65, 1], [50, 1.9, 4]] },
  { id: "farm-to-bridge", mandatory: true, points: [dutchPolderPlotArrival(dutchPolderPlot("H2")), [43, 1.45, 31], [51.307587, 1.1, 30.626601]] },
  { id: "bridge-to-paltrok", mandatory: true, points: [[54.436939, 1.1, 23.920845], [58, 1.45, 20], [50, 1.9, 4]] },
  { id: "southwest-field-to-bridge", mandatory: true, points: [[-30, 0.8, 16], [-35, 0.8, 27], [-42.209615, 0.8, 30.589511]] },
  { id: "southwest-bridge-to-field", mandatory: true, points: [[-37.209253, 0.8, 36.044451], [-47, 0.8, 40]] },
] as const;

const pointInPolygon = (x: number, z: number, polygon: readonly Point2[]) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [currentX, currentZ] = polygon[index];
    const [previousX, previousZ] = polygon[previous];
    const intersects = (currentZ > z) !== (previousZ > z)
      && x < (previousX - currentX) * (z - currentZ) / (previousZ - currentZ) + currentX;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const dutchPolderDistanceToSegment = (x: number, z: number, [ax, az]: Point2, [bx, bz]: Point2) => {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return Math.hypot(x - ax, z - az);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

export const dutchPolderChannelDistance = (x: number, z: number, channel: Channel) => Math.min(...channel.points.slice(1).map((end, index) =>
  dutchPolderDistanceToSegment(x, z, channel.points[index], end),
));

const zoneAt = (x: number, z: number) => DUTCH_POLDER_ZONES.find((zone) => pointInPolygon(x, z, zone.polygon))
  ?? DUTCH_POLDER_ZONES.find((zone) => zone.id === "T5-south-polder")!;

export const dutchPolderGroundTopAt = (x: number, z: number) => zoneAt(x, z).topY;
export const dutchPolderLandAt = (x: number, z: number) => pointInPolygon(x, z, DUTCH_POLDER_SHORELINE);
export const dutchPolderChannelAt = (x: number, z: number) => DUTCH_POLDER_CHANNELS.find((channel) =>
  dutchPolderChannelDistance(x, z, channel) <= channel.width / 2
);

const segmentYaw = ([ax, az]: Point2, [bx, bz]: Point2) => Math.atan2(bx - ax, bz - az);
const length2 = ([ax, az]: Point2, [bx, bz]: Point2) => Math.hypot(bx - ax, bz - az);

// Coarse 4 m interiors are deliberately cut wider than the mathematical water prism;
// exact 2 m banks come only during the later compiled-terrain pass.
const CELL_PITCH = 4;
const CELL_HALF_DIAGONAL = Math.hypot(CELL_PITCH / 2, CELL_PITCH / 2);
for (let x = -68; x <= 72; x += CELL_PITCH) {
  for (let z = -52; z <= 56; z += CELL_PITCH) {
    if (!dutchPolderLandAt(x, z)) continue;
    const channel = DUTCH_POLDER_CHANNELS.find((entry) => dutchPolderChannelDistance(x, z, entry) <= entry.width / 2 + CELL_HALF_DIAGONAL);
    if (channel) continue;
    const zone = zoneAt(x, z);
    const top = zone.topY;
    const baseBottomY = -3.4;
    addBox(`terrain-base:${zone.id}:${x}:${z}`, "terrain-base", "earth", point(x, (top + baseBottomY) / 2, z), point(CELL_PITCH, top - baseBottomY, CELL_PITCH));
    const material: ObjectMaterialId = zone.id === "T1-central-crown"
      ? "grass-crown"
      : zone.id === "T5-south-polder"
        ? "grass"
        : "grass-bench";
    addBox(`terrain-surface:${zone.id}:${x}:${z}`, "terrain-surface", material, point(x, top + 0.055, z), point(CELL_PITCH, 0.11, CELL_PITCH));
  }
}

// The exact polyline owns the floating-island skirt even while coarse cells own the plate interiors.
for (const [index, end] of DUTCH_POLDER_SHORELINE.entries()) {
  const start = DUTCH_POLDER_SHORELINE[(index + DUTCH_POLDER_SHORELINE.length - 1) % DUTCH_POLDER_SHORELINE.length];
  const startY = dutchPolderGroundTopAt(...start);
  const endY = dutchPolderGroundTopAt(...end);
  addMesh(`shore-skirt:${index}`, "shore-skirt", "earth", [
    point(start[0], startY, start[1]), point(end[0], endY, end[1]),
    point(end[0], -15, end[1]), point(start[0], -15, start[1]),
  ], [[0, 1, 2], [0, 2, 3]], true);
}

for (const channel of DUTCH_POLDER_CHANNELS) {
  for (let index = 1; index < channel.points.length; index += 1) {
    const start = channel.points[index - 1];
    const end = channel.points[index];
    const length = length2(start, end);
    addBox(`channel-bed:${channel.id}:${index - 1}`, "channel-bed", "water-reserve", point((start[0] + end[0]) / 2, 0.02, (start[1] + end[1]) / 2), point(channel.width, 0.12, length), point(0, segmentYaw(start, end), 0));
  }
}

const addRouteRibbon = (id: string, from: Point3, to: Point3) => {
  const [fromX, fromY, fromZ] = from;
  const [toX, toY, toZ] = to;
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz);
  const normalX = -dz / length;
  const normalZ = dx / length;
  const halfWidth = 1.1;
  const vertices = (yOffset: number): ObjectPoint[] => [
    point(fromX + normalX * halfWidth, fromY + yOffset, fromZ + normalZ * halfWidth),
    point(fromX - normalX * halfWidth, fromY + yOffset, fromZ - normalZ * halfWidth),
    point(toX - normalX * halfWidth, toY + yOffset, toZ - normalZ * halfWidth),
    point(toX + normalX * halfWidth, toY + yOffset, toZ + normalZ * halfWidth),
  ];
  // A pair of sloped ribbons makes every vertical transition visible as a routeable
  // earth ramp, rather than pretending that a horizontal path can bridge a height step.
  addMesh(`route-ramp:${id}`, "terrain-transition", "earth", vertices(0.035), [[0, 1, 2], [0, 2, 3]], true);
  addMesh(`route:${id}`, "routes", "path", vertices(0.16), [[0, 1, 2], [0, 2, 3]], true);
};

for (const route of DUTCH_POLDER_ROUTES) {
  for (let index = 1; index < route.points.length; index += 1) {
    addRouteRibbon(`${route.id}:${index - 1}`, route.points[index - 1], route.points[index]);
  }
}

const tangentAtBridge = (position: Point2, channel: Channel) => {
  let best: { distance: number; from: Point2; to: Point2 } | undefined;
  for (let index = 1; index < channel.points.length; index += 1) {
    const from = channel.points[index - 1];
    const to = channel.points[index];
    const distance = dutchPolderDistanceToSegment(position[0], position[1], from, to);
    if (!best || distance < best.distance) best = { distance, from, to };
  }
  return best!;
};

for (const bridge of DUTCH_POLDER_BRIDGE_SEATS) {
  const channel = DUTCH_POLDER_CHANNELS.find((entry) => entry.id === bridge.channelId)!;
  const tangent = tangentAtBridge(bridge.position, channel);
  const dx = tangent.to[0] - tangent.from[0];
  const dz = tangent.to[1] - tangent.from[1];
  const length = Math.hypot(dx, dz);
  const normalX = -dz / length;
  const normalZ = dx / length;
  const yaw = Math.atan2(normalX, normalZ);
  const offset = channel.width / 2 + 1.45;
  for (const side of [-1, 1]) {
    addBox(`bridge-seat:${bridge.id}:${side}`, "bridge-seats", "bridge-seat", point(bridge.position[0] + normalX * side * offset, bridge.bankY, bridge.position[1] + normalZ * side * offset), point(3.1, 0.24, 4.4), point(0, yaw, 0));
  }
  addBeam(`bridge-axis:${bridge.id}`, "bridge-axis", "reserve", point(bridge.position[0] - normalX * (channel.width / 2 + 0.2), bridge.bankY + 0.14, bridge.position[1] - normalZ * (channel.width / 2 + 0.2)), point(bridge.position[0] + normalX * (channel.width / 2 + 0.2), bridge.bankY + 0.14, bridge.position[1] + normalZ * (channel.width / 2 + 0.2)), 0.16, 0.08);
}

for (const reserve of DUTCH_POLDER_OBJECT_RESERVES) {
  const [x, z] = reserve.position;
  const y = reserve.baseY + 0.16;
  addBox(`object-origin:${reserve.id}`, "object-origins", "reserve", point(x, y, z), point(1.2, 0.32, 1.2));
  const ringSegments = 32;
  for (let index = 0; index < ringSegments; index += 1) {
    const angleA = index / ringSegments * Math.PI * 2;
    const angleB = (index + 1) / ringSegments * Math.PI * 2;
    addBeam(`object-reserve:${reserve.id}:${index}`, "object-reserves", "reserve", point(x + Math.cos(angleA) * reserve.radius, y, z + Math.sin(angleA) * reserve.radius), point(x + Math.cos(angleB) * reserve.radius, y, z + Math.sin(angleB) * reserve.radius), 0.1, 0.06);
  }
}

// Levelled ground and parcel boundaries are part of the spatial contract, so
// the lab draws them: a pad that does not cover its own building is visible
// here long before the building hangs in a screenshot.
for (const plot of DUTCH_POLDER_BUILDING_PLOTS) {
  for (const [name, rect, width] of [
    ["pad", plot.pad, 0.14],
    ...(plot.parcel ? [["parcel", plot.parcel, 0.1] as const] : []),
  ] as const) {
    const corners = dutchPolderRectCorners(plot, rect);
    for (const [index, from] of corners.entries()) {
      const to = corners[(index + 1) % corners.length];
      addBeam(
        `plot-${name}:${plot.id}:${index}`,
        `building-${name}s`,
        "reserve",
        point(from[0], plot.elevation + 0.1, from[1]),
        point(to[0], plot.elevation + 0.1, to[1]),
        width,
        width * 0.6,
      );
    }
  }
  const arrival = dutchPolderPlotArrival(plot);
  addBox(
    `plot-arrival:${plot.id}`,
    "building-arrivals",
    "reserve",
    point(arrival[0], arrival[1] + 0.2, arrival[2]),
    point(0.9, 0.4, 0.9),
  );
}

export const dutchPolderTerrainGraybox: ObjectLabModel = {
  id: "dutch-polder-terrain-graybox",
  revision: "terrain-a2-2026-08-02",
  title: "Dutch polder — terrain, water reserves and object clearances",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "island-centroid" },
  sourceNotes: [
    "The 18-point shoreline, six plate datums, channel centrelines, bridge seats and placement reserves come from the accepted Dutch polder spatial contract.",
    "Ground interiors use only 4 m cells at this stage; water reserves are cut wider than their final prism, and later 2 m refinement is reserved for banks, foundations and bridge seats.",
    "Accepted buildings and mills remain represented only by their true clearance reserves until the next scene-compilation milestone.",
  ],
  dimensions: {
    shorelineWidth: 143,
    shorelineDepth: 109,
    topArea: 13058,
    waterDatum: 0,
    channelBedY: -1.4,
    cellPitch: CELL_PITCH,
    objectReserveCount: DUTCH_POLDER_OBJECT_RESERVES.length,
  },
  labMetrics: [
    { label: "ISLAND WIDTH", value: 143, decimals: 0, signed: false },
    { label: "ISLAND DEPTH", value: 109, decimals: 0, signed: false },
    { label: "PLATES", value: 6, decimals: 0, signed: false, unit: "" },
    { label: "WATER DATUM", value: 0, decimals: 2 },
  ],
  anchors: {
    spawn: point(0, 0.8, 50),
    centralCrown: point(2, 5.2, -13),
    mainBridge: point(0, 0.92, 14),
    farmShelf: point(31, 1.45, 29),
  },
  motionConstraints: { windSimulation: false, waterSimulation: false, staticGraybox: true },
  labEnvironment: { floorRadius: 118, gridSize: 180, gridDivisions: 90, fogNear: 170, fogFar: 250, floorY: -15.05 },
  parts,
  views: [
    { id: "plan", label: "Plan · six plates, channels and true reserves", projection: "orthographic", position: point(0, 150, 0), target: point(0, 0, 2), orthoHeight: 164 },
    { id: "south-approach", label: "South approach · low polder toward displaced crown", projection: "perspective", position: point(0, 46, 112), target: point(0, 2.0, 2), fov: 43 },
    { id: "northwest", label: "Northwest · separate domestic and central plates", projection: "perspective", position: point(-106, 55, -84), target: point(-3, 2.1, 1), fov: 45 },
    { id: "east", label: "East · production shelf, fork and farm bench", projection: "perspective", position: point(112, 47, 26), target: point(8, 1.8, 3), fov: 45 },
    { id: "hydrology", label: "Hydrology cutaway · channel bed and bridge seats", projection: "perspective", position: point(0, 108, 48), target: point(0, -0.4, 10), fov: 40, hiddenGroups: ["terrain-base", "terrain-surface", "routes", "object-reserves", "object-origins"] },
    { id: "silhouette", label: "Silhouette · non-radial terrain mass", projection: "orthographic", position: point(-105, 66, 94), target: point(0, 2.0, 3), orthoHeight: 152 },
  ],
};
