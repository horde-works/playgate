# Verification and autonomous visual loop

## Contents

1. Verification layers
2. Independent geometry tests
3. Contact and support tests
4. Opening tests
5. Fixed-camera design
6. Capture discipline
7. Diagnostic views, cutaways and the transparency double audit
8. Discrepancy loop
9. Regression and scope
10. Acceptance reporting
11. Bad validation practices
12. Milestone artifacts and revision records

## 1. Verification layers

Use all three layers:

1. **Contract tests** prove dimensions, counts, topology and anchors.
2. **Rendered inspection** proves silhouette, visibility, normals, intersections and material response.
3. **Integration restraint** proves the accepted object remains canonical and unmodified before placement.

No layer replaces another. A passing mesh can render incorrectly; a good render can hide a missing bottom; a correct object can be damaged by premature adapter changes.

## 2. Independent geometry tests

Tests must inspect emitted parts. Do not call the authoring helper to “verify” values that the helper itself generated.

### Inventory

- count all object parts;
- count defining prefixes/groups;
- assert budget ceiling;
- assert unique ids;
- assert required views;
- assert no forbidden part/group such as `rear-wall`.

### Bounds

Recover bounds by part kind:

- box: center ± half-size;
- cylinder: endpoints plus radius, with axis-aware extents;
- beam: endpoints plus honest cross-section;
- mesh: min/max of vertices;
- rotated box: transform corners or compute projected half-extents.

Measure unions from output parts. Do not trust exported dimension constants alone.

### Angles and lengths

- beam/cylinder length from endpoint distance;
- roof pitch from recovered eave points or rotation;
- lever length from pivot-to-tip chain;
- transom rake from lower/upper control points;
- repeated pitch from sorted centers;
- clear gap from adjacent bounds, including rotation;
- identical radius/contour across repeated elements, recovered rather than assumed.

### Mesh validity

Check:

- non-degenerate triangles;
- finite vertices;
- closed edge use when vertices are shared;
- correct number of disconnected closed prisms when hard-edge duplication is intentional;
- positive volume/orientation when required by runtime;
- hole probe points remain uncovered;
- no duplicate/copied id.

## 3. Contact and support tests

Express support tests as interval relations.

For a dependent and carrier:

- horizontal/plan overlap must be positive;
- dependent bottom equals carrier top for bearing, within floating-point tolerance;
- hardware uses positive depth overlap;
- sloped carriers are checked in the dependent’s or roof’s local frame;
- all primary carriers reach the declared datum.

Test each dependent, not just one representative.

Examples:

- each corner post finds its corresponding cantilever beam;
- each tread finds two stringer ledges;
- each hinge strap intersects both pin and leaf;
- each roof plate endpoint lies within the roof plan and touches the underside;
- each bucket-handle segment shares an endpoint with the next and terminates at the rim.

When a contact test fails, print the part id and the measured residual. Fix geometry first. Change tolerance only when the residual is demonstrably numeric noise.

## 4. Opening tests

### Rectangular opening

Define clear X/Y/Z intervals and assert every shell part has zero/tolerant overlap with at least one interval axis.

Then independently measure the leaf/window/glass bounds.

### Irregular hole

- recover inner-loop or infill bounds;
- assert exact width/height/center;
- probe one or more interior points;
- test front and back layers;
- ensure no hidden full panel occupies the same area.

### Hollow volume

Probe a path or volume, not just one surface:

- bucket center above inner bottom must be empty;
- privy drop must be empty through floor and seat layers;
- boat interior must not contain a full bounding box;
- ventilation gaps must remain positive between repeated parts.

## 5. Fixed-camera design

Every invariant needs an exposing camera.

### Canonical camera matrix

The minimum named set for a full object study:

| View | Projection | What it proves |
| --- | --- | --- |
| front | orthographic | scale, symmetry/asymmetry, principal datums |
| profile | orthographic | true depth, roof, projections, mechanism axis |
| rear | orthographic | hidden mass and construction continuity |
| 3/4 left | perspective | relative placement of systems and overlaps |
| 3/4 right | perspective | the other hidden side and annexes |
| high 3/4 | perspective | roof, plan, joining of volumes |
| joint | perspective close-up | the defining attachment or mechanism |
| cutaway | perspective, hidden outer groups | causal chain of the hidden mechanism |
| silhouette | orthographic | primary form and negative space only |

Mechanism phase, revision and geometry are identical in every frame. Cameras are part of the model: they may not be "improved" each time to flatter the current error. When the motion contract allows a discrete second state (canopy open, gate open), the manifest must also carry the second-state view — see articulation.md §6.

### Front orthographic

Use for:

- width and symmetry;
- door/window bounds;
- vertical datums;
- repeated spacing;
- front-facing fittings.

### Profile orthographic

Use for:

- roof fall;
- cantilever projection;
- bow/stern rake;
- spout and lever projection;
- water/ground relation.

### Three-quarter perspective

Use for:

- depth;
- layer ordering;
- primary support story;
- hardware attachment;
- overall identity.

### Rear/high/underside

Use for:

- hidden opening;
- roof penetration;
- floor/seat/hull bottom;
- beam layout;
- interior function.

### Detail

Use for one reference-critical joint: heart cutout, ring bracket, stair notch, pump pivot, bucket interior.

Do not create a flattering camera that hides the risky side. The camera exists to falsify the model.

## 6. Capture discipline

- Capture with the repository renderer, not a manually reconstructed scene.
- Filter unrelated groups through the canonical model’s view system.
- Use deterministic camera ids and positions.
- Print revision and a short model hash on every frame. The hash answers exactly one question — "is this the same object in all frames?" — it proves neither similarity to the reference, constructive truth nor silhouette quality.
- After any geometry/material change, recapture every delivered view so hashes match.
- Verify each delivered file is genuinely a PNG of the expected type and non-trivial size; a zero-byte or truncated capture passes a filename check and fails review.
- Confirm capture completion; long capture scripts may yield a session before the final view.
- Inspect files at original resolution.
- Preserve accepted PNGs for other objects.
- Do not overwrite evidence/reference images with canonical captures.

Before review, record:

- revision;
- model hash;
- view ids;
- image paths;
- capture time/manifest;
- per-object part count.

## 7. Diagnostic views, cutaways and the transparency double audit

Transparency is not an object property unless the documented real material is physically transparent. A dark reveal, a door niche, an interior shadow or a designer's X-ray never compiles as glass.

**Diagnostic hiding is a camera state.** A named diagnostic view (`cutaway`) may hide whole named groups through that view's `hiddenGroups` — and nothing else:

- keep the complete canonical part inventory loaded; the cutaway is the same object with named shells hidden, never a second simplified geometry;
- never ghost, X-ray, alpha-fade or reduce the opacity of real surfaces; never cut them with clipping planes; never displace parts into an exploded arrangement; never substitute schematic stand-ins for the interior; never move nodes for the shot;
- the view must be explicitly named `cutaway` (or an equally unambiguous diagnostic id) and may not replace any ordinary exterior view;
- pair every cutaway with a mandatory external projection: same camera position, projection, target, FOV/orthoHeight, mechanism phase, revision and hash, but without `hiddenGroups`. Show the user both PNGs side by side — the external view accepts silhouette, shell and materials; the cutaway proves internal construction;
- keep the canonical material binding and later world adapter filled and opaque;
- test that no diagnostic override of any kind is stored in canonical part data, default material overrides, prefab data or adapter output;
- test that diagnostic hiding does not become a missing wall, roof, hull bottom, bucket stave or other absent runtime geometry;
- preserve real negative spaces as geometry: a hole remains a hole in the opaque view, while a solid carrier remains solid in every view.

Reject the asset if a diagnostic view is the only view that explains construction, if the opaque counterpart exposes a false closure, or if the world-bound code inherits any diagnostic state. "Shown open for information" always means "delivered filled in code."

### Transparency double audit

Run two independent audits; neither substitutes for the other:

1. **Material audit** — enumerate every material with opacity/transmission. Each transparent canonical part must have a physically transparent prototype in the real object (glass, membrane, lens). Anything else on the list fails: wood stays wood, opaque cladding stays opaque, a dark opening is not glass.
2. **Culling/winding audit** — a closed opaque mesh shell must be watertight with outward winding (positive signed volume); an open roof/panel must present an outward normal. A single-sided surface with inward-facing triangles disappears from exterior views and is visually indistinguishable from transparency, yet no material audit will ever find it. Check both the canonical indices and the compiled/adapter output.

`doubleSided` is never a fix for wrong winding: it hides the symptom while keeping wrong lighting and paying extra render cost.

## 8. Discrepancy loop

Create a discrepancy log after the first current capture.

Review in strict order:

1. silhouette/envelope;
2. ground/water contact;
3. major negative spaces;
4. roof and control-line direction;
5. support/load path;
6. attachment depth;
7. working geometry/interior;
8. material boundaries;
9. normals, z-fighting and false highlights;
10. tertiary detail.

For each discrepancy write:

- **view and symptom**: what is visibly wrong;
- **contract violated**: evidence-card invariant;
- **physical cause**: missing part, wrong interval, topology, normal, camera;
- **owner**: exact constant/helper/part group;
- **correction**: minimal geometry change;
- **regression test**: new or strengthened test;
- **recapture result**: pass/fail and current hash.

Do not fix one view by moving geometry away from another. Re-check all relevant views.

### Visual signals and likely causes

| Signal | Investigate |
| --- | --- |
| bright/dark triangle on planar face | nonplanarity, concave fan triangulation, shared normals, overlap |
| hardware seems pasted | no depth engagement, excessive normal offset |
| roof has longitudinal ridges | rafters/plates cross upper skin |
| object appears to float | carrier bottom, shadow-only support, wrong datum |
| opening looks white/filled | back surface, floor, double-sided face, background exposure |
| side profile generic | wrong taper, missing projection, camera too high/low |
| object meaning unclear | functional part hidden or omitted |

## 9. Regression and scope

After each correction:

- rerun the full targeted file, not only the new test;
- run lint on every modified code/test file;
- confirm accepted object part counts and tests remain unchanged;
- check total ensemble budget;
- inspect git status only for scoped files;
- avoid formatting/reordering unrelated canonical geometry;
- never register a prefab just to view the object.

If broader type checking has known unrelated failures, report them precisely and keep targeted validation clean. Do not alter protected accepted objects to silence unrelated errors.

## 10. Acceptance reporting

The handoff must lead with the result:

- object identity and exact critical dimensions;
- what is real geometry rather than visual implication;
- part count/object budget and total budget;
- tests and lint result;
- reference roles and links;
- explicit statement that world placement/adapter remains absent;
- actual current PNGs in meaningful order;
- direct request for visual acceptance.

After the user accepts:

- mark the object protected;
- do not adjust it during the next object;
- update the working plan;
- continue with the next passport.

## 11. Bad validation practices

### “Looks okay from one angle”

Why bad: front view can hide missing depth and detached Z offsets.

Use: front + profile + diagonal + risky hidden/detail view.

### “Tests pass, so done”

Why bad: normal interpolation, z-fighting and camera visibility are renderer facts.

Use: inspect current PNGs and write discrepancies.

### “Render is pretty, so geometry is done”

Why bad: a shadow can imply support; a dark face can imply a hole.

Use: output-geometry tests for contact and emptiness.

### “Increase tolerance”

Why bad: converts a physical gap into a green check.

Use: report residual, correct the interval, reserve tolerance for numerical error.

### “Patch the screenshot”

Why bad: image no longer corresponds to the future world object.

Use: change canonical geometry and recapture.

### “Register it to see it”

Why bad: mixes asset acceptance with placement/material-runtime risks.

Use: isolated Object Lab until explicit approval.

## 12. Milestone artifacts and revision records

One convention for every object study; do not fork it per object.

- **Folder per revision**: `docs/<object>/<rev>/` (e.g. `m1`, `c2`) holds the capture set plus a `manifest.json` with `modelId`, `revision`, `modelHash`, `generatedAt` and the `views[]` inventory (id, label, projection, file). The manifest is the same-revision proof for the whole set.
- **Canonical records** live at the object docs root, not inside milestone folders:
  - `evidence-card-<NN>-<object>.md` — requirements, source hierarchy, invariants, rejection list;
  - `discrepancy-log-<rev>.md` — observed/fixed differences per revision, including the owner's acceptance verdict and date.
- **No per-milestone README.** Process narration inside milestone folders drifts into a second, unowned copy of the evidence card. Existing per-milestone READMEs (SR-6 m1–m9 style) are history; do not add new ones.
- **One `README.md` index at the object root** — a short table of revisions: which exist, which is accepted, links to the records and the canonical owner file. Template in templates.md §6.
- **Contact sheet** — `overview.html` plus a rendered `overview-sheet.png` per revision is a recommended artifact: one page with every fixed view at a glance is the cheapest way for the owner to compare revisions. The practice existed through SR-6 m6 and silently died; revive it for new studies.
- Reference imagery (concept sheets, selected crops, documentary photos) lives in `docs/<object>/reference/` and is never mixed into capture folders or overwritten by captures.
