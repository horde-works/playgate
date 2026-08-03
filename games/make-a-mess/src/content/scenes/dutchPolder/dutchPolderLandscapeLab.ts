import type {
  ObjectBoxPart,
  ObjectLabModel,
  ObjectLabPart,
  ObjectPoint,
} from "../../objects/dutchWindmills/objectModel.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
import {
  compileLandscapeMesh,
  LANDSCAPE_RENDER_PROFILES,
  type LandscapeRenderProfile,
} from "../../landscape/landscapeMesher.ts";
import { dutchPolderLandscapeDocument } from "./dutchPolderLandscapeDocument.ts";

function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function shorelineSkirt(): ObjectLabPart {
  const sampler = createLandscapeSampler(dutchPolderLandscapeDocument);
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const bottom = -8.4;
  const islandCenter = [0.55, 2.17] as const;
  for (let index = 0; index < dutchPolderLandscapeDocument.boundary.length; index += 1) {
    const from = dutchPolderLandscapeDocument.boundary[index];
    const to = dutchPolderLandscapeDocument.boundary[(index + 1) % dutchPolderLandscapeDocument.boundary.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const slices = Math.ceil(length / 1.5);
    for (let slice = 0; slice < slices; slice += 1) {
      const t0 = slice / slices;
      const t1 = (slice + 1) / slices;
      const ax = from[0] + (to[0] - from[0]) * t0;
      const az = from[1] + (to[1] - from[1]) * t0;
      const bx = from[0] + (to[0] - from[0]) * t1;
      const bz = from[1] + (to[1] - from[1]) * t1;
      const inwardA = Math.hypot(islandCenter[0] - ax, islandCenter[1] - az);
      const inwardB = Math.hypot(islandCenter[0] - bx, islandCenter[1] - bz);
      const iax = ax + (islandCenter[0] - ax) / inwardA * 1.8;
      const iaz = az + (islandCenter[1] - az) / inwardA * 1.8;
      const ibx = bx + (islandCenter[0] - bx) / inwardB * 1.8;
      const ibz = bz + (islandCenter[1] - bz) / inwardB * 1.8;
      const ay = sampler.elevationAt(iax, iaz);
      const by = sampler.elevationAt(ibx, ibz);
      const offset = vertices.length;
      // A short inward shoulder bridges the exact shoreline to the regular
      // heightfield grid. The outer lip drops slightly, reading as erosion
      // instead of a crack between two unrelated meshes.
      vertices.push(
        [iax, ay, iaz], [ibx, by, ibz], [bx, by - 0.26, bz], [ax, ay - 0.26, az],
        [ax, ay - 0.26, az], [bx, by - 0.26, bz], [bx, bottom, bz], [ax, bottom, az],
      );
      triangles.push(
        [offset, offset + 1, offset + 2], [offset, offset + 2, offset + 3],
        [offset + 4, offset + 5, offset + 6], [offset + 4, offset + 6, offset + 7],
      );
    }
  }
  return {
    kind: "mesh",
    id: "shore-skirt",
    group: "shore",
    material: "earth",
    vertices,
    triangles,
    doubleSided: true,
    showEdges: false,
  };
}

function pathStones(): ObjectBoxPart[] {
  const sampler = createLandscapeSampler(dutchPolderLandscapeDocument);
  const stones: ObjectBoxPart[] = [];
  let candidate = 0;
  for (const corridor of dutchPolderLandscapeDocument.corridors) {
    for (let segment = 1; segment < corridor.points.length; segment += 1) {
      const from = corridor.points[segment - 1];
      const to = corridor.points[segment];
      const dx = to[0] - from[0];
      const dz = to[2] - from[2];
      const length = Math.hypot(dx, dz);
      const nx = -dz / length;
      const nz = dx / length;
      const steps = Math.floor(length / 3.8);
      for (let step = 1; step < steps; step += 1) {
        const amount = step / steps;
        for (const side of [-1, 1] as const) {
          candidate += 1;
          if (hash(candidate, 2) < 0.57) continue;
          const offset = side * (corridor.width / 2 + 0.18 + hash(candidate, 3) * 0.28);
          const x = from[0] + dx * amount + nx * offset;
          const z = from[2] + dz * amount + nz * offset;
          const ground = sampler.sample(x, z);
          if (ground.groundKind !== "land") continue;
          const width = 0.18 + hash(candidate, 4) * 0.22;
          const height = 0.09 + hash(candidate, 5) * 0.1;
          stones.push({
            kind: "box",
            id: `path-stone:${candidate}`,
            group: "path-confirmation",
            material: "stone",
            center: [x, ground.elevation + height * 0.36, z],
            size: [width, height, width * (0.72 + hash(candidate, 6) * 0.5)],
            rotation: [hash(candidate, 7) * 0.16, hash(candidate, 8) * Math.PI, hash(candidate, 9) * 0.12],
          });
        }
      }
    }
  }
  return stones;
}

export function createDutchPolderLandscapeLab(profileId: LandscapeRenderProfile["id"]): ObjectLabModel {
  const profile = LANDSCAPE_RENDER_PROFILES[profileId];
  const mesh = compileLandscapeMesh(dutchPolderLandscapeDocument, profile);
  const parts: ObjectLabPart[] = [
    ...mesh.chunks.map((chunk): ObjectLabPart => ({
      kind: "mesh",
      id: `terrain:${chunk.id}`,
      group: "terrain-surface",
      material: "grass",
      vertices: chunk.vertices,
      triangles: chunk.triangles,
      normals: chunk.normals,
      vertexColors: chunk.colors,
      showEdges: false,
    })),
    shorelineSkirt(),
    ...pathStones(),
  ];
  return {
    id: `dutch-polder-landscape-${profile.id}`,
    revision: `landscape-mesher-m1-${profile.id}`,
    title: `Dutch polder — ${profile.id} terrain surface`,
    units: "metres",
    coordinates: { up: "+Y", front: "+Z", origin: "island-centroid" },
    sourceNotes: [
      "One landscape document feeds both render profiles.",
      "Paths are color masks with sparse edge stones; no path slabs are present.",
      "Channels expose dry terrace, bank and bed cross-sections; no water surface is present.",
    ],
    dimensions: {
      shorelineWidth: 143,
      shorelineDepth: 109,
      meshTriangles: mesh.triangleCount,
      meshChunks: mesh.chunks.length,
      pitch: profile.pitch,
      quantization: profile.heightQuantization,
    },
    labMetrics: [
      { label: "PROFILE", value: profile.id === "smooth" ? 1 : 2, decimals: 0, signed: false, unit: profile.id.toUpperCase() },
      { label: "TRIANGLES", value: mesh.triangleCount, decimals: 0, signed: false, unit: "" },
      { label: "CHUNKS", value: mesh.chunks.length, decimals: 0, signed: false, unit: "" },
      { label: "WATER", value: 0, decimals: 0, signed: false, unit: "NONE" },
    ],
    anchors: {},
    motionConstraints: { waterSimulation: false, pathObjects: false, damageVoxelization: "deferred" },
    labEnvironment: { floorRadius: 118, gridSize: 180, gridDivisions: 90, fogNear: 170, fogFar: 250, floorY: -8.45 },
    parts,
    views: [
      { id: "south-approach", label: `South approach · ${profile.id}`, projection: "perspective", position: [0, 38, 108], target: [0, 1.3, 2], fov: 43 },
      { id: "northwest", label: `Northwest · ${profile.id}`, projection: "perspective", position: [-104, 48, -82], target: [-3, 1.6, 1], fov: 45 },
      { id: "east", label: `Dry channels · ${profile.id}`, projection: "perspective", position: [108, 39, 28], target: [8, 0.5, 5], fov: 45 },
      { id: "plan", label: `Surface masks · ${profile.id}`, projection: "orthographic", position: [0, 150, 0], target: [0, 0, 2], orthoHeight: 164 },
    ],
  };
}
