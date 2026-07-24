import type { BreakablePieceDefinition } from "../game/destructionScene.ts";

/**
 * Правила уместности мебели и их автоматическая проверка.
 *
 * Мебель — не декорация, а жилой предмет: у каждого вида есть профиль
 * «где ему место». Аудит гоняется юнит-тестом по готовой сцене и падает,
 * если шкаф загородил окно, кровать оказалась на улице или тумба встала
 * поперёк дверного полотна. Правила геометрические и не требуют разметки
 * сцены руками: окна и двери распознаются по самим деталям.
 *
 * Конвенция идентификаторов: каждая деталь мебели носит id вида
 * `furn:<kind>:<instance>:<piece>` — по нему аудит собирает детали в
 * экземпляры и находит профиль вида. Легаси-мебель хрущёвок
 * (`hru:furniture:*`) маппится на профили отдельной таблицей.
 */

export type FurnitureZone = "indoor" | "outdoor" | "any";

export interface FurniturePlacementProfile {
  /** Где предмету место. */
  readonly zone: FurnitureZone;
  /**
   * Детали выше этой высоты (м, от пола предмета) считаются глухой массой,
   * которой нельзя вставать перед окном. Столешница (0.76) окно не гасит,
   * шкаф (1.8) — гасит. undefined — предмет окна не заслоняет в принципе.
   */
  readonly opaqueAbove?: number;
  /** Нельзя вставать в створе дверного полотна. */
  readonly keepDoorwayClear?: boolean;
}

export const furniturePlacementProfiles: Record<string, FurniturePlacementProfile> = {
  "old-table": { zone: "any", keepDoorwayClear: true },
  "writer-desk": { zone: "indoor", keepDoorwayClear: true },
  "stone-table": { zone: "outdoor" },
  "trestle-table": { zone: "any" },
  "slat-chair": { zone: "any" },
  "worn-chair": { zone: "any" },
  "panel-chair": { zone: "any" },
  // Спинки кровати — ажур из прутьев, окно они не «гасят»; но кровать не
  // должна перекрывать дверь и не живёт под открытым небом.
  "iron-bed": { zone: "indoor", keepDoorwayClear: true },
  "slat-bed": { zone: "indoor", keepDoorwayClear: true },
  "painted-table": { zone: "any" },
  // Диваны — низкая мягкая масса: дверь не перекрывать, окно им можно.
  "soviet-sofa": { zone: "indoor", keepDoorwayClear: true },
  "chesterfield": { zone: "indoor", keepDoorwayClear: true },
  "channel-sofa": { zone: "indoor", keepDoorwayClear: true },
  "channel-armchair": { zone: "indoor" },
  "corner-sofa": { zone: "indoor", keepDoorwayClear: true },
  // Стенка — глухая стена мебели: не к окну и не в дверной створ.
  "wall-unit": { zone: "indoor", opaqueAbove: 0.4, keepDoorwayClear: true },
  // Техника: плиты низкие, холодильники — глухая масса выше подоконника.
  "vintage-stove": { zone: "indoor", keepDoorwayClear: true },
  "gas-stove": { zone: "indoor", keepDoorwayClear: true },
  "fridge-moskva": { zone: "indoor", opaqueAbove: 0.4, keepDoorwayClear: true },
  "fridge-ribbed": { zone: "indoor", opaqueAbove: 0.4, keepDoorwayClear: true },
  "fridge-rusty": { zone: "outdoor" },
  "tv-soviet": { zone: "indoor" },
  "tv-sharp": { zone: "indoor" },
  "kettle": { zone: "any" },
  "stew-pot": { zone: "any" },
};

/** Легаси-кубики хрущёвок: тот же аудит, профиль по имени детали. */
const legacyProfiles: Record<string, FurniturePlacementProfile> = {
  fridge: { zone: "indoor", opaqueAbove: 0.4, keepDoorwayClear: true },
  wardrobe: { zone: "indoor", opaqueAbove: 0.4, keepDoorwayClear: true },
  counter: { zone: "indoor" },
  bed: { zone: "indoor", keepDoorwayClear: true },
  table: { zone: "indoor" },
};

export interface Aabb {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface FurnitureInstance {
  readonly id: string;
  readonly kind: string;
  readonly profile: FurniturePlacementProfile;
  readonly bounds: Aabb;
  /** Верх самой высокой глухой детали (см. opaqueAbove). */
  readonly opaqueTop: number;
  readonly floorY: number;
}

export interface WindowPane {
  readonly id: string;
  readonly bounds: Aabb;
  /** Ось нормали окна: "x" — стекло в плоскости YZ, "z" — в плоскости XY. */
  readonly axis: "x" | "z";
}

export interface DoorLeaf {
  readonly id: string;
  readonly bounds: Aabb;
  readonly axis: "x" | "z";
}

export interface BuildingFootprint {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PlacementViolation {
  readonly furnitureId: string;
  readonly rule: "blocks-window" | "blocks-doorway" | "wrong-zone";
  readonly detail: string;
}

function pieceAabb(piece: BreakablePieceDefinition): Aabb {
  // Осевая оценка: у повёрнутых деталей берём диагональ по горизонтали.
  // Для аудита уместности сантиметровая точность не нужна.
  const yaw = piece.rotation?.[1] ?? 0;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const halfX = (piece.size[0] * cos + piece.size[2] * sin) / 2;
  const halfZ = (piece.size[0] * sin + piece.size[2] * cos) / 2;
  return {
    min: [
      piece.position[0] - halfX,
      piece.position[1] - piece.size[1] / 2,
      piece.position[2] - halfZ,
    ],
    max: [
      piece.position[0] + halfX,
      piece.position[1] + piece.size[1] / 2,
      piece.position[2] + halfZ,
    ],
  };
}

function unionAabb(a: Aabb, b: Aabb): Aabb {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

function overlap1d(
  minA: number, maxA: number, minB: number, maxB: number,
): number {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

/** Экземпляры мебели: `furn:<kind>:<instance>:*` + легаси-кубики хрущёвок. */
export function collectFurnitureInstances(
  pieces: readonly BreakablePieceDefinition[],
): FurnitureInstance[] {
  interface Accumulator {
    kind: string;
    profile: FurniturePlacementProfile;
    bounds: Aabb;
    opaqueTop: number;
    floorY: number;
  }
  const byInstance = new Map<string, Accumulator>();

  for (const piece of pieces) {
    let instanceId: string | undefined;
    let kind: string | undefined;
    let profile: FurniturePlacementProfile | undefined;

    const furnMatch = piece.id.match(/(?:^|:)furn:([a-z-]+):([^:]+)/);
    if (furnMatch) {
      kind = furnMatch[1];
      profile = furniturePlacementProfiles[kind];
      instanceId = piece.id.slice(0, furnMatch.index! + furnMatch[0].length);
      if (!profile) {
        throw new Error(
          `furniture kind "${kind}" (${piece.id}) has no placement profile`,
        );
      }
    } else {
      const legacyMatch = piece.id.match(
        /(?:^|:)(hru:furniture:\d+):(\d+):([a-z]+)/,
      );
      if (legacyMatch) {
        kind = legacyMatch[3];
        profile = legacyProfiles[kind];
        if (!profile) {
          continue;
        }
        instanceId = `${legacyMatch[1]}:${legacyMatch[2]}:${legacyMatch[3]}:${piece.id}`;
      }
    }
    if (!instanceId || !kind || !profile) {
      continue;
    }

    const bounds = pieceAabb(piece);
    const existing = byInstance.get(instanceId);
    if (!existing) {
      byInstance.set(instanceId, {
        kind,
        profile,
        bounds,
        opaqueTop: bounds.max[1],
        floorY: bounds.min[1],
      });
    } else {
      existing.bounds = unionAabb(existing.bounds, bounds);
      existing.opaqueTop = Math.max(existing.opaqueTop, bounds.max[1]);
      existing.floorY = Math.min(existing.floorY, bounds.min[1]);
    }
  }

  return [...byInstance.entries()].map(([id, entry]) => ({
    id,
    kind: entry.kind,
    profile: entry.profile,
    bounds: entry.bounds,
    opaqueTop: entry.opaqueTop,
    floorY: entry.floorY,
  }));
}

/** Окна сцены: вертикальные стеклянные полотна заметного размера. */
export function collectWindowPanes(
  pieces: readonly BreakablePieceDefinition[],
): WindowPane[] {
  const panes: WindowPane[] = [];
  for (const piece of pieces) {
    if (piece.material !== "glass" || piece.shape !== "glassPane") {
      continue;
    }
    // Зеркала шкафов и стёкла витрин — стекло МЕБЕЛИ, а не окна здания.
    if (/(?:^|:)furn:/.test(piece.id)) {
      continue;
    }
    const [sx, sy, sz] = piece.size;
    if (sy < 0.5) {
      continue; // форточки, плафоны, лампы на подоконниках
    }
    const thin = Math.min(sx, sz);
    const wide = Math.max(sx, sz);
    if (thin > 0.12 || wide < 0.35) {
      continue;
    }
    panes.push({
      id: piece.id,
      bounds: pieceAabb(piece),
      axis: sx < sz ? "x" : "z",
    });
  }
  return panes;
}

/** Дверные полотна: деревянные, на петлях, в человеческий рост. */
export function collectDoorLeaves(
  pieces: readonly BreakablePieceDefinition[],
): DoorLeaf[] {
  const leaves: DoorLeaf[] = [];
  for (const piece of pieces) {
    if (!piece.hinge || piece.material !== "wood" || piece.size[1] < 1.4) {
      continue;
    }
    const [nx, , nz] = piece.hinge.normal;
    leaves.push({
      id: piece.id,
      bounds: pieceAabb(piece),
      axis: Math.abs(nx) > Math.abs(nz) ? "x" : "z",
    });
  }
  return leaves;
}

export interface PlacementAuditOptions {
  readonly footprints: readonly BuildingFootprint[];
  /** Дистанция (м) от плоскости окна, в которой глухая мебель его гасит. */
  readonly windowClearance?: number;
  /** Створ двери: глубина свободной зоны перед полотном. */
  readonly doorClearance?: number;
}

export function auditFurniturePlacement(
  pieces: readonly BreakablePieceDefinition[],
  options: PlacementAuditOptions,
): PlacementViolation[] {
  const windowClearance = options.windowClearance ?? 0.9;
  const doorClearance = options.doorClearance ?? 0.65;
  const furniture = collectFurnitureInstances(pieces);
  const windows = collectWindowPanes(pieces);
  const doors = collectDoorLeaves(pieces);
  const violations: PlacementViolation[] = [];

  const insideFootprint = (x: number, z: number): BuildingFootprint | undefined =>
    options.footprints.find(
      (fp) => x >= fp.minX && x <= fp.maxX && z >= fp.minZ && z <= fp.maxZ,
    );

  for (const item of furniture) {
    const cx = (item.bounds.min[0] + item.bounds.max[0]) / 2;
    const cz = (item.bounds.min[2] + item.bounds.max[2]) / 2;

    // --- Зона ---------------------------------------------------------
    const building = insideFootprint(cx, cz);
    if (item.profile.zone === "indoor" && !building) {
      violations.push({
        furnitureId: item.id,
        rule: "wrong-zone",
        detail: `indoor furniture stands outside any building at (${cx.toFixed(1)}, ${cz.toFixed(1)})`,
      });
    } else if (item.profile.zone === "outdoor" && building) {
      violations.push({
        furnitureId: item.id,
        rule: "wrong-zone",
        detail: `outdoor furniture stands inside ${building.id}`,
      });
    }

    // --- Окна ---------------------------------------------------------
    if (item.profile.opaqueAbove !== undefined) {
      const opaqueHeight = item.opaqueTop - item.floorY;
      if (opaqueHeight > item.profile.opaqueAbove) {
        for (const pane of windows) {
          const lateral = pane.axis === "x" ? 2 : 0;
          const normal = pane.axis === "x" ? 0 : 2;
          const lateralOverlap = overlap1d(
            item.bounds.min[lateral], item.bounds.max[lateral],
            pane.bounds.min[lateral], pane.bounds.max[lateral],
          );
          const paneWidth =
            pane.bounds.max[lateral] - pane.bounds.min[lateral];
          if (lateralOverlap < Math.min(0.3, paneWidth * 0.4)) {
            continue;
          }
          const gap = Math.max(
            pane.bounds.min[normal] - item.bounds.max[normal],
            item.bounds.min[normal] - pane.bounds.max[normal],
          );
          if (gap > windowClearance) {
            continue;
          }
          // Глухая масса должна реально доставать до остекления.
          if (item.opaqueTop < pane.bounds.min[1] + 0.15) {
            continue;
          }
          // Этажность: мебель этажом ниже окно не гасит.
          if (pane.bounds.min[1] - item.floorY > 2.4 || item.floorY - pane.bounds.max[1] > 0) {
            continue;
          }
          violations.push({
            furnitureId: item.id,
            rule: "blocks-window",
            detail: `opaque furniture within ${windowClearance}m of window ${pane.id}`,
          });
          break;
        }
      }
    }

    // --- Двери --------------------------------------------------------
    if (item.profile.keepDoorwayClear) {
      for (const door of doors) {
        const lateral = door.axis === "x" ? 2 : 0;
        const normal = door.axis === "x" ? 0 : 2;
        const lateralOverlap = overlap1d(
          item.bounds.min[lateral], item.bounds.max[lateral],
          door.bounds.min[lateral], door.bounds.max[lateral],
        );
        if (lateralOverlap < 0.25) {
          continue;
        }
        const gap = Math.max(
          door.bounds.min[normal] - item.bounds.max[normal],
          item.bounds.min[normal] - door.bounds.max[normal],
        );
        if (gap > doorClearance) {
          continue;
        }
        if (Math.abs(item.floorY - door.bounds.min[1]) > 1.2) {
          continue; // другой этаж
        }
        violations.push({
          furnitureId: item.id,
          rule: "blocks-doorway",
          detail: `furniture within ${doorClearance}m of door leaf ${door.id}`,
        });
        break;
      }
    }
  }
  return violations;
}
