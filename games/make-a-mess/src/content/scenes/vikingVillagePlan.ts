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

/**
 * Обстановка дома в ЕГО координатах: +Z — дверь, −Z — задний фронтон.
 *
 * Это единственный источник правды и для расстановки мебели, и для троп
 * внутри жилья. Раньше тропа внутрь шла по осевой линии «на глаз» — и
 * упиралась в КОНЬКОВЫЙ СТОЛБ, который стоит ровно на оси при z = ±0.34·длины.
 * Отсюда правило: внутренние тропы кладутся от координат мебели и столбов, а
 * не от середины комнаты.
 */
export interface VikingHomeLayout {
  /** Половина внутреннего пролёта до стен и до заднего фронтона. */
  readonly sideInner: number;
  readonly backInner: number;
  /** Ось спальной лавки и сундука. */
  readonly leftWallX: number;
  readonly rightWallX: number;
  /** Коньковые столбы: на оси, мешают идти прямо от двери. */
  readonly postZ: number;
  readonly bed: VikingPlanPoint;
  readonly bedSecond: VikingPlanPoint;
  readonly chest: VikingPlanPoint;
  readonly cupboard: VikingPlanPoint;
  readonly cauldron: VikingPlanPoint;
  readonly stools: readonly VikingPlanPoint[];
  /** Ремесленное место (станок, наковальня, бочки) и где перед ним стоят. */
  readonly work: VikingPlanPoint | null;
  readonly workStand: VikingPlanPoint | null;
}

// Ремесло стоит у правой стены, но каждое занимает своё место — стоянку перед
// ним считаем от РЕАЛЬНОГО предмета, иначе житель встаёт в бочку.
const HOME_WORK: Readonly<Record<string, { at: VikingPlanPoint; stand: VikingPlanPoint }>> = {
  weaver: { at: [-0.05, -1.3], stand: [2.0, -1.3] },
  // У пивовара третья бочка выдвинута в комнату (x = правая стена − 1.05),
  // поэтому к бочкам подходят с дверной стороны, а не сквозь них.
  brewer: { at: [0, -1.05], stand: [1.9, 0.5] },
  smith: { at: [-0.15, -0.2], stand: [2.0, -0.2] },
  fisher: { at: [-0.1, -1.3], stand: [1.95, -1.35] },
};

export function vikingHomeLayout(home: VikingVillageHomePlan): VikingHomeLayout {
  const sideInner = home.width / 2 - 0.32;
  const backInner = home.length / 2 - 0.32;
  const leftWallX = -(sideInner - 0.6);
  const rightWallX = sideInner - 0.6;
  const work = HOME_WORK[home.id];
  return {
    sideInner,
    backInner,
    leftWallX,
    rightWallX,
    postZ: home.length * 0.34,
    bed: [leftWallX, -(backInner - 1.2)],
    bedSecond: [rightWallX, -(backInner - 1.2)],
    chest: [leftWallX + 0.05, -(backInner - 3.3)],
    cupboard: [1.15, -(backInner - 0.28)],
    cauldron: [0.4, -0.9],
    // Табуреты придвинуты к котлу с дверной стороны: раньше они стояли в
    // полутора метрах от огня и ровно поперёк хода от очага к поставцу.
    stools: [[-0.6, -0.15], [1.35, -0.35]],
    work: work ? [rightWallX + work.at[0], work.at[1]] : null,
    workStand: work ? work.stand : null,
  };
}

/**
 * Внутрь домов — через дверь мимо конькового столба к очагу, и дальше к
 * лавке, поставцу и ремеслу. Под полом маску износа не видно, зато у графа
 * появляются настоящие места ВНУТРИ жилья: дом становится целью, а не
 * коробкой, у порога которой топчутся.
 */
const homeInteriors: readonly VikingTrafficRoute[] = vikingVillageHomes.flatMap(
  (home): VikingTrafficRoute[] => {
    const layout = vikingHomeLayout(home);
    const local = (x: number, z: number): VikingPlanPoint =>
      vikingPlanLocalPoint(home.position, home.yaw, x, z);
    const doorZ = home.length / 2;
    // Западная полоса вдоль стены: коньковый столб обходится слева, сундук и
    // спальная лавка остаются справа от идущего, у огня — стоянка с запада.
    const lane: VikingPlanPoint = local(-1.5, -0.55);
    const fireStand: VikingPlanPoint = local(-0.78, layout.cauldron[1]);
    const routes: VikingTrafficRoute[] = [
      {
        id: `home-inside:${home.id}`,
        purpose: "Through the door past the ridge post to the cooking hearth",
        points: [
          homeEntrances[home.id],
          local(-0.7, doorZ - 0.9),
          local(-1.6, layout.postZ),
          local(-1.95, layout.postZ - 1.6),
          lane,
          fireStand,
        ],
        width: 0.72,
        wear: 0.4,
      },
      {
        id: `home-bed:${home.id}`,
        purpose: "From the hearth lane to the sleeping bench",
        points: [
          lane,
          local(-1.85, -2.2),
          local(layout.bed[0] + 1.05, layout.bed[1] + 0.25),
        ],
        width: 0.58,
        wear: 0.3,
      },
      {
        id: `home-store:${home.id}`,
        purpose: "From the hearth to the cupboard at the back gable",
        points: [
          lane,
          local(0.5, -2.6),
          local(layout.cupboard[0], layout.cupboard[1] + 0.95),
        ],
        width: 0.55,
        wear: 0.26,
      },
    ];
    if (layout.workStand) {
      // Ремесло стоит у правой стены — к нему идут сразу от порога по восточной
      // стороне, не толкаясь у котла и табуретов.
      routes.push({
        id: `home-work:${home.id}`,
        purpose: "From the threshold along the east side to the craft place",
        points: [
          homeEntrances[home.id],
          local(0.9, doorZ - 0.8),
          local(2.0, layout.postZ - 0.6),
          local(layout.workStand[0], layout.workStand[1]),
        ],
        width: 0.58,
        wear: 0.34,
      });
    }
    return routes;
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
  // --- Внутри зала: у жителей должно быть куда войти ---------------------
  //
  // Тропы здесь положены ПО КООРДИНАТАМ обстановки, а не на глаз. Что мерялось:
  //   коньковые столбы на оси при z = −7.14 и −26.86 (Ø 0.55) — прямой ход от
  //     ворот к престолам через середину невозможен, полосы идут в обход;
  //   столы (|x| ∈ 2.34…3.96) рядами z ∈ [−12.4,−8.6], [−18.4,−14.6],
  //     [−24.4,−20.6] — поперечные ходы ложатся строго в разрывы z ≈ −13.5
  //     и −19.5, где по обе стороны 1.1 м чистого пола;
  //   наружные лавки (|x| ∈ 4.375…4.925) и внутренняя грань стены (|x| = 7.21)
  //     оставляют боковой проход шириной 2.3 м — ось по |x| = 6.0;
  //   очаг (0, −16.5) с камнями до 1.11 м: у огня полосы идут по |x| = 1.72,
  //     ради чего внутренние лавки очажного ряда сняты — у длинного огня
  //     положено ходить, а не протискиваться.
  {
    id: "hall-nave-west",
    purpose: "Gate to the high seats along the west side of the long fire",
    points: [
      [0, -3.4], [-0.9, -5.8], [-1.0, -9.6], [-1.3, -13.5], [-1.72, -16.5],
      [-1.1, -19.6], [-0.85, -22.5], [-1.0, -25.4], [-1.95, -26.9],
    ],
    width: 0.72,
    wear: 0.5,
  },
  {
    id: "hall-nave-east",
    purpose: "Gate to the high seats along the east side of the long fire",
    points: [
      [0, -3.4], [0.9, -5.8], [1.0, -9.6], [1.3, -13.5], [1.72, -16.5],
      [1.1, -19.6], [0.85, -22.5], [1.0, -25.4], [1.95, -26.9],
    ],
    width: 0.72,
    wear: 0.5,
  },
  {
    id: "hall-front-bay",
    purpose: "Inside the gate, spreading to both side aisles",
    points: [[-6.0, -5.6], [-2.5, -4.5], [0, -3.4], [2.5, -4.5], [6.0, -5.6]],
    width: 0.9,
    wear: 0.44,
  },
  {
    id: "hall-aisle-west",
    purpose: "West aisle between the outer benches and the wall",
    points: [
      [-6.0, -5.6], [-6.0, -9.5], [-6.0, -13.5], [-6.0, -17.5], [-6.0, -21.5],
      [-6.0, -25.2], [-4.2, -26.8],
    ],
    width: 0.8,
    wear: 0.42,
  },
  {
    id: "hall-aisle-east",
    purpose: "East aisle from the side door down to the high seats",
    points: [
      [6.0, -5.6], [6.0, -8.9], [6.0, -13.5], [6.0, -17.5], [6.0, -21.5],
      [6.0, -25.2], [4.2, -26.8],
    ],
    width: 0.8,
    wear: 0.42,
  },
  {
    id: "hall-side-door",
    purpose: "Side door of the hall into the east aisle",
    points: [[7.5, -8.9], [6.0, -8.9]],
    width: 0.85,
    wear: 0.6,
  },
  {
    id: "hall-cross-front",
    purpose: "Across the hall in the gap between the first and second table rows",
    points: [[-6.0, -13.5], [-3.0, -13.45], [0, -13.4], [3.0, -13.45], [6.0, -13.5]],
    width: 0.66,
    wear: 0.34,
  },
  {
    id: "hall-cross-rear",
    purpose: "Across the hall in the gap before the high-seat tables",
    points: [[-6.0, -19.6], [-3.0, -19.55], [0, -19.5], [3.0, -19.55], [6.0, -19.6]],
    width: 0.66,
    wear: 0.34,
  },
  {
    id: "elder-to-south-gate",
    purpose: "From the elder's end of the village out through the south gate",
    points: [[-20, -47], [-14.5, -53.5], [-9.5, -58.5], [-4.5, -63], [-0.6, -66.2]],
    width: 1.15,
    wear: 0.5,
  },
  {
    id: "gate-to-jetty",
    purpose: "South gate down the cape to the fog jetty",
    points: [[-1.2, -91], [-0.4, -84.5], [0.6, -78], [-0.6, -72.5], [0, -66.5]],
    width: 1.45,
    wear: 0.66,
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
    points: [[-8, 34], [-12.7, 37.3]],
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
    // Кончается ПЕРЕД жердями загона: раньше конец тропы был внутри ограды.
    points: [[11.5, 28], [12.6, 24.8]],
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
    points: [...vikingDoorExit("brewer", [20, 10]), [20, 6], [21, 2], [22, 1], [27, -3], [33, 0], [41.9, 2.5]],
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
    purpose: "Past the communal hearth to the barrel stores",
    // Конец тропы стоял ровно в середине решётки из шести бочек — житель
    // приходил туда и запирался между ними. Теперь подходит сбоку от штабеля.
    // Тропа шла ЧЕРЕЗ ОЧАГ: точка [-11.5,-1.5] — это его центр. Житель идёт
    // на неё, веер отводит его от камней, он заходит снова — и наматывает
    // круги вокруг огня. Коридор обведён севернее кольца лавок, а к самому
    // огню ведёт короткий отвод на стоянку между лавками.
    points: [[0.2, -0.5], [-7, 0], [-8.6, 2.6], [-12.4, 3.4], [-15.0, 2.4]],
    width: 1.14,
    wear: 0.84,
  },
  {
    id: "commons-fire",
    purpose: "Off the commons track to the standing place at the fire",
    points: [[-8.6, 2.6], [-9.6, 0.2]],
    width: 0.7,
    wear: 0.55,
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
    // Перекрёсток был в точке (5, −30) — ВНУТРИ большого зала (он занимает
    // x ∈ [−7.5, 7.5], z ∈ [−31.5, −2.5]). Тропы отсюда шли сквозь бревенчатую
    // стену, и жители честно упирались в неё носом. Узел вынесен за восточную
    // стену, а дальний конец зала обходится с юга.
    points: [[7.5, -8.9], [12.5, -19], [11, -28]],
    width: 1.28,
    wear: 0.86,
  },
  {
    id: "fisher",
    purpose: "Southern junction around the hall gable to the fisher house",
    points: [[11, -28], [7, -34], [-2, -35.2], [-12, -31], [-20, -26], homeEntrances.fisher],
    width: 1.05,
    wear: 0.7,
  },
  {
    id: "fisher-workyard",
    purpose: "Fisher house to firewood and the south chopping yard",
    points: [...vikingDoorExit("fisher", [-38, -33]), [-38, -33], [-29, -38], [-22.1, -38.5]],
    width: 0.78,
    wear: 0.52,
  },
  {
    id: "elder",
    purpose: "South chopping yard to the elder house and fuel store",
    points: [[-22.1, -38.5], [-20, -47], [-15, -54], ...vikingDoorPath(homesById.elder, [-15, -54])],
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
    // Конец был внутри поленницы (x 31…36, z ≈ −49) — тупик без обхода.
    points: [...vikingDoorExit("smith", [32, -40]), [32, -40], [33, -46.4]],
    width: 0.72,
    wear: 0.48,
  },
  {
    id: "new-house",
    purpose: "The commons to the new longhouse under construction",
    points: [[-15.0, 2.4], [-21.5, -3.5], [-26.5, -10.2]],
    width: 0.9,
    wear: 0.5,
  },
  {
    id: "hide-rack-west",
    purpose: "Building site and weaver stores out to the far hide racks",
    points: [[-26.5, -10.2], [-29.5, -14.2], [-35, -15], [-40.7, -13.4]],
    width: 0.7,
    wear: 0.38,
  },
  {
    id: "commons-drying",
    purpose: "Village spine to the communal drying frames",
    points: [[1.8, 10], [8, 7], [13, 4.4], [14.1, 4.4]],
    width: 0.74,
    wear: 0.46,
  },
  {
    id: "brewer-laundry",
    purpose: "Armoury track out to the brewer laundry line",
    points: [[31, 15], [32.5, 17], [33, 18]],
    width: 0.62,
    wear: 0.34,
  },
  ...homePlayLoops,
  ...homeInteriors,
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
  ...vikingVillageHomes.map((home) => ({
    id: `${home.id}-inside`,
    purpose: "Hearth room inside the house",
    // Центр — на СТОЯНКЕ у котла, а не в геометрической середине комнаты:
    // иначе площадка не накрывает ни одного узла и дом остаётся без цели.
    center: vikingPlanLocalPoint(home.position, home.yaw, -0.78, vikingHomeLayout(home).cauldron[1]),
    radius: [1.6, 1.6] as VikingPlanPoint,
    wear: 0.18,
  })),
  // Площадки зала стоят на СВОБОДНОМ полу: центр очага (0,−16.5) и коньковый
  // столб (0,−26.86) — это камень и бревно, туда встать нельзя.
  { id: "hall-fire", purpose: "Open floor at the head of the long fire", center: [0, -13.7], radius: [1.7, 0.85], wear: 0.28 },
  { id: "hall-high-seats", purpose: "Floor before the high seats", center: [0, -26.9], radius: [2.6, 1.2], wear: 0.22 },
  { id: "hall-benches-west", purpose: "West bench aisle of the hall", center: [-6.0, -18.0], radius: [0.9, 3.4], wear: 0.2 },
  { id: "hall-benches-east", purpose: "East bench aisle of the hall", center: [6.0, -18.0], radius: [0.9, 3.4], wear: 0.2 },
  { id: "great-hall-yard", purpose: "Communal traffic around the great hall", center: [0, -17], radius: [10.8, 8.8], wear: 0.3 },
  { id: "great-hall-threshold", purpose: "Crowded great hall side entrance", center: [7.5, -8.9], radius: [3.8, 3.2], wear: 0.9 },
  { id: "well", purpose: "Water collection around the well", center: WELL_CENTER, radius: [4.6, 4.25], wear: 0.54 },
  { id: "commons", purpose: "Communal hearth and benches", center: [-11.5, -1.5], radius: [5.2, 4.5], wear: 0.73 },
  { id: "north-armoury", purpose: "Weapon store work yard", center: [38, 16], radius: [4.8, 4], wear: 0.58 },
  { id: "smith-store", purpose: "Smithing and weapon store work yard", center: [40, -14], radius: [5.2, 4.1], wear: 0.66 },
  { id: "goat-pen", purpose: "Churned ground at the goat pen", center: [13, 20], radius: [6.4, 5.3], wear: 0.6 },
  { id: "weaver-chopping", purpose: "Wood chopping yard", center: [-21, 13], radius: [3.5, 3], wear: 0.58 },
  { id: "brewer-chopping", purpose: "Wood chopping yard", center: [22, 1], radius: [3.5, 3], wear: 0.58 },
  { id: "south-chopping", purpose: "Wood chopping yard", center: [-22.4, -38.2], radius: [3.8, 3.2], wear: 0.6 },
  { id: "north-sledge", purpose: "Sledge loading ground", center: [-8, 34], radius: [3.8, 3], wear: 0.52 },
  { id: "smith-sledge", purpose: "Smithy sledge loading ground", center: [29, -20], radius: [4.2, 3.2], wear: 0.62 },
  { id: "kitchen-garden", purpose: "Worked soil around the kitchen garden", center: [15, -17], radius: [5, 4.2], wear: 0.45 },
  // Места, у которых давно была тропа, но не было НАЗНАЧЕНИЯ: без площадки
  // узел безымянный, а безымянный узел никому не цель — полкарты стояло
  // построенным и незаселённым.
  { id: "north-gate", purpose: "Watch and traffic at the north gate", center: [0, 46], radius: [4.2, 3.4], wear: 0.5 },
  { id: "south-gate", purpose: "Watch and traffic at the south gate", center: [-0.6, -65], radius: [4, 3.4], wear: 0.42 },
  { id: "fog-jetty", purpose: "The jetty out in the fog", center: [-1.2, -88], radius: [5, 5], wear: 0.36 },
  { id: "new-house", purpose: "The longhouse going up: timber, pegs and argument", center: [-26.5, -10.2], radius: [4.6, 4], wear: 0.44 },
  { id: "fish-rack", purpose: "Fish drying frames", center: [-12.6, 37.5], radius: [3.4, 3], wear: 0.4 },
  { id: "hide-rack-west", purpose: "Far hide racks west of the village", center: [-40.8, -13.3], radius: [3.6, 3.2], wear: 0.34 },
  { id: "hide-rack-east", purpose: "Hide racks by the brewer fuel yard", center: [42, 2.4], radius: [3.4, 3], wear: 0.34 },
  { id: "commons-drying", purpose: "Communal drying frames on the spine", center: [14.2, 4.4], radius: [3.4, 3], wear: 0.42 },
  { id: "laundry-weaver", purpose: "Washing line by the weaver", center: [-38, 15], radius: [3.4, 3], wear: 0.38 },
  { id: "laundry-brewer", purpose: "Washing line by the brewer", center: [33, 18], radius: [3.2, 2.8], wear: 0.36 },
  { id: "weaver-wood", purpose: "West firewood stack", center: [-35, 0], radius: [3, 2.8], wear: 0.36 },
  { id: "brewer-wood", purpose: "East firewood stack", center: [33, 0], radius: [3, 2.8], wear: 0.36 },
  { id: "fisher-wood", purpose: "Firewood by the fisher", center: [-39, -34], radius: [3, 2.8], wear: 0.34 },
  { id: "elder-wood", purpose: "Firewood by the elder", center: [-20, -54], radius: [3, 2.8], wear: 0.32 },
  { id: "smith-firewood", purpose: "Southern fuel stack", center: [33, -46.4], radius: [3.4, 3], wear: 0.34 },
] as const;

/**
 * ПРИТЯЖЕНИЕ МЕСТ — отдельный смысловой слой поверх геометрии.
 *
 * Пока у жителя нет собственных целей, он тянется туда, куда ведёт форма
 * графа: чем больше троп сходится, тем чаще он там оказывается. Так большой
 * зал стал центром деревни просто потому, что стоит посередине, а стоило
 * добавить тропы внутрь домов — семь изб перевесили и кузню, и колодец.
 *
 * Поэтому вес места объявляется ЯВНО и живёт отдельно от карты. Он
 * необязателен: место без записи получает малый вес по умолчанию, а если до
 * цели не дойти — житель просто выберет другую. Здесь же указано, кого место
 * зовёт сильнее прочих и в какую пору дня оно живо.
 */
export type VikingDayPart = "any" | "day" | "evening";

export interface VikingPlaceInterest {
  /** Идентификатор площадки из vikingTrafficAreas. */
  readonly areaId: string;
  /** Насколько место зовёт само по себе, независимо от числа троп. */
  readonly pull: number;
  /** Кого зовёт вдвойне: ремесло тянет к своему делу. */
  readonly roles?: readonly string[];
  /** Когда место живо. Вечером греются у огня, днём работают. */
  readonly when?: VikingDayPart;
  /** Что там делают. Нужно, чтобы житель у лавки садился, а не стоял столбом. */
  readonly doing?: "stand" | "sit" | "work";
}

export const vikingPlaceInterest: readonly VikingPlaceInterest[] = [
  { areaId: "well", pull: 3.4, roles: ["women"], doing: "work" },
  { areaId: "commons", pull: 1.9, doing: "sit" },
  { areaId: "great-hall-threshold", pull: 1.4 },
  // Эллипс двора зала накрывает и его ВНУТРЕННОСТЬ: полтора десятка узлов
  // внутри получали по 0.5 каждый и вместе перевешивали колодец. Двор — фон.
  { areaId: "great-hall-yard", pull: 0.1 },
  { areaId: "north-gate", pull: 2.4 },
  { areaId: "south-gate", pull: 1.5 },
  { areaId: "fog-jetty", pull: 1.6, roles: ["fisher"], when: "day" },
  { areaId: "new-house", pull: 2.8, roles: ["smith", "weaver", "elder"], when: "day", doing: "work" },
  { areaId: "fish-rack", pull: 2.4, roles: ["fisher", "women"], when: "day", doing: "work" },
  { areaId: "hide-rack-west", pull: 2.0, roles: ["weaver", "fisher"], when: "day", doing: "work" },
  { areaId: "hide-rack-east", pull: 2.0, roles: ["brewer", "smith"], when: "day", doing: "work" },
  { areaId: "commons-drying", pull: 2.4, roles: ["women"], when: "day", doing: "work" },
  { areaId: "laundry-weaver", pull: 2.2, roles: ["women"], when: "day", doing: "work" },
  { areaId: "laundry-brewer", pull: 2.2, roles: ["women"], when: "day", doing: "work" },
  { areaId: "weaver-wood", pull: 1.8, roles: ["weaver", "elder"], when: "day", doing: "work" },
  { areaId: "brewer-wood", pull: 1.8, roles: ["brewer"], when: "day", doing: "work" },
  { areaId: "fisher-wood", pull: 1.8, roles: ["fisher"], when: "day", doing: "work" },
  { areaId: "elder-wood", pull: 1.8, roles: ["elder"], when: "day", doing: "work" },
  { areaId: "smith-firewood", pull: 1.8, roles: ["smith"], when: "day", doing: "work" },
  { areaId: "hall-fire", pull: 2.4, when: "evening" },
  { areaId: "hall-benches-west", pull: 1.8, when: "evening", doing: "sit" },
  { areaId: "hall-benches-east", pull: 1.8, when: "evening", doing: "sit" },
  { areaId: "hall-high-seats", pull: 1.1, roles: ["elder"], when: "evening" },
  { areaId: "smith-store", pull: 3.2, roles: ["smith", "men"], when: "day", doing: "work" },
  { areaId: "smith-sledge", pull: 2.1, roles: ["smith"], when: "day", doing: "work" },
  { areaId: "weaver-chopping", pull: 3.2, roles: ["weaver"], when: "day", doing: "work" },
  { areaId: "brewer-chopping", pull: 3.2, roles: ["brewer"], when: "day", doing: "work" },
  { areaId: "south-chopping", pull: 2.4, roles: ["fisher", "elder"], when: "day", doing: "work" },
  { areaId: "north-armoury", pull: 2.2, roles: ["brewer", "smith", "men"], when: "day", doing: "work" },
  { areaId: "goat-pen", pull: 3.0, roles: ["herder", "women"], when: "day", doing: "work" },
  { areaId: "kitchen-garden", pull: 3.0, roles: ["gardener", "women"], when: "day", doing: "work" },
  { areaId: "north-sledge", pull: 2.0, roles: ["fisher", "herder"], when: "day", doing: "work" },
  { areaId: "smith-yard", pull: 0.12 },
  ...vikingVillageHomes.flatMap((home): VikingPlaceInterest[] => [
    // Двор и порог собственного дома — фон, а не цель: без малого веса семь
    // дворов перетягивают на себя всю деревню.
    { areaId: `${home.id}-yard`, pull: 0.12 },
    { areaId: `${home.id}-threshold`, pull: 0.45 },
    // А вот внутрь дома тянет своего хозяина, и ближе к вечеру.
    { areaId: `${home.id}-inside`, pull: 1.7, roles: [`resident:${home.id}`, "women"], when: "evening", doing: "sit" },
  ]),
] as const;

export const vikingPlaceInterestById: Readonly<Record<string, VikingPlaceInterest>> =
  Object.fromEntries(vikingPlaceInterest.map((entry) => [entry.areaId, entry]));
