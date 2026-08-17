"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { createLandscapeSampler } from "../content/landscape/landscapeSampler";
import type { LandscapeSample } from "../content/landscape/landscapeDocument";
import {
  dutchPolderCoverPieceIdAt,
  dutchPolderLandscapeDocument,
  dutchPolderVisualTopAt,
} from "../content/scenes/dutchPolder/dutchPolderLandscapeDocument";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  dutchPolderVegetationPatchNoise,
  meadowClump,
  sampleDutchPolderVegetation,
  type DutchPolderVegetationStyle,
} from "./dutchPolderVegetation";
import { WATER_LEVEL as DUTCH_POLDER_WATER_LEVEL } from "./dutchPolderWaterModel";
import { environmentState } from "./environmentState";
import { kallurTurfStyleAt, type KallurTurfStyle } from "./kallurVegetation.ts";
import { sampleVikingGroundTraffic } from "./materialTextures";
import { registerRefractionExcluded } from "./servicePassPolicy.ts";
import { windState } from "./windState";

/**
 * A field of instanced grass tufts scattered across a circular landscape.
 *
 * Every tuft is a small fan of tapered strips, so it reads as 3D from any angle
 * without being a camera-facing billboard. The whole field is ONE draw call:
 * position, yaw and scale live in the instance matrix, and a per-instance
 * phase varies the wind. The vertex shader bends the blade tips with a cheap
 * sine, and tufts shrink smoothly into the ground past a fade distance — so
 * distant grass costs nothing and there is no popping. Cutout alpha (no
 * blending) keeps it depth-correct and sort-free.
 */
function bladeHash(seed: number): number {
  const value = Math.sin(seed * 45.233 + 9.17) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Vertex attributes are a HARD budget, not a style choice: WebGL only promises
 * 16 slots, `instanceMatrix` eats four of them by itself, and three prepends
 * `position`/`normal`/`uv` to every ShaderMaterial. Seven per-vertex floats
 * therefore ship as two packed vectors rather than four named attributes —
 * `aBlade` carries the blade's centre line and its base, `aBladeSide` carries
 * the sideways offset plus the per-blade variance in its spare lane. The shader
 * unpacks them into readable locals, which costs nothing.
 */
function makeTuftGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // vec4(centreX, centreZ, baseX, baseZ)
  const blade: number[] = [];
  // vec3(sideX, sideZ, variance)
  const bladeSide: number[] = [];
  let vertex = 0;
  // Each blade is a curved two-quad strip (base → mid → tip) that arcs over in
  // its own direction, so the tuft reads as bending grass, not straight spikes.
  // Blades vary in lean, height, curve and width; a per-blade value drives
  // colour and sway variation in the shaders.
  const blades = Array.from({ length: 12 }, (_, index) => {
    const heightVariation = bladeHash(index * 3 + 1);
    const baseVariation = bladeHash(index * 3 + 2);
    const baseAngle = index * 2.399963 + baseVariation * 0.7;
    const baseRadius = index === 0 ? 0 : 0.045 + baseVariation * 0.23;
    return {
      yaw: index * 2.399963 + bladeHash(index * 3 + 3) * 0.55,
      height: 0.66 + heightVariation * 0.48,
      curve: 0.24 + bladeHash(index * 5 + 4) * 0.38,
      width: 0.026 + bladeHash(index * 7 + 5) * 0.022,
      baseX: Math.cos(baseAngle) * baseRadius,
      baseZ: Math.sin(baseAngle) * baseRadius,
    };
  });
  for (const [bladeIndex, strip] of blades.entries()) {
    const dirX = Math.cos(strip.yaw);
    const dirZ = Math.sin(strip.yaw);
    const perpX = -dirZ;
    const perpZ = dirX;
    const midOffset = strip.curve * strip.height * 0.2;
    const tipOffset = strip.curve * strip.height * 0.55;
    const variance = bladeHash(bladeIndex + 1);
    const pushRow = (
      offsetX: number,
      offsetY: number,
      offsetZ: number,
      halfWidth: number,
      uvY: number,
    ): void => {
      const leftX = -perpX * halfWidth;
      const leftZ = -perpZ * halfWidth;
      positions.push(offsetX + leftX, offsetY, offsetZ + leftZ);
      uvs.push(0, uvY);
      blade.push(offsetX, offsetZ, strip.baseX, strip.baseZ);
      bladeSide.push(leftX, leftZ, variance);
      const rightX = perpX * halfWidth;
      const rightZ = perpZ * halfWidth;
      positions.push(offsetX + rightX, offsetY, offsetZ + rightZ);
      uvs.push(1, uvY);
      blade.push(offsetX, offsetZ, strip.baseX, strip.baseZ);
      bladeSide.push(rightX, rightZ, variance);
    };
    pushRow(strip.baseX, 0, strip.baseZ, strip.width, 0);
    pushRow(
      strip.baseX + dirX * midOffset,
      strip.height * 0.52,
      strip.baseZ + dirZ * midOffset,
      strip.width * 0.9,
      0.52,
    );
    pushRow(
      strip.baseX + dirX * tipOffset,
      strip.height,
      strip.baseZ + dirZ * tipOffset,
      strip.width * 0.66,
      1,
    );
    indices.push(
      vertex, vertex + 1, vertex + 3, vertex, vertex + 3, vertex + 2,
      vertex + 2, vertex + 3, vertex + 5, vertex + 2, vertex + 5, vertex + 4,
    );
    vertex += 6;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aBlade", new Float32BufferAttribute(blade, 4));
  geometry.setAttribute("aBladeSide", new Float32BufferAttribute(bladeSide, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * A reed clump — a plant that is mostly LEAF.
 *
 * The old reed was a grass tuft with its blades collapsed onto a centre line:
 * a bare straw, which is why a stand of them read as dry pasta. In a real
 * Phragmites bed the stems are perhaps a third of the visible mass. The rest is
 * ribbon leaves twenty to fifty centimetres long hanging off the stem at thirty
 * to sixty degrees, plus the nodding panicle that gives an August reedbed its
 * purple-grey haze above the green. None of that existed, and no amount of
 * shader work on a bare line was going to produce it.
 *
 * Every element — stem, leaf, panicle strip — carries its own centre line and
 * sideways offset, so the shared minimum-screen-width widening works on all of
 * them alike, and carries its STEM's identity, so a dead stem holds dead leaves
 * instead of green ones on straw.
 */
type StripRow = { x: number; y: number; z: number; half: number; v: number };

/**
 * Shared builder for every marsh plant: reed, iris and loosestrife are all made
 * of tapering strips, and they all feed the same shader. `part` names what the
 * strip is — 0 stalk, 1 leaf, 2 flowering head — and the palette that goes with
 * it is chosen per species by uniform, so three plants cost one shader program.
 */
function createMarshBuilder(nominalTop: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // vec4(centreX, centreZ, height fraction on the plant, per-element variance)
  const element: number[] = [];
  // vec4(sideX, sideZ, part, per-stem variance)
  const elementSide: number[] = [];
  let vertex = 0;

  const strip = (
    rows: readonly StripRow[],
    perpX: number,
    perpZ: number,
    part: number,
    partVar: number,
    stemVar: number,
  ): void => {
    const start = vertex;
    for (const row of rows) {
      const sideX = -perpX * row.half;
      const sideZ = -perpZ * row.half;
      const height = Math.max(0, Math.min(1, row.y / nominalTop));
      positions.push(row.x + sideX, row.y, row.z + sideZ);
      uvs.push(0, row.v);
      element.push(row.x, row.z, height, partVar);
      elementSide.push(sideX, sideZ, part, stemVar);
      positions.push(row.x - sideX, row.y, row.z - sideZ);
      uvs.push(1, row.v);
      element.push(row.x, row.z, height, partVar);
      elementSide.push(-sideX, -sideZ, part, stemVar);
      vertex += 2;
    }
    for (let row = 0; row + 1 < rows.length; row += 1) {
      const corner = start + row * 2;
      indices.push(corner, corner + 1, corner + 3, corner, corner + 3, corner + 2);
    }
  };

  const finish = (): BufferGeometry => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("aBlade", new Float32BufferAttribute(element, 4));
    geometry.setAttribute("aBladeSide", new Float32BufferAttribute(elementSide, 4));
    geometry.setIndex(indices);
    return geometry;
  };

  return { strip, finish };
}

function makeReedGeometry(): BufferGeometry {
  const nominalTop = 1.12;
  const { strip: pushStrip, finish } = createMarshBuilder(nominalTop);
  const STEMS = 7;
  const LEAVES = 3;
  for (let stem = 0; stem < STEMS; stem += 1) {
    const stemVar = bladeHash(stem * 5 + 2);
    const baseAngle = stem * 2.399963 + bladeHash(stem * 3 + 1) * 0.8;
    const baseRadius = stem === 0 ? 0 : 0.06 + bladeHash(stem * 3 + 2) * 0.20;
    const baseX = Math.cos(baseAngle) * baseRadius;
    const baseZ = Math.sin(baseAngle) * baseRadius;
    const height = 0.84 + stemVar * 0.28;
    // Каждый стебель слегка кренится в свою сторону — вертикальная стена
    // одинаковых свечек и делает заросли похожими на штакетник.
    const leanAngle = bladeHash(stem * 7 + 3) * Math.PI * 2;
    const lean = 0.03 + bladeHash(stem * 7 + 4) * 0.09;
    const leanX = Math.cos(leanAngle) * lean;
    const leanZ = Math.sin(leanAngle) * lean;
    const axisAt = (fraction: number): readonly [number, number] => [
      baseX + leanX * fraction * fraction,
      baseZ + leanZ * fraction * fraction,
    ];

    // Стебель: настоящая толщина Phragmites — 6–12 мм у основания.
    const [midX, midZ] = axisAt(0.52);
    const [tipX, tipZ] = axisAt(1);
    pushStrip(
      [
        { x: baseX, y: 0, z: baseZ, half: 0.0055, v: 0 },
        { x: midX, y: height * 0.52, z: midZ, half: 0.0044, v: 0.52 },
        { x: tipX, y: height, z: tipZ, half: 0.0028, v: 1 },
      ],
      -Math.sin(leanAngle),
      Math.cos(leanAngle),
      0,
      stemVar,
      stemVar,
    );

    for (let leaf = 0; leaf < LEAVES; leaf += 1) {
      const leafVar = bladeHash(stem * 31 + leaf * 7 + 5);
      // Листья сидят поочерёдно и расходятся по азимуту, а не веером в одну
      // плоскость.
      const attach = 0.30 + leaf * 0.19 + leafVar * 0.06;
      const [ax, az] = axisAt(attach);
      const azimuth = baseAngle + leaf * 2.2 + leafVar * 1.1;
      const outX = Math.cos(azimuth);
      const outZ = Math.sin(azimuth);
      const length = (0.30 + leafVar * 0.17) * (1.15 - attach * 0.45);
      const attachY = height * attach;
      pushStrip(
        [
          { x: ax, y: attachY, z: az, half: 0.016, v: 0 },
          {
            x: ax + outX * length * 0.55,
            y: attachY - length * 0.14,
            z: az + outZ * length * 0.55,
            half: 0.014,
            v: 0.55,
          },
          {
            x: ax + outX * length * 0.95,
            y: attachY - length * 0.55,
            z: az + outZ * length * 0.95,
            half: 0.002,
            v: 1,
          },
        ],
        -outZ,
        outX,
          1,
        leafVar,
        stemVar,
      );
    }

    // Перезимовавшая метёлка ПОНИКАЕТ: она висит на одну сторону и выгибается
    // книзу. Первый заход разводил пряди на 90° — получалась звёздочка-антенна,
    // и на удалении, где минимальная экранная ширина раздувает каждую прядь до
    // пары пикселей, поле таких звёздочек забивало весь кадр. Теперь все пряди
    // одного стебля клонятся в одну сторону и уходят вниз, их три вместо
    // четырёх, и держит их меньшинство стеблей: за зиму семя облетает.
    if (stemVar > 0.62) {
      const plume = 0.16 + stemVar * 0.07;
      const nodAzimuth = baseAngle + stemVar * 2.4;
      for (let strand = 0; strand < 3; strand += 1) {
        const strandVar = bladeHash(stem * 53 + strand * 11 + 6);
        const azimuth = nodAzimuth + (strand - 1) * 0.26 + strandVar * 0.18;
        const outX = Math.cos(azimuth);
        const outZ = Math.sin(azimuth);
        const nod = plume * (0.55 + strandVar * 0.4);
        pushStrip(
          [
            { x: tipX, y: height, z: tipZ, half: 0.0025, v: 0 },
            {
              x: tipX + outX * nod * 0.45,
              y: height + plume * 0.5,
              z: tipZ + outZ * nod * 0.45,
              half: 0.008,
              v: 0.48,
            },
            {
              x: tipX + outX * nod,
              y: height + plume * 0.6,
              z: tipZ + outZ * nod,
              half: 0.005,
              v: 0.78,
            },
            {
              x: tipX + outX * nod * 1.4,
              y: height + plume * 0.38,
              z: tipZ + outZ * nod * 1.4,
              half: 0.001,
              v: 1,
            },
          ],
          -outZ,
          outX,
          2,
          strandVar,
          stemVar,
        );
      }
    }
  }

  return finish();
}

/**
 * Yellow flag iris — the plant that belongs in the strip our ditches rendered
 * as naked earth. It stands in up to forty centimetres of water in dense clonal
 * colonies: a FAN of flat sword leaves rising straight from the rhizome, no
 * stem leaves at all, plus a flower stalk carrying two or three yellow flags in
 * June. The fan is what reads at distance — a shape nothing else on the bank
 * has, so it separates the waterline from the reed behind it.
 */
function makeIrisGeometry(): BufferGeometry {
  const { strip: pushStrip, finish } = createMarshBuilder(1.0);
  const LEAVES = 9;
  for (let leaf = 0; leaf < LEAVES; leaf += 1) {
    const leafVar = bladeHash(leaf * 9 + 3);
    // Веер: листья лежат почти в одной плоскости, слегка расходясь.
    const fanAngle = 0.35 + leafVar * 0.45;
    const azimuth = fanAngle + (leaf % 2 === 0 ? 0 : Math.PI) + (leaf - LEAVES / 2) * 0.16;
    const outX = Math.cos(azimuth);
    const outZ = Math.sin(azimuth);
    const height = 0.62 + leafVar * 0.36;
    // Мечевидный лист выгибается наружу к концу, но не свисает.
    const arc = 0.10 + leafVar * 0.16;
    pushStrip(
      [
        { x: 0, y: 0, z: 0, half: 0.011, v: 0 },
        { x: outX * arc * 0.3, y: height * 0.5, z: outZ * arc * 0.3, half: 0.014, v: 0.5 },
        { x: outX * arc, y: height * 0.88, z: outZ * arc, half: 0.010, v: 0.86 },
        { x: outX * arc * 1.5, y: height, z: outZ * arc * 1.5, half: 0.001, v: 1 },
      ],
      -outZ,
      outX,
      1,
      leafVar,
      leafVar,
    );
  }
  // Цветонос: чуть выше листьев, с парой флагов наверху.
  for (let stalk = 0; stalk < 2; stalk += 1) {
    const stalkVar = bladeHash(stalk * 17 + 7);
    const lean = 0.05 + stalkVar * 0.07;
    const azimuth = stalkVar * Math.PI * 2;
    const outX = Math.cos(azimuth);
    const outZ = Math.sin(azimuth);
    const height = 0.86 + stalkVar * 0.22;
    pushStrip(
      [
        { x: 0, y: 0, z: 0, half: 0.006, v: 0 },
        { x: outX * lean, y: height, z: outZ * lean, half: 0.004, v: 1 },
      ],
      -outZ,
      outX,
      0,
      stalkVar,
      stalkVar,
    );
    for (let flag = 0; flag < 3; flag += 1) {
      const flagVar = bladeHash(stalk * 23 + flag * 5 + 11);
      const flagAzimuth = azimuth + flag * 2.09 + flagVar * 0.6;
      const fx = Math.cos(flagAzimuth);
      const fz = Math.sin(flagAzimuth);
      const drop = 0.05 + flagVar * 0.03;
      // Флаг ириса — отогнутая книзу доля, а не звёздочка.
      pushStrip(
        [
          { x: outX * lean, y: height, z: outZ * lean, half: 0.006, v: 0 },
          {
            x: outX * lean + fx * drop * 0.9,
            y: height + drop * 0.35,
            z: outZ * lean + fz * drop * 0.9,
            half: 0.022,
            v: 0.55,
          },
          {
            x: outX * lean + fx * drop * 1.7,
            y: height - drop * 0.55,
            z: outZ * lean + fz * drop * 1.7,
            half: 0.013,
            v: 1,
          },
        ],
        -fz,
        fx,
        2,
        flagVar,
        stalkVar,
      );
    }
  }
  return finish();
}

/**
 * Marsh marigold — the one flower that belongs beside straw reed.
 *
 * Season has to be decided once and obeyed by every plant, or the frame shows
 * something that cannot exist. Standing straw reed is LAST YEAR'S growth: it
 * holds the bank from autumn until May, when the new green finally climbs past
 * it. That pins the polder to April, and April on a Dutch ditch bank is
 * dotterbloem — a low mound of round glossy leaves with flat yellow cups sitting
 * right at the waterline. Loosestrife, which the first pass put here, is barely
 * out of the ground in April and does not flower until July; it would have been
 * a second season inside the same picture.
 */
function makeMarshMarigoldGeometry(): BufferGeometry {
  const { strip: pushStrip, finish } = createMarshBuilder(1.0);
  // Округлые прикорневые листья на коротких черешках — низкая плотная куртина,
  // а не стебель с супротивными листьями.
  const LEAVES = 7;
  for (let leaf = 0; leaf < LEAVES; leaf += 1) {
    const leafVar = bladeHash(leaf * 11 + 5);
    const azimuth = leaf * 2.399963 + leafVar * 0.7;
    const outX = Math.cos(azimuth);
    const outZ = Math.sin(azimuth);
    const reach = 0.30 + leafVar * 0.22;
    const lift = 0.30 + leafVar * 0.26;
    // Лист лежит почти горизонтально, приподнимаясь к середине и опускаясь
    // краем — округлая пластина, а не остриё.
    pushStrip(
      [
        { x: 0, y: 0.04, z: 0, half: 0.006, v: 0 },
        { x: outX * reach * 0.42, y: lift * 0.9, z: outZ * reach * 0.42, half: 0.05, v: 0.42 },
        { x: outX * reach * 0.82, y: lift, z: outZ * reach * 0.82, half: 0.06, v: 0.78 },
        { x: outX * reach, y: lift * 0.86, z: outZ * reach, half: 0.028, v: 1 },
      ],
      -outZ,
      outX,
      1,
      leafVar,
      leafVar,
    );
  }
  // Цветоносы: короткие, чуть выше листвы, каждый с плоской чашей из пяти
  // округлых долей. Именно чаша, а не звёздочка — жёлтое пятно должно читаться
  // сплошным даже в два пикселя.
  const STALKS = 5;
  for (let stalk = 0; stalk < STALKS; stalk += 1) {
    const stalkVar = bladeHash(stalk * 17 + 7);
    const azimuth = stalk * 2.399963 + stalkVar * 1.2;
    const outX = Math.cos(azimuth);
    const outZ = Math.sin(azimuth);
    const reach = 0.10 + stalkVar * 0.22;
    const height = 0.62 + stalkVar * 0.34;
    const headX = outX * reach;
    const headZ = outZ * reach;
    pushStrip(
      [
        { x: 0, y: 0.04, z: 0, half: 0.006, v: 0 },
        { x: headX * 0.6, y: height * 0.62, z: headZ * 0.6, half: 0.005, v: 0.62 },
        { x: headX, y: height, z: headZ, half: 0.004, v: 1 },
      ],
      -outZ,
      outX,
      0,
      stalkVar,
      stalkVar,
    );
    for (let petal = 0; petal < 3; petal += 1) {
      const petalVar = bladeHash(stalk * 23 + petal * 5 + 11);
      const petalAzimuth = azimuth + petal * 1.047 + petalVar * 0.3;
      const px = Math.cos(petalAzimuth);
      const pz = Math.sin(petalAzimuth);
      const cup = 0.055 + petalVar * 0.022;
      pushStrip(
        [
          { x: headX - px * cup, y: height + cup * 0.16, z: headZ - pz * cup, half: 0.012, v: 0 },
          { x: headX, y: height, z: headZ, half: 0.030, v: 0.5 },
          { x: headX + px * cup, y: height + cup * 0.16, z: headZ + pz * cup, half: 0.012, v: 1 },
        ],
        -pz,
        px,
        2,
        petalVar,
        stalkVar,
      );
    }
  }
  return finish();
}

/**
 * Yellow water-lily — the layer that was simply absent.
 *
 * Between duckweed lying on the surface and the emergent plants standing at the
 * bank there was nothing at all, so open water read as a bare plane. Nuphar
 * fills it: round leathery plates floating flat, in colonies, out where the
 * depth already refuses reed. A flat plate is also the one shape here that says
 * "still water" on its own, before any reflection is involved.
 *
 * The plates lie IN the water plane rather than on the ground, so the scatter
 * seats this species at the water level instead of on the terrain top.
 */
function makeFloatingLeafGeometry(): BufferGeometry {
  const { strip: pushStrip, finish } = createMarshBuilder(0.28);
  const PADS = 7;
  for (let pad = 0; pad < PADS; pad += 1) {
    const padVar = bladeHash(pad * 13 + 4);
    const angle = pad * 2.399963 + padVar * 0.9;
    const radius = pad === 0 ? 0 : 0.12 + padVar * 0.4;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const heading = padVar * Math.PI * 2;
    const outX = Math.cos(heading);
    const outZ = Math.sin(heading);
    const span = 0.13 + padVar * 0.075;
    // Пластина лежит на воде и чуть приподнята в середине — край подмокает и
    // прилегает, поэтому силуэт мягкий, а не как вырезанный кружок.
    const lift = 0.012 + padVar * 0.01;
    pushStrip(
      [
        { x: cx - outX * span, y: 0.004, z: cz - outZ * span, half: 0.02, v: 0 },
        { x: cx - outX * span * 0.3, y: lift, z: cz - outZ * span * 0.3, half: span * 0.86, v: 0.35 },
        { x: cx + outX * span * 0.45, y: lift, z: cz + outZ * span * 0.45, half: span * 0.78, v: 0.7 },
        { x: cx + outX * span, y: 0.004, z: cz + outZ * span, half: 0.024, v: 1 },
      ],
      -outZ,
      outX,
      1,
      padVar,
      padVar,
    );
  }
  // Цветок кубышки — маленький жёлтый шар, торчащий над водой, а не лежащий.
  for (let bloom = 0; bloom < 2; bloom += 1) {
    const bloomVar = bladeHash(bloom * 29 + 9);
    const angle = bloomVar * Math.PI * 2;
    const radius = 0.1 + bloomVar * 0.26;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    for (let face = 0; face < 2; face += 1) {
      const faceAngle = angle + face * 1.571;
      pushStrip(
        [
          { x: cx, y: 0.02, z: cz, half: 0.008, v: 0 },
          { x: cx, y: 0.055, z: cz, half: 0.026, v: 0.55 },
          { x: cx, y: 0.082, z: cz, half: 0.01, v: 1 },
        ],
        -Math.sin(faceAngle),
        Math.cos(faceAngle),
        2,
        bloomVar,
        bloomVar,
      );
    }
  }
  return finish();
}

// Deterministic hash scatter — no Math.random, so the field is identical every
// load (and safe for any replay/resume of the session).
function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Ring offsets (~1.8 m) used to look for a nearby path: grass thickens on the
// verge just off a trodden route.
const EDGE_RING: readonly (readonly [number, number])[] = [
  [1.8, 0],
  [-1.8, 0],
  [0, 1.8],
  [0, -1.8],
  [1.3, 1.3],
  [-1.3, -1.3],
];

export type GrassFieldProfile = "viking" | "dutch-polder" | "kallur";

const dutchPolderSampler = createLandscapeSampler(dutchPolderLandscapeDocument);

/**
 * One species of marsh plant: which geometry, how far it stays visible, and the
 * three palettes its parts are painted from.
 *
 * A reed is not a colour ramp away from a grass blade, so it does not share the
 * turf shader — but iris and loosestrife ARE the same construction as a reed
 * (tapering strips tagged stalk / leaf / head), so all three share one program
 * and differ only by these numbers.
 */
type MarshSpecies = {
  readonly geometry: () => BufferGeometry;
  /** Metres at which the earliest and latest clump of this species gives up. */
  readonly fade: readonly [number, number];
  /** Leaves and heads are the costly, least resolvable parts — they go first. */
  readonly leafFade: number;
  readonly headFade: number;
  readonly stalkLive: string;
  readonly stalkDead: string;
  readonly leafLive: string;
  readonly leafDead: string;
  readonly headFresh: string;
  readonly headAged: string;
  /** How floppy the leaves are relative to the stalk. */
  readonly limber: number;
  /** Darkest the litter shade may go — flat plants have no canopy above them. */
  readonly canopyFloor: number;
  /**
   * Share of clumps actually carrying their flowering head.
   *
   * The head is baked into the geometry, so without this EVERY plant flowers at
   * once — which is what turned an April ditch into a solid yellow carpet of
   * iris. Real stands flower in a minority at any one moment.
   */
  readonly bloom: number;
};

const MARSH_SPECIES: Readonly<Record<1 | 2 | 3 | 4, MarshSpecies>> = {
  // Phragmites in April: this is LAST YEAR'S stand. Straw stalks, leaves mostly
  // stripped by winter, and the plumes gone silver-grey — the fresh purple-brown
  // of a young panicle belongs to a different month and must not appear here.
  // The few green stalks are the first new shoots pushing through.
  1: {
    geometry: makeReedGeometry,
    fade: [95, 175],
    leafFade: 34,
    // Вислая прошлогодняя прядь — не силуэт, ей нечего делать на дальнем плане.
    // Держать её до 58 м было вдвое дальше, чем нужно, и минимальная экранная
    // ширина превращала даль в белую сетку.
    headFade: 24,
    stalkLive: "#77804d",
    // Перезимовавшая солома — средний тан, а не крем: заросли обязаны читаться
    // ТЁМНОЙ массой на фоне неба, иначе горизонт растворяется.
    stalkDead: "#9d8a64",
    leafLive: "#57683a",
    leafDead: "#8a784f",
    // К апрелю метёлка выгорает почти в цвет стебля. Серебро — это свежая,
    // осенняя метёлка, и оно здесь читалось как чужой яркий объект.
    headFresh: "#877c6c",
    headAged: "#948a7c",
    limber: 1.5,
    canopyFloor: 0.5,
    // Метёлку уже прореживает геометрия — здесь она проходит целиком.
    bloom: 1,
  },
  // Iris: the fan is up and green well before it flowers, so April gets sword
  // leaves and only the odd early flag.
  2: {
    geometry: makeIrisGeometry,
    fade: [46, 78],
    leafFade: 46,
    headFade: 38,
    stalkLive: "#4e6b39",
    stalkDead: "#7d7c4a",
    leafLive: "#40603a",
    leafDead: "#7f7f48",
    headFresh: "#e8bf22",
    headAged: "#c9a63a",
    limber: 0.7,
    canopyFloor: 0.5,
    // Ирис в апреле только начинает: флаг несёт считанное меньшинство.
    bloom: 0.1,
  },
  // Marsh marigold: dark glossy leaves, flat buttery-yellow cups. Low enough
  // that it gives up its detail early — it is a colour accent at the waterline,
  // not a silhouette.
  3: {
    geometry: makeMarshMarigoldGeometry,
    fade: [26, 46],
    leafFade: 24,
    headFade: 34,
    stalkLive: "#4c6533",
    stalkDead: "#7d7448",
    leafLive: "#31502b",
    leafDead: "#6d6c3c",
    headFresh: "#f0c41c",
    headAged: "#d2ad2f",
    limber: 0.6,
    canopyFloor: 0.5,
    // Калужница в апреле в разгаре — она и есть весь цвет этого кадра.
    bloom: 0.72,
  },
  // Кубышка: тёмная кожистая пластина на воде. Гаснет рано — это цветовое
  // пятно на поверхности, а не силуэт, и держать её вдали нечем.
  4: {
    geometry: makeFloatingLeafGeometry,
    fade: [30, 52],
    leafFade: 30,
    headFade: 22,
    stalkLive: "#3f5c34",
    stalkDead: "#5f6b3c",
    leafLive: "#33512f",
    leafDead: "#59653a",
    headFresh: "#edc92a",
    headAged: "#c9ab35",
    limber: 0.2,
    // Пластина лежит плашмя, у неё нет высоты над корнем — общий пол полога
    // покрасил бы её в ноль, будто она в собственной тени.
    canopyFloor: 0.94,
    bloom: 0.3,
  },
};

function makeMarshMaterial(species: MarshSpecies): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCamera: { value: new Vector3() },
      uSunDir: { value: new Vector3(0.4, 0.7, 0.5) },
      uLightColor: { value: new Color(1, 1, 1) },
      uSheen: { value: new Color(0, 0, 0) },
      uTransmit: { value: new Color(0, 0, 0) },
      uWind: { value: 1 },
      uWindDir: { value: new Vector2(0.71, -0.71) },
      uViewport: { value: new Vector2(1280, 720) },
      uMinBladePixels: { value: 2.5 },
      uFadeStart: { value: species.fade[0] },
      uFadeEnd: { value: species.fade[1] },
      uLeafFade: { value: species.leafFade },
      uHeadFade: { value: species.headFade },
      uLimber: { value: species.limber },
      uBloom: { value: species.bloom },
      uCanopyFloor: { value: species.canopyFloor },
      uStalkLive: { value: new Color(species.stalkLive) },
      uStalkDead: { value: new Color(species.stalkDead) },
      uLeafLive: { value: new Color(species.leafLive) },
      uLeafDead: { value: new Color(species.leafDead) },
      uHeadFresh: { value: new Color(species.headFresh) },
      uHeadAged: { value: new Color(species.headAged) },
    },
    side: DoubleSide,
    transparent: false,
    alphaTest: 0.5,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCamera;
      uniform vec3 uSunDir;
      uniform float uWind;
      uniform vec2 uWindDir;
      uniform vec2 uViewport;
      uniform highp float uMinBladePixels;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uLeafFade;
      uniform float uHeadFade;
      uniform float uLimber;
      uniform float uBloom;
      uniform float uCanopyFloor;
      attribute vec4 aBlade;      // xz центр элемента, z доля высоты, w разброс элемента
      attribute vec4 aBladeSide;  // xy боковое смещение, z часть, w разброс стебля
      attribute vec4 aTuft;       // фаза, личное гашение, затенённость, влажность
      varying vec2 vUv;
      varying float vShade;
      varying float vDead;
      varying float vPart;
      varying float vElementVar;
      varying float vTransmit;
      varying highp float vQuadHalfPixels;
      void main() {
        vec2 centre = aBlade.xy;
        float heightFrac = aBlade.z;
        float elementVar = aBlade.w;
        vec2 side = aBladeSide.xy;
        float part = aBladeSide.z;
        float stemVar = aBladeSide.w;
        float phase = aTuft.x;
        float personalRoll = aTuft.y;
        float ambient = aTuft.z;
        float deadChance = aTuft.w;
        vUv = uv;
        vPart = part;
        vElementVar = elementVar;

        vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 world = instanceMatrix * vec4(position, 1.0);
        float dist = length(origin.xyz - uCamera);

        float isStalk = step(part, 0.5);
        float isLeaf = step(0.5, part) * step(part, 1.5);
        float isHead = step(1.5, part);

        // Каждая куртина гаснет на своей дистанции: общее окно заставляло
        // тысячи стеблей сжиматься разом, и это читалось как «мир дышит».
        float personal = mix(uFadeStart, uFadeEnd, personalRoll);
        float span = max(1.5, (uFadeEnd - uFadeStart) * 0.07);
        float clumpFade = 1.0 - smoothstep(personal, personal + span, dist);

        // Листья и соцветия — самая дорогая по перекрытию и самая
        // неразличимая вдали часть растения, поэтому уходят первыми и
        // ПОШТУЧНО: у каждого элемента своя дистанция внутри полосы, так что
        // крона редеет, а не схлопывается целиком. Силуэт стебля живёт до
        // кромки мира — вертикальную линию зарослей ничем на грунте не
        // заменишь.
        float leafCut = mix(uLeafFade * 0.55, uLeafFade * 1.45, elementVar);
        float headCut = mix(uHeadFade * 0.6, uHeadFade * 1.4, elementVar);
        // Живой или прошлогодний — жребий бросается НА СТЕБЕЛЬ, поэтому мёртвый
        // стебель несёт мёртвые листья, а не зелёные на соломе.
        float deadRoll = fract(sin(phase * 3.13 + stemVar * 11.7) * 43758.5453);
        float dead = step(deadRoll, clamp(deadChance, 0.0, 1.0));
        vDead = dead;
        // И почти без листьев: прошлогодний стебель стоит зиму голым, ветер
        // обрывает с него ленты, остаются единицы. Соломенная стена тростника —
        // это стебли, а не листва, и без этого она выглядит летней, только
        // перекрашенной.
        float leafKept = mix(1.0, step(elementVar, 0.2), dead);
        // Цветёт меньшинство: соцветие вшито в геометрию, поэтому без этого
        // жребия расцветал КАЖДЫЙ экземпляр разом.
        float bloomRoll = fract(sin(phase * 9.71 + stemVar * 5.31) * 24634.6345);
        float inBloom = step(bloomRoll, uBloom);
        float alive = isStalk
          + isLeaf * step(dist, leafCut) * leafKept
          + isHead * step(dist, headCut) * inBloom;

        vec3 local = position * clumpFade * alive;
        vec2 centreXZ = centre * clumpFade * alive;

        // Cutout-полоска уже пикселя мерцает, поэтому расширяем её вокруг
        // СОБСТВЕННОЙ осевой линии до минимальной экранной ширины.
        vec2 sideXZ = local.xz - centreXZ;
        vec4 centreClip = projectionMatrix * viewMatrix
          * instanceMatrix * vec4(centreXZ.x, local.y, centreXZ.y, 1.0);
        vec4 edgeClip = projectionMatrix * viewMatrix
          * instanceMatrix * vec4(local.x, local.y, local.z, 1.0);
        vec2 centrePx = centreClip.xy / max(centreClip.w, 1e-4) * uViewport * 0.5;
        vec2 edgePx = edgeClip.xy / max(edgeClip.w, 1e-4) * uViewport * 0.5;
        float halfPixels = length(edgePx - centrePx);
        float widen = clamp(uMinBladePixels * 0.5 / max(halfPixels, 1e-4), 1.0, 16.0);
        local.xz = centreXZ + sideXZ * widen;
        vQuadHalfPixels = halfPixels * widen;

        vec4 shifted = instanceMatrix * vec4(local, 1.0);

        // Ветер: бегущий фронт порыва вдоль общего вектора, а не общий вздох.
        float sway = sin(uTime * 1.5 + phase + stemVar * 5.7 + world.x * 0.25 + world.z * 0.2);
        float along = dot(world.xz, uWindDir);
        float gust = sin(along * 0.39 - uTime * 2.7) * 0.5 + 0.5;
        gust *= 0.55 + 0.45 * sin(along * 0.07 - uTime * 0.6);
        // Стебель гнётся от основания; лист и метёлка хлещут концом.
        float stalkProfile = pow(max(heightFrac, 0.0), 1.3);
        float looseProfile = heightFrac * (0.35 + 0.65 * uv.y);
        float profile = mix(stalkProfile, looseProfile, min(1.0, isLeaf + isHead));
        float limber = mix(0.38, uLimber, min(1.0, isLeaf + isHead));
        float bend = profile * (0.12 + gust * 0.2) * sway * uWind * limber;
        shifted.xz += uWindDir * bend;
        // Постоянный снос: в зарослях лист СТОИТ отвёрнутым по ветру, он
        // крутится на влагалище, а не только качается туда-обратно.
        shifted.xz += uWindDir * isLeaf * uv.y * gust * 0.05 * uWind;

        // Затенение по метрам над корнем: подстилка тёмная у любого растения,
        // а запечённая затенённость застройки гаснет с высотой — изгородь
        // затеняет корни, а не макушки.
        float aboveRoot = shifted.y - origin.y;
        float canopy = mix(uCanopyFloor, 1.0, smoothstep(0.0, 0.42, aboveRoot));
        float bakedAmbient = mix(ambient, 1.0, smoothstep(0.1, 0.9, aboveRoot));
        vShade = canopy * bakedAmbient * (0.86 + stemVar * 0.26);

        vec3 viewDir = normalize(shifted.xyz - uCamera);
        vTransmit = pow(max(0.0, dot(viewDir, uSunDir)), 4.0);

        gl_Position = projectionMatrix * viewMatrix * shifted;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform vec3 uStalkLive;
      uniform vec3 uStalkDead;
      uniform vec3 uLeafLive;
      uniform vec3 uLeafDead;
      uniform vec3 uHeadFresh;
      uniform vec3 uHeadAged;
      uniform vec3 uLightColor;
      uniform vec3 uSheen;
      uniform vec3 uTransmit;
      uniform highp float uMinBladePixels;
      varying vec2 vUv;
      varying float vShade;
      varying float vDead;
      varying float vPart;
      varying float vElementVar;
      varying float vTransmit;
      varying highp float vQuadHalfPixels;
      void main() {
        float isStalk = step(vPart, 0.5);
        float isLeaf = step(0.5, vPart) * step(vPart, 1.5);
        float isHead = step(1.5, vPart);
        // Стебель — почти параллельная линия; лист сходит на остриё; соцветие
        // сужается к макушке.
        float stalkHalf = mix(0.46, 0.34, smoothstep(0.55, 1.0, vUv.y));
        float leafHalf = 0.5 * (1.0 - smoothstep(0.12, 1.0, vUv.y));
        float headHalf = 0.5 * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float halfWidth = isStalk * stalkHalf + isLeaf * leafHalf + isHead * headHalf;
        float minHalfWidth = min(0.5, uMinBladePixels / max(4.0 * vQuadHalfPixels, 1e-4));
        halfWidth = max(halfWidth, minHalfWidth);
        if (abs(vUv.x - 0.5) > halfWidth) discard;

        vec3 stalk = mix(uStalkLive, uStalkDead, vDead);
        vec3 leaf = mix(uLeafLive, uLeafDead, vDead);
        vec3 head = mix(uHeadFresh, uHeadAged, vDead);
        vec3 albedo = isStalk * stalk + isLeaf * leaf + isHead * head;
        // Лист темнее у влагалища и светлее к концу; соцветие наоборот
        // насыщеннее в середине.
        albedo *= 0.86 + 0.2 * vUv.y * (isStalk + isLeaf) + 0.16 * vElementVar;

        vec3 color = albedo * vShade * uLightColor;
        color += uSheen * pow(vUv.y, 2.2) * (0.4 + 0.6 * vDead);
        // Просвет: тонкий лист против солнца ярче себя же в разы; мясистый
        // стебель пропускает заметно хуже, соцветие — лучше всех.
        float thin = mix(0.3, 1.0, vUv.y) * (isStalk * 0.35 + isLeaf * 1.0 + isHead * 0.22);
        color += uTransmit * vTransmit * thin * albedo * vec3(1.35, 1.15, 0.5);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

/**
 * Grazing highlight on the blade tips at its strongest. A low light rakes
 * along a field and the tips catch it; it is scaled by the same measured
 * ground light as everything else, so it cannot outlive what casts it.
 */
const GRASS_SHEEN = 0.13;

export function GrassField({
  worldRadius,
  center,
  pieces,
  count = 26000,
  // Viking turf must resolve into the painted ground at distance.  These are
  // deliberately the same muted olive family as viking-ground, rather than
  // the yellow-green meadow palette used before.
  bladeColor = "#4d6043",
  tipColor = "#687754",
  profile = "viking",
  fadeStart = profile === "dutch-polder" ? 28 : 13,
  fadeEnd = profile === "dutch-polder" ? 52 : 27,
  windScale = profile === "dutch-polder" ? 0.42 : 1,
  hiddenPieceIds,
}: {
  worldRadius: number;
  center: readonly [number, number];
  pieces: readonly BreakablePieceDefinition[];
  count?: number;
  bladeColor?: string;
  tipColor?: string;
  profile?: GrassFieldProfile;
  fadeStart?: number;
  fadeEnd?: number;
  windScale?: number;
  hiddenPieceIds?: ReadonlySet<string>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const reedRef = useRef<InstancedMesh>(null);
  const irisRef = useRef<InstancedMesh>(null);
  const herbRef = useRef<InstancedMesh>(null);
  const lilyRef = useRef<InstancedMesh>(null);
  const { camera } = useThree();

  const geometry = useMemo(() => makeTuftGeometry(), []);

  // Болотные растения живут только в польдере, и каждое — свой меш со своей
  // геометрией. Один меш на все виды был именно тем, из-за чего тростник
  // приходилось изображать травинкой со схлопнутыми боками.
  const marsh = profile === "dutch-polder";
  const marshParts = useMemo(() => {
    if (!marsh) return null;
    const build = (kind: 1 | 2 | 3 | 4) => {
      const species = MARSH_SPECIES[kind];
      return { geometry: species.geometry(), material: makeMarshMaterial(species) };
    };
    return { reed: build(1), iris: build(2), herb: build(3), lily: build(4) };
  }, [marsh]);

  // Indexed by kind - 1, so the scatter can address them by species number.
  const marshGeometries = useMemo(
    () =>
      marshParts
        ? [
            marshParts.reed.geometry,
            marshParts.iris.geometry,
            marshParts.herb.geometry,
            marshParts.lily.geometry,
          ]
        : [],
    [marshParts],
  );

  // Бюджеты РАЗДЕЛЬНЫЕ, иначе дёрн съедает всё: он занимает 87% площади, и при
  // общем счётчике поясу доставалось около 4% инстансов — на плотные заросли
  // этого не хватает никогда. Перераспределение, а не увеличение: сумма
  // по-прежнему `count`.
  const budgets = useMemo(() => {
    if (!marsh) return { turf: count, reed: 0, iris: 0, herb: 0, lily: 0 };
    // Доли подобраны по ПЛОТНОСТИ НА КВАДРАТНЫЙ МЕТР, а не на глаз: тростник
    // занимает 8.5% растительной площади, ирис 3.0%, дербенник 3.5%, дёрн 85%.
    // Равные доли бюджета дали бы болотным видам плотность выше дёрна — с
    // дербенником так и вышло, и берег стал сплошным пурпурным ковром вместо
    // редких свечей. Тростник стоит стеной (~27 стеблей на м²), ирис колониями,
    // дербенник — примерно куст на два метра.
    const reed = Math.round(count * 0.24);
    const iris = Math.round(count * 0.028);
    const herb = Math.round(count * 0.012);
    const lily = Math.round(count * 0.016);
    return { turf: count - reed - iris - herb - lily, reed, iris, herb, lily };
  }, [marsh, count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCamera: { value: new Vector3() },
          uLightColor: { value: new Color(1, 1, 1) },
          uSheen: { value: new Color(0, 0, 0) },
          // Просвет: тонкий лист против солнца ярче себя же в разы. Без этого
          // свет был скалярным множителем, и заросли на контровом свете
          // получались ТЕМНЕЕ, чем обязаны быть.
          uTransmit: { value: new Color(0, 0, 0) },
          uSunDir: { value: new Vector3(0.4, 0.7, 0.5) },
          uWind: { value: 1 },
          uWindDir: { value: new Vector2(0.71, -0.71) },
          uViewport: { value: new Vector2(1280, 720) },
          uMinBladePixels: { value: 2.5 },
          uFadeStart: { value: fadeStart },
          uFadeEnd: { value: fadeEnd },
          // Тростник виден через весь польдер: радиус мира 79 м, значит по
          // земле максимум ~158 м. Пояс обязан дожить до кромки — вертикальный
          // силуэт против неба ничем на грунте не заменишь.
          uTallFadeStart: { value: 95 },
          uTallFadeEnd: { value: 175 },
          uHighlandVisibility: { value: profile === "dutch-polder" ? 1 : 0 },
          uBase: { value: new Color(bladeColor) },
          uTip: { value: new Color(tipColor) },
          // A dry blade in the village is worn olive, not pale straw: the
          // ground texture stands in for this grass beyond its render range.
          uBaseDry: {
            value: new Color(
              profile === "viking" ? "#4a583d" : profile === "kallur" ? "#6a6d3f" : "#6f6a37",
            ),
          },
          uTipDry: {
            value: new Color(
              profile === "viking" ? "#65714c" : profile === "kallur" ? "#9b9a5e" : "#bcae63",
            ),
          },
          uReedBase: { value: new Color("#596331") },
          uReedTip: { value: new Color("#a5a05b") },
          uReedBaseDry: { value: new Color("#66583a") },
          uReedTipDry: { value: new Color("#b6a264") },
          // Distance convergence: blades melt into the turf's own colour just
          // before their fade, so no line marks where instances end and the
          // ground material takes over. Zero for worlds that predate it.
          uTurfTone: { value: new Color("#6d7046") },
          uTurfBlend: { value: profile === "kallur" ? 0.65 : 0 },
        },
        side: DoubleSide,
        transparent: false,
        alphaTest: 0.5,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uCamera;
          uniform vec3 uSunDir;
          uniform float uWind;
          uniform vec2 uWindDir;
          uniform vec2 uViewport;
          uniform highp float uMinBladePixels;
          uniform float uFadeStart;
          uniform float uFadeEnd;
          uniform float uTallFadeStart;
          uniform float uTallFadeEnd;
          uniform float uHighlandVisibility;
          // Упаковано под бюджет вершинных атрибутов: 16 слотов на всё, из них
          // четыре забирает instanceMatrix и три — преппенд three.
          attribute vec4 aBlade;      // xy центр линии листа, zw его основание
          attribute vec3 aBladeSide;  // xy боковое смещение, z разброс листа
          attribute vec4 aTuft;       // фаза, личное гашение, затенённость, влажность
          attribute vec2 aTuftKind;   // вид (0 трава / 1 стебель), цветок
          varying vec2 vUv;
          varying float vShade;
          varying float vDryness;
          varying float vKind;
          varying float vFlower;
          varying float vBladeVar;
          varying float vTransmit;
          varying float vFar;
          varying highp float vQuadHalfPixels;
          void main() {
            // Распаковка в читаемые имена — компилятор её сворачивает.
            vec2 aBladeCenter = aBlade.xy;
            vec2 aBladeBase = aBlade.zw;
            float aBladeVar = aBladeSide.z;
            float aPhase = aTuft.x;
            float aFade = aTuft.y;
            float aAmbient = aTuft.z;
            float aTint = aTuft.w;
            // ЗАЖИМ ОБЯЗАТЕЛЕН. Этот шейдер знает два вида, 0 и 1, и всюду
            // смешивает по aKind, а mix за пределами [0,1] не насыщается, а
            // ЭКСТРАПОЛИРУЕТ: болотные виды 2 и 3 давали полуширину вдвое
            // больше тростниковой и цвета за гаммой — поле превращалось в
            // бежевые доски с синими осколками. Виды выше первого рисует
            // отдельный болотный меш; сюда они попадать не должны вовсе, а
            // зажим стоит как страховка от следующего нового вида.
            float aKind = clamp(aTuftKind.x, 0.0, 1.0);
            float aFlower = aTuftKind.y;
            vUv = uv;
            vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec4 world = instanceMatrix * vec4(position, 1.0);
            // Distance fade: low turf goes cheap quickly, tall stems keep their
            // silhouette right out to the rim of the world.
            //
            // This used to be gated on the tuft sitting inside the view cone,
            // which made the range depend on WHERE THE CAMERA LOOKS: panning
            // the mouse grew and shrank thousands of distant tufts at once and
            // stripped blades out of them, and the field boiled. The range now
            // depends on distance and the plant's own height alone.
            vec3 toTuft = origin.xyz - uCamera;
            float dist = length(toTuft);
            // Дальность видимости — от РОСТА самого растения, а не от высоты
            // рельефа под ним. Раньше диапазон продлевался по origin.y, и
            // тростниковый пояс — самая НИЗКАЯ часть карты — гас первым, хотя
            // двухметровый стебель видно дальше всего просто по геометрии.
            // Поворот ортонормален, поэтому длина второй колонки матрицы — это
            // ровно scale.y, то есть высота куста в метрах, и завал стебля её
            // не портит.
            float tuftHeight = length(instanceMatrix[1].xyz);
            // Пороги разводят два населения начисто: самая рослая дернина в
            // польдере — 0.66, самый низкий тростник — 1.05.
            float tall = smoothstep(0.7, 1.15, tuftHeight) * uHighlandVisibility;
            float activeFadeStart = mix(uFadeStart, uTallFadeStart, tall);
            float activeFadeEnd = mix(uFadeEnd, uTallFadeEnd, tall);
            // Каждый куст гаснет на СВОЕЙ дистанции внутри общего диапазона.
            // Общее окно заставляло тысячи стеблей сжиматься синхронно, и глаз
            // читал не «уходит деталь», а «мир дышит»: тростник отрастал при
            // подходе и втягивался в землю при отходе. Личное окно превращает
            // ту же экономию в прореживание плотности, которое не читается.
            float personalFade = mix(activeFadeStart, activeFadeEnd, aFade);
            float fadeSpan = max(1.5, (activeFadeEnd - activeFadeStart) * 0.07);
            float fade = 1.0 - smoothstep(personalFade, personalFade + fadeSpan, dist);
            // The blade darkens toward the turf tone across the second half of
            // its journey out — by the time it shrinks away it already wears
            // the ground's colour, and the hand-off is invisible.
            vFar = smoothstep(activeFadeStart * 0.5, personalFade, dist);
            // Wind: the free tip sways, each blade slightly out of phase, on top
            // of the blade's own baked-in curve.
            float sway = sin(uTime * 1.5 + aPhase + aBladeVar * 5.7 + world.x * 0.25 + world.z * 0.2);
            // Порыв идёт ВОЛНОЙ поперёк поля: длина ~16 м, скорость ~7 м/с.
            // Прежний множитель имел длину волны 125 м, то есть всё видимое
            // поле качалось в унисон — заросли читались как одна деталь, а не
            // как масса. Бегущий фронт порыва — самый сильный признак жизни в
            // польдерных съёмках, и он не стоит ничего.
            float along = dot(world.xz, uWindDir);
            float gust = sin(along * 0.39 - uTime * 2.7) * 0.5 + 0.5;
            gust *= 0.55 + 0.45 * sin(along * 0.07 - uTime * 0.6);
            float stiffness = mix(1.0, 0.38, aKind);
            // Лист гнётся как консоль, стебель — от самого основания.
            float bendProfile = mix(uv.y * uv.y, pow(uv.y, 1.3), aKind);
            float bend = bendProfile * (0.1 + gust * 0.15) * sway * uWind * stiffness;
            vec3 local = position;
            // Grass keeps the curved leaf strip. Reeds retain only a slightly
            // leaning centre line and a very narrow side offset: a real stem
            // silhouette rather than an enlarged grass leaf. Several stems
            // receive a broader panicle only at the very top.
            float panicleStem = step(0.68, aBladeVar);
            float panicleRise = smoothstep(0.72, 1.0, uv.y) * panicleStem;
            float reedSideScale = mix(0.14, 0.62, panicleRise);
            vec2 reedCenter = mix(aBladeBase, aBladeCenter, 0.24);
            vec2 reedXZ = reedCenter + aBladeSide.xy * reedSideScale;
            local.xz = mix(local.xz, reedXZ, aKind);
            // Full twelve-blade tufts are only a near-field asset. On a
            // watched distant hill, retain a deterministic few blades from
            // each existing instance and collapse the rest to degenerate
            // triangles. This preserves the seeded silhouette without paying
            // the far-field alpha-cutout cost that can starve the compositor.
            float farLod = smoothstep(personalFade * 0.55, personalFade * 0.9, dist)
              * uHighlandVisibility;
            float silhouetteBlade = step(0.66, aBladeVar);
            float bladeVisibility = mix(1.0, silhouetteBlade, farLod);
            local *= fade * bladeVisibility;
            local.y *= mix(1.0, 1.16, farLod);
            // Cutout alpha decides coverage per pixel with no partial tones, so
            // a blade narrower than a pixel does not thin out — it flips on and
            // off as the view turns, and a field of reeds boils. Widen every
            // blade about its OWN centre line until its projection is at least
            // uMinBladePixels across. The factor is exactly 1 for anything
            // already wider, so near silhouettes keep their authored shape, and
            // the cap keeps an edge-on blade from ballooning.
            vec2 centreXZ = mix(aBladeCenter, reedCenter, aKind) * fade * bladeVisibility;
            vec2 sideXZ = local.xz - centreXZ;
            vec4 centreClip = projectionMatrix * viewMatrix
              * instanceMatrix * vec4(centreXZ.x, local.y, centreXZ.y, 1.0);
            vec4 edgeClip = projectionMatrix * viewMatrix
              * instanceMatrix * vec4(local.x, local.y, local.z, 1.0);
            vec2 centrePx = centreClip.xy / max(centreClip.w, 1e-4) * uViewport * 0.5;
            vec2 edgePx = edgeClip.xy / max(edgeClip.w, 1e-4) * uViewport * 0.5;
            float halfPixels = length(edgePx - centrePx);
            float widen = clamp(uMinBladePixels * 0.5 / max(halfPixels, 1e-4), 1.0, 16.0);
            local.xz = centreXZ + sideXZ * widen;
            // Hand the achieved on-screen half-width to the fragment stage: the
            // cutout tapers the blade to a point, so a quad that is barely a
            // pixel wide still draws sub-pixel slivers near the tip.
            vQuadHalfPixels = halfPixels * widen;
            vec4 shifted = instanceMatrix * vec4(local, 1.0);
            // Гнёт ПО ВЕТРУ, а не всегда в +x с примесью +z.
            shifted.xz += uWindDir * bend;
            // Затенение полога считается по метрам над корнем, а не по uv.y.
            // По uv.y основание тридцатисантиметровой травинки было ровно таким
            // же тёмным, как основание двухметрового стебля, и травяной мат
            // светился равномерно сверху донизу — отсюда ощущение войлока.
            // Нижние сантиметры любых зарослей лежат в подстилочной тени
            // независимо от роста растения; выше неё стебель выходит на свет.
            float aboveRoot = shifted.y - origin.y;
            float canopy = mix(0.52, 1.0, smoothstep(0.0, 0.38, aboveRoot));
            // Запечённая затенённость соседней застройки тоже ГАСНЕТ С ВЫСОТОЙ:
            // изгородь и стена затеняют корни, а не макушки. Первый заход красил
            // растение целиком, и вместе с полом полога давал множитель до 0.16 —
            // берег уходил в чёрное.
            float ambient = mix(aAmbient, 1.0, smoothstep(0.1, 0.9, aboveRoot));
            vShade = canopy * ambient * (0.86 + aBladeVar * 0.28);
            // Живой стебель или прошлогодний — это ДВЕ дискретные популяции, а
            // не градиент. Непрерывная сухость красила поле в одну бежевую
            // семью; природно читается именно смесь, и её доля берётся из
            // авторской влажности места.
            float deadRoll = fract(sin(aPhase * 3.13 + aBladeVar * 11.7) * 43758.5453);
            float dead = step(deadRoll, clamp(aTint, 0.0, 1.0));
            vDryness = clamp(mix(0.10, 0.88, dead) + (aBladeVar - 0.5) * 0.16, 0.0, 1.0);
            // Просвет: смотрим ли мы НА солнце сквозь этот стебель.
            vec3 viewDir = normalize(shifted.xyz - uCamera);
            vTransmit = pow(max(0.0, dot(viewDir, uSunDir)), 4.0);
            vKind = aKind;
            vFlower = aFlower;
            vBladeVar = aBladeVar;
            gl_Position = projectionMatrix * viewMatrix * shifted;
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform vec3 uBase;
          uniform vec3 uTip;
          uniform vec3 uBaseDry;
          uniform vec3 uTipDry;
          uniform vec3 uReedBase;
          uniform vec3 uReedTip;
          uniform vec3 uReedBaseDry;
          uniform vec3 uReedTipDry;
          uniform vec3 uLightColor;
          uniform vec3 uSheen;
          uniform vec3 uTransmit;
          uniform vec3 uTurfTone;
          uniform float uTurfBlend;
          uniform highp float uMinBladePixels;
          varying vec2 vUv;
          varying float vShade;
          varying float vDryness;
          varying float vKind;
          varying float vFlower;
          varying float vBladeVar;
          varying float vTransmit;
          varying float vFar;
          varying highp float vQuadHalfPixels;
          void main() {
            // Pointed-blade cutout: discard outside a triangle tapering to the
            // tip. No blending — depth-correct and sort-free.
            float grassWidth = (1.0 - vUv.y) * 0.5;
            float reedWidth = mix(0.44, 0.36, smoothstep(0.72, 1.0, vUv.y));
            float halfWidth = mix(grassWidth, reedWidth, vKind);
            // A rare flowering tuft widens only several blade tips into tiny
            // heads. Flowers therefore inherit the grass distribution and do
            // not require another mesh, object or draw call.
            float floweringBlade = step(0.48, vBladeVar) * step(0.5, vFlower);
            float flowerHead = floweringBlade
              * smoothstep(0.76, 0.86, vUv.y)
              * (1.0 - smoothstep(0.96, 1.0, vUv.y));
            halfWidth = max(halfWidth, flowerHead * 0.3);
            // Far blades stop tapering and become parallel-sided lines about
            // uMinBladePixels wide. Near blades are untouched: their quad is
            // tens of pixels across, so this floor sits far below the taper.
            float minHalfWidth = min(0.5, uMinBladePixels / max(4.0 * vQuadHalfPixels, 1e-4));
            halfWidth = max(halfWidth, minHalfWidth);
            if (abs(vUv.x - 0.5) > halfWidth) discard;
            // Lush green blends toward dry straw per blade; dry tips catch it
            // strongest, so blades look sun-bleached at their ends.
            vec3 grassBase = mix(uBase, uBaseDry, vDryness);
            vec3 grassTip = mix(uTip, uTipDry, vDryness * 1.15);
            vec3 reedBase = mix(uReedBase, uReedBaseDry, vDryness);
            vec3 reedTip = mix(uReedTip, uReedTipDry, vDryness);
            vec3 base = mix(grassBase, reedBase, vKind);
            vec3 tip = mix(grassTip, reedTip, vKind);
            vec3 albedo = mix(base, tip, vUv.y);
            // Convergence to the ground: distant blades wear the turf's own
            // colour statistics before they melt into it.
            albedo = mix(albedo, uTurfTone, vFar * uTurfBlend);
            vec3 color = albedo * vShade * uLightColor;
            float reedHead = vKind
              * step(0.68, vBladeVar)
              * smoothstep(0.76, 0.84, vUv.y)
              * (1.0 - smoothstep(0.98, 1.0, vUv.y));
            color = mix(color, vec3(0.36, 0.29, 0.16) * uLightColor, reedHead * 0.82);
            vec3 flowerColor = vFlower < 1.5
              ? vec3(0.92, 0.74, 0.20)
              : vFlower < 2.5
                ? vec3(0.93, 0.91, 0.76)
                : vec3(0.62, 0.52, 0.76);
            color = mix(color, flowerColor * uLightColor * 1.08, flowerHead);
            // Кончики ловят низкий свет: на закате трава отдаёт тёплым, под
            // луной — холодным. Без этого она просто гасла множителем и
            // одинаково висела и в сумерках, и в темноте.
            color += uSheen * pow(vUv.y, 2.2) * (0.55 + 0.45 * vDryness);
            // Просвет. Тонкая часть листа пропускает больше, чем плотное
            // основание, а стебель тростника мясистее травяного листа и
            // пропускает заметно хуже. Свет, прошедший СКВОЗЬ лист, теряет
            // синеву — отсюда тёплый сдвиг, а не простое осветление.
            float thin = mix(0.3, 1.0, vUv.y) * mix(1.0, 0.45, vKind);
            color += uTransmit * vTransmit * thin * albedo * vec3(1.35, 1.15, 0.5);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    [bladeColor, tipColor, fadeStart, fadeEnd, profile],
  );

  // Scatter the instances once.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    // Один проход рассева наполняет все четыре меша: и вид растения, и высота
    // его посадки берутся из ОДНОЙ выборки ландшафта, так что делить проход по
    // видам означало бы сэмплировать рельеф четыре раза подряд.
    const budgetByKind = [budgets.turf, budgets.reed, budgets.iris, budgets.herb, budgets.lily];
    const meshByKind = [mesh, reedRef.current, irisRef.current, herbRef.current, lilyRef.current];
    const targets = budgetByKind.map((budget, kind) => ({
      mesh: meshByKind[kind],
      budget: meshByKind[kind] ? budget : 0,
      // vec4(phase, personal fade roll, baked ambient, dryness) per clump.
      tuft: new Float32Array(Math.max(1, budget) * 4),
      placed: 0,
    }));

    // Cover mask: 1 m cells where a solid object sits low enough that a blade
    // would poke through it — floors, decks, foundations, wall footings. Grass
    // skips these cells, so it never grows up through a wooden floor.
    //
    // Ground mask: 1 m cells where a REAL grass/soil tile exists near y=0.
    // Шумная кромка мира оставляет заливы без тайлов внутри круга рассева —
    // без этой маски пучки висели над пустотой у края.
    const blocked = new Set<string>();
    const dutchBlockers = new Map<string, Array<readonly [number, number]>>();
    const ground = new Set<string>();
    for (const piece of pieces) {
      if (
        piece.shape === "groundTile" &&
        (piece.material === "grass" || piece.material === "soil") &&
        piece.position[1] > -0.6 &&
        piece.position[1] < 0.4
      ) {
        // Ячейка зачисляется, только если ЦЕЛИКОМ внутри тайла: соседние
        // тайлы перекрываются на 6 см и добирают межтайловые ячейки, а у
        // внешней кромки трава не свисает корнями за край.
        const minX = piece.position[0] - piece.size[0] / 2 - 0.01;
        const maxX = piece.position[0] + piece.size[0] / 2 + 0.01;
        const minZ = piece.position[2] - piece.size[2] / 2 - 0.01;
        const maxZ = piece.position[2] + piece.size[2] / 2 + 0.01;
        for (let gx = Math.ceil(minX); gx + 1 <= maxX; gx += 1) {
          for (let gz = Math.ceil(minZ); gz + 1 <= maxZ; gz += 1) {
            ground.add(`${gx}:${gz}`);
          }
        }
        continue;
      }
      if (
        piece.shape === "groundTile" ||
        piece.material === "grass" ||
        piece.material === "earth" ||
        piece.material === "soil"
      ) {
        continue;
      }
      const boxes =
        piece.contactBoxes && piece.contactBoxes.length > 0
          ? piece.contactBoxes
          : [{ position: piece.position, size: piece.size }];
      for (const box of boxes) {
        const bottom = box.position[1] - box.size[1] / 2;
        const top = box.position[1] + box.size[1] / 2;
        if (profile === "viking" && (bottom > 0.75 || top < 0.05)) {
          continue;
        }
        const hx = box.size[0] / 2 + 0.2;
        const hz = box.size[2] / 2 + 0.2;
        for (let gx = Math.floor(box.position[0] - hx); gx <= Math.ceil(box.position[0] + hx); gx += 1) {
          for (let gz = Math.floor(box.position[2] - hz); gz <= Math.ceil(box.position[2] + hz); gz += 1) {
            const key = `${gx}:${gz}`;
            if (profile === "viking") {
              blocked.add(key);
            } else {
              const intervals = dutchBlockers.get(key) ?? [];
              intervals.push([bottom, top]);
              dutchBlockers.set(key, intervals);
            }
          }
        }
      }
    }

    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const euler = new Euler();
    // vec2(kind, flower) per turf tuft — kind stays 0 now that every other
    // species has its own mesh; the flower lane still rides here.
    const tuftKind = new Float32Array(Math.max(1, budgets.turf) * 2);
    const usableRadius = Math.max(4, worldRadius - 4);
    // Запечённая затенённость: трава своего света не считает и тени сцены не
    // принимает, поэтому под изгородью и у стены она светилась ровно так же,
    // как на открытом лугу — и терялось ощущение веса у всего, что стоит на
    // земле. Замыкание соседних ячеек считается ОДИН РАЗ при рассеве и уезжает
    // в инстанс-атрибут, так что в кадре это стоит ноль.
    const occlusionAt = (x: number, z: number, baseY: number): number => {
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      let closed = 0;
      let total = 0;
      for (let ox = -2; ox <= 2; ox += 1) {
        for (let oz = -2; oz <= 2; oz += 1) {
          const weight = 1 / (1 + Math.max(Math.abs(ox), Math.abs(oz)));
          total += weight;
          const key = `${gx + ox}:${gz + oz}`;
          const tall = profile !== "viking"
            ? (dutchBlockers.get(key)?.some(([, top]) => top > baseY + 0.6) ?? false)
            : blocked.has(key);
          if (tall) closed += weight;
        }
      }
      return total > 0 ? closed / total : 0;
    };
    const everyBudgetFull = () => targets.every((target) => target.placed >= target.budget);
    // Oversample candidates and keep them by a traffic-aware probability, so the
    // same instance budget lands denser on the grassy verges and sparser on the
    // worn paths, without ever exceeding the per-species budget. The polder
    // oversamples harder because the marsh bands are a thin share of the disc:
    // a uniform candidate stream fills turf long before it fills the waterline.
    const maxCandidates = count *
      (profile === "dutch-polder" ? 4 : profile === "kallur" ? 3 : 2);
    for (let index = 0; index < maxCandidates && !everyBudgetFull(); index += 1) {
      const radius = Math.sqrt(hash(index, 1)) * usableRadius;
      const angle = hash(index, 2) * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radius;
      const z = center[1] + Math.sin(angle) * radius;
      const cell = `${Math.floor(x)}:${Math.floor(z)}`;
      let groundY = 0;
      let dutchStyle: DutchPolderVegetationStyle | null = null;
      let dutchSample: LandscapeSample | null = null;
      let kallurStyle: KallurTurfStyle | null = null;
      if (profile === "dutch-polder") {
        dutchSample = dutchPolderSampler.sample(x, z);
        dutchStyle = sampleDutchPolderVegetation(dutchSample, x, z);
        if (!dutchStyle) continue;
        // Вид решается до всей остальной работы: если его меш уже полон,
        // кандидат отбрасывается, не тратя выборку высоты и затенённости.
        const target = targets[dutchStyle.kind];
        if (!target || target.placed >= target.budget) continue;
        const coverPieceId = dutchPolderCoverPieceIdAt(x, z);
        if (!coverPieceId) continue;
        if (hiddenPieceIds?.has(coverPieceId)) {
          continue;
        }
        // Плавающие пластины сидят в плоскости воды: посади их на дно —
        // и колония утонет ровно на глубину русла.
        groundY = dutchStyle.kind === 4
          ? DUTCH_POLDER_WATER_LEVEL + 0.012
          : dutchPolderVisualTopAt(x, z) + 0.025;
        const occupied = dutchBlockers.get(cell)?.some(([bottom, top]) =>
          bottom >= groundY - 1.5 && bottom <= groundY + 0.75 && top >= groundY + 0.04
        );
        if (occupied || hash(index, 7) > dutchStyle.keep) continue;
      } else if (profile === "kallur") {
        kallurStyle = kallurTurfStyleAt(x, z);
        if (!kallurStyle) continue;
        groundY = kallurStyle.groundY;
        const occupied = dutchBlockers.get(cell)?.some(([bottom, top]) =>
          bottom >= groundY - 1.5 && bottom <= groundY + 0.75 && top >= groundY + 0.04
        );
        if (occupied || hash(index, 7) > kallurStyle.keep) continue;
      } else if (blocked.has(cell) || !ground.has(cell)) {
        continue;
      }
      // Trodden routes carry little grass; the verge just off them carries the
      // most — grass grows thickest exactly where feet do not fall.
      let edge = 0;
      let height: number;
      let width: number;
      let tiltX = 0;
      let tiltZ = 0;
      if (dutchStyle) {
        height = dutchStyle.height[0] + hash(index, 3) * (dutchStyle.height[1] - dutchStyle.height[0]);
        width = dutchStyle.width[0] + hash(index, 4) * (dutchStyle.width[1] - dutchStyle.width[0]);
        if (dutchStyle.kind === 0) {
          // Рост коррелирован с тем же шумом, что и плотность: кочка держит
          // общее среднее, а не набор независимо разыгранных высот. Без этого
          // сгущение читается как «насыпали гуще», а не как выросший куст.
          height *= 0.74 + meadowClump(x, z) * 0.38;
        } else if (dutchStyle.kind === 1) {
          // Не весь тростник стоит вертикально, и к апрелю — далеко не весь.
          // Прошлогодний стебель за зиму кренится, ломается и в конце концов
          // ЛОЖИТСЯ: подножие настоящих зарослей — это мат полёглой ветоши,
          // накрывающий урез и уходящий в воду. Стебли, растущие из воды как
          // из пола, и делали кромку линейкой; лежачие её ломают, и заодно
          // сбивают любую прямую линию, которая через неё проходит.
          //
          // Ветка гнала крен ВСЕМ нетравяным видам, пока они жили в одном меше.
          // После разделения это осталось незамеченным, и веера ириса вместе с
          // калужницей тоже кренились и «ломались», хотя ирис поднимается
          // жёстким пучком от корневища, а калужница — низкая куртина.
          const lean = hash(index, 11);
          const fall = lean > 0.88
            ? 1.15 + hash(index, 12) * 0.32
            : lean > 0.72
              ? 0.5 + hash(index, 12) * 0.48
              : lean > 0.48
                ? 0.12 + hash(index, 12) * 0.3
                : 0;
          if (fall > 0) {
            const direction = hash(index, 13) * Math.PI * 2;
            tiltX = Math.cos(direction) * fall;
            tiltZ = Math.sin(direction) * fall;
            if (lean > 0.88) height *= 0.78;
            else if (lean > 0.72) height *= 0.62;
          }
        }
      } else if (kallurStyle) {
        // Short Atlantic turf. Height rides the same clump noise as density,
        // so a thick spot reads as a grown tuft, not a denser sprinkle.
        height = (0.14 + hash(index, 3) * 0.2) * (0.72 + kallurStyle.clump * 0.5);
        width = 0.85 + hash(index, 4) * 0.6;
      } else {
        const traffic = sampleVikingGroundTraffic(x, z);
        let edgeTraffic = traffic;
        for (const [ox, oz] of EDGE_RING) {
          edgeTraffic = Math.max(edgeTraffic, sampleVikingGroundTraffic(x + ox, z + oz));
        }
        const onPath = smoothstep(0.3, 0.56, traffic);
        edge = Math.min(1, Math.max(0, edgeTraffic - traffic) * 1.7);
        const keep = Math.min(1.1, 0.6 * (1 - onPath * 0.94) + edge * 0.8);
        if (hash(index, 7) > keep) continue;
        // This is managed village turf, not shoulder-high wild grass.  Wider,
        // lower fans keep the near field bushy while leaving the people and
        // buildings legible; the previous 0.42–0.92 scale made it about twice
        // as tall as the surface language can support.
        const edgeBoost = 1 + edge * 0.18;
        height = (0.20 + hash(index, 3) * 0.24) * edgeBoost;
        width = 0.92 + hash(index, 4) * 0.68;
      }
      euler.set(tiltX, hash(index, 5) * Math.PI * 2, tiltZ);
      quaternion.setFromEuler(euler);
      position.set(x, groundY, z);
      scale.set(width, height, width);
      matrix.compose(position, quaternion, scale);
      const kind = dutchStyle?.kind ?? 0;
      const target = targets[kind];
      if (!target?.mesh || target.placed >= target.budget) continue;
      const at = target.placed;
      target.mesh.setMatrixAt(at, matrix);
      const slot = at * 4;
      target.tuft[slot] = hash(index, 6) * Math.PI * 2;
      // Личная дистанция гашения. Соседи по кусту не должны исчезать вместе:
      // солится индексом, поэтому один и тот же куст всегда получает одно и то
      // же место в очереди на прореживание.
      target.tuft[slot + 1] = hash(index, 9);
      target.tuft[slot + 2] = 1 - occlusionAt(x, z, groundY) * 0.52;
      // Per-clump dryness: this is now the PROBABILITY that a given stem is last
      // year's straw rather than a colour to blend toward — the shader rolls it
      // per stem, so one clump holds both live and dead growth the way a real
      // stand does.
      target.tuft[slot + 3] = dutchStyle
        ? Math.min(1, dutchStyle.dryness + (hash(index, 8) - 0.5) * 0.22)
        : kallurStyle
          ? Math.min(1, Math.max(0, kallurStyle.dryness + (hash(index, 8) - 0.5) * 0.2))
          : Math.min(1, hash(index, 8) * (1.15 - edge * 0.5));
      if (kind === 0) {
        const flowerPatch = dutchSample
          ? dutchPolderVegetationPatchNoise(x, z, 41)
          : 1;
        const wetLine = dutchSample
          ? dutchSample.groundKind === "bank" || dutchSample.groundKind === "terrace"
          : false;
        const inNaturalPatch = !dutchSample || (wetLine ? flowerPatch > 0.4 : flowerPatch > 0.7);
        const chance = dutchStyle?.flowerChance ?? 0;
        if (inNaturalPatch && dutchStyle && hash(index, 14) < chance) {
          tuftKind[at * 2 + 1] = 1 + Math.floor(hash(index, 15) * 3);
        }
      }
      target.placed += 1;
    }
    for (const [kind, target] of targets.entries()) {
      if (!target.mesh) continue;
      target.mesh.count = target.placed;
      target.mesh.instanceMatrix.needsUpdate = true;
      const attributes = kind === 0 ? geometry : marshGeometries[kind - 1];
      if (!attributes) continue;
      attributes.setAttribute("aTuft", new InstancedBufferAttribute(target.tuft, 4));
      if (kind === 0) {
        attributes.setAttribute("aTuftKind", new InstancedBufferAttribute(tuftKind, 2));
      }
      // The bounding sphere spans the whole field (instances are not
      // individually culled), so it never wrongly disappears at the screen edge.
      target.mesh.frustumCulled = false;
    }
  }, [
    pieces,
    count,
    worldRadius,
    center,
    geometry,
    marshGeometries,
    budgets,
    profile,
    hiddenPieceIds,
  ]);

  useFrame((state) => {
    // Свет, ветер и просвет одинаковы для всей растительности: если кормить
    // болотные материалы отдельно, они разойдутся с травой на первом же
    // изменении времени суток, и берег начнёт жить в другом дне, чем луг.
    const canvas = state.gl.domElement;
    // Трава по-прежнему не участвует в освещении сцены — это ручные лопасти,
    // и своя яркость им нужна. Но БЕРЁТСЯ она теперь из общего замера, а не
    // из нарисованной кривой: `groundLightLevel` — это ровно та энергия,
    // которую в этот же кадр получили ключ, луна и полусфера, делённая на
    // полдень. Цвет приходит оттуда же, поэтому «днём белый, в сумерках
    // тёплый, ночью холодный» больше нигде не записано — так выходит само.
    //
    // Что было, когда яркость рисовали отдельно от мира: при солнце 3.5° над
    // горизонтом тростник стоял на ПОЛНОЙ полуденной яркости против 0.42 у
    // остального кадра и светился белым, а на −3° трава держала 0.69 против
    // 0.007 — стократное расхождение, поле, освещённое ничем.
    const lit = environmentState.groundLightLevel;
    // Просвет живёт только на ПРЯМОМ луче и берёт его цвет: закатное солнце
    // сквозь тростник даёт янтарь, а не белый пересвет. Низкое солнце бьёт
    // вдоль зарослей и просвечивает больше стеблей сразу, поэтому в сумерки
    // эффект сильнее — но исчезает вместе с лучом, а не вместе с ночью.
    const sunHeight = Math.max(0, environmentState.sunDirection.y);
    const grazing = 1 + 0.9 * (1 - Math.min(1, sunHeight / 0.5));
    const transmit = environmentState.dayFactor * 0.62 * grazing;
    // Блик на кончиках — скользящее отражение: он живёт, пока светило низко
    // над горизонтом, и гаснет вместе с тем, что его отбрасывает.
    const lowSun = Math.max(0, 1 - Math.min(1, sunHeight / 0.35));
    const sheen = GRASS_SHEEN * lit * lowSun;

    for (const target of [material, marshParts?.reed.material, marshParts?.iris.material, marshParts?.herb.material]) {
      if (!target) continue;
      const uniforms = target.uniforms;
      uniforms.uTime.value = state.clock.elapsedTime;
      uniforms.uCamera.value.copy(camera.position);
      uniforms.uWind.value = windState.strength * windScale;
      uniforms.uWindDir.value.set(windState.direction[0], windState.direction[1]);
      uniforms.uSunDir.value.copy(environmentState.keyLightDirection);
      // Device pixels, not CSS pixels: the adaptive render scale moves the
      // drawing buffer, and the minimum blade width has to follow it.
      uniforms.uViewport.value.set(canvas.width, canvas.height);
      uniforms.uLightColor.value
        .copy(environmentState.groundLight)
        .multiplyScalar(lit);
      uniforms.uTransmit.value
        .copy(environmentState.keyLightColor)
        .multiplyScalar(transmit);
      uniforms.uSheen.value
        .copy(environmentState.groundLight)
        .multiplyScalar(sheen);
    }
  });

  // Газон стоит на берегах НАД водой: рефракционному проходу он не нужен ни
  // картинкой, ни глубиной. Болотные части (камыш, ирис, кувшинки) остаются:
  // их стебли пересекают зеркало воды, и глубина рефракции даёт им мягкий
  // вход (§10 environmental lessons).
  useEffect(() => {
    const turf = meshRef.current;
    if (!turf) return;
    return registerRefractionExcluded(turf);
  }, []);

  // Dev-хук: минимальная экранная ширина стебля правится на живой сцене, чтобы
  // судить рябь глазами на настоящем GPU, а не по офлайн-замерам.
  // `__mamGrassMinPixels(0)` — правка выключена, `(1.5)` — как сейчас.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    const scope = window as typeof window & {
      __mamGrassMinPixels?: (pixels: number) => number;
    };
    const setMinPixels = (pixels: number) => {
      material.uniforms.uMinBladePixels.value = pixels;
      return pixels;
    };
    scope.__mamGrassMinPixels = setMinPixels;
    return () => {
      if (scope.__mamGrassMinPixels === setMinPixels) {
        delete scope.__mamGrassMinPixels;
      }
    };
  }, [material]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      for (const part of [marshParts?.reed, marshParts?.iris, marshParts?.herb, marshParts?.lily]) {
        part?.geometry.dispose();
        part?.material.dispose();
      }
    };
  }, [geometry, material, marshParts]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, Math.max(1, budgets.turf)]}
        receiveShadow={false}
        castShadow={false}
      />
      {marshParts ? (
        <>
          <instancedMesh
            ref={reedRef}
            args={[marshParts.reed.geometry, marshParts.reed.material, Math.max(1, budgets.reed)]}
            receiveShadow={false}
            castShadow={false}
          />
          <instancedMesh
            ref={irisRef}
            args={[marshParts.iris.geometry, marshParts.iris.material, Math.max(1, budgets.iris)]}
            receiveShadow={false}
            castShadow={false}
          />
          <instancedMesh
            ref={herbRef}
            args={[marshParts.herb.geometry, marshParts.herb.material, Math.max(1, budgets.herb)]}
            receiveShadow={false}
            castShadow={false}
          />
          <instancedMesh
            ref={lilyRef}
            args={[marshParts.lily.geometry, marshParts.lily.material, Math.max(1, budgets.lily)]}
            receiveShadow={false}
            castShadow={false}
          />
        </>
      ) : null}
    </>
  );
}
