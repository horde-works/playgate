/**
 * Faceted-solid authoring helpers.
 *
 * The object model renders a mesh part with `computeVertexNormals()` whenever
 * the part carries no explicit normals, so any surface built from shared
 * vertices is smooth-shaded. A machine whose identity lives in hard chines,
 * chamfers and creases therefore cannot be expressed by a shared-vertex loft:
 * every authored crease is averaged away.
 *
 * These builders emit **facets** instead. A facet is one flat polygon that owns
 * its vertices exclusively; adjacent facets never share them. Flat shading and
 * every authored crease then survive into both the Object Lab and the world
 * renderer without a single explicit normal.
 *
 * The plan-space triangulator handles simple polygons with holes, which is what
 * a load-bearing plate with rotor wells actually is. The previous helper could
 * only fan-triangulate a convex outline.
 */

import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";

/** Plan-space point. X runs across the craft, Z along it, Y is up. */
export type PlanPoint = { readonly x: number; readonly z: number };

/** One flat polygon that owns its vertices. Order is front-facing. */
export type Facet = { readonly points: readonly ObjectPoint[]; readonly tag: string };

export type PlanRing = readonly PlanPoint[];

const EPSILON = 1e-9;

const plan = (x: number, z: number): PlanPoint => ({ x, z });

const at = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

/**
 * Signed plan area. Positive means counter-clockwise when X points right and Z
 * points up in the plan view, which is the orientation an outer boundary uses.
 */
export function planArea(ring: PlanRing): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    total += current.x * next.z - next.x * current.z;
  }
  return total / 2;
}

/** Returns the ring with the requested winding: +1 counter-clockwise, -1 clockwise. */
export function orientRing(ring: PlanRing, sign: 1 | -1): PlanPoint[] {
  const area = planArea(ring);
  const copy = ring.map((point) => plan(point.x, point.z));
  return Math.sign(area) === sign ? copy : copy.reverse();
}

/**
 * Moves every vertex toward the ring's left-hand side by `distance`, mitred at
 * the corners. For a counter-clockwise outer boundary and a clockwise hole this
 * is the same direction: into the material. That is what a countersunk chamfer
 * needs on both an outer edge and a well.
 */
export function insetRing(ring: PlanRing, distance: number): PlanPoint[] {
  const count = ring.length;
  const normals: PlanPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % count];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.hypot(dx, dz) || 1;
    normals.push(plan(-dz / length, dx / length));
  }
  return ring.map((point, index) => {
    const previous = normals[(index - 1 + count) % count];
    const next = normals[index];
    const bx = previous.x + next.x;
    const bz = previous.z + next.z;
    const length = Math.hypot(bx, bz);
    if (length < 1e-6) return plan(point.x + next.x * distance, point.z + next.z * distance);
    const unitX = bx / length;
    const unitZ = bz / length;
    const projection = unitX * next.x + unitZ * next.z;
    const scale = distance / Math.max(0.34, projection);
    return plan(point.x + unitX * scale, point.z + unitZ * scale);
  });
}

/** Counter-clockwise circle in plan. */
export function circleRing(
  centre: PlanPoint,
  radius: number,
  segments: number,
  phase = 0,
): PlanPoint[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = phase + (index / segments) * Math.PI * 2;
    return plan(centre.x + Math.cos(angle) * radius, centre.z + Math.sin(angle) * radius);
  });
}

/**
 * Outline of the union of two overlapping circles. Two ducts packed close
 * enough that their walls intersect do not leave a web between them: the
 * structure has to pass around the pair, and the plate needs one figure-eight
 * well rather than two circles that overlap into a broken polygon.
 */
export function mergedCircleRing(
  first: { readonly centre: PlanPoint; readonly radius: number },
  second: { readonly centre: PlanPoint; readonly radius: number },
  segments: number,
): PlanPoint[] {
  const dx = second.centre.x - first.centre.x;
  const dz = second.centre.z - first.centre.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= first.radius + second.radius || distance <= Math.abs(first.radius - second.radius)) {
    throw new Error("mergedCircleRing needs two properly overlapping circles");
  }
  const a = (distance ** 2 + first.radius ** 2 - second.radius ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - a ** 2));
  const midX = first.centre.x + (dx / distance) * a;
  const midZ = first.centre.z + (dz / distance) * a;
  const crossings: PlanPoint[] = [
    plan(midX + (-dz / distance) * height, midZ + (dx / distance) * height),
    plan(midX - (-dz / distance) * height, midZ - (dx / distance) * height),
  ];
  const angleOf = (centre: PlanPoint, point: PlanPoint) =>
    Math.atan2(point.z - centre.z, point.x - centre.x);
  const arc = (
    centre: PlanPoint,
    radius: number,
    fromAngle: number,
    toAngle: number,
  ): PlanPoint[] => {
    let sweep = toAngle - fromAngle;
    while (sweep <= 0) sweep += Math.PI * 2;
    const steps = Math.max(2, Math.round((sweep / (Math.PI * 2)) * segments));
    return Array.from({ length: steps }, (_, index) => {
      const angle = fromAngle + (sweep * index) / steps;
      return plan(centre.x + Math.cos(angle) * radius, centre.z + Math.sin(angle) * radius);
    });
  };
  // Walk the first circle from crossing 0 back to crossing 1 the long way round,
  // then hand over to the second circle. Both arcs stay outside the other disc.
  const firstArc = arc(
    first.centre,
    first.radius,
    angleOf(first.centre, crossings[0]),
    angleOf(first.centre, crossings[1]),
  );
  const secondArc = arc(
    second.centre,
    second.radius,
    angleOf(second.centre, crossings[1]),
    angleOf(second.centre, crossings[0]),
  );
  const outside = (point: PlanPoint) =>
    Math.hypot(point.x - first.centre.x, point.z - first.centre.z) > first.radius - 1e-6;
  const merged = [...firstArc, ...secondArc.filter(outside)];
  return orientRing(merged, 1);
}

type IndexedPoint = PlanPoint & { readonly source: number };

function rightmostIndex(ring: PlanRing): number {
  let best = 0;
  for (let index = 1; index < ring.length; index += 1) {
    if (ring[index].x > ring[best].x) best = index;
  }
  return best;
}

function pointInTriangle(
  point: PlanPoint,
  a: PlanPoint,
  b: PlanPoint,
  c: PlanPoint,
  tolerance: number,
): boolean {
  const cross = (p: PlanPoint, q: PlanPoint, r: PlanPoint) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const first = cross(a, b, point);
  const second = cross(b, c, point);
  const third = cross(c, a, point);
  return first >= tolerance && second >= tolerance && third >= tolerance;
}

const samePoint = (a: PlanPoint, b: PlanPoint) =>
  Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.z - b.z) < 1e-7;

const sideOf = (from: PlanPoint, to: PlanPoint, probe: PlanPoint) =>
  (to.x - from.x) * (probe.z - from.z) - (to.z - from.z) * (probe.x - from.x);

/** True only when the two segments cross in their interiors. */
function segmentsCross(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  const first = Math.sign(sideOf(a, b, c));
  const second = Math.sign(sideOf(a, b, d));
  const third = Math.sign(sideOf(c, d, a));
  const fourth = Math.sign(sideOf(c, d, b));
  return first !== 0 && second !== 0 && third !== 0 && fourth !== 0
    && first !== second && third !== fourth;
}

function pointInRing(probe: PlanPoint, ring: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const before = ring[previous];
    if ((current.z > probe.z) !== (before.z > probe.z)) {
      const crossing = ((before.x - current.x) * (probe.z - current.z)) / (before.z - current.z) + current.x;
      if (probe.x < crossing) inside = !inside;
    }
  }
  return inside;
}

/**
 * Splices one clockwise hole into a counter-clockwise boundary.
 *
 * The bridge runs from the hole's rightmost vertex to the boundary vertex that
 * is actually visible from it — proven by testing the candidate segment against
 * every boundary edge rather than by the usual single ray cast. With eight
 * wells and slots in one plate, the ray-cast shortcut picks bridges that cross
 * a hole spliced earlier and the triangulation then deadlocks.
 */
function spliceHole(boundary: IndexedPoint[], hole: IndexedPoint[]): IndexedPoint[] {
  const candidates: { hole: number; boundary: number; distance: number }[] = [];
  for (let holeIndex = 0; holeIndex < hole.length; holeIndex += 1) {
    for (let boundaryIndex = 0; boundaryIndex < boundary.length; boundaryIndex += 1) {
      candidates.push({
        hole: holeIndex,
        boundary: boundaryIndex,
        distance: (hole[holeIndex].x - boundary[boundaryIndex].x) ** 2
          + (hole[holeIndex].z - boundary[boundaryIndex].z) ** 2,
      });
    }
  }
  candidates.sort((first, second) => first.distance - second.distance);

  const visible = (from: PlanPoint, to: PlanPoint): boolean => {
    const midpoint = plan((from.x + to.x) / 2, (from.z + to.z) / 2);
    if (!pointInRing(midpoint, boundary)) return false;
    if (pointInRing(midpoint, hole)) return false;
    for (let edge = 0; edge < boundary.length; edge += 1) {
      if (segmentsCross(from, to, boundary[edge], boundary[(edge + 1) % boundary.length])) return false;
    }
    for (let edge = 0; edge < hole.length; edge += 1) {
      if (segmentsCross(from, to, hole[edge], hole[(edge + 1) % hole.length])) return false;
    }
    return true;
  };

  const chosen = candidates.find((candidate) =>
    visible(hole[candidate.hole], boundary[candidate.boundary]));
  if (!chosen) throw new Error("hole bridging found no visible boundary vertex");
  const rotatedHole = [...hole.slice(chosen.hole), ...hole.slice(0, chosen.hole)];
  return [
    ...boundary.slice(0, chosen.boundary + 1),
    ...rotatedHole,
    rotatedHole[0],
    boundary[chosen.boundary],
    ...boundary.slice(chosen.boundary + 1),
  ];
}

/**
 * Is the segment between two ring vertices a usable diagonal: strictly inside
 * the ring and crossing none of its edges?
 */
function isDiagonal(
  polygon: readonly IndexedPoint[],
  ring: readonly number[],
  first: number,
  second: number,
): boolean {
  const from = polygon[ring[first]];
  const to = polygon[ring[second]];
  if (samePoint(from, to)) return false;
  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    if (index === first || index === second || next === first || next === second) continue;
    if (segmentsCross(from, to, polygon[ring[index]], polygon[ring[next]])) return false;
  }
  const midpoint = plan((from.x + to.x) / 2, (from.z + to.z) / 2);
  return pointInRing(midpoint, ring.map((index) => polygon[index]));
}

/**
 * Ear-clips one closed ring, splitting it on a diagonal when no ear is left.
 *
 * Bridged holes make the boundary touch itself, so a plate with eight wells and
 * slots reaches configurations where every remaining corner is either reflex or
 * blocked. Splitting the ring in two and recursing is the escape hatch; without
 * it the triangulation deadlocks on exactly the geometry this airframe needs.
 */
function clipRegion(
  polygon: readonly IndexedPoint[],
  ring: number[],
  triangles: ObjectTriangle[],
): void {
  if (ring.length < 3) return;
  const corner = (index: number) => ({
    previous: polygon[ring[(index - 1 + ring.length) % ring.length]],
    current: polygon[ring[index]],
    next: polygon[ring[(index + 1) % ring.length]],
  });
  const turn = (index: number) => {
    const { previous, current, next } = corner(index);
    return (current.x - previous.x) * (next.z - previous.z)
      - (current.z - previous.z) * (next.x - previous.x);
  };
  let cursor = 0;
  let failures = 0;
  while (ring.length > 3) {
    if (failures > ring.length) {
      const parentArea = planArea(ring.map((index) => polygon[index]));
      for (let first = 0; first < ring.length; first += 1) {
        for (let second = first + 2; second < ring.length; second += 1) {
          if (first === 0 && second === ring.length - 1) continue;
          if (!isDiagonal(polygon, ring, first, second)) continue;
          const head = ring.slice(first, second + 1);
          const tail = [...ring.slice(second), ...ring.slice(0, first + 1)];
          if (head.length < 3 || tail.length < 3) continue;
          // A split that loses or duplicates area produces overlapping,
          // inside-out triangles that silently paper over a well. Prove the
          // two halves partition the parent before recursing.
          const headArea = planArea(head.map((index) => polygon[index]));
          const tailArea = planArea(tail.map((index) => polygon[index]));
          if (headArea <= EPSILON || tailArea <= EPSILON) continue;
          if (Math.abs(headArea + tailArea - parentArea) > 1e-9) continue;
          clipRegion(polygon, head, triangles);
          clipRegion(polygon, tail, triangles);
          return;
        }
      }
      const remaining = ring
        .map((index) => `${polygon[index].x.toFixed(3)}/${polygon[index].z.toFixed(3)}`)
        .join(" ");
      throw new Error(`triangulatePlan stalled with ${ring.length} vertices left: ${remaining}`);
    }
    const { previous, current, next } = corner(cursor);
    if (turn(cursor) <= EPSILON) {
      cursor = (cursor + 1) % ring.length;
      failures += 1;
      continue;
    }
    let blocked = false;
    for (let other = 0; other < ring.length && !blocked; other += 1) {
      if (turn(other) > EPSILON) continue;
      const candidate = polygon[ring[other]];
      if (samePoint(candidate, previous) || samePoint(candidate, current) || samePoint(candidate, next)) continue;
      if (pointInTriangle(candidate, previous, current, next, 1e-11)) blocked = true;
    }
    if (blocked) {
      cursor = (cursor + 1) % ring.length;
      failures += 1;
      continue;
    }
    triangles.push([previous.source, current.source, next.source]);
    ring.splice(cursor, 1);
    cursor %= ring.length;
    failures = 0;
  }
  triangles.push([polygon[ring[0]].source, polygon[ring[1]].source, polygon[ring[2]].source]);
}

/**
 * Ear-clips a simple polygon with holes. Returns the merged plan vertices and
 * triangles wound counter-clockwise in plan.
 */
export function triangulatePlan(
  outline: PlanRing,
  holes: readonly PlanRing[] = [],
): { points: PlanPoint[]; triangles: ObjectTriangle[] } {
  const points: PlanPoint[] = [];
  const record = (ring: PlanRing): IndexedPoint[] =>
    ring.map((point) => {
      points.push(plan(point.x, point.z));
      return { x: point.x, z: point.z, source: points.length - 1 };
    });

  let polygon = record(orientRing(outline, 1));
  const sorted = holes
    .map((hole) => orientRing(hole, -1))
    .sort((first, second) => second[rightmostIndex(second)].x - first[rightmostIndex(first)].x);
  for (let index = 0; index < sorted.length; index += 1) {
    const hole = sorted[index];
    try {
      polygon = spliceHole(polygon, record(hole));
    } catch (error) {
      const anchor = hole[rightmostIndex(hole)];
      throw new Error(
        `${(error as Error).message} (hole ${index} of ${sorted.length}, anchor x=${anchor.x.toFixed(3)} z=${anchor.z.toFixed(3)})`,
      );
    }
  }

  const triangles: ObjectTriangle[] = [];
  clipRegion(polygon, polygon.map((_, index) => index), triangles);
  return { points, triangles };
}

export function facetCentroid(facet: Facet): ObjectPoint {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of facet.points) {
    x += point[0];
    y += point[1];
    z += point[2];
  }
  const count = facet.points.length;
  return at(x / count, y / count, z / count);
}

/** Quad wound so that (a, b, c, d) traverses the face front-to-back. */
export function quadFacet(
  a: ObjectPoint,
  b: ObjectPoint,
  c: ObjectPoint,
  d: ObjectPoint,
  tag: string,
): Facet {
  return { points: [a, b, c, d], tag };
}

export function polygonFacet(points: readonly ObjectPoint[], tag: string): Facet {
  return { points, tag };
}

/**
 * Band between two parallel rings. `outer` must sit outward and/or below
 * `inner`; the resulting quads then face outward for both a counter-clockwise
 * boundary and a clockwise hole.
 */
function bandFacets(
  inner: readonly ObjectPoint[],
  outer: readonly ObjectPoint[],
  tag: string,
): Facet[] {
  const facets: Facet[] = [];
  for (let index = 0; index < inner.length; index += 1) {
    const next = (index + 1) % inner.length;
    facets.push(quadFacet(inner[index], inner[next], outer[next], outer[index], tag));
  }
  return facets;
}

export type SlabOptions = {
  readonly outline: PlanRing;
  readonly holes?: readonly PlanRing[];
  readonly topAt: (x: number, z: number) => number;
  readonly bottomAt: (x: number, z: number) => number;
  readonly chamfer: number;
  readonly holeTags?: readonly string[];
};

/**
 * A structural plate: top skin, bottom skin, chamfered outer rim and a
 * chamfered wall around every well. The result is one closed manifold, so its
 * volume can be verified by the divergence theorem before it is split into
 * breakable panels.
 */
export function buildSlab(options: SlabOptions): Facet[] {
  const { topAt, bottomAt, chamfer } = options;
  const outline = orientRing(options.outline, 1);
  const holes = (options.holes ?? []).map((hole) => orientRing(hole, -1));
  const skinOutline = insetRing(outline, chamfer);
  const skinHoles = holes.map((hole) => insetRing(hole, chamfer));

  const facets: Facet[] = [];
  const skin = triangulatePlan(skinOutline, skinHoles);
  for (const [a, b, c] of skin.triangles) {
    const pa = skin.points[a];
    const pb = skin.points[b];
    const pc = skin.points[c];
    // A plan-counter-clockwise triangle faces down in a Y-up frame, so the top
    // skin reverses and the bottom skin keeps the authored winding.
    facets.push(polygonFacet([
      at(pa.x, topAt(pa.x, pa.z), pa.z),
      at(pc.x, topAt(pc.x, pc.z), pc.z),
      at(pb.x, topAt(pb.x, pb.z), pb.z),
    ], "top"));
    facets.push(polygonFacet([
      at(pa.x, bottomAt(pa.x, pa.z), pa.z),
      at(pb.x, bottomAt(pb.x, pb.z), pb.z),
      at(pc.x, bottomAt(pc.x, pc.z), pc.z),
    ], "bottom"));
  }

  const rings: { ring: PlanPoint[]; skin: PlanPoint[]; tag: string }[] = [
    { ring: outline, skin: skinOutline, tag: "rim" },
    ...holes.map((hole, index) => ({
      ring: hole,
      skin: skinHoles[index],
      tag: options.holeTags?.[index] ?? `well-${index}`,
    })),
  ];

  for (const entry of rings) {
    const topSkin = entry.skin.map((point) => at(point.x, topAt(point.x, point.z), point.z));
    const topEdge = entry.ring.map((point) => at(point.x, topAt(point.x, point.z) - chamfer, point.z));
    const bottomEdge = entry.ring.map((point) => at(point.x, bottomAt(point.x, point.z) + chamfer, point.z));
    const bottomSkin = entry.skin.map((point) => at(point.x, bottomAt(point.x, point.z), point.z));
    facets.push(...bandFacets(topSkin, topEdge, `${entry.tag}-chamfer-top`));
    facets.push(...bandFacets(topEdge, bottomEdge, entry.tag));
    facets.push(...bandFacets(bottomEdge, bottomSkin, `${entry.tag}-chamfer-bottom`));
  }
  return facets;
}

export type LoftSection = readonly ObjectPoint[];

/**
 * Faceted loft through equally sized closed rings. Every quad is its own facet,
 * so a section corner stays a crease down the whole body instead of being
 * smoothed into a soap bar.
 */
export function buildLoft(
  sections: readonly LoftSection[],
  options: { readonly tag?: string; readonly capStart?: boolean; readonly capEnd?: boolean } = {},
): Facet[] {
  const tag = options.tag ?? "loft";
  const ring = sections[0].length;
  for (const section of sections) {
    if (section.length !== ring) throw new Error("buildLoft needs sections of equal length");
  }
  const facets: Facet[] = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    const current = sections[index];
    const next = sections[index + 1];
    for (let side = 0; side < ring; side += 1) {
      const following = (side + 1) % ring;
      facets.push(quadFacet(
        current[side],
        next[side],
        next[following],
        current[following],
        `${tag}-${side}`,
      ));
    }
  }
  // The side quads face outward when the loft advances against each ring's own
  // polygon normal, so the first cap keeps the authored winding and the last
  // one reverses it.
  if (options.capStart) facets.push(polygonFacet([...sections[0]], `${tag}-cap-start`));
  if (options.capEnd) facets.push(polygonFacet([...sections[sections.length - 1]].reverse(), `${tag}-cap-end`));
  return facets;
}

export type RevolutionProfile = readonly { readonly radius: number; readonly y: number }[];

/**
 * Surface of revolution around a vertical axis. Used for a bell-mouth inlet and
 * a machined rim: shapes whose whole job is a continuous tangent, where a flat
 * annulus reads as a tin lid.
 */
export function buildRevolution(
  profile: RevolutionProfile,
  centre: PlanPoint,
  options: { readonly segments?: number; readonly tag?: string; readonly outward?: boolean } = {},
): Facet[] {
  const segments = options.segments ?? 48;
  const tag = options.tag ?? "revolution";
  const outward = options.outward ?? true;
  const ringAt = (radius: number, y: number): ObjectPoint[] =>
    Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return at(centre.x + Math.cos(angle) * radius, y, centre.z + Math.sin(angle) * radius);
    });
  const facets: Facet[] = [];
  for (let index = 0; index < profile.length - 1; index += 1) {
    const upper = ringAt(profile[index].radius, profile[index].y);
    const lower = ringAt(profile[index + 1].radius, profile[index + 1].y);
    for (let side = 0; side < segments; side += 1) {
      const next = (side + 1) % segments;
      // Profiles are authored from the top down, so a descending run wound
      // this way faces away from the axis.
      facets.push(outward
        ? quadFacet(upper[side], upper[next], lower[next], lower[side], tag)
        : quadFacet(upper[side], lower[side], lower[next], upper[next], tag));
    }
  }
  return facets;
}

export type TorqueBoxOptions = {
  readonly from: ObjectPoint;
  readonly to: ObjectPoint;
  readonly width: number;
  readonly height: number;
  readonly chamfer: number;
  readonly tag?: string;
};

/**
 * Closed box-section member with chamfered corners. A carbon airframe carries
 * bending in boxes like this; a constant-radius tube reads as plumbing.
 */
export function buildTorqueBox(options: TorqueBoxOptions): Facet[] {
  const tag = options.tag ?? "torque-box";
  const axis = [
    options.to[0] - options.from[0],
    options.to[1] - options.from[1],
    options.to[2] - options.from[2],
  ];
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length < 1e-6) throw new Error("buildTorqueBox needs a non-degenerate axis");
  const forward = axis.map((value) => value / length) as [number, number, number];
  const reference: [number, number, number] = Math.abs(forward[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
  const across: [number, number, number] = [
    reference[1] * forward[2] - reference[2] * forward[1],
    reference[2] * forward[0] - reference[0] * forward[2],
    reference[0] * forward[1] - reference[1] * forward[0],
  ];
  const acrossLength = Math.hypot(...across);
  const right = across.map((value) => value / acrossLength) as [number, number, number];
  const up: [number, number, number] = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ];
  const halfWidth = options.width / 2;
  const halfHeight = options.height / 2;
  const chamfer = Math.min(options.chamfer, halfWidth * 0.7, halfHeight * 0.7);
  const outline: readonly (readonly [number, number])[] = [
    [halfWidth, halfHeight - chamfer], [halfWidth - chamfer, halfHeight],
    [-halfWidth + chamfer, halfHeight], [-halfWidth, halfHeight - chamfer],
    [-halfWidth, -halfHeight + chamfer], [-halfWidth + chamfer, -halfHeight],
    [halfWidth - chamfer, -halfHeight], [halfWidth, -halfHeight + chamfer],
  ];
  const section = (origin: ObjectPoint): ObjectPoint[] => outline.map(([u, v]) => at(
    origin[0] + right[0] * u + up[0] * v,
    origin[1] + right[1] * u + up[1] * v,
    origin[2] + right[2] * u + up[2] * v,
  ));
  const start = section(options.from);
  const end = section(options.to);
  const facets: Facet[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    facets.push(quadFacet(start[index], start[next], end[next], end[index], tag));
  }
  facets.push(polygonFacet([...start].reverse(), `${tag}-cap-start`));
  facets.push(polygonFacet([...end], `${tag}-cap-end`));
  return facets;
}

/**
 * Closed-volume check by the divergence theorem. A positive value proves the
 * facet set is wound consistently outward; a value near zero or negative means
 * the solid is inverted or open.
 */
export function facetVolume(facets: readonly Facet[]): number {
  let total = 0;
  for (const facet of facets) {
    const origin = facet.points[0];
    for (let index = 1; index < facet.points.length - 1; index += 1) {
      const a = facet.points[index];
      const b = facet.points[index + 1];
      total += (
        origin[0] * (a[1] * b[2] - a[2] * b[1])
        - origin[1] * (a[0] * b[2] - a[2] * b[0])
        + origin[2] * (a[0] * b[1] - a[1] * b[0])
      ) / 6;
    }
  }
  return total;
}

/** Groups facets into named buckets so one solid can compile into several breakable panels. */
export function splitFacets(
  facets: readonly Facet[],
  classify: (centroid: ObjectPoint, tag: string) => string,
): Map<string, Facet[]> {
  const buckets = new Map<string, Facet[]>();
  for (const facet of facets) {
    const key = classify(facetCentroid(facet), facet.tag);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(facet);
    else buckets.set(key, [facet]);
  }
  return buckets;
}

/**
 * Converts facets into one mesh part. Facets keep their own vertices, so the
 * renderer's normal pass reproduces the authored faceting exactly.
 */
export function facetsToPart(
  id: string,
  group: string,
  material: ObjectMaterialId,
  facets: readonly Facet[],
  options: { readonly doubleSided?: boolean; readonly showEdges?: boolean } = {},
): ObjectLabPart {
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (const facet of facets) {
    const base = vertices.length;
    for (const point of facet.points) vertices.push(point);
    for (let index = 1; index < facet.points.length - 1; index += 1) {
      triangles.push([base, base + index, base + index + 1]);
    }
  }
  return {
    kind: "mesh",
    id,
    group,
    material,
    vertices,
    triangles,
    doubleSided: options.doubleSided ?? false,
    showEdges: options.showEdges,
  };
}
