# Medium panther runtime discrepancy log — M3

Дата: 2026-08-13

## Исправлено до world capture

1. **Preload: передние лапы уходили на 0.35 m под пол.** M2 выравнивал кадр
   только по двум hind contacts и не проверял все видимые части. Fore chain
   пересобрана как четырёхопорная preload-стойка; все четыре лапы объявлены
   контактами.
2. **Между корректными gallop frames лапа проваливалась на 0.035 m.** Причина
   — quaternion interpolation не сохраняет плоскость опоры автоматически.
   Добавлен единый root correction по углам канонических paw boxes. Ни одна
   лапа не двигается независимо от скелета.
3. **Object Lab flight offsets были непригодны как world motion.** Высота
   `0.45–1.05 m` в атласе служила читаемости review frames и превращала бег в
   скачки. Runtime нормализует локальную suspension до `0.06–0.10 m`, а
   отдельный ground bound получает собственную дугу до `0.62 m`.
4. **Поведение могло стать скрытым свойством вида.** Переходы sprint и bound
   теперь разрешаются profile skills; территория и appearance остаются
   независимыми данными мира.

## World forward-test

5. **Runtime body и цикл не были доказаны в собранной деревне.** Добавлен
   opt-in dev-only probe через `data-mam-panther-probe`; он не существует без
   `?mamPantherProbe=1` и не входит в production behaviour. Целевой прогон
   подтвердил движение по маршруту, `5.05 m/s` на галопе, `0.58 m` отрыва,
   посадку и чтение поверхности до `0.34 m`. Стартовый world frame показал
   пантеру среди жителей и растительности без отдельного world-меша.

## Excluded scope

- player/panther physical contact, hunting, attack, damage and ragdoll — не
  дефекты M3, а исключённый scope.
