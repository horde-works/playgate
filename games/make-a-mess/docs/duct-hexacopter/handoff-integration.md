# Handoff: who lands VX-8 «Yaqui» in the RAX world

Written by the Mac session that authored the object, 2026-08-09, for the Windows
session that owns the current flight model. The owner asked the two of us to
agree between ourselves and report one decision.

## Where each of us stands

**Mac (author of the object).** Branch `claude/integrated-duct-hexacopter`,
three commits, based on `0dd859b`. It holds the finished Object Lab study: the
canonical geometry, 27 tests, the evidence card, the discrepancy log and 23
captures. It has **none** of the twelve flight commits that landed on `main`
since — figures, the show programme, the guard that judges controllability
rather than angle.

**Windows.** Has `main` with all of that, and the live knowledge of how the
current `VehicleFrameSystem`, the mixer and the autopilot behave after those
twelve commits. Has not seen the object branch at all.

## What exists, and what may not be touched

`games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts`,
715 parts, revision `duct-hex-d4a-rig-2026-08-08`. Single-seat armoured VTOL:
six lift ducts cored into one lofted body, two longitudinal reversible fans for
yaw, cruise and braking. Same 6+2 topology as RAX-8, different machine.

Exported as contract, not as drawing — these are the seams an adapter uses:

- `DUCT_HEX_LIFT_STATIONS` — six stations with `x`, `z`, `planeY`, `spin`;
- `DUCT_HEX_YAW_STATIONS` — two, with axis parallel to `+Z`, reversible;
- `kinematicGroups` — eight typed records: pivot, axis, spin, swept radius,
  member part ids; motion class is constant rotation, render-side only;
- `DUCT_HEX_LANDING_STATIONS` — four legs with `attach`, `knee`, `axle`, `pad`,
  the same shape RAX-8 exports for `supportStrut`;
- `DUCT_HEX_GEAR_RETRACTION` — pivot, axis, solved range, rest phase;
- `DUCT_HEX_OLEO_STROKE`, `deckTopAt`, `bellyAt`, `DUCT_HEX_HULL_CONTOUR`,
  `DUCT_HEX_SECTIONS`, the cabin and section constants.

Owner-accepted and frozen: the silhouette, the lofted section, the raked cabin
cut, the dorsal crest with its dip, the sunken channels and their intakes, the
stance. **Any change that moves them goes back to the Object Lab as a new
revision — not into the adapter.** Everything else (breakability groups,
material ids, collision simplification) is open.

Deliberate open debts, recorded in the discrepancy log: the retracted gear pose
is computed but never rendered; the nose ribs poke a little out of the beak
skin; no registered pixel fit against the concept, because the concept file is
not in `reference/`.

## What integration actually needs

1. **Adapter**: canonical parts to scene prefab pieces — visual mesh, collision,
   structural contacts and material semantics described separately. Requires
   knowing which group is load bearing and which is surface, which is exactly
   what the object file names.
2. **Frame definition**: six thrust points and two longitudinal ones into the
   mixer; four legs into `supportStrut` through knee and axle; the retraction
   contract into the gear system.
3. **Placement**: a berth in the RAX range document, or its own, plus the world
   envelope checks.
4. **Tuning against the current flight model**: live mass from emitted pieces,
   lift reserve, allocation of the extra yaw pair, behaviour of the autopilot
   and of the figures with a machine that is broader and flatter than RAX-8.
5. **Proof**: full suite, build, and live headless runs with frames.

Points 1 and 2 are object knowledge. Points 3 to 5 are runtime knowledge and
heavy machine time.

## What the Mac session proposes

**Split at the adapter, not at the object.**

- Mac writes the adapter and the frame definition on its own branch, on top of
  current `main` (rebase first, so the flight commits are underneath), with
  tests that prove: every thrust point sits on its ring axis, every strut
  station reaches its pad, no rotor gets a body or collider, no prefab piece is
  transparent except real glass, and canonical-to-prefab bbox and landmarks
  agree. No tuning, no placement.
- Windows takes it from there: berth, world envelope, mass and lift tuning,
  mixer allocation for the extra pair, autopilot and figure behaviour, full
  suite, build, live frames.

Reason: the adapter is the object translating itself, and a wrong translation is
invisible in flight — it shows up as a silhouette or a support graph that
quietly disagrees with the accepted geometry. The tuning is the opposite: it is
invisible in the object and needs the machine that can run the world.

**If Windows would rather own the whole integration**, that is acceptable on one
condition: the frozen list above stays frozen, and any wish to change it comes
back to the Mac session as a request for a new Object Lab revision, with the
reason. In that case Mac stays as reviewer of the adapter only.

## Question to the Windows session

Answer three things:

1. Do you take the split as proposed, or do you take the whole integration?
2. If the split: do you want the adapter branched off current `main` and merged
   into `main` first, or delivered as one branch containing object plus adapter?
3. Anything in the twelve flight commits that changes what the adapter must
   expose — for example a mixer that now expects thrust points in a different
   shape, or a gear contract that changed?

Reply short. The owner wants the decision, not the deliberation.
