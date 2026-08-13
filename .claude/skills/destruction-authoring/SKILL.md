---
name: destruction-authoring
description: >-
  Плейбук разрушения make-a-mess — главной механики игры: двусторонний закон
  удара, каталог материалов, лестница урона «отметина → воксель → отлом»,
  взрывчатка как данные, carve по движущемуся телу, обломки и бюджеты, звук
  удара и визуал взрыва. Читать ПЕРЕД правкой destructionRuntime,
  destructionScene (BreakableMaterial), voxelFracture, carveKernel/carveWorker,
  meshCraterClip, customVoxelization, SurfaceDamageDecals, debrisBodyPool,
  explosionFxModel/ExplosionFxSystem, impactAudio/impactSoundPolicy, а также
  перед добавлением нового материала, оружия или разрушаемой детали. Триггеры:
  разрушение, breakable, carve, пробоина, кратер, осколки, обломки, debris,
  взрыв, blast, граната, ракета, заряд, взрывчатка, detonate, декаль,
  отметина, breakAt, carveAt, carveLooseTarget, chipAtImpact, shatterTarget,
  fractureEnergy, classifyLandingDamage, crumbleOnLanding, sheetMetal,
  voxelBody, volumeScale, superficialCarve, MASS_ADVANTAGE, explosiveProfile,
  carveBudget, MAX_LIVE_SHARDS, impactAudio, звук удара, дым, fireball,
  billowSmoke, quench стекла.
---

# Разрушение make-a-mess: плейбук

Нормативный подробный контракт —
`games/make-a-mess/docs/destruction-lessons.md`. **Читать его ПЕРЕД любой
правкой перечисленных файлов**; этот плейбук — только карта и рубильники.
Числа в документах сверяются с кодом; при расхождении прав код.

Смежные дома (читать по смежности задачи):

- **опирание и обрушение ДО удара** — `.claude/skills/world-building/SKILL.md`
  и `games/make-a-mess/docs/physical-architecture-guide.md`: разрушение
  снимает опору, но кто на ком стоит — решает структурный решатель;
- **форма, которая обязана пережить разрушение** —
  `games/make-a-mess/docs/architectural-authoring.md`, раздел «Точная форма
  обязана пережить разрушение»: intact и dynamic renderer поддерживают один
  носитель;
- **цена кадра, замеры и деградация** —
  `games/make-a-mess/docs/performance-lessons.md`;
- **машины и их удары** — `games/make-a-mess/docs/airborne-vehicle-dynamics.md`
  (сенсоры, компаунд, удар) и `games/make-a-mess/docs/vehicle-control-lessons.md`
  (кластер, актуаторы, автоматика);
- **реакция жителей на взрыв и шум** —
  `.claude/skills/village-inhabitants/SKILL.md`.

## 1. Одна карта представлений: материал везде один

`BreakableMaterial` (`destructionScene.ts`, 19 материалов) — ключ во ВСЕ
таблицы. Новый материал заводится сразу везде, иначе молча получит чужие
значения:

```text
материал → fractureEnergyByMaterial   (сколько энергии поглощает до отделения)
         → damageRadiusScale = ∛(1/E) (радиус из энергии: объём растёт кубом)
         → bulletHoleRadius           (или осознанное отсутствие: сталь)
         → voxelSizeByMaterial        (клетка решётки и энергетический пол)
         → crumbleOnLanding + landingDamageByMaterial (chip/shatter, м/с)
         → damageRoughnessByMaterial  (кромка выреза)
         → soundProfiles в impactAudio.ts (звук — вместе с прочностью!)
```

Всё в `destructionRuntime.ts`, кроме звука. Пороги посадки/удара — по
СКОРОСТИ, не по энергии: массы раздуты ×200, `½mv²` запрещено.

## 2. Двусторонний закон удара (одним абзацем)

Удар ≠ контакт: контакт — непрерывное «не проникай» (щупы, трение), удар —
одномоментная встреча двух КУСКОВ, каждый со своим материалом. Выводить удар
из штрафной пружины нельзя. Импульс обязателен ВСЕГДА (даже без разрушения);
разрушение условно и спрашивается у каждой стороны ОТДЕЛЬНО — вердикт обеим
выносит один `classifyLandingDamage` с преимуществом в массе
(`landingMassAdvantage`, потолок 3). Сталь и пластик контактный удар не
берёт никогда; sheetMetal — отдельный материал листа (вмятина с 10 км/ч,
панель с 30 км/ч); стекло лопается осколками в текущей позе. Штатная посадка
защищена самим законом, не исключением; переключатель «кому можно
врезаться» — доказательство, что закон неверен. Подробно —
destruction-lessons §1, детектор `tests/vehicle-contact-damage.test.mjs`.

## 3. Лестница урона

```text
отметина  isSuperficialCarve: r ≤ 0.3, один фрагмент, снято ≤ 12 %
          (авторской сетке — настоящая дыра в сетке, порог 34 %),
          рамка та же; декаль в системе НОСИТЕЛЯ (SurfaceDamageDecals)
воксель   форма изменилась → задетая деталь (и только она) переключается
          на латентную решётку (customVoxelization, volumeScale);
          видимая форма = авторские треугольники минус кратеры
          (meshCraterClip: круг, а не клетка; торец rimThickness)
отлом     buildShards: вырожденная «копия» (>82 % объёма) запрещена;
          труба → короткие трубы, бревно → чурбаки + щепа вдоль волокна
```

Ядро carve чистое (`carveKernel.ts`): синхронно для молотка, в воркере для
взрыва, результат бит-в-бит. Пять входов урона — `breakAt`, `carveAt`,
`carveLooseTarget`, `chipAtImpact`, `shatterTarget` (`MakeAMessGame.tsx`);
всё оружие ходит через них (заповедник глушит ровно эти пять).

## 4. Взрывчатка — данные, не ветки

`explosiveProfiles` (grenade / rocket / lance / charge): радиусы, энергия,
давление, шум, бюджеты, снаряд. Калибровка нового оружия — от игровой задачи
через ОТНОШЕНИЯ порогов материалов (заряд = ракета × 2.4/0.72, «бетон как
дерево»; игла — не задеть соседнее кольцо), не множителем на глаз. Радиус
растёт кубическим корнем от энергии/числа зарядов; массовый подрыв — цепью
по 50 мс. Затухание `E0·(1 − d/R)^1.15`. Подробно — destruction-lessons §5.

## 5. Carve по движущемуся телу

Точка удара → в систему кластера (`compoundClusterPointToLocal`); воксельная
сетка честна в любой позе; стоянка — частный случай T=origin. Окклюзия
двойная: члены в локали × мир по мировому лучу. Обрубок — тоже член судна
(clusterId, масса, контактная форма; дырка облегчает борт); отломанный
обломок рождается в ЖИВОЙ позе машины, не в авторской. Подробно —
destruction-lessons §6.

## 6. Бюджеты и рубильники (цена кадра, не физика)

- осколки: `MAX_LIVE_SHARDS = 180` / `MAX_LIVE_SHARD_BOXES = 900`,
  вытеснение по приоритету, не FIFO;
- воксели: `DEFAULT_MAX_VOXELS = 4500` на тело, грунту
  `GROUND_CARVE_MAX_VOXELS = 1200`;
- взрыв: `selectCarveTargetsWithinBudget` + per-explosive
  `carveBudget{maxTargets, workBudget, groundWorkBudget}` и `chipBudget` —
  грунт на своём срезе и не блокирует настоящие цели;
- тела дебриса — императивный пул (`debrisBodyPool.ts`), ≤3 коллайдеров
  свободному; settling-группы до разъединения форм; CCD только мелкому;
  сон заслуживается контактом;
- гибель куска: осталось <45 % материала (`VOLUME_BREAK_FRACTION`);
- звук: cooldown 180 мс, ≤4 звуков за 260 мс, покой и скольжение не звучат;
- FX: fireball ≤2, свет ≤2, фиксированные instanced-пулы; мерить p95
  frametime 1/2/4 взрывов; НИКОГДА не React-объект и не свет на выстрел.

Бюджет считать ДО показа (память `render-cost-budget-first`).

## 7. Визуал разрушения — критерии отбраковки

16 законов в destruction-lessons §9; главные: fireball — raymarch-объём, не
частицы; визуал берёт направление/вес/задержку каждой физической лопасти;
светящееся непрозрачно, прозрачен только дым; температура не раскрашивается
шумом; дым — икосферы в одном instanced draw, не билборды; земля режет
полусферу и рождает surge-кольцо; пламя умирает горячим, дым не светится.

## 8. Анти-цели — не изобретать наспех

Огня и горения нет (только искры; «future burning»); жидкости×разрушение не
спроектированы (вода не опора); repair/persistence нет; жители не
перепланируют маршрут вокруг завала. Что НЕ делать в обход — destruction-lessons §10.

## 9. Чеклист правки

- [ ] Прочитан `destruction-lessons.md` целиком; по смежности —
      performance-lessons, world-building, architectural-authoring
- [ ] Новый материал заполнил ВСЕ представления §1, включая звук
- [ ] Новое оружие — полный `ExplosiveProfile`, калибровка от отношений
      порогов материалов, свои carveBudget/chipBudget и FX-класс
- [ ] Новая деталь: честный `volume`, форма переживает разрушение, на
      машине — clusterId и рождение обломков в живой позе
- [ ] Пороги — по скорости; `½mv²` нигде не появилось
- [ ] Ни одного переключателя «кому можно врезаться» и второй шкалы прочности
- [ ] `npx tsc --noEmit` чист; целевые тесты: destruction-runtime,
      voxel-fracture, custom-voxelization, superficial-damage,
      mesh-crater-clip, blast-carve-budget, explosive-profiles, explosion-fx,
      debris-*, impact-sound, vehicle-contact-damage, structural-physics,
      runtime-structure, structure, indestructible-world (карта «тест →
      закон» — destruction-lessons §11.1)
- [ ] Обрушения сверены с базой ДО правки (`scripts/check-structure.mjs`)
