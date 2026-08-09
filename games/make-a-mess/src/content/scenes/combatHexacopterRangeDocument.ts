import type {
  AuthoredSceneDocument,
  SceneGroupDefinition,
  SceneObjectDefinition,
} from "./sceneContract.ts";
import { createCombatHexacopterPrototypeDocument } from "./combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT,
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
  COMBAT_HEXACOPTER_RANGE_SCENE_ID,
} from "../../game/combatHexacopter.ts";
import type { SceneVector3 } from "../../game/destructionScene.ts";

export const COMBAT_HEXACOPTER_RANGE_RADIUS = 50;
const PLATE_THICKNESS = 0.08;
const RINGS = [0, 12.5, 25, 37.5, 49.2] as const;
const SECTORS = 16;

function steelPlate(ring: number, sector: number): SceneObjectDefinition {
  const inner = RINGS[ring];
  const outer = RINGS[ring + 1];
  const a0 = sector * Math.PI * 2 / SECTORS;
  const a1 = (sector + 1) * Math.PI * 2 / SECTORS;
  const points = [
    [Math.cos(a0) * inner, Math.sin(a0) * inner],
    [Math.cos(a1) * inner, Math.sin(a1) * inner],
    [Math.cos(a1) * outer, Math.sin(a1) * outer],
    [Math.cos(a0) * outer, Math.sin(a0) * outer],
  ] as const;
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const sizeX = Math.max(0.1, maxX - minX);
  const sizeZ = Math.max(0.1, maxZ - minZ);
  const vertices: SceneVector3[] = [];
  for (const y of [-0.5, 0.5]) {
    for (const [x, z] of points) {
      vertices.push([(x - centreX) / sizeX, y, (z - centreZ) / sizeZ]);
    }
  }
  return {
    kind: "primitive",
    id: `plate:${ring}:${sector}`,
    material: "steel",
    shape: "steelSheet",
    size: [sizeX, PLATE_THICKNESS, sizeZ],
    // У ГОЛОГО МЕТАЛЛА БАЗОВЫЙ ЦВЕТ — ЭТО F0 ОТРАЖЕНИЯ, А НЕ ДИФФУЗНОЕ АЛЬБЕДО.
    // Сталь отражает 50-60% (F0 ~0.5 линейных), здесь стояло 0.05 — уголь. При
    // metalness 0.78 диффузной составляющей почти нет, так что настил светился
    // только отражённым небом, и держался в кадре исключительно вуалью блума.
    color: (ring + sector) % 3 === 0 ? "#b4b9bc" : "#a3a9ac",
    transform: { position: [centreX, PLATE_THICKNESS / 2, centreZ] },
    visualMesh: {
      vertices,
      indices: [
        4, 5, 6, 4, 6, 7,
        0, 2, 1, 0, 3, 2,
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7,
      ],
    },
    voxelization: { mode: "shell", thickness: PLATE_THICKNESS },
    volume: (outer * outer - inner * inner) * Math.PI / SECTORS * PLATE_THICKNESS,
    foundation: true,
    carriesAttachments: true,
    bearingArea: Math.max(1, (outer * outer - inner * inner) * Math.PI / SECTORS),
  };
}

const groundGroup: SceneGroupDefinition = {
  id: "ground",
  label: "Earth test range and segmented steel deck",
  material: "earth",
  supportMode: "stack",
  objects: [
    {
      kind: "primitive",
      id: "earth-disc",
      material: "earth",
      shape: "cylinder",
      size: [100, 1.4, 100],
      color: "#655442",
      transform: { position: [0, -0.7, 0] },
      foundation: true,
      carriesAttachments: true,
      bearingArea: Math.PI * 50 * 50,
    },
    ...Array.from({ length: RINGS.length - 1 }, (_, ring) =>
      Array.from({ length: SECTORS }, (_, sector) => steelPlate(ring, sector)),
    ).flat(),
  ],
};

const [dispatchX, , dispatchZ] = COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT;
const dispatchGroup: SceneGroupDefinition = {
  id: "dispatch",
  label: "RAX-8 Tonkawa autonomous launch station",
  material: "steel",
  supportMode: "stack",
  objects: [
    {
      kind: "primitive",
      id: "post",
      material: "steel",
      shape: "cylinder",
      size: [0.14, 0.96, 0.14],
      color: "#282e31",
      transform: { position: [dispatchX, 0.56, dispatchZ] },
      foundation: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.45,
      bearingArea: 0.4,
    },
    {
      kind: "primitive",
      id: "console",
      material: "steel",
      shape: "steelSheet",
      size: [0.62, 0.38, 0.2],
      color: "#202629",
      transform: { position: [dispatchX, 1.1, dispatchZ] },
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.36,
    },
    {
      kind: "primitive",
      id: "screen",
      material: "darkGlass",
      shape: "glassPane",
      size: [0.48, 0.25, 0.035],
      color: "#2bc5ad",
      transform: { position: [dispatchX, 1.12, dispatchZ - 0.12] },
      bearsLoad: false,
      light: {
        color: "#54ffe2",
        distance: 5,
        intensity: 1.8,
        dayIntensityFactor: 0.72,
        poolPriority: 7,
      },
    },
    {
      kind: "primitive",
      id: "safety-ring",
      material: "steel",
      shape: "cylinder",
      size: [1.15, 0.035, 1.15],
      color: "#d18436",
      transform: { position: [dispatchX, 0.105, dispatchZ] },
      foundation: true,
      bearsLoad: false,
    },
  ],
};

const vehicle = createCombatHexacopterPrototypeDocument(
  COMBAT_HEXACOPTER_RANGE_PLACEMENT,
).groups[0];

export const combatHexacopterRangeDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: COMBAT_HEXACOPTER_RANGE_SCENE_ID,
  title: "Make a Mess: RAX-8 Tonkawa Range",
  environment: "town",
  // Дымка отодвинута под показательный маршрут: на дальнем участке машина
  // уходит за сотню метров, и при прежних 74/175 она растворялась ровно там,
  // где её и надо смотреть.
  fogDistances: [110, 260],
  world: {
    playerSpawn: [8.5, 1.38, 5.8],
    playerSpawnYaw: Math.atan2(-8.5, 5.8),
    // ЧЕТЫРЕ РАЗНЫХ РАДИУСА, И ТОЛЬКО ОДИН ИЗ НИХ ВЫРОС.
    //
    // Маршрут уходит на 112 м от берта — это предел ЛЕТАЮЩЕЙ машины, и
    // расширять под него ЗЕМЛЮ было бы подгонкой мира под ошибку трассы.
    // Поэтому суша (`radius`) и кромка игрока (`boundaryRadius`) остались
    // прежними: пешком туда по-прежнему не уйти. Выросли только видимая
    // атмосфера и дальность камеры — то, что обязано покрывать саму машину.
    cameraFar: 380,
    center: [0, 0],
    halfExtents: [53, 53],
    radius: COMBAT_HEXACOPTER_RANGE_RADIUS,
    boundaryRadius: 55,
    skyRadius: 150,
    safetyFloorY: -2,
  },
  copy: {
    status: "Make a Mess / Tonkawa range",
    eyebrow: "Autonomous rotorcraft trials",
    heading: "RAX-8 Tonkawa.",
    ready: "Tonkawa range ready",
    loading: "Preparing the flight deck…",
    description: "A compact steel-plated range for autonomous RAX-8 Tonkawa testing.",
    enter: "Enter the range",
    returnToGame: "Return to the range",
    reset: "Reset the range",
  },
  /**
   * ТРИ ГРУППЫ, И ЧЕТВЁРТУЮ ДОБАВЛЯТЬ НЕ В ПУСТОЙ ВОЗДУХ.
   *
   * Над этим полигоном идёт показательная программа RAX-8, и она занимает
   * почти весь объём мира. Замер (09.08.2026, стенд `flight-figure-route`):
   *
   *   - трасса уходит на 128 м от площадки по горизонтали при кромке земли 50
   *     и кромке игрока 55, то есть большая часть программы идёт ЗА сушей;
   *   - фигуры живут между 16 и 77 м высоты;
   *   - самое низкое место — бросок мимо площадки: около 22 м над бертом в
   *     сорока метрах от неё, и там машина идёт носом на площадку;
   *   - через центр диска проходят два прямых участка: бросок и стосемидесяти-
   *     восьмиметровый подъём к финальному иммельману.
   *
   * И ЭТО УЖЕ НЕ ЕДИНСТВЕННАЯ ПРОГРАММА В ЭТОМ ВОЗДУХЕ. Над тем же полигоном
   * идёт показательная программа VX-8 «Yaqui» — овал в три круга, замер
   * (09.08.2026, стенд `duct-hexacopter-flight`):
   *
   *   - трасса уходит на 107 м от пада RAX-8, то есть лежит ВНУТРИ его
   *     стодвадцативосьмиметрового выноса и пересекается с ним;
   *   - этажи программы: 16 м на проходе над своей площадкой, 30 м на первом
   *     кульбите, 58 м на бочке, 44 и 46 на петлях;
   *   - потолок фигур — около 90 м, выше всего, что делает RAX-8.
   *
   * Разводить их по времени НЕ НАДО: мир опытный, в нём летает одна машина
   * зараз. Но всякий новый предмет обязан сверяться с ОБЕИМИ трассами.
   *
   * Всё, что ставится в этот мир выше нескольких метров или ближе тридцати к
   * площадке, обязано быть сверено с трассой. Проверка есть и она дешёвая:
   * `tests/flight-figure-route.test.mjs` и `tests/duct-hexacopter-flight.test.mjs`
   * летают от площадки до площадки с настоящим сторожем отказов и упадут, если
   * машине станет негде пройти.
   *
   * И отдельно: `tests/combat-hexacopter-range.test.mjs` держит счёт кусков
   * КЛАСТЕРА МАШИНЫ (667). Новый прототип — своя группа и свой кластер; куски,
   * досыпанные в машину, ломают счёт правильно, а не по недосмотру.
   */
  groups: [groundGroup, vehicle, dispatchGroup],
};
