import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_AUTO_STEP_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
  PLAYER_GRAVITY,
  autoStepLiftSpeed,
  setFlightVelocityTarget,
  stepCarryWindow,
} from "../games/make-a-mess/src/game/playerMovement.ts";
import { passengerControlVelocityDelta } from "../games/make-a-mess/src/game/movingSupportDynamics.ts";

test("small walkable ledges help the player climb out of rubble and craters", () => {
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 1,
      stepHeight: 0.56,
    }) > 0,
    true,
  );
});

test("auto-step never invents a foothold on a wall", () => {
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: false,
      landingNormalY: 0,
      stepHeight: 0.42,
    }),
    0,
  );
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 0.1,
      stepHeight: 0.42,
    }),
    0,
  );
  assert.equal(
    autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 1,
      stepHeight: 0.9,
    }),
    0,
  );
});

test("a step carries the body over the edge, so no run-up is needed", () => {
  // Подъём автошага ВЕРТИКАЛЕН, а кромка держит капсулу на расстоянии: чтобы
  // ступень отпустила, за время подскока надо пройти это расстояние вперёд.
  // Пока переноса не было, скорость приходилось приносить с собой — взойти
  // получалось только с разбега, а с места игрок прыгал на ту же ступень.
  const WALK = 4.25;
  const step = 1 / 60;

  for (const rise of [0.1, 0.18, 0.22, 0.26, 0.3, 0.45, MAX_AUTO_STEP_HEIGHT]) {
    const lift = autoStepLiftSpeed({
      blockedAtFeet: true,
      bodyClear: true,
      landingFound: true,
      landingNormalY: 1,
      stepHeight: rise - 0.02,
    });
    assert.equal(lift > 0, true, `подъём ${rise} не запустил автошаг`);

    // Насколько кромка отталкивает капсулу от подступени.
    const above = Math.max(0, PLAYER_CAPSULE_RADIUS - rise);
    const standoff = Math.sqrt(
      PLAYER_CAPSULE_RADIUS ** 2 - above ** 2,
    );

    // Разгон с нуля в течение окна переноса — то, что теперь есть у шага.
    const window = stepCarryWindow(lift);
    assert.equal(
      Math.abs(window - (2 * lift) / PLAYER_GRAVITY) < 1e-12,
      true,
      "окно переноса обязано совпадать со временем полёта",
    );
    let speed = 0;
    let travelled = 0;
    for (let time = 0; time < window; time += step) {
      travelled += speed * step;
      speed += passengerControlVelocityDelta({
        velocity: { x: 0, y: 0, z: speed },
        supportVelocity: { x: 0, y: 0, z: 0 },
        desiredRelativeVelocity: { x: 0, y: 0, z: WALK },
        supportNormal: { x: 0, y: 1, z: 0 },
        grounded: true,
        delta: step,
      }).z;
    }
    assert.equal(
      travelled > standoff,
      true,
      `подъём ${rise}: перенос ${travelled.toFixed(2)} м не покрывает отстояние ${standoff.toFixed(2)} м`,
    );

    // А без окна ноги в воздухе не работают вовсе — ровно та поломка, из-за
    // которой ступень бралась только с разбега.
    assert.deepEqual(
      passengerControlVelocityDelta({
        velocity: { x: 0, y: lift, z: 0 },
        supportVelocity: { x: 0, y: 0, z: 0 },
        desiredRelativeVelocity: { x: 0, y: 0, z: WALK },
        supportNormal: { x: 0, y: 1, z: 0 },
        grounded: false,
        delta: step,
      }),
      { x: 0, y: 0, z: 0 },
    );
  }
});

test("the carry window is a step, not air control", () => {
  // Окно открывает только состоявшийся автошаг. Нулевой подъём — нулевое
  // окно: сорвавшийся с борта или падающий в яму управления не получает.
  assert.equal(stepCarryWindow(0), 0);
  assert.equal(stepCarryWindow(-1), 0);
  // И оно короткое: не парение, а ровно время подскока.
  assert.equal(stepCarryWindow(3.5) < 0.6, true, String(stepCarryWindow(3.5)));
});

test("flight follows the camera pitch instead of separate height controls", () => {
  const target = { x: 0, y: 0, z: 0 };
  setFlightVelocityTarget(
    target,
    { x: 0, y: 0.8, z: -0.6 },
    { x: 1, y: 0, z: 0 },
    0,
    -1,
    10,
  );

  assert.deepEqual(target, { x: 0, y: 8, z: -6 });

  setFlightVelocityTarget(
    target,
    { x: 0, y: 0.8, z: -0.6 },
    { x: 1, y: 0, z: 0 },
    0,
    1,
    10,
  );

  assert.deepEqual(target, { x: 0, y: -8, z: 6 });
});
