import { Quaternion, Vector3 } from "three";
import {
  damageBody,
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
}

export interface CarveKernelResponse {
  readonly requestId: number;
  /** null — материал не отделился (например, слишком слабый удар). */
  readonly fragments: readonly ShardDefinition[] | null;
  readonly removedVolume: number;
}

export function executeCarveKernel(
  request: CarveKernelRequest,
): CarveKernelResponse {
  const result = damageBody(
    request.source,
    {
      position: new Vector3(...request.position),
      quaternion: new Quaternion(...request.quaternion),
      linearVelocity: new Vector3(),
      angularVelocity: new Vector3(),
    },
    {
      idPrefix: request.idPrefix,
      worldPoint: new Vector3(...request.worldPoint),
      radius: request.radius,
      burstSpeed: 0,
      direction: request.direction
        ? new Vector3(...request.direction)
        : undefined,
      penetration: request.penetration,
    },
  );
  return {
    requestId: request.requestId,
    fragments: result ? result.fragments : null,
    removedVolume: result?.removedVolume ?? 0,
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
