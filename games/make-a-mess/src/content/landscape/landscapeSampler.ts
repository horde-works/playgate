import type {
  LandscapeDocument,
  LandscapeDryChannel,
  LandscapeFlatPad,
  LandscapeMesoRelief,
  LandscapePoint2,
  LandscapePoint3,
  LandscapeSample,
  LandscapeSampler,
  LandscapeTerracettes,
} from "./landscapeDocument.ts";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hashLattice(ix: number, iz: number, seed: number): number {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Smoothly interpolated deterministic value noise in [-1, 1]. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smootherstep(x - ix);
  const fz = smootherstep(z - iz);
  const a = hashLattice(ix, iz, seed);
  const b = hashLattice(ix + 1, iz, seed);
  const c = hashLattice(ix, iz + 1, seed);
  const d = hashLattice(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

function mesoReliefOffset(
  meso: LandscapeMesoRelief,
  x: number,
  z: number,
  gradient: number,
): number {
  const primary = valueNoise(x / meso.wavelength, z / meso.wavelength, meso.seed);
  const secondary = valueNoise(
    x / (meso.wavelength * 0.53),
    z / (meso.wavelength * 0.53),
    meso.seed + 17,
  );
  const amplitude = Math.min(
    meso.maximumAmplitude,
    meso.amplitude + gradient * meso.slopeGain,
  );
  return (primary + secondary * 0.45) * amplitude;
}

function terracetteOffset(
  terracettes: LandscapeTerracettes,
  x: number,
  z: number,
  elevation: number,
  gradientX: number,
  gradientZ: number,
): number {
  const gradient = Math.hypot(gradientX, gradientZ);
  if (gradient <= terracettes.minimumGradient) return 0;
  // Fade the benches in over the same gradient span again, so the flat-to-steep
  // border never shows a switched-on line of stripes.
  const gate = smootherstep(
    (gradient - terracettes.minimumGradient) / terracettes.minimumGradient,
  );
  // Along-contour coordinate: distance measured perpendicular to the gradient.
  const along = (-gradientZ * x + gradientX * z) / gradient;
  const phaseJitter = valueNoise(
    along / terracettes.alongWavelength,
    elevation / (terracettes.verticalSpacing * 2.6),
    terracettes.seed,
  );
  const stitch = 0.5 + 0.5 * valueNoise(
    along / (terracettes.alongWavelength * 2.2),
    elevation / (terracettes.verticalSpacing * 4.4),
    terracettes.seed + 31,
  );
  const phase = (elevation / terracettes.verticalSpacing) * Math.PI * 2;
  return Math.sin(phase + phaseJitter * 2.4) *
    terracettes.amplitude * gate * stitch;
}

function smootherstep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function pointInPolygon(
  x: number,
  z: number,
  polygon: readonly LandscapePoint2[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index];
    const [bx, bz] = polygon[previous];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

interface SegmentProjection {
  readonly distance: number;
  readonly t: number;
}

function projectToSegment(
  x: number,
  z: number,
  [ax, az]: LandscapePoint2,
  [bx, bz]: LandscapePoint2,
): SegmentProjection {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared < 1e-9
    ? 0
    : clamp01(((x - ax) * dx + (z - az) * dz) / lengthSquared);
  return {
    distance: Math.hypot(x - (ax + dx * t), z - (az + dz * t)),
    t,
  };
}

function polylineProjection(
  x: number,
  z: number,
  points: readonly LandscapePoint2[],
): { readonly distance: number; readonly segment: number; readonly t: number } {
  let best = { distance: Number.POSITIVE_INFINITY, segment: 0, t: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const projected = projectToSegment(x, z, points[index - 1], points[index]);
    if (projected.distance < best.distance) {
      best = { distance: projected.distance, segment: index - 1, t: projected.t };
    }
  }
  return best;
}

function polygonSignedDistance(
  x: number,
  z: number,
  polygon: readonly LandscapePoint2[],
): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    distance = Math.min(distance, projectToSegment(x, z, polygon[index], polygon[next]).distance);
  }
  return pointInPolygon(x, z, polygon) ? distance : -distance;
}

/**
 * Distance from a point to the pad rectangle, measured in the pad's own axes.
 * Zero anywhere on the levelled ground itself.
 */
export function flatPadDistance(pad: LandscapeFlatPad, x: number, z: number): number {
  const cos = Math.cos(pad.yaw);
  const sin = Math.sin(pad.yaw);
  const dx = x - pad.center[0];
  const dz = z - pad.center[1];
  // Inverse of the scene's Y rotation: world offsets back into plot axes.
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.hypot(
    Math.max(0, Math.abs(localX) - pad.halfExtents[0]),
    Math.max(0, Math.abs(localZ) - pad.halfExtents[1]),
  );
}

function baseElevationAt(
  document: LandscapeDocument,
  x: number,
  z: number,
): { readonly elevation: number; readonly padWeight: number } {
  let elevation = document.baseElevation;
  for (const area of document.elevationAreas) {
    const signedDistance = polygonSignedDistance(x, z, area.polygon);
    const weight = smootherstep((signedDistance + area.blendWidth / 2) / area.blendWidth);
    elevation += (area.elevation - elevation) * weight;
  }
  let padWeight = 0;
  for (const pad of document.flatPads) {
    const distance = flatPadDistance(pad, x, z);
    const weight = distance <= 0 ? 1 : 1 - smootherstep(distance / pad.shoulder);
    elevation += (pad.elevation - elevation) * weight;
    padWeight = Math.max(padWeight, weight);
  }
  return { elevation, padWeight };
}

function corridorElevation(
  x: number,
  z: number,
  points: readonly LandscapePoint3[],
): { readonly distance: number; readonly elevation: number } {
  const plan = points.map(([px, , pz]) => [px, pz] as const);
  const projection = polylineProjection(x, z, plan);
  const from = points[projection.segment];
  const to = points[projection.segment + 1];
  return {
    distance: projection.distance,
    elevation: from[1] + (to[1] - from[1]) * projection.t,
  };
}

function channelSample(
  channel: LandscapeDryChannel,
  distance: number,
  surroundingElevation: number,
): Pick<LandscapeSample, "elevation" | "groundKind" | "surface" | "channelId" | "channelDistance"> | null {
  const bedHalf = channel.bedWidth / 2;
  if (distance <= bedHalf) {
    return {
      elevation: channel.bedElevation,
      groundKind: "bed",
      surface: channel.bedSurface,
      channelId: channel.id,
      channelDistance: distance,
    };
  }
  const bankEnd = bedHalf + channel.bankWidth;
  if (distance <= bankEnd) {
    const amount = smootherstep((distance - bedHalf) / channel.bankWidth);
    return {
      elevation: channel.bedElevation + (surroundingElevation - channel.bedElevation) * amount * 0.72,
      groundKind: "bank",
      surface: channel.bankSurface,
      channelId: channel.id,
      channelDistance: distance,
    };
  }
  const terraceEnd = bankEnd + channel.terraceWidth;
  if (distance <= terraceEnd) {
    const bankTop = channel.bedElevation + (surroundingElevation - channel.bedElevation) * 0.72;
    const amount = smootherstep((distance - bankEnd) / channel.terraceWidth);
    return {
      elevation: bankTop + (surroundingElevation - bankTop) * amount,
      groundKind: "terrace",
      surface: "grass",
      channelId: channel.id,
      channelDistance: distance,
    };
  }
  return null;
}

export function createLandscapeSampler(document: LandscapeDocument): LandscapeSampler {
  if (document.schemaVersion !== 1) {
    throw new Error(`Unsupported landscape schema ${String(document.schemaVersion)}`);
  }

  const reliefBumps = document.reliefBumps ?? [];
  const hasDetail = document.mesoRelief !== undefined ||
    document.terracettes !== undefined ||
    reliefBumps.length > 0;
  const needsGradient = document.terracettes !== undefined ||
    (document.mesoRelief !== undefined && document.mesoRelief.slopeGain > 0);

  const sample = (x: number, z: number): LandscapeSample => {
    if (!pointInPolygon(x, z, document.boundary)) {
      return {
        elevation: document.baseElevation,
        groundKind: "outside",
        surface: "soil",
        pathWeight: 0,
        channelId: null,
        channelDistance: null,
      };
    }

    // Levelled ground is levelled. A route may paint its surface across a yard,
    // but it may not re-cut the ground the yard was levelled for: a path that
    // ends inside a building grades a groove under the plinth and hangs the
    // corner of it in the air. The pad's own shoulder is what lets the ramp
    // rise to meet the yard — cutting the grade off at the pad edge instead
    // would leave a wall there, and an unsupported turf cell on top of it.
    const base = baseElevationAt(document, x, z);
    let elevation = base.elevation;
    let pathWeight = 0;
    const onLevelledGround = document.flatPads.some((pad) => flatPadDistance(pad, x, z) <= 0);
    for (const corridor of document.corridors) {
      const route = corridorElevation(x, z, corridor.points);
      const halfWidth = corridor.width / 2;
      const weight = route.distance <= halfWidth
        ? 1
        : 1 - smootherstep((route.distance - halfWidth) / corridor.feather);
      pathWeight = Math.max(pathWeight, weight);
      if (corridor.conformsTerrainToGrade && base.padWeight < 1) {
        // The visible path mask may feather in one metre, but its earth cut or
        // fill must widen when the route crosses a slope. Otherwise a cheap
        // surface mask silently recreates a vertical ribbon at its edge.
        const gradeFeather = Math.min(
          corridor.maximumGradeReach ?? Number.POSITIVE_INFINITY,
          Math.max(
            corridor.feather,
            Math.abs(route.elevation - elevation) / corridor.maximumCrossSlope,
          ),
        );
        const gradeWeight = route.distance <= halfWidth
          ? 1
          : 1 - smootherstep((route.distance - halfWidth) / gradeFeather);
        elevation += (route.elevation - elevation) * gradeWeight * (1 - base.padWeight);
      }
    }

    let channelResult: ReturnType<typeof channelSample> = null;
    if (!onLevelledGround) {
      for (const channel of document.dryChannels) {
        const distance = polylineProjection(x, z, channel.points).distance;
        const candidate = channelSample(channel, distance, elevation);
        if (candidate && (!channelResult || candidate.elevation < channelResult.elevation)) {
          channelResult = candidate;
        }
      }
    }
    if (channelResult) {
      return {
        ...channelResult,
        // A bridge or ford is a separate authored system. A path mask never
        // paints across an exposed channel cross-section.
        pathWeight: 0,
      };
    }

    if (hasDetail) {
      // Paths and levelled pads stay calm: walked and built ground is where
      // hummocks and benches are trodden flat in the reference photography.
      const calm = (1 - pathWeight) * (1 - base.padWeight);
      let gradientX = 0;
      let gradientZ = 0;
      if (needsGradient) {
        const epsilon = 1.5;
        gradientX = (
          baseElevationAt(document, x + epsilon, z).elevation -
          baseElevationAt(document, x - epsilon, z).elevation
        ) / (2 * epsilon);
        gradientZ = (
          baseElevationAt(document, x, z + epsilon).elevation -
          baseElevationAt(document, x, z - epsilon).elevation
        ) / (2 * epsilon);
      }
      if (document.mesoRelief) {
        elevation += mesoReliefOffset(
          document.mesoRelief,
          x,
          z,
          Math.hypot(gradientX, gradientZ),
        ) * calm;
      }
      if (document.terracettes) {
        elevation += terracetteOffset(
          document.terracettes,
          x,
          z,
          base.elevation,
          gradientX,
          gradientZ,
        ) * calm;
      }
      for (const bump of reliefBumps) {
        const distance = Math.hypot(x - bump.center[0], z - bump.center[1]);
        if (distance >= bump.radius) continue;
        elevation += bump.height *
          smootherstep(1 - distance / bump.radius) * (1 - base.padWeight);
      }
    }

    return {
      elevation,
      groundKind: "land",
      surface: pathWeight > 0 ? "path" : "grass",
      pathWeight,
      channelId: null,
      channelDistance: null,
    };
  };

  return {
    sample,
    elevationAt: (x, z) => sample(x, z).elevation,
  };
}
