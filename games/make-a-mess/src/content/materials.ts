import { materialId, type MaterialId } from "./contracts";

export interface DestructionMaterialDefinition {
  readonly id: MaterialId;
  readonly density: number;
  readonly hardness: number;
  readonly fracture: "splinter" | "crumble" | "shatter" | "bend";
  readonly impactSoundSet: string;
  readonly dustProfile: string;
  readonly color: `#${string}`;
}

export const materialIds = {
  brick: materialId("brick"),
  ceramic: materialId("ceramic"),
  concrete: materialId("concrete"),
  cloth: materialId("cloth"),
  glass: materialId("glass"),
  metal: materialId("metal"),
  plaster: materialId("plaster"),
  soil: materialId("soil"),
  steel: materialId("steel"),
  stone: materialId("stone"),
  wood: materialId("wood"),
} as const;

export const destructionMaterials = {
  brick: {
    id: materialIds.brick,
    density: 1.85,
    hardness: 0.72,
    fracture: "crumble",
    impactSoundSet: "masonry-impact",
    dustProfile: "brick-red",
    color: "#B9472D",
  },
  concrete: {
    id: materialIds.concrete,
    density: 2.4,
    hardness: 0.82,
    fracture: "crumble",
    impactSoundSet: "concrete-impact",
    dustProfile: "concrete-grey",
    color: "#797A74",
  },
  cloth: {
    id: materialIds.cloth,
    density: 0.24,
    hardness: 0.1,
    fracture: "splinter",
    impactSoundSet: "cloth-impact",
    dustProfile: "cloth-fibres",
    color: "#A98A64",
  },
  plaster: {
    id: materialIds.plaster,
    density: 0.92,
    hardness: 0.28,
    fracture: "crumble",
    impactSoundSet: "plaster-impact",
    dustProfile: "plaster-white",
    color: "#E9E4D7",
  },
  stone: {
    id: materialIds.stone,
    density: 2.55,
    hardness: 0.8,
    fracture: "crumble",
    impactSoundSet: "stone-impact",
    dustProfile: "stone-grey",
    color: "#77746C",
  },
  soil: {
    id: materialIds.soil,
    density: 1.35,
    hardness: 0.18,
    fracture: "crumble",
    impactSoundSet: "soil-impact",
    dustProfile: "soil-brown",
    color: "#607B43",
  },
  steel: {
    id: materialIds.steel,
    density: 7.85,
    hardness: 0.92,
    fracture: "bend",
    impactSoundSet: "steel-impact",
    dustProfile: "steel-spark",
    color: "#6D7C7E",
  },
  wood: {
    id: materialIds.wood,
    density: 0.64,
    hardness: 0.38,
    fracture: "splinter",
    impactSoundSet: "wood-impact",
    dustProfile: "wood-pale",
    color: "#A76D3D",
  },
  glass: {
    id: materialIds.glass,
    density: 2.5,
    hardness: 0.55,
    fracture: "shatter",
    impactSoundSet: "glass-impact",
    dustProfile: "glass-spark",
    color: "#A9DDE2",
  },
  metal: {
    id: materialIds.metal,
    density: 7.85,
    hardness: 0.88,
    fracture: "bend",
    impactSoundSet: "metal-impact",
    dustProfile: "metal-spark",
    color: "#6D7275",
  },
  ceramic: {
    id: materialIds.ceramic,
    density: 2.35,
    hardness: 0.6,
    fracture: "shatter",
    impactSoundSet: "ceramic-impact",
    dustProfile: "ceramic-white",
    color: "#E7E1D5",
  },
} as const satisfies Record<string, DestructionMaterialDefinition>;
