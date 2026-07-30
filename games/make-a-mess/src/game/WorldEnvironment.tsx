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
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  LinearFilter,
  MathUtils,
  Mesh,
  PMREMGenerator,
  PointLight,
  RGBAFormat,
  Scene,
  Sprite,
  SpriteMaterial,
  SpotLight as ThreeSpotLight,
  ShaderMaterial,
  Vector3,
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
import { environmentState } from "./environmentState";
import { lampBeaconOpacity, lampBeaconWorldDiameter } from "./lampBeacon";
import {
  lampEventLevel,
  lampTimeFactor,
  smoothLampLevel,
} from "./lampEventLighting";
import {
  PERSISTENT_LAMP_GROUP_PRIORITY,
  selectGroupedLampCandidates,
} from "./lampPoolSelection";
import { windState } from "./windState";
import {
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
  const fortress = theme === "fortress";
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  const skyScene = useMemo(() => {
    const holder = new Scene();
    const sky = new SkyImpl();
    sky.scale.setScalar(48);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = fortress ? 10.5 : 6.2;
    uniforms.rayleigh.value = fortress ? 1.25 : 1.6;
    uniforms.mieCoefficient.value = fortress ? 0.011 : 0.005;
    uniforms.mieDirectionalG.value = fortress ? 0.82 : 0.77;
    holder.add(sky);
    return { holder, sky };
  }, [fortress]);
  const currentTarget = useRef<WebGLRenderTarget | null>(null);
  const lastBucket = useRef("");

  useEffect(() => {
    // The atmosphere shader is HDR-bright; a low multiplier keeps its PMREM
    // as a tint-correct ambient rather than a wash.
    scene.environmentIntensity = 0.22;
    return () => {
      scene.environmentIntensity = 1;
      scene.environment = null;
      currentTarget.current?.dispose();
      currentTarget.current = null;
      pmrem.dispose();
    };
  }, [pmrem, scene]);

  useFrame(() => {
    // Re-bake the environment only when the sun has moved perceptibly.
    const direction = environmentState.sunDirection;
    const bucket = [
      Math.round(direction.x * 10),
      Math.round(direction.y * 14),
      Math.round(direction.z * 10),
    ].join(":");
    if (bucket === lastBucket.current) {
      return;
    }
    lastBucket.current = bucket;

    skyScene.sky.material.uniforms.sunPosition.value
      .copy(environmentState.sunPosition)
      .normalize();
    const target = pmrem.fromScene(skyScene.holder, 0.028, 1, 60);
    scene.environment = target.texture;
    currentTarget.current?.dispose();
    currentTarget.current = target;
  });

  return null;
}

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
}) {
  const directional = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const fogRef = useRef<Fog>(null);
  const backgroundRef = useRef<Color>(null);
  const time = useRef(TIME_OF_DAY_TARGETS.day);
  const appliedSnapVersion = useRef(snapVersion);
  const fortress = theme === "fortress";
  const dayColor = useMemo(
    () => new Color(fortress ? "#84939d" : "#9cc0ce"),
    [fortress],
  );
  const duskColor = useMemo(
    () => new Color(fortress ? "#a66c54" : "#d09a67"),
    [fortress],
  );
  const nightColor = useMemo(
    () => new Color(fortress ? "#090d13" : "#0d1420"),
    [fortress],
  );
  const sunWarmColor = useMemo(() => new Color("#ffc07a"), []);
  const sunDayColor = useMemo(() => new Color("#fff3d7"), []);
  const moonColor = useMemo(() => new Color("#8fa5c8"), []);
  const scratchColor = useMemo(() => new Color(), []);

  const shadowThrottle = useRef(1);
  const sunWasMoving = useRef(false);
  const skyRef = useRef<ComponentRef<typeof Sky>>(null);

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
  }, [worldCenter]);

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
    const angle = time.current * Math.PI * 2;
    const geographicSun = solarFrame
      ? equinoxSunDirection(time.current, solarFrame)
      : null;
    const elevation = geographicSun?.[1] ?? Math.sin(angle);
    const azimuth = angle + Math.PI * 0.3;
    const day = MathUtils.clamp(elevation / 0.32, 0, 1);
    const night = 1 - day;
    const twilight = MathUtils.clamp(1 - Math.abs(elevation) * 3.4, 0, 1);
    const sunX = geographicSun ? geographicSun[0] * 30 : Math.cos(azimuth) * 30;
    const sunZ = geographicSun ? geographicSun[2] * 30 : Math.sin(azimuth) * 24;
    const sunY = geographicSun ? geographicSun[1] * 30 : elevation * 26;

    if (directional.current) {
      directional.current.position.set(sunX, Math.max(sunY, 7), sunZ);
      directional.current.intensity = 0.3 + 3.65 * day;
      if (day > 0.02) {
        scratchColor
          .copy(sunWarmColor)
          .lerp(sunDayColor, MathUtils.clamp(elevation * 2.4, 0, 1));
        directional.current.color.copy(scratchColor);
      } else {
        directional.current.color.copy(moonColor);
      }
    }
    if (hemisphere.current) {
      hemisphere.current.intensity = 0.15 + 0.43 * day;
    }

    scratchColor
      .copy(nightColor)
      .lerp(dayColor, day)
      .lerp(duskColor, twilight * 0.8);
    fogRef.current?.color.copy(scratchColor);
    backgroundRef.current?.copy(scratchColor);

    // Fixtures are small now (sill lamps behind glass instead of whole
    // glowing panes), so they burn brighter to read at street distance.
    setWindowGlow(night * 2.7);
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
    }
    environmentState.dayFactor = day;
    environmentState.nightFactor = night;
    environmentState.twilightFactor = twilight;
    updateMaterialEnvironment({
      sunDirection: environmentState.sunDirection,
      sunColor: environmentState.sunColor,
      sunStrength:
        (0.32 + twilight * 1.2) * MathUtils.clamp(day + twilight, 0, 1),
      wetness: environmentState.wetness,
      time: frameState.clock.elapsedTime,
      windStrength: windState.strength,
      stains: theme === "town" ? 1 : 0,
    });

    // Keep the visible sun on the exact same frame-coherent position used by
    // glare and lens dirt. The old throttled React update left the sky disc a
    // few frames behind the post effect, producing short flashes in flyovers.
    const skyMaterial = skyRef.current?.material;
    if (skyMaterial && "uniforms" in skyMaterial) {
      skyMaterial.uniforms.sunPosition.value.set(sunX, sunY, sunZ);
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
          fogDistances
            ? fogDistances[0]
            : fortress
              ? 58
              : Math.max(42, (worldRadius ?? 67) * 0.6),
          fogDistances
            ? fogDistances[1]
            : fortress
              ? 196
              : Math.max(128, (worldRadius ?? 67) * 2),
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
        turbidity={fortress ? 10.5 : cinematic ? 4.2 : 6.2}
        rayleigh={fortress ? 1.25 : 1.6}
        mieCoefficient={fortress ? 0.011 : cinematic ? 0.0012 : 0.005}
        mieDirectionalG={fortress ? 0.82 : cinematic ? 0.68 : 0.77}
      />
      <hemisphereLight
        ref={hemisphere}
        args={[
          fortress ? "#c9d7df" : "#d8f0ff",
          fortress ? "#31352f" : "#4d5d38",
          0.58,
        ]}
      />
      <directionalLight
        ref={directional}
        castShadow
        position={[10, 16, 9]}
        intensity={3.1}
        color="#fff3d7"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={170}
        shadow-camera-left={fortress ? -95 : -70}
        shadow-camera-right={fortress ? 95 : 70}
        shadow-camera-top={fortress ? 95 : 70}
        shadow-camera-bottom={fortress ? -95 : -70}
        shadow-bias={-0.00035}
        shadow-normalBias={0.035}
        shadow-radius={3.2}
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
  resolveLampPosition = (lamp) => lamp.position,
}: {
  lamps: readonly LampDefinition[];
  brokenPieces: ReadonlySet<string>;
  nightRef: { current: number };
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
      material.opacity = lampBeaconOpacity(definition, nightRef.current);
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
  readonly resolveLampPosition?: (lamp: LampDefinition) => LampDefinition["position"];
  readonly resolveEventState?: (sourceClusterId: string) => LampEventState;
}

/**
 * A fixed pool of point lights shared by every lamp on the map. three.js's
 * forward renderer evaluates every visible point light for every fragment on
 * screen, so 24 always-on lamps at night tripled the shading cost. A lamp
 * with a 9 m range that is 40+ m away lights nothing a player can resolve —
 * so each frame the pool is assigned to the nearest lit lamps only, with a
 * short fade on reassignment. The flame glow itself is emissive + bloom and
 * stays on every lamp regardless of the pool.
 */
export function LampLightPool({
  lamps,
  brokenPieces,
  nightRef,
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

  useFrame((_, delta) => {
    const night = nightRef.current;

    // Rank lit lamps by distance to the camera. Safety/signalling lights may
    // read as nearer so their local cast does not disappear behind decorative
    // fixtures while the player can still resolve the vehicle.
    const candidates: {
      lamp: LampDefinition;
      position: LampDefinition["position"];
      distanceSq: number;
      rank: number;
    }[] = [];
    for (const lamp of lamps) {
      if (brokenPieces.has(lamp.id)) {
        continue;
      }
      const timeFactor = lampTimeFactor(lamp, night);
      const eventState = lamp.eventLighting
        ? resolveEventState(lamp.eventLighting.sourceClusterId)
        : "inTransit";
      const level = lampEventLevel(lamp, eventState);
      if (timeFactor * level.intensityMultiplier <= 0.001) {
        continue;
      }
      const position = resolveLampPosition(lamp);
      const dx = position[0] - camera.position.x;
      const dy = position[1] - camera.position.y;
      const dz = position[2] - camera.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      const priority =
        Math.max(1, lamp.poolPriority ?? 1) *
        Math.max(0.1, level.intensityMultiplier);
      candidates.push({
        lamp,
        position,
        distanceSq,
        rank: distanceSq / priority,
      });
    }
    const nearest = candidates.reduce<(typeof candidates)[number] | undefined>(
      (closest, candidate) =>
        !closest || candidate.distanceSq < closest.distanceSq ? candidate : closest,
      undefined,
    );
    const hasPersistentGroups = candidates.some((candidate) =>
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
    candidates.sort((left, right) => left.rank - right.rank);
    const chosen = selectGroupedLampCandidates(candidates, localCapacity);
    // Hysteresis: a slot keeps its lamp while it stays in a slightly larger
    // top set, so two lamps at similar range don't fight over a slot.
    const keepSet = new Set(
      selectGroupedLampCandidates(
        candidates,
        Math.min(LAMP_POOL_SIZE, localCapacity + 2),
      )
        .map((entry) => entry.lamp.id),
    );
    const assigned = new Set(
      slots.current
        .map((slot) => slot.lampId)
        .filter((id): id is string => id !== null && keepSet.has(id)),
    );
    const waiting = chosen.filter((entry) => !assigned.has(entry.lamp.id));

    slots.current.forEach((slot, index) => {
      const light = lights.current[index];
      if (!light) {
        return;
      }

      const current = slot.lampId ? lampById.get(slot.lampId) : undefined;
      const keep =
        current !== undefined &&
        keepSet.has(current.id) &&
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
          const next = waiting.shift();
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
          visible={false}
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
  resolveLightPosition = (light) => light.position,
  resolveLightDirection = (light) => light.direction,
  resolveEventState = () => "inTransit",
}: {
  lights: readonly SpotLightDefinition[];
  brokenPieces: ReadonlySet<string>;
  nightRef: { current: number };
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
    const desiredFixtureGlow = new Map(
      fixtureGlowColors.map((color) => [color, 0]),
    );
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
        Math.min(1, lampTimeFactor(definition, night) * level.intensityMultiplier);
      desiredFixtureGlow.set(
        fixtureGlow.color,
        Math.max(desiredFixtureGlow.get(fixtureGlow.color) ?? 0, glow),
      );
    }
    for (const [color, targetGlow] of desiredFixtureGlow) {
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
    const candidates = definitions
      .filter((definition) => {
        if (brokenPieces.has(definition.id)) {
          return false;
        }
        const state = definition.eventLighting
          ? resolveEventState(definition.eventLighting.sourceClusterId)
          : "inTransit";
        const level = lampEventLevel(definition, state);
        return lampTimeFactor(definition, night) * level.intensityMultiplier > 0.001;
      })
      .map((definition) => {
        const position = resolveLightPosition(definition);
        const dx = position[0] - camera.position.x;
        const dy = position[1] - camera.position.y;
        const dz = position[2] - camera.position.z;
        return { definition, distanceSq: dx * dx + dy * dy + dz * dz };
      })
      .sort((left, right) => left.distanceSq - right.distanceSq);
    const wanted = new Set(
      candidates.slice(0, SPOT_LIGHT_POOL_SIZE).map(({ definition }) => definition.id),
    );
    const assigned = new Set(
      slots.current
        .map((slot) => slot.lightId)
        .filter((id): id is string => id !== null && wanted.has(id)),
    );
    const waiting = candidates.filter(({ definition }) => !assigned.has(definition.id));
    slots.current.forEach((slot, index) => {
      let definition = slot.lightId ? lightById.get(slot.lightId) : undefined;
      const shouldKeep =
        definition !== undefined &&
        wanted.has(definition.id) &&
        !brokenPieces.has(definition.id);

      if (!shouldKeep) {
        if (slot.intensity < 0.04) {
          const next = waiting.shift();
          slot.lightId = next?.definition.id ?? null;
          slot.intensity = 0;
          definition = next?.definition;
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
      const selected = wanted.has(definition.id) && !brokenPieces.has(definition.id);
      const desiredIntensity = selected
        ? timeFactor * (definition.intensity ?? 80) * level.intensityMultiplier
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
            visible={false}
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
