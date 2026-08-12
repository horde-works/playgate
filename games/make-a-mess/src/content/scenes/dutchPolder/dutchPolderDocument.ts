import type { ObjectLabModel } from "../../objects/dutchWindmills/objectModel.ts";
import { createLandscapeSampler } from "../../landscape/landscapeSampler.ts";
import { WATER_LEVEL } from "../../../game/dutchPolderWaterModel.ts";
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
  DUTCH_POLDER_BUILDING_PLOTS,
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_ROUTES,
  DUTCH_POLDER_SHORELINE,
  dutchPolderChannelAt,
  dutchPolderChannelDistance,
  dutchPolderDistanceToSegment,
  dutchPolderGroundTopAt,
  dutchPolderLandAt,
  dutchPolderKeepOut,
  dutchPolderPlot,
  dutchPolderPlotToWorld,
  dutchPolderPlotYaw,
  dutchPolderRectDistance,
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
    // Ровно размер клетки. Сетка ландшафта согласованная: размеры 2/4/8 м на
    // выровненных центрах, соседи примыкают точно. Нахлёст в 4 см ничего не
    // закрывал, зато делал общими и верхние плоскости, и боковые грани
    // соседних клеток — а по бортам каналов и на уступах эти боковины видно,
    // и они спорили за пиксели на любом удалении.
    [cell.size, earthTop - TERRAIN_BOTTOM, cell.size],
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
    bridge.id === "B1" || bridge.id === "B3" || bridge.id === "B5"
      ? `dutch:landscape:bridge-lit-${bridge.id.toLowerCase()}`
      : "dutch:landscape:bridge",
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

const PREFAB_BY_OBJECT: Record<string, string> = {
  m1: "dutch:m1-de-kat",
  m2: "dutch:m2-oudegein",
  m3: "dutch:m3-jonge-schaap",
  m4: "dutch:m4-poelenburg",
  h1: "dutch:h1-zaan-house",
  h2: "dutch:h2-stolp-farm",
};

// Position, bearing and datum come from the building-plot contract, so the
// object, its levelled ground and its keep-out circle cannot drift apart.
const placements: readonly Placement[] = DUTCH_POLDER_BUILDING_PLOTS.map((plot) => ({
  id: plot.objectId,
  prefab: PREFAB_BY_OBJECT[plot.objectId],
  position: [plot.origin[0], plot.elevation, plot.origin[1]] as SceneVector3,
  bearing: plot.bearing,
  model: plot.model,
}));

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
/**
 * True east is authored AWAY from the average front normal of the four rotors,
 * because a Dutch mill turns its cap to face the wind and the wind over the
 * Low Countries is a westerly. That is the whole of the reasoning, and it is
 * not a convenience: it is why every photograph of Kinderdijk at dusk has the
 * sails presented flat to the camera with the sun going down behind it.
 *
 * It used to point the other way, and the cost was exact rather than a matter
 * of taste — the sun's direction dotted with the rotor face read +0.97 at
 * dawn and −1.00 at sunset. The mills were lit square-on at first light and
 * stood as flat black cut-outs for the entire golden hour, every day, in the
 * one world built around them.
 */
export const DUTCH_POLDER_EAST_VECTOR = [
  -rotorFacingSum[0] / rotorFacingLength,
  -rotorFacingSum[1] / rotorFacingLength,
] as const;
export const DUTCH_POLDER_NORTH_VECTOR = [
  -DUTCH_POLDER_EAST_VECTOR[1],
  DUTCH_POLDER_EAST_VECTOR[0],
] as const;

/**
 * The bearing the cloud deck drifts along, in world x/z radians.
 *
 * A westerly is one wind. It is what the mills are turned into and it is what
 * carries the deck, so it is one number here rather than two that happened to
 * be authored eight weeks apart — the old pair disagreed by seventy-one
 * degrees, which is a sky whose weather comes from somewhere the mills have
 * never heard of. `tests/sky-weather` holds them together.
 */
export const DUTCH_POLDER_WIND_BEARING = Math.atan2(
  DUTCH_POLDER_EAST_VECTOR[1],
  DUTCH_POLDER_EAST_VECTOR[0],
);

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

// Beds sit on the ground the landscape actually renders. Three of the seven
// authored elevations disagreed with it — `middle-yellow` was buried 0.43 m and
// `farm-purple` floated 0.22 m — so the datum is sampled, never typed.
// `west-red` stood where the Zaan house now stands and `west-yellow` inside its
// yard; bulb parcels belong to the open polder, so both are dropped here rather
// than nudged, and the western field pattern is re-cut with the hamlet.
export const DUTCH_POLDER_FIELD_PLACEMENTS = ([
  { id: "south-purple", at: [-22, 39], yaw: -0.04, scale: [1.2, 1, 1.55] as SceneVector3 },
  { id: "south-blue", at: [-12, 45], yaw: 0.1, scale: [1, 1, 1.15] as SceneVector3 },
  { id: "middle-yellow", at: [11, 38], yaw: -0.12, scale: [1.15, 1, 1.45] as SceneVector3 },
  { id: "farm-purple", at: [13, 25], yaw: 0.08, scale: [0.95, 1, 1.1] as SceneVector3 },
  { id: "east-blue", at: [46, 40], yaw: -0.24, scale: [1.05, 1, 1.15] as SceneVector3 },
] as const).map((field) => ({
  ...field,
  position: [
    field.at[0],
    dutchPolderVisualTopAt(field.at[0], field.at[1]),
    field.at[1],
  ] as SceneVector3,
}));

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
  // The two western field fences ran straight through the new house plot. The
  // parcel gets its own edge with the yard; a field fence is not a garden fence.
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
/**
 * Головчатые ивы стоят РЯДОМ по дальнему берегу главной канавы, а не россыпью.
 *
 * Knotwilg сажают не как дерево, а как межу: живая граница участка, крепление
 * откоса и делянка прута разом. Читается такая посадка ритмом — линия с шагом в
 * пять-восемь метров, — и россыпь, которая была здесь раньше, не читалась ею
 * никак: замер дал шаги 8, 44 и 30 метров, а четыре ивы из одиннадцати стояли
 * дальше восьми метров от любой воды, одна — в сорока трёх, на сухом бугре, где
 * иве попросту нечем жить.
 *
 * Берег выбран ДАЛЬНИЙ намеренно. Двор дома h1 теперь выходит на воду с этой
 * стороны, и ряд по его бровке встал бы стеной в четырёх метрах перед парадной
 * дверью. Межу метят по границе участка, а не перед собственным крыльцом; к
 * своей канаве надо подходить, причаливать и косить. Ближайшая ива к любому
 * дверному проёму — 14.2 м.
 *
 * Разрывы в ряду не случайны: он рвётся там, где к воде выходят люди — у мостов
 * и мельничных площадок. Расстояния проверены по скомпилированной сцене, а не
 * на глаз.
 *
 * Каждая точка ОБЯЗАНА стоять на настоящем грунте: проверяется тем же
 * `dutchPolderCoverPieceIdAt`, которым пользуется рассев растительности, и не
 * в одной точке, а по квадрату 3.2 м вокруг ствола. Одна ива без этой проверки
 * встала в семидесяти двух метрах от центра, за кромкой суши, и сцена
 * отказалась стартовать с девяноста пятью неопёртыми кусками — деревом целиком.
 */
const POLLARD_ROW: readonly (readonly [number, number, number])[] = [
  [-65.1, 9.1, 2.74], [-59.0, 7.1, 1.12], [-51.3, 6.1, 4.05],
  [-33.5, 7.6, 5.61], [-25.9, 6.0, 2.2], [-19.5, 6.2, 3.88],
  [10.8, 7.4, 0.94], [24.1, 4.8, 5.13], [31.5, 5.5, 1.77],
  // Точка (60.4, 11.6) выброшена: там рельеф не держал часть хлыстов, хотя
  // ствол стоял — место, а не дерево, остальные десять с теми же сидами целы.
  [66.6, 10.2, 3.46],
];
/** Обычные широколиственные: двор, углы полей, дальняя межа. */
const BANK_BROADLEAVES: readonly (readonly [number, number, number])[] = [
  [-31, 47, 0.6], [-25.1, 18.1, 2.83], [-5.3, 7.1, 3.85],
  [11.6, 19.9, 2.2], [-1.2, 38.4, 3.22],
];
for (const [index, [x, z, yaw]] of [...POLLARD_ROW, ...BANK_BROADLEAVES].entries()) {
  const pollarded = index < POLLARD_ROW.length;
  prefab(
    willows,
    `willow:${index}`,
    pollarded
      ? `core:willow:${71 + index % 3}`
      : `core:oak:${71 + index % 3}`,
    // The fixed turf shell is now the real intact support and collider. Roots
    // must meet that visible triangle, not the stepped earth body below it.
    [x, dutchPolderVisualTopAt(x, z) - 0.04, z],
    [0, yaw, 0],
    // Масштаб РАВНОМЕРНЫЙ. Прежний сплющивал дерево по высоте на 8%, и у
    // тонкого повёрнутого хлыста опорная коробка переставала перекрываться с
    // головой: одна ива из десяти стартовала с шестью неопёртыми хлыстами.
    // Деревья не сплющивают, а неравномерный масштаб ломает ровно те члены,
    // что держатся перекрытием.
    (() => { const grow = 0.88 + ((index * 7) % 5) * 0.05; return [grow, grow, grow] as const; })(),
    [{ kind: "damp", amount: 0.3 }, { kind: "moss", amount: 0.18 }],
  );
}

// Плакучая ива — не рабочее дерево берега, а дерево ДВОРА: в Голландии она
// стоит у воды возле фермы и у моста, где её занавес полощется над каналом.
// Их мало и они крупные, поэтому это отдельная группа, а не рассев.
const weepingWillows = group("weeping-willows", "Weeping willows at the water", "wood", "mounted");
for (const [index, [x, z, yaw]] of [
  [26.5, 16.4, 0.6], [-51.3, 16.9, 0.85], [7.4, 44.8, 4.3],
].entries()) {
  prefab(
    weepingWillows,
    `weeping:${index}`,
    `core:weeping-willow:${81 + (index % 2)}`,
    [x, dutchPolderVisualTopAt(x, z) - 0.05, z],
    [0, yaw, 0],
    [0.94 + (index % 3) * 0.06, 0.96 + (index % 2) * 0.08, 0.94 + (index % 3) * 0.06],
    [{ kind: "damp", amount: 0.34 }, { kind: "moss", amount: 0.2 }],
  );
}

/**
 * Двор занского дома.
 *
 * Раскладка авторизована в СОБСТВЕННОЙ раме участка H1 (+Z — на воду, +X —
 * вдоль набережной), а не в мировых осях: двор принадлежит дому, и если дом
 * когда-нибудь сдвинется по контракту участков, двор уедет вместе с ним, не
 * рассыпавшись по польдеру.
 *
 * Отметка берётся двумя разными правилами, и это не мелочь. Наземный предмет
 * садится на САМУЮ НИЗКУЮ точку грунта под своим пятном — тогда он врастает в
 * бугор, а не висит над ямой. Предмет на воде садится от уреза по своему
 * объявленному якорю: у лодки нуль — ватерлиния, у свай — низ сваи под водой,
 * у мостков — низ сваи на дне. Одна общая отметка для тех и других означала бы
 * либо утопленную лодку, либо мостки на сваях в воздухе.
 */
const zaanPlot = dutchPolderPlot("H1");
const zaanYardYaw = dutchPolderPlotYaw(zaanPlot.bearing);

type YardPlacement = {
  readonly id: string;
  readonly prefab: string;
  /** Положение в раме участка. */
  readonly at: readonly [x: number, z: number];
  /** Доворот относительно рамы участка, градусы. */
  readonly turn?: number;
  /** Половина пятна объекта в его собственных осях — по нему ищется грунт. */
  readonly half: readonly [x: number, z: number];
  /** Отметка от уреза воды вместо посадки на грунт. */
  readonly waterOffset?: number;
  /** Опора на самую высокую точку: так стоит нужник, свесив зад над водой. */
  readonly seatOnHighest?: boolean;
  readonly damp: number;
  readonly moss: number;
};

const ZAAN_YARD: readonly YardPlacement[] = [
  // Вода: причал у восточного, рабочего конца фасада, чтобы парадный вид от
  // калитки на канал остался открытым.
  { id: "jetty", prefab: "dutch:landscape:jetty", at: [-3.5, 11.6], half: [0.56, 1.45], waterOffset: -0.33, damp: 0.85, moss: 0.3 },
  { id: "mooring", prefab: "dutch:landscape:mooring-posts", at: [0.5, 12.6], half: [1.7, 0.12], waterOffset: -0.85, damp: 0.85, moss: 0.28 },
  // Лодка стоит МОТОРИСТО вдоль берега (доворот 90°), снаружи от свай: к сваям
  // её и привязывают, а между сваями и берегом лодке не хватает воды.
  { id: "schouw", prefab: "dutch:landscape:schouw", at: [0.5, 13.5], turn: -90, half: [2.32, 0.73], waterOffset: 0, damp: 0.8, moss: 0.22 },
  // Нужник вынесен на берег за линию забора, на восточный край: он садится на
  // высокую, береговую сторону своего пятна и свешивает очко к воде.
  { id: "privy", prefab: "dutch:landscape:privy", at: [-7.2, 11.6], turn: 180, half: [0.63, 0.73], seatOnHighest: true, damp: 0.55, moss: 0.26 },

  // Рабочая половина двора — восточная полоса. Сарай смотрит воротами и
  // подъёмной балкой на воду: груз идёт с лодки под балку, а не через дом.
  { id: "shed", prefab: "dutch:landscape:yard-shed", at: [-6.1, -0.7], half: [2.55, 3.45], damp: 0.24, moss: 0.12 },
  { id: "peat-store", prefab: "dutch:landscape:peat-store", at: [-5.4, -5.5], turn: 180, half: [1.4, 0.69], damp: 0.3, moss: 0.16 },
  { id: "rain-barrel", prefab: "dutch:landscape:rain-barrel", at: [-2.95, 2.6], turn: 90, half: [0.32, 0.32], damp: 0.45, moss: 0.2 },

  // Домашняя половина — западная полоса и зады.
  { id: "hand-pump", prefab: "dutch:landscape:hand-pump", at: [5.9, 1.6], turn: -90, half: [0.28, 0.55], damp: 0.35, moss: 0.18 },
  { id: "drying-line", prefab: "dutch:landscape:drying-line", at: [1, -7.2], half: [3.55, 0.28], damp: 0.18, moss: 0.08 },
  // Рама для фасоли стоит в списке кита, но НЕ размещена: в сцене она
  // стартует шестью неопёртыми шестами из десяти. Дефект внутри объекта —
  // воспроизводится с ним одним и не зависит от места; разбор записан в
  // dutchLandscapeKitObject.ts над её авторством. Место под неё держит
  // западная полоса огорода, точка (6.8, -2.6) в раме участка.

  // Палисад: три модуля по 3 м вдоль передней межи и калитка ровно там, где
  // кончается обязательная тропа. Восточнее калитки межа остаётся ОТКРЫТОЙ —
  // через неё во двор заходит груз, и забор там был бы враньём.
  { id: "fence-a", prefab: "dutch:landscape:picket-fence", at: [-1.825, 7.325], half: [1.51, 0.06], damp: 0.3, moss: 0.16 },
  { id: "gate", prefab: "dutch:landscape:picket-gate", at: [-1.825, 7.325], half: [0.54, 0.06], damp: 0.3, moss: 0.14 },
  { id: "fence-b", prefab: "dutch:landscape:picket-fence", at: [2.24, 7.325], half: [1.51, 0.06], damp: 0.3, moss: 0.16 },
  { id: "fence-c", prefab: "dutch:landscape:picket-fence", at: [5.26, 7.325], half: [1.51, 0.06], damp: 0.3, moss: 0.16 },
];

const zaanYard = group("zaan-yard", "Zaan house yard", "wood");
const zaanMooring = group("zaan-mooring", "Zaan house mooring", "wood");

for (const item of ZAAN_YARD) {
  const [worldX, worldZ] = dutchPolderPlotToWorld(zaanPlot, item.at[0], item.at[1]);
  const yaw = zaanYardYaw + (item.turn ?? 0) * Math.PI / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  let y: number;
  if (item.waterOffset !== undefined) {
    y = WATER_LEVEL + item.waterOffset;
  } else {
    const tops: number[] = [];
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iz = -2; iz <= 2; iz += 1) {
        const localX = item.half[0] * ix / 2;
        const localZ = item.half[1] * iz / 2;
        tops.push(dutchPolderVisualTopAt(
          worldX + localX * cos + localZ * sin,
          worldZ - localX * sin + localZ * cos,
        ));
      }
    }
    // Наземный предмет садится на четыре сантиметра НИЖЕ низшей точки грунта:
    // ножка, свая и столб врастают в дёрн, а не касаются его в одной точке.
    // Ровно так же сидят деревья, и по той же причине — контакт по касанию
    // решатель считает висящим.
    y = (item.seatOnHighest ? Math.max(...tops) : Math.min(...tops)) - 0.04;
  }
  prefab(
    item.waterOffset !== undefined ? zaanMooring : zaanYard,
    item.id,
    item.prefab,
    [worldX, y, worldZ],
    [0, yaw, 0],
    undefined,
    [{ kind: "damp", amount: item.damp }, { kind: "moss", amount: item.moss }],
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
  // Edge veil starts past the island rim (radius ~79). Slightly longer far
  // keeps the far bank from jumping to sky-grey with the near midground —
  // lessons §7: aerial perspective was starting too sharply across plans.
  fogDistances: [122, 252],
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
  // A building keeps its own plot, measured as the rectangle it is, instead of
  // sterilising the corners of a circle it never occupies. A mill additionally
  // keeps the circle its sails sweep.
  && DUTCH_POLDER_BUILDING_PLOTS.every((plot) =>
    dutchPolderRectDistance(plot, dutchPolderKeepOut(plot), x, z) > radius
    && (plot.sweep === undefined
      || Math.hypot(x - plot.origin[0], z - plot.origin[1]) > plot.sweep + radius));
