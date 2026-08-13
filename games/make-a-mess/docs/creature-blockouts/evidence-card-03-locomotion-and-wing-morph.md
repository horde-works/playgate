# Evidence card 03 — feline locomotion and pterosaur-like wing morphing

Дата: 2026-08-13  
Статус: `rig-m2 / contract-frozen`  
Единицы: метры, радианы  
Координаты: `+Y` вверх, `+Z` вперёд, `Y = 0` — плоскость изолированной опоры

## Protected scope

Этот milestone уточняет только артикуляцию уже принятой геометрии P4.
Пропорции, морда, материалы, именованные части и один скелет на вид защищены.
Мир, population profiles, AI, pathfinding, динамика полёта, баллистика, IK,
ragdoll и final skin не подключаются.

## Source hierarchy

### Panther / large felid

1. Bertram & Gutmann, 2009 — механика ротационного галопа гепарда:
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC2696142/>.
2. Kamimura et al., 2022 — extended/gathered suspension и роль позвоночника:
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC9049215/>.
3. Polet & Bertram, 2019 — общая механика и порядок симметричных аллюров:
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC7805771/>.
4. Видео и фильмы допустимы только как визуальная проверка силуэта; они не
   могут отменить порядок контактов и причинную механику из источников выше.

### Dragon / pterosaur-inspired wing

1. Padian & Rayner, 1993 — межфаланговые суставы длинного пальца имеют
   ограниченную подвижность; палец работает почти прямым лонжероном:
   <https://ajsonline.org/article/124097.pdf>.
2. Wilkinson, 2008 — плечо, запястье, продольные вращения и управление углом
   атаки/задней кромкой:
   <https://academic.oup.com/zoolinnean/article-pdf/154/1/27/16634629/j.1096-3642.2008.00409.x.pdf>.
3. Habib, 2008 — четырёхопорный запуск с основным forelimb vault:
   <https://epub.ub.uni-muenchen.de/12011/>.
4. Griffin et al., 2022 — достижимые суставные положения для quadrupedal
   launch: <https://academic.oup.com/biolinnean/article/137/2/250/6672675>.
5. Kellner et al., 2010 — многослойная мембрана, actinofibrils и различная
   жёсткость proximal/distal областей:
   <https://pmc.ncbi.nlm.nih.gov/articles/PMC2842671/>.

Дракон остаётся вымышленным. Из птерозавров переносится конструктивная логика
передней конечности и мембраны, а не заявленная реконструкция конкретного вида.

## Panther locomotion passport

### Walk — 8 review frames

- четырёхтактный lateral-sequence walk: `LH → LF → RH → RF`;
- между постановками — три опоры, на переходе видна пара опор;
- поднятая лапа проходит низко и ставится до переноса массы;
- hind paw стремится к следу ipsilateral forepaw, но не телепортируется в него;
- pelvis и scapula имеют малую противофазу, позвоночник почти не пружинит;
- голова тише грудной клетки, хвост отвечает на yaw таза с задержкой.

Восемь кадров чередуют `swing` и `contact` каждой лапы. Это не восемь
независимых стоек: последний кадр должен без скачка продолжаться первым.

### Trot — 4 review frames

- диагональные пары `LF+RH` и `RF+LH`;
- короткая разгрузка между диагоналями, но не галопная collected suspension;
- грудь и таз сохраняют небольшой вертикальный ход;
- голова стабилизируется шеей, scapula проходит по грудной клетке.

### Rotary gallop — 8 review frames

Цикл начинается после главной extended suspension:

1. extended suspension, позвоночник раскрыт;
2. near fore contact принимает нисходящий COM;
3. far fore contact завершает переднюю опору;
4. gathered suspension, позвоночник согнут;
5. far hind contact начинает разгон;
6. near hind contact/последний push;
7. позвоночник раскрывается после toe-off;
8. extended suspension перед новым fore contact.

Обязательны обе фазы без опоры. Forelimbs принимают переход траектории, hindlimbs
его завершают и создают следующий extended flight. Хвост не является рулём сам
по себе: он гасит roll/yaw, возникшие от асимметрии контактов.

### Transitions

- acceleration: корпус ниже, hind push длиннее, голова уже смотрит в corridor;
- braking: fore chain принимает импульс pad → carpus → elbow → scapula, pelvis
  приходит позже; это не зеркальный acceleration.

## Dragon wing passport

### Canonical chain and permitted motion

`shoulder → elbow → wrist → metacarpal → long-finger knuckle → four long
phalanges`.

В текущем skeleton pivot `metacarpal` является основанием первого длинного
сегмента и владельцем активного knuckle fold. Наружные `finger-1..finger-3`
могут иметь только малую пассивную деформацию; они не образуют управляемый
зигзаг. `finger-4` — конечная контрольная точка, не отдельный активный шарнир.

| Control | Role | M2 rule |
| --- | --- | --- |
| shoulder | stroke, sweep, root AoA | главный силовой привод |
| elbow | span reduction/recovery | активный fold |
| wrist | outer-wing sweep and twist | активный fold/trim |
| metacarpal / knuckle | разворачивание длинного пальца | активный, большой ход |
| finger IP joints | упругий лонжерон | `≤ 0.06 rad` локального отклонения |
| membrane | площадь, camber, twist, tension | следует суставам; не жёсткая панель |

Числа движения в атласе — авторские границы для этого вымышленного животного,
а не измеренная ROM конкретного птерозавра. Абсолютный инвариант — распределение
функций: большие изменения формы происходят до длинных фаланг.

### Takeoff sequence

1. preload: четыре контакта, крыло компактно, hindlimbs и manus загружены;
2. hind drive: таз поднимается, manus ещё держат опору;
3. manus vault: задние лапы уже разгружены, передние конечности дают последний
   импульс;
4. clearance: контактов нет, крыло ещё частично сложено и не режет землю;
5. unfold: elbow → wrist → knuckle увеличивают площадь после клиренса;
6. first power stroke: почти полный размах, затем силовой downstroke.

### Flight control

- downstroke: большой размах, высокая tension, крутка уменьшает tip AoA;
- upstroke: elbow/wrist/knuckle складывают outer area, снижая drag;
- glide: широкий планер с малыми trim-коррекциями, не замороженная доска;
- bank: внутреннее крыло компактнее и сильнее скручено, внешнее несёт большую
  площадь; голова выбирает выход раньше root yaw;
- dive: sweep и knuckle fold уменьшают площадь/camber;
- brake/hover: высокие AoA и camber, тело висит nose-high, ноги готовы к exit.

### Landing sequence

1. flare: площадь и camber максимальны, hind feet идут вперёд;
2. hind touchdown: крылья ещё несут часть веса и остаются раскрыты;
3. unload: elbow/wrist/knuckle складываются после переноса нагрузки на ноги;
4. ground recovery: manus возвращаются к опоре, крыло укладывается последним.

Запрещён мгновенный переход `полностью раскрыто → ground-folded` в кадре
первого касания.

## Independent gates

| Invariant | Independent measurement | Review frame |
| --- | --- | --- |
| walk order and support | declared contacts in 8-frame order | panther walk sheet |
| trot diagonals | alternating diagonal contact sets | panther trot sheet |
| rotary gallop | fore contacts → gathered flight → hind contacts → extended flight | panther gallop sheet |
| gait is not root-only | limb, scapula/pelvis and axial rotations vary | all locomotion sheets |
| active dragon morphing | elbow, wrist and knuckle differ across upstroke/dive/flare | dragon wing sheet |
| outer phalanges remain spar-like | each local finger IP rotation `≤ 0.06 rad` | tests + skeleton views |
| takeoff clears before full area | clearance precedes unfold/first power stroke | dragon takeoff sheet |
| touchdown keeps wing load | touchdown uses extended reference; fold follows later | dragon landing sheet |
| declared ground contacts | transformed support bottoms never below `Y = 0` | all grounded frames |
| one geometry owner | all frames derive from P4 parts and named skeleton | manifests/tests |

## Rejection conditions

- walk снова читается как диагональная рысь;
- у галопа нет gathered или extended suspension;
- позвоночник и пояса не различают walk, trot и gallop;
- upstroke/dive меняют только плечо при раскрытом длинном пальце;
- длинные фаланги складываются независимым «гармошечным» зигзагом;
- первый полный мах происходит до физического клиренса;
- крыло исчезает в folded reference в кадре hind touchdown;
- для кадра создана отдельная геометрия вместо производной skeleton pose.

## Current artifacts

- panther: revision `panther-rig-m2-2026-08-13`, hash `a9d140b8c3ea`, 28
  action/gait frames + 2 skeleton views;
- dragon: revision `dragon-rig-m2-2026-08-13`, hash `79e11bdb0948`, 18 action
  frames + 2 skeleton views;
- полные 1600×1000 PNG и manifests: `poses/m2/`;
- обзорные листы: `review/*-rig-m2-*.png`;
- фактические span checks: clearance `0.37 m`, unfold `9.72 m`, upstroke
  `5.52 m`, glide `11.59 m`, dive `5.06 m`, touchdown `11.54 m`, unload
  `3.44 m`.
