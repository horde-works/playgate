---
name: living-creature-authoring
description: >-
  Research, design, implement, debug, validate, and integrate believable
  articulated living creatures: humans and humanoids, quadrupeds and large
  cats, birds, dragons and pterosaur-inspired flyers. Use for anatomy and
  skeletons, rigs and action passports, walking/running/gaits, planted feet or
  paws, IK and ground contact, whole-body continuity, jumps, takeoff, landing,
  flight and segmented wings, observation and stillness, non-hunting
  behaviour, internal drives, territory and terrain use, species/appearance/
  skill/world separation, runtime population adapters, creature rendering,
  and failures such as sliding, jitter, floating, sinking, root-only motion,
  disconnected limbs, random idle, or world-specific animal code.
---

# Living Creature Authoring

Build a living system whose visible motion follows anatomy, support, force,
attention, and intent. Treat animation clips and procedural poses as desired
mechanical states, never as exceptions to the body.

## Load the right contracts

Read repository instructions and inspect the current owners before editing.

- Read [body-and-action-passports.md](references/body-and-action-passports.md)
  completely when creating or changing morphology, a skeleton, a rig, a pose,
  an action, an item interaction, or observation.
- Read [motion-contact-and-terrain.md](references/motion-contact-and-terrain.md)
  completely when changing gait, jumps, flight, transitions, foot/paw contact,
  IK, whole-body smoothing, terrain use, climbing, perching, or landing.
- Read [behaviour-world-and-validation.md](references/behaviour-world-and-validation.md)
  completely when changing profiles, skills, appearance, behaviour, senses,
  territory, world integration, populations, or acceptance tests.

In Playgate, also read
[`games/make-a-mess/docs/living-creatures-lessons.md`](../../../games/make-a-mess/docs/living-creatures-lessons.md)
completely. Then read only the relevant specialization:

- humans and settlement life: [`village-inhabitants`](../village-inhabitants/SKILL.md)
  and `games/make-a-mess/docs/village-inhabitants-lessons.md`;
- large felids: `games/make-a-mess/docs/big-cat-locomotion-research.md`;
- dragons: `games/make-a-mess/docs/dragon-locomotion-research.md`.

Use [`reference-faithful-object-study`](../reference-faithful-object-study/SKILL.md)
before changing canonical visible geometry. This skill owns how an accepted
body becomes alive; it does not license silent resculpting.

## Non-negotiable laws

1. Keep one canonical body and one ordered skeleton per body family. Every
   pose, renderer, collider mapping, attachment, and test must consume them.
2. Store pose rotations parent-local and rebuild the hierarchy from root to
   leaves. Never smooth finished global bone matrices independently.
3. Let travelled distance advance terrestrial gait phase. Count a turning
   arc as travelled foot distance; time alone does not own cadence.
4. Give each supporting foot, paw, manus, or wing contact a world anchor and a
   continuous load. A declared contact must not travel with the navigation root.
5. Keep contact and temporal smoothing separate. Contact constrains the body;
   it is not a visual filter. Whole-body damping preserves velocity and bone
   lengths; it is not IK.
6. Describe every action as `intent → preparation/support → force path →
   whole-body response → release/recovery`. A named pose without this chain is
   not an action passport.
7. Let the head/eyes choose a target before larger masses respond. Encode the
   delayed consequence in neck, chest, supports, tail, or wings.
8. Separate body family, species, phenotype/appearance, skills, individual
   state, and world-owned territory. Appearance never selects mechanics or
   behaviour.
9. Let the world publish facts: time, surfaces, geometry, sound, impulses,
   presence, and affordances. Species adapters decide what those facts mean.
10. Turn a user-observed visual failure into a measurable regression. Passing
    unit tests never overrules a rejected silhouette or an obvious slide.

## Workflow

### 1. Protect ownership and scope

- Inspect dirty files and concurrent work. Stop before overlapping another
  active edit.
- Identify canonical geometry, skeleton, pose/action data, temporal solver,
  contact solver, species behaviour, population profile, world adapter,
  renderer, and tests.
- Record what is accepted, what may change, and what remains excluded.
- Separate research truth, authored assumptions, runtime state, and world data.

### 2. Establish the body and evidence

- Select the body plan and scale before authoring movement.
- Trace force paths from contact or aerodynamic load into the axial body.
- Represent function-bearing joints, including scapular glide, hocks, wrists,
  wing folds, toes, hands, and tail controls when the action needs them.
- For fictional creatures, transfer a defensible mechanism from real animals;
  do not claim fictional certainty or combine incompatible mechanisms.

### 3. Write passports before animation

- Write the neutral support and action passports.
- Name contact sets, support/load timing, joint sequence, axial response,
  gaze, delayed counter-motion, object constraints, and recovery.
- Define numerical and visual rejection conditions at the same time.
- Build key poses from the one skeleton in isolation before world integration.

### 4. Implement continuous body motion

- Derive gait from travelled path and transition through biomechanically
  distinct acceleration, braking, takeoff, flight, impact, and recovery states.
- Filter pose targets through one frame-rate-independent whole-body state.
- Preserve parent-child lengths and joint velocity through mode changes.
- Drive visible wing phase from the delivered aerodynamic state, not from a
  coarse behaviour label such as `return` or `glide`; a physical corrective
  stroke must never render as a fixed wing.
- Solve attachments and hands/paws from targets; do not invent a proxy body for
  complex actions or a separate fast-render walk.

### 5. Establish contact and terrain use

- Give every potential support an oriented footprint and surface query.
- Store the contact datum at the walkable top of the supporting geometry, not
  at a slab or collider centre. Test it against the actual world piece bounds.
- Blend load continuously around touch-down and toe-off.
- Let a small obstacle articulate one limb; do not lift the whole root.
- Treat raised movement as a target contract: valid affordance, approach,
  preload, ballistic/aerodynamic trajectory, ordered contact, absorption, and
  a usable exit.
- Choose a path and a movement mode together. Walking, climbing, jumping, and
  flying are different costs and force histories, not cosmetic clips.
- For flight, measure phase-resolved body acceleration. For landing, reject
  contact above the allowed horizontal/vertical speed or outside the oriented
  footprint; do not snap a falling root onto the surface.

### 6. Add behaviour through the body

- Select intention from needs, uncertainty, memory, affordances, risk, effort,
  and interruption—not from a random idle picker.
- Let skills enable or weight repertoire; keep them out of geometry and world
  wiring.
- Express observation, grooming, play, rest, patrol, investigation, social
  spacing, and avoidance through support and whole-body state.
- Keep attention active during locomotion; never rotate the whole actor only
  because the gaze target moved.

### 7. Integrate last and verify live

- Register a population declaratively without scene-id checks.
- Adapt world facts to the species without copying its body into the scene.
- Run isolated skeleton/pose gates, temporal/contact tests, long simulation
  probes, and fixed world observations.
- Inspect the actual target renderer at the intended scale and terrain. Capture
  at least the failure angle that caused the work.
- Update the project contract and discrepancy log with the law, cause,
  correction, detector, and remaining exclusions.

## Reject the change when

- a new action needs another skeleton, mesh, or hidden proxy;
- a planted support slides with the root or penetrates terrain;
- smoothing stretches a chain or depends materially on frame rate;
- a jump or flight phase is only a root offset;
- the head turns without a plausible support/counter-response;
- a small step lifts the entire creature;
- a creature uses a roof, wall, decorative prop, or destroyed part as an
  affordance without explicit validation;
- appearance, world id, or species string silently chooses behaviour;
- behaviour is a repeated random loop unrelated to the environment;
- the numeric suite is green but the live creature still reads as floating,
  sliding, vibrating, folded incorrectly, or looking at the ground.

## Handoff

Report the protected body/revision, changed laws, added detectors, isolated and
live observations, tests run, known exclusions, and the next meaningful
milestone. Do not claim hunting, damage, ragdoll, flight physics, soft tissue,
or a new species merely because adjacent infrastructure exists.
