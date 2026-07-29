"use client";

import { createPortal, useFrame } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CanvasTexture,
  Color,
  LinearFilter,
  SRGBColorSpace,
} from "three";
import type {
  BreakablePieceDefinition,
  LampEventState,
  SceneVector3,
} from "./destructionScene";
import type {
  MotionInstrumentDefinition,
  MotionInstrumentIndicatorDefinition,
  MotionTelemetrySnapshot,
  MotionTelemetryStore,
} from "./motionTelemetry";
import type {
  CompoundKinematicClusterRegistry,
  CompoundKinematicClusterRuntime,
} from "./compoundKinematicCluster";

interface InstrumentCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
}

function instrumentCanvas(width: number, height: number): InstrumentCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, texture };
}

function metricValue(
  snapshot: MotionTelemetrySnapshot | null,
  metricId: string,
  index = 0,
): number {
  const value = snapshot?.metrics.find((metric) => metric.id === metricId)?.value;
  if (typeof value === "number") {
    return index === 0 && Number.isFinite(value) ? value : 0;
  }
  const selected = value?.[index];
  return Number.isFinite(selected) ? selected ?? 0 : 0;
}

function drawHorizon(
  target: InstrumentCanvas,
  pitch: number,
  roll: number,
): void {
  const { canvas, texture } = target;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const center = canvas.width / 2;
  const radius = center - 9;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();

  context.fillStyle = "#262923";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(center, center + Math.max(-35, Math.min(35, pitch)) * 2.25);
  context.rotate(-Math.max(-70, Math.min(70, roll)) * Math.PI / 180);
  context.fillStyle = "#667a78";
  context.fillRect(-canvas.width, -canvas.height * 2, canvas.width * 2, canvas.height * 2);
  context.fillStyle = "#73523a";
  context.fillRect(-canvas.width, 0, canvas.width * 2, canvas.height * 2);
  context.strokeStyle = "#e5d8b6";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-canvas.width, 0);
  context.lineTo(canvas.width, 0);
  context.stroke();
  context.strokeStyle = "rgba(232, 219, 182, 0.78)";
  context.fillStyle = "rgba(232, 219, 182, 0.86)";
  context.font = "700 15px Georgia, serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let degrees = -30; degrees <= 30; degrees += 10) {
    if (degrees === 0) {
      continue;
    }
    const y = -degrees * 2.25;
    const half = degrees % 20 === 0 ? 38 : 25;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-half, y);
    context.lineTo(half, y);
    context.stroke();
    context.fillText(String(Math.abs(degrees)), -half - 15, y);
    context.fillText(String(Math.abs(degrees)), half + 15, y);
  }
  context.restore();

  const shade = context.createRadialGradient(
    center,
    center,
    radius * 0.55,
    center,
    center,
    radius,
  );
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(28, 22, 13, 0.42)");
  context.fillStyle = shade;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fill();

  // Fixed brass aircraft mark; only the painted drum moves behind it.
  context.strokeStyle = "#c6a45e";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(center - 52, center);
  context.lineTo(center - 16, center);
  context.lineTo(center, center + 12);
  context.lineTo(center + 16, center);
  context.lineTo(center + 52, center);
  context.stroke();
  context.beginPath();
  context.arc(center, center, 5, 0, Math.PI * 2);
  context.fillStyle = "#c6a45e";
  context.fill();
  texture.needsUpdate = true;
}

function indicatorLevel(
  indicator: MotionInstrumentIndicatorDefinition,
  phase: string,
  snapshot: MotionTelemetrySnapshot | null,
): number {
  if (indicator.condition.kind === "phase") {
    return indicator.condition.phases.includes(phase) ? 1 : 0;
  }
  const value = Math.abs(metricValue(
    snapshot,
    indicator.condition.metricId,
    indicator.condition.valueIndex ?? 0,
  ));
  return Math.max(0, Math.min(1, value / Math.max(1e-6, indicator.condition.fullScale)));
}

function drawIndicators(
  target: InstrumentCanvas,
  definition: MotionInstrumentDefinition,
  phase: string,
  snapshot: MotionTelemetrySnapshot | null,
): void {
  const { canvas, texture } = target;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  const face = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  face.addColorStop(0, "#4b4233");
  face.addColorStop(0.48, "#302b24");
  face.addColorStop(1, "#1f211d");
  context.fillStyle = face;
  context.beginPath();
  context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
  context.fill();
  context.strokeStyle = "#8f7444";
  context.lineWidth = 4;
  context.stroke();

  // Old annunciators were a row of labelled sockets, not a flat UI card.
  context.font = "700 23px Georgia, serif";
  context.textBaseline = "middle";
  const rowHeight = (canvas.height - 30) / definition.indicators.length;
  definition.indicators.forEach((indicator, index) => {
    const y = 15 + rowHeight * (index + 0.5);
    const level = indicatorLevel(indicator, phase, snapshot);
    const lampColor = new Color(indicator.color).getStyle();
    if (index > 0) {
      context.strokeStyle = "rgba(170, 143, 88, 0.22)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(16, y - rowHeight / 2);
      context.lineTo(canvas.width - 16, y - rowHeight / 2);
      context.stroke();
    }
    context.fillStyle = level > 0.03 ? "#eadfbe" : "#9e967e";
    context.textAlign = "left";
    context.fillText(indicator.label, 20, y);

    const bulbX = canvas.width - 46;
    const bulbRadius = 13;
    context.save();
    context.shadowColor = lampColor;
    context.shadowBlur = level * 18;
    context.fillStyle = "#151613";
    context.strokeStyle = "#967b48";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(bulbX, y, bulbRadius + 3, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    const bulb = context.createRadialGradient(
      bulbX - 4,
      y - 5,
      1,
      bulbX,
      y,
      bulbRadius,
    );
    bulb.addColorStop(0, level > 0.03 ? "#fff8d8" : "#706d60");
    bulb.addColorStop(0.28, level > 0.03 ? lampColor : "#47483f");
    bulb.addColorStop(1, level > 0.03 ? lampColor : "#242621");
    context.fillStyle = bulb;
    context.beginPath();
    context.arc(bulbX, y, bulbRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  for (const [x, y] of [[12, 12], [canvas.width - 12, 12], [12, canvas.height - 12], [canvas.width - 12, canvas.height - 12]]) {
    context.fillStyle = "#b29355";
    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fill();
  }
  texture.needsUpdate = true;
}

const MotionCockpitInstrument = memo(function MotionCockpitInstrument({
  definition,
  panel,
  clusterOrigin,
  store,
  broken,
  resolveEventState,
}: {
  definition: MotionInstrumentDefinition;
  panel: BreakablePieceDefinition;
  clusterOrigin: SceneVector3;
  store: MotionTelemetryStore;
  broken: boolean;
  resolveEventState: (sourceClusterId: string) => LampEventState;
}) {
  const horizon = useMemo(() => instrumentCanvas(256, 256), []);
  const indicators = useMemo(() => instrumentCanvas(256, 384), []);
  const lastHorizonVisual = useRef("");
  const lastIndicatorVisual = useRef("");

  useEffect(() => () => {
    horizon.texture.dispose();
    indicators.texture.dispose();
  }, [horizon.texture, indicators.texture]);

  useFrame(() => {
    const snapshot = store.getSourceSnapshot(definition.sourceId);
    const phase = snapshot?.phase ?? resolveEventState(definition.sourceId);
    const pitch = metricValue(snapshot, definition.pitchMetricId);
    const roll = metricValue(snapshot, definition.rollMetricId);
    const horizonVisual = `${pitch.toFixed(2)}:${roll.toFixed(2)}`;
    if (horizonVisual !== lastHorizonVisual.current) {
      lastHorizonVisual.current = horizonVisual;
      drawHorizon(horizon, pitch, roll);
    }
    const indicatorValues = definition.indicators.map((indicator) =>
      indicatorLevel(indicator, phase, snapshot).toFixed(3));
    const indicatorVisual = `${phase}:${indicatorValues.join(":")}`;
    if (indicatorVisual !== lastIndicatorVisual.current) {
      lastIndicatorVisual.current = indicatorVisual;
      drawIndicators(indicators, definition, phase, snapshot);
    }
  });

  if (broken) {
    return null;
  }

  const localPosition: SceneVector3 = [
    panel.position[0] - clusterOrigin[0],
    panel.position[1] - clusterOrigin[1],
    panel.position[2] - clusterOrigin[2],
  ];
  const panelTop = panel.size[1] / 2;
  const plateThickness = 0.012;
  const faceY = panelTop + plateThickness + 0.002;
  const horizonRadius = Math.min(panel.size[0] * 0.34, panel.size[2] * 0.18);
  const screwX = panel.size[0] * 0.425;
  const screwZ = panel.size[2] * 0.43;

  return (
    <group
      position={[...localPosition]}
      rotation={panel.rotation ? [...panel.rotation] : undefined}
    >
      <mesh position={[0, panelTop + plateThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[
          panel.size[0] * 0.96,
          plateThickness,
          panel.size[2] * 0.96,
        ]} />
        <meshStandardMaterial color="#484238" metalness={0.68} roughness={0.5} />
      </mesh>

      {([-1, 1] as const).flatMap((xSign) =>
        ([-1, 1] as const).map((zSign) => (
          <mesh
            key={`${xSign}:${zSign}`}
            position={[xSign * screwX, faceY + 0.0015, zSign * screwZ]}
          >
            <cylinderGeometry args={[0.009, 0.009, 0.004, 12]} />
            <meshStandardMaterial color="#9d8048" metalness={0.84} roughness={0.3} />
          </mesh>
        )),
      )}

      <group position={[0, faceY, panel.size[2] * 0.245]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <circleGeometry args={[horizonRadius, 48]} />
          <meshBasicMaterial map={horizon.texture} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.002]}>
          <ringGeometry args={[horizonRadius, horizonRadius + 0.014, 48]} />
          <meshStandardMaterial color="#9b7a42" metalness={0.88} roughness={0.3} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.004]}>
          <circleGeometry args={[horizonRadius - 0.003, 48]} />
          <meshPhysicalMaterial
            color="#d9d0b8"
            transparent
            opacity={0.09}
            roughness={0.2}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group position={[0, faceY + 0.001, -panel.size[2] * 0.235]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[panel.size[2] * 0.4, panel.size[0] * 0.9]} />
          <meshBasicMaterial map={indicators.texture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
});

function MotionInstrumentPortal({
  definition,
  panel,
  store,
  broken,
  clusterRegistry,
  resolveEventState,
}: {
  definition: MotionInstrumentDefinition;
  panel: BreakablePieceDefinition;
  store: MotionTelemetryStore;
  broken: boolean;
  clusterRegistry: CompoundKinematicClusterRegistry;
  resolveEventState: (sourceClusterId: string) => LampEventState;
}) {
  const observedRuntime = useRef<CompoundKinematicClusterRuntime | null>(null);
  const [runtime, setRuntime] = useState<CompoundKinematicClusterRuntime | null>(null);

  useFrame(() => {
    const current = clusterRegistry.current.get(definition.carrierClusterId) ?? null;
    if (current === observedRuntime.current) {
      return;
    }
    observedRuntime.current = current;
    setRuntime(current);
  });

  if (!runtime) {
    return null;
  }
  return createPortal(
    <MotionCockpitInstrument
      definition={definition}
      panel={panel}
      clusterOrigin={runtime.definition.origin}
      store={store}
      broken={broken}
      resolveEventState={resolveEventState}
    />,
    runtime.visualRoot,
  );
}

export function MotionInstrumentSystem({
  definitions,
  pieceById,
  store,
  brokenPieces,
  clusterRegistry,
  resolveEventState,
}: {
  definitions: readonly MotionInstrumentDefinition[];
  pieceById: ReadonlyMap<string, BreakablePieceDefinition>;
  store: MotionTelemetryStore;
  brokenPieces: ReadonlySet<string>;
  clusterRegistry: CompoundKinematicClusterRegistry;
  resolveEventState: (sourceClusterId: string) => LampEventState;
}) {
  return (
    <>
      {definitions.map((definition) => {
        const panel = pieceById.get(definition.panelPieceId);
        return panel ? (
          <MotionInstrumentPortal
            key={definition.id}
            definition={definition}
            panel={panel}
            store={store}
            broken={brokenPieces.has(definition.panelPieceId)}
            clusterRegistry={clusterRegistry}
            resolveEventState={resolveEventState}
          />
        ) : null;
      })}
    </>
  );
}
