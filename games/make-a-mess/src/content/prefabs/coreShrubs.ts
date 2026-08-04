import type { VegetationVisualKind } from "../../game/destructionScene.ts";
import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";

/**
 * Кусты общего каталога.
 *
 * КУСТ — ЭТО ВИД, А НЕ «ЗЕЛЁНЫЙ КОМ». До этого весь мир — от берега голландской
 * канавы до степной полосы под Астаной и вересковой пустоши викингов — зарастал
 * одним и тем же комом `kind: "shrub"` двух-трёх оттенков. Среда узнаётся по
 * подлеску не меньше, чем по деревьям: у канавы это бузина и ежевика, на
 * северном берегу — можжевельник и вереск, во дворе — сирень и снежноягодник,
 * в степной полосе — карагана с жимолостью.
 *
 * Различает их СИЛУЭТ, а не цвет: высота и её отношение к ширине, число и
 * наклон стволиков, форма массы (шар, купол, мат, дуги, метёлка). Цвет —
 * последний слой, а не первый.
 *
 * Тело у куста ОДНО (кусты многочисленны: пояс Астаны сажает семьдесят штук,
 * опушка города — под сотню). Всё богатство даёт рендер по `vegetationVisual`.
 */

export type ShrubPiece = ScenePrefabPieceDefinition;

export interface ShrubPassport {
  /** Что это в природе — для авторов сцен, а не для кода. */
  readonly species: string;
  /** Высота куста, м. */
  readonly height: readonly [number, number];
  /** Ширина в долях высоты. */
  readonly spread: readonly [number, number];
  /** Палитра листвы/хвои: тень, обычный тон, солнечная сторона. */
  readonly palette: readonly string[];
  /** Доля кустов вида, которая цветёт или краснеет (0 — никогда). */
  readonly accentShare: number;
  /** Цвет цветения/осеннего пятна. */
  readonly accent?: string;
}

/**
 * Паспорта сняты по обычным для этих ландшафтов видам: бузина и ежевика
 * голландской канавы, можжевельник и вереск норвежского берега, сирень и
 * снежноягодник советского двора, карагана и жимолость степной полосы.
 */
export const SHRUB_PASSPORTS: Readonly<
  Record<VegetationVisualKind, ShrubPassport>
> = {
  shrub: {
    species: "Сирень, снежноягодник — плотный округлый куст двора",
    height: [1.4, 2.6],
    spread: [0.9, 1.25],
    palette: ["#3a5430", "#44603a", "#4e6c3f", "#365029"],
    accentShare: 0.22,
    accent: "#7d6f96",
  },
  hedge: {
    species: "Стриженая изгородь: кизильник, бирючина",
    height: [0.9, 1.5],
    spread: [1.3, 2.2],
    palette: ["#34502f", "#3b5834", "#2f4a2b"],
    accentShare: 0,
  },
  thicket: {
    species: "Бузина, ива-куст, боярышник — многоствольная заросль берега",
    height: [2.2, 3.6],
    spread: [0.75, 1.05],
    palette: ["#35492b", "#3e5533", "#48603a", "#2f4327"],
    accentShare: 0.3,
    accent: "#8d8f6a",
  },
  needle: {
    species: "Можжевельник — тёмная хвойная подушка северного берега",
    height: [0.7, 2.2],
    spread: [0.8, 1.4],
    palette: ["#2a3d31", "#243629", "#33473a", "#2d4335"],
    accentShare: 0,
  },
  heath: {
    species: "Вереск и черника — низкий мат пустоши",
    height: [0.18, 0.5],
    spread: [2.2, 3.8],
    palette: ["#4a4f33", "#535737", "#414a2f", "#5a5b3d"],
    accentShare: 0.45,
    accent: "#7c5a7e",
  },
  cane: {
    species: "Ежевика, шиповник — дуги побегов по краю",
    height: [1.0, 1.8],
    spread: [1.2, 1.9],
    palette: ["#3f5a34", "#496339", "#37502e"],
    accentShare: 0.25,
    accent: "#8a4438",
  },
  steppe: {
    species: "Карагана, жимолость татарская — мелколистный степной куст",
    height: [1.2, 2.4],
    spread: [0.95, 1.4],
    palette: ["#66774c", "#6f8055", "#5c6c44", "#74855c"],
    accentShare: 0.2,
    accent: "#9aa06a",
  },
  sedge: {
    species: "Осока уреза — пучок жёстких листьев",
    height: [0.45, 1.0],
    spread: [0.5, 0.85],
    palette: ["#5b6b44", "#52633e", "#63734b"],
    accentShare: 0.3,
    accent: "#8f8a55",
  },
};

function rand(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export interface ShrubOptions {
  readonly seed?: number;
  readonly scale?: number;
  /** Явная высота, м. Иначе берётся из паспорта вида. */
  readonly height?: number;
  readonly bearsLoad?: boolean;
}

/**
 * Один куст указанного вида. Тело — коробка листвы; форму, стволики и
 * плотность рисует `TreeVisuals` по `vegetationVisual.kind`.
 */
export function propShrub(
  kind: VegetationVisualKind,
  options: ShrubOptions = {},
): ShrubPiece {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const passport = SHRUB_PASSPORTS[kind];
  const height =
    (options.height ??
      passport.height[0] +
        rand(seed, 11) * (passport.height[1] - passport.height[0])) * s;
  const spread =
    passport.spread[0] +
    rand(seed, 12) * (passport.spread[1] - passport.spread[0]);
  const width = height * spread;
  const palette = passport.palette;
  const flowering =
    passport.accent !== undefined && rand(seed, 13) < passport.accentShare;
  return {
    id: `shrub:${kind}:${seed}`,
    material: "foliage",
    shape: "groundTile",
    position: [0, height / 2, 0],
    rotation: [
      (rand(seed, 14) - 0.5) * 0.12,
      rand(seed, 15) * Math.PI,
      (rand(seed, 16) - 0.5) * 0.12,
    ],
    size: [width, height, width * (0.82 + rand(seed, 17) * 0.3)],
    color: flowering
      ? passport.accent!
      : palette[Math.floor(rand(seed, 18) * palette.length)],
    bearsLoad: options.bearsLoad ?? false,
    vegetationVisual: { kind, seed },
  };
}

/** Цвет листвы вида по сиду — для сцен, которые строят куст своим примитивом. */
export function shrubTone(kind: VegetationVisualKind, seed: number): string {
  const passport = SHRUB_PASSPORTS[kind];
  return passport.accent !== undefined && rand(seed, 13) < passport.accentShare
    ? passport.accent
    : passport.palette[Math.floor(rand(seed, 18) * passport.palette.length)];
}

/** Габарит куста вида по сиду: [ширина, высота] в метрах. */
export function shrubExtent(
  kind: VegetationVisualKind,
  seed: number,
  scale = 1,
): readonly [number, number] {
  const passport = SHRUB_PASSPORTS[kind];
  const height =
    (passport.height[0] +
      rand(seed, 11) * (passport.height[1] - passport.height[0])) * scale;
  const spread =
    passport.spread[0] +
    rand(seed, 12) * (passport.spread[1] - passport.spread[0]);
  return [height * spread, height];
}
