# Discrepancy review — RAX-8 Tonkawa C2

## Compared material

- User-supplied concept screenshot dated `2026-08-04 21:06:55`.
- Canonical C1 hash `6551bd630fd3`.
- Evidence card 01 plus direct user corrections.

## C1 findings

1. `external bumper` — fail. Continuous outer torque rails and front/rear bridges create a rectangular safety cage absent from the concept.
2. `yaw orientation` — fail. Both yaw tunnels are parallel to the centreline; the concept uses mirrored diagonal shoulder installations.
3. `root transitions` — fail. Uniform rectangular clevises read as generic beams rather than thick-to-thin nacelle roots and open triangular bays.
4. `joint seating` — fail. Several braces terminate visually near rings or shoulder skins without a convincing transition doubler.
5. `surface hierarchy` — partial. The central armour/canopy/spine family is present, but broad flat shoulder slabs suppress the sculpted fan housings.

## C2 correction contract

- Delete every external perimeter rail/bridge from canonical geometry.
- Give each lift ring two independent inward connections at separated tangency stations.
- Use tapered root fairings over primary spars while preserving real open bays.
- Rotate complete yaw tunnel, rim, hub, blades, stators and carriers around the vertical axis by mirrored `18 deg` cant.
- Replace horizontal yaw decks with diagonal upper/lower/inboard/outboard carrier chains and local faceted armour cheeks.
- Add explicit ring saddles, root doublers and fasteners where a member enters a nacelle or survival cell.
- Recapture every view under one new model hash before owner review.

## C2 final verification

- `external bumper` — corrected. No perimeter member exists and no primary-frame part reaches the outboard rotor envelope.
- `yaw orientation` — corrected. Complete left/right assemblies, including tunnel, rotor, stators, shrouds and carriers, recover mirrored `-18/+18 deg` plan cant.
- `root transitions` — corrected. Every lift ring has two separated inward load paths; the fairings use four changing stations with chamfered eight-point sections and station-dependent width/height profiles.
- `joint seating` — corrected. Each root terminates through a tangential ring saddle and pin at the nacelle and a local doubler at the survival structure.
- `surface hierarchy` — improved. The yaw housings use local angular shrouds, the central tail remains narrow and raised, and there is no horizontal shelf or exterior cage.
- Canonical result: `429/900` parts, recovered envelope `6.889 x 6.873 x 2.000 m`, `11/11` independent tests pass, lint passes.
- Full thirteen-view PNG set recaptured from revision `combat-hex-c2-2026-08-04`, model hash `608adbcf79a1`.
- Owner accepted C2 on `2026-08-04`: not a literal concept copy, but the required brutal character and resolved forms are accepted.
- Post-acceptance runtime adapter compiles the same `429` parts into one cluster with six lift and two reversible canted-yaw actuator channels.
- Combined yaw control preserves the ordinary lift-rotor reaction channel and adds the dedicated pair below the unchanged yaw-rate autopilot interface.
- Public designation fixed after acceptance as `RAX-8 Tonkawa`; internal ids remain stable.
- The accepted model is registered only in its dedicated 100 m proving ground, with a physical autonomous launch post and closed return circuit.

## C2 post-acceptance correction — рама фонаря (2026-08-07)

Две болезни одного класса: силовой элемент рамы построен без оглядки на обвод
остекления. Обе видны только вблизи, поэтому к принятому набору добавлена
камера `canopy-frame`.

1. `crown rail nose` — наблюдение: продольный рельс поверх стекла кончается
   огрызком ЗА поперечным обводом остекления, в воздухе над бронёй носа.
   Причина: торцевая крышка торсионного короба перпендикулярна ОСИ, а рельс на
   носовой секции идёт под 30° — верхний угол крышки уходит вперёд на
   `(h/2)·sin` = 18 мм при узле, поставленном ровно на обвод (`2.098` против
   `2.080`). У комингсов та же арифметика давала 9 мм.
   Владелец: `combatHexacopterObject.ts`, сборка `canopy-crown-rail` и
   `canopy-coaming-*`. Исправление: носовой узел утапливается вдоль оси на
   ИЗМЕРЕННЫЙ по построенному коробу вынос плюс 4 мм зазора
   (`insetToCanopyFrontFrame`). Результат: вся рама фонаря кончается на
   `2.076` — внутри обвода `2.080`.

2. `canopy pillars` — наблюдение: пара задних боковых стоек «наезжает на
   стекло»: тело стойки утоплено в панель, наружу торчит только верхний
   огрызок. Причина: стойка построена ПРЯМЫМ коробом между пятой и коньком, а
   обвод в этом месте выпуклый — хорда проходит на 5 см внутри ломаной
   пята→стекло→конёк. Тот же дефект был у средней пары.
   Владелец: там же, `canopy-mid-pillar-*` и `canopy-aft-pillar-*`.
   Исправление: стойка строится по узлам самого обвода
   (`canopySectionAt` + `canopyPillarFacets`) и доводится до продольного
   рельса — шпангоут отдаёт нагрузку хребту, а не кончается торцом посреди
   панели.

Проверка: два независимых детектора в `tests/combat-hexacopter.test.mjs`
снимают замер с ВЫПУЩЕННЫХ мешей (обвод восстанавливается из вершин
`canopy-glazing`): «рама не выходит за поперечный обвод» и «стойка идёт по
обводу, а не по хорде». На прежней геометрии оба красные (18 мм выноса;
0.261 м от угла остекления). Набор PNG переснят целиком, model hash
`d5829325aa71`; часть `429`, ревизия `combat-hex-c2-2026-08-04` не менялась.
Дефект подтверждён и снят также в живой сцене полигона.
