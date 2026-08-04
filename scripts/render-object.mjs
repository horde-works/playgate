#!/usr/bin/env node --experimental-strip-types
/**
 * PNG объекта БЕЗ браузера и без сборки мира.
 *
 * Зачем: приёмка формы требует одинаковых ракурсов, а игровые кадры для этого
 * дороги и капризны — надо поднять dev-сервер, дождаться сцены, попасть камерой,
 * и всё это ломается, если соседний мир не компилируется. Этому скрипту нужен
 * только список кусков: он сам растеризует их ортографической камерой с
 * z-буфером и пишет PNG вручную (zlib + IHDR/IDAT/IEND).
 *
 * Рисует ТО ЖЕ, что видит игрок у растительности: деревья и кусты проходят
 * через `buildTreeVisuals` — ту же чистую сборку инстансов, которой пользуется
 * `TreeVisuals`. Прочие куски рисуются своими примитивами (бокс, цилиндр,
 * сфера, панель).
 *
 * Примеры:
 *   node --experimental-strip-types scripts/render-object.mjs \
 *     --tree pine --seed 71 --view side --out /tmp/pine.png
 *   node --experimental-strip-types scripts/render-object.mjs \
 *     --shrub needle --seed 17 --view three-quarter --out /tmp/juniper.png
 *   node --experimental-strip-types scripts/render-object.mjs \
 *     --module games/make-a-mess/src/content/prefabs/coreFlora.ts \
 *     --export propOak --seed 5 --view front --out /tmp/oak.png
 *
 * Ракурсы: side (сбоку), front, top (сверху), three-quarter, silhouette
 * (плоский чёрный силуэт — сравнивается с фото первым).
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Matrix4, Vector3 } from "three";
import { buildTreeVisuals } from "../games/make-a-mess/src/game/treeVisualInstances.ts";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ""), process.argv[index + 1]);
}
const option = (name, fallback) => args.get(name) ?? fallback;

const WIDTH = Number(option("width", 900));
const HEIGHT = Number(option("height", 900));
const VIEW = option("view", "side");
const SEED = Number(option("seed", 71));
const SCALE = Number(option("scale", 1));
const OUT = option("out", "/tmp/object.png");

// ── куски ────────────────────────────────────────────────────────────────────

async function loadPieces() {
  if (args.has("tree")) {
    const flora = await import(
      "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
    );
    const builder = {
      oak: flora.propOak,
      birch: flora.propBirch,
      pine: flora.propPine,
      willow: flora.propPollardWillow,
    }[option("tree")];
    if (!builder) {
      throw new Error(`неизвестная порода: ${option("tree")}`);
    }
    return builder({ seed: SEED, scale: SCALE });
  }
  if (args.has("shrub")) {
    const shrubs = await import(
      "../games/make-a-mess/src/content/prefabs/coreShrubs.ts"
    );
    return [shrubs.propShrub(option("shrub"), { seed: SEED, scale: SCALE })];
  }
  const modulePath = option("module");
  if (!modulePath) {
    throw new Error("нужен --tree, --shrub или --module с --export");
  }
  const loaded = await import(pathToFileURL(resolve(modulePath)).href);
  const value = loaded[option("export", "default")];
  if (typeof value === "function") {
    return value({ seed: SEED, scale: SCALE });
  }
  return Array.isArray(value) ? value : value.pieces;
}

// ── геометрия ────────────────────────────────────────────────────────────────

const BOX = [
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
];
const BOX_FACES = [
  [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
  [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7],
  [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2],
];

/** Труба/конус: `taper` — во сколько вершина у́же основания. */
function tubeMesh(segments, taper) {
  const vertices = [];
  const faces = [];
  for (let ring = 0; ring < 2; ring += 1) {
    const y = ring === 0 ? -0.5 : 0.5;
    const radius = 0.5 * (ring === 0 ? 1 : taper);
    for (let step = 0; step < segments; step += 1) {
      const angle = (step / segments) * Math.PI * 2;
      vertices.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    }
  }
  for (let step = 0; step < segments; step += 1) {
    const next = (step + 1) % segments;
    faces.push([step, next, segments + next], [step, segments + next, segments + step]);
  }
  const capBottom = vertices.push([0, -0.5, 0]) - 1;
  const capTop = vertices.push([0, 0.5, 0]) - 1;
  for (let step = 0; step < segments; step += 1) {
    const next = (step + 1) % segments;
    faces.push([capBottom, next, step], [capTop, segments + step, segments + next]);
  }
  return { vertices, faces };
}

function sphereMesh(rings, segments) {
  const vertices = [];
  const faces = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    for (let step = 0; step <= segments; step += 1) {
      const theta = (step / segments) * Math.PI * 2;
      vertices.push([
        Math.sin(phi) * Math.cos(theta) * 0.5,
        Math.cos(phi) * 0.5,
        Math.sin(phi) * Math.sin(theta) * 0.5,
      ]);
    }
  }
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let step = 0; step < segments; step += 1) {
      const a = ring * stride + step;
      faces.push([a, a + stride, a + 1], [a + 1, a + stride, a + stride + 1]);
    }
  }
  return { vertices, faces };
}

const TUBE = tubeMesh(10, 1);
const CONE = tubeMesh(10, 0.44);
const SPHERE = sphereMesh(7, 12);

// ── сцена из инстансов ───────────────────────────────────────────────────────

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function pieceMatrix(piece) {
  const matrix = new Matrix4();
  const rotation = piece.rotation ?? [0, 0, 0];
  matrix.makeRotationFromEuler({ x: rotation[0], y: rotation[1], z: rotation[2], order: "XYZ", isEuler: true });
  matrix.scale(new Vector3(...piece.size));
  matrix.setPosition(new Vector3(...piece.position));
  return matrix;
}

/** Куски → рисуемые тела (меш + матрица + цвет). */
function collectBodies(rawPieces) {
  // Куски приходят из префаба «как есть» (`trunk`, `whip:0`, `whip:0:leaf:0`),
  // а `treeVisualRootId` собирает дерево по ПРЕФИКСУ сцены: без него каждый
  // кусок оказывается отдельным деревом, и ива теряет листву (её рукава ищут
  // хлыст в своей же группе). Ставим общий префикс, как это делает компиляция.
  const pieces = rawPieces.map((piece) => ({ ...piece, id: `object:${piece.id}` }));
  const bodies = [];
  const visual = buildTreeVisuals(pieces);
  const drawn = new Set();

  const push = (mesh, matrix, color) => bodies.push({ mesh, matrix, color: hexToRgb(color) });

  for (const instance of [...visual.wood, ...visual.roots]) {
    drawn.add(instance.sourceId);
    push(instance.taper && instance.taper < 0.95 ? CONE : TUBE, instance.matrix, `#${instance.color.getHexString()}`);
  }
  for (const instance of visual.lumps) {
    drawn.add(instance.sourceId);
    push(SPHERE, instance.matrix, `#${instance.color.getHexString()}`);
  }
  for (const instance of [...visual.foliage, ...visual.conifer]) {
    drawn.add(instance.sourceId);
    push(SPHERE, instance.matrix, `#${instance.color.getHexString()}`);
  }
  for (const piece of pieces) {
    if (drawn.has(piece.id) || piece.treeVisual || piece.vegetationVisual) {
      continue;
    }
    const mesh = piece.shape === "cylinder" ? TUBE : piece.shape === "sphere" ? SPHERE : BOX;
    push(mesh === BOX ? { vertices: BOX, faces: BOX_FACES } : mesh, pieceMatrix(piece), piece.color ?? "#888888");
  }
  return bodies;
}

// ── растеризация ─────────────────────────────────────────────────────────────

const VIEWS = {
  side: [1, 0, 0],
  front: [0, 0, 1],
  top: [0, 1, 0],
  "three-quarter": [0.72, 0.42, 0.55],
  silhouette: [1, 0, 0],
};

function render(bodies) {
  const direction = new Vector3(...(VIEWS[VIEW] ?? VIEWS.side)).normalize();
  const up = Math.abs(direction.y) > 0.94 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(up, direction).normalize();
  const camUp = new Vector3().crossVectors(direction, right).normalize();

  const points = [];
  for (const body of bodies) {
    for (const vertex of body.mesh.vertices) {
      points.push(new Vector3(...vertex).applyMatrix4(body.matrix));
    }
  }
  if (points.length === 0) {
    throw new Error("нечего рисовать");
  }
  const project = (point) => [point.dot(right), point.dot(camUp), point.dot(direction)];
  const projected = points.map(project);
  const minX = Math.min(...projected.map((p) => p[0]));
  const maxX = Math.max(...projected.map((p) => p[0]));
  const minY = Math.min(...projected.map((p) => p[1]));
  const maxY = Math.max(...projected.map((p) => p[1]));
  const span = Math.max(maxX - minX, maxY - minY) * 1.08;
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3).fill(VIEW === "silhouette" ? 255 : 232);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
  const light = new Vector3(0.45, 0.8, 0.4).normalize();

  for (const body of bodies) {
    const world = body.mesh.vertices.map((vertex) =>
      new Vector3(...vertex).applyMatrix4(body.matrix),
    );
    for (const face of body.mesh.faces) {
      const [a, b, c] = face.map((index) => world[index]);
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      if (normal.lengthSq() < 1e-12) {
        continue;
      }
      normal.normalize();
      const shade = VIEW === "silhouette"
        ? 0
        : 0.32 + Math.max(0, normal.dot(light)) * 0.68;
      const screen = [a, b, c].map((point) => {
        const [px, py, pz] = project(point);
        return [
          ((px - centreX) / span + 0.5) * WIDTH,
          (0.5 - (py - centreY) / span) * HEIGHT,
          pz,
        ];
      });
      const minPX = Math.max(0, Math.floor(Math.min(...screen.map((p) => p[0]))));
      const maxPX = Math.min(WIDTH - 1, Math.ceil(Math.max(...screen.map((p) => p[0]))));
      const minPY = Math.max(0, Math.floor(Math.min(...screen.map((p) => p[1]))));
      const maxPY = Math.min(HEIGHT - 1, Math.ceil(Math.max(...screen.map((p) => p[1]))));
      const area =
        (screen[1][0] - screen[0][0]) * (screen[2][1] - screen[0][1]) -
        (screen[2][0] - screen[0][0]) * (screen[1][1] - screen[0][1]);
      if (Math.abs(area) < 1e-9) {
        continue;
      }
      for (let y = minPY; y <= maxPY; y += 1) {
        for (let x = minPX; x <= maxPX; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 =
            ((screen[1][0] - px) * (screen[2][1] - py) -
              (screen[2][0] - px) * (screen[1][1] - py)) / area;
          const w1 =
            ((screen[2][0] - px) * (screen[0][1] - py) -
              (screen[0][0] - px) * (screen[2][1] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) {
            continue;
          }
          const z = w0 * screen[0][2] + w1 * screen[1][2] + w2 * screen[2][2];
          const index = y * WIDTH + x;
          if (z >= depth[index]) {
            continue;
          }
          depth[index] = z;
          const offset = index * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            pixels[offset + channel] = Math.min(
              255,
              Math.round(body.color[channel] * shade),
            );
          }
        }
      }
    }
  }
  return pixels;
}

// ── PNG вручную ──────────────────────────────────────────────────────────────

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(pixels, path) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[y * (WIDTH * 3 + 1)] = 0;
    Buffer.from(pixels.buffer, y * WIDTH * 3, WIDTH * 3).copy(
      raw,
      y * (WIDTH * 3 + 1) + 1,
    );
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const pieces = await loadPieces();
const bodies = collectBodies(pieces);
writePng(render(bodies), OUT);
console.log(
  `${OUT}: кусков ${pieces.length}, тел ${bodies.length}, ракурс ${VIEW}`,
);
