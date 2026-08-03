# M3 — Het Jonge Schaap-type hexagonal sawmill

Standalone structural object study. It is not registered in a world, the scene
compiler, the support solver, water simulation, or physics.

## Fixed dimensional and mechanical anchors

- sail span: 20.68 m
- rotor hub: +13.70 m
- gallery deck: +5.50 m
- gallery outside diameter: 11.60 m
- hexagonal smock: 8.90 m across flats at its authored base
- complete saw-hall footprint: 13.80 × 20.00 m
- three saw frames, two log carriages and two hoists/winderies
- published transmission ratio: 1:2.44

The local origin is the saw-hall ground datum at its longitudinal zero, Y is
up, and +Z is the rotor/log intake side. The long shed, open twin intake,
carriage rails and logs establish
the production flow before the tower is read as a windmill. The crankshaft,
three crank pins and connecting rods form a visible causal chain to the three
saw frames.

The tower centre is recessed to Z +6.45 m: its six structural corner posts
continue to the saw-hall floor, while the thatched skin begins at the roof
joint. The hall roof is split around that tower and terminates in a named metal
collar. The rotor plane is at Z +11.80 m, at least 0.50 m beyond the complete
front roof envelope; this clearance applies to the full rotation, not only the
authored still phase.

Each intake has two outward-open leaves. Every leaf is built from its own jamb
hinge axis, carries two visible hinges and has a +0.72 m lower edge above the
+0.54 m rail envelope.

The cap, saw frames, carriages and winderies are fixed. Only the sail rotor
contract permits constant rotation; wind and cap yaw are explicitly disabled.

## Rejection conditions

- the tower reads as another octagonal De Kat-type shell;
- the low shed disappears behind a central hill-like mass;
- the front bays are painted black rectangles instead of actual openings;
- the rotating sail envelope touches the hall roof in any phase;
- the tower sits on an uninterrupted roof skin without continuing structure or
  an authored roof collar;
- an intake loses either leaf, a leaf floats away from its hinge axis, or its
  lower edge intersects a carriage rail;
- saw frames become wall ornament without blades, crankshaft or connecting rods;
- log rails stop outside the building instead of crossing the frames;
- one visual centre replaces the asymmetric tower/shed/intake sequence;
- a scene adapter silently enables wind, cap yaw, frame or carriage motion.

All PNG files are rendered from the same canonical object and stamped with the
same model hash. `saw-workflow.png` controls log intake and the open bays;
`crankshaft.png` is a cutaway of the same canonical geometry and controls the
shaft-to-frame chain; `left.png` controls the long, low shed proportion;
`silhouette.png` controls the compound outline.

Regenerate the set from the repository root:

```sh
node --experimental-strip-types scripts/capture-jonge-schaap-object-lab.mjs
```
