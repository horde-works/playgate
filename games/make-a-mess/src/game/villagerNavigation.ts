/**
 * Навигация жителей: препятствия берутся из ЖИВОГО мира, а не из запечённой
 * сетки проходимости.
 *
 * Это не каприз, а следствие движка: у нас всё ломается. Запечённый навмеш —
 * стандартный ответ индустрии — здесь стал бы ложью через минуту игры: снесли
 * стену, обрушили сарай, завалили тропу обломками. Поэтому дальний маршрут
 * даёт грубый граф авторских троп, а близкий обход считается запросами к
 * сетке кусков с проверкой «сломан ли» прямо в момент запроса. Побочный
 * подарок: разрушение немедленно меняет поведение — снёс сарай, и жители
 * пошли напрямик там, где вчера огибали.
 */

import { inwardDoorSwingSign } from "./hingedGatePolicy.ts";

export interface NavPiece {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly shape?: string;
  readonly material?: string;
  readonly hinge?: unknown;
}

export interface ObstacleBox {
  readonly id: string;
  /** Центр и ПОЛУразмеры в собственных осях куска. */
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly halfX: number;
  readonly halfZ: number;
  /** Полная 3D-ориентация нужна лапам на наклонных камнях. */
  readonly localHalfSize: readonly [number, number, number];
  readonly worldAxes: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  /** Поворот вокруг вертикали: препятствия честно ориентированы. */
  readonly yaw: number;
  /** Грубая огибающая для сетки поиска. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Верх препятствия над землёй — от него зависит, обходить или лезть. */
  readonly top: number;
  /** Низ: у створки он от земли, у навеса — над головой. */
  readonly bottom: number;
  /** Если это створка — id входа, который надо попросить открыть. */
  readonly doorId?: string;
  readonly material?: string;
  readonly shape?: string;
}

/**
 * id входа по id куска створки. Ключ группы получается отбрасыванием номера
 * доски, а сам вход — отбрасыванием номера створки: у двухстворчатых ворот
 * обе половины принадлежат одному входу.
 */
export function entryIdForPiece(pieceId: string): string {
  return pieceId
    .replace(/:(board|strap|brace|plank|bar):\d+$/, "")
    .replace(/:leaf:(-1|1)$/, "");
}

/** Ниже этого просто перешагивают, не сбавляя шага. */
export const STEP_OVER_HEIGHT = 0.34;
/**
 * На сколько человек поднимает ногу без помощи рук: ступенька крыльца,
 * настил мостков, бревно. Всё, что не выше этого над стопой, — не
 * препятствие, а ПОВЕРХНОСТЬ: по ней идут поверху.
 */
export const STEP_UP_HEIGHT = 0.46;
/** До этого — перелезают/перемахивают: низкий забор, поленница, борт лодки. */
export const VAULT_HEIGHT = 0.95;

/**
 * Высота опоры под точкой: верх самого высокого куска, на который можно
 * взойти с текущей высоты стопы. Именно это превращает мостки, крыльцо и
 * упавшее бревно из препятствий в дорогу.
 */
export function surfaceHeightAt(
  field: ObstacleField,
  x: number,
  z: number,
  feetY: number,
  broken?: ReadonlySet<string>,
): number {
  let height = 0;
  for (const box of field.query(x, z, 0.45, broken)) {
    if (box.top > feetY + STEP_UP_HEIGHT || box.top <= height) {
      continue;
    }
    if (distanceToBox(box, x, z) <= 0.28) {
      height = box.top;
    }
  }
  return height;
}

export interface DoorLeaves {
  /** Куски створки в ЗАКРЫТОМ положении — перекрывают проём. */
  readonly closed: string[];
  /** Те же створки в РАСПАХНУТОМ положении — стоят сбоку и тоже не пускают. */
  readonly open: string[];
}

export interface ObstacleField {
  readonly cellSize: number;
  /** Створки каждого входа в обоих положениях. */
  readonly doorPieces: ReadonlyMap<string, DoorLeaves>;
  query(
    x: number,
    z: number,
    radius: number,
    broken?: ReadonlySet<string>,
  ): readonly ObstacleBox[];
}

const GROUND_MATERIALS = new Set(["earth", "soil", "grass", "asphalt", "concrete"]);

/**
 * Собирает поле препятствий из кусков сцены. Берём только то, во что человек
 * реально упирается: низ ниже пояса, верх выше щиколотки. Земля, крыши и
 * навесы над головой не мешают ходить.
 */
export function buildObstacleField(
  pieces: readonly NavPiece[],
  cellSize = 3,
): ObstacleField {
  const cells = new Map<string, ObstacleBox[]>();
  const doorPieces = new Map<string, DoorLeaves>();
  const key = (cx: number, cz: number): string => `${cx}:${cz}`;

  for (const piece of pieces) {
    if (piece.shape === "groundTile") {
      continue;
    }
    // Двери и ворота — НАСТОЯЩАЯ преграда, пока не открыты. Раньше навесные
    // куски просто выбрасывались из поля, и житель, не дождавшись створки,
    // проходил сквозь неё. Теперь створка стоит стеной, а «прозрачной»
    // становится, только когда её створ действительно распахнут: id входа
    // кладётся в бокс, а открытые входы приходят из HingedDoorSystem.
    const doorId = piece.hinge ? entryIdForPiece(piece.id) : undefined;
    // ПОВОРОТ МЕНЯЕТ ГАБАРИТ. Стены викингских домов сложены из брёвен,
    // повёрнутых вокруг X или Z: у такого куска size = [0.58, 8.12, 0.58],
    // и если взять полуразмеры по осям куска, восьмиметровая стена станет
    // столбиком 0.58×0.58 — жители будут ходить сквозь дом. Считаем реальные
    // габариты, прогнав восемь углов через полную матрицу Эйлера.
    const rotation = piece.rotation ?? [0, 0, 0];
    const [rx, ry, rz] = rotation;
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const cosZ = Math.cos(rz);
    const sinZ = Math.sin(rz);
    const halfSize = [piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2];
    // Три полуоси куска в мировых осях. R = Rx * Ry * Rz, порядок three.js.
    const rotate = (lx: number, ly: number, lz: number): readonly [number, number, number] => {
      const zx = lx * cosZ - ly * sinZ;
      const zy = lx * sinZ + ly * cosZ;
      const yx = zx * cosY + lz * sinY;
      const yz = -zx * sinY + lz * cosY;
      return [yx, zy * cosX - yz * sinX, zy * sinX + yz * cosX];
    };
    const axes = [
      rotate(halfSize[0], 0, 0),
      rotate(0, halfSize[1], 0),
      rotate(0, 0, halfSize[2]),
    ];
    const worldAxes: ObstacleBox["worldAxes"] = [
      rotate(1, 0, 0),
      rotate(0, 1, 0),
      rotate(0, 0, 1),
    ];
    // Осевая огибающая: нужна для сетки поиска и для высоты верха.
    const spanX = Math.abs(axes[0][0]) + Math.abs(axes[1][0]) + Math.abs(axes[2][0]);
    const spanY = Math.abs(axes[0][1]) + Math.abs(axes[1][1]) + Math.abs(axes[2][1]);
    const spanZ = Math.abs(axes[0][2]) + Math.abs(axes[1][2]) + Math.abs(axes[2][2]);

    const bottom = piece.position[1] - spanY;
    const top = piece.position[1] + spanY;
    if (bottom > 1.25 || top < 0.18) {
      continue;
    }
    if (GROUND_MATERIALS.has(piece.material ?? "") && top < 0.3) {
      continue;
    }
    // Сквозь траву, мох, грибы и сено ходят. Раньше кустик высотой 0.5 м был
    // таким же препятствием, как бревно, и жители обходили пустое место.
    if (piece.material === "foliage" && top < 0.85) {
      continue;
    }
    // СКВОЗЬ БЕЛЬЁ ТОЖЕ ХОДЯТ. Развешенная ткань висит на верёвке и не
    // держит человека: её отводят плечом. Пока полотнище считалось стеной,
    // житель, оказавшийся под верёвкой, оставался там до утра — а стоило
    // опустить верёвку на человеческий рост, как это стало случаться всерьёз.
    if (piece.material === "cloth" && bottom > 0.55) {
      continue;
    }

    // След на земле берём ОРИЕНТИРОВАННЫЙ, по самой длинной горизонтальной
    // полуоси куска. Прежде наклон вокруг X или Z сбрасывал рыскание в ноль:
    // бревно стены повёрнутого дома (size [0.58, 11.2, 0.58], поворот по X И
    // по Z) становилось осевым блоком 7.8 × 8.8 м, и вся изба читалась как
    // сплошной камень — внутрь было не войти, а снаружи жителей отжимало от
    // пустоты. Теперь длинная ось задаёт направление, а поперёк складываются
    // проекции остальных полуосей.
    let mainIndex = 0;
    let mainLength = -1;
    for (let index = 0; index < 3; index += 1) {
      const length = Math.hypot(axes[index][0], axes[index][2]);
      if (length > mainLength) {
        mainLength = length;
        mainIndex = index;
      }
    }
    let yaw = 0;
    let halfX = spanX;
    let halfZ = spanZ;
    if (mainLength > 1e-4) {
      const alongX = axes[mainIndex][0] / mainLength;
      const alongZ = axes[mainIndex][2] / mainLength;
      yaw = Math.atan2(-alongZ, alongX);
      halfX = 0;
      halfZ = 0;
      for (const axis of axes) {
        halfX += Math.abs(axis[0] * alongX + axis[2] * alongZ);
        halfZ += Math.abs(axis[0] * -alongZ + axis[2] * alongX);
      }
    }

    const box: ObstacleBox = {
      id: piece.id,
      centerX: piece.position[0],
      centerY: piece.position[1],
      centerZ: piece.position[2],
      halfX,
      halfZ,
      localHalfSize: [halfSize[0], halfSize[1], halfSize[2]],
      worldAxes,
      yaw,
      minX: piece.position[0] - spanX,
      maxX: piece.position[0] + spanX,
      minZ: piece.position[2] - spanZ,
      maxZ: piece.position[2] + spanZ,
      top,
      bottom,
      doorId,
      material: piece.material,
      shape: piece.shape,
    };
    let boxes: ObstacleBox[] = [box];
    if (doorId) {
      let leaves = doorPieces.get(doorId);
      if (!leaves) {
        leaves = { closed: [], open: [] };
        doorPieces.set(doorId, leaves);
      }
      leaves.closed.push(piece.id);
      // РАСПАХНУТАЯ СТВОРКА НЕ ИСЧЕЗАЕТ. Она отъезжает на петле вбок и стоит
      // там такой же преградой: сквозь открытую дверь пройти можно только в
      // проём, а не сквозь саму доску. Петля хранит мировые координаты оси,
      // поэтому положение считается точно, а не угадывается.
      const hinge = piece.hinge as
        | { pivot: readonly number[]; normal: readonly number[] }
        | undefined;
      if (hinge?.pivot && hinge.normal) {
        const outward = /:hall-gate:leaf:/.test(piece.id);
        const sign = outward
          ? -inwardDoorSwingSign(
              [piece.position[0], piece.position[1], piece.position[2]],
              [hinge.pivot[0], hinge.pivot[1], hinge.pivot[2]],
              [hinge.normal[0], hinge.normal[1], hinge.normal[2]],
            )
          : inwardDoorSwingSign(
              [piece.position[0], piece.position[1], piece.position[2]],
              [hinge.pivot[0], hinge.pivot[1], hinge.pivot[2]],
              [hinge.normal[0], hinge.normal[1], hinge.normal[2]],
            );
        // Тот же угол распаха, что рисует HingedDoorSystem: иначе житель
        // обходит створку там, где её нет, и задевает там, где она есть.
        // Ворота зала отведены к торцу — 2.9 рад.
        const swing = sign * (outward ? 2.9 : 1.8);
        const cosSwing = Math.cos(swing);
        const sinSwing = Math.sin(swing);
        const offsetX = box.centerX - hinge.pivot[0];
        const offsetZ = box.centerZ - hinge.pivot[2];
        const openCenterX = hinge.pivot[0] + offsetX * cosSwing + offsetZ * sinSwing;
        const openCenterZ = hinge.pivot[2] - offsetX * sinSwing + offsetZ * cosSwing;
        const openId = `${piece.id}#open`;
        const reach = Math.hypot(box.halfX, box.halfZ);
        boxes = [
          box,
          {
            ...box,
            id: openId,
            centerX: openCenterX,
            centerZ: openCenterZ,
            yaw: box.yaw + swing,
            minX: openCenterX - reach,
            maxX: openCenterX + reach,
            minZ: openCenterZ - reach,
            maxZ: openCenterZ + reach,
          },
        ];
        leaves.open.push(openId);
      }
    }
    for (const entry of boxes) {
      const cx0 = Math.floor(entry.minX / cellSize);
      const cx1 = Math.floor(entry.maxX / cellSize);
      const cz0 = Math.floor(entry.minZ / cellSize);
      const cz1 = Math.floor(entry.maxZ / cellSize);
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (let cz = cz0; cz <= cz1; cz += 1) {
          const cell = cells.get(key(cx, cz));
          if (cell) {
            cell.push(entry);
          } else {
            cells.set(key(cx, cz), [entry]);
          }
        }
      }
    }
  }

  return {
    cellSize,
    doorPieces,
    query(x, z, radius, broken) {
      const found: ObstacleBox[] = [];
      const seen = new Set<string>();
      const cx0 = Math.floor((x - radius) / cellSize);
      const cx1 = Math.floor((x + radius) / cellSize);
      const cz0 = Math.floor((z - radius) / cellSize);
      const cz1 = Math.floor((z + radius) / cellSize);
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (let cz = cz0; cz <= cz1; cz += 1) {
          const cell = cells.get(key(cx, cz));
          if (!cell) {
            continue;
          }
          for (const box of cell) {
            if (seen.has(box.id) || broken?.has(box.id)) {
              continue;
            }
            seen.add(box.id);
            found.push(box);
          }
        }
      }
      return found;
    },
  };
}

/** Расстояние от точки до ОРИЕНТИРОВАННОГО прямоугольника (0 внутри). */
export function distanceToBox(box: ObstacleBox, x: number, z: number): number {
  const sin = Math.sin(box.yaw);
  const cos = Math.cos(box.yaw);
  const relX = x - box.centerX;
  const relZ = z - box.centerZ;
  const localX = relX * cos - relZ * sin;
  const localZ = relX * sin + relZ * cos;
  const dx = Math.max(Math.abs(localX) - box.halfX, 0);
  const dz = Math.max(Math.abs(localZ) - box.halfZ, 0);
  return Math.hypot(dx, dz);
}

/**
 * Верхняя точка реального ориентированного box под вертикальным лучом.
 * `box.top` — только AABB и на наклонном валуне завышает опору до самого
 * высокого угла. Для лапы нужна именно поверхность под подушечкой.
 */
export function topSurfaceHeightAtBox(
  box: ObstacleBox,
  x: number,
  z: number,
): number | null {
  const relativeX = x - box.centerX;
  const relativeZ = z - box.centerZ;
  let lower = -Infinity;
  let upper = Infinity;

  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    const axis = box.worldAxes[axisIndex];
    const half = box.localHalfSize[axisIndex];
    const base = relativeX * axis[0] + relativeZ * axis[2];
    const slope = axis[1];
    if (Math.abs(slope) < 1e-8) {
      if (Math.abs(base) > half + 1e-8) return null;
      continue;
    }
    const first = (-half - base) / slope;
    const second = (half - base) / slope;
    lower = Math.max(lower, Math.min(first, second));
    upper = Math.min(upper, Math.max(first, second));
    if (lower > upper + 1e-8) return null;
  }

  return Number.isFinite(upper) ? box.centerY + upper : null;
}

/**
 * Точная опора для отдельных лап. В отличие от `surfaceHeightAt`, она читает
 * наклон 3D-куска, но сохраняет тот же предел естественного шага вверх.
 */
export function articulatedSurfaceHeightAt(
  field: ObstacleField,
  x: number,
  z: number,
  feetY: number,
  broken?: ReadonlySet<string>,
  maximumStep = STEP_UP_HEIGHT,
): number {
  let height = 0;
  for (const box of field.query(x, z, 0.5, broken)) {
    const surface = topSurfaceHeightAtBox(box, x, z);
    if (surface === null || surface > feetY + maximumStep || surface <= height) {
      continue;
    }
    height = surface;
  }
  return height;
}

/** Ближайшая точка на ориентированном прямоугольнике. */
export function closestPointOnBox(
  box: ObstacleBox,
  x: number,
  z: number,
): readonly [number, number] {
  const sin = Math.sin(box.yaw);
  const cos = Math.cos(box.yaw);
  const relX = x - box.centerX;
  const relZ = z - box.centerZ;
  const localX = Math.max(-box.halfX, Math.min(box.halfX, relX * cos - relZ * sin));
  const localZ = Math.max(-box.halfZ, Math.min(box.halfZ, relX * sin + relZ * cos));
  return [
    box.centerX + localX * cos + localZ * sin,
    box.centerZ - localX * sin + localZ * cos,
  ];
}

export interface WhiskerHit {
  /** 0 — свободно, 1 — упёрлись вплотную. */
  readonly blocked: number;
  /** Сколько метров свободно по этому направлению. */
  readonly free: number;
  readonly box: ObstacleBox | null;
  readonly top: number;
}

/**
 * Луч-ус: смотрим вперёд по направлению на `length` метров и ищем первое
 * препятствие. Это и есть «прогноз» вместо робота-пылесоса: человек видит
 * стену за полторы секунды до неё и начинает поворачивать заранее, а не
 * тычется носом.
 */
export function castWhisker(
  field: ObstacleField,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  length: number,
  bodyRadius: number,
  broken?: ReadonlySet<string>,
  /** Высота стопы: с настила и крыльца видно дальше, чем с земли. */
  feetY = 0,
): WhiskerHit {
  const boxes = field.query(
    x + dirX * length * 0.5,
    z + dirZ * length * 0.5,
    length * 0.5 + bodyRadius + 0.6,
    broken,
  );
  let nearest = Infinity;
  let hit: ObstacleBox | null = null;
  const steps = Math.max(3, Math.ceil(length / 0.45));
  for (let step = 1; step <= steps; step += 1) {
    const travel = (length * step) / steps;
    const px = x + dirX * travel;
    const pz = z + dirZ * travel;
    for (const box of boxes) {
      // Не препятствие, а ступень: на такое просто заходят.
      if (box.top <= feetY + STEP_UP_HEIGHT) {
        continue;
      }
      if (distanceToBox(box, px, pz) <= bodyRadius) {
        if (travel < nearest) {
          nearest = travel;
          hit = box;
        }
        break;
      }
    }
    if (hit) {
      break;
    }
  }
  if (!hit) {
    return { blocked: 0, free: length, box: null, top: 0 };
  }
  return {
    blocked: Math.max(0, Math.min(1, 1 - nearest / length)),
    free: nearest,
    box: hit,
    top: hit.top,
  };
}

/**
 * Высота ВСЕГО, что стоит в этой точке. Стена сложена из венцов: нижнее
 * бревно само по себе «перелезаемое», но человек видит стену целиком и не
 * пытается перемахнуть дом. Без этого житель входит в зал сквозь стену.
 */
export function stackTopAt(
  field: ObstacleField,
  x: number,
  z: number,
  radius = 0.45,
  broken?: ReadonlySet<string>,
): number {
  let top = 0;
  for (const box of field.query(x, z, radius, broken)) {
    if (box.top > top && distanceToBox(box, x, z) <= radius) {
      top = box.top;
    }
  }
  return top;
}

export interface FanChoice {
  /** Куда идти: лучшее свободное направление. */
  readonly yaw: number;
  /** Сколько по нему свободно. */
  readonly free: number;
  /** Ближайшая помеха прямо по курсу желаемого направления. */
  readonly ahead: WhiskerHit;
  /** Со всех сторон тесно — человек в углу и должен пятиться. */
  readonly wedged: boolean;
}

/**
 * Панорамный обзор вместо одного «уса»: веер лучей вокруг желаемого
 * направления. Человек видит СРАЗУ НЕСКОЛЬКО предметов и выбирает самый
 * свободный проход — поэтому не заходит в угол между двумя объектами и не
 * застревает там, как это неизбежно с одним лучом и правилом «обходи слева».
 */
export function chooseFreeDirection(
  field: ObstacleField,
  x: number,
  z: number,
  desiredYaw: number,
  headingYaw: number,
  look: number,
  bodyRadius: number,
  broken?: ReadonlySet<string>,
  /** Куда решили идти в прошлый раз: без этого агент колеблется между двумя
   * симметричными проходами и стоит на месте. */
  previousYaw?: number,
  feetY = 0,
): FanChoice {
  const rays = 13;
  const span = 1.55;
  let bestScore = -Infinity;
  let bestYaw = desiredYaw;
  let bestFree = 0;
  let ahead: WhiskerHit = { blocked: 0, free: look, box: null, top: 0 };
  let widest = 0;

  for (let index = 0; index < rays; index += 1) {
    const offset = ((index / (rays - 1)) * 2 - 1) * span;
    const candidate = desiredYaw + offset;
    const hit = castWhisker(
      field,
      x,
      z,
      Math.sin(candidate),
      Math.cos(candidate),
      look,
      bodyRadius,
      broken,
      feetY,
    );
    if (Math.abs(offset) < 1e-6) {
      ahead = hit;
    }
    widest = Math.max(widest, hit.free);
    // Ценим простор впереди, но не любим сворачивать: и с курса, и с
    // намерения. Иначе человек «гуляет» вместо того, чтобы идти по делу.
    // Лёгкая инерция решения: достаточно, чтобы не колебаться между двумя
    // симметричными проходами, и мало, чтобы не упрямиться в тупик.
    const inertia =
      previousYaw === undefined
        ? 0
        : Math.min(0.35, Math.abs(shortestAngle(previousYaw, candidate)) * 0.12);
    const score =
      Math.min(hit.free, look) -
      Math.abs(offset) * 0.62 -
      Math.abs(shortestAngle(headingYaw, candidate)) * 0.3 -
      inertia;
    if (score > bestScore) {
      bestScore = score;
      bestYaw = candidate;
      bestFree = hit.free;
    }
  }

  return {
    yaw: bestYaw,
    free: bestFree,
    ahead,
    wedged: widest < 0.75,
  };
}

/**
 * Насколько человек может доворачивать на ходу. Стоя разворачиваются на
 * месте почти мгновенно, на скорости — плавной дугой: разогнавшийся человек
 * физически не может провернуться вокруг оси.
 */
export function maxTurnRate(speed: number): number {
  return 3.4 / (1 + speed * 1.55);
}

export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
