// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Габаритные макеты будущих объектов. Основание показывает точное пятно, а
// простой полноразмерный объём — высоту и силуэт в композиции острова. Это не
// эскиз фасада: ни одна случайная деталь отсюда не должна попасть в финальное
// здание.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, primitive } from "./astanaAuthoring.ts";
import { astanaAreas, type AstanaArea } from "./astanaPlan.ts";
import { groundUnder } from "./astanaShell.ts";
import { PYRAMID_PODIUM_TOP } from "./astanaPyramidPodium.ts";

const MARKER_HEIGHT = 0.115;

/**
 * Высоты получены тем же локальным коэффициентом сжатия, что и пятно каждого
 * объекта. Поэтому сохраняется именно пропорция реального здания, а не один
 * искусственный масштаб для совершенно разных типологий.
 */
export const SITE_MASSING_HEIGHTS = {
  "pyramid-plot": 24,
  "nur-alem-expo-plot": 26,
  "abu-dhabi-plaza-plot": 61,
  "arch-square": 13.3,
  "opera-plot": 4.8,
  "circus-plot": 4.8,
  "museum-plot": 3.2,
} as const;

const SPHERE_BANDS = 17;

const SITE_COLOURS: Readonly<Record<string, string>> = {
  "pyramid-plot": "#c8b785",
  "nur-alem-expo-plot": "#216b79",
  "abu-dhabi-plaza-plot": "#326773",
  "arch-square": "#d6c39d",
  "opera-plot": "#dfd5bd",
  "circus-plot": "#a8b2b5",
  "museum-plot": "#4d91a6",
};

function colourOf(area: AstanaArea): string {
  const objectColour = SITE_COLOURS[area.id];
  if (objectColour) return objectColour;
  switch (area.status) {
    case "protected-reserve":
      return "#aaa28e";
    case "primary-reserve":
      return "#898c80";
    case "experimental-reserve":
      return "#707b80";
    default:
      return "#7f8278";
  }
}

function plateTopOf(area: AstanaArea): number {
  if (area.id === "pyramid-plot") return PYRAMID_PODIUM_TOP;
  const [x, z] = area.center;
  return (area.elevated ? 0.05 : groundUnder(x, z).top) + MARKER_HEIGHT;
}

function massingRotation(area: AstanaArea): readonly [number, number, number] {
  return [0, -(area.rotation ?? 0), 0];
}

function addSupportedVolume(
  target: MutableGroup,
  area: AstanaArea,
  id: string,
  material: "stone" | "steel" | "darkGlass",
  shape: "stoneBlock" | "cylinder",
  centreY: number,
  size: readonly [number, number, number],
  colour: string,
  localOffset: readonly [number, number] = [0, 0],
): void {
  const yaw = area.rotation ?? 0;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const x = area.center[0]
    + cosine * localOffset[0] - sine * localOffset[1];
  const z = area.center[1]
    + sine * localOffset[0] + cosine * localOffset[1];
  primitive(
    target,
    `massing:${area.id}:${id}`,
    material,
    shape,
    [x, centreY, z],
    size,
    colour,
    {
      rotation: massingRotation(area),
      bearingArea: Math.max(0.1, size[0] * size[2] * 0.62),
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.7,
      volume: Math.max(0.1, size[0] * size[1] * size[2] * 0.72),
      // В массинге каждый пояс описывает один внешний габарит. Скрытая
      // вертикальная коробка не рисует фиктивный конструктив, но не даёт
      // диагностическому макету рассыпаться до проектирования здания.
      contactBoxes: [groundSeatBox(centreY, size, plateTopOf(area))],
    },
  );
}

function addArchMassing(target: MutableGroup, area: AstanaArea): void {
  const height = SITE_MASSING_HEIGHTS["arch-square"];
  const fullWidth = 14;
  const openingWidth = 6;
  const lintelHeight = 3;
  const pierHeight = height - lintelHeight;
  const pierWidth = (fullWidth - openingWidth) / 2;
  const depth = 3.4;
  const pierOffset = openingWidth / 2 + pierWidth / 2;
  const base = plateTopOf(area);

  // Это именно габарит арки, а не дом: два устоя и верхняя перемычка
  // оставляют сквозной шестиметровый проём на собственной оси подхода.
  for (const side of [-1, 1] as const) {
    addSupportedVolume(
      target,
      area,
      `pier:${side < 0 ? "left" : "right"}`,
      "stone",
      "stoneBlock",
      base + pierHeight / 2,
      [pierWidth, pierHeight, depth],
      SITE_COLOURS[area.id],
      [side * pierOffset, 0],
    );
  }
  addSupportedVolume(
    target,
    area,
    "lintel",
    "stone",
    "stoneBlock",
    base + pierHeight + lintelHeight / 2,
    [fullWidth, lintelHeight, depth],
    SITE_COLOURS[area.id],
  );
}

function addSphereMassing(target: MutableGroup, area: AstanaArea): void {
  const diameter = SITE_MASSING_HEIGHTS["nur-alem-expo-plot"];
  const radius = diameter / 2;
  const bandHeight = diameter / SPHERE_BANDS;
  for (let band = 0; band < SPHERE_BANDS; band += 1) {
    const localY = -radius + bandHeight * (band + 0.5);
    const sampleY = Math.sign(localY)
      * Math.min(radius - 0.08, Math.abs(localY) + bandHeight * 0.33);
    const bandDiameter = Math.max(
      1.2,
      2 * Math.sqrt(Math.max(0, radius ** 2 - sampleY ** 2)),
    );
    addSupportedVolume(
      target,
      area,
      `sphere-band:${band}`,
      "darkGlass",
      "cylinder",
      plateTopOf(area) + radius + localY,
      [bandDiameter, bandHeight, bandDiameter],
      band % 2 === 0 ? "#216b79" : "#2b7886",
    );
  }
}

function addSimpleMassing(target: MutableGroup, area: AstanaArea): void {
  if (!area.pavingRadius) return;
  const height = SITE_MASSING_HEIGHTS[
    area.id as keyof typeof SITE_MASSING_HEIGHTS
  ];
  if (!height) return;
  const width = area.pavingRadius[0] * 2;
  const depth = area.pavingRadius[1] * 2;

  if (area.id === "circus-plot") {
    addSupportedVolume(
      target,
      area,
      "lower-disc",
      "steel",
      "cylinder",
      plateTopOf(area) + 0.8,
      [10.5, 1.6, 10.5],
      "#8d999e",
    );
    addSupportedVolume(
      target,
      area,
      "saucer",
      "steel",
      "cylinder",
      plateTopOf(area) + 1.6 + (height - 1.6) / 2,
      [width, height - 1.6, depth],
      SITE_COLOURS[area.id],
    );
    return;
  }

  const isGlass = area.id === "abu-dhabi-plaza-plot";
  addSupportedVolume(
    target,
    area,
    "volume",
    isGlass ? "darkGlass" : "stone",
    "stoneBlock",
    plateTopOf(area) + height / 2,
    [width, height, depth],
    SITE_COLOURS[area.id],
  );
}

function addMassing(target: MutableGroup, area: AstanaArea): void {
  switch (area.id) {
    case "pyramid-plot":
      return;
    case "nur-alem-expo-plot":
      addSphereMassing(target, area);
      return;
    case "arch-square":
      addArchMassing(target, area);
      return;
    default:
      addSimpleMassing(target, area);
  }
}

export function createAstanaSiteMarkers(
  foundations: MutableGroup,
  massing: MutableGroup,
): void {
  for (const area of astanaAreas) {
    if (area.surfaceMode !== "direct" || !area.pavingRadius) continue;
    // И плиту, и ступенчатый габарит Пирамиды заменили настоящие мостовой
    // постамент, стеклянные ячейки и единый стальной каркас.
    if (
      area.id === "pyramid-plot"
      || area.id === "arch-square"
      || area.id === "nur-alem-expo-plot"
      || area.id === "opera-plot"
    ) {
      continue;
    }
    const [x, z] = area.center;
    // Надречный Нур Алем читается как будущая мостовая плита на уровне
    // суши, а не как круг, утонувший на дне Есиля.
    const ground = area.elevated ? 0.05 : groundUnder(x, z).top;
    const size = [
      area.pavingRadius[0] * 2,
      MARKER_HEIGHT,
      area.pavingRadius[1] * 2,
    ] as const;
    const centreY = ground + MARKER_HEIGHT / 2;
    primitive(
      foundations,
      `site-marker:${area.id}`,
      "stone",
      area.shape === "ellipse" ? "cylinder" : "groundTile",
      [x, centreY, z],
      size,
      colourOf(area),
      {
        rotation: [0, -(area.rotation ?? 0), 0],
        textureProfile: "city-gray-pavers",
        bearingArea: Math.PI * area.pavingRadius[0] * area.pavingRadius[1],
        volume: area.pavingRadius[0] * area.pavingRadius[1] * MARKER_HEIGHT * 2.5,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        ...(area.elevated ? {
          // Временная несущая область габаритного макета. Финальные опоры
          // проектируются вместе с Нур Алемом и не подменяются сейчас
          // случайными видимыми колоннами.
          contactBoxes: [groundSeatBox(
            centreY,
            size,
            groundUnder(x, z).top,
          )],
        } : {}),
      },
    );
    // Full-height planning volumes are deliberately kept out of the live
    // portrait once landmark authoring begins.  They remain available in
    // this file as dimensional notes, but a 61 m Plaza proxy behind
    // Nur Alem (or a museum box behind the Arch) corrupts every like-for-like
    // photographic silhouette check.
    void massing;
  }
}
