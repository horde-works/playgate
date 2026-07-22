import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { vikingVillageDocument } from "../content/scenes/vikingVillageDocument.ts";
import { vikingPrefabLibrary } from "../content/prefabs/vikingPrefabs.ts";

export const vikingVillageCompilation = compileSceneDocument(
  vikingVillageDocument,
  vikingPrefabLibrary,
);

export const vikingVillageScene = vikingVillageCompilation.scene;
