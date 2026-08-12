---
name: reference-faithful-object-study
description: >-
  Research, engineer, implement, validate, test, and render reference-faithful
  3D objects as one canonical geometry before scene/physics integration — both
  real-world types and imagined machines. Use for Object Lab studies of
  vehicles, cars, aircraft, rotorcraft, drones, hexacopters, boats, ships,
  windmills, machines and articulated mechanisms (rotors, wheels, canopies,
  doors, gates, sails, turrets, kinematic groups, swept envelopes), and equally
  for buildings, architectural props, yard or street objects, sheds, pumps,
  furniture, equipment, openings, supports and joints; for ImageGen
  concept-to-geometry, blueprints, measured drawings and multi-angle PNG
  studies; and for quantitative reference registration, overlays, IoU,
  landmarks, multi-view conflicts, solid/manifold/export checks, PBR/material
  and target-renderer parity, named assembly joints and hardpoints, motion/swept
  envelopes, CAD/BREP/STEP/GLB sidecars, physics/visual mapping and repeated
  object-study failures. Triggers:
  ObjectLabModel, objectModel.ts, object lab, evidence card, discrepancy log,
  canonical object, reference manifest, silhouette control, silhouette fit,
  motionConstraints, rotor pivot, swept envelope, cutaway, solid validity,
  assembly datum, model hash and capture manifest.
---

# Reference-Faithful Object Study

Build the asset that will exist in the world, then render that same asset. Never let a generated picture impersonate engineering progress.

## Mandatory reading

Before changing geometry:

1. Read [research-evidence.md](references/research-evidence.md) completely.
2. Read [geometry-construction.md](references/geometry-construction.md) completely.
3. Read [verification-visual-loop.md](references/verification-visual-loop.md) completely.
4. Read [reference-registration.md](references/reference-registration.md) completely when any supplied photograph, drawing, scan, multi-view sheet, concept or existing render is expected to control visual fit.
5. Read [solid-assembly-validation.md](references/solid-assembly-validation.md) completely for vehicles, machines, multi-part assemblies, imported components, closed shells, CAD/BREP/GLB export or runtime physics mapping.
6. Read [surface-material-rendering.md](references/surface-material-rendering.md) completely when material realism, textures/UVs, glass/emission, studio/production rendering, GLB/glTF or target-renderer parity matters.
7. Read [articulation.md](references/articulation.md) completely when the object has any moving part, any historically moving part (even if motion is frozen this milestone), or any kinematic group to bound: rotors, wheels, canopies, leaves, gates, sails, caps, turrets.
8. Read [imagination-pipeline.md](references/imagination-pipeline.md) completely when the object is imagined/fictional or when ImageGen output participates anywhere in the pipeline.
9. If the repository uses `ObjectLabPart`, TypeScript object studies, fixed capture scripts, group filtering, or this Playgate pipeline, also read [object-lab-typescript.md](references/object-lab-typescript.md) completely.
10. Read [casebook.md](references/casebook.md) when the object shares a form or risk with a recorded case. Use its failures as regression tests, not as dimensions for a new object.
11. Use [templates.md](references/templates.md) for the evidence card, reference-fit manifest, solid/assembly audit, discrepancy log, README index and handoff.
12. Read [skill-evaluation.md](references/skill-evaluation.md) completely when modifying this skill or when the same failure class survives two complete discrepancy cycles.

Read [foundation.md](references/foundation.md) completely only when installing, porting, restructuring or extending this skill. It defines the portable architecture and compatibility contract; ordinary object studies should load the operational references above instead.

Also read repository instructions, the object passport, authoring schema, renderer, material bindings, current canonical owner and targeted tests. Direct user constraints and project-local contracts override this skill.

In this repository, also read [`games/make-a-mess/docs/joint-canon.md`](../../../games/make-a-mess/docs/joint-canon.md) before authoring any assembly of two or more bodies. It owns how bodies meet — the three lawful joints, tiling by exact pitch, why only co-facing coplanar faces fight, joinery versus visible interpenetration, and the depth budget that makes an authoring tolerance a function of viewing distance. The magenta gap detector in [geometry-construction.md](references/geometry-construction.md) finds holes in a skin; `tools/joint-audit.mjs` measures the same class numerically once the object is seated in a scene.

## Non-negotiable boundary

- Treat documentary sources, measured drawings and the approved passport as evidence.
- Treat ImageGen, concept art and attractive renders as hypotheses only. Do not derive hidden geometry, dimensions, construction, joints or final acceptance from them. For imagined objects, an owner-selected concept direction owns visual character only — see [imagination-pipeline.md](references/imagination-pipeline.md).
- Render acceptance PNGs only from the canonical geometry that the future adapter/prefab will consume.
- Keep exactly one canonical geometry owner. Tests, captures and later integration must read it; do not redraw parallel versions.
- A Blender scene, CAD/BREP file, STEP, GLB or tracing mesh is never a second hand-edited truth. It is either the explicitly selected canonical owner, a deterministic derivative, or a labelled diagnostic sidecar; record which before work.
- Quantitative image fit is a detector under the evidence hierarchy, never a new authority tier. Masks, IoU, landmarks and overlays may enforce an approved claim but cannot promote concept pixels or perspective distortion into dimensions.
- Do not register, place or adapt the object into the world before explicit visual acceptance unless the user explicitly changes this order. This includes the shared frontend, physics, destruction, contact solver and game movement. An accidental flattering world angle must never be mistaken for a volumetrically correct model — that is exactly why the object stays isolated.
- Never promise that a compiler, adapter or later stage will restore construction that is absent from the canonical model.
- Preserve already accepted objects. Make local corrections only; never rebuild accepted geometry as collateral work.
- A door, window, heart, seat drop, boat interior or ventilation gap is absent material. Never paint darkness or glass over a solid carrier and call it an opening.
- Treat every authored window as a construction assembly: segmented wall void → jamb/head/sill reveals → frame and muntins → ordinary transparent glazing → modelled interior depth. Decorative/fake windows and opaque backing immediately behind glass are forbidden.
- Every visible component needs a carrier and attachment path. Water, shadows, nearby scenery and hidden tolerance must not carry an object.
- **Diagnostic hiding is a camera state.** A named diagnostic view (`cutaway`) may hide whole named groups through that view's `hiddenGroups`; it may never ghost, X-ray, alpha-fade or reduce the opacity of real surfaces, and no diagnostic override is ever written into canonical part materials, prefab data or adapter output. The canonical/world object keeps its complete filled geometry and opaque/full materials. Part-level transparency is allowed only where the real material is physically transparent.
- For a moving object, split the protected scope in four before any work: static geometry / kinematic group geometry / allowed motion / excluded simulation and external couplings. Store the allowed-motion constraint as data in the canonical contract and check it with a test; a chat agreement is not a constraint. See [articulation.md](references/articulation.md).

## Workflow

Follow the sequence. Do not skip directly from a passport to implementation.

### 1. Protect scope and establish the owner

- Inspect dirty files and active work before editing.
- Stop if another agent is actively changing the same canonical file.
- Identify geometry owner, material owner, renderer/capture path, support/contact owner, tests and later integration owner.
- Record the representation policy: code-canonical, CAD-canonical, or code-canonical with diagnostic CAD sidecar. List every derived artifact and forbid parallel edits.
- List accepted components and forbidden files.
- Record the baseline revision, part count, budget and existing test state.
- State local axes, units, front, vertical datum and the meaning of `y = 0`.
- For a moving object, record the four-way split now: static geometry, kinematic group, allowed motion, excluded simulation. Example: a windmill rotor may have only constant rotation about a fixed shaft — that permits neither wind, cap yaw, aerodynamics nor airship coupling. The constraint lives in the canonical contract as data and is proven by a test.

### 2. Research the real type

- Search by local-language technical names, synonyms, regional names, maker/model, museum inventory terms and construction nouns.
- Prefer primary or institutional sources: museum collections, heritage registers, archive photographs, measured drawings, manufacturer catalogues and restoration documentation.
- Collect at minimum front, profile, diagonal, rear/hidden, high/roof and joint/detail evidence when available.
- Separate source authority by feature. A source may establish typology without owning dimensions.
- Download and inspect documentary images at useful resolution when search thumbnails conceal joints.
- Record contradictions and uncertainty. Never silently average sources.
- For an imagined object, follow [imagination-pipeline.md](references/imagination-pipeline.md): generate a coherent multi-view sheet, record the owner's selection and rejections, anchor scale to something the engineering contract owns.
- For named purchasable motors, actuators, bearings, fasteners, connectors or electronics, search manufacturer/authorized geometry before inventing internals; record licence and use a documented interface envelope when no trustworthy model exists.

### 3. Write the evidence card before geometry

Create an evidence card in the repository. It must define:

- identity and source hierarchy;
- local frame and exact/authored envelopes;
- named parts and construction;
- load and attachment paths;
- representation owner and derived/diagnostic artifacts;
- named datums, joints, hardpoints and purchased-component interfaces when present;
- motion contract when any part moves (kinematic group, pivot, axis, range, second state);
- registered-source manifest, calibrated anchors, per-claim view authority and image-fit gates when visual fit matters;
- protected scope;
- rejection conditions;
- invariant → parameter → independent test → fixed camera mapping.

Mark claims `published`, `measured`, `calibrated`, `derived`, `estimated` or `authored`. The passport owns exact values when documentary sources only establish the family.

### 4. Register source views and solve conflicts

When visual sources control fit, complete [reference-registration.md](references/reference-registration.md) before geometry:

- register eligible strict views into the model axis contract and one frozen pixel frame per comparison;
- create structural/negative-space masks and named landmarks;
- compare calibrated shared axes and countable topology across views;
- resolve every contradiction through the evidence hierarchy; never average views or permit view-specific geometry cheats for one runtime object;
- save the manifest and thresholds beside the evidence card.

Generated concepts remain character-only evidence. Registration may enforce approved stance, massing, system count and control lines after passport/physics calibration; it may not invent hidden construction or factual dimensions.

### 5. Decompose the object into constructible parts

Work in this order:

1. contact footprint and datum;
2. primary load-bearing members;
3. silhouette and major negative spaces;
4. floors, walls, shells and roof;
5. moving/attached assemblies — after the kinematic-group boundary is drawn (see [articulation.md](references/articulation.md));
6. functional interior;
7. trim, fasteners and tertiary detail.

Classify the dominant body family of every major mass before detail: shell, faceted loft, annular duct, open truss, drafted torque box/casting, revolved body, bent panel or beam lattice. A wrong family is rebuilt, not polished.

For a lofted body — fuselage, hull, lifting body, nacelle — author the crown,
keel and half-width **tables before any geometry**, and let every member read
them: a body whose section is constant from nose to tail is the failure
geometry-construction.md §3.1 calls the cake. Then panel its skin on the
features the tables describe, because a panel carries the surface only at its
corners and a wide one interpolates the loft away.

For every part, answer:

- What is it physically?
- What is its real section or thickness?
- What carries it?
- What does it intersect or bear on?
- What gap must remain open?
- Which source or authored rule owns it?
- Which test and camera expose a mistake?
- Which named datum/joint/interface places it, and what solid or physics representation owns that relationship?

Choose the least complex primitive that preserves topology. Spend parts on silhouette, openings, support and meaning before texture-like repetition. Do not add detailing until the front, profile and diagonal views are recognizable as the object.

### 6. Implement canonical geometry

- Define shared constants and control points once.
- Derive repeated centers, slopes and lengths mathematically.
- Build endpoint-defined rods and beams from real joints.
- Build tapered, hollow or perforated objects as meshes when cylinders/boxes would falsify topology.
- Keep structural, surface, contents, fittings and hardware groups distinct; keep the kinematic group separate from static geometry with pivot and axis stored once.
- Store part-local frames, mounting planes, hardpoints and rigid/revolute/linear/cylindrical relationships as named source data. Mirrored/repeated assemblies instantiate one parameterized definition.
- Make adjacent parts overlap only where a real joint requires engagement; otherwise share boundaries and avoid z-fighting.
- Keep the ground footprint honest. Carrier bottoms must reach the expected datum.
- Track wall footprint, roof/fixed envelope and kinematic reserve as separate numbers with explicit axes — never merged into one.
- Stay inside per-object and total budgets. Reduce invisible subdivision, never required dimensions or openings.
- Preserve the visual/physics boundary: a visible closed rotor, wheel, fan or linkage does not automatically receive a body/collider, and simplified physics cannot replace visible construction.
- Bind semantic PBR materials only after geometry gates pass; verify UV/texture coverage, color spaces, glass/emissive ownership and target-renderer parity per [surface-material-rendering.md](references/surface-material-rendering.md).

### 7. Write independent tests before trusting the render

Tests must recover values from output geometry rather than restate construction constants through the same helper.

Verify at minimum:

- inventory and budget;
- exact envelope and critical dimensions;
- contact with ground/water datum;
- carrier-to-dependent contact or positive overlap;
- opening emptiness and bounds;
- slope direction and angle;
- attachment chains;
- absence of forbidden closures or unsupported parts;
- absence of forbidden dynamics (the motion contract);
- swept envelope of every moving group over its full allowed range against the union of all static parts;
- unique ids and non-degenerate geometry;
- closed-solid/manifold/winding/component-count validity where the physical part is closed;
- named frame, axis, mate, seating, clearance and mirrored-transform relationships;
- canonical-to-compiled/exported bbox, part-count and critical-landmark agreement when a derivative artifact exists;
- required fixed views.

Let a failing contact test change geometry. Do not weaken it merely to make the suite green.

### 8. Capture the canonical object

- Add the fixed camera matrix from [verification-visual-loop.md](references/verification-visual-loop.md) §5: front, profile, rear, both three-quarters, high three-quarter, joint detail, cutaway, silhouette, plus any second-state view the motion contract requires.
- Hide unrelated groups rather than creating a second model.
- Prefer opaque full-material acceptance views. When hidden construction must be explained, add a clearly named `cutaway` view that hides whole named groups from the same complete model — never ghosting, alpha or a second simplified geometry.
- Pair every cutaway with an external view using identical camera, projection, target, FOV/orthoHeight, mechanism phase, revision and hash, but without `hiddenGroups`. Show both PNGs side by side: the external view accepts silhouette, shell and materials; the cutaway proves internal construction.
- Capture PNGs through the repository renderer from the current canonical revision.
- Ensure every final capture carries the same current model hash/revision.
- Inspect the actual full-resolution PNGs. Passing tests are not visual acceptance.
- For registered reference views, also capture flat material-independent masks in the frozen pixel frame and save metric JSON plus overlays. Beauty views never substitute for fit masks.
- Pair acceptance/character views with a fixed neutral diagnostic-light view that exposes normals, surface continuity, glass boundaries and material mapping. Freeze color management per revision.

### 9. Run the autonomous discrepancy loop

Compare in this order:

1. silhouette and scale;
2. datum and load path;
3. negative spaces;
4. roof/control lines;
5. joints and attachment depth;
6. functional interior;
7. materials and normal response;
8. small details.

For reference-fit work, repair in the stricter dependency order: source/registration conflict → structural count → envelope/silhouette → depth → joints → material boundaries. Prefer model parameters/control points over camera tricks. If the same class survives two full loops, stop patching and revisit the body family, source policy or missing method using [skill-evaluation.md](references/skill-evaluation.md).

For every defect, write: observed symptom → physical cause → owning geometry → correction → recapture result. Correct one class at a time and recapture all views whose model hash changed. Fix the owning profile or control points, never an individual frame.

Typical mandatory stops:

- an opening renders as a decal or false face;
- hardware floats by millimetres;
- a plate or rafter penetrates a roof skin;
- a stair tread is embedded into an unnotched stringer;
- a boat lacks a watertight bottom;
- a support ends in air;
- a camera conceals the object’s defining function;
- a smooth-looking render comes from bad shared normals rather than correct faces;
- a window is only glass/trim placed over an unbroken wall, cladding or roof course;
- window glass or the whole lantern lens emits instead of a separate contained bulb/flame;
- a night source exists without a visible carrier → plate/hook → body → clear lens → bulb/flame chain;
- an exterior mounting plate does not positively overlap its named opaque
  carrier, or overlaps glazing / a door-window clear opening instead;
- a fixture reads only as a bright pixel while its intended wall, path, machine or water edge remains black;
- transparent or emissive diagnostic materials have leaked from a cutaway into the canonical object;
- a moving group’s swept envelope clips a static part anywhere in its allowed range.

### 9.1 Verify authored lighting as construction

When the object includes night lighting, treat it as canonical object geometry,
not a renderer decoration:

- ordinary window glass never emits and never owns a light source;
- a separate physical bulb/flame inside the clear lens owns the light, with the
  source origin at the bulb/flame centre; the containing lens has no source and
  no emissive substitute;
- a wall fixture includes the actual wall/post carrier, mounting plate, arm,
  body/cap, clear lens and contained bulb/flame; a hanging fixture includes
  carrier beam, hook/chain, cap, clear lens and contained bulb/flame;
- independently recover the mounting-plate and carrier bounds. Require
  positive plate/carrier overlap and zero overlap with glazing or a clear
  opening; a close render cannot prove attachment because perspective may hide
  a miss beyond the carrier edge;
- place an interior fixture so its bulb is visible through a real pane without
  sitting behind a mullion, transom or structural member; verify this in a fixed
  full-material exterior night close-up;
- window transmission, bulb emission and surface illumination are three separate checks;
- author a full-material night view; a cutaway remains a second, paired view
  with identical camera parameters and may never be implemented with transparent
  roofs, walls or cladding — the night view does not permit changing shell opacity;
- derive minimum intensity and radius from the material area that must remain
  readable, then save them as lower rejection thresholds in the passport;
- reduce runtime cost with a bounded nearest/grouped light pool, not by lowering
  every source until the place loses its character; never let the first
  optimisation reduce each source to a glowing dot without a readable façade,
  path, machine or water edge;
- in a wide night composition, verify three independent distances: physical
  bulb legibility, real surface-cast radius and shared-pool residency. Reserve
  one real source per required architectural cluster before nearby detail, and
  reject a view in which crossing the world switches an entire cluster dark;
- for reflective scenes, verify the actual scene reflection at water/glass/metal,
  not only a camera-facing glow or emissive billboard;
- keep event/festival floodlighting separate from the everyday baseline.

Record day factor, colour family, intensity, radius, pool group, pool capacity,
intended lit surface and fixed night camera in the evidence card and tests.

### 10. Verify and request visual acceptance

- Run targeted geometry tests and lint after the final edit.
- Run broader type/build checks in proportion to scope; distinguish new failures from known unrelated failures.
- Record final revision, model hash, per-object count and total count.
- Record registered-view residuals and solid/assembly/export gates actually run; do not imply CAD validity, safety or manufacturability when they were not checked.
- Link the evidence card and discrepancy log; keep milestone artifacts per [verification-visual-loop.md](references/verification-visual-loop.md) §12 (revision folder + manifest, evidence card + discrepancy log as records, one README index at the object root, contact sheet).
- Show the actual current PNGs in the final response.
- State explicitly that placement/adapter/prefab registration remains undone.
- Ask for visual acceptance. After acceptance, freeze the object and move to the next one without opportunistic cleanup.

## Fast-model card and machine gate

Before a faster/junior model writes code for a reference-critical object, a short card next to the renders is mandatory (for a first pass it is non-negotiable):

```text
identity:
source -> owned facts:
local axes + human scale:
canonical representation + derived artifacts:
main wall footprint:
complete fixed envelope:
motion envelope:
load path:
named datums/joints/hardpoints:
openings + hinge ownership:
major shell joints:
registered views + fit gates:
solid/export gates:
protected scope:
rejection conditions:
fixed cameras:
```

This is not a mood board. Every countable or dimensional fact must become a named model parameter, an independently recovered test, a fixed camera, or an explicitly labelled authored estimate.

Give a fast model one object per task. Let it build and correct the isolated object, but keep scene compilation behind external visual acceptance. Escalate: a conflict with the source load-bearing topology, a recovered full envelope exceeding its reserve, or the same defect surviving two `render → discrepancy → correction` cycles.

Minimum machine gate before showing PNGs:

- wall, roof and kinematic envelopes recovered separately from final parts;
- every visible opening is genuinely absent from the load-bearing shell;
- every leaf reaches its own hinge and jamb;
- every annex/tower entry into a roof has an open span, support and flashing/collar;
- main load-bearing members end on supports and stay under the finish shell;
- ids unique, geometry non-degenerate;
- lofted surfaces probed by triangle interpolation, not by vertex sampling, and
  the panel chord stated as a tolerance;
- occupant/contents volumes recovered as zones and empty of structure;
- every reviewer verdict from this study carried into a named regression test;
- all fixed cameras show one revision and one hash;
- every eligible registered view has the required mask/overlay/metric report and no unresolved multi-view conflict;
- every intended closed body passes manifold/winding/component-count checks, and every named mate/axis is independently recovered;
- every cutaway has a closed pair with an identical camera, and part transparency is limited to real glass, membrane or another physically transparent material;
- protected systems are neither imported nor simulated.

## Integration gate

After explicit visual acceptance, in order:

1. freeze the accepted revision as the baseline;
2. write the adapter from canonical parts to scene/prefab pieces;
3. describe visual mesh, collision and structural contacts separately;
4. validate canonical-to-adapter/export scale, axes, bbox, semantic groups, pivots and critical landmarks; reimport/round-trip when the format permits;
5. check the material adapter by semantic ids; list all transparent prefab pieces and reject any that is not real glass, membrane or another physically transparent material;
6. check intact and dynamic renderers;
7. prove the support graph and destruction;
8. only then place the prefab in the world and check environment scale;
9. capture a world view set without cancelling the lab set.

If integration requires changing the silhouette, return to the Object Lab and issue a new revision. Never fix the accepted form only in the adapter.

## Decision rules

- If source imagery and passport conflict, preserve the passport’s explicit exact contract and document the visual adaptation.
- If a generated/concept image conflicts with construction evidence, discard the image claim.
- If a generated sheet contradicts itself between projections, disqualify the failing projection for measurements and record which projection each reading came from ([imagination-pipeline.md](references/imagination-pipeline.md)).
- If registered strict views disagree, obey per-claim evidence authority or physics/passport anchors; never declare front view globally canonical and never average a rigid contradiction.
- If a CAD/Blender workflow would introduce a parallel editable model, keep it diagnostic-only or explicitly migrate canonical ownership before work.
- If a solid repair changes feature-scale volume, closes an opening, drops a component or changes a mate, reject it and return to the preserved baseline.
- If a local defect can be fixed without changing accepted topology, make the local fix.
- If the part budget is exceeded, merge hidden or repetitive mass; do not delete the defining opening, support or working element.
- If a joint is invisible in all sources, author the simplest mechanically coherent joint and label it `authored`.
- If a standalone object cannot show a future bank, waterline or terrain drop, encode a named anchor and exact relation; do not add fake map geometry to the object.
- If renderer shading reveals a false wedge, inspect topology, vertex sharing, normals and coplanar overlap before changing lighting or color.
- If hidden construction needs explaining, hide whole named groups in a named diagnostic camera. Never ghost or fade real surfaces; the code-bound asset remains filled and opaque, and actual holes and interiors remain explicit geometry, never alpha-shaped illusions.
- If a night scene is too expensive, first cap/group active local lights and remove
  per-frame fixture motion. Do not shrink radius or intensity below the recorded
  readability threshold as the first optimisation.
- If the user accepts an object, treat its geometry and PNGs as protected immediately.

## Definition of done

An object is ready to show only when:

- evidence hierarchy and uncertainty are written;
- exact parameters and authored choices are distinguishable;
- one canonical model owns code, tests and captures;
- load path and negative spaces are real;
- the motion contract is data, tested, and its swept envelope clears all static parts;
- every critical invariant has an independent test and exposing camera;
- part budgets pass;
- fixed PNGs are current and inspected;
- eligible source views are registered, conflict-resolved and quantitatively compared with current same-revision masks/overlays;
- intended closed bodies, named joints and compiled/exported derivatives pass the applicable validity and round-trip gates;
- semantic materials, closed-surface coverage, texture color spaces, transparent/emissive ownership and target-renderer parity are verified where applicable;
- the discrepancy loop contains no unresolved structural or silhouette defect;
- no world placement or adapter has been created prematurely;
- the user can accept the shown object knowing the same geometry will later enter the world;
- every authored source has a physical fixture and passes its minimum radius/intensity contract;
- full-material day/night views and any paired cutaway use the same canonical parts;
- every window passes the real void/reveals/frame/glazing/interior chain and every
  light passes the clear-lens/contained-bulb ownership chain.
