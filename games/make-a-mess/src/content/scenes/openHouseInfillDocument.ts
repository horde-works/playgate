import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrefabInstanceDefinition,
  ScenePrimitiveDefinition,
  SceneTransform,
} from "./sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
  SupportMode,
} from "../../game/destructionScene.ts";

// ---------------------------------------------------------------------------
// СТАРЫЙ КВАРТАЛ ГОРОДА. Дома, вылизанные на «Задворках», переезжают на
// постоянное место: город построен пару десятков лет назад, и частный
// сектор в нём жил ещё до хрущёвок. Отсюда правила планировки (обкатаны на
// деревне викингов):
//   - у частного сектора нет линии застройки: разные отступы и лёгкие
//     развороты (дома ставили по меже и солнцу, а не по осям панелек);
//   - каждый дом обходится кольцевой тропой (габарит + ~1.2 м чистыми) и
//     привязан тропой к общей точке — см. townSurfacePlan;
//   - между частным домом и панелькой — минимум ширина проезда с двором.
//
//   Участок Б (северо-запад): кремовый дом в глубине за палисадником,
//   сарай с великами, белёный забор с синими воротами, бельё, скворечник.
//   Участок в центре северной полосы: белёный малый дом у дворового
//   проезда панельки k1.
//   Южная усадьба за k5: жёлтый двускатный дом со своим разворотом, навес
//   с гирляндой, ворота и гравийный дворик на конце проезда.
//
// Башни и стройка НЕ переезжают: этому городу они не принадлежат.
// ---------------------------------------------------------------------------

interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

const groups = new Map<string, MutableGroup>();

function group(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) {
    return existing;
  }
  const created = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

function place(
  target: MutableGroup,
  id: string,
  prefab: string,
  transform: SceneTransform,
  options: Pick<ScenePrefabInstanceDefinition, "palette" | "surface"> = {},
): void {
  target.objects.push({ kind: "prefab", id, prefab, transform, ...options });
}

function primitive(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: Omit<
    ScenePrimitiveDefinition,
    "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"
  > & {
    readonly rotation?: SceneVector3;
  } = {},
): void {
  const { rotation, ...definition } = options;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation },
    ...definition,
  });
}

const YELLOW_GAS = "#d9a832";
const damp = [{ kind: "damp", amount: 0.35 } as const];

// --- Северо-западный двор: два дома в глубине, свободный подход ------------

function createPlotB(): void {
  const houses = group("b-houses", "Old private houses set back from the panel blocks", "concrete");
  // Частный сектор старше панельной сетки, поэтому линии застройки у него
  // нет: кремовый дом утоплен вглубь участка (палисадник от забора до окон),
  // белёный выдвинут к дворовому проезду. Лёгкие развороты — дома ставили
  // по меже и солнцу, а не по осям микрорайона.
  place(houses, "hip-cream", "city:house:hip-cream", {
    position: [-8.6, 0, 15.9],
    rotation: [0, Math.PI - 0.06, 0],
  }, { surface: damp });
  // Белёный дом — отдельный участок в центре северной полосы: частный
  // сектор вкраплён в микрорайон, а не сложен в одном углу. Дверь смотрит
  // на дворовой проезд панельки k1.
  place(houses, "hip-white", "city:house:hip-white", {
    position: [30, 0, 12.4],
    rotation: [0, Math.PI + 0.07, 0],
  }, { surface: damp });
  place(houses, "shed", "city:outbuilding:bicycle-end", {
    position: [-10.0, 0, 3.6],
    rotation: [0, Math.PI, 0],
  }, { surface: [{ kind: "damp", amount: 0.5 }, { kind: "mold", amount: 0.35 }] });

  // Ограда не теснит: только фрагмент — синие ворота с одним коротким
  // белёным плечом; фланги и задворки открыты, восточная сторона — свободный
  // проход к киоску. Никаких глухих стен по кромке карты.
  const fences = group("b-fences", "Open fencing: a gate with one short shoulder", "concrete");
  place(fences, "gate", "city:gate:weathered-blue", {
    position: [-1.6, 0, 9.0],
  }, { surface: damp });
  place(fences, "shoulder:west", "city:fence:whitebrick-section", { position: [-6.5, 0, 9.0], scale: [0.6, 1, 1] });
  // Фонарный столбик стоит НА линии ограды, в зазоре между плечом и
  // столбом ворот: плечо → фонарь → ворота. Раньше он висел в метре перед
  // забором и читался случайным.
  place(fences, "gate-lamp", "city:fence:pillar-lamp", { position: [-4.93, 0, 9.0] }, { surface: damp });

  const life = group("b-life", "Laundry, bikes, cardboard and the birdhouse", "steel");
  place(life, "clothesline", "city:clothesline", {
    position: [-1.7, 0, 13.4],
    rotation: [0, Math.PI / 2, 0],
  });
  place(life, "bike:black", "city:bicycle", {
    position: [-11.4, 0, 0.4],
    rotation: [0, 0.3, 0.04],
    scale: [0.92, 0.92, 0.92],
  }, { palette: { frame: "#2a3134" } });
  place(life, "bike:blue", "city:bicycle", {
    position: [-9.9, 0, 0.25],
    rotation: [0, -0.25, -0.035],
    scale: [0.86, 0.86, 0.86],
  }, { palette: { frame: "#5f9fbe" } });
  place(life, "scooter", "city:scooter:red", {
    position: [-8.6, 0, 0.4],
    rotation: [0, 1.2, 0],
  });
  place(life, "boxes", "city:cardboard-boxes", {
    position: [-5.2, 0, 2.4],
    rotation: [0, 0.35, 0],
  });
  // Скворечник у сарая с великами — отступивший вглубь дом занял его старое
  // место в северо-западном углу.
  place(life, "birdhouse", "city:birdhouse", {
    position: [-14.5, 0, 7.4],
    rotation: [0, 0.6, 0],
  });
  place(life, "barrow", "city:wheelbarrow", {
    position: [-5.0, 0, 4.8],
    rotation: [0, 1.4, 0],
  });
  place(life, "flowers:cream", "city:flower-bed", {
    position: [-12.2, 0, 9.55],
    scale: [1.1, 1, 0.9],
  });
  place(life, "flowers:white", "city:flower-bed", {
    position: [32.6, 0, 8.3],
    rotation: [0, 0.07, 0],
    scale: [1.05, 1, 0.95],
  });
  place(life, "yard-willow", "city:tree:willow", {
    position: [1.2, 0, 5.4],
    rotation: [0, 0.8, 0],
    scale: [0.82, 0.86, 0.82],
  });

  const gas = group("b-gas", "Yard gas run between the two houses", "steel");
  primitive(gas, "run", "steel", "steelSheet", [-1.8, 2.56, 18.0], [3.0, 0.12, 0.12], YELLOW_GAS, {
    bearsLoad: false,
    weathering: 0.25,
  });
  primitive(gas, "post:west", "steel", "steelSheet", [-3.15, 1.25, 18.0], [0.09, 2.5, 0.09], YELLOW_GAS);
  primitive(gas, "post:east", "steel", "steelSheet", [-0.45, 1.25, 18.0], [0.09, 2.5, 0.09], YELLOW_GAS);
}

// --- Киоск «Стройматериалы» у прохода к площадке ---------------------------

function createKioskCorner(): void {
  const kiosk = group("kiosk-corner", "Building-supplies kiosk trading to the playground path", "steel");
  place(kiosk, "kiosk", "city:kiosk:building-supplies", {
    position: [14.9, 0, 8.0],
    rotation: [0, Math.PI, 0],
  }, { surface: damp });
  place(kiosk, "brooms", "city:broom-bucket", {
    position: [13.55, 0.68, 4.75],
    rotation: [0, 0.5, 0],
  });
  place(kiosk, "tools", "city:shop-tools", {
    position: [18.95, 0, 8.4],
    rotation: [0, Math.PI / 2, 0],
    scale: [0.85, 1, 1],
  });
  place(kiosk, "board:west", "city:sign:sandwich", {
    position: [11.55, 0, 3.35],
    rotation: [0, 2.6, 0],
  });
  place(kiosk, "board:east", "city:sign:sandwich", {
    position: [17.15, 0, 3.5],
    rotation: [0, -2.7, 0],
  });
}

// --- Южная усадьба за хрущёвками: большой дом у продлённой дороги ----------

function createSouthHomestead(): void {
  // Асфальтовый проезд ответвляется от поперечной улицы и идёт на запад
  // вдоль южной стены панельки. Кончается он не тупиком в стену дома, а
  // гравийным двориком: здесь разворачиваются, разгружаются, отсюда тропы
  // расходятся к воротам и навесу.
  const roads = group("south-lane", "Asphalt spur behind the southern block", "concrete", "linked");
  const laneTiles: readonly [number, number][] = [
    [37.6, 3.6],
    [32.8, 6.0],
    [27.4, 4.8],
  ];
  for (const [index, [x, width]] of laneTiles.entries()) {
    primitive(roads, `lane:${index}`, "asphalt", "groundTile", [x, 0.03, -44.3], [width, 0.1, 1.6], index % 2 === 0 ? "#4c4c4a" : "#4a4a48");
  }
  primitive(roads, "court", "earth", "groundTile", [21.8, 0.025, -45.9], [6.2, 0.09, 3.8], "#7a6c55", {
    weathering: 0.3,
  });

  // Усадьба старше панельной сетки, поэтому сидит со своим разворотом
  // (yaw 0.12) в глубине участка: от k5 её отделяют проезд и палисадник,
  // а не трёхметровая щель. Задний двор ушёл на южный «язык» плиты.
  const plot = group("south-plot", "The big yellow house with carport and string lights", "concrete");
  place(plot, "gable-yellow", "city:house:gable-yellow", {
    position: [26.5, 0, -54.5],
    rotation: [0, 0.12, 0],
  }, { surface: damp });
  place(plot, "carport", "city:carport:lights", {
    position: [15.8, 0, -53.6],
    rotation: [0, 0.12, 0],
  });
  place(plot, "loft-drum", "core:steel-drum", {
    position: [12.9, 0, -51.2],
    rotation: [0, 0.7, 0],
  });
  // Дворовое дерево держит юго-восточный угол участка, а не лежит кроной
  // на крыше.
  place(plot, "plot-tree", "city:tree:courtyard", {
    position: [37.0, 0, -58.2],
    rotation: [0, 1.1, 0],
    scale: [0.82, 0.88, 0.82],
  });
  place(plot, "front-flowers", "city:flower-bed", {
    position: [22.5, 0, -49.5],
    rotation: [0, 0.12, 0],
    scale: [1.25, 1, 1],
  });

  // Границу участка рисует не глухая стена, а фрагмент, как на участке Б.
  // Вся ограда лежит на ОДНОЙ линии с вектором усадьбы (yaw 0.12):
  // плечо примыкает к западному столбу ворот, фонарный столбик продолжает
  // линию за восточным — маркер прохода. Свет у двери дают настенные
  // фонарики (porch-lanterns), отдельный дворовый столб не нужен.
  const fences = group("south-fences", "Open fencing at the homestead gate", "concrete");
  place(fences, "gate", "city:gate:weathered-blue", {
    position: [27.7, 0, -46.6],
    rotation: [0, 0.12, 0],
  }, { surface: damp });
  place(fences, "shoulder:west", "city:fence:whitebrick-section", {
    position: [23.5, 0, -46.1],
    rotation: [0, 0.12, 0],
    scale: [0.6, 1, 1],
  });
  place(fences, "gate-lamp", "city:fence:pillar-lamp", {
    position: [31.4, 0, -47.05],
    rotation: [0, 0.12, 0],
  }, { surface: damp });
}

// --- Настенные фонарики у входов частного сектора --------------------------
// Позиции посчитаны от векторов домов: origin каждого фонарика лежит на
// плоскости фасада рядом с дверью, поворот совпадает с поворотом дома.

function createPorchLanterns(): void {
  const lanterns = group("porch-lanterns", "Porch lanterns by the new house doors", "steel", "mounted");
  place(lanterns, "cream", "city:lantern:porch", {
    position: [-10.23, 0, 12.2],
    rotation: [0, Math.PI - 0.06, 0],
  });
  place(lanterns, "white", "city:lantern:porch", {
    position: [30.06, 0, 8.98],
    rotation: [0, Math.PI + 0.07, 0],
  });
  // У усадьбы фонарики по обе стороны двери — хозяева любят свет, у них и
  // гирлянда под навесом.
  place(lanterns, "south:west", "city:lantern:porch", {
    position: [25.39, 0, -50.33],
    rotation: [0, 0.12, 0],
  });
  place(lanterns, "south:east", "city:lantern:porch", {
    position: [28.87, 0, -50.75],
    rotation: [0, 0.12, 0],
  });
}

createPlotB();
createKioskCorner();
createSouthHomestead();
createPorchLanterns();

export const openHouseInfillDocument = {
  schemaVersion: 1 as const,
  id: "old-quarter",
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
