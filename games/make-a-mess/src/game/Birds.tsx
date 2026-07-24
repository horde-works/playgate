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
//
// With `worldRadius` set, every third bird joins a wandering flock that rides
// a slow radial swell out past the rim and back — the world visibly continues
// beyond the edge, because something alive keeps crossing it.
//
// `interest` — точка интереса (например, баллон небесного драккара): часть
// бродячей стаи закладывает вокруг неё тесные круги, как вокруг мачты
// настоящего корабля.
export function Birds({
  center,
  worldRadius,
  interest,
  count = 16,
}: {
  center: readonly [number, number];
  worldRadius?: number;
  interest?: readonly [number, number, number];
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
          uInterest: { value: [interest?.[0] ?? center[0], interest?.[2] ?? center[1]] },
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
          attribute float aSwing;
          attribute float aExcursion;
          attribute float aFocus;
          uniform float uTime;
          uniform vec2 uCenter;
          uniform vec2 uInterest;
          varying vec2 vUv;
          varying float vSlope;
          void main() {
            vUv = uv;
            // Лёгкая неравномерность хода: птица чуть ускоряется на махах.
            float surge = sin(uTime * 0.9 + aPhase * 5.1) * 0.06;
            float ang = aAngle + uTime * aSpeed + surge;
            float swingPhase = uTime * aSwing + aPhase * 3.7;
            float radius = aRadius + sin(swingPhase) * aExcursion;

            // Очереди махов: медленный затвор открывает серию взмахов, между
            // сериями — планирование с застывшими в пологом V крыльями.
            float gateRate = 0.16 + fract(aPhase * 0.618) * 0.18;
            float gate = smoothstep(0.25, 0.6, 0.5 + 0.5 * sin(uTime * gateRate + aPhase * 4.0));
            float flapOsc = sin(uTime * (5.5 + aScale * 1.2) + aPhase * 6.2833);
            vSlope = mix(0.14, 0.2 + flapOsc * 0.55, gate);

            // Высота дышит вместе с махами: серия взмахов — набор, планирование
            // — плавная просадка. Бродячая стая ещё и выше на дальней дуге.
            float alt = aAltitude
              + (gate - 0.5) * 2.4
              + sin(uTime * 0.23 + aPhase) * 0.9
              + sin(swingPhase) * min(aExcursion * 0.16, 3.0);

            // Птицы интереса кружат вокруг своей точки (баллон драккара),
            // остальные — вокруг центра мира.
            vec2 orbitCenter = mix(uCenter, uInterest, aFocus);
            vec3 world = vec3(
              orbitCenter.x + cos(ang) * radius,
              alt,
              orbitCenter.y + sin(ang) * radius
            );

            // Ориентация по вектору полёта, а не на камеру: крылья поперёк
            // курса, корпус вдоль. Скорость — производная траектории
            // (касательная орбиты + радиальный ход блуждания).
            float radialRate = cos(swingPhase) * aSwing * aExcursion;
            vec3 velocity = vec3(
              -sin(ang) * radius * aSpeed + cos(ang) * radialRate,
              0.0,
              cos(ang) * radius * aSpeed + sin(ang) * radialRate
            );
            vec3 forward = normalize(velocity + vec3(0.0001, 0.0, 0.0));
            vec3 wing = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
            // Крен в вираж: внутрь орбиты, сильнее у быстрых стай.
            float bank = sign(aSpeed) * (0.2 + fract(aPhase * 2.39) * 0.15);
            vec3 lift = normalize(cross(forward, wing));
            vec3 wingB = wing * cos(bank) + lift * sin(bank);
            vec3 liftB = normalize(cross(forward, wingB));

            vec3 offset = wingB * position.x * aScale
              + (liftB * 0.75 + forward * 0.65) * position.y * aScale;
            gl_Position = projectionMatrix * viewMatrix * vec4(world + offset, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying vec2 vUv;
          varying float vSlope;
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            float x = abs(p.x);
            // Стреловидное крыло: подъём по машущему наклону, загиб концов
            // вниз, хорда сужается от корня к кончику. Кромки мягкие.
            float wingY = vSlope * x - 0.22 * x * x;
            float chord = mix(0.14, 0.035, smoothstep(0.08, 1.0, x));
            float wing = 1.0 - smoothstep(chord, chord + 0.07, abs(p.y - wingY));
            wing *= 1.0 - smoothstep(0.9, 1.0, x);
            // Тело — вытянутая капля с хвостом назад (−y — корма).
            float body = 1.0 - smoothstep(0.14, 0.2,
              length(vec2(p.x * 1.7, (p.y + 0.06) * (p.y > -0.06 ? 1.0 : 0.62))));
            float alpha = max(wing, body);
            if (alpha < 0.04) discard;
            // Брюхо чуть светлее спины, но оба тёмные ОТНОСИТЕЛЬНО неба:
            // в контровом свете чайка — графичный силуэт, светлый градиент
            // размывал её на дистанции.
            vec3 tint = mix(vec3(0.1, 0.1, 0.12), vec3(0.24, 0.25, 0.27),
              smoothstep(-0.25, 0.3, p.y));
            gl_FragColor = vec4(tint, alpha * 0.94);
          }
        `,
      }),
    [center, interest],
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
    const aSwing = new Float32Array(count);
    const aExcursion = new Float32Array(count);
    const aFocus = new Float32Array(count);
    const rand = (index: number, salt: number) => {
      const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < count; index += 1) {
      // Two lazy flocks orbiting at slightly different radii and heights;
      // with a worldRadius, every third bird wanders out over the fog.
      const flock = worldRadius ? index % 3 : index % 2;
      aAngle[index] = rand(index, 1) * Math.PI * 2;
      aPhase[index] = rand(index, 5) * Math.PI * 2;
      aScale[index] = 1.5 + rand(index, 6) * 1.2;
      if (interest && flock === 2 && rand(index, 9) > 0.45) {
        // Часть бродячей стаи присвоила себе точку интереса: тесные круги
        // вокруг баллона, разные высоты и направления, скорость выше —
        // радиус мал, и угловая скорость должна расти, чтобы линейная
        // осталась птичьей.
        aFocus[index] = 1;
        aRadius[index] = 8 + rand(index, 2) * 4;
        aAltitude[index] = interest[1] - 1.5 + rand(index, 3) * 5.5;
        aSpeed[index] = (0.2 + rand(index, 4) * 0.14) * (index % 2 === 0 ? 1 : -1);
        aSwing[index] = 0.25;
        aExcursion[index] = 0.6 + rand(index, 8) * 1.2;
      } else if (flock === 2 && worldRadius) {
        aRadius[index] = worldRadius - 12 + rand(index, 2) * 8;
        aAltitude[index] = 26 + rand(index, 3) * 10;
        aSpeed[index] = (0.03 + rand(index, 4) * 0.02) * (index % 2 === 0 ? 1 : -1);
        aSwing[index] = 0.035 + rand(index, 7) * 0.03;
        aExcursion[index] = 18 + rand(index, 8) * 14;
      } else {
        aRadius[index] = 34 + flock * 20 + rand(index, 2) * 16;
        aAltitude[index] = 24 + flock * 6 + rand(index, 3) * 7;
        aSpeed[index] = (0.05 + rand(index, 4) * 0.045) * (flock === 0 ? 1 : -1);
        aSwing[index] = 0;
        aExcursion[index] = 0;
      }
      mesh.setMatrixAt(index, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aAngle", new InstancedBufferAttribute(aAngle, 1));
    geometry.setAttribute("aRadius", new InstancedBufferAttribute(aRadius, 1));
    geometry.setAttribute("aAltitude", new InstancedBufferAttribute(aAltitude, 1));
    geometry.setAttribute("aSpeed", new InstancedBufferAttribute(aSpeed, 1));
    geometry.setAttribute("aPhase", new InstancedBufferAttribute(aPhase, 1));
    geometry.setAttribute("aScale", new InstancedBufferAttribute(aScale, 1));
    geometry.setAttribute("aSwing", new InstancedBufferAttribute(aSwing, 1));
    geometry.setAttribute("aExcursion", new InstancedBufferAttribute(aExcursion, 1));
    geometry.setAttribute("aFocus", new InstancedBufferAttribute(aFocus, 1));
    mesh.frustumCulled = false;
  }, [count, geometry, worldRadius, interest]);

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
