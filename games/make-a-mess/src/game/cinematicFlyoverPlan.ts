import type { TimeOfDay } from "./WorldEnvironment";

export type FlyoverTextAlignment = "left" | "center" | "right";
export type FlyoverTextScale = "standard" | "hero";

export interface FlyoverCameraKeyframe {
  readonly at: number;
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly fov?: number;
  readonly timeOfDay: TimeOfDay;
}

export interface FlyoverChapter {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly kicker?: string;
  readonly title: string;
  readonly body?: string;
  readonly align?: FlyoverTextAlignment;
  readonly textScale?: FlyoverTextScale;
  readonly captureAt?: number;
  readonly stillImage?: string;
  readonly cleanStillImage?: string;
}

export interface CinematicFlyoverDefinition {
  readonly id: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly storyLabel: string;
  readonly durationSeconds: number;
  readonly fileName: string;
  readonly keyframes: readonly FlyoverCameraKeyframe[];
  readonly chapters: readonly FlyoverChapter[];
}

export interface FlyoverSegment {
  readonly index: number;
  readonly localProgress: number;
}

export function flyoverSegmentAt(
  keyframes: readonly FlyoverCameraKeyframe[],
  progress: number,
): FlyoverSegment {
  const clamped = Math.min(1, Math.max(0, progress));
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (clamped <= next.at || index === keyframes.length - 2) {
      const span = Math.max(0.0001, next.at - current.at);
      return {
        index,
        localProgress: Math.min(1, Math.max(0, (clamped - current.at) / span)),
      };
    }
  }
  return { index: Math.max(0, keyframes.length - 2), localProgress: 1 };
}

export function flyoverChapterAt(
  chapters: readonly FlyoverChapter[],
  progress: number,
): FlyoverChapter | null {
  return chapters.find((chapter) => progress >= chapter.from && progress <= chapter.to) ?? null;
}

export function flyoverTimeOfDayAt(
  keyframes: readonly FlyoverCameraKeyframe[],
  progress: number,
): TimeOfDay {
  let current = keyframes[0]?.timeOfDay ?? "day";
  for (const keyframe of keyframes) {
    if (keyframe.at > progress) {
      break;
    }
    current = keyframe.timeOfDay;
  }
  return current;
}
