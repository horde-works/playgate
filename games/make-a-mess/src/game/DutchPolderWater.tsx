"use client";

import { useEffect, useMemo } from "react";
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
  WebGLRenderTarget,
} from "three";
import type { Camera, IUniform, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { Water } from "three/addons/objects/Water.js";
import {
  DAMP_COLLAR_HEIGHT,
  WATER_LEVEL,
  buildWaterSheetModel,
} from "./dutchPolderWaterModel.ts";
import { environmentState } from "./environmentState";
import { windState } from "./windState";

const MIRROR_SIZE = 1024;
/** Refraction is read through moving water; half the drawing buffer is plenty. */
const REFRACTION_SCALE = 0.5;
const RIPPLE_TEXTURE_SIZE = 128;
const WEED_TEXTURE_SIZE = 128;
/** Surface slope of a calm ditch, in metres of rise per metre of run. */
const RIPPLE_SLOPE = 0.06;

/** Wraps the pure sheet model, which owns every number about the channels. */
function buildWaterSheet(): BufferGeometry {
  const model = buildWaterSheetModel();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(model.positions, 3));
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

  attribute vec2 aFlow;
  attribute vec2 aShape;
  attribute vec2 aTangent;

  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec2 vFlow;
  varying vec2 vShape;
  varying vec2 vTangent;
  varying float vEyeDepth;

  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vFlow = aFlow;
    vShape = aShape;
    vTangent = aTangent;
    worldPosition = modelMatrix * vec4(position, 1.0);
    mirrorCoord = textureMatrix * worldPosition;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
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
  uniform vec3 eye;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 uExtinction;
  uniform vec3 uScatterColor;
  uniform vec3 uScumColor;
  uniform vec3 uWeedColor;
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
    float amplitude = uRippleSlope * rippleFade;
    vec2 coarseUv = vec2((vFlow.x - uTime * 0.055) / 3.4, vFlow.y / 1.6);
    vec2 fineUv = vec2(
      (vFlow.x - uTime * 0.13) / 1.15,
      (vFlow.y + uTime * 0.02) / 0.55
    );
    vec2 slope = (texture2D(uRipples, coarseUv).xy * 2.0 - 1.0) * amplitude
      + (texture2D(uRipples, fineUv).xy * 2.0 - 1.0) * amplitude * 0.55;
    vec2 worldSlope = tangent * slope.x + bitangent * slope.y;
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
      * uDayFactor;

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

    // Where the sheet meets the bank the water column runs out, and so does
    // the surface. The same term softens every reed and post that stands in
    // the channel instead of cutting it off at a hard line.
    float shore = smoothstep(0.0, 0.055, thickness);
    // Pollen, dust and scum ride the meniscus and draw a pale line just inside
    // the waterline and around anything standing in it.
    float scum = (1.0 - smoothstep(0.0, 0.075, thickness)) * shore;
    color = mix(color, uScumColor, scum * 0.55);

    // --- duckweed: rafts drifting downstream, thickest where the current
    // slackens against the bank. This, not waves, is what shows the flow.
    vec2 weedFlow = vFlow + vec2(-uTime * 0.028, 0.0);
    float raft = texture2D(uWeed, weedFlow / 13.0).r * 0.62
      + texture2D(uWeed, weedFlow / 3.1).b * 0.38;
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
    // Weed floats on water; it cannot lie on the dry bank.
    weed *= smoothstep(0.015, 0.08, thickness);
    vec3 weedColor = uWeedColor * (0.74 + frond * 0.38) * mix(0.3, 1.0, uDayFactor);
    color = mix(color, weedColor, weed);

    gl_FragColor = vec4(color, mix(shore, 1.0, weed) * vShape.y);

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
  const study = useMemo(() => {
    const geometry = buildWaterSheet();
    const ripples = createRippleNormals();
    const weed = createWeedTexture();
    const water = new Water(geometry, {
      textureWidth: MIRROR_SIZE,
      textureHeight: MIRROR_SIZE,
      clipBias: 0.001,
      alpha: 1,
      sunDirection: environmentState.sunDirection.clone(),
      sunColor: environmentState.sunColor,
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
    };

    return {
      collar,
      collarMaterial,
      geometry,
      material,
      mirrorTexture,
      refraction,
      ripples,
      water,
      weed,
    };
  }, []);

  useFrame((state) => {
    const uniforms = study.material.uniforms;
    uniforms.sunDirection.value.copy(environmentState.sunDirection);
    uniforms.sunColor.value.copy(environmentState.sunColor);
    /* eslint-disable react-hooks/immutability -- R3F animation uniforms are frame state */
    uniforms.uDayFactor.value = environmentState.dayFactor;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uRippleSlope.value = RIPPLE_SLOPE * windState.strength;
    /* eslint-enable react-hooks/immutability */
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
    },
    [study],
  );

  return (
    <>
      <primitive object={study.water} />
      <primitive object={study.collar} />
    </>
  );
}
