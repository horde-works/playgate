# Creature blockout discrepancy log — P1 to P6

Статус: P4 shape accepted and protected on 2026-08-13.

## Panther

### P1

- **Симптом:** profile обрезал голову; единая длинная ribcage, крупные
  прямоугольные paws и квадратная морда читались собакой.
- **Причина:** камера не покрывала полный nose–tail envelope; грудной объём и
  paw были слиты в слишком крупные примитивы.
- **Владелец:** `mediumPantherObject.ts`, axial boxes, paw boxes, head boxes,
  Object Lab views.
- **Коррекция:** ribcage разделена на передний и задний объёмы; выделены lumbar
  и pelvis; paws укорочены; profile/top расширены.

### P2–P3

- **Симптом:** тело стало кошачьим, но лицо читалось медведем/роботом; квадратные
  золотые глаза выступали в profile.
- **Причина:** eyes и nose были полными фронтальными коробками, muzzle слишком
  длинной.
- **Коррекция:** muzzle укорочена; добавлены две whisker-pad массы; nose стала
  плоским треугольником; eyes сжаты до узких горизонтальных планок.

### P4 review proposal

- revision `panther-p4-2026-08-13`;
- model hash `a218539e2094`;
- четыре наземные лапы касаются `Y = 0`;
- profile, front, top и three-quarter сняты с одного hash;
- форма остаётся намеренно примитивной: это M1 skeleton/body review, не
  финальный skin.

## Dragon

### P1

- **Симптом:** wing planform сверху читался, но ground front/three-quarter
  выглядели коровой с вертикальными ушами и единым кубом груди.
- **Причина:** chest владела всей передней половиной одним box; brow horns шли
  вверх; tan jaw занимала почти весь фасад головы.
- **Владелец:** `mediumDragonObject.ts`, axial volumes и head primitives.
- **Коррекция:** силовой корпус разделён на chest и thorax-rear при сохранённом
  sternum-keel; muzzle и skull уменьшены; рога укорочены и отведены назад;
  глаза стали фронтальными.

### P2

- **Симптом:** общая анатомия принята владельцем, но прямоугольная спокойная
  морда осталась слишком нейтральной.
- **Коррекция P3–P4:** skull и muzzle стали отдельными сужающимися призмами;
  добавлены физические надглазничные пластины, центральное носовое ребро,
  ноздри, закрытая силовая нижняя челюсть и два коротких клыка. Светлая масса
  перенесена с верхней морды на нижнюю челюсть, чтобы убрать чтение «кабан».

### P4 review proposal

- ground revision/hash: `dragon-p4-ground-2026-08-13` / `bc6bdb042092`;
- flight revision/hash: `dragon-p4-flight-2026-08-13` / `012ac673182b`;
- обе позы построены из `MEDIUM_DRAGON_MORPHOLOGY`;
- full span `11.62 m`; четыре ground contacts касаются `Y = 0`;
- extended top показывает shoulder → humerus → forearm → metacarpal → четыре
  finger phalanges; folded ground pose использует те же владельцы сегментов.

## Owner verdict

Владелец принял текущую пантеру и четырёхконечного дракона после P4-правки
морды. Разрешён следующий изолированный M1 rig pass. Мир, поведение и силовые
решатели остаются исключены.
