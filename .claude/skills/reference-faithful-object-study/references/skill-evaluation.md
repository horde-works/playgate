# Evaluating and improving this skill

## Contents

1. Purpose
2. Evaluation corpus
3. Isolation and contamination control
4. Scorecard
5. Evaluation loop
6. Trigger evaluation
7. Change discipline
8. Release gate

## 1. Purpose

Use this reference when changing the skill itself, when a failure class repeats
across objects, or when the same defect survives two complete discrepancy
cycles. The goal is to improve transferable method, not encode one object's
answer into global instructions.

## 2. Evaluation corpus

Maintain a small set of realistic tasks spanning the skill's risk surface:

- documentary building with real openings and load path;
- fictional vehicle with inconsistent concept views;
- multi-part machine with pivots, swept volumes and render-only articulation;
- open shell/hull whose hidden closure must be proved;
- assembly using purchased component envelopes and named mates;
- material/lighting case where transparency must not fake construction;
- local correction on an already accepted object;
- integration handoff that must preserve canonical geometry.

Use raw prompts, references, passports and outputs. Do not provide the expected
diagnosis or the change being tested.

## 3. Isolation and contamination control

- run evaluators in fresh contexts when possible;
- pass only task-local artifacts and the candidate skill;
- remove prior generated outputs between runs or use isolated temporary roots;
- never expose the intended fix, suspected bug or golden reasoning;
- compare against independent geometry facts and fixed images, not prose style;
- do not let project/client names leak into reusable skill instructions.

If fresh-agent evaluation is unavailable, run deterministic schema/link/script
checks and document that behavioral forward-testing remains pending.

## 4. Scorecard

Score observable outcomes, not eloquence:

| Dimension | Evidence |
| --- | --- |
| source authority | claim matrix and conflict handling |
| canonical ownership | exactly one editable geometry owner |
| construction | load paths, joints and negative spaces are real |
| reference fit | registered views, overlays, residual reports |
| geometry validity | manifold/winding/solid/export gates as applicable |
| motion | typed pivots/ranges, swept-envelope and second state |
| runtime restraint | no premature placement or collider proliferation |
| regression safety | accepted scope unchanged; targeted tests pass |
| handoff truth | current same-hash PNGs and claims actually verified |

Use hard failure flags for fake openings, parallel canonical models,
view-specific geometry cheats, untested motion, unsupported parts and world
placement before acceptance. A hard failure cannot be averaged away.

## 5. Evaluation loop

1. Freeze the current skill revision and baseline evaluation results.
2. Classify failures by method: trigger, source policy, registration,
   construction, solid validity, motion, capture, integration or reporting.
3. Decide whether an existing module already contains the answer.
4. Make the smallest generic instruction/script change.
5. Validate syntax, links and bundled scripts.
6. Rerun the failing cases and at least one unaffected regression case.
7. Keep the change only if the target improves without new hard failures.
8. Record unresolved gaps in the task handoff; do not weaken gates for a score.

Never automatically rewrite and accept the skill from the same failing output.
Human review owns changes to evidence hierarchy, physics boundaries and safety
gates.

## 6. Trigger evaluation

Test both true positives and false positives for the frontmatter description.
The skill should trigger for canonical object studies, vehicles, architecture,
reference-to-3D work, multi-view PNG audits and articulated mechanisms. It
should not trigger for casual concept-only image generation, ordinary scene
placement or unrelated code changes.

## 7. Change discipline

- keep the main `SKILL.md` below 500 lines;
- place specialist procedures in one-level `references/` files;
- place fragile repeatable calculations in tested `scripts/`;
- do not duplicate rules between main and reference files;
- preserve direct user/project rules over donor methods;
- attribute substantially adapted external methods and respect licences;
- update `agents/openai.yaml` if scope/trigger wording materially changes.

## 8. Release gate

Before treating an updated skill as ready:

- quick skill validation passes;
- every Markdown link resolves;
- all bundled scripts compile and their representative tests pass;
- new references have contents navigation when long;
- no project-specific secret/path/output is embedded accidentally;
- no rule creates a second canonical geometry owner;
- no rule weakens physical support, motion, physics or acceptance boundaries;
- behavioral forward-test status is stated honestly.

## Method provenance

The iterative test/score/improve pattern is adapted from the skill optimizer in
the LGPL-licensed `ghbalf/freecad-ai` project and from the official OpenAI skill
creation guidance. No FreeCAD implementation code is copied into this skill.
