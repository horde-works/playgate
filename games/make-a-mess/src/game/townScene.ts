import {
  createDestructionScene,
  openHouseSceneOptions,
} from "./destructionScene.ts";
import { compileSceneGroups } from "../content/scenes/compileScene.ts";
import { cityPrefabLibrary } from "../content/prefabs/cityPrefabs.ts";
import { openHouseInfillDocument } from "../content/scenes/openHouseInfillDocument.ts";
import {
  skyMooringDocument,
  skyMooringSpotLights,
} from "../content/scenes/skyMooringDocument.ts";
// Вертипад HX-6 переехал на полигон Tonkawa целиком (фишка №1, вердикт
// Igor 07.08.2026) — см. rangeVertipadDocument.ts. Город остаётся без
// собственного вертипада; кластер town-vertipad:hexacopter живёт теперь
// ровно в одной сцене — combatHexacopterRangeScene.
import {
  townBoulevardDocument,
  townBoulevardSpotLights,
} from "../content/scenes/townBoulevardDocument.ts";
import { sr6SkatPrototypeDocument } from "../content/scenes/sr6SkatPrototypeDocument.ts";

// ---------------------------------------------------------------------------
// Боевая городская сцена: базовый город (destructionScene) плюс старый
// квартал и причал неба на западной опушке, скомпилированные из городских
// префабов. Сборка живёт в отдельном модуле, потому что cityPrefabs сам
// зависит от destructionScene — доливать компилированные кластеры внутри
// него значило бы замкнуть импортный цикл.
// ---------------------------------------------------------------------------

export const oldQuarterCompilation = compileSceneGroups(
  openHouseInfillDocument,
  cityPrefabLibrary,
);

export const skyMooringCompilation = compileSceneGroups(
  skyMooringDocument,
  cityPrefabLibrary,
);

export const boulevardCompilation = compileSceneGroups(
  townBoulevardDocument,
  cityPrefabLibrary,
);

export const sr6SkatCompilation = compileSceneGroups(
  sr6SkatPrototypeDocument,
  cityPrefabLibrary,
);

export const townScene = createDestructionScene({
  ...openHouseSceneOptions,
  clusters: [
    ...openHouseSceneOptions.clusters,
    ...oldQuarterCompilation.clusters,
    ...skyMooringCompilation.clusters,
    ...boulevardCompilation.clusters,
    ...sr6SkatCompilation.clusters,
  ],
  lamps: [
    ...openHouseSceneOptions.lamps,
    ...oldQuarterCompilation.lamps,
    ...skyMooringCompilation.lamps,
    ...boulevardCompilation.lamps,
    ...sr6SkatCompilation.lamps,
  ],
  spotLights: [
    ...skyMooringSpotLights,
    ...townBoulevardSpotLights,
  ],
});
