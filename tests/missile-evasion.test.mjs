import assert from "node:assert/strict";
import test from "node:test";
import {
  assessMissileThreat,
  missileThreatEvent,
  solveMissileEvasion,
} from "../games/make-a-mess/src/game/missileEvasion.ts";

const ENVELOPE = {
  horizontalAcceleration: 14.5,
  upwardAcceleration: 25,
  downwardAcceleration: 9.81,
};
const POLICY = { horizonSeconds: 2.5, margin: 2.5 };

function body(overrides = {}) {
  return {
    id: "prey",
    centre: [0, 30, 0],
    velocity: [0, 0, 0],
    acceleration: [0, 0, 0],
    collisionRadius: 3,
    ...overrides,
  };
}

function missile(overrides = {}) {
  return {
    id: 1,
    ownerId: "other",
    position: [0, 30, 96],
    velocity: [0, 0, -96],
    blastRadius: 2,
    remainingSeconds: 1.8,
    ...overrides,
  };
}

test("linear interception selects the exact closest-approach event", () => {
  const event = missileThreatEvent(body(), missile(), 2.5);
  assert.equal(event.kind, "closest");
  assert.ok(Math.abs(event.seconds - 1) < 1e-9);
  assert.ok(Math.hypot(...event.relativePosition) < 1e-9);
});

test("the body's current acceleration participates in threat detection", () => {
  const accelerating = body({ acceleration: [10, 0, 0] });
  const crossing = missile({
    id: 8,
    position: [10, 30, 134.4],
  });
  const assessment = assessMissileThreat(
    accelerating,
    crossing,
    ENVELOPE,
    POLICY,
  );
  assert.ok(assessment, "current linear miss hid an accelerated collision");
  assert.ok(Math.abs(assessment.eventSeconds - 1.4) < 0.01);
  assert.ok(assessment.separation < 0.25);
});

test("self-detonation before closest approach remains a threat event", () => {
  const expiring = missile({
    kind: "rocket",
    position: [0, 30, 17.6],
    velocity: [0, 0, -32],
    blastRadius: 9.5,
    remainingSeconds: 0.5,
  });
  const assessment = assessMissileThreat(
    body(),
    expiring,
    ENVELOPE,
    POLICY,
  );
  assert.ok(assessment, "a rocket detonating 1.6 m away was discarded");
  assert.equal(assessment.eventKind, "fuse");
  assert.ok(Math.abs(assessment.eventSeconds - 0.5) < 1e-9);
  assert.ok(Math.abs(assessment.separation - 1.6) < 1e-9);
});

test("a safely expiring missile does not trigger evasion", () => {
  const assessment = assessMissileThreat(
    body(),
    missile({ remainingSeconds: 0.2 }),
    ENVELOPE,
    POLICY,
  );
  assert.equal(assessment, null);
});

test("only the firing body ignores its own missile", () => {
  const own = missile({ ownerId: "prey" });
  assert.equal(assessMissileThreat(body(), own, ENVELOPE, POLICY), null);
  assert.ok(
    assessMissileThreat(
      body(),
      { ...own, ownerId: "player" },
      ENVELOPE,
      POLICY,
    ),
  );
  assert.ok(
    assessMissileThreat(
      body(),
      { ...own, ownerId: "another-copter" },
      ENVELOPE,
      POLICY,
    ),
  );
});

test("an existing miss is increased along its analytic gradient", () => {
  const assessment = assessMissileThreat(
    body(),
    missile({ position: [2, 30, 96] }),
    ENVELOPE,
    POLICY,
  );
  assert.ok(assessment);
  assert.ok(assessment.escapeDirection[0] < -0.999);
  assert.ok(Math.abs(assessment.escapeDirection[1]) < 1e-9);
  assert.ok(Math.abs(assessment.escapeDirection[2]) < 1e-9);
});

test("a central hit chooses a vector perpendicular to relative flight", () => {
  const movingBody = body({ velocity: [0, 0, 20] });
  const shot = missile({
    position: [96, 30, 20],
    velocity: [-96, 0, 0],
  });
  const assessment = assessMissileThreat(
    movingBody,
    shot,
    ENVELOPE,
    POLICY,
  );
  assert.ok(assessment);
  const direction = assessment.escapeDirection;
  const relative = assessment.relativeVelocity;
  assert.ok(
    Math.abs(
      direction[0] * relative[0] +
        direction[1] * relative[1] +
        direction[2] * relative[2],
    ) < 1e-8,
  );
});

test("the active analytic command never brakes the body", () => {
  const movingBody = body({ velocity: [0, 0, 20] });
  const scenarios = [
    missile({ position: [2, 30, 116] }),
    missile({ position: [0, 32, 116] }),
    missile({ position: [-96, 28, 20], velocity: [96, 0, 0] }),
  ];
  for (const threat of scenarios) {
    const solution = solveMissileEvasion({
      body: movingBody,
      threats: [threat],
      envelope: ENVELOPE,
      policy: POLICY,
    });
    assert.ok(solution);
    assert.ok(
      solution.direction[0] * movingBody.velocity[0] +
          solution.direction[1] * movingBody.velocity[1] +
          solution.direction[2] * movingBody.velocity[2] >=
        -1e-8,
      `braking command ${solution.direction.join("/")}`,
    );
  }
});

test("selection is stateless and a new harder launch is considered immediately", () => {
  const first = solveMissileEvasion({
    body: body(),
    threats: [missile({ id: 20, position: [2, 30, 96] })],
    envelope: ENVELOPE,
    policy: POLICY,
  });
  assert.equal(first?.primaryThreatId, 20);

  const second = solveMissileEvasion({
    body: body(),
    threats: [
      missile({ id: 20, position: [2, 30, 96] }),
      missile({
        id: 21,
        position: [0, 30, 57.6],
        velocity: [0, 0, -96],
      }),
    ],
    envelope: ENVELOPE,
    policy: POLICY,
  });
  assert.equal(second?.primaryThreatId, 21);
});
