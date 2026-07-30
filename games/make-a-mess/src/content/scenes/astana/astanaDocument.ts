// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Остров «Астана» — портрет реального города, а не выдуманный мир. Отсюда две
// вещи, которые держит сборка, а не добрая воля (см. LICENSING.md):
//   - `indestructible: true` — ломать нельзя ничего;
//   - `contentLicense: "CC-BY-NC-ND-4.0"` — контент вне коммерческих сборок.
// Снять флаг нельзя: мир с ND-лицензией без него не собирается.
//
// Этап A3 плана работ: только оболочка — грунт, русло Есиля, зелёный пояс,
// степная кромка. Кольцо ЛРТ, Байтерек, бульвар и Целиноград приходят
// следующими этапами; паспорт мира — docs/astana-brief.md.

import type { AuthoredSceneDocument } from "../sceneContract.ts";
import { collectGroups, group, resetGroups } from "./astanaAuthoring.ts";
import {
  WORLD_RADIUS,
  createGreenBelt,
  createGround,
  createRiverBed,
  createSteppeTufts,
} from "./astanaShell.ts";
import { createRingViaduct } from "./astanaRing.ts";
import { createStations } from "./astanaStation.ts";
import { createSurface } from "./astanaSurface.ts";
import { createBaiterek } from "./astanaBaiterek.ts";
import { createKhanShatyr } from "./astanaKhanShatyr.ts";
import { createAstanaParterre } from "./astanaParterre.ts";
import { createAstanaSiteMarkers } from "./astanaSiteMarkers.ts";
import { createAstanaFramework } from "./astanaFramework.ts";
import { createAstanaPyramidPodium } from "./astanaPyramidPodium.ts";
import { createAstanaPyramid } from "./astanaPyramid.ts";
import { createAstanaTriumphalArch } from "./astanaTriumphalArch.ts";
import { createAstanaNurAlem } from "./astanaNurAlem.ts";
import { createAstanaOpera } from "./astanaOpera.ts";
import {
  TRAIN_SECTIONS,
  astanaTrainSpotLights,
  createTrain,
} from "./astanaTrain.ts";
import {
  ASTANA_LATITUDE_DEGREES,
  ASTANA_TRUE_EAST_VECTOR,
  ASTANA_TRUE_NORTH_VECTOR,
} from "./astanaLayout.ts";

function createIsland(): void {
  createGround(
    group("terrain-base", "Deep steppe earth", "earth"),
    group("terrain-surface", "Steppe grass, riverbank and sand", "grass"),
  );
  createRiverBed(group("river-bed", "Esil riverbed", "soil"));
  createGreenBelt(group("green-belt", "Shelter belt around the island", "wood"));
  createSteppeTufts(group("steppe-tufts", "Wormwood and feather grass", "foliage"));
  // Покрытие кладётся ДО застройки: улица — техзадание на дом, а не наоборот.
  createSurface(
    group("city-roads", "Roadways, boulevard and embankments", "asphalt"),
    group("city-kerbs", "Kerbs along the roadways", "concrete"),
    group("city-paving", "Squares, parterre and yards", "stone"),
    group(
      "atyrau-shell",
      "Atyrau painted-steel frame and polymer-coated aluminium cassettes",
      "steel",
      "linked",
    ),
  );
  createAstanaParterre(
    group("city-parterre", "Nurzhol granite flower-bed edges", "stone"),
    group("city-flowerbeds", "Nurzhol raised soil and flower parterre", "foliage"),
    group("city-parterre-lamps", "Nurzhol boulevard lamp posts", "steel"),
  );
  createAstanaSiteMarkers(
    group("city-site-markers", "Exact-azimuth future landmark foundations", "stone"),
    group("city-site-massing", "Full-height future landmark massing", "stone"),
  );
  createAstanaPyramidPodium(
    group("pyramid-podium", "Raised concrete bridge podium under the Pyramid", "concrete", "linked"),
    group("pyramid-entrances", "Three splayed entrance ramps to the Pyramid", "concrete", "linked"),
    group("pyramid-mound", "Terraced grass mound with three exact entrance cuts", "grass", "linked"),
  );
  createAstanaPyramid(
    group("pyramid-frame", "Exact five-tier triangular steel grid of the Pyramid", "steel", "linked"),
    group("pyramid-glass", "Triangular glazing of the Pyramid", "glass", "linked"),
    group("pyramid-interior", "Hidden night lighting inside the Pyramid", "steel", "linked"),
  );
  createAstanaTriumphalArch(
    group("triumphal-arch-structure", "Mangilik El load-bearing piers, spandrels and coffered vault", "stone", "linked"),
    group("triumphal-arch-detail", "Mangilik El niches, emblems, inscriptions and crown", "stone", "linked"),
    group("triumphal-arch-lighting", "Concealed warm architectural light for Mangilik El", "steel", "linked"),
  );
  createAstanaNurAlem(
    group("nur-alem-foundation", "Nur Alem access plaza and structural collar", "stone", "linked"),
    group("nur-alem-core", "Nur Alem double core and eight museum floors", "steel", "linked"),
    group("nur-alem-shell", "Nur Alem smooth double-curved blue glass sphere", "darkGlass", "linked"),
    group("nur-alem-frame", "Nur Alem exterior diamond mullion net and wind scoop", "steel", "linked"),
    group("nur-alem-complex", "Four low crescent Expo pavilions around Nur Alem", "steel", "linked"),
    group("nur-alem-lighting", "Concealed cyan night illumination inside Nur Alem", "steel", "linked"),
  );
  createAstanaOpera(
    group("opera-foundation", "Astana Opera stone plinth and front steps", "stone", "linked"),
    group("opera-body", "Astana Opera pearl-stone body and stage tower", "stone", "linked"),
    group("opera-columns", "Astana Opera eight-column portico and side colonnades", "stone", "linked"),
    group("opera-glazing", "Astana Opera brass-framed facade glazing", "darkGlass", "linked"),
    group("opera-roof", "Astana Opera copper main and rounded stage roofs", "steel", "linked"),
    group("opera-detail", "Astana Opera pediment, cornices and sculptural relief", "stone", "linked"),
    group("opera-lighting", "Concealed warm architectural lighting of Astana Opera", "steel", "linked"),
  );
  createAstanaFramework(
    group("city-framework", "Rough-grid spatial framework for the next plan", "stone"),
  );
  createRingViaduct(
    group("lrt-piers", "LRT viaduct piers", "concrete"),
    group("lrt-deck", "LRT box girder and cantilevers", "concrete"),
    group("lrt-parapet", "Louvre parapet along the deck", "plastic"),
    group("lrt-track", "Track slab, rails and contact rail", "steel"),
  );
  // Байтерек — доминанта левого берега, ось бульвара.
  createBaiterek(
    group("baiterek-frame", "Baiterek stems, lattice and nest", "steel"),
    group("baiterek-shell", "Baiterek plinth, lift shaft and gallery", "concrete"),
    group("baiterek-sphere", "Baiterek golden mirror sphere", "steel"),
    [0, 0],
  );
  createKhanShatyr(
    group("khan-structure", "Khan Shatyr tripod, hub and articulated top ring", "steel"),
    group("khan-cables", "Khan Shatyr prestressed radial and hoop cable net", "steel", "linked"),
    group("khan-membrane", "Khan Shatyr staggered translucent ETFE cushions", "glass", "linked"),
    group("khan-base", "Khan Shatyr perimeter, entrance and landscaped berm", "concrete"),
  );
  createStations(
    group("station-deck", "Station platforms", "concrete"),
    group("station-screens", "Platform screen doors", "glass"),
    group("station-canopy", "Platform canopies", "concrete"),
    group("station-fittings", "Boards, benches and signs", "steel"),
    group("station-concourse", "Concourses, stairs, escalators and lifts", "concrete"),
  );
  // Секция состава — отдельный кластер: состав задуман СОСТАВНЫМ
  // кинематическим объектом, и на дуге секции разворачиваются друг
  // относительно друга, а не едут одним бруском.
  createTrain(
    Array.from({ length: TRAIN_SECTIONS }, (_, index) =>
      group(`lrv-001-${index}`, `TRITON LRV 001, section ${index + 1}`, "steel"),
    ),
  );
}

// Документ собирается заново целиком, в том числе после HMR. Авторские
// группы не должны переживать предыдущую сборку.
resetGroups();
createIsland();

export const astanaDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "astana",
  title: "Make a Mess: The Capital",
  environment: "town",
  indestructible: true,
  contentLicense: "CC-BY-NC-ND-4.0",
  // Степной воздух сухой и прозрачный: остров видно целиком с любой точки,
  // а не сквозь молоко. Дальняя граница держится внутри диска моря (258 м).
  fogDistances: [150, 328],
  solarFrame: {
    model: "equinox",
    latitudeDegrees: ASTANA_LATITUDE_DEGREES,
    east: ASTANA_TRUE_EAST_VECTOR,
    north: ASTANA_TRUE_NORTH_VECTOR,
  },
  world: {
    // Спавн на левом берегу, южнее будущего Байтерека: игрок стоит лицом на
    // север, вдоль оси будущего бульвара, и видит реку за центром острова.
    playerSpawn: [0, 1.3, -24],
    cameraFar: 370,
    center: [0, 0],
    halfExtents: [WORLD_RADIUS + 6, WORLD_RADIUS + 6],
    radius: WORLD_RADIUS,
    safetyFloorY: -2.6,
  },
  copy: {
    status: "Make a Mess / The Capital",
    eyebrow: "Heart of the Great Steppe",
    heading: "Where roads meet.",
    ready: "The Capital is awake",
    loading: "Tracing the roads…",
    description:
      "The heart of the Great Steppe. Here the ancient Silk Road meets the new one, East meets West, and memory meets the future. The island connects cultures, roads and worlds.",
    enter: "Enter the Capital",
    returnToGame: "Return to the island",
    reset: "Begin again",
  },
  groups: collectGroups(),
  spotLights: astanaTrainSpotLights,
};
