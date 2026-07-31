import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRouteDefinition,
  type MotionRoutePhase,
  type MotionRouteRequirementContext,
} from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  HEXACOPTER_NOSE,
  HEXACOPTER_PAD_X,
  HEXACOPTER_PAD_Z,
} from "./townHexacopter.ts";

/**
 * ОБЛЁТ ОСТРОВА С ВОЗВРАТОМ НА ТУ ЖЕ ПЛОЩАДКУ
 *
 * Маршрут авторится в осях машины: `a` — вперёд по носу (на запад от
 * площадки частного дома), `b` — на левый борт. Он задаёт только линию,
 * высоту и разрешённую скорость; ни тяги, ни курса, ни позы здесь нет —
 * это требования, а не команды (airborne-vehicle-dynamics §9.1).
 *
 * Отличие от дирижаблей карты: у этой машины нет причальной мачты и нет
 * маневрирования задним ходом. Она уходит вверх почти вертикально — за первые
 * 30 м пути набирает 24 м высоты. Так аппарат успевает подняться выше крыши
 * дома владельца до её пересечения. Возвращается он с востока, вдоль прямой
 * оси дома и площадки, снижаясь на последних 34 метрах.
 *
 * Центр острова лежит в этих осях в точке (14, 15): круг облёта строится
 * вокруг него, а не вокруг площадки.
 */

export type TownHexacopterFlightKind = "circuit" | "tour";

/** Поперечная ось маршрута в мире. */
const LATERAL: SceneVector3 = [HEXACOPTER_NOSE[2], 0, -HEXACOPTER_NOSE[0]];

/**
 * Центр острова остаётся мировой точкой (30, -15), даже когда площадку
 * переносят. Хранить здесь прежние локальные 14/15 нельзя: тогда вместе со
 * двором незаметно уезжает и весь круг облёта.
 */
const ISLAND_WORLD_X = 30;
const ISLAND_WORLD_Z = -15;
const ISLAND_A =
  (ISLAND_WORLD_X - HEXACOPTER_PAD_X) * HEXACOPTER_NOSE[0] +
  (ISLAND_WORLD_Z - HEXACOPTER_PAD_Z) * HEXACOPTER_NOSE[2];
const ISLAND_B =
  (ISLAND_WORLD_X - HEXACOPTER_PAD_X) * LATERAL[0] +
  (ISLAND_WORLD_Z - HEXACOPTER_PAD_Z) * LATERAL[2];

/** Высота, на которой машина уже выше парапетов двора (11.5 м). */
const YARD_CLEAR_ALTITUDE = 24;
const CLIMB_DISTANCE = 30;
const FINAL_DESCENT_DISTANCE = 34;
/**
 * Упреждение на круге. Не «три секунды хода», а замеренная величина: прогон
 * всего рейса при 18 / 27 / 38 / 52 / 66 м даёт максимальный снос 33 / 33 /
 * 412 / 71 / 62 м. Общие для проекта 52 м рассчитаны на длинный дирижабль и
 * на круге радиусом 46 м срезают дугу; короткое упреждение этой машине идёт.
 */
const CRUISE_LOOKAHEAD = 27;
/**
 * Длина прямого створа перед площадкой. Тридцать метров — компромисс, оба
 * края которого замерены: на 26 м машина доворачивала на курс уже почти без
 * хода и приходила с ошибкой 18°, а на 44 м «плечо» захода уезжало далеко за
 * круг облёта и трасса ломалась.
 */
const FINAL_RUN = 30;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function altitude(
  ceiling: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  // Вверх из колодца двора. Профиль ВОГНУТЫЙ: высота набирается на первых
  // метрах, а не плавно по всей длине. Сглаженная S-кривая давала на 7 м от
  // площадки всего 3 м высоты — то есть машина шла бы прямо в цоколь соседней
  // пятиэтажки, до которого 6.98 м. Корень даёт 12 м на том же удалении.
  //
  // Это в пределах возможностей машины: при `liftTrimRange` 0.28 и
  // сопротивлении 0.26 установившийся набор — около 10 м/с, а разрешённая у
  // земли путевая — 3.4 м/с. Располагаемый градиент втрое круче требуемого.
  if (distance < CLIMB_DISTANCE) {
    const t = clamp01(distance / CLIMB_DISTANCE);
    return YARD_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  if (remaining < FINAL_DESCENT_DISTANCE) {
    // Снижение зеркально: над двором машина падает почти вертикально, а не
    // тянет пологую глиссаду через крыши.
    // Последние три метра — вертикальная досадка: высота уже ноль, и машину
    // доводит до стакана причальный захват, а не наклон трассы.
    const t = clamp01((remaining - 3) / (FINAL_DESCENT_DISTANCE - 3));
    return YARD_CLEAR_ALTITUDE * (1 - (1 - t) * (1 - t));
  }
  const climbOut = clamp01((distance - CLIMB_DISTANCE) / 40);
  const descent = clamp01((remaining - FINAL_DESCENT_DISTANCE) / 60);
  return (
    YARD_CLEAR_ALTITUDE +
    (ceiling - YARD_CLEAR_ALTITUDE) * Math.min(smootherStep(climbOut), smootherStep(descent))
  );
}

function speedLimit(
  cruiseSpeed: number,
  { distance, remaining }: MotionRouteRequirementContext,
): number {
  // Тормозной профиль честный: 0.45 м/с² — то, что машина реально снимает
  // реверсом колец, а не желаемое число.
  // Целимся В САМО пятно, а не за два метра до него: смещение тормозного
  // профиля заставляло машину останавливаться, не дойдя до стакана, и дальше
  // она стояла — причальный захват до неё не дотягивался.
  const stopping = Math.sqrt(2 * 0.45 * Math.max(0, remaining));
  if (distance < CLIMB_DISTANCE * 0.5) {
    return Math.min(3.4, stopping);
  }
  // Первый разворот с прямой на круг машина проходит медленнее: на 9 м/с
  // радиуса 46 м ей не хватает боковой силы и она уходит наружу.
  if (distance < CLIMB_DISTANCE + 45) {
    return Math.min(6, stopping);
  }
  return Math.min(cruiseSpeed, stopping);
}

function routeDefinition(
  kind: TownHexacopterFlightKind,
): MotionRouteDefinition {
  const compact = kind === "circuit";
  const radius = compact ? 46 : 56;
  const point = (degrees: number, scale = 1): SceneVector3 => {
    const angle = (degrees * Math.PI) / 180;
    return [
      ISLAND_A + radius * scale * Math.cos(angle),
      0,
      ISLAND_B + radius * scale * Math.sin(angle),
    ];
  };
  // Ручки безье для ДУГИ, а не «на глаз»: для шага Δ длина ручки окружности
  // равна (4/3)·tan(Δ/4)·R. Без этого узлы через 80° соединялись кривой,
  // заметно уходящей внутрь круга, и машина честно летела по ней, набирая
  // тридцать метров сноса относительно задуманной трассы.
  const STEP = 48;
  const handle = (4 / 3) * Math.tan(((STEP / 4) * Math.PI) / 180) * radius;
  const arcNode = (id: string, degrees: number) => {
    const centre = point(degrees);
    const tangent: SceneVector3 = [
      -Math.sin((degrees * Math.PI) / 180),
      0,
      Math.cos((degrees * Math.PI) / 180),
    ];
    return {
      id,
      position: centre,
      incoming: [
        centre[0] - tangent[0] * handle,
        0,
        centre[2] - tangent[2] * handle,
      ] as SceneVector3,
      outgoing: [
        centre[0] + tangent[0] * handle,
        0,
        centre[2] + tangent[2] * handle,
      ] as SceneVector3,
      samples: 56,
    };
  };
  return {
    id: `town-hexacopter:${kind}`,
    nodes: [
      { id: "pad", position: [0, 0, 0] },
      {
        // Выход из двора уже слегка отвёрнут к кругу: касательная круга в
        // точке входа идёт под 60° к оси проезда, и без этого разворота
        // машина влетала в узел с изломом курса и набирала сорок метров
        // сноса, прежде чем контур её возвращал.
        id: "yard-clear",
        position: [CLIMB_DISTANCE, 0, -2],
        outgoing: [CLIMB_DISTANCE + 18, 0, 1],
      },
      arcNode("circuit-entry", -30),
      arcNode("west", 18),
      arcNode("north-west", 66),
      arcNode("north", 114),
      arcNode("north-east", 162),
      {
        // Крюк захода: машина выходит ВОСТОЧНЕЕ круга и возвращается на
        // площадку по прямой вдоль проезда. Без этого выноса узел круга и
        // створ оказывались в четырёх метрах друг от друга, и на подходе
        // получалась шпилька — разворот на месте между домами.
        id: "arrival-shoulder",
        position: [-(FINAL_RUN + 22), 0, 5],
        incoming: [-(FINAL_RUN + 18), 0, 17],
        outgoing: [-(FINAL_RUN + 12), 0, -1],
        samples: 56,
      },
      {
        id: "final-entry",
        position: [-FINAL_RUN, 0, 0],
        incoming: [-(FINAL_RUN + 10), 0, 0],
        outgoing: [-FINAL_RUN * 0.4, 0, 0],
        samples: 48,
      },
      { id: "dock", position: [0, 0, 0] },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: (context) => altitude(compact ? 34 : 44, context),
      speedLimit: (context) => speedLimit(compact ? 9 : 10.5, context),
    },
    markers: {
      departureComplete: "circuit-entry",
      arriving: "arrival-shoulder",
      final: "final-entry",
    },
  };
}

const ROUTES: Readonly<Record<TownHexacopterFlightKind, MotionRouteArtifact>> = {
  circuit: createMotionRoute(routeDefinition("circuit")),
  tour: createMotionRoute(routeDefinition("tour")),
};

/**
 * Знак поперечной оси важнее, чем кажется: с перевёрнутым базисом круг
 * облёта строится зеркально. Формула та же, что у дирижабля города.
 */
function placeLocal(
  berth: SceneVector3,
  local: SceneVector3,
  altitudeValue: number,
): SceneVector3 {
  return [
    berth[0] + HEXACOPTER_NOSE[0] * local[0] + LATERAL[0] * local[2],
    berth[1] + altitudeValue,
    berth[2] + HEXACOPTER_NOSE[2] * local[0] + LATERAL[2] * local[2],
  ];
}

function placeRoute(
  route: MotionRouteArtifact,
  berth: SceneVector3,
  finalFrom: number,
): VehicleRoutePlan {
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      return placeLocal(
        berth,
        route.point(progress),
        route.requirement("altitude", progress),
      );
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return berth[1] + route.requirement("altitude", progress);
    },
    finalFrom,
  };
}

export function townHexacopterRoute(
  kind: TownHexacopterFlightKind,
): MotionRouteArtifact {
  return ROUTES[kind];
}

export function townHexacopterPlan(
  kind: TownHexacopterFlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = townHexacopterRoute(kind);
  const placed = placeRoute(route, berth, route.markerProgress("final"));
  const departureComplete = route.markerProgress("departureComplete");
  return {
    ...placed,
    // Упреждение соразмерно ЭТОЙ машине: круз 9 м/с и три секунды вперёд —
    // 27 м. Общие 52 м, разумные для длинного дирижабля, на круге радиусом
    // 46 м срезают дугу и уводят машину внутрь круга. В колодце двора
    // упреждение ещё короче: там впереди стена.
    guidanceLookahead(progress) {
      if (progress < departureComplete * 0.5) {
        return 12;
      }
      return progress < departureComplete ? 20 : CRUISE_LOOKAHEAD;
    },
  };
}

/** Возвращение из-за границы обслуживания после восстановления. */
const ARRIVAL = createMotionRoute({
  id: "town-hexacopter:arrival",
  nodes: [
    { id: "remote-entry", position: [-150, 0, 96], outgoing: [-120, 0, 66] },
    {
      id: "arrival-shoulder",
      position: [-62, 0, 14],
      incoming: [-92, 0, 40],
      outgoing: [-46, 0, 4],
      samples: 64,
    },
    {
      id: "final-entry",
      position: [-FINAL_RUN, 0, 0],
      incoming: [-(FINAL_RUN + 10), 0, 0],
      outgoing: [-FINAL_RUN * 0.4, 0, 0],
      samples: 48,
    },
    { id: "dock", position: [0, 0, 0] },
  ],
  measureAxes: [0, 2],
  requirements: {
    altitude: ({ remaining }) =>
      remaining < FINAL_DESCENT_DISTANCE
        ? YARD_CLEAR_ALTITUDE * smootherStep(remaining / FINAL_DESCENT_DISTANCE)
        : YARD_CLEAR_ALTITUDE + 12 * smootherStep((remaining - FINAL_DESCENT_DISTANCE) / 90),
    speedLimit: (context) =>
      speedLimit(11, { ...context, distance: CLIMB_DISTANCE * 2 }),
  },
  markers: {
    arrivalCapture: "remote-entry",
    arriving: "arrival-shoulder",
    final: "final-entry",
  },
});

export function townHexacopterArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  return placeRoute(ARRIVAL, berth, ARRIVAL.markerProgress("final"));
}

function localOffsetFromWorldAxes(offset: SceneVector3): SceneVector3 {
  return [
    offset[0] * HEXACOPTER_NOSE[0] + offset[2] * HEXACOPTER_NOSE[2],
    offset[1],
    offset[0] * LATERAL[0] + offset[2] * LATERAL[2],
  ];
}

/**
 * Аварийный уход. Машина стоит в колодце двора, поэтому уход у неё
 * единственно возможный: сначала ВВЕРХ над парапетами, и только потом в
 * сторону. Никакого разворота на месте между домами.
 */
export function townHexacopterEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const start = localOffsetFromWorldAxes(input.start);
  const forwardLength = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [
    input.forward[0] / forwardLength,
    0,
    input.forward[2] / forwardLength,
  ];
  const localForward: SceneVector3 = [
    forward[0] * HEXACOPTER_NOSE[0] + forward[2] * HEXACOPTER_NOSE[2],
    0,
    forward[0] * LATERAL[0] + forward[2] * LATERAL[2],
  ];
  const localRight: SceneVector3 = [localForward[2], 0, -localForward[0]];
  const relative = (ahead: number, right: number): SceneVector3 => [
    start[0] + localForward[0] * ahead + localRight[0] * right,
    0,
    start[2] + localForward[2] * ahead + localRight[2] * right,
  ];
  let climbComplete = 1;
  const route = createMotionRoute({
    id: "town-hexacopter:emergency-escape",
    nodes: [
      { id: "failure-pose", position: [start[0], 0, start[2]], outgoing: relative(9, 0) },
      {
        id: "above-yard",
        position: relative(22, 0),
        incoming: relative(13, 0),
        outgoing: relative(40, -8),
        samples: 40,
      },
      {
        id: "recovery-gate",
        position: relative(74, -34),
        incoming: relative(52, -18),
        outgoing: relative(104, -56),
        samples: 56,
      },
      {
        id: "horizon-exit",
        position: relative(178, -118),
        incoming: relative(146, -92),
        samples: 56,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) =>
        start[1] +
        26 * smootherStep(progress / Math.max(1e-6, climbComplete)),
      speedLimit: ({ progress }) => (progress < climbComplete ? 5 : 12),
    },
    markers: {
      climbComplete: "above-yard",
      recoveryGate: "recovery-gate",
      disappear: "horizon-exit",
    },
  });
  climbComplete = route.markerProgress("climbComplete");
  const placed = placeRoute(route, berth, Number.POSITIVE_INFINITY);
  return {
    ...placed,
    // Пока машина лезет из колодца двора, смотреть вперёд на полсотни метров
    // бессмысленно: там стена. Упреждение растёт вместе с высотой.
    guidanceLookahead(progress) {
      return progress < climbComplete ? 10 : 46;
    },
  };
}

export function townHexacopterRoutePhase(
  kind: TownHexacopterFlightKind,
  progress: number,
): MotionRoutePhase {
  return motionRoutePhase(
    townHexacopterRoute(kind),
    progress,
    "departureComplete",
    "arriving",
  );
}

/** Площадка в мировых координатах — берт для всех планов этой машины. */
export const TOWN_HEXACOPTER_BERTH: SceneVector3 = [
  HEXACOPTER_PAD_X,
  0,
  HEXACOPTER_PAD_Z,
];
