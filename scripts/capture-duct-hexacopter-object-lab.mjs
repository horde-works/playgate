import { ductHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  ductHexacopterObject,
  "games/make-a-mess/docs/duct-hexacopter/d4a-rig",
);
