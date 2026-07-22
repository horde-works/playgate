"use client";

import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  PointLight,
  Scene,
  type WebGLRenderTarget,
} from "three";
import { Sky as SkyImpl } from "three-stdlib";
import type { LampDefinition } from "./destructionScene";
import { setWindowGlow, updateMaterialEnvironment } from "./materialTextures";
import { environmentState } from "./environmentState";

export type TimeOfDay = "day" | "sunset" | "night";

const timeOfDayTargets: Record<TimeOfDay, number> = {
  day: 0.25,
  sunset: 0.484,
  night: 0.75,
};

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
  const lastBucket = useRef(Number.NaN);

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
    const elevation = environmentState.sunPosition.y / 26;
    const bucket = Math.round(elevation * 14);
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
  theme = "town",
  worldRadius,
}: {
  mode: TimeOfDay;
  nightRef: { current: number };
  theme?: "town" | "fortress";
  worldRadius?: number;
}) {
  const directional = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const fogRef = useRef<Fog>(null);
  const backgroundRef = useRef<Color>(null);
  const time = useRef(timeOfDayTargets.day);
  const skyThrottle = useRef(10);
  const lastSkyTime = useRef(-1);
  const [skySun, setSkySun] = useState<readonly [number, number, number]>([
    24, 12, 14,
  ]);
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
  useLayoutEffect(() => {
    if (skyRef.current) {
      skyRef.current.renderOrder = 1000;
    }
  }, []);

  useFrame((frameState, delta) => {
    const target = timeOfDayTargets[mode];
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
    const angle = time.current * Math.PI * 2;
    const elevation = Math.sin(angle);
    const azimuth = angle + Math.PI * 0.3;
    const day = MathUtils.clamp(elevation / 0.32, 0, 1);
    const night = 1 - day;
    const twilight = MathUtils.clamp(1 - Math.abs(elevation) * 3.4, 0, 1);
    const sunX = Math.cos(azimuth) * 30;
    const sunZ = Math.sin(azimuth) * 24;
    const sunY = elevation * 26;

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
    });

    skyThrottle.current += delta;
    if (
      skyThrottle.current > 0.25 &&
      Math.abs(time.current - lastSkyTime.current) > 0.003
    ) {
      skyThrottle.current = 0;
      lastSkyTime.current = time.current;
      setSkySun([sunX, sunY, sunZ]);
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
          fortress ? 58 : Math.max(42, (worldRadius ?? 67) * 0.6),
          fortress ? 196 : Math.max(128, (worldRadius ?? 67) * 2),
        ]}
      />
      {/* The sky dome must be larger than the map: a dome smaller than the
          world radius shows its own edge as a band across the sky. */}
      <Sky
        ref={skyRef}
        distance={fortress ? 170 : Math.max(110, (worldRadius ?? 58) * 1.9)}
        sunPosition={[...skySun]}
        turbidity={fortress ? 10.5 : 6.2}
        rayleigh={fortress ? 1.25 : 1.6}
        mieCoefficient={fortress ? 0.011 : 0.005}
        mieDirectionalG={fortress ? 0.82 : 0.77}
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

const LAMP_POOL_SIZE = 8;

interface LampPoolSlot {
  lampId: string | null;
  intensity: number;
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
}: {
  lamps: readonly LampDefinition[];
  brokenPieces: ReadonlySet<string>;
  nightRef: { current: number };
}) {
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

    // Rank lit lamps by distance to the camera.
    const candidates: { lamp: LampDefinition; distanceSq: number }[] = [];
    if (night > 0.001) {
      for (const lamp of lamps) {
        if (brokenPieces.has(lamp.id)) {
          continue;
        }
        const dx = lamp.position[0] - camera.position.x;
        const dy = lamp.position[1] - camera.position.y;
        const dz = lamp.position[2] - camera.position.z;
        candidates.push({ lamp, distanceSq: dx * dx + dy * dy + dz * dz });
      }
      candidates.sort((left, right) => left.distanceSq - right.distanceSq);
    }
    const chosen = candidates.slice(0, LAMP_POOL_SIZE);
    // Hysteresis: a slot keeps its lamp while it stays in a slightly larger
    // top set, so two lamps at similar range don't fight over a slot.
    const keepSet = new Set(
      candidates
        .slice(0, LAMP_POOL_SIZE + 2)
        .map((entry) => entry.lamp.id),
    );
    const assigned = new Set(
      slots.current
        .map((slot) => slot.lampId)
        .filter((id): id is string => id !== null && keepSet.has(id)),
    );
    const waiting = chosen.filter((entry) => !assigned.has(entry.lamp.id));

    const fade = 1 - Math.exp(-delta * 7);
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
        slot.intensity += (0 - slot.intensity) * fade;
        if (slot.intensity < 0.04) {
          const next = waiting.shift();
          slot.lampId = next ? next.lamp.id : null;
          slot.intensity = 0;
          if (next) {
            light.position.set(...next.lamp.position);
            light.color.set(next.lamp.color ?? "#ffd9a0");
            light.distance = next.lamp.distance ?? 9;
          }
        }
      } else {
        const target = night * (current.intensity ?? 2.6);
        slot.intensity += (target - slot.intensity) * fade;
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
