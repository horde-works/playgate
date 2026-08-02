import type { AuthoredSceneDocument } from "../sceneContract.ts";
import {
  collectNimbusGroups,
  nimbusGroup,
  resetNimbusGroups,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_BASE_Y,
  NIMBUS_WORLD_RADIUS,
  createNimbusGround,
  createNimbusLandscape,
  nimbusGroundUnder,
} from "./nimbusShell.ts";
import { createNimbusShipyard } from "./nimbusShipyard.ts";
import { createNimbusAtmosphericTower } from "./nimbusAtmosphericTower.ts";
import { createNimbusGroundInfrastructure } from "./nimbusGroundInfrastructure.ts";
import { createNimbusIndustrialCampus } from "./nimbusIndustrialCampus.ts";
import { createNimbusSpindleTower } from "./nimbusSpindleTower.ts";
import { createNimbusTower } from "./nimbusTower.ts";
import { createNimbusVerticalDock } from "./nimbusVerticalDock.ts";
import {
  createNimbusHexacopter,
  nimbusHexacopterSpotLights,
} from "./nimbusHexacopter.ts";

function createNimbus(): void {
  createNimbusGround(
    nimbusGroup("terrain-base", "Deep earth under the Nimbus basin", "earth"),
    nimbusGroup("terrain-surface", "Uneven basin surface", "grass"),
  );
  createNimbusLandscape(
    nimbusGroup("landscape-rock", "Ridges, talus and drainage stone", "stone"),
    nimbusGroup("landscape-vegetation", "Basin scrub and rough grass", "foliage"),
  );
  createNimbusGroundInfrastructure({
    earthworks: nimbusGroup(
      "infrastructure-earthworks",
      "Asymmetric earth shoulders around the atmospheric supports",
      "earth",
    ),
    retaining: nimbusGroup(
      "infrastructure-retaining",
      "Work-bowl retaining cuts inside the support berms",
      "concrete",
    ),
    officePlazas: nimbusGroup(
      "office-plazas",
      "Independent hardscape plates under the two office towers",
      "concrete",
    ),
  });
  createNimbusIndustrialCampus({
    flightFoundation: nimbusGroup(
      "flight-field-foundation",
      "Terraced reinforced blocks under the north-west flight field",
      "concrete",
    ),
    flightSurface: nimbusGroup(
      "flight-field-surface",
      "Heavy vertical-flight deck and recessed guidance channels",
      "concrete",
    ),
    industrialFoundation: nimbusGroup(
      "industrial-foundation",
      "Independent production hall caissons",
      "concrete",
    ),
    industrialPrimary: nimbusGroup(
      "industrial-primary",
      "Production hall columns, trusses and eave beams",
      "steel",
    ),
    industrialShell: nimbusGroup(
      "industrial-shell",
      "Production envelopes, real cargo openings and roofs",
      "plastic",
    ),
    industrialEquipment: nimbusGroup(
      "industrial-equipment",
      "Overhead bridges, energy banks and dock winches",
      "steel",
    ),
    hardscape: nimbusGroup(
      "industrial-hardscape",
      "Loading aprons and the vertical-dock transfer throat",
      "concrete",
    ),
    rails: nimbusGroup(
      "industrial-rails",
      "Flight-field, production, shipyard and dock transfer rails",
      "steel",
    ),
    cargoCranes: nimbusGroup(
      "industrial-cargo-cranes",
      "Cargo cranes kept outside the vertical arrival volume",
      "steel",
    ),
    flightPads: nimbusGroup(
      "hex-flight-pads",
      "Distributed cargo and office pads for small vertical aircraft",
      "steel",
    ),
  });
  createNimbusHexacopter(
    nimbusGroup(
      "hexacopter",
        "HX-6 survey rotorcraft based at the production assembly pad",
      "steel",
      "linked",
    ),
    nimbusGroup(
      "hex-flight-pads",
      "Distributed cargo and office pads for small vertical aircraft",
      "steel",
    ),
  );
  createNimbusShipyard(
    nimbusGroup("shipyard-hardscape", "Distributed shipyard work pads", "concrete"),
    nimbusGroup("shipyard-rails", "Assembly rails and drainage grilles", "steel"),
    nimbusGroup("shipyard-supports", "Machine assembly stools", "steel"),
    nimbusGroup("shipyard-machine-frame", "Incomplete great machine frame", "steel"),
    nimbusGroup("shipyard-machine-shell", "Installed machine shell panels", "plastic"),
  );
  createNimbusAtmosphericTower({
    foundation: nimbusGroup(
      "atmosphere-foundation",
      "Six independently founded atmospheric tower supports",
      "concrete",
    ),
    primary: nimbusGroup(
      "atmosphere-primary",
      "Continuous mega-supports and upper structural ribs",
      "concrete",
    ),
    liftTruss: nimbusGroup(
      "atmosphere-lift-truss",
      "Six diagonal lift shafts without moving cabins",
      "steel",
    ),
    floors: nimbusGroup(
      "atmosphere-floors",
      "Independent upper floor sectors",
      "concrete",
    ),
    shell: nimbusGroup(
      "atmosphere-shell",
      "Tapered chamfered atmospheric upper body",
      "darkGlass",
    ),
    fittings: nimbusGroup(
      "atmosphere-fittings",
      "Support stairs and internal service fittings",
      "steel",
    ),
    crown: nimbusGroup(
      "atmosphere-crown",
      "Two integrated atmospheric fan nacelles",
      "steel",
    ),
    constructionCranes: nimbusGroup(
      "atmosphere-construction-cranes",
      "Three externally tied sectional flat-top tower cranes",
      "steel",
    ),
  });
  createNimbusSpindleTower({
    foundation: nimbusGroup(
      "spindle-foundation",
      "Twenty deep caissons under the outer-rim spindle",
      "concrete",
    ),
    core: nimbusGroup(
      "spindle-core",
      "Redundant columns and armoured polygonal core",
      "concrete",
    ),
    armour: nimbusGroup(
      "spindle-armour",
      "Buried and internal replaceable armour",
      "steel",
    ),
    floors: nimbusGroup(
      "spindle-floors",
      "Independent spindle floor sectors",
      "concrete",
    ),
    frame: nimbusGroup(
      "spindle-floor-frame",
      "Radial beams following the spindle profile",
      "steel",
    ),
    facade: nimbusGroup(
      "spindle-facade",
      "Continuous tapered glass and ceramic shell",
      "darkGlass",
    ),
    fittings: nimbusGroup(
      "spindle-fittings",
      "Meridians and technical belts",
      "steel",
    ),
    stairs: nimbusGroup(
      "spindle-stairs",
      "Two independent counter-wound core stairs",
      "steel",
    ),
    crown: nimbusGroup(
      "spindle-crown",
      "Tapered lightning crown and needle",
      "steel",
    ),
  });
  createNimbusVerticalDock({
    foundation: nimbusGroup(
      "dock-foundation",
      "Independent deep foundations following the C-shaped dock",
      "concrete",
    ),
    primary: nimbusGroup(
      "dock-primary",
      "Continuous rear spine and two autonomous dock cheeks",
      "concrete",
    ),
    armour: nimbusGroup(
      "dock-armour",
      "Replaceable buried and core armour",
      "steel",
    ),
    floors: nimbusGroup(
      "dock-floors",
      "Sectorised rear and cheek floors",
      "concrete",
    ),
    facade: nimbusGroup(
      "dock-facade",
      "Outer and dock-facing inhabited facades",
      "darkGlass",
    ),
    dockFrame: nimbusGroup(
      "dock-frame",
      "Vertical guide rails and independent floor beams",
      "steel",
    ),
    lifts: nimbusGroup(
      "dock-lifts",
      "Static lift shafts without moving cabins",
      "steel",
    ),
    stairs: nimbusGroup(
      "dock-stairs",
      "Independent service and habitation stairs",
      "steel",
    ),
    fittings: nimbusGroup(
      "dock-fittings",
      "Maintenance balconies and docking clamps",
      "steel",
    ),
    crown: nimbusGroup(
      "dock-crown",
      "Cantilever service cranes and split lightning crown",
      "steel",
    ),
  });
  createNimbusTower({
    foundation: nimbusGroup("tower-foundation", "Twenty independent caissons and raft arcs", "concrete"),
    core: nimbusGroup("tower-core", "Armoured concrete core and column ring", "concrete"),
    armour: nimbusGroup("tower-armour", "Replaceable non-bearing armour", "steel"),
    floors: nimbusGroup("tower-floors", "Independent floor sectors", "concrete"),
    frame: nimbusGroup("tower-floor-frame", "Radial floor beams and perimeter ring", "steel"),
    facade: nimbusGroup("tower-facade", "Segmented composite and glass facade", "darkGlass"),
    fittings: nimbusGroup("tower-fittings", "Facade mullions and technical belts", "steel"),
    crown: nimbusGroup("tower-crown", "Roof sectors and split lightning spire", "steel"),
  });
}

resetNimbusGroups();
createNimbus();

const spawnX = -142;
const spawnZ = 126;
const spawnGround = nimbusGroundUnder(spawnX, spawnZ).top;
const lookTarget = [-22, 8] as const;

export const nimbusDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "nimbus",
  title: "Make a Mess: Nimbus",
  environment: "fortress",
  fogDistances: [165, 430],
  world: {
    playerSpawn: [spawnX, spawnGround + 1.3, spawnZ],
    playerSpawnYaw: Math.atan2(
      lookTarget[0] - spawnX,
      -(lookTarget[1] - spawnZ),
    ),
    cameraFar: 620,
    center: [0, 0],
    halfExtents: [212, 212],
    boundaryRadius: 238,
    skyRadius: 305,
    radius: NIMBUS_WORLD_RADIUS,
    safetyFloorY: NIMBUS_BASE_Y - 1,
  },
  copy: {
    status: "Make a Mess / Nimbus",
    eyebrow: "A machine age in the basin",
    heading: "The future is under construction.",
    ready: "Nimbus is live",
    loading: "Raising the horizon…",
    description:
      "A weathered basin turned into a proving ground: the great machine rises below while the shield tower watches from the rim.",
    enter: "Enter Nimbus",
    returnToGame: "Return to the basin",
    reset: "Rebuild Nimbus",
  },
  groups: collectNimbusGroups(),
  spotLights: nimbusHexacopterSpotLights,
};
