// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Мост «Атырау»: не набор похожих диагоналей, а одна параметрическая сетка
// узлов. Все рёбра и алюминиевые лепестки ссылаются на эту сетку, поэтому
// шесть элементов внутреннего цветочного узла действительно сходятся в
// одной координате. Геометрия следует рабочим чертежам: центральная оболочка,
// две независимые стороны, переменный верхний проём со стяжками и шаг 1,4 м.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { astanaWays, type AstanaWay, type PlanPoint } from "./astanaPlan.ts";
import { groundUnder } from "./astanaShell.ts";
import { ASTANA_LANDMARK_LIGHT_PRIORITY } from "./astanaLighting.ts";

export const ATYRAU_FRAME_WHITE = "#e6e8e7";
const FRAME_SHADE = "#c8cdcf";
const ALUMINIUM_WHITE = "#f0f1ef";
const ALUMINIUM_SILVER = "#c3c7c8";
const DECK_WHITE = "#ffffff";
const DECK_GREY = "#92999b";
const BIKE_RED = "#a34a48";
const CONCRETE = "#9fa4a8";
const LIGHT_BAFFLE = "#747a7d";
const LIGHT_REFLECTOR = "#d4cec0";

export const ATYRAU_LIGHT_TEMPERATURE_K = 3000;
export const ATYRAU_LIGHT_COLOR = "#ffd0a0";
export const ATYRAU_LIGHT_COUNT = 12;
export const ATYRAU_LIGHT_GROUP = "astana:atyrau:architectural-lighting";
export const ATYRAU_LIGHT_TRANSITION = {
  fadeInSeconds: 2.8,
  fadeOutSeconds: 2.2,
} as const;

export const ATYRAU_SHELL_STATIONS = 16;
export const ATYRAU_SHELL_LEVELS = 8;
export const ATYRAU_SHELL_LENGTH = 21;
export const ATYRAU_FACADE_MODULE = 1.4;
export const ATYRAU_APPROACH_HALF_WIDTH = 2.8;
export const ATYRAU_CENTRAL_HALF_WIDTH = 4.8;
export const ATYRAU_RAIL_HEIGHT = 1.25;
export const ATYRAU_MIN_CROWN_HALF_GAP = 0.46;
export const ATYRAU_CASSETTE_PARTS = 1;
export const ATYRAU_DECK_THICKNESS = 0.12;

type ShellSideIndex = 0 | 1;
export type AtyrauNodeRef = readonly [
  side: ShellSideIndex,
  station: number,
  level: number,
];

export interface AtyrauShellNode {
  readonly ref: AtyrauNodeRef;
  readonly position: SceneVector3;
  readonly across: number;
  readonly height: number;
}

export interface AtyrauShellEdge {
  readonly id: string;
  readonly kind: "meridian" | "diagonal" | "base" | "crown" | "roof-tie";
  readonly from: AtyrauNodeRef;
  readonly to: AtyrauNodeRef;
}

export interface AtyrauPathStation {
  readonly distance: number;
  readonly fraction: number;
  readonly point: PlanPoint;
  readonly tangent: PlanPoint;
  readonly normal: PlanPoint;
}

export interface AtyrauShellTopology {
  readonly deckTop: number;
  readonly pathLength: number;
  readonly shellStart: number;
  readonly shellEnd: number;
  readonly stations: readonly AtyrauPathStation[];
  readonly nodes: readonly (readonly (readonly AtyrauShellNode[])[])[];
  readonly edges: readonly AtyrauShellEdge[];
  readonly deckHalfWidths: readonly number[];
}

interface PathMeasure {
  readonly lengths: readonly number[];
  readonly total: number;
}

function footbridge(): AstanaWay {
  const way = astanaWays.find((entry) => entry.id === "bridge-footbridge");
  if (!way) throw new Error("Atyrau bridge way is missing");
  return way;
}

function measurePath(points: readonly PlanPoint[]): PathMeasure {
  const lengths: number[] = [0];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(lengths[index - 1] + Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    ));
  }
  return { lengths, total: lengths[lengths.length - 1] };
}

function pointAtDistance(
  points: readonly PlanPoint[],
  measure: PathMeasure,
  requestedDistance: number,
): PlanPoint {
  const distance = Math.max(0, Math.min(measure.total, requestedDistance));
  let segment = 1;
  while (segment < measure.lengths.length - 1 && measure.lengths[segment] < distance) {
    segment += 1;
  }
  const start = measure.lengths[segment - 1];
  const span = measure.lengths[segment] - start || 1;
  const t = (distance - start) / span;
  return [
    points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * t,
    points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * t,
  ];
}

function stationAtDistance(
  points: readonly PlanPoint[],
  measure: PathMeasure,
  distance: number,
): AtyrauPathStation {
  const point = pointAtDistance(points, measure, distance);
  const before = pointAtDistance(points, measure, distance - 0.35);
  const after = pointAtDistance(points, measure, distance + 0.35);
  const dx = after[0] - before[0];
  const dz = after[1] - before[1];
  const length = Math.hypot(dx, dz) || 1;
  const tangent: PlanPoint = [dx / length, dz / length];
  return {
    distance,
    fraction: distance / measure.total,
    point,
    tangent,
    normal: [-tangent[1], tangent[0]],
  };
}

function bridgeDeckBase(way: AstanaWay): number {
  let top = -Infinity;
  for (const [x, z] of way.points) {
    const ground = groundUnder(x, z);
    if (ground.kind === "land") top = Math.max(top, ground.top);
  }
  return top > -Infinity ? top : 0.05;
}

function asymmetricHump(t: number, peak: number): number {
  if (t <= 0 || t >= 1) return 0;
  const local = t <= peak ? t / peak : (1 - t) / (1 - peak);
  return Math.sin(Math.PI * 0.5 * Math.max(0, Math.min(1, local))) ** 1.12;
}

function deckHump(t: number): number {
  return Math.sin(Math.PI * Math.max(0, Math.min(1, t))) ** 2;
}

function smoothstep(t: number): number {
  const value = Math.max(0, Math.min(1, t));
  return value * value * (3 - 2 * value);
}

function blendColour(from: string, to: string, amount: number): string {
  const channel = (value: string, offset: number): number =>
    Number.parseInt(value.slice(offset, offset + 2), 16);
  const blended = [1, 3, 5].map((offset) => Math.round(
    channel(from, offset) + (channel(to, offset) - channel(from, offset)) * amount,
  ));
  return `#${blended.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Белый конец смотрит к Хан Шатыру, серый — к внешнему кольцу ЛРТ. */
export function atyrauDeckColourAt(fraction: number): string {
  return blendColour(DECK_WHITE, DECK_GREY, smoothstep(fraction));
}

function nodeKey([side, station, level]: AtyrauNodeRef): string {
  return `${side}:${station}:${level}`;
}

function edge(
  kind: AtyrauShellEdge["kind"],
  id: string,
  from: AtyrauNodeRef,
  to: AtyrauNodeRef,
): AtyrauShellEdge {
  return { kind, id, from, to };
}

export function createAtyrauShellTopology(): AtyrauShellTopology {
  const way = footbridge();
  const measure = measurePath(way.points);
  const shellLength = Math.min(ATYRAU_SHELL_LENGTH, measure.total * 0.42);
  const shellStart = (measure.total - shellLength) / 2;
  const shellEnd = shellStart + shellLength;
  const deckTop = bridgeDeckBase(way) + ATYRAU_DECK_THICKNESS;
  const stations = Array.from({ length: ATYRAU_SHELL_STATIONS }, (_, station) =>
    stationAtDistance(
      way.points,
      measure,
      shellStart + shellLength * station / (ATYRAU_SHELL_STATIONS - 1),
    ));
  const deckHalfWidths = stations.map((_, station) => {
    const t = station / (ATYRAU_SHELL_STATIONS - 1);
    return ATYRAU_APPROACH_HALF_WIDTH
      + (ATYRAU_CENTRAL_HALF_WIDTH - ATYRAU_APPROACH_HALF_WIDTH) * deckHump(t);
  });

  const sideProfiles = ([0, 1] as const).map((sideIndex) => {
    const peakStation = sideIndex === 0 ? 7 : 8;
    const peakT = peakStation / (ATYRAU_SHELL_STATIONS - 1);
    const peakHeight = sideIndex === 0 ? 6.95 : 6.75;
    return stations.map((_, station) => {
      const t = station / (ATYRAU_SHELL_STATIONS - 1);
      const body = asymmetricHump(t, peakT);
      return {
        body,
        topHeight: ATYRAU_RAIL_HEIGHT + (peakHeight - ATYRAU_RAIL_HEIGHT) * body,
      };
    });
  });

  const nodes: AtyrauShellNode[][][] = [[], []];
  for (const sideIndex of [0, 1] as const) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let station = 0; station < ATYRAU_SHELL_STATIONS; station += 1) {
      const path = stations[station];
      const { body, topHeight } = sideProfiles[sideIndex][station];
      const baseAcross = deckHalfWidths[station] + 0.14;
      const stationNodes: AtyrauShellNode[] = [];
      for (let level = 0; level < ATYRAU_SHELL_LEVELS; level += 1) {
        const u = level / (ATYRAU_SHELL_LEVELS - 1);
        const inward = body
          * (baseAcross - ATYRAU_MIN_CROWN_HALF_GAP)
          * smoothstep(u);
        const outward = body * 0.52 * Math.sin(Math.PI * u) * (1 - u * 0.16);
        const across = side * (baseAcross + outward - inward);
        const height = 0.12 + (topHeight - 0.12) * Math.sin(u * Math.PI * 0.5);
        stationNodes.push({
          ref: [sideIndex, station, level],
          across,
          height,
          position: [
            path.point[0] + path.normal[0] * across,
            deckTop + height,
            path.point[1] + path.normal[1] * across,
          ],
        });
      }
      nodes[sideIndex].push(stationNodes);
    }
  }

  const edges: AtyrauShellEdge[] = [];
  for (const side of [0, 1] as const) {
    for (let station = 0; station < ATYRAU_SHELL_STATIONS; station += 1) {
      for (let level = 0; level < ATYRAU_SHELL_LEVELS - 1; level += 1) {
        edges.push(edge("meridian", `meridian:${side}:${station}:${level}`,
          [side, station, level], [side, station, level + 1]));
      }
    }
    for (let station = 0; station < ATYRAU_SHELL_STATIONS - 1; station += 1) {
      edges.push(edge("base", `base:${side}:${station}`,
        [side, station, 0], [side, station + 1, 0]));
      edges.push(edge("crown", `crown:${side}:${station}`,
        [side, station, ATYRAU_SHELL_LEVELS - 1],
        [side, station + 1, ATYRAU_SHELL_LEVELS - 1]));
      // На соседних меридианах активные узлы сдвинуты на один уровень.
      // Поэтому диагонали встречаются только в узлах, а не крестятся в поле.
      for (let level = 0; level < ATYRAU_SHELL_LEVELS; level += 1) {
        if ((station + level) % 2 !== 0) continue;
        for (const delta of [-1, 1] as const) {
          const nextLevel = level + delta;
          if (nextLevel < 0 || nextLevel >= ATYRAU_SHELL_LEVELS) continue;
          edges.push(edge("diagonal", `diagonal:${side}:${station}:${level}:${delta}`,
            [side, station, level], [side, station + 1, nextLevel]));
        }
      }
    }
  }

  // Две оболочки не нахлёстываются. В высокой центральной части их края
  // соединяют отдельные стяжки; их длина меняется вместе с живым зазором
  // между двумя несимметричными оболочками и к концам они прекращаются.
  for (let station = 0; station < ATYRAU_SHELL_STATIONS; station += 1) {
    const pairedBody = Math.min(
      sideProfiles[0][station].body,
      sideProfiles[1][station].body,
    );
    if (pairedBody < 0.58) continue;
    edges.push(edge("roof-tie", `roof-tie:${station}`,
      [0, station, ATYRAU_SHELL_LEVELS - 1],
      [1, station, ATYRAU_SHELL_LEVELS - 1]));
  }

  return {
    deckTop,
    pathLength: measure.total,
    shellStart,
    shellEnd,
    stations,
    nodes,
    edges,
    deckHalfWidths,
  };
}

function subtract(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: SceneVector3, factor: number): SceneVector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function midpoint(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return scale(add(a, b), 0.5);
}

function lengthOf(vector: SceneVector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: SceneVector3): SceneVector3 {
  const length = lengthOf(vector) || 1;
  return scale(vector, 1 / length);
}

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function nodeAt(topology: AtyrauShellTopology, ref: AtyrauNodeRef): AtyrauShellNode {
  return topology.nodes[ref[0]][ref[1]][ref[2]];
}

function addFrameBeam(
  target: MutableGroup,
  id: string,
  from: SceneVector3,
  to: SceneVector3,
  diameter: number,
  colour: string,
): void {
  const chord = subtract(to, from);
  const length = lengthOf(chord);
  if (length < 0.02) return;
  const axis = normalize(chord);
  const helper: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  // `orient` сохраняет направление локальной Y только если локальная X
  // строго ортогональна ребру. Случайный мировой reference разворачивал
  // цилиндры мимо их вычисленных концов и создавал видимые «иголки».
  const transverse = normalize(cross(helper, axis));
  primitive(target, id, "steel", "cylinder", midpoint(from, to),
    [diameter, length, diameter], colour,
    {
      rotation: orient(transverse, axis),
      textureProfile: "painted-steel",
      bearingArea: 0.16,
      volume: Math.max(0.004, length * diameter * diameter * 0.55),
      contactBearingOrder: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.34,
    });
}

function surfaceNormalAt(
  topology: AtyrauShellTopology,
  ref: AtyrauNodeRef,
): SceneVector3 {
  const [side, station, level] = ref;
  const beforeStation = Math.max(0, station - 1);
  const afterStation = Math.min(ATYRAU_SHELL_STATIONS - 1, station + 1);
  const beforeLevel = Math.max(0, level - 1);
  const afterLevel = Math.min(ATYRAU_SHELL_LEVELS - 1, level + 1);
  const longitudinal = subtract(
    topology.nodes[side][afterStation][level].position,
    topology.nodes[side][beforeStation][level].position,
  );
  const meridional = subtract(
    topology.nodes[side][station][afterLevel].position,
    topology.nodes[side][station][beforeLevel].position,
  );
  return normalize(cross(longitudinal, meridional));
}

function petalWidthDirection(
  topology: AtyrauShellTopology,
  edgeDefinition: AtyrauShellEdge,
): SceneVector3 {
  const fromNode = nodeAt(topology, edgeDefinition.from);
  const toNode = nodeAt(topology, edgeDefinition.to);
  const chord = normalize(subtract(toNode.position, fromNode.position));
  const fromNormal = surfaceNormalAt(topology, edgeDefinition.from);
  let toNormal = surfaceNormalAt(topology, edgeDefinition.to);
  if (dot(fromNormal, toNormal) < 0) toNormal = scale(toNormal, -1);
  const normal = normalize(add(fromNormal, toNormal));
  const inSurface = cross(normal, chord);
  if (lengthOf(inSurface) > 0.02) return normalize(inSurface);
  const fallback = cross(chord, [0, 1, 0]);
  return normalize(lengthOf(fallback) > 0.02 ? fallback : [1, 0, 0]);
}

function addAluminiumPetal(
  target: MutableGroup,
  id: string,
  from: SceneVector3,
  to: SceneVector3,
  widthDirection: SceneVector3,
  colour: string,
): void {
  const chord = subtract(to, from);
  const length = lengthOf(chord);
  if (length < 0.12) return;
  // Реальная кассета — цельный заострённый шестигранный лепесток. У неё свой
  // визуальный примитив: физика остаётся компактным габаритом, но на фасаде
  // больше нет ступеней и разрывов от прямоугольной аппроксимации.
  const petalLength = Math.max(0.08, length - 0.04);
  const fullWidth = Math.min(0.56, Math.max(0.28, length * 0.36));
  const centre = midpoint(from, to);
  primitive(target, `${id}:part:0`, "steel", "hexagonalSheet",
    centre, [fullWidth, petalLength, 0.018], colour,
    {
      rotation: orient(widthDirection, chord),
      textureProfile: "painted-steel",
      bearsLoad: false,
      volume: Math.max(0.002, fullWidth * petalLength * 0.0072),
      sideAttachmentReach: 0.32,
    });
}

function deckHalfWidthAt(
  topology: AtyrauShellTopology,
  distance: number,
): number {
  if (distance <= topology.shellStart || distance >= topology.shellEnd) {
    return ATYRAU_APPROACH_HALF_WIDTH;
  }
  const t = (distance - topology.shellStart) / (topology.shellEnd - topology.shellStart);
  return ATYRAU_APPROACH_HALF_WIDTH
    + (ATYRAU_CENTRAL_HALF_WIDTH - ATYRAU_APPROACH_HALF_WIDTH) * deckHump(t);
}

function createDeckAndRailings(
  roads: MutableGroup,
  frame: MutableGroup,
  topology: AtyrauShellTopology,
): void {
  const way = footbridge();
  const measure = measurePath(way.points);
  const segments = Math.ceil(measure.total / ATYRAU_FACADE_MODULE);
  const samples = Array.from({ length: segments + 1 }, (_, index) =>
    stationAtDistance(way.points, measure, measure.total * index / segments));
  const top = topology.deckTop;

  for (let index = 0; index < segments; index += 1) {
    const from = samples[index];
    const to = samples[index + 1];
    const dx = to.point[0] - from.point[0];
    const dz = to.point[1] - from.point[1];
    const length = Math.hypot(dx, dz);
    const distance = (from.distance + to.distance) / 2;
    const halfWidth = deckHalfWidthAt(topology, distance);
    const yaw = Math.atan2(-dz, dx);
    const centre: SceneVector3 = [
      (from.point[0] + to.point[0]) / 2,
      top + 0.012,
      (from.point[1] + to.point[1]) / 2,
    ];
    primitive(roads, `atyrau:deck-finish:${index}`, "stone", "panel",
      centre, [length, 0.024, halfWidth * 2],
      atyrauDeckColourAt(distance / measure.total),
      {
        rotation: [0, yaw, 0],
        textureProfile: "city-gray-pavers",
        bearingArea: length * halfWidth * 2,
        volume: length * halfWidth * 0.03,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.42,
      });

    const normal: PlanPoint = [-dz / (length || 1), dx / (length || 1)];
    const bikeOffset = -1.72;
    primitive(roads, `atyrau:bike-lane:${index}`, "asphalt", "panel",
      [centre[0] + normal[0] * bikeOffset, top + 0.029,
        centre[2] + normal[1] * bikeOffset],
      [length * 0.98, 0.012, 1.55], BIKE_RED,
      { rotation: [0, yaw, 0], bearsLoad: false, volume: length * 0.015 });

    // Непрерывная светлая полоса сама не светится. Она ловит скрытый тёплый
    // свет снизу и превращает ряд математических point lights в ровную
    // отражённую линию без видимых снаружи ярких точек.
    for (const side of [-1, 1] as const) {
      const reflectorOffset = halfWidth - 0.42;
      primitive(frame, `atyrau:lighting:reflector:${side}:${index}`,
        "steel", "panel",
        [
          centre[0] + normal[0] * reflectorOffset * side,
          top + 0.18,
          centre[2] + normal[1] * reflectorOffset * side,
        ],
        [length * 1.012, 0.075, 0.26], LIGHT_REFLECTOR,
        {
          rotation: [0, yaw, 0],
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          volume: length * 0.012,
          sideAttachmentReach: 0.28,
        });
    }

    for (const side of [-1, 1] as const) {
      // Сплошная подходная ограда заходит под последние модули оболочки:
      // поэтому рисунок не заканчивается вертикальным срезом, а растворяется
      // в низком ограждении, как на построенном мосту.
      const solidApproach = distance < topology.shellStart + 2.8
        || distance > topology.shellEnd - 2.8;
      const fromDeckHalf = deckHalfWidthAt(topology, from.distance);
      const toDeckHalf = deckHalfWidthAt(topology, to.distance);
      const fromHalf = fromDeckHalf + (solidApproach ? 0.10 : -0.25);
      const toHalf = toDeckHalf + (solidApproach ? 0.10 : -0.25);
      const railFrom: SceneVector3 = [
        from.point[0] + from.normal[0] * fromHalf * side,
        top + 1.12,
        from.point[1] + from.normal[1] * fromHalf * side,
      ];
      const railTo: SceneVector3 = [
        to.point[0] + to.normal[0] * toHalf * side,
        top + 1.12,
        to.point[1] + to.normal[1] * toHalf * side,
      ];
      addFrameBeam(frame, `atyrau:railing:top:${side}:${index}`,
        railFrom, railTo, 0.075, FRAME_SHADE);
      if (solidApproach) {
        const panelRise = 0.86;
        const panelOutward = 0.20;
        const fromCentreOffset = fromDeckHalf - 0.12 + panelOutward / 2;
        const toCentreOffset = toDeckHalf - 0.12 + panelOutward / 2;
        const averageNormal: SceneVector3 = normalize([
          (from.normal[0] + to.normal[0]) * side,
          0,
          (from.normal[1] + to.normal[1]) * side,
        ]);
        const slopedUp = normalize([
          averageNormal[0] * panelOutward,
          panelRise,
          averageNormal[2] * panelOutward,
        ]);
        primitive(frame, `atyrau:railing:solid:${side}:${index}`,
          "steel", "steelSheet",
          [
            (from.point[0] + from.normal[0] * fromCentreOffset * side
              + to.point[0] + to.normal[0] * toCentreOffset * side) / 2,
            top + 0.12 + panelRise / 2,
            (from.point[1] + from.normal[1] * fromCentreOffset * side
              + to.point[1] + to.normal[1] * toCentreOffset * side) / 2,
          ],
          [length * 1.015, Math.hypot(panelRise, panelOutward), 0.045],
          ALUMINIUM_SILVER,
          {
            rotation: orient([dx, 0, dz], slopedUp),
            textureProfile: "painted-steel",
            bearingArea: 0.15,
            volume: length * 0.035,
            sideAttachmentReach: 0.30,
          });
        addFrameBeam(frame, `atyrau:railing:base:${side}:${index}`,
          [
            from.point[0] + from.normal[0] * (fromDeckHalf - 0.12) * side,
            top + 0.12,
            from.point[1] + from.normal[1] * (fromDeckHalf - 0.12) * side,
          ],
          [
            to.point[0] + to.normal[0] * (toDeckHalf - 0.12) * side,
            top + 0.12,
            to.point[1] + to.normal[1] * (toDeckHalf - 0.12) * side,
          ], 0.065, FRAME_SHADE);
      } else {
        addFrameBeam(frame, `atyrau:railing:mid:${side}:${index}`,
          [railFrom[0], top + 0.62, railFrom[2]],
          [railTo[0], top + 0.62, railTo[2]], 0.052, FRAME_SHADE);
        if (index % 2 === 0) {
          addFrameBeam(frame, `atyrau:railing:post:${side}:${index}`,
            [railFrom[0], top + 0.08, railFrom[2]], railFrom, 0.062, FRAME_SHADE);
        }
      }
    }
  }
}

function createPiers(roads: MutableGroup, topology: AtyrauShellTopology): void {
  const way = footbridge();
  const measure = measurePath(way.points);
  const deckBase = topology.deckTop - ATYRAU_DECK_THICKNESS;
  for (const fraction of [0.25, 0.5, 0.75]) {
    const station = stationAtDistance(way.points, measure, measure.total * fraction);
    const ground = groundUnder(station.point[0], station.point[1]);
    const height = deckBase - ground.top;
    if (height <= 0.2) continue;
    const halfWidth = deckHalfWidthAt(topology, station.distance);
    const yaw = Math.atan2(-station.tangent[1], station.tangent[0]);
    primitive(roads, `atyrau:pier:${fraction}`, "concrete", "cylinder",
      [station.point[0], ground.top + height / 2, station.point[1]],
      [2.15, height, 2.15], CONCRETE,
      { bearingArea: 4.2, volume: height * 1.9 });
    primitive(roads, `atyrau:cap:${fraction}`, "concrete", "stoneBlock",
      [station.point[0], deckBase - 0.18, station.point[1]],
      [halfWidth * 2 + 0.7, 0.42, 1.55], CONCRETE,
      { rotation: [0, yaw + Math.PI / 2, 0], bearingArea: 5, volume: 2.2 });
  }
}

function createArchitecturalLighting(
  frame: MutableGroup,
  topology: AtyrauShellTopology,
): void {
  const way = footbridge();
  const measure = measurePath(way.points);
  // Четыре позиции попадают внутрь оболочки, ещё две продолжают золотую
  // линию на подходах. По две стороны дают ровно двенадцать источников —
  // полный атомарный набор штатного пула света без случайного мерцания.
  const fractions = [0.18, 0.34, 0.44, 0.56, 0.66, 0.82] as const;
  for (let stationIndex = 0; stationIndex < fractions.length; stationIndex += 1) {
    const station = stationAtDistance(
      way.points,
      measure,
      measure.total * fractions[stationIndex],
    );
    const halfWidth = deckHalfWidthAt(topology, station.distance);
    const yaw = Math.atan2(-station.tangent[1], station.tangent[0]);
    for (const side of [-1, 1] as const) {
      // Источник отнесён внутрь от отражающей кромки. Иначе даже невидимый
      // point light выдаёт своё положение узким зеркальным бликом с улицы.
      const offset = (halfWidth - 1.15) * side;
      // Тёмный корпус утоплен ниже внутреннего пояса. Сам источник света
      // смещён вверх относительно него и не имеет светящейся геометрии.
      primitive(frame, `atyrau:lighting:hidden-fixture:${side}:${stationIndex}`,
        "steel", "panel",
        [
          station.point[0] + station.normal[0] * offset,
          topology.deckTop - 0.08,
          station.point[1] + station.normal[1] * offset,
        ],
        [0.86, 0.06, 0.38], LIGHT_BAFFLE,
        {
          rotation: [0, yaw, 0],
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          volume: 0.018,
          sideAttachmentReach: 0.34,
          light: {
            color: ATYRAU_LIGHT_COLOR,
            distance: 15,
            intensity: 4.2,
            position: [0, 0.62, 0],
            dayIntensityFactor: 0,
            poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
            localPoolCapacity: ATYRAU_LIGHT_COUNT,
            poolGroupId: ATYRAU_LIGHT_GROUP,
            transition: ATYRAU_LIGHT_TRANSITION,
          },
        });
    }
  }
}

export function createAtyrauBridge(
  roads: MutableGroup,
  frame: MutableGroup,
): void {
  const topology = createAtyrauShellTopology();
  createDeckAndRailings(roads, frame, topology);
  createPiers(roads, topology);
  createArchitecturalLighting(frame, topology);

  for (const side of [0, 1] as const) {
    for (let station = 0; station < ATYRAU_SHELL_STATIONS; station += 1) {
      const foot = topology.nodes[side][station][0];
      primitive(frame, `atyrau:anchor:${side}:${station}`, "steel", "steelSheet",
        [foot.position[0], topology.deckTop + 0.055, foot.position[2]],
        [0.34, 0.11, 0.34], FRAME_SHADE,
        {
          textureProfile: "painted-steel",
          bearingArea: 0.12,
          volume: 0.01,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.38,
        });
    }
  }

  for (const definition of topology.edges) {
    const from = nodeAt(topology, definition.from).position;
    const to = nodeAt(topology, definition.to).position;
    const diameter = definition.kind === "meridian" ? 0.082
      : definition.kind === "diagonal" ? 0.042 : 0.075;
    const colour = definition.kind === "diagonal"
      ? FRAME_SHADE
      : ATYRAU_FRAME_WHITE;
    addFrameBeam(frame, `atyrau:frame:${definition.id}`, from, to, diameter, colour);

    if (definition.kind !== "diagonal" && definition.kind !== "meridian") continue;
    const widthDirection = petalWidthDirection(topology, definition);
    const colourIndex = definition.from[1] + definition.from[2] + definition.from[0];
    addAluminiumPetal(frame, `atyrau:aluminium-petal:${definition.id}`,
      from, to, widthDirection,
      colourIndex % 3 === 0 ? ALUMINIUM_SILVER : ALUMINIUM_WHITE);
  }
}

export function atyrauNodeId(ref: AtyrauNodeRef): string {
  return nodeKey(ref);
}
