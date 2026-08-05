"use client";

import type { CSSProperties, ReactElement } from "react";
import type {
  MotionTelemetryImpact,
  MotionTelemetryMachine,
  MotionTelemetryVector3,
} from "./motionTelemetry";

const VIEW_SIZE = 80;
const VIEW_CENTRE = VIEW_SIZE / 2;
// The horizon's 72 px bezel has a ~70 px inner diameter. In this 80-unit
// viewBox a 39.2 radius projects to the same visible size.
const SPHERE_RADIUS = 39.2;
const VIEW_YAW = -34 * Math.PI / 180;
const VIEW_PITCH = 23 * Math.PI / 180;

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

function project(point: MotionTelemetryVector3): ProjectedPoint {
  const yawX = point[0] * Math.cos(VIEW_YAW) + point[2] * Math.sin(VIEW_YAW);
  const yawDepth = -point[0] * Math.sin(VIEW_YAW) +
    point[2] * Math.cos(VIEW_YAW);
  const pitchY = point[1] * Math.cos(VIEW_PITCH) -
    yawDepth * Math.sin(VIEW_PITCH);
  const depth = point[1] * Math.sin(VIEW_PITCH) +
    yawDepth * Math.cos(VIEW_PITCH);
  return {
    x: VIEW_CENTRE + yawX * SPHERE_RADIUS,
    y: VIEW_CENTRE - pitchY * SPHERE_RADIUS,
    depth,
  };
}

function ringPoint(
  plane: "vertical" | "horizontal",
  angle: number,
): MotionTelemetryVector3 {
  // Both great circles share the fore-aft axis. Their near intersection is
  // therefore the carrier's nose vector, not an arbitrary screen crosshair.
  return plane === "vertical"
    ? [0, Math.sin(angle), Math.cos(angle)]
    : [Math.sin(angle), 0, Math.cos(angle)];
}

function ringPath(
  plane: "vertical" | "horizontal",
  near: boolean,
): string {
  const parts: string[] = [];
  let active = "";
  const steps = 72;
  for (let index = 0; index < steps; index += 1) {
    const from = project(ringPoint(plane, index / steps * Math.PI * 2));
    const to = project(ringPoint(plane, (index + 1) / steps * Math.PI * 2));
    const isNear = (from.depth + to.depth) / 2 >= 0;
    if (isNear === near) {
      if (!active) active = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)}`;
      active += ` L ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
    } else if (active) {
      parts.push(active);
      active = "";
    }
  }
  if (active) parts.push(active);
  return parts.join(" ");
}

/**
 * СИЛУЭТ МАШИНЫ ВНУТРИ СФЕРЫ. Осями сферы владеет удар: [правый борт, верх,
 * нос], и органы приходят в ТОЙ ЖЕ нормировке корпуса (`carrierHullPoint`),
 * поэтому силуэт, метки двигателей и вектор удара совпадают по построению —
 * удар в правое переднее кольцо рисуется ровно на правом переднем кольце.
 *
 * Контур — по типу машины: винтокрылая — плоский корпус со стрелой к носу,
 * плавучая — веретено. Двигатели — живые метки: заливка дышит фактической
 * тягой, цвет — живучестью (норма/деградация/выбит), реверсивный тоннель
 * показывает знак стрелкой вперёд или назад.
 */
function hullOutline(kind: MotionTelemetryMachine["kind"]): readonly MotionTelemetryVector3[] {
  return kind === "rotorcraft"
    ? [
        [0, -0.08, 0.95],
        [0.34, -0.08, 0.38],
        [0.42, -0.08, -0.3],
        [0.18, -0.08, -0.82],
        [-0.18, -0.08, -0.82],
        [-0.42, -0.08, -0.3],
        [-0.34, -0.08, 0.38],
      ]
    : [
        [0, 0, 1],
        [0.3, 0.16, 0.55],
        [0.38, 0.2, 0],
        [0.3, 0.16, -0.6],
        [0, 0, -0.95],
        [-0.3, -0.16, -0.6],
        [-0.38, -0.2, 0],
        [-0.3, -0.16, 0.55],
      ];
}

function outlinePath(points: readonly MotionTelemetryVector3[]): string {
  return (
    points
      .map((point, index) => {
        const projected = project(point);
        return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}

function engineStateClass(health: number): string {
  return health <= 0.05
    ? " is-dead"
    : health < 1 - 1e-6
      ? " is-degraded"
      : "";
}

function MachineSilhouette({
  machine,
}: {
  readonly machine: MotionTelemetryMachine;
}): ReactElement {
  return (
    <g className="motion-impact-machine" aria-hidden="true">
      <path
        className="motion-impact-hull"
        d={outlinePath(hullOutline(machine.kind))}
      />
      {machine.engines.map((engine, index) => {
        const projected = project(engine.point);
        return (
          <circle
            key={`engine:${index}`}
            className={`motion-impact-engine${engineStateClass(engine.health)}${projected.depth < 0 ? " is-far" : ""}`}
            cx={projected.x}
            cy={projected.y}
            r={2.6}
            style={{ fillOpacity: 0.18 + 0.72 * Math.min(1, Math.abs(engine.output)) }}
          />
        );
      })}
      {(machine.auxiliary ?? []).map((engine, index) => {
        const projected = project(engine.point);
        // Реверсивный движитель: стрелка по знаку фактической тяги.
        const ahead = project([
          engine.point[0],
          engine.point[1],
          engine.point[2] + (engine.output >= 0 ? 0.16 : -0.16),
        ]);
        const dx = ahead.x - projected.x;
        const dy = ahead.y - projected.y;
        const length = Math.hypot(dx, dy) || 1;
        const tip = 3.4;
        return (
          <path
            key={`aux:${index}`}
            className={`motion-impact-engine is-aux${engineStateClass(engine.health)}${projected.depth < 0 ? " is-far" : ""}`}
            d={`M ${(projected.x + (dx / length) * tip).toFixed(2)} ${(projected.y + (dy / length) * tip).toFixed(2)} L ${(projected.x - (dy / length) * 2.2).toFixed(2)} ${(projected.y + (dx / length) * 2.2).toFixed(2)} L ${(projected.x + (dy / length) * 2.2).toFixed(2)} ${(projected.y - (dx / length) * 2.2).toFixed(2)} Z`}
            style={{ fillOpacity: 0.2 + 0.7 * Math.min(1, Math.abs(engine.output)) }}
          />
        );
      })}
    </g>
  );
}

const VERTICAL_FAR = ringPath("vertical", false);
const VERTICAL_NEAR = ringPath("vertical", true);
const HORIZONTAL_FAR = ringPath("horizontal", false);
const HORIZONTAL_NEAR = ringPath("horizontal", true);
const NOSE_POINT = project([0, 0, 1]);

function magnitude(value: MotionTelemetryVector3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalized(value: MotionTelemetryVector3): MotionTelemetryVector3 {
  const length = magnitude(value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function formatValue(value: number, locale: string, unit: string): string {
  const precision = value < 0.1 ? 2 : value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)} ${unit}`;
}

export function MotionImpactIndicator({
  machine,
  impact,
  locale,
  ariaLabel,
  kickLabel,
  rotationLabel,
}: {
  readonly machine?: MotionTelemetryMachine;
  readonly impact: MotionTelemetryImpact | undefined;
  readonly locale: string;
  readonly ariaLabel: string;
  readonly kickLabel: string;
  readonly rotationLabel: string;
}): ReactElement {
  const kick = impact ? magnitude(impact.deltaVelocityBody) : 0;
  const rotation = impact
    ? magnitude(impact.deltaAngularVelocityBody) * 180 / Math.PI
    : 0;
  const markerId = `motion-impact-arrow-${impact?.sequence ?? "idle"}`;
  const origin = impact ? project(impact.pointOnHull) : null;
  const direction = impact ? normalized(impact.impulseBody) : null;
  const arrowLength = 0.24 + 0.52 * (1 - Math.exp(-kick / 0.16));
  const target = impact && direction
    ? project([
        impact.pointOnHull[0] + direction[0] * arrowLength,
        impact.pointOnHull[1] + direction[1] * arrowLength,
        impact.pointOnHull[2] + direction[2] * arrowLength,
      ])
    : null;
  const strength = impact
    ? 1 - Math.exp(-impact.impulseMagnitude / 28)
    : 0;

  return (
    <section className="motion-telemetry-impact" aria-label={ariaLabel}>
      <div className="motion-impact-sphere" aria-hidden="true">
        <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}>
          <circle
            className="motion-impact-sphere-boundary"
            cx={VIEW_CENTRE}
            cy={VIEW_CENTRE}
            r={SPHERE_RADIUS}
          />
          <g className="motion-impact-ring-set">
            <path className="motion-impact-ring is-far" d={VERTICAL_FAR} />
            <path className="motion-impact-ring is-near" d={VERTICAL_NEAR} />
          </g>
          <g className="motion-impact-ring-set">
            <path className="motion-impact-ring is-far" d={HORIZONTAL_FAR} />
            <path className="motion-impact-ring is-near" d={HORIZONTAL_NEAR} />
          </g>
          {machine ? <MachineSilhouette machine={machine} /> : null}
          <path
            className="motion-impact-nose"
            d={`M ${NOSE_POINT.x.toFixed(2)} ${(NOSE_POINT.y - 4).toFixed(2)} l 3 6 h -6 z`}
          />
          {impact && origin && target ? (
            <g
              key={impact.sequence}
              className="motion-impact-transient"
              style={{
                "--impact-glow": `${1 + strength * 4}px`,
                "--impact-width": `${1.2 + strength * 1.1}px`,
              } as CSSProperties}
            >
              <defs>
                <marker
                  id={markerId}
                  markerWidth="7"
                  markerHeight="7"
                  refX="5.5"
                  refY="3.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 7 3.5 L 0 7 z" />
                </marker>
              </defs>
              <line
                className="motion-impact-vector"
                x1={origin.x}
                y1={origin.y}
                x2={target.x}
                y2={target.y}
                markerEnd={`url(#${markerId})`}
              />
              <circle
                className={`motion-impact-point${origin.depth < 0 ? " is-far" : ""}`}
                cx={origin.x}
                cy={origin.y}
                r="3.1"
              />
            </g>
          ) : null}
        </svg>
      </div>
      <dl className="motion-impact-values">
        <div>
          <dt>{kickLabel}</dt>
          <dd>
            <span
              key={`kick:${impact?.sequence ?? "idle"}`}
              className={`motion-impact-reading${impact ? " is-active" : ""}`}
            >
              {impact ? formatValue(kick, locale, "m/s") : "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt>{rotationLabel}</dt>
          <dd>
            <span
              key={`rotation:${impact?.sequence ?? "idle"}`}
              className={`motion-impact-reading${impact ? " is-active" : ""}`}
            >
              {impact ? formatValue(rotation, locale, "°/s") : "—"}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
