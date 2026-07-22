"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  Color,
  LinearFilter,
  Vector2,
  Vector3,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { N8AOPass } from "n8ao";
import { environmentState } from "./environmentState";

/**
 * The always-on cinematic pipeline: screen-space AO on top of the baked
 * corner AO, a soft wide bloom, sun shafts marched toward the sun through the
 * frame, a glare halo with a lens-dirt overlay that lights up only when the
 * sun itself is visible, and a gentle grade. AgX tone mapping is applied by
 * the OutputPass, SMAA resolves edges (the composer path bypasses MSAA).
 */

const CinematicShader = {
  name: "CinematicGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    tLensDirt: { value: null },
    uSunScreen: { value: new Vector2(0.5, 0.5) },
    uSunPresence: { value: 0 },
    uShaftColor: { value: new Color("#ffdfae") },
    uShaftIntensity: { value: 0.5 },
    uDirtStrength: { value: 0.4 },
    uSaturation: { value: 0.97 },
    uColorBalance: { value: new Vector3(1.02, 1.0, 0.98) },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLensDirt;
    uniform vec2 uSunScreen;
    uniform float uSunPresence;
    uniform vec3 uShaftColor;
    uniform float uShaftIntensity;
    uniform float uDirtStrength;
    uniform float uSaturation;
    uniform vec3 uColorBalance;
    uniform float uAspect;
    varying vec2 vUv;

    #define SHAFT_SAMPLES 28

    float brightMask(vec3 color) {
      // Only genuinely HDR-bright sources (the sun core, strong glare) feed
      // the shafts — ordinary hazy sky must not, or looking sunward becomes
      // a white-out instead of beams.
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return smoothstep(2.3, 5.5, luminance);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      if (uSunPresence > 0.001) {
        // Crepuscular shafts: march from this pixel toward the sun and
        // accumulate the light that is actually visible along the way, so
        // buildings and mountains carve real beams out of the haze.
        vec2 stride = (uSunScreen - vUv) / float(SHAFT_SAMPLES);
        vec2 sampleUv = vUv;
        float decay = 1.0;
        float shaft = 0.0;
        for (int i = 0; i < SHAFT_SAMPLES; i += 1) {
          sampleUv += stride;
          shaft += brightMask(texture2D(tDiffuse, sampleUv).rgb) * decay;
          decay *= 0.955;
        }
        shaft /= float(SHAFT_SAMPLES);
        color += uShaftColor * shaft * uShaftIntensity * uSunPresence;

        // Is the sun disc itself visible? Sample a small ring around it —
        // no glare or lens dirt when a wall stands in front of the sun.
        float sunVisible = 0.0;
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.011, 0.0)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen - vec2(0.011, 0.0)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.0, 0.011)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen - vec2(0.0, 0.011)).rgb);
        sunVisible *= 0.2 * uSunPresence;

        vec2 toSun = (vUv - uSunScreen) * vec2(uAspect, 1.0);
        float sunDistance = length(toSun);
        float glare = exp(-sunDistance * sunDistance * 42.0) * 0.32
          + exp(-sunDistance * 7.5) * 0.07;
        color += uShaftColor * glare * sunVisible;

        float dirtLight = shaft * 1.1 + exp(-sunDistance * 2.6) * 0.5;
        float dirt = texture2D(tLensDirt, vUv).r;
        color += uShaftColor * dirt * dirtLight * uDirtStrength * sunVisible;
      }

      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, uSaturation);
      color *= uColorBalance;

      gl_FragColor = vec4(color, base.a);
    }
  `,
};

function createLensDirtTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  if (!context) {
    return texture;
  }

  context.fillStyle = "#000000";
  context.fillRect(0, 0, size, size);

  let seed = 1337;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Soft smudge blobs.
  for (let index = 0; index < 46; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 8 + random() * 44;
    const alpha = 0.02 + random() * 0.06;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // Dust specks.
  for (let index = 0; index < 260; index += 1) {
    const alpha = 0.05 + random() * 0.16;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fillRect(
      random() * size,
      random() * size,
      0.6 + random() * 1.8,
      0.6 + random() * 1.8,
    );
  }

  // A few hairline arcs (scratches).
  context.strokeStyle = "rgba(255,255,255,0.045)";
  context.lineWidth = 1;
  for (let index = 0; index < 7; index += 1) {
    context.beginPath();
    context.arc(
      random() * size,
      random() * size,
      30 + random() * 160,
      random() * Math.PI * 2,
      random() * Math.PI * 2 + 0.5 + random() * 1.2,
    );
    context.stroke();
  }

  texture.needsUpdate = true;
  return texture;
}

export function CinematicPostProcessing({
  compact,
}: {
  compact: boolean;
}) {
  const { camera, gl, scene, size } = useThree();
  const dpr = useThree((state) => state.viewport.dpr);
  const sunWorld = useMemo(() => new Vector3(), []);
  const cameraForward = useMemo(() => new Vector3(), []);
  const duskShaftColor = useMemo(() => new Color("#ffb46a"), []);

  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);

    let aoPass: N8AOPass | null = null;
    if (compact) {
      composer.addPass(new RenderPass(scene, camera));
    } else {
      aoPass = new N8AOPass(scene, camera, size.width, size.height);
      aoPass.configuration.aoRadius = 1.7;
      aoPass.configuration.distanceFalloff = 1.2;
      aoPass.configuration.intensity = 2.6;
      aoPass.configuration.halfRes = true;
      aoPass.configuration.gammaCorrection = false;
      composer.addPass(aoPass);
    }

    const bloomPass = new UnrealBloomPass(
      new Vector2(32, 32),
      compact ? 0.1 : 0.13,
      0.35,
      1.6,
    );
    composer.addPass(bloomPass);

    const cinematicPass = new ShaderPass(CinematicShader);
    const lensDirt = createLensDirtTexture();
    cinematicPass.uniforms.tLensDirt.value = lensDirt;
    composer.addPass(cinematicPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const smaaPass = new SMAAPass();
    composer.addPass(smaaPass);

    return {
      aoPass,
      bloomPass,
      cinematicPass,
      composer,
      lensDirt,
      outputPass,
      smaaPass,
    };
  }, [camera, compact, gl, scene, size.height, size.width]);

  useEffect(() => {
    pipeline.composer.setPixelRatio(dpr);
    pipeline.composer.setSize(size.width, size.height);
    pipeline.bloomPass.setSize(
      Math.max(64, Math.round(size.width * dpr * 0.5)),
      Math.max(64, Math.round(size.height * dpr * 0.5)),
    );
    pipeline.cinematicPass.uniforms.uAspect.value =
      size.width / Math.max(1, size.height);
  }, [dpr, pipeline, size.height, size.width]);

  useEffect(
    () => () => {
      pipeline.lensDirt.dispose();
      pipeline.aoPass?.dispose();
      pipeline.bloomPass.dispose();
      pipeline.cinematicPass.dispose();
      pipeline.outputPass.dispose();
      pipeline.smaaPass.dispose();
      pipeline.composer.dispose();
    },
    [pipeline],
  );

  useFrame(() => {
    // Project the sun into screen space for the shafts/glare pass.
    const uniforms = pipeline.cinematicPass.uniforms;
    camera.getWorldDirection(cameraForward);
    const facing = cameraForward.dot(environmentState.sunDirection);
    if (facing <= 0.02) {
      uniforms.uSunPresence.value = 0;
    } else {
      sunWorld
        .copy(camera.position)
        .addScaledVector(environmentState.sunDirection, 220);
      sunWorld.project(camera);
      const uvX = sunWorld.x * 0.5 + 0.5;
      const uvY = sunWorld.y * 0.5 + 0.5;
      uniforms.uSunScreen.value.set(uvX, uvY);
      const edge = Math.max(Math.abs(sunWorld.x), Math.abs(sunWorld.y));
      const edgeFade = 1 - Math.min(1, Math.max(0, (edge - 1.0) / 0.22));
      const daylight = Math.min(
        1,
        environmentState.dayFactor + environmentState.twilightFactor * 0.85,
      );
      // No shafts or glare once the sun sinks below the horizon — the pass
      // must not chase the sun through the ground at night.
      const aboveHorizon = Math.min(
        1,
        Math.max(0, (environmentState.sunDirection.y + 0.02) / 0.08),
      );
      uniforms.uSunPresence.value = edgeFade * daylight * aboveHorizon;
      (uniforms.uShaftColor.value as Color)
        .copy(environmentState.sunColor)
        .lerp(duskShaftColor, environmentState.twilightFactor * 0.55);
      uniforms.uShaftIntensity.value =
        0.15 + environmentState.twilightFactor * 0.32;
    }
  });

  useFrame((_, delta) => {
    pipeline.composer.render(delta);
  }, 1);

  return null;
}
