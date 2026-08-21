import type { SceneObjectDefinition } from "../sceneContract.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { KallurAirshipPlacement } from "../../../game/kallurAirship.ts";
import {
  KALLUR_AIRSHIP_BERTH_ANCHOR,
  KALLUR_AIRSHIP_YAW,
} from "../../../game/kallurAirshipRoutes.ts";
import { KALLUR_PADS } from "./kallurTerrainPlan.ts";

/**
 * The world seats the separately-declared vessel: the summit landing
 * platform (Igor's verdict — a SIMPLE platform with wooden plank decking,
 * not a mooring mast) and the placement handed to the ship factory. The
 * levelled crown comes from the airship-berth flat pad in the terrain
 * plan; the deck build here reads its elevation.
 */

const foundPad = KALLUR_PADS.find((pad) => pad.id === "airship-berth");
if (!foundPad) throw new Error("airship-berth missing from KALLUR_PADS");
export const KALLUR_AIRSHIP_PAD = foundPad;

// Bearers on the pad, joists across them, planks over the joists.
const BEARER_HEIGHT = 0.4;
const JOIST_HEIGHT = 0.3;
const PLANK_HEIGHT = 0.09;
export const KALLUR_AIRSHIP_DECK_TOP = KALLUR_AIRSHIP_PAD.elevation +
  BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT;

export const KALLUR_AIRSHIP_PLACEMENT: KallurAirshipPlacement = {
  position: [
    KALLUR_AIRSHIP_BERTH_ANCHOR[0],
    KALLUR_AIRSHIP_DECK_TOP,
    KALLUR_AIRSHIP_BERTH_ANCHOR[1],
  ],
  yaw: KALLUR_AIRSHIP_YAW,
};

/** Deck plan: the long axis follows the ship's nose axis. */
const DECK_LENGTH = 18;
const DECK_WIDTH = 7;
const PLANK_PITCH = 0.5;

const COS = Math.cos(KALLUR_AIRSHIP_YAW);
const SIN = Math.sin(KALLUR_AIRSHIP_YAW);

/** Platform-local (along, up, across) → world; along = ship nose axis. */
function deckPoint(along: number, up: number, across: number): SceneVector3 {
  return [
    KALLUR_AIRSHIP_BERTH_ANCHOR[0] + SIN * along + COS * across,
    KALLUR_AIRSHIP_PAD.elevation + up,
    KALLUR_AIRSHIP_BERTH_ANCHOR[1] + COS * along - SIN * across,
  ];
}

/** The player's dispatch point: a bollard by the port stern quarter. */
export const KALLUR_AIRSHIP_DISPATCH_POINT: SceneVector3 = deckPoint(
  -3.4,
  BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT + 0.6,
  2.4,
);

export function createKallurAirshipBerth(
  push: (object: SceneObjectDefinition) => void,
): void {
  const rotation: SceneVector3 = [0, KALLUR_AIRSHIP_YAW, 0];
  const primitive = (
    id: string,
    material: "wood" | "steel",
    shape: "panel" | "cylinder",
    center: SceneVector3,
    size: SceneVector3,
    color: string,
  ) => {
    push({
      kind: "primitive",
      id,
      material,
      shape,
      size,
      color,
      transform: { position: center, rotation },
      contactBoxes: [{ position: [0, 0, 0], size }],
      bearsLoad: true,
      carriesAttachments: true,
      foundation: id.startsWith("bearer"),
    });
  };

  // Bearers: two rows of squat sleeper blocks on the levelled crown.
  for (const [index, along] of [-7.6, -3.8, 0, 3.8, 7.6].entries()) {
    for (const side of [1, -1] as const) {
      primitive(
        `bearer:${index}:${side > 0 ? "l" : "r"}`,
        "wood",
        "panel",
        deckPoint(along, BEARER_HEIGHT / 2, side * 2.5),
        [0.55, BEARER_HEIGHT, 0.55],
        "#4a4038",
      );
    }
  }
  // Two joists run the full deck length on the bearers.
  for (const side of [1, -1] as const) {
    primitive(
      `joist:${side > 0 ? "l" : "r"}`,
      "wood",
      "panel",
      deckPoint(0, BEARER_HEIGHT + JOIST_HEIGHT / 2, side * 2.5),
      // Local axes: the deck build rotates by yaw, so size X is ACROSS
      // and size Z is ALONG the ship axis.
      [0.28, JOIST_HEIGHT, DECK_LENGTH],
      "#57493d",
    );
  }
  // Planks across the joists: pitch EXACTLY equals the plank size.
  const plankCount = Math.round(DECK_LENGTH / PLANK_PITCH);
  for (let plank = 0; plank < plankCount; plank += 1) {
    const along = -DECK_LENGTH / 2 + (plank + 0.5) * PLANK_PITCH;
    primitive(
      `plank:${plank}`,
      "wood",
      "panel",
      deckPoint(along, BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT / 2, 0),
      [DECK_WIDTH, PLANK_HEIGHT, PLANK_PITCH],
      plank % 3 === 0 ? "#6d5c4b" : plank % 3 === 1 ? "#75634f" : "#685744",
    );
  }
  // The dispatch bollard: the platform's departures board.
  primitive(
    "bollard",
    "steel",
    "cylinder",
    deckPoint(-3.4, BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT + 0.3, 2.9),
    [0.22, 0.6, 0.22],
    "#3a3f42",
  );
}
