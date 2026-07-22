"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { windState } from "./windState";

/**
 * Watches the frame rate and drives the shared {@link windState}. Wind stays at
 * full strength while the game runs smoothly, but if a smoothed frame rate falls
 * below 15 fps the wind ramps off (and back on once the rate recovers, with
 * hysteresis so it does not flicker at the threshold). Cloth and grass read the
 * result, so the most animation-heavy effects are the first thing shed under load.
 */
export function WindController() {
  const smoothedFps = useRef(60);

  useFrame((_, delta) => {
    if (delta <= 0) {
      return;
    }
    const instantaneous = 1 / delta;
    // Exponential moving average so a single stutter does not kill the wind.
    smoothedFps.current += (instantaneous - smoothedFps.current) * Math.min(1, delta * 2.5);

    // Hysteresis: cut wind below 15 fps, only restore it once comfortably above 20.
    const target =
      smoothedFps.current < 15 ? 0 : smoothedFps.current > 20 ? 1 : windState.strength > 0.5 ? 1 : 0;
    windState.strength += (target - windState.strength) * Math.min(1, delta * 1.8);
    if (windState.strength < 0.001) {
      windState.strength = 0;
    }
  });

  return null;
}
