import { latticeGradeMapRgba } from "../content/landscape/landscapeLattice.ts";
import { kallurLandscapeLattice } from "../content/scenes/kallur/kallurLandscapeDocument.ts";
import { kallurGroundTint } from "./kallurGroundTint.ts";
import { kallurTurfStyleAt } from "./kallurVegetation.ts";
import {
  registerLandscapeGradeMap,
  registerLandscapeGrassStyle,
  registerLandscapeGroundTint,
} from "./landscapeSurfaceRuntime.ts";

/**
 * Kallur fills the engine landscape slots. Import this from the Kallur
 * scene module so other islands never evaluate the Faroe field.
 *
 * Grade map numbers match the shader UV ((x+128)/256, probe 2.2 m) already
 * accepted with the carpet band — changing them is a visual change.
 */
registerLandscapeGroundTint("kallur-ground", kallurGroundTint);
registerLandscapeGrassStyle("kallur", kallurTurfStyleAt);
registerLandscapeGradeMap(
  "kallur",
  latticeGradeMapRgba(kallurLandscapeLattice, {
    size: 192,
    worldMin: -128,
    worldSpan: 256,
    probe: 2.2,
  }),
);
