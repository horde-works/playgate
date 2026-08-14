import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  MEDIUM_DRAGON_MORPHOLOGY,
  mediumDragonFlightCanonicalParts,
  mediumDragonGroundCanonicalParts,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonObject.ts";
import {
  MEDIUM_DRAGON_SKELETON,
  mediumDragonBoneForPart,
  mediumDragonMembraneVertexBone,
} from "../games/make-a-mess/src/content/objects/creatures/mediumDragonRigObject.ts";
import { basaltStrongholdDragonProfile } from "../games/make-a-mess/src/content/populations/mediumDragonPopulationProfiles.ts";
import {
  computeMediumDragonAerodynamics,
  mediumDragonPanelCoefficients,
  mediumDragonVisibleWingArea,
  sampleMediumDragonWingState,
} from "../games/make-a-mess/src/game/mediumDragonAerodynamics.ts";
import {
  buildMediumDragonRuntimeGeometry,
  MEDIUM_DRAGON_RUNTIME_BONE_IDS,
} from "../games/make-a-mess/src/game/mediumDragonRuntimeGeometry.ts";
import {
  createMediumDragonContactState,
  createMediumDragonPosePalette,
  mediumDragonSupportWeight,
  writeMediumDragonPose,
} from "../games/make-a-mess/src/game/mediumDragonRuntimePose.ts";
import {
  createMediumDragonRuntime,
  mediumDragonTakeoffPhase,
  sampleMediumDragonPose,
  scoreMediumDragonIntents,
  scoreMediumDragonLandingNodes,
  stepMediumDragon,
} from "../games/make-a-mess/src/game/mediumDragonSim.ts";
import { basaltStrongholdScene } from "../games/make-a-mess/src/game/basaltStrongholdScene.ts";

const GROUND_REFERENCE = "ground-folded";
const BONE_INDEX = new Map(
  MEDIUM_DRAGON_SKELETON.bones.map((bone, index) => [bone.id, index]),
);

function dragonDefinition() {
  const definition = basaltStrongholdScene.inhabitantDefinitions.find(
    (candidate) => candidate.kind === "medium-dragon-territory",
  );
  assert.ok(definition, "Basalt Stronghold has no medium dragon population");
  return definition;
}

function posedMembraneArea(geometry, palette, areaBySide, requestedSide) {
  const position = geometry.getAttribute("position");
  const bone = geometry.getAttribute("aDragonBone");
  const bindPivot = geometry.getAttribute("aDragonBindPivot");
  const membraneSide = geometry.getAttribute("aDragonMembraneSide");
  let area = 0;
  for (let vertex = 0; vertex < position.count; vertex += 3) {
    if (membraneSide.getX(vertex) !== requestedSide) continue;
    const triangle = [0, 1, 2].map((offset) => {
      const index = vertex + offset;
      const scale = requestedSide < 0 ? areaBySide[0] : areaBySide[1];
      const pivot = new Vector3(
        bindPivot.getX(index),
        bindPivot.getY(index),
        bindPivot.getZ(index),
      );
      return new Vector3(position.getX(index), position.getY(index), position.getZ(index))
        .sub(pivot)
        .multiplyScalar(scale)
        .add(pivot)
        .applyMatrix4(palette[bone.getX(index)]);
    });
    area += triangle[1].clone().sub(triangle[0])
      .cross(triangle[2].clone().sub(triangle[0])).length() * 0.5;
  }
  return area;
}

function posedMinimumY(geometry, palette, areaBySide) {
  const position = geometry.getAttribute("position");
  const bone = geometry.getAttribute("aDragonBone");
  const bindPivot = geometry.getAttribute("aDragonBindPivot");
  const membraneSide = geometry.getAttribute("aDragonMembraneSide");
  let minimumY = Number.POSITIVE_INFINITY;
  for (let index = 0; index < position.count; index += 1) {
    const side = membraneSide.getX(index);
    const scale = side < -0.5 ? areaBySide[0] : side > 0.5 ? areaBySide[1] : 1;
    const pivot = new Vector3(bindPivot.getX(index), bindPivot.getY(index), bindPivot.getZ(index));
    const posed = new Vector3(position.getX(index), position.getY(index), position.getZ(index))
      .sub(pivot)
      .multiplyScalar(scale)
      .add(pivot)
      .applyMatrix4(palette[bone.getX(index)]);
    minimumY = Math.min(minimumY, posed.y);
  }
  return minimumY;
}

test("dragon runtime maps the accepted folded body and every membrane vertex to one skeleton", () => {
  const bones = new Set(MEDIUM_DRAGON_SKELETON.bones.map((bone) => bone.id));
  for (const part of mediumDragonGroundCanonicalParts) {
    const bone = mediumDragonBoneForPart(part, GROUND_REFERENCE);
    assert.equal(bones.has(bone), true, `${part.id}: unknown body bone ${bone}`);
    if (part.kind !== "mesh" || part.group !== "wing-membrane") continue;
    for (const [index, vertex] of part.vertices.entries()) {
      const membraneBone = mediumDragonMembraneVertexBone(
        part,
        vertex,
        index,
        GROUND_REFERENCE,
      );
      assert.ok(membraneBone, `${part.id}:${index}: membrane vertex has no segment`);
      assert.equal(bones.has(membraneBone), true, `${part.id}:${index}: unknown ${membraneBone}`);
    }
  }
});

test("Basalt Stronghold owns one dragon profile, roost and destructible landing affordances", () => {
  const definition = dragonDefinition();
  assert.equal(definition.count, 1);
  assert.equal(definition.bodyType, "medium-dragon");
  assert.equal(definition.species, "Draco pterosauroides");
  assert.equal(definition.profile, basaltStrongholdDragonProfile);
  assert.equal(definition.profile.territory.spawnNodeId, "tower-roost");
  assert.equal(definition.profile.phenotype, "basalt-ash-membrane");
  assert.deepEqual(definition.profile.appearance, {
    skin: "#373538",
    skinPlane: "#51494a",
    belly: "#75645a",
    membrane: "#604047",
    claws: "#292a2b",
    eyes: "#d6a53b",
  });
  assert.ok(definition.profile.skills.includes("quadrupedal-vault-launch"));
  assert.ok(definition.profile.skills.includes("glide-soar"));
  const landings = definition.profile.territory.nodes.filter((node) => node.kind === "landing");
  assert.equal(landings.length, 3);
  assert.deepEqual(
    new Set(landings.map((node) => node.siteId)),
    new Set(["dark-tower-crown", "left-gate-tower", "right-gate-tower"]),
  );
  assert.equal(definition.profile.territory.nodes.filter((node) => node.kind === "emergency-landing").length, 2);
  for (const landingNode of landings) {
    assert.ok(
      definition.profile.territory.nodes.some(
        (node) => node.kind === "launch" && node.siteId === landingNode.siteId,
      ),
      `${landingNode.siteId}: landing site has no paired launch`,
    );
    assert.ok(landingNode.watchTarget, `${landingNode.siteId}: lookout has no watch sector`);
    assert.ok(landingNode.behaviour, `${landingNode.siteId}: surface has no behaviour affordances`);
  }
  for (const node of definition.profile.territory.nodes) {
    for (const pieceId of node.supportPieceIds) {
      assert.equal(
        basaltStrongholdScene.breakablePieceById.has(pieceId),
        true,
        `${node.id}: absent support ${pieceId}`,
      );
    }
  }
  for (const node of definition.profile.territory.nodes.filter(
    (candidate) => ["roost", "launch", "landing"].includes(candidate.kind),
  )) {
    const supportTop = Math.max(...node.supportPieceIds.map((pieceId) => {
      const piece = basaltStrongholdScene.breakablePieceById.get(pieceId);
      return piece.position[1] + piece.size[1] / 2;
    }));
    assert.ok(
      Math.abs(node.position[1] - supportTop) < 1e-9,
      `${node.id}: contact datum ${node.position[1]} is not roof top ${supportTop}`,
    );
  }
  const landing = definition.profile.territory.nodes.find(
    (node) => node.id === "tower-landing",
  );
  assert.ok(landing.touchdownFootprint, "tower landing needs its rectangular roof footprint");
  for (const gateLanding of landings.filter((node) => node.siteId.endsWith("gate-tower"))) {
    assert.ok(gateLanding.touchdownFootprint);
    const supports = gateLanding.supportPieceIds.map(
      (pieceId) => basaltStrongholdScene.breakablePieceById.get(pieceId),
    );
    const minX = Math.min(...supports.map((piece) => piece.position[0] - piece.size[0] / 2));
    const maxX = Math.max(...supports.map((piece) => piece.position[0] + piece.size[0] / 2));
    const minZ = Math.min(...supports.map((piece) => piece.position[2] - piece.size[2] / 2));
    const maxZ = Math.max(...supports.map((piece) => piece.position[2] + piece.size[2] / 2));
    const forwardX = Math.sin(gateLanding.heading);
    const forwardZ = Math.cos(gateLanding.heading);
    const rightX = Math.cos(gateLanding.heading);
    const rightZ = -Math.sin(gateLanding.heading);
    for (const along of [
      -gateLanding.touchdownFootprint.rearExtent,
      gateLanding.touchdownFootprint.forwardExtent,
    ]) {
      for (const cross of [
        -gateLanding.touchdownFootprint.halfWidth,
        gateLanding.touchdownFootprint.halfWidth,
      ]) {
        const x = gateLanding.position[0] + forwardX * along + rightX * cross;
        const z = gateLanding.position[2] + forwardZ * along + rightZ * cross;
        assert.ok(
          x >= minX && x <= maxX && z >= minZ && z <= maxZ,
          `${gateLanding.id}: touchdown corner (${x}, ${z}) leaves the physical roof`,
        );
      }
    }
  }

  const crownPieces = [...basaltStrongholdScene.breakablePieceById.values()].filter(
    (piece) => piece.id.startsWith("stronghold:dark-tower:crown:base:"),
  );
  const crownMinX = Math.min(...crownPieces.map((piece) => piece.position[0] - piece.size[0] / 2));
  const crownMaxX = Math.max(...crownPieces.map((piece) => piece.position[0] + piece.size[0] / 2));
  const crownMinZ = Math.min(...crownPieces.map((piece) => piece.position[2] - piece.size[2] / 2));
  const crownMaxZ = Math.max(...crownPieces.map((piece) => piece.position[2] + piece.size[2] / 2));
  const launch = definition.profile.territory.nodes.find((node) => node.id === "tower-launch");
  const launchContacts = [
    [-0.72, 0.87], [0.72, 0.87], [-0.39, -0.45], [0.39, -0.45],
  ].map(([localX, localZ]) => ({
    x: launch.position[0] + Math.cos(launch.heading) * localX + Math.sin(launch.heading) * localZ,
    z: launch.position[2] - Math.sin(launch.heading) * localX + Math.cos(launch.heading) * localZ,
  }));
  assert.ok(launchContacts.every(({ x, z }) =>
    x >= crownMinX && x <= crownMaxX && z >= crownMinZ && z <= crownMaxZ
  ), "launch contacts must stand on the upper crown rather than intersect its lower edge");

  const touchdownHindZ = landing.position[2]
    - landing.touchdownFootprint.rearExtent
    - 0.45;
  assert.ok(touchdownHindZ >= crownMinZ, "earliest hind-foot touchdown must remain on crown stone");
  assert.ok(
    landing.touchdownFootprint.halfWidth + 0.39 <= Math.min(-crownMinX, crownMaxX),
    "touchdown cross-track envelope must keep both hind feet on crown stone",
  );
});

test("runtime geometry is one canonical draw body with bounded ownership and full flight span", () => {
  const geometry = buildMediumDragonRuntimeGeometry(dragonDefinition());
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const bone = geometry.getAttribute("aDragonBone");
  const runtimeParts = [
    ...mediumDragonGroundCanonicalParts.filter((part) => part.group !== "wing-membrane"),
    ...mediumDragonFlightCanonicalParts.filter((part) => part.group === "wing-membrane"),
  ];
  const expectedVertices = runtimeParts.reduce((sum, part) => {
    if (part.kind === "box" || part.kind === "beam") return sum + 36;
    if (part.kind === "cylinder") throw new Error("unexpected canonical dragon cylinder");
    return sum + part.triangles.length * 3;
  }, 0);
  assert.equal(position.count, expectedVertices);
  assert.equal(normal.count, expectedVertices);
  assert.equal(color.count, expectedVertices);
  assert.equal(bone.count, expectedVertices);
  assert.equal(geometry.getAttribute("aDragonBindPivot").count, expectedVertices);
  assert.equal(geometry.getAttribute("aDragonMembraneSide").count, expectedVertices);
  assert.ok(Array.from(bone.array).every(
    (value) => Number.isInteger(value) && value >= 0 && value < MEDIUM_DRAGON_RUNTIME_BONE_IDS.length,
  ));
  const membraneSide = geometry.getAttribute("aDragonMembraneSide");
  const membraneBones = new Set(Array.from(bone.array).filter(
    (_, index) => Math.abs(membraneSide.getX(index)) > 0.5,
  ).map((index) => MEDIUM_DRAGON_RUNTIME_BONE_IDS[index]));
  for (const side of ["left", "right"]) {
    for (const control of [
      "shoulder", "elbow", "wrist", "metacarpal",
      "finger-1", "finger-2", "finger-3", "finger-4",
    ]) {
      assert.ok(membraneBones.has(`${side}-${control}`), `${side}-${control}: membrane has no segment owner`);
    }
  }
  assert.ok(Number.isFinite(geometry.boundingBox.min.y));

  const foldedRuntime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  const foldedPalette = createMediumDragonPosePalette();
  const foldedContacts = createMediumDragonContactState();
  for (let tick = 0; tick < 120; tick += 1) {
    writeMediumDragonPose(
      foldedPalette,
      sampleMediumDragonPose(foldedRuntime),
      foldedRuntime,
      tick / 60,
      foldedContacts,
    );
  }
  assert.ok(
    posedMinimumY(
      geometry,
      foldedPalette,
      mediumDragonVisibleWingArea(foldedRuntime.lastWing),
    ) >= -0.012,
    "folded full-topology membrane entered the support plane",
  );

  const posedArea = (wing) => {
    const areaRuntime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
    areaRuntime.mode = "patrol-flap";
    areaRuntime.grounded = false;
    areaRuntime.lastWing = wing;
    const areaPalette = createMediumDragonPosePalette();
    const areaContacts = createMediumDragonContactState();
    for (let tick = 0; tick < 120; tick += 1) {
      writeMediumDragonPose(
        areaPalette,
        sampleMediumDragonPose(areaRuntime),
        areaRuntime,
        tick / 60,
        areaContacts,
      );
    }
    const visibleArea = mediumDragonVisibleWingArea(wing);
    return posedMembraneArea(geometry, areaPalette, visibleArea, -1)
      + posedMembraneArea(geometry, areaPalette, visibleArea, 1);
  };
  const downstrokeArea = posedArea(sampleMediumDragonWingState({
    mode: "flap", phase: 0.3, powerFraction: 0.9,
  }));
  const fullPowerArea = posedArea(sampleMediumDragonWingState({
    mode: "flap", phase: 0.515, powerFraction: 0.9,
  }));
  const recoveryArea = posedArea(sampleMediumDragonWingState({
    mode: "flap", phase: 0.72, powerFraction: 0.9,
  }));
  const authoredFlightArea = mediumDragonFlightCanonicalParts.reduce((sum, part) => {
    if (part.group !== "wing-membrane" || part.kind !== "mesh") return sum;
    return sum + part.triangles.reduce((partArea, triangle) => {
      const points = triangle.map((index) => new Vector3(...part.vertices[index]));
      return partArea + points[1].sub(points[0]).cross(points[2].sub(points[0])).length() * 0.5;
    }, 0);
  }, 0);
  assert.ok(downstrokeArea > recoveryArea * 1.35, `${downstrokeArea} vs ${recoveryArea}`);
  assert.ok(fullPowerArea > authoredFlightArea * 0.9, `${fullPowerArea} vs ${authoredFlightArea}`);

  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  const palette = createMediumDragonPosePalette();
  const contacts = createMediumDragonContactState();
  for (let tick = 0; tick < 45 * 60; tick += 1) {
    stepMediumDragon(runtime, basaltStrongholdDragonProfile, 1 / 60);
    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(runtime),
      runtime,
      tick / 60,
      contacts,
    );
  }
  runtime.mode = "patrol-glide";
  runtime.roll = 0;
  runtime.lastWing = sampleMediumDragonWingState({
    mode: "glide",
    phase: 0,
    powerFraction: 0,
  });
  for (let tick = 0; tick < 90; tick += 1) {
    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(runtime),
      runtime,
      45 + tick / 60,
      contacts,
    );
  }
  const vertex = new Vector3();
  let minimumX = Infinity;
  let maximumX = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index).applyMatrix4(palette[bone.getX(index)]);
    minimumX = Math.min(minimumX, vertex.x);
    maximumX = Math.max(maximumX, vertex.x);
  }
  assert.ok(maximumX - minimumX > MEDIUM_DRAGON_MORPHOLOGY.span * 0.94);
  assert.ok(maximumX - minimumX < MEDIUM_DRAGON_MORPHOLOGY.span * 1.02);
  geometry.dispose();
});

test("analytic wing panels distinguish folding, power stroke, recovery, stall and roll trim", () => {
  const folded = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "folded", phase: 0, powerFraction: 0 }),
  });
  const glide = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0 }),
  });
  const downstroke = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 11],
    wing: sampleMediumDragonWingState({ mode: "flap", phase: 0.3, powerFraction: 0.9 }),
  });
  const recovery = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 11],
    wing: sampleMediumDragonWingState({ mode: "flap", phase: 0.75, powerFraction: 0.9 }),
  });
  assert.ok(folded.force[1] < MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81 * 0.01);
  assert.ok(glide.force[1] > MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81);
  assert.ok(downstroke.force[1] > recovery.force[1] * 7);
  assert.ok(downstroke.mechanicalPower > 10_000);
  assert.equal(recovery.mechanicalPower, 0);

  const beforeStall = mediumDragonPanelCoefficients(0.31);
  const deepStall = mediumDragonPanelCoefficients(1.1);
  assert.equal(beforeStall.stalled, false);
  assert.equal(deepStall.stalled, true);
  assert.ok(deepStall.lift < beforeStall.lift * 0.5);
  assert.ok(deepStall.drag > beforeStall.drag * 2);

  const leftTrim = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0, rollControl: -0.7 }),
  });
  const rightTrim = computeMediumDragonAerodynamics({
    velocityBody: [0, 0, 12],
    wing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0, rollControl: 0.7 }),
  });
  assert.ok(leftTrim.moment[2] > 900);
  assert.ok(rightTrim.moment[2] < -900);
});

test("the quadrupedal launch is a leg-driven vault before aerodynamic climb", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  while (runtime.mode !== "takeoff") stepMediumDragon(runtime, profile, 1 / 120);
  const roofY = runtime.y;
  let hindDrive = null;
  let release = null;
  while (runtime.mode === "takeoff") {
    stepMediumDragon(runtime, profile, 1 / 120);
    if (!hindDrive && runtime.modeTime >= 0.8) {
      hindDrive = { y: runtime.y, velocityY: runtime.velocityY, grounded: runtime.grounded };
    }
    if (!release && runtime.modeTime >= 1.06) {
      release = { y: runtime.y, velocityY: runtime.velocityY, grounded: runtime.grounded };
    }
  }
  assert.ok(hindDrive.grounded, "hind drive must still transmit force through the roof");
  assert.ok(hindDrive.y > roofY + 0.35, "legs did not extend the body above the support");
  assert.ok(hindDrive.velocityY > 3.2, "hindlimbs produced no ballistic launch velocity");
  assert.equal(release.grounded, false);
  assert.ok(release.y > roofY + 1.8, "manus vault released before the body cleared the roof");
  assert.ok(release.velocityY > 7, "airborne climb was not inherited from the leg impulse");
});

test("powered wing phases produce a visible physical heave instead of pose-only flapping", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  while (runtime.mode !== "patrol-flap") stepMediumDragon(runtime, profile, 1 / 120);
  let previousVelocityY = runtime.velocityY;
  let downstrokeAcceleration = 0;
  let recoveryAcceleration = 0;
  let downstrokeSamples = 0;
  let recoverySamples = 0;
  let minimumY = runtime.y;
  let maximumY = runtime.y;
  for (let tick = 0; tick < 4 * 120; tick += 1) {
    stepMediumDragon(runtime, profile, 1 / 120);
    const accelerationY = (runtime.velocityY - previousVelocityY) * 120;
    previousVelocityY = runtime.velocityY;
    minimumY = Math.min(minimumY, runtime.y);
    maximumY = Math.max(maximumY, runtime.y);
    if (runtime.lastWing.phase >= 0.08 && runtime.lastWing.phase < 0.52) {
      downstrokeAcceleration += accelerationY;
      downstrokeSamples += 1;
    } else {
      recoveryAcceleration += accelerationY;
      recoverySamples += 1;
    }
  }
  const meanDownstroke = downstrokeAcceleration / downstrokeSamples;
  const meanRecovery = recoveryAcceleration / recoverySamples;
  assert.ok(meanDownstroke > 5, `downstroke acceleration is ${meanDownstroke}`);
  assert.ok(meanRecovery < -3, `recovery acceleration is ${meanRecovery}`);
  assert.ok(maximumY - minimumY > 0.45, "wing beat did not move the body vertically");
});

test("corrective return strokes are visible instead of being hidden by the glide behaviour label", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  runtime.mode = "return";
  runtime.grounded = false;
  runtime.lastWing = sampleMediumDragonWingState({
    mode: "flap",
    phase: 0.3,
    powerFraction: 0.65,
  });
  const correctiveStroke = sampleMediumDragonPose(runtime);
  assert.equal(correctiveStroke.current, "flight-upstroke");
  assert.equal(correctiveStroke.next, "flight-downstroke");
  runtime.lastWing = sampleMediumDragonWingState({
    mode: "glide",
    phase: 0,
    powerFraction: 0,
  });
  assert.equal(sampleMediumDragonPose(runtime).current, "glide");
});

test("banked turns lead with gaze and differential wing load before smooth body yaw", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  Object.assign(runtime, {
    x: 46,
    y: basaltStrongholdDragonProfile.territory.airspace.patrolHeight,
    z: basaltStrongholdDragonProfile.territory.airspace.centre[2],
    velocityX: 13,
    velocityY: 0,
    velocityZ: 0,
    heading: Math.PI / 2,
    mode: "patrol-glide",
    modeTime: 3,
    flightTime: 3,
    grounded: false,
    lastWing: sampleMediumDragonWingState({ mode: "glide", phase: 0, powerFraction: 0 }),
  });
  let previousBankCommand = runtime.bankCommand;
  let previousYawRate = runtime.yawRate;
  let previousHeading = runtime.heading;
  let firstWingAsymmetry = null;
  let firstBodyBank = null;
  let firstTurnLook = null;
  let maximumYawAcceleration = 0;
  for (let tick = 0; tick < 120; tick += 1) {
    stepMediumDragon(runtime, basaltStrongholdDragonProfile, 1 / 60);
    const visibleArea = mediumDragonVisibleWingArea(runtime.lastWing);
    const asymmetry = Math.abs(visibleArea[0] - visibleArea[1]);
    if (firstWingAsymmetry === null && asymmetry > 0.02) firstWingAsymmetry = tick;
    if (firstBodyBank === null && Math.abs(runtime.roll) > 0.05) firstBodyBank = tick;
    if (firstTurnLook === null && Math.abs(runtime.attention.headYaw) > 0.08) firstTurnLook = tick;
    assert.ok(
      Math.abs(runtime.bankCommand - previousBankCommand) <= 0.01001,
      "bank command changed without a wing-loading ramp",
    );
    maximumYawAcceleration = Math.max(
      maximumYawAcceleration,
      Math.abs(runtime.yawRate - previousYawRate) * 60,
    );
    assert.ok(
      Math.abs(Math.atan2(
        Math.sin(runtime.heading - previousHeading),
        Math.cos(runtime.heading - previousHeading),
      )) <= 0.55 / 60 + 1e-9,
      "heading cornered faster than the bounded body yaw",
    );
    previousBankCommand = runtime.bankCommand;
    previousYawRate = runtime.yawRate;
    previousHeading = runtime.heading;
  }
  assert.ok(firstTurnLook < firstBodyBank, "gaze must acquire the turn before body bank");
  assert.ok(firstWingAsymmetry < firstBodyBank, "wing asymmetry must precede body bank");
  assert.ok(Math.sign(runtime.roll) === Math.sign(runtime.bankCommand));
  assert.ok(maximumYawAcceleration < 0.22, `angular acceleration spike ${maximumYawAcceleration}`);
});

test("the deterministic animal completes roost, launch, patrol and rooftop landing without pose discontinuity", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  const palette = createMediumDragonPosePalette();
  const contacts = createMediumDragonContactState();
  const visitedModes = new Set([runtime.mode]);
  const visitedTakeoffPhases = new Set();
  const returnWingModes = new Set();
  let minimumY = runtime.y;
  let minimumReserve = runtime.needs.flightReserve;
  let maximumLoadFactor = 0;
  let touchdownVerticalSpeed = null;
  let touchdownSpeed = null;
  let maximumJointSeparation = 0;
  let previousMode = runtime.mode;

  for (let tick = 0; tick < 180 * 60; tick += 1) {
    const beforeVerticalSpeed = runtime.velocityY;
    stepMediumDragon(runtime, profile, 1 / 60);
    visitedModes.add(runtime.mode);
    const phase = mediumDragonTakeoffPhase(runtime);
    if (phase) visitedTakeoffPhases.add(phase);
    if (runtime.mode === "return") returnWingModes.add(runtime.lastWing.mode);
    minimumY = Math.min(minimumY, runtime.y);
    minimumReserve = Math.min(minimumReserve, runtime.needs.flightReserve);
    maximumLoadFactor = Math.max(
      maximumLoadFactor,
      Math.hypot(...runtime.lastForce) / (MEDIUM_DRAGON_MORPHOLOGY.mass * 9.81),
    );
    if (previousMode === "flare" && runtime.mode === "touchdown") {
      touchdownVerticalSpeed = beforeVerticalSpeed;
      touchdownSpeed = Math.hypot(runtime.velocityX, runtime.velocityY, runtime.velocityZ);
    }
    previousMode = runtime.mode;

    writeMediumDragonPose(
      palette,
      sampleMediumDragonPose(runtime),
      runtime,
      tick / 60,
      contacts,
    );
    for (const matrix of palette) {
      assert.equal(matrix.elements.every(Number.isFinite), true, `non-finite ${runtime.mode} pose`);
    }
    for (const [index, bone] of MEDIUM_DRAGON_SKELETON.bones.entries()) {
      if (!bone.parent) continue;
      const parentIndex = BONE_INDEX.get(bone.parent);
      assert.notEqual(parentIndex, undefined);
      const joint = new Vector3(...bone.rest[GROUND_REFERENCE]);
      const parentPosition = joint.clone().applyMatrix4(palette[parentIndex]);
      const childPosition = joint.applyMatrix4(palette[index]);
      maximumJointSeparation = Math.max(
        maximumJointSeparation,
        parentPosition.distanceTo(childPosition),
      );
    }
    if (
      runtime.firstFlightCompleted
      && runtime.mode === "territorial-display"
      && runtime.modeTime >= 1
    ) {
      break;
    }
  }

  for (const mode of [
    "observe",
    "ground-walk",
    "takeoff",
    "powered-climb",
    "patrol-flap",
    "return",
    "approach",
    "flare",
    "touchdown",
    "wing-unload",
    "ground-recovery",
    "territorial-display",
  ]) {
    assert.equal(visitedModes.has(mode), true, `missing ${mode}`);
  }
  assert.deepEqual(visitedTakeoffPhases, new Set([
    "preload",
    "hind-drive",
    "manus-vault",
    "clearance",
    "unfold",
    "first-downstroke",
  ]));
  assert.deepEqual(returnWingModes, new Set(["glide", "flap"]));
  const lowestSurfaceY = Math.min(...profile.territory.nodes
    .filter((node) => node.kind === "landing")
    .map((node) => node.position[1]));
  assert.ok(minimumY >= lowestSurfaceY - 0.01, `fell through landing datum: ${minimumY}`);
  assert.ok(minimumReserve > 0.64, `exhausted flight reserve: ${minimumReserve}`);
  assert.ok(maximumLoadFactor <= 3.451, `unbounded transient load: ${maximumLoadFactor}`);
  assert.ok(touchdownVerticalSpeed > -2.4, `hard vertical touchdown: ${touchdownVerticalSpeed}`);
  assert.ok(touchdownSpeed < 3.8, `unbounded touchdown speed: ${touchdownSpeed}`);
  assert.ok(maximumJointSeparation < 0.006, `skeleton opened by ${maximumJointSeparation} m`);
  assert.equal(runtime.mode, "territorial-display");
  assert.equal(runtime.currentNodeId, "right-gate-landing");
  const landing = profile.territory.nodes.find((node) => node.id === runtime.currentNodeId);
  assert.ok(landing);
  const forwardX = Math.sin(landing.heading);
  const forwardZ = Math.cos(landing.heading);
  const rightX = Math.cos(landing.heading);
  const rightZ = -Math.sin(landing.heading);
  const relativeX = runtime.x - landing.position[0];
  const relativeZ = runtime.z - landing.position[2];
  const along = relativeX * forwardX + relativeZ * forwardZ;
  const cross = Math.abs(relativeX * rightX + relativeZ * rightZ);
  assert.ok(landing.touchdownFootprint);
  assert.ok(along >= -landing.touchdownFootprint.rearExtent);
  assert.ok(along <= landing.touchdownFootprint.forwardExtent);
  assert.ok(cross <= landing.touchdownFootprint.halfWidth);
});

test("rooftop braking and contact remain bounded across render rates", () => {
  for (const frequency of [30, 60, 120, 240]) {
    const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
    let contact = null;
    let minimumY = runtime.y;
    for (let tick = 0; tick < 360 * frequency && !runtime.firstFlightCompleted; tick += 1) {
      const previousMode = runtime.mode;
      const velocity = [runtime.velocityX, runtime.velocityY, runtime.velocityZ];
      stepMediumDragon(runtime, basaltStrongholdDragonProfile, 1 / frequency);
      minimumY = Math.min(minimumY, runtime.y);
      if (previousMode === "flare" && runtime.mode === "touchdown") {
        contact = {
          speed: Math.hypot(...velocity),
          velocityY: velocity[1],
        };
      }
    }
    assert.equal(runtime.firstFlightCompleted, true, `${frequency} Hz did not land`);
    assert.equal(runtime.currentNodeId, "right-gate-landing");
    assert.ok(contact, `${frequency} Hz missed contact`);
    assert.ok(contact.speed < 3.8, `${frequency} Hz contact speed ${contact.speed}`);
    assert.ok(contact.velocityY > -2.4, `${frequency} Hz vertical speed ${contact.velocityY}`);
    assert.ok(minimumY > 0.02, `${frequency} Hz go-around crossed terrain at ${minimumY}`);
  }
});

test("contact order is four-point preload, manus vault, hind touchdown, then manus recovery", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  runtime.mode = "takeoff";
  runtime.modeTime = 0.4;
  let sample = sampleMediumDragonPose(runtime);
  for (const id of ["left-manus-pad", "right-manus-pad", "left-hind-pad", "right-hind-pad"]) {
    assert.equal(mediumDragonSupportWeight(sample, runtime, id), 1);
  }
  runtime.modeTime = 0.92;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-hind-pad"), 0);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-hind-pad"), 0);

  runtime.mode = "touchdown";
  runtime.modeTime = 0.2;
  runtime.grounded = true;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-hind-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-hind-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 0);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 0);

  runtime.mode = "ground-recovery";
  runtime.modeTime = 1;
  sample = sampleMediumDragonPose(runtime);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "left-manus-pad"), 1);
  assert.equal(mediumDragonSupportWeight(sample, runtime, "right-manus-pad"), 1);
});

test("destroyed dark-tower supports divert the dragon to an intact gate crown", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  const roofSupports = profile.territory.nodes.find(
    (node) => node.id === "tower-roost",
  ).supportPieceIds;
  const removedPieceIds = new Set(roofSupports);
  let minimumY = runtime.y;
  for (let tick = 0; tick < 360 * 60 && runtime.completedFlights < 1; tick += 1) {
    stepMediumDragon(runtime, profile, 1 / 60, { removedPieceIds });
    minimumY = Math.min(minimumY, runtime.y);
  }
  assert.equal(runtime.completedFlights, 1);
  assert.match(runtime.currentNodeId, /gate-landing$/);
  assert.ok(minimumY >= 0.02, `diversion crossed the terrain: ${minimumY}`);
});

test("losing every normal crown forces a real emergency circuit and highland landing", () => {
  const profile = basaltStrongholdDragonProfile;
  const runtime = createMediumDragonRuntime(profile);
  const removedPieceIds = new Set(profile.territory.nodes
    .filter((node) => node.kind === "landing")
    .flatMap((node) => node.supportPieceIds));
  let minimumY = runtime.y;
  for (let tick = 0; tick < 180 * 60 && runtime.completedFlights < 1; tick += 1) {
    stepMediumDragon(runtime, profile, 1 / 60, { removedPieceIds });
    minimumY = Math.min(minimumY, runtime.y);
  }
  assert.equal(runtime.completedFlights, 1);
  assert.ok(runtime.currentNodeId.endsWith("highland"));
  assert.equal(runtime.grounded, true);
  assert.ok(minimumY >= 0.02, `emergency landing crossed the terrain: ${minimumY}`);
});

test("surface affordances and site memory produce a real three-crown territory", () => {
  const profile = basaltStrongholdDragonProfile;
  const scoringRuntime = createMediumDragonRuntime(profile);
  scoringRuntime.siteLastVisitedAt["right-gate-tower"] = scoringRuntime.lifeTime;
  const ranked = scoreMediumDragonLandingNodes(scoringRuntime, profile, new Set());
  assert.equal(ranked[0].node.id, "left-gate-landing");
  assert.match(ranked[0].reason, /novelty 0\.34/);
  assert.match(ranked.find((candidate) => candidate.node.id === "right-gate-landing").reason, /recent penalty 1\.18/);

  const runtime = createMediumDragonRuntime(profile);
  const visitedSites = new Set();
  const postLandingModes = new Set();
  let completedFlights = 0;
  let minimumY = runtime.y;
  for (let tick = 0; tick < 750 * 60 && completedFlights < 3; tick += 1) {
    stepMediumDragon(runtime, profile, 1 / 60);
    minimumY = Math.min(minimumY, runtime.y);
    if (runtime.completedFlights !== completedFlights) {
      completedFlights = runtime.completedFlights;
      const landing = profile.territory.nodes.find((node) => node.id === runtime.currentNodeId);
      visitedSites.add(landing.siteId);
      postLandingModes.add(runtime.mode);
    }
  }
  assert.deepEqual(
    visitedSites,
    new Set(["dark-tower-crown", "left-gate-tower", "right-gate-tower"]),
  );
  assert.ok(postLandingModes.has("territorial-display"));
  assert.ok(postLandingModes.has("body-care"));
  assert.ok(minimumY > 0.02, `territory circuit crossed terrain at ${minimumY}`);
});

test("behaviour decisions expose needs and traits instead of opaque random action labels", () => {
  const runtime = createMediumDragonRuntime(basaltStrongholdDragonProfile);
  const scores = scoreMediumDragonIntents(runtime, basaltStrongholdDragonProfile);
  assert.equal(scores.length, 6);
  assert.equal(new Set(scores.map((score) => score.intent)).size, 6);
  assert.ok(scores.every((score) => Number.isFinite(score.score) && score.reason.length > 12));
  assert.match(scores.find((score) => score.intent === "patrol").reason, /information .* territory .* reserve/);
  assert.match(runtime.intentReason, /roost and launch corridor/);
});
