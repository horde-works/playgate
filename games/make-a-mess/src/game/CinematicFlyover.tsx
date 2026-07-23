"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { MathUtils, Vector3 } from "three";
import {
  flyoverChapterAt,
  flyoverSegmentAt,
  flyoverTimeOfDayAt,
  type CinematicFlyoverDefinition,
  type FlyoverChapter,
} from "./cinematicFlyoverPlan";
import type { TimeOfDay } from "./WorldEnvironment";
import styles from "./CinematicFlyover.module.css";

export type FlyoverMode = "idle" | "playing" | "recording" | "gallery" | "finished";

export interface CapturedFlyoverStill {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly url: string;
  readonly fileName: string;
  readonly cleanUrl?: string;
  readonly cleanFileName?: string;
}

interface CinematicCameraRigProps {
  readonly definition: CinematicFlyoverDefinition;
  readonly runId: number;
  readonly running: boolean;
  readonly onChapterChange: (chapter: FlyoverChapter | null) => void;
  readonly onProgress: (progress: number) => void;
  readonly onTimeOfDayChange: (timeOfDay: TimeOfDay) => void;
  readonly onStill: (chapter: FlyoverChapter, canvas: HTMLCanvasElement) => void;
  readonly onComplete: () => void;
}

function catmullRom(
  target: Vector3,
  previous: Vector3,
  start: Vector3,
  end: Vector3,
  next: Vector3,
  amount: number,
): Vector3 {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  const startTangentX = (end.x - previous.x) * 0.5;
  const startTangentY = (end.y - previous.y) * 0.5;
  const startTangentZ = (end.z - previous.z) * 0.5;
  const endTangentX = (next.x - start.x) * 0.5;
  const endTangentY = (next.y - start.y) * 0.5;
  const endTangentZ = (next.z - start.z) * 0.5;
  const startWeight = 2 * amount3 - 3 * amount2 + 1;
  const startTangentWeight = amount3 - 2 * amount2 + amount;
  const endWeight = -2 * amount3 + 3 * amount2;
  const endTangentWeight = amount3 - amount2;
  return target.set(
    startWeight * start.x + startTangentWeight * startTangentX + endWeight * end.x + endTangentWeight * endTangentX,
    startWeight * start.y + startTangentWeight * startTangentY + endWeight * end.y + endTangentWeight * endTangentY,
    startWeight * start.z + startTangentWeight * startTangentZ + endWeight * end.z + endTangentWeight * endTangentZ,
  );
}

export function CinematicCameraRig({
  definition,
  runId,
  running,
  onChapterChange,
  onProgress,
  onTimeOfDayChange,
  onStill,
  onComplete,
}: CinematicCameraRigProps) {
  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const elapsed = useRef(0);
  const previousRun = useRef(runId);
  const previousChapter = useRef<string | null>(null);
  const previousTimeOfDay = useRef<TimeOfDay | null>(null);
  const previousProgressReport = useRef(-1);
  const completed = useRef(false);
  const captured = useRef(new Set<string>());
  const position = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const points = useMemo(
    () => definition.keyframes.map((keyframe) => new Vector3(...keyframe.position)),
    [definition],
  );
  const targets = useMemo(
    () => definition.keyframes.map((keyframe) => new Vector3(...keyframe.lookAt)),
    [definition],
  );

  useEffect(() => {
    if (previousRun.current === runId) {
      return;
    }
    previousRun.current = runId;
    elapsed.current = 0;
    previousChapter.current = null;
    previousTimeOfDay.current = null;
    previousProgressReport.current = -1;
    completed.current = false;
    captured.current.clear();
  }, [runId]);

  useFrame((_, delta) => {
    if (!running || definition.keyframes.length < 2) {
      return;
    }

    elapsed.current = Math.min(
      definition.durationSeconds,
      elapsed.current + Math.min(delta, 1 / 15),
    );
    const progress = elapsed.current / definition.durationSeconds;
    const segment = flyoverSegmentAt(definition.keyframes, progress);
    const eased = MathUtils.smootherstep(segment.localProgress, 0, 1);
    const lastIndex = definition.keyframes.length - 1;
    const startIndex = segment.index;
    const endIndex = Math.min(lastIndex, startIndex + 1);
    catmullRom(
      position,
      points[Math.max(0, startIndex - 1)],
      points[startIndex],
      points[endIndex],
      points[Math.min(lastIndex, endIndex + 1)],
      eased,
    );
    catmullRom(
      target,
      targets[Math.max(0, startIndex - 1)],
      targets[startIndex],
      targets[endIndex],
      targets[Math.min(lastIndex, endIndex + 1)],
      eased,
    );

    const activeCamera = cameraRef.current;
    activeCamera.position.copy(position);
    activeCamera.lookAt(target);
    const startFov = definition.keyframes[startIndex].fov ?? 55;
    const endFov = definition.keyframes[endIndex].fov ?? startFov;
    if ("fov" in activeCamera) {
      activeCamera.fov = MathUtils.lerp(startFov, endFov, eased);
      activeCamera.updateProjectionMatrix();
    }

    const chapter = flyoverChapterAt(definition.chapters, progress);
    const chapterId = chapter?.id ?? null;
    if (chapterId !== previousChapter.current) {
      previousChapter.current = chapterId;
      onChapterChange(chapter);
    }

    const timeOfDay = flyoverTimeOfDayAt(definition.keyframes, progress);
    if (timeOfDay !== previousTimeOfDay.current) {
      previousTimeOfDay.current = timeOfDay;
      onTimeOfDayChange(timeOfDay);
    }

    if (progress - previousProgressReport.current >= 0.008 || progress >= 1) {
      previousProgressReport.current = progress;
      onProgress(progress);
    }

    for (const stillChapter of definition.chapters) {
      if (
        stillChapter.captureAt !== undefined &&
        progress >= stillChapter.captureAt &&
        !captured.current.has(stillChapter.id)
      ) {
        captured.current.add(stillChapter.id);
        onStill(stillChapter, gl.domElement);
      }
    }

    if (progress >= 1 && !completed.current) {
      completed.current = true;
      onComplete();
    }
  });

  return null;
}

export function canRecordFlyover(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window;
}

function subscribeToRecordingSupport(): () => void {
  return () => undefined;
}

export function startFlyoverRecording(
  sourceCanvas: HTMLCanvasElement,
  getOverlay: () => {
    readonly definition: CinematicFlyoverDefinition;
    readonly chapter: FlyoverChapter | null;
    readonly progress: number;
  },
  onComplete: (blob: Blob) => void,
  onError: () => void,
): MediaRecorder | null {
  if (!canRecordFlyover()) {
    onError();
    return null;
  }
  const preferredTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
  try {
    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = 1920;
    recordingCanvas.height = 1080;
    const context = recordingCanvas.getContext("2d", { alpha: false });
    if (!context || typeof recordingCanvas.captureStream !== "function") {
      onError();
      return null;
    }
    const recorder = new MediaRecorder(
      recordingCanvas.captureStream(30),
      mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined,
    );
    const chunks: Blob[] = [];
    let animationFrame = 0;
    const renderRecordingFrame = () => {
      const width = recordingCanvas.width;
      const height = recordingCanvas.height;
      paintCanvasCover(context, sourceCanvas, width, height);
      paintRecordedTypography(context, width, height, getOverlay());
      animationFrame = requestAnimationFrame(renderRecordingFrame);
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = onError;
    recorder.onstop = () => {
      cancelAnimationFrame(animationFrame);
      if (chunks.length === 0) {
        onError();
        return;
      }
      onComplete(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
    renderRecordingFrame();
    recorder.start(1000);
    return recorder;
  } catch {
    onError();
    return null;
  }
}

function paintCanvasCover(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const sourceWidth = Math.max(1, sourceCanvas.width);
  const sourceHeight = Math.max(1, sourceCanvas.height);
  const cover = Math.max(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * cover;
  const drawnHeight = sourceHeight * cover;
  context.drawImage(
    sourceCanvas,
    (width - drawnWidth) / 2,
    (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  );
}

export function createFlyoverStoryFrame(
  sourceCanvas: HTMLCanvasElement,
  definition: CinematicFlyoverDefinition,
  chapter: FlyoverChapter,
  withTypography = true,
): Promise<Blob | null> {
  const storyCanvas = document.createElement("canvas");
  storyCanvas.width = 1920;
  storyCanvas.height = 1080;
  const context = storyCanvas.getContext("2d", { alpha: false });
  if (!context) {
    return Promise.resolve(null);
  }
  paintCanvasCover(context, sourceCanvas, storyCanvas.width, storyCanvas.height);
  if (withTypography) {
    paintRecordedTypography(context, storyCanvas.width, storyCanvas.height, {
      definition,
      chapter,
      progress: chapter.captureAt ?? (chapter.from + chapter.to) / 2,
    });
  }
  return new Promise((resolve) => storyCanvas.toBlob(resolve, "image/png"));
}

function wrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maximumWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const amount = Math.min(1, Math.max(0, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

function paintRecordedTypography(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: {
    readonly definition: CinematicFlyoverDefinition;
    readonly chapter: FlyoverChapter | null;
    readonly progress: number;
  },
): void {
  const barHeight = Math.round(height * 0.067);
  const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.44)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#050606";
  context.fillRect(0, 0, width, barHeight);
  context.fillRect(0, height - barHeight, width, barHeight);

  context.save();
  context.fillStyle = "rgba(246,240,227,0.72)";
  context.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.letterSpacing = "2px";
  context.textAlign = "left";
  context.fillText(overlay.definition.title.toUpperCase(), 72, barHeight + 42);
  context.fillStyle = "#d9ff3f";
  context.textAlign = "right";
  context.fillText(overlay.definition.storyLabel, width - 72, barHeight + 42);
  context.restore();

  const chapter = overlay.chapter;
  if (chapter) {
    const local = Math.min(1, Math.max(0, (overlay.progress - chapter.from) / Math.max(0.001, chapter.to - chapter.from)));
    const alpha = Math.min(smoothStep(0, 0.16, local), 1 - smoothStep(0.78, 1, local));
    const scale = 0.93 + smoothStep(0, 0.18, local) * 0.07 + smoothStep(0.82, 1, local) * 0.035;
    const alignment = chapter.align ?? "left";
    const anchorX = alignment === "left" ? 145 : alignment === "right" ? width - 145 : width / 2;
    const maximumWidth = alignment === "center" ? 1200 : 940;
    context.save();
    context.globalAlpha = alpha;
    context.translate(anchorX, height * 0.49);
    context.scale(scale, scale);
    context.textAlign = alignment;
    context.shadowColor = "rgba(0,0,0,0.72)";
    context.shadowBlur = 30;
    if (chapter.kicker) {
      context.fillStyle = "#d9ff3f";
      context.font = "800 18px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(chapter.kicker, 0, -132);
    }
    context.fillStyle = "#f6f0e3";
    const heroTitle = chapter.textScale === "hero";
    context.font = `850 ${heroTitle ? 156 : 92}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    const titleLines = wrappedLines(context, chapter.title, maximumWidth);
    const titleStart = -((titleLines.length - 1) * 88) / 2;
    titleLines.forEach((line, index) => context.fillText(line, 0, titleStart + index * 88));
    if (chapter.body) {
      context.fillStyle = "rgba(246,240,227,0.88)";
      context.font = "500 23px ui-monospace, SFMono-Regular, Menlo, monospace";
      const bodyLines = wrappedLines(context, chapter.body, 720);
      bodyLines.forEach((line, index) => context.fillText(line, 0, titleStart + titleLines.length * 88 + 35 + index * 34));
    }
    context.restore();
  }

  context.fillStyle = "rgba(255,255,255,0.24)";
  context.fillRect(72, height - barHeight - 34, width - 144, 2);
  context.fillStyle = "#d9ff3f";
  context.fillRect(72, height - barHeight - 34, (width - 144) * overlay.progress, 2);
}

export function CinematicFlyoverLauncher({
  ready,
  galleryCount,
  onPlay,
  onRecord,
  onGallery,
}: {
  readonly ready: boolean;
  readonly galleryCount: number;
  readonly onPlay: () => void;
  readonly onRecord: () => void;
  readonly onGallery: () => void;
}) {
  const recordingSupported = useSyncExternalStore(
    subscribeToRecordingSupport,
    canRecordFlyover,
    () => false,
  );
  return (
    <div className={styles.launcher}>
      <button type="button" disabled={!ready} onClick={onPlay}>
        <span>WATCH THE FILM</span>
        <small>92 SEC · CINEMATIC FLYOVER</small>
      </button>
      <button
        type="button"
        disabled={!ready || !recordingSupported}
        onClick={onRecord}
        title={recordingSupported ? undefined : "Video recording is not supported by this browser"}
      >
        <span>RECORD THE FILM</span>
        <small>WEBM · 1080P READY</small>
      </button>
      {galleryCount > 0 ? (
        <button className={styles.galleryLauncher} type="button" onClick={onGallery}>
          <span>STORY FRAMES</span>
          <small>{galleryCount} CINEMATIC STILLS · PNG</small>
        </button>
      ) : null}
    </div>
  );
}

export function CinematicFlyoverGalleryShortcut({
  count,
  onOpen,
}: {
  readonly count: number;
  readonly onOpen: () => void;
}) {
  return (
    <button className={styles.galleryShortcut} type="button" onClick={onOpen}>
      STORY FRAMES
      <span>{String(count).padStart(2, "0")}</span>
    </button>
  );
}

function AnimatedTitle({ title }: { readonly title: string }) {
  return (
    <h2 aria-label={title}>
      {title.split(" ").map((word, index) => (
        <span key={`${word}:${index}`} style={{ "--word-index": index } as CSSProperties}>
          {word}&nbsp;
        </span>
      ))}
    </h2>
  );
}

export function CinematicFlyoverOverlay({
  definition,
  mode,
  chapter,
  progress,
  stills,
  videoUrl,
  recordingError,
  onReplay,
  onRecordAgain,
  onExit,
}: {
  readonly definition: CinematicFlyoverDefinition;
  readonly mode: FlyoverMode;
  readonly chapter: FlyoverChapter | null;
  readonly progress: number;
  readonly stills: readonly CapturedFlyoverStill[];
  readonly videoUrl: string | null;
  readonly recordingError: boolean;
  readonly onReplay: () => void;
  readonly onRecordAgain: () => void;
  readonly onExit: () => void;
}) {
  const [showGalleryText, setShowGalleryText] = useState(true);
  if (mode === "idle") {
    return null;
  }
  const running = mode === "playing" || mode === "recording";
  const galleryStills = stills.length > 0
    ? stills
    : definition.chapters.flatMap((item, index) => item.stillImage
        ? [{
            id: item.id,
            title: item.title,
            body: item.body,
            url: item.stillImage,
            fileName: `${definition.fileName}-${String(index + 1).padStart(2, "0")}-${item.id}.png`,
            cleanUrl: item.cleanStillImage,
            cleanFileName: item.cleanStillImage
              ? `${definition.fileName}-${String(index + 1).padStart(2, "0")}-${item.id}-clean.png`
              : undefined,
          }]
        : []);
  const hasCleanStills = galleryStills.some((still) => Boolean(still.cleanUrl));
  return (
    <section className={`${styles.overlay} ${running ? styles.running : styles.finished}`} aria-live="polite">
      <div className={styles.letterboxTop} />
      <div className={styles.letterboxBottom} />
      <button
        className={`${styles.backToVillage} ${running ? styles.backDuringFilm : styles.backAfterFilm}`}
        type="button"
        onClick={onExit}
      >
        <span aria-hidden="true">←</span>
        BACK TO VILLAGE
      </button>
      {running ? (
        <>
          <div className={styles.filmLabel}>
            <span>{definition.title}</span>
            <span>{mode === "recording" ? "● REC" : definition.storyLabel}</span>
          </div>
          {chapter ? (
            <article
              key={chapter.id}
              className={`${styles.chapter} ${styles[chapter.align ?? "left"]} ${chapter.textScale === "hero" ? styles.hero : ""}`}
            >
              {chapter.kicker ? <p className={styles.kicker}>{chapter.kicker}</p> : null}
              <AnimatedTitle title={chapter.title} />
              {chapter.body ? <p className={styles.body}>{chapter.body}</p> : null}
            </article>
          ) : null}
          <div className={styles.progressTrack}>
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        </>
      ) : (
        <div className={styles.endCard}>
          <p>{mode === "gallery" ? `STORY FRAMES · ${definition.locationLabel}` : `A FILM FROM ${definition.locationLabel}`}</p>
          <h2>{definition.title}</h2>
          <div className={styles.endActions}>
            <button type="button" onClick={onReplay}>{mode === "gallery" ? "WATCH THE FILM" : "REPLAY"}</button>
            <button type="button" onClick={onRecordAgain}>
              {mode === "gallery" ? "RECORD THE FILM" : "RECORD AGAIN"}
            </button>
            {videoUrl ? (
              <a href={videoUrl} download={`${definition.fileName}.webm`}>SAVE WEBM</a>
            ) : null}
            {hasCleanStills ? (
              <button type="button" onClick={() => setShowGalleryText((current) => !current)}>
                {showGalleryText ? "HIDE TEXT" : "SHOW TEXT"}
              </button>
            ) : null}
          </div>
          {recordingError ? <p className={styles.error}>Recording was unavailable. The flyover and stills are intact.</p> : null}
          {galleryStills.length > 0 ? (
            <div className={styles.stills}>
              {galleryStills.map((still, index) => (
                <article key={still.id}>
                  <div className={styles.stillImage}>
                    {/* Captured locally from the WebGL canvas. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={showGalleryText || !still.cleanUrl ? still.url : still.cleanUrl}
                      alt={showGalleryText ? still.title : `${still.title} — clean frame`}
                    />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{still.title}</h3>
                  {still.body ? <p>{still.body}</p> : null}
                  <div className={styles.stillActions}>
                    <a href={still.url} download={still.fileName}>SAVE WITH TEXT</a>
                    {still.cleanUrl ? (
                      <a href={still.cleanUrl} download={still.cleanFileName}>SAVE CLEAN</a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
