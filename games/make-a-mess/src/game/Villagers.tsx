"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DataTexture,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  RGBADepthPacking,
  RGBAFormat,
  UnsignedByteType,
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
import { alertPose } from "./villagerAlarm.ts";
import { buildObstacleField } from "./villagerNavigation.ts";
import { VILLAGER_BODY } from "./villagerBody.ts";
import {
  createVillagerPosePalette,
  VILLAGER_RENDER_BONE_INDEX,
  writeVillagerPose,
  type VillagerRenderBone,
} from "./villagerPosePalette.ts";
import type { HumanSettlementPopulationDefinition } from "./creaturePopulation.ts";
import type { CreatureWorldRuntime, WorldValue } from "./creatureWorld.ts";

/**
 * Жители деревни: тела из тех же коробок, что и всё вокруг, шагающие по
 * авторским тропам.
 *
 * Рендер — один инстансированный меш на всю деревню. Единый решатель тела
 * записывает готовые матрицы канонических костей в компактную палитру; меш и
 * его тень читают одну и ту же позу. Действие меняет углы суставов, но не
 * выбирает другой меш или упрощённого дублёра. Материал — обычный
 * MeshStandardMaterial: жители получают общий свет, туман и тени.
 *
 * Главная деталь ремесла — фаза шага приходит из ПРОЙДЕННОГО ПУТИ, а размах
 * ноги выведен аналитически из длины шага (asin(S / 2L)). Поэтому стопа
 * стоит на земле, пока на неё опираются: без этого фигурки «едут по льду»,
 * и никакая проработка меша этого не спасает.
 */

// Пропорции взрослого жителя в метрах, от земли.
const HIP_Y = VILLAGER_BODY.hipY;
const KNEE_Y = VILLAGER_BODY.kneeY;
const ANKLE_Y = VILLAGER_BODY.ankleY;
const SHOULDER_Y = VILLAGER_BODY.shoulderY;
const ELBOW_Y = VILLAGER_BODY.elbowY;
const WRIST_Y = VILLAGER_BODY.wristY;
const HIP_HALF_WIDTH = VILLAGER_BODY.hipHalfWidth;

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
  /** 0 — base, 1 — cloth, 2 — skin, 3 — hair. Kept in the existing aDye slot. */
  dye: number;
  kind: PartKind;
  /** -1 левая сторона, +1 правая, 0 по центру. */
  side: number;
  /** Сустав-владелец: действие меняет позу, но никогда не меняет тело. */
  bone: VillagerRenderBone;
}

function villagerBoxes(): BoxSpec[] {
  const boxes: BoxSpec[] = [];

  boxes.push(
    // Плечи шире пояса: без этого перепада фигура читается холодильником.
    { center: [0, 1.28, 0], size: [0.44, 0.22, 0.26], color: CLOTH, dye: 1, kind: "body", side: 0, bone: "chest" },
    { center: [0, 1.04, 0], size: [0.36, 0.32, 0.24], color: CLOTH, dye: 1, kind: "body", side: 0, bone: "lumbar" },
    { center: [0, 0.87, 0], size: [0.38, 0.09, 0.25], color: LEATHER, dye: 0, kind: "body", side: 0, bone: "pelvis" },
    { center: [0, 1.44, 0], size: [0.12, 0.1, 0.12], color: SKIN, dye: 2, kind: "head", side: 0, bone: "head" },
    // Голова чуть крупнее анатомической: в такой стилизации точная пропорция
    // читается как «маленькая голова», а не как реализм.
    { center: [0, 1.6, 0.01], size: [0.27, 0.27, 0.26], color: SKIN, dye: 2, kind: "head", side: 0, bone: "head" },
    { center: [0, 1.7, -0.03], size: [0.29, 0.15, 0.24], color: HAIR, dye: 3, kind: "head", side: 0, bone: "head" },
  );

  for (const side of [-1, 1] as const) {
    // Ширина шага у человека мала: стопы ставятся почти под таз, а не по
    // ширине плеч. Поэтому нога слегка сходится внутрь от бедра к пятке.
    const hipX = side * HIP_HALF_WIDTH;
    const kneeX = side * 0.088;
    const ankleX = side * 0.072;
    boxes.push(
      { center: [(hipX + kneeX) / 2, (HIP_Y + KNEE_Y) / 2, 0], size: [0.16, HIP_Y - KNEE_Y, 0.17], color: CLOTH, dye: 1, kind: "legThigh", side, bone: side < 0 ? "leftThigh" : "rightThigh" },
      { center: [(kneeX + ankleX) / 2, (KNEE_Y + ANKLE_Y) / 2, 0], size: [0.14, KNEE_Y - ANKLE_Y, 0.15], color: LEATHER, dye: 0, kind: "legShin", side, bone: side < 0 ? "leftShin" : "rightShin" },
      // Стопа — третье звено: у неё свой шарнир, иначе не будет ни удара
      // пяткой, ни толчка носком.
      { center: [ankleX, ANKLE_Y / 2, 0.05], size: [0.15, ANKLE_Y, 0.26], color: LEATHER, dye: 0, kind: "foot", side, bone: side < 0 ? "leftFoot" : "rightFoot" },
    );

    // Руки вынесены за габарит торса, иначе они тонут в силуэте и мах не виден.
    const shoulderX = side * 0.255;
    boxes.push(
      { center: [shoulderX, (SHOULDER_Y + ELBOW_Y) / 2, 0], size: [0.13, SHOULDER_Y - ELBOW_Y, 0.14], color: CLOTH, dye: 1, kind: "armUpper", side, bone: side < 0 ? "leftUpperArm" : "rightUpperArm" },
      { center: [shoulderX, (ELBOW_Y + WRIST_Y) / 2, 0.01], size: [0.12, ELBOW_Y - WRIST_Y, 0.13], color: SKIN, dye: 2, kind: "armFore", side, bone: side < 0 ? "leftForearm" : "rightForearm" },
    );
  }

  // ТОПОР. Инструмент — не декорация в кадре: он висит на тех же шарнирах,
  // что и предплечье, поэтому следует за руками в замахе и в ударе. Держат
  // двумя руками, значит ось у него по центру тела, а не у одного плеча.
  boxes.push(
    {
      center: [0, 0.6, 0.2],
      size: [0.07, 0.78, 0.07],
      color: new Color("#8a6743"),
      dye: 0,
      kind: "tool",
      side: 0,
      bone: "toolAttachment",
    },
    {
      center: [0, 0.24, 0.22],
      size: [0.24, 0.17, 0.06],
      color: new Color("#4a5050"),
      dye: 0,
      kind: "tool",
      side: 0,
      bone: "toolAttachment",
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
      bone: "spadeAttachment",
    },
    {
      center: [0, 0.1, 0.3],
      size: [0.2, 0.26, 0.04],
      color: new Color("#4a5050"),
      dye: 0,
      kind: "spade",
      side: 0,
      bone: "spadeAttachment",
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
    bone: "carriedAttachment",
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
  const bones: number[] = [];

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
        bones.push(VILLAGER_RENDER_BONE_INDEX[box.bone]);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aDye", new Float32BufferAttribute(dyes, 1));
  geometry.setAttribute("aFlags", new Float32BufferAttribute(flags, 2));
  geometry.setAttribute("aBone", new Float32BufferAttribute(bones, 1));
  return geometry;
}

function createVillagerAppearanceTexture(population: VillagerPopulation): DataTexture {
  // Two texels per person: skin, hair. This avoids another instanced attribute,
  // while appearance remains independent from the pose palette and skeleton.
  const data = new Uint8Array(population.villagers.length * 2 * 4);
  const color = new Color();
  for (const [index, villager] of population.villagers.entries()) {
    for (const [slot, value] of [villager.skin, villager.hair].entries()) {
      color.set(value);
      const offset = (index * 2 + slot) * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(
    data,
    2,
    Math.max(1, population.villagers.length),
    RGBAFormat,
    UnsignedByteType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const POSE_DECLARATIONS = /* glsl */ `
  attribute float aDye;
  attribute vec2 aFlags;
  attribute float aBone;
  attribute vec4 aDyeColor;
  attribute vec4 aClimb;
  attribute vec4 aState;
  uniform highp sampler2D uVillagerPose;

  mat4 villagerBonePose() {
    int column = int(aBone) * 4;
    int row = gl_InstanceID;
    return mat4(
      texelFetch(uVillagerPose, ivec2(column, row), 0),
      texelFetch(uVillagerPose, ivec2(column + 1, row), 0),
      texelFetch(uVillagerPose, ivec2(column + 2, row), 0),
      texelFetch(uVillagerPose, ivec2(column + 3, row), 0)
    );
  }
`;

const POSE_COMPUTE = /* glsl */ `
  float kind = aFlags.y;
  float flags = aClimb.w;
  float female = mod(floor(flags / 2.0), 2.0);
  vec3 posePosition = position;

  // Половые различия меняют силуэт того же тела, но не выбирают иной меш.
  if (female > 0.5) {
    if (kind == 0.0) {
      float shoulders = smoothstep(1.06, 1.3, position.y);
      float waist = 1.0 - smoothstep(0.78, 1.02, position.y);
      posePosition.x *= mix(1.0, 0.9, shoulders) * mix(1.0, 1.14, waist);
      posePosition.z *= mix(1.0, 0.94, shoulders);
    } else if (kind == 1.0 || kind == 2.0) {
      float hem = clamp((${HIP_Y.toFixed(2)} - position.y) / 0.5, 0.0, 1.0);
      float flare = 1.0 + hem * hem * 1.55;
      posePosition.x = posePosition.x * flare + sign(posePosition.x) * hem * 0.03;
      posePosition.z *= 1.0 + hem * hem * 1.25;
    } else if (kind == 6.0 && position.y > 1.6) {
      float back = clamp(-position.z * 6.0, 0.0, 1.0);
      posePosition.y -= back * 0.3;
      posePosition.z -= back * 0.05;
      posePosition.x *= 1.0 + back * 0.06;
    }
  }

  mat4 bonePose = villagerBonePose();
  vec3 posedPosition = (bonePose * vec4(posePosition, 1.0)).xyz;
  mat3 posedNormal = mat3(bonePose);
`;

/** Две ссылки на состояние вместо новых объектов каждый кадр. */
const VISIBLE_PIECE = { visible: true } as const;
const HIDDEN_PIECE = { visible: false } as const;

/** Human-only ports layered on top of the shared living-world boundary. */
export interface VillagerWorldBindings {
  /** Doors residents currently ask the world's hinge system to open. */
  readonly doorRequests?: WorldValue<Set<string>>;
  /** Entries whose leaves have physically reached the open position. */
  readonly openDoors?: WorldValue<Set<string>>;
  /** Piece visibility used to expose the settlement economy in the scene. */
  readonly stockStates?: WorldValue<Map<string, { readonly visible: boolean }>>;
  /** Human inspection remains human-specific until a generic entity picker exists. */
  readonly inspect?: WorldValue<
    | ((
        origin: readonly [number, number, number],
        direction: readonly [number, number, number],
      ) => VillagerReport | null)
    | null
  >;
}

export function Villagers({
  definition,
  world,
  bindings,
}: {
  definition: HumanSettlementPopulationDefinition;
  world: CreatureWorldRuntime;
  bindings: VillagerWorldBindings;
}) {
  const { profile, count } = definition;
  const pieces = world.geometry.pieces;
  const brokenPieces = world.geometry.removedPieceIds;
  const { doorRequests, openDoors, stockStates, inspect: inspectRef } = bindings;
  const meshRef = useRef<InstancedMesh>(null);
  const obstacleField = useMemo(
    () => (pieces.length > 0 ? buildObstacleField(pieces) : null),
    [pieces],
  );
  const acousticCursor = useRef(world.stimuli.acoustic.latestSequence);
  useEffect(() => {
    acousticCursor.current = world.stimuli.acoustic.latestSequence;
  }, [world.stimuli.acoustic]);
  const initialPopulation = useMemo(
    () => createVillagerPopulation(profile, count, null),
    [profile, count],
  );
  const population = useRef<VillagerPopulation | null>(initialPopulation);
  useEffect(() => {
    population.current = initialPopulation;
  }, [initialPopulation]);
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

  const appearanceTexture = useMemo(
    () => createVillagerAppearanceTexture(initialPopulation),
    [initialPopulation],
  );

  const posePalette = useMemo(() => createVillagerPosePalette(count), [count]);
  const dyeAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );
  const climbAttribute = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(count * 4), 4),
    [count],
  );
  // Личное состояние оставляем отдельным лёгким каналом материала. Сама поза
  // целиком живёт в палитре суставов и больше не конкурирует за атрибуты меша.
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
      shader.uniforms.uVillagerPose = { value: posePalette.texture };
      shader.uniforms.uVillagerAppearance = { value: appearanceTexture };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n${POSE_DECLARATIONS}\n  uniform highp sampler2D uVillagerAppearance;\n  varying vec3 vDyeColor;\n  varying float vMaterialMask;\n  varying vec3 vSkinColor;\n  varying vec3 vHairColor;\n  varying vec3 vBodyPos;\n  varying float vWear;`,
        )
        // Позы считаются ДО обработки нормалей, иначе конечности поворачиваются,
        // а свет на них остаётся от позы покоя.
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>\n${POSE_COMPUTE}\n  objectNormal = posedNormal * objectNormal;\n  vDyeColor = aDyeColor.rgb;\n  vMaterialMask = aDye;\n  vSkinColor = texelFetch(uVillagerAppearance, ivec2(0, gl_InstanceID), 0).rgb;\n  vHairColor = texelFetch(uVillagerAppearance, ivec2(1, gl_InstanceID), 0).rgb;\n  vBodyPos = position;\n  vWear = aState.x;`,
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n  transformed = posedPosition;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\n  varying vec3 vDyeColor;\n  varying float vMaterialMask;\n  varying vec3 vSkinColor;\n  varying vec3 vHairColor;\n  varying vec3 vBodyPos;\n  varying float vWear;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
  // ТКАНЬ, А НЕ ЗАЛИВКА. Вокруг всё потрёпано: у досок волокно, у земли
  // натоптанность, у травы выгоревшие кончики. Житель был единственным
  // предметом с идеально ровной поверхностью — оттого и читался наклейкой.
  // Здесь то же самое делается процедурно: плетение, грязь по подолу и
  // коленям, выгоревшие плечи. Ни текстур, ни второго драв-колла.
  float clothMask = 1.0 - step(0.5, abs(vMaterialMask - 1.0));
  float skinMask = 1.0 - step(0.5, abs(vMaterialMask - 2.0));
  float hairMask = 1.0 - step(0.5, abs(vMaterialMask - 3.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vSkinColor, skinMask);
  diffuseColor.rgb = mix(diffuseColor.rgb, vHairColor, hairMask);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vDyeColor * 1.38, clothMask);
  if (clothMask > 0.5) {
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
  }, [posePalette, appearanceTexture]);

  // Тень должна повторять позу, иначе на земле шагает другой человек.
  const depthMaterial = useMemo(() => {
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.uVillagerPose = { value: posePalette.texture };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${POSE_DECLARATIONS}`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n${POSE_COMPUTE}\n  transformed = posedPosition;`,
        );
    };
    return depth;
  }, [posePalette]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !population.current) {
      return;
    }
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
    dyeAttribute,
    climbAttribute,
    stateAttribute,
    depthMaterial,
  ]);

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
    // У каждой популяции свой курсор: люди читают события, не отнимая их у
    // будущих животных. Дальше звук живёт по человеческому закону слуха.
    const acoustic = world.stimuli.acoustic.readAfter(acousticCursor.current);
    acousticCursor.current = acoustic.cursor;
    for (const event of acoustic.events) {
      emitNoise(state, event);
    }
    state.threat = world.stimuli.dangerousPresence.current;
    stepVillagers(state, delta, world.time.night.current ?? 0);

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
      if ((world.time.night.current ?? 0) < 0.55 || stillOut) {
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

      const attention =
        villager.alert > 0
          ? alertPose(villager.alertAge, villager.alert, villager.alertPeak)
          : villager.panic > 0 && villager.panicKind !== "approach"
            ? 1 + Math.min(1, villager.panic / 2.5)
            : 0;
      const handKind =
        villager.climbKind === 13
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
                    : 0;
      writeVillagerPose(posePalette, index, {
        phase: villager.phase,
        speed: villager.speed,
        strideLength: villager.strideLength,
        build: villager.build,
        female: villager.female,
        climbKind: villager.climbKind,
        climbProgress: villager.climbProgress,
        restY: villager.restY,
        atTable: villager.atTable,
        carryRaw: villager.carries ? 1 + villager.carryDrop : 0,
        handKind,
        startle: villager.startle,
        startleProgress:
          villager.startle > 0 ? villager.startleAge / villager.startleSpan : 0,
        attention,
      });
      stateAttribute.setXYZW(
        index,
        // Пыль ложится ПОВЕРХ своей затасканности и сходит отряхиванием
        // обратно к ней, а не в ноль: ни новой текстуры, ни частиц на теле.
        Math.min(1, villager.wear + villager.dust),
        villager.startle,
        villager.startle > 0 ? villager.startleAge / villager.startleSpan : 0,
        // Один канал на две позы: 0..1 — настороженность осмотра, 1..2 —
        // пригнутая перебежка по принятому решению. Свободных слотов нет.
        attention,
      );
      climbAttribute.setXYZW(
        index,
        villager.climbKind,
        villager.climbProgress,
        villager.restY,
        (villager.atTable ? 1 : 0) +
          (villager.female ? 2 : 0) +
          4 * handKind,
      );

    }
    mesh.instanceMatrix.needsUpdate = true;
    posePalette.texture.needsUpdate = true;
    climbAttribute.needsUpdate = true;
    stateAttribute.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      depthMaterial.dispose();
      posePalette.texture.dispose();
      appearanceTexture.dispose();
    };
  }, [geometry, material, depthMaterial, posePalette, appearanceTexture]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
    />
  );
}
