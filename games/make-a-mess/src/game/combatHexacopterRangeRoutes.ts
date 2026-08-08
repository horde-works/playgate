import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
} from "./motionRoute.ts";
import type { RouteFigureStation } from "./flightFigures.ts";
import type {
  SkyTrainEmergencyEscapeInput,
  VehicleRoutePlan,
} from "./skyTrainRoutes.ts";

const CLEARANCE_ALTITUDE = 20;

/**
 * ПОКАЗАТЕЛЬНЫЙ МАРШРУТ: УХОД ОТ ОСТРОВА, ВОСЬМЁРКА, ПОСАДКА.
 *
 * Он написан под конкретную способность этой машины, а не «покрасивее». У неё
 * есть продольная тяга ПОМИМО наклона — синфазный режим пары тоннелей даёт
 * около 25 м/с² против 6.6 наклонных, — и увидеть это можно только там, где
 * длинный прямой участок разрешает разогнаться, а поворот требует довернуть
 * нос быстрее, чем умеет реактивный момент.
 *
 * Отсюда три части:
 *
 *   1. РАЗГОННЫЙ УХОД — прямой луч на сотню метров от кромки. Здесь работает
 *      синфазная тяга: машина идёт быстро и заметно РОВНЕЕ обычного коптера,
 *      потому что скорость даёт не клевок, а тоннели;
 *   2. ДАЛЬНИЙ РАЗВОРОТ — широкая дуга на удалении, где скорость наибольшая;
 *   3. ВОСЬМЁРКА перед заходом — два встречных витка через одну точку. Смена
 *      знака кривизны в середине требует перекладки рыскания через ноль на
 *      полном ходу, и это ровно тот манёвр, который без тоннелей не
 *      выполняется: обычному коптеру не хватает момента, он проходит петлю
 *      боком.
 *
 * Дальность согласована с оболочкой мира: суша 50 м и кромка игрока 55 м не
 * менялись, а видимое небо поднято до 150 и камера до 380 — под саму машину.
 * Она уходит на 112 м, то есть ЗА кромку земли, и это намеренно: она летающая,
 * её предел задаёт не грунт. Длина маршрута 675 м.
 */
/**
 * ВОСЬМЁРКА СЧИТАЕТСЯ ФОРМУЛОЙ, А НЕ СТАВИТСЯ ТОЧКАМИ НА ГЛАЗ.
 *
 * Руками её собрать не удалось, и провал был поучительный: две петли вышли
 * закрученными в ОДНУ сторону, то есть получились два круга подряд, а не
 * восьмёрка. Проверка кривизны это сразу и показала — знак не менялся на всём
 * участке. Между тем вся ценность фигуры именно в смене знака: середина
 * требует переложить рыскание через ноль на полном ходу, и это тот самый
 * манёвр, ради которого машине дали тоннели.
 *
 * Поэтому берётся лемниската Жероно `(a·cos t, b·sin 2t)`: она пересекает
 * центр дважды и обходит доли во взаимно противоположных направлениях по
 * построению, а не по удаче расстановки.
 */
function figureEight(
  centreX: number,
  centreZ: number,
  halfWidth: number,
  halfHeight: number,
  samples = 16,
): SceneVector3[] {
  return Array.from({ length: samples }, (_, index) => {
    // Фаза π: вход в фигуру с БЛИЖНЕЙ к маршруту стороны. С фазой ноль первая
    // точка лемнискаты — дальний правый конец, и трасса гнала машину 66 метров
    // поперёк всей фигуры, чтобы развернуть шпилькой на дальнем краю: 60 м
    // отклонения и разворот на 130° жили ровно там. Кривая та же, начало другое.
    const t = Math.PI + (index / samples) * Math.PI * 2;
    return [
      centreX + halfWidth * Math.cos(t),
      0,
      centreZ + halfHeight * Math.sin(2 * t),
    ] as SceneVector3;
  });
}

/**
 * Дуга окружности — тоже формулой, и по той же причине, что восьмёрка. Углы в
 * градусах и от оси +Z по часовой стрелке, как читается курс.
 */
function arcPoints(
  centre: readonly [number, number],
  radius: number,
  fromDegrees: number,
  toDegrees: number,
  samples: number,
): SceneVector3[] {
  return Array.from({ length: samples }, (_, index) => {
    const t = fromDegrees + ((toDegrees - fromDegrees) * index) / (samples - 1);
    const angle = (t * Math.PI) / 180;
    return [
      centre[0] + radius * Math.sin(angle),
      0,
      centre[1] + radius * Math.cos(angle),
    ] as SceneVector3;
  });
}

/**
 * ШПИЛЬКА — И ЭТО МЕСТО ИММЕЛЬМАНА.
 *
 * Иммельман разворачивает машину на 180° НА МЕСТЕ. Трасса, которая делает то
 * же самое широкой дугой, оставляет машину на выходе далеко от себя: замер на
 * прежнем дальнем развороте дал 51 м отхода. Шпилька — тот же разворот, но
 * короткий, и после фигуры машина оказывается там же, где трасса.
 */
function hairpin(
  entry: readonly [number, number],
  exit: readonly [number, number],
  reach: number,
  /**
   * Курс, С КОТОРЫМ машина приходит на вход. Без него генератор выбирает
   * перпендикуляр вслепую и в половине случаев выпучивает разворот НАЗАД:
   * замер показал скачок курса с +24° на −90° за один шаг трассы и радиус
   * кривизны в шесть метров на самом входе. Разворот обязан сперва
   * продолжить движение, и только потом заворачивать.
   */
  heading: readonly [number, number],
  samples = 5,
): SceneVector3[] {
  const midX = (entry[0] + exit[0]) / 2;
  const midZ = (entry[1] + exit[1]) / 2;
  const acrossX = exit[0] - entry[0];
  const acrossZ = exit[1] - entry[1];
  const across = Math.hypot(acrossX, acrossZ) || 1;
  // Наружу от середины — перпендикуляр к отрезку «вход-выход», и ВПЕРЁД по
  // курсу входа: из двух перпендикуляров годится тот, что продолжает движение.
  const forward = Math.hypot(heading[0], heading[1]) || 1;
  const sign =
    (-acrossZ / across) * (heading[0] / forward) +
      (acrossX / across) * (heading[1] / forward) >=
    0
      ? 1
      : -1;
  const outX = (-acrossZ / across) * sign;
  const outZ = (acrossX / across) * sign;
  return Array.from({ length: samples }, (_, index) => {
    const t = (index / (samples - 1)) * Math.PI;
    return [
      midX - (acrossX / 2) * Math.cos(t) + outX * reach * Math.sin(t),
      0,
      midZ - (acrossZ / 2) * Math.cos(t) + outZ * reach * Math.sin(t),
    ] as SceneVector3;
  });
}

/**
 * ПРОГРАММА ПОКАЗА. Девять номеров, и у каждого своя задача — иначе это был бы
 * один длинный круг, повторённый трижды.
 *
 * Порядок узлов и есть программа; имена у тех, к которым привязаны фигуры,
 * потому что фигура объявляется станцией участка и обязана на что-то ссылаться.
 */
const namedPoint = (id: string, x: number, z: number) => ({
  id,
  position: [x, 0, z] as SceneVector3,
});
const plainPoint = ([x, , z]: SceneVector3) => ({
  id: null,
  position: [x, 0, z] as SceneVector3,
});

const circuitNodes: readonly { id: string | null; position: SceneVector3 }[] = [
  namedPoint("berth", 0, 0),
  namedPoint("clear", 0, 12),
  // 1. РАЗГОННЫЙ ЛУЧ. Прямая, на которой синфазная тяга успевает раскрутить
  //    ход, и на ней же — малая петля: она закрывается в точке входа и трассу
  //    не сбивает.
  namedPoint("departure-complete", 6, 40),
  plainPoint([12, 0, 60]),
  plainPoint([22, 0, 70]),
  // 2. СЕВЕРНАЯ ШПИЛЬКА — иммельман разворачивает машину на месте вместо дуги.
  namedPoint("immelmann-north", 30, 84),
  ...hairpin([30, 84], [-27, 125], 34, [8, 14]).slice(1, -1).map(plainPoint),
  namedPoint("north-rejoin", -27, 125),
  // 3. ДЛИННЫЙ ЮЖНЫЙ ГАЛС. Две сотни метров прямой, и большая петля стоит в
  //    ДАЛЬНЕМ его конце, а не сразу за шпилькой: из иммельмана машина выходит
  //    на двадцать шесть метров выше входа и с этой высоты сперва должна
  //    успокоиться. Замер с петлёй сразу после шпильки: машина ныряла с 33 до
  //    12 м, ворота честно отказывали ей в фигуре — «не хватает высоты на
  //    возврат», — и большая петля не показывалась вовсе.
  // Обе петли стоят на ЭТОМ галсе, а не на взлётном луче. Луч занят своим
  // делом — набрать высоту и ход, — и фигура на нём приходила на пятнадцать
  // метров ниже трассы: ворота честно отвечали «не хватает высоты на возврат».
  // Здесь машина уже высокая и уже быстрая, и обе петли получают своё.
  namedPoint("loop-small", -24, 96),
  plainPoint([-20, 0, 52]),
  namedPoint("loop-big", -16, 6),
  plainPoint([-22, 0, -50]),
  // 4. ШИРОКАЯ ОРБИТА. Остров и территория за ним целиком, по кромке видимого
  //    неба: сто двадцать метров при небе в сто пятьдесят.
  ...arcPoints([0, 0], 118, 190, 570, 14).map(plainPoint),
  // 5. ВОСЬМЁРКА. Смена знака кривизны на полном ходу — манёвр, ради которого
  //    машине дали тоннели.
  ...figureEight(-6, -64, 62, 40).map(plainPoint),
  // 6. СРЕДНЯЯ ОРБИТА, И В ОБРАТНУЮ СТОРОНУ. Между широкой и тесной должен
  //    быть промежуточный размер, иначе программа читается как «далеко» и
  //    «близко» без середины; смена стороны обхода делает переход манёвром, а
  //    не переездом.
  ...arcPoints([0, 0], 82, 235, -140, 12).map(plainPoint),
  // 7. НИЗКИЙ КРУГ НАД САМИМ ОСТРОВОМ. Радиус выведен из ПОПЕРЕЧНОЙ
  //    способности, а не из желания пройти впритирку: тоннели толкают вдоль
  //    носа и в вираже не помогают, боковое даёт один наклон — g·tg(34°) =
  //    6.6 м/с². Ход в вираже равен √(a·r), поэтому круг в сорок четыре метра
  //    физически не проходится быстрее семнадцати, и на разрешённых участку
  //    тридцати машина уходила от трассы на 61.9 м. Шестьдесят четыре метра
  //    дают двадцать с небольшим — и это по-прежнему тесно для острова в
  //    полсотни, то есть читается ровно так, как задумано.
  ...arcPoints([0, 0], 64, -60, 300, 11).map(plainPoint),
  // 8. ВОСТОЧНЫЙ КРЮК ЗА ОСТРОВ и возврат по диагонали к самому берту.
  ...arcPoints([56, -8], 76, 205, 25, 7).map(plainPoint),
  plainPoint([42, 0, -20]),
  // 9. НИЗКИЙ ПРОХОД НАД ПЛОЩАДКОЙ И ЗАХОД ИЗ ИММЕЛЬМАНА.
  //
  //    Машина проходит над самим бертом НА СЕВЕР, поднимает нос и разворотом
  //    возвращается на створ. Иммельман здесь не украшение: он единственный
  //    манёвр, который меняет курс на обратный, не уводя машину в сторону, —
  //    поэтому створ и получается из него сам.
  //
  //    Курс входа обязан быть ОБРАТНЫМ курсу створа, иначе фигура развернёт
  //    машину мимо. Первая редакция ставила шпильку поперёк захода: выход
  //    расходился со створом на сто двадцать градусов, и машина оказывалась в
  //    семидесяти шести метрах от трассы.
  //    Прямая перед фигурой начинается ЮЖНЕЕ площадки: иммельману нужен ход,
  //    а ход нужно где-то взять. Замер с короткой прямой: машина приходила на
  //    восьми метрах в секунду, ворота честно отвечали «ход мал», и заход из
  //    фигуры не показывался вовсе.
  plainPoint([6, 0, -46]),
  plainPoint([4, 0, -8]),
  plainPoint([6, 0, 28]),
  namedPoint("immelmann-final", 8, 62),
  ...hairpin([8, 62], [78, 62], 36, [2, 34]).slice(1, -1).map(plainPoint),
  namedPoint("final-rejoin", 78, 62),
  plainPoint([44, 0, 40]),
  namedPoint("arrival-shoulder", 4, 26),
  namedPoint("final", 0, 15),
  namedPoint("dock", 0, 0),
];

function curvedNode(index: number) {
  const node = circuitNodes[index];
  const position = node.position;
  const id = node.id ?? `circuit-${index}`;
  if (index === 0 || index === circuitNodes.length - 1) {
    return { id, position };
  }
  const previous = circuitNodes[index - 1].position;
  const next = circuitNodes[index + 1].position;
  // Катмулл-Ром: ручка — половина хорды соседей. Прежние 0.16 давали почти
  // ломаную со скруглёнными углами, и в небе это читалось изломами луча.
  //
  // НО РУЧКА ЗАЖАТА КОРОЧЕ СОСЕДНЕГО ОТРЕЗКА, и это не косметика. Шаг узлов в
  // программе показа скачет от восьми метров на стыке номеров до сорока внутри
  // дуги; ручка, взятая от хорды дальних соседей, на коротком отрезке выходит
  // ДЛИННЕЕ самого отрезка, и кривая закладывает петлю. Замер: радиусы шесть
  // метров там, где номера сшиты, при разрешённых тридцати метрах в секунду —
  // это не сложный вираж, это дефект кривой, и проходить его не должен никакой
  // автопилот.
  const span: SceneVector3 = [next[0] - previous[0], 0, next[2] - previous[2]];
  const spanLength = Math.hypot(span[0], span[2]) || 1;
  const shortest = Math.min(
    Math.hypot(position[0] - previous[0], position[2] - previous[2]),
    Math.hypot(next[0] - position[0], next[2] - position[2]),
  );
  const handle = Math.min(spanLength * 0.3, shortest * 0.42);
  const tangent: SceneVector3 = [
    (span[0] / spanLength) * handle,
    0,
    (span[2] / spanLength) * handle,
  ];
  return {
    id,
    position,
    incoming: [position[0] - tangent[0], 0, position[2] - tangent[2]] as SceneVector3,
    outgoing: [position[0] + tangent[0], 0, position[2] + tangent[2]] as SceneVector3,
    samples: 48,
  };
}

/**
 * ВЫСОТА — ЧАСТЬ ПРОГРАММЫ, и потому она задана ключами по номерам, а не одной
 * волной. Волна из горбиков была настроена под прежний круг из тринадцати точек
 * и к восьми номерам отношения не имеет: там, где раньше был подскок, теперь
 * низкий проход над самим островом.
 *
 * Каждый ключ отвечает за свой номер: разгон на двадцати, малая петля на
 * двадцати шести (её провал), большая петля на сорока шести (её провал вдвое
 * глубже), широкая орбита высоко, восьмёрка ныряет, круг над островом идёт
 * низко, восточный крюк снова забирается. Интерполяция сглаженная — трасса не
 * должна иметь изломов, их вторая производная читается газом как гребень.
 */
const ALTITUDE_KEYS: readonly (readonly [number, number])[] = [
  [0.0, 20],
  [0.03, 34],
  [0.06, 40],
  [0.09, 46],
  [0.13, 48],
  // Дальше — РОВНЫЙ РИТМ, шаг в двадцатую долю. Разнобой шагов ломается не по
  // вкусу, а численно: лента ищет перепад в 1.75 м на тридцати шести метрах
  // трассы, и на пологом склоне объявленный нырок в неё не попадает. Замер
  // терял то один, то другой, пока шаг был неровным.
  [0.18, 30],
  [0.23, 46],
  [0.28, 28],
  [0.33, 46],
  [0.38, 26],
  [0.43, 44],
  [0.48, 24],
  [0.53, 42],
  [0.58, 22],
  [0.63, 40],
  // Самая низкая точка программы — низкий проход над самим островом.
  [0.68, 15],
  [0.73, 34],
  [0.78, 20],
  [0.83, 36],
  [0.88, 22],
  [0.93, 34],
  [1.0, 20],
];

/**
 * Длина трассы ПО ЛОМАНОЙ узлов — оценка, и её хватает: полосы у земли задаются
 * в метрах, а метры от доли считаются умножением на длину. Настоящая длина
 * кривой известна только после сборки маршрута, а требования нужны при ней же.
 */
const CIRCUIT_LENGTH = circuitNodes.reduce((sum, node, index) => {
  if (index === 0) return 0;
  const previous = circuitNodes[index - 1].position;
  return (
    sum +
    Math.hypot(node.position[0] - previous[0], node.position[2] - previous[2])
  );
}, 0);

/**
 * Объявленные экстремумы профиля — горки и нырки программы, как их задал автор.
 *
 * Наружу они нужны затем, чтобы лента маршрута проверялась ПРОТИВ ЗАМЫСЛА, а
 * не против трёх запомненных чисел: набор ключей меняется вместе с программой,
 * и тест, знающий координаты наизусть, устаревает в тот же день.
 */
type RouteRelief = {
  readonly progress: number;
  readonly kind: "altitudePeak" | "altitudeTrough";
};

export const combatHexacopterRangeReliefs: readonly RouteRelief[] =
  ALTITUDE_KEYS.flatMap((key, index): RouteRelief[] => {
    const previous = ALTITUDE_KEYS[index - 1];
    const next = ALTITUDE_KEYS[index + 1];
    if (!previous || !next) return [];
    if (key[1] > previous[1] && key[1] > next[1]) {
      return [{ progress: key[0], kind: "altitudePeak" }];
    }
    if (key[1] < previous[1] && key[1] < next[1]) {
      return [{ progress: key[0], kind: "altitudeTrough" }];
    }
    return [];
  });

function showAltitude(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  for (let index = 1; index < ALTITUDE_KEYS.length; index += 1) {
    const [toAt, toValue] = ALTITUDE_KEYS[index];
    if (clamped > toAt) continue;
    const [fromAt, fromValue] = ALTITUDE_KEYS[index - 1];
    const span = Math.max(1e-6, toAt - fromAt);
    const t = Math.min(1, Math.max(0, (clamped - fromAt) / span));
    return fromValue + (toValue - fromValue) * t * t * (3 - 2 * t);
  }
  return ALTITUDE_KEYS[ALTITUDE_KEYS.length - 1][1];
}

export const combatHexacopterRangeCircuit = createMotionRoute({
  id: "combat-hexacopter:range-circuit",
  nodes: circuitNodes.map((_, index) => curvedNode(index)),
  measureAxes: [0, 2],
  requirements: {
    // ВЫСОТА — ЧАСТЬ ШОУ, а не константа безопасности. Горка на разгоне,
    // пикирование в дальний вираж, нырки и подскоки в долях восьмёрки —
    // перепады идут по всему маршруту, включая манёвры, и показывают, что
    // вертикаль у машины такой же орган, как крен. Окно перепадов гаснет к
    // краям, чтобы стыки со взлётным и посадочным столбами остались на
    // ровных двадцати метрах.
    altitude: ({ progress }) => {
      // СМЯГЧЕНИЕ У КОНЦОВ — ТОЖЕ В МЕТРАХ. Доля 0.03 на прежнем круге в 830 м
      // означала двадцать пять метров, а на программе в 3.5 км — сто, и первая
      // фигура попадала внутрь смягчения: ворота честно отвечали «не хватает
      // высоты на возврат», и петля не показывалась.
      const departure = Math.min(1, (progress * CIRCUIT_LENGTH) / 45);
      const arrival = Math.min(1, ((1 - progress) * CIRCUIT_LENGTH) / 55);
      const edge = Math.min(departure, arrival);
      // Окно — smoothstep, не линейка: излом линейного окна вторая
      // производная кривой читала как гребень и толкала газ вниз ровно на
      // подъёме первой горки (замер: −9.4 м у progress 0.15).
      const eased = edge * edge * (3 - 2 * edge);
      return Math.max(0, showAltitude(progress) * eased);
    },
    // СКОРОСТЬ РАЗРЕШЕНА ПО УЧАСТКУ, а не одним числом на весь круг: разгонный
    // луч и дальний разворот existуют ради неё, восьмёрка — ради поворотливости
    // на ней, и только у самой земли машина снова идёт по-причальному тихо.
    // СКОРОСТЬ УЧАСТКА — ПОТОЛОК ПО ЗАМЫСЛУ, а не рабочая точка. Прежние
    // полосы были выведены из физики (v = √(a·r) при поперечных 6.6 м/с²) — и
    // устарели в тот же день, когда машине подняли паспортный крен: маршрут
    // тормозил её числами вчерашнего аппарата. Физику считает governor из
    // ЖИВОГО паспорта; здесь остаётся только замысел: тихо у земли, во всю на
    // круге.
    // Коридор — требование участка: у земли строгие метры (взлётный и
    // посадочный столбы обязаны стоять над точкой), на круге — свобода
    // гоночной линии. Ширина здесь и есть та самая «точность исполнения».
    //
    // ПОЛОСЫ ЗАДАНЫ В МЕТРАХ ОТ БЕРТА, а не в долях трассы, и это не
    // педантизм. Прежние доли были выведены для круга в 830 м; на программе в
    // 2645 они означали бы строгий коридор и пять метров в секунду на первых
    // ста шестидесяти метрах — машина ползла бы полторы сотни метров, прежде
    // чем ей разрешили бы лететь. Доля — свойство длины, а близость к земле —
    // свойство места.
    corridor: ({ progress }) => {
      const metres = progress * CIRCUIT_LENGTH;
      const toDock = (1 - progress) * CIRCUIT_LENGTH;
      // Строгий столб — сорок метров: ровно столько держит вертикальный уход
      // (`departure-complete` стоит на сорока) и столько же занимает снижение
      // на площадку. Раньше это выражалось долей, и доля перестала значить то
      // же самое, когда программа выросла втрое.
      if (metres < 40 || toDock < 40) return 4;
      if (toDock < 110) return 12;
      return 30;
    },
    speedLimit: ({ progress }) => {
      const metres = progress * CIRCUIT_LENGTH;
      const toDock = (1 - progress) * CIRCUIT_LENGTH;
      if (metres < 26) return 5;
      if (toDock < 20) return 4.5;
      if (toDock < 70) return 8;
      return 30;
    },
  },
  markers: {
    departureComplete: "departure-complete",
    arriving: "arrival-shoulder",
    final: "final",
  },
});

/**
 * ФИГУРЫ ПОКАЗАТЕЛЬНОГО МАРШРУТА.
 *
 * Обе стоят там, где их требует сама трасса, а не «где красиво».
 *
 * ПЕТЛЯ — на разгонном луче. Он прямой, длинный и высокий: к этой доле волна
 * высоты добавляет девять метров к базовым двадцати, а петля просит запаса
 * снизу (провал плюс возврат из перевёрнутого) и двадцать шесть метров неба
 * сверху. Курс она не меняет и возвращает машину в точку входа, поэтому трасса
 * продолжается практически оттуда же.
 *
 * ИММЕЛЬМАН — на дальнем развороте, и он там ЗАМЕНЯЕТ манёвр, а не украшает
 * его. Трасса разворачивается широкой дугой в сотню метров; иммельман
 * разворачивает машину на месте, и трасса подхватывает её уже на обратном
 * галсе. Курс на выходе расходится с трассой на двадцать градусов — это
 * доворот, который автопилот закрывает обычными средствами.
 *
 * Ход фигуры — шестнадцать метров в секунду, и это не «помедленнее»: радиус
 * растёт как квадрат хода, и на разрешённых участку тридцати петля попросила
 * бы шестьдесят четыре метра неба вместо двадцати шести.
 */
/**
 * Ход фигуры — не «помедленнее», а её размер: радиус растёт как КВАДРАТ хода.
 * Шестнадцать метров в секунду дают петлю в тринадцать метров радиуса,
 * двадцать пять — в тридцать два. Отсюда и две петли: они не повторяют друг
 * друга, они показывают, что размер фигуры — свойство входа, а не машины.
 */
export const COMBAT_HEXACOPTER_FIGURE_SPEED = 16;
// Двадцать один, а не двадцать пять: на двадцати пяти радиус выходит 32 м, а
// провал — 24, и петля просит под собой 33.5 м чистого воздуха. Машина держит
// маршрутную высоту с постоянным недобором около пятнадцати метров, и ворота
// честно отказывали фигуре. На двадцати одном радиус 22.5 — по-прежнему в
// полтора раза шире малой, то есть разница видна, а требование выполнимо.
export const COMBAT_HEXACOPTER_BIG_FIGURE_SPEED = 21;

/** Годное небо полигона: видимая оболочка мира поднята под эту машину. */
export const COMBAT_HEXACOPTER_RANGE_SKY = 150;

/**
 * ЭТАЖ ПОД ФИГУРУ, м над бертом, — у КАЖДОЙ станции свой.
 *
 * Петля забирает высоту не только вверх: на вертикальных кусках вес держать
 * нечем, тяга смотрит поперёк него, и машина проседает. Провал объявлен как
 * 0.75 радиуса, к нему прибавляется возврат из перевёрнутого (11.8 м — тоже
 * замер, полубочка считается по власти, которая есть на газе возврата, а не по
 * паспортному пределу). Малой петле это даёт 21.6, большой — 35.7, и объявлять
 * им один этаж значило бы либо не пустить малую, либо уронить большую.
 *
 * Иммельману провал не нужен: он кончается наверху и вниз не идёт.
 * Проверяется тестом против ЖИВОГО паспорта машины, а не сверкой с самим собой.
 */
export const COMBAT_HEXACOPTER_FIGURE_FLOOR = 26;
export const COMBAT_HEXACOPTER_BIG_FIGURE_FLOOR = 34;
const IMMELMANN_FLOOR = 16;

const nodeAt = (id: string) => combatHexacopterRangeCircuit.nodeProgress(id);

/**
 * ЧЕТЫРЕ НОМЕРА ПРОГРАММЫ, В КОТОРЫХ МАШИНА ПЕРЕВОРАЧИВАЕТСЯ.
 *
 * Две петли РАЗНОГО размера — они не повторяют друг друга: радиус растёт как
 * квадрат хода, тринадцать метров на шестнадцати и тридцать два на двадцати
 * пяти. Два иммельмана, и оба стоят на ШПИЛЬКАХ: фигура разворачивает машину
 * на месте, и трасса в этом месте обязана разворачиваться так же коротко —
 * иначе после фигуры машина оказывается в полусотне метров от собственного
 * маршрута. Второй из них и есть вход на заход: из него машина уже идёт на
 * створ.
 */
export const combatHexacopterRangeFigures: readonly RouteFigureStation[] = [
  {
    key: "immelmann-north",
    kind: "immelmann",
    at: nodeAt("immelmann-north"),
    resumeAt: nodeAt("north-rejoin"),
    speed: COMBAT_HEXACOPTER_FIGURE_SPEED,
    floor: IMMELMANN_FLOOR,
    sky: COMBAT_HEXACOPTER_RANGE_SKY,
  },
  {
    key: "loop-small",
    kind: "loop",
    at: nodeAt("loop-small"),
    // Петля закрывается в точке входа, поэтому трасса продолжается оттуда же.
    resumeAt: nodeAt("loop-small"),
    speed: COMBAT_HEXACOPTER_FIGURE_SPEED,
    floor: COMBAT_HEXACOPTER_FIGURE_FLOOR,
    sky: COMBAT_HEXACOPTER_RANGE_SKY,
  },
  {
    key: "loop-big",
    kind: "loop",
    at: nodeAt("loop-big"),
    resumeAt: nodeAt("loop-big"),
    speed: COMBAT_HEXACOPTER_BIG_FIGURE_SPEED,
    floor: COMBAT_HEXACOPTER_BIG_FIGURE_FLOOR,
    sky: COMBAT_HEXACOPTER_RANGE_SKY,
  },
  {
    key: "immelmann-final",
    kind: "immelmann",
    at: nodeAt("immelmann-final"),
    resumeAt: nodeAt("final-rejoin"),
    speed: COMBAT_HEXACOPTER_FIGURE_SPEED,
    floor: IMMELMANN_FLOOR,
    sky: COMBAT_HEXACOPTER_RANGE_SKY,
  },
];

/** Ширина подхода к фигуре в долях трассы: на ней снимается ход и берётся этаж. */
const FIGURE_RUN_IN = 0.03;

/**
 * Подход к фигуре — с ВЕСОМ, а не выключателем.
 *
 * Ступенька в требовании участка — это ступенька, которую кто-то обязан
 * отработать: газ гонится за скачком ограничения, а лента читает скачок как
 * ворота и рисует их там, где никаких ворот нет. Замер: восемь ворот вместо
 * четырёх и потерянные экстремумы высоты, потому что жёсткий `max` срезал
 * профиль плоскостью. Вес растёт плавно к станции и так же плавно спадает.
 */
function figureApproach(
  progress: number,
): { readonly station: RouteFigureStation; readonly weight: number } | null {
  // БЛИЖАЙШАЯ СТАНЦИЯ, А НЕ ПЕРВАЯ ПОДОШЕДШАЯ. Окна соседних фигур
  // перекрываются — на разгонном луче петля и шпилька стоят в полутора
  // десятых доли друг от друга, — и первая заслоняла вторую: подход к
  // иммельману разрешал 24.8 м/с вместо шестнадцати, потому что вес считался
  // по уходящей петле.
  let best: { readonly station: RouteFigureStation; readonly weight: number } | null =
    null;
  for (const station of combatHexacopterRangeFigures) {
    const before = (progress - (station.at - FIGURE_RUN_IN)) / FIGURE_RUN_IN;
    // Окно СИММЕТРИЧНО: ограничение отпускается так же полого, как бралось.
    // С коротким хвостом ход возвращался с тридцати за восемь кадров, и лента
    // честно ставила там ворота — скачок требования и есть ворота.
    const after = (station.at + FIGURE_RUN_IN - progress) / FIGURE_RUN_IN;
    if (before <= 0 || after <= 0) continue;
    const raw = Math.min(1, before, after);
    const weight = raw * raw * (3 - 2 * raw);
    if (!best || weight > best.weight) {
      best = { station, weight };
    }
  }
  return best;
}

/**
 * ХОД В ВИРАЖЕ ТРАССА НЕ СЧИТАЕТ, и это не упущение.
 *
 * Здесь стояла своя формула `v = √(a·r)` с поперечным ускорением машины,
 * зашитым в маршрут числом. Она работала — и была в неверном слое дважды.
 * Во-первых, паспорт машины в требовании трассы мёртв: выбьет винт, наклон
 * упадёт, а трасса будет по-прежнему разрешать свои 6.6. Во-вторых, сглаживание
 * назад «под торможение» — это упреждение, а упреждение по определению знает,
 * откуда машина летит и с какой скоростью; трасса не знает ни того, ни другого.
 *
 * Всё это уже есть у автопилота и считается из ЖИВОГО паспорта:
 * `corneringSpeed` берёт радиус, угол дуги, располагаемое поперечное и допуск
 * заноса участка, а `pathSpeedCeiling` тормозит заранее. Трассе остаётся
 * замысел: потолок хода по участкам, рельеф высоты и КОРИДОР — тот самый допуск,
 * в котором автопилоту разрешено лавировать.
 */
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

/**
 * CONTROL THE SKIES: СТОРОЖЕВАЯ ОРБИТА ПО ПЕРИМЕТРУ.
 *
 * Это не «маршрут для красоты», а рабочее место машины: она ходит по кромке
 * охраняемого круга и смотрит по касательной. Радиус и высота выведены, а не
 * выбраны:
 *
 *  - РАДИУС 46 м — кромка суши полигона (50 м) минус полугабарит машины и
 *    запас: сторожить надо периметр, а не летать над ним по центру;
 *  - ВЫСОТА 26 м — выше высотной волны цели (максимум 30 м на её злом
 *    маршруте — нет, ровно под ним) и заведомо выше палубы. Взято из
 *    требования видеть весь круг, а не из вкуса;
 *  - СКОРОСТЬ 16 м/с — вираж радиусом 46 м требует v²/r = 5.6 м/с² при
 *    располагаемых 14.5, то есть машина идёт по кругу с большим запасом и
 *    может сорваться в перехват в любой момент, не сбрасывая ход.
 *
 * СТОРОЖЕВОЙ ПОЛЁТ — ЭТО НЕ ОДИН КРУГ. Маршрут кончается точкой, и машина,
 * пройдя один оборот, честно пошла бы садиться — то есть «сторожить небо»
 * означало бы полторы минуты дежурства. Пока рейс не умеет длиться до приказа,
 * орбита наматывается сорок раз: 11.6 км, около двенадцати минут дежурства при
 * шестнадцати метрах в секунду. Это ЗАПЛАТКА, и она названа заплаткой: правильно
 * было бы дать рейсу признак «до отмены», и тогда кругов не считают вовсе.
 */
export const COMBAT_HEXACOPTER_GUARD_RADIUS = 46;
export const COMBAT_HEXACOPTER_GUARD_ALTITUDE = 26;
export const COMBAT_HEXACOPTER_GUARD_SPEED = 16;

export const COMBAT_HEXACOPTER_GUARD_LAPS = 40;

const guardCircle = createMotionRoute({
  id: "combat-hexacopter:guard",
  // Круг считается формулой: шестнадцать узлов с касательными ручками длиной
  // в треть хорды — так дуга остаётся дугой, а не шестнадцатиугольником.
  nodes: Array.from({ length: 16 * COMBAT_HEXACOPTER_GUARD_LAPS + 1 }, (_, index) => {
    const step = (2 * Math.PI) / 16;
    const t = index * step;
    const r = COMBAT_HEXACOPTER_GUARD_RADIUS;
    const position: SceneVector3 = [r * Math.sin(t), 0, r * Math.cos(t)];
    const tangent: SceneVector3 = [
      r * Math.cos(t) * (step / 3),
      0,
      -r * Math.sin(t) * (step / 3),
    ];
    return {
      id:
        index === 0
          ? "berth"
          : index === 16 * COMBAT_HEXACOPTER_GUARD_LAPS
            ? "dock"
            : `guard-${index}`,
      position,
      incoming: [position[0] - tangent[0], 0, position[2] - tangent[2]] as SceneVector3,
      outgoing: [position[0] + tangent[0], 0, position[2] + tangent[2]] as SceneVector3,
      samples: 32,
    };
  }),
  measureAxes: [0, 2],
  markers: {
    departureComplete: "guard-1",
    arriving: `guard-${16 * COMBAT_HEXACOPTER_GUARD_LAPS - 1}`,
    final: "dock",
  },
  requirements: {
    altitude: () => COMBAT_HEXACOPTER_GUARD_ALTITUDE,
    speedLimit: () => COMBAT_HEXACOPTER_GUARD_SPEED,
    // КОРИДОР ОБЯЗАТЕЛЕН: общий контракт трассы спрашивает его наравне с
    // высотой и скоростью, и отсутствие требования — это не «по умолчанию
    // широко», а исключение при первом же обращении.
    //
    // Дежурство — не гоночная линия: машина обязана ИДТИ ПО КРОМКЕ, иначе
    // «сторожить периметр» превращается в «болтаться неподалёку». Восемь
    // метров при радиусе сорок шесть — это точность в пределах собственного
    // габарита, и она же оставляет место срываться в перехват, не считая
    // такой срыв уходом с трассы.
    corridor: () => 8,
  },
});

export function combatHexacopterGuardPlan(berth: SceneVector3): VehicleRoutePlan {
  return {
    ...placedPlan(guardCircle, berth, guardCircle.markerProgress("final")),
    guidanceLookahead: () => 22,
  };
}

export function combatHexacopterRangePlan(berth: SceneVector3): VehicleRoutePlan {
  const placed = placedPlan(
    combatHexacopterRangeCircuit,
    berth,
    combatHexacopterRangeCircuit.markerProgress("final"),
  );
  // ФИГУРА — ТРЕБОВАНИЕ УЧАСТКА, и требования вокруг неё подстраиваются под
  // неё, а не наоборот. Ход снимается до фигурного: радиус растёт как квадрат
  // хода, и на разрешённых участку тридцати петля попросила бы шестьдесят
  // четыре метра неба вместо двадцати шести.
  const altitude = (progress: number) => {
    const approach = figureApproach(progress);
    const base = placed.altitude(progress);
    if (!approach) return base;
    const { station, weight } = approach;
    // ЭТАЖ ГАСНЕТ К КОНЦАМ ТАК ЖЕ, КАК САМ ПРОФИЛЬ. Доля берётся из уже
    // посчитанной высоты, а не пересчитывается своими константами: иначе у
    // трассы завелось бы два мнения о том, где кончается взлётный столб.
    // Первая редакция этого не делала, и подход к первой петле поднимал берт
    // на двадцать шесть метров — маршрут переставал начинаться на площадке.
    const show = showAltitude(progress);
    const eased = show > 1e-6 ? (base - berth[1]) / show : 0;
    const shelf =
      berth[1] + station.floor * Math.min(1, Math.max(0, eased)) * weight;
    return Math.max(base, shelf);
  };
  return {
    ...placed,
    figures: combatHexacopterRangeFigures,
    // ДОПУСК — СВОЙСТВО УЧАСТКА, и на фигурном участке он широкий.
    //
    // Там, где трасса объявляет фигуру, она объявляет и манёвр, который простой
    // автопилот выполнить не может: шпильку в тридцать четыре метра радиусом
    // машина без иммельмана обходит широко, и это не промах, а честная разница
    // между «развернуться на месте» и «обойти дугой». Высота там маршрутная,
    // до земли и до соседей далеко — цена ширины нулевая, а требовать точности
    // значило бы требовать невозможного и звать это отказом.
    corridor: (progress) => {
      const approach = figureApproach(progress);
      const base = placed.corridor?.(progress) ?? 30;
      if (!approach) return base;
      // Но СТОЛБ У ЗЕМЛИ шире не становится никогда: там точность — вопрос
      // столкновения, а не красоты, и никакая фигура его не отменяет.
      if (base < 30) return base;
      return Math.max(base, 30 + 40 * approach!.weight);
    },
    altitude,
    point(progress) {
      const point = placed.point(progress);
      return [point[0], altitude(progress), point[2]];
    },
    speedLimit: (progress) => {
      const approach = figureApproach(progress);
      const open = placed.speedLimit(progress);
      if (!approach) return open;
      // Ход снимается ПЛАВНО к фигурному: скачок ограничения governor читает
      // как торможение в пол, а лента — как ворота.
      return open + (Math.min(open, approach.station.speed) - open) * approach.weight;
    },
    verticalDeparture: {
      altitude: berth[1] + CLEARANCE_ALTITUDE,
      until: combatHexacopterRangeCircuit.markerProgress("departureComplete"),
      tolerance: 0.75,
    },
    verticalArrival: {
      altitude: berth[1] + CLEARANCE_ALTITUDE,
      from: combatHexacopterRangeCircuit.markerProgress("final"),
      horizontalTolerance: 0.85,
    },
    guidanceLookahead: () => 18,
  };
}

export function combatHexacopterRangeArrivalPlan(berth: SceneVector3): VehicleRoutePlan {
  return combatHexacopterRangePlan(berth);
}

export function combatHexacopterRangeEscapePlan(
  berth: SceneVector3,
  input: SkyTrainEmergencyEscapeInput,
): VehicleRoutePlan {
  const length = Math.hypot(input.forward[0], input.forward[2]) || 1;
  const direction: SceneVector3 = [input.forward[0] / length, 0, input.forward[2] / length];
  return {
    id: "combat-hexacopter:range-escape",
    length: 120,
    point(progress) {
      return [
        berth[0] + input.start[0] + direction[0] * progress * 120,
        berth[1] + input.start[1] + CLEARANCE_ALTITUDE + progress * 12,
        berth[2] + input.start[2] + direction[2] * progress * 120,
      ];
    },
    speedLimit: (progress) => progress < 0.2 ? 5 : 10,
    altitude: (progress) => berth[1] + input.start[1] + CLEARANCE_ALTITUDE + progress * 12,
    finalFrom: Number.POSITIVE_INFINITY,
  };
}

export function combatHexacopterGuardPhase(progress: number) {
  return motionRoutePhase(guardCircle, progress, "departureComplete", "arriving");
}

export function combatHexacopterRangePhase(progress: number) {
  return motionRoutePhase(
    combatHexacopterRangeCircuit,
    progress,
    "departureComplete",
    "arriving",
  );
}
