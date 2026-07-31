import type {
  SettlementDwelling,
  SettlementCargo,
  SettlementFlow,
  SettlementStore,
  SettlementWorkVerb,
  SettlementPlan,
} from "./settlementPlan.ts";
import {
  chooseFreeDirection,
  closestPointOnBox,
  distanceToBox,
  maxTurnRate,
  shortestAngle,
  stackTopAt,
  STEP_UP_HEIGHT,
  surfaceHeightAt,
  VAULT_HEIGHT,
  type ObstacleBox,
  type ObstacleField,
} from "./villagerNavigation.ts";

/**
 * Жители деревни как чистая симуляция — без three.js, чтобы её поведение
 * можно было проверять тестами, а не глазами.
 *
 * Поселение симуляция ПРИНИМАЕТ (SettlementPlan), а не знает: деревня и город
 * различаются тропами, жильём, ролями и ритмом суток, но не поведением.
 *
 * Ключевое решение: никакого поиска пути. Поселение уже описано СМЫСЛОВЫМ
 * графом — авторскими тропами, у которых есть назначение и износ, и
 * площадками с назначением.
 * Эти тропы рисовались как маски износа: «от дома рыбака к сушилке», «вокруг
 * колодца». То есть кто-то уже решил, где ходят люди — жителю остаётся
 * ходить по ним. Отсюда два подарка даром:
 *
 *  - тропы обходят дома по углам, значит житель физически не может пройти
 *    сквозь стену: столкновений считать не нужно;
 *  - `wear` — это частота хождения, то есть готовый вес выбора маршрута:
 *    натоптанная тропа выбирается чаще, как в жизни.
 */

/**
 * Роль — токен из описания поселения, а не закрытый список: у деревни это
 * ремёсла, у города — пенсионер, хозяйка, работяга, гаражник.
 */
export type VillagerRole = string;

export interface VillageNode {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  /** Дверь этого дома, если узел стоит на пороге. */
  readonly homeId?: string;
  /** Площадка (колодец, кузня, огород), если узел лежит в её пятне. */
  readonly areaId?: string;
}

export interface VillageEdge {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly points: readonly (readonly [number, number])[];
  /** Накопленная длина до каждой точки; последняя == length. */
  readonly cumulative: readonly number[];
  readonly length: number;
  readonly wear: number;
}

export interface VillageNetwork {
  readonly nodes: readonly VillageNode[];
  readonly edges: readonly VillageEdge[];
  /** Для каждого узла — индексы примыкающих рёбер. */
  readonly adjacency: readonly (readonly number[])[];
}

const NODE_SNAP = 2.1;

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Склеивает авторские тропы в граф: концы троп, стоящие ближе NODE_SNAP,
 * становятся одним узлом-местом. Узлы подписываются смыслом — дверь такого-то
 * дома, пятно такой-то площадки, — и на этих подписях потом держатся роли.
 */
export function buildSettlementNetwork(plan: SettlementPlan): VillageNetwork {
  const routes = plan.routes.filter((route) => route.points.length >= 2);

  // 1. Кластеризуем ВСЕ вершины троп, а не только их концы: в деревне тропы
  // сходятся и серединами (у колодца, у зала, на развилке к кузне). Если
  // клеить граф только по концам, сеть распадается на изолированные цепочки
  // и половина деревни становится недостижимой.
  interface Cluster {
    x: number;
    z: number;
    members: number;
    routes: Set<number>;
    endpoint: boolean;
  }
  const clusters: Cluster[] = [];
  const clusterOfVertex: number[][] = routes.map(() => []);

  for (const [routeIndex, route] of routes.entries()) {
    for (const [vertexIndex, point] of route.points.entries()) {
      const isEnd = vertexIndex === 0 || vertexIndex === route.points.length - 1;
      let found = -1;
      for (const [clusterIndex, cluster] of clusters.entries()) {
        if (distance(cluster.x, cluster.z, point[0], point[1]) <= NODE_SNAP) {
          found = clusterIndex;
          break;
        }
      }
      if (found === -1) {
        clusters.push({
          x: point[0],
          z: point[1],
          members: 1,
          routes: new Set([routeIndex]),
          endpoint: isEnd,
        });
        found = clusters.length - 1;
      } else {
        const cluster = clusters[found];
        cluster.x = (cluster.x * cluster.members + point[0]) / (cluster.members + 1);
        cluster.z = (cluster.z * cluster.members + point[1]) / (cluster.members + 1);
        cluster.members += 1;
        cluster.routes.add(routeIndex);
        cluster.endpoint = cluster.endpoint || isEnd;
      }
      clusterOfVertex[routeIndex][vertexIndex] = found;
    }
  }

  // 2. Узлом становится место, где тропа кончается, где сходятся две разные
  // тропы — ИЛИ где тропа проходит через размеченную площадку.
  //
  // Третье условие добавлено замером: площадка, у которой нет ни одного узла,
  // это МЁРТВОЕ ПРИТЯЖЕНИЕ — вес объявлен, а идти некуда. Так молча пропали
  // пять мест, включая двор рубки дров: тропа шла ровно через него, но его
  // точка была серединной вершиной, а серединные вершины узлами не считались.
  const inSomeArea = (x: number, z: number): boolean => {
    for (const area of plan.areas) {
      const dx = Math.abs(x - area.center[0]) / area.radius[0];
      const dz = Math.abs(z - area.center[1]) / area.radius[1];
      if (Math.hypot(dx, dz) <= 1) {
        return true;
      }
    }
    return false;
  };
  const nodes: VillageNode[] = [];
  const nodeOfCluster = new Array<number>(clusters.length).fill(-1);
  for (const [clusterIndex, cluster] of clusters.entries()) {
    if (
      !cluster.endpoint &&
      cluster.routes.size < 2 &&
      !inSomeArea(cluster.x, cluster.z)
    ) {
      continue;
    }
    nodeOfCluster[clusterIndex] = nodes.length;
    nodes.push({ index: nodes.length, x: cluster.x, z: cluster.z });
  }

  // 3. Режем каждую тропу по узлам, которые к ней ПРИМЫКАЮТ — включая
  // Т-образные примыкания в середину отрезка (тропа к кузне упирается в
  // спину другой тропы, а не в её вершину). Без этого граф остаётся рваным.
  const edges: VillageEdge[] = [];
  for (const route of routes) {
    const points = route.points.map(
      (point) => [point[0], point[1]] as [number, number],
    );
    const cumulative: number[] = [0];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distance(
        points[index - 1][0],
        points[index - 1][1],
        points[index][0],
        points[index][1],
      );
      cumulative.push(total);
    }

    // Ближайшая точка тропы к каждому узлу.
    const splits: { arc: number; node: number }[] = [];
    for (const node of nodes) {
      let bestArc = 0;
      let bestDistance = Infinity;
      for (let index = 1; index < points.length; index += 1) {
        const [ax, az] = points[index - 1];
        const [bx, bz] = points[index];
        const dx = bx - ax;
        const dz = bz - az;
        const lengthSquared = dx * dx + dz * dz || 1;
        const t = Math.max(
          0,
          Math.min(1, ((node.x - ax) * dx + (node.z - az) * dz) / lengthSquared),
        );
        const px = ax + dx * t;
        const pz = az + dz * t;
        const offset = distance(px, pz, node.x, node.z);
        if (offset < bestDistance) {
          bestDistance = offset;
          bestArc = cumulative[index - 1] + Math.hypot(dx, dz) * t;
        }
      }
      if (bestDistance <= NODE_SNAP) {
        splits.push({ arc: bestArc, node: node.index });
      }
    }
    splits.sort((left, right) => left.arc - right.arc);

    const kept: { arc: number; node: number }[] = [];
    for (const split of splits) {
      const previous = kept[kept.length - 1];
      if (!previous) {
        kept.push(split);
        continue;
      }
      // Один и тот же узел мог спроецироваться на тропу дважды — второй раз не нужен.
      if (previous.node === split.node) {
        continue;
      }
      // А вот РАЗНЫЕ узлы, попавшие почти в одну точку тропы, отбрасывать
      // нельзя: прежний порог в 0.8 м съедал их молча, и узел оставался без
      // единого ребра — на коротких тропах внутри дома это происходило всегда.
      kept.push(
        split.arc - previous.arc > 0.35
          ? split
          : { arc: previous.arc + 0.35, node: split.node },
      );
    }
    if (kept.length < 2) {
      continue;
    }

    for (let index = 0; index < kept.length - 1; index += 1) {
      const from = kept[index];
      const to = kept[index + 1];
      const segment: (readonly [number, number])[] = [
        [nodes[from.node].x, nodes[from.node].z],
      ];
      for (let vertex = 0; vertex < points.length; vertex += 1) {
        if (cumulative[vertex] > from.arc + 0.4 && cumulative[vertex] < to.arc - 0.4) {
          segment.push([points[vertex][0], points[vertex][1]]);
        }
      }
      segment.push([nodes[to.node].x, nodes[to.node].z]);

      const segmentCumulative: number[] = [0];
      let length = 0;
      for (let vertex = 1; vertex < segment.length; vertex += 1) {
        length += distance(
          segment[vertex - 1][0],
          segment[vertex - 1][1],
          segment[vertex][0],
          segment[vertex][1],
        );
        segmentCumulative.push(length);
      }
      if (length < 1.2) {
        continue;
      }
      edges.push({
        id: kept.length > 2 ? `${route.id}#${index}` : route.id,
        from: from.node,
        to: to.node,
        points: segment,
        cumulative: segmentCumulative,
        length,
        wear: route.wear,
      });
    }
  }

  // Подписи узлов: сначала двери (они точнее), потом площадки.
  const labelled = nodes.map((node): VillageNode => {
    let homeId: string | undefined;
    for (const dwelling of plan.dwellings) {
      const entrance = dwelling.entrance;
      if (distance(node.x, node.z, entrance[0], entrance[1]) <= NODE_SNAP) {
        homeId = dwelling.id;
        break;
      }
    }
    let areaId: string | undefined;
    if (!homeId) {
      for (const area of plan.areas) {
        const dx = Math.abs(node.x - area.center[0]) / area.radius[0];
        const dz = Math.abs(node.z - area.center[1]) / area.radius[1];
        if (Math.hypot(dx, dz) <= 1.15) {
          areaId = area.id;
          break;
        }
      }
    }
    return { ...node, homeId, areaId };
  });

  const adjacency: number[][] = labelled.map(() => []);
  for (const [edgeIndex, edge] of edges.entries()) {
    adjacency[edge.from].push(edgeIndex);
    if (edge.to !== edge.from) {
      adjacency[edge.to].push(edgeIndex);
    }
  }

  return { nodes: labelled, edges, adjacency };
}

export interface Villager {
  readonly id: string;
  readonly homeId: string;
  readonly role: VillagerRole;
  /** Рост, ширина плеч, длина шага, размах рук — все разные. */
  readonly build: number;
  /** Длина ОДНОГО шага (пятка к пятке другой ноги), метры. */
  readonly strideLength: number;
  readonly baseSpeed: number;
  readonly dye: readonly [number, number, number];
  /** Несёт ношу. Роль ЧЕРЕДУЕТСЯ: донёс — поставил — пошёл налегке. */
  carries: boolean;
  /**
   * ЧТО именно в руках. Не ссылка на предмет мира — тип: полено, дрова.
   * Учёт ведут склады, рукам достаточно знать, что они держат.
   */
  cargo: SettlementCargo | null;
  /** Текущее дело: откуда, куда и на какой оно стадии. */
  job: VillagerJob | null;
  /** Каким глаголом человек сейчас занят у склада (для позы). */
  workVerb: SettlementWorkVerb | null;
  /** 0 — держит, 1 — короб уже на земле. Дальше он гаснет. */
  carryDrop: number;
  /** Сколько ещё секунд короб лежит на виду, прежде чем исчезнуть. */
  carryLinger: number;
  /** Ребёнок: мельче, шаг короче, держится дома и загона. */
  readonly child: boolean;
  /**
   * Насколько затаскана одежда: 0 — опрятный, 1 — рабочий в пыли. Дети мажутся
   * сильнее всех, ремесло у огня и дерева — сильнее прочих занятий.
   */
  readonly wear: number;
  /** Жительница или девочка. Не перекраска: свои роли, шаг и силуэт. */
  readonly female: boolean;
  /** Склонность к хулиганству: перемахнуть там, где можно было обойти. */
  readonly mischief: number;
  /** Своя привычная сторона тропы — двое не идут по одной нитке. */
  /** Своя сторона тропы. Не константа: её ведёт медленное блуждание. */
  lateralBias: number;
  lateralTarget: number;
  /** Темп внутри своего режима: то приторапливается, то приотстаёт. */
  paceDrift: number;
  /** Смещение от осевой линии тропы: люди не ходят по одной нитке. */
  lateral: number;
  /** Где именно человек стоит у цели — не в самой точке узла. */
  departOffsetX: number;
  departOffsetZ: number;
  arriveOffsetX: number;
  arriveOffsetZ: number;
  /** Куда смотрит стоящий: обычно на то, ради чего пришёл. */
  faceYaw: number;
  edgeIndex: number;
  /** +1 — по точкам тропы, -1 — навстречу. */
  direction: 1 | -1;
  travelled: number;
  nodeIndex: number;
  /** Куда житель идёт по делу. */
  goalNode: number | undefined;
  plan: number[];
  /** Коридор до цели: точки авторских троп плюс место, где встанем. */
  path: [number, number][];
  waypoint: number;
  destinationNode: number;
  /** Сторона обхода препятствия; держится, пока препятствие не кончится. */
  avoidSign: number;
  avoidHold: number;
  /** Преодоление преграды: 0 — нет, 1 — переступает, 2 — перемахивает. */
  /**
   * 0 — идёт; 1 переступает; 2 перемах с опорой; 3 через бедро; 4 выход
   * силой; 5 сидит; 6 лежит; 7 рубит; 8 кладёт.
   */
  climbKind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Прогресс движения 0→1; из него шейдер строит позу. */
  climbProgress: number;
  climbFromX: number;
  climbFromZ: number;
  climbToX: number;
  climbToZ: number;
  /** Верх преграды: на эту высоту поднимаются бёдра при перемахе. */
  climbTop: number;
  climbDuration: number;
  /** Совместимость с прежним кодом: >0, пока идёт преодоление. */
  vault: number;
  vaultCooldown: number;
  /** Сколько секунд человек стоит впритык и не может двинуться. */
  stuck: number;
  /** Пятится из угла: секунды заднего хода. */
  backOut: number;
  /** Направление, выбранное веером в прошлый кадр (инерция решения). */
  fanYaw: number | undefined;
  /** Сколько раз подряд не удалось дойти по тропам. */
  failedTrips: number;
  /** Секунды выхода из тесноты (зашёл в скопление предметов). */
  escape: number;
  /** Сколько секунд ещё разумно идти к этой цели. */
  walkBudget: number;
  /** Стоит у своей двери и ждёт, пока она откроется. */
  doorWait: number;
  /** Какой вход он сейчас просит открыть (створка стоит стеной, пока закрыта). */
  doorRequest: string | null;
  /** Где эта створка: просьба живёт, пока человек рядом с ней. */
  doorAtX: number;
  doorAtZ: number;
  /** Высота сиденья или лежанки под ним — для позы, а не для столкновений. */
  restY: number;
  /** Сидит ЗА СТОЛОМ: у этого своя механика усадки. */
  atTable: boolean;
  /** Вокруг какого предмета он крутится и сколько уже секунд. */
  orbitId: string | null;
  orbitTime: number;
  /** Следующую цель выбрать подальше — надоело топтаться на месте. */
  wantFar: boolean;
  /** Сколько секунд ещё сидеть или лежать, и сколько было всего. */
  rest: number;
  restDuration: number;
  state: "walking" | "dwelling" | "inside";
  dwell: number;
  /** Фаза шага: растёт от ПРОЙДЕННОГО ПУТИ, а не от времени. */
  phase: number;
  x: number;
  z: number;
  /** Высота стопы: житель идёт ПО настилу и крыльцу, а не сквозь них. */
  y: number;
  yaw: number;
  speed: number;
  visible: boolean;
  seed: number;
  random: () => number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleEdge(
  edge: VillageEdge,
  travelled: number,
): { x: number; z: number; tx: number; tz: number } {
  const clamped = Math.max(0, Math.min(edge.length, travelled));
  let segment = 1;
  while (segment < edge.cumulative.length - 1 && edge.cumulative[segment] < clamped) {
    segment += 1;
  }
  const start = edge.points[segment - 1];
  const end = edge.points[segment];
  const spanStart = edge.cumulative[segment - 1];
  const span = edge.cumulative[segment] - spanStart || 1;
  const t = (clamped - spanStart) / span;
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const inverse = 1 / (Math.hypot(dx, dz) || 1);
  return {
    x: start[0] + dx * t,
    z: start[1] + dz * t,
    tx: dx * inverse,
    tz: dz * inverse,
  };
}

function nodeOf(edge: VillageEdge, direction: 1 | -1): number {
  return direction === 1 ? edge.to : edge.from;
}

function startNodeOf(edge: VillageEdge, direction: 1 | -1): number {
  return direction === 1 ? edge.from : edge.to;
}

/**
 * Кратчайший путь по тропам (Дейкстра, узлов десятки). Цена ребра — длина,
 * делённая на натоптанность: при прочих равных человек идёт привычной
 * тропой, а не формально кратчайшей.
 */
export function planRoute(
  network: VillageNetwork,
  from: number,
  to: number,
): number[] {
  if (from === to) {
    return [];
  }
  const count = network.nodes.length;
  const best = new Array<number>(count).fill(Infinity);
  const viaEdge = new Array<number>(count).fill(-1);
  const viaNode = new Array<number>(count).fill(-1);
  const settled = new Array<boolean>(count).fill(false);
  best[from] = 0;

  for (;;) {
    let current = -1;
    let currentBest = Infinity;
    for (let node = 0; node < count; node += 1) {
      if (!settled[node] && best[node] < currentBest) {
        currentBest = best[node];
        current = node;
      }
    }
    if (current === -1 || current === to) {
      break;
    }
    settled[current] = true;
    for (const edgeIndex of network.adjacency[current]) {
      const edge = network.edges[edgeIndex];
      const far = edge.from === current ? edge.to : edge.from;
      if (far === current) {
        // Петля вокруг дома никуда не ведёт — как транзит она бесполезна.
        continue;
      }
      const cost = edge.length / (0.6 + edge.wear);
      if (best[current] + cost < best[far]) {
        best[far] = best[current] + cost;
        viaEdge[far] = edgeIndex;
        viaNode[far] = current;
      }
    }
  }

  if (viaEdge[to] === -1) {
    return [];
  }
  const path: number[] = [];
  let cursor = to;
  while (cursor !== from && viaEdge[cursor] !== -1) {
    path.push(viaEdge[cursor]);
    cursor = viaNode[cursor];
  }
  return path.reverse();
}

/**
 * Новое поручение. Люди не бродят случайно — они идут ЗА чем-то: по воду, в
 * кузню, к загону, домой. Без этого житель залипает в узлах с большим числом
 * троп (случайное блуждание оседает на хабах), и дальние ветки деревни
 * пустуют.
 */
function chooseGoal(
  plan: SettlementPlan,
  network: VillageNetwork,
  villager: Villager,
  nightPull: number,
  homeNode: number | undefined,
): number | undefined {
  if (nightPull > 0.55 && homeNode !== undefined) {
    return homeNode;
  }
  const haunts = plan.haunts[villager.role] ?? [];
  // Вечер начинается задолго до темноты: к этому часу тянет к огню и домой.
  const evening = nightPull > 0.12;
  const weighted: { node: number; weight: number }[] = [];
  for (const node of network.nodes) {
    if (node.index === villager.nodeIndex) {
      continue;
    }
    let weight = 0;
    if (node.areaId) {
      // Вес места объявлен в описании поселения, а не выведен из формы графа.
      const interest = plan.interest[node.areaId];
      weight = interest ? interest.pull : haunts.includes(node.areaId) ? 3.2 : 0.7;
      if (interest?.roles?.length) {
        const called =
          interest.roles.includes(villager.role) ||
          interest.roles.includes(`resident:${villager.homeId}`) ||
          (villager.female && interest.roles.includes("women")) ||
          (!villager.female && interest.roles.includes("men"));
        // Своё ремесло зовёт заметно сильнее чужого. Когда по карте
        // добавилось полтора десятка новых мест, прежнего перевеса в 2.2 уже
        // не хватало: кузнец мог за смену так и не дойти до кузни.
        weight *= called ? 3.4 : 0.26;
      }
      // Час места против часа суток. Ночь считаем по nightPull, утро — по
      // его отсутствию: до вечера ещё далеко, значит день только начался.
      if (interest?.when === "evening") {
        weight *= evening ? 1.9 : 0.35;
      } else if (interest?.when === "day") {
        weight *= evening ? 0.45 : 1.35;
      } else if (interest?.when === "morning") {
        weight *= nightPull > 0.02 ? 0.4 : 1.5;
      } else if (interest?.when === "night") {
        weight *= nightPull > 0.35 ? 1.8 : 0.3;
      }
      // Детей тянет к загону и к воде — и почти не тянет в кузню.
      if (villager.child) {
        weight = node.areaId === "goat-pen" ? 4 : node.areaId === "well" ? 2 : weight * 0.5;
      }
    } else if (node.homeId === villager.homeId) {
      // Забежать домой — тоже дело; у ребёнка дом главнее прочего.
      weight = villager.child ? 3 : 1.1;
    }
    if (weight > 0) {
      weighted.push({ node: node.index, weight });
    }
  }
  if (weighted.length === 0) {
    return undefined;
  }
  // «Надоело здесь» — тогда следующее дело выбирается подальше: близкие
  // места почти не в счёт, и человек уходит с этого пятачка совсем.
  if (villager.wantFar) {
    villager.wantFar = false;
    for (const entry of weighted) {
      const node = network.nodes[entry.node];
      const away = Math.hypot(node.x - villager.x, node.z - villager.z);
      entry.weight *= 0.15 + Math.min(1.6, away / 22);
    }
  }
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = villager.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.node;
    }
  }
  return weighted[weighted.length - 1].node;
}

function dwellTime(node: VillageNode, random: () => number): number {
  if (node.homeId) {
    return 1.5 + random() * 3;
  }
  if (node.areaId) {
    // На колодце и в кузне задерживаются: там дело.
    return 4 + random() * 11;
  }
  return 0.4 + random() * 1.6;
}

export interface VillagerPopulation {
  /** Описание поселения, по которому живёт это население. */
  readonly settlement: SettlementPlan;
  /** Уровни складов: сколько где лежит, сколько обещано и сколько несут. */
  readonly stores: Map<string, StoreState>;
  readonly storeById: ReadonlyMap<string, SettlementStore>;
  readonly storeNode: ReadonlyMap<string, number>;
  readonly flowById: ReadonlyMap<string, SettlementFlow>;
  /** Сколько единиц доставлено по каждому потоку — для замеров, не для игры. */
  readonly delivered: Map<string, number>;
  /** Секунды до следующей сверки обещаний. */
  reconcileIn: number;
  readonly network: VillageNetwork;
  readonly villagers: Villager[];
  readonly homeNodes: Readonly<Record<string, number | undefined>>;
  /** Препятствия ЖИВОГО мира; null — пустое поле (тесты, карты без сцены). */
  field: ObstacleField | null;
  /** Сломанные куски: разрушенное перестаёт быть препятствием сразу. */
  broken: ReadonlySet<string>;
  /** Входы, распахнутые кем-то ещё (игроком) — приходят из HingedDoorSystem. */
  externalOpenDoors: ReadonlySet<string>;
  /** Входы, через которые СЕЙЧАС можно пройти. */
  openDoors: Set<string>;
  /**
   * Состояние каждого входа: сколько его просят (press) и сколько ему ещё
   * стоять открытым (hold). Створка не распахивается в тот же кадр — ей нужно
   * полсекунды, — и не захлопывается сразу, как только житель отвёл взгляд:
   * иначе дверь истерически хлопает, потому что закрытую створку житель видит
   * как стену, просит открыть, а открытую уже не видит и просить перестаёт.
   */
  doorState: Map<string, { press: number; hold: number }>;
  /** Что можно пройти насквозь: сломанное плюс створки открытых входов. */
  seeThrough: Set<string>;
  /** Кого именно жители просят открыть в этом кадре. */
  doorRequests: Set<string>;
}

/**
 * Пересобирает набор «сквозного»: сломанные куски плюс створки тех входов,
 * которые уже распахнуты. Пока вход закрыт, его створка — обычная стена, и
 * житель честно стоит перед ней, а не проходит насквозь.
 */
/** Полсекунды на распах, три секунды на самозакрытие без просящих. */
const DOOR_SWING_DELAY = 0.5;
const DOOR_LINGER = 3;

function ageDoors(population: VillagerPopulation, step: number): void {
  population.openDoors.clear();
  for (const id of population.externalOpenDoors) {
    population.openDoors.add(id);
  }
  for (const [id, entry] of population.doorState) {
    // Просьбы этого кадра ещё не пришли — гасим давление и выдержку.
    entry.press = Math.max(0, entry.press - step * 1.6);
    entry.hold = Math.max(0, entry.hold - step);
    if (entry.press <= 0 && entry.hold <= 0) {
      population.doorState.delete(id);
      continue;
    }
    if (entry.hold > 0) {
      population.openDoors.add(id);
    }
  }
}

/** Просьба открыть: копит давление, а распахнув — сбрасывает самозакрытие. */
export function requestDoor(population: VillagerPopulation, id: string, step: number): void {
  population.doorRequests.add(id);
  const entry = population.doorState.get(id) ?? { press: 0, hold: 0 };
  entry.press += step * 2.6;
  if (entry.press >= DOOR_SWING_DELAY) {
    entry.hold = DOOR_LINGER;
  }
  population.doorState.set(id, entry);
}

function refreshSeeThrough(population: VillagerPopulation): void {
  const { field, broken, openDoors, seeThrough } = population;
  seeThrough.clear();
  for (const id of broken) {
    seeThrough.add(id);
  }
  if (!field) {
    return;
  }
  // Прозрачна не «дверь», а то её положение, которого сейчас нет: у открытой
  // исчезает створка в проёме, у закрытой — створка сбоку. Сама доска стоит
  // всегда, поэтому сквозь распахнутую половину не пройдёшь.
  for (const [doorId, leaves] of field.doorPieces) {
    for (const id of openDoors.has(doorId) ? leaves.closed : leaves.open) {
      seeThrough.add(id);
    }
  }
}

/**
 * РАБОТА КАК СПРОС. Дело не назначается человеку списком: оно рождается парой
 * «в источнике есть — у приёмника место». Поэтому цепочка «лес → колода →
 * поленница → очаг» нигде не записана: очаг сжёг дрова, поленница просела,
 * появилась работа носить; куча просела — появилась работа колоть.
 *
 * Резервируется НЕ предмет, а единица количества: у полена нет личности, есть
 * два числа на складе. Иначе пятеро идут за последним поленом.
 */
export interface StoreState {
  level: number;
  /** Сколько единиц уже обещано уходящим за ними. */
  reserved: number;
  /** Сколько единиц несут сюда — место под них занято заранее. */
  incoming: number;
}

export interface VillagerJob {
  readonly flowId: string;
  /**
   * Дошёл → поработал → донёс → положил. Работа отделена от переноса
   * НАРОЧНО: колют с пустыми руками, а кладут — с полными, и поза у этих
   * двух состояний разная.
   */
  phase: "toSource" | "working" | "toTarget" | "delivering";
  /** Сколько секунд человек уже занят этим делом. */
  age: number;
}

/** Сколько длится само действие у склада. Ходьба сюда не входит. */
function workVerbSeconds(verb: SettlementWorkVerb, random: () => number): number {
  if (verb === "chop") {
    // Свалить или расколоть — это серия ударов, а не один взмах.
    return 7 + random() * 4;
  }
  if (verb === "stack") {
    return 2.6 + random() * 1.8;
  }
  if (verb === "feed") {
    return 2 + random() * 1.4;
  }
  return 1 + random() * 1.2;
}

/** Дело брошено: обещанное надо вернуть, иначе склад «занят» навсегда. */
function releaseJob(population: VillagerPopulation, villager: Villager): void {
  const job = villager.job;
  if (!job) {
    return;
  }
  const flow = population.flowById.get(job.flowId);
  if (flow) {
    const from = population.stores.get(flow.from);
    const to = population.stores.get(flow.to);
    if ((job.phase === "toSource" || job.phase === "working") && from) {
      from.reserved = Math.max(0, from.reserved - 1);
    }
    if (to) {
      to.incoming = Math.max(0, to.incoming - (flow.yield ?? 1));
    }
  }
  villager.job = null;
}

/**
 * Сверка обещаний. Инвариант: «зарезервировано = сумма дел живых работников».
 * Держать его правкой каждой ветки нельзя — ровно так утекал `doorWait`.
 * Поэтому раз в несколько секунд числа пересчитываются заново и расхождение
 * чинится молча.
 */
function reconcileStores(population: VillagerPopulation): void {
  for (const store of population.stores.values()) {
    store.reserved = 0;
    store.incoming = 0;
  }
  for (const villager of population.villagers) {
    const job = villager.job;
    if (!job) {
      continue;
    }
    const flow = population.flowById.get(job.flowId);
    if (!flow) {
      villager.job = null;
      continue;
    }
    if (job.phase === "toSource" || job.phase === "working") {
      const from = population.stores.get(flow.from);
      if (from) {
        from.reserved += 1;
      }
    }
    const to = population.stores.get(flow.to);
    if (to) {
      to.incoming += flow.yield ?? 1;
    }
  }
}

/** Лес отрастает, очаг прогорает. Мир меняется и без людей. */
function ageStores(population: VillagerPopulation, step: number): void {
  for (const definition of population.settlement.stores ?? []) {
    const store = population.stores.get(definition.id);
    if (!store) {
      continue;
    }
    if (definition.growthPerMinute) {
      store.level = Math.min(
        definition.capacity,
        store.level + (definition.growthPerMinute * step) / 60,
      );
    }
    if (definition.burnPerMinute) {
      store.level = Math.max(0, store.level - (definition.burnPerMinute * step) / 60);
    }
  }
}

function flowSuitsVillager(
  flow: SettlementFlow,
  villager: Villager,
  nightPull: number,
): boolean {
  if (villager.child) {
    return false;
  }
  if (flow.roles?.length) {
    const called =
      flow.roles.includes(villager.role) ||
      (villager.female && flow.roles.includes("women")) ||
      (!villager.female && flow.roles.includes("men"));
    if (!called) {
      return false;
    }
  }
  if (flow.when === "day" && nightPull > 0.12) {
    return false;
  }
  if (flow.when === "evening" && nightPull <= 0.12) {
    return false;
  }
  return true;
}

/**
 * Взять дело, если оно есть. Работа — КАНДИДАТ наравне с притяжением мест, а
 * не перехват: иначе кузнец весь день у наковальни, а улицы пустеют.
 */
function chooseWork(
  population: VillagerPopulation,
  villager: Villager,
  nightPull: number,
): void {
  if (villager.job || nightPull > 0.45) {
    return;
  }
  const options: { flow: SettlementFlow; weight: number }[] = [];
  for (const flow of population.settlement.flows ?? []) {
    if (!flowSuitsVillager(flow, villager, nightPull)) {
      continue;
    }
    const from = population.stores.get(flow.from);
    const to = population.stores.get(flow.to);
    const fromPlan = population.storeById.get(flow.from);
    const toPlan = population.storeById.get(flow.to);
    if (!from || !to || !fromPlan || !toPlan) {
      continue;
    }
    const yielded = flow.yield ?? 1;
    // Вся работа мира — вот это условие. Больше ничего.
    if (from.level - from.reserved < 1) {
      continue;
    }
    if (to.level + to.incoming + yielded > toPlan.capacity) {
      continue;
    }
    const away = distance(fromPlan.at[0], fromPlan.at[1], villager.x, villager.z);
    // Чем пустее приёмник, тем нужнее ходка: очаг на исходе зовёт сильнее
    // поленницы, в которой ещё половина.
    const need = 1 - (to.level + to.incoming) / toPlan.capacity;
    options.push({
      flow,
      weight: (flow.pull ?? 2.5) * (0.35 + need) * (12 / (12 + away)),
    });
  }
  if (options.length === 0) {
    return;
  }
  const total = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = villager.random() * total;
  let picked = options[options.length - 1];
  for (const entry of options) {
    roll -= entry.weight;
    if (roll <= 0) {
      picked = entry;
      break;
    }
  }
  const from = population.stores.get(picked.flow.from);
  const to = population.stores.get(picked.flow.to);
  if (!from || !to) {
    return;
  }
  from.reserved += 1;
  to.incoming += picked.flow.yield ?? 1;
  villager.job = { flowId: picked.flow.id, phase: "toSource", age: 0 };
}

/**
 * Человек пришёл туда, куда шёл по делу. Возвращает true, если он занят
 * действием и никакой новой цели ему сейчас не нужно.
 */
function advanceWork(population: VillagerPopulation, villager: Villager): boolean {
  const job = villager.job;
  if (!job) {
    return false;
  }
  const flow = population.flowById.get(job.flowId);
  if (!flow) {
    villager.job = null;
    return false;
  }
  const atSource = job.phase === "toSource" || job.phase === "working";
  const targetId = atSource ? flow.from : flow.to;
  const target = population.storeById.get(targetId);
  const store = population.stores.get(targetId);
  if (!target || !store) {
    releaseJob(population, villager);
    return false;
  }
  if (distance(target.at[0], target.at[1], villager.x, villager.z) > 3.6) {
    return false;
  }
  const faceWork = (): void => {
    villager.faceYaw = Math.atan2(
      target.at[0] - villager.x,
      target.at[1] - villager.z,
    );
  };
  // Поза встаёт В ТОТ ЖЕ КАДР, что и глагол: иначе первый кадр работы человек
  // стоит столбом, а со стороны это читается как заминка.
  const startPose = (verb: SettlementWorkVerb): void => {
    villager.workVerb = verb;
    villager.climbKind = verb === "chop" ? 7 : 8;
    villager.climbProgress = 0;
  };

  if (job.phase === "toSource") {
    if (store.level - 0 < 1) {
      // Пока шли, разобрали. Дело отменяется честно, вместе с обещанием.
      releaseJob(population, villager);
      return false;
    }
    // Сначала РАБОТА, и только потом ноша: валят и колют с пустыми руками.
    job.phase = "working";
    startPose(flow.take);
    villager.dwell = workVerbSeconds(flow.take, villager.random);
    faceWork();
    return true;
  }

  if (job.phase === "working") {
    if (store.level < 1) {
      releaseJob(population, villager);
      villager.workVerb = null;
      return false;
    }
    store.level -= 1;
    store.reserved = Math.max(0, store.reserved - 1);
    job.phase = "toTarget";
    villager.cargo = flow.cargo;
    villager.carries = true;
    villager.carryDrop = 0;
    villager.carryLinger = 0;
    villager.workVerb = null;
    villager.climbKind = 0;
    villager.climbProgress = 0;
    villager.dwell = 0.5 + villager.random() * 0.6;
    faceWork();
    return true;
  }

  if (job.phase === "toTarget") {
    job.phase = "delivering";
    startPose(flow.put);
    villager.dwell = workVerbSeconds(flow.put, villager.random);
    faceWork();
    return true;
  }

  const yielded = flow.yield ?? 1;
  store.level = Math.min(target.capacity, store.level + yielded);
  store.incoming = Math.max(0, store.incoming - yielded);
  villager.job = null;
  villager.cargo = null;
  villager.workVerb = null;
  villager.climbKind = 0;
  villager.climbProgress = 0;
  villager.carries = false;
  villager.carryDrop = 1;
  villager.carryLinger = 2.4;
  villager.dwell = 0.6 + villager.random() * 1.2;
  faceWork();
  population.delivered.set(
    flow.id,
    (population.delivered.get(flow.id) ?? 0) + yielded,
  );
  return true;
}

/**
 * Видимость кусков, которыми показан уровень складов: полная поленница видна
 * целиком, пустая не видна вовсе. Гасим С КОНЦА — верхние поленья уносят
 * первыми, как и в жизни.
 */
export function storePieceVisibility(
  population: VillagerPopulation,
): Map<string, boolean> {
  const visibility = new Map<string, boolean>();
  for (const definition of population.settlement.stores ?? []) {
    const pieces = definition.pieces;
    const state = population.stores.get(definition.id);
    if (!pieces?.length || !state || definition.capacity <= 0) {
      continue;
    }
    const shown = Math.round((state.level / definition.capacity) * pieces.length);
    pieces.forEach((pieceId, index) => {
      visibility.set(pieceId, index < shown);
    });
  }
  return visibility;
}

/** Куда идти по текущему делу. */
function workGoalNode(
  population: VillagerPopulation,
  villager: Villager,
): number | undefined {
  const job = villager.job;
  if (!job) {
    return undefined;
  }
  const flow = population.flowById.get(job.flowId);
  if (!flow) {
    return undefined;
  }
  const atSource = job.phase === "toSource" || job.phase === "working";
  return population.storeNode.get(atSource ? flow.from : flow.to);
}

/** Ближайший узел сети к точке — «где я на самом деле стою». */
function nearestNodeTo(network: VillageNetwork, x: number, z: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (const node of network.nodes) {
    const gap = distance(node.x, node.z, x, z);
    if (gap < bestDistance) {
      bestDistance = gap;
      best = node.index;
    }
  }
  return best;
}

/** Куда приведёт план, если идти от `from` по его рёбрам. */
function destinationOf(
  network: VillageNetwork,
  from: number,
  plan: readonly number[],
): number {
  let cursor = from;
  for (const edgeIndex of plan) {
    const edge = network.edges[edgeIndex];
    cursor = edge.from === cursor ? edge.to : edge.from;
  }
  return cursor;
}

/**
 * Разворачивает план (рёбра) в коридор — сплошную цепочку точек авторских
 * троп. Дальше по нему идёт не «параметр на ребре», а живой шаг: коридор
 * только притягивает, отклоняться от него можно.
 */
function buildPath(
  network: VillageNetwork,
  villager: Villager,
  plan: readonly number[],
  destination: number,
): void {
  const points: [number, number][] = [];
  let cursor = villager.nodeIndex;
  for (const edgeIndex of plan) {
    const edge = network.edges[edgeIndex];
    const forward = edge.from === cursor;
    const ordered = forward ? edge.points : [...edge.points].reverse();
    for (const [index, point] of ordered.entries()) {
      if (index === 0 && points.length > 0) {
        continue;
      }
      points.push([point[0], point[1]]);
    }
    cursor = forward ? edge.to : edge.from;
  }
  if (points.length > 1) {
    const target = network.nodes[destination];
    points[points.length - 1] = [
      target.x + villager.arriveOffsetX,
      target.z + villager.arriveOffsetZ,
    ];
  }
  villager.path = points;
  villager.waypoint = points.length > 1 ? 1 : 0;
  villager.destinationNode = destination;
}

export function createVillagerPopulation(
  plan: SettlementPlan,
  count = 24,
  field: ObstacleField | null = null,
): VillagerPopulation {
  const network = buildSettlementNetwork(plan);
  const homeNodes: Record<string, number | undefined> = {};
  for (const dwelling of plan.dwellings) {
    const node = network.nodes.find((candidate) => candidate.homeId === dwelling.id);
    homeNodes[dwelling.id] = node?.index;
  }

  // Расселяем только по той части сети, что связана с деревней: если тропа
  // оказалась изолированным куском, житель на ней ходил бы взад-вперёд
  // вечно, не в силах дойти ни до одного дела.
  const rootNode = network.nodes.find((node) => node.homeId)?.index ?? 0;
  const reachable = new Set<number>([rootNode]);
  const queue = [rootNode];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const edgeIndex of network.adjacency[current]) {
      const edge = network.edges[edgeIndex];
      const far = edge.from === current ? edge.to : edge.from;
      if (!reachable.has(far)) {
        reachable.add(far);
        queue.push(far);
      }
    }
  }
  // Селим строго В УЗЛАХ живой части сети: житель, поставленный посреди
  // ребра, но считающий себя в узле, строит коридор от чужой точки — и
  // уходит через полдеревни или просыпается внутри стены.
  const spawnNodes = network.nodes
    .filter((node) => reachable.has(node.index))
    .map((node) => node.index);

  // Список расселения: дверь повторяется столько раз, сколько за ней жильцов.
  // Брошенный корпус с нулём жильцов в список не попадает вовсе — там некому
  // жить, туда только заглядывают.
  const roster: SettlementDwelling[] = [];
  for (const dwelling of plan.dwellings) {
    for (let slot = 0; slot < dwelling.residents; slot += 1) {
      roster.push(dwelling);
    }
  }
  const lodging = roster.length > 0 ? roster : plan.dwellings;

  const villagers: Villager[] = [];
  for (let index = 0; index < count; index += 1) {
    const home = lodging[index % lodging.length];
    const random = mulberry32(index * 2654435761 + 17);
    const role =
      home.roles.length > 0
        ? home.roles[Math.floor(index / lodging.length) % home.roles.length]
        : "worker";
    const spawnNode = spawnNodes[Math.floor(random() * spawnNodes.length)];
    const spawnPoint = network.nodes[spawnNode];
    const spawnAngle = random() * Math.PI * 2;
    const spawnReach = 0.3 + random() * 0.7;
    // Каждый пятый — ребёнок: домовые петли в плане так и подписаны —
    // «детская беготня и дрова вокруг обжитого дома».
    const childEvery = plan.childEvery ?? 0;
    const child = childEvery > 0 && index % childEvery === childEvery - 1;
    // Деревня надвое. Не «разбавили», а ДОБАВИЛИ: жительниц и девочек столько
    // же, сколько мужчин и мальчишек, оттого и население выросло.
    const femaleEvery = plan.femaleEvery ?? 0;
    const female = femaleEvery > 0 && index % femaleEvery === femaleEvery - 1;
    // Женский сложением уже, ребёнок — мельче обоих.
    const build =
      (child ? 0.6 + random() * 0.12 : 0.88 + random() * 0.28) * (female ? 0.955 : 1);
    const villager: Villager = {
      id: `${home.id}:${index}`,
      homeId: home.id,
      role,
      build,
      // Длина шага следует за ростом: коротышка семенит, высокий шагает.
      // 0.65–0.85 м при скорости 1.05–1.5 м/с — это каденс около 100–115
      // шагов в минуту, то есть человеческий, а не мультяшный.
      // Женский шаг короче при более частом каденсе — это из тех же данных
      // анализа походки, из которых выведен мужской размах бедра.
      strideLength: (0.65 + random() * 0.2) * build * (female ? 0.9 : 1),
      baseSpeed: (1.05 + random() * 0.45) * (0.9 + build * 0.1),
      dye: plan.wardrobe.dyes[Math.floor(random() * plan.wardrobe.dyes.length)],
      carries: !child && random() > 0.68,
      carryDrop: 0,
      cargo: null,
      job: null,
      workVerb: null,
      carryLinger: 0,
      child,
      female,
      wear: Math.max(
        0,
        Math.min(
          1,
          (child ? 0.55 : 0.15) +
            (plan.wardrobe.grimeByRole?.[role] ?? 0) +
            random() * 0.35 * (plan.wardrobe.wearSpread ?? 1),
        ),
      ),
      // Дети лезут через всё; взрослые — по настроению и редко.
      mischief: child ? 0.5 + random() * 0.5 : random() * 0.3,
      lateralBias: (random() - 0.5) * 0.6,
      lateralTarget: (random() - 0.5) * 0.6,
      paceDrift: (random() - 0.5) * 1.2,
      lateral: (random() - 0.5) * 0.6,
      departOffsetX: 0,
      departOffsetZ: 0,
      arriveOffsetX: 0,
      arriveOffsetZ: 0,
      faceYaw: 0,
      edgeIndex: 0,
      direction: 1,
      travelled: 0,
      nodeIndex: spawnNode,
      goalNode: undefined,
      plan: [],
      path: [],
      waypoint: 0,
      destinationNode: spawnNode,
      avoidSign: 0,
      avoidHold: 0,
      climbKind: 0,
      climbProgress: 0,
      climbFromX: 0,
      climbFromZ: 0,
      climbToX: 0,
      climbToZ: 0,
      climbTop: 0,
      climbDuration: 1,
      vault: 0,
      vaultCooldown: 0,
      stuck: 0,
      backOut: 0,
      fanYaw: undefined,
      failedTrips: 0,
      escape: 0,
      walkBudget: 0,
      doorWait: 0,
      doorRequest: null,
      doorAtX: 0,
      doorAtZ: 0,
      atTable: false,
      orbitId: null,
      orbitTime: 0,
      wantFar: false,
      restY: 0,
      rest: 0,
      restDuration: 0,
      // Первое дело житель получит на первом же шаге симуляции.
      state: "dwelling",
      dwell: 0.2 + random() * 2.5,
      phase: random() * Math.PI * 2,
      x: spawnPoint.x + Math.cos(spawnAngle) * spawnReach,
      z: spawnPoint.z + Math.sin(spawnAngle) * spawnReach,
      y: 0,
      yaw: random() * Math.PI * 2,
      speed: 0,
      visible: true,
      seed: random(),
      random,
    };
    villagers.push(villager);
  }

  // Склады и их узлы. Узел — ближайший к складу: к поленнице и к очагу ходят
  // по тем же тропам, что и всегда, отдельной дороги «для работы» нет.
  const storeById = new Map((plan.stores ?? []).map((store) => [store.id, store]));
  const stores = new Map<string, StoreState>();
  const storeNode = new Map<string, number>();
  for (const store of plan.stores ?? []) {
    stores.set(store.id, {
      level: Math.min(store.capacity, store.initial),
      reserved: 0,
      incoming: 0,
    });
    storeNode.set(store.id, nearestNodeTo(network, store.at[0], store.at[1]));
  }

  return {
    settlement: plan,
    network,
    villagers,
    homeNodes,
    stores,
    storeById,
    storeNode,
    flowById: new Map((plan.flows ?? []).map((flow) => [flow.id, flow])),
    delivered: new Map<string, number>(),
    reconcileIn: 5,
    field,
    broken: new Set<string>(),
    externalOpenDoors: new Set<string>(),
    openDoors: new Set<string>(),
    doorState: new Map<string, { press: number; hold: number }>(),
    seeThrough: new Set<string>(),
    doorRequests: new Set<string>(),
  };
}

function shortestAngleTo(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Шаг симуляции. `night` — 0 днём, 1 ночью (тот же ref, что у ламп и тумана).
 */
/**
 * Жёсткая гарантия «сквозь предметы не ходят»: выталкивание по ближайшей
 * грани. Применяется после ЛЮБОГО перемещения — в том числе когда человек
 * пятится из угла, иначе он вминается в стену за спиной.
 */
function resolveCollisions(
  villager: Villager,
  field: ObstacleField,
  broken: ReadonlySet<string>,
): void {
  // Выбираясь из тесноты, человек ПРОТИСКИВАЕТСЯ: втягивает плечи и идёт
  // боком между бочками. Без этого карман уже собственной ширины становится
  // вечной ловушкой — выталкивание гасит любой шаг.
  const radius = villager.escape > 0 ? 0.13 : 0.32;
  for (const box of field.query(villager.x, villager.z, 1.1, broken)) {
    // То, на что можно взойти, не отталкивает: это пол, а не стена.
    if (box.top <= villager.y + STEP_UP_HEIGHT) {
      continue;
    }
    const gap = distanceToBox(box, villager.x, villager.z);
    if (gap > radius) {
      continue;
    }
    const [nearestX, nearestZ] = closestPointOnBox(box, villager.x, villager.z);
    const dx = villager.x - nearestX;
    const dz = villager.z - nearestZ;
    const length = Math.hypot(dx, dz);
    if (length > 1e-4) {
      villager.x = nearestX + (dx / length) * radius;
      villager.z = nearestZ + (dz / length) * radius;
    } else {
      // Ровно на грани: выходим по нормали ближайшей стороны в осях куска.
      const sin = Math.sin(box.yaw);
      const cos = Math.cos(box.yaw);
      const localX = (villager.x - box.centerX) * cos - (villager.z - box.centerZ) * sin;
      const localZ = (villager.x - box.centerX) * sin + (villager.z - box.centerZ) * cos;
      const outX = Math.abs(box.halfX - Math.abs(localX));
      const outZ = Math.abs(box.halfZ - Math.abs(localZ));
      const pushLocalX = outX < outZ ? Math.sign(localX || 1) * (box.halfX + radius) : localX;
      const pushLocalZ = outX < outZ ? localZ : Math.sign(localZ || 1) * (box.halfZ + radius);
      villager.x = box.centerX + pushLocalX * cos + pushLocalZ * sin;
      villager.z = box.centerZ - pushLocalX * sin + pushLocalZ * cos;
    }
  }
}

/**
 * Сесть или лечь — если есть НА ЧТО и если захотелось.
 *
 * Мебель не перечисляется списком: сиденье узнаётся по геометрии, поэтому
 * годятся и лавки зала, и табурет у котла, и лавка на улице у общинного огня,
 * и любая, которую поставят завтра. Лежанка отличается от лавки шириной:
 * на 0.55 м не полежишь, на 0.96 м — да.
 *
 * Это ВОЗМОЖНОСТЬ, а не обязанность: человек может пройти мимо и постоять.
 */
function maybeRest(
  villager: Villager,
  field: ObstacleField,
  seeThrough: ReadonlySet<string>,
  nightPull: number,
): void {
  // Перед ночью не рассиживаются: дорога домой важнее.
  if (nightPull > 0.45 || villager.random() > 0.4) {
    return;
  }
  let seat: ObstacleBox | null = null;
  let bed: ObstacleBox | null = null;
  let seatGap = Infinity;
  let bedGap = Infinity;
  for (const box of field.query(villager.x, villager.z, 1.9, seeThrough)) {
    if (box.doorId || box.bottom > 0.12) {
      continue;
    }
    const gap = distanceToBox(box, villager.x, villager.z);
    if (gap > 1.5) {
      continue;
    }
    const narrow = Math.min(box.halfX, box.halfZ);
    const long = Math.max(box.halfX, box.halfZ);
    // Лежанка: широкая и низкая. Лавка, табурет, престол: по высоте сиденья.
    if (box.top >= 0.28 && box.top <= 0.62 && narrow >= 0.4 && long >= 0.8) {
      if (gap < bedGap) {
        bedGap = gap;
        bed = box;
      }
    } else if (box.top >= 0.36 && box.top <= 0.74 && long >= 0.45 && narrow >= 0.11) {
      if (gap < seatGap) {
        seatGap = gap;
        seat = box;
      }
    }
  }
  // Ложатся ближе к ночи и только на настоящую лежанку.
  const target = bed && nightPull > 0.2 ? bed : seat;
  if (!target) {
    return;
  }
  const lying = target === bed && nightPull > 0.2;
  villager.climbKind = lying ? 6 : 5;
  villager.climbProgress = 0;
  villager.restY = target.top;
  // Отдых укладывается в уже отмеренное стояние и НЕ удлиняет его: иначе
  // посиделки съедают день и человек не успевает по своим делам.
  villager.restDuration = Math.max(2.5, villager.dwell - 0.6);
  villager.rest = villager.restDuration;
  // Садятся НА сиденье, а не рядом с ним. Прежде я ставил человека на край
  // габарита да ещё отодвигал на 0.2 м наружу — получалось, что он сидит в
  // метре от лавки в воздухе. Правильно: спроецировать его на ОСЬ сиденья,
  // сесть по её середине по глубине и вдоль — там, где он подошёл.
  const sin = Math.sin(target.yaw);
  const cos = Math.cos(target.yaw);
  const relX = villager.x - target.centerX;
  const relZ = villager.z - target.centerZ;
  let localAlong = relX * cos - relZ * sin;
  const localAcross = relX * sin + relZ * cos;
  const alongRoom = Math.max(0, target.halfX - 0.3);
  localAlong = Math.max(-alongRoom, Math.min(alongRoom, localAlong));
  // Поперёк — по центру сиденья: сел, а не примостился с краю.
  const acrossSeat = lying ? 0 : Math.sign(localAcross || 1) * Math.min(0.1, target.halfZ * 0.3);
  villager.x = target.centerX + localAlong * cos + acrossSeat * sin;
  villager.z = target.centerZ - localAlong * sin + acrossSeat * cos;

  // Куда смотрит сидящий. Если перед лавкой стол — лицом К СТОЛУ: за стол
  // садятся к нему, а не спиной. Иначе — наружу от лавки, к огню и людям.
  const alongYaw = Math.atan2(cos, -sin);
  const outwardYaw = Math.atan2(sin * Math.sign(localAcross || 1), cos * Math.sign(localAcross || 1));
  let table: ObstacleBox | null = null;
  let tableGap = Infinity;
  for (const box of field.query(villager.x, villager.z, 1.9, seeThrough)) {
    if (box.top < 0.85 || box.top > 1.35) {
      continue;
    }
    const gap = distanceToBox(box, villager.x, villager.z);
    if (gap < tableGap && gap < 1.3) {
      tableGap = gap;
      table = box;
    }
  }
  villager.atTable = !lying && table !== null;
  villager.faceYaw = lying
    ? alongYaw
    : table
      ? Math.atan2(table.centerX - villager.x, table.centerZ - villager.z)
      : outwardYaw;
}

export function stepVillagers(
  population: VillagerPopulation,
  delta: number,
  night: number,
): void {
  const { settlement, network, villagers, homeNodes } = population;
  const step = Math.min(delta, 0.1);
  const nightPull = Math.max(0, Math.min(1, (night - 0.3) / 0.45));
  // Створки стареют раньше всего: то, что открыто сейчас, определяет, где
  // сегодня стена, а где проём.
  ageDoors(population, step);
  refreshSeeThrough(population);
  population.doorRequests.clear();
  // Мир меняется и без людей: лес отрастает, очаг прогорает. Спрос на работу
  // берётся отсюда, а не из расписания.
  ageStores(population, step);
  population.reconcileIn -= step;
  if (population.reconcileIn <= 0) {
    population.reconcileIn = 5;
    reconcileStores(population);
  }

  for (const villager of villagers) {
    const homeNode = homeNodes[villager.homeId];

    if (villager.state === "inside") {
      villager.speed = 0;
      villager.visible = false;
      // Утро: выходят не все разом — у каждого свой час.
      if (night < 0.24 + villager.seed * 0.16) {
        villager.state = "dwelling";
        villager.dwell = villager.random() * 3;
        villager.visible = true;
      }
      continue;
    }

    villager.visible = true;

    // Дело не живёт вечно: застрял, заболтался, ушёл спать — обещание надо
    // вернуть, иначе склад считается занятым до конца дня.
    if (villager.job) {
      villager.job.age += step;
      if (villager.job.age > 260) {
        releaseJob(population, villager);
      }
    }

    if (villager.state === "dwelling") {
      villager.speed = 0;
      // ДОНЁС — ПОСТАВИЛ. Короб опускается перед собой за 0.9 с, пару секунд
      // лежит на виду и пропадает; дальше человек идёт обычным жителем, а
      // ношу подхватит уже кто-то другой и в другой раз.
      if (villager.carries && !villager.job) {
        villager.carryDrop = Math.min(1, villager.carryDrop + step / 0.9);
        if (villager.carryDrop >= 1) {
          villager.carryLinger += step;
          if (villager.carryLinger > 2.2) {
            villager.carries = false;
            villager.carryDrop = 0;
            villager.carryLinger = 0;
          }
        }
        villager.dwell = Math.max(villager.dwell, 0.35);
      }
      // Сидящего и лежащего не толкаем: он уже устроился. Но доворачивается
      // он по-человечески плавно, а не щелчком.
      if (villager.rest > 0) {
        villager.yaw +=
          shortestAngleTo(villager.yaw, villager.faceYaw) * Math.min(1, step * 2.4);
        villager.rest -= step;
        villager.dwell -= step;
        if (villager.rest <= 0) {
          villager.rest = 0;
          villager.climbKind = 0;
          villager.climbProgress = 0;
          villager.y = 0;
        } else {
          // Сесть и встать — не мгновенно: доля секунды на вход и на выход.
          const settle = Math.min(1, (villager.restDuration - villager.rest) / 0.8);
          const rise = Math.min(1, villager.rest / 0.7);
          villager.climbProgress = Math.min(settle, rise);
          continue;
        }
      }
      // Стоящего тоже нельзя оставлять внутри столба или поленницы: его мог
      // затолкать туда сосед, пока он ждал.
      if (population.field) {
        resolveCollisions(villager, population.field, population.seeThrough);
      }
      // Стоя человек доворачивается к делу, а не замирает истуканом.
      villager.yaw +=
        shortestAngleTo(villager.yaw, villager.faceYaw) * Math.min(1, step * 3);
      // РАБОЧАЯ ПОЗА идёт циклами, пока длится дело: рубка — серия ударов,
      // укладка — серия наклонов. Период взят из справочника механики
      // (docs/work-motion-mechanics.md): тяжёлое движение не бывает частым.
      if (villager.workVerb && villager.rest <= 0) {
        const cycle = villager.workVerb === "chop" ? 2.9 : 2.2;
        villager.climbKind = villager.workVerb === "chop" ? 7 : 8;
        villager.climbProgress = (villager.climbProgress + step / cycle) % 1;
        villager.yaw +=
          shortestAngleTo(villager.yaw, villager.faceYaw) * Math.min(1, step * 3);
      } else if (villager.climbKind >= 7) {
        villager.climbKind = 0;
        villager.climbProgress = 0;
      }
      villager.dwell -= step;
      if (villager.dwell > 0) {
        // Пришёл на место, где садятся, и рядом есть на что сесть — садится.
        // Это ВОЗМОЖНОСТЬ, а не обязанность: половину раз просто постоит.
        if (
          villager.rest <= 0 &&
          villager.climbKind === 0 &&
          villager.dwell > 3 &&
          population.field
        ) {
          maybeRest(villager, population.field, population.seeThrough, nightPull);
        }
        continue;
      }
      if (villager.climbKind >= 7) {
        villager.climbKind = 0;
        villager.climbProgress = 0;
      }
      villager.workVerb = null;
      const node = network.nodes[villager.nodeIndex];
      // Ночью, дойдя до своей двери, житель уходит в дом.
      // Уйти в дом можно, только СТОЯ у своей двери. Раньше проверялся лишь
      // номер узла — и житель, которого правило хоровода остановило посреди
      // деревни с прежним номером, ложился спать прямо там.
      if (
        nightPull > 0.75 &&
        node.homeId === villager.homeId &&
        Math.hypot(villager.x - node.x, villager.z - node.z) < 3
      ) {
        villager.state = "inside";
        villager.visible = false;
        releaseJob(population, villager);
        continue;
      }
      // Пришёл по делу — делает дело. Действие занимает уже отмеренное
      // стояние: работа не удлиняет день, она его наполняет.
      if (advanceWork(population, villager)) {
        continue;
      }
      // НОЧЬЮ ДЕЛО УСТУПАЕТ ДОРОГЕ ДОМОЙ. Иначе взявшийся за работу под вечер
      // так и ходит между складами: цель работы перекрывала домашнюю, и до
      // двери человек не доходил вовсе.
      if (nightPull > 0.55) {
        releaseJob(population, villager);
        villager.workVerb = null;
      }
      chooseWork(population, villager, nightPull);
      // Работа — КАНДИДАТ, а не перехват: если дела нет, всё идёт как прежде.
      const goal =
        workGoalNode(population, villager) ??
        chooseGoal(settlement, network, villager, nightPull, homeNode);
      const plan =
        goal === undefined ? [] : planRoute(network, villager.nodeIndex, goal);
      if (plan.length === 0) {
        // Цель недостижима или мы уже на месте: пройтись вокруг дома или по
        // ближайшей тропе — всё лучше, чем стоять столбом.
        const options = network.adjacency[villager.nodeIndex];
        if (!options || options.length === 0) {
          villager.dwell = 2;
          continue;
        }
        plan.push(options[Math.floor(villager.random() * options.length)]);
      }
      // Уходя с рабочего места, могут взять новую ношу — так роль и ходит по
      // деревне, а не закрепляется за одними и теми же людьми навсегда.
      if (!villager.carries && !villager.child && villager.random() < 0.22) {
        const here = network.nodes[villager.nodeIndex];
        if (here?.areaId && settlement.interest[here.areaId]?.doing === "work") {
          villager.carries = true;
          villager.carryDrop = 0;
          villager.carryLinger = 0;
        }
      }
      villager.goalNode = goal;
      // Где встанем в конце — не в самой точке узла, а вокруг неё.
      const finalNode = destinationOf(network, villager.nodeIndex, plan);
      const target = network.nodes[finalNode];
      // К ДВЕРИ подходят по нормали, а не по диагонали сквозь стену: точка
      // остановки выносится прямо перед порогом, лицом к нему.
      const targetHome = target.homeId
        ? settlement.dwellings.find((dwelling) => dwelling.id === target.homeId)
        : undefined;
      const spread = target.areaId ? 1.5 : target.homeId ? 0.7 : 0.5;
      const spot = targetHome
        ? Math.atan2(Math.sin(targetHome.facing), Math.cos(targetHome.facing))
        : villager.random() * Math.PI * 2;
      let reach = targetHome
        ? 1.15
        : spread * (0.35 + villager.random() * 0.65);
      // Место стоянки не должно оказаться внутри стены или поленницы —
      // иначе человек будет вечно кружить вокруг недостижимой точки.
      if (population.field) {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const testX = target.x + Math.cos(spot) * reach;
          const testZ = target.z + Math.sin(spot) * reach;
          const solid = population.field
            .query(testX, testZ, 0.5, population.seeThrough)
            .some(
              (box) =>
                box.top > STEP_UP_HEIGHT &&
                distanceToBox(box, testX, testZ) < 0.45,
            );
          if (!solid) {
            break;
          }
          reach *= 0.45;
        }
      }
      villager.arriveOffsetX = Math.cos(spot) * reach;
      villager.arriveOffsetZ = Math.sin(spot) * reach;
      buildPath(network, villager, plan, finalNode);
      // Дважды не дошёл по тропам, а на дворе ночь — человек плюёт на тропы
      // и идёт домой напрямик через поле. Обход препятствий никуда не
      // девается, просто коридор теперь прямой.
      if (nightPull > 0.75 && villager.failedTrips >= 2 && homeNode !== undefined) {
        const door = network.nodes[homeNode];
        villager.path = [
          [villager.x, villager.z],
          [door.x + villager.arriveOffsetX, door.z + villager.arriveOffsetZ],
        ];
        villager.waypoint = 1;
        villager.destinationNode = homeNode;
      }
      // Страховка от вечной прогулки: если путь почему-то не завершается
      // (цель за обломками, коридор перекрыт), житель через разумное время
      // считает дело сделанным здесь и берётся за следующее.
      let expected = 0;
      for (let index = 1; index < villager.path.length; index += 1) {
        expected += distance(
          villager.path[index - 1][0],
          villager.path[index - 1][1],
          villager.path[index][0],
          villager.path[index][1],
        );
      }
      villager.walkBudget = 8 + (expected / Math.max(villager.baseSpeed, 0.4)) * 2.4;
      villager.state = "walking";
      continue;
    }

    // --- Ходьба: тропа задаёт КОРИДОР, шаг считает стиринг ----------------
    // Время в пути считаем ПЕРВЫМ делом. Если списывать его только на
    // «нормальной» ветке, житель, зациклившийся на «пячусь — застрял —
    // пячусь», обходит эту строку и идёт вечно.
    villager.walkBudget -= step;
    const path = villager.path;
    if (path.length === 0) {
      villager.state = "dwelling";
      villager.dwell = 0.5;
      continue;
    }

    if (villager.walkBudget <= 0 && villager.vault <= 0 && villager.doorWait <= 0) {
      // Время вышло: человек считает дело сделанным здесь и берётся за
      // следующее — но честно, от того места, где реально стоит.
      villager.nodeIndex = nearestNodeTo(network, villager.x, villager.z);
      villager.failedTrips += 1;
      villager.state = "dwelling";
      villager.dwell = 0.6 + villager.random() * 1.5;
      villager.path = [];
      villager.speed = 0;
      villager.backOut = 0;
      villager.avoidSign = 0;
      continue;
    }

    // Преодоление преграды идёт своим чередом: через неё, а не вокруг.
    if (villager.vault > 0) {
      villager.climbProgress += step / villager.climbDuration;
      const t = Math.min(1, villager.climbProgress);
      // Продвижение с замедлением на опоре: у человека вес переносится
      // через препятствие, а не проезжает мимо с постоянной скоростью.
      const eased = t * t * (3 - 2 * t);
      villager.x = villager.climbFromX + (villager.climbToX - villager.climbFromX) * eased;
      villager.z = villager.climbFromZ + (villager.climbToZ - villager.climbFromZ) * eased;
      // Переступая, таз почти не поднимается; перемахивая — человек садится
      // бедром на преграду и сходит с неё.
      const arc = Math.sin(Math.PI * t);
      // Переступая, таз почти не поднимается; перемахивая — человек садится
      // бедром на преграду; выходя силой — встаёт на неё во весь рост и
      // только потом сходит вниз, поэтому подъём держится дольше.
      villager.y =
        villager.climbKind === 1
          ? villager.climbTop * arc * 0.22
          : villager.climbKind === 2
            ? villager.climbTop * arc * 0.92
            : villager.climbKind === 3
              ? villager.climbTop * Math.min(1, arc * 1.25)
              : villager.climbTop * Math.min(1, Math.sin(Math.PI * Math.min(1, t * 1.45)) * 1.3);
      villager.speed = 0.9;
      villager.phase += (0.9 * step * Math.PI) / villager.strideLength;
      if (t >= 1) {
        villager.vault = 0;
        villager.climbKind = 0;
        villager.climbProgress = 0;
        if (population.field) {
          resolveCollisions(villager, population.field, population.seeThrough);
          villager.y = surfaceHeightAt(
            population.field,
            villager.x,
            villager.z,
            villager.y,
            population.seeThrough,
          );
        }
      }
      continue;
    }

    // Морковка впереди по коридору; ближние точки проглатываем.
    while (villager.waypoint < path.length - 1) {
      const ahead = path[villager.waypoint];
      // Радиус приёма точки маленький: широкий срезает углы и заставляет
      // человека рыскать, догоняя убегающую вперёд «морковку».
      if (Math.hypot(villager.x - ahead[0], villager.z - ahead[1]) < 0.9) {
        villager.waypoint += 1;
      } else {
        break;
      }
    }
    const aim = path[villager.waypoint];
    let aimX = aim[0];
    let aimZ = aim[1];

    // Насколько мы сошли с текущего отрезка коридора.
    const previous = path[Math.max(0, villager.waypoint - 1)];
    const segX = aim[0] - previous[0];
    const segZ = aim[1] - previous[1];
    const segLengthSquared = segX * segX + segZ * segZ || 1;
    const alongSegment = Math.max(
      0,
      Math.min(
        1,
        ((villager.x - previous[0]) * segX + (villager.z - previous[1]) * segZ) /
          segLengthSquared,
      ),
    );
    const nearestOnPathX = previous[0] + segX * alongSegment;
    const nearestOnPathZ = previous[1] + segZ * alongSegment;
    const corridorOffset = Math.hypot(
      villager.x - nearestOnPathX,
      villager.z - nearestOnPathZ,
    );

    // Тропы рисованы от руки, и обход крупной помехи (штабеля, навеса, чужого
    // дома) стоит два-три метра в сторону. Прежний порог 1.6 м тянул человека
    // назад на тропу прямо посреди обхода — он метался между «обойти» и
    // «вернуться». Коридор шире помехи, поэтому обход доводится до конца.
    if (corridorOffset > 3.4) {
      // Сошёл совсем далеко (обходил, расходился, толкнули) — сперва
      // возвращаемся на тропу, а не срезаем напрямик к следующей точке.
      aimX = nearestOnPathX + segX * 0.12;
      aimZ = nearestOnPathZ + segZ * 0.12;
    } else if (villager.waypoint < path.length - 1) {
      // Своя привычная сторона тропы — сдвигаем не тело, а цель.
      const dx = aimX - villager.x;
      const dz = aimZ - villager.z;
      const inverse = 1 / (Math.hypot(dx, dz) || 1);
      // Люди не идут по одной линии: сторона тропы медленно уплывает влево и
      // вправо. Раньше это была константа на всю жизнь — колонна шла строго
      // параллельными нитками.
      villager.lateralTarget += (villager.random() - 0.5) * step * 0.5;
      const wanderRoom = 0.62 * (1 - nightPull * 0.7);
      villager.lateralTarget = Math.max(
        -wanderRoom,
        Math.min(wanderRoom, villager.lateralTarget),
      );
      villager.lateralBias +=
        (villager.lateralTarget - villager.lateralBias) * Math.min(1, step * 0.5);
      aimX += -dz * inverse * villager.lateralBias;
      aimZ += dx * inverse * villager.lateralBias;
    }
    let desiredYaw = Math.atan2(aimX - villager.x, aimZ - villager.z);

    // Скорость на входе в кадр: по ней ограничивается доворот.
    const enteringSpeed = villager.speed;
    const field = population.field;
    const broken = population.seeThrough;
    let blocked = 0;
    if (field) {
      villager.vaultCooldown = Math.max(0, villager.vaultCooldown - step);
      const toAim = Math.hypot(aimX - villager.x, aimZ - villager.z);
      // Смотрим вперёд на полторы секунды пути, а не под ноги: поэтому
      // человек начинает поворачивать заранее, а не тычется как пылесос.
      const look = Math.max(1.0, Math.min(toAim + 0.4, 1.2 + villager.speed * 1.25));
      const fan = chooseFreeDirection(
        field,
        villager.x,
        villager.z,
        desiredYaw,
        villager.yaw,
        look,
        0.34,
        broken,
        villager.fanYaw,
        villager.y,
      );
      const hit = fan.ahead;
      const gap = hit.box ? distanceToBox(hit.box, villager.x, villager.z) : Infinity;

      // ХОРОВОД. Если человек долго вьётся вокруг ОДНОГО И ТОГО ЖЕ предмета,
      // значит цель за ним недостижима — сколько ни заходи с новой стороны.
      // Никакая правка тропы этого класса не закрывает: нужна норма поведения.
      // Рядом лавка — сесть и передохнуть; нет лавки — сменить дело, и лучше
      // на дальнее, чтобы уйти от этого места совсем.
      if (hit.box && gap < 1.8) {
        if (villager.orbitId === hit.box.id) {
          villager.orbitTime += step;
        } else {
          villager.orbitId = hit.box.id;
          villager.orbitTime = 0;
        }
      } else {
        villager.orbitTime = Math.max(0, villager.orbitTime - step * 1.5);
        if (villager.orbitTime <= 0) {
          villager.orbitId = null;
        }
      }
      if (villager.orbitTime > 6.5) {
        villager.orbitId = null;
        villager.orbitTime = 0;
        // Остановились НЕ там, куда шли, — значит номер узла врёт. Тот же
        // класс, что при сдаче по времени: пока nodeIndex указывает на место,
        // где человека нет, каждый следующий коридор начинается в двадцати
        // метрах от него, и он топчется на месте до утра. Замер: житель,
        // остановленный этим правилом у штабеля брёвен, до дому не доходил
        // вовсе — nodeIndex оставался на дальнем конце деревни.
        villager.nodeIndex = nearestNodeTo(network, villager.x, villager.z);
        villager.state = "dwelling";
        villager.dwell = 4 + villager.random() * 7;
        villager.wantFar = true;
        villager.path = [];
        villager.speed = 0;
        villager.escape = 0;
        villager.stuck = 0;
        if (population.field) {
          maybeRest(villager, population.field, population.seeThrough, nightPull);
        }
        continue;
      }

      // Преграду не всегда обходят. Низкую — переступают на ходу; по пояс —
      // перемахивают с опорой рукой, но только если руки свободны. А если
      // человек уже долго топчется и не может решить — лучше перелезть, чем
      // тупить: нерешительность выглядит хуже любого решения.
      const dithering = villager.stuck > 0.7 || villager.escape > 0;
      // Высота преграды — это высота ВСЕГО штабеля в точке касания, а не
      // одного бревна: иначе житель перемахивает нижний венец и оказывается
      // внутри дома.
      const hitX = villager.x + Math.sin(villager.yaw) * (gap + 0.25);
      const hitZ = villager.z + Math.cos(villager.yaw) * (gap + 0.25);
      const barrierTop = hit.box
        ? Math.max(hit.top, stackTopAt(field, hitX, hitZ, 0.5, broken))
        : 0;
      // ДВЕРЬ НА ПУТИ. Створка стоит стеной, пока её не открыли, поэтому
      // житель не ломится, а просит открыть и ждёт, пока створ пойдёт. Раньше
      // навесные куски вообще не были препятствием — и человек, не дождавшись,
      // просто проходил сквозь закрытую дверь.
      if (hit.box?.doorId && gap < 2.2) {
        villager.doorRequest = hit.box.doorId;
        villager.doorAtX = hit.box.centerX;
        villager.doorAtZ = hit.box.centerZ;
        // doorWait — ТОЛЬКО про свою дверь: он убывает единственно в ветке
        // прихода домой. Выставляя его здесь, мы вешали на жителя вечную
        // просьбу открыть ЕГО дом — и все избы стояли распахнутыми весь день,
        // пока ворота зала честно затворялись по расписанию. Общая створка
        // держится открытой выдержкой самого входа (`doorState`), а не
        // таймером человека.
        villager.stuck = 0;
        villager.vaultCooldown = Math.max(villager.vaultCooldown, 0.4);
      }
      if (villager.doorRequest) {
        // Просьба живёт, ПОКА ЧЕЛОВЕК РЯДОМ С ДВЕРЬЮ, а не пока он её видит.
        // Иначе выходило хлопанье: закрытую створку он видит и просит, а
        // распахнутую уже не видит, перестаёт просить — и она затворяется ему
        // в спину, прямо когда он в проёме.
        const toDoor = Math.hypot(
          villager.x - villager.doorAtX,
          villager.z - villager.doorAtZ,
        );
        if (toDoor > 3.4) {
          villager.doorRequest = null;
        } else {
          requestDoor(population, villager.doorRequest, step);
        }
      }

      // Перелезть можно всё, что НИЖЕ СОБСТВЕННОЙ ГОЛОВЫ: выше человек уже не
      // закидывает на край ни руки, ни колено. Способ выбирается по высоте
      // относительно роста, а не по одной пороговой константе.
      const head = villager.child ? 1.24 : 1.62;
      const freeHands = !villager.carries;
      const canStepOver = hit.box && barrierTop <= 0.58;
      // Перемах с опорой — только для НИЗКОГО (по бедро). Выше человек уже не
      // проносит ноги под собой: он садится на край бедром, а совсем высокое
      // берёт выходом силой. Прежде перемах забирал всё до 0.95 м, и в кадре
      // жители только «перепрыгивали».
      const canVault = hit.box && barrierTop <= 0.72 && freeHands;
      const canHipOver = hit.box && barrierTop <= VAULT_HEIGHT + 0.25 && freeHands;
      const canMantle = hit.box && barrierTop <= head && freeHands;
      if (
        hit.box &&
        !hit.box.doorId &&
        gap < 0.95 &&
        villager.vaultCooldown <= 0 &&
        (canStepOver || canVault || canHipOver || canMantle) &&
        // Обычно преграду преодолевают, когда обойти негде или надоело
        // топтаться. Но кто ж отменял хулиганство: иногда — просто так,
        // потому что можется. Дети — чаще.
        (fan.free < 1.0 ||
          dithering ||
          (fan.free < 2.4 && villager.random() < villager.mischief * 0.03))
      ) {
        const depth = Math.max(hit.box.halfX, hit.box.halfZ) * 2;
        const clearance = gap + Math.min(depth, 1.2) + 0.75;
        // КУДА он приземлится. Перелезание — скриптовый перенос тела вперёд, и
        // по дороге он не считает столкновений. У бокового входа зала есть
        // низкая ступень: житель «перелезал» её и приземлялся на два метра
        // вперёд — уже ВНУТРИ дома, сквозь бревенчатую стену. Поэтому и место
        // приземления, и середина пути обязаны быть свободны, иначе не лезем.
        const landX = villager.x + Math.sin(villager.yaw) * clearance;
        const landZ = villager.z + Math.cos(villager.yaw) * clearance;
        let landingClear = true;
        for (const probe of [0.55, 1] as const) {
          const px = villager.x + (landX - villager.x) * probe;
          const pz = villager.z + (landZ - villager.z) * probe;
          for (const box of field.query(px, pz, 0.9, broken)) {
            // Сама преграда и всё, что не выше её, помехой не считается: по
            // ней он и идёт. Мешает лишь то, что торчит ВЫШЕ неё.
            if (box.top <= barrierTop + 0.12) {
              continue;
            }
            if (distanceToBox(box, px, pz) < 0.36) {
              landingClear = false;
              break;
            }
          }
          if (!landingClear) {
            break;
          }
        }
        if (!landingClear) {
          villager.vaultCooldown = Math.max(villager.vaultCooldown, 1.2);
          desiredYaw = fan.yaw;
          continue;
        }
        // Четыре способа, каждый со своей механикой:
        //   1 переступить  — ноги по очереди, стрид не ломается;
        //   2 перемах      — рука на опоре, плечо над кистью, ноги под собой;
        //   3 через бедро  — подсесть боком на край и перекинуть ноги;
        //   4 выход силой  — руки на верх, подтянуться, колено на край, встать.
        villager.climbKind = canStepOver ? 1 : canVault ? 2 : canHipOver ? 3 : 4;
        villager.climbTop = barrierTop;
        villager.climbFromX = villager.x;
        villager.climbFromZ = villager.z;
        villager.climbToX = villager.x + Math.sin(villager.yaw) * clearance;
        villager.climbToZ = villager.z + Math.cos(villager.yaw) * clearance;
        // Чем выше преграда, тем дольше и осторожнее движение.
        villager.climbDuration =
          villager.climbKind === 1
            ? 0.95
            : villager.climbKind === 2
              ? 1.35
              : villager.climbKind === 3
                ? 1.7
                : 2.15;
        villager.climbProgress = 0;
        villager.vault = 1;
        villager.vaultCooldown = 2.2;
        villager.escape = 0;
        villager.stuck = 0;
        continue;
      }

      // Зашёл в тесноту — между бочками, в угол между сараем и поленницей.
      // Рулём оттуда не выбраться: свободного направления просто нет. Человек
      // в такой ситуации не решает задачу обхода, а сперва ВЫХОДИТ на простор
      // и только потом снова идёт по делу.
      if (fan.wedged) {
        villager.escape = Math.max(villager.escape, 1.8);
      }
      desiredYaw = fan.yaw;
      villager.fanYaw = fan.yaw;
      blocked = 1 - Math.min(1, fan.free / look);

      if (villager.escape > 0) {
        villager.escape -= step;
        let awayX = 0;
        let awayZ = 0;
        for (const box of field.query(villager.x, villager.z, 2.4, broken)) {
          if (box.top <= villager.y + STEP_UP_HEIGHT) {
            continue;
          }
          const [pointX, pointZ] = closestPointOnBox(box, villager.x, villager.z);
          const dx = villager.x - pointX;
          const dz = villager.z - pointZ;
          const gapToBox = Math.max(0.18, Math.hypot(dx, dz));
          awayX += dx / (gapToBox * gapToBox);
          awayZ += dz / (gapToBox * gapToBox);
        }
        if (awayX !== 0 || awayZ !== 0) {
          desiredYaw = Math.atan2(awayX, awayZ);
          // Выбираясь, не тормозим о то, от чего уходим.
          blocked = 0;
          villager.fanYaw = undefined;
        }
        if (fan.free > 1.6) {
          villager.escape = 0;
        }
      }
    }

    // Расхождение со встречными: смотрим, кто идёт рядом, и берём в сторону.
    // Сумма ограничена — иначе в толчее у колодца человек начинает рыскать.
    let sidestep = 0;
    for (const other of villagers) {
      if (other === villager || !other.visible) {
        continue;
      }
      const dx = other.x - villager.x;
      const dz = other.z - villager.z;
      const gap = Math.hypot(dx, dz);
      if (gap > 1.3 || gap < 1e-3) {
        continue;
      }
      const forward = Math.sin(villager.yaw) * dx + Math.cos(villager.yaw) * dz;
      if (forward <= 0) {
        continue;
      }
      const side = Math.cos(villager.yaw) * dx - Math.sin(villager.yaw) * dz;
      sidestep -= Math.sign(side || 1) * (1.3 - gap) * 0.45;
    }
    desiredYaw += Math.max(-0.5, Math.min(0.5, sidestep));

    // Ночью и с ношей идут иначе; лёгкая индивидуальная раскачка темпа.
    let cruise =
      villager.baseSpeed *
      (villager.carries ? 0.86 : 1) *
      // К темноте не плетутся, а прибавляют: домой хочется до ночи. Прежний
      // множитель ЗАМЕДЛЯЛ на 18% — вместе с гулянием темпа часть деревни
      // переставала успевать к своим дверям.
      (1 + nightPull * 0.08) *
      (0.94 + 0.12 * Math.sin(villager.seed * 9.7 + villager.phase * 0.21));
    // …и поверх — блуждание темпа внутри своего же режима: не синусоида, у
    // которой слышен период, а неспешный дрейф с возвратом к своему обычному.
    villager.paceDrift += (villager.random() - 0.5) * step * 1.1;
    villager.paceDrift = Math.max(-1, Math.min(1, villager.paceDrift * (1 - step * 0.3)));
    // К ночи разброд стихает: домой идут ровно и не гуляя — это и правда так,
    // и это же не даёт замешкавшимся не успеть до темноты.
    cruise *= 1 + 0.17 * villager.paceDrift * (1 - nightPull * 0.85);

    // Поворот ограничен скоростью: стоя человек крутится на месте, на ходу
    // описывает дугу — провернуться вокруг оси на бегу он не может.
    const error = shortestAngle(villager.yaw, desiredYaw);
    // Предел берётся по БОЛЬШЕЙ из скоростей — той, с которой человек вошёл в
    // этот кадр, и той, что осталась. Иначе торможение (например, перед
    // створкой) на один кадр разрешало провернуться так, как на прежнем ходу
    // провернуться нельзя.
    const turnLimit = maxTurnRate(Math.max(enteringSpeed, villager.speed)) * step;
    villager.yaw += Math.max(-turnLimit, Math.min(turnLimit, error));

    // Лёгкий доворот темпа не сбивает: человек не переходит на шаг из-за
    // поворота на пятнадцать градусов. А вот цель за спиной — это стоп и
    // разворот на месте.
    let wanted =
      cruise *
      (1 - 0.55 * Math.min(1, Math.abs(error) / 1.2)) *
      (1 - 0.72 * blocked);
    if (Math.abs(error) > 1.35) {
      wanted = 0;
    }
    if (villager.escape > 0) {
      // Выбираясь из тесноты, идут даже боком и медленно — но ИДУТ. Иначе
      // человек, зажатый между бочками, простоит там до утра.
      wanted = Math.max(wanted, 0.5);
    }
    if (villager.waypoint >= path.length - 1) {
      // К месту подходят замедляясь. Без этого человек проскакивает точку и
      // начинает наматывать вокруг неё круги — поворот-то ограничен.
      const remaining = Math.hypot(villager.x - aim[0], villager.z - aim[1]);
      wanted = Math.min(wanted, Math.max(0.35, cruise * (remaining / 2.6)));
    }
    villager.speed += Math.max(
      -4.5 * step,
      Math.min(2.8 * step, wanted - villager.speed),
    );
    villager.speed = Math.max(0, villager.speed);

    // Пятимся из угла: назад, не разворачиваясь, — так человек и делает,
    // когда зашёл в тупик между сараем и поленницей.
    if (villager.backOut > 0) {
      villager.backOut -= step;
      const retreat = 0.75 * step;
      villager.x -= Math.sin(villager.yaw) * retreat;
      villager.z -= Math.cos(villager.yaw) * retreat;
      villager.speed = 0.35;
      villager.phase += (retreat * Math.PI) / villager.strideLength;
      villager.stuck = 0;
      if (population.field) {
        resolveCollisions(villager, population.field, population.seeThrough);
      }
      if (villager.backOut <= 0) {
        // Отступив, забываем прежнее решение об обходе и смотрим заново.
        villager.avoidSign = 0;
        villager.walkBudget -= 1.5;
      }
      continue;
    }

    // Стоит и не едет — значит, выбор направления зациклился. Рулём это не
    // лечится: надо отступить и посмотреть заново.
    if (villager.speed < 0.2) {
      villager.stuck += step;
      if (villager.stuck > 1.1) {
        villager.backOut = 0.8;
        villager.fanYaw = undefined;
        villager.stuck = 0;
        villager.walkBudget -= 2.5;
      }
    } else {
      villager.stuck = 0;
    }

    const intendedX = villager.x + Math.sin(villager.yaw) * villager.speed * step;
    const intendedZ = villager.z + Math.cos(villager.yaw) * villager.speed * step;
    const beforeX = villager.x;
    const beforeZ = villager.z;
    villager.x = intendedX;
    villager.z = intendedZ;

    if (field) {
      resolveCollisions(villager, field, broken);
      // Идём ПО поверхности: настил, крыльцо, бревно. Подъём плавный —
      // человек всходит на ступень, а не телепортируется на неё.
      const ground = surfaceHeightAt(field, villager.x, villager.z, villager.y, broken);
      villager.y += (ground - villager.y) * Math.min(1, step * 9);
    }

    // Фаза шага от ФАКТИЧЕСКИ пройденного пути — считаем её ПОСЛЕ разрешения
    // столкновений. Уперевшись в стену, человек перебирает ногами на месте
    // ровно столько, сколько реально сместился, а не сколько хотел.
    const moved = Math.hypot(villager.x - beforeX, villager.z - beforeZ);
    villager.phase += (moved * Math.PI) / villager.strideLength;

    // Ночью человек, оказавшийся у СВОЕЙ двери, просто заходит — не важно,
    // что там думает конечный автомат про «цель маршрута».
    if (nightPull > 0.75 && homeNode !== undefined) {
      const door = network.nodes[homeNode];
      const toOwnDoor = Math.hypot(villager.x - door.x, villager.z - door.z);
      // Дверь просят открыть ЗАРАНЕЕ, на подходе: пока створка идёт, человек
      // успевает дойти, и ему не приходится стоять перед закрытой доской.
      // Дверь просят открыть ещё на подходе, с доброго десятка метров: пока
      // створка идёт, человек как раз доходит и не топчется перед доской.
      const ownDoorId = settlement.dwellings.find(
        (dwelling) => dwelling.id === villager.homeId,
      )?.doorId;
      if (toOwnDoor < 11 && ownDoorId) {
        requestDoor(population, ownDoorId, step);
      }
      if (toOwnDoor < 2.9) {
        // В дверь не вламываются: человек подходит, толкает её и ждёт, пока
        // створка пойдёт. Просьбу открыть считывает дверная система.
        villager.speed = 0;
        villager.faceYaw = Math.atan2(door.x - villager.x, door.z - villager.z);
        villager.yaw +=
          shortestAngleTo(villager.yaw, villager.faceYaw) * Math.min(1, step * 5);
        if (ownDoorId) {
          requestDoor(population, ownDoorId, step);
        }
        villager.doorWait = villager.doorWait > 0 ? villager.doorWait - step : 0.85;
        if (villager.doorWait <= 0) {
          villager.nodeIndex = homeNode;
          villager.state = "inside";
          villager.visible = false;
          villager.path = [];
          villager.doorWait = 0;
        }
        continue;
      }
    }

    const last = path[path.length - 1];
    const toLast = Math.hypot(villager.x - last[0], villager.z - last[1]);
    // Цель считается достигнутой, если пришли — ИЛИ если прошли мимо неё
    // вплотную: человек не топчется, доводя себя до сантиметра.
    const passed =
      Math.sin(villager.yaw) * (last[0] - villager.x) +
        Math.cos(villager.yaw) * (last[1] - villager.z) <
      0;
    if (
      (villager.waypoint >= path.length - 1 &&
        (toLast < 0.85 || (toLast < 2 && passed))) ||
      villager.walkBudget <= 0
    ) {
      // Если дошли — мы в узле назначения. Если сдались по времени, честно
      // признаём, что стоим не там: следующее дело надо планировать от
      // БЛИЖАЙШЕГО узла, иначе человек навсегда останется «потерянным» —
      // каждый новый коридор будет начинаться в двадцати метрах от него.
      const reachedGoal =
        villager.waypoint >= path.length - 1 &&
        (toLast < 0.85 || (toLast < 2 && passed));
      villager.nodeIndex = reachedGoal
        ? villager.destinationNode
        : nearestNodeTo(network, villager.x, villager.z);
      villager.failedTrips = reachedGoal ? 0 : villager.failedTrips + 1;
      const arrived = network.nodes[villager.nodeIndex];
      // Стоящий смотрит на то, ради чего пришёл: у колодца люди встают
      // кольцом лицом внутрь, а не спинами друг к другу.
      villager.faceYaw = Math.atan2(
        arrived.x - villager.x,
        arrived.z - villager.z,
      );
      villager.state = "dwelling";
      villager.dwell = dwellTime(arrived, villager.random);
      villager.path = [];
      villager.speed = 0;
      villager.avoidSign = 0;
    }
  }

  // Личное пространство: расталкиваем тех, кто всё-таки сошёлся вплотную.
  for (let i = 0; i < villagers.length; i += 1) {
    const a = villagers[i];
    if (!a.visible) continue;
    for (let j = i + 1; j < villagers.length; j += 1) {
      const b = villagers[j];
      if (!b.visible) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const gap = Math.hypot(dx, dz);
      const personal = 0.62;
      if (gap >= personal || gap < 1e-4) continue;
      const push = ((personal - gap) / 2) * Math.min(1, step * 9);
      a.x -= (dx / gap) * push;
      a.z -= (dz / gap) * push;
      b.x += (dx / gap) * push;
      b.z += (dz / gap) * push;
      // Расталкивание не должно вминать соседа в стену — сразу же чиним.
      if (population.field) {
        resolveCollisions(a, population.field, population.seeThrough);
        resolveCollisions(b, population.field, population.seeThrough);
      }
    }
  }
}
