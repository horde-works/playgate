/**
 * One authored chart shared by every island scene.
 *
 * Scene space uses +x for east and +z for north. Navigation positions are
 * deliberately much larger than any playable island: they establish bearings
 * and route relationships, not a second continuous physics world.
 */
export type IslandId =
  | "astana"
  | "basalt-stronghold"
  | "grand-terminal"
  | "town"
  | "viking-village";

export interface NavigationPosition {
  readonly east: number;
  readonly north: number;
}

export interface IslandChartEntry {
  readonly id: IslandId;
  readonly sceneId: string;
  readonly path: string;
  readonly position: NavigationPosition;
}

export type InterIslandArrivalMessage = "enteringAirspace" | "welcome";
export type InterIslandArrivalCopyKey =
  `interIsland.${InterIslandArrivalMessage}.${IslandId}`;

/**
 * Arrival presentation depends only on the destination, never on a bespoke
 * origin/destination pair. Each language still owns the complete phrase so
 * articles and grammatical cases remain correct.
 */
export function interIslandArrivalCopyKey(
  destination: IslandId,
  message: InterIslandArrivalMessage,
): InterIslandArrivalCopyKey {
  return `interIsland.${message}.${destination}`;
}

export const ISLAND_CHART: Readonly<Record<IslandId, IslandChartEntry>> = {
  astana: {
    id: "astana",
    sceneId: "astana",
    path: "/games/make-a-mess/astana",
    position: { east: 0, north: 0 },
  },
  "viking-village": {
    id: "viking-village",
    sceneId: "viking-village",
    path: "/games/make-a-mess/viking-village",
    position: { east: -900, north: 900 },
  },
  town: {
    id: "town",
    sceneId: "open-house",
    path: "/games/make-a-mess",
    position: { east: -900, north: -900 },
  },
  "grand-terminal": {
    id: "grand-terminal",
    sceneId: "grand-terminal",
    path: "/games/make-a-mess/grand-terminal",
    position: { east: 900, north: -900 },
  },
  "basalt-stronghold": {
    id: "basalt-stronghold",
    sceneId: "basalt-stronghold",
    path: "/games/make-a-mess/basalt-stronghold",
    position: { east: 900, north: 900 },
  },
};

export type IslandServiceStatus = "available" | "planned";

export interface IslandConnection {
  readonly id: string;
  readonly islands: readonly [IslandId, IslandId];
  readonly status: IslandServiceStatus;
}

/**
 * The chart is complete, while service opens route by route. Astana owns the
 * four family spokes; Town <-> Viking Village is the first direct transfer.
 */
export const ISLAND_CONNECTIONS: readonly IslandConnection[] = [
  {
    id: "town-viking-village",
    islands: ["town", "viking-village"],
    status: "available",
  },
  {
    id: "astana-viking-village",
    islands: ["astana", "viking-village"],
    status: "planned",
  },
  {
    id: "astana-town",
    islands: ["astana", "town"],
    status: "planned",
  },
  {
    id: "astana-grand-terminal",
    islands: ["astana", "grand-terminal"],
    status: "planned",
  },
  {
    id: "astana-basalt-stronghold",
    islands: ["astana", "basalt-stronghold"],
    status: "planned",
  },
];

function navigationDelta(
  origin: IslandId,
  destination: IslandId,
): NavigationPosition {
  const from = ISLAND_CHART[origin].position;
  const to = ISLAND_CHART[destination].position;
  return {
    east: to.east - from.east,
    north: to.north - from.north,
  };
}

/** Compass bearing in degrees, clockwise from north. */
export function islandBearing(
  origin: IslandId,
  destination: IslandId,
): number {
  const delta = navigationDelta(origin, destination);
  if (delta.east === 0 && delta.north === 0) {
    throw new Error(`Cannot navigate from ${origin} to itself`);
  }
  const degrees = Math.atan2(delta.east, delta.north) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

/** Unit heading in scene axes: +x east, +z north. */
export function islandHeading(
  origin: IslandId,
  destination: IslandId,
): readonly [number, 0, number] {
  const delta = navigationDelta(origin, destination);
  const length = Math.hypot(delta.east, delta.north);
  if (length === 0) {
    throw new Error(`Cannot navigate from ${origin} to itself`);
  }
  return [delta.east / length, 0, delta.north / length];
}

export function islandDistance(
  origin: IslandId,
  destination: IslandId,
): number {
  const delta = navigationDelta(origin, destination);
  return Math.hypot(delta.east, delta.north);
}

export function islandDestinations(
  origin: IslandId,
  includePlanned = false,
): readonly IslandId[] {
  return ISLAND_CONNECTIONS
    .filter((connection) =>
      (includePlanned || connection.status === "available") &&
      connection.islands.includes(origin)
    )
    .map((connection) =>
      connection.islands[0] === origin
        ? connection.islands[1]
        : connection.islands[0]
    );
}

export function islandIdForScene(sceneId: string): IslandId | null {
  return Object.values(ISLAND_CHART).find(
    (island) => island.sceneId === sceneId,
  )?.id ?? null;
}
