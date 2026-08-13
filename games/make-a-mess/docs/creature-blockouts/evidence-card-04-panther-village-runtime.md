# Evidence card 04 — medium panther village runtime

Дата: 2026-08-13  
Статус: `runtime-m3 / village forward-test`  
Единицы: метры, секунды, радианы  
Координаты животного: `+Y` вверх, `+Z` вперёд, origin на поверхности

## Protected source

Runtime использует `mediumPantherCanonicalParts` ревизии P4 и
`MEDIUM_PANTHER_SKELETON` ревизии M2. Отдельного world-меша, упрощённого
скелета или action proxy нет. Адаптер объединяет канонические примитивы в один
draw call, присваивая каждой вершине кость через тот же
`mediumPantherBoneForPart`, которым построен pose atlas.

Дракон этим milestone не затронут.

## World / species boundary

| Owner | Owns | Does not own |
| --- | --- | --- |
| species adapter | тело P4, скелет M2, аллюры, слуховое внимание, локальный обход | дома, точки деревни, профессии людей |
| feline profile | `Panthera pardus`, melanistic appearance, skills | координаты деталей сцены |
| village profile | spawn, territory circuit, lookouts | суставы, скорости кадров, меш |
| creature world | время, live pieces, removed ids, acoustic events, dangerous presence | команда «беги сюда» или видовая реакция |

Текущий профиль имеет skills `observe`, `territory-roam`, `play-sprint` и
`ground-bound`. Симуляция действительно читает skills: профиль без
`play-sprint` не переходит в acceleration/gallop, без `ground-bound` не входит
в прыжок. Территория остаётся набором интересов; путь между ними выбирается по
живому полю препятствий и меняется после разрушения сцены.

## Runtime action loop

`observe → walk → trot → accelerate → gallop → bound preload → ballistic
flight → landing absorb → brake → observe`.

- скорость выводится из состояния и пройденного пути, а фаза walk/trot/gallop
  — из дистанции, поэтому лапы не перебирают на месте при падении FPS;
- поворот ограничен скоростью: на галопе траектория является дугой, а не
  мгновенной сменой yaw;
- веер прогнозирующих лучей выбирает свободный обход домов, телег, загонов и
  целых/обрушенных кусков;
- прыжок имеет отдельные preload, flight и landing; world root несёт дугу,
  pose несёт работу позвоночника и конечностей;
- громкий acoustic event или близкое опасное присутствие переводит внимание
  на источник и заставляет сначала тормозить, не включая охоту или атаку.

## Contact and rendering contract

- один объединённый `BufferGeometry`, один standard material, одна palette из
  30 матриц;
- основной свет, туман и тень общие с миром; depth pass читает ту же palette;
- moving parts не имеют независимых rigid bodies или colliders;
- физика повреждений, атака, охота, ragdoll и контакт с игроком пока явно
  исключены;
- quaternion interpolation дополняется единым root contact correction по
  каноническим paw boxes. Это сохраняет целое тело и устраняет провал лап между
  двумя по отдельности корректными ключевыми кадрами.

## Independent gates

| Invariant | Measurement |
| --- | --- |
| one geometry owner | каждая P4 part ровно один раз отображена на существующую M2 bone |
| exact scale | runtime bind bounds: floor `0`, crown `0.88 m`, nose `> 0.845 m`, tail `< -1.42 m` |
| one draw derivative | ожидаемое число вершин восстановлено из P4 boxes/beams/triangles |
| valid palette | каждая вершина имеет integer bone index внутри 30-bone skeleton |
| no terrain penetration | полный interpolated loop: нижняя точка geometry не ниже `-0.012 m` |
| live obstacle avoidance | 50 s / 1500 steps без входа в intact obstacle выше step height |
| non-linear territory motion | больше 100 turning samples, больше 70 m пути за forward-test |
| complete behaviour | все 9 runtime phases, speed `> 4.7 m/s`, bound apex `> 0.58 m` |
| skills cause behaviour | quiet profile остаётся ниже `2.4 m/s`, без gallop/bound |

## Rejection conditions

- world runtime копирует или заново описывает пантеру;
- pose меняет меш вместо matrix palette;
- движение проходит сквозь целую высокую деталь деревни;
- между keyframes лапа уходит под поверхность;
- прыжок является только сменой pose без world trajectory;
- пантера охотится или атакует без отдельного разрешённого milestone;
- дракон регистрируется вместе с пантерой по побочному условию.

## Forward-test status

Численные, геометрические и типовые гейты пройдены локально. Мир подключает
ровно одну пантеру. Финальный world-frame capture выполняется отдельно на
машине, где разрешён `next dev`; до него visual parity в деревне считается
`pending`, а не принятой по тестам.
