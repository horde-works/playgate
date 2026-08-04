/**
 * ГЕОМЕТРИЧЕСКАЯ ПРОВЕРКА КРЕПЛЕНИЯ: КАСАЕТСЯ ЛИ КУСОК ХОТЬ ЧЕГО-НИБУДЬ.
 *
 * Зачем отдельный измеритель. Структурный решатель судит опору по паспортным
 * допускам — `sideAttachmentReach` и `maximumVerticalGap`. Это правильно для
 * ЕГО задачи: он отвечает на вопрос «рухнет ли», и болтовое соединение там
 * честно объявляется числом, потому что компактный контактный проксик
 * настоящей гайки не описывает. Но у этого допуска есть обратная сторона: если
 * его поднять до полутора метров, решатель начнёт считать опёртым что угодно —
 * и деталь, висящая в кадре в пятнадцати сантиметрах от борта, пройдёт все
 * проверки. Так и случилось: по проекту допуск 0.14…0.5 м, а у боевого
 * гексакоптера стояло 1.62 / 2.15 / 2.6.
 *
 * Поэтому здесь меряется ДРУГОЕ и меряется независимо: расстояние между
 * поверхностями, без единого паспортного числа. Вопрос ровно один — «видно ли
 * щель». Ответ не зависит ни от материала, ни от роли куска, ни от того, что о
 * себе объявил автор.
 *
 * Метод — занятость вокселей. Поверхность каждого куска засевается точками с
 * шагом мельче вокселя, точки превращаются в ключи сетки; кусок закреплён,
 * если хоть один его воксель совпал с чужим или коснулся чужого по 26-связности.
 * Это ровно то разрешение, на котором щель становится видна, и оно не зависит
 * от того, коробка перед нами, тело вращения или произвольный меш.
 */

const DEFAULT_VOXEL = 0.03;

function rotationMatrix(rotation) {
  const [rx, ry, rz] = rotation ?? [0, 0, 0];
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  // Порядок XYZ — тот же, что у three.Euler по умолчанию, которым сцена и
  // ставит куски. Своя матрица нужна, чтобы измеритель не зависел от рендера.
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

/** Треугольники куска в мировых осях: меш — свой, примитив — грани ящика. */
function worldTriangles(piece) {
  const m = rotationMatrix(piece.rotation);
  const [sx, sy, sz] = piece.size;
  const place = (local) => [
    piece.position[0] + m[0][0] * local[0] + m[0][1] * local[1] + m[0][2] * local[2],
    piece.position[1] + m[1][0] * local[0] + m[1][1] * local[1] + m[1][2] * local[2],
    piece.position[2] + m[2][0] * local[0] + m[2][1] * local[1] + m[2][2] * local[2],
  ];
  const mesh = piece.visualMesh;
  if (mesh?.vertices && mesh?.indices) {
    // Вершины меша лежат в ДОЛЯХ собственного ящика куска.
    const placed = mesh.vertices.map((vertex) =>
      place([vertex[0] * sx, vertex[1] * sy, vertex[2] * sz]),
    );
    const triangles = [];
    for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
      triangles.push([
        placed[mesh.indices[index]],
        placed[mesh.indices[index + 1]],
        placed[mesh.indices[index + 2]],
      ]);
    }
    return triangles;
  }
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corner = [
    place([-hx, -hy, -hz]), place([hx, -hy, -hz]),
    place([hx, hy, -hz]), place([-hx, hy, -hz]),
    place([-hx, -hy, hz]), place([hx, -hy, hz]),
    place([hx, hy, hz]), place([-hx, hy, hz]),
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7],
  ];
  return faces.flatMap(([a, b, c, d]) => [
    [corner[a], corner[b], corner[c]],
    [corner[a], corner[c], corner[d]],
  ]);
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Ключи вокселей, которые накрывает поверхность куска. */
function occupancy(piece, voxel) {
  const keys = new Set();
  const step = voxel * 0.5;
  for (const [a, b, c] of worldTriangles(piece)) {
    const ab = distance(a, b);
    const ac = distance(a, c);
    const rows = Math.max(1, Math.ceil(Math.max(ab, ac) / step));
    for (let row = 0; row <= rows; row += 1) {
      const u = row / rows;
      for (let column = 0; column <= rows - row; column += 1) {
        const v = (rows - row) === 0 ? 0 : column / rows;
        const w = 1 - u - v;
        if (w < -1e-9) continue;
        const x = a[0] * w + b[0] * u + c[0] * v;
        const y = a[1] * w + b[1] * u + c[1] * v;
        const z = a[2] * w + b[2] * u + c[2] * v;
        keys.add(
          `${Math.floor(x / voxel)},${Math.floor(y / voxel)},${Math.floor(z / voxel)}`,
        );
      }
    }
  }
  return keys;
}

/**
 * Какие куски не касаются НИЧЕГО.
 *
 * `ignore` — для кусков, которым отдельно стоять положено физически: отвалы,
 * снаряды, уже отделённые обломки. Пустой по умолчанию: правило общее.
 */
export function unattachedPieces(pieces, { voxel = DEFAULT_VOXEL, ignore = () => false } = {}) {
  const live = pieces.filter((piece) => !ignore(piece));
  const cells = live.map((piece) => occupancy(piece, voxel));
  // Обратный указатель: воксель → кто его занимает. Один проход вместо
  // попарного перебора, иначе четыреста кусков превращаются в часы.
  const owners = new Map();
  cells.forEach((keys, index) => {
    for (const key of keys) {
      const current = owners.get(key);
      if (current) current.push(index);
      else owners.set(key, [index]);
    }
  });
  const touches = live.map(() => false);
  cells.forEach((keys, index) => {
    if (touches[index]) return;
    for (const key of keys) {
      const [kx, ky, kz] = key.split(",").map(Number);
      for (let dx = -1; dx <= 1 && !touches[index]; dx += 1) {
        for (let dy = -1; dy <= 1 && !touches[index]; dy += 1) {
          for (let dz = -1; dz <= 1 && !touches[index]; dz += 1) {
            const neighbours = owners.get(`${kx + dx},${ky + dy},${kz + dz}`);
            if (!neighbours) continue;
            for (const other of neighbours) {
              if (other !== index) {
                touches[index] = true;
                break;
              }
            }
          }
        }
      }
      if (touches[index]) break;
    }
  });
  return live
    .filter((_, index) => !touches[index])
    .map((piece) => ({
      id: piece.id,
      position: piece.position,
      sideAttachmentReach: piece.sideAttachmentReach,
    }));
}

/**
 * Насколько далеко кусок от ближайшей чужой поверхности, в метрах.
 * Дороже, чем `unattachedPieces`, поэтому зовётся только для разбора уже
 * найденных виновных — чтобы в отчёте стояло число, а не «висит».
 */
export function surfaceGap(piece, others, { voxel = DEFAULT_VOXEL } = {}) {
  const own = [...occupancy(piece, voxel)].map((key) =>
    key.split(",").map((value) => (Number(value) + 0.5) * voxel),
  );
  let best = Infinity;
  for (const other of others) {
    if (other.id === piece.id) continue;
    for (const key of occupancy(other, voxel)) {
      const target = key.split(",").map((value) => (Number(value) + 0.5) * voxel);
      for (const point of own) {
        const value = distance(point, target);
        if (value < best) best = value;
      }
    }
  }
  return best;
}
