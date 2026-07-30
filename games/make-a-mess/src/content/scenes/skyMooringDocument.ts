import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
  SurfaceTreatment,
} from "./sceneContract.ts";
import {
  mooringSignalColor,
  type BreakableMaterial,
  type BreakableShape,
  type LampEventLightingDefinition,
  type SceneVector3,
  type SpotLightDefinition,
  type SupportMode,
} from "../../game/destructionScene.ts";

// ---------------------------------------------------------------------------
// ПРИЧАЛ НЕБА НА ЗАПАДНОЙ ОПУШКЕ. Главная улица города кончается асфальтом,
// дальше грунтовая тропа сужается и уходит между соснами в туман. На
// последнем открытом пятачке у самой кромки мира стоит клёпаная причальная
// мачта, а к ней носом пришвартован дирижабль — тот же корабль, что у
// викингов прилетает драккаром под шерстяным баллоном. Сюда он приходит
// ретрофутуристическим: серебристая прорезиненная оболочка, бортовой номер,
// гондола-вагон с окнами и два мотора на выносных фермах.
//
// Ориентация выбрана «встречающей»: мачта стоит прямо у тропы, лестница,
// трап и дверь гондолы смотрят на восток, в сторону города, а корабль
// уходит бортом на юг — подходящий видит его целиком, а не хвост.
//
// Правила сборки транспорта — games/make-a-mess/docs/transport-lessons.md.
// Коротко о том, что здесь важно:
//   - корабль держит «подъёмное сердце» внутри оболочки (материал earth —
//     для решателя это парящий фундамент). Разбил сердце — весь дирижабль
//     уходит вниз, а мачта и площадка остаются: они стоят на земле;
//   - мачта кораблю НЕ опора: её оголовок инертен (bearsLoad и
//     carriesAttachments false), а несущая ферма обрывается на два метра
//     ниже корпуса. У стали допустимый зазор опоры 1.1 м — иначе носовой
//     конус «садится» на верхушку фермы, вися над ней;
//   - винты вынесены на 4.3 м от оси: круг вращения должен проходить мимо
//     оболочки с запасом, поэтому у моторов настоящие фермы-крылья.
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

// --- Система координат корабля ---------------------------------------------
// Нос лежит в точке NOSE, ось +a идёт к хвосту (на юг), ось +b — на восток,
// в сторону города. Всё, чем пользуются люди — лестница, трап, посадочная
// площадка,
// дверь — живёт на восточной стороне.

const NOSE_X = -22.6;
const NOSE_Z = -15.29;
const HEADING = -1.451;
const CA = Math.cos(HEADING);
const SA = Math.sin(HEADING);
/** Высота осевой линии оболочки: низ баллона выше крон опушки. */
const AXIS_Y = 12.6;
const HULL_LENGTH = 15;
const HULL_RADIUS = 2.35;
/** Мачта стоит на 1.7 м впереди носа — её стакан принимает носовой узел. */
const MAST_A = -1.7;

function P(a: number, b: number, y: number): SceneVector3 {
  return [NOSE_X + a * CA - b * SA, y, NOSE_Z + a * SA + b * CA];
}

/** Продольная деталь: длина по +a, высота по y, толщина по b. */
const ALONG: SceneVector3 = [0, -HEADING, 0];
/** Мировые направления осей корабля — для петель дверей. */
const AXIS_FORE: SceneVector3 = [CA, 0, SA];
const AXIS_EAST: SceneVector3 = [-SA, 0, CA];

/**
 * Ориентация цилиндра осью вдоль вектора d. Эйлеры интринсические XYZ
 * (R = Rx·Ry·Rz, как в three.js), поэтому образ локальной оси y —
 * второй столбец матрицы, и при ry = 0 система решается двумя atan2.
 */
function rodRotation(dx: number, dy: number, dz: number): SceneVector3 {
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

const HULL_AXIS = rodRotation(CA, 0, SA);
/**
 * Цилиндр, лежащий поперёк корабля (вдоль оси b). Записывать это как
 * [PI/2, -HEADING ± PI/2, 0] НЕЛЬЗЯ: Rx(PI/2) переводит локальный y в
 * мировой z независимо от рыскания, и после разворота корабля все такие
 * перила, пояса и обручи торчат прутьями вдоль мировой оси Z.
 */
const ACROSS_AXIS = rodRotation(-SA, 0, CA);

/**
 * Ориентация куска по паре направлений: куда смотрит его локальный x
 * (длина) и локальный y (толщина/размах). Возвращает эйлеры XYZ ровно в
 * той конвенции, в которой их читает компилятор сцены (R = Rx·Ry·Rz).
 *
 * Это единственный правильный способ разложить деталь по оси корабля:
 * запись вида [phi, -HEADING, taper] работает лишь пока корпус лежит вдоль
 * мировой оси X. Поворот на phi там крутит вокруг МИРОВОГО x, и стоит
 * развернуть корабль — полотнища оболочки разъезжаются чешуёй, а кили
 * улетают вбок. Проверено разворотом причала на 90°.
 */
function orient(xDir: SceneVector3, yDir: SceneVector3): SceneVector3 {
  const norm = (v: SceneVector3): SceneVector3 => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const x = norm(xDir);
  const dot = yDir[0] * x[0] + yDir[1] * x[1] + yDir[2] * x[2];
  const y = norm([yDir[0] - x[0] * dot, yDir[1] - x[1] * dot, yDir[2] - x[2] * dot]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

/** Радиальное направление на угле phi вокруг оси корпуса (0 — вверх). */
function radial(phi: number): SceneVector3 {
  return [
    Math.sin(phi) * -SA,
    Math.cos(phi),
    Math.sin(phi) * CA,
  ];
}


/** Тяга/канат между двумя мировыми точками одним куском. */
function strut(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  from: SceneVector3,
  to: SceneVector3,
  thickness: number,
  color: string,
  options: Parameters<typeof primitive>[7] = {},
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  primitive(target, id, material, "cylinder",
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    [thickness, length, thickness], color, {
      rotation: rodRotation(dx, dy, dz),
      contactBoxes: [{ position: [0, 0, 0], size: [thickness * 2.2, length, thickness * 2.2] }],
      ...options,
    });
}

/**
 * Профиль сигары: эллиптический нос, длинный хвостовой конус. Максимальный
 * мидель на 37% длины — пропорция дирижаблей тридцатых.
 */
function hullRadius(a: number): number {
  if (a <= 5.5) {
    const t = a / 5.5;
    return HULL_RADIUS * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  }
  const t = (a - 5.5) / (HULL_LENGTH - 5.5);
  return HULL_RADIUS * Math.pow(Math.max(0, 1 - t * t), 0.62);
}

const damp: readonly SurfaceTreatment[] = [{ kind: "damp", amount: 0.3 }];

const SILVER_A = "#b3b7b4";
const SILVER_B = "#a7aba8";
const SILVER_DIRTY = "#989c96";
const HULL_STRIPE = "#4f5a66";
const MARK_RED = "#8e2f28";
const DURAL = "#8d9195";
const IRON = "#4a4f52";

const AIRSHIP_CLUSTER_ID = "sky-mooring:airship";
const mooringManeuverLighting: LampEventLightingDefinition = {
  sourceClusterId: AIRSHIP_CLUSTER_ID,
  levels: {
    docked: { intensityMultiplier: 0, distanceMultiplier: 1 },
    inTransit: { intensityMultiplier: 0, distanceMultiplier: 1 },
    departure: { intensityMultiplier: 1, distanceMultiplier: 1 },
    cruise: { intensityMultiplier: 0, distanceMultiplier: 1 },
    approach: { intensityMultiplier: 1, distanceMultiplier: 1 },
  },
};
const mastDockLighting: LampEventLightingDefinition = {
  sourceClusterId: AIRSHIP_CLUSTER_ID,
  levels: {
    // The mast is a bright occupied berth only after a real nose capture.
    docked: { intensityMultiplier: 1.9, distanceMultiplier: 1.18 },
    // Countdown happens while the ship is still physically in the cup.
    attention: { intensityMultiplier: 1.9, distanceMultiplier: 1.18 },
    inTransit: { intensityMultiplier: 0.12, distanceMultiplier: 0.55 },
    departure: { intensityMultiplier: 0.12, distanceMultiplier: 0.55 },
    cruise: { intensityMultiplier: 0.12, distanceMultiplier: 0.55 },
    approach: { intensityMultiplier: 0.12, distanceMultiplier: 0.55 },
    failed: { intensityMultiplier: 0.12, distanceMultiplier: 0.55 },
  },
};

/** Directed fixtures are exported beside the serializable scene document. */
export const skyMooringSpotLights: SpotLightDefinition[] = [];

// Гондола: размеры нужны и корпусу, и трапу, и балкону.
const CAR_FROM = 3.0;
const CAR_TO = 8.6;
const CAR_HALF = 1.2;
const CAR_FLOOR = 7.0;
const CAR_ROOF = 9.5;
const DOOR_FROM = 3.5;
const DOOR_TO = 4.9;
const DOOR_TOP = 9.06;

// --- Дирижабль -------------------------------------------------------------

function createAirship(): void {
  const ship = group("airship", "Moored airship over the west edgewood", "cloth", "linked");

  // === Подъёмное сердце: парящий фундамент внутри оболочки. Контактная
  // коробка накрывает весь баллон, поэтому полотнища, кили и подвеска
  // находят опору «зазор ноль». Объём занижен — это газ, а не земля.
  primitive(ship, "heart", "earth", "cylinder",
    // The gondola and nose fittings pull the intact centre of mass forward.
    // Keep the physical gas heart over that measured centre instead of
    // relying on runtime trim to conceal an authored imbalance.
    P(6.25, 0, AXIS_Y + 0.1), [2.6, 8.4, 2.6], "#e9dcb4", {
      rotation: HULL_AXIS,
      volume: 7,
      contactBoxes: [{ position: [0, 0, 0], size: [4.9, 15.6, 4.9] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      light: { color: "#ffcf92", distance: 15, intensity: 2.2 },
    });

  // === Оболочка: продольные полотнища прорезиненной ткани на пологой части
  // корпуса. Полосы идут без пошагового сдвига (сдвиг читается черепицей),
  // каждой панели — наклон по крутизне профиля, а хорда удлинена на
  // 1/cos(наклона), иначе между кольцами открываются щели.
  const GORE_FROM = 1.5;
  const GORE_TO = 13.3;
  const stations = 9;
  const stationStep = (GORE_TO - GORE_FROM) / stations;
  const gores = 12;
  for (let station = 0; station < stations; station += 1) {
    const a = GORE_FROM + (station + 0.5) * stationStep;
    const radius = hullRadius(a);
    const taper = Math.atan2(
      hullRadius(a + stationStep / 2) - hullRadius(a - stationStep / 2),
      stationStep,
    );
    const panelLength = stationStep / Math.cos(taper) + 0.14;
    const width = ((2 * Math.PI * radius) / gores) * 1.16;
    for (let gore = 0; gore < gores; gore += 1) {
      const phi = (gore / gores) * Math.PI * 2;
      // gore 3 и 9 — точный борт: там идёт тёмная бортовая полоса, по
      // которой набит номер. Низ пачкается копотью моторов и дорогой.
      const isSide = gore === 3 || gore === 9;
      const isBelly = Math.cos(phi) < -0.5;
      primitive(ship, `gore:${station}:${gore}`, "cloth", "panel",
        P(a, radius * Math.sin(phi), AXIS_Y + radius * Math.cos(phi)),
        [panelLength, 0.09, width],
        isSide
          ? HULL_STRIPE
          : isBelly
            ? SILVER_DIRTY
            : (station + gore) % 2 === 0 ? SILVER_A : SILVER_B, {
          rotation: orient(
            // Длина клина идёт вдоль корпуса, доворачиваясь по крутизне
            // профиля; толщина смотрит наружу по радиусу.
            [CA * Math.cos(taper) + radial(phi)[0] * Math.sin(taper),
              radial(phi)[1] * Math.sin(taper),
              SA * Math.cos(taper) + radial(phi)[2] * Math.sin(taper)],
            radial(phi),
          ),
          surface: isBelly ? damp : undefined,
        });
    }
  }

  // Ступенчатые обтекатели носа и хвоста: каждая ступень — обечайка по
  // местному радиусу профиля. Полотнищами эти концы крыть нельзя — там
  // профиль такой крутой, что плоские панели расходятся лепестками.
  // Ступени перекрываются по длине, чтобы между ними не было щелей.
  const caps: readonly (readonly [string, number, number])[] = [
    ["nose:0", 1.2, 0.86], ["nose:1", 0.66, 0.62],
    ["nose:2", 0.3, 0.46], ["nose:3", 0.06, 0.34],
    ["tail:0", 13.6, 0.92], ["tail:1", 14.26, 0.72],
  ];
  for (const [tag, a, length] of caps) {
    const diameter = Math.max(0.62, hullRadius(a) * 2 + 0.05);
    primitive(ship, `cap:${tag}`, "steel", "cylinder",
      P(a, 0, AXIS_Y), [diameter, length, diameter],
      tag.startsWith("nose") ? DURAL : "#898e91", {
        rotation: HULL_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [diameter, length + 0.1, diameter] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }

  // Короткий корабельный швартовый конус входит в стакан мачты.
  primitive(ship, "nose:cone", "steel", "cylinder",
    P(-0.72, 0, AXIS_Y), [0.42, 1.85, 0.42], IRON, {
      rotation: HULL_AXIS,
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 1.85, 0.5] }],
      bearsLoad: false,
      sideAttachmentReach: 0.5,
    });

  // Белый носовой огонь вынесен над швартовым конусом: сам конус входит в
  // стакан мачты, поэтому световой узел не должен занимать его ось.
  primitive(ship, "nav-light:nose:mount", "steel", "steelSheet",
    P(-0.04, 0, AXIS_Y + 0.42), [0.18, 0.5, 0.5], IRON, {
      rotation: ALONG,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.22,
    });
  primitive(ship, "nav-light:nose", "glass", "glassPane",
    P(-0.23, 0, AXIS_Y + 0.42), [0.2, 0.34, 0.34], "#f4f1e2", {
      rotation: ALONG,
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.08,
      light: {
        position: [-0.27, 0, 0],
        followsGroup: true,
        color: "#fff6dc",
        distance: 18,
        intensity: 3.4,
        poolPriority: 6,
        beacon: {
          physicalDiameter: 0.75,
          minScreenDiameter: 5,
          maxWorldDiameter: 1.5,
          dayOpacity: 0.64,
          nightOpacity: 0.95,
        },
      },
    });

  // Посадочный прожектор сидит под носовой оболочкой и смотрит вдоль оси
  // швартовки вниз. Он слушает только общие departure/approach события.
  {
    const fixtureA = 1.25;
    const fixture = P(fixtureA, 0, AXIS_Y - hullRadius(fixtureA) - 0.03);
    const downAngle = 0.4;
    const direction: SceneVector3 = [
      -CA * Math.cos(downAngle),
      -Math.sin(downAngle),
      -SA * Math.cos(downAngle),
    ];
    const along = (distance: number): SceneVector3 => [
      fixture[0] + direction[0] * distance,
      fixture[1] + direction[1] * distance,
      fixture[2] + direction[2] * distance,
    ];
    primitive(ship, "mooring-light:mount", "steel", "steelSheet",
      fixture, [0.9, 0.14, 0.62], IRON, {
        rotation: ALONG,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.14,
      });
    primitive(ship, "mooring-light:housing", "steel", "steelSheet",
      along(0.28), [0.62, 0.32, 0.44], DURAL, {
        rotation: orient(direction, [0, 1, 0]),
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.14,
      });
    const lensDepth = 0.13;
    const lensPosition = along(0.62);
    primitive(ship, "mooring-light", "glass", "glassPane",
      lensPosition, [lensDepth, 0.28, 0.34], mooringSignalColor, {
        rotation: orient(direction, [0, 1, 0]),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.1,
      });
    skyMooringSpotLights.push({
      id: `${AIRSHIP_CLUSTER_ID}:mooring-light:piece`,
      position: [
        lensPosition[0] + direction[0] * (lensDepth / 2 + 0.015),
        lensPosition[1] + direction[1] * (lensDepth / 2 + 0.015),
        lensPosition[2] + direction[2] * (lensDepth / 2 + 0.015),
      ],
      direction,
      carrierClusterId: AIRSHIP_CLUSTER_ID,
      color: "#ffe6b5",
      distance: 72,
      intensity: 620,
      angle: 0.3,
      penumbra: 0.48,
      decay: 1.7,
      dayIntensityFactor: 1,
      eventLighting: mooringManeuverLighting,
      transition: { fadeInSeconds: 1.8, fadeOutSeconds: 1.2 },
      visibleBeam: {
        opacity: 0.16,
        sourceRadius: 0.14,
        length: 62,
        attenuation: 56,
        anglePower: 6,
      },
      fixtureGlow: {
        color: mooringSignalColor,
        intensity: 7.2,
        halo: {
          physicalDiameter: 0.58,
          minScreenDiameter: 4.5,
          maxWorldDiameter: 1.25,
          dayOpacity: 0.72,
          nightOpacity: 0.92,
        },
      },
    });
  }

  // Хвостовой шпиль и белый кормовой габаритный огонь на нём.
  primitive(ship, "tail:spike", "steel", "cylinder",
    P(14.85, 0, AXIS_Y), [0.16, 0.85, 0.16], DURAL, {
      rotation: HULL_AXIS,
      contactBoxes: [{ position: [0, 0, 0], size: [0.24, 0.95, 0.24] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
    });
  primitive(ship, "nav-light:tail:mount", "steel", "steelSheet",
    P(14.98, 0, AXIS_Y), [0.18, 0.44, 0.44], DURAL, {
      rotation: ALONG,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.22,
    });
  primitive(ship, "nav-light:tail", "glass", "glassPane",
    P(15.24, 0, AXIS_Y), [0.2, 0.34, 0.34], "#f4f1e2", {
      rotation: ALONG,
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.08,
      light: {
        position: [0.27, 0, 0],
        followsGroup: true,
        color: "#fff6dc",
        distance: 18,
        intensity: 3.4,
        poolPriority: 6,
        beacon: {
          physicalDiameter: 0.75,
          minScreenDiameter: 5,
          maxWorldDiameter: 1.5,
          dayOpacity: 0.64,
          nightOpacity: 0.95,
        },
      },
    });

  // === Крестообразное оперение. Поворот на phi уже разворачивает полотно
  // правильно: локальный y становится размахом наружу, локальный z —
  // толщиной. Рулевая плоскость идёт по той же радиальной полосе со щелью
  // по линии навески, иначе читается отвалившейся пластиной.
  const finRootA = 11.2;
  const finTipA = 14.1;
  for (const [finIndex, phi] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
    const vertical = finIndex === 0 || finIndex === 2;
    const rootRadius = hullRadius((finRootA + finTipA) / 2);
    const span = 1.8;
    const mid = rootRadius + span / 2 - 0.12;
    primitive(ship, `fin:${finIndex}`, "steel", "panel",
      P((finRootA + finTipA) / 2, Math.sin(phi) * mid, AXIS_Y + Math.cos(phi) * mid),
      [finTipA - finRootA, span, 0.1],
      finIndex % 2 === 0 ? "#a9aeab" : "#a2a7a4", {
        // Длина по корпусу, размах — по радиусу наружу.
        rotation: orient(AXIS_FORE, radial(phi)),
        contactBoxes: [{ position: [0, 0, 0], size: [finTipA - finRootA, span, 0.16] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
      });
    primitive(ship, `fin:${finIndex}:rudder`, "steel", "panel",
      P(finTipA + 0.52, Math.sin(phi) * mid, AXIS_Y + Math.cos(phi) * mid),
      [0.94, span * 0.94, 0.09], "#9ea3a0", {
        rotation: orient(
          // Руль отклонён на пару градусов от оси — живая деталь.
          [AXIS_FORE[0] + AXIS_EAST[0] * (vertical ? 0.1 : 0),
            vertical ? 0 : 0.1,
            AXIS_FORE[2] + AXIS_EAST[2] * (vertical ? 0.1 : 0)],
          radial(phi),
        ),
        contactBoxes: [{ position: [0, 0, 0], size: [1.0, span * 0.94, 0.16] }],
        actuator: {
          id: "town-airship:rudder",
          commandChannel: "rudder",
          contribution: vertical ? 1 : 0.35,
        },
        bearsLoad: false,
        sideAttachmentReach: 0.6,
      });
  }

  // Опознавательный знак: одна широкая косая полоса поперёк верхнего и
  // нижнего килей. Ломаный шеврон из отдельных брусков читался зигзагом —
  // на киле такого размера работает только простая крупная форма.
  for (const [markIndex, phi] of [0, Math.PI].entries()) {
    const rootRadius = hullRadius(12.65);
    const mid = rootRadius + 0.78;
    primitive(ship, `fin:mark:${markIndex}`, "steel", "panel",
      P(12.6, Math.sin(phi) * mid, AXIS_Y + Math.cos(phi) * mid),
      [0.44, 1.5, 0.14], MARK_RED, {
        rotation: orient(
          [AXIS_FORE[0] * Math.cos(0.42) + radial(phi)[0] * Math.sin(0.42),
            radial(phi)[1] * Math.sin(0.42),
            AXIS_FORE[2] * Math.cos(0.42) + radial(phi)[2] * Math.sin(0.42)],
          radial(phi),
        ),
        bearsLoad: false,
        sideAttachmentReach: 0.45,
      });
  }

  // === Бортовой номер «07» по тёмной полосе. Знаки набраны отрезками в
  // локальной сетке (u вдоль чтения, v вверх). Наблюдатель с восточного
  // борта смотрит на запад, и его «вправо» — это юг, то есть растущее a;
  // с западного борта наоборот. Значит зеркалить надо и порядок знаков, и
  // сами глифы, иначе номер читается зеркально.
  const glyphs: Readonly<Record<string, readonly (readonly [number, number, number, number])[]>> = {
    // [u, v, ширина, высота]; u в пределах 0..0.66, v в пределах -0.5..0.5
    "0": [
      [0.33, 0.44, 0.62, 0.13], [0.02, 0, 0.13, 0.9],
      [0.64, 0, 0.13, 0.9], [0.33, -0.44, 0.62, 0.13],
    ],
    "7": [[0.33, 0.44, 0.66, 0.13], [0.5, -0.06, 0.13, 0.8]],
  };
  const hullNumber = "07";
  for (const side of [-1, 1] as const) {
    const readDirection = side > 0 ? 1 : -1;
    for (const [glyphIndex, glyph] of [...hullNumber].entries()) {
      const glyphA = 7.0 + readDirection * (glyphIndex - 0.5) * 1.05;
      for (const [segment, [u, v, w, h]] of (glyphs[glyph] ?? []).entries()) {
        const a = glyphA + readDirection * (u - 0.33);
        const radius = hullRadius(a) + 0.16;
        primitive(ship, `number:${side}:${glyphIndex}:${segment}`, "cloth", "panel",
          P(a, side * radius, AXIS_Y + v * 0.95), [w, h * 0.95, 0.06], "#eceee9", {
            rotation: [0, -HEADING, 0],
            bearsLoad: false,
            sideAttachmentReach: 0.35,
          });
      }
    }
  }

  // === Подвеска гондолы: четыре наружные стойки уходят в оболочку. Им нужен
  // честный bearingArea — иначе решатель раздавит трубки весом вагона.
  for (const a of [CAR_FROM + 0.55, CAR_TO - 0.55]) {
    for (const side of [-1, 1] as const) {
      primitive(ship, `hanger:${a}:${side}`, "steel", "cylinder",
        P(a, side * (CAR_HALF + 0.15), 9.55), [0.11, 3.1, 0.11], DURAL, {
          contactBoxes: [{ position: [0, 0, 0], size: [0.16, 3.1, 0.16] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.42,
          bearingArea: 0.62,
        });
      strut(ship, `hanger:brace:${a}:${side}`, "steel",
        P(a, side * (CAR_HALF + 0.14), 8.5),
        P(a + (a < 6 ? -1.0 : 1.0), side * 0.8, 10.9),
        0.05, "#7f8488", {
          bearsLoad: false,
          sideAttachmentReach: 0.5,
        });
    }
  }

  // === Гондола-вагон. Стекло больше не наклеено поверх сплошной стенки:
  // каждый борт собран нижним и верхним поясами с настоящими простенками.
  // Между ними остаются физические оконные ниши на всю толщину борта.
  const WINDOW_Y = 8.62;
  const WINDOW_WIDTH = 0.62;
  const WINDOW_HEIGHT = 0.66;
  const windowBottom = WINDOW_Y - WINDOW_HEIGHT / 2;
  const windowTop = WINDOW_Y + WINDOW_HEIGHT / 2;
  const wallPanel = (
    tag: string,
    side: -1 | 1,
    a1: number,
    a2: number,
    y1: number,
    y2: number,
  ): void => {
    if (a2 - a1 < 0.04 || y2 - y1 < 0.04) {
      return;
    }
    primitive(ship, `car:wall:${side < 0 ? "west" : "east"}:${tag}`, "steel", "panel",
      P((a1 + a2) / 2, side * CAR_HALF, (y1 + y2) / 2),
      [a2 - a1, y2 - y1, 0.1], side < 0 ? "#8a9096" : "#868c92", {
        rotation: ALONG,
        contactBoxes: [{ position: [0, 0, 0], size: [a2 - a1, y2 - y1, 0.16] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        surface: damp,
      });
  };

  // Глухая носовая четверть городского борта заканчивается у дверного
  // проёма. Кормовая часть и весь противоположный борт — оконные ленты.
  wallPanel("fore", 1, CAR_FROM, DOOR_FROM, CAR_FLOOR, CAR_ROOF);
  const windowRuns = [
    { side: -1 as const, from: CAR_FROM, to: CAR_TO, firstA: CAR_FROM + 0.8, count: 5 },
    { side: 1 as const, from: DOOR_TO, to: CAR_TO, firstA: DOOR_TO + 0.62, count: 4 },
  ];
  for (const { side, from, to, firstA, count } of windowRuns) {
    wallPanel("lower", side, from, to, CAR_FLOOR, windowBottom);
    wallPanel("upper", side, from, to, windowTop, CAR_ROOF);
    const centers = Array.from({ length: count }, (_, index) => firstA + index * 0.92);
    let cursor = from;
    centers.forEach((a, windowIndex) => {
      wallPanel(`post:${windowIndex}`, side, cursor, a - WINDOW_WIDTH / 2, windowBottom, windowTop);
      cursor = a + WINDOW_WIDTH / 2;
      primitive(ship, `car:window:${side}:${windowIndex}`, "glass", "glassPane",
        P(a, side * CAR_HALF, WINDOW_Y), [WINDOW_WIDTH, WINDOW_HEIGHT, 0.06], "#9fb7bd", {
          rotation: ALONG,
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
      for (const [frameTag, y] of [["sill", windowBottom], ["lintel", windowTop]] as const) {
        primitive(ship, `car:sash:${side}:${windowIndex}:${frameTag}`, "steel", "plank",
          P(a, side * (CAR_HALF + 0.055), y), [WINDOW_WIDTH + 0.08, 0.07, 0.06], DURAL, {
            rotation: ALONG,
            bearsLoad: false,
            sideAttachmentReach: 0.3,
          });
      }
    });
    wallPanel("post:end", side, cursor, to, windowBottom, windowTop);
    // Поясной профиль вдоль борта. На восточном борту он РАЗРЕЗАН дверным
    // проёмом: цельная полоса шла на высоте 0.6 м над порогом и перекрывала
    // вход по нижней трети — в такую дверь не войти.
    const beltRuns: readonly (readonly [string, number, number])[] = side > 0
      ? [["fore", CAR_FROM + 0.1, DOOR_FROM], ["aft", DOOR_TO, CAR_TO - 0.1]]
      : [["full", CAR_FROM + 0.1, CAR_TO - 0.1]];
    for (const [beltTag, a1, a2] of beltRuns) {
      primitive(ship, `car:belt:${side}:${beltTag}`, "steel", "plank",
        P((a1 + a2) / 2, side * (CAR_HALF + 0.05), 7.72),
        [a2 - a1, 0.1, 0.06], DURAL, {
          rotation: ALONG,
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
    }
  }
  primitive(ship, "car:roof", "steel", "panel",
    P((CAR_FROM + CAR_TO) / 2, 0, CAR_ROOF - 0.02),
    [CAR_TO - CAR_FROM + 0.2, 0.16, CAR_HALF * 2 + 0.2], "#7c8288", {
      rotation: ALONG,
      contactBoxes: [{
        position: [0, 0, 0],
        size: [CAR_TO - CAR_FROM + 0.2, 0.16, CAR_HALF * 2 + 0.2],
      }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "car:floor", "wood", "plank",
    P((CAR_FROM + CAR_TO) / 2, 0, CAR_FLOOR + 0.09),
    [CAR_TO - CAR_FROM, 0.18, CAR_HALF * 2], "#6a5843", {
      rotation: ALONG,
      contactBoxes: [{
        position: [0, 0, 0],
        size: [CAR_TO - CAR_FROM, 0.18, CAR_HALF * 2],
      }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  // Носовая рубка и кормовая переборка заходят на борта внахлёст.
  primitive(ship, "car:stern", "steel", "panel",
    P(CAR_TO - 0.04, 0, (CAR_FLOOR + CAR_ROOF) / 2),
    [0.12, CAR_ROOF - CAR_FLOOR, CAR_HALF * 2 + 0.16], "#828890", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [0.18, CAR_ROOF - CAR_FLOOR, CAR_HALF * 2 + 0.16] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "car:bow", "steel", "panel",
    P(CAR_FROM + 0.04, 0, 7.62),
    [0.12, 1.3, CAR_HALF * 2 + 0.16], "#828890", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [0.18, 1.3, CAR_HALF * 2 + 0.16] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "car:screen", "glass", "glassPane",
    P(CAR_FROM - 0.14, 0, 8.72), [0.52, 1.4, CAR_HALF * 2], "#a6bcc1", {
      rotation: orient(
        [AXIS_FORE[0] * Math.cos(0.4), -Math.sin(0.4), AXIS_FORE[2] * Math.cos(0.4)],
        [AXIS_FORE[0] * Math.sin(0.4), Math.cos(0.4), AXIS_FORE[2] * Math.sin(0.4)],
      ),
      contactBoxes: [{ position: [0, 0, 0], size: [0.62, 1.55, CAR_HALF * 2] }],
      bearsLoad: false,
      sideAttachmentReach: 0.45,
    });
  primitive(ship, "car:screen:frame", "steel", "plank",
    P(CAR_FROM - 0.28, 0, 9.38), [0.18, 0.18, CAR_HALF * 2 + 0.12], DURAL, {
      rotation: ALONG,
      bearsLoad: false,
      sideAttachmentReach: 0.45,
    });

  // === Дверной проём восточного борта: порог, косяки, перемычка и одна
  // прислонно-сдвижная створка. По событию она сначала выходит наружу, затем
  // уезжает вдоль борта тем же общим механизмом, что дверь небесного поезда.
  primitive(ship, "car:door:sill", "steel", "plank",
    P((DOOR_FROM + DOOR_TO) / 2, CAR_HALF, CAR_FLOOR + 0.09),
    [DOOR_TO - DOOR_FROM + 0.2, 0.18, 0.24], DURAL, {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [DOOR_TO - DOOR_FROM + 0.2, 0.18, 0.24] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  for (const [jambTag, a] of [["fore", DOOR_FROM], ["aft", DOOR_TO]] as const) {
    primitive(ship, `car:door:jamb:${jambTag}`, "steel", "plank",
      P(a, CAR_HALF, (CAR_FLOOR + DOOR_TOP) / 2 + 0.1),
      [0.14, DOOR_TOP - CAR_FLOOR, 0.2], DURAL, {
        rotation: ALONG,
        contactBoxes: [{ position: [0, 0, 0], size: [0.14, DOOR_TOP - CAR_FLOOR, 0.2] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
  }
  primitive(ship, "car:door:lintel", "steel", "plank",
    P((DOOR_FROM + DOOR_TO) / 2, CAR_HALF, DOOR_TOP + 0.12),
    [DOOR_TO - DOOR_FROM + 0.2, 0.2, 0.2], DURAL, {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [DOOR_TO - DOOR_FROM + 0.2, 0.2, 0.2] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  {
    // Полотно и ручка — куски ОДНОЙ створки: система группирует их по общему
    // префиксу до ":board:N". Поля hinge здесь являются локальным базисом
    // механизма: direction идёт вдоль борта, normal смотрит наружу.
    const leafA = (DOOR_FROM + DOOR_TO) / 2 + 0.04;
    const leafB = CAR_HALF + 0.09;
    const leafY = 8.08;
    const hingeA = DOOR_FROM + 0.05;
    const hingeB = CAR_HALF + 0.11;
    const localHinge = (a: number, b: number, y: number) => ({
      pivot: [hingeA - a, leafY - y, hingeB - b] as SceneVector3,
      direction: [1, 0, 0] as SceneVector3,
      normal: [0, 0, 1] as SceneVector3,
    });
    primitive(ship, "car:door:board:0", "steel", "steelSheet",
      P(leafA, leafB, leafY),
      [DOOR_TO - DOOR_FROM - 0.12, DOOR_TOP - CAR_FLOOR - 0.14, 0.08], "#6f767c", {
        rotation: ALONG,
        contactBoxes: [{
          position: [0, 0, 0],
          size: [DOOR_TO - DOOR_FROM - 0.12, DOOR_TOP - CAR_FLOOR - 0.14, 0.12],
        }],
        hinge: localHinge(leafA, leafB, leafY),
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    // Вертикальная тяга-ручка на створке.
    const handleA = DOOR_TO - 0.28;
    const handleB = CAR_HALF + 0.19;
    primitive(ship, "car:door:board:1", "steel", "cylinder",
      P(handleA, handleB, 8.0), [0.06, 0.34, 0.06], IRON, {
        rotation: ALONG,
        hinge: localHinge(handleA, handleB, 8.0),
        bearsLoad: false,
        sideAttachmentReach: 0.3,
        contactBoxes: [{ position: [0, 0, 0], size: [0.12, 0.36, 0.12] }],
      });
  }

  // Посадочная площадка перед дверью принадлежит МАЧТЕ. Кабина только
  // подходит к её внутренней кромке: после отхода площадка, подкосы и
  // перила целиком остаются у трапа, а вместе с судном уходит одна дверь.
  {
    const berth = group("mast", "Riveted mooring mast at the world's edge", "steel", "stack");
    const balconyA = (DOOR_FROM + DOOR_TO) / 2;
    // Площадка доходит до подвижного порога, но не несёт его конструктивно:
    // игрок проходит в дверь без щели, а корабль свободно отходит от причала.
    const balconyB = CAR_HALF + 1.65;
    const balconyHalf = 1.45;
    const landingInnerB = CAR_HALF + 0.14;
    const landingOuterB = balconyB + 0.85;
    const landingDeckB = (landingInnerB + landingOuterB) / 2;
    const landingWidth = landingOuterB - landingInnerB;
    primitive(berth, "landing", "steel", "steelSheet",
      P(balconyA, landingDeckB, CAR_FLOOR + 0.04),
      [balconyHalf * 2, 0.14, landingWidth], "#787569", {
        rotation: ALONG,
        contactBoxes: [{
          position: [0, 0, 0],
          size: [balconyHalf * 2, 0.14, landingWidth],
        }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.3,
        contactBearingOrder: true,
        // A player can stand on the collider, but structurally this deck is
        // never allowed to prop up the parked airship beside it.
        bearsLoad: false,
        surface: damp,
      });
    // Площадка имеет собственные ноги на земле — это буквально часть
    // причала, а не консоль, которая тайком ищет опору в кабине или трапе.
    for (const [legIndex, a] of [balconyA - 1.05, balconyA + 1.05].entries()) {
      primitive(berth, `landing:footing:${legIndex}`, "concrete", "cinderBlock",
        P(a, landingOuterB - 0.3, 0.16), [0.72, 0.36, 0.72], "#85837c", {
          rotation: ALONG,
          contactBoxes: [{ position: [0, 0, 0], size: [0.72, 0.36, 0.72] }],
          carriesAttachments: true,
          surface: damp,
        });
      primitive(berth, `landing:leg:${legIndex}`, "steel", "cylinder",
        P(a, landingOuterB - 0.3, 3.58), [0.16, 6.68, 0.16], "#68655e", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.22, 6.68, 0.22] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.45,
          bearingArea: 0.8,
          surface: damp,
        });
    }
    for (const end of [-1, 1] as const) {
      // Короткие распределяющие подкосы расходятся от конца уже
      // раскреплённого трапа под оба конца площадки. Они не пересекают ни
      // гондолу, ни лес и не ищут опору в стенке кабины.
      strut(berth, `landing:brace:${end}`, "steel",
        P(CAR_FROM - 0.05, CAR_HALF + 0.95, CAR_FLOOR - 0.02),
        P(balconyA + end * (balconyHalf - 0.2), landingOuterB - 0.3, CAR_FLOOR - 0.04),
        0.09, "#6a675f", {
          bearsLoad: false,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.35,
          bearingArea: 0.6,
        });
      // Стойки стоят прямо над собственными ногами площадки. Поэтому
      // ограждение остаётся частью причала даже после ухода корабля.
      const postA = balconyA + end * 1.05;
      const postB = landingOuterB - 0.3;
      primitive(berth, `landing:post:${end}:0`, "steel", "cylinder",
        P(postA, postB, CAR_FLOOR + 0.63), [0.07, 1.1, 0.07], "#6c6961", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.1, 1.1, 0.1] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        });
      addMastLamp(
        berth,
        `landing:lamp:${end}`,
        P(postA, postB, CAR_FLOOR + 1.5),
      );
      // Торцевое ограждение — только на дальнем конце: на ближний приходит
      // трап, и поручень там перекрывал вход.
      if (end < 0) {
        continue;
      }
      strut(berth, `landing:rail:end:${end}`, "steel",
        P(postA, landingInnerB + 0.08, CAR_FLOOR + 1.12),
        P(postA, postB, CAR_FLOOR + 1.12),
        0.05, "#6c6961", {
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
        });
    }
    // Внешний поручень между двумя стойками площадки.
    strut(berth, "landing:rail", "steel",
      P(balconyA - 1.05, landingOuterB - 0.3, CAR_FLOOR + 1.12),
      P(balconyA + 1.05, landingOuterB - 0.3, CAR_FLOOR + 1.12),
      0.05, "#6c6961", {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }

  // Бортовая табличка у двери.
  primitive(ship, "car:plate", "steel", "plank",
    P(CAR_TO - 0.75, CAR_HALF + 0.06, 7.4), [0.86, 0.3, 0.05], "#cfd2ce", {
      rotation: ALONG,
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    });
  primitive(ship, "car:plate:band", "steel", "plank",
    P(CAR_TO - 0.75, CAR_HALF + 0.09, 7.4), [0.86, 0.09, 0.04], MARK_RED, {
      rotation: ALONG,
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    });

  // Внутри рубки: штурвал высоты, приборная доска, лавки, рундук и плафон.
  primitive(ship, "car:helm:column", "steel", "cylinder",
    P(CAR_FROM + 0.85, -0.5, 7.66), [0.09, 0.98, 0.09], IRON, {
      contactBoxes: [{ position: [0, 0, 0], size: [0.12, 0.98, 0.12] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
    });
  primitive(ship, "car:helm:wheel", "wood", "cylinder",
    P(CAR_FROM + 0.85, -0.5, 8.16), [0.58, 0.07, 0.58], "#6b5136", {
      rotation: HULL_AXIS,
      contactBoxes: [{ position: [0, 0, 0], size: [0.58, 0.58, 0.1] }],
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });
  // Пространство сразу за дверью оставлено пустым на полную ширину прохода.
  // Старый стол и три маленьких стеклянных цилиндра на нём читались чашками
  // и физически заставляли пассажира протискиваться при входе.
  for (const [benchIndex, side] of [-1, 1].entries()) {
    primitive(ship, `car:bench:${benchIndex}`, "wood", "plank",
      P(CAR_TO - 1.9, side * 0.72, 7.58), [1.9, 0.11, 0.55], "#6b5941", {
        rotation: ALONG,
        contactBoxes: [{ position: [0, 0, 0], size: [1.9, 0.11, 0.55] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      });
  }
  primitive(ship, "car:locker", "wood", "plank",
    P(CAR_TO - 0.6, 0, 7.62), [0.72, 0.94, 1.15], "#5d4b38", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [0.72, 0.94, 1.15] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.35,
    });
  primitive(ship, "car:lamp", "glass", "glassPane",
    P((CAR_FROM + CAR_TO) / 2, 0, CAR_ROOF - 0.14), [0.32, 0.24, 0.32], "#f6e6bb", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      light: { color: "#ffd79b", distance: 11, intensity: 2.6 },
    });

  // === Моторные гондолы на выносных фермах. Вынос 4.3 м выбран из круга
  // винта: радиус 1.4 м плюс запас должен пройти мимо оболочки (радиус
  // 2.35 м), иначе лопасти рубили бы обшивку.
  const engineA = 7.0;
  const engineY = 11.4;
  const engineB = 4.3;
  for (const side of [-1, 1] as const) {
    const b = side * engineB;
    primitive(ship, `engine:${side}:body`, "steel", "cylinder",
      P(engineA, b, engineY), [0.95, 2.4, 0.95], "#7d8388", {
        rotation: HULL_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [1.05, 2.5, 1.05] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.7,
        actuator: {
          id: `town-airship:propulsor:${side}`,
          commandChannel: `throttle:${side === -1 ? 0 : 1}`,
          required: true,
        },
      });
    primitive(ship, `engine:${side}:cowl`, "steel", "cylinder",
      P(engineA - 1.32, b, engineY), [0.74, 0.52, 0.74], DURAL, {
        rotation: HULL_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [0.84, 0.62, 0.84] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
    primitive(ship, `engine:${side}:hub`, "steel", "cylinder",
      P(engineA - 1.64, b, engineY), [0.3, 0.4, 0.3], IRON, {
        rotation: HULL_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [0.36, 0.46, 0.36] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.35,
      });
    for (const blade of [-1, 1] as const) {
      primitive(ship, `engine:${side}:blade:${blade}`, "wood", "panel",
        P(engineA - 1.74, b, engineY + blade * 0.86), [0.12, 1.62, 0.4], "#6d5334", {
          // Толщина лопасти по оси вала, повёрнута на шаг вокруг размаха.
          rotation: orient(
            [AXIS_FORE[0] * Math.cos(blade * 0.26) + AXIS_EAST[0] * Math.sin(blade * 0.26),
              0,
              AXIS_FORE[2] * Math.cos(blade * 0.26) + AXIS_EAST[2] * Math.sin(blade * 0.26)],
            [0, 1, 0],
          ),
          contactBoxes: [{ position: [0, 0, 0], size: [0.34, 1.72, 0.46] }],
          actuator: {
            id: `town-airship:propulsor:${side}`,
            commandChannel: `throttle:${side === -1 ? 0 : 1}`,
          },
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
    // Крыло выноса: несущий обтекатель от борта оболочки к мотору, плюс
    // тяги по кромкам. Без него мотор на таком выносе висел бы ни на чём —
    // и не читался бы вынесенным.
    primitive(ship, `engine:${side}:wing`, "steel", "panel",
      P(engineA - 0.05, side * ((engineB + 1.9) / 2), 12.0), [1.5, 0.14, engineB - 1.9], "#83898d", {
        rotation: orient(AXIS_FORE, [0, 1, 0]),
        contactBoxes: [{ position: [0, 0, 0], size: [1.5, 0.5, engineB - 1.9] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        bearingArea: 0.8,
      });
    strut(ship, `engine:${side}:pylon:upper-fore`, "steel",
      P(engineA - 0.7, b, engineY + 0.5), P(engineA - 0.6, side * 1.55, 12.55),
      0.09, DURAL, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.5,
      });
    strut(ship, `engine:${side}:pylon:upper-aft`, "steel",
      P(engineA + 0.7, b, engineY + 0.5), P(engineA + 0.6, side * 1.55, 12.55),
      0.09, DURAL, {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.5,
      });
    strut(ship, `engine:${side}:pylon:lower`, "steel",
      P(engineA, b, engineY - 0.52), P(engineA + 0.2, side * 1.7, 10.4),
      0.08, "#7f8488", {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        bearingArea: 0.4,
      });
    strut(ship, `engine:${side}:pylon:aft-stay`, "steel",
      P(engineA + 1.05, b, engineY - 0.15), P(engineA + 2.9, side * 1.25, 11.5),
      0.05, "#7f8488", { bearsLoad: false, sideAttachmentReach: 0.5 });
    primitive(ship, `engine:${side}:exhaust`, "steel", "cylinder",
      P(engineA + 0.5, b + side * 0.5, engineY + 0.2), [0.14, 0.72, 0.14], "#3f4346", {
        rotation: rodRotation(0.2 * CA, 0.9, 0.2 * SA),
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });

    // Бортовой аэронавигационный огонь сидит на внешней щеке двигателя,
    // как у летающего поезда. Правый борт (-b) зелёный, левый (+b) красный.
    const lensTone = side < 0 ? "#7fe6a0" : "#f08a80";
    primitive(ship, `nav-light:${side}:mount`, "steel", "steelSheet",
      P(engineA, b + side * 0.46, engineY), [0.48, 0.48, 0.08], "#3f4a4c", {
        rotation: ALONG,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
      });
    primitive(ship, `nav-light:${side}`, "glass", "glassPane",
      P(engineA, b + side * 0.52, engineY), [0.34, 0.34, 0.1], lensTone, {
        rotation: ALONG,
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.08,
        light: {
          position: [0, 0, side * 0.14],
          followsGroup: true,
          color: side < 0 ? "#6bff9c" : "#ff6f62",
          distance: 24,
          intensity: 5,
          poolPriority: 8,
          beacon: {
            physicalDiameter: 0.9,
            minScreenDiameter: 6,
            maxWorldDiameter: 1.8,
            dayOpacity: 0.72,
            nightOpacity: 1,
          },
        },
      });
  }

  // === Дифферентовочные тележки в килевом коридоре под газовым баллоном.
  // Это единственный орган корабля, создающий момент по крену и тангажу: он
  // не прикладывает силу, а возит настоящий свинец, и живой центр масс
  // уезжает вместе с ним. Снаружи не видно, но кусок настоящий: пробьёт
  // оболочку взрывом — тележку унесёт вместе с балластом и управлять
  // развесовкой станет нечем.
  //
  // Обе стоят над измеренным центром масс целой машины (a = 6.17), поэтому
  // сами по себе они его не сдвигают: рельс симметричен, груз в нуле.
  // У этой машины короткое маятниковое плечо и моторы на дальних выносах —
  // трима намеренно не хватает на потерю целой мотогондолы.
  const TRIM_A = 6.17;
  for (const [axis, y, travel, mass, along] of [
    // Самый лёгкий корпус из четырёх: установка намеренно скромная, иначе
    // она заметно меняет лётные запасы самой машины.
    ["pitch", 10.55, 3.0, 1.4, true],
    ["roll", 11.15, 1.25, 3.0, false],
  ] as const) {
    primitive(ship, `trim:${axis}:rail`, "steel", "cylinder",
      P(TRIM_A, 0, y), [0.1, travel * 2 + 0.6, 0.1], "#7d8489", {
        rotation: along ? HULL_AXIS : ACROSS_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [0.16, travel * 2 + 0.6, 0.16] }],
        // Привод и есть обязательное ядро органа: рельс перебит — тележка
        // больше никуда не едет, даже если сама цела.
        actuator: {
          id: `town-airship:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    // Свинец в стальном коробе: объём задан отдельно, иначе коробка такого
    // размера весила бы как пустая жестянка.
    // The car hangs under its rail on a short yoke, the way a real trolley
    // does, so neither piece grows through the other.
    primitive(ship, `trim:${axis}:car`, "steel", "steelSheet",
      P(TRIM_A, 0, y - 0.28), along ? [0.62, 0.34, 0.5] : [0.5, 0.34, 0.74], "#5f6469", {
        rotation: ALONG,
        volume: mass / 3.6,
        contactBoxes: [{ position: [0, 0, 0], size: [0.68, 0.4, 0.8] }],
        actuator: {
          id: `town-airship:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      });
  }
}

// --- Причальная мачта -------------------------------------------------------

const DECK_Y = 6.9;
const DECK_A = 1.45;
const DECK_B = 1.9;
/**
 * Лестничная башня вынесена ЗА габарит фермы (её ноги не шире 1.1 м) и
 * стоит на городской, восточной стороне. Верхний марш приходит на площадку
 * с ТОРЦА, а не подныривает под неё — иначе на последних ступенях бьёшься
 * головой о настил.
 */
const STAIR_INNER_B = 3.5;
const STAIR_OUTER_B = 4.9;
/** Полезная ширина марша: капсула игрока 0.72 м, нужен запас с обеих сторон. */
const STAIR_WIDTH = 1.32;
const LOBE_B_FROM = 1.9;
const LOBE_B_TO = 4.2;

/** One physical warm fixture whose electrical state follows mast capture. */
function addMastLamp(
  mast: MutableGroup,
  id: string,
  lensPosition: SceneVector3,
): void {
  primitive(mast, `${id}:mount`, "steel", "steelSheet",
    [lensPosition[0], lensPosition[1] - 0.22, lensPosition[2]],
    [0.18, 0.22, 0.18], IRON, {
      carriesAttachments: false,
      sideAttachmentReach: 0.35,
    });
  primitive(mast, `${id}:lens`, "glass", "glassPane",
    lensPosition, [0.3, 0.34, 0.3], "#f4e4bd", {
      bearsLoad: false,
      sideAttachmentReach: 0.35,
      light: {
        color: "#ffe0ae",
        distance: 13,
        intensity: 2.8,
        dayIntensityFactor: 0.35,
        poolPriority: 5,
        eventLighting: mastDockLighting,
        transition: { fadeInSeconds: 0.7, fadeOutSeconds: 1.1 },
      },
    });
}

function createMooringMast(): void {
  const mast = group("mast", "Riveted mooring mast at the world's edge", "steel", "stack");
  const baseHalf = 1.1;
  const topHalf = 0.45;
  // Ферма обрывается заметно ниже корпуса: у стали допустимый зазор опоры
  // 1.1 м, и носовой конус «садится» на всё, что окажется под ним.
  const MAST_TOP = 10.5;
  const tiers = 4;
  const tierHeight = MAST_TOP / tiers;
  const legHalf = (t: number) => baseHalf + (topHalf - baseHalf) * (t / MAST_TOP);
  const corners: readonly (readonly [number, number])[] = [
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (const [cornerIndex, [ca, cb]] of corners.entries()) {
    primitive(mast, `footing:${cornerIndex}`, "concrete", "cinderBlock",
      P(MAST_A + ca * baseHalf, cb * baseHalf, 0.16), [0.86, 0.36, 0.86], "#8d8b83", {
        rotation: ALONG,
        contactBoxes: [{ position: [0, 0, 0], size: [0.86, 0.36, 0.86] }],
        carriesAttachments: true,
        surface: damp,
      });
  }

  for (const [cornerIndex, [ca, cb]] of corners.entries()) {
    for (let tier = 0; tier < tiers; tier += 1) {
      const y0 = tier * tierHeight;
      const y1 = y0 + tierHeight;
      const h0 = legHalf(y0);
      const h1 = legHalf(y1);
      strut(mast, `leg:${cornerIndex}:${tier}`, "steel",
        P(MAST_A + ca * h0, cb * h0, y0 + 0.28),
        P(MAST_A + ca * h1, cb * h1, y1 + 0.32),
        0.17, tier % 2 === 0 ? "#6d6a61" : "#75726a", {
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.55,
          bearingArea: 0.9,
          surface: damp,
        });
    }
  }

  // Пояса и раскосы на каждом ярусе. Пояс чуть длиннее пролёта, раскосы
  // идут от угла к углу — на стыках с ногами щелей не остаётся.
  for (let tier = 1; tier <= tiers; tier += 1) {
    const y = tier * tierHeight + 0.3;
    const h = legHalf(tier * tierHeight);
    for (const [faceIndex, [ax, bx]] of ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).entries()) {
      const along: SceneVector3 = ax !== 0 ? ACROSS_AXIS : HULL_AXIS;
      primitive(mast, `belt:${tier}:${faceIndex}`, "steel", "cylinder",
        P(MAST_A + ax * h, bx * h, y), [0.1, h * 2 + 0.18, 0.1], "#6a675f", {
          rotation: along,
          contactBoxes: [{ position: [0, 0, 0], size: [0.14, h * 2 + 0.18, 0.14] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
          bearingArea: 0.45,
        });
      if (tier === tiers) {
        continue;
      }
      const yLow = (tier - 1) * tierHeight + 0.3;
      const hLow = legHalf((tier - 1) * tierHeight);
      for (const diagonal of [-1, 1] as const) {
        const from: SceneVector3 = ax !== 0
          ? P(MAST_A + ax * hLow, diagonal * hLow, yLow)
          : P(MAST_A + diagonal * hLow, bx * hLow, yLow);
        const to: SceneVector3 = ax !== 0
          ? P(MAST_A + ax * h, -diagonal * h, y)
          : P(MAST_A - diagonal * h, bx * h, y);
        strut(mast, `brace:${tier}:${faceIndex}:${diagonal}`, "steel",
          from, to, 0.07, "#63605a", {
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.5,
          });
      }
    }
  }

  // Площадка: настил, на который приходят оба марша и с которого уходит
  // трап к посадочной площадке у двери. Южная грань открыта под трап, восточная — под
  // лестницу.
  primitive(mast, "deck", "steel", "steelSheet",
    P(MAST_A, 0, DECK_Y), [DECK_A * 2, 0.12, DECK_B * 2], "#787569", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [DECK_A * 2, 0.12, DECK_B * 2] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      surface: damp,
    });
  for (const [bracketIndex, [ca, cb]] of ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).entries()) {
    strut(mast, `deck:bracket:${bracketIndex}`, "steel",
      P(MAST_A + ca * 0.5, cb * 0.5, DECK_Y - 1.3),
      P(MAST_A + ca * (DECK_A - 0.2), cb * (DECK_B - 0.25), DECK_Y - 0.06),
      0.09, "#6a675f", {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        bearingArea: 0.5,
      });
  }
  // Западная и северная грани закрыты целиком; на восточной поручень идёт
  // ТОЛЬКО южнее доли — иначе он встаёт ровно в проход с лестницы. Южная
  // грань открыта под трап.
  const deckRails: readonly (readonly [string, SceneVector3, SceneVector3])[] = [
    ["west", P(MAST_A - DECK_A, -DECK_B + 0.1, DECK_Y + 1.0), P(MAST_A - DECK_A, DECK_B - 0.1, DECK_Y + 1.0)],
    ["north", P(MAST_A - DECK_A + 0.1, -DECK_B, DECK_Y + 1.0), P(MAST_A + DECK_A - 0.1, -DECK_B, DECK_Y + 1.0)],
    ["east", P(MAST_A - 0.05, DECK_B, DECK_Y + 1.0), P(MAST_A + DECK_A - 0.1, DECK_B, DECK_Y + 1.0)],
  ];
  for (const [railTag, from, to] of deckRails) {
    strut(mast, `deck:rail:${railTag}`, "steel", from, to, 0.06, "#6c6961", {
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
    });
    for (const [postIndex, t] of [0.02, 0.5, 0.98].entries()) {
      primitive(mast, `deck:post:${railTag}:${postIndex}`, "steel", "cylinder",
        [from[0] + (to[0] - from[0]) * t, DECK_Y + 0.53, from[2] + (to[2] - from[2]) * t],
        [0.07, 1.0, 0.07], "#6c6961", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.1, 1.0, 0.1] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        });
    }
  }
  for (const [lampIndex, b] of [-DECK_B + 0.12, DECK_B - 0.12].entries()) {
    addMastLamp(
      mast,
      `deck:lamp:${lampIndex}`,
      P(MAST_A - DECK_A, b, DECK_Y + 1.45),
    );
  }

  // Восточная доля настила: через неё верхний марш выходит на площадку.
  // Марш кончается У ЕЁ ТОРЦА (a = MAST_A - 0.1), поэтому над ступенями
  // ничего не нависает.
  primitive(mast, "deck:lobe", "steel", "steelSheet",
    P(MAST_A - 0.9, (LOBE_B_FROM + LOBE_B_TO) / 2, DECK_Y),
    [1.6, 0.12, LOBE_B_TO - LOBE_B_FROM], "#787569", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [1.6, 0.12, LOBE_B_TO - LOBE_B_FROM] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.6,
      surface: damp,
    });
  for (const [braceIndex, a] of [MAST_A - 1.3, MAST_A - 0.3].entries()) {
    strut(mast, `deck:lobe:brace:${braceIndex}`, "steel",
      P(a, 0.8, DECK_Y - 1.35), P(a, LOBE_B_TO - 0.2, DECK_Y - 0.08),
      0.09, "#6a675f", {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        bearingArea: 0.5,
      });
  }
  // Ограждение доли: северный торец и восточная кромка, вход с юга открыт.
  for (const [postIndex, [a, b]] of ([
    [MAST_A - 1.4, LOBE_B_TO - 0.08], [MAST_A - 1.4, LOBE_B_FROM + 0.1],
    [MAST_A - 0.16, LOBE_B_TO - 0.08],
  ] as const).entries()) {
    primitive(mast, `deck:lobe:post:${postIndex}`, "steel", "cylinder",
      P(a, b, DECK_Y + 0.55), [0.07, 1.0, 0.07], "#6c6961", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.1, 1.0, 0.1] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
  }
  strut(mast, "deck:lobe:rail:north", "steel",
    P(MAST_A - 1.4, LOBE_B_FROM + 0.1, DECK_Y + 1.02),
    P(MAST_A - 1.4, LOBE_B_TO - 0.08, DECK_Y + 1.02),
    0.05, "#6c6961", { bearsLoad: false, attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
  strut(mast, "deck:lobe:rail:east", "steel",
    P(MAST_A - 1.4, LOBE_B_TO - 0.08, DECK_Y + 1.02),
    P(MAST_A - 0.16, LOBE_B_TO - 0.08, DECK_Y + 1.02),
    0.05, "#6c6961", { bearsLoad: false, attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });

  // Лестница: нижний марш по внешней полосе, верхний по внутренней, между
  // ними разворотная площадка вдвое шире марша на южном конце башни.
  const flights: readonly (readonly [string, number, number, number, number, number])[] = [
    // [tag, startY, endY, startA, endA, b]. Подъём 2.85 м на 3.6 м хода —
    // 38°, заводской уклон: ступень 0.3 × 0.24, а не 0.23 × 0.26.
    ["lower", 0.55, 3.4, MAST_A - 0.5, MAST_A + 3.1, STAIR_OUTER_B],
    ["upper", 3.9, DECK_Y - 0.1, MAST_A + 3.1, MAST_A - 0.5, STAIR_INNER_B],
  ];
  for (const [tag, y0, y1, a0, a1, flightB] of flights) {
    const steps = 12;
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      // Проступи перекрываются: сплошная дорожка вместо цепочки тонких
      // коллайдеров, по которой можно пройти только удачным автошагом.
      primitive(mast, `stair:${tag}:${step}`, "steel", "steelSheet",
        P(a0 + (a1 - a0) * t, flightB, y0 + (y1 - y0) * t), [0.42, 0.1, STAIR_WIDTH], "#716e66", {
          rotation: ALONG,
          contactBoxes: [{ position: [0, 0, 0], size: [0.42, 0.1, STAIR_WIDTH] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
        });
    }
    // Косоуры под обеими кромками марша.
    for (const edge of [-1, 1] as const) {
      strut(mast, `stair:${tag}:stringer:${edge}`, "steel",
        P(a0 - Math.sign(a1 - a0) * 0.25, flightB + edge * (STAIR_WIDTH / 2 + 0.08), y0 - (tag === "lower" ? 0.5 : 0.24)),
        P(a1 + Math.sign(a1 - a0) * 0.25, flightB + edge * (STAIR_WIDTH / 2 + 0.08), y1 - 0.24),
        0.12, "#67645d", {
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.38,
          bearingArea: 0.6,
        });
    }
    // Поручень по внешней кромке марша со стойками.
    const outer = flightB + (tag === "lower" ? 1 : -1) * (STAIR_WIDTH / 2 + 0.08);
    strut(mast, `stair:${tag}:handrail`, "steel",
      P(a0, outer, y0 + 0.96), P(a1, outer, y1 + 0.96),
      0.05, "#6c6961", { bearsLoad: false, sideAttachmentReach: 0.6 });
    const inner = flightB - (tag === "lower" ? 1 : -1) * (STAIR_WIDTH / 2 + 0.08);
    strut(mast, `stair:${tag}:handrail:inner`, "steel",
      P(a0 + (a1 - a0) * 0.12, inner, y0 + (y1 - y0) * 0.12 + 0.96),
      P(a0 + (a1 - a0) * 0.88, inner, y0 + (y1 - y0) * 0.88 + 0.96),
      0.05, "#6c6961", { bearsLoad: false, sideAttachmentReach: 0.6 });
    for (const [postIndex, t] of [0.1, 0.5, 0.9].entries()) {
      primitive(mast, `stair:${tag}:railpost:${postIndex}`, "steel", "cylinder",
        P(a0 + (a1 - a0) * t, outer, y0 + (y1 - y0) * t + 0.5), [0.06, 1.02, 0.06], "#6c6961", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.09, 1.02, 0.09] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        });
    }
  }
  // Разворотная площадка: вдвое шире марша, принимает нижний и отдаёт верхний.
  const landingB = (STAIR_INNER_B + STAIR_OUTER_B) / 2;
  // Площадка перекрывает верхние ступени обоих маршей на четверть метра —
  // без нахлёста последний шаг упирается в 3-сантиметровую кромку.
  primitive(mast, "stair:landing", "steel", "steelSheet",
    P(MAST_A + 3.62, landingB, 3.66), [1.75, 0.12, STAIR_WIDTH * 2 + 0.5], "#787569", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [1.75, 0.12, STAIR_WIDTH * 2 + 0.5] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      // Короткий вылет: площадка стоит на своих ногах, а с большим вылетом
      // она находила боковую опору в ветке опушки и ломала её своим весом.
      sideAttachmentReach: 0.24,
    });
  for (const [legIndex, [la, lb]] of ([
    [MAST_A + 3.05, landingB - 1.3], [MAST_A + 3.05, landingB + 1.3],
    [MAST_A + 4.15, landingB - 1.3], [MAST_A + 4.15, landingB + 1.3],
  ] as const).entries()) {
    primitive(mast, `stair:landing:leg:${legIndex}`, "steel", "cylinder",
      P(la, lb, 1.8), [0.14, 3.6, 0.14], "#6d6a61", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.18, 3.6, 0.18] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
        bearingArea: 0.7,
        surface: damp,
      });
  }
  for (const [braceIndex, [la, lb]] of ([
    [MAST_A + 3.6, landingB - 1.3], [MAST_A + 3.6, landingB + 1.3],
  ] as const).entries()) {
    strut(mast, `stair:landing:brace:${braceIndex}`, "steel",
      P(la - 0.55, lb, 0.6), P(la + 0.55, lb, 3.3), 0.07, "#63605a", {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }
  // Ограждение площадки по трём открытым сторонам.
  for (const [postIndex, [a, b]] of ([
    [MAST_A + 4.4, landingB - 1.4], [MAST_A + 4.4, landingB + 1.4],
    [MAST_A + 3.0, landingB + 1.4],
  ] as const).entries()) {
    primitive(mast, `stair:landing:post:${postIndex}`, "steel", "cylinder",
      P(a, b, 4.18), [0.06, 1.02, 0.06], "#6c6961", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.09, 1.02, 0.09] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
  }
  strut(mast, "stair:landing:rail:south", "steel",
    P(MAST_A + 4.4, landingB - 1.4, 4.66), P(MAST_A + 4.4, landingB + 1.4, 4.66),
    0.05, "#6c6961", { bearsLoad: false, attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
  strut(mast, "stair:landing:rail:east", "steel",
    P(MAST_A + 4.4, landingB + 1.4, 4.66), P(MAST_A + 3.0, landingB + 1.4, 4.66),
    0.05, "#6c6961", { bearsLoad: false, attachmentSupportMode: "cable", sideAttachmentReach: 0.5 });
  for (const [lampIndex, b] of [landingB - 1.4, landingB + 1.4].entries()) {
    addMastLamp(
      mast,
      `stair:landing:lamp:${lampIndex}`,
      P(MAST_A + 4.4, b, 4.98),
    );
  }

  // Оголовок — ОДИН кусок, инертный для решателя (bearsLoad и
  // carriesAttachments false). Иначе носовой конус садится на него сверху и
  // корабль частично висит на железе. Держится боковой найтовкой за
  // верхний пояс фермы.
  primitive(mast, "cup", "steel", "cylinder",
    P(MAST_A, 0, 11.78), [0.76, 2.4, 0.76], "#6f6c64", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.82, 2.4, 0.82] }],
      bearsLoad: false,
      carriesAttachments: false,
      sideAttachmentReach: 0.6,
      surface: damp,
    });
  // Мачтовый огонь: стойка тоже ничего не крепит, фонарь стоит на ней.
  primitive(mast, "beacon:post", "steel", "cylinder",
    P(MAST_A - 0.62, 0, 11.5), [0.09, 1.5, 0.09], "#6c6961", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.12, 1.5, 0.12] }],
      carriesAttachments: false,
    });
  primitive(mast, "beacon:lamp", "glass", "glassPane",
    P(MAST_A - 0.62, 0, 12.39), [0.24, 0.28, 0.24], "#c8544a", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      light: {
        color: "#ff6a55",
        distance: 16,
        intensity: 3.2,
        dayIntensityFactor: 0.35,
        poolPriority: 6,
        eventLighting: mastDockLighting,
        transition: { fadeInSeconds: 0.7, fadeOutSeconds: 1.1 },
      },
    });

  // Трап с основной площадки к посадочной площадке у двери. Это мостик
  // мачты: он закреплён на настиле и раскреплён двумя подкосами от фермы.
  // Сам он ничего не держит (bearsLoad false), иначе гондола повисла бы
  // на мачте.
  {
    const from: SceneVector3 = P(MAST_A + DECK_A - 0.2, 0.95, DECK_Y + 0.1);
    const to: SceneVector3 = P(CAR_FROM - 0.1, CAR_HALF + 0.95, CAR_FLOOR + 0.15);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const run = Math.hypot(dx, dz);
    const length = Math.hypot(dx, dy, dz) + 0.6;
    const center: SceneVector3 = [
      (from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.04, (from[2] + to[2]) / 2,
    ];
    primitive(mast, "gangway", "steel", "steelSheet",
      center, [length, 0.1, 1.26], "#7a7770", {
        rotation: [0, Math.atan2(-dz, dx), Math.atan2(dy, run)],
        contactBoxes: [
          { position: [-length / 2 + 0.34, 0.04, 0], size: [0.62, 0.1, 1.2] },
          { position: [length / 2 - 0.34, 0.0, 0], size: [0.58, 0.1, 1.2] },
        ],
        contactBearingOrder: true,
        bearsLoad: false,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        surface: damp,
      });
    // Подкосы мостика: от верхнего пояса фермы к его середине снизу.
    for (const [braceIndex, side] of [-1, 1].entries()) {
      strut(mast, `gangway:brace:${braceIndex}`, "steel",
        P(MAST_A + 0.4, side * 0.75, DECK_Y - 1.9),
        [(from[0] + to[0]) / 2 + AXIS_EAST[0] * side * 0.4,
          (from[1] + to[1]) / 2 - 0.12,
          (from[2] + to[2]) / 2 + AXIS_EAST[2] * side * 0.4],
        0.09, "#6a675f", {
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.55,
          bearingArea: 0.5,
        });
    }
    // Поручень мостика — по ОБЕИМ кромкам, во всю длину, со стойками на
    // настиле. Всё это часть мачты и остаётся вместе с мостиком; дальше его
    // принимает собственное ограждение посадочной площадки.
    for (const [railIndex, side] of [-1, 1].entries()) {
      const offset = 0.72 * side;
      const railFrom: SceneVector3 = [
        from[0] - AXIS_EAST[0] * offset, from[1] + 0.9, from[2] - AXIS_EAST[2] * offset,
      ];
      const railTo: SceneVector3 = [
        to[0] - AXIS_EAST[0] * offset, to[1] + 0.9, to[2] - AXIS_EAST[2] * offset,
      ];
      primitive(mast, `gangway:post:${railIndex}`, "steel", "cylinder",
        [railFrom[0], from[1] + 0.44, railFrom[2]], [0.06, 1.0, 0.06], "#6c6961", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.09, 1.0, 0.09] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
        });
      strut(mast, `gangway:rail:${railIndex}`, "steel", railFrom, railTo, 0.05, "#6c6961", {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.6,
      });
    }
  }
}

// --- Причальная площадка ----------------------------------------------------

function createMooringField(): void {
  const field = group("field", "Trodden mooring ground under the airship", "soil", "stack");

  // Вытоптанное пятно: тропа расширяется вокруг мачты и уходит языком к
  // лестнице на восточной стороне.
  const apron: readonly (readonly [number, number, number, number])[] = [
    [MAST_A, 0, 4.6, 4.4],
    [MAST_A + 0.2, 2.3, 2.8, 2.1],
    [MAST_A - 2.6, 0.8, 2.8, 3.4],
  ];
  for (const [patchIndex, [a, b, la, lb]] of apron.entries()) {
    // Высоты пятен разведены: в одной плоскости они дают рябь z-fighting.
    primitive(field, `apron:${patchIndex}`, "soil", "groundTile",
      P(a, b, 0.03 + patchIndex * 0.022), [la, 0.09, lb],
      patchIndex % 2 === 0 ? "#736550" : "#7b6c55", {
        rotation: [0, -HEADING + patchIndex * 0.08, 0],
        surface: damp,
      });
  }
  primitive(field, "pad", "concrete", "groundTile",
    P(MAST_A, 0, 0.115), [2.8, 0.15, 2.8], "#8f8d85", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [2.8, 0.15, 2.8] }],
      carriesAttachments: true,
      surface: damp,
    });

  // Мёртвые якоря с рымами и свёрнутой снастью. Каната к борту нет
  // намеренно: у мачтовой швартовки корабль держится носом в стакане и
  // свободно флюгерит по ветру. Растяжки к земле пришлось бы вести сквозь
  // кроны опушки — и они же переставали падать вместе с кораблём, находя
  // опору в ветках.
  const anchors: readonly (readonly [string, number, number, number])[] = [
    ["fore", -3.4, 2.6, 0.5],
    ["west", -3.6, -2.4, -0.7],
  ];
  for (const [tag, a, b, lay] of anchors) {
    primitive(field, `anchor:${tag}`, "concrete", "cinderBlock",
      P(a, b, 0.24), [1.1, 0.48, 0.9], "#8a887f", {
        rotation: [0, -HEADING + 0.2, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [1.1, 0.48, 0.9] }],
        carriesAttachments: true,
        surface: damp,
      });
    primitive(field, `anchor:${tag}:ring`, "steel", "cylinder",
      P(a, b, 0.62), [0.34, 0.07, 0.34], IRON, {
        rotation: ACROSS_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [0.34, 0.34, 0.1] }],
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    // Снасть свёрнута и лежит от рыма на плиту: причал ждёт следующего рейса.
    strut(field, `anchor:${tag}:lay`, "cloth",
      P(a, b, 0.6), P(a + lay * 1.5, b + lay * 0.6, 0.14), 0.055, "#8d8a79", {
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
    primitive(field, `anchor:${tag}:coil`, "cloth", "cylinder",
      P(a + lay * 1.9, b + lay * 0.76, 0.19), [0.62, 0.16, 0.62], "#8d8a79", {
        rotation: [0, -HEADING, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [0.62, 0.16, 0.62] }],
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      });
  }

  // Ветроуказатель. Колбаса собрана внахлёст сплошной трубой: раздельные
  // кольца читаются гирляндой разноцветных капсул, висящих в воздухе.
  const SOCK_A = 13.2;
  const SOCK_B = -5.2;
  const SOCK_SPIN = 0.45;
  const SOCK_AXIS = rodRotation(
    AXIS_FORE[0] * Math.cos(SOCK_SPIN) + AXIS_EAST[0] * Math.sin(SOCK_SPIN),
    0,
    AXIS_FORE[2] * Math.cos(SOCK_SPIN) + AXIS_EAST[2] * Math.sin(SOCK_SPIN),
  );
  primitive(field, "sock:pole", "steel", "cylinder",
    P(SOCK_A, SOCK_B, 2.1), [0.13, 4.2, 0.13], "#736f66", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.16, 4.2, 0.16] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.45,
      surface: damp,
    });
  primitive(field, "sock:ring", "steel", "cylinder",
    P(SOCK_A, SOCK_B, 4.12), [0.5, 0.07, 0.5], IRON, {
      rotation: SOCK_AXIS,
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.5, 0.12] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  for (let band = 0; band < 5; band += 1) {
    const reach = 0.34 + band * 0.46;
    const diameter = 0.48 - band * 0.05;
    primitive(field, `sock:band:${band}`, "cloth", "cylinder",
      P(SOCK_A + Math.cos(SOCK_SPIN) * reach, SOCK_B + Math.sin(SOCK_SPIN) * reach, 4.12 - band * 0.07),
      [diameter, 0.62, diameter],
      band % 2 === 0 ? "#c25b3e" : "#d9d3c2", {
        rotation: SOCK_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [diameter, diameter, 0.62] }],
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
      });
  }

  // Хозяйство причала: барабан с тросом, бочки, ящик, скамья и щит для тех,
  // кто ждёт рейса.
  const DRUM_AXIS = rodRotation(
    AXIS_FORE[0] * Math.cos(0.3) + AXIS_EAST[0] * Math.sin(0.3),
    0,
    AXIS_FORE[2] * Math.cos(0.3) + AXIS_EAST[2] * Math.sin(0.3),
  );
  primitive(field, "drum:core", "wood", "cylinder",
    P(-1.6, -3.4, 0.62), [1.24, 1.1, 1.24], "#6b5740", {
      rotation: DRUM_AXIS,
      contactBoxes: [{ position: [0, 0, 0], size: [1.24, 1.24, 1.1] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
      surface: damp,
    });
  for (const cheek of [-1, 1] as const) {
    primitive(field, `drum:cheek:${cheek}`, "wood", "cylinder",
      P(-1.6 - Math.sin(0.3) * cheek * 0.56, -3.4 + Math.cos(0.3) * cheek * 0.56, 0.62),
      [1.6, 0.14, 1.6], "#5f4d38", {
        rotation: DRUM_AXIS,
        contactBoxes: [{ position: [0, 0, 0], size: [1.6, 1.6, 0.14] }],
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
  }
  for (const [barrelIndex, [a, b, tone]] of ([
    [12.5, -5.5, "#5c6a52"], [13.2, -5.1, "#6d5a44"],
  ] as const).entries()) {
    primitive(field, `barrel:${barrelIndex}`, "steel", "cylinder",
      P(a, b, 0.44), [0.62, 0.88, 0.62], tone, {
        contactBoxes: [{ position: [0, 0, 0], size: [0.62, 0.88, 0.62] }],
        carriesAttachments: true,
        surface: damp,
      });
  }
  primitive(field, "crate", "wood", "plank",
    P(7.0, 4.4, 0.3), [0.9, 0.6, 0.72], "#6a5741", {
      rotation: [0, -HEADING + 0.4, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [0.9, 0.6, 0.72] }],
      carriesAttachments: true,
      surface: damp,
    });
  primitive(field, "crate:lid", "wood", "plank",
    P(7.0, 4.4, 0.64), [0.94, 0.08, 0.76], "#75604a", {
      rotation: [0, -HEADING + 0.32, 0],
      bearsLoad: false,
    });
  for (const leg of [-1, 1] as const) {
    primitive(field, `bench:leg:${leg}`, "wood", "plank",
      P(-4.0 + leg * 0.7, 2.0, 0.22), [0.12, 0.44, 0.4], "#5d4b38", {
        rotation: ALONG,
        contactBoxes: [{ position: [0, 0, 0], size: [0.12, 0.44, 0.4] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
      });
  }
  primitive(field, "bench:seat", "wood", "plank",
    P(-4.0, 2.0, 0.48), [1.9, 0.09, 0.42], "#6d5941", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [1.9, 0.09, 0.42] }],
    });
  for (const post of [-1, 1] as const) {
    primitive(field, `sign:post:${post}`, "steel", "cylinder",
      P(-3.4 + post * 0.75, -2.4, 0.85), [0.09, 1.7, 0.09], "#6e6b63", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.12, 1.7, 0.12] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }
  primitive(field, "sign:board", "steel", "steelSheet",
    P(-3.4, -2.4, 1.62), [1.7, 0.62, 0.06], "#cdd0c9", {
      rotation: ALONG,
      contactBoxes: [{ position: [0, 0, 0], size: [1.7, 0.62, 0.1] }],
      bearsLoad: false,
      sideAttachmentReach: 0.5,
    });
  primitive(field, "sign:band", "steel", "steelSheet",
    P(-3.4, -2.4, 1.42), [1.5, 0.14, 0.1], MARK_RED, {
      rotation: ALONG,
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      contactBoxes: [{ position: [0, 0, 0], size: [1.5, 0.14, 0.14] }],
    });

  // Прожектор на столбе: ночью бьёт в брюхо оболочки.
  primitive(field, "flood:post", "steel", "cylinder",
    P(10.0, -5.4, 1.75), [0.12, 3.5, 0.12], "#6b6860", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.15, 3.5, 0.15] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.5,
      surface: damp,
    });
  primitive(field, "flood:head", "steel", "cylinder",
    P(10.0, -5.4, 3.62), [0.5, 0.42, 0.5], "#5f5c55", {
      rotation: rodRotation(0.5 * SA, 0.85, -0.5 * CA),
      contactBoxes: [{ position: [0, 0, 0], size: [0.55, 0.5, 0.55] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(field, "flood:lens", "glass", "glassPane",
    P(10.0, -5.28, 3.82), [0.36, 0.34, 0.36], "#f2ecd0", {
      bearsLoad: false,
      sideAttachmentReach: 0.4,
      light: { color: "#ffe6b0", distance: 18, intensity: 2.8 },
    });
}

createAirship();
createMooringMast();
createMooringField();

export const skyMooringDocument = {
  schemaVersion: 1 as const,
  id: "sky-mooring",
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
