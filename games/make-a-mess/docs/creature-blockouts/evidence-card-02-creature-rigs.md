# Evidence card 02 — creature skeletons and key action poses

Дата: 2026-08-13
Статус: `rig-m1 / ready-for-owner-review`
Единицы: метры, радианы
Координаты: `+Y` вверх, `+Z` вперёд, `Y = 0` — плоскость изолированной опоры

## Владелец и representation policy

Канонические владельцы этого milestone:

- принятая геометрия и материалы — `mediumPantherObject.ts` и
  `mediumDragonObject.ts`;
- единая FK-иерархия, преобразование частей и точный ground correction —
  `creatureRig.ts`;
- видовые скелеты, pose contracts и детерминированные атласы —
  `mediumPantherRigObject.ts` и `mediumDragonRigObject.ts`.

PNG и contact sheets — производные одного атласа на вид. Отдельных скульптур
под кадр нет: каждая поза задаёт только root transform и локальные вращения
именованных костей. Геометрия частей берётся из принятого P4 blockout.

P4 остаётся защищённой визуальной базой. Для дракона в M1 локально исправлена
скрытая длина сложенных сегментов крыла и убранных задних лап: сложенная и
раскрытая позы теперь сохраняют одну длину каждой кости. Морда, масса корпуса,
шея, хвост и общий силуэт не пересобирались.

## Protected scope

Разрешено:

- один скелет на существо;
- FK-позы без силового solver;
- аналитическое сохранение длины костей;
- диагностическое скрытие тела для показа скелета;
- PNG ключевых фаз из одного model hash.

Исключено:

- world adapter, population registration и scene placement;
- AI, pathfinding и выбор траектории;
- динамическое тело, контакты, импульсы, IK и ragdoll;
- аэродинамика, stall, wing loading и flight controller;
- физическая баллистика прыжка;
- cloth/membrane simulation, skinning мягких тканей и final skin.

## Skeleton passport

### Medium panther

- 30 bones/controls;
- axial chain: `root → pelvis → lumbar → chest → neck → head`;
- независимая scapula каждой стороны;
- forelimb: scapula/shoulder → elbow → carpus → forepaw;
- hindlimb: hip → knee → настоящий hock → hindpaw;
- 8 tail spans;
- лапа остаётся контактной коробкой принятого blockout; toe/claw chains будут
  отдельным следующим уровнем, не имитируются здесь.

### Medium dragon

- 48 bones/controls;
- axial chain: `root → pelvis → abdomen → chest`;
- 6 neck controls + head;
- hindlimb: hip → knee → ankle → hindfoot;
- каждое крыло: shoulder → elbow → wrist → metacarpal → 4 finger segments,
  плюс отдельный ground free digit;
- 11 tail controls;
- ground-folded и flight-extended — две reference-конфигурации одной иерархии,
  а не два скелета.

## Action passports

Каждая запись в коде хранит `intent → force → response`. Это не подпись кадра:
тест требует все три слоя, чтобы поза не стала беспричинным клипом.

### Panther

| Pose | Контакт/сила | Главное движение тела |
| --- | --- | --- |
| stand-observe | четыре лапы, диагональный перенос веса | глаза/голова и шея ведут, хвост отвечает позже |
| walk-support | противоположные fore/hind support | scapula и pelvis в малой противофазе, голова тише груди |
| stalk | низкий корпус, длинная опора | chest/pelvis согнуты, цель удерживается между проверками грунта |
| gallop-gather | suspension, контактов нет | конечности и поясница собираются под корпус |
| gallop-extend | suspension, контактов нет | spine/hip раскрывают шаг, forelimbs делают reach |
| jump-preload | COM внутри задней опоры | таз низко, hind chain собрана, forequarters стабилизируют направление |
| jump-flight | баллистическая фаза, контактов нет | голова ведёт landing, forepaws reach, hindlimbs уменьшают inertia |
| landing-absorb | первая fore contact | pad → carpus → elbow → scapula, pelvis приходит следом |
| lie-observe | sternum/belly support | корпус спокоен, голова поднимается независимо |

### Dragon

| Pose | Контакт/сила | Главное движение тела |
| --- | --- | --- |
| ground-observe | четыре опоры | голова/шея ведут, опоры и хвост отвечают с задержкой |
| walk-support | manus + противоположная hind foot | тяжёлая передняя конечность проходит чистой дугой |
| takeoff-preload | поздняя задняя опора | таз и грудь загружены перед vault |
| takeoff-release | контактов нет | прыжковый импульс ещё виден, начинается первый downstroke |
| flight-downstroke | силовой мах | концы крыла ниже плеч, chest получает ответ вверх/вперёд |
| flight-upstroke | reset с меньшей площадью | elbow/wrist складывают outer wing, корпус слегка проседает |
| glide | широкая несущая площадь | малые wrist/tail corrections, взгляд сканирует без root turn |
| bank-turn | асимметричное крыло | взгляд → roll → yaw/trajectory, внутреннее крыло компактнее |
| hover-brake | мощный high-AoA stroke | nose-high body тормозит, голова стабилизирована |
| dive | swept wing | голова ниже таза, лапы/хвост убраны по потоку |
| landing-flare | high AoA, hind feet reach | грудь поднимается, скорость меняется на lift/drag |
| touchdown | обе hind feet первыми | pelvis сгибается, manus готовятся к следующей опоре |

## Invariants and independent gates

| Инвариант | Владелец | Независимая проверка | Кадр |
| --- | --- | --- | --- |
| один ordered skeleton | bone hierarchy | уникальные id, parent предшествует child | skeleton profile/3q |
| длина кости не меняется от позы | rest pivots + FK | distance между итоговыми pivots во всех 21 позах | все poses |
| folded/extended dragon — один wing chain | две reference-конфигурации | длины каждого bone совпадают в допуске 2.5% | оба skeleton views |
| крыло следует morphology | wing segment contract | 1.18/1.45/0.55/0.55/0.56/0.54/0.52 m из pivots | flight skeleton front |
| ground pose не уходит контактом под пол | transformed contact boxes | rotated bounds: минимум `Y = 0`, ни один declared support ниже | ground poses |
| downstroke/upstroke различимы | pose pivots | tip ниже shoulder >0.8 m / выше >1.2 m | два flight кадра |
| bank не является root-only | left/right wing states | разница высоты tips >2.5 m | bank-turn |
| dive/flare меняют тело причинно | axial pivots | dive head ниже pelvis; flare выше >1.2 m | dive/flare |
| мир не подключён | motion constraints/import scope | `runtimeRegistered === false` | manifests |

## Rejection conditions

- длина любой кости меняется между позами;
- folded и extended dragon требуют разных bone ids или длин;
- галоп, прыжок и посадка отличаются только положением root;
- downstroke/upstroke оставляют одинаковую форму крыла;
- взгляд вращает всё тело без опорной/крыльевой реакции;
- declared ground support оказывается ниже `Y = 0`;
- в одной contact sheet смешаны model hashes;
- pose code импортируется миром до отдельной интеграционной приёмки.

## Current artifacts

- panther: revision `panther-rig-m1-2026-08-13`, hash `6719a66ed7d8`,
  617 diagnostic parts, 9 action + 2 skeleton views;
- dragon: revision `dragon-rig-m1-2026-08-13`, hash `184b365253d5`,
  1394 diagnostic parts, 12 action + 2 skeleton views.

Количество частей относится к review atlas: в нём одновременно лежат все
детерминированные позы и через `hiddenGroups` показывается одна. Это не runtime
budget и не будущий способ рендера существа.
