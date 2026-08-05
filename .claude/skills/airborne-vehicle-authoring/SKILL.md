---
name: airborne-vehicle-authoring
description: Build, revise, diagnose, or audit physically honest flying vehicles in Make a Mess, including compound carrier assembly, mass and balance, lift, breakable actuators, route artifacts, shared autopilot integration, docking, go-arounds, failure recovery, passenger inertia, world envelopes, telemetry, and acceptance tests. Use for any task involving an airship, sky train, flying longship, future airborne carrier, its flight route, onboard passenger behavior, or common airborne-vehicle dynamics.
---

# Airborne Vehicle Authoring

Use the shared carrier physics instead of creating vehicle-specific movement.
Treat routes as requirements, controls as requests, attached actuators as the
only source of delivered authority, and docking as a measured physical result.

## Load the contract

Before changing code, read these documents completely and in this order:

1. [`games/make-a-mess/docs/physical-architecture-guide.md`](../../../games/make-a-mess/docs/physical-architecture-guide.md)
   for the common form, construction, causal-detail, diagnosis and acceptance
   standard;
2. [`games/make-a-mess/docs/airborne-vehicle-dynamics.md`](../../../games/make-a-mess/docs/airborne-vehicle-dynamics.md)
   for the normative physical contract.

The dynamics contract is the semantic source of truth. Do not ask the user to
provide engineering coordinates or finish the design: inspect adjacent worlds,
extract measurable invariants and author the complete proposal autonomously.

Before changing a route, autopilot, or docking behavior, inspect exact current
route nodes/handles, altitude, speed, direction, markers, berth pose,
mooring/capture points, mass, lift, drag, actuator points, tolerances, failure
timers and world envelopes. Use the live browser only after the source contract
and independent physical profile do not explain the symptom.

The full contract remains at
[`games/make-a-mess/docs/airborne-vehicle-dynamics.md`](../../../games/make-a-mess/docs/airborne-vehicle-dynamics.md)
and must remain synchronized with semantic changes.

Read these only when relevant:

- Reference-faithful exterior/interior form, glazing, mounted fixtures,
  architectural lighting, berths and passenger places:
  `.claude/skills/architectural-scene-authoring/SKILL.md` and
  `games/make-a-mess/docs/architectural-authoring.md`.
- Visual construction and structural solver:
  `games/make-a-mess/docs/transport-lessons.md`.
- Inter-island CJM, hub topology, and transformation:
  `games/make-a-mess/docs/inter-island-travel.md`.
- General island authoring:
  `.claude/skills/world-building/SKILL.md`.

Inspect the relevant current definitions and tests after reading the contract.
Do not trust remembered constants.

## Classify the work

Choose the smallest correct owner before editing:

- Put geometry and contacts in `VehicleFrameDefinition`.
- Put machine capabilities, interactions, route selection, and tolerances in
  `AirVehicleDefinition`.
- Put path geometry, altitude, speed, and markers in a route artifact.
- Put generic guidance laws in the shared autopilot only when both reference
  machines need the rule.
- Put actual authority in breakable actuator tags.
- Put shaft allocation in the shared autopilot; put request/delivery feedback
  sensing in propulsion automation; put passenger/uncrewed clearance and
  degraded route limits in the flight supervisor.
- Put collision prediction in safety automation as an advisory; only the
  autopilot or a selected manual-assist mode may turn it into controls.
- Put standing-person behavior in moving-support dynamics.
- Put UI naming in interaction cues and game-action hints.
- Put physical/user/sky/camera extents in the scene world definition.

Do not branch the common controller by vehicle id to solve a route-authoring or
capability problem.

Do not stack control logic on top of physically logical behavior. A sternway
departure can move the carrier centre toward the future circuit while the bow
yaws in the opposite direction. If route requirements, requested controls,
delivered authority and resulting motion agree, report that the behavior is
correct instead of adding a route-specific lookahead or yaw correction.

## Work in verifiable milestones

For a substantial new carrier, complete and report each milestone before the
next large implementation block unless the user explicitly requests end-to-end
delivery.

### 1. Audit

- Read repository instructions.
- Inspect the dirty tree and preserve unrelated work.
- Locate the scene cluster, frame, vehicle definition, routes, tests, and world
  envelopes with `rg`.
- Determine whether the task changes construction, capabilities, routes,
  passenger behavior, or the shared controller.
- Record current mass, centre of mass, lift offset, actuator inventory, route
  length, maximum route radius, and existing test baseline.

### 2. Establish the physical carrier

- Prove large masses, side/front/top silhouette and both three-quarter views
  before fittings. Build curved armor from a shared profile/surface; derive
  panel bases, overlap, roof offsets and mechanism clearance from it rather
  than placing nose or tail plates by eye.
- Keep ship and berth in separate clusters.
- Compile one compound body from attached pieces.
- Declare articulated members so they have one pose owner.
- When the task changes visible form, record protected livery/physics and prove
  primary silhouette, control lines, openings and mounting nodes against matched
  reference views before adding fittings.
- Verify resting geometry, collider membership, contact against both intact
  structures and detached debris, initial stability, and heart collapse before
  route work.
- Recheck spawn capsule, boarding path, gondola doors and ramps after each
  major hull edit.

### 3. Prove mass and balance

- Compute mass properties from authored pieces and material densities.
- Align intact horizontal centre of mass with the lift heart.
- Keep the lift heart above the centre of mass.
- Verify lift reserve and asymmetric damage response.
- Never move trim centre to hide a damaged balance.

### 4. Connect real controls

- Place engine and rudder forces at visible mechanisms.
- Tag every new actuator contribution.
- Tag a stator, shaft core, or other indispensable member as the actuator's
  required core so its loss gates the whole channel.
- Resolve requested controls against attached members.
- Make the autopilot learn authority from the previous request/delivery pair;
  never hand it physical blade health as a precomputed command.
- Drive propeller animation from the autopilot's compensated signed shaft
  command and oar animation from delivered bank controls.
- Test partial and complete loss of each required channel.
- Measure the hull envelope at each engine station and place the visible
  mechanism outside it with a deliberate protection/service gap. Tie smoke,
  light and mechanical animation to delivered power, using the established
  particle/rendering pipeline before creating a local substitute.
- For a two-blade propeller, prove `1.0 / 0.5 / 0.0` availability, faster
  remaining-blade rotation in both forward and reverse, uncrewed-only degraded
  dispatch, complete failure after required-core loss, and a physically
  completed degraded docking.

### 5. Author routes as requirements

- Author berth-local nodes, Bézier handles, altitude, speed, optional signed
  travel direction, and phase markers.
- Set `finalFrom` where exact approach following must begin.
- Keep route code ignorant of engine layout and vehicle identity.
- Advance progress from physical projection only.
- Use a negative travel direction for a sternway manoeuvre; never encode it
  as a negative engine command in route data.
- Simulate the intact machine through the whole route and
  `isDockingComplete`.
- Keep a deliberately bad-approach test for go-around behavior.
- Add predictive route replanning only as a generic autopilot capability from
  destination pose and physical limits. Never hide a per-map route repair in
  the controller; every unsuccessful replanned approach counts as a normal
  go-around.

### 6. Integrate journey semantics

- Separate external uncrewed and onboard passenger interactions.
- Store occupancy explicitly; do not infer it from route kind.
- Map route markers into common journey phases.
- Reuse telemetry and failure/recovery.
- Generalize scheduling before adding a second scheduled carrier to one scene;
  the current runtime selects the first carrier with `departure`.

### 7. Prove passenger behavior

- Require the onboard action to be inside the carrier volume.
- Verify full capsule clearance and a walkable boarding path.
- Keep standing passengers physical; use support velocity
  `v + omega × r` and finite traction.
- Test acceleration, braking, yaw, jumping, transfer, and falling.
- Return an out-of-world passenger to the island spawn.
- Use explicit seat constraints only after a user action.

### 8. Size the world

Sample every public route relative to the scene world center. Keep separate:

- `worldRadius` for land;
- `boundaryRadius` for the user;
- `skyRadius` for visible atmosphere;
- `cameraFar` for the opposite view.

Leave margins for the hull and an overboard passenger. Do not enlarge the land
to hide a route-envelope mistake.
Keep the actor safety floor out of vehicle/debris collision masks; loose
objects beyond authored land must fall through the fog and despawn below the
scene envelope.

### 9. Verify

Run, at minimum:

```bash
npm run build
node --test tests/vehicle-frame.test.mjs tests/motion-route.test.mjs tests/vehicle-failure.test.mjs tests/moving-support-dynamics.test.mjs tests/motion-telemetry.test.mjs
```

Add the vehicle-specific test file and any interaction, hint, or seat tests
touched by the change. Make the vehicle-specific test simulate forces through
physical docking; a geometry-only route test is insufficient.

Inspect the live scene when interaction placement, passenger clearance, visual
actuation, world envelopes, or CJM copy changed. Check both the exterior call
site and the onboard call site.

When exterior/interior form or lighting changed, also complete the autonomous
matched-view loop from `geometry-lessons.md`: front, profile, both diagonals,
high view, important joint and night. Do not treat a geometry inventory or a
clean physics simulation as visual acceptance.

For docking, record a predicate matrix at the actual mooring point: position,
height, heading, `linearVelocity + omega × radius`, vertical speed, attitude,
angular speed, time in capture, final-manoeuvre time and recovery state. Do not
loosen a centimetre-scale tolerance until physical capture geometry proves it
wrong. Once docking capture begins, final-manoeuvre and capture-settle timers
must be mutually exclusive.

For impact recovery, prove that bullets and explosions transfer both momentum
and moment to the compound cluster. Attached pieces remain self-members;
detached debris becomes an ordinary obstacle. A large but recoverable upset
must be corrected through surviving controls without consuming an incompatible
failure timer.

Create render-loop resources synchronously before exposing meshes or frame
callbacks that use them. Geometry attributes updated every frame must exist on
the first frame and after HMR, not appear later in a passive effect.

Run the full suite before final delivery when practical. Report unrelated
baseline failures separately; never weaken the new invariant to make them
green.

### Flight-quality instrumentation

Judge an autonomous flight with the offline force rig, not by eye and not by
heading. The accepted metrics, each caught a real defect:

- cross-track and altitude error against the plan (en-route only: vertical
  departure/arrival shelves are their own law and measuring them against the
  route profile is a probe artifact);
- yaw work per circuit and nose reversals (997° for a 360° circuit exposed
  the pursuit churn);
- pitch split by sign and phase: nose-down dive on acceleration, nose-up
  during braking, and the pitch-up swing rate — the visible "rearing" gesture;
- speed at the crossing versus speed on tight arcs (racing-line shape);
- fan commands, delivered output and learned health for auxiliary thrusters.

Identical numbers across a with/without comparison almost always mean the
change is not wired, not that it is neutral.

## Non-negotiable invariants

- Never move a carrier from route progress or elapsed time.
- Never assign orientation from a route tangent.
- Never complete a flight from progress alone.
- Never retain mass, collision, or authority from a detached piece.
- Never rebalance a damaged vehicle by moving its lift point.
- Never animate actuators from raw requested control: propellers follow the
  autopilot shaft command after feedback-based allocation; uncompensated
  mechanisms follow delivered control.
- Never parent a standing passenger to the carrier transform.
- Never use one interaction identity for uncrewed and passenger journeys.
- Never let mooring pull from outside its local capture area.
- Never replace a failed approach with a sideways or teleported docking.
- Never declare `settleInPlace` grounded without sustained physical support
  contact and a stable pose.
- Never implement a second vehicle-specific autopilot without proving the
  shared contract cannot express the requirement.
- Never detach a beam, glow or animated fitting from the visible mechanism and
  carrier pose that physically owns it.
- Never rebuild protected livery or physics to repair a local reference-form
  defect unless the existing topology is proven incapable of the requirement.
- Never change a global door/hinge direction to implement a tail ramp; give the
  ramp its own articulation policy.
- Never hide a visible engine inside the measured hull envelope or drive its
  smoke/light from requested rather than delivered power.
- Never judge an en-route holonomic flight by heading error or slip: the
  trajectory is the requirement, the nose is a preference. Heading matters at
  the approach gate.
- Never author route speed bands from the machine's physics: bands are intent
  ceilings, the governor computes the operating point from the live passport.
- Never keep a derived limit (attitude ceiling, corridor, slip allowance) as a
  standalone constant next to the passport it follows from — derive it.
- Never feed feedforward computed from allowed-vs-allowed profiles: braking
  anticipation is the gap between ACTUAL speed and the allowed speed ahead,
  or a stalled machine deadlocks against its own frozen demand.
- Never author kinked profiles or windows: the curve's second derivative reads
  a linear window's corner as a crest and fights the climb.
- Never sample first and second derivatives of a plan with one base length:
  curvature needs a wide base, slope a fine one.

## Handoff

Report:

- what changed in construction, capabilities, routes, passenger dynamics, or
  world envelopes;
- intact mass and horizontal balance;
- route result, maximum tracking error, go-arounds, and docking result;
- passenger and interaction result;
- build and targeted-test result;
- remaining full-suite failures, clearly separated by relevance.

Link the normative document and the main implementation/test files. Do not
stage or commit unless requested.
