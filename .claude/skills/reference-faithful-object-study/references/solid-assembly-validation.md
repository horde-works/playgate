# Solid, assembly and runtime validation

## Contents

1. Representation policy
2. Body family before detail
3. Named datums, joints and hardpoints
4. Purchased components
5. Geometry validity gates
6. Assembly and contact gates
7. Physics and renderer separation
8. Repair ladder
9. Export and round-trip checks
10. Reporting and failure modes

## 1. Representation policy

The repository contract chooses the canonical owner. In Playgate Object Lab,
the TypeScript `ObjectLabModel` remains canonical unless the owner explicitly
approves a different pipeline. Do not import a Blender, STEP or BREP workflow
and create a second hand-edited truth.

Allowed patterns:

- code-authored mesh/parts are canonical; PNG, GLB and collision data are
  deterministic derivatives;
- a CAD/BREP generator is explicitly chosen as canonical; render/runtime
  meshes and adapters derive from its revision;
- a CAD model is a disposable diagnostic sidecar used to check fit or section,
  while the repository model remains canonical.

Record the selected pattern in the evidence card. Every artifact carries the
canonical revision/hash or an explicit `diagnostic-only` label.

Solid validity proves geometric coherence; it does not prove structural
safety, certified airworthiness, manufacturability or correct game physics.

## 2. Body family before detail

Classify each dominant mass before adding seams, fasteners, fillets or panels:

- faceted loft or monocoque shell;
- thin-walled cover/housing;
- cored annular duct or nacelle;
- open truss/spoked/windowed frame;
- drafted casting or torque box;
- revolved/axisymmetric part;
- bent sheet/panel assembly;
- beam/rod lattice.

Build and validate the dominant family first. A valid closed slab is still
wrong when the reference requires an open truss; fillets cannot repair the
category error.

After the first valid render, name the single largest body-family mismatch. If
it is structural, rebuild the owner rather than accumulating cosmetic cuts.

## 3. Named datums, joints and hardpoints

Every assembly-level relationship starts from named local data:

- part-local origin and axes;
- mounting face/plane;
- bolt or shaft axis;
- hinge/pivot/slider axis;
- bearing/contact plane;
- aerodynamic or physics station;
- carrier and dependent ids;
- required offset, engagement and clearance.

Use the simplest joint contract that expresses the relationship:

- rigid: seated/bolted/bonded attachment;
- revolute: hinge, rotor, wheel or control surface;
- linear: slider, strut or latch;
- cylindrical: coupled axial/rotational motion;
- ball/gimbal: spherical orientation.

The joint is source data, not a visually inferred transform. For moving parts,
its pivot/axis/range must be the same owner read by articulation, swept-envelope
tests and the renderer.

For every visible dependent, preserve the complete path:

`datum → carrier → interface/doubler/saddle → fastener/bearing → dependent`.

## 4. Purchased components

Before inventing a named motor, bearing, actuator, fastener, connector or
electronics package:

1. search manufacturer data or an authorized STEP model;
2. record source, version, dimensions and licence;
3. inspect its actual origin, axes, mounting faces and bolt pattern;
4. validate the authored mate against measured datums;
5. if no trustworthy model exists, use a documented keep-out envelope and
   interface, not fabricated internal detail.

Do not commit or redistribute third-party geometry without compatible rights.
A purchased model may own its envelope/interface while the visible shell stays
an authored low-budget representation.

## 5. Geometry validity gates

Run gates on emitted canonical geometry and again on compiled/exported output.

### Universal part gates

- finite coordinates and positive semantic dimensions;
- non-degenerate faces/triangles;
- unique stable ids and labels;
- correct winding/orientation;
- no unintended duplicate/coplanar surfaces;
- expected connected-component/solid count;
- recovered bbox, area/volume sanity and centre of mass when applicable;
- no self-intersection or non-manifold edge where a closed solid is required;
- real openings remain open through every layer;
- intended thin sheets are explicitly classified and two-sided only when real.

### Closed mesh gates

- every undirected edge belongs to exactly two triangles;
- signed volume has the expected positive orientation;
- no zero-volume shell or mixed orphan face beside a valid solid;
- disconnected solids are intentional named parts, never silently selected or
  discarded.

### Optional BREP/CAD gates

- kernel validity check passes;
- expected solid/shell count and positive volume;
- booleans changed face inventory and volume in the intended direction;
- holes/bosses/bores match named diameters, depths and axes;
- exported STEP reimports with the same bbox, solid count and near-equal volume.

An in-memory pass is a screen; the round-trip artifact is the export verdict.

## 6. Assembly and contact gates

For each named interface verify independently:

- frame/axis orientation;
- flush, centred, coaxial or offset relation;
- positive seating/engagement where required;
- clearance where movement or airflow requires it;
- no unintended interpenetration;
- fastener/pin/bearing overlaps both sides it connects;
- repeated/mirrored assemblies recover equal/opposite transforms from output;
- load path reaches the body and declared datum.

Run before/after geometric diff for local repairs that could affect unrelated
parts. Compare changed regions, bounds and volume; do not use file size as a
geometry diff.

## 7. Physics and renderer separation

Never let CAD validity dictate Playgate physics by accident. Describe three
independent representations:

1. **visual/canonical construction** — visible parts, negative spaces,
   materials and named joints;
2. **physics/contact model** — bodies, colliders, mass/inertia, aerodynamic or
   propulsion stations and support graph;
3. **render-only articulation** — members whose pose changes visually while
   physics must not receive a new collider/body.

Map between them explicitly. A watertight visual rotor, wheel or fan does not
authorize a collider; articulation.md's runtime rules still win. Likewise a
simplified physics hull cannot replace visible load paths or close visual air
gaps.

For aircraft/vehicles, also verify:

- centre-of-mass and thrust/control stations use physics-owned coordinates;
- visual nacelle/rotor centres coincide with their authored stations;
- protective structure does not enter swept discs or intake/exhaust volumes;
- damage groups and support paths remain semantically named after export;
- decorative skin is not the only physics carrier unless explicitly designed
  as a monocoque and supported by the project contract.

## 8. Repair ladder

Never stack speculative repairs on an invalid result. Preserve a valid/baseline
revision, try one rung, validate it, and return to baseline before the next.

1. **Fix the source construction**: wrong profile, zero thickness, failed
   boolean, tangent/coplanar union, mixed winding.
2. **Rebuild the local feature** from its named boundary/control points.
3. **Clean topology locally**: merge true duplicates, remove orphan faces,
   retriangulate a bounded bad patch, recompute deliberate hard normals.
4. **Kernel repair candidate** when using BREP: orientation/shape fix followed
   by strict bbox/volume/feature comparison.
5. **Defeature and reconstruct** only the defective bounded feature; prove no
   bore, opening or interface disappeared.
6. **Replace the dominant representation** when the same failure survives two
   loops or the body family is wrong.

Reject a repair if it changes a real feature-scale volume, closes a negative
space, drops a solid, changes an interface or merely hides the problem with
double-sided rendering, smoothing or tolerance inflation.

Prevent common defects:

- give fused structural features deliberate engagement, not tangent contact;
- prefer shared exact boundaries or one controlled boolean over coincident
  duplicate faces;
- cut through with margin when a through-opening is intended;
- verify every boolean through topology and volume delta;
- apply cosmetic fillets last and revalidate functional interfaces afterwards.

## 9. Export and round-trip checks

Before integration/export:

- apply only transforms that preserve the declared local frame;
- preserve semantic names, groups, materials and kinematic pivots;
- verify scale/units, handedness and up/front axes;
- inspect normals and tangents in the target renderer;
- compare canonical and exported bboxes, part counts and critical landmarks;
- reimport GLB/STEP when the format permits and rerun validity;
- render the exported/compiled artifact in at least the canonical orthographic
  and one diagnostic three-quarter view;
- record source revision/hash and export tool/version.

An adapter may simplify or combine draw calls only within an explicitly tested
mapping. It may not repair, reshape or invent the accepted silhouette.

## 10. Reporting and failure modes

Report only checks actually run. Distinguish:

- canonical geometry validity;
- optional CAD/BREP validity;
- exported/compiled validity;
- assembly fit checks;
- physics mapping checks;
- claims deliberately not made.

| Failure | Correction |
| --- | --- |
| valid solid, wrong body family | rebuild dominant construction |
| imported part floats despite matching bbox | inspect local frame and named mate |
| boolean returns unchanged topology | treat as failed; repair source/tool overlap |
| heal passes in memory, fails after export | round-trip is authoritative |
| collider added for every visible moving part | restore visual/physics separation |
| STEP and TypeScript both hand-edited | choose one canonical owner |
| fillet changes bore or joint | remove/reduce fillet and revalidate interface |
| one good solid selected from mixed debris | reject mixed topology; repair complete output |

## Method provenance

The source-first mating, inspection and diff practices are adapted from the
MIT-licensed `earthtojake/text-to-cad` CAD skill. The validity/repair ladder and
round-trip principle are adapted at the method level from the Apache-2.0
`pzfreo/build123d-mcp` skills. Playgate's canonical-model, articulation,
physics and budget contracts take precedence over both donor pipelines.
