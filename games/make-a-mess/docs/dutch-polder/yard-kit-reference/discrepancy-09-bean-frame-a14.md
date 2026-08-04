# Discrepancy 09 — bean frame, revision a14

## Compared artifact

- Canonical owner: `dutchLandscapeKitObject.ts`, filtered export `dutchLandscapeBeanFrameParts`.
- Revision: `landscape-kit-a14-2026-08-04`.
- Model hash: `2c5d6b243f93`.
- Evidence owner: `evidence-card-09-bean-frame.md`.
- Object inventory: `13 / 14` parts; complete landscape-kit inventory: `553 / 600`.
- No prefab, placement adapter, terrain, route, parcel or reserve change is part of this revision.

## Numeric recovery

| Required fact | Recovered from canonical output | Result |
| --- | --- | --- |
| Ten hazel poles | 10 `bean-frame-pole:*` cylinders | pass |
| Pole length | all centreline distances `2.400 m` | pass |
| Pole diameter/material | all `Ø0.030 m`, `timber-mid`, ten-sided | pass |
| Five stations | X clusters `-1.10, -0.55, 0, 0.55, 1.10 m` | pass |
| Longitudinal pitch | all four adjacent intervals `0.550 m` | pass |
| Two rows | base Z clusters `-0.350, +0.350 m` | pass |
| Row spacing | `0.700 m` | pass |
| Pair tie height | each of ten centreline intersections at `(station X, 2.100, 0)` | pass |
| Pole continuation | every tip is above `2.10 m`, at derived `y ≈ 2.367 m`, and crosses the centre plane | pass |
| Horizontal ridge | one `Ø0.035 m` cylinder from `x=-1.25` to `+1.25` at `(y=2.10,z=0)` | pass |
| Ridge attachment | exact zero centreline distance to all five pair crossings; `0.15 m` end overhangs | pass |
| Five bindings | five closed connected mesh components centred on the five stations | pass |
| Binding attachment | each loop's inner surface intersects the ridge and encloses the pair joint | pass |
| Filled soil bed | one opaque closed box, `2.60 × 0.20 × 1.10 m`, Y bounds `[0,0.20]` | pass |
| Planted support | all ten pole feet lie inside the bed plan and enter it from `y=0` | pass |
| Transparency contract | no part alpha/transparent fields; no material opacity override | pass |

## Visual loop

### First current-render pass

- `bean-frame-front`: recovered all five exact X stations, continuous ridge and filled bed. Pair lean is intentionally unavailable in this axis and is owned by the profile view.
- `bean-frame-profile`: recovered the `0.70 m` A-section and central binding, but the first camera framing cropped the pole tips and part of the lab heading. This made the above-tie continuation harder to verify even though geometry was correct.
- `bean-frame-three-quarter`: recovered ten individually planted poles, five paired frames, ridge overhang and the full soil-bed envelope.
- `bean-frame-high`: recovered one continuous ridge through all five crossings and the repeated binding rhythm.
- `bean-frame-tie-detail`: recovered the real pole/pole/ridge joint, opaque binding loop and both pole tails above the tie.

### Correction and recapture

- Geometry was not changed.
- `bean-frame-profile` orthographic height increased from `2.80` to `3.25 m`, with target Y adjusted from `1.15` to `1.18 m`.
- All five bean-frame views were recaptured after the camera change so revision and model hash are identical across the set.
- Corrected profile now includes the complete tips, tie, planted feet and filled bed without clipping.

## Current PNG set

| View | SHA-256 |
| --- | --- |
| `bean-frame-front.png` | `e7ed2b68f44f6c71753b8ffbce571e978276a5256a819a5a2ac7b2fc6caa70ac` |
| `bean-frame-profile.png` | `cb0e5e63bbc42123e6caba5ed9480f08dc7c18a96c315fa77e730bae05aacc6f` |
| `bean-frame-three-quarter.png` | `6877ddd40f13cce2602d7b91aca53af7d9a23c342c8cb213221c637b3f12aef7` |
| `bean-frame-high.png` | `3be96ad345d5f3fd163bf8f6b5ff5970d70f0d28df6058e50f8bdb376bc105bd` |
| `bean-frame-tie-detail.png` | `61e64c6ed76cd2c17c2043bebce9693b5a73bb7ab730d6528e352e07b8436e33` |

## Remaining authored choices, not discrepancies

- Passport owns hazel and the exact dimensions. The WUR source records the broader Dutch ash/willow/pine support family; RHS independently supports hazel for the same paired A-frame topology.
- Ridge overhang, bed plan and cord section are explicit authored completion values because the passport specifies their existence but not those secondary dimensions.
- The canonical poles are straight measurable cylinders. Natural pole waviness belongs to later surface treatment; introducing unmeasured bends would make the `2.40 m`, station and exact tie checks ambiguous.
- No plants or bean foliage are included: they would hide attachments and are not part of the support object passport.

## Acceptance gate

- Automated geometry/inventory suite: `26 / 26` passing after addition of three independent bonenrek tests.
- Targeted lint: passing.
- No known geometry, attachment, grounding, opacity, budget or fixed-camera discrepancy remains.
- Object remains unregistered and unplaced pending visual acceptance.
