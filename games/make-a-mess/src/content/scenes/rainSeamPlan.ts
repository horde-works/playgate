export type RainSeamPlanPoint = readonly [x: number, z: number];

export interface RainSeamSurfaceRoute {
  readonly id: string;
  readonly purpose: string;
  readonly points: readonly RainSeamPlanPoint[];
  /** Half-width in world metres. */
  readonly width: number;
  /** 0..1 soil, grit and tyre/foot traffic deposited on the surface. */
  readonly dirt: number;
  /** 0..1 water retained along this route after rain. */
  readonly wetness: number;
}

export interface RainSeamSurfaceArea {
  readonly id: string;
  readonly purpose: string;
  readonly center: RainSeamPlanPoint;
  readonly radius: RainSeamPlanPoint;
  readonly dirt: number;
  readonly wetness: number;
  readonly rotation?: number;
}

/**
 * Задворки: красный канал — принесённая грязь, зелёный — стоящая вода.
 * Каждый маршрут списан с реального движения: машина заезжает с улицы в
 * ворота и по дуге доезжает до сарая, покупатели месят грязь у киоска,
 * жильцы протоптали тропку к своей двери, стройка раскатана экскаватором.
 */
export const rainSeamSurfaceRoutes: readonly RainSeamSurfaceRoute[] = [
  {
    id: "gate-rut-left",
    purpose: "Left wheel rut: street, gate, lane, then the arc to the shed",
    points: [[-0.95, 40], [-0.9, 36], [-0.8, 30], [-0.65, 24], [-1.1, 16], [-2.5, 6], [-3.9, -4], [-4.5, -12], [-4.7, -16.4]],
    width: 0.48,
    dirt: 0.95,
    wetness: 0.75,
  },
  {
    id: "gate-rut-right",
    purpose: "Right wheel rut through the same drive",
    points: [[0.75, 40], [0.8, 36], [0.92, 30], [1.05, 24], [0.62, 16], [-0.75, 6], [-2.15, -4], [-2.75, -12], [-2.95, -16.4]],
    width: 0.48,
    dirt: 0.93,
    wetness: 0.73,
  },
  {
    id: "kiosk-rut-left",
    purpose: "Vans pull off the street to load at the kiosk",
    points: [[-15.5, 45.4], [-11.5, 44.6], [-8.2, 43.9]],
    width: 0.5,
    dirt: 0.96,
    wetness: 0.68,
  },
  {
    id: "kiosk-rut-right",
    purpose: "Second tyre line at the kiosk apron",
    points: [[-15.5, 43.8], [-11.8, 43.2], [-8.6, 42.6]],
    width: 0.5,
    dirt: 0.94,
    wetness: 0.66,
  },
  {
    id: "door-footpath",
    purpose: "Household path from the lane around the house to its door",
    points: [[1.2, 25], [1.8, 22.4], [4.2, 21.1], [8.2, 20.7], [10.7, 21.6], [11.3, 23.8]],
    width: 0.85,
    dirt: 0.8,
    wetness: 0.52,
  },
  {
    id: "shed-footpath",
    purpose: "Kids run between the yard and the timber shed door",
    points: [[-1.4, -7], [-2.1, -12.5], [-2.5, -17.2]],
    width: 0.8,
    dirt: 0.82,
    wetness: 0.6,
  },
  {
    id: "house-eave-runoff",
    purpose: "Roof water soaking the lane-side plinth of the main house",
    points: [[2.95, 23], [2.95, 28], [2.95, 33]],
    width: 0.6,
    dirt: 0.42,
    wetness: 0.9,
  },
  {
    id: "shed-eave-runoff",
    purpose: "Broad damp strip below the corrugated shed eave",
    points: [[-7.6, -18.15], [-4.2, -18.05], [-0.9, -18.15]],
    width: 0.62,
    dirt: 0.5,
    wetness: 0.92,
  },
  {
    id: "west-fence-drain",
    purpose: "Leaf litter and water along the perforated wall footing",
    points: [[-11.35, -23], [-11.3, -8], [-11.4, 6], [-11.3, 19], [-11.4, 33]],
    width: 0.6,
    dirt: 0.52,
    wetness: 0.8,
  },
  {
    id: "street-gutter",
    purpose: "Standing rain along the broken south edge of the asphalt",
    points: [[-24, 46.3], [-10, 46.5], [4, 46.4], [24, 46.3]],
    width: 0.7,
    dirt: 0.32,
    wetness: 0.86,
  },
  {
    id: "site-track-left",
    purpose: "Excavator track raked across the groundworks strip",
    points: [[-14.5, -36.8], [-6, -35.2], [3, -36.4], [10, -34.6], [15.5, -36.2]],
    width: 0.62,
    dirt: 1,
    wetness: 0.7,
  },
  {
    id: "site-track-right",
    purpose: "Second excavator track",
    points: [[-14.5, -35.2], [-6.2, -33.6], [2.8, -34.8], [9.8, -33], [15.2, -34.6]],
    width: 0.62,
    dirt: 0.98,
    wetness: 0.68,
  },
] as const;

export const rainSeamSurfaceAreas: readonly RainSeamSurfaceArea[] = [
  {
    id: "kiosk-apron",
    purpose: "Trampled loading mud in front of the kiosk stoop",
    center: [-6.4, 43.6],
    radius: [2.8, 3.4],
    rotation: 0.15,
    dirt: 0.96,
    wetness: 0.62,
  },
  {
    id: "gate-threshold",
    purpose: "Compacted wet gravel pushed through the gateway",
    center: [0, 36.4],
    radius: [3.4, 2.9],
    dirt: 0.88,
    wetness: 0.8,
  },
  {
    id: "lane-shade",
    purpose: "The lane dries last: shaded by the house and the wall",
    center: [0.7, 28.6],
    radius: [2.4, 6.4],
    dirt: 0.66,
    wetness: 0.74,
  },
  {
    id: "bike-corner",
    purpose: "Standing water where the kids drop their bikes",
    center: [-4.6, -18.6],
    radius: [4.2, 3.1],
    dirt: 0.84,
    wetness: 0.76,
  },
  {
    id: "yard-heart",
    purpose: "Uneven compacted earth in the middle of the yard",
    center: [1, 4],
    radius: [8.5, 15],
    rotation: -0.12,
    dirt: 0.72,
    wetness: 0.5,
  },
  {
    id: "workyard-east",
    purpose: "Grit around the firewood and the drum",
    center: [14.6, 18],
    radius: [3.6, 5.2],
    dirt: 0.82,
    wetness: 0.55,
  },
  {
    id: "construction-strip",
    purpose: "The whole dug-up band between the yard and the towers",
    center: [0, -32.6],
    radius: [16, 6.2],
    dirt: 0.97,
    wetness: 0.56,
  },
  {
    id: "fresh-pavers",
    purpose: "New pavers by the towers: clean but still wet and reflective",
    center: [0, -45.5],
    radius: [20, 5.6],
    dirt: 0.08,
    wetness: 0.72,
  },
  {
    id: "carport-patio",
    purpose: "Neat brick patio under the string lights",
    center: [11.6, 44.9],
    radius: [3.6, 2.7],
    dirt: 0.3,
    wetness: 0.6,
  },
] as const;
