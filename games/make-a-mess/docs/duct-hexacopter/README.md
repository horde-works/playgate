# HX-D integrated-duct combat hexacopter — object-study index

Single-seat armoured VTOL: six lift fans cored into one lifting body, two
longitudinal reversible fans for yaw, cruise and braking. A separate object from
RAX-8 Tonkawa and SR-6 Skat. Nothing is inherited from the cancelled
`codex/integrated-duct-hexacopter-runtime` line.

Canonical geometry:
[`ductHexacopterObject.ts`](../../src/content/objects/vehicles/ductHexacopterObject.ts).
Tests: [`tests/duct-hexacopter-core.test.mjs`](../../../../tests/duct-hexacopter-core.test.mjs).
Passport: [evidence card 01](evidence-card-01-duct-hexacopter.md).

| Revision | Contents | Status | Records | Captures |
| --- | --- | --- | --- | --- |
| `d1-core` | flat-plate steel core | rejected by the owner on sight: constant section, axis level with the chine, "a cake" | verdict recorded in the [d2 log](discrepancy-log-d4a-rig.md) | deleted — nothing in that shape is worth keeping |
| `d2-loft-core` | lofted steel core: crown and belly lines, lens section | superseded by `d2b`; the loft was accepted, the cabin was not | [discrepancy log](discrepancy-log-d4a-rig.md), — captures replaced by `d2b` |
| `d2b-cabin-core` | canopy structure | superseded by `d2c` | folded into the [d2c log](discrepancy-log-d4a-rig.md) | replaced |
| `d2c-dorsal-core` | raked cut, crest to the tail, sunken channels | superseded by `d3a` | folded into the [d3a log](discrepancy-log-d4a-rig.md) | replaced |
| `d3a-dorsal-skin` | top silhouette, transition, chine band, cabin wedge | **accepted by the owner 2026-08-08** | folded into the [d4a log](discrepancy-log-d4a-rig.md) | superseded by `d4a` |
| `d4a-rig` | eight fans with real flow paths, four retractable splayed legs, centreline gun and two conformal launcher bays, canopy glazing with bulkhead and interior | awaiting owner review | [discrepancy log](discrepancy-log-d4a-rig.md), [manifest](d4a-rig/manifest.json) | [reference-match](d4a-rig/reference-match.png), [rotor detail](d4a-rig/rotor-detail.png), [gear detail](d4a-rig/gear-detail.png), [belly](d4a-rig/belly.png), [canopy](d4a-rig/canopy-detail.png), [canopy cutaway](d4a-rig/canopy-detail-cutaway.png), [left](d4a-rig/left.png), [front](d4a-rig/front.png), [rear](d4a-rig/rear.png), [top](d4a-rig/top.png), [high 3/4](d4a-rig/high-three-quarter.png), [underside](d4a-rig/underside.png) |
| `d4b-finish` | armour skin over the frozen core: faceted terraces, nose/canopy continuum, dorsal channel hump | not started | — | — |
| `d5-materials` | fans, spinners, pylons, stators, guards, four legs, gun, sensor, materials, lighting | not started | — | — |

`reference/` holds the owner-selected concept and owns visual character only.
The file is still an open debt: it lives in the conversation, so no registered
pixel-fit metric is claimed for `d1`.

No prefab, physics body, scene registration or world placement exists for this
object, by contract.
