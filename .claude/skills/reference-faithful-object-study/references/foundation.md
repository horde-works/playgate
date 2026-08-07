# Foundation for a reference-faithful 3D object skill

## Contents

1. Purpose and boundary
2. Core contract
3. Layered architecture
4. Capability modules
5. Canonical object data contract
6. Required artifacts
7. Quality gates
8. Tool and repository adapters
9. Installation and discovery
10. Extension rules
11. Validation checklist

## 1. Purpose and boundary

Use this document to install, port, restructure or extend a skill that turns
documentary references or an approved fictional concept into one verifiable 3D
object. Preserve this architecture when adapting the skill to another agent,
repository, renderer, DCC or CAD tool.

This is an architectural contract, not a second operating manual. The working
procedures remain in `SKILL.md` and its domain references. Do not copy those
procedures here and do not load this file for routine object work.

The skill ends at a visually accepted, tested canonical object and a truthful
handoff. Scene placement, gameplay physics, destruction and world integration
remain later stages unless the user explicitly changes the order.

## 2. Core contract

Every implementation of this skill must preserve these invariants:

1. **One editable truth.** Exactly one canonical geometry owner feeds tests,
   captures, exports and later integration. CAD, Blender, GLB and tracing meshes
   are either the owner, deterministic derivatives or labelled diagnostics.
2. **The rendered object is the deliverable object.** Approval PNGs come from
   the same geometry that the adapter or prefab will consume.
3. **Evidence has explicit authority.** Published dimensions, measured drawings,
   calibrated observations, authored estimates and concept character are never
   silently merged into one confidence class.
4. **Construction is geometry.** Openings are absent material; loads end on
   supports; visible components have carriers, joints and clearance.
5. **Motion is a typed contract.** Static geometry, kinematic geometry, allowed
   motion and excluded simulation are separate. Swept envelopes are tested.
6. **Visual and physical representations are mapped, not conflated.** Render
   detail does not automatically create colliders or rigid bodies, while coarse
   physics never substitutes for visible construction.
7. **Images detect; they do not legislate.** Registration, silhouettes, IoU,
   landmarks and overlays test approved claims but do not promote distorted or
   fictional pixels into factual dimensions.
8. **Acceptance precedes placement.** A world camera cannot conceal an incorrect
   volume and pass it as an accepted model.
9. **Accepted scope is protected.** Corrections are local unless the owner
   explicitly reopens the accepted topology or envelope.
10. **Claims match checks actually run.** Never imply manufacturability, solid
    validity, renderer parity or physical safety without the corresponding gate.

## 3. Layered architecture

Keep the skill in six layers with one-way dependency from general to specific:

| Layer | Responsibility | Typical contents |
| --- | --- | --- |
| discovery | make the agent trigger on the right work | YAML `name` and `description` |
| router | preserve the core sequence and select modules | `SKILL.md` |
| methods | explain specialist procedures only when needed | `references/*.md` |
| deterministic tools | perform fragile repeatable calculations | `scripts/*` |
| project adapter | translate the contract into local schemas and commands | repository instructions and project-local code |
| evidence | prove what was built and accepted | passport, manifests, tests, PNGs, reports |

Do not embed project paths, client names, object-specific dimensions or one
renderer API in the reusable layers. Put those in the project adapter or task
artifacts. Direct user and repository rules outrank the portable skill.

Keep references one level below `SKILL.md`. A reader must be able to discover
every module and the condition for loading it without chasing nested manuals.

## 4. Capability modules

A complete installation provides these capability families. Their filenames or
tools may vary, but their responsibilities must remain distinct.

### Research and evidence

- search primary, institutional and manufacturer sources;
- assign per-claim authority and uncertainty;
- write the evidence card before geometry;
- preserve contradictions rather than averaging them away.

### Reference registration

- calibrate scale and model axes;
- freeze comparable views and projections;
- define structural masks and landmarks;
- expose multi-view conflicts and quantify residuals.

### Geometry and construction

- choose the correct body family for each major mass;
- build load paths, openings, shells, frames, joints and negative spaces;
- use shared parameters and mathematical repetition;
- preserve exact datums, envelopes and part identities.

### Solid and assembly validation

- verify manifoldness, winding and connected components when applicable;
- store named datums, hardpoints, axes and mates;
- validate seating, clearance and mirrored/repeated transforms;
- compare canonical and exported or compiled derivatives.

### Surface, materials and rendering

- bind semantic PBR materials after geometry gates;
- verify UV and texture coverage, color spaces, transparency and emission;
- freeze neutral diagnostic lighting and target-renderer settings;
- keep beauty views separate from fit masks and construction cutaways.

### Articulation and physics mapping

- separate static and kinematic groups;
- store pivot, axis, range and motion state as source data;
- test swept clearance across the full allowed range;
- map visual groups to physics deliberately, without body proliferation.

### Verification and correction

- recover critical measurements independently from output geometry;
- capture a fixed multi-angle matrix from one revision and hash;
- record defect, physical cause, owner, correction and recapture result;
- stop local patching when a repeated defect indicates a wrong method.

### Skill evaluation

- use an isolated corpus spanning documentary, fictional, articulated, solid,
  material and integration risks;
- score observable artifacts rather than persuasive prose;
- treat fake openings, parallel truths, view cheats and premature placement as
  hard failures;
- retain changes only when the target improves without regressions.

## 5. Canonical object data contract

The local implementation may use TypeScript, Python, CAD parameters or another
authoring system. It must still expose equivalent data for:

```text
identity:
revision + content hash:
canonical representation owner:
derived and diagnostic artifacts:
units + handedness + local axes:
front + vertical datum + contact datum:
exact and authored envelopes:
parts + semantic groups + materials:
part-local frames + mounting planes:
named datums + hardpoints + interfaces:
joints + axes + ranges + motion states:
visual-to-physics mapping:
registered views + cameras + authority:
protected scope + rejection conditions:
```

Repeated assemblies reference one parameterized definition. Critical positions,
axes and clearances are source data, not values rediscovered from a flattering
render. Derivatives carry enough identity to prove which canonical revision
created them.

## 6. Required artifacts

Produce the smallest complete evidence set appropriate to the object:

- evidence card or object passport;
- source and claim matrix;
- reference-registration manifest when visual fit matters;
- canonical editable geometry;
- independent geometry, assembly and motion tests;
- fixed-camera PNG set with revision and model hash;
- flat masks, overlays and metric reports for strict reference views;
- paired external/cutaway captures when hidden construction must be shown;
- discrepancy log with resolved and unresolved findings;
- export and round-trip report when a derived asset is delivered;
- integration handoff only after visual acceptance.

Do not create a second simplified object for captures or cutaways. A diagnostic
camera may hide named groups from the canonical object; it may not rewrite its
materials or geometry.

## 7. Quality gates

Run gates in dependency order so later polish cannot conceal earlier failure:

1. scope, owner and representation policy;
2. evidence hierarchy and calibrated anchors;
3. part inventory, topology and load path;
4. envelope, silhouette and negative spaces;
5. joints, seating, clearances and motion envelope;
6. solid/export validity where applicable;
7. materials, normals and renderer parity;
8. fixed same-revision captures and discrepancy closure;
9. explicit visual acceptance;
10. adapter, physics and world integration.

A failed earlier gate invalidates dependent evidence. For example, a material
render cannot approve an incorrect silhouette, and an attractive world view
cannot approve untested canonical geometry.

## 8. Tool and repository adapters

Adapt interfaces, not invariants.

- **Code-authored repository:** keep geometry constants, builders, tests and
  cameras in source control; compile or export deterministically.
- **CAD-authoritative repository:** keep the parametric CAD document as the
  owner; export meshes deterministically and test datums, solids and envelopes.
- **DCC-authoritative repository:** use a scripted, versioned scene with named
  collections, pivots and export settings; avoid untracked manual variants.
- **Hybrid workflow:** explicitly choose the owner. Sidecars may diagnose or
  preview but cannot be edited in parallel as another truth.

External tools and MCP integrations are optional accelerators. The skill must
remain usable with local repository tools and must degrade honestly when a
specialized validator is unavailable. Record a missing gate as pending; never
replace it with a prose assertion.

The project adapter must define local equivalents for geometry owner, material
owner, capture command, test command, output directory, adapter boundary and
protected files. It should not weaken the portable evidence or acceptance gates.

## 9. Installation and discovery

Keep exactly one skill folder, in the repository, and let every agent discover
it there. A skill lives at `.claude/skills/<skill-name>/` and serves both agents
from that one place:

| Consumer | What it reads | Where it comes from |
| --- | --- | --- |
| Claude Code | `SKILL.md` frontmatter (`name`, `description`) | the repository folder |
| Codex | `agents/openai.yaml` (`display_name`, `short_description`, `default_prompt`) | the same repository folder |

Both files sit side by side in one versioned folder. There is nothing to install
and nothing to keep in step.

**Do not place a same-named skill in a user-level directory** — not
`~/.claude/skills/`, not `~/.codex/skills/`, and not as a "pointer that owns no
rules". A user-level skill with the same `name` silently shadows the repository
one, and shadowing is not a small cost:

- **The agent gets the stub instead of the method.** Discovery resolves to the
  pointer, so the router, the mandatory-reading list and every conditional
  module are replaced by a few lines telling the agent to go and read them.
- **An absolute home path is machine-local.** This project is developed from two
  machines whose checkouts differ (`/Users/…/cursor/playgate` against
  `C:\Users\…\cursor\playgate`). A pointer written on one of them resolves to
  nothing on the other — and because it still shadows by name, the second
  machine ends up with LESS than if the pointer had never existed. Removing a
  working skill is the opposite of installing one.
- **Two copies of a description drift, and nothing reports it.** Repository
  tests scan the repository; they cannot see a user-level fork. Observed in this
  skill: the pointer's `agents/openai.yaml` had already drifted from the
  canonical one in `short_description` and `default_prompt` while both
  `SKILL.md` frontmatters still matched character for character — the failure
  was already present and invisible.

This is a recorded project decision, not a preference: see the "Скиллы" section
of the repository `CLAUDE.md`. If a skill does not appear, fix discovery for the
repository folder; do not fork it into a home directory.

An already running agent session may have cached its available skill catalog.
Start a new session if a newly added repository skill does not appear.

## 10. Extension rules

Add or change a module only for a transferable failure class:

1. reproduce the failure with task-local artifacts;
2. identify the missing method or ambiguous boundary;
3. check whether an existing reference already owns the answer;
4. add the smallest generic rule, template or deterministic script;
5. avoid object-specific dimensions and golden answers;
6. validate syntax, links and representative script behavior;
7. rerun the failing case and one unrelated regression case;
8. update discovery metadata only when trigger scope materially changes.

Keep `SKILL.md` below 500 lines. Move specialist procedures into references and
add a contents list to references longer than 100 lines. Put fragile calculations
in tested scripts. Do not duplicate a rule between the router and a reference.

## 11. Validation checklist

Before releasing or porting the skill, verify:

- frontmatter contains only a valid `name` and comprehensive `description`;
- `description` still names the concrete objects a request will actually call
  them, not only the abstract quality vocabulary — a checklist noun that nobody
  types is a trigger that never fires;
- no same-named skill exists in any user-level directory (§9);
- the Codex manifest `agents/openai.yaml` sits beside `SKILL.md` in the same
  repository folder and describes the same skill;
- canonical `SKILL.md` links every conditional module directly;
- every Markdown link resolves;
- the main file remains below 500 lines;
- long references include contents navigation;
- bundled scripts compile and representative pass/fail cases behave correctly;
- project/client data and secrets are absent from reusable content;
- no instruction creates a second editable geometry owner;
- no instruction weakens evidence, support, motion, physics or acceptance gates;
- agent-facing metadata still matches the trigger and default workflow;
- behavioral forward-test status is reported honestly.
