/**
 * АУДИТ СТЫКОВ: щели, наложения текстур и фольга — числами, а не по кадрам.
 *
 *   node tools/joint-audit.mjs [сцена|all] [--prefix hru:] [--top 25] [--json]
 *
 * Зачем отдельный измеритель. `check-structure.mjs` отвечает на вопрос «стоит
 * ли конструкция» — обрушения и глубокие взаимопроникновения. Игрок задаёт
 * другой вопрос: «почему видно небо в стене» и «почему рябит». Ни одно из этих
 * двух свойств решателем не проверяется вообще: щель в сантиметр держит нагрузку
 * идеально, а две копланарные грани стоят вечно.
 *
 * Здесь меряется РОВНО ТО, ЧТО ВИДНО, и меряется без единого паспортного числа:
 *
 *   1. ЩЕЛЬ. Пара кусков стоит в одном курсе, между ними по третьей оси зазор,
 *      и в этот зазор не заходит НИКАКАЯ другая геометрия. Дальше из щели
 *      пускается луч поперёк листа: ушёл в воздух с обеих сторон — это сквозная
 *      щель, видно небо; с одной — тёмный паз; ни с одной — закрытый стык,
 *      косметика. Так снимаются обе ловушки из скилла world-building: «мерить
 *      надо всю толщину и то, что стоит впереди» (проверкой заполнения) и
 *      «геометрия позади щель не закрывает» (числом открытых сторон).
 *
 *   2. НАЛОЖЕНИЕ ТЕКСТУР (z-fighting). Две грани смотрят В ОДНУ СТОРОНУ, лежат
 *      в одной плоскости с точностью до δ и перекрываются площадью. Именно
 *      сонаправленность отличает дефект от нормы: доска, ЛЕЖАЩАЯ на полу,
 *      копланарна полу — но нижняя грань доски смотрит вниз, верхняя грань пола
 *      вверх, они друг друга закрывают и не спорят. Спорят только две грани,
 *      обе повёрнутые к зрителю.
 *
 *   3. ФОЛЬГА. Кусок тоньше разрешения буфера глубины на своей дистанции: его
 *      собственная задняя грань начинает выигрывать у передней. Рябь без всякой
 *      пары.
 *
 * И у 2, и у 3 ответ зависит от КАМЕРЫ, а не только от геометрии. Разрешение
 * 24-битного буфера на удалении z:
 *
 *      Δz(z) = z² · (far − near) / (near · far · (2²⁴ − 1))
 *
 * то есть при near = 0.05 и far = 560 на полутора сотнях метров Δz ≈ 27 мм —
 * спорит всё, что ближе трёх сантиметров друг к другу. Поэтому в отчёте у
 * каждой находки стоит ДИСТАНЦИЯ ВКЛЮЧЕНИЯ: с какого удаления она начинает
 * рябить. Находка с включением в 300 м — теория, с включением в 12 м — то, на
 * что жалуются дети.
 *
 * Что измеритель НЕ видит (сознательно, чтобы не врать в другую сторону):
 * тела вращения и меши считаются своими габаритными ящиками. Ящик больше
 * настоящего тела, значит он ЗАПОЛНЯЕТ щель, которой на самом деле нет никого,
 * и ЗАКРЫВАЕТ грань, которая на самом деле открыта. Обе ошибки идут в сторону
 * молчания: измеритель недоговаривает, но не выдумывает.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// --- пороги ----------------------------------------------------------------

/** Зазор шире этого — проём, а не щель: дверь, окно, продух, борозда. */
const GAP_MAX = 0.06;
/** Уже этого — численный шум компилятора, а не авторская ошибка. */
const GAP_MIN = 0.0008;
/** Площадь стыка, ниже которой щель не читается даже вблизи. */
const SEAM_AREA_MIN = 0.02;
/** Копланарность: грани в пределах этого расстояния считаются одной плоскостью. */
const COPLANAR_MAX = 0.02;
/** Площадь спорной зоны, ниже которой рябь не видна. */
const FIGHT_AREA_MIN = 0.05;
/** Сколько метров чистого воздуха считаются «ушёл наружу». */
const ESCAPE = 2;
/** Грани ближе этого друг к другу считаются сомкнутыми, а не разошедшимися. */
const TOUCH = 0.002;
/** На сколько заглядывать за плоскость смыкания в поисках углового паза. */
const CORNER_DEPTH = 0.12;
/** Прогон короче этого — касание двух рёбер, а не стык. */
const CORNER_RUN_MIN = 0.3;
/** Шаг сетки пространственного индекса. */
const CELL = 2;
/** Разрядность буфера глубины. */
const DEPTH_BITS = 24;
/** Порог компилятора: глубже этой доли объёма врезку разводит deinterpenetrate. */
const VOLUME_RATIO_GATE = 0.22;

const SCENES = {
  town: ["games/make-a-mess/src/game/townScene.ts", "townScene"],
  terminal: ["games/make-a-mess/src/game/grandTerminalScene.ts", "grandTerminalScene"],
  viking: ["games/make-a-mess/src/game/vikingVillageScene.ts", "vikingVillageScene"],
  basalt: ["games/make-a-mess/src/game/basaltStrongholdScene.ts", "basaltStrongholdScene"],
  polder: ["games/make-a-mess/src/game/dutchPolderScene.ts", "dutchPolderScene"],
  astana: ["games/make-a-mess/src/game/astanaScene.ts", "astanaScene"],
  nimbus: ["games/make-a-mess/src/game/nimbusScene.ts", "nimbusScene"],
  range: ["games/make-a-mess/src/game/combatHexacopterRangeScene.ts", "combatHexacopterRangeScene"],
};

/** Сцены по имени — чтобы и CLI, и тест грузили их одинаково. */
export async function loadScene(key) {
  const entry = SCENES[key];
  if (!entry) throw new Error(`не знаю сцену "${key}"; есть: ${Object.keys(SCENES).join(", ")}`);
  const [modulePath, exportName] = entry;
  const module = await import(pathToFileURL(resolve(modulePath)).href);
  const scene = module[exportName]
    ?? Object.values(module).find((value) =>
      value && typeof value === "object" && "breakablePieces" in value);
  if (!scene) throw new Error(`в ${modulePath} нет сцены`);
  return scene;
}

export const sceneNames = Object.keys(SCENES);

// --- геометрия -------------------------------------------------------------

/** Матрица поворота в порядке XYZ — том же, которым сцену ставит three.Euler. */
function rotationMatrix(rotation) {
  const [rx, ry, rz] = rotation ?? [0, 0, 0];
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    [cy * cz, -cy * sz, sy],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy],
  ];
}

const AXIS_EPSILON = 1e-7;

/**
 * Ориентированный ящик куска. Куски, чьи локальные оси легли на мировые (а это
 * и поворот на четверть, и поворот на π), приводятся к мировому AABB: тогда
 * панель, развёрнутая на 90°, честно стыкуется с неповёрнутой соседкой, а не
 * выпадает из анализа из-за несовпадения ключа кадра.
 */
/**
 * НА СКОЛЬКО КУСОК РИСУЕТСЯ БОЛЬШЕ, ЧЕМ ОБЪЯВЛЕН.
 *
 * Единственный такой случай в игре — силикатный шов крепости: блоки её кладки
 * рисуются шире паспорта на 5.2 см, и связующее закрывает авторские воздушные
 * швы между ними (`IntactBreakableWorld.pieceRenderExpansion`; коллайдеры при
 * этом остаются на паспортном размере).
 *
 * Мерить надо ТО, ЧТО НАРИСОВАНО. Без этой поправки измеритель насчитывал в
 * тёмной башне 621 сквозную щель по 30 мм — ровно те, которые связующее и
 * закрывает. Правило общее: появится второй такой рендер-приём — он обязан
 * появиться и здесь, иначе отчёт разойдётся с кадром.
 *
 * Предикат — зеркало `silicateJoints.hasSilicateJoints`. Держать их в согласии
 * обязан тест `joint-audit.test.mjs`: разойдутся — и отчёт снова начнёт врать,
 * причём молча и в обе стороны сразу.
 */
const MASONRY_GROUPS = [
  "stronghold:dark-tower:",
  "stronghold:gatehouse:",
  "stronghold:wall:",
  "stronghold:berth:",
];
const DECKING = /:(floor|roof|deck):/;

function renderExpansion(piece) {
  if (piece.material !== "basalt" && piece.material !== "graphiteStone") return 0;
  if (DECKING.test(piece.id)) return 0;
  return MASONRY_GROUPS.some((group) => piece.id.startsWith(group)) ? 0.052 : 0;
}

function makeBox(piece) {
  const m = rotationMatrix(piece.rotation);
  const grown = renderExpansion(piece) / 2;
  const h = [
    piece.size[0] / 2 + grown,
    piece.size[1] / 2 + grown,
    piece.size[2] / 2 + grown,
  ];
  const axisAligned = m.every((row) =>
    row.every((value) => Math.abs(value) < AXIS_EPSILON
      || Math.abs(Math.abs(value) - 1) < AXIS_EPSILON));
  const world = [0, 1, 2].map((i) =>
    Math.abs(m[i][0]) * h[0] + Math.abs(m[i][1]) * h[1] + Math.abs(m[i][2]) * h[2]);
  return {
    piece,
    id: piece.id,
    cluster: piece.clusterId,
    centre: [piece.position[0], piece.position[1], piece.position[2]],
    half: h,
    rotation: m,
    axisAligned,
    // Мировой габарит: у осевого куска он точен, у повёрнутого — оболочка.
    worldHalf: world,
    lo: [0, 1, 2].map((i) => piece.position[i] - world[i]),
    hi: [0, 1, 2].map((i) => piece.position[i] + world[i]),
    /** Ключ кадра: осевые куски все в одном, повёрнутые — по своему углу. */
    frame: axisAligned
      ? "world"
      : (piece.rotation ?? [0, 0, 0]).map((v) => v.toFixed(6)).join("/"),
    // Тела вращения и меши считаются габаритным ящиком (см. шапку).
    inflated: piece.shape === "cylinder" || piece.shape === "sphere"
      || Boolean(piece.visualMesh) || Boolean(piece.visualProfile),
    /**
     * РИСУЕТСЯ ЛИ КУСОК ВООБЩЕ. `intactVisible: false` — это физический
     * проксик, за который рисует отдельная оболочка (так устроен покров
     * польдера: сетку и коллайдер держит LandscapeSurface). Спорить за
     * пиксели такой кусок не может по определению, и щели между двумя
     * проксиками никто не увидит. Но материя там есть, поэтому в проверках
     * заполнения, закрытости и свободного пробега он участвует наравне:
     * иначе измеритель начнёт видеть дыры в сплошном грунте.
     */
    drawn: piece.intactVisible !== false,
  };
}

/** Точка внутри ящика (в его собственных осях). */
function contains(box, point, slack = 0) {
  const dx = point[0] - box.centre[0];
  const dy = point[1] - box.centre[1];
  const dz = point[2] - box.centre[2];
  const m = box.rotation;
  for (let i = 0; i < 3; i += 1) {
    // Локальная координата = Rᵀ·(p − c); столбец матрицы, не строка.
    const local = m[0][i] * dx + m[1][i] * dy + m[2][i] * dz;
    if (Math.abs(local) > box.half[i] + slack) return false;
  }
  return true;
}

/** Ближайшее пересечение луча с ящиком, либо Infinity. Плиточный тест в осях ящика. */
function rayHit(box, origin, direction) {
  const m = box.rotation;
  const d = [origin[0] - box.centre[0], origin[1] - box.centre[1], origin[2] - box.centre[2]];
  let near = -Infinity;
  let far = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const o = m[0][i] * d[0] + m[1][i] * d[1] + m[2][i] * d[2];
    const dir = m[0][i] * direction[0] + m[1][i] * direction[1] + m[2][i] * direction[2];
    const h = box.half[i];
    if (Math.abs(dir) < 1e-12) {
      if (Math.abs(o) > h) return Infinity;
      continue;
    }
    const t1 = (-h - o) / dir;
    const t2 = (h - o) / dir;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return Infinity;
  }
  return far < 0 ? Infinity : Math.max(near, 0);
}

// --- пространственный индекс ----------------------------------------------

function buildIndex(boxes) {
  const cells = new Map();
  boxes.forEach((box, index) => {
    const x0 = Math.floor(box.lo[0] / CELL), x1 = Math.floor(box.hi[0] / CELL);
    const y0 = Math.floor(box.lo[1] / CELL), y1 = Math.floor(box.hi[1] / CELL);
    const z0 = Math.floor(box.lo[2] / CELL), z1 = Math.floor(box.hi[2] / CELL);
    // Куски размером с квартал (грунт, вода, кромка мира) залили бы индекс
    // целиком; их держим отдельным списком и проверяем всегда.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4096) {
      cells.has("huge") ? cells.get("huge").push(index) : cells.set("huge", [index]);
      return;
    }
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = `${x},${y},${z}`;
          const bucket = cells.get(key);
          if (bucket) bucket.push(index);
          else cells.set(key, [index]);
        }
      }
    }
  });
  const huge = cells.get("huge") ?? [];
  cells.delete("huge");
  return { cells, huge };
}

function atPoint(index, boxes, point) {
  const key = `${Math.floor(point[0] / CELL)},${Math.floor(point[1] / CELL)},${Math.floor(point[2] / CELL)}`;
  const local = index.cells.get(key) ?? [];
  return index.huge.length ? [...local, ...index.huge] : local;
}

/** Занята ли точка хоть кем-то, кроме исключённых. */
function occupied(index, boxes, point, exclude, slack = 0) {
  for (const candidate of atPoint(index, boxes, point)) {
    if (exclude.has(candidate)) continue;
    if (contains(boxes[candidate], point, slack)) return true;
  }
  return false;
}

/**
 * Свободный пробег луча. Идёт по ячейкам сетки (3D DDA), а не по всей сцене:
 * иначе двадцать тысяч кусков на каждый из десятков тысяч лучей.
 */
function freeRun(index, boxes, origin, direction, limit, exclude) {
  let best = limit;
  let x = Math.floor(origin[0] / CELL);
  let y = Math.floor(origin[1] / CELL);
  let z = Math.floor(origin[2] / CELL);
  const step = [Math.sign(direction[0]), Math.sign(direction[1]), Math.sign(direction[2])];
  const tDelta = [0, 1, 2].map((i) => direction[i] === 0 ? Infinity : Math.abs(CELL / direction[i]));
  const tMax = [0, 1, 2].map((i) => {
    if (direction[i] === 0) return Infinity;
    const cell = [x, y, z][i];
    const bound = (direction[i] > 0 ? cell + 1 : cell) * CELL;
    return (bound - origin[i]) / direction[i];
  });
  for (const candidate of index.huge) {
    if (exclude.has(candidate)) continue;
    best = Math.min(best, rayHit(boxes[candidate], origin, direction));
  }
  let travelled = 0;
  while (travelled < best && travelled < limit) {
    const bucket = index.cells.get(`${x},${y},${z}`);
    if (bucket) {
      for (const candidate of bucket) {
        if (exclude.has(candidate)) continue;
        const t = rayHit(boxes[candidate], origin, direction);
        if (t < best) best = t;
      }
    }
    const axis = tMax[0] <= tMax[1] && tMax[0] <= tMax[2] ? 0 : tMax[1] <= tMax[2] ? 1 : 2;
    travelled = tMax[axis];
    if (axis === 0) x += step[0];
    else if (axis === 1) y += step[1];
    else z += step[2];
    tMax[axis] += tDelta[axis];
    if (!Number.isFinite(travelled)) break;
  }
  return Math.min(best, limit);
}

// --- буфер глубины ---------------------------------------------------------

/** Разрешение буфера глубины на удалении z, в метрах. */
const depthResolution = (z, near, far) =>
  (z * z * (far - near)) / (near * far * (2 ** DEPTH_BITS - 1));

/** С какого удаления зазор δ тонет в разрешении буфера — то есть начинает рябить. */
function fightOnset(delta, near, far) {
  if (delta <= 0) return 0;
  return Math.sqrt((delta * near * far * (2 ** DEPTH_BITS - 1)) / (far - near));
}

// --- детекторы -------------------------------------------------------------

const isMoving = (piece) => Boolean(piece.hinge) || Boolean(piece.actuator);

export function auditScene(name, scene, { prefix = "" } = {}) {
  const near = 0.05;
  const far = scene.cameraFar ?? 410;
  const all = scene.breakablePieces.filter((piece) =>
    !prefix || piece.id.startsWith(prefix));
  const boxes = all.map(makeBox);
  const index = buildIndex(boxes);

  // Пары-кандидаты: соседи по ячейке, один и тот же кадр. Разные кадры
  // сравнивать нечем — общей плоскости у них нет.
  const pairs = new Set();
  for (const bucket of index.cells.values()) {
    if (bucket.length < 2) continue;
    for (let a = 0; a < bucket.length; a += 1) {
      for (let b = a + 1; b < bucket.length; b += 1) {
        const i = bucket[a], j = bucket[b];
        if (boxes[i].frame !== boxes[j].frame) continue;
        pairs.add(i < j ? i * boxes.length + j : j * boxes.length + i);
      }
    }
  }

  const seams = [];
  const fights = [];
  const crossings = [];

  for (const packed of pairs) {
    const i = Math.floor(packed / boxes.length);
    const j = packed % boxes.length;
    const A = boxes[i];
    const B = boxes[j];
    if (isMoving(A.piece) || isMoving(B.piece)) continue;
    // Невидимые проксики остаются материей для лучей, но участниками
    // визуальных дефектов быть не могут.
    if (!A.drawn || !B.drawn) continue;

    // В общем кадре оба куска — прямоугольные параллелепипеды по своим осям.
    // Для "world" это мировые оси; для повёрнутой пары — оси их общего поворота.
    const local = A.frame === "world"
      ? { aLo: A.lo, aHi: A.hi, bLo: B.lo, bHi: B.hi }
      : sharedFrame(A, B);

    for (let k = 0; k < 3; k += 1) {
      const other = [0, 1, 2].filter((axis) => axis !== k);
      // УГЛОВАЯ ЩЕЛЬ. Требовать перекрытия по ОБЕИМ оставшимся осям — значит
      // не видеть целый класс: пол вагона не доходит до борта на 50 мм, а по
      // высоте они лишь СМЫКАЮТСЯ (пол кончается на 1.500, борт с 1.500
      // начинается). Перекрытия по высоте ноль, пара выпадала из анализа
      // целиком — и паз в 50 мм на всю двенадцатиметровую длину салона нашли
      // глаза, а не числа. Смыкание достаточно: там, где две грани сходятся в
      // угол, паз лежит ПО ТУ СТОРОНУ плоскости смыкания, и заглянуть туда
      // надо явно.
      const spans = other.map((axis) => {
        const spanLo = Math.max(local.aLo[axis], local.bLo[axis]);
        const spanHi = Math.min(local.aHi[axis], local.bHi[axis]);
        const clear = spanHi - spanLo;
        if (clear > TOUCH) return { axis, lo: spanLo, hi: spanHi, corner: false };
        if (clear < -TOUCH) return null;
        const middle = (spanLo + spanHi) / 2;
        return {
          axis,
          lo: middle - CORNER_DEPTH,
          hi: middle + CORNER_DEPTH,
          corner: true,
        };
      });
      if (spans.some((span) => span === null)) continue;
      // Хотя бы одна ось обязана быть настоящим прогоном: точечное касание
      // двух рёбер стыком не является.
      if (!spans.some((span) => !span.corner && span.hi - span.lo > CORNER_RUN_MIN)) continue;
      const area = (spans[0].hi - spans[0].lo) * (spans[1].hi - spans[1].lo);
      // Спору граней раздутая угловая область не годится: перекрытие там
      // придумано, чтобы заглянуть за плоскость смыкания, а грани в углу не
      // перекрываются вовсе. Наложению нужна ЧЕСТНАЯ площадь.
      const trueArea = spans.some((span) => span.corner)
        ? 0
        : (spans[0].hi - spans[0].lo) * (spans[1].hi - spans[1].lo);

      // --- 1. щель -------------------------------------------------------
      const forward = local.bLo[k] - local.aHi[k];
      const backward = local.aLo[k] - local.bHi[k];
      const gap = forward > 0 ? forward : backward > 0 ? backward : null;
      if (gap !== null && gap > GAP_MIN && gap <= GAP_MAX && area >= SEAM_AREA_MIN) {
        const slotLo = forward > 0 ? local.aHi[k] : local.bHi[k];
        const seam = probeSeam(index, boxes, A, B, i, j, k, spans, slotLo, gap, local);
        // ЩЕЛЬ — это разрыв В ПЛОСКОСТИ листа: две доски пола, две панели
        // курса, две плиты настила. Разрыв ПО НОРМАЛИ листа — совсем другое
        // явление: так стоят накладные буквы над щитом, облицовка над стеной,
        // подкладка над шпалой.
        //
        // Слоями лежат ПАРАЛЛЕЛЬНЫЕ листы: тонкая ось у обоих одна и та же, и
        // разошлись они именно по ней. Достаточно было проверять одного —
        // и пол вагона, не дошедший до борта, объявлялся «накладным декором»:
        // у борта тонкая ось совпала с осью разделения, хотя пол ему не слой,
        // а перпендикулярный сосед. Перпендикулярные листы — это УГОЛ, и
        // разрыв в углу есть щель.
        const layered = thinAxis(local.aLo, local.aHi) === k
          && thinAxis(local.bLo, local.bHi) === k;
        if (seam) seams.push({ ...seam, area, gap, axis: k, layered });
      }

      // --- 2. наложение --------------------------------------------------
      //
      // Пары с телом вращения или мешем сюда не идут вовсе. Для ЩЕЛИ габарит
      // безопасен: он больше настоящего тела, поэтому найденный зазор — это
      // нижняя оценка настоящего, и находка честная. Для СПОРА ГРАНЕЙ всё
      // наоборот: раздутый ящик придумывает перекрытие, которого у радиального
      // настила или трубы нет. Настил полигона (`ground:plate`) — ровно этот
      // случай: сто шестнадцать «наложений», которых в кадре не существует.
      //
      // Обе стороны считаются независимо и НЕ схлопываются в одну находку:
      // у пары плит грунта спорят и низ, и верх, но низ смотрит в землю, а
      // верх — в камеру. Ранний выход по первой найденной стороне прятал
      // ровно ту, из-за которой рябит.
      if (trueArea >= FIGHT_AREA_MIN && !A.inflated && !B.inflated) {
        for (const side of ["lo", "hi"]) {
          const aFace = side === "lo" ? local.aLo[k] : local.aHi[k];
          const bFace = side === "lo" ? local.bLo[k] : local.bHi[k];
          const delta = Math.abs(aFace - bFace);
          if (delta > COPLANAR_MAX) continue;
          // Обе грани смотрят в одну сторону — только такие и спорят.
          const outward = side === "lo" ? -1 : 1;
          if (buried(index, boxes, A, B, i, j, k, spans, aFace, outward, local)) continue;
          fights.push({
            a: A.id, b: B.id, cluster: A.cluster, delta, area, axis: k, side,
            // Куда смотрит спорная грань. Спор двух подошв, зарытых в грунт,
            // геометрически такой же, как спор двух мостовых, — а видно
            // только второй. Направление решает это одним взглядом.
            facing: `${side === "lo" ? "−" : "+"}${"XYZ"[k]}`,
            onset: fightOnset(Math.max(delta, 1e-5), near, far),
            approximate: A.inflated || B.inflated,
            centre: faceCentre(A, k, spans, aFace, local),
          });
        }
      }
    }

    // --- 4. врезка ---------------------------------------------------------
    //
    // Два куска пересекаются телами, и линия их пересечения выходит наружу.
    // Решателю до этого дела нет: `deinterpenetrateClusters` разводит только
    // перекрытия глубже 22% объёма меньшей детали, а видно уже гораздо
    // меньшее — спинка, утопленная в доску сиденья на десять сантиметров, это
    // 9% объёма и совершенно очевидный глазу дефект.
    const over = [0, 1, 2].map((k) =>
      Math.min(local.aHi[k], local.bHi[k]) - Math.max(local.aLo[k], local.bLo[k]));
    // Приближённые ящики придумывают и пересечения тоже — та же причина, что
    // и у наложений выше.
    if (!A.inflated && !B.inflated && over.every((value) => value > 0.01)) {
      const volume = over[0] * over[1] * over[2];
      const sizeOf = (lo, hi) => (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
      const smaller = Math.min(
        sizeOf(local.aLo, local.aHi), sizeOf(local.bLo, local.bHi));
      const share = volume / smaller;
      // Ниже 3% — притирка на контакте, выше 22% — это уже забота решателя.
      if (share >= 0.03 && share < VOLUME_RATIO_GATE && exposed(index, boxes, A, i, j, local, over)) {
        crossings.push({
          a: A.id, b: B.id, cluster: A.cluster, share, volume,
          overlap: over.map((value) => round(value, 3)),
          approximate: A.inflated || B.inflated,
          centre: faceCentre(A, 0,
            [{ axis: 1, lo: Math.max(local.aLo[1], local.bLo[1]), hi: Math.min(local.aHi[1], local.bHi[1]) },
             { axis: 2, lo: Math.max(local.aLo[2], local.bLo[2]), hi: Math.min(local.aHi[2], local.bHi[2]) }],
            (Math.max(local.aLo[0], local.bLo[0]) + Math.min(local.aHi[0], local.bHi[0])) / 2, local),
        });
      }
    }
  }

  // --- 3. фольга -----------------------------------------------------------
  const foils = [];
  for (const box of boxes) {
    if (box.inflated || !box.drawn) continue;
    const thickness = Math.min(...box.piece.size);
    const onset = fightOnset(thickness, near, far);
    if (onset < 80) {
      foils.push({
        id: box.id, cluster: box.cluster, thickness, onset,
        centre: box.centre,
      });
    }
  }

  return {
    name, near, far, pieces: all.length, seams, fights, foils, crossings,
    // Мощение сцены — чтобы вызывающий мог спросить отдельно про плитку, не
    // разбирая идентификаторы регулярками.
    tileIds: new Set(all.filter((piece) => piece.shape === "groundTile")
      .map((piece) => piece.id)),
  };
}

/**
 * Выходит ли линия пересечения двух тел наружу. Углы коробки перекрытия лежат
 * ровно на этой линии; если хоть один не закрыт третьим куском — врезка видна.
 */
function exposed(index, boxes, A, i, j, local, over) {
  const skip = new Set([i, j]);
  const lo = [0, 1, 2].map((k) => Math.max(local.aLo[k], local.bLo[k]));
  for (let corner = 0; corner < 8; corner += 1) {
    const point = [0, 1, 2].map((k) =>
      lo[k] + ((corner >> k) & 1 ? over[k] : 0));
    const world = A.frame === "world" ? point : toWorld(A, point);
    if (!occupied(index, boxes, world, skip)) return true;
  }
  return false;
}

/** Самая тонкая ось куска — нормаль его листа. */
function thinAxis(lo, hi) {
  const extent = [0, 1, 2].map((i) => hi[i] - lo[i]);
  return extent[0] <= extent[1] && extent[0] <= extent[2] ? 0 : extent[1] <= extent[2] ? 1 : 2;
}

/** Границы пары в осях их общего поворота. */
function sharedFrame(A, B) {
  const m = A.rotation;
  const project = (box) => {
    const d = [0, 1, 2].map((i) => box.centre[i]);
    return [0, 1, 2].map((i) => m[0][i] * d[0] + m[1][i] * d[1] + m[2][i] * d[2]);
  };
  const a = project(A);
  const b = project(B);
  return {
    aLo: [0, 1, 2].map((i) => a[i] - A.half[i]),
    aHi: [0, 1, 2].map((i) => a[i] + A.half[i]),
    bLo: [0, 1, 2].map((i) => b[i] - B.half[i]),
    bHi: [0, 1, 2].map((i) => b[i] + B.half[i]),
  };
}

/** Точка общего кадра обратно в мировые координаты. */
function toWorld(A, localPoint) {
  const m = A.rotation;
  return [0, 1, 2].map((row) =>
    m[row][0] * localPoint[0] + m[row][1] * localPoint[1] + m[row][2] * localPoint[2]);
}

function faceCentre(A, k, spans, face, local) {
  const point = [];
  point[k] = face;
  for (const span of spans) point[span.axis] = (span.lo + span.hi) / 2;
  return A.frame === "world" ? point : toWorld(A, point);
}

/**
 * Заполнена ли щель, и видно ли сквозь неё.
 *
 * Заполнение проверяется точками ВНУТРИ щели: любой кусок, зашедший в зазор
 * (нащельник, отлив, стойка рамы, соседний курс), делает стык честным. Именно
 * это снимает ложные срабатывания «проверили только срединную плоскость».
 *
 * Открытость — лучом ПОПЕРЁК ЛИСТА: направление берётся по короткой из двух
 * оставшихся осей щели, потому что видно сквозь стену по её толщине, а не
 * вдоль стены.
 */
function probeSeam(index, boxes, A, B, i, j, k, spans, slotLo, gap, local) {
  const exclude = new Set([i, j]);
  const mid = slotLo + gap / 2;
  const samples = [];
  const STEPS = 4;
  for (let u = 1; u <= STEPS; u += 1) {
    for (let v = 1; v <= STEPS; v += 1) {
      const point = [];
      point[k] = mid;
      point[spans[0].axis] = spans[0].lo + (spans[0].hi - spans[0].lo) * (u / (STEPS + 1));
      point[spans[1].axis] = spans[1].lo + (spans[1].hi - spans[1].lo) * (v / (STEPS + 1));
      samples.push(A.frame === "world" ? point : toWorld(A, point));
    }
  }
  const open = samples.filter((point) =>
    !occupied(index, boxes, point, exclude, -gap * 0.15));
  if (!open.length) return null;

  // Короткая ось щели — нормаль листа: сквозь стену смотрят по толщине.
  const normalAxis = (spans[0].hi - spans[0].lo) <= (spans[1].hi - spans[1].lo)
    ? spans[0].axis : spans[1].axis;
  const dirLocal = [0, 0, 0];
  dirLocal[normalAxis] = 1;
  const direction = A.frame === "world" ? dirLocal : toWorld(A, dirLocal);
  const back = direction.map((value) => -value);

  let bestSides = 0;
  let witness = open[0];
  for (const point of open) {
    const forward = freeRun(index, boxes, point, direction, ESCAPE, exclude);
    const reverse = freeRun(index, boxes, point, back, ESCAPE, exclude);
    const sides = (forward >= ESCAPE ? 1 : 0) + (reverse >= ESCAPE ? 1 : 0);
    if (sides > bestSides) { bestSides = sides; witness = point; }
    if (bestSides === 2) break;
  }
  if (bestSides === 0) return null;
  return {
    a: A.id, b: B.id, cluster: A.cluster,
    openSides: bestSides,
    unfilled: open.length / samples.length,
    centre: witness,
    approximate: A.inflated || B.inflated,
  };
}

/** Закрыта ли спорная грань третьим куском — тогда спорить не о чем. */
function buried(index, boxes, A, B, i, j, k, spans, face, outward, local) {
  const exclude = new Set([i, j]);
  for (let u = 1; u <= 3; u += 1) {
    for (let v = 1; v <= 3; v += 1) {
      const point = [];
      point[k] = face + outward * 0.03;
      point[spans[0].axis] = spans[0].lo + (spans[0].hi - spans[0].lo) * (u / 4);
      point[spans[1].axis] = spans[1].lo + (spans[1].hi - spans[1].lo) * (v / 4);
      const world = A.frame === "world" ? point : toWorld(A, point);
      if (!occupied(index, boxes, world, exclude)) return false;
    }
  }
  return true;
}

// --- отчёт -----------------------------------------------------------------

const round = (value, digits = 3) => Number(value.toFixed(digits));
const place = (point) => point.map((value) => round(value, 1)).join(" ");

function groupKey(id) {
  return id
    .replace(/:-?\d+(\.\d+)?(?=(:|$))/g, ":*")
    .replace(/(:\*)+$/, ":*");
}

function summarise(report, top) {
  const lines = [];
  const inPlane = report.seams.filter((seam) => !seam.layered);
  const seeThrough = inPlane.filter((seam) => seam.openSides === 2);
  const dark = inPlane.filter((seam) => seam.openSides === 1);
  const layered = report.seams.filter((seam) => seam.layered && seam.openSides === 2);
  const nearFights = report.fights.filter((fight) => fight.onset < 60);
  const exact = report.fights.filter((fight) => fight.delta < 1e-6);
  lines.push(`\n=== ${report.name} — ${report.pieces} кусков, near ${report.near} / far ${report.far} ===`);
  lines.push(`  разрешение глубины: ${round(depthResolution(30, report.near, report.far) * 1000, 1)} мм на 30 м · `
    + `${round(depthResolution(100, report.near, report.far) * 1000, 1)} мм на 100 м · `
    + `${round(depthResolution(report.far / 2, report.near, report.far) * 1000, 0)} мм на ${report.far / 2} м`);
  lines.push(`  ЩЕЛИ В ПЛОСКОСТИ: ${seeThrough.length} сквозных, ${dark.length} тёмных`);
  lines.push(`  ЗАЗОРЫ ПО СЛОЯМ: ${layered.length} (накладной декор — норма; висящий реквизит — нет)`);
  lines.push(`  НАЛОЖЕНИЯ: ${report.fights.length} всего, ${exact.length} копланарны точно, ${nearFights.length} рябят ближе 60 м`);
  lines.push(`  ВРЕЗКИ: ${report.crossings.length} видимых пересечений тел (3…22% объёма)`);
  lines.push(`  ФОЛЬГА: ${report.foils.length} кусков тоньше разрешения буфера`);

  const table = (title, rows, format) => {
    if (!rows.length) return;
    const groups = new Map();
    for (const row of rows) {
      const key = groupKey(row.a ?? row.id);
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    lines.push(`\n  ${title}`);
    for (const [key, bucket] of [...groups].sort((x, y) => y[1].length - x[1].length).slice(0, top)) {
      lines.push(`    ${String(bucket.length).padStart(4)}× ${key}`);
      lines.push(`         ${format(bucket[0])}`);
    }
    if (groups.size > top) lines.push(`    … ещё ${groups.size - top} групп`);
  };

  table("сквозные щели в плоскости (видно насквозь):", seeThrough, (seam) =>
    `${round(seam.gap * 1000, 1)} мм, ${round(seam.area, 2)} м², @ ${place(seam.centre)} · ${seam.b}`);
  table("тёмные щели в плоскости (паз в полость):", dark, (seam) =>
    `${round(seam.gap * 1000, 1)} мм, ${round(seam.area, 2)} м², @ ${place(seam.centre)} · ${seam.b}`);
  table("зазоры по слоям (проверить, что это декор, а не висящая деталь):", layered, (seam) =>
    `${round(seam.gap * 1000, 1)} мм, ${round(seam.area, 2)} м², @ ${place(seam.centre)} · ${seam.b}`);
  table("наложения текстур:", nearFights, (fight) =>
    `грань ${fight.facing}, δ ${round(fight.delta * 1000, 2)} мм, ${round(fight.area, 2)} м², `
    + `${fight.delta < 1e-6 ? "спорит на ЛЮБОМ удалении" : `рябит с ${round(fight.onset, 1)} м`} · ${fight.b}`);
  table("врезки (тела пересекаются, линия видна):", report.crossings, (cross) =>
    `${round(cross.share * 100, 1)}% объёма, перекрытие ${cross.overlap.join("×")} м · ${cross.b}`);
  table("фольга:", report.foils, (foil) =>
    `${round(foil.thickness * 1000, 2)} мм, рябит с ${round(foil.onset, 1)} м @ ${place(foil.centre)}`);
  return lines.join("\n");
}

// --- запуск ----------------------------------------------------------------
//
// Всё ниже — только командная строка. Тест импортирует `auditScene` напрямую и
// сюда не заходит: модуль обязан оставаться безмолвным при импорте.

const argv = process.argv.slice(2);
const invokedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? fallback : argv[index + 1];
};
const target = argv.find((value, index) => !value.startsWith("--")
  && argv[index - 1] !== "--prefix" && argv[index - 1] !== "--top") ?? "all";
const prefix = flag("prefix", "");
const top = Number(flag("top", 25));
const asJson = argv.includes("--json");

const chosen = target === "all" ? Object.keys(SCENES) : [target];
const reports = [];
for (const key of chosen) {
  let scene;
  try {
    scene = await loadScene(key);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  reports.push(auditScene(key, scene, { prefix }));
}

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) console.log(summarise(report, top));
  const totals = reports.reduce((sum, report) => ({
    seeThrough: sum.seeThrough
      + report.seams.filter((s) => !s.layered && s.openSides === 2).length,
    dark: sum.dark + report.seams.filter((s) => !s.layered && s.openSides === 1).length,
    layered: sum.layered + report.seams.filter((s) => s.layered && s.openSides === 2).length,
    fights: sum.fights + report.fights.filter((f) => f.onset < 60).length,
    crossings: sum.crossings + report.crossings.length,
    foils: sum.foils + report.foils.length,
  }), { seeThrough: 0, dark: 0, layered: 0, fights: 0, crossings: 0, foils: 0 });
  console.log(`\n=== ИТОГО по ${reports.length} сценам ===`);
  console.log(`  сквозных щелей в плоскости ${totals.seeThrough} · тёмных ${totals.dark}`
    + ` · зазоров по слоям ${totals.layered}`
    + ` · наложений ближе 60 м ${totals.fights} · врезок ${totals.crossings}`
    + ` · фольги ${totals.foils}`);
}
}
