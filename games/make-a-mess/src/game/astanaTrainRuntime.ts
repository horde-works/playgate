// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import {
  SECTION_LENGTH,
  TRAIN_SECTIONS,
  TRAIN_STATION,
  trainFrameAt,
  trainStopDistance,
} from "../content/scenes/astana/astanaTrain.ts";
import { TRAIN_LENGTH } from "../content/scenes/astana/astanaPlan.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import type { CompoundKinematicClusterDefinition } from "./compoundKinematicCluster.ts";
import { initialTrainState, ringStops, type TrainState } from "./astanaTrainControl.ts";

/** Stable authored cluster id emitted by compileScene for each LRT section. */
export function astanaTrainSectionClusterId(index: number): string {
  return `astana:lrv-001-${index}`;
}

/**
 * The controller tracks the leading nose. Each section body tracks its own
 * centre, so its course changes independently on a curve.
 */
export function astanaTrainSectionCentreDistance(
  noseDistance: number,
  index: number,
): number {
  return noseDistance - (TRAIN_LENGTH - SECTION_LENGTH * (index + 0.5));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const AUTHORED_FRAME = trainFrameAt(trainStopDistance());

function authoredSectionOrigin(index: number): SceneVector3 {
  const along = -TRAIN_LENGTH / 2 + SECTION_LENGTH * (index + 0.5);
  return [
    AUTHORED_FRAME.centre[0] + AUTHORED_FRAME.along[0] * along,
    0,
    AUTHORED_FRAME.centre[1] + AUTHORED_FRAME.along[1] * along,
  ];
}

const TRAIN_CONTACT_MEMBER_MATCHES = [
  ":underframe:",
  ":floor:",
  ":waist:",
  ":cant:",
  ":pillar:",
  ":window:",
  ":door-panel:",
  ":door-glass:",
  ":roof:",
  ":shoulder:",
  ":gangway-floor:",
  ":cab:shell:0:",
  ":cab:shell:4:",
  ":cab:shell:9:",
] as const;

const DEFINITIONS: readonly CompoundKinematicClusterDefinition[] = Array.from(
  { length: TRAIN_SECTIONS },
  (_, index) => ({
    id: `astana-train-section-${index}`,
    clusterId: astanaTrainSectionClusterId(index),
    origin: authoredSectionOrigin(index),
    // The visual body retains every authored detail, while Rapier gets the
    // structural envelope instead of 1,500 decorative contact shapes.
    contactMemberMatches: TRAIN_CONTACT_MEMBER_MATCHES,
  }),
);

export function astanaTrainClusterDefinitions(): readonly CompoundKinematicClusterDefinition[] {
  return DEFINITIONS;
}

export interface AstanaTrainSectionPose {
  readonly clusterId: string;
  readonly position: SceneVector3;
  /** Absolute course of this section along the rail. */
  readonly yaw: number;
  /** Rotation applied to the authored section body. */
  readonly deltaYaw: number;
  readonly rotation: readonly [number, number, number, number];
}

export function astanaTrainSectionPose(
  noseDistance: number,
  index: number,
): AstanaTrainSectionPose {
  const frame = trainFrameAt(
    astanaTrainSectionCentreDistance(noseDistance, index),
  );
  const deltaYaw = wrapAngle(frame.yaw - AUTHORED_FRAME.yaw);
  const half = deltaYaw / 2;
  return {
    clusterId: astanaTrainSectionClusterId(index),
    position: [frame.centre[0], 0, frame.centre[1]],
    yaw: frame.yaw,
    deltaYaw,
    rotation: [0, Math.sin(half), 0, Math.cos(half)],
  };
}

/** Starts at the authored west platform without depending on stop ordering. */
export function initialAstanaTrainState(): TrainState {
  const index = ringStops().findIndex((stop) => stop.station === TRAIN_STATION);
  return initialTrainState(index < 0 ? 0 : index);
}
