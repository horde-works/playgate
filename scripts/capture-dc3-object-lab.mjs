import { dc3Object } from "../games/make-a-mess/src/content/objects/vehicles/dc3Object.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  dc3Object,
  `games/make-a-mess/docs/dc3/${dc3Object.revision.replace(/^dc3-/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "")}`,
);
