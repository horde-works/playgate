"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
} from "three";
import {
  createVillagerPopulation,
  describeVillager,
  emitNoise,
  pickVillager,
  stepVillagers,
  storePieceVisibility,
  type VillagerPopulation,
  type VillagerReport,
} from "./villagerSim.ts";
import { alertPose, type NoiseEvent } from "./villagerAlarm.ts";
import { buildObstacleField, type NavPiece } from "./villagerNavigation.ts";
import type { SettlementPlan } from "./settlementPlan.ts";

/**
 * Жители деревни: тела из тех же коробок, что и всё вокруг, шагающие по
 * авторским тропам.
 *
 * Рендер — один инстансированный меш на всю деревню. Скелет анимируется в
 * вершинном шейдере: у каждой вершины записаны два шарнира (бедро+колено,
 * плечо+локоть) и признак конечности, поэтому «скиннинг» сводится к двум
 * поворотам вокруг точек. Материал — обычный MeshStandardMaterial с
 * инъекцией: жители бесплатно получают свет дня и ночи, туман и тени вместо
 * отдельного мира со своими правилами освещения.
 *
 * Главная деталь ремесла — фаза шага приходит из ПРОЙДЕННОГО ПУТИ, а размах
 * ноги выведен аналитически из длины шага (asin(S / 2L)). Поэтому стопа
 * стоит на земле, пока на неё опираются: без этого фигурки «едут по льду»,
 * и никакая проработка меша этого не спасает.
 */

// Пропорции взрослого жителя в метрах, от земли.
const HIP_Y = 0.86;
const KNEE_Y = 0.44;
const ANKLE_Y = 0.1;
const SHOULDER_Y = 1.36;
const ELBOW_Y = 1.1;
const WRIST_Y = 0.86;
const HIP_HALF_WIDTH = 0.105;
/** Бедро → пятка: из этой длины считается размах шага без скольжения. */
const LEG_REACH = HIP_Y - ANKLE_Y * 0.4;

const SKIN = new Color("#a87c58");
const HAIR = new Color("#43301f");
const LEATHER = new Color("#4b3a2a");
const CLOTH = new Color("#ffffff");

type PartKind =
  | "body"
  | "head"
  | "legThigh"
  | "legShin"
  | "armUpper"
  | "armFore"
  | "bundle"
  | "tool"
  | "spade"
  | "foot";

const PART_KIND_ID: Record<PartKind, number> = {
  body: 0,
  legThigh: 1,
  legShin: 2,
  armUpper: 3,
  armFore: 4,
  bundle: 5,
  head: 6,
  foot: 7,
  tool: 8,
  spade: 9,
};

interface BoxSpec {
  center: readonly [number, number, number];
  size: readonly [number, number, number];
  color: Color;
  /** 1 — крашеная ткань (принимает цвет туники жителя), 0 — кожа/волосы. */
  dye: number;
  kind: PartKind;
  /** -1 левая сторона, +1 правая, 0 по центру. */
  side: number;
  /** Дальний шарнир (колено/локоть); у цельных частей совпадает с pivotB. */
  pivotA: readonly [number, number, number];
  /** Ближний шарнир (бедро/плечо/шея). */
  pivotB: readonly [number, number, number];
}

function villagerBoxes(): BoxSpec[] {
  const boxes: BoxSpec[] = [];
  const hips: readonly [number, number, number] = [0, HIP_Y, 0];
  const neck: readonly [number, number, number] = [0, 1.42, 0];

  boxes.push(
    // Плечи шире пояса: без этого перепада фигура читается холодильником.
    { center: [0, 1.28, 0], size: [0.44, 0.22, 0.26], color: CLOTH, dye: 1, kind: "body", side: 0, pivotA: hips, pivotB: hips },
    { center: [0, 1.04, 0], size: [0.36, 0.32, 0.24], color: CLOTH, dye: 1, kind: "body", side: 0, pivotA: hips, pivotB: hips },
    { center: [0, 0.87, 0], size: [0.38, 0.09, 0.25], color: LEATHER, dye: 0, kind: "body", side: 0, pivotA: hips, pivotB: hips },
    { center: [0, 1.44, 0], size: [0.12, 0.1, 0.12], color: SKIN, dye: 0, kind: "head", side: 0, pivotA: neck, pivotB: neck },
    // Голова чуть крупнее анатомической: в такой стилизации точная пропорция
    // читается как «маленькая голова», а не как реализм.
    { center: [0, 1.6, 0.01], size: [0.27, 0.27, 0.26], color: SKIN, dye: 0, kind: "head", side: 0, pivotA: neck, pivotB: neck },
    { center: [0, 1.7, -0.03], size: [0.29, 0.15, 0.24], color: HAIR, dye: 0, kind: "head", side: 0, pivotA: neck, pivotB: neck },
  );

  for (const side of [-1, 1] as const) {
    // Ширина шага у человека мала: стопы ставятся почти под таз, а не по
    // ширине плеч. Поэтому нога слегка сходится внутрь от бедра к пятке.
    const hipX = side * HIP_HALF_WIDTH;
    const kneeX = side * 0.088;
    const ankleX = side * 0.072;
    const hip: readonly [number, number, number] = [hipX, HIP_Y, 0];
    const knee: readonly [number, number, number] = [kneeX, KNEE_Y, 0];
    const ankle: readonly [number, number, number] = [ankleX, ANKLE_Y, 0];
    boxes.push(
      { center: [(hipX + kneeX) / 2, (HIP_Y + KNEE_Y) / 2, 0], size: [0.16, HIP_Y - KNEE_Y, 0.17], color: CLOTH, dye: 1, kind: "legThigh", side, pivotA: hip, pivotB: hip },
      { center: [(kneeX + ankleX) / 2, (KNEE_Y + ANKLE_Y) / 2, 0], size: [0.14, KNEE_Y - ANKLE_Y, 0.15], color: LEATHER, dye: 0, kind: "legShin", side, pivotA: knee, pivotB: hip },
      // Стопа — третье звено: у неё свой шарнир, иначе не будет ни удара
      // пяткой, ни толчка носком.
      { center: [ankleX, ANKLE_Y / 2, 0.05], size: [0.15, ANKLE_Y, 0.26], color: LEATHER, dye: 0, kind: "foot", side, pivotA: ankle, pivotB: knee },
    );

    // Руки вынесены за габарит торса, иначе они тонут в силуэте и мах не виден.
    const shoulderX = side * 0.255;
    const shoulder: readonly [number, number, number] = [shoulderX, SHOULDER_Y, 0];
    const elbow: readonly [number, number, number] = [shoulderX, ELBOW_Y, 0];
    boxes.push(
      { center: [shoulderX, (SHOULDER_Y + ELBOW_Y) / 2, 0], size: [0.13, SHOULDER_Y - ELBOW_Y, 0.14], color: CLOTH, dye: 1, kind: "armUpper", side, pivotA: shoulder, pivotB: shoulder },
      { center: [shoulderX, (ELBOW_Y + WRIST_Y) / 2, 0.01], size: [0.12, ELBOW_Y - WRIST_Y, 0.13], color: SKIN, dye: 0, kind: "armFore", side, pivotA: elbow, pivotB: shoulder },
    );
  }

  // ТОПОР. Инструмент — не декорация в кадре: он висит на тех же шарнирах,
  // что и предплечье, поэтому следует за руками в замахе и в ударе. Держат
  // двумя руками, значит ось у него по центру тела, а не у одного плеча.
  const toolShoulder: readonly [number, number, number] = [0, SHOULDER_Y, 0];
  const toolElbow: readonly [number, number, number] = [0, ELBOW_Y, 0];
  boxes.push(
    {
      center: [0, 0.6, 0.2],
      size: [0.07, 0.78, 0.07],
      color: new Color("#8a6743"),
      dye: 0,
      kind: "tool",
      side: 0,
      pivotA: toolElbow,
      pivotB: toolShoulder,
    },
    {
      center: [0, 0.24, 0.22],
      size: [0.24, 0.17, 0.06],
      color: new Color("#4a5050"),
      dye: 0,
      kind: "tool",
      side: 0,
      pivotA: toolElbow,
      pivotB: toolShoulder,
    },
  );

  // ЛОПАТА (и мотыга): черенок в руках, полотно внизу-впереди. Тот же подвес,
  // что у топора, — инструмент продолжает руку, а не висит в воздухе.
  boxes.push(
    {
      center: [0, 0.52, 0.26],
      size: [0.06, 0.94, 0.06],
      color: new Color("#9a7048"),
      dye: 0,
      kind: "spade",
      side: 0,
      pivotA: toolElbow,
      pivotB: toolShoulder,
    },
    {
      center: [0, 0.1, 0.3],
      size: [0.2, 0.26, 0.04],
      color: new Color("#4a5050"),
      dye: 0,
      kind: "spade",
      side: 0,
      pivotA: toolElbow,
      pivotB: toolShoulder,
    },
  );

  // Ноша в руках — только у части жителей; у прочих схлопывается в точку.
  // Короб держат В РУКАХ, а не под ними. В позе переноски плечо уходит вперёд
  // на 0.95 рад, предплечье ещё на 0.8: кисти оказываются на высоте около
  // 1.25 м и вынесены на 0.45 м вперёд. Короб стоял на 1.0 / 0.32 — на четверть
  // метра ниже кистей и позади них, будто висел сам по себе.
  boxes.push({
    center: [0, 1.22, 0.41],
    size: [0.36, 0.28, 0.26],
    color: new Color("#6b5138"),
    dye: 0,
    kind: "bundle",
    side: 0,
    pivotA: [0, 1.22, 0.41],
    pivotB: [0, 1.22, 0.41],
  });

  return boxes;
}

// Грань куба: нормаль, «верх» и «право» в её плоскости.
const CUBE_FACES: readonly (readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
])[] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, -1]],
  [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[0, 1, 0], [0, 0, -1], [1, 0, 0]],
  [[0, -1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
  [[0, 0, -1], [0, 1, 0], [-1, 0, 0]],
];

const FACE_CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

function buildVillagerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const dyes: number[] = [];
  const flags: number[] = [];
  const pivotA: number[] = [];
  const pivotB: number[] = [];

  for (const box of villagerBoxes()) {
    const half = [box.size[0] / 2, box.size[1] / 2, box.size[2] / 2] as const;
    for (const [normal, up, right] of CUBE_FACES) {
      for (const [u, v] of FACE_CORNERS) {
        for (let axis = 0; axis < 3; axis += 1) {
          positions.push(
            box.center[axis] +
              normal[axis] * half[axis] +
              right[axis] * u * half[axis] +
              up[axis] * v * half[axis],
          );
          normals.push(normal[axis]);
        }
        colors.push(box.color.r, box.color.g, box.color.b);
        dyes.push(box.dye);
        flags.push(box.side, PART_KIND_ID[box.kind]);
        pivotA.push(box.pivotA[0], box.pivotA[1], box.pivotA[2]);
        pivotB.push(box.pivotB[0], box.pivotB[1], box.pivotB[2]);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aDye", new Float32BufferAttribute(dyes, 1));
  geometry.setAttribute("aFlags", new Float32BufferAttribute(flags, 2));
  geometry.setAttribute("aPivotA", new Float32BufferAttribute(pivotA, 3));
  geometry.setAttribute("aPivotB", new Float32BufferAttribute(pivotB, 3));
  return geometry;
}

const GAIT_DECLARATIONS = /* glsl */ `
  attribute float aDye;
  // ПОТОЛОК ВЕРШИННЫХ АТРИБУТОВ — 16 СЛОТОВ, и житель стоял на нём вплотную:
  // position, normal, uv, color, instanceMatrix (сразу ЧЕТЫРЕ слота) и семь
  // своих. Семнадцатый, отдельный aAlarm, не собрался вовсе: «Too many
  // attributes», и вся деревня пропадала с экрана. Поэтому личное состояние
  // человека живёт ОДНИМ вектором: слот считается за вектор, а не за число,
  // и vec4 стоит ровно столько же, сколько float.
  // x — затасканность одежды, y — амплитуда вздрога, z — его ход, w — запас.
  attribute vec4 aState;
  attribute vec2 aFlags;
  attribute vec3 aPivotA;
  attribute vec3 aPivotB;
  attribute vec4 aGait;
  attribute vec4 aDyeColor;
  attribute vec4 aClimb;

  mat3 gaitRotX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
  }
  mat3 gaitRotY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }
  // Колокол на кольце цикла: горб кривой сустава с оборачиванием через 0.
  float gaitBump(float t, float center, float width) {
    float d = abs(fract(t - center + 0.5) - 0.5);
    return exp(-(d * d) / (width * width));
  }

  // РУКА КАК ДВУЗВЕННИК. Позу работы задаёт положение КИСТЕЙ на предмете:
  // рукоять топора, рукоятка ворота, бельё на доске. Углы в плече и локте
  // выводятся из этого теоремой косинусов — та же формула, что в
  // villagerReach.ts, где она проверена прямой кинематикой (промах 3e-16 м).
  // forward — вперёд от плеча, down — вниз от плеча, метры.
  vec2 villagerArm(float forward, float down) {
    const float UPPER_ARM = 0.26;
    const float FOREARM = 0.24;
    const float ARM_REACH = 0.50;
    float raw = length(vec2(forward, down));
    float distance = min(raw, ARM_REACH - 0.004);
    float safe = max(distance, 0.02);
    float aim = atan(forward, down);
    float offset = acos(clamp(
      (UPPER_ARM * UPPER_ARM + safe * safe - FOREARM * FOREARM) / (2.0 * UPPER_ARM * safe),
      -1.0, 1.0));
    float interior = acos(clamp(
      (UPPER_ARM * UPPER_ARM + FOREARM * FOREARM - safe * safe) / (2.0 * UPPER_ARM * FOREARM),
      -1.0, 1.0));
    return vec2(aim - offset, 3.14159265 - interior);
  }
`;

// aGait = (фаза шага, доля движения 0..1, размах ноги, размах руки)
// aDyeColor = (цвет туники rgb, несёт ли ношу)
// Кривые суставов взяты по данным анализа походки, а не на глаз: цикл — 60%
// опоры и 40% переноса; бедро качается почти синусоидой с пиком сгибания в
// момент касания пяткой; колено даёт ДВА горба (малая волна принятия веса
// ~17° сразу после пятки и большой пик ~60° на переносе); голеностоп рисует
// M — шлепок стопы, тыльное сгибание над опорной стопой, толчок носком,
// подъём носка для зазора. Таз колеблется по вертикали дважды за цикл (выше
// всего в середине опоры) и переносится вбок на опорную ногу.
const GAIT_COMPUTE = /* glsl */ `
  float gPhase = aGait.x;
  float gMove = aGait.y;
  float gStride = aGait.z;
  float gArm = aGait.w;
  // В канале ноши: 0 — пусто, 1 — несёт, 1..2 — опускает на землю.
  float carryRaw = aDyeColor.w;
  float carryDrop = clamp(carryRaw - 1.0, 0.0, 1.0);
  float gCarry = step(0.5, carryRaw) * (1.0 - carryDrop * 0.75);
  float side = aFlags.x;
  float kind = aFlags.y;

  const float GAIT_TAU = 6.2831853;
  // Правая нога в противофазе левой; рука — в противофазе своей ноге.
  float legPhase = gPhase + (side > 0.0 ? 3.14159265 : 0.0);
  // t = 0 — касание пяткой (пик сгибания бедра), t = 0.6 — отрыв носка.
  float tLeg = fract((legPhase - 1.5707963) / GAIT_TAU);
  float tBody = fract((gPhase - 1.5707963) / GAIT_TAU);

  // Дыхание на месте, чтобы стоящий житель не выглядел манекеном.
  float idle = (1.0 - gMove) * sin(gPhase * 0.55) * 0.04;

  float hipFlex = (gStride * sin(legPhase) + 0.12) * gMove;
  float knee = (0.30 * gaitBump(tLeg, 0.16, 0.10)
              + 1.05 * gaitBump(tLeg, 0.73, 0.13)) * gMove;
  float ankle = (0.14 * gaitBump(tLeg, 0.05, 0.06)
               - 0.12 * gaitBump(tLeg, 0.42, 0.16)
               + 0.42 * gaitBump(tLeg, 0.60, 0.07)
               - 0.20 * gaitBump(tLeg, 0.82, 0.14)) * gMove;
  float armFlex = -gArm * sin(legPhase) * gMove + idle;
  float torsoPitch = 0.0;

  // --- Преодоление преграды: позы по механике движения, а не «проход» ---
  float climbKind = aClimb.x;
  float climbT = aClimb.y;
  float restTop = aClimb.z;
  // В .w упакованы признаки: 1 — сидит за столом, 2 — жительница, дальше
  // ЧЕТВЁРКАМИ — что в руках (1 топор, 2 бревно, 3 охапка дров, 4 ведро).
  // Отдельного атрибута не заводим, чтобы не трогать раскладку буферов.
  float flags = aClimb.w;
  float atTable = mod(flags, 2.0);
  float female = mod(floor(flags / 2.0), 2.0);
  float handKind = floor(flags / 4.0);
  // Поза «всем телом»: наклон вокруг таза и просадка таза вниз. Без них лечь
  // нельзя в принципе — поворачивать надо всю фигуру, а не отдельное звено.
  float bodyPitch = 0.0;
  float bodySink = 0.0;
  // Локоть: у ходьбы он ведётся махом, у работы — решателем руки.
  float elbowFlex = -1.0;
  if (climbKind > 0.5) {
    float isLead = side < 0.0 ? 1.0 : 0.0;
    if (climbKind < 1.5) {
      // ПЕРЕСТУПАНИЕ через бревно: ноги по очереди, колено высоко, руки
      // свободны и лишь балансируют. Обе стопы никогда не в воздухе разом.
      float tLead = clamp(climbT / 0.55, 0.0, 1.0);
      float tTrail = clamp((climbT - 0.45) / 0.55, 0.0, 1.0);
      float lift = isLead > 0.5 ? sin(3.14159265 * tLead) : sin(3.14159265 * tTrail);
      hipFlex = 1.15 * lift;
      knee = 1.45 * lift;
      ankle = -0.22 * lift;
      armFlex = (side < 0.0 ? -0.4 : 0.4) * lift;
      torsoPitch = 0.16 * sin(3.14159265 * climbT);
    } else if (climbKind < 2.5) {
      // ПЕРЕМАХ через преграду по пояс: опора рукой (плечо над кистью),
      // корпус вперёд, колени поджаты, ноги проносятся под собой.
      float support = smoothstep(0.08, 0.3, climbT) * (1.0 - smoothstep(0.6, 0.86, climbT));
      float tuck = sin(3.14159265 * clamp((climbT - 0.1) / 0.7, 0.0, 1.0));
      hipFlex = 1.05 * tuck;
      knee = 1.75 * tuck;
      ankle = 0.18 * tuck;
      // Правая — опорная: уходит вниз и назад, принимая вес.
      armFlex = side > 0.0 ? -1.5 * support : 0.6 * tuck;
      torsoPitch = 0.52 * sin(3.14159265 * climbT);
      // ПРИЗЕМЛЕНИЕ — не падение: тройное сгибание гасит удар, корпус идёт
      // вперёд, руки вперёд-вверх для равновесия.
      float land = smoothstep(0.76, 0.92, climbT) * (1.0 - smoothstep(0.94, 1.0, climbT));
      knee += 0.9 * land;
      hipFlex += 0.4 * land;
      ankle -= 0.3 * land;
      armFlex += 0.75 * land;
      torsoPitch += 0.22 * land;
    } else if (climbKind < 3.5) {
      // ЧЕРЕЗ БЕДРО — для преграды выше пояса, но ниже груди: обе руки на
      // край, таз подсаживается на него, ноги переносятся сидя, сход вниз.
      float sit = smoothstep(0.1, 0.4, climbT) * (1.0 - smoothstep(0.55, 0.86, climbT));
      float swing = smoothstep(0.34, 0.72, climbT) * (1.0 - smoothstep(0.8, 0.95, climbT));
      float down = smoothstep(0.8, 1.0, climbT);
      hipFlex = 1.35 * sit + 0.9 * swing + 0.3 * down;
      knee = 1.1 * sit + 1.5 * swing + 0.9 * down;
      ankle = 0.1 * sit - 0.28 * down;
      armFlex = -1.3 * sit + 0.5 * down;
      torsoPitch = 0.34 * sit + 0.12 * swing + 0.18 * down;
    } else if (climbKind < 4.5) {
      // ВЫХОД СИЛОЙ на преграду в рост: дотянуться, подтянуться, занести
      // колено на край, встать и сойти. Ведущая нога идёт первой.
      float reach = smoothstep(0.0, 0.2, climbT) * (1.0 - smoothstep(0.28, 0.5, climbT));
      float pull = smoothstep(0.16, 0.48, climbT) * (1.0 - smoothstep(0.56, 0.76, climbT));
      float kneeUp = smoothstep(0.42, 0.62, climbT) * (1.0 - smoothstep(0.7, 0.84, climbT));
      float stand = smoothstep(0.74, 0.9, climbT);
      float land = smoothstep(0.9, 1.0, climbT);
      armFlex = -2.05 * reach - 1.6 * pull + 0.45 * land;
      hipFlex = 0.5 * pull + 1.55 * kneeUp + 0.3 * land;
      knee = 0.85 * pull + 1.95 * kneeUp + 0.75 * land;
      ankle = -0.2 * kneeUp - 0.26 * land;
      torsoPitch = 0.62 * pull + 0.28 * kneeUp - 0.12 * stand + 0.2 * land;
      if (isLead < 0.5) {
        hipFlex *= 0.45;
        knee *= 0.55;
      }
    } else if (climbKind < 5.5) {
      // СИДИТ: таз опускается ровно на высоту сиденья, бедро и колено около
      // прямого угла, стопы на полу, корпус чуть вперёд, руки на коленях.
      float t = clamp(climbT, 0.0, 1.0);
      hipFlex = 1.52 * t;
      knee = 1.46 * t;
      ankle = 0.14 * t;
      armFlex = 0.52 * t;
      torsoPitch = 0.12 * t;
      bodySink = t * clamp(${HIP_Y.toFixed(2)} - restTop, 0.0, 0.62);
      if (atTable > 0.5) {
        // ЗА СТОЛ садятся иначе, чем на лавку у огня: подошёл, оперся руками
        // о сиденье, задвинул таз, подвинулся вперёд — и только тогда положил
        // руки на столешницу. Опора руками и есть главное отличие.
        float shuffle = sin(3.14159265 * clamp(t / 0.62, 0.0, 1.0));
        float settled = smoothstep(0.55, 1.0, t);
        armFlex = -1.05 * shuffle + 0.95 * settled;
        torsoPitch = 0.3 * shuffle + 0.14 * settled;
        hipFlex += 0.1 * shuffle;
      }
    } else if (climbKind < 6.5) {
      // ЛЕЖИТ: корпус уходит в горизонталь, ноги чуть согнуты, руки вдоль тела.
      float t = clamp(climbT, 0.0, 1.0);
      hipFlex = 0.16 * t;
      knee = 0.28 * t;
      ankle = -0.14 * t;
      armFlex = 0.08 * t;
      bodyPitch = -1.48 * t;
      bodySink = t * clamp(${HIP_Y.toFixed(2)} - restTop - 0.06, 0.0, 0.8);
    } else {
      // --- РАБОТА: позу задают КИСТИ, а не углы -------------------------
      //
      // Для каждого дела известно, где в этот миг находятся руки на предмете:
      // рукоять топора над головой и у колоды, рукоятка ворота на своей
      // окружности, бельё на наклонной доске, молот у уха и на наковальне.
      // Углы в плече и локте считает двузвенник (villagerArm), поэтому кисть
      // приходит НА ВЕЩЬ, а не «примерно туда». Высоты — от самих предметов:
      // колода 0.5, наковальня 0.95, ворот 1.02, доска над корытом 0.66.
      float t = climbT;
      // Куда идёт кисть: forward — вперёд от плеча, down — вниз от плеча.
      vec2 hand = vec2(0.30, 0.36);
      float lean = 0.0;
      float sink = 0.0;
      float squat = 0.0;
      // СТОЙКА И ВЕС. Работают всем телом: одна нога впереди, вес ходит с
      // ноги на ногу в такт движению. Без этого любое дело читается
      // «приседанием на месте» независимо от того, что делают руки.
      float stance = 0.0;
      float shift = 0.0;
      // Вторая рука: 0 — там же, где первая (двуручный хват), 1 — своя работа.
      float split = 0.0;
      vec2 other = vec2(0.0);

      if (climbKind > 14.5) {
        // ОТРЯХИВАЕТСЯ. Мелкие частые взмахи: одна кисть обхлопывает бедро и
        // подол, другая сбивает пыль с плеча — ВРОЗЬ, а не в такт, иначе
        // получается «хлопает в ладоши». Это единственное движение деревни,
        // где руки быстрее ног: ноги стоят.
        float beat = t * 6.28318;
        float low = 0.5 + 0.5 * sin(beat);
        float high = 0.5 + 0.5 * sin(beat + 2.1);
        hand = mix(vec2(0.22, 0.46), vec2(0.30, 0.30), low);
        split = 1.0;
        other = mix(vec2(0.16, 0.02), vec2(0.24, 0.14), high);
        lean = 0.12 + 0.04 * low;
        stance = 0.1;
        shift = 0.12 * (low - 0.5);
      } else if (climbKind < 7.5) {
        // КОЛКА. Верхняя рука начинает у головы топора и СЪЕЗЖАЕТ вниз к
        // нижней по мере падения — без этого скольжения удар теряет рычаг.
        // Пик скорости на 60–70% дуги, проводка идёт в колоду.
        float wind = smoothstep(0.0, 0.34, t) * (1.0 - smoothstep(0.36, 0.46, t));
        float fall = smoothstep(0.44, 0.62, t);
        float back = smoothstep(0.72, 1.0, t);
        // Кисти: от исходного положения у пояса вверх-назад за голову и вниз
        // по дуге до высоты колоды.
        vec2 ready = vec2(0.26, 0.34);
        vec2 top = vec2(-0.16, -0.34);
        vec2 hit = vec2(0.34, 0.44);
        hand = mix(mix(ready, top, wind), hit, fall);
        hand = mix(hand, ready, back);
        lean = 0.16 * wind + 0.46 * fall - 0.3 * back;
        squat = 0.10 + 0.28 * fall;
        // Ноги на ширине плеч, вес уходит назад на замахе и переносится
        // вперёд вместе с ударом.
        stance = 0.12;
        shift = -0.5 * wind + 0.8 * fall - 0.4 * back;
      } else if (climbKind < 8.5) {
        // УКЛАДКА: присед с прямой спиной, руки идут к земле и обратно.
        float down = smoothstep(0.0, 0.34, t) * (1.0 - smoothstep(0.62, 0.94, t));
        hand = mix(vec2(0.24, 0.30), vec2(0.30, 0.62), down);
        lean = 0.42 * down;
        squat = 1.15 * down;
        sink = 0.3 * down;
        stance = 0.22 * down;
        shift = 0.5 * down;
      } else if (climbKind < 9.5) {
        // СТИРКА И ТОЧИЛО: доска наклонена к работающему, бельё комкают в
        // руках и трут ВВЕРХ-ВНИЗ ПО НАКЛОННОЙ. Рабочий ход на себя дольше
        // холостого — по нему движение и узнаётся.
        float pull = smoothstep(0.0, 0.58, t) * (1.0 - smoothstep(0.58, 0.66, t));
        vec2 far = vec2(0.34, 0.46);
        vec2 near = vec2(0.16, 0.28);
        hand = mix(far, near, pull);
        lean = 0.48;
        // Выпад: одна нога впереди, вес ходит вперёд-назад в такт ходу рук.
        stance = 0.34;
        squat = 0.18;
        shift = 0.7 * pull - 0.35;
      } else if (climbKind < 10.5) {
        // ВОРОТ: кисть идёт ПО ОКРУЖНОСТИ рукоятки. Руки не синхронны —
        // одна ведёт, вторая догоняет на пол-оборота.
        float turn = t * 6.2831853;
        hand = vec2(0.30 + 0.15 * sin(turn), 0.34 + 0.15 * cos(turn));
        split = 1.0;
        float otherTurn = turn + 3.14159265;
        other = vec2(0.30 + 0.15 * sin(otherTurn), 0.34 + 0.15 * cos(otherTurn));
        lean = 0.2;
        squat = 0.08;
        stance = 0.18;
        shift = 0.35 * sin(turn);
      } else if (climbKind < 11.5) {
        // КОПКА: вход полотна, отрыв РАЗГИБАНИЕМ НОГ с прямой спиной,
        // перенос поворотом корпуса. Цикл 4 с — 15 движений в минуту.
        float bite = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.24, 0.44, t));
        float lift = smoothstep(0.36, 0.58, t) * (1.0 - smoothstep(0.62, 0.8, t));
        float toss = smoothstep(0.64, 0.82, t) * (1.0 - smoothstep(0.86, 1.0, t));
        hand = mix(vec2(0.28, 0.40), vec2(0.34, 0.60), bite);
        hand = mix(hand, vec2(0.30, 0.24), lift);
        hand = mix(hand, vec2(0.20, 0.06), toss);
        lean = 0.34 + 0.28 * bite - 0.2 * lift;
        squat = 0.3 + 0.5 * bite;
        // Копают с выпадом: передняя нога дожимает полотно, вес переходит на
        // заднюю при отрыве и уходит в сторону броска.
        stance = 0.4;
        shift = 0.9 * bite - 0.5 * lift - 0.3 * toss;
      } else if (climbKind < 12.5) {
        // РАЗВЕШИВАНИЕ: от корзины у ног до жерди над головой. Кисть уходит
        // ВЫШЕ ПЛЕЧА — это и есть признак движения.
        float down = smoothstep(0.0, 0.18, t) * (1.0 - smoothstep(0.22, 0.4, t));
        float up = smoothstep(0.4, 0.62, t) * (1.0 - smoothstep(0.8, 1.0, t));
        hand = mix(vec2(0.26, 0.34), vec2(0.28, 0.62), down);
        hand = mix(hand, vec2(0.16, -0.44), up);
        lean = 0.4 * down - 0.12 * up;
        squat = 0.9 * down;
        stance = 0.16;
        shift = 0.6 * down - 0.4 * up;
        ankle = -0.26 * up;
      } else {
        // КОВКА: молот поднимают РОВНО ДО УХА и роняют на наковальню; вторая
        // рука держит заготовку клещами и почти неподвижна. Корпус стоит.
        float wind = smoothstep(0.0, 0.34, t) * (1.0 - smoothstep(0.36, 0.44, t));
        float hit = smoothstep(0.4, 0.56, t);
        float back = smoothstep(0.66, 1.0, t);
        vec2 ready = vec2(0.28, 0.18);
        vec2 ear = vec2(0.06, -0.22);
        vec2 anvil = vec2(0.34, 0.30);
        hand = mix(mix(ready, ear, wind), anvil, hit);
        hand = mix(hand, ready, back);
        split = 1.0;
        other = vec2(0.30, 0.34);
        lean = 0.18 + 0.06 * hit;
        stance = 0.2;
        shift = -0.25 * wind + 0.35 * hit;
      }

      // Наклон корпуса ПРИБЛИЖАЕТ плечо к вещи: без этого рука не достаёт до
      // низкой работы и повисает в воздухе.
      float shoulderDrop = (1.0 - cos(lean)) * 0.5;
      float shoulderForward = sin(lean) * 0.5;
      // Правая рука — рабочая (левшей в деревне нет): она машет молотом и
      // ведёт по кругу ворот, левая держит заготовку или догоняет на пол-
      // оборота. Инструмент (side = 0) следует за РАБОЧЕЙ рукой; раньше он
      // цеплялся за придерживающую, отчего в левой руке болталось невнятное.
      vec2 target = mix(hand, other, split * (1.0 - step(0.0, side)));
      vec2 solved = villagerArm(
        max(0.02, target.x - shoulderForward),
        target.y - shoulderDrop
      );
      armFlex = solved.x;
      elbowFlex = solved.y;
      torsoPitch = lean;
      // Передняя нога выносится вперёд, задняя остаётся сзади; перенос веса
      // догружает то одну, то другую — колено загруженной сгибается сильнее.
      float leadLeg = isLead * 2.0 - 1.0;
      float load = clamp(0.5 + shift * 0.5 * leadLeg, 0.0, 1.0);
      hipFlex = squat * 0.62 + stance * leadLeg;
      knee = squat * 0.86 + stance * 0.5 + load * 0.22;
      ankle += stance * 0.12 * leadLeg;
      bodySink = sink + squat * 0.12 + load * 0.03;
    }
  }

  // ЖЕНСКАЯ ПОХОДКА отличается не «поменьше», а по существу: короче шаг при
  // более частом каденсе, заметно больше разворот таза и вдвое меньше мах
  // плечами. Каденс приходит из шага (фаза растёт от пути), остальное — здесь.
  if (female > 0.5) {
    armFlex *= 0.62;
    hipFlex *= 1.06;
  }

  mat3 gRotA = mat3(1.0);
  mat3 gRotB = mat3(1.0);
  vec3 gaitPos = position;

  // СИЛУЭТ. Плечи уже, бёдра шире, подол расширяется книзу от бедра к колену,
  // волосы длиннее по спине. Всё — сдвигом вершин, поэтому драв-колл прежний.
  if (female > 0.5) {
    if (kind == 0.0) {
      float shoulders = smoothstep(1.06, 1.3, position.y);
      float waist = 1.0 - smoothstep(0.78, 1.02, position.y);
      gaitPos.x *= mix(1.0, 0.9, shoulders) * mix(1.0, 1.14, waist);
      gaitPos.z *= mix(1.0, 0.94, shoulders);
    } else if (kind == 1.0 || kind == 2.0) {
      // Подол: чем ниже, тем шире, и книзу колокол не доходит до щиколоток.
      float hem = clamp((${HIP_Y.toFixed(2)} - position.y) / 0.5, 0.0, 1.0);
      float flare = 1.0 + hem * hem * 1.55;
      gaitPos.x = gaitPos.x * flare + sign(gaitPos.x) * hem * 0.03;
      gaitPos.z *= 1.0 + hem * hem * 1.25;
    } else if (kind == 6.0 && position.y > 1.6) {
      // Коса вдоль спины: затылочная коробка вытягивается вниз и назад.
      float back = clamp(-position.z * 6.0, 0.0, 1.0);
      gaitPos.y -= back * 0.3;
      gaitPos.z -= back * 0.05;
      gaitPos.x *= 1.0 + back * 0.06;
    }
  }

  if (kind == 1.0) {
    gRotB = gaitRotX(-hipFlex);
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
  } else if (kind == 2.0) {
    gRotA = gaitRotX(knee);
    gRotB = gaitRotX(-hipFlex);
    gaitPos = gRotA * (gaitPos - aPivotA) + aPivotA;
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
  } else if (kind == 7.0) {
    // Стопа — три звена: голеностоп, колено, бедро.
    vec3 hipPivot = vec3(side * ${HIP_HALF_WIDTH.toFixed(3)}, ${HIP_Y.toFixed(2)}, 0.0);
    mat3 rotAnkle = gaitRotX(ankle);
    gRotA = gaitRotX(knee);
    gRotB = gaitRotX(-hipFlex);
    gaitPos = rotAnkle * (gaitPos - aPivotA) + aPivotA;
    gaitPos = gRotA * (gaitPos - aPivotB) + aPivotB;
    gaitPos = gRotB * (gaitPos - hipPivot) + hipPivot;
    gRotA = gRotA * rotAnkle;
  } else if (kind == 3.0 || kind == 4.0) {
    // С ношей руки держат её впереди и почти не машут.
    float hold = step(0.5, carryRaw) * (1.0 - carryDrop);
    float shoulder = mix(armFlex, 0.95 + armFlex * 0.15, hold);
    gRotB = gaitRotX(-shoulder);
    if (kind == 4.0) {
      float swingElbow = mix(-0.32 - max(0.0, sin(legPhase)) * 0.28 * gMove, -0.8, hold);
      // Работа сгибает локоть по решению руки; ходьба — прежним махом.
      gRotA = gaitRotX(elbowFlex >= 0.0 ? -elbowFlex : swingElbow);
      gaitPos = gRotA * (gaitPos - aPivotA) + aPivotA;
    }
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
    // РУКА РАСТЁТ ИЗ КОРПУСА. Наклон считался вокруг таза только для торса, а
    // плечевые шарниры оставались на месте — руки висели там, где плеч уже
    // нет, и любое рабочее движение читалось «приседанием с маханием».
    // Теперь весь узел руки доворачивается вместе с корпусом.
    if (torsoPitch != 0.0) {
      vec3 hipPivot = vec3(0.0, ${HIP_Y.toFixed(2)}, 0.0);
      gRotB = gaitRotX(torsoPitch) * gRotB;
      gaitPos = gaitRotX(torsoPitch) * (gaitPos - hipPivot) + hipPivot;
    }
  } else if (kind == 8.0 || kind == 9.0) {
    // ИНСТРУМЕНТ. Те же два шарнира, что у предплечья: топор не «прилеплен к
    // кадру», он продолжает руку. Нет в руках — схлопывается в точку.
    gRotA = gaitRotX(elbowFlex >= 0.0 ? -elbowFlex : -0.55);
    gRotB = gaitRotX(-armFlex);
    gaitPos = gRotA * (gaitPos - aPivotA) + aPivotA;
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
    if (torsoPitch != 0.0) {
      vec3 toolHip = vec3(0.0, ${HIP_Y.toFixed(2)}, 0.0);
      gRotB = gaitRotX(torsoPitch) * gRotB;
      gaitPos = gaitRotX(torsoPitch) * (gaitPos - toolHip) + toolHip;
    }
    // Топор и молот — один подвес, разные пропорции: у молота рукоять короче,
    // а голова тяжелее и ближе к кистям.
    float isAxe = step(0.5, handKind) * (1.0 - step(1.5, handKind));
    float isHammer = step(4.5, handKind) * (1.0 - step(5.5, handKind));
    float isSpade = step(5.5, handKind) * (1.0 - step(6.5, handKind));
    vec3 heldShape = gaitPos - aPivotB;
    heldShape *= mix(vec3(1.0), vec3(1.0, 0.62, 1.0), isHammer);
    gaitPos = aPivotB + heldShape;
    // Рукоять и лопата — разные части: показываем ту, что сейчас в руках.
    float showTool = kind == 8.0 ? clamp(isAxe + isHammer, 0.0, 1.0) : isSpade;
    gaitPos = mix(aPivotB, gaitPos, showTool);
  } else if (kind == 0.0) {
    // Плечевой пояс доворачивается против таза и наклоняется при перелезании.
    gRotB = gaitRotY(sin(gPhase) * 0.07 * gMove) * gaitRotX(torsoPitch);
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
  } else if (kind == 6.0) {
    // Голова гасит доворот корпуса — взгляд держит направление.
    gRotB = gaitRotY(-sin(gPhase) * 0.05 * gMove) * gaitRotX(torsoPitch * 0.6);
    gaitPos = gRotB * (gaitPos - aPivotB) + aPivotB;
  }

  // Таз ниже всего в двойной опоре и выше всего в середине опоры.
  float bob = -0.024 * cos(2.0 * GAIT_TAU * tBody) * gMove;
  float sway = -0.018 * cos(GAIT_TAU * tBody) * gMove;
  if (kind == 1.0 || kind == 2.0 || kind == 7.0) {
    gaitPos.y += bob * 0.4;
    gaitPos.x += sway * 0.5;
  } else {
    gaitPos.y += bob;
    gaitPos.x += sway;
  }

  // Ноша есть не у всех: лишним она вырождается в точку. А тот, кто дошёл,
  // ОПУСКАЕТ короб перед собой на землю — и дальше идёт налегке.
  if (kind == 5.0) {
    // Ноша выглядит тем, что она есть: бревно — длинным поперёк тела, дрова —
    // охапкой, ведро — низким и узким. Один короб на все случаи читался
    // «ящиком» независимо от того, за чем человек ходил.
    vec3 hold = aPivotB;
    vec3 shaped = gaitPos - hold;
    float isLog = step(1.5, handKind) * (1.0 - step(2.5, handKind));
    float isWood = step(2.5, handKind) * (1.0 - step(3.5, handKind));
    float isPail = step(3.5, handKind);
    shaped *= mix(vec3(1.0), vec3(3.4, 0.5, 0.55), isLog);
    shaped *= mix(vec3(1.0), vec3(1.45, 0.72, 0.85), isWood);
    shaped *= mix(vec3(1.0), vec3(0.62, 0.92, 0.62), isPail);
    gaitPos = hold + shaped;
    gaitPos.y -= isPail * 0.16;
    gaitPos = mix(aPivotB, gaitPos, step(0.5, carryRaw));
    gaitPos.y -= carryDrop * 1.06;
    gaitPos.z += carryDrop * 0.16;
  }

  // Сесть и лечь — движения всего тела: сперва разворот вокруг таза, потом
  // просадка на высоту сиденья или лежанки.
  if (bodyPitch != 0.0) {
    vec3 restPivot = vec3(0.0, ${HIP_Y.toFixed(2)}, 0.0);
    gaitPos = gaitRotX(bodyPitch) * (gaitPos - restPivot) + restPivot;
  }
  gaitPos.y -= bodySink;

  // ВЗДРОГ. Испуг — МОДИФИКАТОР, а не поза: сидящий вздрагивает сидя, несущий
  // бревно — с бревном, кузнец — на замахе. Поэтому он ложится последним
  // поверх уже посчитанной позы и ничего в ней не заменяет; иначе пришлось бы
  // писать испуганную версию каждой из четырнадцати поз.
  //
  // Форма: быстрый подъём и более долгий спад, пик на ~85 мс после начала
  // движения. Ровный колокол читается приседанием, а не рефлексом.
  //
  // Ног вздрог НЕ КАСАЕТСЯ. Голени и стопы стоят там, где стояли: опора — это
  // то единственное, что нельзя трогать ради выразительности, иначе фигура
  // просядет сквозь грунт и вся походка развалится. Настоящий рефлекс и есть
  // работа плечевого пояса и шеи: плечи вверх, голова в них, локти к телу.
  float alarmT = aState.z;
  float alarmEnv = aState.y
    * (alarmT > 0.0 && alarmT < 1.0 ? sin(3.14159265 * pow(alarmT, 0.42)) : 0.0);
  if (alarmEnv > 0.0) {
    // ПРИСЕД ВСЕМ ТЕЛОМ. Просадка убывает вниз по ноге и обнуляется на стопе:
    // так суставы нигде не расходятся, а опора остаётся на месте. Первая
    // версия двигала одну голову на честные пять сантиметров — анатомически
    // верно и на экране невидимо.
    float sink = 0.085 * alarmEnv;
    if (kind == 7.0) {
      // Стопа не двигается вовсе.
    } else if (kind == 2.0) {
      gaitPos.y -= sink * 0.21;
    } else if (kind == 1.0) {
      gaitPos.y -= sink * 0.52;
      gaitPos.z += 0.02 * alarmEnv;
    } else if (kind == 6.0) {
      // Голова садится в плечи и уходит назад — самое узнаваемое в рефлексе.
      gaitPos.y -= sink + 0.05 * alarmEnv;
      gaitPos.z -= 0.03 * alarmEnv;
    } else if (kind == 3.0 || kind == 4.0 || kind == 8.0 || kind == 9.0) {
      // Плечевой пояс идёт ВВЕРХ относительно осевшего корпуса, локти к телу.
      gaitPos.y -= sink - 0.032 * alarmEnv;
      gaitPos.x -= side * 0.04 * alarmEnv;
      gaitPos.z += 0.05 * alarmEnv;
    } else {
      gaitPos.y -= sink;
      gaitPos.z += 0.03 * alarmEnv;
    }
  }

  // НАСТОРОЖЕННОСТЬ И ПЕРЕБЕЖКА живут в ОДНОМ канале: они не бывают
  // одновременно (сперва ищут, потом идут), а свободных слотов у жителя нет
  // ни одного. Поэтому 0..1 — настороженность, 1..2 — пригнутая перебежка.
  float watch = min(aState.w, 1.0);
  float duck = max(0.0, aState.w - 1.0);
  if (watch > 0.0) {
    if (kind == 7.0) {
      // Стопа стоит.
    } else if (kind == 2.0) {
      gaitPos.y -= 0.008 * watch;
    } else if (kind == 1.0) {
      gaitPos.y -= 0.019 * watch;
      gaitPos.z += 0.012 * watch;
    } else if (kind == 6.0) {
      // Голова подана вперёд и чуть опущена: человек всматривается.
      gaitPos.y -= 0.03 * watch;
      gaitPos.z += 0.035 * watch;
    } else if (kind == 3.0 || kind == 4.0 || kind == 8.0 || kind == 9.0) {
      gaitPos.y -= 0.022 * watch;
      gaitPos.x -= side * 0.016 * watch;
      gaitPos.z += 0.028 * watch;
    } else {
      gaitPos.y -= 0.036 * watch;
      gaitPos.z += 0.024 * watch;
    }
  }

  // ПРИГНУТЬСЯ И НАКРЫТЬСЯ. Характерное движение под огнём — не испуганное
  // стояние во весь рост, а низкая перебежка: корпус вперёд и вниз, голова
  // втянута, руки подняты к голове. Держится всё время, пока человек идёт по
  // принятому решению, и опять не трогает стопу.
  if (duck > 0.0) {
    float drop = 0.13 * duck;
    if (kind == 7.0) {
      // Стопа стоит.
    } else if (kind == 2.0) {
      gaitPos.y -= drop * 0.22;
    } else if (kind == 1.0) {
      gaitPos.y -= drop * 0.55;
      gaitPos.z += 0.03 * duck;
    } else if (kind == 6.0) {
      gaitPos.y -= drop + 0.035 * duck;
      gaitPos.z += 0.075 * duck;
    } else if (kind == 3.0 || kind == 4.0) {
      // РУКИ К ГОЛОВЕ: предплечья уходят вверх и внутрь, локти вперёд.
      gaitPos.y -= drop - 0.2 * duck * (kind == 4.0 ? 1.0 : 0.55);
      gaitPos.x -= side * 0.05 * duck;
      gaitPos.z += 0.12 * duck * (kind == 4.0 ? 1.0 : 0.5);
    } else if (kind == 8.0 || kind == 9.0) {
      gaitPos.y -= drop;
      gaitPos.z += 0.05 * duck;
    } else {
      gaitPos.y -= drop;
      gaitPos.z += 0.07 * duck;
    }
  }
`;

/** Две ссылки на состояние вместо новых объектов каждый кадр. */
const VISIBLE_PIECE = { visible: true } as const;
const HIDDEN_PIECE = { visible: false } as const;

export function Villagers({
  settlement,
  nightRef,
  pieces,
  brokenPieces,
  doorRequests,
  openDoors,
  stockStates,
  inspectRef,
  noise,
  threat,
  count = 24,
}: {
  /** Какое поселение здесь живёт: тропы, жильё, места, роли, одежда. */
  settlement: SettlementPlan;
  nightRef: RefObject<number>;
  /** Куски сцены — из них строится поле препятствий. */
  pieces?: readonly NavPiece[];
  /** Сломанное перестаёт мешать в тот же кадр. */
  brokenPieces?: { current: ReadonlySet<string> };
  /** Сюда жители кладут двери, которые сейчас открывают. */
  doorRequests?: { current: Set<string> };
  /** Входы, чьи створки уже распахнуты. */
  openDoors?: { current: Set<string> };
  /**
   * Сюда пишется видимость кусков складов. Поленница пустеет не по расписанию,
   * а потому что дрова унесли: уровень склада — это то же число, по которому
   * житель решает, есть ли работа.
   */
  stockStates?: { current: Map<string, { readonly visible: boolean }> };
  /**
   * Сюда кладётся опросчик «кто под перекрестьем». Наведясь на человека, можно
   * узнать, кто он и чем занят — это и приёмка работы, и способ увидеть, что
   * житель на самом деле думает.
   */
  inspectRef?: {
    current:
      | ((
          origin: readonly [number, number, number],
          direction: readonly [number, number, number],
        ) => VillagerReport | null)
      | null;
  };
  /**
   * Шум мира: сюда кладут выстрелы, взрывы и обвалы. Очередь ОБЩАЯ и без
   * различения источников — жителю всё равно, кто именно хлопнул.
   */
  noise?: { current: NoiseEvent[] };
  /**
   * Где стоит вооружённый человек. Не шум и не событие — присутствие: стоящие
   * жители провожают его взглядом. null, если руки у него пустые.
   */
  threat?: { current: { x: number; z: number } | null };
  /** Приёмник следов: отпечаток ставится в момент удара пяткой. */
  count?: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const obstacleField = useMemo(
    () => (pieces && pieces.length > 0 ? buildObstacleField(pieces) : null),
    [pieces],
  );
  const population = useRef<VillagerPopulation | null>(null);
  if (population.current === null) {
    population.current = createVillagerPopulation(settlement, count, obstacleField);
  }
  useEffect(() => {
    if (population.current) {
      population.current.field = obstacleField;
    }
  }, [obstacleField]);

  useEffect(() => {
    if (!inspectRef) {
      return undefined;
    }
    inspectRef.current = (origin, direction) => {
      const state = population.current;
      if (!state) {
        return null;
      }
      const villager = pickVillager(state, origin, direction);
      return villager ? describeVillager(state, villager) : null;
    };
    return () => {
      inspectRef.current = null;
    };
  }, [inspectRef]);

  // Dev-хук: срез слуха деревни. Испуг живёт в атрибуте вершинного шейдера, и
  // «не вижу разницы» невозможно разложить глазами на «событие не дошло»,
  // «дошло, но амплитуда нулевая» и «всё считается, но не читается».
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return undefined;
    }
    const scope = window as unknown as Record<string, unknown>;
    const probe = () => {
      const state = population.current;
      if (!state) {
        return null;
      }
      const walking = state.villagers.filter((villager) => villager.visible);
      const pace = walking.reduce((sum, villager) => sum + villager.speed, 0);
      return {
        pending: state.noise.length,
        startled: state.villagers.filter((villager) => villager.startle > 0).length,
        // Замерших видно дольше рефлекса — по ним и судят второе звено.
        watching: state.villagers.filter((villager) => villager.alert > 0).length,
        carrying: state.villagers.filter((villager) => villager.carries).length,
        // Третье звено: кто какое решение принял и сколько уже в домах.
        cover: state.villagers.filter((villager) => villager.panicKind === "cover").length,
        gather: state.villagers.filter((villager) => villager.panicKind === "gather").length,
        approach: state.villagers.filter((villager) => villager.panicKind === "approach").length,
        indoors: state.villagers.filter((villager) => villager.state === "inside").length,
        // Волна: сбитые с ног, отряхивающиеся, ушибленные и любопытные.
        downed: state.villagers.filter((villager) => villager.downPhase !== null).length,
        dusting: state.villagers.filter((villager) => villager.dusting > 0).length,
        bruised: state.villagers.filter((villager) => villager.bruised > 0).length,
        looking: state.villagers.filter((villager) => villager.panicKind === "look").length,
        horn: Number(state.hornCooldown.toFixed(0)),
        // Куда смотреть, чтобы увидеть последствия: первый сбитый с ног или
        // отряхивающийся. Без этого поймать позу в кадр можно только случайно.
        at: (() => {
          const who =
            state.villagers.find((villager) => villager.downPhase !== null) ??
            state.villagers.find((villager) => villager.dusting > 0);
          return who
            ? {
                id: who.id,
                x: Number(who.x.toFixed(2)),
                z: Number(who.z.toFixed(2)),
                phase: who.downPhase ?? "dusting",
              }
            : null;
        })(),
        peak: Math.max(0, ...state.villagers.map((villager) => villager.startle)),
        heard: Math.max(0, ...state.villagers.map((villager) => villager.heardLevel)),
        habituation: Math.max(0, ...state.villagers.map((villager) => villager.habituation)),
        // Средний ход деревни: по нему видно осечку, которой поза не выдаёт.
        pace: walking.length > 0 ? Number((pace / walking.length).toFixed(3)) : 0,
      };
    };
    scope.__mamVillagerAlarm = probe;
    return () => {
      if (scope.__mamVillagerAlarm === probe) {
        delete scope.__mamVillagerAlarm;
      }
    };
  }, []);

  const geometry = useMemo(() => buildVillagerGeometry(), []);

  const gaitAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );
  const dyeAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );
  const climbAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );
  // ЛИЧНОЕ СОСТОЯНИЕ ЧЕЛОВЕКА одним вектором: затасканность одежды, амплитуда
  // вздрога, его ход и запасной канал. Раздельными атрибутами это не сделать —
  // житель стоит вплотную к потолку в 16 слотов (см. GAIT_DECLARATIONS).
  const stateAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );

  const material = useMemo(() => {
    const standard = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    });
    standard.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n${GAIT_DECLARATIONS}\n  varying vec3 vDyeColor;\n  varying float vDyeMask;\n  varying vec3 vBodyPos;\n  varying float vWear;`,
        )
        // Позы считаются ДО обработки нормалей, иначе конечности поворачиваются,
        // а свет на них остаётся от позы покоя.
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>\n${GAIT_COMPUTE}\n  objectNormal = gRotB * gRotA * objectNormal;\n  vDyeColor = aDyeColor.rgb;\n  vDyeMask = aDye;\n  vBodyPos = position;\n  vWear = aState.x;`,
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  transformed = gaitPos;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\n  varying vec3 vDyeColor;\n  varying float vDyeMask;\n  varying vec3 vBodyPos;\n  varying float vWear;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
  // ТКАНЬ, А НЕ ЗАЛИВКА. Вокруг всё потрёпано: у досок волокно, у земли
  // натоптанность, у травы выгоревшие кончики. Житель был единственным
  // предметом с идеально ровной поверхностью — оттого и читался наклейкой.
  // Здесь то же самое делается процедурно: плетение, грязь по подолу и
  // коленям, выгоревшие плечи. Ни текстур, ни второго драв-колла.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vDyeColor * 1.38, vDyeMask);
  if (vDyeMask > 0.5) {
    // Плетение: две частоты поперёк и вдоль, чтобы читалась нить, а не шум.
    float warp = sin(vBodyPos.y * 210.0) * sin(vBodyPos.x * 168.0 + vBodyPos.z * 143.0);
    float weft = sin((vBodyPos.x + vBodyPos.z) * 96.0);
    diffuseColor.rgb *= 1.0 + (warp * 0.055 + weft * 0.03) * (0.6 + vWear);
    // Подол и колени в пыли, плечи и спина выгорели: одежду носят, а не надевают.
    float hem = 1.0 - smoothstep(0.16, 0.92, vBodyPos.y);
    float sun = smoothstep(1.02, 1.36, vBodyPos.y);
    diffuseColor.rgb *= 1.0 - hem * (0.1 + 0.3 * vWear);
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * vec3(1.16, 1.13, 1.04),
      sun * (0.22 + 0.36 * vWear)
    );
    // И общий тон чуть ниже среды: светлое пятно среди бурого выдаёт фигурку.
    diffuseColor.rgb *= 0.9 - 0.08 * vWear;
  }`,
        );
    };
    return standard;
  }, []);

  // Тень должна повторять позу, иначе на земле шагает другой человек.
  const depthMaterial = useMemo(() => {
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depth.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${GAIT_DECLARATIONS}`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n${GAIT_COMPUTE}\n  transformed = gaitPos;`,
        );
    };
    return depth;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !population.current) {
      return;
    }
    geometry.setAttribute("aGait", gaitAttribute);
    geometry.setAttribute("aDyeColor", dyeAttribute);
    geometry.setAttribute("aClimb", climbAttribute);
    geometry.setAttribute("aState", stateAttribute);
    for (const [index, villager] of population.current.villagers.entries()) {
      dyeAttribute.setXYZW(
        index,
        villager.dye[0],
        villager.dye[1],
        villager.dye[2],
        villager.carries ? 1 + villager.carryDrop : 0,
      );
    }
    dyeAttribute.needsUpdate = true;
    stateAttribute.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthMaterial;
  }, [
    geometry,
    gaitAttribute,
    dyeAttribute,
    climbAttribute,
    stateAttribute,
    depthMaterial,
  ]);

  // Прошлая «половина шага» каждого жителя: смена означает удар пяткой.
  const lastStep = useRef<Int32Array>(new Int32Array(count));
  const matrix = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const quaternion = useMemo(() => new Quaternion(), []);
  const scale = useMemo(() => new Vector3(), []);
  const euler = useMemo(() => new Euler(), []);
  const stockTimer = useRef(0);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const state = population.current;
    if (!mesh || !state) {
      return;
    }
    if (brokenPieces) {
      state.broken = brokenPieces.current;
    }
    // Какие створки СЕЙЧАС распахнуты. Пока вход закрыт, его створка для
    // жителя — стена: он останавливается перед ней и ждёт, а не проходит.
    if (openDoors) {
      state.externalOpenDoors = openDoors.current;
    }
    // Шум этого кадра — в симуляцию. Очередь опустошается здесь и только
    // здесь: дальше событие живёт своей жизнью, доходя до каждого в свой срок.
    if (noise && noise.current.length > 0) {
      for (const event of noise.current) {
        emitNoise(state, event);
      }
      noise.current.length = 0;
    }
    state.threat = threat?.current ?? null;
    stepVillagers(state, delta, nightRef.current ?? 0);

    // Уровни складов — в изменяемые куски сцены. Раз в четверть секунды:
    // чаще не нужно, а карта состояний общая с часами и табло.
    if (stockStates) {
      stockTimer.current -= delta;
      if (stockTimer.current <= 0) {
        stockTimer.current = 0.25;
        for (const [pieceId, visible] of storePieceVisibility(state)) {
          const previous = stockStates.current.get(pieceId);
          if (previous?.visible !== visible) {
            stockStates.current.set(pieceId, visible ? VISIBLE_PIECE : HIDDEN_PIECE);
          }
        }
      }
    }

    // Житель у своей двери просит её открыть — тем же механизмом, каким это
    // делает игрок: дверь распахивается по-настоящему, а не проходится
    // насквозь.
    if (doorRequests) {
      doorRequests.current.clear();
      // Ворота зала стоят распахнутыми весь день и вечер и затворяются на
      // ночь сами — это распорядок дома, а не чья-то просьба.
      // Днём и вечером ворота настежь. На ночь затворяются сами — но не
      // раньше, чем последний житель уйдёт домой: иначе задержавшийся
      // окажется заперт в зале до утра.
      const stillOut = state.villagers.some((villager) => villager.visible);
      if ((nightRef.current ?? 0) < 0.55 || stillOut) {
        for (const doorId of state.settlement.alwaysOpen ?? []) {
          doorRequests.current.add(doorId);
        }
      }
      for (const villager of state.villagers) {
        if (villager.doorWait > 0) {
          const doorId = state.settlement.dwellings.find(
            (dwelling) => dwelling.id === villager.homeId,
          )?.doorId;
          if (doorId) {
            doorRequests.current.add(doorId);
          }
        }
      }
      // Любой вход, в который житель упёрся по дороге, тоже просится открыть:
      // это уже не «своя дверь», а общее правило — створка закрыта, значит
      // стоит стеной, и надо попросить. Просьба ЖИВЁТ несколько секунд после
      // последнего просящего — иначе створка хлопает: закрытую житель видит и
      // просит открыть, открытую уже не видит и просить перестаёт.
      for (const entry of state.doorRequests) {
        doorRequests.current.add(entry);
      }
      for (const [entry, door] of state.doorState) {
        if (door.hold > 0) {
          doorRequests.current.add(entry);
        }
      }
    }

    for (const [index, villager] of state.villagers.entries()) {
      position.set(villager.x, villager.y, villager.z);
      euler.set(0, villager.yaw, 0);
      quaternion.setFromEuler(euler);
      scale.setScalar(villager.visible ? villager.build : 0);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);

      // Размах ноги выведен из длины шага: 2·L·sin(θ) = шаг. Так стопа
      // остаётся на месте, пока нога опорная.
      const stride = Math.asin(
        Math.min(0.85, villager.strideLength / (2 * LEG_REACH * villager.build)),
      );
      const move = Math.min(1, villager.speed / 0.85);
      gaitAttribute.setXYZW(
        index,
        villager.phase,
        move,
        stride,
        stride * 0.8 + 0.08,
      );
      stateAttribute.setXYZW(
        index,
        // Пыль ложится ПОВЕРХ своей затасканности и сходит отряхиванием
        // обратно к ней, а не в ноль: ни новой текстуры, ни частиц на теле.
        Math.min(1, villager.wear + villager.dust),
        villager.startle,
        villager.startle > 0 ? villager.startleAge / villager.startleSpan : 0,
        // Один канал на две позы: 0..1 — настороженность осмотра, 1..2 —
        // пригнутая перебежка по принятому решению. Свободных слотов нет.
        villager.alert > 0
          ? alertPose(villager.alertAge, villager.alert, villager.alertPeak)
          : villager.panic > 0 && villager.panicKind !== "approach"
            ? 1 + Math.min(1, villager.panic / 2.5)
            : 0,
      );
      climbAttribute.setXYZW(
        index,
        villager.climbKind,
        villager.climbProgress,
        villager.restY,
        (villager.atTable ? 1 : 0) +
          (villager.female ? 2 : 0) +
          // Что в руках: топор у рубящего, бревно или дрова у несущего.
          4 *
            (villager.climbKind === 13
              ? 5
              : villager.climbKind === 11
                ? 6
                : villager.climbKind === 7
              ? 1
              : villager.cargo === "log"
                ? 2
                : villager.cargo === "firewood"
                  ? 3
                  : villager.carries
                    ? 4
                    : 0),
      );

      // Момент постановки стопы берём из фазы шага (она растёт от пути, а не
      // от времени) — поэтому следы ложатся ровно под шаг человека.
      const half = Math.floor(villager.phase / Math.PI);
    }
    mesh.instanceMatrix.needsUpdate = true;
    gaitAttribute.needsUpdate = true;
    climbAttribute.needsUpdate = true;
    stateAttribute.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      depthMaterial.dispose();
    };
  }, [geometry, material, depthMaterial]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
}
