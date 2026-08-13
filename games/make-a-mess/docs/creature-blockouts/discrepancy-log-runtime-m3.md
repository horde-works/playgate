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

## Pending

- world-frame capture: размер рядом с жителем, читаемость чёрного корпуса,
  тень в движении, отсутствие щелей в локтях/скакательных суставах;
- player/panther physical contact, hunting, attack, damage and ragdoll — не
  дефекты M3, а исключённый scope.
