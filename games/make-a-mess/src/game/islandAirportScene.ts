import { compileSceneDocument } from "../content/scenes/compileScene.ts";
import { islandAirportDocument } from "../content/scenes/islandAirport/islandAirportDocument.ts";

export const islandAirportCompilation = compileSceneDocument(
  islandAirportDocument,
  new Map(),
);

export const islandAirportScene = islandAirportCompilation.scene;
