# Playgate TypeScript Object Lab playbook

## Contents

1. Required repository reading
2. Canonical object schema
3. File and scope rules
4. Group and material semantics
5. Authoring patterns
6. Tests
7. Views and capture
8. Evidence artifacts
9. Commands and acceptance
10. Playgate-specific traps

Use this reference only when the repository contains the Playgate `games/make-a-mess` Object Lab pipeline or a materially identical schema.

The Object Lab is a separate minimal page/renderer. It imports neither the world, the scene compiler, physics nor runtime systems; it reads the canonical object directly and shows materials with the same physical semantics and optical class the prefab will get.

## 1. Required repository reading

Before the first edit, read:

- repository and nested `AGENTS.md` / `CLAUDE.md`;
- `games/make-a-mess/docs/architectural-authoring.md` (includes the exact
  geometry rules formerly in `geometry-lessons.md`);
- the current object brief/passport;
- relevant sections of `games/make-a-mess/docs/dutch-polder-siting-brief.md`;
- `games/make-a-mess/src/content/objects/dutchWindmills/objectModel.ts`;
- the current canonical object file;
- `scripts/object-lab-capture.mjs` and the object’s capture wrapper;
- targeted tests.

Read `games/make-a-mess/src/content/prefabs/dutchPolderPrefabs.ts` only to understand future group/material semantics. Do not modify or register before visual acceptance.

The former repo norm `games/make-a-mess/docs/object-study-authoring.md` is fully merged into this skill; do not look for it.

## 2. Canonical object schema

The canonical geometry is an `ObjectLabModel` containing `parts` and `views`.

Supported part kinds:

- `box`: `center`, `size`, optional `rotation`;
- `beam`: `from`, `to`, `width`, `depth`;
- `cylinder`: `from`, `to`, `radius`, `radialSegments`;
- `mesh`: `vertices`, `triangles`, optional `doubleSided`.

Use metres at 1:1. Default land-object coordinates:

```ts
coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" }
```

Document exceptions such as a boat whose origin is the light-ship waterline.

The model also carries `dimensions`, `labMetrics`, named `anchors`, per-view `hiddenGroups`/`lighting`, and two motion fields: the typed `rotor` contract (`pivot`, `axis`, `fixedPhaseDegrees`, `motion`, `windCoupling`) and the untyped `motionConstraints` bag. For any new moving part follow articulation.md §5: typed pivot, axis and range — a bag of booleans is a comment, not a contract.

Keep one mutable `parts` array local to the canonical file and add typed helpers only when they reduce repeated errors. Avoid adding a second geometry model for capture.

Blender, STEP/BREP and GLB files do not become parallel editable owners. For
Playgate, keep them deterministic derivatives or `diagnostic-only` sidecars as
defined by solid-assembly-validation.md unless canonical ownership is explicitly
migrated before work.

## 3. File and scope rules

For the Dutch yard kit:

- large standalone shed study: its own canonical file and capture wrapper;
- smaller yard objects: groups inside `dutchLandscapeKitObject.ts`;
- evidence cards and discrepancy logs: `games/make-a-mess/docs/dutch-polder/yard-kit-reference/`;
- canonical captures: `games/make-a-mess/docs/dutch-polder/landscape-kit/` or the object-specific documented output root;
- tests: `tests/dutch-landscape-kit.test.mjs` or the standalone object’s own test.

Protected until explicit acceptance:

- `dutchPolderDocument.ts`;
- terrain graybox;
- routes, parcels and reserves;
- prefab definitions and scene adapters;
- accepted object geometry and PNGs.

Inspect dirty status before edits. Existing changes belong to the user/other agents unless proven otherwise.

## 4. Group and material semantics

Group names are not cosmetic. Runtime helpers may infer load-bearing and attachment behavior using regular expressions.

Before naming groups, inspect `isSurfacePart()` and `mappedBase()` in the prefab pipeline. In the current project, names containing patterns such as `cladding`, `trim` or `roof-skin` are likely nonbearing. Some post/stem names may be forced bearing.

Recommended families:

```ts
const objectGroups = [
  "object-primary",
  "object-frame",
  "object-floor",
  "object-cladding",
  "object-hardware",
  "object-roof-skin",
] as const;
```

Add every group to `allGroups`, otherwise `hiddenExcept()` views leak or hide the wrong geometry.

Export accepted object parts through one group filter:

```ts
export const dutchLandscapeObjectParts = parts.filter((part) =>
  objectGroups.includes(part.group as typeof objectGroups[number]),
);
```

Use the established `ObjectMaterialId` palette. Current useful ids include:

- `timber-dark`: tarred/dark structural timber;
- `timber-mid`: ordinary wood;
- `cladding`: Zaan green finish;
- `paint-light`: light trim;
- `roof-dark` / `roof-warm`;
- `brick`, `stone`, `metal`;
- `soil-bed`, `shell-path`, `grass`.

Adding a new material id requires every type and runtime binding. Prefer no new id for a small object.

## 5. Authoring patterns

### Constants and exports

Define internal geometry constants close to construction. Export acceptance-critical constants after all geometry families:

```ts
export const DUTCH_OBJECT_WIDTH = objectWidth;
export const DUTCH_OBJECT_HEIGHT = objectHeight;
```

Expose them in `dimensions`, `labMetrics` when useful and named `anchors`.

Dimensions metadata does not replace geometry tests.

### Revision

Increment the canonical revision only for a coherent object revision, for example:

```ts
revision: "landscape-kit-a12-2026-08-04"
```

All recaptured PNGs must show the final same revision/hash.

### Source notes

Add one concise note explaining:

- what documentary sources establish;
- what the passport owns exactly;
- which hidden/detail decisions are authored.

Keep full source analysis in the evidence card.

### Mesh helpers

Common useful helpers:

- extruded planar face;
- tapered cylinder/frustum;
- open stave bucket/barrel;
- cylindrical shell/hoop;
- faceted cap;
- forged ring;
- stepped/notched stringer;
- ribbon prism for hull sides.

When hard normals matter, duplicate vertices by face or split broad faces from reveal/side geometry. Object Lab calls normal computation; shared vertices can create false gradients across real creases.

### Part budget

The current eleven-object yard-kit total ceiling is `600`. Track:

```js
console.log({ totalParts: model.parts.length, objectParts: objectParts.length });
```

Per-object passport ceilings are rejection conditions. A final `15 / 15` object must not gain one decorative part without merging something less important.

## 6. Tests

Import the object parts export and critical constants in `tests/dutch-landscape-kit.test.mjs`.

Reuse only generic independent measurement helpers such as:

- `distance(a, b)`;
- `approx(actual, expected, tolerance)`;
- `meshBounds(part)`;
- `boxBounds(part)`;
- interval overlap;
- rotated-box local transform.

Do not import or call authoring helpers from the model.

Test names can be Russian; code and ids remain English.

Minimum per object:

1. `parts.length <= budget`;
2. exact defining prefix counts;
3. recovered dimensions/envelope;
4. datum contact;
5. load/attachment overlaps;
6. real opening/hollow probe;
7. required views;
8. total unique/non-degenerate suite remains green.

For machines/vehicles/closed shells add applicable gates from
solid-assembly-validation.md: closed-edge use and signed volume, intended
component count, named hardpoint/mate relations, mirrored transform recovery,
visual-to-physics station alignment and canonical-to-compiled bounds/landmarks.

Run:

```sh
node --test --experimental-strip-types tests/dutch-landscape-kit.test.mjs
npx eslint games/make-a-mess/src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts tests/dutch-landscape-kit.test.mjs
```

Run `npx tsc --noEmit` for acceptance when project scope requires it. Report pre-existing failures without modifying accepted unrelated work.

## 7. Views and capture

Add view records to the canonical model:

```ts
{
  id: "object-three-quarter",
  label: "Object · support and defining function",
  projection: "perspective",
  position: point(3, 2.4, 4),
  target: point(0, 0.8, 0),
  fov: 30,
  hiddenGroups: hiddenExcept(objectGroups),
}
```

Use orthographic front/profile for dimensions. Use perspective for construction and details.

Capture selected views without modifying the wrapper:

```sh
PLAYGATE_CAPTURE_VIEWS=object-front,object-profile,object-three-quarter \
  node --experimental-strip-types scripts/capture-dutch-landscape-kit-object-lab.mjs
```

The capture command can return a continuing session. Wait/poll until every requested view prints `captured ...`.

Inspect PNGs with the local image viewer at original resolution. Do not rely on file existence.

When a registered source view controls fit, capture a flat silhouette in its
frozen pixel frame and run the bundled `scripts/reference_fit_report.py`. Use
prepared masks for annotated/concept sheets; thresholding is only a first pass.
Save JSON and overlay with the revision artifacts. Run
`scripts/view_constraint_report.py` before geometry when calibrated strict views
share physical axes.

Capture output updates `manifest.json`. Verify `modelId`, `revision`, `modelHash` and view inventory.

## 8. Evidence artifacts

Create, at the object docs root:

- `evidence-card-<NN>-<object>.md` before geometry;
- `discrepancy-log-<rev>.md` after the autonomous visual loop.

Do not use per-milestone README files for process records. Maintain exactly one `README.md` index at the object docs root listing revisions and the accepted one (template in templates.md §6), plus the recommended `overview.html` / `overview-sheet.png` contact sheet per revision. Full convention: verification-visual-loop.md §12.

Evidence cards own requirements; discrepancy logs own observed/fixed differences. Neither is canonical geometry.

## 9. Commands and acceptance

Useful read-only final audit:

```sh
node --experimental-strip-types -e "import('./path/to/object.ts').then(({ model, objectParts }) => console.log({ revision: model.revision, total: model.parts.length, object: objectParts.length }))"
git status --short -- <scoped paths>
```

Final response must embed local PNGs with absolute paths so the Codex app renders them.

Do not stage, commit, register or place unless explicitly requested.

## 10. Playgate-specific traps

### `allGroups` omission

Effect: unrelated objects appear in a supposedly isolated view.

Prevention: add new groups before calling `hiddenExcept()`.

### Group regex changes physics

Effect: cladding carries load or a structural member becomes surface-only.

Prevention: inspect mapping functions and name groups semantically.

### Cylinder size misunderstanding

Effect: wrong height/diameter when reasoning from box sizes.

Prevention: cylinders are defined by endpoints and radius; converter derives length.

### Ground footprint mismatch

Effect: later placement reads a floating or overly large contact footprint.

Prevention: know `dutchPolderGroundFootprint` threshold and ground only real carriers.

### Capture hash drift

Effect: delivered views represent different model revisions.

Prevention: recapture all delivered views after the last change and compare stamps/manifest.

### Premature prefab registration

Effect: visual iteration becomes entangled with runtime material/support mapping and world placement.

Prevention: accept in Object Lab first; adapter is a separate phase.

### Dirty shared canonical file

Effect: one object change accidentally rewrites accepted work or another agent’s WIP.

Prevention: local patches, scoped diff/status, no broad formatter, stop on overlapping active work.
