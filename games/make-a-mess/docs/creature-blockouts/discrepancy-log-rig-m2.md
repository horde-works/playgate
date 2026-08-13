# Creature locomotion and wing-morph discrepancy log — M2

Статус: ready for owner review  
Дата: 2026-08-13

## P1 — first expanded atlas

### Panther

- **Симптом:** M1 `walk-support` читался как диагональная рысь и не доказывал
  ходьбу.
- **Причина:** один кадр одновременно пытался представлять цикл и опору.
- **Владелец:** `MEDIUM_PANTHER_POSES`.
- **Коррекция:** заменён восьмикадровым lateral-sequence walk; подъём и
  постановка каждой лапы разделены, промежуточная опора трёхточечная.
- **Regression:** порядок `LH → LF → RH → RF`, 8 кадров, все четыре лапы новых
  grounded locomotion frames не проходят ниже `Y = 0`.

- **Симптом:** первые gathered/contact кадры галопа показывали свободные лапы
  ниже пола и складывали их назад, а не под корпус.
- **Причина:** значения суставных углов были выбраны по словесному знаку
  `flexion`, а не по итоговым мировым pivots этой конкретной иерархии.
- **Владелец:** константы `FORE_GATHER` и `HIND_GATHER`.
- **Коррекция:** углы восстановлены по положению paw pivots; собранные лапы
  теперь выше поверхности и находятся под грудью/тазом.
- **Regression:** тест измеряет итоговые box bounds всех лап во всех новых
  grounded locomotion frames.

- **Симптом:** короткая разгрузка рыси почти не отделялась от пола.
- **Коррекция:** увеличен только вертикальный root interval двух unload frames;
  позвоночник оставлен значительно спокойнее, чем в галопе.

### Dragon

- **Симптом:** M1 upstroke, dive и turn в основном меняли плечо; длинный палец
  оставался полностью раскрытым.
- **Причина:** elbow/wrist не были связаны с отдельным knuckle control, а
  межфаланговая цепь не имела явного ограничения.
- **Владелец:** `MEDIUM_DRAGON_WING_MOTION`, `wingRotations`, wing pose data.
- **Коррекция:** активная морфология распределена между shoulder, elbow, wrist
  и metacarpal/knuckle. Внешние interphalangeal controls ограничены `0.06 rad`
  и используются только как малая пассивная упругость.
- **Regression:** фактический full span: glide `11.59 m`, upstroke `5.52 m`,
  dive `5.06 m`; наружные фаланги не образуют гармошку.

- **Симптом:** M1 объединял отрыв и первый downstroke, а первый hind touchdown
  уже переключал модель в fully folded reference.
- **Причина:** взлёт и посадка были представлены слишком крупными фазами.
- **Коррекция:** взлёт разделён на 6 кадров, посадка на 4. Clearance span равен
  `0.37 m`, после него unfold раскрывает `9.72 m`. На hind touchdown wing span
  ещё `11.54 m`, после unload — `3.44 m`, затем ground recovery.

- **Симптом:** первый preload визуально выпрямлял шею и поднимал грудь.
- **Причина:** root pitch и чрезмерная hip flexion вращали всю осевую цепь при
  ground correction.
- **Владелец:** `takeoff-preload` и `takeoff-hind-drive` body rotations.
- **Коррекция:** root pitch убран, сгибание перенесено в локальные abdomen/chest
  и hind joints; manus/hind supports остаются явно читаемыми.

- **Симптом:** кадры полного крыла обрезались справа после раскрытия M2.
- **Коррекция:** одна общая flight camera отодвинута для всех воздушных фаз;
  форма и масштабы не менялись.

## Final inspection

- Panther: 28 action/gait frames + 2 skeleton views, 1795 review parts, model
  hash `a9d140b8c3ea`.
- Dragon: 18 action frames + 2 skeleton views, 1996 review parts, model hash
  `79e11bdb0948`.
- Максимальный folded/extended residual длины dragon bones: `0.87%`;
  pose-to-pose bone-length residual остаётся в машинном допуске `1e-9 m`.
- PNG каждого вида сняты одним model hash; отдельной геометрии под кадр нет.
- Остаточный сознательный предел: это key-pose FK и faceted membrane. Timing,
  interpolation, foot IK, soft tissue, impulses и аэродинамический solver этим
  milestone не заявлены.
