import { deKatObject } from "../../objects/dutchWindmills/deKatObject.ts";
import { gekroondePoelenburgPaltrokObject } from "../../objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";
import { jongeSchaapSawmillObject } from "../../objects/dutchWindmills/jongeSchaapSawmillObject.ts";
import type { ObjectLabModel } from "../../objects/dutchWindmills/objectModel.ts";
import { oudegeinWipmolenObject } from "../../objects/dutchWindmills/oudegeinWipmolenObject.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
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
  DUTCH_POLDER_BRIDGE_SEATS,
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_OBJECT_RESERVES,
  DUTCH_POLDER_ROUTES,
  DUTCH_POLDER_SHORELINE,
  dutchPolderChannelAt,
  dutchPolderChannelDistance,
  dutchPolderDistanceToSegment,
  dutchPolderGroundTopAt,
  dutchPolderLandAt,
  type DutchPolderChannel,
  type DutchPolderPoint2,
} from "./dutchPolderTerrainGraybox.ts";
import {
  DUTCH_POLDER_TERRAIN_COVER_DEPTH,
  dutchPolderCoverCells,
  dutchPolderCoverCellId,
  dutchPolderCoverPieceId,
  dutchPolderLandscapeDocument,
  dutchPolderLandscapeMesh,
  dutchPolderVisualTopAt,
} from "./dutchPolderLandscapeDocument.ts";

type Placement = {
  readonly id: string;
  readonly prefab: string;
  readonly position: SceneVector3;
  readonly bearing: number;
  readonly model?: ObjectLabModel;
};

const groups = new Map<string, SceneGroupDefinition & { objects: SceneObjectDefinition[] }>();

function group(id: string, label: string, material: SceneGroupDefinition["material"], supportMode: SceneGroupDefinition["supportMode"] = "stack") {
  const existing = groups.get(id);
  if (existing) return existing;
  const created = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

function primitive(
  target: ReturnType<typeof group>,
  id: string,
  material: ScenePrimitiveDefinition["material"],
  shape: ScenePrimitiveDefinition["shape"],
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  rotation?: SceneVector3,
  overrides: Partial<ScenePrimitiveDefinition> = {},
) {
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation },
    ...overrides,
  });
}

function prefab(
  target: ReturnType<typeof group>,
  id: string,
  prefabId: string,
  position: SceneVector3,
  rotation?: SceneVector3,
  scale?: SceneVector3,
  surface?: Extract<SceneObjectDefinition, { kind: "prefab" }>["surface"],
) {
  target.objects.push({
    kind: "prefab",
    id,
    prefab: prefabId,
    transform: { position, rotation, scale },
    surface,
  });
}

const TERRAIN_BOTTOM = -8.4;
const TERRAIN_COVER_DEPTH = DUTCH_POLDER_TERRAIN_COVER_DEPTH;
const TERRAIN_COVER_COLOR = "#718651";
const terrain = group("terrain", "Deep local polder earth", "earth");
const terrainSurface = group("terrain-surface", "Local turf and path cover", "grass");
const shorelineSkirt = group("shoreline-skirt", "Irregular floating-island edge", "earth");
const landscapeSampler = createLandscapeSampler(dutchPolderLandscapeDocument);

for (const cell of dutchPolderLandscapeMesh.cells) {
  const [x, z] = cell.center;
  const top = cell.elevation;
  const earthTop = top - TERRAIN_COVER_DEPTH;
  primitive(
    terrain,
    `cell:${cell.id}`,
    "earth",
    "groundTile",
    [x, (earthTop + TERRAIN_BOTTOM) / 2, z],
    [cell.size + 0.04, earthTop - TERRAIN_BOTTOM, cell.size + 0.04],
    top > 4 ? "#594a38" : top > 1.2 ? "#62523f" : "#6b5a43",
    undefined,
    {
      foundation: true,
      carriesAttachments: true,
      maximumVerticalGap: 0.24,
    },
  );
}

for (const cell of dutchPolderCoverCells) {
  const proxyY = cell.center[1] - TERRAIN_COVER_DEPTH / 2;
  const relief = Math.max(...cell.vertices.map((vertex) => vertex[1])) -
    Math.min(...cell.vertices.map((vertex) => vertex[1]));
  const contactDivisions = relief > 0.65 ? 4 : 2;
  const contactSize = cell.size / contactDivisions + 0.02;
  primitive(
    terrainSurface,
    `cover:${cell.id}`,
    "grass",
    "groundTile",
    [cell.center[0], proxyY, cell.center[2]],
    [cell.size + 0.04, TERRAIN_COVER_DEPTH, cell.size + 0.04],
    TERRAIN_COVER_COLOR,
    undefined,
    {
      // LandscapeSurface owns the intact mesh/collider. This fixed-lattice
      // proxy only owns local damage and materialises carved remnants.
      intactVisible: false,
      intactCollider: false,
      // Four small bearing boxes follow the two-metre triangle closely enough
      // that trees and fixtures meet the visible slope instead of a fictitious
      // flat top at the quad's average height.
      contactBoxes: Array.from({ length: contactDivisions }, (_, index) => index)
        .flatMap((indexX) =>
          Array.from({ length: contactDivisions }, (_, index) => index)
            .map((indexZ) => {
          const localX = -cell.size / 2 +
            (indexX + 0.5) * cell.size / contactDivisions;
          const localZ = -cell.size / 2 +
            (indexZ + 0.5) * cell.size / contactDivisions;
          const top = dutchPolderVisualTopAt(
            cell.center[0] + localX,
            cell.center[2] + localZ,
          );
          return {
            position: [
              localX,
              top - TERRAIN_COVER_DEPTH / 2 - proxyY,
              localZ,
            ] as SceneVector3,
            size: [
              contactSize,
              TERRAIN_COVER_DEPTH,
              contactSize,
            ] as SceneVector3,
          };
            })
        ),
      volume: cell.size ** 2 * TERRAIN_COVER_DEPTH,
      landscapeSurface: "dutch-polder-ground",
      carriesAttachments: true,
      // A smoothed shell can bridge almost one metre above the stepped earth
      // at a sharp adaptive transition; it is still structurally carried by
      // that earth rather than becoming an artificial foundation.
      maximumVerticalGap: 1,
    },
  );
}

const coverPieceByOrigin = new Map(
  dutchPolderCoverCells.map((cell) => [
    dutchPolderCoverCellId(cell.vertices[0][0], cell.vertices[0][2]),
    dutchPolderCoverPieceId(cell.id),
  ]),
);

export const dutchPolderLandscapeVisual: LandscapeVisualDefinition = {
  material: "grass",
  color: TERRAIN_COVER_COLOR,
  landscapeSurface: "dutch-polder-ground",
  destructionShell: {
    depth: TERRAIN_COVER_DEPTH,
    material: "earth",
    color: "#62523f",
  },
  chunks: dutchPolderLandscapeMesh.chunks.map((chunk) => {
    const pitch = dutchPolderLandscapeMesh.minimumCellSize;
    const triangleOwners: string[] = [];
    const shellEdges: NonNullable<LandscapeVisualDefinition["chunks"][number]["shellEdges"]>[number][] = [];
    for (let offset = 0; offset < chunk.vertices.length; offset += 4) {
      const [a, b, c, d] = chunk.vertices.slice(offset, offset + 4);
      if (!a || !b || !c || !d) continue;
      const ownerPieceId = dutchPolderCoverPieceId(
        dutchPolderCoverCellId(a[0], a[2]),
      );
      triangleOwners.push(ownerPieceId, ownerPieceId);
      const neighbors = [
        [dutchPolderCoverCellId(a[0], a[2] - pitch), a, b],
        [dutchPolderCoverCellId(a[0] + pitch, a[2]), b, c],
        [dutchPolderCoverCellId(a[0], a[2] + pitch), c, d],
        [dutchPolderCoverCellId(a[0] - pitch, a[2]), d, a],
      ] as const;
      for (const [neighborId, start, end] of neighbors) {
        const neighborPieceId = coverPieceByOrigin.get(neighborId);
        if (!neighborPieceId) continue;
        shellEdges.push({ start, end, ownerPieceId, neighborPieceId });
      }
    }
    const ownerPieceIds = [...new Set([
      ...triangleOwners,
      ...shellEdges.map((edge) => edge.neighborPieceId),
    ])];
    return {
      id: chunk.id,
      vertices: chunk.vertices,
      normals: chunk.normals,
      indices: chunk.triangles.flatMap((triangle) => [...triangle]),
      triangleOwners,
      ownerPieceIds,
      shellEdges,
    };
  }),
};

// The cliff follows the accepted 18-point shoreline rather than a circular
// WorldEdge ring.  Short panels preserve the irregular outline and are omitted
// at channel mouths so the future waterfall/water system inherits a real open
// prism instead of having to punch through decorative cliff geometry.
const islandCenter: DutchPolderPoint2 = [0.55, 2.17];
for (const [edgeIndex, from] of DUTCH_POLDER_SHORELINE.entries()) {
  const to = DUTCH_POLDER_SHORELINE[(edgeIndex + 1) % DUTCH_POLDER_SHORELINE.length];
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const edgeLength = Math.hypot(dx, dz);
  const slices = Math.max(1, Math.ceil(edgeLength / 3));
  const tangent: DutchPolderPoint2 = [dx / edgeLength, dz / edgeLength];
  const edgeMidpoint: DutchPolderPoint2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const inwardLength = Math.hypot(islandCenter[0] - edgeMidpoint[0], islandCenter[1] - edgeMidpoint[1]);
  const inward: DutchPolderPoint2 = [
    (islandCenter[0] - edgeMidpoint[0]) / inwardLength,
    (islandCenter[1] - edgeMidpoint[1]) / inwardLength,
  ];
  const yaw = -Math.atan2(tangent[1], tangent[0]);

  for (let slice = 0; slice < slices; slice += 1) {
    const t0 = slice / slices;
    const t1 = (slice + 1) / slices;
    const tm = (t0 + t1) / 2;
    const x = from[0] + dx * tm;
    const z = from[1] + dz * tm;
    if (DUTCH_POLDER_CHANNELS.some((channel) =>
      dutchPolderChannelDistance(x, z, channel) <= channel.width / 2 + 3.2
    )) continue;

    const top = dutchPolderGroundTopAt(x + inward[0] * 1.1, z + inward[1] * 1.1);
    // The skirt is a vertical earth face, never a second ground surface. Its
    // top stays below the real turf/deep-earth seam so the two materials
    // cannot z-fight along the irregular shoreline.
    const skirtTop = top - TERRAIN_COVER_DEPTH - 0.06;
    primitive(
      shorelineSkirt,
      `cliff:${edgeIndex}:${slice}`,
      "earth",
      "groundTile",
      [x + inward[0] * 1.1, (skirtTop - 15) / 2, z + inward[1] * 1.1],
      // Exact butt joint: overlap made neighbouring coplanar cliff faces
      // fight for the same depth pixels and shimmer while the camera moved.
      [edgeLength / slices, skirtTop + 15, 2.5],
      edgeIndex % 3 === 0 ? "#554536" : edgeIndex % 3 === 1 ? "#5e4b39" : "#634f3b",
      [0, yaw, 0],
      { maximumVerticalGap: 0.22 },
    );
  }
}

// Channels are now part of the continuous heightfield: bed, bank and terrace
// share one surface. Water remains absent until a later hydrology pass.
const channelSegmentFrames: Array<{
  readonly channel: DutchPolderChannel;
  readonly index: number;
  readonly midpoint: DutchPolderPoint2;
  readonly length: number;
  readonly yaw: number;
  readonly tangent: DutchPolderPoint2;
}> = [];

for (const channel of DUTCH_POLDER_CHANNELS) {
  for (let index = 1; index < channel.points.length; index += 1) {
    const from = channel.points[index - 1];
    const to = channel.points[index];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const midpoint: DutchPolderPoint2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const yaw = Math.atan2(dx, dz);
    channelSegmentFrames.push({
      channel,
      index: index - 1,
      midpoint,
      length,
      yaw,
      tangent: [dx / length, dz / length],
    });
  }
}

// The route itself is a colour/elevation mask in the landscape sampler. Only
// sparse stones remain as cheap physical confirmation at the path edges.
const pathMarkers = group("path-markers", "Sparse path edge stones", "stone", "mounted");
for (const route of DUTCH_POLDER_ROUTES) {
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1];
    const to = route.points[index];
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const horizontal = Math.hypot(dx, dz);
    const tangentX = dx / horizontal;
    const tangentZ = dz / horizontal;
    const normalX = -tangentZ;
    const normalZ = tangentX;
    const markers = Math.floor(horizontal / 7.5);
    for (let marker = 0; marker < markers; marker += 1) {
      const t = (marker + 0.5) / markers;
      const side = (marker + index) % 2 === 0 ? -1 : 1;
      const x = from[0] + dx * t + normalX * side * 1.36;
      const z = from[2] + dz * t + normalZ * side * 1.36;
      const y = landscapeSampler.sample(x, z).elevation;
      primitive(
        pathMarkers,
        `${route.id}:${index - 1}:${marker}`,
        "stone",
        "stoneBlock",
        [x, y + 0.1, z],
        [0.28 + (marker % 3) * 0.06, 0.18, 0.22 + ((marker + 1) % 3) * 0.05],
        marker % 2 === 0 ? "#756c5c" : "#625d52",
        [0, Math.atan2(tangentX, tangentZ) + marker * 0.31, 0],
        {
          foundation: true,
          bearsLoad: false,
          carriesAttachments: false,
          maximumVerticalGap: 0.35,
        },
      );
    }
  }
}

function closestChannelFrame(position: DutchPolderPoint2, channelId: string) {
  return channelSegmentFrames
    .filter(({ channel }) => channel.id === channelId)
    .sort((left, right) =>
      dutchPolderDistanceToSegment(position[0], position[1], left.channel.points[left.index], left.channel.points[left.index + 1])
      - dutchPolderDistanceToSegment(position[0], position[1], right.channel.points[right.index], right.channel.points[right.index + 1])
    )[0];
}

const bridges = group("bridges", "Kwakel bridges", "wood");
const revetments = group("revetments", "Timber canal revetments", "wood");
for (const bridge of DUTCH_POLDER_BRIDGE_SEATS) {
  const frame = closestChannelFrame(bridge.position, bridge.channelId);
  const normal: DutchPolderPoint2 = [-frame.tangent[1], frame.tangent[0]];
  const bridgeYaw = Math.atan2(normal[0], normal[1]);
  prefab(
    bridges,
    bridge.id,
    "dutch:landscape:bridge",
    [bridge.position[0], bridge.bankY - 0.78, bridge.position[1]],
    [0, bridgeYaw, 0],
    undefined,
    [{ kind: "damp", amount: 0.35 }, { kind: "moss", amount: 0.16 }],
  );
  for (const side of [-1, 1] as const) {
    const landward: DutchPolderPoint2 = [normal[0] * side, normal[1] * side];
    const offset = frame.channel.width / 2 + 0.12;
    prefab(
      revetments,
      `${bridge.id}:bank:${side}`,
      "dutch:landscape:revetment",
      [bridge.position[0] + landward[0] * offset, 0, bridge.position[1] + landward[1] * offset],
      [0, Math.atan2(landward[0], landward[1]), 0],
      [0.7, 1, 1],
      [{ kind: "damp", amount: 0.8 }, { kind: "moss", amount: 0.28 }],
    );
  }
}

const placements: readonly Placement[] = [
  { id: "m1", prefab: "dutch:m1-de-kat", position: [2, 5.2, -13], bearing: 168, model: deKatObject },
  { id: "m2", prefab: "dutch:m2-oudegein", position: [-40, 2.4, -25], bearing: 152, model: oudegeinWipmolenObject },
  { id: "m3", prefab: "dutch:m3-jonge-schaap", position: [36, 2.8, -28], bearing: 194, model: jongeSchaapSawmillObject },
  { id: "m4", prefab: "dutch:m4-poelenburg", position: [50, 1.9, 4], bearing: 205, model: gekroondePoelenburgPaltrokObject },
  { id: "h1", prefab: "dutch:h1-zaan-house", position: [-50, 2.25, 4], bearing: 128 },
  { id: "h2", prefab: "dutch:h2-stolp-farm", position: [31, 1.45, 29], bearing: 206 },
];

const rotorFacings = placements.flatMap((placement) => {
  const axis = placement.model?.rotor?.axis;
  if (!axis) return [];
  const yaw = Math.PI - placement.bearing * Math.PI / 180;
  return [[
    axis[0] * Math.cos(yaw) + axis[2] * Math.sin(yaw),
    -axis[0] * Math.sin(yaw) + axis[2] * Math.cos(yaw),
  ] as const];
});
const rotorFacingSum = rotorFacings.reduce(
  ([x, z], facing) => [x + facing[0], z + facing[1]] as const,
  [0, 0] as const,
);
const rotorFacingLength = Math.hypot(...rotorFacingSum) || 1;
/** True east is authored toward the average front normal of all four rotors. */
export const DUTCH_POLDER_EAST_VECTOR = [
  rotorFacingSum[0] / rotorFacingLength,
  rotorFacingSum[1] / rotorFacingLength,
] as const;
export const DUTCH_POLDER_NORTH_VECTOR = [
  -DUTCH_POLDER_EAST_VECTOR[1],
  DUTCH_POLDER_EAST_VECTOR[0],
] as const;

for (const placement of placements) {
  const yaw = Math.PI - placement.bearing * Math.PI / 180;
  if (placement.model?.rotor) {
    const fixed = group(`${placement.id}-fixed`, `${placement.model.title} — fixed`, "wood");
    const rotor = group(`${placement.id}-rotor`, `${placement.model.title} — static sails`, "wood", "linked");
    prefab(fixed, placement.id, `${placement.prefab}:fixed`, placement.position, [0, yaw, 0]);
    prefab(rotor, placement.id, `${placement.prefab}:rotor`, placement.position, [0, yaw, 0]);
  } else {
    const buildings = group("houses", "Polder houses", "wood");
    prefab(
      buildings,
      placement.id,
      `${placement.prefab}:fixed`,
      placement.position,
      [0, yaw, 0],
      undefined,
      [{ kind: "damp", amount: 0.2 }, { kind: "moss", amount: 0.08 }],
    );
  }
}

export const DUTCH_POLDER_FIELD_PLACEMENTS = [
  { id: "west-red", position: [-55, 0.84, 30] as SceneVector3, yaw: -0.18, scale: [1, 1, 1.35] as SceneVector3 },
  { id: "west-yellow", position: [-45, 0.84, 25] as SceneVector3, yaw: 0.16, scale: [1, 1, 1.2] as SceneVector3 },
  { id: "south-purple", position: [-22, 0.84, 39] as SceneVector3, yaw: -0.04, scale: [1.2, 1, 1.55] as SceneVector3 },
  { id: "south-blue", position: [-12, 0.84, 45] as SceneVector3, yaw: 0.1, scale: [1, 1, 1.15] as SceneVector3 },
  { id: "middle-yellow", position: [14, 1.02, 36] as SceneVector3, yaw: -0.12, scale: [1.15, 1, 1.45] as SceneVector3 },
  { id: "farm-purple", position: [13, 1.5, 25] as SceneVector3, yaw: 0.08, scale: [0.95, 1, 1.1] as SceneVector3 },
  { id: "east-blue", position: [46, 1.5, 40] as SceneVector3, yaw: -0.24, scale: [1.05, 1, 1.15] as SceneVector3 },
] as const;

const fields = group("flower-fields", "Raised flower beds", "soil");
for (const field of DUTCH_POLDER_FIELD_PLACEMENTS) {
  prefab(fields, field.id, "dutch:landscape:field-bed", field.position, [0, field.yaw, 0], field.scale);
}

const masonry = group("retaining-masonry", "Coursed field retaining walls", "stone");
for (const wall of [
  { id: "west-terrace-a", at: [-28, 0.82, 5] as SceneVector3, yaw: 0.08 },
  { id: "west-terrace-b", at: [-23.2, 0.82, 5.4] as SceneVector3, yaw: 0.08 },
  { id: "crown-south-a", at: [-9.5, 3.68, 5.7] as SceneVector3, yaw: -0.08 },
  { id: "crown-south-b", at: [-4.6, 3.68, 5.3] as SceneVector3, yaw: -0.08 },
  { id: "farm-bank", at: [42, 0.12, 21] as SceneVector3, yaw: 0.52 },
]) {
  prefab(masonry, wall.id, "dutch:landscape:retaining-wall", wall.at, [0, wall.yaw, 0], undefined, [
    { kind: "damp", amount: 0.45 },
    { kind: "moss", amount: 0.32 },
  ]);
}

const fieldEdges = group("field-edges", "Fences and hedgerows", "wood");
for (const edge of [
  { id: "west-fence-a", prefab: "dutch:landscape:field-fence", x: -53, z: 21, yaw: -0.12 },
  { id: "west-fence-b", prefab: "dutch:landscape:field-fence", x: -47, z: 20.3, yaw: -0.12 },
  { id: "south-hedge-a", prefab: "dutch:landscape:hedgerow", x: -25, z: 49, yaw: 0.04 },
  { id: "south-hedge-b", prefab: "dutch:landscape:hedgerow", x: -19, z: 49.2, yaw: 0.04 },
  { id: "farm-fence-a", prefab: "dutch:landscape:field-fence", x: 17, z: 18.5, yaw: -0.08 },
  { id: "farm-fence-b", prefab: "dutch:landscape:field-fence", x: 23, z: 18, yaw: -0.08 },
  { id: "east-hedge-a", prefab: "dutch:landscape:hedgerow", x: 45, z: 46, yaw: -0.22 },
  { id: "east-hedge-b", prefab: "dutch:landscape:hedgerow", x: 50.8, z: 44.7, yaw: -0.22 },
]) {
  prefab(
    fieldEdges,
    edge.id,
    edge.prefab,
    [edge.x, landscapeSampler.sample(edge.x, edge.z).elevation + 0.08, edge.z],
    [0, edge.yaw, 0],
    undefined,
    [{ kind: "damp", amount: 0.22 }, { kind: "moss", amount: 0.12 }],
  );
}

const willows = group("pollard-willows", "Channel broadleaf trees", "wood", "mounted");
for (const [index, [x, z, yaw]] of [
  [-61, 22, 0.15], [-57.5, -11, -0.2], [-31, 47, 0.6],
  [20, 49, -0.35], [57, -27, -0.5],
  // Irregular channel-side groups. These sit on the upper terrace rather than
  // in the exposed bed, and stay clear of bridge seats, routes and mill pads.
  [-25.1, 18.1, 2.83], [-22.4, 4.1, 3.11], [-16.3, 19.3, 3.48],
  [-5.3, 7.1, 3.85], [30.2, 3.2, 5.42], [-38.3, 41.1, 2.89],
  [11.6, 19.9, 2.2], [-0.7, 23, 2.48], [11.9, 31.2, 2.85],
  [-1.2, 38.4, 3.22], [58.6, 22.4, 3.83],
].entries()) {
  prefab(
    willows,
    `willow:${index}`,
    `core:oak:${71 + index % 3}`,
    // The fixed turf shell is now the real intact support and collider. Roots
    // must meet that visible triangle, not the stepped earth body below it.
    [x, dutchPolderVisualTopAt(x, z) - 0.04, z],
    [0, yaw, 0],
    [0.9 + (index % 3) * 0.08, 0.92 + (index % 2) * 0.1, 0.9 + (index % 3) * 0.08],
    [{ kind: "damp", amount: 0.3 }, { kind: "moss", amount: 0.18 }],
  );
}

export const dutchPolderDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "dutch-polder",
  title: "Make a Mess: Dutch Polder",
  environment: "town",
  world: {
    playerSpawn: [0, 2.1, 50],
    playerSpawnYaw: 0,
    cameraFar: 250,
    center: [0.55, 2.17],
    halfExtents: [77, 61],
    boundaryRadius: 79,
    radius: 79,
    edgeBoundary: DUTCH_POLDER_SHORELINE,
    skyRadius: 220,
    safetyFloorY: -16,
  },
  copy: {
    status: "Make a Mess / Dutch Polder",
    eyebrow: "Polder world test 001",
    heading: "Мельницы — механизмы.",
    ready: "Польдер собран",
    loading: "Поднимаем остров…",
    description:
      "Неровный голландский польдер в натуральном масштабе: четыре конструктивно разные мельницы, два типа домов, каналы с зарезервированным уровнем воды, пять настоящих мостов, грядки, береговые крепления, кладка и сухие дорожки. Ветер и настоящая вода намеренно не включены; лопасти временно статичны до отдельной оптимизации механизма.",
    enter: "Войти в польдер",
    returnToGame: "Вернуться на остров",
    reset: "Восстановить польдер",
  },
  landscapeVisual: dutchPolderLandscapeVisual,
  groups: [...groups.values()],
  fogDistances: [118, 225],
  solarFrame: {
    model: "equinox",
    latitudeDegrees: 52.4,
    east: DUTCH_POLDER_EAST_VECTOR,
    north: DUTCH_POLDER_NORTH_VECTOR,
  },
};

export const DUTCH_POLDER_OBJECT_PLACEMENTS = placements;
export const dutchPolderFieldIsClear = (x: number, z: number, radius = 3.6) =>
  dutchPolderLandAt(x, z)
  && !dutchPolderChannelAt(x, z)
  && DUTCH_POLDER_CHANNELS.every((channel) => dutchPolderChannelDistance(x, z, channel) > channel.width / 2 + radius)
  && DUTCH_POLDER_OBJECT_RESERVES.every((reserve) => Math.hypot(x - reserve.position[0], z - reserve.position[1]) > reserve.radius + radius);
