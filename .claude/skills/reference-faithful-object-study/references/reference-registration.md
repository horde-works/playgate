# Quantitative reference registration and fit

## Contents

1. Purpose and authority boundary
2. Reference manifest
3. Projection and calibration contract
4. Masks, parts and landmarks
5. Multi-view consistency gate
6. Fit stages and metrics
7. Correction loop
8. Generated-image adaptation
9. Deterministic helper scripts
10. Failure modes

## 1. Purpose and authority boundary

Use this reference whenever a photograph, measured drawing, blueprint,
orthographic sheet, scan, generated concept or existing render is expected to
control the visible result.

Quantitative image comparison is a **detector**, not a new source hierarchy.
It answers whether the current canonical object satisfies claims already
authorized by the evidence card. It never promotes an uncalibrated image,
perspective view or generated concept into dimensional truth.

Keep these layers separate:

- source authority: which input owns each claim;
- registration: how a source pixel frame maps to model axes and scale;
- geometry: the one canonical owner that can be corrected;
- validation: masks, landmarks, overlays and numeric residuals recovered from
  renders of that owner.

Never change camera scale, crop or projection to hide wrong geometry. Camera
registration is frozen before fit scoring; geometry changes after that.

## 2. Reference manifest

Write a machine-readable manifest beside the evidence card before geometry
when image fit matters. A minimal contract is:

```json
{
  "schema": "reference-fit-manifest.v1",
  "canonicalPolicy": "claim-authority-matrix",
  "sources": [
    {
      "id": "profile-drawing",
      "path": "reference/profile.png",
      "role": "measured-drawing",
      "view": "profile",
      "projection": "orthographic",
      "owns": ["roofLine", "overallHeight"],
      "cannotOwn": ["hiddenStructure"],
      "calibration": {
        "modelAxis": "Z",
        "value": 6.4,
        "pixelEndpoints": [[183, 812], [1412, 812]]
      }
    }
  ],
  "structuralParts": ["survival-cell", "lift-duct-1"],
  "validationOnly": ["caption", "dimension-lines", "background"],
  "landmarks": [],
  "gates": {
    "bboxCenterDriftMax": 0.015,
    "bboxSizeDriftMax": 0.03,
    "silhouetteIouMin": 0.90
  }
}
```

For every source record:

- local path and provenance URL;
- authority tier and owned claims;
- view direction and projection type;
- crop, distortion correction and calibration anchor;
- structural, decorative and validation-only regions;
- known contradictions and disqualified readings.

Do not use one global `primaryView` as a shortcut when different views own
different claims. The evidence-card claim matrix is canonical.

## 3. Projection and calibration contract

Normalize each strict view into the model coordinate contract:

| View | Image axes | Model axes normally constrained |
| --- | --- | --- |
| front | horizontal / vertical | X / up |
| profile | horizontal / vertical | depth / up |
| top | horizontal / vertical | X / depth |
| rear | horizontal / vertical | X / up |

Record actual camera direction, handedness and image-axis flips. Never assume a
sheet uses the repository's front convention.

Calibration order:

1. printed/published dimension;
2. calibrated internal anchor owned by the passport or physics;
3. explicit model datum shared across views;
4. authored alignment used only for visual-character comparison.

Correct scan anisotropy independently per projection. Never mix pixel scales
from two scans. For perspective photographs, calibrate only features in a
defensible plane or use camera matching; do not score them as orthographic
silhouettes.

Freeze and record for each comparison:

- source crop and image size;
- model-to-pixel transform;
- camera position/target/projection/FOV or ortho height;
- mechanism phase;
- visible and hidden canonical groups;
- revision and model hash.

## 4. Masks, parts and landmarks

### Masks

Prefer explicit masks created from the source over thresholding a beauty
image. Keep separate masks for:

- complete structural silhouette;
- named major systems;
- real negative spaces;
- decorative/livery boundaries;
- captions, guide lines, aura, background and other validation-only context.

If automatic segmentation merges touching systems, use named seed rectangles,
polygons or seed points. Ambiguity is recorded; it is never silently merged.
Part count disagreement is a source conflict, not a segmentation nuisance.

### Named landmarks

Use semantic landmarks after broad silhouettes are stable:

- structural extrema and control-line breaks;
- joint centres, pivots and hardpoints;
- opening corners and duct/ring centres;
- canopy, glazing or livery transitions;
- depth stations visible in profile/top views.

Each landmark record contains source id, view, name, class, pixel coordinate,
model owner and tolerance. A raw contour point with no semantic owner is not a
repair instruction.

## 5. Multi-view consistency gate

Before modelling or rebuilding, test whether strict views can describe one
rigid object.

Compare shared physical axes after calibration:

- front width ↔ top width ↔ rear width;
- front/rear height ↔ profile height;
- profile depth ↔ top depth;
- repeated centres and part counts across every view that shows them.

If residuals exceed the evidence-card tolerance, stop and choose one explicit
resolution:

- a dimensioned/authoritative view owns the disputed axis;
- the passport or physics anchor owns it;
- the source needs correction;
- a weak projection is disqualified for measurement;
- separate presentation variants are permitted, explicitly **not** one rigid
  runtime object.

Never average contradictory projections. Never permit view-specific geometry
cheats for an asset that will enter the world as one rigid object.

## 6. Fit stages and metrics

Fit in dependency order:

1. registered camera and datum;
2. complete envelope and silhouette;
3. major negative spaces and system count;
4. body-family/control-line landmarks;
5. depth from profile/top/rear;
6. joints and attachment paths;
7. material/livery boundaries;
8. tertiary detail and look.

Use material-independent flat silhouettes for geometry scoring. Beauty renders
remain necessary for material and normal inspection but are poor masks.

Minimum metrics per eligible strict view:

- bounding-box centre drift, normalized by image width/height;
- bounding-box width/height drift;
- centroid drift;
- silhouette intersection-over-union;
- named landmark residuals;
- exact structural part count;
- negative-space mask overlap where the source truly owns the opening.

Thresholds belong in the manifest and evidence card. Defaults such as 1.5%
centre drift, 3% front size drift and 0.90 IoU are starting points, not laws.
A project may need tighter dimensional gates or looser stylized-character gates.

## 7. Correction loop

For every failing view:

1. verify source authority, mask and registration;
2. classify the residual as camera, envelope, topology, part, landmark,
   material or renderer failure;
3. change the owning model parameter/control points, never the final PNG;
4. regenerate canonical geometry;
5. rerun independent geometry tests;
6. recapture every affected fixed view;
7. rerun metrics and save JSON plus overlay;
8. record the residual and correction in the discrepancy log.

Repair coupled failures sequentially: source conflict → part count → silhouette
→ depth → joints → materials. Parallelize only disjoint files and owners.

If the same defect survives two complete loops, stop local tweaking. Revisit
the primitive/body family, source policy or missing method; a repeated residual
usually means the representation is wrong.

## 8. Generated-image adaptation

For an owner-selected concept, metrics enforce **selected visual character**
only. They may compare stance, relative massing, straight/curved control lines,
system count and material boundaries after scale is calibrated through a
passport/physics anchor.

They may not turn concept pixels into published lengths, hidden thicknesses,
joint design or load-bearing claims. Store resulting values as `authored` or
`calibrated` with the anchor and permitted claim named.

A generated projection that fails count or rigid-view consistency is
disqualified for measurement exactly as required by imagination-pipeline.md.

## 9. Deterministic helper scripts

The skill bundles:

- `scripts/reference_fit_report.py` — compares two prepared masks in one pixel
  frame, emits bbox/centroid/IoU JSON and a red/cyan/white overlay;
- `scripts/view_constraint_report.py` — checks calibrated shared-axis values
  across front/profile/top/rear and emits a conflict report.

`reference_fit_report.py` requires Pillow. Prefer the configured bundled
workspace Python when available; if no interpreter with Pillow exists, report
the missing dependency rather than silently skipping fit validation or
installing packages without authority. `view_constraint_report.py` uses only
the Python standard library.

Typical fit call:

```sh
python <skill-dir>/scripts/reference_fit_report.py \
  --reference reference-front.png --render canonical-front-mask.png \
  --reference-mask reference-front-mask.png --render-mask canonical-mask.png \
  --out-json front-fit.json --overlay front-overlay.png \
  --min-iou 0.90 --max-center-drift 0.015 --max-size-drift 0.03
```

The command exits `2` when a numeric gate fails. Images and explicit masks must
already share one registered pixel frame; the script intentionally refuses to
resize them.

Minimal shared-view input:

```json
{
  "schema": "view-constraints.v1",
  "unit": "m",
  "tolerance": 0.03,
  "views": {
    "front": {
      "projection": "orthographic",
      "calibrated": true,
      "axes": {"X": 6.0, "Y": 2.1},
      "counts": {"lift-duct": 6}
    },
    "top": {
      "projection": "orthographic",
      "calibrated": true,
      "axes": {"X": 6.2, "Z": 7.4},
      "counts": {"lift-duct": 6}
    }
  },
  "authority": {"X": "passport", "count:lift-duct": "passport"}
}
```

Axis/count conflicts without a corresponding `authority` entry produce
`requires-resolution` and exit `2`. An authority entry documents resolution;
it does not alter either source measurement.

Run scripts from the repository workspace and save reports with the object's
revision artifacts. Prepared explicit masks are preferred; threshold modes are
only a first-pass convenience.

## 10. Failure modes

| Failure | Correction |
| --- | --- |
| beauty-render threshold treated as truth | create explicit flat masks |
| front view silently declared canonical | use per-claim authority matrix |
| camera zoom repairs bbox | freeze registration; repair geometry |
| contradictory top/profile averaged | issue conflict report and choose authority |
| caption/aura counted as body | move it to `validationOnly` |
| whole silhouette passes but cockpit/ducts drift | add named system masks and landmarks |
| concept IoU becomes a dimension claim | restore anchor-based authored classification |
| one view fixed by breaking another | rerun the complete registered view set |

## Method provenance

The registration, mask, landmark and repair-queue patterns are adapted to this
skill's evidence hierarchy and canonical-geometry rules from the MIT-licensed
`RobLe3/cc-blender-skill` reference reconstruction stack. The adapted contract
deliberately rejects its unconditional front-view priority where Playgate's
passport, physics or documentary evidence owns a different claim.
