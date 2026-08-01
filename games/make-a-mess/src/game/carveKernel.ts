import { Quaternion, Vector3 } from "three";
import {
  damageBody,
  damageBodyBatch,
  type ShardDefinition,
  type ShardSource,
} from "./destructionRuntime.ts";

/**
 * Чистое ядро carve в форме «только данные»: кортежи вместо Vector3,
 * никаких ссылок на рантайм сцены. Одна и та же функция исполняется и
 * синхронно на главном потоке (фолбэк, melee-оружие), и внутри Web Worker
 * для шагов взрыва. damageBody детерминирован и не мутирует вход
 * (applyVoxelDamage клонирует occupied), поэтому оба пути дают одинаковый
 * результат бит-в-бит.
 */
export interface CarveKernelRequest {
  readonly requestId: number;
  /** Источник урона с уже подставленным кастомным voxelBody. */
  readonly source: ShardSource;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly idPrefix: string;
  readonly worldPoint: readonly [number, number, number];
  readonly radius: number;
  readonly direction?: readonly [number, number, number];
  readonly penetration?: number;
  /** Optional coalesced hits against the same source snapshot. */
  readonly impacts?: readonly {
    readonly worldPoint: readonly [number, number, number];
    readonly radius: number;
    readonly direction?: readonly [number, number, number];
    readonly penetration?: number;
  }[];
}

export interface CarveKernelResponse {
  readonly requestId: number;
  /** null — материал не отделился (например, слишком слабый удар). */
  readonly fragments: readonly ShardDefinition[] | null;
  readonly removedVolume: number;
  readonly telemetry?: {
    readonly totalMs: number;
    readonly damageMs: number;
    readonly impactCount: number;
    readonly fragmentCount: number;
    readonly fragmentBoxCount: number;
    readonly sourceVoxelCount: number;
  };
}

export function executeCarveKernel(
  request: CarveKernelRequest,
): CarveKernelResponse {
  const startedAt = performance.now();
  const state = {
    position: new Vector3(...request.position),
    quaternion: new Quaternion(...request.quaternion),
    linearVelocity: new Vector3(),
    angularVelocity: new Vector3(),
  };
  const impacts = request.impacts?.length
    ? request.impacts
    : [
        {
          worldPoint: request.worldPoint,
          radius: request.radius,
          direction: request.direction,
          penetration: request.penetration,
        },
      ];
  const damageRequests = impacts.map((impact, index) => ({
    idPrefix: `${request.idPrefix}:${index}`,
    worldPoint: new Vector3(...impact.worldPoint),
    radius: impact.radius,
    burstSpeed: 0,
    direction: impact.direction
      ? new Vector3(...impact.direction)
      : undefined,
    penetration: impact.penetration,
  }));
  const damageStartedAt = performance.now();
  const result =
    damageRequests.length > 1
      ? damageBodyBatch(request.source, state, damageRequests)
      : damageBody(request.source, state, damageRequests[0]);
  const damageMs = performance.now() - damageStartedAt;
  const fragments = result ? result.fragments : null;
  return {
    requestId: request.requestId,
    fragments,
    removedVolume: result?.removedVolume ?? 0,
    telemetry: {
      totalMs: performance.now() - startedAt,
      damageMs,
      impactCount: impacts.length,
      fragmentCount: fragments?.length ?? 0,
      fragmentBoxCount:
        fragments?.reduce(
          (sum, fragment) => sum + (fragment.boxes?.length ?? 1),
          0,
        ) ?? 0,
      sourceVoxelCount: request.source.voxelBody?.occupied.length ?? 0,
    },
  };
}

/** Буферы фрагментов рождаются в ядре — их можно отдавать transfer'ом. */
export function carveResponseTransfers(
  response: CarveKernelResponse,
): Transferable[] {
  const transfers: Transferable[] = [];
  if (!response.fragments) {
    return transfers;
  }
  for (const fragment of response.fragments) {
    if (fragment.voxelBody) {
      transfers.push(fragment.voxelBody.occupied.buffer);
    }
  }
  return transfers;
}
