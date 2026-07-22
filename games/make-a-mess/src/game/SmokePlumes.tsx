"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import { vikingVillageHomes } from "../content/scenes/vikingVillagePlan";

interface SmokeSource {
  readonly position: readonly [number, number, number];
  readonly puffs: number;
  readonly rise: number;
  readonly spread: number;
}

// Hearths and roof smoke-holes of a lived-in settlement. The great hall smokes
// strongest from its louver; the outdoor commons hearth and the house roofs
// trail thinner columns.
function vikingSmokeSources(): readonly SmokeSource[] {
  // The great hall's plume rises from the central hearth itself, columns up
  // through the room and leaves by the roof louver (~7.9 m). House plumes rise
  // from just above their roof louvers; the outdoor commons hearth from its embers.
  const sources: SmokeSource[] = [
    { position: [0, 0.8, -16.5], puffs: 22, rise: 9.6, spread: 0.6 },
    { position: [-11.5, 0.9, -1.5], puffs: 14, rise: 6.5, spread: 0.9 },
  ];
  for (const home of vikingVillageHomes) {
    if (home.id === "fisher" || home.id === "family-east") {
      continue; // a couple of cold hearths keep the village from looking staged
    }
    const roofY = home.prefabId === "viking:house:long" ? 6.55 : 6.15;
    sources.push({
      position: [home.position[0], roofY, home.position[1]],
      puffs: 11,
      rise: 5,
      spread: 0.7,
    });
  }
  return sources;
}

export function SmokePlumes({ nightRef }: { nightRef: RefObject<number> }) {
  const meshRef = useRef<InstancedMesh>(null);
  const sources = useMemo(() => vikingSmokeSources(), []);
  const total = useMemo(
    () => sources.reduce((sum, source) => sum + source.puffs, 0),
    [sources],
  );

  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uNight: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aSource;
          attribute float aPhase;
          attribute float aSeed;
          attribute float aRise;
          attribute float aSpread;
          uniform float uTime;
          varying float vLife;
          varying vec2 vQuad;
          void main() {
            float life = fract(uTime * 0.05 + aPhase);
            vLife = life;
            vQuad = position.xy;
            // A puff rises, drifts on the wind and swells as it cools.
            float driftX = sin(uTime * 0.3 + aSeed * 6.2833) * (0.4 + life * aSpread * 3.0)
              + (aSeed - 0.5) * aSpread;
            float driftZ = cos(uTime * 0.24 + aSeed * 4.7) * (0.3 + life * aSpread * 2.4);
            vec3 center = aSource + vec3(driftX, life * aRise, driftZ);
            float size = 0.6 + life * (1.9 + aSeed * 1.4);
            vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 world = center + camRight * position.x * size + camUp * position.y * size;
            gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          uniform float uNight;
          varying float vLife;
          varying vec2 vQuad;
          void main() {
            float d = length(vQuad * 2.0);
            float alpha = smoothstep(1.0, 0.15, d);
            // Fade in from the hearth, thin out as it disperses.
            alpha *= smoothstep(0.0, 0.12, vLife) * smoothstep(1.0, 0.5, vLife);
            alpha *= 0.34;
            vec3 smoke = mix(vec3(0.66, 0.65, 0.63), vec3(0.32, 0.32, 0.33), vLife);
            smoke *= 1.0 - uNight * 0.55;
            gl_FragColor = vec4(smoke, alpha);
          }
        `,
      }),
    [],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const identity = new Matrix4();
    const aSource = new Float32Array(total * 3);
    const aPhase = new Float32Array(total);
    const aSeed = new Float32Array(total);
    const aRise = new Float32Array(total);
    const aSpread = new Float32Array(total);
    let index = 0;
    for (const source of sources) {
      for (let puff = 0; puff < source.puffs; puff += 1) {
        aSource[index * 3] = source.position[0];
        aSource[index * 3 + 1] = source.position[1];
        aSource[index * 3 + 2] = source.position[2];
        aPhase[index] = puff / source.puffs;
        // Deterministic per-puff variation (no Math.random).
        aSeed[index] = ((Math.sin(index * 51.31 + 3.7) * 43758.5453) % 1 + 1) % 1;
        aRise[index] = source.rise;
        aSpread[index] = source.spread;
        mesh.setMatrixAt(index, identity);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aSource", new InstancedBufferAttribute(aSource, 3));
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(aPhase, 1));
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(aSeed, 1));
    geometry.setAttribute("aRise", new InstancedBufferAttribute(aRise, 1));
    geometry.setAttribute("aSpread", new InstancedBufferAttribute(aSpread, 1));
    mesh.frustumCulled = false;
  }, [sources, total, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uNight.value = nightRef.current ?? 0;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <instancedMesh ref={meshRef} args={[geometry, material, total]} frustumCulled={false} />;
}
