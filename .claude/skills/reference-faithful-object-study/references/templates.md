# Reusable templates

## Contents

1. Evidence card
2. Part-budget worksheet
3. Independent-test matrix
4. Discrepancy log
5. Acceptance handoff
6. Object README index

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

## Named construction

- Part/system, section, material and function.
- Real negative spaces.
- Window contract: segmented wall void → jamb/head/sill reveals → frame/muntins
  → ordinary transparent glazing → modelled interior depth.
- Budget compression strategy.

## Load and attachment paths

- datum → ... → final surface.
- carrier → bracket → fitting → dependent.
- adapter-owned embedment/placement anchors.

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

## 4. Discrepancy log

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

## 5. Acceptance handoff

```md
Готов объект №N — `name`.

- Exact envelope and critical dimensions.
- Which openings/supports are real geometry.
- Part count / object ceiling; ensemble total / ceiling.
- Targeted tests and lint result.
- Reference roles with direct links.
- Explicitly: object is not placed/registered.

![Front](/absolute/current/front.png)
![Profile](/absolute/current/profile.png)
![Three-quarter](/absolute/current/three-quarter.png)
![Rear/detail](/absolute/current/rear-detail.png)

Принимаем?
```

## 6. Object README index

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
