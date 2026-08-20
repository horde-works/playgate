import { kallurLighthouseObject } from "../games/make-a-mess/src/content/objects/kallur/kallurLighthouseObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  kallurLighthouseObject,
  "games/make-a-mess/docs/kallur/lighthouse-reference/lab-a01",
);
