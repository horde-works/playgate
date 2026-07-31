import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  WORLD_SEAL_TIMEOUT_MS,
  announcesPlayerChoice,
  asksForPointerGesture,
  captionAccepts,
  frameSurfaces,
  initialWorldEntryState,
  reduceWorldEntry,
  shutterCaptionMessage,
  transitBannerMessage,
  transitLeg,
} from "../games/make-a-mess/src/game/worldEntryPresentation.ts";

const STAGES = [
  "boot",
  "gate",
  "sealed",
  "revealing",
  "transit",
  "playing",
  "departing",
  "cinematic",
];

function play(events, from = initialWorldEntryState()) {
  return events.reduce(reduceWorldEntry, from);
}

const ARRIVING = {
  kind: "scenarioResolved",
  scenario: "arriving",
  origin: "town",
  destination: "viking-village",
};

test("the walking interface exists in exactly one stage", () => {
  const walking = STAGES.filter((stage) => frameSurfaces(stage).worldHud);
  assert.deepEqual(walking, ["playing"]);
});

test("the launch card never appears inside a world the player is already in", () => {
  // `boot` renders it under the shutter so the served HTML still carries the
  // page's content; `gate` is where it is actually looked at. Nowhere else —
  // offering to launch a world the player is standing in is the incoherence
  // this whole state machine exists to remove.
  const carded = STAGES.filter((stage) => frameSurfaces(stage).gateCard);
  assert.deepEqual(carded, ["boot", "gate"]);
  for (const stage of carded) {
    assert.equal(frameSurfaces(stage).acceptsInput, false);
    assert.equal(frameSurfaces(stage).worldHud, false);
  }
});

test("a sealed arrival shows the shutter and nothing else", () => {
  const surfaces = frameSurfaces("sealed");
  assert.equal(surfaces.shutter, "arrival");
  assert.equal(surfaces.shutterOpening, false);
  for (const [name, value] of Object.entries(surfaces)) {
    if (name === "shutter") continue;
    assert.equal(value, false, `sealed must not expose ${name}`);
  }
});

test("the departure animation is the event, so input dies on its first frame", () => {
  const surfaces = frameSurfaces("departing");
  assert.equal(surfaces.shutter, "departure");
  assert.equal(surfaces.acceptsInput, false);
  assert.equal(surfaces.wantsPointerLock, false);
  assert.equal(surfaces.worldHud, false);
  assert.equal(surfaces.actionHints, false);
});

test("only the revealing stage opens the shutter", () => {
  const opening = STAGES.filter((stage) => frameSurfaces(stage).shutterOpening);
  assert.deepEqual(opening, ["revealing"]);
});

test("nothing shares the bottom of the frame with the crossing caption", () => {
  // The caption holds the slot for as long as a shutter is up, so the running
  // banner may only exist once the shutter is gone. Two lines at the bottom at
  // once is the exact defect this machine was written to make impossible.
  const bannered = STAGES.filter((stage) => frameSurfaces(stage).transitBanner);
  assert.deepEqual(bannered, ["transit"]);
  for (const stage of bannered) {
    assert.equal(frameSurfaces(stage).shutter, "none");
  }
});

test("the frame only asks for the pointer once it has something to show", () => {
  for (const stage of STAGES) {
    const surfaces = frameSurfaces(stage);
    if (surfaces.wantsPointerLock) {
      assert.equal(surfaces.shutter, "none", `${stage} still hides the world`);
      assert.equal(surfaces.acceptsInput, true);
    }
  }
});

test("an ordinary spawn is never asked for the click it just made", () => {
  // The button press IS the gesture. Between it and the browser's answer the
  // frame holds no pointer lock — and that gap used to put a request for a
  // click in the middle of the screen of a player who had just clicked.
  assert.equal(
    asksForPointerGesture("playing", {
      pointerLockHeld: false,
      gestureGiven: true,
      fallbackLook: false,
    }),
    false,
  );
});

test("the frame asks only when nobody made the gesture for it", () => {
  const owed = {
    pointerLockHeld: false,
    gestureGiven: false,
    fallbackLook: false,
  };
  // Placed in the world by an arrival, and after a flyover handed the frame
  // back: both leave the player inside a world nobody clicked into.
  assert.equal(asksForPointerGesture("transit", owed), true);
  assert.equal(asksForPointerGesture("playing", owed), true);

  // A held pointer answers the question, and a refusal answers it too: the
  // frame is looked around by dragging, so asking for a click promises a mode
  // this browser has already declined to give.
  assert.equal(
    asksForPointerGesture("playing", { ...owed, pointerLockHeld: true }),
    false,
  );
  assert.equal(
    asksForPointerGesture("playing", { ...owed, fallbackLook: true }),
    false,
  );
});

test("no stage asks for a pointer it would not use", () => {
  const owed = {
    pointerLockHeld: false,
    gestureGiven: false,
    fallbackLook: false,
  };
  for (const stage of STAGES) {
    assert.equal(
      asksForPointerGesture(stage, owed),
      frameSurfaces(stage).wantsPointerLock,
      `${stage} disagrees with its own surfaces`,
    );
  }
});

test("the pointer lock is read at subscription, not only from its event", () => {
  // `pointerlockchange` reports a CHANGE. A frame rebuilt while the canvas
  // still holds the lock (hot reload) never sees one, so a frame that learns
  // the state from the event alone believes it has no pointer forever: the
  // request to click stays up and every click goes into a hammer swing,
  // because there is nothing left to change.
  const source = readFileSync(
    new URL("../games/make-a-mess/src/game/MakeAMessGame.tsx", import.meta.url),
    "utf8",
  );
  const subscription = source.indexOf(
    'document.addEventListener("pointerlockchange"',
  );
  assert.ok(subscription > 0, "the frame must subscribe to pointer lock");
  const preamble = source.slice(subscription - 900, subscription);
  assert.match(preamble, /\n\s*handlePointerLockChange\(\);/);
});

test("mode captions belong to gameplay alone", () => {
  const announcing = STAGES.filter(
    (stage) => frameSurfaces(stage).modeAnnouncements,
  );
  assert.deepEqual(announcing, ["playing"]);
});

test("the shutter waits for both the built world and the boarded passenger", () => {
  const worldOnly = play([ARRIVING, { kind: "worldReady" }]);
  assert.equal(worldOnly.stage, "sealed");

  const boardedOnly = play([ARRIVING, { kind: "carrierBoarded" }]);
  assert.equal(boardedOnly.stage, "sealed");

  for (const order of [
    [{ kind: "worldReady" }, { kind: "carrierBoarded" }],
    [{ kind: "carrierBoarded" }, { kind: "worldReady" }],
  ]) {
    assert.equal(play([ARRIVING, ...order]).stage, "revealing");
  }
});

test("the welcome does not end the flight — docking does", () => {
  const revealed = play([
    ARRIVING,
    { kind: "worldReady" },
    { kind: "carrierBoarded" },
    { kind: "shutterOpened" },
  ]);
  assert.equal(revealed.stage, "transit");
  assert.equal(frameSurfaces(revealed.stage).transitBanner, true);
  assert.equal(frameSurfaces(revealed.stage).worldHud, false);

  const docked = reduceWorldEntry(revealed, { kind: "flightDocked" });
  assert.equal(docked.stage, "playing");
  assert.equal(frameSurfaces(docked.stage).transitBanner, false);
});

test("a stalled arrival falls back to an ordinary entry, never to a stuck shutter", () => {
  const timedOut = play([ARRIVING, { kind: "sealTimedOut" }]);
  assert.equal(timedOut.stage, "gate");
  assert.equal(timedOut.scenario, "standing");
  assert.equal(timedOut.destination, null);
  // Generous on purpose: the town takes ~10 s to build on a dev server, so the
  // deadline is a safety net rather than a race against honest work.
  assert.ok(WORLD_SEAL_TIMEOUT_MS >= 25_000);
});

test("releasing the pointer pauses gameplay but never interrupts a flight", () => {
  const playing = play([
    { kind: "scenarioResolved", scenario: "standing" },
    { kind: "playerEntered" },
  ]);
  assert.equal(playing.stage, "playing");
  assert.equal(
    reduceWorldEntry(playing, { kind: "controlReleased" }).stage,
    "gate",
  );

  const inTransit = play([
    ARRIVING,
    { kind: "worldReady" },
    { kind: "carrierBoarded" },
    { kind: "shutterOpened" },
  ]);
  const released = reduceWorldEntry(inTransit, { kind: "controlReleased" });
  assert.equal(released.stage, "transit");
  assert.equal(frameSurfaces(released.stage).gateCard, false);
  assert.equal(frameSurfaces(released.stage).wantsPointerLock, true);
});

test("a departure can be requested from any live stage and is terminal", () => {
  const leaving = {
    kind: "departureRequested",
    origin: "viking-village",
    destination: "town",
  };
  for (const stage of ["playing", "transit", "gate"]) {
    const state = { ...initialWorldEntryState(), stage };
    const departing = reduceWorldEntry(state, leaving);
    assert.equal(departing.stage, "departing");
    assert.equal(departing.destination, "town");
    // A second request cannot restart the animation or double-navigate.
    assert.equal(reduceWorldEntry(departing, leaving), departing);
  }
});

test("a flyover returns the frame to the stage it interrupted", () => {
  for (const stage of ["gate", "playing", "transit"]) {
    const state = { ...initialWorldEntryState(), stage };
    const cinematic = reduceWorldEntry(state, { kind: "cinematicStarted" });
    assert.equal(cinematic.stage, "cinematic");
    assert.equal(
      reduceWorldEntry(cinematic, { kind: "cinematicEnded" }).stage,
      stage,
    );
  }
});

test("the scenario is resolved once and cannot be rewritten mid-flight", () => {
  const arriving = play([ARRIVING]);
  assert.equal(arriving.stage, "sealed");
  assert.equal(
    reduceWorldEntry(arriving, { kind: "scenarioResolved", scenario: "standing" })
      .stage,
    "sealed",
  );
});

test("the transit caption outranks every caption the player can trigger", () => {
  assert.equal(captionAccepts(null, "telemetry"), true);
  assert.equal(captionAccepts("telemetry", "player"), true);
  assert.equal(captionAccepts("player", "transit"), true);
  assert.equal(captionAccepts("transit", "player"), false);
  assert.equal(captionAccepts("transit", "telemetry"), false);
  assert.equal(captionAccepts("player", "telemetry"), false);
  // Same rank replaces: a second weapon change must play again.
  assert.equal(captionAccepts("player", "player"), true);
});

test("mode captions only speak for changes the player actually made", () => {
  assert.equal(announcesPlayerChoice("playing", "playing"), true);
  // Entering or leaving a flight rewrites the weapon and the movement frame.
  // Announcing those would name the player as the author of someone else's act.
  assert.equal(announcesPlayerChoice("playing", "transit"), false);
  assert.equal(announcesPlayerChoice("playing", "gate"), false);
  assert.equal(announcesPlayerChoice("transit", "revealing"), false);
});

test("every stage of a crossing knows which leg it belongs to", () => {
  assert.equal(transitLeg("sealed"), "arrival");
  assert.equal(transitLeg("revealing"), "arrival");
  assert.equal(transitLeg("transit"), "arrival");
  assert.equal(transitLeg("departing"), "departure");
  assert.equal(transitLeg("playing"), null);
  assert.equal(transitLeg("gate"), null);
  assert.equal(transitLeg("boot"), null);
});

test("the crossing starts at the mooring, not at the edge of the map", () => {
  const playing = play([
    { kind: "scenarioResolved", scenario: "standing" },
    { kind: "playerEntered" },
  ]);
  const boarded = reduceWorldEntry(playing, {
    kind: "interIslandBoarded",
    origin: "town",
    destination: "viking-village",
  });
  assert.equal(boarded.stage, "transit");
  assert.equal(boarded.destination, "viking-village");
  // The whole point: the walking interface is gone for the entire leg, not
  // only for the last second before the page navigates.
  assert.equal(frameSurfaces(boarded.stage).worldHud, false);
  assert.equal(frameSurfaces(boarded.stage).modeAnnouncements, false);

  // A sightseeing tour is not a crossing, and an arrival is already sealed:
  // neither may hijack the stage.
  for (const stage of ["gate", "sealed", "revealing", "transit", "departing"]) {
    const state = { ...initialWorldEntryState(), stage };
    assert.equal(
      reduceWorldEntry(state, {
        kind: "interIslandBoarded",
        origin: "town",
        destination: "viking-village",
      }).stage,
      stage,
    );
  }
});

test("each half of a crossing names the island in its own words", () => {
  assert.equal(shutterCaptionMessage("departing"), "departingFor");
  assert.equal(shutterCaptionMessage("sealed"), "enteringAirspace");
  assert.equal(shutterCaptionMessage("revealing"), "welcome");
  for (const stage of ["boot", "gate", "transit", "playing", "cinematic"]) {
    assert.equal(shutterCaptionMessage(stage), null);
  }

  // The same stage, read from the two sides of the same journey.
  assert.equal(transitBannerMessage("transit", "standing"), "departingFor");
  assert.equal(transitBannerMessage("transit", "arriving"), "approach");
  for (const stage of ["boot", "gate", "sealed", "revealing", "playing", "departing"]) {
    assert.equal(transitBannerMessage(stage, "arriving"), null);
  }
});

/**
 * The shutter has to survive a frozen main thread: building a world stalls it
 * for 1.3 s (village) to 3.2 s (town). Only opacity and transform are carried
 * by the compositor through that stall — a `filter: blur()` keyframe would
 * freeze exactly when the shutter is the only thing on screen. And a shutter
 * that lets any alpha through shows the half-built world it exists to hide.
 */
test("the shutter is opaque and animates nothing the main thread must compute", () => {
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const blocks = [...css.matchAll(/\.world-shutter[^{]*\{([^}]*)\}/g)].map(
    (match) => match[1],
  );
  assert.ok(blocks.length > 0, "the shutter must own its styles");

  const base = css.match(/\.world-shutter\s*\{([^}]*)\}/)[1];
  // The surface itself must be a solid colour and fully opaque: anything less
  // shows the half-built world the shutter exists to hide.
  assert.match(base, /background:\s*#[0-9a-f]{6}\s*;/i);
  assert.match(base, /opacity:\s*1\s*;/);
  for (const block of blocks) {
    assert.doesNotMatch(block, /(^|[^-])filter\s*:/, "no main-thread filters");
    assert.doesNotMatch(block, /backdrop-filter\s*:/);
  }

  const animations = [...base.matchAll(/animation[^;]*;/g)].map((m) => m[0]);
  assert.equal(animations.length, 0, "the sealed shutter is still");
  const opening = css.match(/\.world-shutter\.is-opening[^{]*\{([^}]*)\}/);
  assert.ok(opening, "opening the shutter must be its own state");
  assert.match(opening[1], /transition:\s*opacity/);
});
