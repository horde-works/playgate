# Douglas DC-3 object study

- Evidence: [`evidence-card-01.md`](evidence-card-01.md)
- Frozen published envelope: [`source-expectations-s01.json`](source-expectations-s01.json)
- Contour hypothesis: [`contour-contract-c01.json`](contour-contract-c01.json)
- Isolated prototype B01: [`blockout-b01/`](blockout-b01/)
- Frozen teardrop-nacelle look: [`blockout-b01-freeze-teardrop/`](blockout-b01-freeze-teardrop/)
- Frozen vertical-fin look: [`blockout-b01-freeze-fin/`](blockout-b01-freeze-fin/)
- NASM stills for the nose and fin: [`references/`](references/)
- Обшивка: шов, заклёпка и стёжка числами —
  [`skin-seam-passport-p01.md`](skin-seam-passport-p01.md)
- В мире (оси, кабина, кресло, меню, створки, посадка): [`runtime-lessons.md`](runtime-lessons.md)

Canonical B01 geometry lives in
`src/content/objects/aircraft/dc3BlockoutObject.ts`. The island-airport
adapter is `islandAirportDc3.ts`; the machine class is `liftSource: "wing"`
in `src/game/dc3Airplane.ts` and sits in `airVehicles` as
`island-airport:dc3` on runway 09.

Control surfaces are cut from the wing, fin and stabilizer lofts and
posed in Object Lab (`*-flaps-down` views). Frozen look:
[`blockout-b01-freeze-surfaces/`](blockout-b01-freeze-surfaces/).
