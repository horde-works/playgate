# Discrepancy 02 — real windows and contained lamps, A3

## Initial defects

- All 15 mill windows were trim/glass placed over uninterrupted shell geometry.
- Eight window panes used the emissive `lit-glazing` material.
- The fixture helper assigned the source to the whole glass lens cube.
- M4 had a second hidden closure: stepped exterior plank courses crossed both
  window clear openings even after the underlying frustum had been cut.
- The first M1/M3 night detail renders proved that a geometrically valid lamp
  could still be hidden behind a mullion or transparent-layer draw order.

## Corrections

- Rebuilt the mill shells and cladding around actual window voids.
- Added four reveals, four frame sides, muntins/transoms, ordinary transparent
  glazing and interior-depth geometry to every mill window.
- Removed `lit-glazing`; house panes previously used as luminous panels now use
  ordinary glazing with real lamps repositioned inside the rooms.
- Split the lamp into clear non-emissive lens plus a smaller contained bulb. The
  bulb alone owns the point source at its centre.
- Offset M1 and M3 interior fixtures from their central mullions and added fixed
  exterior night detail cameras.
- Made Object Lab render nested transparent layers in physical order: window
  glass, clear lens, then contained bulb. This prevents correct inner geometry
  from disappearing behind an outer transparent envelope.

## Independent checks

- 15/15 mill windows pass the shell/cladding probe through the clear opening.
- 15/15 have left/right/head/sill frames and reveals.
- 33 window glazing parts across M1–M4/H1/H2 are ordinary non-emissive glass.
- 18 canonical fixture lenses contain 18 smaller bulbs; lenses own no source,
  bulbs own the source at their centre.
- The compiled polder scene authors 22 physical bulbs. The nearby-light pool is
  still capped at six active sources.
- Targeted real-window, prefab, lighting and mill suites pass 39/39.

## A3 capture set

This set is superseded by
`discrepancy-03-exterior-carriers-and-night-range-a4.md`; it remains here as
the historical proof for the window/lens correction.

| Object | Revision | Hash | Views |
| --- | --- | --- | ---: |
| M1 De Kat | `m1-2026-08-04-real-windows-a3` | `772091cd9bde` | 10 |
| M2 Oudegein | `m2-2026-08-04-real-windows-a2` | `5c489a9248f6` | 10 |
| M3 Jonge Schaap | `m3-2026-08-04-real-windows-a3` | `7c1e99cd6a36` | 11 |
| M4 Gekroonde Poelenburg | `m4-2026-08-04-real-windows-a2` | `3ebc3b684bce` | 11 |
| H1 Zaan house | `h1-2026-08-04-real-windows-a2` | `166b7cc33bcf` | 11 |
| H2 Stolp farm | `h2-2026-08-04-real-windows-a2` | `77118a7f96d9` | 11 |
| Landscape kit | `landscape-kit-a17-2026-08-04` | `ac7e537d4b16` | 56 |

## Remaining boundary

Water reflection is outside this correction because the real water renderer is
not yet part of the world. The authored bulbs and bounded light pools are ready
to participate when that pass exists; no reflection billboard is substituted.
