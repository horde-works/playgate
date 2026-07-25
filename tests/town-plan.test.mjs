import assert from "node:assert/strict";
import test from "node:test";
import {
  townAreas,
  townEntrances,
  townPlaceInterest,
  townRoadways,
  townWays,
} from "../games/make-a-mess/src/content/scenes/townPlan.ts";
import { townSurfaceRoutes } from "../games/make-a-mess/src/content/scenes/townSurfacePlan.ts";
import {
  buildObstacleField,
  distanceToBox,
  STEP_UP_HEIGHT,
} from "../games/make-a-mess/src/game/villagerNavigation.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

// Разметка проверяется по НАСТОЯЩЕЙ сцене: смысл всей затеи в том, что тропу
// нельзя провести там, где стоит дом, куча или брошенная бочка.
const field = buildObstacleField(townScene.breakablePieces);

/** Полуширина плеч жителя. */
const BODY = 0.32;
/** Как в buildVillageNetwork: концы троп ближе этого — один узел-место. */
const NODE_SNAP = 2.1;

const doorPrefixes = townEntrances.map((entrance) => entrance.doorPieceId);
const gatePrefixes = [
  "old-quarter:south-fences:gate:leaf",
  "old-quarter:b-fences:gate:leaf",
  "town:garages:gate",
  "town:rim:garages:gate",
];

/**
 * Что НЕ преграда для пешехода: створки (они открываются) и всё, чей верх ниже
 * STEP_UP — такие куски castWhisker пропускает, житель через них переступает.
 */
function passable(box) {
  return (
    box.top <= STEP_UP_HEIGHT ||
    doorPrefixes.some((prefix) => box.id.startsWith(prefix)) ||
    gatePrefixes.some((prefix) => box.id.startsWith(prefix))
  );
}

function clearanceAt(x, z) {
  let best = Infinity;
  for (const box of field.query(x, z, 1.4)) {
    if (passable(box)) continue;
    best = Math.min(best, distanceToBox(box, x, z));
  }
  return best;
}

/** Ширина свободного створа поперёк тропы: столб обходится, стена — нет. */
function corridorAt(x, z, nx, nz) {
  const span = 2.0;
  const step = 0.08;
  const boxes = field.query(x, z, span + 1).filter((box) => !passable(box));
  let widest = 0;
  let runStart = null;
  const steps = Math.round((span * 2) / step);
  for (let index = 0; index <= steps; index += 1) {
    const offset = -span + index * step;
    const free = boxes.every(
      (box) => distanceToBox(box, x + nx * offset, z + nz * offset) > 1e-6,
    );
    if (free && runStart === null) runStart = offset;
    if ((!free || index === steps) && runStart !== null) {
      widest = Math.max(widest, (free ? offset : offset - step) - runStart);
      runStart = null;
    }
  }
  return widest;
}

function eachSample(way, visit) {
  for (let index = 1; index < way.points.length; index += 1) {
    const [ax, az] = way.points[index - 1];
    const [bx, bz] = way.points[index];
    const length = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / length;
    const nz = (bx - ax) / length;
    const steps = Math.max(1, Math.ceil(length / 0.35));
    for (let sample = 0; sample <= steps; sample += 1) {
      const t = sample / steps;
      visit(ax + (bx - ax) * t, az + (bz - az) * t, nx, nz);
    }
  }
}

function distanceToNetwork(x, z) {
  let best = Infinity;
  for (const way of townWays) {
    for (let index = 1; index < way.points.length; index += 1) {
      const [ax, az] = way.points[index - 1];
      const [bx, bz] = way.points[index];
      const dx = bx - ax;
      const dz = bz - az;
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
  }
  return best;
}

/** Граф города строится тем же правилом, что и деревенский. */
function buildTownNetwork() {
  const clusters = [];
  const clusterOfVertex = townWays.map(() => []);
  for (const [wayIndex, way] of townWays.entries()) {
    for (const [vertexIndex, point] of way.points.entries()) {
      const isEnd = vertexIndex === 0 || vertexIndex === way.points.length - 1;
      let found = clusters.findIndex(
        (cluster) => Math.hypot(cluster.x - point[0], cluster.z - point[1]) <= NODE_SNAP,
      );
      if (found === -1) {
        clusters.push({
          x: point[0],
          z: point[1],
          members: 1,
          ways: new Set([wayIndex]),
          endpoint: isEnd,
        });
        found = clusters.length - 1;
      } else {
        const cluster = clusters[found];
        cluster.x = (cluster.x * cluster.members + point[0]) / (cluster.members + 1);
        cluster.z = (cluster.z * cluster.members + point[1]) / (cluster.members + 1);
        cluster.members += 1;
        cluster.ways.add(wayIndex);
        cluster.endpoint = cluster.endpoint || isEnd;
      }
      clusterOfVertex[wayIndex][vertexIndex] = found;
    }
  }

  const nodes = [];
  for (const cluster of clusters) {
    if (!cluster.endpoint && cluster.ways.size < 2) continue;
    nodes.push({ index: nodes.length, x: cluster.x, z: cluster.z, ways: cluster.ways });
  }

  const adjacency = nodes.map(() => []);
  const edges = [];
  for (const way of townWays) {
    const points = way.points;
    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(
        cumulative[index - 1] +
          Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]),
      );
    }
    // Т-образные примыкания тоже режут тропу: конец тротуара может упереться
    // в бок колеи, а не в её вершину.
    const splits = [];
    for (const node of nodes) {
      let bestArc = 0;
      let bestOffset = Infinity;
      for (let index = 1; index < points.length; index += 1) {
        const [ax, az] = points[index - 1];
        const [bx, bz] = points[index];
        const dx = bx - ax;
        const dz = bz - az;
        const lengthSquared = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((node.x - ax) * dx + (node.z - az) * dz) / lengthSquared));
        const offset = Math.hypot(node.x - (ax + dx * t), node.z - (az + dz * t));
        if (offset < bestOffset) {
          bestOffset = offset;
          bestArc = cumulative[index - 1] + Math.hypot(dx, dz) * t;
        }
      }
      if (bestOffset <= NODE_SNAP) splits.push({ arc: bestArc, node: node.index });
    }
    splits.sort((left, right) => left.arc - right.arc);
    const kept = [];
    for (const split of splits) {
      if (kept[kept.length - 1] !== split.node) kept.push(split.node);
    }
    for (let index = 0; index < kept.length - 1; index += 1) {
      edges.push({ from: kept[index], to: kept[index + 1], wayId: way.id });
      adjacency[kept[index]].push(edges.length - 1);
      adjacency[kept[index + 1]].push(edges.length - 1);
    }
  }
  return { nodes, edges, adjacency };
}

test("каждая пешеходная линия проходима: створ шире плеч", () => {
  const blocked = [];
  for (const way of townWays) {
    let worst = Infinity;
    let at = null;
    eachSample(way, (x, z, nx, nz) => {
      const width = corridorAt(x, z, nx, nz);
      if (width < worst) {
        worst = width;
        at = [x, z];
      }
    });
    if (worst < BODY * 2) {
      blocked.push(`${way.id} — створ ${worst.toFixed(2)} м в (${at[0].toFixed(1)}, ${at[1].toFixed(1)})`);
    }
  }
  assert.deepEqual(blocked, [], "тропа не имеет права упираться в непроходимое");
});

test("узлы графа стоят на свободной земле, а не внутри твёрдого", () => {
  const { nodes } = buildTownNetwork();
  const inside = nodes
    .filter((node) => clearanceAt(node.x, node.z) < BODY)
    .map((node) => `(${node.x.toFixed(1)}, ${node.z.toFixed(1)})`);
  assert.deepEqual(inside, [], "узел-место внутри стены делает его недостижимым");
});

test("сеть города связна: из любой точки можно дойти в любую", () => {
  const { nodes, edges, adjacency } = buildTownNetwork();
  assert.equal(nodes.length > 60, true, `узлов ${nodes.length}`);

  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const at = stack.pop();
    for (const edgeIndex of adjacency[at]) {
      for (const other of [edges[edgeIndex].from, edges[edgeIndex].to]) {
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
  }
  assert.equal(seen.size, nodes.length, "граф распался на куски");
});

test("тупик разрешён только у двери или там, где тропа уходит в поле", () => {
  const { nodes, adjacency } = buildTownNetwork();
  const legit = [];
  for (const way of townWays) {
    if (way.kind !== "approach" && !way.fade) continue;
    legit.push(way.points[0], way.points[way.points.length - 1]);
  }
  const stray = [];
  for (const node of nodes) {
    if (adjacency[node.index].length !== 1) continue;
    const excused =
      legit.some((point) => Math.hypot(point[0] - node.x, point[1] - node.z) <= NODE_SNAP) ||
      townAreas.some(
        (area) =>
          Math.abs(area.center[0] - node.x) <= area.radius[0] + 1.5 &&
          Math.abs(area.center[1] - node.z) <= area.radius[1] + 1.5,
      );
    if (!excused) stray.push(`(${node.x.toFixed(1)}, ${node.z.toFixed(1)})`);
  }
  assert.deepEqual(stray, [], "тропа обрывается там, где идти некуда");
});

test("проезжая часть пересекается только в створах", () => {
  const onRoad = (x, z) =>
    townRoadways.find((road) =>
      road.axis === "x"
        ? Math.abs(z - road.center) <= road.halfWidth && x >= road.from && x <= road.to
        : Math.abs(x - road.center) <= road.halfWidth && z >= road.from && z <= road.to,
    );
  const trespassers = [];
  for (const way of townWays) {
    // Створы для того и нужны; хозяйственные проезды (объезд раскопа, колея у
    // межи) идут по полотну намеренно и помечены отдельным видом.
    if (way.kind === "crossing" || way.kind === "service") continue;
    let hit = null;
    eachSample(way, (x, z) => {
      hit = hit ?? onRoad(x, z)?.id ?? null;
    });
    if (hit) trespassers.push(`${way.id} → ${hit}`);
  }
  assert.deepEqual(trespassers, [], "пешеход идёт по мостовой мимо перехода");
});

test("к каждому подъезду можно подойти и попросить открыть", () => {
  const lost = [];
  for (const entrance of townEntrances) {
    const [x, z] = entrance.approach;
    const toNetwork = distanceToNetwork(x, z);
    const clear = clearanceAt(x, z);
    if (toNetwork > 1.2 || clear < BODY) {
      lost.push(`${entrance.id}: до сети ${toNetwork.toFixed(2)}, просвет ${clear.toFixed(2)}`);
    }
    // Порог должен смотреть на подход, а не в стену.
    const reach = Math.hypot(x - entrance.door[0], z - entrance.door[1]);
    assert.equal(reach < 2.4, true, `${entrance.id}: подход в ${reach.toFixed(2)} м от двери`);
  }
  assert.deepEqual(lost, [], "подъезд без подхода — это дом без двери");
  assert.equal(townEntrances.length, 18, "шесть хрущёвок по два подъезда плюс шесть дверей");
});

test("у каждого места есть тропа и оно стоит на построенном", () => {
  const unreachable = [];
  for (const area of townAreas) {
    const toNetwork = distanceToNetwork(area.center[0], area.center[1]);
    if (toNetwork > Math.max(area.radius[0], area.radius[1]) + 1.5) {
      unreachable.push(`${area.id} — ${toNetwork.toFixed(1)} м до тропы`);
    }
  }
  assert.deepEqual(unreachable, [], "место, до которого не дойти, не место");

  const known = new Set(townAreas.map((area) => area.id));
  for (const place of townPlaceInterest) {
    assert.equal(known.has(place.areaId), true, `${place.areaId}: притяжение к несуществующему пятну`);
    assert.equal(place.pull > 0 && place.pull < 4, true, `${place.areaId}: вес вне разумного`);
  }
});

test("разметка не разошлась с масками грязи", () => {
  // Маска — это следы на газоне; если по ней никто не ходит, значит одно из
  // двух врёт. Две маски старше построек (лесная тропа ушла под причальный
  // барабан, луговая — под к4) и терпимы, остальные обязаны совпадать.
  const stale = new Set(["west-wood-path", "meadow-stroll-south"]);
  const orphans = [];
  for (const route of townSurfaceRoutes) {
    if (stale.has(route.id)) continue;
    let worst = 0;
    for (const [x, z] of route.points) worst = Math.max(worst, distanceToNetwork(x, z));
    if (worst > 3.0) orphans.push(`${route.id} — ${worst.toFixed(1)} м`);
  }
  assert.deepEqual(orphans, [], "натоптано там, где по разметке никто не ходит");
});
