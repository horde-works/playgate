"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  DataTexture,
  DepthTexture,
  Float32BufferAttribute,
  Frustum,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  Sphere,
  Texture,
  UnsignedByteType,
  UnsignedIntType,
  Uint32BufferAttribute,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";
import type {
  Camera,
  IUniform,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { Water } from "three/addons/objects/Water.js";
import { createPolderSpill } from "./DutchPolderSpill";
import { DutchPolderSpray } from "./DutchPolderSpray";
import {
  APPROACH_REACH,
  GATHER_MULTIPLIER,
  POLDER_SPILL_LIPS,
  initialSpillPower,
  polderSheetSpills,
  polderSpillApproach,
  spillAcrossAt,
  spillDrawdownAt,
  stepSpillPower,
} from "./dutchPolderSpillModel.ts";
import {
  DAMP_COLLAR_HEIGHT,
  WATER_LEVEL,
  buildWaterSheetModel,
} from "./dutchPolderWaterModel.ts";
import { environmentState } from "./environmentState";
import { performanceGovernor } from "./performanceGovernor";
import { spillPowerState } from "./spillPowerState";
import { windState } from "./windState";

const MIRROR_SIZE = 1024;
/** Refraction is read through moving water; half the drawing buffer is plenty. */
const REFRACTION_SCALE = 0.5;
const RIPPLE_TEXTURE_SIZE = 128;
const WEED_TEXTURE_SIZE = 128;
/** Surface slope of a calm ditch, in metres of rise per metre of run. */
const RIPPLE_SLOPE = 0.06;

/**
 * Each vertex's share of the drawdown, 0…1 of the peak.
 *
 * The bend across a mouth is a measured profile, and this sheet is built on
 * the CPU, so every vertex can simply be asked. Local XY is packed as
 * (worldX, -worldZ), which is what the -90° rotation about X maps back into
 * world +Z.
 */
function sagAttribute(positions: Float32Array): Float32Array {
  const share = new Float32Array(positions.length / 3);
  const lip = POLDER_SPILL_LIPS[0];
  if (!lip) return share;
  const peak = polderSpillApproach(lip).sag;
  if (peak <= 0) return share;
  for (let index = 0; index < share.length; index += 1) {
    const across = spillAcrossAt(
      lip,
      positions[index * 3],
      -positions[index * 3 + 1],
    );
    share[index] = Math.max(0, Math.min(1, spillDrawdownAt(lip, across) / peak));
  }
  return share;
}

/** Wraps the pure sheet model, which owns every number about the channels. */
function buildWaterSheet(): BufferGeometry {
  // The sheet stops where the island does. Measured against the drawn shell,
  // not against the authored shoreline, and applied at every mouth — all four
  // pour, only one of them is painted falling so far.
  const model = buildWaterSheetModel(polderSheetSpills());
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(model.positions, 3));
  geometry.setAttribute("aSag", new Float32BufferAttribute(sagAttribute(model.positions), 1));
  geometry.setAttribute("aFlow", new Float32BufferAttribute(model.flow, 2));
  geometry.setAttribute("aShape", new Float32BufferAttribute(model.shape, 2));
  geometry.setAttribute("aTangent", new Float32BufferAttribute(model.tangents, 2));
  geometry.setIndex(new Uint32BufferAttribute(model.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hashCell(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function tileableNoise(
  u: number,
  v: number,
  period: number,
  seed: number,
): number {
  const x = u * period;
  const y = v * period;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fractionX = x - cellX;
  const fractionY = y - cellY;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightY = fractionY * fractionY * (3 - 2 * fractionY);
  const wrap = (value: number) => ((value % period) + period) % period;
  const x0 = wrap(cellX);
  const x1 = wrap(cellX + 1);
  const y0 = wrap(cellY);
  const y1 = wrap(cellY + 1);
  const bottom = hashCell(x0, y0, seed) * (1 - weightX)
    + hashCell(x1, y0, seed) * weightX;
  const top = hashCell(x0, y1, seed) * (1 - weightX)
    + hashCell(x1, y1, seed) * weightX;
  return bottom * (1 - weightY) + top * weightY;
}

/**
 * Seamless capillary-ripple normals. Amplitude lives in a shader uniform, so
 * the stored map is normalised to unit slope and carries shape only.
 */
function createRippleNormals(): DataTexture {
  const size = RIPPLE_TEXTURE_SIZE;
  const heights = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const u = column / size;
      const v = row / size;
      heights[row * size + column] = tileableNoise(u, v, 4, 1) * 0.55
        + tileableNoise(u, v, 9, 2) * 0.3
        + tileableNoise(u, v, 18, 3) * 0.15;
    }
  }

  const slopes = new Float32Array(size * size * 2);
  let peak = 1e-6;
  const at = (column: number, row: number) =>
    heights[((row + size) % size) * size + ((column + size) % size)];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const dx = (at(column + 1, row) - at(column - 1, row)) * 0.5;
      const dy = (at(column, row + 1) - at(column, row - 1)) * 0.5;
      const offset = (row * size + column) * 2;
      slopes[offset] = dx;
      slopes[offset + 1] = dy;
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
    }
  }

  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const x = -slopes[index * 2] / peak;
    const y = -slopes[index * 2 + 1] / peak;
    const length = Math.hypot(x, y, 1);
    data[index * 4] = Math.round((x / length * 0.5 + 0.5) * 255);
    data[index * 4 + 1] = Math.round((y / length * 0.5 + 0.5) * 255);
    data[index * 4 + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    data[index * 4 + 3] = 255;
  }

  return finishTexture(new DataTexture(data, size, size, RGBAFormat, UnsignedByteType));
}

/**
 * Duckweed: broad rafts in red, frond grain in green, a second grain in blue.
 * Sampling the same map at two scales makes a raft that reads as thousands of
 * separate leaves rather than a painted blob.
 */
function createWeedTexture(): DataTexture {
  const size = WEED_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const u = column / size;
      const v = row / size;
      const raft = tileableNoise(u, v, 3, 11) * 0.68
        + tileableNoise(u, v, 7, 12) * 0.32;
      const frond = tileableNoise(u, v, 16, 21) * 0.6
        + tileableNoise(u, v, 43, 22) * 0.4;
      const speck = tileableNoise(u, v, 27, 31);
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(raft * 255);
      data[offset + 1] = Math.round(frond * 255);
      data[offset + 2] = Math.round(speck * 255);
      data[offset + 3] = 255;
    }
  }
  return finishTexture(new DataTexture(data, size, size, RGBAFormat, UnsignedByteType));
}

function finishTexture(texture: DataTexture): DataTexture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const surfaceVertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  /** xy: a point on the lip line, zw: the direction off the island. */
  uniform vec4 uLipLine;
  /** x: metres the brink has sagged, y: over what reach, z: half the mouth. */
  uniform vec3 uLipShape;

  attribute vec2 aFlow;
  attribute vec2 aShape;
  attribute vec2 aTangent;
  /** This vertex's share of the drawdown, 0…1 of uLipShape.x. */
  attribute float aSag;

  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec2 vFlow;
  varying vec2 vShape;
  varying vec2 vTangent;
  varying vec2 vApproach;
  varying float vEyeDepth;

  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vFlow = aFlow;
    vShape = aShape;
    vTangent = aTangent;
    worldPosition = modelMatrix * vec4(position, 1.0);

    // How close this patch of water is to going over. Everything the approach
    // does — the glass, the boil, the swept weed, the bend — is this one
    // number, so the whole thing switches off with uLipShape.x = 0.
    vec2 toLip = worldPosition.xz - uLipLine.xy;
    float along = dot(toLip, uLipLine.zw);
    float side = abs(dot(toLip, vec2(-uLipLine.w, uLipLine.z)));
    float within = 1.0 - smoothstep(uLipShape.z, uLipShape.z + 2.2, side);
    vApproach = vec2(
      clamp(1.0 + along / uLipShape.y, 0.0, 1.0),
      clamp(1.0 + along / (uLipShape.y * ${GATHER_MULTIPLIER.toFixed(2)}), 0.0, 1.0)
    ) * within;

    // The drawdown itself: the surface has to be where the brink says it is.
    // Local +Z is world +Y here.
    //
    // Shaped ACROSS the mouth by the MEASURED profile, not by an ellipse
    // fitted to it. The middle carries the whole head and sags the whole way
    // while the wings carry almost none — an ellipse says that roughly, and
    // roughly is not enough: three metres out it sank the sheet below its own
    // bed. The profile is the measured head, so it reaches zero exactly where
    // the water does and cannot overshoot it anywhere.
    //
    // It arrives as an attribute because this sheet is built on the CPU, where
    // the answer is already exact. Asking the GPU the same question meant a
    // vertex texture fetch, and texture2DLod is not a function this material
    // compiles with — the shader failed VALIDATE_STATUS outright.
    float sag = uLipShape.x * vApproach.x * vApproach.x * vApproach.x * aSag;
    worldPosition.y -= sag;
    mirrorCoord = textureMatrix * worldPosition;
    vec4 mvPosition = modelViewMatrix * vec4(position - vec3(0.0, 0.0, sag), 1.0);
    vEyeDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const surfaceFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D mirrorSampler;
  uniform sampler2D uRefractionColor;
  uniform sampler2D uRefractionDepth;
  uniform sampler2D uRipples;
  uniform sampler2D uWeed;
  uniform vec4 uLipLine;
  uniform vec3 uLipShape;
  uniform vec3 eye;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 uExtinction;
  uniform vec3 uScatterColor;
  uniform vec3 uScumColor;
  uniform vec3 uWeedColor;
  uniform vec3 uFoamColor;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uTime;
  uniform float uRippleSlope;
  uniform float uWeedCoverage;
  uniform float uDayFactor;

  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec2 vFlow;
  varying vec2 vShape;
  varying vec2 vTangent;
  varying vec2 vApproach;
  varying float vEyeDepth;

  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>

  // Distance from the eye to whatever the refraction pass drew at this pixel.
  float sceneEyeDepth(vec2 uv) {
    float clipDepth = texture2D(uRefractionDepth, uv).x;
    return -perspectiveDepthToViewZ(clipDepth, uCameraNear, uCameraFar);
  }

  vec3 sampleMirror(vec2 uv) {
    return texture2D(mirrorSampler, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
  }

  void main() {
    #include <logdepthbuf_fragment>

    vec3 toEye = eye - worldPosition.xyz;
    float viewDistance = length(toEye);
    vec3 eyeDirection = toEye / viewDistance;

    // --- surface: two octaves of capillary ripple, elongated along the canal.
    vec2 tangent = normalize(vTangent);
    vec2 bitangent = vec2(-tangent.y, tangent.x);
    // Ripple detail smaller than a pixel only aliases. Let it flatten out with
    // distance instead of boiling along the far reach of the canal.
    float rippleFade = 1.0 - smoothstep(30.0, 90.0, viewDistance);
    float glass = vApproach.x;
    // Approaching a fall the flow goes critical, and a capillary wave simply
    // CANNOT travel upstream against it any more: the ripple is swept out and
    // the last few metres turn to mirror. This is the cue that reads as speed.
    float amplitude = uRippleSlope * rippleFade * (1.0 - 0.88 * glass * glass);
    // What ripple survives is drawn out along the flow and rushes.
    vec2 coarseUv = vec2(
      (vFlow.x - uTime * (0.055 + 0.42 * glass)) / (3.4 * (1.0 + 2.5 * glass)),
      vFlow.y / 1.6
    );
    // Right where Froude crosses one, the waves the bed makes stop travelling:
    // transverse ridges STANDING in the world while the water pours through
    // them. Not ripple moving faster — a different thing, and it is the boil.
    float boil = smoothstep(0.15, 0.6, glass) * (1.0 - smoothstep(0.74, 0.99, glass));
    vec2 rushUv = vec2(
      (vFlow.x - uTime * 0.13) / 1.15,
      (vFlow.y + uTime * 0.02) / 0.55
    );
    // Standing, not frozen: a real standing wave holds its place over the bed
    // and breathes. Its phase moves; the wave does not travel.
    vec2 standUv = vec2(
      vFlow.x / 0.44 + sin(uTime * 0.9 + vFlow.y * 0.7) * 0.06,
      vFlow.y / 2.6
    );
    vec2 fineUv = mix(rushUv, standUv, boil);
    vec2 fineSlope = texture2D(uRipples, fineUv).xy * 2.0 - 1.0;
    vec2 slope = (texture2D(uRipples, coarseUv).xy * 2.0 - 1.0) * amplitude
      + fineSlope * (amplitude * 0.55 + uRippleSlope * rippleFade * 1.9 * boil);
    vec2 worldSlope = tangent * slope.x + bitangent * slope.y;
    // The bend of the drawdown is part of the surface, not of the texture: it
    // tilts the whole sheet toward the drop, and that tilt is what lights the
    // brink as one bright line instead of a row of highlights.
    worldSlope -= uLipLine.zw * (uLipShape.x * 3.0 * glass * glass / uLipShape.y);
    vec3 surfaceNormal = normalize(vec3(-worldSlope.x, 1.0, -worldSlope.y));

    // --- body: how much water this view ray actually crosses.
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float thickness = max(sceneEyeDepth(screenUv) - vEyeDepth, 0.0);

    vec2 refractionOffset = worldSlope * 1.6 * min(thickness, 0.5)
      / max(viewDistance, 1.0);
    vec2 refractedUv = clamp(screenUv + refractionOffset, vec2(0.001), vec2(0.999));
    float refractedDepth = sceneEyeDepth(refractedUv);
    // A displaced sample that turned out to be in FRONT of the surface is a
    // bank pixel bleeding into the channel. Fall back to the straight view.
    if (refractedDepth < vEyeDepth) {
      refractedUv = screenUv;
      refractedDepth = vEyeDepth + thickness;
    }
    vec3 bedColor = texture2D(uRefractionColor, refractedUv).rgb;
    vec3 transmittance = exp(-uExtinction * max(refractedDepth - vEyeDepth, 0.0));
    vec3 scatter = uScatterColor * mix(0.22, 1.0, uDayFactor);
    vec3 underwater = bedColor * transmittance + scatter * (1.0 - transmittance);

    // --- reflection: the mirror pass, broken and smeared by the ripple slope.
    vec2 mirrorUv = mirrorCoord.xy / mirrorCoord.w;
    // A reflected image smears far more along the vertical than across it.
    vec2 reflectionOffset = worldSlope * 0.75
      * (0.02 + 2.2 / max(viewDistance, 1.0)) * vec2(0.45, 1.0);
    mirrorUv += reflectionOffset;
    // Three taps along the same direction the ripple displaced: the blur then
    // grows and shrinks with the water itself instead of being a fixed box.
    vec2 blurStep = reflectionOffset * 0.6;
    vec3 reflection = sampleMirror(mirrorUv) * 0.5
      + sampleMirror(mirrorUv + blurStep) * 0.25
      + sampleMirror(mirrorUv - blurStep) * 0.25;

    float cosTheta = max(dot(eyeDirection, surfaceNormal), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

    vec3 halfway = normalize(eyeDirection + normalize(sunDirection));
    float specularAngle = max(dot(surfaceNormal, halfway), 0.0);
    vec3 specular = sunColor
      * (pow(specularAngle, 220.0) * 1.9 + pow(specularAngle, 18.0) * 0.06)
      * mix(0.28, 1.0, uDayFactor);

    // The mirror texture was rendered from the reflected eye, so its fog
    // already covers the whole light path. Only the transmitted and specular
    // parts still owe the air between this surface and the camera.
    float fogAmount = 0.0;
    vec3 transmitted = underwater;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        fogAmount = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        fogAmount = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      fogAmount = clamp(fogAmount, 0.0, 1.0);
      transmitted = mix(transmitted, fogColor, fogAmount);
    #endif

    vec3 color = mix(transmitted, reflection, fresnel)
      + specular * (1.0 - fogAmount);

    // How much water actually stands here: the VERTICAL column, not the path
    // along the view ray. Those are the same number only when looking straight
    // down. Along the canal a centimetre of water on the bank gives a ray
    // metres long, and the waterline climbs the banks until the sheet reads
    // nine metres wide over a four-metre channel — water that moves with the
    // camera and does not match the fall its own maths puts at the lip.
    // Judged along the STRAIGHT ray, never the refracted one. The refraction
    // offset exists to bend what you see THROUGH the water; asking it whether
    // there is water at all is a different question, and near a lip it answers
    // wrong: the drawdown puts a 0.13 slope into the surface, which throws the
    // sample past the edge onto nothing, and the sheet erases itself in a band
    // along the brink. That band is the gap between the river and the fall.
    float straightDepth = vEyeDepth + thickness;
    float bedY = cameraPosition.y
      + (worldPosition.y - cameraPosition.y) * (straightDepth / vEyeDepth);
    float standing = worldPosition.y - bedY;
    // The same datum the lip uses to decide where a nappe can leave at all.
    float shore = smoothstep(0.006, 0.038, standing);
    // And the same number says where there is no bed. The deepest water the
    // polder holds is 0.61 m — the scoured sill at a mouth — so three quarters
    // of a metre of column already means open air under the sheet. The old
    // threshold sat at 1.4 m and happily drew water hanging over a cliff face
    // a metre below it.
    float bed = 1.0 - smoothstep(0.75, 1.25, standing);
    // Pollen, dust and scum ride the meniscus and draw a pale line just inside
    // the waterline and around anything standing in it.
    float scum = (1.0 - smoothstep(0.0, 0.055, standing)) * shore;
    color = mix(color, uScumColor, scum * 0.55);
    // A standing crest is water folding over itself: it takes air, and the
    // ridge whitens along its top while the trough stays green.
    color = mix(color, uFoamColor, boil * smoothstep(0.34, 0.92, abs(fineSlope.y)) * 0.42);
    // Where the mouth narrows, everything floating is pressed into the corners
    // and the banks carry a foam line the open canal never has.
    color = mix(
      color,
      uScumColor,
      vApproach.y * smoothstep(0.6, 0.98, vShape.x) * shore * 0.3
    );

    // --- duckweed: rafts drifting downstream, thickest where the current
    // slackens against the bank. This, not waves, is what shows the flow.
    vec2 weedFlow = vFlow + vec2(-uTime * 0.028, 0.0);
    // Into the gather the rafts are drawn out along the flow — a raft cannot
    // hold its shape through water accelerating fivefold — and the last two
    // metres are swept clean, so the brink is open water.
    float stretch = 1.0 + 3.4 * vApproach.y;
    float raft = texture2D(uWeed, vec2(weedFlow.x / (13.0 * stretch), weedFlow.y / 13.0)).r * 0.62
      + texture2D(uWeed, vec2(weedFlow.x / (3.1 * stretch), weedFlow.y / 3.1)).b * 0.38;
    float slack = smoothstep(0.30, 0.92, vShape.x);
    vec2 frondUv = weedFlow / 0.42;
    float frond = texture2D(uWeed, frondUv).g * 0.65
      + texture2D(uWeed, frondUv * 2.7).b * 0.35;
    // A raft edge is thousands of separate leaves. Dithering the threshold
    // with the leaf grain itself is what keeps it from reading as one blob
    // airbrushed onto the water.
    float weed = smoothstep(
      0.0,
      0.045,
      raft + slack * 0.18 + (frond - 0.5) * 0.13 - (1.0 - uWeedCoverage)
    );
    // Weed floats on water; it cannot lie on the dry bank, and it cannot hold
    // station on a brink either.
    weed *= smoothstep(0.012, 0.06, standing)
      * (1.0 - vApproach.y) * (1.0 - vApproach.y);
    vec3 weedColor = uWeedColor * (0.74 + frond * 0.38) * mix(0.3, 1.0, uDayFactor);
    color = mix(color, weedColor, weed);

    gl_FragColor = vec4(color, mix(shore, 1.0, weed) * bed);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const collarVertexShader = /* glsl */ `
  varying vec4 vWorldPosition;
  varying float vEyeDepth;
  varying float vEdgeFade;

  attribute vec2 aShape;

  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vWorldPosition = modelMatrix * vec4(position, 1.0);
    vEdgeFade = aShape.y;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vEyeDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;

    #include <logdepthbuf_vertex>
  }
`;

/**
 * The damp collar. Water cannot darken the bank it does not cover, so a second
 * sheet floats just above the waterline and tints whatever ground the same
 * depth pass found within a hand's width of it.
 */
const collarFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uRefractionDepth;
  uniform vec3 uWetColor;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uWaterLevel;
  uniform float uCollarHeight;
  uniform float uWetStrength;

  varying vec4 vWorldPosition;
  varying float vEyeDepth;
  varying float vEdgeFade;

  #include <common>
  #include <packing>
  #include <logdepthbuf_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float clipDepth = texture2D(uRefractionDepth, screenUv).x;
    float groundDepth = -perspectiveDepthToViewZ(clipDepth, uCameraNear, uCameraFar);
    if (groundDepth >= uCameraFar * 0.98) discard;

    // Eye depth grows linearly along the view ray, so the ground behind this
    // fragment sits at exactly that fraction of the way out.
    vec3 toFragment = vWorldPosition.xyz - cameraPosition;
    float groundY = cameraPosition.y + toFragment.y * (groundDepth / vEyeDepth);

    // A band of bank that stands just proud of the water: capillary rise and
    // lapping keep it dark long after the water itself has stopped.
    float wet = smoothstep(uWaterLevel - 0.03, uWaterLevel + 0.01, groundY)
      * (1.0 - smoothstep(uWaterLevel + 0.01, uWaterLevel + uCollarHeight, groundY));
    gl_FragColor = vec4(uWetColor, wet * uWetStrength * vEdgeFade);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Every channel of the polder, as one reflecting, refracting water sheet. */
export function DutchPolderWater() {
  // The mist is mounted here, beside the water it comes off, but unlike the
  // two service sheets it is NOT hidden from the passes the water reads back.
  // It cannot corrupt them: the billow material writes no depth, and depth is
  // what those passes are read for — the waterline, the vertical column, the
  // thickness and the damp collar all come from it. The most a stray packet
  // over the canal can do is tint the refracted colour slightly, which is what
  // real mist over real water does anyway.
  const study = useMemo(() => {
    const geometry = buildWaterSheet();
    const ripples = createRippleNormals();
    const weed = createWeedTexture();
    const water = new Water(geometry, {
      textureWidth: MIRROR_SIZE,
      textureHeight: MIRROR_SIZE,
      clipBias: 0.001,
      alpha: 1,
      sunDirection: environmentState.keyLightDirection.clone(),
      sunColor: environmentState.keyLightColor,
      waterColor: "#254f57",
      distortionScale: 0,
      fog: true,
    });
    water.name = "dutch-polder:water:sheet";
    water.position.y = WATER_LEVEL;
    water.rotation.x = -Math.PI / 2;
    water.frustumCulled = false;
    water.renderOrder = 1;
    water.castShadow = false;
    water.receiveShadow = false;

    const refraction = new WebGLRenderTarget(2, 2, {
      type: UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    refraction.texture.name = "dutch-polder:water:refraction";
    const refractionDepth = new DepthTexture(2, 2, UnsignedIntType);
    refractionDepth.minFilter = NearestFilter;
    refractionDepth.magFilter = NearestFilter;
    refraction.depthTexture = refractionDepth;

    // Shared uniform objects: the collar reads the same frame the surface did.
    const depthUniform: IUniform = { value: refractionDepth };
    const resolutionUniform: IUniform = { value: new Vector2(1, 1) };
    const nearUniform: IUniform = { value: 0.05 };
    const farUniform: IUniform = { value: 1000 };

    const material = water.material as ShaderMaterial;
    material.vertexShader = surfaceVertexShader;
    material.fragmentShader = surfaceFragmentShader;
    material.uniforms.uRefractionColor = { value: refraction.texture };
    material.uniforms.uRefractionDepth = depthUniform;
    material.uniforms.uRipples = { value: ripples };
    material.uniforms.uWeed = { value: weed };
    // Murky ditch water: green survives the water column, red and blue do not.
    material.uniforms.uExtinction = { value: new Vector3(5.5, 3.6, 6.2) };
    material.uniforms.uScatterColor = { value: new Color("#4c5537") };
    material.uniforms.uScumColor = { value: new Color("#9aa07e") };
    material.uniforms.uWeedColor = { value: new Color("#5d7334") };
    material.uniforms.uFoamColor = { value: new Color("#dfe7e4") };
    // The one line the sheet needs to know about: where its water runs out of
    // island. With no mouth the sag is zero and every approach term with it.
    const approach = POLDER_SPILL_LIPS.length > 0
      ? polderSpillApproach(POLDER_SPILL_LIPS[0])
      : null;
    material.uniforms.uLipLine = {
      value: approach
        ? new Vector4(
          approach.origin[0],
          approach.origin[1],
          approach.outward[0],
          approach.outward[1],
        )
        : new Vector4(1e5, 1e5, 1, 0),
    };
    material.uniforms.uLipShape = {
      value: approach
        ? new Vector3(approach.sag, approach.reach, approach.halfWidth)
        : new Vector3(0, APPROACH_REACH, 0),
    };
    material.uniforms.uResolution = resolutionUniform;
    material.uniforms.uCameraNear = nearUniform;
    material.uniforms.uCameraFar = farUniform;
    material.uniforms.uTime = { value: 0 };
    material.uniforms.uRippleSlope = { value: RIPPLE_SLOPE };
    material.uniforms.uWeedCoverage = { value: 0.34 };
    material.uniforms.uDayFactor = { value: environmentState.dayFactor };
    material.transparent = true;
    material.depthWrite = false;
    material.needsUpdate = true;

    // Stock Water uses HalfFloat. Change it before first allocation: the same
    // Chrome/ANGLE path already blanked this scene's bloom compositor.
    const mirrorTexture = material.uniforms.mirrorSampler.value as Texture;
    mirrorTexture.type = UnsignedByteType;
    mirrorTexture.needsUpdate = true;

    const collarMaterial = new ShaderMaterial({
      vertexShader: collarVertexShader,
      fragmentShader: collarFragmentShader,
      uniforms: {
        uRefractionDepth: depthUniform,
        uResolution: resolutionUniform,
        uCameraNear: nearUniform,
        uCameraFar: farUniform,
        uWetColor: { value: new Color("#241f16") },
        uWaterLevel: { value: WATER_LEVEL },
        uCollarHeight: { value: DAMP_COLLAR_HEIGHT },
        uWetStrength: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
    });
    const collar = new Mesh(geometry, collarMaterial);
    collar.name = "dutch-polder:water:damp-collar";
    collar.position.y = WATER_LEVEL + DAMP_COLLAR_HEIGHT;
    collar.rotation.x = -Math.PI / 2;
    collar.frustumCulled = false;
    collar.renderOrder = 2;
    collar.castShadow = false;
    collar.receiveShadow = false;

    // Where the canal runs out of island. Built here because the fall is the
    // same water: it vanishes inside the same two passes the sheet reads, and
    // it is lit by the sheet's own uniform objects rather than copies of them.
    const spill = createPolderSpill({
      sunDirection: material.uniforms.sunDirection,
      sunColor: material.uniforms.sunColor,
      dayFactor: material.uniforms.uDayFactor,
      extinction: material.uniforms.uExtinction,
      scatterColor: material.uniforms.uScatterColor,
    });

    const drawingSize = new Vector2();
    const worldSphere = new Sphere();
    const viewProjection = new Matrix4();
    const frustum = new Frustum();
    // Stock Water hangs its planar-mirror pass on onBeforeRender and reads
    // nothing past the camera argument.
    const renderMirror = water.onBeforeRender as unknown as (
      renderer: WebGLRenderer,
      scene: Scene,
      camera: Camera,
    ) => void;

    water.onBeforeRender = (
      renderer: WebGLRenderer,
      scene: Scene,
      camera: Camera,
    ) => {
      // The sheet opts out of frustum culling, so both of its scene renders
      // would otherwise keep running with every canal behind the camera.
      if (geometry.boundingSphere) {
        worldSphere.copy(geometry.boundingSphere).applyMatrix4(water.matrixWorld);
        viewProjection.multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        );
        frustum.setFromProjectionMatrix(viewProjection);
        if (!frustum.intersectsSphere(worldSphere)) return;
      }

      const perspective = camera as PerspectiveCamera;
      renderer.getDrawingBufferSize(drawingSize);
      const width = Math.max(2, Math.floor(drawingSize.x * REFRACTION_SCALE));
      const height = Math.max(2, Math.floor(drawingSize.y * REFRACTION_SCALE));
      if (refraction.width !== width || refraction.height !== height) {
        refraction.setSize(width, height);
      }
      resolutionUniform.value.set(drawingSize.x, drawingSize.y);
      nearUniform.value = perspective.near;
      farUniform.value = perspective.far;

      const previousTarget = renderer.getRenderTarget();
      const previousXr = renderer.xr.enabled;
      const previousShadowUpdate = renderer.shadowMap.needsUpdate;

      // Neither sheet may appear in what the other sheets read back.
      water.visible = false;
      collar.visible = false;
      if (spill) spill.mesh.visible = false;
      renderer.xr.enabled = false;
      // The scene throttles its shadow atlas by hand. An extra pass must not
      // be the one to spend the pending update.
      renderer.shadowMap.needsUpdate = false;

      renderer.setRenderTarget(refraction);
      renderer.state.buffers.depth.setMask(true);
      // RenderPass turns autoClear off around the frame it owns.
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, camera);

      water.visible = true;
      renderer.xr.enabled = previousXr;
      renderer.shadowMap.needsUpdate = previousShadowUpdate;
      renderer.setRenderTarget(previousTarget);

      renderMirror(renderer, scene, camera);
      collar.visible = true;
      // Restored to whatever the kill switch says, not unconditionally: this
      // runs every frame and would otherwise put a shed curtain straight back.
      if (spill) spill.mesh.visible = spillPowerState.on;
    };

    return {
      collar,
      collarMaterial,
      geometry,
      material,
      mirrorTexture,
      refraction,
      ripples,
      spill,
      water,
      weed,
    };
  }, []);

  const power = useRef(initialSpillPower());

  useFrame((state, delta) => {
    const uniforms = study.material.uniforms;
    uniforms.sunDirection.value.copy(environmentState.keyLightDirection);
    uniforms.sunColor.value.copy(environmentState.keyLightColor);
    /* eslint-disable react-hooks/immutability -- R3F animation uniforms are frame state */
    uniforms.uDayFactor.value = environmentState.dayFactor;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uRippleSlope.value = RIPPLE_SLOPE * windState.strength;
    /* eslint-enable react-hooks/immutability */

    // The fall pays for itself or it goes. The river, its mirror and its
    // refraction stay either way — they are the world; the fall is a flourish
    // on the edge of it, and it is the most expensive thing here.
    power.current = stepSpillPower(
      power.current,
      delta,
      performanceGovernor.getSnapshot().fps,
    );
    spillPowerState.on = power.current.on;
    study.spill?.frame(state.clock.elapsedTime, state.scene, power.current.on);
  });

  useEffect(
    () => () => {
      study.geometry.dispose();
      study.material.dispose();
      study.collarMaterial.dispose();
      study.mirrorTexture.dispose();
      study.refraction.depthTexture?.dispose();
      study.refraction.dispose();
      study.ripples.dispose();
      study.weed.dispose();
      study.spill?.dispose();
    },
    [study],
  );

  return (
    <>
      <primitive object={study.water} />
      <primitive object={study.collar} />
      {study.spill ? <primitive object={study.spill.mesh} /> : null}
      <DutchPolderSpray />
    </>
  );
}
