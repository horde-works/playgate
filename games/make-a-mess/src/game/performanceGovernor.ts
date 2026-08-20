export type PerformanceQuality = 0 | 1 | 2;
export type PerformanceBottleneck = "gpu" | "physics" | "cpu" | "balanced";

export interface RuntimePerformanceSnapshot {
  readonly fps: number;
  readonly frameMs: number;
  readonly cpuMs: number;
  readonly physicsMs: number;
  readonly gpuMs: number | null;
  readonly calls: number;
  readonly triangles: number;
  readonly dpr: number;
  readonly cpuQuality: PerformanceQuality;
  readonly gpuQuality: PerformanceQuality;
  readonly physicsQuality: PerformanceQuality;
  readonly bottleneck: PerformanceBottleneck;
  /**
   * Текущая ступень лестницы разрешения (индекс RENDER_SCALE_LADDER,
   * 0 — верх). Публикуется лестницей рядом с dpr: панель настроек
   * предзаполняет ручной режим тем, что автомат выбрал сейчас.
   */
  readonly renderScaleLevel: number;
}

/**
 * Ручной оверрайд осей качества. Пока он стоит, автоматика замирает: сенсоры
 * (fps, cpuMs, gpuMs, physics) продолжают мерить и показываться честно, но
 * оси держат выбранные значения. null — качеством владеет автомат.
 */
export interface QualityOverride {
  readonly cpuQuality: PerformanceQuality;
  readonly gpuQuality: PerformanceQuality;
  readonly physicsQuality: PerformanceQuality;
}

const TARGET_FRAME_MS = 1000 / 60;
const EMA_WEIGHT = 0.08;
export const DECISION_WINDOW_MS = 1000;
/** Sustained overload before a quality step drops — one noisy second is not enough. */
export const WINDOWS_BEFORE_QUALITY_DEMOTION = 3;
/** Clean windows before a quality step climbs back. */
export const WINDOWS_BEFORE_QUALITY_PROMOTION = 8;
/**
 * After the render-scale ladder rebuilds the composer, ignore quality
 * decisions: that hitch is self-inflicted and must not cascade into sky/FX.
 */
export const PIPELINE_HITCH_IGNORE_MS = 8000;
/** Plateau, not a 60 fps cliff: ~50 fps GPU, ~70% of a 60 fps CPU budget. */
export const CPU_OVERLOAD_MS = 14.5;
export const GPU_OVERLOAD_MS = 20;
export const PHYSICS_OVERLOAD_MS = 5.5;

function smooth(current: number, sample: number): number {
  return current + (sample - current) * EMA_WEIGHT;
}

class PerformanceGovernor {
  private snapshot: RuntimePerformanceSnapshot = {
    fps: 60,
    frameMs: TARGET_FRAME_MS,
    cpuMs: 0,
    physicsMs: 0,
    gpuMs: null,
    calls: 0,
    triangles: 0,
    dpr: 1,
    cpuQuality: 2,
    gpuQuality: 2,
    physicsQuality: 2,
    bottleneck: "balanced",
    renderScaleLevel: 0,
  };
  private pendingPhysicsMs = 0;
  private decisionElapsedMs = 0;
  private hitchRemainingMs = 0;
  private cpuRecoveryWindows = 0;
  private gpuRecoveryWindows = 0;
  private physicsRecoveryWindows = 0;
  private cpuOverloadWindows = 0;
  private gpuOverloadWindows = 0;
  private physicsOverloadWindows = 0;
  private override: QualityOverride | null = null;

  /**
   * Ручной режим панели настроек. Установка применяет оси немедленно (все
   * потребители читают снапшот в тот же кадр); null возвращает автомат,
   * который продолжает с текущих значений и обычной скоростью восстановления.
   */
  setQualityOverride(override: QualityOverride | null): void {
    this.override = override;
    if (override) {
      this.snapshot = { ...this.snapshot, ...override };
      this.resetQualityWindows();
    }
  }

  getQualityOverride(): QualityOverride | null {
    return this.override;
  }

  /**
   * Sky, water and shafts. Auto never touches them: hunting gpuQuality 2↔1
   * resized water targets and changed sky march steps, which made puddles
   * (env-map gloss) flash on and off. The player can still pick Low by hand.
   */
  atmosphereQuality(): PerformanceQuality {
    return this.override?.gpuQuality ?? 2;
  }

  /** Лестница разрешения публикует свою ступень для панели настроек. */
  setRenderScaleLevel(level: number): void {
    if (this.snapshot.renderScaleLevel !== level) {
      this.snapshot = { ...this.snapshot, renderScaleLevel: level };
    }
  }

  /**
   * Composer/DPR rebuilds poison the next seconds of GPU time. Sensors keep
   * updating the HUD; quality axes freeze until the hitch ages out.
   */
  notifyPipelineHitch(durationMs = PIPELINE_HITCH_IGNORE_MS): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    this.hitchRemainingMs = Math.max(this.hitchRemainingMs ?? 0, durationMs);
    this.decisionElapsedMs = 0;
  }

  recordPhysics(durationMs: number): void {
    this.pendingPhysicsMs += Math.max(0, durationMs);
  }

  recordGpu(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.snapshot = {
      ...this.snapshot,
      gpuMs:
        this.snapshot.gpuMs === null
          ? durationMs
          : smooth(this.snapshot.gpuMs, durationMs),
    };
  }

  recordFrame(
    frameMs: number,
    cpuMs: number,
    calls: number,
    triangles: number,
  ): void {
    const boundedFrameMs = Math.min(250, Math.max(0.1, frameMs));
    const physicsMs = this.pendingPhysicsMs;
    this.pendingPhysicsMs = 0;
    const nextFrameMs = smooth(this.snapshot.frameMs, boundedFrameMs);
    const nextCpuMs = smooth(this.snapshot.cpuMs, Math.max(0, cpuMs));
    const nextPhysicsMs = smooth(this.snapshot.physicsMs, physicsMs);
    const gpuMs = this.snapshot.gpuMs;
    const exclusiveCpuMs = Math.max(0, nextCpuMs - nextPhysicsMs);
    // HUD may still infer GPU from leftover time. Quality must not: a CPU
    // city frame with a missing timer query used to kill the sky.
    const inferredGpuMs = gpuMs ??
      (nextFrameMs > 22 && nextCpuMs < nextFrameMs * 0.58
        ? nextFrameMs - nextCpuMs
        : 0);
    const bottleneck: PerformanceBottleneck =
      nextPhysicsMs > 5 && nextPhysicsMs >= exclusiveCpuMs * 0.55
        ? "physics"
        : inferredGpuMs > 14 && inferredGpuMs >= exclusiveCpuMs
          ? "gpu"
          : exclusiveCpuMs > 11
            ? "cpu"
            : "balanced";

    this.snapshot = {
      ...this.snapshot,
      fps: 1000 / nextFrameMs,
      frameMs: nextFrameMs,
      cpuMs: nextCpuMs,
      physicsMs: nextPhysicsMs,
      calls,
      triangles,
      bottleneck,
    };

    if ((this.hitchRemainingMs ?? 0) > 0) {
      this.hitchRemainingMs = Math.max(0, this.hitchRemainingMs - boundedFrameMs);
      this.decisionElapsedMs = 0;
      return;
    }

    this.decisionElapsedMs += boundedFrameMs;
    if (this.decisionElapsedMs >= DECISION_WINDOW_MS) {
      this.decisionElapsedMs %= DECISION_WINDOW_MS;
      // Ручной режим: сенсоры продолжают мерить (HUD честен), оси стоят.
      if (!this.override) {
        this.updateQuality(
          exclusiveCpuMs > CPU_OVERLOAD_MS,
          gpuMs !== null && gpuMs > GPU_OVERLOAD_MS,
          nextPhysicsMs > PHYSICS_OVERLOAD_MS,
        );
      }
    }
  }

  private updateQuality(
    cpuOverloaded: boolean,
    gpuOverloaded: boolean,
    physicsOverloaded: boolean,
  ): void {
    const update = (
      quality: PerformanceQuality,
      overloaded: boolean,
      recoveryWindows: number,
      overloadWindows: number,
    ): readonly [PerformanceQuality, number, number] => {
      if (overloaded) {
        const strain = overloadWindows + 1;
        if (strain >= WINDOWS_BEFORE_QUALITY_DEMOTION) {
          return [
            Math.max(0, quality - 1) as PerformanceQuality,
            0,
            0,
          ];
        }
        return [quality, 0, strain];
      }
      const recovery = recoveryWindows + 1;
      return recovery >= WINDOWS_BEFORE_QUALITY_PROMOTION
        ? [Math.min(2, quality + 1) as PerformanceQuality, 0, 0]
        : [quality, recovery, 0];
    };
    const [cpuQuality, cpuRecovery, cpuOverload] = update(
      this.snapshot.cpuQuality,
      cpuOverloaded,
      this.cpuRecoveryWindows,
      this.cpuOverloadWindows,
    );
    const [gpuQuality, gpuRecovery, gpuOverload] = update(
      this.snapshot.gpuQuality,
      gpuOverloaded,
      this.gpuRecoveryWindows,
      this.gpuOverloadWindows,
    );
    const [physicsQuality, physicsRecovery, physicsOverload] = update(
      this.snapshot.physicsQuality,
      physicsOverloaded,
      this.physicsRecoveryWindows,
      this.physicsOverloadWindows,
    );
    this.cpuRecoveryWindows = cpuRecovery;
    this.gpuRecoveryWindows = gpuRecovery;
    this.physicsRecoveryWindows = physicsRecovery;
    this.cpuOverloadWindows = cpuOverload;
    this.gpuOverloadWindows = gpuOverload;
    this.physicsOverloadWindows = physicsOverload;
    this.snapshot = {
      ...this.snapshot,
      cpuQuality,
      gpuQuality,
      physicsQuality,
    };
  }

  setDpr(dpr: number): void {
    this.snapshot = { ...this.snapshot, dpr };
  }

  getSnapshot(): RuntimePerformanceSnapshot {
    return this.snapshot;
  }

  private resetQualityWindows(): void {
    this.cpuRecoveryWindows = 0;
    this.gpuRecoveryWindows = 0;
    this.physicsRecoveryWindows = 0;
    this.cpuOverloadWindows = 0;
    this.gpuOverloadWindows = 0;
    this.physicsOverloadWindows = 0;
  }

  reset(): void {
    this.snapshot = {
      ...this.snapshot,
      fps: 60,
      frameMs: TARGET_FRAME_MS,
      cpuMs: 0,
      physicsMs: 0,
      gpuMs: null,
      cpuQuality: this.override?.cpuQuality ?? 2,
      gpuQuality: this.override?.gpuQuality ?? 2,
      physicsQuality: this.override?.physicsQuality ?? 2,
      bottleneck: "balanced",
    };
    this.pendingPhysicsMs = 0;
    this.decisionElapsedMs = 0;
    this.hitchRemainingMs = 0;
    this.resetQualityWindows();
  }
}

const globalStore = globalThis as typeof globalThis & {
  __mamPerformanceGovernor?: PerformanceGovernor;
};

// Fast Refresh keeps the first singleton. Rebind the current prototype so
// new methods (notifyPipelineHitch, atmosphereQuality) exist on the live
// object instead of crashing MakeAMessGame after a hot reload.
export const performanceGovernor =
  globalStore.__mamPerformanceGovernor ?? new PerformanceGovernor();
globalStore.__mamPerformanceGovernor = performanceGovernor;
Object.setPrototypeOf(performanceGovernor, PerformanceGovernor.prototype);

export function notifyPipelineHitch(
  durationMs = PIPELINE_HITCH_IGNORE_MS,
): void {
  // Cast through unknown to a plain shape: intersecting with the class
  // collapses to never because these fields are private on it.
  const live = performanceGovernor as unknown as {
    hitchRemainingMs?: number;
    decisionElapsedMs?: number;
    notifyPipelineHitch?: (duration: number) => void;
  };
  if (typeof live.notifyPipelineHitch === "function") {
    live.notifyPipelineHitch(durationMs);
    return;
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  live.hitchRemainingMs = Math.max(live.hitchRemainingMs ?? 0, durationMs);
  live.decisionElapsedMs = 0;
}
