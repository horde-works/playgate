---
name: vehicle-authoring
description: >-
  Build, revise, diagnose, or audit ALL controlled moving objects in Make a Mess
  — airborne carriers (airship, sky train, flying longship, sky ram), rotorcraft
  (HX-6, RAX-8, SR-6), the ground car (Citroën DS), the GOA4 LRT train, windmills
  and constant-rotation mechanisms — plus every shared control subsystem: cluster
  membership and member articulation, breakable actuators, the
  automation/autopilot boundary (VehicleGuidanceDemand), route artifacts and
  trajectory building, journey stages (LampEventState), mooring/landing and
  go-arounds, failure recovery, retractable landing gear, manual piloting,
  passenger inertia, world envelopes, telemetry and acceptance tests. Triggers:
  кластер, актуатор, автопилот, автомат управления, маршрут, трасса, berth,
  швартовка, посадка, go-around, стадия рейса, шасси, уборка опор, балиса,
  одометрия, TownCarSystem, carDynamics, astanaTrainControl, ConstantRotor,
  motionRoute, rotorcraftDynamics, rotorcraftPilot, vehicleFrames,
  VehicleFrameSystem, vehicleFailure, vehicleActuation, supportStrut,
  clusterMemberArticulation, resetForces, mooringForce, LampEventState,
  VehicleGuidanceDemand.
---

# Vehicle Authoring

Use the shared carrier physics and the shared control contract instead of
creating vehicle-specific movement. Treat routes as requirements, controls as
requests, attached actuators as the only source of delivered authority, and
docking or landing as a measured physical result. The domain covers every
controlled moving object: airborne carriers, rotorcraft, the ground car, the
GOA4 train, and windmill/constant-rotor mechanisms — the boundary is
"controlled motion", not "flight".

## Load the contract

Before changing code, read these documents completely and in this order:

1. [`games/make-a-mess/docs/vehicle-control-lessons.md`](../../games/make-a-mess/docs/vehicle-control-lessons.md)
   — the control contract FIRST: cluster membership and articulation,
   actuators, the automation/autopilot boundary, guidance tolerances and
   corridors, route building, journey stages and subscribers,
   mooring/landing, failure recovery, and the per-machine-type chapters
   (rotorcraft, buoyant, ground car, GOA4 train, rotors, manual pilot).
2. [`games/make-a-mess/docs/airborne-vehicle-dynamics.md`](../../games/make-a-mess/docs/airborne-vehicle-dynamics.md)
   — the carrier flight-physics contract: definition contract, physical
   assembly, Rapier body laws, mass/balance/lift, force model, passenger
   inertia, world envelopes, physics test matrix.
3. [`games/make-a-mess/docs/physical-architecture-guide.md`](../../games/make-a-mess/docs/physical-architecture-guide.md)
   for the quality bar, ownership boundaries and diagnosis discipline.

Read by adjacency:

- Structural assembly and solver pitfalls (contactBoxes, Euler traps,
  floating foundation, verification order, assembly checklist):
  [`references/assembly.md`](references/assembly.md) — the dissolved
  transport-lessons core; read before building or re-seating any machine.
- Two-sided impact law, material verdicts and the debris contract:
  `games/make-a-mess/docs/destruction-lessons.md` — read whenever a vehicle
  hits the world, sheds pieces, or a glass/steel/sheet-metal verdict is in
  question (закон удара, контракт куска, carve по движущемуся телу).
- Frame budgets and adjacent Rapier pitfalls:
  `games/make-a-mess/docs/performance-lessons.md` — read before adding
  per-step physics work, extra bodies, sensors or debris load.
- Reference-faithful exterior/interior form, glazing, mounted fixtures,
  berth architecture: `.claude/skills/architectural-scene-authoring/SKILL.md`
  and `games/make-a-mess/docs/architectural-authoring.md`.
- Canonical object form, kinematic groups, second-state renders:
  `.claude/skills/reference-faithful-object-study/` (its
  references/articulation.md owns FORM of moving parts; runtime articulation
  law lives in vehicle-control-lessons.md).
- Inter-island CJM, hub topology, and transformation:
  `games/make-a-mess/docs/inter-island-travel.md`.
- General island authoring: `.claude/skills/world-building/SKILL.md`.
- World numbers for the train: `games/make-a-mess/docs/astana-brief.md`
  (разделы «B2b — физика состава», «Балисы»); ground-car passport:
  `games/make-a-mess/docs/citroen-ds-brief.md`.

The two contracts are the semantic source of truth and must remain
synchronized with semantic changes. Do not ask the user to provide
engineering coordinates or finish the design: inspect adjacent machines,
extract measurable invariants and author the complete proposal autonomously.

Before changing a route, autopilot, or docking behavior, inspect exact
current route nodes/handles, altitude, speed, direction, markers, berth pose,
mooring/capture points, mass, lift, drag, actuator points, tolerances,
failure timers and world envelopes. Use the live browser only after the
source contract and independent physical profile do not explain the symptom.
Inspect the relevant current definitions and tests after reading the
contract. Do not trust remembered constants.

## Classify the work

Choose the smallest correct owner before editing:

- Put geometry and contacts in `VehicleFrameDefinition`.
- Put machine capabilities, interactions, route selection, and tolerances in
  `AirVehicleDefinition`.
- Put path geometry, altitude, speed, corridor, and markers in a route
  artifact.
- Put generic guidance laws in the shared autopilot only when both reference
  machines need the rule.
- Put actual authority in breakable actuator tags.
- Put shaft allocation in the shared autopilot; put request/delivery feedback
  sensing in propulsion automation; put passenger/uncrewed clearance and
  degraded route limits in the flight supervisor.
- Put collision prediction in safety automation as an advisory; only the
  autopilot or a selected manual-assist mode may turn it into controls.
- Put rotorcraft inner-loop laws in `rotorcraftDynamics`; manual-pilot
  behavior in `rotorcraftPilot` (the pilot owns guidance; the controller
  keeps attitude, mixer and stabilization).
- Put ground-car laws in `carDynamics`/`TownCarSystem` — a deliberately
  separate runtime, not a branch of the shared vehicle frame (the shared
  frame is about a JOURNEY; the car has a human and four contact patches).
- Put train control in the pure `astanaTrainControl` module; section poses
  and contact envelope in `astanaTrainRuntime`.
- Put constant mechanisms (mill sails) in `ConstantRotorSystem` authored
  data — deliberately no wind, aerodynamics or vehicle coupling.
- Put member visual motion (wheel spin/steer, strut slide, gear fold) in
  render articulation (`clusterMemberArticulation`) — never in a physics
  body.
- Put standing-person behavior in moving-support dynamics.
- Put UI naming in interaction cues and game-action hints.
- Put physical/user/sky/camera extents in the scene world definition.

Do not branch the common controller by vehicle id to solve a route-authoring
or capability problem.

Do not stack control logic on top of physically logical behavior. A sternway
departure can move the carrier centre toward the future circuit while the bow
yaws in the opposite direction. If route requirements, requested controls,
delivered authority and resulting motion agree, report that the behavior is
correct instead of adding a route-specific lookahead or yaw correction.

## Work in verifiable milestones

For a substantial new machine, complete and report each milestone before the
next large implementation block unless the user explicitly requests
end-to-end delivery.

### 1. Audit

- Read repository instructions.
- Inspect the dirty tree and preserve unrelated work.
- Locate the scene cluster, frame, vehicle definition, routes, tests, and
  world envelopes with `rg`.
- Determine whether the task changes construction, capabilities, routes,
  passenger behavior, or the shared controller.
- Record current mass, centre of mass, lift offset, actuator inventory,
  route length, maximum route radius, and existing test baseline.

### 2. Establish the physical carrier

Follow `references/assembly.md` for solver and construction pitfalls.

- Prove large masses, side/front/top silhouette and both three-quarter views
  before fittings. Build curved armor from a shared profile/surface.
- Keep ship and berth in separate clusters.
- Compile one compound body from attached pieces.
- Declare articulated members so they have one pose owner.
- When the task changes visible form, record protected livery/physics and
  prove primary silhouette, control lines, openings and mounting nodes
  against matched reference views before adding fittings.
- Verify resting geometry, collider membership, contact against both intact
  structures and detached debris, initial stability, and heart collapse
  before route work.
- Recheck spawn capsule, boarding path, doors and ramps after each major
  hull edit.

### 3. Prove mass and balance

- Compute mass properties from authored pieces and material densities;
  calibrate the mass unit against a neighbouring machine, never kilograms
  (see «Масса, развесовка и подъём» in airborne-vehicle-dynamics.md).
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
- Make the autopilot learn authority from the previous request/delivery
  pair; never hand it physical blade health as a precomputed command.
- Drive propeller animation from the autopilot's compensated signed shaft
  command and oar animation from delivered bank controls.
- Test partial and complete loss of each required channel.
- Measure the hull envelope at each engine station and place the visible
  mechanism outside it with a deliberate protection/service gap. Tie smoke,
  light and mechanical animation to delivered power, using the established
  particle/rendering pipeline before creating a local substitute.
- For a two-blade propeller, prove `1.0 / 0.5 / 0.0` availability, faster
  remaining-blade rotation in both forward and reverse, uncrewed-only
  degraded dispatch, complete failure after required-core loss, and a
  physically completed degraded docking.

### 5. Author routes as requirements

- Author berth-local nodes, computed Bézier handles, altitude, speed,
  optional corridor, optional signed travel direction, and phase markers —
  arcs and figure-eights are computed by formula, never placed by eye (see
  «Построение трасс» in vehicle-control-lessons.md).
- Set `finalFrom` where exact approach following must begin.
- Keep route code ignorant of engine layout and vehicle identity.
- Advance progress from physical projection only.
- Use a negative travel direction for a sternway manoeuvre; never encode it
  as a negative engine command in route data.
- Simulate the intact machine through the whole route and
  `isDockingComplete` (or `isRotorLandingComplete` for a rotorcraft).
- Keep a deliberately bad-approach test for go-around behavior.
- Add predictive route replanning only as a generic autopilot capability
  from destination pose and physical limits. Never hide a per-map route
  repair in the controller; every unsuccessful replanned approach counts as
  a normal go-around.

### 6. Integrate journey semantics

- Separate external uncrewed and onboard passenger interactions.
- Store occupancy explicitly; do not infer it from route kind.
- Map route markers into the common 7-state journey vocabulary
  (`LampEventState`); publish per machine — the journey lifecycle belongs to
  the MACHINE, not the map.
- Reuse telemetry and failure/recovery.
- Generalize scheduling before adding a second scheduled carrier to one
  scene; the current runtime selects the first carrier with `departure`.

### 7. Prove passenger behavior

- Require the onboard action to be inside the carrier volume.
- Verify full capsule clearance and a walkable boarding path.
- Keep standing passengers physical; use support velocity
  `v + omega × r` and finite traction; the aboard mask drops ONLY the world
  boundary (ACTOR_ABOARD keeps the vehicle group).
- Test acceleration, braking, yaw, jumping, transfer, and falling.
- Return an out-of-world passenger to the island spawn.
- Use explicit seat constraints only after a user action.

### 8. Size the world

Sample every public route relative to the scene world center. Keep separate:

- `worldRadius` for land;
- `boundaryRadius` for the user;
- `skyRadius` for visible atmosphere;
- `cameraFar` for the opposite view.

Leave margins for the hull and an overboard passenger. Do not enlarge the
land to hide a route-envelope mistake. Keep the actor safety floor out of
vehicle/debris collision masks; loose objects beyond authored land must fall
through the fog and despawn below the scene envelope.

### 9. Verify

Run, at minimum:

```bash
npm run build
node --test tests/vehicle-frame.test.mjs tests/motion-route.test.mjs tests/vehicle-failure.test.mjs tests/moving-support-dynamics.test.mjs tests/motion-telemetry.test.mjs
```

Add the vehicle-specific test file and any interaction, hint, or seat tests
touched by the change. Make the vehicle-specific test simulate forces
through physical docking or landing; a geometry-only route test is
insufficient.

Inspect the live scene when interaction placement, passenger clearance,
visual actuation, world envelopes, or CJM copy changed. Check both the
exterior call site and the onboard call site.

When exterior/interior form or lighting changed, also complete the
autonomous matched-view loop from
`games/make-a-mess/docs/architectural-authoring.md`, раздел «Визуальная
приёмка и автономный цикл»: front, profile, both diagonals, high view,
important joint and night. Do not treat a geometry inventory or a clean
physics simulation as visual acceptance.

For docking, record a predicate matrix at the actual mooring point:
position, height, heading, `linearVelocity + omega × radius`, vertical
speed, attitude, angular speed, time in capture, final-manoeuvre time and
recovery state. Do not loosen a centimetre-scale tolerance until physical
capture geometry proves it wrong. Once docking capture begins,
final-manoeuvre and capture-settle timers must be mutually exclusive. If a
weaker machine docks faster, the braking profile aims short of the berth —
the asymptotic-approach trap (see «Швартовка, посадка, конец рейса» in
vehicle-control-lessons.md).

For impact recovery, prove that bullets and explosions transfer both
momentum and moment to the compound cluster. Attached pieces remain
self-members; detached debris becomes an ordinary obstacle. A large but
recoverable upset must be corrected through surviving controls without
consuming an incompatible failure timer.

Create render-loop resources synchronously before exposing meshes or frame
callbacks that use them. Geometry attributes updated every frame must exist
on the first frame and after HMR, not appear later in a passive effect.

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
  during braking, and the pitch-up swing rate — the visible "rearing"
  gesture;
- speed at the crossing versus speed on tight arcs (racing-line shape);
- fan commands, delivered output and learned health for auxiliary thrusters.

Identical numbers across a with/without comparison almost always mean the
change is not wired, not that it is neutral.

## Non-negotiable invariants

- Never move a carrier from route progress or elapsed time.
- Never let per-step forces accumulate: Rapier user forces are persistent,
  so every controller that recomputes forces each physics step must start
  the step with `resetForces(false)`/`resetTorques(false)` — and prove a new
  vehicle with a full sleep → start → lift-off test, not a mid-flight one.
- Never assign orientation from a route tangent.
- Never complete a flight from progress alone.
- Never retain mass, collision, or authority from a detached piece — and
  never remove a carve-consumed piece from membership: the ledger is "what
  is still on the machine", not "what is still intact".
- Never rebalance a damaged vehicle by moving its lift point.
- Never animate actuators from raw requested control: propellers follow the
  autopilot shaft command after feedback-based allocation; uncompensated
  mechanisms follow delivered control.
- Never give an articulated member (wheel, strut foot, folding leg) a
  physics body or collider: member motion is render-only; the machine model
  computes the contact.
- Never parent a standing passenger to the carrier transform.
- Never use one interaction identity for uncrewed and passenger journeys.
- Never let mooring pull from outside its local capture area.
- Never replace a failed approach with a sideways or teleported docking.
- Never declare `settleInPlace` grounded without sustained physical support
  contact and a stable pose.
- Never implement a second vehicle-specific autopilot without proving the
  shared contract cannot express the requirement (the ground car and the
  train are deliberate separate runtimes, not autopilot forks).
- Never detach a beam, glow or animated fitting from the visible mechanism
  and carrier pose that physically owns it.
- Never rebuild protected livery or physics to repair a local
  reference-form defect unless the existing topology is proven incapable of
  the requirement.
- Never change a global door/hinge direction to implement a tail ramp; give
  the ramp its own articulation policy.
- Never hide a visible engine inside the measured hull envelope or drive
  its smoke/light from requested rather than delivered power.
- Never judge an en-route holonomic flight by heading error or slip: the
  trajectory is the requirement, the nose is a preference. Heading matters
  at the approach gate and at a route merge.
- Never author route speed bands from the machine's physics: bands are
  intent ceilings, the governor computes the operating point from the live
  passport.
- Never keep a derived limit (attitude ceiling, corridor, slip allowance)
  as a standalone constant next to the passport it follows from — derive it.
- Never feed feedforward computed from allowed-vs-allowed profiles: braking
  anticipation is the gap between ACTUAL speed and the allowed speed ahead,
  or a stalled machine deadlocks against its own frozen demand.
- Never author kinked profiles or windows: the curve's second derivative
  reads a linear window's corner as a crest and fights the climb.
- Instruments on a segmented ring mount at the STRICT MIDDLE of a side
  plate, rotated to its chord — never on a splice. A plate occupied by a nav
  light hands the instrument to the neighbouring plate nearer the outboard
  normal; stacked instruments on one plate separate vertically with a clear
  gap. Hull sensors sit ON the skin (a belly sensor hovering under the hull
  reads as a detached lamp). The rule covers SIDE-looking instruments only:
  ring up/down sensors belong over and under the duct axis where they look.
- Never sample first and second derivatives of a plan with one base length:
  curvature needs a wide base, slope a fine one.
- Never let a mirrored effector pair drive translation unless BOTH members
  are proven healthy: null-space math protects against a KNOWN dead member,
  but belief lags reality — an explicit pair-health gate (and treating
  unproven channels as unavailable until a probe pulse teaches them) is what
  removes the uncompensatable moment class entirely. A degraded pair remains
  a yaw organ (a lone member works in reverse), never a thrust organ.
- Never drive retraction of landing gear from its own timer, altitude or
  speed: gear follows the shared journey state (`cruise` folds, everything
  else extends, `failed` extends). A folded or half-folded leg bears no
  load.
- Never tell the autopilot or the watchdog that an impact happened: impact
  telemetry is HUD-only, captured before automation reacts.

## Handoff

Report:

- what changed in construction, capabilities, routes, passenger dynamics,
  or world envelopes;
- intact mass and horizontal balance;
- route result, maximum tracking error, go-arounds, and docking/landing
  result;
- passenger and interaction result;
- build and targeted-test result;
- remaining full-suite failures, clearly separated by relevance.

Link the normative documents and the main implementation/test files. Do not
stage or commit unless requested.
