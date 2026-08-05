import type { SceneVector3 } from "./destructionScene.ts";
import {
  createMotionRoute,
  motionRoutePhase,
  type MotionRouteArtifact,
} from "./motionRoute.ts";
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
function figureEight(): SceneVector3[] {
  const centreX = -4;
  const centreZ = -46;
  // Размер выбран из ПОПЕРЕЧНОЙ способности, а не из вкуса. Тоннели толкают
  // вдоль носа и в повороте не помогают: боковое ускорение по-прежнему даёт
  // только наклон, то есть g·tg(34°) = 6.6 м/с². Скорость в вираже равна
  // sqrt(a·r), поэтому чтобы пройти восьмёрку быстро, её надо сделать широкой,
  // а не просить у машины несуществующее.
  const halfWidth = 46;
  const halfHeight = 30;
  const samples = 16;
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

const circuitPoints = [
  [0, 0, 0],
  [0, 0, 12],
  // Разгонный луч: прямая, на которой синфазная тяга успевает раскрутить ход.
  [6, 0, 40],
  [14, 0, 72],
  [20, 0, 100],
  // Дальний разворот на удалении ста метров от берта.
  [4, 0, 112],
  [-22, 0, 104],
  [-34, 0, 78],
  [-30, 0, 44],
  // Возврат к острову другим галсом.
  [-14, 0, 14],
  [-6, 0, -18],
  [-24, 0, -38],
  ...figureEight(),
  // Выход на створ и заход.
  [4, 0, 26],
  [0, 0, 15],
  [0, 0, 0],
] satisfies readonly SceneVector3[];

function curvedNode(index: number) {
  const position = circuitPoints[index];
  if (index === 0 || index === circuitPoints.length - 1) {
    return { id: index === 0 ? "berth" : "dock", position };
  }
  const previous = circuitPoints[index - 1];
  const next = circuitPoints[index + 1];
  // Катмулл-Ром: ручка — половина хорды соседей. Прежние 0.16 давали почти
  // ломаную со скруглёнными углами, и в небе это читалось изломами луча.
  const tangent: SceneVector3 = [
    (next[0] - previous[0]) * 0.3,
    0,
    (next[2] - previous[2]) * 0.3,
  ];
  return {
    id: index === 1
      ? "clear"
      : index === 2
        ? "departure-complete"
        : index === circuitPoints.length - 3
          ? "arrival-shoulder"
          : index === circuitPoints.length - 2
            ? "final"
            : `circuit-${index}`,
    position,
    incoming: [position[0] - tangent[0], 0, position[2] - tangent[2]] as SceneVector3,
    outgoing: [position[0] + tangent[0], 0, position[2] + tangent[2]] as SceneVector3,
    samples: 48,
  };
}

export const combatHexacopterRangeCircuit = createMotionRoute({
  id: "combat-hexacopter:range-circuit",
  nodes: circuitPoints.map((_, index) => curvedNode(index)),
  measureAxes: [0, 2],
  requirements: {
    // ВЫСОТА — ЧАСТЬ ШОУ, а не константа безопасности. Горка на разгоне,
    // пикирование в дальний вираж, нырки и подскоки в долях восьмёрки —
    // перепады идут по всему маршруту, включая манёвры, и показывают, что
    // вертикаль у машины такой же орган, как крен. Окно перепадов гаснет к
    // краям, чтобы стыки со взлётным и посадочным столбами остались на
    // ровных двадцати метрах.
    altitude: ({ progress }) => {
      const departure = Math.min(1, progress / 0.085);
      const arrival = Math.min(1, (1 - progress) / 0.11);
      const edge = Math.min(departure, arrival);
      const base = CLEARANCE_ALTITUDE * edge * edge * (3 - 2 * edge);
      // Окно — smoothstep, не линейка: излом линейного окна вторая
      // производная кривой читала как гребень и толкала газ вниз ровно на
      // подъёме первой горки (замер: −9.4 м у progress 0.15).
      const eased = (raw: number) => {
        const clamped = Math.min(1, Math.max(0, raw));
        return clamped * clamped * (3 - 2 * clamped);
      };
      const window =
        eased((progress - 0.1) / 0.08) * eased((0.88 - progress) / 0.08);
      const bump = (centre: number, width: number) => {
        const x = (progress - centre) / width;
        return Math.exp(-x * x * 2.2);
      };
      const wave =
        9 * bump(0.2, 0.09) -
        8 * bump(0.36, 0.08) +
        6 * bump(0.5, 0.06) -
        6 * bump(0.6, 0.055) +
        9 * bump(0.7, 0.06) -
        7 * bump(0.8, 0.055);
      return Math.max(0, base + window * wave);
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
    corridor: ({ progress }) =>
      progress < 0.06 ? 4 : progress < 0.9 ? 30 : progress < 0.96 ? 12 : 4,
    speedLimit: ({ progress }) => {
      if (progress < 0.06) return 5;
      if (progress < 0.9) return 30;
      if (progress < 0.96) return 8;
      return 4.5;
    },
  },
  markers: {
    departureComplete: "departure-complete",
    arriving: "arrival-shoulder",
    final: "final",
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

export function combatHexacopterRangePlan(berth: SceneVector3): VehicleRoutePlan {
  return {
    ...placedPlan(
      combatHexacopterRangeCircuit,
      berth,
      combatHexacopterRangeCircuit.markerProgress("final"),
    ),
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

export function combatHexacopterRangePhase(progress: number) {
  return motionRoutePhase(
    combatHexacopterRangeCircuit,
    progress,
    "departureComplete",
    "arriving",
  );
}
