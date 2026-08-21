import { kallurAirshipObject } from "../games/make-a-mess/src/content/objects/kallur/kallurAirshipObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

await captureObjectLab(
  kallurAirshipObject,
  "games/make-a-mess/docs/kallur/airship-reference/lab-a01",
);
