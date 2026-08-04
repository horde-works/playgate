# Evidence card 02 — real windows and lamps

## Identity and authority

- `direct user correction`: every visible window is a real opening with frame,
  transparent glass and an interior volume; decorative or false windows are
  forbidden.
- `direct user correction`: a window pane never acts as a luminous panel. A
  visible lamp, flame or bulb sits inside a separate transparent glass envelope
  and owns the point-light origin.
- Existing accepted building massing, mill mechanisms, rotor clearances and
  world placement remain protected.

## Baseline audit

- M1: 1/1 window sits over the unbroken octagonal smock face.
- M2: 2/2 windows sit over the unbroken lower frustum / upper-house box.
- M3: 10/10 windows sit over unbroken side walls, gable or tower face.
- M4: 2/2 windows sit over the unbroken upper-body frustum.
- Eight panes use `lit-glazing`; runtime interprets the colour as emissive.
- Existing lamp helpers attach the point source to the whole glass cube instead
  of to a separate contained bulb.

This baseline is historical. The accepted implementation and capture hashes are
recorded in `discrepancy-02-real-windows-and-lamps-a3.md`.

## Canonical construction contract

For every window:

`wall segments around void -> four reveals -> frame -> mullions/transoms -> transparent glass -> visible interior depth`

For every authored lamp:

`carrier -> plate/hook -> arm/chain -> cap/base -> transparent lens -> contained bulb/flame -> point light at bulb centre`

- Glass uses ordinary transparent glazing by day and night.
- Only the contained bulb/flame may use the warm emissive colour.
- Interior light reaches the window from the lamp; the pane itself contributes
  no emissive term and owns no point light.
- An unlit window remains transparent and shows the darker interior rather than
  an opaque black rectangle.

## Rejection conditions

- Any wall/cladding triangle or box covers a window clear opening.
- Any window lacks all four frame/reveal sides or contains no transparent glass.
- Any window glass uses `lit-glazing`, `litWindowColor`, or owns a point source.
- Any lamp source is not inside a smaller bulb/flame part and that bulb is not
  geometrically contained by a larger transparent lens.
- A night view shows a uniformly glowing pane without a visible interior lamp.
- Removing the glass would reveal a solid wall rather than an opening/interior.

## Invariant -> independent test -> fixed view

| Invariant | Independent test | Fixed view |
| --- | --- | --- |
| 15 mill windows are true voids | probe each clear opening against emitted shell geometry | front / left / three-quarter |
| ordinary panes never emit | no canonical part uses `lit-glazing`; mapped glass colour is non-emissive | paired day/night |
| lamp is inside its lens | bulb bounds strictly contained by matching lens; light origin equals bulb centre | night detail / night full |
| interior exists behind every window | each window has an inward reveal and interior-depth witness behind the glass | high three-quarter / night |
