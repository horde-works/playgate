import { defineMediumDragonPopulationProfile } from "../../game/mediumDragonPopulationProfile.ts";

const towerCrownSupports = [
  "stronghold:dark-tower:crown:base:3",
  "stronghold:dark-tower:crown:base:4",
  "stronghold:dark-tower:crown:base:5",
] as const;

// The dragon runtime datum is the contact plane under its feet, not the
// centre of the supporting slab. The visually dominant tower crown is centred
// at 34.1 m and is 1.05 m thick, so its walkable top is 34.625 m. The lower
// 33.57 m roof deck is not a valid perch: the crown edge cuts through a
// medium dragon standing there.
const towerCrownSurfaceY = 34.625;

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
        position: [0, towerCrownSurfaceY, -37],
        heading: Math.PI,
        usableRadius: 3.2,
        supportPieceIds: towerCrownSupports,
      },
      {
        id: "tower-launch",
        kind: "launch",
        position: [0, towerCrownSurfaceY, -38],
        heading: Math.PI,
        usableRadius: 3,
        supportPieceIds: towerCrownSupports,
      },
      {
        id: "tower-landing",
        kind: "landing",
        position: [0, towerCrownSurfaceY, -38],
        heading: 0,
        usableRadius: 3.2,
        touchdownFootprint: {
          halfWidth: 2.1,
          rearExtent: 0.75,
          forwardExtent: 3,
        },
        supportPieceIds: towerCrownSupports,
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
