# Behaviour, world boundary, and validation

Use this reference to make creature behaviour portable, environmentally
caused, and independently testable.

## Contents

- Layer model
- World facts, not commands
- Behaviour selection
- Life outside hunting
- Territory is not a rail
- Validation ladder
- Turn user feedback into a detector
- Milestone discipline

## Layer model

Keep these layers separate even when one file currently stores several:

| Layer | Owns | Must not own |
| --- | --- | --- |
| body family | skeleton, proportions, joint mechanics, render attachments | world coordinates, profession, coat colour |
| species mechanics | gaits, flight envelope, senses, action repertoire | one map's route or props |
| appearance/phenotype | skin, coat, clothing, markings, wear | skills, cadence law, AI |
| skills/profession | enabled actions and response weights | mesh or species identity |
| individual state | memory, fatigue, arousal, current intent, injury | static world definition |
| population profile | local variants, skills, social/territory data | scene-id conditionals |
| world | time, geometry, surfaces, events, affordances, population declarations | paws, wings, homes as universal concepts |
| species adapter | classify world facts and run the body/behaviour | duplicate world or canonical geometry |

Use discriminated population definitions and validated profiles. Dispatch by
capability/body kind, not by known scene id.

## World facts, not commands

Publish neutral facts such as:

- time and light state;
- live geometry, surfaces, material/category, destruction state;
- acoustic level, rise time, signal character, and impulse wave;
- visible or dangerous presence;
- water, wind, thermal, cover, scent, food, nest, work, or lookout affordances
  when the product needs them.

Each population keeps its own event cursor. One consumer must not remove an
event before another species reads it. Species and skills classify the same
fact differently.

## Behaviour selection

Model intention as a scored competition influenced by internal and external
state. Candidate terms include:

```text
need + habit + remembered value + novelty/uncertainty + affordance
- effort - exposure - collision risk - interruption cost
```

Use hysteresis and commitment so close scores do not flicker every frame.
Permit interruption when threat, pain, loss of support, or a high-value signal
dominates. Record why an intention won for tests and dev probes.

Skills enable or weight candidates; they do not replace this law. A creature
without `terrain-perch` may still navigate around a rock but cannot choose the
perch action. A profession can change startle gain or work repertoire without
changing human anatomy or clothing.

## Life outside hunting

Build the ordinary repertoire before predation or combat:

- observe and reorient;
- patrol, inspect, revisit, mark, or guard territory;
- rest, sit, lie, sleep, warm, cool, seek shelter;
- groom, scratch, stretch, shake, drink, or maintain the body;
- play, sprint, test an object, climb, perch, or choose a viewpoint;
- keep social distance, approach familiar actors, avoid conflict;
- work, carry, use an object, gather, communicate, or wait with purpose.

Avoid a random idle playlist. Environmental affordances and internal state
should make the same action understandable to an observer.

## Territory is not a rail

Treat authored territory points as interests, memories, boundaries, or
candidate affordances. Let the species choose a route and movement mode through
live geometry. A natural route may include detours, pauses, height-seeking,
multiple jumps, walking where flight is wasteful, or flight where ground travel
is exposed or impossible.

Track recently visited places, failed affordances, current destruction state,
and an exit plan. A chosen perch or landing must remain valid until commitment
or trigger an explicit abort.

## Validation ladder

### Structural

- one canonical geometry owner and one ordered skeleton;
- unique bone ids, parents precede children, invariant segment lengths;
- parts, attachments, contacts, and renderer map to canonical owners;
- profiles validate identity, skills, appearance, and territory independently.

### Mechanical

- declared contact order and continuous duty factors;
- dense interpolation never penetrates support surfaces;
- planted support velocity is bounded in world space;
- frame-rate invariance and velocity continuity across mode changes;
- turning creates placements; small terrain articulates limbs;
- jump/flight trajectories meet measured targets and ordered impacts.

### Behavioural

- removing a skill removes only its repertoire;
- changing appearance does not change decisions;
- quiet/limited profiles produce measurably different behaviour;
- live obstacles and destroyed affordances alter routes;
- long probes visit required states without entering forbidden geometry;
- neutral world events reach multiple populations and cause species-specific
  responses.

### Visual

- isolate skeleton profile and three-quarter views;
- render every key action from one model hash;
- inspect contact, silhouette, target gaze, and transitions at world scale;
- capture the failure angle named by the user;
- inspect several consecutive frames for sliding or vibration;
- validate still observation as carefully as high-speed motion.

## Turn user feedback into a detector

Translate the observation into a measurable invariant without discarding its
visual meaning:

| User observation | Example regression |
| --- | --- |
| “the paws slide” | world velocity of rendered planted pad |
| “the animal shakes” | axial frame velocity/acceleration plus chain continuity |
| “the paw should reach” | reach residual and bounded compliant girdle travel |
| “it floats over stones” | independent footprint heights and root delta |
| “the sit is hunched” | chest above pelvis, vertical fore chains, level muzzle |
| “the tail twitches” | stable action target, bounded tip acceleration, supported curl |
| “the wing is one board” | span/area and proximal/distal joint contribution by phase |
| “it acts randomly” | recorded intent score and environment/need cause |

Keep the fixed image or probe that exposed the problem alongside numeric tests
when practical. A proxy measurement that can pass while the visible defect
remains is not a sufficient regression.

## Milestone discipline

Implement in this order unless the user explicitly changes it:

1. evidence and body passport;
2. accepted canonical geometry;
3. skeleton and isolated action atlas;
4. gait/flight morphology and transition passports;
5. whole-body temporal law;
6. contacts, terrain, and targeted movement;
7. behaviour and population profile;
8. world integration and live forward-test;
9. only then damage, hunting, combat, soft tissue, or additional variants.

State exclusions as product scope, not as bugs. Do not register an adjacent
creature merely because the dispatcher and skeleton already exist.
