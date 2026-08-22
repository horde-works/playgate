"use client";

import {
  Sky,
  SpotLight as VolumetricSpotLight,
  useDepthBuffer,
} from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentRef,
} from "react";
import {
  AdditiveBlending,
  BackSide,
  Color,
  CubeCamera,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  MathUtils,
  Mesh,
  NoToneMapping,
  PMREMGenerator,
  PointLight,
  RGBAFormat,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SpotLight as ThreeSpotLight,
  ShaderMaterial,
  Vector3,
  WebGLCubeRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { Sky as SkyImpl } from "three-stdlib";
import type {
  LampDefinition,
  LampEventState,
  SpotLightDefinition,
} from "./destructionScene";
import {
  setSignalGlassGlow,
  setWindowGlow,
  updateMaterialEnvironment,
} from "./materialTextures";
import {
  cloudShaftStrengthAmount,
  airForwardScatterAmount,
  landHazeBand,
  setMaterialAtmosphere,
} from "./materialAtmosphere.ts";
import { environmentState } from "./environmentState";
import {
  installSkyClouds,
  setSkyBakeCoarse,
  setSkyCloudCoarse,
  setSkyMarchQuality,
  type SkyCloudUniforms,
} from "./skyClouds";
import {
  DOME_FACE_COUNT,
  DOME_FACE_SIZE,
  DOME_REPAINT_STRIDES,
  DOME_SETTLE_CYCLES,
  SKY_DOME_CACHE_ENABLED,
  domeNeedsContinuousRepaint,
  sunDirectionBucket,
} from "./skyDomeModel.ts";
import { performanceGovernor } from "./performanceGovernor";
import {
  ATMOSPHERE,
  CLEAR_SKY,
  cloudDrift,
  cloudEdgeFor,
  extinctionLength,
  getSkyFieldData,
  skyHaze,
  sunOcclusionAt,
  weatherFieldOrigin,
  type SkyWeather,
} from "./skyWeatherModel.ts";
import {
  elevationDegrees,
  horizonColour,
  nightLevel,
  setAirHaze,
  skyFill,
  sunBeam,
  transmittanceAt,
} from "./atmosphereModel.ts";
import { lampBeaconOpacity, lampBeaconWorldDiameter } from "./lampBeacon";
import {
  lampEventLevel,
  lampInteriorFactor,
  lampSelfCastFactor,
  lampTimeFactor,
  smoothLampLevel,
} from "./lampEventLighting";
import {
  PERSISTENT_LAMP_GROUP_PRIORITY,
  selectGroupedLampCandidates,
} from "./lampPoolSelection";
import {
  LAMP_ASSIGNMENT_INTERVAL_SECONDS,
  beginLampCandidateFrame,
  collectUnassignedWaiting,
  createLampPoolScratch,
  markLampKeepIds,
  nearestLampCandidate,
  pushLampCandidate,
  sortLampCandidates,
} from "./lampPoolRuntime";
import { windState } from "./windState";
import {
  DEFAULT_SOLAR_FRAME,
  TIME_OF_DAY_TARGETS,
  equinoxSunDirection,
  type SolarFrameDefinition,
  type TimeOfDay,
} from "./timeOfDay";

export type { TimeOfDay } from "./timeOfDay";

/**
 * Ambient light and reflections come from the actual sky: a PMREM capture of
 * the same atmosphere shader the visible dome uses, re-baked as the sun
 * moves. At dusk the whole world warms up — walls, puddles and steel reflect
 * the sky they actually stand under, which is most of what makes wet ground
 * read as wet.
 */
export function SceneEnvironment({
  theme = "town",
}: {
  theme?: "town" | "fortress";
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  const skyScene = useMemo(() => {
    const holder = new Scene();
    const sky = new SkyImpl();
    sky.scale.setScalar(48);
    // `three-stdlib` shares one material across every Sky, so the graft that
    // turns the dome into a marched atmosphere is already on this one and its
    // air is the world's air. Nothing to copy across: setting it here would be
    // the second place a number lives, which is how these two drifted before.
    holder.add(sky);
    return { holder, sky };
  }, [theme]);
  const currentTarget = useRef<WebGLRenderTarget | null>(null);
  const pendingDispose = useRef<WebGLRenderTarget | null>(null);
  const lastBakedSun = useRef(new Vector3(Number.NaN, 0, 0));
  const lastDomeVersion = useRef(-1);

  useEffect(() => {
    // Ambient comes from the dome, so it is measured against the dome. The
    // dome now leaves its shader in scene-linear radiance of its own, so this
    // is a plain trim on how much of the sky's light the world receives.
    scene.environmentIntensity = ATMOSPHERE.ambientIntensity;
    return () => {
      scene.environmentIntensity = 1;
      scene.environment = null;
      pendingDispose.current?.dispose();
      pendingDispose.current = null;
      currentTarget.current?.dispose();
      currentTarget.current = null;
      pmrem.dispose();
    };
  }, [pmrem, scene]);

  useFrame(() => {
    // Day punch on ambient: full sun → less sky bounce in every material;
    // dusk restores the authored trim so twilight does not go dead.
    const punch = environmentState.dayFactor * (1 - environmentState.nightFactor);
    scene.environmentIntensity =
      ATMOSPHERE.ambientIntensity
      * MathUtils.lerp(1, DAY_AMBIENT_WEIGHT, punch);

    // Drop the previous PMREM a frame late: disposing the in-use env map
    // the same frame as the swap left puddles without IBL for one tick —
    // wetness blinking off then on.
    pendingDispose.current?.dispose();
    pendingDispose.current = null;

    // Re-bake only when the sun has moved ~2°, or the amortized dome
    // finished a repaint. Rounding each axis used to hunt around .5 and
    // rebuild IBL every few seconds while the sun was "parked".
    const direction = environmentState.sunDirection;
    const domeVersion = environmentState.skyDomeVersion;
    const sunStable =
      Number.isFinite(lastBakedSun.current.x) &&
      lastBakedSun.current.dot(direction) > 0.9994;
    if (sunStable && domeVersion === lastDomeVersion.current) {
      return;
    }
    lastBakedSun.current.copy(direction);
    lastDomeVersion.current = domeVersion;

    let target: WebGLRenderTarget;
    if (environmentState.skyDomeTexture) {
      // Готовый купол уже отмаршировал небо на авторском максимуме — ambient
      // остаётся только переблюрить его. Шесть рендеров неба не нужны.
      target = pmrem.fromCubemap(environmentState.skyDomeTexture);
    } else {
      skyScene.sky.material.uniforms.sunPosition.value
        .copy(environmentState.sunPosition)
        .normalize();
      // Six cube faces of the same shader the visible sky uses — three-stdlib
      // shares one material across every Sky. Walk the deck coarsely for them:
      // what survives the blur is its average brightness, not its billows.
      // Deck coarse; air full — sunset gradient survives PMREM blur.
      setSkyBakeCoarse(skyScene.sky.material, { clouds: true, air: false });
      target = pmrem.fromScene(skyScene.holder, 0.028, 1, 60);
      setSkyBakeCoarse(skyScene.sky.material, { clouds: false, air: false });
    }
    scene.environment = target.texture;
    pendingDispose.current = currentTarget.current;
    currentTarget.current = target;
  });

  return null;
}

/**
 * THE ONE MOMENT EVERY GAIN IS PINNED TO: a clear midday over the polder, sun
 * at 37.6°, in this world's own ordinary air. Written down rather than
 * evaluated here because the model's tables are built per world air and this
 * anchor must not move with the world — `tests/sky-exposure` recomputes both
 * numbers from `atmosphereModel` and fails if they have drifted.
 *
 * Everything below is a unit conversion against this one measurement, not a
 * mood: each was chosen once so that midday keeps exactly the exposure it had
 * before the sky became something we measure.
 */
const NOON = { beam: 0.906, fill: 1.532 } as const;

/** Key at that noon lands on the 4.2 it used to be. */
const KEY_GAIN = 4.64;
/**
 * The moon. This one IS authored and it is NOT physical: real moonlight is
 * about a four-hundred-thousandth of sunlight, and a world lit that way at
 * night is a black screen. A twelfth is the playable lie, and it is the only
 * light in this file that the atmosphere does not answer for.
 */
const MOON_INTENSITY = 0.35;
/** Hemisphere at that same noon lands on the 0.46 it used to be. */
const HEMISPHERE_GAIN = 0.3;
/** What is left of the fill under a moon, once the sky has stopped giving. */
const HEMISPHERE_NIGHT = 0.1;
/**
 * Day punch: how much of the authored fill survives under a high sun.
 * Full sun → key owns the frame; dusk/night → weight returns to 1 so twilight
 * stays readable. Without this, fill+PMREM lift every midtone into haze.
 */
const DAY_FILL_WEIGHT = 0.48;
/** Same idea for PMREM ambient — sky bounce, not a second sun. */
const DAY_AMBIENT_WEIGHT = 0.55;
/**
 * How much of the dome's irradiance reaches the shaded side of a cumulus.
 * The march applies its own base-to-top profile and its own occlusion on top
 * of this; what this carries is the COLOUR of the fill and its order of
 * magnitude against the lit side.
 */
const CLOUD_FILL_SHARE = 0.55;
/**
 * Moon beam on the deck vs noon key. Smaller than the ground-key ratio on
 * purpose: AgX against a black night sky turns ~8% of day cloud into white
 * slabs, and every world shared that look. ~3% keeps moonlight readable
 * without reading as self-lit cumulus.
 */
const MOON_CLOUD_GAIN = 0.028;
/**
 * Moon is a point source, not a second sun. `skyFill(moon)` invents a full
 * daytime dome and made night lit≈shade — flat glowing blobs. Soft fill is a
 * fraction of the moon beam so heaps keep a lit side and a dark body.
 */
const MOON_CLOUD_FILL_SHARE = 0.18;
/**
 * How much of the beam a cloud takes comes back as diffuse fill rather than
 * being reflected to space or absorbed. A cumulus is not a lid: its albedo is
 * high and most of what it intercepts still arrives, just from everywhere at
 * once instead of from one direction. Without this term walking into shade
 * would be a light switch, which is the one thing shade is not.
 */
const CLOUD_DIFFUSE_RETURN = 0.45;
/**
 * What the scene's own lights come to at that noon — the divisor that makes
 * `groundLightLevel` read 1 there, so the number means the same thing in
 * every world and on the very first frame.
 */
const NOON_GROUND_LIGHT = KEY_GAIN * NOON.beam + HEMISPHERE_GAIN * NOON.fill;

export function DayNightCycle({
  mode,
  nightRef,
  worldTimeRef,
  theme = "town",
  worldRadius,
  skyRadius,
  fogDistances,
  solarFrame,
  worldCenter,
  cameraFar = 140,
  snapVersion = 0,
  cinematic = false,
  weather = CLEAR_SKY,
  sceneId = "",
}: {
  mode: TimeOfDay;
  nightRef: { current: number };
  /** Continuous solar time shared with clocks and other mutable objects. */
  worldTimeRef?: { current: number };
  theme?: "town" | "fortress";
  worldRadius?: number;
  /** Explicit dome radius for routes extending beyond the physical island. */
  skyRadius?: number;
  /** Явные дальности тумана сцены; без них считаются от радиуса мира. */
  fogDistances?: readonly [near: number, far: number] | null;
  solarFrame?: SolarFrameDefinition | null;
  worldCenter?: readonly [number, number];
  cameraFar?: number;
  snapVersion?: number;
  cinematic?: boolean;
  /** Authored weather. `CLEAR_SKY` leaves the analytic dome untouched. */
  weather?: SkyWeather;
  /** Scene id — place character for land haze (polder mist, steppe clear…). */
  sceneId?: string;
}) {
  const directional = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const fogRef = useRef<Fog>(null);
  const backgroundRef = useRef<Color>(null);
  const time = useRef(TIME_OF_DAY_TARGETS.day);
  const appliedSnapVersion = useRef(snapVersion);
  const fortress = theme === "fortress";
  // Sun-shadow ortho half-extent: sized by the world, floored at the old
  // constants so small islands keep their texel density.
  const shadowHalf = Math.max(fortress ? 95 : 70, (worldRadius ?? 58) * 1.08);
  // Moonlight is the one key this file still authors: there is no lunar
  // ephemeris here, so below the horizon the model has nothing left to answer.
  const moonColor = useMemo(() => new Color("#8fa5c8"), []);
  const groundBounce = useMemo(
    () => new Color(fortress ? "#31352f" : "#4d5d38"),
    [fortress],
  );

  const shadowThrottle = useRef(1);
  const sunWasMoving = useRef(false);
  const skyRef = useRef<ComponentRef<typeof Sky>>(null);
  const clouds = useRef<SkyCloudUniforms | null>(null);
  const domeViewRef = useRef<Mesh>(null);
  /**
   * Развёртка перекраски купола: грань-курсор, готовность, бакет солнца,
   * счётчик чистых оборотов (закон DOME_SETTLE_CYCLES) и чётность кадров
   * для страйда перекраски.
   */
  const domeState = useRef({
    cursor: 0,
    completed: false,
    bucket: "",
    cleanCycles: 0,
    frameParity: 0,
    /** Число программ рендерера в прошлый кадр — детектор бури компиляций. */
    programCount: 0,
    /** Оборот дописан — обмен буферов ждёт СЛЕДУЮЩЕГО кадра (см. ниже). */
    pendingSwap: false,
    /** Был ли хоть один применённый обмен: до него показывать нечего. */
    everSwapped: false,
  });

  // Амортизированный купол (skyDomeModel.ts): небо маршируется в кубокарту
  // грань за граню, кадр читает её одной выборкой. Sky здесь делит ОДИН
  // материал со всеми Sky мира (three-stdlib), так что солнце, погода и дрейф
  // приходят сами.
  //
  // Кубокарт ДВЕ — задняя красится, передняя показывается, обмен по
  // завершении оборота. Красить прямо в показываемую текстуру нельзя по
  // двум причинам сразу: (1) на ANGLE «покрасил грань → семплишь тот же
  // кубмап в том же кадре» изредка читается чёрной гранью — стена в небе,
  // которая живёт до следующей инвалидации (репро: тяжёлый кадр смены
  // оружия; sync-read после покраски гонку глушил); (2) при смене света
  // зритель видел полкупола старого солнца и полкупола нового.
  const dome = useMemo(() => {
    const makeTarget = (label: string) => {
      const cube = new WebGLCubeRenderTarget(DOME_FACE_SIZE, {
        type: HalfFloatType,
        generateMipmaps: false,
      });
      cube.texture.name = `sky:dome-cache:${label}`;
      return cube;
    };
    const targets = [makeTarget("a"), makeTarget("b")] as const;
    const holder = new Scene();
    const sky = new SkyImpl();
    sky.scale.setScalar(48);
    holder.add(sky);
    const rig = new CubeCamera(0.1, 60, targets[0]);
    // Высота глаза, не ноль: марш воздуха читает таблицы атмосферы по высоте
    // наблюдателя, и ровно в h = 0 зенитный луч попадает в граничный тексель
    // таблицы — купол получает чёрную верхнюю грань. Живой марш никогда не
    // ходит с нулевой высоты, и купол не должен.
    rig.position.y = 1.7;
    holder.add(rig);
    const viewGeometry = new SphereGeometry(1, 48, 24);
    const viewMaterial = new ShaderMaterial({
      uniforms: {
        uDome: { value: targets[0].texture },
        uDomeCenter: { value: new Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Как у родного Sky: купол прижат к дальней плоскости. Без этого
          // сферу режет camera.far с ракурсов, где её поверхность дальше
          // дальней плоскости (камера не в центре мира), — чёрный сектор
          // с дуговой границей ровно в азимуте от центра.
          gl_Position.z = gl_Position.w;
        }
      `,
      // Радианс купола лежит в кубокарте scene-linear (грани печатаются с
      // выключенным tonemapping), поэтому дальше он проходит ровно тот же
      // хвост конвейера, что и живой марш.
      fragmentShader: /* glsl */ `
        uniform samplerCube uDome;
        uniform vec3 uDomeCenter;
        varying vec3 vWorldPosition;
        void main() {
          vec3 direction = normalize(vWorldPosition - uDomeCenter);
          vec4 sky = textureCube(uDome, direction);
          gl_FragColor = vec4(sky.rgb, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: BackSide,
      depthWrite: false,
    });
    return {
      targets,
      // Индекс ЗАДНЕЙ кубокарты — в неё красят; передняя показывается.
      back: { index: 1 },
      holder,
      sky,
      rig,
      viewGeometry,
      viewMaterial,
    };
  }, []);

  useEffect(
    () => () => {
      environmentState.skyDomeTexture = null;
      dome.viewMaterial.dispose();
      dome.viewGeometry.dispose();
      for (const target of dome.targets) target.dispose();
    },
    [dome],
  );
  /** Elevation the measurement below was last taken at, in degrees. */
  const measuredAt = useRef(Number.NaN);
  /** How much of the sun the deck is holding back, damped across frames. */
  const shadeRef = useRef(0);
  const measured = useMemo(
    () => ({
      keyColour: new Color(1, 1, 1),
      keyLevel: 0,
      fillColour: new Color(1, 1, 1),
      fillLevel: 0,
      horizon: new Color(0, 0, 0),
      cloudLit: new Color(0, 0, 0),
      cloudShade: new Color(0, 0, 0),
    }),
    [],
  );

  // The air a world stands in. Set before anything asks the model a question,
  // because the tables it answers from are built per air.
  useLayoutEffect(() => {
    setAirHaze(skyHaze(theme, cinematic));
    measuredAt.current = Number.NaN;
  }, [cinematic, theme]);

  // Drawn after the opaque world so the per-pixel scattering shader only runs
  // where sky is actually visible instead of being overdrawn by the terrain.
  // Центр купола — центр мира: пропсы drei Sky позицию не принимают, а
  // купол в начале координат оставлял восточный край туманного моря первой
  // карты снаружи неба.
  useLayoutEffect(() => {
    if (skyRef.current) {
      skyRef.current.renderOrder = 1000;
      skyRef.current.position.set(worldCenter?.[0] ?? 0, 0, worldCenter?.[1] ?? 0);
    }
    if (domeViewRef.current) {
      domeViewRef.current.renderOrder = 1000;
      domeViewRef.current.position.set(
        worldCenter?.[0] ?? 0,
        0,
        worldCenter?.[1] ?? 0,
      );
      dome.viewMaterial.uniforms.uDomeCenter.value.set(
        worldCenter?.[0] ?? 0,
        0,
        worldCenter?.[1] ?? 0,
      );
    }
  }, [dome, worldCenter]);

  // DirectionalLight.target is a separate Object3D — three only aims the
  // shadow camera if that target lives in the scene graph.
  useLayoutEffect(() => {
    const light = directional.current;
    if (!light) return;
    const scene = light.parent;
    if (scene && light.target.parent !== scene) {
      scene.add(light.target);
    }
    light.target.position.set(worldCenter?.[0] ?? 0, 0, worldCenter?.[1] ?? 0);
    light.target.updateMatrixWorld();
  }, [worldCenter]);

  // The marched atmosphere and the weather field are grafted onto the dome
  // together. A world without an authored sky still gets the air; what it
  // skips is the cloud deck, whose every branch leaves at the first test.
  useLayoutEffect(() => {
    const material = skyRef.current?.material;
    if (!material) return;
    clouds.current ??= installSkyClouds(material);
    clouds.current?.setWeather(weather);
    clouds.current?.setHaze(skyHaze(theme, cinematic));
  }, [cinematic, theme, weather]);

  /**
   * Одна грань купола за кадр. Марш — всегда на авторском максимуме: это
   * амортизация, а не спуск качества; сколько бы губернатор ни срезал живой
   * марш, кэшированное небо остаётся полным. Радианс печатается scene-linear
   * (tonemapping выключен), чтобы выборка из купола прошла тот же хвост
   * конвейера, что и живой марш.
   */
  const renderDomeFace = (gl: WebGLRenderer, face: number) => {
    const material = dome.sky.material;
    // CubeCamera ориентирует свои шесть камер только в updateCoordinateSystem,
    // который зовёт update(); при ручном рендере граней его надо позвать
    // самим — иначе все шесть камер смотрят в одну сторону, и купол
    // становится шестью копиями одного вида.
    if (dome.rig.coordinateSystem !== gl.coordinateSystem) {
      dome.rig.coordinateSystem = gl.coordinateSystem;
      dome.rig.updateCoordinateSystem();
    }
    const previousToneMapping = gl.toneMapping;
    const previousTarget = gl.getRenderTarget();
    const previousXr = gl.xr.enabled;
    const previousShadowUpdate = gl.shadowMap.needsUpdate;
    gl.toneMapping = NoToneMapping;
    gl.xr.enabled = false;
    gl.shadowMap.needsUpdate = false;
    setSkyMarchQuality(material, 2);
    gl.setRenderTarget(dome.targets[dome.back.index], face);
    if (gl.autoClear === false) gl.clear();
    gl.render(dome.holder, dome.rig.children[face] as PerspectiveCamera);
    // Явный неблокирующий flush: на ANGLE/D3D офскрин-покраска грани,
    // поданная в один submit с тяжёлым кадром (компиляции, загрузка
    // текстур нового инструмента), изредка теряется — грань остаётся
    // чёрной. Синхронное чтение текселя гонку глушило (замер 4/4 против
    // 4/5 стены без него); flush упорядочивает отправку без блокировки.
    gl.getContext().flush();
    if (
      process.env.NODE_ENV !== "production" &&
      (window as typeof window & { __mamDomeTripwire?: boolean })
        .__mamDomeTripwire
    ) {
      // Ловушка «чёрной грани» (включается window.__mamDomeTripwire = true):
      // читаем один тексель свежепокрашенной грани, ПОКА она привязана
      // (сырой readPixels; readRenderTargetPixels с кубическим таргетом
      // падает в bindFramebuffer). Днём радианс неба нигде не ноль; нулевой
      // тексель = грань не напечаталась. Чтение синхронно и само глушит
      // гонку — поэтому только по явному флагу, не фоном.
      try {
        const context = gl.getContext() as WebGL2RenderingContext;
        const probe = new Float32Array(4);
        context.readPixels(
          DOME_FACE_SIZE >> 1,
          DOME_FACE_SIZE >> 1,
          1,
          1,
          context.RGBA,
          context.FLOAT,
          probe,
        );
        const scope = window as typeof window & {
          __mamDomeDebug?: Array<Record<string, unknown>>;
        };
        const log = (scope.__mamDomeDebug ??= []);
        log.push({
          face,
          rgb: [probe[0], probe[1], probe[2]].map((v) => +v.toFixed(4)),
          glError: context.getError(),
          sunY: +environmentState.sunDirection.y.toFixed(3),
          t: Math.round(performance.now()),
        });
        if (log.length > 400) log.splice(0, log.length - 400);
      } catch {
        // Диагност не жилец — мир жилец.
      }
    }
    gl.setRenderTarget(previousTarget);
    gl.toneMapping = previousToneMapping;
    gl.xr.enabled = previousXr;
    gl.shadowMap.needsUpdate = previousShadowUpdate;
    setSkyMarchQuality(
      material,
      performanceGovernor.atmosphereQuality(),
    );
  };

  // A cinematic replay can begin while the previous run is still at night.
  // Snap before the first rendered frame so recording never captures that
  // stale lighting state. Ordinary N-key changes continue to glide smoothly.
  useLayoutEffect(() => {
    if (appliedSnapVersion.current === snapVersion) {
      return;
    }
    appliedSnapVersion.current = snapVersion;
    time.current = TIME_OF_DAY_TARGETS[mode];
    if (worldTimeRef) {
      worldTimeRef.current = time.current;
    }
  }, [mode, snapVersion, worldTimeRef]);

  useFrame((frameState, delta) => {
    const target = TIME_OF_DAY_TARGETS[mode];
    const diff = ((target - time.current + 1.5) % 1) - 0.5;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), delta * 0.22);
    const sunIsMoving = Math.abs(step) > 0.00001;
    shadowThrottle.current += delta;
    // While the sun moves, refresh often; at rest, a slow heartbeat re-renders
    // the cached map so a shadow pass that ran before the world finished
    // mounting can never leave the scene shadowless.
    if (
      (sunIsMoving && shadowThrottle.current > 0.24) ||
      (!sunIsMoving && sunWasMoving.current) ||
      shadowThrottle.current > 1.2
    ) {
      shadowThrottle.current = 0;
      frameState.gl.shadowMap.needsUpdate = true;
    }
    sunWasMoving.current = sunIsMoving;

    time.current = (time.current + step + 1) % 1;
    if (worldTimeRef) {
      worldTimeRef.current = time.current;
    }
    // Live sky march budget follows atmosphere quality: auto stays at
    // author maximum so IBL/wet puddles do not hunt. Bake still forces
    // coarse via setSkyCloudCoarse. Kill-switch freezes at full.
    clouds.current?.setMarchQuality(
      performanceGovernor.atmosphereQuality(),
    );
    // ОДНО СОЛНЦЕ. Высоту и положение берут из одного вектора, иначе луч и
    // купол расходятся во мнении, который час: прежний фолбэк для мира без
    // `solarFrame` спрашивал высоту у `Math.sin(angle)`, а положение собирал с
    // множителями (30, 26, 24), и в полдень это были солнце в зените для света
    // против солнца на 42.8° для неба. См. DEFAULT_SOLAR_FRAME.
    const geographicSun = equinoxSunDirection(
      time.current,
      solarFrame ?? DEFAULT_SOLAR_FRAME,
    );
    const elevation = geographicSun[1];
    const night = nightLevel(elevation);
    const moonDirection = [
      -geographicSun[0],
      -geographicSun[1],
      -geographicSun[2],
    ] as const;
    const moonKey = night > 0.5;
    const activeKey = moonKey ? moonDirection : geographicSun;
    const sunX = geographicSun[0] * 30;
    const sunZ = geographicSun[2] * 30;
    const sunY = geographicSun[1] * 30;
    const keyX = activeKey[0] * 30;
    const keyY = moonKey ? activeKey[1] * 30 : Math.max(sunY, 0.65);
    const keyZ = activeKey[2] * 30;
    // A band a few degrees either side of the horizon: what shafts and lens
    // glare are scaled by, and the only remaining hand-shaped curve here.
    const elevationNow = elevationDegrees(elevation);
    const twilight = MathUtils.clamp(1 - Math.abs(elevationNow) / 9, 0, 1);

    // ---- ASK THE AIR -----------------------------------------------------
    // Not every frame: a quarter of a degree of solar elevation is half the
    // sun's own diameter, and nothing in the frame can resolve a smaller step.
    // Between measurements this costs nothing at all.
    // Written as a NOT of the near test so the first frame, where nothing has
    // been measured yet, falls through it.
    if (!(Math.abs(elevationNow - measuredAt.current) < 0.25)) {
      measuredAt.current = elevationNow;
      const length = Math.hypot(sunX, sunY, sunZ) || 1;
      const unitSun = [sunX / length, sunY / length, sunZ / length] as const;

      const beam = sunBeam(elevation);
      measured.keyColour.setRGB(beam.colour[0], beam.colour[1], beam.colour[2]);
      measured.keyLevel = beam.level;

      const fill = skyFill(unitSun);
      measured.fillColour.setRGB(fill.colour[0], fill.colour[1], fill.colour[2]);
      measured.fillLevel = fill.level;

      // The edge veil is one colour for every bearing, so it takes the mean of
      // the horizon around the compass. Per-direction aerial perspective is
      // not this: the piece materials already read it out of the sky bake
      // along their own view ray.
      measured.horizon.setRGB(0, 0, 0);
      const bearings = 8;
      for (let bearing = 0; bearing < bearings; bearing += 1) {
        const sample = horizonColour(
          unitSun,
          ((bearing + 0.5) / bearings) * Math.PI * 2,
        );
        measured.horizon.r += sample[0] / bearings;
        measured.horizon.g += sample[1] / bearings;
        measured.horizon.b += sample[2] / bearings;
      }

      // A cumulus is lit at ITS OWN ALTITUDE, and that is the whole reason a
      // sunset sky burns while the ground under it has already gone dark: at
      // a sun on the horizon the beam reaching 680 m still carries 15% of its
      // red against the ground's 9%, and a degree later the ground has none
      // left while the cloud base still has 2%. Asking this at height costs
      // one table lookup and buys the effect nothing else in the frame gives.
      // After civil twilight the sun term is zero and the deck must read the
      // moon at the same altitude — otherwise the shader still marches with a
      // sunken sun and the fill defaults read as a white daytime slab.
      const moonWeight = MathUtils.clamp((night - 0.35) / 0.3, 0, 1);
      const sunLitBeam = transmittanceAt(weather.baseAltitude, elevation);
      const moonLitBeam = transmittanceAt(weather.baseAltitude, moonDirection[1]);
      measured.cloudLit.setRGB(
        sunLitBeam[0] * (1 - moonWeight)
          + moonLitBeam[0] * MOON_CLOUD_GAIN * moonWeight,
        sunLitBeam[1] * (1 - moonWeight)
          + moonLitBeam[1] * MOON_CLOUD_GAIN * moonWeight,
        sunLitBeam[2] * (1 - moonWeight)
          + moonLitBeam[2] * MOON_CLOUD_GAIN * moonWeight,
      );
      // Day shade is the measured dome. Night shade is moonlight bounce —
      // moon colour, not skyFill(moon), which would relight the whole sky.
      const sunShade = measured.fillLevel * CLOUD_FILL_SHARE;
      const moonBeam = Math.max(
        moonLitBeam[0],
        moonLitBeam[1],
        moonLitBeam[2],
      );
      const moonShade = moonBeam * MOON_CLOUD_GAIN * MOON_CLOUD_FILL_SHARE;
      measured.cloudShade.setRGB(
        measured.fillColour.r * sunShade * (1 - moonWeight)
          + moonColor.r * moonShade * moonWeight,
        measured.fillColour.g * sunShade * (1 - moonWeight)
          + moonColor.g * moonShade * moonWeight,
        measured.fillColour.b * sunShade * (1 - moonWeight)
          + moonColor.b * moonShade * moonWeight,
      );
    }

    // ---- IS THE SUN BEHIND A CLOUD RIGHT NOW ----------------------------
    // Asked every frame, unlike the atmosphere above: the sun moves a degree
    // in minutes, but the deck rides the wind and a heap crosses the sun in
    // seconds. The walk is the same one the sky shader makes — same field,
    // same drift, same law — so what dims the world is the cloud that is
    // actually in front of the sun, not a number that correlates with one.
    //
    // Sampled at the CAMERA, and that is the honest limit of this: the whole
    // world dims together rather than shadows sliding across the field. The
    // per-point version needs the deck sampled in every surface shader; what
    // is published below is what that pass would read.
    const shadeTarget = weather.coverage > 0
      ? sunOcclusionAt(
        getSkyFieldData(),
        weather,
        frameState.camera.position.x,
        frameState.camera.position.y,
        frameState.camera.position.z,
        [
          environmentState.sunDirection.x,
          environmentState.sunDirection.y,
          environmentState.sunDirection.z,
        ],
        environmentState.cloudDrift,
      ) * weather.shadowStrength
      : 0;
    // A cloud edge crossing the sun takes a second or two of real time, not a
    // frame: damped, or the key light strobes as the march gains and loses a
    // sample. This is the same reasoning as the dither in the sky shader —
    // a stepped integral has to be smoothed somewhere.
    shadeRef.current = MathUtils.damp(shadeRef.current, shadeTarget, 2.2, delta);
    const shade = shadeRef.current;
    environmentState.sunOcclusion = shade;

    // The frame's whole light budget, worked out ONCE. Three consumers read it
    // — the key, the fill and everything hand-shaded — and the moment any of
    // them recomputes its own version is the moment grass ends up in a
    // different day from the ground. What the deck takes from the beam it
    // hands to the fill, less what it sends back to space.
    const beamLost = KEY_GAIN * measured.keyLevel * shade;
    // High sun → mute fill so key casts readable shade. Low sun / night →
    // full fill weight (twilight must stay lit by the sky, not the beam).
    const dayPunch = MathUtils.smoothstep(0.12, 0.78, measured.keyLevel / NOON.beam)
      * (1 - night)
      * (1 - shade * 0.35);
    const fillWeight = MathUtils.lerp(1, DAY_FILL_WEIGHT, dayPunch);
    const keyEnergy = KEY_GAIN * measured.keyLevel - beamLost + MOON_INTENSITY * night;
    const fillEnergy = HEMISPHERE_GAIN * measured.fillLevel * fillWeight
      + beamLost * CLOUD_DIFFUSE_RETURN
      + HEMISPHERE_NIGHT * night;

    if (directional.current) {
      // The shadow follows the real sun now. It used to be pinned no lower
      // than y = 7 — thirteen degrees — so no world has ever had a long
      // shadow. The floor left here is a degree and a bit, only so the shadow
      // matrix stays conditioned; by then the beam is 7% of its red and
      // whether it casts at all has stopped mattering.
      directional.current.position.set(keyX, keyY, keyZ);
      // Aim the shadow frustum at the island centre — worlds like Viking sit
      // off the origin, and a target left at (0,0,0) softens contact across
      // the courtyard that the eye is actually looking at.
      const aimX = worldCenter?.[0] ?? 0;
      const aimZ = worldCenter?.[1] ?? 0;
      directional.current.target.position.set(aimX, 0, aimZ);
      directional.current.target.updateMatrixWorld();
      // Key colour and strength are one measurement split in two, because
      // three multiplies them: the colour is the beam normalised, the
      // intensity is what is left of its strongest channel. Nothing here
      // decides that dusk is orange — the air already took the blue out.
      const moon = MOON_INTENSITY * night;
      const key = keyEnergy - moon;
      directional.current.intensity = keyEnergy;
      if (keyEnergy > 1e-5) {
        // Added as light, not blended as paint: through the crossover the sun
        // is still red and weak while the moon has come up, and a lerp between
        // the two would invent a colour that neither of them is.
        const sunShare = key / keyEnergy;
        const moonShare = moon / keyEnergy;
        directional.current.color.setRGB(
          measured.keyColour.r * sunShare + moonColor.r * moonShare,
          measured.keyColour.g * sunShare + moonColor.g * moonShare,
          measured.keyColour.b * sunShare + moonColor.b * moonShare,
        );
      }
    }
    if (hemisphere.current) {
      // The dome's own irradiance, trimmed to land where the authored fill
      // used to at noon. It is warm at dusk and blue at midday for the same
      // reason the sky is, and it does not need to be told which.
      //
      // Under cloud it GAINS what the beam just lost, less what the deck sends
      // back to space: a cumulus does not swallow the light, it turns it from
      // a direction into a diffuse wash. That is the whole readable difference
      // between sun and shade — not "darker", but shadows going soft and the
      // colour rolling over to the sky's.
      hemisphere.current.intensity = fillEnergy;
      hemisphere.current.color.copy(measured.fillColour);
      hemisphere.current.groundColor.copy(groundBounce);
    }

    fogRef.current?.color.copy(measured.horizon);
    backgroundRef.current?.copy(measured.horizon);

    // Fixtures are small now (sill lamps behind glass instead of whole
    // glowing panes), so they burn brighter to read at street distance — and
    // brighter again since the bloom gate moved into the sky's real units. A
    // bare bulb seen at night IS white with a halo round it; what it must not
    // be is dimmer than a daylight horizon while still haloing.
    setWindowGlow(night * 10);
    nightRef.current = night;

    // Publish the sun to everything that shades with it: sun-tinted fog in
    // the piece materials, the sky-driven ambient PMREM, and the post
    // pipeline's light shafts and lens effects.
    environmentState.sunPosition.set(sunX, sunY, sunZ);
    environmentState.sunDirection
      .copy(environmentState.sunPosition)
      .normalize();
    if (directional.current) {
      environmentState.sunColor.copy(directional.current.color);
      environmentState.keyLightDirection
        .copy(directional.current.position)
        .normalize();
      environmentState.keyLightColor.copy(directional.current.color);
    }
    // "How much direct sun is there" — which is what every consumer of this
    // actually wants: grass translucency, specular on water, the strength of
    // the shafts. It is the beam, normalised against a high sun, so it falls
    // off the way the beam does instead of running to a hand-picked floor —
    // and it takes the deck with it, because a sunbeam through a reed bed and
    // a shaft across the sky are both the DIRECT sun or they are nothing.
    environmentState.dayFactor = MathUtils.clamp(
      (measured.keyLevel * (1 - shade)) / NOON.beam,
      0,
      1,
    );
    environmentState.nightFactor = night;
    environmentState.twilightFactor = twilight;

    // The one number anything hand-shaded should light itself by. It is the
    // sum of exactly what the scene's own lights were just given — key, moon,
    // fill — divided by what that sum is at a clear midday, so "1" means "as
    // bright as noon" and a blade of grass cannot end up in a different day
    // from the ground it stands in.
    environmentState.groundLightLevel = (keyEnergy + fillEnergy) / NOON_GROUND_LIGHT;
    // Its colour is the two lights mixed by how much each contributes, so
    // dusk comes out warm and a moonlit night blue without either being
    // written down anywhere as a mood.
    const totalEnergy = Math.max(keyEnergy + fillEnergy, 1e-6);
    environmentState.groundLight.setRGB(
      (directional.current?.color.r ?? 1) * (keyEnergy / totalEnergy)
        + measured.fillColour.r * (fillEnergy / totalEnergy),
      (directional.current?.color.g ?? 1) * (keyEnergy / totalEnergy)
        + measured.fillColour.g * (fillEnergy / totalEnergy),
      (directional.current?.color.b ?? 1) * (keyEnergy / totalEnergy)
        + measured.fillColour.b * (fillEnergy / totalEnergy),
    );
    // Piece haze colour is the sky bake along the ray. Mie lobe aims at the
    // ACTIVE key (sun by day, moon by night) — same light the ground uses —
    // so dusk/night fog keeps density but takes the hour's colour, not a
    // leftover noon white.
    updateMaterialEnvironment({
      airExtinction: 1 / extinctionLength(weather),
      wetness: environmentState.wetness,
      time: frameState.clock.elapsedTime,
      windStrength: windState.strength,
      stains: theme === "town" ? 1 : 0,
    });
    const [fieldOriginX, fieldOriginZ] = weatherFieldOrigin(weather);
    const hazeBand = landHazeBand(worldRadius ?? 67, sceneId);
    setMaterialAtmosphere({
      sunDirection: [
        environmentState.keyLightDirection.x,
        environmentState.keyLightDirection.y,
        environmentState.keyLightDirection.z,
      ],
      sunFogColour: [
        environmentState.keyLightColor.r,
        environmentState.keyLightColor.g,
        environmentState.keyLightColor.b,
      ],
      airForwardScatter: airForwardScatterAmount(
        environmentState.dayFactor,
        measured.keyLevel,
        twilight,
        shade,
        night,
      ),
      nearHoldStart: hazeBand.nearHoldStart,
      nearHoldEnd: hazeBand.nearHoldEnd,
      landHazeNear: hazeBand.landHazeNear,
      landHazeFar: hazeBand.landHazeFar,
      landHazeStrength: hazeBand.landHazeStrength,
      cloudCoverage: weather.coverage,
      cloudEdge: cloudEdgeFor(weather.coverage),
      cloudBase: weather.baseAltitude,
      cloudThickness: weather.thickness,
      cloudScale: weather.fieldScale,
      cloudDrift: environmentState.cloudDrift,
      cloudFieldOrigin: [fieldOriginX, fieldOriginZ],
      cloudShaftStrength: cloudShaftStrengthAmount(
        weather.beamStrength,
        measured.cloudLit,
        environmentState.dayFactor,
        twilight,
      ),
      cloudLit: [
        measured.cloudLit.r,
        measured.cloudLit.g,
        measured.cloudLit.b,
      ],
    });

    // Keep the visible sun on the exact same frame-coherent position used by
    // glare and lens dirt. The old throttled React update left the sky disc a
    // few frames behind the post effect, producing short flashes in flyovers.
    const skyMaterial = skyRef.current?.material;
    if (skyMaterial && "uniforms" in skyMaterial) {
      skyMaterial.uniforms.sunPosition.value.set(sunX, sunY, sunZ);
    }
    clouds.current?.setNight(night, moonDirection);
    clouds.current?.setTwilight(twilight);

    // The deck rides the wind on world time, so the shadow it will cast can
    // be asked for at any world point without a second clock.
    if (clouds.current && weather.coverage > 0) {
      const [driftX, driftZ] = cloudDrift(weather, frameState.clock.elapsedTime);
      clouds.current.drift.set(driftX, driftZ);
      // The higher a layer sits, the faster the wind it rides: the three decks
      // never move as one sheet, which is most of what says they are at
      // different distances.
      clouds.current.midDrift.set(driftX * 1.45, driftZ * 1.45);
      clouds.current.cirrusDrift.set(driftX * 1.9, driftZ * 1.9);
      // The deck is lit by the beam that reaches ITS altitude and filled by
      // the sky, both measured. There is no night cloud colour to cross-fade
      // to any more: a cumulus goes dark because the light left, and it stays
      // burning for the minutes after sunset because at 680 m the light has
      // not left yet. Both come out of the same lookup.
      clouds.current.lit.copy(measured.cloudLit);
      clouds.current.shade.copy(measured.cloudShade);
      environmentState.cloudDrift[0] = driftX;
      environmentState.cloudDrift[1] = driftZ;
    }

    // ---- АМОРТИЗИРОВАННЫЙ КУПОЛ -----------------------------------------
    // Пока солнце стоит (а в обычной игре оно стоит всегда), небо маршируется
    // в кубокарту по одной грани за кадр, и весь кадр — включая служебные
    // проходы воды — читает её одной выборкой. Движущееся солнце возвращает
    // живой марш: кэш с шестикадровой развёрткой показал бы диск, скачущий
    // между гранями.
    const skyMesh = skyRef.current;
    const domeMesh = domeViewRef.current;
    if (skyMesh && domeMesh) {
      const state = domeState.current;
      // Кэш купола — только ручной Low. На автомате живой марш не снимают
      // и шаги неба не спускают: подмена на кубокарту 512 и охота 16↔10
      // шагов читались как «другая гамма», мокрый пол моргал.
      const domeTier =
        performanceGovernor.getQualityOverride() !== null
        && performanceGovernor.atmosphereQuality() === 0;
      if (!SKY_DOME_CACHE_ENABLED || !domeTier || sunIsMoving) {
        state.completed = false;
        state.cursor = 0;
        state.cleanCycles = 0;
        state.pendingSwap = false;
        state.everSwapped = false;
        environmentState.skyDomeTexture = null;
        skyMesh.visible = true;
        domeMesh.visible = false;
      } else {
        const bucket = sunDirectionBucket(
          environmentState.sunDirection.x,
          environmentState.sunDirection.y,
          environmentState.sunDirection.z,
        );
        if (state.bucket !== bucket) {
          // Свет сдвинулся без «движения» (дрожание у порога бакета):
          // купол не сбрасывается с экрана, но перекрашивается заново.
          state.cleanCycles = 0;
        }
        // Пока купол не устоялся (DOME_SETTLE_CYCLES чистых оборотов после
        // любой инвалидации) — красить обязательно; дальше — только миры с
        // дрейфующей палубой.
        const repaint =
          state.cleanCycles < DOME_SETTLE_CYCLES ||
          domeNeedsContinuousRepaint(weather.coverage);
        // ОТЛОЖЕННЫЙ ОБМЕН. Обменивать буферы в кадре, где докрашена
        // последняя грань, нельзя: главный проход тут же семплит кубокарту,
        // чью грань красили микросекунды назад, и ANGLE РОНЯЕТ эту покраску
        // насовсем — купол ездил с чёрной гранью 5 до следующей инвалидации
        // (замер: дамп буферов показывал ноль ровно в грани 5 заднего
        // буфера). Обмен применяется в НАЧАЛЕ следующего кадра: у
        // показываемого куба любая грань покрашена минимум кадр назад.
        if (state.pendingSwap) {
          state.pendingSwap = false;
          state.everSwapped = true;
          const painted = dome.targets[dome.back.index];
          dome.back.index = 1 - dome.back.index;
          dome.viewMaterial.uniforms.uDome.value = painted.texture;
          environmentState.skyDomeTexture = painted.texture;
        }
        // Буря компиляций (новое оружие, первый взрыв, чужой эффект): в
        // кадре, где родились новые GL-программы, ANGLE изредка роняет
        // офскрин-покраску грани в чёрное. Кадр покраски просто пропускается
        // — оборот растянется на кадры, зато купол не получит чёрной грани.
        const programCount = frameState.gl.info.programs?.length ?? 0;
        const compileStorm = programCount !== state.programCount;
        state.programCount = programCount;
        if (repaint && !compileStorm) {
          // Спуск оси — темп перекраски, а не качество грани: грань всегда
          // авторский максимум, страйд лишь растягивает оборот.
          const stride =
            DOME_REPAINT_STRIDES[performanceGovernor.atmosphereQuality()];
          state.frameParity = (state.frameParity + 1) % stride;
          if (state.frameParity === 0) {
            renderDomeFace(frameState.gl, state.cursor);
            state.cursor = (state.cursor + 1) % DOME_FACE_COUNT;
            if (state.cursor === 0) {
              // Версия растёт только на смене света: непрерывная перекраска
              // дрейфующей палубы не должна дёргать ambient-переблюр каждые
              // шесть кадров.
              if (!state.completed || state.bucket !== bucket) {
                environmentState.skyDomeVersion += 1;
              }
              if (state.bucket === bucket) {
                state.cleanCycles += 1;
              }
              state.completed = true;
              state.bucket = bucket;
              // Оборот дописан — обмен буферов отложен до следующего кадра
              // (см. pendingSwap выше): показывать свежекрашенную грань в её
              // же кадре нельзя.
              state.pendingSwap = true;
            }
          }
        }
        // Живой марш остаётся на экране, пока первый полный оборот не готов
        // И не применён первый обмен буферов: полкупола из кэша и полкупола
        // марша — это шов, а не амортизация.
        const domeReady = state.completed && state.everSwapped;
        skyMesh.visible = !domeReady;
        domeMesh.visible = domeReady;
      }
      if (process.env.NODE_ENV !== "production") {
        (window as typeof window & {
          __mamDomeDump?: () => unknown;
        }).__mamDomeDump = () => {
          const gl = frameState.gl;
          const previous = gl.getRenderTarget();
          const context = gl.getContext() as WebGL2RenderingContext;
          const report: Record<string, number[][]> = {};
          for (let targetIndex = 0; targetIndex < 2; targetIndex += 1) {
            const rows: number[][] = [];
            for (let face = 0; face < DOME_FACE_COUNT; face += 1) {
              gl.setRenderTarget(dome.targets[targetIndex], face);
              const pixels = new Float32Array(4 * 64);
              context.readPixels(
                (DOME_FACE_SIZE >> 1) - 4,
                (DOME_FACE_SIZE >> 1) - 4,
                8,
                8,
                context.RGBA,
                context.FLOAT,
                pixels,
              );
              let sum = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
              }
              rows.push([face, +(sum / (64 * 3)).toFixed(4)]);
            }
            report[dome.targets[targetIndex].texture.name] = rows;
          }
          gl.setRenderTarget(previous);
          return {
            shown: (
              dome.viewMaterial.uniforms.uDome.value as { name?: string }
            )?.name,
            backIndex: dome.back.index,
            report,
          };
        };
        (window as typeof window & {
          __mamSkyDebug?: () => Record<string, unknown>;
        }).__mamSkyDebug = () => ({
          skyVisible: skyMesh.visible,
          domeVisible: domeMesh.visible,
          completed: domeState.current.completed,
          cursor: domeState.current.cursor,
          cleanCycles: domeState.current.cleanCycles,
          backIndex: dome.back.index,
          shownTexture: (
            dome.viewMaterial.uniforms.uDome.value as { name?: string } | null
          )?.name,
          sunMoving: sunIsMoving,
          programCount: domeState.current.programCount,
        });
      }
    }
  });

  return (
    <>
      <color
        ref={backgroundRef}
        attach="background"
        args={[fortress ? "#84939d" : "#92b9c8"]}
      />
      <fog
        ref={fogRef}
        attach="fog"
        args={[
          fortress ? "#84939d" : "#9cc0ce",
          // Edge veil only — hide where the island stops. Hardcoded fortress
          // 58/196 washed midground on every fortress-sized island; scale
          // from radius like town so a settlement courtyard stays crisp.
          fogDistances
            ? fogDistances[0]
            : Math.max(
                fortress ? 88 : 42,
                (worldRadius ?? 67) * (fortress ? 0.95 : 0.6),
              ),
          fogDistances
            ? fogDistances[1]
            : Math.max(
                fortress ? 210 : 128,
                (worldRadius ?? 67) * (fortress ? 2.45 : 2),
              ),
        ]}
      />
      {/* The sky dome must enclose everything that renders — including the
          WorldEdge fog sea, which stretches far past the rim — or its edge
          shows as a band across the sky. It must also stay inside the camera
          far plane or the dome itself gets clipped. The dome is CENTERED on
          the world centre: the town sits at (30, -15), and an origin-centred
          dome left its eastern sea sticking out through the sky. */}
      <Sky
        ref={skyRef}
        distance={Math.min(
          cameraFar * 0.92,
          skyRadius ?? Math.max(fortress ? 170 : 110, (worldRadius ?? 58) * 2.6),
        )}
        sunPosition={[24, 12, 14]}
      />
      {/* Кэшированный купол — тот же радиус и центр, что у живого Sky выше;
          между ними переключает кадровая логика DayNightCycle. */}
      <mesh
        ref={domeViewRef}
        geometry={dome.viewGeometry}
        material={dome.viewMaterial}
        scale={Math.min(
          cameraFar * 0.92,
          skyRadius ?? Math.max(fortress ? 170 : 110, (worldRadius ?? 58) * 2.6),
        )}
        frustumCulled={false}
        visible={false}
      />
      <hemisphereLight
        ref={hemisphere}
        args={[
          fortress ? "#c9d7df" : "#d8f0ff",
          fortress ? "#31352f" : "#4d5d38",
          0.46,
        ]}
      />
      <directionalLight
        ref={directional}
        castShadow
        position={[10, 16, 9]}
        intensity={3.4}
        color="#fff3d7"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        // The frustum must cover the WHOLE island: a fixed ±70 box left
        // everything past 70 m of Kallur (r=118) outside the shadow map —
        // the lighthouse cast, the boulders around it could not.
        shadow-camera-far={Math.max(170, (worldRadius ?? 58) * 1.7 + 60)}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-bias={-0.00035}
        // normalBias compensates texel quantisation, so it scales with the
        // texel's world size: the box grew from ±70 to the island, the
        // texel grew with it — a fixed 0.024 would acne the terrain's own
        // cast shadows at grazing sun. Small worlds keep the old value.
        shadow-normalBias={0.024 * (shadowHalf / 70)}
        // Soft PCF at 3.2 dissolved into fog as "no shadows". Radius under 2
        // keeps contact; 1.0 restores day form without hard aliasing.
        shadow-radius={1.0}
      />
    </>
  );
}

// Ordinary scenes still select at most twelve sources. Sixteen slots exist so
// a skyline world can reserve one source per architectural landmark and keep
// the nearest detailed group coherent; this remains well below the rejected
// old 24-light setup.
const DEFAULT_LAMP_POOL_CAPACITY = 12;
const LAMP_POOL_SIZE = 16;

function createLampBeaconTexture(): DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const radiusSq = nx * nx + ny * ny;
      const core = Math.exp(-radiusSq * 28);
      const halo = Math.exp(-radiusSq * 5.5);
      const alpha = Math.min(1, core * 0.9 + halo * 0.42);
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Depth-tested halos for fixtures that must remain identifiable after their
 * physical glass becomes sub-pixel. Position resolution is shared with local
 * point lights, so this works for any moving compound object.
 */
export function LampBeaconField({
  lamps,
  brokenPieces,
  nightRef,
  occupiedCarrierClusterId = null,
  resolveLampPosition = (lamp) => lamp.position,
}: {
  lamps: readonly LampDefinition[];
  brokenPieces: ReadonlySet<string>;
  nightRef: { current: number };
  occupiedCarrierClusterId?: string | null;
  resolveLampPosition?: (lamp: LampDefinition) => LampDefinition["position"];
}) {
  const camera = useThree((state) => state.camera);
  const viewportHeight = useThree((state) => state.size.height);
  const beaconLamps = useMemo(
    () => lamps.filter((lamp) => lamp.beacon !== undefined),
    [lamps],
  );
  const sprites = useRef<(Sprite | null)[]>([]);
  const texture = useMemo(createLampBeaconTexture, []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    const verticalFov = "getEffectiveFOV" in camera
      ? camera.getEffectiveFOV()
      : 50;
    beaconLamps.forEach((lamp, index) => {
      const sprite = sprites.current[index];
      const definition = lamp.beacon;
      if (!sprite || !definition || brokenPieces.has(lamp.id)) {
        if (sprite) {
          sprite.visible = false;
        }
        return;
      }

      sprite.position.set(...resolveLampPosition(lamp));
      const diameter = lampBeaconWorldDiameter(
        definition,
        camera.position.distanceTo(sprite.position),
        viewportHeight,
        verticalFov,
      );
      sprite.scale.set(diameter, diameter, 1);
      const material = sprite.material as SpriteMaterial;
      material.opacity =
        lampBeaconOpacity(definition, nightRef.current) *
        lampInteriorFactor(lamp, occupiedCarrierClusterId);
      sprite.visible = material.opacity > 0.001;
    });
  });

  return (
    <>
      {beaconLamps.map((lamp, index) => (
        <sprite
          key={lamp.id}
          ref={(sprite) => {
            sprites.current[index] = sprite;
          }}
          renderOrder={20}
        >
          <spriteMaterial
            map={texture}
            color={lamp.color ?? "#ffd9a0"}
            transparent
            opacity={0}
            depthTest
            depthWrite={false}
            fog={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </sprite>
      ))}
    </>
  );
}

interface LampPoolSlot {
  lampId: string | null;
  intensity: number;
}

interface LampLightPoolProps {
  readonly lamps: readonly LampDefinition[];
  readonly brokenPieces: ReadonlySet<string>;
  readonly nightRef: { current: number };
  readonly occupiedCarrierClusterId?: string | null;
  readonly resolveLampPosition?: (lamp: LampDefinition) => LampDefinition["position"];
  readonly resolveEventState?: (sourceClusterId: string) => LampEventState;
}

/**
 * A fixed pool of point lights shared by every lamp on the map. three.js's
 * forward renderer evaluates every visible point light for every fragment on
 * screen, so 24 always-on lamps at night tripled the shading cost. A lamp
 * with a 9 m range that is 40+ m away lights nothing a player can resolve —
 * so each frame the pool first preserves explicitly reserved architectural
 * groups, then assigns the remaining slots to nearby detail, with a short fade
 * on reassignment. The flame glow itself is emissive + bloom and stays on every
 * lamp regardless of the pool.
 */
export function LampLightPool({
  lamps,
  brokenPieces,
  nightRef,
  occupiedCarrierClusterId = null,
  resolveLampPosition = (lamp) => lamp.position,
  resolveEventState = () => "inTransit",
}: LampLightPoolProps) {
  const camera = useThree((state) => state.camera);
  const lights = useRef<(PointLight | null)[]>([]);
  const slots = useRef<LampPoolSlot[]>(
    Array.from({ length: LAMP_POOL_SIZE }, () => ({
      lampId: null,
      intensity: 0,
    })),
  );
  const lampById = useMemo(
    () => new Map(lamps.map((lamp) => [lamp.id, lamp])),
    [lamps],
  );
  const scratch = useRef(createLampPoolScratch<LampDefinition>());
  useEffect(() => {
    scratch.current.assignmentAge = LAMP_ASSIGNMENT_INTERVAL_SECONDS;
  }, [lamps]);

  useFrame((_, delta) => {
    const night = nightRef.current;
    const ranking = scratch.current;
    ranking.assignmentAge += delta;

    if (ranking.assignmentAge >= LAMP_ASSIGNMENT_INTERVAL_SECONDS) {
      ranking.assignmentAge = 0;
      beginLampCandidateFrame(ranking);
      for (const lamp of lamps) {
        if (brokenPieces.has(lamp.id)) {
          continue;
        }
        const timeFactor = lampTimeFactor(lamp, night);
        const selfCastFactor = lampSelfCastFactor(
          lamp,
          occupiedCarrierClusterId,
        );
        const eventState = lamp.eventLighting
          ? resolveEventState(lamp.eventLighting.sourceClusterId)
          : "inTransit";
        const level = lampEventLevel(lamp, eventState);
        if (timeFactor * selfCastFactor * level.intensityMultiplier <= 0.001) {
          continue;
        }
        const position = resolveLampPosition(lamp);
        const priority =
          Math.max(1, lamp.poolPriority ?? 1) *
          Math.max(0.1, level.intensityMultiplier);
        pushLampCandidate(
          ranking,
          lamp,
          position[0],
          position[1],
          position[2],
          camera.position.x,
          camera.position.y,
          camera.position.z,
          priority,
        );
      }
      const nearest = nearestLampCandidate(ranking);
      const hasPersistentGroups = ranking.active.some((candidate) =>
        (candidate.lamp.poolPriority ?? 0) >= PERSISTENT_LAMP_GROUP_PRIORITY);
      const localCapacity = hasPersistentGroups
        ? LAMP_POOL_SIZE
        : Math.max(
          1,
          Math.min(
            DEFAULT_LAMP_POOL_CAPACITY,
            nearest?.lamp.localPoolCapacity ?? DEFAULT_LAMP_POOL_CAPACITY,
          ),
        );
      sortLampCandidates(ranking);
      const chosen = selectGroupedLampCandidates(ranking.active, localCapacity);
      markLampKeepIds(
        ranking,
        selectGroupedLampCandidates(
          ranking.active,
          Math.min(LAMP_POOL_SIZE, localCapacity + 2),
        ),
      );
      collectUnassignedWaiting(
        ranking,
        chosen,
        slots.current.map((slot) => slot.lampId),
      );
    }

    slots.current.forEach((slot, index) => {
      const light = lights.current[index];
      if (!light) {
        return;
      }

      const current = slot.lampId ? lampById.get(slot.lampId) : undefined;
      const keep =
        current !== undefined &&
        ranking.keepIds.has(current.id) &&
        !brokenPieces.has(current.id);

      if (!keep) {
        // Fade out, then hand the slot to the closest unassigned lamp.
        slot.intensity = smoothLampLevel(
          current ?? {},
          slot.intensity,
          0,
          delta,
        );
        if (slot.intensity < 0.04) {
          const next = ranking.waiting.shift();
          slot.lampId = next ? next.lamp.id : null;
          slot.intensity = 0;
          if (next) {
            light.position.set(...next.position);
            light.color.set(next.lamp.color ?? "#ffd9a0");
            const eventState = next.lamp.eventLighting
              ? resolveEventState(next.lamp.eventLighting.sourceClusterId)
              : "inTransit";
            const level = lampEventLevel(next.lamp, eventState);
            light.distance = (next.lamp.distance ?? 9) * level.distanceMultiplier;
          }
        }
      } else {
        // A kept slot may belong to a moving carrier. Position is resolved
        // every frame even though the pool assignment remains stable.
        light.position.set(...resolveLampPosition(current));
        const eventState = current.eventLighting
          ? resolveEventState(current.eventLighting.sourceClusterId)
          : "inTransit";
        const level = lampEventLevel(current, eventState);
        light.distance = (current.distance ?? 9) * level.distanceMultiplier;
        const target =
          lampTimeFactor(current, night) *
          lampSelfCastFactor(current, occupiedCarrierClusterId) *
          (current.intensity ?? 2.6) *
          level.intensityMultiplier;
        slot.intensity = smoothLampLevel(
          current,
          slot.intensity,
          target,
          delta,
        );
      }

      light.intensity = slot.intensity;
      // React must not pass `visible` on the <pointLight> — that prop would
      // stomp this every parent render and recompile NUM_POINT_LIGHTS.
      light.visible = slot.intensity > 0.001;
    });
  });

  return (
    <>
      {Array.from({ length: LAMP_POOL_SIZE }, (_, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            lights.current[index] = light;
          }}
          intensity={0}
          decay={1.8}
        />
      ))}
    </>
  );
}

const SPOT_LIGHT_POOL_SIZE = 3;

interface SpotLightPoolSlot {
  lightId: string | null;
  intensity: number;
}

const VOLUMETRIC_BEAM_SHAPE = "mamVolumetricBeamShape";

/**
 * Drei supplies the scattering shader; this only fits its integration volume
 * to the authored optical aperture. A finite top radius makes the visible
 * light leave the whole lens instead of pretending that a headlamp is a
 * mathematical point source.
 */
function fitVolumetricBeamShape(
  beam: Mesh,
  sourceRadius: number,
  endRadius: number,
  length: number,
): void {
  const shapeKey = [sourceRadius, endRadius, length]
    .map((value) => value.toFixed(4))
    .join(":");
  if (beam.userData[VOLUMETRIC_BEAM_SHAPE] === shapeKey) {
    return;
  }

  const geometry = new CylinderGeometry(
    sourceRadius,
    endRadius,
    length,
    64,
    20,
    true,
  );
  geometry.translate(0, -length / 2, 0);
  geometry.rotateX(-Math.PI / 2);
  beam.geometry.dispose();
  beam.geometry = geometry;
  beam.scale.set(1, 1, 1);
  beam.userData[VOLUMETRIC_BEAM_SHAPE] = shapeKey;
}

/**
 * A small independent pool for directional fixtures. A spotlight owns both
 * a real Three light (surface illumination) and Drei's volumetric scattering
 * shader (the light visible in air). Both follow the same carrier-local pose,
 * event level and electrical transition, so there is no second state machine
 * to drift or a coloured geometry substitute for a beam.
 */
export function SpotLightPool({
  lights: definitions,
  brokenPieces,
  nightRef,
  occupiedCarrierClusterId = null,
  resolveLightPosition = (light) => light.position,
  resolveLightDirection = (light) => light.direction,
  resolveEventState = () => "inTransit",
}: {
  lights: readonly SpotLightDefinition[];
  brokenPieces: ReadonlySet<string>;
  nightRef: { current: number };
  occupiedCarrierClusterId?: string | null;
  resolveLightPosition?: (
    light: SpotLightDefinition,
  ) => SpotLightDefinition["position"];
  resolveLightDirection?: (
    light: SpotLightDefinition,
  ) => SpotLightDefinition["direction"];
  resolveEventState?: (sourceClusterId: string) => LampEventState;
}) {
  const camera = useThree((state) => state.camera);
  const viewportHeight = useThree((state) => state.size.height);
  const hasVolumetricBeam = definitions.some(
    (definition) => definition.visibleBeam !== undefined,
  );
  const depthBuffer = useDepthBuffer({
    size: 256,
    // Scenes without volumetric fixtures keep the generic pool at zero cost.
    frames: hasVolumetricBeam ? Number.POSITIVE_INFINITY : 0,
  });
  const spotLights = useRef<(ThreeSpotLight | null)[]>([]);
  const sourceHalos = useRef<(Sprite | null)[]>([]);
  const sourceHaloTexture = useMemo(() => createLampBeaconTexture(), []);
  const slots = useRef<SpotLightPoolSlot[]>(
    Array.from({ length: SPOT_LIGHT_POOL_SIZE }, () => ({
      lightId: null,
      intensity: 0,
    })),
  );
  const lightById = useMemo(
    () => new Map(definitions.map((light) => [light.id, light])),
    [definitions],
  );
  const scratch = useRef(createLampPoolScratch<SpotLightDefinition>());
  const desiredFixtureGlow = useRef(new Map<string, number>());
  useEffect(() => {
    scratch.current.assignmentAge = LAMP_ASSIGNMENT_INTERVAL_SECONDS;
  }, [definitions]);
  const direction = useMemo(() => new Vector3(), []);
  const fixtureGlowLevels = useRef(new Map<string, number>());
  const fixtureGlowColors = useMemo(
    () => [...new Set(definitions.flatMap((light) =>
      light.fixtureGlow ? [light.fixtureGlow.color] : []))],
    [definitions],
  );
  const fixtureDefinitionByColor = useMemo(
    () => new Map(definitions.flatMap((light) =>
      light.fixtureGlow ? [[light.fixtureGlow.color, light] as const] : [])),
    [definitions],
  );

  useEffect(() => () => {
    for (const color of fixtureGlowColors) {
      setSignalGlassGlow(color, 0);
      fixtureGlowLevels.current.delete(color);
    }
  }, [fixtureGlowColors]);
  useEffect(() => () => sourceHaloTexture.dispose(), [sourceHaloTexture]);

  useFrame((_, delta) => {
    const night = nightRef.current;
    const glowTargets = desiredFixtureGlow.current;
    for (const color of fixtureGlowColors) glowTargets.set(color, 0);
    for (const definition of definitions) {
      const fixtureGlow = definition.fixtureGlow;
      if (!fixtureGlow || brokenPieces.has(definition.id)) {
        continue;
      }
      const state = definition.eventLighting
        ? resolveEventState(definition.eventLighting.sourceClusterId)
        : "inTransit";
      const level = lampEventLevel(definition, state);
      const glow =
        fixtureGlow.intensity *
        Math.min(
          1,
          lampTimeFactor(definition, night) *
            lampInteriorFactor(definition, occupiedCarrierClusterId) *
            level.intensityMultiplier,
        );
      glowTargets.set(
        fixtureGlow.color,
        Math.max(glowTargets.get(fixtureGlow.color) ?? 0, glow),
      );
    }
    for (const [color, targetGlow] of glowTargets) {
      const previous = fixtureGlowLevels.current.get(color) ?? 0;
      let glow = smoothLampLevel(
        fixtureDefinitionByColor.get(color) ?? {},
        previous,
        targetGlow,
        delta,
      );
      if (Math.abs(targetGlow - glow) < 0.001) {
        glow = targetGlow;
      }
      if (Math.abs(previous - glow) > 0.001) {
        fixtureGlowLevels.current.set(color, glow);
        setSignalGlassGlow(color, glow);
      }
    }
    const ranking = scratch.current;
    ranking.assignmentAge += delta;
    if (ranking.assignmentAge >= LAMP_ASSIGNMENT_INTERVAL_SECONDS) {
      ranking.assignmentAge = 0;
      beginLampCandidateFrame(ranking);
      for (const definition of definitions) {
        if (brokenPieces.has(definition.id)) {
          continue;
        }
        const state = definition.eventLighting
          ? resolveEventState(definition.eventLighting.sourceClusterId)
          : "inTransit";
        const level = lampEventLevel(definition, state);
        if (
          lampTimeFactor(definition, night) *
            lampInteriorFactor(definition, occupiedCarrierClusterId) *
            level.intensityMultiplier <=
          0.001
        ) {
          continue;
        }
        const position = resolveLightPosition(definition);
        pushLampCandidate(
          ranking,
          definition,
          position[0],
          position[1],
          position[2],
          camera.position.x,
          camera.position.y,
          camera.position.z,
          1,
        );
      }
      sortLampCandidates(ranking);
      ranking.keepIds.clear();
      const wantedCount = Math.min(SPOT_LIGHT_POOL_SIZE, ranking.active.length);
      for (let index = 0; index < wantedCount; index += 1) {
        ranking.keepIds.add(ranking.active[index].lamp.id);
      }
      collectUnassignedWaiting(
        ranking,
        ranking.active,
        slots.current.map((slot) => slot.lightId),
      );
    }
    slots.current.forEach((slot, index) => {
      let definition = slot.lightId ? lightById.get(slot.lightId) : undefined;
      const shouldKeep =
        definition !== undefined &&
        ranking.keepIds.has(definition.id) &&
        !brokenPieces.has(definition.id);

      if (!shouldKeep) {
        if (slot.intensity < 0.04) {
          const next = ranking.waiting.shift();
          slot.lightId = next?.lamp.id ?? null;
          slot.intensity = 0;
          definition = next?.lamp;
        }
      }

      const light = spotLights.current[index];
      const sourceHalo = sourceHalos.current[index];
      if (!light || !definition) {
        if (light) {
          light.visible = false;
        }
        if (sourceHalo) {
          sourceHalo.visible = false;
        }
        return;
      }

      const state = definition.eventLighting
        ? resolveEventState(definition.eventLighting.sourceClusterId)
        : "inTransit";
      const level = lampEventLevel(definition, state);
      const timeFactor = lampTimeFactor(definition, night);
      const selected = ranking.keepIds.has(definition.id)
        && !brokenPieces.has(definition.id);
      const desiredIntensity = selected
        ? timeFactor *
          lampInteriorFactor(definition, occupiedCarrierClusterId) *
          (definition.intensity ?? 80) *
          level.intensityMultiplier
        : 0;
      slot.intensity = smoothLampLevel(
        definition,
        slot.intensity,
        desiredIntensity,
        delta,
      );

      const position = resolveLightPosition(definition);
      const resolvedDirection = resolveLightDirection(definition);
      direction.set(...resolvedDirection);
      if (direction.lengthSq() < 1e-8) {
        direction.set(0, -1, 0);
      } else {
        direction.normalize();
      }
      const range = (definition.distance ?? 40) * level.distanceMultiplier;
      const angle = definition.angle ?? Math.PI / 8;
      light.position.set(...position);
      light.color.set(definition.color ?? "#fff1cf");
      light.distance = range;
      light.angle = angle;
      light.penumbra = definition.penumbra ?? 0.4;
      light.decay = definition.decay ?? 2;
      light.intensity = slot.intensity;
      light.target.position.set(...position).addScaledVector(direction, range);
      light.target.updateMatrixWorld();
      // Same as the point pool: the JSX must not pass `visible`, or React
      // would reset it every render and recompile materials.
      light.visible = slot.intensity > 0.001;

      const normalizedPower = Math.min(
        1,
        slot.intensity / Math.max(0.001, definition.intensity ?? 80),
      );
      const fixtureHalo = definition.fixtureGlow?.halo;
      if (sourceHalo && fixtureHalo && normalizedPower > 0.001) {
        sourceHalo.position.set(...position);
        const verticalFov = "getEffectiveFOV" in camera
          ? camera.getEffectiveFOV()
          : 50;
        const haloDiameter = lampBeaconWorldDiameter(
          fixtureHalo,
          camera.position.distanceTo(sourceHalo.position),
          viewportHeight,
          verticalFov,
        );
        sourceHalo.scale.set(haloDiameter, haloDiameter, 1);
        const haloMaterial = sourceHalo.material as SpriteMaterial;
        haloMaterial.color.set(definition.fixtureGlow?.color ?? definition.color ?? "#fff1cf");
        haloMaterial.opacity =
          lampBeaconOpacity(fixtureHalo, night) * normalizedPower;
        sourceHalo.visible = haloMaterial.opacity > 0.001;
      } else if (sourceHalo) {
        sourceHalo.visible = false;
      }

      const beamDefinition = definition.visibleBeam;
      const beam = light.children.find((child): child is Mesh => child instanceof Mesh);
      const material = beam?.material as ShaderMaterial | undefined;
      if (!beamDefinition || slot.intensity <= 0.001 || !beam || !material) {
        if (beam) {
          beam.visible = false;
        }
        if (material?.uniforms.opacity) {
          material.uniforms.opacity.value = 0;
        }
        return;
      }
      const beamLength = (beamDefinition.length ?? range) * level.distanceMultiplier;
      const sourceRadius = Math.max(0.01, beamDefinition.sourceRadius ?? 0.1);
      const beamRadius = sourceRadius + Math.tan(angle) * beamLength;
      fitVolumetricBeamShape(beam, sourceRadius, beamRadius, beamLength);
      material.uniforms.lightColor.value.set(definition.color ?? "#fff1cf");
      material.uniforms.attenuation.value = beamDefinition.attenuation === undefined
        ? beamLength
        : beamDefinition.attenuation * level.distanceMultiplier;
      material.uniforms.anglePower.value = beamDefinition.anglePower ?? 5;
      material.uniforms.opacity.value =
        beamDefinition.opacity * normalizedPower;
      beam.visible = material.uniforms.opacity.value > 0.001;
    });
  });

  return (
    <>
      {Array.from({ length: SPOT_LIGHT_POOL_SIZE }, (_, index) => (
        <group key={index}>
          <VolumetricSpotLight
            ref={(light) => {
              spotLights.current[index] = light;
            }}
            depthBuffer={depthBuffer}
            volumetric
            radiusTop={0.1}
            radiusBottom={1}
            distance={1}
            angle={Math.PI / 4}
            attenuation={1}
            anglePower={5}
            opacity={0}
            castShadow={false}
            intensity={0}
          />
          <sprite
            ref={(halo) => {
              sourceHalos.current[index] = halo;
            }}
            visible={false}
            renderOrder={20}
          >
            <spriteMaterial
              map={sourceHaloTexture}
              transparent
              opacity={0}
              depthTest
              depthWrite={false}
              fog={false}
              toneMapped={false}
              blending={AdditiveBlending}
            />
          </sprite>
        </group>
      ))}
    </>
  );
}
