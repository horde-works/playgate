import {
  litWindowColor,
  type BreakableMaterial,
  type BreakableShape,
  type SceneVector3,
} from "../../game/destructionScene.ts";
import type {
  ScenePrefabDefinition,
  ScenePrefabLibrary,
  ScenePrefabPieceDefinition,
} from "../scenes/sceneContract.ts";
import { propBirch, propOak } from "./coreFlora.ts";
import {
  propBucket,
  propCautionBoard,
  propCrate,
  propPallet,
  propPlankStack,
  propSackPile,
  propSpool,
  propSteelDrum,
  propTarpPile,
} from "./coreProps.ts";

type Piece = ScenePrefabPieceDefinition;

const DARK_STEEL = "#202628";
const GLASS = "#92aeb7";
const DARK_GLASS = "#536a73";
const OLD_PLASTER = "#d8cbb4";
const OLD_PLINTH = "#68645d";
const RED_AGGREGATE = "#8c4036";
const YELLOW_GAS = "#bd9a31";
const WHITE_PAINT = "#ddd8cd";

function prefab(
  id: string,
  displayName: string,
  tags: readonly string[],
  pieces: readonly Piece[],
): ScenePrefabDefinition {
  return { schemaVersion: 1, id, displayName, tags, pieces };
}

function part(
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: Omit<
    Partial<Piece>,
    "id" | "material" | "shape" | "position" | "size" | "color"
  > = {},
): Piece {
  return { id, material, shape, position, size, color, ...options };
}

function selfContact(piece: Piece, size: SceneVector3 = piece.size): Piece {
  return piece.contactBoxes
    ? piece
    : { ...piece, contactBoxes: [{ position: piece.position, size }] };
}

function cylinder(
  id: string,
  position: SceneVector3,
  diameter: number,
  length: number,
  color: string,
  rotation: SceneVector3 = [0, 0, 0],
  material: BreakableMaterial = "steel",
): Piece {
  const quarterTurn = Math.PI / 4;
  const contactSize: SceneVector3 = Math.abs(rotation[2]) > quarterTurn
    ? [length, diameter, diameter]
    : Math.abs(rotation[0]) > quarterTurn
      ? [diameter, diameter, length]
      : [diameter, length, diameter];
  return selfContact(
    part(id, material, "cylinder", position, [diameter, length, diameter], color, {
      rotation,
      sideAttachmentReach: 0.42,
    }),
    contactSize,
  );
}

function modernTower(
  id: string,
  displayName: string,
  options: {
    readonly width: number;
    readonly depth: number;
    readonly floors: number;
    readonly cladding: string;
    readonly accent: string;
    readonly glass: string;
    readonly crown?: "arches" | "frame" | "plain";
  },
): ScenePrefabDefinition {
  const { width, depth, floors, cladding, accent, glass } = options;
  const pieces: Piece[] = [];
  const floorHeight = 3;
  const facadeDepth = 0.28;
  const totalHeight = floors * floorHeight;
  const frontBays = Math.max(3, Math.round(width / 3.2));
  const sideBays = Math.max(3, Math.round(depth / 3.2));

  pieces.push(
    part("foundation", "concrete", "groundTile", [0, 0.18, 0], [width, 0.36, depth], "#777a78", {
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
  );

  for (let floor = 0; floor < floors; floor += 1) {
    const y0 = floor * floorHeight;
    const centerY = y0 + floorHeight / 2;
    const isPodium = floor === 0;
    pieces.push(
      part(`slab:${floor}`, "concrete", "panel", [0, y0 + 0.28, 0], [width, 0.22, depth], "#777a78", {
        textureProfile: "city-facade-cladding",
        carriesAttachments: true,
        // The bearing proxy reaches the facade, while the visible slab stays
        // flush with the wall. Its thin vertical section avoids making the
        // facade look like stacked shelves or count as deep interpenetration.
        contactBoxes: [{ position: [0, y0 + 0.29, 0], size: [width + 2.0, 0.1, depth + 2.0] }],
      }),
      part(`core:${floor}:east-west`, "concrete", "panel", [0, y0 + 1.725, 0], [width * 0.48, 2.89, 0.72], "#676c6b", {
        textureProfile: "city-facade-cladding",
        carriesAttachments: true,
        bearingArea: width * depth * 0.16,
      }),
      part(`core:${floor}:north-south`, "concrete", "panel", [0, y0 + 1.725, 0], [0.72, 2.89, depth * 0.48], "#676c6b", {
        textureProfile: "city-facade-cladding",
        carriesAttachments: true,
        bearingArea: width * depth * 0.16,
      }),
    );

    for (const side of [-1, 1] as const) {
      const z = side * (depth / 2 - facadeDepth / 2);
      const bayWidth = width / frontBays;
      for (let bay = 0; bay < frontBays; bay += 1) {
        const x = -width / 2 + bayWidth * (bay + 0.5);
        const lit = (floor * 7 + bay * 3 + (side > 0 ? 1 : 0)) % 9 === 0;
        pieces.push(
          part(`front:${side}:${floor}:${bay}:lower`, "concrete", "panel", [x, y0 + 0.62, z], [bayWidth - 0.08, 0.78, facadeDepth], bay % 4 === 0 ? accent : cladding, {
            colorSlot: bay % 4 === 0 ? "accent" : "cladding",
            textureProfile: "city-facade-cladding",
            carriesAttachments: true,
          }),
          part(`front:${side}:${floor}:${bay}:window`, lit ? "glass" : "darkGlass", "glassPane", [x, centerY + 0.18, z + side * 0.025], [bayWidth * (isPodium ? 0.8 : 0.67), isPodium ? 1.72 : 1.48, 0.1], lit ? litWindowColor : glass, {
            colorSlot: lit ? undefined : "glass",
            bearsLoad: false,
            sideAttachmentReach: 0.36,
            contactBoxes: [{ position: [x, centerY + 0.18, z], size: [bayWidth * 0.75, 1.5, 0.48] }],
          }),
          part(`front:${side}:${floor}:${bay}:jamb`, "concrete", "panel", [x, y0 + 1.72, z], [0.18, 1.46, facadeDepth], bay % 4 === 0 ? accent : cladding, {
            colorSlot: bay % 4 === 0 ? "accent" : "cladding",
            textureProfile: "city-facade-cladding",
            carriesAttachments: true,
          }),
          part(`front:${side}:${floor}:${bay}:upper`, "concrete", "panel", [x, y0 + 2.81, z], [bayWidth - 0.08, 0.72, facadeDepth], cladding, {
            colorSlot: "cladding",
            textureProfile: "city-facade-cladding",
            bearsLoad: false,
            sideAttachmentReach: 0.32,
          }),
        );
      }
    }

    for (const side of [-1, 1] as const) {
      const x = side * (width / 2 - facadeDepth / 2);
      const bayDepth = depth / sideBays;
      for (let bay = 0; bay < sideBays; bay += 1) {
        const z = -depth / 2 + bayDepth * (bay + 0.5);
        const lit = (floor * 5 + bay * 2 + (side > 0 ? 2 : 0)) % 11 === 0;
        pieces.push(
          part(`side:${side}:${floor}:${bay}:lower`, "concrete", "panel", [x, y0 + 0.62, z], [facadeDepth, 0.78, bayDepth - 0.08], bay % 5 === 0 ? accent : cladding, {
            colorSlot: bay % 5 === 0 ? "accent" : "cladding",
            textureProfile: "city-facade-cladding",
            carriesAttachments: true,
          }),
          part(`side:${side}:${floor}:${bay}:window`, lit ? "glass" : "darkGlass", "glassPane", [x + side * 0.025, centerY + 0.18, z], [0.1, isPodium ? 1.72 : 1.48, bayDepth * (isPodium ? 0.8 : 0.67)], lit ? litWindowColor : glass, {
            colorSlot: lit ? undefined : "glass",
            bearsLoad: false,
            sideAttachmentReach: 0.36,
            contactBoxes: [{ position: [x, centerY + 0.18, z], size: [0.48, 1.5, bayDepth * 0.75] }],
          }),
          part(`side:${side}:${floor}:${bay}:jamb`, "concrete", "panel", [x, y0 + 1.72, z], [facadeDepth, 1.46, 0.18], bay % 5 === 0 ? accent : cladding, {
            colorSlot: bay % 5 === 0 ? "accent" : "cladding",
            textureProfile: "city-facade-cladding",
            carriesAttachments: true,
          }),
          part(`side:${side}:${floor}:${bay}:upper`, "concrete", "panel", [x, y0 + 2.81, z], [facadeDepth, 0.72, bayDepth - 0.08], cladding, {
            colorSlot: "cladding",
            textureProfile: "city-facade-cladding",
            bearsLoad: false,
            sideAttachmentReach: 0.32,
          }),
        );
      }
    }

    if (floor > 1 && floor % 3 === 0) {
      pieces.push(
        part(`aircon:${floor}:box`, "steel", "steelSheet", [width / 2 + 0.18, centerY, -depth * 0.22], [0.42, 0.55, 0.78], "#a7aaa5", {
          bearsLoad: false,
          sideAttachmentReach: 0.58,
          contactBoxes: [{ position: [width / 2, centerY, -depth * 0.22], size: [0.72, 0.7, 0.9] }],
        }),
        part(`aircon:${floor}:grille`, "steel", "steelSheet", [width / 2 + 0.405, centerY, -depth * 0.22], [0.03, 0.42, 0.58], "#5b6261", {
          bearsLoad: false,
          sideAttachmentReach: 0.5,
          contactBoxes: [{ position: [width / 2, centerY, -depth * 0.22], size: [0.72, 0.7, 0.9] }],
        }),
      );
    }
  }

  pieces.push(
    part("roof-slab", "concrete", "panel", [0, totalHeight + 0.28, 0], [width, 0.38, depth], cladding, {
      colorSlot: "cladding",
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
      contactBoxes: [{ position: [0, totalHeight + 0.29, 0], size: [width + 2.0, 0.1, depth + 2.0] }],
    }),
  );

  if (options.crown === "arches") {
    for (const side of [-1, 1] as const) {
      for (let bay = -2; bay <= 2; bay += 1) {
        pieces.push(
          part(`crown:${side}:${bay}:pier`, "concrete", "panel", [bay * (width / 6), totalHeight + 1.4, side * (depth / 2 - 0.18)], [0.32, 2.25, 0.36], accent, {
            colorSlot: "accent",
            textureProfile: "city-facade-cladding",
            carriesAttachments: true,
          }),
        );
      }
      pieces.push(
        part(`crown:${side}:lintel`, "concrete", "panel", [0, totalHeight + 2.35, side * (depth / 2 - 0.18)], [width * 0.78, 0.32, 0.36], accent, {
          colorSlot: "accent",
          textureProfile: "city-facade-cladding",
        }),
      );
    }
  } else if (options.crown === "frame") {
    for (const x of [-width * 0.32, width * 0.32]) {
      pieces.push(part(`crown:post:${x}`, "concrete", "panel", [x, totalHeight + 1.35, 0], [0.42, 2.2, depth * 0.82], accent, {
        colorSlot: "accent",
        textureProfile: "city-facade-cladding",
        carriesAttachments: true,
      }));
    }
    pieces.push(part("crown:beam", "concrete", "panel", [0, totalHeight + 2.35, 0], [width * 0.68, 0.34, depth * 0.82], accent, {
      colorSlot: "accent",
      textureProfile: "city-facade-cladding",
    }));
  }

  return prefab(id, displayName, ["city", "building", "tower", "structural"], pieces);
}

function oldTwoStoreyHouse(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  const width = 12;
  const depth = 8;
  const wall = 0.34;
  const storey = 3;
  const total = 6;

  pieces.push(selfContact(part("foundation", "concrete", "groundTile", [0, 0.2, 0], [width, 0.4, depth], OLD_PLINTH, {
    carriesAttachments: true,
    weathering: 0.45,
  })));

  for (let floor = 0; floor < 2; floor += 1) {
    const y = floor * storey + storey / 2;
    const contactBottom = floor === 0 ? 0.4 : floor * storey + 0.17;
    const contactTop = (floor + 1) * storey + 0.17;
    const contactHeight = contactTop - contactBottom;
    const contactY = (contactBottom + contactTop) / 2;
    pieces.push(part(`floor:${floor}`, "wood", "plank", [0, floor * storey + 0.28, 0], [width - 0.4, 0.22, depth - 0.4], "#6c543c", {
      carriesAttachments: true,
    }));
    for (const side of [-1, 1] as const) {
      pieces.push(
        part(`front:${floor}:${side}`, "plaster", "panel", [side * 3.2, y, depth / 2 - wall / 2], [5.4, storey + 0.34, wall], OLD_PLASTER, {
          colorSlot: "plaster",
          textureProfile: "city-aged-stucco",
          weathering: floor === 0 ? 0.88 : 0.62,
          carriesAttachments: true,
          contactBoxes: [{ position: [side * 3.2, contactY, depth / 2 - wall / 2], size: [5.4, contactHeight, wall] }],
        }),
        part(`back:${floor}:${side}`, "plaster", "panel", [side * 3.2, y, -depth / 2 + wall / 2], [5.4, storey + 0.34, wall], OLD_PLASTER, {
          colorSlot: "plaster",
          textureProfile: "city-aged-stucco",
          weathering: floor === 0 ? 0.86 : 0.58,
          carriesAttachments: true,
          contactBoxes: [{ position: [side * 3.2, contactY, -depth / 2 + wall / 2], size: [5.4, contactHeight, wall] }],
        }),
      );
    }
    for (const side of [-1, 1] as const) {
      pieces.push(part(`gable-wall:${floor}:${side}`, "plaster", "panel", [side * (width / 2 - wall / 2), y, 0], [wall, storey + 0.34, depth - 0.4], OLD_PLASTER, {
        colorSlot: "plaster",
        textureProfile: "city-aged-stucco",
        weathering: floor === 0 ? 0.82 : 0.56,
        carriesAttachments: true,
        contactBoxes: [{ position: [side * (width / 2 - wall / 2), contactY, 0], size: [wall, contactHeight, depth - 0.4] }],
      }));
    }
  }

  const windows: readonly [string, number, number, number][] = [
    ["front-ground-west", -3.2, 1.55, depth / 2 + 0.03],
    ["front-ground-east", 3.2, 1.55, depth / 2 + 0.03],
    ["front-upper-west", -3.2, 4.55, depth / 2 + 0.03],
    ["front-upper-east", 3.2, 4.55, depth / 2 + 0.03],
    ["back-ground-west", -3.2, 1.55, -depth / 2 - 0.03],
    ["back-upper-east", 3.2, 4.55, -depth / 2 - 0.03],
  ];
  for (const [id, x, y, z] of windows) {
    const face = Math.sign(z);
    const wallContact = { position: [x, y, z - face * 0.2] as SceneVector3, size: [1.9, 2.05, 0.58] as SceneVector3 };
    pieces.push(
      part(`window:${id}:glass`, "glass", "glassPane", [x, y, z], [1.45, 1.55, 0.1], DARK_GLASS, {
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        contactBoxes: [{ position: [x, y, z - face * 0.2], size: [1.7, 1.8, 0.55] }],
      }),
      part(`window:${id}:sill`, "concrete", "panel", [x, y - 0.88, z + face * 0.09], [1.75, 0.14, 0.38], "#b7ae9e", {
        bearsLoad: false,
        sideAttachmentReach: 0.4,
        contactBoxes: [{ position: [x, y - 0.78, z - face * 0.12], size: [1.8, 0.42, 0.58] }],
      }),
      part(`window:${id}:frame-left`, "wood", "plank", [x - 0.79, y, z + face * 0.07], [0.12, 1.78, 0.12], "#d7d5cd", {
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        contactBoxes: [wallContact],
      }),
      part(`window:${id}:frame-right`, "wood", "plank", [x + 0.79, y, z + face * 0.07], [0.12, 1.78, 0.12], "#d7d5cd", {
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        contactBoxes: [wallContact],
      }),
      part(`window:${id}:frame-top`, "wood", "plank", [x, y + 0.83, z + face * 0.07], [1.7, 0.12, 0.12], "#d7d5cd", {
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        contactBoxes: [wallContact],
      }),
      part(`window:${id}:frame-bottom`, "wood", "plank", [x, y - 0.83, z + face * 0.07], [1.7, 0.12, 0.12], "#c6c4bc", {
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        contactBoxes: [wallContact],
      }),
    );
  }

  // The photographed house has a coarse, repaired plinth rather than clean
  // plaster reaching the ground. These are real overlapping render pieces so
  // the material boundary survives destruction.
  for (const face of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      pieces.push(part(`rough-plinth:front:${face}:${side}`, "concrete", "panel", [side * 3.2, 0.86, face * (depth / 2 + 0.035)], [5.4, 1.58, 0.12], face > 0 ? "#77736a" : "#817c72", {
        textureProfile: "city-aged-stucco",
        weathering: 0.92,
        bearsLoad: false,
        sideAttachmentReach: 0.46,
        contactBoxes: [{ position: [side * 3.2, 0.88, face * (depth / 2 - 0.17)], size: [5.45, 1.75, 0.6] }],
      }));
    }
    pieces.push(part(`rough-plinth:gable:${face}`, "concrete", "panel", [face * (width / 2 + 0.035), 0.86, 0], [0.12, 1.58, depth - 0.38], "#716e67", {
      textureProfile: "city-aged-stucco",
      weathering: 0.9,
      bearsLoad: false,
      sideAttachmentReach: 0.46,
      contactBoxes: [{ position: [face * (width / 2 - 0.17), 0.88, 0], size: [0.6, 1.75, depth - 0.34] }],
    }));
  }

  pieces.push(
    part("door", "wood", "plank", [0, 1.28, depth / 2 + 0.05], [1.3, 2.35, 0.18], "#805631", {
      hinge: { pivot: [-0.65, 1.28, depth / 2 + 0.05], direction: [0, 1, 0], normal: [0, 0, 1] },
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [0, 1.28, depth / 2 - 0.16], size: [1.5, 2.5, 0.56] }],
    }),
    part("door-transom", "darkGlass", "glassPane", [0, 2.72, depth / 2 + 0.05], [1.3, 0.36, 0.12], "#38464a", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [0, 2.62, depth / 2 - 0.16], size: [1.45, 0.56, 0.56] }],
    }),
  );

  // Real exposed masonry patches: small brick faces sit through the thinning
  // plaster at corners and below windows instead of being painted into a map.
  for (let index = 0; index < 12; index += 1) {
    const x = -5.0 + (index % 4) * 0.42;
    const y = 0.65 + Math.floor(index / 4) * 0.26;
    pieces.push(part(`spall-brick:${index}`, "brick", "brick", [x, y, depth / 2 + 0.08], [0.38, 0.21, 0.15], index % 3 === 0 ? "#703f35" : "#9a6956", {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [x, y, depth / 2 - 0.28], size: [1.2, 0.3, 1.1] }],
    }));
  }

  const roofY = total + 1.1;
  const slope = 0.54;
  const slant = depth / 2.1;
  for (const side of [-1, 1] as const) {
    pieces.push(selfContact(part(`roof-long:${side}`, "steel", "panel", [0, roofY, side * 2.05], [width + 0.9, 0.2, slant + 0.7], "#51443e", {
      rotation: [side * slope, 0, 0],
      textureProfile: "city-roof-tile",
      weathering: 0.4,
    }), [width, 0.5, slant]));
  }
  for (const side of [-1, 1] as const) {
    pieces.push(selfContact(part(`roof-hip:${side}`, "steel", "panel", [side * 4.35, roofY - 0.05, 0], [slant + 0.7, 0.2, depth - 0.6], "#51443e", {
      rotation: [0, 0, -side * 0.72],
      textureProfile: "city-roof-tile",
      weathering: 0.4,
    }), [slant, 0.5, depth - 0.8]));
  }

  // Yellow gas service and improvised facade cable are part of the house.
  const gasHorizontal = cylinder("gas:horizontal", [0.8, 2.55, depth / 2 + 0.32], 0.09, 8.8, YELLOW_GAS, [0, 0, Math.PI / 2]);
  const cableHorizontal = cylinder("cable:horizontal", [-1.5, 3.1, depth / 2 + 0.26], 0.035, 5.8, "#242526", [0, 0, Math.PI / 2]);
  const frontGutter = cylinder("gutter:front", [0, 6.42, depth / 2 + 0.25], 0.11, width + 0.5, "#343637", [0, 0, Math.PI / 2]);
  const backGutter = cylinder("gutter:back", [0, 6.42, -depth / 2 - 0.25], 0.11, width + 0.5, "#343637", [0, 0, Math.PI / 2]);
  pieces.push(
    { ...gasHorizontal, contactBoxes: [{ position: [0.8, 2.55, depth / 2 - 0.08], size: [8.8, 0.2, 0.62] }] },
    cylinder("gas:drop", [5.2, 1.35, depth / 2 + 0.32], 0.09, 2.45, YELLOW_GAS),
    { ...cableHorizontal, contactBoxes: [{ position: [-1.5, 3.1, depth / 2 - 0.08], size: [5.8, 0.16, 0.55] }] },
    cylinder("cable:drop", [-4.4, 2.4, depth / 2 + 0.26], 0.035, 1.4, "#242526"),
    { ...frontGutter, contactBoxes: [{ position: [0, 6.34, depth / 2 - 0.05], size: [width + 0.5, 0.28, 0.72] }] },
    { ...backGutter, contactBoxes: [{ position: [0, 6.34, -depth / 2 + 0.05], size: [width + 0.5, 0.28, 0.72] }] },
    cylinder("gutter:downpipe", [5.55, 3.25, depth / 2 + 0.26], 0.11, 6.2, "#3c3e3e"),
    cylinder("dish:stem", [-2.6, 3.55, depth / 2 + 0.36], 0.06, 0.48, "#777d7c", [Math.PI / 2, 0, 0]),
    selfContact(part("dish:face", "steel", "cylinder", [-2.6, 3.7, depth / 2 + 0.55], [0.82, 0.08, 0.82], "#8f9694", {
      rotation: [Math.PI / 2 - 0.28, 0, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.7,
    }), [0.8, 0.5, 0.5]),
  );

  return prefab("city:house:old-two-storey", "Rain-streaked two-storey courtyard house", ["city", "building", "old", "courtyard", "structural"], pieces);
}

function courtyardOutbuilding(): ScenePrefabDefinition {
  const pieces: Piece[] = [
    part("foundation", "concrete", "groundTile", [0, 0.15, 0], [7.2, 0.3, 4.8], "#6a665f", { carriesAttachments: true }),
    part("front", "plaster", "panel", [0, 1.65, 2.25], [7, 3.1, 0.3], "#e1ded3", {
      textureProfile: "city-aged-stucco",
      weathering: 0.95,
      carriesAttachments: true,
    }),
    part("back", "plaster", "panel", [0, 1.65, -2.25], [7, 3.1, 0.3], "#d4d1c6", {
      textureProfile: "city-aged-stucco",
      weathering: 0.82,
      carriesAttachments: true,
    }),
    part("left", "plaster", "panel", [-3.35, 1.65, 0], [0.3, 3.1, 4.2], "#d8d5ca", {
      textureProfile: "city-aged-stucco",
      weathering: 0.88,
      carriesAttachments: true,
    }),
    part("right", "plaster", "panel", [3.35, 1.65, 0], [0.3, 3.1, 4.2], "#d8d5ca", {
      textureProfile: "city-aged-stucco",
      weathering: 0.88,
      carriesAttachments: true,
    }),
    part("door", "wood", "plank", [1.75, 1.22, 2.44], [1.25, 2.25, 0.18], "#9a6331", {
      hinge: { pivot: [1.13, 1.22, 2.44], direction: [0, 1, 0], normal: [0, 0, 1] },
      contactBoxes: [{ position: [1.75, 1.22, 2.2], size: [1.4, 2.4, 0.6] }],
    }),
    part("transom", "darkGlass", "glassPane", [1.75, 2.62, 2.44], [1.25, 0.34, 0.12], "#39464a", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [1.75, 2.5, 2.2], size: [1.4, 0.55, 0.6] }],
    }),
    part("tile-patch", "concrete", "panel", [2.7, 1.2, 2.43], [0.62, 2.2, 0.12], "#aa8c78", {
      textureProfile: "city-red-pavers",
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [2.7, 1.2, 2.2], size: [0.8, 2.3, 0.58] }],
    }),
    part("window", "darkGlass", "glassPane", [-1.8, 1.55, 2.43], [1.4, 1.25, 0.12], "#59676a", {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [-1.8, 1.55, 2.2], size: [1.6, 1.5, 0.58] }],
    }),
    part("window-frame-left", "wood", "plank", [-2.56, 1.55, 2.49], [0.12, 1.48, 0.12], "#dedbd1", {
      bearsLoad: false,
      sideAttachmentReach: 0.44,
      contactBoxes: [{ position: [-1.8, 1.55, 2.2], size: [1.8, 1.7, 0.62] }],
    }),
    part("window-frame-right", "wood", "plank", [-1.04, 1.55, 2.49], [0.12, 1.48, 0.12], "#dedbd1", {
      bearsLoad: false,
      sideAttachmentReach: 0.44,
      contactBoxes: [{ position: [-1.8, 1.55, 2.2], size: [1.8, 1.7, 0.62] }],
    }),
    part("window-frame-top", "wood", "plank", [-1.8, 2.24, 2.49], [1.62, 0.12, 0.12], "#dedbd1", {
      bearsLoad: false,
      sideAttachmentReach: 0.44,
      contactBoxes: [{ position: [-1.8, 1.55, 2.2], size: [1.8, 1.7, 0.62] }],
    }),
    part("door-lower-panel", "wood", "plank", [1.75, 0.72, 2.55], [1.0, 0.82, 0.06], "#75451f", {
      bearsLoad: false,
      hinge: { pivot: [1.13, 1.22, 2.44], direction: [0, 1, 0], normal: [0, 0, 1] },
      sideAttachmentReach: 0.26,
    }),
    part("door-upper-panel", "wood", "plank", [1.75, 1.72, 2.55], [1.0, 0.82, 0.06], "#a56f39", {
      bearsLoad: false,
      hinge: { pivot: [1.13, 1.22, 2.44], direction: [0, 1, 0], normal: [0, 0, 1] },
      sideAttachmentReach: 0.26,
    }),
    part("door-middle-rail", "wood", "plank", [1.75, 1.22, 2.58], [1.08, 0.1, 0.08], "#5e351b", {
      bearsLoad: false,
      hinge: { pivot: [1.13, 1.22, 2.44], direction: [0, 1, 0], normal: [0, 0, 1] },
      sideAttachmentReach: 0.26,
    }),
  ];

  for (const side of [-1, 1] as const) {
    pieces.push(selfContact(part(`roof:${side}`, "steel", "panel", [0, 3.65, side * 1.15], [7.6, 0.16, 2.9], "#4d4b49", {
      rotation: [side * 0.38, 0, 0],
      weathering: 0.52,
    }), [7.2, 0.42, 2.7]));
  }
  // Фронтоны и конёк: торцы под скатами закрыты, крыша не «дырявая».
  for (const side of [-1, 1] as const) {
    pieces.push(
      part(`gable:${side}:0`, "plaster", "panel", [side * 3.35, 3.42, 0], [0.28, 0.44, 3.4], "#dbd8cd", {
        textureProfile: "city-aged-stucco",
        weathering: 0.6,
      }),
      part(`gable:${side}:1`, "plaster", "panel", [side * 3.35, 3.84, 0], [0.28, 0.4, 1.7], "#d6d3c8", {
        textureProfile: "city-aged-stucco",
        weathering: 0.55,
      }),
    );
  }
  pieces.push({ ...cylinder("ridge", [0, 4.12, 0], 0.13, 7.5, "#3f3b39", [0, 0, Math.PI / 2]), bearsLoad: false });
  pieces.push(part("damp-base", "concrete", "panel", [0, 0.48, 2.43], [6.8, 0.72, 0.12], "#777268", {
    bearsLoad: false,
    sideAttachmentReach: 0.4,
    weathering: 0.9,
    contactBoxes: [{ position: [0, 0.48, 2.2], size: [6.8, 0.8, 0.58] }],
  }));

  return prefab("city:outbuilding:bicycle-end", "White courtyard outbuilding with timber door", ["city", "building", "old", "courtyard", "structural"], pieces);
}

function hardwareShop(): ScenePrefabDefinition {
  const pieces: Piece[] = [
    part("foundation", "concrete", "groundTile", [0, 0.18, 0], [9.4, 0.36, 5.8], "#6e6961", { carriesAttachments: true }),
    part("body", "plaster", "panel", [0, 1.8, 0], [9.2, 3.3, 5.5], "#cfc2a8", {
      textureProfile: "city-aged-stucco",
      weathering: 0.78,
      carriesAttachments: true,
    }),
    part("plinth", "concrete", "panel", [0, 0.58, 2.81], [9.1, 0.9, 0.14], "#333330", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [0, 0.58, 2.58], size: [9.1, 1.0, 0.6] }],
    }),
    part("door", "steel", "steelSheet", [-0.45, 1.45, 2.86], [1.2, 2.45, 0.14], "#303334", {
      rotation: [0, -0.62, 0],
      hinge: { pivot: [-0.6, 0, 0], direction: [0, 1, 0], normal: [0, 0, 1] },
      contactBoxes: [{ position: [-0.45, 1.45, 2.58], size: [1.5, 2.6, 0.7] }],
    }),
    part("window:left", "glass", "glassPane", [-2.75, 1.65, 2.86], [1.4, 1.55, 0.12], GLASS, {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [-2.75, 1.65, 2.58], size: [1.6, 1.8, 0.65] }],
    }),
    part("window:right", "glass", "glassPane", [2.55, 1.65, 2.86], [1.4, 1.55, 0.12], GLASS, {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [2.55, 1.65, 2.58], size: [1.6, 1.8, 0.65] }],
    }),
    part("sign-red", "steel", "steelSheet", [-1.0, 3.15, 2.94], [2.4, 0.58, 0.12], "#b44b62", {
      bearsLoad: false,
      sideAttachmentReach: 0.45,
      contactBoxes: [{ position: [-1.0, 3.05, 2.58], size: [2.6, 0.8, 0.7] }],
    }),
    part("sign-white", "steel", "steelSheet", [1.35, 3.02, 2.94], [2.1, 0.28, 0.1], "#d9d1c3", {
      bearsLoad: false,
      sideAttachmentReach: 0.45,
      contactBoxes: [{ position: [1.35, 3.02, 2.58], size: [2.3, 0.5, 0.7] }],
    }),
    part("roof", "steel", "panel", [0, 3.62, 0], [9.7, 0.18, 6.15], "#585a58", { weathering: 0.45 }),
  ];
  return prefab("city:shop:hardware", "Neighbourhood hardware shop", ["city", "building", "shop", "structural"], pieces);
}

function servicePodium(): ScenePrefabDefinition {
  const width = 20;
  const depth = 26;
  const height = 5.8;
  const pieces: Piece[] = [
    part("foundation", "concrete", "groundTile", [0, 0.2, 0], [width, 0.4, depth], "#696d6c", {
      carriesAttachments: true,
    }),
    part("wall:west", "concrete", "panel", [-width / 2 + 0.2, height / 2, 0], [0.4, height, depth - 0.4], "#aa9e92", {
      colorSlot: "wall",
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
    part("wall:east", "concrete", "panel", [width / 2 - 0.2, height / 2, 0], [0.4, height, depth - 0.4], "#aa9e92", {
      colorSlot: "wall",
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
    part("wall:north", "concrete", "panel", [0, height / 2, -depth / 2 + 0.2], [width - 0.4, height, 0.4], "#918a82", {
      colorSlot: "accent",
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
    part("wall:south", "concrete", "panel", [0, height / 2, depth / 2 - 0.2], [width - 0.4, height, 0.4], "#918a82", {
      colorSlot: "accent",
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
    part("roof", "concrete", "panel", [0, height - 0.12, 0], [width, 0.24, depth], "#777b79", {
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
  ];

  for (const side of [-1, 1] as const) {
    const x = side * (width / 2 + 0.03);
    for (let bay = 0; bay < 7; bay += 1) {
      const z = -10.3 + bay * 3.43;
      for (let floor = 0; floor < 2; floor += 1) {
        const y = 1.45 + floor * 2.55;
        pieces.push(part(`lane-window:${side}:${floor}:${bay}`, floor === 0 ? "glass" : "darkGlass", "glassPane", [x, y, z], [0.1, floor === 0 ? 1.85 : 1.35, 2.25], floor === 0 ? GLASS : DARK_GLASS, {
          bearsLoad: false,
          sideAttachmentReach: 0.5,
          contactBoxes: [{ position: [side * (width / 2 - 0.18), y, z], size: [0.7, 2.1, 2.55] }],
        }));
      }
    }
  }
  pieces.push(
    part("service-door", "steel", "steelSheet", [width / 2 + 0.04, 1.25, 8.55], [0.12, 2.35, 1.35], "#272c2d", {
      hinge: { pivot: [0, 0, -0.67], direction: [0, 1, 0], normal: [1, 0, 0] },
      contactBoxes: [{ position: [width / 2 - 0.2, 1.25, 8.55], size: [0.7, 2.5, 1.55] }],
    }),
    part("studio-sign", "steel", "steelSheet", [width / 2 + 0.05, 3.2, 6.8], [0.12, 0.45, 2.8], "#b88c52", {
      bearsLoad: false,
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [width / 2 - 0.2, 3.2, 6.8], size: [0.7, 0.7, 3.1] }],
    }),
  );

  return prefab("city:podium:service", "Two-storey service podium", ["city", "building", "podium", "service-lane", "structural"], pieces);
}

function ledCommercialHall(): ScenePrefabDefinition {
  const pieces: Piece[] = [
    part("foundation", "concrete", "groundTile", [0, 0.2, 0], [26, 0.4, 14], "#606361", { carriesAttachments: true }),
    part("hall", "concrete", "panel", [0, 3.5, 0], [25.6, 6.6, 13.6], "#777b78", {
      textureProfile: "city-facade-cladding",
      carriesAttachments: true,
    }),
    part("roof", "steel", "panel", [0, 6.88, 0], [26.4, 0.18, 14.4], "#3b4242", { carriesAttachments: true }),
    part("screen", "darkGlass", "glassPane", [1.8, 4.45, -6.88], [18.8, 4.15, 0.16], "#7d9de4", {
      bearsLoad: false,
      sideAttachmentReach: 0.65,
      light: { color: "#7ba8ff", distance: 15, intensity: 18 },
      contactBoxes: [{ position: [1.8, 4.45, -6.55], size: [19.2, 4.45, 0.82] }],
    }),
    part("screen:left", "glass", "glassPane", [-3.2, 4.45, -6.98], [7.8, 3.85, 0.08], "#bb83db", {
      bearsLoad: false,
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [-3.2, 4.45, -6.55], size: [8.1, 4.1, 0.82] }],
    }),
    part("screen:right", "glass", "glassPane", [5.9, 4.45, -6.98], [9.7, 3.85, 0.08], "#95c3ef", {
      bearsLoad: false,
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [5.9, 4.45, -6.55], size: [10.0, 4.1, 0.82] }],
    }),
    part("pattern-band", "concrete", "panel", [-9.5, 2.8, -6.92], [5.6, 5.2, 0.2], "#444c49", {
      textureProfile: "city-red-aggregate",
      bearsLoad: false,
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [-9.5, 2.8, -6.55], size: [5.9, 5.5, 0.82] }],
    }),
  ];
  return prefab("city:commercial:led-hall", "Low commercial hall with corner LED wall", ["city", "building", "commercial", "billboard", "structural"], pieces);
}

function yellowCourtyardWing(): ScenePrefabDefinition {
  const width = 26;
  const depth = 8;
  const floorHeight = 2.75;
  const floors = 6;
  const pieces: Piece[] = [
    selfContact(part("foundation", "concrete", "groundTile", [0, 0.2, 0], [width, 0.4, depth], "#746f64", { carriesAttachments: true })),
  ];

  for (let floor = 0; floor < floors; floor += 1) {
    const y0 = floor * floorHeight;
    pieces.push(part(`storey:${floor}`, "concrete", "panel", [0, y0 + 1.47, 0], [width - 0.3, 2.94, depth - 0.3], floor % 2 === 0 ? "#d7b65f" : "#dec36f", {
      colorSlot: "wall",
      textureProfile: "city-aged-stucco",
      carriesAttachments: true,
      contactBoxes: [{
        position: [0, y0 + 0.4 + floorHeight / 2, 0],
        size: [width - 0.3, floorHeight, depth - 0.3],
      }],
    }));
    for (const side of [-1, 1] as const) {
      const z = side * (depth / 2 + 0.02);
      for (let bay = 0; bay < 8; bay += 1) {
        const x = -10.5 + bay * 3;
        pieces.push(
          part(`window:${side}:${floor}:${bay}`, floor % 4 === 1 && bay % 3 === 0 ? "glass" : "darkGlass", "glassPane", [x, y0 + 1.6, z], [1.25, 1.45, 0.1], floor % 4 === 1 && bay % 3 === 0 ? litWindowColor : DARK_GLASS, {
            bearsLoad: false,
            sideAttachmentReach: 0.5,
            contactBoxes: [{ position: [x, y0 + 1.6, side * (depth / 2 - 0.2)], size: [1.55, 1.75, 0.65] }],
          }),
          part(`sill:${side}:${floor}:${bay}`, "concrete", "panel", [x, y0 + 0.82, z + side * 0.05], [1.55, 0.12, 0.32], "#eadb9d", {
            bearsLoad: false,
            sideAttachmentReach: 0.45,
            contactBoxes: [{ position: [x, y0 + 0.9, side * (depth / 2 - 0.2)], size: [1.7, 0.38, 0.65] }],
          }),
        );
      }
    }
  }
  const roofY = floors * floorHeight + 0.18;
  pieces.push(part("roof", "steel", "panel", [0, roofY, 0], [width + 0.7, 0.32, depth + 0.8], "#7b3534", {
    textureProfile: "city-roof-tile",
    carriesAttachments: true,
    contactBoxes: [{ position: [0, roofY + 0.29, 0], size: [width + 0.7, 0.1, depth + 0.8] }],
  }));
  for (let index = 0; index < 9; index += 1) {
    const finial = cylinder(`finial:${index}`, [-12 + index * 3, roofY + 0.6, 0], 0.12, 1.0, "#b89542");
    pieces.push({
      ...finial,
      contactBoxes: [{ position: [-12 + index * 3, roofY + 0.65, 0], size: [0.12, 0.7, 0.12] }],
    });
  }

  return prefab("city:block:yellow-courtyard", "Yellow residential courtyard wing", ["city", "building", "courtyard", "ornate", "structural"], pieces);
}

function breezeFenceSection(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  const width = 4;
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      pieces.push(part(`base:${row}:${column}`, "concrete", "cinderBlock", [-width / 2 + 0.34 + column * 0.66, 0.28 + row * 0.52, 0], [0.62, 0.46, 0.42], RED_AGGREGATE, {
        textureProfile: "city-red-aggregate",
        weathering: 0.34,
      }));
    }
  }
  for (let row = 0; row < 3; row += 1) {
    const y = 1.22 + row * 0.43;
    for (let cell = 0; cell < 5; cell += 1) {
      const x = -1.6 + cell * 0.8;
      for (const slope of [-1, 1] as const) {
        pieces.push(selfContact(part(`lattice:${row}:${cell}:${slope}`, "concrete", "panel", [x, y, 0], [0.11, 0.86, 0.35], RED_AGGREGATE, {
          rotation: [0, 0, slope * 0.64],
          textureProfile: "city-red-aggregate",
          sideAttachmentReach: 0.52,
          weathering: 0.3,
        }), [0.6, 0.42, 0.4]));
      }
    }
  }
  pieces.push(part("cap", "concrete", "panel", [0, 2.38, 0], [4.08, 0.16, 0.52], "#71382f", {
    textureProfile: "city-red-aggregate",
    weathering: 0.34,
  }));
  return prefab("city:fence:breeze-section", "Red perforated courtyard wall section", ["city", "fence", "courtyard", "masonry"], pieces);
}

function fencePillarLamp(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (let course = 0; course < 5; course += 1) {
    pieces.push(part(`pillar:${course}`, "concrete", "cinderBlock", [0, 0.27 + course * 0.5, 0], [0.72, 0.46, 0.72], RED_AGGREGATE, {
      textureProfile: "city-red-aggregate",
      weathering: 0.34,
      carriesAttachments: true,
    }));
  }
  pieces.push(
    part("cap", "concrete", "panel", [0, 2.7, 0], [0.9, 0.18, 0.9], "#66342e", {
      textureProfile: "city-red-aggregate",
      carriesAttachments: true,
    }),
    part("lamp-stem", "steel", "steelSheet", [0, 2.98, 0], [0.16, 0.42, 0.16], DARK_STEEL, {
      carriesAttachments: true,
    }),
    part("lamp-glass", "glass", "glassPane", [0, 3.32, 0], [0.48, 0.52, 0.48], litWindowColor, {
      bearsLoad: false,
      light: { color: "#ffd88a", distance: 8, intensity: 16 },
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [0, 3.18, 0], size: [0.55, 0.8, 0.55] }],
    }),
    part("lamp-hat", "steel", "steelSheet", [0, 3.63, 0], [0.68, 0.09, 0.68], DARK_STEEL, {
      bearsLoad: false,
      sideAttachmentReach: 0.55,
      contactBoxes: [{ position: [0, 3.35, 0], size: [0.72, 0.7, 0.72] }],
    }),
  );
  return prefab("city:fence:pillar-lamp", "Heavy red wall pillar with lantern", ["city", "fence", "lamp", "courtyard"], pieces);
}

function weatheredBlueGate(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (const side of [-1, 1] as const) {
    const x = side * 2.55;
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const exposed = (row + column * 3 + (side > 0 ? 1 : 0)) % 5 === 0;
        pieces.push(part(`pillar:${side}:${row}:${column}`, "brick", "brick", [x + (column - 0.5) * 0.42, 0.14 + row * 0.28, 0], [0.38, 0.24, 0.7], exposed ? "#70594d" : WHITE_PAINT, {
          weathering: exposed ? 0.6 : 0.82,
          carriesAttachments: true,
        }));
      }
    }
    pieces.push(part(`pillar-cap:${side}`, "concrete", "panel", [x, 2.48, 0], [1.05, 0.22, 0.92], "#bcb7ab", { weathering: 0.72 }));
  }
  // The reference yard is entered through the open left half of the gateway;
  // the weathered blue leaf remains shut on the service side.
  for (const side of [1] as const) {
    pieces.push(part(`leaf:${side}`, "steel", "steelSheet", [side * 1.25, 1.15, 0], [2.35, 2.2, 0.16], "#8da7ad", {
      hinge: { pivot: [side * 2.4, 1.15, 0], direction: [0, 1, 0], normal: [0, 0, 1] },
      weathering: 0.48,
    }));
    for (let rib = 0; rib < 7; rib += 1) {
      pieces.push(part(`leaf:${side}:rib:${rib}`, "steel", "steelSheet", [side * 1.25 - 0.88 + rib * 0.29, 1.15, 0.11], [0.045, 2.1, 0.06], "#718d94", {
        bearsLoad: false,
        sideAttachmentReach: 0.24,
        contactBoxes: [{ position: [side * 1.25, 1.15, 0], size: [2.35, 2.2, 0.4] }],
      }));
    }
  }
  pieces.push(
    cylinder("gas:top", [0, 2.72, -0.1], 0.09, 5.8, YELLOW_GAS, [0, 0, Math.PI / 2]),
    part("meter-box", "steel", "steelSheet", [2.55, 1.35, 0.48], [0.52, 0.68, 0.24], "#315b86", {
      bearsLoad: false,
      sideAttachmentReach: 0.5,
      contactBoxes: [{ position: [2.55, 1.35, 0.1], size: [0.7, 0.9, 0.8] }],
    }),
  );
  return prefab("city:gate:weathered-blue", "Peeling white-brick gate with blue leaves", ["city", "gate", "brick", "gas", "courtyard"], pieces);
}

function bicycle(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (const [index, x] of [-0.78, 0.78].entries()) {
    pieces.push(
      selfContact(part(`wheel:${index}`, "steel", "cylinder", [x, 0.47, 0], [0.9, 0.07, 0.9], "#202426", {
        rotation: [Math.PI / 2, 0, 0],
        bearsLoad: index === 0,
      }), [0.9, 0.9, 0.2]),
      selfContact(part(`hub:${index}`, "steel", "cylinder", [x, 0.47, 0], [0.12, 0.14, 0.12], "#7f8788", {
        rotation: [Math.PI / 2, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.25,
      }), [0.25, 0.25, 0.25]),
    );
  }
  // Рама, вилка и руль соединены через явный вынос — ничего не висит.
  pieces.push(
    selfContact(part("frame:lower", "steel", "cylinder", [0, 0.55, 0], [0.09, 1.55, 0.09], "#374e62", { rotation: [0, 0, Math.PI / 2] }), [1.55, 0.2, 0.2]),
    selfContact(part("frame:top", "steel", "cylinder", [0.1, 0.98, 0], [0.07, 1.15, 0.07], "#3f5871", { rotation: [0, 0, Math.PI / 2 - 0.1] }), [1.1, 0.3, 0.2]),
    selfContact(part("frame:front", "steel", "cylinder", [0.48, 0.78, 0], [0.07, 0.85, 0.07], "#496b86", { rotation: [0, 0, -0.58] }), [0.6, 0.7, 0.2]),
    selfContact(part("frame:rear", "steel", "cylinder", [-0.4, 0.75, 0], [0.07, 0.8, 0.07], "#496b86", { rotation: [0, 0, 0.68] }), [0.6, 0.7, 0.2]),
    cylinder("seat-post", [-0.26, 1.0, 0], 0.055, 0.5, "#34393a", [0, 0, 0.16]),
    part("seat", "steel", "panel", [-0.31, 1.28, 0], [0.42, 0.09, 0.2], "#171a1b", { bearsLoad: false, sideAttachmentReach: 0.26 }),
    cylinder("fork", [0.72, 0.85, 0], 0.055, 0.85, "#31383a", [0, 0, -0.16]),
    cylinder("stem", [0.79, 1.32, 0], 0.05, 0.3, "#31383a", [0, 0, -0.1]),
    cylinder("handlebar", [0.8, 1.47, 0], 0.05, 0.58, "#2c3234", [Math.PI / 2, 0, 0]),
  );
  return prefab("city:bicycle", "Everyday city bicycle", ["city", "vehicle", "bicycle", "prop"], pieces);
}

function streetLamp(id: string, ring = false): ScenePrefabDefinition {
  const pieces: Piece[] = [
    cylinder("pole", [0, 2.45, 0], 0.16, 4.9, "#6d7374"),
  ];
  if (ring) {
    pieces.push(
      selfContact(part("ring", "steel", "cylinder", [0, 5.05, 0], [0.92, 0.11, 0.92], "#4c5354", { bearsLoad: false, sideAttachmentReach: 0.6 }), [0.9, 0.4, 0.9]),
      part("light", "glass", "glassPane", [0, 4.92, 0], [0.62, 0.18, 0.62], litWindowColor, {
        bearsLoad: false,
        light: { color: "#f4d89c", distance: 12, intensity: 22 },
        sideAttachmentReach: 0.55,
        contactBoxes: [{ position: [0, 5.0, 0], size: [0.85, 0.45, 0.85] }],
      }),
    );
  } else {
    pieces.push(
      part("head", "steel", "steelSheet", [0, 4.9, 0.24], [0.62, 0.22, 0.78], "#4d5556", { bearsLoad: false, sideAttachmentReach: 0.55 }),
      part("light", "glass", "glassPane", [0, 4.78, 0.27], [0.48, 0.12, 0.58], litWindowColor, {
        bearsLoad: false,
        light: { color: "#f5dda5", distance: 12, intensity: 20 },
        sideAttachmentReach: 0.55,
      }),
    );
  }
  return prefab(id, ring ? "Ring-headed park lamp" : "Simple urban lamp", ["city", "lamp", "street", "light"], pieces);
}

function trafficSignal(): ScenePrefabDefinition {
  const pieces: Piece[] = [cylinder("pole", [0, 2.7, 0], 0.18, 5.4, "#6e7374")];
  for (const [index, color] of ["#b52f29", "#c5942d", "#3f8754"].entries()) {
    pieces.push(part(`signal:${index}`, "glass", "glassPane", [0, 4.65 - index * 0.42, 0.23], [0.3, 0.3, 0.12], index === 0 ? litWindowColor : color, {
      bearsLoad: false,
      light: index === 0 ? { color: "#ff3b2f", distance: 7, intensity: 10 } : undefined,
      sideAttachmentReach: 0.45,
      contactBoxes: [{ position: [0, 4.25, 0], size: [0.55, 1.45, 0.6] }],
    }));
  }
  pieces.push(part("housing", "steel", "steelSheet", [0, 4.25, 0], [0.5, 1.45, 0.42], "#202526", {
    carriesAttachments: true,
    sideAttachmentReach: 0.45,
  }));
  return prefab("city:traffic-signal", "Pedestrian traffic signal", ["city", "street", "signal", "light"], pieces);
}

function ledBillboard(): ScenePrefabDefinition {
  return prefab("city:billboard:led", "Large rain-lit LED billboard", ["city", "street", "billboard", "light"], [
    ...[-2.7, 2.7].map((x, index) => cylinder(`post:${index}`, [x, 2.6, 0], 0.28, 5.2, "#5f6667")),
    part("screen", "darkGlass", "glassPane", [0, 5.8, 0], [7.8, 3.2, 0.28], "#7691d4", {
      light: { color: "#879cff", distance: 18, intensity: 30 },
      carriesAttachments: true,
    }),
    part("screen-band-left", "glass", "glassPane", [-2.55, 5.8, 0.16], [2.55, 3.0, 0.08], "#c38ad6", { bearsLoad: false, sideAttachmentReach: 0.5 }),
    part("screen-band-right", "glass", "glassPane", [2.1, 5.8, 0.16], [3.45, 3.0, 0.08], "#9fc7eb", { bearsLoad: false, sideAttachmentReach: 0.5 }),
    part("frame-top", "steel", "steelSheet", [0, 7.47, 0], [8.2, 0.18, 0.42], DARK_STEEL),
    part("frame-bottom", "steel", "steelSheet", [0, 4.13, 0], [8.2, 0.18, 0.42], DARK_STEEL),
  ]);
}

function securityCamera(): ScenePrefabDefinition {
  return prefab("city:security-camera", "Wall-mounted security camera", ["city", "security", "camera", "mounted"], [
    part("bracket", "steel", "steelSheet", [0, 0.05, 0], [0.12, 0.12, 0.72], "#b9bcb8", { bearsLoad: false, sideAttachmentReach: 0.7 }),
    part("body", "steel", "steelSheet", [0, 0.05, 0.48], [0.24, 0.22, 0.5], "#d9dad5", { bearsLoad: false, sideAttachmentReach: 0.75 }),
    part("lens", "darkGlass", "glassPane", [0, 0.05, 0.75], [0.12, 0.12, 0.08], "#1b2224", { bearsLoad: false, sideAttachmentReach: 0.75 }),
  ]);
}

function roadSign(
  id: string,
  displayName: string,
  symbol: "one-way" | "parking",
): ScenePrefabDefinition {
  const pieces: Piece[] = [
    cylinder("pole", [0, 1.45, 0], 0.09, 2.9, "#858b8b"),
    part("plate", "steel", "steelSheet", [0, 2.55, 0], [0.82, 0.82, 0.08], "#2160ad", {
      bearsLoad: false,
      sideAttachmentReach: 0.48,
      contactBoxes: [{ position: [0, 2.55, 0], size: [0.9, 0.9, 0.5] }],
    }),
  ];
  if (symbol === "one-way") {
    pieces.push(
      part("arrow-shaft", "steel", "steelSheet", [0, 2.54, 0.06], [0.14, 0.5, 0.05], "#f1f2ed", { bearsLoad: false, sideAttachmentReach: 0.45 }),
      selfContact(part("arrow-left", "steel", "steelSheet", [-0.13, 2.72, 0.06], [0.11, 0.38, 0.05], "#f1f2ed", { rotation: [0, 0, 0.72], bearsLoad: false, sideAttachmentReach: 0.45 }), [0.4, 0.4, 0.4]),
      selfContact(part("arrow-right", "steel", "steelSheet", [0.13, 2.72, 0.06], [0.11, 0.38, 0.05], "#f1f2ed", { rotation: [0, 0, -0.72], bearsLoad: false, sideAttachmentReach: 0.45 }), [0.4, 0.4, 0.4]),
    );
  } else {
    pieces.push(
      part("p-stem", "steel", "steelSheet", [-0.16, 2.55, 0.06], [0.12, 0.5, 0.05], "#f1f2ed", { bearsLoad: false, sideAttachmentReach: 0.45 }),
      part("p-bowl", "steel", "cinderBlock", [0.06, 2.68, 0.06], [0.4, 0.3, 0.05], "#f1f2ed", { bearsLoad: false, sideAttachmentReach: 0.45 }),
    );
  }
  return prefab(id, displayName, ["city", "street", "sign", symbol], pieces);
}

function bollard(): ScenePrefabDefinition {
  return prefab("city:bollard", "Black-red removable lane bollard", ["city", "street", "bollard"], [
    part("base", "steel", "steelSheet", [0, 0.05, 0], [0.58, 0.1, 0.58], "#202526", { carriesAttachments: true }),
    part("post", "steel", "steelSheet", [0, 0.5, 0], [0.14, 0.9, 0.14], "#252a2b", { carriesAttachments: true }),
    part("reflector", "steel", "steelSheet", [0, 0.68, 0], [0.17, 0.14, 0.17], "#c94036", { bearsLoad: false, sideAttachmentReach: 0.2 }),
  ]);
}

function curb(id: string, displayName: string, color: string): ScenePrefabDefinition {
  return prefab(id, displayName, ["city", "street", "curb", "infrastructure"], [
    part("body", "concrete", "stoneBlock", [0, 0.16, 0], [4, 0.32, 0.34], color, {
      textureProfile: "city-facade-cladding",
      weathering: 0.35,
    }),
  ]);
}

function gasService(): ScenePrefabDefinition {
  return prefab("city:gas-service", "Exposed yellow gas service", ["city", "utility", "gas", "mounted"], [
    cylinder("horizontal", [0, 1.9, 0], 0.09, 4.6, YELLOW_GAS, [0, 0, Math.PI / 2]),
    cylinder("drop-left", [-2.25, 0.95, 0], 0.09, 1.9, YELLOW_GAS),
    cylinder("drop-right", [2.25, 0.95, 0], 0.09, 1.9, YELLOW_GAS),
    part("valve", "steel", "cylinder", [2.25, 0.78, 0.12], [0.22, 0.08, 0.22], "#325b83", { rotation: [Math.PI / 2, 0, 0], bearsLoad: false, sideAttachmentReach: 0.3 }),
  ]);
}

function toolDisplay(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (let index = 0; index < 5; index += 1) {
    const handleLength = 1.8 + (index % 3) * 0.18;
    pieces.push(
      cylinder(`handle:${index}`, [-0.8 + index * 0.38, handleLength / 2, 0], 0.045, handleLength, index < 3 ? "#a27345" : "#68885b", [0, 0, (index - 2) * 0.045], "wood"),
      part(`head:${index}`, "steel", index < 3 ? "steelSheet" : "panel", [-0.8 + index * 0.38, 0.08, 0], index < 3 ? [0.28, 0.3, 0.08] : [0.18, 0.5, 0.08], index < 3 ? "#8a9090" : "#9b4734", { bearsLoad: false, sideAttachmentReach: 0.28 }),
    );
  }
  for (let index = 0; index < 4; index += 1) {
    pieces.push(
      cylinder(`broom-handle:${index}`, [1.25 + index * 0.25, 0.95, 0], 0.04, 1.9, "#a37649", [0, 0, (index - 1.5) * 0.04], "wood"),
      part(`broom-head:${index}`, "foliage", "panel", [1.25 + index * 0.25, 0.12, 0], [0.42, 0.34, 0.16], index % 2 === 0 ? "#b55a36" : "#a94730", { bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.32 }),
    );
  }
  return prefab("city:shop-tools", "Brooms, shovels and rakes outside a shop", ["city", "shop", "tools", "clutter"], pieces);
}

function wheelbarrow(): ScenePrefabDefinition {
  return prefab("city:wheelbarrow", "Green builder's wheelbarrow", ["city", "shop", "tool", "prop"], [
    selfContact(part("wheel", "steel", "cylinder", [0, 0.38, 0.75], [0.54, 0.12, 0.54], "#242829", { rotation: [Math.PI / 2, 0, 0] }), [0.55, 0.55, 0.22]),
    selfContact(part("tray", "steel", "panel", [0, 0.68, -0.05], [1.0, 0.35, 1.35], "#4b8b68", { rotation: [-0.12, 0, 0] }), [1.0, 0.48, 1.2]),
    ...[-1, 1].map((side) => cylinder(`handle:${side}`, [side * 0.38, 0.55, -0.95], 0.055, 1.5, "#315b47", [Math.PI / 2 - 0.12, 0, 0])),
    ...[-1, 1].map((side) => cylinder(`leg:${side}`, [side * 0.32, 0.28, -0.35], 0.05, 0.55, "#315b47", [0, 0, side * 0.16])),
  ]);
}

function vehicle(
  id: string,
  displayName: string,
  kind: "sedan" | "minivan" | "mini-truck",
): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  const length = kind === "minivan" ? 4.8 : kind === "mini-truck" ? 4.5 : 4.25;
  const bodyColor = kind === "sedan" ? "#d8d9d6" : kind === "minivan" ? "#e1e0da" : "#cfd4d2";
  pieces.push(
    part("chassis", "steel", "steelSheet", [0, 0.65, 0], [1.85, 0.52, length], bodyColor, { colorSlot: "body", carriesAttachments: true }),
    part("cabin", "steel", "panel", [0, kind === "minivan" ? 1.35 : 1.15, kind === "mini-truck" ? 0.9 : -0.15], [1.72, kind === "minivan" ? 1.3 : 0.9, kind === "mini-truck" ? 1.65 : length * 0.52], bodyColor, { colorSlot: "body", carriesAttachments: true }),
    part("windshield", "darkGlass", "glassPane", [0, kind === "minivan" ? 1.55 : 1.35, kind === "mini-truck" ? 1.78 : length * 0.16], [1.5, 0.62, 0.1], "#34464e", { rotation: [-0.22, 0, 0], bearsLoad: false, sideAttachmentReach: 0.5 }),
  );
  if (kind === "mini-truck") {
    pieces.push(part("cargo-bed", "steel", "panel", [0, 0.93, -1.15], [1.72, 0.65, 2.0], "#c8cecb", { colorSlot: "body" }));
  } else {
    for (const side of [-1, 1] as const) {
      pieces.push(part(`side-glass:${side}`, "darkGlass", "glassPane", [side * 0.88, kind === "minivan" ? 1.47 : 1.3, -0.15], [0.08, kind === "minivan" ? 0.82 : 0.58, kind === "minivan" ? 2.4 : 1.6], "#32464e", { bearsLoad: false, sideAttachmentReach: 0.45 }));
    }
  }
  for (const side of [-1, 1] as const) {
    for (const z of [-length * 0.31, length * 0.31]) {
      pieces.push(selfContact(part(`wheel:${side}:${z}`, "steel", "cylinder", [side * 0.98, 0.45, z], [0.72, 0.18, 0.72], "#202324", { rotation: [0, 0, Math.PI / 2] }), [0.3, 0.72, 0.72]));
    }
  }
  pieces.push(
    part("headlight:left", "glass", "glassPane", [-0.52, 0.78, length / 2 + 0.06], [0.36, 0.22, 0.08], "#e9e4bd", {
      bearsLoad: false,
      sideAttachmentReach: 0.8,
      contactBoxes: [{ position: [-0.52, 0.78, length / 2 - 0.35], size: [0.48, 0.3, 1.0] }],
    }),
    part("headlight:right", "glass", "glassPane", [0.52, 0.78, length / 2 + 0.06], [0.36, 0.22, 0.08], "#e9e4bd", {
      bearsLoad: false,
      sideAttachmentReach: 0.8,
      contactBoxes: [{ position: [0.52, 0.78, length / 2 - 0.35], size: [0.48, 0.3, 1.0] }],
    }),
  );
  return prefab(id, displayName, ["city", "vehicle", kind, "prop"], pieces);
}

function parkModule(
  id: string,
  displayName: string,
  kind: "stairs" | "ramp" | "retaining" | "railing" | "lawn-fence" | "linear-drain",
): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  if (kind === "stairs") {
    for (let step = 0; step < 6; step += 1) {
      pieces.push(part(`step:${step}`, "concrete", "stoneBlock", [0, 0.15 + step * 0.22, -1.5 + step * 0.48], [3.0, 0.3, 0.62], "#837a70", { textureProfile: "city-red-pavers" }));
    }
  } else if (kind === "ramp") {
    pieces.push(selfContact(part("deck", "concrete", "panel", [0, 0.72, 0], [2.2, 0.24, 6.2], "#817970", { rotation: [-0.14, 0, 0], textureProfile: "city-red-pavers" }), [2.2, 0.6, 6.0]));
    for (const side of [-1, 1] as const) {
      for (const z of [-2.7, -1.35, 0, 1.35, 2.7]) {
        pieces.push(cylinder(`rail-post:${side}:${z}`, [side * 1.08, 1.15 - z * 0.14, z], 0.06, 1.1, "#9ca2a1"));
      }
      pieces.push(cylinder(`rail-top:${side}`, [side * 1.08, 1.8, 0], 0.07, 6.15, "#9ca2a1", [Math.PI / 2 - 0.14, 0, 0]));
    }
  } else if (kind === "retaining") {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        pieces.push(part(`block:${row}:${column}`, "concrete", "cinderBlock", [-2.4 + column * 1.2, 0.3 + row * 0.55, 0], [1.12, 0.5, 0.72], "#746f67", { weathering: 0.38 }));
      }
    }
    pieces.push(part("cap", "stone", "stoneBlock", [0, 1.8, 0], [6.2, 0.2, 0.86], "#817b72", { weathering: 0.3 }));
  } else if (kind === "railing" || kind === "lawn-fence") {
    const height = kind === "railing" ? 1.15 : 0.62;
    const span = kind === "railing" ? 3.2 : 2.4;
    for (const x of [-span / 2, 0, span / 2]) {
      pieces.push(cylinder(`post:${x}`, [x, height / 2, 0], kind === "railing" ? 0.07 : 0.05, height, kind === "railing" ? "#7f8787" : "#3a3532"));
    }
    pieces.push(cylinder("top", [0, height, 0], kind === "railing" ? 0.07 : 0.055, span + 0.1, kind === "railing" ? "#9da4a3" : "#3a3532", [0, 0, Math.PI / 2]));
    if (kind === "lawn-fence") {
      pieces.push(cylinder("lower", [0, 0.22, 0], 0.045, span + 0.1, "#3a3532", [0, 0, Math.PI / 2]));
    }
  } else {
    pieces.push(part("channel", "concrete", "groundTile", [0, 0.08, 0], [4.0, 0.16, 0.42], "#686967", { carriesAttachments: true }));
    for (let slot = 0; slot < 10; slot += 1) {
      pieces.push(part(`slot:${slot}`, "steel", "steelSheet", [-1.8 + slot * 0.4, 0.18, 0], [0.08, 0.06, 0.34], "#303536", { bearsLoad: false, sideAttachmentReach: 0.18 }));
    }
  }
  return prefab(id, displayName, ["city", "infrastructure", "park", kind], pieces);
}

function streetTree(seed: number): ScenePrefabDefinition {
  const pieces = propBirch({ seed, scale: 1.35 }).map((piece): Piece =>
    piece.id === "trunk"
      ? { ...piece, color: "#6d6253" }
      : piece,
  );
  pieces.push(
    part("whitewash", "plaster", "cylinder", [0, 0.72, 0], [0.36, 1.42, 0.36], "#d8d4c7", {
      bearsLoad: false,
      weathering: 0.5,
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0, 0.72, 0], size: [0.42, 1.45, 0.42] }],
    }),
  );
  return prefab(`city:tree:whitewashed:${seed}`, "Whitewashed street tree", ["city", "flora", "tree", "whitewashed"], pieces);
}

function hedge(): ScenePrefabDefinition {
  return prefab("city:hedge:segment", "Clipped rain-heavy hedge", ["city", "flora", "hedge", "landscape"], [
    selfContact(part("trunk-left", "wood", "cylinder", [-0.75, 0.55, 0], [0.12, 1.1, 0.12], "#4c3d31", { carriesAttachments: true })),
    selfContact(part("trunk-right", "wood", "cylinder", [0.75, 0.55, 0], [0.12, 1.1, 0.12], "#4c3d31", { carriesAttachments: true })),
    selfContact(part("foliage-low", "foliage", "panel", [0, 0.62, 0], [2.05, 1.1, 0.72], "#34502f", { volume: 0.24, bearsLoad: false, sideAttachmentReach: 0.85 })),
    selfContact(part("foliage-top", "foliage", "panel", [0, 1.18, 0], [1.9, 0.54, 0.68], "#41613a", { volume: 0.2, bearsLoad: false, sideAttachmentReach: 0.8 })),
  ]);
}

function flowerBed(): ScenePrefabDefinition {
  const pieces: Piece[] = [part("soil", "soil", "groundTile", [0, 0.12, 0], [2.4, 0.24, 0.78], "#493b2e", { carriesAttachments: true })];
  const colors = ["#e5c940", "#7b54a0", "#db6c8a", "#e7e2cb"];
  for (let index = 0; index < 12; index += 1) {
    const x = -1.05 + (index % 6) * 0.42;
    const z = index < 6 ? -0.18 : 0.18;
    pieces.push(
      cylinder(`stem:${index}`, [x, 0.36, z], 0.025, 0.42, "#527044", [0, 0, (index % 3 - 1) * 0.12], "foliage"),
      part(`flower:${index}`, "foliage", "panel", [x, 0.6, z], [0.18, 0.12, 0.18], colors[index % colors.length], {
        bearsLoad: false,
        volume: 0.003,
        sideAttachmentReach: 0.3,
        contactBoxes: [{ position: [x, 0.36, z], size: [0.2, 0.56, 0.2] }],
      }),
    );
  }
  return prefab("city:flower-bed", "Small tended flower bed", ["city", "flora", "flowers", "courtyard"], pieces);
}

// ---------------------------------------------------------------------------
// Задворки: киоск, заборы трёх пород, навес с гирляндой, бельё, самокат —
// предметы, снятые с натуры. Каждый отвечает на вопрос «кто это оставил».
// ---------------------------------------------------------------------------

const TAR_BLACK = "#26251f";
const RUST_FASCIA = "#6e5544";
const GAS_BRIGHT = "#d9a832";

// ---------------------------------------------------------------------------
// Частный оштукатуренный дом, построенный по-настоящему: стены встык без
// нахлёстов, проёмы с перемычками и подоконными панелями, рамы и тёмные
// стёкла, фронтоны или вальмы с коньком, чердачное перекрытие, а внутри —
// лестница на второй этаж, перегородки, печь, кровати и ковёр на стене.
// ---------------------------------------------------------------------------

interface HouseOpening {
  /** Center along the wall's own axis, house-local. */
  readonly center: number;
  readonly width: number;
  readonly kind: "window" | "door";
}

interface StuccoHouseOptions {
  readonly id: string;
  readonly displayName: string;
  readonly width: number;
  readonly depth: number;
  readonly storey: number;
  readonly wall: string;
  readonly roof: "gable-steel" | "hip-tile";
  readonly roofColor: string;
  readonly plinth: "rough" | "tar";
  readonly cornerTrim?: boolean;
  readonly dish?: boolean;
  /** Which end wall (x sign) carries the yellow gas riser. */
  readonly gasEnd?: 1 | -1;
  readonly openings: {
    readonly front: readonly (readonly HouseOpening[])[];
    readonly back: readonly (readonly HouseOpening[])[];
    readonly west: readonly (readonly HouseOpening[])[];
    readonly east: readonly (readonly HouseOpening[])[];
  };
}

function stuccoHouse(options: StuccoHouseOptions): ScenePrefabDefinition {
  const { width, depth, storey } = options;
  const wallT = 0.34;
  const base = 0.4;
  const top = base + storey * 2;
  const pieces: Piece[] = [
    selfContact(part("foundation", "concrete", "groundTile", [0, base / 2, 0], [width, base, depth], "#6f6a60", {
      carriesAttachments: true,
      weathering: 0.5,
    })),
  ];
  const frameWhite = "#d9d6cc";
  const glassTint = "#3d4a52";

  // Одна грань фасада: колонны-простенки на всю высоту этажа, под окнами —
  // подоконные панели, над проёмами — перемычки. Никаких сквозных дыр.
  const buildWall = (
    face: "front" | "back" | "west" | "east",
    floor: number,
  ): void => {
    const alongX = face === "front" || face === "back";
    const sign = face === "front" || face === "east" ? 1 : -1;
    const fixed = alongX ? sign * (depth / 2 - wallT / 2) : sign * (width / 2 - wallT / 2);
    const length = alongX ? width : depth - wallT * 2;
    const y0 = base + floor * storey;
    const y1 = y0 + storey;
    const openings = options.openings[face][floor] ?? [];
    const at = (u: number, y: number): SceneVector3 =>
      alongX ? [u, y, fixed] : [fixed, y, u];
    const sized = (w: number, h: number, t = wallT): SceneVector3 =>
      alongX ? [w, h, t] : [t, h, w];
    const wallPiece = (id: string, u0: number, u1: number): void => {
      if (u1 - u0 < 0.05) {
        return;
      }
      pieces.push(part(`${face}:${floor}:${id}`, "plaster", "panel",
        at((u0 + u1) / 2, (y0 + y1) / 2), sized(u1 - u0, storey), options.wall, {
          colorSlot: "plaster",
          textureProfile: "city-aged-stucco",
          weathering: floor === 0 ? 0.82 : 0.55,
          carriesAttachments: true,
        }));
    };

    const sorted = [...openings].sort((a, b) => a.center - b.center);
    let cursor = -length / 2;
    for (const [index, opening] of sorted.entries()) {
      const left = opening.center - opening.width / 2;
      const right = opening.center + opening.width / 2;
      wallPiece(`seg:${index}`, cursor, left);
      cursor = right;

      const sillTop = y0 + 0.85;
      const headBottom = opening.kind === "door" ? y0 + 2.32 : y0 + 2.15;
      pieces.push(part(`${face}:${floor}:head:${index}`, "plaster", "panel",
        at(opening.center, (headBottom + y1) / 2), sized(opening.width, y1 - headBottom), options.wall, {
          colorSlot: "plaster",
          textureProfile: "city-aged-stucco",
          weathering: 0.5,
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        }));
      if (opening.kind === "window") {
        pieces.push(part(`${face}:${floor}:sill:${index}`, "plaster", "panel",
          at(opening.center, (y0 + sillTop) / 2), sized(opening.width, sillTop - y0), options.wall, {
            colorSlot: "plaster",
            textureProfile: "city-aged-stucco",
            weathering: floor === 0 ? 0.85 : 0.6,
            carriesAttachments: true,
          }));
        // Настоящее окно: белая коробка, импост, два тёмных стекла,
        // наружный подоконник-плита.
        const h = headBottom - sillTop;
        const cy = (sillTop + headBottom) / 2;
        const fOut = alongX ? sign * 0.06 : sign * 0.06;
        const framePos = (du: number, dy: number): SceneVector3 =>
          alongX
            ? [opening.center + du, cy + dy, fixed + fOut]
            : [fixed + fOut, cy + dy, opening.center + du];
        const frameSize = (w: number, hh: number): SceneVector3 =>
          alongX ? [w, hh, 0.14] : [0.14, hh, w];
        const w = opening.width;
        pieces.push(
          { ...part(`win:${face}:${floor}:${index}:top`, "wood", "plank", framePos(0, h / 2 - 0.05), frameSize(w - 0.06, 0.1), frameWhite), bearsLoad: false, sideAttachmentReach: 0.35 },
          { ...part(`win:${face}:${floor}:${index}:bottom`, "wood", "plank", framePos(0, -h / 2 + 0.05), frameSize(w - 0.06, 0.1), frameWhite), bearsLoad: false, sideAttachmentReach: 0.35 },
          { ...part(`win:${face}:${floor}:${index}:left`, "wood", "plank", framePos(-w / 2 + 0.08, 0), frameSize(0.1, h - 0.2), frameWhite), bearsLoad: false, sideAttachmentReach: 0.35 },
          { ...part(`win:${face}:${floor}:${index}:right`, "wood", "plank", framePos(w / 2 - 0.08, 0), frameSize(0.1, h - 0.2), frameWhite), bearsLoad: false, sideAttachmentReach: 0.35 },
          { ...part(`win:${face}:${floor}:${index}:mullion`, "wood", "plank", framePos(0, 0), frameSize(0.08, h - 0.2), frameWhite), bearsLoad: false, sideAttachmentReach: 0.35 },
          { ...part(`win:${face}:${floor}:${index}:glass:a`, "glass", "glassPane", alongX ? [opening.center - w / 4 + 0.02, cy, fixed] : [fixed, cy, opening.center - w / 4 + 0.02], alongX ? [w / 2 - 0.14, h - 0.22, 0.08] : [0.08, h - 0.22, w / 2 - 0.14], glassTint), bearsLoad: false, sideAttachmentReach: 0.3 },
          { ...part(`win:${face}:${floor}:${index}:glass:b`, "glass", "glassPane", alongX ? [opening.center + w / 4 - 0.02, cy, fixed] : [fixed, cy, opening.center + w / 4 - 0.02], alongX ? [w / 2 - 0.14, h - 0.22, 0.08] : [0.08, h - 0.22, w / 2 - 0.14], glassTint), bearsLoad: false, sideAttachmentReach: 0.3 },
          { ...part(`win:${face}:${floor}:${index}:ledge`, "concrete", "panel", alongX ? [opening.center, sillTop - 0.05, fixed + sign * 0.26] : [fixed + sign * 0.26, sillTop - 0.05, opening.center], alongX ? [w + 0.24, 0.1, 0.36] : [0.36, 0.1, w + 0.24], "#b7ae9e"), sideAttachmentReach: 0.4, weathering: 0.4 },
        );
        // Милота по очереди: на чётных окнах — ящик с петуниями снаружи,
        // на нечётных — занавеска изнутри.
        if ((index + floor + (face === "front" ? 0 : 1)) % 2 === 0) {
          const boxW = w * 0.72;
          const boxPos = (dy: number, dOut: number): SceneVector3 =>
            alongX
              ? [opening.center, sillTop + dy, fixed + sign * dOut]
              : [fixed + sign * dOut, sillTop + dy, opening.center];
          pieces.push(
            { ...part(`win:${face}:${floor}:${index}:planter`, "wood", "plank", boxPos(0.09, 0.3), alongX ? [boxW, 0.18, 0.24] : [0.24, 0.18, boxW], "#6e5138"), sideAttachmentReach: 0.45, weathering: 0.4 },
            { ...part(`win:${face}:${floor}:${index}:planter:green`, "foliage", "panel", boxPos(0.23, 0.3), alongX ? [boxW - 0.06, 0.12, 0.2] : [0.2, 0.12, boxW - 0.06], "#4c6b3a"), bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.4 },
          );
          const bloomTints = ["#d24b62", "#e0c23e", "#b45fc9"];
          for (let bloom = 0; bloom < 3; bloom += 1) {
            pieces.push({
              ...part(`win:${face}:${floor}:${index}:bloom:${bloom}`, "foliage", "panel",
                alongX
                  ? [opening.center + (bloom - 1) * boxW * 0.32, sillTop + 0.26, fixed + sign * 0.3]
                  : [fixed + sign * 0.3, sillTop + 0.26, opening.center + (bloom - 1) * boxW * 0.32],
                [0.13, 0.11, 0.13], bloomTints[(bloom + index) % bloomTints.length]),
              bearsLoad: false,
              volume: 0.002,
              sideAttachmentReach: 0.35,
            });
          }
        } else {
          const curtainTint = ["#e8e2d3", "#d9cfc0", "#cfd6df"][(index + floor) % 3];
          pieces.push({
            ...part(`win:${face}:${floor}:${index}:curtain`, "cloth", "panel",
              alongX
                ? [opening.center - w * 0.24, cy + 0.04, fixed - sign * 0.24]
                : [fixed - sign * 0.24, cy + 0.04, opening.center - w * 0.24],
              alongX ? [w * 0.44, h * 0.8, 0.03] : [0.03, h * 0.8, w * 0.44], curtainTint),
            bearsLoad: false,
          });
        }
      } else {
        // Составная дверь, как в деревне викингов: три доски, две
        // поперечины и ручка на ОДНОЙ петле у косяка — pivot задаётся
        // абсолютной точкой префаба, ось петли вертикальна, и створка
        // открывается как настоящая дверь. Плюс крыльцо и коврик.
        const doorH = headBottom - y0 - 0.02;
        const leafW = opening.width - 0.12;
        const boards = ["#7c552f", "#8a6136", "#75512c"];
        const hingePivot: SceneVector3 = alongX
          ? [opening.center - leafW / 2, y0 + doorH / 2, fixed + sign * 0.06]
          : [fixed + sign * 0.06, y0 + doorH / 2, opening.center - leafW / 2];
        const doorPiece = (
          partId: string,
          du: number,
          dy: number,
          dOut: number,
          w: number,
          hh: number,
          t: number,
          color: string,
        ): Piece => ({
          ...part(partId, "wood", "plank",
            alongX
              ? [opening.center + du, y0 + doorH / 2 + dy, fixed + sign * (0.06 + dOut)]
              : [fixed + sign * (0.06 + dOut), y0 + doorH / 2 + dy, opening.center + du],
            alongX ? [w, hh, t] : [t, hh, w], color),
          hinge: {
            pivot: hingePivot,
            direction: [0, 1, 0],
            normal: alongX ? [0, 0, sign] : [sign, 0, 0],
          },
          sideAttachmentReach: 0.4,
        });
        for (let board = 0; board < 3; board += 1) {
          const bw = leafW / 3 - 0.015;
          pieces.push(doorPiece(`door:${face}:${index}:board:${board}`, (board - 1) * (leafW / 3), 0, 0, bw, doorH, 0.1, boards[board]));
        }
        pieces.push(
          doorPiece(`door:${face}:${index}:rail:top`, 0, doorH * 0.28, 0.06, leafW - 0.1, 0.14, 0.04, "#5e3f22"),
          doorPiece(`door:${face}:${index}:rail:bottom`, 0, -doorH * 0.26, 0.06, leafW - 0.1, 0.14, 0.04, "#5e3f22"),
          doorPiece(`door:${face}:${index}:handle`, leafW * 0.34, 0.02, 0.08, 0.07, 0.16, 0.05, "#2e2f31"),
        );
        // Крыльцо двумя пологими ступенями: вход не перегорожен плитой,
        // на верхней ступени — полосатый коврик.
        pieces.push(
          {
            ...part(`door:${face}:${floor}:${index}:step:low`, "concrete", "stoneBlock",
              alongX ? [opening.center, 0.075, fixed + sign * 0.82] : [fixed + sign * 0.82, 0.075, opening.center],
              alongX ? [opening.width + 0.5, 0.15, 0.55] : [0.55, 0.15, opening.width + 0.5], "#84806f"),
            weathering: 0.62,
          },
          {
            ...part(`door:${face}:${floor}:${index}:step:high`, "concrete", "stoneBlock",
              alongX ? [opening.center, 0.15, fixed + sign * 0.42] : [fixed + sign * 0.42, 0.15, opening.center],
              alongX ? [opening.width + 0.5, 0.3, 0.5] : [0.5, 0.3, opening.width + 0.5], "#8d887d"),
            weathering: 0.55,
          },
          {
            ...part(`door:${face}:${index}:mat`, "cloth", "panel",
              alongX ? [opening.center, 0.32, fixed + sign * 0.42] : [fixed + sign * 0.42, 0.32, opening.center],
              alongX ? [opening.width - 0.1, 0.035, 0.42] : [0.42, 0.035, opening.width - 0.1], "#77463b"),
            bearsLoad: false,
          },
          {
            ...part(`door:${face}:${index}:mat:stripe`, "cloth", "panel",
              alongX ? [opening.center, 0.34, fixed + sign * 0.42] : [fixed + sign * 0.42, 0.34, opening.center],
              alongX ? [opening.width - 0.36, 0.02, 0.26] : [0.26, 0.02, opening.width - 0.36], "#c9b48a"),
            bearsLoad: false,
          },
        );
      }
    }
    wallPiece("seg:end", cursor, length / 2);
  };

  for (const face of ["front", "back", "west", "east"] as const) {
    for (const floor of [0, 1]) {
      buildWall(face, floor);
    }
  }

  // Межэтажное и чердачное перекрытия. В полу второго этажа оставлен проём
  // над лестницей у задней стены; чердачный настил закрывает изнанку крыши.
  const stairWellW = 1.15;
  const stairX0 = -width / 2 + 0.6;
  const stairX1 = stairX0 + 3.6;
  const wellZ0 = -depth / 2 + 0.3;
  pieces.push(
    part("floor:0", "wood", "plank", [0, base + 0.11, 0], [width - 0.5, 0.22, depth - 0.5], "#6c543c", { carriesAttachments: true }),
    // Передняя плита во всю ширину лежит на трёх стенах.
    part("floor:1:front", "wood", "plank", [0, base + storey + 0.02, (wellZ0 + stairWellW + depth / 2 - 0.3) / 2], [width - 0.5, 0.2, depth - 0.6 - stairWellW], "#75593c", { carriesAttachments: true }),
    // Задняя полоса разорвана лестничным проёмом на два крыла.
    part("floor:1:back-left", "wood", "plank", [(-width / 2 + 0.25 + stairX0) / 2, base + storey + 0.02, wellZ0 + stairWellW / 2], [stairX0 + width / 2 - 0.25, 0.2, stairWellW], "#75593c", { carriesAttachments: true }),
    part("floor:1:back-right", "wood", "plank", [(stairX1 + width / 2 - 0.25) / 2, base + storey + 0.02, wellZ0 + stairWellW / 2], [width / 2 - 0.25 - stairX1, 0.2, stairWellW], "#75593c", { carriesAttachments: true }),
    part("attic", "wood", "plank", [0, top + 0.09, 0], [width - 0.4, 0.18, depth - 0.4], "#5d4a34", { carriesAttachments: true }),
  );

  // Бетонная лестница-тумбы вдоль задней стены с перилами.
  const steps = 7;
  for (let step = 0; step < steps; step += 1) {
    const h = ((step + 1) / (steps + 1)) * (storey - 0.12);
    pieces.push(part(`stair:${step}`, "concrete", "stoneBlock",
      [stairX0 + 0.35 + step * 0.46, base + 0.22 + h / 2, -depth / 2 + wallT + 0.62], [0.44, h, 1.05], step % 2 === 0 ? "#9d9a91" : "#94918a"));
  }
  // Поручень — три ступенчатых сегмента по внешнему краю марша: сходит
  // лесенкой вместе со ступенями и не перегораживает заход снизу.
  const railZ = -depth / 2 + wallT + 1.18;
  for (let seg = 0; seg < 3; seg += 1) {
    const segH = ((seg * 2 + 2) / (steps + 1)) * (storey - 0.12);
    pieces.push(
      part(`stair:rail:${seg}`, "steel", "steelSheet",
        [stairX0 + 0.8 + seg * 0.92, base + 0.22 + segH + 0.82, railZ], [1.0, 0.05, 0.05], "#5d6663", {
          bearsLoad: false,
          sideAttachmentReach: 0.45,
        }),
      part(`stair:baluster:${seg}`, "steel", "steelSheet",
        [stairX0 + 0.8 + seg * 0.92, base + 0.22 + segH + 0.42, railZ], [0.04, 0.8, 0.04], "#565e5b", {
          sideAttachmentReach: 0.45,
        }),
    );
  }

  // Перегородка с проёмом на каждом этаже. Она обязана встать в стороне от
  // всех дверей первого этажа и не доходить до входной стены — иначе гость
  // упрётся в стенку прямо в дверном проёме.
  const groundDoors = [
    ...options.openings.front[0],
    ...options.openings.back[0],
  ].filter((opening) => opening.kind === "door");
  const partitionX = [width * 0.14, -width * 0.16, width * 0.24, -width * 0.26].find(
    (candidate) => groundDoors.every((door) => Math.abs(door.center - candidate) > 1.2),
  ) ?? width * 0.3;
  for (const floor of [0, 1]) {
    const y0 = base + floor * storey + 0.22;
    pieces.push(
      part(`partition:${floor}:a`, "plaster", "panel", [partitionX, y0 + (storey - 0.24) / 2, -(depth - wallT * 2) / 4 - 0.45], [0.12, storey - 0.24, (depth - wallT * 2) / 2 - 0.9], "#ddd6c6", {
        carriesAttachments: true,
      }),
      // Передняя половина перегородки не доходит до входной стены на метр —
      // это прихожая, в которую открывается дверь.
      part(`partition:${floor}:b`, "plaster", "panel", [partitionX, y0 + (storey - 0.24) / 2, (depth - wallT * 2) / 4 - 0.35], [0.12, storey - 0.24, (depth - wallT * 2) / 2 - 1.1], "#ddd6c6", {
        carriesAttachments: true,
      }),
    );
  }

  // Печь, стол с табуретами и кухонный прилавок внизу; кровати, шкаф и
  // ковёр на стене наверху — дом обитаем.
  pieces.push(
    part("stove", "brick", "brick", [width * 0.14 + 0.75, base + 0.95, -depth / 2 + wallT + 0.55], [0.95, 1.5, 0.8], "#c0b6a6", { carriesAttachments: true }),
    { ...part("stove:door", "steel", "steelSheet", [width * 0.14 + 0.75, base + 0.62, -depth / 2 + wallT + 0.97], [0.34, 0.4, 0.05], "#3a3c3c"), bearsLoad: false, sideAttachmentReach: 0.25 },
    part("table", "wood", "plank", [width * 0.3, base + 0.6, depth * 0.18], [1.1, 0.08, 0.8], "#a8763f"),
    part("table:leg:a", "wood", "plank", [width * 0.3 - 0.45, base + 0.28, depth * 0.18 - 0.3], [0.08, 0.56, 0.08], "#835c33"),
    part("table:leg:b", "wood", "plank", [width * 0.3 + 0.45, base + 0.28, depth * 0.18 - 0.3], [0.08, 0.56, 0.08], "#835c33"),
    part("table:leg:c", "wood", "plank", [width * 0.3 - 0.45, base + 0.28, depth * 0.18 + 0.3], [0.08, 0.56, 0.08], "#835c33"),
    part("table:leg:d", "wood", "plank", [width * 0.3 + 0.45, base + 0.28, depth * 0.18 + 0.3], [0.08, 0.56, 0.08], "#835c33"),
    part("stool:a", "wood", "plank", [width * 0.3 - 0.9, base + 0.24, depth * 0.18], [0.38, 0.48, 0.38], "#93714e"),
    part("stool:b", "wood", "plank", [width * 0.3 + 0.9, base + 0.24, depth * 0.14], [0.38, 0.48, 0.38], "#93714e"),
    part("counter", "wood", "plank", [-width * 0.28, base + 0.45, depth / 2 - wallT - 0.4], [1.5, 0.9, 0.6], "#c9c4ba"),
    part("bed:a", "wood", "plank", [width * 0.28, base + storey + 0.35, -depth * 0.2], [0.95, 0.5, 1.95], "#8f5c39"),
    part("bed:a:blanket", "cloth", "panel", [width * 0.28, base + storey + 0.64, -depth * 0.2 + 0.2], [0.9, 0.1, 1.4], "#7f96ab"),
    part("bed:b", "wood", "plank", [width * 0.28, base + storey + 0.35, depth * 0.22], [0.95, 0.5, 1.95], "#96613b"),
    part("bed:b:blanket", "cloth", "panel", [width * 0.28, base + storey + 0.64, depth * 0.22 - 0.2], [0.9, 0.1, 1.4], "#b0574e"),
    part("wardrobe", "wood", "plank", [-width * 0.24, base + storey + 1.0, depth / 2 - wallT - 0.4], [1.1, 1.95, 0.55], "#7e5233"),
    // Советский ковёр на стене — бордовый, с каймой.
    { ...part("rug", "cloth", "panel", [width / 2 - wallT - 0.08, base + storey + 1.45, 0], [0.05, 1.3, 2.0], "#6e3036"), bearsLoad: false, sideAttachmentReach: 0.3 },
    { ...part("rug:border", "cloth", "panel", [width / 2 - wallT - 0.05, base + storey + 1.45, 0], [0.02, 0.95, 1.6], "#93564f"), bearsLoad: false, sideAttachmentReach: 0.25 },
  );

  // Крыша. Скаты кроятся точно: от карниза до конька, встык, ничего не
  // торчит сквозь противоположный скат. Конёк накрыт уголком из двух плашек.
  const slope = 0.52;
  const overhang = 0.42;
  const half = depth / 2 + overhang;
  const rise = Math.tan(slope) * half;
  const ridgeY = top + rise + 0.06;
  const slantLen = half / Math.cos(slope);
  // Центр ската: середина его проекции, приподнятая на половину подъёма.
  const roofMidY = top + rise / 2 + 0.06;
  const roofMidZ = half / 2;
  if (options.roof === "gable-steel") {
    for (const side of [-1, 1] as const) {
      pieces.push(selfContact(part(`roof:${side}`, "steel", "panel",
        [0, roofMidY, side * roofMidZ], [width + 0.8, 0.16, slantLen], options.roofColor, {
          rotation: [side * slope, 0, 0],
          textureProfile: "city-roof-tile",
          weathering: 0.42,
        }), [width, 0.5, half * 0.8]));
      pieces.push({
        ...part(`ridge:${side}`, "steel", "steelSheet", [0, ridgeY + 0.05, side * 0.22], [width + 0.84, 0.05, 0.5], "#403b38", {
          rotation: [side * slope, 0, 0],
        }),
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    }
    // Фронтоны: три убывающие полосы штукатурки на торцах.
    const gh = rise - 0.1;
    for (const side of [-1, 1] as const) {
      for (let band = 0; band < 3; band += 1) {
        const bw = (depth - 0.5) * (1 - band * 0.3);
        pieces.push(part(`gable:${side}:${band}`, "plaster", "panel",
          [side * (width / 2 - wallT / 2), top + gh * (band + 0.5) / 3, 0], [wallT, gh / 3, bw], options.wall, {
            colorSlot: "plaster",
            textureProfile: "city-aged-stucco",
            weathering: 0.4,
          }));
      }
    }
  } else {
    // Вальмовая: длинные скаты на всю длину, вальмы утоплены под них, чтобы
    // диагональные рёбра не протыкали плоскости.
    for (const side of [-1, 1] as const) {
      pieces.push(selfContact(part(`roof:long:${side}`, "steel", "panel",
        [0, roofMidY, side * roofMidZ], [width + 0.7, 0.16, slantLen], options.roofColor, {
          rotation: [side * slope, 0, 0],
          textureProfile: "city-roof-tile",
          weathering: 0.35,
        }), [width * 0.9, 0.5, half * 0.8]));
    }
    // Вальмы — черепичной «лесенкой»: три ступени, каждая сужается по
    // пирамиде крыши, чтобы углы не протыкали длинные скаты.
    const hipHalf = half;
    const hipSeg = hipHalf / 3;
    const hipSegSlant = hipSeg / Math.cos(slope) + 0.1;
    for (const side of [-1, 1] as const) {
      for (let step = 0; step < 3; step += 1) {
        const projCenter = (step + 0.5) * hipSeg;
        const stepWidth = Math.max(0.7, 2 * hipHalf * (1 - (step + 1) / 3) + 0.35);
        pieces.push(selfContact(part(`roof:hip:${side}:${step}`, "steel", "panel",
          [
            side * (width / 2 + overhang - projCenter),
            top + Math.tan(slope) * projCenter - 0.02,
            0,
          ],
          [hipSegSlant, 0.15, stepWidth], options.roofColor, {
            rotation: [0, 0, -side * slope],
            textureProfile: "city-roof-tile",
            weathering: 0.35,
          }), [hipSeg * 1.3, 0.45, stepWidth * 0.85]));
      }
    }
    pieces.push({
      ...part("ridge", "steel", "steelSheet", [0, ridgeY + 0.04, 0], [Math.max(1.2, width - depth), 0.09, 0.34], "#4a352a"),
      bearsLoad: false,
      sideAttachmentReach: 0.4,
    });
  }

  // Руст-пилястры на углах (как на кремовом доме с фотографии).
  if (options.cornerTrim) {
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        pieces.push(part(`trim:${sx}:${sz}`, "concrete", "panel",
          [sx * (width / 2 - 0.2), base + storey, sz * (depth / 2 - 0.05)], [0.42, storey * 2, 0.12], "#b9b4a8", {
            bearsLoad: false,
            sideAttachmentReach: 0.35,
            weathering: 0.45,
          }));
      }
    }
  }

  // Цоколь: серая «шуба» или смолёная лента, разорванная у дверных проёмов —
  // дверь выходит на крыльцо, а не прячется за плитой.
  const plinthColor = options.plinth === "rough" ? "#7d7970" : TAR_BLACK;
  const plinthSegments = (
    fullFrom: number,
    fullTo: number,
    doors: readonly HouseOpening[],
  ): readonly [number, number][] => {
    const cuts = doors
      .filter((opening) => opening.kind === "door")
      .map((opening): [number, number] => [opening.center - opening.width / 2 - 0.2, opening.center + opening.width / 2 + 0.2])
      .sort((a, b) => a[0] - b[0]);
    const result: [number, number][] = [];
    let cursor = fullFrom;
    for (const [cutFrom, cutTo] of cuts) {
      if (cutFrom - cursor > 0.3) {
        result.push([cursor, cutFrom]);
      }
      cursor = Math.max(cursor, cutTo);
    }
    if (fullTo - cursor > 0.3) {
      result.push([cursor, fullTo]);
    }
    return result;
  };
  for (const side of [-1, 1] as const) {
    const zFace = side > 0 ? "front" : "back";
    for (const [index, [from, to]] of plinthSegments(-width / 2 + 0.1, width / 2 - 0.1, options.openings[zFace][0]).entries()) {
      pieces.push({ ...part(`plinth:z:${side}:${index}`, "concrete", "panel", [(from + to) / 2, base + 0.42, side * (depth / 2 + 0.02)], [to - from, 1.24, 0.1], plinthColor), bearsLoad: false, sideAttachmentReach: 0.35, weathering: 0.9, textureProfile: "city-aged-stucco" as const });
    }
    const xFace = side > 0 ? "east" : "west";
    for (const [index, [from, to]] of plinthSegments(-depth / 2 + 0.1, depth / 2 - 0.1, options.openings[xFace][0]).entries()) {
      pieces.push({ ...part(`plinth:x:${side}:${index}`, "concrete", "panel", [side * (width / 2 + 0.02), base + 0.42, (from + to) / 2], [0.1, 1.24, to - from], plinthColor), bearsLoad: false, sideAttachmentReach: 0.35, weathering: 0.88, textureProfile: "city-aged-stucco" as const });
    }
  }

  // Жёлтый газ: заметная труба на стояках вдоль торца, отвод в дом.
  if (options.gasEnd) {
    const gx = options.gasEnd * (width / 2 + 0.24);
    pieces.push(
      part("gas:run", "steel", "steelSheet", [gx, 2.42, 0], [0.12, 0.12, depth * 0.82], GAS_BRIGHT, { bearsLoad: false, weathering: 0.25 }),
      part("gas:post:a", "steel", "steelSheet", [gx, 1.18, -depth * 0.36], [0.09, 2.36, 0.09], GAS_BRIGHT),
      part("gas:post:b", "steel", "steelSheet", [gx, 1.18, depth * 0.36], [0.09, 2.36, 0.09], GAS_BRIGHT),
      // Ввод проходит сквозь стену внутрь — труба действительно питает дом.
      { ...part("gas:inlet", "steel", "steelSheet", [options.gasEnd * (width / 2 - 0.05), 2.42, depth * 0.18], [0.62, 0.12, 0.12], GAS_BRIGHT), bearsLoad: false, sideAttachmentReach: 0.35 },
      { ...part("gas:meter", "steel", "steelSheet", [options.gasEnd * (width / 2 + 0.16), 1.9, depth * 0.18], [0.26, 0.4, 0.3], "#c8b874"), bearsLoad: false, sideAttachmentReach: 0.35 },
    );
  }

  // Желоба и водосточная труба, спутниковая тарелка с кабелем-волной.
  // Желоб — профиль-бокс, прижатый к венцу стены под кромкой ската.
  pieces.push(
    { ...part("gutter:front", "steel", "steelSheet", [0, top - 0.02, depth / 2 + 0.24], [width + 0.4, 0.12, 0.14], "#3a3c3d"), bearsLoad: false, sideAttachmentReach: 0.6, weathering: 0.35 },
    { ...part("gutter:back", "steel", "steelSheet", [0, top - 0.02, -depth / 2 - 0.24], [width + 0.4, 0.12, 0.14], "#3a3c3d"), bearsLoad: false, sideAttachmentReach: 0.6, weathering: 0.35 },
    part("downpipe", "steel", "steelSheet", [width / 2 - 0.35, (top - 0.12) / 2 + 0.04, depth / 2 + 0.26], [0.11, top - 0.12, 0.11], "#43494a", { weathering: 0.4 }),
  );
  if (options.dish) {
    pieces.push(
      { ...cylinder("dish:stem", [-width * 0.2, 3.4, depth / 2 + 0.3], 0.06, 0.44, "#777d7c", [Math.PI / 2, 0, 0]), bearsLoad: false, sideAttachmentReach: 0.5 },
      { ...selfContact(part("dish:face", "steel", "cylinder", [-width * 0.2, 3.55, depth / 2 + 0.5], [0.78, 0.08, 0.78], "#8f9694", {
        rotation: [Math.PI / 2 - 0.3, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.7,
      }), [0.7, 0.5, 0.5]) },
      { ...part("dish:cable", "steel", "steelSheet", [-width * 0.05, 3.1, depth / 2 + 0.22], [width * 0.32, 0.04, 0.04], "#242526"), bearsLoad: false, sideAttachmentReach: 0.4 },
    );
  }

  return prefab(options.id, options.displayName, ["city", "building", "old", "courtyard", "structural", "interior"], pieces);
}

// ---------------------------------------------------------------------------
// «Запечённый» поворот префаба на 90°. Решатель опор игнорирует rotation
// кусков, поэтому дом, повёрнутый на четверть оборота на уровне инстанса,
// физически разваливается: боксы остаются вдоль старых осей. Этот хелпер
// поворачивает сам префаб — позиции, размеры, контакт-боксы, петли и эйлеры.
// ---------------------------------------------------------------------------

function yawMatrix(rotation: SceneVector3): readonly SceneVector3[] {
  const [rx, ry, rz] = rotation;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);
  return [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ];
}

function eulerFromColumns(columns: readonly SceneVector3[]): SceneVector3 {
  const m13 = columns[2][0];
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [
      Math.atan2(-columns[2][1], columns[2][2]),
      y,
      Math.atan2(-columns[1][0], columns[0][0]),
    ];
  }
  return [Math.atan2(columns[1][2], columns[1][1]), y, 0];
}

function composeQuarterYaw(rotation: SceneVector3): SceneVector3 {
  const local = yawMatrix(rotation);
  const rotate = (v: SceneVector3): SceneVector3 => [v[2], v[1], -v[0]];
  return eulerFromColumns([rotate(local[0]), rotate(local[1]), rotate(local[2])]);
}

function yawQuarterPrefab(
  source: ScenePrefabDefinition,
  id: string,
  displayName: string,
): ScenePrefabDefinition {
  const rotV = (v: SceneVector3): SceneVector3 => [v[2], v[1], -v[0]];
  const pieces: Piece[] = source.pieces.map((piece): Piece => ({
    ...piece,
    position: rotV(piece.position),
    size: piece.rotation ? piece.size : [piece.size[2], piece.size[1], piece.size[0]],
    rotation: piece.rotation ? composeQuarterYaw(piece.rotation) : undefined,
    contactBoxes: piece.contactBoxes?.map((box) => ({
      position: rotV(box.position),
      size: [box.size[2], box.size[1], box.size[0]] as SceneVector3,
    })),
    hinge: piece.hinge
      ? {
          pivot: rotV(piece.hinge.pivot),
          direction: rotV(piece.hinge.direction),
          normal: rotV(piece.hinge.normal),
        }
      : undefined,
  }));
  return { ...source, id, displayName, pieces };
}

// Три разных дома, как на снимках: жёлтый двускатный с фронтонами, кремовый
// вальмовый с черепицей и тарелкой, белёный малый. Никакого копипаста.
function gableYellowHouse(): ScenePrefabDefinition {
  return stuccoHouse({
    id: "city:house:gable-yellow",
    displayName: "Yellow gabled courtyard house",
    width: 12,
    depth: 8,
    storey: 2.8,
    wall: "#d9c8a4",
    roof: "gable-steel",
    roofColor: "#59524d",
    plinth: "rough",
    gasEnd: -1,
    openings: {
      front: [
        [{ center: -3.4, width: 1.5, kind: "window" }, { center: 0.2, width: 1.2, kind: "door" }, { center: 3.5, width: 1.5, kind: "window" }],
        [{ center: -3.4, width: 1.5, kind: "window" }, { center: 0.1, width: 1.4, kind: "window" }, { center: 3.5, width: 1.5, kind: "window" }],
      ],
      back: [
        [{ center: 2.6, width: 1.3, kind: "window" }],
        [{ center: -2.6, width: 1.4, kind: "window" }, { center: 2.6, width: 1.4, kind: "window" }],
      ],
      west: [[], [{ center: 0.4, width: 1.3, kind: "window" }]],
      east: [[{ center: -0.8, width: 1.3, kind: "window" }], [{ center: 0.8, width: 1.3, kind: "window" }]],
    },
  });
}

function hipCreamHouse(): ScenePrefabDefinition {
  return stuccoHouse({
    id: "city:house:hip-cream",
    displayName: "Cream hipped house with metal-tile roof",
    width: 10.4,
    depth: 7.2,
    storey: 2.75,
    wall: "#e8ddc4",
    roof: "hip-tile",
    roofColor: "#6b4130",
    plinth: "tar",
    cornerTrim: true,
    dish: true,
    gasEnd: 1,
    openings: {
      front: [
        [{ center: -2.6, width: 1.4, kind: "window" }, { center: 0.6, width: 1.15, kind: "door" }, { center: 3.2, width: 1.3, kind: "window" }],
        [{ center: -2.8, width: 1.35, kind: "window" }, { center: 2.6, width: 1.35, kind: "window" }],
      ],
      back: [
        [{ center: -2.2, width: 1.3, kind: "window" }],
        [{ center: 1.8, width: 1.35, kind: "window" }],
      ],
      west: [[{ center: 0.6, width: 1.25, kind: "window" }], [{ center: -0.6, width: 1.25, kind: "window" }]],
      east: [[], [{ center: 0.4, width: 1.25, kind: "window" }]],
    },
  });
}

function hipWhiteHouse(): ScenePrefabDefinition {
  return stuccoHouse({
    id: "city:house:hip-white",
    displayName: "Small whitewashed hipped house",
    width: 9.6,
    depth: 6.8,
    storey: 2.6,
    wall: "#e6e2d4",
    roof: "hip-tile",
    roofColor: "#4f463f",
    plinth: "rough",
    gasEnd: -1,
    openings: {
      front: [
        [{ center: -2.4, width: 1.35, kind: "window" }, { center: 1.4, width: 1.15, kind: "door" }],
        [{ center: -2.2, width: 1.3, kind: "window" }, { center: 2.2, width: 1.3, kind: "window" }],
      ],
      back: [
        [{ center: 1.8, width: 1.25, kind: "window" }],
        [{ center: -1.8, width: 1.3, kind: "window" }],
      ],
      west: [[], [{ center: 0.3, width: 1.2, kind: "window" }]],
      east: [[{ center: -0.5, width: 1.2, kind: "window" }], []],
    },
  });
}

function buildingSuppliesKiosk(): ScenePrefabDefinition {
  const pieces: Piece[] = [
    part("foundation", "concrete", "groundTile", [0, 0.16, 0], [7.4, 0.32, 5.2], "#6e6961", { carriesAttachments: true }),
    part("body", "plaster", "panel", [0, 1.72, 0], [7.0, 3.1, 4.9], "#e2d4b6", {
      colorSlot: "plaster",
      textureProfile: "city-aged-stucco",
      weathering: 0.68,
      carriesAttachments: true,
    }),
    // Смолёный чёрный цоколь мажется по низу фасада и углов.
    part("tar-plinth:front", "concrete", "panel", [0, 0.52, 2.51], [6.9, 0.84, 0.1], TAR_BLACK, {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      weathering: 0.55,
      contactBoxes: [{ position: [0, 0.52, 2.25], size: [6.9, 0.95, 0.6] }],
    }),
    part("tar-plinth:side", "concrete", "panel", [-3.56, 0.52, 0.4], [0.1, 0.84, 3.9], TAR_BLACK, {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      weathering: 0.55,
      contactBoxes: [{ position: [-3.3, 0.52, 0.4], size: [0.6, 0.95, 3.9] }],
    }),
    // Плоская кровля с ржавой капельницей по фронту.
    part("roof", "steel", "panel", [0, 3.36, 0], [7.5, 0.16, 5.5], "#5a5c5a", { weathering: 0.5 }),
    part("fascia", "steel", "steelSheet", [0, 3.28, 2.68], [7.55, 0.3, 0.08], RUST_FASCIA, {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      weathering: 0.7,
      contactBoxes: [{ position: [0, 3.28, 2.35], size: [7.55, 0.4, 0.7] }],
    }),
    // Дверь распахнута настежь: за ней тёмный проём кладовки.
    part("doorway", "plaster", "panel", [0.6, 1.32, 2.47], [1.24, 2.3, 0.05], "#1d1a16", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [0.6, 1.32, 2.25], size: [1.4, 2.4, 0.55] }],
    }),
    part("door", "steel", "steelSheet", [-0.28, 1.3, 3.02], [1.18, 2.32, 0.1], "#3b3129", {
      rotation: [0, -1.25, 0],
      hinge: { pivot: [0.02, 1.3, 2.5], direction: [0, 1, 0], normal: [0, 0, 1] },
      contactBoxes: [{ position: [-0.05, 1.3, 2.45], size: [1.6, 2.45, 0.9] }],
    }),
    // Витрина, заставленная товаром изнутри (тёмное стекло с полками).
    part("window:display", "glass", "glassPane", [-1.95, 1.62, 2.5], [1.7, 1.35, 0.1], GLASS, {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [-1.95, 1.62, 2.25], size: [1.9, 1.6, 0.6] }],
    }),
    part("window:side", "glass", "glassPane", [2.28, 1.62, 2.5], [1.25, 1.35, 0.1], GLASS, {
      bearsLoad: false,
      sideAttachmentReach: 0.42,
      contactBoxes: [{ position: [2.28, 1.62, 2.25], size: [1.45, 1.6, 0.6] }],
    }),
    // Лайтбокс: белое поле, малиновое «слово» из сегментов и зелёная приписка.
    part("lightbox", "steel", "steelSheet", [0, 3.0, 2.62], [4.9, 0.8, 0.14], "#e8e4da", {
      bearsLoad: false,
      sideAttachmentReach: 0.45,
      contactBoxes: [{ position: [0, 2.95, 2.3], size: [5.1, 0.95, 0.7] }],
    }),
    part("lightbox:panel", "steel", "steelSheet", [-1.35, 3.0, 2.71], [1.9, 0.62, 0.05], "#b8385a", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [-1.35, 2.95, 2.3], size: [2.0, 0.8, 0.75] }],
    }),
  ];
  // «Буквы»: белые сегменты по малиновому полю, зелёные — приписка справа.
  for (let index = 0; index < 4; index += 1) {
    pieces.push(part(`lightbox:word:${index}`, "steel", "steelSheet", [-2.05 + index * 0.47, 3.0, 2.75], [0.3, 0.34, 0.03], "#f2efe8", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [-1.35, 2.95, 2.3], size: [2.0, 0.8, 0.8] }],
    }));
  }
  for (let index = 0; index < 3; index += 1) {
    pieces.push(part(`lightbox:sub:${index}`, "steel", "steelSheet", [0.65 + index * 0.55, 2.88, 2.71], [0.4, 0.18, 0.03], "#3f7d52", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [1.2, 2.9, 2.3], size: [1.9, 0.5, 0.75] }],
    }));
  }
  pieces.push(
    // Синяя табличка с QR-квадратом на углу.
    part("qr-plate", "steel", "steelSheet", [-2.1, 2.2, 2.48], [0.44, 0.6, 0.04], "#dfe3e6", {
      carriesAttachments: true,
      sideAttachmentReach: 0.4,
    }),
    part("qr-code", "steel", "steelSheet", [-2.1, 2.28, 2.51], [0.26, 0.26, 0.02], "#2b3f57", {
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    }),
    // Бетонное крыльцо с обломанной смолёной кромкой и двумя ступенями.
    part("stoop", "concrete", "stoneBlock", [0.15, 0.34, 3.2], [3.0, 0.68, 1.3], "#8d887d", {
      weathering: 0.6,
      carriesAttachments: true,
    }),
    part("stoop:edge", "concrete", "panel", [0.15, 0.5, 3.87], [3.0, 0.36, 0.08], TAR_BLACK, {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      weathering: 0.6,
      contactBoxes: [{ position: [0.15, 0.45, 3.6], size: [3.0, 0.5, 0.6] }],
    }),
    part("step:0", "concrete", "stoneBlock", [1.95, 0.17, 3.35], [1.0, 0.34, 0.95], "#84806f", { weathering: 0.62 }),
    part("step:1", "concrete", "stoneBlock", [1.95, 0.51, 2.95], [1.0, 0.32, 0.55], "#8d887d", { weathering: 0.5 }),
    // Оранжевая газовая труба по фасаду: лежит на двух стояках, дошедших
    // до земли — так решатель несёт её честно, как настоящие кронштейны.
    part("gas:run", "steel", "steelSheet", [0.3, 2.42, 2.56], [6.0, 0.07, 0.07], "#c77b3a", {
      bearsLoad: false,
      weathering: 0.35,
    }),
    part("gas:post:west", "steel", "steelSheet", [-2.35, 1.19, 2.56], [0.06, 2.38, 0.06], "#c77b3a"),
    part("gas:post:east", "steel", "steelSheet", [2.95, 1.19, 2.56], [0.06, 2.38, 0.06], "#c77b3a"),
  );
  return prefab("city:kiosk:building-supplies", "Building-supplies kiosk with a lightbox sign", ["city", "building", "shop", "kiosk", "structural"], pieces);
}

function whitebrickFenceSection(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  // Белёный силикатный кирпич с настоящей перевязкой: нечётные ряды идут
  // с половинками по краям, торцы секции остаются вертикально ровными.
  for (let row = 0; row < 7; row += 1) {
    const y = 0.15 + row * 0.29;
    const shade = (column: number): string =>
      (row * 5 + column * 3) % 11 === 0 ? "#77604f" : row < 2 ? "#c9c2b2" : WHITE_PAINT;
    const wear = (column: number): number =>
      (row * 5 + column * 3) % 11 === 0 ? 0.6 : row < 2 ? 0.85 : 0.7;
    if (row % 2 === 0) {
      for (let column = 0; column < 6; column += 1) {
        pieces.push(part(`course:${row}:${column}`, "brick", "brick",
          [-1.65 + column * 0.66, y, 0], [0.64, 0.27, 0.36], shade(column), {
            weathering: wear(column),
          }));
      }
    } else {
      pieces.push(part(`course:${row}:half-left`, "brick", "brick",
        [-1.815, y, 0], [0.31, 0.27, 0.36], shade(0), { weathering: wear(0) }));
      for (let column = 0; column < 5; column += 1) {
        pieces.push(part(`course:${row}:${column}`, "brick", "brick",
          [-1.32 + column * 0.66, y, 0], [0.64, 0.27, 0.36], shade(column + 1), {
            weathering: wear(column + 1),
          }));
      }
      pieces.push(part(`course:${row}:half-right`, "brick", "brick",
        [1.815, y, 0], [0.31, 0.27, 0.36], shade(5), { weathering: wear(5) }));
    }
  }
  pieces.push(part("cap", "concrete", "panel", [0, 2.14, 0], [4.06, 0.14, 0.5], "#b3aea1", { weathering: 0.6 }));
  return prefab("city:fence:whitebrick-section", "Whitewashed brick fence section", ["city", "fence", "brick", "courtyard"], pieces);
}

function profiledFenceSection(): ScenePrefabDefinition {
  const pieces: Piece[] = [
    cylinder("post:left", [-1.9, 1.0, 0], 0.09, 2.0, "#4a4440"),
    cylinder("post:right", [1.9, 1.0, 0], 0.09, 2.0, "#4a4440"),
    part("rail:top", "steel", "steelSheet", [0, 1.78, 0.02], [3.9, 0.07, 0.05], "#57504a", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [0, 1.78, 0], size: [4.0, 0.2, 0.3] }],
    }),
    part("rail:bottom", "steel", "steelSheet", [0, 0.32, 0.02], [3.9, 0.07, 0.05], "#57504a", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [0, 0.32, 0], size: [4.0, 0.2, 0.3] }],
    }),
  ];
  // Тёмно-бурый профлист волной, лист к листу, с разнобоем выгорания.
  const tones = ["#5e4a3e", "#66513f", "#584639", "#6b5644"];
  for (let sheet = 0; sheet < 7; sheet += 1) {
    pieces.push(part(`sheet:${sheet}`, "steel", "steelSheet",
      [-1.71 + sheet * 0.57, 1.02, 0.07], [0.55, 1.72, 0.05], tones[sheet % tones.length], {
        bearsLoad: false,
        sideAttachmentReach: 0.3,
        weathering: 0.45,
        contactBoxes: [{ position: [-1.71 + sheet * 0.57, 1.02, 0], size: [0.57, 1.75, 0.3] }],
      }));
  }
  return prefab("city:fence:profiled-section", "Dark profiled-sheet fence section", ["city", "fence", "steel", "courtyard"], pieces);
}

function fencePillarPlain(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (let course = 0; course < 5; course += 1) {
    pieces.push(part(`pillar:${course}`, "concrete", "cinderBlock", [0, 0.27 + course * 0.5, 0], [0.72, 0.46, 0.72], RED_AGGREGATE, {
      textureProfile: "city-red-aggregate",
      weathering: 0.4,
      carriesAttachments: true,
    }));
  }
  pieces.push(part("cap", "concrete", "panel", [0, 2.7, 0], [0.9, 0.18, 0.9], "#66342e", {
    textureProfile: "city-red-aggregate",
    weathering: 0.45,
  }));
  return prefab("city:fence:pillar", "Heavy red wall pillar", ["city", "fence", "courtyard"], pieces);
}

function carportStringLights(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  // Четыре деревянных столба, односкатный профлист и гирлянда по кромке —
  // задний двор частника, где вечером сидят под тёплыми лампочками.
  for (const [index, [x, z]] of ([[-2.0, -1.4], [2.0, -1.4], [-2.0, 1.4], [2.0, 1.4]] as const).entries()) {
    pieces.push(cylinder(`post:${index}`, [x, 1.22, z], 0.13, 2.44, "#5f4a37", undefined, "wood"));
  }
  pieces.push(
    selfContact(part("roof", "steel", "panel", [0, 2.56, 0], [4.7, 0.09, 3.4], "#4b4642", {
      rotation: [0.055, 0, 0],
      weathering: 0.5,
    }), [4.5, 0.35, 3.2]),
    part("beam:front", "wood", "plank", [0, 2.38, 1.42], [4.5, 0.14, 0.12], "#6b5340", {
      sideAttachmentReach: 0.35,
      contactBoxes: [{ position: [0, 2.38, 1.42], size: [4.6, 0.3, 0.4] }],
    }),
    // Провод гирлянды прижат к переднему брусу; лампочки висят на своих
    // подвесках, пересекаясь с проводом — боковое крепление в режиме троса.
    part("string:wire", "steel", "steelSheet", [0, 2.32, 1.46], [4.3, 0.03, 0.03], "#221f1c", {
      attachmentSupportMode: "cable",
      carriesAttachments: true,
      sideAttachmentReach: 0.3,
    }),
  );
  for (let bulb = 0; bulb < 6; bulb += 1) {
    const x = -1.8 + bulb * 0.72;
    pieces.push(part(`string:bulb:${bulb}`, "glass", "glassPane", [x, 2.2, 1.46], [0.05, 0.24, 0.05], litWindowColor, {
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      light: bulb === 2 ? { color: "#ffd9a0", distance: 6.5, intensity: 9 } : undefined,
    }));
  }
  pieces.push(
    // Дощатый стол и лавка: остались с последних посиделок.
    part("table:top", "wood", "plank", [0.3, 0.76, -0.2], [1.5, 0.08, 0.8], "#8a6a4d", { carriesAttachments: true }),
    part("table:leg:0", "wood", "plank", [-0.3, 0.37, -0.5], [0.09, 0.7, 0.09], "#6b5340"),
    part("table:leg:1", "wood", "plank", [0.9, 0.37, -0.5], [0.09, 0.7, 0.09], "#6b5340"),
    part("table:leg:2", "wood", "plank", [-0.3, 0.37, 0.1], [0.09, 0.7, 0.09], "#6b5340"),
    part("table:leg:3", "wood", "plank", [0.9, 0.37, 0.1], [0.09, 0.7, 0.09], "#6b5340"),
    part("bench:seat", "wood", "plank", [0.3, 0.44, 0.75], [1.4, 0.07, 0.32], "#93714e", { carriesAttachments: true }),
    part("bench:leg:0", "wood", "plank", [-0.2, 0.2, 0.75], [0.08, 0.4, 0.28], "#6b5340"),
    part("bench:leg:1", "wood", "plank", [0.8, 0.2, 0.75], [0.08, 0.4, 0.28], "#6b5340"),
  );
  return prefab("city:carport:lights", "Backyard carport with string lights", ["city", "yard", "carport", "light"], pieces);
}

function clothesline(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (const side of [-1, 1] as const) {
    pieces.push(
      cylinder(`pole:${side}`, [side * 2.0, 1.08, 0], 0.08, 2.16, "#6a6e6c"),
      selfContact(part(`crossbar:${side}`, "steel", "steelSheet", [side * 2.0, 2.12, 0], [0.06, 0.06, 0.7], "#5d615f", {
        sideAttachmentReach: 0.25,
      }), [0.3, 0.3, 0.7]),
    );
  }
  pieces.push({
    ...cylinder("rope", [0, 2.08, 0], 0.03, 3.9, "#b8b2a4", [0, 0, Math.PI / 2]),
    attachmentSupportMode: "cable",
    carriesAttachments: true,
  });
  // Бельё после дождя так и не сняли: простыня, наволочка, полотенце.
  const laundry: readonly [number, number, number, string][] = [
    [-1.2, 0.95, 0.72, "#e8e6de"],
    [-0.1, 0.62, 0.58, "#7f96ab"],
    [0.9, 0.78, 0.5, "#d8cfc0"],
  ];
  for (const [index, [x, height, width, color]] of laundry.entries()) {
    pieces.push(part(`laundry:${index}`, "cloth", "panel", [x, 2.02 - height / 2, 0.02], [width, height, 0.03], color, {
      bearsLoad: false,
      contactBoxes: [{ position: [x, 2.06, 0], size: [width, 0.16, 0.2] }],
    }));
  }
  return prefab("city:clothesline", "Sagging courtyard clothesline", ["city", "yard", "laundry", "prop"], pieces);
}

function kickScooter(): ScenePrefabDefinition {
  return prefab("city:scooter:red", "Kid's red kick scooter", ["city", "vehicle", "toy", "prop"], [
    selfContact(part("deck", "steel", "panel", [0, 0.13, 0], [0.68, 0.045, 0.13], "#c23c2e", {
      rotation: [0, 0, 0.02],
    }), [0.68, 0.2, 0.2]),
    selfContact(part("wheel:front", "steel", "cylinder", [0.4, 0.09, 0], [0.17, 0.05, 0.17], "#2a2c2d", {
      rotation: [Math.PI / 2, 0, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    }), [0.2, 0.2, 0.15]),
    selfContact(part("wheel:rear", "steel", "cylinder", [-0.35, 0.09, 0], [0.15, 0.05, 0.15], "#2a2c2d", {
      rotation: [Math.PI / 2, 0, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    }), [0.2, 0.2, 0.15]),
    selfContact(part("stem", "steel", "cylinder", [0.42, 0.55, 0], [0.045, 0.85, 0.045], "#c23c2e", {
      rotation: [0, 0, -0.14],
    }), [0.25, 0.85, 0.2]),
    selfContact(part("handlebar", "steel", "cylinder", [0.48, 0.97, 0], [0.04, 0.4, 0.04], "#33393b", {
      rotation: [Math.PI / 2, 0, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.2,
    }), [0.15, 0.15, 0.4]),
  ]);
}

function sandwichBoard(): ScenePrefabDefinition {
  const pieces: Piece[] = [];
  for (const lean of [-1, 1] as const) {
    pieces.push(selfContact(part(`panel:${lean}`, "wood", "plank", [0, 0.46, lean * 0.19], [0.66, 0.94, 0.035], "#e6e1d4", {
      rotation: [lean * 0.36, 0, 0],
      weathering: 0.3,
    }), [0.66, 0.9, 0.3]));
  }
  pieces.push(
    part("headline", "wood", "plank", [0, 0.68, 0.315], [0.5, 0.16, 0.02], "#b8385a", {
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      contactBoxes: [{ position: [0, 0.62, 0.24], size: [0.6, 0.3, 0.2] }],
    }),
    part("lines", "wood", "plank", [0, 0.44, 0.395], [0.42, 0.2, 0.02], "#8b8578", {
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      contactBoxes: [{ position: [0, 0.44, 0.3], size: [0.5, 0.3, 0.25] }],
    }),
  );
  return prefab("city:sign:sandwich", "Leaning shop sandwich board", ["city", "shop", "sign", "prop"], pieces);
}

function broomBucket(): ScenePrefabDefinition {
  const pieces: Piece[] = [...propBucket({ scale: 1.25 })];
  // Мётлы сорго стоят веером черенками вниз — товар прямо у крыльца.
  for (let index = 0; index < 4; index += 1) {
    const lean = (index - 1.5) * 0.12;
    const x = (index - 1.5) * 0.11;
    pieces.push(
      cylinder(`handle:${index}`, [x, 0.95, (index % 2) * 0.08 - 0.04], 0.035, 1.5, "#c9a878", [0, 0, lean], "wood"),
      selfContact(part(`head:${index}`, "foliage", "panel", [x + lean * -0.75, 1.78, (index % 2) * 0.08 - 0.04], [0.16, 0.34, 0.12], index % 2 === 0 ? "#c8722f" : "#b96428", {
        rotation: [0, 0, lean],
        bearsLoad: false,
        volume: 0.004,
        sideAttachmentReach: 0.3,
      }), [0.3, 0.5, 0.3]),
    );
  }
  return prefab("city:broom-bucket", "Bucket of sorghum brooms for sale", ["city", "shop", "goods", "prop"], pieces);
}

function birdhouse(): ScenePrefabDefinition {
  // Скворечник на шесте — обязательная милота любого старого двора.
  return prefab("city:birdhouse", "Birdhouse on a tall pole", ["city", "yard", "birds", "prop"], [
    cylinder("pole", [0, 1.35, 0], 0.09, 2.7, "#8a7658", undefined, "wood"),
    selfContact(part("box", "wood", "plank", [0, 2.82, 0], [0.26, 0.3, 0.22], "#9c8256")),
    { ...part("hole", "wood", "plank", [0, 2.86, 0.115], [0.09, 0.09, 0.02], "#241f18"), bearsLoad: false, sideAttachmentReach: 0.2 },
    { ...part("roof:a", "wood", "plank", [0, 3.02, 0.08], [0.34, 0.03, 0.2], "#6b5340", { rotation: [0.5, 0, 0] }), bearsLoad: false, sideAttachmentReach: 0.25 },
    { ...part("roof:b", "wood", "plank", [0, 3.02, -0.08], [0.34, 0.03, 0.2], "#6b5340", { rotation: [-0.5, 0, 0] }), bearsLoad: false, sideAttachmentReach: 0.25 },
    { ...part("perch", "wood", "plank", [0, 2.78, 0.16], [0.03, 0.03, 0.1], "#5e4a37"), bearsLoad: false, sideAttachmentReach: 0.2 },
  ]);
}

function cardboardBoxes(): ScenePrefabDefinition {
  // Картонные фруктовые коробки с цветными принтами — вынесли к столбу
  // с прошлого мусорного дня, как на фотографии.
  const pieces: Piece[] = [];
  const cardboard = ["#c29c66", "#b8935a", "#caa06b"];
  const prints = ["#b0574e", "#4f7a56", "#5a6f9c"];
  const layout: readonly [number, number, number, number][] = [
    [-0.32, 0.19, 0.05, 0.15],
    [0.34, 0.18, -0.08, -0.3],
    [0.0, 0.55, 0.0, 0.5],
  ];
  for (const [index, [x, y, z, yaw]] of layout.entries()) {
    pieces.push(
      selfContact(part(`box:${index}`, "wood", "plank", [x, y, z], [0.56, index === 2 ? 0.34 : 0.38, 0.4], cardboard[index], {
        rotation: [0, yaw, 0],
        volume: 0.02,
      })),
      {
        ...part(`box:${index}:print`, "wood", "plank", [x, y + 0.02, z + 0.21], [0.4, 0.16, 0.02], prints[index], {
          rotation: [0, yaw, 0],
          volume: 0.001,
        }),
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      },
    );
  }
  pieces.push(selfContact(part("bag", "cloth", "panel", [0.62, 0.2, 0.34], [0.4, 0.42, 0.36], "#2e2f31", {
    rotation: [0, -0.4, 0],
    volume: 0.02,
  })));
  return prefab("city:cardboard-boxes", "Stack of fruit boxes and a rubbish bag", ["city", "household", "boxes", "prop"], pieces);
}

function saplingWithStake(): ScenePrefabDefinition {
  const pieces: Piece[] = [...propBirch({ seed: 41, scale: 0.55 })];
  pieces.push(
    cylinder("stake", [0.28, 0.75, 0.1], 0.045, 1.5, "#9c8a6a", undefined, "wood"),
    part("tie", "cloth", "panel", [0.14, 1.18, 0.05], [0.34, 0.05, 0.05], "#3f6e52", {
      bearsLoad: false,
      contactBoxes: [{ position: [0.14, 1.18, 0.05], size: [0.44, 0.16, 0.2] }],
    }),
  );
  return prefab("city:tree:sapling", "Freshly planted staked sapling", ["city", "flora", "tree", "new-town"], pieces);
}

const coreClutter = [
  prefab("core:crate", "Slatted crate", ["core", "storage"], propCrate({})),
  prefab("core:pallet", "Shipping pallet", ["core", "storage"], propPallet({})),
  prefab("core:plank-stack", "Plank stack", ["core", "lumber"], propPlankStack({})),
  prefab("core:tarp", "Folded tarpaulin", ["core", "cloth"], propTarpPile({})),
  prefab("core:bucket", "Galvanised bucket", ["core", "household"], propBucket({})),
  prefab("core:steel-drum", "Weathered steel drum", ["core", "storage"], propSteelDrum({ color: "#33383a" })),
  prefab("core:spool", "Cable spool", ["core", "industrial"], propSpool({})),
  prefab("core:sacks", "Pile of sacks", ["core", "storage"], propSackPile({})),
  prefab("core:caution", "Caution board", ["core", "industrial"], propCautionBoard({})),
];

const prefabs = [
  modernTower("city:tower:stone", "Pale stone residential tower", {
    width: 15,
    depth: 12,
    floors: 9,
    cladding: "#cbc9bf",
    accent: "#8b867d",
    glass: DARK_GLASS,
    crown: "arches",
  }),
  modernTower("city:tower:glass", "Blue glass residential tower", {
    width: 13,
    depth: 11,
    floors: 11,
    cladding: "#9da6a8",
    accent: "#d4d3cb",
    glass: "#6d8895",
    crown: "frame",
  }),
  modernTower("city:tower:warm", "Warm orange courtyard tower", {
    width: 14,
    depth: 12,
    floors: 10,
    cladding: "#b87550",
    accent: "#4c4a49",
    glass: "#5c6e72",
    crown: "plain",
  }),
  oldTwoStoreyHouse(),
  courtyardOutbuilding(),
  hardwareShop(),
  servicePodium(),
  ledCommercialHall(),
  yellowCourtyardWing(),
  breezeFenceSection(),
  fencePillarLamp(),
  weatheredBlueGate(),
  bicycle(),
  streetLamp("city:lamp:street"),
  streetLamp("city:lamp:ring", true),
  trafficSignal(),
  ledBillboard(),
  securityCamera(),
  roadSign("city:sign:one-way", "Blue one-way sign", "one-way"),
  roadSign("city:sign:parking", "Blue parking sign", "parking"),
  bollard(),
  curb("city:curb:yellow", "Painted yellow curb section", "#d4ad20"),
  curb("city:curb:stone", "Wet concrete curb section", "#8b8981"),
  gasService(),
  toolDisplay(),
  wheelbarrow(),
  vehicle("city:car:sedan", "Parked city sedan", "sedan"),
  vehicle("city:car:minivan", "Parked white minivan", "minivan"),
  vehicle("city:vehicle:mini-truck", "Small municipal cargo truck", "mini-truck"),
  parkModule("city:park:stairs", "Brick-paved park stair flight", "stairs"),
  parkModule("city:park:ramp", "Accessible park ramp with steel rails", "ramp"),
  parkModule("city:park:retaining-wall", "Masonry park retaining wall", "retaining"),
  parkModule("city:park:railing", "Steel park railing section", "railing"),
  parkModule("city:lawn:fence", "Low geometric lawn fence", "lawn-fence"),
  parkModule("city:drain:linear", "Linear sidewalk drain", "linear-drain"),
  ...[1, 2, 3].map(streetTree),
  prefab("city:tree:courtyard", "Broad courtyard tree", ["city", "flora", "tree"], propOak({ seed: 17, scale: 1.4 })),
  prefab("city:tree:willow", "Heavy overhanging yard tree", ["city", "flora", "tree"], propOak({ seed: 29, scale: 1.75 })),
  hedge(),
  flowerBed(),
  gableYellowHouse(),
  yawQuarterPrefab(
    gableYellowHouse(),
    "city:house:gable-yellow-ew",
    "Yellow gabled house facing east",
  ),
  hipCreamHouse(),
  hipWhiteHouse(),
  birdhouse(),
  cardboardBoxes(),
  buildingSuppliesKiosk(),
  whitebrickFenceSection(),
  profiledFenceSection(),
  fencePillarPlain(),
  carportStringLights(),
  clothesline(),
  kickScooter(),
  sandwichBoard(),
  broomBucket(),
  saplingWithStake(),
  ...coreClutter,
] as const;

export const cityPrefabLibrary: ScenePrefabLibrary = new Map(
  prefabs.map((definition) => [definition.id, definition]),
);

export const cityPrefabDefinitions = prefabs;
