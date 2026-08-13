import { mediumDragonFlightObject, mediumDragonGroundObject } from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import { mediumPantherObject } from "../games/make-a-mess/src/content/objects/creatures/mediumPantherObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  mediumPantherObject,
  "games/make-a-mess/docs/creature-blockouts/captures/p6/panther",
);
await captureObjectLab(
  mediumDragonGroundObject,
  "games/make-a-mess/docs/creature-blockouts/captures/p6/dragon-ground",
);
await captureObjectLab(
  mediumDragonFlightObject,
  "games/make-a-mess/docs/creature-blockouts/captures/p6/dragon-flight",
);
