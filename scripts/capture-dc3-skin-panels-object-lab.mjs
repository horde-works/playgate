import { dc3SkinPanelsObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3SkinPanelsObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  dc3SkinPanelsObject,
  "games/make-a-mess/docs/dc-3/skin-panels/p2-01",
);
