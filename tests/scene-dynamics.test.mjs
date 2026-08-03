import assert from "node:assert/strict";
import test from "node:test";
import {
  analogClockHandState,
  clockTimeFraction,
  digitalClockText,
  updateMutableSceneObjects,
} from "../games/make-a-mess/src/game/sceneDynamics.ts";
import {
  TIME_OF_DAY_TARGETS,
  gameClockText,
  nextTimeOfDay,
} from "../games/make-a-mess/src/game/timeOfDay.ts";

const piece = (id, position = [0, 0.5, 0]) => ({
  id,
  clusterId: "fixture",
  material: "steel",
  shape: "steelSheet",
  position,
  size: [0.05, 1, 0.04],
  color: "#222222",
});

test("the eight authored phases form one continuous solar day", () => {
  assert.deepEqual(
    [
      "dawn",
      "morning",
      "day",
      "afternoon",
      "sunset",
      "evening",
      "night",
      "predawn",
    ].map(nextTimeOfDay),
    [
      "morning",
      "day",
      "afternoon",
      "sunset",
      "evening",
      "night",
      "predawn",
      "dawn",
    ],
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TIME_OF_DAY_TARGETS).map(([phase, solarTime]) => [
        phase,
        gameClockText(solarTime),
      ]),
    ),
    {
      dawn: "07:00",
      morning: "09:00",
      day: "12:00",
      afternoon: "15:00",
      sunset: "18:00",
      evening: "21:00",
      night: "00:00",
      predawn: "03:00",
    },
  );
});

test("analogue hands read the same continuous time as the sky", () => {
  const hand = piece("hour");
  const noon = analogClockHandState(
    hand,
    [0, 0, 0],
    clockTimeFraction({ kind: "game" }, TIME_OF_DAY_TARGETS.day, 0) * 2,
  );
  assert.ok(Math.abs(noon.position[0]) < 1e-12);
  assert.ok(Math.abs(noon.position[1] - 0.5) < 1e-12);

  const sixPm = analogClockHandState(
    hand,
    [0, 0, 0],
    clockTimeFraction({ kind: "game" }, TIME_OF_DAY_TARGETS.sunset, 0) * 2,
  );
  assert.ok(Math.abs(sixPm.position[0]) < 1e-12);
  assert.ok(Math.abs(sixPm.position[1] + 0.5) < 1e-12);
  assert.ok(Math.abs(Math.abs(sixPm.rotation[2]) - Math.PI) < 1e-12);
});

test("real and game clock sources support independent offsets", () => {
  const noonUtc = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(clockTimeFraction({ kind: "real", utcOffsetMinutes: 0 }, 0, noonUtc), 0.5);
  assert.equal(clockTimeFraction({ kind: "real", utcOffsetMinutes: 360 }, 0, noonUtc), 0.75);
  assert.ok(
    Math.abs(clockTimeFraction({ kind: "game", offsetMinutes: 60 }, 0.25, 0) - 13 / 24) < 1e-12,
  );
});

test("piece-built digital clocks select characters without duplicating geometry", () => {
  assert.equal(digitalClockText(0.5), "12:00");
  assert.equal(digitalClockText(0.75, "HHMM"), "1800");

  const sharedSegment = piece("segment:a");
  const onlyOne = piece("segment:b");
  const target = new Map();
  updateMutableSceneObjects({
    definitions: [
      {
        kind: "digitalClock",
        id: "clock:digital",
        format: "HHMM",
        timeSource: { kind: "game" },
        slots: [
          { characters: { "0": [sharedSegment.id], "1": [sharedSegment.id, onlyOne.id] } },
        ],
      },
    ],
    pieceById: new Map([[sharedSegment.id, sharedSegment], [onlyOne.id, onlyOne]]),
    worldTime: 0.25,
    realTimeMs: 0,
    resolveEventState: () => "docked",
    target,
  });
  assert.equal(target.get(sharedSegment.id).visible, true);
  assert.equal(target.get(onlyOne.id).visible, true);
});

test("display layers react to reusable compound-object lifecycle events", () => {
  const glyph = piece("board:glyph");
  const states = new Map();
  let eventState = "docked";
  const context = {
    definitions: [
      {
        kind: "display",
        id: "board",
        layers: [
          {
            id: "departures",
            pieceIds: [glyph.id],
            condition: {
              kind: "clusterEvent",
              sourceClusterId: "airship",
              states: ["docked"],
            },
          },
        ],
      },
    ],
    pieceById: new Map([[glyph.id, glyph]]),
    worldTime: 0.25,
    realTimeMs: 0,
    resolveEventState: () => eventState,
    target: states,
  };

  updateMutableSceneObjects(context);
  assert.equal(states.get(glyph.id).visible, true);
  eventState = "cruise";
  updateMutableSceneObjects(context);
  assert.equal(states.get(glyph.id).visible, false);
});

test("a lamp matrix cross-fades captions over one reusable cell set", () => {
  const first = piece("board:cell:first");
  const shared = piece("board:cell:shared");
  const second = piece("board:cell:second");
  let eventState = "docked";
  const target = new Map();
  const context = {
    definitions: [{
      kind: "matrixDisplay",
      id: "board:matrix",
      cellPieceIds: [first.id, shared.id, second.id],
      transition: { fadeInSeconds: 0.5, fadeOutSeconds: 0.5 },
      frames: [
        {
          id: "scheduled",
          activePieceIds: [first.id, shared.id],
          condition: { kind: "clusterEvent", sourceClusterId: "airship", states: ["docked"] },
        },
        {
          id: "attention",
          activePieceIds: [shared.id, second.id],
          condition: { kind: "clusterEvent", sourceClusterId: "airship", states: ["attention"] },
        },
      ],
    }],
    pieceById: new Map([
      [first.id, first],
      [shared.id, shared],
      [second.id, second],
    ]),
    worldTime: 0.25,
    realTimeMs: 0,
    resolveEventState: () => eventState,
    target,
  };

  updateMutableSceneObjects(context);
  assert.equal(target.get(first.id).visible, true);
  assert.equal(target.get(shared.id).visible, true);
  assert.equal(target.get(second.id).visible, false);

  eventState = "attention";
  updateMutableSceneObjects({ ...context, deltaSeconds: 0.1 });
  assert.equal(target.get(first.id).level > 0 && target.get(first.id).level < 1, true);
  assert.equal(target.get(second.id).level > 0 && target.get(second.id).level < 1, true);
  assert.equal(target.get(shared.id).visible, true);
  assert.equal(target.get(shared.id).level, undefined);
});
