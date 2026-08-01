import {
  BufferGeometry,
  InstancedBufferAttribute,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

/**
 * Instanced particle-pool primitives shared by every FX emitter (explosion
 * aftermath, future burning, …). A pool is a ring buffer of instanced
 * attributes over an arbitrary base geometry; materials read the attributes
 * and animate everything on the GPU — writing a particle is the only CPU
 * work, and only at spawn time.
 */
export interface ParticlePool {
  readonly capacity: number;
  readonly geometry: BufferGeometry;
  readonly material: ShaderMaterial;
  readonly origin: Float32Array;
  readonly velocity: Float32Array;
  readonly timing: Float32Array;
  readonly style: Float32Array;
  readonly color: Float32Array;
  readonly clamp: Float32Array;
  cursor: number;
}

export interface ParticleSpawn {
  readonly origin: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  /** Meaning is material-specific (travel clamp, buoyancy amplitude, …). */
  readonly reach: number;
  readonly birth: number;
  readonly life: number;
  readonly size: number;
  readonly seed: number;
  readonly kind: number;
  readonly heat: number;
  readonly density?: number;
  /**
   * Optional half-space the particle must stay in front of: xyz plane
   * normal, w plane offset (dot(n, p) = w on the surface). A zero normal
   * disables clamping. Keeps smoke from sinking into the surface it was
   * born against.
   */
  readonly clampPlane?: readonly [number, number, number, number];
  readonly color: readonly [number, number, number];
}

export function createPoolWithGeometry(
  capacity: number,
  material: ShaderMaterial,
  geometry: BufferGeometry,
): ParticlePool {
  const origin = new Float32Array(capacity * 3);
  const velocity = new Float32Array(capacity * 3);
  const timing = new Float32Array(capacity * 4);
  const style = new Float32Array(capacity * 4);
  const color = new Float32Array(capacity * 3);
  const clamp = new Float32Array(capacity * 4);
  geometry.setAttribute("aOrigin", new InstancedBufferAttribute(origin, 3));
  geometry.setAttribute("aVelocity", new InstancedBufferAttribute(velocity, 3));
  geometry.setAttribute("aTiming", new InstancedBufferAttribute(timing, 4));
  geometry.setAttribute("aStyle", new InstancedBufferAttribute(style, 4));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(color, 3));
  geometry.setAttribute("aClamp", new InstancedBufferAttribute(clamp, 4));
  return {
    capacity,
    geometry,
    material,
    origin,
    velocity,
    timing,
    style,
    color,
    clamp,
    cursor: 0,
  };
}

export function createBillboardPool(
  capacity: number,
  material: ShaderMaterial,
): ParticlePool {
  return createPoolWithGeometry(capacity, material, new PlaneGeometry(1, 1));
}

export function writeParticle(
  pool: ParticlePool,
  particle: ParticleSpawn,
): void {
  const index = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.capacity;
  pool.origin.set(particle.origin, index * 3);
  pool.velocity.set(particle.velocity, index * 3);
  pool.timing.set(
    [particle.birth, particle.life, particle.reach, particle.size],
    index * 4,
  );
  pool.style.set(
    [particle.seed, particle.kind, particle.heat, particle.density ?? 0],
    index * 4,
  );
  pool.color.set(particle.color, index * 3);
  pool.clamp.set(particle.clampPlane ?? [0, 0, 0, 0], index * 4);
}

export function markPoolDirty(pool: ParticlePool): void {
  for (const name of [
    "aOrigin",
    "aVelocity",
    "aTiming",
    "aStyle",
    "aColor",
    "aClamp",
  ] as const) {
    (pool.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate =
      true;
  }
}

export function clearPool(pool: ParticlePool): void {
  for (let index = 1; index < pool.timing.length; index += 4) {
    pool.timing[index] = 0;
  }
  pool.cursor = 0;
  markPoolDirty(pool);
}
