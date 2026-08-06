import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type {
  BreakablePieceDefinition,
  TreeVisualKind,
} from "./destructionScene.ts";
import {
  buildProceduralRootNetwork,
  coniferLimbRods,
  isEnhancedTreePiece,
  proceduralRootJointDiameter,
  proceduralWoodTubeProfile,
  treeBarkPhase,
  treeWoodSpecies,
  treeVisualRootId,
  willowWhipFan,
} from "./treeVisualModel.ts";
import type { WillowWhipRod } from "./treeVisualModel.ts";

/**
 * ЧИСТАЯ сборка визуальных инстансов дерева и куста: из разрушаемых кусков
 * сцены — матрицы, цвета и параметры для батчей рендера. Ни React, ни WebGL:
 * только математика three. Отсюда её может позвать и офлайн-растеризатор
 * (`scripts/render-object.mjs`), который снимает PNG объекта без браузера.
 */

export const UP = new Vector3(0, 1, 0);
export const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);

export interface VisualInstance {
  readonly sourceId: string;
  readonly matrix: Matrix4;
  readonly color: Color;
  readonly species: number;
  readonly phase: number;
  readonly bend?: number;
  readonly taper?: number;
}

export type FoliageInstance = VisualInstance;

interface TreeGroup {
  readonly id: string;
  readonly kind: TreeVisualKind;
  readonly seed: number;
  trunk?: BreakablePieceDefinition;
  readonly branches: BreakablePieceDefinition[];
  readonly knobs: BreakablePieceDefinition[];
  readonly foliage: BreakablePieceDefinition[];
}

export interface TreeVisualBuild {
  readonly wood: readonly VisualInstance[];
  readonly roots: readonly VisualInstance[];
  /** Замкнутый шаровой батч: узлы корней и наплывы стриженой древесины. */
  readonly lumps: readonly VisualInstance[];
  readonly foliage: readonly FoliageInstance[];
  readonly conifer: readonly FoliageInstance[];
}

export function hash(seed: number, salt: number): number {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function hashText(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 0xffffffff;
}

function groupTrees(pieces: readonly BreakablePieceDefinition[]): TreeGroup[] {
  const groups = new Map<string, TreeGroup>();
  for (const piece of pieces) {
    if (!isEnhancedTreePiece(piece)) {
      continue;
    }
    const visual = piece.treeVisual;
    const rootId = treeVisualRootId(piece);
    if (!visual || !rootId) {
      continue;
    }
    let group = groups.get(rootId);
    if (!group) {
      group = {
        id: rootId,
        kind: visual.kind,
        seed: visual.seed,
        branches: [],
        knobs: [],
        foliage: [],
      };
      groups.set(rootId, group);
    }
    if (visual.role === "trunk") {
      group.trunk = piece;
    } else if (visual.role === "branch") {
      group.branches.push(piece);
    } else if (visual.role === "knob") {
      group.knobs.push(piece);
    } else if (visual.role === "foliage") {
      group.foliage.push(piece);
    }
  }
  return [...groups.values()];
}

function pieceAxis(piece: BreakablePieceDefinition): Vector3 {
  const rotation = piece.rotation ?? [0, 0, 0];
  return UP.clone()
    .applyQuaternion(
      new Quaternion().setFromEuler(
        new Euler(rotation[0], rotation[1], rotation[2]),
      ),
    )
    .normalize();
}

function outwardBranchAxis(
  piece: BreakablePieceDefinition,
  trunk: BreakablePieceDefinition | undefined,
): Vector3 {
  const axis = pieceAxis(piece);
  if (!trunk) {
    return axis;
  }

  const trunkAxis = pieceAxis(trunk);
  const fromTrunk = new Vector3(...piece.position).sub(
    new Vector3(...trunk.position),
  );
  const radial = fromTrunk.addScaledVector(
    trunkAxis,
    -fromTrunk.dot(trunkAxis),
  );
  if (radial.lengthSq() < 1e-6 || axis.dot(radial) >= 0) {
    return axis;
  }

  // Mirror only the component perpendicular to the trunk. The upward rise is
  // already correct in the authored proxy; its radial component is reversed.
  const alongTrunk = trunkAxis.clone().multiplyScalar(axis.dot(trunkAxis));
  return alongTrunk.multiplyScalar(2).sub(axis).normalize();
}

function segmentMatrix(
  start: Vector3,
  end: Vector3,
  diameter: number,
): Matrix4 {
  const direction = end.clone().sub(start);
  const length = Math.max(0.001, direction.length());
  direction.multiplyScalar(1 / length);
  const rotation = new Quaternion().setFromUnitVectors(UP, direction);
  return new Matrix4().compose(
    start.clone().add(end).multiplyScalar(0.5),
    rotation,
    new Vector3(diameter, length, diameter),
  );
}

function pushCurvedPiece(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
  seed: number,
  kind: TreeVisualKind,
  role: "trunk" | "branch",
  trunk?: BreakablePieceDefinition,
  rootOutput?: VisualInstance[],
  rootJointOutput?: VisualInstance[],
): void {
  const axis = role === "branch"
    ? outwardBranchAxis(piece, trunk)
    : pieceAxis(piece);
  const center = new Vector3(...piece.position);
  const length = piece.size[1];
  const start = center.clone().addScaledVector(axis, -length / 2);
  const end = center.clone().addScaledVector(axis, length / 2);
  const identityNoise = hashText(piece.id);
  const profile = proceduralWoodTubeProfile(role, kind);
  const bend = length * profile.bendRatio;
  const species = treeWoodSpecies(kind);

  // One connected tube per trunk or authored branch. The old visual split a
  // member into several open cylinders, so even a small bend exposed the sky
  // through their transverse seams. Height subdivisions now live inside one
  // mesh and the shader bends that continuous surface instead.
  output.push({
    sourceId: piece.id,
    matrix: segmentMatrix(start, end, piece.size[0] * 1.08),
    color: kind === "birch" && role === "trunk"
      ? new Color("#ded9c9")
      : new Color(piece.color),
    species,
    phase: treeBarkPhase(seed, piece.id),
    bend:
      (bend / Math.max(piece.size[0] * 1.08, 0.001)) *
      (0.65 + identityNoise * 0.7),
    taper: profile.tipScale,
  });

  if (role !== "trunk") {
    return;
  }

  // Roots are a branched render network: thick flare near the trunk, curved
  // tapered sections along the soil, then buried terminal segments. The trunk
  // remains the single cheap gameplay collider.
  const rootBase = start.clone().addScaledVector(axis, piece.size[0] * 0.025);
  const roots = buildProceduralRootNetwork(
    seed + identityNoise * 997,
    piece.size[0],
    kind,
  );
  roots.forEach((root, rootIndex) => {
    const rootPoints = root.points.map((point) =>
      rootBase.clone().add(new Vector3(...point)),
    );
    for (let index = 0; index < rootPoints.length - 1; index += 1) {
      (rootOutput ?? output).push({
        sourceId: piece.id,
        matrix: segmentMatrix(
          rootPoints[index],
          rootPoints[index + 1],
          root.diameters[index],
        ),
        color: kind === "birch"
          ? new Color("#c8c1ae")
          : new Color(piece.color).multiplyScalar(0.88),
        species,
        phase: hash(seed + identityNoise * 79, 80 + rootIndex * 5 + index),
        bend: 0,
        taper: 1,
      });
    }
    for (let index = 1; index < rootPoints.length - 1; index += 1) {
      const diameter = proceduralRootJointDiameter(
        root.diameters[index - 1],
        root.diameters[index],
      );
      rootJointOutput?.push({
        sourceId: piece.id,
        matrix: new Matrix4().compose(
          rootPoints[index],
          new Quaternion(),
          new Vector3(diameter, diameter * 0.9, diameter),
        ),
        color: kind === "birch"
          ? new Color("#c8c1ae")
          : new Color(piece.color).multiplyScalar(0.88),
        species,
        phase: hash(seed + identityNoise * 83, 180 + rootIndex * 5 + index),
        bend: 0,
        taper: 1,
      });
    }
  });
}

/**
 * Наплыв каллуса — замкнутый ком, а не отрезок трубы. Он рисуется шаровым
 * примитивом того же батча, что и узлы корней: у него есть торцы, он не
 * ужимается тейпером и потому не даёт просветов между соседними кусками.
 */
function pushKnob(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
  seed: number,
  kind: TreeVisualKind,
): void {
  const identityNoise = hashText(piece.id);
  output.push({
    sourceId: piece.id,
    matrix: new Matrix4().compose(
      new Vector3(...piece.position),
      new Quaternion().setFromEuler(new Euler(...(piece.rotation ?? [0, 0, 0]))),
      new Vector3(...piece.size),
    ),
    color: new Color(piece.color),
    species: treeWoodSpecies(kind),
    phase: treeBarkPhase(seed + identityNoise * 61, piece.id),
    bend: 0,
    taper: 1,
  });
}

function rodMatrix(rod: WillowWhipRod): Matrix4 {
  const start = new Vector3(...rod.start);
  return segmentMatrix(
    start,
    start.clone().addScaledVector(new Vector3(...rod.direction), rod.length),
    rod.diameter * 1.08,
  );
}

/**
 * Гнездо прутьев вместо одного стержня. Разрушаемым телом остаётся авторский
 * хлыст: спрятали его — исчезло всё гнездо, потому что все стержни адресуют
 * один и тот же `sourceId`.
 */
function pushWillowWhip(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
  seed: number,
  trunk: BreakablePieceDefinition | undefined,
): readonly WillowWhipRod[] {
  // Побег НЕ зеркалить: `outwardBranchAxis` разворачивает ветвь, смотрящую
  // «внутрь» ствола, но у хлыста и плети направление авторское и уже верное —
  // разворот отрывает нарисованный побег от его же гнезда.
  const axis = pieceAxis(piece);
  const center = new Vector3(...piece.position);
  const length = piece.size[1];
  const start = center.clone().addScaledVector(axis, -length / 2);
  const identityNoise = hashText(piece.id);
  const profile = proceduralWoodTubeProfile("branch", "willow");
  const rods = willowWhipFan(
    [start.x, start.y, start.z],
    [axis.x, axis.y, axis.z],
    length,
    piece.size[0],
    seed + identityNoise * 997,
  );
  rods.forEach((rod) => {
    const bend = rod.length * profile.bendRatio;
    output.push({
      sourceId: piece.id,
      matrix: rodMatrix(rod),
      color: new Color(piece.color),
      species: treeWoodSpecies("willow"),
      phase: treeBarkPhase(seed + rod.index * 17, `${piece.id}:${rod.index}`),
      bend:
        (bend / Math.max(rod.diameter * 1.08, 0.001)) *
        (0.55 + hash(seed + identityNoise * 13, 300 + rod.index) * 0.8),
      taper: profile.tipScale,
    });
  });
  return rods;
}

// Палитра вуали. Плакучая ива светлее и желтее прочих ив: лист тонкий, длинный
// и просвечивает. Наружные пряди выгорели почти в золото, внутренние — глубокая
// холодная тень; между ними и живёт объём кроны.
const WEEPING_VEIL = ["#8ea55c", "#97ad66", "#849b53", "#a0b56f", "#8aa159"];
const WEEPING_VEIL_SHADE = ["#4f6338", "#576c3e", "#475b32"];

/**
 * Занавес плакучей ивы. Плеть — НЕ отдельное тело: тонкий отвес держится в
 * решателе на волоске, и любой поворот посадки сбивает ему опору. Телом
 * остаётся сук, а с него рендер вешает плети и лист по ним; сломали сук —
 * исчез весь его занавес, потому что всё адресует один `sourceId`.
 */
function pushWeepingCurtain(
  woodOutput: VisualInstance[],
  foliageOutput: FoliageInstance[],
  limb: BreakablePieceDefinition,
  seed: number,
  trunk: BreakablePieceDefinition | undefined,
): void {
  const localId = limb.treeVisual?.localId ?? "";
  if (!localId.startsWith("limb:")) {
    return;
  }
  const axis = outwardBranchAxis(limb, trunk);
  const length = limb.size[1];
  const start = new Vector3(...limb.position).addScaledVector(axis, -length / 2);
  const identity = hashText(limb.id);
  const profile = proceduralWoodTubeProfile("branch", "willow");
  // Побегов тем больше, чем длиннее несущая ветвь: вуаль висит со ВСЕГО
  // скелета, а не только с главных сучьев.
  const shoots = Math.max(9, Math.round(length * 11));

  for (let shoot = 0; shoot < shoots; shoot += 1) {
    const roll = hash(seed + identity * 37, 910 + shoot);
    const along = 0.06 + (shoot / shoots) * 0.92 + roll * 0.03;
    const hang = start.clone().addScaledVector(axis, length * along);
    // Побег НЕ ветвится — он просто падает. Длина набирается от высоты
    // подвеса: подол вуали ровный, поэтому купол читается куполом.
    const drop = Math.max(1.1, hang.y - (0.35 + roll * 0.8));
    const sway = hash(seed + identity * 41, 920 + shoot);
    const direction = new Vector3(
      Math.cos(sway * Math.PI * 2) * (0.04 + roll * 0.12),
      -1,
      Math.sin(sway * Math.PI * 2) * (0.04 + roll * 0.12),
    ).normalize();
    const diameter = Math.max(0.008, limb.size[0] * (0.06 + roll * 0.04));
    const rodStart: [number, number, number] = [hang.x, hang.y, hang.z];
    woodOutput.push({
      sourceId: limb.id,
      matrix: segmentMatrix(
        hang,
        hang.clone().addScaledVector(direction, drop),
        diameter,
      ),
      color: new Color(limb.color),
      species: treeWoodSpecies("willow"),
      phase: treeBarkPhase(seed + shoot * 11, `${limb.id}:${shoot}`),
      bend: (drop * profile.bendRatio * 0.5) / Math.max(diameter, 0.001),
      taper: 0.5,
    });

    // ВУАЛЬ, А НЕ БУСЫ. Лист идёт по побегу частыми УЗКИМИ рукавами: длинный
    // тонкий сегмент читается прядью, а несколько толстых комьев — гирляндой
    // шаров, чем прежняя сборка и грешила.
    // Рукава считаются ОТ ПОБЕГА, а не от толщины ветви: их длина равна шагу
    // между ними, поэтому пряди смыкаются в сплошную зелёную нить. Раньше
    // рукав был вчетверо короче интервала — оттого вуаль и просвечивала
    // пунктиром вместо зелёной дымки.
    // Прядь СПЛОШНАЯ: рукав длиннее шага между рукавами в полтора раза, они
    // перекрываются и читаются одной лентой листвы. Равный шагу рукав давал
    // бусы на нитке — ровно то, что видно в кадре сверху.
    // Три рукава на побег, каждый вдвое длиннее шага: побег укрыт целиком, а
    // сэкономленные лепестки уходят в ЧИСЛО нитей. Занавес — это много тонких
    // прядей, а не несколько толстых.
    const stations = 3;
    const step = 0.9 / stations;
    const sleeveLength = drop * step * 2;
    const sleeveRadius = Math.max(0.035, diameter * 4.5 + roll * 0.02);
    // Фаза своя у каждого побега: одинаковый шаг на всех плетях выстраивает
    // листву рядами и вуаль читается кукурузным початком.
    const phase = hash(seed + identity * 67, 940 + shoot) * step;
    for (let station = 0; station < stations; station += 1) {
      const at = 0.06 + phase + station * step;
      const rod: WillowWhipRod = {
        start: rodStart,
        direction: [direction.x, direction.y, direction.z],
        length: drop,
        diameter,
        index: 0,
      };
      foliageOutput.push({
        sourceId: limb.id,
        matrix: willowSleeveMatrix(
          rod,
          at,
          sleeveRadius,
          sleeveLength,
          seed + shoot * 13 + station,
        ),
        // ЦВЕТ ВУАЛИ — НЕ КОНСТАНТА. Прежде вся листва дерева красилась одним
        // тоном, и любая плотность собиралась в зелёное месиво: у остальных
        // пород объём даёт пара палитр (выгоревшая оболочка и тень внутри) плюс
        // полистный разброс. Здесь то же самое: наружная и нижняя часть пряди
        // выгорела, внутренняя и верхняя сидит в тени, и у каждой нити свой тон.
        color: new Color(
          WEEPING_VEIL[
            Math.floor(
              hash(seed + identity * 71, 950 + shoot) * WEEPING_VEIL.length,
            )
          ],
        ).lerp(
          new Color(WEEPING_VEIL_SHADE[station % WEEPING_VEIL_SHADE.length]),
          station === 0 ? 0.72 : station === 1 ? 0.34 : 0.08,
        ),
        species: 3,
        phase: hash(seed + identity * 59, 930 + shoot * 5 + station),
      });
    }
  }
}

function pushBirchTwig(
  output: VisualInstance[],
  trunk: BreakablePieceDefinition,
  foliage: BreakablePieceDefinition,
  seed: number,
  index: number,
): void {
  const axis = pieceAxis(trunk);
  const trunkCenter = new Vector3(...trunk.position);
  const trunkStart = trunkCenter
    .clone()
    .addScaledVector(axis, -trunk.size[1] / 2);
  const target = new Vector3(...foliage.position);
  const projected = target.clone().sub(trunkStart).dot(axis);
  const attachDistance = Math.max(
    trunk.size[1] * 0.5,
    Math.min(trunk.size[1] * 0.9, projected - trunk.size[1] * 0.08),
  );
  const start = trunkStart.clone().addScaledVector(axis, attachDistance);
  const middle = start.clone().lerp(target, 0.56);
  middle.y += trunk.size[0] * (0.45 + hash(seed, 100 + index) * 0.35);
  const diameter = trunk.size[0] * (0.16 + hash(seed, 120 + index) * 0.05);
  const color = new Color("#716957");
  const directMiddle = start.clone().lerp(target, 0.56);
  output.push({
    sourceId: foliage.id,
    matrix: segmentMatrix(start, target, diameter),
    color,
    species: 1,
    phase: hash(seed, 180 + index),
    bend:
      middle.distanceTo(directMiddle) /
      Math.max(diameter, 0.001),
    taper: 0.4,
  });
}

/**
 * Стволики куста. Их число, наклон и длина — половина видового силуэта:
 * у садового куста они короткие и прячутся в массе, у заросли берега торчат
 * высоко и врозь, у ежевики выгибаются дугой наружу, у вереска их нет вовсе.
 */
interface ShrubStemProfile {
  readonly count: number;
  /** Доля высоты, на которую поднимается стволик. */
  readonly rise: readonly [number, number];
  /** Разброс конца по радиусу, доля полуширины. */
  readonly reach: readonly [number, number];
  readonly diameter: number;
  readonly color: string;
}

function shrubStemProfile(kind: string): ShrubStemProfile | null {
  switch (kind) {
    case "hedge":
      return { count: 6, rise: [0.48, 0.9], reach: [0.16, 0.38], diameter: 0.028, color: "#55432f" };
    case "thicket":
      // Заросль — это ПУЧОК СТВОЛИКОВ от земли: бузину и иву-куст узнают по
      // ним, а не по листве.
      return { count: 7, rise: [0.62, 1.02], reach: [0.22, 0.52], diameter: 0.05, color: "#4d3d2c" };
    case "cane":
      // Побег ежевики уходит ЗА габарит куста и клонится к земле.
      return { count: 6, rise: [0.75, 1.15], reach: [0.55, 1.05], diameter: 0.024, color: "#5e4432" };
    case "steppe":
      return { count: 5, rise: [0.55, 0.95], reach: [0.24, 0.5], diameter: 0.03, color: "#6b5940" };
    case "needle":
    case "heath":
    case "sedge":
      // У хвойной подушки, верещатника и осоки стволиков не видно.
      return null;
    default:
      return { count: 4, rise: [0.48, 0.9], reach: [0.16, 0.38], diameter: 0.028, color: "#55432f" };
  }
}

function pushShrubTwigs(
  output: VisualInstance[],
  piece: BreakablePieceDefinition,
): void {
  const visual = piece.vegetationVisual;
  if (!visual) {
    return;
  }
  const profile = shrubStemProfile(visual.kind);
  if (!profile) {
    return;
  }
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const center = new Vector3(...piece.position);
  const bottom = center
    .clone()
    .add(new Vector3(0, -piece.size[1] * 0.48, 0).applyQuaternion(rotation));
  const diameter = Math.max(
    0.018,
    Math.min(piece.size[0], piece.size[2]) * profile.diameter,
  );

  for (let index = 0; index < profile.count; index += 1) {
    const angle =
      (index / profile.count) * Math.PI * 2 +
      hash(visual.seed, 410 + index) * 0.7;
    const reach =
      profile.reach[0] +
      hash(visual.seed, 420 + index) * (profile.reach[1] - profile.reach[0]);
    const rise =
      profile.rise[0] +
      hash(visual.seed, 430 + index) * (profile.rise[1] - profile.rise[0]);
    const localEnd = new Vector3(
      Math.cos(angle) * piece.size[0] * reach,
      piece.size[1] * rise,
      Math.sin(angle) * piece.size[2] * reach,
    ).applyQuaternion(rotation);
    const end = bottom.clone().add(localEnd);
    output.push({
      sourceId: piece.id,
      matrix: segmentMatrix(bottom, end, diameter),
      color: new Color(profile.color),
      species: 0,
      phase: hash(visual.seed, 450 + index),
      // Дуга ежевики выгибается наружу тем сильнее, чем длиннее побег.
      bend: visual.kind === "cane"
        ? (piece.size[1] * 0.5) / Math.max(diameter, 0.001)
        : 0,
      taper: visual.kind === "cane" ? 0.3 : 0.6,
    });
  }
}

function pieceMatrix(piece: BreakablePieceDefinition): Matrix4 {
  const rotation = piece.rotation ?? [0, 0, 0];
  return new Matrix4().compose(
    new Vector3(...piece.position),
    new Quaternion().setFromEuler(
      new Euler(rotation[0], rotation[1], rotation[2]),
    ),
    new Vector3(...piece.size),
  );
}

/**
 * Форма массы куста по видам. Отличает их не цвет, а РАСПРЕДЕЛЕНИЕ: изгородь —
 * ряд вдоль своей длины, садовый куст — плотный шар, заросль — рыхлая метёлка
 * кверху, верещатник — расплющенный по земле мат, осока — пучок вверх,
 * ежевика — низкая масса, из которой выходят дуги.
 */
interface ShrubLobeProfile {
  readonly count: number;
  /** Разброс лепестка по горизонтали и высоте, доли габарита. */
  readonly drift: readonly [number, number];
  /** Масштаб лепестка по ширине, высоте и глубине. */
  readonly scale: readonly [number, number, number];
  /** Смещение всей массы по высоте (доля высоты куста). */
  readonly lift: number;
}

function shrubLobeProfile(kind: string | undefined): ShrubLobeProfile {
  switch (kind) {
    case "hedge":
      return { count: 4, drift: [0.22, 0.05], scale: [0.42, 0.86, 0.98], lift: 0 };
    case "thicket":
      // Масса сидит ВЫСОКО и рыхло: снизу видно стволики.
      return { count: 5, drift: [0.3, 0.16], scale: [0.6, 0.58, 0.6], lift: 0.2 };
    case "needle":
      // Подушка: шире, чем выше, и прижата к земле.
      return { count: 4, drift: [0.3, 0.08], scale: [0.66, 0.62, 0.66], lift: -0.06 };
    case "heath":
      // Мат: много плоских лепестков по площади.
      return { count: 6, drift: [0.38, 0.05], scale: [0.5, 0.9, 0.5], lift: -0.02 };
    case "cane":
      return { count: 3, drift: [0.26, 0.1], scale: [0.62, 0.66, 0.62], lift: -0.12 };
    case "steppe":
      // Мелкий лист, ажурная масса — лепестки мельче и разбросаны шире.
      return { count: 5, drift: [0.34, 0.14], scale: [0.54, 0.6, 0.54], lift: 0.06 };
    case "sedge":
      // Пучок листьев вверх: узкий и высокий.
      return { count: 3, drift: [0.16, 0.12], scale: [0.5, 1.0, 0.5], lift: 0.08 };
    default:
      return { count: 3, drift: [0.16, 0.08], scale: [0.74, 0.8, 0.74], lift: 0 };
  }
}

function vegetationLobeMatrix(
  piece: BreakablePieceDefinition,
  index: number,
  count: number,
): Matrix4 {
  const visual = piece.vegetationVisual;
  const profile = shrubLobeProfile(visual?.kind);
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const center = new Vector3(...piece.position);
  const row = index - (count - 1) / 2;
  const seed = (visual?.seed ?? 0) + index * 13;
  const localOffset = visual?.kind === "hedge"
    ? new Vector3(
        row * piece.size[0] * profile.drift[0],
        (index % 2 === 0 ? -profile.drift[1] : profile.drift[1]) * piece.size[1],
        (index % 2 === 0 ? -0.05 : 0.05) * piece.size[2],
      )
    : new Vector3(
        Math.cos(index * 2.2 + hash(seed, 470) * 0.9) *
          piece.size[0] * profile.drift[0],
        (profile.lift +
          (index === 0 ? -profile.drift[1] : profile.drift[1])) * piece.size[1],
        Math.sin(index * 2.2 + hash(seed, 480) * 0.9) *
          piece.size[2] * profile.drift[0],
      );
  center.add(localOffset.applyQuaternion(rotation));
  const jitter = 0.92 + hash(seed, 490) * 0.16;
  return new Matrix4().compose(
    center,
    rotation,
    new Vector3(
      piece.size[0] * profile.scale[0] * jitter,
      piece.size[1] * profile.scale[1] * (0.94 + (index % 2) * 0.12),
      piece.size[2] * profile.scale[2] * jitter,
    ),
  );
}

export function buildTreeVisuals(
  pieces: readonly BreakablePieceDefinition[],
): TreeVisualBuild {
  const wood: VisualInstance[] = [];
  const roots: VisualInstance[] = [];
  const lumps: VisualInstance[] = [];
  const foliage: FoliageInstance[] = [];
  const conifer: FoliageInstance[] = [];

  for (const group of groupTrees(pieces)) {
    if (group.trunk) {
      pushCurvedPiece(
        wood,
        group.trunk,
        group.seed,
        group.kind,
        "trunk",
        undefined,
        roots,
        lumps,
      );
    }
    group.knobs.forEach((knob) => pushKnob(lumps, knob, group.seed, group.kind));
    if (group.kind === "pine") {
      // Сучья сосны — настоящие тела, а не спицы, пририсованные к ярусу.
      // Рендер добавляет каждому восходящие побеги, на которых и лежит хвоя.
      group.branches.forEach((limb) => {
        const isLimb = limb.treeVisual?.localId.startsWith("limb:") ?? false;
        pushCurvedPiece(wood, limb, group.seed, "pine", "branch", group.trunk);
        if (!isLimb) {
          return;
        }
        const axis = outwardBranchAxis(limb, group.trunk);
        const start = new Vector3(...limb.position).addScaledVector(
          axis,
          -limb.size[1] / 2,
        );
        const identityNoise = hashText(limb.id);
        const profile = proceduralWoodTubeProfile("branch", "pine");
        coniferLimbRods(
          [start.x, start.y, start.z],
          [axis.x, axis.y, axis.z],
          limb.size[1],
          limb.size[0],
          group.seed + identityNoise * 613,
        ).forEach((rod) => {
          if (rod.index === 0) {
            return;
          }
          output: {
            wood.push({
              sourceId: limb.id,
              matrix: rodMatrix(rod),
              color: new Color(limb.color),
              species: 2,
              phase: treeBarkPhase(group.seed + rod.index * 13, `${limb.id}:${rod.index}`),
              bend:
                (rod.length * profile.bendRatio) /
                Math.max(rod.diameter * 1.08, 0.001),
              taper: profile.tipScale,
            });
          }
        });
      });
      group.foliage.forEach((cushion, index) => {
        // Одна подушка — три пучка хвои. У брызги фиксированное число хвоинок
        // (693), поэтому РАСТЯГИВАТЬ её нельзя: крупная подушка становится
        // редкой вуалью и дерево читается сухостоем. Плотность берётся числом
        // пучков, а не размером — телом при этом остаётся одна подушка.
        for (let tuft = 0; tuft < 3; tuft += 1) {
          conifer.push({
            sourceId: cushion.id,
            matrix: pineTuftMatrix(cushion, tuft, group.seed + index * 11),
            color: new Color(cushion.color),
            species: 2,
            phase: hash(group.seed + hashText(group.id) * 100, 280 + index * 3 + tuft),
          });
        }
      });
      continue;
    }
    // Ива стрижена, поэтому у неё нет ветвей — есть однолетние хлысты, и
    // каждый рисуется гнездом. Карта гнёзд нужна дальше: листву ивы разносит
    // по стержням гнезда, а не лепит комом вокруг одного.
    // У ивы гнездом рисуется ПОБЕГ (хлыст стриженой, плеть плакучей), а несущий
    // сук — обычной трубой. Иначе сук множится веером и торчит копьями поверх
    // занавеса.
    const isWillowShoot = (piece: BreakablePieceDefinition): boolean => {
      const localId = piece.treeVisual?.localId ?? "";
      return localId.startsWith("whip:") || localId.includes(":strand:");
    };
    const willowFans = group.kind === "willow"
      ? new Map<string, readonly WillowWhipRod[]>(
          group.branches.map((branch) => {
            if (!isWillowShoot(branch)) {
              pushCurvedPiece(wood, branch, group.seed, "willow", "branch", group.trunk);
              pushWeepingCurtain(wood, foliage, branch, group.seed, group.trunk);
              return [branch.id, []];
            }
            return [
              branch.id,
              pushWillowWhip(wood, branch, group.seed, group.trunk),
            ];
          }),
        )
      : null;
    if (!willowFans) {
      group.branches.forEach((branch) =>
        pushCurvedPiece(
          wood,
          branch,
          group.seed,
          group.kind,
          "branch",
          group.trunk,
        ),
      );
    }
    if (
      group.kind === "birch" &&
      group.trunk &&
      group.branches.length === 0
    ) {
      group.foliage.forEach((cluster, index) =>
        pushBirchTwig(wood, group.trunk!, cluster, group.seed, index),
      );
    }
    if (willowFans) {
      const branchById = new Map(
        group.branches.map((branch) => [branch.treeVisual!.localId, branch]),
      );
      group.foliage.forEach((cluster, index) => {
        const parent = branchById.get(cluster.treeVisual?.parentLocalId ?? "");
        const fan = parent ? willowFans.get(parent.id) : undefined;
        if (!parent || !fan || fan.length === 0) {
          // Ком на самом суку (а не на плети) — обычные три лепестка.
          for (let lobe = 0; lobe < 3; lobe += 1) {
            foliage.push({
              sourceId: cluster.id,
              matrix: treeFoliageLobeMatrix(cluster, lobe, group.seed + index * 7),
              color: new Color(cluster.color),
              species: 3,
              phase: hash(group.seed + hashText(group.id) * 100, 150 + index * 2 + lobe),
            });
          }
          return;
        }
        // Лист ивы сидит ВДОЛЬ прута, а не шаром на его конце: доля клампа по
        // длине хлыста переносится на каждый стержень гнезда и раздувается в
        // рукав. Число лепестков то же, что у широколиственных, — плотность
        // берётся распределением, а не умножением.
        const along = whipFraction(parent, cluster);
        for (let lobe = 0; lobe < 3; lobe += 1) {
          const rod = fan[lobe % fan.length];
          foliage.push({
            sourceId: cluster.id,
            matrix: willowSleeveMatrix(
              rod,
              along,
              cluster.size[0] * 0.31,
              cluster.size[0] * 1.5,
              group.seed + index * 7 + lobe,
            ),
            color: new Color(cluster.color),
            // 3 — ива: у неё свой серебряный испод и самая ровная листва.
            species: 3,
            phase: hash(
              group.seed + hashText(group.id) * 100,
              150 + index * 2 + lobe,
            ),
          });
        }
      });
      continue;
    }
    group.foliage.forEach((cluster, index) => {
      // Three overlapping render lobes make a dense crown while the gameplay
      // proxy remains small. All lobes address the same destructible section
      // and still share one draw call.
      for (let lobe = 0; lobe < 3; lobe += 1) {
        foliage.push({
          sourceId: cluster.id,
          matrix: treeFoliageLobeMatrix(cluster, lobe, group.seed + index * 7),
          color: new Color(cluster.color),
          species: group.kind === "birch" ? 1 : 0,
          phase: hash(
            group.seed + hashText(group.id) * 100,
            150 + index * 2 + lobe,
          ),
        });
      }
    });
  }

  for (const piece of pieces) {
    const visual = piece.vegetationVisual;
    if (!visual) {
      continue;
    }
    pushShrubTwigs(wood, piece);
    const lobeCount = shrubLobeProfile(visual.kind).count;
    // Можжевельник — хвоя, а не лист: он уходит в хвойный батч, иначе северный
    // берег зарастает теми же лопухами, что и московский двор.
    const target = visual.kind === "needle" ? conifer : foliage;
    for (let index = 0; index < lobeCount; index += 1) {
      target.push({
        sourceId: piece.id,
        matrix: vegetationLobeMatrix(piece, index, lobeCount),
        color: new Color(piece.color),
        species: visual.kind === "needle" ? 2 : 0,
        phase: hash(visual.seed + hashText(piece.id) * 100, 470 + index),
      });
    }
  }

  return { wood, roots, lumps, foliage, conifer };
}

/** Доля длины хлыста, на которой сидит авторский ком листвы. */
function whipFraction(
  whip: BreakablePieceDefinition,
  cluster: BreakablePieceDefinition,
): number {
  const axis = pieceAxis(whip);
  const start = new Vector3(...whip.position).addScaledVector(
    axis,
    -whip.size[1] / 2,
  );
  const projected = new Vector3(...cluster.position).sub(start).dot(axis);
  return Math.min(1, Math.max(0, projected / Math.max(0.001, whip.size[1])));
}

/**
 * Рукав листвы вдоль побега. Толщина и длина задаются ОТДЕЛЬНО: у ивы прядь
 * тонкая и длинная (десять к одному), и связывать одно с другим нельзя —
 * толстая прядь превращает вуаль в зелёную стену, короткая — в бусы на нитке.
 */
function willowSleeveMatrix(
  rod: WillowWhipRod,
  along: number,
  radius: number,
  length: number,
  seed: number,
): Matrix4 {
  const direction = new Vector3(...rod.direction);
  const centre = new Vector3(...rod.start).addScaledVector(
    direction,
    rod.length * Math.min(0.94, along * (0.9 + hash(seed, 640) * 0.2)),
  );
  const rotation = new Quaternion().setFromUnitVectors(UP, direction);
  const jitter = 0.88 + hash(seed, 650) * 0.24;
  return new Matrix4().compose(
    centre,
    rotation,
    new Vector3(radius * 2 * jitter, length * jitter, radius * 2 * jitter),
  );
}

/** Пучок хвои внутри подушки: смещён вдоль неё и заметно мельче её самой. */
function pineTuftMatrix(
  piece: BreakablePieceDefinition,
  index: number,
  seed: number,
): Matrix4 {
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  const side = index - 1;
  const centre = new Vector3(...piece.position).add(
    new Vector3(
      side * piece.size[0] * 0.3,
      (hash(seed, 700 + index) - 0.5) * piece.size[1] * 0.5,
      (hash(seed, 710 + index) - 0.5) * piece.size[2] * 0.55,
    ).applyQuaternion(rotation),
  );
  const bulk = 0.62 + hash(seed, 720 + index) * 0.12;
  return new Matrix4().compose(
    centre,
    rotation,
    new Vector3(
      piece.size[0] * bulk,
      piece.size[1] * (bulk + 0.25),
      piece.size[2] * bulk,
    ),
  );
}

function treeFoliageLobeMatrix(
  piece: BreakablePieceDefinition,
  index: number,
  seed: number,
): Matrix4 {
  const rotation = new Quaternion().setFromEuler(
    new Euler(...(piece.rotation ?? [0, 0, 0])),
  );
  // Секция кроны обязана оставаться меньше метра, иначе она падает одним комом
  // (детектор в tree-visual-model). У взрослого дуба крона восемь метров в
  // поперечнике, и такими секциями её не набрать телами — поэтому объём даёт
  // РЕНДЕР: три лепестка расходятся шире и раздуваются, накрывая метр с
  // лишним на одну разрушаемую секцию. Лист при этом вырастает до 12–14 см,
  // что как раз дубовый лист. Берёза сквозная, ей надувка слабее.
  const kind = piece.treeVisual?.kind;
  const bulk = kind === "oak" ? 1.75 : kind === "birch" ? 1.45 : 0.84;
  const broad = kind === "oak" || kind === "birch";
  const drift = kind === "oak" ? 0.34 : kind === "birch" ? 0.26 : 0.1;
  const side = index - 1;
  const center = new Vector3(...piece.position).add(
    new Vector3(
      side * piece.size[0] * (drift + hash(seed, 610 + index) * 0.04),
      side * piece.size[1] * (broad ? 0.3 : 0.045),
      (hash(seed, 620 + index) - 0.5) * piece.size[2] * (broad ? 0.7 : 0.16),
    ).applyQuaternion(rotation),
  );
  return new Matrix4().compose(
    center,
    rotation,
    new Vector3(
      piece.size[0] * bulk,
      piece.size[1] * (kind === "oak" ? 1.85 : kind === "birch" ? 1.5 : 0.9),
      piece.size[2] * bulk,
    ),
  );
}

