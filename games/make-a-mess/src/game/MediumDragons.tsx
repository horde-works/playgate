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
import type { MediumDragonTerritoryPopulationDefinition } from "./creaturePopulation.ts";
import type { CreatureWorldRuntime } from "./creatureWorld.ts";
import {
  createMediumDragonRuntime,
  drawMediumDragonAttention,
  sampleMediumDragonPose,
  stepMediumDragon,
} from "./mediumDragonSim.ts";
import {
  buildMediumDragonRuntimeGeometry,
  MEDIUM_DRAGON_RUNTIME_BONE_IDS,
} from "./mediumDragonRuntimeGeometry.ts";
import {
  createMediumDragonContactState,
  createMediumDragonPosePalette,
  writeMediumDragonPose,
} from "./mediumDragonRuntimePose.ts";

const POSE_SHADER_DECLARATIONS = /* glsl */ `
  attribute float aDragonBone;
  uniform mat4 uDragonBones[${MEDIUM_DRAGON_RUNTIME_BONE_IDS.length}];

  mat4 dragonBonePose() {
    return uDragonBones[int(aDragonBone)];
  }
`;

function createDragonMaterial(palette: readonly Matrix4[]): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDragonBones = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE_SHADER_DECLARATIONS}`)
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\n  objectNormal = mat3(dragonBonePose()) * objectNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed = (dragonBonePose() * vec4(position, 1.0)).xyz;",
      );
  };
  material.customProgramCacheKey = () => "medium-dragon-p4-m2-standard";
  return material;
}

function createDragonDepthMaterial(palette: readonly Matrix4[]): MeshDepthMaterial {
  const material = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDragonBones = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE_SHADER_DECLARATIONS}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  transformed = (dragonBonePose() * vec4(position, 1.0)).xyz;",
      );
  };
  material.customProgramCacheKey = () => "medium-dragon-p4-m2-depth";
  return material;
}

function MediumDragon({
  definition,
  world,
  individualIndex,
}: {
  definition: MediumDragonTerritoryPopulationDefinition;
  world: CreatureWorldRuntime;
  individualIndex: number;
}) {
  const root = useRef<Group>(null);
  const runtime = useRef(createMediumDragonRuntime(definition.profile, individualIndex));
  const acousticCursor = useRef(0);
  const presenceCooldown = useRef(0);
  const palette = useMemo(() => createMediumDragonPosePalette(), []);
  const contactState = useRef(createMediumDragonContactState());
  const geometry = useMemo(
    () => buildMediumDragonRuntimeGeometry(definition),
    [definition],
  );
  const material = useMemo(() => createDragonMaterial(palette), [palette]);
  const depthMaterial = useMemo(() => createDragonDepthMaterial(palette), [palette]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    depthMaterial.dispose();
  }, [depthMaterial, geometry, material]);

  useEffect(() => {
    if (individualIndex !== 0) return;
    const scope = window as unknown as {
      __mamDragon?: () => Readonly<Record<string, string | number | boolean>>;
    };
    const probe = () => {
      const dragon = runtime.current;
      return {
        id: definition.id,
        x: Number(dragon.x.toFixed(2)),
        y: Number(dragon.y.toFixed(2)),
        z: Number(dragon.z.toFixed(2)),
        heading: Number(dragon.heading.toFixed(3)),
        pitch: Number(dragon.pitch.toFixed(3)),
        roll: Number(dragon.roll.toFixed(3)),
        speed: Number(Math.hypot(
          dragon.velocityX,
          dragon.velocityY,
          dragon.velocityZ,
        ).toFixed(2)),
        reserve: Number(dragon.needs.flightReserve.toFixed(3)),
        mode: dragon.mode,
        pose: sampleMediumDragonPose(dragon).current,
        grounded: dragon.grounded,
      };
    };
    scope.__mamDragon = probe;
    const publishToDocument =
      process.env.NODE_ENV !== "production"
      && new URLSearchParams(window.location.search).get("mamDragonProbe") === "1";
    const publish = () => {
      if (publishToDocument) {
        document.documentElement.dataset.mamDragonProbe = JSON.stringify(probe());
      }
    };
    const timer = publishToDocument ? window.setInterval(publish, 100) : undefined;
    publish();
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      delete document.documentElement.dataset.mamDragonProbe;
      if (scope.__mamDragon === probe) delete scope.__mamDragon;
    };
  }, [definition.id, individualIndex]);

  useFrame((state, delta) => {
    const dragon = runtime.current;
    const read = world.stimuli.acoustic.readAfter(acousticCursor.current);
    acousticCursor.current = read.cursor;
    for (const event of read.events) {
      const distance = Math.max(1, Math.hypot(
        event.x - dragon.x,
        event.y - dragon.y,
        event.z - dragon.z,
      ));
      const heardLevel = event.level - 20 * Math.log10(distance);
      if (heardLevel >= 48) {
        drawMediumDragonAttention(
          dragon,
          event.x,
          event.y,
          event.z,
          heardLevel >= 78 ? 0.95 : 0.58,
        );
      }
    }

    presenceCooldown.current = Math.max(0, presenceCooldown.current - delta);
    const presence = world.stimuli.dangerousPresence.current;
    if (
      presence
      && presenceCooldown.current <= 0
      && Math.hypot(presence.x - dragon.x, presence.z - dragon.z) < 32
    ) {
      drawMediumDragonAttention(
        dragon,
        presence.x,
        presence.y ?? dragon.y,
        presence.z,
        0.72,
      );
      presenceCooldown.current = 1.8;
    }

    stepMediumDragon(dragon, definition.profile, delta, {
      removedPieceIds: world.geometry.removedPieceIds.current,
      dayFraction: world.time.dayFraction.current,
      night: world.time.night.current,
    });
    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(dragon),
      dragon,
      state.clock.elapsedTime,
      contactState.current,
    );

    if (root.current) {
      root.current.position.set(dragon.x, dragon.y, dragon.z);
      root.current.rotation.set(-dragon.pitch, dragon.heading, dragon.roll, "YXZ");
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

export function MediumDragons({
  definition,
  world,
}: {
  definition: MediumDragonTerritoryPopulationDefinition;
  world: CreatureWorldRuntime;
}) {
  return Array.from({ length: definition.count }, (_, index) => (
    <MediumDragon
      key={`${definition.id}:${index}`}
      definition={definition}
      world={world}
      individualIndex={index}
    />
  ));
}
