export type TownPlanPoint = readonly [x: number, z: number];

export interface TownSurfaceRoute {
  readonly id: string;
  readonly purpose: string;
  readonly points: readonly TownPlanPoint[];
  /** Half-width in world metres. */
  readonly width: number;
  /** 0..1 soil, grit and tyre/foot traffic deposited on the surface. */
  readonly dirt: number;
  /** 0..1 water retained along this route after rain. */
  readonly wetness: number;
}

export interface TownSurfaceArea {
  readonly id: string;
  readonly purpose: string;
  readonly center: TownPlanPoint;
  readonly radius: TownPlanPoint;
  readonly dirt: number;
  readonly wetness: number;
  readonly rotation?: number;
}

/**
 * Протоптанные тропинки старого квартала: маски ложатся прямо на городской
 * газон (yard:ground размечен как city-ground). Красный канал — принесённый
 * грунт, зелёный — стоящая вода. Каждый маршрут — реальное движение людей:
 * к дверям, вокруг домов, от ворот к дороге.
 */
export const townSurfaceRoutes: readonly TownSurfaceRoute[] = [
  {
    id: "gate-to-street",
    purpose: "От синих ворот вдоль старого дома к главной улице",
    points: [[-1.6, 8.4], [1.4, 6.6], [4.6, 5.0], [6.2, 1.6], [6.4, -3.0], [5.8, -7.8]],
    width: 0.85,
    dirt: 0.9,
    wetness: 0.62,
  },
  {
    id: "door-cream",
    purpose: "Дорожка от ворот через палисадник к двери отступившего дома",
    points: [[-2.4, 9.5], [-5.6, 9.9], [-8.6, 10.9], [-9.4, 11.9]],
    width: 0.7,
    dirt: 0.85,
    wetness: 0.58,
  },
  {
    id: "door-white",
    purpose: "От дворового проезда панельки к двери белёного дома",
    points: [[29.2, 2.8], [29.0, 5.6], [28.7, 8.2]],
    width: 0.7,
    dirt: 0.85,
    wetness: 0.58,
  },
  {
    id: "ring-white",
    purpose: "Хозяйская тропка вокруг белёного дома",
    points: [[28.7, 8.1], [24.4, 8.4], [23.6, 12.3], [24.4, 16.9], [29.8, 17.2], [34.8, 17.0], [36.2, 12.6], [35.4, 8.5]],
    width: 0.55,
    dirt: 0.68,
    wetness: 0.55,
  },
  {
    id: "ring-cream",
    purpose: "Обход кремового дома к газовому вводу и белью",
    points: [[-9.4, 11.6], [-13.6, 11.4], [-14.9, 15.2], [-13.8, 20.6], [-9.0, 20.9], [-4.5, 20.4], [-2.3, 16.6], [-4.0, 11.5]],
    width: 0.55,
    dirt: 0.66,
    wetness: 0.56,
  },
  {
    id: "shed-run",
    purpose: "К сараю, где дети бросают велосипеды",
    points: [[-4.6, 8.6], [-5.4, 6.0], [-5.8, 3.2], [-6.6, 0.9]],
    width: 0.75,
    dirt: 0.88,
    wetness: 0.66,
  },
  {
    id: "playground-cut",
    purpose: "Срезка от детской площадки мимо киоска к воротам",
    points: [[19.6, 3.0], [16.8, 2.6], [13.2, 2.8], [9.6, 4.6], [6.0, 6.6], [2.6, 8.2]],
    width: 0.8,
    dirt: 0.82,
    wetness: 0.56,
  },
  {
    id: "south-carport",
    purpose: "От гравийного дворика к навесу с гирляндой",
    points: [[21.0, -46.4], [19.4, -49.4], [17.8, -51.3]],
    width: 0.7,
    dirt: 0.84,
    wetness: 0.6,
  },
  {
    id: "south-gate-walk",
    purpose: "От синих ворот усадьбы к двери жёлтого дома",
    points: [[27.7, -46.9], [27.4, -48.6], [27.2, -50.1]],
    width: 0.75,
    dirt: 0.88,
    wetness: 0.6,
  },
  {
    id: "ring-south",
    purpose: "Тропка вокруг южного дома по заднему двору",
    points: [[27.3, -49.4], [22.4, -48.7], [19.6, -51.0], [18.8, -55.2], [20.2, -58.6], [25.6, -60.3], [31.0, -60.2], [33.6, -57.6], [34.2, -53.4], [33.0, -50.4], [29.8, -49.6]],
    width: 0.55,
    dirt: 0.64,
    wetness: 0.58,
  },
  {
    id: "h1-door",
    purpose: "С тротуара главной улицы к центральной двери первого дома",
    points: [[5.8, -7.8], [2.6, -8.2], [0, -7.8]],
    width: 0.75,
    dirt: 0.82,
    wetness: 0.58,
  },
  {
    id: "h1-terrace",
    purpose: "От ступеней задней террасы к синим воротам участка Б",
    points: [[0, 4.6], [-0.9, 6.7], [-1.6, 8.4]],
    width: 0.6,
    dirt: 0.68,
    wetness: 0.5,
  },
  {
    id: "h2-playground",
    purpose: "От двери h2 мимо берёзы к детской площадке",
    points: [[56.4, 1.9], [59.2, 3.6], [62.6, 6.2]],
    width: 0.8,
    dirt: 0.78,
    wetness: 0.52,
  },
  {
    id: "k6-yard",
    purpose: "Жители панелек: с поперечной улицы вдоль двора k6 к площадке",
    points: [[46.2, 13.6], [50.8, 12.0], [55.4, 10.2], [59.8, 8.2], [62.8, 7.2]],
    width: 0.9,
    dirt: 0.82,
    wetness: 0.56,
  },
  {
    id: "h3-door",
    purpose: "С южной улицы к двери третьего дома",
    points: [[56, -33.6], [56, -36.2]],
    width: 0.7,
    dirt: 0.78,
    wetness: 0.55,
  },
] as const;

export const townSurfaceAreas: readonly TownSurfaceArea[] = [
  {
    id: "gate-threshold",
    purpose: "Уплотнённый мокрый грунт в створе синих ворот",
    center: [-1.6, 8.9],
    radius: [2.6, 2.0],
    dirt: 0.88,
    wetness: 0.74,
  },
  {
    id: "kiosk-apron",
    purpose: "Замешанная покупателями грязь у крыльца киоска",
    center: [14.6, 4.4],
    radius: [2.8, 1.7],
    rotation: 0.1,
    dirt: 0.94,
    wetness: 0.62,
  },
  {
    id: "shed-corner",
    purpose: "Вытоптанный грунт под великами у южной стены сарая",
    center: [-10.0, 0.7],
    radius: [3.0, 1.4],
    dirt: 0.8,
    wetness: 0.72,
  },
  {
    id: "carport-patio",
    purpose: "Пятно под навесом с гирляндой у южного дома",
    center: [15.8, -53.6],
    radius: [2.6, 2.0],
    rotation: 0.12,
    dirt: 0.42,
    wetness: 0.55,
  },
  {
    id: "gravel-court",
    purpose: "Разъезженный гравийный дворик на конце проезда",
    center: [21.8, -45.9],
    radius: [3.3, 2.0],
    dirt: 0.9,
    wetness: 0.62,
  },
  {
    id: "south-gate",
    purpose: "Утоптанный створ ворот усадьбы",
    center: [27.7, -46.7],
    radius: [2.2, 1.7],
    rotation: 0.12,
    dirt: 0.86,
    wetness: 0.7,
  },
  {
    id: "playground-1",
    purpose: "Вытоптанный песок и грунт вокруг восточной площадки",
    center: [68, 8],
    radius: [4.8, 3.2],
    dirt: 0.78,
    wetness: 0.5,
  },
  {
    id: "h1-threshold",
    purpose: "Порог центральной двери первого дома",
    center: [0, -7.7],
    radius: [2.6, 1.8],
    dirt: 0.82,
    wetness: 0.62,
  },
  {
    id: "h2-threshold",
    purpose: "Порог двери h2 под вывеской",
    center: [56, 1.8],
    radius: [2.8, 2.0],
    dirt: 0.82,
    wetness: 0.6,
  },
  {
    id: "h3-threshold",
    purpose: "Порог двери третьего дома",
    center: [56, -36.5],
    radius: [2.6, 1.8],
    dirt: 0.8,
    wetness: 0.6,
  },
] as const;
