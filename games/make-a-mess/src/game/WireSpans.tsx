"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshStandardMaterial,
  Vector3,
} from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import { resolveWireAnchor, wireIsGrounded } from "./wireAnchors";

/**
 * Sagging wires, ropes and ground cables — the connective tissue that turns
 * separate props into one inhabited place. Every span is a catenary of thin
 * oriented boxes; all spans merge into ONE static geometry and one draw call.
 *
 * Провода живут в мире разрушений: конец пролёта автоматически привязан к
 * куску, на котором нарисован (столб, стена, киоск — см. wireAnchors).
 * Сломали опору — пролёт за полсекунды падает и повисает с уцелевшего конца,
 * потеряли обе — ложится на землю. Геометрия перестраивается только по
 * событию и в короткой анимации; в покое по-прежнему ноль работы на кадр.
 */
export interface WireSpan {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  /** Extra mid-point droop in metres. Default: 4.5% of the span length. */
  readonly sag?: number;
  readonly thickness?: number;
  readonly color?: string;
  readonly segments?: number;
}

const UP = new Vector3(0, 1, 0);
const GROUND_Y = 0.07;
const FALL_SECONDS = 0.55;

/** 0 — цел; 1 — повис с from-конца; 2 — повис с to-конца; 3 — лежит. */
type SpanMode = 0 | 1 | 2 | 3;

interface ResolvedSpan {
  readonly span: WireSpan;
  readonly segments: number;
  readonly thickness: number;
  /** Смещение первой вершины пролёта в общем буфере. */
  readonly vertexOffset: number;
  /** (segments+1)*3 координат живой катенарной кривой. */
  readonly intact: Float32Array;
  readonly length: number;
  readonly anchors: readonly [string | null, string | null];
  readonly seed: number;
}

interface SpanState {
  mode: SpanMode;
  animating: boolean;
  progress: number;
  from: Float32Array | null;
  target: Float32Array | null;
  current: Float32Array;
}

function spanSegments(span: WireSpan): number {
  const length = Math.hypot(
    span.to[0] - span.from[0],
    span.to[1] - span.from[1],
    span.to[2] - span.from[2],
  );
  return span.segments ?? Math.max(4, Math.min(12, Math.round(length / 1.6)));
}

function sampleIntact(span: WireSpan, segments: number): Float32Array {
  const [fx, fy, fz] = span.from;
  const [tx, ty, tz] = span.to;
  const length = Math.hypot(tx - fx, ty - fy, tz - fz);
  const sag = span.sag ?? length * 0.045;
  const points = new Float32Array((segments + 1) * 3);
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    points[index * 3] = fx + (tx - fx) * t;
    points[index * 3 + 1] = fy + (ty - fy) * t - sag * 4 * t * (1 - t);
    points[index * 3 + 2] = fz + (tz - fz) * t;
  }
  return points;
}

function polylineLength(points: Float32Array): number {
  let total = 0;
  for (let index = 3; index < points.length; index += 3) {
    total += Math.hypot(
      points[index] - points[index - 3],
      points[index + 1] - points[index - 2],
      points[index + 2] - points[index - 1],
    );
  }
  return total;
}

/**
 * Провод, повисший с уцелевшего конца `a`: вертикальный отвес с лёгким
 * уводом в сторону бывшего конца `b`, излишек длины змейкой ложится на
 * землю. Порядок точек — от `a` к свободному концу.
 */
function hangingPoints(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  length: number,
  segments: number,
  seed: number,
): Float32Array {
  let driftX = b[0] - a[0];
  let driftZ = b[2] - a[2];
  const driftLength = Math.hypot(driftX, driftZ);
  if (driftLength < 1e-4) {
    driftX = 1;
    driftZ = 0;
  } else {
    driftX /= driftLength;
    driftZ /= driftLength;
  }
  const vertical = Math.min(length, Math.max(0.4, a[1] - GROUND_Y));
  const points = new Float32Array((segments + 1) * 3);
  for (let index = 0; index <= segments; index += 1) {
    const d = (index / segments) * length;
    if (d <= vertical) {
      points[index * 3] = a[0] + driftX * 0.1 * d;
      points[index * 3 + 1] = Math.max(a[1] - d, GROUND_Y);
      points[index * 3 + 2] = a[2] + driftZ * 0.1 * d;
    } else {
      const g = d - vertical;
      const meander = Math.sin(g * 1.9 + seed) * 0.22;
      points[index * 3] = a[0] + driftX * (0.1 * vertical + g) - driftZ * meander;
      points[index * 3 + 1] = GROUND_Y;
      points[index * 3 + 2] = a[2] + driftZ * (0.1 * vertical + g) + driftX * meander;
    }
  }
  return points;
}

/** Оба конца потеряны: провод змейкой лежит между бывшими опорами. */
function downedPoints(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  segments: number,
  seed: number,
): Float32Array {
  let acrossX = b[0] - a[0];
  let acrossZ = b[2] - a[2];
  const across = Math.hypot(acrossX, acrossZ) || 1;
  acrossX /= across;
  acrossZ /= across;
  const points = new Float32Array((segments + 1) * 3);
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    // Меандр затухает к концам: бывшие точки крепления остаются на месте.
    const meander = Math.sin(t * 7.3 + seed) * 0.32 * Math.sin(t * Math.PI);
    points[index * 3] = a[0] + (b[0] - a[0]) * t - acrossZ * meander;
    points[index * 3 + 1] = GROUND_Y;
    points[index * 3 + 2] = a[2] + (b[2] - a[2]) * t + acrossX * meander;
  }
  return points;
}

function reversedPoints(points: Float32Array): Float32Array {
  const output = new Float32Array(points.length);
  const count = points.length / 3;
  for (let index = 0; index < count; index += 1) {
    const source = (count - 1 - index) * 3;
    output[index * 3] = points[source];
    output[index * 3 + 1] = points[source + 1];
    output[index * 3 + 2] = points[source + 2];
  }
  return output;
}

const tmpP0 = new Vector3();
const tmpP1 = new Vector3();
const tmpDir = new Vector3();
const tmpSide = new Vector3();
const tmpRise = new Vector3();
const tmpOffset = new Vector3();

const CORNERS = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
] as const;

function writeSpanVertices(
  points: Float32Array,
  segments: number,
  thickness: number,
  vertexOffset: number,
  positions: Float32Array,
  normals: Float32Array,
): void {
  for (let segment = 0; segment < segments; segment += 1) {
    tmpP0.fromArray(points, segment * 3);
    tmpP1.fromArray(points, (segment + 1) * 3);
    tmpDir.copy(tmpP1).sub(tmpP0).normalize();
    tmpSide.copy(tmpDir).cross(UP);
    if (tmpSide.lengthSq() < 1e-6) {
      tmpSide.set(1, 0, 0);
    }
    tmpSide.normalize().multiplyScalar(thickness / 2);
    tmpRise.copy(tmpSide).cross(tmpDir).normalize().multiplyScalar(thickness / 2);

    let vertex = vertexOffset + segment * 8;
    for (const point of [tmpP0, tmpP1]) {
      for (const [ss, uu] of CORNERS) {
        tmpOffset
          .set(0, 0, 0)
          .addScaledVector(tmpSide, ss)
          .addScaledVector(tmpRise, uu);
        positions[vertex * 3] = point.x + tmpOffset.x;
        positions[vertex * 3 + 1] = point.y + tmpOffset.y;
        positions[vertex * 3 + 2] = point.z + tmpOffset.z;
        const inverseLength = 1 / (tmpOffset.length() || 1);
        normals[vertex * 3] = tmpOffset.x * inverseLength;
        normals[vertex * 3 + 1] = tmpOffset.y * inverseLength;
        normals[vertex * 3 + 2] = tmpOffset.z * inverseLength;
        vertex += 1;
      }
    }
  }
}

function targetPointsFor(resolved: ResolvedSpan, mode: SpanMode): Float32Array {
  const { span, segments, length, seed } = resolved;
  if (mode === 1) {
    return hangingPoints(span.from, span.to, length, segments, seed);
  }
  if (mode === 2) {
    return reversedPoints(hangingPoints(span.to, span.from, length, segments, seed));
  }
  if (mode === 3) {
    return downedPoints(span.from, span.to, segments, seed);
  }
  return resolved.intact.slice();
}

export function WireSpans({
  spans,
  pieces,
  brokenPieces,
}: {
  spans: readonly WireSpan[];
  pieces?: readonly BreakablePieceDefinition[];
  brokenPieces?: ReadonlySet<string>;
}) {
  const resolvedSpans = useMemo<ResolvedSpan[]>(() => {
    const segmentCounts = spans.map(spanSegments);
    const offsets = segmentCounts.map((_, index) =>
      segmentCounts.slice(0, index).reduce((sum, count) => sum + count * 8, 0),
    );
    return spans.map((span, index) => {
      const segments = segmentCounts[index];
      const intact = sampleIntact(span, segments);
      const anchors: readonly [string | null, string | null] =
        pieces && !wireIsGrounded(span.from, span.to)
          ? [
              resolveWireAnchor(span.from, pieces),
              resolveWireAnchor(span.to, pieces),
            ]
          : [null, null];
      return {
        span,
        segments,
        thickness: span.thickness ?? 0.035,
        vertexOffset: offsets[index],
        intact,
        length: polylineLength(intact),
        anchors,
        seed: index * 2.39,
      };
    });
  }, [spans, pieces]);

  const { geometry, positionAttribute, normalAttribute } = useMemo(() => {
    const totalVertices = resolvedSpans.reduce(
      (sum, resolved) => sum + resolved.segments * 8,
      0,
    );
    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const colors = new Float32Array(totalVertices * 3);
    const indices: number[] = [];
    const color = new Color();

    for (const resolved of resolvedSpans) {
      writeSpanVertices(
        resolved.intact,
        resolved.segments,
        resolved.thickness,
        resolved.vertexOffset,
        positions,
        normals,
      );
      color.set(resolved.span.color ?? "#20211f");
      for (let vertex = 0; vertex < resolved.segments * 8; vertex += 1) {
        const at = (resolved.vertexOffset + vertex) * 3;
        colors[at] = color.r;
        colors[at + 1] = color.g;
        colors[at + 2] = color.b;
      }
      for (let segment = 0; segment < resolved.segments; segment += 1) {
        const base = resolved.vertexOffset + segment * 8;
        for (let corner = 0; corner < 4; corner += 1) {
          const next = (corner + 1) % 4;
          indices.push(
            base + corner, base + 4 + corner, base + 4 + next,
            base + corner, base + 4 + next, base + next,
          );
        }
      }
    }

    const built = new BufferGeometry();
    const positionAttr = new BufferAttribute(positions, 3);
    const normalAttr = new BufferAttribute(normals, 3);
    built.setAttribute("position", positionAttr);
    built.setAttribute("normal", normalAttr);
    built.setAttribute("color", new BufferAttribute(colors, 3));
    built.setIndex(indices);
    return { geometry: built, positionAttribute: positionAttr, normalAttribute: normalAttr };
  }, [resolvedSpans]);

  const states = useRef<SpanState[]>([]);
  useEffect(() => {
    states.current = resolvedSpans.map((resolved) => ({
      mode: 0,
      animating: false,
      progress: 1,
      from: null,
      target: null,
      current: resolved.intact.slice(),
    }));
  }, [resolvedSpans]);

  useFrame((_, delta) => {
    const broken = brokenPieces;
    let dirty = false;
    for (let index = 0; index < resolvedSpans.length; index += 1) {
      const resolved = resolvedSpans[index];
      const state = states.current[index];
      if (!state) {
        continue;
      }
      const [anchorFrom, anchorTo] = resolved.anchors;
      if (anchorFrom === null && anchorTo === null) {
        continue;
      }
      const fromLost = anchorFrom !== null && (broken?.has(anchorFrom) ?? false);
      const toLost = anchorTo !== null && (broken?.has(anchorTo) ?? false);
      const desired: SpanMode = fromLost
        ? toLost
          ? 3
          : 2
        : toLost
          ? 1
          : 0;

      if (desired !== state.mode) {
        if (desired === 0) {
          // Рестарт сцены: провода возвращаются мгновенно, без «взлёта».
          state.current = resolved.intact.slice();
          state.animating = false;
          state.from = null;
          state.target = null;
          writeSpanVertices(
            state.current,
            resolved.segments,
            resolved.thickness,
            resolved.vertexOffset,
            positionAttribute.array as Float32Array,
            normalAttribute.array as Float32Array,
          );
          dirty = true;
        } else {
          state.from = state.current.slice();
          state.target = targetPointsFor(resolved, desired);
          state.progress = 0;
          state.animating = true;
        }
        state.mode = desired;
      }

      if (state.animating && state.from && state.target) {
        state.progress = Math.min(1, state.progress + delta / FALL_SECONDS);
        // Свободный конец падает с ускорением.
        const eased = state.progress * state.progress;
        const current = state.current;
        for (let component = 0; component < current.length; component += 1) {
          current[component] =
            state.from[component] +
            (state.target[component] - state.from[component]) * eased;
        }
        if (state.progress >= 1) {
          state.animating = false;
          state.from = null;
        }
        writeSpanVertices(
          current,
          resolved.segments,
          resolved.thickness,
          resolved.vertexOffset,
          positionAttribute.array as Float32Array,
          normalAttribute.array as Float32Array,
        );
        dirty = true;
      }
    }
    if (dirty) {
      positionAttribute.needsUpdate = true;
      normalAttribute.needsUpdate = true;
    }
  });

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.08,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
