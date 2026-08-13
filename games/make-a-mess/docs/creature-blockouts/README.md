# Creature blockouts

Изолированный M1-блок-аут двух будущих живых существ. Эти файлы не
регистрируют животных в мире, не задают поведение и не обещают готовую
аэродинамику. Они фиксируют только один канонический набор размеров, суставных
осей и примитивных объёмов, из которого сняты PNG для решения владельца.

## Текущий выбор

- `medium-panther` — взрослый меланистический леопард, `50 kg`, `0.70 m` в
  холке, нейтральная внимательная стойка;
- `medium-dragon` — взрослый четырёхконечный дракон, `180 kg`, крыло является
  передней конечностью, `11.62 m` полный размах;
- визуальный язык — те же читаемые коробки и сегментные балки, что у жителей;
  мембрана крыла остаётся единственной тонкой треугольной поверхностью;
- интеграция в мир, skin/видовые варианты, IK, физика, полёт и прыжки исключены
  из этого milestone.

Геометрия обеих поз дракона строится из одного morphology contract. Полётный
вид не является второй моделью животного: он только раскрывает те же сегменты
крыла для проверки planform.

## Review gate

Форма принята владельцем 2026-08-13. Защищены пропорции пантеры, четырёхконечный
план дракона, сложенный/раскрытый силуэт крыла и угрожающая морда дракона.
Следующий milestone может менять только артикуляцию этих же частей: отдельные
позовые скульптуры и параллельный меш запрещены. Регистрация в населении миров
по-прежнему не разрешена.

Обзорные листы для решения владельца:

- `review/panther-p4-review.png`;
- `review/dragon-p4-review.png`.

## M1 skeleton/action review

Обе принятые формы посажены на именованные FK-иерархии. Все ключевые позы
снимаются из одного pose atlas на вид, поэтому внутри листа один model hash.

- `review/creature-rig-m1-skeletons.png` — скелеты без скрывающего body layer;
- `review/panther-rig-m1-actions.png` — 9 ключевых поз;
- `review/dragon-rig-m1-actions.png` — 12 ключевых поз;
- `evidence-card-02-creature-rigs.md` — skeleton/action passport и гейты;
- `discrepancy-log-rig-m1.md` — исправления после визуального цикла.

Это всё ещё изолированный Object Lab. Мир, AI, solver полёта/прыжка, IK и
runtime skin не подключены.

Полные 1600×1000 ракурсы и manifests лежат в `captures/p6/`. История причинных
исправлений: `discrepancy-log-p1-p6.md`.

## M2 locomotion and wing-morph contract

Следующее уточнение артикуляции зафиксировано до новых кадров:

- для пантеры — отдельные циклы шага, рыси и ротационного галопа, включая обе
  фазы suspension и причинные acceleration/braking transitions;
- для дракона — птерозавроподобное изменение формы в shoulder/elbow/wrist и у
  основания длинного пальца; наружные фаланги остаются почти жёстким
  лонжероном;
- взлёт разделён на preload, hind drive, manus vault, clearance, unfold и
  первый силовой мах; посадка — на flare, hind touchdown, unload и ground
  recovery.

Источник, точный pose passport и независимые гейты:
`evidence-card-03-locomotion-and-wing-morph.md`.

Кадры M2:

- `review/panther-rig-m2-walk.png`;
- `review/panther-rig-m2-trot.png`;
- `review/panther-rig-m2-rotary-gallop.png`;
- `review/panther-rig-m2-actions.png`;
- `review/dragon-rig-m2-takeoff.png`;
- `review/dragon-rig-m2-wing-control.png`;
- `review/dragon-rig-m2-landing.png`;
- `review/creature-rig-m2-skeletons.png`.

Результаты автономной визуальной коррекции:
`discrepancy-log-rig-m2.md`. Полные 1600×1000 кадры и manifests лежат в
`poses/m2/`. Интеграция в мир всё ещё не выполнялась.

## M3 panther village runtime

По решению владельца одна пантера зарегистрирована в деревне как переносимая
`medium-feline-territory` population. Мир задаёт только её территорию и точки
наблюдения; тело P4, скелет M2, аллюры и реакции остаются видовым адаптером.

Первый живой цикл включает наблюдение, шаг, рысь, короткий галоп, preload,
земной прыжок, поглощение посадки и торможение. Охота, атака, damage, ragdoll и
регистрация дракона не входят в M3.

- runtime contract и гейты: `evidence-card-04-panther-village-runtime.md`;
- исправления контактов: `discrepancy-log-runtime-m3.md`;
- world capture остаётся честно pending до прогона на машине, где разрешён
  `next dev`.
