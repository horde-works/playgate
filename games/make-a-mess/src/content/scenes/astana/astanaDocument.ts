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
import { collectGroups, group } from "./astanaAuthoring.ts";
import {
  WORLD_RADIUS,
  createGreenBelt,
  createGround,
  createRiverBed,
  createSteppeTufts,
} from "./astanaShell.ts";
import { createRingViaduct } from "./astanaRing.ts";
import { createStations } from "./astanaStation.ts";
import { TRAIN_SECTIONS, createTrain } from "./astanaTrain.ts";

function createIsland(): void {
  createGround(
    group("terrain-base", "Deep steppe earth", "earth"),
    group("terrain-surface", "Steppe grass, riverbank and sand", "grass"),
  );
  createRiverBed(group("river-bed", "Esil riverbed", "soil"));
  createGreenBelt(group("green-belt", "Shelter belt around the island", "wood"));
  createSteppeTufts(group("steppe-tufts", "Wormwood and feather grass", "foliage"));
  createRingViaduct(
    group("lrt-piers", "LRT viaduct piers", "concrete"),
    group("lrt-deck", "LRT box girder and cantilevers", "concrete"),
    group("lrt-parapet", "Louvre parapet along the deck", "plastic"),
    group("lrt-track", "Track slab, rails and contact rail", "steel"),
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

createIsland();

export const astanaDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "astana",
  title: "Make a Mess: Astana",
  environment: "town",
  indestructible: true,
  contentLicense: "CC-BY-NC-ND-4.0",
  // Степной воздух сухой и прозрачный: остров видно целиком с любой точки,
  // а не сквозь молоко. Дальняя граница держится внутри диска моря (258 м).
  fogDistances: [118, 252],
  world: {
    // Спавн на левом берегу, южнее будущего Байтерека: игрок стоит лицом на
    // север, вдоль оси будущего бульвара, и видит реку за центром острова.
    playerSpawn: [0, 1.3, -24],
    cameraFar: 300,
    center: [0, 0],
    halfExtents: [118, 118],
    radius: WORLD_RADIUS,
    safetyFloorY: -2.6,
  },
  copy: {
    status: "Make a Mess / Astana",
    eyebrow: "Steppe capital test 001",
    heading: "Город — дом.",
    ready: "Astana is standing",
    loading: "Раскатываем степь…",
    description:
      "Остров-заповедник по мотивам Астаны: степь, река Есиль, лесозащитный пояс по кромке и кольцо ЛРТ на эстакаде вокруг всего острова. Здесь ничего нельзя сломать — это дом, а не полигон. Станции, Байтерек и целиноградские дворы строятся следующими этапами.",
    enter: "Выйти в степь",
    returnToGame: "Вернуться на остров",
    reset: "Начать заново",
  },
  groups: collectGroups(),
};
