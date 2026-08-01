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
}

const TARGET_FRAME_MS = 1000 / 60;
const EMA_WEIGHT = 0.08;

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
  };
  private pendingPhysicsMs = 0;
  private decisionElapsedMs = 0;
  private cpuRecoveryWindows = 0;
  private gpuRecoveryWindows = 0;
  private physicsRecoveryWindows = 0;

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
    this.decisionElapsedMs += boundedFrameMs;
    if (this.decisionElapsedMs >= 1000) {
      this.decisionElapsedMs %= 1000;
      this.updateQuality(
        exclusiveCpuMs > 12.5,
        inferredGpuMs > 15.2,
        nextPhysicsMs > 5.5,
      );
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
    ): readonly [PerformanceQuality, number] => {
      if (overloaded) {
        return [Math.max(0, quality - 1) as PerformanceQuality, 0];
      }
      const recovery = recoveryWindows + 1;
      return recovery >= 5
        ? [Math.min(2, quality + 1) as PerformanceQuality, 0]
        : [quality, recovery];
    };
    const [cpuQuality, cpuRecovery] = update(
      this.snapshot.cpuQuality,
      cpuOverloaded,
      this.cpuRecoveryWindows,
    );
    const [gpuQuality, gpuRecovery] = update(
      this.snapshot.gpuQuality,
      gpuOverloaded,
      this.gpuRecoveryWindows,
    );
    const [physicsQuality, physicsRecovery] = update(
      this.snapshot.physicsQuality,
      physicsOverloaded,
      this.physicsRecoveryWindows,
    );
    this.cpuRecoveryWindows = cpuRecovery;
    this.gpuRecoveryWindows = gpuRecovery;
    this.physicsRecoveryWindows = physicsRecovery;
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

  reset(): void {
    this.snapshot = {
      ...this.snapshot,
      fps: 60,
      frameMs: TARGET_FRAME_MS,
      cpuMs: 0,
      physicsMs: 0,
      gpuMs: null,
      cpuQuality: 2,
      gpuQuality: 2,
      physicsQuality: 2,
      bottleneck: "balanced",
    };
    this.pendingPhysicsMs = 0;
    this.decisionElapsedMs = 0;
    this.cpuRecoveryWindows = 0;
    this.gpuRecoveryWindows = 0;
    this.physicsRecoveryWindows = 0;
  }
}

export const performanceGovernor = new PerformanceGovernor();
