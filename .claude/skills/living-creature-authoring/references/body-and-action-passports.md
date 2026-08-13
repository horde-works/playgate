# Body and action passports

Use this reference to turn anatomy and intent into a rig and a causal action.

## Contents

- Evidence hierarchy
- Body passport
- Force-chain audit
- Action passport
- Required action families
- Observation passport
- Common falsehoods

## Evidence hierarchy

1. Direct anatomy, biomechanics, force-plate, gait, flight, and behavioural
   evidence for the selected animal or body plan.
2. Closely related extant animals, with transferred mechanisms stated.
3. Fossil reconstruction and engineering inference, with uncertainty stated.
4. High-quality film or animation for timing and silhouette only.
5. Authored product assumptions, labelled as assumptions.

For a fictional creature, never let a cinematic image establish hidden bone
geometry, mass, muscle attachment, lift, or joint range. Use it to frame a
question and validate a readable result.

## Body passport

Record before rigging:

| Field | Required answer |
| --- | --- |
| identity | body family, species or fictional plan, age/size class |
| scale | mass, characteristic height/length/span, support footprint |
| axes | front, up, ground datum, units |
| axial chain | root, pelvis, spine regions, chest, neck, head |
| appendages | parent chain, joint order, active/passive degrees of freedom |
| force transfer | contact/aerodynamic surface to axial body |
| soft attachment | scapular sling, compliant spine, membrane, pad, tendon, tail |
| contact set | named feet, paws, manus, body rests, wings or other supports |
| mass distribution | major masses and expensive distal mass |
| limits | joint ranges, reach, swept envelopes, fatigue or load limits |
| variants | what appearance may change without changing body mechanics |
| exclusions | unimplemented toes, cloth, muscle, damage, ragdoll, aerodynamics |

Use one ordered parent-before-child skeleton. A render LOD may merge visible
parts, but ownership of head, hands/paws, feet, toes, scapulae, hocks, tail, and
wing controls remains in the canonical hierarchy.

## Force-chain audit

For every action, trace the load backwards:

```text
contact or lift surface
→ distal segment
→ intermediate joints
→ limb/wing girdle
→ chest or pelvis
→ spine
→ remaining supports, head, and counterbalancing appendages
```

If the chain stops at a floating shoulder, decorative wing root, animated paw,
or root transform, the body cannot explain the visible motion.

Distinguish a bony joint from a soft constrained attachment. A feline scapula,
for example, can glide over the thorax within a bounded muscular sling; it is
neither welded to the chest nor allowed to stretch the forelimb arbitrarily.

## Action passport

Write one passport per meaningful action or transition:

```markdown
### <action>

- intent:
- trigger and abort conditions:
- initial supports and centre-of-mass relation:
- preparation/countermovement:
- force or impulse path:
- ordered joint and axial response:
- gaze and head stabilization:
- tail/wing/free-limb response:
- contacts gained and released:
- object or target constraints:
- recovery and valid exits:
- numerical detectors:
- fixed visual observations:
- rejection conditions:
```

The action may be cyclic, ballistic, aerodynamic, reactive, or quiet. The
passport still needs preparation, load, response, and release. Observation is
an action: eyes/head lead, neck follows, chest and supports answer only when
the available range or urgency demands it.

## Required action families

Cover only those required by the product, but do not collapse mechanically
different families into one clip:

- neutral stand, sit, lie, rise, and observe;
- walk plus faster gaits with explicit support order;
- accelerate, brake, turn, and stop;
- step over, climb, jump, land, perch, and descend;
- takeoff, powered flight, glide, bank, dive, flare, touchdown, and recovery;
- carry, reach, push, pull, strike, throw, fall, get up, and other object work;
- startle, recoil, balance loss, impact, and recovery;
- grooming, play, investigation, territorial inspection, and rest.

## Observation passport

For still or moving observation, specify:

1. sensory acquisition and uncertainty;
2. eye/head direction;
3. neck compensation and available range;
4. chest/pelvis rotation only after the small chain is insufficient;
5. support redistribution before a large body turn;
6. delayed ear, tail, wing, hand, or paw response;
7. return, continued tracking, approach, avoidance, or interruption.

Require the muzzle/gaze to address the target, not merely a yawing root.
Preserve the current support pose while observing unless the target demands a
new support polygon.

## Common falsehoods

- Naming joint angles without tracing the resulting world-space silhouette.
- Rotating a limb while its parent body never receives or transmits load.
- Making the head quiet by freezing the neck rather than compensating motion.
- Treating sit as a uniformly lowered stand.
- Letting a folded limb penetrate itself or the support surface.
- Making landing a time-reversed takeoff.
- Using tail motion as generic life noise unrelated to balance or attention.
- Giving a fictional creature every useful mechanism from unrelated animals.
