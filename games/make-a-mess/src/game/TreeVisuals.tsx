"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  StaticDrawUsage,
  Vector3,
} from "three";
import type {
  BreakablePieceDefinition,
  TreeVisualKind,
} from "./destructionScene";
import {
  buildProceduralRootNetwork,
  coniferLimbRods,
  isEnhancedTreePiece,
  proceduralPineNeedleProfile,
  proceduralRootJointDiameter,
  proceduralWoodTubeProfile,
  treeBarkPhase,
  treeWoodSpecies,
  treeVisualRootId,
  willowWhipFan,
} from "./treeVisualModel";
import {
  buildTreeVisuals,
  hash,
  HIDDEN_MATRIX,
  UP,
} from "./treeVisualInstances";
import type { FoliageInstance, VisualInstance } from "./treeVisualInstances";
import { treeBarkAtlas } from "./treeBarkAtlas";
import { windState } from "./windState";

interface TreeShader {
  readonly uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}

function makeLeafCloudGeometry(leafCount = 72): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const leafData: number[] = [];
  const indices: number[] = [];
  let vertex = 0;

  for (let leaf = 0; leaf < leafCount; leaf += 1) {
    const azimuth = hash(leaf, 1) * Math.PI * 2;
    const vertical = hash(leaf, 2) * 2 - 1;
    const radial = 0.14 + Math.pow(hash(leaf, 3), 0.44) * 0.35;
    const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const center = new Vector3(
      Math.cos(azimuth) * horizontal * radial,
      vertical * radial * 0.9,
      Math.sin(azimuth) * horizontal * radial,
    );

    const normal = new Vector3(
      hash(leaf, 4) * 2 - 1,
      0.25 + hash(leaf, 5) * 0.75,
      hash(leaf, 6) * 2 - 1,
    ).normalize();
    let tangent = normal.clone().cross(UP);
    if (tangent.lengthSq() < 0.01) {
      tangent = normal.clone().cross(new Vector3(1, 0, 0));
    }
    tangent.normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const roll = hash(leaf, 7) * Math.PI * 2;
    const rolledTangent = tangent
      .clone()
      .multiplyScalar(Math.cos(roll))
      .addScaledVector(bitangent, Math.sin(roll));
    const rolledBitangent = normal.clone().cross(rolledTangent).normalize();
    const width = 0.048 + hash(leaf, 8) * 0.032;
    const height = width * (1.3 + hash(leaf, 9) * 0.42);
    const points = [
      center.clone().addScaledVector(rolledBitangent, -height),
      center.clone().addScaledVector(rolledTangent, width),
      center.clone().addScaledVector(rolledBitangent, height),
      center.clone().addScaledVector(rolledTangent, -width),
    ];
    const tone = 0.78 + hash(leaf, 10) * 0.3;
    const rank = (leaf + hash(leaf, 11) * 0.8) / leafCount;
    // Лист листу рознь не только яркостью: молодая пластинка теплее и желтее,
    // старая — холоднее и синее. Одинаковый оттенок на все 72 листа даёт
    // пластиковую крону, которая не оживает даже при хорошем свете.
    const warmth = hash(leaf, 12);

    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      colors.push(
        tone * (0.84 + warmth * 0.22),
        tone * (1.02 - warmth * 0.05),
        tone * (0.94 - warmth * 0.26),
      );
      leafData.push(center.x, center.y, center.z, rank);
    }
    uvs.push(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aLeafData", new Float32BufferAttribute(leafData, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makePineSprayGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const leafData: number[] = [];
  const indices: number[] = [];
  const {
    boughCount,
    stationsPerBough,
    needlesPerStation,
    minimumLength,
    lengthVariation,
    minimumHalfWidth,
    halfWidthVariation,
  } = proceduralPineNeedleProfile;
  let vertex = 0;

  const pushNeedle = (
    base: Vector3,
    direction: Vector3,
    side: Vector3,
    length: number,
    width: number,
    rank: number,
    tone: number,
  ): void => {
    const root = base.clone().addScaledVector(direction, -length * 0.08);
    const shoulder = base.clone().addScaledVector(direction, length * 0.14);
    const tip = base.clone().addScaledVector(direction, length);
    const points = [
      root,
      shoulder.clone().addScaledVector(side, -width),
      tip,
      shoulder.clone().addScaledVector(side, width),
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      colors.push(tone * 0.76, tone * 0.93, tone * 0.69);
      leafData.push(base.x, base.y, base.z, rank);
    }
    uvs.push(0.5, 0, 0, 0.18, 0.5, 1, 1, 0.18);
    indices.push(
      vertex,
      vertex + 1,
      vertex + 2,
      vertex,
      vertex + 2,
      vertex + 3,
    );
    vertex += 4;
  };

  for (let bough = 0; bough < boughCount; bough += 1) {
    const angle = (bough / boughCount) * Math.PI * 2 + hash(bough, 501) * 0.3;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    for (let station = 0; station < stationsPerBough; station += 1) {
      const distance =
        0.075 + station * 0.054 + hash(bough, 510 + station) * 0.018;
      const base = radial
        .clone()
        .multiplyScalar(distance)
        .addScaledVector(
          tangent,
          (hash(bough, 520 + station) - 0.5) * 0.045,
        );
      base.y = (hash(bough, 530 + station) - 0.5) * 0.105;

      for (let needle = 0; needle < needlesPerStation; needle += 1) {
        const rank =
          (bough * stationsPerBough * needlesPerStation +
            station * needlesPerStation +
            needle) /
          (boughCount * stationsPerBough * needlesPerStation);
        const aroundAngle =
          (needle / needlesPerStation) * Math.PI * 2 +
          (hash(bough + station * 13, 540 + needle) - 0.5) * 0.42;
        const around = tangent
          .clone()
          .multiplyScalar(Math.cos(aroundAngle))
          .addScaledVector(UP, Math.sin(aroundAngle));
        const direction = radial
          .clone()
          .multiplyScalar(0.3)
          .addScaledVector(around, 0.954)
          .normalize();
        const side = direction.clone().cross(radial).normalize();
        const length =
          minimumLength +
          hash(bough + station * 7, 550 + needle) * lengthVariation;
        const width =
          minimumHalfWidth +
          hash(bough + station * 11, 560 + needle) * halfWidthVariation;
        const tone = 0.68 + hash(bough + station * 17, 570 + needle) * 0.3;
        pushNeedle(base, direction, side, length, width, rank, tone);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("aLeafData", new Float32BufferAttribute(leafData, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const WoodBatch = memo(function WoodBatch({
  instances,
  hiddenPieceIds,
  variant = "wood",
}: {
  instances: readonly VisualInstance[];
  hiddenPieceIds: ReadonlySet<string>;
  variant?: "wood" | "root" | "joint";
}) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
      const tubeProfile = proceduralWoodTubeProfile("trunk");
      const next = variant === "joint"
        ? new SphereGeometry(0.5, 9, 5)
        : variant === "root"
          ? new CylinderGeometry(0.34, 0.5, 1, 8, 1, true)
        // Six longitudinal rings form one connected, bendable tube. There are
        // no open faces between them, so neither trunks nor branches can show
        // the old bright transverse gaps.
        : new CylinderGeometry(
            0.5,
            0.5,
            1,
            9,
            tubeProfile.longitudinalSegments,
            true,
          );
      const woodParams = new Float32Array(instances.length * 4);
      instances.forEach((instance, index) => {
        woodParams[index * 4] = instance.species;
        woodParams[index * 4 + 1] = instance.phase;
        woodParams[index * 4 + 2] = instance.bend ?? 0;
        woodParams[index * 4 + 3] = instance.taper ?? 1;
      });
      next.setAttribute(
        "aWoodParams",
        new InstancedBufferAttribute(woodParams, 4, false),
      );
      return next;
    },
    [instances, variant]);
  const material = useMemo(() => {
    const next = new MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.94,
        metalness: 0,
        vertexColors: true,
    });
    const barkAtlas = treeBarkAtlas();
    next.onBeforeCompile = (compiled) => {
      compiled.uniforms.uTreeBarkAtlas = { value: barkAtlas };
      compiled.vertexShader = compiled.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec4 aWoodParams;
varying vec3 vTreeWoodPosition;
varying vec4 vTreeWoodParams;
varying vec2 vTreeBarkUv;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
float treeWoodT = clamp(position.y + 0.5, 0.0, 1.0);
transformed.xz *= mix(1.0, aWoodParams.w, treeWoodT);
float treeWoodEnvelope = sin(treeWoodT * 3.14159265);
float treeWoodPhase = aWoodParams.y * 6.2831853;
transformed.x += cos(treeWoodPhase) * treeWoodEnvelope * aWoodParams.z;
transformed.z += sin(treeWoodPhase) * treeWoodEnvelope * aWoodParams.z;
vTreeWoodPosition = transformed;
vTreeWoodParams = aWoodParams;
vTreeBarkUv = uv;`,
        );
      compiled.fragmentShader = compiled.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform sampler2D uTreeBarkAtlas;
varying vec3 vTreeWoodPosition;
varying vec4 vTreeWoodParams;
varying vec2 vTreeBarkUv;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float barkColumn = clamp(floor(vTreeWoodParams.x + 0.5), 0.0, 2.0);
float barkPadding = 0.006;
float barkU = fract(vTreeBarkUv.x + vTreeWoodParams.y * 0.73);
float atlasU = (
  barkColumn + barkPadding + barkU * (1.0 - barkPadding * 2.0)
) / 3.0;
vec3 barkAlbedo = texture2D(
  uTreeBarkAtlas,
  vec2(atlasU, clamp(vTreeBarkUv.y, 0.002, 0.998))
).rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, barkAlbedo, 0.94);`,
        );
    };
    next.customProgramCacheKey = () => "procedural-tree-wood-v4-bark-atlas";
    return next;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    instances.forEach((instance, index) => {
      current.setMatrixAt(
        index,
        hiddenPieceIds.has(instance.sourceId)
          ? HIDDEN_MATRIX
          : instance.matrix,
      );
      current.setColorAt(index, instance.color);
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
  }, [hiddenPieceIds, instances]);

  if (instances.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      userData={{
        breakableInstanceIds: instances.map((instance) => instance.sourceId),
        breakableMaterial: "wood",
      }}
    />
  );
});

const FoliageBatch = memo(function FoliageBatch({
  instances,
  hiddenPieceIds,
  variant = "broadleaf",
}: {
  instances: readonly FoliageInstance[];
  hiddenPieceIds: ReadonlySet<string>;
  variant?: "broadleaf" | "pine";
}) {
  const mesh = useRef<InstancedMesh>(null);
  const shader = useRef<TreeShader | null>(null);
  const geometry = useMemo(() => {
    const next = variant === "pine"
      ? makePineSprayGeometry()
      : makeLeafCloudGeometry();
    const treeParams = new Float32Array(instances.length * 2);
    instances.forEach((instance, index) => {
      treeParams[index * 2] = instance.species;
      treeParams[index * 2 + 1] = instance.phase;
    });
    next.setAttribute(
      "aTreeParams",
      new InstancedBufferAttribute(treeParams, 2, false),
    );
    return next;
  }, [instances, variant]);
  const material = useMemo(() => {
    const next = new MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#071208",
      emissiveIntensity: 0.2,
      metalness: 0,
      roughness: 0.9,
      side: DoubleSide,
      vertexColors: true,
    });
    next.onBeforeCompile = (compiled) => {
      compiled.uniforms.uTreeTime = { value: 0 };
      compiled.uniforms.uTreeWind = { value: 1 };
      compiled.uniforms.uTreeCamera = { value: new Vector3() };
      compiled.vertexShader = compiled.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute vec4 aLeafData;
attribute vec2 aTreeParams;
uniform float uTreeTime;
uniform float uTreeWind;
uniform vec3 uTreeCamera;
varying vec3 vTreeLeafTint;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vec3 treeAnchor = instanceMatrix[3].xyz;
float treeDistance = distance(treeAnchor, uTreeCamera);
float treeNearToMid = smoothstep(22.0, 48.0, treeDistance);
float treeMidToFar = smoothstep(48.0, 82.0, treeDistance);
float treeDensity = mix(1.0, 0.62, treeNearToMid);
treeDensity = mix(treeDensity, 0.28, treeMidToFar);
float treeIsBirch = step(0.5, aTreeParams.x) * (1.0 - step(1.5, aTreeParams.x));
treeDensity *= mix(1.0, 0.88, treeIsBirch);
float treeVisible = step(aLeafData.w, treeDensity);
float treeAreaPreservation = min(1.55, inversesqrt(max(treeDensity, 0.2)));
vec3 treeLeafOffset = transformed - aLeafData.xyz;
transformed = aLeafData.xyz + treeLeafOffset * treeAreaPreservation;
// Отжившие листья есть в любой кроне, и раздавать их надо ПОЛИСТНО: жёлтый
// ком читается как больное пятно, а рассыпанные листья — как живое дерево.
// Берёза желтеет раньше и заметнее всех, дуб держит лист дольше, ива — самая
// ровная. Порода приходит в aTreeParams.x (0 широколиственные, 1 берёза,
// 2 хвоя, 3 ива). Тон уезжает во фрагмент варьирующей: в вершинном шейдере
// vColor объявлен как out, и читать его оттуда нельзя.
float treeIsWillow = step(2.5, aTreeParams.x);
float treeYellowRate = mix(mix(0.08, 0.19, treeIsBirch), 0.1, treeIsWillow);
float treeLeafRoll = fract(
  sin(aLeafData.w * 91.7 + aTreeParams.y * 37.3 + treeAnchor.x * 0.31) * 43758.5453
);
float treeYellow = step(1.0 - treeYellowRate, treeLeafRoll)
  * (0.55 + fract(treeLeafRoll * 17.3) * 0.45);
// Испод листа белой ивы серебряный: пластинка светлее и холоднее, отчего
// крона на ветру взблёскивает сединой.
vTreeLeafTint = mix(vec3(1.0), vec3(1.58, 1.34, 0.5), treeYellow)
  * mix(vec3(1.0), vec3(1.22, 1.27, 1.34), treeIsWillow * 0.5);
float treePhase = aTreeParams.y * 6.28318 + aLeafData.w * 11.7;
float treeGust = sin(uTreeTime * 1.13 + treePhase + treeAnchor.x * 0.09 + treeAnchor.z * 0.07);
float treeFlutter = sin(uTreeTime * 3.7 + treePhase * 1.91);
transformed.x += (treeGust * 0.018 + treeFlutter * 0.007) * uTreeWind;
transformed.z += (treeGust * 0.012 - treeFlutter * 0.005) * uTreeWind;
transformed = mix(aLeafData.xyz, transformed, treeVisible);`,
        );
      compiled.fragmentShader = compiled.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vTreeLeafTint;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
diffuseColor.rgb *= vTreeLeafTint;`,
        );
      shader.current = compiled as TreeShader;
    };
    next.customProgramCacheKey = () => `procedural-tree-foliage-v4-leaf-tint:${variant}`;
    return next;
  }, [variant]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    instances.forEach((instance, index) => {
      current.setMatrixAt(
        index,
        hiddenPieceIds.has(instance.sourceId)
          ? HIDDEN_MATRIX
          : instance.matrix,
      );
      current.setColorAt(index, instance.color);
    });
    current.instanceMatrix.setUsage(StaticDrawUsage);
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingSphere();
  }, [hiddenPieceIds, instances]);

  useFrame((state) => {
    const current = shader.current;
    if (!current) {
      return;
    }
    current.uniforms.uTreeTime.value = state.clock.elapsedTime;
    current.uniforms.uTreeWind.value = windState.strength;
    (current.uniforms.uTreeCamera.value as Vector3).copy(state.camera.position);
  });

  if (instances.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, instances.length]}
      castShadow
      receiveShadow
      userData={{
        breakableInstanceIds: instances.map((instance) => instance.sourceId),
        breakableMaterial: "foliage",
      }}
    />
  );
});

/**
 * A high-detail visual skin over the existing tree gameplay proxies. All
 * trunks and branches share one draw call; every broadleaf canopy shares one
 * more. Hiding a proxy hides its visual segments, so the existing destruction
 * path remains authoritative.
 */
export const TreeVisuals = memo(function TreeVisuals({
  pieces,
  hiddenPieceIds,
}: {
  pieces: readonly BreakablePieceDefinition[];
  hiddenPieceIds: ReadonlySet<string>;
}) {
  const build = useMemo(() => buildTreeVisuals(pieces), [pieces]);
  if (
    build.wood.length === 0 &&
    build.roots.length === 0 &&
    build.lumps.length === 0 &&
    build.foliage.length === 0 &&
    build.conifer.length === 0
  ) {
    return null;
  }
  return (
    <>
      <WoodBatch instances={build.wood} hiddenPieceIds={hiddenPieceIds} />
      <WoodBatch
        instances={build.roots}
        hiddenPieceIds={hiddenPieceIds}
        variant="root"
      />
      <WoodBatch
        instances={build.lumps}
        hiddenPieceIds={hiddenPieceIds}
        variant="joint"
      />
      <FoliageBatch
        instances={build.foliage}
        hiddenPieceIds={hiddenPieceIds}
      />
      <FoliageBatch
        instances={build.conifer}
        hiddenPieceIds={hiddenPieceIds}
        variant="pine"
      />
    </>
  );
});
