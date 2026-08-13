// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// World adapter for the owner-approved D02 Palace of Virgin Lands. Visible
// geometry remains owned exclusively by virginLandsPalaceObject.ts: this file
// only applies the accepted site transform, semantic materials and runtime
// collision/support metadata.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../../objects/dutchWindmills/objectModel.ts";
import { virginLandsPalaceObject } from
  "../../objects/astana/virginLandsPalaceObject.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { astanaLandmarkSiteById } from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";
import { ASTANA_SITE_MARKER_HEIGHT } from "./astanaSiteMarkers.ts";

export const VIRGIN_LANDS_PALACE_ACCEPTED_REVISION =
  "d02-2026-08-12-real-openings";
export const VIRGIN_LANDS_PALACE_ACCEPTED_CAPTURE_HASH = "499dd1055608";
export const VIRGIN_LANDS_PALACE_ACCEPTED_ARTIFACT_SHA256 =
  "8a214e65e930c3e1883bcf926e01e51ab0f2fbc891ac0840bb786064eebb1695";

const SITE = astanaLandmarkSiteById["virgin-lands-palace-plot"];

export const VIRGIN_LANDS_PALACE_WORLD_CENTRE = SITE.center;
export const VIRGIN_LANDS_PALACE_WORLD_YAW = SITE.rotation ?? 0;
export const VIRGIN_LANDS_PALACE_WORLD_BASE_Y =
  groundUnder(SITE.center[0], SITE.center[1]).top + ASTANA_SITE_MARKER_HEIGHT;

type PalaceGroupId =
  | "structure"
  | "cladding"
  | "glazing"
  | "metal"
  | "interior";

type PalaceMaterialBinding = {
  readonly group: PalaceGroupId;
  readonly material: "stone" | "steel" | "darkGlass" | "wood";
  readonly shape: "stoneBlock" | "panel" | "steelSheet" | "glassPane";
  readonly colour: string;
  readonly textureProfile?:
    | "city-facade-cladding"
    | "matte-aluminium";
  readonly collision: boolean;
  readonly structural: boolean;
};

export const VIRGIN_LANDS_PALACE_MATERIAL_BINDINGS: Readonly<
  Record<ObjectMaterialId, PalaceMaterialBinding | undefined>
> = {
  "palace-concrete": {
    group: "structure", material: "stone", shape: "stoneBlock",
    colour: "#c7c4ba", textureProfile: "city-facade-cladding",
    collision: true, structural: true,
  },
  "palace-stone": {
    group: "cladding", material: "stone", shape: "panel",
    colour: "#b9b5a9", textureProfile: "city-facade-cladding",
    collision: false, structural: false,
  },
  "palace-accent-blue": {
    group: "cladding", material: "stone", shape: "panel",
    colour: "#48657a", textureProfile: "city-facade-cladding",
    collision: false, structural: false,
  },
  "palace-accent-red": {
    group: "cladding", material: "stone", shape: "panel",
    colour: "#8c5748", textureProfile: "city-facade-cladding",
    collision: false, structural: false,
  },
  "palace-frame-metal": {
    group: "metal", material: "steel", shape: "steelSheet",
    colour: "#333b40", textureProfile: "matte-aluminium",
    collision: false, structural: false,
  },
  "palace-glazing": {
    group: "glazing", material: "darkGlass", shape: "glassPane",
    colour: "#476672", collision: true, structural: false,
  },
  "palace-roof-metal": {
    group: "metal", material: "steel", shape: "steelSheet",
    colour: "#b2c0c3", textureProfile: "matte-aluminium",
    collision: true, structural: false,
  },
  "palace-interior-dark": {
    group: "interior", material: "wood", shape: "panel",
    colour: "#272b2c", collision: false, structural: false,
  },
  "palace-sign-metal": {
    group: "metal", material: "steel", shape: "steelSheet",
    colour: "#e0ddd2", textureProfile: "matte-aluminium",
    collision: false, structural: false,
  },
  foundation: undefined,
  brick: undefined,
  "timber-dark": undefined,
  "timber-mid": undefined,
  cladding: undefined,
  thatch: undefined,
  roof: undefined,
  "roof-dark": undefined,
  "roof-warm": undefined,
  earth: undefined,
  grass: undefined,
  "grass-crown": undefined,
  "grass-bench": undefined,
  "water-reserve": undefined,
  path: undefined,
  "bridge-seat": undefined,
  reserve: undefined,
  stone: undefined,
  mortar: undefined,
  "shell-path": undefined,
  "soil-bed": undefined,
  foliage: undefined,
  "flower-red": undefined,
  "flower-yellow": undefined,
  "flower-blue": undefined,
  "flower-purple": undefined,
  canvas: undefined,
  metal: undefined,
  "paint-light": undefined,
  "paint-accent": undefined,
  glazing: undefined,
  "lamp-glass": undefined,
  "lamp-bulb": undefined,
  "dark-recess": undefined,
  opening: undefined,
};

export interface VirginLandsPalaceWorldGroups {
  readonly structure: MutableGroup;
  readonly cladding: MutableGroup;
  readonly glazing: MutableGroup;
  readonly metal: MutableGroup;
  readonly interior: MutableGroup;
}

function worldPoint(point: ObjectPoint): SceneVector3 {
  const cosine = Math.cos(VIRGIN_LANDS_PALACE_WORLD_YAW);
  const sine = Math.sin(VIRGIN_LANDS_PALACE_WORLD_YAW);
  return [
    SITE.center[0] + cosine * point[0] - sine * point[2],
    VIRGIN_LANDS_PALACE_WORLD_BASE_Y + point[1],
    SITE.center[1] + sine * point[0] + cosine * point[2],
  ];
}

export const virginLandsPalaceWorldPoint = worldPoint;

function midpoint(from: SceneVector3, to: SceneVector3): SceneVector3 {
  return [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
}

function boxContactTiles(
  size: SceneVector3,
): readonly { readonly position: SceneVector3; readonly size: SceneVector3 }[] {
  const columns = Math.max(1, Math.ceil(size[0] / 4));
  const rows = Math.max(1, Math.ceil(size[2] / 4));
  const pitchX = size[0] / columns;
  const pitchZ = size[2] / rows;
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      position: [
        -size[0] / 2 + pitchX * (column + 0.5),
        0,
        -size[2] / 2 + pitchZ * (row + 0.5),
      ],
      size: [pitchX, size[1], pitchZ],
    };
  });
}

function interiorBackSupport(
  part: Extract<ObjectLabPart, { kind: "box" }>,
): readonly { readonly position: SceneVector3; readonly size: SceneVector3 }[] {
  const footingTop = 0.02;
  const panelTop = part.size[1] / 2;
  const localBottom = footingTop - part.center[1];
  return [{
    position: [0, (localBottom + panelTop) / 2, 0],
    size: [0.06, panelTop - localBottom, 0.06],
  }];
}

function beamContactSegments(
  size: SceneVector3,
  engageAtBottom: boolean,
): readonly { readonly position: SceneVector3; readonly size: SceneVector3 }[] {
  const segments = Math.max(1, Math.ceil(size[1] / 4));
  const engagement = engageAtBottom ? 0.01 : 0;
  const length = size[1] + engagement;
  const pitch = length / segments;
  return Array.from({ length: segments }, (_, index) => ({
    position: [0, -engagement / 2 - length / 2 + pitch * (index + 0.5), 0],
    size: [size[0], pitch, size[2]],
  }));
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
  let area = 0;
  for (const [a, b, c] of part.triangles) {
    const ab = part.vertices[b].map((value, axis) =>
      value - part.vertices[a][axis]);
    const ac = part.vertices[c].map((value, axis) =>
      value - part.vertices[a][axis]);
    area += 0.5 * Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    );
  }
  return { centre, size, vertices, area } as const;
}

function bindingFor(part: ObjectLabPart): PalaceMaterialBinding {
  const binding = VIRGIN_LANDS_PALACE_MATERIAL_BINDINGS[part.material];
  if (!binding) {
    throw new Error(`Palace world adapter has no binding for ${part.material}`);
  }
  return binding;
}

function commonOptions(part: ObjectLabPart, binding: PalaceMaterialBinding) {
  const frameMullion = part.material === "palace-frame-metal"
    && /mullion|fin-extension/.test(part.id);
  const roofSheet = part.material === "palace-roof-metal";
  const interiorBack = part.material === "palace-interior-dark"
    && part.id.endsWith("interior-back");
  const returnWall = part.group === "foyer-return-shell";
  const concreteAttachmentCarrier = part.material === "palace-concrete"
    && (/auditorium-.*:wall/.test(part.group)
      || /piloti/.test(part.id)
      || part.group === "foyer-return-shell");
  const bearsLoad = binding.structural || frameMullion || roofSheet;
  const carriesAttachments = concreteAttachmentCarrier
    || frameMullion
    || roofSheet;
  return {
    textureProfile: binding.textureProfile,
    intactCollider: binding.collision,
    bearsLoad,
    carriesAttachments,
    // Concrete slabs and wall intervals are the concealed continuous carrier
    // for the curtain wall/rainscreen. Cable mode permits edge attachment to
    // a slab without pretending the slab is a tall wall.
    attachmentSupportMode: carriesAttachments
      ? "cable" as const
      : "wall" as const,
    sideAttachmentReach: carriesAttachments ? 0.55 : 0.42,
    // The visible 120 mm mullion is the standard cover around a continuous
    // concealed curtain-wall post. Its structural foot, unlike the cover,
    // spreads compression into the edge beam below.
    bearingArea: frameMullion
      ? 0.18
      : returnWall && part.kind === "box"
        // Standard continuous strip footing, regardless of wall orientation.
        ? Math.max(part.size[0], part.size[2]) * 0.75
        : undefined,
    maximumVerticalGap: bearsLoad ? 0.22 : 0.14,
    weathering: binding.material === "stone" ? 0.12 : undefined,
    volume: part.kind === "box"
      ? interiorBack
        // A non-colliding optical back plane, not a 120 mm timber block.
        ? part.size[0] * part.size[1] * 0.002
        : part.size[0] * part.size[1] * part.size[2]
      : undefined,
  } as const;
}

function addPart(
  groups: VirginLandsPalaceWorldGroups,
  part: ObjectLabPart,
): void {
  const binding = bindingFor(part);
  const target = groups[binding.group];
  // Part ids are only unique inside an Object Lab semantic group (several
  // facades legitimately have `mullion-0`, `pane-0`, and so on). Keep that
  // namespace in the world id so the structural solver never folds distinct
  // accepted parts onto one another.
  const id = `virgin-lands-palace:${part.group}:${part.id}`;
  const options = commonOptions(part, binding);
  const interiorBack = part.material === "palace-interior-dark"
    && part.id.endsWith("interior-back");

  if (part.kind === "box") {
    if (part.rotation) {
      throw new Error(`${part.id}: rotated boxes require explicit adapter composition`);
    }
    primitive(
      target,
      id,
      binding.material,
      binding.shape,
      worldPoint(part.center),
      [...part.size],
      binding.colour,
      {
        ...options,
        rotation: [0, -VIRGIN_LANDS_PALACE_WORLD_YAW, 0],
        // Tiled exact-pitch contact boxes keep rotated long walls/slabs from
        // acquiring huge world-axis support corners that do not exist.
        contactBoxes: interiorBack
          ? interiorBackSupport(part)
          : boxContactTiles([...part.size]),
      },
    );
    return;
  }

  if (part.kind === "mesh") {
    const mesh = meshData(part);
    primitive(
      target,
      id,
      binding.material,
      "panel",
      worldPoint(mesh.centre),
      mesh.size,
      binding.colour,
      {
        ...options,
        rotation: [0, -VIRGIN_LANDS_PALACE_WORLD_YAW, 0],
        visualMesh: {
          vertices: mesh.vertices,
          indices: part.triangles.flatMap((triangle) => [...triangle]),
          doubleSided: part.doubleSided,
        },
        voxelization: { mode: "shell", thickness: 0.045, voxelSize: 0.16 },
        volume: Math.max(0.0005, mesh.area * 0.045),
      },
    );
    return;
  }

  const from = worldPoint(part.from);
  const to = worldPoint(part.to);
  const chord: SceneVector3 = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const length = Math.hypot(...chord);
  const transverse: SceneVector3 = Math.abs(chord[1] / length) < 0.9
    ? [0, 1, 0]
    : [Math.cos(VIRGIN_LANDS_PALACE_WORLD_YAW), 0,
      Math.sin(VIRGIN_LANDS_PALACE_WORLD_YAW)];
  const size: SceneVector3 = part.kind === "cylinder"
    ? [part.radius * 2, length, part.radius * 2]
    : [part.width, length, part.depth];
  primitive(
    target,
    id,
    binding.material,
    part.kind === "cylinder" ? "cylinder" : binding.shape,
    midpoint(from, to),
    size,
    binding.colour,
    {
      ...options,
      rotation: orient(transverse, chord),
      // Long beams are segmented by exact pitch for the same reason as the
      // slabs. Fins receive one centimetre of concealed mullion engagement;
      // visible accepted geometry remains untouched.
      contactBoxes: beamContactSegments(
        size,
        part.id.includes("fin-extension"),
      ),
      volume: part.kind === "cylinder"
        ? Math.PI * part.radius ** 2 * length
        : part.width * part.depth * length,
    },
  );
}

export function createAstanaVirginLandsPalace(
  groups: VirginLandsPalaceWorldGroups,
): void {
  if (virginLandsPalaceObject.revision !==
    VIRGIN_LANDS_PALACE_ACCEPTED_REVISION) {
    throw new Error(
      `Palace adapter expected ${VIRGIN_LANDS_PALACE_ACCEPTED_REVISION}, `
      + `received ${virginLandsPalaceObject.revision}`,
    );
  }
  for (const part of virginLandsPalaceObject.parts) {
    addPart(groups, part);
  }
}
