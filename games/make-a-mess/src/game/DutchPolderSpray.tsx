"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { IcosahedronGeometry, Vector3 } from "three";
import type { InstancedMesh } from "three";
import { createBillowSmokeMaterial, createFxNoiseTexture } from "./billowSmoke";
import {
  createPoolWithGeometry,
  markPoolDirty,
  writeParticle,
} from "./fxParticlePool";
import {
  POLDER_SPILL_LIPS,
  SPRAY_RATE,
  planSprayPacket,
} from "./dutchPolderSpillModel.ts";
import { environmentState } from "./environmentState";
import { windState } from "./windState";

/**
 * The mist at the mouth: an emitter, not a shape.
 *
 * It writes into the shared billow pool — the same instanced packets, the same
 * world-anchored noise field and the same drag-and-late-buoyancy motion the
 * explosion smoke uses. That is the whole point: overlapping packets fuse into
 * one cloud instead of reading as painted balls, and a cloud has no silhouette
 * of its own to betray it. A mesh shell can never do that, whatever is drawn
 * on it. The physics of WHERE and HOW FAST lives in `planSprayPacket`.
 *
 * Draw calls: 1. Live packets: about 30 of a 44 pool, 320 triangles each.
 */

const SPRAY_CAPACITY = 44;
/** Water mist is cool and very slightly blue; it is not smoke. */
const SPRAY_COLOR = [0.82, 0.86, 0.88] as const;
/** How much of the gale the cloud takes with it once it is airborne. */
const SPRAY_WIND = 0.8;
/** Never spend a whole frame catching up after a stall. */
const SPRAY_MAX_PER_FRAME = 4;

export function DutchPolderSpray({
  meshRef,
}: {
  /**
   * Handed down so `DutchPolderWater` can hide the cloud in the two passes it
   * reads back. Mist drifting over the canal is real, and the mirror SHOULD
   * carry it — but the refraction pass is the scene without water, so mist
   * caught there is sampled as bed and printed underneath the river.
   */
  readonly meshRef?: RefObject<InstancedMesh | null>;
}) {
  const study = useMemo(() => {
    if (POLDER_SPILL_LIPS.length === 0) return null;
    const noise = createFxNoiseTexture();
    // Detail 2, not the explosion's 3: the noise field eats the shell edge
    // anyway, and unlike a blast this pool never stops running.
    const pool = createPoolWithGeometry(
      SPRAY_CAPACITY,
      createBillowSmokeMaterial(noise),
      new IcosahedronGeometry(0.5, 2),
    );
    return { noise, pool };
  }, []);
  const pending = useRef(0);

  useEffect(
    () => () => {
      study?.pool.geometry.dispose();
      study?.pool.material.dispose();
      study?.noise.dispose();
    },
    [study],
  );

  useFrame((state, delta) => {
    if (!study) return;
    const now = state.clock.elapsedTime;
    const uniforms = study.pool.material.uniforms;
    /* eslint-disable react-hooks/immutability -- FX uniforms are frame state */
    uniforms.uTime.value = now;
    (uniforms.uLightWorld.value as Vector3).copy(environmentState.sunDirection);
    /* eslint-enable react-hooks/immutability */

    pending.current += delta * SPRAY_RATE * POLDER_SPILL_LIPS.length;
    let spawned = 0;
    const wind: [number, number] = [
      windState.direction[0] * windState.strength * SPRAY_WIND,
      windState.direction[1] * windState.strength * SPRAY_WIND,
    ];
    while (pending.current >= 1 && spawned < SPRAY_MAX_PER_FRAME) {
      pending.current -= 1;
      spawned += 1;
      const lip = POLDER_SPILL_LIPS[
        Math.floor(Math.random() * POLDER_SPILL_LIPS.length)
      ];
      const packet = planSprayPacket(lip, Math.random, wind);
      writeParticle(study.pool, {
        origin: packet.origin,
        velocity: packet.velocity,
        reach: packet.buoyancy,
        birth: now,
        life: packet.life,
        size: packet.size,
        seed: packet.seed,
        kind: 0,
        heat: 0,
        density: packet.density,
        color: SPRAY_COLOR,
      });
    }
    if (spawned > 0) markPoolDirty(study.pool);
    if (pending.current > SPRAY_MAX_PER_FRAME) pending.current = 0;
  });

  if (!study) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[study.pool.geometry, study.pool.material, SPRAY_CAPACITY]}
      frustumCulled={false}
      renderOrder={6}
    />
  );
}
