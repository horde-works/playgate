import type { SceneObjectDefinition } from "../sceneContract.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { KallurAirshipPlacement } from "../../../game/kallurAirship.ts";
import {
  KALLUR_AIRSHIP_BERTH_ANCHOR,
  KALLUR_AIRSHIP_SHORE_ANCHOR,
  KALLUR_AIRSHIP_SHORE_YAW,
  KALLUR_AIRSHIP_YAW,
} from "../../../game/kallurAirshipRoutes.ts";
import { KALLUR_PADS, type KallurPad } from "./kallurTerrainPlan.ts";

/**
 * Two wooden landing stands: the summit crown and a second plank deck
 * behind the spawn, on the south beach. Same construction — bearers,
 * joists, planks, a bollard — not a mooring mast.
 */

const summitPad = KALLUR_PADS.find((pad) => pad.id === "airship-berth");
if (!summitPad) throw new Error("airship-berth missing from KALLUR_PADS");
export const KALLUR_AIRSHIP_PAD = summitPad;

const shorePad = KALLUR_PADS.find((pad) => pad.id === "airship-shore");
if (!shorePad) throw new Error("airship-shore missing from KALLUR_PADS");
export const KALLUR_AIRSHIP_SHORE_PAD = shorePad;

const BEARER_HEIGHT = 0.4;
const JOIST_HEIGHT = 0.3;
const PLANK_HEIGHT = 0.09;
const DECK_STACK = BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT;

export const KALLUR_AIRSHIP_DECK_TOP = KALLUR_AIRSHIP_PAD.elevation + DECK_STACK;
export const KALLUR_AIRSHIP_SHORE_DECK_TOP =
  KALLUR_AIRSHIP_SHORE_PAD.elevation + DECK_STACK;

export const KALLUR_AIRSHIP_PLACEMENT: KallurAirshipPlacement = {
  position: [
    KALLUR_AIRSHIP_BERTH_ANCHOR[0],
    KALLUR_AIRSHIP_DECK_TOP,
    KALLUR_AIRSHIP_BERTH_ANCHOR[1],
  ],
  yaw: KALLUR_AIRSHIP_YAW,
};

export const KALLUR_AIRSHIP_SHORE_PLACEMENT: KallurAirshipPlacement = {
  position: [
    KALLUR_AIRSHIP_SHORE_ANCHOR[0],
    KALLUR_AIRSHIP_SHORE_DECK_TOP,
    KALLUR_AIRSHIP_SHORE_ANCHOR[1],
  ],
  yaw: KALLUR_AIRSHIP_SHORE_YAW,
};

const PLANK_PITCH = 0.5;

interface DeckSite {
  readonly pad: KallurPad;
  readonly anchor: readonly [number, number];
  readonly yaw: number;
  readonly length: number;
  readonly width: number;
  readonly bearerAlong: readonly number[];
  readonly joistAcross: number;
}

const SUMMIT_DECK: DeckSite = {
  pad: KALLUR_AIRSHIP_PAD,
  anchor: KALLUR_AIRSHIP_BERTH_ANCHOR,
  yaw: KALLUR_AIRSHIP_YAW,
  length: 18,
  width: 7,
  bearerAlong: [-7.6, -3.8, 0, 3.8, 7.6],
  joistAcross: 2.5,
};

const SHORE_DECK: DeckSite = {
  pad: KALLUR_AIRSHIP_SHORE_PAD,
  anchor: KALLUR_AIRSHIP_SHORE_ANCHOR,
  yaw: KALLUR_AIRSHIP_SHORE_YAW,
  length: 14,
  width: 6.4,
  bearerAlong: [-5.6, -1.9, 1.9, 5.6],
  joistAcross: 2.2,
};

function deckPoint(
  site: DeckSite,
  along: number,
  up: number,
  across: number,
): SceneVector3 {
  const cos = Math.cos(site.yaw);
  const sin = Math.sin(site.yaw);
  return [
    site.anchor[0] + sin * along + cos * across,
    site.pad.elevation + up,
    site.anchor[1] + cos * along - sin * across,
  ];
}

function dispatchPoint(site: DeckSite): SceneVector3 {
  return deckPoint(
    site,
    -3.4,
    DECK_STACK + 0.6,
    site.width / 2 - 1.1,
  );
}

/** Summit bollard — the island's original departures board. */
export const KALLUR_AIRSHIP_DISPATCH_POINT = dispatchPoint(SUMMIT_DECK);
/** Shore bollard, behind the spawn. */
export const KALLUR_AIRSHIP_SHORE_DISPATCH_POINT = dispatchPoint(SHORE_DECK);

function buildDeck(
  site: DeckSite,
  push: (object: SceneObjectDefinition) => void,
): void {
  const rotation: SceneVector3 = [0, site.yaw, 0];
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

  for (const [index, along] of site.bearerAlong.entries()) {
    for (const side of [1, -1] as const) {
      primitive(
        `bearer:${index}:${side > 0 ? "l" : "r"}`,
        "wood",
        "panel",
        deckPoint(site, along, BEARER_HEIGHT / 2, side * site.joistAcross),
        [0.55, BEARER_HEIGHT, 0.55],
        "#4a4038",
      );
    }
  }
  for (const side of [1, -1] as const) {
    primitive(
      `joist:${side > 0 ? "l" : "r"}`,
      "wood",
      "panel",
      deckPoint(
        site,
        0,
        BEARER_HEIGHT + JOIST_HEIGHT / 2,
        side * site.joistAcross,
      ),
      [0.28, JOIST_HEIGHT, site.length],
      "#57493d",
    );
  }
  const plankCount = Math.round(site.length / PLANK_PITCH);
  for (let plank = 0; plank < plankCount; plank += 1) {
    const along = -site.length / 2 + (plank + 0.5) * PLANK_PITCH;
    primitive(
      `plank:${plank}`,
      "wood",
      "panel",
      deckPoint(site, along, BEARER_HEIGHT + JOIST_HEIGHT + PLANK_HEIGHT / 2, 0),
      [site.width, PLANK_HEIGHT, PLANK_PITCH],
      plank % 3 === 0 ? "#6d5c4b" : plank % 3 === 1 ? "#75634f" : "#685744",
    );
  }
  primitive(
    "bollard",
    "steel",
    "cylinder",
    deckPoint(
      site,
      -3.4,
      DECK_STACK + 0.3,
      site.width / 2 - 0.6,
    ),
    [0.22, 0.6, 0.22],
    "#3a3f42",
  );
}

export function createKallurAirshipBerth(
  push: (object: SceneObjectDefinition) => void,
): void {
  buildDeck(SUMMIT_DECK, push);
}

export function createKallurAirshipShoreBerth(
  push: (object: SceneObjectDefinition) => void,
): void {
  buildDeck(SHORE_DECK, push);
}
