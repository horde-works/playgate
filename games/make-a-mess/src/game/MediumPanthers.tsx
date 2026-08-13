"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  Group,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
} from "three";
import type { MediumFelineTerritoryPopulationDefinition } from "./creaturePopulation.ts";
import type { CreatureWorldRuntime } from "./creatureWorld.ts";
import {
  createMediumPantherRuntime,
  drawMediumPantherAttention,
  sampleMediumPantherPose,
  stepMediumPanther,
} from "./mediumPantherSim.ts";
import {
  buildMediumPantherRuntimeGeometry,
  MEDIUM_PANTHER_RUNTIME_BONE_IDS,
} from "./mediumPantherRuntimeGeometry.ts";
import {
  createMediumPantherContactState,
  createMediumPantherPosePalette,
  writeMediumPantherPose,
} from "./mediumPantherRuntimePose.ts";
import { buildObstacleField } from "./villagerNavigation.ts";

const POSE_SHADER_DECLARATIONS = /* glsl */ `
  attribute float aPantherBone;
  uniform mat4 uPantherBones[${MEDIUM_PANTHER_RUNTIME_BONE_IDS.length}];

  mat4 pantherBonePose() {
    return uPantherBones[int(aPantherBone)];
  }
`;

function createPantherMaterial(palette: readonly Matrix4[]): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPantherBones = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE_SHADER_DECLARATIONS}`)
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\n  objectNormal = mat3(pantherBonePose()) * objectNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed = (pantherBonePose() * vec4(position, 1.0)).xyz;",
      );
  };
  material.customProgramCacheKey = () => "medium-panther-p4-m2-standard";
  return material;
}

function createPantherDepthMaterial(palette: readonly Matrix4[]): MeshDepthMaterial {
  const material = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPantherBones = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE_SHADER_DECLARATIONS}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed = (pantherBonePose() * vec4(position, 1.0)).xyz;",
      );
  };
  material.customProgramCacheKey = () => "medium-panther-p4-m2-depth";
  return material;
}

function MediumPanther({
  definition,
  world,
  individualIndex,
}: {
  definition: MediumFelineTerritoryPopulationDefinition;
  world: CreatureWorldRuntime;
  individualIndex: number;
}) {
  const root = useRef<Group>(null);
  const runtime = useRef(createMediumPantherRuntime(definition.profile, individualIndex));
  const acousticCursor = useRef(0);
  const presenceCooldown = useRef(0);
  const palette = useMemo(() => createMediumPantherPosePalette(), []);
  const contactState = useRef(createMediumPantherContactState());
  const geometry = useMemo(
    () => buildMediumPantherRuntimeGeometry(definition),
    [definition],
  );
  const material = useMemo(() => createPantherMaterial(palette), [palette]);
  const depthMaterial = useMemo(() => createPantherDepthMaterial(palette), [palette]);
  const obstacleField = useMemo(
    () => world.geometry.pieces.length > 0 ? buildObstacleField(world.geometry.pieces) : null,
    [world.geometry.pieces],
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    depthMaterial.dispose();
  }, [depthMaterial, geometry, material]);

  useEffect(() => {
    if (individualIndex !== 0) return;
    const scope = window as unknown as {
      __mamPanther?: () => Readonly<Record<string, string | number>>;
    };
    const probe = () => {
      const panther = runtime.current;
      return {
        id: definition.id,
        x: Number(panther.x.toFixed(2)),
        z: Number(panther.z.toFixed(2)),
        groundY: Number(panther.groundY.toFixed(2)),
        airHeight: Number(panther.airHeight.toFixed(2)),
        heading: Number(panther.heading.toFixed(3)),
        speed: Number(panther.speed.toFixed(2)),
        mode: panther.mode,
        pose: sampleMediumPantherPose(panther).current,
      };
    };
    scope.__mamPanther = probe;
    const publishToDocument =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).get("mamPantherProbe") === "1";
    const publish = () => {
      if (publishToDocument) {
        document.documentElement.dataset.mamPantherProbe = JSON.stringify(probe());
      }
    };
    const timer = publishToDocument ? window.setInterval(publish, 100) : undefined;
    publish();
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      delete document.documentElement.dataset.mamPantherProbe;
      if (scope.__mamPanther === probe) delete scope.__mamPanther;
    };
  }, [definition.id, individualIndex]);

  useFrame((state, delta) => {
    const panther = runtime.current;
    const read = world.stimuli.acoustic.readAfter(acousticCursor.current);
    acousticCursor.current = read.cursor;
    for (const event of read.events) {
      const distance = Math.max(1, Math.hypot(event.x - panther.x, event.z - panther.z));
      const heardLevel = event.level - 20 * Math.log10(distance);
      if (heardLevel >= 52) {
        drawMediumPantherAttention(panther, event.x, event.z, heardLevel >= 76 ? 3.4 : 2.2);
      }
    }

    presenceCooldown.current = Math.max(0, presenceCooldown.current - delta);
    const presence = world.stimuli.dangerousPresence.current;
    if (
      presence &&
      presenceCooldown.current <= 0 &&
      Math.hypot(presence.x - panther.x, presence.z - panther.z) < 9
    ) {
      drawMediumPantherAttention(panther, presence.x, presence.z, 1.8);
      presenceCooldown.current = 2.5;
    }

    stepMediumPanther(
      panther,
      definition.profile,
      delta,
      obstacleField,
      world.geometry.removedPieceIds.current,
    );
    const pose = sampleMediumPantherPose(panther);
    writeMediumPantherPose(
      palette,
      pose,
      panther,
      state.clock.elapsedTime,
      contactState.current,
      obstacleField,
      world.geometry.removedPieceIds.current,
    );

    if (root.current) {
      root.current.position.set(panther.x, panther.groundY + panther.airHeight, panther.z);
      root.current.rotation.y = panther.heading;
    }
  });

  return (
    <group ref={root}>
      <mesh
        geometry={geometry}
        material={material}
        customDepthMaterial={depthMaterial}
        castShadow
        receiveShadow
      />
    </group>
  );
}

export function MediumPanthers({
  definition,
  world,
}: {
  definition: MediumFelineTerritoryPopulationDefinition;
  world: CreatureWorldRuntime;
}) {
  return Array.from({ length: definition.count }, (_, index) => (
    <MediumPanther
      key={`${definition.id}:${index}`}
      definition={definition}
      world={world}
      individualIndex={index}
    />
  ));
}
