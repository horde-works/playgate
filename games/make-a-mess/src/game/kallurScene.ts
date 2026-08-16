import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { kallurDocument } from "../content/scenes/kallur/kallurDocument.ts";

export const kallurCompilation = compileSceneDocument(
  kallurDocument,
  new Map(),
);

export const kallurScene = kallurCompilation.scene;
