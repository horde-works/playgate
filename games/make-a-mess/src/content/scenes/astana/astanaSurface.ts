// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Покрытия острова: один планарный владелец каждой точки вместо стопки
// почти копланарных прямоугольников. Дороги, площади и променады растрируются
// в общую полуметровую сетку, после чего соседние клетки с одинаковым
// материалом сшиваются обратно в крупные прямоугольники. Поэтому перекрёсток
// физически является одной поверхностью, а не несколькими слоями с разницей
// в миллиметр.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { createAtyrauBridge } from "./astanaAtyrau.ts";
import { NURZHOL_PLAN_ROTATION } from "./astanaLayout.ts";
import { groundUnder, WORLD_RADIUS } from "./astanaShell.ts";
import {
  astanaAreas,
  distanceToPolyline,
  renderedAstanaWays,
  type AstanaArea,
  type AstanaWay,
  type PlanPoint,
} from "./astanaPlan.ts";

const ASPHALT = "#4a4d51";
const ASPHALT_WORN = "#505359";
const KERB = "#b8bab7";
const PAVING_A = "#cbc8c0";
const PAVING_B = "#c1beb6";
const PROMENADE = "#bcbab2";
const BRIDGE_STEEL = "#d7dadd";
const BRIDGE_STEEL_SHADE = "#c2c6ca";
const BRIDGE_CONCRETE = "#9fa4a8";

/** Полметра скрывает ступенчатость кривой уже с десяти метров. */
const SURFACE_PITCH = 0.5;
const SURFACE_LIMIT = Math.ceil((WORLD_RADIUS - 3) / SURFACE_PITCH) * SURFACE_PITCH;
const DETAIL_LINK = 4;

interface WaySkin {
  readonly material: "asphalt" | "stone" | "concrete";
  readonly colours: readonly [string, string];
  readonly kerb: boolean;
  readonly centreLine: boolean;
  readonly thickness: number;
}

interface SurfaceDefinition {
  readonly id: string;
  readonly priority: number;
  readonly skin: WaySkin;
  readonly bounds: readonly [minX: number, maxX: number, minZ: number, maxZ: number];
  readonly way?: AstanaWay;
  readonly area?: AstanaArea;
  readonly deckBase?: number;
}

interface SurfaceCell {
  readonly key: string;
  readonly skin: WaySkin;
  readonly top: number;
  readonly target: "roads" | "paving";
}

function skinOf(way: AstanaWay): WaySkin {
  if (way.kind === "bridge" && way.forVehicles === false) {
    return {
      material: "stone",
      colours: [PROMENADE, PAVING_B],
      kerb: false,
      centreLine: false,
      thickness: 0.12,
    };
  }
  switch (way.kind) {
    case "roadway":
    case "bridge":
      return {
        material: "asphalt",
        colours: [ASPHALT, ASPHALT_WORN],
        kerb: true,
        centreLine: way.width >= 3.25,
        thickness: 0.14,
      };
    case "promenade":
      return {
        material: "stone",
        colours: [PROMENADE, PAVING_B],
        kerb: false,
        centreLine: false,
        thickness: 0.12,
      };
    case "pavement":
    case "approach":
      return {
        material: "stone",
        colours: [PAVING_A, PAVING_B],
        kerb: false,
        centreLine: false,
        thickness: 0.1,
      };
    default:
      return {
        material: "concrete",
        colours: ["#9b9a95", "#93928d"],
        kerb: false,
        centreLine: false,
        thickness: 0.1,
      };
  }
}

const AREA_SKIN: WaySkin = {
  material: "stone",
  colours: [PAVING_A, PAVING_B],
  kerb: false,
  centreLine: false,
  thickness: 0.12,
};

const PRIMARY_RESERVE_SKIN: WaySkin = {
  material: "stone",
  colours: ["#8d8f82", "#85887b"],
  kerb: false,
  centreLine: false,
  thickness: 0.115,
};

const PROTECTED_RESERVE_SKIN: WaySkin = {
  material: "stone",
  colours: ["#aaa28e", "#a09884"],
  kerb: false,
  centreLine: false,
  thickness: 0.115,
};

const SECONDARY_RESERVE_SKIN: WaySkin = {
  material: "stone",
  colours: ["#7f8278", "#777a70"],
  kerb: false,
  centreLine: false,
  thickness: 0.105,
};

const EXPERIMENTAL_RESERVE_SKIN: WaySkin = {
  material: "stone",
  colours: ["#707b80", "#687379"],
  kerb: false,
  centreLine: false,
  thickness: 0.12,
};

const BAITEREK_PALE_SKIN: WaySkin = {
  ...AREA_SKIN,
  colours: ["#ddd9cf", "#d4d0c7"],
};

const BAITEREK_WARM_SKIN: WaySkin = {
  ...AREA_SKIN,
  colours: ["#a47b68", "#996e5d"],
};

const BAITEREK_COOL_SKIN: WaySkin = {
  ...AREA_SKIN,
  colours: ["#cfcdc6", "#c7c5be"],
};

function skinOfArea(area: AstanaArea): WaySkin {
  switch (area.status) {
    case "protected-reserve":
      return PROTECTED_RESERVE_SKIN;
    case "primary-reserve":
      return PRIMARY_RESERVE_SKIN;
    case "secondary-reserve":
      return SECONDARY_RESERVE_SKIN;
    case "experimental-reserve":
      return EXPERIMENTAL_RESERVE_SKIN;
    default:
      return AREA_SKIN;
  }
}

function skinOfAreaAt(area: AstanaArea, x: number, z: number): WaySkin {
  if (area.surfacePattern !== "baiterek-radial") return skinOfArea(area);
  const dx = x - area.center[0];
  const dz = z - area.center[1];
  const radius = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx) - NURZHOL_PLAN_ROTATION;
  const period = Math.PI / 8;
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.floor(
    ((normalized + period / 2) % (Math.PI * 2)) / period,
  );
  const spokeAngle = Math.abs(
    ((normalized + period / 2) % period + period) % period - period / 2,
  );
  const onSpoke = radius > 6.1 && radius * spokeAngle < 0.24;
  const onRing = [7.1, 11.2, 15.45].some((ring) => Math.abs(radius - ring) < 0.26);
  if (onSpoke || onRing) return BAITEREK_WARM_SKIN;
  return sector % 2 === 0 ? BAITEREK_PALE_SKIN : BAITEREK_COOL_SKIN;
}

function wayPriority(way: AstanaWay): number {
  if (way.kind === "bridge" && way.forVehicles === false) return 0;
  if (way.kind === "bridge") return 1;
  if (way.kind === "roadway") return 2;
  if (way.kind === "ramp") return 3;
  if (way.kind === "approach" || way.kind === "pavement") return 4;
  if (way.kind === "promenade") return 5;
  return 6;
}

function wayBounds(way: AstanaWay): SurfaceDefinition["bounds"] {
  const xs = way.points.map((point) => point[0]);
  const zs = way.points.map((point) => point[1]);
  const margin = way.width + SURFACE_PITCH;
  return [
    Math.min(...xs) - margin,
    Math.max(...xs) + margin,
    Math.min(...zs) - margin,
    Math.max(...zs) + margin,
  ];
}

function areaBounds(area: AstanaArea): SurfaceDefinition["bounds"] {
  const radius = area.pavingRadius ?? [0, 0];
  const yaw = area.rotation ?? 0;
  const extentX = Math.abs(Math.cos(yaw)) * radius[0] + Math.abs(Math.sin(yaw)) * radius[1];
  const extentZ = Math.abs(Math.sin(yaw)) * radius[0] + Math.abs(Math.cos(yaw)) * radius[1];
  return [
    area.center[0] - extentX,
    area.center[0] + extentX,
    area.center[1] - extentZ,
    area.center[1] + extentZ,
  ];
}

function bridgeDeckBase(way: AstanaWay): number | undefined {
  if (way.kind !== "roadway" && way.kind !== "bridge") return undefined;
  let top = -Infinity;
  for (const [x, z] of way.points) {
    const ground = groundUnder(x, z);
    if (ground.kind === "land") top = Math.max(top, ground.top);
  }
  return top > -Infinity ? top : undefined;
}

const surfaceDefinitions: readonly SurfaceDefinition[] = [
  ...renderedAstanaWays.map((way) => ({
    id: way.id,
    priority: wayPriority(way),
    skin: skinOf(way),
    bounds: wayBounds(way),
    way,
    deckBase: bridgeDeckBase(way),
  })),
  ...astanaAreas
    .filter((area) => area.pavingRadius !== undefined && area.surfaceMode !== "direct")
    .map((area) => ({
      id: area.id,
      priority: 20,
      skin: skinOfArea(area),
      bounds: areaBounds(area),
      area,
    })),
].sort((left, right) => left.priority - right.priority);

// Точные габаритные плиты строятся одной повернутой деталью вне растра.
// Наземная плита поэтому вырезает под собой растровое мощение: иначе её угол
// снова ляжет почти в одной плоскости с набережной и вернёт рябь. Надречный
// Нур Алем остаётся исключением — его плита проходит над поверхностями.
// Точная плита владеет своим пятном независимо от того, стоит она на грунте
// или над руслом. Иначе под надречной пирамидой продолжает рисоваться растр
// набережной и две почти копланарные поверхности дают рябь.
const directGroundAreas = astanaAreas.filter(
  (area) => area.surfaceMode === "direct",
);

function insideBounds(
  x: number,
  z: number,
  [minX, maxX, minZ, maxZ]: SurfaceDefinition["bounds"],
): boolean {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

function insideArea(x: number, z: number, area: AstanaArea): boolean {
  const radius = area.pavingRadius;
  if (!radius) return false;
  const yaw = area.rotation ?? 0;
  const dx = x - area.center[0];
  const dz = z - area.center[1];
  const localX = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
  const localZ = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  if (area.shape === "ellipse") {
    return (localX / radius[0]) ** 2 + (localZ / radius[1]) ** 2 <= 1;
  }
  return Math.abs(localX) <= radius[0] && Math.abs(localZ) <= radius[1];
}

function insideDirectGroundClearance(x: number, z: number, area: AstanaArea): boolean {
  const radius = area.pavingRadius;
  if (!radius) return false;
  const yaw = area.rotation ?? 0;
  const dx = x - area.center[0];
  const dz = z - area.center[1];
  const localX = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
  const localZ = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  // Полудиагональ растровой клетки: вырезается вся клетка, а не только её
  // центр. Так край склеенного прямоугольника не может залезть под плиту.
  const clearance = SURFACE_PITCH / Math.SQRT2;
  if (area.shape === "ellipse") {
    return (localX / (radius[0] + clearance)) ** 2
      + (localZ / (radius[1] + clearance)) ** 2 <= 1;
  }
  return Math.abs(localX) <= radius[0] + clearance
    && Math.abs(localZ) <= radius[1] + clearance;
}

function contains(definition: SurfaceDefinition, x: number, z: number): boolean {
  if (!insideBounds(x, z, definition.bounds)) return false;
  if (definition.way) {
    return distanceToPolyline(x, z, definition.way.points) <= definition.way.width;
  }
  return definition.area ? insideArea(x, z, definition.area) : false;
}

function ownerAt(x: number, z: number): SurfaceDefinition | undefined {
  return surfaceDefinitions.find((definition) => contains(definition, x, z));
}

function cellAt(x: number, z: number): SurfaceCell | undefined {
  const ground = groundUnder(x, z);
  if (ground.kind === "outside") return undefined;
  if (directGroundAreas.some((area) => insideDirectGroundClearance(x, z, area))) {
    return undefined;
  }
  const owner = ownerAt(x, z);
  if (!owner) return undefined;
  const bridgeBase = owner.deckBase;
  const overValley = owner.way
    && (owner.way.kind === "roadway" || owner.way.kind === "bridge")
    && ground.kind !== "land"
    && bridgeBase !== undefined;
  const base = overValley ? bridgeBase : ground.top;
  // Низ покрытия точно касается грунта или мостовой отметки. Раньше плита
  // была на два сантиметра утоплена в основание, и решатель справедливо не
  // признавал такое пересечение опиранием.
  const skin = owner.area ? skinOfAreaAt(owner.area, x, z) : owner.skin;
  const top = base + skin.thickness;
  const target = skin.material === "stone" ? "paving" : "roads";
  const key = [
    target,
    skin.material,
    skin.colours.join(","),
    skin.thickness.toFixed(3),
    top.toFixed(3),
  ].join("|");
  return { key, skin, top, target };
}

function createOwnedSurface(roads: MutableGroup, paving: MutableGroup): void {
  const count = Math.round((SURFACE_LIMIT * 2) / SURFACE_PITCH);
  const cells: Array<SurfaceCell | undefined> = new Array(count * count);
  const used = new Uint8Array(count * count);
  const indexOf = (x: number, z: number) => z * count + x;

  for (let iz = 0; iz < count; iz += 1) {
    const z = -SURFACE_LIMIT + (iz + 0.5) * SURFACE_PITCH;
    for (let ix = 0; ix < count; ix += 1) {
      const x = -SURFACE_LIMIT + (ix + 0.5) * SURFACE_PITCH;
      cells[indexOf(ix, iz)] = cellAt(x, z);
    }
  }

  let rectangle = 0;
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const startIndex = indexOf(ix, iz);
      const cell = cells[startIndex];
      if (!cell || used[startIndex]) continue;

      let width = 1;
      while (ix + width < count) {
        const next = indexOf(ix + width, iz);
        if (used[next] || cells[next]?.key !== cell.key) break;
        width += 1;
      }

      let height = 1;
      row: while (iz + height < count) {
        for (let offset = 0; offset < width; offset += 1) {
          const next = indexOf(ix + offset, iz + height);
          if (used[next] || cells[next]?.key !== cell.key) break row;
        }
        height += 1;
      }

      for (let dz = 0; dz < height; dz += 1) {
        for (let dx = 0; dx < width; dx += 1) used[indexOf(ix + dx, iz + dz)] = 1;
      }

      const sizeX = width * SURFACE_PITCH;
      const sizeZ = height * SURFACE_PITCH;
      const x = -SURFACE_LIMIT + (ix + width / 2) * SURFACE_PITCH;
      const z = -SURFACE_LIMIT + (iz + height / 2) * SURFACE_PITCH;
      const target = cell.target === "roads" ? roads : paving;
      const supportTop = groundUnder(x, z).top;
      const supportHeight = Math.max(cell.skin.thickness, cell.top - supportTop);
      const renderCentreY = cell.top - cell.skin.thickness / 2;
      primitive(
        target,
        `owned:${rectangle}`,
        cell.skin.material,
        "groundTile",
        [x, cell.top - cell.skin.thickness / 2, z],
        [sizeX, cell.skin.thickness, sizeZ],
        cell.skin.colours[0],
        {
          bearingArea: sizeX * sizeZ,
          volume: sizeX * sizeZ * 0.05,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
          // У мостовой клетки это прокси непрерывной несущей плиты между
          // редкими видимыми опорами; у наземной совпадает с самой плитой.
          contactBoxes: [{
            position: [0, supportTop + supportHeight / 2 - renderCentreY, 0],
            size: [sizeX, supportHeight, sizeZ],
          }],
        },
      );
      rectangle += 1;
    }
  }
}

interface Link {
  readonly at: PlanPoint;
  readonly yaw: number;
  readonly length: number;
  readonly along: PlanPoint;
}

function walkPolyline(points: readonly PlanPoint[], step: number): readonly Link[] {
  const links: Link[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1];
    const [bx, bz] = points[index];
    const dx = bx - ax;
    const dz = bz - az;
    const span = Math.hypot(dx, dz);
    if (span < 0.01) continue;
    const count = Math.max(1, Math.round(span / step));
    const length = span / count;
    const along: PlanPoint = [dx / span, dz / span];
    const yaw = Math.atan2(-dz, dx);
    for (let piece = 0; piece < count; piece += 1) {
      const t = (piece + 0.5) / count;
      links.push({ at: [ax + dx * t, az + dz * t], yaw, length, along });
    }
  }
  return links;
}

function midpoint(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function addBeam(
  target: MutableGroup,
  id: string,
  from: SceneVector3,
  to: SceneVector3,
  diameter: number,
  colour = BRIDGE_STEEL,
): void {
  const chord: SceneVector3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(chord[0], chord[1], chord[2]);
  if (length < 0.02) return;
  const reference: SceneVector3 = Math.abs(chord[0]) < length * 0.8 ? [1, 0, 0] : [0, 0, 1];
  primitive(target, id, "steel", "cylinder", midpoint(from, to),
    [diameter, length, diameter], colour,
    { rotation: orient(reference, chord), bearsLoad: true, carriesAttachments: true,
      attachmentSupportMode: "cable",
      volume: Math.max(0.004, length * diameter * diameter * 0.6), sideAttachmentReach: 0.9 });
}

function pointOnLink(link: Link, distance: number, side: number): PlanPoint {
  const normal: PlanPoint = [-link.along[1], link.along[0]];
  return [
    link.at[0] + link.along[0] * distance + normal[0] * side,
    link.at[1] + link.along[1] * distance + normal[1] * side,
  ];
}

function anotherRoadCutsKerb(way: AstanaWay, x: number, z: number): boolean {
  return renderedAstanaWays.some((other) =>
    other !== way
    && (other.kind === "roadway" || other.kind === "bridge")
    && distanceToPolyline(x, z, other.points) < other.width + 0.7);
}

function createSmoothEdgeBand(
  roads: MutableGroup,
  way: AstanaWay,
  link: Link,
  index: number,
  surfaceTop: number,
): void {
  if (way.kind === "ramp" || way.kind === "yard") return;
  const asphalt = way.kind === "roadway" || (way.kind === "bridge" && way.forVehicles !== false);
  // Полуметровая сетка может выступить за математическую кромку максимум на
  // половину диагонали клетки (0.354 м). Метровая гладкая полоса перекрывает
  // этот запас целиком и не оставляет «пилы» на диагоналях и S-образном мосту.
  const width = asphalt ? 1.16 : 1.02;
  for (const side of [-1, 1] as const) {
    const offset = way.width * side;
    const [x, z] = pointOnLink(link, 0, offset);
    if (anotherRoadCutsKerb(way, x, z)) continue;
    const bandGround = groundUnder(x, z);
    if (bandGround.kind === "outside") continue;
    const visualHeight = asphalt ? 0.024 : 0.018;
    const renderY = surfaceTop + visualHeight / 2;
    const supportTop = bandGround.top;
    const structuralTop = renderY + visualHeight / 2;
    const supportHeight = Math.max(visualHeight, structuralTop - supportTop);
    primitive(roads, `${way.id}:edge-band:${side}:${index}`,
      asphalt ? "asphalt" : "stone", "panel",
      [x, renderY, z],
      [link.length, visualHeight, width],
      asphalt ? ASPHALT : PROMENADE,
      {
        rotation: [0, link.yaw, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.45,
        volume: link.length * width * 0.025,
        contactBoxes: [{
          position: [0, supportTop + supportHeight / 2 - renderY, 0],
          size: [link.length, supportHeight, width],
        }],
      });
  }
}

function createOpenBridgeRail(
  kerbs: MutableGroup,
  way: AstanaWay,
  link: Link,
  index: number,
  surfaceTop: number,
): void {
  for (const side of [-1, 1] as const) {
    // Цоколь стоит НА крайней полосе настила, а не висит снаружи от неё.
    // На кривом мосту хорды соседних секций расходятся сильнее прямой.
    // Сажаем цоколь на 45 см внутрь математической кромки: он остаётся у
    // края, но целиком опирается на настил даже в переломе оси.
    const offset = Math.max(0.2, way.width - 0.45) * side;
    const start2 = pointOnLink(link, -link.length / 2, offset);
    const end2 = pointOnLink(link, link.length / 2, offset);
    primitive(kerbs, `${way.id}:bridge-kerb:${side}:${index}`, "concrete", "stoneBlock",
      [(start2[0] + end2[0]) / 2, surfaceTop + 0.105, (start2[1] + end2[1]) / 2],
      [link.length, 0.21, 0.68], BRIDGE_CONCRETE,
      {
        rotation: [0, link.yaw, 0],
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "wall",
        sideAttachmentReach: 0.8,
        volume: link.length * 0.025,
      });

    addBeam(kerbs, `${way.id}:top-rail:${side}:${index}`,
      [start2[0], surfaceTop + 1.02, start2[1]],
      [end2[0], surfaceTop + 1.02, end2[1]], 0.075);
    addBeam(kerbs, `${way.id}:mid-rail:${side}:${index}`,
      [start2[0], surfaceTop + 0.58, start2[1]],
      [end2[0], surfaceTop + 0.58, end2[1]], 0.055, BRIDGE_STEEL_SHADE);

    for (const fraction of [-0.34, 0, 0.34]) {
      const post = pointOnLink(link, link.length * fraction, offset);
      addBeam(kerbs, `${way.id}:rail-post:${side}:${index}:${fraction}`,
        [post[0], surfaceTop + 0.1, post[1]],
        [post[0], surfaceTop + 1.04, post[1]], 0.065);
    }

  }
}

function createWayDetails(roads: MutableGroup, kerbs: MutableGroup): void {
  for (const way of renderedAstanaWays) {
    const skin = skinOf(way);
    const links = walkPolyline(way.points, DETAIL_LINK);
    const deckBase = bridgeDeckBase(way);
    for (const [index, link] of links.entries()) {
      const ground = groundUnder(link.at[0], link.at[1]);
      if (ground.kind === "outside") continue;
      const overValley = (way.kind === "roadway" || way.kind === "bridge")
        && ground.kind !== "land" && deckBase !== undefined;
      const base = overValley ? deckBase : ground.top;
      const surfaceTop = base + skin.thickness;

      createSmoothEdgeBand(roads, way, link, index, surfaceTop);

      if (way.id === "bridge-footbridge") continue;

      if (skin.centreLine && index % 2 === 0) {
        primitive(roads, `${way.id}:line:${index}`, "concrete", "panel",
          [link.at[0], surfaceTop + 0.002, link.at[1]],
          [link.length * 0.52, 0.012, 0.13], "#dedacd",
          { rotation: [0, link.yaw, 0], bearsLoad: false, volume: 0.01 });
      }

      if (overValley) {
        const height = base - ground.top;
        if (height > 0.25 && index % 4 === 2) {
          primitive(roads, `${way.id}:pier:${index}`, "concrete", "cylinder",
            [link.at[0], ground.top + height / 2, link.at[1]],
            [1.5, height, 1.5], BRIDGE_CONCRETE,
            { bearingArea: 3, volume: height * 0.8 });
        }
        createOpenBridgeRail(kerbs, way, link, index, surfaceTop);
        continue;
      }

      if (!skin.kerb) continue;
      for (const side of [-1, 1] as const) {
        const offset = (way.width + 0.14) * side;
        const [kx, kz] = pointOnLink(link, 0, offset);
        if (anotherRoadCutsKerb(way, kx, kz)) continue;
        const kerbGround = groundUnder(kx, kz);
        if (kerbGround.kind === "outside") continue;
        primitive(kerbs, `${way.id}:kerb:${side}:${index}`, "concrete", "stoneBlock",
          [kx, kerbGround.top + 0.11, kz], [link.length, 0.22, 0.24], KERB,
          { rotation: [0, link.yaw, 0], bearingArea: link.length * 0.24,
            volume: link.length * 0.04 });
      }
    }
  }
}

export function createSurface(
  roads: MutableGroup,
  kerbs: MutableGroup,
  paving: MutableGroup,
  atyrauShell: MutableGroup,
): void {
  createOwnedSurface(roads, paving);
  createWayDetails(roads, kerbs);
  createAtyrauBridge(roads, atyrauShell);
}

/** Занята ли точка единым покрытием — тот же владелец, что у геометрии. */
export function onPavedSurface(x: number, z: number): boolean {
  return ownerAt(x, z) !== undefined;
}
