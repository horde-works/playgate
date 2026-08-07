import { compileSceneGroups } from "../content/scenes/compileScene.ts";
import { combatHexacopterRangeDocument } from "../content/scenes/combatHexacopterRangeDocument.ts";
import {
  rangeVertipadDocument,
  rangeVertipadSpotLights,
} from "../content/scenes/rangeVertipadDocument.ts";
import { cityPrefabLibrary } from "../content/prefabs/cityPrefabs.ts";
import { createDestructionScene } from "./destructionScene.ts";

// ---------------------------------------------------------------------------
// Полигон Tonkawa: плоский стальной мир RAX-8 плюс вертипад HX-6 (фишка №1 —
// перенос из города для наблюдения за исполнением траекторий без шума FPS и
// застройки). Сборка зеркалит townScene: документ полигона и переехавший
// вертипад компилируются раздельно и сливаются в одну сцену, поэтому
// кластеры и куски вертипада сохраняют городские идентификаторы.
// ---------------------------------------------------------------------------

export const combatHexacopterRangeCompilation = compileSceneGroups(
  combatHexacopterRangeDocument,
  new Map(),
);

export const rangeVertipadCompilation = compileSceneGroups(
  rangeVertipadDocument,
  cityPrefabLibrary,
);

const world = combatHexacopterRangeDocument.world;

export const combatHexacopterRangeScene = createDestructionScene({
  id: combatHexacopterRangeDocument.id,
  title: combatHexacopterRangeDocument.title,
  environment: combatHexacopterRangeDocument.environment,
  playerSpawn: world.playerSpawn,
  playerSpawnYaw: world.playerSpawnYaw,
  cameraFar: world.cameraFar,
  worldCenter: world.center,
  worldHalfExtents: world.halfExtents,
  boundaryRadius: world.boundaryRadius,
  skyRadius: world.skyRadius,
  worldRadius: world.radius,
  safetyFloorY: world.safetyFloorY,
  copy: combatHexacopterRangeDocument.copy,
  clusters: [
    ...combatHexacopterRangeCompilation.clusters,
    ...rangeVertipadCompilation.clusters,
  ],
  lamps: [
    ...combatHexacopterRangeCompilation.lamps,
    ...rangeVertipadCompilation.lamps,
  ],
  spotLights: rangeVertipadSpotLights,
  fogDistances: combatHexacopterRangeDocument.fogDistances,
});
