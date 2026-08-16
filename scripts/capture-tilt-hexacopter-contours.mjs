import { tiltHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

const contourViewIds = new Set([
  "top",
  "dorsal-profile",
  "central-body-three-quarter",
  "engine-tail-profile",
  "primary-core-isometric",
  "reference-match",
  "front-three-quarter",
  "rear-three-quarter",
]);

await captureObjectLab({
  ...tiltHexacopterObject,
  views: tiltHexacopterObject.views.filter(({ id }) => contourViewIds.has(id)),
}, "games/make-a-mess/docs/tilt-hexacopter/b11-contours");
