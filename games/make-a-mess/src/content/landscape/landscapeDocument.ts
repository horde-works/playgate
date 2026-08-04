export type LandscapePoint2 = readonly [x: number, z: number];
export type LandscapePoint3 = readonly [x: number, y: number, z: number];

export type LandscapeSurfaceKind = "grass" | "path" | "soil" | "stone";
export type LandscapeGroundKind = "land" | "terrace" | "bank" | "bed" | "outside";

export interface LandscapeElevationArea {
  readonly id: string;
  readonly elevation: number;
  readonly polygon: readonly LandscapePoint2[];
  /** Total horizontal distance over which the plateau becomes surrounding land. */
  readonly blendWidth: number;
}

/**
 * Levelled construction ground.
 *
 * A building is a rectangle standing on its own plot, so the ground it needs is
 * a rectangle turned with it — never a circle around its origin. A circular pad
 * sized from an abstract clearance radius cannot cover an eleven-metre plinth,
 * and it silently leaves the far corners of every long building hanging over
 * whatever the surrounding terrain happens to do.
 */
export interface LandscapeFlatPad {
  readonly id: string;
  /** Centre of the levelled rectangle, in world plan coordinates. */
  readonly center: LandscapePoint2;
  /** Rotation of the plot's own axes, matching the structure it carries. */
  readonly yaw: number;
  /** Half extents along the plot's own axes. */
  readonly halfExtents: LandscapePoint2;
  readonly elevation: number;
  /** Soft shoulder outside the exactly flat construction pad. */
  readonly shoulder: number;
}

export interface LandscapeSurfaceCorridor {
  readonly id: string;
  readonly points: readonly LandscapePoint3[];
  readonly width: number;
  readonly feather: number;
  readonly surface: "path";
  /**
   * When true, the route grade is stamped into the terrain through the
   * feathered shoulder. The surface remains a mask; no path object is made.
   */
  readonly conformsTerrainToGrade: boolean;
  /** Maximum rise/run of the earth shoulder cut or fill beside the route. */
  readonly maximumCrossSlope: number;
}

export interface LandscapeDryChannel {
  readonly id: string;
  readonly points: readonly LandscapePoint2[];
  readonly bedWidth: number;
  readonly bankWidth: number;
  readonly terraceWidth: number;
  readonly bedElevation: number;
  readonly bedSurface: "soil";
  readonly bankSurface: "soil" | "stone";
}

export interface LandscapeDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly boundary: readonly LandscapePoint2[];
  readonly baseElevation: number;
  readonly elevationAreas: readonly LandscapeElevationArea[];
  readonly flatPads: readonly LandscapeFlatPad[];
  readonly corridors: readonly LandscapeSurfaceCorridor[];
  readonly dryChannels: readonly LandscapeDryChannel[];
  /** Water is a separate system. `none` means the landscape exposes its bed. */
  readonly water: "none";
}

export interface LandscapeSample {
  readonly elevation: number;
  readonly groundKind: LandscapeGroundKind;
  readonly surface: LandscapeSurfaceKind;
  readonly pathWeight: number;
  readonly channelId: string | null;
  /** Horizontal distance to the active channel centreline. */
  readonly channelDistance: number | null;
}

export interface LandscapeSampler {
  readonly sample: (x: number, z: number) => LandscapeSample;
  readonly elevationAt: (x: number, z: number) => number;
}
