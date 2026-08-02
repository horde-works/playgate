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
import {
  townVertipadDocument,
  townVertipadSpotLights,
} from "../content/scenes/townVertipadDocument.ts";
import {
  townBoulevardDocument,
  townBoulevardSpotLights,
} from "../content/scenes/townBoulevardDocument.ts";

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

export const vertipadCompilation = compileSceneGroups(
  townVertipadDocument,
  cityPrefabLibrary,
);

export const boulevardCompilation = compileSceneGroups(
  townBoulevardDocument,
  cityPrefabLibrary,
);

export const townScene = createDestructionScene({
  ...openHouseSceneOptions,
  clusters: [
    ...openHouseSceneOptions.clusters,
    ...oldQuarterCompilation.clusters,
    ...skyMooringCompilation.clusters,
    ...vertipadCompilation.clusters,
    ...boulevardCompilation.clusters,
  ],
  lamps: [
    ...openHouseSceneOptions.lamps,
    ...oldQuarterCompilation.lamps,
    ...skyMooringCompilation.lamps,
    ...vertipadCompilation.lamps,
    ...boulevardCompilation.lamps,
  ],
  spotLights: [
    ...skyMooringSpotLights,
    ...townVertipadSpotLights,
    ...townBoulevardSpotLights,
  ],
});
