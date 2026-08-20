// World adapter for the accepted Kallur lighthouse (revision a03, accepted
// by Igor 20.08.2026 with one fix: the gable became a true pediment).
// Visible geometry remains owned exclusively by kallurLighthouseObject.ts:
// this file only applies the pad transform, semantic materials and runtime
// collision/support metadata — the palace adapter pattern.

import type { SceneObjectDefinition } from "../sceneContract.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../../objects/dutchWindmills/objectModel.ts";
import { kallurLighthouseObject } from "../../objects/kallur/kallurLighthouseObject.ts";
import { KALLUR_PADS } from "./kallurTerrainPlan.ts";

// a05 = the accepted a03 plus solver-driven joinery: the window cross is
// one joined member standing on its sill band, door jambs stop at the
// lintel seat and the lintel bears on them. No visible surface changed.
export const KALLUR_LIGHTHOUSE_ACCEPTED_REVISION = "lighthouse-a06-2026-08-20";

const foundPad = KALLUR_PADS.find((pad) => pad.id === "lighthouse-pad");
if (!foundPad) throw new Error("lighthouse-pad missing from KALLUR_PADS");
const PAD = foundPad;
const SITE_YAW = PAD.yaw;
const BASE_Y = PAD.elevation;
const COS = Math.cos(SITE_YAW);
const SIN = Math.sin(SITE_YAW);

function worldPoint(point: ObjectPoint | SceneVector3): SceneVector3 {
  return [
    PAD.center[0] + COS * point[0] - SIN * point[2],
    BASE_Y + point[1],
    PAD.center[1] + SIN * point[0] + COS * point[2],
  ];
}

type LighthouseBinding = {
  readonly material: "stone" | "steel" | "wood" | "glass" | "plaster";
  readonly shape: "stoneBlock" | "panel" | "steelSheet" | "glassPane" | "cylinder";
  readonly colour: string;
  readonly collision: boolean;
  readonly structural: boolean;
  readonly textureProfile?: "matte-aluminium";
};

// Colours follow the measured brief palette: the estimated lighthouse white
// #E8E9E4, the lantern red of reference-13, dark tarred timber and steel.
const BINDINGS: Readonly<Record<ObjectMaterialId, LighthouseBinding | undefined>> = {
  foundation: { material: "stone", shape: "stoneBlock", colour: "#b8b6ab", collision: true, structural: true },
  // The sun must WORK the tower (Igor, 20.08): the white shaft is painted
  // plaster with a semi-matte grazing sheen, the red lantern metalwork is
  // sheet metal with the soft rolling highlight of matte aluminium — the
  // engine's edge bevels then catch low light on every facet for free.
  "paint-light": { material: "plaster", shape: "panel", colour: "#e8e9e4", collision: true, structural: true },
  "paint-accent": {
    material: "steel", shape: "steelSheet", colour: "#8f2f2a",
    collision: true, structural: true, textureProfile: "matte-aluminium",
  },
  "timber-dark": { material: "wood", shape: "panel", colour: "#3a3a36", collision: true, structural: false },
  "roof-dark": { material: "steel", shape: "steelSheet", colour: "#3c4043", collision: true, structural: false },
  metal: {
    material: "steel", shape: "steelSheet", colour: "#333b40",
    collision: false, structural: false, textureProfile: "matte-aluminium",
  },
  glazing: { material: "glass", shape: "glassPane", colour: "#cfe0e6", collision: false, structural: false },
  "lamp-glass": { material: "glass", shape: "glassPane", colour: "#d5e4e9", collision: false, structural: false },
  "lamp-bulb": { material: "steel", shape: "cylinder", colour: "#fff2d8", collision: false, structural: false },
  "dark-recess": { material: "wood", shape: "panel", colour: "#22261f", collision: false, structural: false },
  brick: undefined, "timber-mid": undefined, cladding: undefined, thatch: undefined,
  roof: undefined, "roof-warm": undefined, earth: undefined, grass: undefined,
  "grass-crown": undefined, "grass-bench": undefined, "water-reserve": undefined,
  path: undefined, "bridge-seat": undefined, reserve: undefined, stone: undefined,
  mortar: undefined, "shell-path": undefined, "soil-bed": undefined, foliage: undefined,
  "flower-red": undefined, "flower-yellow": undefined, "flower-blue": undefined,
  "flower-purple": undefined, canvas: undefined, "palace-concrete": undefined,
  "palace-stone": undefined, "palace-accent-blue": undefined, "palace-accent-red": undefined,
  "palace-frame-metal": undefined, "palace-glazing": undefined, "palace-roof-metal": undefined,
  "palace-interior-dark": undefined, "palace-sign-metal": undefined,
  opening: undefined,
};

function orient(xDirection: SceneVector3, yDirection: SceneVector3): SceneVector3 {
  const norm = (v: SceneVector3): SceneVector3 => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const x = norm(xDirection);
  const dot = yDirection[0] * x[0] + yDirection[1] * x[1] + yDirection[2] * x[2];
  const y = norm([
    yDirection[0] - x[0] * dot,
    yDirection[1] - x[1] * dot,
    yDirection[2] - x[2] * dot,
  ]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

function meshData(part: Extract<ObjectLabPart, { kind: "mesh" }>) {
  const mins = [0, 1, 2].map((axis) =>
    Math.min(...part.vertices.map((vertex) => vertex[axis])));
  const maxs = [0, 1, 2].map((axis) =>
    Math.max(...part.vertices.map((vertex) => vertex[axis])));
  const centre = [0, 1, 2].map((axis) =>
    (mins[axis] + maxs[axis]) / 2) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.025, maxs[axis] - mins[axis])) as unknown as SceneVector3;
  const vertices = part.vertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - centre[axis]) / size[axis]) as unknown as SceneVector3);
  return { centre, size, vertices } as const;
}

/** Ground-rooted parts: they seat into the levelled pad itself. */
const FOUNDATION_IDS = new Set([
  "plinth",
  "annex-side-l", "annex-side-r",
  "annex-front-jamb-l", "annex-front-jamb-r",
]);

export function createKallurLighthouse(
  push: (object: SceneObjectDefinition) => void,
): void {
  if (kallurLighthouseObject.revision !== KALLUR_LIGHTHOUSE_ACCEPTED_REVISION) {
    throw new Error(
      `Lighthouse adapter expected ${KALLUR_LIGHTHOUSE_ACCEPTED_REVISION}, `
      + `received ${kallurLighthouseObject.revision}`,
    );
  }
  for (const part of kallurLighthouseObject.parts) {
    const binding = BINDINGS[part.material];
    if (!binding) {
      throw new Error(`Lighthouse adapter has no binding for ${part.material}`);
    }
    const id = `lighthouse:${part.id}`;
    const foundation = FOUNDATION_IDS.has(part.id);
    const common = {
      textureProfile: binding.textureProfile,
      intactCollider: binding.collision,
      bearsLoad: binding.structural,
      carriesAttachments: binding.structural,
      foundation: foundation || undefined,
      light: part.light
        ? {
            ...part.light,
            position: part.light.position
              ? worldPoint(part.light.position)
              : undefined,
            // The long-range signal halo of a working light (reference-11).
            beacon: {
              physicalDiameter: 0.55,
              minScreenDiameter: 7,
              maxWorldDiameter: 3.2,
              dayOpacity: 0,
              nightOpacity: 0.9,
            },
          }
        : undefined,
    } as const;

    if (part.kind === "box") {
      const yaw = part.rotation?.[1] ?? 0;
      const roll = part.rotation?.[2] ?? 0;
      push({
        kind: "primitive",
        id,
        material: binding.material,
        shape: binding.shape,
        size: [...part.size],
        color: binding.colour,
        transform: {
          position: worldPoint(part.center),
          rotation: [0, yaw - SITE_YAW, roll],
        },
        // Rotated boxes always carry their own honest local contact box:
        // the solver compares world-axis extents and would otherwise read a
        // turned facet as a diagonal slab.
        contactBoxes: [{ position: [0, 0, 0], size: [...part.size] }],
        ...common,
      });
      continue;
    }

    if (part.kind === "mesh") {
      const mesh = meshData(part);
      push({
        kind: "primitive",
        id,
        material: binding.material,
        shape: "panel",
        size: mesh.size,
        color: binding.colour,
        transform: {
          position: worldPoint(mesh.centre),
          rotation: [0, -SITE_YAW, 0],
        },
        visualMesh: {
          vertices: mesh.vertices,
          indices: part.triangles.flatMap((triangle) => [...triangle]),
          doubleSided: part.doubleSided,
        },
        voxelization: { mode: "shell", thickness: 0.05, voxelSize: 0.16 },
        volume: Math.max(0.002, mesh.size[0] * mesh.size[1] * mesh.size[2] * 0.08),
        contactBoxes: [{ position: [0, 0, 0], size: mesh.size }],
        ...common,
      });
      continue;
    }

    const from = worldPoint(part.from);
    const to = worldPoint(part.to);
    const chord: SceneVector3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length = Math.hypot(...chord) || 0.01;
    const transverse: SceneVector3 = Math.abs(chord[1] / length) < 0.9
      ? [0, 1, 0]
      : [COS, 0, SIN];
    const size: SceneVector3 = part.kind === "cylinder"
      ? [part.radius * 2, length, part.radius * 2]
      : [part.width, length, part.depth];
    push({
      kind: "primitive",
      id,
      material: binding.material,
      shape: part.kind === "cylinder" ? "cylinder" : binding.shape,
      size,
      color: binding.colour,
      transform: {
        position: [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2,
        ],
        rotation: orient(transverse, chord),
      },
      contactBoxes: [{ position: [0, 0, 0], size }],
      volume: part.kind === "cylinder"
        ? Math.PI * part.radius ** 2 * length
        : part.width * part.depth * length,
      ...common,
    });
  }
}
