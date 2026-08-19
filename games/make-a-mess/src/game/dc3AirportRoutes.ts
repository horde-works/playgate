import { airplaneReferenceSpeed, AIRPLANE_TURN_RESERVE, CLIMB_RESPONSE_SECONDS,
  airplaneTakeoffClimbAngle,
  TAKEOFF_MANOEUVRE_HEIGHT,
} from "./airplaneDynamics.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
  type MotionRoutePhase,
} from "./motionRoute.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";
import {
  DC3_AIRPLANE_PASSPORT,
  DC3_DESIGN_TAKEOFF_RUN,
  DC3_GUIDANCE_CENTRE_HEIGHT,
  DC3_LIFT_TRIM_RANGE,
} from "./dc3Airplane.ts";
import {
  AIRPORT_RUNWAY,
  AIRPORT_RUNWAY_08,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_TAXI_LINKS,
} from "../content/scenes/islandAirport/islandAirportPlan.ts";

/**
 * ТРАССА КРЫЛАТОЙ МАШИНЫ: У НЕЁ ЕСТЬ ПОЛОСА, И ЭТО МЕНЯЕТ ВСЁ.
 *
 * У винтокрылой машины отход и приход вертикальны, и трасса объявляет их
 * полками (`verticalDeparture` / `verticalArrival`). У самолёта таких полок
 * нет и быть не может: он уходит РАЗБЕГОМ вдоль полосы и приходит ГЛИССАДОЙ
 * на её ось. Поэтому вся вертикаль здесь живёт в профиле высоты, а первый и
 * последний участки трассы идут по бетону на высоте плиты — машина честно
 * катится по ним на своих колёсах, и прогресс, как всегда, снимается с
 * физической проекции, а не со времени.
 *
 * Круг считается ФОРМУЛОЙ (§5.4): дуга задаётся углом, а ручки Безье —
 * `4/3·tg(шаг/4)·R`, поэтому окружность выходит окружностью, а не многоугольником
 * из поставленных на глаз точек.
 *
 * РАЗМЕР КРУГА ВЫВОДИТСЯ ИЗ ПАСПОРТА, а не выбирается: радиус виража равен
 * `V²/(g·tg φmax)`, и трасса обязана быть шире — иначе машина не впишется и
 * будет резать угол весь полёт. При 46 м/с и паспортных 40° это 264 м, и
 * круг проложен по 285.
 */

export type Dc3FlightKind = "survey" | "taxi";

const passport = DC3_AIRPLANE_PASSPORT;

/** Минимальный радиус координированного виража на круговой скорости. */
/**
 * СКОРОСТЬ КРУГА ВЫБИРАЕТСЯ НЕ ПО ВКУСУ, А ПО МЕСТУ.
 *
 * Вираж растёт как квадрат хода, и меньший круг соблазнителен. Но запас по
 * подъёмной силе падает БЫСТРЕЕ: на 38 м/с при полной просьбе о наборе крыло
 * упирается в свой Clmax уже на двадцати пяти градусах крена, и машина
 * срывается прямо в развороте. Сорок четыре — 1.42 скорости сваливания:
 * круг больше, зато в вираже остаётся чем управлять.
 */
export const DC3_CIRCUIT_SPEED = 44;

/**
 * КРЕЙСЕРСКАЯ ПОЛКА ОБЗОРНОГО КРУГА, м/с (≈200 км/ч).
 *
 * Одна полка 44 на весь маршрут была ошибкой авторства: число выведено из
 * радиуса КРУТЫХ разворотов (376 м), а большой круг летится радиусом ~1000 м,
 * где 55 м/с стоят семнадцати градусов крена. Машина ползала весь обзор на
 * скорости манёвра — как если бы по прямой шоссе ехали со скоростью
 * перекрёстка. Полки — намерение участка: крейсер на кругу, гашение перед
 * крутыми разворотами, заход на скорости захода; рабочую точку внутри полки
 * считает governor от живого паспорта.
 */
export const DC3_CRUISE_BAND = 55;
export const DC3_TURN_RADIUS =
  (DC3_CIRCUIT_SPEED * DC3_CIRCUIT_SPEED) /
  (9.81 * Math.tan(passport.maximumBank));
/**
 * ГДЕ МАШИНА НАЧИНАЕТ ПЕРВЫЙ РАЗВОРОТ, считая от центра острова вдоль полосы.
 * Раньше — круче круг; позже — шире, но зато машина успевает набрать высоту.
 * Сто метров были ошибкой: разворот начинался в полусотне метров от точки
 * отрыва, машина клала сорок градусов крена на восьми метрах над водой и
 * задевала её раньше, чем выходила из разворота. Триста дают четверть
 * километра прямого набора — около тридцати метров высоты перед креном.
 */
export const DC3_TURN_ENTRY_X = (() => {
  // ── ТРАССА НЕ ПРОСИТ КРЕНА РАНЬШЕ, ЧЕМ МАШИНА ЕГО ОТКРЫВАЕТ ────────────
  //
  // Триста метров были следующей ошибкой того же рода: они давали около
  // тридцати метров высоты, а машина открывает манёвр полностью только к
  // шестидесяти (`TAKEOFF_MANOEUVRE_HEIGHT`) — до того её собственный автомат
  // держит крылья горизонтально. Трасса же просила в этой точке пятнадцать
  // градусов крена ОДНОВРЕМЕННО с восемью с половиной градусами набора.
  //
  // Точка входа не назначается, а считается: это путь, за который профиль
  // взлёта добирается до высоты открытия манёвра, со скруглением включительно.
  const slope = Math.tan(airplaneTakeoffClimbAngle(DC3_AIRPLANE_PASSPORT));
  const round = dc3ProfileRounding(slope, DC3_AIRPLANE_PASSPORT.cruiseSpeed);
  const run = TAKEOFF_MANOEUVRE_HEIGHT / slope + round / 2;
  return AIRPORT_RUNWAY.westDesignatorX + DC3_DESIGN_TAKEOFF_RUN + run;
})();

/**
 * РАДИУС РАЗВОРОТОВ ТРАССЫ. Паспортный вираж — это ПРЕДЕЛ, а не рабочая
 * точка: трасса, проложенная по нему, требует полного крена всю дугу.
 *
 * Пятнадцати процентов сверху не хватило: разворот всё равно шёл на 36° при
 * потолке 40°, и любой порыв контура высоты выбивал машину за срыв — на
 * замере она ложилась на спину на выходе из первого разворота. Шестьдесят
 * процентов дают крен около 28°: остаётся чем управлять, а круг вырастает
 * ровно настолько, насколько того требует эта разница.
 */
export const DC3_ROUTE_TURN_RADIUS = DC3_TURN_RADIUS * AIRPLANE_TURN_RESERVE;

/**
 * РАДИУС КРУГА НЕ ВЫБИРАЕТСЯ — ОН СЛЕДУЕТ ИЗ КАСАТЕЛЬНОГО ВХОДА.
 *
 * Разворот с оси полосы на круг обязан быть ДУГОЙ, а не углом: окружность
 * разворота касается оси полосы в точке входа и касается круга изнутри. Из
 * условия внутреннего касания радиус круга получается сам:
 *
 *     R_круга = R_виража + |центр разворота|,
 *
 * где центр разворота стоит на перпендикуляре к полосе на расстоянии виража.
 * Отсюда же и печальный факт, ради которого это записано: круг радиусом
 * меньше примерно двух виражей войти по касательной с этой полосы НЕЛЬЗЯ.
 * Первая редакция ставила круг в 278 м при вираже 257 — трасса имела излом,
 * и машина мимо неё промахивалась. Число теперь не назначено, а выведено.
 */
export const DC3_CIRCUIT_RADIUS = Math.ceil(
  DC3_ROUTE_TURN_RADIUS +
    Math.hypot(
      DC3_TURN_ENTRY_X,
      DC3_ROUTE_TURN_RADIUS + AIRPORT_RUNWAY.centreZ,
    ),
);

/** Высота круга. Три полки вместо одной — облёт не должен быть линейкой. */
/**
 * Установившийся градиент набора. Не паспортный потолок в 12°, а то, что
 * машина ДЕРЖИТ: 5.4 м/с на 45 м/с — это 6.9°, и трасса берёт с запасом.
 */
export const DC3_CLIMB_GRADIENT = (5 * Math.PI) / 180;

/**
 * Какая доля градиента остаётся В ВИРАЖЕ. Крыло платит за вираж и за набор из
 * одного Clmax, и полный градиент сквозь разворот ставит машину на срыв.
 */
export const DC3_TURN_CLIMB_SHARE = 0.35;

/*
 * УПРЕЖДЕНИЯ ЗДЕСЬ НЕТ, И ЭТО НЕ ПРОПУСК.
 *
 * Трасса говорит ЧТО: где идти, на какой высоте, с каким ходом и с какой
 * точностью. НАСКОЛЬКО РАНО начинать манёвр — свойство машины: у крылатой
 * это перекладка крена, у всевекторной её нет вовсе. Трасса, назначающая
 * упреждение в метрах, назначает его чужой машине; она же завтра поедет по
 * этой трассе другой. Поэтому горизонт выводит общий автопилот из
 * `turnCapability.responseSeconds`, который машина объявляет сама.
 */
export const DC3_CIRCUIT_LOW = 88;
export const DC3_CIRCUIT_HIGH = 148;

/**
 * ГЛИССАДА. Четыре градуса — это «комфортно» в том смысле, в каком его
 * понимает пассажир: снижение 2.7 м/с на скорости захода 36 м/с. Из угла и
 * высоты входа получается длина прямой, а из неё — конверт мира. Наоборот
 * (сначала конверт, потом угол) вышла бы глиссада под конверт, а не под машину.
 */
export const DC3_GLIDE_ANGLE = (4 * Math.PI) / 180;
export const DC3_APPROACH_SPEED = 36;
export const DC3_FINAL_ALTITUDE = 42;

/**
 * ДЛИНА СКРУГЛЕНИЯ ПРОФИЛЯ. Профиль не имеет права ломаться углом ни в одном
 * стыке — ни на отрыве, ни на выходе на круг, ни на входе в глиссаду, ни у
 * бетона.
 *
 * Это не вкус, а контракт трасс: кривая читает угол линейного окна ГРЕБНЕМ,
 * то есть бесконечной вертикальной перегрузкой, и автопилот честно требует её
 * у машины. Всевекторная машина такое требование глотает — она меняет
 * вертикаль мгновенно. Крыло меняет её углом атаки, и на изломе получает
 * просьбу, исполнить которую нельзя.
 *
 * ДЛИНА ВЫВОДИТСЯ ИЗ ВЛАСТИ, А НЕ ИЗ ВРЕМЕНИ. Первая редакция брала `V·τ` —
 * путь за время отклика вертикали, — и этого не хватило: на скруглении
 * взлёта оставалось 0.35 g при располагаемых 0.22. Смена наклона на длине `s`
 * стоит нормальной перегрузки `Δγ·V²/s`, и она обязана влезать в
 * вертикальную власть машины:
 *
 *     s ≥ Δγ · V² / (liftTrimRange · g).
 *
 * Отсюда у взлёта и у глиссады длины РАЗНЫЕ: у первого наклон круче и
 * скорость выше.
 */
export function dc3ProfileRounding(slope: number, speed: number): number {
  const normal = DC3_LIFT_TRIM_RANGE * 9.81;
  return Math.max(1, (Math.abs(slope) * speed * speed) / normal);
}

export const DC3_GLIDE_ROUNDING = dc3ProfileRounding(
  Math.tan(DC3_GLIDE_ANGLE),
  DC3_APPROACH_SPEED,
);

/**
 * ДЛИНА ГЛИССАДЫ ОТ ВОРОТ ЗАХОДА ДО КАСАНИЯ.
 *
 * Прямая часть плюс ОБА скругления: спуск с горизонта на полный наклон и
 * выравнивание у бетона съедают по половине длины скругления каждое, а вместе
 * — ровно одну. Без этого слагаемого стыки не сходятся по высоте: сверху
 * оставался уступ в шесть метров, и профиль на нём падал под девять градусов
 * там, где объявлено четыре.
 */
/**
 * ВЫРАВНИВАНИЕ ДЛИННЕЕ ВХОДА ВДВОЕ: машина отвечает вертикали за ~2.5 с, и
 * выравнивание той же длины она проходила, не успев снять глиссадный снос —
 * касание шло 2.5 м/с, на границе удара. Скругление у бетона растянуто на
 * две постоянные отклика; стыки сшиты по значению И наклону (C¹).
 */
export const DC3_FLARE_ROUNDING = DC3_GLIDE_ROUNDING * 2;

/**
 * ЗАПАС ВЫРАВНИВАНИЯ У КРОМКИ — ТОЛЬКО ФИНИШ, НЕ СДВИГ ПРИЦЕЛА.
 *
 * Чистая парабола C¹ с прямой глиссадой у кромки даёт меньше высоты плиты:
 * колёса встречают грунт за метр до бетона (замер 19.08.2026). Сдвигать
 * `DC3_TOUCHDOWN_X` нельзя — за ним едет весь финал (`FINAL_ENTRY_X`).
 * Добавка живёт только внутри выравнивания: ноль на стыке с прямой, ноль
 * у прицела, производные нули на концах — вход и прямая глиссада не
 * двигаются. Семнадцать сантиметров в середине — десять у кромки, ещё
 * несколько метров хода по оставшемуся наклону, касание уже на плите.
 */
export const DC3_FLARE_LIP_HOLD = 0.17;

export const DC3_FINAL_LENGTH =
  (DC3_FINAL_ALTITUDE - AIRPORT_RUNWAY_TOP_Y) / Math.tan(DC3_GLIDE_ANGLE) +
  DC3_GLIDE_ROUNDING / 2 +
  DC3_FLARE_ROUNDING / 2;

/**
 * ВЫСОТА ГЛИССАДЫ БЕЗ ЕДИНОГО УГЛА, от пути до точки касания.
 *
 * Четыре участка, сшитые и по значению, и по наклону: горизонт, парабола
 * входа, прямая, парабола выравнивания, бетон. У параболы вторая производная
 * постоянна — значит и вертикальная перегрузка на скруглении постоянна и
 * известна заранее, а не выясняется машиной на месте.
 */
export function dc3GlideAltitude(distanceToTouchdown: number): number {
  // ── ПЛАН ГОВОРИТ ЦЕНТРОМ МАШИНЫ, КАК ВЕСЬ ФЛОТ ─────────────────────────
  //
  // Рантайм ведёт по трассе центр масс (`mass.centre + body.position`), и
  // причальные позы остальных машин записаны для центра. Глиссада же была
  // написана высотой КОЛЁС: контур честно держал ЦЕНТР на ней, колёса шли на
  // 2.7 м ниже — и встречали землю за ~38 м до прицела, у кромки острова.
  // Поэтому у бетона закон отдаёт высоту центра СТОЯЩЕЙ машины: колёса при
  // этом касаются полосы — ровно то, что глиссада и обещает.
  const slope = Math.tan(DC3_GLIDE_ANGLE);
  const round = DC3_GLIDE_ROUNDING;
  const entry = DC3_FINAL_LENGTH;
  const standing = AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT;
  const distance = Math.max(0, distanceToTouchdown);
  if (distance >= entry) return DC3_FINAL_ALTITUDE + DC3_GUIDANCE_CENTRE_HEIGHT;
  if (distance > entry - round) {
    // Вход: наклон растёт от нуля в горизонте до полного.
    const into = entry - distance;
    return (
      DC3_FINAL_ALTITUDE +
      DC3_GUIDANCE_CENTRE_HEIGHT -
      (slope * into * into) / (2 * round)
    );
  }
  if (distance < DC3_FLARE_ROUNDING) {
    // Выравнивание: наклон падает от полного до нуля у бетона — на ДВОЙНОЙ
    // длине, чтобы вертикальный канал успевал за профилем. Добавка
    // `t²(R−t)²` поднимает только середину дуги и на стыках исчезает вместе
    // с производной, поэтому прямая глиссада и прицел не едут.
    const round = DC3_FLARE_ROUNDING;
    const parabola = standing + (slope * distance * distance) / (2 * round);
    const span = round * round * round * round;
    const hold =
      (DC3_FLARE_LIP_HOLD * 16 * distance * distance *
        (round - distance) * (round - distance)) /
      span;
    return parabola + hold;
  }
  return standing + slope * distance - (slope * DC3_FLARE_ROUNDING) / 2;
}


/**
 * ТОЧКА ПРИЦЕЛИВАНИЯ — НАЧАЛО ПРИГОДНОГО БЕТОНА, А НЕ ТРЕТЬ ПОЛОСЫ.
 *
 * Тридцать метров за порогом — правило НАСТОЯЩЕЙ полосы, где пробега хватает
 * с запасом. Здесь полосы 176 м, и запаса нет: машина приходит на порог на
 * Vref, метра на четыре выше профиля (контур высоты отстаёт от наклонного
 * профиля, и это его нормальная ошибка, а не поломка), и выносит эти четыре
 * метра в шестьдесят метров выдерживания. Замер по прежней точке: касание на
 * x=1 при прицеле −60 и остановка на x=96 — восемь метров за восточным
 * порогом. Прицел переносится на первый пригодный бетон, и выдерживание
 * укладывается внутрь полосы.
 */
/**
 * ПРИЦЕЛ — АВТОРСКАЯ ТОЧКА ГЛИССАДЫ, А НЕ ФУНКЦИЯ ПОРОГА.
 *
 * Прежняя формула `westThresholdX + inset` привязывала прицел к кромке
 * плиты, и расширение полосы на запад УТАЩИЛО ГЛИССАДУ ЗА СОБОЙ: прицел
 * съехал на −97, касание легло в четыре метра от новой кромки — то есть
 * запас, ради которого полосу расширяли, исчез в тот же коммит. Полоса
 * растёт ПОД глиссаду (вердикт Igor, 15.08.2026), глиссада за полосой не
 * ходит. Двадцать три метра от кромки до прицела плюс выдерживание, которое
 * в замерах несёт касание ещё на 35–55 м вглубь, — колёса проходят кромку
 * с полуметровым запасом по высоте.
 */
export const DC3_TOUCHDOWN_X = -81;

/**
 * РУЛЁЖНЫЙ ХВОСТ ПОСАДКИ: С ПОЛОСЫ НАЛЕВО, ПО 08 ОБРАТНО, НА ТОЧКУ СТАРТА.
 *
 * Полёт не кончается остановкой посреди полосы — машина возвращает себя в
 * исходное состояние (вердикт Igor, 15.08.2026): после пробега по 09 она
 * сруливает НАЛЕВО (терминал — по правому крылу), проходит перемычку, катится
 * по ВПП 08 обратным курсом, западной перемычкой выходит к порогу 09 и
 * финальным доворотом встаёт на стартовую точку НОСОМ НА ВОСТОК — готовой к
 * следующему вылету. Всё на двигателях, как настоящие; скорость рулёжная.
 *
 * Углы — точки пересечения осевых; остановку и разворот выводит наземный
 * автопилот, а не авторский профиль скорости.
 */
export const DC3_TAXI_SPEED = 4.5;

interface Dc3TaxiVertexBlueprint {
  readonly id: string;
  readonly point: SceneVector3;
  readonly incoming: readonly [number, number];
  readonly outgoing: readonly [number, number];
  readonly endpoint: boolean;
}

function dc3TaxiVertexBlueprints(): readonly Dc3TaxiVertexBlueprint[] {
  const z09 = RUNWAY_Z;
  const z08 = AIRPORT_RUNWAY_08.centreZ;
  const linkE = AIRPORT_TAXI_LINKS.eastX;
  const linkW = AIRPORT_TAXI_LINKS.westX;
  const berthX = AIRPORT_RUNWAY.westDesignatorX;
  return [
    {
      id: "taxi:corner-east:stop",
      point: [linkE, 0, z09],
      incoming: [1, 0],
      outgoing: [0, -1],
      endpoint: false,
    },
    {
      id: "taxi:corner-east-08:stop",
      point: [linkE, 0, z08],
      incoming: [0, -1],
      outgoing: [-1, 0],
      endpoint: false,
    },
    {
      id: "taxi:corner-west-08:stop",
      point: [linkW, 0, z08],
      incoming: [-1, 0],
      outgoing: [0, 1],
      endpoint: false,
    },
    {
      id: "taxi:corner-west:stop",
      point: [linkW, 0, z09],
      incoming: [0, 1],
      outgoing: [1, 0],
      endpoint: false,
    },
    {
      id: "start",
      point: [berthX, 0, z09],
      incoming: [1, 0],
      outgoing: [1, 0],
      endpoint: true,
    },
  ];
}

function taxiTailNodes(): unknown[] {
  const z09 = RUNWAY_Z;
  const linkE = AIRPORT_TAXI_LINKS.eastX;
  // ── УГЛЫ — ОСТРЫЕ, ХОДЫ — ПО ОСЕВЫМ (вердикт Igor, 15.08.2026) ─────────
  //
  // Сглаженная дуга на рулёжке этих ширин не умещается в габарит судна:
  // машина заезжала в перемычку боком через грунт. Настоящее руление —
  // прямая строго по осевой, у вершины остановка и РАЗВОРОТ НА МЕСТЕ
  // разнотягом (внешний двигатель вперёд, внутренний в реверс), затем снова
  // прямая. Вершины поэтому — точки пересечения осевых, без ручек Безье:
  // нулевые ручки убивают сглаживание, трасса — ломаная.
  const node = (id: string, x: number, z: number) => ({
    id,
    position: [x, 0, z] as SceneVector3,
    incoming: [x, 0, z] as SceneVector3,
    outgoing: [x, 0, z] as SceneVector3,
  });
  // Вершины уже принадлежат taxi-маршруту. Контроллер не ищет их по излому
  // выборок и не сдвигает: к точке пересечения осевых он приводит свою
  // физическую опорную точку — центр масс DC-3.
  return [
    node("rollout-exit", linkE - 22, z09),
    ...dc3TaxiVertexBlueprints().map((vertex) =>
      node(vertex.id, vertex.point[0], vertex.point[2]),
    ),
  ];
}

export const DC3_FINAL_ENTRY_X = DC3_TOUCHDOWN_X - DC3_FINAL_LENGTH;

/**
 * ПРЯМАЯ ПЛОЩАДКА ПЕРЕД ГЛИССАДОЙ — НЕ УКРАШЕНИЕ, А ВРЕМЯ КОНТУРА.
 *
 * Так устроен всякий настоящий заход: сперва выходят на осевую в горизонте и
 * только потом берут глиссаду. Причина здесь ровно та же, что и там, и она
 * считается. Боковой контур этой машины сходится с постоянной времени около
 * `L/(1.41·V)`; при устойчивом прицеле это тринадцать секунд, а глиссада с
 * сорока двух метров под четыре градуса длится восемнадцать. Одной постоянной
 * времени мало: замер давал на касании двенадцать метров бокового отклонения
 * при полуширине полосы семь — машина садилась рядом с бетоном.
 *
 * Площадка добавляет вторую постоянную. Длина берётся от неё же, а не от
 * вкуса: `1.4·V·L/(1.41·V)` ≈ 500 м при ходе захода. Дальше на запад уходить
 * нельзя — трасса обязана поместиться в небо мира (`skyRadius`), и проверяет
 * это `DC3_ROUTE_REACH`.
 */
export const DC3_FINAL_LEVEL_RUN = 1000;

/**
 * ВОРОТА ЗАХОДА — ПОЛНОЕ ОТКЛОНЕНИЕ КУРСОВОГО ЛУЧА, а не круглое число.
 *
 * Восемнадцать метров стояли здесь без основания, и основания у них не
 * нашлось: машина приходит к воротам после разворота и площадки с выносом
 * около двадцати пяти метров, гасит его НА ГЛИССАДЕ и касается в десяти
 * сантиметрах от осевой. То есть створ свою работу делает, а требование на
 * входе в него было строже, чем нужно, — и сторож рейса снимал полёт у
 * машины, которая садится правильно.
 *
 * Настоящая опора для этого числа есть: полное отклонение курсового маяка —
 * 2.5°, и ворота захода это ровно оно на длине глиссады. Двадцать шесть
 * метров при полосе четырнадцать метров шириной и глиссаде в 596 м.
 */
export const DC3_LOCALISER_FULL_SCALE = (2.5 * Math.PI) / 180;
export const DC3_APPROACH_GATE_WIDTH =
  DC3_FINAL_LENGTH * Math.tan(DC3_LOCALISER_FULL_SCALE);
export const DC3_LOCALISER_X = DC3_FINAL_ENTRY_X - DC3_FINAL_LEVEL_RUN;

/** Самая дальняя точка трассы от центра мира: из неё считается конверт. */
export const DC3_ROUTE_REACH = Math.max(
  DC3_CIRCUIT_RADIUS,
  Math.hypot(DC3_LOCALISER_X, AIRPORT_RUNWAY.centreZ),
);

const RUNWAY_Z = AIRPORT_RUNWAY.centreZ;

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smootherStep(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Угол в [0, 2π): дуга разворота считается только вперёд. */
function wrapPositive(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}

function mix(from: number, to: number, value: number): number {
  return from + (to - from) * smootherStep(value);
}

/**
 * Узел дуги. Ручки — по формуле кубической аппроксимации окружности; радиус
 * дышит по ходу круга, чтобы облёт не был идеальной шайбой.
 */
function arcNode(
  id: string,
  centre: readonly [number, number],
  radius: number,
  angle: number,
  step: number,
  direction: 1 | -1 = 1,
) {
  const position: SceneVector3 = [
    centre[0] + Math.cos(angle) * radius,
    0,
    centre[1] + Math.sin(angle) * radius,
  ];
  // ── КАСАТЕЛЬНАЯ СМОТРИТ ТУДА, КУДА ИДЁТ МАШИНА ──────────────────────────
  //
  // Производная окружности по углу смотрит в сторону его УВЕЛИЧЕНИЯ. Дуга,
  // проходимая в обратную сторону, требует обратного знака; без него в каждом
  // узле получался клюв, и машина промахивалась мимо круга на две сотни метров,
  // честно отрабатывая заломленную трассу.
  const tangent: readonly [number, number] = [
    -Math.sin(angle) * direction,
    Math.cos(angle) * direction,
  ];
  const handle = (4 / 3) * Math.tan(Math.abs(step) / 4) * radius;
  return {
    id,
    position,
    incoming: [
      position[0] - tangent[0] * handle,
      0,
      position[2] - tangent[1] * handle,
    ] as SceneVector3,
    outgoing: [
      position[0] + tangent[0] * handle,
      0,
      position[2] + tangent[1] * handle,
    ] as SceneVector3,
    samples: 40,
  };
}


/**
 * ОБЩАЯ КАСАТЕЛЬНАЯ ДВУХ ОКРУЖНОСТЕЙ, ПРОХОДИМЫХ В ОДНУ СТОРОНУ.
 *
 * Прямой участок между двумя дугами обязан касаться обеих, иначе на стыке
 * появляется угол, а угол в трассе машина проходит только падением. Сторона
 * не выводится знаком, а ВЫБИРАЕТСЯ ПРОВЕРКОЙ: из двух кандидатов берётся
 * тот, у которого направление прямой совпало с направлением хода по дуге.
 * Так формула остаётся верной при любом расположении кругов, а не при том
 * единственном, на котором её выводили.
 */
function commonTangent(
  from: readonly [number, number],
  fromRadius: number,
  to: readonly [number, number],
  toRadius: number,
): { readonly from: readonly [number, number]; readonly to: readonly [number, number] } {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const distance = Math.hypot(dx, dz) || 1;
  const base = Math.atan2(dz, dx);
  const offset = Math.asin(
    Math.max(-1, Math.min(1, (fromRadius - toRadius) / distance)),
  );
  let best: { from: readonly [number, number]; to: readonly [number, number] } | null = null;
  let bestError = Infinity;
  for (const side of [1, -1] as const) {
    const normal = base + side * (Math.PI / 2 + offset * side);
    const start: readonly [number, number] = [
      from[0] + Math.cos(normal) * fromRadius,
      from[1] + Math.sin(normal) * fromRadius,
    ];
    const finish: readonly [number, number] = [
      to[0] + Math.cos(normal) * toRadius,
      to[1] + Math.sin(normal) * toRadius,
    ];
    // Ход по дуге против часовой в точке касания перпендикулярен радиусу.
    const travel: readonly [number, number] = [
      -Math.sin(normal),
      Math.cos(normal),
    ];
    const along = Math.hypot(finish[0] - start[0], finish[1] - start[1]) || 1;
    const direction: readonly [number, number] = [
      (finish[0] - start[0]) / along,
      (finish[1] - start[1]) / along,
    ];
    const error = Math.hypot(
      direction[0] - travel[0],
      direction[1] - travel[1],
    );
    if (error < bestError) {
      bestError = error;
      best = { from: start, to: finish };
    }
  }
  return best!;
}

function createSurveyRoute(berth: SceneVector3): MotionRouteArtifact {
  const step = Math.PI / 4;
  // Разбег и отрыв идут по оси полосы на восток: так машина и поставлена.
  const nodes: Record<string, unknown>[] = [
    { id: "hold", position: [berth[0], 0, RUNWAY_Z] as SceneVector3 },
    {
      id: "rotate",
      position: [AIRPORT_RUNWAY.eastThresholdX - 40, 0, RUNWAY_Z] as SceneVector3,
    },
    {
      id: "climb-out",
      position: [DC3_TURN_ENTRY_X, 0, RUNWAY_Z] as SceneVector3,
      samples: 24,
    },
  ];

  // ── ПЕРВЫЙ РАЗВОРОТ: ДУГА, КАСАЮЩАЯСЯ И ПОЛОСЫ, И КРУГА ─────────────────
  //
  // Центр разворота стоит на перпендикуляре к оси полосы в точке входа, на
  // расстоянии виража: этим дуга касается полосы. Внутреннее касание с кругом
  // даёт вторую точку, и обе касательные сходятся по построению — угла в
  // трассе не остаётся нигде.
  const turnCentre: readonly [number, number] = [
    DC3_TURN_ENTRY_X,
    RUNWAY_Z + DC3_ROUTE_TURN_RADIUS,
  ];
  const centreDistance = Math.hypot(turnCentre[0], turnCentre[1]) || 1;
  // Точка внутреннего касания лежит на луче из центра острова через центр
  // разворота, на расстоянии радиуса круга.
  const joinAngle = Math.atan2(turnCentre[1], turnCentre[0]);
  const joinPoint: readonly [number, number] = [
    Math.cos(joinAngle) * DC3_CIRCUIT_RADIUS,
    Math.sin(joinAngle) * DC3_CIRCUIT_RADIUS,
  ];
  void centreDistance;
  // Углы на окружности РАЗВОРОТА: старт — точка касания полосы (строго снизу
  // от центра), конец — точка стыка с кругом.
  const turnStart = -Math.PI / 2;
  const turnEnd = Math.atan2(
    joinPoint[1] - turnCentre[1],
    joinPoint[0] - turnCentre[0],
  );
  const turnSweep = wrapPositive(turnEnd - turnStart);
  const turnSteps = Math.max(2, Math.ceil(turnSweep / (Math.PI / 4)));
  // Выход с прямой в дугу тоже обязан быть гладким: у прямого узла ручки нет,
  // и без неё Безье начинает дугу изломом — 125 м радиуса на ровном месте.
  (nodes[nodes.length - 1] as { outgoing?: SceneVector3 }).outgoing = [
    DC3_TURN_ENTRY_X +
      (4 / 3) * Math.tan(turnSweep / turnSteps / 4) * DC3_ROUTE_TURN_RADIUS,
    0,
    RUNWAY_Z,
  ];
  for (let index = 1; index <= turnSteps; index += 1) {
    const angle = turnStart + (turnSweep * index) / turnSteps;
    nodes.push(
      arcNode(
        index === turnSteps ? "circuit-start" : `crosswind:${index}`,
        turnCentre,
        DC3_ROUTE_TURN_RADIUS,
        angle,
        turnSweep / turnSteps,
        1,
      ) as never,
    );
  }

  // ── КРУГ ────────────────────────────────────────────────────────────────
  //
  // Полный оборот против часовой — и ровно до точки схода на базу, а не «до
  // того же угла, а дальше как-нибудь». Точка схода известна заранее: это
  // касание общей прямой с кругом, и круг обязан довести машину именно до
  // неё. Иначе между последним узлом круга и началом базы остаётся ХОРДА,
  // то есть срезанный угол в чистом виде.
  // Разворот на посадочный курс кончается НЕ у глиссады, а у начала площадки.
  const finalTurnCentre: readonly [number, number] = [
    DC3_LOCALISER_X,
    RUNWAY_Z + DC3_ROUTE_TURN_RADIUS,
  ];
  const base = commonTangent(
    [0, 0],
    DC3_CIRCUIT_RADIUS,
    finalTurnCentre,
    DC3_ROUTE_TURN_RADIUS,
  );
  const baseAngle = Math.atan2(base.from[1], base.from[0]);
  const circuitSweep = Math.PI * 2 + wrapPositive(baseAngle - joinAngle);
  const circuitSteps = Math.max(8, Math.ceil(circuitSweep / (Math.PI / 4)));
  const circuitStep = circuitSweep / circuitSteps;
  // Ход дуги на стыке меняется, а значит меняется и длина ручки. Ручка,
  // оставшаяся от предыдущей дуги, сжимает кривую: радиус проваливался с 296
  // до 212 на ровном стыке двух окружностей.
  (nodes[nodes.length - 1] as { outgoing?: SceneVector3 }).outgoing = [
    joinPoint[0] -
      Math.sin(joinAngle) * (4 / 3) * Math.tan(circuitStep / 4) * DC3_CIRCUIT_RADIUS,
    0,
    joinPoint[1] +
      Math.cos(joinAngle) * (4 / 3) * Math.tan(circuitStep / 4) * DC3_CIRCUIT_RADIUS,
  ];
  for (let index = 1; index <= circuitSteps; index += 1) {
    nodes.push(
      arcNode(
        index === circuitSteps ? "circuit-complete" : `circuit:${index}`,
        [0, 0],
        DC3_CIRCUIT_RADIUS,
        joinAngle + circuitStep * index,
        circuitStep,
        1,
      ) as never,
    );
  }

  // ── УХОД С КРУГА НА СТВОР: ПРЯМАЯ БАЗА И РАЗВОРОТ НА ПОСАДОЧНЫЙ КУРС ────
  //
  // Створ — это отрезок, и войти в него можно только вдоль. База есть ОБЩАЯ
  // КАСАТЕЛЬНАЯ круга и окружности посадочного разворота, проходимых в одну
  // сторону; она посчитана выше вместе с точкой схода. Здесь остаётся довести
  // машину по прямой и положить её на посадочный курс.
  //
  // Чем это было раньше: узел базы стоял восточнее створа, и трасса уходила
  // на тридцать метров западнее точки входа, чтобы вернуться в неё с востока.
  // Крюк радиусом 26 м при вираже 257 — машина честно пыталась его пройти.
  // БАЗА — ПРЯМАЯ, И ОНА ОБЯЗАНА БЫТЬ ПРЯМОЙ. У последнего узла круга ручка
  // осталась от дуги: с ней отрезок выгибался, и на сходе получался крюк
  // радиусом 109 м. Прямой участок не имеет ручек ни с одного конца — это и
  // делает его прямым, по построению, а не по подбору длин.
  delete (nodes[nodes.length - 1] as { outgoing?: SceneVector3 }).outgoing;
  const finalStep = 0;
  void finalStep;
  nodes.push({
    id: "base",
    position: [base.to[0], 0, base.to[1]] as SceneVector3,
  } as never);
  // Разворот на посадочный курс: от конца базы до касания с осью полосы.
  const finalStart = Math.atan2(
    base.to[1] - finalTurnCentre[1],
    base.to[0] - finalTurnCentre[0],
  );
  const finalEnd = -Math.PI / 2;
  const finalSweep = wrapPositive(finalEnd - finalStart);
  const finalSteps = Math.max(2, Math.ceil(finalSweep / (Math.PI / 4)));
  // Вход в посадочный разворот — такой же гладкий стык прямой с дугой, как и
  // выход из разбега: касательная у прямого узла задаётся ручкой вручную.
  (nodes[nodes.length - 1] as { outgoing?: SceneVector3 }).outgoing = [
    base.to[0] -
      Math.sin(finalStart) *
        (4 / 3) *
        Math.tan(finalSweep / finalSteps / 4) *
        DC3_ROUTE_TURN_RADIUS,
    0,
    base.to[1] +
      Math.cos(finalStart) *
        (4 / 3) *
        Math.tan(finalSweep / finalSteps / 4) *
        DC3_ROUTE_TURN_RADIUS,
  ];
  for (let index = 1; index <= finalSteps; index += 1) {
    const angle = finalStart + (finalSweep * index) / finalSteps;
    nodes.push(
      arcNode(
        index === finalSteps ? "localiser" : `approach:${index}`,
        finalTurnCentre,
        DC3_ROUTE_TURN_RADIUS,
        angle,
        finalSweep / finalSteps,
        1,
      ) as never,
    );
  }
  nodes.push(
    // Площадка: осевая полосы в горизонте. Здесь контур добирает точность.
    { id: "final-entry", position: [DC3_FINAL_ENTRY_X, 0, RUNWAY_Z] as SceneVector3 } as never,
    { id: "touchdown", position: [DC3_TOUCHDOWN_X, 0, RUNWAY_Z] as SceneVector3 } as never,
    ...(taxiTailNodes() as never[]),
  );

  let rotateAt = 0;
  let climbAt = 0;
  let circuitAt = 0;
  let circuitEnd = 1;
  let baseAt = 1;
  let localiserAt = 1;
  let finalAt = 1;
  let touchdownAt = 1;
  let taxiAt = 1;
  const route = createMotionRoute({
    id: "dc3:survey",
    nodes: nodes as never,
    measureAxes: [0, 2],
    requirements: {
      /**
       * ПРОФИЛЬ ВЫСОТЫ БЕЗ ИЗЛОМОВ (§4.х: кривая читает угол окна гребнем).
       * Разбег — на бетоне; отрыв — плавный выход на круг; круг — две волны;
       * заход — прямая глиссада; касание — снова бетон.
       */
      altitude: ({ progress, distance, length }) => {
        // Вся высотная речь трассы — про ЦЕНТР машины (см. dc3GlideAltitude).
        if (progress <= rotateAt) {
          return AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT;
        }
        // ── НАБОР НЕ ДЕЛИТ ПОДЪЁМНУЮ СИЛУ С ВИРАЖОМ ────────────────────
        //
        // Крыло оплачивает и вираж, и набор одним и тем же Clmax. Профиль,
        // который тянет полный градиент прямо сквозь разворот, ставит машину
        // на закритический угол атаки в самом развороте: замер показал руль
        // высоты в упоре, срыв и переворот на выходе из первого разворота.
        // Поэтому градиент КУСОЧНЫЙ: полный на прямой, треть — в дуге.
        // ── ВЗЛЁТ: ПРОФИЛЬ ИДЁТ ЗА МАШИНОЙ, А НЕ МАШИНА ЗА ПРОФИЛЕМ ─────
        //
        // Здесь стоял собственный градиент трассы в пять градусов, и он
        // расходился с тем, что машина делает на взлётном режиме (девять).
        // Расхождение стоило не эстетики: машина честно уходила ВЫШЕ профиля,
        // и автопилот в ответ требовал СНИЖЕНИЯ — сразу после отрыва, с
        // просьбой −0.22 семь секунд подряд и газом, упавшим в ноль. Со
        // стороны это и выглядит как «взлётный режим, а сразу за ним ноль».
        //
        // И начинался профиль УГЛОМ: ноль на бетоне, полный градиент в точке
        // отрыва, за один шаг — 4° на двадцати метрах, то есть 0.69 g сверх
        // единицы, потребованных мгновенно. Тот же излом, что был на входе в
        // глиссаду, только на другом конце рейса.
        //
        // Теперь наклон берётся У МАШИНЫ и поднимается параболой на длине
        // `V·τ`, как и на глиссаде.
        const rotateDistance = rotateAt * length;
        const fromRotate = Math.max(0, distance - rotateDistance);
        const takeoffSlope = Math.tan(
          airplaneTakeoffClimbAngle(DC3_AIRPLANE_PASSPORT),
        );
        const round = dc3ProfileRounding(takeoffSlope, passport.cruiseSpeed);
        // ── В ДУГЕ ГРАДИЕНТ УРЕЗАН, И ПЕРЕХОД К НЕМУ — ТОЖЕ ПАРАБОЛА ────
        //
        // Крыло оплачивает и набор, и вираж. Полный взлётный градиент,
        // протянутый сквозь отходную дугу, требует от машины восьми с
        // половиной градусов набора при пятнадцати градусах крена
        // ОДНОВРЕМЕННО — сразу после отрыва, когда её собственный автомат
        // крен ещё даже не открыл (он держит крылья горизонтально до
        // двенадцати метров и открывает манёвр полностью только к шестидесяти).
        //
        // Поэтому в дуге градиент падает до своей доли, а сам переход между
        // ними размазан на ту же длину скругления: иначе на входе в дугу
        // получается второй излом взамен убранного.
        const turnSlope = takeoffSlope * DC3_TURN_CLIMB_SHARE;
        const straightRun = Math.max(0, climbAt * length - rotateDistance);
        const risePart = (run: number, slope: number) =>
          run < round
            ? (slope * run * run) / (2 * round)
            : slope * run - (slope * round) / 2;
        const straightRise = risePart(Math.min(fromRotate, straightRun), takeoffSlope);
        const intoTurn = Math.max(0, fromRotate - straightRun);
        // Переход градиента с взлётного на дуговой: парабола длиной `round`.
        const turnRise =
          intoTurn < round
            ? takeoffSlope * intoTurn -
              ((takeoffSlope - turnSlope) * intoTurn * intoTurn) / (2 * round)
            : takeoffSlope * round -
              ((takeoffSlope - turnSlope) * round) / 2 +
              turnSlope * (intoTurn - round);
        const climbed =
          AIRPORT_RUNWAY_TOP_Y +
          DC3_GUIDANCE_CENTRE_HEIGHT +
          straightRise +
          turnRise;
        if (progress < circuitEnd) {
          const t = (progress - circuitAt) / Math.max(1e-6, circuitEnd - circuitAt);
          const wave = DC3_GUIDANCE_CENTRE_HEIGHT +
            DC3_CIRCUIT_LOW +
            (DC3_CIRCUIT_HIGH - DC3_CIRCUIT_LOW) *
              Math.max(0, Math.sin(Math.PI * Math.max(0, t))) ** 2 *
              0.75 +
            (DC3_CIRCUIT_HIGH - DC3_CIRCUIT_LOW) *
              Math.sin(2 * Math.PI * Math.max(0, t)) ** 2 *
              0.25;
          // ── ВЫХОД НА КРУГ — ТОЖЕ НЕ УГОЛ ────────────────────────────
          //
          // `Math.min` двух кривых ломается ровно там, где они пересекаются:
          // наклон падает с девяти градусов до градиента круга за один шаг.
          // Урезание градиента «на треть в дуге», стоявшее здесь раньше,
          // ломало профиль тем же способом и в том же месте — и было лишним:
          // бюджет между набором и виражом машина считает сама
          // (`airplaneBankCeiling`), из своего Clmax, а не из числа в трассе.
          //
          // Гладкий минимум сшивает обе кривые на той же длине скругления.
          const blend = (takeoffSlope * round) / 2;
          return blend > 1e-6
            ? -blend * Math.log(Math.exp(-wave / blend) + Math.exp(-climbed / blend))
            : Math.min(wave, climbed);
        }
        // ── СНИЖЕНИЕ КОНЧАЕТСЯ ДО РАЗВОРОТА НА ПОСАДОЧНЫЙ КУРС ──────────
        //
        // Та же болезнь с другого конца: разворот на створ, совмещённый со
        // снижением, отнимает у крыла ровно тот запас, который нужен на
        // выравнивание. Настоящий заход тем и устроен, что высоту круга
        // теряют НА БАЗЕ, а разворот на посадочный курс проходят в горизонте.
        if (progress < baseAt) {
          return (
            mix(
              DC3_CIRCUIT_LOW,
              DC3_FINAL_ALTITUDE,
              (progress - circuitEnd) / Math.max(1e-6, baseAt - circuitEnd),
            ) + DC3_GUIDANCE_CENTRE_HEIGHT
          );
        }
        if (progress < touchdownAt) {
          // ── ГЛИССАДА БЕЗ УГЛОВ ────────────────────────────────────────
          //
          // Прежде здесь стояла ПРЯМАЯ от ворот захода к касанию, а перед ней
          // горизонт: два излома подряд — на входе в снижение и на бетоне.
          // Первый и есть тот «перелом из полёта в глиссаду», который видно
          // на трассе; второй машина закрывала выравниванием, то есть чинила
          // собой то, что должно было прийти из профиля.
          //
          // Теперь высота считается от ПУТИ ДО ТОЧКИ КАСАНИЯ одним законом
          // со скруглёнными стыками; горизонт перед створом получается сам,
          // потому что за воротами захода закон отдаёт `DC3_FINAL_ALTITUDE`.
          return dc3GlideAltitude((touchdownAt - progress) * length);
        }
        return AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT;
      },
      /**
       * ПОЛКИ СКОРОСТИ — ПОТОЛОК НАМЕРЕНИЯ, а не паспорт машины (§4.2).
       * Пробег гасится не полкой, а запасом торможения до конца полосы: реверс
       * и колодки считает автомат, а трасса говорит только «дальше стоп».
       */
      speedLimit: ({ progress, remaining, length }) => {
        // Кривая подхода к пятну — с запасом реакции: колодки берутся по
        // ПРЕВЫШЕНИЮ полки, и кривая, равная их потолку (3), не оставляла
        // на порог ничего — машина вставала на два метра ЗА пятном.
        const braking = Math.sqrt(2 * 1.8 * Math.max(0, remaining));
        // ── ПОЛКИ — НАМЕРЕНИЕ УЧАСТКА, А НЕ СКОРОСТИ ВИРАЖЕЙ ────────────
        //
        // Здесь стояли скорости, вписанные под радиусы разворотов (44 на
        // дугу, 46 на разворот) — то есть трасса подменяла собой решение
        // автопилота, ровно как когда-то на гексакоптерах. Закон один:
        // маршрут даёт ПОТОЛОК замысла, а скорость, достаточную для входа
        // в манёвр, автопилот считает сам (`governedRouteSpeed`) из рабочей
        // поворотливости, которую машина ему объявила. Хоть 500 — в дугу
        // радиусом 376 он всё равно войдёт на своих ~44.
        //
        // Осталось три намерения: набор — спокойный темп взлётного этапа,
        // маршрут — крейсер обзора, створ — скорость захода.
        // Скорость захода спрашивается СО СТВОРА. Полка 36 уже с траверза
        // пробовалась (стабилизированный заход красив на бумаге) и отменена
        // замером: у погони усиление пропорционально ходу, и машина, ещё
        // гасящая выход из разворота, на 36 м/с ловила его хуже — касание
        // уезжало с −1.8 до −8.6 м и возвращалась коррекция. Разгон 44 → 52
        // на площадке — цена устойчивого захвата осевой, а не дыра в замысле.
        const band =
          progress < climbAt
            ? passport.cruiseSpeed
            : progress < finalAt
              ? DC3_CRUISE_BAND
              : progress < taxiAt
                ? DC3_APPROACH_SPEED
                : DC3_TAXI_SPEED;
        // ── ТОРМОЗИТ КОЛЕСО, А НЕ КРЫЛО ───────────────────────────────────
        //
        // Профиль торможения строится от ОСТАТКА трассы и у самой точки
        // касания уходит в ноль: `sqrt(2·a·s)` при s=50 м даёт 16 м/с. Для
        // машины, которая умеет висеть, это верно. Крылатая же ниже своей
        // скорости сваливания не летит ВООБЩЕ — она падает.
        //
        // Замер по прежнему профилю: заход начинался на 37.6 м/с, полка
        // тянула ход вниз, газ стоял на нуле, и на 32 м/с при угле атаки 23°
        // машина сваливалась в трёхстах метрах до порога и била в воду.
        //
        // Поэтому до касания полка не опускается ниже `1.3·Vs(щитки)` —
        // классического захода. После касания предел снимается: там тормозят
        // колодки и обратный шаг винта, и им ноль как раз и нужен.
        const flying = airplaneReferenceSpeed(passport, 1);
        // На рулении маршрут объявляет только потолок. Торможение к изломам и
        // конечной точке считает наземный path follower по живой машине.
        const limited = progress >= taxiAt ? band : Math.min(band, braking);
        return progress < touchdownAt ? Math.max(flying, limited) : limited;
      },
      /**
       * КОРИДОР — ТРЕБОВАНИЕ УЧАСТКА. На полосе он равен её полуширине минус
       * колея: съехать с бетона нельзя. В открытом воздухе он широкий, на
       * створе — снова узкий, потому что створ и есть полоса, только в небе.
       */
      corridor: ({ progress, length }) => {
        // ── КОРИДОР: ШИРОКО НА МАНЁВРЕ, СТРОГО НА СТВОРЕ ────────────────
        //
        // Точность — свойство УЧАСТКА, а не машины (§4.3). У крылатой машины
        // разброс этих требований больше, чем у любой другой: на разбеге и
        // на круге ей нужно место, чтобы вписаться перекладкой крена, а на
        // глиссаде — линия, потому что створ и есть полоса, только в небе.
        // Общий допуск, выбранный посередине, ломает оба конца сразу.
        if (progress <= climbAt) {
          // Полоса: съехать с бетона нельзя, но и держать сантиметры на
          // разбеге незачем — полуширина минус колея.
          return AIRPORT_RUNWAY.width / 2 - 2;
        }
        // Руление: перемычки узкие, машина обязана держать ось — три метра.
        if (progress >= taxiAt) return 3;
        if (progress >= touchdownAt) return AIRPORT_RUNWAY.width / 2 - 2;
        if (progress >= finalAt) {
          // ── СТВОР УГЛОВОЙ, А НЕ ПОСТОЯННОЙ ШИРИНЫ ──────────────────────
          //
          // Так устроен настоящий курсовой маяк, и причина у этого не
          // историческая: машина сходится на осевую ЭКСПОНЕНТОЙ, а линейное
          // сжатие ширины обгоняет её в середине глиссады. Замер: машина
          // честно шла 12 → 0.1 м и приходила на порог точно по оси, но
          // требование в этот момент было уже 4.2 м, и сторож рейса
          // засчитывал девять секунд вне коридора — то есть снимал полёт у
          // машины, которая садится правильно.
          //
          // Прямой луч от ворот к порогу тоже не подошёл, и по той же
          // причине с другого конца: он сжимается ЛИНЕЙНО, а машина сходится
          // экспонентой — широко в начале, круто в конце. На ста семидесяти
          // метрах от порога луч требовал пяти метров, машина шла в
          // двенадцати и приходила на порог в десяти сантиметрах.
          //
          // Требование ступенчато, и обе ступени — числа участка: пока до
          // порога дальше ДЛИНЫ ПОЛОСЫ, машина ещё сходится, и с неё
          // спрашивается ширина ворот; ближе она обязана быть на осевой, и
          // спрашивается полуширина бетона. Непрерывный луч
          // `remaining·tan(2.5°)` пробовался и отменён замером: он строже
          // ступени в середине глиссады, где сходимость ещё идёт (6.9 с вне
          // коридора против 4.3 с у ступени).
          const remaining = Math.max(0, (touchdownAt - progress) * length);
          return remaining > AIRPORT_RUNWAY.length
            ? DC3_APPROACH_GATE_WIDTH
            : AIRPORT_RUNWAY.width / 2 - 2;
        }
        if (progress >= localiserAt) {
          // ── ПЛОЩАДКА — ЭТО МЕСТО, ГДЕ ТОЧНОСТЬ ДОБИРАЮТ ────────────────
          //
          // Требовать её НА ВХОДЕ в площадку — противоречие: площадка затем и
          // существует, что после разворота машина приходит на осевую с
          // выносом (замер: полсотни метров) и гасит его за десяток секунд.
          // Поэтому требование начинается манёвренным и ужесточается к
          // началу глиссады, где машина уже обязана быть на линии.
          return mix(
            120,
            DC3_APPROACH_GATE_WIDTH,
            (progress - localiserAt) / Math.max(1e-6, finalAt - localiserAt),
          );
        }
        // ── РАЗВОРОТ НА ПОСАДОЧНЫЙ КУРС — ЭТО МАНЁВР, А НЕ ЛИНИЯ ────────
        //
        // Здесь стояли те же сорок метров, что и на прямой базе, и это была
        // не строгость, а ошибка авторства: девяностоградусный разворот
        // радиусом 411 м машина с запаздыванием 2.25 с проходит с выносом в
        // десятки метров ПО ПОСТРОЕНИЮ — столько она пролетает, пока крен
        // доходит до заданного и уходит обратно. Требование, которого машина
        // физически выполнить не может, коридором не является.
        //
        // Цена была не косметической: сторож рейса снимает полёт, если тот
        // держится вне коридора пять секунд (`routeDivergence`), и держался
        // он девять. Со стороны игрока машина ровно так и выглядела —
        // «потерялась где-то на девяноста процентах и не вернулась».
        if (progress >= baseAt) return 120;
        // Отход и круг: манёвр, а не линия.
        return 120;
      },
    },
    markers: {
      rotate: "rotate",
      departureComplete: "climb-out",
      circuitStart: "circuit-start",
      circuitComplete: "circuit-complete",
      base: "base",
      localiser: "localiser",
      arriving: "localiser",
      final: "final-entry",
      touchdown: "touchdown",
      taxi: "rollout-exit",
    },
  });
  rotateAt = route.markerProgress("rotate");
  climbAt = route.markerProgress("departureComplete");
  circuitAt = route.markerProgress("circuitStart");
  circuitEnd = route.markerProgress("circuitComplete");
  baseAt = route.markerProgress("base");
  localiserAt = route.markerProgress("localiser");
  finalAt = route.markerProgress("final");
  touchdownAt = route.markerProgress("touchdown");
  taxiAt = route.markerProgress("taxi");
  return route;
}

/** Доля маркера или запасное значение: не у каждой трассы есть все маркеры. */
function markerOr(route: MotionRouteArtifact, marker: string, fallback: number): number {
  try {
    return route.markerProgress(marker);
  } catch {
    return fallback;
  }
}

function planFromRoute(
  route: MotionRouteArtifact,
  includesTaxiVertices = false,
): VehicleRoutePlan {
  // МАРКЕРЫ СНИМАЮТСЯ ОДИН РАЗ И С ЗАПАСНЫМ ОТВЕТОМ.
  //
  // Обзорная трасса объявляет весь набор, а прибытийная и аварийная — только
  // створ: отрываться и обходить остров им неоткуда. Безусловное чтение
  // маркера роняло построение плана исключением («Route dc3:escape has no
  // marker departureComplete») ровно в тот момент, когда машине понадобился
  // аварийный уход, — то есть в худший из возможных.
  const finalFrom = markerOr(route, "final", 0.85);
  const arrivalFrom = markerOr(route, "arriving", finalFrom);
  const arrivalAt = markerOr(route, "touchdown", 1);
  return {
    id: route.id,
    length: route.length,
    point(progress) {
      const point = route.point(progress);
      return [point[0], route.requirement("altitude", progress), point[2]];
    },
    speedLimit(progress) {
      return route.requirement("speedLimit", progress);
    },
    altitude(progress) {
      return route.requirement("altitude", progress);
    },
    corridor(progress) {
      return route.requirement("corridor", progress);
    },
    taxiVertices: includesTaxiVertices
      ? dc3TaxiVertexBlueprints().map((vertex) => {
          const progress = route.nodeProgress(vertex.id);
          return {
            progress,
            point: route.point(progress),
            incoming: vertex.incoming,
            outgoing: vertex.outgoing,
            endpoint: vertex.endpoint,
          };
        })
      : undefined,
    arrivalFrom,
    arrivalAt,
    finalFrom,
  };
}

export function dc3AirportRoute(
  _kind: Dc3FlightKind,
  berth: SceneVector3,
): MotionRouteArtifact {
  return createSurveyRoute(berth);
}

/**
 * РЕЖИМ «ТОЛЬКО РУЛЕНИЕ» — учебный круг по рулёжной схеме (вердикт Igor,
 * 15.08.2026: осмотр руления без сорокаминутного полёта). С точки старта на
 * восток по 09, налево на перемычку, по ВПП 08 обратно, западной перемычкой
 * на стартовую точку. План хранит только ломаную осевую и верхнюю
 * полку хода; скорость, остановку и разворот на выходную ногу выбирает
 * отдельный наземный автопилот DC-3.
 */
export function dc3TaxiDrillPlan(berth: SceneVector3): VehicleRoutePlan {
  const route = createMotionRoute({
    id: "dc3:taxi-drill",
    nodes: [
      {
        id: "stand",
        position: [berth[0], 0, RUNWAY_Z] as SceneVector3,
        incoming: [berth[0], 0, RUNWAY_Z] as SceneVector3,
        outgoing: [berth[0], 0, RUNWAY_Z] as SceneVector3,
      },
      ...(taxiTailNodes() as never[]),
    ] as never,
    measureAxes: [0, 2],
    requirements: {
      altitude: () => AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT,
      speedLimit: () => DC3_TAXI_SPEED,
      corridor: () => 3,
    },
    markers: {
      final: "start",
    },
  });
  const plan = planFromRoute(route, true);
  return { ...plan, finalFrom: 0 };
}

export function dc3AirportPlan(
  _kind: Dc3FlightKind,
  berth: SceneVector3,
): VehicleRoutePlan {
  const route = createSurveyRoute(berth);
  return planFromRoute(route, true);
}

/**
 * Прибытие снаружи. Самолёт возвращается на полосу единственным способом —
 * створом, поэтому прибытийная трасса есть отрезок глиссады и пробег.
 */
export function dc3AirportArrivalPlan(
  berth: SceneVector3,
  options?: { readonly bearing?: number; readonly from?: SceneVector3 },
): VehicleRoutePlan {
  // ── ЗАХОД НАЧИНАЕТСЯ ТАМ, ГДЕ МАШИНА, А НЕ ТАМ, ГДЕ ЕГО НАРИСОВАЛИ ──────
  //
  // Прежняя прибытийная трасса была нарисована в фиксированном месте и на
  // фиксированной высоте (60 м) и `options.from` не читала — хотя контракт
  // этот довод даёт именно за этим. Машине, у которой рейс сняли на сорока
  // метрах в километре отсюда, выдавался план, начинающийся в другой точке и
  // выше её: она обязана была ОДНОВРЕМЕННО набирать высоту и разворачиваться
  // на посадочный курс, причём разворот в той трассе шёл радиусом 261 м —
  // 26.9° крена при собственном минимуме машины около 225 м.
  //
  // Ни одна крылатая машина такого не исполнит, и на нарисованной трассе это
  // видно прямо: горка, а сразу за ней перелом в снижение.
  //
  // Теперь заход собирается ОТ МАШИНЫ: прямая от её места к входу в разворот,
  // разворот тем же радиусом, что и на обзорной трассе, площадка, и та же
  // скруглённая глиссада. Высота выходит на высоту створа плавно, на длине
  // прямой, и наклон этого выхода ограничен паспортом.
  const turnCentre: readonly [number, number] = [
    DC3_LOCALISER_X,
    RUNWAY_Z + DC3_ROUTE_TURN_RADIUS,
  ];
  const sweep = Math.PI / 2;
  const entryAngle = -Math.PI / 2 - sweep;
  const entry: readonly [number, number] = [
    turnCentre[0] + Math.cos(entryAngle) * DC3_ROUTE_TURN_RADIUS,
    turnCentre[1] + Math.sin(entryAngle) * DC3_ROUTE_TURN_RADIUS,
  ];
  const here = options?.from;
  const startAltitude = here ? Math.max(AIRPORT_RUNWAY_TOP_Y, here[1]) : DC3_FINAL_ALTITUDE;
  const nodes: unknown[] = [];
  let joinLength = 0;
  if (here) {
    const runX = entry[0] - here[0];
    const runZ = entry[1] - here[2];
    joinLength = Math.hypot(runX, runZ);
    if (joinLength > 60) {
      nodes.push({ id: "now", position: [here[0], 0, here[2]] as SceneVector3 });
    } else {
      joinLength = 0;
    }
  }
  const steps = 3;
  for (let index = 0; index <= steps; index += 1) {
    const angle = entryAngle + (sweep * index) / steps;
    nodes.push(
      arcNode(
        index === 0 ? "join" : index === steps ? "localiser" : `arrival:${index}`,
        turnCentre,
        DC3_ROUTE_TURN_RADIUS,
        angle,
        sweep / steps,
        1,
      ),
    );
  }
  nodes.push(
    { id: "final-entry", position: [DC3_FINAL_ENTRY_X, 0, RUNWAY_Z] as SceneVector3 },
    { id: "touchdown", position: [DC3_TOUCHDOWN_X, 0, RUNWAY_Z] as SceneVector3 },
    ...(taxiTailNodes() as never[]),
  );
  let arrivalFinalAt = 1;
  let arrivalTouchdownAt = 1;
  let arrivalTaxiAt = 1;
  const route = createMotionRoute({
    id: "dc3:arrival",
    nodes: nodes as never,
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress, length }) => {
        if (progress >= arrivalTouchdownAt) {
          return AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT;
        }
        const glide = dc3GlideAltitude((arrivalTouchdownAt - progress) * length);
        // ── НА ЗАХОДЕ НЕ БЫВАЕТ НАБОРА. НИКОГДА ────────────────────────
        //
        // Глиссаду перехватывают СНИЗУ: идут в горизонте, пока она сама не
        // опустится до тебя, и только тогда ложатся на неё. Требование
        // подняться, чтобы «выполнить глиссаду», не встречается ни у одной
        // машины и ни на одном аэродроме — а прежний план его выдавал: он
        // начинался на своей высоте 42 м независимо от того, где машина.
        // Самолёту, идущему на восемнадцати метрах у самого входа, это
        // приходило как приказ набрать двадцать четыре метра перед снижением.
        //
        // Закон записывается одной строкой: профиль захода не выше того
        // места, где машина уже находится. Пока глиссада выше — горизонт;
        // как только опустилась — снижение по ней.
        const level = startAltitude;
        // Гладкий минимум вместо `Math.min`: стык горизонта и глиссады —
        // такой же излом, как и все прочие, и скругляется тем же радиусом.
        const blend = (Math.tan(DC3_GLIDE_ANGLE) * DC3_GLIDE_ROUNDING) / 2;
        return blend > 1e-6
          ? -blend * Math.log(Math.exp(-level / blend) + Math.exp(-glide / blend))
          : Math.min(level, glide);
      },
      speedLimit: ({ progress, remaining, length }) => {
        // Кривая подхода к пятну — с запасом реакции: колодки берутся по
        // ПРЕВЫШЕНИЮ полки, и кривая, равная их потолку (3), не оставляла
        // на порог ничего — машина вставала на два метра ЗА пятном.
        const braking = Math.sqrt(2 * 1.8 * Math.max(0, remaining));
        const band =
          progress < arrivalTaxiAt
            ? DC3_APPROACH_SPEED
            : DC3_TAXI_SPEED;
        const limited =
          progress >= arrivalTaxiAt ? band : Math.min(band, braking);
        return progress < arrivalTouchdownAt
          ? Math.max(airplaneReferenceSpeed(DC3_AIRPLANE_PASSPORT, 1), limited)
          : limited;
      },
      corridor: ({ progress, length }) => {
        if (progress >= arrivalTaxiAt) return 3;
        if (progress >= arrivalTouchdownAt) return AIRPORT_RUNWAY.width / 2 - 2;
        if (progress >= arrivalFinalAt) {
          const remaining = Math.max(0, (arrivalTouchdownAt - progress) * length);
          return remaining > AIRPORT_RUNWAY.length
            ? DC3_APPROACH_GATE_WIDTH
            : AIRPORT_RUNWAY.width / 2 - 2;
        }
        return 120;
      },
    },
    markers: {
      arriving: "localiser",
      final: "final-entry",
      touchdown: "touchdown",
      taxi: "rollout-exit",
    },
  });
  arrivalFinalAt = route.markerProgress("final");
  arrivalTouchdownAt = route.markerProgress("touchdown");
  arrivalTaxiAt = route.markerProgress("taxi");
  void berth;
  const plan = planFromRoute(route, true);
  return plan;
}

/**
 * Аварийный уход — ДАННЫЕ, а не ветка автопилота (§5.5). Крылатая машина
 * уходит вперёд и вверх: остановиться и зависнуть она не умеет.
 */
export function dc3AirportEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const length = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const forward: SceneVector3 = [input.forward[0] / length, 0, input.forward[2] / length];
  const from: SceneVector3 = [input.start[0], 0, input.start[2]];
  const ceiling = Math.max(input.start[1] + 40, DC3_CIRCUIT_LOW);
  const route = createMotionRoute({
    id: "dc3:escape",
    nodes: [
      { id: "now", position: from },
      {
        id: "clear",
        position: [from[0] + forward[0] * 220, 0, from[2] + forward[2] * 220],
        samples: 24,
      },
      {
        id: "final-entry",
        position: [from[0] + forward[0] * 420, 0, from[2] + forward[2] * 420],
        samples: 24,
      },
    ],
    measureAxes: [0, 2],
    requirements: {
      altitude: ({ progress }) => mix(input.start[1], ceiling, progress),
      speedLimit: () => passport.cruiseSpeed,
      corridor: () => 60,
    },
    markers: { final: "final-entry" },
  });
  void berth;
  return planFromRoute(route);
}

export function dc3AirportRoutePhase(
  kind: Dc3FlightKind,
  progress: number,
): MotionRoutePhase {
  // Учебное руление — рейс без полёта: с первого метра им владеет отдельная
  // наземная фаза, а не посадочный створ.
  if (kind === "taxi") return "taxi";
  return motionRoutePhase(
    dc3AirportRoute("survey", [AIRPORT_RUNWAY.westDesignatorX, AIRPORT_RUNWAY_TOP_Y, RUNWAY_Z]),
    progress,
    "departureComplete",
    "arriving",
    "touchdown",
    "taxi",
  );
}
