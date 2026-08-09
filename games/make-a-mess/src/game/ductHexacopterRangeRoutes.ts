import type { SceneVector3 } from "./destructionScene.ts";
import { createMotionRoute, motionRoutePhase } from "./motionRoute.ts";
import type { MotionRouteArtifact } from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  DUCT_HEXACOPTER_RANGE_PAD_X,
  DUCT_HEXACOPTER_RANGE_PAD_Z,
} from "./rangeDuctHexacopter.ts";

/**
 * ОБЛЁТ ПОЛИГОНА VX-8 «Yaqui».
 *
 * Это НЕ показательная программа RAX-8 и не попытка её повторить. У соседней
 * машины есть фигуры, шпильки и продольная тяга помимо наклона; у этой —
 * широкий тяжёлый корпус вдвое большей массы и вдвое большей инерции рыскания.
 * Дать ей чужую программу значило бы показать, чего она НЕ умеет.
 *
 * Замысел здесь другой и честный: машина обходит полигон по кругу, ЦЕНТР
 * КОТОРОГО — центр полигона, а не её собственный пад. Круг проходит через пад
 * ровно потому, что пад на нём и лежит: расстояние от берта до центра —
 * 39.7 м, оно и есть радиус. Поэтому рейс начинается и кончается на своей
 * площадке, а не «где-то рядом с ней».
 *
 * ВЫСОТА 18 м ВЫВЕДЕНА, А НЕ ВЫБРАНА. Документ полигона предупреждает: над
 * этим миром идёт программа RAX-8, её фигуры живут между 26 и 77 м, а самое
 * низкое её место — бросок мимо площадки на 22 м. Восемнадцать проходит под
 * всем этим и при этом заведомо выше вертипада HX-6 (3.1 м) и любого пульта.
 *
 * СКОРОСТЬ 14 м/с: вираж радиусом 39.7 требует v²/r = 4.9 м/с² при
 * располагаемых g·tg(48°) = 10.9 — машина идёт по кругу с двукратным запасом,
 * то есть круг для неё не предельный режим, а прогулка.
 */

/** Круг проходит через пад, поэтому его радиус — это вынос пада от центра. */
export const DUCT_HEXACOPTER_LAP_RADIUS = Math.hypot(
  DUCT_HEXACOPTER_RANGE_PAD_X,
  DUCT_HEXACOPTER_RANGE_PAD_Z,
);
export const DUCT_HEXACOPTER_LAP_ALTITUDE = 18;
export const DUCT_HEXACOPTER_LAP_SPEED = 14;
export const DUCT_HEXACOPTER_LAP_CORRIDOR = 8;
export const DUCT_HEXACOPTER_LAPS = 3;

const NODES_PER_LAP = 16;
const TOTAL_NODES = NODES_PER_LAP * DUCT_HEXACOPTER_LAPS;

/**
 * Центр полигона в координатах, отсчитанных ОТ БЕРТА: трасса всегда строится
 * берт-относительной, а мировую точку из неё делает `placedPlan`.
 */
const CENTRE_FROM_BERTH: readonly [number, number] = [
  -DUCT_HEXACOPTER_RANGE_PAD_X,
  -DUCT_HEXACOPTER_RANGE_PAD_Z,
];

/** Угол, под которым виден пад из центра полигона: с него круг и начинается. */
const START_ANGLE = Math.atan2(
  -CENTRE_FROM_BERTH[1],
  -CENTRE_FROM_BERTH[0],
);

/**
 * Длина круга по ломаной узлов — оценка, и её хватает: полосы у земли задаются
 * в МЕТРАХ от берта, а метры из доли получаются умножением на длину. Настоящая
 * длина кривой известна только после сборки маршрута, то есть после того, как
 * требования понадобились.
 */
const LAP_POLYLINE_LENGTH =
  2 * Math.PI * DUCT_HEXACOPTER_LAP_RADIUS * DUCT_HEXACOPTER_LAPS;
const lapLength = () => LAP_POLYLINE_LENGTH;

const lapCircle: MotionRouteArtifact = createMotionRoute({
  id: "duct-hexacopter:range-lap",
  // Круг считается формулой, а не выкладывается точками: шестнадцать узлов с
  // касательными ручками длиной в треть шага — так дуга остаётся дугой, а не
  // шестнадцатиугольником.
  nodes: Array.from({ length: TOTAL_NODES + 1 }, (_, index) => {
    const step = (2 * Math.PI) / NODES_PER_LAP;
    const angle = START_ANGLE + index * step;
    const r = DUCT_HEXACOPTER_LAP_RADIUS;
    const position: SceneVector3 = [
      CENTRE_FROM_BERTH[0] + r * Math.cos(angle),
      0,
      CENTRE_FROM_BERTH[1] + r * Math.sin(angle),
    ];
    const tangent: SceneVector3 = [
      -r * Math.sin(angle) * (step / 3),
      0,
      r * Math.cos(angle) * (step / 3),
    ];
    return {
      id:
        index === 0
          ? "berth"
          : index === TOTAL_NODES
            ? "dock"
            : `lap-${index}`,
      position,
      incoming: [
        position[0] - tangent[0],
        0,
        position[2] - tangent[2],
      ] as SceneVector3,
      outgoing: [
        position[0] + tangent[0],
        0,
        position[2] + tangent[2],
      ] as SceneVector3,
      samples: 32,
    };
  }),
  measureAxes: [0, 2],
  markers: {
    departureComplete: "lap-1",
    arriving: `lap-${TOTAL_NODES - 2}`,
    // СТВОР — УЗЕЛ ПЕРЕД ПРИЧАЛОМ, а не сам причал. Заход, включающийся в
    // последней точке, не заход: машине нужен участок, на котором она уже
    // ведёт МЕСТО, а не скорость.
    final: `lap-${TOTAL_NODES - 1}`,
  },
  requirements: {
    /**
     * ВЫСОТА ГАСНЕТ К КОНЦАМ, ИНАЧЕ САДИТЬСЯ НЕКУДА.
     *
     * Здесь стояла константа на всём круге — включая долю ноль и долю единица.
     * Это значит, что точка «док» висела в восемнадцати метрах над падом:
     * машина честно доходила до конца трассы и оставалась в небе. Не сбой
     * автопилота и не отказ — просто посадка не была описана вовсе.
     *
     * Столбы взлёта и захода объявлены ниже отдельными требованиями; профиль
     * обязан с ними сходиться, поэтому у земли он идёт к нулю, а не к
     * маршрутной высоте.
     */
    altitude: ({ progress }) => {
      const metres = progress * lapLength();
      const toDock = (1 - progress) * lapLength();
      const edge = Math.min(1, metres / 40, toDock / 45);
      const eased = edge * edge * (3 - 2 * edge);
      return DUCT_HEXACOPTER_LAP_ALTITUDE * Math.max(0, eased);
    },
    speedLimit: ({ progress }) => {
      // У земли — по-причальному тихо, и это то же требование, что у соседней
      // машины: точность нужна на взлёте и посадке, а больше нигде.
      const metres = progress * lapLength();
      const toDock = (1 - progress) * lapLength();
      if (metres < 26) return 5;
      if (toDock < 18) return 4;
      if (toDock < 60) return 8;
      return DUCT_HEXACOPTER_LAP_SPEED;
    },
    // КОРИДОР ОБЯЗАТЕЛЕН: общий контракт трассы спрашивает его наравне с
    // высотой и скоростью, и отсутствие требования — это не «по умолчанию
    // широко», а исключение при первом же обращении.
    // Коридор у земли строгий: там точность — вопрос столкновения. На круге
    // машине оставлено её паспортное место.
    corridor: ({ progress }) => {
      const metres = progress * lapLength();
      const toDock = (1 - progress) * lapLength();
      return metres < 30 || toDock < 30 ? 4 : DUCT_HEXACOPTER_LAP_CORRIDOR;
    },
  },
});

function placedPlan(
  route: MotionRouteArtifact,
  berth: SceneVector3,
  finalFrom: number,
): VehicleRoutePlan {
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      const point = route.point(progress);
      return [
        berth[0] + point[0],
        berth[1] + route.requirement("altitude", progress),
        berth[2] + point[2],
      ];
    },
    speedLimit: (progress) => route.requirement("speedLimit", progress),
    altitude: (progress) => berth[1] + route.requirement("altitude", progress),
    corridor: (progress) => route.requirement("corridor", progress),
    finalFrom,
  };
}

/** Высота столбов у земли: с неё уходят и на неё возвращаются. */
export const DUCT_HEXACOPTER_CLEARANCE_ALTITUDE = 14;

export function ductHexacopterLapPlan(berth: SceneVector3): VehicleRoutePlan {
  return {
    ...placedPlan(lapCircle, berth, lapCircle.markerProgress("final")),
    // ВЗЛЁТ И ПОСАДКА — ОТДЕЛЬНЫЕ ТРЕБОВАНИЯ, а не следствие профиля высоты.
    // Без них машина уходит с пада по диагонали и приходит на него так же, а
    // приходить на площадку надо сверху.
    verticalDeparture: {
      altitude: berth[1] + DUCT_HEXACOPTER_CLEARANCE_ALTITUDE,
      until: lapCircle.markerProgress("departureComplete"),
      tolerance: 0.75,
    },
    verticalArrival: {
      altitude: berth[1] + DUCT_HEXACOPTER_CLEARANCE_ALTITUDE,
      from: lapCircle.markerProgress("final"),
      horizontalTolerance: 0.85,
    },
    // Упреждение под собственный радиус разворота: машина широкая и тяжёлая,
    // и смотреть ей надо дальше, чем RAX-8 с его вдвое меньшей инерцией.
    guidanceLookahead: () => 24,
  };
}

export function ductHexacopterArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  return ductHexacopterLapPlan(berth);
}

/**
 * Аварийный уход — прямая от точки срыва по текущему курсу с набором. Тот же
 * контракт, что у соседней машины: уводить надо ОТ мира, а не по трассе,
 * которую машина только что не смогла пройти.
 */
export function ductHexacopterEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const length = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const direction: SceneVector3 = [
    input.forward[0] / length,
    0,
    input.forward[2] / length,
  ];
  const floor = DUCT_HEXACOPTER_LAP_ALTITUDE;
  return {
    id: "duct-hexacopter:range-escape",
    length: 120,
    point(progress) {
      return [
        berth[0] + input.start[0] + direction[0] * progress * 120,
        berth[1] + input.start[1] + floor + progress * 12,
        berth[2] + input.start[2] + direction[2] * progress * 120,
      ];
    },
    speedLimit: (progress) => (progress < 0.2 ? 5 : 10),
    altitude: (progress) => berth[1] + input.start[1] + floor + progress * 12,
    finalFrom: Number.POSITIVE_INFINITY,
  };
}

export function ductHexacopterLapPhase(progress: number) {
  return motionRoutePhase(lapCircle, progress, "departureComplete", "arriving");
}
