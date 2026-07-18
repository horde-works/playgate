import {
  assetPath,
  objectId,
  type DestructibleObjectDefinition,
} from "../contracts";
import { materialIds } from "../materials";

type GarageShelfPart = "frame" | "topShelf" | "middleShelf" | "bottomShelf";

export const garageShelf = {
  schemaVersion: 1,
  id: objectId("garage:shelf-01"),
  displayName: "Garage shelf",
  tags: ["garage", "storage", "wood", "destructible"],
  transform: {
    position: [0, 0, 0],
  },
  render: {
    intact: assetPath("objects/garage-shelf/garage-shelf.glb"),
    lods: [
      {
        source: assetPath("objects/garage-shelf/garage-shelf-lod1.glb"),
        maxDistance: 24,
      },
    ],
    castShadow: true,
    receiveShadow: true,
  },
  parts: [
    {
      id: "frame",
      node: "shelf_frame",
      material: materialIds.wood,
      mass: 14,
      collider: {
        shape: "box",
        halfExtents: [0.72, 1.04, 0.22],
      },
      destructible: true,
    },
    {
      id: "topShelf",
      node: "shelf_top",
      material: materialIds.wood,
      mass: 3.2,
      collider: {
        shape: "box",
        halfExtents: [0.72, 0.05, 0.22],
        offset: [0, 0.98, 0],
      },
      destructible: true,
    },
    {
      id: "middleShelf",
      node: "shelf_middle",
      material: materialIds.wood,
      mass: 3.2,
      collider: {
        shape: "box",
        halfExtents: [0.72, 0.05, 0.22],
        offset: [0, 0.24, 0],
      },
      destructible: true,
    },
    {
      id: "bottomShelf",
      node: "shelf_bottom",
      material: materialIds.wood,
      mass: 3.2,
      collider: {
        shape: "box",
        halfExtents: [0.72, 0.05, 0.22],
        offset: [0, -0.5, 0],
      },
      destructible: true,
    },
  ],
  joints: [
    {
      id: "frame-to-world",
      from: "frame",
      to: "world",
      kind: "fixed",
      breakForce: 2200,
      breakTorque: 900,
      anchor: [0, -1.04, 0],
    },
    {
      id: "top-to-frame",
      from: "topShelf",
      to: "frame",
      kind: "fixed",
      breakForce: 740,
      breakTorque: 280,
      anchor: [0, 0.98, 0],
    },
    {
      id: "middle-to-frame",
      from: "middleShelf",
      to: "frame",
      kind: "fixed",
      breakForce: 680,
      breakTorque: 240,
      anchor: [0, 0.24, 0],
    },
    {
      id: "bottom-to-frame",
      from: "bottomShelf",
      to: "frame",
      kind: "fixed",
      breakForce: 720,
      breakTorque: 260,
      anchor: [0, -0.5, 0],
    },
  ],
  destruction: {
    grid: {
      cellSize: 0.08,
      bounds: {
        min: [-0.78, -1.06, -0.28],
        max: [0.78, 1.08, 0.28],
      },
      source: assetPath("objects/garage-shelf/garage-shelf.structure.bin"),
    },
    materialVolumes: [
      {
        material: materialIds.wood,
        nodes: ["shelf_frame", "shelf_top", "shelf_middle", "shelf_bottom"],
      },
    ],
    supports: [
      {
        id: "left-foot",
        part: "frame",
        position: [-0.64, -1.04, 0],
        radius: 0.12,
        kind: "ground",
      },
      {
        id: "right-foot",
        part: "frame",
        position: [0.64, -1.04, 0],
        radius: 0.12,
        kind: "ground",
      },
    ],
    detachThreshold: 0.34,
    smallestDynamicChunk: 0.09,
    debrisBudget: 42,
  },
  feedback: {
    impactSoundSet: "wood-impact",
    fractureSoundSet: "wood-fracture",
    dustProfile: "wood-pale",
    debrisProfile: "wood-splinters",
  },
} as const satisfies DestructibleObjectDefinition<GarageShelfPart>;
