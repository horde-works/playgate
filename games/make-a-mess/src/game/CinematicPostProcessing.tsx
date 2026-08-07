"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  Color,
  LinearFilter,
  MathUtils,
  UnsignedByteType,
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
import { performanceGovernor } from "./performanceGovernor";

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
    uShaftIntensity: { value: 0.2 },
    uGlareStrength: { value: 1 },
    uDirtStrength: { value: 0.14 },
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
    uniform float uGlareStrength;
    uniform float uDirtStrength;
    uniform float uSaturation;
    uniform vec3 uColorBalance;
    uniform float uAspect;
    varying vec2 vUv;

    // Fourteen taps retain the broad shaft shape at the adaptive render scale
    // while halving the most expensive full-screen part of this pass.
    #define SHAFT_SAMPLES 14

    float brightMask(vec3 color) {
      // Only genuinely HDR-bright sources (the sun core, strong glare) feed
      // the shafts — ordinary hazy sky must not, or looking sunward becomes
      // a white-out instead of beams. These two moved with the bloom gate
      // below and for the same reason: the dome is a marched atmosphere now
      // and its horizon really is several times its zenith, where the fit it
      // replaced was compressed to sit just under whatever gate it was given.
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return smoothstep(8.6, 20.6, luminance);
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
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.008, 0.0)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen - vec2(0.008, 0.0)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.0, 0.008)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen - vec2(0.0, 0.008)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.012, 0.012)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(0.012, -0.012)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen + vec2(-0.012, 0.012)).rgb);
        sunVisible += brightMask(texture2D(tDiffuse, uSunScreen - vec2(0.012, 0.012)).rgb);
        sunVisible *= 0.111111 * uSunPresence;

        vec2 toSun = (vUv - uSunScreen) * vec2(uAspect, 1.0);
        float sunDistance = length(toSun);
        // uGlareStrength lets a washed world (the polder) keep the aureole
        // without the wide veil that ate its midtones when looking sunward.
        float glare = (exp(-sunDistance * sunDistance * 42.0) * 0.12
          + exp(-sunDistance * 7.5) * 0.026) * uGlareStrength;
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

interface DisjointTimerQueryExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

class GpuFrameTimer {
  private readonly context: WebGL2RenderingContext | null;
  private readonly extension: DisjointTimerQueryExtension | null;
  private active: WebGLQuery | null = null;
  private readonly pending: WebGLQuery[] = [];

  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    this.context = "createQuery" in context ? context : null;
    this.extension = this.context?.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as DisjointTimerQueryExtension | null;
  }

  begin(): void {
    this.poll();
    if (!this.context || !this.extension || this.active || this.pending.length > 8) {
      return;
    }
    const query = this.context.createQuery();
    if (!query) return;
    this.context.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.context || !this.extension || !this.active) return;
    this.context.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  poll(): void {
    if (!this.context || !this.extension) return;
    while (this.pending.length > 0) {
      const query = this.pending[0];
      const available = this.context.getQueryParameter(
        query,
        this.context.QUERY_RESULT_AVAILABLE,
      ) as boolean;
      if (!available) break;
      this.pending.shift();
      const disjoint = this.context.getParameter(
        this.extension.GPU_DISJOINT_EXT,
      ) as boolean;
      if (!disjoint) {
        const nanoseconds = this.context.getQueryParameter(
          query,
          this.context.QUERY_RESULT,
        ) as number;
        performanceGovernor.recordGpu(nanoseconds / 1_000_000);
      }
      this.context.deleteQuery(query);
    }
  }

  dispose(): void {
    if (!this.context) return;
    if (this.active) this.context.deleteQuery(this.active);
    for (const query of this.pending) this.context.deleteQuery(query);
    this.active = null;
    this.pending.length = 0;
  }
}

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
  /** Байтовые таргеты блума: платформенный костыль Metal для польдера. */
  byteBloom = false,
  /** Scales shafts, glare and lens dirt. Polder uses <1 so sunward views
   * keep midtone grass instead of a white veil; cloud deck is untouched. */
  sunVeil = 1,
}: {
  compact: boolean;
  byteBloom?: boolean;
  sunVeil?: number;
}) {
  const { camera, gl, scene, size } = useThree();
  const dpr = useThree((state) => state.viewport.dpr);
  const sunWorld = useMemo(() => new Vector3(), []);
  const cameraForward = useMemo(() => new Vector3(), []);
  const duskShaftColor = useMemo(() => new Color("#ffb46a"), []);
  const smoothedSunPresence = useRef(0);
  const gpuTimer = useMemo(() => new GpuFrameTimer(gl.getContext()), [gl]);
  const veil = MathUtils.clamp(sunVeil, 0, 1);

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

    // THE GATE IS IN THE SKY'S UNITS. UnrealBloom's high pass does not pass
    // the excess over its threshold — it passes the WHOLE colour of anything
    // above it, so every value the sky routinely exceeds becomes a
    // full-brightness source blurred back down over the frame.
    //
    // The old 1.6 was set against an analytic sky compressed to sit just under
    // it. A marched atmosphere is not compressed: its horizon is genuinely
    // three to eight times its zenith, and at 1.6 up to a fifth of the whole
    // dome crossed the gate — a veil over the entire daylight frame. Measured
    // over both airs and every sun from 2° to 60°, 6.0 leaves at most 1.9% of
    // the dome and 22° of reach, which is an aureole around the sun and
    // nothing else. Polder keeps its slightly higher gate.
    const bloomPass = new UnrealBloomPass(
      new Vector2(32, 32),
      compact ? 0.1 : veil < 1 ? 0.11 : 0.13,
      0.35,
      veil < 1 ? 6.94 : 6,
    );
    // Блум живёт в HalfFloat — 8-битные таргеты сплющивали HDR ярче единицы
    // (при пороге 6.94 — ВСЁ содержимое bright-буфера) и убивали цвет
    // ореола. После лечения бурь по корню HalfFloat держит серию 36 кадров
    // на польдере без единого плоского НА ANGLE/D3D (Windows). На Apple
    // (Metal) мерцание кадра вернулось при первой же проверке — там дорожка
    // всё ещё неисправна, и польдер держит байтовые таргеты платформенно.
    // Это деградация с настоящей ценой (белый ореол вместо тёплого);
    // снимать её можно только серией кадров, снятой НА Metal —
    // environmental-rendering-lessons §2.
    if (byteBloom) {
      bloomPass.renderTargetBright.texture.type = UnsignedByteType;
      for (const target of [
        ...bloomPass.renderTargetsHorizontal,
        ...bloomPass.renderTargetsVertical,
      ]) {
        target.texture.type = UnsignedByteType;
      }
    }
    composer.addPass(bloomPass);

    const cinematicPass = new ShaderPass(CinematicShader);
    const lensDirt = createLensDirtTexture();
    cinematicPass.uniforms.tLensDirt.value = lensDirt;
    cinematicPass.uniforms.uGlareStrength.value = veil;
    cinematicPass.uniforms.uDirtStrength.value = 0.14 * veil;
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
  }, [byteBloom, camera, compact, gl, scene, size.height, size.width, veil]);

  // Один владелец размера конвейера. Вызывается и эффектом (первый монтаж),
  // и КАЖДЫЙ КАДР перед composer.render: адаптивный DPR меняет буфер рисования
  // немедленно, а React-эффект прибегает на коммит позже — кадр, отрисованный
  // композером старого размера в буфер нового, и был «серым кадром» польдера.
  const appliedPipelineSize = useRef({ width: 0, height: 0, dpr: 0 });
  const syncPipelineSize = () => {
    const pixelRatio = gl.getPixelRatio();
    const applied = appliedPipelineSize.current;
    if (
      applied.width === size.width &&
      applied.height === size.height &&
      applied.dpr === pixelRatio
    ) {
      return;
    }
    applied.width = size.width;
    applied.height = size.height;
    applied.dpr = pixelRatio;
    pipeline.composer.setPixelRatio(pixelRatio);
    pipeline.composer.setSize(size.width, size.height);
    pipeline.bloomPass.setSize(
      Math.max(64, Math.round(size.width * pixelRatio * 0.5)),
      Math.max(64, Math.round(size.height * pixelRatio * 0.5)),
    );
    pipeline.cinematicPass.uniforms.uAspect.value =
      size.width / Math.max(1, size.height);
  };

  useEffect(() => {
    // Новый pipeline (useMemo) стартует с нулевым applied — эффект даёт ему
    // размер до первого кадра; dpr в зависимостях, чтобы отработал и путь,
    // когда кадровый цикл стоит (пауза, скрытая вкладка).
    appliedPipelineSize.current = { width: 0, height: 0, dpr: 0 };
    syncPipelineSize();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncPipelineSize стабилен по замыканию pipeline/gl/size
  }, [dpr, pipeline, size.height, size.width]);

  useEffect(
    () => () => {
      gpuTimer.dispose();
      pipeline.lensDirt.dispose();
      pipeline.aoPass?.dispose();
      pipeline.bloomPass.dispose();
      pipeline.cinematicPass.dispose();
      pipeline.outputPass.dispose();
      pipeline.smaaPass.dispose();
      pipeline.composer.dispose();
    },
    [gpuTimer, pipeline],
  );

  useFrame((_, delta) => {
    // Project the sun into screen space for the shafts/glare pass.
    const uniforms = pipeline.cinematicPass.uniforms;
    camera.getWorldDirection(cameraForward);
    const facing = cameraForward.dot(environmentState.sunDirection);
    if (facing <= 0.02) {
      smoothedSunPresence.current = MathUtils.damp(
        smoothedSunPresence.current,
        0,
        8,
        delta,
      );
      uniforms.uSunPresence.value = smoothedSunPresence.current;
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
      smoothedSunPresence.current = MathUtils.damp(
        smoothedSunPresence.current,
        edgeFade * daylight * aboveHorizon,
        8,
        delta,
      );
      uniforms.uSunPresence.value = smoothedSunPresence.current;
      (uniforms.uShaftColor.value as Color)
        .copy(environmentState.sunColor)
        .lerp(duskShaftColor, environmentState.twilightFactor * 0.55);
      uniforms.uShaftIntensity.value =
        (0.07 + environmentState.twilightFactor * 0.18) * veil;
      uniforms.uGlareStrength.value = veil;
      uniforms.uDirtStrength.value = 0.14 * veil;
    }
  });

  useFrame((_, delta) => {
    const gpuQuality = performanceGovernor.getSnapshot().gpuQuality;
    // Keep the pass graph stable. EffectComposer/N8AO can leave the final
    // screen target unwritten when passes are disabled after construction on
    // some Chrome/WebGL combinations, producing a live but flat-grey canvas.
    // DPR is the safe adaptive GPU lever; cheaper shader details below never
    // change which pass owns the screen buffer.
    const sunPresence = pipeline.cinematicPass.uniforms.uSunPresence;
    const restoredSunPresence = sunPresence.value;
    if (gpuQuality === 0) sunPresence.value = 0;
    // Размер конвейера сверяется с буфером В ЭТОМ кадре, до рендера: смена
    // DPR никогда не должна дожить до composer.render рассинхроненной.
    syncPipelineSize();
    gpuTimer.begin();
    try {
      pipeline.composer.render(delta);
    } finally {
      gpuTimer.end();
      sunPresence.value = restoredSunPresence;
    }
  }, 1);

  return null;
}
