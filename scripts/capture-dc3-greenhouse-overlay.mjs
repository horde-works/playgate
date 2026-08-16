import { dc3GreenhouseOverlayModel } from "../games/make-a-mess/src/content/objects/aircraft/dc3GreenhouseOverlay.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  dc3GreenhouseOverlayModel,
  "games/make-a-mess/docs/dc-3/greenhouse-overlay",
);
