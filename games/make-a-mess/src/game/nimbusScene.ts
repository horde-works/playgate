import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { nimbusDocument } from "../content/scenes/nimbus/nimbusDocument.ts";
import type { ScenePrefabLibrary } from "../content/scenes/sceneContract.ts";

const nimbusPrefabLibrary: ScenePrefabLibrary = new Map();

export const nimbusCompilation = compileSceneDocument(
  nimbusDocument,
  nimbusPrefabLibrary,
);

export const nimbusScene = nimbusCompilation.scene;
