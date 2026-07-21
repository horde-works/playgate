"use client";

import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  PointLight,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { LampDefinition } from "./destructionScene";
import { setWindowGlow } from "./materialTextures";

export type TimeOfDay = "day" | "sunset" | "night";

const timeOfDayTargets: Record<TimeOfDay, number> = {
  day: 0.25,
  sunset: 0.484,
  night: 0.75,
};

export function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const envTexture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);

  useEffect(() => {
    scene.environmentIntensity = 0.62;
    return () => {
      scene.environmentIntensity = 1;
      envTexture.dispose();
    };
  }, [envTexture, scene]);

  return <primitive object={envTexture} attach="environment" />;
}

export function DayNightCycle({
  mode,
  nightRef,
  theme = "town",
}: {
  mode: TimeOfDay;
  nightRef: { current: number };
  theme?: "town" | "fortress";
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

  useFrame((frameState, delta) => {
    const target = timeOfDayTargets[mode];
    const diff = ((target - time.current + 1.5) % 1) - 0.5;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), delta * 0.22);
    const sunIsMoving = Math.abs(step) > 0.00001;
    shadowThrottle.current += delta;
    if (
      (sunIsMoving && shadowThrottle.current > 0.24) ||
      (!sunIsMoving && sunWasMoving.current)
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
      hemisphere.current.intensity = 0.11 + 0.47 * day;
    }

    scratchColor
      .copy(nightColor)
      .lerp(dayColor, day)
      .lerp(duskColor, twilight * 0.8);
    fogRef.current?.color.copy(scratchColor);
    backgroundRef.current?.copy(scratchColor);

    setWindowGlow(night * 1.9);
    nightRef.current = night;

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
        args={[fortress ? "#84939d" : "#9cc0ce", fortress ? 48 : 42, fortress ? 182 : 128]}
      />
      <Sky
        distance={fortress ? 170 : 110}
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

export function LampLight({
  lamp,
  broken,
  nightRef,
}: {
  lamp: LampDefinition;
  broken: boolean;
  nightRef: { current: number };
}) {
  const light = useRef<PointLight>(null);

  useFrame(() => {
    if (light.current) {
      light.current.intensity =
        broken ? 0 : nightRef.current * (lamp.intensity ?? 2.6);
    }
  });

  return (
    <pointLight
      ref={light}
      position={[...lamp.position]}
      color={lamp.color ?? "#ffd9a0"}
      distance={lamp.distance ?? 9}
      decay={1.8}
    />
  );
}
