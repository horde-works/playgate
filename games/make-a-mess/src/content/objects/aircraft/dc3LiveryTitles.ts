/**
 * ЛИВРЕЯ «CROSSTOWN AIRWAYS»: ЛЕНТА ТИТУЛОВ НАД ИЛЛЮМИНАТОРАМИ.
 *
 * Паспорт — docs/dc-3/livery-crosstown-p01.md. Краска не режет обшивку и не
 * перекраивает принятую панелизацию: носитель — тонкая лента-накладка по
 * прецеденту накладки входа, повторяющая лофт на 4.5 мм снаружи. Видимой
 * ленты в кадре нет — материал `dc3-livery-titles` вырубает её по альфе, и
 * остаются только буквы; между ними видна настоящая обшивка позади.
 *
 * Пояс держится ниже y = 1.10 не из осторожности, а по закону face-fit:
 * ветка раскладки UV выбирается по `abs(normal.x) > 0.5`, и вершина ленты,
 * у которой нормаль завалилась к короне сильнее 60°, рвёт текст. Тест
 * восстанавливает нормали из готовых вершин и держит этот гейт.
 */

import type {
  ObjectLabPart,
  ObjectPoint,
  ObjectTriangle,
} from "../dutchWindmills/objectModel.ts";
import { dc3AirframeSurface } from "./dc3BlockoutObject.ts";

export const DC3_LIVERY_BAND = {
  /** Низ пояса: верх обвязки окна 0.755 плюс 45 мм чистого поля. */
  yBottom: 0.8,
  /** Верх пояса: гейт face-fit `n.x > 0.5` держится с запасом до 1.10. */
  yTop: 1.1,
  /** Корма: кормовой проём двери −3.85 ± 0.38 не задет. */
  zAft: -1.95,
  /** Нос: носовой проём 4.72 ± 0.38 не задет. */
  zFore: 2.55,
  /** Наружная поверхность ленты над лофтом: выше шейдерных заклёпок. */
  offset: 0.0045,
  /** Толщина ленты: жесть красочного слоя, вокселизация shell. */
  thickness: 0.003,
} as const;

/** Высота капители и базовая линия — для генератора текстуры и тестов. */
export const DC3_LIVERY_CAP_HEIGHT = 0.23;
export const DC3_LIVERY_BASELINE_Y = 0.835;
export const DC3_LIVERY_TITLE_TEXT = "CROSSTOWN AIRWAYS";
/** Тёмно-синяя эмаль начала 60-х; цвет живёт на куске, не в текстуре. */
export const DC3_LIVERY_TITLE_COLOR = "#1e3255";

export const DC3_LIVERY_GROUP = "livery-titles";

const Z_STEP = 0.45;
const Y_ROWS = 5;

type Station = ReturnType<typeof dc3AirframeSurface.fuselage.at>;

function stationAt(z: number): Station {
  return (
    dc3AirframeSurface.fuselage.stations.find(
      (station) => Math.abs(station.z - z) < 1e-9,
    ) ?? dc3AirframeSurface.fuselage.at(z)
  );
}

/** Точка лофта на высоте y и её наружная нормаль в плоскости сечения. */
function loftAtHeight(
  z: number,
  y: number,
  side: 1 | -1,
): { readonly point: ObjectPoint; readonly normal: ObjectPoint } {
  const station = stationAt(z);
  const centreY = (station.crown + station.keel) / 2;
  const halfHeight = (station.crown - station.keel) / 2;
  const unit = Math.max(-1, Math.min(1, (y - centreY) / halfHeight));
  const angle = side > 0 ? Math.asin(unit) : Math.PI - Math.asin(unit);
  const point = dc3AirframeSurface.fuselage.pointAt(station, angle);
  const normal: ObjectPoint = [
    point[0] / (station.halfWidth * station.halfWidth),
    (point[1] - centreY) / (halfHeight * halfHeight),
    0,
  ];
  const length = Math.hypot(normal[0], normal[1]) || 1;
  return { point, normal: [normal[0] / length, normal[1] / length, 0] };
}

function bandRows(): readonly number[] {
  const rows: number[] = [];
  const span = DC3_LIVERY_BAND.zFore - DC3_LIVERY_BAND.zAft;
  const steps = Math.max(2, Math.round(span / Z_STEP));
  for (let step = 0; step <= steps; step += 1) {
    rows.push(DC3_LIVERY_BAND.zAft + (span * step) / steps);
  }
  for (const station of dc3AirframeSurface.fuselage.stations) {
    if (
      station.z > DC3_LIVERY_BAND.zAft + 1e-9 &&
      station.z < DC3_LIVERY_BAND.zFore - 1e-9
    ) {
      rows.push(station.z);
    }
  }
  return [...rows]
    .sort((a, b) => a - b)
    .filter((value, index, list) => index === 0 || value - list[index - 1] > 1e-9);
}

/**
 * Замкнутая лента: наружная оболочка, внутренняя на толщину ближе к лофту и
 * кромка по периметру. Нормали заданы явно — все вершины несут секционную
 * наружную нормаль, чтобы ветка face-fit не переключалась на кромке.
 */
function buildRibbon(side: 1 | -1): ObjectLabPart {
  const rows = bandRows();
  const ys = Array.from(
    { length: Y_ROWS },
    (_, index) =>
      DC3_LIVERY_BAND.yBottom +
      ((DC3_LIVERY_BAND.yTop - DC3_LIVERY_BAND.yBottom) * index) / (Y_ROWS - 1),
  );
  const outer: ObjectPoint[] = [];
  const inner: ObjectPoint[] = [];
  const normals: ObjectPoint[] = [];
  for (const z of rows) {
    for (const y of ys) {
      const { point, normal } = loftAtHeight(z, y, side);
      outer.push([
        point[0] + normal[0] * DC3_LIVERY_BAND.offset,
        point[1] + normal[1] * DC3_LIVERY_BAND.offset,
        point[2],
      ]);
      inner.push([
        point[0] + normal[0] * (DC3_LIVERY_BAND.offset - DC3_LIVERY_BAND.thickness),
        point[1] + normal[1] * (DC3_LIVERY_BAND.offset - DC3_LIVERY_BAND.thickness),
        point[2],
      ]);
      normals.push(normal);
    }
  }
  const columnCount = ys.length;
  const rowCount = rows.length;
  const bodyVertices: readonly ObjectPoint[] = [...outer, ...inner];
  const vertexIndex = (shell: 0 | 1, row: number, column: number): number =>
    shell * rowCount * columnCount + row * columnCount + column;
  const triangles: ObjectTriangle[] = [];
  /** Треугольник с навивкой под заданную наружную сторону — обе стороны борта
   * и все шесть семейств граней ориентируются одним правилом, без ручных
   * флагов зеркальности. */
  const orient = (a: number, b: number, c: number, want: ObjectPoint): void => {
    const va = bodyVertices[a];
    const vb = bodyVertices[b];
    const vc = bodyVertices[c];
    const ab: ObjectPoint = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const ac: ObjectPoint = [vc[0] - va[0], vc[1] - va[1], vc[2] - va[2]];
    const cross: ObjectPoint = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const facing = cross[0] * want[0] + cross[1] * want[1] + cross[2] * want[2];
    triangles.push(facing >= 0 ? [a, b, c] : [a, c, b]);
  };
  const quad = (a: number, b: number, c: number, d: number, want: ObjectPoint): void => {
    orient(a, b, c, want);
    orient(a, c, d, want);
  };
  const sectionNormalAt = (row: number, column: number): ObjectPoint =>
    normals[row * columnCount + column];
  for (let row = 0; row + 1 < rowCount; row += 1) {
    for (let column = 0; column + 1 < columnCount; column += 1) {
      const out = sectionNormalAt(row, column);
      quad(
        vertexIndex(0, row, column),
        vertexIndex(0, row + 1, column),
        vertexIndex(0, row + 1, column + 1),
        vertexIndex(0, row, column + 1),
        out,
      );
      quad(
        vertexIndex(1, row, column),
        vertexIndex(1, row + 1, column),
        vertexIndex(1, row + 1, column + 1),
        vertexIndex(1, row, column + 1),
        [-out[0], -out[1], -out[2]],
      );
    }
  }
  // Кромка: низ, верх и оба торца.
  const top = columnCount - 1;
  const last = rowCount - 1;
  for (let row = 0; row + 1 < rowCount; row += 1) {
    quad(
      vertexIndex(0, row, 0),
      vertexIndex(1, row, 0),
      vertexIndex(1, row + 1, 0),
      vertexIndex(0, row + 1, 0),
      [0, -1, 0],
    );
    quad(
      vertexIndex(0, row, top),
      vertexIndex(1, row, top),
      vertexIndex(1, row + 1, top),
      vertexIndex(0, row + 1, top),
      [0, 1, 0],
    );
  }
  for (let column = 0; column + 1 < columnCount; column += 1) {
    quad(
      vertexIndex(0, 0, column),
      vertexIndex(1, 0, column),
      vertexIndex(1, 0, column + 1),
      vertexIndex(0, 0, column + 1),
      [0, 0, -1],
    );
    quad(
      vertexIndex(0, last, column),
      vertexIndex(1, last, column),
      vertexIndex(1, last, column + 1),
      vertexIndex(0, last, column + 1),
      [0, 0, 1],
    );
  }
  const sit = dc3AirframeSurface.bodyToWorld;
  const area =
    (DC3_LIVERY_BAND.zFore - DC3_LIVERY_BAND.zAft) *
    (DC3_LIVERY_BAND.yTop - DC3_LIVERY_BAND.yBottom);
  return {
    kind: "mesh",
    id: `livery-title-${side > 0 ? "right" : "left"}`,
    group: DC3_LIVERY_GROUP,
    material: "paint-light",
    vertices: [...outer, ...inner].map((vertex) => sit(vertex)),
    // Явные нормали: наружная секционная на обеих оболочках. Кромок и
    // изнанки в кадре нет (кромка 3 мм, изнанка прижата к обшивке), а
    // стабильная ветка face-fit важнее их честной светотени.
    normals: [...normals, ...normals].map((normal) => {
      const placed = sit(normal);
      const origin = sit([0, 0, 0]);
      const world: ObjectPoint = [
        placed[0] - origin[0],
        placed[1] - origin[1],
        placed[2] - origin[2],
      ];
      const length = Math.hypot(...world) || 1;
      return [world[0] / length, world[1] / length, world[2] / length];
    }),
    triangles,
    plateThickness: DC3_LIVERY_BAND.thickness,
    volume: area * DC3_LIVERY_BAND.thickness,
  };
}

export const dc3LiveryTitleParts: readonly ObjectLabPart[] = [
  buildRibbon(1),
  buildRibbon(-1),
];
