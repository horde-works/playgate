export type VikingPlanPoint = readonly [x: number, z: number];

export interface VikingVillageHomePlan {
  readonly id: string;
  readonly prefabId: "viking:house:small" | "viking:house:long";
  readonly position: VikingPlanPoint;
  readonly yaw: number;
  readonly width: number;
  readonly length: number;
}

export interface VikingTrafficRoute {
  readonly id: string;
  readonly purpose: string;
  readonly points: readonly VikingPlanPoint[];
  /** Half-width of the visibly travelled strip, in world metres. */
  readonly width: number;
  /** Relative traffic frequency. Intersections accumulate more wear. */
  readonly wear: number;
}

export interface VikingTrafficArea {
  readonly id: string;
  readonly purpose: string;
  readonly center: VikingPlanPoint;
  readonly radius: VikingPlanPoint;
  readonly wear: number;
  readonly rotation?: number;
}

export const vikingVillageHomes: readonly VikingVillageHomePlan[] = [
  { id: "weaver", prefabId: "viking:house:small", position: [-30, 7], yaw: 0.72, width: 7.4, length: 10.5 },
  { id: "brewer", prefabId: "viking:house:long", position: [28, 7], yaw: -0.66, width: 8.4, length: 14.5 },
  { id: "fisher", prefabId: "viking:house:small", position: [-35, -27], yaw: 1.28, width: 7.4, length: 10.5 },
  { id: "smith", prefabId: "viking:house:long", position: [33, -34], yaw: -1.02, width: 8.4, length: 14.5 },
  { id: "family-north", prefabId: "viking:house:small", position: [-22, 30], yaw: 0.18, width: 7.4, length: 10.5 },
  { id: "family-east", prefabId: "viking:house:small", position: [24, 29], yaw: -0.22, width: 7.4, length: 10.5 },
  { id: "elder", prefabId: "viking:house:small", position: [-14, -46], yaw: 2.74, width: 7.4, length: 10.5 },
] as const;

export function vikingPlanLocalPoint(
  origin: VikingPlanPoint,
  yaw: number,
  localX: number,
  localZ: number,
): VikingPlanPoint {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  // Matches the three.js Euler-Y rotation the house prefab is placed with, so
  // local +Z is the door side. (The earlier form mirrored Z, which put every
  // entrance, threshold, path and wall torch on the wrong side of the house.)
  return [
    origin[0] + localX * cosine + localZ * sine,
    origin[1] - localX * sine + localZ * cosine,
  ];
}

export function vikingHomeEntrance(home: VikingVillageHomePlan): VikingPlanPoint {
  return vikingPlanLocalPoint(home.position, home.yaw, 0, home.length / 2);
}

const homeEntrances = Object.fromEntries(
  vikingVillageHomes.map((home) => [home.id, vikingHomeEntrance(home)]),
) as Readonly<Record<string, VikingPlanPoint>>;

const homesById = Object.fromEntries(
  vikingVillageHomes.map((home) => [home.id, home]),
) as Readonly<Record<string, VikingVillageHomePlan>>;

// A connector that LEAVES a door: door -> just outside -> around the corner
// toward `toward`, so it never starts by cutting through the house.
function vikingDoorExit(
  homeId: string,
  toward: VikingPlanPoint,
): VikingPlanPoint[] {
  return [...vikingDoorPath(homesById[homeId], toward)].reverse();
}

// A short spur from the door out and around the nearest front corner, so a
// route reaches the actual door from `from` by hugging the house rather than
// cutting through it. Local +Z is the door wall.
export function vikingDoorPath(
  home: VikingVillageHomePlan,
  from: VikingPlanPoint,
): VikingPlanPoint[] {
  const normalX = Math.sin(home.yaw);
  const normalZ = Math.cos(home.yaw);
  const tangentX = Math.cos(home.yaw);
  const tangentZ = -Math.sin(home.yaw);
  const entrance = vikingHomeEntrance(home);
  const halfWidth = home.width / 2 + 1.2;
  const approach: VikingPlanPoint = [
    entrance[0] + normalX * 1.6,
    entrance[1] + normalZ * 1.6,
  ];
  const cornerLeft: VikingPlanPoint = [
    entrance[0] + normalX * 1.3 - tangentX * halfWidth,
    entrance[1] + normalZ * 1.3 - tangentZ * halfWidth,
  ];
  const cornerRight: VikingPlanPoint = [
    entrance[0] + normalX * 1.3 + tangentX * halfWidth,
    entrance[1] + normalZ * 1.3 + tangentZ * halfWidth,
  ];
  const useLeft =
    Math.hypot(from[0] - cornerLeft[0], from[1] - cornerLeft[1]) <
    Math.hypot(from[0] - cornerRight[0], from[1] - cornerRight[1]);
  return [useLeft ? cornerLeft : cornerRight, approach, entrance];
}

const homePlayLoops: readonly VikingTrafficRoute[] = vikingVillageHomes.map(
  (home): VikingTrafficRoute => {
    const outsideX = home.width / 2 + 1.3;
    const outsideZ = home.length / 2 + 1.3;
    const local = (x: number, z: number): VikingPlanPoint =>
      vikingPlanLocalPoint(home.position, home.yaw, x, z);
    // A clean rectangle traced OUTSIDE the walls (people walk right around a
    // lived-in house), entered and left at the door on the +Z side.
    return {
      id: `home-loop:${home.id}`,
      purpose: "Children, chores and firewood traffic around a lived-in house",
      points: [
        homeEntrances[home.id],
        local(1.4, outsideZ),
        local(outsideX, outsideZ),
        local(outsideX, -outsideZ),
        local(0, -outsideZ),
        local(-outsideX, -outsideZ),
        local(-outsideX, outsideZ),
        local(-1.4, outsideZ),
        homeEntrances[home.id],
      ],
      width: home.prefabId === "viking:house:long" ? 0.62 : 0.52,
      wear: home.prefabId === "viking:house:long" ? 0.38 : 0.33,
    };
  },
);

const WELL_CENTER: VikingPlanPoint = [-10, 13];
const WELL_EAST: VikingPlanPoint = [-6.2, 13.1];
const WELL_WEST: VikingPlanPoint = [-13.8, 13.2];
const WELL_SOUTH: VikingPlanPoint = [-9.5, 9.4];

/**
 * The village is worn by routines, not decoration. Routes describe repeated
 * trips between doors, shared facilities and work yards. The material system
 * bakes them once into a small mask texture, so adding this detail does not
 * add geometry or a long per-pixel chain of distance calculations.
 */
export const vikingTrafficRoutes: readonly VikingTrafficRoute[] = [
  {
    id: "gate-to-hall",
    purpose: "Main route from the north gate to the great hall",
    points: [[0, 82], [0, 48], [-1.8, 36], [0.8, 23], [2.1, 10], [0, -4.5], [7.5, -8.9]],
    width: 2.15,
    wear: 1,
  },
  {
    id: "north-family",
    purpose: "Family house to the north sledge and village spine",
    points: [[-0.8, 34], [-8, 34], homeEntrances["family-north"]],
    width: 1.1,
    wear: 0.78,
  },
  {
    id: "fish-rack",
    purpose: "North family yard to the fish drying rack",
    points: [[-8, 34], [-12, 39]],
    width: 0.82,
    wear: 0.52,
  },
  {
    id: "east-family",
    purpose: "East family house to the village spine",
    points: [[0.2, 27], [11.5, 28], ...vikingDoorPath(homesById["family-east"], [11.5, 28])],
    width: 1.08,
    wear: 0.76,
  },
  {
    id: "goat-pen",
    purpose: "East family yard to the animal pen",
    points: [[11.5, 28], [13, 20]],
    width: 0.88,
    wear: 0.58,
  },
  {
    id: "well",
    purpose: "Everyday water route from the village spine to the well",
    points: [[1.5, 14], [-1.8, 13.2], [-4.1, 14.4], WELL_EAST],
    width: 1.22,
    wear: 0.9,
  },
  {
    id: "well-ring",
    purpose: "People queue, pass and carry water around both sides of the well",
    points: [
      WELL_EAST,
      [-7.1, 16.1],
      [-10.4, 17.2],
      [-13.3, 15.8],
      WELL_WEST,
      [-13.1, 10.5],
      WELL_SOUTH,
      [-6.7, 10.6],
      WELL_EAST,
    ],
    width: 0.82,
    wear: 0.8,
  },
  {
    id: "well-south",
    purpose: "A second approach from the hall and communal hearth",
    points: [[-1.2, 2], [-4.2, 5.2], [-6.9, 7.1], WELL_SOUTH],
    width: 0.76,
    wear: 0.62,
  },
  {
    id: "weaver",
    purpose: "Well through the chopping yard to the weaver house",
    points: [WELL_WEST, [-17.2, 14.1], [-20.5, 12.4], homeEntrances.weaver],
    width: 1.05,
    wear: 0.78,
  },
  {
    id: "weaver-stores",
    purpose: "Weaver house to the laundry and firewood",
    points: [...vikingDoorExit("weaver", [-34, 12]), [-34, 12], [-38, 15], [-35, 0]],
    width: 0.72,
    wear: 0.44,
  },
  {
    id: "brewer",
    purpose: "Village spine to the brewer house",
    points: [[1.8, 10], [11.5, 9], homeEntrances.brewer],
    width: 1.08,
    wear: 0.8,
  },
  {
    id: "brewer-workyard",
    purpose: "Brewer house to chopping, drying and fuel yards",
    points: [...vikingDoorExit("brewer", [20, 10]), [20, 6], [21, 2], [22, 1], [27, -3], [33, 0], [43, 1]],
    width: 0.8,
    wear: 0.55,
  },
  {
    id: "armoury",
    purpose: "Brewer and east homes to the north armoury",
    points: [...vikingDoorExit("brewer", [31, 15]), [31, 15], [38, 16]],
    width: 0.94,
    wear: 0.63,
  },
  {
    id: "commons",
    purpose: "Main path to the communal hearth and barrel stores",
    points: [[0.2, -0.5], [-7, 0], [-11.5, -1.5], [-16.6, 4.6]],
    width: 1.14,
    wear: 0.84,
  },
  {
    id: "hall-kitchen",
    purpose: "Great hall entrance to the kitchen garden",
    points: [[7.5, -8.9], [11.5, -12], [15, -17]],
    width: 0.92,
    wear: 0.66,
  },
  {
    id: "south-junction",
    purpose: "Great hall to the southern household junction",
    points: [[7.5, -8.9], [12.5, -19], [5, -30]],
    width: 1.28,
    wear: 0.86,
  },
  {
    id: "fisher",
    purpose: "Southern junction to the fisher house",
    points: [[5, -30], [-10, -27], [-20, -26], homeEntrances.fisher],
    width: 1.05,
    wear: 0.7,
  },
  {
    id: "fisher-workyard",
    purpose: "Fisher house to firewood and the south chopping yard",
    points: [...vikingDoorExit("fisher", [-38, -33]), [-38, -33], [-29, -38], [-23, -37]],
    width: 0.78,
    wear: 0.52,
  },
  {
    id: "elder",
    purpose: "South chopping yard to the elder house and fuel store",
    points: [[-23, -37], [-20, -47], [-15, -54], ...vikingDoorPath(homesById.elder, [-15, -54])],
    width: 0.86,
    wear: 0.58,
  },
  {
    id: "smith",
    purpose: "Southern junction through the sledge yard to the smith house",
    points: [[12.5, -19], [21, -20], [29, -20], homeEntrances.smith],
    width: 1.08,
    wear: 0.8,
  },
  {
    id: "smith-store",
    purpose: "Smith house and sledge to the covered weapon store",
    points: [...vikingDoorExit("smith", [33, -23]), [33, -23], [29, -20], [40, -14]],
    width: 0.88,
    wear: 0.68,
  },
  {
    id: "smith-firewood",
    purpose: "Smith house to the southern fuel stack",
    points: [...vikingDoorExit("smith", [32, -40]), [32, -40], [34, -49]],
    width: 0.72,
    wear: 0.48,
  },
  ...homePlayLoops,
] as const;

export const vikingTrafficAreas: readonly VikingTrafficArea[] = [
  ...vikingVillageHomes.flatMap((home): VikingTrafficArea[] => [
    {
      id: `${home.id}-yard`,
      purpose: "Light wear around a lived-in house",
      center: home.position,
      radius: home.prefabId === "viking:house:long" ? [7.2, 5.1] : [5.8, 4.4],
      wear: 0.2,
      rotation: home.yaw,
    },
    {
      id: `${home.id}-threshold`,
      purpose: "Heavy wear at the house threshold",
      center: vikingHomeEntrance(home),
      radius: [3.1, 2.45],
      wear: 0.73,
      rotation: home.yaw,
    },
  ]),
  { id: "great-hall-yard", purpose: "Communal traffic around the great hall", center: [0, -17], radius: [10.8, 8.8], wear: 0.3 },
  { id: "great-hall-threshold", purpose: "Crowded great hall side entrance", center: [7.5, -8.9], radius: [3.8, 3.2], wear: 0.9 },
  { id: "well", purpose: "Water collection around the well", center: WELL_CENTER, radius: [4.6, 4.25], wear: 0.54 },
  { id: "commons", purpose: "Communal hearth and benches", center: [-11.5, -1.5], radius: [5.2, 4.5], wear: 0.73 },
  { id: "north-armoury", purpose: "Weapon store work yard", center: [38, 16], radius: [4.8, 4], wear: 0.58 },
  { id: "smith-store", purpose: "Smithing and weapon store work yard", center: [40, -14], radius: [5.2, 4.1], wear: 0.66 },
  { id: "goat-pen", purpose: "Churned ground at the goat pen", center: [13, 20], radius: [6.4, 5.3], wear: 0.6 },
  { id: "weaver-chopping", purpose: "Wood chopping yard", center: [-21, 13], radius: [3.5, 3], wear: 0.58 },
  { id: "brewer-chopping", purpose: "Wood chopping yard", center: [22, 1], radius: [3.5, 3], wear: 0.58 },
  { id: "south-chopping", purpose: "Wood chopping yard", center: [-23, -37], radius: [3.8, 3.2], wear: 0.6 },
  { id: "north-sledge", purpose: "Sledge loading ground", center: [-8, 34], radius: [3.8, 3], wear: 0.52 },
  { id: "smith-sledge", purpose: "Smithy sledge loading ground", center: [29, -20], radius: [4.2, 3.2], wear: 0.62 },
  { id: "kitchen-garden", purpose: "Worked soil around the kitchen garden", center: [15, -17], radius: [5, 4.2], wear: 0.45 },
] as const;
