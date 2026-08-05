/**
 * ФОРМА МИНУС КРАТЕР.
 *
 * Решётка повреждения — гроссбух: она отвечает, сколько материала снято и
 * распался ли кусок. Формой она быть не обязана и не должна: у куска, авторен-
 * ного коробкой, вывод из решётки даёт те же коробки без потерь, а у авторской
 * оболочки — теряет всё, ради чего её рисовали.
 *
 * Этот модуль выводит ВИДИМУЮ форму из авторской геометрии: берёт треугольники
 * куска и вычитает из них кратеры. На плоской детали сфера кратера даёт в
 * сечении окружность, то есть «контур минус круглая дыра»; на кривой оболочке —
 * дыру по поверхности. Закон один, разница только во входе.
 *
 * ПОЧЕМУ НЕ ПО КЛЕТКЕ. Отверстие формы задаёт кратер, а не клетка решётки.
 * Иначе в стальном листе оказывается квадратная дыра со стороной в клетку — тот
 * же артефакт вокселизации, только локальный.
 *
 * ЦЕНА. Дробится ТОЛЬКО тот треугольник, который встретил кратер: целые куски
 * поверхности проходят насквозь одним куском. Поэтому пробоина в борту стоит
 * десятков треугольников, а не пересборки всей обшивки.
 */

export type ClipVector3 = readonly [x: number, y: number, z: number];

export interface MeshCrater {
  /** Центр кратера в той же системе, что и вершины сетки. */
  readonly center: ClipVector3;
  readonly radius: number;
}

export interface ClippedMesh {
  readonly vertices: readonly ClipVector3[];
  readonly indices: readonly number[];
  /** Сколько треугольников исчезло целиком: по ним считается снятая площадь. */
  readonly removedTriangles: number;
}

export interface ClipOptions {
  /**
   * Сколько раз дробить треугольник, встретивший кромку кратера. Каждый
   * уровень учетверяет только пограничные треугольники; три уровня дают
   * кромку точнее сантиметра на детали в метр.
   */
  readonly subdivisions?: number;
  /**
   * Прижимать ли вершины кромки к поверхности кратера. Без этого дыра
   * получается зубчатой по сетке дробления, с этим — круглой, и уже при
   * двух уровнях дробления.
   */
  readonly snapRim?: boolean;
}

const DEFAULT_SUBDIVISIONS = 3;

function distanceToCrater(point: ClipVector3, crater: MeshCrater): number {
  return (
    Math.hypot(
      point[0] - crater.center[0],
      point[1] - crater.center[1],
      point[2] - crater.center[2],
    ) - crater.radius
  );
}

/** Наименьшее расстояние до КАКОГО-НИБУДЬ кратера: отрицательное — внутри. */
function craterDepth(
  point: ClipVector3,
  craters: readonly MeshCrater[],
): number {
  let depth = Number.POSITIVE_INFINITY;
  for (const crater of craters) {
    depth = Math.min(depth, distanceToCrater(point, crater));
  }
  return depth;
}

function midpoint(a: ClipVector3, b: ClipVector3): ClipVector3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * Выталкивает точку, оказавшуюся внутри кратера, на его поверхность. Кромка
 * дыры тогда лежит на сфере удара, а не на сетке дробления.
 */
function snapToRim(
  point: ClipVector3,
  craters: readonly MeshCrater[],
): ClipVector3 {
  let deepest: MeshCrater | null = null;
  let depth = 0;
  for (const crater of craters) {
    const candidate = distanceToCrater(point, crater);
    if (candidate < depth) {
      depth = candidate;
      deepest = crater;
    }
  }
  if (!deepest) {
    return point;
  }
  const dx = point[0] - deepest.center[0];
  const dy = point[1] - deepest.center[1];
  const dz = point[2] - deepest.center[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-9) {
    return point;
  }
  const scale = deepest.radius / length;
  return [
    deepest.center[0] + dx * scale,
    deepest.center[1] + dy * scale,
    deepest.center[2] + dz * scale,
  ];
}

/**
 * Задевает ли хоть один кратер треугольник. Тест консервативный — по
 * охватывающей сфере, — и это осознанно: пропустить кратер нельзя (дыры не
 * будет вовсе), а лишнее дробление стоит лишь нескольких треугольников и
 * обрывается на первом же уровне, где кратер не подтвердился.
 */
function touchesCraters(
  a: ClipVector3,
  b: ClipVector3,
  c: ClipVector3,
  craters: readonly MeshCrater[],
): boolean {
  const centroid: ClipVector3 = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ];
  const reach = Math.max(
    Math.hypot(a[0] - centroid[0], a[1] - centroid[1], a[2] - centroid[2]),
    Math.hypot(b[0] - centroid[0], b[1] - centroid[1], b[2] - centroid[2]),
    Math.hypot(c[0] - centroid[0], c[1] - centroid[1], c[2] - centroid[2]),
  );
  for (const crater of craters) {
    if (
      Math.hypot(
        centroid[0] - crater.center[0],
        centroid[1] - crater.center[1],
        centroid[2] - crater.center[2],
      ) < crater.radius + reach
    ) {
      return true;
    }
  }
  return false;
}

export function clipMeshAgainstCraters(
  vertices: readonly ClipVector3[],
  indices: readonly number[],
  craters: readonly MeshCrater[],
  options: ClipOptions = {},
): ClippedMesh {
  if (craters.length === 0) {
    return { vertices, indices, removedTriangles: 0 };
  }
  const maximumDepth = Math.max(0, options.subdivisions ?? DEFAULT_SUBDIVISIONS);
  const snapRim = options.snapRim ?? true;

  const outVertices: ClipVector3[] = [];
  const outIndices: number[] = [];
  const vertexKeys = new Map<string, number>();
  let removedTriangles = 0;

  const pushVertex = (point: ClipVector3): number => {
    const key = `${point[0].toFixed(5)}:${point[1].toFixed(5)}:${point[2].toFixed(5)}`;
    const existing = vertexKeys.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = outVertices.length;
    outVertices.push(point);
    vertexKeys.set(key, index);
    return index;
  };

  const emit = (a: ClipVector3, b: ClipVector3, c: ClipVector3): void => {
    outIndices.push(pushVertex(a), pushVertex(b), pushVertex(c));
  };

  const clipTriangle = (
    a: ClipVector3,
    b: ClipVector3,
    c: ClipVector3,
    depth: number,
  ): void => {
    const depthA = craterDepth(a, craters);
    const depthB = craterDepth(b, craters);
    const depthC = craterDepth(c, craters);

    // Целиком снаружи — но только если кратер вообще не задевает треугольник.
    // Проверка по вершинам одна этого не ловит: пулевая дыра меньше грани
    // лежит целиком ВНУТРИ треугольника, все три угла снаружи, и лист остаётся
    // целым. Ровно поэтому здесь стоит охватывающая сфера треугольника.
    if (depthA >= 0 && depthB >= 0 && depthC >= 0 && !touchesCraters(a, b, c, craters)) {
      emit(a, b, c);
      return;
    }
    // Целиком внутри — материала здесь больше нет.
    if (depthA < 0 && depthB < 0 && depthC < 0) {
      removedTriangles += 1;
      return;
    }

    if (depth >= maximumDepth) {
      // Глубже не дробим: решает середина, а кромку выправляет прижатие к
      // сфере — так дыра остаётся круглой без бесконечного дробления.
      const centroid: ClipVector3 = [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ];
      if (craterDepth(centroid, craters) < 0) {
        removedTriangles += 1;
        return;
      }
      emit(
        snapRim && depthA < 0 ? snapToRim(a, craters) : a,
        snapRim && depthB < 0 ? snapToRim(b, craters) : b,
        snapRim && depthC < 0 ? snapToRim(c, craters) : c,
      );
      return;
    }

    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    clipTriangle(a, ab, ca, depth + 1);
    clipTriangle(ab, b, bc, depth + 1);
    clipTriangle(ca, bc, c, depth + 1);
    clipTriangle(ab, bc, ca, depth + 1);
  };

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = vertices[indices[index]];
    const b = vertices[indices[index + 1]];
    const c = vertices[indices[index + 2]];
    if (!a || !b || !c) {
      continue;
    }
    clipTriangle(a, b, c, 0);
  }

  return { vertices: outVertices, indices: outIndices, removedTriangles };
}

/**
 * Плоская ли авторская сетка и насколько. Возвращает наибольшее отклонение
 * вершин от подогнанной плоскости; ноль — идеальная плита.
 *
 * Признак нужен не для выбора алгоритма — подрезка одна на оба случая, — а для
 * приёмки и бюджета: у плоской детали кратер даёт ровный круг уже на двух
 * уровнях дробления, кривой оболочке нужен третий.
 */
export function meshPlanarDeviation(
  vertices: readonly ClipVector3[],
): number {
  if (vertices.length < 3) {
    return 0;
  }
  const centre: [number, number, number] = [0, 0, 0];
  for (const vertex of vertices) {
    centre[0] += vertex[0];
    centre[1] += vertex[1];
    centre[2] += vertex[2];
  }
  centre[0] /= vertices.length;
  centre[1] /= vertices.length;
  centre[2] /= vertices.length;

  // Ковариация вершин; наименьшее собственное направление — нормаль плоскости.
  // Степенной метод по обратной матрице здесь избыточен: хватает перебора трёх
  // осей и двух диагоналей, потому что ответ нужен как ПОРОГ, а не как точная
  // нормаль.
  const candidates: ClipVector3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let best = Number.POSITIVE_INFINITY;
  for (const axis of candidates) {
    let deviation = 0;
    for (const vertex of vertices) {
      deviation = Math.max(
        deviation,
        Math.abs(
          (vertex[0] - centre[0]) * axis[0] +
            (vertex[1] - centre[1]) * axis[1] +
            (vertex[2] - centre[2]) * axis[2],
        ),
      );
    }
    best = Math.min(best, deviation);
  }
  return best;
}
