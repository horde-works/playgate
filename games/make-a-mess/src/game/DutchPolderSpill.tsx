"use client";

import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  Uint32BufferAttribute,
  UnsignedByteType,
  Vector2,
} from "three";
import type { IUniform, Scene } from "three";
import {
  FALL_TAU,
  POLDER_SPILL_LIPS,
  SPILL_GRAVITY,
  VEIL_FADE_FROM,
  VEIL_FADE_TO,
  buildSpillVeilModel,
} from "./dutchPolderSpillModel.ts";
import { tileableNoise2 } from "./tileableNoise.ts";
import { windState } from "./windState";

/**
 * The fall at the polder's river mouth.
 *
 * One mesh, one material, no scene reads: the curtain is a forward alpha layer
 * over a frame that has already been drawn. Everything that moves comes from
 * two taps of one 256² noise map, addressed by the parcel's departure time —
 * so the strands accelerate and stretch on their own, with no scroll term and
 * no second pass.
 *
 * There is no cliff here. This island's rim is fog, so the fall ends by
 * dissolving into it rather than by reaching a foot, and `DutchPolderSpray`
 * takes over exactly where this stops being coherent water.
 *
 * Draw calls: 1. Triangles: 1728 for the one mouth across three sheets.
 * Texture: 256 KB.
 *
 * And it is shed first. Below `SPILL_FPS_FLOOR` the whole thing — curtain and
 * mist together — stops being drawn, retrying once a minute. The river, its
 * mirror and its refraction stay: they are the world. This is a flourish on
 * the edge of it, and three alpha sheets of overdraw in front of a scene that
 * already pays for two full extra renders is the first thing worth giving up.
 */

const SPILL_TEXTURE_SIZE = 256;
/** Lateral drift of the falling water in a full gale. */
const WIND_DRIFT_SPEED = 1.1;
/** Sets how long a sheet survives before the air tears it into strands. */
const TEAR_TAU = 0.55;
/**
 * How fast the curtain leans in a gale. The drag time of a coherent sheet is
 * minutes, but a curtain does visibly lean, because what leans is the torn
 * part — so this is the TEARING time, not the ballistic one.
 */
const WIND_TAU = 0.6;
/**
 * Nothing stored in this map may be finer than this many texels across a
 * feature.
 *
 * The rule exists because breaking it is invisible in the map and lethal in
 * the frame. The first draft stored octaves at periods 17, 29 and 37 on a 128²
 * map — 7.5, 4.4 and 3.5 texels per feature, which is not noise but a hash per
 * texel — and then the fragment shader took 58% of its silhouette field from
 * that channel and hard-thresholded it. Mip filtering cannot save a field that
 * is thresholded after being filtered, so the curtain came out as television
 * snow. Fine scales are the job of sampling this map more often per metre, not
 * of storing smaller features in it.
 */
const MINIMUM_TEXELS_PER_FEATURE = 8;

/**
 * Falling water, as a map: broad strands in red, the grain that breaks them
 * into ropes in green, torn droplets in blue.
 *
 * Every octave is anisotropic, because the map is addressed in (metres across
 * the lip, seconds since leaving it) and water tears into ropes that are long
 * in the second axis and narrow in the first. Only the droplets are round.
 */
function createSpillTexture(): DataTexture {
  const size = SPILL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const cap = size / MINIMUM_TEXELS_PER_FEATURE;
  const octaves = [
    { u: 10, v: 3 }, { u: 24, v: 8 },
    { u: 20, v: 6 }, { u: 32, v: 10 },
    { u: 28, v: 28 },
  ];
  for (const octave of octaves) {
    if (octave.u > cap || octave.v > cap) {
      throw new Error(
        `spill octave ${octave.u}x${octave.v} is finer than ${MINIMUM_TEXELS_PER_FEATURE} texels on a ${size} map`,
      );
    }
  }
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const u = column / size;
      const v = row / size;
      const strand = tileableNoise2(u, v, 10, 3, 41) * 0.6
        + tileableNoise2(u, v, 24, 8, 42) * 0.4;
      const grain = tileableNoise2(u, v, 20, 6, 51) * 0.55
        + tileableNoise2(u, v, 32, 10, 52) * 0.45;
      const drops = tileableNoise2(u, v, 28, 28, 61);
      const offset = (row * size + column) * 4;
      data[offset] = Math.round(strand * 255);
      data[offset + 1] = Math.round(grain * 255);
      data[offset + 2] = Math.round(drops * drops * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const spillVertexShader = /* glsl */ `
  attribute vec4 aVeil;
  attribute vec3 aSheet;

  uniform vec2 uWindDrift;
  uniform float uWindTau;

  varying float vAge;
  varying float vAcross;
  varying float vDepth;
  varying float vSpeed;
  varying float vPhase;
  varying float vShade;
  varying float vSpan;
  varying vec3 vWorld;

  void main() {
    vAge = aVeil.x;
    vAcross = aVeil.y;
    vDepth = aVeil.z;
    vSpeed = aVeil.w;
    vPhase = aSheet.x;
    vShade = aSheet.y;
    vSpan = aSheet.z;

    // Displacement of a drifting parcel under linear drag: nothing at the lip,
    // metres by the time it is spray. The curtain leans, it does not slide.
    float sway = vAge - uWindTau * (1.0 - exp(-vAge / uWindTau));
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.xz += uWindDrift * sway;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const spillFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uSpill;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uExtinction;
  uniform vec3 uScatterColor;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFadeFrom;
  uniform float uFadeTo;
  uniform float uTime;
  uniform float uTearTau;
  uniform float uFallSpeed;
  uniform float uFallTau;
  uniform float uDayFactor;

  varying float vAge;
  varying float vAcross;
  varying float vDepth;
  varying float vSpeed;
  varying float vPhase;
  varying float vShade;
  varying float vSpan;
  varying vec3 vWorld;

  void main() {
    // What the water remembers: two parcels are the same water if they left
    // the lip at the same moment. Addressing the map this way is what makes
    // the strands accelerate and stretch downward, with no scroll term.
    float parcel = uTime - vAge;
    // Three scales at once out of two taps, because water does not come in one
    // size: 34 cm clumps of flow, 10 cm ropes inside them, 3 cm grain on those.
    // Get this scale wrong by an order and the curtain is a blank sheet.
    vec2 uv = vec2(vAcross / 1.7 + vPhase, parcel / 2.6 + vPhase * 1.7);
    vec3 coarse = texture2D(uSpill, uv).rgb;
    vec3 fine = texture2D(uSpill, uv * vec2(2.2, 3.0) + vec2(0.17, 0.4)).rgb;

    // Continuity: the sheet thins exactly as fast as it accelerates. The speed
    // is the fall law itself rather than a constant standing in for gravity,
    // so the curtain, the mist and the geometry cannot disagree about how fast
    // this water is going.
    float fallSpeed = uFallSpeed * (1.0 - exp(-vAge / uFallTau));
    float thickness = vDepth * vSpeed / max(vSpeed + fallSpeed, 0.05);
    // Aerodynamic tear-up grows in time, and a thick sheet survives longer.
    float torn = 1.0 - exp(-vAge / (uTearTau * (1.0 + thickness * 12.0)));
    float wet = smoothstep(0.0015, 0.03, thickness);

    // How much of this patch is still water rather than the air between
    // ropes. Water has EDGES: a soft threshold here is what turns a waterfall
    // into smoke, so the field is stretched and cut narrow.
    //
    // But ONLY the resolved octaves may be cut. A threshold applied after mip
    // filtering undoes the filtering — the average of a minified high-frequency
    // field is a flat grey, and slicing that grey at a moving level makes every
    // pixel flicker independently. So the silhouette comes from the coarse tap,
    // which the mip chain can actually carry, and the fine grain never cuts
    // anything: it brightens and dims the water INSIDE its own edges, where
    // minification averages it away harmlessly.
    float coverage = wet * mix(1.0, 0.10, torn * torn);
    float field = clamp(
      (coarse.r * 0.58 + coarse.g * 0.42 - 0.5) * 2.0 + 0.5,
      0.0,
      1.0
    );
    float core = smoothstep(1.0 - coverage - 0.10, 1.0 - coverage + 0.10, field);
    float grain = fine.g * 0.62 + fine.r * 0.38;
    float spray = wet * torn * (0.05 + fine.b * 0.55) * 0.4;
    // The bend at the lip is unbroken water. It is not foam and must not be
    // painted white: all it does is stay whole while everything below tears.
    float crest = 1.0 - smoothstep(0.0, 0.14, vAge);

    // --- light. Exactly the two lights the canal has, out of exactly the
    // same uniforms: the sun, and the sky whose colour the scene fog tracks
    // through the whole day cycle. Aerated water is a diffuse multiple
    // scatterer with a hard forward lobe — with the sun behind it the veil
    // glows through, which is why a fall reads bright and not grey. Invent a
    // separate lighting model here and the fall parts company with the sheet
    // at the first sunset, under every light, for ever.
    vec3 view = normalize(vWorld - cameraPosition);
    float forward = pow(max(dot(view, normalize(uSunDirection)), 0.0), 5.0);
    // A parcel below the rim is in a well. It loses the sun first — the island
    // itself is between it and anything but a noon sun — and then loses the
    // sky, because the further it falls the less of the dome is left over the
    // lip. Without this the fall was lit at full noon while the ground beside
    // it was in shadow, which is exactly how something reads as pasted on.
    float belowRim = clamp(-vWorld.y / 5.0, 0.0, 1.0);
    vec3 light = uSunColor * uDayFactor * (0.5 + 1.5 * forward)
        * (1.0 - 0.7 * belowRim)
      + uFogColor * (0.4 + 0.34 * uDayFactor) * (1.0 - 0.35 * belowRim);

    // --- body. Where the water is still whole it IS the canal's water, so it
    // is computed by the canal's law: the same extinction constants over the
    // thickness this sheet actually has. Thirteen centimetres at the lip lets
    // a third of the light through and reads green; a centimetre of torn water
    // lets nearly all of it through and reads as foam. That is the depth cue,
    // and it comes from the same place the ditch's does.
    vec3 through = exp(-uExtinction * thickness * 1.6);
    float whole = clamp(1.0 - (through.r + through.g + through.b) / 3.0, 0.25, 0.95);
    // White is a CONSEQUENCE of air getting in, so it cannot arrive before the
    // tearing does: a metre of green glassy tongue first, white by four.
    float white = smoothstep(0.15, 1.1, vAge * 0.6 + torn * 0.9);
    vec3 color = mix(uScatterColor, uFoamColor, white)
      * light * vShade * (0.74 + grain * 0.52);

    float alpha = core * mix(whole, 0.88, white) + spray;
    // The unbroken tongue is whole, but it is still WATER: you see the rock
    // through it, and how well is the same absorption law again.
    alpha = max(alpha, crest * wet * whole);

    // No sheet may simply end: the short ones fade over their last third.
    alpha *= 1.0 - smoothstep(vSpan * 0.72, vSpan, vAge);
    // Gone before the geometry ends, and gone by height rather than by age.
    // There is no rock behind this fall — the polder's rim is fog — so what
    // hides the cut edge is the fog wall itself, and the fade has to finish
    // inside it rather than somewhere a cliff used to be.
    float mist = smoothstep(uFadeFrom + (field - 0.5) * 1.7, uFadeTo, vWorld.y);
    color = mix(color, uFogColor, mist * 0.85);
    alpha *= 1.0 - mist;

    // The scene's own linear fog: a ShaderMaterial is not given it.
    float fogAmount = clamp(
      (distance(cameraPosition, vWorld) - uFogNear) / (uFogFar - uFogNear),
      0.0,
      1.0
    );
    color = mix(color, uFogColor, fogAmount);

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface PolderSpill {
  readonly mesh: Mesh;
  readonly triangles: number;
  /**
   * `drawn` is the frame-rate kill switch. It lives here rather than at the
   * call site because the curtain owns its own mesh: a caller reaching in to
   * set `spill.mesh.visible` is reaching through the memo that holds it.
   */
  frame(elapsed: number, scene: Scene, drawn: boolean): void;
  dispose(): void;
}

/**
 * Built by `DutchPolderWater` rather than mounted on its own: the falls are
 * the same body of water as the sheet, and they have to be hidden inside the
 * same mirror and refraction passes or the canal reflects its own waterfall.
 */
/**
 * The uniforms the fall SHARES with the sheet — the same objects, not copies.
 * Sun, daylight and the water's own absorption cannot be allowed to drift
 * apart between the canal and the thing pouring out of it.
 */
export interface SpillLighting {
  readonly sunDirection: IUniform;
  readonly sunColor: IUniform;
  readonly dayFactor: IUniform;
  readonly extinction: IUniform;
  readonly scatterColor: IUniform;
}

export function createPolderSpill(shared: SpillLighting): PolderSpill | null {
  if (POLDER_SPILL_LIPS.length === 0) return null;

  const model = buildSpillVeilModel();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(model.positions, 3));
  geometry.setAttribute("aVeil", new Float32BufferAttribute(model.veil, 4));
  geometry.setAttribute("aSheet", new Float32BufferAttribute(model.sheet, 3));
  geometry.setIndex(new Uint32BufferAttribute(model.indices, 1));
  geometry.computeBoundingSphere();

  const texture = createSpillTexture();
  const material = new ShaderMaterial({
    vertexShader: spillVertexShader,
    fragmentShader: spillFragmentShader,
    uniforms: {
      uSpill: { value: texture },
      uSunDirection: shared.sunDirection,
      uSunColor: shared.sunColor,
      uExtinction: shared.extinction,
      uScatterColor: shared.scatterColor,
      uFoamColor: { value: new Color("#dfe7e4") },
      uFogColor: { value: new Color("#9cc0ce") },
      uFogNear: { value: 118 },
      uFogFar: { value: 225 },
      uFadeFrom: { value: VEIL_FADE_FROM },
      uFadeTo: { value: VEIL_FADE_TO },
      uTime: { value: 0 },
      uTearTau: { value: TEAR_TAU },
      uFallSpeed: { value: SPILL_GRAVITY * FALL_TAU },
      uFallTau: { value: FALL_TAU },
      uWindDrift: { value: new Vector2() },
      uWindTau: { value: WIND_TAU },
      uDayFactor: shared.dayFactor,
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = "dutch-polder:water:fall";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // After the sky dome (1000) and after `WorldEdge`'s fog (1001). The fog wall
  // hangs BEHIND the fall — 4.5 m further out — and would otherwise paint
  // itself over it. The curtain fades into that same fog by height instead.
  mesh.renderOrder = 1002;

  return {
    mesh,
    triangles: model.triangles,
    frame(elapsed, scene, drawn) {
      mesh.visible = drawn;
      // A shed curtain still costs its uniform writes and its scene fog read.
      if (!drawn) return;
      const uniforms = material.uniforms;
      // Sun, day factor and the water's absorption arrive by shared uniform;
      // only what is the fall's own is written here.
      uniforms.uTime.value = elapsed;
      (uniforms.uWindDrift.value as Vector2).set(
        windState.direction[0] * windState.strength * WIND_DRIFT_SPEED,
        windState.direction[1] * windState.strength * WIND_DRIFT_SPEED,
      );
      const fog = scene.fog;
      if (fog instanceof Fog) {
        (uniforms.uFogColor.value as Color).copy(fog.color);
        uniforms.uFogNear.value = fog.near;
        uniforms.uFogFar.value = fog.far;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
