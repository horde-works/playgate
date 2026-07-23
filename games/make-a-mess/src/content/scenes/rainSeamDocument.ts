import type {
  AuthoredSceneDocument,
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
  SurfaceTextureProfile,
} from "../../game/destructionScene.ts";
import type { RainSeamPlanPoint } from "./rainSeamPlan.ts";

// ---------------------------------------------------------------------------
// ЗАДВОРКИ. Один настоящий кусок города, снятый с натуры: киоск
// стройматериалов в раскисшей грязи, белёные ворота, тесный проулок вдоль
// газовой трубы, двор с бельём и колеёй, сарай с оранжевой заплатой — и
// новостройки, которые уже стоят над задним забором. Драматургия карты —
// шов между старым двором и наступающим городом.
//
// Порядок обхода игроком: улица → киоск → ворота → проулок (сжатие) →
// двор (раскрытие) → тупик со старым сараем → и всё это время на севере
// в кадре высотки. Каждый предмет отвечает на вопрос «кто это оставил».
// ---------------------------------------------------------------------------

interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

export type RainSeamGroundKind =
  | "grass"
  | "soil"
  | "gravel"
  | "asphalt"
  | "gray-pavers"
  | "red-pavers";

const WORLD_RADIUS = 60;
const YELLOW_GAS = "#d9a832";
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
    readonly scale?: SceneVector3;
  } = {},
): void {
  const { rotation, scale, ...definition } = options;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation, scale },
    ...definition,
  });
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

function noise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.71 + salt * 19.13) * 43758.5453;
  return value - Math.floor(value);
}

export function rainSeamGroundHeightAt(): number {
  return 0;
}

// Земля рассказывает маршруты раньше, чем их пройдёт игрок: гравий там, где
// ездят и ходят, трава — по осевой проулка, куда не попадают колёса, грязь —
// перед киоском и на стройке, свежая плитка — только у новых башен.
export function rainSeamGroundKindAt(x: number, z: number): RainSeamGroundKind {
  // Осевая травяная полоса проулка (фото: колёса продавили две колеи).
  if (x > 0.15 && x < 0.95 && z > 23 && z < 33.5) {
    return "grass";
  }
  // Проулок и воротный порог — накатанный гравий.
  if (x > -1.4 && x < 2.7 && z > 22 && z < 36) {
    return "gravel";
  }
  if (x > -3.6 && x < 3.6 && z >= 36 && z < 39.5) {
    return "gravel";
  }
  // Разъезженная грязь перед киоском стройматериалов.
  if (x > -16 && x < -4.2 && z > 38 && z < 48.5) {
    return "soil";
  }
  // Палисадник частника за красным забором.
  if (x > 6.8 && x < 21 && z > 41 && z < 52) {
    return "grass";
  }
  // Разбитый асфальт улицы.
  if (x > -26 && x < 26 && z >= 39.5 && z < 47) {
    return "asphalt";
  }
  // Тропа от спавна к улице.
  if (x > -2.8 && x < 2.8 && z >= 47 && z < 54) {
    return "gravel";
  }
  // Садовая полоса вдоль западного забора двора.
  if (x > -12 && x < -8.6 && z > -12 && z < 20) {
    return "grass";
  }
  // Утоптанная земля двора и хоздвора.
  if (x > -12 && x < 17.4 && z > -25.6 && z < 36) {
    return "soil";
  }
  // Раскопанная стройплощадка между двором и башнями.
  if (x > -17 && x < 17 && z > -39.5 && z <= -25.6) {
    return "soil";
  }
  // Свежее благоустройство у новостроек.
  if (x > -21 && x < 21 && z > -52 && z <= -39.5) {
    return "gray-pavers";
  }
  return "grass";
}

function groundAppearance(kind: RainSeamGroundKind): {
  readonly material: BreakableMaterial;
  readonly color: string;
  readonly textureProfile?: SurfaceTextureProfile;
} {
  switch (kind) {
    case "gray-pavers":
      return { material: "concrete", color: "#d6d5cf", textureProfile: "city-gray-pavers" };
    case "red-pavers":
      return { material: "concrete", color: "#d3c4ad", textureProfile: "city-red-pavers" };
    case "asphalt":
      return { material: "asphalt", color: "#5d5f61" };
    case "gravel":
      return { material: "soil", color: "#837769" };
    case "soil":
      return { material: "soil", color: "#5e5143" };
    default:
      return { material: "grass", color: "#4d5d42" };
  }
}

function createTerrain(): void {
  const base = group("terrain-base", "Round earth foundation", "earth", "linked");
  const surface = group("terrain-surface", "Mud, gravel, worn grass and fresh pavers", "concrete");
  const border = group("courtyard-border", "Circular stone rim", "concrete");
  const tile = 2;
  for (let x = -60; x <= 60; x += tile) {
    for (let z = -60; z <= 60; z += tile) {
      const edge = 58.2 + (noise(x, z, 7) - 0.5) * 0.8;
      if (Math.hypot(x, z) > edge) {
        continue;
      }
      const key = `${x}:${z}`;
      primitive(base, `earth:${key}`, "earth", "groundTile", [x, -0.64, z], [2.04, 1.28, 2.04], "#514538");
      const appearance = groundAppearance(rainSeamGroundKindAt(x, z));
      const variation = noise(x, z, 11);
      primitive(surface, `cover:${key}`, appearance.material, "groundTile", [x, -0.05, z], [2.05, 0.18, 2.05], appearance.color, {
        textureProfile: appearance.textureProfile,
        landscapeSurface: "city-ground",
        weathering:
          appearance.material === "concrete"
            ? 0.1 + variation * 0.1
            : appearance.material === "asphalt"
              ? 0.3 + variation * 0.2
              : undefined,
      });
    }
  }

  const count = 96;
  const radius = 57.3;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    place(border, `edge:${index}`, "city:curb:stone", {
      position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
      rotation: [0, -angle, 0],
      scale: [0.94, 1, 1],
    }, { surface: [{ kind: "damp", amount: 0.5 }] });
  }
}

function placePrefabLine(
  target: MutableGroup,
  id: string,
  prefab: string,
  start: RainSeamPlanPoint,
  end: RainSeamPlanPoint,
  spacing: number,
  y = 0,
  options: Pick<ScenePrefabInstanceDefinition, "palette" | "surface"> = {},
): void {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const distance = Math.hypot(dx, dz);
  const count = Math.max(1, Math.round(distance / spacing));
  const yaw = Math.atan2(-dz, dx);
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    place(target, `${id}:${index}`, prefab, {
      position: [start[0] + dx * t, y, start[1] + dz * t],
      rotation: [0, yaw, 0],
      scale: [distance / (count * spacing), 1, 1],
    }, options);
  }
}

// --- Улица: киоск «Стройматериалы», столб с проводами, частник напротив ----

function createStreet(): void {
  const street = group("street-life", "Building-supplies kiosk trading straight into the mud", "steel");

  place(street, "kiosk", "city:kiosk:building-supplies", {
    position: [-9.6, 0, 43.2],
    rotation: [0, Math.PI / 2, 0],
  }, {
    palette: { plaster: "#e6d7b8" },
    surface: [{ kind: "damp", amount: 0.4 }],
  });
  // Товар выставлен на улицу руками продавца: мётлы в ведре на крыльце,
  // лопаты вдоль стены, штендеры выдвинуты к дороге.
  place(street, "kiosk-tools", "city:shop-tools", {
    position: [-6.6, 0, 38.8],
    rotation: [0, -Math.PI / 2, 0],
    scale: [0.9, 1, 1],
  });
  place(street, "kiosk-brooms", "city:broom-bucket", {
    position: [-6.62, 0.68, 42.62],
    rotation: [0, 0.4, 0],
  });
  place(street, "board:north", "city:sign:sandwich", {
    position: [-5.6, 0, 40.1],
    rotation: [0, 0.55, 0],
  });
  place(street, "board:south", "city:sign:sandwich", {
    position: [-5.4, 0, 45.6],
    rotation: [0, -0.5, 0],
  });
  place(street, "kiosk-barrow", "city:wheelbarrow", {
    position: [-8.4, 0, 48.0],
    rotation: [0, 2.3, 0],
  });
  place(street, "kiosk-pallet", "core:pallet", {
    position: [-11.6, 0, 47.6],
    rotation: [0, 0.2, 0],
  });

  // Деревянный столб-опора: воздушка расходится на киоск, дом и частника
  // (провисающие провода добавляет слой SceneDressing).
  primitive(street, "power-pole", "wood", "cylinder", [-2.4, 3.2, 40.3], [0.2, 6.4, 0.2], "#6f6152", {
    carriesAttachments: true,
  });
  primitive(street, "power-crossarm", "wood", "plank", [-2.4, 5.9, 40.3], [1.3, 0.09, 0.09], "#5d5245", {
    bearsLoad: false,
    sideAttachmentReach: 0.3,
  });
}

function createPrivatePlot(): void {
  const plot = group("private-plot", "Neighbour's plot: decorative fence, carport and string lights", "concrete");

  placePrefabLine(plot, "front-fence:west", "city:fence:breeze-section", [8.2, 41], [13.6, 41], 4);
  placePrefabLine(plot, "front-fence:east", "city:fence:breeze-section", [14.9, 41], [21, 41], 4);
  placePrefabLine(plot, "west-fence", "city:fence:breeze-section", [7, 42.6], [7, 47.4], 4);
  place(plot, "corner-lamp", "city:fence:pillar-lamp", { position: [7, 0, 41] }, {
    surface: [{ kind: "damp", amount: 0.4 }],
  });
  place(plot, "mid-lamp", "city:fence:pillar-lamp", { position: [14.2, 0, 41] }, {
    surface: [{ kind: "damp", amount: 0.4 }],
  });

  place(plot, "carport", "city:carport:lights", {
    position: [11.4, 0, 44.6],
    rotation: [0, -0.1, 0],
  });
  place(plot, "loft-drum", "core:steel-drum", {
    position: [9.3, 0, 46.4],
    rotation: [0, 0.8, 0],
  });
  place(plot, "private-house", "city:house:hip-cream", {
    position: [13.5, 0, 50.6],
    rotation: [0, Math.PI, 0],
    scale: [0.92, 0.95, 0.92],
  }, {
    palette: { plaster: "#e8ddc4" },
    surface: [{ kind: "damp", amount: 0.34 }],
  });
  place(plot, "plot-tree", "city:tree:courtyard", {
    position: [18.4, 0, 45.6],
    rotation: [0, 1.2, 0],
    scale: [0.78, 0.85, 0.78],
  });
}

// --- Фасадная линия двора: белёный кирпич, ворота, палисадник, коробки -----

function createFrontLine(): void {
  const front = group("front-line", "Whitewashed brick front, peeling gate, flowers and boxes", "concrete");

  place(front, "gate", "city:gate:weathered-blue", {
    position: [0, 0, 36],
  }, { surface: [{ kind: "damp", amount: 0.44 }, { kind: "mold", amount: 0.3 }] });
  placePrefabLine(front, "front-west", "city:fence:whitebrick-section", [-11.8, 36], [-3.8, 36], 4);
  placePrefabLine(front, "front-east", "city:fence:whitebrick-section", [3.8, 36], [17.8, 36], 4.1);
  place(front, "corner-pillar:west", "city:fence:pillar", { position: [-12.2, 0, 36] });
  place(front, "corner-pillar:east", "city:fence:pillar", { position: [18.2, 0, 36] });

  // Картонные коробки вынесли к столбу — с прошлого мусорного дня стоят.
  place(front, "boxes", "city:cardboard-boxes", { position: [4.1, 0, 37.35], rotation: [0, 0.25, 0] });

  // Единственное яркое пятно двора: петунии вдоль белой стены проулка —
  // их видно сразу от ворот, глубина кадра получает цветной якорь.
  place(front, "flower-bed", "city:flower-bed", {
    position: [-2.62, 0, 31.4],
    rotation: [0, Math.PI / 2, 0],
    scale: [1.2, 1, 0.92],
  });
  place(front, "gate-hedge", "city:hedge:segment", {
    position: [6.6, 0, 34.9],
    rotation: [0, 0.12, 0],
    scale: [1.1, 0.9, 0.85],
  });
}

// --- Проулок: белёная стена слева, жёлтая труба по дому справа -------------

function createLane(): void {
  const lane = group("lane", "Tight gravel lane between the white wall and the house", "concrete");

  for (const [index, z] of [24.8, 28.8, 32.8].entries()) {
    place(lane, `west-wall:${index}`, "city:fence:whitebrick-section", {
      position: [-1.6, 0, z],
      rotation: [0, Math.PI / 2, 0],
    });
  }
  place(lane, "wall-end-pillar", "city:fence:pillar", { position: [-1.6, 0, 22.4] });
}

// --- Дома: главный вдоль проулка, второй в глубине, сарай в тупике ---------

function createHouses(): void {
  const houses = group("courtyard-houses", "Two stucco houses and the white shed closing the yard", "concrete");

  place(houses, "house-main", "city:house:gable-yellow-ew", {
    position: [6.9, 0, 28],
  }, {
    palette: { plaster: "#d9c8a4" },
    surface: [{ kind: "damp", amount: 0.5 }, { kind: "mold", amount: 0.44 }],
  });
  place(houses, "house-side", "city:house:hip-white", {
    position: [11.6, 0, 8],
    scale: [0.98, 0.96, 0.98],
  }, {
    palette: { plaster: "#e6e2d4" },
    surface: [{ kind: "damp", amount: 0.42 }, { kind: "mold", amount: 0.36 }],
  });
  place(houses, "outbuilding", "city:outbuilding:bicycle-end", {
    position: [-4.2, 0, -20.6],
  }, { surface: [{ kind: "damp", amount: 0.56 }, { kind: "mold", amount: 0.42 }] });

  // Одна перекрашенная суриком заплата на буром скате — след ремонта,
  // который виден с другого конца двора.
  primitive(houses, "shed-roof-patch", "steel", "steelSheet", [-5.7, 3.72, -19.55], [1.2, 0.05, 1.0], "#b25a24", {
    rotation: [0.38, 0, 0],
    bearsLoad: false,
    sideAttachmentReach: 0.4,
    weathering: 0.25,
  });
}

// --- Газовая нить: сшивает ворота, оба дома и счётчик ----------------------

function createGasLine(): void {
  const gas = group("gas-line", "Yellow gas run stitching the houses together", "steel");
  const wallX = 2.76;

  // Каждый горизонтальный ран лежит на стояках, дошедших до земли, — так
  // жёлтая нить и выглядит по-настоящему, и честно несётся решателем.
  primitive(gas, "lane-run", "steel", "steelSheet", [wallX, 2.5, 28.1], [0.12, 0.12, 10.0], YELLOW_GAS, {
    bearsLoad: false,
    weathering: 0.3,
  });
  primitive(gas, "lane-post:south", "steel", "steelSheet", [wallX, 1.23, 32.9], [0.07, 2.46, 0.07], YELLOW_GAS);
  primitive(gas, "lane-post:north", "steel", "steelSheet", [wallX, 1.23, 23.7], [0.07, 2.46, 0.07], YELLOW_GAS);

  primitive(gas, "north-run", "steel", "steelSheet", [7.0, 2.5, 21.68], [7.6, 0.12, 0.12], YELLOW_GAS, {
    bearsLoad: false,
    weathering: 0.3,
  });
  primitive(gas, "north-post:west", "steel", "steelSheet", [3.7, 1.23, 21.68], [0.07, 2.46, 0.07], YELLOW_GAS);
  primitive(gas, "north-post:east", "steel", "steelSheet", [10.2, 1.23, 21.68], [0.07, 2.46, 0.07], YELLOW_GAS);

  // Воздушный пролёт двора: труба поднята на двух жёлтых стойках, как на
  // фотографии — она сшивает главный дом со вторым.
  primitive(gas, "yard-span", "steel", "steelSheet", [10.2, 2.92, 17], [0.12, 0.12, 9.4], YELLOW_GAS, {
    bearsLoad: false,
    weathering: 0.3,
  });
  primitive(gas, "span-post:north", "steel", "steelSheet", [10.2, 1.4375, 21.3], [0.08, 2.875, 0.08], YELLOW_GAS);
  primitive(gas, "span-post:south", "steel", "steelSheet", [10.2, 1.4375, 12.7], [0.08, 2.875, 0.08], YELLOW_GAS);
  place(gas, "meter", "city:gas-service", {
    position: [12.6, 1.05, 12.6],
    scale: [0.85, 0.85, 0.85],
  });
  // Отвод от счётчика уходит сквозь стену второго дома — трубе есть кого
  // питать (пара внесена в осознанные примыкания теста пересечений).
  primitive(gas, "side-inlet", "steel", "steelSheet", [12.6, 2.66, 11.9], [0.11, 0.11, 1.5], YELLOW_GAS, {
    bearsLoad: false,
    sideAttachmentReach: 0.4,
  });
}

// --- Жизнь двора: велосипеды, бельё, дровяник, хозяйственные углы ----------

function createCourtyardLife(): void {
  const life = group("courtyard-life", "Bicycles, laundry, firewood and the working corners", "steel");

  // Дети бросили технику у сарая, как на снимке: два велосипеда и самокат.
  place(life, "bike:black", "city:bicycle", {
    position: [-6.3, 0, -17.4],
    rotation: [0, 0.35, 0.045],
    scale: [0.92, 0.92, 0.92],
  }, { palette: { frame: "#2a3134" } });
  place(life, "bike:blue", "city:bicycle", {
    position: [-4.85, 0, -17.15],
    rotation: [0, -0.2, -0.035],
    scale: [0.86, 0.86, 0.86],
  }, { palette: { frame: "#5f9fbe" } });
  place(life, "scooter", "city:scooter:red", {
    position: [-3.45, 0, -17.55],
    rotation: [0, 1.05, 0],
  });

  // Бельё после дождя так и не сняли.
  place(life, "clothesline", "city:clothesline", {
    position: [0.6, 0, -4.2],
    rotation: [0, 0.4, 0],
  });

  // Дровяник и бочка у восточного профлиста.
  place(life, "wood-stack:0", "core:plank-stack", { position: [15.7, 0, 17.2], rotation: [0, 1.62, 0] });
  place(life, "wood-stack:1", "core:plank-stack", { position: [15.9, 0, 19.1], rotation: [0, 1.5, 0], scale: [0.9, 1.15, 0.9] });
  place(life, "yard-drum", "core:steel-drum", { position: [16.1, 0, 14.9], rotation: [0, 0.3, 0] });
  place(life, "yard-pallet", "core:pallet", { position: [15.3, 0, 21.3], rotation: [0, 1.75, 0] });

  // Хозугол у северного торца главного дома.
  place(life, "crate:0", "core:crate", { position: [4.4, 0, 20.8], rotation: [0, 0.25, 0] });
  place(life, "crate:1", "core:crate", { position: [5.35, 0, 20.6], rotation: [0, -0.4, 0], scale: [0.85, 0.85, 0.85] });
  place(life, "crate-tarp", "core:tarp", { position: [6.4, 0, 20.9], rotation: [0, 0.1, 0] });
  place(life, "door-bucket", "core:bucket", { position: [8.9, 0, 12.9], rotation: [0, 0.6, 0] });
  place(life, "birdhouse", "city:birdhouse", {
    position: [-8.2, 0, -15.4],
    rotation: [0, 0.7, 0],
  });
  place(life, "side-flowers", "city:flower-bed", {
    position: [14.6, 0, 12.7],
    rotation: [0, 0, 0],
    scale: [1.15, 1, 1],
  });
}

// --- Ограда двора: три породы заборов, ритм со столбами --------------------

function createEnclosure(): void {
  const walls = group("courtyard-walls", "Three breeds of fence around one property", "concrete");

  // Запад: красная перфорированная стена, разорванная столбами.
  const westSpans: readonly [number, number][] = [
    [34.2, 22.2],
    [18.6, 3.4],
    [-0.4, -15.6],
    [-19.4, -24.2],
  ];
  for (const [index, [from, to]] of westSpans.entries()) {
    placePrefabLine(walls, `west-wall:${index}`, "city:fence:breeze-section", [-12, from], [-12, to], 4);
  }
  place(walls, "west-lamp:gate", "city:fence:pillar-lamp", { position: [-12, 0, 20.4] }, {
    surface: [{ kind: "damp", amount: 0.4 }],
  });
  place(walls, "west-pillar:mid", "city:fence:pillar", { position: [-12, 0, 1.5] });
  place(walls, "west-lamp:shed", "city:fence:pillar-lamp", { position: [-12, 0, -17.5] }, {
    surface: [{ kind: "damp", amount: 0.4 }],
  });
  place(walls, "west-pillar:rear", "city:fence:pillar", { position: [-12, 0, -25.4] });

  // Восток и зад: тёмный профлист на трубах.
  placePrefabLine(walls, "east-wall", "city:fence:profiled-section", [18, 35], [18, -24.6], 3.95);
  placePrefabLine(walls, "rear-wall", "city:fence:profiled-section", [17.2, -25.8], [-11.4, -25.8], 3.95);
}

// --- Стройплощадка: город уже копает у задней калитки ----------------------

function createConstruction(): void {
  const site = group("construction", "Groundworks strip between the yard and the towers", "concrete");

  // Бытовка-вагончик прораба.
  primitive(site, "cabin", "steel", "steelSheet", [9.5, 1.5, -33], [5.0, 2.3, 2.4], "#4f6f86", {
    carriesAttachments: true,
  });
  primitive(site, "cabin-skid:0", "wood", "plank", [9.5, 0.17, -32.1], [5.2, 0.34, 0.3], "#5d5245");
  primitive(site, "cabin-skid:1", "wood", "plank", [9.5, 0.17, -33.9], [5.2, 0.34, 0.3], "#5d5245");
  primitive(site, "cabin-door", "steel", "steelSheet", [6.98, 1.25, -32.4], [0.08, 1.9, 0.9], "#3c5568", {
    hinge: { pivot: [0, 0, -0.45], direction: [0, 1, 0], normal: [1, 0, 0] },
    sideAttachmentReach: 0.3,
  });
  // NB: у примитивов pivot остаётся локальным нулём объекта — компилятор
  // переносит его в мир вместе с transform.
  primitive(site, "cabin-window", "glass", "glassPane", [10.4, 1.9, -31.77], [1.1, 0.7, 0.08], "#43545c", {
    bearsLoad: false,
    sideAttachmentReach: 0.3,
  });
  primitive(site, "cabin-step", "concrete", "stoneBlock", [7.5, 0.18, -31.4], [0.9, 0.36, 0.7], "#84806f");

  // Штабель дорожных плит, кабельный барабан, мешки и щиты.
  for (let slab = 0; slab < 4; slab += 1) {
    primitive(site, `slab:${slab}`, "concrete", "stoneBlock",
      [0.4 + (slab % 2) * 0.18, 0.13 + slab * 0.24, -31.6 - (slab % 2) * 0.12],
      [3.2, 0.24, 1.25], slab % 2 === 0 ? "#8f8c83" : "#98948a", {
        rotation: [0, (slab % 2) * 0.06 - 0.03, 0],
        weathering: 0.3,
      });
  }
  place(site, "spool", "core:spool", { position: [-4.9, 0, -30.6], rotation: [0, 0.5, 0] });
  place(site, "sacks", "core:sacks", { position: [-2.3, 0, -34.2], rotation: [0, 1.1, 0] });
  place(site, "caution:east", "core:caution", { position: [4.3, 0, -29.4], rotation: [0, 0.7, 0] });
  place(site, "caution:west", "core:caution", { position: [-7.6, 0, -36], rotation: [0, -1.15, 0] });

  // Куча песка под старым брезентом.
  primitive(site, "sand:base", "soil", "groundTile", [-9.2, 0.26, -32.4], [3.1, 0.52, 2.5], "#a08a64");
  primitive(site, "sand:top", "soil", "groundTile", [-9.1, 0.7, -32.3], [1.9, 0.36, 1.5], "#ab9670");
  place(site, "sand-tarp", "core:tarp", { position: [-7.4, 0, -33.6], rotation: [0, 0.9, 0] });

  // Бордюр — граница миров: за ним начинается свежая плитка.
  placePrefabLine(site, "new-curb", "city:curb:stone", [-18, -39.6], [18, -39.6], 4, 0, {
    surface: [{ kind: "damp", amount: 0.45 }],
  });
}

// --- Башни: задник, ради которого двор становится «Задворками» -------------

function createTowers(): void {
  const towers = group("new-towers", "Two towers already standing over the back fence", "concrete");

  place(towers, "tower:stone", "city:tower:stone", {
    position: [-8, 0, -47],
    rotation: [0, 0.05, 0],
  });
  place(towers, "tower:glass", "city:tower:glass", {
    position: [12.5, 0, -46],
    rotation: [0, -0.07, 0],
  });
  // Зелёная вывеска коммерческого первого этажа — «Самарканд»-настроение.
  // Объёмная, на собственной подконструкции из двух стоек перед фасадом.
  primitive(towers, "shop-sign-post:west", "steel", "steelSheet", [8.9, 2.32, -40.28], [0.08, 3.92, 0.08], "#28513c");
  primitive(towers, "shop-sign-post:east", "steel", "steelSheet", [15.3, 2.32, -40.28], [0.08, 3.92, 0.08], "#28513c");
  primitive(towers, "shop-sign", "steel", "steelSheet", [12.1, 4.76, -40.28], [7.4, 0.95, 0.14], "#2f8455", {
    weathering: 0.15,
  });
  primitive(towers, "shop-sign-script", "steel", "steelSheet", [11.2, 4.78, -40.18], [4.6, 0.4, 0.03], "#ecf2ea", {
    bearsLoad: false,
    sideAttachmentReach: 0.4,
  });

  place(towers, "street-lamp:west", "city:lamp:street", { position: [-18.6, 0, -39.9], rotation: [0, Math.PI, 0] });
  place(towers, "street-lamp:east", "city:lamp:street", { position: [20.6, 0, -39.9], rotation: [0, Math.PI, 0] });
  for (const [index, [x, z, yaw]] of ([
    [-18.3, -41.6, 0.4],
    [2.6, -42.4, 1.9],
    [20.9, -41.4, 3.4],
  ] as const).entries()) {
    place(towers, `sapling:${index}`, "city:tree:sapling", {
      position: [x, 0, z],
      rotation: [0, yaw, 0],
    });
  }
}

// --- Растительность: нависающие ивы и зелень по краям ----------------------

function createVegetation(): void {
  const vegetation = group("courtyard-vegetation", "Willows hanging over the fences, growth at every edge", "foliage");

  const trees: readonly [string, number, number, number, string][] = [
    ["lane-willow", -5.4, 27.2, 1.0, "city:tree:willow"],
    ["garden-willow", -9.9, 11.5, 1.08, "city:tree:willow"],
    ["shed-willow", -9.7, -13.8, 0.92, "city:tree:willow"],
    ["yard-tree", 3.2, 16.2, 0.72, "city:tree:courtyard"],
    ["back-tree", 13.2, -28.4, 0.66, "city:tree:courtyard"],
    ["street-tree", -18.6, 44.4, 0.9, "city:tree:courtyard"],
  ];
  for (const [id, x, z, scale, prefabId] of trees) {
    place(vegetation, id, prefabId, {
      position: [x, 0, z],
      rotation: [0, noise(x, z, 31) * Math.PI, 0],
      scale: [scale, scale * (0.92 + noise(x, z, 32) * 0.14), scale],
    });
  }
  place(vegetation, "east-hedge:0", "city:hedge:segment", {
    position: [16.4, 0, 26.2],
    rotation: [0, 1.5, 0],
    scale: [1.05, 0.95, 0.9],
  });
  place(vegetation, "east-hedge:1", "city:hedge:segment", {
    position: [16.5, 0, 29.8],
    rotation: [0, 1.62, 0],
    scale: [1.0, 1.05, 0.9],
  });
}

createTerrain();
createStreet();
createPrivatePlot();
createFrontLine();
createLane();
createHouses();
createGasLine();
createCourtyardLife();
createEnclosure();
createConstruction();
createTowers();
createVegetation();

export const rainSeamDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "rain-seam",
  title: "Make a Mess: Задворки",
  environment: "town",
  world: {
    playerSpawn: [0.8, 1.3, 50],
    cameraFar: 175,
    center: [0, 0],
    halfExtents: [66, 66],
    radius: WORLD_RADIUS,
    safetyFloorY: -3,
  },
  copy: {
    status: "Make a Mess / Задворки",
    eyebrow: "Этюд с натуры 001",
    heading: "Задворки.",
    ready: "Дождь только что прошёл",
    loading: "Обживаем задворки…",
    description:
      "Кусок города, снятый с натуры: киоск стройматериалов торгует прямо в грязь, за белёными воротами — тесный проулок вдоль газовой трубы, двор с бельём и колеёй, сарай с оранжевой заплатой и детские велосипеды. А над задним забором уже стоят новостройки: город подступает к задворкам вплотную.",
    enter: "Зайти с улицы",
    returnToGame: "Вернуться на задворки",
    reset: "Собрать двор заново",
  },
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
