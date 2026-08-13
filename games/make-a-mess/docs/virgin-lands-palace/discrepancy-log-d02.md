# D02 discrepancy log

## Current revision

- Revision: `d02-2026-08-12-real-openings`
- Status: accepted and protected canonical Object Lab study
- Owner acceptance: [`acceptance-d02.md`](acceptance-d02.md)
- Astana adapter and world placement: authorized after acceptance

## Resolved cycles

| Symptom | Cause | Owning geometry | Correction | Result |
| --- | --- | --- | --- | --- |
| Sign read as white facade tiles | one box stood for each character | sign stroke assembly | rebuilt every Cyrillic character from standard metal beams | the words read as open wall-mounted letters |
| Door openings were structurally valid but visually indistinguishable | leaves shared the curtain material and had no hardware | standard double-door assembly | added two physical leaves, meeting stile, threshold and paired handles per group | `door-detail` exposes real doors in reserved bays |
| Roof became nearly black | exposed-metal material lacked sufficient reflection in the neutral lab | roof material | retained metal classification and raised the galvanized base response/roughness | all four roof planes and standing seams remain readable |
| Curtain wall lost the period vertical emphasis | mullions ended flush below the low roof edge | standard bay boundary extensions | continued each exact bay boundary 0.48 m above the upper glass, within the accepted 5.2 m envelope | front and right diagonals recover the archival fin rhythm without changing the mass contract |
| Thin cladding slivers appeared beside openings | apertures fell within centimetres of a module seam | standard panel grid | snapped only near-seam aperture cuts within a 4 cm construction tolerance | no degenerate panel remains; full carrier opening stays unchanged |
| World solver overloaded alternating curtain bays | visible 120 mm mullion covers were treated as the entire primary post | world-only structural metadata | assigned the standard concealed post foot behind each cover without changing its visible size or collider | all 1,743 accepted parts start stable |
| Window interior backs floated in the world solver | optical back planes had no authored fixing behind the real opening | world-only structural metadata | added one concealed 60 mm mounting stud and retained the back as a non-colliding 2 mm sheet | opening, reveal and finite glass remain physically unobstructed |

## Protected result

- C01/B01 mass and roof envelope are unchanged.
- All 57 auditorium windows are physical wall cuts with reveals, frame, finite
  non-emissive glass and interior depth.
- The curtain wall has one glass body per ordinary cell; four front cells are
  removed and replaced by four physical door leaves.
- No broad opaque backing exists within 1.2 m of a curtain pane.

## Acceptance verdict

The owner accepted the current facade density, lettering scale, curtain-wall
darkness and projecting fins on 2026-08-12: «делай. На рендерах отлично
выглядит». No opening, support, material-ownership or Tier A discrepancy remains.
