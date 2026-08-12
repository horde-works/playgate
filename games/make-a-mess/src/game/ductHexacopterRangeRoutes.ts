import type { SceneVector3 } from "./destructionScene.ts";
import {
  landingApproachPlan,
  type LandingApproachOptions,
} from "./landingApproach.ts";
import type { RouteFigureStation } from "./flightFigures.ts";
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
 * ПОКАЗАТЕЛЬНАЯ ПРОГРАММА VX-8 «Yaqui».
 *
 * Это НЕ программа RAX-8 и не попытка её повторить. Соседняя машина лёгкая,
 * вёрткая и живёт дугами: её трасса — плетение шпилек и петель разного
 * размера. Эта вдвое тяжелее, вдвое инертнее по рысканию и по наклону даже
 * слабее — 10.9 м/с² против 14.5. Дать ей чужую программу значило бы показать,
 * чего она НЕ умеет.
 *
 * ЧТО ОНА УМЕЕТ, ЧЕГО НЕ УМЕЕТ НИКТО: тоннели вдоль носа дают 53.9 м/с² —
 * пять с половиной g, впятеро больше её собственного наклона и вдвое больше
 * продольной тяги RAX-8. Отсюда выведена ВСЯ форма трассы, и это не метафора:
 *
 *   - машине, тормозящей с пяти с половиной g, не нужны скруглённые углы. Ей
 *     нужны ПРЯМЫЕ и ПОВОРОТЫ. Разгон с 20 до 30 м/с стоит ей 0.19 с и пяти
 *     метров — то есть на стодесятиметровой прямой она идёт полным ходом
 *     практически всю прямую, а не разгоняется полпрямой, как обычный коптер;
 *   - поэтому трасса — ОВАЛ: прямые по 110 м и развороты радиусом 39.7.
 *     Радиус не выбран, а ВЫВЕДЕН из положения пада (см. ниже), и уже из него
 *     получается ход разворота: `√(10.9·39.7) = 20.8 м/с` — столько машина
 *     держит по наклону, и с этого хода тоннели поднимают её до тридцати;
 *   - и отсюда же её фигура, которой у винтокрылой машины быть не должно, —
 *     КУЛЬБИТ. Полупетля, реверс тоннелей, кувырок через нос и уход тем же
 *     курсом ВЫШЕ входа. Разбор — в `flightFigures.ts`.
 *
 * ОВАЛ ПРОХОДИТ ЧЕРЕЗ ПАД, как раньше проходил круг, — но теперь пад лежит
 * ПОСЕРЕДИНЕ прямой, а не где придётся. Это не украшение: середина прямой —
 * единственное место, где у машины есть и полсотни метров разбега до площадки,
 * и полсотни после. Рейс начинается и кончается на своей площадке, а дважды в
 * середине программы машина проходит над ней — первый раз на шестнадцати
 * метрах полным ходом.
 *
 * КУРСА ОТДЕЛЬНО ЗДЕСЬ НЕ ОБЪЯВЛЕНО, и это решение, а не пропуск. У RAX-8
 * номер «нос на площадку» есть, потому что его трасса площадку ОБХОДИТ. Здесь
 * пад лежит на самой прямой: направление на него совпадает с касательной, и
 * требование курса выродилось бы в тождество.
 */

/** Вынос пада от центра полигона — он же и держит овал на месте. */
export const DUCT_HEXACOPTER_LAP_RADIUS = Math.hypot(
  DUCT_HEXACOPTER_RANGE_PAD_X,
  DUCT_HEXACOPTER_RANGE_PAD_Z,
);

/** Полудлина прямой овала, м. */
export const DUCT_HEXACOPTER_STRAIGHT_HALF = 55;
/**
 * РАДИУС РАЗВОРОТА РАВЕН ВЫНОСУ ПАДА ОТ ЦЕНТРА, И ЭТО НЕ СОВПАДЕНИЕ.
 *
 * Прямая овала отстоит от центра ровно на радиус разворота. Значит, пад лежит
 * ПОСЕРЕДИНЕ прямой тогда и только тогда, когда радиус равен его выносу —
 * 39.7 м. Любой другой радиус сдвигает пад к краю прямой, и оба края плохи:
 * у дальнего губернатор уже тормозит под разворот, у ближнего не остаётся
 * места на заход.
 *
 * Замер прежней редакции (радиус 30, пад в 26 м от середины): над падом машина
 * шла 19.2 м/с вместо тридцати — не потому, что не могла разогнаться, а потому,
 * что в двадцати девяти метрах от неё начинался разворот, и упреждение
 * губернатора его уже видело.
 *
 * Побочная выгода: радиус больше — разворот быстрее. `√(10.9·39.7) = 20.8 м/с`
 * против 18.1.
 */
export const DUCT_HEXACOPTER_TURN_RADIUS = DUCT_HEXACOPTER_LAP_RADIUS;
/** Ход на прямой: то, ради чего трасса выпрямлена. */
export const DUCT_HEXACOPTER_DASH_SPEED = 30;
export const DUCT_HEXACOPTER_TURN_SPEED = 20;
export const DUCT_HEXACOPTER_LAP_CORRIDOR = 9;
export const DUCT_HEXACOPTER_LAPS = 3;
/** Годное небо над полигоном — то же число, что у программы RAX-8. */
export const DUCT_HEXACOPTER_RANGE_SKY = 150;

/**
 * ВЫСОТЫ АКТОВ. Программа трёхмерна: она ныряет к площадке и уходит под
 * фигурный этаж, и обе крайности выведены, а не назначены.
 *
 *   - `LOW` 16 м: проход над падом. Ниже нельзя — над этим миром идёт
 *     программа RAX-8, её самое низкое место 22 м, а вертипад HX-6 стоит на
 *     3.1 м. Шестнадцать проходит между ними;
 *   - `OPEN` 30 м: этаж первого кульбита. Ворота требуют возврата из
 *     перевёрнутого — у этой машины он стоит 21.4 м, — и тридцать даёт запас;
 *   - `HIGH` 58 м: этаж фигурного акта. Число диктует БОЧКА: за полный оборот
 *     вертикальная составляющая тяги гасит сама себя, машина проходит бочку
 *     баллистически и объявляет провал 30.9 м. Вместе с возвратом из
 *     перевёрнутого это 52.3 м — вот откуда пятьдесят восемь.
 */
const ALTITUDE_LOW = 16;
const ALTITUDE_OPEN = 30;
const ALTITUDE_HIGH = 58;
/** Этаж большой петли: возврат 21.4 плюс её собственный провал 15.2. */
const ALTITUDE_LOOP = 44;
/** Этаж наклонённой петли и второго кульбита: 21.4 плюс провал 10.6. */
const ALTITUDE_SLANT = 46;
const ALTITUDE_HOME = 24;

/**
 * Центр полигона в координатах, отсчитанных ОТ БЕРТА: трасса всегда строится
 * берт-относительной, а мировую точку из неё делает `placedPlan`.
 */
const CENTRE_FROM_BERTH: readonly [number, number] = [
  -DUCT_HEXACOPTER_RANGE_PAD_X,
  -DUCT_HEXACOPTER_RANGE_PAD_Z,
];

/**
 * ОРИЕНТАЦИЯ ОВАЛА ВЫВЕДЕНА ИЗ ТРЕБОВАНИЯ «ПАД ЛЕЖИТ НА ПРЯМОЙ».
 *
 * Прямая отстоит от центра ровно на радиус разворота, значит поперечная
 * координата пада обязана равняться этому радиусу. Пад виден из центра под
 * углом ψ на расстоянии 39.7 — отсюда нормаль стоит под углом
 * `ψ − arccos(R/39.7)`, и больше выбирать нечего. Продольная координата пада
 * получается сама: `√(39.7² − R²)`.
 *
 * Выражение общее и работает при любом радиусе, но у ЭТОГО радиуса корень
 * обращается в ноль — и в этом весь смысл выбора: `PAD_ALONG = 0` означает
 * «пад точно посередине прямой». Написано общей формулой, а не нулём, чтобы
 * правка радиуса не превратила середину в молчаливую ложь.
 */
const PAD_BEARING = Math.atan2(
  -CENTRE_FROM_BERTH[1],
  -CENTRE_FROM_BERTH[0],
);
const NORMAL_ANGLE =
  PAD_BEARING -
  Math.acos(
    Math.min(1, DUCT_HEXACOPTER_TURN_RADIUS / DUCT_HEXACOPTER_LAP_RADIUS),
  );
/** Поперечная ось овала: от центра к верхней прямой. */
const CROSS: readonly [number, number] = [
  Math.cos(NORMAL_ANGLE),
  Math.sin(NORMAL_ANGLE),
];
/** Продольная ось овала: вдоль прямых, в сторону пада. */
const AXIS: readonly [number, number] = [-CROSS[1], CROSS[0]];
/** Где пад стоит на верхней прямой, м от её середины. */
const PAD_ALONG = Math.sqrt(
  Math.max(
    0,
    DUCT_HEXACOPTER_LAP_RADIUS * DUCT_HEXACOPTER_LAP_RADIUS -
      DUCT_HEXACOPTER_TURN_RADIUS * DUCT_HEXACOPTER_TURN_RADIUS,
  ),
);

const plane = (along: number, cross: number): SceneVector3 => [
  CENTRE_FROM_BERTH[0] + AXIS[0] * along + CROSS[0] * cross,
  0,
  CENTRE_FROM_BERTH[1] + AXIS[1] * along + CROSS[1] * cross,
];

interface Leg {
  readonly id: string;
  readonly length: number;
  /** Доля длины участка → точка и единичная касательная в плоскости. */
  at(fraction: number): {
    readonly point: SceneVector3;
    readonly tangent: readonly [number, number];
  };
}

const straight = (
  id: string,
  fromAlong: number,
  toAlong: number,
  cross: number,
): Leg => {
  const span = toAlong - fromAlong;
  const sign = Math.sign(span) || 1;
  const tangent: readonly [number, number] = [
    AXIS[0] * sign,
    AXIS[1] * sign,
  ];
  return {
    id,
    length: Math.abs(span),
    at: (fraction) => ({
      point: plane(fromAlong + span * fraction, cross),
      tangent,
    }),
  };
};

/**
 * Полукруг разворота на торце овала. `side` = +1 — дальний торец (тот, к
 * которому смотрит пад), −1 — ближний; `fromCross` говорит, с какой из двух
 * прямых дуга начинается, и знака его достаточно, чтобы задать весь обход:
 * дуга всегда выпучивается НАРУЖУ, за конец прямой.
 */
const turn = (id: string, side: number, fromCross: number): Leg => {
  const radius = DUCT_HEXACOPTER_TURN_RADIUS;
  const centreAlong = side * DUCT_HEXACOPTER_STRAIGHT_HALF;
  const from = Math.sign(fromCross) || 1;
  return {
    id,
    length: Math.PI * radius,
    at(fraction) {
      const angle = Math.PI * Math.max(0, Math.min(1, fraction));
      const along = centreAlong + side * radius * Math.sin(angle);
      const cross = from * radius * Math.cos(angle);
      const dAlong = side * Math.cos(angle);
      const dCross = -from * Math.sin(angle);
      const length = Math.hypot(dAlong, dCross) || 1;
      return {
        point: plane(along, cross),
        tangent: [
          (AXIS[0] * dAlong + CROSS[0] * dCross) / length,
          (AXIS[1] * dAlong + CROSS[1] * dCross) / length,
        ],
      };
    },
  };
};

const HALF = DUCT_HEXACOPTER_STRAIGHT_HALF;
const CROSS_OFFSET = DUCT_HEXACOPTER_TURN_RADIUS;

/**
 * ПРОГРАММА ПО АКТАМ. Овал обходится трижды; прямые пронумерованы по порядку
 * прохождения, и именно на них стоят номера.
 *
 * Три круга, а не два, — по счёту, а не по вкусу. Номеров пять, и каждой
 * фигуре, которая ТЕРЯЕТ высоту, нужна своя прямая: бочка съедает
 * восемнадцать метров, петля — шестнадцать, и поставленные подряд они сажают
 * машину на два этажа ниже объявленного. Замер двухкруговой редакции: бочка
 * вошла на 56 м и вышла на 38, петля следом вошла на 38 и вышла на 22, а
 * наклонённая петля была ПРОПУЩЕНА воротами — «не хватает высоты на возврат».
 * Ворота сработали правильно; неправильной была раскладка.
 *
 * Верхняя прямая первого круга остаётся ЧИСТОЙ: на ней машина проходит над
 * собственной площадкой на шестнадцати метрах полным ходом, и номер здесь
 * только помешал бы.
 */
const LEGS: readonly Leg[] = (() => {
  const legs: Leg[] = [straight("open", PAD_ALONG, HALF, CROSS_OFFSET)];
  for (let lap = 1; lap <= DUCT_HEXACOPTER_LAPS; lap += 1) {
    legs.push(turn(`turn-${lap}a`, 1, CROSS_OFFSET));
    legs.push(straight(`bottom-${lap}`, HALF, -HALF, -CROSS_OFFSET));
    legs.push(turn(`turn-${lap}b`, -1, -CROSS_OFFSET));
    legs.push(
      lap === DUCT_HEXACOPTER_LAPS
        ? straight("home", -HALF, PAD_ALONG, CROSS_OFFSET)
        : straight(`top-${lap}`, -HALF, HALF, CROSS_OFFSET),
    );
  }
  return legs;
})();

/** Шаг узлов, м. Меньше — точнее дуга, больше — дешевле обсчёт. */
const NODE_SPACING = 7;

interface BuiltNode {
  readonly id: string;
  readonly position: SceneVector3;
  readonly incoming: SceneVector3;
  readonly outgoing: SceneVector3;
  readonly samples: number;
}

/** Метры от старта до конца каждого участка — по ним и стоят номера. */
const LEG_END_METRES: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  let walked = 0;
  for (const leg of LEGS) {
    walked += leg.length;
    map.set(leg.id, walked);
  }
  return map;
})();

const ROUTE_METRES = LEG_END_METRES.get(LEGS[LEGS.length - 1].id) ?? 1;

const legEnd = (id: string): number => LEG_END_METRES.get(id) ?? 0;
const legStart = (id: string): number => {
  const index = LEGS.findIndex((leg) => leg.id === id);
  return index <= 0 ? 0 : legEnd(LEGS[index - 1].id);
};
/** Доля трассы в точке `fraction` внутри участка. */
const within = (id: string, fraction: number): number =>
  (legStart(id) + (legEnd(id) - legStart(id)) * fraction) / ROUTE_METRES;

const NODES: readonly BuiltNode[] = (() => {
  const built: BuiltNode[] = [];
  LEGS.forEach((leg, index) => {
    const steps = Math.max(2, Math.round(leg.length / NODE_SPACING));
    // Первый узел участка — это последний узел предыдущего, и ставить его
    // дважды нельзя: повторная точка обнуляет касательную и рвёт кривую.
    for (let step = index === 0 ? 0 : 1; step <= steps; step += 1) {
      const fraction = step / steps;
      const { point, tangent } = leg.at(fraction);
      const handle = leg.length / steps / 3;
      built.push({
        id:
          step === steps
            ? leg.id
            : `${leg.id}-${step}`,
        position: point,
        incoming: [
          point[0] - tangent[0] * handle,
          0,
          point[2] - tangent[1] * handle,
        ],
        outgoing: [
          point[0] + tangent[0] * handle,
          0,
          point[2] + tangent[1] * handle,
        ],
        samples: 24,
      });
    }
  });
  return built.map((node, index) => ({
    ...node,
    id: index === 0 ? "berth" : index === built.length - 1 ? "dock" : node.id,
  }));
})();

/**
 * Узел, ближайший к заданной отметке пути. Нужен для маркеров: створ и «на
 * подходе» — это РАССТОЯНИЯ до причала, а не порядковые номера узлов. Прежняя
 * редакция ставила их отсчётом от конца списка, и когда шаг узлов сменился с
 * пятнадцати метров на семь, створ молча переехал с сорока семи метров на
 * семь — то есть заход включался практически на причале.
 */
const NODE_METRES: readonly number[] = (() => {
  const walked: number[] = [0];
  for (let index = 1; index < NODES.length; index += 1) {
    walked.push(
      walked[index - 1] +
        Math.hypot(
          NODES[index].position[0] - NODES[index - 1].position[0],
          NODES[index].position[2] - NODES[index - 1].position[2],
        ),
    );
  }
  return walked;
})();

const nodeNearMetres = (metres: number): string => {
  let best = 0;
  for (let index = 1; index < NODES.length; index += 1) {
    if (
      Math.abs(NODE_METRES[index] - metres) <
      Math.abs(NODE_METRES[best] - metres)
    ) {
      best = index;
    }
  }
  return NODES[best].id;
};

const nodeNearFromEnd = (metres: number): string =>
  nodeNearMetres(NODE_METRES[NODE_METRES.length - 1] - metres);

/**
 * Плавное окно вместо ступеньки. Требование, меняющееся скачком, само по себе
 * ворота: губернатор видит обрыв разрешённого хода и тормозит в пол, а сторож
 * расхождения — обрыв коридора и объявляет уход с трассы там, где машина не
 * двинулась. Поэтому у каждой границы акта есть разбег.
 */
const RAMP = 14;
const blend = (metres: number, from: number, to: number): number => {
  const raw = Math.min(
    (metres - from) / RAMP,
    (to - metres) / RAMP,
  );
  const t = Math.max(0, Math.min(1, raw));
  return t * t * (3 - 2 * t);
};

/**
 * ПРОФИЛЬ ВЫСОТЫ — КУСОЧНО-ЛИНЕЙНЫЙ ПО МЕТРАМ, СО СГЛАЖЕННЫМИ УГЛАМИ.
 *
 * Ключи стоят на границах актов, а не «где-то по доле»: этаж принадлежит акту,
 * и когда акт двигают, этаж обязан ехать с ним, а не оставаться на прежней
 * доле. Ноль на обоих концах — иначе садиться некуда, и это уже стоило рейса:
 * прежняя трасса держала восемнадцать метров вплоть до самой точки «док», то
 * есть причал висел в небе.
 */
const ALTITUDE_KEYS: readonly (readonly [number, number])[] = [
  [0, 0],
  [26, ALTITUDE_OPEN * 0.5],
  [legEnd("turn-1a"), ALTITUDE_OPEN],
  [legEnd("bottom-1"), ALTITUDE_OPEN],
  [legEnd("turn-1b"), ALTITUDE_LOW],
  [legEnd("top-1"), ALTITUDE_LOW],
  [legEnd("turn-2a"), ALTITUDE_HIGH],
  [legEnd("bottom-2"), ALTITUDE_HIGH],
  [legEnd("turn-2b"), ALTITUDE_LOOP],
  [legEnd("top-2"), ALTITUDE_LOOP],
  [legEnd("turn-3a"), ALTITUDE_SLANT],
  [legEnd("bottom-3"), ALTITUDE_SLANT],
  [legEnd("turn-3b"), ALTITUDE_HOME],
  [ROUTE_METRES - 46, ALTITUDE_HOME],
  [ROUTE_METRES, 0],
];

function altitudeAt(metres: number): number {
  for (let index = 1; index < ALTITUDE_KEYS.length; index += 1) {
    const [toMetres, toValue] = ALTITUDE_KEYS[index];
    if (metres > toMetres) continue;
    const [fromMetres, fromValue] = ALTITUDE_KEYS[index - 1];
    const span = Math.max(1e-6, toMetres - fromMetres);
    const t = Math.max(0, Math.min(1, (metres - fromMetres) / span));
    return fromValue + (toValue - fromValue) * (t * t * (3 - 2 * t));
  }
  return 0;
}

/**
 * НОМЕРА ПРОГРАММЫ.
 *
 * Их пять, и распределены они не по вкусу, а по этажам. Кульбит открывает
 * программу на тридцати метрах — раньше всех, потому что он и есть номер, ради
 * которого её переписывали, и показать его надо, пока рейс заведомо цел.
 * Остальные четыре стоят на второй нижней прямой, на пятидесяти восьми: там
 * этаж поднят под бочку, а бочка — самая требовательная к высоте фигура этой
 * машины.
 *
 * ФИГУРЫ НЕ ЕДЯТ ТРАССУ. У всех пяти `resumeAt` равен `at`, и это не небрежность:
 * ни кульбит, ни петля, ни бочка курса не разворачивают и оставляют машину там
 * же, откуда взяли. Заменять кусок трассы обязаны только иммельман и петля
 * вниз — их в программе нет, и об этом отдельно: обе разворачивают курс на
 * 180°, а овал разворачивается полукругом радиусом тридцать, то есть со сносом
 * в шестьдесят метров вбок. Фигура, разворачивающая машину НА МЕСТЕ, вернула бы
 * её на трассу с промахом ровно в эти шестьдесят метров.
 *
 * Поэтому четыре номера подряд на одной прямой — не теснота, а следствие: они
 * ничего не занимают, кроме времени, и машина отрабатывает их над одним и тем
 * же куском полигона. Так и устроен показательный пилотаж.
 */
const FIGURE_SPEED_LOOP = 18;
const FIGURE_SPEED_SLANT = 15;
const FIGURE_SPEED_KULBIT = 14;
const FIGURE_SPEED_ROLL = 20;

/** Насколько широко коридор отпускается вокруг номера, м по трассе. */
const FIGURE_CORRIDOR_RUN = 34;
/** И насколько широко — в метрах от линии. */
const FIGURE_CORRIDOR = 34;
/** Прямые, на которых объявлен полный ход. Развороты идут по наклону. */
const DASH_LEGS: readonly string[] = LEGS.filter(
  (leg) => leg.id.startsWith("bottom") || leg.id.startsWith("top"),
).map((leg) => leg.id);

export const ductHexacopterRangeFigures: readonly RouteFigureStation[] = [
  {
    // Кульбит с полной дугой входа: полупетля вверх, реверс, кувырок.
    key: "kulbit-open",
    kind: "kulbit",
    at: within("bottom-1", 0.45),
    resumeAt: within("bottom-1", 0.45),
    speed: FIGURE_SPEED_KULBIT,
    floor: ALTITUDE_OPEN,
    sky: DUCT_HEXACOPTER_RANGE_SKY,
  },
  {
    // Самая требовательная к высоте фигура машины — оттого и на верхнем этаже.
    key: "roll-high",
    kind: "roll",
    at: within("bottom-2", 0.45),
    resumeAt: within("bottom-2", 0.45),
    speed: FIGURE_SPEED_ROLL,
    floor: ALTITUDE_HIGH,
    sky: DUCT_HEXACOPTER_RANGE_SKY,
  },
  {
    key: "loop-wide",
    kind: "loop",
    at: within("top-2", 0.45),
    resumeAt: within("top-2", 0.45),
    speed: FIGURE_SPEED_LOOP,
    floor: ALTITUDE_LOOP,
    sky: DUCT_HEXACOPTER_RANGE_SKY,
  },
  {
    // Завал плоскости: кольцо становится винтом и уносит машину вбок.
    key: "loop-slant",
    kind: "loop",
    at: within("bottom-3", 0.3),
    resumeAt: within("bottom-3", 0.3),
    speed: FIGURE_SPEED_SLANT,
    bank: 0.5,
    floor: ALTITUDE_SLANT,
    sky: DUCT_HEXACOPTER_RANGE_SKY,
  },
  {
    // Второй кульбит — с УКОРОЧЕННОЙ дугой входа: машина не доходит до верхней
    // точки петли, а срывается в кувырок раньше. Фигура выходит резче и ниже,
    // и это другой номер, а не тот же дважды.
    //
    // Стоит он сразу за наклонённой петлёй, и это единственное место в
    // программе, где два номера идут подряд. Можно потому, что кульбит
    // ПОДНИМАЕТ: ему безразлично, что предыдущая фигура оставила машину на
    // десять метров ниже этажа.
    key: "kulbit-snap",
    kind: "kulbit",
    at: within("bottom-3", 0.72),
    resumeAt: within("bottom-3", 0.72),
    speed: FIGURE_SPEED_KULBIT,
    sweep: Math.PI * 0.7,
    floor: ALTITUDE_SLANT,
    sky: DUCT_HEXACOPTER_RANGE_SKY,
  },
];

const FIGURES = ductHexacopterRangeFigures;

const lapOval: MotionRouteArtifact = createMotionRoute({
  id: "duct-hexacopter:range-lap",
  nodes: NODES,
  measureAxes: [0, 2],
  markers: {
    departureComplete: nodeNearMetres(22),
    arriving: nodeNearFromEnd(78),
    // СТВОР — УЗЕЛ ПЕРЕД ПРИЧАЛОМ, а не сам причал. Заход, включающийся в
    // последней точке, не заход: машине нужен участок, на котором она уже
    // ведёт МЕСТО, а не скорость. Сорок восемь метров — это около шести секунд
    // на створовом ходу, и меньше этого машине не хватает на выравнивание.
    final: nodeNearFromEnd(48),
  },
  requirements: {
    altitude: ({ progress }) => altitudeAt(progress * ROUTE_METRES),
    /**
     * СКОРОСТЬ ОБЪЯВЛЕНА ПО АКТАМ, а не одной цифрой на всю трассу, и разница
     * между актами — весь смысл этой машины. Тридцать на прямой и восемнадцать
     * в развороте: губернатор и сам зажал бы разворот по кривизне, но объявить
     * разницу надо, потому что она НАМЕРЕННАЯ, а не вынужденная.
     */
    speedLimit: ({ progress }) => {
      const metres = progress * ROUTE_METRES;
      const toDock = ROUTE_METRES - metres;
      if (metres < 26) return 5;
      if (toDock < 18) return 4;
      if (toDock < 60) return 9;
      // Прямые идут полным ходом, развороты — по наклону, а между ними
      // разбег: обрыв разрешённого хода губернатор читает как стену.
      let dash = 0;
      for (const leg of DASH_LEGS) {
        dash = Math.max(dash, blend(metres, legStart(leg), legEnd(leg)));
      }
      return (
        DUCT_HEXACOPTER_TURN_SPEED +
        (DUCT_HEXACOPTER_DASH_SPEED - DUCT_HEXACOPTER_TURN_SPEED) * dash
      );
    },
    /**
     * КОРИДОР ОБЯЗАТЕЛЕН: общий контракт трассы спрашивает его наравне с
     * высотой и скоростью, и отсутствие требования — это не «по умолчанию
     * широко», а исключение при первом же обращении.
     *
     * У земли он строгий: там точность — вопрос столкновения. На фигурной
     * прямой — широкий, и это то же правило, что у соседней машины: там, где
     * трасса объявила фигуру, она объявила и уход с линии. Требовать точности
     * от машины, которую сама же отправила крутить кульбит, значит называть
     * отказом исполнение собственного требования.
     */
    corridor: ({ progress }) => {
      const metres = progress * ROUTE_METRES;
      const toDock = ROUTE_METRES - metres;
      // У ПРИЧАЛА КОРИДОР СУЖАЕТСЯ СТУПЕНЬКАМИ, А НЕ РАЗОМ.
      //
      // Четыре метра за тридцать до причала — это требование сойтись на линию
      // раньше, чем машина физически успевает: заход у неё начинается за
      // сорок восемь метров, и первые двадцать она ещё гасит боковой снос.
      // Сторож расхождения объявлял это уходом с трассы на доле 0.987 — то
      // есть в самом створе, за пятнадцать метров до площадки.
      if (metres < 30) return 4;
      if (toDock < 14) return 4;
      if (toDock < 70) return 12;
      let figuring = 0;
      for (const station of FIGURES) {
        const centre = station.at * ROUTE_METRES;
        figuring = Math.max(
          figuring,
          blend(
            metres,
            centre - FIGURE_CORRIDOR_RUN - RAMP,
            centre + FIGURE_CORRIDOR_RUN + RAMP,
          ),
        );
      }
      return (
        DUCT_HEXACOPTER_LAP_CORRIDOR +
        (FIGURE_CORRIDOR - DUCT_HEXACOPTER_LAP_CORRIDOR) * figuring
      );
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
    ...placedPlan(lapOval, berth, lapOval.markerProgress("final")),
    figures: ductHexacopterRangeFigures,
    // ВЗЛЁТ И ПОСАДКА — ОТДЕЛЬНЫЕ ТРЕБОВАНИЯ, а не следствие профиля высоты.
    // Без них машина уходит с пада по диагонали и приходит на него так же, а
    // приходить на площадку надо сверху.
    verticalDeparture: {
      altitude: berth[1] + DUCT_HEXACOPTER_CLEARANCE_ALTITUDE,
      until: lapOval.markerProgress("departureComplete"),
      tolerance: 0.75,
    },
    verticalArrival: {
      altitude: berth[1] + DUCT_HEXACOPTER_CLEARANCE_ALTITUDE,
      from: lapOval.markerProgress("final"),
      horizontalTolerance: 0.85,
    },
    // Упреждение под собственный радиус разворота: машина широкая и тяжёлая,
    // и смотреть ей надо дальше, чем RAX-8 с его вдвое меньшей инерцией.
    guidanceLookahead: () => 24,
  };
}

/**
 * ЗАХОД — ЭТО ПОСАДКА, А НЕ ЕЩЁ ОДИН КРУГ.
 *
 * Здесь стояло `return ductHexacopterLapPlan(berth)`: «заходом» подменной
 * машины служил тот самый маршрут, который летел предыдущий борт. Машину
 * ставили в начало прошлого круга, и она честно шла его целиком вместо того,
 * чтобы сесть. Наблюдение Igor (12.08.2026): «траектория подменной машины —
 * это по-прежнему старая траектория, по которой летел предыдущий».
 *
 * Форма общая с соседней машиной (`landingApproach.ts`): ровный ход на высоте
 * отрыва, постановка над площадкой, вертикальное снижение. Пеленг и точка
 * отзыва — доводы: подменные суда приходят с разных сторон, а отзыв с пульта
 * строит тот же заход от текущего места машины.
 */
export function ductHexacopterArrivalPlan(
  berth: SceneVector3,
  options?: LandingApproachOptions,
): VehicleRoutePlan {
  return landingApproachPlan(
    berth,
    {
      id: "duct-hexacopter:range-approach",
      clearance: DUCT_HEXACOPTER_CLEARANCE_ALTITUDE,
      // Машина крупная и тяжёлая: подходит спокойнее соседней и коридор ей
      // нужен шире собственного полуразмаха.
      cruiseSpeed: 13,
      corridor: 12,
    },
    options,
  );
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
  // Уход идёт на этаже открытия программы: ниже — чужие фигуры и пульты, выше
  // незачем, машина уже в беде.
  const floor = ALTITUDE_OPEN;
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
  return motionRoutePhase(lapOval, progress, "departureComplete", "arriving");
}
