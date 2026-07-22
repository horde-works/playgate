import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";

/**
 * Shared, era-agnostic prop pieces — the "standard furniture" of every map.
 *
 * Each builder returns pieces in LOCAL space (origin at the ground under the
 * prop's centre), so the same cask or crate can be registered as a prefab for
 * document-compiled scenes (Viking village) or translated into world space for
 * programmatic scenes (the town). Everything is an ordinary breakable body:
 * ground-supported, with explicit contact boxes wherever a piece is rotated so
 * the axis-aligned structural solver still sees a correct footprint.
 *
 * Design rule: 1–8 pieces per prop. Clutter is bought in bulk; it must stay
 * cheap for physics and for the instanced renderer.
 */

export type PropPiece = ScenePrefabPieceDefinition;

const IRON = "#3a3d3e";

function selfContact(piece: PropPiece): PropPiece {
  return piece.contactBoxes
    ? piece
    : { ...piece, contactBoxes: [{ position: piece.position, size: piece.size }] };
}

/** A wooden cask: bellied body with two proud iron hoop rings. */
export function propCask(options: {
  readonly scale?: number;
  readonly timber?: string;
  readonly weathering?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const timber = options.timber ?? "#6f4f36";
  const weathering = options.weathering ?? 0.25;
  return [
    {
      id: "body",
      material: "wood",
      shape: "cylinder",
      position: [0, 0.65 * s, 0],
      size: [1.02 * s, 1.3 * s, 1.02 * s],
      color: timber,
      weathering,
    },
    ...[0.3, 1.0].map((y, index): PropPiece => ({
      id: `hoop:${index}`,
      material: "steel",
      shape: "cylinder",
      position: [0, y * s, 0],
      size: [1.1 * s, 0.09 * s, 1.1 * s],
      color: IRON,
      bearsLoad: false,
      sideAttachmentReach: 0.18,
      contactBoxes: [{ position: [0, y * s, 0], size: [1.1 * s, 0.09 * s, 1.1 * s] }],
    })),
  ];
}

/** The same cask toppled on its side, axis along local X (yaw via `yaw`). */
export function propCaskLying(options: {
  readonly scale?: number;
  readonly yaw?: number;
  readonly timber?: string;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const radius = 0.51 * s;
  const body: PropPiece = {
    id: "body",
    material: "wood",
    shape: "cylinder",
    position: [0, radius, 0],
    rotation: [0, yaw, Math.PI / 2],
    size: [1.02 * s, 1.3 * s, 1.02 * s],
    color: options.timber ?? "#6a4b33",
    weathering: 0.3,
    // A slim central column footprint keeps the rotated cylinder supported
    // without overstating its axis-aligned extent.
    contactBoxes: [{ position: [0, radius, 0], size: [0.6 * s, 1.02 * s, 0.6 * s] }],
  };
  const hoops = [-0.35, 0.35].map((offset, index): PropPiece => ({
    id: `hoop:${index}`,
    material: "steel",
    shape: "cylinder",
    position: [
      Math.cos(yaw) * offset * s,
      radius,
      -Math.sin(yaw) * offset * s,
    ],
    rotation: [0, yaw, Math.PI / 2],
    size: [1.1 * s, 0.09 * s, 1.1 * s],
    color: IRON,
    bearsLoad: false,
      sideAttachmentReach: 0.18,
    contactBoxes: [{
      position: [Math.cos(yaw) * offset * s, radius, -Math.sin(yaw) * offset * s],
      size: [0.5 * s, 1.02 * s, 0.5 * s],
    }],
  }));
  return [body, ...hoops];
}

/** A modern steel drum (fuel/paint) with two pressed ribs. */
export function propSteelDrum(options: {
  readonly color?: string;
  readonly scale?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const color = options.color ?? "#4c6178";
  return [
    {
      id: "body",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.46 * s, 0],
      size: [0.6 * s, 0.92 * s, 0.6 * s],
      color,
    },
    ...[0.3, 0.62].map((y, index): PropPiece => ({
      id: `rib:${index}`,
      material: "steel",
      shape: "cylinder",
      position: [0, y * s, 0],
      size: [0.64 * s, 0.05 * s, 0.64 * s],
      color: "#3d4d5e",
      bearsLoad: false,
      sideAttachmentReach: 0.15,
      contactBoxes: [{ position: [0, y * s, 0], size: [0.64 * s, 0.05 * s, 0.64 * s] }],
    })),
  ];
}

/** A slatted wooden crate with a lid rim and one side batten. */
export function propCrate(options: {
  readonly scale?: number;
  readonly yaw?: number;
  readonly timber?: string;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const timber = options.timber ?? "#8a663f";
  return [
    {
      id: "body",
      material: "wood",
      shape: "plank",
      position: [0, 0.34 * s, 0],
      rotation: [0, yaw, 0],
      size: [0.92 * s, 0.68 * s, 0.78 * s],
      color: timber,
      weathering: 0.18,
      contactBoxes: [{ position: [0, 0.34 * s, 0], size: [0.8 * s, 0.68 * s, 0.7 * s] }],
    },
    {
      id: "lid",
      material: "wood",
      shape: "plank",
      position: [0, 0.71 * s, 0],
      rotation: [0, yaw, 0],
      size: [0.98 * s, 0.07 * s, 0.84 * s],
      color: "#75552f",
      sideAttachmentReach: 0.16,
      contactBoxes: [{ position: [0, 0.71 * s, 0], size: [0.8 * s, 0.07 * s, 0.7 * s] }],
    },
    {
      id: "batten",
      material: "wood",
      shape: "plank",
      position: [Math.cos(yaw) * 0.0, 0.34 * s, 0],
      rotation: [0, yaw, 0],
      size: [0.96 * s, 0.1 * s, 0.82 * s],
      color: "#6d4d2b",
      bearsLoad: false,
      sideAttachmentReach: 0.18,
      contactBoxes: [{ position: [0, 0.34 * s, 0], size: [0.8 * s, 0.1 * s, 0.7 * s] }],
    },
  ];
}

/** An iron-bound chest (shared with the Viking interiors). */
export function propChest(options: { readonly scale?: number } = {}): PropPiece[] {
  const s = options.scale ?? 1;
  return [
    selfContact({
      id: "body",
      material: "wood",
      shape: "plank",
      position: [0, 0.23 * s, 0],
      size: [0.86 * s, 0.46 * s, 0.52 * s],
      color: "#725038",
      carriesAttachments: true,
    }),
    selfContact({
      id: "lid",
      material: "wood",
      shape: "plank",
      position: [0, 0.52 * s, 0],
      size: [0.9 * s, 0.12 * s, 0.56 * s],
      color: "#3f3027",
    }),
    ...[-0.24, 0.24].map((x, index): PropPiece =>
      selfContact({
        id: `band:${index}`,
        material: "steel",
        shape: "steelSheet",
        position: [x * s, 0.34 * s, 0.28 * s],
        size: [0.09 * s, 0.5 * s, 0.05 * s],
        color: IRON,
        bearsLoad: false,
        sideAttachmentReach: 0.3 * s,
      }),
    ),
  ];
}

/** A shipping pallet: three bearers under five deck boards. */
export function propPallet(options: {
  readonly yaw?: number;
  readonly scale?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const pieces: PropPiece[] = [];
  for (const [index, offset] of [-0.5, 0, 0.5].entries()) {
    pieces.push({
      id: `bearer:${index}`,
      material: "wood",
      shape: "plank",
      position: [cos * offset * s, 0.06 * s, -sin * offset * s],
      rotation: [0, yaw, 0],
      size: [0.12 * s, 0.12 * s, 1.02 * s],
      color: "#9b7a4e",
      contactBoxes: [{
        position: [cos * offset * s, 0.06 * s, -sin * offset * s],
        size: [0.12 * s, 0.12 * s, 0.8 * s],
      }],
    });
  }
  for (const [index, offset] of [-0.42, -0.21, 0, 0.21, 0.42].entries()) {
    pieces.push({
      id: `board:${index}`,
      material: "wood",
      shape: "plank",
      position: [sin * offset * s, 0.15 * s, cos * offset * s],
      rotation: [0, yaw, 0],
      size: [1.16 * s, 0.05 * s, 0.16 * s],
      color: index % 2 === 0 ? "#a8865a" : "#96754a",
      contactBoxes: [{
        position: [sin * offset * s, 0.15 * s, cos * offset * s],
        size: [0.8 * s, 0.05 * s, 0.16 * s],
      }],
    });
  }
  return pieces;
}

/** Two or three slumped burlap sacks. */
export function propSackPile(options: {
  readonly count?: 2 | 3;
  readonly scale?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const layout: readonly (readonly [number, number, number, number, string])[] =
    options.count === 2
      ? [
          [-0.22, 0, 0.12, 0.2, "#a89a77"],
          [0.26, 0.05, -0.1, -0.3, "#8f8161"],
        ]
      : [
          [-0.3, 0, 0.14, 0.25, "#a89a77"],
          [0.28, 0, -0.12, -0.2, "#8f8161"],
          [0.02, 0, 0.42, 0.55, "#9c8d6b"],
        ];
  return layout.map(([x, y, z, yaw, color], index) => ({
    id: `sack:${index}`,
    material: "cloth",
    shape: "panel",
    position: [x * s, (y + 0.22) * s, z * s],
    rotation: [0, yaw, 0],
    size: [0.66 * s, 0.42 * s, 0.46 * s],
    color,
    carriesAttachments: true,
    sideAttachmentReach: 0.4,
    contactBoxes: [{ position: [x * s, (y + 0.22) * s, z * s], size: [0.5 * s, 0.42 * s, 0.4 * s] }],
  }));
}

/** A cable/rope spool lying on its flanges, drum horizontal. */
export function propSpool(options: {
  readonly yaw?: number;
  readonly scale?: number;
  readonly drumColor?: string;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const radius = 0.46 * s;
  const flangeOffset = 0.3 * s;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const at = (offset: number): readonly [number, number, number] =>
    [cos * offset, radius, -sin * offset];
  return [
    ...[-flangeOffset, flangeOffset].map((offset, index): PropPiece => ({
      id: `flange:${index}`,
      material: "wood",
      shape: "cylinder",
      position: at(offset),
      rotation: [0, yaw, Math.PI / 2],
      size: [0.92 * s, 0.08 * s, 0.92 * s],
      color: "#a98e63",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      contactBoxes: [{ position: at(offset), size: [0.4 * s, 0.92 * s, 0.4 * s] }],
    })),
    {
      id: "drum",
      material: "wood",
      shape: "cylinder",
      position: [0, radius, 0],
      rotation: [0, yaw, Math.PI / 2],
      size: [0.52 * s, 0.52 * s, 0.52 * s],
      color: options.drumColor ?? "#2f3d33",
      bearsLoad: false,
      sideAttachmentReach: 0.25,
      contactBoxes: [{ position: [0, radius, 0], size: [0.4 * s, 0.52 * s, 0.4 * s] }],
    },
  ];
}

/** A loose stack of planks, slightly fanned. */
export function propPlankStack(options: {
  readonly yaw?: number;
  readonly scale?: number;
  readonly count?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const count = options.count ?? 5;
  const pieces: PropPiece[] = [];
  for (let index = 0; index < count; index += 1) {
    const wobble = (index % 2 === 0 ? 1 : -1) * (0.05 + index * 0.015);
    const lift = 0.045 + index * 0.075;
    pieces.push({
      id: `plank:${index}`,
      material: "wood",
      shape: "plank",
      position: [0, lift * s, ((index % 3) - 1) * 0.05 * s],
      rotation: [0, yaw + wobble, 0],
      size: [2.1 * s, 0.075 * s, 0.24 * s],
      color: index % 3 === 0 ? "#9a714c" : index % 3 === 1 ? "#8a6440" : "#a87f53",
      weathering: 0.2,
      contactBoxes: [{
        position: [0, lift * s, ((index % 3) - 1) * 0.05 * s],
        size: [1.2 * s, 0.075 * s, 0.24 * s],
      }],
    });
  }
  return pieces;
}

/** A wooden bucket. */
export function propBucket(options: { readonly scale?: number } = {}): PropPiece[] {
  const s = options.scale ?? 1;
  return [
    {
      id: "body",
      material: "wood",
      shape: "cylinder",
      position: [0, 0.19 * s, 0],
      size: [0.34 * s, 0.38 * s, 0.34 * s],
      color: "#7a5a3a",
    },
    {
      id: "rim",
      material: "steel",
      shape: "cylinder",
      position: [0, 0.35 * s, 0],
      size: [0.37 * s, 0.045 * s, 0.37 * s],
      color: IRON,
      bearsLoad: false,
      sideAttachmentReach: 0.12,
      contactBoxes: [{ position: [0, 0.35 * s, 0], size: [0.37 * s, 0.045 * s, 0.37 * s] }],
    },
  ];
}

/** A folded tarpaulin pile (cloth, stays still — low panels don't catch wind). */
export function propTarpPile(options: {
  readonly yaw?: number;
  readonly color?: string;
  readonly scale?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const color = options.color ?? "#5e6a5a";
  return [
    {
      id: "fold:0",
      material: "cloth",
      shape: "panel",
      position: [0, 0.17 * s, 0],
      rotation: [0, yaw, 0],
      size: [1.4 * s, 0.34 * s, 1.05 * s],
      color,
      carriesAttachments: true,
      contactBoxes: [{ position: [0, 0.17 * s, 0], size: [1.0 * s, 0.34 * s, 0.8 * s] }],
    },
    {
      id: "fold:1",
      material: "cloth",
      shape: "panel",
      position: [0.62 * s, 0.1 * s, -0.5 * s],
      rotation: [0, yaw + 0.35, 0],
      size: [0.9 * s, 0.2 * s, 0.68 * s],
      color: "#525d4f",
      sideAttachmentReach: 0.3,
      contactBoxes: [{ position: [0.62 * s, 0.1 * s, -0.5 * s], size: [0.6 * s, 0.2 * s, 0.5 * s] }],
    },
  ];
}

/** A stack of worn tyres. */
export function propTyreStack(options: {
  readonly count?: number;
  readonly scale?: number;
} = {}): PropPiece[] {
  const s = options.scale ?? 1;
  const count = options.count ?? 3;
  const pieces: PropPiece[] = [];
  for (let index = 0; index < count; index += 1) {
    const jitterX = ((index * 37) % 10 - 5) * 0.014 * s;
    const jitterZ = ((index * 53) % 10 - 5) * 0.014 * s;
    pieces.push({
      id: `tyre:${index}`,
      material: "asphalt",
      shape: "cylinder",
      position: [jitterX, (0.11 + index * 0.22) * s, jitterZ],
      size: [0.68 * s, 0.22 * s, 0.68 * s],
      color: index % 2 === 0 ? "#26282a" : "#2d2f31",
      sideAttachmentReach: 0.2,
      contactBoxes: [{
        position: [jitterX, (0.11 + index * 0.22) * s, jitterZ],
        size: [0.5 * s, 0.22 * s, 0.5 * s],
      }],
    });
  }
  return pieces;
}

/** A courtyard dumpster with a slightly-open lid. */
export function propDumpster(options: {
  readonly yaw?: number;
  readonly color?: string;
} = {}): PropPiece[] {
  const yaw = options.yaw ?? 0;
  const color = options.color ?? "#51695a";
  return [
    {
      id: "body",
      material: "steel",
      shape: "steelSheet",
      position: [0, 0.62, 0],
      rotation: [0, yaw, 0],
      size: [1.9, 1.14, 1.12],
      color,
      weathering: 0.22,
      contactBoxes: [{ position: [0, 0.62, 0], size: [1.5, 1.14, 0.9] }],
    },
    {
      id: "lid",
      material: "steel",
      shape: "steelSheet",
      position: [0, 1.26, -0.1],
      rotation: [0.16, yaw, 0],
      size: [1.86, 0.07, 1.1],
      color: "#41564a",
      bearsLoad: false,
      contactBoxes: [{ position: [0, 1.26, -0.1], size: [1.5, 0.07, 0.8] }],
    },
    ...[-1, 1].map((side, index): PropPiece => ({
      id: `pocket:${index}`,
      material: "steel",
      shape: "steelSheet",
      position: [side * 0.99, 0.5, 0],
      rotation: [0, yaw, 0],
      size: [0.09, 0.28, 0.5],
      color: "#39493f",
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      contactBoxes: [{ position: [side * 0.99, 0.5, 0], size: [0.09, 0.28, 0.4] }],
    })),
  ];
}

/** A black/yellow caution board on two short legs (works sites, pits). */
export function propCautionBoard(options: {
  readonly yaw?: number;
  readonly width?: number;
} = {}): PropPiece[] {
  const yaw = options.yaw ?? 0;
  const width = options.width ?? 1.6;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const stripes = 6;
  const stripeWidth = width / stripes;
  const pieces: PropPiece[] = [];
  for (const [index, offset] of [-width / 2 + 0.08, width / 2 - 0.08].entries()) {
    pieces.push({
      id: `leg:${index}`,
      material: "wood",
      shape: "plank",
      position: [cos * offset, 0.42, -sin * offset],
      rotation: [0, yaw, 0],
      size: [0.09, 0.84, 0.09],
      color: "#5d5346",
      carriesAttachments: true,
      contactBoxes: [{ position: [cos * offset, 0.42, -sin * offset], size: [0.09, 0.84, 0.09] }],
    });
  }
  for (let stripe = 0; stripe < stripes; stripe += 1) {
    const offset = -width / 2 + stripeWidth * (stripe + 0.5);
    pieces.push({
      id: `stripe:${stripe}`,
      material: "wood",
      shape: "plank",
      position: [cos * offset, 0.86, -sin * offset],
      rotation: [0, yaw, 0],
      size: [stripeWidth * 0.98, 0.3, 0.06],
      color: stripe % 2 === 0 ? "#d8b13a" : "#2b2b28",
      bearsLoad: false,
      sideAttachmentReach: 0.62,
      contactBoxes: [{
        position: [cos * offset, 0.86, -sin * offset],
        size: [stripeWidth * 0.98, 0.3, 0.06],
      }],
    });
  }
  return pieces;
}

/**
 * Translate a prop's local pieces into world space for programmatic scenes.
 * Positions (and contact boxes) shift by the anchor; ids gain the prefix.
 * Rotation is left to the builders themselves (`yaw` options), so no Euler
 * composition is needed here.
 */
export function placeProp(
  prefix: string,
  pieces: readonly PropPiece[],
  anchor: readonly [number, number, number],
): PropPiece[] {
  const [ax, ay, az] = anchor;
  return pieces.map((piece) => ({
    ...piece,
    id: `${prefix}:${piece.id}`,
    position: [
      piece.position[0] + ax,
      piece.position[1] + ay,
      piece.position[2] + az,
    ],
    contactBoxes: piece.contactBoxes?.map((box) => ({
      position: [box.position[0] + ax, box.position[1] + ay, box.position[2] + az],
      size: box.size,
    })),
  }));
}
