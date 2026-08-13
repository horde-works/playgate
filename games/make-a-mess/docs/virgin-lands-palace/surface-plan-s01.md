# Surface and standard-element plan S01

## Status and ownership

- **Basis:** owner-approved contour C01 and blockout B01.
- **Canonical owner after implementation:** one TypeScript `ObjectLabModel`;
  B01 dimensions migrate unchanged into that model.
- **Derived artifacts:** Object Lab PNGs, masks, reports and the later Astana
  adapter. None may contain independently authored geometry.
- **Protected:** 48 × 34 m low envelope, 34 × 24 m hall at `x=-5`, `z=-4`,
  15.625 m apex, 9 m square-side foyer and 12 m right wing.

## Body families

| System | Body family | Silhouette owner | Construction policy |
| --- | --- | --- | --- |
| Foyer floors, roof plate and fascia | planar slabs and beams | yes, low volume | standard boxes only |
| Foyer curtain wall | open mullion/transom lattice | yes at ground and glazing edge | reusable standard curtain-wall bays |
| Entrance doors | framed glazed leaves inside reserved door bays | local | reusable standard double-door assemblies |
| Auditorium walls | segmented thick wall | yes | standard wall bands cut around an opening schedule; no full backing box |
| Auditorium windows | void + four reveals + frame + finite glass + interior depth | local | reusable standard window assemblies |
| Stone facade | modular rain-screen panels | no | standard rectangular panels, omitted over every aperture |
| Coloured ceramic accents | selected facade modules | no | standard panels; never represented as dark fake windows |
| Auditorium roof | shallow hipped plate assembly | yes | four custom planar meshes because the approved roof is not a box |
| Wall lettering | shallow metal stroke letters | identity only | repeated standard beams, carried by the opaque wall |

Only the four roof planes require custom mesh topology. Everything else is a
standard box, beam or reusable rectangular assembly.

## Foyer construction

### Upper curtain wall

- Public facade: 24 equal bays across 48 m.
- Right return: 17 equal bays across 34 m.
- One physical aluminium mullion at every bay boundary; transoms share exact
  boundaries with adjacent glass panes.
- Each pane is its own non-emissive finite glass body. There is no opaque wall,
  dark panel or second glass sheet behind the curtain wall.
- The roof plate and intermediate edge beam carry the lattice. Mullions do not
  end in air.

### Recessed ground storey

- The ground curtain line is inset 1.4 m from the upper line, preserving the
  B01 recess.
- Two double-door groups occupy four whole public-facade bays under the hall.
- Door bays contain frame, threshold and two actual leaves. They contain no
  curtain-wall pane and no wall segment behind the doors.
- A foyer floor, ceiling and interior rear surface begin beyond the glass;
  none sits directly against it or impersonates a black window.

## Auditorium facade

### Square-side wall

- Fifteen low horizontal windows form the published photographic band.
- Seven sparse square windows are treated as actual openings.
- Small red and blue marks that do not read as apertures remain ceramic accent
  panels, not glass.
- The wall is generated as solid intervals around the full opening schedule.
  Window rays therefore cross reveal, glass and interior air without meeting
  an uncut carrier.

### Other walls

- Side/rear opening counts remain conservative and are marked authored because
  no measured elevations were found.
- The rear receives no invented ceremonial entrance.
- Any later source that establishes a hidden opening replaces the authored
  schedule and triggers a local facade recapture, not a new building mass.

## Standard opening assembly

Every window has this chain:

`segmented wall void → jamb/head/sill reveals → aluminium frame → ordinary glass → interior air → interior back surface`

Every door has this chain:

`reserved structural bay → jamb/head/threshold → frame → physical leaf and glass → foyer interior`

Forbidden shortcuts:

- glass or a door leaf placed over a complete wall;
- black material used as a hole;
- opaque backing immediately behind glazing;
- a single full-facade glass sheet beneath a decorative mullion grid;
- emitting window glass;
- overlapping coplanar panels at bay boundaries.

## Materials

| Semantic id | Physical family | Finish |
| --- | --- | --- |
| `palace-concrete` | dielectric concrete | pale, matte |
| `palace-stone` | light stone/ceramic rain-screen | pale warm grey, matte |
| `palace-accent-blue` / `palace-accent-red` | glazed ceramic | coloured satin |
| `palace-frame-metal` | exposed aluminium | dark anodised, metal |
| `palace-glazing` | architectural glass | blue-grey, transparent, non-emissive |
| `palace-roof-metal` | standing-seam sheet metal | cool grey, metal |
| `palace-interior-dark` | interior finish | dark, non-emissive |
| `palace-sign-metal` | painted metal | warm off-white |

## Independent rejection tests

1. Recover the facade wall intervals from emitted geometry and assert zero
   opaque overlap with every window aperture.
2. Assert that no curtain-wall pane has an opaque carrier within the first
   1.2 m behind its full clear rectangle.
3. Assert one glass body per non-door bay and zero ordinary panes in door bays.
4. Recover door-leaf bounds and prove each stays inside its own reserved bay.
5. Recover mullion endpoints and prove every vertical member seats on a slab or
   edge beam at both ends.
6. Assert transparent inventory contains only real glazing and glazed door
   leaves; none emits.
7. Assert custom mesh inventory contains only the accepted four roof planes.
8. Mutate one auditorium aperture in a disposable test fixture and prove the
   wall-overlap test fails.

## Fixed exposing cameras

- `front-square`: complete opening band and entrance bays;
- `foyer-corner`: public facade, right return and recessed ground line;
- `right-grazing`: pane thickness, mullions and absence of backing walls;
- `auditorium-window-detail`: one real wall cut, reveals, frame and glass;
- `door-detail`: one real double-door bay;
- `high-three-quarter`: roof and protected mass distribution;
- paired `foyer-corner-cutaway`: hides only the outer glass group to expose
  interior depth from the identical camera.

S01 authorizes facade implementation but not Astana-world integration.
