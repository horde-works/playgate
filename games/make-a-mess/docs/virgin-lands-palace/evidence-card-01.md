# Evidence card 01 — Palace of Virgin Lands

## Target state

- **Object:** Дворец целинников, Целиноград (later Congress Hall / Astana
  Concert Hall).
- **Authored state:** the original Soviet-modernist building before the late
  1990s reconstruction. Later cladding and the current concert-hall facade are
  out of scope.
- **Canonical use:** one isolated Object Lab model, later placed on the
  north-west peninsula of the Astana world after visual acceptance.
- **Coordinate convention:** local `+x` runs along the principal facade to the
  right; local `+z` faces the public square; `+y` is up. This matches Object
  Lab's canonical building frame.

## Published facts

| Claim | Status | Source |
| --- | --- | --- |
| Built in 1961–1963 and opened on 6 November 1963 | published | [Kazinform](https://www.inform.kz/ru/dvorets-tselinnikov-sovremenniy-oblik-kultovogo-zdaniya-stolitsi-0c0bc6) |
| Architects: P. Fogels, D. Danneberg and O. Krauklis of Latgiprogorstroy | published | [Kazinform](https://www.inform.kz/ru/dvorets-tselinnikov-sovremenniy-oblik-kultovogo-zdaniya-stolitsi-0c0bc6), [Great Soviet Encyclopedia mirror](https://bse.sci-lib.com/particle007457.html) |
| Original auditorium capacity: 2,340; cafe: 150 | published | [Kazinform](https://www.inform.kz/ru/dvorets-tselinnikov-sovremenniy-oblik-kultovogo-zdaniya-stolitsi-0c0bc6) |
| The composition consists of a high auditorium volume growing from a low foyer / lobby / administration volume | published description | [Astana city administration](https://www.gov.kz/memleket/entities/astana/press/article/details/18489) |
| Published current envelope: 25 m high; total area 6,697 m² | published current-building data; used only as a scale anchor | [Astana city administration](https://www.gov.kz/memleket/entities/astana/press/article/details/18489) |

The 25 m figure is not treated as a measured 1963 drawing. It anchors the
overall height until an original section or survey is found.

## Frozen image register

The images are kept outside the repository; this card records their identity
without redistributing the scans.

| ID | View authority | Original URL | SHA-256 |
| --- | --- | --- | --- |
| R1 | Square-side elevation and auditorium roof, strong | [1983 square view](https://i.pinimg.com/originals/e6/6b/1f/e66b1f53fb79c373b93181efc18ce419.jpg) | `d920d805761a8b67b71b3c5ce09714613d2a6f1004448cbbc4e7cc3b91ea87d3` |
| R2 | Early massing and low lateral wing, strong | [1963 diagonal view](https://pastvu.com/_p/d/c/1/0/c103xejaahs8ornraw.jpg) | `68ed86d2a26ce33d0623d99ff9f7e8681e3c50417e406255a8ee00e0743aae5c` |
| R3 | Glazed foyer corner, pilotis and long side facade, medium; archive identity visible in the scan but current host is secondary | [glazed diagonal view](https://foto.papik.pro/uploads/posts/2025-06/28/1751059038934.jpg) | `aef0902f0279856975be5d740f46d5655662bcfebdfa081d365e91759e8f4eb4` |
| R4 | Auditorium facade corroboration, medium | [postcard view](https://img-fotki.yandex.ru/get/5000/225044291.3eb/0_15b0e2_28d7e39e_XL.jpg) | `412926d713d76fbed3023e4a68144f69df7d2175bddf3fdffa79f0e7e00b9859` |
| R5 | Archival facade corroboration, medium | [E-history archive image](https://e-history.kz/upload/medialibrary/66b/66bb2ced83036d2420fd9b0a8d2e8b81.jpg) | `9e148308261ac936da9eee1a3df367baa9a879f7b95e7b819335c7111186965a` |

## Contour contract C01

### Observed

- A broad, low rectilinear foyer volume is the public base of the building.
- Its square-side and return facades are predominantly glazed, divided by tall
  thin vertical fins; the lower entrance level is recessed behind pilotis.
- The opaque auditorium is asymmetrically placed toward the rear-left of that
  base instead of being centred in a symmetric podium.
- The auditorium has a shallow hipped metal roof, a light modular facade,
  sparse small openings and one low horizontal window band.
- The broad glazed wing continues materially farther to the right of the hall.

### Calibrated for the Astana scene

The Astana world already compresses medium civic landmarks by `1:1.6`.
Therefore the provisional canonical envelope is:

| Part | Scene dimensions | Authority |
| --- | --- | --- |
| Overall height | 15.625 m | 25 m published anchor / 1.6 |
| Low foyer footprint | 48 × 34 m | image-calibrated, not surveyed |
| Low foyer height | 5.2 m | image-calibrated |
| Auditorium wall body | 34 × 24 × 13.9 m | image-calibrated |
| Auditorium offset in low base | `x=-5 m`, `z=+4 m` | multi-view inference |
| Roof rise | 1.725 m to the 15.625 m apex | image-calibrated |

This makes the wrap leg 9 m deep at the square, 12 m wide at the right, 2 m
at the left and 1 m at the rear. The right and rear values are the least
certain because no measured plan or true aerial view has been found.

## Confidence and stop conditions

- **Front and side silhouette:** high confidence.
- **Auditorium/foyer relationship:** medium-high confidence.
- **Exact plan, rear facade and roof equipment:** inferred; do not promote to
  historical fact.
- **Decorative details and signage:** deferred until blockout acceptance.
- A measured original plan, section or rear photograph supersedes the authored
  hidden geometry immediately.

The accepted contour sheet is
[`contour-study.svg`](contour-study.svg); its approval owns blockout B01.

## Gate record

- Contour C01 was [accepted by the owner](contour-approval-c01.md) on
  2026-08-12.
- The approved hidden plan is an owner-approved hypothesis, not a measured
  historical plan.
- Blockout B01 is isolated; facade work and Astana-world integration remain
  blocked pending a separate visual acceptance.
