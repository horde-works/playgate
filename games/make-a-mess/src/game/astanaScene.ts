import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { astanaDocument } from "../content/scenes/astana/astanaDocument.ts";
import { astanaPrefabLibrary } from "../content/prefabs/astanaPrefabs.ts";

export const astanaCompilation = compileSceneDocument(
  astanaDocument,
  astanaPrefabLibrary,
);

export const astanaScene = astanaCompilation.scene;
