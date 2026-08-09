# Articulation: kinematic groups, motion contracts and swept envelopes

## Contents

1. Four-way protected scope for a moving object
2. Kinematic-group boundary before geometry
3. Pivot and axis: one owner
4. Envelope bookkeeping: three separate numbers
5. Motion contract in the schema: current state and required standard
6. Second-state renders
7. Swept-envelope verification
8. Leaves, gates and paired openings
9. Runtime articulation lessons: wheels, struts and cluster members
10. Test checklist

## 1. Four-way protected scope for a moving object

Before any research or geometry, record four separate scopes:

- **static geometry** — everything that never moves;
- **kinematic group geometry** — everything that moves together;
- **allowed motion** — the exact permitted degrees of freedom, ranges and phases;
- **excluded simulation and external couplings** — everything explicitly not simulated this milestone.

Example: a windmill rotor may have only constant rotation about a fixed shaft. That does not authorize wind response, cap yaw, aerodynamics or coupling to airships. The constraint is stored in the canonical contract **as data** and proven by a test — it is never left as a chat agreement.

## 2. Kinematic-group boundary before geometry

For a machine that historically moved as a whole, draw the kinematic-group boundary **before** building geometry, even when motion is frozen in the current milestone:

- the hull, the wings/sails and the working deck that travelled together must share one pivot;
- the foundation, the ring wall and the guide rails stay **outside** the group, even while nothing moves yet.

A boundary drawn after the fact forces re-parenting of finished parts, and a boundary drawn wrong once (deck welded to the foundation) survives silently until the first animation milestone breaks it. The group membership is model data, listed in the evidence card, and a test counts which named groups belong to the kinematic side.

## 3. Pivot and axis: one owner

Store each mechanism's axis and pivot exactly once in the canonical model. The renderer, the swept-envelope test and any future animation read the same values. Two copies of a pivot are a guarantee that one of them is wrong after the first correction.

## 4. Envelope bookkeeping: three separate numbers

Never merge these into one number:

- **wall footprint** — the plan of the load-bearing shell;
- **roof/fixed envelope** — the complete static envelope including overhangs, gutters, ridges and decorative finials, which may legitimately exceed the wall footprint;
- **kinematic reserve** — the volume the moving group may occupy over its full allowed range.

Keep each with explicit axes. Both static contours may fit a shared world clearance while remaining different numbers; a wall-footprint test proves nothing about a roof overhang, and neither proves the rotor sweep fits. Store fixed and operating envelopes as separate named dimensions (see `fixedFootprintLength/Width` vs `operatingEnvelopeLength/Width` in `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`), and let tests recover each separately from final parts.

## 5. Motion contract in the schema: current state and required standard

The Playgate `ObjectLabModel` (`games/make-a-mess/src/content/objects/dutchWindmills/objectModel.ts`) has two motion fields today:

- `rotor` — a **typed** contract: `pivot`, `axis`, `fixedPhaseDegrees`, `motion: "constant-rotation-only"`, `windCoupling: false`. This is the good pattern: the pivot and axis are points, the allowed motion is a closed enum, the forbidden coupling is an explicit false that a test can assert.
- `motionConstraints` — an **untyped bag**: `Readonly<Record<string, boolean | string | number>>`. In practice it holds entries such as `canopyOpensOnlyWhenRotorsStopped: true`, `rotorAxesFixedToBody: true`, `translationByBodyTilt: true` (`sr6SkatObject.ts`), or `yawAxesCantedOutward: true`, `weaponsStaticForObjectStudy: true` (`combatHexacopterObject.ts`). These are honest declarations, but nothing in the type system connects `canopyOpensOnlyWhenRotorsStopped` to a canopy pivot, an opening range or a rendered open state — the bag documents intent without making it testable.

**Required for new work**: every allowed motion gets a typed record with

- `pivot` — a point in model space;
- `axis` — a unit vector (or a travel direction for sliding parts);
- `range` — explicit minimum and maximum (degrees for rotation, metres for travel), plus the rest phase;
- interlocks as explicit fields (e.g. rotors-stopped precondition), not prose keys.

A boolean without a pivot, axis and range is a comment, not a contract. Keep `motionConstraints` for genuinely scalar declarations (counts, class strings), and migrate any entry that describes a motion into the typed form.

## 6. Second-state renders

If the motion contract allows a discrete second state — canopy open, gate open, cap turned, blades feathered — the camera manifest must include a **second-state render**: a named view (or view set) capturing the same canonical model in the other phase, stamped with the same revision and hash.

This is a live debt in the repository: today no capture manifest anywhere carries a second phase, and the SR-6 study (`games/make-a-mess/docs/sr6-skat/README.md`, «Открытые долги») admits the canopy opening sweep is specified but not yet rendered as a second state. Do not replicate that debt: a specified-but-never-rendered state is exactly the kind of promise this method exists to eliminate. If the second state cannot be rendered yet, the motion is not proven and must be listed as an open discrepancy, not as a feature.

## 7. Swept-envelope verification

The swept envelope of the moving group must be computed over the **full allowed range** of the motion contract, not only at the phase chosen for the PNGs.

Compare that swept envelope against the union of **all** static parts in the direction of approach:

- a private "blade vs roof" check is invalid — if the deck, gallery, handrail or a support beam protrudes farther than the roof, the blade meets it first;
- account for the thickness of both bodies, the full radius and the whole blade length, not just the tip point;
- run the check in the frame where the motion is simple (the pivot frame), then confirm extreme phases against rotated static bounds.

The same law covers translation: an opening canopy sweeps a volume; a sliding hatch sweeps a slab. Every swept volume must clear every static part with the tolerance the passport names.

## 7.1 Retraction: the free volume decides, and the angle is solved

For anything that stows — landing gear, a boom, a hatch, a folding wing — decide
**where it goes before deciding where it hangs**. Enumerate the volumes that are
free in plan (for a machine packed with rotors or engines that may be only the
nose, the tail and the gaps between units), and place the hinge so the stowed
member lands in one of them. A leg that folds into a duct is not retractable; it
is broken, and the render will not tell you, because the extended pose looks
fine.

The stowed angle is **solved, not typed**. Ninety degrees is a habit, not a
geometry: a member splayed outboard as well as down needs the rotation that
brings it horizontal, which for a realistic splay is `130°` or more. Compute it
from the member's own vector and store the result as the range; then test by
composing the stored rotation and checking the folded joints against every
static volume they must miss.

Minimum tests for a retraction:

- folded pivot, knee and tip clear every bore, ring and duct;
- folded member sits above the ground datum by a stated margin;
- folded member lies inside the body's plan, not hanging outside it;
- extended pose still reaches the datum with the stated ground clearance.

If the second state cannot be rendered — a single-pose lab cannot show two —
record it as an open debt in the discrepancy log, in those words. A stowed
position that is computed but never seen is exactly the promise this method
exists to eliminate.

## 8. Leaves, gates and paired openings

Build every leaf from its hinge axis, not from the opening centre. For a paired opening verify separately:

- the number of leaves;
- each leaf's own connection to its own hinge;
- the full-open sweep clearing rails, tracks and the threshold — over the whole travel, not at the closed pose.

A leaf whose edge does not coincide with its hinge axis binds on the first frame of animation even if the closed render is perfect.

## 9. Runtime articulation lessons: wheels, struts and cluster members

Established by three failed attempts and one working design (`games/make-a-mess/src/game/clusterMemberArticulation.ts` — read its header before touching vehicle articulation):

- **Wheels spin THROUGH THE RENDERER, not through a physics body.** A wheel that becomes an independent kinematic body with a collider breaks the machine three separate ways, all proven in practice: the suspension ray finds support in the vehicle's own wheel and the car sinks to the bump stops; the kinematic wheel inside the arch pushes its own dynamic body apart and corner loads diverge threefold; and even with ray exclusions plus disabled collision groups the car still settles onto two diagonal supports and hangs. The root cause is common: the wheel sits inside the body's contour, hard against the suspension ray, so *any* collider there is an obstruction — there is nothing to tune because the body is simply superfluous.
- The working pattern: the wheel remains an **ordinary cluster member** — no body, no collider; the carrier holds its contact. Only the render matrix changes: an extra rotation about the member's own centre (steer + spin), composed into the carried-piece pose. Physics cannot be harmed because physics never learns of the rotation.
- The limitation is honest: articulation is purely visual. A steered wheel does not catch a kerb with its turned side — and that is correct, because the contact patch is computed by the vehicle dynamics, already turned. Likewise strut travel: ground reaction is computed by the strut model, and the render receives the finished compression as a `slide` along the strut axis, so the oleo is visibly stroking without the drawn foot ever dipping under the ground.
- **A station's `hub` is the TOP OF THE STRUT, not the wheel centre.** Drawing the wheel at `hub` floated a finished car 160 mm above the road; the discrepancy was caught only by a "visible wheel stands ON the road" test, because every passport-number test passed. When consuming any suspension station, verify which point the field actually names before hanging geometry from it.

## 10. Test checklist

- kinematic-group membership recovered from model data and matching the evidence card;
- pivot and axis stored once; renderer and tests read the same values;
- each motion has typed pivot, axis, range and rest phase;
- forbidden dynamics explicitly absent (e.g. `windCoupling: false` asserted);
- wall footprint, fixed envelope and kinematic reserve recovered separately from final parts;
- swept envelope over the full range clears the union of all static parts, thickness and full member length included;
- every leaf edge coincides with its hinge axis; full-open sweep clears rails and threshold;
- every allowed discrete second state has a named, rendered, same-hash view in the manifest;
- for runtime vehicles: articulated members carry no bodies or colliders; visible wheels stand on the road; strut feet never dip under ground at full compression.
