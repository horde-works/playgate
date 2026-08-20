import { dutchPolderPrefabLibrary } from "../content/prefabs/dutchPolderPrefabs.ts";
import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { dutchPolderDocument } from "../content/scenes/dutchPolder/dutchPolderDocument.ts";
import "./dutchPolderVegetation.ts";

export const dutchPolderCompilation = compileSceneDocument(
  dutchPolderDocument,
  dutchPolderPrefabLibrary,
);

export const dutchPolderScene = dutchPolderCompilation.scene;
