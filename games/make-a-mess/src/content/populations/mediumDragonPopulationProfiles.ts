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
const gateTowerSurfaceY = 13.02;
const gateTowerSupports = (towerIndex: number) => [0, 1, 2, 3, 4].map(
  (merlon) => `stronghold:gatehouse:tower:${towerIndex}:merlon:${merlon}`,
);

const darkTowerBehaviour = {
  observation: 0.72,
  rest: 1,
  bodyCare: 0.92,
  territorial: 0.58,
  exposure: 0.24,
  landingRisk: 0.16,
} as const;

const gateLookoutBehaviour = {
  observation: 0.96,
  rest: 0.24,
  bodyCare: 0.3,
  territorial: 1,
  exposure: 0.7,
  landingRisk: 0.52,
} as const;

/**
 * One adult dragon roosts on the quiet rear half of the dark tower. No summit
 * is magical: losing its supports removes that site, then intact normal crowns
 * are preferred before the open highland emergency patches.
 */
export const basaltStrongholdDragonProfile = defineMediumDragonPopulationProfile({
  id: "basalt-stronghold-dragon",
  bodyType: "medium-dragon",
  genus: "Draco",
  species: "Draco pterosauroides",
  phenotype: "basalt-ash-membrane",
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
    skin: "#373538",
    skinPlane: "#51494a",
    belly: "#75645a",
    membrane: "#604047",
    claws: "#292a2b",
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
        siteId: "dark-tower-crown",
        kind: "roost",
        position: [0, towerCrownSurfaceY, -37],
        heading: Math.PI,
        usableRadius: 3.2,
        supportPieceIds: towerCrownSupports,
        watchTarget: [0, 8, -4],
        behaviour: darkTowerBehaviour,
      },
      {
        id: "tower-launch",
        siteId: "dark-tower-crown",
        kind: "launch",
        position: [0, towerCrownSurfaceY, -38],
        heading: Math.PI,
        usableRadius: 3,
        supportPieceIds: towerCrownSupports,
      },
      {
        id: "tower-landing",
        siteId: "dark-tower-crown",
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
        watchTarget: [0, 8, -4],
        behaviour: darkTowerBehaviour,
      },
      {
        id: "left-gate-landing",
        siteId: "left-gate-tower",
        kind: "landing",
        position: [-6.8, gateTowerSurfaceY, -0.42],
        heading: 0.38,
        usableRadius: 2.15,
        touchdownFootprint: {
          halfWidth: 1.55,
          rearExtent: 1.7,
          forwardExtent: 1.7,
        },
        supportPieceIds: gateTowerSupports(0),
        watchTarget: [-24, 2.5, 24],
        behaviour: gateLookoutBehaviour,
      },
      {
        id: "left-gate-launch",
        siteId: "left-gate-tower",
        kind: "launch",
        position: [-6.8, gateTowerSurfaceY, -0.42],
        heading: 0.38,
        usableRadius: 2.15,
        supportPieceIds: gateTowerSupports(0),
      },
      {
        id: "right-gate-landing",
        siteId: "right-gate-tower",
        kind: "landing",
        position: [6.8, gateTowerSurfaceY, -0.42],
        heading: -0.38,
        usableRadius: 2.15,
        touchdownFootprint: {
          halfWidth: 1.55,
          rearExtent: 1.7,
          forwardExtent: 1.7,
        },
        supportPieceIds: gateTowerSupports(1),
        watchTarget: [24, 2.5, 24],
        behaviour: gateLookoutBehaviour,
      },
      {
        id: "right-gate-launch",
        siteId: "right-gate-tower",
        kind: "launch",
        position: [6.8, gateTowerSurfaceY, -0.42],
        heading: -0.38,
        usableRadius: 2.15,
        supportPieceIds: gateTowerSupports(1),
      },
      {
        id: "rear-highland",
        siteId: "rear-highland",
        kind: "emergency-landing",
        position: [15, 0.04, -57],
        heading: 0,
        usableRadius: 6,
        supportPieceIds: ["stronghold:ground:grass:263"],
      },
      {
        id: "rear-highland-launch",
        siteId: "rear-highland",
        kind: "launch",
        position: [15, 0.04, -57],
        heading: 0,
        usableRadius: 6,
        supportPieceIds: ["stronghold:ground:grass:263"],
      },
      {
        id: "west-highland",
        siteId: "west-highland",
        kind: "emergency-landing",
        position: [-15, 0.04, -63],
        heading: 0.35,
        usableRadius: 6,
        supportPieceIds: ["stronghold:ground:grass:162"],
      },
      {
        id: "west-highland-launch",
        siteId: "west-highland",
        kind: "launch",
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
