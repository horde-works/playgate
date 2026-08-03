import type {
  LandscapeDocument,
  LandscapeDryChannel,
  LandscapePoint2,
  LandscapePoint3,
  LandscapeSample,
  LandscapeSampler,
} from "./landscapeDocument.ts";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

function baseElevationAt(document: LandscapeDocument, x: number, z: number): number {
  let elevation = document.baseElevation;
  for (const area of document.elevationAreas) {
    const signedDistance = polygonSignedDistance(x, z, area.polygon);
    const weight = smootherstep((signedDistance + area.blendWidth / 2) / area.blendWidth);
    elevation += (area.elevation - elevation) * weight;
  }
  for (const pad of document.flatPads) {
    const distance = Math.hypot(x - pad.center[0], z - pad.center[1]);
    const weight = distance <= pad.radius
      ? 1
      : 1 - smootherstep((distance - pad.radius) / pad.shoulder);
    elevation += (pad.elevation - elevation) * weight;
  }
  return elevation;
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

    let elevation = baseElevationAt(document, x, z);
    let pathWeight = 0;
    for (const corridor of document.corridors) {
      const route = corridorElevation(x, z, corridor.points);
      const halfWidth = corridor.width / 2;
      const weight = route.distance <= halfWidth
        ? 1
        : 1 - smootherstep((route.distance - halfWidth) / corridor.feather);
      pathWeight = Math.max(pathWeight, weight);
      if (corridor.conformsTerrainToGrade) {
        // The visible path mask may feather in one metre, but its earth cut or
        // fill must widen when the route crosses a slope. Otherwise a cheap
        // surface mask silently recreates a vertical ribbon at its edge.
        const gradeFeather = Math.max(
          corridor.feather,
          Math.abs(route.elevation - elevation) / corridor.maximumCrossSlope,
        );
        const gradeWeight = route.distance <= halfWidth
          ? 1
          : 1 - smootherstep((route.distance - halfWidth) / gradeFeather);
        elevation += (route.elevation - elevation) * gradeWeight;
      }
    }

    const protectedByPad = document.flatPads.some((pad) =>
      Math.hypot(x - pad.center[0], z - pad.center[1]) <= pad.radius
    );
    let channelResult: ReturnType<typeof channelSample> = null;
    if (!protectedByPad) {
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
