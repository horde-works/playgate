"use client";

import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Vector3,
} from "three";

/**
 * Sagging wires, ropes and ground cables — the connective tissue that turns
 * separate props into one inhabited place. Every span is a catenary of thin
 * oriented boxes; all spans merge into ONE static geometry and one draw call.
 * Endpoints are decorative (they follow nothing at runtime), which keeps the
 * whole network free: no physics, no per-frame work.
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

function appendSpan(
  span: WireSpan,
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
): void {
  const from = new Vector3(...span.from);
  const to = new Vector3(...span.to);
  const length = from.distanceTo(to);
  const sag = span.sag ?? length * 0.045;
  const thickness = span.thickness ?? 0.035;
  const segments = span.segments ?? Math.max(4, Math.min(12, Math.round(length / 1.6)));
  const color = new Color(span.color ?? "#20211f");

  const point = (t: number): Vector3 =>
    new Vector3(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t - sag * 4 * t * (1 - t),
      from.z + (to.z - from.z) * t,
    );

  for (let segment = 0; segment < segments; segment += 1) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    const p0 = point(t0);
    const p1 = point(t1);
    const dir = p1.clone().sub(p0).normalize();
    let side = dir.clone().cross(UP);
    if (side.lengthSq() < 1e-6) {
      side = new Vector3(1, 0, 0);
    }
    side.normalize().multiplyScalar(thickness / 2);
    const rise = side.clone().cross(dir).normalize().multiplyScalar(thickness / 2);

    const base = positions.length / 3;
    for (const p of [p0, p1]) {
      for (const [ss, uu] of [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
      ] as const) {
        positions.push(
          p.x + side.x * ss + rise.x * uu,
          p.y + side.y * ss + rise.y * uu,
          p.z + side.z * ss + rise.z * uu,
        );
        const nx = side.x * ss + rise.x * uu;
        const ny = side.y * ss + rise.y * uu;
        const nz = side.z * ss + rise.z * uu;
        const nl = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / nl, ny / nl, nz / nl);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let corner = 0; corner < 4; corner += 1) {
      const next = (corner + 1) % 4;
      indices.push(
        base + corner, base + 4 + corner, base + 4 + next,
        base + corner, base + 4 + next, base + next,
      );
    }
  }
}

export function WireSpans({ spans }: { spans: readonly WireSpan[] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (const span of spans) {
      appendSpan(span, positions, normals, colors, indices);
    }
    const built = new BufferGeometry();
    built.setAttribute("position", new Float32BufferAttribute(positions, 3));
    built.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    built.setAttribute("color", new Float32BufferAttribute(colors, 3));
    built.setIndex(indices);
    return built;
  }, [spans]);

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
