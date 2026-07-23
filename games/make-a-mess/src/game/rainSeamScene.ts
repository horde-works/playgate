import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { cityPrefabLibrary } from "../content/prefabs/cityPrefabs.ts";
import { rainSeamDocument } from "../content/scenes/rainSeamDocument.ts";

export const rainSeamCompilation = compileSceneDocument(
  rainSeamDocument,
  cityPrefabLibrary,
);

export const rainSeamScene = rainSeamCompilation.scene;
