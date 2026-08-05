import type { ScenePrefabPieceDefinition } from "../scenes/sceneContract.ts";

/**
 * Shared trees — irregular composite primitives instead of "box on a stick".
 *
 * A tree is ASSEMBLED the way a tree grows: a leaning trunk, real branch
 * members leaving it at believable heights, and 6–12 rotated foliage clumps of
 * different sizes and tones gathered where branches end (plus a crown core so
 * the silhouette never reads hollow). Every piece is an ordinary breakable
 * body: trunk grounded, branches attached to it, clumps attached to branches —
 * so chopping the trunk drops the whole crown.
 *
 * `seed` makes each instance unique; register several seeds as prefab variants
 * for document scenes, or call the builder directly in programmatic ones.
 */

export type FloraPiece = ScenePrefabPieceDefinition;

function rand(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * ЦВЕТ ЛИСТВЫ — это две разные вещи сразу: цвет ПОРОДЫ и место листа в кроне.
 *
 * Порода: дуб держит глубокий, чуть синеватый зелёный и матовую пластинку;
 * берёза — светлая, желтоватая и просвечивающая, она и желтеет раньше всех;
 * ива белая — самая холодная и серая, с серебряным исподом.
 *
 * Место: оболочка кроны выгорает на солнце и уходит в тёплый светло-зелёный,
 * а внутренние, затенённые листья остаются тёмными и холодными. Одна палитра
 * на всю крону убивает объём: дерево читается плоским пятном.
 *
 * Редкие вкрапления жёлтого — не осень, а норма: в любой кроне есть отжившие
 * листья. Они раздаются ПОЛИСТНО в шейдере (`TreeVisuals`), а не целыми
 * комьями, иначе крона выглядит больной пятнами.
 */
const CLUMP_GREENS = ["#2f4527", "#3a5230", "#44603a", "#2a3f24", "#4b6537", "#37503a"];
const CLUMP_SUN = ["#57733a", "#618044", "#4d6a33", "#6a8a4a", "#5b7940"];
const BIRCH_GREENS = ["#4c6532", "#5a7239", "#446030", "#65793f", "#52683a"];
const BIRCH_SUN = ["#8aa24c", "#95ad57", "#7e9846", "#9db65e", "#88a04f"];
// Жухлая листва усохших ветвей: рыжие и бурые тона мёртвого листа, который
// ещё держится на дереве.
const CLUMP_DRY = ["#8a5a33", "#9c6b3c", "#7c4f2c", "#a4763f"];
const BIRCH_DRY = ["#a5793d", "#96683a", "#b08a4a", "#8d6136"];

interface TreeOptions {
  readonly seed?: number;
  readonly scale?: number;
  /**
   * Разрешить дереву быть полусухим. Часть разрешённых деревьев (по сиду)
   * получает усохшие ветви: жухнет не конфетти по кроне, а целые подкроны —
   * у мёртвой ветви умирает вся её листва разом.
   */
  readonly dry?: boolean;
}

/** 0 — здоровое дерево; иначе доля усохших ветвей, разыгранная от сида. */
function treeDryness(options: TreeOptions, seed: number): number {
  return options.dry && rand(seed, 777) > 0.7
    ? 0.3 + rand(seed, 778) * 0.45
    : 0;
}

function clump(
  kind: TreeKind,
  treeSeed: number,
  id: string,
  parentLocalId: string,
  clumpSeed: number,
  center: readonly [number, number, number],
  size: number,
  palette: readonly string[],
  volume: number,
): FloraPiece {
  const stretchX = 0.8 + rand(clumpSeed, 1) * 0.55;
  const stretchY = 0.62 + rand(clumpSeed, 2) * 0.42;
  const stretchZ = 0.8 + rand(clumpSeed, 3) * 0.55;
  const sectionSize = size * 0.68;

  // Crown density lives in the procedural render lobes, not in one enormous
  // gameplay block. Keeping this proxy below a metre makes every visible
  // section directly damageable without multiplying rigid-body count.
  return {
    id,
    material: "foliage",
    shape: "panel",
    position: center,
    rotation: [
      (rand(clumpSeed, 4) - 0.5) * 0.5,
      rand(clumpSeed, 5) * Math.PI,
      (rand(clumpSeed, 6) - 0.5) * 0.5,
    ],
    size: [
      sectionSize * stretchX,
      sectionSize * stretchY,
      sectionSize * stretchZ,
    ],
    color: palette[Math.floor(rand(clumpSeed, 7) * palette.length)],
    bearsLoad: false,
    volume: volume * sectionSize * sectionSize * sectionSize,
    sideAttachmentReach: 0.95,
    contactBoxes: [{
      position: center,
      size: [sectionSize * 0.68, sectionSize * 0.68, sectionSize * 0.68],
    }],
    treeVisual: {
      kind,
      seed: treeSeed,
      role: "foliage",
      localId: id,
      parentLocalId,
    },
  };
}

type FloraVector = readonly [number, number, number];

function addVector(left: FloraVector, right: FloraVector): FloraVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVector(vector: FloraVector, scale: number): FloraVector {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function normalizeVector(vector: FloraVector): FloraVector {
  const length = Math.max(0.0001, Math.hypot(...vector));
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function directionFromAngles(yaw: number, tilt: number): FloraVector {
  return [
    Math.cos(yaw) * Math.sin(tilt),
    Math.cos(tilt),
    Math.sin(yaw) * Math.sin(tilt),
  ];
}

function branchPiece(
  kind: TreeKind,
  treeSeed: number,
  id: string,
  parentLocalId: string,
  start: FloraVector,
  rawDirection: FloraVector,
  length: number,
  diameter: number,
  color: string,
): FloraPiece {
  const direction = normalizeVector(rawDirection);
  const center = addVector(start, scaleVector(direction, length / 2));
  const yaw = Math.atan2(direction[2], direction[0]);
  const tilt = Math.acos(Math.max(-1, Math.min(1, direction[1])));
  const jointSize = Math.max(diameter * 2.6, length * 0.12);
  return {
    id,
    material: "wood",
    shape: "cylinder",
    position: center,
    rotation: [0, -yaw, -tilt],
    size: [diameter, length, diameter],
    color,
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: Math.max(0.5, diameter * 3.2),
    contactBoxes: [
      { position: start, size: [jointSize, jointSize, jointSize] },
      {
        // Коробка тянется почти во всю длину члена: при 0.78 кончик длинного
        // сука выходил за неё, и терминальный ком кроны терял опору — крона
        // рассыпалась на старте сцены, стоило суку удлиниться.
        position: center,
        size: [
          Math.max(jointSize, Math.abs(direction[0]) * length * 0.92),
          Math.max(jointSize, Math.abs(direction[1]) * length * 0.92),
          Math.max(jointSize, Math.abs(direction[2]) * length * 0.92),
        ],
      },
    ],
    treeVisual: {
      kind,
      seed: treeSeed,
      role: "branch",
      localId: id,
      parentLocalId,
    },
  };
}

/**
 * A broadleaf tree (oak-like): stout trunk, spreading branches, lumpy crown.
 *
 * МАСШТАБ ПОРОДЫ. `scale: 1` — взрослый одиночный дуб полевой межи: около
 * 11–13 м высоты, крона шириной почти в высоту, ствол в 7–8 калибров. Порода
 * обязана читаться размером: дуб — самое крупное лиственное этих ландшафтов, и
 * рядом со стриженой ивой (5–6 м) он должен быть вдвое выше. Прежние 3.7–4.1 м
 * делали его ровесником ивы, отчего берег читался садом одинаковых кустов.
 * Молодое дерево получают `scale` на месте посадки, а не занижением породы.
 */
export function propOak(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const dryness = treeDryness(options, seed);
  const trunkHeight = (6.6 + rand(seed, 10) * 1.7) * s;
  const lean = (rand(seed, 11) - 0.5) * 0.14;
  const leanYaw = rand(seed, 12) * Math.PI * 2;
  const trunkRotation: readonly [number, number, number] = [
    Math.sin(leanYaw) * lean,
    0,
    -Math.cos(leanYaw) * lean,
  ];
  const trunkAxis: readonly [number, number, number] = [
    -Math.sin(trunkRotation[2]),
    Math.cos(trunkRotation[0]) * Math.cos(trunkRotation[2]),
    Math.sin(trunkRotation[0]) * Math.cos(trunkRotation[2]),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: [
        trunkAxis[0] * trunkHeight * 0.5,
        trunkAxis[1] * trunkHeight * 0.5,
        trunkAxis[2] * trunkHeight * 0.5,
      ],
      rotation: trunkRotation,
      size: [(0.82 + rand(seed, 13) * 0.3) * s, trunkHeight, (0.82 + rand(seed, 13) * 0.3) * s],
      color: rand(seed, 14) > 0.5 ? "#4d392d" : "#54402f",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.35,
      contactBoxes: [{ position: [0, trunkHeight / 2, 0], size: [0.62 * s, trunkHeight, 0.62 * s] }],
      treeVisual: { kind: "oak", seed, role: "trunk", localId: "trunk" },
    },
  ];
  // Сук дуба ВЫНОСИТ крону: он длиной в половину высоты дерева и уходит вбок
  // почти горизонтально, отчего крона шириной с высоту. Короткие сучки давали
  // компактный шар — силуэт липы или яблони, но не дуба.
  const branchCount = 7 + Math.floor(rand(seed, 15) * 4);
  for (let branch = 0; branch < branchCount; branch += 1) {
    const yaw =
      branch * 2.399963229728653 +
      (rand(seed, 16 + branch) - 0.5) * 0.65;
    const tilt = 0.55 + rand(seed, 20 + branch) * 0.5;
    const length = (2.6 + rand(seed, 24 + branch) * 1.6) * s;
    const direction = directionFromAngles(yaw, tilt);
    const attachHeight = trunkHeight * (
      0.42 +
      (branch / Math.max(1, branchCount - 1)) * 0.5 +
      (rand(seed, 60 + branch) - 0.5) * 0.028
    );
    const branchAttach = scaleVector(trunkAxis, attachHeight);
    const primaryId = `branch:p:${branch}`;
    // Усохшая ветвь тянет за собой весь подкрон: и свой кламп, и клампы
    // развилок ниже красятся жухлым разом.
    const branchLeaves =
      rand(seed, 500 + branch) < dryness ? CLUMP_DRY : CLUMP_GREENS;
    // Оболочка кроны (концы сучьев и развилок) выгорела на солнце, нутро
    // осталось в тени: разные палитры дают крону объёмной, а не пятном.
    const sunLeaves =
      rand(seed, 500 + branch) < dryness ? CLUMP_DRY : CLUMP_SUN;
    pieces.push(
      branchPiece(
        "oak",
        seed,
        primaryId,
        "trunk",
        branchAttach,
        direction,
        length,
        (0.2 + rand(seed, 66 + branch) * 0.08) * s,
        "#4a372b",
      ),
    );
    const primaryTip = addVector(branchAttach, scaleVector(direction, length));
    pieces.push(
      clump(
        "oak",
        seed,
        `leaf:p:${branch}`,
        primaryId,
        seed * 7 + branch * 19 + 1,
        primaryTip,
        (0.86 + rand(seed, 28 + branch) * 0.14) * s,
        sunLeaves,
        0.2,
      ),
      // Листва сидит и на самом суку, а не только на его конце: без этого
      // крона выходит кольцом помпонов по периметру и просвечивает насквозь.
      // Крупная крона набирается ЧИСЛОМ секций: ком крупнее метра падал бы
      // одним куском вместо осыпающейся кроны (детектор в tree-visual-model).
      clump(
        "oak",
        seed,
        `leaf:pm:${branch}`,
        primaryId,
        seed * 7 + branch * 19 + 3,
        addVector(branchAttach, scaleVector(direction, length * 0.68)),
        (0.8 + rand(seed, 34 + branch) * 0.16) * s,
        branchLeaves,
        0.18,
      ),
      clump(
        "oak",
        seed,
        `leaf:pl:${branch}`,
        primaryId,
        seed * 7 + branch * 19 + 5,
        addVector(branchAttach, scaleVector(direction, length * 0.42)),
        (0.74 + rand(seed, 40 + branch) * 0.16) * s,
        branchLeaves,
        0.17,
      ),
    );

    for (let fork = 0; fork < 2; fork += 1) {
      const forkT = 0.42 + fork * 0.3;
      const forkStart = addVector(
        branchAttach,
        scaleVector(direction, length * forkT),
      );
      const forkYaw =
        yaw +
        (fork === 0 ? -1 : 1) *
          (0.46 + rand(seed, 80 + branch * 2 + fork) * 0.42);
      const forkTilt = 0.65 + rand(seed, 100 + branch * 2 + fork) * 0.38;
      const forkDirection = directionFromAngles(forkYaw, forkTilt);
      const forkLength =
        (1.15 + rand(seed, 120 + branch * 2 + fork) * 0.95) * s;
      const forkId = `branch:s:${branch}:${fork}`;
      pieces.push(
        branchPiece(
          "oak",
          seed,
          forkId,
          primaryId,
          forkStart,
          forkDirection,
          forkLength,
          (0.1 + rand(seed, 140 + branch * 2 + fork) * 0.04) * s,
          "#49362a",
        ),
      );
      const forkTip = addVector(
        forkStart,
        scaleVector(forkDirection, forkLength),
      );
      pieces.push(
        clump(
          "oak",
          seed,
          `leaf:s:${branch}:${fork}`,
          forkId,
          seed * 7 + branch * 19 + fork + 7,
          forkTip,
          (0.8 + rand(seed, 160 + branch * 2 + fork) * 0.16) * s,
          sunLeaves,
          0.16,
        ),
        clump(
          "oak",
          seed,
          `leaf:sm:${branch}:${fork}`,
          forkId,
          seed * 7 + branch * 19 + fork + 11,
          addVector(forkStart, scaleVector(forkDirection, forkLength * 0.55)),
          (0.72 + rand(seed, 170 + branch * 2 + fork) * 0.16) * s,
          branchLeaves,
          0.15,
        ),
      );
    }
  }
  // Six modest trunk-carried cores close the centre without becoming one
  // giant falling body when the crown is hit. Ядро сидит НА СТВОЛЕ в зоне
  // сучьев: вынесенное выше торца, оно повисало без опоры (боковой вылет
  // клампа 0.95 м) и сцена не стартовала.
  for (let core = 0; core < 6; core += 1) {
    const height = trunkHeight * (0.58 + core * 0.07);
    pieces.push(
      clump(
        "oak",
        seed,
        `leaf:core:${core}`,
        "trunk",
        seed * 7 + 90 + core,
        [
          trunkAxis[0] * height + (rand(seed, 180 + core) - 0.5) * 0.7 * s,
          trunkAxis[1] * height + (0.3 + (core % 3) * 0.24) * s,
          trunkAxis[2] * height + (rand(seed, 190 + core) - 0.5) * 0.7 * s,
        ],
        (0.84 + rand(seed, 200 + core) * 0.14) * s,
        rand(seed, 560 + core) < dryness * 0.4 ? CLUMP_DRY : CLUMP_GREENS,
        0.19,
      ),
    );
  }
  return pieces;
}

/**
 * A slender birch: pale trunk with ascending layered branch pairs.
 *
 * МАСШТАБ ПОРОДЫ. `scale: 1` — взрослая повислая берёза (Betula pendula):
 * 12–14 м при стволе в тридцать с лишним калибров, крона узкая (треть высоты
 * в поперечнике) и сквозная, ветви поднимаются, а их концы виснут. Берёза
 * чуть перерастает дуб и заметно у́же его: в природе они одного роста, а
 * различает их не высота, а масса кроны. Прежние
 * 4.1–5.0 м при Ø0.22 — это саженец у подъезда, а не дерево; рядом с ним
 * не читались ни дуб, ни сосна. Молодое дерево задаётся `scale` на месте
 * посадки, а не занижением породы.
 */
export function propBirch(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const dryness = treeDryness(options, seed);
  const trunkHeight = (10.4 + rand(seed, 10) * 2.2) * s;
  const leanX = (rand(seed, 11) - 0.5) * 0.1;
  const leanZ = (rand(seed, 12) - 0.5) * 0.1;
  const trunkRotation: FloraVector = [leanX, 0, leanZ];
  const trunkAxis: FloraVector = [
    -Math.sin(leanZ),
    Math.cos(leanX) * Math.cos(leanZ),
    Math.sin(leanX) * Math.cos(leanZ),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: scaleVector(trunkAxis, trunkHeight / 2),
      rotation: trunkRotation,
      size: [(0.3 + rand(seed, 15) * 0.1) * s, trunkHeight, (0.3 + rand(seed, 15) * 0.1) * s],
      color: "#c9c4b4",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      contactBoxes: [{
        position: [0, trunkHeight / 2, 0],
        size: [(0.3 + rand(seed, 15) * 0.1) * s, trunkHeight, (0.3 + rand(seed, 15) * 0.1) * s],
      }],
      treeVisual: { kind: "birch", seed, role: "trunk", localId: "trunk" },
    },
  ];
  // Ярусов больше: крона высокая и узкая, и ветвь сидит через каждые
  // полметра-метр ствола, а не восемью пучками на всё дерево.
  const levelCount = 11 + Math.floor(rand(seed, 13) * 3);
  for (let level = 0; level < levelCount; level += 1) {
    const yaw =
      level * 2.399963229728653 +
      (rand(seed, 14 + level) - 0.5) * 0.5;
    const attachHeight = trunkHeight * (
      0.4 +
      (level / Math.max(1, levelCount - 1)) * 0.55 +
      (rand(seed, 24 + level) - 0.5) * 0.02
    );
    const attach = scaleVector(trunkAxis, attachHeight);
    const direction = directionFromAngles(
      yaw,
      0.56 + rand(seed, 34 + level) * 0.3,
    );
    const length = (1.5 + rand(seed, 44 + level) * 0.9) * s;
    const primaryId = `branch:p:${level}`;
    // Ярус сохнет целиком: обе ветви уровня несут одну и ту же жухлую листву.
    const levelLeaves =
      rand(seed, 500 + level) < dryness ? BIRCH_DRY : BIRCH_GREENS;
    const sunLeaves =
      rand(seed, 500 + level) < dryness ? BIRCH_DRY : BIRCH_SUN;
    pieces.push(
      branchPiece(
        "birch",
        seed,
        primaryId,
        "trunk",
        attach,
        direction,
        length,
        (0.075 + rand(seed, 54 + level) * 0.03) * s,
        "#716957",
      ),
    );
    const primaryTip = addVector(attach, scaleVector(direction, length));
    pieces.push(
      clump(
        "birch",
        seed,
        `leaf:p:${level}`,
        primaryId,
        seed * 11 + level * 17,
        primaryTip,
        (0.6 + rand(seed, 64 + level) * 0.16) * s,
        sunLeaves,
        0.14,
      ),
      // Листва идёт и по самой ветви: у берёзы крона сквозная, но не голая.
      clump(
        "birch",
        seed,
        `leaf:pm:${level}`,
        primaryId,
        seed * 11 + level * 17 + 3,
        addVector(attach, scaleVector(direction, length * 0.58)),
        (0.5 + rand(seed, 70 + level) * 0.16) * s,
        levelLeaves,
        0.13,
      ),
    );

    const forkStart = addVector(attach, scaleVector(direction, length * 0.62));
    // Повислость — подпись породы: ветвь поднимается, а её концы уходят вниз,
    // поэтому развилка кладётся положе горизонтали (0.95–1.3 рад).
    const forkDirection = directionFromAngles(
      yaw + (level % 2 === 0 ? -1 : 1) * (0.42 + rand(seed, 74 + level) * 0.3),
      0.95 + rand(seed, 84 + level) * 0.35,
    );
    const forkLength = (0.9 + rand(seed, 94 + level) * 0.7) * s;
    const forkId = `branch:s:${level}:0`;
    pieces.push(
      branchPiece(
        "birch",
        seed,
        forkId,
        primaryId,
        forkStart,
        forkDirection,
        forkLength,
        (0.04 + rand(seed, 104 + level) * 0.014) * s,
        "#6b6455",
      ),
      clump(
        "birch",
        seed,
        `leaf:s:${level}:0`,
        forkId,
        seed * 11 + level * 17 + 7,
        addVector(forkStart, scaleVector(forkDirection, forkLength)),
        (0.54 + rand(seed, 114 + level) * 0.16) * s,
        sunLeaves,
        0.12,
      ),
      clump(
        "birch",
        seed,
        `leaf:sm:${level}:0`,
        forkId,
        seed * 11 + level * 17 + 11,
        addVector(forkStart, scaleVector(forkDirection, forkLength * 0.55)),
        (0.46 + rand(seed, 124 + level) * 0.14) * s,
        levelLeaves,
        0.12,
      ),
    );
  }
  pieces.push(
    clump(
      "birch",
      seed,
      "leaf:top",
      "trunk",
      seed * 11 + 95,
      addVector(scaleVector(trunkAxis, trunkHeight), [0, 0.3 * s, 0]),
      0.72 * s,
      rand(seed, 599) < dryness * 0.6 ? BIRCH_DRY : BIRCH_SUN,
      0.14,
    ),
  );
  return pieces;
}

// Хвоя сосны: сине-зелёная с сизым налётом, а на солнце заметно светлее и
// желтее. Внутри кроны хвоя старше и темнее — там же копится сухая.
const PINE_NEEDLES = ["#33452f", "#2c3d2b", "#3a4d34", "#2f4632"];
const PINE_SUN = ["#4e6440", "#576d48", "#48603d", "#5b7350"];

/**
 * Номинальная высота сосны при `scale: 1` (м). Мир, который сажает сосну
 * ЗАДАННОЙ высоты, обязан считать масштаб от этой константы, а не от числа,
 * списанного с прежней сборки: иначе смена габарита породы молча растит его
 * деревья втрое (так и вышло с базальтовой крепостью).
 */
export const PINE_NOMINAL_HEIGHT = 18.4;

/**
 * Сосна обыкновенная (Pinus sylvestris).
 *
 * ПОРОДА, А НЕ ЁЛКА. Ключ к силуэту — НЕ конус: у сосны нижняя половина ствола
 * ГОЛАЯ (нижние сучья отмирают и обламываются), а крона сидит наверху рыхлыми
 * подушками хвои на почти горизонтальных сучьях. Второй ключ — двухцветная
 * кора: серо-бурый плитчатый комель и рыжий, почти медный верх ствола, который
 * шелушится тонкими чешуями; он-то и опознаётся с любого расстояния.
 *
 * Прежняя сборка (ярусы-блины на всю высоту, конус, 6.4–8 м) читалась
 * новогодней ёлкой из палок. `scale: 1` — взрослое дерево опушки, 16–20 м.
 */
export function propPine(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const dryness = treeDryness(options, seed);
  const trunkHeight = (16.5 + rand(seed, 10) * 3.4) * s;
  const trunkWidth = (0.52 + rand(seed, 11) * 0.18) * s;
  const boleHeight = trunkHeight * (0.54 + rand(seed, 12) * 0.08);
  const trunkRotation: readonly [number, number, number] = [
    (rand(seed, 13) - 0.5) * 0.05,
    0,
    (rand(seed, 14) - 0.5) * 0.05,
  ];
  const trunkAxis: FloraVector = [
    -Math.sin(trunkRotation[2]),
    Math.cos(trunkRotation[0]) * Math.cos(trunkRotation[2]),
    Math.sin(trunkRotation[0]) * Math.cos(trunkRotation[2]),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: scaleVector(trunkAxis, boleHeight * 0.5),
      rotation: trunkRotation,
      size: [trunkWidth, boleHeight, trunkWidth],
      color: rand(seed, 15) > 0.5 ? "#4f4034" : "#57483a",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.42,
      // Коробка идёт ПО ОСИ ствола, а не по вертикали: у восемнадцатиметрового
      // дерева даже малый наклон уводит верхушку на полметра, и сучья теряют
      // опору, оставаясь визуально на месте.
      contactBoxes: [{
        position: scaleVector(trunkAxis, boleHeight * 0.5),
        size: [trunkWidth * 0.92, boleHeight, trunkWidth * 0.92],
      }],
      treeVisual: { kind: "pine", seed, role: "trunk", localId: "trunk" },
    },
  ];

  // Верх ствола — отдельное тело: другой цвет коры и другой калибр. Кроме
  // цвета это даёт кроне честную опору: подушки висят на сучьях этой части.
  const crownRun = trunkHeight - boleHeight;
  const crownWidth = trunkWidth * 0.74;
  pieces.push({
    id: "stem",
    material: "wood",
    shape: "cylinder",
    position: scaleVector(trunkAxis, boleHeight + crownRun * 0.5),
    rotation: trunkRotation,
    size: [crownWidth, crownRun, crownWidth],
    // Рыжая, медная кора верха — подпись сосны.
    color: rand(seed, 16) > 0.5 ? "#8a5a35" : "#96633a",
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    sideAttachmentReach: trunkWidth * 0.9,
    weathering: 0.3,
    contactBoxes: [{
      position: scaleVector(trunkAxis, boleHeight + crownRun * 0.5),
      size: [crownWidth * 0.92, crownRun, crownWidth * 0.92],
    }],
    treeVisual: {
      kind: "pine",
      seed,
      role: "branch",
      localId: "stem",
      parentLocalId: "trunk",
    },
  });

  // Сухие обломанные сучья под кроной: по ним сосна и читается как сосна,
  // а не как дерево с шапкой.
  const stubCount = 3 + Math.floor(rand(seed, 17) * 2);
  for (let stub = 0; stub < stubCount; stub += 1) {
    const stubVar = rand(seed, 200 + stub);
    const yaw = stub * 2.399963229728653 + stubVar * 0.9;
    const height = boleHeight * (0.72 + (stub / stubCount) * 0.24);
    pieces.push(
      branchPiece(
        "pine",
        seed,
        `stub:${stub}`,
        "trunk",
        addVector(scaleVector(trunkAxis, height), [
          Math.cos(yaw) * trunkWidth * 0.4,
          0,
          Math.sin(yaw) * trunkWidth * 0.4,
        ]),
        directionFromAngles(yaw, 1.32 + stubVar * 0.18),
        (0.5 + stubVar * 0.5) * s,
        (0.05 + stubVar * 0.03) * s,
        stubVar > 0.5 ? "#4a3d31" : "#544639",
      ),
    );
  }

  // Сучья кроны: почти горизонтальные, длинные, с подъёмом на конце. Они
  // держат подушки хвои, а рендер добавляет каждому восходящие побеги.
  const limbCount = 8 + Math.floor(rand(seed, 18) * 3);
  for (let limb = 0; limb < limbCount; limb += 1) {
    const limbVar = rand(seed, 220 + limb);
    const t = limb / Math.max(1, limbCount - 1);
    const yaw = limb * 2.399963229728653 + (rand(seed, 240 + limb) - 0.5) * 0.6;
    const height = boleHeight + crownRun * (0.08 + t * 0.84);
    // КРОНА ЗОНТОМ, А НЕ КОНУСОМ. У взрослой сосны нижние сучья кроны отмирают,
    // а верхние тянутся и ложатся почти горизонтально — крона шире вверху и
    // плоская сверху. Сучья длиннее к вершине, наклон к горизонтали растёт:
    // обратный закон (длиннее внизу) давал ёлку, что и читалось «бардаком».
    const tilt = 1.16 + t * 0.32 + (limbVar - 0.5) * 0.18;
    const length = (2.1 + t * 1.7) * s * (0.82 + limbVar * 0.36);
    const attach = addVector(scaleVector(trunkAxis, height), [
      Math.cos(yaw) * crownWidth * 0.35,
      0,
      Math.sin(yaw) * crownWidth * 0.35,
    ]);
    const direction = directionFromAngles(yaw, tilt);
    const limbId = `limb:${limb}`;
    const piece = branchPiece(
      "pine",
      seed,
      limbId,
      "stem",
      attach,
      direction,
      length,
      // Сук сосны — не спица: у трёхметрового сука комель 13–20 см, и это же
      // даёт ему запас несущей способности под две подушки хвои.
      (0.13 + limbVar * 0.07) * s,
      limbVar > 0.5 ? "#7a5334" : "#6d4a30",
    );
    pieces.push({
      ...piece,
      // Сук ВРАСТАЕТ в ствол: узловая коробка охватывает ось ствола, а не
      // касается его краем. Касание краем держится, пока сцена не сдвинет
      // кластер на сантиметры, и тогда отдельные сучья теряют опору.
      contactBoxes: [
        {
          position: scaleVector(trunkAxis, height),
          size: [crownWidth * 1.6, Math.max(0.3, length * 0.14), crownWidth * 1.6],
        },
        ...(piece.contactBoxes ?? []),
      ],
    });

    // Подушки хвои: плоские, лежат ПОВЕРХ сука, а не нанизаны на него.
    const cushionLeaves =
      rand(seed, 520 + limb) < dryness ? CLUMP_DRY : PINE_SUN;
    // Подушка меряется ОТ СУКА, а не от дерева: на полутораметровом сучке
    // верхнего яруса двухметровая подушка перекрывает соседние, и крона
    // превращается в кашу из хвои. Длинный нижний сук несёт две подушки,
    // короткий верхний — одну.
    const cushionCount = length > 3 * s ? 3 : 2;
    for (let cushion = 0; cushion < cushionCount; cushion += 1) {
      // Крайняя подушка не доходит до кончика: контактная коробка сука
      // покрывает 0.92 его длины, и подушка на 0.96 висит за ней.
      const along = cushionCount === 3
        ? 0.44 + cushion * 0.23
        : 0.55 + cushion * 0.35;
      const cushionVar = rand(seed, 260 + limb * 3 + cushion);
      const width = Math.min(
        2.1 * s,
        Math.max(0.55 * s, length * (0.42 + cushionVar * 0.14)),
      );
      const centre = addVector(
        addVector(attach, scaleVector(direction, length * along)),
        [0, width * 0.16, 0],
      );
      pieces.push({
        id: `${limbId}:needles:${cushion}`,
        material: "foliage",
        shape: "panel",
        position: centre,
        rotation: [
          (cushionVar - 0.5) * 0.3,
          yaw,
          (rand(seed, 280 + limb * 3 + cushion) - 0.5) * 0.3,
        ],
        size: [width, width * (0.5 + cushionVar * 0.2), width * (0.86 + cushionVar * 0.3)],
        color: cushion === 2
          ? cushionLeaves[Math.floor(cushionVar * cushionLeaves.length)]
          : PINE_NEEDLES[Math.floor(cushionVar * PINE_NEEDLES.length)],
        bearsLoad: false,
        // Масса подушки идёт ОТ РАЗМЕРА, а не числом: при фиксированном объёме
        // мелкое дерево несёт ту же тонну хвои на вчетверо более тонком суку,
        // и решатель роняет сук как перегруженный (полоса Астаны, `belt:248`).
        volume: 0.22 * width * (width * 0.5) * (width * 0.9),
        sideAttachmentReach: Math.max(0.7, width * 0.5),
        contactBoxes: [{
          position: centre,
          size: [width * 0.7, width * 0.42, width * 0.7],
        }],
        treeVisual: {
          kind: "pine",
          seed,
          role: "foliage",
          localId: `${limbId}:needles:${cushion}`,
          parentLocalId: limbId,
        },
      });
    }
  }

  // Вершина: у взрослой сосны она плоская или тупая, а не шпиль.
  const topWidth = (1.7 + rand(seed, 300) * 0.6) * s;
  const topCentre = addVector(scaleVector(trunkAxis, trunkHeight), [
    (rand(seed, 310) - 0.5) * 0.4 * s,
    topWidth * 0.1,
    (rand(seed, 320) - 0.5) * 0.4 * s,
  ]);
  pieces.push({
    id: "crown",
    material: "foliage",
    shape: "panel",
    position: topCentre,
    rotation: [0, rand(seed, 330) * Math.PI, 0],
    size: [topWidth, topWidth * 0.5, topWidth * 0.86],
    color: PINE_SUN[Math.floor(rand(seed, 340) * PINE_SUN.length)],
    bearsLoad: false,
    volume: 0.22 * topWidth * (topWidth * 0.5) * (topWidth * 0.86),
    sideAttachmentReach: Math.max(0.8, topWidth * 0.6),
    contactBoxes: [{
      position: topCentre,
      size: [topWidth * 0.7, topWidth * 0.5, topWidth * 0.7],
    }],
    treeVisual: {
      kind: "pine",
      seed,
      role: "foliage",
      localId: "crown",
      parentLocalId: "stem",
    },
  });
  return pieces;
}

// Ива, растущая из воды, держит лист дольше и мельче обычного широколиственного:
// узкая пластина ловит меньше света поодиночке, но их много.
const WILLOW_GREENS = ["#55663a", "#485c33", "#5f6f3f", "#3f5430", "#63744a", "#4d6236"];
// Солнечная сторона ивы уходит в серо-зелёное с проседью: у белой ивы испод
// листа серебряный, и на свету крона именно седеет, а не желтеет.
const WILLOW_SUN = ["#7d8a66", "#86936f", "#72825c", "#8d9a77", "#79876a"];

/**
 * Головчатая ива — knotwilg, самый польдерный предмет на берегу канавы.
 *
 * Это не дерево, а РЕЗУЛЬТАТ РЕМЕСЛА. Иву сажают на берег, потому что корень
 * держит откос, и каждые несколько лет срезают всю поросль на прут — на плетень,
 * на фашины, на обвязку. От повторной срезки над стволом нарастает бугристая
 * голова из каллуса, и из неё раз в сезон бьёт пучок прямых однолетних хлыстов.
 * Отсюда и силуэт, которого больше нет ни у чего: приземистый толстый столб с
 * шапкой прутьев, а не крона.
 *
 * Собрана обычными частями существующего дерева — ствол, «ветви», клампы, — так
 * что рубится, ломается и разлетается она ровно как всё остальное.
 */
export function propPollardWillow(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  // ПАСПОРТ (снят по фото ряда над канавкой в Вассенаре и по старой голове в
  // парке Аудегейн): иву срезают на 1.5–2 м, и с каждой срезкой ствол толстеет,
  // не вырастая. Стройность ствола на референсе 3–4 калибра, а не шесть:
  // приземистый столб — половина силуэта, по нему knotwilg и узнают.
  const trunkHeight = (1.78 + rand(seed, 10) * 0.42) * s;
  const trunkWidth = (0.52 + rand(seed, 11) * 0.15) * s;
  const lean = 0.05 + rand(seed, 12) * 0.1;
  const leanYaw = rand(seed, 13) * Math.PI * 2;
  const trunkRotation: readonly [number, number, number] = [
    Math.sin(leanYaw) * lean,
    0,
    -Math.cos(leanYaw) * lean,
  ];
  const trunkAxis: FloraVector = [
    -Math.sin(trunkRotation[2]),
    Math.cos(trunkRotation[0]) * Math.cos(trunkRotation[2]),
    Math.sin(trunkRotation[0]) * Math.cos(trunkRotation[2]),
  ];
  const barkColor = rand(seed, 14) > 0.5 ? "#5a5147" : "#635849";
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: scaleVector(trunkAxis, trunkHeight * 0.5),
      rotation: trunkRotation,
      size: [trunkWidth, trunkHeight, trunkWidth],
      color: barkColor,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.5,
      contactBoxes: [{
        position: [0, trunkHeight / 2, 0],
        size: [trunkWidth * 0.86, trunkHeight, trunkWidth * 0.86],
      }],
      treeVisual: { kind: "willow", seed, role: "trunk", localId: "trunk" },
    },
  ];

  // Комель и наплывы на стволе. Старый knotwilg не точёный столб: место
  // прежнего сучка вздувается желваком, кора идёт наплывами. Два кома дают
  // силуэту неровность, которую труба ствола дать не может.
  for (let burl = 0; burl < 2; burl += 1) {
    const burlVar = rand(seed, 500 + burl);
    const burlYaw = rand(seed, 510 + burl) * Math.PI * 2;
    const burlHeight = trunkHeight * (0.34 + burlVar * 0.32);
    const burlSize = trunkWidth * (0.32 + burlVar * 0.2);
    const centre = addVector(scaleVector(trunkAxis, burlHeight), [
      Math.cos(burlYaw) * trunkWidth * 0.42,
      0,
      Math.sin(burlYaw) * trunkWidth * 0.42,
    ]);
    pieces.push({
      id: `burl:${burl}`,
      material: "wood",
      shape: "sphere",
      position: centre,
      rotation: [burlVar * 2.1, burlYaw, burlVar * 1.3],
      size: [burlSize, burlSize * (0.72 + burlVar * 0.3), burlSize],
      color: burlVar > 0.5 ? "#554b3f" : "#5f5446",
      bearsLoad: false,
      weathering: 0.62,
      // Желвак ни на чём не стоит — он ПРИРОС к боку ствола. У древесины нет
      // дефолтного бокового вылета, поэтому его приходится объявлять: без него
      // решатель ищет опору только снизу и объявляет наплыв неопёртым.
      sideAttachmentReach: trunkWidth * 0.8,
      contactBoxes: [{
        position: [0, burlHeight, 0],
        size: [trunkWidth, burlSize, trunkWidth],
      }],
      treeVisual: {
        kind: "willow",
        seed,
        role: "knob",
        localId: `burl:${burl}`,
        parentLocalId: "trunk",
      },
    });
  }

  // ГОЛОВА. Это не шапка, надетая на столб, а верх самого столба: каллус
  // нарастает от повторных срезов и обхватывает торец, поэтому голова шире
  // ствола в 1.6–1.9 раза и садится НА него с перекрытием. Прежняя стопка
  // коротких цилиндров ловила тейпер трубы (вершина ужимается до 0.44) и
  // разъезжалась на висящие в воздухе абажуры — замкнутый ком таких просветов
  // не даёт по построению.
  const headWidth = trunkWidth * (1.62 + rand(seed, 15) * 0.28);
  const headHeight = trunkWidth * (0.84 + rand(seed, 16) * 0.2);
  const headCentre = scaleVector(trunkAxis, trunkHeight - headHeight * 0.18);
  const headTop = trunkHeight + headHeight * 0.32;
  pieces.push({
    id: "head",
    material: "wood",
    shape: "sphere",
    position: headCentre,
    rotation: [trunkRotation[0], rand(seed, 17) * Math.PI, trunkRotation[2]],
    size: [headWidth, headHeight, headWidth * (0.9 + rand(seed, 18) * 0.16)],
    color: rand(seed, 19) > 0.5 ? "#544736" : "#5d503d",
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    // Голова живёт мокрой: в её чаше стоит перегной, оттуда лезет мох и
    // папоротник — на референсе из Аудегейна это половина её характера.
    weathering: 0.78,
    // Рендер-ком НАСАЖЕН на торец (перекрытие и убивает щель), но структурная
    // коробка обязана именно СТОЯТЬ на стволе: решатель терпит лишь 0.12 м
    // утопания, глубже — «неопёртый кусок» на старте сцены.
    contactBoxes: [{
      position: [0, trunkHeight - 0.08 + headHeight * 0.425, 0],
      size: [headWidth * 0.86, headHeight * 0.85, headWidth * 0.86],
    }],
    treeVisual: {
      kind: "willow",
      seed,
      role: "knob",
      localId: "head",
      parentLocalId: "trunk",
    },
  });

  // Воротник: ствол входит в голову РАСШИРЯЯСЬ, а не упирается в неё торцом.
  // Без этого промежуточного калибра голова читается шляпой, надетой сверху,
  // хотя метрически она верна.
  const collarHeight = trunkWidth * 0.55;
  const collarCentre = trunkHeight - headHeight * 0.5;
  pieces.push({
    id: "collar",
    material: "wood",
    shape: "sphere",
    position: scaleVector(trunkAxis, collarCentre),
    rotation: [trunkRotation[0], rand(seed, 23) * Math.PI, trunkRotation[2]],
    size: [trunkWidth * 1.26, collarHeight, trunkWidth * 1.22],
    color: rand(seed, 24) > 0.5 ? "#584c3b" : "#5f5240",
    carriesAttachments: true,
    attachmentSupportMode: "cable",
    bearsLoad: false,
    weathering: 0.7,
    sideAttachmentReach: trunkWidth * 0.6,
    contactBoxes: [{
      position: [0, collarCentre, 0],
      size: [trunkWidth * 1.1, collarHeight, trunkWidth * 1.1],
    }],
    treeVisual: {
      kind: "willow",
      seed,
      role: "knob",
      localId: "collar",
      parentLocalId: "trunk",
    },
  });

  // Наплыв бугристый: комья по кругу выходят за силуэт головы, иначе она
  // читается точёным шаром.
  const headLumps = 5 + Math.floor(rand(seed, 20) * 3);
  for (let lump = 0; lump < headLumps; lump += 1) {
    const lumpVar = rand(seed, 400 + lump);
    const lumpYaw = (lump / headLumps) * Math.PI * 2 + lumpVar * 0.8;
    const lumpOut = headWidth * (0.3 + lumpVar * 0.12);
    const centre = addVector(headCentre, [
      Math.cos(lumpYaw) * lumpOut,
      (lumpVar - 0.42) * headHeight * 0.7,
      Math.sin(lumpYaw) * lumpOut,
    ]);
    const size = headWidth * (0.24 + lumpVar * 0.16);
    pieces.push({
      id: `head:lump:${lump}`,
      material: "wood",
      shape: "sphere",
      position: centre,
      rotation: [lumpVar * 1.7, lumpYaw, rand(seed, 430 + lump) * 1.7],
      size: [size, size * (0.62 + lumpVar * 0.45), size * (0.86 + lumpVar * 0.3)],
      color: rand(seed, 460 + lump) > 0.5 ? "#51442f" : "#5a4c39",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      bearsLoad: false,
      weathering: 0.82,
      // Комок наплыва держится за голову боком, как желвак за ствол.
      sideAttachmentReach: headWidth * 0.5,
      contactBoxes: [{
        position: [centre[0], centre[1], centre[2]],
        size: [size, size, size],
      }],
      treeVisual: {
        kind: "willow",
        seed,
        role: "knob",
        localId: `head:lump:${lump}`,
        parentLocalId: "head",
      },
    });
  }

  // ХЛЫСТЫ. Прирост ивы — 2–3 м в год, а knotten идёт раз в 3–4 года, поэтому
  // пучок вдвое выше собственного ствола. Но растёт он ПОЧТИ ВЕРТИКАЛЬНО:
  // по фото ряда пучок расходится с полууглом около 11°, крайние прутья до 20°.
  // Прежний закон угла (до 45°) давал фейерверк — распределение оставлено
  // квадратичным, но потолок опущен к натуре.
  //
  // Одно разрушаемое тело — одно ГНЕЗДО почек: рендер разворачивает его в три
  // стержня с развилкой (`willowWhipFan`), так что видимых прутьев выходит
  // шестьдесят-восемьдесят, как на референсе, без роста числа тел.
  const whipCount = 20 + Math.floor(rand(seed, 21) * 7);
  const whipSeason = (3.0 + rand(seed, 22) * 1.1) * s;
  const ringRadius = headWidth * 0.5;
  for (let whip = 0; whip < whipCount; whip += 1) {
    const yaw = whip * 2.399963229728653 + (rand(seed, 30 + whip) - 0.5) * 0.7;
    const tiltRoll = rand(seed, 60 + whip);
    const tilt = 0.045 + tiltRoll * tiltRoll * 0.3;
    const length = whipSeason * (0.84 + rand(seed, 90 + whip) * 0.26);
    const radius = ringRadius * (0.42 + rand(seed, 120 + whip) * 0.34);
    const start = addVector(scaleVector(trunkAxis, headTop), [
      Math.cos(yaw) * radius,
      -headHeight * 0.25,
      Math.sin(yaw) * radius,
    ]);
    const id = `whip:${whip}`;
    pieces.push(
      branchPiece(
        "willow",
        seed,
        id,
        "head",
        start,
        directionFromAngles(yaw, tilt),
        length,
        (0.018 + rand(seed, 150 + whip) * 0.014) * s,
        rand(seed, 180 + whip) > 0.5 ? "#6f5f3e" : "#7b6845",
      ),
    );
    // Лист сидит ПО ВСЕЙ ДЛИНЕ прута, а не комом на конце: три станции по
    // хлысту, каждая рисуется рукавом вдоль стержней гнезда. Отсюда дымка
    // вместо помпонов на голых палках.
    const leafStations = 3;
    // Шаг станций держится ровным, а гуляет весь набор целиком: разнобой по
    // каждой станции разрывает рукав, и на хлысте появляется голое место.
    const leafOffset = rand(seed, 230 + whip) * 0.07;
    for (let leaf = 0; leaf < leafStations; leaf += 1) {
      const along = 0.26 + leaf * 0.26 + leafOffset;
      const centre = addVector(
        start,
        scaleVector(directionFromAngles(yaw, tilt), length * along),
      );
      pieces.push(
        clump(
          "willow",
          seed,
          `${id}:leaf:${leaf}`,
          id,
          seed * 977 + whip * 31 + leaf,
          centre,
          (0.34 + rand(seed, 270 + whip * 3 + leaf) * 0.16) * s,
          // Верх пучка открыт солнцу и седеет, низ сидит в тени соседних
          // прутьев — у метлы это единственный источник объёма.
          leaf === 0 ? WILLOW_GREENS : WILLOW_SUN,
          0.5,
        ),
      );
    }
  }
  return pieces;
}

// Плакучая ива светлее и желтее стриженой: у Salix × sepulcralis лист тонкий,
// длинный и просвечивает, отчего занавес читается почти золотым.
const WEEPING_GREENS = ["#7f9450", "#889d59", "#748a47", "#91a563", "#7b9152"];
const WEEPING_SHADE = ["#5e7440", "#667c47", "#576d3b"];

/**
 * Плакучая ива (Salix × sepulcralis, «золотая»).
 *
 * СИЛУЭТ ДЕРЖИТ ЗАНАВЕС, А НЕ КРОНА. Дерево читается куполом-фонтаном шире
 * собственной высоты: короткий толстый ствол уходит в несколько дугой
 * поднимающихся сучьев, а с них почти отвесно свисают длинные плети, доходящие
 * до земли. Ствол снаружи не виден — он внутри занавеса. Масса читается
 * ВЕРТИКАЛЬНЫМИ ШТРИХАМИ, а не комьями: это и отличает её от всякой другой ивы.
 *
 * Стриженая ива (`propPollardWillow`) — её полная противоположность: там столб
 * с шапкой прутьев вверх, здесь купол с плетями вниз.
 */
export function propWeepingWillow(options: TreeOptions = {}): FloraPiece[] {
  const seed = options.seed ?? 1;
  const s = options.scale ?? 1;
  const trunkHeight = (3.6 + rand(seed, 10) * 1.2) * s;
  const trunkWidth = (0.55 + rand(seed, 11) * 0.3) * s;
  const lean = 0.04 + rand(seed, 12) * 0.09;
  const leanYaw = rand(seed, 13) * Math.PI * 2;
  const trunkRotation: readonly [number, number, number] = [
    Math.sin(leanYaw) * lean,
    0,
    -Math.cos(leanYaw) * lean,
  ];
  const trunkAxis: FloraVector = [
    -Math.sin(trunkRotation[2]),
    Math.cos(trunkRotation[0]) * Math.cos(trunkRotation[2]),
    Math.sin(trunkRotation[0]) * Math.cos(trunkRotation[2]),
  ];
  const pieces: FloraPiece[] = [
    {
      id: "trunk",
      material: "wood",
      shape: "cylinder",
      position: scaleVector(trunkAxis, trunkHeight * 0.5),
      rotation: trunkRotation,
      size: [trunkWidth, trunkHeight, trunkWidth],
      color: rand(seed, 14) > 0.5 ? "#5b4c3c" : "#645440",
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      weathering: 0.45,
      contactBoxes: [{
        position: scaleVector(trunkAxis, trunkHeight * 0.5),
        size: [trunkWidth * 0.9, trunkHeight, trunkWidth * 0.9],
      }],
      treeVisual: { kind: "willow", seed, role: "trunk", localId: "trunk" },
    },
  ];

  // СКЕЛЕТ ДУГОЙ. У ивы нет ни одной прямой линии: сук выходит из ствола круто
  // вверх, потом ложится и на конце клонится вниз — с этой дуги и падают
  // побеги. Прямая спица, торчащая вбок, читается колесом от телеги, чем
  // прошлая сборка и грешила. Дуга набирается ЦЕПОЧКОЙ звеньев: каждое
  // положе предыдущего и тоньше его.
  const limbCount = 3 + Math.floor(rand(seed, 15) * 2);
  const reach = (3.9 + rand(seed, 16) * 1.4) * s;
  for (let limb = 0; limb < limbCount; limb += 1) {
    const limbVar = rand(seed, 40 + limb);
    const yaw = limb * 2.399963229728653 + (rand(seed, 60 + limb) - 0.5) * 0.5;
    const attachHeight = trunkHeight * (0.62 + (limb / limbCount) * 0.32);
    const span = reach * (0.86 + limbVar * 0.3);
    const segments = 3;
    let node = scaleVector(trunkAxis, attachHeight);
    let parent = "trunk";
    for (let segment = 0; segment < segments; segment += 1) {
      const segVar = rand(seed, 100 + limb * 5 + segment);
      // Наклон растёт от звена к звену: 0.55 → 0.95 → 1.35 рад. Последнее
      // звено уходит ниже горизонта — это и есть свес дуги.
      // Дуга: 0.62 → 1.02 → 1.32 рад. Последнее звено ложится почти
      // горизонтально — так купол выходит шире собственной высоты, а не
      // сваливается вниз у самого ствола.
      const tilt = 0.62 + segment * 0.35 + (segVar - 0.5) * 0.16;
      const segYaw = yaw + (segVar - 0.5) * 0.3;
      const direction = directionFromAngles(segYaw, tilt);
      const length = span * (0.42 - segment * 0.07);
      const id = segment === 0 ? `limb:${limb}` : `limb:${limb}:arc:${segment}`;
      pieces.push(
        branchPiece(
          "willow",
          seed,
          id,
          parent,
          node,
          direction,
          length,
          (0.115 - segment * 0.028 + segVar * 0.025) * s,
          segVar > 0.5 ? "#5a4a38" : "#63523d",
        ),
      );
      node = addVector(node, scaleVector(direction, length));
      parent = id;
    }

    // Ветви второго порядка сходят с середины дуги — тоже дугой вниз.
    const forkCount = 2;
    for (let fork = 0; fork < forkCount; fork += 1) {
      const forkVar = rand(seed, 140 + limb * 5 + fork);
      const forkParent = `limb:${limb}:arc:${1 + fork % 2}`;
      const forkBase = pieces.find(({ id }) => id === forkParent);
      if (!forkBase) {
        continue;
      }
      const baseAxis = normalizeVector([
        -Math.sin(forkBase.rotation![2]),
        Math.cos(forkBase.rotation![0]) * Math.cos(forkBase.rotation![2]),
        Math.sin(forkBase.rotation![0]) * Math.cos(forkBase.rotation![2]),
      ]);
      const forkStart = addVector(
        forkBase.position as FloraVector,
        scaleVector(baseAxis, forkBase.size[1] * (0.1 + forkVar * 0.3)),
      );
      const forkDirection = directionFromAngles(
        yaw + (fork % 2 === 0 ? -1 : 1) * (0.45 + forkVar * 0.5),
        1.25 + forkVar * 0.4,
      );
      const forkLength = span * (0.3 + forkVar * 0.18);
      const forkId = `limb:${limb}:fork:${fork}`;
      pieces.push(
        branchPiece(
          "willow",
          seed,
          forkId,
          forkParent,
          forkStart,
          forkDirection,
          forkLength,
          (0.045 + forkVar * 0.022) * s,
          forkVar > 0.5 ? "#59493a" : "#61513e",
        ),
      );
    }
  }

  // ВЕРШИНА. Без неё над кроной остаётся дыра: сучья расходятся вбок, и макушка
  // читается голым столбом с пучком — ровно то, чем плакучая ива НЕ является.
  // Короткий верхушечный сук поднимается почти отвесно, и занавес падает уже
  // с него — с самых верхних побегов дерева.
  const crownVar = rand(seed, 300);
  const crownYaw = rand(seed, 310) * Math.PI * 2;
  const crownAttach = scaleVector(trunkAxis, trunkHeight * 0.96);
  const crownDirection = directionFromAngles(crownYaw, 0.3 + crownVar * 0.22);
  const crownLength = reach * (0.42 + crownVar * 0.22);
  pieces.push(
    branchPiece(
      "willow",
      seed,
      "limb:crown",
      "trunk",
      crownAttach,
      crownDirection,
      crownLength,
      (0.1 + crownVar * 0.05) * s,
      crownVar > 0.5 ? "#5a4a38" : "#63523d",
    ),
    clump(
      "willow",
      seed,
      "limb:crown:leaf:0",
      "limb:crown",
      seed * 613 + 907,
      addVector(crownAttach, scaleVector(crownDirection, crownLength * 0.6)),
      (0.6 + crownVar * 0.18) * s,
      WEEPING_GREENS,
      0.4,
    ),
  );
  return pieces;
}

export type TreeKind = "oak" | "birch" | "pine" | "willow";

export function propTree(kind: TreeKind, options: TreeOptions = {}): FloraPiece[] {
  switch (kind) {
    case "oak":
      return propOak(options);
    case "birch":
      return propBirch(options);
    default:
      return propPine(options);
  }
}
