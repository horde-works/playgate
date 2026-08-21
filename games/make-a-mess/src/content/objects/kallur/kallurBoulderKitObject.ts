import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";

/**
 * Kallur boulder kit — six basalt archetypes from ONE parametric generator
 * (evidence card 01, bible §III: "5-8 архетипов, инстансинг от seed"; the
 * stone is the wall's own rock). Forms follow the rock, not fancy: bedding
 * slabs, columnar stubs, glacially rounded backs, fresh splits, scree
 * twins and small loaves. An icosphere is deformed by seeded cosine lobes
 * (smooth, deterministic), scaled per axis, then CLAMPED against planes —
 * bedding, split faces and the sitting bottom — so flats are real facets.
 * Vertices are unshared: the grey model reads hard basalt faces.
 */

const TAU = Math.PI * 2;

interface ClampPlane {
  /** Unit direction; vertices beyond `distance` project onto the plane. */
  readonly direction: ObjectPoint;
  readonly distance: number;
}

export interface BoulderArchetype {
  readonly id: string;
  readonly label: string;
  /** Axis scales applied to the unit blob before clamping. */
  readonly scale: ObjectPoint;
  /** Deformation amplitude of the seeded cosine lobes. */
  readonly noise: number;
  readonly seed: number;
  readonly clamps: readonly ClampPlane[];
  /** Second blob for cluster archetypes. */
  readonly twin?: {
    readonly offset: ObjectPoint;
    readonly scale: ObjectPoint;
    readonly seed: number;
    readonly noise: number;
    readonly clamps: readonly ClampPlane[];
  };
}

const normalize = (v: ObjectPoint): ObjectPoint => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Six radial clamp planes of a basalt column, slightly irregular. */
const columnFacets = (radius: number): ClampPlane[] =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * TAU + (index % 2) * 0.09;
    return {
      direction: normalize([Math.sin(angle), 0, Math.cos(angle)]),
      distance: radius * (1 + ((index * 37) % 5) * 0.02),
    };
  });

export const KALLUR_BOULDER_ARCHETYPES: readonly BoulderArchetype[] = [
  {
    id: "slab",
    label: "Плитчатый лежень",
    scale: [0.72, 0.24, 0.5],
    noise: 0.16,
    seed: 11,
    clamps: [
      { direction: [0, 1, 0], distance: 0.2 },
      { direction: [0, -1, 0], distance: 0.2 },
      { direction: normalize([0.2, 0.08, 0.98]), distance: 0.46 },
    ],
  },
  {
    id: "column",
    label: "Тумба — обрубок колонны",
    // The radial clamps must BITE: at 0.3 the noise swallowed them and the
    // stub rendered as an egg (a01 discrepancy).
    scale: [0.38, 0.62, 0.38],
    noise: 0.08,
    seed: 23,
    clamps: [
      ...columnFacets(0.23),
      { direction: normalize([0.16, 0.99, 0]), distance: 0.5 },
      { direction: [0, -1, 0], distance: 0.52 },
    ],
  },
  {
    id: "rounded",
    label: "Окатанная горбушка",
    scale: [0.6, 0.36, 0.5],
    noise: 0.2,
    seed: 37,
    clamps: [{ direction: [0, -1, 0], distance: 0.3 }],
  },
  {
    id: "split",
    label: "Расколотая глыба",
    // Deep fresh scars, not shy shaves: the a01 cuts read as a plain
    // faceted ball.
    scale: [0.52, 0.48, 0.46],
    noise: 0.13,
    seed: 51,
    clamps: [
      { direction: normalize([0.93, 0.08, 0.35]), distance: 0.24 },
      { direction: normalize([-0.25, 0.2, -0.94]), distance: 0.27 },
      { direction: [0, -1, 0], distance: 0.44 },
    ],
  },
  {
    id: "twin",
    label: "Сросток: горбушка и плита",
    scale: [0.46, 0.32, 0.42],
    noise: 0.18,
    seed: 67,
    clamps: [{ direction: [0, -1, 0], distance: 0.28 }],
    twin: {
      offset: [0.4, -0.1, 0.12],
      scale: [0.4, 0.16, 0.3],
      seed: 68,
      noise: 0.14,
      clamps: [
        { direction: [0, 1, 0], distance: 0.13 },
        { direction: [0, -1, 0], distance: 0.16 },
      ],
    },
  },
  {
    id: "loaf",
    label: "Буханка-окатыш",
    scale: [0.5, 0.3, 0.4],
    noise: 0.22,
    seed: 83,
    clamps: [{ direction: [0, -1, 0], distance: 0.26 }],
  },
];

/** Icosahedron with one subdivision: 80 faces of a near-uniform sphere. */
function icosphere(): { vertices: ObjectPoint[]; faces: ObjectTriangle[] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const seedPoints: readonly ObjectPoint[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const raw: ObjectPoint[] = seedPoints.map((v) => normalize(v));
  const faces: ObjectTriangle[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const vertices = [...raw];
  const midpointCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;
    const index = vertices.length;
    vertices.push(normalize([
      (vertices[a][0] + vertices[b][0]) / 2,
      (vertices[a][1] + vertices[b][1]) / 2,
      (vertices[a][2] + vertices[b][2]) / 2,
    ]));
    midpointCache.set(key, index);
    return index;
  };
  const subdivided: ObjectTriangle[] = [];
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    subdivided.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { vertices, faces: subdivided };
}

/** Smooth deterministic bumps: a sum of seeded cosine lobes over the sphere. */
function lobeDisplacement(direction: ObjectPoint, seed: number): number {
  let value = 0;
  for (let lobe = 0; lobe < 4; lobe += 1) {
    const phase = Math.sin(seed * 12.9898 + lobe * 78.233) * 43758.5453;
    const axis = normalize([
      Math.sin(phase),
      Math.sin(phase * 1.7 + 1.3),
      Math.cos(phase * 2.3),
    ]);
    const frequency = 1.5 + ((seed + lobe * 7) % 5) * 0.55;
    const dot = direction[0] * axis[0] + direction[1] * axis[1] + direction[2] * axis[2];
    value += Math.cos(dot * frequency * Math.PI + phase) / (lobe + 2);
  }
  return value / 2;
}

function buildBlob(
  scale: ObjectPoint,
  noise: number,
  seed: number,
  clamps: readonly ClampPlane[],
  offset: ObjectPoint,
): { vertices: ObjectPoint[]; faces: ObjectTriangle[] } {
  const base = icosphere();
  const vertices = base.vertices.map((direction) => {
    const bump = 1 + lobeDisplacement(direction, seed) * noise;
    const free: ObjectPoint = [
      direction[0] * bump * scale[0],
      direction[1] * bump * scale[1],
      direction[2] * bump * scale[2],
    ];
    // RADIAL support clamp — the potato cut. Projection clamping folded
    // triangles wherever two planes met (inverted normals, glowing
    // facets); shrinking the vertex along its own ray toward the centre
    // cannot fold anything, and the cut flats get naturally rounded rims.
    const radius = Math.hypot(free[0], free[1], free[2]) || 1e-9;
    const ray: ObjectPoint = [free[0] / radius, free[1] / radius, free[2] / radius];
    let clamped = radius;
    for (const clamp of clamps) {
      const along = ray[0] * clamp.direction[0] +
        ray[1] * clamp.direction[1] +
        ray[2] * clamp.direction[2];
      if (along > 1e-4) {
        clamped = Math.min(clamped, clamp.distance / along);
      }
    }
    return [
      ray[0] * clamped + offset[0],
      ray[1] * clamped + offset[1],
      ray[2] * clamped + offset[2],
    ] as ObjectPoint;
  });
  return { vertices, faces: base.faces };
}

/** A finished archetype: vertex soup (hard facets), bottom sat on y = 0. */
export function buildBoulderArchetype(
  archetype: BoulderArchetype,
): { vertices: ObjectPoint[]; triangles: ObjectTriangle[] } {
  const blobs = [
    buildBlob(archetype.scale, archetype.noise, archetype.seed, archetype.clamps, [0, 0, 0]),
  ];
  if (archetype.twin) {
    blobs.push(buildBlob(
      archetype.twin.scale,
      archetype.twin.noise,
      archetype.twin.seed,
      archetype.twin.clamps,
      archetype.twin.offset,
    ));
  }
  let minY = Infinity;
  for (const blob of blobs) {
    for (const vertex of blob.vertices) minY = Math.min(minY, vertex[1]);
  }
  const vertices: ObjectPoint[] = [];
  const triangles: ObjectTriangle[] = [];
  for (const blob of blobs) {
    for (const [a, b, c] of blob.faces) {
      const offset = vertices.length;
      for (const index of [a, b, c]) {
        const [x, y, z] = blob.vertices[index];
        vertices.push([x, y - minY, z]);
      }
      triangles.push([offset, offset + 1, offset + 2]);
    }
  }
  return { vertices, triangles };
}

const parts: ObjectLabPart[] = [];
const SPACING = 1.6;
KALLUR_BOULDER_ARCHETYPES.forEach((archetype, index) => {
  const geometry = buildBoulderArchetype(archetype);
  const x = (index - (KALLUR_BOULDER_ARCHETYPES.length - 1) / 2) * SPACING;
  parts.push({
    kind: "mesh",
    id: `boulder-${archetype.id}`,
    group: `boulder-${archetype.id}`,
    material: "stone",
    vertices: geometry.vertices.map(([vx, vy, vz]) => [vx + x, vy, vz]),
    triangles: geometry.triangles,
  });
});

export const kallurBoulderKitParts: readonly ObjectLabPart[] = parts;

export const kallurBoulderKitObject: ObjectLabModel = {
  id: "kallur-boulder-kit",
  revision: "boulder-kit-a03-2026-08-21",
  title: "Kallur boulder kit",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  sourceNotes: [
    "Bible §III owns the archetype count and the rock: the wall's own layered basalt.",
    "Forms follow the rock: bedding slabs, columnar stubs, rounded backs, splits, twins, loaves.",
    "One parametric generator; world variety comes from the stone field's per-stone seed, scale, tilt and embed.",
  ],
  dimensions: {
    archetypes: KALLUR_BOULDER_ARCHETYPES.length,
    nominalSize: 1,
  },
  labMetrics: [
    { label: "Archetypes", value: KALLUR_BOULDER_ARCHETYPES.length, decimals: 0 },
    { label: "Triangles / archetype", value: 80, decimals: 0 },
  ],
  anchors: { "kit-centre": [0, 0, 0] },
  labEnvironment: { floorRadius: 8, gridSize: 12, gridDivisions: 12 },
  parts,
  views: [
    {
      id: "front-row",
      label: "All six, front row",
      projection: "orthographic",
      position: [0, 0.8, 10],
      target: [0, 0.35, 0],
      orthoHeight: 2.6,
    },
    {
      id: "three-quarter-row",
      label: "All six, three-quarter",
      projection: "perspective",
      position: [5.5, 3.4, 7],
      target: [0, 0.3, 0],
      fov: 34,
    },
    {
      id: "top-row",
      label: "All six from above: plan silhouettes",
      projection: "orthographic",
      position: [0, 12, 0.01],
      target: [0, 0, 0],
      orthoHeight: 3.4,
    },
    {
      id: "profile-row",
      label: "Profile row: bottoms sit flat on the datum",
      projection: "orthographic",
      position: [12, 0.6, 0],
      target: [0, 0.35, 0],
      orthoHeight: 2.2,
    },
  ],
};
