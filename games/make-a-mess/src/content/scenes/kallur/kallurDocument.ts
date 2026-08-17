import type {
  AuthoredSceneDocument,
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "../sceneContract.ts";
import type {
  LandscapeVisualDefinition,
  SceneVector3,
} from "../../../game/destructionScene.ts";
import {
  KALLUR_HERO_VIEW,
  KALLUR_PATH,
  KALLUR_SHORELINE,
} from "./kallurTerrainPlan.ts";
import {
  kallurEarthCellAt,
  kallurEarthMesh,
  kallurEarthPieceId,
  kallurGroundTopAt,
  kallurRenderMesh,
  kallurStones,
} from "./kallurLandscapeDocument.ts";
import { kallurVisibleStones } from "./kallurStoneField.ts";
import { generateKallurWallStrata } from "./kallurWallStrata.ts";
import { kallurLandscapeSampler } from "./kallurLandscapeDocument.ts";

/**
 * Kallur — the Faroe rest island (docs/kallur-brief.md).
 *
 * An indestructible world, like The Capital: the mountain, the turf and the
 * lighthouse are a place to be, not a thing to break. The terrain is one
 * continuous landscape field; these pieces are only its structural body and
 * the attachment ground for props.
 */

type MutableGroup = SceneGroupDefinition & { objects: SceneObjectDefinition[] };

const groups = new Map<string, MutableGroup>();

function group(
  id: string,
  label: string,
  material: SceneGroupDefinition["material"],
  supportMode: SceneGroupDefinition["supportMode"] = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) return existing;
  const created: MutableGroup = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

function primitive(
  target: MutableGroup,
  id: string,
  material: ScenePrimitiveDefinition["material"],
  shape: ScenePrimitiveDefinition["shape"],
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  overrides: Partial<Omit<ScenePrimitiveDefinition, "id" | "kind" | "material" | "shape" | "size" | "color" | "transform">> & {
    readonly rotation?: SceneVector3;
  } = {},
): void {
  const { rotation, ...rest } = overrides;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation },
    ...rest,
  });
}

const TERRAIN_BOTTOM = -24;
const terrain = group("terrain", "Deep island earth body", "earth");

// One bedrock slab under everything: the guaranteed owner for any render
// triangle whose centroid slips past the adaptive cell coverage at the coast.
const BEDROCK_PIECE_ID = "kallur:terrain:bedrock:piece";
primitive(
  terrain,
  "bedrock",
  "earth",
  "groundTile",
  [0, TERRAIN_BOTTOM - 3, 0],
  [252, 6, 236],
  "#4a4136",
  { foundation: true },
);

for (const cell of kallurEarthMesh.cells) {
  const [x, z] = cell.center;
  const half = cell.size / 2;
  const inset = Math.min(1.2, half * 0.4);
  // The smooth 0.75 m skin dips to the true field: a stepped box topped at
  // the CENTRE elevation would pierce it on every steep flank. Sink each box
  // under the lowest sampled corner instead; contact boxes climb back up.
  const corners = [
    kallurGroundTopAt(x - half + inset, z - half + inset),
    kallurGroundTopAt(x + half - inset, z - half + inset),
    kallurGroundTopAt(x - half + inset, z + half - inset),
    kallurGroundTopAt(x + half - inset, z + half - inset),
    kallurGroundTopAt(x, z),
  ];
  const earthTop = Math.min(...corners) - 0.2;
  const divisions = cell.size >= 8 ? 4 : 2;
  const contactSize = cell.size / divisions + 0.02;
  const pieceCenterY = (earthTop + TERRAIN_BOTTOM) / 2;
  primitive(
    terrain,
    `cell:${cell.id}`,
    "earth",
    "groundTile",
    [x, pieceCenterY, z],
    [cell.size, earthTop - TERRAIN_BOTTOM, cell.size],
    "#584a3a",
    {
      // The landscape trimesh owns the walkable surface; these boxes are the
      // structural body beneath it and the ground props attach to.
      intactVisible: false,
      intactCollider: false,
      foundation: true,
      carriesAttachments: true,
      contactBoxes: Array.from({ length: divisions }, (_, index) => index)
        .flatMap((indexX) =>
          Array.from({ length: divisions }, (_, index) => index)
            .map((indexZ) => {
              const localX = -half + (indexX + 0.5) * cell.size / divisions;
              const localZ = -half + (indexZ + 0.5) * cell.size / divisions;
              const top = kallurGroundTopAt(x + localX, z + localZ);
              return {
                position: [
                  localX,
                  top - 0.25 - pieceCenterY,
                  localZ,
                ] as SceneVector3,
                size: [contactSize, 0.5, contactSize] as SceneVector3,
              };
            })
        ),
      maximumVerticalGap: 1,
    },
  );
}

// Stones that break the sod (bible §III): every crown is bedded into its
// own turf collar, which the landscape field itself carries as a bump — the
// mesh never meets bare heightfield, only sod grown up around it. Light
// lichen-topped stones read as the bright speckle of the reference.
const boulders = group("boulders", "Boulders bedded in turf", "stone");
for (const stone of kallurVisibleStones(kallurStones)) {
  const collarTop = kallurGroundTopAt(stone.x, stone.z);
  const crownHeight = stone.size * (1 - stone.embed) * 0.9 + 0.15;
  const color = stone.tone > 0.72
    ? "#b9bdb4"
    : stone.tone > 0.35
      ? "#8f958d"
      : "#79807b";
  const tiltX = (stone.tone - 0.5) * 0.24;
  const tiltZ = (((stone.tone * 7) % 1) - 0.5) * 0.24;
  primitive(
    boulders,
    `${stone.id}:crown`,
    "stone",
    "stoneBlock",
    [stone.x, collarTop - 0.35 + (crownHeight + 0.35) / 2, stone.z],
    [stone.size * 0.92, crownHeight + 0.35, stone.size * 0.72],
    color,
    {
      rotation: [tiltX, stone.yaw, tiltZ],
      foundation: true,
      maximumVerticalGap: 1,
    },
  );
  if (stone.size >= 1.4) {
    // A big boulder is never one clean prism: a second mass leans on it.
    primitive(
      boulders,
      `${stone.id}:shoulder`,
      "stone",
      "stoneBlock",
      [
        stone.x + Math.cos(stone.yaw) * stone.size * 0.32,
        collarTop - 0.3 + (crownHeight * 0.62 + 0.3) / 2,
        stone.z + Math.sin(stone.yaw) * stone.size * 0.32,
      ],
      [stone.size * 0.6, crownHeight * 0.62 + 0.3, stone.size * 0.5],
      color === "#b9bdb4" ? "#8f958d" : color,
      {
        rotation: [tiltZ, stone.yaw + 0.7, tiltX],
        foundation: true,
        maximumVerticalGap: 1,
      },
    );
  }
}

// The wall's layered cliff character: courses anchored to the field, grass
// ledges on random layers, a ragged sod lip over the top course (bible §I:
// the turf-to-rock seam is designed, never a straight accidental line).
const STRATA_TONES = ["#3d4442", "#474e48", "#525750", "#5d615c", "#6d7165"];
const wall = group("wall-strata", "Layered seaward cliff of the crown", "stone");
for (const layer of generateKallurWallStrata(kallurLandscapeSampler)) {
  primitive(
    wall,
    layer.id,
    layer.turf ? "grass" : "stone",
    layer.turf ? "groundTile" : "stoneBlock",
    [layer.x, layer.y, layer.z],
    [layer.along, layer.height, layer.depth],
    layer.turf
      ? "#757641"
      : STRATA_TONES[Math.floor(layer.tone * STRATA_TONES.length) % STRATA_TONES.length],
    {
      rotation: [0, layer.yaw, 0],
      foundation: true,
      maximumVerticalGap: 1,
    },
  );
}

export const kallurLandscapeVisual: LandscapeVisualDefinition = {
  material: "grass",
  color: "#6d7046",
  landscapeSurface: "kallur-ground",
  chunks: kallurRenderMesh.chunks.map((chunk) => {
    const triangleOwners = chunk.triangles.map((triangle) => {
      const [a, b, c] = triangle;
      const centroidX = (
        chunk.vertices[a][0] + chunk.vertices[b][0] + chunk.vertices[c][0]
      ) / 3;
      const centroidZ = (
        chunk.vertices[a][2] + chunk.vertices[b][2] + chunk.vertices[c][2]
      ) / 3;
      const cell = kallurEarthCellAt(centroidX, centroidZ);
      return cell ? kallurEarthPieceId(cell.id) : BEDROCK_PIECE_ID;
    });
    return {
      id: chunk.id,
      vertices: chunk.vertices,
      normals: chunk.normals,
      indices: chunk.triangles.flatMap((triangle) => [...triangle]),
      triangleOwners,
      ownerPieceIds: [...new Set(triangleOwners)],
    };
  }),
};

const spawn = KALLUR_PATH[0];

export const kallurDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "kallur",
  title: "Make a Mess: Kallur",
  environment: "town",
  world: {
    playerSpawn: [spawn[0], spawn[1] + 1.2, spawn[2]],
    // 0 looks toward -Z: from the south coast straight at the hill and wall.
    playerSpawnYaw: 0,
    cameraFar: 560,
    center: [4, -2],
    halfExtents: [114, 106],
    boundaryRadius: 126,
    skyRadius: 300,
    radius: 118,
    edgeBoundary: KALLUR_SHORELINE,
    safetyFloorY: -20,
  },
  copy: {
    status: "Make a Mess / Kallur",
    eyebrow: "Rest island 001",
    heading: "Остров, где ничего не ломается.",
    ready: "Каллур собран",
    loading: "Поднимаем гору из тумана…",
    description:
      "Фарерский остров отдыха: гигантский травяной склон против отвесной " +
      "слоистой стены, нож хребта с тропой и крошечный маяк над туманным " +
      "морем. Здесь ничего не разрушается — сюда приходят смотреть, ходить " +
      "и сидеть на камнях.",
    enter: "Сойти на тропу",
    returnToGame: "Вернуться на остров",
    reset: "Вернуться на тропу",
  },
  landscapeVisual: kallurLandscapeVisual,
  groups: [...groups.values()],
  indestructible: true,
  fogDistances: [160, 430],
  solarFrame: {
    model: "equinox",
    latitudeDegrees: 62.3,
    east: [1, 0],
    north: [0, -1],
  },
};

export const kallurHeroView = KALLUR_HERO_VIEW;
