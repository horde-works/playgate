import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { combatHexacopterRangeDocument } from "../content/scenes/combatHexacopterRangeDocument.ts";

export const combatHexacopterRangeCompilation = compileSceneDocument(
  combatHexacopterRangeDocument,
  new Map(),
);

export const combatHexacopterRangeScene = combatHexacopterRangeCompilation.scene;
