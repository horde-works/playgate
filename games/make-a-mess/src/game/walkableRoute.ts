// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Проходимость: можно ли ДОЙТИ туда, куда мы построили дорогу.
//
// Аудит станций «Астаны» показал класс ошибок, который не ловит ни один из
// прежних детекторов. Опись деталей была полной, обрушений ноль, тесты
// зелёные — а пройти по станции было нельзя: фасад запечатан стеклом,
// марши упирались в сплошные плиты, колонны стояли в полосе лестницы.
// «Деталь с нужным id существует» — это не приёмка. Приёмка — «капсула
// игрока дошла».
//
// Модуль чистый: берёт куски сцены и отвечает, куда добирается капсула.
// Модель шага повторяет игрока (`playerMovement.ts`): опора под ногами,
// автоподъём на ступень, просвет над головой и боковой габарит. Это не
// физический движок и не претендует на него — это ходилка по сетке, и её
// «дошёл» означает «есть непрерывный коридор нужного сечения», чего для
// приёмки достаточно, а её «не дошёл» всегда указывает на конкретный кусок.

import {
  MAX_AUTO_STEP_HEIGHT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from "./playerMovement.ts";

export interface RoutePiece {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface RouteBox {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Полная высота капсулы игрока: две полусферы плюс цилиндр. */
export const PLAYER_HEIGHT =
  (PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS) * 2;

export interface WalkOptions {
  /** Радиус капсулы. */
  readonly radius?: number;
  /** Полная высота капсулы: столько нужно свободного просвета. */
  readonly height?: number;
  /** На сколько можно взойти без прыжка. */
  readonly stepUp?: number;
  /** С какой высоты можно сойти вниз, не считая это падением. */
  readonly stepDown?: number;
  /** Шаг сетки поиска. */
  readonly cell?: number;
  /** Ограничение области: без него поиск разбежится по всему острову. */
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    /** Ниже этой отметки опора не ищется — пол мира. */
    readonly floorY: number;
    /** Выше этой отметки маршрут не поднимается. */
    readonly ceilingY: number;
  };
}

/**
 * Мировая огибающая куска. Поворот МЕНЯЕТ габарит, и забыть об этом здесь
 * значило бы повторить ошибку решателя нагрузок: развёрнутая на 90° плита
 * читалась бы поперёк вместо вдоль.
 */
export function routeBoxOf(piece: RoutePiece): RouteBox {
  const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
  // R = Rx·Ry·Rz, порядок three.js — тот же, что в компиляторе сцены.
  const axes = [
    [cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz],
    [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz],
    [sy, -sx * cy, cx * cy],
  ] as const;
  const half = [piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2];
  const span = [0, 1, 2].map((world) =>
    axes.reduce(
      (total, axis, local) => total + Math.abs(axis[world]) * half[local],
      0,
    ),
  );
  return {
    id: piece.id,
    minX: piece.position[0] - span[0],
    maxX: piece.position[0] + span[0],
    minY: piece.position[1] - span[1],
    maxY: piece.position[1] + span[1],
    minZ: piece.position[2] - span[2],
    maxZ: piece.position[2] + span[2],
  };
}

interface BoxIndex {
  readonly cellSize: number;
  readonly cells: Map<string, RouteBox[]>;
}

function indexBoxes(boxes: readonly RouteBox[], cellSize: number): BoxIndex {
  const cells = new Map<string, RouteBox[]>();
  for (const box of boxes) {
    const fromX = Math.floor(box.minX / cellSize);
    const toX = Math.floor(box.maxX / cellSize);
    const fromZ = Math.floor(box.minZ / cellSize);
    const toZ = Math.floor(box.maxZ / cellSize);
    for (let ix = fromX; ix <= toX; ix += 1) {
      for (let iz = fromZ; iz <= toZ; iz += 1) {
        const key = `${ix}:${iz}`;
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(box);
        } else {
          cells.set(key, [box]);
        }
      }
    }
  }
  return { cellSize, cells };
}

function boxesNear(
  index: BoxIndex,
  x: number,
  z: number,
  radius: number,
): readonly RouteBox[] {
  const found = new Map<string, RouteBox>();
  const fromX = Math.floor((x - radius) / index.cellSize);
  const toX = Math.floor((x + radius) / index.cellSize);
  const fromZ = Math.floor((z - radius) / index.cellSize);
  const toZ = Math.floor((z + radius) / index.cellSize);
  for (let ix = fromX; ix <= toX; ix += 1) {
    for (let iz = fromZ; iz <= toZ; iz += 1) {
      for (const box of index.cells.get(`${ix}:${iz}`) ?? []) {
        found.set(box.id, box);
      }
    }
  }
  return [...found.values()];
}

/** Пересекает ли габарит капсулы след коробки в плане. */
function overlapsFootprint(
  box: RouteBox,
  x: number,
  z: number,
  radius: number,
): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

export interface Stance {
  readonly x: number;
  readonly z: number;
  /** Отметка ПОДОШВЫ. */
  readonly footY: number;
}

export interface StanceProbe {
  readonly stance: Stance | null;
  /** Что помешало встать: кусок над головой или под ногами уступ. */
  readonly blockedBy: string | null;
  readonly reason: "void" | "step" | "headroom" | "ok";
}

/**
 * Куда встанет капсула в этой точке, идя с отметки `fromFootY`. Опора — самый
 * высокий верх под допуском шага; над ней должен быть чистый просвет.
 */
export function probeStance(
  index: BoxIndex,
  x: number,
  z: number,
  fromFootY: number,
  options: Required<Omit<WalkOptions, "bounds">> & { bounds: WalkOptions["bounds"] },
): StanceProbe {
  const near = boxesNear(index, x, z, options.radius);
  let supportTop = options.bounds.floorY;
  let supportId: string | null = null;
  for (const box of near) {
    if (!overlapsFootprint(box, x, z, options.radius)) {
      continue;
    }
    // Опорой считается только то, на что можно взойти и с чего не падаешь.
    if (box.maxY > fromFootY + options.stepUp) {
      continue;
    }
    if (box.maxY < fromFootY - options.stepDown) {
      continue;
    }
    if (box.maxY > supportTop) {
      supportTop = box.maxY;
      supportId = box.id;
    }
  }
  if (supportId === null && supportTop <= options.bounds.floorY) {
    return { stance: null, blockedBy: null, reason: "void" };
  }
  if (supportTop - fromFootY > options.stepUp) {
    return { stance: null, blockedBy: supportId, reason: "step" };
  }

  // Просвет: между подошвой и макушкой не должно быть ничего. Небольшой
  // допуск снизу — чтобы сама опора не считалась препятствием.
  const headFrom = supportTop + 0.06;
  const headTo = supportTop + options.height;
  for (const box of near) {
    if (!overlapsFootprint(box, x, z, options.radius)) {
      continue;
    }
    if (box.maxY > headFrom && box.minY < headTo) {
      return { stance: null, blockedBy: box.id, reason: "headroom" };
    }
  }
  return { stance: { x, z, footY: supportTop }, blockedBy: null, reason: "ok" };
}

export interface WalkResult {
  readonly reached: boolean;
  /** Сколько клеток обошли — по нему видно, разбежался ли поиск. */
  readonly visited: number;
  /**
   * Ближайшая к цели точка, куда удалось встать, и что помешало идти дальше.
   * Это и есть адрес дефекта: id куска и координата.
   */
  readonly closest: Stance | null;
  readonly closestDistance: number;
  readonly blockedBy: string | null;
  readonly blockReason: StanceProbe["reason"];
}

/**
 * Дошла ли капсула от `from` до `to`. Поиск в ширину по сетке; состояние —
 * клетка ПЛЮС уровень, иначе платформа на двенадцати метрах и земля под ней
 * склеились бы в одну клетку.
 */
export function walkRoute(
  pieces: readonly RoutePiece[],
  from: Stance,
  to: { readonly x: number; readonly z: number; readonly footY?: number },
  options: WalkOptions,
): WalkResult {
  const settings = {
    radius: options.radius ?? PLAYER_CAPSULE_RADIUS,
    height: options.height ?? PLAYER_HEIGHT,
    stepUp: options.stepUp ?? MAX_AUTO_STEP_HEIGHT,
    stepDown: options.stepDown ?? 1.6,
    cell: options.cell ?? 0.3,
    bounds: options.bounds,
  };
  const boxes = pieces
    .map(routeBoxOf)
    .filter(
      (box) =>
        box.maxX > settings.bounds.minX &&
        box.minX < settings.bounds.maxX &&
        box.maxZ > settings.bounds.minZ &&
        box.minZ < settings.bounds.maxZ &&
        box.maxY > settings.bounds.floorY - 1 &&
        box.minY < settings.bounds.ceilingY + 1,
    );
  const index = indexBoxes(boxes, Math.max(1, settings.cell * 4));

  const goalReach = Math.max(settings.cell, 0.5);
  const key = (x: number, z: number, footY: number): string =>
    `${Math.round(x / settings.cell)}:${Math.round(z / settings.cell)}:${Math.round(footY / 0.6)}`;

  const start = probeStance(index, from.x, from.z, from.footY, settings);
  if (!start.stance) {
    return {
      reached: false, visited: 0, closest: null, closestDistance: Infinity,
      blockedBy: start.blockedBy, blockReason: start.reason,
    };
  }

  const seen = new Set<string>([key(start.stance.x, start.stance.z, start.stance.footY)]);
  const queue: Stance[] = [start.stance];
  let head = 0;
  let closest = start.stance;
  let closestDistance = Math.hypot(start.stance.x - to.x, start.stance.z - to.z);
  let blockedBy: string | null = null;
  let blockReason: StanceProbe["reason"] = "ok";

  const steps: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (head < queue.length) {
    const stance = queue[head];
    head += 1;
    const distance = Math.hypot(stance.x - to.x, stance.z - to.z);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = stance;
    }
    if (
      distance <= goalReach &&
      (to.footY === undefined || Math.abs(stance.footY - to.footY) < 1)
    ) {
      return {
        reached: true, visited: seen.size, closest: stance,
        closestDistance: distance, blockedBy: null, blockReason: "ok",
      };
    }

    for (const [dx, dz] of steps) {
      const nextX = stance.x + dx * settings.cell;
      const nextZ = stance.z + dz * settings.cell;
      if (
        nextX < settings.bounds.minX || nextX > settings.bounds.maxX ||
        nextZ < settings.bounds.minZ || nextZ > settings.bounds.maxZ
      ) {
        continue;
      }
      const probe = probeStance(index, nextX, nextZ, stance.footY, settings);
      if (!probe.stance) {
        // Запоминаем помеху, ближайшую к цели: это и есть адрес дефекта.
        const blockDistance = Math.hypot(nextX - to.x, nextZ - to.z);
        if (probe.blockedBy && blockDistance < closestDistance + settings.cell) {
          blockedBy = probe.blockedBy;
          blockReason = probe.reason;
        }
        continue;
      }
      if (probe.stance.footY > settings.bounds.ceilingY) {
        continue;
      }
      const nextKey = key(probe.stance.x, probe.stance.z, probe.stance.footY);
      if (seen.has(nextKey)) {
        continue;
      }
      seen.add(nextKey);
      queue.push(probe.stance);
    }
  }

  return {
    reached: false, visited: seen.size, closest, closestDistance,
    blockedBy, blockReason,
  };
}
