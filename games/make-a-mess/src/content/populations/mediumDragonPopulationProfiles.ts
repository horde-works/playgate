import { defineMediumDragonPopulationProfile } from "../../game/mediumDragonPopulationProfile.ts";

const towerRearRoofSupports = [
  "stronghold:dark-tower:roof:1:0",
  "stronghold:dark-tower:roof:2:0",
  "stronghold:dark-tower:roof:1:1",
  "stronghold:dark-tower:roof:2:1",
] as const;

// The dragon runtime datum is the contact plane under its feet, not the
// centre of the supporting slab. Dark-tower roof slabs are centred at 33.38 m
// and are 0.38 m thick, so their walkable top is 33.57 m.
const towerRoofSurfaceY = 33.57;

/**
 * One adult dragon roosts on the quiet rear half of the dark tower. The roof
 * is deliberately not magical: losing its slabs invalidates launch/landing
 * and sends the animal to open highland emergency patches.
 */
export const basaltStrongholdDragonProfile = defineMediumDragonPopulationProfile({
  id: "basalt-stronghold-dragon",
  bodyType: "medium-dragon",
  genus: "Draco",
  species: "Draco pterosauroides",
  phenotype: "dark-highland-membrane",
  skills: [
    "observe",
    "ground-roam",
    "quadrupedal-vault-launch",
    "powered-flight",
    "glide-soar",
    "territory-patrol",
    "tower-roost",
    "investigate",
  ],
  appearance: {
    skin: "#35463d",
    skinPlane: "#4d5d50",
    belly: "#756255",
    membrane: "#52665a",
    claws: "#303534",
    eyes: "#d6a53b",
  },
  traits: {
    boldness: 0.62,
    curiosity: 0.73,
    patience: 0.68,
    territoriality: 0.76,
    playfulness: 0.28,
    flightSkill: 0.82,
    routeFamiliarity: 0.9,
  },
  territory: {
    spawnNodeId: "tower-roost",
    nodes: [
      {
        id: "tower-roost",
        kind: "roost",
        position: [-1.62, towerRoofSurfaceY, -38.4],
        heading: 0,
        usableRadius: 3.2,
        supportPieceIds: towerRearRoofSupports,
      },
      {
        id: "tower-launch",
        kind: "launch",
        position: [-1.62, towerRoofSurfaceY, -39.7],
        heading: Math.PI,
        usableRadius: 3,
        supportPieceIds: towerRearRoofSupports,
      },
      {
        id: "tower-landing",
        kind: "landing",
        position: [-1.62, towerRoofSurfaceY, -40.4],
        heading: 0,
        usableRadius: 3.2,
        touchdownFootprint: {
          halfWidth: 4.7,
          rearExtent: 1.1,
          forwardExtent: 9.2,
        },
        supportPieceIds: towerRearRoofSupports,
      },
      {
        id: "rear-highland",
        kind: "emergency-landing",
        position: [15, 0.04, -57],
        heading: 0,
        usableRadius: 6,
        supportPieceIds: ["stronghold:ground:grass:263"],
      },
      {
        id: "west-highland",
        kind: "emergency-landing",
        position: [-15, 0.04, -63],
        heading: 0.35,
        usableRadius: 6,
        supportPieceIds: ["stronghold:ground:grass:162"],
      },
    ],
    airspace: {
      centre: [0, 0, -18],
      patrolRadius: 46,
      patrolHeight: 55,
      minimumHeight: 38,
      maximumHeight: 72,
    },
    minimumArrivalReserve: 0.28,
  },
});
