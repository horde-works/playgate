# Imagination pipeline: engineering an object that does not exist

## Contents

1. When this leg applies
2. The absolute rule
3. Generating a coherent multi-view sheet
4. Variants and recording the owner's selection
5. File placement and Tier E marking
6. Scale calibration through an internal anchor
7. Self-contradictory sheets
8. From sheet to invariants
9. Concept evolution during milestones

## 1. When this leg applies

Use this reference when the object is imagined/fictional — no museum, no measured drawing, no photograph exists — and ImageGen supplies the visual character; or when a generated image participates anywhere in an otherwise documentary pipeline. Everything else in the skill still applies: the deliverable remains one canonical code-authored model with fixed cameras, tests and an evidence card. The generated sheet replaces only the *photograph*, never the *drawing*.

## 2. The absolute rule

**Generated images are never dimension sources.** No length, radius, thickness, count of hidden members, joint construction or material thickness may be measured off a generated image and entered as fact. A generated sheet is Tier E evidence (see research-evidence.md §2) for geometry — but the **owner-selected** direction becomes a Tier A contract for *visual character only*: stance, massing language, surface hierarchy, material family, mood. Character, not construction.

The proven wording for the evidence card and `sourceNotes` (from the RAX-8 study): "The approved generated image owns visual character only; all dimensions, hidden structure and joints are authored and testable."

## 3. Generating a coherent multi-view sheet

Prompt structure that produces a usable sheet rather than one hero frame:

- name the views explicitly: strict front, strict side, top plan, and one 3/4 — and ask for orthographic-style projections for the strict views;
- insist it is **one machine**: same trim level, same fittings, same count of every visible unit in every view;
- state the countable topology up front (e.g. "six lift ducts and two shoulder yaw fans, visible in every view") — this is the audit key for §7;
- specify material/finish callouts (graphite composite, machined rims, smoked glazing) so the sheet answers surface questions, not geometry questions;
- ask for a neutral background and no environment, so silhouettes stay readable;
- include an avoid-list of features already rejected by the owner.

Name the permitted edit-loop with the established imagegen slugs so intent stays legible across sessions:

- `sketch-to-render` — turn a line drawing, graybox screenshot or current Object Lab render into a photoreal concept while preserving layout, proportions and perspective;
- `style-transfer` — apply a chosen visual style to a new subject or to the current model's renders without inventing new elements.

Both slugs preserve geometry-owning inputs by design, which is exactly why they are the sanctioned loop: the direction of truth stays canonical-model → picture, never picture → dimensions.

## 4. Variants and recording the owner's selection

- Generate variants as separate calls, one per direction; do not blend directions in one prompt.
- Present the variants and **record the owner's selection as a design decision**: which sheet was chosen, and what it was chosen *as*. The SR-6 record is the pattern: "The product owner selected the first ImageGen direction as a 4-forward + 2-rear architecture" — the selection fixed the propulsion architecture, and the rejected 3+3 study was kept as the comparison.
- Record explicit rejections with the same weight as selections. The M1 record — the concept "is explicitly not a geometry source and its missing centre ducts are rejected" — prevented the missing ducts from silently becoming truth. A rejected feature belongs in the rejection list.
- Preserve the owner's exact crop when a crop was what got approved (`reference-selected.png` alongside the full `concept-direction.png`).

## 5. File placement and Tier E marking

- The chosen asset lives in the repository under `docs/<object>/reference/` (e.g. `games/make-a-mess/docs/combat-hexacopter/reference/combat-hexacopter-concept.png`). **Never leave the chosen asset only in `~/.codex/generated_images/`** or any other tool-default output directory — a project-referenced image that exists only in a tool cache is lost evidence.
- Mark it Tier E in the evidence card's source hierarchy, with the character-only ownership sentence from §2, and list what it cannot support.
- Do not overwrite reference images with canonical captures, and never let a canonical capture masquerade as a concept or vice versa: references and captures live in different folders with different roles.

## 6. Scale calibration through an internal anchor

A fictional object has no published dimensions, and the sheet's absolute scale is meaningless. Calibrate through an **internal anchor the engineering contract already owns**, then read the sheet only as proportions relative to that anchor.

The proven case (SR-6 evidence card M10): every cabin station was anchored to the **rotor rows, which are fixed by the flight model**. The rotor stations could not move — the mixer and the physics depend on them — so the sheet's proportions transferred onto real coordinates "without needing the sheet's absolute scale". The windscreen base landed exactly on the second rotor row's leading edge, and that relation became a tested invariant instead of a traced pixel value.

Good internal anchors: rotor/wheel stations fixed by the dynamics model, occupant scale (seat, eye point, door), wheelbase or track owned by the vehicle contract, a module pitch owned by the design. Measurements are then expressed as "station Z as a fraction between anchor A and anchor B", which survives any rescaling of the sheet.

## 7. Self-contradictory sheets

Generated multi-view sheets are routinely not self-consistent between projections. The proven case: the SR-6 reference sheet's top-right projection **drew four ducts on a six-duct machine**, so the plan outline was taken from the 3/4 view instead, "where the body's plan edges can be traced against the frame".

The rule:

1. before measuring any projection, audit it against the object's countable topology (rotor count, opening count, member count);
2. a projection that fails the count audit is **disqualified as a measurement source** — for everything, not just the miscounted feature;
3. take the needed reading from a projection that passes, even if that means trace-reading a 3/4 view against known anchors;
4. record in the evidence card which projection each measurement came from, so a later reviewer can re-derive it.

Never average a self-contradictory sheet into a compromise that appears in no projection.

Before canonical geometry, write the registered-view conflict report from
reference-registration.md. Only calibrated/eligible projections enter shared-
axis comparison. A resolved conflict records which passport/physics anchor or
which projection owns each disputed claim; it never creates view-specific
runtime geometry.

## 8. From sheet to invariants

Convert readings into falsifiable invariants exactly as for documentary evidence (research-evidence.md §5): each invariant gets an owner parameter, an independent test and an exposing camera, and the study gets a rejection list of conditions that fail the object "even if the silhouette looks plausible". The M10 rejection list is the model: canopy top line that descends aft of its peak, front and rear nacelle attachments built from the same member type, a plan edge that curves where the sheet shows one straight taper — each rejects a *class* of wrong object, not one bad render.

After authoring dimensions from passport/physics anchors, quantitative overlays,
silhouette metrics and landmarks may enforce the approved character. They remain
validation evidence, not a route for relabelling concept pixels as published or
measured dimensions.

## 9. Concept evolution during milestones

New concept directions may be generated mid-study (including `style-transfer` over the current canonical renders to propose surface language). Each new sheet passes the same loop: variants → owner selection recorded → placement under `docs/<object>/reference/` → Tier E marking → count audit before any reading. Canonical geometry changes only through the discrepancy loop against the evidence card — never directly "to match the new picture".
