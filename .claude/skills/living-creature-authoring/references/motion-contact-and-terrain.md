# Motion, contact, and terrain

Use this reference for continuous locomotion, transitions, support, jumping,
flight, and movement through real geometry.

## Contents

- Separate five owners
- Terrestrial locomotion
- Whole-body continuity
- Support and planted contacts
- Raised targets and jumps
- Winged creatures
- Diagnostic map

## Separate five owners

| Owner | Responsibility |
| --- | --- |
| navigation/body trajectory | desired path, speed, heading, ballistic or flight state |
| gait/action target | local anatomical configuration and intended contact phase |
| whole-body temporal state | continuous local positions/rotations and velocities |
| contact solver | world anchors, load, surface height, reach correction |
| renderer | draw the solved body and attachments without another motion law |

Do not let one layer conceal another. Root trajectory cannot fake a jump pose;
IK cannot hide a discontinuous body; rendering cannot own a second gait.

## Terrestrial locomotion

Advance cyclic phase from travelled path length:

```text
phase += effective_distance / stride_length
effective_distance = centre_travel + turn_arc
```

Derive cadence from speed and stride, then limit joint ranges. When the animal
slows, its legs slow automatically. Count heading change as a foot-placement
cost so a creature cannot rotate through a long planted phase.

Declare gait-specific support order and duty factors. Key atlas contacts prove
sequence; continuous support windows define runtime load. Keep acceleration,
braking, and turning distinct:

- acceleration lengthens propulsive rear support and aims the body into the
  selected corridor;
- braking transfers impulse through distal fore contacts before axial mass
  arrives;
- turning requires new placements, lateral support, and bounded yaw rate.

## Whole-body continuity

Treat authored poses as desired generalized coordinates. Preserve one temporal
state containing root translation/velocity plus parent-local joint rotations
and angular velocities. Rebuild global transforms in hierarchy order.

Use frame-rate-independent damping or integration. Verify the same response at
multiple frame rates. Preserve initialized parent-child offsets unless the
body passport explicitly owns a compliant translation, such as bounded
scapular glide.

Never smooth each final global matrix. It lets a child lag behind its parent,
stretches chains, and creates the very vibration it is meant to hide.

## Support and planted contacts

For each support:

1. detect touch-down from action phase and reachable surface;
2. capture an oriented world anchor;
3. ramp support load continuously;
4. solve the limb to the anchor within anatomical limits;
5. transmit residual through permitted girdle/spine compliance;
6. release load before toe-off, then release the anchor.

Measure world speed of the actual rendered pad/sole, not a helper pivot. Check
mean, tail percentiles, and transition spikes. A frequency-matched paw can
still slide at full body speed.

Use an oriented footprint rather than a centre ray. A paw on a small stone and
three paws on ground define an articulated body, not a uniformly raised root.
When no reachable solution exists, change placement, posture, or path; do not
stretch the leg or teleport the body.

## Raised targets and jumps

Treat a landscape jump as a planned route segment:

```text
candidate affordance
→ reachable launch area
→ collision-free arc or sequence
→ measured landing patch
→ ordered contact and absorption
→ stable observation/travel state
→ valid exit or descent
```

Validate height, top area, material/category, structural support, current
destruction state, approach clearance, and landing footprint. Explicitly reject
walls, roofs, foundations, decoration, tiny stones, and floating debris unless
the species contract says otherwise.

Keep preparation, propulsion, flight, reach, impact, and settle distinct. The
trajectory belongs to world/body dynamics; the pose owns the body response.
For non-linear routes, plan intermediate supports or multiple jumps instead of
aiming directly at the final point.

## Winged creatures

Separate wingbeat phase, wing shape, aerodynamic force, and body response.
Segmented membrane wings should distribute large shape changes proximally:

```text
shoulder → elbow → wrist → metacarpal/knuckle → long spar
```

Keep the distal spar relatively stiff unless evidence supports active folding.
Use elbow, wrist, and knuckle to reduce area on upstroke, sweep in dive, trim in
bank, and unfold after ground clearance. Do not rotate the entire wing as one
board.

Required causal links:

- downstroke changes force and produces chest/body response;
- upstroke reduces drag through area and angle changes;
- bank is asymmetric wing shape plus roll/yaw trajectory, not root roll alone;
- hover/brake requires an expensive high-angle force history, not zero speed;
- flare retains wing support through first contact;
- folding follows unloading and clearance.

For a finite perch, centreline position is not sufficient evidence of a safe
final. Measure signed cross-track position and cross-track velocity in the
surface frame, and permit flare commitment only when both are bounded. Validate
the complete oriented contact footprint against the physical support pieces.
If contact is rejected, enter a powered go-around that first recovers height
and airspeed; never send a near-stalled body directly back to an ordinary glide
controller. Test the abort densely so neither the support plane nor terrain is
crossed between sampled states.

Reuse an existing rigid-body/air solver only after mapping its outputs to the
creature's aerodynamic surfaces and body response. Vehicle controls do not
automatically produce a living wing cycle.

## Diagnostic map

| Symptom | Likely cause | Required detector |
| --- | --- | --- |
| feet/paws slide | contact follows root or phase uses time | rendered support world velocity |
| creature jitters | global pose blending fights per-limb IK | axial velocity/acceleration and bone-length continuity |
| leg cannot reach | missing compliant girdle or invalid placement | reach residual by chain and support |
| all body rises on pebble | one centre height owns terrain | per-foot heights and root delta |
| limb sinks between poses | contact only checked at keys | dense interpolated box bounds |
| turn looks like skating | yaw ignores gait distance | turn arc, placements, and support duration |
| jump looks weightless | pose/root offset replaces trajectory | launch velocity, apex, landing impulse |
| landing snaps | load/contact changes in one frame | contact-weight derivative and axial acceleration |
| landing is centred but slides off | cross-track position ignores lateral velocity | position and velocity in the oriented landing frame |
| aborted landing falls through terrain | near-stall state returns to glide routing | go-around height/airspeed recovery and dense minimum clearance |
| wing folds like paper | distal joints own gross morph | local ROM distribution and span/area measurements |
| head vibrates | no axial/neck compensation | head angular velocity relative to chest |

Run long curved routes and mode transitions. Straight steady-state clips are
insufficient evidence for contact or continuity.
