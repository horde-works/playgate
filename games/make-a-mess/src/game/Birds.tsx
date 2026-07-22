"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

// A loose flock wheeling over the settlement. Each bird is a camera-facing quad
// with a flapping gull silhouette punched out in the fragment shader — dozens
// of them in a single draw call, animated entirely on the GPU.
export function Birds({
  center,
  count = 16,
}: {
  center: readonly [number, number];
  count?: number;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: [center[0], center[1]] },
        },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aAngle;
          attribute float aRadius;
          attribute float aAltitude;
          attribute float aSpeed;
          attribute float aPhase;
          attribute float aScale;
          uniform float uTime;
          uniform vec2 uCenter;
          varying vec2 vUv;
          varying float vFlap;
          void main() {
            vUv = uv;
            float ang = aAngle + uTime * aSpeed;
            vec3 world = vec3(
              uCenter.x + cos(ang) * aRadius,
              aAltitude + sin(uTime * 0.35 + aPhase) * 1.8,
              uCenter.y + sin(ang) * aRadius
            );
            vFlap = sin(uTime * 7.5 + aPhase * 6.2833);
            vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 offset = camRight * position.x * aScale + camUp * position.y * aScale;
            gl_Position = projectionMatrix * viewMatrix * vec4(world + offset, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying vec2 vUv;
          varying float vFlap;
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            // Chevron wings whose slope oscillates: a flapping gull.
            float slope = 0.55 + vFlap * 0.5;
            float centreline = (abs(p.x) - 0.55) * slope;
            float onWing = step(abs(p.y - centreline), 0.16) * step(abs(p.x), 1.0);
            if (onWing < 0.5) discard;
            gl_FragColor = vec4(0.11, 0.11, 0.13, 0.9);
          }
        `,
      }),
    [center],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const identity = new Matrix4();
    const aAngle = new Float32Array(count);
    const aRadius = new Float32Array(count);
    const aAltitude = new Float32Array(count);
    const aSpeed = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const aScale = new Float32Array(count);
    const rand = (index: number, salt: number) => {
      const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < count; index += 1) {
      // Two lazy flocks orbiting at slightly different radii and heights.
      const flock = index % 2;
      aAngle[index] = rand(index, 1) * Math.PI * 2;
      aRadius[index] = 34 + flock * 20 + rand(index, 2) * 16;
      aAltitude[index] = 24 + flock * 6 + rand(index, 3) * 7;
      aSpeed[index] = (0.05 + rand(index, 4) * 0.045) * (flock === 0 ? 1 : -1);
      aPhase[index] = rand(index, 5) * Math.PI * 2;
      aScale[index] = 1.5 + rand(index, 6) * 1.2;
      mesh.setMatrixAt(index, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aAngle", new InstancedBufferAttribute(aAngle, 1));
    geometry.setAttribute("aRadius", new InstancedBufferAttribute(aRadius, 1));
    geometry.setAttribute("aAltitude", new InstancedBufferAttribute(aAltitude, 1));
    geometry.setAttribute("aSpeed", new InstancedBufferAttribute(aSpeed, 1));
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(aPhase, 1));
    geometry.setAttribute("aScale", new InstancedBufferAttribute(aScale, 1));
    mesh.frustumCulled = false;
  }, [count, geometry]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />;
}
