# DC-3 — обшивка честными панелями

| Ревизия | Что | Состояние |
| --- | --- | --- |
| `p2-01-2026-08-15-full-skin` | + фюзеляж и мотогондолы — 268 панелей | **на приёмке** |
| `p1-01-2026-08-15-wing-empennage` | этап 1: крыло, стабилизатор, киль, рули — 152 панели | принята 15.08.2026; кадры затёрты, восстановимы |

- Карточка доказательств: [evidence-card-01-wing-empennage-panels.md](evidence-card-01-wing-empennage-panels.md)
- Журнал расхождений: [discrepancy-log-p1-01.md](discrepancy-log-p1-01.md)
- Кадры: [p2-01/](p2-01/)
- Канонический объект: `src/content/objects/aircraft/dc3SkinPanelsObject.ts`
- Тесты: `tests/dc3-skin-panels.test.mjs`
- Съёмка: `node --experimental-strip-types scripts/capture-dc3-skin-panels-object-lab.mjs`

Форма принадлежит блокауту B01: панели читают `dc3AirframeSurface`, то есть те
же band-функции, что рисуют сегодняшнюю шкуру. Второго профиля нет.
