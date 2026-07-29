// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Объекты, снятые с текущей композиции, но сохранённые как точное ТЗ. Этот
// файл не импортируется генератором сцены: запись здесь не может случайно
// вернуть мечеть на карту без отдельного решения о её месте и исполнении.

import {
  compositionTangentYaw,
  astanaGeographicBearingVector,
  type AstanaLandmarkSite,
} from "./astanaLayout.ts";

export const HAZRET_SULTAN_QIBLA_BEARING_DEGREES = 231.48284795918946;
export const HAZRET_SULTAN_QIBLA_VECTOR = astanaGeographicBearingVector(
  HAZRET_SULTAN_QIBLA_BEARING_DEGREES,
);
export const HAZRET_SULTAN_QIBLA_SCENE_BEARING_DEGREES = (
  Math.atan2(HAZRET_SULTAN_QIBLA_VECTOR[0], HAZRET_SULTAN_QIBLA_VECTOR[1])
  * 180 / Math.PI + 360
) % 360;
export const HAZRET_SULTAN_QIBLA_YAW = Math.atan2(
  HAZRET_SULTAN_QIBLA_VECTOR[1],
  HAZRET_SULTAN_QIBLA_VECTOR[0],
);

export const HAZRET_SULTAN_MINARET_COUNT = 4;
export const HAZRET_SULTAN_MASSING_HEIGHT = 10.6;
export const HAZRET_SULTAN_MINARET_HEIGHT = 16.1;

export const DEFERRED_HAZRET_SULTAN_SITE: AstanaLandmarkSite = {
  id: "hazret-sultan-plot",
  center: [-43, -58],
  radius: [15, 14],
  rotation: HAZRET_SULTAN_QIBLA_YAW,
  status: "protected-reserve",
  clearVegetation: true,
};

/**
 * Дворец школьников убран из текущей композиции, но его согласованный
 * габарит сохранён. Возвращать его можно только после появления отдельной
 * среды, а не в любой свободный прямоугольник южного сектора.
 */
export const DEFERRED_SCHOOL_PALACE_MASSING_HEIGHT = 4.2;
export const DEFERRED_SCHOOL_PALACE_SITE: AstanaLandmarkSite = {
  id: "school-palace-plot",
  center: [-72, -44],
  radius: [10, 7],
  rotation: compositionTangentYaw([-72, -44], 10),
  status: "secondary-reserve",
  clearVegetation: true,
};
