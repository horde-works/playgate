# Zaan yard kit — prefab handoff

This sheet is for the agent that will place the objects in the polder. The eleven registrations below contain canonical geometry and established opaque material bindings, but deliberately contain no site coordinates, rotations, terrain adaptation or scene instances.

Local object coordinates are metres at `1:1`, with `+Y` up. Placement must preserve the object's named ground/water/wall relationship rather than merely place its origin on a sampled surface.

| # | Prefab id | Governing envelope | Parts | Runtime material families | Placement datum to preserve |
| --- | --- | --- | ---: | --- | --- |
| 1 | `dutch:landscape:schouw` | hull `4.60 × 1.45 × 0.45 m` | 54 | dark/mid timber, light paint, forged metal | waterline and shallow hull draft; do not ground the bottom on terrain |
| 2 | `dutch:landscape:mooring-posts` | pair at `3.20 m` centres; each `Ø0.18 × 1.60 m` | 10 | dark timber, forged metal | authored waterline; driven lower lengths remain below it |
| 3 | `dutch:landscape:jetty` | deck `2.40 × 1.10 m`, top `0.30 m` above water | 17 | dark/mid timber | four piles carry the deck; two steps descend toward water |
| 4 | `dutch:landscape:yard-shed` | footprint `4.60 × 6.40 m`; roof `5.10 × 6.90 m`; ridge `4.15 m` | 120 | dark/mid timber, green cladding, light trim, warm roof, metal | foundation is the ground datum; preserve door/hoist working apron |
| 5 | `dutch:landscape:peat-store` | `2.60 × 1.20 m`; front/rear posts `2.15 / 1.75 m` | 37 | dark timber, warm roof, peat/soil | all four posts ground; open front and ventilated stack remain accessible |
| 6 | `dutch:landscape:privy` | plan `1.05 × 1.25 m`; water-side cantilever `1.10 m` | 45 | dark timber, green cladding, light trim, warm roof, metal | bank beams carry the front; open rear/drop must remain over water |
| 7 | `dutch:landscape:hand-pump` | stone `0.55 × 0.55 m`; iron column `1.15 m` | 14 | masonry/stone, metal, dark/mid timber | stone base grounds; bucket sits under the spout, lever has rear clearance |
| 8 | `dutch:landscape:drying-line` | span `7.00 m`; line height `2.00 m` | 9 | dark/mid timber, line/metal | both posts ground; prop bears on ground and tensioned line stays clear |
| 9 | `dutch:landscape:bean-frame` | bed `2.60 × 1.10 m`; poles `2.40 m` | 13 | soil, dark/mid timber, line/metal | soil bed sits on garden grade; pole feet penetrate/bear into it |
| 10 | `dutch:landscape:picket-fence` | fence module `3.00 m`; gate opening `0.95 m` | 46 | green cladding, light paint, dark timber, metal | all posts ground; gate swing/latch side and hinge post stay usable |
| 11 | `dutch:landscape:rain-barrel` | barrel `Ø0.62 × 0.88 m`; service top `2.10 m` | 18 | mid/dark timber, forged metal, brick | both bricks ground; downspout brackets meet the future wall plane and outlet remains `0.15 m` above the open barrel |

Total canonical inventory for these eleven prefabs: `383 / 600` parts.

## Material binding contract

- `timber-dark` → established dark weathered plank/wood material, base colour `#35291f`.
- `timber-mid` → established ordinary/oak plank material, base colour `#6f5035`.
- `cladding` → established Zaan green cladding, base colour `#376448`.
- `paint-light` → established warm off-white paint, base colour `#d4d0be`.
- `roof-warm` → established warm roof covering, base colour `#96624b`.
- `brick` → established brick/masonry material, base colour `#8a5944`.
- `metal` → established forged/cast metal material, base colour `#535a5d`.
- `soil-bed` → established garden soil/peat material, base colour `#5c4431`.

Every prefab consumes the canonical part array directly. Informational transparency used in cutaway/reference views is not transferred to runtime pieces; the registered pieces are filled and opaque.

## Explicitly outside this handoff

- No insertion into `dutchPolderDocument.ts` or any other world document.
- No terrain snapping, bank cutting, water-level choice, orientation, route clearance, parcel ownership or reserve consumption.
- No invented wall, bank, canal surface, ground slab or contextual scenery inside a prefab.
