import { mediumDragonPoseAtlasObject } from "../games/make-a-mess/src/content/objects/creatures/mediumDragonRigObject.ts";
import { mediumPantherPoseAtlasObject } from "../games/make-a-mess/src/content/objects/creatures/mediumPantherRigObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  mediumPantherPoseAtlasObject,
  "games/make-a-mess/docs/creature-blockouts/poses/m2/panther",
);
await captureObjectLab(
  mediumDragonPoseAtlasObject,
  "games/make-a-mess/docs/creature-blockouts/poses/m2/dragon",
);
