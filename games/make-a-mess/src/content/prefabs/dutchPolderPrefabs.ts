import { northHollandStolpFarmObject } from "../objects/dutchHouses/northHollandStolpFarmObject.ts";
import { zaanTimberMerchantHouseObject } from "../objects/dutchHouses/zaanTimberMerchantHouseObject.ts";
import {
  dutchLandscapeBeanFrameParts,
  dutchLandscapeBridgeParts,
  dutchLandscapeDryingLineParts,
  dutchLandscapeHandPumpParts,
  dutchLandscapeJettyParts,
  dutchLandscapeLitBridgeParts,
  dutchLandscapeMooringPostParts,
  dutchLandscapePeatStoreParts,
  dutchLandscapePicketFenceParts,
  dutchLandscapePicketGateParts,
  dutchLandscapePrivyParts,
  dutchLandscapeRainBarrelParts,
  dutchLandscapeSchouwParts,
  dutchLandscapeFenceParts,
  dutchLandscapeFieldParts,
  dutchLandscapeHedgeParts,
  dutchLandscapePathParts,
  dutchLandscapeRevetmentParts,
  dutchLandscapeWallParts,
} from "../objects/dutchLandscape/dutchLandscapeKitObject.ts";
import { zaanYardShedParts } from "../objects/dutchLandscape/zaanYardShedObject.ts";
import { deKatObject } from "../objects/dutchWindmills/deKatObject.ts";
import { gekroondePoelenburgPaltrokObject } from "../objects/dutchWindmills/gekroondePoelenburgPaltrokObject.ts";
import { jongeSchaapSawmillObject } from "../objects/dutchWindmills/jongeSchaapSawmillObject.ts";
import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../objects/dutchWindmills/objectModel.ts";
import { oudegeinWipmolenObject } from "../objects/dutchWindmills/oudegeinWipmolenObject.ts";
import type {
  ScenePrefabDefinition,
  ScenePrefabLibrary,
  ScenePrefabPieceDefinition,
} from "../scenes/sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
} from "../../game/destructionScene.ts";
import { litWindowColor } from "../../game/destructionScene.ts";
import { propOak, propPollardWillow, propWeepingWillow } from "./coreFlora.ts";

type MaterialBinding = {
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly color: string;
};

const materialBindings: Record<ObjectMaterialId, MaterialBinding> = {
  foundation: { material: "stone", shape: "stoneBlock", color: "#77756e" },
  brick: { material: "brick", shape: "brick", color: "#8a5944" },
  "timber-dark": { material: "wood", shape: "plank", color: "#35291f" },
  "timber-mid": { material: "wood", shape: "plank", color: "#6f5035" },
  cladding: { material: "wood", shape: "plank", color: "#376448" },
  thatch: { material: "wood", shape: "panel", color: "#9a8757" },
  roof: { material: "wood", shape: "panel", color: "#55514a" },
  "roof-dark": { material: "stone", shape: "panel", color: "#474947" },
  "roof-warm": { material: "brick", shape: "panel", color: "#96624b" },
  earth: { material: "earth", shape: "groundTile", color: "#655341" },
  grass: { material: "grass", shape: "groundTile", color: "#72845d" },
  "grass-crown": { material: "grass", shape: "groundTile", color: "#7b8155" },
  "grass-bench": { material: "grass", shape: "groundTile", color: "#6c805e" },
  "water-reserve": { material: "darkGlass", shape: "glassPane", color: "#3f7f91" },
  path: { material: "earth", shape: "groundTile", color: "#c3ae7b" },
  "bridge-seat": { material: "stone", shape: "stoneBlock", color: "#8a6847" },
  reserve: { material: "steel", shape: "steelSheet", color: "#d8bb58" },
  stone: { material: "stone", shape: "stoneBlock", color: "#77756d" },
  mortar: { material: "plaster", shape: "panel", color: "#aaa69a" },
  "shell-path": { material: "earth", shape: "groundTile", color: "#d7ccaa" },
  "soil-bed": { material: "soil", shape: "groundTile", color: "#5c4431" },
  foliage: { material: "foliage", shape: "panel", color: "#4e713e" },
  "flower-red": { material: "foliage", shape: "panel", color: "#c64740" },
  "flower-yellow": { material: "foliage", shape: "panel", color: "#e2bc3c" },
  "flower-blue": { material: "foliage", shape: "panel", color: "#4e7db9" },
  "flower-purple": { material: "foliage", shape: "panel", color: "#8a5aa5" },
  // The polder world's sails are rigid authored mechanisms.  Keep them out of
  // the shared cloth/wind shader until aerodynamic gameplay exists.
  canvas: { material: "wood", shape: "panel", color: "#d8d4c9" },
  metal: { material: "steel", shape: "steelSheet", color: "#535a5d" },
  "paint-light": { material: "wood", shape: "plank", color: "#d4d0be" },
  "paint-accent": { material: "wood", shape: "plank", color: "#bfa25a" },
  glazing: { material: "darkGlass", shape: "glassPane", color: "#1c2528" },
  "lamp-glass": { material: "glass", shape: "glassPane", color: "#b9c7c8" },
  "lamp-bulb": { material: "glass", shape: "glassPane", color: litWindowColor },
  "dark-recess": { material: "wood", shape: "panel", color: "#111718" },
  // Legacy house studies still use `opening` for their glazing. New objects
  // must distinguish real glass from an opaque recess explicitly.
  opening: { material: "darkGlass", shape: "glassPane", color: "#1c2528" },
};

const point = (value: ObjectPoint): SceneVector3 => [value[0], value[1], value[2]];

function rodRotation(from: ObjectPoint, to: ObjectPoint): SceneVector3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

function worldExtents(size: SceneVector3, rotation: SceneVector3): SceneVector3 {
  const [rx, ry, rz] = rotation;
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
  const axes = [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ] as const;
  return [0, 1, 2].map((world) =>
    axes.reduce((extent, axis, local) => extent + Math.abs(axis[world]) * size[local], 0),
  ) as unknown as SceneVector3;
}

function isSurfacePart(part: ObjectLabPart): boolean {
  if (/bridge-post|field-stem|crown-post/.test(part.id)) return false;
  return /cladding|trim|roof-skin|service-roof/.test(part.group)
    || /canvas|opening|roof|roof-dark|roof-warm|thatch|reserve/.test(part.material)
    || part.material === "foliage"
    || /field-flower|bridge-handrail|bridge-midrail/.test(part.id);
}

function mappedBase(part: ObjectLabPart) {
  const binding = materialBindings[part.material];
  const surface = isSurfacePart(part);
  const nonStructuralGlass = part.material === "lamp-glass"
    || part.material === "lamp-bulb"
    || part.material === "glazing"
    || part.material === "opening";
  const structuralStem = /field-stem/.test(part.id);
  const tallJoint = /cap-rib|crown-post/.test(part.id);
  const structuralSkin = part.id === "cap-hull" || part.id === "roof-ridge-cap";
  return {
    material: binding.material,
    shape: binding.shape,
    color: binding.color,
    bearsLoad: nonStructuralGlass ? false : structuralStem || structuralSkin ? true : surface ? false : undefined,
    carriesAttachments: nonStructuralGlass ? false : structuralSkin ? true : surface ? false : true,
    // Canonical Dutch timberwork is a pegged/jointed assembly. The object
    // study records the exact meeting geometry, while this metadata tells the
    // generic support solver that a touching member is a joint rather than a
    // freestanding stack. It is intentionally short-range: nearby buildings
    // cannot become one structure through empty air.
    attachmentSupportMode: nonStructuralGlass || (surface && !structuralSkin) ? undefined : "hinge",
    sideAttachmentReach: tallJoint ? 2.8 : surface ? 1.6 : 2,
    maximumVerticalGap: tallJoint ? 0.72 : 0.28,
    weathering: binding.material === "wood" || binding.material === "stone" ? 0.24 : undefined,
  } as const;
}

function mappedLight(part: ObjectLabPart) {
  if (!part.light) return {};
  return {
    light: {
      ...part.light,
      position: point(part.light.position ?? (
        part.kind === "box" ? part.center
          : part.kind === "beam" || part.kind === "cylinder"
            ? [
                (part.from[0] + part.to[0]) / 2,
                (part.from[1] + part.to[1]) / 2,
                (part.from[2] + part.to[2]) / 2,
              ]
            : [0, 0, 0]
      )),
    },
  } as const;
}

function meshPiece(part: Extract<ObjectLabPart, { kind: "mesh" }>): ScenePrefabPieceDefinition {
  const mins = [0, 1, 2].map((axis) => Math.min(...part.vertices.map((vertex) => vertex[axis])));
  const maxs = [0, 1, 2].map((axis) => Math.max(...part.vertices.map((vertex) => vertex[axis])));
  const centre = [0, 1, 2].map((axis) => (mins[axis] + maxs[axis]) / 2) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) => Math.max(0.025, maxs[axis] - mins[axis])) as unknown as SceneVector3;
  const vertices = part.vertices.map((vertex) =>
    [0, 1, 2].map((axis) => (vertex[axis] - centre[axis]) / size[axis]) as unknown as SceneVector3,
  );
  let area = 0;
  for (const [a, b, c] of part.triangles) {
    const ab = part.vertices[b].map((value, axis) => value - part.vertices[a][axis]);
    const ac = part.vertices[c].map((value, axis) => value - part.vertices[a][axis]);
    area += 0.5 * Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    );
  }
  return {
    id: part.id,
    ...mappedBase(part),
    ...mappedLight(part),
    shape: "panel",
    position: centre,
    size,
    visualMesh: { vertices, indices: part.triangles.flatMap((triangle) => [...triangle]), doubleSided: part.doubleSided },
    voxelization: { mode: "shell", thickness: 0.045, voxelSize: 0.16 },
    volume: Math.max(0.0005, area * 0.045),
    contactBoxes: [{ position: centre, size }],
  };
}

export function canonicalPartToPrefabPiece(part: ObjectLabPart): ScenePrefabPieceDefinition {
  if (part.kind === "mesh") return meshPiece(part);
  if (part.kind === "box") {
    const rotation = part.rotation ? point(part.rotation) : undefined;
    const size = point(part.size);
    return {
      id: part.id,
      ...mappedBase(part),
      ...mappedLight(part),
      position: point(part.center),
      rotation,
      size,
      contactBoxes: [{ position: point(part.center), size: rotation ? worldExtents(size, rotation) : size }],
    };
  }
  const centre: SceneVector3 = [
    (part.from[0] + part.to[0]) / 2,
    (part.from[1] + part.to[1]) / 2,
    (part.from[2] + part.to[2]) / 2,
  ];
  const length = Math.hypot(
    part.to[0] - part.from[0],
    part.to[1] - part.from[1],
    part.to[2] - part.from[2],
  );
  const rotation = rodRotation(part.from, part.to);
  const size: SceneVector3 = part.kind === "cylinder"
    ? [part.radius * 2, length, part.radius * 2]
    : [part.width, length, part.depth];
  return {
    id: part.id,
    ...mappedBase(part),
    ...mappedLight(part),
    shape: part.kind === "cylinder" ? "cylinder" : mappedBase(part).shape,
    position: centre,
    rotation,
    size,
    contactBoxes: [{ position: centre, size: worldExtents(size, rotation) }],
    bearingArea: part.kind === "beam" ? part.width * length : undefined,
  };
}

function prefab(
  id: string,
  displayName: string,
  tags: readonly string[],
  parts: readonly ObjectLabPart[],
): ScenePrefabDefinition {
  return {
    schemaVersion: 1,
    id,
    displayName,
    tags,
    pieces: parts.map(canonicalPartToPrefabPiece),
  };
}

function prefabWithLightGroup(
  id: string,
  displayName: string,
  tags: readonly string[],
  parts: readonly ObjectLabPart[],
  poolGroupId: string,
): ScenePrefabDefinition {
  const definition = prefab(id, displayName, tags, parts);
  return {
    ...definition,
    pieces: definition.pieces.map((piece) => piece.light
      ? { ...piece, light: { ...piece.light, poolGroupId } }
      : piece),
  };
}

function coreWeepingWillowPrefab(seed: number): ScenePrefabDefinition {
  return {
    schemaVersion: 1,
    id: `core:weeping-willow:${seed}`,
    displayName: "Weeping willow",
    tags: ["core", "flora", "tree", "willow"],
    pieces: propWeepingWillow({ seed }),
  };
}

function corePollardWillowPrefab(seed: number): ScenePrefabDefinition {
  return {
    schemaVersion: 1,
    id: `core:willow:${seed}`,
    displayName: "Pollard willow",
    tags: ["core", "flora", "tree", "willow"],
    pieces: propPollardWillow({ seed }),
  };
}

function coreTreePrefab(seed: number): ScenePrefabDefinition {
  return {
    schemaVersion: 1,
    id: `core:oak:${seed}`,
    displayName: "Broadleaf tree",
    tags: ["core", "flora", "tree"],
    pieces: propOak({ seed }),
  };
}

function modelPrefabs(id: string, displayName: string, model: ObjectLabModel) {
  const rotor = model.parts.filter((part) => part.group === "rotor");
  const fixed = model.parts.filter((part) => part.group !== "rotor");
  return [
    prefab(`dutch:${id}:fixed`, `${displayName} — fixed structure`, ["dutch", id, "fixed"], fixed),
    ...(rotor.length ? [prefab(`dutch:${id}:rotor`, `${displayName} — constant rotor`, ["dutch", id, "rotor"], rotor)] : []),
  ];
}

const definitions = [
  ...modelPrefabs("m1-de-kat", "De Kat paint mill", deKatObject),
  ...modelPrefabs("m2-oudegein", "Oudegein wipmolen", oudegeinWipmolenObject),
  ...modelPrefabs("m3-jonge-schaap", "Het Jonge Schaap sawmill", jongeSchaapSawmillObject),
  ...modelPrefabs("m4-poelenburg", "De Gekroonde Poelenburg paltrok", gekroondePoelenburgPaltrokObject),
  ...modelPrefabs("h1-zaan-house", "Zaan timber merchant house", zaanTimberMerchantHouseObject),
  ...modelPrefabs("h2-stolp-farm", "North-Holland stolp farm", northHollandStolpFarmObject),
  prefab("dutch:landscape:schouw", "Polder schouw", ["dutch", "landscape", "yard", "boat"], dutchLandscapeSchouwParts),
  prefab("dutch:landscape:mooring-posts", "Pair of mooring posts", ["dutch", "landscape", "yard", "water-edge"], dutchLandscapeMooringPostParts),
  prefab("dutch:landscape:jetty", "Private timber jetty", ["dutch", "landscape", "yard", "water-edge"], dutchLandscapeJettyParts),
  prefab("dutch:landscape:yard-shed", "Zaan yard shed", ["dutch", "landscape", "yard", "building"], zaanYardShedParts),
  prefab("dutch:landscape:peat-store", "Ventilated peat store", ["dutch", "landscape", "yard", "fuel"], dutchLandscapePeatStoreParts),
  prefab("dutch:landscape:privy", "Ditch-side privy", ["dutch", "landscape", "yard", "water-edge"], dutchLandscapePrivyParts),
  prefab("dutch:landscape:hand-pump", "Cast-iron hand pump", ["dutch", "landscape", "yard", "water"], dutchLandscapeHandPumpParts),
  prefab("dutch:landscape:drying-line", "Farmyard drying line", ["dutch", "landscape", "yard", "domestic"], dutchLandscapeDryingLineParts),
  prefab("dutch:landscape:bean-frame", "Hazel bean frame", ["dutch", "landscape", "yard", "garden"], dutchLandscapeBeanFrameParts),
  prefab("dutch:landscape:picket-fence", "Zaan picket fence module", ["dutch", "landscape", "yard", "fence"], dutchLandscapePicketFenceParts),
  prefab("dutch:landscape:picket-gate", "Zaan picket gate", ["dutch", "landscape", "yard", "gate"], dutchLandscapePicketGateParts),
  prefab("dutch:landscape:rain-barrel", "Oak rain barrel", ["dutch", "landscape", "yard", "water"], dutchLandscapeRainBarrelParts),
  prefab("dutch:landscape:bridge", "Kwakel bridge", ["dutch", "landscape", "bridge"], dutchLandscapeBridgeParts),
  ...(["B1", "B3", "B5"] as const).map((bridgeId) => prefabWithLightGroup(
    `dutch:landscape:bridge-lit-${bridgeId.toLowerCase()}`,
    `Kwakel bridge ${bridgeId} — two lanterns`,
    ["dutch", "landscape", "bridge", "lit"],
    dutchLandscapeLitBridgeParts,
    `dutch-polder:${bridgeId.toLowerCase()}-bridge`,
  )),
  prefab("dutch:landscape:field-bed", "Raised flower beds", ["dutch", "landscape", "field"], dutchLandscapeFieldParts),
  prefab("dutch:landscape:retaining-wall", "Coursed retaining wall", ["dutch", "landscape", "masonry"], dutchLandscapeWallParts),
  prefab("dutch:landscape:revetment", "Timber canal revetment", ["dutch", "landscape", "canal"], dutchLandscapeRevetmentParts),
  prefab("dutch:landscape:path", "Compacted shell path", ["dutch", "landscape", "path"], dutchLandscapePathParts),
  ...[71, 72, 73].map(coreTreePrefab),
  ...[71, 72, 73].map(corePollardWillowPrefab),
  ...[81, 82].map(coreWeepingWillowPrefab),
  prefab("dutch:landscape:field-fence", "Timber field fence", ["dutch", "landscape", "fence"], dutchLandscapeFenceParts),
  prefab("dutch:landscape:hedgerow", "Field hedgerow", ["dutch", "landscape", "hedge"], dutchLandscapeHedgeParts),
] as const;

export const dutchPolderPrefabDefinitions = definitions;
export const dutchPolderPrefabLibrary: ScenePrefabLibrary = new Map(
  definitions.map((definition) => [definition.id, definition]),
);
