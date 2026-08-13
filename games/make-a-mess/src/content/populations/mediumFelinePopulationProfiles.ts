import { defineMediumFelinePopulationProfile } from "../../game/mediumFelinePopulationProfile.ts";

/**
 * One melanistic leopard living inside the palisade. Points describe the open
 * commons and its approaches; live obstacle queries keep the animal out of
 * houses, pens, carts and debris after the village changes.
 */
export const vikingVillagePantherProfile = defineMediumFelinePopulationProfile({
  id: "viking-village-panther",
  bodyType: "medium-feline",
  genus: "Panthera",
  species: "Panthera pardus",
  phenotype: "melanistic",
  skills: ["observe", "territory-roam", "play-sprint", "ground-bound", "terrain-perch"],
  appearance: {
    coat: "#151819",
    coatPlane: "#2b3031",
    muzzle: "#383b3b",
    eyes: "#c79732",
  },
  territory: {
    spawn: [5, 34],
    circuit: [
      [5, 34],
      [-4, 30],
      [-7, 22],
      [1, 17],
      [8, 12],
      [5, 6],
      [-2, 2],
      [-9, 7],
      [-15, 16],
      [-10, 25],
      [-2, 34],
    ],
    lookouts: [
      [5, 34],
      [8, 12],
      [-15, 16],
    ],
  },
});
