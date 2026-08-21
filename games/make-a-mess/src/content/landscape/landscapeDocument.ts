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
  /**
   * Hard cap on how far the grade cut may reach sideways, in metres. The
   * cross-slope rule widens the cut by |Δh| / maximumCrossSlope, which is
   * road engineering at polder scale and levels whole mountains at Kallur
   * scale: a route 74 m under a crown otherwise grades a 134 m swathe. With
   * the cap the route becomes a bench cut into the slope — exactly how a
   * real mountain path sits. Absent means uncapped (the polder behaviour).
   */
  readonly maximumGradeReach?: number;
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

/**
 * Deterministic hummock field: the soft, fur-like meso-relief of turf.
 *
 * At viewing distance a grassy slope reads "furry" not because of blades but
 * because grazing light rolls over metre-scale bumps. The field is a seeded
 * value noise added to the base elevation, suppressed on paths and pads so
 * levelled and walked ground stays calm.
 */
export interface LandscapeMesoRelief {
  /** Dominant hummock wavelength in metres. Keep above twice the render pitch. */
  readonly wavelength: number;
  /** Base-octave amplitude in metres (about half the peak-to-trough relief). */
  readonly amplitude: number;
  /** Extra amplitude per unit of base-field gradient: hummocks grow on flanks. */
  readonly slopeGain: number;
  /** Hard cap on the final amplitude after slope gain. */
  readonly maximumAmplitude: number;
  readonly seed: number;
}

/**
 * Sheep-path benches striping steep grass slopes along their contours.
 * Present only where the base field is steeper than `minimumGradient`; broken
 * into stitches by along-contour noise so no stripe circles a hill unbroken.
 */
export interface LandscapeTerracettes {
  /** Base-field gradient (rise over run) below which no benches appear. */
  readonly minimumGradient: number;
  /** Vertical distance between bench crests, in metres of elevation. */
  readonly verticalSpacing: number;
  /** Bench relief amplitude in metres. */
  readonly amplitude: number;
  /** Along-contour wavelength of the phase noise that breaks the stripes. */
  readonly alongWavelength: number;
  readonly seed: number;
}

/**
 * A local dome added to the field: a swallowed boulder, the turf collar a
 * protruding boulder is bedded into, or any authored mound. The dome is part
 * of the landscape function itself, so render, collider and every consumer
 * see the same ground by construction.
 */
export interface LandscapeReliefBump {
  readonly id: string;
  readonly center: LandscapePoint2;
  readonly radius: number;
  readonly height: number;
}

/**
 * The tonal-mass octave: broad rounded swells one step ABOVE the hummocks
 * (5–8 m), grouping them into readable lit and shaded families. Billowed
 * noise (|n|): rounded tops, pinched hollows — hill-in-hill morphology.
 * Measured on Kallur: without this layer the field has a spectral gap
 * between the 2.6 m hummocks and the 15–42 m zone blends, and the middle
 * distance reads uniformly rough however rich the finer texture is.
 */
export interface LandscapeTonalMasses {
  readonly wavelength: number;
  readonly amplitude: number;
  readonly seed: number;
}

/**
 * The coastal apron: a fine-lattice strip between the LAND edge (the shore
 * polyline) and the document boundary, dropping below sea level so the
 * waterline cuts smooth 0.75 m ground everywhere — never the blocky sides
 * of deep earth cells. Arcs pick the character per coast stretch: a beach
 * ramps gently into the water, a cliff coast plunges within a few metres.
 * Unlisted segments take the cliff profile.
 */
export interface LandscapeCoastApron {
  /** The LAND edge; the document boundary must lie outside it. */
  readonly shoreline: readonly LandscapePoint2[];
  readonly arcs: readonly {
    /** Inclusive segment index range of the shoreline polyline. */
    readonly fromSegment: number;
    readonly toSegment: number;
    readonly kind: "beach" | "cliff";
  }[];
  readonly beach: { readonly width: number; readonly dropTo: number };
  readonly cliff: { readonly width: number; readonly dropTo: number };
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
  /** Optional detail layers; absent fields leave the field byte-identical. */
  readonly coastApron?: LandscapeCoastApron;
  readonly tonalMasses?: LandscapeTonalMasses;
  readonly mesoRelief?: LandscapeMesoRelief;
  readonly terracettes?: LandscapeTerracettes;
  readonly reliefBumps?: readonly LandscapeReliefBump[];
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

export interface LandscapeGradient {
  readonly elevation: number;
  readonly x: number;
  readonly z: number;
}

export interface LandscapeSampler {
  readonly sample: (x: number, z: number) => LandscapeSample;
  readonly elevationAt: (x: number, z: number) => number;
  /** Finite-difference slope. Lattice samplers read the bake, not the function. */
  readonly gradientAt: (x: number, z: number, epsilon?: number) => LandscapeGradient;
}
