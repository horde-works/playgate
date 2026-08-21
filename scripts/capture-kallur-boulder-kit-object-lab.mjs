import { kallurBoulderKitObject } from "../games/make-a-mess/src/content/objects/kallur/kallurBoulderKitObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  kallurBoulderKitObject,
  "games/make-a-mess/docs/kallur/boulder-kit-reference/lab-a01",
);
