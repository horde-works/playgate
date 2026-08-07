# Reusable templates

## Contents

1. Evidence card
2. Part-budget worksheet
3. Independent-test matrix
4. Reference-fit manifest
5. Solid and assembly audit
6. Discrepancy log
7. Acceptance handoff
8. Object README index

## 1. Evidence card

```md
# Evidence card NN — object (`local-name`)

## Identity and source hierarchy

- Object: ...; explicitly not ...
- `documentary`: source and owned claims.
- `published`: source and owned claims.
- `passport`: exact values owned by current brief.
- `authored`: decisions made because evidence is absent.
- Current code and generated imagery do not own hidden geometry.

Sources:

- URL / inventory id
- URL / drawing
- local passport path and section

## Local frame and envelopes

- Units and axes.
- Ground/water datum.
- Exact overall envelope.
- Critical control lines and openings.
- Derived angles/projections with equations.
- Authored overhangs/thicknesses and why.

## Canonical representation and reference registration

- Canonical editable owner and deterministic derivatives/diagnostic sidecars.
- Registered strict views, projection/crop and calibration anchor.
- Per-claim authority; structural/negative-space masks and named landmarks.
- Multi-view conflicts and explicit resolution.
- Fit thresholds and report/overlay paths.

## Named construction

- Part/system, section, material and function.
- Real negative spaces.
- Window contract: segmented wall void → jamb/head/sill reveals → frame/muntins
  → ordinary transparent glazing → modelled interior depth.
- Budget compression strategy.

## Surface/material/render contract (when present)

- Semantic material families and finish boundaries.
- PBR channel ownership; UV/texture coverage and color spaces.
- Transparent parts and contained emissive sources.
- Neutral diagnostic light plus acceptance light/color-management settings.
- Target-renderer/export parity checks and budgets.

## Load and attachment paths

- datum → ... → final surface.
- carrier → bracket → fitting → dependent.
- adapter-owned embedment/placement anchors.
- named part-local datums, mating faces, axes, hardpoints and purchased-component interfaces;
- visual → physics/contact → render-only articulation mapping where applicable.

## Motion contract (when present)

- kinematic group members vs static geometry (foundation/rails outside the group);
- pivot, axis, range and rest phase per motion — typed, not booleans;
- interlocks (e.g. rotors-stopped precondition for canopy);
- excluded simulation and external couplings;
- second-state view id in the camera manifest;
- swept-envelope test: full allowed range vs union of all static parts.

## Lighting contract (when present)

- intended lit material/surface and fixed night camera;
- visible fixture chain: carrier → plate/hook → arm/chain → body/cap → clear lens → contained bulb/flame;
- clear lens bounds, bulb/flame bounds and exact source origin at the bulb/flame centre;
- ordinary non-emissive window glazing and the fixed exterior camera that proves
  interior depth plus a visible, non-mullion-occluded source;
- colour family, minimum intensity, minimum radius and day factor;
- reflection target and forbidden camera-facing substitutes;
- pool group, local capacity and measured 0/2/4/6-light budget;

## Protected scope

- Accepted objects/components.
- Forbidden files and placement work.
- No prefab/adapter before visual acceptance.

## Rejection conditions

- Exact measurable failures.
- Forbidden closures/floating parts.
- Wrong silhouette/type category.
- Budget ceiling.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| ... | ... | ... | ... |
```

## 2. Part-budget worksheet

```md
| System | Planned | Final | Compression/justification |
| --- | ---: | ---: | --- |
| primary support |  |  | never compress defining load path |
| shell/surfaces |  |  | merge only hidden/repetitive areas |
| openings/interior |  |  | preserve real voids |
| hardware |  |  | preserve attachment chain |
| functional detail |  |  | keep object-defining use |
| total |  |  | must be ≤ passport budget |

Ensemble before: ...
Ensemble after: ... / total ceiling
```

## 3. Independent-test matrix

```md
| Test | Output measurement | Expected | Failure identity |
| --- | --- | --- | --- |
| budget | filtered parts length | ≤ N | object group |
| footprint | union bounds | W × D | extreme part ids |
| ground | carrier min Y | datum | carrier id |
| support | interval overlap/contact | positive / zero bearing | dependent + carrier |
| opening | shell overlap + probe | none | closing part id |
| slope | recovered angle/sign | exact | roof/profile part |
| attachment | depth intervals | positive overlap | fitting chain |
| views | view id inventory | all required | missing id |
```

## 4. Reference-fit manifest

```json
{
  "schema": "reference-fit-manifest.v1",
  "canonicalPolicy": "claim-authority-matrix",
  "sources": [],
  "structuralParts": [],
  "validationOnly": [],
  "landmarks": [],
  "gates": {
    "bboxCenterDriftMax": 0.015,
    "bboxSizeDriftMax": 0.03,
    "silhouetteIouMin": 0.9
  }
}
```

Save calibrated view-constraint input/report, prepared masks, metric JSON and
overlays beside the revision captures. Thresholds are object-specific and must
be justified in the evidence card.

## 5. Solid and assembly audit

```md
## Representation

- canonical owner:
- deterministic derivatives:
- diagnostic-only artifacts:

## Body and solid gates

- dominant body family per major mass:
- intended closed/open classification:
- connected components / manifold edges / signed volume:
- canonical ↔ compiled/exported bounds and landmark comparison:
- optional BREP/STEP validity and round-trip:

## Surface/material/render gates

- semantic material inventory and physical family:
- UV/texture coverage by named surface group:
- color-space and normal/tangent audit:
- transparent/emissive ownership:
- neutral diagnostic render:
- canonical ↔ target-renderer parity:

## Datums and joints

| Interface | Fixed datum | Moving datum | Relation | Recovered check |
| --- | --- | --- | --- | --- |
| ... | ... | ... | rigid/revolute/linear/... | ... |

## Runtime mapping

- visual construction:
- physics bodies/colliders/stations:
- render-only articulation:
- damage/support groups:

## Claims not made

- structural certification / manufacturability / airworthiness / ...
```

## 6. Discrepancy log

```md
# Discrepancy review NN — object — revision

## Compared material

- Canonical revision/hash.
- Fixed captures.
- Evidence card/passport.

## First capture findings

1. `short name` — pass/fail. Visible symptom and violated invariant.
2. ...

## Corrections

- Physical cause → owning geometry → local correction → test strengthened.

## Final autonomous review

- Front: ...
- Profile: ...
- Three-quarter: ...
- Rear/high: ...
- Detail: ...
- Part count and total.
- Tests/lint/build.
- Final shared model hash.

## Residual discrepancies

- Real remaining difference, or `none in acceptance-critical geometry`.

## Deliberate non-actions

- No placement/adapter/prefab.
- No protected-object changes.
```

## 7. Acceptance handoff

```md
Готов объект №N — `name`.

- Exact envelope and critical dimensions.
- Which openings/supports are real geometry.
- Part count / object ceiling; ensemble total / ceiling.
- Targeted tests and lint result.
- Registered fit residuals/overlays and solid/assembly/export gates actually run.
- Reference roles with direct links.
- Explicitly: object is not placed/registered.

![Front](/absolute/current/front.png)
![Profile](/absolute/current/profile.png)
![Three-quarter](/absolute/current/three-quarter.png)
![Rear/detail](/absolute/current/rear-detail.png)

Принимаем?
```

## 8. Object README index

One per object, at `docs/<object>/README.md`. Never per milestone.

```md
# <Object> — object study index

- Canonical owner: `src/content/objects/.../<object>Object.ts`
- Accepted revision: `<rev>` (hash `<hash>`), accepted by owner <date>
- Records: `evidence-card-<NN>-<object>.md`, `discrepancy-log-<rev>.md`
- Reference imagery: `reference/`

| Revision | Status | Note |
| --- | --- | --- |
| m1 | superseded | rejected 3+3 comparison |
| m2 | accepted | 4+2 architecture selected by owner |
```
