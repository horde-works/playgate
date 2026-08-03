# Dutch polder — terrain graybox acceptance card

Status: **standalone spatial object; not yet compiled into the world.**

This is the first terrain gate after acceptance of M1–M4, H1 and H2. It is
deliberately a coarse construction diagram, not finished landscape art and
not an implementation of water.

## What is locked

- Irregular 18-point island: `143 × 109 m`, `13,058 m²`; it is a fused,
  uneven archipelago rather than a round island with a central hill.
- Six distinct buildable datums: low south polder `+0.80 m`, southeast farm
  shelf `+1.45 m`, east shelf `+1.90 m`, northwest bench `+2.40 m`, northeast
  sawyard `+2.80 m`, and displaced crown `+5.20 m`.
- Four centreline channels with actual width reservations and five bridge
  centres snapped to their named centrelines.
- Six true object envelopes. Yellow circles are clearances and origin marks,
  never placeholders to be scaled down during compilation.
- A mandatory dry-route graph from the south entry to every accepted object.
  Every segment is at most `1:12`; elevation changes use visible earth-backed
  ramp ribbons.

## What remains deliberately absent

- No water surface or current, no waterfalls, pumps or scoop-wheel coupling.
- No wind vector, cap/body yaw, nor any connection to airships. Mill rotation
  remains an object-local constant-rotation contract.
- No fine banks, retaining edges, field beds, vegetation, bridge structures,
  collision, navmesh or scene compiler output.
- No accepted object has been placed here yet. This capture shows only the
  terrain and its clearance reservations.

## Acceptance views

| View | Verifies |
| --- | --- |
| `plan.png` | unequal plates, channels, object clearances and route graph |
| `south-approach.png` | low entry ground and off-centre crown |
| `northwest.png` | domestic bench is separate from the crown |
| `east.png` | sawyard, exposed mill shelf and farm shelf are not one terrace |
| `hydrology.png` | water reservations and bridge axes without terrain camouflage |
| `silhouette.png` | non-radial floating mass |

## Mechanical checks

`tests/dutch-polder-terrain-graybox.test.mjs` protects the terrain contract:

1. shoreline count, dimensions and six datums;
2. true object ground marks and the 13 m H2 reserve;
3. coarse terrain cells never intersect a channel's mathematical water prism;
4. each bridge has two opposing bank seats and an across-channel axis;
5. all mandatory routes are connected from spawn and stay at or below `1:12`.

The next gate is a terrain refinement proposal: banks, bridge construction
envelopes, field parcels and object-foundation pads. Scene compilation follows
only after that proposal is accepted.
