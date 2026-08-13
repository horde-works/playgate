import { dc3BlockoutObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  dc3BlockoutObject,
  "games/make-a-mess/docs/dc-3/blockout-b01",
);
