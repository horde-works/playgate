# Creature rig discrepancy log — M1

Статус: ready for owner review
Дата: 2026-08-13

## P1 — first FK atlas

### Panther

- **Симптом:** gallop gather и jump preload поднимали грудь и читались как
  вставание на задние лапы.
- **Причина:** знаки hip/scapula rotations увеличивали вертикальную длину цепи;
  flexion позвоночника одновременно поднимала head/chest.
- **Владелец:** `MEDIUM_PANTHER_POSES`, локальные вращения axial/limb bones.
- **Коррекция:** отделены suspension и ground preload; gather собрал четыре
  конечности под горизонтальным корпусом, preload уменьшил фактическую
  hip-to-paw высоту.
- **Regression:** bone lengths остаются постоянными; jump-preload имеет заднюю
  опору, а jump-flight — ни одной.

- **Симптом:** landing выглядел как обычная стойка с поднятыми задними лапами.
- **Причина:** fore chain оставалась почти выпрямленной.
- **Коррекция:** увеличены carpus/elbow/scapula flexion, chest опущена; pelvis и
  hindlimbs остаются фазой после первого контакта.

### Dragon

- **Симптом:** принятая folded reference визуально скрывала укороченные humerus,
  forearm и flight hindlimbs; две позы не могли принадлежать одному skeleton.
- **Причина:** P4 был silhouette blockout и не проверял длины в сложенном виде.
- **Владелец:** folded wing/hind reference pivots в `mediumDragonObject.ts`.
- **Коррекция:** длинные кости уложены зигзагом внутри принятого folded envelope;
  flight hindlimbs сложены с теми же длинами; добавлен видимый carrier к manus
  free digit.
- **Regression:** folded/extended length residual не превышает 2.5%; extended
  wing chain точно равен morphology segment contract.

- **Симптом:** skeleton flight front оказался прижат к верхней кромке кадра.
- **Причина:** камера целилась в исходную высоту, а diagnostic glide state имеет
  root translation.
- **Коррекция:** target поднят к фактическому skeleton centre, orthoHeight сжат.

## Final inspection

- Panther P3: gather/extend, low preload, airborne reach, first fore impact и
  sternal observation читаются разными силовыми состояниями.
- Dragon P2: ground support, vault/release, down/upstroke, glide, bank,
  brake-hover, dive, flare и hind touchdown различимы без мира и эффектов.
- Морда и принятые массы обеих форм сохранены.
- Остаточный сознательный предел: это key-pose FK. Межкадровая скорость,
  реальные impulses, foot IK, aerodynamic load и soft tissue follow-through
  этим milestone не заявлены.
