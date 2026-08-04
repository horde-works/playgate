import {
  dutchLandscapeKitObject,
  dutchLandscapeSchouwParts,
} from "../games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts";
import { captureObjectLab } from "./object-lab-capture.mjs";

const schouwViews = dutchLandscapeKitObject.views.filter(({ id }) => id.startsWith("schouw-"));

const schouwObjectStudy = {
  ...dutchLandscapeKitObject,
  id: "dutch-schouw-object-study",
  revision: `${dutchLandscapeKitObject.revision}-bottom-audit`,
  title: "Frisian schouw — canonical hull and bottom audit",
  labEnvironment: {
    ...dutchLandscapeKitObject.labEnvironment,
    floorY: -0.25,
  },
  parts: dutchLandscapeSchouwParts,
  views: [
    ...schouwViews,
    {
      id: "silhouette",
      label: "Schouw · closed four-board bottom from below",
      projection: "perspective",
      position: [4.8, -2.4, 5.6],
      target: [0, -0.08, 0],
      fov: 30,
      hiddenGroups: [],
    },
  ],
};

await captureObjectLab(
  schouwObjectStudy,
  "games/make-a-mess/docs/dutch-polder/schouw-object-study",
);
