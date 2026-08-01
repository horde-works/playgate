import {
  Data3DTexture,
  IcosahedronGeometry,
  LinearFilter,
  NormalBlending,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from "three";
import {
  createPoolWithGeometry,
  type ParticlePool,
} from "./fxParticlePool";

/**
 * Shared cumulus-smoke core: one instanced icosphere draw whose billows are
 * carved and shaded by a single WORLD-anchored 3D noise field, so packets
 * from any emitter fuse into connected clouds instead of reading as painted
 * balls. Current emitters: explosion aftermath. Designed to be fed by future
 * ones (building fires, smouldering wrecks, …) with their own palettes.
 *
 * Kind channel (aStyle.y): 0 soot, 1 dust, 2 surface surge (hugs its clamp
 * plane, late buoyancy). 3+ is free for future emitters.
 *
 * Particles are kinematic and know nothing about scene geometry except the
 * optional per-particle clamp plane (aClamp): packets slide along the
 * surface they were born against instead of sinking into it.
 */

export function createFxNoiseTexture(): Data3DTexture {
  const size = 32;
  const data = new Uint8Array(size * size * size);
  const lattice = (x: number, y: number, z: number, salt: number) => {
    let hash = Math.imul(x + salt * 17, 0x1f123bb5);
    hash ^= Math.imul(y + salt * 31, 0x5f356495);
    hash ^= Math.imul(z + salt * 47, 0x6c8e9cf5);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 0xffffffff;
  };
  const smooth = (value: number) => value * value * (3 - 2 * value);
  const periodicValueNoise = (
    x: number,
    y: number,
    z: number,
    period: number,
    salt: number,
  ) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const tz = smooth(z - z0);
    const wrap = (value: number) => ((value % period) + period) % period;
    const sample = (dx: number, dy: number, dz: number) =>
      lattice(wrap(x0 + dx), wrap(y0 + dy), wrap(z0 + dz), salt);
    const x00 = sample(0, 0, 0) * (1 - tx) + sample(1, 0, 0) * tx;
    const x10 = sample(0, 1, 0) * (1 - tx) + sample(1, 1, 0) * tx;
    const x01 = sample(0, 0, 1) * (1 - tx) + sample(1, 0, 1) * tx;
    const x11 = sample(0, 1, 1) * (1 - tx) + sample(1, 1, 1) * tx;
    const y0Value = x00 * (1 - ty) + x10 * ty;
    const y1Value = x01 * (1 - ty) + x11 * ty;
    return y0Value * (1 - tz) + y1Value * tz;
  };
  for (let z = 0; z < size; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const broad = periodicValueNoise(
          (x / size) * 3,
          (y / size) * 3,
          (z / size) * 3,
          3,
          11,
        );
        const medium = periodicValueNoise(
          (x / size) * 6,
          (y / size) * 6,
          (z / size) * 6,
          6,
          23,
        );
        const detail = periodicValueNoise(
          (x / size) * 11,
          (y / size) * 11,
          (z / size) * 11,
          11,
          37,
        );
        const value = broad * 0.58 + medium * 0.29 + detail * 0.13;
        data[x + y * size + z * size * size] = Math.round(value * 255);
      }
    }
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createBillowSmokeMaterial(noise: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uLightWorld: { value: new Vector3(0.35, 0.72, 0.5).normalize() },
      uNoise: { value: noise },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aOrigin;
      attribute vec3 aVelocity;
      attribute vec4 aTiming;
      attribute vec4 aStyle;
      attribute vec3 aColor;
      attribute vec4 aClamp;
      varying float vLife;
      varying float vSeed;
      varying float vKind;
      varying float vDensity;
      varying vec3 vColor;
      varying vec3 vNormalWorld;
      varying vec3 vLocal;
      varying vec3 vWorldPos;

      void main() {
        float age = uTime - aTiming.x;
        float duration = aTiming.y;
        if (duration <= 0.0 || age < 0.0 || age >= duration) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          vLife = 1.0;
          return;
        }

        float life = clamp(age / duration, 0.0, 1.0);
        // aStyle.y: 0 soot, 1 dust, 2 surface surge (ground/facade skirt).
        float dusty = clamp(aStyle.y, 0.0, 1.0);
        float surge = step(1.5, aStyle.y);
        // Surge packets hug the surface: low drag keeps their tangential
        // momentum and buoyancy arrives late, so the skirt stays low.
        float drag = mix(mix(1.45, 2.05, dusty), 0.9, surge);
        float travel = (1.0 - exp(-drag * age)) / drag;
        vec3 center = aOrigin + aVelocity * travel;

        // Explosion smoke first preserves radial momentum. Buoyancy becomes
        // dominant only after the packet has slowed and entrained cool air.
        float buoyantAge = max(
          0.0,
          age - mix(mix(0.16, 0.28, dusty), 0.55, surge)
        );
        float buoyantTravel = (1.0 - exp(-0.72 * buoyantAge)) / 0.72;
        center.y += aTiming.z * buoyantTravel;

        // Cheap vortex roll at the cloud boundary. Both centre and surface are
        // world-space, so parallax and lighting survive camera movement.
        vec3 flowAxis = length(aVelocity) > 0.01
          ? normalize(aVelocity)
          : vec3(0.0, 1.0, 0.0);
        vec3 helper = abs(flowAxis.y) < 0.86
          ? vec3(0.0, 1.0, 0.0)
          : vec3(1.0, 0.0, 0.0);
        vec3 tangent = normalize(cross(flowAxis, helper));
        vec3 bitangent = normalize(cross(flowAxis, tangent));
        float curlPhase = aStyle.x * 6.2831853 + age * mix(1.35, 0.86, life);
        float curlRadius = aTiming.w * (0.08 + 0.26 * life)
          * mix(0.7, 1.0, dusty);
        center += tangent * sin(curlPhase) * curlRadius;
        center += bitangent * cos(curlPhase) * curlRadius * 0.62;

        float growth = surge > 0.5
          ? mix(0.5, 2.7, pow(life, 0.55))
          : (aStyle.y < 0.5
            ? mix(0.46, 1.82, pow(life, 0.62))
            : mix(0.4, 2.05, pow(life, 0.7)));
        float radius = aTiming.w * growth;

        // The packet never crosses the surface it was born against: the
        // centre stays a shell-radius in front of the clamp plane, so drift
        // and buoyancy slide the billow ALONG the wall or ground.
        if (dot(aClamp.xyz, aClamp.xyz) > 0.5) {
          float depth = dot(center, aClamp.xyz) - aClamp.w;
          float margin = radius * 0.55;
          if (depth < margin) center += aClamp.xyz * (margin - depth);
        }

        float fold = sin(
          dot(normalize(position), vec3(2.3, 3.1, 1.7)) * 2.2
          + aStyle.x * 12.7
          + life * 1.8
        );
        float secondaryFold = sin(
          dot(normalize(position), vec3(-1.4, 2.0, 2.7)) * 3.1
          - aStyle.x * 8.9
        );
        float deformation = 1.0 + fold * 0.17 + secondaryFold * 0.09;
        vec3 local = position * radius * deformation;
        vec3 world = center + local;

        vLife = life;
        vSeed = aStyle.x;
        vKind = aStyle.y;
        vDensity = aStyle.w;
        vColor = aColor;
        vNormalWorld = normalize(position);
        vLocal = normalize(position);
        vWorldPos = world;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler3D;
      uniform vec3 uLightWorld;
      uniform float uTime;
      uniform sampler3D uNoise;
      varying float vLife;
      varying float vSeed;
      varying float vKind;
      varying float vDensity;
      varying vec3 vColor;
      varying vec3 vNormalWorld;
      varying vec3 vLocal;
      varying vec3 vWorldPos;

      void main() {
        // One world-anchored noise field shared by all packets: overlapping
        // billows show the same folds and fuse into a single cloud instead of
        // reading as separately painted balls. The slow vertical drift makes
        // the cloud roil as packets move through the field.
        vec3 fieldDrift = vec3(0.0, -uTime * 0.045, 0.0);
        float broad = texture(uNoise, vWorldPos * 0.12 + fieldDrift).r;
        float detail = texture(uNoise, vWorldPos * 0.27 + fieldDrift * 1.6).r;
        float structure = 0.55 + 0.5 * (broad * 0.65 + detail * 0.35);
        float appear = smoothstep(0.0, 0.075, vLife);
        float fade = smoothstep(1.0, 0.62, vLife);
        // Noise erodes the grazing-angle shell: neither the polygon mesh
        // silhouette nor the perfect sphere edge survives.
        float rim = abs(dot(
          normalize(vWorldPos - cameraPosition),
          normalize(vNormalWorld)
        ));
        float boundary = rim
          + (broad - 0.5) * 0.55
          + (detail - 0.5) * 0.32;
        float alpha = (1.0 - exp(-vDensity * structure * 1.9))
          * smoothstep(0.01, 0.68, boundary)
          * appear * fade;
        if (alpha < 0.004) discard;

        vec3 normalWorld = normalize(vNormalWorld);
        float direct = max(0.0, dot(normalWorld, normalize(uLightWorld)));
        float skylight = normalWorld.y * 0.5 + 0.5;
        float denseShadow = mix(0.5, 0.34, clamp(vKind, 0.0, 1.0))
          * vDensity * (1.0 - direct);
        // Directional light stays soft: per-sphere shading seams are what
        // betrayed the packet boundaries. Crevice shading comes from the
        // shared field instead, so it crosses packets seamlessly.
        float lighting = max(
          0.16,
          0.34 + direct * 0.3 + skylight * 0.24 - denseShadow
        );
        lighting *= 0.78 + 0.42 * broad;

        vec3 aged = mix(vColor * 0.72, vColor * 1.08, vLife);
        gl_FragColor = vec4(aged * lighting, alpha);
      }
    `,
  });
}

export function createBillowSmokePool(
  capacity: number,
  noise: Data3DTexture,
): ParticlePool {
  // Detail 3: the billow silhouette must curve, not read as a polyhedron.
  return createPoolWithGeometry(
    capacity,
    createBillowSmokeMaterial(noise),
    new IcosahedronGeometry(0.5, 3),
  );
}
