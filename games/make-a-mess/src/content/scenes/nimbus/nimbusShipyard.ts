import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGroundSeatBox,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_BOWL_YAW,
  nimbusGroundUnder,
  nimbusPointOnShipyard,
} from "./nimbusShell.ts";

const STEEL_DARK = "#29343a";
const STEEL_MID = "#45555b";
const STEEL_LIGHT = "#718087";
const SAFETY_ORANGE = "#d66b31";
const CONCRETE = "#858783";
const DECK = "#373e40";
const SHIPYARD_DATUM_POINT = nimbusPointOnShipyard(0, 0);
const SHIPYARD_DATUM = nimbusGroundUnder(
  SHIPYARD_DATUM_POINT[0],
  SHIPYARD_DATUM_POINT[2],
).top;

function yardPoint(
  along: number,
  across: number,
  aboveGround = 0,
): SceneVector3 {
  const horizontal = nimbusPointOnShipyard(along, across);
  return [
    horizontal[0],
    nimbusGroundUnder(horizontal[0], horizontal[2]).top + aboveGround,
    horizontal[2],
  ];
}

function machinePoint(
  along: number,
  across: number,
  vertical: number,
): SceneVector3 {
  const horizontal = nimbusPointOnShipyard(along, across);
  // The assembly bench is deliberately level; all machine nodes use its
  // centre datum instead of inheriting the last few centimetres of drainage.
  return [horizontal[0], SHIPYARD_DATUM + vertical, horizontal[2]];
}

interface FrameStation {
  readonly along: number;
  readonly halfWidth: number;
  readonly height: number;
  readonly enclosed: boolean;
}

const FRAME_STATIONS: readonly FrameStation[] = [
  { along: -54, halfWidth: 2.8, height: 7.2, enclosed: true },
  { along: -48, halfWidth: 6.8, height: 12.5, enclosed: true },
  { along: -40, halfWidth: 12.2, height: 16.2, enclosed: true },
  { along: -28, halfWidth: 15.2, height: 18.3, enclosed: false },
  { along: -12, halfWidth: 15.5, height: 19, enclosed: false },
  { along: 8, halfWidth: 15.2, height: 18.6, enclosed: false },
  { along: 28, halfWidth: 13.4, height: 16.8, enclosed: false },
  { along: 44, halfWidth: 9.5, height: 13.7, enclosed: false },
  { along: 54, halfWidth: 4.5, height: 9.2, enclosed: false },
] as const;

function createWorkingSurface(
  hardscape: NimbusMutableGroup,
  rails: NimbusMutableGroup,
): void {
  for (let along = -66; along <= 66; along += 4.4) {
    for (const across of [-14, 0, 14]) {
      const point = yardPoint(along, across, 0.13);
      nimbusPrimitive(
        rails,
        `rail:${across}:${along}`,
        "steel",
        "steelSheet",
        point,
        [4.4, 0.22, 0.2],
        STEEL_MID,
        { rotation: [0, -NIMBUS_BOWL_YAW, 0], textureProfile: "painted-steel" },
      );
    }
  }

  for (let along = -64; along <= 64; along += 3.2) {
    const point = yardPoint(along, 0, 0.04);
    nimbusPrimitive(
      rails,
      `sleeper:${along}`,
      "concrete",
      "panel",
      point,
      [0.72, 0.18, 31],
      along % 6.4 === 0 ? "#777a77" : "#6d706e",
      { rotation: [0, -NIMBUS_BOWL_YAW, 0], textureProfile: "nimbus-board-formed-concrete" },
    );
  }

  for (const side of [-1, 1]) {
    for (let along = -62; along <= 62; along += 4) {
      const across = side * 27.5;
      const point = yardPoint(along, across, 0.08);
      nimbusPrimitive(
        hardscape,
        `drain:${side}:${along}`,
        "steel",
        "steelSheet",
        point,
        [4, 0.12, 1.4],
        DECK,
        {
          rotation: [0, -NIMBUS_BOWL_YAW, 0],
          textureProfile: "nimbus-technical-deck",
          bearsLoad: false,
        },
      );
      if (Math.abs(along) % 12 === 0) {
        const rim = yardPoint(along, across - side * 1.15, 0.13);
        nimbusPrimitive(
          hardscape,
          `drain-rim:${side}:${along}`,
          "concrete",
          "panel",
          rim,
          [4, 0.25, 0.5],
          "#777a75",
          { rotation: [0, -NIMBUS_BOWL_YAW, 0] },
        );
      }
    }
  }

  // Work pads are local islands, not one slab erasing the basin floor.
  for (let index = 0; index < 18; index += 1) {
    const along = -56 + (index % 9) * 14;
    const across = index < 9 ? -20.5 : 20.5;
    const point = yardPoint(along, across, 0.09);
    nimbusPrimitive(
      hardscape,
      `service-pad:${index}`,
      index % 4 === 0 ? "asphalt" : "concrete",
      "groundTile",
      point,
      [8.2, 0.18, 6.4],
      index % 4 === 0 ? "#454b4c" : "#81837f",
      {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: index % 4 === 0
          ? "nimbus-technical-deck"
          : "nimbus-board-formed-concrete",
      },
    );
  }
}

function createAssemblyStools(
  supports: NimbusMutableGroup,
): void {
  const createStool = (
    id: string,
    along: number,
    across: number,
    capTop: number,
  ): void => {
      const ground = yardPoint(along, across);
      const padTop = SHIPYARD_DATUM + 0.65;
      const padHeight = Math.max(0.35, padTop - ground[1]);
      const padSize: SceneVector3 = [3.2, padHeight, 3.2];
      const padCentre: SceneVector3 = [
        ground[0],
        ground[1] + padHeight / 2,
        ground[2],
      ];
      nimbusPrimitive(
        supports,
        `stool:${id}:pad`,
        "concrete",
        "panel",
        padCentre,
        padSize,
        CONCRETE,
        {
          rotation: [0, -NIMBUS_BOWL_YAW, 0],
          textureProfile: "nimbus-board-formed-concrete",
          contactBoxes: [nimbusGroundSeatBox(padCentre[1], padSize, ground[1])],
        },
      );
      const capHeight = 0.32;
      const postHeight = capTop - capHeight - 0.65;
      const post = machinePoint(along, across, 0.65 + postHeight / 2);
      nimbusPrimitive(
        supports,
        `stool:${id}:post`,
        "steel",
        "steelSheet",
        post,
        [0.72, postHeight, 0.72],
        indexColor(along, across),
        { textureProfile: "painted-steel" },
      );
      const cap = machinePoint(along, across, capTop - capHeight / 2);
      nimbusPrimitive(
        supports,
        `stool:${id}:cap`,
        "steel",
        "steelSheet",
        cap,
        [2.5, capHeight, 1.4],
        STEEL_LIGHT,
        {
          rotation: [0, -NIMBUS_BOWL_YAW, 0],
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
        },
      );
  };

  for (let along = -52; along <= 52; along += 4) {
    createStool(`keel:${along}`, along, 0, 4.8);
  }
  for (const [index, station] of FRAME_STATIONS.entries()) {
    const seatAcross = station.halfWidth * 0.62;
    createStool(`frame:${index}:left`, station.along, -seatAcross, 4.8);
    createStool(`frame:${index}:right`, station.along, seatAcross, 4.8);
  }
}

function indexColor(station: number, across: number): string {
  return (Math.abs(station + across) / 4) % 3 === 0 ? SAFETY_ORANGE : STEEL_DARK;
}

function frameNodes(station: FrameStation): readonly SceneVector3[] {
  const base = 5.25;
  const width = station.halfWidth;
  const height = station.height;
  return [
    machinePoint(station.along, -width * 0.62, base),
    machinePoint(station.along, -width, base + height * 0.28),
    machinePoint(station.along, -width * 0.82, base + height * 0.73),
    machinePoint(station.along, -width * 0.34, base + height),
    machinePoint(station.along, width * 0.34, base + height),
    machinePoint(station.along, width * 0.82, base + height * 0.73),
    machinePoint(station.along, width, base + height * 0.28),
    machinePoint(station.along, width * 0.62, base),
  ];
}

function createAssemblyGantries(
  supports: NimbusMutableGroup,
  frame: NimbusMutableGroup,
): void {
  const stations = [-48, -32, -16, 0, 16, 32, 48] as const;
  const halfSpan = 23.5;
  const top = 28;
  const segmentHeight = 4.5;

  for (const [gantry, along] of stations.entries()) {
    for (const side of [-1, 1]) {
      const across = side * halfSpan;
      const ground = yardPoint(along, across);
      const padTop = SHIPYARD_DATUM + 0.55;
      const padHeight = Math.max(0.35, padTop - ground[1]);
      nimbusPrimitive(
        supports,
        `gantry:${gantry}:side:${side}:pad`,
        "concrete",
        "panel",
        [ground[0], ground[1] + padHeight / 2, ground[2]],
        [3.4, padHeight, 4.2],
        CONCRETE,
        {
          rotation: [0, -NIMBUS_BOWL_YAW, 0],
          textureProfile: "nimbus-board-formed-concrete",
          contactBoxes: [nimbusGroundSeatBox(
            ground[1] + padHeight / 2,
            [3.4, padHeight, 4.2],
            ground[1],
          )],
        },
      );

      let bottom = 0.55;
      let segment = 0;
      while (bottom < top - 0.01) {
        const height = Math.min(segmentHeight, top - bottom);
        nimbusPrimitive(
          supports,
          `gantry:${gantry}:side:${side}:mast:${segment}`,
          "steel",
          "steelSheet",
          machinePoint(along, across, bottom + height / 2),
          [0.8, height, 0.8],
          segment % 3 === 2 ? SAFETY_ORANGE : STEEL_LIGHT,
          {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            carriesAttachments: true,
            bearingArea: 2.2,
          },
        );
        bottom += height;
        segment += 1;
      }
    }

    nimbusRod(
      frame,
      `gantry:${gantry}:head`,
      "steel",
      machinePoint(along, -halfSpan, top),
      machinePoint(along, halfSpan, top),
      0.62,
      gantry % 2 === 0 ? STEEL_LIGHT : STEEL_MID,
      {
        textureProfile: "painted-steel",
        sideAttachmentReach: 0.5,
        attachmentSupportMode: "cable",
      },
    );
    for (const side of [-1, 1]) {
      nimbusRod(
        frame,
        `gantry:${gantry}:brace:${side}`,
        "steel",
        machinePoint(along, side * halfSpan, top - 4.5),
        machinePoint(along, side * 14, top),
        0.36,
        STEEL_MID,
        {
          textureProfile: "painted-steel",
          sideAttachmentReach: 0.42,
          attachmentSupportMode: "cable",
        },
      );
    }
  }

  for (let index = 0; index < stations.length - 1; index += 1) {
    for (const side of [-1, 1]) {
      nimbusRod(
        frame,
        `gantry-longitudinal:${index}:${side}`,
        "steel",
        machinePoint(stations[index], side * halfSpan, top),
        machinePoint(stations[index + 1], side * halfSpan, top),
        0.34,
        STEEL_DARK,
        {
          textureProfile: "painted-steel",
          sideAttachmentReach: 0.42,
          attachmentSupportMode: "cable",
        },
      );
    }
  }
}

function createMachineFrame(
  frame: NimbusMutableGroup,
  shell: NimbusMutableGroup,
): void {
  const stationNodes = FRAME_STATIONS.map(frameNodes);
  for (const [stationIndex, nodes] of stationNodes.entries()) {
    for (let edge = 0; edge < nodes.length; edge += 1) {
      nimbusRod(
        frame,
        `frame:${stationIndex}:edge:${edge}`,
        "steel",
        nodes[edge],
        nodes[(edge + 1) % nodes.length],
        stationIndex < 3 ? 0.62 : 0.5,
        stationIndex < 3 ? STEEL_LIGHT : STEEL_MID,
        {
          textureProfile: "painted-steel",
          sideAttachmentReach: 0.34,
          attachmentSupportMode: "cable",
        },
      );
    }
    const left = nodes[0];
    const right = nodes[7];
    nimbusRod(
      frame,
      `frame:${stationIndex}:floor-tie`,
      "steel",
      left,
      right,
      0.62,
      STEEL_DARK,
      {
        textureProfile: "painted-steel",
        sideAttachmentReach: 0.34,
        attachmentSupportMode: "cable",
      },
    );
  }

  for (let station = 0; station < stationNodes.length - 1; station += 1) {
    for (const nodeIndex of [0, 1, 2, 3, 4, 5, 6, 7]) {
      nimbusRod(
        frame,
        `stringer:${station}:${nodeIndex}`,
        "steel",
        stationNodes[station][nodeIndex],
        stationNodes[station + 1][nodeIndex],
        nodeIndex === 0 || nodeIndex === 7 ? 0.56 : 0.38,
        nodeIndex === 3 || nodeIndex === 4 ? STEEL_LIGHT : STEEL_MID,
        {
          textureProfile: "painted-steel",
          sideAttachmentReach: 0.34,
          attachmentSupportMode: "cable",
        },
      );
    }
  }

  // A straight segmented keel makes the construction state legible even from
  // the rim; every segment lies over a real stool instead of floating between
  // distant frames.
  for (let along = -54; along < 54; along += 4) {
    const centre = machinePoint(along + 2, 0, 5.25);
    nimbusPrimitive(
      frame,
      `keel:${along}`,
      "steel",
      "steelSheet",
      centre,
      [4.08, 0.9, 1.25],
      STEEL_DARK,
      {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
      },
    );
  }

  createClosedNose(shell, stationNodes);
}

function createClosedNose(
  shell: NimbusMutableGroup,
  stationNodes: readonly (readonly SceneVector3[])[],
): void {
  for (let station = 0; station < 2; station += 1) {
    const current = stationNodes[station];
    const next = stationNodes[station + 1];
    for (let side = 0; side < 8; side += 1) {
      const fromA = current[side];
      const toA = next[side];
      const fromB = current[(side + 1) % 8];
      const toB = next[(side + 1) % 8];
      const centre: SceneVector3 = [
        (fromA[0] + toA[0] + fromB[0] + toB[0]) / 4,
        (fromA[1] + toA[1] + fromB[1] + toB[1]) / 4,
        (fromA[2] + toA[2] + fromB[2] + toB[2]) / 4,
      ];
      const longitudinal = Math.hypot(toA[0] - fromA[0], toA[2] - fromA[2]);
      const transverse = Math.hypot(fromB[0] - fromA[0], fromB[1] - fromA[1], fromB[2] - fromA[2]);
      nimbusPrimitive(
        shell,
        `nose:${station}:${side}`,
        side === 2 || side === 3 || side === 4 ? "darkGlass" : "plastic",
        side === 2 || side === 3 || side === 4 ? "glassPane" : "panel",
        centre,
        [Math.max(1.2, longitudinal * 1.08), Math.max(1, transverse * 1.06), 0.2],
        side === 2 || side === 3 || side === 4 ? "#18313b" : "#d9ddd9",
        {
          rotation: [0, -NIMBUS_BOWL_YAW, side < 4 ? 0.2 : -0.2],
          textureProfile: side === 2 || side === 3 || side === 4
            ? undefined
            : "nimbus-ceramic-composite",
          bearsLoad: false,
          sideAttachmentReach: 0.42,
          volume: longitudinal * transverse * 0.06,
        },
      );
    }
  }
}

function createLoosePowerModule(
  hardscape: NimbusMutableGroup,
  supports: NimbusMutableGroup,
): void {
  const along = 16;
  const across = 20.5;
  const ground = yardPoint(along, across);
  for (const side of [-1, 1]) {
    const pad = yardPoint(along + side * 4.2, across, 0.35);
    nimbusPrimitive(
      supports,
      `module-cradle:${side}:pad`,
      "concrete",
      "panel",
      pad,
      [3, 0.7, 4.8],
      CONCRETE,
      { rotation: [0, -NIMBUS_BOWL_YAW, 0], textureProfile: "nimbus-board-formed-concrete" },
    );
    const post = yardPoint(along + side * 4.2, across, 1.55);
    nimbusPrimitive(
      supports,
      `module-cradle:${side}:post`,
      "steel",
      "steelSheet",
      post,
      [0.7, 2.4, 3.8],
      SAFETY_ORANGE,
      { rotation: [0, -NIMBUS_BOWL_YAW, 0], textureProfile: "painted-steel" },
    );
  }
  const body = yardPoint(along, across, 4.45);
  nimbusPrimitive(
    hardscape,
    "loose-power-module:body",
    "steel",
    "steelSheet",
    body,
    [11.5, 3.4, 5.2],
    STEEL_DARK,
    {
      rotation: [0, -NIMBUS_BOWL_YAW, 0],
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      carriesAttachments: true,
    },
  );
  for (let rib = -4; rib <= 4; rib += 2) {
    const point = yardPoint(along + rib, across, 4.45);
    nimbusPrimitive(
      hardscape,
      `loose-power-module:rib:${rib}`,
      "plastic",
      "panel",
      point,
      [0.35, 3.65, 5.45],
      rib === 0 ? SAFETY_ORANGE : "#9ba3a2",
      {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: rib === 0 ? undefined : "nimbus-carbon-laminate",
        bearsLoad: false,
        sideAttachmentReach: 0.42,
      },
    );
  }
  // Keep the imported ground value live in the construction logic; it also
  // documents that this module is supported at its actual local terrain.
  void ground;
}

export function createNimbusShipyard(
  hardscape: NimbusMutableGroup,
  rails: NimbusMutableGroup,
  supports: NimbusMutableGroup,
  frame: NimbusMutableGroup,
  shell: NimbusMutableGroup,
): void {
  createWorkingSurface(hardscape, rails);
  createAssemblyStools(supports);
  createAssemblyGantries(supports, frame);
  createMachineFrame(frame, shell);
  createLoosePowerModule(hardscape, supports);
}
