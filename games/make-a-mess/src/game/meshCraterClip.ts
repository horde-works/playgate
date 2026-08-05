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
  /** Нормали и цвета переносятся, если были у исходной сетки. */
  readonly normals?: readonly ClipVector3[];
  readonly colors?: readonly ClipVector3[];
  /** Сколько треугольников исчезло целиком: по ним считается снятая площадь. */
  readonly removedTriangles: number;
}

export interface ClipAttributes {
  /**
   * Пер-вершинные данные исходной сетки. Их обязательно вести через дробление:
   * авторские нормали задают гладкость кривой оболочки, а вершинные цвета —
   * её раскраску. Потерять их значит получить дыру ценой фасеточного,
   * одноцветного корпуса.
   */
  readonly normals?: readonly ClipVector3[];
  readonly colors?: readonly ClipVector3[];
}

export interface ClipOptions extends ClipAttributes {
  /**
   * ТОРЕЦ ДЫРЫ. Панели авторятся поверхностями нулевой толщины: 4.5 см доски
   * живут в паспорте куска, кормят массу и решётку повреждения, но геометрией
   * не являются. Пока дыр не было, этого никто не видел — торец панели просто
   * неоткуда было показать. Стоит прорезать дыру, и лист читается бумагой.
   *
   * Поэтому кромка дыры получает настоящий борт: полоса в толщину материала,
   * симметричная относительно поверхности — авторская сетка описывает
   * СРЕДИННУЮ плоскость доски, ровно как её понимают и масса, и решётка.
   * Наружный контур детали борта не получает: там торец закрыт соседями, а
   * лишние треугольники по всему периметру стоили бы куда дороже.
   */
  readonly rimThickness?: number;
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

/** Вершина вместе со своими пер-вершинными данными. */
interface ClipPoint {
  readonly position: ClipVector3;
  readonly normal?: ClipVector3;
  readonly color?: ClipVector3;
}

function mixPoints(a: ClipPoint, b: ClipPoint): ClipPoint {
  return {
    position: midpoint(a.position, b.position),
    normal: a.normal && b.normal ? midpoint(a.normal, b.normal) : undefined,
    color: a.color && b.color ? midpoint(a.color, b.color) : undefined,
  };
}

export function clipMeshAgainstCraters(
  vertices: readonly ClipVector3[],
  indices: readonly number[],
  craters: readonly MeshCrater[],
  options: ClipOptions = {},
): ClippedMesh {
  if (craters.length === 0) {
    return {
      vertices,
      indices,
      normals: options.normals,
      colors: options.colors,
      removedTriangles: 0,
    };
  }
  const maximumDepth = Math.max(0, options.subdivisions ?? DEFAULT_SUBDIVISIONS);
  const snapRim = options.snapRim ?? true;

  const outVertices: ClipVector3[] = [];
  const outNormals: ClipVector3[] = [];
  const outColors: ClipVector3[] = [];
  const outIndices: number[] = [];
  const vertexKeys = new Map<string, number>();
  let removedTriangles = 0;

  const pushVertex = (point: ClipPoint): number => {
    const key = `${point.position[0].toFixed(5)}:${point.position[1].toFixed(5)}:${point.position[2].toFixed(5)}`;
    const existing = vertexKeys.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = outVertices.length;
    outVertices.push(point.position);
    if (point.normal) outNormals.push(point.normal);
    if (point.color) outColors.push(point.color);
    vertexKeys.set(key, index);
    return index;
  };

  const emit = (a: ClipPoint, b: ClipPoint, c: ClipPoint): void => {
    outIndices.push(pushVertex(a), pushVertex(b), pushVertex(c));
  };

  const clipTriangle = (
    a: ClipPoint,
    b: ClipPoint,
    c: ClipPoint,
    depth: number,
  ): void => {
    const depthA = craterDepth(a.position, craters);
    const depthB = craterDepth(b.position, craters);
    const depthC = craterDepth(c.position, craters);

    // Целиком снаружи — но только если кратер вообще не задевает треугольник.
    // Проверка по вершинам одна этого не ловит: пулевая дыра меньше грани
    // лежит целиком ВНУТРИ треугольника, все три угла снаружи, и лист остаётся
    // целым. Ровно поэтому здесь стоит охватывающая сфера треугольника.
    if (
      depthA >= 0 &&
      depthB >= 0 &&
      depthC >= 0 &&
      !touchesCraters(a.position, b.position, c.position, craters)
    ) {
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
        (a.position[0] + b.position[0] + c.position[0]) / 3,
        (a.position[1] + b.position[1] + c.position[1]) / 3,
        (a.position[2] + b.position[2] + c.position[2]) / 3,
      ];
      if (craterDepth(centroid, craters) < 0) {
        removedTriangles += 1;
        return;
      }
      const rim = (point: ClipPoint, distance: number): ClipPoint =>
        snapRim && distance < 0
          ? { ...point, position: snapToRim(point.position, craters) }
          : point;
      emit(rim(a, depthA), rim(b, depthB), rim(c, depthC));
      return;
    }

    const ab = mixPoints(a, b);
    const bc = mixPoints(b, c);
    const ca = mixPoints(c, a);
    clipTriangle(a, ab, ca, depth + 1);
    clipTriangle(ab, b, bc, depth + 1);
    clipTriangle(ca, bc, c, depth + 1);
    clipTriangle(ab, bc, ca, depth + 1);
  };

  const pointAt = (index: number): ClipPoint => ({
    position: vertices[index],
    normal: options.normals?.[index],
    color: options.colors?.[index],
  });

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = vertices[indices[index]];
    const b = vertices[indices[index + 1]];
    const c = vertices[indices[index + 2]];
    if (!a || !b || !c) {
      continue;
    }
    clipTriangle(
      pointAt(indices[index]),
      pointAt(indices[index + 1]),
      pointAt(indices[index + 2]),
      0,
    );
  }

  const rimThickness = options.rimThickness ?? 0;
  if (rimThickness > 0) {
    buildHoleRim(
      outVertices,
      outIndices,
      outNormals,
      outColors,
      craters,
      rimThickness,
      Boolean(options.normals),
      Boolean(options.colors),
    );
  }

  return {
    vertices: outVertices,
    indices: outIndices,
    // Пер-вершинные данные отдаются только полным набором: неполный набор
    // рендер обязан отвергнуть, а не подставить нули.
    normals:
      options.normals && outNormals.length === outVertices.length
        ? outNormals
        : undefined,
    colors:
      options.colors && outColors.length === outVertices.length
        ? outColors
        : undefined,
    removedTriangles,
  };
}

/**
 * Достраивает борт дыры. Кромкой считается ребро, которое осталось у ОДНОГО
 * треугольника и обеими вершинами лежит на сфере кратера: наружный контур
 * детали этому не отвечает и борта не получает.
 *
 * Полоса ставится симметрично поверхности, потому что авторская сетка
 * описывает срединную плоскость материала — так же её понимают и масса куска,
 * и его решётка повреждения. Тогда доска в 4.5 см и выглядит доской в 4.5 см.
 */
function buildHoleRim(
  vertices: ClipVector3[],
  indices: number[],
  normals: ClipVector3[],
  colors: ClipVector3[],
  craters: readonly MeshCrater[],
  thickness: number,
  carriesNormals: boolean,
  carriesColors: boolean,
): void {
  // Кромка дыры — не окружность из вершин: прижимаются к сфере только те
  // вершины, что оказались ВНУТРИ, а их соседи остаются там, где были. Поэтому
  // граница дыры идёт зигзагом между радиусом кратера и следующим узлом сетки,
  // и признак «лежит точно на сфере» её не находит. Годится окрестность
  // кратера: она заведомо накрывает зигзаг и заведомо не достаёт до наружного
  // контура детали, если только дыра не съела сам контур — а там борт уместен.
  const rimNeighbourhood = (point: ClipVector3): boolean => {
    for (const crater of craters) {
      const slack = crater.radius * 0.6 + thickness;
      if (distanceToCrater(point, crater) <= slack) {
        return true;
      }
    }
    return false;
  };

  // Счётчик использований ребра и нормаль треугольника, который его породил.
  const edgeUse = new Map<string, number>();
  const edgeNormal = new Map<string, ClipVector3>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const triangleCount = indices.length;
  for (let index = 0; index + 2 < triangleCount; index += 3) {
    const [ia, ib, ic] = [indices[index], indices[index + 1], indices[index + 2]];
    const a = vertices[ia];
    const b = vertices[ib];
    const c = vertices[ic];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const face: ClipVector3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...face);
    const unit: ClipVector3 =
      length > 1e-12
        ? [face[0] / length, face[1] / length, face[2] / length]
        : [0, 1, 0];
    for (const [first, second] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      const id = key(first, second);
      edgeUse.set(id, (edgeUse.get(id) ?? 0) + 1);
      if (!edgeNormal.has(id)) {
        edgeNormal.set(id, unit);
      }
    }
  }

  const rimEdges: (readonly [number, number])[] = [];
  const seen = new Set<string>();
  for (let index = 0; index + 2 < triangleCount; index += 3) {
    const [ia, ib, ic] = [indices[index], indices[index + 1], indices[index + 2]];
    for (const [first, second] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ] as const) {
      const id = key(first, second);
      if (edgeUse.get(id) !== 1 || seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (
        !rimNeighbourhood(vertices[first]) ||
        !rimNeighbourhood(vertices[second])
      ) {
        continue;
      }
      rimEdges.push([first, second]);
    }
  }

  const half = thickness / 2;
  for (const [first, second] of rimEdges) {
    const normal = edgeNormal.get(key(first, second)) ?? [0, 1, 0];
    const offset = (index: number, sign: number): number => {
      const source = vertices[index];
      vertices.push([
        source[0] + normal[0] * half * sign,
        source[1] + normal[1] * half * sign,
        source[2] + normal[2] * half * sign,
      ]);
      if (carriesNormals) {
        // Борт смотрит вдоль поверхности, а не вдоль неё же наружу: иначе он
        // ловит свет как сама панель и торец не читается.
        normals.push(normal);
      }
      if (carriesColors) {
        colors.push(colors[index] ?? [1, 1, 1]);
      }
      return vertices.length - 1;
    };
    const frontA = offset(first, 1);
    const frontB = offset(second, 1);
    const backA = offset(first, -1);
    const backB = offset(second, -1);
    indices.push(frontA, frontB, backB, frontA, backB, backA);
  }
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

/**
 * Подрезает авторскую сетку куска его кратерами и возвращает её в том же виде,
 * в каком её ждёт рендер: вершины нормированы на габарит куска, толщина борта
 * взята из паспорта.
 *
 * ДЫРЯВЫЙ КУСОК ВСЕГДА ДВУСТОРОННИЙ. Замкнутая оболочка авторится
 * односторонней, и это правильно: внутрь неё не заглянешь, изнанку рисовать
 * незачем, она стоит fill rate. Но дыра ровно это и меняет — через неё видно
 * изнанку дальней стенки, а её нет, и постройка читается прозрачной насквозь.
 * Колпак мельницы (`cap-hull`, 36 треугольников, ни одного граничного ребра)
 * ловит это первым.
 */
export function clipPieceVisualMesh(
  piece: {
    readonly size: readonly [number, number, number];
    readonly visualMesh?: {
      readonly vertices: readonly ClipVector3[];
      readonly indices: readonly number[];
      readonly normals?: readonly ClipVector3[];
      readonly colors?: readonly ClipVector3[];
      readonly doubleSided?: boolean;
    };
    readonly voxelization?: { readonly thickness?: number };
  },
  craters: readonly MeshCrater[],
): {
  readonly vertices: readonly ClipVector3[];
  readonly indices: readonly number[];
  readonly normals?: readonly ClipVector3[];
  readonly colors?: readonly ClipVector3[];
  readonly doubleSided: boolean;
} | null {
  const mesh = piece.visualMesh;
  if (!mesh) {
    return null;
  }
  const scaled = mesh.vertices.map(
    ([x, y, z]) =>
      [x * piece.size[0], y * piece.size[1], z * piece.size[2]] as const,
  );
  const clipped = clipMeshAgainstCraters(scaled, mesh.indices, craters, {
    normals: mesh.normals,
    colors: mesh.colors,
    // Толщина берётся ИЗ ПАСПОРТА куска — того же числа, которым живут его
    // масса и решётка повреждения.
    rimThickness: piece.voxelization?.thickness ?? 0,
  });
  // Дыра съела деталь целиком — показывать нечего, пусть работает прежний путь.
  if (clipped.indices.length === 0) {
    return null;
  }
  return {
    vertices: clipped.vertices.map(
      ([x, y, z]) =>
        [x / piece.size[0], y / piece.size[1], z / piece.size[2]] as const,
    ),
    indices: [...clipped.indices],
    normals: clipped.normals ? [...clipped.normals] : undefined,
    colors: clipped.colors ? [...clipped.colors] : undefined,
    doubleSided: true,
  };
}
